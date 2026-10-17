# Raft: curriculum

Level `core` (teaching.md lists Raft as `deep`; the figure keeps it `core` for a beginner: fewer chapters and knobs,
same rules). The figure exists; another agent is adding its step, chapter and ask ids now, so this plan names steps
by the moment in the run and asks by the figure's current internal key (`ask("commit", …)` etc.), never by a new id.
`lesson.mjs` holds only `goal`, `objectives`, `misconceptions`, `picture` and `terms`.

## Sources

Canonical
- D. Ongaro & J. Ousterhout, "In Search of an Understandable Consensus Algorithm (Extended Version)", USENIX ATC 2014:
  Figure 2 (the rules), §5.2 election, §5.3 replication, §5.4.1 election restriction, §5.4.2 and Figure 8 (commit
  only current-term entries by counting), §5.6 timing, §8 client interaction (no-op at term start, client serial
  numbers, read-only requests). https://raft.github.io/raft.pdf
- D. Ongaro, "Consensus: Bridging Theory and Practice", PhD thesis, Stanford 2014: §6 client interaction (read-only
  queries and the leader's no-op), §9.6 Pre-Vote and CheckQuorum (disruptive servers).
  https://github.com/ongardie/dissertation

Secondary
- J. Gjengset, "Students' Guide to Raft" (MIT 6.824 TA notes: the bugs students actually write, including truncating
  on every AppendEntries, resetting the timer on the wrong events, and committing old-term entries).
  https://thesquareplanet.com/blog/students-guide-to-raft/
- J. Gjengset, "Raft Q&A" (Figure 8, "why can't a leader commit an old entry it sees on a majority?").
  https://thesquareplanet.com/blog/raft-qa
- Princeton COS 418, L13 Raft slides (Figure 8 walk-through used in teaching).
  https://www.cs.princeton.edu/courses/archive/fall25/cos418/docs/L13-raft.pdf
- etcd tuning guide (real defaults: heartbeat 100 ms, election timeout 1000 ms). https://etcd.io/docs/v3.5/tuning/

Misconception evidence
- "Majority vs. all" and "safe once the leader has it": the commit questions in Gjengset's Q&A and course slides;
  the paper itself spends §5.4.2 on the "old entry on a majority" trap (Figure 8).
- "A cut-off leader still decides": the stale-leader discussion in §8 (read-only requests) and the thesis, §6.

## Prerequisites

Programs run on several computers that talk over a network; messages take time and can be lost; a list of commands
like `x←3` applied in order gives the same result everywhere. Not needed: consensus theory, RPCs, quorums by name.

## Exact rules and numbers (what the run does)

- Servers N = 3–7 (default 5); majority = ⌊N/2⌋ + 1 (2 of 3, 3 of 5, 4 of 7). N servers survive ⌊(N − 1)/2⌋ crashes.
- Election timeout uniform random in 150–300 ms (paper §9.3); heartbeat every 50 ms; message delay default 12 ms ±5.
- Timeout: term + 1, become candidate, vote for self, send vote requests with (last log term, last log index).
- Vote rule: grant iff the request's term equals mine (after stepping up to a newer term), I have not voted for
  someone else this term, and the candidate's log is at least as up to date: a later last term wins; equal last
  terms, the longer log wins (§5.4.1).
- Win with a majority of votes; the new leader appends an empty `nop` of its term (§8) and sends updates at once.
- Update (AppendEntries): reject an older term; else check the entry at prevLogIndex has prevLogTerm; on a mismatch
  reply "missing" and the leader steps back (the run jumps to min(prev, follower's last + 1)); on a match, truncate
  only from the first conflicting entry, append the rest, and set commit = min(leaderCommit, index of last new entry).
- Commit: the leader advances commitIndex to the highest n stored on a majority **whose entry is from its own term**;
  everything before it commits with it (Figure 8). Followers learn the new commit index from the next update.
- A restarted server keeps term, vote and log (stable storage) but not its commit index: it starts "unsure".
- The client sends one command at a time to the leader it knows; a non-leader turns it away with a hint; no answer in
  max(3 × 50 + 2 × delay, 150) ms means a retry, re-discovering the leader.
- Stories: happy (`x←3 y←7 x←5`), crash (the leader crashes right after adding the 2nd command), partition (the
  leader and one neighbour cut off after the 1st answer; the split heals 450 ms later).

## Objectives and their quiz stems

| id | objective | stem (answer) |
|---|---|---|
| o-elect | Explain how one leader is chosen | "S2 and S4 time out together in term 4, with 5 servers. Can both become leader of term 4? Why not?" (No: each server votes once per term, and two majorities of 5 would need 6 votes) |
| o-commit | Predict when an entry is committed | "With 7 servers, how many must store an entry before the leader can commit it?" (4) |
| o-survive | Explain why a committed entry survives a crash | "x←3 is committed on S1, S2 and S3 of 5. S1 crashes. Can S4, whose log lacks x←3, win the next election?" (No: it needs 3 votes, and at least one comes from S2 or S3, which refuse it) |
| o-split | Predict what a cut-off leader can do | "S1 leads but can reach only S2, of 5 servers. A client sends z←1 to S1. What happens to it?" (Stored on 2, never committed; replaced after the heal) |
| o-own | Explain the new leader's empty entry | "A new leader of term 3 sees y←7, from term 2, on 3 of 5 servers. May it count y←7 as committed now?" (No: only once an entry of term 3, such as its nop, reaches a majority) |

## Chapters (current names in the figure)

The parts chapter, whose entry card shows the picture map (`enter.picture: true`), is **Election**: its about carries
the shared-notebook picture, and it introduces log, term, leader and majority on lit servers (4 terms, within the
parts-chapter limit of 5 at `core`). `Copying the log` adds client, entry and commit (3). The crash story's `Crash`
adds heartbeat (it also first appears in the happy path's heartbeat caption); the split story's `The network splits`
adds partition. `node` is defined only for the `Heal` about and used once there: drop the word from that about, or
the term fails use-it-or-lose-it.

| chapter | stories | So far | Now | You'll know it worked when |
|---|---|---|---|---|
| Election | all | One program can keep a list of commands. But one machine can crash and take the list with it. | Five servers keep copies, and first they elect one writer. | One server's light turns leader, after most servers voted for it. |
| Copying the log | all | One server leads. But no command has been saved yet. | The leader writes each command and sends copies. | An entry lights up once most servers hold it, not all. |
| Crash | crash | Entries count once most servers store them. | The leader crashes partway through copying a command. | Its light goes dark, and most servers still hold every committed entry. |
| Re-election | crash | Nobody leads. But most servers still hold every committed entry. | A timer runs out, and a vote starts in the next term. | The winner's log still holds every committed entry. |
| Catch-up | crash | The new leader carries on. But the crashed server has missed entries. | The crashed server returns and the leader fills in its log. | Its log matches the leader's, entry for entry. |
| The network splits | partition | Entries count once most servers store them. | The network splits, leaving the leader on the smaller side. | The leader's new entry stays dim: too few servers hold it. |
| New leader | partition | The cut-off leader can't commit anything. But it still thinks it leads. | The bigger side elects a leader in a newer term. | Commands are committed again on the bigger side. |
| Heal | partition | Two servers think they lead, in different terms. | The network joins up again. | The old leader steps down, and its dim entry is replaced. |
| Stuck | only with the hidden `noop: false` | A new leader holds an older entry on most servers. | Watch it try to count that entry. | It never lights: no entry of the leader's own term carries it. |
| Agreement | all | Every command reached most servers, whatever failed. | Compare every server's committed entries. | Every server's lit entries read the same, in the same order. |

## Key steps (by moment; attach to the ids once they exist)

- The first timeout (a server runs in term 1 and votes for itself): random timers mean one usually runs first.
- The first win, with the empty `nop`: majority vote; the `nop` is why older entries can commit later (o-own).
- The leader adds the first client command and sends copies.
- **The first commit** of a client command at a majority (the aha; the `commit` ask sits right before it).
- Crash story: the leader crashes; the new leader's win "Its log still has x←3" (the `survive` ask before it); the
  restarted server refused by its log check ("lacks entry k … steps back").
- Partition story: "S2 stores z←1, but 2 of 5 servers is no majority" (the `minority` ask before it); the replacement
  of the old leader's uncommitted entry (the `heal` ask before it).
- The Agreement step: the payoff, every committed log equal.

## Asks and the misconceptions they confront (by the figure's current keys)

| ask key | story · chapter | options (index) → misconception |
|---|---|---|
| `commit` | every story · Copying the log | 0 "No: all N servers must have it first" → `m-all`; 1 right; 2 "Yes: it was safe once S1 wrote it" → `m-written` |
| `survive` | crash · Re-election | 0 "No: it was lost with S1" → `m-lost`; 1 right; 2 "Only if the client sends it again" → `m-lost` |
| `minority` | partition · The network splits | 0 "Yes: S1 is still the leader" → `m-boss`; 1 right; 2 "Yes: once S2 confirms it" → `m-boss` (a leader plus one copy is still not most) |
| `heal` | partition · Heal | 0 "S1 copies it to everyone" → `m-boss`; 1 right; 2 "It counts, because S1 led first" → `m-boss` |

The crash story asks `commit` and `survive`; the partition story asks `commit`, `minority` and `heal` (at the cap of 3).

## Expert nuances for `deeper`

- First commit (how, source §5.4.2 / Figure 8): a leader counts copies only of its own term's entries. An old-term
  entry stored on a majority can still be overwritten by a later leader; once a current-term entry commits, every
  entry before it is committed by the Log Matching property. The run's `nop` (§8) makes this happen at once.
- First win (edge, §5.4.1): "up to date" compares the last entry's term first, then length: a longer log ending in an
  older term loses to a shorter one ending in a newer term.
- Followers' commit (how): followers learn the commit index only from the next update's `leaderCommit`, so a follower
  can hold a committed entry and still show it dim until then.
- Catch-up (edge, Gjengset's guide): truncate only at the first conflicting entry. An old, reordered update must never
  cut entries a follower already matched. The run does this; the code panel's `replace_from` line reads as if it
  always truncates (see "Notes on the run").
- Catch-up (how): the paper steps back one entry per rejected update; the run jumps straight to the follower's last
  entry + 1; real systems also send the conflicting term to skip a whole term at once (§5.3, end).
- Restart (how, Figure 2): term, vote and log must reach stable storage before a server replies; the commit index is
  volatile, which is why the restarted server is "unsure".
- New leader / Heal (real, thesis §9.6): a server cut off alone keeps timing out and raising its term; on rejoining it
  forces the healthy leader to step down. Pre-Vote and CheckQuorum (etcd, Consul) prevent this.
- Stranded leader (edge, §8): it can still answer reads with stale data unless it first confirms it leads with a
  round of heartbeats, or uses a lease.
- Client retry (edge, §8): a retried command can be applied twice; Raft needs client ids and serial numbers to apply
  each command once. The run avoids duplicates only by looking the command up in the leader's log.
- Timing (real): the paper suggests 150–300 ms timeouts; etcd defaults to a 100 ms heartbeat and a 1000 ms timeout,
  sized to network round trips and disk syncs.
- A ten-year practitioner might not know: Figure 8 is also why a freshly elected leader cannot serve linearizable
  reads until its own `nop` commits (§8: it must first learn which entries are committed).

## Why this ladder

Election first, because one writer is what makes "the same order" possible; then copying, where the aha (a majority,
not all) sits at the first commit. Each failure story adds three chapters that show the two safety properties at
work: the crash shows overlapping majorities plus the vote check, the split shows that a leader without a majority is
powerless and that the newer term decides. Agreement closes every story on the same promise.

## Notes on the run

- The code panel line `self.log.replace_from(m.prev_index + 1, m.entries)   # drop conflicts, append` reads as an
  unconditional truncate; the simulation correctly truncates only from the first conflicting entry. Consider
  `self.log.merge(m.prev_index + 1, m.entries)   # cut only at a conflict`, or a `deeper.edge` that says so.
- The four asks have no `id` yet (`s.ask(q, options, answer, { why })`); the teacher needs those ids for `asks`.
- No chapter has an `id` yet (`s.phase(name, { about })`), and the payoff step and `ctx.say` captions have none.
- `node` is used once (Heal about); the term fails use-it-or-lose-it.
