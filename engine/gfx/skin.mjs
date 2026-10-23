// Skin: semantic poses (CONTRACTS.md 4.6) -> styled primitives (contracts.mjs DrawList), per DESIGN.md
// section 5. The only place that knows how each kind of thing looks. Pure and DOM-free (runs in Node).
//
//   skin(poses, drawList, { theme, time, pxPerUnit }) -> drawList
//
// The scene decides where things are and what state they are in; the skin adds the purely visual
// offsets: z += MOTION.litRise * lit, emission from flash, rim from lit, LED blinking from time, key index
// to colour, tone to colour.
import { PALETTE, SIZE, MOTION, ACCENT, GLOW, WORLD_TYPE, keyColor, worldCase } from "../tokens.mjs";

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const DEG = Math.PI / 180;

// cubic-bezier easing (x1, y1, x2, y2) evaluated by Newton iterations on x
export function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; t = clamp(t, 0, 1); }
    return Y(t);
  };
}
const ease = bezier(MOTION.ease);

const SUB = { size: 1.08, opacity: 0.9 };   // a tile's sub-label, relative to SIZE.*.sub
const STATUS = new Set(["ok", "busy", "warn", "fail", "idle"]);

/** Body colour and ink for a tile-like pose. */
export function toneColors(theme, pose) {
  const P = PALETTE[theme];
  const tone = pose.tone ?? (pose.key != null ? "key" : "neutral");
  // a ghost is an empty slot; one that still says something (null, 0) prints it in muted ink so it reads
  if (tone === "ghost") return { body: P.ghost, ink: pose.kind === "bit" ? P.inkFaint : P.inkMuted, keyed: false, ghost: true };
  if (STATUS.has(tone)) { const body = tone === "idle" ? P.idle : P[tone]; return { body, ink: inkOn(body, P), keyed: true }; }
  if (tone === "key" && pose.key != null) {
    const k = typeof pose.key === "number" ? pose.key : hashKey(pose.key);
    { const body = keyColor(theme, k); return { body, ink: inkOn(body, P), keyed: true }; }
  }
  return { body: P.tile, ink: P.tileInk, keyed: false };
}
// a non-numeric key that reached the skin still gets a stable colour
function hashKey(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 8; }
const keyCol = (theme, key) => keyColor(theme, typeof key === "number" ? key : hashKey(key ?? 0));
const toneCol = (theme, tone, key) => {
  const P = PALETTE[theme];
  if (tone && STATUS.has(tone)) return P[tone];
  if (key != null) return keyCol(theme, key);
  return null;
};

// rotate a local offset by a yaw (deg) and add the origin
const at = (p, dx, dy) => {
  const a = num(p.yaw, 0) * DEG, c = Math.cos(a), s = Math.sin(a);
  return [p.x + c * dx - s * dy, p.y + s * dx + c * dy];
};

// common attention / state styling shared by solids; `calm` styles the pose as if it were neither lit nor
// flashing (a housing carries those on its rim and accent instead)
function attention(pose, slab, theme, { keyed, body }, calm = false) {
  const P = PALETTE[theme];
  const lit = calm ? 0 : clamp(num(pose.lit, 0), 0, 1), flash = calm ? 0 : clamp(num(pose.flash, 0), 0, 1), dim = clamp(num(pose.dim, 0), 0, 1);
  slab.z = num(slab.z, 0) + MOTION.litRise * lit;
  if (lit > 0) slab.rim = Math.max(num(slab.rim, 0), lit);
  let e = num(slab.emissive, 0);
  if (theme === "dark") {
    e += 0.16 * lit + (keyed ? 0.55 : 1.0) * flash;
    if (flash > 0 && !keyed) slab.emissiveColor = P.lit;
  } else {
    e += 0.25 * lit + 0.6 * flash * (keyed ? 1 : 0);
    if (flash > 0 && !keyed) slab.rim = Math.max(num(slab.rim, 0), flash * 0.8);
  }
  if (e > 0) { slab.emissive = e; if (!slab.emissiveColor) slab.emissiveColor = body; }
  if (dim > 0) slab.desaturate = Math.max(num(slab.desaturate, 0), dim * 0.85);
  const outline = pose.selected ? 1 : pose.hover ? 0.45 : 0;
  if (outline) slab.outline = outline;
  if (pose.opacity != null) slab.opacity = pose.opacity;
  // tilt: pose.pitch about local x, pose.bank about local y (pose.roll is the value-roll progress, not a tilt)
  for (const k of ["yaw", "pitch", "scale"]) if (pose[k] != null) slab[k] = pose[k];
  if (pose.bank != null) slab.roll = pose.bank;
  return slab;
}

// labels for a value that may be rolling (odometer): new text rises in, old slides up and fades
function rollingLabels(base, text, textOut, roll, size) {
  const r = clamp(num(roll, 1), 0, 1);
  if (textOut == null || textOut === text || r >= 1) return [{ ...base, text }];
  const u = ease(r), lift = size * 1.15, clip = { half: size * 0.78, y: num(base.dy, 0) };
  return [
    { ...base, text, dy: num(base.dy, 0) + (1 - u) * lift, opacity: num(base.opacity, 1) * u, clip },
    { ...base, text: textOut, dy: num(base.dy, 0) - u * lift, opacity: num(base.opacity, 1) * (1 - u), clip },
  ];
}
function assignLabels(slab, labels) {
  if (labels[0]) slab.label = labels[0];
  if (labels[1]) slab.label2 = labels[1];
  if (labels[2]) slab.label3 = labels[2];
  return slab;
}

// --- kinds ------------------------------------------------------------------------------------------------

function housing(p, dl, ctx) {
  const { theme, time } = ctx;
  const P = PALETTE[theme], H = SIZE.housing;
  const vname = SIZE.variant[p.variant] ? p.variant : "node";
  const v = SIZE.variant[vname];
  const round = v.r === "round";
  let w = num(p.w, H.minW), d = num(p.d, H.minD);
  if (round) { const m = Math.max(w, d); w = m; d = m; }
  const h = num(p.h, v.h), bevel = v.bevel;
  const r = round ? w / 2 : Math.min(num(p.r, v.r), Math.min(w, d) / 2);
  const z = num(p.z, 0);
  const inset = SIZE.well.inset;
  // the tray: the scene's rect, or the default one under the header
  let tray = p.tray;
  if (!tray) {
    if (round) { const dia = w - 2 * (inset + 9); tray = { x: 0, y: 4, w: dia, d: dia }; }
    else tray = { x: 0, y: (H.header - inset) / 2, w: w - 2 * inset, d: d - H.header - inset };
  }
  const roundWell = round || vname === "store" || !!tray.round;
  const well = {
    x: tray.x, y: tray.y, w: tray.w, d: tray.d,
    r: roundWell ? Math.min(tray.w, tray.d) / 2 : Math.min(vname === "queue" ? SIZE.well.r * 0.8 : SIZE.well.r, Math.min(tray.w, tray.d) / 2),
    depth: SIZE.well.depth, lip: SIZE.well.lip, color: P.well,
  };
  const body = vname === "store" || vname === "client" ? P.housingAlt : P.housing;

  const top = -d / 2, trayTop = tray.y - tray.d / 2, trayBottom = tray.y + tray.d / 2;
  const headerY = round ? (top + trayTop) / 2 : top + Math.min(H.header, Math.max(10, trayTop - top)) / 2;
  // farColor: white ceramic seen from far off (a scale field) would melt into the white studio; the packer greys it
  // toward this as it shrinks to a few px on screen
  const slab = { id: p.id, x: p.x, y: p.y, z, w, d, h, r, bevel, color: body, material: "matte", well, farColor: P.farHousing };

  const pad = H.pad + (round ? 0 : Math.max(0, r - H.pad) * 0.35);
  const ledR = H.led;
  const labels = [];
  // the title names the thing (Geist, the HUD's family); the sub-label is data (an address, a count) in Geist Mono
  const T = WORLD_TYPE.title, Sb = WORLD_TYPE.sub;
  if (p.title) {
    const t = { text: p.title, font: T.font, weight: T.weight, size: T.size, tracking: T.tracking, color: P.ink, dy: headerY };
    labels.push(round ? { ...t, align: "center", dx: 0 } : { ...t, align: "left", dx: -w / 2 + pad });
  }
  if (p.sub) {
    const t = { text: p.sub, font: Sb.font, weight: Sb.weight, size: Sb.size, tracking: Sb.tracking, color: P.inkMuted };
    labels.push(round
      ? { ...t, align: "center", dx: 0, dy: (trayBottom + d / 2) / 2 }
      : { ...t, align: "right", dx: w / 2 - pad - (p.led ? ledR * 2 + 6 : 0), dy: headerY });
  }
  assignLabels(slab, labels);

  // meter inlay: in the margin under the tray when there is room, else in the header
  if (p.meter != null) {
    const below = d / 2 - trayBottom;
    const mc = p.key != null ? keyCol(theme, p.key) : P.busy;
    if (below >= 7 && !round) slab.meter = { x: tray.x, y: (trayBottom + d / 2 - bevel) / 2 + 0.3, w: tray.w - 4, d: SIZE.meter.h, value: clamp(p.meter, 0, 1), color: mc };
    else slab.meter = { x: round ? 0 : w * 0.12, y: round ? (trayBottom + d / 2) / 2 + (p.sub ? 7 : 0) : headerY, w: round ? w * 0.34 : w * 0.26, d: SIZE.meter.h, value: clamp(p.meter, 0, 1), color: mc };
  }
  const lit = clamp(num(p.lit, 0), 0, 1), flash = clamp(num(p.flash, 0), 0, 1);
  attention(p, slab, theme, { keyed: false, body }, true);
  // status accent: a thin light strip along the header's bottom edge (a ring round a round well) plus a faint
  // matching rim, driven by led (crossfading ledPrev -> led over ledMix), else a status tone
  const acc = accentOf(p, P, time, lit);
  if (acc) {
    const fail = acc.fail;
    slab.accent = round || roundWell && !(trayTop - top > 12)
      ? { color: acc.color, level: acc.level * ACCENT.ring, mode: "ring", gap: 2.6, half: ACCENT.strip / 2, rim: acc.rim }
      : { color: acc.color, level: acc.level, mode: "line", y: Math.max(top + bevel + 2, trayTop - ACCENT.gap), half: ACCENT.strip / 2,
          len: Math.max(8, tray.w / 2 - 2), x: tray.x, rim: acc.rim };
    if (fail > 0) {
      slab.desaturate = Math.max(num(slab.desaturate, 0), ACCENT.crash.desaturate * fail);
      slab.darken = ACCENT.crash.darken[theme] * fail;
    }
    // a lit (leader-like) housing throws a soft pool of its accent onto the floor round its foot
    if (lit > 0 && acc.level > 0.3) {
      dl.light({ x: p.x, y: p.y, z: 1.5, color: acc.color, intensity: ACCENT.pool.intensity * lit * (theme === "dark" ? 1 : 0.8),
        radius: Math.max(w, d) * ACCENT.pool.radius + 30 });
    }
  }
  // a big dark body would glow like a lamp: housings flash and light up through their bevel rim only
  const rimA = Math.max(lit * 0.55, flash * 0.6);
  if (rimA > 0) slab.rim = Math.max(num(slab.rim, 0), rimA);
  slab.z = z;
  dl.slab(slab);

  // status LED: a small emissive puck set into the header; ledPrev -> led crossfades over ledMix
  if (p.led && p.led !== "none") {
    const a = ledLook(P, p.led, time), b = p.ledPrev && p.ledPrev !== p.led ? ledLook(P, p.ledPrev, time) : null;
    const m = b ? clamp(num(p.ledMix, 1), 0, 1) : 1;
    const col = b ? mixHex(b.col, a.col, m) : a.col;
    const e = b ? b.e + (a.e - b.e) * m : a.e, light = b ? b.light + (a.light - b.light) * m : a.light;
    const [lx, ly] = round ? at(p, (tray.x + tray.w / 2 + w / 2) / 2, tray.y) : at(p, w / 2 - pad - ledR, headerY);
    dl.slab({
      id: p.id, x: lx, y: ly, z: z + h - 0.5, w: ledR * 2, d: ledR * 2, h: 1.5, r: ledR, bevel: 0.7,
      color: col, material: "ceramic", emissive: e, emissiveColor: col, light: light > 0.5 ? light : 0,
      opacity: p.opacity, minPx: 1.4,       // from afar (a scale field) it stays a readable dot: the packer grows it
    });
  }
  // chips: fine pins printed on the board along every edge
  if (vname === "chip") {
    const pc = P.metal, step = 5.5, len = 3.2, gap = 0.6, op = 0.55 * num(p.opacity, 1);
    const ex = Math.max(0, w - 2 * r - 2), ey = Math.max(0, d - 2 * r - 2);
    const nx = Math.floor(ex / step) * step, ny = Math.floor(ey / step) * step;
    dl.tick({ x: p.x - nx / 2, y: p.y - d / 2 - gap, length: nx, axis: "x", every: step, major: 1e6, size: len, side: "far", color: pc, opacity: op });
    dl.tick({ x: p.x - nx / 2, y: p.y + d / 2 + gap, length: nx, axis: "x", every: step, major: 1e6, size: len, side: "near", color: pc, opacity: op });
    dl.tick({ x: p.x - w / 2 - gap, y: p.y - ny / 2, length: ny, axis: "y", every: step, major: 1e6, size: len, side: "far", color: pc, opacity: op });
    dl.tick({ x: p.x + w / 2 + gap, y: p.y - ny / 2, length: ny, axis: "y", every: step, major: 1e6, size: len, side: "near", color: pc, opacity: op });
  }
}

// the accent's colour and level from led (with its crossfade) or a status tone; fail breathes slowly
function accentLevel(P, st, time) {
  if (!st || st === "none" || !(st in ACCENT.level)) return null;
  let level = ACCENT.level[st];
  if (st === "fail") level *= 0.72 + 0.28 * Math.cos(2 * Math.PI * ACCENT.failHz * num(time, 0));
  return { col: st === "off" ? P.off : P[st], level, fail: st === "fail" ? 1 : 0 };
}
function accentOf(p, P, time, lit) {
  const cur = p.led && p.led !== "none" ? p.led : STATUS.has(p.tone) ? p.tone : null;
  const a = accentLevel(P, cur, time);
  if (!a) return null;
  const b = p.led && p.ledPrev && p.ledPrev !== p.led ? accentLevel(P, p.ledPrev, time) : null;
  const m = b ? clamp(num(p.ledMix, 1), 0, 1) : 1;
  const color = b ? mixHex(b.col, a.col, m) : a.col;
  let level = b ? b.level + (a.level - b.level) * m : a.level;
  const fail = b ? b.fail + (a.fail - b.fail) * m : a.fail;
  level *= 1 + (ACCENT.lit - 1) * lit;
  return { color, level, fail, rim: ACCENT.rim * Math.min(1.6, level) };
}

function ledLook(P, st, time) {
  if (st === "ok") return { col: P.ok, e: 1.35, light: 15 };
  if (st === "busy") return { col: P.busy, e: 1.5, light: 15 };
  if (st === "warn") return { col: P.warn, e: 1.45, light: 15 };
  if (st === "fail") {
    // 1.6 Hz, soft-edged square wave so it reads as a blink, not a pulse
    const ph = 0.5 + 0.5 * Math.cos(2 * Math.PI * 1.6 * num(time, 0));
    const on = clamp((ph - 0.3) / 0.4, 0, 1), k = on * on * (3 - 2 * on);
    return { col: P.fail, e: 0.12 + 2.1 * k, light: 18 * (0.25 + 0.75 * k) };
  }
  if (st === "idle") return { col: P.idle, e: 0.1, light: 0 };
  return { col: P.off, e: 0, light: 0 };
}
function mixHex(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * t);
  return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

function tileLike(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme];
  const S = SIZE[p.kind] ?? SIZE.tile;
  const w = num(p.w, S.w), d = num(p.d, S.d), h = num(p.h, S.h);
  const tc = toneColors(theme, p.kind === "bit" && p.tone == null ? { ...p, tone: String(p.text) === "0" ? "ghost" : p.tone } : p);
  const slab = {
    id: p.id, x: p.x, y: p.y, z: num(p.z, 0), w, d, h, r: Math.min(S.r, Math.min(w, d) / 2), bevel: S.bevel,
    color: tc.body, material: tc.ghost ? "matte" : "ceramic",
  };
  const size = S.label;
  const labels = [];
  if (p.kind === "record") {
    // key · value: key left in key ink, value right in a lighter weight
    let key = p.text, val = p.sub, valOut = p.textOut;
    if (val == null && typeof key === "string" && key.includes("·")) { const [a, b] = key.split("·"); key = a.trim(); val = b.trim(); }
    if (typeof valOut === "string" && valOut.includes("·")) valOut = valOut.split("·")[1].trim();
    const m = Math.max(5.5, S.r + 0.5);
    const K = WORLD_TYPE.key, Vt = WORLD_TYPE.value;
    if (key != null && key !== "") labels.push({ text: String(key), font: K.font, weight: K.weight, size, color: tc.ink, align: "left", dx: -w / 2 + m, dy: 0 });
    if (val != null && val !== "") labels.push(...rollingLabels({ font: Vt.font, weight: Vt.weight, size, color: tc.ink, opacity: Vt.opacity, align: "right", dx: w / 2 - m, dy: 0 },
      String(val), valOut == null ? null : String(valOut), p.roll, size));
  } else {
    const hasSub = p.sub != null && p.sub !== "" && S.sub;
    const dy = hasSub ? -d * 0.1 : 0;
    if (p.text != null && p.text !== "") labels.push(...rollingLabels({ font: "mono", weight: 500, size, color: tc.ink, align: "center", dx: 0, dy },
      String(p.text), p.textOut == null ? null : String(p.textOut), p.roll, size));
    // the field name under the value (value, next): quieter than the value, but still a readable print
    if (hasSub) labels.push({ text: String(p.sub), font: "mono", weight: 500, size: S.sub * SUB.size, color: tc.ink, opacity: tc.ghost ? 0.8 : SUB.opacity, align: "center", dx: 0, dy: d * 0.27 });
  }
  assignLabels(slab, labels.slice(0, 3));
  attention(p, slab, theme, tc);
  if (tc.ghost) slab.shadow = num(slab.opacity, 1) > 0.5;
  // arrival ping: a quick ring of light on whatever the tile sits on (flash drives it; the renderer adds one
  // on a lit rising edge)
  if (!tc.ghost && (num(p.flash, 0) > 0.01 || num(p.lit, 0) > 0)) {
    slab.ping = { flash: clamp(num(p.flash, 0), 0, 1), lit: clamp(num(p.lit, 0), 0, 1), color: tc.keyed ? tc.body : PALETTE[theme].lit, z: num(p.z, 0) };
  }
  dl.slab(slab);
}

// --- scale fields -------------------------------------------------------------------------------------------
// A scale field (scene/scale.mjs) is one pose for thousands of copies of one machine: their places (xy) and a state
// row each (state, FIELD_ROW numbers: z, led, ledPrev, ledMix, page z, page flash; NaN z: not risen). Each machine is
// dressed as a housing of the run's silhouette with its piece of input in the tray, and its slabs are kept with the
// row that made them, remade only when it changes (rising, a task finishing, the work wave). They go to the packer
// in dl.fields (with a version per machine, so it can cache their packed form too); their lights and ticks go to the
// DrawList as usual. Field machines never fail, so nothing here depends on time.
const FIELD_ROW = 6;
const fieldMemo = new WeakMap();      // field.xy -> { theme, rows, version, slabs, extras }
const sameNum = (a, b) => a === b || (a !== a && b !== b);

function field(p, dl, ctx) {
  const n = p.n, rows = p.state;
  let m = fieldMemo.get(p.xy);
  if (!m || m.theme !== ctx.theme || m.rows.length !== rows.length) {
    m = { theme: ctx.theme, rows: new Float64Array(rows.length).fill(NaN), version: new Uint32Array(n), slabs: new Array(n).fill(null), extras: new Array(n).fill(null) };
    fieldMemo.set(p.xy, m);
  }
  for (let k = 0, o = 0; k < n; k++, o += FIELD_ROW) {
    let same = true;
    for (let j = 0; j < FIELD_ROW && same; j++) same = sameNum(rows[o + j], m.rows[o + j]);
    if (!same) {
      m.rows.set(rows.subarray(o, o + FIELD_ROW), o);
      m.version[k]++;
      dressMachine(p, k, rows, o, m, ctx);
    }
    const ex = m.extras[k];
    if (ex) { for (const l of ex.lights) dl.light(l); for (const t of ex.ticks) dl.tick(t); }
  }
  (dl.fields ??= []).push({ n, version: m.version, slabs: m.slabs, memo: m });
}
// one field machine's slabs (and any lights or ticks) from its state row, through the housing and page skins
function dressMachine(p, k, rows, o, m, ctx) {
  if (rows[o] !== rows[o]) { m.slabs[k] = null; m.extras[k] = null; return; }
  const { w, d, h, variant } = p.like, x = p.xy[2 * k], y = p.xy[2 * k + 1];
  const out = { slabs: [], lights: [], ticks: [], slab(s) { this.slabs.push(s); }, light(l) { this.lights.push(l); }, tick(t) { this.ticks.push(t); } };
  const pose = { id: null, kind: "housing", variant, x, y, z: rows[o], w, d, h, title: null, sub: null, led: p.leds[rows[o + 1]], opacity: 1, lit: 0, flash: 0, dim: 0 };
  if (rows[o + 2] >= 0) { pose.ledPrev = p.leds[rows[o + 2]]; pose.ledMix = rows[o + 3]; }
  housing(pose, out, ctx);
  const pz = rows[o + 4];
  if (pz === pz) {
    const pg = p.page;
    tileLike({ id: null, kind: "page", x, y: y + pg.dy, z: pz, w: pg.w, d: pg.d, h: pg.h, text: "", tone: "busy", opacity: 1, lit: 0, flash: rows[o + 5], dim: 0 }, out, ctx);
  }
  m.slabs[k] = out.slabs;
  m.extras[k] = out.lights.length || out.ticks.length ? { lights: out.lights, ticks: out.ticks } : null;
}

function packet(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme], S = SIZE.packet;
  const col = toneCol(theme, p.tone, p.key) ?? P.lit;
  const op = num(p.opacity, 1);
  const lane = p.variant === "lane";
  const k = lane ? 0.62 : 1;
  // in light theme an un-keyed packet is ink: a body with no halo and no pool (ink light would be grey haze)
  const inkOnly = theme === "light" && col === P.lit;
  const w = num(p.w, S.w) * k, d = num(p.d, S.d) * k, h = num(p.h, S.h) * k;
  const z = p.z == null ? S.lift : p.z;
  dl.slab({
    id: p.id, x: p.x, y: p.y, z, w, d, h, r: d / 2, bevel: Math.min(2.1, h * 0.48), yaw: num(p.yaw, 0), pitch: p.pitch, roll: p.bank,
    color: col, emissiveColor: col, emissive: inkOnly ? 0 : 2.2 * op * (1 - 0.7 * num(p.dim, 0)), light: inkOnly ? 0 : S.light * (lane ? 0.6 : 1), material: "ceramic", opacity: op,
    scale: p.scale,
  });
}

// pulse intensity: scene sends 0..1 (1 = a travelling record); the renderer wants HDR emission
const PULSE = GLOW.pulse;
function pulsesOf(list, p, theme) {
  return (list ?? []).map((q) => ({
    s0: num(q.s0, 0), s1: num(q.s1, 0), intensity: num(q.intensity, 1) * PULSE,
    a0: num(q.a0, 0), a1: num(q.a1, 1),
    color: q.color ?? toneCol(theme, q.tone, q.key ?? p.key) ?? PALETTE[theme].lit,
  }));
}

function polylines(points) {
  if (!points || !points.length) return [];
  return Array.isArray(points[0][0]) ? points : [points];
}

// ink that reads on a coloured body: whichever of near-black (keyInk) and white has the higher WCAG contrast
// on it. The crossover sits near relative luminance 0.18, so every identity colour takes dark ink, like a keycap.
export function inkOn(hexc, P) {
  const L = relLum(hexc);
  const dark = P.keyInk ?? "#0B0C0F";
  return contrast(L, relLum(dark)) >= contrast(L, 1) ? dark : "#FFFFFF";
}
const LUM = new Map();      // token colours repeat endlessly: memoise
function relLum(hexc) {
  let L = LUM.get(hexc);
  if (L !== undefined) return L;
  const n = parseInt(String(hexc).slice(1), 16);
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  if (LUM.size > 4096) LUM.clear();
  LUM.set(hexc, L);
  return L;
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

function trace(p, dl, ctx, width) {
  const { theme } = ctx;
  const P = PALETTE[theme];
  const pulses = pulsesOf(p.pulses, p, theme);
  const keyC = toneCol(theme, p.tone === "key" ? null : p.tone, p.key) ?? pulses[0]?.color;
  const print = p.variant === "print" || p.style === "print";
  const message = p.variant === "message";
  const style = print ? "print" : p.style === "wire" || p.style === "rail" ? p.style : "groove";
  const dim = clamp(num(p.dim, 0), 0, 1);
  // a carrying trace glows faintly in the data's colour (pose.glow 0..1)
  // a carrying trace becomes a light tube in the data's colour (pose.glow 0..1)
  // a status tone (s.set(trace, { tone: "fail" })) keeps a faint glow in that colour even while idle
  // so does a keyed trace (s.trace(id, a, b, { key })): an identity tint, e.g. a pointer in its target's colour
  const toned = !print && !message && keyC && ((p.tone && p.tone !== "key" && p.tone !== "neutral") || (p.kind === "trace" && p.key != null));
  const glow = Math.max(clamp(num(p.glow, pulses.length ? 0.6 : 0), 0, 1), toned ? 0.35 : 0) * GLOW.trace * (1 - dim);
  const w = print ? 1.3 : message ? Math.min(width, 2.6) : width;
  const opacity = num(p.opacity, 1) * (1 - 0.5 * dim) * (print ? 0.85 : 1);
  const lines = polylines(p.points);
  for (const pts of lines) {
    if (!pts || pts.length < 2) continue;
    dl.groove({
      id: p.id, points: pts, width: w, style, pulses, grow: p.grow,
      glow, glowColor: keyC,
      dash: p.dashed ? [6, 5] : undefined, flow: p.dashed ? 16 : undefined,
      opacity,
      color: print ? keyC ?? P.inkFaint : undefined,
    });
  }
  // direction: an inlaid chevron cut at the receiving port (both ports for "both"), in the trace's own groove and
  // light; it lights up as something arrives through it
  const arrow = p.kind === "trace" && !print && !message ? p.arrow : null;
  const pts = lines[lines.length - 1];
  if ((arrow === "end" || arrow === "both" || arrow === true) && pts && pts.length >= 2) {
    const grown = p.grow == null ? 1 : clamp((num(p.grow, 1) - 0.86) / 0.14, 0, 1);
    if (grown > 0) {
      const ends = arrow === "both" ? [1, 0] : [1];
      for (const end of ends) {
        const ch = chevron(pts, end, ctx.pxPerUnit, w);
        if (!ch) continue;
        // a pulse whose head is near this end lights the chevron as it lands
        let land = 0;
        for (const q of pulses) {
          const head = end ? q.s1 : ch.total - q.s1;
          land = Math.max(land, q.intensity * clamp(1 - Math.abs(ch.total - head) / ARROW.landing, 0, 1));
        }
        dl.groove({
          id: p.id, points: ch.points, width: w, style, glowColor: keyC ?? pulses[0]?.color,
          glow: Math.min(4, glow * ARROW.glow + land * 0.6),
          opacity: opacity * grown,
        });
      }
    }
  }
}

// the chevron's size in u: big enough to read at the frame's scale, never a clip-art triangle
const ARROW = { len: 6.2, minPx: 8, maxLen: 10, spread: 0.78, back: 1.6, glow: 1.35, landing: 26 };
/** Chevron polyline at one end of a polyline (end 1: the last point, 0: the first), pointing out of the line. */
export function chevron(pts, end, pxPerUnit = 1, width = SIZE.trace.w) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const L = clamp(Math.max(ARROW.len, ARROW.minPx / Math.max(pxPerUnit, 1e-3)), ARROW.len, ARROW.maxLen);
  if (total < L * 1.6) return null;
  // the direction of travel over the last stretch (rounded corners make the final segments short)
  const seq = end ? pts : pts.slice().reverse();
  const tip0 = seq[seq.length - 1];
  let k = seq.length - 2, back = 0;
  while (k > 0 && back < L) { back += Math.hypot(seq[k + 1][0] - seq[k][0], seq[k + 1][1] - seq[k][1]); k--; }
  let dx = tip0[0] - seq[k][0], dy = tip0[1] - seq[k][1];
  const dl = Math.hypot(dx, dy);
  if (dl < 1e-6) return null;
  dx /= dl; dy /= dl;
  const nx = -dy, ny = dx;
  // the tip stands just off the housing's wall, the arms sweep back at about 38 degrees
  const tb = ARROW.back + width * 0.5;
  const tip = [tip0[0] - dx * tb, tip0[1] - dy * tb];
  const ax = tip[0] - dx * L, ay = tip[1] - dy * L, h = L * ARROW.spread;
  return { points: [[ax + nx * h, ay + ny * h], tip, [ax - nx * h, ay - ny * h]], tip, dir: [dx, dy], total };
}

// a bus: the trunk, its branches, and rounded tees where a branch meets the trunk side-on
function bus(p, dl, ctx) {
  // only the parts that carry data light up: a branch glows while it has a pulse, the trunk while any part does
  // (the renderer keeps an afterglow on what was used)
  const branches = p.branches ?? [];
  const has = (q) => (q?.length ?? 0) > 0;
  const any = has(p.pulses) || branches.some((b) => has(b.pulses));
  trace({ ...p, w: undefined, glow: any ? p.glow : 0 }, dl, ctx, SIZE.trace.bus);
  for (const b of branches) trace({ ...p, id: p.id, points: b.points, pulses: b.pulses, glow: has(b.pulses) ? p.glow : 0 }, dl, ctx, SIZE.trace.w);
  const trunk = p.points ?? [];
  const hwT = SIZE.trace.bus / 2, hwB = SIZE.trace.w / 2;
  const busKey = toneCol(ctx.theme, null, p.key) ?? undefined;
  const busGlow = any ? clamp(num(p.glow, 0), 0, 1) * GLOW.trace * (1 - clamp(num(p.dim, 0), 0, 1)) : 0;
  // a concave fillet in each corner of a side-on tee: an arc groove whose inner edge is the fillet circle
  // (radius RF, tangent to both channel walls) and whose outer edge lies inside the two channels
  const RF = 5.5, HW = (RF * (Math.SQRT2 - 1) + 1.6) / 2, steps = 8, ext = 0.16;
  for (const t of p.tees ?? []) {
    const br = branches.find((b) => b.points?.length >= 2 && (near(b.points[b.points.length - 1], t) || near(b.points[0], t)));
    if (!br || trunk.length < 2) continue;
    const pts = br.points, atEnd = near(pts[pts.length - 1], t);
    const a = atEnd ? pts[pts.length - 2] : pts[1];
    let dx = t.x - a[0], dy = t.y - a[1];
    const dl0 = Math.hypot(dx, dy) || 1; dx /= dl0; dy /= dl0;          // along the branch, into the tee
    const seg = trunkDir(trunk, t);
    if (!seg) continue;
    for (const sgn of [1, -1]) {
      const tx = seg[0] * sgn, ty = seg[1] * sgn;                      // along the trunk, away from the tee
      const cx = t.x - dx * (hwT + RF) + tx * (hwB + RF), cy = t.y - dy * (hwT + RF) + ty * (hwB + RF);
      const arc = [];
      for (let k = 0; k <= steps; k++) {
        // from facing the trunk wall (+d) round to facing the branch wall (-t), a little past both
        const u = -ext + (k / steps) * (Math.PI / 2 + 2 * ext);
        const ox = dx * Math.cos(u) - tx * Math.sin(u), oy = dy * Math.cos(u) - ty * Math.sin(u);
        arc.push([cx + ox * (RF + HW), cy + oy * (RF + HW)]);
      }
      dl.groove({ id: p.id, points: arc, width: HW * 2, style: "groove", glow: busGlow, glowColor: busKey, opacity: num(p.opacity, 1) * (1 - 0.5 * num(p.dim, 0)) });
    }
  }
}
const near = (q, t) => !!q && Math.abs(q[0] - t.x) < 0.75 && Math.abs(q[1] - t.y) < 0.75;
function trunkDir(pts, t) {
  let best = null, bd = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
    if (L2 < 1e-6) continue;
    const u = clamp(((t.x - ax) * vx + (t.y - ay) * vy) / L2, 0, 1);
    const d = Math.hypot(ax + vx * u - t.x, ay + vy * u - t.y);
    if (d < bd) { bd = d; const L = Math.sqrt(L2); best = [vx / L, vy / L]; }
  }
  return bd < 2 ? best : null;
}

function lane(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme], L = SIZE.lane;
  const pts = p.points && p.points.length >= 2 ? p.points : [[p.x - num(p.w, 400) / 2, p.y], [p.x + num(p.w, 400) / 2, p.y]];
  const [x0, y0] = pts[0], [x1] = pts[pts.length - 1];
  const op = num(p.opacity, 1);
  dl.groove({ id: p.id, points: pts, width: L.w, style: "rail", color: theme === "dark" ? P.housingAlt : P.housing, opacity: op });
  const length = Math.abs(x1 - x0), left = Math.min(x0, x1);
  const minor = num(p.ticks?.minor, L.tickMinor), major = num(p.ticks?.major, L.tickMajor);
  // a fine ruler under every rail; the scene marks the rail that carries the time labels (ruler)
  const ruler = p.ruler ?? true;
  dl.tick({ x: left, y: y0 + L.w / 2 + 2.2, length, axis: "x", every: minor, major: Math.max(1, Math.round(major / minor)), size: ruler ? 2.2 : 1.6, side: "near", color: P.inkFaint, opacity: (ruler ? 0.9 : 0.5) * op });
  const name = p.label ?? p.title ?? p.text;
  if (name) {
    // the scene reserves room left of the rail and says where the name starts (labelAt)
    const [nx, ny] = p.labelAt ?? [left - 12, y0];
    const T = WORLD_TYPE.lane;
    dl.text({ x: nx, y: ny, text: worldCase(name, T), font: T.font, weight: T.weight, size: T.size, tracking: T.tracking, align: p.labelAt ? "left" : "right", color: P.inkMuted, opacity: op });
  }
  if (p.labels) {
    p.labels.forEach((lb, k) => dl.text({ x: lb.x, y: lb.y, text: lb.text, font: "mono", weight: 400, size: 6, align: k === 0 ? "left" : "center", color: P.inkFaint, opacity: op }));
  } else if (ruler && p.times !== false) {
    // time labels under the major ticks: u -> sim time through the lane scale
    const scale = num(p.scale, 1), t0 = num(p.t0, 0), unit = p.unit ?? "ms";
    for (let s = 0, k = 0; s <= length + 1e-6; s += major, k++) {
      const t = t0 + s / scale;
      const label = (Math.abs(t - Math.round(t)) < 1e-6 ? String(Math.round(t)) : t.toFixed(1)) + (k === 0 ? " " + unit : "");
      dl.text({ x: left + s, y: y0 + L.w / 2 + 10.5, text: label, font: "mono", weight: 400, size: 6, align: k === 0 ? "left" : "center", color: P.inkFaint, opacity: op });
    }
  }
}

function mark(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme];
  const col = toneCol(theme, p.tone, p.key) ?? P.metal;
  const railH = Math.max(0.8, SIZE.lane.w * 0.3);
  const mw = num(p.w, 7.5), mh = num(p.h, 2.6);
  const s = { id: p.id, x: p.x, y: p.y, z: p.z ? p.z : railH, w: mw, d: mw, h: mh, r: mw / 2, bevel: Math.min(1.1, mh * 0.45), color: col, material: "ceramic" };
  attention(p, s, theme, { keyed: true, body: col });
  dl.slab(s);
  // its name stacks up a level when it would run into an earlier one on the rail (the scene's level; -1: left off)
  const M = SIZE.lane.mark, level = num(p.level, 0);
  if (p.text && level >= 0) dl.text({ x: p.x, y: p.y - M.rise - level * M.stack, text: p.text, font: "mono", weight: 500, size: M.label, color: P.inkMuted, opacity: num(p.opacity, 1) });
}

function playhead(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme];
  const pts = p.points && p.points.length >= 2 ? p.points : [[p.x, p.y - num(p.d, 200) / 2], [p.x, p.y + num(p.d, 200) / 2]];
  dl.groove({
    id: p.id, points: pts, width: 0.8, style: "print", color: theme === "dark" ? P.lit : P.ink,
    glow: theme === "dark" ? 0.32 : 0, glowColor: P.lit, opacity: num(p.opacity, 1) * (theme === "dark" ? 0.85 : 0.75),
  });
}

function zone(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme];
  const fail = p.dashed || p.style === "dashed" || p.tone === "fail";
  const tc = p.tone && STATUS.has(p.tone) ? P[p.tone] : null;
  const border = fail ? withAlpha(P.fail, theme === "dark" ? 0.72 : 0.8) : tc ? withAlpha(tc, 0.5) : P.zoneBorder;
  // a zone drawn around members usually overlaps the group zone that holds them, whose title owns the top-left
  // corner, so it carries its title at the top-right instead
  const around = p.variant === "around";
  const title = p.title ?? p.text;
  dl.zone({
    id: p.id, x: p.x, y: p.y, w: p.w, d: p.d, r: SIZE.zone.r, fill: fail ? withAlpha(P.fail, 0.03) : P.zoneFill, border,
    borderStyle: fail ? "dashed" : "solid", borderWidth: fail ? 1.1 : 0.9, title: around ? undefined : title, opacity: p.opacity,
  });
  if (around && title) {
    const T = WORLD_TYPE.zone;
    dl.text({
      x: p.x + p.w / 2 - SIZE.zone.r * 0.7, y: p.y - p.d / 2 + T.size * 0.95, text: worldCase(title, T), font: T.font, weight: T.weight,
      size: T.size, tracking: T.tracking, color: fail ? withAlpha(P.fail, 0.9) : tc ?? P.inkMuted, align: "right",
      opacity: num(p.opacity, 1),
    });
  }
}

function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
}

const TEXT_VARIANT = { label: { size: 7.5, weight: 500, ink: "inkMuted" }, index: { size: 6, weight: 500, ink: "inkFaint" }, floor: { size: 7, weight: 500, ink: "inkMuted" } };
function text(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme];
  const v = TEXT_VARIANT[p.variant] ?? TEXT_VARIANT.floor;
  const faint = p.tone === "ghost" || p.tone === "faint" || p.tone === "idle";
  // on white ceramic, muted floor print washes out with distance: there it is set in ink, a little transparent
  const muted = theme === "light" && v.ink === "inkMuted";
  const col = (p.tone !== "neutral" && toneCol(theme, p.tone === "key" ? null : p.tone, p.key)) || (faint ? P.inkFaint : muted ? P.ink : P[v.ink]);
  dl.text({
    id: p.id, x: p.x, y: p.y, z: p.z, text: String(p.text ?? ""), font: p.font ?? "mono", weight: num(p.weight, v.weight),
    size: num(p.size, v.size), color: col, align: p.align ?? (p.variant === "label" ? "left" : "center"), baseline: p.baseline, yaw: p.yaw,
    opacity: num(p.opacity, 1) * (1 - 0.5 * num(p.dim, 0)) * (muted && !faint ? 0.78 : 1), upper: p.upper, tracking: p.tracking,
  });
}

function bracket(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme];
  const col = toneCol(theme, p.tone, p.key) ?? P.inkMuted;
  let x0, x1, y;
  if (p.points && p.points.length >= 2) { x0 = p.points[0][0]; x1 = p.points[p.points.length - 1][0]; y = p.points[0][1]; }
  else { x0 = p.x - num(p.w, 40) / 2; x1 = p.x + num(p.w, 40) / 2; y = p.y; }
  const hook = 3.6, rr = 1.2, op = num(p.opacity, 1);
  const pts = [[x0, y - hook], [x0, y - rr], [x0 + rr * 0.3, y - rr * 0.3], [x0 + rr, y], [x1 - rr, y], [x1 - rr * 0.3, y - rr * 0.3], [x1, y - rr], [x1, y - hook]];
  dl.groove({ id: p.id, z: num(p.z, 0) + 0.06, points: pts, width: 0.85, style: "print", color: col, opacity: 0.9 * op });
  const name = p.text ?? p.label ?? p.title;
  const T = WORLD_TYPE.bracket;
  if (name) dl.text({ z: num(p.z, 0) + 0.06, x: (x0 + x1) / 2, y: y + SIZE.bracket.dy, text: worldCase(name, T), font: T.font, weight: T.weight, size: T.size, tracking: T.tracking, color: col, opacity: op });
}

function pointer(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme], S = SIZE.pointer;
  const op = num(p.opacity, 1);
  const lit = clamp(num(p.lit, 0), 0, 1);
  const flagCol = toneCol(theme, p.tone, p.key) ?? (theme === "dark" ? P.tile : P.tile);
  const tc = toneCol(theme, p.tone, p.key);
  const ink = tc ? inkOn(tc, P) : P.tileInk;
  const label = String(p.text ?? "");
  const fw = Math.max(13, label.length * S.label * 0.62 + 7.5);
  dl.slab({ id: p.id, x: p.x, y: p.y, z: 0, w: 5.2, d: 5.2, h: 0.9, r: 2.6, bevel: 0.4, color: P.metal, material: "metal", opacity: op });
  dl.slab({ id: p.id, x: p.x, y: p.y, z: 0.6, w: S.rod, d: S.rod, h: S.h, r: S.rod / 2, bevel: S.rod / 2 * 0.9, color: P.metal, material: "metal", opacity: op });
  const flag = {
    id: p.id, x: p.x + fw / 2 - S.rod * 0.6, y: p.y, z: S.h - 1.2, w: fw, d: S.flag, h: 2.8, r: 2.6, bevel: 0.9,
    color: flagCol, material: "ceramic", opacity: op,
    label: { text: label, font: "mono", weight: 600, size: S.label, color: ink, align: "center", dx: S.rod * 0.3, dy: 0 },
  };
  attention({ ...p, hover: p.hover, selected: p.selected }, flag, theme, { keyed: !!toneCol(theme, p.tone, p.key), body: flagCol });
  flag.z = S.h - 1.2 + MOTION.litRise * lit;
  dl.slab(flag);
}

function container(p, dl, ctx) {
  const { theme } = ctx;
  const P = PALETTE[theme], S = SIZE.plate;
  const s = {
    id: p.id, x: p.x, y: p.y, z: num(p.z, 0), w: p.w, d: p.d, h: num(p.h, S.h), r: Math.min(S.r, Math.min(p.w, p.d) / 2), bevel: 0.9,
    color: P.housingAlt, material: "matte",
  };
  attention(p, s, theme, { keyed: false, body: s.color }, true);
  dl.slab(s);
}

const KINDS = {
  housing, container, tile: tileLike, record: tileLike, bit: tileLike, page: tileLike, packet,
  trace: (p, dl, ctx) => trace(p, dl, ctx, SIZE.trace.w),
  bus,
  lane, mark, zone, text, bracket, pointer, playhead, field,
};

/**
 * @param {Object[]} poses   frame.poses (CONTRACTS.md 4.6)
 * @param {import("../contracts.mjs").DrawList} dl
 * @param {{ theme?: "dark"|"light", time?: number, pxPerUnit?: number }} opts
 */
export function skin(poses, dl, opts = {}) {
  const ctx = { theme: opts.theme === "light" ? "light" : "dark", time: num(opts.time, 0), pxPerUnit: num(opts.pxPerUnit, 1) };
  dl.fields = null;
  for (const p of poses ?? []) {
    if (!p || num(p.opacity, 1) <= 0) continue;
    const fn = KINDS[p.kind];
    if (fn) fn(p, dl, ctx);
  }
  return dl;
}

export const SKIN_KINDS = Object.keys(KINDS);
