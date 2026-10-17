// Bind group layouts and render pipelines for the WebGPU backend. Every scene pipeline shares one WGSL module
// (one binding numbering); each layout lists only the bindings its entry points touch.
import { COMMON } from "./wgsl/common.mjs";
import { LIGHTING } from "./wgsl/lighting.mjs";
import { SLAB } from "./wgsl/slab.mjs";
import { FLOOR } from "./wgsl/floor.mjs";
import { PLAN } from "./wgsl/plan.mjs";
import { GLASS } from "./wgsl/glass.mjs";
import { POST_WGSL } from "./wgsl/post.mjs";

export const HDR = "rgba16float";
export const DEPTH = "depth32float";
export const MSAA = 4;
export const VEL = HDR;      // screen motion (uv per frame), reactive (its look changed: trust the history less), coverage

const V = 1, Fs = 2, VF = 3;      // GPUShaderStage VERTEX, FRAGMENT, both
const uniform = (binding, visibility = VF) => ({ binding, visibility, buffer: { type: "uniform" } });
const storage = (binding, visibility = VF) => ({ binding, visibility, buffer: { type: "read-only-storage" } });
const tex = (binding, sampleType = "float") => ({ binding, visibility: Fs, texture: { sampleType } });
const sampler = (binding, type = "filtering") => ({ binding, visibility: Fs, sampler: { type } });

const LAYOUTS = {
  inst: [uniform(0, V), storage(1, V)],
  scene: [uniform(0), storage(1), tex(2), sampler(3), tex(4, "depth"), sampler(5, "comparison"), tex(6, "unfilterable-float"),
    tex(7), tex(8), tex(9), tex(10), tex(11), tex(12), tex(13), storage(17, V)],
  ink: [uniform(0), tex(2), sampler(3), storage(14, Fs), tex(15, "unfilterable-float")],
  plan: [uniform(0)],
  glassDepth: [uniform(0), storage(1)],
  glass: [uniform(0), storage(1), tex(2), sampler(3), tex(7), tex(12), tex(16)],
  shadowMin: [tex(4, "depth")],
  shadowNear: [tex(6, "unfilterable-float")],
  post: [tex(0), tex(1), tex(2), tex(3), sampler(4), uniform(5, Fs)],
};

const f4 = (location, n = 1, stride = 16 * n) => ({
  arrayStride: stride, stepMode: "instance",
  attributes: Array.from({ length: n }, (_, i) => ({ shaderLocation: location + i, format: "float32x4", offset: i * 16 })),
});
const TEMPLATE = [
  { arrayStride: 12, attributes: [{ shaderLocation: 0, format: "float32x3", offset: 0 }] },
  { arrayStride: 8, attributes: [{ shaderLocation: 1, format: "float32x2", offset: 0 }] },
];
const PREMULT = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } };
const ALPHA = { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha" } };
const ADD = { color: { srcFactor: "one", dstFactor: "one" }, alpha: { srcFactor: "one", dstFactor: "one" } };
const MAX = { color: { operation: "max", srcFactor: "one", dstFactor: "one" }, alpha: { operation: "max", srcFactor: "one", dstFactor: "one" } };
const targets = (n, blend, format = HDR) => Array.from({ length: n }, () => ({ format, ...(blend ? { blend } : {}) }));
const depth = (o = {}) => ({ format: DEPTH, depthWriteEnabled: true, depthCompare: "less", ...o });
// the main pass's targets: colour, emission and screen motion (a fading solid owns the motion once it is a third
// opaque). motion "reactive" keeps the motion beneath and only raises the reactive channel (decals, glows)
const BLUE = 4;
export const mainTargets = (blend, motion = "own") => [...targets(2, blend), { format: VEL,
  ...(motion === "reactive" ? { writeMask: BLUE, blend: MAX } : blend ? { blend } : {}) }];

/** Build every pipeline (compiled in parallel). Resolves to { layouts, pipe, presentFormat }. */
export async function buildPipelines(device, presentFormat) {
  const layouts = {}, pipeLayout = {};
  for (const [k, entries] of Object.entries(LAYOUTS)) {
    layouts[k] = device.createBindGroupLayout({ label: k, entries });
    pipeLayout[k] = device.createPipelineLayout({ bindGroupLayouts: [layouts[k]] });
  }
  const scene = device.createShaderModule({ label: "scene", code: COMMON + LIGHTING + SLAB + FLOOR + PLAN + GLASS });
  const post = device.createShaderModule({ label: "post", code: POST_WGSL });

  const make = (label, layout, { vs, fs, module = scene, buffers = [], targets: tg = [], depthStencil, topology = "triangle-list",
    cull = "none", frontFace = "cw", samples = 1, constants }) => device.createRenderPipelineAsync({
    label, layout: pipeLayout[layout],
    vertex: { module, entryPoint: vs, buffers },
    ...(fs ? { fragment: { module, entryPoint: fs, targets: tg, ...(constants ? { constants } : {}) } } : {}),
    primitive: { topology, cullMode: cull, frontFace },
    ...(depthStencil ? { depthStencil } : {}),
    multisample: { count: samples },
  });
  const fsPass = (fs, format = HDR, blend) => ({ vs: "fsVS", fs, module: post, targets: [{ format, ...(blend ? { blend } : {}) }] });
  const strip = "triangle-strip";
  const specs = {
    shadow: ["inst", { vs: "shadowVS", buffers: TEMPLATE, depthStencil: depth({ depthBias: 3, depthBiasSlopeScale: 1.6 }) }],
    shadowMin: ["shadowMin", { vs: "fullVS", fs: "shadowMinFS", targets: targets(1, null, "r32float") }],
    shadowNear: ["shadowNear", { vs: "fullVS", fs: "shadowNearFS", targets: targets(1, null, "r32float") }],
    contact: ["plan", { vs: "footVS", fs: "contactFS", buffers: [f4(1, 3)], topology: strip, targets: targets(1, MAX) }],
    bounce: ["plan", { vs: "footVS", fs: "bounceFS", buffers: [f4(1, 3)], topology: strip, targets: targets(1, ADD) }],
    inkFloor: ["ink", { vs: "inkVS", fs: "inkFS", buffers: [f4(1, 5)], topology: strip, targets: targets(2, PREMULT) }],
    grooveId: ["ink", { vs: "grooveVS", fs: "grooveIdFS", buffers: [f4(1, 2)], topology: strip, targets: targets(1, null, "r32float"), depthStencil: depth() }],
    groove: ["ink", { vs: "grooveVS", fs: "grooveFS", buffers: [f4(1, 2)], topology: strip, targets: targets(2, PREMULT) }],
    floor: ["scene", { vs: "floorVS", fs: "floorFS", topology: strip, targets: mainTargets(), depthStencil: depth(), samples: MSAA }],
    slab: ["scene", { vs: "slabMainVS", fs: "slabFS", buffers: TEMPLATE, targets: mainTargets(), depthStencil: depth(), cull: "back", samples: MSAA }],
    slabTrans: ["scene", { vs: "slabMainVS", fs: "slabFS", buffers: TEMPLATE, targets: mainTargets(ALPHA), depthStencil: depth({ depthWriteEnabled: false }), cull: "back", samples: MSAA }],
    inkRaised: ["ink", { vs: "inkVS", fs: "inkFS", buffers: [f4(1, 5)], topology: strip, targets: mainTargets(PREMULT, "reactive"), samples: MSAA, constants: { DIRECT: 1 },
      depthStencil: depth({ depthWriteEnabled: false, depthCompare: "less-equal", depthBias: -4, depthBiasSlopeScale: -1 }) }],
    // the mirror image flips winding: outward faces turn counter-clockwise
    slabReflect: ["scene", { vs: "slabVS", fs: "slabFS", buffers: TEMPLATE, targets: targets(2), depthStencil: depth(), cull: "back", frontFace: "ccw", constants: { REFLECT: 1 } }],
    // glass: the opaque world's depth (no colour), then the glass over the resolved world, then laid over it
    glassDepth: ["glassDepth", { vs: "slabVS", fs: "glassDepthFS", buffers: TEMPLATE, targets: [{ format: HDR, writeMask: 0 }], depthStencil: depth(), cull: "back", samples: MSAA }],
    glass: ["glass", { vs: "slabVS", fs: "glassFS", buffers: TEMPLATE, targets: targets(1), depthStencil: depth(), cull: "back", samples: MSAA }],
    glassOver: ["post", fsPass("overFS", HDR, PREMULT)],
    down5: ["post", fsPass("down5FS")],
    down13: ["post", fsPass("down13FS")],
    up: ["post", fsPass("upFS")],
    accum: ["post", fsPass("accumFS")],
    taa: ["post", fsPass("taaFS")],
    composite: ["post", fsPass("compositeFS", presentFormat)],
  };
  const names = Object.keys(specs);
  const built = await Promise.all(names.map((n) => make(n, specs[n][0], specs[n][1])));
  const pipe = Object.fromEntries(names.map((n, i) => [n, built[i]]));
  return { layouts, pipe };
}
