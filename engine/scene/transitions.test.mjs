// Every op's transition: where it starts, where it ends, and the shape in between (DESIGN.md section 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE, MOTION } from "../tokens.mjs";
import { compile } from "./index.mjs";

const fig = (build) => ({ build });
const pose = (tl, t, id, view) => tl.sample(t, view).poses.find((p) => p.id === id);
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;
const samples = (tl, i, id, n = 120, view) => {
  const st = tl.steps[i];
  const out = [];
  for (let k = 0; k <= n; k++) { const t = st.t0 + (st.dur * k) / n; out.push({ t, p: pose(tl, Math.min(t, tl.duration), id, view) }); }
  return out;
};
const zIn = SIZE.variant.node.h - SIZE.well.depth;

// two housings joined by a trace, one record moving across
const twoHousings = (more = () => {}) => fig((s) => {
  s.row("r", { gap: 120 });
  s.housing("a", { in: "r", tray: { cols: 2, of: "record" } });
  s.housing("b", { in: "r", tray: { cols: 2, of: "record" } });
  s.trace("ab", "a", "b");
  s.tile("x", { in: "a", of: "record", text: "fox · 1", key: "fox" });
  s.tile("y", { in: "a", of: "record", text: "dog · 1", key: "dog" });
  s.step("start");
  more(s);
});

test("move along a trace: lift out of the slot, glide on the groove with a pulse, settle into the new slot", () => {
  const tl = compile(twoHousings((s) => { s.move("x", "b"); s.step("x moves"); s.hold(0.9, "rest"); }));
  const st = tl.steps[1];
  const p0 = pose(tl, st.t0, "x"), p1 = pose(tl, st.t1, "x");
  const before = pose(tl, tl.steps[0].t0 + 0.1, "x");
  assert.ok(near(p0.x, before.x) && near(p0.y, before.y) && near(p0.z, zIn));
  const bTile = tl.sample(st.t1).poses.find((p) => p.id === "x");
  assert.ok(bTile.x > 0 && near(bTile.z, zIn));
  // lift phase: rises MOTION.lift while staying over its slot
  const lift = pose(tl, st.t0 + st.dur * 0.15 * 0.99, "x");
  assert.ok(lift.z > zIn + MOTION.lift * 0.9 && Math.abs(lift.x - p0.x) < 1);
  // on the groove: glide height, and the trace carries a keyed pulse that ends at the tile
  const S = samples(tl, 1, "x");
  const onTrace = S.filter(({ p }) => p.x > -15 && p.x < 15);
  assert.ok(onTrace.length >= 2);
  for (const { p } of onTrace) assert.ok(near(p.z, MOTION.lift, 0.6), `glide z ${p.z}`);
  const mid = onTrace[Math.floor(onTrace.length / 2)];
  const tr = tl.sample(mid.t).poses.find((p) => p.id === "ab");
  assert.equal(tr.pulses.length, 1);
  assert.equal(tr.pulses[0].key, tl.keys.find((k) => k.name === "fox").index);
  assert.ok(tr.pulses[0].s1 > tr.pulses[0].s0 && tr.pulses[0].s1 - tr.pulses[0].s0 <= 60.01);
  assert.ok(tr.glow > 0);
  // never under a housing top while crossing an edge, and no bounce at the end (monotone approach)
  const tail = S.slice(-20).map(({ p }) => p.z);
  for (let i = 1; i < tail.length; i++) assert.ok(tail[i] <= tail[i - 1] + 1e-6, "z bounces while settling");
  assert.ok(near(p1.x, bTile.x));
  // auto attention while it moves, gone in the next step
  assert.ok(pose(tl, st.t0 + st.dur * 0.5, "x").lit > 0.9);
  assert.ok(pose(tl, tl.steps[2].t0 + 0.5, "x").lit < 0.01);
  // the sibling reflows into the free slot in the same step
  const y0 = pose(tl, st.t0, "y"), y1 = pose(tl, st.t1, "y"), ym = pose(tl, st.t0 + st.dur * 0.6, "y");
  assert.ok(y1.x < y0.x - 10);
  assert.ok(ym.x < y0.x && ym.x > y1.x);
});

test("arc hop elsewhere: parabolic, height clamp(k * distance), tilts into travel and lands level", () => {
  const tl = compile(twoHousings((s) => { s.move("x", "b", { via: "air" }); s.step("hop"); }));
  const S = samples(tl, 1, "x", 200);
  const a = S[0].p, b = S[S.length - 1].p;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const H = Math.min(MOTION.hop.max, Math.max(MOTION.hop.min, MOTION.hop.k * d));
  const peak = Math.max(...S.map(({ p }) => p.z));
  assert.ok(near(peak, zIn + H, 1.5), `peak ${peak} vs ${zIn + H}`);
  const midBank = S[60].p.bank;
  assert.ok(midBank > 1, "leans toward +x");
  assert.ok(near(b.bank, 0) && near(b.pitch, 0) && near(a.bank, 0));
});

test("swap: two arcs, one higher, ending in each other's slots", () => {
  const tl = compile(twoHousings((s) => { s.swap("x", "y"); s.step("swap"); }));
  const st = tl.steps[1];
  const x0 = pose(tl, st.t0, "x"), y0 = pose(tl, st.t0, "y"), x1 = pose(tl, st.t1, "x"), y1 = pose(tl, st.t1, "y");
  assert.ok(near(x1.x, y0.x) && near(y1.x, x0.x));
  const hx = Math.max(...samples(tl, 1, "x").map(({ p }) => p.z)), hy = Math.max(...samples(tl, 1, "y").map(({ p }) => p.z));
  assert.ok(hx > hy + 2, `arcs at ${hx} and ${hy}`);
});

test("spawn emerges from its source, then travels to its slot", () => {
  const tl = compile(twoHousings((s) => {
    s.spawn("z", { from: "x", in: "a", of: "record", text: "fox · 1", key: "fox" });
    s.step("spawn");
  }));
  const st = tl.steps[1];
  const src = pose(tl, st.t0, "x");
  const z0 = pose(tl, st.t0 + 0.001, "z");
  assert.ok(near(z0.x, src.x, 0.5) && near(z0.y, src.y, 0.5));
  assert.ok(z0.opacity < 0.1 && z0.scale < 0.7);
  assert.ok(z0.z >= src.z + SIZE.record.h - 0.01, "emerges from the top of its source");
  const z1 = pose(tl, st.t1, "z");
  assert.ok(near(z1.z, zIn) && near(z1.opacity, 1) && near(z1.scale, 1));
  assert.ok(pose(tl, st.t0 + 0.05, "z").flash > 0.5);
  assert.equal(pose(tl, tl.steps[0].t0, "z"), undefined);
});

test("create after the first step rises out of the floor with a flash", () => {
  const tl = compile(twoHousings((s) => { s.tile("n", { in: "b", of: "record", text: "new · 1" }); s.step("enter"); }));
  const st = tl.steps[1];
  const e0 = pose(tl, st.t0 + 0.01, "n"), e1 = pose(tl, st.t0 + MOTION.enter, "n");
  assert.ok(e0.z < e1.z - 2 && e0.opacity < 0.2 && e0.flash > 0.5);
  assert.ok(near(e1.z, zIn) && near(e1.opacity, 1));
});

test("remove: sink and fade; or fly into a consumer, which flashes", () => {
  const tl = compile(twoHousings((s) => { s.remove("y"); s.step("sink"); s.remove("x", { to: "b" }); s.step("consume"); s.hold(0.5, "rest"); }));
  const s1 = tl.steps[1];
  const a = pose(tl, s1.t0, "y"), m = pose(tl, s1.t0 + MOTION.exit * 0.6, "y");
  assert.ok(m.z < a.z && m.opacity < 1);
  assert.equal(pose(tl, s1.t0 + MOTION.exit + 0.01, "y"), undefined);
  const s2 = tl.steps[2];
  const c = pose(tl, s2.t1 - 0.02, "x");
  const B = pose(tl, s2.t1, "b");
  assert.ok(c === undefined || (Math.abs(c.x - B.x) < 15 && c.opacity < 0.3));
  assert.equal(pose(tl, s2.t1 + 0.01, "x"), undefined);
  assert.ok(pose(tl, s2.t1 + 0.02, "b").flash > 0.3);
});

test("set: value roll (textOut + roll over MOTION.roll), flash, LED crossfade, dim, meter", () => {
  const tl = compile(fig((s) => {
    s.housing("h", { tray: { cols: 1 }, led: "ok", meter: 0 });
    s.tile("t", { in: "h", text: "7" });
    s.step("x");
    s.set("t", { text: "8" }); s.set("h", { led: "fail", dim: true, meter: 1 });
    s.step("y");
  }));
  const st = tl.steps[1];
  const r0 = pose(tl, st.t0 + 0.01, "t"), r1 = pose(tl, st.t0 + MOTION.roll * 0.5, "t"), r2 = pose(tl, st.t0 + MOTION.roll + 0.05, "t");
  assert.equal(r0.textOut, "7"); assert.equal(r0.text, "8");
  assert.ok(r1.roll > r0.roll && r1.roll < 1);
  assert.equal(r2.textOut, null);
  assert.ok(r0.flash > 0.4);
  const h0 = pose(tl, st.t0 + 0.05, "h"), h1 = pose(tl, st.t1, "h");
  assert.equal(h0.led, "fail"); assert.equal(h0.ledPrev, "ok"); assert.ok(h0.ledMix < 1);
  assert.ok(h0.dim > 0 && h0.dim < 1 && near(h1.dim, 1));
  assert.ok(near(h1.meter, 1) && pose(tl, st.t0 + st.dur * 0.3, "h").meter < 1);
  // a tile in a dimmed housing dims with it
  assert.ok(pose(tl, st.t1, "t").dim > 0.99);
});

test("beats run in order; siblings in a beat stagger by MOTION.stagger", () => {
  const tl = compile(fig((s) => {
    s.row("r"); s.housing("a", { in: "r", tray: { cols: 4 } }); s.housing("b", { in: "r", tray: { cols: 4 } }); s.trace("ab", "a", "b");
    for (let i = 0; i < 3; i++) s.tile(`t${i}`, { in: "a", text: String(i) });
    s.step("x");
    s.move("t0", "b"); s.move("t1", "b");
    s.beat();
    s.move("t2", "b");
    s.step("beats");
  }));
  const st = tl.steps[1];
  assert.equal(st.beats.length, 2);
  const startOf = (id) => { for (const { t, p } of samples(tl, 1, id, 2000)) if (Math.abs(p.z - zIn) > 0.01) return t; return Infinity; };
  const s0 = startOf("t0"), s1 = startOf("t1"), s2 = startOf("t2");
  assert.ok(near(s1 - s0, MOTION.stagger, 0.01), `stagger ${s1 - s0}`);
  assert.ok(s2 >= st.beats[1].t0 - 1e-6);
  const endOf = (id) => { const S = samples(tl, 1, id, 2000); for (let k = S.length - 1; k > 0; k--) if (Math.abs(S[k].p.x - S[S.length - 1].p.x) > 0.01) return S[k].t; return 0; };
  assert.ok(endOf("t1") <= st.beats[0].t1 + 1e-3, "beat 1 is over before beat 2 starts");
});

test("send along a trace: packet from port to port, pulse behind it, absorbed on arrival", () => {
  const tl = compile(twoHousings((s) => { s.send("m", "a", "b", { key: "fox", text: "put" }); s.step("send"); s.hold(0.6, "after"); }));
  const st = tl.steps[1];
  const A = pose(tl, 0, "a"), B = pose(tl, 0, "b");
  const p0 = pose(tl, st.t0 + 0.001, "m");
  assert.equal(p0.kind, "packet");
  assert.ok(near(p0.x, A.x + A.w / 2, 0.5) && near(p0.z, SIZE.packet.lift));
  const p1 = pose(tl, st.t1 - 1e-4, "m");
  assert.ok(near(p1.x, B.x - B.w / 2, 0.5));
  const tr = tl.sample(st.t0 + st.dur * 0.5).poses.find((p) => p.id === "ab");
  assert.equal(tr.pulses.length, 1);
  assert.equal(pose(tl, st.t1 + 0.3, "m"), undefined);
});

test("air send arcs over the floor and leaves a fading print trace", () => {
  const tl = compile(fig((s) => {
    s.row("r", { gap: 200 }); s.housing("a", { in: "r" }); s.housing("b", { in: "r" });
    s.step("x");
    s.send("m", "a", "b", { via: "air", key: "vote" }); s.step("send"); s.hold(1.5, "after");
  }));
  const st = tl.steps[1];
  const mid = pose(tl, st.t0 + st.dur * 0.35, "m");
  assert.ok(mid.z > SIZE.packet.lift + 10);
  const pr = pose(tl, st.t0 + st.dur * 0.35, "m@print");
  assert.ok(pr && pr.style === "print" && pr.grow > 0 && pr.grow < 1);
  const later = tl.sample(st.t1 + 0.1).poses.find((p) => p.id === "m@print");
  assert.ok(!later || later.opacity < pr.opacity);
});

test("held sends: positioned by simulated time across steps, delivered several steps later, many in flight", () => {
  const tl = compile(fig((s) => {
    s.row("r", { gap: 240 }); s.housing("a", { in: "r" }); s.housing("b", { in: "r", tray: { cols: 4 } }); s.housing("c", { in: "r" });
    s.lanes("L", { for: ["a", "b", "c"], length: 400 });
    s.step("t0", { t: 0 });
    for (let k = 0; k < 6; k++) s.send(`m${k}`, "a", k % 2 ? "b" : "c", { deliver: "hold", lane: true, key: "rpc" });
    s.step("six messages leave", { t: 10 });
    s.step("time passes", { t: 20 });
    s.step("time passes", { t: 30 });
    s.deliver("m0"); s.deliver("m2"); s.deliver("m4");
    s.deliver("m1", { into: "b" });
    s.step("some arrive", { t: 40 });
    s.deliver("m3"); s.deliver("m5", { remove: true });
    s.step("the rest arrive", { t: 50 });
  }));
  assert.deepEqual(tl.problems, []);
  const at = (i, u) => tl.steps[i].t0 + tl.steps[i].dur * u;
  // all six fly together; progress follows simulated time (10 -> 40 ms for m0), so it is monotone and ~1/3 at t = 20
  const xs = [0.1, 0.5, 0.99].map((u) => pose(tl, at(1, u), "m0").x).concat([0.5].map((u) => pose(tl, at(2, u), "m0").x));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] > xs[i - 1]);
  const inFlight = tl.sample(at(2, 0.5)).poses.filter((p) => p.kind === "packet" && !p.variant);
  assert.equal(inFlight.length, 6);
  const Ax = pose(tl, 0, "a").x + pose(tl, 0, "a").w / 2, Cx = pose(tl, 0, "c").x - pose(tl, 0, "c").w / 2;
  const fr = (pose(tl, tl.steps[2].t0, "m0").x - Ax) / (Cx - Ax);
  assert.ok(Math.abs(fr - (20 - 10) / (40 - 10)) < 0.08, `progress at t=20: ${fr}`);
  // arrives at the start of its deliver step
  assert.ok(Math.abs(pose(tl, tl.steps[4].t0 + 1e-4, "m0").x - Cx) < 1);
  // delivered into a container it becomes a tile in the tray
  assert.equal(pose(tl, tl.steps[4].t1, "m1").kind, "tile");
  // lane diagonals grow with the playhead and stay afterwards, dimmed
  const d = (t) => tl.sample(t).poses.find((p) => p.id === "m0@lane");
  assert.ok(d(at(2, 0)).grow > 0.3 && d(at(2, 0)).grow < 0.37);
  assert.ok(near(d(tl.duration).grow, 1) && d(tl.duration).dim > 0.5);
  const ph = tl.sample(at(2, 0)).poses.find((p) => p.kind === "playhead");
  const lane = tl.sample(0).poses.find((p) => p.kind === "lane");
  assert.ok(Math.abs(ph.x - (lane.points[0][0] + 20 * lane.scale)) < 0.5);
});

test("marks sit on their lane at their time; the playhead runs on interpolated simulated time", () => {
  const tl = compile(fig((s) => {
    s.row("r"); s.housing("a", { in: "r" }); s.housing("b", { in: "r" });
    s.lanes("L", { for: ["a", "b"], length: 500, scale: 10 });
    s.step("start", { t: 0 });
    s.mark("b", { t: 12, text: "commit", tone: "ok" });
    s.step("mark", { t: 12 });
  }));
  const f = tl.sample(tl.duration);
  const m = f.poses.find((p) => p.kind === "mark");
  const lane = f.poses.find((p) => p.id === "L:b");
  assert.ok(near(m.x, lane.points[0][0] + 120) && near(m.y, lane.points[0][1]));
  assert.equal(m.t, 12);
  const mid = tl.sample(tl.steps[0].t0 + tl.steps[0].dur / 2);
  assert.ok(mid.simTime > 0 && mid.simTime < 12);
});

test("pointers stand in front of their slot and glide between slots", () => {
  const tl = compile(fig((s) => {
    s.array("a", [3, 1, 2]);
    s.pointer("i", { at: "a[0]" });
    s.step("x");
    s.point("i", "a[2]");
    s.step("y");
    s.swap("a[0]", "a[2]");
    s.step("swap: i stays on its slot");
  }));
  const st = tl.steps[1];
  const t0 = pose(tl, 0, "a[0]"), t2 = pose(tl, 0, "a[2]");
  const p0 = pose(tl, st.t0, "i"), pm = pose(tl, st.t0 + st.dur * 0.5, "i"), p1 = pose(tl, st.t1, "i");
  assert.ok(near(p0.x, t0.x) && near(p1.x, t2.x) && pm.x > p0.x && pm.x < p1.x);
  assert.ok(p0.y > t0.y + SIZE.tile.d / 2);
  assert.ok(near(pose(tl, tl.duration, "i").x, t2.x));
});

test("LOD fades by view.pxPerUnit; hover and selected flags", () => {
  const tl = compile(fig((s) => { s.tile("detail", { text: "x", lod: { minPx: 2 } }); s.tile("other", { text: "y" }); s.step("x"); }));
  assert.equal(pose(tl, 0, "detail", { pxPerUnit: 1 }), undefined);
  assert.ok(near(pose(tl, 0, "detail", { pxPerUnit: 4 }).opacity, 1));
  const half = pose(tl, 0, "detail", { pxPerUnit: 2 });
  assert.ok(half.opacity > 0 && half.opacity < 1);
  const f = tl.sample(0, { hover: "other", selected: "other" });
  assert.ok(f.poses.find((p) => p.id === "other").hover && f.poses.find((p) => p.id === "other").selected);
});

test("tags live for their step, fade in and out, anchored above their entity", () => {
  const tl = compile(twoHousings((s) => { s.move("x", "b"); s.tag("x", "hash(fox) % 2 = 1"); s.step("x"); s.step("next"); }));
  const st = tl.steps[1];
  const f = tl.sample(st.t0 + st.dur * 0.5);
  assert.equal(f.tags.length, 1);
  const x = f.poses.find((p) => p.id === "x");
  assert.ok(near(f.tags[0].at[0], x.x) && f.tags[0].at[2] > x.z + x.h);
  assert.ok(tl.sample(st.t0 + 0.01).tags[0].opacity < 0.2);
  assert.equal(tl.sample(tl.steps[2].t0 + 0.1).tags.length, 0);
});

test("focus covers both ends of this step's motion; s.focus overrides; world is stable", () => {
  const tl = compile(twoHousings((s) => { s.move("x", "b"); s.step("x"); s.focus("a"); s.step("look at a"); }));
  const f = tl.sample(tl.steps[1].t0 + 0.1);
  const A = pose(tl, 0, "a"), B = pose(tl, 0, "b");
  assert.ok(f.focus.minX < A.x && f.focus.maxX > B.x - B.w / 2);
  const g = tl.sample(tl.steps[2].t0 + 0.1);
  assert.ok(near(g.focus.minX, A.x - A.w / 2) && near(g.focus.maxX, A.x + A.w / 2));
  assert.deepEqual(tl.sample(0).world, tl.sample(tl.duration).world);
});

test("reduced motion: transitions become 150 ms crossfades without arcs", () => {
  const tl = compile(twoHousings((s) => { s.move("x", "b", { via: "air" }); s.step("hop"); }));
  const st = tl.steps[1];
  const view = { reducedMotion: true };
  const S = samples(tl, 1, "x", 200, view);
  assert.ok(Math.max(...S.map(({ p }) => p.z)) <= zIn + 0.01);
  const done = pose(tl, st.t0 + 0.16, "x", view);
  assert.ok(done.x > 0 && near(done.opacity, 1));
});

test("tags on a housing, or on a tile resting in one, anchor above the housing's back edge (not over its header)", () => {
  const tl = compile(twoHousings((s) => { s.tag("a", "busy"); s.tag("y", "stays"); s.move("x", "b"); s.tag("x", "moves"); s.step("tags"); }));
  const st = tl.steps[1];
  const A = pose(tl, 0, "a");
  const f = tl.sample(st.t0 + 0.3);
  const byText = (txt) => f.tags.find((g) => g.text === txt);
  assert.ok(near(byText("busy").at[1], A.y - A.d / 2) && byText("busy").at[2] > A.h);
  assert.ok(near(byText("stays").at[1], A.y - A.d / 2));
  const x = f.poses.find((p) => p.id === "x");
  // out over the middle of the groove it is anchored at the tile itself
  const B = pose(tl, 0, "b"), gx = (A.x + A.w / 2 + B.x - B.w / 2) / 2;
  const S = samples(tl, 1, "x", 400);
  const k = S.reduce((bi, q, i) => (Math.abs(q.p.x - gx) < Math.abs(S[bi].p.x - gx) ? i : bi), 0);
  const mid = tl.sample(S[k].t);
  const xm = mid.poses.find((p) => p.id === "x"), tm = mid.tags.find((g) => g.text === "moves");
  assert.ok(x && xm && tm);
  assert.ok(near(tm.at[1], xm.y, 0.01) && near(tm.at[0], xm.x, 0.01));
  // and the anchor never jumps while it blends
  let prev = null;
  for (const { t } of S) { const g = tl.sample(t).tags.find((q) => q.text === "moves"); if (g && prev) assert.ok(Math.hypot(g.at[0] - prev[0], g.at[1] - prev[1], g.at[2] - prev[2]) < 12); prev = g?.at ?? prev; }
});

test("the world contains every pointer flag, arc peak and step focus", () => {
  const tl = compile(fig((s) => {
    s.array("a", [3, 1, 2]);
    s.pointer("i", { at: "a[0]" });
    s.step("x");
    s.swap("a[0]", "a[2]"); s.step("swap");
  }));
  const w = tl.world;
  for (const t of [0, tl.duration / 2, tl.duration]) {
    const f = tl.sample(t);
    for (const p of f.poses) if (p.kind === "pointer" || p.kind === "tile") {
      assert.ok(p.y + p.d / 2 <= w.maxY + 1e-6 && p.z + p.h <= w.maxZ + 1e-6, `${p.id} outside the world`);
    }
    assert.ok(f.focus.minX >= w.minX - 1e-6 && f.focus.maxX <= w.maxX + 1e-6 && f.focus.maxY <= w.maxY + 1e-6);
  }
});

test("a tag over the first housing of a titled zone sits above the zone's edge, not on its title", () => {
  const tl = compile(fig((s) => {
    s.row("r", { gap: 120 });
    s.column("map", { in: "r", title: "map" }); s.housing("a", { in: "map", tray: { cols: 2, of: "record" } });
    s.column("red", { in: "r", title: "reduce" }); s.housing("b", { in: "red", tray: { cols: 2, of: "record" } });
    s.trace("ab", "a", "b");
    s.tile("x", { in: "a", of: "record", text: "fox · 1" });
    s.step("start");
    s.tag("x", "hash(fox) % 2 = 0"); s.tag("b", "busy");
    s.step("tags");
  }));
  const f = tl.sample(tl.steps[1].t0 + 0.3);
  const zA = f.poses.find((p) => p.id === "map"), zB = f.poses.find((p) => p.id === "red");
  assert.ok(near(f.tags.find((g) => g.text === "busy").at[1], zB.y - zB.d / 2 - 2));
  assert.ok(near(f.tags.find((g) => g.text.startsWith("hash")).at[1], zA.y - zA.d / 2 - 2));
});
