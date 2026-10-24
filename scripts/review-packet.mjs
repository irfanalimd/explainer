#!/usr/bin/env node
// The reader packet for the blind reviews of the teacher pipeline (SKILL.md, stage 3.5): only what a reader meets,
// at the reader's level, in reading order. The transcript in chunks (a chunk ends at each prediction; the next one
// opens with the reveal) plus key frames. No ids, file paths, lint output, source or answers before their reveal.
//   <out>/<level>/index.md 00-start.md NN-<chapter>.md (NN-<chapter>-2.md after a prediction) sK-<scenario>.md end.md
//   <out>/img/*.png      one key frame per chapter of the first scenario, every predict card asked and revealed, the end cards
// With --round N it seeds one canary per reader (New: an undefined jargon word; Expert: a wrong number) and records
// them in <out>/../round-N/canary.json, outside the packet, for scripts/review-check.mjs.
import { mkdirSync, writeFileSync, rmSync, copyFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, isMain, showPath } from "./lib/args.mjs";
import { extractLesson, flat } from "./lib/lesson.mjs";
import { loadFigure } from "./lib/lesson-load.mjs";
import { JARGON } from "./lib/teach.mjs";
import { tokens } from "../engine/scene/narrate.mjs";
import { LEVELS, POLICY, defaultLevel } from "../engine/hud/level.mjs";
import { checksFor } from "../engine/hud/check.mjs";
import { rng as simRng } from "../sim/rng.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const USAGE = `
usage: node scripts/review-packet.mjs <figure.mjs> --out <dir>/review/packet [options]
  --round <n>        seed the canaries and record them in <out>/../round-<n>/canary.json
  --levels <list>    reader levels, one folder each (default new,expert; also basics)
  --no-images        the transcript only (no Chrome)
`;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chapter";
const pad = (n) => String(n).padStart(2, "0");
const STEP = /^\*\*Step \d+ of \d+\.\*\* /;   // a step line's head: "**Step 6 of 27.** "
const DEEPER = { cost: "Cost", how: "How", code: "Code", edge: "Edge case", real: "In real systems", source: "Source" };

/** The packet as files: { files: { "new/index.md": text, … }, images: [{ name, shot }] } (shot: what to capture). */
export function packetOf(L, { levels = ["new", "expert"], meta = {} } = {}) {
  const files = {}, images = [];
  const img = (name, shot) => { if (!images.some((x) => x.name === name)) images.push({ name, shot }); return name; };
  const terms = L.header?.terms ?? Object.fromEntries(Object.entries(L.terms).map(([k, def]) => [k, { lead: null, def }]));
  // a citation reads as the page shows it ("Dean & Ghemawat 2004, §3.3"), whatever entity titles the caller has
  const srcById = new Map((L.sources ?? []).map((x) => [x.id, x]));
  const withCites = (refTitle) => Object.assign((id) => refTitle?.(id) ?? null, { cite: (id) => srcById.get(id) ?? null });
  for (const level of levels) {
    const P = POLICY[level], label = LEVELS.find((x) => x.id === level)?.label ?? level;
    const seen = new Set();
    // markup -> reading text, with a term's definition after its first use, as the explain panel prints it
    const say = (markup, refTitle, shape = (t) => t) => {
      if (!markup) return "";
      let extra = "";
      const walk = (n) => {
        if (n.type === "term" && !seen.has(n.name)) { seen.add(n.name); const t = terms[n.name]; if (t) extra += ` [${n.name}: ${t.def}]`; }
        else if (n.type === "bold") n.children.forEach(walk);
      };
      tokens(markup).forEach(walk);
      return shape(flat(markup, withCites(refTitle))) + extra;
    };
    const chunks = [];   // { file, lines, images }
    const open = (file, title) => { const c = { file, lines: [`# ${title}`, ""], images: [] }; chunks.push(c); return c; };

    const start = open("00-start.md", L.title || meta.title || "The lesson");
    if (L.subtitle) start.lines.push(L.subtitle, "");
    if (L.hook) start.lines.push(`**The question:** ${L.hook}`, "");
    start.lines.push(`Your level: ${label}. Default for this page: ${LEVELS.find((x) => x.id === defaultLevel(meta))?.label}.`, "");
    if (L.stories.length > 1) {
      start.lines.push("**Scenarios** (the same system, told another way):", "");
      L.stories.forEach((s, k) => start.lines.push(`${k + 1}. ${s.label}${s.description ? `: ${s.description}` : ""}`));
      start.lines.push("");
    }
    if (L.stories[0]) start.lines.push(`**Chapters:** ${L.stories[0].chapters.map((c) => c.name).filter(Boolean).join(" · ")}`, "");

    L.stories.forEach((story, k) => {
      const first = k === 0, from = first || !story.fork ? 0 : story.fork.step;
      let cur = null;
      if (!first) {
        cur = open(`s${k + 1}-${slug(story.label)}.md`, `Scenario ${k + 1} of ${L.stories.length}: ${story.label}`);
        if (story.whatIf) cur.lines.push(`What if… ${story.whatIf}`, "");
        if (story.description) cur.lines.push(story.description, "");
        if (from) cur.lines.push("It starts like scenario 1. This is where it differs.", "");
      }
      story.chapters.forEach((ch, j) => {
        const last = ch.steps.length ? ch.steps[ch.steps.length - 1].index : ch.step;
        if (last < from) return;
        const name = ch.name || `Chapter ${j + 1}`, base = first ? `${pad(j + 1)}-${slug(name)}` : `s${k + 1}-${pad(j + 1)}-${slug(name)}`;
        const heading = `Chapter ${j + 1} of ${story.chapters.length}: ${name}`;
        if (first) cur = open(`${base}.md`, heading);
        else cur.lines.push(`## ${heading}`, "");
        const enter = ch.raw?.enter;
        if (enter && P.entry !== "off") {
          if (P.entry === "full" && enter.sofar) cur.lines.push(`**So far:** ${say(enter.sofar, ch.refTitle)}`);
          if (enter.now) cur.lines.push(`**Now:** ${say(enter.now, ch.refTitle)}`);
          if (P.entry === "full" && enter.done) cur.lines.push(`**You'll know it worked when:** ${say(enter.done, ch.refTitle)}`);
          if (enter.picture && L.header?.picture) {
            const pic = L.header.picture;
            cur.lines.push("", `**The picture: ${pic.name}**`, "", "| In the picture | In the system |", "|---|---|");
            for (const r of pic.rows) cur.lines.push(`| ${r.picture} | ${r.real} |`);
            if (pic.breaks) cur.lines.push("", `Where it stops matching: ${pic.breaks}`);
          }
          cur.lines.push("");
        }
        if (ch.raw?.about) {
          // Expert: the first sentence, the rest behind More
          const more = (t) => { const cut = P.about === "first" ? t.search(/(?<=[.?!])\s/) : -1; return cut > 0 ? `${t.slice(0, cut)} (More: ${t.slice(cut + 1)})` : t; };
          cur.lines.push(say(ch.raw.about, ch.refTitle, more), "");
        }
        let parts = 1;
        for (const st of ch.steps) {
          if (st.index < from) continue;
          const ask = st.raw?.ask;
          if (ask) {
            cur.lines.push(`**Predict.** ${say(ask.question, st.refTitle)}`, "");
            ask.options.forEach((o, n) => cur.lines.push(`${String.fromCharCode(65 + n)}) ${say(o, st.refTitle)}`));
            cur.lines.push("", "Write down your guess and why, then read on.");
            const part = `${base}-${++parts}`;
            cur.images.push(img(`${part}-ask.png`, { story: k, step: st.index, tag: "ask" }));
            cur = open(`${part}.md`, `${heading} (continued)`);
            const right = ask.options[ask.answer];
            cur.lines.push(`**Revealed:** ${String.fromCharCode(65 + ask.answer)}) ${say(right, st.refTitle)}${ask.why ? `. Why: ${say(ask.why, st.refTitle)}` : ""}`);
            (ask.feedback ?? []).forEach((f, n) => { if (f?.text && n !== ask.answer) cur.lines.push(`If you picked ${String.fromCharCode(65 + n)}: ${say(f.text, st.refTitle)}`); });
            cur.lines.push("");
            cur.images.push(img(`${part}-why.png`, { story: k, step: st.index, tag: "why" }));
          }
          const pick = st.choose;
          if (pick) {
            // a pick in the world: the reader commits first; the next chunk plays each wrong pick's real branch
            cur.lines.push(`**Your turn (you pick in the world).** ${pick.promptText}`, "");
            pick.options.forEach((o, n) => cur.lines.push(`${String.fromCharCode(65 + n)}) ${o.text}`));
            cur.lines.push("", "Write down your pick and why, then read on.");
            const part = `${base}-${++parts}`;
            cur = open(`${part}.md`, `${heading} (continued)`);
            cur.lines.push(`**Revealed:** ${String.fromCharCode(65 + pick.answer)}) ${pick.options[pick.answer]?.text ?? ""}${pick.whyText ? `. Why: ${pick.whyText}` : ""}`);
            pick.options.forEach((o, n) => {
              if (n === pick.answer) return;
              const plays = (o.plays ?? []).filter(Boolean);
              cur.lines.push(`If you picked ${String.fromCharCode(65 + n)}, the run plays your pick for real: ${plays.length ? plays.join(" ") : o.consequence ?? ""}${o.feedback ? ` Then: ${o.feedback}` : ""} (Then it rewinds to the pick.)`);
            });
            cur.lines.push("");
            cur.images.push(img(`${part}-wrong.png`, { story: k, step: st.index, tag: "wrong" }), img(`${part}-right.png`, { story: k, step: st.index, tag: "right" }));
          }
          const Ly = st.raw?.layers ?? { plain: st.caption };
          // numbered as the HUD's counter shows it ("6 / 27": 1-based, out of this story's steps)
          cur.lines.push(`**Step ${st.index + 1} of ${story.steps}.** ${say(Ly.plain ?? st.caption, st.refTitle)}`);
          if (Ly.why && (P.why !== "key" || Ly.key)) cur.lines.push(`Why: ${say(Ly.why, st.refTitle)}`);
          if (Ly.picture && P.picture && L.header?.picture) {
            const r = L.header.picture.rows.find((x) => x.id === Ly.picture);
            if (r) cur.lines.push(`Picture: ${r.picture} = ${r.real}`);
          }
          const deeper = Object.entries(Ly.deeper ?? {});
          if (deeper.length && P.deeper !== "closed") for (const [f, v] of P.deeper === "peek" ? deeper.slice(0, 1) : deeper) cur.lines.push(`${DEEPER[f] ?? f}: ${say(v, st.refTitle)}`);
          cur.lines.push("");
        }
        if (first) cur.images.push(img(`${base}.png`, { story: k, step: last, tag: "end" }));
      });
      if (!first) {
        const recap = story.recap, take = story.takeaway;
        if (recap?.length) { cur.lines.push("**What you saw:**", ""); recap.forEach((r, n) => cur.lines.push(`${n + 1}. ${say(r)}`)); cur.lines.push(""); }
        if (take) cur.lines.push(`**Takeaway:** ${take}`, "");
        cur.images.push(img(`s${k + 1}-${slug(story.label)}-end.png`, { story: k, tag: "end-card" }));
        endCheck(cur, story, `s${k + 1}-${slug(story.label)}-check`, `Scenario ${k + 1}: check yourself`);
      }
    });
    const end = open("end.md", "The end");
    if (L.recap.length) { end.lines.push("**What you saw:**", ""); L.recap.forEach((r, n) => end.lines.push(`${n + 1}. ${say(r)}`)); end.lines.push(""); }
    if (L.stories[0]?.takeaway || L.takeaway) end.lines.push(`**Takeaway:** ${L.stories[0]?.takeaway || L.takeaway}`, "");
    end.images.push(img("end.png", { story: 0, tag: "end-card" }));
    if (L.stories[0]) endCheck(end, L.stories[0], "end-check", "Check yourself");
    // the end check at the reader's level (the HUD's checksFor): the questions end a chunk, the answers open the next
    function endCheck(at, story, file, title) {
      const list = checksFor(story.checks ?? [], level);
      if (!list.length) return;
      at.lines.push("**Check yourself** (questions about situations the run did not show):", "");
      list.forEach((c, n) => {
        at.lines.push(`${n + 1}. ${say(c.question)}`);
        c.options.forEach((o, j) => at.lines.push(`   ${String.fromCharCode(65 + j)}) ${say(o)}`));
        at.lines.push("");
      });
      at.lines.push("Write down your answers and why, then read on.");
      const next = open(`${file}.md`, `${title}: answers`);
      list.forEach((c, n) => {
        next.lines.push(`${n + 1}. **Answer:** ${String.fromCharCode(65 + c.answer)}) ${say(c.options[c.answer])}. Why: ${say(c.why)}`);
        (c.feedback ?? []).forEach((f, j) => { if (f?.text && j !== c.answer) next.lines.push(`   If you picked ${String.fromCharCode(65 + j)}: ${say(f.text)}`); });
        next.lines.push("");
      });
      const goals = (L.header?.objectives ?? []).filter((o) => (story.objectives ?? []).includes(o.id));
      if (goals.length) { next.lines.push("**You can now…**", ""); goals.forEach((o) => next.lines.push(`- ${o.text}`)); next.lines.push(""); }
    }

    // the expert checks each citation against its source: the list the page's handout prints, nothing more
    if (level === "expert" && L.sources?.length) {
      const src = open("sources.md", "Sources the page cites");
      src.lines.push("The lesson cites these by their short form (\"Dean & Ghemawat 2004, §3.3\"); the handout lists them like this.", "");
      for (const x of L.sources) src.lines.push(`- **${x.short}.** ${x.full}${x.url ? ` ${x.url}` : ""}`);
    }
    const index = ["# Reading order", "", "Read these one at a time, in this order, images included. When a file ends on a prediction, write down your guess before you open the next one.",
      "", "Step numbers match the step counter under the timeline in the images (“Step 6 of 27” is “6 / 27” there).", ""];
    for (const c of chunks) { index.push(`- ${c.file}`); for (const i of c.images) index.push(`- ../img/${i}`); }
    files[`${level}/index.md`] = index.join("\n") + "\n";
    for (const c of chunks) files[`${level}/${c.file}`] = c.lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  }
  return { files, images };
}

/**
 * One canary per reader, chosen from the round so each round's differs. New: a sentence with a flagged word the
 * lesson never defines, appended to a step mid-lesson. Expert: one number in a step's text changed.
 */
export function seedCanaries(files, { round, terms }) {
  const canaries = [];
  const steps = (level) => Object.entries(files).filter(([f]) => f.startsWith(`${level}/`) && /\/\d\d-/.test(f))
    .flatMap(([file, text]) => text.split("\n").filter((l) => l.startsWith("**Step ")).map((line) => ({ file, line })));
  const known = new Set(Object.keys(terms).map((t) => t.toLowerCase()));
  const novice = Object.keys(files).some((f) => f.startsWith("new/")) ? "new" : Object.keys(files).some((f) => f.startsWith("basics/")) ? "basics" : null;
  if (novice) {
    const all = Object.entries(files).filter(([f]) => f.startsWith(`${novice}/`)).map(([, t]) => t).join("\n");
    const words = JARGON.map((j) => j.word).filter((w) => /^[a-z ]+$/i.test(w) && !known.has(w.toLowerCase()) && !new RegExp(`\\b${w}`, "i").test(all));
    const word = words[round % Math.max(1, words.length)];
    const pool = steps(novice), at = pool[Math.floor(pool.length / 2) + (round % 3)] ?? pool[0];
    if (word && at) {
      const sentence = `This is the ${word} at work.`;
      files[at.file] = files[at.file].replace(at.line, `${at.line} ${sentence}`);
      canaries.push({ reader: "novice", level: novice, file: at.file, step: Number(/\*\*Step (\d+)/.exec(at.line)[1]), word, text: sentence });
    }
  }
  if (Object.keys(files).some((f) => f.startsWith("expert/"))) {
    // a plain number outside inline code (not a hex address or a part of a word)
    // a count of things ("7 slips"): a plain number after no word of its own, before a word (not a name like "map 2")
    const NUM = /(?<![\w.`#x-])(?<![A-Za-z] )([2-9]|[1-9]\d{1,5})(?= [a-z])/;
    const pool = steps("expert").filter(({ line }) => NUM.test(line.replace(STEP, "").replace(/`[^`]*`/g, "")));
    const at = pool[(round * 5 + Math.floor(pool.length / 3)) % Math.max(1, pool.length)];
    if (at) {
      const head = STEP.exec(at.line)[0], body = at.line.slice(head.length);
      const masked = body.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
      const m = NUM.exec(masked), n = Number(m[1]), to = n < 10 ? n + 2 : Math.round(n * 1.5);
      const seeded = body.slice(0, m.index) + String(to) + body.slice(m.index + m[1].length);
      files[at.file] = files[at.file].replace(at.line, head + seeded);
      canaries.push({ reader: "expert", level: "expert", file: at.file, step: Number(/\d+/.exec(head)[0]), from: n, to, text: seeded });
    }
  }
  return canaries;
}

/** Build the packet: compile and read the lesson, write the chunks, shoot the frames, seed the canaries. */
export async function reviewPacket(figure, { out, round, levels = ["new", "expert"], images = true } = {}) {
  const file = resolve(figure);
  if (!existsSync(file)) throw new Error(`figure not found: ${figure}`);
  for (const l of levels) if (!POLICY[l]) throw new Error(`unknown level "${l}" (use ${Object.keys(POLICY).join(", ")})`);
  const fig = await loadFigure(file);
  const { compile } = await import(pathToFileURL(join(here, "..", "engine", "scene", "index.mjs")).href);
  const L = extractLesson(fig, compile, { rng: simRng });
  const broken = L.stories.filter((s) => s.error);
  if (broken.length) throw new Error(`${broken.map((s) => s.label).join(", ")} failed to compile: ${broken[0].error}`);
  const { files, images: wanted } = packetOf(L, { levels, meta: fig.meta ?? {} });
  const canaries = round != null ? seedCanaries(files, { round, terms: L.header?.terms ?? L.terms }) : [];

  out = resolve(out);
  rmSync(out, { recursive: true, force: true });       // rebuilt every round
  for (const [name, text] of Object.entries(files)) { mkdirSync(dirname(join(out, name)), { recursive: true }); writeFileSync(join(out, name), text); }
  let shot = [];
  if (images && wanted.length) shot = await frames(file, L, wanted, join(out, "img"));
  let canaryFile = null;
  if (round != null) {
    canaryFile = join(dirname(out), `round-${round}`, "canary.json");
    mkdirSync(dirname(canaryFile), { recursive: true });
    writeFileSync(canaryFile, JSON.stringify({ round, canaries }, null, 2) + "\n");
  }
  const missing = images ? wanted.filter((w) => !shot.includes(w.name)).map((w) => w.name) : [];
  return { out, files: Object.keys(files), images: shot, missing, canaries, canaryFile, chapters: L.stories[0]?.chapters.length ?? 0 };
}

// shoot the wanted frames (desktop, dark) and copy them under their packet names
async function frames(file, L, wanted, dir) {
  const { shoot } = await import("./shoot.mjs");
  const { resolveTarget } = await import("./lib/figure-page.mjs");
  const tmp = mkdtempSync(join(tmpdir(), "explainer-packet-"));
  const t = await resolveTarget(file);
  const got = [];
  try {
    mkdirSync(dir, { recursive: true });
    for (const [k, story] of L.stories.entries()) {
      const mine = wanted.filter((w) => w.shot.story === k);
      if (!mine.length) continue;
      const ends = mine.filter((w) => w.shot.tag === "end").map((w) => w.shot.step);
      const r = await shoot(t.url, { scenario: story.id ?? "all", sizes: ["1440x900"], themes: ["dark"], at: ends.length ? ends.join(",") : "none",
        teach: true, sheet: false, out: join(tmp, String(k)) });
      for (const w of mine) {
        const s = r.shots.find((x) => x.tag === w.shot.tag && (w.shot.tag === "end-card" || x.step === w.shot.step));
        if (s) { copyFileSync(join(r.outDir, s.file), join(dir, w.name)); got.push(w.name); }
      }
    }
  } finally { t.stop(); rmSync(tmp, { recursive: true, force: true }); }
  return got;
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { out: "string", round: "number", levels: "list", images: "boolean" } });
  if (a._.length !== 1 || !a.out) { console.error(USAGE.trim()); process.exit(2); }
  if (!/[\\/]review[\\/]packet[\\/]?$/.test(resolve(a.out))) console.error("note   the reader fence allows only paths under review/packet/");
  try {
    const r = await reviewPacket(a._[0], { out: a.out, round: a.round, levels: a.levels ?? ["new", "expert"], images: a.images !== false });
    console.log(`packet  ${showPath(r.out)}: ${r.files.length} files, ${r.images.length} images, ${r.chapters} chapters`);
    for (const c of r.canaries) console.log(`canary  ${c.reader}: ${c.word ? `"${c.word}"` : `${c.from} → ${c.to}`} at step ${c.step}`);
    if (r.canaryFile) console.log(`wrote   ${showPath(r.canaryFile)} (outside the packet: never show it to an agent)`);
    if (r.missing.length) { console.log(`FAIL    ${r.missing.length} image(s) missing: ${r.missing.join(", ")}`); process.exit(1); }
  } catch (e) { console.error(`error  ${e.message}`); process.exit(1); }
}
