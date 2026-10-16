# MapReduce: counting words with a team of machines

A word-count job run for real: the input is split, three mappers emit `(word, 1)`, the shuffle sends each record to
reducer `hash(word) % R` along a bus, and two reducers sort and sum. The result lands in an output store. It is the
engine's reference figure, narrated for a beginner (`meta.level: "core"`) who knows loops and dictionaries but has
never met MapReduce. The reader should leave knowing:

- no machine sees the whole input, yet every count is exact, because a hash sends every copy of a word to the
  same counting machine;
- moving the slips to their counters (the shuffle) is where data crosses the network;
- a failed or slow piece is simply read again elsewhere, because the text is still on disk;
- the same rule that makes counts exact puts a very common word's whole load on one machine.

- **Source:** Dean & Ghemawat, "MapReduce: Simplified Data Processing on Large Clusters", OSDI 2004
  ([paper](https://research.google/pubs/pub62/)). Backup tasks are from section 3.6.
- **What is real:** splitting, mapping, an FNV-1a partition hash, the optional combiner, sorting by key before the
  reduce, and the byte count of each shuffled record (the word plus a 4-byte count).
- **Simplifications:** one master, no distributed file system, and records stay in memory between phases.

## The lesson

- **Hook:** "Each machine reads only part of the text. How do they still count every word exactly, none missed or
  counted twice?"
- **Picture:** counting every word in a library with a team. A shelf is a split, the coordinator is the master, a
  helper tallying their shelf is a mapper ("reading machine"), a tally slip is a record `(fox, 1)`, the person adding
  up one word's slips is a reducer ("counting machine"), the noticeboard is the output.
- **Problem first:** the opening caption and the split's tag say what one machine alone would do (read all 11 words,
  one after another) against three machines sharing them.
- **Chapters:** Split (the parts and the slow way) · Map (each machine writes a slip per word) · Shuffle (every slip
  for one word goes to one counter, picked by its hash; the aha) · Reduce (sort, then add each group) · Output.
- **Predict:** at the first word that comes back a second time ("The first "the" went to reduce 0. Where does this
  "the" go?"), against the misconception that one machine adds everything up at the end. The crash and slow-machine
  stories add one question each (what happens to the crashed piece; what the master does about the slow one).
- **Words** (`meta.terms`): master, split, mapper, hash, shuffle, reducer, straggler.
- **Recap and takeaway** at the end; each failure story has its own.

## Stories

| Story | What happens | What it teaches |
|---|---|---|
| Everything works | 11 words, 8 different, counted by 3 reading and 2 counting machines; 85 bytes cross the network. | The whole pipeline: split, map, shuffle, reduce, output. |
| One machine crashes | A reading machine crashes after 2 of its 4 words; its slips are lost and the master has split 1 read again. | Reading a piece again is safe: the text survives, and the same piece gives the same slips. |
| One machine is slow | One machine's disk is failing, so the master races a backup copy of its piece on a free machine. | The backup finishes first, the slow copy is stopped, and the answer is the same. |
| One word is very common | A web log where the status code `200` is almost every line, over 3 counting machines. | One very common word piles its whole load onto one machine (reduce 0 gets 12 of 14 slips). |

**Knobs:** reading machines (1–6), counting machines (1–4), add up repeats first (the combiner), text to count, seed.

**Numbers:** words read and sent between machines in the dock; the busiest counter's load in the common-word story;
tasks finished in the full list.

**Invariants** (checked on every step): counts are conserved (every count in the world is one the mappers
emitted); at the end, the output sums to the number of input words; no word appears twice in the output.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 26 runs, 0 failing, teaching clean
node ../../scripts/lesson.mjs figure.mjs                 # the lesson as text
node ../../scripts/build.mjs figure.mjs                  # mapreduce.html
node ../../scripts/shoot.mjs mapreduce.html --scenario all
node ../../scripts/audit.mjs mapreduce.html --scenario all
```
