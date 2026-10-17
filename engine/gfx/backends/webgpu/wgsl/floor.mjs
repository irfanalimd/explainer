// WGSL for the floor: the lit stage plane (key pool, horizon glow, dot grid, the floor layer, shadows, contact,
// bounce, point-light pools) plus, on this tier, a glossy reflection of the world above it; and the floor
// layer's own passes: ink (zones, text, ticks, rings) and grooves (nearest segment wins, then shade).
export const FLOOR = /* wgsl */ `
struct FloorVary { @builtin(position) pos: vec4f, @location(0) world: vec3f, @location(1) clipNow: vec4f, @location(2) clipPrev: vec4f }

@vertex fn floorVS(@builtin(vertex_index) vi: u32) -> FloorVary {
  let w = vec4f(F.quad.xy + quadCorner(vi) * F.quad.zw, 0.0, 1.0);
  return FloorVary(F.viewProj * w, w.xyz, F.vpNow * w, F.vpPrev * w);
}

fn dots(p: vec2f, spacing: f32, rad: f32, pxU: f32) -> f32 {
  let c = (fract(p / spacing + 0.5) - 0.5) * spacing;
  let d = length(c);
  // crisp discs when they are bigger than a pixel, energy-preserving soft dots when smaller
  let sig = max(pxU * 0.5, rad * 0.5);
  let soft = (rad * rad) / (2.0 * sig * sig) * exp(-d * d / (2.0 * sig * sig));
  let crisp = 1.0 - smoothstep(rad - pxU * 0.5, rad + pxU * 0.5, d);
  let k = smoothstep(0.6, 1.4, rad / pxU);
  return mix(min(soft, 1.0), crisp, k) * smoothstep(3.0, 7.0, spacing / pxU);
}

// glossy floor: the mirrored world, sharp where it touches the floor and blurring with height above it
fn floorReflection(p: vec2f, frag: vec2f, fade: f32) -> vec4f {
  let R = F.reflect;
  if (R.w < 0.5) { return vec4f(0.0); }
  let uv = frag * F.viewport.zw;
  let sharp = textureSampleLevel(reflT, linS, uv, 0.0);
  let soft = textureSampleLevel(reflBlurT, linS, uv, 0.0);
  let aux = textureSampleLevel(reflAuxT, linS, uv, 0.0);
  let height = select(R.z * 4.0, aux.a / max(sharp.a, 1e-3), sharp.a > 1e-3);
  let m = mix(sharp, soft, mix(0.6, 1.0, smoothstep(0.0, R.z, height)));
  let V = normalize(F.eye.xyz - vec3f(p, 0.0));
  let fr = R.y + (1.0 - R.y) * pow(1.0 - max(V.z, 0.0), 5.0);
  return m * (R.x * fr * fade);
}

@fragment fn floorFS(v: FloorVary) -> Lit {
  let p = v.world.xy;
  let pxU = length(fwidth(p)) * 0.7071 + 1e-5;
  let q = (p - F.scene.xy) / max(F.scene.zw, vec2f(1.0));
  let rr = length(q);
  // the key light's pool: stageLift under the scene, exactly stage in a ring of open floor around it,
  // then the studio sweep falls to stageEdge
  var base = mix(F.stage.rgb, F.stageLift.rgb, keyPool(p));
  base = mix(base, F.stageEdge.rgb, smoothstep(1.4, 2.9, rr));
  // atmosphere: behind the world (-y is away from the camera) the floor rises into a horizon glow that holds
  // to infinity; it is centred on the world and leans indigo on the left, teal on the right
  let back = -q.y;
  var aur = smoothstep(0.62, 1.9, back) * exp(-pow(q.x / (1.9 + 0.5 * max(back, 0.0)), 2.0));
  // and toward the top of the frame (the horizon side) whatever the framing, outside the key pool
  let sy = 1.0 - v.pos.y * F.viewport.w;
  aur = max(aur, smoothstep(0.5, 1.1, sy) * 0.72 * smoothstep(0.6, 1.25, rr));
  let hz = mix(F.horizon.rgb, F.horizonAlt.rgb, smoothstep(-2.4, 2.4, q.x + 0.12 * back));
  base = mix(base, hz, clamp(aur * F.shadowMix.w, 0.0, 1.0));

  var bs = toSrgb(base);
  let gf = 1.0 - smoothstep(1.0, 1.9, rr);
  let dm = dots(p, 128.0, 0.95, pxU) * gf;
  let dn = dots(p, 16.0, 0.6, pxU) * gf * (1.0 - dm);
  bs = mix(bs, F.grid.rgb, F.grid.a * dn);
  bs = mix(bs, F.gridMajor.rgb, F.gridMajor.a * dm);

  let px = vec2i(v.pos.xy);
  let L0 = textureLoad(layer0T, px, 0);
  let L1 = textureLoad(layer1T, px, 0);
  bs = bs * (1.0 - L0.a) + L0.rgb;
  let alb = toLin(bs);

  let kd = F.keyDir;
  let vis = shadowVis(vec3f(p, 0.0), vec3f(0.0, 0.0, 1.0), kd.z, v.pos.xy);
  let lightF = (F.light.x + kd.w * kd.z * vis + F.fillDir.w * max(F.fillDir.z, 0.0)) * F.light.z;
  let cs = contactAt(p);
  var col = alb * tintShade(lightF * (1.0 - cs.r * F.envTint.w));
  col = applyBounce(col, p, 1.0 - cs.r * 0.5);

  let pl = pointLights(vec3f(p, 0.0), vec3f(0.0, 0.0, 1.0), 0.0);
  if (!isLight()) {
    let ratio = clamp(luma(alb) / max(luma(base), 1e-4), 0.25, 3.0);
    col += pl * F.shade.z * mix(1.0, ratio, L0.a) * (1.0 - cs.r * 0.5);
    col += L1.rgb;
  } else {
    let a = 1.0 - exp(-luma(pl) * 2.2);
    col = mix(col, col * mix(vec3f(1.0), hueOf(pl), 0.9), a * 0.72);
  }
  // a clear coat over everything printed on the floor: reflections replace a little of the diffuse
  let refl = floorReflection(p, v.pos.xy, 1.0 - smoothstep(1.2, 2.4, rr));
  col = col * (1.0 - refl.a) + refl.rgb;
  // light along the grooves (pulses, flowing data) changes from frame to frame: reactive
  return Lit(vec4f(col, 1.0), vec4f(L1.rgb, 1.0), vec4f(motionOf(v.clipNow, v.clipPrev), smoothstep(0.02, 0.3, luma(L1.rgb)), 1.0));
}

// --- floor ink: zones, text, ticks, rings (into the floor layer, sRGB premultiplied) ----------------------------
override DIRECT: bool = false;     // raised ink, drawn straight into the lit HDR buffer (linear)

struct Ink { @location(1) a: vec4f, @location(2) b: vec4f, @location(3) c: vec4f, @location(4) d: vec4f, @location(5) e: vec4f }
struct InkVary {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) a: vec4f, @location(2) @interpolate(flat) b: vec4f, @location(3) @interpolate(flat) c: vec4f,
  @location(4) @interpolate(flat) d: vec4f, @location(5) @interpolate(flat) e: vec4f,
}

@vertex fn inkVS(@builtin(vertex_index) vi: u32, i: Ink) -> InkVary {
  let m = 3.0 * F.keyPlan.z + 0.6 + select(0.0, i.d.x, i.b.w < 0.5);
  let l = quadCorner(vi) * (i.a.zw + m);
  let w = i.a.xy + vec2f(i.b.x * l.x - i.b.y * l.y, i.b.y * l.x + i.b.x * l.y);
  let z = select(0.0, i.e.w, i.b.w > 0.5);     // texts, ticks and rings may sit on raised surfaces
  return InkVary(F.viewProj * vec4f(w, z, 1.0), l, i.a, i.b, i.c, i.d, i.e);
}

// raised ink also marks a ping (an expanding ring) reactive for the temporal resolve; the floor layer ignores it
struct InkOut { @location(0) color: vec4f, @location(1) emis: vec4f, @location(2) motion: vec4f }
@fragment fn inkFS(v: InkVary) -> InkOut {
  let pxU = length(fwidth(v.local)) * 0.7071 + 1e-5;
  let type_ = u32(v.b.w + 0.5);
  let hs = v.a.zw; let r = v.b.z;
  var c = v.c.rgb; var a = 0.0;
  if (type_ == 0u) {             // zone: fill + solid or dashed border
    let d = sdRR(v.local, hs, r);
    let fill = (1.0 - smoothstep(-pxU * 0.5, pxU * 0.5, d)) * v.c.a;
    let bw = v.d.x;
    var band = 1.0 - smoothstep(bw * 0.5 - pxU * 0.5, bw * 0.5 + pxU * 0.5, abs(d + bw * 0.5));
    band *= smoothstep(0.0, 1.0, bw / pxU + 0.15);
    if (v.d.y > 0.0) {
      let p = abs(v.local); let cc = hs - r;
      let qq = p - cc;
      var s: f32;
      let lq = cc.x + cc.y + 1.5707963 * r;
      if (qq.x > 0.0 && qq.y > 0.0) { s = cc.x + r * (1.5707963 - atan2(qq.y, qq.x)); }
      else if (qq.y > qq.x) { s = p.x; }
      else { s = cc.x + 1.5707963 * r + (cc.y - p.y); }
      let per = v.d.y + v.d.z;
      let n = max(1.0, floor(lq / per + 0.5));
      let P = lq / n; let on = v.d.y * P / per;
      let ph = fmod(s + on * 0.5, P);
      band *= smoothstep(-pxU, pxU, on - ph) * smoothstep(-pxU, pxU, ph);
    }
    let ba = band * v.e.a;
    let rgb = c * fill * (1.0 - ba) + v.e.rgb * ba;
    a = fill * (1.0 - ba) + ba;
    if (a < 0.001) { discard; }
    return InkOut(vec4f(rgb, a), vec4f(0.0), vec4f(0.0));
  } else if (type_ == 1u) {      // text
    let rel = (v.local + hs) / (2.0 * hs);
    if (rel.x < 0.0 || rel.y < 0.0 || rel.x > 1.0 || rel.y > 1.0) { discard; }
    let uv = mix(v.d.xy, v.d.zw, rel);
    let uvPerU = (v.d.zw - v.d.xy) / (2.0 * hs);
    // far, minified text keeps its weight: the edge never softens past a fifth of the field (it would swell)
    let aa = clamp(uvPerU.x * F.lit.w * pxU / (2.0 * F.stage.w) * 0.85, 0.003, 0.2);
    let sd = textureSampleLevel(atlasT, linS, uv, 0.0).r;
    a = smoothstep(0.5 - aa, 0.5 + aa, sd) * v.c.a;
    if (v.e.x > 0.5) {
      let kp = F.keyPlan.xy;
      let lpl = vec2f(v.b.x * kp.x + v.b.y * kp.y, -v.b.y * kp.x + v.b.x * kp.y);
      let big = smoothstep(26.0, 60.0, 2.0 * hs.y / pxU);
      let o = v.e.y;
      let sdT = textureSampleLevel(atlasT, linS, uv + lpl * o * uvPerU, 0.0).r;
      let sdA = textureSampleLevel(atlasT, linS, uv - lpl * o * uvPerU, 0.0).r;
      let shade = smoothstep(0.5 + aa, 0.5 - aa, sdT) * big;
      let catchL = smoothstep(0.5 + aa, 0.5 - aa, sdA) * big;
      c = c * (1.0 - 0.5 * shade) + c * 0.4 * catchL * (1.0 - shade);
    }
  } else if (type_ == 2u) {      // rect (ticks)
    let d2 = abs(v.local) - hs;
    let d = length(max(d2, vec2f(0.0))) + min(max(d2.x, d2.y), 0.0);
    let thin = clamp(2.0 * min(hs.x, hs.y) / pxU, 0.0, 1.0);
    a = (1.0 - smoothstep(-pxU * 0.5, pxU * 0.5, d / max(thin, 0.35))) * v.c.a * mix(0.6, 1.0, thin);
  } else {                       // ring (selection outline, arrival ping)
    let d = sdRR(v.local, hs, r);
    let bw = v.d.x;
    let hw = max(bw * 0.5, pxU * 0.5);
    a = (1.0 - smoothstep(hw - pxU * 0.6, hw + pxU * 0.6, abs(d))) * v.c.a * min(1.0, bw / max(pxU, 1e-4) + 0.25);
    // a ping is light: a soft inner wash and emission
    if (v.d.y > 0.0) { a = max(a, exp(-max(-d, 0.0) / 2.2) * step(d, 0.0) * v.c.a * 0.16); }
  }
  if (a < 0.001) { discard; }
  // the floor layer is sRGB premultiplied; drawn straight into the lit HDR buffer it is linear
  let o0 = select(vec4f(c * a, a), vec4f(toLin(c) * a, a), DIRECT);
  let o1 = select(vec4f(0.0, 0.0, 0.0, a), vec4f(toLin(c) * a * v.d.y, a), type_ == 3u && v.d.y > 0.0);
  return InkOut(o0, o1, vec4f(0.0, 0.0, select(0.0, a, type_ == 3u && v.d.y > 0.0), 0.0));
}

// --- grooves: one capsule per segment; nearest segment wins (depth = distance) so joints never double --------
struct Seg { @location(1) seg: vec4f, @location(2) info: vec4f }   // x0 y0 x1 y1 | s0, groove index, half width, segment index
struct SegVary {
  @builtin(position) pos: vec4f,
  @location(0) p: vec2f,
  @location(1) @interpolate(flat) seg: vec4f,
  @location(2) @interpolate(flat) info: vec4f,
}

@vertex fn grooveVS(@builtin(vertex_index) vi: u32, i: Seg) -> SegVary {
  let a = i.seg.xy; let b = i.seg.zw;
  let d = b - a; let L = length(d);
  let t = select(vec2f(1.0, 0.0), d / L, L > 1e-5);
  let n = vec2f(-t.y, t.x);
  let m = i.info.z + 3.0 * F.keyPlan.z + 0.5;
  let q = quadCorner(vi);
  let w = (a + b) * 0.5 + t * q.x * (L * 0.5 + m) + n * q.y * m;
  return SegVary(F.viewProj * vec4f(w, 0.0, 1.0), w, i.seg, i.info);
}

fn Gt(g: u32, k: u32) -> vec4f { return G[g * 16u + k]; }

struct SegHit { d: f32, dv: vec2f, s: f32, hw: f32, aa: f32, alpha: f32, g: u32 }
fn segHit(v: SegVary, pxU: f32) -> SegHit {
  let a = v.seg.xy; let ba = v.seg.zw - a;
  let L2 = dot(ba, ba);
  let t = select(0.0, clamp(dot(v.p - a, ba) / L2, 0.0, 1.0), L2 > 1e-8);
  let dv = v.p - (a + ba * t);
  let d = length(dv);
  let hw = v.info.z;
  let aa = pxU * 0.6;
  let g = u32(v.info.y + 0.5);
  let s = v.info.x + t * sqrt(L2);
  var cov = 1.0 - smoothstep(hw - aa, hw + aa, d);
  // thin lines keep their energy instead of breaking up
  cov *= clamp(2.0 * hw / pxU, 0.35, 1.0);
  let g3 = Gt(g, 3u);
  if (g3.x > 0.0) {
    let ph = fmod(s - g3.z, g3.x + g3.y);
    let aS = max(pxU, 0.05);
    cov *= smoothstep(-aS, aS, ph) * (1.0 - smoothstep(g3.x - aS, g3.x + aS, ph));
  }
  return SegHit(d, dv, s, hw, aa, cov * Gt(g, 0u).z, g);
}

struct IdOut { @location(0) id: vec4f, @builtin(frag_depth) depth: f32 }
// pass 1: the nearest segment (depth = distance from its centre line) records its id; ties (collinear overlaps at
// tees) go to the groove that carries light, then to the lower index
@fragment fn grooveIdFS(v: SegVary) -> IdOut {
  let pxU = length(fwidth(v.p)) * 0.7071 + 1e-5;
  let h = segHit(v, pxU);
  if (h.d > h.hw + h.aa || h.alpha < 0.002) { discard; }
  let depth = clamp(h.d / (h.hw + h.aa + 1e-3), 0.0, 1.0) * 0.95 + Gt(h.g, 2u).w * 0.004 + f32(h.g) * 1e-6;
  return IdOut(vec4f(v.info.w + 1.0, 0.0, 0.0, 0.0), depth);
}

// pass 2: only the winner shades this pixel, so overlapping capsules never double up
@fragment fn grooveFS(v: SegVary) -> Targets {
  let pxU = length(fwidth(v.p)) * 0.7071 + 1e-5;
  let h = segHit(v, pxU);
  if (h.d > h.hw + h.aa || h.alpha < 0.002) { discard; }
  if (abs(textureLoad(idT, vec2i(v.pos.xy), 0).r - (v.info.w + 1.0)) > 0.5) { discard; }
  let g = h.g;
  let g1 = Gt(g, 1u); let g2 = Gt(g, 2u); let g3 = Gt(g, 3u);
  var c = g1.rgb;                  // sRGB
  let x = clamp(h.d / h.hw, 0.0, 1.0);
  let nE = select(vec2f(0.0), h.dv / h.d, h.d > 1e-4);
  let side = dot(nE, F.keyPlan.xy);     // +1: the half toward the light, -1: away
  let prof = 1.0 - x * x;
  if (Gt(g, 0u).x < 0.5) {
    // cut channel: dark core, the far wall's shadow inside the light-side half, a catch-light on the lip
    // whose rounded top faces the light (the lower lip from the default camera)
    let lit = smoothstep(-0.2, 0.9, -side * x) * (1.0 - smoothstep(0.62, 0.9, x));
    c = mix(c, F.grooveRim.rgb, 0.3 * lit);
    c *= 1.0 - 0.45 * smoothstep(0.1, 0.95, x) * max(side, 0.0);
    let lipW = max(0.32, pxU * 1.1) / h.hw;
    let lipBand = smoothstep(1.0 - lipW * 2.2, 1.0 - lipW * 0.8, x) * (1.0 - smoothstep(1.0 - lipW * 0.4, 1.0 + lipW * 0.6, x));
    c = mix(c, F.grooveRim.rgb, clamp(lipBand * max(-side, 0.0) * 1.2, 0.0, 1.0));
  }
  // emission: a light tube while data flows (bright core, soft edges; bloom adds the halo), pulses by arc
  // length on top (tail -> 0, head brightest)
  let core = exp(-x * x * 4.5);
  var e = g2.rgb * g1.w * (0.22 + 0.9 * core);
  if (!isLight() && g1.w > 0.0) { c = mix(c, toSrgb(g2.rgb) * 0.4, clamp(g1.w * 1.2, 0.0, 0.45) * prof); }
  let np = u32(g3.w + 0.5);
  for (var k = 0u; k < 6u; k++) {
    if (k >= np) { break; }
    let pa = Gt(g, 4u + 2u * k); let pc = Gt(g, 5u + 2u * k);
    // s1 is the head; s0 > s1 when the pulse travels against the polyline. a0/a1: relative intensity at
    // each end (a trail split across a branch and the trunk), so pieces join into one continuous trail
    let s0 = pa.x; let s1 = pa.y; let dir = select(-1.0, 1.0, s1 >= s0);
    let along = (h.s - s0) * dir; let len = max(abs(s1 - s0), 1e-3);
    if (along < -0.5 || along > len + 1.0) { continue; }
    let u = clamp(along / len, 0.0, 1.0);
    let a = mix(pc.w, pa.w, u);
    let trail = a * a * (3.0 - 2.0 * a) * a;
    let head = select(0.0, exp(-max(len - along, 0.0) / 2.5) * 1.4, pa.w > 0.999);
    let cut = (1.0 - smoothstep(len - 0.3, len + 0.6, along)) * smoothstep(-0.5, 0.3, along);
    e += pc.rgb * pa.z * (trail + head) * cut;
  }
  e *= mix(0.6, 1.0, prof);
  if (isLight()) {
    // on paper a line that means something (a keyed pointer, a toned link, data in flight) is inked in its own
    // colour, a little deeper than the token so it holds on white ceramic; plain wiring (no glow) stays a quiet cut
    let lineA = clamp(g1.w * 5.2, 0.0, 0.92) * mix(0.7, 1.0, prof);
    c = mix(c, toSrgb(g2.rgb * 0.6), lineA);
    // pulses and their heads: a saturated colour in the channel; the halo comes from the bloom tint
    c = mix(c, toSrgb(hueOf(e) * 0.6), clamp(luma(e) * 3.2, 0.0, 0.94));
  }
  return Targets(vec4f(c * h.alpha, h.alpha), vec4f(e * h.alpha, h.alpha));
}
`;
