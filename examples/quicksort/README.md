# Quicksort: split around one number, then do the same on each side

Quicksort with Lomuto partitioning (the CLRS form: the pivot is `a[hi]`, and `i` marks where the next small value
goes) on a `tracked.array`, written for a beginner who knows arrays and loops but has never met a pivot
(`meta.level: "core"`, kept light: 5 chapters, one number in the dock, two knobs). Every comparison is a step and
its swap joins it. Only the active group is undimmed, the markers `i` and `j` stand under their slots, and each
pivot turns green when it lands in its final place.

**The lesson** (the plan sits at the top of `figure.mjs`):

- **Hook:** comparing every number with every other one is slow. How does quicksort sort with far fewer
  comparisons, and when does that fail?
- **Picture:** ordering a line of people by height around one chosen person. Shorter people step left and taller
  people step right; the chosen person now stands exactly where they belong; then the same happens in each group.
  A person is a number, their height its value, the chosen person the pivot, the stepping aside a partition, and
  doing it again on each side recursion.
- **Problem first:** the simple way (find the smallest, then the next…) compares every pair, n(n−1)/2 comparisons
  (36 for 9). Its first round runs for real in chapter 1, and the end compares quicksort's count with that total.
- **Chapters:** The line · Split around one (every sub-step of the first split, in full) · Into place · Repeat on
  each side · Sorted. Later splits repeat the same moves in a short form, so their repeats fold.
- **Misconception:** "the pivot lands in the middle". The reader predicts where 87 goes before it swaps in.
- **Aha:** a number left of a placed pivot is never compared with one on its right ("Will 29 and 99 ever be
  compared?"). That skipping is the whole saving.
- **Words:** pivot, partition, recursion, each defined at first use.

Every predict question sits on its chapter's first step (or as early as the run allows), because the HUD withholds a
chapter's about until its predictions are revealed.

- **Source:** C. A. R. Hoare, "Quicksort", The Computer Journal 5(1), 1962
  ([doi](https://doi.org/10.1093/comjnl/5.1.10)); the Lomuto scheme as in Cormen et al., *Introduction to
  Algorithms*, chapter 7.
- **What is real:** the whole algorithm on the knob's array; the code panel lights each line as it runs. The simple
  way's first round (n − 1 comparisons to find the smallest) is shown on the array, and its total is computed, not
  played.

## Stories

| Story | What happens | What it teaches |
|---|---|---|
| Shuffled numbers | 9 shuffled numbers, sorted with 21 comparisons and 11 swaps. Predicts: where does the pivot end up? Will 29 and 99 ever be compared? | The usual case: splits near the middle skip most pairs (21 of 36). |
| Already sorted input | 9 numbers already in order: 36 comparisons, no swaps. Predict: what is left once 99 is placed? | The slowest case: the last number is always the biggest, so every split places one number and every pair is compared. |
| Lots of repeated numbers | 9 numbers drawn from three values: 36 comparisons. Predict: which side does a copy of the pivot go to? | Equal counts as small, so copies pile onto one side and the splits are lopsided. |

**Knobs:** how many numbers (2–12), your own numbers (overrides), seed. The old "Input order" knob is gone: the
stories set it (`order` is a hidden scenario param).

**Numbers:** comparisons (in the dock), swaps (in the full list).

**Invariants** (checked on every step): the array is always a permutation of the input; every pivot marked final
holds its sorted value; at the end the array is sorted.

## Commands

```sh
node ../../scripts/lesson.mjs figure.mjs --all           # the lesson as text, then the teaching checks
node ../../scripts/verify.mjs figure.mjs                 # 12 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # quicksort.html
node ../../scripts/shoot.mjs quicksort.html --scenario all
node ../../scripts/audit.mjs quicksort.html --scenario all
```
