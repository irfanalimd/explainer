#!/usr/bin/env node
// Deterministic screenshots of a figure page through window.__internals (freeze + renderAt, settled camera),
// across themes, sizes and scenarios, plus a contact sheet. Reports page errors and audit problems per shot.
// --teach also plays the page live to catch what frozen capture never shows: each predict card (asked, then revealed
// with its why), each in-world pick (a wrong pick's branch held on its consequence, then the right pick with its why)
// and the end card with the recap, the takeaway and the what-ifs.
import "./lib/websocket.mjs";                // Node 20/21: re-run with --experimental-websocket
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { launch } from "./lib/cdp.mjs";
import { resolveTarget, openFigure, shotTimes, plainCaption, clip, groupFindings, findingLine } from "./lib/figure-page.mjs";
import { parseArgs, parseSize, isMain, showPath } from "./lib/args.mjs";

const USAGE = `
usage: node scripts/shoot.mjs <page.html | figure.mjs | url> [options]
  --at <what>          phases (default): mid and end of every phase
                       all: mid and end of every step;  steps: end of every step
                       a list: step indices (mid + end), times like 4.5s, or end   e.g. --at 0,7,12.5s,end
  --themes <list>      dark,light (default both)
  --sizes <list>       1440x900,390x844 (default); presets: desktop, phone, 1080p, vertical, square
  --scenario <id|all>  scenario to shoot (default: all)
  --out <dir>          output directory (default: shots/ next to the page)
  --dpr <n>            device pixel ratio (default 1; use 2 to judge text crispness)
  --camera <mode>      settled (default) | auto
  --runtime <file>     runtime for a figure-module target (default engine/runtime.mjs)
  --teach              also play the page live and shoot every predict card (asked, then revealed with its why),
                       every pick (a wrong pick's detour, then the right pick) and the end card (recap, takeaway,
                       what-ifs), in every theme, size and scenario
  --clean              delete existing PNGs in the output directory first
  --no-sheet           skip the contact sheet
  --quiet              no progress lines on stderr
  --at none            no phase shots (with --teach: the teaching cards only)
Files: <scenario>-<theme>-<w>x<h>-<step>-<mid|end|tN.NNs>.png, contact.png (contact-2.png… when long).
--teach adds <scenario>-<theme>-<w>x<h>-<step>-ask.png and -why.png per question, -wrong.png and -right.png per
pick, and at the last step -check.png (the first end-check question, answered), -check-done.png ("You can now…")
and -end-card.png (the recap, takeaway and what-ifs; narrow screens: -end-caption.png too, the caption before the card opens).
On a slow machine the live play paces itself by the page's measured frame time (it says so on stderr).
`;

export async function shoot(target, o = {}) {
  const sizes = (o.sizes ?? ["1440x900", "390x844"]).map(parseSize);
  const themes = o.themes ?? ["dark", "light"];
  const t = await resolveTarget(target, { runtime: o.runtime });
  const outDir = resolve(o.out ?? (t.built ? "shots" : join(dirname(resolve(target)), "shots")));
  mkdirSync(outDir, { recursive: true });
  if (o.clean) for (const f of readdirSync(outDir)) if (f.endsWith(".png")) rmSync(join(outDir, f));
  const browser = await launch();
  const shots = [], problems = [], errors = [];
  let title = "";
  try {
    for (const size of sizes) {
      const fp = await openFigure(browser, t.url, { ...size, dpr: o.dpr ?? 1 });
      const list = (await fp.scenarios()) ?? [];
      title ||= await fp.page.evaluate("document.title").catch(() => "");
      let ids = !o.scenario || o.scenario === "all" ? (list.length ? list.map((s) => s.id) : ["default"]) : [o.scenario];
      if (o.scenario && o.scenario !== "all" && list.length && !list.some((s) => s.id === o.scenario)) throw new Error(`no scenario "${o.scenario}"; the figure has: ${list.map((s) => s.id).join(", ")}`);
      if (!ids.length) ids = ["default"];
      for (const id of ids) {
        if (o.scenario || list.length > 1) if (id !== "default") await fp.setScenario(id);
        const info = await fp.info();
        const times = o.at === "none" ? [] : shotTimes(info, o.at ?? "phases");
        for (const theme of themes) {
          const g0 = Date.now();
          await fp.setTheme(theme);
          await fp.freeze();
          await fp.still();
          for (const s of times) {
            const errBefore = fp.errors.length;
            const r = await fp.renderAt(s.t, o.camera ?? "settled");
            const name = `${id}-${theme}-${size.width}x${size.height}-${String(s.step).padStart(3, "0")}-${s.tag}.png`;
            await fp.page.shot(join(outDir, name));
            const audit = await fp.audit().catch((e) => [{ kind: "audit-error", message: e.message }]);
            const caption = r?.caption ?? info.steps[s.step]?.caption ?? "";
            shots.push({ file: name, scenario: id, theme, size, step: s.step, tag: s.tag, t: s.t, phase: s.phase, caption });
            for (const p of audit) problems.push({ ...p, shot: name, step: p.step ?? s.step, caption });
            for (const e of fp.errors.slice(errBefore)) errors.push({ ...e, shot: name, step: s.step });
          }
          if (times.length) o.progress?.(`shot ${size.width}x${size.height} ${id} ${theme}: ${times.length} frames (${((Date.now() - g0) / 1000).toFixed(0)} s)`);
        }
      }
      for (const e of fp.errors) if (!errors.some((x) => x.text === e.text)) errors.push({ ...e, shot: `boot ${size.width}x${size.height}` });
      await fp.close();
      if (o.teach) await teachShots(browser, t.url, size, { ...o, themes, outDir, shots, errors });
    }
    let sheets = [];
    if (o.sheet !== false && shots.length) sheets = await contactSheet(browser, outDir, shots, title || t.name);
    return { outDir, shots, sheets, problems, errors };
  } finally {
    browser.close();
    t.stop();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Live playback, on a page of its own: frozen capture drops pauses and predictions, so play to each question, shoot it
// asked, pick the first wrong option (the card then shows the wrong pick, the right answer and the why), play until it
// is revealed, shoot again. For each pick (s.choose): play to it, pick the first wrong option, let its branch play to
// its consequence (fast) and shoot the detour; rewind, pick the right one and shoot its why. Then play into the end,
// answer the end check through to "You can now…" and shoot the end card. Every wait has a timeout: a step that never
// comes is reported and the run moves on. A question in a story's shared opening is shot once per theme and size, not
// again for every story that repeats it.
//
// On a slow machine (software rendering, a busy CPU) the page plays slower than real time: the runtime advances the run
// by at most 1/20 s a frame (engine/runtime.mjs), so at 300 ms a frame one second of the run takes six. So the pass
// measures the page's frame time first and paces itself by it: the run plays at `slow`× while it travels to the next
// card (real time again, on screen), every timeout stretches by `slow`, and a card is shot once the page has stopped
// drawing (the camera at rest) rather than after a fixed wait. A page that draws at 20 fps or better gets slow = 1:
// the same speeds, waits and shots as before.
async function teachShots(browser, url, size, o) {
  const fp = await openFigure(browser, url, { ...size, dpr: o.dpr ?? 1 });
  // no call may hang the run: a page that stops answering is an error, not a stuck job holding a Chrome
  let slow = 1;
  const ev = (js) => fp.page.evaluate(js, { timeout: 45000 * slow });
  const pace = await framePace(ev);
  slow = pace.slow;
  const waitFor = async (js, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms * slow) { if (await ev(js)) return true; await sleep(80); } return false; };
  const renders = () => ev("__internals.stats().renders ?? 0");
  // panel fades and camera springs come to rest: 1.4 s, and on a slow page until it stops drawing
  const settle = async () => {
    await sleep(1400);
    if (slow <= 1) return;
    // until a frame's time passes without a new frame (the page draws only while something moves), at most 8 frames
    const end = Date.now() + Math.min(1400 * slow, 8 * pace.ms);
    let last = await renders();
    while (Date.now() < end) { await sleep(Math.max(150, pace.ms * 1.1)); const n = await renders(); if (n === last) break; last = n; }
  };
  const travel = (x = 1) => ev(`__internals.setSpeed(${x * slow}), true`);
  const tag = (id, theme) => `${id}-${theme}-${size.width}x${size.height}`;
  const say = (msg) => o.progress?.(`teach ${size.width}x${size.height} ${msg}`);
  if (slow > 1) say(`the page draws a frame in ${pace.ms.toFixed(0)} ms, so it plays ${(pace.ms / 50).toFixed(1)}× slower than real time: travelling at ${slow.toFixed(1)}× and stretching every wait as much${pace.ms / 50 > slow ? " (the most it paces by)" : ""}`);
  // a pick: the wrong one's detour held on its consequence, then (rewound) the right one with its why
  const pickOpen = `(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play(); return !!document.querySelector(".ix-predict.ix-open .ix-turn-picks"); })()`;
  const click = (pick) => ev(`(() => { const b = document.querySelector('.ix-predict.ix-open .ix-turn-pick[data-pick="${pick}"]'); b && b.click(); return !!b; })()`);
  async function pickShots(c, base, { id, theme }) {
    const fail = (text) => o.errors.push({ type: "teach", text: `the pick at step ${c.step} ${text}`, shot: base, step: c.step });
    const entry = (file, tg, caption) => ({ file, scenario: id, theme, size, step: c.step, tag: tg, t: c.t0, phase: c.phase, caption });
    const wrong = c.picks.find((_, j) => j !== c.answer), right = c.picks[c.answer];
    await travel();
    await ev(`(() => { __internals.seek(Math.max(0, ${c.t0} - 0.25)); __internals.play(); return true; })()`);
    if (!(await waitFor(pickOpen, 15000))) return fail("never opened");
    if (wrong != null) {
      await click(wrong);
      await sleep(600);
      await travel(4);
      const held = await waitFor(`!!(__internals.timeline.branch && __internals.held && document.querySelector(".ix-predict.ix-open:not(.ix-locked)"))`, 30000);
      await ev("__internals.setSpeed(1), true");
      if (!held) { fail("never held its wrong branch's consequence"); return leaveBranch(); }
      await settle();
      await fp.page.shot(join(o.outDir, `${base}-wrong.png`));
      o.shots.push(entry(`${base}-wrong.png`, "wrong", c.caption));
      // the transport's one way on rewinds the branch to the pick, which opens again
      await travel();
      await ev(`(() => { const b = document.querySelector(".ix-play"); b && b.click(); return true; })()`);
      if (!(await waitFor(`!__internals.timeline.branch && ${pickOpen}`, 15000))) { fail("never came back from its branch"); return leaveBranch(); }
    }
    await click(right);
    const revealed = await waitFor(`!!document.querySelector(".ix-predict.ix-open.ix-revealed")`, 10000);
    await ev("__internals.pause(), __internals.setSpeed(1), true");
    if (!revealed) return fail("never revealed the right pick");
    await settle();
    await fp.page.shot(join(o.outDir, `${base}-right.png`));
    o.shots.push(entry(`${base}-right.png`, "right", c.prompt));
  }
  // never leave the page in a branch (the end card belongs to the main run): scrubbing back before the pick leaves it
  async function leaveBranch() {
    await ev("(() => { const I = __internals; I.pause(); I.setSpeed(1); I.seek(0); return true; })()");
    if (!(await waitFor("!__internals.timeline.branch", 5000))) o.errors.push({ type: "teach", text: "the page stayed in a branch of the run", shot: "teach" });
  }
  // the end check (engine/hud/check.mjs): the first question answered with a wrong option (its feedback and why), then
  // every question through to "You can now…", which closes onto the end card
  const checkCard = `(() => { const c = document.querySelector(".ix-predict.ix-open"); if (!c) return "none";
    if (c.querySelector(".ix-can")) return "done"; if (c.querySelector(".ix-check-actions")) return "answered";
    return c.querySelector(".ix-opt:not([aria-disabled])") ? "asked" : "other"; })()`;
  async function endCheck(endBase, entry) {
    for (let k = 0; k < 8; k++) {
      const state = await ev(checkCard);
      if (state === "none" || state === "other") return;
      if (state === "done") {
        await settle();
        await fp.page.shot(join(o.outDir, `${endBase}-check-done.png`));
        o.shots.push(entry(`${endBase}-check-done.png`, "check-done"));
        await ev(`(() => { const c = document.querySelector(".ix-predict.ix-open .ix-close"); c && c.click(); return true; })()`);
        return;
      }
      if (state === "asked") {
        const first = k === 0, opts = await ev(`document.querySelectorAll(".ix-predict.ix-open .ix-opt").length`);
        // the first question a level gets (check.mjs checksFor): Expert the transfer one, the others the first
        const answer = await ev(`(() => { const I = __internals, cs = I.timeline.checks ?? [];
          const c = I.level === "expert" ? cs.find((x) => x.transfer) ?? cs[0] : cs[0]; return c ? c.answer ?? 0 : 0; })()`);
        const pick = first && opts > 1 ? (answer === 0 ? 1 : 0) : 0;
        await ev(`(() => { const b = document.querySelectorAll(".ix-predict.ix-open .ix-opt")[${pick}]; b && b.click(); return !!b; })()`);
        await waitFor(`${checkCard} !== "asked"`, 3000);
        if (first) {
          await settle();
          await fp.page.shot(join(o.outDir, `${endBase}-check.png`));
          o.shots.push(entry(`${endBase}-check.png`, "check"));
        }
        continue;
      }
      // answered: Next question, or Finish
      await ev(`(() => { const b = document.querySelector(".ix-predict.ix-open .ix-check-actions .ix-pill"); b && b.click(); return !!b; })()`);
      await waitFor(`${checkCard} !== "answered"`, 3000);
    }
  }
  try {
    await ev("__internals.intro(false), true");
    const list = (await fp.scenarios()) ?? [];
    let ids = !o.scenario || o.scenario === "all" ? (list.length ? list.map((s) => s.id) : ["default"]) : [o.scenario];
    for (const theme of o.themes) {
      await fp.setTheme(theme);
      const seen = new Set();
      for (const id of ids) {
        const t0 = Date.now(), n0 = o.shots.length;
        try {
          if (id !== "default") await fp.setScenario(id);
          await ev("__internals.intro(false), __internals.setSpeed(1), true");
          const asks = await ev(`__internals.timeline.steps.flatMap((s) => s.ask ? [{ step: s.index, t0: s.t0, phase: s.phase ?? "", caption: s.caption ?? "",
            question: s.ask.question ?? "", options: (s.ask.options ?? []).length, answer: s.ask.answer ?? 0, dur: s.dur }] : [])`);
          const picks = await ev(`__internals.timeline.steps.flatMap((s) => s.choose ? [{ step: s.index, t0: s.t0, phase: s.phase ?? "", caption: s.caption ?? "",
            prompt: s.choose.prompt ?? "", picks: (s.choose.options ?? []).map((x) => x.pick), answer: s.choose.answer ?? 0 }] : [])`);
          const errBefore = fp.errors.length;
          // a clean slate: playing from the end restarts and forgets earlier answers
          await ev("(() => { const I = __internals; I.seek(I.timeline.duration); I.play(); I.pause(); return true; })()");
          for (const a of asks) {
            const key = `${a.step}|${a.question}`;
            if (seen.has(key)) continue;
            seen.add(key);
            await travel();
            await ev(`(() => { __internals.seek(Math.max(0, ${a.t0} - 0.25)); __internals.play(); return true; })()`);
            // a chapter pause, or at the New level a hold after a key step, can come first: carry on through it
            const asked = await waitFor(`(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play();
              return document.querySelector("#ix").classList.contains("ix-asking") && !!document.querySelector(".ix-predict.ix-open"); })()`, 15000);
            if (!asked) { o.errors.push({ type: "teach", text: `the question at step ${a.step} never opened`, shot: tag(id, theme), step: a.step }); continue; }
            await ev("__internals.setSpeed(1), true");
            await settle();
            const base = `${tag(id, theme)}-${String(a.step).padStart(3, "0")}`;
            await fp.page.shot(join(o.outDir, `${base}-ask.png`));
            o.shots.push({ file: `${base}-ask.png`, scenario: id, theme, size, step: a.step, tag: "ask", t: a.t0, phase: a.phase, caption: a.question });
            const pick = a.answer === 0 && a.options > 1 ? 1 : 0;
            // the HUD reveals once the run is 70% into the step (hud.mjs maybeReveal): answer, then go straight there
            // (on a fast machine playing gets there within a frame of the same moment; on a slow one it saves the trip)
            await ev(`(() => { const b = document.querySelectorAll(".ix-predict.ix-open .ix-opt")[${pick}]; b && b.click(); return !!b; })()`);
            if (slow > 1) await ev(`(() => { const I = __internals; I.setSpeed(1); I.seek(${a.t0 + 0.7 * a.dur + 0.02}); return true; })()`);
            const revealed = await waitFor(`(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play(); return !!document.querySelector(".ix-predict.ix-revealed"); })()`, 20000);
            await ev("__internals.pause(), __internals.setSpeed(1), true");
            if (!revealed) { o.errors.push({ type: "teach", text: `the question at step ${a.step} was never revealed`, shot: base, step: a.step }); continue; }
            await settle();
            await fp.page.shot(join(o.outDir, `${base}-why.png`));
            o.shots.push({ file: `${base}-why.png`, scenario: id, theme, size, step: a.step, tag: "why", t: a.t0, phase: a.phase, caption: a.caption });
            await ev(`(() => { const c = document.querySelector(".ix-predict.ix-open .ix-close"); c && c.click(); return true; })()`);
          }
          for (const c of picks) {
            const key = `${c.step}|${c.prompt}`;
            if (seen.has(key)) continue;
            seen.add(key);
            await pickShots(c, `${tag(id, theme)}-${String(c.step).padStart(3, "0")}`, { id, theme });
          }
          // the end: play the last moment and let the run finish on its own (that is what holds the end card)
          await travel();
          await ev("(() => { const I = __internals, d = I.timeline.duration; I.seek(Math.max(0, d - 0.4)); I.play(); return true; })()");
          const ended = await waitFor(`(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play(); return !!(I.held && I.held.kind === "end"); })()`, 15000);
          await ev("__internals.setSpeed(1), true");
          const info = await fp.info();
          const last = info.steps.length - 1, endBase = `${tag(id, theme)}-${String(last).padStart(3, "0")}`;
          const entry = (file, tg) => ({ file, scenario: id, theme, size, step: last, tag: tg, t: info.duration, phase: info.steps[last]?.phase ?? "", caption: info.steps[last]?.caption ?? "" });
          if (!ended) o.errors.push({ type: "teach", text: "the run never reached its end card", shot: tag(id, theme), step: last });
          else {
            await endCheck(endBase, entry);
            await ev(`(() => { const c = document.querySelector(".ix-predict.ix-open .ix-close"); c && c.click(); return true; })()`);
            await settle();
            // a long card: scroll it so the run's end (the recap, the takeaway and the what-ifs) is in view
            const scrollEnd = `(() => { const b = document.querySelector(".ix-explain .ix-ex-body"), n = b && b.querySelector(".ix-ex-now:not([hidden])");
              if (n) b.scrollTop += n.getBoundingClientRect().top - b.getBoundingClientRect().top - 4; return true; })()`;
            await ev(scrollEnd);
            // narrow screens: the caption carries the takeaway; the Explain card opens from it with the recap
            const sheet = await ev(`document.querySelector("#ix").classList.contains("ix-ex-sheet")`);
            if (sheet) {
              await fp.page.shot(join(o.outDir, `${endBase}-end-caption.png`));
              o.shots.push(entry(`${endBase}-end-caption.png`, "end-caption"));
              await ev(`(() => { const b = document.querySelector(".ix-ex-capbtn"); b && b.click(); return !!b; })()`);
              await settle();
              await ev(scrollEnd);
            }
            await fp.page.shot(join(o.outDir, `${endBase}-end-card.png`));
            o.shots.push(entry(`${endBase}-end-card.png`, "end-card"));
            if (sheet) await ev(`(() => { const b = document.querySelector(".ix-ex-capbtn"); b && b.getAttribute("aria-expanded") === "true" && b.click(); return true; })()`);
          }
          for (const e of fp.errors.slice(errBefore)) o.errors.push({ ...e, shot: `teach ${tag(id, theme)}` });
        } catch (e) { o.errors.push({ type: "teach", text: `the live play of ${id} stopped: ${e.message.split("\n")[0]}`, shot: tag(id, theme) }); }
        say(`${id} ${theme}: ${o.shots.length - n0} cards (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      }
    }
  } finally { await fp.close(); }
}

/** How fast the page draws while it plays: ms a frame, and how many times slower than real time the run plays. */
async function framePace(ev) {
  await ev("(() => { const I = __internals; I.intro(false); I.seek(0); I.play(); return true; })()");
  const r0 = await ev("__internals.stats().renders ?? 0"), t0 = Date.now();
  await sleep(1200);
  const n = (await ev("__internals.stats().renders ?? 0")) - r0, ms = (Date.now() - t0) / Math.max(1, n);
  await ev("(() => { const I = __internals; I.pause(); I.seek(0); return true; })()");
  // the runtime steps the run by at most 50 ms a frame; past that it falls behind the clock
  return { ms, slow: Math.min(16, Math.max(1, ms / 50)) };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Lay the PNGs out in an HTML grid page (grouped by scenario, theme, size) and screenshot it, in pages under 14000 px.
async function contactSheet(browser, outDir, shots, title) {
  const groups = [];
  for (const s of shots) {
    const key = `${s.scenario} · ${s.theme} · ${s.size.width}×${s.size.height}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, size: s.size, theme: s.theme, items: [] }));
    g.items.push(s);
  }
  const W = 1600, gap = 14, pad = 28;
  const thumb = (sz) => (sz.width >= sz.height ? { w: 360, h: Math.round((360 * sz.height) / sz.width) } : { h: 300, w: Math.round((300 * sz.width) / sz.height) });
  const pages = [[]];
  let y = 80;
  for (const g of groups) {
    const th = thumb(g.size), perRow = Math.max(1, Math.floor((W - 2 * pad + gap) / (th.w + gap))), rowH = th.h + 58;
    const rows = [];
    for (let i = 0; i < g.items.length; i += perRow) rows.push(g.items.slice(i, i + perRow));
    let part = { ...g, th, rows: [] };
    y += 44;
    for (const row of rows) {
      if (y + rowH > 14000 && (part.rows.length || pages[pages.length - 1].length)) {
        if (part.rows.length) pages[pages.length - 1].push(part);
        pages.push([]); part = { ...g, th, rows: [], cont: true }; y = 80 + 44;
      }
      part.rows.push(row); y += rowH;
    }
    if (part.rows.length) pages[pages.length - 1].push(part);
  }
  const files = [];
  for (const [n, parts] of pages.entries()) {
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#141518;color:#e6e7ea;font:13px/1.35 -apple-system,system-ui,sans-serif;padding:${pad}px;width:${W - 2 * pad}px}
      h1{font-size:18px;font-weight:600;margin:0 0 4px} .sub{color:#8d929b;font-size:12px;margin-bottom:14px}
      h2{font:600 12px ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#b9bcc3;margin:22px 0 10px;text-transform:uppercase}
      .row{display:flex;gap:${gap}px;margin-bottom:12px} figure{margin:0}
      img{display:block;border-radius:6px;box-shadow:0 0 0 1px rgba(255,255,255,.08)} .light img{box-shadow:0 0 0 1px rgba(0,0,0,.2)}
      figcaption{margin-top:6px;font-size:11px;color:#9a9ea6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      figcaption b{font:600 11px ui-monospace,Menlo,monospace;color:#e6e7ea;margin-right:6px}
    </style><body><h1>${esc(title)}</h1><div class="sub">${shots.length} shots${pages.length > 1 ? ` · sheet ${n + 1} of ${pages.length}` : ""}</div>
    ${parts.map((p) => `<h2>${esc(p.key)}${p.cont ? " (cont.)" : ""}</h2>${p.rows.map((row) => `<div class="row ${p.theme}">${row.map((s) => `<figure style="width:${p.th.w}px">
      <img src="${esc(s.file)}" width="${p.th.w}" height="${p.th.h}"><figcaption><b>${String(s.step).padStart(3, "0")} ${esc(s.tag)} · ${s.t.toFixed(2)}s${s.phase ? " · " + esc(s.phase) : ""}</b>${esc(clip(plainCaption(s.caption), 110))}</figcaption></figure>`).join("")}</div>`).join("")}`).join("")}`;
    const name = n ? `contact-${n + 1}` : "contact";
    writeFileSync(join(outDir, `${name}.html`), html);
    const { openPage } = await import("./lib/cdp.mjs");
    const page = await openPage(browser, "file://" + join(outDir, `${name}.html`), { width: W, height: 800, dpr: 1 });
    await page.evaluate("Promise.all([...document.images].map((i) => i.decode().catch(() => null))).then(() => true)");
    const h = await page.evaluate("Math.ceil(document.documentElement.scrollHeight)");
    await page.setViewport(W, Math.min(16000, h), 1);
    await page.shot(join(outDir, `${name}.png`));
    await page.close();
    rmSync(join(outDir, `${name}.html`));
    files.push(join(outDir, `${name}.png`));
  }
  return files;
}

export function report(r, { cwd = process.cwd() } = {}) {
  const rel = (p) => showPath(p);
  const lines = [`shot ${r.shots.length} PNGs -> ${rel(r.outDir)}/`];
  for (const s of r.sheets) lines.push(`sheet ${rel(s)}`);
  if (r.errors.length) {
    lines.push(`page errors (${r.errors.length}):`);
    const seen = new Map();
    for (const e of r.errors) { const k = e.type + e.text; seen.set(k, [...(seen.get(k) ?? []), e]); }
    for (const [, es] of seen) lines.push(`  [${es[0].type}] ${es[0].text.split("\n")[0]}  (${es.length}x, first at ${es[0].shot})`);
  }
  if (r.problems.length) {
    const groups = groupFindings(r.problems, (p) => p.shot.replace(/\.png$/, ""));
    lines.push(`audit problems (${groups.length} distinct, in ${new Set(r.problems.map((p) => p.shot)).size} of ${r.shots.length} shots; run audit.mjs for every step):`);
    for (const g of groups.slice(0, 40)) lines.push(findingLine(g));
    if (groups.length > 40) lines.push(`  … ${groups.length - 40} more`);
  }
  if (!r.errors.length && !r.problems.length) lines.push("no page errors, no audit problems");
  return lines.join("\n");
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { at: "string", themes: "list", sizes: "list", scenario: "string", out: "string", dpr: "number", camera: "string", runtime: "string", clean: "boolean", sheet: "boolean", teach: "boolean", quiet: "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  try {
    // progress on stderr, one line per group, so a long run shows it is alive (stdout keeps the report)
    const t0 = Date.now(), clock = () => { const s = Math.round((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    const r = await shoot(a._[0], { ...a, progress: a.quiet ? null : (m) => console.error(`[${clock()}] ${m}`) });
    console.log(report(r));
    process.exit(r.errors.length ? 1 : 0);
  } catch (e) {
    console.error(`error  ${e.message}`);
    process.exit(1);
  }
}
