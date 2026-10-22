// __TITLE__: an Explainer figure. Start here: replace the binary search with your concept.
//
// A figure is a real, deterministic simulation. build() runs the algorithm for real and narrates it step by
// step through the builder `s`; the engine turns those steps into the lit world, the captions, the scrubber
// and the meters. Nothing here chooses a colour, a size or a position: layout, look and motion come from the
// engine. Every number a caption prints must come from the run.
//
// It is also a lesson for a beginner who knows basic programming but not this idea. Plan it before the code
// (references/teaching.md): the question, an everyday picture, the problem before the solution, one new idea per
// chapter, the word for each thing defined in plain words before it is used, a prediction, a recap.
//
// The words live in lesson.mjs beside this file, keyed by the ids given here: s.step(caption, { id, vars }),
// s.phase(name, { about, id }), s.ask(…, { id }). This file owns the facts and passes them as vars; the lesson only
// formats them. Each caption here is the fallback for a step the lesson has no words for. The model to copy is
// examples/mapreduce (figure.mjs + lesson.mjs).
//
// Read it:    node __SCRIPTS__/lesson.mjs figure.mjs         (the whole lesson as text, every layer, then the teaching checks)
// Check it:   node __SCRIPTS__/verify.mjs figure.mjs
// Build it:   node __SCRIPTS__/build.mjs figure.mjs            (one self-contained .html next to this file)
// Look at it: node __SCRIPTS__/shoot.mjs <page>.html           (screenshots + contact sheet)

// Title block and page metadata. `kicker` is shown as "ALGORITHMS · FIG 1"; `cite` names the primary source in
// lesson.sources as "[id]" (the title links to it), or { text, url } for a figure without a lesson.
export const meta = {
  title: "__TITLE__",
  subtitle: "Halving a sorted list until one number is left",
  kicker: "Algorithms",
  fig: 1,
  cite: "[knuth1998] §6.2.1",
  theme: "light",
  // "intro" (a first encounter: few slow chapters, one or two numbers), "core" (the default) or "deep"
  level: "intro",
  // the start card's question, in the reader's words: the one thing the run answers
  hook: "A list of numbers in order. How can you find one in a few looks, or know it is not there?",
  // plain definitions; mark the first use of each word in a caption or about with {term:name}
  terms: {
    index: "a box's position in the list, counting from 0",
    window: "the part of the list where the number could still be",
  },
  // 2–4 short lines on what the run showed, shown at the end above the takeaway
  recap: [
    "The list is in order, so one look tells you which half to keep.",
    "Every look throws away half of the window.",
    "Found or missing, a few looks settle it.",
  ],
  // the one sentence worth remembering: true in every story, at every knob setting
  takeaway: "Each look throws away half of what is left, so a thousand numbers need only about ten looks.",
};

// Knobs in the settings drawer. Changing one re-runs build() instantly. verify.mjs runs every int/float at its
// min and max, every bool both ways and every select at its first and last option, so give ranges you mean.
// A first-encounter lesson keeps one or two; every knob is something a beginner must understand first.
export const params = {
  n:    { label: "Numbers", type: "int", min: 4, max: 12, value: 10 },
  seed: { label: "Seed",    type: "int", value: 7 },          // all randomness comes from s.rng, seeded from this
  // also: { type: "float", min, max, step }, { type: "bool" }, { type: "text" }, { type: "select", options: [{ value, label }] }
};

// Stories (the story picker). Label them in the learner's words; `whatIf` finishes "What if…" as a learner would
// ask it; `description` is one plain sentence on what happens. build() also receives the id.
export const scenarios = [
  { id: "found",   label: "It is there", whatIf: "the number is in the list",
    description: "The number is in the list, so the window closes on it in a few looks." },
  { id: "missing", label: "It is missing", whatIf: "the number is not in the list",
    description: "The number is not in the list, so the window shrinks until nothing is left." },
];

// The numbers, in display order. format: "int" | "bytes" | "ms" | "pct" | "x". Mark the one or two that tell
// the story `primary`; plain labels, and a hint that says what the number means.
export const counters = {
  looks:  { label: "looks", format: "int", primary: true,
            hint: "How many numbers we have compared with the one we want." },
  window: { label: "places left", format: "int",
            hint: "How many places the number could still be in." },
};

// Properties that must hold on every step's snapshot; verify.mjs checks them for every scenario and param
// extreme. Return true, or a message saying what went wrong. snap.counters holds the meter values.
export const invariants = {
  "at most ⌈log2(n+1)⌉ looks": (snap, { params: p }) => {
    const bound = Math.ceil(Math.log2(p.n + 1));
    return (snap.counters.looks ?? 0) <= bound || `${snap.counters.looks} looks, bound ${bound} for n = ${p.n}`;
  },
  "the window never grows": (snap, { params: p }) => (snap.counters.window ?? p.n) <= p.n || `window ${snap.counters.window} > n = ${p.n}`,
};

// Optional: the code panel (C key). s.line(from, to) lights lines as the run goes.
export const code = {
  lang: "python",
  source: [
    "def search(a, key):",
    "    lo, hi = 0, len(a) - 1",
    "    while lo <= hi:",
    "        mid = (lo + hi) // 2",
    "        if a[mid] == key: return mid",
    "        if a[mid] < key: lo = mid + 1",
    "        else: hi = mid - 1",
    "    return None",
  ].join("\n"),
};

// The simulation. Calls before the first s.step() set up the opening picture (no animation); every s.step()
// after that commits one animated step. Its id names it for lesson.mjs (one id for every repeat of a move), its vars
// carry the run's values the words print, and its caption (what happened and why, at most ~18 words) is the fallback.
// s.phase(name, { about, id }) starts a chapter: `about` is 1–2 plain sentences on what it does and why.
export function build(s, p, scenario) {
  // Real data: sorted numbers from the seeded RNG (never Math.random, which would break determinism).
  const keys = [];
  for (let i = 0, v = s.rng.int(3, 9); i < p.n; i++, v += s.rng.int(3, 11)) keys.push(v);
  const key = scenario === "missing" ? keys[Math.floor(p.n / 3)] + 1 : keys[s.rng.int(0, p.n - 1)];

  const a = s.array("a", keys, { label: "a" });               // -> { id, cells: [tile ids], cell(i) }
  const num = (v) => ({ code: String(v) });                     // a var printed as inline code: `28`
  const V = { n: p.n, key: num(key), last: p.n - 1, arrayId: a.id };   // run-wide vars, passed to every step
  const step = (id, caption, vars = {}, o = {}) => s.step(caption, { ...o, id, vars: { ...V, ...vars } });
  s.pointer("lo", { at: a.cell(0), text: "lo" });
  s.pointer("hi", { at: a.cell(p.n - 1), text: "hi" });
  s.gauge("window", p.n);
  // The first chapter carries the everyday picture and maps it onto the parts on screen.
  s.phase("The idea", { id: "idea", about: "Think of looking up a word in a dictionary. You open it in the middle, see whether your word comes before or after, and ignore the other half. A sorted list works the same way." });
  s.line(1, 2);
  // The problem before the solution: what the naive way would cost.
  step("idea.problem", `${p.n} numbers in order. We want \`${key}\`. Checking one by one could take ${p.n} looks.`);
  step("idea.window", `The {term:window} starts as the whole list: every {term:index} from 0 to ${p.n - 1}.`);

  s.phase("Look in the middle", { id: "halve", about: "Compare the number we want with the middle of the window. The list is in order, so the answer tells us which half cannot hold it, and we drop that half." });
  let lo = 0, hi = p.n - 1, at = -1, looks = 0, asked = false;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (!s.has("mid")) s.pointer("mid", { at: a.cell(mid), text: "mid" });
    else s.point("mid", a.cell(mid));
    s.count("looks"); looks++;
    s.lit(a.cell(mid));                                         // the one thing to watch this step
    s.tag(a.cell(mid), `a[${mid}] = ${keys[mid]}`);             // a floating chip for this step only
    s.line(4);
    const here = { mid, value: num(keys[mid]), midId: a.cell(mid), looks };
    step("halve.look", `Look at the middle of the window: index ${mid} holds \`${keys[mid]}\`.`, here);
    if (keys[mid] === key) {
      s.set(a.cell(mid), { tone: "ok" });
      s.line(5);
      step("halve.found", `\`${keys[mid]}\` is the number we want: {tone:ok|found} after ${looks} ${looks > 1 ? "looks" : "look"}.`, here);
      at = mid;
      break;
    }
    const right = keys[mid] < key;
    // Predict once, where a beginner might guess wrong; `why` is shown when the answer is revealed.
    if (!asked) {
      asked = true;
      s.ask(`The middle is ${keys[mid]} and we want ${key}. Which half can we drop?`,
        ["The left half", "The right half", "Neither: we must check both"], right ? 0 : 1,
        { id: "halve.which", why: `The list is in order, so every number ${right ? "left" : "right"} of ${keys[mid]} is ${right ? "smaller" : "bigger"} than ${keys[mid]}, and so cannot be ${key}.` });
    }
    for (let i = right ? lo : mid; i <= (right ? mid : hi); i++) s.set(a.cell(i), { dim: true });   // ruled out
    if (right) lo = mid + 1; else hi = mid - 1;
    if (lo <= hi) { s.point("lo", a.cell(lo)); s.point("hi", a.cell(hi)); }
    s.gauge("window", Math.max(0, hi - lo + 1));
    s.line(right ? 6 : 7);
    const left = Math.max(0, hi - lo + 1);
    step("halve.drop", `\`${keys[mid]}\` is ${right ? "smaller" : "bigger"} than \`${key}\`, so we drop the ${right ? "left" : "right"} half: ${left} ${left === 1 ? "place" : "places"} left.`,
      { ...here, side: right ? "left" : "right", than: right ? "smaller" : "bigger", left });
  }

  s.phase("The answer", { id: "answer", about: at >= 0 ? "Found. Each look halved the window, so even a long list needs only a few looks." : "The window is empty, so the number is not in the list. Proving that took only a few looks too." });
  s.focus(a.id);                                                // the payoff: frame the whole list for the closing shot
  s.line(at >= 0 ? 5 : 8);
  if (at >= 0) step("answer.found", `Found at index ${at} in ${looks} ${looks > 1 ? "looks" : "look"}; one by one could take up to ${p.n}.`, { at, looks });
  else step("answer.missing", `Nothing is left in the window: \`${key}\` is {tone:fail|not in the list}, after ${looks} looks.`, { looks });

  // The end check (references/teaching.md section 5): give each story its own s.check questions, answered by this
  // run's rules at other knob values, one marked { transfer: true }, and after the first story one earlier idea at
  // new numbers. A housing's sub carries its live state (s.set(id, { sub: "4 slips" })). examples/mapreduce shows both.
}
