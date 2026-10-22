// node handout.mjs <page.html> <outDir> [--size 1440x900] [--profile]: time the handout's pictures, save them as JPEGs
import { launch, openPage } from "/home/ubuntu/projects/explainer/.claude/worktrees/agent-a8d9d5a2b01cb2ea5/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const [w, h] = opt("size", "1440x900").split("x").map(Number);
const out = resolve(args[1]);
mkdirSync(out, { recursive: true });
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(args[0])).href, { width: w, height: h, dpr: 1 });
  await p.waitFor("!!window.__internals", { timeout: 60000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await p.evaluate("__internals.intro(false), true");
  await p.evaluate("new Promise((r) => setTimeout(() => r(true), 3000))");
  const prof = args.includes("--profile");
  if (prof) { await p.send("Profiler.enable"); await p.send("Profiler.setSamplingInterval", { interval: 500 }); await p.send("Profiler.start"); }
  const r = await p.evaluate(`new Promise((done) => {
    const t0 = performance.now(), marks = [];
    const status = () => document.querySelector(".ix-ho-status")?.textContent ?? "";
    let lastS = "";
    const btn = [...document.querySelectorAll("button.ix-pill")].find((b) => b.textContent.trim() === "Handout"); for (let e = btn; e; e = e.parentElement) e.removeAttribute("inert"); btn.click();
    if (!document.querySelector(".ix-handout.ix-open")) { done({ ms: -1, marks: [], imgs: [], why: "not open" }); return; }
    const poll = () => {
      const s = status(); if (s !== lastS) { marks.push([Math.round(performance.now() - t0), s]); lastS = s; }
      const el = document.querySelector(".ix-handout");
      if (el && !el.classList.contains("ix-ho-busy") && performance.now() - t0 > 200) {
        const imgs = [...el.querySelectorAll("img")].map((i) => i.src).filter((s) => s.startsWith("data:image"));
        done({ ms: Math.round(performance.now() - t0), marks, imgs });
      } else setTimeout(poll, 20);
    };
    poll();
  })`);
  if (prof) {
    const { profile } = await p.send("Profiler.stop");
    writeFileSync(join(out, "handout.cpuprofile"), JSON.stringify(profile));
    // self time by function
    const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const dt = profile.timeDeltas; const counts = new Map();
    profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) ?? 0) + (dt[i] ?? 0)));
    for (const [id, us] of counts) { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.slice(-40)}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + us); }
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, us]) => `${(us / 1000).toFixed(0).padStart(7)} ms  ${k}`).join("\n"));
  }
  r.imgs.forEach((src, i) => writeFileSync(join(out, `pic-${i}.jpg`), Buffer.from(src.split(",")[1], "base64")));
  console.log(JSON.stringify({ ms: r.ms, pictures: r.imgs.length, marks: r.marks, errors: p.errors.slice(0, 5) }));
  await p.close();
} finally { browser.close(); }
