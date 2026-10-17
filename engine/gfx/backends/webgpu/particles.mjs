// Data in motion on the GPU: packs the frame's motion emitters (engine/gfx/motion.mjs), evaluates every particle
// in one compute dispatch (graph node "motion"), and draws them inside the main pass, depth-tested against the
// world, into the colour and emission targets (so they bloom), and into the floor's mirror image (graph node
// "reflection": the same sprites seen from below the floor, at half size, blurred with it). Emitters are a few dozen; particles are bounded
// by MOTION_FX.maxParticles.
import { PARTICLES_CS, PARTICLES_RS } from "./wgsl/particles.mjs";
import { HDR, DEPTH, MSAA, mainTargets } from "./pipelines.mjs";
import { EMIT, PATH_N } from "../../motion.mjs";
import { MOTION_FX as FX } from "../../../tokens.mjs";
import { linear } from "../../color.mjs";

const EM_FLOATS = 16, P_FLOATS = 8, WG = 64;
const PREMULT = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };

/** How many particles an emitter makes. */
function countOf(e) {
  if (e.type === EMIT.trail) return Math.min(512, Math.ceil((e.s1 - e.s0) / FX.trail.spacing) + 1);
  if (e.type === EMIT.bytes) return 2 * e.n;
  return e.n;
}

export async function createParticles(device) {
  const S = GPUShaderStage, B = GPUBufferUsage;
  const csLayout = device.createBindGroupLayout({ label: "particlesCS", entries: [
    { binding: 0, visibility: S.COMPUTE, buffer: { type: "uniform" } },
    { binding: 1, visibility: S.COMPUTE, buffer: { type: "read-only-storage" } },
    { binding: 2, visibility: S.COMPUTE, buffer: { type: "read-only-storage" } },
    { binding: 3, visibility: S.COMPUTE, buffer: { type: "storage" } },
  ] });
  const rsLayout = device.createBindGroupLayout({ label: "particlesRS", entries: [
    { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: { type: "uniform" } },
    { binding: 1, visibility: S.VERTEX, buffer: { type: "read-only-storage" } },
  ] });
  const cs = device.createShaderModule({ label: "particlesCS", code: PARTICLES_CS });
  const rs = device.createShaderModule({ label: "particlesRS", code: PARTICLES_RS });
  const sprites = (label, targets, samples, constants = {}) => device.createRenderPipelineAsync({
    label, layout: device.createPipelineLayout({ bindGroupLayouts: [rsLayout] }),
    vertex: { module: rs, entryPoint: "particleVS", constants },
    fragment: { module: rs, entryPoint: "particleFS", targets },
    primitive: { topology: "triangle-strip" },
    depthStencil: { format: DEPTH, depthWriteEnabled: false, depthCompare: "less-equal" },
    multisample: { count: samples },
  });
  const [compute, render, mirror] = await Promise.all([
    device.createComputePipelineAsync({ label: "particles", layout: device.createPipelineLayout({ bindGroupLayouts: [csLayout] }), compute: { module: cs, entryPoint: "particlesCS" } }),
    sprites("particles", mainTargets(PREMULT, "reactive"), MSAA),
    sprites("particlesMirror", [{ format: HDR, blend: PREMULT }, { format: HDR, blend: PREMULT }], 1, { MIRROR: 1 }),
  ]);

  const cap = FX.maxParticles;
  const params = device.createBuffer({ label: "particleParams", size: 16, usage: B.UNIFORM | B.COPY_DST });
  const particles = device.createBuffer({ label: "particles", size: cap * P_FLOATS * 4, usage: B.STORAGE });
  let emBuf = null, emCap = 0, ptBuf = null, ptCap = 0, csGroup = null;
  let em = new Float32Array(EM_FLOATS * 16), pts = new Float32Array(PATH_N * 2 * 4);
  const p4 = new ArrayBuffer(16), pf = new Float32Array(p4), pu = new Uint32Array(p4);
  const grow = (buf, have, bytes, label) => (bytes <= have ? [buf, have] : (buf?.destroy(), [device.createBuffer({ label, size: bytes, usage: B.STORAGE | B.COPY_DST }), bytes]));

  const api = {
    count: 0, emitters: 0,
    /** Pack and upload this frame's emitters (dl.motion, or null). */
    update(motion) {
      api.count = 0;
      const list = motion?.emitters ?? [];
      if (!list.length) return;
      if (em.length < list.length * EM_FLOATS) em = new Float32Array(list.length * EM_FLOATS * 2);
      let first = 0, n = 0;
      for (const e of list) {
        const c = Math.min(countOf(e), cap - first);
        if (c <= 0) break;
        const o = n * EM_FLOATS, col = linear(e.color);
        em.set([e.type, first, c, e.path ?? 0, col[0], col[1], col[2], e.intensity], o);
        if (e.type === EMIT.trail) em.set([e.L, e.s0, e.s1, e.width, e.z0, e.z1, (e.s1 - e.s0) / Math.max(1, c - 1), e.seed], o + 8);
        else if (e.type === EMIT.bytes) em.set([e.L, e.head, e.zHead, e.age, e.flow, e.seed, motion.time, 0], o + 8);
        else em.set([e.x, e.y, e.z, e.age, e.w, e.d, e.seed, 0], o + 8);
        first += c; n++;
      }
      const paths = motion.paths ?? [];
      const need = Math.max(1, paths.length) * PATH_N * 2;
      if (pts.length < need) pts = new Float32Array(need * 2);
      paths.forEach((p, i) => pts.set(p, i * PATH_N * 2));
      const [eb, ec] = grow(emBuf, emCap, Math.max(256, em.byteLength), "emitters");
      const [pb, pc] = grow(ptBuf, ptCap, Math.max(256, pts.byteLength), "motionPaths");
      if (eb !== emBuf || pb !== ptBuf) csGroup = null;
      emBuf = eb; emCap = ec; ptBuf = pb; ptCap = pc;
      device.queue.writeBuffer(emBuf, 0, em.buffer, 0, n * EM_FLOATS * 4);
      device.queue.writeBuffer(ptBuf, 0, pts.buffer, 0, need * 4);
      pf[0] = motion.time; pu[1] = n; pu[2] = first; pf[3] = motion.light ? 1 : 0;
      device.queue.writeBuffer(params, 0, p4);
      csGroup ??= device.createBindGroup({ layout: csLayout, entries: [
        { binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: emBuf } },
        { binding: 2, resource: { buffer: ptBuf } }, { binding: 3, resource: { buffer: particles } },
      ] });
      api.count = first; api.emitters = n;
    },
    /** This frame's packed emitters: [floats, count] (what the temporal resolve compares frame to frame). */
    packed: () => [em, api.count ? api.emitters * EM_FLOATS : 0],
    /** Evaluate every particle (one compute pass, opened by the frame graph so it is timed). */
    simulate(beginCompute) {
      const p = beginCompute({ label: "motion" });
      p.setPipeline(compute); p.setBindGroup(0, csGroup);
      p.dispatchWorkgroups(Math.ceil(api.count / WG));
      p.end();
    },
    /** Draw them into an open main pass (or, mirrored, the reflection pass); the caller restores its own bind group after. */
    draw(pass, frameSlot, mirrored = false) {
      pass.setPipeline(mirrored ? mirror : render);
      pass.setBindGroup(0, device.createBindGroup({ layout: rsLayout, entries: [{ binding: 0, resource: frameSlot }, { binding: 1, resource: { buffer: particles } }] }));
      pass.draw(4, api.count);
    },
  };
  return api;
}
