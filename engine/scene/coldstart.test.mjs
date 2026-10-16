// Regressions from a cold-start build (a TCP congestion-control figure written from SKILL.md alone):
// mark times, lane fitting, send departure offsets, the pace reading floor, connection props, counter timing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, MOTION } from "../tokens.mjs";
import { compile } from "./index.mjs";

const fig = (build) => ({ build });
const two = (s, o = {}) => { s.row("r", { gap: 200 }); s.housing("a", { in: "r" }); s.housing("b", { in: "r" }); s.trace("ab", "a", "b"); s.lanes("L", { for: ["a", "b"], length: 600, ...o }); };

test("a mark without t lands at the sim time of the step it is committed in", () => {
  const tl = compile(fig((s) => {
    two(s);
    s.step("start", { t: 0 });
    s.mark("a", { text: "RTO" });
    s.step("timer fires", { t: 700 });
    s.mark("b", { text: "still" });
    s.beat();
    s.set("b", { sub: "x" });
    s.step("no t: keeps 700");
  }));
  assert.deepEqual(tl.problems, []);
  const marks = tl.final.entities;
  const m1 = [...marks.values()].find((r) => r.kind === "mark" && r.lane === "a");
  const m2 = [...marks.values()].find((r) => r.kind === "mark" && r.lane === "b");
  assert.equal(m1.t, 700);
  assert.equal(m2.t, 700);
  const f = tl.sample(tl.duration);
  const pm = f.poses.find((p) => p.kind === "mark" && p.id === m1.id), lane = f.poses.find((p) => p.id === "L:a");
  assert.equal(pm.t, 700);
  assert.ok(Math.abs(pm.x - (lane.points[0][0] + 700 * lane.scale)) < 0.5, "drawn at 700, not 0");
});

test("the lanes rail ends just after the last event, on a round major tick", () => {
  const tl = compile(fig((s) => {
    two(s, { length: 760 });
    s.step("start", { t: 0 });
    s.send("m", "a", "b", { deliver: "hold", lane: true });
    s.step("send", { t: 500 });
    s.deliver("m");
    s.step("end", { t: 1030 });
  }));
  const lane = tl.sample(0).poses.find((p) => p.id === "L:b");
  const end = lane.length / lane.scale;
  assert.ok(end >= 1030 && end <= 1030 * 1.2, `axis ends at ${end} ms`);
  const last = lane.labels[lane.labels.length - 1].text;
  assert.equal(last, `${Math.round(end)} ms`);
  assert.ok(Math.round(end) % 100 === 0, last);
  // ticks fill the rail exactly: n major ticks of a round amount of time
  const n = Math.round(lane.length / lane.ticks.major);
  assert.ok(Math.abs(n * lane.ticks.major - lane.length) < 1e-6);
  assert.equal(lane.labels.length, n + 1);
  // an explicit scale keeps the fixed ticks
  const fixed = compile(fig((s) => { two(s, { scale: 0.5 }); s.step("a", { t: 0 }); s.step("b", { t: 100 }); }));
  const fl = fixed.sample(0).poses.find((p) => p.id === "L:b");
  assert.equal(fl.scale, 0.5);
  assert.equal(fl.ticks.major, SIZE.lane.tickMajor);
});

test("s.send { delay } and { at } stagger departures inside one step", () => {
  const tl = compile(fig((s) => {
    two(s);
    s.step("start", { t: 0 });
    for (let k = 0; k < 3; k++) s.send(`seg${k}`, "a", "b", { deliver: "hold", lane: true, delay: k * 10 });
    s.send("late", "a", "b", { deliver: "hold", lane: true, at: 0.5 });
    s.step("a burst", { t: 100 });
    s.step("time passes", { t: 140 });
    for (const id of ["seg0", "seg1", "seg2", "late"]) s.deliver(id);
    s.step("all arrive", { t: 180 });
  }));
  assert.deepEqual(tl.problems, []);
  const end = tl.duration;
  const x0 = (id) => tl.sample(end).poses.find((p) => p.id === `${id}@lane`).points[0][0];
  const lane = tl.sample(0).poses.find((p) => p.id === "L:a");
  assert.ok(Math.abs(x0("seg1") - x0("seg0") - 10 * lane.scale) < 0.01);
  assert.ok(Math.abs(x0("seg2") - x0("seg0") - 20 * lane.scale) < 0.01);
  assert.ok(Math.abs(x0("late") - x0("seg0") - 20 * lane.scale) < 0.01, "at 0.5 of a 40 ms step = 20 ms");
  // in the world: a delayed packet has not left yet when the first one is on its way
  const st = tl.steps[1];
  const early = st.t0 + 0.02 * st.dur;
  const p0 = tl.sample(early).poses.find((p) => p.id === "seg0"), p2 = tl.sample(early).poses.find((p) => p.id === "seg2");
  assert.ok(p0 && !p2, "seg2 waits for its departure");
  const later = tl.steps[2].t0 + 0.01;
  const q0 = tl.sample(later).poses.find((p) => p.id === "seg0"), q2 = tl.sample(later).poses.find((p) => p.id === "seg2");
  assert.ok(q0 && q2 && q0.x > q2.x + 1, "seg0 leads seg2");
  // bad values are reported
  const bad = compile(fig((s) => { two(s); s.step("a", { t: 0 }); s.send("x", "a", "b", { delay: "soon" }); s.step("b", { t: 10 }); }));
  assert.ok(bad.problems.some((p) => p.kind === "bad-prop"));
});

test("paced steps: dur = max(paced, reading time); s.pace({ read: false }) keeps sim-time proportions", () => {
  const cap = "one two three four five six seven eight nine ten eleven twelve";
  const run = (o) => compile(fig((s) => {
    two(s);
    s.pace({ ms: 40, min: 0.2, max: 5, ...o });
    s.step(cap, { t: 0 });
    s.step(cap, { t: 40 });
    s.step(cap, { t: 200 });
    s.step("end", { t: 200 });
  }));
  const R = MOTION.read, read = Math.min(R.max, R.base + R.perWord * 12);
  const a = run({});
  assert.ok(Math.abs(a.steps[0].dur - read) < 1e-9 && Math.abs(a.steps[1].dur - read) < 1e-9, "both floored to the reading time");
  const b = run({ read: false });
  assert.ok(Math.abs(b.steps[0].dur - 1) < 1e-9, `40 ms / 40 = 1 s, got ${b.steps[0].dur}`);
  assert.ok(Math.abs(b.steps[1].dur - 4) < 1e-9, `160 ms / 40 = 4 s, got ${b.steps[1].dur}`);
});

test("a trace takes tone, dim, state and dashed; other props on it are problems", () => {
  const tl = compile(fig((s) => {
    two(s);
    s.step("start");
    s.set("ab", { tone: "fail" });
    s.step("the link goes dark");
    s.set("ab", { text: "down", led: "fail" });
    s.step("nonsense");
  }));
  assert.equal(tl.final.entities.get("ab").tone, "fail");
  assert.equal(tl.sample(tl.steps[1].t1 - 0.01).poses.find((p) => p.id === "ab").tone, "fail");
  const bad = tl.problems.filter((p) => p.kind === "bad-prop");
  assert.equal(bad.length, 2);
  assert.match(bad[0].message, /a trace has no "text"/);
});

test("a counter changes once its motion lands, not late in the reading hold after it", () => {
  const tl = compile(fig((s) => {
    two(s);
    s.pace({ ms: 40 });
    s.gauge("cwnd", 9);
    s.step("start", { t: 0 });
    s.gauge("cwnd", 10);
    s.step("Duplicate ACK 18 (6 so far): cwnd inflates to 10 and the sender may send one more segment now.", { t: 10 });
    s.step("end", { t: 20 });
  }));
  const st = tl.steps[1];
  assert.ok(st.dur > 3);
  assert.equal(tl.sample(st.t0 + 0.4 * st.dur).counters.cwnd, 10);
});
