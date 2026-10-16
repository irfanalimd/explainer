// Shared plumbing for the scripts that drive a built figure page through window.__internals (CONTRACTS.md 7.3):
// resolve a target (page, URL, or figure module, which is built to a temp page first), open it, wait for it to
// boot with useful diagnostics, read the timeline, switch scenario/theme, capture mode, deterministic renders.
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, extname, basename } from "node:path";
import { openPage, urlFor } from "./cdp.mjs";

/** A page URL for a target. A .mjs figure is built to a temporary page (pass runtime/theme through). */
export async function resolveTarget(target, { runtime, theme } = {}) {
  if (/^(https?|file):/.test(target)) return { url: target, name: basename(new URL(target).pathname, ".html") || "page", stop: () => {} };
  const abs = resolve(target);
  if (!existsSync(abs)) throw new Error(`not found: ${target}`);
  if (extname(abs) === ".mjs" || extname(abs) === ".js") {
    const { buildPage } = await import("../build.mjs");
    const dir = mkdtempSync(join(tmpdir(), "explainer-build-"));
    const r = await buildPage(abs, { out: join(dir, "page.html"), runtime, theme });
    return { url: "file://" + r.out, name: basename(r.out, ".html") === "page" ? (r.meta.title ? slug(r.meta.title) : "figure") : basename(r.out, ".html"), built: r, stop: () => rmSync(dir, { recursive: true, force: true }) };
  }
  const { url, stop } = await urlFor(abs);
  return { url, name: basename(abs, extname(abs)).replace(/\.dev$/, ""), stop };
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Capture hides the interactive chrome: the contract's three classes, plus the HUD's other controls (toolbar,
// scenario tabs or the phone picker, help, inspector, toasts, menus, tips, scrub preview). Content stays:
// title block, legend, meters, tags, and the caption unless captions are off.
const CHROME = [".ix-transport", ".ix-drawer", ".ix-settings", ".ix-tools", ".ix-toolbar", ".ix-tabs", ".ix-top .ix-select-wrap",
  ".ix-help", ".ix-help-scrim", ".ix-inspector", ".ix-toast", ".ix-menu", ".ix-tip", ".ix-preview", ".ix-sheet-scrim"];
const CAPTURE_CSS = (captions, chrome) => `
${chrome ? "" : `${CHROME.join(", ")} { visibility: hidden !important; }`}
${captions ? "" : ".ix-caption { visibility: hidden !important; }"}`;
const STILL_CSS = `*, *::before, *::after { transition-duration: 0s !important; transition-delay: 0s !important; animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; caret-color: transparent !important; }`;

/**
 * Open a figure page and wait until window.__internals is ready.
 * @returns page helpers: info(), scenarios(), setScenario(id), setTheme(t), freeze(), renderAt(t, camera), audit(), stats(), capture(), still()
 */
export async function openFigure(browser, url, { width = 1440, height = 900, dpr = 1, timeout = 30000, onConsole } = {}) {
  const page = await openPage(browser, url, { width, height, dpr, onConsole, timeout });
  const fail = (what) => {
    const errs = page.errors.map((e) => `  [${e.type}] ${e.text.split("\n").slice(0, 3).join("\n    ")}`).join("\n");
    return new Error(`${what}\n${errs || "  (no console errors; is window.__internals set by the runtime?)"}`);
  };
  const ok = await page.waitFor("!!(window.__internals && (window.__internals.ready || window.__internals.timeline))", { timeout });
  if (!ok) throw fail(`page did not boot within ${timeout} ms (no window.__internals): ${url}`);
  try { await page.evaluate("Promise.resolve(window.__internals.ready ?? window.__ready).then(() => true)", { timeout }); }
  catch (e) { throw fail(`__internals.ready failed: ${e.message.split("\n")[0]}`); }
  await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true");

  const ev = (js) => page.evaluate(js);
  const fp = {
    page, errors: page.errors,
    info: () => ev(`(() => { const tl = window.__internals.timeline; return {
      duration: tl.duration,
      steps: tl.steps.map((s) => ({ index: s.index, t0: s.t0, t1: s.t1, dur: s.dur, caption: s.caption, phase: s.phase })),
      phases: (tl.phases || []).map((p) => ({ name: p.name, step: p.step, t0: p.t0, t1: p.t1 })) }; })()`),
    // the contract has no scenario list: ask __internals, else the figure module through the page's import map
    scenarios: () => ev(`(async () => {
      const I = window.__internals, list = I.scenarios || (I.figure && I.figure.scenarios);
      if (list) return list.map((s) => ({ id: s.id, label: s.label }));
      try { const m = await import("@internals/figure"); return (m.scenarios || []).map((s) => ({ id: s.id, label: s.label })); } catch { return null; }
    })()`),
    async setScenario(id) {
      await ev(`(async () => { await window.__internals.setScenario(${JSON.stringify(id)}); return true; })()`);
      await ev(`new Promise((r) => requestAnimationFrame(() => r(true)))`);
    },
    setTheme: (t) => ev(`(async () => { await window.__internals.setTheme(${JSON.stringify(t)}); return true; })()`),
    freeze: () => ev(`(async () => { await window.__internals.freeze(true); return true; })()`),
    renderAt: (t, camera = "settled") => ev(`(async () => { const r = await window.__internals.renderAt(${t}, { camera: ${JSON.stringify(camera)} }); return r && typeof r === "object" ? JSON.parse(JSON.stringify(r)) : null; })()`),
    audit: () => ev(`(async () => JSON.parse(JSON.stringify((await window.__internals.audit?.()) ?? [])))()`),
    stats: () => ev(`(async () => JSON.parse(JSON.stringify((await window.__internals.stats?.()) ?? {})))()`),
    /** Capture mode: the runtime's own (setCapture) plus CSS hiding the transport and drawers (and captions unless kept). */
    capture: ({ captions = true, chrome = false } = {}) => ev(`(() => {
      window.__internals.setCapture?.(true);
      document.documentElement.classList.add("ix-capture");
      let s = document.getElementById("ix-capture-css");
      if (!s) { s = document.createElement("style"); s.id = "ix-capture-css"; document.head.appendChild(s); }
      s.textContent = ${JSON.stringify(CAPTURE_CSS(captions, chrome))};
      return true; })()`),
    /** Stills: CSS transitions and animations jump to their end so a screenshot does not depend on wall-clock timing. */
    still: () => ev(`(() => { let s = document.getElementById("ix-still-css");
      if (!s) { s = document.createElement("style"); s.id = "ix-still-css"; document.head.appendChild(s); }
      s.textContent = ${JSON.stringify(STILL_CSS)}; return true; })()`),
    close: () => page.close(),
  };
  return fp;
}

/** Shot times for a timeline. at: "phases" | "all" | "steps" | list of step indices ("12"), times ("4.5s"), "end". */
export function shotTimes(info, at = "phases") {
  const eps = 1e-3, out = [];
  const stepAt = (t) => { let k = 0; for (const s of info.steps) if (s.t0 <= t + 1e-9) k = s.index; return k; };
  const mid = (s) => ({ t: s.t0 + s.dur / 2, step: s.index, tag: "mid" });
  const end = (s) => ({ t: Math.max(s.t0, s.t1 - Math.min(eps, s.dur / 2)), step: s.index, tag: "end" });
  if (at === "phases") {
    const phases = info.phases.length ? info.phases : [{ name: "", t0: 0, t1: info.duration }];
    for (const p of phases) {
      const t1 = p.t1 ?? info.duration;
      const tm = (p.t0 + t1) / 2, te = Math.max(p.t0, t1 - eps);
      out.push({ t: tm, step: stepAt(tm), tag: "mid", phase: p.name }, { t: te, step: stepAt(te), tag: "end", phase: p.name });
    }
  } else if (at === "all") for (const s of info.steps) out.push(mid(s), end(s));
  else if (at === "steps") for (const s of info.steps) out.push(end(s));
  else for (const item of String(at).split(",").map((x) => x.trim()).filter(Boolean)) {
    if (item === "end") { out.push({ t: info.duration, step: info.steps.length - 1, tag: "end" }); continue; }
    const m = /^(\d+(?:\.\d+)?)s$/.exec(item);
    if (m) { const t = Math.min(info.duration, Number(m[1])); out.push({ t, step: stepAt(t), tag: `t${Number(m[1]).toFixed(2)}s` }); continue; }
    if (!/^\d+$/.test(item)) throw new Error(`bad --at item "${item}" (use phases, all, steps, step indices like 12, times like 4.5s, or end)`);
    const s = info.steps[Number(item)];
    if (!s) throw new Error(`step ${item} does not exist (the timeline has ${info.steps.length} steps, 0-${info.steps.length - 1})`);
    out.push(mid(s), end(s));
  }
  for (const o of out) o.phase ??= info.steps[o.step]?.phase ?? "";
  return out;
}

/** Caption markup -> plain text (for reports and contact sheets). */
export const plainCaption = (m = "") => String(m)
  .replace(/\{(?:key|ref|tone):([^}|]+)(?:\|([^}]+))?\}/g, (_, a, b) => b ?? a).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
export const clip = (s, n = 72) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Group findings that repeat across steps and shots: one line per (kind, message), with the steps it occurs at. */
export function groupFindings(items, where = (x) => x.where ?? x.shot) {
  const by = new Map();
  for (const p of items) {
    const k = `${p.kind}|${p.message}`;
    if (!by.has(k)) by.set(k, { kind: p.kind, message: p.message, steps: new Set(), where: new Set(), first: p });
    const g = by.get(k);
    if (p.step != null) g.steps.add(p.step);
    if (where(p)) g.where.add(where(p));
    if ((p.step ?? Infinity) < (g.first.step ?? Infinity)) g.first = p;
  }
  return [...by.values()].sort((a, b) => (a.first.step ?? -1) - (b.first.step ?? -1));
}

export function findingLine(g, { whereLabel = "in" } = {}) {
  const steps = [...g.steps].sort((a, b) => a - b);
  const stepText = !steps.length ? "" : steps.length === 1 ? ` at step ${steps[0]}` : ` at steps ${steps.length > 8 ? steps.slice(0, 8).join(", ") + ` … (${steps.length})` : steps.join(", ")}`;
  const cap = g.first.caption ? ` (first: "${clip(plainCaption(g.first.caption), 56)}")` : "";
  const w = [...g.where];
  return `  ${g.kind}${stepText}: ${g.message}${cap}  [${w.slice(0, 3).join(", ")}${w.length > 3 ? ` +${w.length - 3}` : ""}]`;
}
