// node liveseq.mjs <page.html> <outdir> [--size 1440x900] [--dpr 1] [--from 40] [--step 0.25] [--n 24] [--scenario id]
// A live sequence without the wall clock: renderAt at fixed moments with the camera's springs stepping between them
// (camera "live", not "settled"), so pings, afterglow and camera moves play as in live play, deterministically.
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-adf37f8c0bb64291b/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const dpr = Number(opt("dpr", 1)), from = Number(opt("from", 40)), step = Number(opt("step", 0.25)), n = Number(opt("n", 24));
const out = resolve(args[1]); mkdirSync(out, { recursive: true });
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  const sc = opt("scenario", null);
  if (sc) await p.evaluate(`__internals.setScenario ? __internals.setScenario(${JSON.stringify(sc)}) : null`);
  await p.evaluate(`(async () => { __internals.intro && __internals.intro(false); await __internals.renderAt(${from}, { camera: "settled" }); return true; })()`);
  for (let i = 0; i < n; i++) {
    const t = from + (i + 1) * step;
    await p.evaluate(`__internals.renderAt(${t}, { camera: "live" }).then(() => true)`);
    await p.shot(join(out, `f${String(i).padStart(2, "0")}.png`));
  }
  console.log(JSON.stringify({ frames: n, from, step }));
} finally { browser.close(); }
