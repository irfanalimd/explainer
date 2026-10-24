// node pickstall.mjs <page.html> [--size 720x450] [--dpr 1] [--secs 20]: live play with the pointer resting over the
// world (a pointermove on the stage's centre), timing each pick() (a 1x1 draw plus a synchronous readPixels) and each
// render() call. A pick that takes far longer than its own 1x1 draw is the CPU waiting for the GPU's queued frame.
import { launch } from "/home/ubuntu/projects/explainer/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "720x450").split("x").map(Number), dpr = Number(opt("dpr", 1)), secs = Number(opt("secs", 20));
const SPOOF = `(() => { const R = 0x9246;
  for (const C of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) { if (!C) continue; const g = C.prototype.getParameter;
    C.prototype.getParameter = function (p) { return p === R ? "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)" : g.call(this, p); }; }
})();`;
const browser = await launch();
try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  const errs = [];
  browser.on((msg) => { if (msg.sessionId === sessionId && msg.method === "Runtime.exceptionThrown") errs.push(msg.params.exceptionDetails.exception?.description?.slice(0, 300)); if (msg.sessionId === sessionId && msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errs.push(msg.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300)); });
  await s("Runtime.enable"); await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: SPOOF });
  await s("Page.navigate", { url: pathToFileURL(resolve(args[0])).href });
  const ev = async (expression) => { const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  for (let k = 0; k < 900; k++) { if (await ev("!!(window.__internals && window.__ready && window.__gfx)").catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  await ev("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await ev(`(() => { const G = __gfx; window.__pk = []; window.__rd = [];
    const pk = G.pick?.bind(G), rd = G.render.bind(G);
    if (pk) G.pick = (...a) => { const t0 = performance.now(); const r = pk(...a); window.__pk.push(performance.now() - t0); return r; };
    G.render = (...a) => { const t0 = performance.now(); const r = rd(...a); window.__rd.push(performance.now() - t0); return r; };
    __internals.intro && __internals.intro(false); __internals.seek(__internals.timeline.duration * 0.3); __internals.setSpeed(1); __internals.play(); return !!pk; })()`);
  await new Promise((r) => setTimeout(r, 1500));
  // the pointer rests on the stage's centre
  await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(w * 0.35) - 3, y: Math.round(h * 0.5) });
  await new Promise((r) => setTimeout(r, 300));
  await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(w * 0.35), y: Math.round(h * 0.5) });
  await ev("(() => { window.__pk.length = 0; window.__rd.length = 0; return true; })()");
  await new Promise((r) => setTimeout(r, secs * 1000));
  const r = await ev(`(() => { const q = (a, p) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(1); };
    return { backend: __gfx.backend, picks: __pk.length, pickMs: { median: q(__pk, 0.5), p95: q(__pk, 0.95) }, renders: __rd.length, renderJsMs: { median: q(__rd, 0.5), p95: q(__rd, 0.95) } }; })()`);
  r.ahead = await ev("__gfx.stats().picksAhead ?? null"); r.statPicks = await ev("__gfx.stats().picks ?? null"); r.errors = errs.slice(0, 5);
  console.log(JSON.stringify(r));
} finally { browser.close(); }
