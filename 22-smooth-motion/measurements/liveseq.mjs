// node liveseq.mjs <page.html> <outdir> [--size 1440x900] [--dpr 1] [--hover 1]: a live-camera sequence at fixed
// timestamps (renderAt with the director easing between them, as playback does), a screenshot after each, with the
// pointer resting over the world when --hover 1 (so the hover pick and its highlight are in the frames)
import { launch } from "/home/ubuntu/projects/explainer/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [page, outDir] = args;
const [w, h] = opt("size", "1440x900").split("x").map(Number), dpr = Number(opt("dpr", 1)), hover = opt("hover", "0") === "1";
mkdirSync(outDir, { recursive: true });
const browser = await launch();
try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  await s("Runtime.enable"); await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dpr, mobile: w < 600 });
  await s("Page.navigate", { url: pathToFileURL(resolve(page)).href });
  const ev = async (expression) => { const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  for (let k = 0; k < 900; k++) { if (await ev("!!(window.__internals && window.__ready && window.__gfx)").catch(() => false)) break; await new Promise((r) => setTimeout(r, 100)); }
  await ev("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await ev("(() => { __internals.intro && __internals.intro(false); __internals.freeze(true); return true; })()");
  if (hover) { await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(w * 0.3) - 2, y: Math.round(h * 0.45) }); await s("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(w * 0.3), y: Math.round(h * 0.45) }); }
  const D = await ev("__internals.timeline.duration");
  const ts = []; for (let k = 0; k < 10; k++) ts.push(+(D * (0.28 + k * 0.012)).toFixed(4));
  const ids = [];
  for (let i = 0; i < ts.length; i++) {
    ids.push(await ev(`(async () => { await __internals.renderAt(${ts[i]}); return __gfx.pick ? __gfx.pick(${Math.round(w * 0.3)}, ${Math.round(h * 0.45)}) : null; })()`));
    await new Promise((r) => setTimeout(r, 300));
    const { data } = await s("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${outDir}/live-${String(i).padStart(2, "0")}.png`, Buffer.from(data, "base64"));
  }
  console.log(JSON.stringify({ ts, ids }));
} finally { browser.close(); }
