// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher 2012) and signed distance fields from
// anti-aliased coverage, used to turn canvas-rasterised strings into SDF bitmaps. Pure, DOM-free.

const INF = 1e20;

// 1D squared-distance transform of f (length n) in place, using scratch arrays v (Int32) and z (Float64).
function edt1d(f, offset, stride, n, d, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1, k = 0; q < n; q++) {
    const fq = f[offset + q * stride];
    let s;
    do {
      const r = v[k];
      s = (fq - f[offset + r * stride] + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    d[q] = f[offset + r * stride] + (q - r) * (q - r);
  }
  for (let q = 0; q < n; q++) f[offset + q * stride] = d[q];
}

/** In-place 2D squared EDT of grid (w*h Float64Array: 0 at sites, INF elsewhere, or fractional seeds). */
export function edt2d(grid, w, h) {
  const n = Math.max(w, h);
  const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, d, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, d, v, z);
  return grid;
}

/**
 * Signed distance field from coverage alpha (0..255, w*h). Inside and outside transforms are both exact;
 * partially covered pixels seed sub-pixel distances (as in Mapbox TinySDF), so curves stay smooth.
 * Returns Uint8Array: 128 on the edge, 255 at `spread` px inside, 0 at `spread` px outside.
 */
export function sdfFromAlpha(alpha, w, h, spread) {
  const size = w * h;
  const outer = new Float64Array(size), inner = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const a = alpha[i] / 255;
    if (a >= 0.999) { outer[i] = 0; inner[i] = INF; }
    else if (a <= 0.001) { outer[i] = INF; inner[i] = 0; }
    else {
      const o = Math.max(0, 0.5 - a), n = Math.max(0, a - 0.5);
      outer[i] = o * o; inner[i] = n * n;
    }
  }
  edt2d(outer, w, h);
  edt2d(inner, w, h);
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const dist = Math.sqrt(outer[i]) - Math.sqrt(inner[i]); // > 0 outside
    const v = 0.5 - dist / (2 * spread);
    out[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return out;
}
