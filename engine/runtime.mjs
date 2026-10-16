// The runtime: mounts a figure into a root element and runs the one loop that ties the parts together.
//   playhead → scene.sample → gfx.skin → director.update → renderer.render → hud.update / hud.placeTags
// It also owns recompiling on scenario and parameter changes, picking, the predict pauses,
// and window.__internals, the contract the capture and audit scripts drive (CONTRACTS.md 7.3).
import { compile, envOf } from "./scene/index.mjs";
import { createRenderer } from "./gfx/renderer.mjs";
import { skin } from "./gfx/skin.mjs";
import { createHud } from "./hud/hud.mjs";
import { applyTheme } from "./hud/theme.mjs";
import { createDirector } from "./director/director.mjs";
import { foldPlan, rateAt, captionHead, forkOf } from "./playback.mjs";
import { rng } from "../sim/rng.mjs";
import { DrawList } from "./contracts.mjs";
import { SIZE, TYPE } from "./tokens.mjs";

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
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

  let theme = options.theme ?? root.dataset.theme ?? meta.theme ?? "dark";
  let scenario = scenarioOf(figure, options.scenario);
  let values = { ...defaultsOf(figure), ...(scenario.params ?? {}) };
  let tl = null;
  let time = 0, playing = false, speed = 1, stopAt = null;
  let frame = null, hoverAt = null, hoverId = null, refHover = null, selectedId = null, pendingAsk = -1, answered = new Set();
  let frozen = false, visible = true, raf = 0, last = 0, capture = false, lastRenderAt = null;
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
  }, {
    onPlay: () => play(),
    onPause: () => pause(),
    onToggle: () => (playing ? pause() : play()),
    onStart: (mode) => {
      intro = false;
      if (mode === "play") play();
      else if (mode === "step") { stepMode = true; step(1); }
      kick();
    },
    onIntro: (open) => { intro = !!open; if (open) pause(); kick(); },
    onContinue: () => play(),
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
    onFit: () => frame && director.fit(frame.world, { instant: reduced() }),
    onFullscreen: () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.()),
    onRestart: () => { seek(0); answered.clear(); play(); },
    onHover: (x, y) => { hoverAt = x == null ? null : [x, y]; kick(); },
    onSelect: (x, y) => { selectedId = pickAt(x, y); inspect(selectedId, [x, y], true); kick(); },
    onRefHover: (id) => { refHover = id; kick(); },
    onGesture: (g) => {
      if (g.type === "focus") {
        const id = pickAt(g.x, g.y);
        const pose = id && frame?.poses.find((p) => p.id === id);
        if (pose) director.fit(boundsOfPose(pose), { instant: reduced() });
      } else director.gesture(g);
      kick();
    },
    onAnswer: () => {
      const k = pendingAsk;
      if (k >= 0) answered.add(k);
      pendingAsk = -1;
      // in step mode the answer plays just the step that reveals it
      if (stepMode && k >= 0 && tl) { held = null; stopAt = tl.steps[k].t1; playing = true; kick(); }
      else play();
    },
    onUnpin: () => { selectedId = null; kick(); },
  });

  guided = hud.guided ?? true;
  // "Speed through repeats" (a viewer preference) and the shared setup skipped on a scenario switch
  let folding = hud.folding ?? true, folds = null, skipped = null, baseTl = null;

  // deep link: scenario, params and playhead from the hash
  const initial = hud.initialState?.() ?? {};
  if (initial.scenario && initial.scenario !== scenario.id) {
    scenario = scenarioOf(figure, initial.scenario);
    values = { ...defaultsOf(figure), ...(scenario.params ?? {}) };
  }
  if (initial.params) values = { ...values, ...initial.params };
  hud.setScenario?.(scenario.id);
  hud.setValues?.(values);

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

  const view = () => ({ pxPerUnit, hover: refHover ?? hoverId, selected: selectedId, reducedMotion: reduced() });

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

  function seek(t) { time = clamp(t, 0, tl?.duration ?? 0); stopAt = null; held = null; kick(); }
  function play() {
    if (!tl) return;
    if (time >= tl.duration - 1e-6) { time = 0; answered.clear(); }
    stepMode = false; held = null;
    playing = true; kick();
  }
  function pause() { playing = false; stopAt = null; kick(); }
  function step(delta) {
    if (!tl) return;
    held = null;
    const i = stepIndexAt(time);
    const s = tl.steps[i];
    if (delta > 0) {
      const target = time < s.t1 - 1e-6 && time > s.t0 + 1e-6 ? s : tl.steps[Math.min(i + (time >= s.t1 - 1e-6 ? 1 : 0), tl.steps.length - 1)];
      if (time >= target.t1 - 1e-6) return;
      stopAt = target.t1;
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
  function boundsOfPose(p) {
    const w = (p.w ?? 40) / 2, d = (p.d ?? 40) / 2;
    return { minX: p.x - w, maxX: p.x + w, minY: p.y - d, maxY: p.y + d, minZ: 0, maxZ: (p.z ?? 0) + (p.h ?? 10) };
  }

  // one frame at playhead `t`
  function renderFrame(dt, renderTime, settle) {
    frame = tl.sample(time, view(), frame);
    draw.clear();
    if (frame.world) draw.bounds = frame.world;
    skin(frame.poses, draw, { theme, time: renderTime, pxPerUnit });
    viewport.insets = hud.insets;
    const camera = settle ? director.update(frame, viewport, dt, { settle: true }) : director.update(frame, viewport, dt);
    if (renderer && !renderer.lost) {
      renderer.render(draw, camera, { time: renderTime, reducedMotion: reduced() });
      pxPerUnit = renderer.pxPerUnit(camera.target) || pxPerUnit;
      const tags = [];
      for (const tag of frame.tags ?? []) {
        const [x, y, , on] = renderer.project(tag.at);
        if (on) tags.push({ id: tag.id, text: tag.text, tone: tag.tone, x, y, opacity: tag.opacity ?? 1 });
      }
      hud.placeTags(tags);
    }
    if (skipped && time < skipped.t - 0.01) skipped = null;   // rewound into the skipped setup: it is no longer skipped
    const fold = frozen || capture ? null : foldInfo(frame.step);
    if (fold) frame.caption = fold.caption;
    hud.update(frame, { time, playing, speed, duration: tl.duration, held: frozen || capture ? null : held, stepMode,
      fold, skipped: frozen || capture ? null : skipped });
  }

  function tick(now) {
    raf = 0;
    if (frozen || !tl) return;
    const dt = last ? clamp((now - last) / 1000, 0, 1 / 20) : 1 / 60;
    last = now;
    if (playing) {
      const before = time;
      const stepping = stopAt != null;
      time = Math.min(tl.duration, time + dt * speed * foldRate(before, stepping));
      if (stopAt != null && time >= stopAt) { time = stopAt; stopAt = null; playing = false; }
      // guided chapters: pause on the last frame of a chapter with a recap (never while stepping; scrubbing never plays)
      let stopped = false;
      if (guided && !stepMode && !stepping && !capture) {
        for (let k = 1; k < tl.phases.length; k++) {
          const at = tl.phases[k].t0 - 1e-3;
          if (before < at - 1e-9 && time >= at) { time = at; playing = false; held = { kind: "chapter", phase: k - 1 }; stopped = true; break; }
        }
      }
      // predict: pause just before a step that asks (its caption would give the answer away), until answered
      const i = stepIndexAt(before);
      for (let k = i; !stopped && k <= Math.min(i + 1, tl.steps.length - 1); k++) {
        const s = tl.steps[k];
        const at = Math.max(0, s.t0 - 1e-3);
        if (s.ask && !answered.has(k) && before <= at + 1e-9 && time >= at) {
          time = at; playing = false; pendingAsk = k; hud.ask(s.ask);
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
      if (id !== hoverId) { hoverId = id; if (!selectedId) inspect(id, hoverAt, false); }
      else if (id && !selectedId) inspect(id, hoverAt, false);
    } else if (hoverId) { hoverId = null; if (!selectedId) inspect(null); }
    renderFrame(dt, now / 1000, false);
    schedule();
  }
  function schedule() { if (!raf && visible && !frozen) raf = requestAnimationFrame(tick); }
  function kick() { schedule(); }

  // size and visibility
  const resize = () => {
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

  if (!renderer) hud.notice?.("WebGL is unavailable here, so the world can't be drawn. The captions and controls still work.", { duration: 0 });
  await (renderer?.ready ?? Promise.resolve());
  if (!recompile({ keepPhase: false })) return api();
  if (initial.time != null) { time = clamp(initial.time, 0, tl.duration); }
  // the page opens paused on its first step behind a start card; ?autoplay=1 (or autoplay: true) runs straight away
  let query = null;
  try { query = new URLSearchParams(location.search); } catch { /* no location */ }
  const q = query?.get("autoplay");
  const autoplay = options.autoplay ?? (q != null ? !/^(0|false|no)$/i.test(q) : false);
  if (autoplay) playing = true;
  else if (options.intro !== false && !capture && !hud.introSeen) hud.intro?.(true);

  // the capture and audit contract
  function api() {
    const internals = {
      get timeline() { return tl; },
      get scenarios() { return (figure.scenarios ?? []).map(({ id, label }) => ({ id, label })); },
      get scenario() { return scenario.id; },
      get values() { return { ...values }; },
      get frame() { return frame; },
      seek: (t) => seek(t), play: () => { hud.intro?.(false); play(); }, pause: () => pause(), setSpeed: (x) => { speed = x; },
      get held() { return held; },
      intro: (on = true) => hud.intro?.(on),
      setTheme: (t) => setTheme(t), setScenario: (id) => setScenario(id, { restart: true }), setParams: (v) => setParams(v),
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
        renderFrame(dt, time, camera === "settled");
        await nextFrame();
        return { step: frame.step, u: frame.u, phase: frame.phase, caption: frame.caption };
      },
      audit: () => auditNow(),
      stats: () => ({ ...(renderer?.stats?.() ?? {}), steps: tl?.steps.length, duration: tl?.duration, poses: frame?.poses.length }),
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
  kick();
  await nextFrame();
  await nextFrame();
  return internals;
}
