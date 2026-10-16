// Acceptance (CONTRACTS.md section 9): the MapReduce reference figure in every scenario and at the param
// extremes compiles without problems, keeps its invariants on every snapshot, and its motion never jumps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, checkInvariants } from "./index.mjs";
import * as mapreduce from "./fixtures/mapreduce.mjs";
import * as heartbeat from "./fixtures/heartbeat.mjs";

const cases = [];
for (const sc of mapreduce.scenarios.map((x) => x.id))
  for (const params of [{}, { mappers: 1, reducers: 1 }, { mappers: 6, reducers: 4 }, { combiner: true }, { combiner: true, mappers: 1 }, { mappers: 2, reducers: 3, input: "a b a c b a d" }, { input: "" }])
    cases.push([sc, params]);

for (const [sc, params] of cases) {
  test(`mapreduce ${sc} ${JSON.stringify(params)}: no problems, invariants hold`, () => {
    const tl = compile(mapreduce, { scenario: sc, params });
    assert.deepEqual(tl.problems, []);
    assert.deepEqual(checkInvariants(mapreduce, tl), []);
    assert.equal(compile(mapreduce, { scenario: sc, params }).hash, tl.hash);
    const out = tl.final.entities.get("output");
    const words = String(tl.values.input).split(/\s+/).filter(Boolean);
    assert.equal(out.children.reduce((a, id) => a + tl.final.entities.get(id).state.count, 0), words.length);
  });
}

test("mapreduce has every phase, the combiner shrinks the shuffle, the crash re-runs a split", () => {
  const tl = compile(mapreduce);
  assert.deepEqual(tl.phases.map((p) => p.name), ["Split", "Map", "Shuffle", "Reduce", "Output"]);
  const m2 = compile(mapreduce, { params: { mappers: 1 } }), m2c = compile(mapreduce, { params: { mappers: 1, combiner: true } });
  assert.ok(m2c.final.counters.bytes < m2.final.counters.bytes);
  const crash = compile(mapreduce, { scenario: "crash" });
  assert.ok(crash.events.some((e) => e.kind === "fail"));
  const m1 = crash.final.entities.get("m1");
  assert.equal(m1.led, "fail"); assert.equal(m1.dim, true);
  assert.ok(crash.steps.some((s) => /re-runs split 1/.test(s.caption)));
  assert.equal(crash.final.counters.tasks, tl.final.counters.tasks);
});

// motion continuity: at 240 Hz nothing moves more than 9 u between frames, nothing pops in or out at full opacity
function continuity(tl) {
  const bad = [];
  let prev = new Map();
  const skip = new Set(["trace", "bus", "lane", "playhead", "bracket", "zone"]);
  for (let t = 0; t <= tl.duration + 1e-9; t += 1 / 240) {
    const f = tl.sample(t);
    const cur = new Map();
    for (const p of f.poses) {
      if (skip.has(p.kind)) continue;
      cur.set(p.id, p);
      const q = prev.get(p.id);
      if (q) {
        const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
        if (d > 9) bad.push(`${p.id} jumps ${d.toFixed(1)} u at t=${t.toFixed(3)}`);
        if (Math.abs(p.opacity - q.opacity) > 0.35) bad.push(`${p.id} opacity pops at t=${t.toFixed(3)}`);
      } else if (prev.size && t > 0 && p.opacity > 0.5 && p.kind !== "text") bad.push(`${p.id} appears at opacity ${p.opacity.toFixed(2)} at t=${t.toFixed(3)}`);
    }
    for (const [id, q] of prev) if (!cur.has(id) && q.opacity > 0.5 && !skip.has(q.kind) && q.kind !== "text") bad.push(`${id} vanishes at opacity ${q.opacity.toFixed(2)} at t=${t.toFixed(3)}`);
    prev = cur;
  }
  return bad;
}

for (const [name, fig, sc, params] of [["mapreduce", mapreduce, "happy", {}], ["mapreduce", mapreduce, "crash", {}], ["mapreduce", mapreduce, "straggler", {}], ["mapreduce", mapreduce, "skew", {}], ["mapreduce", mapreduce, "happy", { combiner: true, mappers: 2 }], ["heartbeat", heartbeat, "steady", {}], ["heartbeat", heartbeat, "crash", {}]]) {
  test(`${name} ${sc} ${JSON.stringify(params)}: motion is continuous (no jumps, no pops)`, () => {
    const tl = compile(fig, { scenario: sc, params });
    const bad = continuity(tl);
    assert.deepEqual(bad.slice(0, 10), []);
  });
}

test("heartbeat: held sends, lanes and marks compile cleanly and keep their invariant", () => {
  for (const sc of ["steady", "crash"]) {
    const tl = compile(heartbeat, { scenario: sc });
    assert.deepEqual(tl.problems, []);
    assert.deepEqual(checkInvariants(heartbeat, tl), []);
  }
});
