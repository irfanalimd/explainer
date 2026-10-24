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
    { id: "o-elect", text: "Explain how one leader is chosen, with a random timer and votes from a majority, and why a term never has two." },
    { id: "o-commit", text: "Predict the moment an entry is committed, and explain why the leader doesn't wait for every server." },
    { id: "o-survive", text: "Explain why a committed entry survives the leader's crash, because any two majorities share a server and voters refuse a less complete log." },
    { id: "o-split", text: "Predict what a leader cut off with too few servers can commit, and what happens to its entries when the network joins up." },
    { id: "o-own", text: "Explain why a new leader writes an empty entry of its own term before older entries can count." },
  ],

  misconceptions: [
    { id: "m-all", wrong: "An entry is safe only once every server has stored it.",
      fix: "A majority is enough. Any later majority shares at least one server with it, so the entry can never be outvoted." },
    { id: "m-written", wrong: "An entry is safe as soon as the leader writes it in its own log.",
      fix: "While it sits on the leader alone, a crash of the leader would take it away. It counts only once a majority stores it." },
    { id: "m-lost", wrong: "When the leader crashes, its entries are lost and the client must send them again.",
      fix: "A committed entry sits on a majority of servers, and only a server that holds it can win the next vote." },
    { id: "m-boss", wrong: "Whoever is leader can make an entry count, and the one that led first wins.",
      fix: "A leader needs a majority to commit anything. Cut off from one, it commits nothing, and the leader of a newer term decides what stays." },
  ],

  picture: {
    name: "a group keeping one shared notebook",
    rows: [
      { id: "copy", picture: "each person's copy of the notebook", real: "a server's log", term: "log" },
      { id: "line", picture: "one line in the notebook", real: "an entry, which holds one command and its term", term: "entry" },
      { id: "taker", picture: "the elected note-taker", real: "the leader", term: "leader" },
      { id: "round", picture: "which vote this is", real: "the term, an election round number", term: "term" },
      { id: "most", picture: "“most of us have copied it”", real: "a majority, such as 3 of 5", term: "majority" },
      { id: "counts", picture: "a line that counts", real: "a committed entry", term: "commit" },
      { id: "here", picture: "the note-taker's “still here”", real: "a heartbeat", term: "heartbeat" },
    ],
    breaks: "People in one room hear each other straight away. Servers only learn things from messages, which can arrive late or not at all, so a leader that has been cut off can go on believing it still leads.",
  },

  terms: {
    log: { lead: "a copy of the notebook", def: "A server's list of commands, in order. Every server keeps its own copy." },
    term: { lead: "an election round", def: "An election round number. Each new election raises it, and a newer round always beats an older one." },
    leader: { lead: "the note-taker", def: "The one server that decides what goes into the list. The other servers copy what it sends." },
    majority: { lead: "more than half", def: "More than half of all the servers, such as 3 of 5 or 4 of 7." },
    client: { lead: "the program sending commands", def: "The program outside the servers that sends commands, such as x←3, to be saved." },
    entry: { lead: "one line", def: "One line of the list. It holds one command, such as x←3, and the round it was written in." },
    commit: { lead: "make it count", def: "Made final once most servers store it. A leader counts copies only of entries from its own round." },
    heartbeat: { lead: "a “still here” message", def: "A short message the leader sends at a steady interval, so that no server starts an election." },
    partition: { lead: "a split in the network", def: "A break in the network that leaves groups of servers unable to hear each other." },
  },

  chapters: {
    elect: {
      about: "Picture a group keeping one shared notebook. If everyone wrote whenever they liked, the copies would soon disagree, so the group picks one note-taker and copies what they write. Raft's servers hold a vote and elect a {term:leader}.",
      enter: {
        sofar: "A single program can keep a list of commands, but if its machine crashes, the list goes with it.",
        now: "So we keep a copy of the list on each of {N} servers, and the first job is to elect one of them to do the writing.",
        done: "One server has votes from more than half of the {N}.",
        picture: true,
      },
    },
    copy: {
      about: "Now the leader does the writing. It adds each command to its log and sends copies, starting with a blank {term:entry} called `nop`. An entry doesn't have to reach every server. Once most have stored it, it counts.",
      enter: {
        sofar: "A vote has been called and the replies are on their way. No command has been saved yet.",
        now: "Whoever wins writes each command into its log and sends copies to the rest.",
        done: "An entry lights up on the leader as soon as a majority holds it, before all {N} do.",
      },
    },
    crash: {
      about: "Now the leader stops dead. The others only notice because its {term:heartbeat|heartbeats}, short “still here” messages, stop arriving, and for a while nobody leads. Nothing committed is lost, because a majority still holds it.",
      enter: {
        sofar: "An entry counts once a majority stores it. The leader, though, is a single machine, and machines crash.",
        now: "We crash the leader while it's partway through copying a command.",
        done: "Its light goes out, and a majority still holds every committed entry.",
      },
    },
    reelect: {
      about: "Sooner or later a server's timer runs out, and it asks for votes in the next term. Voters only back a log at least as complete as their own, which guarantees the winner holds every committed entry.",
      enter: {
        sofar: "Nobody leads right now, but a majority still holds every committed entry.",
        now: "Wait for a timer to run out and a new vote to start, in the next term.",
        done: "The winner's log still holds every committed entry.",
      },
    },
    catchup: {
      about: "The crashed server comes back with the log it saved on disk, but it missed everything that happened while it was down. The leader finds the last point where their logs agree and fills in the rest.",
      enter: {
        sofar: "The new leader carries on, while the crashed server has missed some entries.",
        now: "Bring the crashed server back and let the leader fill in its log.",
        done: "Its log matches the leader's, entry for entry.",
      },
    },
    split: {
      about: "This time nothing crashes. Instead the network breaks in two, a {term:partition}. The leader ends up on the smaller side, with too few servers for a majority, so nothing it adds now can be committed.",
      enter: {
        sofar: "An entry counts once a majority stores it. Until now, though, every server could hear every other.",
        now: "Split the network so that the leader ends up on the smaller side.",
        done: "The leader's newest entry stays dim, because too few servers hold it.",
      },
    },
    lead: {
      about: "On the bigger side, the servers stop hearing from the leader. One of their timers runs out, and that server wins a newer term. Commands are committed there again, while the old leader still thinks it's in charge.",
      enter: {
        sofar: "The cut-off leader can't commit anything, yet it still thinks it leads.",
        now: "The bigger side elects a leader of its own, in a newer term.",
        done: "Commands are committed again on the bigger side.",
      },
    },
    heal: {
      // no "node" here: the word would be used once and never again
      about: "Then the network joins up and every server can hear every other again. The old leader sees the newer term and steps down, and the entries it added while cut off are replaced.",
      enter: {
        sofar: "Two servers think they lead, each in a different term.",
        now: "Join the network back together.",
        done: "The old leader steps down, and its dim entry is replaced.",
      },
    },
    // with noop: false only (the Figure 8 tests and old links); no knob or story sets it
    stuck: {
      about: "A leader may only count copies of entries from its own term. If it never writes an entry of its own, an older entry can sit on a majority and still never be committed.",
      enter: {
        sofar: "A new leader holds an older entry on a majority.",
        now: "Watch it try to count that entry.",
        done: "The entry never lights up, because no entry of the leader's own term comes after it.",
      },
    },
    agree: {
      about: "Finally, line up the committed entries from every server. Raft promises they match, entry for entry, whatever crashed or split along the way.",
      enter: {
        sofar: "Each command counted once a majority stored it, whatever failed along the way.",
        now: "Compare every server's committed entries.",
        done: "The lit entries read the same on every server, in the same order.",
      },
    },
  },

  steps: {
    // ---- Election ----
    "elect.start": {
      key: true,
      plain: "Each of {N} servers, S1 to S{N}, keeps a {term:log} and starts a random {min}–{max} ms timer.",
      why: "The timers are random on purpose. Usually one runs out well before the others, so a single server asks to lead while the rest are still waiting.",
      look: ["{serverIds}"], picture: "copy",
      deeper: {
        how: "This timer is the election timeout. If a server hears nothing from a leader before it runs out, it assumes there is none. The paper suggests {min}–{max} ms (§9.3), and the randomness makes it rare for two servers to run out at the same moment.",
        real: "etcd defaults to a 100 ms heartbeat and a 1000 ms election timeout. Its tuning guide sets the heartbeat close to the round-trip time between servers, and the election timeout to at least 10 times that round trip.",
        source: "[ongaro2014] §5.2, §9.3; [etcd-tuning]",
      },
    },
    "elect.timeout": {
      when: only("elect.timeout"),
      first: {
        key: true,
        why: "It has heard nothing from a leader, so it assumes there isn't one and asks the others to make it leader.",
        picture: "round",
        deeper: {
          how: "It adds 1 to its term and becomes a candidate, which is what a server asking for votes is called. It votes for itself, then asks every other server for a vote, sending the term and index of its last entry (§5.2).",
          code: "`self.term += 1; self.voted_for = self.id` (lines 1–4)",
          source: "[ongaro2014] §5.2",
        },
      },
      plain: "{who}'s timer runs out first, so it runs for leader in {term:term} {term} and votes for itself.",
      look: ["{whoIds}"],
    },
    "elect.tie": {
      when: only("elect.tie"),
      first: {
        why: "Each candidate votes for itself first, so the remaining votes can split between them and nobody reaches a majority.",
        deeper: {
          edge: "A split vote ends the term with no leader. Each candidate then restarts its timer with a new random length, which makes it unlikely that the next election splits too (§5.2).",
          source: "[ongaro2014] §5.2",
        },
      },
      plain: "{who} time out together, and each runs in term {term}.",
      look: ["{whoIds}"],
    },
    "elect.cut-off": {
      when: only("elect.cut-off"),
      first: {
        why: "No heartbeats reach it, so as far as it can tell there is no leader. It runs for election even though the old leader is alive and well.",
        deeper: {
          edge: "A server cut off on its own times out again and again and raises its term each time. When it rejoins, that high term forces a healthy leader to step down. Pre-Vote prevents this by having a server first ask whether it could win before it starts a real election (thesis §9.6). etcd's Raft library offers it as the PreVote option.",
          source: "[ongaro-thesis] §9.6; [etcd-raft]",
        },
      },
      plain: "{cand}'s timer runs out, and it runs in term {term}, cut off from {count:cutIds|server}.",
      look: ["{candId}"],
    },
    "vote.grant": {
      when: (v) => only("vote.grant")(v) && v.n >= 2 && !v.stepped,
      first: {
        key: true,
        why: "Its own vote counts too. Each server gets one vote per term, and it never votes for a candidate whose log is less complete than its own.",
        picture: "most",
        deeper: {
          how: "To decide, a voter compares the last entries of the two logs. The later term wins, and if the terms are equal, the longer log wins (§5.4.1). It also grants the vote only if it hasn't voted for anyone else this term.",
          code: "`log_ok = (m.last_term, m.last_index) >= (self.last_term(), self.last_index())` (line 8)",
          edge: "So a longer log can still lose. A log ending in an older term counts as less complete than a shorter one that ends in a newer term.",
          source: "[ongaro2014] §5.4.1",
        },
      },
      plain: "{count:n|server} send {cand} a vote. To win it needs a {term:majority}, which here is {majority} of {N}.",
      look: ["{candId}", "{whoIds}"],
    },
    "vote.grant-taken": {
      when: (v) => only("vote.grant", "vote.taken")(v) && !v.stepped,
      plain: "{cand} gets {count:n|vote}, from {who}. {takenWho} already voted this term.",
      why: "Each server votes only once per term. {cand} needs a {term:majority}, {majority} of {N}, and its own vote counts toward that.",
      look: ["{candId}", "{whoIds}"],
    },
    // with message loss on (1 in 20 or 1 in 10) and some seeds: a request from an older term arrives late
    "vote.old": {
      when: only("vote.old"),
      first: { why: "That request belongs to an election that is already over." },
      plain: "{who} {be:n} already on term {own}, so {cand}'s request from term {term} gets no vote.",
      look: ["{candId}"],
    },
    "vote.taken": {
      when: only("vote.taken"),
      first: {
        why: "Because each server votes only once per term, two candidates can't both collect a majority in the same term.",
        deeper: {
          how: "The vote is written to disk before the reply goes out (Figure 2). Otherwise a server could crash, restart and vote a second time in the same term.",
          source: "[ongaro2014] Figure 2",
        },
      },
      plain: "{who} already voted this term, so {cand} gets no vote from there.",
      look: ["{candId}"],
    },
    "vote.behind": {
      when: only("vote.behind"),
      first: {
        why: "This check is what protects committed entries. A candidate that is missing one can't collect enough votes to win.",
        deeper: {
          how: "Every committed entry sits on a majority, and every winner needs a majority, so at least one voter holds the entry and refuses a log that lacks it (§5.4.1).",
          source: "[ongaro2014] §5.4.1",
        },
      },
      plain: "{cand} gets no vote from {who}, whose log is more complete.",
      look: ["{candId}"],
    },
    "vote.denied": {
      when: only("vote.denied"),
      plain: "{cand} is turned down by {who} and has {votes} of the {need} votes it needs.",
      look: ["{candId}"],
    },
    "vote.tally": {
      when: only("vote.tally"),
      first: { why: "Votes arrive one at a time, and it wins the moment it holds {need}." },
      plain: "{cand} now has {votes} of the {need} votes it needs.",
      look: ["{candId}"],
    },
    "vote.late": {
      when: (v) => only("vote.late")(v) && v.leads,
      plain: "{cand} already leads, so the late votes from {who} change nothing.",
      look: ["{candId}"],
    },
    "elect.win": {
      when: (v) => only("elect.win")(v) && v.noop,
      first: {
        key: true,
        why: "Requiring more than half is what keeps the result unique. If two candidates could both get more than half, some server would have voted for both, and no server votes twice in one term.",
        picture: "taker",
        deeper: {
          how: "The candidate's own vote counts toward its {votes}. Two majorities of {N} always share at least one server, and that server votes only once per term, so no term ever has two leaders (§5.2).",
          code: "`if len(self.votes) > N // 2: self.become_leader()` (line 15)",
          edge: "The blank `nop` is there because a new leader only learns which older entries are final once an entry from its own term is stored on a majority, and a blank entry can get there at once (§8).",
          source: "[ongaro2014] §5.2, §8",
        },
      },
      plain: "{leader} wins term {term} once {votes} of {N} votes arrive, and logs a `nop`.",
      look: ["{leaderId}"],
    },
    "reelect.win": {
      key: true,
      plain: "{leader} wins term {term} once {votes} of {N} votes arrive. Its log still has {kept}.",
      why: "Every majority includes at least one server holding {kept}, and that server would refuse any log without it.",
      "why@crash": "That's why nothing committed has to be fetched from the crashed server. The new leader already has it.",
      look: ["{leaderId}"],
      deeper: {
        how: "{kept} was on a majority. Any {majority} voters out of {N} include one of those servers, and the vote check refused every log that was missing it (§5.4.1).",
        edge: "{leader} doesn't know that {kept} is committed, because that news crashed with the old leader. A new leader counts copies only of its own term's entries. An older entry can still be overwritten, even when it sits on a majority (Figure 8), and it becomes final only when a newer entry after it commits.",
        source: "[ongaro2014] §5.4.1, §5.4.2, Figure 8",
      },
    },
    "term.newer": {
      when: only("term.newer"),
      first: { why: "A newer term means a newer election has happened, so an older leader or candidate gives way at once." },
      plain: "{who} sees term {term} in {from}'s reply and steps down.",
      look: ["{whoId}"],
    },

    // ---- Copying the log ----
    "client.send": {
      when: only("client.send"),
      first: { why: "Only the leader adds commands, which is how every server's list ends up with them in the same order." },
      plain: "The {term:client} sends {cmd} to {leader}, the leader it knows about.",
      look: ["client", "{leaderId}"],
    },
    "update.copy": {
      when: only("update.copy"),
      first: {
        why: "The other servers, the followers, don't decide anything here. They store what the leader sends, in the order it sends it.",
        picture: "line",
        deeper: {
          how: "Each update names the entry just before the new ones, by its index and term. A follower accepts the update only if its own log has that entry, so when they match there, the two logs agree all the way back to the start (the Log Matching property, §5.3).",
          source: "[ongaro2014] §5.3",
        },
      },
      plain: "{from} copies {entries} to {who} as {term:entry} {first}.",
      look: ["{whoIds}"],
    },
    "update.copy-down": {
      when: only("update.copy", "update.step-down"),
      plain: "{from} copies {entries} to {who} as {term:entry} {first}, and {downWho} steps down.",
      why: "An update from a leader of the same term, or a newer one, tells a candidate or an old leader that the election is over.",
      look: ["{whoIds}", "{downIds}"],
    },
    "update.copy-commit": {
      when: (v) => only("update.copy-commit")(v) && v.commit !== undefined,
      first: {
        why: "A single update does two jobs here. It carries new entries, and it tells the followers how far the leader has committed.",
        deeper: {
          how: "Every update carries the leader's commit index. A follower marks entries committed up to that index, but never past the last entry this update gave it.",
          code: "`self.commit = max(self.commit, min(m.leader_commit, m.prev_index + len(m.entries)))` (line 26)",
          source: "[ongaro2014] Figure 2",
        },
      },
      plain: "{from} copies {entries} to {who} and marks everything up to {term:entry} {commit} as committed.",
      look: ["{whoIds}"],
    },
    "command.add": {
      when: only("command.add"),
      first: {
        why: "For now {cmd} exists only on the leader, so it doesn't count yet. A single crash could take it away.",
        deeper: {
          real: "These commands are the kind the paper uses. Its example log (Figure 6) is a list of assignments like x←3, y←7 and x←5, and applying them in order leaves every copy with the same variables.",
          source: "[ongaro2014] Figure 6",
        },
      },
      plain: "{leader} adds {cmd} to its log as {term:entry} {index} and sends out copies.",
      look: ["{leaderId}"],
    },
    "reply.match": {
      when: only("reply.match"),
      first: { why: "Each reply tells {leader} how much of that server's log matches its own, and it counts these replies to know when a majority has an entry." },
      plain: "{who} {be:n} now in step with {leader}'s log.",
      look: ["{whoIds}"],
    },
    "commit.majority": {
      // entries of the leader's own term (an older one is commit.older)
      when: only("commit.majority"),
      first: {
        key: true,
        why: "It doesn't need all {N}. Any majority that forms later must overlap this one in at least one server, so the entry can't be outvoted or forgotten.",
        picture: "counts",
        deeper: {
          cost: "Every entry costs an update to each other server and a reply from each. {leader} commits as soon as the fastest replies bring it to {have} copies, so one slow server never holds things up.",
          how: "A leader only counts copies of entries from its own term, because an older entry on a majority can still be overwritten by a later leader (§5.4.2, Figure 8). Once an entry of the current term commits, every entry before it commits as well.",
          code: "`if n > self.commit and self.log[n].term == self.term: self.commit = n` (lines 35–36)",
          source: "[ongaro2014] §5.4.2, Figure 8",
        },
      },
      plain: "{leader} hears that {cmd} is on {have} of {N}, a {term:majority}, so it {term:commit|commits} it.",
      look: ["{leaderId}"],
    },
    "commit.older": {
      when: only("commit.older"),
      key: true,
      plain: "{leader} hears that {cmd} is on {have} of {N} and commits it, along with the older {older}.",
      why: "{older} comes from an earlier term, and a leader only counts copies of its own term's entries. It can't commit on its own, but it does commit along with {cmd}, which comes after it.",
      look: ["{leaderId}"],
      deeper: {
        how: "The paper's Figure 8 shows an entry from an older term sitting on a majority and still being overwritten by a later leader. That's why a leader commits by counting copies only for entries of its own term, and every entry before one of those commits with it (§5.4.2).",
        code: "`if n > self.commit and self.log[n].term == self.term: self.commit = n` (lines 35–36)",
        edge: "Once {cmd} is on a majority, no server missing it can win a vote, and {cmd} sits after {older} in every log that holds it. That means {older} can no longer be overwritten either (§5.4.3).",
        source: "[ongaro2014] §5.4.2, §5.4.3, Figure 8",
      },
    },
    "client.done-next": {
      when: only("client.done", "client.next"),
      first: {
        why: "The leader only answers once a command is committed, so getting an answer means the command is safe.",
        deeper: {
          how: "The leader applies the entry to its own copy of the data and then answers the client. The followers apply it once they learn it has been committed (§5.3).",
          source: "[ongaro2014] §5.3",
        },
      },
      plain: "The client hears that {cmd} is committed and sends {nextCmd} to {leader}.",
      look: ["client", "{leaderId}"],
    },
    "client.done": {
      when: only("client.done"),
      first: { why: "The client only gets an answer after a commit, which means {cmd} is on a majority and can't be lost." },
      plain: "The client hears that {cmd} is committed.",
      look: ["client"],
    },
    "update.learn": {
      when: only("update.learn"),
      first: {
        why: "The followers only find out about a commit from the leader's next message, which is why their entries light up a little later.",
        deeper: {
          how: "A follower takes the smaller of two numbers, the leader's commit index and the index of the last entry this update gave it.",
          code: "`self.commit = max(self.commit, min(m.leader_commit, m.prev_index + len(m.entries)))` (line 26)",
          edge: "It must not use its own last log index. Entries past this update may be stale ones from an old leader that haven't been checked against this one yet. Using the last index is a common student bug (Gjengset).",
          source: "[ongaro2014] Figure 2; [gjengset]",
        },
      },
      plain: "{from} tells {who} that everything up to entry {commit} is committed.",
      look: ["{whoIds}"],
    },
    "beat.send": {
      when: only("beat.send"),
      first: {
        why: "If a server stops hearing them, it assumes the leader is gone and runs for leader itself.",
        picture: "here",
        deeper: {
          how: "A heartbeat is just an update with no entries. Raft's timing rule asks for the time to reach every server to be much shorter than the election timeout, and the election timeout to be much shorter than the average time between crashes (§5.6).",
          real: "etcd sends a heartbeat every 100 ms by default, against a 1000 ms election timeout.",
          source: "[ongaro2014] §5.2, §5.6; [etcd-tuning]",
        },
      },
      plain: "{who} sends {term:heartbeat|heartbeats}, short “still here” messages, so no timer runs out.",
      look: ["{whoIds}"],
    },
    // two leaders heartbeating in one step: none of 2,592 settings tried reaches it (a stranded leader resends instead)
    "beat.send-many": {
      when: only("beat.send-many"),
      plain: "{who} each still lead, in different terms, and both send heartbeats.",
      why: "The old leader hasn't heard about the newer term yet. The first reply it gets from a server on the newer term will tell it.",
      look: ["{whoIds}"],
    },
    "update.beat": {
      when: only("update.beat"),
      first: {
        plain: "{from}'s {term:heartbeat}, a short “still here” message, restarts the timer on {who}.",
        why: "As long as heartbeats keep coming, no other server runs for leader.",
        picture: "here",
        deeper: {
          edge: "The timer should restart only for an update from the current leader, or when the server grants a vote. Restarting it on every message, old ones included, is a common bug (Gjengset).",
          source: "[gjengset]",
        },
      },
      plain: "{from}'s heartbeat restarts the election timer on {who}.",
      look: ["{whoIds}"],
    },
    "beat.resend": {
      when: only("beat.resend"),
      first: {
        why: "A leader keeps trying a server that is behind, even one that was down, until their logs match.",
        deeper: { how: "Raft retries forever. Every heartbeat to a server that is behind carries the entries it is missing (§5.3).", source: "[ongaro2014] §5.3" },
      },
      plain: "{leader} resends the missing entries to {count:behindIds|server} that fell behind.",
      look: ["{behindIds}"],
    },
    "beat.resend-many": {
      when: only("beat.resend-many"),
      plain: "{who} each still lead, in different terms, and resend missing entries.",
      why: "The old leader never heard about the newer term, because no message crossed the split.",
      look: ["{whoIds}"],
    },

    // ---- Crash ----
    "crash.down": {
      when: (v) => only("crash.down")(v) && v.leader,
      key: true,
      plain: "Leader {who} {tone:fail|crashes}. Its log is saved on disk, so the log itself survives.",
      why: "Every committed entry is also stored on a majority of servers, so losing this one machine loses nothing that counted. Copies it had already sent are still on their way, and they still arrive.",
      look: ["{whoId}"],
      deeper: {
        how: "Before replying to anyone, a server writes its term, its vote and its log to disk (Figure 2). Which entries are committed, though, it keeps only in memory.",
        edge: "Any {majority} of the {N} servers can carry on by themselves. With fewer than that running, nothing new can commit until enough come back.",
        source: "[ongaro2014] Figure 2",
      },
    },
    "net.down": {
      first: { why: "A sender can't tell a crashed server from a slow network. Either way, it just hears nothing back." },
      plain: "Messages sent to a crashed server are {tone:fail|lost}.",
    },
    "client.wait": {
      when: only("client.wait"),
      first: { why: "With the leader down, nobody can add commands until a new leader is elected." },
      plain: "There's no answer for {cmd} and no leader to ask, so the client waits.",
      look: ["client"],
    },

    // ---- Re-election ----
    "client.retry": {
      when: only("client.retry"),
      first: {
        why: "The client can't tell a slow leader from a lost one, so it simply tries again.",
        deeper: {
          how: "It waits {after} ms, which is long enough for a new leader to be elected and make itself known.",
          edge: "A retry can put a command in the log twice if the first copy survives too. Raft gives each client command a serial number so that a server applies it only once (§8). This run avoids duplicates in a cruder way, by looking the command up in the leader's log.",
          source: "[ongaro2014] §8",
        },
      },
      plain: "After {after} ms with no answer for {cmd}, the client sends it again, to {leader}.",
      look: ["client", "{leaderId}"],
    },
    "command.again": {
      when: (v) => only("command.again")(v) && !v.committed,
      first: {
        "why@partition": "The retry reaches the same cut-off leader, so {cmd} still can't reach a majority.",
      },
      plain: "{leader} already has {cmd} as entry {index}, so it waits for a majority.",
      look: ["{leaderId}"],
    },
    "command.again@crash": {
      when: (v) => only("command.again")(v) && !v.committed,
      key: true,
      plain: "{leader} already has {cmd} as entry {index}, from an older term, so it waits.",
      why: "A leader only counts copies of its own term's entries, so {cmd} has to wait until one of those commits after it.",
      look: ["{leaderId}"],
      deeper: {
        how: "An older-term entry on a majority isn't safe yet. In the paper's Figure 8, an entry like that is overwritten by a later leader. It becomes final when an entry of the current term that comes after it commits (§5.4.2), and the leader's `nop` is exactly that entry.",
        edge: "Until its `nop` commits, a new leader doesn't know which entries are committed, so it can't safely answer reads either (§8).",
        source: "[ongaro2014] §5.4.2, §8, Figure 8",
      },
    },

    // ---- Catch-up ----
    "catchup.restart": {
      when: only("catchup.restart"),
      key: true,
      plain: "{who} {tone:ok|restarts} with its {count:entries|entry|entries}, but doesn't know which of them are committed.",
      why: "Its log survived on disk, but the record of which entries count was kept only in memory.",
      look: ["{whoId}"],
      deeper: {
        how: "The term, the vote and the log are on disk (Figure 2), but the commit index isn't. The leader's next update will tell it.",
        source: "[ongaro2014] Figure 2",
      },
    },
    "update.gap": {
      when: only("update.gap"),
      first: { why: "Its log doesn't match the leader's at that point, so it can't safely take the entries that come after." },
      plain: "{who} {be:whoIds} missing entry {index} from term {term}, so the update is refused.",
      look: ["{whoIds}"],
    },
    "update.back": {
      when: only("update.back"),
      first: {
        why: "The leader steps back through its log until it finds the point where the two logs agree, and then sends everything after it.",
        deeper: {
          how: "The paper's basic rule backs up one entry for each refusal (§5.3). Here the refusal also says how long the follower's log is, so the leader can jump straight to the entry after the follower's last one. That is the shortcut the 6.824 students' guide teaches.",
          code: "`self.next[m.sender] = max(self.match[m.sender] + 1, min(m.prev, m.last + 1))` (lines 31–33)",
          edge: "The paper's own shortcut has the follower send the term of the conflicting entry and the first index it holds for that term, so the leader can skip a whole term of mismatched entries at once. The paper doubts it is needed, since failures are rare (§5.3).",
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
      plain: "A {term:partition} leaves the leader's side with {count:sideA|server} and the other side with {count:sideB|server}.",
      why: "With fewer than {majority} servers on its side, the leader can never gather a majority.",
      look: ["{sideA}"],
      deeper: {
        edge: "Neither side knows the network has split. Messages simply stop arriving, exactly as if the other servers had crashed.",
        real: "In the thesis, a leader steps down when an election timeout passes without a round of heartbeats reaching a majority (§6.2). etcd's Raft library calls this option CheckQuorum.",
        source: "[ongaro-thesis] §6.2; [etcd-raft]",
      },
    },
    "split.send": {
      first: {
        why: "It still thinks it leads, because nothing tells it that the others can't hear it.",
        deeper: {
          edge: "A cut-off leader could still answer reads with stale data. Raft prevents this by having it first confirm that it still leads, by hearing from a majority, or by relying on a time lease (§8).",
          source: "[ongaro2014] §8",
        },
      },
      plain: "Messages from {who} can't cross the split.",
      look: ["{whoIds}"],
    },
    "split.add": {
      when: only("split.add"),
      first: { why: "Nothing tells {leader} that it is cut off, so it keeps accepting commands as before." },
      plain: "{leader} adds {cmd} as entry {index}, and its copies reach only its own side of the split.",
      look: ["{leaderId}"],
    },
    "split.no-majority": {
      when: only("split.no-majority"),
      key: true,
      plain: "{who} stores {cmd}, which makes {held} of {N} servers and no majority, so {leader} can't commit it.",
      why: "Only a majority makes an entry safe. Without {majority} copies, a newer leader could still replace {cmd}.",
      look: ["{leaderId}", "{whoId}"],
      deeper: {
        how: "The commit rule only counts copies. A majority of {N} is {majority}, and the servers on the other side of the split can't add theirs.",
        edge: "That's why a stranded leader can't do any harm with writes. Its client hears nothing back and retries, and the retry may reach a leader that can commit.",
        source: "[ongaro2014] §5.3, §5.4.2",
      },
    },
    "net.cut": {
      plain: "A message can't cross the split and is {tone:fail|lost}.",
    },

    // ---- New leader ----
    "client.dup": {
      when: only("client.dup"),
      first: { why: "A new leader answers for every client command it commits, even one that was already answered." },
      plain: "The client already has an answer for {cmd}, so it ignores this one.",
      look: ["client"],
    },

    // ---- Heal ----
    "heal.join": {
      when: only("heal.join"),
      plain: "The split is over, and every server can reach every other again.",
      why: "Now that messages cross again, the old leader can finally learn about the newer term.",
      look: ["{serverIds}"],
    },
    "update.old": {
      when: only("update.old"),
      first: { why: "An update from an older term comes from a leader that has since been replaced." },
      plain: "{who} {be:n} on term {own}, so {from}'s update from term {term} is refused.",
      look: ["{fromId}"],
    },
    "update.replace": {
      // with the old leader stepping down in the same step (the run's heal)
      when: (v) => only("update.replace", "update.step-down")(v) && v.was === "leader",
      key: true,
      plain: "{from} replaces {count:cut|uncommitted entry|uncommitted entries} on {who}, and old leader {downWho} steps down.",
      why: "Those entries never reached a majority, so they never counted, and the leader of term {term} decides what goes there instead.",
      look: ["{whoIds}", "{downIds}"],
      deeper: {
        how: "A follower cuts its log only at the first entry whose term differs from the leader's, then adds the rest. Entries that match are never cut (§5.3).",
        code: "`if i <= self.last_index(): del self.log[i:]`, reached only past the entries it already has (lines 22–25)",
        edge: "Cutting the log on every update is a classic bug, because a late, reordered update would then erase entries the follower had already confirmed (Gjengset). The client never got an answer for the replaced command, so its retry is safe.",
        source: "[ongaro2014] §5.3; [gjengset]",
      },
    },
    "reply.old": {
      when: only("reply.old"),
      first: { why: "{leader} no longer leads, so the replies to its old updates mean nothing now." },
      plain: "{leader} ignores out-of-date replies from {who}.",
      look: ["{leaderId}"],
    },

    // ---- Stuck (only without the nop) ----
    // with noop: false only (the Figure 8 tests and old links); no knob or story sets it
    "stuck.old": {
      when: only("stuck.old"),
      key: true,
      plain: "{leader} has {cmd} on {held} of {N}, but it is from term {term}, so it never counts.",
      why: "A leader only counts copies of its own term's entries, and it has no entry of its own coming.",
      look: ["{leaderId}"],
      deeper: {
        how: "This is the gap §8 closes. A new leader writes a blank `nop` of its own term straight away, and when that commits, every older entry before it commits too.",
        edge: "Counting the old entry here would be unsafe. In Figure 8, an older entry on a majority is overwritten by a later leader.",
        source: "[ongaro2014] §5.4.2, §8, Figure 8",
      },
    },

    // ---- Agreement ----
    "agree.same": {
      when: (v) => v.up === v.N,
      key: true,
      plain: "All {N} servers hold the same committed commands, {log}, in the same order.",
      why: "One leader at a time set the order, and no entry counted until a majority held it.",
      "why@crash": "The crash cost some time but no entries, because the new leader already held every committed one.",
      "why@partition": "The cut-off leader's entry never counted, so it could be replaced without breaking the list.",
      look: ["{upIds}"],
      deeper: {
        how: "Apply the same commands in the same order and every copy ends up in the same state, so every server now has the same variables.",
        real: "etcd, which sits behind Kubernetes, Consul and CockroachDB all use Raft to keep their data consistent.",
        source: "[raft-site]; [etcd-raft]",
      },
    },
    // with no client commands (an empty "Client commands" field): only the leader's nop is committed
    "agree.where": {
      plain: "Committed so far: {count:committed|entry|entries}.",
      look: ["{whoId}"],
    },
    "net.lost": {
      first: { why: "Networks lose messages. Raft never waits on any single one, because the next heartbeat or timer sends again." },
      plain: "A message is {tone:fail|lost} on the way.",
    },
    "client.refused": {
      when: (v) => only("client.refused")(v) && !!v.hintId,
      plain: "{who} isn't the leader, so it turns {cmd} away and points to {hint}.",
      look: ["{whoId}"],
    },
    "client.redirect": {
      when: only("client.redirect"),
      plain: "The client hears that {who} isn't the leader.",
      look: ["client"],
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "copy.commit": {
      question: "{leader} has heard that {cmd} is on {have} of the {N} servers, counting itself. Can it treat {cmd} as committed now?",
      options: [
        { misconception: "m-all",
          feedback: "Waiting for all {N} would let one crashed server stall every command. {have} of {N} is already enough, because any majority that forms later must include one of these {have}." },
        { feedback: "Right. {have} of {N} is a majority, and any later majority overlaps it, so {cmd} can't be outvoted." },
        { misconception: "m-written",
          feedback: "Writing it on {leader} alone isn't enough, because a crash of {leader} would take {cmd} with it. It counts only once {have} servers store it." },
      ],
    },
    "reelect.survive": {
      options: [
        { misconception: "m-lost",
          feedback: "It would be, if the crashed server held the only copy. But {kept} also sits on a majority of servers, and {leader} wins with {kept} already in its log." },
        { feedback: "Right. Any {majority} voters include a server holding {kept}, and that server refuses a log without it." },
        { misconception: "m-lost",
          feedback: "The client won't send it again, because it was already told {kept} is committed. It doesn't need to, since {leader}'s log already has it." },
      ],
    },
    "split.minority": {
      options: [
        { misconception: "m-boss",
          feedback: "Being the leader isn't enough. It needs {majority} copies, and only {held} of {N} servers hold {cmd}, because the rest can't hear {leader}." },
        { feedback: "Right. A majority of {N} is {majority}, and on this side of the split {cmd} can reach only {held}." },
        { misconception: "m-boss",
          feedback: "{who}'s copy is already counted, and it only brings the total to {held}, still short of {majority}. A newer leader could replace {cmd}." },
      ],
    },
    "heal.replaced": {
      options: [
        { misconception: "m-boss",
          feedback: "The others now refuse its updates, because its term is older. Instead of carrying on, it steps down." },
        { feedback: "Right. It never reached a majority, so it never counted, and {from}, the leader of the newer term, decides what stays." },
        { misconception: "m-boss",
          feedback: "Leading first gives it no claim. {from}'s term is newer, and an entry that was never committed is simply replaced." },
      ],
    },
  },
};
