import { test } from "node:test";
import assert from "node:assert/strict";
import { stubScene } from "./stub.mjs";
import { network, pace, PACE } from "./actors.mjs";
import { MOTION } from "../engine/tokens.mjs";
import * as fmt from "./fmt.mjs";

const plain = (c) => fmt.ascii(fmt.plain(c));

function pingPong({ seed = 1, drop = 0, latency = { mean: 10, jitter: 4 }, rounds = 20, lanes = false, batch = 0, extra } = {}) {
  const s = stubScene({ seed });
  s.row("g", {});
  const net = network(s, { nodes: ["a", "b", "c"], in: "g", latency, drop, seed, batch, lanes: lanes ? { in: "g", length: 600 } : undefined, state: () => ({ ticks: 0, pings: 0, pongs: 0 }) });
  net.onStart("a", (ctx) => ctx.timer("tick", 5));
  net.onTimer("a", "tick", (ctx) => { ctx.state.ticks++; if (ctx.state.ticks <= rounds) { ctx.broadcast("Ping", { n: ctx.state.ticks }); ctx.timer("tick", 30); } });
  net.on("*", "Ping", (m, ctx) => { ctx.state.pings++; ctx.reply(m, "Pong", { n: m.body.n }); });
  net.on("a", "Pong", (m, ctx) => { ctx.state.pongs++; });
  extra?.(net, s);
  const res = net.run({ until: 5000, intro: "Three nodes." });
  s.$.finish();
  return { s, net, res };
}

test("events run in (time, seq) order and each makes one step at its sim time", () => {
  const s = stubScene();
  const net = network(s, { nodes: ["n1", "n2"], latency: 5, seed: 1 });
  const order = [];
  net.at(10, (n) => { order.push("a"); n.say("first at 10"); });
  net.at(10, (n) => { order.push("b"); n.say("second at 10"); });
  net.at(3, (n) => { order.push("c"); n.say("at 3"); });
  net.run({ intro: "Two nodes." });
  assert.deepEqual(order, ["c", "a", "b"]);
  assert.deepEqual(s.$.steps.map((x) => x.t), [0, 3, 10, 10]);
  assert.deepEqual(s.$.captions(), ["Two nodes.", "at 3.", "first at 10.", "second at 10."]);
  assert.deepEqual(s.$.finish(), []);
});

test("same seed, same recording; different seeds, different timings", () => {
  const a = pingPong({ seed: 4 }), b = pingPong({ seed: 4 }), c = pingPong({ seed: 5 });
  assert.equal(a.s.$.hash(), b.s.$.hash());
  assert.notEqual(a.s.$.hash(), c.s.$.hash());
  assert.deepEqual(a.s.$.problems, []);
  assert.deepEqual(a.net.state("a"), { ticks: 21, pings: 0, pongs: 40 });
  assert.deepEqual(a.net.state("b"), { ticks: 0, pings: 20, pongs: 0 });
  const ts = a.s.$.steps.map((x) => x.t);
  assert.ok(ts.every((t, i) => i === 0 || t >= ts[i - 1]), "sim time never runs backwards");
});

test("latency stays within mean ± jitter (with a floor) and FIFO links keep order", () => {
  const s = stubScene();
  const net = network(s, { nodes: ["x", "y"], latency: { mean: 10, jitter: 4 }, seed: 9 });
  const lats = [];
  net.on("y", "M", (m) => lats.push(m.latency));
  net.at(0, (n) => { for (let i = 0; i < 200; i++) n.send("x", "y", "M", { i }); }, { quiet: true });
  net.run({});
  assert.equal(lats.length, 200);
  assert.ok(lats.every((l) => l >= 6 && l <= 14), `${Math.min(...lats)}..${Math.max(...lats)}`);
  assert.ok(Math.max(...lats) - Math.min(...lats) > 6);
  const s2 = stubScene();
  const f = network(s2, { nodes: ["x", "y"], latency: { mean: 10, jitter: 9 }, fifo: true, seed: 9 });
  const got = [];
  f.on("y", "M", (m) => got.push(m.body.i));
  f.at(0, (n) => { for (let i = 0; i < 50; i++) n.send("x", "y", "M", { i }); }, { quiet: true });
  f.run({});
  assert.deepEqual(got, Array.from({ length: 50 }, (_, i) => i));
  const s3 = stubScene();
  const z = network(s3, { nodes: ["x", "y"], latency: { mean: 2, jitter: 5 }, seed: 1 });
  const zl = [];
  z.on("y", "M", (m) => zl.push(m.latency));
  z.at(0, (n) => { for (let i = 0; i < 50; i++) n.send("x", "y", "M", {}); }, { quiet: true });
  z.run({});
  assert.ok(zl.every((l) => l >= 0.1));
});

test("an analytic check: a token ring takes exactly the sum of its link latencies", () => {
  const ids = ["n0", "n1", "n2", "n3", "n4"];
  const lat = (from, to) => 3 + ids.indexOf(from) * 2 + ids.indexOf(to) * 0.5;
  const s = stubScene();
  const net = network(s, { nodes: ids, latency: lat, seed: 1, state: () => ({ seen: [] }) });
  net.onStart("n0", (ctx) => ctx.send("n1", "Token", { hops: 1 }));
  net.on("*", "Token", (m, ctx) => {
    ctx.state.seen.push(ctx.now);
    if (m.body.hops < 3 * ids.length) ctx.send(ids[(ids.indexOf(ctx.id) + 1) % ids.length], "Token", { hops: m.body.hops + 1 });
  });
  net.run({ intro: "A ring." });
  let t = 0, at = "n0";
  const expected = [];
  for (let h = 1; h <= 15; h++) { const next = ids[(ids.indexOf(at) + 1) % ids.length]; t += lat(at, next); expected.push([next, Math.round(t * 10) / 10]); at = next; }
  const actual = s.$.steps.slice(1).map((st) => [st.ops.find((c) => c.method === "deliver").args[0], st.t]);
  assert.deepEqual(actual.map((x) => x[1]), expected.map((x) => x[1]));
  assert.deepEqual(s.$.finish(), []);
});

test("random drops: about the configured rate, visible deaths, latency stream unchanged", () => {
  const run = (drop) => {
    const s = stubScene();
    const net = network(s, { nodes: ["x", "y"], latency: { mean: 10, jitter: 4 }, seed: 3, drop });
    const lats = [];
    net.on("y", "M", (m) => lats.push([m.body.i, m.latency]));
    net.at(0, (n) => { for (let i = 0; i < 1000; i++) n.send("x", "y", "M", { i }); }, { quiet: true });
    const res = net.run({});
    s.$.finish();
    return { s, lats, res };
  };
  const clean = run(0), lossy = run(0.3);
  assert.equal(clean.res.dropped, 0);
  assert.ok(Math.abs(lossy.res.dropped / 1000 - 0.3) < 0.04, `dropped ${lossy.res.dropped}`);
  assert.equal(lossy.res.delivered + lossy.res.dropped, 1000);
  const byI = new Map(clean.lats);
  assert.ok(lossy.lats.every(([i, l]) => byI.get(i) === l), "surviving messages keep their latencies");
  const tags = lossy.s.$.find("tag").filter((c) => c.args[1] === "dropped");
  assert.equal(tags.length, lossy.res.dropped);
  assert.ok(tags.every((c) => c.args[2].tone === "fail"));
  const removes = lossy.s.$.find("deliver").filter((c) => c.args[1]?.remove);
  assert.equal(removes.length, lossy.res.dropped);
  assert.deepEqual(lossy.s.$.problems, []);
});

test("crash and recover: deaths at a down node, timers stop, LEDs and hooks", () => {
  const hooks = [];
  const { s, net, res } = pingPong({
    extra(n) {
      n.crash("c", 40);
      n.recover("c", 120);
      n.onCrash("c", (ctx) => hooks.push(["crash", ctx.now]));
      n.onRecover("c", (ctx) => { hooks.push(["recover", ctx.now]); ctx.set({ led: "busy" }); });
    },
  });
  assert.deepEqual(hooks, [["crash", 40], ["recover", 120]]);
  assert.ok(res.toDown >= 2, `${res.toDown} lost to the crash`);
  const sets = s.$.find("set").filter((c) => c.args[0] === "c" && (c.args[1].led || "dim" in c.args[1]));
  assert.deepEqual(sets.map((c) => c.args[1]), [{ led: "fail", dim: true }, { led: "ok", dim: false }, { led: "busy" }]);
  assert.ok(s.$.captions().some((c) => /from a is lost: c is down/.test(plain(c))));
  assert.deepEqual(s.$.problems, []);
  assert.equal(net.isUp("c"), true);

  const s2 = stubScene();
  const n2 = network(s2, { nodes: ["p", "q"], seed: 1 });
  let fired = 0;
  n2.onStart("p", (ctx) => ctx.timer("t", 50));
  n2.onTimer("p", "t", () => fired++);
  n2.crash("p", 10);
  n2.run({});
  assert.equal(fired, 0, "a crashed node's timers never fire");
  assert.throws(() => n2.send("p", "q", "M", {}), /p is down/);
});

test("partitions cut links between sides, at send time and in flight; unlisted nodes reach everyone", () => {
  const s = stubScene();
  const net = network(s, { nodes: ["a", "b", "c", "d"], latency: { mean: 10, jitter: 0 }, seed: 1 });
  const got = [];
  net.on("*", "M", (m, ctx) => got.push(`${m.from}>${ctx.id}@${ctx.now}`));
  net.at(0, (n) => { n.send("a", "c", "M", {}); n.say("a sends before the split"); });
  net.partition([["a", "b"], ["c"]], 5, 50);
  net.at(20, (n) => { n.send("a", "b", "M", {}); n.send("a", "c", "M", {}); n.send("a", "d", "M", {}); n.send("d", "c", "M", {}); n.say("sends during the split"); });
  net.at(60, (n) => { n.send("a", "c", "M", {}); n.say("after the heal"); });
  const res = net.run({ intro: "Four nodes." });
  assert.deepEqual(got, ["a>b@30", "a>d@30", "d>c@30", "a>c@70"]);
  assert.equal(res.cut, 2);
  const caps = s.$.captions().map(plain);
  assert.ok(caps.includes("The network splits: a and b on one side, c on the other."));
  assert.ok(caps.includes("M from a to c cannot cross the partition."));
  assert.ok(caps.includes("The partition heals: every node can reach every other again."));
  const cutSteps = s.$.steps.filter((st) => /cannot cross/.test(st.caption)).map((st) => st.t);
  assert.deepEqual(cutSteps, [10, 25], "in-flight message dies on arrival; a message cut at send dies halfway");
  assert.throws(() => net.partition([["a"], ["a", "b"]]), /two groups/);
  assert.deepEqual(s.$.finish(), []);
});

// the runtime's own words can be the figure's: describe on the network, or per call
function splitRun(netOpts = {}, call) {
  const s = stubScene();
  const net = network(s, { nodes: ["a", "b", "c", "d"], latency: { mean: 10, jitter: 0 }, seed: 1, ...netOpts });
  net.on("*", "M", () => {});
  net.at(20, (n) => { n.send("a", "c", "M", {}, { text: "copy ×1" }); n.send("d", "c", "M", {}); n.say("sends during the split"); });
  call(net);
  net.run({ intro: "Four nodes." });
  const zones = s.$.steps.flatMap((st, i) => s.$.ops(i, "zone").map((c) => c.args[1]));
  return { caps: s.$.captions().map(plain), zones, problems: s.$.finish() };
}

test("describe: the split and heal captions, the zone title and lost-message captions, per network or per call", () => {
  // defaults unchanged
  const d = splitRun({}, (net) => net.partition([["a", "b"], ["c"]], 5, 50));
  assert.ok(d.caps.includes("The partition heals: every node can reach every other again."));
  assert.ok(d.caps.includes("M from a to c cannot cross the partition."));
  assert.equal(d.zones[0].title, "cut off");
  // on the network
  const n = splitRun({ describe: {
    split: (groups) => `The network breaks: ${groups[0].join(" and ")} cannot hear ${groups[1].join(" and ")}`,
    heal: () => "The network is whole again: every server can reach every other",
    zone: (groups) => `${groups.reduce((a, g) => (g.length < a.length ? g : a)).length} alone`,
    message: "text",
    lost: (g) => (g.reason === "partition" ? `${g.name} from ${g.from.join(", ")} never reaches ${g.to.join(", ")}: the network is broken` : null),
  } }, (net) => net.partition([["a", "b"], ["c"]], 5, 50));
  assert.ok(n.caps.includes("The network breaks: a and b cannot hear c."), n.caps.join(" | "));
  assert.ok(n.caps.includes("The network is whole again: every server can reach every other."));
  assert.ok(n.caps.includes("copy ×1 from a never reaches c: the network is broken."), "the packet's own label, not the raw type");
  assert.ok(!n.caps.some((c) => /partition|cut off/.test(c)));
  assert.equal(n.zones[0].title, "1 alone");
  // per call, over the network's: a caption, a zone title (false: none), and the heal caption at `until`
  const c = splitRun({ describe: { heal: "never used" } }, (net) => net.partition([["a", "b"], ["c"]], { at: 5, until: 50, caption: "The cable is cut", title: false, heal: "The cable is fixed" }));
  assert.ok(c.caps.includes("The cable is cut.") && c.caps.includes("The cable is fixed."), c.caps.join(" | "));
  assert.equal(c.zones[0].title, undefined);
  const h = splitRun({}, (net) => { net.partition([["a", "b"], ["c"]], 5, undefined, { title: "on its own" }); net.heal({ at: 50, caption: "Back together" }); });
  assert.ok(h.caps.includes("Back together."));
  assert.equal(h.zones[0].title, "on its own");
  const h2 = splitRun({}, (net) => { net.partition([["a", "b"], ["c"]], 5); net.heal(50, { caption: "Joined" }); });
  assert.ok(h2.caps.includes("Joined."));
  // a describe.message function names messages in every generated caption; "text" falls back to the type when labels differ
  const m = splitRun({ describe: { message: (type) => `a ${type.toLowerCase()} note` } }, (net) => net.partition([["a", "b"], ["c"]], 5, 50));
  assert.ok(m.caps.includes("a m note from a to c cannot cross the partition."), m.caps.join(" | "));
  const t = splitRun({ describe: { message: "text" }, batch: 5 }, (net) => net.partition([["a", "b", "d"], ["c"]], 5, 50));
  assert.ok(t.caps.includes("M from a and d to c cannot cross the partition."), t.caps.join(" | "));
  for (const r of [d, n, c, h, h2, m, t]) assert.deepEqual(r.problems, []);
});

test("pacing: builder pacing by default, explicit durations on request, both from the gap to the next step", () => {
  let prev = 0;
  for (let g = 0; g <= 5000; g += 7) { const d = pace(g, { ref: 12 }); assert.ok(d >= prev - 1e-9); prev = d; }
  const r3 = (x) => Math.round(x * 1000) / 1000;
  assert.equal(pace(0), r3(MOTION.step * PACE.min));
  assert.equal(pace(1e9), r3(MOTION.step * PACE.max));
  assert.equal(pace(12, { ref: 12 }), MOTION.step, "one mean latency plays in MOTION.step");
  assert.equal(pace(24, { ref: 12 }), r3(MOTION.step * 2), "linear by default: constant packet speed");
  assert.equal(pace(48, { ref: 12, gamma: 0.5 }), r3(MOTION.step * 2), "γ < 1 compresses long gaps");
  // default: the network hands pacing to the builder and restores it afterwards
  const { s } = pingPong({ rounds: 2 });
  const paces = s.$.find("pace").map((c) => c.args[0]);
  assert.deepEqual(paces, [{ ms: 10 / MOTION.step, min: MOTION.step * PACE.min, max: MOTION.step * PACE.max }, null]);
  assert.ok(s.$.steps.every((st) => st.dur === null && st.pace && Number.isFinite(st.t)));
  // explicit durations: step i lasts for the sim time until step i + 1
  const s2 = stubScene();
  const n2 = network(s2, { nodes: ["a", "b"], latency: 10, seed: 1, compress: 1 });
  n2.at(5, (x) => x.say("first"));
  n2.at(25, (x) => x.say("second"));
  n2.run({ intro: "Go." });
  assert.deepEqual(s2.$.steps.map((st) => st.dur), [pace(5, { ref: 10 }), pace(20, { ref: 10 }), pace(0, { ref: 10 })]);
  const s3 = stubScene();
  const n3 = network(s3, { nodes: ["a", "b"], compress: false, seed: 1 });
  n3.at(5, (x) => x.say("tick"));
  n3.run({});
  assert.equal(s3.$.steps[0].dur, null, "compress: false leaves durations to the builder");
  assert.equal(s3.$.find("pace").length, 0);
});

test("batching merges a burst into one step with chorus narration", () => {
  const s = stubScene();
  const net = network(s, { nodes: ["l", "f1", "f2", "f3"], latency: { mean: 10, jitter: 3 }, seed: 2, batch: 8 });
  net.onStart("l", (ctx) => ctx.broadcast("Beat", {}));
  net.on("*", "Beat", (m, ctx) => {
    ctx.reply(m, "Ack", {});
    ctx.chorus(`beat|${m.from}`, (who, n) => `${who} ${n > 1 ? "take" : "takes"} the beat`);
  });
  net.run({ intro: "One leader." });
  const caps = s.$.captions().map(plain);
  assert.match(caps[1], /^f\d, f\d and f\d take the beat\.$/);
  assert.match(caps[2], /^l receives Ack from (f\d, f\d and f\d)\.$/, "a fan-in burst names its senders");
  assert.equal(s.$.steps.length, 3, "intro, the burst of beats, the burst of acks (generated chorus)");
  assert.deepEqual(s.$.finish(), []);
  // a message sent inside a batch is never delivered in that same step
  const s2 = stubScene();
  const n2 = network(s2, { nodes: ["a", "b"], latency: 0.1, seed: 2, batch: 50 });
  n2.onStart("a", (ctx) => ctx.send("b", "Echo", { left: 5 }));
  n2.on("*", "Echo", (m, ctx) => { if (m.body.left) ctx.reply(m, "Echo", { left: m.body.left - 1 }); });
  n2.run({});
  assert.deepEqual(s2.$.finish(), []);
  assert.equal(s2.$.steps.length, 7, "the start step, then six echoes, each in its own step");
});

test("quiet losses join the next step; drain finishes messages in flight", () => {
  const s = stubScene();
  const net = network(s, { nodes: ["a", "b", "c"], latency: { mean: 10, jitter: 0 }, seed: 1, quiet: ["partition"] });
  net.partition([["a"], ["b", "c"]], 0);
  net.at(1, (n) => { n.send("a", "b", "M", {}); n.send("a", "c", "M", {}); n.say("a sends into the void"); });
  net.at(30, (n) => n.say("later"));
  net.run({});
  const caps = s.$.captions();
  assert.deepEqual(caps.map(plain), ["The network splits: a on one side, b and c on the other.", "a sends into the void.", "later."]);
  const lastOps = s.$.steps[2].ops.map((c) => c.method);
  assert.equal(lastOps.filter((m) => m === "deliver").length, 2, "the deaths ride along with the next step");
  assert.deepEqual(s.$.finish(), []);

  const s2 = stubScene();
  const n2 = network(s2, { nodes: ["a", "b"], latency: 40, seed: 1 });
  n2.onStart("a", (ctx) => { ctx.send("b", "Slow", {}); ctx.timer("never", 100); });
  let fired = false;
  n2.onTimer("a", "never", () => { fired = true; });
  const res = n2.run({ until: 10, intro: "Go." });
  assert.equal(res.reason, "until");
  assert.equal(fired, false);
  assert.deepEqual(s2.$.finish(), [], "the in-flight message was delivered by the drain");
  assert.throws(() => n2.run({}), /drained/);
});

test("lanes: sends between laned nodes draw diagonals; timers, crashes mark lanes", () => {
  const { s } = pingPong({ lanes: true, rounds: 2, extra: (n) => n.crash("b", 200) });
  const sends = s.$.find("send");
  assert.ok(sends.length > 0 && sends.every((c) => c.args[3].lane === true && c.args[3].deliver === "hold"));
  const marks = s.$.find("mark").map((c) => [c.args[0], c.args[1].text]);
  assert.ok(marks.some(([n, t]) => n === "a" && t === "tick"));
  assert.ok(marks.some(([n, t]) => n === "b" && t === "crash"));
  assert.deepEqual(s.$.problems, []);
});

test("node state is published as a copy, only when it changes", () => {
  const s = stubScene();
  const net = network(s, { nodes: ["a", "b"], seed: 1, state: () => ({ n: 0, log: [] }) });
  net.at(5, (n) => { n.state("a").n = 1; n.state("a").log.push("x"); n.say("bump"); });
  net.at(9, (n) => n.say("nothing changes"));
  net.run({ intro: "Two." });
  const sets = s.$.find("set").filter((c) => "state" in c.args[1]);
  assert.deepEqual(sets.map((c) => [c.args[0], c.args[1].state]), [["a", { n: 0, log: [] }], ["b", { n: 0, log: [] }], ["a", { n: 1, log: ["x"] }]]);
  net.state("a").log.push("mutated later");
  assert.deepEqual(s.$.snapshot(1).entities.get("a").state.log, ["x"]);
});

test("validation: unknown nodes, self-sends, scheduling in the past, drop rates", () => {
  const s = stubScene();
  const net = network(s, { nodes: ["a", "b"], seed: 1 });
  assert.throws(() => net.on("zz", "M", () => {}), /unknown node "zz"/);
  assert.throws(() => net.send("a", "a", "M", {}), /itself/);
  assert.throws(() => net.send("a", "q", "M", {}), /unknown receiver/);
  assert.throws(() => net.drop(2), /0..1/);
  net.at(10, (n) => { assert.throws(() => n.at(5, () => {}), /before now/); n.say("checked"); });
  net.run({});
  assert.throws(() => network(stubScene(), { nodes: [] }), /no nodes/);
  assert.throws(() => network(stubScene(), { nodes: ["a", "a"] }), /duplicate/);
});
