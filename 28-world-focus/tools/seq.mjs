// node seq.mjs <page> <out dir> <prefix> <step> [dpr]: live-camera frames across the start of a step, as playing draws
// them (renderAt with camera "live" from 1 s before, 1/30 s apart), saving 5 of them: -0.05, +0.15, +0.3, +0.55, +1.0 s
import { launch, openPage } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const [page, out, prefix, step, dpr = "2"] = process.argv.slice(2);
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(page)).href, { width: 1440, height: 900, dpr: Number(dpr) });
  await p.waitFor("!!window.__internals", { timeout: 120000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  const t0 = await p.evaluate(`(async () => { const I = __internals; I.intro && I.intro(false); const t0 = I.timeline.steps[${Number(step)}].t0;
    await I.renderAt(t0 - 1, { camera: "settled" }); return t0; })()`);
  const keep = [-0.05, 0.15, 0.3, 0.55, 1.0];
  for (let t = t0 - 1; t <= t0 + 1.0 + 1e-6; t += 1 / 30) {
    await p.evaluate(`__internals.renderAt(${t}, { camera: "live" }).then(() => true)`);
    const k = keep.findIndex((d) => Math.abs(t - (t0 + d)) < 1 / 60);
    if (k >= 0) { await p.shot(resolve(out, `${prefix}-${k}.png`)); console.log(JSON.stringify({ k, dt: +(t - t0).toFixed(3) })); }
  }
} finally { browser.close(); }
