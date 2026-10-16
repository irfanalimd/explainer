#!/usr/bin/env node
// Minimal headless-Chrome screenshot, WebGL on. For quick looks during development.
//   node scripts/snap.mjs <url-or-path> --out shot.png [--size 1440x900] [--dpr 2] [--wait 1500] [--eval "js"] [--theme light]
// A path inside the skill folder is served over http automatically (ES modules need http).
// The page may define window.__ready (a Promise); snap waits for it, then for --wait ms.
// Console errors and exceptions from the page are printed, and make the exit code 1.
import "./lib/websocket.mjs";                // Node 20/21: re-run with --experimental-websocket
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch, openPage, urlFor, CHROME } from "./lib/cdp.mjs";

export { launch, openPage, urlFor, CHROME };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (n, f) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : f; };
  const target = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  if (!target) { console.error("usage: snap.mjs <url-or-path> --out shot.png [--size 1440x900] [--dpr 2] [--wait ms] [--eval js]"); process.exit(2); }
  const [width, height] = opt("--size", "1440x900").split("x").map(Number);
  const out = resolve(opt("--out", "shot.png"));
  let url, stop;
  ({ url, stop } = await urlFor(target));
  if (opt("--theme")) url += (url.includes("?") ? "&" : "?") + "theme=" + opt("--theme");
  const browser = await launch();
  let bad = 0;
  try {
    const page = await openPage(browser, url, {
      width, height, dpr: Number(opt("--dpr", 2)),
      onConsole: (type, text) => { if (type === "error" || type === "exception" || type === "network") bad++; console.log(`[${type}] ${text}`); },
    });
    await page.evaluate("window.__ready ? Promise.resolve(window.__ready).then(() => true) : true").catch((e) => { bad++; console.log("[ready] " + e.message); });
    if (opt("--eval")) console.log("[eval]", JSON.stringify(await page.evaluate(opt("--eval"))));
    await new Promise((r) => setTimeout(r, Number(opt("--wait", 800))));
    await page.shot(out);
    console.log(out);
  } finally {
    browser.close();
    stop();
  }
  process.exit(bad ? 1 : 0);
}
