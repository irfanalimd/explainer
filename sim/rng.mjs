// Seeded, deterministic PRNG for every simulation (xoshiro128** seeded through a 128-bit string hash).
// rng(seed) -> { next, u32, int, float, pick, shuffle, sample, weighted, chance, exp, normal, fork, clone, seed }
// A superset of engine/scene/rng.mjs's surface, so compile(figure, { rng }) can make it the builder's s.rng.
// fork(label) derives a child stream from the parent's *seed path* (not its position), so adding a draw
// in one stream never shifts another: rng(7).fork("net") is always the same stream as rng("7/net").

const rotl = (x, k) => (x << k) | (x >>> (32 - k));

/** The raw xoshiro128** generator over four 32-bit words (exported for known-answer tests). */
export function xoshiro128ss(a, b, c, d) {
  let s0 = a | 0, s1 = b | 0, s2 = c | 0, s3 = d | 0;
  const next = () => {
    const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
    const t = s1 << 9;
    s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11);
    return result;
  };
  next.state = () => [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0];
  return next;
}

/** cyrb128: a fast 128-bit string hash (four 32-bit words). */
export function hash128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

// splitmix32 finaliser: decorrelates the hash words before they become generator state
function mix32(x) {
  x = (x + 0x9e3779b9) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

const TWO32 = 4294967296;

function seedKey(seed) {
  if (seed === undefined || seed === null) return "1";
  if (typeof seed === "number" && !Number.isFinite(seed)) throw new TypeError(`rng: seed must be finite, got ${seed}`);
  return String(seed);
}

/**
 * @param {number|string} [seed=1]  equal seeds give equal streams; 7 and "7" are the same seed
 */
export function rng(seed = 1) {
  const key = seedKey(seed);
  return fromKey(key);
}

function fromKey(key) {
  const h = hash128(key);
  let w = [mix32(h[0]), mix32(h[1] ^ 0x85ebca6b), mix32(h[2] ^ 0xc2b2ae35), mix32(h[3] ^ 0x27d4eb2f)];
  if ((w[0] | w[1] | w[2] | w[3]) === 0) w = [1, 2, 3, 4]; // the all-zero state is a fixed point
  return make(key, xoshiro128ss(w[0], w[1], w[2], w[3]));
}

function make(key, gen) {
  const u32 = () => gen();
  const next = () => gen() / TWO32;

  // uniform integer in [0, n) without modulo bias, n <= 2^53
  const below = (n) => {
    if (n <= TWO32) {
      const limit = TWO32 - (TWO32 % n);
      let x;
      do x = gen(); while (x >= limit);
      return x % n;
    }
    // wide ranges: 53 random bits, rejection on the top
    const max = 2 ** 53, limit = max - (max % n);
    let x;
    do x = gen() * 2097152 + (gen() >>> 11); while (x >= limit);
    return x % n;
  };

  const self = {
    /** the seed path this stream was made from */
    seed: key,
    /** float in [0, 1) */
    next,
    /** uint32 */
    u32,
    /** integer in [a, b], both inclusive (non-integer bounds: the integers between them) */
    int(a, b) {
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new TypeError(`rng.int(a, b) needs two finite numbers, got ${a}, ${b}`);
      const lo = Math.ceil(a), hi = Math.floor(b);
      if (hi < lo) throw new RangeError(`rng.int(${a}, ${b}): no integer in range`);
      return lo + below(hi - lo + 1);
    },
    /** float in [a, b) */
    float(a = 0, b = 1) { return a + (b - a) * next(); },
    /** true with probability p */
    chance(p) { return next() < p; },
    bool() { return (gen() & 1) === 1; },
    /** a uniformly chosen element (undefined for an empty array, like the scene's local RNG) */
    pick(arr) {
      if (!arr || arr.length === 0) return undefined;
      return arr[below(arr.length)];
    },
    /** a shuffled copy (Fisher–Yates); the input is not modified */
    shuffle(arr) {
      const out = Array.from(arr);
      for (let i = out.length - 1; i > 0; i--) {
        const j = below(i + 1);
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
    /** k distinct elements in random order */
    sample(arr, k) {
      const a = Array.from(arr);
      if (k > a.length) throw new RangeError(`rng.sample: k = ${k} > ${a.length}`);
      for (let i = 0; i < k; i++) {
        const j = i + below(a.length - i);
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a.slice(0, k);
    },
    /** an element chosen with probability proportional to its weight */
    weighted(items, weights) {
      const ws = weights ?? items.map((x) => x.weight);
      let total = 0;
      for (const w of ws) { if (!(w >= 0)) throw new RangeError("rng.weighted: weights must be >= 0"); total += w; }
      if (!(total > 0)) throw new RangeError("rng.weighted: total weight is 0");
      let r = next() * total;
      for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
      return items[items.length - 1];
    },
    /** exponential with the given mean */
    exp(mean = 1) { return -Math.log(1 - next()) * mean; },
    /** normal (Box–Muller, two draws per call, no cached spare) */
    normal(mu = 0, sd = 1) {
      const u = 1 - next(), v = next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    /** an independent stream named by label; pure in (seed path, label) */
    fork(label) { return fromKey(`${key}/${String(label)}`); },
    /** a copy that continues from the current position */
    clone() {
      const [a, b, c, d] = gen.state();
      return make(key, xoshiro128ss(a, b, c, d));
    },
  };
  return self;
}

export default rng;
