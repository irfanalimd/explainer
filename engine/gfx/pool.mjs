// A growable Float32Array pool for the per-frame packing. Pure, DOM-free.

/** Growable Float32Array pool: reused every frame, grows geometrically. */
export class FloatPool {
  constructor(n = 1024) { this.a = new Float32Array(n); this.n = 0; }
  reset() { this.n = 0; }
  reserve(k) {
    if (this.n + k > this.a.length) {
      const b = new Float32Array(Math.max(this.n + k, this.a.length * 2));
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
    const o = this.n; this.n += k; return o;
  }
}
