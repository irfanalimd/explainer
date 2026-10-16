# Quicksort: Lomuto partitioning, one comparison at a time

Quicksort with Lomuto partitioning (the CLRS form: the pivot is `a[hi]`, and `i` is the store index) on a
`tracked.array`. Every comparison is a step; its swap and the advance of `i` join it. Only the active partition is
undimmed, the pointers `i` and `j` stand under their slots, and each pivot turns green when it lands in its final
place. The reader should leave knowing:

- each partition puts its pivot in its final sorted position, then recurses on the two sides;
- the cost is the comparisons, and it depends on how evenly the pivots split their ranges;
- on sorted input the last element is always the largest, so every partition peels off one element: n(n−1)/2
  comparisons, the worst case;
- partitioning on `≤` sends every copy of the pivot to one side, so duplicates also push it toward the worst case.

- **Source:** C. A. R. Hoare, "Quicksort", The Computer Journal 5(1), 1962
  ([doi](https://doi.org/10.1093/comjnl/5.1.10)); the Lomuto scheme as in Cormen et al., *Introduction to
  Algorithms*, chapter 7.
- **What is real:** the whole algorithm on the knob's array; the code panel lights each line as it runs.

## Scenarios

| Story | What happens | What it teaches |
|---|---|---|
| Random | 9 shuffled numbers, sorted with 21 comparisons and 11 swaps. | The typical case: pivots split near the middle, far below the 36-comparison worst case. |
| Already sorted | 9 numbers already in order: 36 comparisons and no swaps. | The worst case: each pivot is the largest value left. |
| Many duplicates | 9 numbers drawn from three values: 36 comparisons. | Equal keys all fall on the low side, so the splits are lopsided. |

**Knobs:** elements (2–12), input order, an explicit input list (overrides), seed.

**Invariants** (checked on every step): the array is always a permutation of the input; every pivot marked final
holds its sorted value; at the end the array is sorted.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 12 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # quicksort.html
node ../../scripts/shoot.mjs quicksort.html --scenario all
node ../../scripts/audit.mjs quicksort.html --scenario all
```
