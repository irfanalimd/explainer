// The Prism WebGL2 backend (the fallback tier): raw WebGL2, zero dependencies. Draws a DrawList (engine/contracts.mjs) as a lit,
// shadowed, bloomed little world. Passes per frame:
//   1 shadow map (key light, PCSS-filtered when sampled)      2 contact map (plan-space blurred footprints)
//   3 floor layer (zones, grooves with nearest-segment union, text, ticks; sRGB premultiplied)
//   4 main MSAA pass into colour + emission (floor plane, opaque slabs, sorted transparent slabs)
//   2b colour-bounce map (plan-space, wide blurred footprints of saturated bodies, in their colour)
//   5 resolve, dual-filter bloom from emission only, tilt-shift DOF (high quality), composite (tonemap
//     shoulder, vignette, grain, dither)
import { LIGHT, POST, MATERIAL, CAMERA } from "../../../tokens.mjs";
import { compileProgram, texture2D, framebuffer, renderbuffer, DynBuffer } from "./glutil.mjs";
import * as SH from "./shaders.mjs";
import { slabTemplate } from "../../slabmesh.mjs";
import { Packer, themeColors, SLAB_TEXELS, INK_FLOATS, SEG_FLOATS, CONTACT_FLOATS, BOUNCE_FLOATS, GROOVE_TEXELS } from "../../pack.mjs";
import { TextAtlas } from "../../text.mjs";
import { cameraState, lightState, norm3 } from "../../math.mjs";
import { linear, srgba } from "../../color.mjs";
import { QUALITY, themeLight, dofBand } from "../../look.mjs";

const PER_ROW = 64, ROW_TEXELS = PER_ROW * SLAB_TEXELS;

export function createRenderer(canvas, opts = {}) {
  let theme = opts.theme === "light" ? "light" : "dark";
  let Q = QUALITY[opts.quality] ?? QUALITY.high;
  const maxDpr = opts.maxDpr ?? 2;
  let cssW = Math.max(1, canvas.clientWidth || canvas.width || 1), cssH = Math.max(1, canvas.clientHeight || canvas.height || 1);
  let dpr = 1, W = 1, H = 1;
  let colors = themeColors(theme), TL = themeLight(theme);
  const atlas = new TextAtlas();
  const packer = new Packer();
  let gl = null, R = null, last = null, frameNo = 0;
  let lostFns = [];
  const stats = { ms: 0, drawCalls: 0, instances: 0, lights: 0, triangles: 0, slabs: 0, strings: 0, backend: "webgl2" };
  let defaultCamera = { target: [0, 0, 0], distance: 1200, yaw: CAMERA.yaw, pitch: CAMERA.pitch, fov: CAMERA.fov };

  const api = {
    lost: false,
    debug: {},                     // { bloom: false } for inspecting the light without its glow
    timing: !!opts.timing,         // GPU timer queries -> stats().gpuMs
    ready: null,
    resize, setTheme, render, pick, project, unproject, pxPerUnit,
    stats: () => ({ ...stats }),
    onLost: (fn) => { lostFns.push(fn); },
    dispose,
    get theme() { return theme; },
    get size() { return { cssW, cssH, dpr, W, H }; },
    get busy() { return !!packer.fading; },     // the last frame had something still fading out
    atlas,
  };

  function init() {
    gl = canvas.getContext("webgl2", {
      antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false,
      preserveDrawingBuffer: !!opts.preserveDrawingBuffer, powerPreference: "high-performance",
    });
    if (!gl) throw new Error("[gfx] WebGL2 unavailable");
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("[gfx] EXT_color_buffer_float unavailable");
    gl.getExtension("OES_texture_float_linear");
    const P = (name, vs, fs, samplers = {}) => {
      const p = compileProgram(gl, name, vs, fs);
      gl.useProgram(p.program);
      for (const [k, unit] of Object.entries(samplers)) if (p.u[k]) gl.uniform1i(p.u[k], unit);
      return p;
    };
    const lightSamplers = { uInst: 0, uAtlas: 1, uShadowCmp: 2, uShadowRaw: 3, uContact: 4, uShadowMin: 9, uBounce: 10 };
    R = {
      slab: P("slab", SH.slabVS, SH.slabFS, lightSamplers),
      shadow: P("shadow", SH.shadowVS, SH.shadowFS, { uInst: 0 }),
      pick: P("pick", SH.pickVS, SH.pickFS, { uInst: 0 }),
      floor: P("floor", SH.floorVS, SH.floorFS, { ...lightSamplers, uLayer0: 5, uLayer1: 6 }),
      ink: P("ink", SH.inkVS, SH.inkFS, { uAtlas: 1 }),
      groove: P("groove", SH.grooveVS, SH.grooveFS, { uGrooves: 7, uIds: 8 }),
      contact: P("contact", SH.contactVS, SH.contactFS, {}),
      bounce: P("bounce", SH.contactVS, SH.bounceFS, {}),
      downP: P("down", SH.fsqVS, SH.downFS, { uSrc: 0 }),
      upP: P("up", SH.fsqVS, SH.upFS, { uSrc: 0, uBase: 1 }),
      composite: P("composite", SH.fsqVS, SH.compositeFS, { uColor: 0, uBloom: 1, uDofHalf: 2, uDofQuarter: 3 }),
      shadowMin: P("shadowMin", SH.fsqVS, SH.shadowMinFS, { uSrc: 0 }),
    };
    // geometry
    const mkTemplate = (spec) => {
      const t = slabTemplate(spec);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const b0 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b0); gl.bufferData(gl.ARRAY_BUFFER, t.plan, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, t.prof, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, t.indices, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, count: t.indices.length, type: t.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
    };
    R.small = mkTemplate({ corner: 7, bevel: 6, lip: 3 });
    R.large = mkTemplate({ corner: 18, bevel: 9, lip: 4 });
    // unit quad (instanced items) and fullscreen quad
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    R.quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, R.quadBuf); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const instVao = (buf, strideFloats, attribs) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.quadBuf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      if (buf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf.buf);
        attribs.forEach((n, i) => {
          gl.enableVertexAttribArray(1 + i);
          gl.vertexAttribPointer(1 + i, n, gl.FLOAT, false, strideFloats * 4, i * 16);
          gl.vertexAttribDivisor(1 + i, 1);
        });
      }
      gl.bindVertexArray(null);
      return vao;
    };
    R.inkBuf = new DynBuffer(gl); R.inkTopBuf = new DynBuffer(gl); R.segBuf = new DynBuffer(gl); R.contactBuf = new DynBuffer(gl);
    R.inkRaisedBuf = new DynBuffer(gl);
    R.inkVao = instVao(R.inkBuf, INK_FLOATS, [4, 4, 4, 4, 4]);
    R.inkTopVao = instVao(R.inkTopBuf, INK_FLOATS, [4, 4, 4, 4, 4]);
    R.inkRaisedVao = instVao(R.inkRaisedBuf, INK_FLOATS, [4, 4, 4, 4, 4]);
    R.segVao = instVao(R.segBuf, SEG_FLOATS, [4, 4]);
    R.contactVao = instVao(R.contactBuf, CONTACT_FLOATS, [4, 4, 4]);
    R.bounceBuf = new DynBuffer(gl);
    R.bounceVao = instVao(R.bounceBuf, BOUNCE_FLOATS, [4, 4, 4]);
    R.fsqVao = instVao(null);
    // data textures
    R.instRows = 0; R.instTex = null;
    R.grooveRows = 0; R.grooveTex = null;
    // shadow map + samplers
    R.cmpSampler = gl.createSampler();
    gl.samplerParameteri(R.cmpSampler, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.samplerParameteri(R.cmpSampler, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.samplerParameteri(R.cmpSampler, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.samplerParameteri(R.cmpSampler, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.samplerParameteri(R.cmpSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(R.cmpSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    R.rawSampler = gl.createSampler();
    gl.samplerParameteri(R.rawSampler, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.samplerParameteri(R.rawSampler, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.samplerParameteri(R.rawSampler, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.samplerParameteri(R.rawSampler, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    allocQuality();
    // GPU timing (when available): one TIME_ELAPSED query per frame, read back a few frames later
    R.timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    R.queries = []; R.gpuMs = 0;
    // pick target
    R.pickTex = texture2D(gl, 1, 1, gl.RGBA8, { filter: gl.NEAREST });
    R.pickDepth = renderbuffer(gl, 1, 1, gl.DEPTH_COMPONENT24, 0);
    R.pickFbo = framebuffer(gl, [R.pickTex], R.pickDepth);
    R.atlasTex = texture2D(gl, atlas.size, atlas.size, gl.R8);
    atlas.attach((x, y, w, h, bytes) => {
      gl.bindTexture(gl.TEXTURE_2D, R.atlasTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED, gl.UNSIGNED_BYTE, bytes);
    });
    R.samples = Math.min(Q.samples, gl.getParameter(gl.MAX_SAMPLES));
    allocSize();
  }

  function allocQuality() {
    if (R.shadowTex) {
      gl.deleteTexture(R.shadowTex); gl.deleteFramebuffer(R.shadowFbo); gl.deleteTexture(R.contactTex); gl.deleteFramebuffer(R.contactFbo);
      gl.deleteTexture(R.shadowMinTex); gl.deleteFramebuffer(R.shadowMinFbo);
      gl.deleteTexture(R.bounceTex); gl.deleteFramebuffer(R.bounceFbo);
    }
    R.shadowSize = Q.shadow;
    R.shadowTex = texture2D(gl, Q.shadow, Q.shadow, gl.DEPTH_COMPONENT24, { filter: gl.NEAREST });
    R.shadowFbo = framebuffer(gl, [], R.shadowTex);
    R.shadowMinSize = Q.shadow / 16;
    R.shadowMinTex = texture2D(gl, R.shadowMinSize, R.shadowMinSize, gl.R32F, { filter: gl.NEAREST });
    R.shadowMinFbo = framebuffer(gl, [R.shadowMinTex], null);
    R.contactSize = Q.contact;
    R.contactTex = texture2D(gl, Q.contact, Q.contact, gl.RGBA16F, { filter: gl.LINEAR });
    R.contactFbo = framebuffer(gl, [R.contactTex], null);
    R.bounceSize = Q.bounce;
    R.bounceTex = texture2D(gl, Q.bounce, Q.bounce, gl.RGBA16F, { filter: gl.LINEAR });
    R.bounceFbo = framebuffer(gl, [R.bounceTex], null);
  }

  function freeSize() {
    if (!R.sized) return;
    for (const t of R.sized.tex) gl.deleteTexture(t);
    for (const b of R.sized.rb) gl.deleteRenderbuffer(b);
    for (const f of R.sized.fbo) gl.deleteFramebuffer(f);
    R.sized = null;
  }

  function allocSize() {
    freeSize();
    const tex = [], rb = [], fbo = [];
    const T = (w, h, f) => { const t = texture2D(gl, w, h, f); tex.push(t); return t; };
    const RB = (f, s) => { const b = renderbuffer(gl, W, H, f, s); rb.push(b); return b; };
    const FB = (c, d) => { const f = framebuffer(gl, c, d); fbo.push(f); return f; };
    R.layer0 = T(W, H, gl.RGBA16F); R.layer1 = T(W, H, gl.RGBA16F);
    R.layerDepth = RB(gl.DEPTH_COMPONENT24, 0);
    R.layerFbo = FB([R.layer0, R.layer1], null);
    R.idTex = T(W, H, gl.R32F);
    gl.bindTexture(gl.TEXTURE_2D, R.idTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    R.idFbo = FB([R.idTex], R.layerDepth);
    const s = R.samples;
    R.msColor = RB(gl.R11F_G11F_B10F, s); R.msEmis = RB(gl.R11F_G11F_B10F, s); R.msDepth = RB(gl.DEPTH_COMPONENT24, s);
    R.mainFbo = FB([R.msColor, R.msEmis], R.msDepth);
    R.colorTex = T(W, H, gl.R11F_G11F_B10F); R.emisTex = T(W, H, gl.R11F_G11F_B10F);
    R.resolveColorFbo = FB([R.colorTex], null);
    R.resolveEmisFbo = FB([R.emisTex], null);
    R.down = []; R.up = [];
    let w = W, h = H;
    for (let i = 0; i < Q.bloom; i++) {
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      const d = T(w, h, gl.R11F_G11F_B10F); const u = T(w, h, gl.R11F_G11F_B10F);
      R.down.push({ tex: d, fbo: FB([d], null), w, h });
      R.up.push({ tex: u, fbo: FB([u], null), w, h });
    }
    // tilt-shift: half- and quarter-resolution copies of the resolved colour
    R.dofHalf = null; R.dofQuarter = null;
    if (Q.dof) {
      const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1), qw = Math.max(1, W >> 2), qh = Math.max(1, H >> 2);
      const a = T(hw, hh, gl.R11F_G11F_B10F), b = T(qw, qh, gl.R11F_G11F_B10F);
      R.dofHalf = { tex: a, fbo: FB([a], null), w: hw, h: hh };
      R.dofQuarter = { tex: b, fbo: FB([b], null), w: qw, h: qh };
    }
    R.sized = { tex, rb, fbo };
  }

  function resize(w, h, devicePixelRatio = 1) {
    cssW = Math.max(1, w); cssH = Math.max(1, h);
    dpr = Math.min(devicePixelRatio || 1, maxDpr, Q.dpr);
    const nW = Math.max(1, Math.round(cssW * dpr)), nH = Math.max(1, Math.round(cssH * dpr));
    if (nW === W && nH === H && canvas.width === nW) return;
    W = nW; H = nH;
    canvas.width = W; canvas.height = H;
    if (gl && R && !api.lost) allocSize();
  }

  function setTheme(t) { theme = t === "light" ? "light" : "dark"; colors = themeColors(theme); TL = themeLight(theme); }

  function setQuality(q) {
    Q = QUALITY[q] ?? Q;
    if (gl && R) { R.samples = Math.min(Q.samples, gl.getParameter(gl.MAX_SAMPLES)); allocQuality(); resize(cssW, cssH, dpr); allocSize(); }
  }
  api.setQuality = setQuality;

  function ensureInstTex(nSlabs) {
    const rows = Math.max(1, Math.ceil(nSlabs / PER_ROW));
    if (rows > R.instRows) {
      if (R.instTex) gl.deleteTexture(R.instTex);
      R.instRows = Math.max(rows, Math.ceil(R.instRows * 1.5), 8);
      R.instTex = texture2D(gl, ROW_TEXELS, R.instRows, gl.RGBA32F, { filter: gl.NEAREST });
    }
    return rows;
  }

  function ensureGrooveTex(n) {
    const rows = Math.max(1, n);
    if (rows > R.grooveRows) {
      if (R.grooveTex) gl.deleteTexture(R.grooveTex);
      R.grooveRows = Math.max(rows, Math.ceil(R.grooveRows * 1.5), 16);
      R.grooveTex = texture2D(gl, GROOVE_TEXELS, R.grooveRows, gl.RGBA32F, { filter: gl.NEAREST });
    }
  }

  function setLightUniforms(p, fr, cam, sh) {
    const u = p.u;
    gl.uniform3fv(u.uEye, cam.frame.eye);
    gl.uniform3fv(u.uKeyDir, TL.kd); gl.uniform3fv(u.uFillDir, TL.fd);
    gl.uniform1f(u.uKey, TL.key); gl.uniform1f(u.uFill, TL.fill); gl.uniform1f(u.uAmb, TL.amb);
    gl.uniform1f(u.uGround, TL.ground); gl.uniform1f(u.uNorm, TL.norm);
    gl.uniform1i(u.uTheme, theme === "light" ? 1 : 0);
    gl.uniform1i(u.uNumLights, fr.nLights);
    gl.uniform4fv(u.uLP, fr.lightsPos); gl.uniform4fv(u.uLC, fr.lightsCol);
    gl.uniformMatrix4fv(u.uLightVP, false, sh.viewProj);
    gl.uniform4f(u.uShadowP, 1 / R.shadowSize, sh.extent, sh.depthRange, api.debug.shadow === false ? 0 : 1);
    gl.uniform1f(u.uLightSize, TL.lightSize);
    gl.uniform4fv(u.uContactRect, R.contactRect);
    gl.uniform3fv(u.uEnvGain, TL.env); gl.uniform3fv(u.uEnvTint, TL.envTint);
    if (u.uShadowMix) gl.uniform3fv(u.uShadowMix, TL.shadowMix);
    if (u.uBounceK) gl.uniform2f(u.uBounceK, api.debug.bounce === false ? 0 : TL.bounceK[0], api.debug.bounce === false ? 0 : TL.bounceK[1]);
    if (u.uAccent) gl.uniform3fv(u.uAccent, TL.accent);
    if (u.uSatin) gl.uniform2fv(u.uSatin, TL.satin);
    if (u.uBackGain) gl.uniform1f(u.uBackGain, TL.backGain);
    const b = fr.bounds;
    gl.uniform4f(u.uScene, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.maxX - b.minX) / 2 + 70, (b.maxY - b.minY) / 2 + 70);
    if (u.uSolidPool) gl.uniform1f(u.uSolidPool, TL.solidPool);
    if (u.uPoolGain) gl.uniform1f(u.uPoolGain, TL.poolGain);
  }

  function bindLightTextures() {
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.instTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.atlasTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.shadowTex); gl.bindSampler(2, R.cmpSampler);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.shadowTex); gl.bindSampler(3, R.rawSampler);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, R.contactTex);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, R.shadowMinTex);
    gl.activeTexture(gl.TEXTURE10); gl.bindTexture(gl.TEXTURE_2D, R.bounceTex);
  }
  function unbindSamplers() { gl.bindSampler(2, null); gl.bindSampler(3, null); }

  function drawSlabs(p, fr, ranges) {
    let calls = 0;
    for (const [tpl, base, count] of ranges) {
      if (!count) continue;
      gl.bindVertexArray(tpl.vao);
      gl.uniform1i(p.u.uBase, base);
      gl.drawElementsInstanced(gl.TRIANGLES, tpl.count, tpl.type, 0, count);
      calls++;
      stats.triangles += tpl.count / 3 * count;
    }
    return calls;
  }

  /**
   * @param {import("../contracts.mjs").DrawList} dl
   * @param {import("../contracts.mjs").Camera} camera
   * @param {{ time?: number, clock?: number, reducedMotion?: boolean, capture?: boolean }} o  time: the shimmer clock
   *   (grain, flowing dashes); clock (default: time): the one fading memories run on (pack.mjs)
   */
  function render(dl, camera, o = {}) {
    if (!gl || !R || api.lost) return;
    const t0 = performance.now();
    const time = o.time ?? 0;
    frameNo++;
    camera = { ...defaultCamera, ...camera };
    const cam = cameraState(camera, cssW, cssH);
    cam.target = camera.target;
    atlas.unbounded = !!o.capture;
    atlas.beginFrame();
    const tp = performance.now();
    const fr = packer.pack(dl, { colors, atlas, cam, time, clock: o.clock, distance: camera.distance, reducedMotion: !!o.reducedMotion });
    stats.packMs = performance.now() - tp;
    last = { cam, fr, camera };
    stats.drawCalls = 0; stats.triangles = 0;

    // GPU timer
    let query = null;
    if (R.timer && api.timing) {
      for (let i = R.queries.length - 1; i >= 0; i--) {
        const q = R.queries[i];
        if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
          if (!gl.getParameter(R.timer.GPU_DISJOINT_EXT)) R.gpuMs = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(q); R.queries.splice(i, 1);
        }
      }
      if (R.queries.length < 4) { query = gl.createQuery(); gl.beginQuery(R.timer.TIME_ELAPSED_EXT, query); }
    }

    // uploads
    const rows = ensureInstTex(fr.nSlabs);
    if (packer.slab.a.length < rows * ROW_TEXELS * 4) packer.slab.reserve(rows * ROW_TEXELS * 4 - packer.slab.n);
    gl.bindTexture(gl.TEXTURE_2D, R.instTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    if (fr.nSlabs) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ROW_TEXELS, rows, gl.RGBA, gl.FLOAT, packer.slab.a, 0);
    ensureGrooveTex(fr.nGrooves);
    if (fr.nGrooves) {
      gl.bindTexture(gl.TEXTURE_2D, R.grooveTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GROOVE_TEXELS, fr.nGrooves, gl.RGBA, gl.FLOAT, packer.groove.a, 0);
    }
    R.inkBuf.upload(packer.ink.a, packer.ink.n);
    R.inkTopBuf.upload(packer.inkTop.a, packer.inkTop.n);
    R.inkRaisedBuf.upload(packer.inkRaised.a, packer.inkRaised.n);
    R.segBuf.upload(packer.seg.a, packer.seg.n);
    R.contactBuf.upload(packer.contact.a, packer.contact.n);
    R.bounceBuf.upload(packer.bounce.a, packer.bounce.n);

    const b = fr.bounds;
    const ranges = [[R.small, 0, fr.nSmall], [R.large, fr.nSmall, fr.nLarge], [R.large, fr.nSmall + fr.nLarge, fr.nTrans]];
    const pxU = 1 / Math.max(1e-4, cam.pxPerUnit(camera.target) * dpr);

    // 1. shadow map
    const sh = lightState(LIGHT.key.dir, [b.minX - 10, b.minY - 10, 0], [b.maxX + 10, b.maxY + 10, b.maxZ + 4], R.shadowSize);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadowFbo);
    gl.viewport(0, 0, R.shadowSize, R.shadowSize);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.6, 3.0);
    gl.useProgram(R.shadow.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.instTex);
    gl.uniformMatrix4fv(R.shadow.u.uLightVP, false, sh.viewProj);
    stats.drawCalls += drawSlabs(R.shadow, fr, ranges);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    // coarse min-depth map for the shadow early-out
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.shadowMinFbo);
    gl.viewport(0, 0, R.shadowMinSize, R.shadowMinSize);
    gl.useProgram(R.shadowMin.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.shadowTex); gl.bindSampler(0, R.rawSampler);
    gl.bindVertexArray(R.fsqVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); stats.drawCalls++;
    gl.bindSampler(0, null);

    // 2. contact map
    const pad = 40;
    R.contactRect = [b.minX - pad, b.minY - pad, 1 / (b.maxX - b.minX + 2 * pad), 1 / (b.maxY - b.minY + 2 * pad)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.contactFbo);
    gl.viewport(0, 0, R.contactSize, R.contactSize);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (fr.nContact) {
      gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(R.contact.program);
      gl.uniform4fv(R.contact.u.uRect, R.contactRect);
      gl.bindVertexArray(R.contactVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fr.nContact);
      stats.drawCalls++;
      gl.blendEquation(gl.FUNC_ADD);
    }
    // 2b. colour bounce map (same plan rect, low resolution, additive)
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.bounceFbo);
    gl.viewport(0, 0, R.bounceSize, R.bounceSize);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (fr.nBounce) {
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(R.bounce.program);
      gl.uniform4fv(R.bounce.u.uRect, R.contactRect);
      gl.bindVertexArray(R.bounceVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fr.nBounce);
      stats.drawCalls++;
    }

    // 3. floor layer
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.layerFbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    const keyPlan = norm3([TL.kd[0], TL.kd[1], 0]);
    const inkPass = (vao, n, direct = 0) => {
      if (!n) return;
      gl.useProgram(R.ink.program);
      gl.uniform1i(R.ink.u.uDirect, direct);
      gl.uniformMatrix4fv(R.ink.u.uViewProj, false, cam.viewProj);
      gl.uniform1f(R.ink.u.uPxU, pxU);
      gl.uniform1f(R.ink.u.uAtlasSize, atlas.size); gl.uniform1f(R.ink.u.uSpreadPx, atlas.spread);
      gl.uniform2f(R.ink.u.uKeyPlan, keyPlan[0], keyPlan[1]);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.atlasTex);
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      stats.drawCalls++;
    };
    inkPass(R.inkVao, fr.nInk);
    if (fr.nSeg) {
      gl.useProgram(R.groove.program);
      gl.uniformMatrix4fv(R.groove.u.uViewProj, false, cam.viewProj);
      gl.uniform1f(R.groove.u.uPxU, pxU);
      gl.uniform2f(R.groove.u.uKeyPlan, keyPlan[0], keyPlan[1]);
      gl.uniform1i(R.groove.u.uTheme, theme === "light" ? 1 : 0);
      gl.uniform3fv(R.groove.u.uGrooveRim, srgba(colors.P.grooveRim).slice(0, 3));
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, R.grooveTex);
      gl.bindVertexArray(R.segVao);
      // nearest segment wins: pass 1 writes the id of the segment whose centre line is closest
      // (depth = distance), pass 2 shades only where it is that segment. Exact, no float compares.
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.idFbo);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearDepth(1); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.BLEND);
      gl.uniform1i(R.groove.u.uIdPass, 1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fr.nSeg);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
      gl.bindFramebuffer(gl.FRAMEBUFFER, R.layerFbo);
      gl.enable(gl.BLEND);
      gl.uniform1i(R.groove.u.uIdPass, 0);
      gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, R.idTex);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, fr.nSeg);
      gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, null);
      stats.drawCalls += 2;
    }
    inkPass(R.inkTopVao, fr.nInkTop);

    // 4. main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.mainFbo);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    const st = linear(colors.P.stageEdge);
    gl.clearBufferfv(gl.COLOR, 0, [st[0], st[1], st[2], 1]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 1]);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    bindLightTextures();
    // floor plane
    if (!api.debug.skipFloor) {
      const p = R.floor; gl.useProgram(p.program);
      setLightUniforms(p, fr, cam, sh);
      gl.uniformMatrix4fv(p.u.uViewProj, false, cam.viewProj);
      const tg = camera.target, ext = camera.distance * 9;
      gl.uniform4f(p.u.uQuad, tg[0], tg[1], ext, ext);
      gl.uniform3fv(p.u.uStage, colors.lin.stage.slice(0, 3));
      gl.uniform3fv(p.u.uStageLift, colors.lin.stageLift.slice(0, 3));
      gl.uniform3fv(p.u.uStageEdge, colors.lin.stageEdge.slice(0, 3));
      gl.uniform4fv(p.u.uGrid, colors.P.grid); gl.uniform4fv(p.u.uGridMajor, colors.P.gridMajor);
      gl.uniform2f(p.u.uViewport, W, H);
      gl.uniform1f(p.u.uContactK, TL.contactK);
      gl.uniform3fv(p.u.uHorizon, colors.lin.horizon.slice(0, 3));
      gl.uniform3fv(p.u.uHorizonAlt, colors.lin.horizonAlt.slice(0, 3));
      gl.uniform1f(p.u.uHorizonK, POST[theme].horizon ?? 1);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, R.layer0);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, R.layer1);
      gl.bindVertexArray(R.fsqVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      stats.drawCalls++;
    }
    // slabs
    if (!api.debug.skipSlabs) {
      const p = R.slab; gl.useProgram(p.program);
      setLightUniforms(p, fr, cam, sh);
      gl.uniformMatrix4fv(p.u.uViewProj, false, cam.viewProj);
      gl.uniform1f(p.u.uAtlasSize, atlas.size); gl.uniform1f(p.u.uSpreadPx, atlas.spread);
      gl.uniform3fv(p.u.uLit, colors.lin.lit.slice(0, 3));
      gl.uniform1f(p.u.uTime, time);
      const m = [];
      for (const k of ["matte", "ceramic", "glass", "metal"]) { const M = MATERIAL[k]; m.push(M.rough, M.spec, M.rim, k === "metal" ? 1 : 0); }
      gl.uniform4fv(p.u.uMat, m);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CW);
      stats.drawCalls += drawSlabs(p, fr, ranges.slice(0, 2));
      gl.disable(gl.CULL_FACE);
      // raised ink (index numbers on plates, labels on tops): depth-tested decals pulled a hair toward the eye
      if (fr.nInkRaised) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -4);
        inkPass(R.inkRaisedVao, fr.nInkRaised, 1);
        gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
        gl.useProgram(p.program);
      }
      gl.enable(gl.CULL_FACE);
      if (fr.nTrans) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        stats.drawCalls += drawSlabs(p, fr, ranges.slice(2));
        gl.disable(gl.BLEND); gl.depthMask(true);
      }
      gl.disable(gl.CULL_FACE);
    }
    unbindSamplers();

    // 5. resolve, bloom, composite
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, R.mainFbo);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.resolveColorFbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, R.resolveEmisFbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindVertexArray(R.fsqVao);
    const post = POST[theme];
    // dual-filter bloom
    gl.useProgram(R.downP.program);
    let src = R.emisTex, sw = W, shh = H;
    for (const lv of api.debug.skipBloom ? [] : R.down) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, lv.fbo); gl.viewport(0, 0, lv.w, lv.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform2f(R.downP.u.uHalf, 0.5 / sw, 0.5 / shh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); stats.drawCalls++;
      src = lv.tex; sw = lv.w; shh = lv.h;
    }
    gl.useProgram(R.upP.program);
    const mixW = 0.55 + post.bloomRadius * 0.6;
    let norm = 1;
    for (let i = api.debug.skipBloom ? -1 : R.down.length - 2; i >= 0; i--) {
      const lv = R.up[i];
      const from = i === R.down.length - 2 ? R.down[i + 1] : R.up[i + 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, lv.fbo); gl.viewport(0, 0, lv.w, lv.h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, from.tex);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.down[i].tex);
      gl.uniform2f(R.upP.u.uHalf, 0.5 / from.w, 0.5 / from.h);
      gl.uniform1f(R.upP.u.uMix, mixW);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); stats.drawCalls++;
      norm = 1 + norm * mixW;
    }
    // tilt-shift DOF: a crisp band round the camera target (the focus plane); far rows (top) and near rows
    // (bottom) soften beyond it. A world that sits inside the band is never blurred.
    const D = POST.dof;
    const band = R.dofHalf && !o.reducedMotion && api.debug.dof !== false ? dofBand(cam, camera, b, cssH) ?? [0, 1] : [0, 1];
    const dofOn = band[0] > 0 || band[1] < 1;
    if (dofOn) {
      gl.useProgram(R.downP.program);
      let srcT = R.colorTex, w0 = W, h0 = H;
      for (const lv of [R.dofHalf, R.dofQuarter]) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, lv.fbo); gl.viewport(0, 0, lv.w, lv.h);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcT);
        gl.uniform2f(R.downP.u.uHalf, 0.5 / w0, 0.5 / h0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); stats.drawCalls++;
        srcT = lv.tex; w0 = lv.w; h0 = lv.h;
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(R.composite.program);
    gl.uniform4f(R.composite.u.uDof, band[0], band[1], D.ramp, dofOn ? 1 : 0);
    gl.uniform3f(R.composite.u.uDofMax, D.far * dpr, D.near * dpr, 4);
    if (dofOn) {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, R.dofHalf.tex);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, R.dofQuarter.tex);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.colorTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, R.up.length > 1 ? R.up[0].tex : R.down[0].tex);
    gl.uniform1i(R.composite.u.uTheme, theme === "light" ? 1 : 0);
    gl.uniform4f(R.composite.u.uPost, api.debug.bloom === false ? 0 : post.bloom, post.vignette, o.reducedMotion ? post.grain * 0.6 : post.grain, post.exposure);
    gl.uniform1f(R.composite.u.uKnee, TL.knee);
    gl.uniform1f(R.composite.u.uFrame, o.reducedMotion ? 0 : Math.floor(time * 24) % 1000);
    gl.uniform1f(R.composite.u.uBloomNorm, 2.2 / norm);
    gl.uniform2f(R.composite.u.uRes, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); stats.drawCalls++;
    gl.bindVertexArray(null);
    if (query) { gl.endQuery(R.timer.TIME_ELAPSED_EXT); R.queries.push(query); }

    stats.ms = performance.now() - t0;
    stats.gpuMs = R.gpuMs;
    stats.instances = fr.nSlabs + fr.nInk + fr.nInkTop + fr.nSeg + fr.nContact;
    stats.slabs = fr.nSlabs; stats.lights = fr.nLights; stats.raisedInk = fr.nInkRaised; stats.strings = atlas.entries.size; stats.textMissed = atlas.missed;
  }

  function pick(cssX, cssY) {
    if (!gl || !R || !last || api.lost) return null;
    const { cam, fr } = last;
    if (!fr.nSlabs || !(cssX >= 0 && cssY >= 0 && cssX < cssW && cssY < cssH)) return null;
    const px = cssX * dpr, py = (cssH - cssY) * dpr;
    const nx = (2 * Math.floor(px) + 1) / W - 1, ny = (2 * Math.floor(py) + 1) / H - 1;
    const M = new Float32Array(16);
    M[0] = W; M[5] = H; M[10] = 1; M[15] = 1; M[12] = -nx * W; M[13] = -ny * H;
    const vp = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += M[k * 4 + r] * cam.viewProj[c * 4 + k]; vp[c * 4 + r] = s;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.pickFbo);
    gl.viewport(0, 0, 1, 1);
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LESS);
    gl.clearColor(0, 0, 0, 0); gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(R.pick.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.instTex);
    gl.uniformMatrix4fv(R.pick.u.uViewProj, false, vp);
    gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW);
    drawSlabs(R.pick, fr, [[R.small, 0, fr.nSmall], [R.large, fr.nSmall, fr.nLarge + fr.nTrans]]);
    gl.disable(gl.CULL_FACE);
    const out = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const v = out[0] + out[1] * 256 + out[2] * 65536 - 1;
    return v >= 0 && v < fr.ids.length ? fr.ids[v] : null;
  }

  const camNow = () => last?.cam ?? cameraState(defaultCamera, cssW, cssH);
  function project(p) { return camNow().project(p); }
  function unproject(x, y, z = 0) { return camNow().unproject(x, y, z); }
  function pxPerUnit(at) { const c = camNow(); return c.pxPerUnit(at ?? last?.camera?.target ?? [0, 0, 0]); }

  function dispose() {
    try { gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch {}
    gl = null; R = null;
  }

  canvas.addEventListener?.("webglcontextlost", (e) => {
    e.preventDefault();
    api.lost = true; R = null;
    for (const fn of lostFns) { try { fn(true); } catch {} }
  });
  canvas.addEventListener?.("webglcontextrestored", () => {
    api.lost = false;
    init();
    for (const fn of lostFns) { try { fn(false); } catch {} }
  });

  init();
  resize(cssW, cssH, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  api.ready = atlas.ready.then(() => api);
  return api;
}
