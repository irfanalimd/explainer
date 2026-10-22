// The words the quicksort figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure owns
// every fact and passes it as a var; nothing here computes. Every line stays true at every knob value (n 2–12, any
// seed, the three stories); lines true only for some runs carry a `when` (see eq, before, second, alone, slowest).
// The run is Lomuto's partition as CLRS 4e §7.1 gives it: pivot = a[hi], `a[j] <= pivot` goes left, so a copy of
// the pivot counts as small. "Small" in these words always means "no bigger than the pivot".
//   run-wide vars: n, worst (n(n − 1)/2), order, repeats, input
//   line:          distinct, shown (line.numbers); smallest, smallestId, first, second (line.simple)
//   a split:       pivot, pivotId, lo, hi; x, xId, j, i, eq, y, yId (a scan step); slot, before (the pivot placed)
//   repeat:        side, parent, parentId, size (a group); other, otherId, left, leftId, alone (repeat.never);
//                  xs, xIds, count, from, to (repeat.takes · repeat.stays: a run said once)
//   place:         mid (the group's middle slot, for the place.where feedback)
//   sorted.done:   comparisons, saved, slowest
// Every real-world claim names its source as [id] (lesson.sources below), with a locator where it helps.
const CLRS = "[clrs4] ch. 7";
const HOARE = "[hoare1961]; [hoare1962]";
const ALGS4 = "[algs4] §2.3, 3-way partitioning; [bentley-mcilroy1993] §4";
const MCILROY = "[mcilroy1999]";

// the first copy of the pivot in the run: the step right after the split.equal ask (dups story)
const EQUAL = {
  key: true,
  why: "Every copy of {pivot} joins the left side, so the more copies, the longer that side.",
  deeper: {
    how: "The test is `a[j] <= pivot`, so a copy goes left like any smaller number. This split has two sides and no middle.",
    edge: "So all-equal input costs every pair here. Hoare's two markers both stop on a copy and swap it, which splits a run of copies in half; a three-way split (Dijkstra's) keeps copies beside the pivot and never looks at them again.",
    source: ALGS4,
  },
};

export const lesson = {
  sources: [
    { id: "clrs4", title: "Introduction to Algorithms, 4th edition", by: "Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest and Clifford Stein", year: 2022, where: "MIT Press",
      url: "https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/",
      supports: "§7.1 PARTITION with pivot A[r] and the test A[j] ≤ x (Figure 7.1 runs it on 2 8 7 1 3 5 6 4); §7.4.2 the chance 2/(j − i + 1) that two values meet" },
    { id: "hoare1961", title: "Algorithm 63: Partition; Algorithm 64: Quicksort", by: "C. A. R. Hoare", year: 1961, where: "Communications of the ACM 4(7):321",
      url: "https://doi.org/10.1145/366622.366642",
      supports: "the first published quicksort, with two markers that walk toward each other from both ends" },
    { id: "hoare1962", title: "Quicksort", by: "C. A. R. Hoare", year: 1962, where: "The Computer Journal 5(1):10–16",
      url: "https://doi.org/10.1093/comjnl/5.1.10",
      supports: "the full paper: the method, its average cost, and picking the bound at random" },
    { id: "algs4", title: "Algorithms, 4th edition, §2.3 Quicksort", by: "Robert Sedgewick and Kevin Wayne", year: 2011, where: "Addison-Wesley; algs4.cs.princeton.edu",
      url: "https://algs4.cs.princeton.edu/23quicksort/",
      supports: "Dijkstra's 3-way partitioning for many equal keys; Hoare's markers stopping on keys equal to the pivot" },
    { id: "sedgewick1978", title: "Implementing Quicksort programs", by: "Robert Sedgewick", year: 1978, where: "Communications of the ACM 21(10):847–857",
      url: "https://doi.org/10.1145/359619.359631",
      supports: "sorting the smaller side first keeps the stack at most log2 n deep" },
    { id: "bentley-mcilroy1993", title: "Engineering a sort function", by: "Jon L. Bentley and M. Douglas McIlroy", year: 1993, where: "Software: Practice and Experience 23(11):1249–1265",
      url: "https://doi.org/10.1002/spe.4380231105",
      supports: "a 1991 qsort that took n² comparisons on an organ-pipe array; a dozen Unix qsorts all driven to quadratic time; the middle element, median of 3 and Tukey's ninther as pivots; a split that keeps equal keys apart" },
    { id: "mcilroy1999", title: "A killer adversary for quicksort", by: "M. Douglas McIlroy", year: 1999, where: "Software: Practice and Experience 29(4):341–344",
      url: "https://doi.org/10.1002/(SICI)1097-024X(19990410)29:4%3C341::AID-SPE237%3E3.0.CO;2-R",
      supports: "an adversary that picks values as the sort compares them drives any deterministic pivot rule to quadratic time" },
    { id: "musser1997", title: "Introspective sorting and selection algorithms", by: "David R. Musser", year: 1997, where: "Software: Practice and Experience 27(8):983–993",
      url: "https://doi.org/10.1002/(SICI)1097-024X(199708)27:8%3C983::AID-SPE117%3E3.0.CO;2-%23",
      supports: "introsort: quicksort that switches to heapsort past a depth limit" },
    { id: "libstdcxx", title: "libstdc++, bits/stl_algo.h: std::sort", by: "GCC", year: 2026, where: "the GCC source tree",
      url: "https://raw.githubusercontent.com/gcc-mirror/gcc/master/libstdc++-v3/include/bits/stl_algo.h",
      supports: "GCC's std::sort runs __introsort_loop with a depth limit of 2 × floor(log2 n), then heapsort" },
    { id: "go119", title: "Go 1.19 release notes: sort", by: "The Go team", year: 2022, where: "go.dev",
      url: "https://go.dev/doc/go1.19#sort",
      supports: "Go's sort package rewritten as pattern-defeating quicksort" },
    { id: "peters2021", title: "Pattern-defeating Quicksort", by: "Orson R. L. Peters", year: 2021, where: "arXiv:2106.05123",
      url: "https://arxiv.org/abs/2106.05123",
      supports: "pdqsort: linear time on sorted input, heapsort fallback for a worst case of n log n" },
    { id: "java-arrays", title: "Java SE 21 API, Arrays.sort(int[])", by: "Oracle", year: 2023, where: "docs.oracle.com",
      url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html#sort(int%5B%5D)",
      supports: "Dual-Pivot Quicksort by Vladimir Yaroslavskiy, Jon Bentley and Joshua Bloch" },
    { id: "rust-sort", title: "Rust standard library, slice::sort_unstable", by: "The Rust project", year: 2026, where: "doc.rust-lang.org",
      url: "https://doc.rust-lang.org/std/primitive.slice.html#method.sort_unstable",
      supports: "ipnsort by Lukas Bergdoll and Orson Peters: quicksort's average case with heapsort's worst case" },
  ],

  goal: "Sort a line of numbers by placing one number for good at a time, and skip comparing most pairs.",

  objectives: [
    { id: "o-place", text: "Predict the slot a pivot lands in from how many numbers in its group are no bigger than it." },
    { id: "o-split", text: "Perform one split by hand: say which numbers swap as the scan moves along." },
    { id: "o-skip", text: "Explain why two numbers on opposite sides of a placed pivot are never compared." },
    { id: "o-slow", text: "Predict which inputs make this pivot rule slow, and compute their comparisons: every pair, n(n − 1)/2." },
  ],

  misconceptions: [
    { id: "m-middle", wrong: "The pivot ends up in the middle of the line, so every split cuts the group in half.",
      fix: "The pivot lands right after the numbers no bigger than it, wherever that is: the front, the end or anywhere between." },
    { id: "m-pairs", wrong: "Every pair gets compared at some point; quicksort only changes the order of the comparisons.",
      fix: "Once a pivot is placed, its two sides are sorted apart. A number on one side never meets a number on the other." },
    { id: "m-sorted", wrong: "Numbers already in order are the easy case: there is nothing left to do.",
      fix: "With the last number as pivot, sorted input places one number per split and compares every pair: the slowest case." },
    { id: "m-equal", wrong: "A copy of the pivot can't count as small, so it goes right or waits beside the pivot.",
      fix: "This split's test is “no bigger than the pivot”, so every copy goes left; only a three-way split keeps copies beside it." },
  ],

  picture: {
    name: "a line of people ordered by height",
    rows: [
      { id: "person", picture: "one person in the line", real: "one number in its slot" },
      { id: "height", picture: "their height", real: "the number's value" },
      { id: "chosen", picture: "the person everyone is measured against", real: "the pivot", term: "pivot" },
      { id: "step", picture: "shorter people step left, taller ones right", real: "a partition, one split", term: "partition" },
      { id: "again", picture: "the same again inside each smaller group", real: "recursion", term: "recursion" },
    ],
    breaks: "People can all step aside at once. The computer checks one number against the pivot at a time and moves numbers only by swapping two.",
  },

  terms: {
    pivot: { lead: "the chosen number", def: "The number every other number in the group is compared with. Here it is the group's last number." },
    partition: { lead: "one split", def: "One pass that moves the numbers no bigger than the pivot to its left and the bigger ones right." },
    recursion: { lead: "the same again, smaller", def: "Solving each smaller piece with the very same steps, until a piece has one number or none." },
  },

  chapters: {
    line: {
      teach: { prompt: "Before any sorting: how many comparisons does checking every pair of 8 numbers take? And of 1,000?", listen: "28 and 499,500: n(n − 1)/2. Doubling the numbers roughly quadruples the work. That is the cost quicksort sets out to beat.", minutes: 3 },
      about: "Picture each number as a person in a line, and its value as their height. Sorting lines them up from shortest to tallest, one check at a time.",
      enter: { sofar: "You can sort a short list by hand: find the smallest, then the next smallest, and so on.", now: "Count what that simple way costs on these {n} numbers.", done: "You can say how many comparisons it needs: {worst}.", picture: true },
    },
    split: {
      teach: { prompt: "On the board, split the textbook's example, 2 8 7 1 3 5 6 4, around its last number, 4: scan left to right, and swap each number no bigger than 4 to the front.", listen: "It ends 2 1 3 4 7 5 6 8, the line in CLRS's Figure 7.1: 4 sits right after the three numbers no bigger than it. Ask what stays true of every slot left of `i` at each step.", minutes: 5 },
      "teach@dups": { prompt: "Before the scan: where should a number equal to the pivot go: left, right, or neither?", listen: "Expect “neither” or “right”. This code's test is “no bigger than the pivot”, so copies go left; a three-way split keeps them in a middle group instead.", minutes: 3 },
      about: "Pick one number, the {term:pivot}, like the chosen person in the line. Numbers smaller than it or equal to it go to its left, bigger ones to its right.",
      enter: { sofar: "The simple way checks every pair: {count:worst|comparison}.", now: "Choose one number, and move each other number to its left or its right.", done: "Every number left of `i` is no bigger than the chosen one." },
      "enter@dups": { sofar: "The simple way checks every pair, ties or not: {count:worst|comparison}.", now: "Choose one number, and move each other number left or right, even its copies.", done: "Every number left of `i` is no bigger than the chosen one." },
    },
    place: {
      teach: { prompt: "The pivot is about to move. Which slot will it end in? Say it before it moves.", listen: "Count the numbers no bigger than it: it lands right after them. Expect “the middle”, which holds only when the pivot is the middle value.", minutes: 3 },
      about: "The pivot belongs right after the numbers no bigger than it. Everything left of that slot is no bigger, everything right is bigger, so the slot is final.",
      enter: { sofar: "Each other number now sits on the small side or the big side.", now: "Move the pivot into the slot it belongs in.", done: "The pivot turns green: it never moves again." },
    },
    repeat: {
      teach: { prompt: "Point at two numbers on opposite sides of a green, placed number. Will quicksort ever compare them?", listen: "Never: every later group lies on one side of a placed pivot. Each pair split apart that way is a comparison saved.", minutes: 3 },
      about: "Each placed number splits the line for good: a number on its left never meets one on its right. Each side gets the very same split: {term:recursion}.",
      enter: { sofar: "{parent} is placed for good. Every other number waits beside it, left or right.", now: "Split each group with the very same steps, one group at a time.", done: "Every number turns green, placed by a split or alone in its group." },
    },
    sorted: {
      teach: { prompt: "Would numbers already in order be quicksort's best case, or its worst?", listen: "With the last number as pivot, the worst: each split places one number, and every pair is compared. In 1991 a Unix `qsort` made n² comparisons on real data, an “organ-pipe” array, and ran for hours.", minutes: 4 },
      about: "Every number was a pivot or alone in a group, so the line is sorted. The counter shows how many pairs were never compared.",
      enter: { sofar: "Each split placed one number for good and left smaller groups.", now: "Set quicksort's count against checking every pair.", done: "The counter is below {worst}, or at {worst} in the slow case." },
    },
  },

  steps: {
    // ---- The line: what the simple way costs ----
    "line.numbers": {
      plain: "{n} numbers to sort, like {n} people to line up by height.",
      look: ["a"], picture: "person",
    },
    "line.numbers@sorted": {
      when: (v) => v.order === "sorted",
      plain: "{n} numbers already in order, like people already lined up by height.",
      why: "Already sorted looks like the easy case. Keep an eye on the comparison counter.",
      look: ["a"], picture: "person",
    },
    "line.numbers@dups": {
      when: (v) => v.order === "dups",
      plain: "{n} numbers with only {count:distinct|different value}: {shown}.",
      why: "Like people of only a few heights: many of them tie.",
      look: ["a"], picture: "height",
    },
    "line.simple": {
      // n = 2 has one pair; first (the only time this step plays) covers every longer line
      key: true,
      plain: "The simple way compares the two numbers once: {count:worst|comparison}.",
      why: "With two numbers there is only one pair to check.",
      look: ["{smallestId}"],
      deeper: {
        cost: "Every pair once: n(n − 1)/2 = {n} × {first} / 2 = {worst}. Double the numbers and the work roughly quadruples: O(n²).",
        how: "This is selection sort: each round scans what is left for its smallest number and swaps it to the front.",
        edge: "Not every simple sort is this slow on every input: insertion sort checks numbers already in order with {count:first|comparison}. That is why sorted input feels easy.",
      },
      first: {
        when: (v) => v.second > 0,
        plain: "The simple way: {first} comparisons find the smallest, {second} the next, and so on.",
        why: "Every number gets checked against every other: {worst} comparisons for {n} numbers.",
      },
    },

    // ---- Split around one: the first partition, said in full ----
    "split.pivot": {
      key: true,
      plain: "{pivot}, the last number, is the {term:pivot}.",
      why: "Every other number will be compared with it once, then sent left or right.",
      look: ["{pivotId}"], picture: "chosen",
      deeper: {
        how: "The pivot is `a[hi]`, the last slot of the group. CLRS uses this rule: it costs nothing to pick, but it never looks at the numbers.",
        code: "`pivot = a[hi]` (line 9)",
        edge: "If the last number is the biggest or the smallest, every other number lands on one side, and the split places only one number.",
        source: CLRS,
      },
    },
    "split.pointers": {
      plain: "One {term:partition}: `i` marks where small numbers go, `j` checks each in turn.",
      why: "The rule that always holds: nothing left of `i` is bigger than the pivot.",
      look: ["a.i", "a.j"], picture: "step",
      deeper: {
        how: "CLRS starts `i` one slot early (`i = p − 1`) and adds 1 before each swap; this code starts at `lo` and adds 1 after. The rule is the same: slots before `i` hold the small side.",
        code: "`i = lo` and `for j in range(lo, hi):` (lines 10–11)",
        real: "This one-marker split is Lomuto's, made popular by Bentley and CLRS because it is easy to prove. Hoare's original (1961) walks two markers toward each other from both ends and swaps a pair on the wrong sides: fewer swaps, harder to get right.",
        source: `${CLRS}; ${HOARE}`,
      },
    },
    "split.take": {
      when: (v) => !v.eq,
      plain: "{x} is smaller than {pivot} and already at `i`: the left side takes it.",
      look: ["{xId}"],
      first: {
        key: true,
        why: "It belongs on the left and is already there, so nothing moves; `i` steps on.",
        deeper: {
          how: "When `i` equals `j`, a swap would trade {x} with itself, so this code skips it. CLRS swaps anyway; the comparisons are the same.",
          code: "`if a[j] <= pivot:` … `i += 1` (lines 12–15)",
        },
      },
    },
    "split.take@dups": {
      plain: "{x} is no bigger than {pivot} and already at `i`: the left side takes it.",
      look: ["{xId}"],
    },
    "split.swap": {
      when: (v) => !v.eq,
      plain: "{x} is smaller than {pivot}: it swaps with {y} into slot {i}.",
      look: ["{xId}", "{yId}"],
      first: {
        key: true,
        why: "{y} is bigger, so the two trade places, and the left side grows by one.",
        deeper: {
          code: "`a[i], a[j] = a[j], a[i]` then `i += 1` (lines 14–15)",
          edge: "A swap can carry a number past others of the same value, so equal numbers may end up in either order: quicksort is not stable.",
        },
      },
    },
    "split.swap@dups": {
      plain: "{x} is no bigger than {pivot}: it swaps with {y} into slot {i}.",
      look: ["{xId}", "{yId}"],
    },
    "split.copy": {
      // plays once, right after the split.equal ask; first covers a copy that swaps
      plain: "{x} equals {pivot}, and equal counts as small: the left side takes it.",
      look: ["{xId}"],
      ...EQUAL,
      first: { when: (v) => !!v.y, plain: "{x} equals {pivot}, and equal counts as small: it swaps with {y}.", look: ["{xId}", "{yId}"] },
    },
    "split.stay": {
      plain: "{x} is bigger than {pivot}, so it stays put on the right side.",
      look: ["{xId}"],
      first: {
        why: "Bigger numbers wait between `i` and `j` until a small number swaps past.",
        deeper: { how: "Only `j` moves on. The slots from `i` up to `j` hold the bigger numbers seen so far; the next small number swaps with the first of them." },
      },
    },

    // ---- Into place ----
    "place.swap": {
      key: true,
      plain: "{pivot} swaps with {y} into slot {slot}: placed for good.",
      why: "All to its left are no bigger, all to its right are bigger: its sorted slot.",
      look: ["{pivotId}"],
      deeper: {
        cost: "This split made {count:hi|comparison}, one for each other number. A group of m numbers always costs m − 1.",
        how: "Its slot is its rank: {count:before|number} in the group {be:before} no bigger, so it lands {before} slots from the start. No later split can change that count.",
        edge: "It lands in the middle only when it happens to be the middle value. Picking the last number makes no such promise.",
        code: "`a[i], a[hi] = a[hi], a[i]` and `return i` (lines 16–18)",
      },
      first: {
        when: (v) => v.before > 0,
        plain: "{pivot} swaps with {y} into slot {slot}, right after the {count:before|small number}.",
      },
    },
    "place.stay": {
      key: true,
      plain: "Nothing is bigger than {pivot}, so it stays in slot {slot}: placed for good.",
      why: "The other {count:before|number} {be:before} no bigger, so the last slot is its sorted slot.",
      look: ["{pivotId}"],
      deeper: {
        cost: "This split made {count:hi|comparison} and placed one number; {count:before|number} {be:before} left in one group.",
        how: "`i` reached `hi`, so the final swap would trade the pivot with itself, and the code skips it.",
      },
      "plain@sorted": "{pivot} stays in slot {slot}. {count:before|other number} {be:before} left, all in one group.",
      "why@sorted": "{pivot} was the biggest, so nothing went right of it: no second group.",
      "deeper@sorted": {
        cost: "{count:hi|comparison} to place one number: the most a split can cost, for the least progress.",
        edge: "Every fixed pivot rule has inputs like this. McIlroy showed that an adversary, choosing values only as the sort compares them, drives any deterministic pivot rule to quadratic time.",
        real: "Libraries guard against it. GCC's `std::sort` is introsort: past 2 log2 n nested splits it switches to heapsort. Go's `sort` (since 1.19) is pattern-defeating quicksort, which sorts input already in order in one pass.",
        source: "[mcilroy1999]; [musser1997]; [libstdcxx] __introsort_loop; [go119]; [peters2021]",
      },
    },

    // ---- Repeat on each side ----
    "repeat.never": {
      // a group of one (alone); first covers a longer group (this step plays once)
      key: true,
      plain: "Left of {parent}, {pivot} is alone, so it is placed. {other} never meets it.",
      why: "A pivot meets only its own group, and {other} stays right of {parent} for good.",
      look: ["{pivotId}", "{otherId}"],
      deeper: {
        cost: "Two numbers meet only if one of them is the first pivot picked from the values between them, these two included. With random pivots, values k ranks apart meet with chance 2/(k + 1): about 1.39 n log2 n comparisons in all.",
        how: "Each placed pivot is a wall: every later group lies wholly on one side of it, so no pair across it is ever checked.",
        source: "[clrs4] §7.4.2",
      },
      first: {
        when: (v) => !v.alone,
        plain: "Left of {parent}: slots {lo}–{hi}, pivot {pivot}. {other} never meets any of them.",
      },
    },
    "repeat.group": {
      plain: "The {side} side of {parent}: slots {lo}–{hi}, pivot {pivot}.",
      look: ["{pivotId}"],
      first: {
        why: "The same steps, on just these {size} numbers: this is {term:recursion}.",
        picture: "again",
        deeper: {
          code: "`quicksort(a, lo, p - 1)` and `quicksort(a, p + 1, hi)` (lines 5–6)",
          how: "Each group still waiting is a call on the stack. Sorted input nests about {n} calls deep; sorting the smaller side first and looping on the bigger one keeps it at most log2 n.",
          source: "[sedgewick1978]",
        },
      },
    },
    "repeat.take": {
      when: (v) => !v.eq,
      plain: "{x} is smaller than {pivot}: it stays left.",
      look: ["{xId}"],
    },
    "repeat.take@dups": {
      plain: "{x} is no bigger than {pivot}: it stays left.",
      look: ["{xId}"],
      first: { when: (v) => v.eq, why: "Equal counts as small, so this copy of {pivot} goes left too." },
    },
    "repeat.swap": {
      when: (v) => !v.eq,
      plain: "{x} is smaller than {pivot}: it swaps left with {y}.",
      look: ["{xId}", "{yId}"],
    },
    "repeat.swap@dups": {
      plain: "{x} is no bigger than {pivot}: it swaps left with {y}.",
      look: ["{xId}", "{yId}"],
      first: { when: (v) => v.eq, why: "Equal counts as small, so this copy of {pivot} goes left too." },
    },
    "repeat.stay": {
      plain: "{x} is bigger than {pivot}: it stays right.",
      look: ["{xId}"],
    },
    // "Lots of repeated numbers" with n = 5: the first copy of the pivot falls in a later split
    "repeat.copy": {
      // the split.equal ask when the first copy of a pivot turns up only in a later split (plays once)
      plain: "{x} equals {pivot}, and equal counts as small: it goes left.",
      look: ["{xId}"],
      ...EQUAL,
    },
    "repeat.takes": {
      when: (v) => !v.repeats,
      plain: "The next {count:count|number}, slots {from}–{to}, are smaller than {pivot}: they stay left.",
      look: ["{xIds}"],
      first: { why: "Each one is already at `i`, so nothing moves: the left side grows by one each time." },
    },
    "repeat.takes@dups": {
      plain: "The next {count:count|number}, slots {from}–{to}, are no bigger than {pivot}: they stay left.",
      look: ["{xIds}"],
      first: { why: "Each one is already at `i`, so nothing moves, and the left side grows. Copies of {pivot} count as small too." },
    },
    "repeat.stays": {
      plain: "The next {count:count|number}, slots {from}–{to}, are bigger than {pivot}: they stay right.",
      look: ["{xIds}"],
      first: { why: "Bigger numbers wait where they are; only `j` moves on." },
    },
    "repeat.place": {
      plain: "{pivot} swaps with {y} into slot {slot}: placed for good.",
      look: ["{pivotId}"],
    },
    "repeat.place-stay": {
      plain: "Nothing here is bigger than {pivot}: it stays in slot {slot}, placed.",
      look: ["{pivotId}"],
      first: {
        why: "This group shrank by one number: the most lopsided split there is.",
        deeper: { cost: "A split of m numbers always costs m − 1 comparisons. When it places only one, the next group is m − 1 long, and costs m − 2." },
      },
    },
    "repeat.alone": {
      plain: "The {side} side of {parent} holds only {x}: a group of one, so it is placed.",
      look: ["{xId}"],
      first: {
        why: "A group of one needs no split, so here the {term:recursion} stops.",
        deeper: { code: "`if lo >= hi: return` (lines 2–3)" },
      },
    },

    // ---- Sorted: the count against every pair ----
    "sorted.done": {
      // the slowest case (every pair compared); first covers a run that skipped some (this step plays once)
      key: true,
      plain: "Sorted, but with all {count:worst|comparison}: no pair was skipped.",
      why: "Every split put all the others on one side, so every pair met.",
      look: ["a"],
      deeper: {
        cost: "(n − 1) + (n − 2) + … + 1 = n(n − 1)/2 = {worst}: as slow as the simple way, O(n²).",
        edge: "With the last number as pivot, sorted, reverse-sorted and all-equal input all do this. A random pivot makes it unlikely on any input, and the median of the first, middle and last numbers makes sorted input fast.",
        real: "In 1991 a Unix `qsort` ran for hours on an “organ-pipe” array, 1 2 … n n … 2 1. Bentley and McIlroy then drove all of a dozen Unix `qsort`s to quadratic time, and their replacement picks the median of 3 numbers, or of 9 for big groups.",
        source: "[bentley-mcilroy1993] §1 and §3",
      },
      "deeper@sorted": {
        cost: "(n − 1) + (n − 2) + … + 1 = n(n − 1)/2 = {worst}: as slow as the simple way, O(n²). Yet sorted input makes 0 swaps: every number is already at `i`.",
        edge: "Reverse-sorted and all-equal input are as slow with this pivot rule. A random pivot makes it unlikely on any input; the median of the first, middle and last numbers makes sorted input fast.",
        source: "[bentley-mcilroy1993] §3",
      },
      first: {
        when: (v) => !v.slowest,
        plain: "Sorted with {count:comparisons|comparison}, where checking every pair takes {worst}.",
        why: "{count:saved|comparison} never happened: pairs split apart by a pivot never meet.",
        deeper: {
          cost: "With random pivots quicksort expects 2(n + 1)H(n) − 4n comparisons, where H(n) = 1 + 1/2 + … + 1/n: about 1.39 n log2 n, or 20.6 for 9 numbers and 32.7 for 12. This run made {comparisons}.",
          edge: "The worst case is still every pair: McIlroy showed any deterministic pivot rule has inputs that force it.",
          real: "Production sorts build on this. Java sorts `int[]` with dual-pivot quicksort (two pivots, three groups); Rust's `sort_unstable` is ipnsort, a quicksort that falls back to heapsort so it is never quadratic.",
          source: "[mcilroy1999]; [java-arrays]; [rust-sort]",
        },
      },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    // options in a fixed order: the right slot, the middle slot, where the pivot is now (the figure asks only when
    // those are three different slots)
    "place.where": {
      why: "{count:before|other number} {be:before} no bigger than {pivot}, so it lands in slot {slot}, right after them. It was picked for being last, not for its value, so it can land anywhere.",
      options: [
        { feedback: "Right. {count:before|number} {be:before} no bigger than {pivot}, so it takes the slot right after them: slot {slot}." },
        { misconception: "m-middle",
          feedback: "If you expected the middle, slot {mid}: that holds only when the pivot is the middle value. {count:before|number} {be:before} no bigger than {pivot}, so it lands in slot {slot}." },
        { feedback: "It stays at the end only when nothing in its group is bigger. Here some numbers are bigger, so it swaps forward to slot {slot}, right after the {count:before|number} no bigger than it." },
      ],
    },
    "place.left": {
      options: [
        { misconception: "m-middle",
          feedback: "If you expected the pivot to cut the line in half: it lands after every number no bigger than it. Here that is all {before}, so its right side is empty." },
        { feedback: "Right. {pivot} is the biggest, so all {before} others sit on its left and none on its right." },
        { misconception: "m-sorted",
          feedback: "Quicksort never checks whether the line is sorted. To it, the {before} others are one unsorted group, and every one of them will be split again." },
      ],
    },
    "repeat.compared": {
      options: [
        { misconception: "m-pairs",
          feedback: "If you thought every pair meets in the end: every later group lies on one side of {parent}. {left} is on the left and {other} on the right, so they never share a group." },
        { feedback: "Right. Each side of {parent} is sorted on its own, so {left} and {other} never meet. That skipped pair is the saving." },
        { misconception: "m-pairs",
          feedback: "A pivot is compared only with numbers in its own group. Even when {left} or {other} becomes a pivot, its group stays on its own side of {parent}, so the two never meet." },
      ],
    },
    "split.equal": {
      options: [
        { feedback: "Right. The test is `a[j] <= pivot`: {x} is no bigger than {pivot}, so it goes left." },
        { misconception: "m-equal",
          feedback: "If you thought only smaller numbers go left: the test is “no bigger than the pivot”. {x} equals {pivot}, so it passes and goes left." },
        { misconception: "m-equal",
          feedback: "This split has only two sides: left of `i` and right of it. {x} passes “no bigger than {pivot}”, so it joins the left; only a three-way split adds a middle." },
      ],
    },
  },
};
