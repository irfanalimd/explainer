// DrawList -> GPU-ready arrays, every frame, into pooled Float32Arrays (no per-frame allocation storms).
// Pure apart from the text atlas it is handed (any object with get(text, font, weight, tracking)).
//
// Slab instance layout, 26 RGBA32F texels (104 floats) per slab:
//  t0 x y z scale | t1 w d h r | t2 bevel yaw pitch roll (rad) | t3 colour.rgb(lin) material
//  t4 emissive.rgb(lin) emissive | t5 rim opacity desaturate flags(1 no-shadow, 2 meter)
//  t6 well cx cy hw hd | t7 well r depth lip meterValue | t8 well.rgb(lin) pickId
//  t9 meter cx cy hw hd | t10 meter.rgb(lin) labelCount | t11 groundAO meterGlow accentRim darken
//  t12+4k label k: (cx cy hx hy) (u0 v0 u1 v1) (rgba lin) (engrave offsetU clipHalf clipY)
//  t24 accent.rgb(lin) level | t25 accent cx cy-or-gap halfLen halfThick (mode in sign: len < 0 = ring round the well)
import { PALETTE, SIZE, LIGHT, GLOW } from "../tokens.mjs";
import { linear, srgba } from "./color.mjs";
import { FloatPool } from "./glutil.mjs";
import { DEG } from "./math.mjs";

export const SLAB_TEXELS = 26, SLAB_FLOATS = 104;
export const INK_FLOATS = 20, SEG_FLOATS = 8, GROOVE_TEXELS = 16, CONTACT_FLOATS = 12, BOUNCE_FLOATS = 12;
const MATERIALS = { matte: 0, ceramic: 1, glass: 2, metal: 3 };
const INK = { zone: 0, text: 1, rect: 2, ring: 3 };
const EMPTY = [];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// token colours repeat endlessly: memoise string -> linear
const LIN = new Map();
function lin(c, fallback) {
  if (typeof c !== "string") return linear(c, fallback);
  let v = LIN.get(c);
  if (!v) { v = linear(c); if (LIN.size > 4096) LIN.clear(); LIN.set(c, v); }
  return v;
}
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function themeColors(theme) {
  const P = PALETTE[theme] ?? PALETTE.dark;
  const lin = {};
  for (const [k, v] of Object.entries(P)) if (typeof v === "string") lin[k] = linear(v);
  return { name: theme, P, lin };
}

export class Packer {
  constructor() {
    this.slab = new FloatPool(SLAB_FLOATS * 256);
    this.ink = new FloatPool(INK_FLOATS * 256);
    this.inkTop = new FloatPool(INK_FLOATS * 256);
    this.inkRaised = new FloatPool(INK_FLOATS * 64);     // texts and ticks above the floor (on plates, housing tops)
    this.seg = new FloatPool(SEG_FLOATS * 512);
    this.groove = new FloatPool(GROOVE_TEXELS * 4 * 64);
    this.contact = new FloatPool(CONTACT_FLOATS * 256);
    this.bounce = new FloatPool(BOUNCE_FLOATS * 128);    // coloured casters for the colour-bounce map
    this.glowMem = new Map();                            // groove key -> { v, color, t }: afterglow
    this.litMem = new Map();                             // slab id -> { v, t }: lit rising edges (pings)
    this.lastTime = null;
    this.ids = [];
    this.order = new Int32Array(1024);
    this.depth = new Float32Array(1024);
    this.lightsPos = new Float32Array(16 * 4);
    this.lightsCol = new Float32Array(16 * 4);
    this.extra = [];
  }

  /**
   * @param {import("../contracts.mjs").DrawList} dl
   * @param {{ colors, atlas, cam, time, focus }} ctx  cam = cameraState(...) of this frame
   */
  pack(dl, ctx) {
    const { colors, atlas, cam } = ctx;
    const time = ctx.time ?? 0;
    this.ink.reset(); this.inkTop.reset(); this.inkRaised.reset(); this.seg.reset(); this.groove.reset(); this.contact.reset(); this.slab.reset();
    this.bounce.reset();
    this.ids.length = 0;
    // time-based memories (afterglow, pings) only make sense going forward: a jump back or far ahead resets them
    this.frameNo = (this.frameNo ?? 0) + 1;
    if (this.lastTime == null || time < this.lastTime - 1e-4 || time - this.lastTime > 3) { this.glowMem.clear(); this.litMem.clear(); this.freshFrame = this.frameNo; }
    this.lastTime = time;
    this.time = time;
    this.reduced = !!ctx.reducedMotion;            // no ping run-outs under prefers-reduced-motion
    this.grooveSeen = this.grooveSeen ?? new Map(); this.grooveSeen.clear();
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: 0 };
    const grow = (x0, y0, x1, y1, z = 0) => {
      if (x0 < bounds.minX) bounds.minX = x0; if (y0 < bounds.minY) bounds.minY = y0;
      if (x1 > bounds.maxX) bounds.maxX = x1; if (y1 > bounds.maxY) bounds.maxY = y1;
      if (z > bounds.maxZ) bounds.maxZ = z;
    };

    // rails and wires are real solids: one capsule slab per segment (opaque geometry unions seamlessly)
    const extra = this.extra; extra.length = 0;
    for (const g of dl.grooves) if (g.style === "rail" || g.style === "wire") this.railSlabs(g, colors, extra);
    // selection rings for raised things (tiles in trays): a flat through-hole ring slab at their base
    for (const s of dl.slabs) if (s && s.outline > 0 && num(s.z, 0) > 0.3) this.ringSlab(s, colors, extra);
    const slabs = extra.length ? dl.slabs.concat(extra) : dl.slabs;
    const n = slabs.length;
    if (this.order.length < n) { this.order = new Int32Array(n * 2); this.depth = new Float32Array(n * 2); }

    // classify: opaque small LOD, opaque large LOD, transparent (sorted back to front)
    const eye = cam.frame.eye, F = cam.frame.F, focal = cam.focalPx;
    let nS = 0, nL = 0, nT = 0;
    const order = this.order, depth = this.depth;
    const small = [], large = [], trans = [];
    for (let i = 0; i < n; i++) {
      const s = slabs[i];
      if (!s || !(s.w > 0) || !(s.d > 0) || !(s.h > 0)) continue;
      const op = num(s.opacity, 1);
      if (op <= 0.002) continue;
      const z = num(s.z, 0);
      const dz = (s.x - eye[0]) * F[0] + (s.y - eye[1]) * F[1] + (z + s.h / 2 - eye[2]) * F[2];
      depth[i] = dz;
      const ppu = focal / Math.max(1, dz) * num(s.scale, 1);
      const rpx = num(s.r, 0) * ppu, wpx = Math.max(s.w, s.d) * ppu;
      if (op < 0.999 || s.material === "glass") trans.push(i);
      else if (rpx > 9 || wpx > 260 || s.well) large.push(i);
      else small.push(i);
      const ext = Math.hypot(s.w, s.d) / 2 * num(s.scale, 1);
      grow(s.x - ext, s.y - ext, s.x + ext, s.y + ext, z + s.h);
    }
    trans.sort((a, b) => depth[b] - depth[a]);
    nS = small.length; nL = large.length; nT = trans.length;
    const all = small.concat(large, trans);
    this.slab.reserve(all.length * SLAB_FLOATS);
    const A = this.slab.a;
    const lights = [];
    const receivers = [];
    for (const i of all) {
      const s = slabs[i];
      if (Math.min(s.w, s.d) < 18 || num(s.opacity, 1) <= 0.5) continue;
      const yaw = num(s.yaw, 0) * DEG, sc = num(s.scale, 1), qz = num(s.z, 0);
      let well = null;
      if (s.well && s.well.w > 0.5 && s.well.d > 0.5) {
        const dep = clamp(num(s.well.depth, SIZE.well.depth), 0.1, s.h - 0.3);
        well = { x: num(s.well.x, 0) * sc, y: num(s.well.y, 0) * sc, hw: s.well.w / 2 * sc, hd: s.well.d / 2 * sc, floor: qz + (s.h - dep) * sc };
      }
      receivers.push({ s, x: s.x, y: s.y, z: qz, top: qz + s.h * sc, cs: Math.cos(yaw), sn: Math.sin(yaw), hw: s.w / 2 * sc, hd: s.d / 2 * sc, well });
    }
    // uniform grid over the receivers so each caster only tests the ones around it
    const grid = this.grid ?? (this.grid = new Map());
    grid.clear();
    const CELL = 96;
    for (const q of receivers) {
      const rad = Math.hypot(q.hw, q.hd);
      const x0 = Math.floor((q.x - rad) / CELL), x1 = Math.floor((q.x + rad) / CELL);
      const y0 = Math.floor((q.y - rad) / CELL), y1 = Math.floor((q.y + rad) / CELL);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const k = gx * 73856093 ^ gy * 19349663;
        let cell = grid.get(k);
        if (!cell) grid.set(k, (cell = []));
        cell.push(q);
      }
    }
    receivers.cellOf = (x, y) => grid.get(Math.floor(x / CELL) * 73856093 ^ Math.floor(y / CELL) * 19349663) ?? EMPTY;
    for (let k = 0; k < all.length; k++) {
      const s = slabs[all[k]];
      this.writeSlab(A, k * SLAB_FLOATS, s, colors, atlas, receivers, lights, time);
      if (s.outline > 0 && num(s.z, 0) <= 0.3) this.outline(s, colors);
    }

    // lights from drawList.lights
    for (const l of dl.lights) {
      if (!(l.intensity > 0) || !(l.radius > 0)) continue;
      const c = linear(l.color);
      lights.push({ x: l.x, y: l.y, z: num(l.z, 0), r: c[0], g: c[1], b: c[2], i: l.intensity, rad: l.radius });
    }
    const target = cam.target ?? [0, 0, 0];
    const camD = Math.max(1, ctx.distance ?? 1000);
    for (const l of lights) l.score = l.i * Math.sqrt(l.rad) / (1 + Math.hypot(l.x - target[0], l.y - target[1]) / camD);
    lights.sort((a, b) => b.score - a.score);
    const nLights = Math.min(LIGHT.maxPointLights, lights.length);
    for (let i = 0; i < nLights; i++) {
      const l = lights[i];
      this.lightsPos.set([l.x, l.y, l.z, l.rad], i * 4);
      this.lightsCol.set([l.r * l.i, l.g * l.i, l.b * l.i, 0], i * 4);
    }

    // zones (below grooves), their titles (above)
    for (const z of dl.zones) this.zone(z, colors, atlas, grow);
    // grooves
    let segIndex = 0, gi = 0;
    for (const g of dl.grooves) {
      if (g.style === "rail" || g.style === "wire" || !g.points || g.points.length < 1) continue;
      if (num(g.z, 0) > 0.01) { /* raised grooves fall back to floor level */ }
      segIndex = this.grooveRow(g, gi, segIndex, colors, time, grow);
      gi++;
    }
    for (const t of dl.texts) this.text(t, colors, atlas, grow);
    for (const t of dl.ticks) this.tickRow(t, colors);

    if (dl.bounds && Number.isFinite(dl.bounds.minX)) {
      bounds.minX = dl.bounds.minX; bounds.maxX = dl.bounds.maxX; bounds.minY = dl.bounds.minY; bounds.maxY = dl.bounds.maxY;
    }
    if (!Number.isFinite(bounds.minX)) { bounds.minX = -200; bounds.maxX = 200; bounds.minY = -150; bounds.maxY = 150; }

    return {
      slabs: A, nSmall: nS, nLarge: nL, nTrans: nT, nSlabs: all.length, ids: this.ids,
      ink: this.ink.a, nInk: this.ink.n / INK_FLOATS, inkTop: this.inkTop.a, nInkTop: this.inkTop.n / INK_FLOATS,
      inkRaised: this.inkRaised.a, nInkRaised: this.inkRaised.n / INK_FLOATS,
      seg: this.seg.a, nSeg: this.seg.n / SEG_FLOATS, grooves: this.groove.a, nGrooves: gi,
      contact: this.contact.a, nContact: this.contact.n / CONTACT_FLOATS,
      lightsPos: this.lightsPos, lightsCol: this.lightsCol, nLights,
      bounce: this.bounce.a, nBounce: this.bounce.n / BOUNCE_FLOATS,
      bounds,
    };
  }

  railSlabs(g, colors, out) {
    const pts = g.points, w = num(g.width, SIZE.lane.w);
    const wire = g.style === "wire";
    const col = g.color ?? (wire ? colors.P.metal : colors.P.housingAlt);
    const h = wire ? w * 0.5 : Math.max(0.8, w * 0.3);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const L = Math.hypot(x1 - x0, y1 - y0);
      if (L < 1e-3 && pts.length > 2) continue;
      out.push({
        id: g.id, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: num(g.z, 0), w: L + w, d: w, h,
        r: w / 2, bevel: wire ? Math.min(w / 2, h) : Math.min(w * 0.18, h * 0.6),
        yaw: Math.atan2(y1 - y0, x1 - x0) / DEG, color: col, material: wire ? "metal" : "matte",
        emissive: g.glow ?? 0, emissiveColor: g.glowColor ?? g.color, opacity: g.opacity, shadow: true, _rail: true,
      });
    }
  }

  ringSlab(s, colors, out) {
    const off = 2.6, rw = 1.1, sc = num(s.scale, 1);
    const w = s.w * sc, d = s.d * sc, r = clamp(num(s.r, 0), 0, Math.min(s.w, s.d) / 2) * sc;
    out.push({
      id: s.id, x: s.x, y: s.y, z: num(s.z, 0) + 0.04, w: w + 2 * (off + rw), d: d + 2 * (off + rw), h: 0.08, r: r + off + rw, bevel: 0,
      yaw: s.yaw, color: colors.P.select, emissive: colors.name === "dark" ? 0.9 * s.outline : 0, emissiveColor: colors.P.select,
      opacity: 1, material: "matte", shadow: false, _ring: true, _through: true,
      well: { x: 0, y: 0, w: w + 2 * off, d: d + 2 * off, r: r + off, depth: 0.08, lip: 0 },
    });
  }

  writeSlab(A, o, s, colors, atlas, receivers, lights, time) {
    const w = s.w, d = s.d, h = s.h;
    const r = clamp(num(s.r, 0), 0, Math.min(w, d) / 2);
    const bevel = clamp(num(s.bevel, 0), 0, Math.min(r, h * 0.95));
    const z = num(s.z, 0), sc = num(s.scale, 1);
    A[o] = s.x; A[o + 1] = s.y; A[o + 2] = z; A[o + 3] = sc;
    A[o + 4] = w; A[o + 5] = d; A[o + 6] = h; A[o + 7] = r;
    A[o + 8] = bevel; A[o + 9] = num(s.yaw, 0) * DEG; A[o + 10] = num(s.pitch, 0) * DEG; A[o + 11] = num(s.roll, 0) * DEG;
    const c = lin(s.color ?? colors.P.tile);
    A[o + 12] = c[0]; A[o + 13] = c[1]; A[o + 14] = c[2]; A[o + 15] = MATERIALS[s.material] ?? 0;
    const e = num(s.emissive, 0);
    const ec = s.emissiveColor ? lin(s.emissiveColor) : c;
    A[o + 16] = ec[0]; A[o + 17] = ec[1]; A[o + 18] = ec[2]; A[o + 19] = e;
    let flags = (s.shadow === false ? 1 : 0) | (s._through ? 4 : 0);
    A[o + 20] = clamp(num(s.rim, 0), 0, 1); A[o + 21] = clamp(num(s.opacity, 1), 0, 1); A[o + 22] = clamp(num(s.desaturate, 0), 0, 1);
    // well
    const wl = s.well;
    if (wl && wl.w > 0.5 && wl.d > 0.5) {
      const maxW = s._through ? wl.w : w - 2 * bevel - 1.2, maxD = s._through ? wl.d : d - 2 * bevel - 1.2;
      const ww = clamp(wl.w, 0.5, maxW), wd = clamp(wl.d, 0.5, maxD);
      const wr = clamp(num(wl.r, 0), 0, Math.min(ww, wd) / 2);
      const dep = s._through ? h : clamp(num(wl.depth, SIZE.well.depth), 0.1, h - 0.3);
      const lip = clamp(num(wl.lip, SIZE.well.lip), 0, Math.min(dep * 0.9, 1.5));
      const lim = (v, half, inner) => s._through ? v : clamp(v, -(half - bevel - inner - lip - 0.4), half - bevel - inner - lip - 0.4);
      A[o + 24] = lim(num(wl.x, 0), w / 2, ww / 2); A[o + 25] = lim(num(wl.y, 0), d / 2, wd / 2);
      A[o + 26] = ww / 2; A[o + 27] = wd / 2;
      A[o + 28] = wr; A[o + 29] = dep; A[o + 30] = lip;
      const wc = lin(wl.color ?? colors.P.well);
      A[o + 32] = wc[0]; A[o + 33] = wc[1]; A[o + 34] = wc[2];
    } else {
      A[o + 24] = 0; A[o + 25] = 0; A[o + 26] = 0; A[o + 27] = 0; A[o + 28] = 0; A[o + 29] = 0; A[o + 30] = 0;
      A[o + 32] = c[0] * 0.55; A[o + 33] = c[1] * 0.55; A[o + 34] = c[2] * 0.55;
    }
    const pick = s.id != null ? this.ids.push(s.id) - 1 : -1;
    A[o + 35] = pick;
    // meter
    const m = s.meter;
    if (m && m.w > 0 && m.d > 0) {
      flags |= 2;
      A[o + 31] = clamp(num(m.value, 0), 0, 1);
      A[o + 36] = num(m.x, 0); A[o + 37] = num(m.y, 0); A[o + 38] = m.w / 2; A[o + 39] = m.d / 2;
      const mc = lin(m.color ?? colors.P.busy);
      A[o + 40] = mc[0]; A[o + 41] = mc[1]; A[o + 42] = mc[2];
      A[o + 45] = colors.name === "dark" ? 0.35 : 0.0;
    } else { A[o + 31] = 0; A[o + 45] = 0; }
    A[o + 23] = flags;
    // status accent strip / ring and its rim; crash darkening
    const ac = s.accent;
    if (ac && ac.level > 0) {
      const l = lin(ac.color);
      A[o + 96] = l[0]; A[o + 97] = l[1]; A[o + 98] = l[2]; A[o + 99] = ac.level;
      if (ac.mode === "ring") { A[o + 100] = 0; A[o + 101] = num(ac.gap, 2.5); A[o + 102] = -1; }
      else { A[o + 100] = num(ac.x, 0); A[o + 101] = num(ac.y, 0); A[o + 102] = Math.max(1, num(ac.len, 10)); }
      A[o + 103] = num(ac.half, 0.5);
      A[o + 46] = num(ac.rim, 0) * ac.level;
    } else {
      A[o + 96] = 0; A[o + 97] = 0; A[o + 98] = 0; A[o + 99] = 0; A[o + 100] = 0; A[o + 101] = 0; A[o + 102] = 0; A[o + 103] = 0;
      A[o + 46] = 0;
    }
    A[o + 47] = clamp(num(s.darken, 0), 0, 0.9);
    // labels
    let nl = 0;
    for (const L of [s.label, s.label2, s.label3]) {
      if (!L || L.text == null || L.text === "" || nl >= 3) continue;
      if (this.label(A, o + 48 + nl * 16, L, s, w, d, bevel, colors, atlas)) nl++;
    }
    A[o + 43] = nl;

    // contact shadow and what it lands on
    const op = num(s.opacity, 1);
    let recvZ = 0, onSomething = z < 0.35;
    if (z >= 0.35) {
      for (const q of receivers.cellOf(s.x, s.y)) {
        if (q.s === s || q.z > z) continue;
        const dx = s.x - q.x, dy = s.y - q.y;
        const lx = q.cs * dx + q.sn * dy, ly = -q.sn * dx + q.cs * dy;
        if (Math.abs(lx) > q.hw || Math.abs(ly) > q.hd) continue;
        let surf = q.top;
        const qw = q.well;
        if (qw && Math.abs(lx - qw.x) < qw.hw && Math.abs(ly - qw.y) < qw.hd) surf = qw.floor;
        if (surf <= z + 0.05 && surf > recvZ) recvZ = surf;
      }
      if (z - recvZ < 0.35) onSomething = true;
    }
    const gap = Math.max(0, z - recvZ);
    A[o + 44] = Math.exp(-gap / 3);
    // the ping runs out over whatever the tile sits on (none for a tile in mid-air)
    if (s.ping) this.ping(s, colors, gap < 16 ? recvZ : null);
    // colour bounce: saturated (data) bodies spill a soft wash of their colour onto what is round them
    if (op > 0.5 && Math.min(w, d) > 7 && s.material !== "metal" && !s._rail && !s._ring) {
      // chroma in linear light: data colours are ~0.5..1, the inky navy and graphite bodies ~0.02
      const chroma = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
      const st = clamp((chroma - 0.18) / 0.3, 0, 1) * (1 + Math.min(1.5, e) * 0.6) * Math.exp(-gap / 14) * (1 - num(s.desaturate, 0));
      if (st > 0.02) {
        const k = this.bounce.reserve(BOUNCE_FLOATS), B = this.bounce.a;
        const yaw = num(s.yaw, 0) * DEG;
        B[k] = s.x; B[k + 1] = s.y; B[k + 2] = w / 2 * sc; B[k + 3] = d / 2 * sc;
        B[k + 4] = Math.cos(yaw); B[k + 5] = Math.sin(yaw); B[k + 6] = r * sc; B[k + 7] = GLOW.bounce.sigma + gap * 0.3;
        B[k + 8] = c[0]; B[k + 9] = c[1]; B[k + 10] = c[2]; B[k + 11] = st;
      }
    }
    if (s.shadow !== false && op > 0.05 && !s._rail && !s._ring) {
      const md = Math.min(w, d) * sc;
      const strength = (onSomething ? 1 : Math.exp(-gap / (0.45 * md + 3))) * Math.min(1, op * 1.2) * (s.material === "glass" ? 0.4 : 1);
      if (strength > 0.02) {
        const k = this.contact.reserve(CONTACT_FLOATS), C = this.contact.a;
        const yaw = num(s.yaw, 0) * DEG;
        C[k] = s.x; C[k + 1] = s.y; C[k + 2] = w / 2 * sc; C[k + 3] = d / 2 * sc;
        C[k + 4] = Math.cos(yaw); C[k + 5] = Math.sin(yaw); C[k + 6] = r * sc;
        C[k + 7] = clamp(0.05 * md, 0.55, 2.4) + gap * 0.22;
        C[k + 8] = strength; C[k + 9] = recvZ; C[k + 10] = recvZ < 0.05 ? 1 : 0; C[k + 11] = 0;
      }
    }
    // point light
    if (num(s.light, 0) > 0) {
      const lc = lin(s.emissiveColor ?? s.color);
      lights.push({ x: s.x, y: s.y, z: z + h * sc * 0.55, r: lc[0], g: lc[1], b: lc[2], i: clamp(e || 1, 0.3, 4) * op, rad: s.light });
    }
  }

  label(A, o, L, s, w, d, bevel, colors, atlas) {
    let text = String(L.text);
    if (L.upper) text = text.toUpperCase();
    const font = L.font === "sans" ? "sans" : "mono";
    const weight = num(L.weight, 500), tracking = num(L.tracking, 0);
    const e = atlas.get(text, font, weight, tracking);
    if (!e) return false;
    let size = num(L.size, SIZE.tile.label);
    let k = size / e.px;
    const align = L.align ?? "center";
    const dx = num(L.dx, 0), dy = num(L.dy, 0);
    const inset = bevel + Math.min(2, Math.min(w, d) * 0.08);
    const avail = align === "left" ? w / 2 - inset - dx : align === "right" ? dx + w / 2 - inset : w - 2 * inset;
    const wu = e.advance * k;
    if (avail > 0 && wu > avail) k *= Math.max(0.55, avail / wu);
    const x0 = align === "left" ? dx : align === "right" ? dx - e.advance * k : dx - e.advance * k / 2;
    const left = x0 - e.originX * k, top = dy + e.cap * k / 2 - e.baseline * k;
    const hx = e.w * k / 2, hy = e.h * k / 2;
    A[o] = left + hx; A[o + 1] = top + hy; A[o + 2] = hx; A[o + 3] = hy;
    A[o + 4] = e.u0; A[o + 5] = e.v0; A[o + 6] = e.u1; A[o + 7] = e.v1;
    const engrave = !!L.engrave;
    const c = lin(L.color ?? (engrave ? colors.P.engrave : colors.P.tileInk));
    A[o + 8] = c[0]; A[o + 9] = c[1]; A[o + 10] = c[2]; A[o + 11] = clamp(num(L.opacity, 1), 0, 1) * c[3];
    A[o + 12] = engrave ? 1 : 0; A[o + 13] = size * 0.026;
    const clip = L.clip;
    A[o + 14] = clip ? clip.half : 1e4; A[o + 15] = clip ? clip.y : 0;
    return true;
  }

  // a ring of light that runs out from a tile's foot: flash drives one (1 - sqrt(flash) is its age), a lit rising
  // edge another (timed here, since a pose cannot tell rising from falling)
  ping(s, colors, onZ) {
    const pg = s.ping, G = GLOW.ping, sc = num(s.scale, 1);
    const ages = [];
    if (pg.flash > 0.01) ages.push(1 - Math.sqrt(pg.flash));
    if (s.id != null) {
      // a tile carries a ping only while lit or flashing, so one missing last frame was unlit (except right
      // after a reset, when nothing is known)
      let m = this.litMem.get(s.id);
      if (!m) { m = { v: this.freshFrame === this.frameNo ? pg.lit : 0, t: -1e9, f: 0 }; this.litMem.set(s.id, m); }
      else if (m.f !== this.frameNo - 1) m.v = 0;
      if (pg.lit > 0.03 && m.v <= 0.03) m.t = this.time;
      m.v = pg.lit; m.f = this.frameNo;
      const a = (this.time - m.t) / G.time;
      if (a >= 0 && a < 1) ages.push(a);
    }
    if (this.litMem.size > 4096) this.litMem.clear();
    if (onZ == null || this.reduced) return;
    const dark = colors.name === "dark";
    const c = srgba(pg.color ?? colors.P.lit);
    const yaw = num(s.yaw, 0) * DEG, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const r0 = clamp(num(s.r, 0), 0, Math.min(s.w, s.d) / 2) * sc;
    for (const age of ages) {
      const u = 1 - (1 - age) * (1 - age);                  // decelerating run-out
      const off = 1.6 + u * G.radius, fade = (1 - age) * (1 - age) * Math.min(1, age * 12 + 0.25);
      const bw = (G.width * (1 - 0.55 * u) + 0.25) * (dark ? 1 : 1.35);   // on paper a ping has no bloom: it is ink
      const z = onZ;
      this.inkInst(z > 0.05 ? this.inkRaised : this.inkTop, s.x, s.y, s.w / 2 * sc + off, s.d / 2 * sc + off, cs, sn, r0 + off, INK.ring,
        c[0], c[1], c[2], Math.min(1, G.alpha * fade * (dark ? 1 : 2.2)), bw, dark ? 2.2 : 0, 0, 0, 0, 0, 0, z + 0.02);
    }
  }

  outline(s, colors) {
    const off = 3.5, sc = num(s.scale, 1);
    const yaw = num(s.yaw, 0) * DEG;
    const c = srgba(colors.P.select);
    const r = clamp(num(s.r, 0), 0, Math.min(s.w, s.d) / 2) * sc;
    this.inkInst(this.inkTop, s.x, s.y, s.w / 2 * sc + off, s.d / 2 * sc + off, Math.cos(yaw), Math.sin(yaw), r + off, INK.ring,
      c[0], c[1], c[2], c[3] * clamp(s.outline, 0, 1) * 0.9, 1.2, 0, 0, 0, 0, 0, 0, 0);
  }

  inkInst(pool, cx, cy, hx, hy, cs, sn, r, type, c0, c1, c2, c3, d0, d1, d2, d3, e0, e1, e2, e3) {
    const k = pool.reserve(INK_FLOATS), a = pool.a;
    a[k] = cx; a[k + 1] = cy; a[k + 2] = hx; a[k + 3] = hy;
    a[k + 4] = cs; a[k + 5] = sn; a[k + 6] = r; a[k + 7] = type;
    a[k + 8] = c0; a[k + 9] = c1; a[k + 10] = c2; a[k + 11] = c3;
    a[k + 12] = d0; a[k + 13] = d1; a[k + 14] = d2; a[k + 15] = d3;
    a[k + 16] = e0; a[k + 17] = e1; a[k + 18] = e2; a[k + 19] = e3;
  }

  zone(z, colors, atlas, grow) {
    const P = colors.P;
    const op = num(z.opacity, 1);
    const fill = srgba(z.fill ?? P.zoneFill), border = srgba(z.border ?? P.zoneBorder);
    const r = clamp(num(z.r, SIZE.zone.r), 0, Math.min(z.w, z.d) / 2);
    const dashed = z.borderStyle === "dashed";
    this.inkInst(this.ink, z.x, z.y, z.w / 2, z.d / 2, 1, 0, r, INK.zone,
      fill[0], fill[1], fill[2], fill[3] * op, num(z.borderWidth, 1), dashed ? 6 : 0, dashed ? 5 : 0, 0,
      border[0], border[1], border[2], border[3] * op);
    grow(z.x - z.w / 2, z.y - z.d / 2, z.x + z.w / 2, z.y + z.d / 2);
    if (z.title) {
      const tc = dashed ? border : srgba(P.inkFaint);
      this.text({
        x: z.x - z.w / 2 + Math.max(12, r * 0.8), y: z.y - z.d / 2 + 8.5, text: z.title, size: SIZE.zone.title,
        font: "mono", weight: 600, upper: true, tracking: 0.08, align: "left", color: [tc[0], tc[1], tc[2], Math.min(1, tc[3] * 1.0 + (dashed ? 0.35 : 0))],
        opacity: op, engrave: true,
      }, colors, atlas, null);
    }
  }

  text(t, colors, atlas, grow) {
    let text = String(t.text ?? "");
    if (!text) return;
    if (t.upper) text = text.toUpperCase();
    const font = t.font === "sans" ? "sans" : "mono";
    const e = atlas.get(text, font, num(t.weight, 500), num(t.tracking, 0));
    if (!e) return;
    const size = num(t.size, 7.5), k = size / e.px;
    const align = t.align ?? "center";
    const x0 = align === "left" ? 0 : align === "right" ? -e.advance * k : -e.advance * k / 2;
    const base = t.baseline ?? "middle";
    const by = base === "top" ? e.cap * k : base === "bottom" ? 0 : e.cap * k / 2;
    const left = x0 - e.originX * k, top = by - e.baseline * k;
    const hx = e.w * k / 2, hy = e.h * k / 2;
    const lx = left + hx, ly = top + hy;
    const yaw = num(t.yaw, 0) * DEG, cs = Math.cos(yaw), sn = Math.sin(yaw);
    const cx = t.x + cs * lx - sn * ly, cy = t.y + sn * lx + cs * ly;
    const c = srgba(t.color ?? colors.P.inkMuted);
    const z = num(t.z, 0);
    this.inkInst(z > 0.05 ? this.inkRaised : this.inkTop, cx, cy, hx, hy, cs, sn, 0, INK.text, c[0], c[1], c[2], c[3] * num(t.opacity, 1),
      e.u0, e.v0, e.u1, e.v1, t.engrave ? 1 : 0, size * 0.06, 0, z);
    if (grow) grow(cx - hx, cy - hy, cx + hx, cy + hy);
  }

  tickRow(t, colors) {
    const every = num(t.every, SIZE.lane.tickMinor), major = Math.max(1, Math.round(num(t.major, SIZE.lane.tickMajor / SIZE.lane.tickMinor)));
    const size = num(t.size, 2.5), axis = t.axis === "y" ? "y" : "x", side = t.side ?? "both";
    const c = srgba(t.color ?? colors.P.inkFaint), op = num(t.opacity, 1);
    const count = Math.floor(num(t.length, 0) / every + 1e-6);
    for (let i = 0; i <= count; i++) {
      const isMajor = i % major === 0;
      const len = isMajor ? size * 1.9 : size, th = isMajor ? 0.42 : 0.3;
      const along = i * every;
      const off = side === "near" ? len / 2 : side === "far" ? -len / 2 : 0;
      const cx = axis === "x" ? t.x + along : t.x + off;
      const cy = axis === "x" ? t.y + off : t.y + along;
      const hx = axis === "x" ? th : len / 2, hy = axis === "x" ? len / 2 : th;
      const z = num(t.z, 0);
      this.inkInst(z > 0.05 ? this.inkRaised : this.inkTop, cx, cy, hx, hy, 1, 0, 0, INK.rect, c[0], c[1], c[2], c[3] * op * (isMajor ? 1 : 0.75), 0, 0, 0, 0, 0, 0, 0, z);
    }
  }

  grooveRow(g, gi, segIndex, colors, time, grow) {
    const pts = g.points;
    const P = colors.P;
    const style = g.style === "print" ? 1 : 0;
    const width = num(g.width, SIZE.trace.w), hw = width / 2;
    // arc length
    let total = 0;
    const cum = this._cum ?? (this._cum = []);
    cum.length = 0; cum.push(0);
    for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(total); }
    const lim = g.grow == null ? total : clamp(g.grow, 0, 1) * total;
    if (lim <= 1e-4 && g.grow != null) return segIndex;
    // afterglow: a groove that carried light keeps a faint glow, fading over GLOW.afterglow s
    let glow = num(g.glow, 0), glowColor = g.glowColor;
    if (g.id != null && g.style !== "print") {
      const n = this.grooveSeen.get(g.id) ?? 0; this.grooveSeen.set(g.id, n + 1);
      const key = n ? g.id + "#" + n : g.id;
      const active = glow > 0.002 || (g.pulses && g.pulses.some((q) => q.intensity > 0));
      const m = this.glowMem.get(key);
      if (active) {
        const v = Math.max(glow, GLOW.trace * 0.3);
        if (!m) this.glowMem.set(key, { v, color: glowColor ?? g.pulses?.[0]?.color, t: this.time });
        else { m.v = v; m.t = this.time; m.color = glowColor ?? g.pulses?.[0]?.color ?? m.color; }
      } else if (m) {
        const a = (this.time - m.t) / GLOW.afterglow;
        if (a >= 1 || a < 0) this.glowMem.delete(key);
        else { const k = (1 - a) * (1 - a); glow = Math.max(glow, m.v * GLOW.afterLevel * k); if (!glowColor) glowColor = m.color; }
      }
      if (this.glowMem.size > 4096) this.glowMem.clear();
    }
    const o = this.groove.reserve(GROOVE_TEXELS * 4), G = this.groove.a;
    G.fill(0, o, o + GROOVE_TEXELS * 4);
    G[o] = style; G[o + 1] = width; G[o + 2] = clamp(num(g.opacity, 1), 0, 1); G[o + 3] = total;
    const col = srgba(g.color ?? (style ? P.inkFaint : P.groove));
    G[o + 4] = col[0]; G[o + 5] = col[1]; G[o + 6] = col[2]; G[o + 7] = glow;
    G[o + 2] *= col[3];
    const gc = linear(glowColor ?? g.color ?? P.lit);
    G[o + 8] = gc[0]; G[o + 9] = gc[1]; G[o + 10] = gc[2];
    if (g.dash && g.dash[0] > 0) { G[o + 12] = g.dash[0]; G[o + 13] = Math.max(0.01, g.dash[1] ?? g.dash[0]); G[o + 14] = num(g.flow, 0) * time; }
    let np = 0;
    for (const p of g.pulses ?? []) {
      if (np >= 6 || !(p.intensity > 0)) continue;
      const pc = linear(p.color ?? P.lit);
      const q = o + 16 + np * 8;
      G[q] = num(p.s0, 0); G[q + 1] = num(p.s1, 0); G[q + 2] = p.intensity; G[q + 3] = clamp(num(p.a1, 1), 0, 1);
      G[q + 4] = pc[0]; G[q + 5] = pc[1]; G[q + 6] = pc[2]; G[q + 7] = clamp(num(p.a0, 0), 0, 1);
      np++;
    }
    G[o + 15] = np;
    G[o + 11] = np > 0 || G[o + 7] > 0 ? 0 : 1;   // tie-break priority: lit grooves win where lines overlap
    // segments up to the grown length
    for (let i = 0; i + 1 < pts.length || (pts.length === 1 && i === 0); i++) {
      const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
      const s0 = cum[i];
      if (s0 > lim) break;
      const segL = cum[Math.min(i + 1, pts.length - 1)] - s0;
      let bx = b[0], by = b[1];
      if (s0 + segL > lim && segL > 0) { const f = (lim - s0) / segL; bx = a[0] + (b[0] - a[0]) * f; by = a[1] + (b[1] - a[1]) * f; }
      const k = this.seg.reserve(SEG_FLOATS), S = this.seg.a;
      S[k] = a[0]; S[k + 1] = a[1]; S[k + 2] = bx; S[k + 3] = by;
      S[k + 4] = s0; S[k + 5] = gi; S[k + 6] = hw; S[k + 7] = segIndex++;
      grow(Math.min(a[0], bx) - hw, Math.min(a[1], by) - hw, Math.max(a[0], bx) + hw, Math.max(a[1], by) + hw);
      if (pts.length === 1) break;
    }
    return segIndex;
  }
}
