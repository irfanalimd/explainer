// node fadeRest.mjs <page.html> <out.png> [--size 1440x900] [--play 6]: play the first story at 1x for --play seconds,
// pause, and time how long the page keeps drawing (afterglows and pings fading, the camera easing) until it rests:
// no frame for 3 s. Prints the wall time to rest, frames and drafts drawn after the pause; shoots the resting frame.
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const play = Number(opt("play", 6));
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr: 1 });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await p.evaluate(`(() => { const G = __gfx; window.__log = []; const orig = G.render.bind(G);
    G.render = (dl, cam, o) => { const t0 = performance.now(); const r = orig(dl, cam, o); window.__log.push([t0, !!G.stats().draft]); return r; };
    const I = __internals; I.intro?.(false); I.seek(I.timeline.duration * 0.3); I.play();
    // carry on through chapter pauses and questions' holds, so the run really plays
    window.__carry = setInterval(() => { if (I.held && I.held.kind !== "end") I.play(); }, 100); return true; })()`);
  await new Promise((r) => setTimeout(r, play * 1000));
  await p.evaluate("clearInterval(window.__carry), true");
  const r = await p.evaluate(`new Promise((done) => {
    const I = __internals; const t0 = performance.now(); const n0 = __log.length, stepAt = I.frame.step, played = n0, busy0 = !!__gfx.busy; I.pause();
    let n = I.stats().renders, quiet = performance.now();
    const poll = () => { const m = I.stats().renders; if (m !== n) { n = m; quiet = performance.now(); }
      if (performance.now() - quiet > 3000) { const after = __log.slice(n0);
        done({ stepAt, played, busy0, restMs: Math.round(quiet - t0), frames: after.length, drafts: after.filter((x) => x[1]).length, lastDraft: after.length ? after[after.length - 1][1] : null,
          t: +I.frame.t?.toFixed?.(2) || null, step: I.frame.step, W: __gfx.size.W }); }
      else setTimeout(poll, 50); };
    poll();
  })`);
  await p.shot(resolve(args[1]));
  console.log(JSON.stringify({ page: args[0], size: `${w}x${h}`, ...r }));
} finally { browser.close(); }
