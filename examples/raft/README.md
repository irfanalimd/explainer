# Raft: how five servers agree on one log

Raft run for real on the `sim/actors` runtime: five servers in a ring, a client below them, and an optional
space-time board with one rail per server. Each server's tray is its log, one tile per entry, keyed by term and dim
until that server knows the entry is committed. The reader should leave knowing:

- a server that hears nothing for a randomized election timeout stands for leader in a new term;
- a vote goes only to a candidate whose log is at least as up to date as the voter's;
- an entry is committed once a majority stores it, and any two majorities share a server, so a committed entry
  survives any later election;
- a leader cut off in a minority cannot commit anything.

- **Source:** Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm", USENIX ATC 2014
  ([raft.pdf](https://raft.github.io/raft.pdf)).
- **What is real:** randomized election timeouts, RequestVote with the log up-to-date check, AppendEntries with the
  consistency check and conflict truncation, commit only of current-term entries by majority (a new leader appends
  a no-op, §8), and a client that retries. The code panel shows the handlers the simulation runs, line for line.
- **Simplifications:** no snapshots or log compaction and no membership changes; a crashed server restarts with its
  log and term, as Raft requires of stable storage.

## Scenarios

| Story | What happens | What it teaches |
|---|---|---|
| Normal run | The servers elect a leader, which copies `x←3 y←7 x←5` to a majority before each counts. | Election, replication and commit on the happy path. |
| Leader crashes | The leader crashes partway through replication; the others elect a new one, and the old leader rejoins as a follower and catches up. | Nothing committed is lost: only a server holding every committed entry can win the new majority. |
| Partition | The network strands the leader with one follower; the majority elects its own leader, then the network heals. | A minority leader cannot commit. On healing, its uncommitted entries give way to the majority's log. |

The run pauses for predict questions before the outcomes that are not obvious: when an old-term entry commits, whether a
stranded leader can commit, and what happens to its entries when the network heals.

**Knobs:** servers (3–7), client commands, latency, jitter, election timeout range, heartbeat, drop rate, the §8
no-op, the space-time board (off by default), layout, seed.

**Invariants** (checked on every step): at most one leader per term; logs match up to the commit index; log
matching (same index and term means the same prefix); committed entries are never lost.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 54 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # raft.html
node ../../scripts/shoot.mjs raft.html --scenario all
node ../../scripts/audit.mjs raft.html --scenario all
```
