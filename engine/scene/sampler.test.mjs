// Sampler: Frame shape, purity, stability, exact backward scrubbing, determinism and the 2 ms budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "./index.mjs";
import * as mapreduce from "./fixtures/mapreduce.mjs";
import * as big from "./fixtures/stress.mjs";

const strip = (f) => JSON.parse(JSON.stringify({ ...f, entities: f.entities.size }));

test("Frame shape matches engine/contracts.mjs", () => {
  const tl = compile(mapreduce);
  const f = tl.sample(tl.duration * 0.4, { pxPerUnit: 1 });
  for (const k of ["poses", "time", "step", "u", "caption", "phase", "tags", "focus", "world", "counters", "line", "entities", "ask"]) assert.ok(k in f, `frame.${k}`);
  assert.ok(Array.isArray(f.poses) && f.poses.length > 10);
  assert.ok(f.entities instanceof Map);
  for (const p of f.poses) {
    assert.equal(typeof p.id, "string");
    assert.equal(typeof p.kind, "string");
    for (const k of ["x", "y", "z", "opacity"]) assert.ok(Number.isFinite(p[k]), `${p.id}.${k} = ${p[k]}`);
  }
  const ids = f.poses.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "pose ids are unique");
  assert.ok(f.u >= 0 && f.u <= 1);
});

test("sample is stable and pure: same time, same frame; order of calls does not matter", () => {
  const tl = compile(mapreduce, { scenario: "crash" });
  const ts = Array.from({ length: 60 }, (_, i) => (tl.duration * i) / 59);
  const forward = ts.map((t) => strip(tl.sample(t)));
  const again = compile(mapreduce, { scenario: "crash" });
  const backward = ts.slice().reverse().map((t) => strip(again.sample(t))).reverse();
  assert.deepEqual(backward, forward);
  const shuffled = [...ts.keys()].sort((a, b) => ((a * 7919) % 61) - ((b * 7919) % 61));
  for (const i of shuffled) assert.deepEqual(strip(tl.sample(ts[i])), forward[i]);
});

test("sample(t, view, out) refills a frame in place", () => {
  const tl = compile(mapreduce);
  const out = tl.sample(1);
  const arr = out.poses;
  const again = tl.sample(12.5, {}, out);
  assert.equal(again, out);
  assert.equal(again.poses, arr);
  assert.deepEqual(strip(again), strip(compile(mapreduce).sample(12.5)));
});

test("compile is deterministic across runs and scenarios differ", () => {
  const a = compile(mapreduce), b = compile(mapreduce), c = compile(mapreduce, { scenario: "crash" });
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.deepEqual(strip(a.sample(a.duration / 3)), strip(b.sample(b.duration / 3)));
});

test("performance: <= 2 ms per sample with ~300 entities", () => {
  const tl = compile(big);
  assert.deepEqual(tl.problems.filter((p) => p.kind !== "overflow"), []);
  const n0 = tl.sample(tl.duration / 2).poses.length;
  assert.ok(n0 >= 300, `only ${n0} poses`);
  for (let i = 0; i < 200; i++) tl.sample((i / 200) * tl.duration, { pxPerUnit: 1 });   // warm up
  const N = 600;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) tl.sample(((i * 37) % N / N) * tl.duration, { pxPerUnit: 1.2 });
  const ms = (performance.now() - t0) / N;
  assert.ok(ms <= 2, `${ms.toFixed(3)} ms per sample`);
});
