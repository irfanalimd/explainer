// node measure.mjs <page.html> [--sizes 1440x900,390x844] [--secs 10] [--label x] [--query ?gfx=webgl2]
// time to first frame (file://), live fps while playing, settled render ms
import { launch } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const page = resolve(args[0]);
const sizes = opt("sizes", "1440x900,390x844").split(",").map((s) => s.split("x").map(Number));
const secs = Number(opt("secs", 10));
const query = opt("query", "");
const extra = opt("chrome", "").split(" ").filter(Boolean);
const url = pathToFileURL(page).href + query;
const browser = await launch({ args: extra });
const HOOK = `(() => {
  let v; window.__m = { };
  Object.defineProperty(window, "__ready", { configurable: true, get: () => v, set: (p) => { v = p; Promise.resolve(p).then(() => { window.__m.ready = performance.now(); }); } });
  const poll = () => { const g = globalThis.__gfx; if (g && g.stats && g.stats().ms > 0) { window.__m.first = performance.now(); return; } requestAnimationFrame(poll); };
  requestAnimationFrame(poll);
})();`;
const out = [];
try {
  for (const [w, h] of sizes) {
    const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
    const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (m, p) => browser.send(m, p, sessionId);
    const errors = [];
    browser.on((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description);
      if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    });
    await s("Runtime.enable"); await s("Page.enable");
    await s("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
    await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await s("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });
    await s("Page.navigate", { url });
    const ev = async (expression) => { const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
    for (let k = 0; k < 1200; k++) { const ok = await ev("!!(window.__m && window.__m.ready && window.__m.first)").catch(() => false); if (ok) break; await new Promise((r) => setTimeout(r, 50)); }
    const boot = await ev(`({ ready: Math.round(__m.ready), first: Math.round(__m.first), backend: __internals.stats().backend, dcl: Math.round(performance.getEntriesByType("navigation")[0]?.domContentLoadedEventEnd) })`);
    await ev("document.fonts.ready.then(() => true)");
    let live = null;
    if (secs > 0) live = await ev(`new Promise((done) => {
      const I = __internals; I.play(); I.setSpeed(0.5);
      const r0 = I.stats().renders, t0 = performance.now(); let n = 0;
      const f = () => { n++; const now = performance.now(); if (now - t0 < ${secs * 1000}) requestAnimationFrame(f); else {
        const st = I.stats(); I.pause(); done({ raf: +(n / ((now - t0) / 1000)).toFixed(2), fps: +((st.renders - r0) / ((now - t0) / 1000)).toFixed(2), renderMs: +st.ms.toFixed(1), held: I.held, step: I.frame.step, dpr: __gfx.size.dpr, W: __gfx.size.W }); } };
      requestAnimationFrame(f);
    })`);
    const settled = await ev(`(async () => { const I = __internals; I.freeze(true); const d = I.timeline.duration; const ms = [], wall = [];
      for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) { const t0 = performance.now(); await I.renderAt(d * f, { camera: "settled" }); wall.push(performance.now() - t0); ms.push(I.stats().ms); }
      const med = (a) => +a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(1);
      return { ms: med(ms), wall: med(wall), dpr: __gfx.size.dpr, W: __gfx.size.W }; })()`);
    out.push({ size: `${w}x${h}`, boot, live, settled, errors: errors.slice(0, 5) });
    await browser.send("Target.closeTarget", { targetId });
  }
} finally { browser.close(); }
console.log(JSON.stringify({ label: opt("label", args[0]), out }));
