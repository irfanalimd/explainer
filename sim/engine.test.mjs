// Integration: the sim fixtures and runtimes on the real Scene engine (engine/scene), not just the stub.
// Skips when the engine is not importable (it is built in parallel by another part).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as quicksort from "./fixtures/quicksort.mjs";
import * as raft from "./fixtures/raft.mjs";
import { stateOf } from "./inspect.mjs";
import { tracked } from "./tracked.mjs";
import { race } from "./lockstep.mjs";
import { network } from "./actors.mjs";
import * as machine from "./machine.mjs";
import { rng } from "./rng.mjs";

let engine = null;
try { engine = await import("../engine/scene/index.mjs"); } catch { engine = null; }
const skip = engine ? false : "engine/scene/index.mjs is not available";

test("fixtures compile on the real engine: no problems, invariants hold, hashes are stable", { skip }, () => {
  for (const fig of [quicksort, raft]) {
    for (const sc of fig.scenarios) {
      for (const seed of [1, 2, 3, 7, 42]) {
        const tl = engine.compile(fig, { scenario: sc.id, params: { seed } });
        const where = `${fig.meta.title} ${sc.id} seed ${seed}`;
        assert.equal(tl.error, null, `${where}: ${tl.error?.stack}`);
        assert.deepEqual(tl.problems, [], where);
        assert.deepEqual(engine.checkInvariants(fig, tl), [], where);
        assert.ok(tl.duration > 5, `${where}: ${tl.duration} s`);
        assert.equal(engine.compile(fig, { scenario: sc.id, params: { seed } }).hash, tl.hash, `${where}: deterministic`);
      }
    }
  }
  const q = engine.compile(quicksort, { scenario: "random" });
  assert.equal(stateOf(q.final, "a").done, true, "invariants read the real snapshots");
  const r = engine.compile(raft, { scenario: "crash" });
  assert.equal(["s1", "s2", "s3", "s4", "s5"].filter((id) => stateOf(r.final, id)?.raft).length, 5);
});

test("sim/rng.mjs can be the builder's s.rng", { skip }, () => {
  let seen = null;
  const fig = { params: { seed: { value: 7 } }, scenarios: [{ id: "x" }], build(s) { seen = [s.rng.seed, s.rng.int(1, 6), s.rng.fork("a").seed]; s.housing("h", {}); s.step("One."); } };
  const tl = engine.compile(fig, { scenario: "x", rng });
  assert.deepEqual(tl.problems, []);
  assert.deepEqual(seen, ["7", rng(7).int(1, 6), "7/a"]);
});

test("every runtime drives the real builder without problems", { skip }, () => {
  const figure = {
    params: { seed: { value: 5 } },
    scenarios: [{ id: "all" }],
    counters: {},
    build(s) {
      s.column("world", {});
      s.row("top", { in: "world" });
      const a = tracked.array(s, "a", [4, 1, 3], { in: "top", counters: false });
      const st = tracked.stack(s, "st", { in: "top" });
      const q = tracked.queue(s, "q", { in: "top" });
      const ht = tracked.hashtable(s, "ht", { in: "top", buckets: 4 });
      const lp = tracked.hashtable(s, "lp", { in: "top", buckets: 4, probing: "linear" });
      const I = a.pointer("i", 0);
      a.step("Opening.");
      if (a.cmp(0, 1) > 0) a.swap(0, 1);
      I.to(2);
      a.mark(0, 0, "ok");
      a.flush();
      st.push(7); st.push(9); st.pop();
      q.enqueue(3); q.dequeue();
      ht.put("fox", 1); ht.put("dog", 2); ht.get("fox"); ht.delete("dog");
      lp.put("fox", 1); lp.put("owl", 2); lp.delete("fox"); lp.get("owl");
      lp.flush(); ht.flush(); q.flush(); st.flush();
      race(s, {
        left: function* (v) { const b = tracked.array(v, v.id("b"), [2, 1], { in: "world", auto: "none", counters: false }); if (b.cmp(0, 1) > 0) b.swap(0, 1); yield b.caption(); },
        right: function* (v) { yield "idle"; },
      });
      s.row("cluster", { in: "world" });
      const net = network(s, { nodes: ["n1", "n2", "n3"], in: "cluster", seed: 3, latency: { mean: 8, jitter: 2 }, lanes: { in: "world", length: 400 }, batch: 4 });
      net.onStart("n1", (ctx) => ctx.broadcast("Hello", {}));
      net.on("*", "Hello", (m, ctx) => ctx.reply(m, "Hi", {}));
      net.crash("n3", 2);
      net.run({ intro: "Three nodes." });
      const c = machine.cache({ sets: 2, ways: 2, line: 64, addressBits: 16 });
      const cv = machine.cacheView(s, "l1", c, { in: "world", counters: false });
      cv.access(0x40); cv.access(0x40);
      const table = machine.pageTable();
      table.map(0x7f3a_2c10_8000, 0x12_3000);
      const wv = machine.walkView(s, "mmu", machine.mmu({ table, tlb: machine.tlb({ entries: 2 }) }), { in: "world" });
      wv.translate(0x7f3a_2c10_8123);
      wv.translate(0x7f3a_2c10_8124);
    },
  };
  const tl = engine.compile(figure, { scenario: "all" });
  assert.equal(tl.error, null, tl.error?.stack);
  // this omnibus figure deliberately uses more than 8 identities; a real figure would not
  assert.deepEqual(tl.problems.filter((p) => p.kind !== "keys"), []);
  assert.ok(tl.steps.length > 20);
});
