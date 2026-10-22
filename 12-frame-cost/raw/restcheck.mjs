// node restcheck.mjs <page.html> <out.png> [--size 1440x900]: play live a while, pause, seek to mid-run, wait until no
// frame is drawn for 3 s, screenshot. Prints how many frames were drafts and the canvas size at rest.
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr: 1 });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await p.evaluate(`(() => { const I = __internals, G = __gfx; window.__drafts = 0; window.__frames = 0;
    const orig = G.render.bind(G); G.render = (dl, cam, o) => { window.__frames++; if (o && o.draft) window.__drafts++; return orig(dl, cam, o); };
    I.play(); I.setSpeed(4); return true; })()`);
  await new Promise((r) => setTimeout(r, 8000));
  await p.shot(resolve(args[1]).replace(/\.png$/, "-playing.png"));
  const r = await p.evaluate(`new Promise((done) => {
    const I = __internals, G = __gfx;
    {
      I.pause(); I.seek(I.timeline.duration * 0.5);
      let n = I.stats().renders, quiet = performance.now();
      const poll = () => { const m = I.stats().renders; if (m !== n) { n = m; quiet = performance.now(); }
        if (performance.now() - quiet > 3000) done({ frames: window.__frames, drafts: window.__drafts, draftNow: !!G.stats().draft, size: G.size, step: I.frame.step });
        else setTimeout(poll, 100); };
      poll();
    }
  })`);
  await p.shot(resolve(args[1]));
  console.log(JSON.stringify(r));
} finally { browser.close(); }
