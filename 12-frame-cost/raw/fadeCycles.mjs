// node fadeCycles.mjs <page.html> [--size 1440x900] [--cycles 6] [--play 3]: play MapReduce's first story from 30 % in,
// carrying on through holds, and pause every --play seconds. After each pause, log every frame drawn until the page
// rests (no frame for 2.5 s): how many, how many drafts, and how long each took (wall time between frames). Afterglows
// and pings fade on the render clock, so a fade takes the same number of frames either way; what changes is a frame's cost.
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const cycles = Number(opt("cycles", 6)), play = Number(opt("play", 3));
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr: 1 });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await p.evaluate(`(() => { const G = __gfx; window.__log = []; const orig = G.render.bind(G);
    G.render = (dl, cam, o) => { const r = orig(dl, cam, o); window.__log.push([performance.now(), !!G.stats().draft]); return r; };
    const I = __internals; I.intro?.(false); I.seek(I.timeline.duration * 0.3); return true; })()`);
  const out = [];
  for (let c = 0; c < cycles; c++) {
    await p.evaluate(`(() => { const I = __internals; I.play(); window.__carry = setInterval(() => { if (I.held && I.held.kind !== "end") I.play(); }, 100); return true; })()`);
    await new Promise((r) => setTimeout(r, play * 1000));
    out.push(await p.evaluate(`new Promise((done) => {
      clearInterval(window.__carry);
      const I = __internals, t0 = performance.now(), n0 = __log.length, busy = !!__gfx.busy; I.pause();
      let n = I.stats().renders, quiet = performance.now();
      const poll = () => { const m = I.stats().renders; if (m !== n) { n = m; quiet = performance.now(); }
        if (performance.now() - quiet > 2500) {
          const a = __log.slice(n0), gaps = a.map((x, i) => Math.round(x[0] - (i ? a[i - 1][0] : t0)));
          done({ busy, restMs: Math.round(quiet - t0), frames: a.length, drafts: a.filter((x) => x[1]).length, gaps, step: I.frame.step });
        } else setTimeout(poll, 50); };
      poll();
    })`));
  }
  const fade = out.filter((o) => o.frames > 2);
  const per = fade.flatMap((o) => o.gaps.slice(1, -1));   // frames after the pause's own, before the last
  const med = (v) => (v.length ? v.slice().sort((x, y) => x - y)[v.length >> 1] : null);
  console.log(JSON.stringify({ page: args[0], size: `${w}x${h}`, cycles: out, fadeRests: fade.length,
    medianFadeFrameMs: med(per), meanRestMs: fade.length ? Math.round(fade.reduce((s, o) => s + o.restMs, 0) / fade.length) : null,
    meanFrames: fade.length ? +(fade.reduce((s, o) => s + o.frames, 0) / fade.length).toFixed(1) : null }));
} finally { browser.close(); }
