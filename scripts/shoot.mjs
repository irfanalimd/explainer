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
  --at none            no phase shots (with --teach: the teaching cards only)
  --quiet              no progress lines on stderr
Files: <scenario>-<theme>-<w>x<h>-<step>-<mid|end|tN.NNs>.png, contact.png (contact-2.png… when long).
--teach adds <scenario>-<theme>-<w>x<h>-<step>-ask.png and -why.png per question, -wrong.png and -right.png per
pick, and at the last step -end-check.png (the first end-check question, answered wrong on purpose, with its
feedback), -end-cannow.png ("You can now…") and -end-card.png (the recap, takeaway and what-ifs; narrow screens:
-end-caption.png too, the caption before the card opens).
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
            await fp.page.shot(join(outDir, name), null, FAST_PNG);
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

// Chrome's fast PNG encoding: the same pixels (checked shot by shot against the default encoding), about a third
// larger, and 0.4 s less a 1440x900 shot (0.65 s -> 0.25 s), which is a fifth of a frozen shot on software rendering
const FAST_PNG = { fast: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEACH_SPEED = 16;   // --teach: the playback speed between cards
const TEACH_WAIT = 4;     // --teach: how much longer than the nominal timeouts a slow machine may take

// Live playback, on a page of its own: frozen capture drops pauses and predictions, so play to each question, shoot it
// asked, pick the first wrong option (the card then shows the wrong pick, the right answer and the why), play until it
// is revealed, shoot again. For each pick (s.choose): play to it, pick the first wrong option, let its branch play to
// its consequence (fast) and shoot the detour; rewind, pick the right one and shoot its why. Then play into the end and
// shoot the end card. Every wait has a timeout: a step that never comes is reported and the run moves on. A question in
// a story's shared opening is shot once per theme and size, not again for every story that repeats it.
async function teachShots(browser, url, size, o) {
  const fp = await openFigure(browser, url, { ...size, dpr: o.dpr ?? 1 });
  // no call may hang the run: a page that stops answering is an error, not a stuck job holding a Chrome
  const ev = (js) => fp.page.evaluate(js, { timeout: 45000 * TEACH_WAIT });
  const say = (msg) => o.progress?.(`teach ${size.width}x${size.height} ${msg}`);
  const waitFor = async (js, ms) => { ms *= TEACH_WAIT; const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(js)) return true; await sleep(80); } return false; };
  const settle = () => sleep(1400);   // panel fades and camera springs come to rest
  // Live play runs fast between cards. The runtime caps each frame's step at 1/20 s, so where frames are slow (software
  // rendering on a loaded machine: seconds a frame) 1× play crawls and every wait below would time out. The pauses,
  // questions and picks still stop the run at their own step at any speed; the cards are shot while it is paused.
  const fast = `__internals.setSpeed(${TEACH_SPEED})`;
  // a card is shot at the speed a reader sees in the dock (1×), then play goes on fast
  const snap = async (file) => {
    await ev("__internals.setSpeed(1), true");
    await waitFor(`(document.querySelector(".ix-speed-val")?.textContent ?? "1×") === "1×"`, 3000);
    await fp.page.shot(file, null, FAST_PNG);
    await ev(`${fast}, true`);
  };
  const tag = (id, theme) => `${id}-${theme}-${size.width}x${size.height}`;
  // a pick: the wrong one's detour held on its consequence, then (rewound) the right one with its why
  const pickOpen = `(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play(); return !!document.querySelector(".ix-predict.ix-open .ix-turn-picks"); })()`;
  const click = (pick) => ev(`(() => { const b = document.querySelector('.ix-predict.ix-open .ix-turn-pick[data-pick="${pick}"]'); b && b.click(); return !!b; })()`);
  async function pickShots(c, base, { id, theme }) {
    const fail = (text) => o.errors.push({ type: "teach", text: `the pick at step ${c.step} ${text}`, shot: base, step: c.step });
    const entry = (file, tg, caption) => ({ file, scenario: id, theme, size, step: c.step, tag: tg, t: c.t0, phase: c.phase, caption });
    const wrong = c.picks.find((_, j) => j !== c.answer), right = c.picks[c.answer];
    await ev(`(() => { __internals.seek(Math.max(0, ${c.t0} - 0.25)); __internals.play(); return true; })()`);
    if (!(await waitFor(pickOpen, 15000))) return fail("never opened");
    if (wrong != null) {
      await click(wrong);
      await sleep(600);
      await ev(`${fast}, true`);
      const held = await waitFor(`!!(__internals.timeline.branch && __internals.held && document.querySelector(".ix-predict.ix-open:not(.ix-locked)"))`, 30000);
      if (!held) { fail("never held its wrong branch's consequence"); return leaveBranch(); }
      await settle();
      await snap(join(o.outDir, `${base}-wrong.png`));
      o.shots.push(entry(`${base}-wrong.png`, "wrong", c.caption));
      // the transport's one way on rewinds the branch to the pick, which opens again
      await ev(`(() => { const b = document.querySelector(".ix-play"); b && b.click(); return true; })()`);
      if (!(await waitFor(`!__internals.timeline.branch && ${pickOpen}`, 15000))) { fail("never came back from its branch"); return leaveBranch(); }
    }
    await click(right);
    const revealed = await waitFor(`!!document.querySelector(".ix-predict.ix-open.ix-revealed")`, 10000);
    await ev("__internals.pause(), true");
    if (!revealed) return fail("never revealed the right pick");
    await settle();
    await snap(join(o.outDir, `${base}-right.png`));
    o.shots.push(entry(`${base}-right.png`, "right", c.prompt));
  }
  // never leave the page in a branch (the end card belongs to the main run): scrubbing back before the pick leaves it
  async function leaveBranch() {
    await ev("(() => { const I = __internals; I.pause(); I.seek(0); return true; })()");
    if (!(await waitFor("!__internals.timeline.branch", 5000))) o.errors.push({ type: "teach", text: "the page stayed in a branch of the run", shot: "teach" });
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
          await ev(`__internals.intro(false), ${fast}, true`);
          const asks = await ev(`__internals.timeline.steps.flatMap((s) => s.ask ? [{ step: s.index, t0: s.t0, phase: s.phase ?? "", caption: s.caption ?? "",
            question: s.ask.question ?? "", options: (s.ask.options ?? []).length, answer: s.ask.answer ?? 0 }] : [])`);
          const picks = await ev(`__internals.timeline.steps.flatMap((s) => s.choose ? [{ step: s.index, t0: s.t0, phase: s.phase ?? "", caption: s.caption ?? "",
            prompt: s.choose.prompt ?? "", picks: (s.choose.options ?? []).map((x) => x.pick), answer: s.choose.answer ?? 0 }] : [])`);
          const errBefore = fp.errors.length;
          // a clean slate: playing from the end restarts and forgets earlier answers
          await ev("(() => { const I = __internals; I.seek(I.timeline.duration); I.play(); I.pause(); return true; })()");
          for (const a of asks) {
            const key = `${a.step}|${a.question}`;
            if (seen.has(key)) continue;
            seen.add(key);
            await ev(`(() => { __internals.seek(Math.max(0, ${a.t0} - 0.25)); __internals.play(); return true; })()`);
            // a chapter pause, or at the New level a hold after a key step, can come first: carry on through it
            const asked = await waitFor(`(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play();
              return document.querySelector("#ix").classList.contains("ix-asking") && !!document.querySelector(".ix-predict.ix-open"); })()`, 15000);
            if (!asked) { o.errors.push({ type: "teach", text: `the question at step ${a.step} never opened`, shot: tag(id, theme), step: a.step }); continue; }
            await settle();
            const base = `${tag(id, theme)}-${String(a.step).padStart(3, "0")}`;
            await snap(join(o.outDir, `${base}-ask.png`));
            o.shots.push({ file: `${base}-ask.png`, scenario: id, theme, size, step: a.step, tag: "ask", t: a.t0, phase: a.phase, caption: a.question });
            const pick = a.answer === 0 && a.options > 1 ? 1 : 0;
            await ev(`(() => { const b = document.querySelectorAll(".ix-predict.ix-open .ix-opt")[${pick}]; b && b.click(); return !!b; })()`);
            const revealed = await waitFor(`(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play(); return !!document.querySelector(".ix-predict.ix-revealed"); })()`, 20000);
            await ev("__internals.pause(), true");
            if (!revealed) { o.errors.push({ type: "teach", text: `the question at step ${a.step} was never revealed`, shot: base, step: a.step }); continue; }
            await settle();
            await snap(join(o.outDir, `${base}-why.png`));
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
          await ev("(() => { const I = __internals, d = I.timeline.duration; I.seek(Math.max(0, d - 0.4)); I.play(); return true; })()");
          const ended = await waitFor(`(() => { const I = __internals; if (I.held && I.held.kind !== "end") I.play();
            const os = document.querySelectorAll(".ix-predict.ix-open:not(.ix-locked) .ix-opt");
            if (os.length) { const cs = I.timeline.checks ?? [], c = I.level === "expert" ? cs.find((x) => x.transfer) ?? cs[0] : cs[0];
              const a = c ? c.answer ?? 0 : 0; os[os.length > 1 && a === 0 ? 1 : 0].click(); }
            return !!(I.held && I.held.kind === "end"); })()`, 15000);
          const info = await fp.info();
          const last = info.steps.length - 1, endBase = `${tag(id, theme)}-${String(last).padStart(3, "0")}`;
          const entry = (file, tg) => ({ file, scenario: id, theme, size, step: last, tag: tg, t: info.duration, phase: info.steps[last]?.phase ?? "", caption: info.steps[last]?.caption ?? "" });
          if (!ended) o.errors.push({ type: "teach", text: "the run never reached its end card", shot: tag(id, theme), step: last });
          else {
            // the end check opens over the payoff: shoot its first question answered (wrong, above), then answer the rest, shoot
            // "You can now…", and put it away so the end card below shows the recap, the takeaway and what comes next
            const checking = await ev(`!!document.querySelector(".ix-predict.ix-open .ix-check-actions")`);
            if (checking) {
              await settle();
              await snap(join(o.outDir, `${endBase}-end-check.png`));
              o.shots.push(entry(`${endBase}-end-check.png`, "end-check"));
              await waitFor(`(() => { const p = document.querySelector(".ix-predict.ix-open"); if (!p) return true;
                const b = p.querySelector(".ix-opt:not([aria-disabled])"); if (b) { b.click(); return false; }
                const n = p.querySelector(".ix-check-actions .ix-pill"); if (n) { n.click(); return false; }
                return !!p.querySelector(".ix-can"); })()`, 30000);
              await settle();
              await snap(join(o.outDir, `${endBase}-end-cannow.png`));
              o.shots.push(entry(`${endBase}-end-cannow.png`, "end-cannow"));
            }
            await ev(`(() => { const c = document.querySelector(".ix-predict.ix-open .ix-close"); c && c.click(); return true; })()`);
            await settle();
            // a long card: scroll it so the run's end (the recap, the takeaway and the what-ifs) is in view
            const scrollEnd = `(() => { const b = document.querySelector(".ix-explain .ix-ex-body"), n = b && b.querySelector(".ix-ex-now:not([hidden])");
              if (n) b.scrollTop += n.getBoundingClientRect().top - b.getBoundingClientRect().top - 4; return true; })()`;
            await ev(scrollEnd);
            // narrow screens: the caption carries the takeaway; the Explain card opens from it with the recap
            const sheet = await ev(`document.querySelector("#ix").classList.contains("ix-ex-sheet")`);
            if (sheet) {
              await snap(join(o.outDir, `${endBase}-end-caption.png`));
              o.shots.push(entry(`${endBase}-end-caption.png`, "end-caption"));
              await ev(`(() => { const b = document.querySelector(".ix-ex-capbtn"); b && b.click(); return !!b; })()`);
              await settle();
              await ev(scrollEnd);
            }
            await snap(join(o.outDir, `${endBase}-end-card.png`));
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
    await page.shot(join(outDir, `${name}.png`), null, FAST_PNG);
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
  // warn-level findings (the focus under the HUD) are advice, listed apart from the problems
  for (const [warn, title] of [[false, "audit problems"], [true, "audit advice"]]) {
    const ps = r.problems.filter((p) => (p.level === "warn") === warn);
    if (!ps.length) continue;
    const groups = groupFindings(ps, (p) => p.shot.replace(/\.png$/, ""));
    lines.push(`${title} (${groups.length} distinct, in ${new Set(ps.map((p) => p.shot)).size} of ${r.shots.length} shots; run audit.mjs for every step):`);
    for (const g of groups.slice(0, 40)) lines.push(findingLine(g));
    if (groups.length > 40) lines.push(`  … ${groups.length - 40} more`);
  }
  if (!r.errors.length && !r.problems.some((p) => p.level !== "warn")) lines.push("no page errors, no audit problems");
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
