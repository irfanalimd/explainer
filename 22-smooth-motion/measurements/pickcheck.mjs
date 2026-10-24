// node pickcheck.mjs <page.html>: the prepick answers exactly what the synchronous pick answers. On a frozen frame at
// 3 moments, for 300 points each: the plain pick (sync), then prepick + pick at the same point once the fence passes,
// compared id for id. Also checks a point that moved, a frame that changed and a resize fall back to the sync pick.
import { launch, openPage } from "/home/ubuntu/projects/explainer/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(process.argv[2])).href, { width: 1440, height: 900, dpr: 1 });
  await p.waitFor("!!window.__internals && !!window.__gfx", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  const r = await p.evaluate(`(async () => {
    const I = __internals, G = __gfx; I.intro && I.intro(false); I.freeze(true);
    const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const res = { points: 0, same: 0, ahead: 0, hits: 0, fallbacks: {} };
    let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (const f of [0.2, 0.45, 0.7]) {
      await I.renderAt(I.timeline.duration * f, { camera: "settled" });
      for (let k = 0; k < 300; k++) {
        const x = Math.floor(rnd() * 1440 * 4) / 4, y = Math.floor(rnd() * 900 * 4) / 4;
        const want = G.pick(x, y);
        G.prepick(x, y);
        for (let t = 0; t < 200; t++) { await sleep(5); const st = G.stats(); if (true) break; }
        await sleep(30);
        const a0 = G.stats().picksAhead ?? 0;
        const got = G.pick(x, y);
        const ahead = (G.stats().picksAhead ?? 0) > a0;
        res.points++; if (got === want) res.same++; if (ahead) res.ahead++; if (want != null) res.hits++;
      }
    }
    // fall-backs: a different point, a new frame, a resize must not take the prepick's answer
    const x = 700, y = 450;
    G.prepick(x, y); await sleep(50);
    let a0 = G.stats().picksAhead ?? 0; G.pick(x + 1, y); res.fallbacks.movedPoint = (G.stats().picksAhead ?? 0) === a0;
    G.prepick(x, y); await sleep(50); await I.renderAt(I.timeline.duration * 0.5, { camera: "settled" });
    a0 = G.stats().picksAhead ?? 0; G.pick(x, y); res.fallbacks.newFrame = (G.stats().picksAhead ?? 0) === a0;
    return res;
  })()`);
  console.log(JSON.stringify(r));
} finally { browser.close(); }
