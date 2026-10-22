// The words __TITLE__ teaches (CONTRACTS.md section 10), keyed by the ids figure.mjs gives its steps, chapters and
// questions. The figure owns every fact and passes it as a var; nothing here computes. Every line must stay true at
// every knob value and in every scenario (verify runs them all and checks each template, look id and misconception).
// Writing rules: references/teaching.md section 5 (what goes where) and references/writing.md (how every sentence
// reads; `node scripts/lesson.mjs figure.mjs --style` lists what to fix). The model to copy: examples/mapreduce/lesson.mjs.
//   run-wide vars: n, key, last, arrayId
//   halve steps:   mid, value, midId, looks; side, than, left (a drop)
//   answer:        at, looks
const SOURCE = "D. E. Knuth, The Art of Computer Programming, Vol. 3, §6.2.1, https://www-cs-faculty.stanford.edu/~knuth/taocp.html";

export const lesson = {
  goal: "Find a number in a sorted list, or prove it is missing, in a few looks.",
  objectives: [
    { id: "o-half", text: "Say which half to drop after one look, and why the order of the list allows it." },
    { id: "o-cost", text: "Estimate how many looks a list of a given length needs." },
  ],

  // the wrong beliefs a beginner brings; an ask option names each one (asks, below)
  misconceptions: [
    { id: "m-both", wrong: "You still have to check both halves to be sure.", fix: "The list is in order, so one look rules a whole half out." },
  ],

  // the everyday picture, shown once in full on a chapter's entry card (enter.picture), then one line per flagged step
  picture: {
    name: "looking up a word in a dictionary",
    rows: [
      { id: "middle", picture: "opening the dictionary in the middle", real: "looking at the middle of the window" },
      { id: "half", picture: "ignoring the pages before or after", real: "dropping half of the window", term: "window" },
    ],
    breaks: "You might skip ahead by feel in a dictionary; here every look is exactly in the middle.",
  },

  // lead: the plain words a beginner meets first; def: the definition (under 20 words)
  terms: {
    index: { lead: "a box's position", def: "A box's position in the list, counting from 0." },
    window: { lead: "where it could still be", def: "The part of the list where the number could still be." },
  },

  // objectives only some stories teach take stories: ["missing"]; next: [{ title, href, why }] names the lessons that
  // follow at the end of the last story; each chapter may carry teach: { prompt, listen, minutes } for whoever
  // teaches it (examples/mapreduce/lesson.mjs has all three)

  chapters: {
    idea: {
      about: "Think of looking up a word in a dictionary. You open it in the middle, see whether your word comes before or after, and ignore the other half. A sorted list works the same way.",
      enter: { sofar: "You can check a list one number at a time.", now: "See what checking one by one would cost.", done: "You know where the number could be: anywhere.", picture: true },
    },
    halve: {
      about: "Compare the number we want with the middle of the window. The list is in order, so the answer tells us which half cannot hold it, and we drop that half.",
      enter: { sofar: "The number could be anywhere in the {n} places.", now: "Look in the middle and drop the half that cannot hold it.", done: "The window has closed on the number, or is empty." },
    },
    answer: {
      enter: { now: "Count the looks.", done: "You can compare the looks with the {n} that one by one could take." },
    },
  },

  steps: {
    "idea.problem": {
      key: true,
      plain: "{n} numbers in order. We want {key}.",
      why: "Checking one by one could take {n} looks. The order lets us do far better.",
      look: ["{arrayId}"],
      deeper: { cost: "One by one takes up to n looks; halving takes about log2(n), so 1,000 numbers need about 10." },
    },
    "idea.window": {
      plain: "The {term:window} starts as the whole list: every {term:index} from 0 to {last}.",
      look: ["{arrayId}"],
    },
    "halve.look": {
      plain: "The middle of the window, index {mid}, holds {value}.",
      look: ["{midId}"], picture: "middle",
      first: {
        key: true,
        why: "One look at the middle splits the window into two halves.",
        deeper: { how: "The middle is (lo + hi) // 2, rounded down, so both halves differ by at most one.", source: SOURCE },
      },
    },
    "halve.drop": {
      plain: "{value} is {than} than {key}: drop the {side} half, {count:left|place} left.",
      look: ["{midId}"], picture: "half",
      first: { why: "Every number on that side is {than} still, so none of them can be {key}." },
    },
    "halve.found": {
      key: true,
      plain: "{value} is the number we want, after {count:looks|look}.",
      why: "Each look halved the window, so few looks were needed.",
      look: ["{midId}"],
      deeper: { cost: "This run took {count:looks|look} for {n} numbers; one by one could take up to {n}." },
    },
    "answer.found": {
      plain: "Found at index {at} in {count:looks|look}, out of {n} numbers.",
      look: ["{arrayId}"],
    },
    "answer.missing": {
      key: true,
      plain: "The window is empty: {key} is not in the list.",
      why: "Every place it could have been was ruled out, after {count:looks|look}.",
      look: ["{arrayId}"],
      deeper: { edge: "Proving a number is missing costs as many looks as finding one: the window must shrink to nothing." },
    },
  },

  // per-option feedback, paired with the figure's options by index; the figure's answer decides which is right
  asks: {
    "halve.which": {
      options: [
        { feedback: "That is the half to drop when the middle is smaller than {key}: everything left of it is smaller still." },
        { feedback: "That is the half to drop when the middle is bigger than {key}: everything right of it is bigger still." },
        { misconception: "m-both", feedback: "The list is in order, so one look settles a whole half. Checking both would be one by one again." },
      ],
    },
  },
};
