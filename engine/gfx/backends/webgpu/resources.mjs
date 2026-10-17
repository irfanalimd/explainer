// GPU memory for the WebGPU backend: growable buffers for the packed DrawList, a per-frame uniform arena, and
// the render targets (those sized by quality, and those sized by the canvas).
import { HDR, DEPTH, MSAA, VEL } from "./pipelines.mjs";


/** A buffer that grows geometrically and takes a Float32Array prefix each frame. */
export class GpuArray {
  constructor(device, usage, label) { this.device = device; this.usage = usage | GPUBufferUsage.COPY_DST; this.label = label; this.buf = null; this.cap = 0; }
  write(data, floats = data.length) {
    const bytes = Math.max(16, floats * 4);
    if (bytes > this.cap) {
      this.buf?.destroy();
      this.cap = Math.ceil(Math.max(bytes, this.cap * 1.5, 4096) / 16) * 16;   // binding sizes must stay aligned
      this.buf = this.device.createBuffer({ label: this.label, size: this.cap, usage: this.usage });
    }
    if (floats) this.device.queue.writeBuffer(this.buf, 0, data.buffer, data.byteOffset, floats * 4);
    return this.buf;
  }
}

/**
 * Uniform blocks for one frame, packed at 256-byte offsets into fixed 64 KB chunks (so a binding is valid as soon
 * as it is pushed, even mid-encode) and uploaded once by flush().
 */
const CHUNK = 16384;             // floats
export class UniformArena {
  constructor(device) { this.device = device; this.chunks = []; this.i = 0; this.n = 0; }
  begin() { this.i = 0; this.n = 0; for (const c of this.chunks) c.used = 0; }
  push(values) {
    const span = Math.ceil(values.length / 64) * 64;
    if (this.n + span > CHUNK) { this.i++; this.n = 0; }
    const c = this.chunks[this.i] ??= {
      cpu: new Float32Array(CHUNK), used: 0,
      gpu: this.device.createBuffer({ label: "uniforms", size: CHUNK * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }),
    };
    c.cpu.set(values, this.n);
    const slot = { buffer: c.gpu, offset: this.n * 4, size: values.length * 4 };
    this.n += span; c.used = this.n;
    return slot;
  }
  flush() { for (const c of this.chunks) if (c.used) this.device.queue.writeBuffer(c.gpu, 0, c.cpu.buffer, 0, c.used * 4); }
}

const texture = (device, label, w, h, format, { samples = 1 } = {}) =>
  device.createTexture({ label, size: [Math.max(1, w), Math.max(1, h)], format, sampleCount: samples, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });

/** Targets whose size comes from the quality preset (shadow and plan-space maps). */
export function qualityTargets(device, Q) {
  return {
    shadow: texture(device, "shadow", Q.shadow, Q.shadow, DEPTH),
    shadowMin: texture(device, "shadowMin", Q.shadow / 16, Q.shadow / 16, "r32float"),
    shadowNear: texture(device, "shadowNear", Q.shadow / 16, Q.shadow / 16, "r32float"),
    contact: texture(device, "contact", Q.contact, Q.contact, HDR),
    bounce: texture(device, "bounce", Q.bounce, Q.bounce, HDR),
  };
}

/** Targets sized by the canvas: floor layer, groove ids, the MSAA scene and its motion, history, bloom, tilt-shift, reflection. */
export function sizeTargets(device, W, H, Q) {
  const T = (label, w, h, format = HDR, o) => texture(device, label, w, h, format, o);
  const chain = (label, n, w, h) => {
    const out = [];
    for (let i = 0; i < n; i++) { w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); out.push({ tex: T(`${label}${i}`, w, h), w, h }); }
    return out;
  };
  const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
  return {
    W, H,
    layer0: T("layer0", W, H), layer1: T("layer1", W, H),
    ids: T("ids", W, H, "r32float"), idDepth: T("idDepth", W, H, DEPTH),
    msColor: T("msColor", W, H, HDR, { samples: MSAA }), msEmis: T("msEmis", W, H, HDR, { samples: MSAA }),
    msDepth: T("msDepth", W, H, DEPTH, { samples: MSAA }),
    msVel: T("msVel", W, H, VEL, { samples: MSAA }), vel: T("vel", W, H, VEL),
    color: T("color", W, H), emis: T("emis", W, H), glass: T("glass", W, H),
    history: [T("historyA", W, H), T("historyB", W, H)],
    down: chain("bloomDown", Q.bloom, W, H), up: chain("bloomUp", Q.bloom, W, H),
    dof: Q.dof ? chain("dof", 2, W, H) : null,
    refl: T("refl", hw, hh), reflAux: T("reflAux", hw, hh), reflDepth: T("reflDepth", hw, hh, DEPTH),
    reflBlur: chain("reflBlur", 3, hw, hh),
  };
}

export function destroyTargets(t) {
  for (const v of Object.values(t ?? {})) {
    if (Array.isArray(v)) v.forEach((x) => (x.tex ?? x).destroy?.());
    else v?.destroy?.();
  }
}
