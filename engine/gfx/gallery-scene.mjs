// The gallery's hand-built beauty scene: semantic poses (CONTRACTS.md 4.6) as pure functions of time, so the
// pose -> look boundary (skin) is exercised exactly as the scene engine will. DOM-free.
//   galleryScene(t, { layout: "wide" | "tall" }) -> { poses, bounds, spots }
import { SIZE, MOTION } from "../tokens.mjs";
import { bezier } from "./skin.mjs";

const ease = bezier(MOTION.ease), easeIO = bezier(MOTION.easeInOut);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const fract = (x) => x - Math.floor(x);

/** Orthogonal polyline with circular corners (what the scene's router produces). */
export function rounded(pts, r = SIZE.trace.corner, steps = 9) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]), d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const u1 = [(a[0] - b[0]) / d1, (a[1] - b[1]) / d1], u2 = [(c[0] - b[0]) / d2, (c[1] - b[1]) / d2];
    const p1 = [b[0] + u1[0] * rr, b[1] + u1[1] * rr], p2 = [b[0] + u2[0] * rr, b[1] + u2[1] * rr];
    const cx = b[0] + (u1[0] + u2[0]) * rr, cy = b[1] + (u1[1] + u2[1]) * rr;
    let a1 = Math.atan2(p1[1] - cy, p1[0] - cx), a2 = Math.atan2(p2[1] - cy, p2[0] - cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= steps; k++) { const t = a1 + (da * k) / steps; out.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function pathLength(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
export function pointAt(pts, s) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc + L >= s || i === pts.length - 1) {
      const f = L > 0 ? clamp((s - acc) / L, 0, 1) : 0;
      return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI };
    }
    acc += L;
  }
  return { x: pts[0][0], y: pts[0][1], yaw: 0 };
}

const REC = SIZE.record, TILE = SIZE.tile, BIT = SIZE.bit, PAGE = SIZE.page;

// a node housing with a cols x rows tray of records; returns the housing pose and slot positions
function nodeHousing(id, x, y, { title, sub, led, meter, cols = 3, rows = 2, of = "record", variant = "node" }) {
  const S = SIZE[of], gap = S.gap, inset = SIZE.well.inset, header = SIZE.housing.header;
  const tw = cols * S.w + (cols - 1) * gap + 10, td = rows * S.d + (rows - 1) * gap + 10;
  const w = tw + 2 * inset, d = header + td + inset;
  const tray = { x: 0, y: -d / 2 + header + td / 2, w: tw, d: td };
  const v = SIZE.variant[variant];
  const zIn = v.h - SIZE.well.depth;
  const slot = (c, r) => [x - tw / 2 + 5 + S.w / 2 + c * (S.w + gap), y + tray.y - td / 2 + 5 + S.d / 2 + r * (S.d + gap), zIn];
  return { pose: { id, kind: "housing", variant, x, y, w, d, h: v.h, title, sub, led, meter, tray }, slot, w, d };
}

export function galleryScene(t, { layout = "wide" } = {}) {
  const tall = layout === "tall";
  const poses = [];
  const add = (p) => (poses.push(p), p);
  const spots = {};

  // ---- placement: wide is a 3 x 3 grid (pipeline, workbench, variants); tall is one column ---------------
  const L = tall ? {
    store: [-20, -728], nodes: [[-20, -566], [-20, -436], [-20, -306]], chip: [-20, -168],
    plate: [-12, 186], bits: [-117, 286], lanes: { x0: -112, len: 226, y0: -34 },
  } : {
    store: [-372, -372], nodes: [[-120, -372], [120, -372], [360, -372]], chip: [330, -128],
    plate: [76, -128], bits: [-27, 120], lanes: { x0: -424, len: 270, y0: -190 },
    client: [-342, 120], queue: [330, 120],
  };

  // ---- input store ---------------------------------------------------------------------------------------
  const storeD = 132;
  add({ id: "input", kind: "housing", variant: "store", x: L.store[0], y: L.store[1], w: storeD, d: storeD, title: "input", sub: "4 splits", led: "ok" });
  const sz = SIZE.variant.store.h - SIZE.well.depth;
  [[-21, -12], [21, -12], [-21, 20], [21, 20]].forEach(([dx, dy], i) => add({
    id: "page" + i, kind: "page", x: L.store[0] + dx, y: L.store[1] + dy + 4 - 4, z: sz, w: PAGE.w * 0.92, d: PAGE.d * 0.92, h: PAGE.h,
    text: "s" + i, tone: "neutral",
  }));

  // ---- three mapper nodes with 2 x 2 trays of keyed records --------------------------------------------
  const words = [
    [["the", 0], ["quick", 1], ["brown", 2], ["fox", 3]],
    [["jumps", 5], ["over", 6], ["the", 0], ["lazy", 7]],
    [["dog", 4], ["the", 0], ["fox", 3]],
  ];
  const nodes = L.nodes.map(([x, y], i) => nodeHousing("w" + i, x, y, {
    title: "map w" + i, sub: ["task 3/5", "task 4/5", "lost"][i], led: ["ok", "busy", "fail"][i], meter: i === 0 ? 0.62 : undefined, cols: 2, rows: 2,
  }));
  nodes.forEach((n, i) => { n.pose.dim = i === 2 ? 0.75 : 0; add(n.pose); });
  // value roll in w0: fox · n -> fox · n+1 every 2.4 s
  const rollPhase = fract((t - 1.34) / 2.4);
  const rollU = clamp((rollPhase - 0.35) / (MOTION.roll * 1.6 / 2.4), 0, 1);
  const rollCount = ((Math.floor((t - 1.34) / 2.4) % 4) + 4) % 4;
  words.forEach((ws, i) => ws.forEach(([word, key], k) => {
    const [x, y, z] = nodes[i].slot(k % 2, Math.floor(k / 2));
    const p = { id: `r${i}_${k}`, kind: "record", x, y, z, w: REC.w, d: REC.d, h: REC.h, text: word, sub: "1", key, tone: "key" };
    if (i === 0 && k === 3) {
      const a = 1 + (rollCount % 4), b = 1 + ((rollCount + 1) % 4);
      p.sub = String(rollU > 0 ? b : a); p.textOut = rollU > 0 && rollU < 1 ? String(a) : null; p.roll = rollU;
      p.flash = rollU > 0 && rollU < 1 ? Math.sin(rollU * Math.PI) * 0.35 : 0;
      spots.roll = [x, y, z];
    }
    if (i === 1 && k === 1) { p.lit = 1; spots.lit = [x, y, z]; }
    if (i === 2) p.dim = 0.8;
    add(p);
  }));
  const zd = tall ? 44 : 70;
  add({ id: "part", kind: "zone", x: L.nodes[2][0], y: L.nodes[2][1] - (tall ? 8 : 4), w: nodes[2].w + 52, d: nodes[2].d + zd, title: "partition b", dashed: true, tone: "fail" });

  // ---- traces from the store to each mapper (one carries a packet) ----------------------------------------
  const sx = L.store[0], sy = L.store[1], R = storeD / 2;
  const nw = nodes[0].w, nd = nodes[0].d;
  const routes = !tall ? [
    rounded([[sx + R - 4, sy + 4], [L.nodes[0][0] - nw / 2 + 4, sy + 4]]),
    rounded([[sx + 34, sy - R + 12], [sx + 34, sy - R - 26], [L.nodes[1][0] - 20, sy - R - 26], [L.nodes[1][0] - 20, sy - nd / 2 + 4]]),
    rounded([[sx + 14, sy - R + 4], [sx + 14, sy - R - 42], [L.nodes[2][0] - 20, sy - R - 42], [L.nodes[2][0] - 20, sy - nd / 2 + 4]]),
  ] : [
    rounded([[sx, sy + R - 4], [sx, L.nodes[0][1] - nd / 2 + 4]]),
    rounded([[sx - 26, sy + R - 9], [sx - 26, sy + R + 14], [sx - nw / 2 - 22, sy + R + 14], [sx - nw / 2 - 22, L.nodes[1][1]], [sx - nw / 2 + 4, L.nodes[1][1]]]),
    rounded([[sx - 42, sy + R - 17], [sx - 42, sy + R + 2], [sx - nw / 2 - 38, sy + R + 2], [sx - nw / 2 - 38, L.nodes[2][1]], [sx - nw / 2 + 4, L.nodes[2][1]]]),
  ];
  // the packet lifts out of the store, glides along trace 1 trailing a pulse, and sinks into w1
  const P1 = routes[1], len1 = pathLength(P1);
  const u = fract((t - 0.96) / 3.2);
  const travel = easeIO(clamp((u - 0.08) / 0.78, 0, 1));
  const head = travel * len1;
  const vis = clamp(u / 0.08, 0, 1) * (1 - clamp((u - 0.9) / 0.08, 0, 1));
  routes.forEach((pts, i) => add({
    id: "tr" + i, kind: "trace", points: pts,
    pulses: i === 1 && vis > 0.02 ? [{ s0: Math.max(0, head - 62), s1: head, key: 1, intensity: 1.9 * vis }] : [],
  }));
  if (vis > 0.02) {
    const pp = pointAt(P1, head);
    add({ id: "pk", kind: "packet", x: pp.x, y: pp.y, z: SIZE.packet.lift * (0.4 + 0.6 * vis), yaw: pp.yaw, key: 1, opacity: vis });
    spots.packet = [pp.x, pp.y, SIZE.packet.lift];
  }

  // ---- bus: every mapper's port merges into one trunk that feeds the reduce chip ------------------------
  const chip = nodeHousing("reduce", L.chip[0], L.chip[1], { title: "reduce", sub: "r0", led: "busy", cols: 2, rows: 2, variant: "chip" });
  add(chip.pose);
  [["the", 0, "4"], ["fox", 3, "3"], ["dog", 4, "2"], ["brown", 2, "2"]].forEach(([wd, key, n], k) => {
    const [x, y, z] = chip.slot(k % 2, Math.floor(k / 2));
    add({ id: "c" + k, kind: "record", x, y, z, w: REC.w, d: REC.d, h: REC.h, text: wd, sub: n, key, tone: "key", selected: k === 1 });
  });
  const busR = 16;
  let trunk, branches, ride;
  if (!tall) {
    const ty = L.nodes[0][1] + nd / 2 + 48, bx = (i) => L.nodes[i][0] - 30, port = L.nodes[0][1] + nd / 2 - 4;
    trunk = rounded([[bx(0), ty], [bx(2), ty], [bx(2), L.chip[1] - chip.d / 2 + 4]], busR);
    branches = [0, 1].map((i) => rounded([[bx(i), port], [bx(i), ty], [bx(i) + 44, ty]], busR)).concat([[[bx(2), port], [bx(2), ty]]]);
    ride = { join: ty - busR - port + Math.PI / 2 * busR, trunkAt: busR };
  } else {
    const tx = L.nodes[0][0] + nw / 2 + 52, port = L.nodes[0][0] + nw / 2 - 4;
    trunk = rounded([[tx, L.nodes[0][1]], [tx, L.chip[1]], [L.chip[0] + chip.w / 2 - 4, L.chip[1]]], busR);
    branches = L.nodes.map(([, y]) => rounded([[port, y], [tx, y], [tx, y + 44]], busR));
    ride = { join: tx - busR - port + Math.PI / 2 * busR, trunkAt: busR };
  }
  const bu = fract((t + 1.3) / 2.6), bHead = easeIO(clamp(bu / 0.85, 0, 1));
  const bInt = 1.5 * (1 - clamp((bu - 0.85) / 0.1, 0, 1)) * clamp(bu / 0.05, 0, 1);
  const rideLen = ride.join + pathLength(trunk) - ride.trunkAt;
  const sR = bHead * rideLen, trail = 58;
  const onTrunk = (a) => a - ride.join + ride.trunkAt;
  add({ id: "bus.trunk", kind: "bus", points: trunk, pulses: sR > ride.join - 2 ? [{ s0: Math.max(0, onTrunk(sR - trail)), s1: onTrunk(sR), key: 3, intensity: bInt }] : [] });
  branches.forEach((pts, i) => add({ id: "bus" + i, kind: "bus", points: pts,
    pulses: i === 0 && sR - trail < ride.join + 4 ? [{ s0: Math.max(0, sR - trail), s1: Math.min(sR, pathLength(pts)), key: 3, intensity: bInt }] : [] }));

  // ---- variants: a client and a queue trough (wide only) ------------------------------------------------
  if (L.client) {
    const cl = nodeHousing("client", L.client[0], L.client[1], { title: "client", sub: "192.0.2.14", led: "ok", cols: 4, rows: 1, of: "tile", variant: "client" });
    add(cl.pose);
    ["GET", "PUT", "ACK"].forEach((tx, k) => { const [x, y, z] = cl.slot(k, 0); add({ id: "cl" + k, kind: "tile", x, y, z, w: TILE.w, d: TILE.d, h: TILE.h, text: tx, tone: k === 2 ? "ok" : "neutral" }); });
    const qu = nodeHousing("queue", L.queue[0], L.queue[1], { title: "queue", sub: "depth 4", led: "warn", cols: 6, rows: 1, of: "tile", variant: "queue" });
    add(qu.pose);
    ["m7", "m6", "m5", "m4"].forEach((tx, k) => { const [x, y, z] = qu.slot(k, 0); add({ id: "q" + k, kind: "tile", x, y, z, w: TILE.w, d: TILE.d, h: TILE.h, text: tx, key: k === 0 ? 5 : null, tone: k === 0 ? "key" : "neutral" }); });
  }

  // ---- array of tiles on a plate, a pointer, and two tiles swapping in arcs ----------------------------
  const vals = [3, 1, 4, 1, 5, 9, 2];
  const n = vals.length, pitch = TILE.w + TILE.gap, pad = SIZE.plate.pad;
  const pw = n * TILE.w + (n - 1) * TILE.gap + 2 * pad, pd = TILE.d + 2 * pad;
  const [px, py] = L.plate;
  add({ id: "a", kind: "container", x: px, y: py, w: pw, d: pd });
  const slotX = (i) => px - pw / 2 + pad + TILE.w / 2 + i * pitch;
  add({ id: "a.label", kind: "text", x: px - pw / 2, y: py - pd / 2 - 9, text: "a  [7]  int32", align: "left", size: 6.5 });
  // swap slots 1 and 4: lift, arc over, settle; then hold
  const sw = fract((t - 1.2) / 4.2), su = clamp((sw - 0.15) / 0.45, 0, 1), se = easeIO(su);
  const swapped = ((Math.floor((t - 1.2) / 4.2) % 2) + 2) % 2 === 1;
  const A = swapped ? 4 : 1, B = swapped ? 1 : 4;
  for (let i = 0; i < n; i++) {
    let x = slotX(i), z = SIZE.plate.h, roll = 0, lit = 0;
    if (i === 1 || i === 4) {
      const from = i === 1 ? A : B, to = i === 1 ? B : A;
      const dist = Math.abs(slotX(to) - slotX(from));
      const hgt = clamp(MOTION.hop.k * dist, MOTION.hop.min, MOTION.hop.max) * (i === 1 ? 1 : 0.62);
      x = slotX(from) + (slotX(to) - slotX(from)) * se;
      z += 4 * hgt * se * (1 - se);
      roll = -Math.sign(slotX(to) - slotX(from)) * 7 * Math.sin(Math.PI * se) * (su > 0 && su < 1 ? 1 : 0);
      lit = su > 0 && su < 1 ? Math.sin(Math.PI * su) : 0;
      if (i === 1) spots.hop = [x, py, z];
    }
    add({ id: "a" + i, kind: "tile", x, y: py, z, w: TILE.w, d: TILE.d, h: TILE.h, text: String(vals[i]), bank: roll, lit: i === 1 ? lit : 0, tone: "neutral" });
    add({ id: "a.i" + i, kind: "text", x: slotX(i), y: py + pd / 2 + 5.5, text: String(i), size: 5.6, tone: "ghost" });
  }
  // pointer glides between tiles 5 and 6
  const pu = easeIO(clamp((fract(t / 3.6) - 0.5) / 0.3, 0, 1)) * (Math.floor(t / 3.6) % 2 ? -1 : 1) + (Math.floor(t / 3.6) % 2 ? 1 : 0);
  const pxp = slotX(5) + (slotX(6) - slotX(5)) * clamp(pu, 0, 1);
  add({ id: "ptr", kind: "pointer", x: pxp - 3, y: py + pd / 2 + 19, text: "i", key: 6, tone: "key" });

  // ---- a 16-bit virtual address with its fields bracketed --------------------------------------------
  const value = 0x7f3a, bits = 16, bp = BIT.w + BIT.gap;
  const [bx, by] = L.bits;
  const fields = [{ name: "vpn", from: 0, to: 9, key: 3 }, { name: "offset", from: 10, to: 15, key: 6 }];
  add({ id: "bits.label", kind: "text", x: bx - BIT.w / 2, y: by - BIT.d / 2 - 9, text: "vaddr  0x7f3a", align: "left", size: 6.5 });
  for (let i = 0; i < bits; i++) {
    const bit = (value >> (bits - 1 - i)) & 1;
    const f = fields.find((q) => i >= q.from && i <= q.to);
    add({ id: "b" + i, kind: "bit", x: bx + i * bp, y: by, z: 0, w: BIT.w, d: BIT.d, h: BIT.h, text: String(bit), key: bit ? f.key : null, tone: bit ? "key" : "ghost" });
  }
  for (const f of fields) {
    add({ id: "br." + f.name, kind: "bracket", points: [[bx + f.from * bp - BIT.w / 2 + 0.5, by + BIT.d / 2 + 5], [bx + f.to * bp + BIT.w / 2 - 0.5, by + BIT.d / 2 + 5]], text: f.name, key: f.key });
  }

  // ---- a space-time board: three lanes, marks, a message growing diagonally, the playhead ------------
  const { x0, len, y0 } = L.lanes, lg = SIZE.lane.gap;
  const names = ["n1", "n2", "n3"];
  names.forEach((nm, i) => add({ id: "lane" + i, kind: "lane", points: [[x0, y0 + i * lg], [x0 + len, y0 + i * lg]], title: nm, scale: 1, unit: "ms" }));
  add({ id: "lanes.zone", kind: "zone", x: x0 + len / 2 - 14, y: y0 + lg - 4, w: len + 92, d: 2 * lg + 58, title: "space-time" });
  // event times as fractions of the board, so both layouts keep everything on the rails
  const marks = [[0, 0.11, "ok"], [0, 0.44, "busy"], [1, 0.26, "ok"], [2, 0.74, "ok"], [1, 0.9, "warn"]];
  marks.forEach(([ln, f, tone], i) => add({ id: "m" + i, kind: "mark", x: x0 + f * len, y: y0 + ln * lg, tone }));
  const mu = fract((t - 1.4) / 4.0), grow = ease(clamp((mu - 0.1) / 0.6, 0, 1));
  const ms = [x0 + 0.44 * len, y0], me = [x0 + 0.96 * len, y0 + 2 * lg];
  if (mu > 0.1) {
    const mlen = Math.hypot(me[0] - ms[0], me[1] - ms[1]);
    add({ id: "msg", kind: "trace", points: [ms, me], grow, key: 0, pulses: grow < 1 ? [{ s0: Math.max(0, grow * mlen - 60), s1: grow * mlen, key: 0, intensity: 1.5 }] : [], dim: grow >= 1 ? 0.35 : 0 });
    if (grow < 0.999) {
      add({ id: "msg.pk", kind: "packet", x: ms[0] + (me[0] - ms[0]) * grow, y: ms[1] + (me[1] - ms[1]) * grow, z: 6, key: 0, yaw: Math.atan2(me[1] - ms[1], me[0] - ms[0]) * 180 / Math.PI, scale: 0.8 });
    }
    if (grow >= 0.999) add({ id: "m.recv", kind: "mark", x: me[0], y: me[1], key: 0, tone: "key", flash: clamp(1 - (mu - 0.7) / 0.2, 0, 1) });
  }
  const phx = x0 + 40 + fract(t / 8) * (len - 60);
  add({ id: "playhead", kind: "playhead", points: [[phx, y0 - 16], [phx, y0 + 2 * lg + 16]] });
  spots.lane = [x0 + len * 0.45, y0 + lg, 0];
  spots.bus = tall ? [L.nodes[1][0] + nodes[1].w / 2 + 40, L.nodes[1][1], 0] : [L.nodes[1][0] - 20, L.nodes[0][1] + nodes[0].d / 2 + 40, 0];
  spots.housing = [L.nodes[1][0], L.nodes[1][1], 8];
  spots.tiles = [px, py, 4];
  spots.bits = [bx + 7 * bp, by, 2];

  // bounds of the composition (floor)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow2 = (x, y, rx = 0, ry = rx) => { minX = Math.min(minX, x - rx); maxX = Math.max(maxX, x + rx); minY = Math.min(minY, y - ry); maxY = Math.max(maxY, y + ry); };
  for (const p of poses) {
    if (p.points) for (const q of (Array.isArray(p.points[0][0]) ? p.points.flat() : p.points)) grow2(q[0], q[1], 4);
    else if (p.w) grow2(p.x, p.y, p.w / 2, (p.d ?? p.w) / 2);
  }
  return { poses, bounds: { minX, minY, maxX, maxY, minZ: 0, maxZ: 30 }, spots };
}
