#!/usr/bin/env node
// Check the blind readers' reports of one review round (SKILL.md, "Teacher pipeline", after stages 4 and 5) and merge
// them into findings.json for the scorer and the teacher:
//   - every report is valid JSON in its reader's schema (agents/novice-reader.md, agents/expert-reader.md)
//   - a quote counts only when it is in the packet (whitespace, ** and curly quotes normalised) and has 3+ words
//   - a report needs at least 3 verified quotes and must catch its canary (review/round-N/canary.json)
//   - canary findings are stripped; every kept finding gets an id; readers are named novice-1, novice-2, expert
// Exit 1 when a report is invalid: rerun that reader once, then escalate.
//   node scripts/review-check.mjs <dir>/review --round N
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { parseArgs, isMain, showPath } from "./lib/args.mjs";

const USAGE = `
usage: node scripts/review-check.mjs <dir>/review --round <n>
  reads   <review>/packet/**, <review>/round-<n>/novice-*.json, expert*.json, canary.json
  writes  <review>/round-<n>/findings.json
`;
const MIN_QUOTES = 3, MIN_WORDS = 3;   // a quote of one or two words matches anywhere, so it proves nothing

export const norm = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** A reader's final message as saved by the lead: the fenced ```json block, or the whole file as JSON. */
export function parseReport(text) {
  const m = /```json\s*([\s\S]*?)```/.exec(text);
  return JSON.parse(m ? m[1] : text);
}

/** Every quote-bearing item of a report, flattened: { kind, chapter?, step?, quote, item }. */
function quotesOf(r, role) {
  const out = [];
  const add = (kind, list, extra = {}) => { for (const item of Array.isArray(list) ? list : []) out.push({ kind, step: item?.step ?? null, quote: item?.quote ?? null, item, ...extra }); };
  if (role === "novice") {
    for (const ch of r.chapters ?? []) { add("lost", ch.lost, { chapter: ch.chapter }); add("prior_knowledge", ch.prior_knowledge, { chapter: ch.chapter }); }
    add("weakest", r.weakest_three);
    add("sloppy", r.sloppy);
    add("guess", (r.guesses ?? []).map((g) => ({ ...g, quote: g.question })));
  } else {
    add("expert", r.findings);
    add("least_precise", r.least_precise_three);
    add("nuance", r.nuance_learned);
    add("sloppy", r.sloppy);
    add("number", r.numbers_checked);
    add("citation", r.citations_checked);
  }
  return out;
}

function schemaProblems(r, role) {
  const p = [];
  if (!r || typeof r !== "object") return ["not a JSON object"];
  if (role === "novice") {
    if (!Array.isArray(r.chapters) || !r.chapters.length) p.push("no chapters[]");
    else if (r.chapters.some((c) => typeof c?.say_it_back !== "string" || !c.say_it_back.trim())) p.push("a chapter without say_it_back");
    if (!Array.isArray(r.weakest_three) || r.weakest_three.length < 3) p.push("weakest_three needs 3 items");
  } else {
    if (!Array.isArray(r.findings)) p.push("no findings[]");
    if (!Array.isArray(r.least_precise_three) || r.least_precise_three.length < 3) p.push("least_precise_three needs 3 items");
    if (!Array.isArray(r.nuance_learned)) p.push("no nuance_learned[]");
    for (const f of r.findings ?? []) if ((f.severity === "wrong" || f.severity === "misleading") && !f.source) { p.push(`a ${f.severity} finding without a source`); break; }
  }
  return p;
}

// a quote hits the canary when it overlaps the seeded text (and, for the expert, names the wrong number)
function hitsCanary(q, c) {
  const a = norm(q), b = norm(c.text);
  if (!a) return false;
  if (c.word && a.includes(norm(c.word)) && (b.includes(a) || a.includes(b) || a.includes(`the ${norm(c.word)}`))) return true;
  if (c.to != null) return (b.includes(a) || a.includes(b)) && new RegExp(`\\b${c.to}\\b`).test(a);
  return b.includes(a) || a.includes(b);
}

export function reviewCheck(reviewDir, round) {
  const dir = resolve(reviewDir), roundDir = join(dir, `round-${round}`), packetDir = join(dir, "packet");
  if (!existsSync(packetDir)) throw new Error(`no packet at ${showPath(packetDir)} (scripts/review-packet.mjs writes it)`);
  if (!existsSync(roundDir)) throw new Error(`no ${showPath(roundDir)}`);
  const walk = (d) => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : [f]; });
  const packetFiles = walk(packetDir);
  const packet = norm(packetFiles.filter((f) => f.endsWith(".md")).map((f) => readFileSync(f, "utf8")).join("\n"));
  const images = new Set(packetFiles.filter((f) => f.endsWith(".png")).map((f) => relative(packetDir, f).split(/[\\/]/).pop()));
  const canaryFile = join(roundDir, "canary.json");
  const canaries = existsSync(canaryFile) ? JSON.parse(readFileSync(canaryFile, "utf8")).canaries ?? [] : [];

  const files = readdirSync(roundDir).filter((f) => /^(novice-[\w-]+|expert[\w-]*)\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`no reader reports in ${showPath(roundDir)} (novice-a.json, novice-b.json, expert.json)`);
  const readers = [], findings = [], reports = [];
  let novices = 0;
  for (const f of files) {
    const role = f.startsWith("novice") ? "novice" : "expert";
    const name = role === "novice" ? `novice-${++novices}` : "expert";
    const rep = { file: f, reader: name, valid: true, problems: [], verified: 0, dropped: 0, canary: null };
    reports.push(rep);
    let r;
    try { r = parseReport(readFileSync(join(roundDir, f), "utf8")); }
    catch (e) { rep.valid = false; rep.problems.push(`not valid JSON: ${e.message}`); continue; }
    rep.problems.push(...schemaProblems(r, role));
    const canary = canaries.find((c) => c.reader === role);
    const items = quotesOf(r, role);
    let caught = false;
    for (const it of items) {
      const q = norm(it.quote);
      const ok = q.split(" ").length >= MIN_WORDS && packet.includes(q);
      if (!ok) { rep.dropped++; continue; }
      rep.verified++;
      if (canary && hitsCanary(it.quote, canary)) { caught = true; continue; }   // stripped: no one downstream sees it
      if (it.kind === "guess" || it.kind === "number") continue;                 // evidence, not findings
      findings.push({ reader: name, kind: it.kind, chapter: it.chapter ?? null, step: it.step, quote: it.quote,
        ...Object.fromEntries(Object.entries(it.item).filter(([k]) => !["step", "quote"].includes(k))) });
    }
    // image findings carry a file name, not a quote: kept when the image is in the packet
    if (role === "novice") for (const ch of r.chapters ?? []) for (const im of ch.image ?? []) {
      if (images.has(String(im.file ?? "").split(/[\\/]/).pop())) findings.push({ reader: name, kind: "image", chapter: ch.chapter ?? null, step: null, ...im });
      else rep.dropped++;
    }
    if (canary) { rep.canary = caught ? "caught" : "missed"; if (!caught) rep.problems.push(`missed the canary (${canary.word ? `"${canary.word}"` : `${canary.from} → ${canary.to}`} at step ${canary.step})`); }
    if (rep.verified < MIN_QUOTES) rep.problems.push(`${rep.verified} verified quote(s), fewer than ${MIN_QUOTES}`);
    rep.valid = !rep.problems.length;
    readers.push({
      reader: name, ...(role === "novice"
        ? { persona: r.persona ?? "", say_it_back: (r.chapters ?? []).map((c) => ({ chapter: c.chapter, text: c.say_it_back ?? "" })), guesses: r.guesses ?? [], outcome: r.outcome ?? "" }
        : { field: r.field ?? "", nuance_learned: (r.nuance_learned ?? []).filter((n) => packet.includes(norm(n.quote))) }),
    });
  }
  findings.forEach((x, i) => { x.id = `F${i + 1}`; });
  const out = { round, readers, findings: findings.map(({ id, ...rest }) => ({ id, ...rest })) };
  writeFileSync(join(roundDir, "findings.json"), JSON.stringify(out, null, 2) + "\n");
  return { reports, findings: out.findings.length, file: join(roundDir, "findings.json") };
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { round: "number" } });
  if (a._.length !== 1 || a.round == null) { console.error(USAGE.trim()); process.exit(2); }
  try {
    const r = reviewCheck(a._[0], a.round);
    for (const p of r.reports) {
      console.log(`  ${p.valid ? "ok  " : "FAIL"}  ${p.file.padEnd(16)} ${p.reader.padEnd(9)} ${p.verified} verified, ${p.dropped} dropped${p.canary ? `, canary ${p.canary}` : ""}`);
      for (const x of p.problems) console.log(`        ${x}`);
    }
    console.log(`wrote ${showPath(r.file)}: ${r.findings} finding(s)`);
    process.exit(r.reports.every((p) => p.valid) ? 0 : 1);
  } catch (e) { console.error(`error  ${e.message}`); process.exit(1); }
}
