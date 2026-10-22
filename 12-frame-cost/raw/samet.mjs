// node samet.mjs <page.html> [--size 1440x900] [--at 0.5]: draw the same moment five times (frozen, settled camera) and a
// camera-only change, timing each to pixels on screen (a 1 px readPixels after render). Prints ms and maps kept.
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const at = Number(opt("at", 0.5));
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr: 1 });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  const r = await p.evaluate(`(async () => {
    const I = __internals, G = __gfx; I.freeze(true);
    const gl = document.querySelector("canvas").getContext("webgl2");
    const px = new Uint8Array(4);
    const one = async (t) => { const t0 = performance.now(); await I.renderAt(t, { camera: "settled" }); gl && gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return { ms: Math.round(performance.now() - t0), kept: G.stats().mapsKept ?? null }; };
    const t = I.timeline.duration * ${at}, out = [];
    for (let k = 0; k < 5; k++) out.push(await one(t));
    return { backend: I.stats().backend, out };
  })()`);
  console.log(JSON.stringify({ page: args[0], size: `${w}x${h}`, at, ...r }));
} finally { browser.close(); }
