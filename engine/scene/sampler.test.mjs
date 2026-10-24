// Sampler: Frame shape, purity, stability, exact backward scrubbing, determinism and the 2 ms budget.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile } from "./index.mjs";
import { SPOT } from "../tokens.mjs";
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

// three machines with a slip each, wired 1-2, 2-3 and 1-3; step 1 moves b from h2 to h3
const spotFig = {
  build(s) {
    for (const h of ["h1", "h2", "h3"]) s.housing(h, { title: h, tray: { cols: 2 } });
    s.tile("a", { in: "h1" }); s.tile("b", { in: "h2" }); s.tile("c", { in: "h3" }); s.tile("w#2", { in: "h1" });
    s.trace("t12", "h1", "h2"); s.trace("t23", "h2", "h3"); s.trace("t13", "h1", "h3");
    s.step("opening");
    s.move("b", "h3");
    s.step("b moves to {ref:h3}");
    s.step("{ref:h1} waits");
  },
};
const recedeOf = (f) => Object.fromEntries(f.poses.filter((p) => p.recede !== undefined && !p.id.includes("#label")).map((p) => [p.id, p.recede]));

test("spotlight: what a step is about keeps its look, the rest recedes; the opening step has none", () => {
  const tl = compile(spotFig);
  const [s0, s1, s2] = tl.steps;
  assert.ok(Object.values(recedeOf(tl.sample(s0.t1 - 0.01))).every((r) => r === 0));
  // b moves: b, the machine it leaves, the machine it reaches (h3, named, so its slip c too) and their wires stay
  const r1 = recedeOf(tl.sample(s1.t1 - 0.01));
  for (const id of ["b", "c", "h2", "h3", "t12", "t23", "t13"]) assert.equal(r1[id], 0, id);
  for (const id of ["h1", "a", "w#2"]) assert.equal(r1[id], 1, id);   // an id may hold # itself
  // step 2 names only h1: the spotlight moves there, crossfading from step 1 over SPOT.ease; the wire step 1's move
  // took recedes once its trail is gone, as it touches neither h1 nor carries step 2's traffic
  const r2 = recedeOf(tl.sample(s2.t1 - 0.01));
  for (const id of ["h1", "a", "w#2", "t12", "t13"]) assert.equal(r2[id], 0, id);
  for (const id of ["h2", "h3", "b", "c", "t23"]) assert.equal(r2[id], 1, id);
  assert.equal(recedeOf(tl.sample(s2.t0)).h1, 1, "at the boundary the step before still holds");
  const mid = recedeOf(tl.sample(s2.t0 + SPOT.ease / 2)).h1;
  assert.ok(mid > 0 && mid < 1, `halfway through the crossfade: ${mid}`);
  // turned off: nothing recedes
  assert.ok(Object.values(recedeOf(tl.sample(s1.t1 - 0.01, { spot: false }))).every((r) => r === 0));
});

test("spotlight: the things a step's words name wear the hover ring as it begins, then lose it", () => {
  const tl = compile(spotFig);
  const s1 = tl.steps[1];
  const hov = (t) => tl.sample(t).poses.find((p) => p.id === "h3").hover;
  assert.equal(hov(s1.t0 + 0.1), true);
  assert.equal(hov(s1.t0 + SPOT.ring + 0.05), false);
  assert.equal(tl.sample(s1.t0 + 0.1, { spot: false }).poses.find((p) => p.id === "h3").hover, false);
});

test("spotlight: a step about most of the world has none", () => {
  const tl = compile({ build(s) {
    for (const h of ["h1", "h2", "h3"]) s.housing(h, { tray: { cols: 2 } });
    s.step("opening");
    s.lit("h1", "h2", "h3");
    s.step("all three");
  } });
  assert.equal(tl._.spotByStep[1], null);
});
