// Layout: groups, housings, containers, zones, heights.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIZE } from "../tokens.mjs";
import { compile } from "./index.mjs";
import { measureHousing, gridPositions, traySpec } from "./layout.mjs";

const fig = (build) => ({ build });
const layout0 = (tl) => tl._.layoutOf.get(tl.snapshot(0).entities);
const box = (tl, id) => layout0(tl).boxes.get(id);
const overlap = (a, b) => Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2) > 0.01 && Math.min(a.y + a.d / 2, b.y + b.d / 2) - Math.max(a.y - a.d / 2, b.y - b.d / 2) > 0.01;

test("row places members left to right with the gap, centred on the cross axis", () => {
  const tl = compile(fig((s) => {
    s.row("r", { gap: 30 });
    s.housing("a", { in: "r" }); s.housing("b", { in: "r", d: 140 }); s.housing("c", { in: "r" });
    s.step("x");
  }));
  const [a, b, c] = ["a", "b", "c"].map((id) => box(tl, id));
  assert.ok(a.x < b.x && b.x < c.x);
  assert.equal(Math.round(b.x - b.w / 2 - (a.x + a.w / 2)), 30);
  assert.equal(Math.round(c.x - c.w / 2 - (b.x + b.w / 2)), 30);
  assert.equal(a.y, b.y);
  assert.equal(b.d, 140);
});

test("column stacks top to bottom; align start/end", () => {
  const tl = compile(fig((s) => {
    s.column("c", { gap: 10, align: "start" });
    s.housing("a", { in: "c", w: 200 }); s.housing("b", { in: "c" });
    s.column("e", { gap: 10, align: "end", in: undefined });
    s.housing("x", { in: "e", w: 200 }); s.housing("y", { in: "e" });
    s.step("x");
  }));
  const a = box(tl, "a"), b = box(tl, "b"), x = box(tl, "x"), y = box(tl, "y");
  assert.ok(b.y > a.y);
  assert.equal(Math.round(b.y - b.d / 2 - (a.y + a.d / 2)), 10);
  assert.equal(Math.round(a.x - a.w / 2), Math.round(b.x - b.w / 2));     // start: left edges line up
  assert.equal(Math.round(x.x + x.w / 2), Math.round(y.x + y.w / 2));     // end: right edges line up
});

test("grid, ring and free layouts never overlap their members", () => {
  const tl = compile(fig((s) => {
    s.grid("g", { cols: 3, gap: 12 });
    for (let i = 0; i < 7; i++) s.housing(`g${i}`, { in: "g" });
    s.ring("ring", {});
    for (let i = 0; i < 5; i++) s.housing(`r${i}`, { in: "ring", variant: "client" });
    s.free("f", {});
    s.housing("f0", { in: "f", at: [0, 0] }); s.housing("f1", { in: "f", at: [300, 40] });
    s.step("x");
  }));
  const L = layout0(tl);
  const hs = [...L.boxes.values()].filter((b) => b.kind === "housing");
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) assert.ok(!overlap(hs[i], hs[j]), `${hs[i].id} overlaps ${hs[j].id}`);
  assert.equal(tl.problems.filter((p) => p.kind === "overlap").length, 0);
  // grid: g3 is under g0, g1 right of g0
  assert.ok(Math.abs(box(tl, "g3").x - box(tl, "g0").x) < 0.01 && box(tl, "g3").y > box(tl, "g0").y);
  // ring: first member at the top (start -90)
  const r0 = box(tl, "r0"), others = [1, 2, 3, 4].map((i) => box(tl, `r${i}`));
  assert.ok(others.every((o) => o.y > r0.y));
  // free: relative positions preserved
  assert.equal(Math.round(box(tl, "f1").x - box(tl, "f0").x), 300);
  assert.equal(Math.round(box(tl, "f1").y - box(tl, "f0").y), 40);
});

test("housing measures to its tray plus header and inset, at least minW/minD", () => {
  const m = measureHousing({ kind: "housing", variant: "node", tray: { cols: 2, rows: 3, of: "record", order: "row" }, title: "map 0" }, new Map());
  const R = SIZE.record, H = SIZE.housing, W = SIZE.well;
  const gw = 2 * R.w + R.gap, gd = 3 * R.d + 2 * R.gap;
  assert.equal(m.w, Math.max(H.minW, gw + 2 * H.pad + 2 * W.inset));
  assert.equal(m.d, Math.max(H.minD, H.header + gd + 2 * H.pad + W.inset));
  assert.ok(m.tray.w >= gw && m.tray.d >= gd);
  assert.equal(m.tray.y, (H.header - W.inset) / 2);
  const empty = measureHousing({ kind: "housing", variant: "node", tray: null, title: "x" }, new Map());
  assert.equal(empty.w, H.minW); assert.equal(empty.d, H.minD);
  const store = measureHousing({ kind: "housing", variant: "store", tray: { cols: 1, rows: 3, of: "page", order: "row" }, title: "in" }, new Map());
  assert.equal(store.w, store.d); assert.ok(store.round && store.tray.round);
  const chip = measureHousing({ kind: "housing", variant: "chip", tray: { cols: 6, rows: 1, of: "bit", order: "row" }, title: "tlb" }, new Map());
  assert.equal(chip.w, chip.d);
});

test("tile heights: in a housing on the well floor, on a plate, loose on the floor", () => {
  const tl = compile(fig((s) => {
    s.row("r");
    s.housing("h", { in: "r", tray: { cols: 2 } });
    s.housing("q", { in: "r", variant: "queue", tray: { cols: 3 } });
    s.container("c", { in: "r", cols: 3 });
    s.tile("a", { in: "h", text: "1" }); s.tile("b", { in: "c", text: "2" }); s.tile("l", { in: "r", text: "3" }); s.tile("qq", { in: "q", text: "4" });
    s.step("x");
  }));
  const f = tl.sample(0);
  const z = (id) => f.poses.find((p) => p.id === id).z;
  assert.equal(z("a"), SIZE.variant.node.h - SIZE.well.depth);
  assert.equal(z("qq"), SIZE.variant.queue.h - SIZE.well.depth);
  assert.equal(z("b"), SIZE.plate.h);
  assert.equal(z("l"), 0);
});

test("trays keep one size for the whole run (capacity = most tiles ever held) and fill row-major", () => {
  const tl = compile(fig((s) => {
    s.row("r");
    s.housing("h", { in: "r", tray: { cols: 2 } });
    s.step("empty");
    for (let i = 0; i < 5; i++) s.tile(`t${i}`, { in: "h", text: String(i) });
    s.step("five");
  }));
  const b0 = tl._.layoutOf.get(tl.snapshot(0).entities).boxes.get("h"), b1 = tl._.layoutOf.get(tl.snapshot(2).entities).boxes.get("h");
  assert.equal(b0.d, b1.d);
  const f = tl.sample(tl.duration);
  const p = (i) => f.poses.find((q) => q.id === `t${i}`);
  assert.ok(p(1).x > p(0).x && Math.abs(p(1).y - p(0).y) < 0.01);
  assert.ok(p(2).y > p(0).y && Math.abs(p(2).x - p(0).x) < 0.01);
});

test("overflow compresses spacing inside the fixed extent and is reported", () => {
  const spec = traySpec({ kind: "container", of: "tile", axis: "x", cols: 4, rows: 1, capacity: 4 }, new Map());
  const pos = gridPositions(spec, new Array(6).fill(SIZE.tile));
  assert.ok(pos[0][0] >= SIZE.tile.w / 2 - 0.01 && pos[5][0] <= spec.gw - SIZE.tile.w / 2 + 0.01);
  for (let i = 1; i < 6; i++) assert.ok(pos[i][0] > pos[i - 1][0]);
  const tl = compile(fig((s) => {
    s.container("c", { capacity: 2 });
    for (let i = 0; i < 3; i++) s.tile(`t${i}`, { in: "c" });
    s.step("x");
  }));
  assert.ok(tl.problems.some((p) => p.kind === "overflow"));
});

test("titled groups become zones padded by SIZE.zone.pad and follow their members", () => {
  const tl = compile(fig((s) => {
    s.row("r");
    s.column("z", { in: "r", title: "Map" });
    s.housing("a", { in: "z" });
    s.step("one");
    s.housing("b", { in: "z" });
    s.step("two");
  }));
  const z0 = tl.sample(0).poses.find((p) => p.kind === "zone");
  const a = box(tl, "a");
  assert.equal(z0.title, "Map");
  assert.equal(Math.round(z0.w), Math.round(a.w + 2 * SIZE.zone.pad));
  const z1 = tl.sample(tl.duration).poses.find((p) => p.kind === "zone");
  assert.ok(z1.d > z0.d + 50);
  // mid-step the zone is between the two sizes (it glides, it does not jump)
  const st = tl.steps[1];
  const zm = tl.sample(st.t0 + st.dur * 0.5).poses.find((p) => p.kind === "zone");
  assert.ok(zm.d > z0.d && zm.d < z1.d);
});

test("arrays and bits: cells, indices and bitfield brackets", () => {
  const tl = compile(fig((s) => {
    const a = s.array("a", [5, 2, 9], { label: "a" });
    const b = s.bits("v", { width: 8, value: 0b10100001, fields: [{ name: "tag", from: 4, to: 7, key: "tag" }, { name: "off", from: 0, to: 3 }] });
    assert.deepEqual(a.cells, ["a[0]", "a[1]", "a[2]"]);
    assert.equal(b.cell(0), "v[0]"); assert.equal(b.cells[0], "v[7]");
    s.step("x");
  }));
  const f = tl.sample(0);
  const idx = f.poses.filter((p) => p.kind === "text" && p.variant === "index").map((p) => p.text);
  assert.deepEqual(idx, ["0", "1", "2"]);
  assert.ok(f.poses.some((p) => p.kind === "text" && p.variant === "label" && p.text === "a"));
  const bits = f.poses.filter((p) => p.kind === "bit");
  assert.equal(bits.length, 8);
  assert.equal(bits.find((p) => p.id === "v[0]").text, "1");
  assert.equal(bits.find((p) => p.id === "v[1]").tone, "ghost");
  const br = f.poses.filter((p) => p.kind === "bracket");
  assert.deepEqual(br.map((p) => p.label).sort(), ["off", "tag"]);
  const v7 = bits.find((p) => p.id === "v[7]"), v4 = bits.find((p) => p.id === "v[4]");
  const tag = br.find((p) => p.label === "tag");
  assert.ok(tag.points[0][0] < v7.x && tag.points[3][0] > v4.x);   // the bracket spans bits 7..4 (msb first)
});
