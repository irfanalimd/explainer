// The runtime: mounts a figure into a root element and runs the one loop that ties the parts together.
//   playhead → scene.sample → gfx.skin → director.update → renderer.render → hud.update / hud.placeTags
// It also owns recompiling on scenario and parameter changes, picking, the predict pauses,
// and window.__internals, the contract the capture and audit scripts drive (CONTRACTS.md 7.3).
// Frames are drawn on demand: while playing, and otherwise only when something changed the picture (an input, a
// camera still easing, a fading afterglow); a paused, settled figure draws nothing. Two clocks drive the look: the
// shimmer clock (film grain, LED blinks, flowing dashes) runs only while playing, so a still frame stays still; the
// render clock (afterglows and pings fading out) runs on every frame drawn.
import { compile, envOf } from "./scene/index.mjs";
import { createRenderer } from "./gfx/renderer.mjs";
import { skin } from "./gfx/skin.mjs";
import { motionFx } from "./gfx/motion.mjs";
import { createHud } from "./hud/hud.mjs";
import { compiledPace } from "./hud/level.mjs";
import { applyTheme } from "./hud/theme.mjs";
import { createDirector } from "./director/director.mjs";
import { createScene } from "./a11y/scene.mjs";
import { attachEmbed } from "./embed/embed.mjs";
import { parseMoment, resolveMoment, resolveStep, momentRest } from "./embed/deeplink.mjs";
import { formatHash, paramOverrides } from "./hud/link.mjs";
import { foldPlan, rateAt, captionHead, forkOf, foldedDuration } from "./playback.mjs";
import { rng } from "../sim/rng.mjs";
import { DrawList } from "./contracts.mjs";
import { SIZE, TYPE } from "./tokens.mjs";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const SCALE_LIGHT = 0.3;    // share of a scale shot's reveal box the studio light pool covers
const shrinkBox = (b, k) => {
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2, hx = (b.maxX - b.minX) * k / 2, hy = (b.maxY - b.minY) * k / 2;
  return { minX: cx - hx, maxX: cx + hx, minY: cy - hy, maxY: cy + hy };
};
const boundsUnion = (a, b) => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) });
const nextFrame = () => new Promise((ok) => requestAnimationFrame(() => ok()));

export function defaultsOf(figure) {
  return Object.fromEntries(Object.entries(figure.params ?? {}).map(([k, d]) => [k, d.value]));
}

export function scenarioOf(figure, id) {
  const list = figure.scenarios ?? [];
  return list.find((s) => s.id === id) ?? list[0] ?? { id: "default", label: "Default" };
}

export async function mount(root, figure, options = {}) {
  const canvas = root.querySelector("canvas.ix-canvas") ?? root.insertBefore(Object.assign(document.createElement("canvas"), { className: "ix-canvas" }), root.firstChild);
  const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  const meta = figure.meta ?? {};

  let theme = options.theme ?? root.dataset.theme ?? meta.theme ?? "light";
  let scenario = scenarioOf(figure, options.scenario);
  let values = { ...defaultsOf(figure), ...(scenario.params ?? {}) };
  let tl = null;
  let time = 0, playing = false, speed = 1, stopAt = null, stopHold = null;   // stopHold: the hold a stepped stop lands in
  let frame = null, hoverAt = null, hoverId = null, refHover = null, selectedId = null, pendingAsk = -1, answered = new Set();
  // the step's look chip lights these entities; the reader's level sets the reading pace and the holds (level.mjs)
  let looking = null, pace = 1, dwell = 0;
  // your turn (s.choose, engine/hud/turn.mjs): the candidates lit for a pick, and the main run while a branch plays
  let candidates = null, mainTl = null;
  let frozen = false, visible = true, raf = 0, last = 0, capture = false, lastRenderAt = null, snapping = false, covered = false;
  // render on demand: something changed the picture (dirty), or the last frame was still moving (settling: its camera
  // or the HUD's insets moved; drafting: the frame being drawn is one in motion); the two clocks
  let dirty = true, moving = false, settling = false, drafting = false, shimmer = 0, clock = 0, resumeTimer = 0, renders = 0;
  // the start card is open; step mode (each Next plays one step); a guided pause at a chapter's end or the run's end
  let intro = false, stepMode = false, held = null, guided = true;
  let viewport = { width: 1, height: 1, dpr: 1 };
  let env = null;
  let pxPerUnit = 1;
  const draw = new DrawList();
  const reduced = () => motionQuery.matches;

  root.dataset.theme = theme;
  applyTheme(root, theme);

  const director = createDirector({ reducedMotion: reduced() });

  let renderer = null;
  try {
    renderer = createRenderer(canvas, { theme, quality: options.quality ?? "high" });
  } catch (err) {
    console.error(err);
  }

  const hud = createHud(root, {
    meta, params: figure.params ?? {}, values, scenarios: figure.scenarios ?? [], scenario: scenario.id,
    counters: figure.counters ?? {}, code: figure.code ?? null, theme,
  }, redrawing({
    onPlay: () => play(),
    onPause: () => pause(),
    onToggle: () => (playing ? pause() : play()),
    onStart: (mode, where) => {
      intro = false;
      // "begin": a link opened mid-run, and the reader would rather start this story from the top
      if (mode === "begin") { seek(0); answered.clear(); }
      if (mode === "play" || mode === "begin") { play(); dwell = time < 0.05 ? entryDwell(0) : 0; }
      else if (mode === "step") { stepMode = true; step(1); }
      else if (mode === "resume" && where) resume(where);
      else if (mode === "restart") { const first = (figure.scenarios ?? [])[0]; if (first && first !== scenario) setScenario(first.id, { restart: true }); else { seek(0); answered.clear(); play(); } }
      kick();
    },
    onIntro: (open) => { intro = !!open; if (open) pause(); kick(); },
    onContinue: () => (stepMode ? step(1) : play()),   // stepping (a clicker), a pause goes on one step
    onGuided: (on) => { guided = !!on; },
    onFolding: (on) => { folding = !!on; kick(); },
    onRefSelect: (id, at) => { if (!id) return; selectedId = id; inspect(id, [at?.x, at?.y], true); kick(); },
    onSeek: (t, info = {}) => { seek(t); if (info.scrubbing) pause(); },
    onStep: (delta) => step(delta),
    onPhase: (delta) => phase(delta),
    onSpeed: (x) => { speed = x; },
    onScenario: (id) => setScenario(id, { restart: true, fork: true }),
    onParams: (next) => setParams(next),
    onTheme: (t) => setTheme(t),
    onFit: () => { holdCamera(); if (frame) director.fit(frame.world, { instant: reduced() }); },
    onFullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.()),
    onRestart: () => { seek(0); answered.clear(); play(); },
    onHover: (x, y) => { hoverAt = x == null ? null : [x, y]; schedule(); },   // redraws only if what is under it changes
    onSelect: (x, y) => { const id = pickAt(x, y); if (hud.pick?.(id)) return; selectedId = id; inspect(selectedId, [x, y], true); kick(); },
    onRefHover: (id) => { refHover = id; kick(); },
    onLook: (ids) => { looking = ids?.length ? new Set(ids) : null; kick(); },
    onCandidates: (ids) => { candidates = ids?.length ? new Set(ids) : null; },
    onPickArea: (ids) => keepPick(ids),
    onBranch: (o) => { if (o?.choices) embed?.answered(o.step, Object.values(o.choices)[0]); branch(o); },
    onLevel: () => { pace = paceOf(); kick(); },
    onGesture: (g) => {
      holdCamera();
      if (g.type === "focus") {
        const id = pickAt(g.x, g.y);
        const pose = id && frame?.poses.find((p) => p.id === id);
        if (pose) director.fit(boundsOfPose(pose), { instant: reduced() });
      } else director.gesture(g);
      kick();
    },
    onAnswer: (choice) => {
      const k = pendingAsk;
      if (k >= 0) { answered.add(k); embed?.answered(k, choice); }
      pendingAsk = -1;
      // in step mode the answer plays just the step that reveals it
      if (stepMode && k >= 0 && tl) { held = null; stopAt = tl.steps[k].t1; stopHold = null; playing = true; kick(); }
      else play();
    },
    onUnpin: () => { selectedId = null; kick(); },
    onSnapshot: () => snapshot(),
    onHandoutData: (o) => handoutData(o),
    onHandoutPictures: (data, onEach) => drawPicturesSlowly(data?.stories ?? [], onEach),
    // the handout covers the world: no frames until it closes (its pictures are drawn on their own)
    onCover: (on) => { covered = !!on; if (!covered) restoreFrame(); },
  }));

  guided = hud.guided ?? true;
  // the described scene and the keyboard path into the world: its focused thing lights like a hovered one, and
  // Enter pins the inspector on it (engine/a11y/scene.mjs). Embedding and deep links attach once the run exists.
  let keyFocus = null, embed = null;
  const access = createScene(root, {
    project: (p) => renderer?.project(p),
    onFocus: (id) => { keyFocus = id; kick(); },
    onOpen: (id, at) => { if (hud.pick?.(id)) return; selectedId = id; inspect(id, [at.x, at.y], true); kick(); },   // in your turn, Enter picks
  });
  // New reads slower (1.2×). An intro figure's timeline already reads at that pace, so the rate is relative to it.
  const paceOf = () => compiledPace(meta) / (hud.policy?.pace ?? compiledPace(meta));
  pace = paceOf();
  const DWELL = 1.5;   // s: New lingers on a chapter's entry card before the chapter moves
  // "Speed through repeats" (a viewer preference) and the shared setup skipped on a scenario switch
  let folding = hud.folding ?? true, folds = null, skipped = null, baseTl = null;

  // deep link: the moment a link opens (engine/embed/deeplink.mjs): story, knobs and level now, before the first
  // compile, so the run is built once with them; the step once the run exists. What the page can't do is noted.
  const moment = options.hash === false ? resolveMoment(null) : resolveMoment(parseMoment(location.hash), { scenarios: figure.scenarios ?? [], params: figure.params ?? {} });
  if (moment.scenario && moment.scenario !== scenario.id) {
    scenario = scenarioOf(figure, moment.scenario);
    values = { ...defaultsOf(figure), ...(scenario.params ?? {}) };
  }
  values = { ...values, ...moment.params };
  hud.setScenario?.(scenario.id);
  hud.setValues?.(values);
  if (moment.level) hud.setLevel?.(moment.level);

  // every HUD callback can change the picture, so each one asks for a frame (hovering asks only for a pick)
  function redrawing(cbs) {
    return Object.fromEntries(Object.entries(cbs).map(([k, fn]) => [k, k === "onHover" ? fn : (...a) => { const r = fn(...a); kick(); return r; }]));
  }

  function recompile({ keepPhase }) {
    const prevPhase = keepPhase && tl ? phaseAt(time) : null;
    try {
      env = envOf(viewport.width, viewport.height);
      tl = compile(figure, { params: values, scenario: scenario.id, rng, env });
    } catch (err) {
      console.error(err);
      hud.notice?.(`The simulation failed: ${err.message}`);
      return false;
    }
    for (const p of tl.problems ?? []) console.warn(`[explainer] ${p.kind ?? "problem"}: ${p.message ?? p}`);
    hud.setTimeline(tl);
    folds = foldPlan(tl.steps);
    skipped = null;
    answered.clear();
    pendingAsk = -1;
    held = null;
    mainTl = null;
    hud.ask?.(null);
    if (prevPhase) {
      const same = tl.phases.find((p) => p.name === prevPhase.name);
      time = same ? same.t0 : clamp(time, 0, tl.duration);
    } else time = 0;
    director.setTimeline?.(tl);
    frame = null;
    director.fit?.(tl.sample(time, view()).world, { instant: true, hold: false });
    kick();
    return true;
  }

  // a pick other than the answer plays its own branch of the same run (compiled with that choice) from the pick's step;
  // choices null comes back to the main run, paused at the pick again. The runs are the same up to that step.
  function branch({ step: k, choices }) {
    const main = mainTl ?? tl;
    let next = main;
    if (choices) {
      try { next = compile(figure, { params: values, scenario: scenario.id, rng, env, choices }); } catch (err) { console.error(err); return; }
    }
    mainTl = choices ? main : null;
    tl = next;
    hud.setTimeline(tl);
    folds = foldPlan(tl.steps);
    director.setTimeline?.(tl);
    frame = null; held = null; stopAt = null; stopHold = null; stepMode = false;
    const st = tl.steps[k];
    if (choices) { answered.add(k); pendingAsk = -1; time = st.t0; playing = true; }
    else { answered.delete(k); pendingAsk = k; time = Math.max(0, st.t0 - 1e-3); playing = false; hud.ask(st.choose); }
    kick();
  }

  const view = () => ({ pxPerUnit, hover: refHover ?? keyFocus ?? hoverId, selected: selectedId, reducedMotion: reduced() });

  function stepIndexAt(t) {
    const steps = tl.steps;
    let lo = 0, hi = steps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (steps[mid].t0 <= t + 1e-9) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function phaseAt(t) {
    let current = tl.phases[0] ?? null;
    for (const p of tl.phases) if (p.t0 <= t + 1e-9) current = p;
    return current;
  }

  function seek(t) { time = clamp(t, 0, tl?.duration ?? 0); stopAt = null; stopHold = null; held = null; kick(); }
  function play() {
    if (!tl) return;
    if (time >= tl.duration - 1e-6) { time = 0; answered.clear(); }
    stepMode = false; held = null;
    playing = true; kick();
  }
  function pause() { playing = false; stopAt = null; stopHold = null; kick(); }
  function step(delta) {
    if (!tl) return;
    const atPause = held?.kind === "chapter";   // on a chapter's pause, its last step counts as played
    held = null;
    const i = stepIndexAt(time);
    const s = tl.steps[i];
    if (delta > 0) {
      const end = s.t1 - (atPause ? 2e-3 : 1e-6);
      const target = time < end && time > s.t0 + 1e-6 ? s : tl.steps[Math.min(i + (time >= end ? 1 : 0), tl.steps.length - 1)];
      if (time >= target.t1 - 1e-6) return;
      // guided, a step that ends a chapter stops on the chapter's pause, as playing does, so a clicker gets the recap
      const k = guided ? tl.phases.findIndex((p, j) => j > 0 && Math.abs(p.t0 - target.t1) < 1e-6) : -1;
      stopAt = k > 0 ? target.t1 - 1e-3 : target.t1;
      stopHold = k > 0 ? { kind: "chapter", phase: k - 1 } : null;
      playing = true;
    } else {
      const u = (time - s.t0) / Math.max(1e-6, s.dur);
      seek(u > 0.15 ? s.t0 : tl.steps[Math.max(0, i - 1)].t0);
      playing = false;
    }
    kick();
  }
  function phase(delta) {
    if (!tl?.phases.length) return;
    const p = phaseAt(time);
    const i = tl.phases.indexOf(p);
    const next = tl.phases[clamp(i + (delta > 0 ? 1 : (time - p.t0 > 0.5 ? 0 : -1)), 0, tl.phases.length - 1)];
    seek(next.t0);
  }
  function setScenario(id, { restart, fork } = {}) {
    scenario = scenarioOf(figure, id);
    values = { ...defaultsOf(figure), ...(scenario.params ?? {}) };
    hud.setScenario?.(scenario.id);
    hud.setValues?.(values);
    if (recompile({ keepPhase: !restart }) && restart && !intro) {
      if (fork) startAtFork();
      play();
    }
  }
  // a returning reader picks up where they stopped (the start card's offer; engine/hud/journey.mjs): that story with its
  // knobs, from the start of the step they were on, or the next story from where it parts from the first
  function resume({ scenario: id, time: t, params, fork }) {
    const sc = scenarioOf(figure, id);
    const next = { ...defaultsOf(figure), ...(sc.params ?? {}), ...(params ?? {}) };
    if (sc !== scenario || JSON.stringify(next) !== JSON.stringify(values)) {
      scenario = sc; values = next;
      hud.setScenario?.(sc.id); hud.setValues?.(values);
      if (!recompile({ keepPhase: false })) return;
    }
    if (fork) startAtFork();
    else if (Number.isFinite(t)) {
      // a step that asks is picked up just before it, so the question opens again rather than its answer playing
      const st = tl.steps[stepIndexAt(clamp(t, 0, tl.duration))];
      time = st.ask || st.choose ? Math.max(0, st.t0 - 2e-3) : st.t0;
    }
    play();
  }
  function setParams(next) {
    values = { ...values, ...next };
    recompile({ keepPhase: true });
  }
  function setTheme(t) {
    theme = t;
    root.dataset.theme = t;
    applyTheme(root, t);
    renderer?.setTheme(t);
    hud.setTheme?.(t);
    kick();
  }

  // ---- fold repetition (S1): time warp over steps that repeat a clear pattern; the timeline itself is unchanged ----
  // only in normal playback at 1x and up: never while stepping, scrubbing, paused, or capturing (shoot/record)
  function foldActive(stepping) {
    return folding && playing && !stepping && !stepMode && !capture && !frozen && speed >= 1 && !!folds?.regions.length;
  }
  function foldRate(t, stepping) { return foldActive(stepping) ? rateAt(folds, t) : 1; }
  // the folded step's caption shrinks to its leading clause so it can be read at speed; the counter goes to the HUD
  function foldInfo(step) {
    const f = folds?.steps[step];
    if (!f?.folded || !foldActive(stopAt != null)) return null;
    return { index: f.index, count: f.count, caption: captionHead(tl.steps[step].caption) };
  }

  // ---- scenarios start at the fork (S2): skip the setup this scenario shares with the first one ----
  function baseTimeline() {
    const first = (figure.scenarios ?? [])[0];
    if (!first) return null;
    const key = `${env?.width}x${env?.height}`;
    if (baseTl?.key === key) return baseTl.tl;
    try {
      baseTl = { key, tl: compile(figure, { params: { ...defaultsOf(figure), ...(first.params ?? {}) }, scenario: first.id, rng, env }) };
    } catch { baseTl = { key, tl: null }; }
    return baseTl.tl;
  }
  function startAtFork() {
    const list = figure.scenarios ?? [];
    if (!tl || capture || frozen || list.indexOf(scenario) <= 0) return;
    const f = forkOf(scenario.start ? null : baseTimeline(), tl, { start: scenario.start });
    if (!f) return;
    time = f.t;
    skipped = { t: f.t, step: f.step, steps: f.skipped };
    kick();
  }

  function pickAt(x, y) {
    if (!renderer || x == null) return null;
    try { return renderer.pick(x, y); } catch { return null; }
  }
  function inspect(id, at, pinned) {
    if (!id || !frame) { hud.inspect(null, {}); return; }
    const info = frame.entities?.get?.(id);
    hud.inspect(info ? { id, ...info } : { id, kind: "entity", title: id, state: {} }, { x: at?.[0], y: at?.[1], pinned });
  }
  // an open pick keeps its candidates in the free area (on a phone, above the pick card): the director's keep(). Its
  // source (what the prompt names and the step looks at: map 1, the slip in it) joins them where it fits readably,
  // else the step's look alone
  function keepPick(ids) {
    const box = boundsOfIds(ids);
    const st = box && tl.steps.find((s, k) => s.choose && Math.abs(k - frame.step) <= 1 && s.choose.options?.some((o) => ids.includes(o.pick)));
    const refs = [...String(st?.choose.prompt ?? "").matchAll(/\{ref:([^|}]+)/g)].map((m) => m[1]);
    const looks = st?.layers?.look ?? [];
    const source = (list) => boundsOfIds(list.filter((id) => !ids.includes(id)));
    director.keep(box, { also: [source([...refs, ...looks]), source(looks)] });
  }
  function boundsOfIds(ids) {
    const boxes = ids?.length && frame ? frame.poses.filter((p) => ids.includes(p.id)).map(boundsOfPose) : [];
    return boxes.length ? boxes.reduce((a, b) => ({ minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
      minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) })) : null;
  }
  function boundsOfPose(p) {
    const w = (p.w ?? 40) / 2, d = (p.d ?? 40) / 2;
    return { minX: p.x - w, maxX: p.x + w, minY: p.y - d, maxY: p.y + d, minZ: 0, maxZ: (p.z ?? 0) + (p.h ?? 10) };
  }

  // a still of the frame on screen, for the reader's "Save image" (engine/hud/still.mjs): drawn again in capture
  // quality at 2x and copied out in the same task, before the browser presents (and may clear) the drawing buffer.
  // The world is cropped to the free area the HUD leaves; the HUD then lays the step's words under it.
  function snapshot() {
    if (!tl || !frame || !renderer || renderer.lost) return null;
    const dpr = viewport.dpr, hi = Math.max(dpr, 2);
    const ins = hud.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    let out = null;
    if (hi !== dpr) renderer.resize(viewport.width, viewport.height, hi);
    snapping = true;
    try {
      renderFrame(0, shimmer, clock, false);
      // the renderer may have swapped the canvas for a fresh one (a WebGPU start that fell back to WebGL2)
      const src = root.querySelector("canvas.ix-canvas") ?? canvas;
      const k = src.width / viewport.width;
      const x = Math.round(ins.left * k), y = Math.round(ins.top * k);
      const w = Math.max(1, src.width - x - Math.round(ins.right * k)), h = Math.max(1, src.height - y - Math.round(ins.bottom * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h);
      out = { canvas: c, scale: k, crop: { left: ins.left, top: ins.top, width: w / k, height: h / k }, step: frame.step };
    } catch (err) {
      console.error(err);
    } finally {
      snapping = false;
      if (hi !== dpr) renderer.resize(viewport.width, viewport.height, dpr);
      kick();
    }
    return out;
  }

  // the handout (engine/hud/handout.mjs): every story compiled at the figure's own settings, with its play time at 1x
  // (repeats sped through, as the page plays them), the end check, and, when asked, pictures drawn from those runs:
  // the end of each chapter of the first story, and each other story's first new key step. The pictures are drawn
  // in the light theme (paper), framed as the page frames them, and the page is put back exactly as it was.
  function handoutData({ images = true } = {}) {
    const list = figure.scenarios?.length ? figure.scenarios : [scenario];
    const stories = [];
    let base = null;
    for (const [i, sc] of list.entries()) {
      let t = null;
      try { t = compile(figure, { params: { ...defaultsOf(figure), ...(sc.params ?? {}) }, scenario: sc.id, rng, env }); } catch (err) { console.error(err); continue; }
      if (i === 0) base = t;
      const fork = i > 0 && base ? forkOf(sc.start ? null : base, t, { start: sc.start }) : null;
      const plan = foldPlan(t.steps);
      stories.push({
        id: sc.id, label: sc.label ?? sc.id, whatIf: sc.whatIf ?? null, description: sc.description ?? null,
        takeaway: sc.takeaway ?? meta.takeaway ?? null, recap: sc.recap ?? meta.recap ?? null, tl: t, fork,
        seconds: foldedDuration(plan, t.duration, fork?.t ?? 0),
        chapterSeconds: t.phases.map((p) => foldedDuration(plan, p.t1, p.t0)),
        pictures: [],
      });
    }
    if (images) drawPictures(stories);
    // each story ends with its own end check (a later story may bring back an earlier question at new numbers)
    const checks = stories.flatMap((s) => (s.tl.checks ?? []).map((c) => ({ ...c, story: s.id })));
    return { meta, lesson: base?.lesson ?? tl?.lesson ?? null, checks, stories };
  }
  // which pictures: the end of each chapter of the first story, and each other story's first new key step
  function pictureJobs(stories) {
    const first = stories[0];
    const jobs = [];
    if (first) first.tl.phases.forEach((p, k) => jobs.push({ story: first, chapter: k, step: Math.max(p.step, stepOf(first.tl, p.t1 - 2e-3)), at: p.t1 - 2e-3 }));
    const seen = new Set((first?.tl.steps ?? []).map((st) => st.caption));
    for (const sto of stories.slice(1)) {
      const from = sto.fork?.step ?? 0;
      const k = sto.tl.steps.findIndex((st, i) => i >= from && st.layers?.key && !seen.has(st.caption));
      if (k >= 0) jobs.push({ story: sto, chapter: sto.tl.phases.findIndex((p, j) => p.step <= k && (sto.tl.phases[j + 1]?.step ?? Infinity) > k), step: k, at: sto.tl.steps[k].t1 - 2e-3 });
    }
    return jobs;
  }
  // one picture, in one task: the page's state set aside, the job's run drawn in capture quality and read back before
  // the browser presents, then the page's state put back (its own frame is drawn again by the caller)
  function drawJob(job) {
    const keep = { tl, time, frame, theme, looking, candidates, hoverId, selectedId, refHover, keyFocus };
    looking = candidates = hoverId = selectedId = refHover = keyFocus = null;
    if (theme !== "light") { theme = "light"; renderer.setTheme("light"); }
    snapping = true;
    try {
      tl = job.story.tl;
      director.setTimeline?.(tl);
      frame = null;
      time = job.at;
      const { tags } = renderFrame(10, time, time, true, true);
      const src = root.querySelector("canvas.ix-canvas") ?? canvas;
      const k = src.width / viewport.width, ins = hud.insets ?? {};
      const x = Math.round((ins.left ?? 0) * k), y = Math.round((ins.top ?? 0) * k);
      const w = Math.max(1, src.width - x - Math.round((ins.right ?? 0) * k)), h = Math.max(1, src.height - y - Math.round((ins.bottom ?? 0) * k));
      const shown = tags.filter((t) => t.text).map((t) => ({ text: t.text, tone: t.tone, x: t.x - (ins.left ?? 0), y: t.y - (ins.top ?? 0) }));
      // the free area read back from the GPU once: the trim looks at it small and the picture is cut from it
      const area = document.createElement("canvas");
      area.width = w; area.height = h;
      area.getContext("2d").drawImage(src, x, y, w, h, 0, 0, w, h);
      // the page frames the world for a wide screen; a picture in a column of print wants the world, not the stage
      // around it: trimmed to what was drawn and the tags over it (in CSS px), with a little air
      const box = trimBox(area, 0, 0, w, h, k, shown);
      const c = document.createElement("canvas");
      c.width = Math.round(box.w * k); c.height = Math.round(box.h * k);
      c.getContext("2d").drawImage(area, Math.round(box.x * k), Math.round(box.y * k), c.width, c.height, 0, 0, c.width, c.height);
      job.story.pictures.push({ chapter: job.chapter, step: job.step, url: c.toDataURL("image/jpeg", 0.9), width: c.width / k, height: c.height / k,
        tags: shown.map((t) => ({ ...t, x: t.x - box.x, y: t.y - box.y })) });
    } catch (err) {
      console.error(err);
    } finally {
      snapping = false;
      ({ tl, time, looking, candidates, hoverId, selectedId, refHover, keyFocus } = keep);
      if (theme !== keep.theme) { theme = keep.theme; renderer.setTheme(theme); }
      director.setTimeline?.(tl);
      frame = keep.frame;
    }
  }
  // the part of a drawn frame that holds the world: pixels that stand out from their row's stage colour (read at an
  // eighth of the size), joined with each tag's rough extent; -> { x, y, w, h } in CSS px within the crop
  function trimBox(src, x, y, w, h, k, tags) {
    const all = { x: 0, y: 0, w: w / k, h: h / k };
    try {
      const sw = Math.max(8, Math.round(w / 8)), sh = Math.max(8, Math.round(h / 8));
      const c = document.createElement("canvas");
      c.width = sw; c.height = sh;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(src, x, y, w, h, 0, 0, sw, sh);
      const d = g.getImageData(0, 0, sw, sh).data;
      let x0 = sw, y0 = sh, x1 = -1, y1 = -1;
      for (let j = 0; j < sh; j++) {
        const L = j * sw * 4, R = L + (sw - 1) * 4;
        const bg = [0, 1, 2].map((q) => (d[L + q] + d[R + q]) / 2);
        for (let i = 0; i < sw; i++) {
          const o = L + i * 4;
          if (Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]) > 24) {
            if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
          }
        }
      }
      if (x1 < 0) return all;
      const f = w / k / sw;
      let bx0 = x0 * f, by0 = y0 * f, bx1 = (x1 + 1) * f, by1 = (y1 + 1) * f;
      for (const t of tags) {
        const half = (String(t.text).length * 6 + 12) / 2;
        bx0 = Math.min(bx0, t.x - half); bx1 = Math.max(bx1, t.x + half); by0 = Math.min(by0, t.y - 22); by1 = Math.max(by1, t.y);
      }
      const pad = Math.max(16, 0.04 * Math.max(bx1 - bx0, by1 - by0));
      bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad); bx1 = Math.min(all.w, bx1 + pad); by1 = Math.min(all.h, by1 + pad);
      // not slimmer than 4:3 nor wider than 2:1, so a column of pictures keeps one rhythm
      let bw = bx1 - bx0, bh = by1 - by0;
      if (bw / bh < 4 / 3) { const nw = Math.min(all.w, bh * 4 / 3); bx0 = Math.max(0, Math.min(all.w - nw, bx0 - (nw - bw) / 2)); bw = nw; }
      if (bw / bh > 2) { const nh = Math.min(all.h, bw / 2); by0 = Math.max(0, Math.min(all.h - nh, by0 - (nh - bh) / 2)); bh = nh; }
      return bw < 40 || bh < 40 ? all : { x: bx0, y: by0, w: bw, h: bh };
    } catch {
      return all;
    }
  }
  // the page's own frame again, the camera settled back on it
  function restoreFrame() { if (tl) renderFrame(10, shimmer, clock, true); kick(); }
  // all at once (the print dialog waits for this), or one picture per task so the page stays responsive and the
  // handout can say how far it has got (a software-rendered browser can take seconds a picture)
  function drawPictures(stories) {
    if (!tl || !renderer || renderer.lost) return;
    for (const job of pictureJobs(stories)) drawJob(job);
    restoreFrame();
  }
  async function drawPicturesSlowly(stories, onEach) {
    if (!tl || !renderer || renderer.lost) return false;
    const jobs = pictureJobs(stories);
    for (const [i, job] of jobs.entries()) {
      onEach?.(i, jobs.length);
      await new Promise((ok) => setTimeout(ok, 0));
      if (!tl || renderer.lost) return false;
      drawJob(job);
    }
    // the handout still covers the world: its closing draws the page's frame again (onCover)
    if (!covered) restoreFrame();
    return true;
  }
  const stepOf = (t, at) => { let i = 0; while (i + 1 < t.steps.length && t.steps[i + 1].t0 <= at + 1e-9) i++; return i; };

  const holds = () => hud.policy ?? {};
  const entryDwell = (k) => (holds().entry === "full" && tl?.phases[k]?.enter ? DWELL : 0);

  // one frame at playhead `time`; shimmerT and clockT are the two clocks (both the playhead in capture)
  // quiet: a picture for the handout, drawn from another run; the HUD, the described scene and the embed never hear of it
  function renderFrame(dt, shimmerT, clockT, settle, quiet = false) {
    frame = tl.sample(time, view(), frame);
    if (looking) for (const p of frame.poses) if (looking.has(p.id)) { p.hover = true; p.lit = Math.max(p.lit ?? 0, 1); }
    if (candidates) for (const p of frame.poses) if (candidates.has(p.id)) p.lit = Math.max(p.lit ?? 0, 1);
    draw.clear();
    // the studio light and the shadows cover the world; during a scale shot they widen with the reveal, a step behind
    // it, so the field's far edge stays in the studio's falloff
    if (frame.world) draw.bounds = frame.scale ? boundsUnion(frame.world, shrinkBox(frame.scale.box, SCALE_LIGHT)) : frame.world;
    skin(frame.poses, draw, { theme, time: shimmerT, pxPerUnit });
    motionFx(tl, frame, draw, { theme, reducedMotion: reduced() });
    viewport.insets = hud.insets;
    viewport.presenting = !!hud.presenting;   // a projector frames closer (the director's clearPanel)
    director.keep(keyFocus ? boundsOfIds([keyFocus]) : null, { as: "focus" });   // the keyboard's thing stays in view
    const camera = settle ? director.update(frame, viewport, dt, { settle: true }) : director.update(frame, viewport, dt);
    if (renderer && !renderer.lost) {
      renderer.render(draw, camera, { time: shimmerT, clock: clockT, reducedMotion: reduced(), capture: frozen || capture || snapping, draft: drafting });
      renders++;
      pxPerUnit = renderer.pxPerUnit(camera.target) || pxPerUnit;
      const tags = [];
      for (const tag of frame.tags ?? []) {
        const [x, y, , on] = renderer.project(tag.at);
        if (on) tags.push({ id: tag.id, text: tag.text, tone: tag.tone, x, y, opacity: tag.opacity ?? 1 });
      }
      if (quiet) return { camera, tags };
      hud.placeTags(tags);
    }
    if (quiet) return { camera, tags: [] };
    if (skipped && time < skipped.t - 0.01) skipped = null;   // rewound into the skipped setup: it is no longer skipped
    const fold = frozen || capture ? null : foldInfo(frame.step);
    if (fold) frame.caption = fold.caption;
    hud.update(frame, { time, playing, speed, duration: tl.duration, held: frozen || capture ? null : held, stepMode,
      fold, skipped: frozen || capture ? null : skipped });
    access.update(frame, { tl, time, playing, speed, scrubbing: hud.scrubbing });
    embed?.update(frame, { time, duration: tl.duration, held });
    return camera;
  }

  function tick(now) {
    raf = 0;
    if (frozen || !tl) return;
    const dt = last ? clamp((now - last) / 1000, 0, 1 / 20) : 1 / 60;
    last = now;
    const live = playing;     // a run that stops in this tick still draws the frame it stops on
    if (playing && dwell > 0 && !capture) dwell = Math.max(0, dwell - dt);
    else if (playing) {
      const before = time;
      const stepping = stopAt != null;
      time = Math.min(tl.duration, time + dt * speed * pace * foldRate(before, stepping));
      if (stopAt != null && time >= stopAt) { time = stopAt; stopAt = null; playing = false; held = stopHold; stopHold = null; }
      // guided chapters: pause on the last frame of a chapter with a recap (never while stepping; scrubbing never plays)
      let stopped = false;
      if (guided && !stepMode && !stepping && !capture) {
        for (let k = 1; k < tl.phases.length; k++) {
          const at = tl.phases[k].t0 - 1e-3;
          if (before < at - 1e-9 && time >= at) { time = at; playing = false; held = { kind: "chapter", phase: k - 1 }; stopped = true; break; }
        }
      }
      // New: hold after a key step until the reader goes on, and linger on the next chapter's entry card
      if (guided && !stepMode && !stepping && !capture && !stopped) {
        if (holds().holdKey) {
          for (let k = stepIndexAt(before); k < tl.steps.length; k++) {
            const s = tl.steps[k], at = s.t1 - 1e-3;
            if (at > time) break;
            if (s.layers?.key && before < at - 1e-9 && k + 1 < tl.steps.length) {
              time = at; playing = false; held = { kind: "key", phase: tl.phases.indexOf(phaseAt(at)), step: k }; stopped = true; break;
            }
          }
        }
        for (let k = 1; k < tl.phases.length; k++) if (before < tl.phases[k].t0 - 1e-9 && time >= tl.phases[k].t0) dwell = entryDwell(k);
      }
      // predict: pause just before a step that asks (its caption would give the answer away), until answered
      const i = stepIndexAt(before);
      for (let k = i; !stopped && k <= Math.min(i + 1, tl.steps.length - 1); k++) {
        const s = tl.steps[k];
        const at = Math.max(0, s.t0 - 1e-3);
        if ((s.ask || s.choose) && !answered.has(k) && before <= at + 1e-9 && time >= at) {
          time = at; playing = false; pendingAsk = k; hud.ask(s.ask ?? s.choose);
          break;
        }
      }
      if (time >= tl.duration) {
        playing = false;
        if (before < tl.duration && !capture) held = { kind: "end", phase: Math.max(0, tl.phases.length - 1) };
      }
    }
    if (hoverAt) {
      const id = pickAt(hoverAt[0], hoverAt[1]);
      if (id !== hoverId) { hoverId = id; dirty = true; if (!selectedId) inspect(id, hoverAt, false); }
      else if (id && !selectedId) inspect(id, hoverAt, false);
    } else if (hoverId) { hoverId = null; dirty = true; if (!selectedId) inspect(null); }
    if (live || dirty || moving) {
      dirty = false;
      if (live) shimmer += dt;
      clock += dt;
      // a frame the next one replaces at once (still playing, or the camera still easing) is a draft: without a GPU
      // the renderer draws it cheaper (CONTRACTS.md 3.1)
      drafting = playing || settling;
      const camera = renderFrame(dt, shimmer, clock, false);
      drafting = false;
      // keep drawing while the picture is still settling: the camera easing, the HUD's insets changed while it drew
      // (the director eases to the new framing from the next frame), an afterglow or ping fading out
      settling = cameraMoved(camera) || insetsMoved(viewport.insets, hud.insets);
      // the camera comes to rest on a draft: draw that frame again in full
      if (!(playing || dirty || settling) && renderer?.drafted) renderFrame(0, shimmer, clock, false);
      moving = settling || !!renderer?.busy;
    }
    if (playing || dirty || moving) schedule(); else rest();
  }
  function schedule() { if (!raf && visible && !frozen && !covered) raf = requestAnimationFrame(tick); }
  // something changed the picture: draw a frame
  function kick() { dirty = true; schedule(); }
  // nothing moves: no frames until the next kick. A camera the reader moved still eases back to auto direction
  // after its quiet spell, so wake for that
  function rest() {
    last = 0;
    if (!director.auto && !resumeTimer) {
      resumeTimer = setTimeout(() => { resumeTimer = 0; if (!director.auto) { director.resume(); kick(); } }, director.state.resumeIn * 1000 + 20);
    }
  }
  // the reader takes the camera: its quiet spell starts over
  function holdCamera() { clearTimeout(resumeTimer); resumeTimer = 0; }

  // whether the camera moved since the last frame drawn (by more than a hundredth of a px or so)
  const camPrev = { target: [NaN, NaN, NaN], distance: NaN, yaw: NaN, pitch: NaN, fov: NaN };
  function cameraMoved(c) {
    if (!c) return false;
    const P = camPrev, d = Math.max(1, c.distance);
    const moved = !(Math.hypot(c.target[0] - P.target[0], c.target[1] - P.target[1], c.target[2] - P.target[2]) / d <= 1e-5
      && Math.abs(Math.log(c.distance / P.distance)) <= 5e-5 && Math.abs(c.yaw - P.yaw) <= 1e-3 && Math.abs(c.pitch - P.pitch) <= 1e-3 && Math.abs(c.fov - P.fov) <= 1e-3);
    P.target[0] = c.target[0]; P.target[1] = c.target[1]; P.target[2] = c.target[2];
    P.distance = c.distance; P.yaw = c.yaw; P.pitch = c.pitch; P.fov = c.fov;
    return moved;
  }
  const insetsMoved = (a, b) => !a || !b || a.top !== b.top || a.right !== b.right || a.bottom !== b.bottom || a.left !== b.left;

  // size and visibility
  const resize = () => {
    // printing lays the page out as the handout alone (hud.css @media print): the world keeps its size meanwhile
    if (window.matchMedia?.("print").matches) return;
    const r = root.getBoundingClientRect();
    viewport = { width: Math.max(1, r.width), height: Math.max(1, r.height), dpr: Math.min(window.devicePixelRatio || 1, 2) };
    renderer?.resize(viewport.width, viewport.height, viewport.dpr);
    // a figure may lay itself out differently in portrait: rebuild when the orientation flips
    if (tl && env && envOf(viewport.width, viewport.height).portrait !== env.portrait) recompile({ keepPhase: true });
    kick();
  };
  new ResizeObserver(resize).observe(root);
  resize();
  new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) { last = 0; kick(); } }, { rootMargin: "120px 0px" }).observe(root);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { visible = false; } else { visible = true; last = 0; kick(); } });
  // anything the reader does in the figure may change what the chrome covers or shows: draw a frame for it (keys
  // reach the HUD's shortcuts from anywhere on the page)
  for (const type of ["pointerdown", "pointerup", "click", "wheel", "input", "change", "transitionend"]) root.addEventListener(type, kick, { capture: true, passive: true });
  document.addEventListener("keydown", kick, { capture: true, passive: true });
  motionQuery.addEventListener?.("change", kick);
  document.fonts?.ready?.then(kick);

  await (renderer?.ready ?? Promise.resolve());
  // no GPU at all: the described scene (engine/a11y/scene.mjs) steps out of hiding and shows the same run's world in words
  if (!renderer || renderer.lost) {
    root.classList.add("ix-no-gfx");
    hud.notice?.("This device can't draw the 3D world, so it is shown here in words. Everything else works.", { duration: 0 });
  }
  if (!recompile({ keepPhase: false })) return api();
  const arrival = arrive(moment, location.hash);
  // the page opens paused on its first step behind a start card; ?autoplay=1 (or autoplay: true) runs straight away.
  // A link to a moment opens on that step, and the start card says so, even for a reader who has seen it before.
  let query = null;
  try { query = new URLSearchParams(location.search); } catch { /* no location */ }
  const q = query?.get("autoplay");
  const autoplay = options.autoplay ?? (q != null ? !/^(0|false|no)$/i.test(q) : false);
  if (autoplay) { playing = true; if (arrival.notes.length) hud.notice?.(arrival.notes.join(" ")); }
  // the start card: a link's arrival, a first visit, or a returning reader with a place to pick up (the HUD offers
  // "welcome back" only when there is no link; never in capture)
  else if (options.intro !== false && !capture && (arrival.step != null || arrival.notes.length || !hud.introSeen || hud.resumable)) hud.intro?.(true, arrival);

  // a moment from a link, once the run exists: the playhead on its step, and the address bar in the HUD's own
  // spelling (#s=…&t=…&p=…), so a reload opens the same moment. -> { step: index | null, notes: [text] }
  function arrive(r, hash) {
    const at = resolveStep(r, tl.steps, tl.duration, `“${scenario.label ?? scenario.id}”`);
    if (at) time = at.time;
    if (options.hash !== false && parseMoment(hash).found) {
      const first = (figure.scenarios ?? [])[0]?.id;
      const str = formatHash({ scenario: scenario.id !== first ? scenario.id : undefined, time: at?.time ?? 0,
        params: paramOverrides(values, figure.params ?? {}, scenario), rest: momentRest(hash).split("&").filter(Boolean) });
      try { history.replaceState(history.state, "", str ? `#${str}` : location.pathname + location.search); } catch { /* sandboxed */ }
    }
    return { step: at ? at.index : null, notes: [...r.notes, ...(at?.note ? [at.note] : [])] };
  }
  // a link opened while the page is open (hashchange, or an embedding page setting the frame's hash): the same moment
  function openMoment(hash) {
    const m = parseMoment(hash);
    if (!m.found || !tl) return false;
    const r = resolveMoment(m, { scenarios: figure.scenarios ?? [], params: figure.params ?? {} });
    // a link that names a story or knobs says the whole setup: the knobs it leaves out are the story's own
    const next = r.scenario ? scenarioOf(figure, r.scenario) : scenario;
    const nextValues = { ...defaultsOf(figure), ...(next.params ?? {}), ...r.params };
    if ((r.scenario || Object.keys(r.params).length) && (next !== scenario || JSON.stringify(nextValues) !== JSON.stringify(values))) {
      scenario = next;
      values = nextValues;
      hud.setScenario?.(scenario.id);
      hud.setValues?.(values);
      recompile({ keepPhase: false });
    }
    if (r.level) hud.setLevel?.(r.level);
    hud.intro?.(false);
    pause();
    const a = arrive(r, hash);
    seek(time);
    if (a.notes.length) hud.notice?.(a.notes.join(" "));
    return true;
  }

  // the capture and audit contract
  function api() {
    const internals = {
      get timeline() { return tl; },
      get scenarios() { return (figure.scenarios ?? []).map(({ id, label }) => ({ id, label })); },
      get scenario() { return scenario.id; },
      get values() { return { ...values }; },
      get frame() { return frame; },
      seek: (t) => seek(t), play: () => { hud.intro?.(false); play(); }, pause: () => pause(), setSpeed: (x) => { speed = x; kick(); },
      // open a link's moment (#scenario-x&step-n&level-y&p=… or #s=…&t=…): true when the hash named one
      openMoment: (hash) => openMoment(hash),
      get held() { return held; },
      intro: (on = true) => hud.intro?.(on),
      setTheme: (t) => setTheme(t), setScenario: (id) => setScenario(id, { restart: true }), setParams: (v) => setParams(v),
      // the reader's level ("new" | "basics" | "expert"), as the level switch sets it
      get level() { return hud.level; }, setLevel: (v) => hud.setLevel?.(v),
      // the scenario switch a viewer makes (it starts at the fork); setScenario stays deterministic for the scripts
      chooseScenario: (id) => setScenario(id, { restart: true, fork: true }),
      get fold() { return { on: folding, regions: folds?.regions ?? [], active: frame ? foldInfo(frame.step) : null }; },
      get skipped() { return skipped; },
      setCapture: (on, opts = {}) => {
        capture = !!on;
        if (capture) { hud.intro?.(false); held = null; }
        if (hud.setCapture) hud.setCapture(capture, opts); else root.classList.toggle("ix-capture", capture);
        kick();
      },
      freeze: (on) => {
        frozen = !!on;
        if (frozen) { hud.intro?.(false); held = null; }
        document.documentElement.classList.toggle("ix-capture", frozen);   // the HUD swaps values instantly while frozen
        if (!frozen) { last = 0; kick(); }
      },
      async renderAt(t, { camera = "settled" } = {}) {
        if (!frozen) { hud.intro?.(false); held = null; }
        frozen = true;
        document.documentElement.classList.add("ix-capture");
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        const target = clamp(t, 0, tl.duration);
        const dt = camera === "settled" ? 10 : clamp(lastRenderAt == null ? 1 / 60 : target - lastRenderAt, 0, 0.5);
        lastRenderAt = target;
        time = target;
        renderFrame(dt, time, time, camera === "settled");
        await nextFrame();
        // the HUD measures its overlays a frame after it draws (a ResizeObserver): a settled frame whose overlays
        // moved is framed again around them
        for (let k = 0; k < 2 && camera === "settled"; k++) {
          await nextFrame();
          if (!insetsMoved(viewport.insets, hud.insets)) break;
          renderFrame(dt, time, time, true);
        }
        return { step: frame.step, u: frame.u, phase: frame.phase, caption: frame.caption };
      },
      audit: () => auditNow(),
      // what the camera frames around: the HUD's insets (css px) and the director's shot
      get insets() { return hud.insets; },
      get director() { return director.state; },
      profile: () => renderer?.profile?.(),
      stats: () => ({ ...(renderer?.stats?.() ?? {}), steps: tl?.steps.length, duration: tl?.duration, poses: frame?.poses.length, renders }),
    };
    window.__internals = internals;
    return internals;
  }

  // visual checks only a browser can do: text fit with the real fonts, tags on screen and apart, focus in frame
  const measure = document.createElement("canvas").getContext("2d");
  function auditNow() {
    const out = [];
    if (!frame) return out;
    for (const p of frame.poses) {
      if (!p.text || !["tile", "record", "bit", "page"].includes(p.kind)) continue;
      const size = SIZE[p.kind]?.label ?? SIZE.tile.label;
      measure.font = `500 ${size}px "${TYPE.mono}"`;
      const text = p.kind === "record" && p.sub != null ? `${p.text} ${p.sub}` : p.text;
      const width = measure.measureText(text).width;
      const room = (p.w ?? SIZE[p.kind]?.w ?? SIZE.tile.w) - 2 * 3;
      if (width > room) out.push({ kind: "label-overflow", step: frame.step, id: p.id, message: `"${text}" is ${width.toFixed(1)} u wide on a ${room.toFixed(1)} u face` });
    }
    // floor prints: a bitfield bracket's name must not run into another print (a second label drawn in its place)
    const prints = [];
    for (const p of frame.poses) {
      if ((p.opacity ?? 1) < 0.05) continue;
      if (p.kind === "bracket" && p.text && p.points?.length >= 2) {
        const B = SIZE.bracket, size = B.label, text = String(p.text).toUpperCase();
        measure.font = `600 ${size}px "${TYPE.mono}"`;
        const w = measure.measureText(text).width + text.length * size * B.tracking;
        const cx = (p.points[0][0] + p.points[p.points.length - 1][0]) / 2, cy = p.points[0][1] + B.dy;
        prints.push({ id: p.id, text: p.text, bracket: true, x0: cx - w / 2, x1: cx + w / 2, y0: cy - size * 0.5, y1: cy + size * 0.5, z: p.z ?? 0 });
      } else if (p.kind === "text" && p.text) {
        const size = Number(p.size) || 7, text = p.upper ? String(p.text).toUpperCase() : String(p.text);
        measure.font = `500 ${size}px "${TYPE.mono}"`;
        const w = measure.measureText(text).width;
        const align = p.align ?? (p.variant === "label" ? "left" : "center");
        const x0 = align === "left" ? p.x : align === "right" ? p.x - w : p.x - w / 2;
        prints.push({ id: p.id, text: p.text, bracket: false, x0, x1: x0 + w, y0: p.y - size * 0.5, y1: p.y + size * 0.5, z: p.z ?? 0 });
      }
    }
    for (let a = 0; a < prints.length; a++) {
      if (!prints[a].bracket) continue;
      const A = prints[a];
      for (let b = 0; b < prints.length; b++) {
        const B = prints[b];
        if (b === a || (B.bracket && b < a) || Math.abs(A.z - B.z) > 1) continue;
        const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
        if (ox > 1 && oy > 1) out.push({ kind: "print-overlap", step: frame.step, id: A.id, message: `bracket "${A.text}" overlaps the floor print "${B.text}" (${B.id})` });
      }
    }
    if (renderer) {
      const tags = (frame.tags ?? []).map((t) => ({ t, at: renderer.project(t.at) }));
      for (const { t, at } of tags) {
        if (!at[3] || at[0] < 0 || at[1] < 0 || at[0] > viewport.width || at[1] > viewport.height) out.push({ kind: "tag-offscreen", step: frame.step, id: t.id, message: `tag "${t.text}" is outside the frame` });
      }
      const f = frame.focus;
      if (f) {
        for (const c of [[f.minX, f.minY, 0], [f.maxX, f.minY, 0], [f.minX, f.maxY, 0], [f.maxX, f.maxY, 0]]) {
          const [x, y] = renderer.project(c);
          if (x < -2 || y < -2 || x > viewport.width + 2 || y > viewport.height + 2) { out.push({ kind: "focus-outside", step: frame.step, message: "part of the step's focus is outside the frame" }); break; }
        }
      }
    }
    return out;
  }

  const internals = api();
  embed = attachEmbed(root, internals, { meta });
  kick();
  await nextFrame();
  await nextFrame();
  return internals;
}
