// Quicksort with Lomuto partitioning (the CLRS form: pivot = a[hi], i is where the next small value goes), run on a
// tracked array, for a beginner. Every comparison is a step (a later split says a run of numbers that stay put in
// one), its swap joins it, the active group is the only undimmed region, and each pivot turns ok when it lands in
// its final slot.
//
// Lesson plan (references/teaching.md)
//   Reader      knows arrays and loops; has never met a pivot, a partition or recursion.
//   Level       core, kept light: 5 chapters, one number in the recaps, two knobs.
//   Hook        comparing every pair is slow: how does quicksort skip most pairs, and when can't it?
//   Picture     a line of people ordered by height around one chosen person: shorter ones step left, taller ones
//               right, and the chosen person now stands exactly where they belong. Then the same in each group.
//               person = number, height = value, chosen person = pivot, the stepping aside = partition, doing it
//               again on each side = recursion. Unlike people, the computer moves one swap at a time.
//   Problem     the simple way (find the smallest, then the next…) compares every pair: n(n−1)/2. The first
//               round of it runs for real in chapter 1; the end compares quicksort's count with that total.
//   Ladder      The line · Split around one · Into place · Repeat on each side · Sorted
//   Misconception "the pivot lands in the middle": predicted before it swaps into place (random story).
//   Aha         the two sides of a placed pivot are never compared with each other (predicted in chapter 4).
//   Stories     Shuffled numbers · Already sorted input (the slow case) · Lots of repeated numbers
// Every question sits on its chapter's first step (or as early as the run allows), because the HUD withholds a
// chapter's about until its predictions are revealed.
//
// Ids for lesson.mjs (CONTRACTS.md 10). Every step passes the run-wide values below plus its own; the inline captions
// stay the fallback. A number in a slot is a chip { ref: tile id, text: value } (its tile id also as a string, for look).
//   run-wide    n, worst (every pair: n(n-1)/2), order ("random" | "sorted" | "dups" | "typed"), repeats (any value
//               twice), input (the numbers, in order)
//   chapters    line · split · place · repeat · sorted
//   line.numbers       distinct (how many different values), shown (the different values, a list)
//   line.simple        smallest, smallestId, first (n-1 comparisons), second (n-2)
//   split.pivot        pivot, pivotId, lo, hi
//   split.pointers     lo, hi
//   split.swap         x, xId, y, yId, pivot, pivotId, eq (x equals the pivot), i (the slot x moves to), j (x's slot)
//   split.take         x, xId, pivot, pivotId, eq, i, j                  (x is small and already at i)
//   split.stay         x, xId, pivot, pivotId, j                         (x is bigger: it stays right)
//   split.copy         as split.take or split.swap (y, yId when it swaps), eq true: the first copy of the pivot in
//                      the run, right after the split.equal ask (dups); repeat.copy when that copy is in a later split
//   place.swap         pivot, pivotId, y, yId, slot, before (numbers left of it), lo, hi, mid (the group's middle slot)
//   place.stay         pivot, pivotId, slot, before, lo, hi, mid         (nothing bigger: it is already last)
//   repeat.group       side ("left" | "right"), parent, parentId, lo, hi, size, pivot, pivotId
//   repeat.never       the aha, once (random story), in place of the first repeat.group or repeat.alone: that step's
//                      vars plus other (a number across the parent, never compared), otherId, left (the left number
//                      the repeat.compared ask names), leftId, alone (a group of one), lo, hi, pivot, pivotId (the
//                      group's pivot, or its one number)
//   repeat.swap · repeat.take · repeat.stay     as split.swap · split.take · split.stay
//   repeat.takes · repeat.stays                 a run of 2+ that stay put, said once: pivot, pivotId, xs (the
//                      numbers), xIds, count, from, to (their slots); takes adds eq (every one equals the pivot)
//   repeat.place · repeat.place-stay            as place.swap · place.stay
//   repeat.alone       side, parent, parentId, slot, x, xId              (a group of one is placed)
//   sorted.done        comparisons, saved (worst - comparisons), slowest (comparisons = worst)
//   asks               split.equal (dups) · place.where (random; options: right slot, middle, where it is now; only
//                      when those differ) · place.left (sorted, 3+ numbers) · repeat.compared (random)

import { tracked } from "../../sim/tracked.mjs";
import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "Quicksort",
  subtitle: "Split around one number, then do the same on each side",
  kicker: "Algorithms",
  fig: 2,
  level: "core",
  // the partition that runs is Lomuto's, as CLRS presents it (Hoare's 1961 original uses two converging markers)
  cite: "[clrs4] §7.1",
  theme: "light",
  hook: "Comparing every number with every other one is slow. How does quicksort sort with far fewer comparisons, and when does that fail?",
  terms: {
    pivot: "the number that every other number in the group is compared with",
    partition: "one pass that moves the smaller numbers left of a chosen number and the bigger ones right",
    recursion: "solving each smaller piece with the same steps, until the pieces are too small to need it",
  },
  recap: [
    "We picked one number, the pivot. Smaller or equal numbers went left, bigger ones right.",
    "The pivot then sits in its final slot and never moves again.",
    "Each side is split the same way, until every group has one number or none.",
    "The two sides are never compared, so even splits skip most pairs.",
  ],
  takeaway: "Each split puts one number in its final place and leaves two smaller groups that never need comparing with each other.",
};

export const params = {
  n: { label: "How many numbers", type: "int", min: 2, max: 12, value: 9 },
  input: { label: "Your own numbers (optional)", type: "text", value: "" },
  seed: { label: "Seed", type: "int", value: 7 },
};

export const scenarios = [
  { id: "random", label: "Shuffled numbers", params: { order: "random" }, whatIf: "the numbers are shuffled",
    description: "Shuffled numbers, the usual case: each split leaves two smaller groups to sort." },
  { id: "sorted", label: "Already sorted input", params: { order: "sorted" }, whatIf: "the numbers are already in order",
    description: "The numbers are already in order, so each split peels off only one number, which is the slowest case for this way of choosing.",
    takeaway: "With the last number as pivot, sorted input is the slowest case, because every pair gets compared. A random or middle pivot avoids it.",
    recap: [
      "In sorted input the last number of a group is always the biggest.",
      "So every split put all the others on one side and placed only one.",
      "Nothing was skipped. Every pair was compared, which is the slowest this pivot rule can be.",
    ] },
  { id: "dups", label: "Lots of repeated numbers", params: { order: "dups" }, whatIf: "most of the numbers are the same",
    description: "Only three different values, so copies of the chosen number all pile up on one side.",
    takeaway: "In this split, a copy of the pivot counts as small, so many repeats make lopsided, slow splits. A three-way split keeps copies beside the pivot instead.",
    recap: [
      "With only three values, many numbers equal the pivot.",
      "Equal counts as small, so every copy went to the left side.",
      "Lopsided splits placed few numbers each, so few pairs, or none, were skipped.",
    ] },
];

export const counters = {
  comparisons: { label: "comparisons", format: "int", primary: true,
    hint: "Times a number was checked against the pivot: most of quicksort's work. Checking every pair would take far more." },
  swaps: { label: "swaps", format: "int",
    hint: "Times two numbers traded places in the line." },
};

export const code = {
  lang: "python",
  source: [
    "def quicksort(a, lo, hi):",
    "    if lo >= hi:",
    "        return",
    "    p = partition(a, lo, hi)",
    "    quicksort(a, lo, p - 1)",
    "    quicksort(a, p + 1, hi)",
    "",
    "def partition(a, lo, hi):",
    "    pivot = a[hi]",
    "    i = lo",
    "    for j in range(lo, hi):",
    "        if a[j] <= pivot:",
    "            if i != j:",
    "                a[i], a[j] = a[j], a[i]",
    "            i += 1",
    "    if i != hi:",
    "        a[i], a[hi] = a[hi], a[i]",
    "    return i",
  ].join("\n"),
};

const sortedCopy = (xs) => xs.slice().sort((x, y) => x - y);

export const invariants = {
  "a permutation of the input": (snap) => {
    const st = stateOf(snap, "a");
    if (!st) return true;
    const a = sortedCopy(st.values), b = sortedCopy(st.input);
    return a.length === b.length && a.every((x, i) => x === b[i]) ? true : `a = [${st.values}] is not a permutation of [${st.input}]`;
  },
  "placed pivots are final": (snap) => {
    const st = stateOf(snap, "a");
    if (!st) return true;
    const want = sortedCopy(st.input);
    for (const k of st.placed ?? []) if (st.values[k] !== want[k]) return `a[${k}] = ${st.values[k]} was marked final but belongs to ${want[k]}`;
    return true;
  },
  "sorted at the end": (snap) => {
    const st = stateOf(snap, "a");
    if (!st || !st.done) return true;
    for (let i = 1; i < st.values.length; i++) if (st.values[i - 1] > st.values[i]) return `a[${i - 1}] = ${st.values[i - 1]} > a[${i}] = ${st.values[i]}`;
    return true;
  },
};

const typedOf = (p) => String(p.input ?? "").split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isInteger(x) && Math.abs(x) < 1000);

/** The input for given params: an explicit list wins, else n values in the chosen order. */
export function inputFor(p) {
  const typed = typedOf(p);
  if (typed.length >= 2) return typed.slice(0, 12);
  const n = Math.max(2, Math.min(12, p.n ?? 9));
  const r = rng(p.seed ?? 7).fork("quicksort-input");
  const order = p.order ?? "random";
  if (order === "dups") return Array.from({ length: n }, () => r.int(1, 3));
  const distinct = r.sample(Array.from({ length: 98 }, (_, i) => i + 2), n);
  return order === "sorted" ? sortedCopy(distinct) : distinct;
}

export function build(s, p, scenario, env = {}) {
  const input = inputFor(p);
  const n = input.length;
  const typed = typedOf(p).length >= 2;
  const order = typed ? "typed" : (p.order ?? "random");
  const sc = scenario ?? "random";
  const repeats = new Set(input).size < n;          // then "smaller" must read "no bigger"
  const worst = (n * (n - 1)) / 2;                  // comparisons for every pair

  // the pointer rods stand in front of the tiles (two can stack on one slot): reserve that strip of floor
  s.column("stage", { gap: 0, align: "center" });
  const a = tracked.array(s, "a", input, {
    in: "stage", label: "a", auto: "none",
    counters: { reads: false, writes: false },
    ...(order === "dups" ? { keyOf: (v) => `value ${v}` } : {}),
  });
  s.spacer("rods", { in: "stage", w: 2, d: 34 });
  const placed = [];
  a.state({ input: input.slice(), placed: [], done: false });
  const I = a.pointer("i", -1, { tone: "busy", say: false });   // shown when a split starts
  const J = a.pointer("j", -1, { say: false });

  // every caption is written here, in plain words; the tracked array only does the operations and the counting
  // a phone frames the whole line every step, so a close-up on a few tiles never cuts off the end of the array
  const V = { n, worst, order, repeats, input: input.slice() };
  const step = (id, caption, vars = {}, o) => { a.caption(); if (env.phone) s.focus("a", "rods"); s.step(caption, { ...o, id, vars: { ...V, ...vars } }); };
  const chip = (k) => fmt.ref(a.tile(k), a.show(a.values()[k]));   // the number in slot k, lit on hover
  const num = (k) => ({ ref: a.tile(k), text: a.show(a.values()[k]) });   // the same, as a lesson var
  const sideOf = (side, parent) => (side ? `${side === "left" ? "Left" : "Right"} of ${chip(parent)}` : "");
  const sideVars = (side, parent) => (side ? { side, parent: num(parent), parentId: a.tile(parent) } : {});

  // ---- chapter 1: the line, and what the simple way costs ----
  const values = a.values();
  const shown = fmt.and([...new Set(sortedCopy(values))].map(String));
  s.phase("The line", { id: "line", about: `Each number is a person in a line, and its value is their height. The simple way compares every pair: ${fmt.plural(worst, "comparison")}. Quicksort tries to skip most of them.` });
  step("line.numbers", order === "sorted" ? `${n} numbers, already in order: like a line of people already sorted by height.`
    : order === "dups" ? `${n} numbers, but only ${shown}: like a line of people of only ${new Set(values).size} heights.`
      : `${n} numbers to sort, like ${n} people in a line to order from shortest to tallest.`,
    { distinct: new Set(values).size, shown: [...new Set(sortedCopy(values))] });
  let m = 0;
  for (let k = 1; k < n; k++) if (values[k] < values[m]) m = k;
  s.lit(a.tile(m));
  s.tag(a.tile(m), `smallest: ${fmt.plural(n - 1, "comparison")}`);
  step("line.simple", n > 2
    ? `The simple way: ${n - 1} comparisons find the smallest, ${n - 2} the next${n > 3 ? ", and so on" : ""}: ${worst} in all.`
    : `The simple way compares the two numbers once: 1 comparison in all.`,
    { smallest: num(m), smallestId: a.tile(m), first: n - 1, second: n - 2 });

  // ---- one split: Lomuto, narrated ----
  let asked = { place: false, never: false, left: false, equal: false };
  const place = (k) => { placed.push(k); a.mark(k, k, "ok"); a.state({ placed: placed.slice() }); };

  function partition(lo, hi, side, parent, first) {
    const pivot = a.get(hi);
    const P = chip(hi);
    const pv = { pivot: num(hi), pivotId: a.tile(hi) };
    a.only(lo, hi);
    a.mark(hi, hi, "warn");
    if (first) {
      s.line(8, 9);
      step("split.pivot", `${P}, the last number, is the {term:pivot}: every other number is compared with it.`, { ...pv, lo, hi });
      I.to(lo);
      J.to(lo);
      s.line(10, 11);
      step("split.pointers", `Slots before \`i\` are the left side, for ${repeats ? "small" : "smaller"} numbers; \`j\` checks each number in turn.`, { lo, hi });
    } else {
      I.to(lo);
      J.to(lo);
      s.line(8, 11);
      const o = never ? never() : null;
      step(o ? "repeat.never" : "repeat.group", o ? o.caption(lo, hi, P) : `${sideOf(side, parent)}: slots ${lo}–${hi}, with pivot ${P}.`,
        { ...sideVars(side, parent), lo, hi, size: hi - lo + 1, ...pv, ...(o ? { ...o.vars, alone: false } : {}) }, o ? { keep: true } : undefined);
    }
    let i = lo;
    // the first copy of the pivot in the run is asked about (dups story) and gets its own step
    const vs = a.values();
    const copyAt = sc === "dups" && !asked.equal ? vs.findIndex((v, k) => k >= lo && k < hi && v === pivot) : -1;
    const small = (k) => vs[k] <= pivot;   // a scan swaps a[i] with a[j] (i ≤ j), so slots past j keep their values
    for (let j = lo; j < hi; j++) {
      // a later split says a run of numbers that do not move in one step: a prefix of small ones (each already at
      // `i`) or a stretch of bigger ones. The run stops before the copy that is asked about.
      let end = j;
      if (!first && j !== copyAt && (i === j || !small(j))) while (end + 1 < hi && end + 1 !== copyAt && small(end + 1) === small(j)) end++;
      if (end > j) {
        const take = small(j), from = j, xs = [];
        for (; j <= end; j++) {
          J.to(j);
          xs.push(num(j));
          a.cmp(j, hi);
          if (take) { a.mark(i, i, "busy"); i++; I.to(i); }
        }
        j = end;
        const all = vs.slice(from, end + 1).every((v) => v === pivot);
        s.line(11, take ? 15 : 12);
        step(take ? "repeat.takes" : "repeat.stays", take
          ? `The next ${xs.length} numbers, slots ${from}–${end}, are ${repeats ? "not bigger than" : "smaller than"} ${P}: they stay left.`
          : `The next ${xs.length} numbers, slots ${from}–${end}, are bigger than ${P}: they stay right.`,
          { ...pv, xs, xIds: xs.map((x) => x.ref), count: xs.length, from, to: end, ...(take ? { eq: all } : {}) });
        continue;
      }
      J.to(j);
      const x = chip(j), y = i !== j ? chip(i) : null, v = vs[j];
      const eq = v === pivot, copy = j === copyAt;
      const cv = { ...pv, x: num(j), xId: a.tile(j), j }, yv = y ? { y: num(i), yId: a.tile(i) } : {};
      if (copy) {
        asked.equal = true;
        s.ask(`${v} is the same as the pivot, ${pivot}. Which side does it go to?`,
          ["The left, with the smaller numbers", "The right, with the bigger numbers", "Neither: it waits beside the pivot"], 0,
          { id: "split.equal", why: `This split's rule is “smaller than or equal to the pivot goes left”, so every copy of ${pivot} lands on the left. A three-way split would keep it beside the pivot.` });
      }
      // the first split says each move in full; later splits repeat the same moves in a short form
      const small1 = eq ? `${x} equals ${P}, which counts as small` : `${x} is smaller than ${P}`;
      const short = repeats ? `${x} is not bigger than ${P}` : small1;   // one shape, so the repeats fold
      const ch = first ? "split" : "repeat";
      if (a.cmp(j, hi) <= 0) {
        if (i !== j) a.swap(i, j);
        a.mark(i, i, "busy");                        // the left side grows by one slot
        const at = i;
        i++;
        I.to(i);
        s.line(11, 15);
        step(copy ? `${ch}.copy` : `${ch}.${y ? "swap" : "take"}`,
          first || copy ? (y ? `${small1}: it swaps with ${y} onto the left side; \`i\` steps on.` : `${small1}: it is already at \`i\`, so the left side takes it.`)
            : (y ? `${short}: it swaps left with ${y}.` : `${short}: it stays left.`), { ...cv, ...yv, eq, i: at });
      } else {
        s.line(11, 12);
        step(`${ch}.stay`, first ? `${x} is bigger than ${P}, so it stays where it is, on the right side.` : `${x} is bigger than ${P}: it stays right.`, cv);
      }
    }
    // the pivot's final move: the misconception ("it lands in the middle") is asked right before it
    if (first) {
      s.phase("Into place", { id: "place", about: `The pivot swaps into the slot right after the last smaller number. Everything left of it is no bigger and everything right of it is bigger, so it is already where it belongs.` });
      if (sc === "random" && !asked.place) { asked.place = true; askPlace(lo, hi, i, pivot); }
      // two others at least, so "two groups" is a real alternative to "one group"
      if (sc === "sorted" && !asked.left && i === hi && hi - lo >= 2) {
        asked.left = true;
        const half = (hi - lo) >> 1, rest = hi - lo - half;
        s.ask(`Every number was smaller than ${pivot}. What is left to sort once ${pivot} is placed?`,
          [half === rest ? `Two groups of ${half} each` : `Two groups, of ${half} and ${rest}`, `One group: all ${hi - lo} others`, "Nothing: the line was already sorted"], 1,
          { id: "place.left", why: `${pivot} is the biggest, so all ${hi - lo} others sit on its left and its right side is empty. This split placed only one number.` });
      }
    }
    a.mark(hi, hi, null);   // slot marks stay on their slot: clear the pivot's before it moves
    if (i > lo) a.mark(lo, i - 1, null);
    const before = i - lo;
    const lv = { ...pv, slot: i, before, lo, hi, mid: (lo + hi) >> 1 };
    const fewer = repeats ? `${fmt.plural(before, "number")} no bigger than it` : `${fmt.plural(before, "smaller number")}`;
    if (i !== hi) {
      const Y = chip(i), yv = { y: num(i), yId: a.tile(i) };
      a.swap(i, hi);
      s.line(16, 18);
      place(i);
      I.hide(); J.hide();
      step(first ? "place.swap" : "repeat.place", !first ? `${P} swaps with ${Y} into slot ${i}: placed for good.`
        : before ? `${P} swaps with ${Y} into slot ${i}, after the ${fewer}. Placed for good.`
          : `${P} swaps with ${Y} into slot ${i}, the front of its group: nothing is smaller. Placed for good.`, { ...lv, ...yv }, { keep: !!first });
    } else {
      s.line(16, 18);
      place(i);
      I.hide(); J.hide();
      step(first ? "place.stay" : "repeat.place-stay", first && sc === "sorted"
        ? `Nothing is bigger than ${P}: it stays in slot ${i}, and the other ${before} still need sorting.`
        : first ? `Nothing in this group is bigger than ${P}, so it stays in slot ${i}. Placed for good.`
          : `Nothing here is bigger than ${P}: it stays in slot ${i}, placed for good.`, lv, { keep: !!first });
    }
    return i;
  }

  // the misconception: "the pivot lands in the middle". Three options in a fixed order (the right slot, the middle
  // slot, where the pivot is now), asked only when those are three different slots, so the lesson can answer each
  function askPlace(lo, hi, q, pivot) {
    const mid = (lo + hi) >> 1;
    if (q === mid || q === hi) return;
    const k = q - lo;
    const right = !k ? `Slot ${q}, at the front: every other number is bigger`
      : `Slot ${q}, right after the ${repeats ? `${fmt.plural(k, "number")} no bigger than it` : fmt.plural(k, "smaller number")}`;
    s.ask(`Where will the pivot, ${pivot}, end up?`, [right, `In the middle, slot ${mid}`, `Where it is now, slot ${hi}`], 0,
      { id: "place.where", why: `${k} of the other ${hi - lo} numbers ${k === 1 ? "is" : "are"} no bigger than ${pivot}, so it belongs right after them. The pivot was picked for being last, and nothing makes it the middle value.` });
  }

  // the aha, once: after the first split, a number on the left is never compared with one on the right
  let never = null;
  function quicksort(lo, hi, side, parent, first) {
    if (lo > hi) return;
    if (lo === hi) {
      a.only(lo, hi);
      place(lo);
      s.line(2, 3);
      const o = never ? never() : null;
      const one = { x: num(lo), xId: a.tile(lo) };
      step(o ? "repeat.never" : "repeat.alone", o ? o.caption(lo, hi, chip(lo)) : `${side ? `${sideOf(side, parent)}: ` : ""}${chip(lo)} is alone in its group, so it is placed.`,
        { ...sideVars(side, parent), slot: lo, ...one, ...(o ? { ...o.vars, lo, hi, alone: true, pivot: one.x, pivotId: one.xId } : {}) }, o ? { keep: true } : undefined);
      return;
    }
    const q = partition(lo, hi, side, parent, first);
    const pv = chip(q);
    if (first) {
      s.phase("Repeat on each side", { id: "repeat", about: "The two sides are sorted on their own, so a number on the left is never compared with one on the right. Each side gets the same split: {term:recursion}." });
      if (sc === "random" && q > lo && q < hi) {
        const x = a.values()[lo], y = a.values()[q + 1], pivot = a.values()[q], left = num(lo);
        let used = false;
        never = () => {
          if (used) return null;
          used = true;
          s.ask(`${x} is left of ${pivot} and ${y} is right of it. Will ${x} and ${y} ever be compared?`,
            ["Yes: every pair is compared in the end", "No: the two sides are sorted separately", "Only if one of them becomes a pivot"], 1,
            { id: "repeat.compared", why: `Each side of ${pivot} is sorted on its own, with its own pivots, so ${x} and ${y} are never compared. Skipping pairs like that is where the saving comes from.` });
          s.tag(a.tile(q + 1), "sorted on its own, later");
          return { vars: { other: num(q + 1), otherId: a.tile(q + 1), left, leftId: left.ref }, caption: (l, h, P) => (l === h
            ? `Left of ${pv}: ${P} is alone, so it is placed. ${chip(q + 1)} is never compared with it.`
            : `Left of ${pv}: slots ${l}–${h}, pivot ${P}. ${chip(q + 1)} is never compared with any of them.`) };
        };
      }
    }
    quicksort(lo, q - 1, "left", q, false);   // the parent pivot by its slot: placed, it never moves again
    quicksort(q + 1, hi, "right", q, false);
  }

  s.phase("Split around one", { id: "split", about: `Like the chosen person in the line, pick one number, the {term:pivot}. Smaller${repeats ? " or equal" : ""} numbers go to its left and bigger ones to its right. This split is a {term:partition}.` });
  quicksort(0, n - 1, null, null, true);

  // ---- the end: the count against every pair ----
  const c = a.stats.comparisons;
  s.phase("Sorted", { id: "sorted", about: c === worst
    ? "Every number was a pivot or alone in a group, so each sits in its place. But no pair was skipped: with the last number as pivot, this input is the slowest case."
    : `Every number was a pivot or alone in a group, so each sits in its place. Skipping pairs on opposite sides saved ${worst - c} of the ${worst} comparisons.` });
  a.dim(0, n - 1, false);
  a.state({ done: true });
  s.focus("a");
  s.line(null);
  step("sorted.done", c === worst
    ? `Sorted, but with all ${fmt.plural(worst, "comparison")}: every pair was compared, this pivot rule's slowest case.`
    : `Sorted with ${fmt.plural(c, "comparison")}, where comparing every pair would take ${worst}.`,
    { comparisons: c, saved: worst - c, slowest: c === worst });
}
