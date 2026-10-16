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
    "3 numbers to sort, like 3 people in a line to order from shortest to tallest.",
    "The simple way: 2 comparisons find the smallest, 1 the next: 3 in all.",
    "2, the last number, is the pivot: every other number is compared with it.",
    "Marker j checks each number in turn; i marks where the next smaller one will go.",
    "3 is bigger than 2, so it stays where it is, on the right side.",
    "1 is smaller than 2: it swaps with 3 onto the left side; i steps on.",
    "2 swaps with 3 into slot 1, after the 1 smaller number. Placed for good.",
    "Left of 2: 1 is alone, so it is placed. 3 is never compared with it.",
    "Right of 2: 3 is alone in its group, so it is placed.",
    "Sorted with 2 comparisons, where comparing every pair would take 3.",
  ]);
  assert.deepEqual(r.rec.steps.map((x) => x.phase), ["The line", null, "Split around one", null, null, null, "Into place", "Repeat on each side", null, "Sorted"]);
  assert.deepEqual(r.rec.steps[5].line, [11, 15]);
});

test("the invariants catch a broken array", () => {
  const snap = (state) => ({ entities: new Map([["a", { state }]]) });
  assert.match(figure.invariants["a permutation of the input"](snap({ values: [1, 2, 2], input: [1, 2, 3] })), /not a permutation/);
  assert.match(figure.invariants["sorted at the end"](snap({ values: [2, 1], input: [1, 2], done: true })), /a\[0\] = 2 > a\[1\] = 1/);
  assert.equal(figure.invariants["sorted at the end"](snap({ values: [2, 1], input: [1, 2], done: false })), true);
  assert.match(figure.invariants["placed pivots are final"](snap({ values: [2, 1], input: [1, 2], placed: [0] })), /marked final/);
});
