// Exact Euclidean distance transform (Felzenszwalb & Huttenlocher 2012) and signed distance fields from
// anti-aliased coverage, used to turn canvas-rasterised strings into SDF bitmaps. Pure, DOM-free.

const INF = 1e20;

// 1D squared-distance transform of f[0..n) in place, using scratch arrays v (Int32) and z (Float64) and d for the result.
// A line whose values are all equal comes out unchanged (each parabola's own centre is its minimum, and c - c is exactly
// 0), so it is left as it is: most of a string's inner field, and its padding, are such lines.
function edt1d(f, n, d, v, z) {
  const f0 = f[0];
  let flat = true;
  for (let q = 1; q < n; q++) if (f[q] !== f0) { flat = false; break; }
  if (flat) return;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1, k = 0; q < n; q++) {
    const fq = f[q];
    let s;
    do {
      const r = v[k];
      s = (fq - f[r] + q * q - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    d[q] = f[r] + (q - r) * (q - r);
  }
  for (let q = 0; q < n; q++) f[q] = d[q];
}

// scratch reused across calls (grown when a bigger string needs it): a string's SDF allocates only its result
let scratchN = 0, line, d1, v1, z1;
function scratch(n) {
  if (n <= scratchN) return;
  scratchN = n; line = new Float64Array(n); d1 = new Float64Array(n); v1 = new Int32Array(n); z1 = new Float64Array(n + 1);
}

/** In-place 2D squared EDT of grid (w*h Float64Array: 0 at sites, INF elsewhere, or fractional seeds). */
export function edt2d(grid, w, h) {
  scratch(Math.max(w, h));
  // columns: each copied into a contiguous line, transformed, copied back (the same arithmetic, cache-friendly)
  for (let x = 0; x < w; x++) {
    for (let y = 0, i = x; y < h; y++, i += w) line[y] = grid[i];
    edt1d(line, h, d1, v1, z1);
    for (let y = 0, i = x; y < h; y++, i += w) grid[i] = line[y];
  }
  for (let y = 0; y < h; y++) {
    const row = grid.subarray(y * w, y * w + w);
    edt1d(row, w, d1, v1, z1);
  }
  return grid;
}

let fieldN = 0, outerF, innerF;

/**
 * Signed distance field from coverage alpha (0..255, w*h). Inside and outside transforms are both exact;
 * partially covered pixels seed sub-pixel distances (as in Mapbox TinySDF), so curves stay smooth.
 * Returns Uint8Array: 128 on the edge, 255 at `spread` px inside, 0 at `spread` px outside.
 */
export function sdfFromAlpha(alpha, w, h, spread) {
  const size = w * h;
  if (size > fieldN) { fieldN = size; outerF = new Float64Array(size); innerF = new Float64Array(size); }
  const outer = outerF.subarray(0, size), inner = innerF.subarray(0, size);
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
