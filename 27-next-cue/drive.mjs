// drive.mjs <page.html> <outdir> [--size 1440x900] [--dpr 2] [--theme light] [--moments open,play,chapter,ask,end,step] [--hover]
// Drives a built page live (not capture) to each moment a reader must act, and shoots it.
import "/home/ubuntu/tmp/explainer-perf/guide/next-cue/scripts/lib/websocket.mjs";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launch, openPage, urlFor } from "/home/ubuntu/tmp/explainer-perf/guide/next-cue/scripts/lib/cdp.mjs";

const args = process.argv.slice(2);
const opt = (n, f) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : f; };
const [page0, out] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [W, H] = opt("--size", "1440x900").split("x").map(Number);
const theme = opt("--theme", "light"), dpr = +opt("--dpr", 2);
const moments = opt("--moments", "open,play,chapter,ask,end,step").split(",");
const tag = opt("--tag", `${theme}-${W}x${H}`);
mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { url: u0, stop } = await urlFor(resolve(page0));
const url = `${u0}?theme=${theme}${opt("--query") ? `&${opt("--query")}` : ""}`;
const browser = await launch();
const log = (...a) => console.log(...a);
try {
  for (const m of moments) {
    const page = await openPage(browser, url, { width: W, height: H, dpr, onConsole: (t, x) => { if (t === "error" || t === "exception") log(`[${m}] ${t}: ${x}`); } });
    await page.waitFor("window.__internals && window.__internals.timeline", { timeout: 60000 });
    // every moment starts as a first visit: nothing remembered
    await page.evaluate("localStorage.clear(); location.reload(); 1");
    await sleep(800);
    await page.waitFor("window.__internals && window.__internals.timeline", { timeout: 60000 });
    await sleep(1500);
    const E = (js) => page.evaluate(js);
    await E(`window.__internals.setTheme(${JSON.stringify(theme)})`);
    const shot = async (name) => { await page.shot(`${out}/${name}-${tag}.png`); log(`${out}/${name}-${tag}.png`); };
    if (m === "open") { await sleep(1000); await shot("open"); }
    else if (m === "play" && 0) {}
    else if (m === "play") {
      // the start card dismissed (Esc / the scrim): the page waits on Play
      await E(`document.querySelector(".ix-intro-scrim")?.click()`); await sleep(+opt("--settle", 1800)); await shot("play");
    } else if (m === "step") {
      await E(`[...document.querySelectorAll(".ix-intro .ix-cta-2")].find(b => !b.hidden)?.click()`);
      // the step plays (slow on a machine without a GPU), then waits on Next
      log("step done", await page.waitFor(`document.querySelector(".ix-play")?.getAttribute("aria-label") === "Play" ? 1 : 0`, { timeout: 180000 }));
      await sleep(+opt("--settle", 2500)); await shot("step");
    } else {
      await E(`document.querySelector(".ix-intro .ix-cta")?.click()`); await sleep(500);
      const I = "window.__internals";
      if (m === "chapter") {
        await E(`${I}.pause(); ${I}.seek(${I}.timeline.phases[0].t1 - 0.25); ${I}.play()`);
        log("held", await page.waitFor(`${I}.held && JSON.stringify(${I}.held)`, { timeout: 90000 }));
      } else if (m === "ask") {
        const i = await E(`${I}.timeline.steps.findIndex(s => s.ask)`);
        log("ask step", i);
        await E(`${I}.pause(); ${I}.seek(Math.max(0, ${I}.timeline.steps[${i}].t0 - 0.25)); ${I}.play()`);
        log("asked", await page.waitFor(`document.querySelector(".ix-predict.ix-open") ? 1 : 0`, { timeout: 90000 }));
      } else if (m === "end") {
        await E(`${I}.pause(); ${I}.seek(${I}.timeline.duration - 0.25); ${I}.play()`);
        log("held", await page.waitFor(`${I}.held && ${I}.held.kind === "end" && JSON.stringify(${I}.held)`, { timeout: 90000 }));
      }
      await sleep(+opt("--settle", 1800));
      await shot(m);
    }
    await page.close();
  }
} finally {
  browser.close();
  stop();
}
