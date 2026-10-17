// Embedding: a clean chrome for iframes, a postMessage API with xAPI-shaped events, and readable deep links.
//   ?embed=1            the iframe chrome (.ix-embed: no full-screen button, a smaller title, a calmer header)
//   ?origin=a,b         origins allowed to drive the figure (else meta.embed.origins; else only the parent window)
//   #step-12 #scenario-crash #level-expert   on load and on hashchange (deeplink.mjs)
//
// In:  { type: "explainer", version: 1, command, value?, id? }
//      command: "play" | "pause" | "seek" (value: seconds) | "step" (value: 1-based step) | "scenario" (value: id)
//               | "level" ("new" | "basics" | "expert") | "theme" ("light" | "dark")
//      A message with an id is answered { event: "ack", id, ok, error? }.
// Out: { type: "explainer", version: 1, event, statement }
//      event: "ready" | "step" | "chapter" | "ask-answered" | "complete" (and "ack")
//      statement: an xAPI statement without its actor (the host knows who is learning):
//      { verb: { id, display }, object: { objectType: "Activity", id, definition: { name, type } }, result?, context, timestamp }
// Hosts forward statements to their LRS as they are; LTI and SCORM are out of scope for a static file.
import { parseLinks, stripLinks } from "./deeplink.mjs";
import { liveTurns } from "../hud/turn.mjs";

export const PROTOCOL = { type: "explainer", version: 1 };
const COMMANDS = new Set(["play", "pause", "seek", "step", "scenario", "level", "theme"]);
const LEVELS = new Set(["new", "basics", "expert"]);
const THEMES = new Set(["light", "dark"]);
const ADL = "http://adlnet.gov/expapi/verbs/";
const VERB = {
  ready: "initialized", step: "progressed", chapter: "experienced", "ask-answered": "answered", complete: "completed",
};
const ACTIVITY = "http://adlnet.gov/expapi/activities/";
const EXT = "https://explainer.dev/xapi/";   // extension keys: a namespace, never fetched
const STEP_SETTLE = 250;                       // ms a step must hold before it is reported (scrubbing passes many)

const slug = (s) => String(s ?? "figure").toLowerCase().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "figure";
const plain = (s) => String(s ?? "").replace(/\{(?:\w+:)?([^}|]*)(?:\|([^}]*))?\}/g, (_, a, b) => b ?? a).replace(/`/g, "").trim();

/** The embed settings from the page's query and the figure's meta. */
export function embedConfig(search, meta = {}) {
  let q = null;
  try { q = new URLSearchParams(search ?? ""); } catch { /* none */ }
  const v = q?.get("embed");
  const listed = q?.get("origin");
  const origins = listed ? listed.split(",").map((s) => s.trim()).filter(Boolean) : Array.isArray(meta.embed?.origins) ? meta.embed.origins.slice() : null;
  return { on: v != null && !/^(0|false|no)$/i.test(v), origins };
}

/** Check an inbound message's shape; returns null when it is fine, else what is wrong. */
export function invalid(msg, { scenarios = [], steps = 0 } = {}) {
  if (!msg || typeof msg !== "object" || msg.type !== PROTOCOL.type) return "not an explainer message";
  if (msg.version !== PROTOCOL.version) return `version ${msg.version} is not supported (use ${PROTOCOL.version})`;
  if (!COMMANDS.has(msg.command)) return `unknown command "${msg.command}"`;
  const v = msg.value;
  switch (msg.command) {
    case "seek": return Number.isFinite(v) && v >= 0 ? null : "seek needs a time in seconds (a number ≥ 0)";
    case "step": return Number.isInteger(v) && v >= 1 && v <= steps ? null : `step needs a whole number from 1 to ${steps}`;
    case "scenario": return scenarios.some((s) => s.id === v) ? null : `unknown scenario "${v}"`;
    case "level": return LEVELS.has(v) ? null : "level is new, basics or expert";
    case "theme": return THEMES.has(v) ? null : "theme is light or dark";
    default: return null;
  }
}

/**
 * Wire a mounted figure for embedding and deep links.
 * `figure` is the runtime's control surface (window.__internals): seek, play, pause, setTheme, setLevel, setScenario,
 * intro, timeline, scenarios, scenario, level, frame.
 */
export function attachEmbed(root, figure, { meta = {}, search, log = console } = {}) {
  const win = root.ownerDocument.defaultView;
  const cfg = embedConfig(search ?? win.location.search, meta);
  const framed = win.parent && win.parent !== win;
  if (cfg.on) {
    root.classList.add("ix-embed");
    root.ownerDocument.documentElement.classList.add("ix-embedded");
  }
  const iri = meta.embed?.id ?? `urn:explainer:${slug(meta.id ?? meta.title)}`;
  const offs = [];
  const on = (t, type, fn) => { t.addEventListener(type, fn); offs.push(() => t.removeEventListener(type, fn)); };

  // ---- outbound: xAPI-shaped statements, posted to the parent ----
  // Without an allow list the target is the parent's own origin when the browser says it, else "*".
  const parentOrigin = () => {
    try { const a = win.location.ancestorOrigins; if (a?.length) return a[0]; } catch { /* none */ }
    try { if (win.document.referrer) return new URL(win.document.referrer).origin; } catch { /* none */ }
    return "*";
  };
  const targets = cfg.origins?.length ? (cfg.origins.includes("*") ? ["*"] : cfg.origins) : [parentOrigin()];
  function post(body) {
    if (!framed) return;
    for (const to of targets) { try { win.parent.postMessage({ ...PROTOCOL, ...body }, to); } catch { /* a closed or foreign parent */ } }
  }
  const activity = (id, name, type) => ({ objectType: "Activity", id, definition: { name: { "en-US": name }, type: `${ACTIVITY}${type}` } });
  function emit(event, object, result, ext = {}) {
    const statement = {
      verb: { id: `${ADL}${VERB[event]}`, display: { "en-US": VERB[event] } },
      object,
      ...(result ? { result } : {}),
      context: { contextActivities: { parent: [activity(iri, meta.title ?? "Figure", "simulation")] },
        extensions: { [`${EXT}scenario`]: figure.scenario, [`${EXT}level`]: figure.level, ...ext } },
      timestamp: new Date().toISOString(),
    };
    post({ event, statement });
  }

  // ---- run state the events come from ----
  let step = -1, chapter = -1, stepTimer = 0, done = false, asks = { right: 0, total: 0 }, runScenario = figure.scenario;
  const tried = new Set(), solved = new Set();   // question ids: first try made, question done
  const tl = () => figure.timeline;
  const chapterOf = (i) => { const s = tl()?.steps[i]; return s ? tl().phases.findIndex((p) => p.name === s.phase) : -1; };
  function reportStep(i) {
    const s = tl()?.steps[i];
    if (!s) return;
    const n = tl().steps.length;
    emit("step", activity(`${iri}#step-${i + 1}`, plain(s.caption) || `Step ${i + 1}`, "interaction"),
      { extensions: { "https://w3id.org/xapi/cmi5/result/extensions/progress": Math.round(((i + 1) / n) * 100) } },
      { [`${EXT}step`]: i + 1, [`${EXT}stepId`]: s.id ?? null, [`${EXT}steps`]: n });
    const c = chapterOf(i);
    if (c !== chapter && c >= 0) {
      chapter = c;
      const p = tl().phases[c];
      emit("chapter", activity(`${iri}#chapter-${p.id ?? c + 1}`, p.name ?? `Chapter ${c + 1}`, "module"), null,
        { [`${EXT}chapter`]: c + 1, [`${EXT}chapters`]: tl().phases.length });
    }
  }

  // ---- inbound commands ----
  function run(msg) {
    const v = msg.value;
    switch (msg.command) {
      case "play": figure.play(); break;
      case "pause": figure.pause(); break;
      case "seek": figure.intro?.(false); figure.seek(v); break;
      case "step": figure.intro?.(false); figure.pause(); figure.seek(tl().steps[v - 1].t0); break;
      case "scenario": figure.setScenario(v); break;
      case "level": figure.setLevel(v); break;
      case "theme": figure.setTheme(v); break;
    }
  }
  let warned = false;
  function allowed(e) {
    if (cfg.origins?.length) return cfg.origins.includes("*") || cfg.origins.includes(e.origin);
    if (!warned) { warned = true; log.warn?.("[explainer] embed: no allowed origins set (?origin= or meta.embed.origins); accepting messages from the parent window only."); }
    return framed && e.source === win.parent;
  }
  on(win, "message", (e) => {
    const msg = e.data;
    if (!msg || typeof msg !== "object" || msg.type !== PROTOCOL.type || !("command" in msg)) return;   // not ours
    if (!allowed(e)) { log.warn?.(`[explainer] embed: ignored a message from ${e.origin || "an unknown origin"}`); return; }
    const err = invalid(msg, { scenarios: figure.scenarios ?? [], steps: tl()?.steps.length ?? 0 });
    const reply = (ok, error) => {
      if (msg.id == null || !e.source) return;
      try { e.source.postMessage({ ...PROTOCOL, event: "ack", id: msg.id, ok, ...(error ? { error } : {}) }, e.origin && e.origin !== "null" ? e.origin : "*"); } catch { /* gone */ }
    };
    if (err) { log.warn?.(`[explainer] embed: ${err}`); reply(false, err); return; }
    try { run(msg); reply(true); } catch (x) { reply(false, String(x?.message ?? x)); }
  });

  // ---- deep links ----
  function applyLinks(hash, { fromLoad } = {}) {
    const L = parseLinks(hash);
    if (!L.found || !tl()) return false;
    if (L.scenario && L.scenario !== figure.scenario && (figure.scenarios ?? []).some((s) => s.id === L.scenario)) figure.setScenario(L.scenario);
    if (L.level && L.level !== figure.level) figure.setLevel(L.level);
    if (L.step) {
      const s = tl().steps[Math.min(L.step, tl().steps.length) - 1];
      if (!fromLoad) figure.intro?.(false);
      figure.pause();
      figure.seek(s.t0);
    }
    // consumed: the HUD's own state hash (#t=…) takes over from here
    const rest = stripLinks(hash);
    try { win.history.replaceState(win.history.state, "", rest ? `#${rest}` : win.location.pathname + win.location.search); } catch { /* sandboxed */ }
    return true;
  }
  applyLinks(win.location.hash, { fromLoad: true });
  on(win, "hashchange", () => applyLinks(win.location.hash));

  emit("ready", activity(iri, meta.title ?? "Figure", "simulation"), null, {
    [`${EXT}steps`]: tl()?.steps.length ?? 0, [`${EXT}chapters`]: (tl()?.phases ?? []).map((p, i) => ({ id: p.id ?? String(i + 1), name: p.name })),
    [`${EXT}scenarios`]: figure.scenarios ?? [], [`${EXT}embed`]: cfg.on,
  });

  return {
    config: cfg,
    /** Every frame drawn: report a step once it settles, the run's end once. */
    update(frame, { held, time, duration } = {}) {
      if (!frame || !Number.isInteger(frame.step)) return;
      // a new scenario is a new run: the score, the chapters and the end start over
      if (figure.scenario !== runScenario) { runScenario = figure.scenario; asks = { right: 0, total: 0 }; tried.clear(); solved.clear(); done = false; chapter = -1; }
      if (frame.step !== step) {
        step = frame.step;
        win.clearTimeout(stepTimer);
        const at = step;
        stepTimer = win.setTimeout(() => { if (at === step) reportStep(at); }, STEP_SETTLE);
        if (at < (tl()?.steps.length ?? 0) - 1) done = false;   // rewound: the end can be reached again
      }
      const end = held?.kind === "end" || (duration && time >= duration - 1e-6);
      if (end && !done) {
        done = true;
        const result = { completion: true, ...(asks.total ? { success: asks.right === asks.total, score: { raw: asks.right, min: 0, max: asks.total, scaled: +(asks.right / asks.total).toFixed(3) } } : {}) };
        emit("complete", activity(iri, meta.title ?? "Figure", "simulation"), result);
      }
    },
    /**
     * The reader answered the question at step k with option `index` (-1: skipped). A predict (s.ask) is answered once;
     * a pick (s.choose) may be tried several times, each try reported, and the first try is what scores. Questions the
     * reader's level does not ask (the HUD answers them itself) are not reported.
     */
    answered(k, index) {
      const s = tl()?.steps[k], q = s?.ask ?? s?.choose;
      if (!q || !liveTurns(tl().steps, figure.level).has(k)) return;
      const key = q.id ?? `step-${k + 1}`;
      if (solved.has(key)) return;   // a look at the other pick after the right one
      const skipped = !(index >= 0);
      const success = !skipped && index === q.answer;
      if (!tried.has(key)) { tried.add(key); if (!skipped) { asks.total++; if (success) asks.right++; } }
      if (success || skipped) solved.add(key);
      const option = q.options?.[index];
      emit("ask-answered", activity(`${iri}#ask-${key}`, plain(q.question ?? q.prompt) || `Question at step ${k + 1}`, "cmi.interaction"),
        skipped ? { response: "", extensions: { [`${EXT}skipped`]: true } }
          : { success, response: plain(typeof option === "string" ? option : option?.text), extensions: { [`${EXT}choice`]: index, [`${EXT}answer`]: q.answer, [`${EXT}kind`]: q.kind === "choose" ? "pick" : "predict" } },
        { [`${EXT}step`]: k + 1 });
    },
    destroy() { win.clearTimeout(stepTimer); offs.forEach((off) => off()); root.classList.remove("ix-embed"); },
  };
}
