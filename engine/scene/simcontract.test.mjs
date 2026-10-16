// The builder as sim runtimes drive it (CONTRACTS.md section 6): a discrete-event network sending held,
// lane-drawn messages delivered steps later, and tracked arrays/stacks narrating one op per step.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE } from "../tokens.mjs";
import { compile } from "./index.mjs";

const fig = (build, extra = {}) => ({ build, ...extra });

test("actors: broadcasts, held sends delivered several steps later, crashes, drops, re-used ids", () => {
  const log = [];
  const tl = compile(fig((s) => {
    const nodes = ["a", "b", "c", "d", "e"];
    s.ring("ring", {});
    for (const n of nodes) s.housing(n, { in: "ring", variant: "client", led: "idle", tray: { cols: 3 } });
    s.lanes("L", { for: nodes });
    s.step("five nodes", { t: 0 });
    // t = 1: a broadcasts a vote request (4 messages in flight at once)
    for (const n of nodes.slice(1)) s.send(`rv-${n}`, "a", n, { deliver: "hold", lane: true, key: "term 1", text: "RequestVote" });
    s.set("a", { led: "busy", state: { term: 1 } });
    s.mark("a", { t: 1, text: "candidate" });
    s.step("a asks for votes", { t: 1 });
    // t = 3, 4: some arrive; replies go back while others are still travelling
    s.deliver("rv-b"); s.send("vote-b", "b", "a", { deliver: "hold", lane: true, key: "term 1" });
    s.step("b votes", { t: 3 });
    s.deliver("rv-c", { into: "c" }); s.send("vote-c", "c", "a", { deliver: "hold", lane: true, key: "term 1" });
    log.push(["has rv-d in flight", s.has("rv-d")]);
    s.step("c votes and keeps the request", { t: 4 });
    s.set("d", { led: "fail", dim: true });
    s.step("d crashes", { t: 5 });
    s.remove("rv-d");                                  // arrives at a dead node: lost
    s.mark("d", { t: 6, text: "lost", tone: "fail" });
    s.deliver("vote-b");
    s.step("the request to d is lost; a has b's vote", { t: 6 });
    s.deliver("vote-c"); s.deliver("rv-e");
    s.set("a", { led: "ok", title: "leader" });
    s.step("a wins", { t: 8 });
    // ids can be reused once a message is gone
    s.send("rv-b", "a", "b", { lane: true, key: "term 2" });
    s.step("a new message with an old id", { t: 9 });
  }));
  assert.deepEqual(tl.problems, []);
  assert.deepEqual(log, [["has rv-d in flight", true]]);
  const step = (i, u = 0.5) => tl.steps[i].t0 + tl.steps[i].dur * u;
  // four requests in flight together during the broadcast step
  assert.equal(tl.sample(step(1, 0.6)).poses.filter((p) => p.kind === "packet" && !p.variant).length, 4);
  // rv-e travels from t=1 to t=8 across five steps, moving forward in every one of them
  const xe = [1, 2, 3, 4, 5].map((i) => tl.sample(step(i, 0.5)).poses.find((p) => p.id === "rv-e"));
  assert.ok(xe.every(Boolean));
  const E = tl.sample(0).poses.find((p) => p.id === "e");
  const dist = xe.map((p) => Math.hypot(p.x - E.x, p.y - E.y));
  for (let i = 1; i < dist.length; i++) assert.ok(dist[i] < dist[i - 1], `rv-e must approach e (${dist.map((d) => d.toFixed(0))})`);
  // rv-c became a tile in c's tray
  assert.equal(tl.final.entities.get("rv-c").kind, "tile");
  assert.equal(tl.final.entities.get("rv-c").parent, "c");
  // the lost message's diagonal ends at d's lane, dashed
  const lost = tl.sample(tl.duration).poses.find((p) => p.id === "rv-d@lane");
  assert.ok(lost && lost.dashed && Math.abs(lost.grow - 1) < 1e-6);
  // every lane diagonal persists to the end
  const diags = tl.sample(tl.duration).poses.filter((p) => p.variant === "message").map((p) => p.id).sort();
  assert.deepEqual(diags, ["rv-b@lane", "rv-b@lane~2", "rv-c@lane", "rv-d@lane", "rv-e@lane", "vote-b@lane", "vote-c@lane"].sort());
  // marks and the leader's new title
  assert.equal(tl.sample(tl.duration).poses.filter((p) => p.kind === "mark").length, 2);
  assert.equal(tl.final.entities.get("a").title, "leader");
  const ids = tl.sample(tl.duration).poses.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "pose ids stay unique when message ids are reused");
});

test("tracked arrays: one op per step with swap, set, tag, count, point and lit", () => {
  const tl = compile(fig((s) => {
    const a = s.array("a", [5, 2, 9, 1], { label: "a" });
    s.pointer("i", { at: a.cell(0), text: "i" });
    s.pointer("j", { at: a.cell(1), text: "j" });
    s.step("start");
    const cells = a.cells.slice();
    // bubble pass, narrated op by op like tracked.array(..., { auto: "op" })
    for (let k = 0; k < 3; k++) {
      s.point("i", cells[k]); s.point("j", cells[k + 1]);
      s.lit(cells[k], cells[k + 1]);
      s.count("compares");
      const x = Number(s.get(cells[k]).text), y = Number(s.get(cells[k + 1]).text);
      s.tag(cells[k], `${x} > ${y}?`);
      s.step(`compare a[${k}] and a[${k + 1}]`);
      if (x > y) {
        s.swap(cells[k], cells[k + 1]);
        [cells[k], cells[k + 1]] = [cells[k + 1], cells[k]];
        s.count("swaps");
        s.step(`swap a[${k}] and a[${k + 1}]`);
      }
    }
    s.set(cells[3], { tone: "ok" });
    s.step("9 is in place");
  }, { counters: { compares: { label: "compares", format: "int" }, swaps: { label: "swaps", format: "int" } } }));
  assert.deepEqual(tl.problems, []);
  const f = tl.final;
  const order = f.entities.get("a").children.map((id) => f.entities.get(id).text);
  assert.deepEqual(order, ["2", "5", "1", "9"]);
  assert.deepEqual({ ...f.counters }, { compares: 3, swaps: 2 });
  // pointers follow slots: after the pass they stand in front of slots 2 and 3
  const last = tl.sample(tl.duration);
  const slotX = (k) => last.poses.find((p) => p.id === f.entities.get("a").children[k]).x;
  assert.ok(Math.abs(last.poses.find((p) => p.id === "i").x - slotX(2)) < 0.01);
  assert.ok(Math.abs(last.poses.find((p) => p.id === "j").x - slotX(3)) < 0.01);
  assert.equal(last.poses.find((p) => p.text === "9" && p.kind === "tile").tone, "ok");
});

test("tracked stacks and queues: containers along z and y, push by spawn, pop by remove", () => {
  const tl = compile(fig((s) => {
    s.row("r");
    s.container("stack", { in: "r", axis: "z", label: "stack" });
    s.container("queue", { in: "r", axis: "y", label: "queue" });
    s.step("empty");
    for (let k = 0; k < 3; k++) { s.tile(`p${k}`, { in: "stack", text: `0x7f3a_2c${10 + k}` }); s.step(`push ${k}`); }
    s.remove("p2"); s.step("pop");
    for (let k = 0; k < 3; k++) s.spawn(`q${k}`, { from: "stack", in: "queue", text: String(k) });
    s.step("enqueue three");
    s.remove("q0", { style: "fade" }); s.step("dequeue");
  }));
  assert.deepEqual(tl.problems, []);
  const f = tl.sample(tl.steps[3].t1);
  const z = (id) => f.poses.find((p) => p.id === id).z;
  assert.ok(z("p1") > z("p0") && z("p2") > z("p1"));
  const g = tl.sample(tl.duration);
  const y = (id) => g.poses.find((p) => p.id === id).y;
  assert.ok(y("q2") > y("q1"));
  assert.equal(g.poses.find((p) => p.id === "q0"), undefined);
});

test("messages and tiles can travel a bus in both directions", () => {
  const tl = compile(fig((s) => {
    s.row("r");
    s.column("L", { in: "r" }); s.housing("m0", { in: "L", tray: { cols: 2 } }); s.housing("m1", { in: "L" });
    s.spacer("gap", { in: "r" });
    s.column("R", { in: "r" }); s.housing("r0", { in: "R", tray: { cols: 2 } });
    s.bus("bus", { from: ["m0", "m1"], to: ["r0"], via: "gap" });
    s.tile("t", { in: "r0", text: "ack" });
    s.step("x");
    s.send("req", "m1", "r0", { key: "rpc" }); s.step("request");
    s.send("rep", "r0", "m1", { key: "rpc" }); s.step("reply");
    s.move("t", "m0"); s.step("tile back");
  }));
  assert.deepEqual(tl.problems, []);
  for (const i of [1, 2, 3]) {
    const st = tl.steps[i];
    const f = tl.sample(st.t0 + st.dur * 0.5);
    const bus = f.poses.find((p) => p.id === "bus");
    const lit = bus.pulses.length + bus.branches.reduce((a, b) => a + b.pulses.length, 0);
    assert.ok(lit > 0, `step ${i}: the bus carries a pulse`);
  }
  const rep = tl.sample(tl.steps[2].t0 + tl.steps[2].dur * 0.5).poses.find((p) => p.id === "rep");
  assert.ok(Math.abs(rep.z - SIZE.packet.lift) < 0.01, "reply rides the groove, not an air arc");
});

test("s.zone: a printed region around entities that follows them, glides on membership change, fades in and out", () => {
  const tl = compile(fig((s) => {
    s.ring("ring", {});
    for (const n of ["a", "b", "c", "d", "e"]) s.housing(n, { in: "ring", variant: "client" });
    s.zone("z0", { around: ["a"], title: "seed" });
    s.step("one zone in S0");
    s.zone("part", { around: ["a", "b"], title: "partition", tone: "fail" });
    s.step("a partition appears");
    s.set("part", { around: ["a", "b", "c"] });
    s.step("c is cut off too");
    s.housing("f", { in: "ring", variant: "client" });
    s.step("a node joins: the ring reflows and the zone follows");
    s.remove("part");
    s.step("the partition heals");
  }));
  assert.deepEqual(tl.problems, []);
  const Z = (t, id = "part") => tl.sample(t).poses.find((p) => p.id === id);
  const H = (t, id) => tl.sample(t).poses.find((p) => p.id === id);
  const pad = SIZE.zone.pad;
  // in S0, around a with the zone pad
  const z0 = Z(0, "z0"), a0 = H(0, "a");
  assert.ok(Math.abs(z0.w - (a0.w + 2 * pad)) < 1e-6 && Math.abs(z0.x - a0.x) < 1e-6 && z0.opacity === 1);
  // fades in during its step, dashed in the fail tone
  const st1 = tl.steps[1];
  assert.ok(Z(st1.t0 + 0.05).opacity < 0.5 && Math.abs(Z(st1.t1).opacity - 1) < 1e-6);
  assert.ok(Z(st1.t1).dashed && Z(st1.t1).tone === "fail" && Z(st1.t1).title === "partition");
  // exact bounds of its members at rest
  const bounds = (t, ids) => { const ps = ids.map((id) => H(t, id)); return [Math.min(...ps.map((p) => p.x - p.w / 2)), Math.max(...ps.map((p) => p.x + p.w / 2))]; };
  const [x0, x1] = bounds(st1.t1, ["a", "b"]);
  assert.ok(Math.abs(Z(st1.t1).w - (x1 - x0 + 2 * pad)) < 1e-6);
  // membership change glides: mid-step the width is between the two
  const st2 = tl.steps[2];
  const area = (z) => z.w * z.d;
  const wA = area(Z(st2.t0)), wB = area(Z(st2.t1)), wM = area(Z(st2.t0 + st2.dur * 0.5));
  assert.ok(Math.abs(wB - wA) > 10 && wM > Math.min(wA, wB) && wM < Math.max(wA, wB));
  // follows members while the layout reflows
  const st3 = tl.steps[3];
  const [m0, m1] = bounds(st3.t0 + st3.dur * 0.5, ["a", "b", "c"]);
  assert.ok(Math.abs(Z(st3.t0 + st3.dur * 0.5).x - (m0 + m1) / 2) < 1e-6);
  // fades out and is gone
  const st4 = tl.steps[4];
  assert.ok(Z(st4.t0 + 0.2).opacity < 1);
  assert.equal(Z(tl.duration), undefined);
  assert.ok(!tl.final.entities.has("part"));
});

test("lost in flight: deliver({ remove, lost }) stops the packet where it is, flashes it fail and fades it; the diagonal stops there, dashed", () => {
  const tl = compile(fig((s) => {
    s.row("r", { gap: 300 }); s.housing("a", { in: "r" }); s.housing("b", { in: "r" });
    s.lanes("L", { for: ["a", "b"], length: 400 });
    s.step("start", { t: 0 });
    s.send("ok", "a", "b", { deliver: "hold", lane: true, key: "rpc" });
    s.send("x", "a", "b", { deliver: "hold", lane: true, key: "rpc" });
    s.step("two messages leave", { t: 10 });
    s.deliver("ok");
    s.step("one arrives after 10 ms", { t: 20 });
    s.step("time passes", { t: 22 });
    s.drop("x");
    s.step("the other is lost at 25 ms", { t: 25 });
    s.hold(1, "after");
  }));
  assert.deepEqual(tl.problems, []);
  const st = tl.steps[4];
  const A = tl.sample(0).poses.find((p) => p.id === "a"), B = tl.sample(0).poses.find((p) => p.id === "b");
  const x0 = A.x + A.w / 2, x1 = B.x - B.w / 2;
  // lost 15 ms into a typical 10 ms flight is clamped at 85 % of the way; it stops and lingers there
  const p0 = tl.sample(st.t0 + 0.01).poses.find((p) => p.id === "x");
  const frac = (p0.x - x0) / (x1 - x0);
  assert.ok(Math.abs(frac - 0.85) < 0.02, `stopped at ${frac}`);
  const p1 = tl.sample(st.t0 + 0.3).poses.find((p) => p.id === "x");
  assert.ok(Math.abs(p1.x - p0.x) < 1e-6 && p1.tone === "fail" && p1.flash > 0.2 && p1.opacity < 1);
  assert.equal(tl.sample(st.t0 + 0.7).poses.find((p) => p.id === "x"), undefined);
  // it moved forward before it was lost, monotonically
  const xs = [1, 2, 3].map((i) => tl.sample(tl.steps[i].t0 + tl.steps[i].dur * 0.5).poses.find((p) => p.id === "x").x);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2] && xs[2] <= p0.x + 1e-6);
  // the diagonal stops growing at the same fraction and is dashed
  const d = tl.sample(tl.duration).poses.find((p) => p.id === "x@lane");
  assert.ok(d.dashed && Math.abs(d.grow - 0.85) < 0.02);
  assert.ok(!tl.final.entities.has("x"));
  // an explicit fraction is honoured
  const tl2 = compile(fig((s) => {
    s.row("r", { gap: 300 }); s.housing("a", { in: "r" }); s.housing("b", { in: "r" });
    s.step("start", { t: 0 });
    s.send("x", "a", "b", { deliver: "hold" }); s.step("leaves", { t: 10 });
    s.deliver("x", { remove: true, lost: true, at: 0.5 }); s.step("dies half way", { t: 14 });
  }));
  const q = tl2.sample(tl2.steps[2].t0 + 0.05).poses.find((p) => p.id === "x");
  assert.ok(Math.abs((q.x - x0) / (x1 - x0) - 0.5) < 0.02);
});
