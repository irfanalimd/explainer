> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/18-content-systems), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/GOALS.md)), the [sources](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/SOURCES.md), the [factual fixes](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/FACTUAL-FIXES.md) and the lesson diffs. The code diff is under **Files changed**.

## TL;DR

- **The words of four examples were read against their sources, not recalled.** MapReduce, Raft, Consistent hashing
  and the B+ tree each cite the paper the field learns them from:
  - MapReduce: Dean & Ghemawat 2004;
  - Raft: Ongaro & Ousterhout 2014, and Ongaro's thesis;
  - Consistent hashing: Karger et al. 1997 and Dynamo 2007;
  - B+ tree: Bayer & McCreight 1972 and Comer 1979.

  I extracted each source's text, or fetched its docs or code, and compared every quoted number and claim with it.
- **Eleven claims were wrong, unsupported or cited to the wrong source, and are fixed.**
  - Raft credited a log-length shortcut to the paper's §5.3; the paper's own shortcut is different.
  - Raft said Consul uses Pre-Vote, and that etcd sizes its timers by disk speed.
  - Consistent hashing put Dynamo's MD5 in the wrong section, and gave a reason for Cassandra's token change that
    its source doesn't say.
  - The B+ tree misdescribed PostgreSQL's suffix truncation and its split code, and linked a dead page.
  - Six MapReduce source lines cited the paper for facts about Python, Hadoop and Spark.

  The [full list](FACTUAL-FIXES.md) has each old line, the source's words and the new line.
- **Every real-world fact now names its source**, as an id and a locator: `[dean2004] §3.6`. Each example's
  `lesson.sources` lists its sources and what each supports ([tables](SOURCES.md)).
- **The canonical examples are named as such.** Word count is the MapReduce paper's own first example (§2.1), and
  the web-log story is its second, URL access counts (§2.3). Raft's commands are the kind in the paper's Figure 6.
  The consistent-hashing ring began as a fix for web caches and became Akamai's business plan.
- **Plain language.** Softeners and vague claims are gone: "can simply run again", "just ends the term", "real
  engines rarely merge", "lands very close" (now "within 0.1% of N/(N + 1)").
- Branch **`content/examples-systems`**, 6 commits on `polish/round-4`. Text only; the simulation is unchanged.

## Before and after

| | `polish/round-4` | this branch |
|---|---|---|
| Claims found wrong, unsupported or mis-cited, and fixed | — | 11 ([list](FACTUAL-FIXES.md)) |
| Deeper layers naming a source with a section or page | the paper's full title on most, no section | every one, as `[id] locator` |
| Sources listed per example (MapReduce / Raft / Consistent hashing / B+ tree) | none | 7 / 6 / 7 / 10 |
| Source lines citing a source that doesn't say it | 6 (MapReduce's Python, Hadoop and Spark lines) | 0 |
| Dead source links | 1 (PostgreSQL's B-Tree Implementation page) | 0 |
| `verify.mjs`, all 8 examples | 211 runs, 0 failing | 211 runs, 0 failing |
| Unit tests | 342 / 342 | 342 / 342 |

---

## 1. Read against the sources

The rule for this pass: no fact went in or stayed from memory. The MapReduce paper was checked against its USENIX
HTML edition; Raft against the paper's and the thesis's extracted text; Dynamo against its extracted text;
PostgreSQL against the nbtree README, `nbtsplitloc.c` and the docs; etcd against its tuning guide and `raft.go`;
Cassandra against its architecture page and the JIRA issue. Most lines held up word for word (the checked-and-correct
list is at the end of [FACTUAL-FIXES.md](FACTUAL-FIXES.md)). These did not:

**Raft's backtracking shortcut** (`update.back`). The page said the follower's refusal carries its log's length and
credited that to "§5.3, end". §5.3 says something else: the follower "can include the term of the conflicting entry
and the first index it stores for that term", and adds "we doubt this optimization is necessary". The length jump is
the one the 6.824 students' guide teaches. The step now cites each to its own source, and the edge line gives the
paper's version and its doubt.

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/before/raft-update-back-1440.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/after/raft-update-back-1440.png?raw=true) |

**Raft's real-world lines.**
- **Pre-Vote:** "etcd and Consul use Pre-Vote" became "etcd's Raft library offers it as an option, PreVote". etcd's
  `raft.go` documents it ("described in raft thesis section 9.6"); HashiCorp's raft merged it only in 2024, and no
  source shows Consul turning it on.
- **CheckQuorum:** the line now states the thesis's own rule (§6.2): a leader steps down when an election timeout
  passes without heartbeats reaching a majority.
- **etcd's timers:** they are sized by the round trip between servers, the timeout at least 10 times it, not by
  "the disk's write time".

**Consistent hashing.**
- **MD5's section:** Dynamo hashes keys with MD5 in §4.1, not §4.2.
- **Cassandra's token change:** 4.0 cut the default from 256 random tokens to 16. The page's reason ("fewer
  neighbours to stream from and to repair") isn't in its source. Cassandra's architecture docs give the real one: 256
  random tokens "had the effect of coupling many physical endpoints together, increasing the risk of
  unavailability".
- **Origin:** "Early web caches spread keys this way" had no source. It now quotes the ring's origin: Karger et al.
  wanted a hash that "changes minimally as the range of the function changes", for web caches that come and go.
- **A contradiction:** the line no longer quotes Tom White's "every object moves" two lines after the lesson's own
  "1 key in N + 1 stays".

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/before/hashing-more-move-1440.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/after/hashing-more-move-1440.png?raw=true) |

**The B+ tree's PostgreSQL lines.**
- **Suffix truncation:** the nbtree README says it "only works at the whole-attribute granularity". It drops the
  trailing columns of a multi-column key; it does not cut a key to its shortest prefix, as the page said.
- **Rightmost split:** the page said PostgreSQL's split code "notes that 50/50 splits suit only truly random
  inserts". It doesn't. It now says what `nbtsplitloc.c` and the CREATE INDEX docs say: a rightmost leaf split keeps
  the left half at the leaf fillfactor, 90% by default, and every other leaf split is 50:50.
- **Dead link:** the B-Tree Implementation page now 404s. The link points at the B-Tree Structure section instead.

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/before/btree-summary-thin-1440.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/after/btree-summary-thin-1440.png?raw=true) |

**MapReduce.** Its facts were right, every one. But six source lines cited the paper for facts about Python's salted
hashes, Hadoop's speculative execution and committers, and Spark's settings, which the paper doesn't contain. Each
now cites the documentation it comes from.

## 2. Every fact names its source

Each layer that states a fact about a real system ends with a source line, `deeper.source`, as one or more ids and a
locator: `[dean2004] §3.6, §5.3; [hadoop-mapred]`. Each example's `lesson.sources` lists the sources: title,
authors, year, venue, URL, and a `supports` line saying what the lesson takes from it. Before, most source lines gave
the paper's full title and no section, so a reader couldn't find the sentence behind a claim. Before and after, with
the expert layers open:

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/before/mapreduce-skew-step0-1440.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/after/mapreduce-skew-step0-1440.png?raw=true) |

**This depends on the sources branch.** On this branch alone the source line shows the id and locator as text, with
no link. The round's sources branch renders `[id]` as a link to the listed source and lints that every fact layer has
one. Merged together, the line links. This branch only writes the data in the shared format.

## 3. The canonical examples, named

- **MapReduce.** Word count is the paper's own first example (§2.1), and its full program is Appendix A; the page now
  says so. The web-log story counts status codes the way the paper's second example counts URLs: map writes ⟨URL, 1⟩,
  reduce adds them (§2.3). The Zipf line now gives the paper's point: each map task writes hundreds or thousands of
  ⟨the, 1⟩ slips, all bound for one reduce task (§4.3).
- **Raft.** The client's commands (x←3, y←7, x←5) are the kind the paper's example log is made of (Figure 6); the step
  that adds the first one says so.
- **Consistent hashing.** The ring began in Karger et al.'s paper on web caching, and Tom Leighton's 2002 remarks
  record that Danny Lewin's thesis on it became the business plan for Akamai.
- **B+ tree.** The root split names the origin: Bayer and McCreight's 1972 paper, and Comer's 1979 survey calling
  the B-tree "ubiquitous", which is still PostgreSQL's default index. InnoDB's 16 KB pages join PostgreSQL's 8 KB.

## 4. Plain language

The four lessons and the figures' printed text were scanned for the round's banned list and read cold with
`scripts/lesson.mjs` at the default level. Changes:
- softeners: "can simply run again", "redoing just that piece", "just ends the term", "just hears nothing", "rules out
  just one id", "the very work";
- vague claims: "sends often" (now "at a steady interval"), "lands very close" (now "within 0.1% of N/(N + 1)"), "real
  engines rarely merge" (now what PostgreSQL's README states);
- a new sentence on why an average can't be combined.

The MapReduce story keeps its name, "One word is very common". The repo README and the hero image's description use
it, and it is plain English. Its takeaways no longer repeat "very common".

| Before (phone) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/before/mapreduce-step0-390.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/18-content-systems/shots/after/mapreduce-step0-390.png?raw=true) |

## Checks

- `verify.mjs`, all 8 examples: 211 runs, 0 failing; Raft keeps its 3 known warnings at its maxima ([log](verify-after.txt)).
- Unit tests: 342 / 342 ([log](tests-after.txt)).
- `lesson.mjs --all` before and after for each example ([diffs](lesson-diffs/)).
- Every source URL fetched: all resolve, though the ACM DOIs, O'Reilly and MySQL refuse scripts with 403.
- Every screenshot here was read.
- **Not verified:**
  - **Karger et al.'s balance claim:** that about log N seats per server keep every share within a constant factor
    of fair. The PDF's text could not be extracted here, so only the abstract's words are quoted. The claim matches
    the paper as widely taught.
  - **Whole-lesson coverage:** the cold read covered the default level of each story, not every line at New and
    Expert.
  - **Source links:** they render only with the sources branch merged.

## Next

1. Merge with the sources branch and check that every `[id]` renders as a link, and that its lint finds no fact layer
   without a source.
2. Extract Karger et al.'s text (with a working PDF tool) and quote the log N result with its section.
3. Read every line at New and at Expert, not only the default level.
4. MapReduce's skew story could name its keys as status codes in the label ("Most lines say 200"). That needs the
   repo README and the hero image updated too.
