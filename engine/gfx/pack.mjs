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
import { PALETTE, SIZE, LIGHT, GLOW, WORLD_TYPE, PRISM2, worldCase } from "../tokens.mjs";
import { linear, srgba } from "./color.mjs";
import { FloatPool } from "./pool.mjs";
import { DEG } from "./math.mjs";

export const SLAB_TEXELS = 26, SLAB_FLOATS = 104;
export const INK_FLOATS = 20, SEG_FLOATS = 8, GROOVE_TEXELS = 16, CONTACT_FLOATS = 12, BOUNCE_FLOATS = 12;
const MATERIALS = { matte: 0, ceramic: 1, glass: 2, metal: 3 };
const INK = { zone: 0, text: 1, rect: 2, ring: 3 };
const LOD = { tinyPx: 24, tinyRadiusPx: 2 };       // tiny: under 24 css px across, corners under 2 px
const EMPTY = [];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// how far a point has risen onto the glass plinths: their full height inside, easing to 0 across `ramp` u at the edge
function liftAt(plinths, x, y) {
  let lift = 0;
  for (const q of plinths) {
    const qx = Math.abs(x - q.zone.x) - q.hw + q.r, qy = Math.abs(y - q.zone.y) - q.hd + q.r;
    if (qx >= q.r || qy >= q.r) continue;          // outside the plinth (its distance d is >= 0)
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - q.r;
    if (d < 0) lift = Math.max(lift, q.h * smooth(0, q.ramp, -d));
  }
  return lift;
}
// seen from far off (a few px on screen): a slab with a farColor greys toward it, one with minPx grows (up to 2.2x)
// so it stays that many px wide. Judged from this frame's camera, so a jump never shows a stale size
function farLook(s, ppu) {
  const px = Math.min(s.w, s.d) * ppu;
  return farLookAt(s, px, px);
}
// the same, with the size the colour is judged from (pxC) apart from the one a dot grows from (pxD)
function farLookAt(s, pxC, pxD) {
  const o = { ...s };
  if (s.farColor) { const far = 1 - clamp((pxC - 10) / 30, 0, 1); if (far > 0) o.color = mixSrgb(s.color, s.farColor, far * 0.85); }
  if (s.minPx && pxD > 0 && pxD < s.minPx) o.scale = num(s.scale, 1) * Math.min(2.2, s.minPx / pxD);
  return o;
}
// A scale field's far look is judged from buckets of size on screen, not the exact size: a quarter px for the colour
// (under a level of 8-bit colour a step), 1/64 of an octave for a grown dot; past where the look stops changing
// (fully greyed at 10 px, grown 2.2x) all sizes share one. Packed as cb + 1024 db (0: no far look).
const FAR = { colorStep: 4, dotStep: 64, base: 1024 };
function farBucket(s, ppu) {
  const px = Math.min(s.w, s.d) * ppu;
  const cb = s.farColor && px < 40 ? 1 + Math.round(Math.max(10, px) * FAR.colorStep) : 0;
  const db = s.minPx && px < s.minPx ? 1 + Math.round(Math.log2(Math.min(2.2, s.minPx / px)) * FAR.dotStep) : 0;
  return cb + FAR.base * db;
}
function farLookOf(s, bucket) {
  const cb = bucket % FAR.base, db = (bucket - cb) / FAR.base;
  return farLookAt(s, cb ? (cb - 1) / FAR.colorStep : Infinity, db ? s.minPx / 2 ** ((db - 1) / FAR.dotStep) : Infinity);
}
function mixSrgb(a, b, t) {
  const A = srgba(a), B = srgba(b);
  const h = (x) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, "0");
  return "#" + [0, 1, 2].map((k) => h(A[k] + (B[k] - A[k]) * t)).join("");
}
// the frame's solids, those standing in a plinth lifted onto it (copies: the DrawList is never changed)
function liftOnto(slabs, plinths) {
  return slabs.map((s) => {
    const k = s ? liftAt(plinths, s.x, s.y) : 0;
    return k > 1e-3 ? { ...s, z: num(s.z, 0) + k } : s;
  });
}
// token colours repeat endlessly: memoise string -> linear
const LIN = new Map();
function lin(c, fallback) {
  if (typeof c !== "string") return linear(c, fallback);
  let v = LIN.get(c);
  if (!v) { v = linear(c); if (LIN.size > 4096) LIN.clear(); LIN.set(c, v); }
  return v;
}
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
/**
 * The solids big enough to land on, bucketed in a uniform grid so each caster tests only the ones round it.
 * Rebuilt every frame into reused typed arrays: cell c holds list[items[head[c] .. head[c + 1]]].
 */
class ReceiverGrid {
  constructor() { this.list = []; this.head = new Int32Array(2); this.items = new Int32Array(256); this.gw = 0; this.gh = 0; }
  build() {
    const L = this.list;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of L) {
      q.rad = Math.hypot(q.hw, q.hd);
      if (!Number.isFinite(q.x + q.y + q.rad)) continue;            // never bucketed (its cell span is empty)
      x0 = Math.min(x0, q.x - q.rad); y0 = Math.min(y0, q.y - q.rad); x1 = Math.max(x1, q.x + q.rad); y1 = Math.max(y1, q.y + q.rad);
    }
    if (!(x1 >= x0 && y1 >= y0)) { this.gw = this.gh = 0; return; }
    let cell = 96;
    while ((x1 - x0) / cell * ((y1 - y0) / cell) > 65536) cell *= 2;      // a huge world: coarser cells, same answers
    const ox = Math.floor(x0 / cell), oy = Math.floor(y0 / cell);
    const gw = Math.floor(x1 / cell) - ox + 1, gh = Math.floor(y1 / cell) - oy + 1;
    Object.assign(this, { cell, ox, oy, gw, gh });
    if (this.head.length < gw * gh + 2) this.head = new Int32Array((gw * gh + 2) * 2);
    const head = this.head;
    head.fill(0, 0, gw * gh + 2);
    const span = (q, fn) => {
      const cx0 = Math.floor((q.x - q.rad) / cell) - ox, cx1 = Math.floor((q.x + q.rad) / cell) - ox;
      const cy0 = Math.floor((q.y - q.rad) / cell) - oy, cy1 = Math.floor((q.y + q.rad) / cell) - oy;
      for (let gy = cy0; gy <= cy1; gy++) for (let gx = cx0; gx <= cx1; gx++) fn(gy * gw + gx);
    };
    // count per cell (shifted by 2), prefix sums, then fill: head[c + 1] walks cell c's slots, ending at its end
    for (const q of L) span(q, (c) => head[c + 2]++);
    for (let c = 2; c < gw * gh + 2; c++) head[c] += head[c - 1];
    if (this.items.length < head[gw * gh + 1]) this.items = new Int32Array(head[gw * gh + 1] * 2);
    L.forEach((q, i) => span(q, (c) => { this.items[head[c + 1]++] = i; }));
  }
  /** The cell holding a point, or -1 outside the grid. */
  cellAt(x, y) {
    const gx = Math.floor(x / this.cell) - this.ox, gy = Math.floor(y / this.cell) - this.oy;
    return gx >= 0 && gy >= 0 && gx < this.gw && gy < this.gh ? gy * this.gw + gx : -1;
  }
}
// the same interface over a handful of receivers (one field machine's parts): one cell holding them all, which
// answers exactly as the grid does (its cells only narrow down who gets the exact test)
class OneCell {
  constructor() { this.list = []; this.head = new Int32Array(2); this.items = new Int32Array(8); }
  build() {
    const n = this.list.length;
    if (this.items.length < n) this.items = new Int32Array(n * 2);
    for (let i = 0; i < n; i++) this.items[i] = i;
    this.head[1] = n;
  }
  cellAt() { return 0; }
}
// the n highest-scoring lights, in the order a stable sort by descending score would give (no full sort of
// thousands of lights in a scale field)
function strongest(lights, n) {
  const out = [];
  for (const l of lights) {
    if (out.length === n && !(l.score > out[n - 1].score)) continue;
    let i = Math.min(out.length, n - 1);
    while (i > 0 && out[i - 1].score < l.score) i--;
    out.splice(i, 0, l);
    if (out.length > n) out.length = n;
  }
  return out;
}
// a well writeSlab packs (anything smaller collapses to a point, as if there were none)
const hasWell = (s) => !!(s.well && s.well.w > 0.5 && s.well.d > 0.5);
// LOD by size on screen (ppu: px per unit at the slab, its scale included), as an index into the pack's classes:
// tiny (a scale field's machines, a few px across: the coarsest template, which no one can tell apart at that
// size), small, large (round corners, wells, big things), each opaque slabs without a well first, then with one
const lodOf = (s, ppu) => {
  const rpx = num(s.r, 0) * ppu, wpx = Math.max(s.w, s.d) * ppu, k = hasWell(s) ? 1 : 0;
  if (wpx < LOD.tinyPx && rpx < LOD.tinyRadiusPx) return k;
  return (rpx > 9 || wpx > 260 || s.well ? 4 : 2) + k;
};
// a solid big enough to land on, as the receiver grid holds it (or null)
function receiverOf(s) {
  if (Math.min(s.w, s.d) < 18 || num(s.opacity, 1) <= 0.5) return null;
  const yaw = num(s.yaw, 0) * DEG, sc = num(s.scale, 1), qz = num(s.z, 0);
  let well = null;
  if (s.well && s.well.w > 0.5 && s.well.d > 0.5) {
    const dep = clamp(num(s.well.depth, SIZE.well.depth), 0.1, s.h - 0.3);
    well = { x: num(s.well.x, 0) * sc, y: num(s.well.y, 0) * sc, hw: s.well.w / 2 * sc, hd: s.well.d / 2 * sc, floor: qz + (s.h - dep) * sc };
  }
  return { s, x: s.x, y: s.y, z: qz, top: qz + s.h * sc, cs: Math.cos(yaw), sn: Math.sin(yaw), hw: s.w / 2 * sc, hd: s.d / 2 * sc, well };
}

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
    this.receivers = new ReceiverGrid();
    this.field = new FieldPack();
  }

  /**
   * @param {import("../contracts.mjs").DrawList} dl
   * @param {{ colors, atlas, cam, time, clock, focus, glass }} ctx  cam = cameraState(...) of this frame; glass: zones become
   *   glass plinths (a backend that draws them: their slabs come last, nGlass of them). time drives the shimmer
   *   (flowing dashes), clock (default: time) the memories that fade out (afterglow, pings); `fading` is then true
   *   while one is still fading, so the next frame differs
   */
  pack(dl, ctx) {
    const { colors, atlas, cam } = ctx;
    const time = ctx.time ?? 0, clock = ctx.clock ?? time;
    this.ink.reset(); this.inkTop.reset(); this.inkRaised.reset(); this.seg.reset(); this.groove.reset(); this.contact.reset(); this.slab.reset();
    this.bounce.reset();
    this.ids.length = 0;
    // time-based memories (afterglow, pings) only make sense going forward: a jump back or far ahead resets them
    this.frameNo = (this.frameNo ?? 0) + 1;
    if (this.lastTime == null || clock < this.lastTime - 1e-4 || clock - this.lastTime > 3) { this.glowMem.clear(); this.litMem.clear(); this.freshFrame = this.frameNo; }
    this.lastTime = clock;
    this.time = clock;
    this.fading = false;
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
    let slabs = extra.length ? dl.slabs.concat(extra) : dl.slabs;
    // glass: every titled, solid zone becomes a plinth; what stands in it rises onto its top
    const plinths = ctx.glass ? this.plinths(dl.zones, colors) : EMPTY;
    if (plinths.length) slabs = liftOnto(slabs, plinths).concat(plinths.map((q) => q.slab));
    const n = slabs.length;
    if (this.order.length < n) { this.order = new Int32Array(n * 2); this.depth = new Float32Array(n * 2); }

    // classify: opaque by LOD (lodOf), transparent (sorted back to front), glass
    const eye = cam.frame.eye, F = cam.frame.F, focal = cam.focalPx;
    const order = this.order, depth = this.depth;
    const lods = [[], [], [], [], [], []], trans = [], glass = [];
    for (let i = 0; i < n; i++) {
      const s = slabs[i];
      if (!s || !(s.w > 0) || !(s.d > 0) || !(s.h > 0)) continue;
      const op = num(s.opacity, 1);
      if (op <= 0.002) continue;
      const z = num(s.z, 0);
      const dz = (s.x - eye[0]) * F[0] + (s.y - eye[1]) * F[1] + (z + s.h / 2 - eye[2]) * F[2];
      depth[i] = dz;
      const ppu = focal / Math.max(1, dz) * num(s.scale, 1);
      if (s.farColor || s.minPx) { if (slabs === dl.slabs) slabs = slabs.slice(); slabs[i] = farLook(s, ppu); }
      if (s._glass) glass.push(i);
      else if (op < 0.999 || s.material === "glass") trans.push(i);
      else lods[lodOf(s, ppu)].push(i);
      const ext = Math.hypot(s.w, s.d) / 2 * num(s.scale, 1);
      grow(s.x - ext, s.y - ext, s.x + ext, s.y + ext, z + s.h);
    }
    // scale fields: their machines join the classes as refs < 0, their shadows, pings and lights go straight out
    const lights = [];
    for (const f of dl.fields ?? EMPTY) this.field.pack(f, this, { colors, atlas, cam, time }, lods, lights, grow);
    trans.sort((a, b) => depth[b] - depth[a]);
    const [tiny, tinyWell, small, smallWell, large, largeWell] = lods;
    const nTinySolid = tiny.length, nTiny = tiny.length + tinyWell.length, nSmallSolid = small.length, nLargeSolid = large.length;
    const nS = nTiny + small.length + smallWell.length, nL = large.length + largeWell.length, nT = trans.length;
    const all = tiny.concat(tinyWell, small, smallWell, large, largeWell, trans, glass);
    this.slab.reserve(all.length * SLAB_FLOATS);
    const A = this.slab.a;
    const receivers = this.receivers;
    receivers.list.length = 0;
    for (const i of all) {
      const q = i >= 0 ? receiverOf(slabs[i]) : null;
      if (q) receivers.list.push(q);
    }
    receivers.build();
    for (let k = 0; k < all.length; k++) {
      const i = all[k];
      if (i < 0) { this.field.write(A, k * SLAB_FLOATS, ~i); continue; }
      const s = slabs[i];
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
    const best = strongest(lights, LIGHT.maxPointLights);
    const nLights = best.length;
    for (let i = 0; i < nLights; i++) {
      const l = best[i];
      this.lightsPos.set([l.x, l.y, l.z, l.rad], i * 4);
      this.lightsCol.set([l.r * l.i, l.g * l.i, l.b * l.i, 0], i * 4);
    }

    // zones (below grooves), their titles (above)
    for (const z of dl.zones) this.zone(z, colors, atlas, grow, plinths.some((q) => q.zone === z));
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
      slabs: A, nSmall: nS, nLarge: nL, nTrans: nT, nGlass: glass.length, nSlabs: all.length,
      nTiny, nTinySolid, nSmallSolid, nLargeSolid, ids: this.ids,
      ink: this.ink.a, nInk: this.ink.n / INK_FLOATS, inkTop: this.inkTop.a, nInkTop: this.inkTop.n / INK_FLOATS,
      inkRaised: this.inkRaised.a, nInkRaised: this.inkRaised.n / INK_FLOATS,
      seg: this.seg.a, nSeg: this.seg.n / SEG_FLOATS, grooves: this.groove.a, nGrooves: gi,
      contact: this.contact.a, nContact: this.contact.n / CONTACT_FLOATS,
      lightsPos: this.lightsPos, lightsCol: this.lightsCol, nLights,
      bounce: this.bounce.a, nBounce: this.bounce.n / BOUNCE_FLOATS,
      bounds,
    };
  }

  // the glass plinths for this frame's zones: a titled zone with a solid border (a group) becomes one
  plinths(zones, colors) {
    const G = PRISM2.glass.zone, T = WORLD_TYPE.zone, out = [];
    for (const z of zones) {
      if (!z.title || z.borderStyle === "dashed" || num(z.opacity, 1) < 0.5 || !(z.w > 2 * G.ramp && z.d > 2 * G.ramp)) continue;
      const r = clamp(num(z.r, SIZE.zone.r), 0, Math.min(z.w, z.d) / 2);
      const slab = {
        x: z.x, y: z.y, z: 0, w: z.w, d: z.d, h: G.h, r, bevel: G.bevel, material: "glass", color: PRISM2.glass[colors.name === "light" ? "light" : "dark"].tint,
        shadow: false, _glass: true,
        label: { text: worldCase(z.title, T), font: T.font, weight: T.weight, size: T.size, tracking: T.tracking, align: "left",
          color: colors.P.ink, dx: -z.w / 2 + Math.max(12, r * 0.75), dy: -z.d / 2 + Math.max(9, T.size * 0.78) },
      };
      out.push({ zone: z, slab, hw: z.w / 2, hd: z.d / 2, r, h: G.h, ramp: G.ramp });
    }
    return out;
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
    if (hasWell(s)) {
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
    for (const L of s.label || s.label2 || s.label3 ? [s.label, s.label2, s.label3] : EMPTY) {
      if (!L || L.text == null || L.text === "" || nl >= 3) continue;
      if (this.label(A, o + 48 + nl * 16, L, s, w, d, bevel, colors, atlas)) nl++;
    }
    A[o + 43] = nl;

    // contact shadow and what it lands on
    const op = num(s.opacity, 1);
    let recvZ = 0, onSomething = z < 0.35, inTray = false;
    if (z >= 0.35) {
      const R = receivers, c = R.cellAt(s.x, s.y);
      for (let j = c < 0 ? 0 : R.head[c], end = c < 0 ? 0 : R.head[c + 1]; j < end; j++) {
        const q = R.list[R.items[j]];
        if (q.s === s || q.z > z) continue;
        const dx = s.x - q.x, dy = s.y - q.y;
        const lx = q.cs * dx + q.sn * dy, ly = -q.sn * dx + q.cs * dy;
        if (Math.abs(lx) > q.hw || Math.abs(ly) > q.hd) continue;
        let surf = q.top;
        const qw = q.well;
        if (qw && Math.abs(lx - qw.x) < qw.hw && Math.abs(ly - qw.y) < qw.hd) surf = qw.floor;
        if (surf <= z + 0.05 && surf > recvZ) { recvZ = surf; inTray = surf !== q.top && q.z >= 0.35; }
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
        // [11]: in the well of a raised tray (WebGPU draws its shadow there as a soft band)
        C[k + 8] = strength; C[k + 9] = recvZ; C[k + 10] = recvZ < 0.05 ? 1 : 0; C[k + 11] = inTray ? 1 : 0;
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
      if (a >= 0 && a < 1) { ages.push(a); this.fading = true; }
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

  zone(z, colors, atlas, grow, glass = false) {
    const P = colors.P;
    const op = num(z.opacity, 1);
    const fill = srgba(z.fill ?? P.zoneFill), border = srgba(z.border ?? P.zoneBorder);
    // a glass plinth stands on this zone: its edge is the border and its title is etched into the glass
    if (glass) { border[3] = 0; fill[3] = 0; z = { ...z, title: undefined }; }
    const r = clamp(num(z.r, SIZE.zone.r), 0, Math.min(z.w, z.d) / 2);
    const dashed = z.borderStyle === "dashed";
    this.inkInst(this.ink, z.x, z.y, z.w / 2, z.d / 2, 1, 0, r, INK.zone,
      fill[0], fill[1], fill[2], fill[3] * op, num(z.borderWidth, 1), dashed ? 6 : 0, dashed ? 5 : 0, 0,
      border[0], border[1], border[2], border[3] * op);
    grow(z.x - z.w / 2, z.y - z.d / 2, z.x + z.w / 2, z.y + z.d / 2);
    // the zone's name: a calm printed label in the HUD's family, sentence case, set in from the corner
    if (z.title) {
      const T = WORLD_TYPE.zone;
      // in ink, a little quieter than a housing's title, so the stage reads as a name and not as a caption
      const tc = dashed ? border : srgba(P.ink);
      this.text({
        x: z.x - z.w / 2 + Math.max(12, r * 0.75), y: z.y - z.d / 2 + Math.max(9, T.size * 0.78), text: worldCase(z.title, T), size: T.size,
        font: T.font, weight: T.weight, tracking: T.tracking, align: "left", color: [tc[0], tc[1], tc[2], Math.min(1, dashed ? tc[3] + 0.35 : 0.66)],
        opacity: op,
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
        else { const k = (1 - a) * (1 - a); glow = Math.max(glow, m.v * GLOW.afterLevel * k); if (!glowColor) glowColor = m.color; this.fading = true; }
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

/**
 * Scale fields (skin.mjs dl.fields): thousands of copies of one machine. Each machine's packed slabs, contact shadows,
 * colour bounce, pings and lights are kept with the skin version and the far-look buckets (farBucket) that made them
 * and replayed while both hold: only machines whose state changed (rising, a task finishing, the work wave) or whose
 * size on screen crossed a bucket are packed again. A replay is exactly what packing afresh would give, so no frame
 * depends on the ones before it. Field machines are opaque and stand alone (nothing lands on them but their own parts).
 */
class FieldPack {
  constructor() { this.memo = null; this.key = ""; this.per = 3; this.scratch = null; this.far = []; this.receivers = new OneCell(); }

  reset(f, key) {
    const n = f.n, M = this.per;
    this.memo = f.memo; this.key = key;
    this.ver = new Uint32Array(n);                         // the skin version each machine was packed from (0: none)
    this.bucket = new Float64Array(n * M).fill(-1);
    this.A = new Float32Array(n * M * SLAB_FLOATS);        // slab j of machine k at (k * M + j) * SLAB_FLOATS
    this.views = new Array(n * M).fill(null);             // ... and as a view, made once
    this.box = new Float32Array(n * 5);                    // machine k's bounds: minX minY maxX maxY maxZ
    this.out = new Array(n).fill(null);                   // what it sends out: { contact, bounce, inkTop, inkRaised, lights }
  }

  /** Classify the field's slabs into `lods` (as refs ~slot), and send its shadows, bounce, pings and lights out. */
  pack(f, P, { colors, atlas, cam, time }, lods, lights, grow) {
    let most = 0;
    for (const sl of f.slabs) if (sl && sl.length > most) most = sl.length;
    const key = colors.name + (P.reduced ? " reduced" : "");
    if (f.memo !== this.memo || key !== this.key || most > this.per) { this.per = Math.max(this.per, most); this.reset(f, key); }
    const M = this.per, eye = cam.frame.eye, F = cam.frame.F, focal = cam.focalPx, B = this.box;
    const cls = this.cls ??= [];
    for (let k = 0; k < f.n; k++) {
      const sl = f.slabs[k];
      if (!sl) continue;
      let packed = this.ver[k] === f.version[k];
      // each slab's size on screen: its LOD class, and the bucket its far look is judged from
      for (let j = 0; j < sl.length; j++) {
        const s = sl[j];
        const dz = (s.x - eye[0]) * F[0] + (s.y - eye[1]) * F[1] + (num(s.z, 0) + s.h / 2 - eye[2]) * F[2];
        const ppu = focal / Math.max(1, dz) * num(s.scale, 1);
        const b = s.farColor || s.minPx ? farBucket(s, ppu) : 0;
        if (this.bucket[k * M + j] !== b) { this.bucket[k * M + j] = b; packed = false; }
        cls[j] = lodOf(s, ppu);
      }
      if (!packed) this.repack(k, sl, f.version[k], P, colors, atlas, time);
      for (let j = 0; j < sl.length; j++) lods[cls[j]].push(~(k * M + j));
      grow(B[5 * k], B[5 * k + 1], B[5 * k + 2], B[5 * k + 3], B[5 * k + 4]);
      const o = this.out[k];
      if (o) this.emit(o, P, lights);
    }
  }

  // pack machine k afresh: its slabs at their buckets' far look, landing on each other, through writeSlab
  repack(k, sl, version, P, colors, atlas, time) {
    const S = this.scratch ??= new Packer(), M = this.per, B = this.box;
    S.contact.reset(); S.bounce.reset(); S.inkTop.reset(); S.inkRaised.reset(); S.ids.length = 0;
    S.reduced = P.reduced; S.time = P.time;
    const far = this.far;
    far.length = 0;
    B[5 * k] = B[5 * k + 1] = Infinity; B[5 * k + 2] = B[5 * k + 3] = -Infinity; B[5 * k + 4] = 0;
    for (let j = 0; j < sl.length; j++) {
      const s = sl[j], b = this.bucket[k * M + j];
      far.push(b ? farLookOf(s, b) : s);
      // the bounds the pack grows by (as for any slab: its own scale, before the far look)
      const ext = Math.hypot(s.w, s.d) / 2 * num(s.scale, 1);
      B[5 * k] = Math.min(B[5 * k], s.x - ext); B[5 * k + 1] = Math.min(B[5 * k + 1], s.y - ext);
      B[5 * k + 2] = Math.max(B[5 * k + 2], s.x + ext); B[5 * k + 3] = Math.max(B[5 * k + 3], s.y + ext);
      B[5 * k + 4] = Math.max(B[5 * k + 4], num(s.z, 0) + s.h);
    }
    const R = this.receivers;
    R.list.length = 0;
    for (const s of far) { const q = receiverOf(s); if (q) R.list.push(q); }
    R.build();
    const lights = [];
    for (let j = 0; j < far.length; j++) S.writeSlab(this.A, (k * M + j) * SLAB_FLOATS, far[j], colors, atlas, R, lights, time);
    const kept = (pool) => (pool.n ? pool.a.slice(0, pool.n) : null);
    const o = { contact: kept(S.contact), bounce: kept(S.bounce), inkTop: kept(S.inkTop), inkRaised: kept(S.inkRaised), lights: lights.length ? lights : null };
    this.out[k] = o.contact || o.bounce || o.inkTop || o.inkRaised || o.lights ? o : null;
    this.ver[k] = version;
  }

  // a machine's shadows, bounce, pings and lights into this frame
  emit(o, P, lights) {
    const put = (pool, src) => { if (src) { const at = pool.reserve(src.length); pool.a.set(src, at); } };
    put(P.contact, o.contact); put(P.bounce, o.bounce); put(P.inkTop, o.inkTop); put(P.inkRaised, o.inkRaised);
    if (o.lights) for (const l of o.lights) lights.push(l);
  }

  /** Slab `slot` (a ref's ~) into the frame's slab array at o. */
  write(A, o, slot) { A.set(this.views[slot] ??= this.A.subarray(slot * SLAB_FLOATS, (slot + 1) * SLAB_FLOATS), o); }
}
