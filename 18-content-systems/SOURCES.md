# Sources, per example

Each id is the `lesson.sources` entry a layer cites as `[id] locator` in its `deeper.source`. "Cited by" counts the step layers that name it.

## MapReduce

| id | source | what it supports | cited by |
|---|---|---|---|
| `dean2004` | J. Dean, S. Ghemawat, [MapReduce: Simplified Data Processing on Large Clusters](https://research.google/pubs/pub62/), OSDI 2004, 2004 | word count (§2.1, Appendix A), URL access counts (§2.3), splits of 16–64 MB (§3.1), the master and re-execution (§3.3), GFS's 3 copies and locality (§3.4), M = 200,000, R = 5,000 on 2,000 machines (§3.5), backup tasks and the 30 → 1 MB/s disk (§3.6), partitioning and ordering (§4.1, §4.2), combiners and Zipf (§4.3), the 44% sort result (§5.3), Table 1 | 23 |
| `hadoop-mapred` | Apache Hadoop, [mapred-default.xml](https://hadoop.apache.org/docs/stable/hadoop-mapreduce-client/hadoop-mapreduce-client-core/mapred-default.xml), Hadoop MapReduce documentation, 2024 | speculative execution on by default and its 10% cap; mapreduce.am.max-attempts | 3 |
| `hadoop-committers` | Apache Hadoop, [Committing work to S3 with the S3A committers](https://hadoop.apache.org/docs/stable/hadoop-aws/tools/hadoop-aws/committers.html), Hadoop-AWS documentation, 2024 | output committers, the v1 and v2 algorithms, and why object stores need their own | 1 |
| `spark-config` | Apache Spark, [Spark Configuration](https://spark.apache.org/docs/latest/configuration.html), Spark documentation, 2024 | spark.speculation off by default; the external shuffle service | 2 |
| `spark-rdd` | Apache Spark, [RDD Programming Guide](https://spark.apache.org/docs/latest/rdd-programming-guide.html), Spark documentation, 2024 | reduceByKey combines on the map side and spills its tables to disk; prefer it to groupByKey | 2 |
| `white2015` | T. White, [Hadoop: The Definitive Guide, 4th edition](https://www.oreilly.com/library/view/hadoop-the-definitive/9781491901687/), O'Reilly, 2015 | combiner functions (ch. 2), the shuffle and sort, with each map's output in one partitioned file (ch. 7), input splits and records across blocks (ch. 8) | 4 |
| `python-hashseed` | Python Software Foundation, [Command line and environment: PYTHONHASHSEED](https://docs.python.org/3/using/cmdline.html#envvar-PYTHONHASHSEED), Python documentation, 2024 | str hashes are salted per process unless PYTHONHASHSEED is set | 1 |

## Raft

| id | source | what it supports | cited by |
|---|---|---|---|
| `ongaro2014` | D. Ongaro, J. Ousterhout, [In Search of an Understandable Consensus Algorithm (Extended Version)](https://raft.github.io/raft.pdf), USENIX ATC 2014, 2014 | terms and elections with 150–300 ms random timeouts (§5.2, §9.3), log matching and backing up, with the conflict-term shortcut (§5.3), the vote check and commitment rule (§5.4, Figure 8), the timing rule (§5.6), the leader's no-op, client serial numbers and reads (§8), persistent state (Figure 2), the example log of x←3, y←7, x←5 (Figure 6) | 26 |
| `ongaro-thesis` | D. Ongaro, [Consensus: Bridging Theory and Practice](https://github.com/ongardie/dissertation), PhD thesis, Stanford University, 2014 | a leader steps down after an election timeout without heartbeats reaching a majority (§6.2); Pre-Vote, against a rejoining server's disruption (§9.6) | 2 |
| `gjengset` | J. Gjengset, [Students' Guide to Raft](https://thesquareplanet.com/blog/students-guide-to-raft/), MIT 6.824 teaching notes, 2016 | the commit index from the last new entry, when to reset the election timer, cutting the log only on a conflict, accelerated backtracking by log length | 4 |
| `etcd-tuning` | etcd, [Tuning](https://etcd.io/docs/v3.5/tuning/), etcd v3.5 documentation, 2023 | a 100 ms heartbeat and a 1000 ms election timeout by default, both sized by the round trip between members | 2 |
| `etcd-raft` | etcd, [etcd-io/raft: raft.go and README](https://github.com/etcd-io/raft), etcd's Raft library, 2024 | the PreVote and CheckQuorum options; CockroachDB, TiKV and etcd among its users | 3 |
| `raft-site` | D. Ongaro et al., [The Raft Consensus Algorithm](https://raft.github.io/), raft.github.io, 2024 | the list of Raft implementations, Consul's among them | 1 |

## Consistent hashing

| id | source | what it supports | cited by |
|---|---|---|---|
| `karger1997` | D. Karger, E. Lehman, T. Leighton, R. Panigrahy, M. Levine, D. Lewin, [Consistent Hashing and Random Trees: Distributed Caching Protocols for Relieving Hot Spots on the World Wide Web](https://doi.org/10.1145/258533.258660), STOC 1997, 1997 | the ring, for web caches that come and go: a consistent hash “changes minimally as the range of the function changes”; smoothness; about log N copies of each cache for balance | 6 |
| `leighton2002` | T. Leighton, [Remarks commemorating Danny Lewin](https://www.sigact.org/prizes/student/remarks.html), SIGACT, the Danny Lewin Best Student Paper Award, 2002 | Lewin's master's thesis on consistent hashing became the business plan for Akamai Technologies | 1 |
| `dynamo2007` | G. DeCandia et al., [Dynamo: Amazon's Highly Available Key-value Store](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf), SOSP 2007, 2007 | MD5 to a 128-bit identifier (§4.1), the ring and virtual nodes, and why: a failed node's load spreads (§4.2), replication to the next N nodes (§4.3), adding and removing nodes (§4.9), equal-size partitions balance best (§6.2) | 7 |
| `cassandra-dynamo` | Apache Cassandra, [Dynamo](https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html), Cassandra architecture documentation, 2024 | Cassandra's techniques come from Dynamo; 256 random tokens coupled many endpoints and raised the risk of unavailability; a token allocator needs far fewer | 2 |
| `cassandra-13701` | Apache Cassandra, [CASSANDRA-13701: Lower default num_tokens](https://issues.apache.org/jira/browse/CASSANDRA-13701), Cassandra issue tracker, fixed in 4.0, 2020 | num_tokens default lowered in 4.0 (to 16, per CASSANDRA-16979) | 1 |
| `jump2014` | J. Lamping, E. Veach, [A Fast, Minimal Memory, Consistent Hash Algorithm](https://arxiv.org/abs/1406.2294), arXiv:1406.2294 (Google), 2014 | jump consistent hash moves 1/(n + 1) of the keys and needs no stored ring, but buckets can only be added or removed at the end | 1 |
| `white2007` | T. White, [Consistent Hashing](https://tom-e-white.com/2007/11/consistent-hashing.html), blog post, 2007 | the reshuffle that hash mod n causes when a cache joins or leaves; virtual nodes; from Dynamo to memcached | 1 |

## B+ tree

| id | source | what it supports | cited by |
|---|---|---|---|
| `bayer1972` | R. Bayer, E. McCreight, [Organization and Maintenance of Large Ordered Indexes](https://doi.org/10.1007/BF00288683), Acta Informatica 1(3), 1972 | the B-tree: fixed-size pages that split, a tree that grows at the root so every leaf sits at one depth | 1 |
| `comer1979` | D. Comer, [The Ubiquitous B-Tree](https://doi.org/10.1145/356770.356776), ACM Computing Surveys 11(2), 1979 | the B+ tree: ids in the leaves, separators above, the leaves linked for sequential access; B-trees as the de facto standard for indexing files | 3 |
| `lehman1981` | P. Lehman, S. B. Yao, [Efficient Locking for Concurrent Operations on B-Trees](https://doi.org/10.1145/319628.319663), ACM TODS 6(4), 1981 | right-links and high keys, so a reader that meets a concurrent split moves right | 2 |
| `pg-nbtree-readme` | PostgreSQL, [src/backend/access/nbtree/README](https://github.com/postgres/postgres/blob/master/src/backend/access/nbtree/README), PostgreSQL source tree, 2024 | PostgreSQL implements Lehman and Yao; left links for backward scans; only completely empty pages are deleted; suffix truncation works on whole columns | 5 |
| `pg-splitloc` | PostgreSQL, [src/backend/access/nbtree/nbtsplitloc.c](https://github.com/postgres/postgres/blob/master/src/backend/access/nbtree/nbtsplitloc.c), PostgreSQL source tree, 2024 | a rightmost leaf split leaves the left half fillfactor% full; other leaf splits are 50:50 | 1 |
| `pg-create-index` | PostgreSQL, [CREATE INDEX](https://www.postgresql.org/docs/current/sql-createindex.html), PostgreSQL documentation, 2024 | btree is the default index method; B-trees use a default fillfactor of 90, applied when extending the index at the right | 2 |
| `pg-page-layout` | PostgreSQL, [Database Page Layout](https://www.postgresql.org/docs/current/storage-page-layout.html), PostgreSQL documentation, 2024 | tables and indexes are arrays of fixed-size pages, usually 8 kB | 2 |
| `pg-btree` | PostgreSQL, [B-Tree Indexes: B-Tree Structure](https://www.postgresql.org/docs/current/btree.html#BTREE-STRUCTURE), PostgreSQL documentation, 2024 | each level of the tree can be used as a doubly-linked list of pages | 1 |
| `pg-explain` | PostgreSQL, [Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html), PostgreSQL documentation, 2024 | a Seq Scan reads the whole table | 1 |
| `mysql-innodb` | Oracle, [InnoDB Startup Options and System Variables: innodb_page_size](https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html), MySQL 8.4 Reference Manual, 2024 | InnoDB's default page size is 16 KB | 1 |
