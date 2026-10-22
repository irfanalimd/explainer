// node playShot.mjs <page.html> <out.png> [--size 1440x900] [--at 0.45]: seek to --at of the run, play at 0.5x
// (carrying on through holds) for 6 s and screenshot the frame on screen while it plays (a draft without a GPU).
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const at = Number(opt("at", 0.45));
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr: 1 });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await p.evaluate(`(() => { const I = __internals; I.intro?.(false); I.seek(I.timeline.duration * ${at}); I.play(); I.setSpeed(0.5);
    window.__carry = setInterval(() => { if (I.held && I.held.kind !== "end") I.play(); }, 100); return true; })()`);
  await new Promise((r) => setTimeout(r, 6000));
  const s = await p.evaluate("({ draft: !!__gfx.stats().draft, step: __internals.frame.step, W: __gfx.size.W })");
  await p.shot(resolve(args[1]));
  console.log(JSON.stringify({ page: args[0], size: `${w}x${h}`, ...s }));
} finally { browser.close(); }
