// The Prism WebGPU backend (the high tier). Draws the same DrawList as the WebGL2 tier, through the same packer
// and with ported shaders, so a frame matches across tiers; then adds the Prism 2 passes (graph.mjs): a glossy
// floor that mirrors the world, a 13-tap bloom, jittered supersampling for captured frames, and temporal
// anti-aliasing for live ones (temporal.mjs).
// Same public API as backends/webgl2/renderer.mjs; created async by select.mjs once the device is known good.
import { LIGHT, POST, MATERIAL, CAMERA, PRISM2 } from "../../../tokens.mjs";
import { buildPipelines } from "./pipelines.mjs";
import { GpuArray, UniformArena, qualityTargets, sizeTargets, destroyTargets } from "./resources.mjs";
import { GRAPH } from "./graph.mjs";
import { GpuTimer } from "./timing.mjs";
import { FrameBlock } from "./uniforms.mjs";
import { slabTemplate } from "../../slabmesh.mjs";
import { Packer, themeColors, SLAB_FLOATS, GROOVE_TEXELS } from "../../pack.mjs";
import { TextAtlas } from "../../text.mjs";
import { cameraState, lightState, norm3 } from "../../math.mjs";
import { srgba, linear } from "../../color.mjs";
import { QUALITY, DRAFT, themeLight, dofBand } from "../../look.mjs";
import { pickSlab } from "../../pick.mjs";
import { createParticles } from "./particles.mjs";
import { Governor } from "./adapt.mjs";
import { Temporal, PREV_FLOATS } from "./temporal.mjs";

const { VERTEX, INDEX, STORAGE } = globalThis.GPUBufferUsage ?? {};

// clip-space fixes for matrices built the GL way (math.mjs): depth -1..1 -> 0..1, a sub-pixel offset, a mirror
// in the floor plane (z -> -z); all column-major
function toGpu(m, jx = 0, jy = 0) {
  const o = new Float32Array(m);
  for (let c = 0; c < 4; c++) {
    const w = o[c * 4 + 3];
    o[c * 4] += jx * w; o[c * 4 + 1] += jy * w;
    o[c * 4 + 2] = 0.5 * o[c * 4 + 2] + 0.5 * w;
  }
  return o;
}
const mirrored = (m) => { const o = new Float32Array(m); for (let r = 0; r < 4; r++) o[8 + r] = -o[8 + r]; return o; };
// Halton (2, 3): well-spread sub-pixel offsets in -0.5..0.5, the same sequence for every captured frame. Each
// sample is weighted by a narrow Gaussian round the pixel centre (a sharper filter than a box: thin lines keep
// their peak); `share` is its weight over the running total, as the accumulate pass mixes it in
const halton = (i, b) => { let f = 1, r = 0; for (i += 1; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; };
const JITTER = Array.from({ length: 16 }, (_, i) => [halton(i, 2) - 0.5, halton(i, 3) - 0.5]);
const FILTER_SIGMA = 0.35;
let total = 0;
for (const j of JITTER) { const w = Math.exp(-(j[0] * j[0] + j[1] * j[1]) / (2 * FILTER_SIGMA * FILTER_SIGMA)); total += w; j.push(w / total); }

function staticBuffer(device, data, usage) {
  const buf = device.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage, mappedAtCreation: true });
  new data.constructor(buf.getMappedRange(0, data.byteLength)).set(data);
  buf.unmap();
  return buf;
}

/** @param gpu {{ device: GPUDevice, timestamps: boolean }} from device.mjs */
export async function createWebGPURenderer(canvas, gpu, opts = {}) {
  const { device } = gpu;
  const format = navigator.gpu.getPreferredCanvasFormat();
  const [{ layouts, pipe }, particles] = await Promise.all([buildPipelines(device, format), createParticles(device)]);
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("[gfx] no webgpu canvas context");
  context.configure({ device, format, alphaMode: "opaque" });

  let theme = opts.theme === "light" ? "light" : "dark";
  let Q = QUALITY[opts.quality] ?? QUALITY.high;
  const maxDpr = opts.maxDpr ?? 2;
  let cssW = Math.max(1, canvas.clientWidth || canvas.width || 1), cssH = Math.max(1, canvas.clientHeight || canvas.height || 1);
  // the scene's own size: dpr and W x H are the internal ones (the device pixel ratio times the adaptive scale,
  // adapt.mjs); the canvas stays at the full device size and the composite fills it
  let dpr = 1, W = 1, H = 1, deviceDpr = 1;
  const governor = new Governor();
  const temporal = new Temporal(Math.min(PRISM2.supersample, JITTER.length));
  let colors = themeColors(theme), TL = themeLight(theme);
  const atlas = new TextAtlas();
  const packer = new Packer();
  const lostFns = [];
  const stats = { ms: 0, drawCalls: 0, instances: 0, lights: 0, slabs: 0, strings: 0, backend: "webgpu" };
  const defaultCamera = { target: [0, 0, 0], distance: 1200, yaw: CAMERA.yaw, pitch: CAMERA.pitch, fov: CAMERA.fov };
  let last = null, lastFrame = null, lastArgs = null, disposed = false, benching = false, drafted = false;

  // fixed resources
  const atlasTex = device.createTexture({ label: "atlas", size: [atlas.size, atlas.size], format: "r8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  atlas.attach((x, y, w, h, bytes) => device.queue.writeTexture({ texture: atlasTex, origin: [x, y] }, bytes, { bytesPerRow: w }, [w, h]));
  const template = (spec) => {
    const t = slabTemplate(spec);
    return {
      plan: staticBuffer(device, t.plan, VERTEX), prof: staticBuffer(device, t.prof, VERTEX),
      index: staticBuffer(device, t.indices, INDEX), count: t.indices.length, solid: t.solidCount, format: t.indices instanceof Uint32Array ? "uint32" : "uint16",
    };
  };
  const tpl = { tiny: template({ corner: 4, bevel: 4, lip: 2 }), small: template({ corner: 7, bevel: 6, lip: 3 }), large: template({ corner: 18, bevel: 9, lip: 4 }) };
  const linS = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  const cmpS = device.createSampler({ magFilter: "linear", minFilter: "linear", compare: "less-equal" });
  const dummy = {
    float: device.createTexture({ size: [1, 1], format: "rgba16float", usage: GPUTextureUsage.TEXTURE_BINDING }),
    unfilterable: device.createTexture({ size: [1, 1], format: "r32float", usage: GPUTextureUsage.TEXTURE_BINDING }),
  };
  const buf = {
    inst: new GpuArray(device, STORAGE, "slabs"), grooves: new GpuArray(device, STORAGE, "grooves"),
    ink: new GpuArray(device, VERTEX, "ink"), inkTop: new GpuArray(device, VERTEX, "inkTop"), inkRaised: new GpuArray(device, VERTEX, "inkRaised"),
    seg: new GpuArray(device, VERTEX, "seg"), contact: new GpuArray(device, VERTEX, "contact"), bounce: new GpuArray(device, VERTEX, "bounce"),
    prev: new GpuArray(device, STORAGE, "slabsPrev"),
  };
  const arena = new UniformArena(device);
  const timer = gpu.timestamps ? new GpuTimer(device, GRAPH.length) : null;
  const views = new WeakMap();
  const view = (t) => { let v = views.get(t); if (!v) views.set(t, (v = t.createView())); return v; };
  let Qt = qualityTargets(device, Q), T = null;

  const api = {
    lost: false,
    debug: {},
    timing: !!opts.timing,
    ready: null,
    resize, setTheme, setQuality, render, pick, project, unproject, pxPerUnit, profile, bench,
    stats: () => ({ ...stats, gpuMs: timer?.frameMs ?? 0 }),
    onLost: (fn) => { lostFns.push(fn); },
    dispose,
    get theme() { return theme; },
    get size() { return { cssW, cssH, dpr, W, H, scale: scale() }; },
    get drafted() { return drafted; },          // the last frame was drawn as a draft: draw the resting one again
    // the last frame had something still fading out, or a settled picture is still gathering its supersamples
    get busy() { return !!packer.fading || temporal.converging; },
    atlas,
  };

  device.lost.then((info) => {
    if (disposed) return;
    api.lost = true;
    console.warn(`[gfx] WebGPU device lost (${info.reason}): ${info.message}`);
    for (const fn of lostFns) { try { fn(true, info); } catch {} }
  });

  function resize(w, h, devicePixelRatio = 1) {
    cssW = Math.max(1, w); cssH = Math.max(1, h);
    deviceDpr = devicePixelRatio || 1;
    governor.reset();
    fit();
  }
  // the scene's scale: the governor's, and no more than DRAFT.scale for a draft on a software adapter
  const scale = () => (drafted ? Math.min(governor.scale, DRAFT.scale) : governor.scale);
  // the canvas at the full device size, the scene's targets at that scale of it
  function fit() {
    const full = Math.min(deviceDpr, maxDpr, Q.dpr);
    const cW = Math.max(1, Math.round(cssW * full)), cH = Math.max(1, Math.round(cssH * full));
    if (canvas.width !== cW || canvas.height !== cH) { canvas.width = cW; canvas.height = cH; }
    dpr = full * scale();
    const nW = Math.max(1, Math.round(cssW * dpr)), nH = Math.max(1, Math.round(cssH * dpr));
    if (T && nW === W && nH === H) return;
    W = nW; H = nH;
    destroyTargets(T);
    T = sizeTargets(device, W, H, Q);
    temporal.reset();
  }
  function setTheme(t) { theme = t === "light" ? "light" : "dark"; colors = themeColors(theme); TL = themeLight(theme); temporal.reset(); }
  function setQuality(q) {
    Q = QUALITY[q] ?? Q;
    destroyTargets(Qt); Qt = qualityTargets(device, Q);
    destroyTargets(T); T = null; fit();
  }

  // the Frame block: everything the scene shaders read, filled once per frame
  const block = new FrameBlock();
  function fillFrame(cam, camera, fr, sh, time) {
    const lc = colors.lin, P = colors.P, post = POST[theme], refl = PRISM2.reflect[theme], GL = PRISM2.glass;
    const pxU = 1 / Math.max(1e-4, cam.pxPerUnit(camera.target) * dpr);
    const keyPlan = norm3([TL.kd[0], TL.kd[1], 0]);
    const b = fr.bounds, tg = camera.target, ext = camera.distance * 9;
    const rgb = (c, w = 0) => [c[0], c[1], c[2], w];
    const mat = [];
    for (const k of ["matte", "ceramic", "glass", "metal"]) { const M = MATERIAL[k]; mat.push(M.rough, M.spec, M.rim, k === "metal" ? 1 : 0); }
    block.set("lightVP", toGpu(sh.viewProj))
      .set("eye", rgb(cam.frame.eye, theme === "light" ? 1 : 0))
      .set("keyDir", rgb(TL.kd, TL.key)).set("fillDir", rgb(TL.fd, TL.fill))
      .set("light", [TL.amb, TL.ground, TL.norm, fr.nLights])
      .set("shadowP", [1 / Qt.shadow.width, sh.extent, sh.depthRange, api.debug.shadow === false ? 0 : 1])
      .set("shade", [TL.lightSize, TL.solidPool, TL.poolGain, time])
      .set("contactRect", contactRect(b))
      .set("envGain", [...TL.env, TL.backGain]).set("envTint", [...TL.envTint, TL.contactK])
      .set("scene", [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.maxX - b.minX) / 2 + 70, (b.maxY - b.minY) / 2 + 70])
      .set("shadowMix", [...TL.shadowMix, post.horizon ?? 1])
      .set("bounceSatin", api.debug.bounce === false ? [0, 0, ...TL.satin] : [...TL.bounceK, ...TL.satin])
      .set("accent", rgb(TL.accent))
      .set("lit", rgb(lc.lit, atlas.size)).set("stage", rgb(lc.stage, atlas.spread))
      .set("stageLift", rgb(lc.stageLift)).set("stageEdge", rgb(lc.stageEdge))
      .set("horizon", rgb(lc.horizon)).set("horizonAlt", rgb(lc.horizonAlt))
      .set("grid", P.grid).set("gridMajor", P.gridMajor)
      .set("quad", [tg[0], tg[1], ext, ext])
      .set("viewport", [W, H, 1 / W, 1 / H])
      .set("keyPlan", [keyPlan[0], keyPlan[1], pxU, 0])
      .set("grooveRim", srgba(P.grooveRim))
      .set("reflect", [refl.strength, refl.f0, PRISM2.reflect.blurHeight, api.debug.reflect === false ? 0 : 1])
      .set("glass", [GL.ior, GL.frost * dpr, GL.zone.h, fr.nGlass ? 1 : 0])
      .set("glassTint", rgb(linear(GL[theme].tint), GL[theme].absorb))
      .set("glassLook", [GL[theme].edge, GL[theme].reflect, GL[theme].etch, 0])
      .set("mat", mat).set("lp", fr.lightsPos).set("lc", fr.lightsCol);
  }
  // the device-px rectangle [x, y, w, h] that holds slabs first .. first + count on screen (their bounding boxes,
  // projected), or null when it is empty; the whole canvas when one reaches behind the eye
  function screenRect(cam, first, count) {
    const A = packer.slab.a;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = first; k < first + count; k++) {
      // a cube round the slab's bounding sphere (whatever its yaw, pitch and roll)
      const o = k * SLAB_FLOATS, sc = A[o + 3], r = Math.hypot(A[o + 4], A[o + 5], A[o + 6]) / 2 * sc, cz = A[o + 2] + A[o + 6] * sc / 2;
      for (let c = 0; c < 8; c++) {
        const q = cam.project([A[o] + (c & 1 ? r : -r), A[o + 1] + (c & 2 ? r : -r), cz + (c & 4 ? r : -r)]);
        if (!(q[2] > 1e-6)) return [0, 0, W, H];      // behind the eye: no bound
        x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
      }
    }
    const pad = 2;
    const ax = Math.max(0, Math.floor(x0 * dpr) - pad), ay = Math.max(0, Math.floor(y0 * dpr) - pad);
    const bx = Math.min(W, Math.ceil(x1 * dpr) + pad), by = Math.min(H, Math.ceil(y1 * dpr) + pad);
    return bx > ax && by > ay ? [ax, ay, bx - ax, by - ay] : null;
  }
  const contactRect = (b, pad = 40) => [b.minX - pad, b.minY - pad, 1 / (b.maxX - b.minX + 2 * pad), 1 / (b.maxY - b.minY + 2 * pad)];

  // bind groups (cheap, made per frame so they always point at live buffers and targets)
  const group = (layout, entries) => device.createBindGroup({ layout: layouts[layout], entries: Object.entries(entries).map(([binding, r]) =>
    ({ binding: Number(binding), resource: r instanceof GPUTexture ? view(r) : r })) });
  function sceneGroups(frameSlot, reflSlot) {
    const shared = { 0: frameSlot, 1: { buffer: buf.inst.buf }, 2: atlasTex, 3: linS, 4: Qt.shadow, 5: cmpS, 6: Qt.shadowNear,
      7: Qt.contact, 8: Qt.bounce, 9: T.layer0, 10: T.layer1, 17: { buffer: buf.prev.buf } };
    const ink = { 0: frameSlot, 2: atlasTex, 3: linS, 14: { buffer: buf.grooves.buf } };
    return {
      scene: group("scene", { ...shared, 11: T.refl, 12: T.reflBlur[1].tex, 13: T.reflAux }),
      sceneReflect: group("scene", { ...shared, 0: reflSlot, 11: dummy.float, 12: dummy.float, 13: dummy.float }),
      ink: group("ink", { ...ink, 15: dummy.unfilterable }),
      inkShade: group("ink", { ...ink, 15: T.ids }),
      glassDepth: group("glassDepth", { 0: frameSlot, 1: { buffer: buf.inst.buf } }),
      glass: group("glass", { 0: frameSlot, 1: { buffer: buf.inst.buf }, 2: atlasTex, 3: linS, 7: Qt.contact, 12: T.reflBlur[1].tex, 16: T.color }),
    };
  }
  // one full-screen pass: target <- pipeline(textures, params)
  function post(begin, name, target, textures, params) {
    const p16 = new Float32Array(16); p16.set(params);
    const entries = { 4: linS, 5: arena.push(p16) };
    for (let i = 0; i < 4; i++) entries[i] = textures[i] ?? dummy.float;
    const p = begin({ label: `${name} ${target.width}x${target.height}`, colorAttachments: [{ view: target instanceof GPUTexture ? view(target) : target, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }] });
    p.setPipeline(pipe[name]); p.setBindGroup(0, group("post", entries)); p.draw(3); p.end();
    stats.drawCalls++;
  }

  /**
   * @param {import("../../../contracts.mjs").DrawList} dl
   * @param {import("../../../contracts.mjs").Camera} camera
   * @param {{ time?: number, clock?: number, reducedMotion?: boolean, capture?: boolean, draft?: boolean }} o  time: the
   *   shimmer clock (grain, flowing dashes); clock (default: time): the one fading memories run on (pack.mjs); draft: a
   *   frame the next one replaces at once, drawn at DRAFT.scale on a software adapter (never when captured)
   */
  function render(dl, camera, o = {}) {
    if (api.lost || disposed || !T) return;
    const t0 = performance.now();
    lastArgs = [dl, camera, o];
    const time = o.time ?? 0;
    const capture = o.capture ?? document.documentElement.classList.contains("ix-capture");
    // adaptive resolution: captured frames at full scale, live ones at what the last second of frames could afford
    const draft = !!o.draft && !!gpu.software && !capture && api.debug.draft !== false;
    if (draft !== drafted) { drafted = draft; fit(); }
    if (capture) { if (governor.level > 0) { governor.reset(); fit(); } }
    else if (timer && !benching && governor.frame(t0, timer.frameMs)) fit();
    camera = { ...defaultCamera, ...camera };
    const cam = cameraState(camera, cssW, cssH);
    cam.target = camera.target;
    atlas.unbounded = capture;
    atlas.beginFrame();
    const fr = packer.pack(dl, { colors, atlas, cam, time, clock: o.clock, distance: camera.distance, reducedMotion: !!o.reducedMotion, glass: api.debug.glass !== false });
    last = { cam, fr, camera };
    particles.update(dl.motion);
    stats.particles = particles.count;

    buf.inst.write(packer.slab.a, fr.nSlabs * SLAB_FLOATS);
    buf.prev.write(temporal.placements(packer.slab.a, fr.nSlabs, fr.ids), fr.nSlabs * PREV_FLOATS);
    buf.grooves.write(packer.groove.a, fr.nGrooves * GROOVE_TEXELS * 4);
    for (const k of ["ink", "inkTop", "inkRaised", "seg", "contact", "bounce"]) buf[k].write(packer[k].a, packer[k].n);
    // [template, first instance, instances, indices] (pack.mjs LOD classes): slabs without a well draw only the
    // template's solid prefix
    const Ti = tpl.tiny, S = tpl.small, L = tpl.large, nTi = fr.nTiny, nS = fr.nSmall, nL = fr.nLarge, tS = fr.nTinySolid, sS = fr.nSmallSolid, sL = fr.nLargeSolid;
    const opaque = [[Ti, 0, tS, Ti.solid], [Ti, tS, nTi - tS, Ti.count], [S, nTi, sS, S.solid], [S, nTi + sS, nS - nTi - sS, S.count],
      [L, nS, sL, L.solid], [L, nS + sL, nL - sL, L.count]];
    const trans = [L, nS + nL, fr.nTrans, L.count], glass = [L, nS + nL + fr.nTrans, fr.nGlass, L.count];
    const b = fr.bounds;
    const sh = lightState(LIGHT.key.dir, [b.minX - 10, b.minY - 10, 0], [b.maxX + 10, b.maxY + 10, b.maxZ + 4], Qt.shadow.width);

    arena.begin();
    fillFrame(cam, camera, fr, sh, time);
    // the frame as drawn without jitter: what the temporal resolve compares with the last frame
    const vpNow = toGpu(cam.viewProj);
    block.set("viewProj", vpNow).set("vpNow", vpNow).set("vpPrev", vpNow);
    const plan = capture || api.debug.taa === false ? null : temporal.plan([
      [block.data, block.data.length], [packer.slab.a, fr.nSlabs * SLAB_FLOATS], [packer.groove.a, fr.nGrooves * GROOVE_TEXELS * 4],
      ...["ink", "inkTop", "inkRaised", "seg", "contact", "bounce"].map((k) => [packer[k].a, packer[k].n]), particles.packed(),
    ], T.history, api.debug.taaStill === false);
    if (!plan) temporal.reset();
    block.set("vpPrev", temporal.prevVP ?? vpNow);
    temporal.prevVP = vpNow;
    const samples = capture ? temporal.samples : 1;
    const eye = cam.frame.eye, mirrorEye = [eye[0], eye[1], -eye[2], theme === "light" ? 1 : 0];
    const subframes = [];
    for (let k = 0; k < samples; k++) {
      // captured: the k-th supersample; live: the temporal plan's offset; the shadow noise moves on with it
      const n = plan ? plan.jitter : k;
      const [jx, jy] = samples > 1 || plan ? JITTER[n] : [0, 0];
      const vp = toGpu(cam.viewProj, 2 * jx / W, 2 * jy / H);
      block.set("keyPlan", [n], 3);
      const frameSlot = arena.push(block.set("viewProj", vp).set("eye", [...eye, mirrorEye[3]]).data);
      const reflSlot = arena.push(block.set("viewProj", mirrored(vp)).set("eye", mirrorEye).data);
      subframes.push({ frameSlot, reflSlot });
    }

    const post_ = POST[theme], D = POST.dof;
    const band = T.dof && !o.reducedMotion && api.debug.dof !== false ? dofBand(cam, camera, b, cssH) : null;
    const mixW = 0.55 + post_.bloomRadius * 0.6;
    let norm = 1;
    for (let i = T.down.length - 2; i >= 0; i--) norm = 1 + norm * mixW;
    stats.drawCalls = 0;
    const c = {
      device, pipe, T, Qt, fr, buf: Object.fromEntries(Object.entries(buf).map(([k, v]) => [k, v.buf])), view, post, debug: api.debug,
      ranges: { all: [...opaque, trans], opaque, trans: [trans], glass: [glass] },
      glass: fr.nGlass > 0 ? screenRect(cam, glass[1], fr.nGlass) : null,
      clearColor: [...colors.lin.stageEdge.slice(0, 3), 1],
      reflect: api.debug.reflect !== false, samples, shares: JITTER.map((j) => j[2]), karis: PRISM2.karis, bloomMix: mixW,
      dofOn: !!band, scene: T.color, present: context.getCurrentTexture(),
      // a live frame's temporal resolve: a.x the static share (0: reproject and clip), a.y the motion blend, a.z history valid
      taa: plan ? { from: plan.from, to: plan.to, params: [plan.share ?? JITTER[plan.k][2], 0.1, plan.valid ? 1 : 0] } : null,
      motion: particles.count && api.debug.motion !== false ? particles : null, frameSlots: subframes.map((s) => s.frameSlot),
      reflSlots: subframes.map((s) => s.reflSlot),
      bg: {
        inst: group("inst", { 0: subframes[0].frameSlot, 1: { buffer: buf.inst.buf } }),
        plan: group("plan", { 0: subframes[0].frameSlot }),
        shadowMin: group("shadowMin", { 4: Qt.shadow }),
        shadowNear: group("shadowNear", { 6: Qt.shadowMin }),
        glassOver: group("post", { 0: T.glass, 1: dummy.float, 2: dummy.float, 3: dummy.float, 4: linS, 5: arena.push(new Float32Array(16)) }),
      },
      compositeParams: [
        band?.[0] ?? 0, band?.[1] ?? 1, D.ramp, band ? 1 : 0,
        D.far * dpr, D.near * dpr, 4, theme === "light" ? 1 : 0,
        api.debug.bloom === false ? 0 : post_.bloom, post_.vignette, o.reducedMotion ? post_.grain * 0.6 : post_.grain, post_.exposure,
        TL.knee, o.reducedMotion ? 0 : Math.floor(time * 24) % 1000, 2.2 / norm, 0,
      ],
    };

    const enc = device.createCommandEncoder();
    const ran = [];
    const runNode = (node, i) => {
      if (node.when && !node.when(c)) return;
      let first = true;
      const begin = (desc) => {
        const tw = timer ? timer.writes(i, first) : null;
        first = false;
        return enc.beginRenderPass(tw ? { ...desc, timestampWrites: tw } : desc);
      };
      const compute = (desc = {}) => {
        const tw = timer ? timer.writes(i, first) : null;
        first = false;
        return enc.beginComputePass(tw ? { ...desc, timestampWrites: tw } : desc);
      };
      node.encode(c, begin, compute);
      ran.push(i);
    };
    for (let i = 0; i < GRAPH.length; i++) {
      if (!GRAPH[i].jittered) { runNode(GRAPH[i], i); continue; }
      let j = i;
      while (j < GRAPH.length && GRAPH[j].jittered) j++;
      for (let k = 0; k < samples; k++) {
        c.sub = k;
        Object.assign(c.bg, sceneGroups(subframes[k].frameSlot, subframes[k].reflSlot));
        for (let n = i; n < j; n++) runNode(GRAPH[n], n);
      }
      i = j - 1;
    }
    arena.flush();
    const readback = timer ? timer.resolve(enc) : null;
    device.queue.submit([enc.finish()]);
    timer?.track(readback, new Set(ran));

    stats.ms = performance.now() - t0;
    stats.instances = fr.nSlabs + fr.nInk + fr.nInkTop + fr.nSeg + fr.nContact;
    stats.draft = drafted;
    stats.slabs = fr.nSlabs; stats.lights = fr.nLights; stats.strings = atlas.entries.size; stats.textMissed = atlas.missed;
    stats.samples = samples;
    stats.taa = plan ? (plan.share === 0 ? "moving" : plan.held ? "held" : `still ${plan.k + 1}/${temporal.samples}`) : "off";
    lastFrame = { c, subframes };
  }

  /**
   * Per-pass GPU cost of the last frame. Each graph node is re-encoded `repeat` times back to back in a submit of
   * its own and waited for, so nothing else of the frame overlaps it and the GPU stays busy (see timing.mjs); a
   * node's cost is its span over `repeat`. Over `frames` trials it reports the lowest (other work sharing the GPU
   * only ever adds) and the median. `detail` splits nodes into their passes (named by post pipeline, else node#k):
   * on a tiled GPU a pass's begin stamp comes early (its vertex work overlaps the pass before), so each pass is
   * charged from the previous pass's end to its own. frameSpan: the last normal frame.
   */
  let probe = null;
  async function profile({ frames = 12, repeat = 6, detail = false } = {}) {
    if (!timer || !lastFrame) return null;
    probe ??= new GpuTimer(device, 256);
    const { c, subframes } = lastFrame;
    const per = GRAPH.map(() => []), sub = new Map();
    for (let f = 0; f < frames; f++) {
      for (let i = 0; i < GRAPH.length; i++) {
        const node = GRAPH[i];
        if (node.when && !node.when(c)) continue;
        c.sub = 0;
        Object.assign(c.bg, sceneGroups(subframes[0].frameSlot, subframes[0].reflSlot));
        c.present = context.getCurrentTexture();
        const enc = device.createCommandEncoder();
        const names = [];
        let k = 0;      // the pass within this run
        const stamp = (desc) => {
          const n = names.length;
          names.push(desc.label ?? `${node.name}#${k++}`);
          return n < probe.slots ? { ...desc, timestampWrites: probe.writes(n, true) } : desc;
        };
        for (let r = 0; r < repeat; r++, k = 0) node.encode(c, (desc) => enc.beginRenderPass(stamp(desc)), (desc = {}) => enc.beginComputePass(stamp(desc)));
        const rb = probe.resolve(enc, probe.probeBuffer());
        arena.flush();
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
        const stamped = names.slice(0, probe.slots).map((_, k) => k);
        const r = await probe.read(rb, stamped);
        per[i].push(r.frame / repeat);
        if (detail) {
          const frame = new Map();
          let prev = 0;
          for (const n of stamped) { const e = r.ends.get(n) ?? prev; frame.set(names[n], (frame.get(names[n]) ?? 0) + (e - prev) / repeat); prev = Math.max(prev, e); }
          for (const [n, ms] of frame) { const key = `${node.name}/${n}`; if (!sub.has(key)) sub.set(key, []); sub.get(key).push(ms); }
        }
      }
    }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const round = (x) => +x.toFixed(3);
    const best = {}, median = {};
    GRAPH.forEach((n, i) => { if (per[i].length) { best[n.name] = round(Math.min(...per[i])); median[n.name] = round(med(per[i])); } });
    const total = (o) => round(Object.values(o).reduce((a, x) => a + x, 0));
    const out = { passes: best, sum: total(best), median, medianSum: total(median), frameSpan: round(timer.frameMs), size: [W, H] };
    if (detail) out.detail = Object.fromEntries([...sub].map(([k, v]) => [k, round(Math.min(...v))]));
    return out;
  }

  /**
   * Steady-state cost of the last frame: it is drawn again `frames` times back to back, each waited for, so the
   * GPU stays busy (and clocked up) and nothing else shares the measurement. Medians: wall ms per frame (GPU-bound),
   * the GPU span, and the CPU time in render().
   */
  async function bench({ frames = 60 } = {}) {
    if (!lastArgs) return null;
    const wall = [], gpuMs = [], cpu = [];
    benching = true;      // its back-to-back frames are no reading for the adaptive scale
    try {
      for (let f = 0; f < frames + 10; f++) {
        const t0 = performance.now();
        render(...lastArgs);
        const c = stats.ms;
        await device.queue.onSubmittedWorkDone();
        if (f >= 10) { wall.push(performance.now() - t0); gpuMs.push(timer?.frameMs ?? 0); cpu.push(c); }
      }
    } finally { benching = false; }
    const q = (a, k) => { const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * k))].toFixed(2); };
    return { wall: q(wall, 0.5), wallP90: q(wall, 0.9), gpu: q(gpuMs, 0.5), gpuP10: q(gpuMs, 0.1), gpuP90: q(gpuMs, 0.9), cpu: q(cpu, 0.5), size: [W, H] };
  }

  function pick(cssX, cssY) {
    if (!last || !(cssX >= 0 && cssY >= 0 && cssX < cssW && cssY < cssH)) return null;
    const { cam, fr } = last;
    const hit = pickSlab(fr, cam.frame.eye, cam.ray(cssX, cssY));
    return hit >= 0 && hit < fr.ids.length ? fr.ids[hit] : null;
  }
  const camNow = () => last?.cam ?? cameraState(defaultCamera, cssW, cssH);
  function project(p) { return camNow().project(p); }
  function unproject(x, y, z = 0) { return camNow().unproject(x, y, z); }
  function pxPerUnit(at) { return camNow().pxPerUnit(at ?? last?.camera?.target ?? [0, 0, 0]); }

  function dispose() {
    disposed = true;
    try { context.unconfigure(); } catch {}
    device.destroy();
  }

  resize(cssW, cssH, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  api.ready = atlas.ready.then(() => api);
  return api;
}
