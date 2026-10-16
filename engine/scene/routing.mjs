// Trace and bus routing on a layout. Ports sit on facing edges and spread when several connections share
// an edge; routes are orthogonal with rounded corners, run through gutters (channel-assigned so parallel
// runs never overlap or cross) and detour around housings with a bend-penalised search on a Hanan grid.
// A bus is one trunk (in a spacer or the gap between its two sides) with branches that join it in tees.
import { SIZE } from "../tokens.mjs";
import { Path, roundCorners, simplify } from "./path.mjs";

export const R = {
  portPitch: SIZE.trace.w + SIZE.trace.portGap * 2 + 1,   // 16.2 u between neighbouring ports on one edge
  track: SIZE.trace.w + SIZE.trace.portGap,               // 9.2 u between parallel runs in a gutter
  clear: 12,                                              // keep-out around solids
  stub: 18,                                               // first run straight out of a port
  bend: 60,                                               // search cost of one bend, in u
  loop: 26,                                               // how far a self-loop stands off its housing
  align: 6,                                               // facing ports straighten when their edges share this much
};

const DIRS = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const OPP = { left: "right", right: "left", top: "bottom", bottom: "top" };

/** The box a connection endpoint attaches to: the entity's own box, else its nearest ancestor's. */
function endBox(layout, state, id) {
  let cur = id;
  for (let i = 0; i < 16 && cur; i++) {
    const b = layout.boxes.get(cur);
    if (b && b.kind !== "spacer") return b;
    cur = state.get(cur)?.parent;
  }
  return null;
}

function autoSides(a, b) {
  const gx = Math.max(b.x - b.w / 2 - (a.x + a.w / 2), a.x - a.w / 2 - (b.x + b.w / 2));
  const gy = Math.max(b.y - b.d / 2 - (a.y + a.d / 2), a.y - a.d / 2 - (b.y + b.d / 2));
  if (gx >= gy) return b.x >= a.x ? ["right", "left"] : ["left", "right"];
  return b.y >= a.y ? ["bottom", "top"] : ["top", "bottom"];
}

/** Anchor of the port run on one side of a box: tray centre for left/right, body centre for top/bottom. */
function sideRange(box, side) {
  const r = typeof box.r === "number" ? Math.min(box.r, Math.min(box.w, box.d) / 2) : 6;
  if (side === "left" || side === "right") {
    const anchor = box.tray ? box.y + box.tray.y : box.y;
    const lo = box.y - box.d / 2 + (box.round ? box.d * 0.2 : Math.max(r, box.kind === "housing" ? SIZE.housing.header : 0) + 2);
    const hi = box.y + box.d / 2 - (box.round ? box.d * 0.2 : r + 2);
    return { anchor: Math.min(hi, Math.max(lo, anchor)), lo, hi };
  }
  const lo = box.x - box.w / 2 + (box.round ? box.w * 0.2 : r + 2), hi = box.x + box.w / 2 - (box.round ? box.w * 0.2 : r + 2);
  return { anchor: box.x, lo, hi };
}

function portPoint(box, side, along) {
  if (box.round) {
    const R0 = box.w / 2;
    if (side === "left" || side === "right") {
      const dy = along - box.y, dx = Math.sqrt(Math.max(0, R0 * R0 - dy * dy));
      return [box.x + (side === "right" ? dx : -dx), along];
    }
    const dx = along - box.x, dy = Math.sqrt(Math.max(0, R0 * R0 - dx * dx));
    return [along, box.y + (side === "bottom" ? dy : -dy)];
  }
  if (side === "left") return [box.x - box.w / 2, along];
  if (side === "right") return [box.x + box.w / 2, along];
  if (side === "top") return [along, box.y - box.d / 2];
  return [along, box.y + box.d / 2];
}

/** Spread n ports around the anchor of an edge, ordered by `keys` (the far end's coordinate). */
function spreadPorts(box, side, keys) {
  const { anchor, lo, hi } = sideRange(box, side);
  const n = keys.length;
  const pitch = n > 1 ? Math.min(R.portPitch, (hi - lo) / (n - 1)) : 0;
  const order = keys.map((k, i) => [k, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = new Array(n);
  let start = anchor - (pitch * (n - 1)) / 2;
  if (start < lo) start = lo;
  if (start + pitch * (n - 1) > hi) start = Math.max(lo, hi - pitch * (n - 1));
  order.forEach(([, i], k) => { out[i] = start + k * pitch; });
  return out;
}

function hitsObstacles(raw, obstacles, skip) {
  for (let i = 1; i < raw.length; i++) {
    const [x0, y0] = raw[i - 1], [x1, y1] = raw[i];
    for (const o of obstacles) {
      if (skip.has(o.id)) continue;
      const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
      if (maxX > o.minX + 0.01 && minX < o.maxX - 0.01 && maxY > o.minY + 0.01 && minY < o.maxY - 0.01) return true;
    }
  }
  return false;
}

/** Bend-penalised shortest orthogonal path on the Hanan grid of the obstacles (Dijkstra, small n). */
function searchRoute(pa, sa, pb, sb, obstacles) {
  const da = DIRS[sa], db = DIRS[sb];
  const s = [pa[0] + da[0] * R.stub, pa[1] + da[1] * R.stub], t = [pb[0] + db[0] * R.stub, pb[1] + db[1] * R.stub];
  const xsSet = new Set([s[0], t[0]]), ysSet = new Set([s[1], t[1]]);
  const edgesX = [], edgesY = [];
  for (const o of obstacles) { xsSet.add(o.minX); xsSet.add(o.maxX); ysSet.add(o.minY); ysSet.add(o.maxY); edgesX.push(o.minX, o.maxX); edgesY.push(o.minY, o.maxY); }
  const mids = (arr, set) => { const v = [...new Set(arr)].sort((a, b) => a - b); for (let i = 1; i < v.length; i++) set.add((v[i - 1] + v[i]) / 2); };
  mids(edgesX, xsSet); mids(edgesY, ysSet);
  const xs = [...xsSet].sort((a, b) => a - b), ys = [...ysSet].sort((a, b) => a - b);
  const nx = xs.length, ny = ys.length;
  const inside = (x, y) => obstacles.some((o) => x > o.minX + 0.01 && x < o.maxX - 0.01 && y > o.minY + 0.01 && y < o.maxY - 0.01);
  const blocked = (x0, y0, x1, y1) => obstacles.some((o) => {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    return maxX > o.minX + 0.01 && minX < o.maxX - 0.01 && maxY > o.minY + 0.01 && minY < o.maxY - 0.01;
  });
  const id = (i, j, d) => (i * ny + j) * 4 + d;   // d: 0 +x, 1 -x, 2 +y, 3 -y
  const dirOf = (v) => (v[0] > 0 ? 0 : v[0] < 0 ? 1 : v[1] > 0 ? 2 : 3);
  const si = xs.indexOf(s[0]), sj = ys.indexOf(s[1]), ti = xs.indexOf(t[0]), tj = ys.indexOf(t[1]);
  const dist = new Float64Array(nx * ny * 4).fill(Infinity), prev = new Int32Array(nx * ny * 4).fill(-1);
  const heap = [];
  const push = (c, k) => { heap.push([c, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const d0 = dirOf(da), start = id(si, sj, d0);
  dist[start] = 0; push(0, start);
  const finalDir = dirOf([-db[0], -db[1]]);
  let goal = -1;
  while (heap.length) {
    const [c, k] = pop();
    if (c > dist[k]) continue;
    const d = k % 4, cell = (k - d) / 4, i = Math.floor(cell / ny), j = cell % ny;
    if (i === ti && j === tj) { goal = k; if (d === finalDir) break; }
    for (let nd = 0; nd < 4; nd++) {
      if ((nd ^ 1) === d && (nd >> 1) === (d >> 1)) continue;           // no U-turn
      const ni = i + (nd === 0 ? 1 : nd === 1 ? -1 : 0), nj = j + (nd === 2 ? 1 : nd === 3 ? -1 : 0);
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      if (inside(xs[ni], ys[nj]) || blocked(xs[i], ys[j], xs[ni], ys[nj])) continue;
      let cost = c + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nd !== d ? R.bend : 0);
      if (ni === ti && nj === tj && nd !== finalDir) cost += R.bend;
      const nk = id(ni, nj, nd);
      if (cost < dist[nk]) { dist[nk] = cost; prev[nk] = k; push(cost, nk); }
    }
  }
  if (goal < 0) return null;
  // prefer the best arrival over all directions
  let best = goal, bestC = Infinity;
  for (let d = 0; d < 4; d++) { const k = id(ti, tj, d); const c = dist[k] + (d !== finalDir ? R.bend : 0); if (c < bestC) { bestC = c; best = k; } }
  const pts = [];
  for (let k = best; k >= 0; k = prev[k]) { const cell = (k - (k % 4)) / 4; pts.push([xs[Math.floor(cell / ny)], ys[cell % ny]]); }
  pts.reverse();
  return simplify([pa, ...pts, pb]);
}

/**
 * Route every trace and bus in `state` on `layout`.
 * Returns { traces: Map(id -> Route), buses: Map(id -> BusRoute), problems }.
 * Route: { id, from, to, raw, path (Path, rounded), a, b, sa, sb }.
 */
export function routeAll(layout, state) {
  const problems = [];
  const traces = new Map(), buses = new Map();
  const obstacles = [];
  for (const b of layout.boxes.values()) {
    if (b.kind !== "housing" && b.kind !== "container") continue;
    obstacles.push({ id: b.id, minX: b.x - b.w / 2 - R.clear, maxX: b.x + b.w / 2 + R.clear, minY: b.y - b.d / 2 - R.clear, maxY: b.y + b.d / 2 + R.clear });
  }
  const ringOf = (id) => { const p = state.get(state.get(id)?.parent); return p?.kind === "group" && p.layout === "ring"; };

  // 1. collect connection ends per (box, side)
  const ends = new Map();       // `${boxId}|${side}` -> [{ conn, end, key }]
  const addEnd = (box, side, rec) => { const k = `${box.id}|${side}`; if (!ends.has(k)) ends.set(k, []); ends.get(k).push(rec); };
  const conns = [];
  for (const rec of state.values()) {
    if (rec.kind === "trace") {
      const A = endBox(layout, state, rec.from), B = endBox(layout, state, rec.to);
      if (!A || !B) { problems.push({ kind: "unroutable", message: `trace "${rec.id}": an endpoint has no place in the layout`, id: rec.id }); continue; }
      const loop = A === B;
      const straight = !loop && (rec.route === "straight" || (rec.route === "auto" && ringOf(rec.from) && ringOf(rec.to)));
      // a self-loop (a node pointing at itself) leaves its right edge and comes back in through the front
      const [sa0, sb0] = loop ? ["right", "bottom"] : autoSides(A, B);
      const c = { rec, A, B, sa: rec.fromSide ?? sa0, sb: rec.toSide ?? sb0, straight, loop };
      if (loop && c.sa === c.sb) c.sb = c.sa === "bottom" ? "right" : "bottom";
      conns.push(c);
      if (straight) continue;
      // a loop's two ends sort toward the corner they wrap round
      const toward = (side, other) => (DIRS[other][side === "left" || side === "right" ? 1 : 0] > 0 ? 1e9 : -1e9);
      addEnd(A, c.sa, { c, end: "a", key: () => (loop ? toward(c.sa, c.sb) : c.sa === "left" || c.sa === "right" ? B.y + (B.tray?.y ?? 0) : B.x) });
      addEnd(B, c.sb, { c, end: "b", key: () => (loop ? toward(c.sb, c.sa) : c.sb === "left" || c.sb === "right" ? A.y + (A.tray?.y ?? 0) : A.x) });
    } else if (rec.kind === "bus") {
      const F = rec.from.map((id) => endBox(layout, state, id)).filter(Boolean), T = rec.to.map((id) => endBox(layout, state, id)).filter(Boolean);
      if (!F.length || !T.length) { problems.push({ kind: "unroutable", message: `bus "${rec.id}" needs boxes on both sides`, id: rec.id }); continue; }
      const u = (list) => list.reduce((b, x) => ({ minX: Math.min(b.minX, x.x - x.w / 2), maxX: Math.max(b.maxX, x.x + x.w / 2), minY: Math.min(b.minY, x.y - x.d / 2), maxY: Math.max(b.maxY, x.y + x.d / 2) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      const fb = u(F), tb = u(T);
      const gx = Math.max(tb.minX - fb.maxX, fb.minX - tb.maxX), gy = Math.max(tb.minY - fb.maxY, fb.minY - tb.maxY);
      const vertical = gx >= gy;   // trunk runs along y between left and right sides
      let sf, st, coord;
      const via = rec.via ? layout.boxes.get(rec.via) : null;
      if (vertical) {
        const fl = (fb.minX + fb.maxX) / 2 < (tb.minX + tb.maxX) / 2;
        sf = fl ? "right" : "left"; st = fl ? "left" : "right";
        coord = via ? via.x : fl ? (fb.maxX + tb.minX) / 2 : (tb.maxX + fb.minX) / 2;
      } else {
        const ft = (fb.minY + fb.maxY) / 2 < (tb.minY + tb.maxY) / 2;
        sf = ft ? "bottom" : "top"; st = ft ? "top" : "bottom";
        coord = via ? via.y : ft ? (fb.maxY + tb.minY) / 2 : (tb.maxY + fb.minY) / 2;
      }
      const c = { rec, F, T, sf, st, vertical, coord, branches: [] };
      conns.push(c);
      const self = (box) => () => (vertical ? box.y + (box.tray?.y ?? 0) : box.x);
      F.forEach((box) => addEnd(box, sf, { c, end: "f", box, key: self(box) }));
      T.forEach((box) => addEnd(box, st, { c, end: "t", box, key: self(box) }));
    }
  }

  // 2. allocate ports along each shared edge, ordered by where their far ends are
  for (const [k, list] of ends) {
    const [boxId, side] = k.split("|");
    const box = layout.boxes.get(boxId);
    const along = spreadPorts(box, side, list.map((e) => e.key()));
    list.forEach((e, i) => {
      let at = along[i];
      // a lone loop end moves halfway toward the corner it wraps, so the loop stays compact
      if (list.length === 1 && e.c.loop) {
        const { anchor, lo, hi } = sideRange(box, side);
        at = anchor + ((e.key() > 0 ? hi : lo) - anchor) * 0.5;
      }
      const p = portPoint(box, side, at);
      if (e.end === "a") { e.c.pa = p; e.c.aloneA = list.length === 1; }
      else if (e.end === "b") { e.c.pb = p; e.c.aloneB = list.length === 1; }
      else e.c.branches.push({ box, side, p, kind: e.end === "f" ? "from" : "to" });
    });
  }
  // facing ports that are alone on their edges line up, so side-by-side neighbours get one straight run
  // instead of a small S-bend: the shared height nearest both anchors, inside both edges' port ranges
  for (const c of conns) {
    if (!c.rec || c.rec.kind !== "trace" || c.straight || c.loop || !c.aloneA || !c.aloneB || c.sa !== OPP[c.sb]) continue;
    if (c.A.round || c.B.round) continue;
    const ax = c.sa === "left" || c.sa === "right" ? 1 : 0;   // the coordinate that varies along these edges
    const ra = sideRange(c.A, c.sa), rb = sideRange(c.B, c.sb);
    const lo = Math.max(ra.lo, rb.lo), hi = Math.min(ra.hi, rb.hi);
    if (hi - lo < R.align) continue;
    const v = Math.min(hi, Math.max(lo, (c.pa[ax] + c.pb[ax]) / 2));
    c.pa = portPoint(c.A, c.sa, v); c.pb = portPoint(c.B, c.sb, v);
  }

  // 3. route traces: Z through the gutter when it is clear, else search; then assign gutter tracks
  const channels = [];          // Z-routes whose middle run can slide inside its gutter
  for (const c of conns) {
    if (!c.rec || c.rec.kind !== "trace") continue;
    if (c.straight) {
      const ctr = (b) => [b.x, b.y];
      const [ax, ay] = ctr(c.A), [bx, by] = ctr(c.B);
      const L0 = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L0, uy = (by - ay) / L0;
      const edgeT = (box, dx, dy) => { if (box.round) return box.w / 2; const tx = Math.abs(dx) > 1e-6 ? (box.w / 2) / Math.abs(dx) : Infinity, ty = Math.abs(dy) > 1e-6 ? (box.d / 2) / Math.abs(dy) : Infinity; return Math.min(tx, ty); };
      const ta = edgeT(c.A, ux, uy), tb = edgeT(c.B, ux, uy);
      c.raw = [[ax + ux * ta, ay + uy * ta], [bx - ux * tb, by - uy * tb]];
      continue;
    }
    const { pa, pb, sa, sb } = c;
    if (c.loop) { c.raw = loopRoute(pa, sa, pb, sb) ?? searchRoute(pa, sa, pb, sb, obstacles.filter((o) => o.id !== c.A.id)) ?? [pa, pb]; continue; }
    const skip = new Set([c.A.id, c.B.id]);
    let raw = null;
    const horiz = (sa === "left" || sa === "right") && (sb === "left" || sb === "right");
    const vert = (sa === "top" || sa === "bottom") && (sb === "top" || sb === "bottom");
    // facing ports: a straight run when they line up; else a Z through the gap (a narrow gap squeezes its corners,
    // which beats a search whose stubs would overshoot each other and curl)
    const gapX = sa === "right" ? pb[0] - pa[0] : pa[0] - pb[0], gapY = sa === "bottom" ? pb[1] - pa[1] : pa[1] - pb[1];
    if (horiz && sa === OPP[sb] && gapX > 1 && Math.abs(pa[1] - pb[1]) < 0.5) raw = [pa, pb];
    else if (vert && sa === OPP[sb] && gapY > 1 && Math.abs(pa[0] - pb[0]) < 0.5) raw = [pa, pb];
    else if (horiz && sa === OPP[sb] && gapX > 1) {
      if (Math.abs(pa[1] - pb[1]) < 0.5) raw = [pa, pb];
      else {
        const lo = sa === "right" ? c.A.x + c.A.w / 2 : c.B.x + c.B.w / 2, hi = sa === "right" ? c.B.x - c.B.w / 2 : c.A.x - c.A.w / 2;
        const m = (lo + hi) / 2;
        raw = [pa, [m, pa[1]], [m, pb[1]], pb];
        c.channel = { axis: "x", value: m, lo: Math.min(m, lo + R.stub * 0.6), hi: Math.max(m, hi - R.stub * 0.6), a: pa[1], b: pb[1], dirSign: sa === "right" ? 1 : -1 };
      }
    } else if (vert && sa === OPP[sb] && gapY > 1) {
      if (Math.abs(pa[0] - pb[0]) < 0.5) raw = [pa, pb];
      else {
        const lo = sa === "bottom" ? c.A.y + c.A.d / 2 : c.B.y + c.B.d / 2, hi = sa === "bottom" ? c.B.y - c.B.d / 2 : c.A.y - c.A.d / 2;
        const m = (lo + hi) / 2;
        raw = [pa, [pa[0], m], [pb[0], m], pb];
        c.channel = { axis: "y", value: m, lo: Math.min(m, lo + R.stub * 0.6), hi: Math.max(m, hi - R.stub * 0.6), a: pa[0], b: pb[0], dirSign: sa === "bottom" ? 1 : -1 };
      }
    } else if (!horiz && !vert) {
      // perpendicular sides: one L if it leaves and enters the right way
      const L1 = (sa === "left" || sa === "right") ? [pb[0], pa[1]] : [pa[0], pb[1]];
      const da = DIRS[sa], db = DIRS[sb];
      // a short leg still beats a search whose stubs overshoot and jog back
      const okA = (L1[0] - pa[0]) * da[0] + (L1[1] - pa[1]) * da[1] > R.stub / 3;
      const okB = (L1[0] - pb[0]) * db[0] + (L1[1] - pb[1]) * db[1] > R.stub / 3;
      if (okA && okB) raw = [pa, L1, pb];
    }
    if (raw && hitsObstacles(raw, obstacles, skip)) { raw = null; c.channel = null; }
    if (!raw) {
      raw = searchRoute(pa, sa, pb, sb, obstacles) ?? [pa, pb];
      c.channel = null;
    }
    c.raw = raw;
    if (c.channel) channels.push(c);
  }
  assignTracks(channels);

  for (const c of conns) {
    if (!c.rec || c.rec.kind !== "trace") continue;
    const raw = simplify(c.raw);
    const path = new Path(c.straight ? raw : roundCorners(raw, SIZE.trace.corner));
    traces.set(c.rec.id, { id: c.rec.id, kind: "trace", from: c.rec.from, to: c.rec.to, raw, path, sa: c.sa, sb: c.sb, fromBox: c.A.id, toBox: c.B.id });
  }

  // 4. buses: trunk + branches; extreme branches curl into the trunk's ends
  for (const c of conns) {
    if (!c.rec || c.rec.kind !== "bus") continue;
    const V = c.vertical;
    const js = c.branches.map((b) => (V ? b.p[1] : b.p[0]));
    let lo = Math.min(...js), hi = Math.max(...js);
    const rr = SIZE.trace.corner;
    const single = hi - lo < 1;
    // an end of the trunk curls into its branch only when exactly one branch meets it there
    const atLo = js.filter((v) => Math.abs(v - lo) < 1).length, atHi = js.filter((v) => Math.abs(v - hi) < 1).length;
    const roomy = hi - lo >= 2 * rr + 1;
    const extremeLo = roomy && atLo === 1 ? js.indexOf(lo) : -1, extremeHi = roomy && atHi === 1 ? js.lastIndexOf(hi) : -1;
    const branchesOut = [], tees = [];
    c.branches.forEach((b, i) => {
      const j = V ? [c.coord, b.p[1]] : [b.p[0], c.coord];
      let raw = [b.p, j];
      if (!single && (i === extremeLo || i === extremeHi)) {
        const dir = i === extremeLo ? 1 : -1;
        raw = [b.p, j, V ? [j[0], j[1] + dir * rr] : [j[0] + dir * rr, j[1]]];
      } else tees.push({ x: j[0], y: j[1], side: b.side === "right" || b.side === "bottom" ? "a" : "b" });
      const raw2 = b.kind === "to" ? raw.slice().reverse() : raw;
      branchesOut.push({ of: b.box.id, kind: b.kind, side: b.side, port: b.p, junction: j, raw: raw2, path: new Path(roundCorners(raw2, rr)) });
    });
    const a0 = lo + (extremeLo >= 0 ? rr : 0), a1 = hi - (extremeHi >= 0 ? rr : 0);
    const trunkRaw = single ? [V ? [c.coord, lo] : [lo, c.coord]] : V ? [[c.coord, a0], [c.coord, a1]] : [[a0, c.coord], [a1, c.coord]];
    const trunk = new Path(trunkRaw.length > 1 ? trunkRaw : [trunkRaw[0], trunkRaw[0]]);
    buses.set(c.rec.id, {
      id: c.rec.id, kind: "bus", vertical: V, coord: c.coord, lo, hi, trunk, branches: branchesOut, tees,
      from: c.rec.from, to: c.rec.to, routes: new Map(),
    });
  }
  return { traces, buses, problems };
}

/** A self-loop round its own housing: out of one edge, round the corner, back in through the other. */
function loopRoute(pa, sa, pb, sb) {
  const da = DIRS[sa], db = DIRS[sb], D = R.loop;
  const p1 = [pa[0] + da[0] * D, pa[1] + da[1] * D], p3 = [pb[0] + db[0] * D, pb[1] + db[1] * D];
  if (sa === sb) return [pa, p1, sa === "left" || sa === "right" ? [p1[0], p3[1]] : [p3[0], p1[1]], p3, pb].filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 1e-6);
  if (sa === OPP[sb]) return null;
  const corner = sa === "left" || sa === "right" ? [p1[0], p3[1]] : [p3[0], p1[1]];
  return [pa, p1, corner, p3, pb];
}

/**
 * Channel (track) assignment for Z-routes that share a gutter: runs whose spans overlap get distinct tracks,
 * ordered so neighbours never cross (the run that turns toward the far side first sits nearest its source).
 */
function assignTracks(list) {
  const groups = [];
  for (const c of list) {
    const ch = c.channel;
    const g = groups.find((x) => x.axis === ch.axis && Math.abs(x.value - ch.value) < 1 && x.dirSign === ch.dirSign);
    if (g) g.items.push(c); else groups.push({ axis: ch.axis, value: ch.value, dirSign: ch.dirSign, lo: ch.lo, hi: ch.hi, items: [c] });
  }
  for (const g of groups) {
    if (g.items.length < 2) continue;
    // going "up" (b < a): the higher source turns first; going "down": the lower source turns first
    const ups = g.items.filter((c) => c.channel.b < c.channel.a).sort((p, q) => p.channel.a - q.channel.a || p.channel.b - q.channel.b);
    const downs = g.items.filter((c) => c.channel.b >= c.channel.a).sort((p, q) => q.channel.a - p.channel.a || q.channel.b - p.channel.b);
    const tracks = [];              // each: list of [lo, hi] spans
    const assign = (c) => {
      const lo = Math.min(c.channel.a, c.channel.b) - R.track, hi = Math.max(c.channel.a, c.channel.b) + R.track;
      let k = 0;
      for (; k < tracks.length; k++) if (!tracks[k].some(([a, b]) => hi > a && lo < b)) break;
      if (k === tracks.length) tracks.push([]);
      tracks[k].push([lo, hi]);
      c.track = k;
    };
    ups.forEach(assign); downs.forEach(assign);
    const K = tracks.length;
    const pitch = K > 1 ? Math.min(R.track, (g.hi - g.lo) / (K - 1)) : 0;
    for (const c of g.items) {
      // track 0 sits nearest the source side of the gutter
      const v = g.value + g.dirSign * (c.track - (K - 1) / 2) * pitch;
      const ch = c.channel;
      if (ch.axis === "x") { c.raw[1] = [v, c.raw[1][1]]; c.raw[2] = [v, c.raw[2][1]]; }
      else { c.raw[1] = [c.raw[1][0], v]; c.raw[2] = [c.raw[2][0], v]; }
    }
  }
}

/** The full flight path through a bus from one member to another: branch, trunk run, branch (rounded). */
export function busRoute(bus, fromId, toId) {
  const key = `${fromId}>${toId}`;
  if (bus.routes.has(key)) return bus.routes.get(key);
  const bf = bus.branches.find((b) => b.of === fromId && b.kind === "from") ?? bus.branches.find((b) => b.of === fromId);
  const bt = bus.branches.find((b) => b.of === toId && b.kind === "to") ?? bus.branches.find((b) => b.of === toId);
  if (!bf || !bt) return null;
  const raw = simplify([bf.port, bf.junction, bt.junction, bt.port]);
  const path = new Path(roundCorners(raw, SIZE.trace.corner));
  const r = { raw, path, bf, bt, lenF: Math.hypot(bf.junction[0] - bf.port[0], bf.junction[1] - bf.port[1]) };
  bus.routes.set(key, r);
  return r;
}
