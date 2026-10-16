import { test } from "node:test";
import assert from "node:assert/strict";
import { stubScene, runFigure, resolveParams } from "./stub.mjs";
import { stateOf, counterOf, recordOf, idsOf } from "./inspect.mjs";

const messages = (s) => s.$.problems.map((p) => p.message);

test("records every call with a snapshot of its arguments", () => {
  const s = stubScene({ seed: 3 });
  const opts = { title: "MAPPER", tray: { cols: 2, rows: 1, of: "record" } };
  const h = s.housing("m0", opts);
  opts.title = "changed";
  opts.tray.cols = 99;
  s.tile("t0", { in: h, text: "fox", key: "fox" });
  s.step("Opening.");
  const c = s.$.find("housing")[0];
  assert.equal(c.args[1].title, "MAPPER");
  assert.equal(c.args[1].tray.cols, 2);
  assert.equal(s.$.find("tile")[0].args[1].in, "m0", "handles become ids");
  assert.equal(s.$.steps.length, 1);
  assert.equal(s.$.steps[0].ops.length, 3, "the step call belongs to the step it commits");
  assert.deepEqual(s.$.problems, []);
  assert.equal(s.key("fox"), 0);
  assert.equal(s.key("dog"), 1);
  assert.ok(s.has("t0") && !s.has("nope"));
  assert.equal(s.get("t0").text, "fox");
  assert.ok(Object.isFrozen(s.get("t0")));
  assert.equal(typeof s.rng.next(), "number");
});

test("flags unknown ids, use before declaration, removed entities", () => {
  const s = stubScene();
  s.row("r", {});
  s.set("late", { text: "x" });
  s.tile("late", { text: "y" });
  s.step("Go.");
  s.remove("late");
  s.set("late", { text: "z" });
  s.lit("ghost");
  s.step("Next.");
  s.$.finish();
  const m = messages(s);
  assert.ok(m.some((x) => /"late" used before it was declared \(declared in step 0\)/.test(x)), m.join("\n"));
  assert.ok(m.some((x) => /"late" was removed earlier/.test(x)));
  assert.ok(m.some((x) => /unknown lit entity "ghost"/.test(x)));
});

test("flags steps without captions, trailing ops, held messages and bad deliveries", () => {
  const s = stubScene();
  s.housing("a", {}); s.housing("b", {});
  s.step("");
  s.send("m1", "a", "b", { deliver: "hold" });
  s.deliver("m1");
  s.step("Same step.");
  s.send("m2", "a", "b", {});
  s.step("A plain send.");
  s.deliver("m2");
  s.send("m3", "a", "b", { deliver: "hold" });
  s.step("Held.");
  s.set("a", { led: "ok" });
  s.$.finish();
  const m = messages(s);
  assert.ok(m.includes("step without a caption"), m.join("\n"));
  assert.ok(m.some((x) => /delivered in the step that sent it/.test(x)));
  assert.ok(m.some((x) => /unknown message "m2"|"m2" was removed/.test(x)), "deliver: end messages are gone after their step");
  assert.ok(m.some((x) => /message "m3" was held but never delivered/.test(x)));
  assert.ok(m.some((x) => /1 operation\(s\) after the last step were never committed \(set\)/.test(x)));
});

test("say() satisfies a step's caption; step merges caption and says", () => {
  const s = stubScene();
  s.say("Said.");
  s.step();
  s.say("Two.");
  s.step("One.");
  assert.deepEqual(s.$.captions(), ["Said.", "One. Two."]);
  assert.deepEqual(s.$.finish(), []);
});

test("validates tones, LEDs, set fields, counters, lanes, time and overflow", () => {
  const s = stubScene({}, { counters: { tasks: {} } });
  s.housing("h", { led: "glow", tray: { cols: 1, rows: 1 } });
  s.tile("t1", { in: "h", tone: "pink" });
  s.tile("t2", { in: "h" });
  s.set("h", { colour: "red" });
  s.count("tasks"); s.count("bogus");
  s.mark("h", { t: 3 });
  s.step("One.", { t: 10 });
  s.step("Two.", { t: 5 });
  s.step("Three.", { dur: 0 });
  const m = messages(s);
  for (const want of [/unknown led "glow"/, /unknown tone "pink"/, /set: unknown field "colour"/, /counter "bogus" is not declared/, /"h" has no lane/,
    /sim time runs backwards/, /dur must be > 0/, /container "h" overflows: 2 tiles, room for 1/]) assert.ok(m.some((x) => want.test(x)), `${want}\n${m.join("\n")}`);
  assert.equal(s.$.counters.tasks, 1);
});

test("models membership: move, swap, spawn, remove, deliver into", () => {
  const s = stubScene();
  const a = s.array("a", [5, 2, 9], {});
  s.container("out", {});
  s.housing("src", {});
  s.step("Start.");
  s.swap(a.cell(0), a.cell(2));
  s.move(a.cell(1), "out");
  s.spawn("new", { from: "src", in: "a", text: "7", index: 0 });
  s.step("Shuffle.");
  assert.deepEqual(s.$.texts("a"), ["7", "9", "5"]);
  assert.deepEqual(s.$.texts("out"), ["2"]);
  s.send("pkt", "src", "out", { deliver: "hold", text: "4" });
  s.step("Fly.");
  s.deliver("pkt", { into: "out" });
  s.remove("new");
  s.step("Land.");
  assert.deepEqual(s.$.texts("out"), ["2", "4"]);
  assert.deepEqual(s.$.texts("a"), ["9", "5"]);
  // snapshots are isolated from later steps
  assert.deepEqual(s.$.snapshot(0).entities.get("a").members, ["a.0", "a.1", "a.2"]);
  assert.deepEqual(s.$.snapshot(1).entities.get("a").members, ["new", "a.2", "a.0"]);
  assert.equal(s.$.snapshot(2).entities.get("pkt").kind, "packet");
  assert.deepEqual(s.$.finish(), []);
});

test("bits, pointers, lanes and marks", () => {
  const s = stubScene();
  const b = s.bits("va", { width: 8, value: 0b1010_0001, fields: [{ name: "hi", from: 4, to: 7 }, { name: "lo", from: 0, to: 3 }] });
  assert.equal(b.cells.length, 8);
  assert.equal(b.cells[0], b.cell(7), "cells are msb first, cell(i) is bit i");
  assert.equal(s.get(b.cell(0)).text, "1");
  assert.equal(s.get(b.cell(1)).text, "0");
  assert.equal(s.get(b.cell(7)).text, "1");
  const arr = s.array("a", [1, 2], {});
  s.pointer("p", { at: arr.cell(0), text: "i" });
  s.point("p", arr.cell(1));
  s.point("p", "a");
  s.housing("n1", {}); s.housing("n2", {});
  s.lanes("L", { for: ["n1", "n2"] });
  s.mark("n1", { t: 4, text: "timeout" });
  s.send("m", "n1", "n2", { lane: true });
  s.step("Go.");
  assert.equal(s.get("p").at, arr.cell(1));
  assert.ok(messages(s).some((x) => /target "a" is a container/.test(x)));
  s.bits("bad", { width: 4, fields: [{ name: "x", from: 2, to: 9 }] });
  assert.ok(messages(s).some((x) => /field "x" \[2, 9\] is outside 0..3/.test(x)));
});

test("same build, same recording; strict mode throws", () => {
  const build = (seed) => { const s = stubScene({ seed }); s.array("a", [s.rng.int(1, 99), s.rng.int(1, 99)], {}); s.step("x"); return s.$; };
  assert.equal(build(4).json(), build(4).json());
  assert.equal(build(4).hash(), build(4).hash());
  assert.notEqual(build(4).hash(), build(5).hash());
  const s = stubScene({}, { strict: true });
  assert.throws(() => s.set("nope", {}), /unknown entity "nope"/);
});

test("runFigure resolves params like the runtime and checks invariants on every snapshot", () => {
  const figure = {
    params: { n: { value: 2 }, flavour: { value: "plain" } },
    scenarios: [{ id: "a" }, { id: "b", params: { n: 4 } }],
    counters: { steps: {} },
    invariants: {
      "n stays small": (snap) => (stateOf(snap, "box").n < 4 ? true : `n = ${stateOf(snap, "box").n}`),
      "counter is honest": (snap) => counterOf(snap, "steps") === snap.step,
    },
    build(s, p) {
      s.housing("box", { state: { n: 0 } });
      s.step("Start.");
      for (let i = 1; i <= p.n; i++) { s.set("box", { state: { n: i } }); s.count("steps"); s.step(`n = ${i}`); }
    },
  };
  assert.deepEqual(resolveParams(figure, "b", { flavour: "x" }), { scenario: "b", params: { n: 4, flavour: "x" } });
  assert.deepEqual(resolveParams(figure, "zzz").scenario, "a");
  const ok = runFigure(figure, { scenario: "a" });
  assert.deepEqual(ok.failures, []);
  assert.deepEqual(ok.problems, []);
  const bad = runFigure(figure, { scenario: "b" });
  assert.deepEqual(bad.failures, [{ step: 4, name: "n stays small", message: "n = 4" }]);
  const snap = bad.rec.final;
  assert.equal(recordOf(snap, "box").kind, "housing");
  assert.ok(idsOf(snap).includes("box"));
  assert.equal(recordOf({ entities: { box: { state: { n: 1 } } } }, "box").state.n, 1, "plain-object snapshots work too");
});
