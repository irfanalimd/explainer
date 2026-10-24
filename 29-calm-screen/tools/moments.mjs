// node moments.mjs <page.html> <outdir> <name> [WxH] [theme] [dpr]: open / mid / end as a reader sees them, plus counts
import { launch, openPage } from "/home/ubuntu/tmp/explainer-perf/guide/calm-screen/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
const [page, outdir, name, size = "1440x900", theme = "light", dpr = "2"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
mkdirSync(outdir, { recursive: true });
const COUNT = `(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
    if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return false;
    for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false; }
    // clipped by a scrolling ancestor
    for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e);
      if (/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX)) { const p = e.getBoundingClientRect(); if (r.bottom <= p.top + 1 || r.top >= p.bottom - 1) return false; } }
    return true; };
  const ctrls = [...document.querySelectorAll("button, a[href], input, select, [role=button], [role=tab], [role=radio], [role=slider], summary")].filter(vis);
  const texts = [...document.querySelectorAll("p, h1, h2, h3, h4, li, dt, dd, label, figcaption")].filter((e) => vis(e) && e.textContent.trim() && !e.querySelector("p, li, h1, h2, h3"));
  const words = texts.reduce((n, e) => n + e.textContent.trim().split(/\\s+/).length, 0);
  // the loudest text: leaf text in the full ink (the strongest of the four), and colour chips outside the world
  const probe = document.createElement("span"); probe.style.color = "var(--ix-ink)"; document.querySelector(".ix").append(probe);
  const ink = getComputedStyle(probe).color; probe.remove();
  const leaves = [...document.querySelectorAll(".ix *")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && vis(e));
  const loud = leaves.filter((e) => getComputedStyle(e).color === ink);
  const chips = [...document.querySelectorAll(".ix .ix-key")].filter(vis).length;
  return { controls: ctrls.length, texts: texts.length, words, leaves: leaves.length, loud: loud.length, chips,
    loudText: loud.map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 24)), ctrlNames: ctrls.map((c) => (c.getAttribute("aria-label") || c.textContent || c.className).trim().replace(/\\s+/g, " ").slice(0, 30)) };
})()`;
const url = pathToFileURL(resolve(page)).href + (theme === "dark" ? "?theme=dark" : "");
const browser = await launch();
const out = {};
try {
  const p = await openPage(browser, url, { width, height, dpr: Number(dpr) });
  await p.waitFor("!!window.__internals", { timeout: 90000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  if (theme === "dark") await p.evaluate(`(() => { __internals.setTheme("dark"); return true; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  await p.shot(resolve(outdir, `${name}-${size}-${theme}-open.png`));
  out.open = await p.evaluate(COUNT);
  // mid: start playing as a reader would (closes the intro), then go to the middle step, paused
  const moments = await p.evaluate(`(() => { const I = __internals; const n = I.timeline.steps.length; const m = I.timeline.steps[Math.floor(n * 0.45)];
    return { mid: (m.t0 + (m.t1 ?? m.t0 + 1)) / 2, end: I.timeline.duration }; })()`);
  await p.evaluate(`(async () => { __internals.play(); await new Promise(r => setTimeout(r, 1200)); __internals.pause(); __internals.seek(${moments.mid}); return true; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  await p.shot(resolve(outdir, `${name}-${size}-${theme}-mid.png`));
  out.mid = await p.evaluate(COUNT);
  // playing: the same moment, the story running (the chrome's quiet state)
  await p.evaluate(`(async () => { __internals.play(); return true; })()`);
  await new Promise((r) => setTimeout(r, 1500));
  await p.shot(resolve(outdir, `${name}-${size}-${theme}-playing.png`));
  out.playing = await p.evaluate(COUNT);
  await p.evaluate(`(async () => { __internals.pause(); return true; })()`);
  await p.evaluate(`(async () => { __internals.seek(${moments.end}); return true; })()`);
  await new Promise((r) => setTimeout(r, 3000));
  await p.shot(resolve(outdir, `${name}-${size}-${theme}-end.png`));
  out.end = await p.evaluate(COUNT);
} finally { browser.close(); }
writeFileSync(resolve(outdir, `${name}-${size}-${theme}.json`), JSON.stringify(out, null, 1));
console.log(name, size, theme, Object.entries(out).map(([k, v]) => `${k}: ${v.controls} controls, ${v.leaves} text items, ${v.loud} in full ink, ${v.chips} chips, ${v.words} words`).join(" | "));
