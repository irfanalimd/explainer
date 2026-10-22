// The inputs a map pass drew from, kept so the next frame can tell whether that map would come out the same: the
// shadow, contact and bounce maps depend only on the slabs' placements and footprints and the world's bounds, not on
// the camera, so a frame that only moves the camera (or draws the same moment again) keeps them. Compared exactly, in
// doubles, so no two different inputs ever share a key.
export class MapKey {
  constructor() { this.a = new Float64Array(1024); this.b = new Float64Array(1024); this.n = 0; this.m = -1; }
  begin() { this.n = 0; return this; }
  room(k) {
    if (this.n + k <= this.a.length) return;
    const a = new Float64Array(Math.max(this.n + k, this.a.length * 2)); a.set(this.a.subarray(0, this.n)); this.a = a;
  }
  push(...v) { this.room(v.length); for (const x of v) this.a[this.n++] = x; return this; }
  range(src, from, count) { this.room(count); for (let i = 0; i < count; i++) this.a[this.n++] = src[from + i]; return this; }
  /** Whether the key just built is the one kept last; keeps it when not. */
  same() {
    const { a, b, n } = this;
    let same = n === this.m;
    for (let i = 0; same && i < n; i++) same = a[i] === b[i];
    if (!same) { if (b.length < n) this.b = new Float64Array(a.length); this.b.set(a.subarray(0, n)); this.m = n; }
    return same;
  }
}
