// Polylines with an arc-length table, and corner rounding by arc sampling. Used for traces, buses, flight
// paths and lane diagonals: everything that is placed "by distance along" a line.
import { SIZE } from "../tokens.mjs";

export class Path {
  /** @param {number[][]} points [[x, y], ...] already rounded */
  constructor(points) {
    const n = points.length;
    this.n = n;
    this.xy = new Float64Array(n * 2);
    this.cum = new Float64Array(n);
    let acc = 0;
    for (let i = 0; i < n; i++) {
      this.xy[2 * i] = points[i][0]; this.xy[2 * i + 1] = points[i][1];
      if (i) acc += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      this.cum[i] = acc;
    }
    this.length = acc;
    this._points = null;
  }
  get points() {
    if (!this._points) { this._points = []; for (let i = 0; i < this.n; i++) this._points.push([this.xy[2 * i], this.xy[2 * i + 1]]); }
    return this._points;
  }
  /** Write [x, y, headingDeg] at arc length s into out (clamped to the ends). */
  at(s, out = [0, 0, 0]) {
    const { n, xy, cum } = this;
    if (n === 0) { out[0] = out[1] = out[2] = 0; return out; }
    if (n === 1 || s <= 0) {
      out[0] = xy[0]; out[1] = xy[1];
      out[2] = n > 1 ? Math.atan2(xy[3] - xy[1], xy[2] - xy[0]) * 57.29577951308232 : 0;
      return out;
    }
    if (s >= this.length) {
      out[0] = xy[2 * n - 2]; out[1] = xy[2 * n - 1];
      out[2] = Math.atan2(xy[2 * n - 1] - xy[2 * n - 3], xy[2 * n - 2] - xy[2 * n - 4]) * 57.29577951308232;
      return out;
    }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / seg;
    const x0 = xy[2 * lo], y0 = xy[2 * lo + 1], x1 = xy[2 * hi], y1 = xy[2 * hi + 1];
    out[0] = x0 + (x1 - x0) * t; out[1] = y0 + (y1 - y0) * t;
    out[2] = Math.atan2(y1 - y0, x1 - x0) * 57.29577951308232;
    return out;
  }
  /** Arc length of the point on the path closest to (x, y). */
  project(x, y) {
    let best = Infinity, bestS = 0;
    for (let i = 1; i < this.n; i++) {
      const x0 = this.xy[2 * i - 2], y0 = this.xy[2 * i - 1], x1 = this.xy[2 * i], y1 = this.xy[2 * i + 1];
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / L2));
      const px = x0 + dx * t, py = y0 + dy * t, d = (px - x) ** 2 + (py - y) ** 2;
      if (d < best) { best = d; bestS = this.cum[i - 1] + t * Math.sqrt(L2); }
    }
    return bestS;
  }
  reversed() { return new Path(this.points.slice().reverse()); }
  /** n evenly spaced points (for morphing one route into another). */
  resample(count) {
    const out = [], tmp = [0, 0, 0];
    for (let i = 0; i < count; i++) { this.at((this.length * i) / Math.max(1, count - 1), tmp); out.push([tmp[0], tmp[1]]); }
    return out;
  }
}

/** Drop repeated and collinear interior points of a raw polyline. */
export function simplify(raw, eps = 0.01) {
  const pts = [];
  for (const p of raw) {
    const q = pts[pts.length - 1];
    if (q && Math.abs(q[0] - p[0]) < eps && Math.abs(q[1] - p[1]) < eps) continue;
    pts.push([p[0], p[1]]);
  }
  for (let i = pts.length - 2; i >= 1; i--) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
    if (Math.abs(cross) < eps * 10 && dot >= 0) pts.splice(i, 1);
  }
  return pts;
}

/**
 * Round every interior corner with an arc of radius <= r (limited so neighbouring arcs never overlap),
 * sampled every ~6 degrees. Returns the new point list.
 */
export function roundCorners(raw, r = SIZE.trace.corner, stepDeg = 6) {
  const pts = simplify(raw);
  if (pts.length < 3 || r <= 0) return pts;
  const n = pts.length;
  const segLen = [];
  for (let i = 0; i < n - 1; i++) segLen.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  const out = [pts[0]];
  for (let i = 1; i < n - 1; i++) {
    const p = pts[i - 1], v = pts[i], q = pts[i + 1];
    const ux = (v[0] - p[0]) / segLen[i - 1], uy = (v[1] - p[1]) / segLen[i - 1];
    const wx = (q[0] - v[0]) / segLen[i], wy = (q[1] - v[1]) / segLen[i];
    const cos = Math.max(-1, Math.min(1, ux * wx + uy * wy));
    const theta = Math.acos(cos);                       // turn angle
    if (theta < 1e-3) { out.push(v); continue; }
    const tanH = Math.tan(theta / 2);
    // available run on each side: whole segment at the path ends, half of it between two corners
    const availIn = i - 1 === 0 ? segLen[i - 1] : segLen[i - 1] / 2;
    const availOut = i + 1 === n - 1 ? segLen[i] : segLen[i] / 2;
    let t = Math.min(r * tanH, availIn, availOut);
    if (theta > Math.PI - 1e-3) { out.push(v); continue; }
    const rr = t / tanH;
    const ax = v[0] - ux * t, ay = v[1] - uy * t;
    const bx = v[0] + wx * t, by = v[1] + wy * t;
    const side = ux * wy - uy * wx > 0 ? 1 : -1;        // left or right turn
    const cx = ax - uy * rr * side, cy = ay + ux * rr * side;
    const a0 = Math.atan2(ay - cy, ax - cx);
    const steps = Math.max(2, Math.ceil((theta * 180 / Math.PI) / stepDeg));
    out.push([ax, ay]);
    for (let k = 1; k < steps; k++) {
      const a = a0 + side * theta * (k / steps);
      out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    out.push([bx, by]);
  }
  out.push(pts[n - 1]);
  return simplify(out, 1e-6);
}

export const roundedPath = (raw, r) => new Path(roundCorners(raw, r));
