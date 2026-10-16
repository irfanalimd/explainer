// Routing: ports on facing edges, spreading, orthogonal routes with rounded corners, channel tracks,
// obstacle avoidance, buses, and the arc-length table.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE } from "../tokens.mjs";
import { compile } from "./index.mjs";
import { Path, roundCorners } from "./path.mjs";

const fig = (build) => ({ build });
const routes0 = (tl) => tl._.routesOf.get(tl._.layoutOf.get(tl.snapshot(0).entities));
const box = (tl, id) => tl._.layoutOf.get(tl.snapshot(0).entities).boxes.get(id);
const axisAligned = (raw) => raw.every((p, i) => i === 0 || Math.abs(p[0] - raw[i - 1][0]) < 1e-6 || Math.abs(p[1] - raw[i - 1][1]) < 1e-6);
const segHitsBox = (a, b, B, pad = 0) => {
  // sample the segment; any sample strictly inside the box is a hit
  for (let k = 0; k <= 40; k++) {
    const x = a[0] + (b[0] - a[0]) * (k / 40), y = a[1] + (b[1] - a[1]) * (k / 40);
    if (x > B.x - B.w / 2 + pad && x < B.x + B.w / 2 - pad && y > B.y - B.d / 2 + pad && y < B.y + B.d / 2 - pad) return true;
  }
  return false;
};

test("a trace leaves and enters on the facing edges, orthogonally", () => {
  const tl = compile(fig((s) => {
    s.row("r"); s.housing("a", { in: "r" }); s.column("c", { in: "r", gap: 60 }); s.housing("b", { in: "c" }); s.housing("b2", { in: "c" });
    s.trace("ab", "a", "b"); s.step("x");
  }));
  const r = routes0(tl).traces.get("ab"), A = box(tl, "a"), B = box(tl, "b");
  assert.equal(r.sa, "right"); assert.equal(r.sb, "left");
  assert.ok(Math.abs(r.raw[0][0] - (A.x + A.w / 2)) < 1e-6);
  assert.ok(Math.abs(r.raw[r.raw.length - 1][0] - (B.x - B.w / 2)) < 1e-6);
  assert.ok(axisAligned(r.raw));
  // corners are rounded: no two consecutive path segments turn by more than ~7 degrees
  const pts = r.path.points;
  for (let i = 2; i < pts.length; i++) {
    const a1 = Math.atan2(pts[i - 1][1] - pts[i - 2][1], pts[i - 1][0] - pts[i - 2][0]), a2 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    assert.ok(d < 0.13, `turn of ${(d * 180 / Math.PI).toFixed(1)} deg at point ${i}`);
  }
});

test("corner arcs use SIZE.trace.corner and keep the arc-length table exact", () => {
  const raw = [[0, 0], [100, 0], [100, 100]];
  const pts = roundCorners(raw, SIZE.trace.corner);
  const p = new Path(pts);
  // the arc starts corner u before the vertex and ends corner u after it
  assert.ok(pts.some((q) => Math.abs(q[0] - (100 - SIZE.trace.corner)) < 1e-6 && Math.abs(q[1]) < 1e-6));
  assert.ok(pts.some((q) => Math.abs(q[0] - 100) < 1e-6 && Math.abs(q[1] - SIZE.trace.corner) < 1e-6));
  const expected = 200 - 2 * SIZE.trace.corner + (Math.PI / 2) * SIZE.trace.corner;
  assert.ok(Math.abs(p.length - expected) < 0.05, `${p.length} vs ${expected}`);
  for (let i = 1; i < p.n; i++) assert.ok(p.cum[i] >= p.cum[i - 1]);
  const out = p.at(p.length / 2);
  assert.ok(Math.hypot(out[0] - 100, out[1] - 0) < SIZE.trace.corner + 1);
  assert.deepEqual(p.at(-5).slice(0, 2), [0, 0]);
  assert.deepEqual(p.at(1e9).slice(0, 2), [100, 100]);
  assert.ok(Math.abs(p.project(50, 3) - 50) < 1e-6);
});

test("ports spread along a shared edge, ordered by their far ends; gutter runs get their own tracks", () => {
  const tl = compile(fig((s) => {
    s.row("r", { gap: 120 });
    s.housing("src", { in: "r" });
    s.column("c", { in: "r", gap: 30 });
    for (let i = 0; i < 4; i++) { s.housing(`d${i}`, { in: "c" }); }
    for (let i = 0; i < 4; i++) s.trace(`t${i}`, "src", `d${i}`);
    s.step("x");
  }));
  const R = routes0(tl).traces;
  const ys = [0, 1, 2, 3].map((i) => R.get(`t${i}`).raw[0][1]);
  for (let i = 1; i < 4; i++) assert.ok(ys[i] > ys[i - 1] + 1, `port ${i} not below port ${i - 1}`);
  assert.ok(ys[1] - ys[0] >= SIZE.trace.w + SIZE.trace.portGap - 0.01);
  // middle runs: any two that share a vertical span sit at different x
  const runs = [0, 1, 2, 3].map((i) => R.get(`t${i}`).raw).filter((r) => r.length === 4).map((r) => ({ x: r[1][0], lo: Math.min(r[1][1], r[2][1]), hi: Math.max(r[1][1], r[2][1]) }));
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const shared = Math.min(runs[i].hi, runs[j].hi) - Math.max(runs[i].lo, runs[j].lo) > 0;
    if (shared) assert.ok(Math.abs(runs[i].x - runs[j].x) > 1, "overlapping runs on one track");
  }
  // and no two routes cross each other
  const segs = (raw) => raw.slice(1).map((p, k) => [raw[k], p]);
  const cross = (a, b, c, d) => {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  };
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++)
    for (const [a, b] of segs(R.get(`t${i}`).raw)) for (const [c, d] of segs(R.get(`t${j}`).raw)) assert.ok(!cross(a, b, c, d), `t${i} crosses t${j}`);
});

test("a trace detours around a housing that stands in its way", () => {
  const tl = compile(fig((s) => {
    s.row("r", { gap: 70 });
    s.housing("a", { in: "r" }); s.housing("mid", { in: "r", d: 160 }); s.housing("c", { in: "r" });
    s.trace("ac", "a", "c");
    s.step("x");
  }));
  const r = routes0(tl).traces.get("ac");
  const M = box(tl, "mid");
  const raw = r.raw;
  for (let i = 1; i < raw.length; i++) assert.ok(!segHitsBox(raw[i - 1], raw[i], M), "route passes through the middle housing");
  assert.ok(axisAligned(raw));
});

test("a bus is one trunk in its spacer with branches joining it", () => {
  const tl = compile(fig((s) => {
    s.row("r");
    s.column("L", { in: "r" }); for (let i = 0; i < 3; i++) s.housing(`m${i}`, { in: "L" });
    s.spacer("gap", { in: "r" });
    s.column("Rr", { in: "r" }); for (let i = 0; i < 2; i++) s.housing(`r${i}`, { in: "Rr" });
    s.bus("bus", { from: ["m0", "m1", "m2"], to: ["r0", "r1"], via: "gap" });
    s.step("x");
  }));
  const b = routes0(tl).buses.get("bus");
  const gap = box(tl, "gap");
  assert.ok(b.vertical);
  assert.ok(Math.abs(b.coord - gap.x) < 1e-6);
  assert.equal(b.branches.length, 5);
  for (const br of b.branches) {
    const [jx] = br.junction;
    assert.ok(Math.abs(jx - gap.x) < 1e-6);
    assert.ok(br.kind === "from" ? Math.abs(br.port[0] - (box(tl, br.of).x + box(tl, br.of).w / 2)) < 1e-6 : Math.abs(br.port[0] - (box(tl, br.of).x - box(tl, br.of).w / 2)) < 1e-6);
  }
  // the pose carries trunk, branches and tees
  const pose = tl.sample(0).poses.find((p) => p.kind === "bus");
  assert.ok(pose.points.length >= 2 && pose.branches.length === 5 && Array.isArray(pose.tees));
});

test("routes are recomputed when the layout changes, and the trace morphs instead of jumping", () => {
  const tl = compile(fig((s) => {
    s.row("r"); s.housing("a", { in: "r" }); s.column("c", { in: "r" }); s.housing("b", { in: "c" });
    s.trace("ab", "a", "b"); s.step("one");
    s.housing("b0", { in: "c", index: 0 }); s.step("two: b moves down");
  }));
  const pts = (t) => tl.sample(t).poses.find((p) => p.id === "ab").points;
  const end0 = pts(0).at(-1), end1 = pts(tl.duration).at(-1);
  assert.ok(Math.abs(end1[1] - end0[1]) > 20);
  const mid = pts(tl.steps[1].t0 + tl.steps[1].dur * 0.5).at(-1);
  assert.ok(mid[1] > Math.min(end0[1], end1[1]) - 0.01 && mid[1] < Math.max(end0[1], end1[1]) + 0.01);
});

test("top-to-bottom flow: bottom->top traces fan out through a horizontal gutter; a bus trunk runs across its spacer", () => {
  const tl = compile(fig((s) => {
    s.column("job", { gap: 46 });
    s.housing("src", { in: "job", variant: "store", tray: { cols: 1, of: "page" } });
    s.row("map", { in: "job", title: "map", align: "start" }); for (let i = 0; i < 3; i++) s.housing(`m${i}`, { in: "map", tray: { cols: 1, of: "record" } });
    s.spacer("gap", { in: "job" });
    s.row("red", { in: "job", title: "reduce", align: "start" }); for (let i = 0; i < 2; i++) s.housing(`r${i}`, { in: "red" });
    s.housing("out", { in: "job", variant: "store" });
    for (let i = 0; i < 3; i++) s.trace(`t${i}`, "src", `m${i}`, { fromSide: "bottom", toSide: "top" });
    for (let i = 0; i < 2; i++) s.trace(`o${i}`, `r${i}`, "out", { fromSide: "bottom", toSide: "top" });
    s.bus("bus", { from: ["m0", "m1", "m2"], to: ["r0", "r1"], via: "gap" });
    s.step("x");
  }));
  assert.deepEqual(tl.problems, []);
  const R = routes0(tl);
  const src = box(tl, "src");
  for (let i = 0; i < 3; i++) {
    const r = R.traces.get(`t${i}`), m = box(tl, `m${i}`);
    assert.ok(axisAligned(r.raw));
    assert.ok(Math.abs(r.raw[0][1] - (src.y + Math.sqrt(Math.max(0, (src.w / 2) ** 2 - (r.raw[0][0] - src.x) ** 2)))) < 1e-6, "leaves on the disc's lower rim");
    assert.ok(Math.abs(r.raw.at(-1)[1] - (m.y - m.d / 2)) < 1e-6, "enters the mapper's top edge");
  }
  // horizontal runs that share the gutter sit on different tracks
  const runs = [0, 1, 2].map((i) => R.traces.get(`t${i}`).raw).filter((r) => r.length === 4).map((r) => ({ y: r[1][1], lo: Math.min(r[1][0], r[2][0]), hi: Math.max(r[1][0], r[2][0]) }));
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) if (Math.min(runs[i].hi, runs[j].hi) > Math.max(runs[i].lo, runs[j].lo)) assert.ok(Math.abs(runs[i].y - runs[j].y) > 1);
  const b = R.buses.get("bus"), gap = box(tl, "gap");
  assert.ok(!b.vertical && Math.abs(b.coord - gap.y) < 1e-6);
  for (const br of b.branches) {
    const h = box(tl, br.of);
    assert.equal(br.side, br.kind === "from" ? "bottom" : "top");
    assert.ok(Math.abs(br.port[1] - (br.kind === "from" ? h.y + h.d / 2 : h.y - h.d / 2)) < 1e-6);
    assert.ok(Math.abs(br.junction[1] - gap.y) < 1e-6);
  }
  // and a record really travels it: down from m0, across the trunk, down into r1
  const tl2 = compile(fig((s) => {
    s.column("job", { gap: 46 });
    s.row("map", { in: "job", align: "start" }); for (let i = 0; i < 2; i++) s.housing(`m${i}`, { in: "map", tray: { cols: 1, of: "record" } });
    s.spacer("gap", { in: "job" });
    s.row("red", { in: "job", align: "start" }); for (let i = 0; i < 2; i++) s.housing(`r${i}`, { in: "red", tray: { cols: 1, of: "record" } });
    s.bus("bus", { from: ["m0", "m1"], to: ["r0", "r1"], via: "gap" });
    s.tile("x", { in: "m0", of: "record", text: "fox · 1" });
    s.step("x");
    s.move("x", "r1", { via: "bus" }); s.step("shuffle");
  }));
  const st = tl2.steps[1], gy = box(tl2, "gap").y;
  const mid = tl2.sample(st.t0 + st.dur * 0.5).poses.find((p) => p.id === "x");
  const bus = tl2.sample(st.t0 + st.dur * 0.5).poses.find((p) => p.id === "bus");
  assert.ok(Math.abs(mid.y - gy) < 40, `mid-flight near the trunk (y ${mid.y.toFixed(0)} vs ${gy.toFixed(0)})`);
  assert.ok(bus.pulses.length + bus.branches.reduce((a, q) => a + q.pulses.length, 0) > 0);
  assert.ok(Math.abs(tl2.sample(st.t1).poses.find((p) => p.id === "x").x - box(tl2, "r1").x) < 1);
});

test("a self-loop leaves its housing's right edge, wraps the corner outside it and comes back in through the front", () => {
  const tl = compile(fig((s) => {
    s.row("r"); s.housing("a", { in: "r", tray: { cols: 1 } }); s.housing("b", { in: "r" });
    s.trace("aa", "a", "a", { arrow: true }); s.trace("ab", "a", "b");
    s.step("x");
    s.send("m", "a", "a", { via: "aa", key: 1 });
    s.step("round the loop");
  }));
  assert.deepEqual(tl.problems.filter((p) => p.kind !== "overlap"), []);
  const r = routes0(tl).traces.get("aa"), A = box(tl, "a");
  assert.equal(r.sa, "right"); assert.equal(r.sb, "bottom");
  assert.ok(axisAligned(r.raw));
  const [p0, pN] = [r.raw[0], r.raw[r.raw.length - 1]];
  assert.ok(Math.abs(p0[0] - (A.x + A.w / 2)) < 1e-6, "starts on the right edge");
  assert.ok(Math.abs(pN[1] - (A.y + A.d / 2)) < 1e-6, "ends on the front edge");
  assert.ok(p0[1] > A.y + (A.tray?.y ?? 0) && pN[0] > A.x, "both ends sit toward the corner the loop wraps");
  for (let i = 1; i < r.raw.length; i++) assert.ok(!segHitsBox(r.raw[i - 1], r.raw[i], A, 0.5), `segment ${i} cuts through the housing`);
  // a send along it flies the loop and lands back where it started, with finite poses all the way
  const s1 = tl.steps[1];
  for (let k = 0; k <= 10; k++) {
    const f = tl.sample(s1.t0 + (s1.t1 - s1.t0) * (k / 10));
    for (const p of f.poses) for (const key of ["x", "y", "z", "lit"]) if (p[key] != null) assert.ok(Number.isFinite(p[key]), `${p.id}.${key} at ${k}`);
  }
  assert.equal(tl.sample(s1.t0 + 0.01).poses.find((p) => p.id === "aa").arrow, "end");
});

test("facing ports alone on their edges line up into one straight run; a narrow gap never curls", () => {
  const tl = compile(fig((s) => {
    s.free("f");
    s.housing("a", { in: "f", at: [0, 0], tray: { cols: 1 } });
    s.housing("b", { in: "f", at: [150, 30], tray: { cols: 1 } });    // a little lower, close beside it
    s.housing("c", { in: "f", at: [300, 300], tray: { cols: 1 } });   // far off its row: no shared height
    s.trace("ab", "a", "b"); s.trace("bc", "b", "c", { fromSide: "right", toSide: "left" });
    s.step("x");
  }));
  const R0 = routes0(tl), ab = R0.traces.get("ab"), bc = R0.traces.get("bc");
  assert.equal(ab.raw.length, 2, `a straight run, got ${JSON.stringify(ab.raw)}`);
  assert.ok(Math.abs(ab.raw[0][1] - ab.raw[1][1]) < 1e-6);
  const A = box(tl, "a"), B = box(tl, "b");
  for (const [P, X] of [[ab.raw[0], A], [ab.raw[1], B]]) assert.ok(P[1] > X.y - X.d / 2 + SIZE.housing.header && P[1] < X.y + X.d / 2, "the port stays on the edge, below the header");
  // no run of a route ever turns back on itself (that is the curl)
  for (const r of [ab, bc]) for (let i = 2; i < r.raw.length; i++) {
    const u = [r.raw[i - 1][0] - r.raw[i - 2][0], r.raw[i - 1][1] - r.raw[i - 2][1]], v = [r.raw[i][0] - r.raw[i - 1][0], r.raw[i][1] - r.raw[i - 1][1]];
    assert.ok(u[0] * v[0] + u[1] * v[1] >= -1e-6, `${r.id} doubles back at point ${i}: ${JSON.stringify(r.raw)}`);
  }
});

test("arrow is a trace option and a settable prop", () => {
  const tl = compile(fig((s) => {
    s.row("r"); s.housing("a", { in: "r" }); s.housing("b", { in: "r" });
    s.trace("ab", "a", "b");
    s.step("plain");
    s.set("ab", { arrow: "both" });
    s.step("both ways");
    s.set("ab", { arrow: false });
    s.step("none");
  }));
  assert.deepEqual(tl.problems.filter((p) => p.kind === "bad-prop"), []);
  const at = (i) => tl.sample(tl.steps[i].t1 - 0.01).poses.find((p) => p.id === "ab").arrow;
  assert.equal(at(0), null); assert.equal(at(1), "both"); assert.equal(at(2), null);
});
