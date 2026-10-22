import { test } from "node:test";
import assert from "node:assert/strict";
import { lintSource, lintRepeats, proseStrings, styleFindings, formatHit } from "./style.mjs";

const rules = (src) => lintSource(src, "lesson.mjs").map((h) => `${h.rule}:${h.match.toLowerCase()}`);

test("banned words and stock phrases are found, with the line and a rewrite", () => {
  const src = [
    "export const lesson = {",
    "  steps: {",
    '    a: { plain: "This step is crucial: the master leverages the input." },',
    '    b: { plain: "It\'s worth noting that the counter plays a key role here." },',
    "  },",
    "};",
  ].join("\n");
  const hits = lintSource(src, "lesson.mjs");
  assert.deepEqual(hits.map((h) => [h.line, h.rule, h.match]), [[3, "words", "crucial"], [3, "words", "leverages"], [4, "phrases", "It's worth noting"], [4, "phrases", "plays a key role"]]);
  assert.match(formatHit(hits[0]), /^lesson\.mjs:3 {2}words {2}"crucial" → drop it, or say what breaks without it {2}\(plain: "This step is crucial: the master leverages the input\."\)$/);
});

test("figurative words only: a landscape phone, a test harness and unlocking a mutex are not flagged", () => {
  assert.deepEqual(rules('x = { plain: "On a landscape phone the test harness runs, and the thread can unlock the mutex." };'), []);
  assert.deepEqual(rules('x = { plain: "The cache will unlock new possibilities and harness the power of the disk." };'), ["words:unlock new possibilities", "words:harness the power"]);
});

test("softeners: the intensifier very, not \"the very same\"; just only where it softens", () => {
  assert.deepEqual(rules('x = { plain: "It is a very common word, basically." };'), ["hedges:very", "hedges:basically"]);
  assert.deepEqual(rules('x = { plain: "Program B reads the very same address, and it just hears nothing back." };'), []);
  assert.deepEqual(rules('x = { plain: "You just need to follow the arrow." };'), ["hedges:just need"]);
});

test("openers, not-just-but, praise tricolons, fluff and punctuation", () => {
  assert.deepEqual(rules('x = { about: "Moreover, the list grows. Ultimately it ends." };'), ["openers:moreover", "openers:ultimately"]);
  assert.deepEqual(rules('x = { about: "It is not just fast, but also exact." };'), ["contrast:not just fast, but also"]);
  assert.deepEqual(rules('x = { about: "The ring is fast, reliable and scalable." };'), ["tricolon:fast, reliable and scalable"]);
  assert.deepEqual(rules('x = { about: "The tree cleverly splits the page!" };'), ["fluff:cleverly", "punctuation:!"]);
  assert.deepEqual(rules('x = { about: "The page splits — then the parent splits." };'), ["punctuation:—"]);
  assert.deepEqual(rules('x = { about: "Ranges like 150–300 ms use an en dash." };'), []);
});

test("a question in an explaining field is flagged; in a hook, a prediction or a teacher's prompt it is not", () => {
  assert.deepEqual(rules('x = { why: "Which keys move? The ones on its arc." };'), ["questions:?"]);
  assert.deepEqual(rules('x = { hook: "Why does it stay exact?", question: "Which counter gets fox?", prompt: "What would you try first?" };'), []);
  assert.deepEqual(lintSource('s.step("Where does await send the rest?", { id: "a" });', "figure.mjs").map((h) => h.rule), ["questions"]);
});

test("a vague amount is flagged only in a step's deeper layers, and only without a number or a source", () => {
  assert.deepEqual(rules('x = { deeper: { real: "Many databases split pages this way." } };'), ["vague:many"]);
  assert.deepEqual(rules('x = { deeper: { real: "PostgreSQL splits pages this way, often at 90%." } };'), []);
  assert.deepEqual(rules('x = { deeper: { cost: "One read per level, however many pages the tree holds." } };'), []);
  assert.deepEqual(rules('x = { deeper: { edge: "Browsers often throttle timers to once a second." } };'), []);
  // the picture map's "real" side is not a claim about real systems
  assert.deepEqual(rules('x = { picture: { map: [{ picture: "seats", real: "virtual nodes: many seats for one server" }] } };'), []);
});

test("under the hood is allowed once per file", () => {
  assert.deepEqual(rules('x = { a: "Under the hood, the page splits.", b: "Under the hood, the tree grows." };'), ["phrases:under the hood"]);
});

test("prose strings: keys, ids, imports and the program listing are skipped; the field is the key or the call", () => {
  const src = [
    'import { x } from "../../engine/a really very bad path.mjs";',
    'export const code = { lang: "py", source: "# this is very crucial\\nprint(1)" };',
    'const meta = { title: "MapReduce", "a very long key": "it is fine" };',
    's.step(`Map ${i} writes a slip`, { id: "map.write" });',
    's.ask("Which machine gets it?", ["map 0 gets it", "map 1 gets it"], 0);',
    'const recap = { recap: ["One counter adds up a word.", "Each slip travels once."] };',
  ].join("\n");
  assert.deepEqual(proseStrings(src).map((p) => [p.field, p.value]), [
    ["a very long key", "it is fine"], ["step#0", " writes a slip"], ["ask#0", "Which machine gets it?"],
    ["ask#1", "map 0 gets it"], ["ask#1", "map 1 gets it"], ["recap", "One counter adds up a word."], ["recap", "Each slip travels once."]]);
  assert.deepEqual(rules(src), []);
});

test("chips, inline code and template slots are not read as words", () => {
  assert.deepEqual(rules('x = { plain: "`crucial()` hands {key:vital} to {count:n|robust thing}." };'), []);
});

const lessonOf = (steps, extra = {}) => ({ recap: [], stories: [{ id: "a", recap: extra.recap ?? [], takeaway: "", chapters: [{ name: "C", id: "c", aboutText: "", steps }] }] });

test("repeats: a why that only restates its step, and a sentence said in two places", () => {
  const L = lessonOf([
    { index: 0, id: "s.one", layers: { plain: "The master cuts the text into three pieces.", why: "It cuts the text into pieces." } },
    { index: 1, id: "s.two", layers: { plain: "Each machine reads its own piece of the text.", why: "No machine waits for another to finish its piece.",
      deeper: { how: "Every update carries the leader's commit index to each follower.", source: "Dean and Ghemawat, OSDI 2004, section three." } } },
    { index: 2, id: "s.three", layers: { plain: "Map 1 writes four slips for its four words.",
      deeper: { how: "Every update carries the leader's commit index to each follower.", source: "Dean and Ghemawat, OSDI 2004, section three." } } },
  ]);
  const hits = lintRepeats(L);
  assert.deepEqual(hits.map((h) => [h.rule, h.match]), [["repeats", "why"], ["repeats", "same sentence"]]);
  assert.match(hits[0].fix, /restates the step/);
  assert.match(hits[1].fix, /said in 2 places \(s\.two deeper\.how; s\.three deeper\.how\)/);
});

test("styleFindings groups the hits as one warning per rule", () => {
  const { warnings, hits } = styleFindings({ lesson: lessonOf([{ index: 0, id: "x", layers: { plain: "The master cuts the text into three pieces now.", why: "It cuts the text into pieces now." } }]) });
  assert.equal(hits.length, 1);
  assert.deepEqual(warnings.map((w) => [w.kind, w.rule]), [["teaching", "writing"]]);
  assert.match(warnings[0].message, /^1 repeated words \(references\/writing\.md\): lesson "why" → the why restates the step/);
});
