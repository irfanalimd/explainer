import { test } from "node:test";
import assert from "node:assert/strict";
import * as figure from "./raft.mjs";
import { buildRaft } from "./raft.mjs";
import { runFigure } from "../stub.mjs";
import { stateOf } from "../inspect.mjs";

const ids = (n = 5) => Array.from({ length: n }, (_, i) => `s${i + 1}`);
const states = (snap, n = 5) => ids(n).map((id) => stateOf(snap, id));

// a figure whose build injects faults (and optional protocol bugs) into the real Raft fixture
const variant = (opt) => ({ ...figure, build: (s, p, sc) => buildRaft(s, p, sc, opt) });

function chaos(net, r, all) {
  let t = 120;
  while (t < 2400) {
    t += r.int(60, 350);
    const k = r.int(0, 3);
    if (k <= 1) { const n = r.pick(all); net.crash(n, t); net.recover(n, t + r.int(40, 500)); }
    else if (k === 2) { const sh = r.shuffle(all); const cut = r.int(1, 2); net.partition([sh.slice(0, cut), sh.slice(cut)], t, t + r.int(80, 700)); }
    else net.drop(r.float(0, 0.25), t);
  }
}
const CHAOS = { faults: chaos, until: 3000, stopWhen: false, maxSteps: 4000, tray: { cols: 16, rows: 4 } };

// Figure 8 of the paper, played by an adversary that watches the cluster and strikes at the right moments:
// an entry E1 reaches a minority (L, F); a new leader M writes a conflicting E2 at the same index and is cut off
// before replicating it; L's side regains a majority and a leader W of a later term spreads E1 to a majority;
// then W crashes and M, whose log ends in a newer term, can win. Committing E1 by counting replicas is unsafe.
function figure8(trace = []) {
  return (net, r, all) => {
    let stage = 0, L, F, M, W, t1;
    const st = (id) => net.state(id), up = (id) => net.isUp(id);
    const leaderOf = (pred) => all.find((id) => up(id) && st(id).role === "leader" && pred(id));
    const poll = () => {
      if (stage === 0) {
        L = leaderOf((id) => st(id).commitIndex >= 1 && net.state("client").acked.includes("c1"));
        if (L) { F = all.find((x) => x !== L); net.partition([[L, F], all.filter((x) => x !== L && x !== F)], net.now); stage = 1; trace.push("E1 to a minority"); }
      } else if (stage === 1) {
        if (st(F).log[1]?.id === "c2") { t1 = st(F).log[1].term; net.crash(L, net.now); stage = 2; trace.push("crash L"); }
      } else if (stage === 2) {
        M = leaderOf((id) => id !== L && id !== F);
        if (M) { net.partition([[M], all.filter((x) => x !== M)], net.now); stage = 3; trace.push("isolate M"); }
      } else if (stage === 3) {
        const e = st(M).log[1];
        if (e && e.term > t1) { net.crash(M, net.now); net.heal(net.now); net.recover(L, net.now + 1); stage = 4; trace.push("E2 on M; crash M"); }
      } else if (stage === 4) {
        W = leaderOf((id) => id !== M && st(id).log[1]?.term === t1 && st(id).term > st(M).term);
        if (W && all.filter((x) => x !== M && st(x).log[1]?.term === t1).length >= 3) {
          stage = 5;
          trace.push("E1 on a majority");
          net.at(net.now + 40, () => { const X = all.find((x) => x !== W && x !== M && up(x)); net.crash(W, net.now); net.crash(X, net.now); net.recover(M, net.now + 1); trace.push("M returns"); }, { quiet: true });
        }
      }
      if (stage < 5) net.at(net.now + 2, poll, { quiet: true });
    };
    net.at(150, poll, { quiet: true });
  };
}
const FIG8 = (trace, bugs) => variant({ faults: figure8(trace), until: 4000, stopWhen: false, maxSteps: 6000, tray: { cols: 16, rows: 4 }, bugs });

function converged(snap, n = 5) {
  const st = states(snap, n);
  const ref = JSON.stringify(st[0].log.map((e) => [e.term, e.cmd]));
  return st.every((x) => JSON.stringify(x.log.map((e) => [e.term, e.cmd])) === ref && x.commitIndex === x.log.length);
}

test("200 seeds × every scenario: clean recordings, Raft's safety invariants on every step, and liveness", () => {
  const steps = { happy: [], crash: [], partition: [] };
  let truncated = 0;
  for (const sc of figure.scenarios) {
    for (let seed = 1; seed <= 200; seed++) {
      const r = runFigure(figure, { scenario: sc.id, params: { seed } });
      const where = `${sc.id} seed ${seed}`;
      assert.deepEqual(r.problems, [], where);
      assert.deepEqual(r.failures, [], where);
      const fin = r.rec.final;
      const client = stateOf(fin, "client");
      assert.deepEqual(client.acked.slice().sort(), ["c1", "c2", "c3"], `${where}: every command acknowledged`);
      assert.ok(converged(fin), `${where}: logs converge and are fully committed`);
      const cmds = states(fin)[0].log.filter((e) => e.cmd !== "nop").map((e) => e.cmd);
      assert.deepEqual(cmds, ["x←3", "y←7", "x←5"], `${where}: each command exactly once, in order`);
      assert.deepEqual(states(fin)[0].kv, { x: "5", y: "7" }, `${where}: the state machine applied them`);
      const led = states(fin).flatMap((x) => x.ledTerms);
      if (sc.id !== "happy") assert.ok(new Set(led).size >= 2 && Math.max(...led) >= 2, `${where}: a new leader in a higher term`);
      if (sc.id === "partition" && r.rec.find("remove").length) truncated++;
      steps[sc.id].push(r.rec.steps.length);
    }
  }
  // usually the stranded leader's uncommitted entry is overwritten after the heal; when the majority side splits
  // its votes until the heal, the old leader can legitimately win again and its entry survives (seed 55)
  assert.ok(truncated >= 150, `${truncated} of 200 partition runs truncated a stale entry`);
  const median = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
  // pacing budget: the figure must stay watchable
  assert.ok(median(steps.happy) <= 45, `happy median ${median(steps.happy)} steps`);
  assert.ok(median(steps.crash) <= 80, `crash median ${median(steps.crash)} steps`);
  assert.ok(median(steps.partition) <= 120, `partition median ${median(steps.partition)} steps`);
});

test("other cluster sizes and lossy networks stay safe", () => {
  for (const nodes of [3, 4, 7]) {
    for (let seed = 1; seed <= 25; seed++) {
      const r = runFigure(variant({ tray: { cols: 8, rows: 4 } }), { scenario: "crash", params: { seed, nodes } });
      assert.deepEqual(r.failures, [], `${nodes} nodes seed ${seed}`);
      assert.deepEqual(r.problems, [], `${nodes} nodes seed ${seed}`);
      assert.deepEqual(stateOf(r.rec.final, "client").acked.length, 3, `${nodes} nodes seed ${seed}`);
    }
  }
  for (let seed = 1; seed <= 100; seed++) {
    const drop = [0.05, 0.1, 0.2][seed % 3];
    const r = runFigure(variant({ tray: { cols: 16, rows: 4 }, maxSteps: 3000 }), { scenario: ["happy", "crash", "partition"][seed % 3], params: { seed, drop } });
    assert.deepEqual(r.failures, [], `drop ${drop} seed ${seed}`);
    assert.deepEqual(r.problems, [], `drop ${drop} seed ${seed}`);
  }
});

test("chaos: random crashes, partitions and drop storms never break safety (200 seeds)", () => {
  let elections = 0, lost = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = runFigure(variant(CHAOS), { scenario: "happy", params: { seed } });
    assert.deepEqual(r.failures, [], `chaos seed ${seed}`);
    assert.deepEqual(r.problems.filter((p) => !/overflows/.test(p.message)), [], `chaos seed ${seed}`);
    elections += new Set(states(r.rec.final).flatMap((x) => x.ledTerms)).size;
    lost += r.rec.counters.lost ?? 0;
  }
  assert.ok(elections > 400 && lost > 2000, `the chaos is real: ${elections} leaders, ${lost} messages lost`);
});

test("the invariants have teeth: each deliberate protocol bug is caught", () => {
  const caught = {};
  const hunt = (bug, opt, params, seeds) => {
    for (let seed = 1; seed <= seeds && !caught[bug]; seed++) {
      const r = runFigure(variant({ ...CHAOS, ...opt, bugs: new Set([bug]) }), { scenario: "happy", params: { seed, ...params } });
      if (r.failures.length) caught[bug] = r.failures.map((f) => f.name);
    }
  };
  hunt("double-vote", {}, {}, 100);                       // two leaders in one term
  hunt("vote-any-log", {}, {}, 100);                      // a stale candidate wins and overwrites committed entries
  // a follower that keeps a stale tail after a conflict: needs several uncommitted entries, so pipeline the client
  hunt("no-truncate", { window: 3 }, { commands: "x=3 y=7 x=5 y=1 z=2 x=9" }, 800);
  assert.ok(caught["double-vote"]?.includes("at most one leader per term"), JSON.stringify(caught));
  assert.ok(caught["vote-any-log"], JSON.stringify(caught));
  assert.ok(caught["no-truncate"]?.includes("log matching"), JSON.stringify(caught));
});

test("Figure 8: correct Raft survives the adversary; counting old-term replicas does not", () => {
  let caught = null;
  for (let seed = 1; seed <= 12; seed++) {
    const trace = [];
    const ok = runFigure(FIG8(trace, new Set()), { scenario: "happy", params: { seed, noop: false } });
    assert.deepEqual(trace, ["E1 to a minority", "crash L", "isolate M", "E2 on M; crash M", "E1 on a majority", "M returns"], `seed ${seed}: the adversary played its whole script`);
    assert.deepEqual(ok.failures, [], `correct Raft, seed ${seed}`);
    assert.deepEqual(ok.problems, []);
    const bad = runFigure(FIG8([], new Set(["commit-old-term"])), { scenario: "happy", params: { seed, noop: false } });
    if (!caught && bad.failures.length) caught = bad.failures.map((f) => f.message);
  }
  assert.ok(caught && caught.some((m) => /lacks entry \d+ committed in term \d+/.test(m)), JSON.stringify(caught));
});

test("deterministic, with honest counters and sim time on every step", () => {
  const a = runFigure(figure, { scenario: "crash", params: { seed: 9 } });
  const b = runFigure(figure, { scenario: "crash", params: { seed: 9 } });
  assert.equal(a.rec.hash(), b.rec.hash());
  assert.notEqual(a.rec.hash(), runFigure(figure, { scenario: "crash", params: { seed: 10 } }).rec.hash());
  assert.equal(a.rec.counters.messages, a.rec.find("send").length);
  assert.equal(a.rec.counters.lost, a.rec.find("deliver").filter((c) => c.args[1]?.remove).length);
  assert.ok(a.rec.steps.every((st) => Number.isFinite(st.t)));
  const phases = a.rec.steps.map((st) => st.phase).filter(Boolean);
  assert.deepEqual(phases, ["Election", "Replication", "Crash", "Re-election", "Catch-up", "Agreement"]);
  const p = runFigure(figure, { scenario: "partition", params: { seed: 9 } });
  assert.deepEqual(p.rec.steps.map((st) => st.phase).filter(Boolean), ["Election", "Replication", "Partition", "New leader", "Heal", "Agreement"]);
});

test("the invariants reject forged histories", () => {
  const node = (o) => ({ state: { raft: true, role: "follower", term: 1, log: [], commitIndex: 0, ledTerms: [], commits: [], ...o } });
  const snap = (o) => ({ entities: new Map(Object.entries(o)) });
  const e = (term, cmd) => ({ term, cmd });
  const I = figure.invariants;
  assert.match(I["at most one leader per term"](snap({ s1: node({ ledTerms: [1, 3] }), s2: node({ ledTerms: [3] }) })), /term 3 has two leaders/);
  assert.match(I["logs match up to commitIndex"](snap({ s1: node({ log: [e(1, "a")], commitIndex: 1 }), s2: node({ log: [e(1, "b")], commitIndex: 1 }) })), /disagree at committed index 1/);
  assert.match(I["log matching"](snap({ s1: node({ log: [e(1, "a"), e(2, "b")] }), s2: node({ log: [e(1, "z"), e(2, "b")] }) })), /share term 2 at index 2 but differ at 1/);
  const commit = { index: 1, term: 1, cmd: "a", commitTerm: 1 };
  assert.match(I["committed entries never lost"](snap({ s1: node({ log: [e(1, "a")], commits: [commit] }), s2: node({ role: "leader", term: 2, log: [e(2, "q")] }) })), /leader s2 of term 2 lacks entry 1/);
  assert.equal(I["committed entries never lost"](snap({ s1: node({ log: [e(1, "a")], commits: [commit] }), s2: node({ role: "leader", term: 2, log: [e(1, "a")] }) })), true);
});
