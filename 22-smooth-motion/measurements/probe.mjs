// node probe.mjs <page.html> <out.json> [--size 1440x900] [--dpr 2] [--secs 12] [--stub 1] [--profile out.cpuprofile]
// Live play at 1x with a spoofed hardware GPU (no drafts). Per animation frame: the rAF callback's JS time, and inside
// it the renderer's render() call. --stub 1 replaces render() with a no-op after warm-up, so frames come at the
// display's rate and the rest of the frame (scene, skin, director, HUD, DOM) is measured on its own.
// Also: Performance.getMetrics deltas (layouts, style recalcs, script, GC via heap), long frames, long animation frames.
import { launch } from "/home/ubuntu/projects/explainer/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [page, out] = args;
const [w, h] = opt("size", "1440x900").split("x").map(Number), dpr = Number(opt("dpr", 2)), secs = Number(opt("secs", 12));
const stub = opt("stub", "0") === "1", profileOut = opt("profile", null), at = Number(opt("at", 0.0)), scen = opt("scenario", "");
const SPOOF = `(() => {
  const R = 0x9246, V = 0x9245;
  for (const C of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!C) continue; const g = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { if (p === R) return "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)"; if (p === V) return "Google Inc. (Apple)"; return g.call(this, p); };
  }
  // time every rAF callback (the runtime's tick)
  const raf = window.requestAnimationFrame.bind(window);
  window.__fr = []; window.__inRender = 0;
  window.requestAnimationFrame = (cb) => raf((ts) => { const t0 = performance.now(); window.__inRender = 0; cb(ts); const t1 = performance.now(); if (window.__rec) window.__fr.push([ts, t1 - t0, window.__inRender, window.__internals?.frame?.step ?? -1, document.querySelector(".ix-predict.ix-open") ? 1 : 0, window.__internals?.held?.kind || ""]); });
  window.__loaf = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (window.__rec) window.__loaf.push({ d: e.duration, b: e.blockingDuration, style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0, scripts: (e.scripts || []).map((s) => [s.invoker, Math.round(s.duration), s.forcedStyleAndLayoutDuration || 0]) }); }).observe({ type: "long-animation-frame", buffered: false }); } catch {}
})();`;
const browser = await launch();
try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  const errors = [];
  browser.on((msg) => { if (msg.sessionId === sessionId && msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description); });
  await s("Runtime.enable"); await s("Page.enable"); await s("Performance.enable");
  await s("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: SPOOF });
  await s("Page.navigate", { url: pathToFileURL(resolve(page)).href + (scen ? `#${scen}` : "") });
  const ev = async (expression) => { const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  for (let k = 0; k < 900; k++) { if (await ev("!!(window.__internals && window.__ready && window.__gfx)").catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  await ev("window.__ready.then(() => document.fonts.ready).then(() => true)");
  const backend = await ev("__gfx.backend");
  // time render() inside each frame
  await ev(`(() => { const G = __gfx, orig = G.render.bind(G); window.__realRender = orig;
    G.render = (...a) => { const t0 = performance.now(); const r = window.__stub ? undefined : orig(...a); window.__inRender += performance.now() - t0; return r; }; return true; })()`);
  await ev(`(() => { const A = __gfx.atlas; window.__ras = []; if (A) { const r = A.rasterise.bind(A); A.rasterise = (...a) => { const t0 = performance.now(); const e = r(...a); if (window.__rec) window.__ras.push([performance.now() - t0, a[1].length, e ? e.w * e.h : 0]); return e; }; } return !!A; })()`);
  await ev(`(() => { const I = __internals; I.intro && I.intro(false); ${scen ? `I.setScenario && I.setScenario(${JSON.stringify(scen)});` : ""} I.seek(I.timeline.duration * ${at}); I.setSpeed(1); return true; })()`);
  await new Promise((r) => setTimeout(r, 1500));
  if (stub) await ev("window.__stub = true, true");
  await ev("(() => { __internals.play(); window.__resumes = 0; setInterval(() => { const o = document.querySelector('.ix-predict.ix-open .ix-opt:not([aria-disabled])'); if (o) { o.click(); window.__resumes++; } else if (document.querySelector('.ix-predict.ix-revealed')) { window.__resumes++; __internals.play(); } else if (__internals.held && __internals.held.kind !== 'end') { window.__resumes++; __internals.play(); } }, 100); return true; })()");
  await new Promise((r) => setTimeout(r, 1500));   // warm-up
  const m0 = Object.fromEntries((await s("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const heapOut = opt("heap", null);
  if (heapOut) { await s("HeapProfiler.enable"); await s("HeapProfiler.collectGarbage"); await s("HeapProfiler.startSampling", { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  if (profileOut) { await s("Profiler.enable"); await s("Profiler.setSamplingInterval", { interval: 200 }); await s("Profiler.start"); }
  await ev("window.__step0 = __internals.frame?.step, window.__rec = true, true");
  await new Promise((r) => setTimeout(r, secs * 1000));
  await ev("window.__rec = false, true");
  if (heapOut) { const hp = (await s("HeapProfiler.stopSampling")).profile; writeFileSync(heapOut, JSON.stringify(hp)); }
  let prof = null;
  if (profileOut) { prof = (await s("Profiler.stop")).profile; writeFileSync(profileOut, JSON.stringify(prof)); }
  const m1 = Object.fromEntries((await s("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const ras = await ev("window.__ras"); const fr = await ev("window.__fr"), loaf = await ev("window.__loaf"), step = await ev("[window.__step0, __internals.frame?.step, window.__resumes]");
  const dm = {}; for (const k of ["LayoutCount", "RecalcStyleCount", "LayoutDuration", "RecalcStyleDuration", "ScriptDuration", "TaskDuration", "JSHeapUsedSize", "JSHeapTotalSize", "Nodes"]) dm[k] = +(m1[k] - m0[k]).toFixed(4);
  const q = (a, p) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(2); };
  const js = fr.map((f) => f[1]), rend = fr.map((f) => f[2]), rest = fr.map((f) => f[1] - f[2]);
  const gaps = fr.slice(1).map((f, i) => f[0] - fr[i][0]);
  const res = { page, size: `${w}x${h}@${dpr}`, stub, backend, step, frames: fr.length, secs,
    fps: +(fr.length / secs).toFixed(2),
    jsMs: { median: q(js, 0.5), p95: q(js, 0.95), max: q(js, 1) },
    renderMs: { median: q(rend, 0.5), p95: q(rend, 0.95) },
    restMs: { median: q(rest, 0.5), p95: q(rest, 0.95), max: q(rest, 1) },
    longFramesPer10s: +(rest.filter((x) => x > 16.7).length / secs * 10).toFixed(2),
    gapMs: { median: q(gaps, 0.5), p95: q(gaps, 0.95), max: q(gaps, 1) },
    metrics: dm, layoutsPerFrame: +(dm.LayoutCount / Math.max(1, fr.length)).toFixed(2), stylesPerFrame: +(dm.RecalcStyleCount / Math.max(1, fr.length)).toFixed(2),
    longest: fr.map((f, i) => ({ i, js: +f[1].toFixed(1), render: +f[2].toFixed(1), step: f[3], prevStep: i ? fr[i - 1][3] : null, card: f[4], held: f[5], gapBefore: i ? +(f[0] - fr[i - 1][0]).toFixed(1) : 0 })).sort((a, b) => b.js - a.js).slice(0, 12),
    raster: { n: ras.length, totalMs: +ras.reduce((a, r) => a + r[0], 0).toFixed(1), median: q(ras.map((r) => r[0]), 0.5), p95: q(ras.map((r) => r[0]), 0.95), max: q(ras.map((r) => r[0]), 1), texels: q(ras.map((r) => r[2]), 0.5) },
    loaf: loaf.slice(0, 30), errors };
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ ...res, loaf: loaf.length }));
} finally { browser.close(); }
