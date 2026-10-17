# R4 · Audit and product

Research report for `docs/next/PLAN.md` §5 (R4). Branch `next`, 2026-10-16. No code or example files were changed.

## 1. Method

- **Reader's view only, per figure.**
  - The transcript: `node scripts/lesson.mjs examples/<name>/figure.mjs`, saved as `audit-shots/<name>/lesson.txt`.
  - Key frames: `node scripts/shoot.mjs examples/<name>/figure.mjs --out docs/next/research/audit-shots/<name> --themes dark --sizes 1440x900 --teach`. That is every phase (mid and end), every predict card (`-ask`, `-why`), the end card and `contact.png`.
  - All 8 shoots finished with "no page errors, no audit problems". 37–54 PNGs per figure, 362 MB in all; the contact sheets are the bulk of it.
- **Two cold reads per figure, in character, from only the transcript and the PNGs.**
  - First-timer: knows basic Python, has never met the topic.
  - Expert: senior engineer or PhD in the area.
  - Each persona quotes the line at fault and scores every chapter 1–5. Only after that was the source (`figure.mjs`) opened, to tag each problem as **[words]**, **[sim]** or **[visual]**.
  - The figures were split across four parallel reviewers (two figures each) using the same brief. The lead spot-checked the key quotes against `lesson.txt`: the linked-list recap formula, the Raft vote and commit lines, mapreduce's "11 MB/s", virtual memory's "wiped" and quicksort's pacing warnings.
- **Verify:** `node scripts/verify.mjs examples/<name>/figure.mjs` (default: every scenario, every knob extreme, sampler on). Output is in `audit-shots/<name>/verify.txt`.
- **HUD accessibility:**
  - A read-only probe drove the built linked-list page through `scripts/lib/cdp.mjs` at 1440×900, at 390×844, and with `prefers-reduced-motion: reduce` emulated.
  - It checked the Tab order (45 presses), accessible names, live regions, computed text contrast, target sizes, and the reduced-motion class.
  - It was backed by reading `engine/hud/hud.mjs`, `hud.css` and `engine/tokens.mjs`. Evidence shots are in `audit-shots/hud-a11y/`.
- **Product scope:** web research into what PhET, Khan Academy, Desmos, H5P, Canvas, LTI and SCORM/xAPI actually ship, with every claim cited (§6).
- **Severity:** **P0** is wrong or confusing (a fact that is false, or words that contradict the run or the picture). **P1** is a gap. **P2** is polish.

### Scores at a glance

The M1 bar is ≥4 on every chapter, for both personas. **No figure meets it.**

| Figure | Level | First-timer avg | Expert avg | Chapters <4 (FT / Ex) | P0s |
|---|---|---|---|---|---|
| btree | core | 3.8 | 2.8 | 2/6 · 6/6 | 3 |
| consistent-hashing | core | 3.7 | 2.7 | 2/7 · 7/7 | 3 |
| event-loop | core | **2.9** | 3.0 | 6/7 · 6/7 | 4 |
| linked-list | intro | 3.8 | 3.1 | 4/10 · 7/10 | 4 |
| mapreduce | core | 3.4 | 2.9 | 4/8 · 7/8 | 3 |
| quicksort | core | 3.5 | **2.6** | 4/10 · 9/10 | 4 |
| raft | core | 3.0 | 3.2 | 7/9 · 6/9 | 3 |
| virtual-memory | core | 3.5 | 3.0 | 4/8 · 5/8 | 4 |
| **Mean** | | **3.45** | **2.91** | | **28** |

Of the 28 P0s, 21 are in the words alone, 6 combine the words with the sim or the visuals, and 1 is in the visuals alone (event-loop's unmarked queue direction). **Most P0s are fixable today, without the new panel.**

## 2. Per-figure audit

Each subsection lists the problems by priority, with quotes and a [words]/[sim]/[visual] tag, then the two score rows, then the patterns a lint rule or panel feature would fix. Inputs per figure are in `audit-shots/<name>/`.

### btree

Inputs: `audit-shots/btree/lesson.txt` (3 stories: random, sequential, rootsplit), contact sheet + 8 frames read (random 001-end, 006-ask, 007-why, 019-end-card; sequential 017-end; contact for the rest). Verify: 17 runs, 0 failing, 0 warnings.

#### Problems (prioritised)

**P0 (wrong or confusing)**
- [words+visual] Self-contradiction on page size. Predict: "p1 holds 4 ids, but a page fits 3." Why: "A page has a fixed size on disk, so it cannot grow." The frame (random 006-ask) shows 4 tiles sitting comfortably inside p1's well, and steps say "now over-full". First-timer: if it cannot grow, how does it hold 4? Expert: the overflow is a transient in-memory state; real engines split *before* the write (or on the way down). Fix: "The 4th id does not fit, so p1 must split before it can be saved."
- [words] Sequential takeaway is false for real engines: "each split leaves a half-full page behind that never fills again." InnoDB and PostgreSQL both special-case rightmost/append splits (PostgreSQL leaves the left page ~fillfactor 90% full on a rightmost split; InnoDB detects sequential inserts and splits at the insert point). The naive 50/50 policy is what the sim runs; the words present it as a law. Needs a "deeper" layer: "This is the textbook split. Real databases detect ascending keys and split unevenly, so append-only ids fill pages to ~90-100%."
- [words] "All 10 ids are in, but 4 of 5 leaves sit half full" (sequential 017). The frame shows all 5 leaves with 2 ids each (p6 too), and the meter says "67 %". 2 of 3 is not "half"; and the reader cannot tell why p6 is excluded (it is the one that will still fill). Fix wording: "4 of 5 leaves are stuck at 2 of 3: no new id will ever land there."

**P1 (gaps)**
- [words] No cost model. Hook promises "three or four reads" for "a million orders", but the run uses fanout 3 and never connects height to log_fanout(N) or shows why real pages (8-16 KB, hundreds of keys) give height 3-4. The million-row claim is unsourced and never shown. Expert scores this lowest; a `deeper` line + a "powers of ten" note would fix it.
- [words] The defining B+ property is never stated: values/ids live only in leaves; upper pages are routing copies. The copy-up (leaf) vs move-up (inner) distinction appears ("copied up" ch3, "moves up" ch5) but the why ("the leaves already hold every id") exists only in the unused signpost-split question (figure.mjs:491), not in the stories shown.
- [words] Unfair baseline: "the pile took 8 checks" vs "reads 2 pages". Checks (comparisons) and page reads are different units; 10 unindexed rows fit in one page, so a heap scan is 1-4 page reads. Expert: compare page reads to page reads, or say "rows".
- [words] Story 1 takeaway "stays shallow because ... it grows at the top" is never seen in story 1 (no root split occurs there). Teaches a claim the reader did not watch.
- [words] Predict "Where does 15 go? How many pages must be read to find out?" asks two questions; options answer only the count. First-timer may try to answer "where".
- [words] Missing nuance an expert wants: upper levels are almost always cached (1 disk read per lookup in practice), deletes/merges/underflow, duplicate keys, concurrency (latch crabbing), B-tree vs B+ tree.
- [visual] Page names p1..p8 follow allocation order, so the leaf row reads p1, p4, p5, p2 (random end card). First-timer: "why is p2 at the far right?" Never explained. Either say "pages are numbered in the order they were made" or label by position.
- [words] Root changes identity silently: "The first page is also the root" (ch2), then after the split the root is p3 and p1 is a leaf. The caption says "a new root" but the transition (p1 demoted) is not named.

**P2 (polish)**
- [visual] Falling id tile overlaps the "p1" page label (random 007-why: "15" covers "p1").
- [visual] Leaf-chain arrows are thin and low contrast; the range-scan chapter depends on them.
- [words] Ch1 hook analogy switches: phone book (index term), library spines (about), books in a pile (step 0), shelves (ch2-3). Four pictures for one structure; pick one (shelves) and map it.
- [words] Range scan reads leaf p2 only to learn "80 is past 75". Fine, but an expert notes the separator/high key could stop it one read earlier; a deeper note would turn this into a nuance.
- [words] "level core" but reading grade 4.7; tone is intro-level throughout, nothing for Basics/Expert.

#### Scores

First-timer (1-5):

| Ch1 Without an index | Ch2 One page | Ch3 Leaf split | Ch4 Descend | Ch5 Root split | Ch6 Range scan | Avg |
|---|---|---|---|---|---|---|
| 5 | 4 | 3 | 4 | 3 | 4 | 3.8 |

Expert (1-5):

| Ch1 Without an index | Ch2 One page | Ch3 Leaf split | Ch4 Descend | Ch5 Root split | Ch6 Range scan | Avg |
|---|---|---|---|---|---|---|
| 2 | 3 | 3 | 3 | 3 | 3 | 2.8 |

(Ch5 scored from the sequential/rootsplit stories; story 1 has 5 chapters and no root split.)

#### Patterns a lint rule or panel feature would fix
- **Deeper layer (§2.2)**: every expert gap (log_B N, real page sizes, cached upper levels, real split policies) is a one-liner that has nowhere to live today. Lint "key steps have `deeper`" catches it.
- **Hook claim check (lint)**: hook asserts a number ("three or four reads", "a million") that no step computes or cites. Rule: every number in `hook`/`takeaway` is either a run value (template) or carries a cite.
- **Takeaway-witnessed lint**: a takeaway/recap line must refer to an event that occurs in that story (story 1 "grows at the top" never happens).
- **Analogy map (§2.2)**: four competing pictures (phone book, spines, pile, shelves) would be forced into one table row set.
- **Look pointer + "say what a label means"**: p-numbers and the root handover need a `look` chip ("look at p3, the new root").

### consistent-hashing

Inputs: `audit-shots/consistent-hashing/lesson.txt` (3 stories: add, remove, vnodes), contact sheet + 6 frames read (add 002-why, 013-end; remove 007-ask; vnodes 008-end, 011-end-card; contact for the rest). Verify: 20 runs, 0 failing, 0 warnings.

#### Problems (prioritised)

**P0 (wrong or confusing)**
- [words] Vnodes ch3 steps are ambiguous and unexplained: "Each server adds 1 seat: 7 keys change server ... adds 2 seats: 2 keys change ... adds 4 seats: 7 keys change". Seats are cumulative (1→2→4→8, confirmed by the later "each of its 8 seats"), but "adds 4" reads as "has 4". And *why* keys move when no server joined or left is never said; it directly undercuts the lesson's thesis ("only one arc moves"). First-timer: "I thought the ring meant keys don't move?"
- [sim+visual] The dock meter "Keys moved on the ring" reads 16 before db01 leaves and 20 on the end card (vnodes 008-end, 011-end-card), while the story's point is "db01's 4 keys spread over db03, db02 and db04." The headline number counts rebalancing moves from adding seats as if they were caused by the departure. Reset the counter at the "A server leaves" chapter, or split it into two meters.
- [words] Predict ch5 (add): "How many of the 16 keys have to move?" Correct answer: "Only the keys between db05 and the server before it". It asks for a number and gives a definition back; the answer is true by definition, so it tests reading, not understanding. Option C, "All of db04's 4 keys", is a better trap than the wording suggests, but the reader cannot work out the count from the picture at that moment.

**P1 (gaps)**
- [words] No cost model or real numbers in context. Missing: lookup is a binary search over S·V sorted seats (O(log SV)), memory per vnode, expected moved fraction ≈ 1/(N+1) on join, and the mod-N expectation N/(N+1) (here 4/5 = 12.8 of 16; run gives 14). "Nearly all of them" and "most" are vague where the exact expectation is easy and instructive.
- [words] "With 256 seats each: 1.1×" (vnodes 011). The number is computed by the run (figure.mjs:760), which is good, but it appears with no picture, no source and no curve. The expert wants the scaling (max/mean ≈ 1 + O(√(log N / V))) and the real-world choices: Cassandra's num_tokens default fell from 256 to 16 in 4.0, Dynamo's later strategy of fixed equal partitions. One `deeper` line.
- [words] "Busiest server's share" is a share of the *ring*, not of keys. With 16 keys the key counts (end card: 6, 5, 5) and the ring shares (41%, 35%, 24%) disagree, and the reader is never told which one is load. Expert: with few keys sampling variance dominates.
- [words] Missing nuance experts expect: replication (the next R distinct servers clockwise, a preference list), heterogeneous capacity via weighted vnodes, and the alternatives (rendezvous/HRW hashing, jump consistent hash, bounded loads by Mirrokni et al. 2018). Cite is Karger 1997 + Dynamo 2007; neither is surfaced in the lesson text.
- [visual] Server cards float inside the ring, far from their seats; the seat is a tiny numbered square on the circle joined by a thin leader line (remove 007-ask: the "3" marker at the bottom vs the db03 card mid-ring). The words say "Each server sits at the seat its name hashes to"; the picture shows a server sitting somewhere else. First-timer will look at the card, not the seat.
- [visual] Add 002-why: the ring panel is clipped by the left viewport edge (db02 and a purple card cut off) while the remainder-way board takes the space. Nothing marks *which* keys moved on that board, so "14 of 16 change server" cannot be checked by eye.
- [words] First-timer: "user:9 lands at `0xed40_82cb`, 334° round the ring". Hex is not basic-Python knowledge and is never introduced; the degrees are enough at intro level, with hex as a deeper detail.
- [words] Remove story ch4: "db04 now owns 70% of the ring... The remainder way would move 10." The remainder way never ran in this story (it starts at "The ring"), so "10" arrives unexplained.

**P2 (polish)**
- [words] Unit switch from "%" (ch3-4: "db03's arc is 49%") to "×" (vnodes: "falls from 2× to 1.6×") without saying that 2× means "twice the fair 25%".
- [words] Mixed metaphors: counting off into teams, round table and seats, guest finding a host, pulling up a chair. Pick the table and map it once.
- [words] Meter label "keys moved the remainder way" is awkward; "keys moved with hash % N".
- [visual] The hash function (MurmurHash3, 32-bit) appears only as a tiny plate label ("HASH RING · MURMUR3, 32-BIT"). The words say "about 4.3 billion" but never "2^32" or the hash's name. It belongs in `deeper`.
- [words] Ch1 step 1 "5, 1, 4 and 6 keys" and ch4 "3, 1, 8 and 4": the order (db01..db04) is implied, not stated.

#### Scores

First-timer (1-5), story 1 (add), plus vnodes ch3 scored separately:

| Ch1 The simple way | Ch2 One more server | Ch3 The ring | Ch4 Keys | Ch5 Add a server | Ch6 Result | Vnodes: Many seats | Avg |
|---|---|---|---|---|---|---|---|
| 5 | 4 | 4 | 4 | 3 | 4 | 2 | 3.7 |

Expert (1-5):

| Ch1 The simple way | Ch2 One more server | Ch3 The ring | Ch4 Keys | Ch5 Add a server | Ch6 Result | Vnodes: Many seats | Avg |
|---|---|---|---|---|---|---|---|
| 3 | 3 | 3 | 3 | 3 | 2 | 2 | 2.7 |

#### Patterns a lint rule or panel feature would fix
- **Why layer (§2.2)**: the vnode steps state a count ("7 keys change server") without the why. A lint rule could flag a step that reports a counter change in a chapter whose `about` says that counter shouldn't move.
- **Meter scope (new lint/engine rule)**: a primary meter that keeps counting across chapters with different meanings. Support a per-chapter reset, or lint "a recap/takeaway number disagrees with the dock".
- **Predict quality lint**: a "How many" question whose correct option has no number. Rule: a numeric stem needs numeric options (§2.3 predict-the-number).
- **Deeper layer + templates (§2.4)**: expected-moved formulas (1/(N+1), N/(N+1)) templated from run values make the run's 3 and 14 meaningful to an expert.
- **Look pointer (§2.2)**: "the seat" vs "the server card" is exactly the case for `look: ["seat:db03"]` lighting the small marker, not the card.
- **Cross-story term carry-over (lint)**: "the remainder way" used in a story that never showed it.

### event-loop

Inputs read: `audit-shots/event-loop/lesson.txt` (4 stories, 1717 words, grade 5.7), `contact.png`, and order-004-mid, order-010-why, order-012-mid, await-006-ask, await-009-mid, starve-012-mid, yield-022-end-card. Verify: 36 runs, 0 failing, 0 warnings.

#### Problems (P0 = wrong or confusing, P1 = gap, P2 = polish)

**P0**
- [words] Await story, step 5: "`load()` has returned an unfinished promise. then queues behind the rest of load". A first-timer reads this as `load().then(...)`. In the source (`a.then`) it is a separate `Promise.resolve().then(...)`. If it were chained on `load()`, "then" would print after `load 3`, not before it. The lesson never shows the program, so the reader cannot tell which it is. Two unrelated facts are joined into one sentence.
- [words] The program is never shown in the transcript, and only appears as fragments in the panel. A first-timer who knows Python has never seen `.then`, `async`/`await`, `setTimeout` or `fetch`. "then 1 joins the microtask queue, then 2 waits for then 1" (order, step 5) names callbacks by their log strings, with no code to anchor them. The figure's own persona comment says the reader "knows roughly what .then and await do", which assumes JavaScript experience the novice persona lacks. (The code panel exists behind `</>` but is closed by default.)
- [words] Order, chapter 1 introduces **7 terms**: task, microtask, event loop, call stack, callback, Web APIs and promise (repaint comes later). That is the same overload PLAN §1.2 flags in the linked list. `await` and `async` are used in story 2 and are never defined.
- [visual] Queue direction is unmarked. In order-012-mid and await-006-ask the newest tile sits on the **left** (`then 2` left of `micro`; `then` left of `load`), and the exit arrow leaves on the right. A left-to-right reader sees `then` ahead of `load` while the caption says "then queues behind the rest of load". There is no "next" or head marker on the queue tray.

**P1**
- [words] Expert, starve and yield: "A repaint is a task, and no task starts while microtasks wait" (the why after step 11), and "A render task joins the task queue". This matches the current HTML spec wording (rendering is queued on the rendering task source). The figure then orders it FIFO behind the timer in the same queue ("timeout ... runs at 32 ms", then "The render task repaints"). The spec lets the user agent pick *any* task queue, and browsers prioritise rendering. The FIFO order between task sources is a model choice and is never labelled as one. The same applies to "The oldest task: timeout" in yield step 9.
- [words] Expert: there is no `requestAnimationFrame` and no note that a repaint happens only at a rendering opportunity (vsync), not after every task. "16.7 ms: time for a new frame" assumes 60 Hz without saying so. The Screen refresh knob exists, but the words don't mention it.
- [words] Expert, yield: the 4 ms clamp is correct per spec ("nesting level greater than 5"), but there is no source on screen and no note that browsers differ (Chrome throttles background tabs to 1 s, for example). The modern remedies (`scheduler.yield()`, a `MessageChannel` post, `isInputPending`) are missing, so the takeaway "at the cost of the timers' minimum delay" reads as the only option.
- [words] Expert: there is no cost model. Starve's freeze is 32 ms; the reader never learns that a long task is 50 ms or more (the RAIL and INP thresholds), or what a user feels.
- [words] Expert: there is no Node contrast (`process.nextTick`, `setImmediate`, libuv phases). Many readers will assume the browser model holds there.
- [words] First-timer, starve step 4: `bar.value = 1` and `processBatch()`. The bar is never introduced as a progress bar. The "page" box appears in the screenshot with "painted 0/8" but the words never point at it.
- [words] First-timer, yield, Timer limit chapter: "once timers have set timers more than five deep" is the most abstract sentence in the lesson, with no example of counting the depth. The tag "nested N deep" exists in the world, but no "look at" points to it.
- [words] The cook analogy ("one cook with an order rail") is introduced in every story's first chapter and then dropped after "what's cooking now". There is no mapping of order to task, note to microtask, or rail to queue after that.

**P2**
- [words] The same chapter "about" text repeats verbatim at the start of all 4 stories ("Think of one cook…").
- [visual] order-010-why: the `then 1` tile on the call stack is drawn twice, overlapping, during the move (ghost tile). The yield end card crops the task and microtask queue boxes at the left edge.
- [words] "Web APIs" is a talk-era name (Philip Roberts), not a spec term. That's fine for novices; experts would like "(browser-provided; not part of JS)".
- [words] Repetition: "No wait needed: the timer puts timeout in the task queue at once. The script keeps running" appears 3 times.

#### Scores (1–5)

| Chapter | First-timer | Expert |
|---|---|---|
| order · The script | 2 | 3 |
| order · Before the next task | 3 | 4 |
| order · The timer | 4 | 3 |
| order · The network | 3 | 3 |
| await (3 chapters) | 2 | 3 |
| starve (3 chapters) | 3 | 2 |
| yield (3 chapters) | 3 | 3 |
| **Average** | **2.9** | **3.0** |

#### Patterns a lint rule or panel feature would fix
- **Show the code as a lesson layer.** For a code-driven concept, the "look at" pointer should light the source line, and the code panel should be open by default at New. A lint rule: a step that names a callback must have a visible code line.
- **Term-load lint** (at most 3 per chapter at core) would have split order chapter 1. A **prerequisite check** (`prerequisites: ["JS functions", ".then"]`) would surface the persona mismatch.
- **The "deeper" layer** is where the spec-vs-browser nuance goes: rendering priority, rAF, the clamp source, `scheduler.yield`, Node phases. The plain line can stay simple.
- **An analogy map** row lit on every step would keep the cook/rail picture alive, instead of dropping it after step 1.
- **Queue semantics in the world**: a head marker on queues. Possibly an audit check that the tray order matches the caption's "behind".

### linked-list

Level intro · 3 stories (insert, find, wrong) · 1017 words · grade 4 · verify 15 runs, 0 failing, 0 warnings.
Shots: `audit-shots/linked-list/` (37 PNGs + contact.png; read: contact, insert 004-end, 009-end, 013-ask, 016-end-card, find 001-end, wrong 016-end).

#### Problems

**P0 (wrong or confusing)**
- [words] Find recap contradicts its own chapter: chapter about says "item k sits at start + (k − 1) × 4", recap says "start + position × size". With 1-based "5th item" that recap formula is off by one. An expert flags it at once; a novice who learned the first form now has two.
- [words] Wrong story, predict: "Now `new.next = node.next` runs." First time code appears in the panel; `new` was never introduced and `node` was earlier "Our marker, `node`". The novice cannot parse the question they are asked to predict on.
- [words] "Our marker, `node`, is on 31" (Walk, step 10). The variable `node` collides with the just-defined term "node" (a box). A first-timer reads "the node node".
- [words] Trade-off takeaway "A linked list never moves its items: inserting just changes two arrows. The price is finding things." True as stated, but the only cost named is the walk. No mention of the extra pointer per node, one allocation per node, or cache misses. A novice leaves believing lists are the fast choice for inserts; an expert calls this misleading (arrays usually win in practice even for middle inserts at small/medium n).

**P1 (gap)**
- [words] Ch2 "Boxes and arrows" introduces 5 terms in 5 steps (node, address, pointer, head, null). Overload at intro level.
- [words] "We want 42 right after 12." No real reason to want this (playlist, editor lines, undo list).
- [words] "Start at the end: 23 slides one slot to the right" gives no why; the why (going front-first overwrites 48) is the interesting part.
- [words] Step 7 "so a line runs to the node there: a pointer" leaves it unclear whether the pointer is the line or the stored value (glossary says value, "drawn here as a line").
- [words] Find ch1: "4 bytes each" with no why (an int is 4 bytes) and the (k − 1) appears with no explanation of counting from 0.
- [visual] Find ch1: words say "Start + 4 × 4 bytes: one calculation, one jump" but the array shows no per-slot addresses and no jump; slot index ticks under the array are near-invisible (dark grey on dark slab). Picture does not show the sum.
- [words] No cost model anywhere: O(n) to find, O(1) to splice, O(n) array shift (memmove), capacity/realloc for a full array (the scene quietly provides "one free slot").
- [words] No edge cases: insert at head (head itself changes), empty list, tail insert without a tail pointer, doubly linked (4 writes).
- [words] Trade-off chapter is one step reading out counters ("Array: 3 items moved. List: none moved, 2 arrows changed, 1 arrow followed.") with no generalisation to n ("for a million items: up to a million moves vs a million hops").
- [visual] Dock carries "Items moved 3" from chapter 1 through every list chapter (013-ask: "Items moved 3 · Arrows changed 0" while the list is on screen); a first-timer may read it as the list having moved 3.
- [sim] Ch3 Walk in the insert story is 2 steps and reaches 12 after 1 arrow; the predict-the-number moment ("how many arrows to reach the spot?") is only in the find story.

**P2 (polish)**
- [visual] "value" / "next" / "first node" sublabels inside node cards render ~6 px at 1440x900; unreadable.
- [words] "48, 17 and 23 are lost for good" is true for reachability; expert would add "leaked in C, collected in a GC language".
- [words] Cite is Knuth §2.2.3 only; no pointer to a real code base (Linux `list.h`, allocator free lists) for the expert.
- [visual] Array panel stays in every later chapter (useful for comparison, but competes with the list for attention in the Insert/Walk chapters).

#### Scores (1-5 per chapter)

| Story · chapter | First-timer | Expert |
|---|---|---|
| insert · 1 Arrays shift | 4 | 3 |
| insert · 2 Boxes and arrows | 3 | 4 |
| insert · 3 Walk | 4 | 3 |
| insert · 4 Insert | 4 | 3 |
| insert · 5 Trade-off | 3 | 2 |
| find · 1 Arrays jump | 3 | 3 |
| find · 3 Walk | 5 | 3 |
| find · 4 Trade-off | 4 | 2 |
| wrong · 4 Wrong order | 3 | 4 |
| wrong · 5 Right order | 5 | 4 |
| **Average** | **3.8** | **3.1** |

(find · 2 repeats insert · 2 and is not rescored.)

#### Patterns a lint rule or panel feature would fix
- **Term-load lint** (§2.5): flags Ch2's 5 terms; would force splitting into "node + address" then "pointer + head + null".
- **Code-identifier lint** (new): any backticked identifier (`new`, `node`) must be defined before use and must not collide with a glossary term.
- **Why layer + deeper layer** (§2.2): every gap above ("why the end?", "why 42 after 12?", O(1)/O(n), cache misses, head insert) has an obvious home; today there is nowhere to put depth without overloading the plain line.
- **Recap/about consistency lint** (new): formulas and numbers in the recap must match the chapter text (catches the off-by-one).
- **Misconception coverage lint** (§2.5): the "linked lists are faster" misconception (already drafted in PLAN §2.4) has no confronting step today.
- **Look pointer** (§2.2): would tie "Start + 4 × 4 bytes" to a visible slot address.

### mapreduce

Inputs read: `audit-shots/mapreduce/lesson.txt` (4 stories, 2001 words, grade 6.5, the highest of the 8 figures), `contact.png`, and happy-012-why, happy-019-mid, crash-008-end, straggler-006-ask, skew-027-end-card. Verify: 26 runs, 0 failing, 0 warnings.

#### Problems (P0 = wrong or confusing, P1 = gap, P2 = polish)

**P0**
- [sim+words] Straggler: "map 1's disk is failing (11 MB/s)". The number is a hard-coded string (`figure.mjs:298,301`), not computed by the run, which breaks "every number from the run". It is also unsourced. The paper's example is a disk slowing "from 30 MB/s to 1 MB/s" (Dean & Ghemawat §3.6). A first-timer can't tell whether 11 MB/s is slow.
- [words] Expert, crash: "The text was still on disk, so the master had that piece read again." The lesson only covers an *in-progress* map failing. The paper's key point (§3.3) is missing: *completed* map tasks on a failed worker are re-executed too, because their output lives on that machine's local disk. Completed reduce tasks are not re-executed, because their output is in the global file system. Without it, the expert sees a half-truth, and the novice wrongly concludes that finished work is always safe.
- [words] Expert, skew: "That keeps counts exact, but one very common word loads one machine" (takeaway). The figure has a combiner knob ("Add up repeats first", `figure.mjs:50`), the textbook fix for exactly this skew in word count, but no story or step mentions it. The takeaway reads as if skew is unavoidable.

**P1**
- [words] First-timer, chapter 1: "11 words to count". The text itself is never printed in the transcript. The world shows only "split 0/1/2" and "11 words". The reader meets slips like `(jumps, 1)` without having seen the sentence.
- [words] First-timer, shuffle: "its remainder after dividing by the number of counters picks the machine". `%` is familiar from Python, but there is no **why** hashing is used at all (why not alphabetical, or round-robin?). Wrong option A, "spread the slips evenly", is the natural novice idea and gets no explanation of why it would break the counts. There is also no why for 3 readers but 2 counters.
- [words] First-timer, skew: "the status code 200", "a web log of 14 requests", "301", "404". HTTP status codes are never defined for a Python novice.
- [visual] crash-008-end: map 1 is marked crashed (red edge) but its "lost" slips `jumps` and `over` are still drawn in its tray. The words say "its 2 slips are lost with it", and the picture shows them sitting there.
- [words] Expert: no cost model or real-scale numbers. Missing are M and R sizing (the paper: M=200,000, R=5,000, 2,000 machines), 16–64 MB splits, data locality (schedule a map near a GFS replica, since network bandwidth is the scarce resource), and the backup-task gain (the paper's sort runs 44% longer without backups).
- [words] Expert, shuffle: "every slip travels to the machine that adds up its word". The real model is that mappers write R partitioned files to local disk and reducers *pull* them by RPC once the master tells them where. The reduce phase cannot start until every map is done (the barrier). The picture of slips flying one by one hides the barrier and the local-disk detail, and that detail is what the crash story depends on.
- [words] Expert, crash: "notices when one fails" (glossary). The detection mechanism (the master pings workers; no reply within a timeout means failed) is in the source comment but never on screen. The determinism assumption ("reading the same piece again gives the same slips") is stated without the paper's caveat about non-deterministic map functions.
- [words] Expert, straggler: there is no note that backups are launched only "when a MapReduce operation is close to completion", and no note of the cost (a few percent more resources).

**P2**
- [words] The same predict question ("The first 'the' went to reduce 0. Where does this 'the'…") is asked in all 4 stories, with the same 3 options. It is a dead check by the second story.
- [words] "reduce 0 sorts its 7 slips … (4 swaps)". The swap count is noise for both readers. The real reducer does a merge or external sort by key. The sim uses a selection sort by swaps (`figure.mjs:420`), which is fine visually, but "swaps" invites the wrong mental model.
- [words] "Sent between machines 56 B" in the dock: the byte unit and its meaning are never explained in the words.
- [visual] skew-027-end-card: a sliver of the collapsed chapter "about" text is clipped under the panel title ("status code." cut in half).
- [words] "The master re-runs split 1 on map 0" uses split as the task's name. "Has map 0 read split 1 again" would be clearer.

#### Scores (1–5)

| Chapter | First-timer | Expert |
|---|---|---|
| Split | 3 | 3 |
| Map | 4 | 3 |
| Shuffle | 3 | 3 |
| Reduce | 4 | 3 |
| Output | 4 | 4 |
| crash · Map (failure) | 3 | 2 |
| straggler · Map (backup) | 3 | 3 |
| skew (whole story) | 3 | 2 |
| **Average** | **3.4** | **2.9** |

#### Patterns a lint rule or panel feature would fix
- **Numbers-from-run lint**: flag numeric literals with units (`MB/s`, `ms`, `GB`) inside caption strings that are not template values. The 11 MB/s would fail it.
- **Misconception coverage lint**: "the reducer can start early" and "finished work is safe" each need a confronting step. Per-option feedback would explain why "spread evenly" breaks exact counts.
- **A knob with no story** (the combiner): a lint warning when a param never changes any story's captions in a way the lesson discusses, or a "what if" pointer to it from the skew end card.
- **The deeper layer** carries the paper's numbers (M, R, split size, the 44% backup gain), locality, the pull and barrier model, and determinism, each cited. An **objective coverage** lint keeps it honest.
- **A "look at" pointer** on the crash step to the lost slips (and the visual removing them) would fix the word/picture mismatch. A **choose** step ("which tasks must re-run?") turns the crash story into discovery.

### quicksort

Level core · 3 stories (random, sorted, dups) · 2436 words · grade 5.3 · verify 12 runs, 0 failing, 2 warnings.
Shots: `audit-shots/quicksort/` (41 PNGs + contact.png; read: contact, random 007-mid, 012-why, 026-mid, sorted 056-end-card).

#### Problems

**P0 (wrong or confusing)**
- [words] Sorted takeaway: "Already sorted input is quicksort's slowest case: the last number is always the biggest, so every pair gets compared." True only for a last-element pivot. Never says so; never mentions random pivot or median-of-three, the standard fix (and what Hoare 1962 itself recommends). A novice leaves believing quicksort is always quadratic on sorted data; an expert calls the generalisation false.
- [words] Dups takeaway: "A copy of the pivot counts as small, so many repeats make the splits lopsided and slow." A property of Lomuto with `<=`, not of quicksort. Hoare's two-sided partition and 3-way partition (Dijkstra's Dutch flag, Bentley–McIlroy) are fast on repeats. The scheme is never named in the reader's view.
- [words] Cite mismatch: the figure cites Hoare, "Quicksort", Computer Journal 1962, but runs Lomuto/CLRS partitioning (source comment line 1). An expert checking the source finds a different algorithm.
- [words]+[visual] Partition is narrated without the invariant: "Marker `j` checks each number in turn; `i` marks where the next smaller one will go." Then "29 is smaller than 87: it is already on the left" when nothing has visibly been split. The picture (random 007-mid) shows only the i/j tags under slots; there is no "≤ pivot | > pivot | unchecked" banding, so "on the left side" has no referent. A first-timer is lost here, at the heart of the algorithm.

**P1 (gap)**
- [words] No cost model. The hook promises "far fewer comparisons", but the reader only sees 21 vs 36 at n = 9. Never: average ~1.39 n log2 n (≈2n ln n) vs n(n−1)/2, worst case O(n²), and what that means at n = 1,000,000.
- [words] Missing expert nuance: recursion depth O(n) in the worst case (stack overflow risk; recurse on the smaller side), not stable, in place, introsort/pdqsort as what libraries actually ship.
- [sim]/[words] Ch4 "Repeat on each side" is 26 steps (random) and 43 steps (sorted, dups) in one chapter, mostly identical lines ("8 is smaller than 87: it stays left" × n). It fails segmenting. The sorted and dups stories repeat the same shape for ~4 minutes each.
- [visual] No view of where we are in the recursion (random 026-mid: "Right of 8: slots 1–3, with pivot 29"). The active group is not bracketed and there is no call tree or stack, so a novice loses track of which group is in play.
- [words] The line-of-people analogy ("Each number is a person in a line... height") is dropped after Ch2 and never maps to pivot or partition again.
- [words] Ch1 "The simple way: 8 comparisons find the smallest, 7 the next..." The baseline is selection sort but isn't named. The 36 is fixed for that method, yet the comparison is framed as "comparing every pair", conflating "the simple way" with the all-pairs bound.
- [words] Random ch5: "Skipping pairs on opposite sides saved 15 of the 36 comparisons". This is one sample at n = 9, with no note that the saving grows with n. At n = 9 the gap looks small, which undercuts the hook.
- [visual] The `swaps` counter exists, but the dock shows only Comparisons; the 36 baseline is not on screen as a reference line.
- [words] Recap random: "until every group has one number". Groups can be empty (the right side of 99 in sorted). Minor imprecision.

**P2 (polish)**
- [visual] Slot index numbers (0–8) under the bar are very low contrast, but predicts depend on them ("slot 4", "slot 7").
- [visual] Placed-for-good cells (pale mint) vs active cells vs out-of-group cells (dark grey) are distinguished only by colour, with no legend.
- [words] "`i` steps past it" / "`i` steps on" vary for the same action.
- [words] Dups predict "Neither: it waits beside the pivot" is a nice distractor, but its 3-way-partition reality is never revealed as the fix.
- verify: 2 advisory pacing warnings: phase "Repeat on each side" lasts 202 s (278 s unfolded) and 161 s at 1x, over the 150 s limit. This confirms the segmenting P1.

#### Scores (1-5 per chapter)

| Story · chapter | First-timer | Expert |
|---|---|---|
| random · 1 The line | 4 | 3 |
| random · 2 Split around one | 2 | 3 |
| random · 3 Into place | 4 | 4 |
| random · 4 Repeat on each side | 3 | 3 |
| random · 5 Sorted | 4 | 2 |
| sorted · 3 Into place | 4 | 3 |
| sorted · 4 Repeat (43 steps) | 3 | 3 |
| sorted · 5 Sorted | 4 | 1 |
| dups · 2 Split (equal = small) | 4 | 3 |
| dups · 4–5 Repeat + Sorted | 3 | 1 |
| **Average** | **3.5** | **2.6** |

(Repeated chapters across stories are not rescored.)

#### Patterns a lint rule or panel feature would fix
- **Deeper layer + misconception coverage lint** (§2.2, §2.5). "Sorted is the worst case" and "duplicates are slow" are scheme-specific truths stated as universal. A misconception entry ("quicksort is always slow on sorted input") with a confronting step and a pivot-choice what-if (a new knob in the simulation) would fix both P0s.
- **Scope/qualifier lint** (new). A takeaway that names the algorithm ("quicksort's slowest case") must carry its variant ("with the last number as pivot"). This could be checked against `meta.variant`.
- **Look pointer + region visuals** (§2.2). "on the left side" needs a lit region in the world; the look chip should point at the ≤-pivot band.
- **Progress map** (§2.2). Applied inside a long recursive chapter, it would show the call tree and the current group.
- **Segmenting lint** (new, or a stricter step-count per phase). Flag chapters over ~12 steps or runs of more than 5 identical caption shapes; offer "skip the rest of this group" or a faded "your turn: predict where the pivot lands".
- **Cite-matches-sim check** (new, §4.4 trust page). `meta.cite` should name the variant actually run (CLRS §7.1 for Lomuto).

### raft

Inputs: `audit-shots/raft/lesson.txt` (3 stories, 9 distinct chapters, 6 questions, 10 defined words, grade 5.6), contact sheet plus `happy-002-end`, `happy-013-ask`, `crash-029-mid`, `partition-077-why`, `partition-086-end-card`. Verify: 24 runs, 0 failing, 1 warning (2 captions over 18 words at `drop=0.1`).

#### Problems (P0 = wrong or confusing, P1 = gap, P2 = polish)

**P0**
1. **The commit question contradicts the picture and the transcript** [words]. Step 10 says "S2, S3 and S5 copy `x←3` as entry 2" and step 12 says "S4 copies `x←3`". That puts it on all 5. The question then asks "x←3 is on 3 of the 5 servers. Can S1 count it as committed now?", and `happy-013-ask.png` shows `x←3` tiles on all five trays. In the code, `have` counts the acks the leader has received (`matchIndex`), not the servers that hold the entry. "On" mixes up *stored* with *the leader knows it is stored*. A novice sees 5 and reads 3. An expert sees the real distinction (the commit rule counts acknowledgements) blurred. Fix: "S1 has heard back from 2 servers, so it knows x←3 is on 3 of 5."
2. **The definition of committed is false as written** [words]. The glossary says "commit: … it is on a majority of servers, so it can never be lost." The takeaway says "An entry counts once most servers store it." Raft §5.4.2 / Figure 8 says an entry from an earlier term that is stored on a majority can still be overwritten. A leader commits by counting replicas only for entries from its own term. The sim implements this correctly (a no-op per term, and a "Stuck" chapter with the about "A leader may only count copies of entries from its own term…"), but no default story reaches that chapter. So steps like "S5 commits it and the older `y←7` before it" (crash 29) and "S3 commits it and the older `x←3` before it" (partition 48) go unexplained.
3. **The vote counts contradict each other** [words, sim chorus timing]:
   - "4 servers vote for S1" (step 2) is followed by "S1 wins term 1 with 3 of 5 votes" (step 3), then "the late vote of S2 changes nothing" (step 5).
   - In the partition story: "S5 and S4 vote for S3" (38–39) is followed by "S3 has 2 of the 3 votes it needs" (40).
   - "Vote" is used both for a vote being cast and for a vote arriving. `happy-002-end.png` draws only 2 lines toward S1 while the caption says 4.

**P1**
4. **The `nop` is never explained** [words]. "writes an empty `nop` to mark its term" never says *why*: it is what lets older entries commit. This is the deepest idea in the figure, and it gets one clause.
5. **"Log is as complete as theirs" is imprecise** [words]. The real check (§5.4.1) compares the last entry's term first, then the index. "Complete" suggests length, and a longer log with an older last term loses.
6. **Client retries are idempotent in the sim, silently** [words]. "S5 already has `y←7` as entry 3; it waits for a majority" works because the sim dedupes by request id (`e.id === b.id`). The words never say the client tags each request. Without that, real Raft would append a duplicate (dissertation §6.3).
7. **The partition story has no read-safety nuance** [words]. The minority leader "still thinks it leads". It never says it would serve stale reads unless it uses ReadIndex or leases (dissertation §6.4).
8. **No cost model** [words]:
   - a commit costs about 1 round trip to the median follower
   - each entry costs 2(N−1) messages
   - the leader is the throughput bottleneck
   - why 5 servers tolerate 2 failures (and why 4 is no better than 3)
9. **Numbers are given with no source on screen** [words]. "random 150–300 ms timer" matches Ongaro & Ousterhout 2014 §9.3 but isn't cited at that step. The heartbeat interval and the rule that election timeout ≫ broadcast time are never given.
10. **The legend doesn't teach the colour code** [visual]. Tile colour means *term* (blue t1, coral t2), and brightness means *committed* (dim until the server knows). The dock shows only "1 key" or "2 keys". A novice can't read commit state from the picture, and in the partition story coral term-2 tiles look like the red "lost message" traces.
11. **"Entries committed 5" doesn't match the text** [visual/words]. The final caption lists 3 commands (`x←3, y←7, x←5`) while the dock says 5, because the nops are counted.
12. **The catch-up mechanism is hand-waved** [words]. "The leader's updates find where the two logs differ" never shows the consistency check failing and `nextIndex` backing up. The step goes straight to "S1 copies `nop` and `x←5`".

**P2**
13. The partition chapter is padded:
    - steps 24–37 repeat "S1 keeps sending, but nothing reaches…", "S2 takes S1's heartbeat…" and "S2 confirms…" 4–5 times each
    - "S1 ignores an old reply from S3/S2/S5/S4" fills 79–85

    That is 87 steps and 240 s [sim chorus].
14. "node" is defined in Heal chapter 5 and used once [words]. Drop it.
15. Pronouns are ambiguous [words]:
    - "S3 rejects S1: its term 1 is older than its own term 2"
    - "S2 and S1 replace 1 uncommitted entry… S1 stops leading" (it stepped down before replacing)
16. Chapter 1 has 3 steps and "Agreement" has 1 step [sim pacing]. The hook "How do they never end up disagreeing?" overpromises: uncommitted suffixes do disagree, as Heal shows.
17. The client tray stays empty all run [visual]. It never shows the pending or acked commands it's narrated as holding.

#### Scores

| Persona | Election | Copying the log | Agreement | Crash | Re-election | Catch-up | Network splits | New leader | Heal | Avg |
|---|---|---|---|---|---|---|---|---|---|---|
| First-timer | 3 | 2 | 4 | 4 | 3 | 3 | 3 | 2 | 3 | **3.0** |
| Expert | 3 | 2 | 3 | 4 | 3 | 3 | 4 | 3 | 4 | **3.2** |

How each persona read it:
- **First-timer:** the notebook analogy and the three predict questions land well. They get lost in the counts (problems 1 and 3), "confirms: its log matches", "mark up to entry N committed", and the unexplained `nop`.
- **Expert:** they like that the run is real: no-op per term, persisted log, request-id dedupe. They object to the definition of committed (Figure 8), the "as complete as" shorthand, and the missing cost, read and liveness nuance.

#### Patterns a lint rule or panel feature would fix

- **Templates must say what the variable means.** A value such as `have` (acks) rendered as "is on N servers" is the wrong noun. Under §2.4 templated text, a lint could require template vars to carry a unit or meaning ("acked by", "stored on"), plus a check that a predict's stated count matches the visible world state (the `look` resolver in §2.5).
- **Deeper layer (§2.2).** Figure 8 / current-term commit, the up-to-date rule, request ids, ReadIndex and the message cost all belong in "Go deeper". The sim already does them.
- **Misconception coverage lint (§2.5).** "Committed means on a majority" is itself a misconception the figure currently *teaches*. Coverage would force a step (the Stuck chapter) into a default story.
- **Chorus or step-density lint.** Flag runs of more than 3 consecutive steps with the same caption shape inside one chapter, and fold them (§2.2 calm rules).
- **Analogy map and legend (§2.2 item 3).** The analogy map plus a real legend row would teach term colour versus committed brightness.

### virtual-memory

Inputs: `audit-shots/virtual-memory/lesson.txt` (3 stories, 8 distinct chapters, 3 questions, 12 defined words, grade 5.9), contact sheet plus `miss-002-end`, `miss-006-mid`, `miss-013-ask`, `miss-024-end-card`, `fault-010-mid`. Verify: 12 runs, 0 failing, 0 warnings.

#### Problems (P0 = wrong or confusing, P1 = gap, P2 = polish)

**P0**
1. **"A's sticky notes are wiped" is false on most current CPUs** [words]. On step 18 the sim's own comment says "as it does on x86-64 without PCIDs", but the caption drops that qualifier. With PCID (x86) or ASIDs (Arm), and Linux using PCID since 4.14, the TLB keeps A's entries tagged across the switch. The caption should say "on a CPU without address-space tags (PCID)" in the deeper layer.
2. **Worst-case walk cost is presented as typical** [words, sim]. Each level is "240 cycles" from DRAM, so a walk is 961 cycles, and step hit-5 says "Walking the directory would have added 960 cycles". Real MMUs have paging-structure caches (Intel SDM §4.10.3), and page-table lines usually sit in L1/L2. A typical miss costs tens of cycles, not about 1,000. The fault story's 14-cycle-per-line walk is closer to normal. Fix: label 961 as "nothing cached, worst case".
3. **The chapter is a wall of unexplained jargon for a first-timer** [words]. "Bits 47–39 pick line 254 of level 1, PML4 …", "PDPT", "PD", "PT", "CR3", "9-bit slice" and "frame" all arrive in one chapter, which is 7 new terms. "Bits", "low 12 bits" and hex (`0x7f3a_2c10_8e48`) are never introduced either, and a basic-Python reader may never have counted bits.
4. **The isolation explanation is incomplete enough to mislead** [words]. Take the takeaway "so programs can't touch each other's memory". Separate tables are only half of it. The rest is that only the kernel can write CR3 (a privileged instruction), and that PTE permission bits (U/S, R/W, NX) are enforced. Shared libraries, shared memory and copy-on-write pages are deliberately mapped into both programs, so "can't touch" is false as an absolute.

**P1**
5. **Level numbering is inverted against Intel/Linux** [words]. "level 1, PML4 … level 4, PT" is backwards: Intel calls PML4 the level-4 table, and PT is level 1. An expert stumbles, and a novice who later reads the SDM is confused.
6. **"notes answer over 99% of lookups" has no source** [words]. It is workload-dependent: graph and big-data workloads see far higher TLB miss rates, which is the whole case for huge pages. Cite it or soften it.
7. **The TLB is undersized with no label** [visual/words]. It shows "8 notes … 1 cycle". Real L1 dTLBs have about 64 entries and the L2 STLB about 1.5–2K. Lookup runs in parallel with the VIPT L1 cache, so the effective extra cost is about 0. The shrink is a fine teaching choice but should say "shown with 8; real CPUs have ~64 + ~1,500".
8. **The predict option C is half-true in real hardware** [words]. "About half: part of the walk is remembered" is how paging-structure caches behave on a *different* page in the same region. Marking it plainly wrong teaches a false absolute. The wrong-option feedback should say "true for a neighbour page, not this one".
9. **The fault story shows only a major fault** [words]:
   - minor faults are not mentioned: first touch, zero-fill, copy-on-write and page-cache hits are most real faults
   - during the 20 µs SSD read, the OS blocks the process and runs another one; it doesn't just wait
   - the numbers (1 µs trap, 20 µs NVMe) are sourced in the README and the code comment, but not on screen
10. **Huge pages are absent** [words]. 2 MiB and 1 GiB pages, and how they shorten the walk and widen TLB reach, are the expert's first "what about…". They belong in the depth layer.
11. **"boxes" is undefined** [words]. "The page's boxes went to storage" comes from the analogy (README picture), but the reader never got the boxes metaphor. On top of that there are 4 metaphors (apartment numbers, rooms, sticky notes, directory) and no analogy map tying them to terms.
12. **The bit-row labels can't be read at 1440×900** [visual]. "PML4 · bits 47-39", "offset · bits 11-0" and "the program's address (virtual)" render at about 6 px in `miss-002-end.png`. That is the main mapping between words and picture in chapters 1 and 3.

**P2**
13. The TLB tray starts full of `555555555…` and `7ffde4b…` entries [visual]. They are real (PIE and stack pages), but they look like filler to a reader, and no caption says the notes start occupied by the program's other pages.
14. Upper 16 bits and canonical addresses are never mentioned [words]. A "48-bit" virtual address inside a 64-bit number goes unexplained.
15. The end-card framing clips the leftmost tray ("0x5190_8000" cut at the screen edge) in `miss-024-end-card.png` [visual].
16. "Room `0x189f3`, then offset `0xe48`, side by side" [words]. Concatenation of hex digits works only because 12 bits is 3 hex digits, which is never said.
17. "Directory reads from the cache" is in the numbers list, but "cache" is only defined in the fault story [words].

#### Scores

| Persona | Apartment numbers | Sticky notes | The directory | The real room | Same page again | Another program | Fetch from disk | Try again | Avg |
|---|---|---|---|---|---|---|---|---|---|
| First-timer | 3 | 4 | 2 | 3 | 5 | 4 | 3 | 4 | **3.5** |
| Expert | 4 | 2 | 2 | 4 | 3 | 2 | 3 | 4 | **3.0** |

How each persona read it:
- **First-timer:** the "same page again" aha and the A-versus-B ending land well. The directory chapter loses them (problems 3 and 12).
- **Expert:** they respect the real PTE format, the costs being sourced in the README and the fault restart. They flag the PCID wipe, worst case shown as typical, missing MMU caches and huge pages, and the inverted level numbering.

#### Patterns a lint rule or panel feature would fix

- **Term-load lint (§2.5).** The directory chapter introduces 7 new terms against a cap of 3 at core. The acronyms PML4, PDPT, PD and PT should live in "Go deeper", with the plain layer saying "level 1–4".
- **Deeper layer (§2.2), plus a "simplified" flag.** Wherever the sim chose a simplification (no PCID, 8-entry TLB, no MMU caches), the lint could require a `deeper` note naming it. The code already has these as comments, so they could be lifted mechanically.
- **Number provenance on screen (§7 Trust).** Any caption number that comes from a cost constant (`COST.*`) should carry a source chip in the depth layer. Today the sources live only in the README.
- **Analogy map (§2.2 item 3).** Apartment ↔ virtual address, room ↔ frame, directory ↔ page table, sticky note ↔ TLB, boxes ↔ page contents. This fixes problem 11 and lights the row in play.
- **Look pointer (§2.2).** "Bits 47–39" should light the blue bit-group in the world, which would rescue the unreadable labels (problem 12).


## 3. Cross-figure patterns → plan features

Each pattern below appeared in at least 3 of the 8 figures. "New" means the rule is not in PLAN §2.5 today.

| # | Pattern | Seen in | Fix | Plan feature |
|---|---|---|---|---|
| X1 | **Words contradict the run or the picture.** Examples:<br>• raft says "x←3 is on 3 of the 5 servers" while all 5 hold it, and "4 servers vote" while S1 "wins with 3 of 5"<br>• btree's "a page fits 3… cannot grow" over a page drawn holding 4<br>• consistent-hashing's meter reads 20 moved while the story says db01's 4<br>• mapreduce's "lost" slips are still drawn<br>• linked-list's "Items moved 3" lingers into list chapters | raft, btree, consistent-hashing, mapreduce, linked-list, event-loop (queue order) | **Consistency lint (new):**<br>• a predict stem's numbers must equal template values from that step's snapshot<br>• a template variable must declare what it means (`acked`, not `on`)<br>Plus **meter scope**: a counter can reset per chapter, or be marked as running across chapters | §2.4 templates (extend), §2.5 lint (new rule), `look` resolver |
| X2 | **A scheme-specific truth stated as universal.** Examples:<br>• quicksort's sorted and duplicate takeaways<br>• the B+ tree "never fills again"<br>• the TLB "wiped" (no PCID)<br>• "committed = on a majority" (Raft Figure 8)<br>• isolation "can't touch"<br>• the 961-cycle walk shown as typical | quicksort, btree, virtual-memory, raft, mapreduce (skew without the combiner) | **Simplification register (new):** `lesson.simplifications[]`, each item with a `deeper` note. The lint requires that a takeaway naming the concept carries the variant. Source comments that say "as on X without Y" get lifted into it. | §2.2 deeper layer, §2.4 `misconceptions`, new `simplifications` |
| X3 | **No cost model.** Missing in every figure: O(n) versus O(1) for linked lists, ~1.39 n log₂ n for quicksort, log_B N for B+ trees, 1/(N+1) of keys moving for consistent hashing, 2(N−1) messages per entry for Raft, the paper's M/R/split sizes for mapreduce, long tasks over 50 ms for the event loop, TLB reach for virtual memory | all 8 | A **`deeper` layer on key steps**, plus an objective such as "state the cost". Templates make the formulas show this run's numbers next to the general case. | §2.2 deeper, §2.5 "layers present" |
| X4 | **Numbers with no provenance.** Examples:<br>• "11 MB/s", a hard-coded string<br>• "three or four reads for a million"<br>• "over 99% of lookups"<br>• 150–300 ms and 20 µs NVMe, sourced only in the README<br>• "1.1× with 256 seats", computed but given no context | mapreduce, btree, virtual-memory, raft, consistent-hashing | **Numbers lint (new):** a number with a unit in a caption, hook or takeaway must be a template value or carry `{cite:}`. Sources show as a chip in `deeper`. | §2.5 (new), §4.4 "how this was verified" |
| X5 | **Term overload in one chapter.** linked-list chapter 2: 5 terms. event-loop chapter 1: 7. virtual-memory's directory chapter: 7. Plus undefined code names: `new`, `node`, `await`, hex, bits, HTTP 200. | linked-list, event-loop, virtual-memory, consistent-hashing (hex), mapreduce (HTTP) | **Term-load lint** as planned (≤2 at intro, ≤3 at core). New: **identifier lint**, so a backticked name is defined before use and never reuses a glossary word. New: a **prerequisite check** against `lesson.prerequisites`. | §2.5 term load, plus a new identifier rule |
| X6 | **The why is missing.** Examples:<br>• "Start at the end" (linked list)<br>• why hash at all (mapreduce)<br>• why keys move when seats are added (consistent hashing)<br>• why the `nop` (Raft)<br>• why 4 bytes (linked list) | all 8 | **The `why` layer**, shown at New and Basics. The lint requires it on `keep` steps and on steps that carry an ask. | §2.2 why |
| X7 | **Analogies scatter and then drop.** Examples:<br>• btree: phone book, spines, pile, shelves<br>• consistent hashing: teams, table, seats, host<br>• virtual memory: apartments, rooms, sticky notes, directory, "boxes"<br>• the cook in event-loop, used once<br>• quicksort's line of people, used once | btree, consistent-hashing, virtual-memory, event-loop, quicksort | The **analogy map**: one picture per figure, with its rows lit per step. Lint: at most one top-level metaphor, and every step whose term appears in the map lights its row. | §2.2 item 3 |
| X8 | **Long, repetitive chapters.** quicksort's "Repeat on each side" runs 202 s and 161 s (verify warns). raft's partition runs 87 steps, with "ignores an old reply" ×7. mapreduce asks the same predict in all 4 stories. | quicksort, raft, mapreduce, event-loop (the same about ×4) | **Segmenting lint (new):** more than ~12 steps per chapter, or more than 3 consecutive steps of one caption shape, is a warning. Faded "your turn" steps replace the repeats. Also a duplicate-question lint across stories. | §2.3 faded examples, §2.5 (new) |
| X9 | **Words point at something the picture doesn't show.** Examples:<br>• quicksort's "on the left side" with no zone banding<br>• linked-list's "start + 4 × 4" with no slot addresses<br>• consistent-hashing's server card drawn far from its seat<br>• event-loop's queue head unmarked<br>• the bit-row labels in virtual memory, about 6 px | quicksort, linked-list, consistent-hashing, event-loop, virtual-memory, btree (p-numbers) | A **`look` pointer** that must resolve to an entity that exists and is visible at that step. An **audit rule (new)**: an in-world label smaller than 9 CSS px at 1440×900 is a finding. | §2.2 look, §2.5 "every look id resolves", plus the audit |
| X10 | **Recap or takeaway not witnessed in the story.** Examples:<br>• btree story 1 says "grows at the top", but no root split happens in it<br>• consistent-hashing's remove story cites "the remainder way would move 10"<br>• linked-list's recap formula differs from its chapter | btree, consistent-hashing, linked-list | **Recap lint (new):** each recap or takeaway line must name an event or value that occurs in that story, and any formula must match the chapter text. | §2.2 chapter cards, §2.5 (new) |
| X11 | **Predict questions that don't test.** Examples:<br>• "How many keys move?" answered with a definition<br>• "Where does 15 go? How many pages…" is two questions in one<br>• wrong options get no feedback of their own | consistent-hashing, btree, mapreduce, quicksort | **Predict lint (new):** a numeric stem needs numeric options, and a stem holds one question. Plus **per-option feedback** that names the misconception. | §2.3 predict-the-number, misconception feedback |
| X12 | **The citation doesn't match what the sim runs.** quicksort cites Hoare 1962 and runs Lomuto (CLRS). The cites for mapreduce, raft and consistent hashing are right, but no step uses them. | quicksort (wrong); mapreduce, raft, consistent-hashing (unused) | `meta.variant` and a cite-per-claim check | §4.4 trust page |
| X13 | **A knob that no story teaches.** mapreduce's combiner is the textbook fix for skew, and is never mentioned. | mapreduce | **Lint (new):** every param is either used by a story or named in a what-if on the end card | §2.5 objective coverage |

**Highest leverage, in order:**
1. **X1 and X2 (truth).** They produce most of the P0s, and lint can catch X1 mechanically.
2. **X3 (the deeper layer).** It closes most expert gaps, each as a one-liner.
3. **X5 and X6 (term load and the why layer).** They close most first-timer gaps.

## 4. Verify results

All runs use `node scripts/verify.mjs examples/<name>/figure.mjs` with the defaults, on 2026-10-16.

| Figure | Runs | Failing | Errors | Warnings | Teaching info (from verify) | Exit |
|---|---|---|---|---|---|---|
| btree | 17 | 0 | 0 | 0 | core, 6 ch, 9 questions, 5 words, 1729 words, grade 4.7 | 0 |
| consistent-hashing | 20 | 0 | 0 | 0 | core, 6 ch, 4 q, 4 words, 1205 words, grade 4.7 | 0 |
| event-loop | 36 | 0 | 0 | 0 | core, 4 ch, 4 q, 8 words, 1717 words, grade 5.7 | 0 |
| linked-list | 15 | 0 | 0 | 0 | intro, 5 ch, 3 q, 5 words, 1017 words, grade 4.0 | 0 |
| mapreduce | 26 | 0 | 0 | 0 | core, 5 ch, 6 q, 7 words, 2001 words, grade 6.5 | 0 |
| quicksort | 12 | 0 | 0 | **2** | pacing: "Repeat on each side" runs 202 s (random) and 161 s at 1x, over the 150 s limit | 0 |
| raft | 24 | 0 | 0 | **1** | caption: 2 captions over 18 words at `drop=0.1` (longest 23, step 26) | 0 |
| virtual-memory | 12 | 0 | 0 | 0 | core, 6 ch, 3 q, 12 words, 1181 words, grade 5.9 | 0 |

`lesson.mjs` exited 0 for all 8. `shoot.mjs` reported "no page errors, no audit problems" for all 8.

**Verify is green on every figure, and 28 P0s still got through.** Today's teaching lint checks shape: caption length, grade, defined terms, answers in range. It does not check truth or consistency, which are X1, X2, X4 and X10.

## 5. Product scope (§4)

Full sources are in §5.3. Effort is for this engine: one HTML file, a WebGL canvas plus a DOM HUD, deterministic `renderAt`. S is under 1 week, M is 1–3 weeks, L is more than that.

### 5.1 Feature table

| Feature | What leaders do | Effort | Value | Milestone |
|---|---|---|---|---|
| **Described scene (parallel DOM)** | PhET's Interactive Description: a hidden, semantic HTML document that mirrors the sim, with a Scene Summary, a Play Area and a Control Panel as landmark regions, plus state descriptions and alerts tied to actions [PhET/Fluid; NSF PAR 10397994]. Khan Academy rebuilt its graphs (Mafs) for screen readers and keyboard [Khan blog]. | M. Generate a visually hidden `<section>` per step from the snapshot: entities, their state, what changed. | H | **M6** (could start in M1, see §7) |
| **Audio-description track** | PhET Voicing: Web Speech API, the reader chooses which responses to hear [PhET] | S. The live region exists (§6). Add a politeness policy, keep scrubbing silent, include the `why` layer. Optional speech toggle. | H | **M6** |
| **Keyboard path into the world** | PhET: Tab to objects, arrow keys and grab/drag. Khan: keyboard-movable graph points [Khan] | M. Roving tabindex over pickable entities. The focus ring is drawn in the DOM over the projected bounds. The inspector opens on Enter. `s.choose` is keyboard-first. | H | M3 for `s.choose`, **M6** for the rest |
| **Character-key shortcut toggle** (WCAG 2.1.4) | Common practice: a setting to turn single-key shortcuts off or remap them | S | H (an A-level fail today, §6) | **M1** |
| **Contrast and CVD check in `audit`** | Khan adjusted its colours to WCAG ratios [Khan support] | S. Sample the rendered pixels behind HUD text. Add deuteranopia and protanopia simulation shots in `shoot`. | H | **M1** for the token fix, **M6** for the CI rule |
| **WCAG 2.2 new AA rules in `audit`** | 2.4.11 focus not obscured, 2.5.7 dragging alternative, 2.5.8 targets of at least 24 px [W3C] | S | H | **M6** |
| **Reduced-motion audit for new effects** | PhET and Khan honour the OS setting. Duolingo is criticised for unevenness [AppleVis]. | S. The plumbing exists (§6); audit it against Prism 2 effects. | H | **M6**, gated by M5 effects |
| **Sonification** | PhET sonification. Desmos audio trace (pitch follows the value) [Desmos; Perkins] | M (WebAudio, no assets) | M | Later, after Q6 (sound) |
| **Braille / Nemeth** | Desmos supports Nemeth and UEB [Desmos] | L | L (code and CS text are plain text) | Not planned |
| **HUD string table + RTL** | PhET: per-sim string files in 120+ languages, translated with the Rosetta tool [PhET translation utility] | S for the table. S–M for RTL: `dir=rtl` on the HUD root, CSS logical properties, a mirrored panel, the timeline kept left-to-right. | H | **M6** |
| **Lesson translations** | PhET string files plus community review [PhET] | S per language, plus a native reviewer | H | **M6** (2 languages) |
| **World text: CJK** | Production WebGL text uses HarfBuzz shaping, then MSDF [pmndrs/text] | S–M. Subset the atlas at build time to the glyphs the lesson uses (a few hundred). A full CJK set (~3.5K+) does not fit a 2048² atlas at useful sizes. | M | M6 only if zh or ja is first |
| **World text: Devanagari or Arabic** | These need OpenType shaping (conjuncts, reordering, joining), so a codepoint lookup in MSDF is wrong [HarfBuzz] | L with HarfBuzz WASM (hundreds of KB, which hurts the 2.5 MB budget). M with a Canvas2D-shaped texture per label. | M | **M6 policy:** numbers and identifiers only in the world, words in the DOM. Shaped world text later. |
| **Embed + postMessage API** | H5P: a resize protocol plus xAPI forwarding [H5P]. PhET-iO: the wrapper drives the iframe and reads a data stream [PhET-iO devguide]. Canvas listens for `lti.frameResize` [Canvas]. | S–M:<br>• `?embed` layout<br>• in: play, pause, seek, setScenario, setLevel<br>• out: ready, step, chapter, answer, complete, resize<br>• origin checks, versioned<br>• `#step-N` links | H | **M6** |
| **xAPI-shaped events** | H5P emits `answered` and `completed` [h5p.org] | S (a shape only; the host posts to its LRS) | M | **M6** |
| **LTI 1.3 / Advantage** | Needs a tool server: OIDC login, a JWT check against the platform's JWKS, and OAuth2 for AGS grade passback, server to server [Blackboard, D2L, lti_1p3 docs] | L, and it breaks the "no server" rule. A static file cannot be an LTI tool. | M | Later, as an optional hosted service, not in the figure |
| **SCORM / cmi5 package** | SCORM is a JS API same-origin with the LMS. cmi5 needs an LRS [xapi.com comparison] | M. A zip with `imsmanifest.xml` and an adapter that maps `complete {score}`. Fully static. | M–H (the realistic static path to gradebooks) | Later (proposed M7) |
| **Presenter mode** | Desmos Classroom: teacher pacing, pause class, snapshots [Amplify; NCTM]. PhET: projector settings [PhET tips] | M. Projector theme, big type, clicker keys. A second window over `BroadcastChannel` works same-origin only, not from `file://`. | M–H | **M6** single window. Second window later. |
| **Handouts / teacher guide** | PhET publishes a teacher guide per sim: controls, model simplifications, misconceptions, suggested use [PhET guide PDF] | S–M. Generate from `lesson.mjs` (goal, picture map, plain lines, misconceptions, simplifications, quiz key), with `shoot` stills and `@media print`. | M–H | **M6** |
| **Teacher dashboard / class sync** | Desmos Classroom dashboard | L, needs a server | L | Not planned |

### 5.2 Product recommendations

1. **Accessibility:** follow PhET's parallel-DOM model. The run already has the state, so a per-step hidden scene description is the highest-value accessibility item for its effort.
2. **Embedding:** embed means postMessage, not LTI. Shape events as xAPI verbs now; a SCORM zip comes later as the static route into gradebooks.
3. **World-text policy:** world labels hold numbers and identifiers, and the words live in the DOM. That makes RTL and complex scripts free in M6, leaves CJK to subset atlases, and defers HarfBuzz.
4. **Handouts** reuse the new `misconceptions` and `simplifications` lesson fields. These are exactly the sections teachers use in PhET's guides.

### 5.3 Sources

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- PhET Interactive Description:
  - https://fluidproject.atlassian.net/wiki/spaces/fluid/pages/11516643/PhET+John+Travoltage+Simulation+Design
  - https://par.nsf.gov/servlets/purl/10397994
  - https://scholar.colorado.edu/downloads/wm117p56k
- PhET translation: https://phet.colorado.edu/bs/for-translators/translation-utility
- PhET-iO: https://phet-io.colorado.edu/devguide/api_overview.html
- PhET teacher guide: https://phet.colorado.edu/files/teachers-guide/mass-spring-lab-guide.pdf
- Desmos:
  - accessibility: https://help.desmos.com/hc/en-us/articles/4404860698253
  - sonification: https://www.perkins.org/resource/understanding-desmos-sonification-lessons/
  - Classroom: https://my.amplify.com/help/en/articles/6763511-classroom-conversations
- Khan Academy:
  - https://blog.khanacademy.org/rebuilding-graphs-for-accessibility-inside-khan-academys-inclusive-design/
  - https://support.khanacademy.org/hc/en-us/articles/46935855939469
- Duolingo (anecdotal): https://applevis.com/comment/150456
- Brilliant: no public accessibility documentation found.
- H5P:
  - https://help.h5p.com/hc/en-us/articles/20905749916445-Automatic-resizing-of-H5Ps
  - https://h5p.org/node/64552
- Canvas postMessage: https://oc.sjtu.edu.cn/doc/api/file.lti_window_post_message.html
- LTI 1.3:
  - https://docs.blackboard.com/lti/tutorials/implementation-guide
  - https://community.d2l.com/brightspace/kb/articles/23730-about-lti-1-3-launch-and-authentication
  - https://hexdocs.pm/lti_1p3/lti_1p3_overview.html
- SCORM, xAPI and cmi5: https://xapi.com/cmi5/comparison-of-scorm-xapi-and-cmi5/
- Text shaping:
  - https://en.wikipedia.org/wiki/HarfBuzz
  - https://github.com/pmndrs/text

## 6. Current HUD accessibility findings

The page tested was the built linked-list page (`examples/linked-list/figure.mjs`), headless Chrome, at 1440×900, at 390×844, and with reduced motion emulated. Shots are in `audit-shots/hud-a11y/`.

| # | Check | Result | Evidence | WCAG |
|---|---|---|---|---|
| A1 | **Keyboard reach of HUD controls** | **Pass.** After the start card, Tab cycles 16 stops on desktop and 15 on phone: the title or cite link, the story radio (roving, one stop), Code, Settings, Theme, Help, Full screen, Speed, Back, Play, Next, the Timeline slider, Numbers, Legend and Hide explanation. The start card is `aria-modal`, traps focus between its 2 buttons, and Esc dismisses it. | probe Tab log; `hud.mjs:2331` | 2.1.1, 2.4.3 |
| A2 | **Focus visible** | **Pass, but thin.** `:focus-visible` gives a 1.5px outline at 60% ink with a 2px offset (`hud.css:14,46`), visible in `a11y-focus-tab4.png`. A 1.5px ring at 60% alpha may fall below 3:1 against the glass in the light theme (not measured). | `a11y-focus-tab4.png` | 2.4.7, 1.4.11 |
| A3 | **The world can't be reached by keyboard** | **Fail.** The canvas is `role="img"` with a static `aria-label` and no `tabindex`. The inspector opens only from a hovered entity: `I` pins `hoverCard` only if `lastHover` exists (`hud.mjs` keydown handler). Entity chips in the explain panel sit inside the step `<button>`, with no tabindex of their own (probe: `tab=null`, `parentBtn=true`), so hover-to-light ("look at") is mouse only. | probe; `hud.mjs` (I key); `explain.mjs:174-178` | 2.1.1, 1.1.1 |
| A4 | **Live captions** | **Pass, with gaps.** `.ix-sr` is `aria-live=polite`, `aria-atomic`, and announces each step's caption. The run went from "5 numbers side by side…" to "Start at the end: 23 slides…" to "17 slides one slot to the right". It waits 700 ms while playing and 250 ms when paused (`hud.mjs:1462-1465`). Gaps: captions only, never what changed in the world. The canvas label never changes. At fast playback, a caption can be replaced before it is spoken. | probe (`a11y4`) | 4.1.3, 1.1.1 |
| A5 | **Single-key shortcuts** | **Fail (level A).** S, T, F, C, I, R, E, `[` `]` and 1–9 fire with no modifier whenever focus is on the body or anywhere in the HUD, and no setting turns them off. Speech-input users trigger them by accident. | `hud.mjs` keydown handler (~2320–2368) | **2.1.4** |
| A6 | **Text contrast** | **Fail, faint ink:**<br>• Dark theme: `inkFaint` #5E6780 on the panel (#0D111C) is **3.35:1**. It is used for 11–12.5 px text: "Stories", "/ 17", "1 of 5".<br>• Light theme: `inkFaint` #A3A6AC on white is **2.44:1**.<br>• `--ix-ink-faint` appears in 41 rules in `hud.css`.<br><br>**Pass, muted ink:** 7.45:1 dark, 5.35:1 light.<br><br>The probe composites glass over the body colour, not the live canvas, so treat these as approximate. | `engine/tokens.mjs:33,85`; probe contrast pass | 1.4.3 |
| A7 | **In-world text** | **Fail, likely.** Slot indices, the node sublabels "value/next", the virtual-memory bit-row labels and the quicksort slot numbers render at about 6 px with low contrast at 1440×900. Several of them carry the meaning a question depends on. Text drawn in the canvas counts as an image of text. | per-figure shots (§2: linked-list P2, quicksort P2, virtual-memory #12) | 1.4.3 |
| A8 | **Structure** | **Partial.** `<html lang="en">` is set (`build.mjs:140`). There is no `<main>` landmark. The figure title is a `<div>`, not a heading (headings: "DIV: Linked list", then H2s). | probe landmarks | 1.3.1 |
| A9 | **Accessible names** | **Mostly pass.** No unnamed controls were found. One defect: the meter button's name runs together, "Numbers: items movedmoved0arro…", because labels and values are concatenated with no separators. | probe | 4.1.2 |
| A10 | **Target size** | **Pass.** No visible control is under 24×24. The smallest are Hide (28×28) and "Got it" (52×26). The phone transport is 32–36 px. | probe | 2.5.8 |
| A11 | **Scrubber** | **Pass.** `role=slider` with `aria-valuetext` "Step 1 of 17, Arrays shift", operable with arrows. Back and Next give the non-drag alternative. `aria-valuenow` is in seconds (0–96.62), which is odd but harmless given the valuetext. | probe | 2.5.7, 4.1.2 |
| A12 | **Reduced motion** | **Pass.** `matchMedia` toggles `.ix-reduced` (probe: mq true, class true). The CSS zeroes transitions (`hud.css:1083`). The director fits instantly (`runtime.mjs:85,95`). Segments crossfade (`transitions.mjs` rmFade 0.15 s). Ping run-outs are suppressed (`pack.mjs:76`). Not checked: the background aurora drift, and the auto-camera between chapters. | probe; source | 2.3.3, 2.2.2 |
| A13 | **Pause, stop, hide** | **Pass.** Nothing autoplays: the start card waits for a choice, and Play/Pause is reachable. | probe | 2.2.2 |

**Fixable in an afternoon:** A5 (a toggle in Settings, or require focus on the stage), A6 (raise `inkFaint` to ≥4.5:1 for text, or keep it for non-text only), A8, and A9.

**Need design:** A3 (keyboard into the world) and A4 (a described scene).

## 7. Changes I'd make to PLAN.md

**§1 (the audit)**
- §1.1: change "8 examples… pass verify" to "pass verify (quicksort 2 pacing warnings, raft 1 caption warning)".
- §1.2: add the measured baseline. Persona means are **3.45** (first-timer) and **2.91** (expert); 0 of 8 figures clear ≥4 per chapter; **28 P0s pass a green verify**. The weakness is not only that the panel narrates: **the words are sometimes false or contradict the run** (X1, X2). Add one bullet giving the Raft commit question as the example.
- §1.2: generalise the linked-list critique. Term overload, a missing why and no cost model recur in all 8 figures (X3, X5, X6), so they are not linked-list quirks.

**§2.5 (lint).** Not asked, but it follows from the findings. Add these rules:
- consistency: predict numbers equal the snapshot, and template variables state their meaning
- numbers provenance
- simplifications register
- identifier lint
- recap witnessed
- segmenting and chorus cap
- predict shape: numeric stem, one question
- citation matches variant
- every knob taught or what-if'd
- meter scope per chapter

Also add a `simplifications: []` field to the §2.4 lesson schema, beside `misconceptions`.

**§4 (product)**
- 4.1: name the PhET parallel-DOM model explicitly: a described scene regenerated per step, plus the live caption track. Add 2.1.4 (shortcut toggle), the `inkFaint` contrast fix, `<main>` and a heading, a keyboard path to the inspector, and focusable "look" chips. Add the 2.2 checks (2.4.11, 2.5.7, 2.5.8) and pixel-sampled contrast to `scripts/audit.mjs`.
- 4.2: add the **world-text policy**: numbers and identifiers in the world, words in the DOM. MSDF i18n then becomes subset atlases for CJK only. Defer HarfBuzz and shaped world text past M6.
- 4.3:
  - Embed is postMessage with xAPI-shaped events. State plainly that **LTI 1.3 needs a server**, so it is out of scope for the file.
  - Add a SCORM zip export as a later item.
  - Presenter mode in M6 is single-window (projector theme, big type, clicker). The second window can't use `BroadcastChannel` from `file://`, so it moves later.
  - Handouts become a generated **teacher guide** (PhET-style: misconceptions, simplifications, quiz key).

**§6 (milestones)**
- **Add M0.5, a "truth pass", before M1.** Fix the 28 P0s in the current figures' words, sim and visuals. Most are caption edits. They are wrong today whatever panel ships, and fixing them gives the personas a clean baseline to measure M1 against. Effort is S–M. It touches only `examples/*`.
- **M1:**
  - add the four cheap accessibility fixes (A5, A6, A8, A9), since the panel is being rebuilt anyway
  - make "look" chips focusable (A3, in part)
  - add the consistency and numbers lint rules (X1, X4) to the M1 lint gate; they caught the largest class of defect
- **M6:**
  - add "described scene (parallel DOM)" and "keyboard path into the world" to its contents
  - make the bar measurable: "WCAG 2.2 AA audit clean" becomes "audit.mjs 2.2 checks clean, plus a manual VoiceOver and NVDA pass on 2 figures"
- **Add M7 (later):** SCORM export, two-window presenter, shaped world text (HarfBuzz), and the optional hosted LTI service.
