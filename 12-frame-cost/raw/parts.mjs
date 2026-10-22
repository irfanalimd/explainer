// node parts.mjs <page.html> [--size 1440x900] [--secs 8]: live fps of MapReduce playing at 0.5x with parts of the frame
// switched off by the renderer's debug flags, to see where a frame's time goes. One page load per variant.
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const secs = Number(opt("secs", 8));
const variants = JSON.parse(opt("variants", JSON.stringify({
  all: {}, noShadowSample: { shadow: false }, noFloor: { skipFloor: true }, noSlabs: { skipSlabs: true }, noBloom: { skipBloom: true },
  noDraft: { draft: false },
})));
const browser = await launch();
const out = {};
try {
  for (const [name, flags] of Object.entries(variants)) {
    const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr: 1 });
    await p.waitFor("!!window.__internals", { timeout: 90000 });
    await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
    out[name] = await p.evaluate(`new Promise((done) => {
      Object.assign(__gfx.debug, ${JSON.stringify(flags)});
      const I = __internals; I.play(); I.setSpeed(0.5);
      setTimeout(() => {
        const r0 = I.stats().renders, t0 = performance.now();
        setTimeout(() => { const n = I.stats().renders - r0, s = (performance.now() - t0) / 1000; I.pause();
          done({ fps: +(n / s).toFixed(2), msCpu: +__gfx.stats().ms.toFixed(1), draft: !!__gfx.stats().draft, W: __gfx.size.W }); }, ${secs * 1000});
      }, 1500);
    })`);
    await p.close();
  }
} finally { browser.close(); }
console.log(JSON.stringify({ page: args[0], size: `${w}x${h}`, out }));
