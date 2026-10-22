#!/usr/bin/env node
// Print the lesson a figure teaches as plain text, story by story, so it can be read like a script: the hook, the
// words it defines, each chapter's name and about, every caption (markup flattened), the predict questions with
// their options, answer and why, and the recap and takeaway. Then the teaching checks (scripts/lib/teach.mjs).
// A lesson.mjs beside the figure (CONTRACTS.md 10) adds its layers: goal, picture map, entry cards, why, look,
// picture, deeper and per-option feedback.
// Read it as a beginner would: does each line make sense with only what came before it?
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, isMain, showPath } from "./lib/args.mjs";
import { extractLesson, formatLesson } from "./lib/lesson.mjs";
import { loadFigure } from "./lib/lesson-load.mjs";
import { lintLesson, formatFindings } from "./lib/teach.mjs";
import { styleFindings, formatHit } from "./lib/style.mjs";
import { lessonBeside } from "./lib/modules.mjs";
import { rng as simRng } from "../sim/rng.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const USAGE = `
usage: node scripts/lesson.mjs <figure.mjs> [options]
  --scenario <id>   one story only
  --params <list>   knob values for every story, e.g. n=7,at=4
  --all             every step (by default a run of steps with one caption shape shows two, then a count)
  --full            later stories from step 0 (by default they start where they leave story 1)
  --no-lint         skip the teaching checks at the end
  --style           only the writing lint (references/writing.md): every hit, with its file, line and a rewrite
  --json            the lesson and the findings as JSON
  --width <n>       wrap at n columns (default 100)
`;

/** Load a figure and the engine's compile, extract its lesson and lint it. */
export async function lessonOf(figure, { scenario, params, compiler } = {}) {
  const file = resolve(figure);
  if (!existsSync(file)) throw new Error(`figure not found: ${figure}`);
  const fig = await loadFigure(file);              // with its lesson.mjs, when there is one
  const { compile } = await import(pathToFileURL(compiler ?? join(here, "..", "engine", "scene", "index.mjs")).href);
  const lesson = extractLesson(fig, compile, { rng: simRng, scenario, params });
  const findings = lintLesson(lesson, fig);
  const style = styleFindings({ figureFile: file, lessonFile: lessonBeside(file), lesson });
  findings.warnings.push(...style.warnings);
  return { fig, lesson, findings, style: style.hits };
}

/** "n=7,at=4" -> { n: 7, at: 4 } (numbers where they parse, true/false, else strings) */
function knobs(list) {
  if (!list) return undefined;
  const value = (v) => (v === "true" ? true : v === "false" ? false : v !== "" && Number.isFinite(Number(v)) ? Number(v) : v);
  return Object.fromEntries(list.split(",").filter(Boolean).map((kv) => { const [k, ...v] = kv.split("="); return [k.trim(), value(v.join("=").trim())]; }));
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { scenario: "string", params: "string", all: "boolean", full: "boolean", lint: "boolean", style: "boolean", json: "boolean", width: "number" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  let r;
  try { r = await lessonOf(a._[0], { scenario: a.scenario, params: knobs(a.params) }); }
  catch (e) { console.error(`error  ${e.message}`); process.exit(1); }
  if (a.style) {
    for (const h of r.style) console.log(formatHit(h));
    console.log(`${r.style.length} writing hit(s)  ${showPath(resolve(a._[0]))}`);
    process.exit(0);
  }
  if (a.json) {
    console.log(JSON.stringify({ figure: resolve(a._[0]), lesson: r.lesson, findings: r.findings }, null, 2));
  } else {
    console.log(formatLesson(r.lesson, { all: a.all, full: a.full, width: a.width ?? 100 }));
    if (a.lint !== false) {
      console.log("");
      console.log(`teaching checks  ${showPath(resolve(a._[0]))}`);
      console.log(formatFindings(r.findings, "  "));
    }
  }
  process.exit(r.findings.errors.length ? 1 : 0);
}
