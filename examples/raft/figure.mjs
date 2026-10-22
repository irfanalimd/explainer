// Raft (Ongaro & Ousterhout, USENIX ATC 2014), run for real on the sim/actors runtime: randomized election timeouts,
// RequestVote with the log up-to-date check, AppendEntries with the consistency check and conflict truncation,
// commit only of current-term entries by majority (a new leader appends a no-op, §8), and a client that retries.
// Scenarios: the happy path; the leader crashing mid-replication; a partition that strands the leader in a minority.
//
// The cluster board (five servers in a ring, each tray is its log: one tile per entry, keyed by term, dim until the
// server knows it is committed; LED = role, sub = term) with the client below it. An optional space-time board, the
// "Message timeline" setting (knob `lanes`: Hide, the default; Show; or Show below the servers), adds one rail per
// server where every message draws a diagonal and timeouts, elections and commits leave marks. Each server's
// inspector state is its Raft state plus two ghost (history) variables the invariants read: ledTerms (terms it led)
// and commits (entries it committed as leader, with the term it did so in).
//
// The lesson (references/teaching.md), for a reader who knows basic programming but not consensus:
//   Level        core (teaching.md lists Raft as deep; a beginner gets fewer chapters and knobs, not more)
//   Hook         five servers keep copies of one list and any can crash: how do they never disagree?
//   Picture      a group keeping one shared notebook. Each person's copy = a log; a line = an entry; the elected
//                note-taker = the leader; "most of us have copied it" = a majority; a line that counts = committed;
//                the note-taker's "still here" = a heartbeat; which vote this is = the term. Where it stops
//                matching: servers only learn from messages, which can be late or lost.
//   Problem      if everyone wrote at once the copies would disagree (so: one elected writer); if a line waited for
//                every copy, one crash would stall everything (so: a majority). Said in the first two abouts.
//   Ladder       Election · Copying the log (the aha: a command counts at 3 of 5) · Agreement; the crash story adds
//                Crash · Re-election · Catch-up, the split story The network splits · New leader · Heal.
//   Captions scale with the Servers knob: a group of 4 or more servers is counted ("5 servers copy …"), not listed.
//   Misconception "a line is safe only once every server has it" / "as soon as the leader writes it": the predict
//                question at the first client command to reach a majority.
//   Message types are plain words ("Vote request", "Update") because the runtime's generated captions print them;
//   the code panel keeps Raft's real names (RequestVote, AppendEntries).
//
// Ids for lesson.mjs (CONTRACTS.md 10). The network runtime writes the steps, so each handler notes the move it
// narrates (say, sing) and the step takes the lead note's id: a handler's own sentence outranks a merged chorus, which
// outranks a routine (minor) line. The step's vars are every spoken note's vars (the lead's win a clash) plus `moves`,
// the ids of every move the step's caption says (a minor line the step drops is not one). Handlers run in every chapter, so a move is named by the part of Raft it
// belongs to (vote., update., commit.), and by its chapter where it has one (elect., split., heal.). The inline
// captions stay the fallback. Servers are { ref } chips, with their ids as strings for look; commands are { code }.
//   run-wide    N, majority, commands (every client command, a list), serverIds
//   chorus      a merged line also passes who (the servers it names, markup: counted from 4), whoIds and n (how many)
//   chapters    elect · copy · crash · reelect · catchup · split · lead (New leader) · heal · stuck · agree
//   elect.start        min, max (the election timer's range, ms)
//   elect.timeout      chorus: term                                  (one server's timer runs out first)
//   elect.tie          chorus: term                                  (several time out together)
//   elect.cut-off      cand, candId, term, cutIds                    (it runs, but the split cuts its requests)
//   vote.grant         chorus: cand, candId, term, stepped (it stepped down from leading or running)
//   vote.old           chorus: cand, candId, term (the request's), own (the voters' newer term)
//   vote.taken         chorus: cand, candId, same (the "already voted" follows a grant in this step), takenWho,
//                      takenIds                                      (vote.grant-taken: the pair in one step)
//   vote.behind        chorus: cand, candId                          (the voters' logs are more complete)
//   vote.denied        chorus (the voters who said no): cand, candId, votes, need
//   vote.tally         cand, candId, votes, need
//   vote.late          minor chorus (the late voters): cand, candId, leads (it already won)
//   elect.win          leader, leaderId, term, votes, noop
//   reelect.win        leader, leaderId, term, votes, kept (committed commands its log still has)
//   term.newer         who, whoId, from, fromId, term                (a reply carries a newer term: it steps down)
//   beat.send          chorus (one leader): heartbeats                beat.send-many: two leaders at once
//   beat.resend        chorus (one leader): leader, leaderId, behindIds, idleIds   beat.resend-many: two leaders
//   split.send         chorus (the cut-off leaders): cutIds
//   update.old         chorus: from, fromId, term (the update's), own
//   update.gap         who, whoId, from, fromId, index, term         (it lacks the entry before the new ones)
//   update.step-down   chorus: term, was ("leader" | "candidate"), downWho, downIds (its servers, kept in a merge)
//   update.copy-down   update.copy and update.step-down in one step
//   update.copy        chorus: from, fromId, entries (one command, a list), first, last (its index)
//   update.copy-commit as update.copy, with several entries or commit (the same servers learn a commit in this step)
//   update.replace     chorus: from, fromId, cut (uncommitted entries replaced), commit (as update.copy-commit)
//   update.learn       minor chorus: from, fromId, commit
//   update.beat        minor chorus: from, fromId
//   update.back        who, whoId (the follower), leader, leaderId, missing, next
//   reply.match        minor chorus: leader, leaderId
//   reply.old          minor chorus (the senders): leader, leaderId
//   commit.majority    leader, leaderId, cmd, index, have, more (it commits several entries), older ([])
//   commit.older       as commit.majority; older (the older-term commands it commits too, Figure 8)
//   split.no-majority  who, whoId (the follower), leader, leaderId, cmd, held
//   client.send        cmd, leader, leaderId                         (client.next, right after an answer: + nextCmd)
//   client.retry       cmd, leader, leaderId, after (ms)
//   client.wait        cmd
//   client.refused     who, whoId, cmd, hint, hintId (the leader it points at, when it knows one)
//   client.redirect    who, whoId
//   client.done        cmd, leaderId          client.done-next: + nextCmd, leader (client.next in the same step)
//   client.dup         minor: cmd
//   command.add        leader, leaderId, cmd, index                  (split.add: cutIds, the copies die at the split)
//   command.again      leader, leaderId, cmd, index, committed
//   stuck.old          leader, leaderId, cmd, held, term
//   crash.down         who, whoId, leader (it led)
//   catchup.restart    who, whoId, entries
//   split.cut          sideA, sideB (server ids), leaderId          heal.join (the run-wide values)
//   net.lost · net.cut · net.down · net.event                      what the runtime says alone: a message dropped
//                      (net.lost), cut by the split, sent to a crashed server, or anything else (none in the stories)
//   agree.same         N, upIds, up, log (the committed commands)     agree.where: N, committed, whoId
//   asks               copy.commit · split.minority · reelect.survive · heal.replaced

import { network } from "../../sim/actors.mjs";
import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf, idsOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "Raft",
  subtitle: "How servers that can crash keep one shared log",
  kicker: "Distributed systems",
  fig: 3,
  cite: { text: "Ongaro & Ousterhout, “In Search of an Understandable Consensus Algorithm”, USENIX ATC 2014", url: "https://raft.github.io/raft.pdf" },
  theme: "light",
  level: "core",
  hook: "Five servers keep copies of the same list, and any of them can crash. How do they never end up disagreeing?",
  terms: {
    leader: "The one server that decides what goes into the notebook. The others copy what it sends.",
    log: "A server's copy of the notebook: the list of commands, in order.",
    majority: "More than half of all the servers, such as 3 of 5.",
    term: "An election round number. Each new election raises it, and a newer round beats an older one.",
    entry: "One line of the log: one command, such as x←3, with the round it was written in.",
    client: "The program outside the servers that sends commands, such as x←3, to be saved.",
    commit: "To make an entry final once a majority store it. A leader counts copies only of its own term's entries.",
    heartbeat: "A short “still here” message the leader sends often, so no one starts an election.",
    partition: "A break in the network that splits the servers into groups that cannot hear each other.",
  },
  recap: [
    "The servers elected one leader, by majority vote.",
    "The leader wrote each command into its log and sent copies.",
    "An entry counted once the leader heard that most servers had it: it was committed.",
    "In the end every server held the same entries, in the same order.",
  ],
  takeaway: "A leader commits an entry of its term once most servers store it. Any two majorities share a server, so a committed entry is never lost.",
};

export const params = {
  nodes: { label: "Servers", type: "int", min: 3, max: 7, value: 5 },
  commands: { label: "Client commands", type: "text", value: "x=3 y=7 x=5" },
  latency: { label: "Message delay (ms)", type: "int", min: 2, max: 30, value: 12 },
  drop: {
    label: "Lost messages", type: "select", value: 0,
    options: [{ value: 0, label: "None" }, { value: 0.05, label: "1 in 20" }, { value: 0.1, label: "1 in 10" }],
  },
  // the space-time board: one rail per server, every message a diagonal (off by default; unreadable on a phone)
  lanes: {
    label: "Message timeline", type: "select", value: "off",
    options: [{ value: "off", label: "Hide" }, { value: "on", label: "Show" }, { value: "below", label: "Show below the servers" }],
  },
  // not knobs any more, but build still reads them (tests, old links): jitter (default 40 % of the delay, at most 5),
  // electionMin/electionMax (150–300 ms, the paper's), heartbeat (50 ms), noop (true: §8), layout (auto)
  seed: { label: "Seed", type: "int", value: 3 },
};

export const scenarios = [
  { id: "happy", label: "Everything works", whatIf: "nothing goes wrong",
    description: "The servers vote for a leader, which copies each command to most of the others before it counts." },
  { id: "crash", label: "The leader crashes", whatIf: "the leader crashes partway through",
    description: "The leader crashes while copying a command, and the others pick a new one without losing anything that counted.",
    takeaway: "The leader crashed and nothing committed was lost: only a server holding every committed entry could win the new vote.",
    recap: [
      "The leader crashed while a command was still being copied.",
      "The others voted for a new leader whose log was as complete as theirs.",
      "Nothing committed was lost, and the old leader caught up when it came back.",
    ] },
  { id: "partition", label: "The network splits in two", whatIf: "the network splits in two",
    description: "The network splits, leaving the leader on the smaller side. The bigger side picks its own leader, then the network joins up again.",
    takeaway: "A leader on the smaller side of a split cannot commit anything. When the network joins up, its uncommitted entries give way.",
    recap: [
      "The split left the old leader with too few servers for a majority.",
      "The bigger side elected a new leader in a newer term and kept going.",
      "When the network joined up, the old leader's uncommitted entry was replaced.",
    ] },
];

export const counters = {
  term: { label: "election term", short: "term", format: "int", primary: true,
    hint: "The election round number. It goes up by one each time a server runs for leader." },
  committed: { label: "entries committed", short: "committed", format: "int", primary: true,
    hint: "Entries a leader has heard are stored on more than half of the servers, each empty nop included. A committed entry is never lost." },
  leaderless: { label: "time without a leader", short: "no leader", format: "ms", primary: ["crash", "partition"],
    hint: "The latest stretch with no leader, from boot or a failure until the next election is won." },
  messages: { label: "messages sent", format: "int",
    hint: "Every vote request, update, heartbeat and reply sent between the servers and the client." },
  lost: { label: "messages lost", format: "int",
    hint: "Messages that never arrived: cut off by a network split, lost on the way, or sent to a crashed server." },
};

// the handlers the simulation runs, line for line; s.line lights the ones each step executes
export const code = {
  lang: "python",
  source: [
    "def on_election_timeout(self):",
    "    self.term += 1; self.role = CANDIDATE",
    "    self.voted_for = self.id; self.votes = {self.id}",
    "    broadcast(RequestVote(self.term, self.last_index(), self.last_term()))",
    "",
    "def on_request_vote(self, m):",
    "    if m.term > self.term: self.become_follower(m.term)",
    "    log_ok = (m.last_term, m.last_index) >= (self.last_term(), self.last_index())",
    "    grant = m.term == self.term and self.voted_for in (None, m.candidate) and log_ok",
    "    if grant: self.voted_for = m.candidate; self.reset_election_timer()",
    "    reply(VoteReply(self.term, grant))",
    "",
    "def on_vote_reply(self, m):",
    "    if m.granted: self.votes.add(m.sender)",
    "    if len(self.votes) > N // 2: self.become_leader()   # appends a no-op (§8)",
    "",
    "def on_append_entries(self, m):",
    "    if m.term < self.term: return reply(AppendReply(self.term, False))",
    "    self.become_follower(m.term); self.reset_election_timer()",
    "    if self.term_at(m.prev_index) != m.prev_term:",
    "        return reply(AppendReply(self.term, False, prev=m.prev_index, last=self.last_index()))",
    "    for i, e in enumerate(m.entries, m.prev_index + 1):",
    "        if self.term_at(i) == e.term: continue          # has it already: keep it",
    "        if i <= self.last_index(): del self.log[i:]      # the first conflict: cut from here",
    "        self.log.append(e)",
    "    self.commit = max(self.commit, min(m.leader_commit, m.prev_index + len(m.entries)))",
    "    reply(AppendReply(self.term, True, m.prev_index + len(m.entries)))",
    "",
    "def on_append_reply(self, m):",
    "    if m.success: self.match[m.sender] = m.match",
    "    else:   # back up past the gap: at most to the follower's last entry + 1",
    "        self.next[m.sender] = max(self.match[m.sender] + 1, min(m.prev, m.last + 1))",
    "        self.send_append(m.sender)",
    "    n = self.majority_match()",
    "    if n > self.commit and self.log[n].term == self.term:   # only this term's",
    "        self.commit = n",
  ].join("\n"),
};
// plain names for the message types: the runtime prints them in the captions it writes itself
// ("Update reply from S3 is lost: S1 is down"); Raft's own names are in the code panel
const MSG = { vote: "Vote request", voteReply: "Vote", update: "Update", updateReply: "Update reply", command: "Command", notLeader: "Not leader", answer: "Answer" };
const LINES = {
  timeout: [1, 4], vote: [6, 11], voteReply: [13, 15], appendStale: [17, 18], heartbeat: [19, 19],
  appendCheck: [20, 21], append: [22, 27], learn: [26, 26], reply: [30, 30], replyFail: [31, 33], commit: [34, 36],
};

// ---- invariants (each reads one snapshot; history comes from the ghost variables) ----

const raftNodes = (snap) => idsOf(snap).map((id) => [id, stateOf(snap, id)]).filter(([, st]) => st && st.raft === true);
const same = (x, y) => x && y && x.term === y.term && x.cmd === y.cmd;

export const invariants = {
  "at most one leader per term": (snap) => {
    const by = new Map();
    for (const [id, st] of raftNodes(snap)) for (const t of st.ledTerms) {
      if (by.has(t)) return `term ${t} has two leaders: ${by.get(t)} and ${id}`;
      by.set(t, id);
    }
    return true;
  },
  "logs match up to commitIndex": (snap) => {
    const ns = raftNodes(snap);
    for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) {
      const [ia, x] = ns[a], [ib, y] = ns[b];
      const m = Math.min(x.commitIndex, y.commitIndex);
      for (let i = 0; i < m; i++) if (!same(x.log[i], y.log[i])) return `${ia} and ${ib} disagree at committed index ${i + 1}`;
    }
    return true;
  },
  "log matching": (snap) => {
    const ns = raftNodes(snap);
    for (let a = 0; a < ns.length; a++) for (let b = a + 1; b < ns.length; b++) {
      const [ia, x] = ns[a], [ib, y] = ns[b];
      for (let i = Math.min(x.log.length, y.log.length); i >= 1; i--) {
        if (x.log[i - 1].term !== y.log[i - 1].term) continue;
        for (let k = 0; k < i; k++) if (!same(x.log[k], y.log[k])) return `${ia} and ${ib} share term ${x.log[i - 1].term} at index ${i} but differ at ${k + 1}`;
        break;
      }
    }
    return true;
  },
  "committed entries never lost": (snap) => {
    const ns = raftNodes(snap);
    const ledger = new Map();
    for (const [id, st] of ns) for (const c of st.commits) {
      const prev = ledger.get(c.index);
      if (prev && !same(prev, c)) return `index ${c.index} was committed twice with different entries (${prev.by}, ${id})`;
      if (!prev) ledger.set(c.index, { ...c, by: id });
    }
    for (const c of ledger.values()) for (const [id, st] of ns) {
      if (st.commitIndex >= c.index && !same(st.log[c.index - 1], c)) return `${id} lost committed entry ${c.index} (${c.cmd}, term ${c.term})`;
      if (st.role === "leader" && st.term >= c.commitTerm && !same(st.log[c.index - 1], c)) return `leader ${id} of term ${st.term} lacks entry ${c.index} committed in term ${c.commitTerm}`;
    }
    return true;
  },
};

// ---- the figure ----

function parseCommands(text) {
  return String(text ?? "").split(/[\s,;]+/).filter(Boolean).slice(0, 6).map((tok, n) => {
    const m = /^([A-Za-z_]\w*)\s*(?:=|←|:=)\s*(-?\w+)$/.exec(tok);
    const cmd = m ? `${m[1]}←${m[2]}` : tok.slice(0, 4);
    return { id: `c${n + 1}`, n: n + 1, cmd, key: m ? m[1] : cmd, value: m ? m[2] : null };
  });
}

const PLAN = { happy: { until: 1600 }, crash: { until: 2600 }, partition: { until: 2600 } };

export function build(s, p, scenario, env) {
  const net = buildRaft(s, p, typeof scenario === "string" ? scenario : scenario?.id ?? "happy", { env });
  payoff(s, net, p);
}

// The payoff: the run ends on the cluster, framed large, with every server's committed log side by side. The caption
// states only what the final state holds (the logs are compared here, not assumed).
function payoff(s, net, p) {
  const N = Math.max(3, Math.min(7, p.nodes ?? 5));
  const ids = Array.from({ length: N }, (_, i) => `s${i + 1}`);
  const up = ids.filter((id) => net.isUp(id));
  const committed = (id) => { const st = net.state(id); return st.log.slice(0, st.commitIndex).map((e) => `${e.term}:${e.cmd}`).join(" "); };
  const same = up.length > 0 && up.every((id) => committed(id) === committed(up[0]));
  const st = net.state(up[0] ?? ids[0]);
  const cmds = st.log.slice(0, st.commitIndex).map((e) => e.cmd).filter((c) => c !== "nop");
  s.phase("Agreement", { id: "agree", about: same
    ? "Every server now holds the same committed entries in the same order. That is the one promise Raft makes, whatever crashed or split along the way."
    : "Where the servers stand at the end of the run." });
  s.focus("board");   // the cluster and its client: the payoff shot frames them large, nothing cut under the dock
  s.lit(...up);
  s.step(same && cmds.length
    ? `${up.length === N ? `All ${N}` : `${up.length} of ${N}`} servers hold the same committed log: ${cmds.map((c) => fmt.code(c)).join(", ")}, in the same order.`
    : `${fmt.plural(st.commitIndex, "entry", "entries")} committed on ${fmt.ref(up[0] ?? ids[0])}.`,
    { t: net.now, id: same && cmds.length ? "agree.same" : "agree.where",
      vars: same && cmds.length ? { N, upIds: up, up: up.length, log: cmds.map((c) => ({ code: c })) } : { N, committed: st.commitIndex, whoId: up[0] ?? ids[0] } });
}

// one plain-English line per chapter, for the explain panel (s.phase(name, { about }))
const ABOUT = {
  election: "Think of a group sharing one notebook. If everyone wrote at once, copies would disagree, so they elect one note-taker, the {term:leader}. A server whose random timer runs out asks for votes; a {term:majority} wins.",
  replication: "The leader adds each {term:client} command to its log as an {term:entry} and sends copies. Once a majority, not all, store an entry of its term, that entry and all before it are {term:commit|committed}.",
  crash: "The leader stops. The others stop hearing its {term:heartbeat|heartbeats}, so for a while nobody leads. Nothing committed is lost: a majority still holds it.",
  reelection: "A server's timer runs out and it runs in the next term. Servers vote only for one whose log is at least as complete as theirs, so the winner has every committed entry.",
  catchup: "The crashed server restarts with its saved log. The leader's updates find where the two logs differ, then fill in what it missed.",
  partition: "The network splits in two, a {term:partition}. The leader is stuck on the smaller side, too few for a majority, so nothing it adds can be committed.",
  newLeader: "On the bigger side a server's timer runs out, and it wins a newer term. Commands are committed there again, while the old leader still thinks it leads.",
  heal: "The network joins up again, so every server hears every other. The old leader sees the newer term and steps down; its uncommitted entries are replaced.",
  stuck: "A leader may only count copies of entries from its own term. Without an empty entry of its own, the older one can never be committed, even on a majority.",
};

/**
 * The whole figure; tests also call it with options:
 *   bugs    Set of deliberate protocol bugs ("vote-any-log", "double-vote", "commit-old-term", "no-truncate")
 *   faults  (net, rng, ids) => void, extra fault injection (crashes, partitions, drops)
 *   until   override the run length; tray  override the log tray { cols, rows }; window  client commands in flight
 *   asks    false to leave out the predict questions
 */
export function buildRaft(s, p, scenario = "happy", opt = {}) {
  const bugs = opt.bugs ?? new Set();
  const N = Math.max(3, Math.min(7, p.nodes ?? 5));
  const ids = Array.from({ length: N }, (_, i) => `s${i + 1}`);
  const majority = Math.floor(N / 2) + 1;
  const cmds = parseCommands(p.commands);
  const plan = { ...(PLAN[scenario] ?? PLAN.happy) };
  if (opt.until) plan.until = opt.until;
  // timeouts must be randomized (that is the point, §5.2): keep a spread of at least 30 ms even if the knobs meet
  const latency = p.latency ?? 12, jitter = p.jitter ?? Math.min(5, Math.round(latency * 0.4));
  const eLo = p.electionMin ?? 150, eHi = p.electionMax ?? 300;
  const eMin = Math.min(eLo, eHi), eMax = Math.max(eLo + 30, eHi, eMin + 30);
  const hb = p.heartbeat ?? 50;
  const noop = p.noop ?? true;
  const drop = Number(p.drop ?? 0) || 0;
  const R = (id) => fmt.ref(id);
  const C = (c) => fmt.code(c);
  const T = (id) => id.toUpperCase();   // plain-text server name (predict questions are plain text)
  // a term is an identity (one colour per term) for the first eight terms; later terms stay neutral rather than reuse one
  const termKey = (t) => (t >= 1 && t <= 8 ? `term ${t}` : undefined);
  const v = (n, one, many) => (n > 1 ? many : one);
  // a group of servers in a caption: named while it is short, counted once it is 4 or more (7 servers would list 6)
  const crowd = (list, n) => (n >= 4 ? `${n} servers` : list);
  const refs = (xs) => crowd(fmt.and(xs.map(R)), xs.length);
  const line = (k) => s.line(...LINES[k]);
  const asks = opt.asks !== false && opt.stopWhen !== false;

  // ---- ids for lesson.mjs (the header): handlers note their moves, the step the runtime commits takes the lead one ----
  const chip = (id) => ({ ref: id }), K = (c) => ({ code: c });
  const V = { N, majority, commands: cmds.map((c) => K(c.cmd)), serverIds: ids };
  let notes = [], lost = null, cut = false;
  const note = (id, vars, rank) => notes.push({ id, vars, rank });
  const subjects = new Map();   // chorus key -> the ids it has merged in this step
  // a handler's own sentence
  const say = (ctx, id, vars, text, o) => { note(id, vars, o?.minor ? 0 : 2); return ctx.say(text, o); };
  // a sentence merged across the batch: noted only if the step speaks it (fn may decline, and minor lines drop out);
  // o.as also names its servers `${as}Who`, `${as}Ids`, so they survive a merge whose lead has its own who
  function sing(ctx, key, id, vars, fn, subject = ctx.id, o) {
    if (!subjects.has(key)) subjects.set(key, []);
    const who = subjects.get(key);
    if (!who.includes(subject)) who.push(subject);
    return ctx.chorus(key, (list, n) => {
      const text = fn(list, n);
      const named = { markup: crowd(list, n) };   // as the captions say it: 4 or more servers are counted
      const as = o?.as ? { [`${o.as}Who`]: named, [`${o.as}Ids`]: who.slice() } : {};
      if (text) note(typeof id === "function" ? id(n) : id, { who: named, whoIds: who.slice(), n, ...as, ...vars }, o?.minor ? 0 : o?.rank ?? 1);
      return text;
    }, subject, o);
  }
  // the builder the network writes through: each step it commits takes the lead note's id and every spoken note's
  // vars; a step nobody noted is named by what the runtime said alone (a lost message's tag). Like the runtime, a step
  // that says anything non-routine drops its minor lines, so their moves (and vars) go too
  const LOST = { dropped: "net.lost", partitioned: "net.cut" };
  // two moves that often share a step get words of their own: the lead's id gives way to the pair's (moves keep both)
  const PAIRS = { "client.done|client.next": "client.done-next", "update.copy|update.step-down": "update.copy-down", "vote.grant|vote.taken": "vote.grant-taken" };
  const sn = new Proxy(s, {
    get(t, k) {
      if (k === "step") return (text, o) => {
        const said = notes.some((x) => x.rank > 0) ? notes.filter((x) => x.rank > 0) : notes;
        const lead = said.reduce((a, x) => (!a || x.rank > a.rank ? x : a), null);
        const vars = { ...V, ...Object.assign({}, ...said.map((x) => x.vars)), ...lead?.vars, moves: said.map((x) => x.id) };
        const pair = said.length === 2 && PAIRS[`${lead.id}|${said.find((x) => x !== lead).id}`];
        const id = pair || (lead?.id ?? (lost ? LOST[lost] ?? "net.down" : cut ? "net.cut" : "net.event"));
        notes = []; lost = null; cut = false; subjects.clear();
        return t.step(text, { ...o, id, vars });
      };
      // the runtime tags the first lost message of a step with why it died; losses at the split go untagged (quiet)
      if (k === "tag") return (id, text, o) => { if (o?.tone === "fail" && typeof id === "string" && id.startsWith("net.m") && !lost) lost = text; return t.tag(id, text, o); };
      if (k === "deliver") return (id, o) => { if (o?.lost) cut = true; return t.deliver(id, o); };
      const v = t[k];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });

  // ---- world: the cluster board (ring + client) and, opt-in, the space-time board ----
  // the time board is off by default (lanes: "off"); "on" shows it beside the cluster, "below" under it ("auto", from
  // old links, shows it on wide screens only: it can't be read at phone width). layout auto: side by side on a wide
  // screen, a 2-column cluster stacked over the client on a portrait phone
  const portrait = !!opt.env?.portrait;
  const layout = p.layout && p.layout !== "auto" ? p.layout : p.lanes === "below" || portrait ? "stacked" : "wide";
  const lanesOn = p.lanes === true || p.lanes === "on" || p.lanes === "below" || (p.lanes === "auto" && !portrait);
  const wide = layout === "wide";
  if (wide) {
    s.row("world", { gap: 96, align: "center" });
    s.column("board", { in: "world", gap: 64, align: "center" });
  } else {
    s.column("world", { gap: 40, align: "center" });
    if (portrait) s.column("board", { in: "world", gap: 30, align: "center" });
    else s.row("board", { in: "world", gap: 72, align: "center" });
  }
  if (portrait) s.grid("cluster", { in: "board", cols: 2, gap: 16, title: `Raft cluster · ${N} servers` });
  else s.ring("cluster", { in: "board", title: `Raft cluster · ${N} servers` });
  const tray = opt.tray ?? { cols: 4, rows: 2 };
  const net = network(sn, {
    id: "net",
    nodes: ids.map((id) => ({ id, title: T(id), sub: "term 0", tray: { ...tray, of: "tile", order: "row" }, led: "idle" })),
    clients: [{ id: "client", title: "client", sub: "192.0.2.10", variant: "client", led: "idle", in: "board" }],
    in: "cluster",
    latency: { mean: latency, jitter },
    drop,
    seed: p.seed,
    lanes: lanesOn ? { in: "world", length: wide ? 600 : 540, label: "time" } : undefined,   // the scene fits the run to the rail
    focus: ["world"],                    // every step frames both boards: the cluster is never cropped
    // reading pace: one mean latency of flight plays in 1.5 s; no caption flashes by in under 1.2 s
    pace: { at: 1.5, min: 1.2, max: 2.6, minor: 0.6 },
    counters: { sent: "messages", lost: "lost" },
    batch: Math.max(2, 2 * jitter),
    // deaths at the partition join the next step (the senders' captions name them); on a very lossy network so do
    // random drops: each still dies visibly with its fail tag, but not every second step narrates a loss
    quiet: drop > 0.1 ? ["partition", "drop"] : ["partition"],
    // the runtime's own sentences, in this lesson's words (servers, the network splitting and joining up)
    describe: {
      heal: "The network is {tone:ok|whole again}: every server can reach every other",
      // a random loss, said plainly: "Update from S1 to S3 is lost" (losses at a crashed server keep the default)
      lost: (g) => (g.reason === "drop" ? `${g.name} from ${fmt.and(g.from.map((id) => fmt.ref(id)))} to ${fmt.and(g.to.map((id) => fmt.ref(id)))} is {tone:fail|lost}` : null),
    },
    text: (m) => (m.type === MSG.update ? (m.body.entries.length ? `copy ×${m.body.entries.length}` : "heartbeat")
      : m.type === MSG.voteReply ? (m.body.granted ? "vote: yes" : "vote: no")
      : m.type === MSG.updateReply ? (m.body.success ? "got it" : "missing")
      : m.type === MSG.command ? m.body.cmd : m.type === MSG.vote ? "vote for me?" : m.type.toLowerCase()),
    key: (m) => (m.body && m.body.term !== undefined ? termKey(m.body.term) : undefined),
    state: (id) => (id === "client"
      ? { client: true, leader: null, pending: {}, acked: [] }
      : { raft: true, role: "follower", term: 0, votedFor: null, log: [], commitIndex: 0, lastApplied: 0, kv: {}, votes: [], leader: null, nextIndex: {}, matchIndex: {}, ledTerms: [], commits: [] }),
  });

  // ---- log tiles (the visual mirror of each log) ----
  const tiles = new Map(ids.map((id) => [id, []]));
  let uid = 0;
  function appendTile(id, entry) {
    const t = `${id}.e${uid++}`;
    // 2 u wider than a stock tile, so "x←3" (the arrow is wider than a digit) keeps the face's margin
    const tk = { in: id, text: entry.cmd, sub: `t${entry.term}`, w: 28 };
    if (termKey(entry.term)) tk.key = termKey(entry.term);
    s.tile(t, tk);
    s.set(t, { dim: true });
    tiles.get(id).push(t);
  }
  function truncateTiles(id, fromIndex) {
    const list = tiles.get(id);
    for (const t of list.splice(fromIndex - 1)) s.remove(t, { style: "fade" });
  }
  function commitTiles(id, from, to) {
    const list = tiles.get(id).slice(from - 1, to);
    for (const t of list) s.set(t, { dim: false });
    if (list.length) s.lit(...list);
  }

  // ---- helpers ----
  const lastIndex = (st) => st.log.length;
  const lastTerm = (st) => (st.log.length ? st.log[st.log.length - 1].term : 0);
  const termAt = (st, i) => (i === 0 ? 0 : st.log[i - 1]?.term);
  const leaders = () => ids.filter((id) => net.isUp(id) && net.state(id).role === "leader");
  let maxTerm = 0, maxCommit = 0, sawLeader = false, crashed = null, sawCandidateAfterCrash = false, partitioned = false;
  let nextCmd = 0, sawNewLeader = false, recovered = false, synced = false, stranded = null, strandedSaid = false, leaderlessSince = 0;
  const asked = new Set();
  let aeStep = { at: -1 };
  const grantAt = new Map();   // candidate -> the step in which someone last voted for it   // this step's update receivers, by what they copied and by the commit they learned
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  // routine sentences a same-step win or commit already implies are dropped from the merged caption
  let lastWin = { by: null, at: -1 }, lastCommit = { by: null, at: -1 };
  const explainStall = opt.stopWhen !== false;
  const ask = (id, q, options, answer, why) => { if (asks && !asked.has(id)) { asked.add(id); s.ask(q, options, answer, { why, id }); } };

  function gauges(st) {
    if (st.term > maxTerm) { maxTerm = st.term; s.gauge("term", maxTerm); }
    if (st.commitIndex > maxCommit) { maxCommit = st.commitIndex; s.gauge("committed", maxCommit); }
  }
  const shown = new Map();
  function show(ctx) {
    const st = ctx.state;
    const led = st.role === "leader" ? "ok" : st.role === "candidate" ? "warn" : "idle", sub = `term ${st.term}`;
    const was = shown.get(ctx.id);
    if (!was || was.led !== led || was.sub !== sub) { ctx.set({ led, sub }); shown.set(ctx.id, { led, sub }); }
    gauges(st);
  }
  function resetElection(ctx) {
    ctx.timer("election", ctx.rng.int(eMin, eMax), { tone: "warn", label: "timeout" });
  }
  function becomeFollower(ctx, term) {
    const st = ctx.state;
    const was = st.role;
    // a newer term, or a leader stepping down: who leads is unknown until that leader's heartbeat names it
    if (term > st.term) { st.term = term; st.votedFor = null; st.leader = null; }
    if (was === "leader") st.leader = null;
    st.role = "follower";
    st.votes = [];
    if (was === "leader") { ctx.cancel("heartbeat"); st.nextIndex = {}; st.matchIndex = {}; }
    if (!ctx.hasTimer("election")) resetElection(ctx);
    show(ctx);
    return was;
  }
  function apply(st) {
    while (st.lastApplied < st.commitIndex) {
      const e = st.log[st.lastApplied++];
      const m = /^([A-Za-z_]\w*)←(.*)$/.exec(e.cmd);
      if (m) st.kv[m[1]] = m[2];
    }
  }
  function sendAppend(ctx, to) {
    const st = ctx.state;
    const prev = st.nextIndex[to] - 1;
    ctx.send(to, MSG.update, {
      term: st.term, leader: ctx.id, prevLogIndex: prev, prevLogTerm: termAt(st, prev),
      entries: st.log.slice(prev).map((e) => ({ ...e })), leaderCommit: st.commitIndex,
    });
  }
  const sendAppends = (ctx) => { for (const to of ctx.peers) sendAppend(ctx, to); };
  const cutOff = (ctx) => ctx.peers.filter((f) => net.blocked(ctx.id, f));
  // up servers whose log holds this exact entry at index i
  const holders = (i, e) => ids.filter((id) => net.isUp(id) && same(net.state(id).log[i - 1], e)).length;

  function advanceCommit(ctx) {
    const st = ctx.state;
    const old = st.commitIndex;
    for (let n = lastIndex(st); n > st.commitIndex; n--) {
      if (!bugs.has("commit-old-term") && st.log[n - 1].term !== st.term) continue;
      const have = 1 + ctx.peers.filter((f) => (st.matchIndex[f] ?? 0) >= n).length;
      if (have >= majority) { st.commitIndex = n; break; }
    }
    if (st.commitIndex === old) return 0;
    for (let i = old + 1; i <= st.commitIndex; i++) {
      const e = st.log[i - 1];
      st.commits.push({ index: i, term: e.term, cmd: e.cmd, commitTerm: st.term });
      if (e.client) ctx.send("client", MSG.answer, { id: e.id, index: i, cmd: e.cmd });
    }
    apply(st);
    commitTiles(ctx.id, old + 1, st.commitIndex);
    ctx.mark(undefined, "ok");   // an unlabelled ok puck: commits are frequent, and the meter carries the index
    lastCommit = { by: ctx.id, at: net.stepSerial };
    gauges(st);
    return st.commitIndex - old;
  }

  function becomeLeader(ctx) {
    const st = ctx.state;
    st.role = "leader";
    st.leader = ctx.id;
    st.ledTerms.push(st.term);
    ctx.cancel("election");
    for (const f of ctx.peers) { st.nextIndex[f] = lastIndex(st) + 1; st.matchIndex[f] = 0; }
    if (!sawLeader) { sawLeader = true; ctx.phase("Copying the log", { id: "copy", about: ABOUT.replication }); }
    else if (scenario === "partition" && !sawNewLeader && cutOff(ctx).length) { sawNewLeader = true; ctx.phase("New leader", { id: "lead", about: ABOUT.newLeader }); }
    if (leaderlessSince !== null) { s.gauge("leaderless", Math.round(net.now - leaderlessSince)); leaderlessSince = null; }
    if (noop) {
      const e = { term: st.term, cmd: "nop" };
      st.log.push(e);
      appendTile(ctx.id, e);
    }
    show(ctx);
    sendAppends(ctx);
    ctx.timer("heartbeat", hb, { tone: "busy", label: "heartbeat", mark: false });
    ctx.mark(`leader`, "ok");
    lastWin = { by: ctx.id, at: net.stepSerial };
    line("voteReply");
    // the crash story's question: does the new leader still hold what was committed before the crash?
    const won = { leader: chip(ctx.id), leaderId: ctx.id, term: st.term, votes: st.votes.length };
    const kept = crashed && ctx.id !== crashed && !asked.has("reelect.survive")
      ? st.log.slice(0, maxCommit).filter((e) => e.client).map((e) => e.cmd) : [];
    if (kept.length) {
      const what = kept.join(", ");
      ask("reelect.survive", `${T(crashed)} crashed after ${what} was committed. Will the new leader still have ${what}?`,
        [`No: it was lost with ${T(crashed)}`, "Yes: voters only back a log as complete as theirs", "Only if the client sends it again"], 1,
        `A majority stored ${what}. Any winning majority includes one of them, and that server refuses a log without it.`);
      return say(ctx, "reelect.win", { ...won, kept: kept.map(K) }, `${R(ctx.id)} wins term ${st.term} once ${st.votes.length} of ${N} votes arrive. Its log still has ${fmt.and(kept.map(C))}.`);
    }
    say(ctx, "elect.win", { ...won, noop }, `${R(ctx.id)} wins term ${st.term} once ${st.votes.length} of ${N} votes arrive` +
      (noop ? `; it writes an empty ${C("nop")} for its term.` : "."));
  }

  // ---- election ----
  for (const id of ids) net.onStart(id, (ctx) => resetElection(ctx));

  net.onTimer("*", "election", (ctx) => {
    const st = ctx.state;
    st.term += 1;
    st.role = "candidate";
    st.votedFor = ctx.id;
    st.votes = [ctx.id];
    st.leader = null;
    if (crashed && !sawCandidateAfterCrash) { sawCandidateAfterCrash = true; ctx.phase("Re-election", { id: "reelect", about: ABOUT.reelection }); }
    resetElection(ctx);
    show(ctx);
    line("timeout");
    if (st.votes.length >= majority) return becomeLeader(ctx);
    ctx.broadcast(MSG.vote, { term: st.term, candidate: ctx.id, lastLogIndex: lastIndex(st), lastLogTerm: lastTerm(st) });
    const t = st.term, cut = cutOff(ctx);
    if (cut.length) return say(ctx, "elect.cut-off", { cand: chip(ctx.id), candId: ctx.id, term: t, cutIds: cut }, `${R(ctx.id)}'s timer runs out: it runs in term ${t}, but ${refs(cut)} can't hear it.`);
    sing(ctx, `elect|${t}`, (n) => (n > 1 ? "elect.tie" : "elect.timeout"), { term: t }, (list, n) => n > 1
      ? `${crowd(list, n)} time out together, each running in term ${t}: the votes may split.`
      : `${list}'s timer runs out first: it runs for leader in {term:term} ${t} and votes for itself.`);
  });

  net.on("*", MSG.vote, (b0, ctx) => {
    const b = b0.body, st = ctx.state;
    line("vote");
    let stepped = false;
    if (b.term > st.term) stepped = becomeFollower(ctx, b.term) !== "follower";
    const upToDate = b.lastLogTerm > lastTerm(st) || (b.lastLogTerm === lastTerm(st) && b.lastLogIndex >= lastIndex(st));
    const free = st.votedFor === null || st.votedFor === b.candidate || bugs.has("double-vote");
    const grant = b.term === st.term && free && (upToDate || bugs.has("vote-any-log"));
    if (grant) { st.votedFor = b.candidate; resetElection(ctx); }
    ctx.reply(b0, MSG.voteReply, { term: st.term, granted: grant });
    const cv = { cand: chip(b.candidate), candId: b.candidate };
    if (grant) {
      grantAt.set(b.candidate, net.stepSerial);
      sing(ctx, `grant|${b.candidate}|${st.term}|${stepped}`, "vote.grant", { ...cv, term: st.term, stepped }, (list, n) =>
        `${crowd(list, n)}${stepped ? ` ${v(n, "steps", "step")} down and` : ""} ${v(n, "votes", "vote")} for ${R(b.candidate)}: its log is as complete as ${v(n, "its own", "theirs")}.`);
    } else if (b.term < st.term) {
      const now = st.term;
      sing(ctx, `old-vote|${b.candidate}|${b.term}|${now}`, "vote.old", { ...cv, term: b.term, own: now }, (list, n) => `${crowd(list, n)} ${v(n, "refuses", "refuse")} ${R(b.candidate)}: term ${b.term} is older than ${v(n, "its own", "their")} term ${now}.`);
    } else if (!free) sing(ctx, `voted|${b.candidate}|${st.term}`, "vote.taken", { ...cv, same: grantAt.get(b.candidate) === net.stepSerial }, (list, n) => (grantAt.get(b.candidate) === net.stepSerial
      ? `${crowd(list, n)} already voted.`   // after "s2 and s5 vote for s1" in the same step
      : `${crowd(list, n)} ${v(n, "refuses", "refuse")} ${R(b.candidate)}: ${v(n, "it", "they")} already voted.`), ctx.id, { as: "taken" });
    else sing(ctx, `fuller|${b.candidate}|${st.term}`, "vote.behind", cv, (list, n) => `${crowd(list, n)} ${v(n, "refuses", "refuse")} ${R(b.candidate)}: ${v(n, "its own log is", "their logs are")} more complete.`);
  });

  net.on("*", MSG.voteReply, (m, ctx) => {
    const b = m.body, st = ctx.state;
    line("voteReply");
    if (b.term > st.term) {
      becomeFollower(ctx, b.term);
      return say(ctx, "term.newer", { who: chip(ctx.id), whoId: ctx.id, from: chip(m.from), fromId: m.from, term: b.term }, `${R(ctx.id)} sees the newer term ${b.term} in ${R(m.from)}'s reply and steps down.`);
    }
    const cv = { cand: chip(ctx.id), candId: ctx.id };
    if (st.role !== "candidate" || b.term !== st.term) {
      const lead = st.role === "leader" && b.term === st.term;
      return sing(ctx, `late|${ctx.id}|${b.term}`, "vote.late", { ...cv, leads: lead }, (list, n) => (lead && lastWin.by === ctx.id && lastWin.at === net.stepSerial ? null
        : `${R(ctx.id)} ${lead ? "already leads" : "has moved on"}; the late ${v(n, "vote", "votes")} of ${list} ${v(n, "changes", "change")} nothing.`), m.from, { minor: true });
    }
    // the tally is read when the step is written: if the candidate won in this same step, its win says it all
    if (!b.granted) return sing(ctx, `deny|${ctx.id}|${st.term}`, "vote.denied", { ...cv, votes: st.votes.length, need: majority }, (list, n) => (lastWin.by === ctx.id && lastWin.at === net.stepSerial ? null
      : `${crowd(list, n)} ${v(n, "turns", "turn")} ${R(ctx.id)} down; it has ${st.votes.length} of the ${majority} votes it needs.`), m.from);
    if (!st.votes.includes(m.from)) st.votes.push(m.from);
    if (st.votes.length >= majority) return becomeLeader(ctx);
    const term = st.term;
    sing(ctx, `tally|${ctx.id}|${term}`, "vote.tally", { ...cv, votes: st.votes.length, need: majority }, () => (st.role === "candidate" && st.term === term ? `${R(ctx.id)} has ${st.votes.length} of the ${majority} votes it needs.` : null));
  });

  // ---- replication ----
  net.onTimer("*", "heartbeat", (ctx) => {
    const st = ctx.state;
    if (st.role !== "leader") return;
    sendAppends(ctx);
    ctx.timer("heartbeat", hb, { tone: "busy", label: "heartbeat", mark: false });
    s.line(null);
    const behind = ctx.peers.filter((f) => st.nextIndex[f] <= lastIndex(st));
    const idle = ctx.peers.filter((f) => !behind.includes(f));
    const cut = cutOff(ctx);
    if (cut.length) return sing(ctx, "cutsend", "split.send", { cutIds: cut }, (list, n) => (n > 1
      ? `${crowd(list, n)} keep sending, but nothing crosses the split.`
      : `${list} keeps sending, but nothing reaches ${refs(cut)} across the split.`));
    const many = (one) => (n) => (n > 1 ? `${one}-many` : one);
    if (!behind.length) return sing(ctx, "heartbeat", many("beat.send"), {}, (list, n) => `${crowd(list, n)} ${v(n, "sends", "send")} {term:heartbeat|heartbeats}, “still here” messages, so no one starts an election.`);
    const detail = `${R(ctx.id)} resends entries to ${refs(behind)}${idle.length ? ` and ${v(idle.length, "a heartbeat", "heartbeats")} to ${refs(idle)}` : ""}.`;
    sing(ctx, "resend", many("beat.resend"), { leader: chip(ctx.id), leaderId: ctx.id, behindIds: behind, idleIds: idle }, (list, n) => (n > 1 ? `${crowd(list, n)} each resend entries to the servers behind them.` : detail));
  });

  net.on("*", MSG.update, (m, ctx) => {
    const b = m.body, st = ctx.state;
    if (b.term < st.term) {
      line("appendStale");
      ctx.reply(m, MSG.updateReply, { term: st.term, success: false, prev: b.prevLogIndex, last: lastIndex(st) });
      const now = st.term;
      return sing(ctx, `stale-ae|${m.from}|${b.term}|${now}`, "update.old", { from: chip(m.from), fromId: m.from, term: b.term, own: now }, (list, n) => `${crowd(list, n)} ${v(n, "rejects", "reject")} ${R(m.from)}: its term ${b.term} is older than ${v(n, "its own", "their")} term ${now}.`);
    }
    let stepped = false;
    if (b.term > st.term || st.role !== "follower") { const was = becomeFollower(ctx, b.term); stepped = was !== "follower" && was; }
    st.leader = b.leader;
    resetElection(ctx);
    if (b.prevLogIndex > lastIndex(st) || termAt(st, b.prevLogIndex) !== b.prevLogTerm) {
      line("appendCheck");
      ctx.reply(m, MSG.updateReply, { term: st.term, success: false, prev: b.prevLogIndex, last: lastIndex(st) });
      return say(ctx, "update.gap", { who: chip(ctx.id), whoId: ctx.id, from: chip(m.from), fromId: m.from, index: b.prevLogIndex, term: b.prevLogTerm },
        `${R(ctx.id)} lacks entry ${b.prevLogIndex} from term ${b.prevLogTerm} and refuses the update.`);
    }
    let i = b.prevLogIndex, added = [], cut = 0, from = 0;
    for (const e of b.entries) {
      i++;
      if (i <= lastIndex(st)) {
        if (st.log[i - 1].term === e.term) continue;
        if (bugs.has("no-truncate")) { st.log[i - 1] = { ...e }; continue; }
        if (scenario === "partition" && ctx.id === stranded && !asked.has("heal.replaced")) {
          const old = st.log[i - 1];
          ask("heal.replaced", `The network has joined up again. What happens to ${T(ctx.id)}'s uncommitted ${old.cmd} from term ${old.term}?`,
            [`${T(ctx.id)} copies it to everyone`, `It is replaced by the term-${e.term} leader's log`, `It counts, because ${T(ctx.id)} led first`], 1,
            `${old.cmd} never reached a majority, so it never counted. The leader of the newer term decides what stays.`);
        }
        cut += lastIndex(st) - i + 1;
        st.log.length = i - 1;
        truncateTiles(ctx.id, i);
      }
      st.log.push({ ...e });
      appendTile(ctx.id, e);
      if (!added.length) from = i;
      added.push(e.cmd);
    }
    const match = b.prevLogIndex + b.entries.length;
    let learned = 0;
    if (b.leaderCommit > st.commitIndex) {
      const old = st.commitIndex;
      st.commitIndex = Math.max(old, Math.min(b.leaderCommit, match));
      learned = st.commitIndex - old;
      if (learned) { apply(st); commitTiles(ctx.id, old + 1, st.commitIndex); gauges(st); }
      // the recovered server has caught up; if the story goes on (a lost ack, a retry), it gets its own chapter
      if (learned && ctx.id === crashed && recovered && !synced && st.commitIndex >= maxCommit) synced = true;   // caught up (no chapter of its own)
    }
    ctx.reply(m, MSG.updateReply, { term: st.term, success: true, match });
    line(added.length || cut ? "append" : learned ? "learn" : "heartbeat");
    // what the server did, then (its own sentence, so servers that did the same merge) the commit it learned
    const where = added.length > 1 ? `entries ${from}–${from + added.length - 1}` : `entry ${from}`;
    const conflicts = fmt.plural(cut, "uncommitted entry", "uncommitted entries");
    let did = null;   // [key, singular, plural]
    // several entries are named by their indexes alone (the tiles show them), so a merged step stays short
    const what = added.length === 1 ? `${C(added[0])} as ${where}` : where;
    if (cut) did = [`cut|${conflicts}`, `replaces ${conflicts}`, `replace ${conflicts}`];
    else if (added.length) did = [`add|${from}|${added.join(",")}`, `copies ${what}`, `copy ${what}`];
    // a replacement says enough; the commit it learns shows on the tiles
    const mark = st.commitIndex === 1 ? "entry 1" : `up to entry ${st.commitIndex}`;
    const uv = { from: chip(m.from), fromId: m.from };
    if (stepped) sing(ctx, `down|${b.term}|${stepped}`, "update.step-down", { term: b.term, was: stepped }, (list, n) => `${crowd(list, n)} ${v(n, "stops", "stop")} ${stepped === "leader" ? "leading" : "running"}.`, ctx.id, { rank: 0.5, as: "down" });
    // servers that copied the same entries and learned the same commit share one sentence ("… and mark … committed").
    // A step that says anything non-routine drops its routine items, so a commit learned alongside a copy is compared
    // only among the servers that also copied (`shown`). A commit learned on its own is routine: beside a copy its
    // sentence drops out (the tiles light), so a lossy step never strings three sentences together
    const g = aeStep.at === net.stepSerial ? aeStep : (aeStep = { at: net.stepSerial, did: new Map(), learn: new Map() });
    const dk = did && `${m.from}|${did[0]}`, lk = learned && !cut && `${m.from}|${st.commitIndex}`;
    if (dk) { if (!g.did.has(dk)) g.did.set(dk, new Set()); g.did.get(dk).add(ctx.id); }
    if (lk) {
      if (!g.learn.has(lk)) g.learn.set(lk, { all: new Set(), copied: new Set(), mark, get shown() { return this.copied.size ? this.copied : this.all; } });
      g.learn.get(lk).all.add(ctx.id);
      if (did) g.learn.get(lk).copied.add(ctx.id);
    }
    const dv = cut ? { ...uv, cut } : { ...uv, entries: added.map(K), first: from, last: from + added.length - 1 };
    const copyId = () => (cut ? "update.replace" : dv.commit !== undefined || added.length > 1 ? "update.copy-commit" : "update.copy");
    if (dk) sing(ctx, `ae|${dk}`, copyId, dv, (list, n) => {
      const both = [...g.learn.values()].find((x) => sameSet(x.shown, g.did.get(dk)));
      if (both) dv.commit = st.commitIndex;
      // a replacement alone says whose entries win; beside other lines (a copy, a step-down) it stays short
      const whose = cut && g.did.size === 1 && ![...subjects.keys()].some((k) => k.startsWith("down|")) ? " with the leader's" : "";
      return `${crowd(list, n)} ${n > 1 ? did[2] : did[1]}${whose}${both ? ` and ${v(n, "marks", "mark")} ${both.mark} committed` : ""}.`;
    });
    if (lk) sing(ctx, `learn|${lk}`, "update.learn", { ...uv, commit: st.commitIndex }, (list, n) => ([...g.did.values()].some((ids) => sameSet(ids, g.learn.get(lk).shown)) ? null
      : `${crowd(list, n)} ${v(n, "marks", "mark")} ${mark} committed.`), ctx.id, { minor: true });
    if (!did && !learned) sing(ctx, `hb|${m.from}`, "update.beat", uv, (list, n) => `${crowd(list, n)} ${v(n, `takes ${R(m.from)}'s heartbeat and restarts its timer`, `take ${R(m.from)}'s heartbeat and restart their timers`)}.`, ctx.id, { minor: true });
  });

  net.on("*", MSG.updateReply, (m, ctx) => {
    const b = m.body, st = ctx.state, f = m.from;
    if (b.term > st.term) {
      line("reply");
      becomeFollower(ctx, b.term);
      return say(ctx, "term.newer", { who: chip(ctx.id), whoId: ctx.id, from: chip(f), fromId: f, term: b.term }, `${R(ctx.id)} sees the newer term ${b.term} in ${R(f)}'s reply and steps down.`);
    }
    const lv = { leader: chip(ctx.id), leaderId: ctx.id };
    if (st.role !== "leader" || b.term !== st.term) return sing(ctx, `stale|${ctx.id}`, "reply.old", lv, (list, n) => `${R(ctx.id)} ignores ${v(n, "an old reply", "old replies")} from ${list}.`, f, { minor: true });
    if (b.success) {
      st.matchIndex[f] = Math.max(st.matchIndex[f] ?? 0, b.match);
      st.nextIndex[f] = Math.max(st.nextIndex[f], st.matchIndex[f] + 1);
      const before = st.commitIndex;
      const again = lastCommit.by === ctx.id && lastCommit.at === net.stepSerial;   // a second commit in one step
      const n = advanceCommit(ctx);
      line(n ? "commit" : "reply");
      if (n) {
        const have = 1 + ctx.peers.filter((x) => (st.matchIndex[x] ?? 0) >= st.commitIndex).length;
        const top = st.log[st.commitIndex - 1];
        const older = st.log.slice(before, st.commitIndex - 1).filter((e) => e.term < st.term && e.cmd !== "nop");
        // the aha: the first client command to reach a majority counts now, without waiting for every server
        const first = st.log.slice(before, st.commitIndex).find((e) => e.client);
        if (first && have < N) {
          ask("copy.commit", `${T(ctx.id)} has heard that ${first.cmd} is on ${have} of the ${N} servers, itself included. Can it count it as committed now?`,
            [`No: all ${N} servers must have it first`, `Yes: ${have} of ${N} is a majority`, `Yes: it was safe once ${T(ctx.id)} wrote it`], 1,
            `Any later majority must include one of these ${have} servers, so ${first.cmd} can never be lost.`);
        }
        const head = `${R(ctx.id)} hears ${C(top.cmd)} is on ${have} of ${N}, a majority: it {tone:ok|commits} it`;
        // an older-term entry committed by counting a newer one (Figure 8's lesson) is its own move
        return say(ctx, older.length ? "commit.older" : "commit.majority", { ...lv, cmd: K(top.cmd), index: st.commitIndex, have, older: older.map((e) => K(e.cmd)), more: n > 1 },
          older.length ? `${head} and the older ${fmt.and(older.map((e) => C(e.cmd)))} too.`
          : n > 1 ? `${head} and every entry before it.` : `${head}.`, { minor: again });   // the tiles show a second one
      }
      const upTo = st.matchIndex[f];
      const cut = cutOff(ctx);
      const pend = st.log[lastIndex(st) - 1];
      const reach = ctx.peers.length - cut.length + 1;
      if (reach < majority && !strandedSaid && pend && pend.term === st.term && upTo === lastIndex(st) && st.commitIndex < upTo) {
        // the stranded leader: the servers it can still reach are not a majority (said once, then routine acks)
        stranded = ctx.id;
        strandedSaid = true;
        line("commit");   // the majority check is what fails
        const held = 1 + ctx.peers.filter((x) => (st.matchIndex[x] ?? 0) >= upTo).length;
        ask("split.minority", `${T(ctx.id)} is cut off with only ${T(f)}, which has just stored ${pend.cmd}. Can ${T(ctx.id)} commit it?`,
          [`Yes: ${T(ctx.id)} is still the leader`, `No: ${held} of ${N} servers is not a majority`, `Yes: once ${T(f)} confirms it`], 1,
          `A majority of ${N} is ${majority}. The other ${N - held} servers can't hear ${T(ctx.id)}, so ${pend.cmd} can't reach ${majority}.`);
        return say(ctx, "split.no-majority", { ...lv, who: chip(f), whoId: f, cmd: K(pend.cmd), held },
          `${R(f)} stores ${C(pend.cmd)}, but ${held} of ${N} servers is no majority: ${R(ctx.id)} cannot commit it.`);
      }
      return sing(ctx, `match|${ctx.id}`, "reply.match", lv, (list, n) => (lastCommit.by === ctx.id && lastCommit.at === net.stepSerial ? null
        : `${crowd(list, n)} ${v(n, "confirms", "confirm")}: ${v(n, "its log matches", "their logs match")} ${R(ctx.id)}'s.`), f, { minor: true });
    }
    line("replyFail");
    st.nextIndex[f] = Math.max(1, (st.matchIndex[f] ?? 0) + 1, Math.min(b.prev, b.last + 1));
    sendAppend(ctx, f);
    // followers that lack the same entry get one sentence: the leader steps back for each of them alike
    const next = st.nextIndex[f];
    sing(ctx, `back|${ctx.id}|${b.prev}|${next}`, "update.back", { ...lv, whoId: f, missing: b.prev, next },
      (list, n) => `${crowd(list, n)} ${v(n, "lacks", "lack")} entry ${b.prev}, so ${R(ctx.id)} steps back to entry ${next} and resends.`, f, { rank: 2 });
  });

  // ---- the client ----
  const cmdBy = new Map(cmds.map((c) => [c.id, c]));
  // a client gives up on a request only after it could have seen a new leader elected
  const RETRY = Math.max(3 * hb + 2 * latency, eMin);
  const waiting = new Set();
  const retries = {};
  let answeredAt = -1;   // the step in which the client last heard an answer
  function discover() {
    const ls = leaders();
    if (!ls.length) return null;
    return ls.reduce((a, b) => (net.state(b).term > net.state(a).term ? b : a));
  }
  // the client keeps talking to the leader it believes in; only a retry, a refusal that names no leader ("lookup"), or
  // having none makes it look again
  function submit(c, why) {
    const cl = net.state("client");
    if (cl.acked.includes(c.id)) return;
    if (!cl.leader || why === "retry" || why === "lookup") cl.leader = discover();
    const target = cl.leader;
    if (!target) {
      if (why === "retry" && !waiting.has(c.id)) { waiting.add(c.id); say(net, "client.wait", { cmd: K(c.cmd) }, `No answer for ${C(c.cmd)} and no leader to ask: the client waits.`); }
      net.at(net.now + 40, () => submit(c, why), { quiet: true });
      return;
    }
    waiting.delete(c.id);
    cl.pending[c.id] = net.now;
    if (why === "retry") retries[c.id] = (retries[c.id] ?? 0) + 1;   // a retry is a step of its chapter, not a chapter
    net.send("client", target, MSG.command, { id: c.id, cmd: c.cmd });
    net.node("client").timer(`retry ${c.id}`, RETRY, { label: "retry", mark: false });
    const next = why === "retry" ? "client.retry" : answeredAt === net.stepSerial ? "client.next" : "client.send";
    // right after an answer the two share a step (client.done-next): the next command keeps its own name, nextCmd
    say(net, next, { cmd: K(c.cmd), leader: chip(target), leaderId: target, ...(next === "client.next" ? { nextCmd: K(c.cmd) } : {}), ...(why === "retry" ? { after: RETRY } : {}) }, why === "retry"
      ? `No answer for ${C(c.cmd)} after ${fmt.ms(RETRY)}: the client sends it again, to ${R(target)}.`
      : answeredAt === net.stepSerial ? `Next it sends ${C(c.cmd)} to ${R(target)}.`
        : `The client sends ${C(c.cmd)} to ${R(target)}, the leader it knows.`);
  }
  for (const c of cmds) net.onTimer("client", `retry ${c.id}`, () => { s.line(null); submit(c, "retry"); });
  // the figure's client is closed-loop (window 1); tests may pipeline several commands to grow stale log tails
  const window = Math.max(1, opt.window ?? 1);
  function submitNext() {
    const cl = net.state("client");
    while (nextCmd < cmds.length && cmds.slice(0, nextCmd).filter((c) => !cl.acked.includes(c.id)).length < window) submit(cmds[nextCmd++], "first");
  }

  net.on("*", MSG.command, (m, ctx) => {
    const st = ctx.state, b = m.body;
    s.line(null);
    if (st.role !== "leader") {
      ctx.reply(m, MSG.notLeader, { id: b.id, hint: st.leader });
      return say(ctx, "client.refused", { who: chip(ctx.id), whoId: ctx.id, cmd: K(b.cmd), ...(st.leader ? { hint: chip(st.leader), hintId: st.leader } : {}) },
        `${R(ctx.id)} is not the leader and turns ${C(b.cmd)} away${st.leader ? `, pointing at ${R(st.leader)}` : ""}.`);
    }
    const at = st.log.findIndex((e) => e.id === b.id);
    const lv = { leader: chip(ctx.id), leaderId: ctx.id, cmd: K(b.cmd) };
    if (at >= 0) {
      if (at < st.commitIndex) ctx.send("client", MSG.answer, { id: b.id, index: at + 1, cmd: b.cmd });
      const held = 1 + ctx.peers.filter((f) => (st.matchIndex[f] ?? 0) > at).length;
      if (at >= st.commitIndex && st.log[at].term < st.term && held >= majority && !noop && explainStall) {
        // §8's liveness gap, shown rather than waited out: nothing of the leader's own term will ever arrive
        ctx.phase("Stuck", { id: "stuck", about: ABOUT.stuck });
        say(ctx, "stuck.old", { ...lv, held, term: st.log[at].term }, `${R(ctx.id)} has ${C(b.cmd)} on ${held} of ${N} servers, but from term ${st.log[at].term}: it can never be committed.`);
        return ctx.stop();
      }
      return say(ctx, "command.again", { ...lv, index: at + 1, committed: at < st.commitIndex },
        `${R(ctx.id)} already has ${C(b.cmd)} as entry ${at + 1}${at < st.commitIndex ? ", committed: it answers again" : "; it waits for a majority"}.`);
    }
    const e = { term: st.term, cmd: b.cmd, id: b.id, client: true };
    st.log.push(e);
    appendTile(ctx.id, e);
    sendAppends(ctx);
    ctx.timer("heartbeat", hb, { tone: "busy", label: "heartbeat", mark: false });
    const cut = cutOff(ctx);
    say(ctx, cut.length ? "split.add" : "command.add", { ...lv, index: lastIndex(st), ...(cut.length ? { cutIds: cut } : {}) }, cut.length
      ? `${R(ctx.id)} adds ${C(b.cmd)} as entry ${lastIndex(st)}, but its copies to ${refs(cut)} die at the split.`
      : `${R(ctx.id)} adds ${C(b.cmd)} to its log as entry ${lastIndex(st)} and sends copies.`);
    if (scenario === "crash" && !crashed && cmdBy.get(b.id)?.n === 2) {
      crashed = ctx.id;
      net.crash(ctx.id, net.now + Math.max(1, Math.round(latency * 0.6)));
      net.recover(ctx.id, net.now + 900);   // a fallback: normally it returns once the client's work is done (Ack below)
    }
  });

  net.on("client", MSG.notLeader, (m, ctx) => {
    const cl = ctx.state, c = cmdBy.get(m.body.id);
    s.line(null);
    cl.leader = m.body.hint ?? null;
    say(ctx, "client.redirect", { who: chip(m.from), whoId: m.from }, `The client hears that ${R(m.from)} is not the leader.`);
    // refused without a hint, it looks for the leader at once: no timeout has run out, so this is not a retry
    if (c && !cl.acked.includes(c.id)) submit(c, cl.leader ? "redirect" : "lookup");
  });

  net.on("client", MSG.answer, (m, ctx) => {
    const cl = ctx.state, b = m.body;
    s.line(null);
    if (cl.acked.includes(b.id)) return say(ctx, "client.dup", { cmd: K(b.cmd) }, `The client already has an answer for ${C(b.cmd)}.`, { minor: true });
    cl.acked.push(b.id);
    delete cl.pending[b.id];
    cl.leader = m.from;
    ctx.cancel(`retry ${b.id}`);
    answeredAt = net.stepSerial;
    say(ctx, "client.done", { cmd: K(b.cmd), leaderId: m.from }, `The client hears ${C(b.cmd)} is committed.`);
    // the crashed leader comes back once the cluster has finished the client's work without it
    if (crashed && !recovered && !net.isUp(crashed) && cl.acked.length === cmds.length) net.recover(crashed, net.now + 30);
    if (scenario === "partition" && !partitioned) {
      partitioned = true;
      const L = m.from, peer = ids[(ids.indexOf(L) + 1) % N];
      const minority = [L, peer].slice(0, N - majority), rest = ids.filter((x) => !minority.includes(x));
      const at = net.now + 2, heal = at + 450;
      net.at(at, () => { s.phase("The network splits", { id: "split", about: ABOUT.partition }); note("split.cut", { sideA: minority, sideB: rest }, 2); leaderlessSince = net.now; }, { quiet: true });   // the phase lands on the partition's own step
      net.at(heal, () => { s.phase("Heal", { id: "heal", about: ABOUT.heal }); note("heal.join", {}, 2); }, { quiet: true });
      net.partition([minority, rest], at, heal);
      net.at(at + 20, () => submitNext(), { quiet: true });
    } else submitNext();
  });

  net.onCrash("*", (ctx) => {
    if (ctx.id === "client") return;
    const lead = ctx.state.role === "leader";
    s.line(null);
    if (lead) { ctx.phase("Crash", { id: "crash", about: ABOUT.crash }); leaderlessSince = net.now; }
    say(ctx, "crash.down", { who: chip(ctx.id), whoId: ctx.id, leader: lead }, `${lead ? "Leader " : ""}${R(ctx.id)} {tone:fail|crashes}. Its log is saved on disk, so it survives.`);
  });
  net.onRecover("*", (ctx) => {
    if (ctx.id === "client") return;
    const st = ctx.state;
    s.line(null);
    ctx.phase("Catch-up", { id: "catchup", about: ABOUT.catchup });
    recovered = true;
    st.role = "follower"; st.commitIndex = 0; st.lastApplied = 0; st.kv = {}; st.votes = []; st.leader = null; st.nextIndex = {}; st.matchIndex = {};
    for (const t of tiles.get(ctx.id)) s.set(t, { dim: true });
    resetElection(ctx);
    show(ctx);
    say(ctx, "catchup.restart", { who: chip(ctx.id), whoId: ctx.id, entries: st.log.length }, `${R(ctx.id)} {tone:ok|restarts} with its ${fmt.plural(st.log.length, "entry", "entries")}, unsure which are committed.`);
  });

  // ---- scenario schedule: a closed-loop client sends its next command when the previous one is acked ----
  net.at(eMin, () => submitNext(), { quiet: true });
  if (opt.faults) opt.faults(net, rng(p.seed).fork("faults"), ids);

  s.phase("Election", { id: "elect", about: ABOUT.election });
  note("elect.start", { min: eMin, max: eMax }, 2);   // the opening step, which the runtime writes from the intro
  const allDone = () => {
    const cl = net.state("client");
    if (cl.acked.length < cmds.length) return false;
    const L = discover();
    if (!L) return false;
    const target = lastIndex(net.state(L));
    return ids.every((id) => !net.isUp(id) || net.state(id).commitIndex === target) && (!crashed || net.isUp(crashed));
  };
  net.run({
    until: plan.until,
    intro: `${N} servers, each with a copy of the notebook: its {term:log}. Each starts a random ${eMin}–${eMax} ms timer.`,
    stopWhen: opt.stopWhen === false ? undefined : allDone,
    maxSteps: opt.maxSteps ?? 600,
  });
  return net;
}
