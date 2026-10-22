# Factual fixes

Each row: what the page said, what the source says, what it says now. Every source was read for this, not recalled:
PDFs were extracted to text, docs and code fetched, quotes compared word for word.

| Example | Was | The source | Now |
|---|---|---|---|
| Raft (`update.back`) | "the refusal also says how long the follower's log is, so the leader jumps straight to its last entry + 1 (§5.3, end)" | Ongaro & Ousterhout §5.3: the follower "can include the term of the conflicting entry and the first index it stores for that term"; "we doubt this optimization is necessary". The log-length jump is the 6.824 students' guide's. | Basic rule cited to §5.3; the length jump to the students' guide; the paper's own conflict-term shortcut, and its doubt, in the edge line. |
| Raft (`elect.cut-off`) | "Pre-Vote … etcd and Consul use it." | etcd's `raft.go`: "PreVote enables the Pre-Vote algorithm described in raft thesis section 9.6." HashiCorp's raft merged Pre-Vote only in June 2024; no source shows Consul turning it on. | "etcd's Raft library offers it as an option, PreVote." |
| Raft (`split.cut`) | "CheckQuorum, used by etcd, makes a leader step down when it hasn't heard from a majority …" | Thesis §6.2: "a leader in Raft steps down if an election timeout elapses without a successful round of heartbeats to a majority"; `raft.go`: CheckQuorum "Leader steps down when quorum is not active for an electionTimeout." | The thesis's rule in its own terms, then "etcd's Raft library calls this option CheckQuorum." |
| Raft (`elect.start`) | etcd's timers "sized to the network's round trip and the disk's write time" | etcd tuning guide: heartbeat "around round-trip time between members"; election timeout "at least 10 times the round-trip time". Neither is sized by disk latency. | "Its guide sets the heartbeat near the round trip between servers, and the timeout at least 10 times that round trip." |
| Consistent hashing (`ring.intro`) | "Dynamo used 128-bit MD5 (§4.2)" | Dynamo, §4.1 System Interface: "It applies a MD5 hash on the key to generate a 128-bit identifier". | "(§4.1)". |
| Consistent hashing (`result.vnodes`) | Cassandra 4.0 went from 256 seats to 16 because "fewer seats meant fewer neighbours to stream from and to repair" | Cassandra's architecture page: 256 random tokens "had the effect of coupling many physical endpoints together, increasing the risk of unavailability"; CASSANDRA-13701 "Lower default num_tokens", fixed in 4.0. The cited production page says neither. | The availability reason, cited to the architecture page and the issue. |
| Consistent hashing (`more.move`) | "Early web caches spread keys this way." (no source) | Karger et al. 1997, abstract: caching protocols for "hot spots on the World Wide Web"; a consistent hash "changes minimally as the range of the function changes". | The ring's origin, quoted and cited. |
| B+ tree (`split.leaf`) | PostgreSQL 12+ "cut it to the shortest prefix that still separates (suffix truncation)" | nbtree README: "Suffix truncation in Postgres currently only works at the whole-attribute granularity." | On a key of several columns, PostgreSQL drops the trailing columns the separator doesn't need. |
| B+ tree (`summary.thin`) | PostgreSQL's "code notes that 50/50 splits suit only truly random inserts" | nbtsplitloc.c says no such thing: a rightmost leaf split leaves the left page "fillfactor% full"; other leaf splits are "50:50". CREATE INDEX docs: default fillfactor 90, used "when extending the index at the right". | What the code and docs say, with both cited. |
| B+ tree (`scan.done`) | linked `docs/current/btree-implementation.html` | That page is gone (404) in the current docs. | `docs/current/btree.html#BTREE-STRUCTURE`: "each level of the tree can be used as a doubly-linked list of pages". |
| MapReduce (`split.cut`, `map.read`, `crash.down`, `slow.win`, `shuffle.first`, `reduce.sort`) | Hadoop's input splits and map output file, Hadoop and Spark failure handling, Hadoop's speculation cap, Python's salted `hash()`, Hadoop's and Spark's sorting: source given as the 2004 paper only | The paper says none of these. | Each line cites the Python, Hadoop or Spark documentation it comes from. |

Checked and found correct (quoted against the source): MapReduce's 16–64 MB splits (§3.1), GFS's 64 MB blocks and
"typically 3 copies" (§3.4), M = 200,000, R = 5,000 on 2,000 machines (§3.5), the 30 → 1 MB/s disk and the 44% sort
(§3.6), Zipf (§4.3), Table 1 (157 machines, 3,351 map tasks, 55 reduce tasks); Raft's 150–300 ms (§5.2), the no-op
and client serial numbers (§8), the timing inequality (§5.6), retrying indefinitely (§5.3); Dynamo §4.2, §4.9 and
§6.2 (strategy 3 balances best); PostgreSQL's empty-page deletion, Lehman and Yao, left links for backward scans, 8 KB
pages and fillfactor 90; InnoDB's 16 KB default.
