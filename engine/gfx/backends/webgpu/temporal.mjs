// Live temporal anti-aliasing: the CPU half of graph node "temporal" (post.mjs taaFS). Every live frame is drawn at
// the next of `samples` Halton offsets and resolved into a history. While something moves, the history is
// reprojected along the screen motion (the camera's, and each slab's from where it stood at the last frame drawn) and
// clipped to the new frame, so edges smooth out without ghosts; a slab whose look changed (recoloured, relabelled,
// fading) is marked reactive and trusts its history less. When a frame draws exactly what the last one did
// (paused, settled), the frames that follow are the capture's supersamples in order, averaged with its weights:
// after `samples` of them the still matches a captured frame, and `converging` turns false so drawing can stop.

const SLAB_STRIDE = 104, PICK = 35;          // pack.mjs: floats per slab, the pick index (into fr.ids)
// per slab at the last frame: the texels that place it (position and scale, size, rotation, well), then whether
// anything else about it (its look) changed
const PLACE = [0, 4, 8, 24];
export const PREV_FLOATS = 20;
const P = PREV_FLOATS;
// a slab's look: every float but its placement and pick index
const LOOK = Array.from({ length: SLAB_STRIDE }, (_, i) => i).filter((i) => i >= 12 && !(i >= 24 && i < 28) && i !== PICK);

function lookHash(A, o) {
  let h = 2166136261;
  const u = new Uint32Array(A.buffer, A.byteOffset + o * 4, SLAB_STRIDE);
  for (const i of LOOK) h = Math.imul(h ^ u[i], 16777619);
  return h;
}

/** FNV-1a over the bit patterns of a float array prefix. */
function hashFloats(h, a, n) {
  if (!a || !n) return h;
  const u = new Uint32Array(a.buffer, a.byteOffset, n);
  for (let i = 0; i < n; i++) h = Math.imul(h ^ u[i], 16777619);
  return h;
}

export class Temporal {
  /** @param samples supersamples a still converges over (the capture's count) */
  constructor(samples) {
    this.samples = samples;
    this.valid = false;      // the history holds a live frame of the current targets
    this.idx = 0;            // the history target written last
    this.frame = 0;          // live frames drawn (the jitter cycle while things move)
    this.streak = 0;         // frames in a row that drew the same picture
    this.sig = 0;
    this.prevVP = null;
    this.prev = new Map(); this.prevA = new Float32Array(0);
    this.cur = new Map(); this.curA = new Float32Array(0);
    this.prevH = new Int32Array(0); this.curH = new Int32Array(0);
    this.out = new Float32Array(0);
  }

  /** The history no longer matches the targets (resized, theme, capture): start over. */
  reset() { this.valid = false; this.streak = 0; }

  /** Still adding supersamples to a settled picture. */
  get converging() { return this.valid && this.streak < this.samples; }

  /**
   * Where each slab stood at the last frame drawn: its placing texels (PLACE) and whether its look changed, 20 floats
   * per slab, matched by pose id and, as one pose draws several slabs, by their order within it (new or unnamed
   * slabs: where they stand now).
   */
  placements(A, n, ids) {
    if (this.curA.length < n * P) { this.curA = new Float32Array(n * P * 2); this.out = new Float32Array(n * P * 2); }
    if (this.curH.length < n) this.curH = new Int32Array(n * 2);
    const curH = this.curH, prevH = this.prevH;
    const out = this.out, cur = this.curA, now = this.cur, prev = this.prev, prevA = this.prevA;
    now.clear();
    const seen = this.seen ??= new Map();
    seen.clear();
    for (let k = 0; k < n; k++) {
      const o = k * SLAB_STRIDE, d = k * P, pick = A[o + PICK];
      for (let t = 0; t < 4; t++) for (let i = 0; i < 4; i++) cur[d + t * 4 + i] = A[o + PLACE[t] + i];
      curH[k] = lookHash(A, o);
      let key;
      if (pick >= 0) { const id = ids[pick], m = seen.get(id) ?? 0; seen.set(id, m + 1); key = `${id}#${m}`; }
      const j = key === undefined ? undefined : prev.get(key);
      if (key !== undefined) now.set(key, k);
      out.set(j === undefined ? cur.subarray(d, d + 16) : prevA.subarray(j * P, j * P + 16), d);
      out[d + 16] = j === undefined || prevH[j] !== curH[k] ? 1 : 0;
    }
    // this frame's placements are the next frame's previous ones
    [this.prev, this.cur] = [now, prev];
    [this.prevA, this.curA] = [cur, prevA];
    [this.prevH, this.curH] = [curH, prevH];
    return out;
  }

  /**
   * Plan one live frame. `arrays`: [floatArray, count] pairs of everything the frame draws. Returns the jitter index,
   * the static share (0: something moved), and the history targets to read and write. `moving` treats the frame as
   * moved whatever it draws (benchmarks of the full resolve).
   */
  plan(arrays, history, moving = false) {
    let h = 2166136261;
    for (const [a, n] of arrays) h = hashFloats(h, a, n);
    const same = this.valid && h === this.sig && !moving;
    this.sig = h;
    this.streak = same ? this.streak + 1 : 0;
    const from = history[this.idx], to = history[this.idx ^ 1];
    this.idx ^= 1;
    const valid = this.valid;
    this.valid = true;
    this.frame++;
    if (!same) return { jitter: this.frame % this.samples, share: 0, valid, from, to };
    // a settled picture: supersample k of the capture's sequence (k = 0 replaces the history); then hold it
    const k = this.streak - 1;
    // held: a share too small to change the converged still (the resolve copies it)
    return k < this.samples ? { jitter: k, share: null, k, valid, from, to } : { jitter: this.samples - 1, share: 1e-9, valid, from, to, held: true };
  }
}
