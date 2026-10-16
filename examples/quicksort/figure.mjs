// Quicksort with Lomuto partitioning (the CLRS form: pivot = a[hi], i is the store index), run on a tracked
// array: every comparison is a step, its swap and the store-pointer advance join it, the active partition is the
// only undimmed region, and each pivot turns ok when it lands in its final slot.

import { tracked } from "../../sim/tracked.mjs";
import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "Quicksort",
  subtitle: "Lomuto partitioning, one comparison at a time",
  kicker: "Algorithms",
  fig: 2,
  cite: { text: "C. A. R. Hoare, “Quicksort”, The Computer Journal, 1962", url: "https://doi.org/10.1093/comjnl/5.1.10" },
  theme: "dark",
  hook: "Why is quicksort fast, and when is it slow?",
  takeaway: "Each partition drops its pivot into its final place. Pivots that split near the middle keep the comparisons far below the n(n−1)/2 worst case.",
};

export const params = {
  n: { label: "Elements", type: "int", min: 2, max: 12, value: 9 },
  order: {
    label: "Input order", type: "select", value: "random",
    options: [{ value: "random", label: "Random" }, { value: "sorted", label: "Already sorted" }, { value: "dups", label: "Many duplicates" }],
  },
  input: { label: "Input (overrides)", type: "text", value: "" },
  seed: { label: "Seed", type: "int", value: 7 },
};

export const scenarios = [
  { id: "random", label: "Random", params: { order: "random" }, whatIf: "the input is shuffled",
    description: "Shuffled numbers, the typical case: each pivot splits its range into two parts to sort on their own." },
  { id: "sorted", label: "Already sorted", params: { order: "sorted" }, whatIf: "the input is already sorted",
    description: "The input is already in order, so every pivot is the largest value left: the worst case.",
    takeaway: "On sorted input the last element is always the largest, so each partition peels off one element: n(n−1)/2 comparisons, the worst case." },
  { id: "dups", label: "Many duplicates", params: { order: "dups" }, whatIf: "most values are equal",
    description: "Most values are equal, and every copy of the pivot lands on the same side of it.",
    takeaway: "Partitioning on ≤ sends every copy of the pivot to the low side, so many duplicates push quicksort toward its worst case." },
];

export const counters = {
  comparisons: { label: "comparisons", format: "int", primary: true,
    hint: "Times an element was compared with the pivot. This is most of quicksort's work." },
  swaps: { label: "swaps", format: "int", primary: true,
    hint: "Times two elements traded places in the array." },
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

/** The input for given params: an explicit list wins, else n values in the chosen order. */
export function inputFor(p) {
  const typed = String(p.input ?? "").split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isInteger(x) && Math.abs(x) < 1000);
  if (typed.length >= 2) return typed.slice(0, 12);
  const n = Math.max(2, Math.min(12, p.n ?? 9));
  const r = rng(p.seed ?? 7).fork("quicksort-input");
  const order = p.order ?? "random";
  if (order === "dups") return Array.from({ length: n }, () => r.int(1, 3));
  const distinct = r.sample(Array.from({ length: 98 }, (_, i) => i + 2), n);
  return order === "sorted" ? sortedCopy(distinct) : distinct;
}

export function build(s, p, scenario) {
  const input = inputFor(p);
  const n = input.length;
  const dups = (p.order ?? "random") === "dups";
  // the pointer rods stand in front of the tiles (two can stack on one slot): reserve that strip of floor
  s.column("stage", { gap: 0, align: "center" });
  const a = tracked.array(s, "a", input, {
    in: "stage",
    label: "a",
    counters: { reads: false, writes: false },
    ...(dups ? { keyOf: (v) => `value ${v}` } : {}),
  });
  s.spacer("rods", { in: "stage", w: 2, d: 34 });
  const placed = [];
  a.state({ input: input.slice(), placed: [], done: false });
  const I = a.pointer("i", -1, { tone: "busy" });             // shown when a partition starts
  const J = a.pointer("j", -1, { loop: true, say: false });

  const intro = (p.order === "sorted" && !String(p.input ?? "").trim())
    ? `${fmt.plural(n, "number")}, already in order: with the last element as pivot, every partition peels off a single element`
    : dups ? `${fmt.plural(n, "number")} drawn from just three values: duplicates are hard on a partition that splits on ≤`
      : `${fmt.plural(n, "number")} to sort in place. Quicksort partitions around a pivot, then recurses on each side`;
  a.step(`${intro}.`);

  const place = (k, say) => {
    placed.push(k);
    a.mark(k, k, "ok");
    a.state({ placed: placed.slice() });
    if (say) a.say(say);
  };

  function partition(lo, hi) {
    const pivot = a.get(hi);
    a.phase(`a[${lo}..${hi}]`, { about: `The last element, ${a.show(pivot)}, is the pivot. Pointer ${fmt.code("j")} scans the rest; each value ≤ ${a.show(pivot)} is swapped left, to pointer ${fmt.code("i")}. Finally the pivot swaps to ${fmt.code("i")}: its final sorted place.` });
    a.only(lo, hi);
    a.mark(hi, hi, "warn");
    I.to(lo, { say: false });
    J.to(lo);
    a.step(`Partition a[${lo}..${hi}] around the pivot ${a.ref(hi)} = ${a.show(pivot)}: everything ≤ ${a.show(pivot)} will end up left of ${fmt.code("i")}.`, { line: [8, 10] });
    let i = lo;
    for (let j = lo; j < hi; j++) {
      J.to(j);
      if (a.cmp(j, hi, { as: "pivot", line: [11, 12] }) <= 0) {
        if (i !== j) a.swap(i, j, { line: [13, 14] });
        i++;
        I.to(i, { line: 15 });
      }
    }
    a.flush();
    a.mark(hi, hi, null);
    if (i !== hi) a.swap(i, hi, { why: "to put the pivot in its final place", line: [16, 17] });
    else a.say(`Every element of a[${lo}..${hi - 1}] is ≤ ${a.show(pivot)}, so the pivot is already in its final place.`);
    place(i);
    I.hide(); J.hide();
    a.step(undefined, { line: [16, 18] });
    return i;
  }

  function quicksort(lo, hi) {
    if (lo > hi) return;
    if (lo === hi) {
      a.only(lo, hi);
      place(lo);
      a.step(`${a.ref(lo)} = ${a.show(a.values()[lo])} is a partition of one element, so it is already in place.`, { line: [2, 3] });
      return;
    }
    const q = partition(lo, hi);
    quicksort(lo, q - 1);
    quicksort(q + 1, hi);
  }

  quicksort(0, n - 1);
  const st = a.stats;
  a.phase("Sorted", { about: "Every element has been a pivot or a part of one element, so each already sits in its final place. The array is sorted in place, with no extra memory." });
  a.dim(0, n - 1, false);
  a.state({ done: true });
  const worst = (n * (n - 1)) / 2;
  a.step(`Sorted with ${fmt.plural(st.comparisons, "comparison")} and ${fmt.plural(st.swaps, "swap")}; the worst case for ${n} elements is ${worst} comparisons.`);
}
