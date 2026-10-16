#!/usr/bin/env node
// Print the lesson a figure teaches as plain text, story by story, so it can be read like a script: the hook, the
// words it defines, each chapter's name and about, every caption (markup flattened), the predict questions with
// their options, answer and why, and the recap and takeaway. Then the teaching checks (scripts/lib/teach.mjs).
// Read it as a beginner would: does each line make sense with only what came before it?
import { resolve, dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, isMain, showPath } from "./lib/args.mjs";
import { extractLesson, formatLesson } from "./lib/lesson.mjs";
import { lintLesson, formatFindings } from "./lib/teach.mjs";
import { rng as simRng } from "../sim/rng.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const USAGE = `
usage: node scripts/lesson.mjs <figure.mjs> [options]
  --scenario <id>   one story only
  --all             every step (by default a run of steps with one caption shape shows two, then a count)
  --full            later stories from step 0 (by default they start where they leave story 1)
  --no-lint         skip the teaching checks at the end
  --json            the lesson and the findings as JSON
  --width <n>       wrap at n columns (default 100)
`;

/** Load a figure and the engine's compile, extract its lesson and lint it. */
export async function lessonOf(figure, { scenario, compiler } = {}) {
  const file = resolve(figure);
  if (!existsSync(file)) throw new Error(`figure not found: ${figure}`);
  await import("./lib/node-hooks.mjs");            // "@internals/<path>" imports resolve in Node too
  const fig = await import(pathToFileURL(file).href);
  const { compile } = await import(pathToFileURL(compiler ?? join(here, "..", "engine", "scene", "index.mjs")).href);
  const lesson = extractLesson(fig, compile, { rng: simRng, scenario });
  return { fig, lesson, findings: lintLesson(lesson, fig) };
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { scenario: "string", all: "boolean", full: "boolean", lint: "boolean", json: "boolean", width: "number" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  let r;
  try { r = await lessonOf(a._[0], { scenario: a.scenario }); }
  catch (e) { console.error(`error  ${e.message}`); process.exit(1); }
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
