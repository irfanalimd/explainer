// The words the Raft figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure owns every
// fact and passes it as a var; nothing here computes. Every line stays true at every knob value (3–7 servers, any
// message delay, lost messages, any commands): a step the network runtime merges into a shape a line can't word
// (`moves` lists every move a caption says) is guarded by `when` and falls back to the figure's own caption.
// Paper references are to Ongaro & Ousterhout, "In Search of an Understandable Consensus Algorithm (Extended
// Version)", USENIX ATC 2014: a leader commits only by counting copies of its own term's entries (§5.4.2, Figure 8),
// and a new leader's blank `nop` carries older entries with it (§8).
//   run-wide    N, majority, commands, serverIds; every step also has moves (the ids its caption says)
//   chorus      who (markup: listed, or counted from 4), whoIds, n: the servers a merged line names (for vote.denied, vote.late, reply.* the senders)
//   election    min, max (elect.start); term (elect.timeout, elect.tie); cand, candId, term, cutIds (elect.cut-off)
//   votes       cand, candId + term, stepped (vote.grant); term, own (vote.old); same (vote.taken); votes, need
//               (vote.denied, vote.tally); leads (vote.late)
//   a win       leader, leaderId, term, votes + noop (elect.win) or kept (reelect.win)
//   updates     from, fromId + entries, first, last (update.copy; update.copy-commit + commit when it says one); cut
//               (update.replace, + downWho, downIds, term, was when the old leader steps down in the same step);
//               commit (update.learn); term, own (update.old); index, term (update.gap); term, was, downWho (update.step-down)
//   replies     leader, leaderId (reply.match, reply.old); who, whoId, missing, next (update.back)
//   commit      leader, leaderId, cmd, index, have, more (commit.majority; commit.older + older); who, whoId, cmd, held
//               (split.no-majority)
//   client      cmd + leader, leaderId (client.send, client.retry + after); who, whoId, hint?, hintId? (client.refused);
//               leaderId (client.done; client.done-next + nextCmd, leader)
//   pairs       client.done-next, update.copy-down (+ downWho, downIds, term), vote.grant-taken (+ takenWho, takenIds):
//               two moves that often share a step, worded as one
//   heartbeats  who, whoIds, n: one leader (beat.send, beat.resend + leader, leaderId, behindIds) or two (*-many)
//   leader      leader, leaderId, cmd, index (command.add, split.add + cutIds); committed (command.again); held, term (stuck.old)
//   failures    who, whoId, leader (crash.down); who, whoId, entries (catchup.restart); sideA, sideB (split.cut)
//   the end     upIds, up, log (agree.same); committed, whoId (agree.where)
// A layer that states a fact about real systems names its source in `deeper.source` as [id] plus a locator; the ids are
// `lesson.sources`. The quotes and section numbers were checked against the paper and the thesis themselves.

// a step whose caption says exactly these moves (in any order): a merged step says more than one line can word
const only = (...ids) => (v) => Array.isArray(v.moves) && v.moves.length === ids.length && ids.every((id) => v.moves.includes(id));

export const lesson = {
  sources: [
    { id: "ongaro2014", title: "In Search of an Understandable Consensus Algorithm (Extended Version)", by: "D. Ongaro, J. Ousterhout", year: 2014,
      where: "USENIX ATC 2014", url: "https://raft.github.io/raft.pdf",
      supports: "terms and elections with 150–300 ms random timeouts (§5.2, §9.3), log matching and backing up, with the conflict-term shortcut (§5.3), the vote check and commitment rule (§5.4, Figure 8), the timing rule (§5.6), the leader's no-op, client serial numbers and reads (§8), persistent state (Figure 2), the example log of x←3, y←7, x←5 (Figure 6)" },
    { id: "ongaro-thesis", title: "Consensus: Bridging Theory and Practice", by: "D. Ongaro", year: 2014, where: "PhD thesis, Stanford University",
      url: "https://github.com/ongardie/dissertation",
      supports: "a leader steps down after an election timeout without heartbeats reaching a majority (§6.2); Pre-Vote, against a rejoining server's disruption (§9.6)" },
    { id: "gjengset", title: "Students' Guide to Raft", by: "J. Gjengset", year: 2016, where: "MIT 6.824 teaching notes",
      url: "https://thesquareplanet.com/blog/students-guide-to-raft/",
      supports: "the commit index from the last new entry, when to reset the election timer, cutting the log only on a conflict, accelerated backtracking by log length" },
    { id: "etcd-tuning", title: "Tuning", by: "etcd", year: 2023, where: "etcd v3.5 documentation", url: "https://etcd.io/docs/v3.5/tuning/",
      supports: "a 100 ms heartbeat and a 1000 ms election timeout by default, both sized by the round trip between members" },
    { id: "etcd-raft", title: "etcd-io/raft: raft.go and README", by: "etcd", year: 2024, where: "etcd's Raft library", url: "https://github.com/etcd-io/raft",
      supports: "the PreVote and CheckQuorum options; CockroachDB, TiKV and etcd among its users" },
    { id: "raft-site", title: "The Raft Consensus Algorithm", by: "D. Ongaro et al.", year: 2024, where: "raft.github.io", url: "https://raft.github.io/",
      supports: "the list of Raft implementations, Consul's among them" },
  ],

  goal: "Keep one list of commands identical on every server, even when servers crash or the network splits.",

  objectives: [
    { id: "o-elect", text: "Explain how one leader is chosen: a random timer, then votes from a majority, at most one leader per term." },
    { id: "o-commit", text: "Predict when an entry is committed: once the leader hears that a majority, not every server, stores it." },
    { id: "o-survive", text: "Explain why a committed entry survives the leader's crash: any two majorities share a server, and voters refuse a less complete log." },
    { id: "o-split", text: "Predict what a leader cut off with too few servers can commit, and what happens to its entries when the network joins up." },
    { id: "o-own", text: "Explain why a new leader writes an empty entry of its own term before older entries can count." },
  ],

  misconceptions: [
    { id: "m-all", wrong: "An entry is safe only once every server has stored it.",
      fix: "A majority is enough: any later majority shares a server with it, so the entry can never be outvoted." },
    { id: "m-written", wrong: "An entry is safe as soon as the leader writes it in its own log.",
      fix: "Alone, the leader can crash and take it along. It counts only once a majority stores it." },
    { id: "m-lost", wrong: "When the leader crashes, its entries are lost and the client must send them again.",
      fix: "A committed entry sits on a majority, and only a server holding it can win the next vote." },
    { id: "m-boss", wrong: "Whoever is leader can make an entry count, and the one that led first wins.",
      fix: "A leader needs a majority to commit. Cut off from it, it commits nothing, and a newer term's leader decides." },
  ],

  picture: {
    name: "a group keeping one shared notebook",
    rows: [
      { id: "copy", picture: "each person's copy of the notebook", real: "a server's log", term: "log" },
      { id: "line", picture: "one line in the notebook", real: "an entry: one command and its term", term: "entry" },
      { id: "taker", picture: "the elected note-taker", real: "the leader", term: "leader" },
      { id: "round", picture: "which vote this is", real: "the term, an election round number", term: "term" },
      { id: "most", picture: "“most of us have copied it”", real: "a majority, such as 3 of 5", term: "majority" },
      { id: "counts", picture: "a line that counts", real: "a committed entry", term: "commit" },
      { id: "here", picture: "the note-taker's “still here”", real: "a heartbeat", term: "heartbeat" },
    ],
    breaks: "People in one room hear each other at once. Servers learn only from messages, which can arrive late or never, so a cut-off leader can go on believing it leads.",
  },

  terms: {
    log: { lead: "a copy of the notebook", def: "A server's list of commands, in order. Every server keeps its own copy." },
    term: { lead: "an election round", def: "An election round number. Each new election raises it, and a newer round beats an older one." },
    leader: { lead: "the note-taker", def: "The one server that decides what goes into the list. The others copy what it sends." },
    majority: { lead: "more than half", def: "More than half of all the servers, such as 3 of 5 or 4 of 7." },
    client: { lead: "the program sending commands", def: "The program outside the servers that sends commands, such as x←3, to be saved." },
    entry: { lead: "one line", def: "One line of the list: one command, such as x←3, with the round it was written in." },
    commit: { lead: "make it count", def: "Made final once most servers store it. A leader counts copies only of its own round's entries." },
    heartbeat: { lead: "a “still here” message", def: "A short message the leader sends at a steady interval, so no server starts an election." },
    partition: { lead: "a split in the network", def: "A break in the network that leaves groups of servers unable to hear each other." },
  },

  chapters: {
    elect: {
      about: "Think of a group keeping one shared notebook. If everyone wrote at once, the copies would disagree, so they elect one note-taker, the {term:leader}. Servers do the same, by vote.",
      enter: {
        sofar: "One program can keep a list of commands. But if its machine crashes, the list is gone.",
        now: "Keep a copy on each of {N} servers, and first elect one of them to write.",
        done: "One server collects votes from more than half of the {N}.",
        picture: true,
      },
    },
    copy: {
      about: "Like a note-taker reading out each new line, the leader writes each command into its log, after a blank `nop` of its own, and sends copies. A line counts once most servers store it, not all.",
      enter: {
        sofar: "One server won the vote. But no command has been saved yet.",
        now: "The winner leads: it writes each command and sends copies to the rest.",
        done: "An entry lights up on the leader once a majority holds it, before all {N} do.",
      },
    },
    crash: {
      about: "The leader stops. The others stop hearing its {term:heartbeat|heartbeats}, its “still here” messages, so for a while nobody leads. Nothing committed is lost: a majority still holds it.",
      enter: {
        sofar: "Entries count once a majority stores them. But the leader is one machine, and machines crash.",
        now: "Crash the leader partway through copying a command.",
        done: "Its light goes out, and a majority still holds every committed entry.",
      },
    },
    reelect: {
      about: "A server's timer runs out and it runs in the next term. Voters back only a log at least as complete as their own, so the winner holds every committed entry.",
      enter: {
        sofar: "Nobody leads. But a majority still holds every committed entry.",
        now: "Let a timer run out: a new vote, in the next term.",
        done: "The winner's log still holds every committed entry.",
      },
    },
    catchup: {
      about: "The crashed server restarts with the log it saved on disk. The leader's updates find where the two logs agree, then fill in what it missed.",
      enter: {
        sofar: "The new leader carries on. But the crashed server has missed entries.",
        now: "Bring it back, and let the leader fill in its log.",
        done: "Its log matches the leader's, entry for entry.",
      },
    },
    split: {
      about: "The network splits in two, a {term:partition}. The leader is stuck on the smaller side, with too few servers for a majority, so nothing it adds can be committed.",
      enter: {
        sofar: "Entries count once a majority stores them. But so far every server could hear every other.",
        now: "Split the network, leaving the leader on the smaller side.",
        done: "The leader's new entry stays dim: too few servers hold it.",
      },
    },
    lead: {
      about: "On the bigger side a timer runs out, and its server wins a newer term. Commands are committed there again, while the old leader still thinks it leads.",
      enter: {
        sofar: "The cut-off leader can't commit anything. But it still thinks it leads.",
        now: "The bigger side elects a leader in a newer term.",
        done: "Commands are committed again, on the bigger side.",
      },
    },
    heal: {
      // no "node" here: the word would be used once and never again
      about: "The network joins up again, so every server hears every other. The old leader sees the newer term and steps down, and its uncommitted entries are replaced.",
      enter: {
        sofar: "Two servers think they lead, in different terms.",
        now: "Join the network up again.",
        done: "The old leader steps down, and its dim entry is replaced.",
      },
    },
    // with noop: false only (the Figure 8 tests and old links); no knob or story sets it
    stuck: {
      about: "A leader may count copies only of entries from its own term. Without a blank entry of its own, an older one can never be committed, even on a majority.",
      enter: {
        sofar: "A new leader holds an older entry on a majority.",
        now: "Watch it try to count that entry.",
        done: "It never lights: no entry of the leader's own term comes after it.",
      },
    },
    agree: {
      about: "Line up every server's committed entries. Raft promises they agree, entry for entry, whatever crashed or split along the way.",
      enter: {
        sofar: "Each command counted once a majority stored it, whatever failed along the way.",
        now: "Compare every server's committed entries.",
        done: "Every server's lit entries read the same, in the same order.",
      },
    },
  },

  steps: {
    // ---- Election ----
    "elect.start": {
      key: true,
      plain: "Each of {N} servers keeps a {term:log} and starts a random {min}–{max} ms timer.",
      why: "Random timers mean that, in most runs, one server runs out first and asks to lead before anyone else.",
      look: ["{serverIds}"], picture: "copy",
      deeper: {
        how: "The timer is the election timeout. Hearing nothing from a leader before it runs out, a server assumes there is none. The paper suggests {min}–{max} ms (§9.3): random, so two servers rarely run out together.",
        real: "etcd defaults to a 100 ms heartbeat and a 1000 ms election timeout. Its guide sets the heartbeat near the round trip between servers, and the timeout at least 10 times that round trip.",
        source: "[ongaro2014] §5.2, §9.3; [etcd-tuning]",
      },
    },
    "elect.timeout": {
      when: only("elect.timeout"),
      first: {
        key: true,
        why: "Hearing from no leader, a server assumes there is none and asks the others to pick it.",
        picture: "round",
        deeper: {
          how: "It adds 1 to its term, becomes a candidate (a server asking for votes), votes for itself, and asks every other server, sending the term and index of its last entry (§5.2).",
          code: "`self.term += 1; self.voted_for = self.id` (lines 1–4)",
          source: "[ongaro2014] §5.2",
        },
      },
      plain: "{who}'s timer runs out first: it runs for leader in {term:term} {term}, voting for itself.",
      look: ["{whoIds}"],
    },
    "elect.tie": {
      when: only("elect.tie"),
      first: {
        why: "Each votes for itself first, so the others' votes may split and nobody reaches a majority.",
        deeper: {
          edge: "A split vote ends the term with no leader. Each candidate restarts its timer at a new random length, so the next election is unlikely to split again (§5.2).",
          source: "[ongaro2014] §5.2",
        },
      },
      plain: "{who} time out together, each running in term {term}.",
      look: ["{whoIds}"],
    },
    "elect.cut-off": {
      when: only("elect.cut-off"),
      first: {
        why: "It hears nothing from a leader, so it runs, even though the old leader is still alive.",
        deeper: {
          edge: "A server cut off alone would time out again and again, raising its term each time. When it rejoins, its high term forces a healthy leader to step down. Pre-Vote, where a server first asks whether it could win, prevents this (thesis §9.6); etcd's Raft library offers it as an option, PreVote.",
          source: "[ongaro-thesis] §9.6; [etcd-raft]",
        },
      },
      plain: "{cand}'s timer runs out: it runs in term {term}, cut off from {count:cutIds|server}.",
      look: ["{candId}"],
    },
    "vote.grant": {
      when: (v) => only("vote.grant")(v) && v.n >= 2 && !v.stepped,
      first: {
        key: true,
        why: "Its own vote counts too. Each server votes once per term, and never for a less complete log.",
        picture: "most",
        deeper: {
          how: "A voter compares last entries: a later term wins; with equal terms, the longer log wins (§5.4.1). It grants only if it hasn't voted for anyone else this term.",
          code: "`log_ok = (m.last_term, m.last_index) >= (self.last_term(), self.last_index())` (line 8)",
          edge: "A longer log can lose. One ending in an older term counts as less complete than a shorter one ending in a newer term.",
          source: "[ongaro2014] §5.4.1",
        },
      },
      plain: "{count:n|server} send {cand} a vote. It needs a {term:majority}: {majority} of {N}.",
      look: ["{candId}", "{whoIds}"],
    },
    "vote.grant-taken": {
      when: (v) => only("vote.grant", "vote.taken")(v) && !v.stepped,
      plain: "{cand} gets {count:n|vote}, from {who}; {takenWho} already voted this term.",
      why: "Each server votes once per term. {cand} needs a {term:majority}: {majority} of {N}, its own vote included.",
      look: ["{candId}", "{whoIds}"],
    },
    // with message loss on (1 in 20 or 1 in 10) and some seeds: a request from an older term arrives late
    "vote.old": {
      when: only("vote.old"),
      first: { why: "A request from an older term comes from an election that is already over." },
      plain: "{who} {be:n} on term {own}, so {cand}'s term-{term} request gets no vote.",
      look: ["{candId}"],
    },
    "vote.taken": {
      when: only("vote.taken"),
      first: {
        why: "One vote per server per term is what stops two leaders in one term.",
        deeper: {
          how: "The vote is written to disk before the reply goes out (Figure 2). Otherwise a server could crash, restart and vote again in the same term.",
          source: "[ongaro2014] Figure 2",
        },
      },
      plain: "{who} already voted this term, so {cand} gets no vote there.",
      look: ["{candId}"],
    },
    "vote.behind": {
      when: only("vote.behind"),
      first: {
        why: "This is the check that keeps committed entries: a candidate missing one can't win.",
        deeper: {
          how: "Every committed entry sits on a majority, and every winner needs a majority, so some voter holds the entry and refuses a log without it (§5.4.1).",
          source: "[ongaro2014] §5.4.1",
        },
      },
      plain: "{cand} gets no vote from {who}: they hold a more complete log.",
      look: ["{candId}"],
    },
    "vote.denied": {
      when: only("vote.denied"),
      plain: "{cand} is turned down by {who}; it has {votes} of the {need} votes it needs.",
      look: ["{candId}"],
    },
    "vote.tally": {
      when: only("vote.tally"),
      first: { why: "Votes arrive one by one; it wins the moment it holds {need}." },
      plain: "{cand} has {votes} of the {need} votes it needs.",
      look: ["{candId}"],
    },
    "vote.late": {
      when: (v) => only("vote.late")(v) && v.leads,
      plain: "{cand} already leads, so late votes from {who} change nothing.",
      look: ["{candId}"],
    },
    "elect.win": {
      when: (v) => only("elect.win")(v) && v.noop,
      first: {
        key: true,
        why: "{votes} of {N} is more than half. Two such groups share a server, so term {term} gets one leader.",
        picture: "taker",
        deeper: {
          how: "Votes count with the candidate's own. Two majorities of {N} share at least one server, and it votes only once per term, so no term ever has two leaders (§5.2).",
          code: "`if len(self.votes) > N // 2: self.become_leader()` (line 15)",
          edge: "The blank `nop` is there because a new leader learns which older entries are final only once an entry of its own term is stored on a majority. A blank one gets there at once (§8).",
          source: "[ongaro2014] §5.2, §8",
        },
      },
      plain: "{leader} wins term {term} once {votes} of {N} votes arrive. It logs a `nop`.",
      look: ["{leaderId}"],
    },
    "reelect.win": {
      key: true,
      plain: "{leader} wins term {term} once {votes} of {N} votes arrive. Its log still has {kept}.",
      why: "Every majority includes a server holding {kept}, and that server refuses any log without it.",
      look: ["{leaderId}"],
      deeper: {
        how: "{kept} was on a majority. Any {majority} voters of {N} include one of them, and the vote check refused every log missing it (§5.4.1).",
        edge: "{leader} doesn't know {kept} is committed: that news crashed with the old leader. A new leader counts copies only of its own term's entries; an older entry, even on a majority, can still be overwritten (Figure 8). It becomes final only when a newer entry after it commits.",
        source: "[ongaro2014] §5.4.1, §5.4.2, Figure 8",
      },
    },
    "term.newer": {
      when: only("term.newer"),
      first: { why: "A newer term means a newer election happened; an older leader or candidate gives way at once." },
      plain: "{who} sees term {term} in {from}'s reply and steps down.",
      look: ["{whoId}"],
    },

    // ---- Copying the log ----
    "client.send": {
      when: only("client.send"),
      first: { why: "Only the leader adds commands, so every server's list gets them in one order." },
      plain: "The {term:client} sends {cmd} to {leader}, the leader it knows.",
      look: ["client", "{leaderId}"],
    },
    "update.copy": {
      when: only("update.copy"),
      first: {
        why: "The other servers decide nothing: they store what the leader sends, in its order.",
        picture: "line",
        deeper: {
          how: "Each update names the entry just before the new ones, by index and term. A follower accepts only if its own log has that entry, so a match there means the two logs agree all the way back (the Log Matching property, §5.3).",
          source: "[ongaro2014] §5.3",
        },
      },
      plain: "{entries} is copied to {who} as {term:entry} {first}.",
      look: ["{whoIds}"],
    },
    "update.copy-down": {
      when: only("update.copy", "update.step-down"),
      plain: "{entries} is copied to {who} as {term:entry} {first}. {downWho} steps down: {from} leads term {term}.",
      why: "An update from a leader of its own term, or a newer one, tells a candidate or an old leader the election is over.",
      look: ["{whoIds}", "{downIds}"],
    },
    "update.copy-commit": {
      when: (v) => only("update.copy-commit")(v) && v.commit !== undefined,
      first: {
        why: "One update carries both: new entries, and how far the leader has committed.",
        deeper: {
          how: "Every update carries the leader's commit index. A follower marks entries committed up to that index, but never past the last entry this update gave it.",
          code: "`self.commit = max(self.commit, min(m.leader_commit, m.prev_index + len(m.entries)))` (line 26)",
          source: "[ongaro2014] Figure 2",
        },
      },
      plain: "{entries} {be:entries} copied to {who}, and up to {term:entry} {commit} is marked committed.",
      look: ["{whoIds}"],
    },
    "command.add": {
      when: only("command.add"),
      first: {
        why: "Written on the leader alone, {cmd} doesn't count yet: one crash could take it.",
        deeper: {
          real: "The commands are the paper's own kind: its example log (Figure 6) is a list of assignments like x←3, y←7 and x←5. Applied in order, they leave every copy with the same variables.",
          source: "[ongaro2014] Figure 6",
        },
      },
      plain: "{leader} adds {cmd} to its log as {term:entry} {index} and sends copies.",
      look: ["{leaderId}"],
    },
    "reply.match": {
      when: only("reply.match"),
      first: { why: "Each reply tells {leader} how far that log matches; it counts them to find a majority." },
      plain: "{who} {be:n} now in step with {leader}'s log.",
      look: ["{whoIds}"],
    },
    "commit.majority": {
      // entries of the leader's own term (an older one is commit.older)
      when: only("commit.majority"),
      first: {
        key: true,
        why: "Any two majorities of {N} share a server, so every later majority includes a server holding it.",
        picture: "counts",
        deeper: {
          cost: "Each entry costs an update to every other server and a reply from each. {leader} commits as soon as the fastest replies make {have} copies, so one slow server never holds it up.",
          how: "A leader counts copies only of entries from its own term. An older entry on a majority can still be overwritten by a later leader (§5.4.2, Figure 8). Once an entry of the current term commits, every entry before it commits too.",
          code: "`if n > self.commit and self.log[n].term == self.term: self.commit = n` (lines 35–36)",
          source: "[ongaro2014] §5.4.2, Figure 8",
        },
      },
      plain: "{leader} hears {cmd} is on {have} of {N}, a {term:majority}: it {term:commit|commits} it.",
      look: ["{leaderId}"],
    },
    "commit.older": {
      when: only("commit.older"),
      key: true,
      plain: "{leader} hears {cmd} is on {have} of {N}: it commits it, and the older {older} with it.",
      why: "A leader counts copies only of its own term's entries. {older} is older, so it commits only with {cmd}, which comes after it.",
      look: ["{leaderId}"],
      deeper: {
        how: "In the paper's Figure 8, an entry from an older term sits on a majority and is still overwritten by a later leader. So a leader commits only entries of its own term by counting copies; every entry before one of those commits with it (§5.4.2).",
        code: "`if n > self.commit and self.log[n].term == self.term: self.commit = n` (lines 35–36)",
        edge: "Once {cmd} is on a majority, no server missing it can win a vote, and {cmd} sits after {older} in every log that holds it. So {older} can no longer be overwritten either (§5.4.3).",
        source: "[ongaro2014] §5.4.2, §5.4.3, Figure 8",
      },
    },
    "client.done-next": {
      when: only("client.done", "client.next"),
      first: {
        why: "The leader answers only after a commit, so an answer means the command is safe.",
        deeper: {
          how: "The leader applies the entry to its own copy of the data, then answers the client. Followers apply it once they learn it is committed (§5.3).",
          source: "[ongaro2014] §5.3",
        },
      },
      plain: "The client hears {cmd} is committed, and sends {nextCmd} to {leader}.",
      look: ["client", "{leaderId}"],
    },
    "client.done": {
      when: only("client.done"),
      first: { why: "An answer comes only after a commit: {cmd} is on a majority and can't be lost." },
      plain: "The client hears {cmd} is committed.",
      look: ["client"],
    },
    "update.learn": {
      when: only("update.learn"),
      first: {
        why: "The others learn of a commit only from the leader's next message, so their entries light up later.",
        deeper: {
          how: "A follower takes the smaller of the leader's commit index and the index of the last entry this update gave it.",
          code: "`self.commit = max(self.commit, min(m.leader_commit, m.prev_index + len(m.entries)))` (line 26)",
          edge: "Not the follower's last log index: entries past this update may be stale ones from an old leader, not yet checked against this one. Taking the last index is a common student bug (Gjengset).",
          source: "[ongaro2014] Figure 2; [gjengset]",
        },
      },
      plain: "{from} tells {who}: everything up to entry {commit} is committed.",
      look: ["{whoIds}"],
    },
    "beat.send": {
      when: only("beat.send"),
      first: {
        why: "A server that stops hearing them assumes the leader is gone, and runs for leader.",
        picture: "here",
        deeper: {
          how: "A heartbeat is an update with no entries. The timing rule is: the time to reach every server ≪ the election timeout ≪ the time between crashes (§5.6).",
          real: "etcd sends a heartbeat every 100 ms by default, against a 1000 ms election timeout.",
          source: "[ongaro2014] §5.2, §5.6; [etcd-tuning]",
        },
      },
      plain: "{who} sends {term:heartbeat|heartbeats}, “still here” messages, so no timer runs out.",
      look: ["{whoIds}"],
    },
    // two leaders heartbeating in one step: none of 2,592 settings tried reaches it (a stranded leader resends instead)
    "beat.send-many": {
      when: only("beat.send-many"),
      plain: "{who} each still lead, in different terms, and both send heartbeats.",
      why: "The old leader hasn't heard of the newer term yet; its first reply from a newer-term server will tell it.",
      look: ["{whoIds}"],
    },
    "update.beat": {
      when: only("update.beat"),
      first: {
        plain: "{from}'s {term:heartbeat}, a “still here” message, restarts the timer on {who}.",
        why: "While heartbeats keep coming, no other server runs for leader.",
        picture: "here",
        deeper: {
          edge: "Restart the timer only on an update from the current leader, or when granting a vote. Restarting it on every message, old ones included, is a common bug (Gjengset).",
          source: "[gjengset]",
        },
      },
      plain: "{from}'s heartbeat restarts the election timer on {who}.",
      look: ["{whoIds}"],
    },
    "beat.resend": {
      when: only("beat.resend"),
      first: {
        why: "A leader keeps retrying a server that is behind, even one that was down, until their logs match.",
        deeper: { how: "Raft retries forever: every heartbeat to a server that is behind carries the entries it lacks (§5.3).", source: "[ongaro2014] §5.3" },
      },
      plain: "{leader} resends missing entries to {count:behindIds|server} that fell behind.",
      look: ["{behindIds}"],
    },
    "beat.resend-many": {
      when: only("beat.resend-many"),
      plain: "{who} each still lead, in different terms, and resend missing entries.",
      why: "The old leader never heard of the newer term: no message crossed the split.",
      look: ["{whoIds}"],
    },

    // ---- Crash ----
    "crash.down": {
      when: (v) => only("crash.down")(v) && v.leader,
      key: true,
      plain: "Leader {who} {tone:fail|crashes}. Its log is saved on disk, so it survives.",
      why: "Every committed entry is also on a majority, so this crash loses nothing that counted.",
      look: ["{whoId}"],
      deeper: {
        how: "Before replying to anyone, a server writes its term, its vote and its log to disk (Figure 2). Which entries are committed it keeps only in memory.",
        edge: "Any {majority} of the {N} servers can carry on alone. With fewer up, nothing new commits until enough come back.",
        source: "[ongaro2014] Figure 2",
      },
    },
    "net.down": {
      first: { why: "A sender can't tell a crash from a slow network: either way it hears nothing back." },
      plain: "Messages sent to a crashed server are {tone:fail|lost}.",
    },
    "client.wait": {
      when: only("client.wait"),
      first: { why: "With the leader down, nobody adds commands until a new leader is elected." },
      plain: "No answer for {cmd}, and no leader to ask: the client waits.",
      look: ["client"],
    },

    // ---- Re-election ----
    "client.retry": {
      when: only("client.retry"),
      first: {
        why: "The client can't tell a slow leader from a lost one, so it tries again.",
        deeper: {
          how: "It waits {after} ms: long enough for a new leader to be elected and heard from.",
          edge: "A retry can put a command in the log twice if the first copy survives too. Raft gives each client command a serial number, so a server applies it once (§8). This run avoids duplicates only by looking the command up in the leader's log.",
          source: "[ongaro2014] §8",
        },
      },
      plain: "No answer for {cmd} in {after} ms: the client resends it, to {leader}.",
      look: ["client", "{leaderId}"],
    },
    "command.again": {
      when: (v) => only("command.again")(v) && !v.committed,
      first: {
        "why@partition": "The retry reaches the same cut-off leader, so {cmd} still can't reach a majority.",
      },
      plain: "{leader} already has {cmd} as entry {index}; it waits for a majority.",
      look: ["{leaderId}"],
    },
    "command.again@crash": {
      when: (v) => only("command.again")(v) && !v.committed,
      key: true,
      plain: "{leader} already has {cmd} as entry {index}, from an older term: it waits.",
      why: "A leader counts copies only of its own term's entries, so {cmd} must wait for one.",
      look: ["{leaderId}"],
      deeper: {
        how: "An older-term entry on a majority is not yet safe: in the paper's Figure 8, such an entry is overwritten by a later leader. It becomes final when an entry of the current term after it commits (§5.4.2). The leader's `nop` is that entry.",
        edge: "Until its `nop` commits, a new leader doesn't know which entries are committed, so it can't safely answer reads either (§8).",
        source: "[ongaro2014] §5.4.2, §8, Figure 8",
      },
    },

    // ---- Catch-up ----
    "catchup.restart": {
      when: only("catchup.restart"),
      key: true,
      plain: "{who} {tone:ok|restarts} with its {count:entries|entry|entries}, unsure which are committed.",
      why: "Its log survived on disk, but which entries count was kept only in memory.",
      look: ["{whoId}"],
      deeper: {
        how: "The term, the vote and the log are on disk (Figure 2); the commit index is not. The leader's next update tells it.",
        source: "[ongaro2014] Figure 2",
      },
    },
    "update.gap": {
      when: only("update.gap"),
      first: { why: "Its log doesn't match the leader's at that point, so it can't take what comes after." },
      plain: "{who} {be:whoIds} missing entry {index} from term {term}, so the update is refused.",
      look: ["{whoIds}"],
    },
    "update.back": {
      when: only("update.back"),
      first: {
        why: "The leader backs up until it finds where the two logs agree, then sends everything after.",
        deeper: {
          how: "The paper's basic rule backs up one entry per refusal (§5.3). Here the refusal also says how long the follower's log is, so the leader jumps straight to its last entry + 1, the shortcut the 6.824 students' guide teaches.",
          code: "`self.next[m.sender] = max(self.match[m.sender] + 1, min(m.prev, m.last + 1))` (lines 31–33)",
          edge: "The paper's own shortcut has the follower send the conflicting entry's term and the first index it holds for that term, so the leader skips a whole term of mismatched entries at once. The paper doubts it is needed, since failures are rare (§5.3).",
          source: "[ongaro2014] §5.3; [gjengset]",
        },
      },
      plain: "{who} {be:whoIds} missing entry {missing}, so {leader} steps back to entry {next} and resends.",
      look: ["{whoIds}"],
    },

    // ---- The network splits ----
    "split.cut": {
      when: only("split.cut"),
      key: true,
      plain: "A {term:partition} leaves the leader's side with {count:sideA|server}, the other with {count:sideB|server}.",
      why: "The leader's side has fewer than {majority} servers, so it can never gather a majority.",
      look: ["{sideA}"],
      deeper: {
        edge: "Neither side knows it is split: messages stop arriving, exactly as if the others had crashed.",
        real: "The thesis has a leader step down when an election timeout passes without a round of heartbeats reaching a majority (§6.2). etcd's Raft library calls this option CheckQuorum.",
        source: "[ongaro-thesis] §6.2; [etcd-raft]",
      },
    },
    "split.send": {
      first: {
        why: "It still thinks it leads: nothing tells it the others can't hear it.",
        deeper: {
          edge: "A cut-off leader could still answer reads with stale data. Raft has it first confirm it leads, by hearing from a majority, or rely on a time lease (§8).",
          source: "[ongaro2014] §8",
        },
      },
      plain: "Messages from {who} can't cross the split.",
      look: ["{whoIds}"],
    },
    "split.add": {
      when: only("split.add"),
      first: { why: "Nothing tells {leader} it is cut off, so it takes commands as before." },
      plain: "{leader} adds {cmd} as entry {index}, but its copies can't cross the split.",
      look: ["{leaderId}"],
    },
    "split.no-majority": {
      when: only("split.no-majority"),
      key: true,
      plain: "{who} stores {cmd}: {held} of {N} servers, no majority. {leader} can't commit it.",
      why: "Leading isn't enough: without {majority} copies, a newer leader could still replace {cmd}.",
      look: ["{leaderId}", "{whoId}"],
      deeper: {
        how: "The commit rule only counts copies. A majority of {N} is {majority}, and the servers across the split can't add theirs.",
        edge: "This is why a stranded leader is harmless for writes. Its client hears nothing and retries, and a retry may reach a leader that can commit.",
        source: "[ongaro2014] §5.3, §5.4.2",
      },
    },
    "net.cut": {
      plain: "A message can't cross the split, and is {tone:fail|lost}.",
    },

    // ---- New leader ----
    "client.dup": {
      when: only("client.dup"),
      first: { why: "A new leader answers for every client command it commits, even one already answered." },
      plain: "The client already has an answer for {cmd}, so it ignores this one.",
      look: ["client"],
    },

    // ---- Heal ----
    "heal.join": {
      when: only("heal.join"),
      plain: "The split is over: every server can reach every other again.",
      why: "Messages cross again, so the old leader can finally learn of the newer term.",
      look: ["{serverIds}"],
    },
    "update.old": {
      when: only("update.old"),
      first: { why: "An update from an older term comes from a leader that has been replaced." },
      plain: "{who} {be:n} on term {own}, so {from}'s term-{term} update is refused.",
      look: ["{fromId}"],
    },
    "update.replace": {
      // with the old leader stepping down in the same step (the run's heal)
      when: (v) => only("update.replace", "update.step-down")(v) && v.was === "leader",
      key: true,
      plain: "{from} replaces {count:cut|uncommitted entry|uncommitted entries} on {who}. Old leader {downWho} steps down.",
      why: "Those entries never reached a majority, so they never counted; term {term}'s leader decides.",
      look: ["{whoIds}", "{downIds}"],
      deeper: {
        how: "A follower cuts its log only at the first entry whose term differs from the leader's, then adds the rest. Entries that match are never cut (§5.3).",
        code: "`if i <= self.last_index(): del self.log[i:]`, reached only past the entries it already has (lines 22–25)",
        edge: "Cutting on every update is a classic bug: a late, reordered update would erase entries the follower had already confirmed (Gjengset). The client never got an answer for the replaced command, so its retry is safe.",
        source: "[ongaro2014] §5.3; [gjengset]",
      },
    },
    "reply.old": {
      when: only("reply.old"),
      first: { why: "{leader} no longer leads, so replies to its old updates mean nothing." },
      plain: "{leader} ignores out-of-date replies from {who}.",
      look: ["{leaderId}"],
    },

    // ---- Stuck (only without the nop) ----
    // with noop: false only (the Figure 8 tests and old links); no knob or story sets it
    "stuck.old": {
      when: only("stuck.old"),
      key: true,
      plain: "{leader} has {cmd} on {held} of {N}, but from term {term}: it never counts.",
      why: "A leader counts copies only of its own term's entries, and none of its own is coming.",
      look: ["{leaderId}"],
      deeper: {
        how: "This is the gap §8 closes: a new leader writes a blank `nop` of its own term at once. When it commits, every older entry before it commits too.",
        edge: "Counting the old entry here would be unsafe: in Figure 8 an older entry on a majority is overwritten by a later leader.",
        source: "[ongaro2014] §5.4.2, §8, Figure 8",
      },
    },

    // ---- Agreement ----
    "agree.same": {
      when: (v) => v.up === v.N,
      key: true,
      plain: "All {N} servers hold the same committed log: {log}, in the same order.",
      why: "One leader set the order, and each entry counted only once a majority held it.",
      "why@crash": "The crash cost time, not entries: the new leader already held every committed one.",
      "why@partition": "The cut-off leader's entry never counted, so it gave way without breaking the list.",
      look: ["{upIds}"],
      deeper: {
        how: "Apply the same commands in the same order and every copy ends in the same state: every server now has the same variables.",
        real: "etcd (behind Kubernetes), Consul and CockroachDB keep their data consistent with Raft.",
        source: "[raft-site]; [etcd-raft]",
      },
    },
    // with no client commands (an empty "Client commands" field): only the leader's nop is committed
    "agree.where": {
      plain: "Committed so far: {count:committed|entry|entries}.",
      look: ["{whoId}"],
    },
    "net.lost": {
      first: { why: "Networks lose messages. Raft never waits on one: the next heartbeat or timer sends again." },
      plain: "A message is {tone:fail|lost} on the way.",
    },
    "client.refused": {
      when: (v) => only("client.refused")(v) && !!v.hintId,
      plain: "{who} is not the leader: it turns {cmd} away, pointing at {hint}.",
      look: ["{whoId}"],
    },
    "client.redirect": {
      when: only("client.redirect"),
      plain: "The client hears that {who} is not the leader.",
      look: ["client"],
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "copy.commit": {
      question: "{leader} has heard that {cmd} is on {have} of the {N} servers, itself included. Can it count {cmd} as committed now?",
      options: [
        { misconception: "m-all",
          feedback: "If you thought every server must have it: then one crashed server would stall every command. {have} of {N} is enough, because any later majority includes one of these {have}." },
        { feedback: "Right. {have} of {N} is a majority, and any later majority shares a server with it, so {cmd} can't be outvoted." },
        { misconception: "m-written",
          feedback: "If you thought writing it was enough: alone on {leader}, {cmd} would vanish if {leader} crashed. It counts once {have} servers store it." },
      ],
    },
    "reelect.survive": {
      options: [
        { misconception: "m-lost",
          feedback: "If you thought a crash takes its entries along: {kept} also sits on a majority of servers. {leader} wins with {kept} in its log." },
        { feedback: "Right. Any {majority} voters include a server holding {kept}, and it refuses a log without it." },
        { misconception: "m-lost",
          feedback: "If you thought the client must resend it: the client was already told {kept} is committed, so it never sends it again. {leader}'s log already has it." },
      ],
    },
    "split.minority": {
      options: [
        { misconception: "m-boss",
          feedback: "If you thought being leader is enough: a leader needs {majority} copies. Only {held} of {N} servers hold {cmd}; the rest can't hear {leader}." },
        { feedback: "Right. A majority of {N} is {majority}, and across the split {cmd} can reach only {held}." },
        { misconception: "m-boss",
          feedback: "If you thought one confirmation does it: {who}'s copy makes {held}, still short of {majority}. A newer leader could replace {cmd}." },
      ],
    },
    "heal.replaced": {
      options: [
        { misconception: "m-boss",
          feedback: "If you thought the old leader carries on: its term is older, so the others refuse its updates, and it steps down instead." },
        { feedback: "Right. It never reached a majority, so it never counted. {from}, the leader of the newer term, decides what stays." },
        { misconception: "m-boss",
          feedback: "If you thought leading first wins: {from}'s term is newer, and an uncommitted entry has no claim. It is replaced." },
      ],
    },
  },
};
