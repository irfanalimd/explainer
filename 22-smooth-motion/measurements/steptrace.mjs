// node steptrace.mjs <page.html> <out.json> [--size 1440x900] [--dpr 2] [--rounds 2]
// A devtools timeline trace of step changes (draw stubbed, seek step to step): every style recalc (UpdateLayoutTree)
// and layout, with the elements it touched and the JS function that forced it, summed per step change.
import { launch } from "/home/ubuntu/projects/explainer/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [page, out] = args;
const [w, h] = opt("size", "1440x900").split("x").map(Number), dpr = Number(opt("dpr", 2)), rounds = Number(opt("rounds", 2));
const SPOOF = `(() => { const R = 0x9246;
  for (const C of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) { if (!C) continue; const g = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { return p === R ? "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)" : g.call(this, p); }; }
})();`;
const browser = await launch();
try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  const events = [];
  let done;
  const finished = new Promise((r) => (done = r));
  browser.on((msg) => {
    if (msg.method === "Tracing.dataCollected") events.push(...msg.params.value);
    if (msg.method === "Tracing.tracingComplete") done();
  });
  await s("Runtime.enable"); await s("Page.enable");
  await s("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: SPOOF });
  await s("Page.navigate", { url: pathToFileURL(resolve(page)).href });
  const ev = async (expression) => { const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  for (let k = 0; k < 900; k++) { if (await ev("!!(window.__internals && window.__ready && window.__gfx)").catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  await ev("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await ev(`(() => { __gfx.render = () => {}; __internals.intro && __internals.intro(false); return true; })()`);
  const nSteps = await ev("__internals.timeline.steps.length");
  await new Promise((r) => setTimeout(r, 800));
  // the session's own tracing (browser-level domain)
  await browser.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", "v8"] }, transferMode: "ReportEvents" }, sessionId);
  await ev(`(async () => { const I = __internals, st = I.timeline.steps; const fr = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let r = 0; r < ${rounds}; r++) for (let k = 0; k < st.length; k++) { I.seek(st[k].t0 + 0.02); await fr(); await fr(); await fr(); }
    return true; })()`);
  await browser.send("Tracing.end", {}, sessionId);
  await finished;
  const changes = rounds * nSteps;
  const pick = (e) => {
    const st = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace;
    if (!st || !st.length) return "(frame end: not forced)";
    return st.slice(0, 3).map((f) => f.functionName || "(anon)").join(" < ");
  };
  const agg = new Map();
  let styleMs = 0, layoutMs = 0, nStyle = 0, nLayout = 0;
  for (const e of events) {
    if (e.ph !== "X" || !(e.name === "UpdateLayoutTree" || e.name === "Layout")) continue;
    const ms = (e.dur || 0) / 1000;
    const k = `${e.name}: ${pick(e)}`;
    const a = agg.get(k) || { n: 0, ms: 0, elements: 0 };
    a.n++; a.ms += ms; a.elements += e.args?.elementCount ?? e.args?.beginData?.dirtyObjects ?? 0; agg.set(k, a);
    if (e.name === "Layout") { layoutMs += ms; nLayout++; } else { styleMs += ms; nStyle++; }
  }
  const rows = [...agg.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 25).map(([k, a]) => ({ k, perChange: +(a.ms / changes).toFixed(2), n: +(a.n / changes).toFixed(2), elements: Math.round(a.elements / a.n) }));
  const res = { page, size: `${w}x${h}@${dpr}`, changes, perChange: { styleMs: +(styleMs / changes).toFixed(2), styles: +(nStyle / changes).toFixed(2), layoutMs: +(layoutMs / changes).toFixed(2), layouts: +(nLayout / changes).toFixed(2) }, rows };
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res.perChange));
  for (const r of rows) console.log(String(r.perChange).padStart(6), "ms", String(r.n).padStart(5), "x", String(r.elements).padStart(5), "el ", r.k);
} finally { browser.close(); }
