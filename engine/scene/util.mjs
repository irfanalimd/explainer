// Small pure helpers shared by the scene modules: math, easing, search, canonical JSON and a stable hash.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const smootherstep = (x) => { const t = clamp01(x); return t * t * t * (t * (t * 6 - 15) + 10); };
export const DEG = Math.PI / 180;

/** cubic-bezier(x1, y1, x2, y2) as a function of x in 0..1, tabulated once (fast and allocation-free). */
export function bezier([x1, y1, x2, y2], samples = 512) {
  const bx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const by = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  const table = new Float64Array(samples + 1);
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    let lo = 0, hi = 1, t = x;
    for (let k = 0; k < 40; k++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
    table[i] = by(t);
  }
  table[0] = 0; table[samples] = 1;
  const fn = (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const f = x * samples, i = f | 0;
    return table[i] + (table[i + 1] - table[i]) * (f - i);
  };
  return fn;
}

/** Critically damped approach from 0 to 1 that lands exactly at t = 1 (no overshoot, zero end velocity). */
export function settle(t, omega = 7) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const e = (x) => 1 - (1 + omega * x) * Math.exp(-omega * x);
  return e(t) / e(1);
}

/** Index of the last element with key(el) <= x, or -1. arr sorted by key ascending. */
export function lastLE(arr, x, key) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Same for a plain numeric (typed) array. */
export function lastLEn(arr, x, n = arr.length) {
  let lo = 0, hi = n - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** JSON with sorted keys; Maps and Sets become arrays; functions and undefined are skipped. */
export function canonical(v) {
  const seen = new Set();
  const walk = (x) => {
    if (x === null || x === undefined) return "null";
    const t = typeof x;
    if (t === "number") return Number.isFinite(x) ? String(Math.round(x * 1e9) / 1e9) : "null";
    if (t === "string") return JSON.stringify(x);
    if (t === "boolean") return x ? "true" : "false";
    if (t === "bigint") return JSON.stringify(String(x));
    if (t === "function" || t === "symbol") return "null";
    if (seen.has(x)) return "\"<cycle>\"";
    seen.add(x);
    let out;
    if (Array.isArray(x) || ArrayBuffer.isView(x)) out = "[" + Array.from(x, walk).join(",") + "]";
    else if (x instanceof Map) out = walk([...x.entries()]);
    else if (x instanceof Set) out = walk([...x]);
    else {
      const keys = Object.keys(x).filter((k) => x[k] !== undefined && typeof x[k] !== "function").sort();
      out = "{" + keys.map((k) => JSON.stringify(k) + ":" + walk(x[k])).join(",") + "}";
    }
    seen.delete(x);
    return out;
  };
  return walk(v);
}

/** cyrb53: a fast, well-mixed 53-bit string hash. Returned as 14 hex digits. */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, "0");
}

export const rectOf = (p) => ({ minX: p.x - p.w / 2, minY: p.y - p.d / 2, maxX: p.x + p.w / 2, maxY: p.y + p.d / 2 });

/** Grow bounds b (mutated, may be null) to include an axis-aligned box. */
export function growBounds(b, minX, minY, maxX, maxY, minZ = 0, maxZ = 0) {
  if (!b) return { minX, minY, maxX, maxY, minZ, maxZ };
  if (minX < b.minX) b.minX = minX;
  if (minY < b.minY) b.minY = minY;
  if (maxX > b.maxX) b.maxX = maxX;
  if (maxY > b.maxY) b.maxY = maxY;
  if (minZ < b.minZ) b.minZ = minZ;
  if (maxZ > b.maxZ) b.maxZ = maxZ;
  return b;
}

/** Approximate advance width of a mono string at a font size in u (Geist Mono is ~0.6 em per glyph). */
export const monoWidth = (text, size) => String(text ?? "").length * size * 0.6;
