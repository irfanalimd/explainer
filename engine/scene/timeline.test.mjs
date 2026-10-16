// Timeline: recording semantics, steps, phases, events, counters, snapshots, problems, hash.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOTION } from "../tokens.mjs";
import { compile, resolveParams } from "./index.mjs";
import { plain, mentions, key, ref, tone, code } from "./narrate.mjs";

const fig = (build, extra = {}) => ({ build, ...extra });

test("declarations before the first step form S0; later ones are recorded and animate", () => {
  const tl = compile(fig((s) => {
    s.housing("h", { tray: { cols: 3 } });
    s.tile("a", { in: "h" });
    s.step("opening");
    s.tile("b", { in: "h" });
    s.step("b appears");
  }));
  assert.equal(tl.steps.length, 2);
  assert.deepEqual(tl.steps[0].kinds, []);
  assert.deepEqual(tl.steps[1].kinds, ["create"]);
  assert.ok(tl.snapshot(0).entities.has("a") && !tl.snapshot(0).entities.has("b"));
  assert.ok(tl.snapshot(1).entities.has("a") && !tl.snapshot(1).entities.has("b"));
  assert.ok(tl.final.entities.has("b"));
  assert.ok(tl.sample(0).poses.some((p) => p.id === "a"));
  assert.ok(!tl.sample(0).poses.some((p) => p.id === "b"));
});

test("steps: default dur MOTION.step, explicit dur, hold, sim time, phases, ask, line", () => {
  const tl = compile(fig((s) => {
    s.tile("a", { text: "1" });
    s.phase("One");
    s.step("first", { t: 0 });
    s.set("a", { text: "2" });
    s.ask("What is next?", ["3", "4"], 0);
    s.line(4, 6);
    s.step("second", { dur: 2, t: 5 });
    s.phase("Two");
    s.hold(1.5);
    s.step("fourth");
  }));
  const [a, b, c, d] = tl.steps;
  // an un-timed step lasts at least as long as its (one-word) caption takes to read
  const one = Math.max(MOTION.step, Math.min(MOTION.read.max, MOTION.read.base + MOTION.read.perWord));
  assert.equal(a.dur, one); assert.equal(b.dur, 2); assert.equal(c.dur, 1.5);
  assert.equal(c.caption, "second");
  assert.ok(Math.abs(tl.duration - (one * 2 + 3.5)) < 1e-9);
  assert.equal(b.t0, a.t1);
  assert.deepEqual([a.simTime, b.simTime, c.simTime, d.simTime], [0, 5, 5, 5]);
  assert.deepEqual(tl.phases.map((p) => [p.name, p.step]), [["One", 0], ["Two", 2]]);
  assert.equal(tl.phases[0].t1, c.t0);
  assert.deepEqual(b.ask, { question: "What is next?", options: ["3", "4"], answer: 0 });
  assert.equal(tl.sample(b.t0 + 0.1).ask.question, "What is next?");
  assert.equal(tl.sample(a.t0 + 0.1).ask, null);
  assert.deepEqual(tl.sample(c.t0 + 0.1).line, [4, 6]);
  assert.ok(tl.events.some((e) => e.kind === "ask" && e.step === 1));
  assert.equal(tl.stepAt(b.t0 + 0.01), 1);
  assert.equal(tl.timeOf(2), c.t0);
});

test("phases carry an optional about: s.phase(name, { about }), a string, or none", () => {
  const tl = compile(fig((s) => {
    s.housing("h", { tray: { cols: 2 } });
    s.phase("One", { about: "Each worker reads its {ref:h|split}." });
    s.step("first");
    s.phase("Two");
    s.step("second");
    s.phase("Three", "A plain string works too.");
    s.step("third");
    s.phase("Four", { about: "Mentions {ref:nope}." });
    s.step("fourth");
  }));
  assert.deepEqual(tl.phases.map((p) => p.about), ["Each worker reads its {ref:h|split}.", null, "A plain string works too.", "Mentions {ref:nope}."]);
  assert.ok(tl.problems.some((p) => p.kind === "unknown-ref" && p.id === "nope"));
  assert.ok(!tl.problems.some((p) => p.id === "h"));
});

test("counters accumulate; snapshots hold the values at the start of each step", () => {
  const tl = compile(fig((s) => {
    s.gauge("load", 3);
    s.step("a");
    s.count("ops"); s.count("bytes", 7);
    s.step("b");
    s.count("ops", 2); s.gauge("load", 1);
    s.step("c");
  }, { counters: { bytes: { label: "bytes", format: "bytes" } } }));
  assert.deepEqual({ ...tl.snapshot(0).counters }, { load: 3 });
  assert.deepEqual({ ...tl.snapshot(2).counters }, { load: 3, ops: 1, bytes: 7 });
  assert.deepEqual({ ...tl.final.counters }, { load: 1, ops: 3, bytes: 7 });
  assert.equal(tl.counters.bytes.format, "bytes");
  assert.equal(tl.counters.ops.format, "int");
  const st = tl.steps[2];
  assert.equal(tl.sample(st.t0).counters.ops, 1);
  assert.equal(tl.sample(st.t1).counters.ops, 3);
});

test("snapshots are immutable records shared between steps (copy on write)", () => {
  const tl = compile(fig((s) => {
    s.housing("h", { tray: { cols: 4 } });
    s.tile("a", { in: "h", text: "1" }); s.tile("b", { in: "h", text: "2" });
    s.step("x");
    s.set("a", { text: "9" });
    s.step("y");
  }));
  const s1 = tl.snapshot(1).entities, s2 = tl.snapshot(2).entities;
  assert.equal(s1.get("b"), s2.get("b"), "unchanged record is shared");
  assert.notEqual(s1.get("a"), s2.get("a"));
  assert.equal(s1.get("a").text, "1"); assert.equal(s2.get("a").text, "9");
  assert.ok(Object.isFrozen(s1.get("a")));
  assert.equal(tl.snapshot(1), tl.snapshot(1));
  assert.equal(tl.final.final, true);
});

test("builder queries: s.get, s.has, s.key (first-seen order), s.rng is seeded and deterministic", () => {
  let seen;
  const build = (s, p) => {
    s.housing("h", { tray: { cols: 3 } });
    s.tile("a", { in: "h", key: "fox" }); s.tile("b", { in: "h", key: "dog" });
    seen = { k: [s.key("fox"), s.key("dog"), s.key("cat")], idx: s.get("b").index, has: s.has("a"), r: [s.rng.next(), s.rng.int(1, 6)], p };
    s.step("x");
  };
  compile(fig(build, { params: { seed: { value: 7 } } }));
  const first = seen;
  compile(fig(build, { params: { seed: { value: 7 } } }));
  assert.deepEqual(seen, first);
  assert.deepEqual(first.k, [0, 1, 2]);
  assert.equal(first.idx, 1); assert.equal(first.has, true);
  compile(fig(build, { params: { seed: { value: 8 } } }));
  assert.notDeepEqual(seen.r, first.r);
});

test("problems: unknown ids, non-containers, overflow, overlaps, missing captions, >8 keys, ops after the last step", () => {
  const tl = compile(fig((s) => {
    s.free("f");
    s.housing("h1", { in: "f", at: [0, 0] }); s.housing("h2", { in: "f", at: [30, 10] });
    s.housing("plain", { in: "f", at: [400, 0] });
    s.container("c", { in: "f", at: [0, 300], capacity: 1 });
    s.tile("t", { in: "c" });
    for (let i = 0; i < 9; i++) s.tile(`k${i}`, { in: "f", at: [600 + i * 40, 0], key: `key${i}` });
    s.step("ok");
    s.move("nope", "c");
    s.move("t", "plain");
    s.tile("t2", { in: "c" });
    s.step("");
    s.set("t", { text: "late" });
  }));
  const kinds = new Set(tl.problems.map((p) => p.kind));
  for (const k of ["unknown-id", "not-container", "overflow", "overlap", "no-caption", "keys", "trailing-ops"]) assert.ok(kinds.has(k), `missing problem ${k}: ${[...kinds]}`);
  const unknown = tl.problems.find((p) => p.kind === "unknown-id");
  assert.equal(unknown.step, 1);
});

test("hash is stable for the same script and changes with it", () => {
  const f = fig((s, p) => { s.tile("a", { text: String(p.n) }); s.step("x"); s.set("a", { text: "y" }); s.step("y"); }, { params: { n: { type: "int", value: 1 } } });
  assert.equal(compile(f).hash, compile(f).hash);
  assert.notEqual(compile(f).hash, compile(f, { params: { n: 2 } }).hash);
});

test("params resolve: defaults, then scenario overrides, then explicit values", () => {
  const f = { params: { a: { value: 1 }, b: { value: 2 } }, scenarios: [{ id: "s", params: { b: 5, hidden: true } }] };
  assert.deepEqual(resolveParams(f, null, "s"), { a: 1, b: 5, hidden: true });
  assert.deepEqual(resolveParams(f, { a: 9 }, "s"), { a: 9, b: 5, hidden: true });
  assert.deepEqual(resolveParams(f, null, null), { a: 1, b: 2 });
});

test("events mark notable ops for scrubber ticks; build errors become problems", () => {
  const tl = compile(fig((s) => {
    s.housing("h", { led: "ok" });
    s.step("x");
    s.set("h", { led: "fail" });
    s.step("y");
    throw new Error("boom");
  }));
  assert.ok(tl.events.some((e) => e.kind === "fail" && e.step === 1));
  assert.ok(tl.problems.some((p) => p.kind === "build-error" && /boom/.test(p.message)));
  assert.equal(tl.steps.length, 2);
});

test("narration helpers build markup that round-trips, and captions may only refer to real entities", () => {
  const m = `${ref("m2", "mapper 2")} emits ${key("fox")} ${tone("fail", "crashed")} ${code("hash(k) % R")}`;
  assert.equal(plain(m), "mapper 2 emits fox crashed hash(k) % R");
  assert.deepEqual(mentions(m), { keys: ["fox"], refs: ["m2"] });
  assert.equal(plain("{key:a\\|b|odd}"), "odd");
  const tl = compile(fig((s) => { s.tile("a"); s.step("see {ref:a} and {ref:ghost}"); }));
  assert.ok(tl.problems.some((p) => p.kind === "unknown-ref" && p.id === "ghost"));
});
