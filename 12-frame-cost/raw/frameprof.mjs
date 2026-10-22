// node frameprof.mjs <page.html> [--at 0.9999] [--n 5]: CPU profile of settled renderAt at a time; prints stats.ms and top self times
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const at = Number(opt("at", 0.9999)), n = Number(opt("n", 5));
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: 1440, height: 900, dpr: 1 });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await p.evaluate(`(async () => { const I = __internals; I.freeze(true); await I.renderAt(I.timeline.duration * ${at}); await I.renderAt(I.timeline.duration * ${at} - 0.5); return true; })()`);
  await p.send("Profiler.enable"); await p.send("Profiler.setSamplingInterval", { interval: 100 }); await p.send("Profiler.start");
  const ms = await p.evaluate(`(async () => { const I = __internals, out = []; for (let k = 0; k < ${n}; k++) { await I.renderAt(I.timeline.duration * ${at} - (k % 2) * 0.3); out.push(+I.stats().ms.toFixed(1)); } return out; })()`);
  const { profile } = await p.send("Profiler.stop");
  const byId = new Map(profile.nodes.map((x) => [x.id, x]));
  const self = new Map();
  profile.samples.forEach((id, i) => { const x = byId.get(id); const k = `${x.callFrame.functionName || "(anon)"}:${x.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + (profile.timeDeltas[i + 1] ?? 0)); });
  console.log("stats.ms", ms.join(" "));
  console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${(us / 1000 / n).toFixed(1).padStart(7)} ms/frame  ${k}`).join("\n"));
} finally { browser.close(); }
