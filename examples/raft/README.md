# Raft: how servers that can crash keep one shared log

Raft run for real on the `sim/actors` runtime: five servers in a ring, a client below them, and an optional
space-time board (the "Message timeline") with one rail per server. Each server's tray is its log, one tile per
entry, keyed by term and dim until that server knows the entry is committed. It is narrated for a beginner
(`meta.level: "core"`) who knows basic programming but has never met consensus. The reader should leave knowing:

- the servers elect one leader by majority vote, so there is one writer deciding the order;
- an entry counts (is committed) once a majority stores it, not every server, so one crash cannot stall it;
- any two majorities share a server, so a committed entry survives losing the leader;
- a leader cut off on the smaller side of a split cannot commit anything.

- **Source:** Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm", USENIX ATC 2014
  ([raft.pdf](https://raft.github.io/raft.pdf)).
- **What is real:** randomized election timeouts, RequestVote with the log up-to-date check, AppendEntries with the
  consistency check and conflict truncation, commit only of current-term entries by majority (a new leader writes an
  empty `nop` entry, §8), and a client that retries. The code panel shows the handlers the simulation runs, line for
  line, under Raft's own names; the messages on screen use plain names ("Vote request", "Update").
- **Simplifications:** no snapshots or log compaction and no membership changes; a crashed server restarts with its
  log and term, as Raft requires of stable storage.

## The lesson

- **Hook:** "Five servers keep copies of the same list, and any of them can crash. How do they never end up
  disagreeing?"
- **Picture:** a group keeping one shared notebook. Each copy is a log, a line is an entry, the elected note-taker
  is the leader, "most of us have copied it" is a majority, a line that counts is committed, the note-taker's "still
  here" is a heartbeat, which vote this is is the term.
- **Problem first:** the first two chapters say why "just copy to everyone" fails: writers at once would disagree on
  the order (so: one elected writer), and waiting for every copy would stall on one crash (so: a majority).
- **Chapters:** Election · Replication · Agreement; the crash story adds Crash · Re-election · Catch-up, the split
  story Partition · New leader · Heal (at most six per story).
- **Predict** (each with a why): at the first command to reach 3 of 5 ("Can S1 count it as committed now?", the aha,
  against "every server must have it"); in the crash story, whether the new leader still has the committed `x←3`; in
  the split story, whether the cut-off leader can commit, and what happens to its entry after the network joins up.
- **Words** (`meta.terms`): leader, log, majority, term, entry, client, commit, heartbeat, partition, node.
- **Recap and takeaway** at the end; each failure story has its own.

## Stories

| Story | What happens | What it teaches |
|---|---|---|
| Everything works | The servers elect a leader, which copies `x←3 y←7 x←5` to a majority before each counts. | Election, copying and committing. |
| The leader crashes | The leader crashes while copying `y←7`; the others elect a new one, and the old leader comes back and catches up. | Nothing committed is lost: only a server holding every committed entry can win the new vote. |
| The network splits in two | The network strands the leader with one other server; the bigger side elects its own leader, then the network joins up. | A leader without a majority cannot commit; its uncommitted entry is replaced afterwards. |

**Knobs:** servers (3–7), client commands, message delay (ms), lost messages (none, 1 in 20, 1 in 10), message
timeline (hide, show, show below the servers), seed. The expert settings left the drawer but `build` still reads
them, so tests and old links keep working: `jitter` (default 40 % of the delay, at most 5 ms), `electionMin` and
`electionMax` (150–300 ms), `heartbeat` (50 ms), `noop` (on) and `layout` (auto).

**Numbers:** election term and entries committed in the dock, plus time without a leader in the crash and split
stories; messages sent and lost in the full list.

**Invariants** (checked on every step): at most one leader per term; logs match up to the commit index; log
matching (same index and term means the same prefix); committed entries are never lost.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 24 runs, 0 failing, teaching clean
node ../../scripts/lesson.mjs figure.mjs                 # the lesson as text
node ../../scripts/build.mjs figure.mjs                  # raft.html
node ../../scripts/shoot.mjs raft.html --scenario all
node ../../scripts/audit.mjs raft.html --scenario all
```
