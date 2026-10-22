> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/19-content-foundations), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/GOALS.md)), the sources tables and the lesson diffs. The code diff is under **Files changed**.

## TL;DR

- **Every real-world claim in four lessons now names its source.** Event loop, Quicksort, Virtual memory and Linked
  list each get a `lesson.sources` list (13, 13, 13 and 17 entries), and every claim cites one as `[id]`.
  - **What I read:** specs fetched and searched, source code read at the cited line, DOIs resolved on Crossref,
    papers read where they could be opened.
  - **Convention:** the `[id]` form is shared with this round's lint-and-render branch.
  - **Merge this branch with or after that one.** On this branch alone, each Source field shows its ids as plain
    text (`[whatwg-loop] §8.1.7.3 Processing model`). Before, a field with one source was a link; a field with
    several ran together as one long link (see the Quicksort shots).
- **Each lesson now uses its field's famous examples:**
  - Event loop: Jake Archibald's 2015 ordering test, which the first story extends, and the boxes from Philip
    Roberts' JSConf EU 2014 talk.
  - Quicksort: CLRS's Figure 7.1 array, and Bentley and McIlroy's 1991 `qsort` that ran for hours.
  - Virtual memory: Drepper's Pentium M latency table, which the model's numbers come from.
  - Linked list: Stroustrup's vector-versus-list measurement.
- **23 factual fixes**, each with the old text, the source and the new text ([list](factual-fixes.md)). For
  example:
  - Hoare's original is 1961, not 1962.
  - Introsort is GCC's `std::sort`, not C++'s.
  - Bentley and McIlroy did not invent median-of-3; they report the failure and adopt Tukey's ninther.
  - Linux's `__list_add` writes four fields, not three.
  - An unsourced "over 99% of pages hit a note" is replaced by the arithmetic the run shows.
  - A click during a microtask chain waits in its queue; the page does not ignore it.
- **A teacher note for every chapter**: 37 notes covering all 31 chapters and story variants. Each is a question for the room and what to listen for.
- **The filler is gone:** just, very, really, often, in practice, usually.
- **One finding goes the other way.** Round 4 flagged "a repaint is a task" as contrary to the HTML standard. It
  is not: since whatwg/html #10007 (31 January 2024) the standard queues rendering as a task. The lesson now says so,
  with the date.
- Branch **`content/examples-foundations`**, 6 commits on `polish/round-4`. Text only: no simulation or picture
  changes. verify 0 failing and 0 warnings on all 8 examples; unit tests 342 / 342.

## Before and after

| | `polish/round-4` | this branch |
|---|---|---|
| Sources listed per lesson (Event loop / Quicksort / Virtual memory / Linked list) | 0 (URLs inline in some `source` fields) | 13 / 13 / 13 / 17, each cited |
| Claims with a named source, checked at the source | some, unchecked | all; read at the source except the books and bot-blocked sites listed under Checks |
| Factual errors found and fixed | — | 23 ([list](factual-fixes.md)) |
| Chapters and story variants with a teacher note | 0 of 31 | 31 of 31 (37 notes) |
| Banned words and softeners in reader-facing text (code comments excluded) | 48 | 0 |
| verify, all 8 examples | 211 runs, 0 failing | 211 runs, 0 failing, 0 warnings in these four |
| Unit tests | 342 / 342 | 342 / 342 |
| Printed lesson lines changed (`lesson.mjs --all --full`) | — | Event loop 135, Quicksort 161, Virtual memory 150, Linked list 150 ([diffs](lesson-diffs/)) |

---

## 1. Event loop

**Sources** ([table](sources/event-loop.md)): the HTML standard's event loop and timers, ECMAScript's promise jobs
and Await, the Fetch standard, whatwg/html #10007, Archibald 2015, Roberts 2014, the V8 async post (2018), Node's
event loop and `process` docs, MDN's `scheduler.yield()`, Chrome 88's timer throttling.

**The famous example.** The "order" story is Archibald's 2015 test (`script start`, a 0 ms `setTimeout`, two
chained `.then`s, `script end`), with `queueMicrotask` and `fetch` added. Its last step now says so: his answer
holds, the script first, then the promise callbacks, then the timer. The world's boxes (call stack, Web APIs, queue)
follow Roberts' talk, which the step that introduces the Web APIs now cites.

**What was wrong:**
- Three vague claims became cited ones:
  - "Real browsers often let a repaint go ahead" became what the standard allows: the task queue is "chosen in an
    implementation-defined manner".
  - "Background tabs, often to once a second" became Chrome's two numbers: once a second, and once a minute for a
    chain of timers after 5 minutes hidden.
  - "Resumes ahead of other ordinary tasks" became MDN's "a prioritized task", plus the fact that `scheduler.yield()`
    is not yet in every browser.
- "The page ignored every click" became "every click waited in its queue": input is a task, delayed, not dropped.
- The Node line had blamed the `setImmediate`/`setTimeout` order on `process.nextTick`. It now states the two
  separate differences, Node's phases and the next-tick queue, each with its own source.
- The yield story's cost was "the timers' minimum delay". The 4 ms applies only past five nested timers.

**Kept:** "a repaint is a task". It is true of the standard since January 2024, and the render step's deeper layer
now adds that until then rendering was a step of the loop between tasks. Neither version ever ran it between two
microtasks, so the lesson's point holds either way.

| Before (starve, the repaint, Expert) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/before/event-loop-render-1440x900.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/after/event-loop-render-1440x900.png?raw=true) |

## 2. Quicksort

**Sources** ([table](sources/quicksort.md)): CLRS 4e, Hoare 1961 and 1962, Sedgewick and Wayne, Sedgewick 1978,
Bentley and McIlroy 1993, McIlroy 1999, Musser 1997, GCC's `stl_algo.h`, Go 1.19, Peters' pdqsort paper, the Java
and Rust sort docs.

**The famous examples.**
- **CLRS's Figure 7.1 array** (2 8 7 1 3 5 6 4) is the split chapter's board exercise in the teacher note.
- **The slowest case is now Bentley and McIlroy's story, as they tell it.** In 1991 a colleague's `qsort` run that
  should have taken minutes took hours, on an "organ-pipe" array, 1 2 … n n … 2 1. They then found that all of a
  dozen Unix `qsort`s could be driven to quadratic time, and their replacement picks the middle number, the median
  of 3 or Tukey's ninther by size. (Read in the paper itself, §1 and §3.)

**What was wrong:**
- Hoare's original partition is CACM Algorithm 63, 1961; the 1962 paper came after.
- "C++ `std::sort` is introsort" became "GCC's", read from `stl_algo.h` (`__lg(n) * 2`). The standard names no
  algorithm.
- The recap said "smaller ones go left". The run's test is `a[j] <= pivot`, so copies of the pivot go left too.

| Before (sorted input, step 13, Expert) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/before/quicksort-introsort-1440x900.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/after/quicksort-introsort-1440x900.png?raw=true) |

On a phone the same layer, in the explain sheet:

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/before/quicksort-introsort-390x844.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/after/quicksort-introsort-390x844.png?raw=true) |

## 3. Virtual memory

**Sources** ([table](sources/virtual-memory.md)): Intel's SDM (volumes 1 and 3A), Drepper 2007, OSTEP chapters
18–21, Linux's `tlbflush.h` and `pgtable_64.h`, Hansen's PCID patch, Bhargava et al. 2008, the kernel's huge page
docs, Gregg's Table 2.2.

**The famous example, named.** The model's 240 cycles for main memory and 14 for the L2 cache are the Pentium M
numbers Drepper quotes in §3.3 ("the numbers Intel lists for a Pentium M"). The lesson now says that where the
numbers first appear, beside a 2020 server's 100 ns (Gregg), so a reader knows what machine they describe.

**What was wrong (all unsourced specifics, now true or gone):**
- "Over 99% of pages hit a note" was not in the cited source. It became the arithmetic the run shows: one note
  answers a whole page, so 4,096 one-byte reads in a row miss once.
- Exact TLB sizes and associativity ("about 64… 4 of them… over 1,000") with no source became what Drepper supports:
  a first level of a few dozen, then a bigger second level.
- "A minor fault costs about 1 µs" became what it consists of.
- "Most real CPUs tag their notes" became "real CPUs can": PCIDs and ASIDs are features an OS may use.
- "Shared memory, often marked read-only": it is the library code that is read-only.

Checked and kept: Linux's 6 dynamic PCIDs (`TLB_NR_DYN_ASIDS 6`) and its inverted swap offset (`~offset` in
`__swp_entry`), both read in the source; the nested walk's 24 references (Bhargava et al., on Crossref).

| Before (a recent address, the hit, Expert) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/before/virtual-memory-hit-1440x900.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/after/virtual-memory-hit-1440x900.png?raw=true) |

## 4. Linked list

**Sources** ([table](sources/linked-list.md)): CLRS §10.2, Knuth volumes 1 and 2, Stroustrup 2012, CPython's
`listobject.c` and `functools.py`, the `deque` and assignment docs, Linux's `list.h`, `rculist.h` and
`mmap_min_addr` docs, glibc's `malloc.c`, Harris 2001, Pugh 1990, Valgrind's manual, Drepper, Gregg.

**The famous example.** "Measured, arrays often win anyway" is now the measurement itself. Stroustrup timed
inserting random numbers into a sorted sequence and removing them at random positions, and a C++ vector beat a linked
list past 500,000 numbers. He found N "much larger than 500,000" (read in the article, Figure 1). The trade-off
chapter's teacher note uses it too.

**What was wrong:**
- Linux's `__list_add` writes four fields. `next->prev` goes first and `prev->next` last; the lesson named only
  three.
- CPython's growth formula rounds down to a multiple of 4 (`& ~3`).
- "Null is in practice address 0, in a page the OS never maps; usually a segfault" is now said for Linux, the system
  the cited `mmap_min_addr` docs cover.

Checked and kept: glibc's 32-byte minimum chunk ("8-byte ptrs: 24/32 bytes"), RCU's publish order, the `deque`
docs' "O(1) at both ends but slows to O(n) in the middle", Valgrind's "definitely" and "indirectly lost".

| Before (the trade-off, Expert) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/before/linked-list-tradeoff-1440x900.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/19-content-foundations/shots/after/linked-list-tradeoff-1440x900.png?raw=true) |

## Teacher notes

Each chapter of the four lessons gets `teach: { prompt, listen, minutes }`, with story variants where a chapter
means something different in that story: 37 notes over 31 chapter objects. Each prompt is asked before the step that answers it. Each
`listen` names the wrong answer to expect, and what in the run settles it. The presenter view and the handout show
them.

## Checks

- `verify.mjs` on all 8 examples: 211 runs, 0 failing; the four changed examples have 0 warnings
  ([log](verify-after.txt)).
- Unit tests: 342 / 342 ([log](tests-after.txt)).
- Sources: a script over the four lessons checked three things. Every cited `[id]` is listed; every listed source
  is cited; every entry has id, title, by, year, url and supports.
- **Read at the source:**
  - the HTML and Fetch standards, ECMAScript 2025's section numbers, whatwg/html #10007;
  - Archibald's article, the Node, MDN, Python and Valgrind docs, Chrome's post;
  - Drepper, Bentley and McIlroy, and Stroustrup, from PDFs;
  - GCC's `stl_algo.h`, glibc's `malloc.c`, and Linux's `list.h`, `rculist.h`, `tlbflush.h` and `pgtable_64.h`;
  - CPython's `listobject.c`;
  - Go's release notes and the Java and Rust docs;
  - every DOI, on Crossref.
- **Not read here, checked by metadata only:**
  - **CLRS** (book; MIT Press refuses scripted requests). This includes the Figure 7.1 array and §7.4.2. The
    array's partition result, 2 1 3 4 7 5 6 8, was worked by hand from the run's own rule.
  - **Knuth** volumes 1 and 2 (books).
  - **Gregg's** Table 2.2 (book).
  - **Intel's SDM**, which refuses scripted requests.
  - **OSTEP**, whose PDFs my extractor could not read; no claim rests on OSTEP alone.
  - **Roberts' talk**: its title and speaker were confirmed through YouTube's oEmbed.
  - **ACM DL pages**: their DOIs were confirmed on Crossref.
- **Screenshots:** one changed panel per example, before and after, at Expert, 1440×900, plus Quicksort's on a
  390×844 phone. The start card was dismissed and the panel scrolled to the step's deeper layer. Every one was read.
- **Not run:** `check --full` and a blind-reader review of the new words. The words were read top to bottom with
  `lesson.mjs`, once as a beginner and once as an expert.

## Next

1. **Render and lint `[id]`** (this round's lint-and-render branch): turn each id into a citation link in the panel,
   the handout and the packet, and make verify fail on an unknown id or an unlisted claim.
2. **A blind-reader round on the four lessons** (`review-packet.mjs`), now that the deeper layers changed.
3. **Read CLRS, Knuth and the SDM at the cited pages** and record the page numbers in `supports`.
4. **Use CLRS's Figure 7.1 array as a Quicksort story** (`input` already takes typed numbers). The board exercise
   would then run on screen. That's a story change, so it needs a decision.
