// node --test scripts/lib/sources-lint.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { lintSources, citesOf } from "./sources-lint.mjs";

const DEAN = { id: "dean2004", title: "MapReduce", by: ["Jeffrey Dean", "Sanjay Ghemawat"], year: 2004, where: "OSDI", url: "https://example.org/dean.pdf", supports: ["the word-count example"] };
const rules = (r) => [...r.errors.map((x) => `E:${x.rule}`), ...r.warnings.map((x) => `W:${x.rule}`)];

test("a well-formed, fully cited lesson is clean", () => {
  const lesson = { sources: [DEAN], steps: { "map.write": { plain: "x", deeper: { real: "Google's jobs [dean2004] §5.", source: "[dean2004] §3.1" } } } };
  const r = lintSources(lesson, { cite: "[dean2004]" });
  assert.deepEqual(rules(r), []);
  assert.equal(r.info.cites, 3);
});

test("an unknown id is an error, with the place it was written and a near id", () => {
  const r = lintSources({ sources: [DEAN], steps: { a: { plain: "x", deeper: { source: "[dean2040] §3" } } } }, {});
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].message, /\[dean2040\] names no source .*steps\.a\.deeper\.source.*did you mean \[dean2004\]/);
});

test("the list's shape: ids, required fields and urls are errors; a missing where or supports is advice", () => {
  const r = lintSources({ sources: [{ id: "Dean", title: "t", by: "x", year: 1 }, { id: "a1", title: "t", by: "x", year: 1, url: "ftp://x" },
    { id: "a1", title: "t", by: "x", year: 1 }, { id: "b2" }, "nope"] }, {});
  const msgs = r.errors.map((x) => x.message).join("\n");
  assert.match(msgs, /id "Dean" must be a lowercase slug/);
  assert.match(msgs, /url must be an http\(s\) address/);
  assert.match(msgs, /two sources have the id "a1"/);
  assert.match(msgs, /source "b2" has no title/);
  assert.match(msgs, /source "b2" has no year/);
  assert.match(msgs, /lesson\.sources\[4\] must be/);
  assert.ok(r.warnings.some((x) => x.rule === "fields" && /no where/.test(x.message)));
  assert.equal(lintSources({ sources: {} }, {}).errors[0].rule, "shape");
});

test("an uncited source, a real-world layer with no citation and a plain meta.cite are warnings", () => {
  const lesson = { sources: [DEAN, { ...DEAN, id: "tut", title: "Tutorial", by: "A. Writer" }], steps: { a: { plain: "x", deeper: { real: "Hadoop does it too.", "source@crash": "the paper" }, first: { deeper: { real: "[dean2004]" } } } } };
  const r = lintSources(lesson, { cite: { text: "Dean & Ghemawat, OSDI 2004" } });
  assert.deepEqual(rules(r).sort(), ["W:claim", "W:claim", "W:uncited"]);
  assert.match(r.warnings.find((x) => x.rule === "uncited").message, /\[tut\]/);
  assert.match(r.warnings.find((x) => /real-world/.test(x.message)).message, /steps\["a"\]\.deeper\.real.*deeper\.source@crash/);
});

test("a lesson without sources gets one warning that counts its uncited claims; a run's cites count", () => {
  const r = lintSources({ steps: { a: { plain: "x", deeper: { real: "r", source: "s" } } } }, { cite: "Knuth" });
  assert.deepEqual(rules(r), ["W:none"]);
  assert.match(r.warnings[0].message, /3 layers/);
  const seen = lintSources({ sources: [DEAN] }, {}, [{ where: "step 30 scale shot", text: "[dean2004]" }]);
  assert.deepEqual(rules(seen), []);
});

test("citations inside inline code or escaped are not citations", () => {
  assert.equal(citesOf("`Inner([sep], [node])` and \\[dean2004]").length, 0);
  assert.deepEqual(citesOf("**as [dean2004] §2** says").map((c) => c.id), ["dean2004"]);
  const r = lintSources({ sources: [DEAN], steps: { a: { plain: "x", deeper: { code: "`root = Inner([sep])`", source: "[dean2004]" } } } }, {});
  assert.deepEqual(rules(r), []);
});

test("a real-world layer is cited by the Source line beside it, the same story's or the base one", () => {
  const lesson = { sources: [DEAN], steps: {
    a: { plain: "x", deeper: { real: "Google ran it on 1,800 machines.", source: "[dean2004] §5.2" } },
    b: { plain: "x", deeper: { "real@crash": "A worker is re-run.", "source@crash": "[dean2004] §3.3" } },
    c: { plain: "x", deeper: { "real@crash": "A worker is re-run.", source: "[dean2004] §3.3" } },
    d: { plain: "x", deeper: { real: "Hadoop does it too.", "source@crash": "[dean2004]" } } } };
  const w = lintSources(lesson, {}, new Set(["a", "b", "c", "d"])).warnings.find((x) => /real-world/.test(x.message));
  assert.ok(w, "d's base real has no base Source");
  assert.match(w.message, /steps\["d"\]\.deeper\.real/);
  assert.doesNotMatch(w.message, /steps\["[abc]"\]/);
});

test("two sources that would show under one label are a warning; a short tells them apart", () => {
  const pg = (id, title) => ({ id, title, by: "PostgreSQL Global Development Group", year: 2024, where: "PostgreSQL documentation", supports: ["x"] });
  const lesson = { sources: [pg("pg-a", "Database Page Layout"), pg("pg-b", "CREATE INDEX")], steps: { a: { plain: "x", deeper: { real: "y [pg-a] [pg-b]" } } } };
  const w = lintSources(lesson, {}, new Set(["a"])).warnings.find((x) => x.rule === "label");
  assert.ok(w); assert.match(w.message, /\[pg-a\] and \[pg-b\]|\[pg-a\], \[pg-b\]/);
  lesson.sources[1].short = "PostgreSQL CREATE INDEX";
  assert.equal(lintSources(lesson, {}, new Set(["a"])).warnings.find((x) => x.rule === "label"), undefined);
});
