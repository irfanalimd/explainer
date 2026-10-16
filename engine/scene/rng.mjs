// Seeded deterministic RNG for `s.rng` (same surface as sim/rng.mjs; a caller may inject that one via
// compile(..., { rng })). sfc32 core seeded through a string hash, so fork(label) gives independent streams.
import { hashString } from "./util.mjs";

function seeds(seed) {
  const h = hashString(String(seed));
  const a = parseInt(h.slice(0, 7), 16), b = parseInt(h.slice(7, 14), 16);
  return [a >>> 0, b >>> 0, (a ^ 0x9e3779b9) >>> 0, (b ^ 0x85ebca6b) >>> 0];
}

export function rng(seed = 1) {
  let [a, b, c, d] = seeds(seed);
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  const self = {
    next,
    float: (lo = 0, hi = 1) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
      return out;
    },
    exp: (mean) => -Math.log(1 - next()) * mean,
    normal: (mu = 0, sd = 1) => {
      const u = 1 - next(), v = next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    fork: (label) => rng(`${seed}/${label}`),
  };
  return self;
}
