// Raft (Ongaro & Ousterhout, USENIX ATC 2014), run for real on the sim/actors runtime: randomized election timeouts,
// RequestVote with the log up-to-date check, AppendEntries with the consistency check and conflict truncation,
// commit only of current-term entries by majority (a new leader appends a no-op, §8), and a client that retries.
// Scenarios: the happy path; the leader crashing mid-replication; a partition that strands the leader in a minority.
//
// The cluster board (five servers in a ring, each tray is its log: one tile per entry, keyed by term, dim until the
// server knows it is committed; LED = role, sub = term) with the client below it. An optional space-time board, off by
// default and turned on in settings (knob `lanes`: "on", or "auto" for wide screens only), adds one rail per server
// where every message draws a diagonal and timeouts, elections and commits leave marks. Each server's inspector state is its Raft state plus two ghost (history) variables the
// invariants read: ledTerms (terms it led) and commits (entries it committed as leader, with the term it did so in).

import { network } from "../../sim/actors.mjs";
import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf, idsOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "Raft",
  subtitle: "How five servers agree on one log",
  kicker: "Distributed systems",
  fig: 3,
  cite: { text: "Ongaro & Ousterhout, “In Search of an Understandable Consensus Algorithm”, USENIX ATC 2014", url: "https://raft.github.io/raft.pdf" },
  theme: "dark",
  hook: "Five servers, any of which can crash. How do they still agree on one log?",
  takeaway: "An entry is committed once a majority of servers store it. Any two majorities share a server, so a committed entry can never be lost.",
};

export const params = {
  nodes: { label: "Servers", type: "int", min: 3, max: 7, value: 5 },
  commands: { label: "Client commands", type: "text", value: "x=3 y=7 x=5" },
  latency: { label: "Latency (ms)", type: "int", min: 2, max: 30, value: 12 },
  jitter: { label: "Jitter (ms)", type: "int", min: 0, max: 15, value: 5 },
  electionMin: { label: "Election timeout from (ms)", type: "int", min: 100, max: 400, value: 150 },
  electionMax: { label: "Election timeout to (ms)", type: "int", min: 150, max: 600, value: 300 },
  heartbeat: { label: "Heartbeat (ms)", type: "int", min: 20, max: 100, value: 50 },
  drop: { label: "Drop rate", type: "float", min: 0, max: 0.3, step: 0.01, value: 0 },
  noop: { label: "No-op on election (§8)", type: "bool", value: true },
  lanes: {
    label: "Space-time board", type: "select", value: "off",
    options: [{ value: "auto", label: "Auto (on a wide screen)" }, { value: "on", label: "Show" }, { value: "off", label: "Hide" }],
  },
  layout: {
    label: "Layout", type: "select", value: "auto",
    options: [{ value: "auto", label: "Auto (fit the screen)" }, { value: "wide", label: "Side by side" }, { value: "stacked", label: "Cluster above the time board" }],
  },
  seed: { label: "Seed", type: "int", value: 3 },
};

export const scenarios = [
  { id: "happy", label: "Normal run", whatIf: "nothing goes wrong",
    description: "The servers elect a leader, which copies each client command to a majority before it counts." },
  { id: "crash", label: "Leader crashes", whatIf: "the leader crashes",
    description: "The leader crashes partway through replication, and the others must elect a new one without losing a committed entry.",
    takeaway: "The leader crashed and nothing committed was lost: only a server holding every committed entry could win the new majority." },
  { id: "partition", label: "Partition", whatIf: "the network splits",
    description: "The network splits and strands the leader in a minority; the majority elects its own leader, then the network heals.",
    takeaway: "A leader cut off in a minority cannot commit anything. When the network heals, its uncommitted entries give way to the majority's log." },
];

export const counters = {
  term: { label: "election term", short: "term", format: "int", primary: true,
    hint: "Raft's election counter. It goes up by one each time a server stands for leader." },
  committed: { label: "entries committed", short: "committed", format: "int", primary: true,
    hint: "Log entries a majority of servers has stored. A committed entry is never lost." },
  leaderless: { label: "time without a leader", short: "no leader", format: "ms", primary: ["crash", "partition"],
    hint: "The latest stretch with no leader, from boot or a failure until the next election is won." },
  messages: { label: "messages sent", format: "int",
    hint: "Every vote request, log append, heartbeat and reply sent between servers." },
  lost: { label: "messages lost", format: "int",
    hint: "Messages that never arrived: cut off by a partition, or dropped by the network." },
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
    "        return reply(AppendReply(self.term, False))",
    "    self.log.replace_from(m.prev_index + 1, m.entries)   # drop conflicts, append",
    "    self.commit = max(self.commit, min(m.leader_commit, m.prev_index + len(m.entries)))",
    "    reply(AppendReply(self.term, True, m.prev_index + len(m.entries)))",
    "",
    "def on_append_reply(self, m):",
    "    if m.success: self.match[m.sender] = m.match",
    "    else: self.next[m.sender] -= 1; self.send_append(m.sender)",
    "    n = self.majority_match()",
    "    if n > self.commit and self.log[n].term == self.term:   # only this term's",
    "        self.commit = n",
  ].join("\n"),
};
const LINES = {
  timeout: [1, 4], vote: [6, 11], voteReply: [13, 15], appendStale: [17, 18], heartbeat: [19, 19],
  appendCheck: [20, 21], append: [22, 24], learn: [23, 23], reply: [27, 27], replyFail: [28, 28], commit: [29, 31],
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
  s.phase("Agreement", { about: same
    ? "Every server now holds the same committed entries in the same order. That is the one guarantee Raft exists to give, whatever crashed or split along the way."
    : "Where the cluster stands at the end of the run." });
  s.focus("board");   // the cluster and its client: the payoff shot frames them large, nothing cut under the dock
  s.lit(...up);
  s.step(same && cmds.length
    ? `${up.length === N ? `All ${N}` : `${up.length} of ${N}`} servers hold the same committed log: ${cmds.map((c) => fmt.code(c)).join(", ")}, in the same order.`
    : `${fmt.plural(st.commitIndex, "entry", "entries")} committed on ${fmt.ref(up[0] ?? ids[0])}.`, { t: net.now });
}

// one plain-English line per chapter, for the explain panel (s.phase(name, { about }))
const ABOUT = {
  election: "No server is leader yet. Each waits a random timeout; the first to time out becomes a candidate, starts a new term and asks the others for votes. A majority of votes makes it leader.",
  replication: "The leader appends each client command to its own log and copies it to the followers. Once a majority of servers hold an entry, it is committed: safe to apply and to acknowledge.",
  crash: "The leader stops. Followers stop hearing its heartbeats, so for a while there is no leader. Nothing committed is lost, because a majority of servers already holds it.",
  reelection: "A follower's timeout fires and it runs for the next term. Servers only vote for a candidate whose log is at least as up to date as theirs, so the winner has every committed entry.",
  retries: "The client got no answer in time, so it sends the same command again to the server it now believes leads. A leader that already has the command does not append it twice.",
  catchup: "The crashed server restarts as a follower. The leader's AppendEntries messages find where the two logs differ, replace any stale entries and fill in what it missed.",
  synced: "The restarted server's log now matches the leader's, and it knows what is committed. The run goes on while the client still waits for an answer to its last command.",
  partition: "The network splits and leaves the leader in a minority, with too few servers to form a majority. Anything it accepts from now on cannot commit.",
  newLeader: "On the majority side a follower times out and wins a higher term. Commands commit there again, while the stranded old leader still believes it leads.",
  heal: "The partition heals. The old leader hears the higher term and steps down, and the entries it could never commit are replaced by the new leader's log.",
  stuck: "A leader may only count copies for entries from its own term. Without a no-op from this term, the older entry can never commit, even though a majority holds it.",
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
  const eMin = Math.min(p.electionMin, p.electionMax), eMax = Math.max(p.electionMin + 30, p.electionMax, eMin + 30);
  const hb = p.heartbeat;
  const R = (id) => fmt.ref(id);
  const C = (c) => fmt.code(c);
  const T = (id) => id.toUpperCase();   // plain-text server name (predict questions are plain text)
  // a term is an identity (one colour per term) for the first eight terms; later terms stay neutral rather than reuse one
  const termKey = (t) => (t >= 1 && t <= 8 ? `term ${t}` : undefined);
  const v = (n, one, many) => (n > 1 ? many : one);
  const line = (k) => s.line(...LINES[k]);
  const asks = opt.asks !== false && opt.stopWhen !== false;

  // ---- world: the cluster board (ring + client) and, opt-in, the space-time board ----
  // the time board is off by default (lanes: "off"); "on" shows it, "auto" shows it on wide screens only (it can't be
  // read at phone width). layout auto: side by side on a wide screen, a 2-column cluster stacked over the client on a
  // portrait phone
  const portrait = !!opt.env?.portrait;
  const layout = !p.layout || p.layout === "auto" ? (portrait ? "stacked" : "wide") : p.layout;
  const lanesOn = p.lanes === true || p.lanes === "on" || ((p.lanes === "auto" || p.lanes == null) && !portrait);
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
  const net = network(s, {
    id: "net",
    nodes: ids.map((id) => ({ id, title: T(id), sub: "term 0", tray: { ...tray, of: "tile", order: "row" }, led: "idle" })),
    clients: [{ id: "client", title: "client", sub: "192.0.2.10", variant: "client", led: "idle", in: "board" }],
    in: "cluster",
    latency: { mean: p.latency, jitter: p.jitter },
    drop: p.drop ?? 0,
    seed: p.seed,
    lanes: lanesOn ? { in: "world", length: wide ? 600 : 540, label: "time" } : undefined,   // the scene fits the run to the rail
    focus: ["world"],                    // every step frames both boards: the cluster is never cropped
    // reading pace: one mean latency of flight plays in 1.5 s; no caption flashes by in under 1.2 s
    pace: { at: 1.5, min: 1.2, max: 2.6, minor: 0.6 },
    counters: { sent: "messages", lost: "lost" },
    batch: Math.max(2, 2 * p.jitter),
    // deaths at the partition join the next step (the senders' captions name them); on a very lossy network so do
    // random drops: each still dies visibly with its fail tag, but not every second step narrates a loss
    quiet: (p.drop ?? 0) > 0.1 ? ["partition", "drop"] : ["partition"],
    text: (m) => (m.type === "AppendEntries" ? (m.body.entries.length ? `AppendEntries ×${m.body.entries.length}` : "heartbeat") : m.type),
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
    const tk = { in: id, text: entry.cmd, sub: `t${entry.term}` };
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
  // routine sentences a same-step win or commit already implies are dropped from the merged caption
  let lastWin = { by: null, at: -1 }, lastCommit = { by: null, at: -1 };
  const explainStall = opt.stopWhen !== false;
  const ask = (k, q, options, answer) => { if (asks && !asked.has(k)) { asked.add(k); s.ask(q, options, answer); } };

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
    if (term > st.term) { st.term = term; st.votedFor = null; }
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
    ctx.send(to, "AppendEntries", {
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
      if (e.client) ctx.send("client", "Ack", { id: e.id, index: i, cmd: e.cmd });
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
    if (!sawLeader) { sawLeader = true; ctx.phase("Replication", { about: ABOUT.replication }); }
    else if (scenario === "partition" && !sawNewLeader && cutOff(ctx).length) { sawNewLeader = true; ctx.phase("New leader", { about: ABOUT.newLeader }); }
    if (leaderlessSince !== null) { s.gauge("leaderless", Math.round(net.now - leaderlessSince)); leaderlessSince = null; }
    if (p.noop) {
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
    ctx.say(`${R(ctx.id)} wins term ${st.term} with ${st.votes.length} of ${N} votes` +
      (p.noop ? `, and appends a ${C("nop")} so older entries can commit (§8).` : "."));
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
    if (crashed && !sawCandidateAfterCrash) { sawCandidateAfterCrash = true; ctx.phase("Re-election", { about: ABOUT.reelection }); }
    resetElection(ctx);
    show(ctx);
    line("timeout");
    if (st.votes.length >= majority) return becomeLeader(ctx);
    ctx.broadcast("RequestVote", { term: st.term, candidate: ctx.id, lastLogIndex: lastIndex(st), lastLogTerm: lastTerm(st) });
    const t = st.term, cut = cutOff(ctx);
    if (cut.length) return ctx.say(`${R(ctx.id)} times out and stands for term ${t}, but ${fmt.and(cut.map(R))} cannot hear it.`);
    ctx.chorus(`elect|${t}`, (list, n) => n > 1
      ? `${list} time out together and each stands for term ${t}: the votes may split.`
      : `${list} times out with no leader: it stands for term ${t} and votes for itself.`);
  });

  net.on("*", "RequestVote", (b0, ctx) => {
    const b = b0.body, st = ctx.state;
    line("vote");
    let stepped = false;
    if (b.term > st.term) stepped = becomeFollower(ctx, b.term) !== "follower";
    const upToDate = b.lastLogTerm > lastTerm(st) || (b.lastLogTerm === lastTerm(st) && b.lastLogIndex >= lastIndex(st));
    const free = st.votedFor === null || st.votedFor === b.candidate || bugs.has("double-vote");
    const grant = b.term === st.term && free && (upToDate || bugs.has("vote-any-log"));
    if (grant) { st.votedFor = b.candidate; resetElection(ctx); }
    ctx.reply(b0, "VoteReply", { term: st.term, granted: grant });
    const log = `(term ${b.lastLogTerm}, index ${b.lastLogIndex})`;
    if (grant) {
      ctx.chorus(`grant|${b.candidate}|${st.term}|${stepped}`, (list, n) =>
        `${list}${stepped ? ` ${v(n, "steps", "step")} down and` : ""} ${v(n, "votes", "vote")} for ${R(b.candidate)}: its log ${log} is at least as up-to-date.`);
    } else if (b.term < st.term) ctx.say(`${R(ctx.id)} refuses ${R(b.candidate)}: term ${b.term} is older than its own term ${st.term}.`);
    else if (!free) ctx.say(`${R(ctx.id)} refuses ${R(b.candidate)}: it already voted for ${R(st.votedFor)} in term ${st.term}.`);
    else ctx.say(`${R(ctx.id)} refuses ${R(b.candidate)}: its own log (term ${lastTerm(st)}, index ${lastIndex(st)}) is more up-to-date than ${log}.`);
  });

  net.on("*", "VoteReply", (m, ctx) => {
    const b = m.body, st = ctx.state;
    line("voteReply");
    if (b.term > st.term) {
      becomeFollower(ctx, b.term);
      return ctx.say(`${R(ctx.id)} sees term ${b.term} in ${R(m.from)}'s reply and steps down.`);
    }
    if (st.role !== "candidate" || b.term !== st.term) {
      const lead = st.role === "leader" && b.term === st.term;
      return ctx.chorus(`late|${ctx.id}|${b.term}`, (list, n) => (lead && lastWin.by === ctx.id && lastWin.at === net.stepSerial ? null
        : `${R(ctx.id)} ${lead ? "already leads" : "has moved on"}; the late ${v(n, "vote", "votes")} of ${list} ${v(n, "changes", "change")} nothing.`), m.from, { minor: true });
    }
    if (!b.granted) return ctx.chorus(`deny|${ctx.id}|${st.term}`, (list, n) => `${list} ${v(n, "turns", "turn")} ${R(ctx.id)} down; it holds ${st.votes.length} of the ${majority} votes it needs.`, m.from);
    if (!st.votes.includes(m.from)) st.votes.push(m.from);
    if (st.votes.length >= majority) return becomeLeader(ctx);
    const term = st.term;
    ctx.chorus(`tally|${ctx.id}|${term}`, () => (st.role === "candidate" && st.term === term ? `${R(ctx.id)} holds ${st.votes.length} of the ${majority} votes it needs.` : null));
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
    if (cut.length) return ctx.chorus("cutsend", (list, n) => (n > 1
      ? `${list} keep sending, but nothing crosses the partition.`
      : `${list} keeps sending, but nothing reaches ${fmt.and(cut.map(R))} across the partition.`));
    if (!behind.length) return ctx.chorus("heartbeat", (list, n) => `${list} ${v(n, "sends heartbeats", "send heartbeats")} to hold off elections.`);
    const detail = `${R(ctx.id)} resends entries to ${fmt.and(behind.map(R))}${idle.length ? ` and ${v(idle.length, "a heartbeat", "heartbeats")} to ${fmt.and(idle.map(R))}` : ""}.`;
    ctx.chorus("resend", (list, n) => (n > 1 ? `${list} each resend AppendEntries to the servers that lag behind them.` : detail));
  });

  net.on("*", "AppendEntries", (m, ctx) => {
    const b = m.body, st = ctx.state;
    if (b.term < st.term) {
      line("appendStale");
      ctx.reply(m, "AppendReply", { term: st.term, success: false, prev: b.prevLogIndex, last: lastIndex(st) });
      const now = st.term;
      return ctx.chorus(`stale-ae|${m.from}|${b.term}|${now}`, (list, n) => `${list} ${v(n, "rejects", "reject")} ${R(m.from)}: term ${b.term} is stale; ${v(n, "it is", "they are")} in term ${now}.`);
    }
    let stepped = false;
    if (b.term > st.term || st.role !== "follower") stepped = becomeFollower(ctx, b.term) !== "follower";
    st.leader = b.leader;
    resetElection(ctx);
    if (b.prevLogIndex > lastIndex(st) || termAt(st, b.prevLogIndex) !== b.prevLogTerm) {
      line("appendCheck");
      ctx.reply(m, "AppendReply", { term: st.term, success: false, prev: b.prevLogIndex, last: lastIndex(st) });
      return ctx.say(`${R(ctx.id)} has no entry ${b.prevLogIndex} from term ${b.prevLogTerm}, so it rejects the append.`);
    }
    let i = b.prevLogIndex, added = [], cut = 0, from = 0;
    for (const e of b.entries) {
      i++;
      if (i <= lastIndex(st)) {
        if (st.log[i - 1].term === e.term) continue;
        if (bugs.has("no-truncate")) { st.log[i - 1] = { ...e }; continue; }
        if (scenario === "partition" && ctx.id === stranded && !asked.has("heal")) {
          const old = st.log[i - 1];
          ask("heal", `The partition has healed. What happens to ${T(ctx.id)}'s uncommitted ${old.cmd} from term ${old.term}?`,
            [`${T(ctx.id)} replicates it to everyone`, `It is replaced by the term-${e.term} leader's log`, `It commits, because ${T(ctx.id)} led first`], 1);
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
      if (learned && ctx.id === crashed && recovered && !synced && st.commitIndex >= maxCommit && net.state("client").acked.length < cmds.length) { synced = true; ctx.phase("Back in sync", { about: ABOUT.synced }); }
    }
    ctx.reply(m, "AppendReply", { term: st.term, success: true, match });
    line(added.length || cut ? "append" : learned ? "learn" : "heartbeat");
    const parts = [];   // [singular, plural] predicates
    const where = added.length > 1 ? `at ${from}–${from + added.length - 1}` : `at index ${from}`;
    const conflicts = fmt.plural(cut, "conflicting entry", "conflicting entries");
    if (cut) parts.push([`replaces ${conflicts} with ${fmt.and(added.map(C))} ${where}`, `replace ${conflicts} with ${fmt.and(added.map(C))} ${where}`]);
    else if (added.length) parts.push([`appends ${fmt.and(added.map(C))} ${where}`, `append ${fmt.and(added.map(C))} ${where}`]);
    if (learned) parts.push([`{tone:ok|commits} up to index ${st.commitIndex}`, `{tone:ok|commit} up to index ${st.commitIndex}`]);
    const why = added.length && !cut && b.prevLogIndex > 0 ? `, matching ${R(m.from)} up to index ${b.prevLogIndex}` : "";
    if (!parts.length) parts.push([`takes ${R(m.from)}'s heartbeat and resets its election timer`, `take ${R(m.from)}'s heartbeat and reset their election timers`]);
    if (stepped) ctx.chorus(`down|${b.term}`, (list, n) => `${list} ${v(n, "steps", "step")} down to follower in term ${b.term}.`);
    const key = `ae|${m.from}|${parts.map((x) => x[0]).join("|")}|${why}`;
    const routine = !added.length && !cut;   // a heartbeat, or only learning the commit index
    ctx.chorus(key, (list, n) => `${list} ${fmt.and(parts.map((x) => x[n > 1 ? 1 : 0]))}${why}.`, ctx.id, { minor: routine });
  });

  net.on("*", "AppendReply", (m, ctx) => {
    const b = m.body, st = ctx.state, f = m.from;
    if (b.term > st.term) {
      line("reply");
      becomeFollower(ctx, b.term);
      return ctx.say(`${R(ctx.id)} sees term ${b.term} in ${R(f)}'s reply and steps down to follower.`);
    }
    if (st.role !== "leader" || b.term !== st.term) return ctx.chorus(`stale|${ctx.id}`, (list, n) => `${R(ctx.id)} ignores stale ${v(n, "reply", "replies")} from ${list}.`, f, { minor: true });
    if (b.success) {
      st.matchIndex[f] = Math.max(st.matchIndex[f] ?? 0, b.match);
      st.nextIndex[f] = Math.max(st.nextIndex[f], st.matchIndex[f] + 1);
      const before = st.commitIndex;
      const oldIdx = st.log.findIndex((e, k) => k >= before && e.term < st.term && e.client);
      const heldBefore = oldIdx >= 0 ? holders(oldIdx + 1, st.log[oldIdx]) : 0;
      const n = advanceCommit(ctx);
      // the §8 question, asked on the step that answers it: the older-term entry commits through the new leader's own
      if (scenario === "crash" && p.noop && n && oldIdx >= 0 && oldIdx < st.commitIndex) {
        const e = st.log[oldIdx];
        ask("noop", `${T(ctx.id)} leads term ${st.term}. ${e.cmd} (term ${e.term}) is on ${heldBefore} of ${N} servers. When does it commit?`,
          ["It is committed already", `When ${T(ctx.id)}'s own term-${st.term} entry reaches a majority`, "When the client sends it again"], 1);
      }
      line(n ? "commit" : "reply");
      if (n) {
        const have = 1 + ctx.peers.filter((x) => (st.matchIndex[x] ?? 0) >= st.commitIndex).length;
        const top = st.log[st.commitIndex - 1];
        const older = st.log.slice(before, st.commitIndex).filter((e) => e.term < st.term && e.cmd !== "nop");
        const what = n > 1 ? `indices ${before + 1}–${st.commitIndex}` : `index ${st.commitIndex}`;
        return ctx.say(`${C(top.cmd)} is on ${have} of ${N} servers, a majority: ${R(ctx.id)} {tone:ok|commits} ${what}` +
          (older.length ? `, and with it ${fmt.and(older.map((e) => C(e.cmd)))} from term ${older[0].term}.` : "."));
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
        ask("minority", `${T(ctx.id)} is cut off with ${T(f)}. ${T(f)} has just stored ${pend.cmd}. Can ${T(ctx.id)} commit it?`,
          [`Yes: ${T(ctx.id)} is still the leader`, `No: ${held} of ${N} servers is not a majority`, `Yes: once ${T(f)} acknowledges it`], 1);
        return ctx.say(`${R(f)} stores ${C(pend.cmd)}, but ${held} of ${N} servers is no majority: ${R(ctx.id)} cannot commit it.`);
      }
      return ctx.chorus(`match|${ctx.id}|${upTo}`, (list, n) => (lastCommit.by === ctx.id && lastCommit.at === net.stepSerial ? null
        : `${list} ${v(n, "acks", "ack")}: ${v(n, "its log matches", "their logs match")} ${R(ctx.id)}'s up to index ${upTo}.`), f, { minor: true });
    }
    line("replyFail");
    st.nextIndex[f] = Math.max(1, (st.matchIndex[f] ?? 0) + 1, Math.min(b.prev, b.last + 1));
    sendAppend(ctx, f);
    ctx.say(`${R(f)} lacks index ${b.prev}: ${R(ctx.id)} backs up to index ${st.nextIndex[f]} and retries.`);
  });

  // ---- the client ----
  const cmdBy = new Map(cmds.map((c) => [c.id, c]));
  // a client gives up on a request only after it could have seen a new leader elected
  const RETRY = Math.max(3 * hb + 2 * p.latency, eMin);
  const waiting = new Set();
  const retries = {};
  let retryPhase = false;
  function discover() {
    const ls = leaders();
    if (!ls.length) return null;
    return ls.reduce((a, b) => (net.state(b).term > net.state(a).term ? b : a));
  }
  // the client keeps talking to the leader it believes in; only a retry (or having none) makes it look again
  function submit(c, why) {
    const cl = net.state("client");
    if (cl.acked.includes(c.id)) return;
    if (!cl.leader || why === "retry") cl.leader = discover();
    const target = cl.leader;
    if (!target) {
      if (why === "retry" && !waiting.has(c.id)) { waiting.add(c.id); net.say(`No ack for ${C(c.cmd)} and no leader to ask: the client waits.`); }
      net.at(net.now + 40, () => submit(c, why), { quiet: true });
      return;
    }
    waiting.delete(c.id);
    cl.pending[c.id] = net.now;
    if (why === "retry" && (retries[c.id] = (retries[c.id] ?? 0) + 1) === 2 && !retryPhase) { retryPhase = true; s.phase("Retries", { about: ABOUT.retries }); }
    net.send("client", target, "Submit", { id: c.id, cmd: c.cmd });
    net.node("client").timer(`retry ${c.id}`, RETRY, { label: "retry", mark: false });
    net.say(why === "retry"
      ? `No ack for ${C(c.cmd)} after ${fmt.ms(RETRY)}: the client retries with ${R(target)}.`
      : `The client sends ${C(c.cmd)} to ${R(target)}, the leader it knows.`);
  }
  for (const c of cmds) net.onTimer("client", `retry ${c.id}`, () => { s.line(null); submit(c, "retry"); });
  // the figure's client is closed-loop (window 1); tests may pipeline several commands to grow stale log tails
  const window = Math.max(1, opt.window ?? 1);
  function submitNext() {
    const cl = net.state("client");
    while (nextCmd < cmds.length && cmds.slice(0, nextCmd).filter((c) => !cl.acked.includes(c.id)).length < window) submit(cmds[nextCmd++], "first");
  }

  net.on("*", "Submit", (m, ctx) => {
    const st = ctx.state, b = m.body;
    s.line(null);
    if (st.role !== "leader") {
      ctx.reply(m, "NotLeader", { id: b.id, hint: st.leader });
      return ctx.say(`${R(ctx.id)} is not the leader and turns ${C(b.cmd)} away${st.leader ? `, pointing at ${R(st.leader)}` : ""}.`);
    }
    const at = st.log.findIndex((e) => e.id === b.id);
    if (at >= 0) {
      if (at < st.commitIndex) ctx.send("client", "Ack", { id: b.id, index: at + 1, cmd: b.cmd });
      const held = 1 + ctx.peers.filter((f) => (st.matchIndex[f] ?? 0) > at).length;
      if (at >= st.commitIndex && st.log[at].term < st.term && held >= majority && !p.noop && explainStall) {
        // §8's liveness gap, shown rather than waited out: nothing of the leader's own term will ever arrive
        ctx.phase("Stuck", { about: ABOUT.stuck });
        ctx.say(`${R(ctx.id)} has ${C(b.cmd)} on ${held} of ${N} servers, but from term ${st.log[at].term}: without a no-op (§8) it can never commit.`);
        return ctx.stop();
      }
      return ctx.say(`${R(ctx.id)} already has ${C(b.cmd)} at index ${at + 1}${at < st.commitIndex ? ", committed: it acks again" : "; it waits for a majority"}.`);
    }
    const e = { term: st.term, cmd: b.cmd, id: b.id, client: true };
    st.log.push(e);
    appendTile(ctx.id, e);
    sendAppends(ctx);
    ctx.timer("heartbeat", hb, { tone: "busy", label: "heartbeat", mark: false });
    const cut = cutOff(ctx);
    ctx.say(cut.length
      ? `${R(ctx.id)} appends ${C(b.cmd)} at index ${lastIndex(st)}, but its copies to ${fmt.and(cut.map(R))} die at the partition.`
      : `${R(ctx.id)} appends ${C(b.cmd)} at index ${lastIndex(st)} in term ${st.term} and replicates it.`);
    if (scenario === "crash" && !crashed && cmdBy.get(b.id)?.n === 2) {
      crashed = ctx.id;
      net.crash(ctx.id, net.now + Math.max(1, Math.round(p.latency * 0.6)));
      net.recover(ctx.id, net.now + 900);   // a fallback: normally it returns once the client's work is done (Ack below)
    }
  });

  net.on("client", "NotLeader", (m, ctx) => {
    const cl = ctx.state, c = cmdBy.get(m.body.id);
    s.line(null);
    cl.leader = m.body.hint ?? null;
    ctx.say(`The client hears that ${R(m.from)} is not the leader.`);
    if (c && !cl.acked.includes(c.id)) submit(c, cl.leader ? "redirect" : "retry");
  });

  net.on("client", "Ack", (m, ctx) => {
    const cl = ctx.state, b = m.body;
    s.line(null);
    if (cl.acked.includes(b.id)) return ctx.say(`The client already has an ack for ${C(b.cmd)}.`, { minor: true });
    cl.acked.push(b.id);
    delete cl.pending[b.id];
    cl.leader = m.from;
    ctx.cancel(`retry ${b.id}`);
    ctx.say(`The client learns ${C(b.cmd)} is committed at index ${b.index}.`);
    // the crashed leader comes back once the cluster has finished the client's work without it
    if (crashed && !recovered && !net.isUp(crashed) && cl.acked.length === cmds.length) net.recover(crashed, net.now + 30);
    if (scenario === "partition" && !partitioned) {
      partitioned = true;
      const L = m.from, peer = ids[(ids.indexOf(L) + 1) % N];
      const minority = [L, peer].slice(0, N - majority), rest = ids.filter((x) => !minority.includes(x));
      const at = net.now + 2, heal = at + 450;
      net.at(at, () => { s.phase("Partition", { about: ABOUT.partition }); leaderlessSince = net.now; }, { quiet: true });   // the phase lands on the partition's own step
      net.at(heal, () => s.phase("Heal", { about: ABOUT.heal }), { quiet: true });
      net.partition([minority, rest], at, heal);
      net.at(at + 20, () => submitNext(), { quiet: true });
    } else submitNext();
  });

  net.onCrash("*", (ctx) => {
    if (ctx.id === "client") return;
    const lead = ctx.state.role === "leader";
    s.line(null);
    if (lead) { ctx.phase("Crash", { about: ABOUT.crash }); leaderlessSince = net.now; }
    ctx.say(`${lead ? "Leader " : ""}${R(ctx.id)} {tone:fail|crashes}; its term, vote and log survive on disk.`);
  });
  net.onRecover("*", (ctx) => {
    if (ctx.id === "client") return;
    const st = ctx.state;
    s.line(null);
    ctx.phase("Catch-up", { about: ABOUT.catchup });
    recovered = true;
    st.role = "follower"; st.commitIndex = 0; st.lastApplied = 0; st.kv = {}; st.votes = []; st.leader = null; st.nextIndex = {}; st.matchIndex = {};
    for (const t of tiles.get(ctx.id)) s.set(t, { dim: true });
    resetElection(ctx);
    show(ctx);
    ctx.say(`${R(ctx.id)} {tone:ok|restarts} as a follower, unsure which of its ${fmt.plural(st.log.length, "entry", "entries")} are committed.`);
  });

  // ---- scenario schedule: a closed-loop client sends its next command when the previous one is acked ----
  net.at(eMin, () => submitNext(), { quiet: true });
  if (opt.faults) opt.faults(net, rng(p.seed).fork("faults"), ids);

  s.phase("Election", { about: ABOUT.election });
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
    intro: `${N} servers boot as followers in term 0, each with a random election timeout of ${eMin}–${eMax} ms.`,
    stopWhen: opt.stopWhen === false ? undefined : allDone,
    maxSteps: opt.maxSteps ?? 600,
  });
  return net;
}
