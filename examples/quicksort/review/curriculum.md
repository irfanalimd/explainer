# Quicksort: curriculum

Level `core`, kept light (5 chapters, 1 dock number, 2 knobs besides the seed). The figure exists and already carries
its step, chapter and ask ids (listed at the top of `figure.mjs`); this plan names them where they exist and does not
invent new ones. `lesson.mjs` holds only `goal`, `objectives`, `misconceptions`, `picture` and `terms`.

## Sources

Canonical
- Cormen, Leiserson, Rivest & Stein, *Introduction to Algorithms*, 4th ed., MIT Press 2022, ch. 7: §7.1 the Lomuto
  `PARTITION` (pivot `x = A[r]`, `if A[j] <= x`), §7.2 worst and best cases, §7.4.2 expected comparisons.
  https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/
- C. A. R. Hoare, "Quicksort", *The Computer Journal* 5(1):10–16, 1962 (the original, with two converging markers).
  https://doi.org/10.1093/comjnl/5.1.10

Secondary
- Sedgewick & Wayne, *Algorithms* 4th ed., §2.3 Quicksort (duplicate keys and why the scan must stop on equal keys;
  3-way partitioning; shuffling against bad input). https://algs4.cs.princeton.edu/23quicksort/
- Bentley & McIlroy, "Engineering a Sort Function", *Software: Practice and Experience* 23(11), 1993 (median-of-3 and
  the ninther; quadratic behaviour of real `qsort`s on repeated keys). https://doi.org/10.1002/spe.4380231105
- McIlroy, "A Killer Adversary for Quicksort", *SP&E* 29(4), 1999 (any deterministic pivot rule has quadratic inputs).
  https://doi.org/10.1002/(SICI)1097-024X(19990410)29:4%3C341::AID-SPE237%3E3.0.CO;2-R
- Musser, "Introspective Sorting and Selection Algorithms", *SP&E* 27(8), 1997 (introsort, `std::sort`).
  https://doi.org/10.1002/(SICI)1097-024X(199708)27:8%3C983::AID-SPE117%3E3.0.CO;2-%23
- Peters, "Pattern-defeating Quicksort", 2021 (pdqsort; Rust `sort_unstable`, Go `sort` since 1.19).
  https://arxiv.org/abs/2106.05123

Misconception evidence
- Danielsiek, Paul & Vahrenhold, "Detecting and Understanding Students' Misconceptions Related to Algorithms and Data
  Structures", SIGCSE 2012 (divide-and-conquer and sorting items in a concept inventory).
  https://dl.acm.org/doi/10.1145/2157136.2157148
- "The pivot is the median" is the standard's own example (`references/teaching.md` §2.5).
- "Sorted input is the best case" comes from insertion sort, where it is true; course slides call out the reversal for
  quicksort, e.g. Rose-Hulman CSSE230 "Quicksort" slides
  (https://www.rose-hulman.edu/class/cs/csse230/202010/Slides/27-Quicksort.pdf) and the many "why is quicksort slow on
  sorted input" duplicates (e.g. https://gateoverflow.in/410436/quick-sort).
- Equal keys: Sedgewick & Wayne §2.3 Q&A on stopping on equal keys.

## Prerequisites

Arrays and slots `a[3]`, a `for` loop, `if`, "swap two values", counting. Not needed: recursion as a programming idea
(the run shows it as "the same again on each side"), Big-O, logarithms.

## Exact rules and numbers (what the run does)

- Lomuto, as CLRS §7.1: `pivot = a[hi]`; `i = lo` marks where the next small number goes; `j` scans `lo..hi-1`; if
  `a[j] <= pivot`, swap `a[i], a[j]` (skipped when `i == j`, so the swap counter counts real trades) and `i += 1`;
  finally swap `a[i], a[hi]` (skipped when `i == hi`). The pivot's final slot is `lo + (numbers in the group no bigger
  than it, itself excluded)`.
- A partition of a group of size m makes exactly m − 1 comparisons. Any two numbers are compared at most once, and only
  when one of them is the pivot of a group holding both (CLRS §7.4.2).
- Every pair: n(n − 1)/2. Default n = 9: 36. Shuffled (seed 7): 21 comparisons, 11 swaps. Sorted: 36 comparisons,
  0 swaps (every `a[j] <= pivot` and `i == j`; the pivot never moves). Repeated (three values): 36 comparisons.
- Expected comparisons with a uniformly random pivot (or random input): 2(n + 1)H(n) − 4n, about 1.39 n log2 n;
  for n = 9 that is about 20.6, so the shuffled run's 21 is typical.
- Worst case for the last-number pivot: sorted or reverse-sorted input, and all-equal input (Lomuto's `<=` sends every
  copy left). Hoare's scheme stays n log n on all-equal input because both markers stop on equal keys.
- Not stable. In place apart from the call stack (depth n in the worst case).

## Objectives and their quiz stems

| id | objective | stem (answer) |
|---|---|---|
| o-place | Predict the pivot's slot from how many numbers are no bigger | "In 40 12 75 3 58, the pivot is 58. Which slot (counting from 0) does it end in?" (3) |
| o-split | Perform one split by hand | "Split 7 2 9 4 5 around 5. What is the line afterwards, and how many swaps?" (2 4 5 7 9; 3 swaps) |
| o-skip | Explain why opposite sides are never compared | "50 is placed. 20 is left of it and 80 right. Will 20 and 80 ever be compared, and why?" (No: each side is sorted on its own) |
| o-slow | Predict the slow inputs and compute their cost | "This quicksort sorts 6 numbers already in order. How many comparisons?" (15) |

## Chapters (current names in the figure)

The parts chapter, whose entry card shows the picture map (`enter.picture: true`), is **The line** (`line`): its about
already carries the people-in-a-line picture, and the map names the pivot, the split and "the same again" before the
reader meets them. Term load: `line` 0, `split` 2 (pivot, partition), `place` 0, `repeat` 1 (recursion), `sorted` 0.

| chapter (id) | So far | Now | You'll know it worked when |
|---|---|---|---|
| The line (`line`) | You can sort a short list by finding the smallest, then the next smallest. | See what that simple way costs on these {n} numbers. | The counter's goal is set: every pair, {worst} comparisons. |
| Split around one (`split`) | The simple way compares every pair: {worst} comparisons. | Pick one number and sort the others to its left or right. | Every number left of `i` is no bigger than the pivot. |
| Into place (`place`) | Every number in the group is on the pivot's left or right side. | Swap the pivot to the end of the left side. | The pivot turns green: its slot is final. |
| Repeat on each side (`repeat`) | One number is placed for good, with a group on each side. | Split each side the same way, on its own. | Every number turns green, and no number crossed a placed one. |
| Sorted (`sorted`) | Each split placed one number and left two smaller groups. | Compare the count with checking every pair. | The counter is below {worst}, or equal to it in the slow case. |

Story overrides worth writing: `enter@sorted` for `place` ("Every number was smaller than the pivot" / "Leave the
pivot where it is" / "Nothing moves, and one group of {before} remains"), and `enter@dups` for `split` (the copies).

## Key steps (ids from the figure)

- `line.simple`: the problem, the naive cost (why: every pair is compared; deeper.cost: n(n − 1)/2 = {worst}).
- `split.pivot`: the one choice that drives everything (deeper.edge: the last number is a bad choice on sorted input).
- `split.swap` (`first` only) and `split.take` (`first` only): the first time a small number joins the left side.
- `place.swap` / `place.stay`: the pivot is final; `place.stay` is key in the sorted story (the misconception step).
- `repeat.never`: the aha (two sides never compared). Already `keep: true` in the figure.
- `sorted.done`: the count against every pair (deeper.cost with the run's comparisons and `saved`).

## Asks and the misconceptions they confront

| ask id | story · chapter | options (index) → misconception |
|---|---|---|
| `place.where` | Shuffled · Into place | the figure builds the wrong options from [middle, where it is now, front] minus the right slot: index 0 is usually "In the middle" → `m-middle`; index 2 is "Where it is now" or "At the front" (no listed belief; feedback only). Ask the figure to pass which kind sits at each index as vars, or fix the order, so feedback can match. |
| `place.left` | Already sorted · Into place | 0 "Two groups of about half" → `m-middle`; 1 right; 2 "Nothing: the line was already sorted" → `m-sorted` |
| `repeat.compared` | Shuffled · Repeat on each side | 0 "Yes: every pair is compared" → `m-pairs`; 1 right; 2 "Only if one of them becomes a pivot" → `m-pairs` (true only inside one group; across a placed pivot it never happens) |
| `split.equal` | Repeated · the chapter where the first copy of a pivot is scanned (Split around one, or Repeat if the first pivot has no copy) | 0 right; 1 "The right" → `m-equal`; 2 "Neither: it waits beside the pivot" → `m-equal` |

## Expert nuances for `deeper`

- `split.pointers` / `split.swap` (how, code): CLRS writes `i = p − 1` and increments before the swap; this run starts
  `i = lo` and increments after: the same invariant. CLRS swaps unconditionally; the run skips self-swaps.
- `place.swap` (how): the slot is the pivot's rank in its group, which is why it never moves again.
- `repeat.never` (cost): numbers of ranks i < j are compared iff the first pivot chosen among ranks i..j is one of the
  two; with a random pivot that has probability 2/(j − i + 1). Summing gives about 1.39 n log2 n (CLRS §7.4.2).
- `place.stay@sorted` (edge, real): any fixed pivot position has bad inputs; McIlroy's "killer adversary" builds them
  for any deterministic rule. Real libraries guard: introsort falls back to heapsort past depth 2 log2 n (`std::sort`),
  pdqsort (Rust `sort_unstable`, Go `sort` since 1.19) also detects sorted runs.
- `split.equal` (edge, how): Lomuto is quadratic on all-equal input; Hoare's scheme is not (both markers stop on
  equals and swap), and Dijkstra's 3-way split puts copies beside the pivot (Sedgewick & Wayne §2.3).
- `sorted.done` (real): Hoare's scheme does about a third as many swaps as Lomuto on average; quicksort is not stable.
- A ten-year practitioner might not know: Go's and Rust's unstable sorts are pdqsort, not textbook quicksort, and
  Java's `Arrays.sort` for primitives is Yaroslavskiy's dual-pivot quicksort (two pivots, three groups).

## Why this ladder

The naive cost comes first (`line`), so the reader wants a saving. One split is shown in full (`split`), then the
pivot's landing is its own chapter (`place`) because "the pivot is the middle" is the belief to break. The saving is
not visible until two sides exist, so the aha sits at the start of `repeat`. The slow stories reuse the same ladder,
with their predictions where the lopsided split first shows.

## Notes on the run

- `place.where` option order depends on the run (see the table): the lesson cannot key a misconception to an index
  safely until the figure fixes the order or passes it.
- `split.equal` is not tied to one chapter: in the repeated story it fires at the first scanned copy of a pivot, which
  can fall in a later split, so the confronting step may be a `repeat.take`/`repeat.swap`, not a `split.*` step.
