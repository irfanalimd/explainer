// Picking on the CPU: the camera ray against every packed slab's oriented box (pack.mjs layout), nearest hit
// wins. Exact for the boxes, ignoring rounded corners; used by backends that cannot read a pixel back
// synchronously. Pure, DOM-free.
import { SLAB_FLOATS } from "./pack.mjs";

/** Returns the index into fr.ids of the nearest slab under the ray, or -1. */
export function pickSlab(fr, origin, dir) {
  const A = fr.slabs;
  let best = Infinity, hit = -1;
  for (let i = 0; i < fr.nSlabs; i++) {
    const o = i * SLAB_FLOATS;
    const pickId = A[o + 35];
    if (!(pickId >= 0)) continue;
    const sc = A[o + 3], w = A[o + 4] * sc, d = A[o + 5] * sc, h = A[o + 6] * sc;
    const R = rotation(A[o + 9], A[o + 10], A[o + 11]);
    // world = pos + piv + R (q - piv) with q in the scaled local box, piv = (0, 0, h / 2)
    const rel = [origin[0] - A[o], origin[1] - A[o + 1], origin[2] - A[o + 2] - h / 2];
    const lo = mulT(R, rel), ld = mulT(R, dir);
    lo[2] += h / 2;
    const t = slabT(lo, ld, [-w / 2, -d / 2, 0], [w / 2, d / 2, h]);
    if (t >= 0 && t < best) { best = t; hit = pickId; }
  }
  return hit;
}

// Rz(yaw) Rx(pitch) Ry(roll), columns, as slabRot in the shaders
function rotation(y, p, r) {
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r);
  const Rz = [[cy, sy, 0], [-sy, cy, 0], [0, 0, 1]], Rx = [[1, 0, 0], [0, cp, sp], [0, -sp, cp]], Ry = [[cr, 0, -sr], [0, 1, 0], [sr, 0, cr]];
  return mulM(Rz, mulM(Rx, Ry));
}
const col = (M, v) => [0, 1, 2].map((r) => M[0][r] * v[0] + M[1][r] * v[1] + M[2][r] * v[2]);
const mulM = (A, B) => B.map((c) => col(A, c));
const mulT = (M, v) => M.map((c) => c[0] * v[0] + c[1] * v[1] + c[2] * v[2]);

function slabT(o, d, lo, hi) {
  let t0 = -Infinity, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return -1; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t1 < 0 ? -1 : Math.max(t0, 0);
}
