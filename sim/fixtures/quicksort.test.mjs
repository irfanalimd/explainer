import { test } from "node:test";
import assert from "node:assert/strict";
import * as figure from "./quicksort.mjs";
import { runFigure } from "../stub.mjs";
import { stateOf } from "../inspect.mjs";
import * as fmt from "../fmt.mjs";

// the algorithm the figure claims to run, written plainly
function lomuto(xs) {
  const a = xs.slice();
  let comparisons = 0, swaps = 0;
  const swap = (i, j) => { [a[i], a[j]] = [a[j], a[i]]; swaps++; };
  const partition = (lo, hi) => {
    const pivot = a[hi];
    let i = lo;
    for (let j = lo; j < hi; j++) { comparisons++; if (a[j] <= pivot) { if (i !== j) swap(i, j); i++; } }
    if (i !== hi) swap(i, hi);
    return i;
  };
  const qs = (lo, hi) => { if (lo >= hi) return; const p = partition(lo, hi); qs(lo, p - 1); qs(p + 1, hi); };
  qs(0, a.length - 1);
  return { a, comparisons, swaps };
}

test("every scenario, many seeds and sizes: clean recording, invariants hold, honest counters", () => {
  let runs = 0;
  for (const sc of figure.scenarios) {
    for (let seed = 1; seed <= 40; seed++) {
      for (const n of [2, 3, 5, 9, 12]) {
        const r = runFigure(figure, { scenario: sc.id, params: { seed, n } });
        const input = figure.inputFor(r.params);
        assert.deepEqual(r.problems, [], `${sc.id} seed ${seed} n ${n}`);
        assert.deepEqual(r.failures, [], `${sc.id} seed ${seed} n ${n}`);
        const want = lomuto(input);
        const st = stateOf(r.rec.final, "a");
        assert.deepEqual(st.values, want.a);
        assert.equal(st.done, true);
        assert.equal(r.rec.counters.comparisons ?? 0, want.comparisons);
        assert.equal(r.rec.counters.swaps ?? 0, want.swaps);
        assert.deepEqual(r.rec.texts("a"), want.a.map(String), "the tiles end in sorted order");
        assert.ok(r.rec.steps.every((x) => x.caption.trim().length > 0));
        runs++;
      }
    }
  }
  assert.equal(runs, 600);
});

test("already sorted input is the worst case; duplicates share identity colours", () => {
  const sorted = runFigure(figure, { scenario: "sorted", params: { n: 10 } });
  assert.equal(sorted.rec.counters.comparisons, 45);
  const dups = runFigure(figure, { scenario: "dups", params: { n: 10 } });
  const keys = new Set(dups.rec.find("array")[0].args[1].map((v) => `value ${v}`));
  assert.ok(keys.size <= 3);
  assert.ok([...keys].every((k) => dups.rec.keys.has(k)));
});

test("typed input overrides n and the generated values", () => {
  const r = runFigure(figure, { params: { input: "5, 2 9 1 7 x 3" } });
  assert.deepEqual(figure.inputFor(r.params), [5, 2, 9, 1, 7, 3]);
  assert.deepEqual(stateOf(r.rec.final, "a").values, [1, 2, 3, 5, 7, 9]);
  assert.deepEqual(r.failures, []);
});

test("the figure is deterministic and its narration is precise", () => {
  const a = runFigure(figure, { params: { seed: 11 } }), b = runFigure(figure, { params: { seed: 11 } });
  assert.equal(a.rec.hash(), b.rec.hash());
  assert.notEqual(a.rec.hash(), runFigure(figure, { params: { seed: 12 } }).rec.hash());
  const r = runFigure(figure, { params: { input: "3 1 2" } });
  const caps = r.rec.captions().map((c) => fmt.ascii(fmt.plain(c)));
  assert.deepEqual(caps, [
    "3 numbers to sort in place. Quicksort partitions around a pivot, then recurses on each side.",
    "Partition a[0..2] around the pivot a[2] = 2: everything ≤ 2 will end up left of i.",
    "Compare a[0] = 3 with pivot a[2] = 2 — 3 > 2.",
    "Compare a[1] = 1 with pivot a[2] = 2 — 1 < 2, so swap a[0] ↔ a[1], i → 1.",
    "Swap a[1] = 3 with a[2] = 2 to put the pivot in its final place.",
    "a[0] = 1 is a partition of one element, so it is already in place.",
    "a[2] = 3 is a partition of one element, so it is already in place.",
    "Sorted with 2 comparisons and 2 swaps; the worst case for 3 elements is 3 comparisons.",
  ]);
  assert.deepEqual(r.rec.steps.map((x) => x.phase), [null, "a[0..2]", null, null, null, null, null, "Sorted"]);
  assert.deepEqual(r.rec.steps[3].line, [11, 15]);
});

test("the invariants catch a broken array", () => {
  const snap = (state) => ({ entities: new Map([["a", { state }]]) });
  assert.match(figure.invariants["a permutation of the input"](snap({ values: [1, 2, 2], input: [1, 2, 3] })), /not a permutation/);
  assert.match(figure.invariants["sorted at the end"](snap({ values: [2, 1], input: [1, 2], done: true })), /a\[0\] = 2 > a\[1\] = 1/);
  assert.equal(figure.invariants["sorted at the end"](snap({ values: [2, 1], input: [1, 2], done: false })), true);
  assert.match(figure.invariants["placed pivots are final"](snap({ values: [2, 1], input: [1, 2], placed: [0] })), /marked final/);
});
