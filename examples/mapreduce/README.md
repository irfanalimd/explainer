# MapReduce: counting words across a cluster

A word-count job run for real: the input is split, three mappers emit `(word, 1)`, the shuffle sends each record to
reducer `hash(word) % R` along a bus, and two reducers sort and sum. The result lands in an output store. It is the
engine's reference figure. The reader should leave knowing:

- no machine sees the whole input, yet every count is exact, because hashing sends every copy of a word to the
  same reducer;
- the shuffle is where the bytes move between machines;
- a failed or slow task is simply run again elsewhere, because its input is still there;
- the same hashing that makes counts exact puts a hot key's whole load on one reducer.

- **Source:** Dean & Ghemawat, "MapReduce: Simplified Data Processing on Large Clusters", OSDI 2004
  ([paper](https://research.google/pubs/pub62/)). Backup tasks are from section 3.6.
- **What is real:** splitting, mapping, an FNV-1a partition hash, the optional combiner, sorting by key before the
  reduce, and the byte count of each shuffled record (the word plus a 4-byte count).
- **Simplifications:** one master, no distributed file system, and records stay in memory between phases.

## Scenarios

| Story | What happens | What it teaches |
|---|---|---|
| Normal run | 11 words, 8 distinct, counted by 3 mappers and 2 reducers; 85 bytes cross the shuffle. | The whole pipeline: split, map, shuffle, reduce, output. |
| Worker dies | A mapper crashes after 2 of its 4 words; its output is lost and the master runs the split again. | Re-execution is safe because map tasks are deterministic and their input survives. |
| Straggler | One mapper's disk is slow, so the master races a backup copy of its task on an idle machine. | The backup finishes first, the straggler is killed, and the answer is the same. |
| Skewed keys | A log of HTTP status codes where `200` is almost every line, over 3 reducers. | One hot key piles its whole load onto one reducer (reduce 0 handles 12 of 14 records). |

**Knobs:** mappers (1–6), reducers (1–4), combiner, input text, seed.

**Invariants** (checked on every step): counts are conserved (every count in the world is one the mappers
emitted); at the end, the output sums to the number of input words; no word appears twice in the output.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 26 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # mapreduce.html
node ../../scripts/shoot.mjs mapreduce.html --scenario all
node ../../scripts/audit.mjs mapreduce.html --scenario all
```
