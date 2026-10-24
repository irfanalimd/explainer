// node --test engine/gfx/gfx.test.mjs : the DOM-free parts of the renderer (camera maths, EDT, slab template, packing)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cameraState, lightState, fitDistance, apply4 } from "./math.mjs";
import { edt2d, sdfFromAlpha } from "./edt.mjs";
import { slabTemplate, RING } from "./slabmesh.mjs";
import { Packer, themeColors, SLAB_FLOATS, SEG_FLOATS, INK_FLOATS, GROOVE_TEXELS, BOUNCE_FLOATS } from "./pack.mjs";
import { Shelves } from "./text.mjs";
import { DrawList } from "../contracts.mjs";
import { LIGHT, GLOW } from "../tokens.mjs";

const cam = { target: [0, 0, 0], distance: 1000, yaw: 0, pitch: 54, fov: 28 };

test("camera: yaw 0 looks from +y toward -y with +x to the right and +y lower on screen", () => {
  const s = cameraState(cam, 1440, 900);
  assert.ok(s.frame.eye[1] > 0 && s.frame.eye[2] > 0);
  const [cx, cy] = s.project([0, 0, 0]);
  assert.ok(Math.abs(cx - 720) < 1e-6 && Math.abs(cy - 450) < 1e-6);
  assert.ok(s.project([100, 0, 0])[0] > cx, "+x is to the right");
  assert.ok(s.project([0, 100, 0])[1] > cy, "+y (toward the viewer) is lower on screen");
  assert.ok(s.project([0, 0, 50])[1] < cy, "+z is up");
  const yawed = cameraState({ ...cam, yaw: 90 }, 1440, 900);
  assert.ok(yawed.frame.eye[0] > 500 && Math.abs(yawed.frame.eye[1]) < 1e-6, "positive yaw swings the eye toward +x");
});

test("camera: unproject inverts project on any horizontal plane; pxPerUnit matches finite differences", () => {
  const s = cameraState({ ...cam, yaw: 17, pitch: 41, target: [30, -20, 5] }, 1280, 720);
  for (const p of [[0, 0, 0], [123, -45, 0], [-200, 80, 16], [55, 66, 30]]) {
    const [x, y] = s.project(p);
    const [ux, uy] = s.unproject(x, y, p[2]);
    assert.ok(Math.hypot(ux - p[0], uy - p[1]) < 1e-4, `${p} -> ${ux},${uy}`);
  }
  const at = [10, 20, 0], R = s.frame.R;
  const a = s.project(at), b = s.project([at[0] + R[0] * 0.01, at[1] + R[1] * 0.01, at[2] + R[2] * 0.01]);
  assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.01 - s.pxPerUnit(at)) / s.pxPerUnit(at) < 1e-3);
  assert.equal(s.project([0, 1e6, -1e6])[3], false, "behind the camera is off screen");
});

test("shadow light box contains the scene and is texel-snapped", () => {
  const L = lightState(LIGHT.key.dir, [-300, -200, 0], [300, 200, 40], 2048);
  for (const p of [[-300, -200, 0], [300, 200, 40], [-300, 200, 40], [300, -200, 0]]) {
    const c = apply4(L.viewProj, [...p, 1]);
    assert.ok(Math.abs(c[0]) <= 1 && Math.abs(c[1]) <= 1 && Math.abs(c[2]) <= 1, String(c));
  }
  const L2 = lightState(LIGHT.key.dir, [-299.7, -200, 0], [300.3, 200, 40], 2048);
  assert.ok(Math.abs(L2.viewProj[12] - L.viewProj[12]) < 1e-6 || Math.abs(L2.viewProj[12] - L.viewProj[12]) > 1e-4);
});

test("fitDistance frames a box inside the margin", () => {
  const box = { minX: -500, maxX: 500, minY: -300, maxY: 300, minZ: 0, maxZ: 20 };
  const d = fitDistance(cam, box, 1440, 900, 0.06);
  const s = cameraState({ ...cam, distance: d }, 1440, 900);
  let ok = true;
  for (let i = 0; i < 8; i++) {
    const [x, y] = s.project([i & 1 ? box.maxX : box.minX, i & 2 ? box.maxY : box.minY, i & 4 ? 20 : 0]);
    ok &&= x >= 50 && x <= 1390 && y >= 50 && y <= 850;
  }
  assert.ok(ok);
});

test("EDT is exact against brute force", () => {
  const w = 23, h = 17, sites = [[3, 4], [19, 2], [11, 14], [7, 9]];
  const g = new Float64Array(w * h).fill(1e20);
  for (const [x, y] of sites) g[y * w + x] = 0;
  edt2d(g, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const want = Math.min(...sites.map(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2));
    assert.equal(g[y * w + x], want);
  }
});

test("EDT gives the plain strided transform's exact doubles, flat lines and reused scratch included", () => {
  // the transform as first written: every column walked with a stride, nothing skipped, fresh scratch each call
  const INF = 1e20;
  const ref1d = (f, o, st, n, d, v, z) => {
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1, k = 0; q < n; q++) {
      const fq = f[o + q * st]; let s;
      do { const r = v[k]; s = (fq - f[o + r * st] + q * q - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    for (let q = 0, k = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = f[o + r * st] + (q - r) * (q - r); }
    for (let q = 0; q < n; q++) f[o + q * st] = d[q];
  };
  const ref2d = (g, w, h) => {
    const n = Math.max(w, h), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < w; x++) ref1d(g, x, w, h, d, v, z);
    for (let y = 0; y < h; y++) ref1d(g, y * w, 1, w, d, v, z);
  };
  let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  // sizes in both orders, so the scratch grows and is then reused smaller; seeds of 0, INF and fractions, empty lines
  for (const [w, h] of [[41, 13], [9, 57], [64, 64], [30, 5], [1, 7], [7, 1]]) {
    const g = new Float64Array(w * h);
    for (let i = 0; i < g.length; i++) { const u = rnd(); g[i] = u < 0.08 ? 0 : u < 0.12 ? rnd() * 0.25 : INF; }
    for (let x = 0; x < w; x += 3) for (let y = 0; y < h; y++) g[y * w + x] = INF;   // whole columns with no site
    const want = Float64Array.from(g);
    ref2d(want, w, h);
    edt2d(g, w, h);
    assert.deepEqual(Array.from(g), Array.from(want), `${w}x${h}`);
  }
});

test("SDF of an anti-aliased disc: 128 on the edge, monotone across it", () => {
  const w = 64, h = 64, R = 20, alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) - R;
    alpha[y * w + x] = Math.round(255 * Math.min(1, Math.max(0, 0.5 - d)));
  }
  const sdf = sdfFromAlpha(alpha, w, h, 8);
  const at = (x, y) => sdf[y * w + x];
  const edge = (at(32 + R - 1, 32) + at(32 + R, 32)) / 2;
  assert.ok(Math.abs(edge - 128) <= 10, `edge ${edge}`);
  assert.equal(at(32, 32), 255);
  assert.equal(at(1, 1), 0);
  for (let x = 32 + R - 6; x < 32 + R + 6; x++) assert.ok(at(x, 32) >= at(x + 1, 32));
});

test("slab template: closed ring stack, every triangle indexes a real vertex, outward winding on the side wall", () => {
  const t = slabTemplate({ corner: 6, bevel: 5, lip: 3 });
  assert.equal(t.ringSize, 4 * 7);
  assert.equal(t.rings, 3 + 6 + 4 + 3);
  for (const i of t.indices) assert.ok(i < t.vertexCount);
  // place the side wall of a 20x10x5 box (r 3) and check the normal of its first quad points outward
  const M = t.ringSize, foot = 2 * M, top = 3 * M;
  const pos = (v, z) => {
    const sx = t.plan[v * 3], sy = t.plan[v * 3 + 1], th = t.plan[v * 3 + 2];
    return [sx * 7 + sx * Math.cos(th) * 3, sy * 2 + sy * Math.sin(th) * 3, z];
  };
  const a = pos(foot, 0), b = pos(foot + 1, 0), c = pos(top + 1, 5);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  assert.ok(n[0] * a[0] + n[1] * a[1] > 0, "outward");
  assert.equal(t.prof[0], RING.BOTTOM_C);
});

const atlas = { get: (text) => ({ u0: 0, v0: 0, u1: 0.1, v1: 0.05, w: 200, h: 100, originX: 10, baseline: 74, advance: 20 + text.length * 38, cap: 45, px: 64 }) };
const pack = (dl, extra = {}) => new Packer().pack(dl, { colors: themeColors("dark"), atlas, cam: cameraState(cam, 1440, 900), time: 0, distance: 1000, ...extra });

test("pack: slabs split by LOD and transparency, transparent sorted back to front", () => {
  const dl = new DrawList();
  dl.slab({ id: "a", x: 0, y: 0, w: 26, d: 26, h: 5, r: 5, color: "#ffffff" });
  dl.slab({ id: "h", x: 0, y: 0, w: 200, d: 100, h: 16, r: 11, well: { x: 0, y: 0, w: 180, d: 60, r: 7, depth: 2.4 } });
  dl.slab({ id: "far", x: 0, y: -300, w: 26, d: 26, h: 5, opacity: 0.5 });
  dl.slab({ id: "near", x: 0, y: 300, w: 26, d: 26, h: 5, opacity: 0.5 });
  const fr = pack(dl, { cam: cameraState({ ...cam, distance: 3000 }, 1440, 900) });
  assert.deepEqual([fr.nSmall, fr.nLarge, fr.nTrans], [1, 1, 2]);
  const idAt = (k) => fr.ids[fr.slabs[k * SLAB_FLOATS + 35]];
  assert.equal(idAt(2), "far"); assert.equal(idAt(3), "near");
});

test("pack: a tile in a tray lands its contact shadow on the well floor; a hopping one fades with height", () => {
  const dl = new DrawList();
  dl.slab({ id: "h", x: 0, y: 0, w: 200, d: 100, h: 16, r: 11, well: { x: 0, y: 0, w: 180, d: 60, r: 7, depth: 2.4 } });
  dl.slab({ id: "t", x: 10, y: 0, z: 13.6, w: 26, d: 26, h: 5 });
  dl.slab({ id: "hop", x: 300, y: 0, z: 30, w: 26, d: 26, h: 5 });
  const fr = pack(dl);
  const C = fr.contact, rows = [];
  for (let i = 0; i < fr.nContact; i++) rows.push(Array.from(C.subarray(i * 12, i * 12 + 12)));
  const tray = rows.find((r) => r[0] === 10);
  assert.ok(Math.abs(tray[9] - 13.6) < 1e-6 && tray[10] === 0 && tray[8] > 0.9);
  const hop = rows.find((r) => r[0] === 300);
  assert.ok(hop[8] < 0.5 && hop[7] > 5 && hop[10] === 1);
});

test("pack: lights capped at LIGHT.maxPointLights; grooves grow by arc length; rails become solids", () => {
  const dl = new DrawList();
  for (let i = 0; i < 30; i++) dl.slab({ x: i * 10, y: 0, z: 9, w: 13, d: 7.5, h: 4.5, r: 3.7, emissive: 2.2, light: 34, color: "#ff9a52" });
  dl.groove({ points: [[0, 0], [100, 0], [100, 100]], grow: 0.75 });
  dl.groove({ points: [[0, 50], [300, 50]], style: "rail", width: 4 });
  const fr = pack(dl);
  assert.equal(fr.nLights, LIGHT.maxPointLights);
  assert.equal(fr.nSeg, 2);
  const s = fr.seg;
  assert.deepEqual([s[SEG_FLOATS], s[SEG_FLOATS + 1], s[SEG_FLOATS + 2], s[SEG_FLOATS + 3]], [100, 0, 100, 50]);
  assert.equal(fr.nSlabs, 31, "the rail is a capsule slab");
});

test("pack: labels align left / centre / right on the face and shrink to fit", () => {
  const dl = new DrawList();
  dl.slab({ id: "r", x: 0, y: 0, w: 54, d: 24, h: 5, r: 5, bevel: 1.3, label: { text: "fox", align: "left", dx: -21, size: 9 }, label2: { text: "1", align: "right", dx: 21, size: 9 },
    label3: { text: "aaaaaaaaaaaaaaaaaaaa", size: 9 } });
  const fr = pack(dl), A = fr.slabs;
  const L = (k) => Array.from(A.subarray(48 + k * 16, 48 + k * 16 + 4));
  const k9 = 9 / 64;
  const [cx0, , hx0] = L(0);
  assert.ok(Math.abs((cx0 - hx0) - (-21 - 10 * k9)) < 1e-4, "left edge of the pen at dx");
  const [cx1, , hx1] = L(1);
  assert.ok(Math.abs((cx1 - hx1) + (20 + 38) * k9 + 10 * k9 - 21) < 1e-4, "right-aligned advance ends at dx");
  const [, , hx2] = L(2);
  assert.ok(hx2 * 2 < 54, "a long label is shrunk onto the face");
  assert.equal(A[43], 3);
});

test("pack: zones go below grooves, texts and ticks above; outlines of raised things become ring slabs", () => {
  const dl = new DrawList();
  dl.zone({ x: 0, y: 0, w: 200, d: 100, title: "rack a" });
  dl.text({ x: 0, y: 0, text: "hello" });
  dl.tick({ x: 0, y: 0, length: 100, every: 10, major: 5 });
  dl.slab({ id: "t", x: 0, y: 0, z: 13.6, w: 26, d: 26, h: 5, outline: 1 });
  const fr = pack(dl);
  assert.equal(fr.nInk, 1);
  assert.equal(fr.nInkTop, 1 + 1 + 11);
  assert.equal(fr.nSlabs, 2);
  assert.equal(INK_FLOATS, 20);
});

test("atlas shelves: free gaps are reused, full atlas refuses", () => {
  const s = new Shelves(100, 30);
  const a = s.alloc(60, 10), b = s.alloc(40, 10), c = s.alloc(50, 10);
  assert.ok(a && b && c && c.y === 10);
  s.free(a.item);
  const d = s.alloc(55, 10);
  assert.equal(d.x, 0); assert.equal(d.y, 0);
  assert.equal(s.alloc(100, 20), null);
});

test("pack: status accent and crash darkening land in the slab texels", () => {
  const dl = new DrawList();
  dl.slab({ id: "h", x: 0, y: 0, w: 140, d: 100, h: 11, r: 10, well: { x: 0, y: 8, w: 120, d: 60 }, darken: 0.3,
    accent: { color: "#FF4D4F", level: 1.2, mode: "line", x: 0, y: -25, len: 58, half: 0.5, rim: 0.05 } });
  dl.slab({ id: "s", x: 300, y: 0, w: 140, d: 140, h: 12, r: 70, well: { x: 0, y: 0, w: 100, d: 100, r: 50 }, accent: { color: "#3DDC97", level: 0.6, mode: "ring", gap: 2.6, half: 0.5 } });
  const fr = pack(dl), A = fr.slabs;
  const row = (id) => { for (let k = 0; k < fr.nSlabs; k++) if (fr.ids[A[k * SLAB_FLOATS + 35]] === id) return k * SLAB_FLOATS; };
  const h = row("h"), s = row("s");
  assert.ok(Math.abs(A[h + 99] - 1.2) < 1e-6 && A[h + 101] === -25 && A[h + 102] === 58 && A[h + 103] === 0.5);
  assert.ok(Math.abs(A[h + 47] - 0.3) < 1e-6, "darken");
  assert.ok(A[h + 46] > 0, "rim");
  assert.ok(A[s + 102] < 0, "ring mode");
});

test("pack: afterglow keeps a used groove faintly lit for GLOW.afterglow s, resets on a jump back", () => {
  const p = new Packer();
  const at = (t, active) => {
    const dl = new DrawList();
    dl.groove({ id: "g", points: [[0, 0], [100, 0]], glow: active ? 0.4 : 0, glowColor: "#4F8CFF", pulses: active ? [{ s0: 0, s1: 50, intensity: 1.7 }] : [] });
    const fr = p.pack(dl, { colors: themeColors("dark"), atlas, cam: cameraState(cam, 1440, 900), time: t, distance: 1000 });
    return fr.grooves[7];
  };
  assert.ok(at(0, true) > 0);
  const a = at(0.3, false), b = at(0.3 + GLOW.afterglow * 0.7, false), c = at(0.3 + GLOW.afterglow * 1.2, false);
  assert.ok(a > 0 && b > 0 && b < a && c === 0, `${a} ${b} ${c}`);
  at(5, true);
  assert.equal(at(1, false), 0, "time went backwards: no stale afterglow");
  assert.equal(GROOVE_TEXELS, 16);
});

test("pack: a flashing tile in a tray pings on the tray floor; data tiles cast colour bounce, housings do not", () => {
  const dl = new DrawList();
  dl.slab({ id: "h", x: 0, y: 0, w: 200, d: 100, h: 11, r: 10, color: "#262C3D", well: { x: 0, y: 0, w: 180, d: 60, r: 7, depth: 1.5 } });
  dl.slab({ id: "t", x: 10, y: 0, z: 9.5, w: 26, d: 26, h: 5, r: 5, color: "#4F8CFF", material: "ceramic", ping: { flash: 0.5, lit: 0, color: "#4F8CFF" } });
  dl.slab({ id: "air", x: 300, y: 0, z: 80, w: 26, d: 26, h: 5, r: 5, color: "#4F8CFF", material: "ceramic", ping: { flash: 0.5, lit: 0, color: "#4F8CFF" } });
  const fr = pack(dl);
  assert.equal(fr.nInkRaised, 1, "one ring, on the tray floor; none under the tile in mid-air");
  assert.ok(Math.abs(fr.inkRaised[19] - 9.52) < 1e-4 && fr.inkRaised[7] === 3);
  assert.equal(fr.nBounce, 1, "only the saturated tile casts bounce (the one in the air too far up)");
  assert.equal(fr.bounce[0], 10); assert.equal(BOUNCE_FLOATS, 12);
});
