// GPU timestamps for the frame graph. Two readings, because on tile-based GPUs (Apple) a render pass's
// begin/end timestamps bracket its vertex start and fragment end, and the GPU overlaps one pass's fragment
// work with the next one's vertex work: spans taken inside one busy frame overlap, so per-pass numbers from
// a normal frame add up to more than the frame. So:
//   frame span: first pass begin to last pass end of a normal frame (reliable; what stats().gpuMs reports)
//   per pass:   each graph node re-encoded alone (a few times back to back, so the GPU stays clocked up) in its
//               own submit, the CPU waiting for the GPU in between, so nothing else overlaps it (profile());
//               their sum is an upper bound of the frame span. On a GPU shared with other work (other tabs and
//               apps, which only ever add), the lowest of several trials is the honest figure.
// Chrome rounds timestamps to 100 us unless --enable-webgpu-developer-features is on.

export class GpuTimer {
  constructor(device, slots) {
    this.device = device; this.slots = slots;
    this.set = device.createQuerySet({ type: "timestamp", count: slots * 2 });
    this.resolveBuf = device.createBuffer({ size: slots * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    this.free = [0, 1, 2].map(() => device.createBuffer({ size: slots * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
    this.probe = null;     // profile()'s own readback, so it never competes with the live frames for `free`
    this.frameMs = 0;
  }
  /** timestampWrites for a render pass of graph node i: the first pass marks its begin, every pass its end. */
  writes(i, first) {
    return first ? { querySet: this.set, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 }
      : { querySet: this.set, endOfPassWriteIndex: 2 * i + 1 };
  }
  /** Copy this frame's stamps out; returns a readback handle (or null when every readback is still in flight). */
  resolve(enc, buf = this.free.pop()) {
    if (!buf) return null;
    enc.resolveQuerySet(this.set, 0, this.slots * 2, this.resolveBuf, 0);
    enc.copyBufferToBuffer(this.resolveBuf, 0, buf, 0, this.slots * 16);
    return buf;
  }
  /** After submit: read the spans (ms per node index, for the nodes that ran). */
  async read(buf, ran) {
    await buf.mapAsync(GPUMapMode.READ);
    const t = new BigUint64Array(buf.getMappedRange().slice(0));
    buf.unmap();
    if (buf !== this.probe) this.free.push(buf);
    const spans = new Map(), ends = new Map();
    let lo = null, hi = null;
    for (const i of ran) {
      const b = t[2 * i], e = t[2 * i + 1];
      if (!(e > b)) continue;
      spans.set(i, Number(e - b) / 1e6);
      if (lo == null || b < lo) lo = b;
      if (hi == null || e > hi) hi = e;
    }
    // end stamps in ms after the earliest begin (profile's per-pass breakdown)
    if (lo != null) for (const i of ran) if (spans.has(i)) ends.set(i, Number(t[2 * i + 1] - lo) / 1e6);
    return { spans, ends, frame: lo == null ? 0 : Number(hi - lo) / 1e6 };
  }
  /** A readback reserved for profiling: resolve(enc, timer.probeBuffer()), then read() it before the next. */
  probeBuffer() {
    return (this.probe ??= this.device.createBuffer({ size: this.slots * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));
  }
  /** Keep stats().gpuMs current without ever stalling a frame. */
  track(buf, ran) {
    if (buf) this.read(buf, ran).then((r) => { if (r.frame > 0) this.frameMs = r.frame; }).catch(() => {});
  }
}
