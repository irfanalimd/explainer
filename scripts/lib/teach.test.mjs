// node --test scripts/lib/teach.test.mjs   (the lesson extractor and the teaching lint, on the real engine)
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "../../engine/scene/index.mjs";
import { rng } from "../../sim/rng.mjs";
import * as template from "../templates/figure.mjs";
import { extractLesson, formatLesson, flat } from "./lesson.mjs";
import { lintLesson, lintVariants, wordsShown, sentences, grade, syllables, JARGON } from "./teach.mjs";

const lessonOf = (fig) => extractLesson(fig, compile, { rng });
const lint = (fig) => lintLesson(lessonOf(fig), fig);
const rules = (f, level = "warnings") => f[level].map((x) => x.rule);
const has = (f, rule, re, level = "warnings") => f[level].some((x) => x.rule === rule && (!re || re.test(x.message)));

// a small figure whose parts each test can bend
function figure({ meta = {}, scenarios, steps } = {}) {
  return {
    meta: { title: "Linked list", level: "intro", hook: "Why does reaching the 5th box take five steps?",
      takeaway: "To reach a box you follow the arrows from the front.",
      recap: ["Each box keeps a value and an arrow.", "You reach a box by following arrows."],
      terms: { pointer: "an arrow that says where the next box lives" }, ...meta },
    scenarios: scenarios ?? [{ id: "walk", label: "Walk the list", description: "We follow the arrows from the front to the third box." }],
    build(s) {
      s.container("list", { axis: "x" });
      for (let i = 0; i < 3; i++) s.tile(`b${i}`, { in: "list", text: String(10 * (i + 1)) });
      s.phase("Boxes", { about: "Think of a treasure hunt: each box holds a clue and directions to the next box." });
      (steps ?? ((s) => {
        s.step("Three boxes, each with a value.");
        s.step("Each box keeps a {term:pointer} to the next box.");
        s.phase("Walk", { about: "To reach a box we start at the front and follow the arrows." });
        s.ask("How many arrows to reach the third box?", ["One", "Two", "Three"], 1, { why: "You start on the first box, so two arrows take you to the third." });
        s.lit("b2");
        s.step("Two arrows later we reach the third box.");
      }))(s);
    },
  };
}

test("the template is a clean model lesson: no errors, no warnings", () => {
  const f = lint(template);
  assert.deepEqual(f.errors, []);
  assert.deepEqual(f.warnings, [], JSON.stringify(f.warnings, null, 1));
  assert.equal(f.info.level, "intro");
});

test("the lesson reads like a script: hook, words, chapters, captions, predict with why, recap, takeaway", () => {
  const text = formatLesson(lessonOf(template)).replace(/\s+/g, " ");
  for (const needle of ["HOOK", "WORDS", "▸ Chapter 1 of 3 · The idea", "Think of looking up a word in a dictionary", "PREDICT", "✓", "why: The list is in order",
    "[window: the part of the list where the number could still be]", "RECAP", "TAKEAWAY", "Story 2 of 2 · It is missing", "repeat story 1 and are skipped"]) {
    assert.ok(text.includes(needle), `missing ${needle}\n${text}`);
  }
  assert.ok(!/\{(key|ref|tone|term):/.test(text), "markup is flattened");
});

test("a clean small figure passes; flat() flattens every mark", () => {
  const f = lint(figure());
  assert.deepEqual(f.errors, []);
  assert.deepEqual(rules(f), []);
  assert.equal(flat("{key:fox} to {ref:r1|reduce 1} via {term:pointer|pointers}, `x`, {tone:fail|crashes}"), "fox to reduce 1 via pointers, `x`, crashes");
});

test("clear defects are errors: an undefined term, an answer that is not an option, a bad level, a bad recap", () => {
  const f = lint(figure({ meta: { level: "beginner", recap: 7 }, steps: (s) => {
    s.step("Each box keeps a {term:link} to the next.");
    s.ask("Which?", ["One", "Two"], 5);
    s.step("Done.");
  } }));
  assert.ok(has(f, "terms", /\{term:link\}.*no definition/, "errors"));
  assert.ok(has(f, "ask", /answer 5/, "errors"));
  assert.ok(has(f, "level", /must be "intro"/, "errors"));
  assert.ok(has(f, "recap", /list of 2–4/, "errors"));
});

test("advisories: no hook question, no analogy, no recap, no level, a question without why", () => {
  const f = lint(figure({ meta: { hook: "Linked lists", recap: undefined, level: undefined }, steps: (s) => {
    s.step("Each box keeps a {term:pointer} to the next box.");
    s.ask("How many arrows?", ["One", "Two"], 1);
    s.step("Two arrows.");
  } }));
  const fig2 = figure();
  fig2.build = ((orig) => (s) => { s.container("list", { axis: "x" }); s.tile("a", { in: "list" }); s.phase("Boxes", { about: "Boxes in a row." }); s.step("Boxes {term:pointer}."); s.step("More."); })();
  const g = lint(fig2);
  assert.ok(has(f, "hook", /end in the question/));
  assert.ok(has(f, "recap", /no meta.recap/));
  assert.ok(has(f, "level", /no meta.level/));
  assert.ok(has(f, "ask", /without a why/));
  assert.ok(has(g, "analogy"));
});

test("a defined word used before it is marked, and a defined word never marked", () => {
  const f = lint(figure({ meta: { terms: { pointer: "an arrow to the next box", node: "one box of the list" } }, steps: (s) => {
    s.step("The pointer of each box leads on.");
    s.step("Each box keeps a {term:pointer} to the next box.");
  } }));
  assert.ok(has(f, "terms", /"pointer" is used \(.*step 0\) before it is defined/));
  assert.ok(has(f, "terms", /meta.terms\["node"\] is never used/));
});

test("jargon: flagged when undefined, quiet when glossed inline or defined as a term; always flagged in labels", () => {
  const bare = lint(figure({ steps: (s) => { s.step("The pivot moves left."); s.step("Each box keeps a {term:pointer}."); } }));
  assert.ok(has(bare, "jargon", /pivot \(.*step 0\)/));
  const glossed = lint(figure({ steps: (s) => { s.step("The pivot, the value we compare with, moves left."); s.step("A {term:pointer} again."); } }));
  assert.ok(!has(glossed, "jargon"));
  const called = lint(figure({ steps: (s) => { s.step("The value we compare with is called the pivot."); s.step("A {term:pointer} again."); } }));
  assert.ok(!has(called, "jargon"));
  const asTerm = lint(figure({ meta: { terms: { pointer: "an arrow to the next box", pivot: "the value we compare with" } },
    steps: (s) => { s.step("The {term:pivot} moves left."); s.step("A {term:pointer} again."); } }));
  assert.ok(!has(asTerm, "jargon"));
  const labels = lint(figure({ scenarios: [{ id: "a", label: "Hot key", description: "One key is hashed everywhere." }, { id: "b", label: "Straggler", description: "One machine is slow." }] }));
  assert.ok(has(labels, "labels", /Hot key.*hot key/));
  assert.ok(has(labels, "labels", /Straggler/));
  // the everyday verb is not the MapReduce phase
  const shuffled = lint(figure({ scenarios: [{ id: "a", label: "Shuffled input", description: "The numbers are shuffled first." }] }));
  assert.ok(!has(shuffled, "labels"));
});

test("sizing by level: an intro lesson with many chapters and knobs is told to slim down", () => {
  const fig = figure({ steps: (s) => {
    for (let k = 0; k < 7; k++) { s.phase(`Part ${k}`, { about: "One idea, in plain words." }); s.step(`Part ${k} has one step, with a {term:pointer}.`); }
  } });
  fig.params = { a: { label: "A", type: "int", min: 1, max: 3, value: 1 }, b: { label: "B", type: "bool", value: true }, c: { label: "C", type: "bool", value: false }, seed: { label: "Seed", type: "int", value: 1 } };
  const f = lint(fig);
  assert.ok(has(f, "size", /7 chapters for an intro lesson \(5 at most\)/), JSON.stringify(f.warnings));
  assert.ok(has(f, "size", /3 knobs/));
});

test("captions over the budget and long sentences are reported once, with the worst example", () => {
  const f = lint(figure({ steps: (s) => {
    s.step("This caption goes on and on with many words about the boxes and the arrows and the values they hold today.");
    s.step("Each box keeps a {term:pointer} to the next box.");
  } }));
  assert.ok(has(f, "caption", /1 caption over 18 words \(longest 21/));
});

test("text helpers: sentences, syllables, grade", () => {
  assert.deepEqual(sentences("It costs 4.5 ms. Then it stops! Why?"), ["It costs 4.5 ms.", "Then it stops!", "Why?"]);
  assert.equal(syllables("the"), 1);
  assert.equal(syllables("pointer"), 2);
  assert.equal(syllables("permutation"), 4);
  const easy = grade(Array(6).fill("The cat sat on the mat. It was a big cat."));
  const hard = grade(Array(6).fill("Consistent hashing redistributes approximately one Nth of the keyspace whenever membership changes occur unexpectedly."));
  assert.ok(easy < 3 && hard > 12, `${easy} ${hard}`);
  assert.equal(grade("too short"), null);
  assert.ok(JARGON.every((j) => j.word && j.plain && j.re instanceof RegExp));
});

test("tone: words that tell a beginner it should be easy", () => {
  const f = lint(figure({ steps: (s) => { s.step("Obviously the box keeps a {term:pointer}."); s.step("We simply follow it."); } }));
  assert.ok(has(f, "tone", /"obviously" \(.*step 0\).*"simply"/));
});

test("knobs marked hidden: true (kept out of the settings drawer) do not count toward the knob limit", () => {
  const fig = figure();
  fig.params = { a: { label: "A", type: "int", min: 1, max: 3, value: 1 }, b: { label: "B", type: "bool", value: true },
    c: { label: "C", type: "bool", value: false, hidden: true }, d: { label: "D", type: "bool", value: false, hidden: true }, seed: { label: "Seed", type: "int", value: 1 } };
  assert.ok(!has(lint(fig), "size", /knobs/), "2 shown knobs fit an intro lesson");
  delete fig.params.c.hidden;
  assert.ok(has(lint(fig), "size", /3 knobs for an intro lesson/));
  assert.ok(formatLesson(lessonOf(fig)).includes("3 knobs (A, B, C)"), "the script lists only the knobs a reader sees");
});

test("chapter names are checked for jargon like story labels: the scrubber shows them before anything is explained", () => {
  const f = lint(figure({ steps: (s) => {
    s.step("Three boxes, each with a value.");
    s.phase("Pivot", { about: "We pick one box to compare with." });
    s.step("Each box keeps a {term:pointer} to the next box.");
  } }));
  assert.ok(has(f, "labels", /chapter name "Pivot" \(pivot\)/), JSON.stringify(f.warnings));
  assert.ok(!has(lint(figure()), "labels"));
});

// a figure whose captions change with a knob: at n = 9 the walk caption grows long and a new word slips in
function knobbed() {
  const fig = figure({ steps: (s) => {
    const n = s.params.n;
    s.step("Three boxes, each with a value.");
    s.step("Each box keeps a {term:pointer} to the next box.");
    s.phase(n > 5 ? "Walk the heap" : "Walk", { about: "To reach a box we start at the front and follow the arrows." });
    s.ask("How many arrows to reach the third box?", ["One", "Two", "Three"], 1, { why: "You start on the first box, so two arrows take you to the third." });
    s.step(n > 5 ? `We follow ${n} arrows one after another from the front, past every box, obviously, until we reach box number ${n}.` : "Two arrows later we reach the third box.");
    if (n > 5) s.step("The latency adds up, and {term:link} is undefined here.");
    if (n > 5) s.step("Obviously this is slow.");
  } });
  fig.params = { n: { label: "Boxes", type: "int", min: 3, max: 9, value: 3 }, seed: { label: "Seed", type: "int", value: 1 } };
  return fig;
}
const variantsOf = (fig, values) => values.map((n) => ({ label: `walk · n=${n}`, words: wordsShown(compile(fig, { params: { n, seed: 1 }, scenario: "walk", rng })) }));

test("other knob values: captions, words and chapter names a run shows only there are linted too, each once", () => {
  const fig = knobbed(), L = lessonOf(fig), base = lintLesson(L, fig);
  assert.deepEqual(base.errors, []);
  assert.deepEqual(rules(base), [], JSON.stringify(base.warnings));
  const v = lintVariants(L, [...variantsOf(fig, [9]), ...variantsOf(fig, [9, 8])], fig, base);
  assert.ok(has(v, "caption", /at other settings: 1 caption over 18 words \(longest 2\d, walk · n=9, step 2/), JSON.stringify(v.warnings));
  assert.ok(has(v, "jargon", /at other settings: .*latency \(walk · n=9, step 3\)/));
  assert.ok(has(v, "labels", /chapter names: "Walk the heap" \(heap/));
  assert.ok(has(v, "tone", /"obviously"/));
  assert.equal(v.errors.filter((e) => e.rule === "terms").length, 1, "the undefined term is reported once, not per run");
  // the same words at other settings as at the defaults: nothing new to say
  assert.deepEqual(lintVariants(L, variantsOf(fig, [3, 4]), fig, base), { errors: [], warnings: [] });
  // a word the default findings already name is not reported again
  const fig2 = knobbed(), build2 = fig2.build;
  fig2.build = (s, p, sc, env) => { build2(s, p, sc, env); s.step("The latency adds up."); };
  const L2 = lessonOf(fig2), base2 = lintLesson(L2, fig2);
  assert.ok(has(base2, "jargon", /latency/));
  assert.ok(!has(lintVariants(L2, variantsOf(fig2, [9]), fig2, base2), "jargon", /latency/));
  assert.equal(lintVariants(L2, variantsOf(fig2, [9]), fig2, base2).warnings.filter((w) => w.rule === "tone").length, 1);
});
