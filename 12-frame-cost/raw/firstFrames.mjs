// node firstFrames.mjs <page.html> [--size 390x844]: log the page's first 8 renders from navigation: start, CPU ms in
// render, gap to the next render, and whether each was a draft. Wraps __gfx.render the moment the page sets it.
import { launch } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "390x844").split("x").map(Number);
const HOOK = `(() => {
  window.__ff = []; let g;
  Object.defineProperty(window, "__gfx", { configurable: true, get: () => g, set: (v) => {
    g = v; const orig = v.render.bind(v);
    v.render = (dl, cam, o) => { const t0 = performance.now(); const r = orig(dl, cam, o);
      if (__ff.length < 8) __ff.push({ at: Math.round(t0), cpu: Math.round(performance.now() - t0), draft: !!(o && o.draft), drafted: !!v.stats().draft, kept: v.stats().mapsKept ?? null }); return r; };
  } });
})();`;
const browser = await launch();
try {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  await s("Runtime.enable"); await s("Page.enable");
  await s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  await s("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });
  await s("Page.navigate", { url: pathToFileURL(resolve(args[0])).href });
  await new Promise((r) => setTimeout(r, 12000));
  const r = await s("Runtime.evaluate", { expression: "JSON.stringify(window.__ff)", returnByValue: true });
  console.log(JSON.stringify({ page: args[0], size: `${w}x${h}`, frames: JSON.parse(r.result.value) }));
} finally { browser.close(); }
