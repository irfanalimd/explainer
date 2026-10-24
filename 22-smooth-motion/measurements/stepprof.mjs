// node stepprof.mjs <page.html> <out.json> [--size 1440x900] [--dpr 2] [--rounds 3]
// The cost of a step change on its own: the draw stubbed out, the run moved from step to step (seek to each step's
// start in turn, one frame apart) under the CPU profiler. Prints per-step frame JS and the hottest functions.
import { launch } from "/home/ubuntu/projects/explainer/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [page, out] = args;
const [w, h] = opt("size", "1440x900").split("x").map(Number), dpr = Number(opt("dpr", 2)), rounds = Number(opt("rounds", 3));
const SPOOF = `(() => { const R = 0x9246;
  for (const C of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) { if (!C) continue; const g = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { return p === R ? "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)" : g.call(this, p); }; }
  const raf = window.requestAnimationFrame.bind(window); window.__fr = [];
  window.requestAnimationFrame = (cb) => raf((ts) => { const t0 = performance.now(); cb(ts); if (window.__rec) window.__fr.push([performance.now() - t0, window.__internals?.frame?.step ?? -1]); });
})();`;
const browser = await launch();
try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  await s("Runtime.enable"); await s("Page.enable");
  await s("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: SPOOF });
  await s("Page.navigate", { url: pathToFileURL(resolve(page)).href });
  const ev = async (expression) => { const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  for (let k = 0; k < 900; k++) { if (await ev("!!(window.__internals && window.__ready && window.__gfx)").catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  await ev("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await ev(`(() => { const G = __gfx; G.render = () => {}; __internals.intro && __internals.intro(false); return true; })()`);
  const nSteps = await ev("__internals.timeline.steps.length");
  await new Promise((r) => setTimeout(r, 800));
  await s("Performance.enable");
  const m0 = Object.fromEntries((await s("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  await s("Profiler.enable"); await s("Profiler.setSamplingInterval", { interval: 100 }); await s("Profiler.start");
  await ev("window.__rec = true, true");
  await ev(`(async () => { const I = __internals, st = I.timeline.steps; const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let r = 0; r < ${rounds}; r++) for (let k = 0; k < st.length; k++) { I.seek(st[k].t0 + 0.02); await fr(); await fr(); await fr(); }
    return true; })()`);
  await ev("window.__rec = false, true");
  const prof = (await s("Profiler.stop")).profile;
  const m1 = Object.fromEntries((await s("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
  const fr = await ev("window.__fr");
  // per step: the frame that first shows it
  const per = []; for (let i = 1; i < fr.length; i++) if (fr[i][1] !== fr[i - 1][1]) per.push(fr[i][0]);
  const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(2); };
  const others = fr.filter((f, i) => i && f[1] === fr[i - 1][1]).map((f) => f[0]);
  // hottest functions (self time), labelled by the module's first export
  const label = new Map();
  const mod = (url) => { if (!label.has(url)) { const m = /export%20(?:function|class|const)%20(\w+)|export (?:function|class|const) (\w+)/.exec(url.slice(0, 20000)); label.set(url, m ? (m[1] || m[2]) : url.slice(0, 24)); } return label.get(url); };
  const byId = new Map(prof.nodes.map((n) => [n.id, n])), self = new Map(), total = new Map();
  const parent = new Map(); for (const n of prof.nodes) for (const c of n.children || []) parent.set(c, n.id);
  prof.samples.forEach((id, i) => {
    const us = prof.timeDeltas[i] || 0, n = byId.get(id);
    const k = `${n.callFrame.functionName || "(anon)"} [${mod(n.callFrame.url)}]`;
    self.set(k, (self.get(k) || 0) + us);
    const seen = new Set();
    for (let x = id; x != null; x = parent.get(x)) { const nn = byId.get(x); const kk = `${nn.callFrame.functionName || "(anon)"} [${mod(nn.callFrame.url)}]`; if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) || 0) + us); } }
  });
  const top = (m) => [...m.entries()].filter(([k]) => !/^\((program|idle|root|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, us]) => [+(us / 1000 / Math.max(1, per.length)).toFixed(2), k]);
  const gc = [...self.entries()].filter(([k]) => /garbage/.test(k)).reduce((a, [, v]) => a + v, 0);
  const res = { page, size: `${w}x${h}@${dpr}`, steps: nSteps, changes: per.length,
    stepChangeMs: { median: q(per, 0.5), p95: q(per, 0.95), max: q(per, 1), mean: +(per.reduce((a, b) => a + b, 0) / per.length).toFixed(2) },
    perChange: { layouts: +((m1.LayoutCount - m0.LayoutCount) / per.length).toFixed(2), layoutMs: +((m1.LayoutDuration - m0.LayoutDuration) * 1000 / per.length).toFixed(2), styles: +((m1.RecalcStyleCount - m0.RecalcStyleCount) / per.length).toFixed(2), styleMs: +((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000 / per.length).toFixed(2), scriptMs: +((m1.ScriptDuration - m0.ScriptDuration) * 1000 / per.length).toFixed(2) },
    otherFrameMs: { median: q(others, 0.5), p95: q(others, 0.95) }, gcMsPerChange: +(gc / 1000 / Math.max(1, per.length)).toFixed(2),
    selfMsPerChange: top(self), totalMsPerChange: top(total) };
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ perChange: res.perChange, changes: res.changes, stepChangeMs: res.stepChangeMs, otherFrameMs: res.otherFrameMs, gc: res.gcMsPerChange }));
} finally { browser.close(); }
