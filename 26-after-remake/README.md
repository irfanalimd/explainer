> **Draft, for review only. Don't merge yet.** Lesson printouts before and after and the per-lesson diffs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/26-after-remake). The code diff is under **Files changed**.

## TL;DR

Follow-ups on the build the owner approved (`site/remake`, the remade MapReduce page):

- **A reader pass on the other five lessons** (B+ tree, consistent hashing, quicksort, virtual memory, linked list),
  the same method as #28: each read at New and at Expert, every story, as a beginner and as an expert.
- **Citation labels that name the document.** Sources written by an organisation showed as the last word of their
  author field ("developers 2026", "kernel 2026", "Foundation 2024"), and documents by one author showed under one
  label ("PostgreSQL 2024" for six documents, "WHATWG 2026" for three). Every source in all 8 lessons now shows a label
  of its own, and verify warns when two would share one.
- **Embedded pages write citations out** in the statements they send their host ("Dean & Ghemawat 2004, §3.1", not
  "[dean2004] §3.1").

Text, the sources lint and the embed only: nothing is drawn differently. Unit tests 371 / 371, verify 211 runs,
0 failing; 6 of 8 examples have no warnings.

## The reader pass (five lessons)

**In all five:**
- *Citations (expert):* the labels above. Each source now has a `short` naming its document ("CPython listobject.c",
  "Linux pgtable_64.h", "PostgreSQL nbtree README", "Intel SDM 2025, Vol. 3A", "OSTEP 2023, ch. 19",
  "Knuth 1997, Vol. 1").
- *"You can now" (novice):* every story listed every objective, so Linked list's "find the 5th item" ended by claiming
  the reader can "do the two pointer writes of an insert in the right order". Each objective now names the stories
  that teach it.

**Linked list.** Story 1's takeaway promised "more memory and slower visits per node", which New never shows; now "A
linked list never moves its items: an insert changes two arrows. It pays with a walk from head and an extra address in
every node." "No program may map the lowest pages" became "an ordinary program may not" (`mmap_min_addr` restricts
user processes only). Stroustrup's result read as a threshold; the source says the vector won for N "much larger than
500,000", so the text says it "still beat a linked list with 500,000 numbers".

**Quicksort.** Steps name slots counted from 0 without saying so; chapter 2 now says "Slots are numbered from 0, as in
the code." "About 1.39 n log2 n, or 20.6 for 9 numbers" read as if the approximation gave 20.6 (it gives 39.6); the
text now gives 20.6 and 32.7 as the exact formula's values and 1.39 n log2 n as the growth rate. The repeated-numbers
recap said "few pairs were skipped" though its own run compared all 36; now "few pairs, or none".

**Consistent hashing.** The leave recap said "the servers that took them"; with one seat each, all 8 keys went to one
server, so now "one server took them all: its share grew".

**Virtual memory.** A's lookup "cost 961 cycles" (note check included) and B's "after 960 cycles" made B look quicker;
B's now says "after a 960-cycle walk". The fault's "3 000 cycles, about 1 µs" read as fact under an Intel SDM citation
that gives no cost; now "This model charges 3 000 cycles, about 1 µs at 3 GHz…".

**B+ tree.** Only the objective scoping; the split arithmetic, leaf fills, PostgreSQL's 90 % rightmost-split
fillfactor, suffix truncation and the Lehman and Yao links all check out.

## Lead changes

- MapReduce's and Event loop's organisation sources get their own labels too ("Hadoop mapred-default.xml",
  "Spark RDD guide", "Python docs, PYTHONHASHSEED", "HTML standard, event loops", "HTML standard, timers",
  "Fetch standard", "ECMAScript, Await", "Node.js process docs", "Archibald 2021", …).
- `scripts/lib/sources-lint.mjs` warns when two sources would show under one label, with a test.
- `engine/embed/embed.mjs` writes citations out in its xAPI statements, with the embed's first test.

## Checks

- `verify.mjs`, all 8 examples: 0 failing; warnings only MapReduce 1 (its scenario name) and Raft 3 (its maxima).
- Writing lint: 0 hits in the five lessons. Unit tests 371 / 371.
- Every label in all 8 lessons is distinct (checked with `shortOf` over every lesson's sources).
- **Not verified:** Stroustrup 2012, the Linux and glibc sources and the PostgreSQL docs were checked against each
  lesson's recorded `supports` and the earlier rewrite's reading, not fetched again; the "I know the basics" level was
  not read separately; no screenshots (only words and citation labels changed).

## Next

1. The scenario name "One word is very common": keep or rename.
2. Make the writing and sources warnings errors, now that six examples have none.
