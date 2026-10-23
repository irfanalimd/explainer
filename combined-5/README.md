> **Draft, for review only. Don't merge yet.** Each change is explained in its own PR: #21 sources, #22 writing, #23 the MapReduce, Raft, consistent hashing and B+ tree rewrites, #24 the event loop, quicksort, virtual memory and linked list rewrites. Logs and screenshots are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/combined-5).

This round is about the quality of what the pages say. Every figure Explainer makes, and the 8 examples, should
teach from the field's canonical sources and their famous examples, with every fact checkable and the words plain.
It changes no simulation and nothing in how the world is drawn.

**Merge order:** #20 (the original tile look), then #19 (round 4), then this one instead of #21–#24. This branch
already contains #19 and #20, so its diff against `polish/round-4` is the content round alone.

## Before and after

| | `polish/round-4` | this branch |
|---|---|---|
| Real-world claims that name a checkable source, 8 examples | none had a source list | every one: `[id]` with a locator, shown as "Dean & Ghemawat 2004, §3.5", linked |
| Factual errors found against the sources and fixed | — | 34 (11 in #23, 23 in #24), each with the old line, the source's words and the new line |
| Writing lint hits (banned words and phrases, hedges, vague amounts, questions in explanations, repeats) | 22 | 1 (the scenario name "One word is very common", left for the owner) |
| Teacher notes in the four foundations examples | 0 | 37 |
| `verify.mjs`, all 8 examples | 211 runs, 0 failing | 211 runs, 0 failing; 0 warnings in 6 examples |
| Unit tests | 339 | 364, all passing |
| HUD browser suite | 278 | 278 |
| `audit --a11y --at phases`, both themes, MapReduce and Raft (citation links included) | 0 problems | 0 problems |

## What's in it

1. **Sources (#21).** `lesson.sources` and `[id]` citations, rendered in the explain panel, the handout and the
   presenter view; verify errors on an unknown id and warns on an uncited claim; the authoring pipeline (SKILL.md's
   research step, the curriculum, teacher and expert-reader agents, the templates) gathers the canonical example and
   its primary sources before a lesson is written.
2. **Writing (#22).** `references/writing.md` with 11 rules and 15 before/after pairs from the examples, and a lint over
   every string a figure shows; the blind readers report a `sloppy` list.
3. **Systems rewrites (#23)** and **foundations rewrites (#24)**, against Dean & Ghemawat, Ongaro & Ousterhout, Karger
   et al. and Dynamo, Bayer & McCreight and Comer; the HTML standard and Archibald, Hoare and Bentley & McIlroy, the
   Intel SDM, Drepper and OSTEP, CLRS, Knuth and Stroustrup.

**Lead changes on this branch:**
- A real-world layer counts as cited when the Source line beside it cites (`540b1bf`). The rewrites cite that way,
  and 29 cited layers were reported as uncited without it.
- The four foundations and four systems titles cite their source by id, and the last writing hits are fixed.
- Merges: #21's merge conflicted with #22 in `scripts/verify.mjs` (both lints' imports kept),
  `agents/expert-reader.md` (the reader returns both `sloppy` and `citations_checked`) and `agents/teacher.md` (the
  gate asks for no sources and no writing warnings).

One finding corrects round 4: whatwg/html #10007 (merged 31 January 2024) made rendering a task, so Event loop's model
of a repaint as a queued task matches the standard. #18's Next list withdraws the item.

## Checks

- `verify.mjs`: all 8 examples, 0 failing. Raft keeps its 3 advisories at 7 servers (two chapters over 150 s, long
  captions); MapReduce keeps the "very" in its scenario name.
- Unit tests 364 / 364. HUD browser suite 278 / 278 ([log](hud.log)).
- `audit --a11y`: [MapReduce](a11y-mr.log) and [Raft](a11y-raft.log), 0 problems.
- The world is drawn exactly as in #20: the same MapReduce moment at 2× ([after](mapreduce-after.png)).
- **Not verified:** a blind-reader round on the rewritten lessons; the books (CLRS, Knuth, Gregg) were checked by
  metadata only; the Intel SDM and the ACM DL refuse scripts (their DOIs were confirmed on Crossref).

## Next

1. Make the writing and sources warnings errors, now that every example passes.
2. A blind-reader round on all 8 rewritten lessons.
3. The scenario name "One word is very common": keep, or rename everywhere (README and hero image included).
4. Read CLRS, Knuth and the SDM at the cited pages and record page numbers.
