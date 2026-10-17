// Import a figure in Node together with the lesson beside it (CONTRACTS.md 10.4): { ...figure, lesson } when
// examples/<name>/lesson.mjs exists, else the figure module itself. compile() merges figure.lesson by step id.
// Every script that runs a figure in Node loads it through here, so the lesson is checked wherever the run is.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { lessonBeside } from "./modules.mjs";
import "./node-hooks.mjs";            // "@internals/<path>" imports resolve in Node too

export async function loadFigure(path) {
  const file = resolve(path);
  const figure = await import(pathToFileURL(file).href);
  const lessonFile = lessonBeside(file);
  if (!lessonFile) return figure;
  let mod;
  try { mod = await import(pathToFileURL(lessonFile).href); }
  catch (e) { e.message = `lesson.mjs failed to import: ${e.message}`; throw e; }
  if (!mod.lesson || typeof mod.lesson !== "object") throw new Error("lesson.mjs must export const lesson = { … } (CONTRACTS.md 10.2)");
  return { ...figure, lesson: mod.lesson };
}
