// The frame graph: the passes of one WebGPU frame, in order, each a small encoder over a shared frame context.
// `jittered` passes depend on the camera's sub-pixel offset and run once per supersample in capture; the rest
// run once per frame (a live frame is one jittered sample, resolved into its history by "temporal"). `tier` says which renderer tier draws the pass (WebGL2 draws the "base" ones too).
// Every pass opens its render passes through begin() (compute passes through compute()), which attaches the GPU
// timestamps for that pass.
const clear0 = (view) => ({ view, loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] });
const load = (view) => ({ view, loadOp: "load", storeOp: "store" });
const depthClear = (view) => ({ view, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" });

function drawSlabs(p, ranges) {
  for (const [tpl, base, count, indices] of ranges) {
    if (!count) continue;
    p.setVertexBuffer(0, tpl.plan); p.setVertexBuffer(1, tpl.prof); p.setIndexBuffer(tpl.index, tpl.format);
    p.drawIndexed(indices, count, 0, 0, base);
  }
}
function drawQuads(p, pipeline, buf, n) {
  if (!n) return;
  p.setPipeline(pipeline); p.setVertexBuffer(0, buf); p.draw(4, n);
}

export const GRAPH = [
  { name: "shadow", tier: "base", encode(c, begin) {
    const p = begin({ colorAttachments: [], depthStencilAttachment: depthClear(c.view(c.Qt.shadow)) });
    p.setPipeline(c.pipe.shadow); p.setBindGroup(0, c.bg.inst);
    drawSlabs(p, c.ranges.all);
    p.end();
    const m = begin({ colorAttachments: [clear0(c.view(c.Qt.shadowMin))] });
    m.setPipeline(c.pipe.shadowMin); m.setBindGroup(0, c.bg.shadowMin); m.draw(3); m.end();
    const n = begin({ colorAttachments: [clear0(c.view(c.Qt.shadowNear))] });
    n.setPipeline(c.pipe.shadowNear); n.setBindGroup(0, c.bg.shadowNear); n.draw(3); n.end();
  } },
  { name: "plan", tier: "base", encode(c, begin) {
    for (const [target, pipeline, buf, n] of [[c.Qt.contact, c.pipe.contact, c.buf.contact, c.fr.nContact], [c.Qt.bounce, c.pipe.bounce, c.buf.bounce, c.fr.nBounce]]) {
      const p = begin({ colorAttachments: [clear0(c.view(target))] });
      p.setBindGroup(0, c.bg.plan);
      drawQuads(p, pipeline, buf, n);
      p.end();
    }
  } },
  // data in motion (particles.mjs): evaluate this frame's particles once; main draws them in every subframe
  { name: "motion", tier: "webgpu", when: (c) => c.motion?.count > 0, encode(c, begin, compute) { c.motion.simulate(compute); } },
  { name: "floorLayer", tier: "base", jittered: true, encode(c, begin) {
    const { T, fr } = c;
    if (fr.nSeg) {
      // nearest segment wins: first the id of the closest centre line (depth = distance), then only it shades
      const p = begin({ colorAttachments: [clear0(c.view(T.ids))], depthStencilAttachment: { ...depthClear(c.view(T.idDepth)), depthStoreOp: "discard" } });
      p.setBindGroup(0, c.bg.ink);
      drawQuads(p, c.pipe.grooveId, c.buf.seg, fr.nSeg);
      p.end();
    }
    // one pass over both layers: ink, then the grooves over it, then the ink drawn on top of them
    const p = begin({ colorAttachments: [clear0(c.view(T.layer0)), clear0(c.view(T.layer1))] });
    p.setBindGroup(0, c.bg.inkShade);
    drawQuads(p, c.pipe.inkFloor, c.buf.ink, fr.nInk);
    drawQuads(p, c.pipe.groove, c.buf.seg, fr.nSeg);
    drawQuads(p, c.pipe.inkFloor, c.buf.inkTop, fr.nInkTop);
    p.end();
  } },
  { name: "reflection", tier: "webgpu", jittered: true, when: (c) => c.reflect, encode(c, begin) {
    const { T } = c;
    const p = begin({ colorAttachments: [clear0(c.view(T.refl)), clear0(c.view(T.reflAux))], depthStencilAttachment: depthClear(c.view(T.reflDepth)) });
    p.setPipeline(c.pipe.slabReflect); p.setBindGroup(0, c.bg.sceneReflect);
    drawSlabs(p, c.ranges.opaque);
    if (c.motion?.count) c.motion.draw(p, c.reflSlots[c.sub ?? 0], true);     // data in motion, mirrored too
    p.end();
    let src = { tex: T.refl, w: T.W >> 1, h: T.H >> 1 };
    for (const lv of T.reflBlur) { c.post(begin, "down5", lv.tex, [src.tex], [0.5 / src.w, 0.5 / src.h]); src = lv; }
  } },
  { name: "main", tier: "base", jittered: true, encode(c, begin) {
    const { T, fr } = c;
    const ms = (view, resolveTarget, clearValue) => ({ view, resolveTarget, loadOp: "clear", storeOp: "discard", clearValue });
    const p = begin({
      colorAttachments: [ms(c.view(T.msColor), c.view(T.color), c.clearColor), ms(c.view(T.msEmis), c.view(T.emis), [0, 0, 0, 1]),
        ms(c.view(T.msVel), c.view(T.vel), [0, 0, 0, 0])],
      depthStencilAttachment: { view: c.view(T.msDepth), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
    });
    p.setBindGroup(0, c.bg.scene);
    // solids first, then the floor: depth-tested, the floor's costly shading runs only where no solid stands
    p.setPipeline(c.pipe.slab); drawSlabs(p, c.ranges.opaque);
    p.setPipeline(c.pipe.floor); p.draw(4);
    // raised ink (index numbers on plates, labels on tops): depth-tested decals pulled a hair toward the eye
    if (fr.nInkRaised) { p.setBindGroup(0, c.bg.ink); drawQuads(p, c.pipe.inkRaised, c.buf.inkRaised, fr.nInkRaised); p.setBindGroup(0, c.bg.scene); }
    if (c.motion?.count) { c.motion.draw(p, c.frameSlots[c.sub ?? 0]); p.setBindGroup(0, c.bg.scene); }
    p.setPipeline(c.pipe.slabTrans); drawSlabs(p, c.ranges.trans);
    p.end();
  } },
  { name: "glass", tier: "webgpu", jittered: true, when: (c) => c.glass, encode(c, begin) {
    // the opaque world's depth again, then the glass refracting the resolved world (its MSAA target is free now)
    const { T } = c;
    const p = begin({
      colorAttachments: [{ view: c.view(T.msColor), resolveTarget: c.view(T.glass), loadOp: "clear", storeOp: "discard", clearValue: [0, 0, 0, 0] }],
      depthStencilAttachment: { view: c.view(T.msDepth), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "discard" },
    });
    p.setScissorRect(...c.glass);     // only where the glass is on screen
    p.setBindGroup(0, c.bg.glassDepth);
    p.setPipeline(c.pipe.glassDepth); drawSlabs(p, c.ranges.all);
    p.setBindGroup(0, c.bg.glass);
    p.setPipeline(c.pipe.glass); drawSlabs(p, c.ranges.glass);
    p.end();
    const o = begin({ colorAttachments: [load(c.view(T.color))] });
    o.setScissorRect(...c.glass);
    o.setPipeline(c.pipe.glassOver); o.setBindGroup(0, c.bg.glassOver); o.draw(3); o.end();
  } },
  { name: "accumulate", tier: "webgpu", jittered: true, when: (c) => c.samples > 1, encode(c, begin) {
    const k = c.sub, from = c.T.history[(k + 1) & 1], to = c.T.history[k & 1];
    c.post(begin, "accum", to, [from, c.T.color], [c.shares[k]]);
    c.scene = to;
  } },
  // live frames: this jittered frame into the reprojected history (temporal AA; a paused frame keeps converging)
  { name: "temporal", tier: "webgpu", when: (c) => !!c.taa, encode(c, begin) {
    c.post(begin, "taa", c.taa.to, [c.T.color, c.taa.from, c.T.vel], c.taa.params);
    c.scene = c.taa.to;
  } },
  { name: "bloom", tier: "base", when: (c) => !c.debug.skipBloom, encode(c, begin) {
    const { T } = c;
    let src = { tex: T.emis, w: T.W, h: T.H };
    T.down.forEach((lv, i) => { c.post(begin, "down13", lv.tex, [src.tex], [1 / src.w, 1 / src.h, i === 0 ? c.karis : 0]); src = lv; });
    for (let i = T.down.length - 2; i >= 0; i--) {
      const from = i === T.down.length - 2 ? T.down[i + 1] : T.up[i + 1];
      c.post(begin, "up", T.up[i].tex, [from.tex, T.down[i].tex], [1 / from.w, 1 / from.h, c.bloomMix]);
    }
  } },
  { name: "dof", tier: "base", when: (c) => c.dofOn, encode(c, begin) {
    let src = { tex: c.scene, w: c.T.W, h: c.T.H };
    for (const lv of c.T.dof) { c.post(begin, "down5", lv.tex, [src.tex], [0.5 / src.w, 0.5 / src.h]); src = lv; }
  } },
  { name: "composite", tier: "base", encode(c, begin) {
    const { T } = c;
    c.post(begin, "composite", c.present, [c.scene, T.up.length > 1 ? T.up[0].tex : T.down[0].tex, T.dof?.[0].tex, T.dof?.[1].tex], c.compositeParams);
  } },
];
