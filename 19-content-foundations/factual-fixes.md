# Factual fixes

Each row: what the words said, what the source says, what they say now. Sources are the `[id]`s in each example's
`lesson.sources` ([tables](sources/)).

## Event loop (`127c1f5`, `1905e36`)

| Where | Before | Source | After |
|---|---|---|---|
| Tasks at last, about | "real browsers often let a repaint go ahead" | `[whatwg-loop]` §8.1.7.3: "Let taskQueue be one such task queue, chosen in an implementation-defined manner" | "This model takes the oldest task first; a real browser may serve the repaint's queue sooner." |
| `arrive.render`, deeper | Correct (a repaint is a task), but with no date | `[whatwg-render-task]`: whatwg/html #10007, merged 31 January 2024, "perform rendering as a task" | Adds the edge: until January 2024 the standard updated the rendering as a step between tasks. Round 4 had flagged the repaint-as-task wording as wrong; the current standard agrees with the figure. |
| `chunk.clamped`, real | "Browsers throttle timers much harder in a background tab, often to once a second." | `[chrome88-timers]`: hidden tabs check timers once per second; chained timers once per minute after 5 minutes hidden | The two numbers, named for Chrome. |
| `end.starve`, edge | "the page also ignored every click and key" | `[whatwg-loop]`: input events are queued as tasks | "every click and key press waited in its queue: the page looked frozen" |
| `end.order`, real | Node's `setImmediate` vs `setTimeout(0)` difference blamed on `process.nextTick` | `[node-loop]`: the order of those two in the main module comes from the phases; `[node-process]`: the next-tick queue drains before the promise microtasks | Both differences stated separately, each cited. |
| `end.yield`, real | "the rest of the work resumes ahead of other ordinary tasks" | `[mdn-yield]`: "the continuation scheduled as a prioritized task"; not Baseline | "returns as a prioritized task. It is not yet in every major browser." |
| "Taking turns" story, takeaway | "at the cost of the timers' minimum delay" | `[whatwg-timers]`: 4 ms only "if nestingLevel is greater than 5" | "past five nested timers, each chunk waits at least 4 ms" |

## Quicksort (`741651d`, `1905e36`)

| Where | Before | Source | After |
|---|---|---|---|
| `split.pointers`, real; figure comment | "Hoare's original (1962)" | `[hoare1961]`: CACM 4(7):321, Algorithms 63 and 64, July 1961 (Crossref) | "Hoare's original (1961)"; the 1962 Computer Journal paper is cited as the full paper |
| `place.stay@sorted`, real | "C++ `std::sort` is introsort" | `[libstdcxx]`: GCC's `std::sort` calls `__introsort_loop` with `__lg(n) * 2`; the C++ standard names no algorithm | "GCC's `std::sort` is introsort" |
| `place.stay@sorted`, real | Go's pdqsort "also spots runs already in order" | `[peters2021]`: pdqsort sorts sorted input in linear time | "sorts input already in order in one pass" |
| `sorted.done`, real | Bentley and McIlroy "built the median-of-3 (and median-of-9) pivot that many libraries copied" | `[bentley-mcilroy1993]` §1, §3: median of 3 predates them; they report a 1991 `qsort` taking n² on an organ-pipe array, a dozen Unix `qsort`s all driven quadratic, and adopt Tukey's ninther for big arrays | The 1991 failure, the dozen `qsort`s, and their median-of-3 / ninther rule |
| Recap | "smaller ones go left" | The run: `a[j] <= pivot`, so copies go left too | "numbers no bigger go left" |
| Recap | "until every group has one number" | The run: `if lo >= hi: return` | "one number or none" |

## Virtual memory (`71b6e2f`, `1905e36`)

| Where | Before | Source | After |
|---|---|---|---|
| `notes.miss`, real | "about 64 for data in the first, which most CPUs split into sets (a page may sit in only 4 of them), then over 1,000 in a second level" | No source in the lesson; `[drepper2007]` §3.3.1 supports "a few dozen entries at most" for a fully associative TLB | "a first level of a few dozen, checked in parallel like these, then a bigger second level that costs a few cycles more" |
| `notes.hit`, real | "Real programs find over 99% of their pages on a note" | Not found in `[ostep19]` | The arithmetic the run shows: one note answers a page, so 4,096 one-byte reads in a row miss once and hit 4,095 times |
| `notes.hit`, cost | "about 240 cycles each" | `[drepper2007]` §3.3: "the numbers Intel lists for a Pentium M: … L2 ~14, Main Memory ~240" | Says these are the Pentium M numbers the model uses, beside `[gregg2020]`'s 100 ns for a 2020 server |
| `fault.disk`, edge | A minor fault "costs only about 1 µs" | No source | "costs only the stop and the kernel's work: no copy, no wait" |
| Another program, about | "most real CPUs instead tag each note" | `[intel-sdm3a]` PCIDs, `[ostep19]` ASIDs: a feature CPUs may have and an OS may use | "Real CPUs can tag each note with a small number for a recent program instead." |
| `other.apart`, edge | "share library code and shared memory, often marked read-only" | Shared memory is often writable; library code is the read-only part | "share library code (marked read-only) and shared memory" |

## Linked list (`0f5ede5`, `1905e36`)

| Where | Before | Source | After |
|---|---|---|---|
| The second write, real | "Linux's list_add fills in new->next and new->prev, then writes prev->next last." | `[linux-list]` `__list_add`: `next->prev = new; new->next = next; new->prev = prev; WRITE_ONCE(prev->next, new);` | All four writes, in that order |
| The array insert, real | "newsize + newsize/8 + 6" | `[cpython-list]` `list_resize`: `(newsize + (newsize >> 3) + 6) & ~3` | Adds "rounded down to a multiple of 4" |
| Trade-off, edge | "Measured, arrays often win anyway" | `[stroustrup2012]`: inserting random numbers into a sorted sequence and removing them, a vector beat a list for N "much larger than 500,000" | Stroustrup's experiment and its number |
| `nodes.null`, how and edge | "In C, null is in practice address 0, in a page the operating system never maps"; "usually a segfault" | `[linux-mmap-min]`: user processes may not map the lowest pages | Said for Linux, the system the source covers |
