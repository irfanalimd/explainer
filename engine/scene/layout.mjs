// Layout: a pure function of a state snapshot. Measure bottom-up (tiles from SIZE by `of`; containers and
// trays from cols x rows x slot + gap + padding; housings from tray + header + inset, at least minW/minD;
// groups from members), then place top-down (row, column, grid, ring, free, spacer; align; nested groups;
// titled groups become zones). Tiles in containers get positions local to their container.
import { SIZE } from "../tokens.mjs";
import { ROOT } from "./builder.mjs";
import { monoWidth, growBounds } from "./util.mjs";

// derived layout constants
export const L = {
  indexRoom: SIZE.tile.sub + 7,            // index numbers printed on a plate in front of its tiles
  labelRoom: SIZE.zone.title + 9,          // container label engraved on the floor above the plate
  bracketRoom: SIZE.lane.label + 17,       // bitfield brackets + names under a row of bits
  storeBand: SIZE.housing.header * 0.75,   // the ring around a store's round well that carries its title
  stackGap: 0.6,                           // vertical gap between piled tiles
  laneRuler: 22,                           // time labels under the bottom lane
  lanePad: 14,
  textLine: 1.6,
};

const slotOf = (of) => SIZE[of] ?? SIZE.tile;
export const tileSize = (rec) => slotOf(rec.of);

/** Run-wide facts the layout needs so containers keep one size for the whole run. */
export function scanCapacities(states) {
  const info = new Map();   // container id -> { maxCount, maxW, maxD }
  for (const st of states) {
    for (const rec of st.values()) {
      if (rec.kind === "housing") {
        let e = info.get(rec.id);
        if (!e) info.set(rec.id, (e = { maxCount: 0, maxW: 0, maxD: 0, head: 0 }));
        e.head = Math.max(e.head ?? 0, headerWidth(rec));
      }
      if (rec.kind !== "container" && !(rec.kind === "housing" && rec.tray)) continue;
      let e = info.get(rec.id);
      if (!e) info.set(rec.id, (e = { maxCount: 0, maxW: 0, maxD: 0 }));
      if (rec.children.length > e.maxCount) e.maxCount = rec.children.length;
      for (const c of rec.children) {
        const t = st.get(c);
        if (!t || t.kind !== "tile") continue;
        const z = tileSize(t);
        if (z.w > e.maxW) e.maxW = z.w;
        if (z.d > e.maxD) e.maxD = z.d;
      }
    }
  }
  return info;
}

/** Grid spec of a container or housing tray: of, order, cols, rows, capacity, fixed extents. */
export function traySpec(rec, info) {
  const isH = rec.kind === "housing";
  const t = isH ? rec.tray : rec;
  const of = t.of ?? "tile";
  const slot = slotOf(of);
  const e = info?.get(rec.id) ?? { maxCount: 0, maxW: 0, maxD: 0 };
  const order = isH ? t.order : rec.axis === "z" ? "stack" : rec.axis === "y" ? "column" : "row";
  let cols = t.cols, rows = t.rows;
  const explicitCap = t.capacity ?? (cols && rows ? cols * rows : null);
  const cap = Math.max(1, explicitCap ?? 0, explicitCap ? 0 : e.maxCount);
  if (order === "stack") { cols = 1; rows = 1; }
  else if (isH) {
    if (order === "row") { cols = cols ?? Math.min(cap, 4); rows = rows ?? Math.ceil(cap / cols); }
    else { rows = rows ?? Math.min(cap, 4); cols = cols ?? Math.ceil(cap / rows); }
  } else if (order === "row") { cols = cols ?? cap; rows = rows ?? Math.ceil(cap / cols); }
  else { rows = rows ?? cap; cols = cols ?? Math.ceil(cap / rows); }
  const sw = Math.max(slot.w, e.maxW), sd = Math.max(slot.d, e.maxD);
  const gap = slot.gap;
  const gw = cols * sw + (cols - 1) * gap, gd = rows * sd + (rows - 1) * gap;
  return { of, slot, order, cols, rows, capacity: explicitCap ?? cap, explicit: explicitCap !== null, gap, gw, gd, sw, sd };
}

/**
 * Positions of the given tiles in a grid of the spec, relative to the fixed grid's top-left corner.
 * Rows/columns size themselves to the tiles in them (mixed kinds), overflow compresses the pitch.
 */
export function gridPositions(spec, sizes) {
  const n = sizes.length, out = new Array(n);
  const { order, gap, slot } = spec;
  if (order === "stack") {
    let z = 0;
    for (let k = 0; k < n; k++) { out[k] = [spec.gw / 2, spec.gd / 2, z]; z += sizes[k].h + L.stackGap; }
    return out;
  }
  const byRow = order === "row";
  // slots along the fill direction; a single-line tray never wraps on overflow, it squeezes along its line
  const fixedLines = byRow ? spec.rows : spec.cols;
  const lanes = fixedLines === 1 ? Math.max(n, byRow ? spec.cols : spec.rows) : byRow ? spec.cols : spec.rows;
  const lines = Math.max(fixedLines, Math.ceil(n / lanes));
  const colW = new Array(byRow ? lanes : lines).fill(slot.w), rowD = new Array(byRow ? lines : lanes).fill(slot.d);
  for (let k = 0; k < n; k++) {
    const a = k % lanes, b = Math.floor(k / lanes);
    const c = byRow ? a : b, r = byRow ? b : a;
    if (sizes[k].w > colW[c]) colW[c] = sizes[k].w;
    if (sizes[k].d > rowD[r]) rowD[r] = sizes[k].d;
  }
  const cx = [], cy = [];
  let acc = 0;
  for (let c = 0; c < colW.length; c++) { cx.push(acc + colW[c] / 2); acc += colW[c] + gap; }
  const natW = acc - gap;
  acc = 0;
  for (let r = 0; r < rowD.length; r++) { cy.push(acc + rowD[r] / 2); acc += rowD[r] + gap; }
  const natD = acc - gap;
  // overflow: squash the centres so the first and last line still sit inside the fixed extent
  const squash = (cs, sizesArr, nat, fixed) => {
    if (nat <= fixed + 0.01 || cs.length < 2) return cs;
    const a0 = cs[0], a1 = cs[cs.length - 1];
    const b0 = sizesArr[0] / 2, b1 = fixed - sizesArr[sizesArr.length - 1] / 2;
    return cs.map((v) => b0 + ((v - a0) / (a1 - a0)) * (b1 - b0));
  };
  const X = squash(cx, colW, natW, spec.gw), Y = squash(cy, rowD, natD, spec.gd);
  for (let k = 0; k < n; k++) {
    const a = k % lanes, b = Math.floor(k / lanes);
    out[k] = byRow ? [X[a], Y[b], 0] : [X[b], Y[a], 0];
  }
  return out;
}

/** Width a housing header needs for its engraved title, sub-label and LED. */
export function headerWidth(rec) {
  const H = SIZE.housing;
  if (SIZE.variant[rec.variant]?.r === "round") return 0;
  return 12 + monoWidth(String(rec.title ?? "").toUpperCase(), H.title) * 1.08 + (rec.sub ? 14 + monoWidth(rec.sub, H.sub) : 0) + (rec.led !== null && rec.led !== undefined ? 22 : 12);
}

/** Measure a housing: body size and the tray (well) rect local to its centre. */
export function measureHousing(rec, info) {
  const v = SIZE.variant[rec.variant] ?? SIZE.variant.node;
  const H = SIZE.housing, W = SIZE.well;
  const spec = rec.tray ? traySpec(rec, info) : null;
  const ww = spec ? spec.gw + 2 * H.pad : 0, wd = spec ? spec.gd + 2 * H.pad : 0;
  if (v.r === "round") {
    const dWell = spec ? Math.hypot(ww, wd) : 0;
    const D = Math.max(H.minW, rec.w ?? 0, rec.d ?? 0, dWell + 2 * L.storeBand);
    const dw = D - 2 * L.storeBand;
    return { w: D, d: D, h: v.h, r: D / 2, round: true, spec, tray: spec ? { x: 0, y: 0, w: dw, d: dw, round: true } : null };
  }
  // the header must hold the engraved title, the sub-label and the LED without touching (widest over the run)
  const head = Math.max(headerWidth(rec), info?.get(rec.id)?.head ?? 0);
  let w = Math.max(H.minW, rec.w ?? 0, spec ? ww + 2 * W.inset : 0, Math.ceil(head));
  let d = Math.max(rec.variant === "queue" ? H.minD * 0.6 : H.minD, rec.d ?? 0, spec ? H.header + wd + W.inset : 0);
  if (rec.variant === "chip") w = d = Math.max(w, d);
  const tray = spec ? { x: 0, y: (H.header - W.inset) / 2, w: w - 2 * W.inset, d: d - H.header - W.inset } : null;
  return { w, d, h: v.h, r: v.r, round: false, spec, tray };
}

/** Measure a floor container: the plate, plus room for its label (above) and indices/brackets (in front). */
export function measureContainer(rec, info) {
  const spec = traySpec(rec, info);
  const P = SIZE.plate;
  const front = (rec.indices ? L.indexRoom : 0) + (rec.fields?.length ? L.bracketRoom : 0);
  const pw = spec.gw + 2 * P.pad, pd = spec.gd + 2 * P.pad + front;
  const above = rec.label ? L.labelRoom : 0;
  return { w: pw, d: pd, h: P.h, spec, front, above, tray: { x: 0, y: -front / 2, w: spec.gw + 2 * P.pad, d: spec.gd + 2 * P.pad } };
}

function measureLanes(rec, state) {
  const n = Math.max(1, rec.for.length);
  const names = rec.for.map((id) => state.get(id)?.title ?? id);
  const labelW = Math.max(40, ...names.map((t) => monoWidth(t, SIZE.lane.label))) + 18;
  const w = labelW + rec.length + L.lanePad;
  const top = rec.label ? L.labelRoom : 0;
  const d = top + L.lanePad + (n - 1) * SIZE.lane.gap + L.laneRuler + L.lanePad;
  return { w, d, labelW, top };
}

/**
 * Lay out a state. ctx: { info (scanCapacities), laneScale: Map(lanesId -> u per sim ms) }.
 * Returns { boxes, local, trays, zones, lanes, bounds, problems }.
 */
export function computeLayout(state, ctx = {}) {
  const info = ctx.info ?? new Map();
  const boxes = new Map();     // id -> world box { x, y, w, d, h, kind, ... }
  const local = new Map();     // tile id -> { parent, x, y, z } local to the container centre (z absolute)
  const trays = new Map();     // container id -> { spec, tray, z }
  const zones = [];
  const lanes = new Map();
  const problems = [];
  const measured = new Map();  // id -> { w, d, ox, oy, ... }

  const measure = (id) => {
    if (measured.has(id)) return measured.get(id);
    const rec = state.get(id);
    let m;
    if (!rec) m = { w: 0, d: 0, ox: 0, oy: 0 };
    else if (rec.kind === "housing") { const h = measureHousing(rec, info); m = { ...h, ox: 0, oy: 0 }; }
    else if (rec.kind === "container") { const c = measureContainer(rec, info); m = { ...c, d: c.d + c.above, ox: 0, oy: c.above / 2, plateD: c.d }; }
    else if (rec.kind === "tile") { const z = tileSize(rec); m = { w: z.w, d: z.d, h: z.h, ox: 0, oy: 0 }; }
    else if (rec.kind === "spacer") m = { w: rec.w, d: rec.d, ox: 0, oy: 0 };
    else if (rec.kind === "text") m = { w: monoWidth(rec.text, rec.size) + 4, d: rec.size * L.textLine, ox: 0, oy: 0 };
    else if (rec.kind === "lanes") { const l = measureLanes(rec, state); m = { ...l, ox: 0, oy: 0 }; }
    else if (rec.kind === "group") m = measureGroup(rec);
    else m = { w: 0, d: 0, ox: 0, oy: 0 };
    measured.set(id, m);
    return m;
  };

  // groups: child offsets relative to the group's own origin; box centre = origin + (cx, cy)
  function measureGroup(rec) {
    const kids = rec.children.filter((c) => state.has(c));
    const ms = kids.map(measure);
    const pad = rec.pad ?? 0;
    const gap = rec.gap ?? 18;
    const offs = [];
    let w = 0, d = 0;
    const al = (size, inner) => (rec.align === "start" ? -inner / 2 + size / 2 : rec.align === "end" ? inner / 2 - size / 2 : 0);
    if (rec.layout === "row") {
      w = ms.reduce((a, m) => a + m.w, 0) + gap * Math.max(0, ms.length - 1);
      d = Math.max(0, ...ms.map((m) => m.d));
      let x = -w / 2;
      for (const m of ms) { offs.push([x + m.w / 2, al(m.d, d)]); x += m.w + gap; }
    } else if (rec.layout === "column" || rec.layout === "root") {
      const g = rec.layout === "root" ? SIZE.gutter : gap;
      const flow = kids.map((id, i) => [id, ms[i]]).filter(([id]) => rec.layout !== "root" || !state.get(id).at);
      d = flow.reduce((a, [, m]) => a + m.d, 0) + g * Math.max(0, flow.length - 1);
      w = Math.max(0, ...flow.map(([, m]) => m.w));
      let y = -d / 2;
      const pos = new Map();
      for (const [id, m] of flow) { pos.set(id, [al(m.w, w), y + m.d / 2]); y += m.d + g; }
      kids.forEach((id) => offs.push(pos.get(id) ?? state.get(id).at.slice(0, 2)));
    } else if (rec.layout === "grid") {
      const cols = Math.max(1, rec.cols ?? Math.ceil(Math.sqrt(ms.length)));
      const rows = Math.ceil(ms.length / cols);
      const cw = new Array(cols).fill(0), rd = new Array(rows).fill(0);
      ms.forEach((m, i) => { const c = i % cols, r = Math.floor(i / cols); cw[c] = Math.max(cw[c], m.w); rd[r] = Math.max(rd[r], m.d); });
      w = cw.reduce((a, b) => a + b, 0) + gap * (cols - 1);
      d = rd.reduce((a, b) => a + b, 0) + gap * Math.max(0, rows - 1);
      const xs = [], ys = [];
      let acc = -w / 2; for (const c of cw) { xs.push(acc + c / 2); acc += c + gap; }
      acc = -d / 2; for (const r of rd) { ys.push(acc + r / 2); acc += r + gap; }
      ms.forEach((m, i) => offs.push([xs[i % cols], ys[Math.floor(i / cols)]]));
    } else if (rec.layout === "ring") {
      const n = ms.length;
      const span = Math.max(0, ...ms.map((m) => Math.hypot(m.w, m.d)));
      const auto = n <= 1 ? 0 : (n * (span + gap)) / (2 * Math.PI);
      const R = rec.radius ?? Math.max(auto, n > 1 ? (span + gap) / (2 * Math.sin(Math.PI / n)) : 0);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ms.forEach((m, i) => {
        const a = ((rec.start ?? -90) + (360 * i) / Math.max(1, n)) * Math.PI / 180;
        const x = R * Math.cos(a), y = R * Math.sin(a);
        offs.push([x, y]);
        minX = Math.min(minX, x - m.w / 2); maxX = Math.max(maxX, x + m.w / 2);
        minY = Math.min(minY, y - m.d / 2); maxY = Math.max(maxY, y + m.d / 2);
      });
      if (!n) { minX = minY = maxX = maxY = 0; }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      for (const o of offs) { o[0] -= cx; o[1] -= cy; }
      w = maxX - minX; d = maxY - minY;
    } else if (rec.layout === "free") {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      kids.forEach((id, i) => {
        const at = state.get(id).at;
        if (!at) problems.push({ kind: "free-without-at", message: `"${id}" is in free group "${rec.id}" but has no \`at\``, id });
        const [x, y] = at ?? [0, 0];
        offs.push([x, y]);
        const m = ms[i];
        minX = Math.min(minX, x - m.w / 2); maxX = Math.max(maxX, x + m.w / 2);
        minY = Math.min(minY, y - m.d / 2); maxY = Math.max(maxY, y + m.d / 2);
      });
      if (!kids.length) { minX = minY = maxX = maxY = 0; }
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      for (const o of offs) { o[0] -= cx; o[1] -= cy; }
      w = maxX - minX; d = maxY - minY;
    }
    // offs are member box centres relative to the group's content centre
    return { w: w + 2 * pad, d: d + 2 * pad, ox: 0, oy: 0, kids, offs, inner: [w, d], pad };
  }

  // place a node so its *box* centre is at (bx, by)
  function place(id, bx, by, stretch) {
    const rec = state.get(id);
    const m = measure(id);
    const x = bx + m.ox, y = by + m.oy;
    if (rec.kind === "group") {
      if (rec.layout !== "root") {
        boxes.set(id, { id, kind: "group", x: bx, y: by, w: m.w, d: m.d, h: 0 });
        if (rec.title) zones.push({ id, x: bx, y: by, w: m.w, d: m.d, title: rec.title, tone: rec.tone, dashed: rec.dashed || rec.tone === "fail" });
      }
      m.kids.forEach((cid, i) => {
        const o = m.offs[i];
        let st = null;
        if (rec.layout === "row") st = { d: m.inner[1] };
        else if (rec.layout === "column") st = { w: m.inner[0] };
        // root members with `at` are absolute world positions
        if (rec.layout === "root" && state.get(cid).at) place(cid, o[0], o[1], null);
        else place(cid, bx + o[0], by + o[1], st);
      });
      return;
    }
    if (rec.kind === "spacer") {
      boxes.set(id, { id, kind: "spacer", x, y, w: Math.max(m.w, stretch?.w ?? 0), d: Math.max(m.d, stretch?.d ?? 0), h: 0 });
      return;
    }
    if (rec.kind === "housing") {
      boxes.set(id, { id, kind: "housing", variant: rec.variant, x, y, w: m.w, d: m.d, h: m.h, r: m.r, round: m.round, tray: m.tray });
      if (m.spec) placeTiles(rec, x, y, m.spec, m.tray, (SIZE.variant[rec.variant] ?? SIZE.variant.node).h - SIZE.well.depth);
      return;
    }
    if (rec.kind === "container") {
      const plateD = m.plateD;
      boxes.set(id, { id, kind: "container", x, y, w: m.w, d: plateD, h: SIZE.plate.h, front: m.front, above: m.above, tray: m.tray });
      placeTiles(rec, x, y, m.spec, m.tray, SIZE.plate.h);
      return;
    }
    if (rec.kind === "lanes") {
      boxes.set(id, { id, kind: "lanes", x, y, w: m.w, d: m.d, h: 0 });
      const x0 = x - m.w / 2 + m.labelW, top = y - m.d / 2 + m.top + L.lanePad;
      lanes.set(id, {
        id, x0, x1: x0 + rec.length, labelX: x - m.w / 2 + 6, length: rec.length,
        rails: rec.for.map((ent, k) => ({ ent, y: top + k * SIZE.lane.gap })), scale: ctx.laneScale?.get(id) ?? rec.scale ?? 1, unit: rec.unit,
      });
      return;
    }
    // loose tiles and floor texts sit directly in a group
    boxes.set(id, { id, kind: rec.kind, x, y, w: m.w, d: m.d, h: m.h ?? 0 });
  }

  function placeTiles(rec, x, y, spec, tray, z0) {
    const kids = rec.children.filter((c) => state.get(c)?.kind === "tile");
    const sizes = kids.map((c) => tileSize(state.get(c)));
    const pos = gridPositions(spec, sizes);
    const ox = tray.x - spec.gw / 2, oy = tray.y - spec.gd / 2;
    kids.forEach((c, k) => local.set(c, { parent: rec.id, x: ox + pos[k][0], y: oy + pos[k][1], z: z0 + pos[k][2] }));
    trays.set(rec.id, { spec, tray, z: z0, count: kids.length });
    if (spec.explicit && kids.length > spec.capacity) problems.push({ kind: "overflow", message: `"${rec.id}" holds ${kids.length} tiles, capacity ${spec.capacity}`, id: rec.id });
  }

  const root = state.get(ROOT);
  if (root) {
    measure(ROOT);
    place(ROOT, 0, 0, null);
  }

  // housings must not overlap
  const hs = [...boxes.values()].filter((b) => b.kind === "housing");
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const a = hs[i], b = hs[j];
    const ox = Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2);
    const oy = Math.min(a.y + a.d / 2, b.y + b.d / 2) - Math.max(a.y - a.d / 2, b.y - b.d / 2);
    if (ox > 0.5 && oy > 0.5) problems.push({ kind: "overlap", message: `housings "${a.id}" and "${b.id}" overlap`, id: a.id });
  }

  let bounds = null;
  for (const b of boxes.values()) if (b.kind !== "spacer") bounds = growBounds(bounds, b.x - b.w / 2, b.y - b.d / 2, b.x + b.w / 2, b.y + b.d / 2, 0, b.h ?? 0);
  return { boxes, local, trays, zones, lanes, bounds: bounds ?? { minX: -1, minY: -1, maxX: 1, maxY: 1, minZ: 0, maxZ: 0 }, problems };
}
