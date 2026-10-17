// WGSL for the one slab primitive: procedural placement from the ring-stack template (slabmesh.mjs), the
// shadow-map vertex stage, and the full surface shader (wells, meter, SDF labels, status accent, studio
// speculars, point lights, emission). REFLECT renders the same surface into the floor's mirror image.
import { MATERIAL } from "../../../../tokens.mjs";

const EDGE = ["matte", "ceramic", "glass", "metal"].map((k) => (MATERIAL[k].edge ?? 0).toFixed(3)).join(", ");

export const SLAB = /* wgsl */ `
override REFLECT: bool = false;
const EDGE = array<f32, 4>(${EDGE});

struct SlabVary {
  @builtin(position) pos: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) local: vec3f,
  @location(3) localN: vec3f,
  @location(4) @interpolate(flat) id: u32,
  @location(5) clipNow: vec4f,           // un-jittered clip position now and at the last frame (slabMainVS only)
  @location(6) clipPrev: vec4f,
  @location(7) @interpolate(flat) reactive: f32,     // its look changed since the last frame (slabMainVS only)
}
struct Placed { world: vec3f, normal: vec3f, local: vec3f, localN: vec3f }

fn rr(hs: vec2f, r: f32, s: vec2f, th: f32, off: f32) -> vec4f {
  let n = vec2f(s.x * cos(th), s.y * sin(th));
  return vec4f(s * max(hs - r, vec2f(0.0)) + n * max(r + off, 0.0), n);
}
// texels 0 (position, scale), 1 (size), 2 (bevel, yaw, pitch, roll) and 6 (well) place it: this frame's, or the
// last frame's (prevI: those 4, then whether its look changed)
fn slabPlace(id: u32, plan: vec3f, prof: vec2f, t0: vec4f, t1: vec4f, t2: vec4f, t6: vec4f) -> Placed {
  let t7 = inst(id, 7u);
  let hs = t1.xy * 0.5; let h = t1.z; let r = t1.w; let bev = t2.x;
  let hc = t6.xy; let hh = t6.zw; let hr = t7.x; let dep = t7.y; let lip = t7.z;
  let s = plan.xy; let th = plan.z; let kind = u32(prof.x + 0.5); let phi = prof.y;
  var p: vec3f; var n: vec3f;
  switch kind {
    case 0u: { p = vec3f(0.0); n = vec3f(0.0, 0.0, -1.0); }
    case 1u: { p = vec3f(rr(hs, r, s, th, 0.0).xy, 0.0); n = vec3f(0.0, 0.0, -1.0); }
    case 2u: { let q = rr(hs, r, s, th, 0.0); p = vec3f(q.xy, 0.0); n = vec3f(q.zw, 0.0); }
    case 3u: { let q = rr(hs, r, s, th, -bev * (1.0 - cos(phi))); p = vec3f(q.xy, h - bev + bev * sin(phi)); n = vec3f(q.zw * cos(phi), sin(phi)); }
    case 4u: { let q = rr(hh, hr, s, th, lip * (1.0 - sin(phi))); p = vec3f(hc + q.xy, h - lip * (1.0 - cos(phi))); n = vec3f(-q.zw * sin(phi), cos(phi)); }
    case 5u: { let q = rr(hh, hr, s, th, 0.0); p = vec3f(hc + q.xy, h - dep); n = vec3f(-q.zw, 0.0); }
    case 6u: { let q = rr(hh, hr, s, th, 0.0); p = vec3f(hc + q.xy, h - dep); n = vec3f(0.0, 0.0, 1.0); }
    default: { p = vec3f(hc, h - dep); n = vec3f(0.0, 0.0, 1.0); }
  }
  let sc = t0.w;
  let R = slabRot(t2.yzw);
  let piv = vec3f(0.0, 0.0, 0.5 * h * sc);
  return Placed(t0.xyz + piv + R * (p * sc - piv), R * n, p, n);
}
fn slabVertex(id: u32, plan: vec3f, prof: vec2f) -> Placed { return slabPlace(id, plan, prof, inst(id, 0u), inst(id, 1u), inst(id, 2u), inst(id, 6u)); }

@vertex fn slabVS(@location(0) plan: vec3f, @location(1) prof: vec2f, @builtin(instance_index) id: u32) -> SlabVary {
  let v = slabVertex(id, plan, prof);
  return SlabVary(F.viewProj * vec4f(v.world, 1.0), v.world, v.normal, v.local, v.localN, id, vec4f(0.0), vec4f(0.0), 0.0);
}
// the main pass: also where the vertex was at the last frame, for the temporal resolve
@vertex fn slabMainVS(@location(0) plan: vec3f, @location(1) prof: vec2f, @builtin(instance_index) id: u32) -> SlabVary {
  let v = slabVertex(id, plan, prof);
  let b = id * 5u;
  let w0 = slabPlace(id, plan, prof, prevI[b], prevI[b + 1u], prevI[b + 2u], prevI[b + 3u]).world;
  return SlabVary(F.viewProj * vec4f(v.world, 1.0), v.world, v.normal, v.local, v.localN, id,
    F.vpNow * vec4f(v.world, 1.0), F.vpPrev * vec4f(w0, 1.0), prevI[b + 4u].x);
}

@vertex fn shadowVS(@location(0) plan: vec3f, @location(1) prof: vec2f, @builtin(instance_index) id: u32) -> @builtin(position) vec4f {
  if ((u32(inst(id, 5u).w + 0.5) & 1u) == 1u) { return vec4f(2.0, 2.0, 2.0, 1.0); }
  return F.lightVP * vec4f(slabVertex(id, plan, prof).world, 1.0);
}

struct Targets { @location(0) color: vec4f, @location(1) emis: vec4f }
struct Lit { @location(0) color: vec4f, @location(1) emis: vec4f, @location(2) motion: vec4f }   // motion: uv per frame, 0, coverage

@fragment fn slabFS(v: SlabVary, @builtin(front_facing) front: bool) -> Lit {
  let id = v.id;
  let t1 = inst(id, 1u); let t2 = inst(id, 2u); let t3 = inst(id, 3u); let t4 = inst(id, 4u); let t5 = inst(id, 5u);
  let t6 = inst(id, 6u); let t7 = inst(id, 7u); let t8 = inst(id, 8u); let t10 = inst(id, 10u); let t11 = inst(id, 11u);
  let hs = t1.xy * 0.5; let h = t1.z; let r = t1.w; let bev = t2.x;
  var N = normalize(v.normal);
  if (!front) { N = -N; }
  let V = normalize(F.eye.xyz - v.world);
  let lp = v.local.xy;
  let uPerPx = length(fwidth(v.local)) * 0.7071 + 1e-5;
  let R = slabRot(t2.yzw);
  let Ll = transpose(R) * F.keyDir.xyz;
  let matId = u32(t3.w + 0.5);
  let M = F.mat[matId];
  let flags = u32(t5.w + 0.5);
  let atlasSize = F.lit.w; let spreadPx = F.stage.w;

  var alb = t3.rgb;
  var emis = vec3f(0.0);
  var inkA = 0.0;                        // printed ink covers the glowing body
  var inkZone = 0.0;                     // inside a dark label's box: the body there sends no bloom over it
  var wellShadow = 1.0; var ao = 1.0;
  let hasWell = t6.z > 0.001;
  let hc = t6.xy; let hh = t6.zw; let hr = t7.x; let dep = t7.y; let lip = t7.z;
  let dHole = select(1e3, sdRR(lp - hc, hh, hr), hasWell);
  let topFace = v.localN.z > 0.999 && v.local.z > h - 0.02;
  let interior = hasWell && v.local.z < h - 0.002 && dHole < lip + 0.02;

  // a through-hole (selection rings): no floor inside
  if ((flags & 4u) == 4u && interior && v.local.z < 0.01) { discard; }
  if (interior) {
    let below = h - v.local.z;
    let floorS = v.localN.z > 0.999 && v.local.z < h - dep + 0.01;
    if (floorS) { alb = t8.rgb; }
    // the walls shade the tray: a ray toward the key light leaves the well through a wall?
    let q = lp + Ll.xy / max(Ll.z, 0.25) * below;
    let dq = sdRR(q - hc, hh, hr);
    let soft = 0.18 + 0.22 * below;
    wellShadow = 1.0 - smoothstep(-soft, soft, dq);
    if (floorS) { ao = mix(0.5, 1.0, smoothstep(0.0, 3.2, -dHole)); }
    else { ao = mix(0.62, 1.0, clamp((v.local.z - (h - dep)) / max(dep, 0.01), 0.0, 1.0)); }
  }

  if (topFace && !interior) {
    // meter inlay
    if ((flags & 2u) == 2u) {
      let m = inst(id, 9u);
      let dm = sdRR(lp - m.xy, m.zw, min(m.z, m.w));
      let inside = 1.0 - smoothstep(-uPerPx, uPerPx, dm);
      let edge = m.x - m.z + 2.0 * m.z * clamp(t7.w, 0.0, 1.0);
      let fill = (1.0 - smoothstep(-uPerPx, uPerPx, sdRR(lp - m.xy, m.zw - 0.55, max(min(m.z, m.w) - 0.55, 0.0))))
               * (1.0 - smoothstep(edge - uPerPx, edge + uPerPx, lp.x));
      let lipShade = smoothstep(-1.2, 0.0, dm) * step(lp.y, m.y);   // inner shadow on the far edge
      alb = mix(alb, t8.rgb * (1.0 - 0.35 * lipShade), inside);
      alb = mix(alb, t10.rgb, fill);
      emis += t10.rgb * fill * t11.y;
    }
    // labels: SDF text printed or engraved on the top face
    let nl = u32(t10.w + 0.5);
    let faceD = sdRR(lp, hs - bev, max(r - bev, 0.0));
    let faceMask = 1.0 - smoothstep(-0.5, 0.0, faceD);
    let lpl = normalize(Ll.xy + 1e-5);
    for (var k = 0u; k < 3u; k++) {
      if (k >= nl) { break; }
      let qd = inst(id, 12u + 4u * k);
      let rel = (lp - (qd.xy - qd.zw)) / (2.0 * qd.zw);
      if (rel.x < 0.0 || rel.y < 0.0 || rel.x > 1.0 || rel.y > 1.0) { continue; }
      let uvr = inst(id, 13u + 4u * k); let col = inst(id, 14u + 4u * k); let ex = inst(id, 15u + 4u * k);
      let uv = mix(uvr.xy, uvr.zw, rel);
      let uvPerU = (uvr.zw - uvr.xy) / (2.0 * qd.zw);
      let texPerU = uvPerU.x * atlasSize;
      let sdPx = texPerU * uPerPx / (2.0 * spreadPx);           // SDF units per screen pixel
      let aa = clamp(sdPx * 0.85, 0.003, 0.2);
      let sd = textureSampleLevel(atlasT, linS, uv, 0.0).r;
      // dark ink on a bright body: linear-light coverage thins dark strokes to a grey hairline, so small
      // dark text is dilated (stem darkening, up to ~0.4 px) and blended in sRGB below
      let darkInk = select(smoothstep(0.03, 0.2, luma(alb) - luma(col.rgb)), 0.0, ex.x > 0.5);
      inkZone = max(inkZone, darkInk * col.a);
      let smallTxt = 1.0 - smoothstep(18.0, 54.0, 2.0 * qd.w / uPerPx);
      let grow = darkInk * min(sdPx * (0.05 + 0.15 * smallTxt), 0.07);
      var a = smoothstep(0.5 - grow - aa, 0.5 - grow + aa, sd) * col.a * faceMask;
      // clip box for rolling values (y window in face coords)
      a *= (1.0 - smoothstep(ex.z - uPerPx, ex.z, abs(lp.y - ex.w)));
      if (ex.x > 0.5) {
        // the cut's walls only read when the letters are big; small engraving lifts its fill to stay legible
        let hpx = 2.0 * qd.w / uPerPx;
        let big = smoothstep(26.0, 60.0, hpx);
        let o = ex.y;
        let sdT = textureSampleLevel(atlasT, linS, uv + lpl * o * uvPerU, 0.0).r;
        let sdA = textureSampleLevel(atlasT, linS, uv - lpl * o * uvPerU, 0.0).r;
        let shade = smoothstep(0.5 + aa, 0.5 - aa, sdT) * big;    // the wall toward the light shades the cut
        let catchL = smoothstep(0.5 + aa, 0.5 - aa, sdA) * big;   // the far wall faces the light
        let fillC = select(col.rgb * mix(1.55, 1.15, big), col.rgb * mix(0.8, 1.0, big), isLight());
        let c = fillC * (1.0 - 0.36 * shade) + fillC * 0.3 * catchL * (1.0 - shade);
        alb = mix(alb, c, a);
      } else {
        // ink mixes in sRGB, as a print (and the HUD's text) would: linear coverage swells light strokes into bold
        alb = toLin(mix(toSrgb(alb), toSrgb(col.rgb), a));
      }
      inkA = max(inkA, a);
    }
  }

  // status accent: a luminous strip under the header (or a ring round a round well)
  let t24 = inst(id, 24u); let t25 = inst(id, 25u);
  let acL = t24.w;
  var acCore = 0.0; var acHalo = 0.0;
  if (acL > 0.0 && topFace && !interior) {
    var dA: f32; var ends = 1.0;
    if (t25.z < 0.0) { dA = abs(dHole - t25.y) - t25.w; }
    else {
      let rel = lp - t25.xy;
      dA = sdRR(rel, vec2f(t25.z, t25.w), t25.w);
      ends = 1.0 - 0.65 * smoothstep(0.5, 1.0, abs(rel.x) / t25.z);   // a light tube: brightest at its middle
    }
    acCore = clamp(0.5 - dA / max(uPerPx, 1e-4), 0.0, 1.0) * ends * (1.0 - inkA);
    acHalo = exp(-max(dA, 0.0) / 2.6) * (1.0 - smoothstep(-0.2, 0.6, -dA)) * ends;
  }

  // desaturate (dead or disabled), darken (crashed)
  let des = t5.z;
  alb = mix(alb, vec3f(luma(alb)) * 0.8, des);
  alb *= 1.0 - t11.w;

  let NdK = dot(N, F.keyDir.xyz);
  // the mirror image is blurred anyway: it skips the soft-shadow search (whose per-pixel noise would show)
  var vis = select(0.0, 1.0, NdK > 0.0);
  if (NdK > 0.0 && !REFLECT) { vis = shadowVis(v.world, N, NdK, v.pos.xy); }   // only faces the key light reaches
  vis = min(vis, wellShadow);
  let key = F.keyDir.w; let fill = F.fillDir.w; let amb = F.light.x; let norm = F.light.z;
  let hemi = mix(F.light.y, 1.0, N.z * 0.5 + 0.5);
  let diffFull = (amb * hemi + key * max(NdK, 0.0) + fill * max(dot(N, F.fillDir.xyz), 0.0)) * norm;
  let diff = (amb * hemi + key * max(NdK, 0.0) * vis + fill * max(dot(N, F.fillDir.xyz), 0.0)) * norm;
  let pool = mix(1.0, F.shade.y, keyPool(v.world.xy));

  // contact shadows from elevated casters (tiles in trays, LEDs on housings)
  if (N.z > 0.5) {
    let cs = contactAt(v.world.xy);
    ao *= 1.0 - raisedContact(cs, v.world.z) * 0.7;
  }
  // a soft darkening where the sides meet whatever they stand on
  if (abs(v.localN.z) < 0.5) { ao *= mix(0.62, 1.0, mix(1.0, smoothstep(0.0, min(h, 5.0) + 1.5, v.local.z), t11.x)); }

  // cast shadows and occlusion are tinted (cool), never neutral grey
  var col = alb * diffFull * pool * tintShade(diff / max(diffFull, 1e-4) * ao);
  // colour bounce from data onto neutral surfaces facing up (wells, housing tops, plates)
  if (N.z > 0.5) {
    let chroma = max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b));
    col = applyBounce(col, v.world.xy, (1.0 - smoothstep(0.08, 0.3, chroma)) * N.z);
  }
  // keyed ceramic tiles: a satin top gradient (inner luminance), brighter toward the back
  if (matId == 1u && topFace && !interior) {
    let mx = max(alb.r, max(alb.g, alb.b));
    let sat = (mx - min(alb.r, min(alb.g, alb.b))) / max(mx, 1e-4);
    let g = smoothstep(hs.y, -hs.y, lp.y);
    let inner = 1.0 - smoothstep(0.2, 1.0, length(lp / max(hs, vec2f(1.0))));
    col *= 1.0 + F.bounceSatin.z * sat * (0.85 * g - 0.3 + 0.45 * inner) * (1.0 - 0.8 * inkA);
    col += alb * sat * F.bounceSatin.w * (1.0 - inkA);
    emis += alb * sat * F.bounceSatin.w * 0.6 * (1.0 - inkA);
  }

  // point lights: nearby lights tint solids (the floor pool stays the main cue), soft-saturated so a
  // packet brushing past a dark body colours it, never washes it out
  let pl = pointLights(v.world, N, 0.15);
  if (!isLight()) { col += pl / (1.0 + luma(pl) * 1.6) * (alb * 0.9 + 0.01) * F.shade.z * ao; }
  else {
    let a = 1.0 - exp(-luma(pl) * 1.4);
    col = mix(col, col * mix(vec3f(1.0), hueOf(pl), 0.85), a * 0.55);
  }

  // specular: studio softbox reflections (the bevel catch-light) and the key highlight. The mirror image keeps
  // only the body's diffuse light and glow: seen from under the floor, grazing catch-lights would flare at corners
  let specK = select(1.0, 0.0, REFLECT);
  let NdV = max(dot(N, V), 1e-3);
  let Rv = reflect(-V, N);
  let F0 = 0.02 + 0.4 * M.y * M.y;                    // reflectance: satin anodised matte ~0.02, ceramic glaze ~0.07
  let Fr = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
  let specTint = mix(vec3f(1.0), alb / max(max(alb.r, max(alb.g, alb.b)), 1e-3), M.w);
  let specOcc = mix(0.35, 1.0, vis) * ao;
  let env = studioEnv(Rv, M.x);
  // flat tops keep their token colour legible: a satin sheen there, the crisp catch-lights live on bevels;
  // printed ink is matte: the glaze's sheen over a label would lift dark ink toward grey
  let topK = select(1.0, 0.35 * (1.0 - 0.85 * inkA), v.localN.z > 0.999);
  col += env * mix(Fr, 0.55 + 0.45 * Fr, M.w) * specTint * specOcc * topK * specK;
  let Hk = normalize(F.keyDir.xyz + V);
  var a2 = max(M.x * M.x, 0.02); a2 *= a2;
  let nh = max(dot(N, Hk), 0.0);
  let D = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  col += key * norm * vis * max(NdK, 0.0) * D * Fr * M.y * 0.25 * specTint * (1.0 - 0.85 * inkA) * specK;
  // material rim: a fresnel lift on silhouettes (environment)
  col += F.envTint.rgb * F.envGain.x * pow(1.0 - NdV, 4.0) * M.z * 0.5 * ao * specK;
  // the machined chamfer: a fine catch-light along the top bevel (dark studio; white ceramic carries its own)
  let chamfer = smoothstep(0.3, 0.7, v.localN.z) * (1.0 - smoothstep(0.86, 0.985, v.localN.z)) * step(h - bev - 0.02, v.local.z);
  if (!isLight()) { col += F.envTint.rgb * chamfer * EDGE[min(matId, 3u)] * (0.55 + 0.45 * vis) * ao * specK; }

  // attention rim on the bevel and silhouette
  let bevelMask = select(0.0, 1.0, v.localN.z > 0.04 && v.localN.z < 0.995 && v.local.z > h - bev - 0.02);
  let sil = pow(1.0 - NdV, 3.0) * step(abs(v.localN.z), 0.7) * specK;
  let rim = t5.x;
  if (rim > 0.0) {
    let m = clamp(bevelMask * 0.9 + sil * 0.8, 0.0, 1.0) * rim;
    if (!isLight()) { col += F.lit.rgb * m * 0.85; emis += F.lit.rgb * m * 0.42; }
    else { col = mix(col, F.lit.rgb, clamp(m * 1.25, 0.0, 0.95)); }
  }

  // status accent: strip, its light on the top, and a faint matching rim on the bevel
  if (acL > 0.0) {
    let ac = t24.rgb;
    let rimA = clamp(bevelMask * 0.9 + sil * 0.25, 0.0, 1.0) * t11.z;
    if (!isLight()) {
      col += ac * acL * (acCore * F.accent.x + acHalo * F.accent.y * 0.22);
      emis += ac * acL * (acCore * F.accent.x * 0.85 + acHalo * F.accent.y * 0.05);
      col += ac * rimA * 0.7; emis += ac * rimA * 0.3;
    } else {
      col *= mix(vec3f(1.0), hueOf(ac), clamp(acHalo * F.accent.y * acL * 0.55, 0.0, 0.6));
      col = mix(col, ac * 0.92, clamp(acCore * min(acL, 1.0) * 0.96, 0.0, 1.0));
      emis += ac * acL * acCore * F.accent.x * 0.45;
      col = mix(col, ac, clamp(rimA * 0.55, 0.0, 0.6));
    }
  }

  // self illumination
  let e = t4.w * (1.0 - 0.8 * des) * (1.0 - 0.92 * inkA);
  if (e > 0.0) {
    let ec = t4.rgb;
    if (!isLight()) { col += ec * e; emis += ec * e; }
    else {
      col = mix(col, ec * (1.0 + 0.08 * max(e - 1.0, 0.0)), clamp(e, 0.0, 1.0) * 0.92);
      emis += ec * e * 0.75;
    }
  }
  // a glowing keycap still glows round its label, but its own halo would fill thin dark strokes with light
  emis *= 1.0 - 0.85 * inkZone;
  // the mirror pass keeps coverage in colour alpha and the height above the floor in emission alpha
  if (REFLECT) { return Lit(vec4f(col, 1.0), vec4f(emis, v.world.z), vec4f(0.0)); }
  return Lit(vec4f(col, t5.y), vec4f(emis, t5.y), vec4f(motionOf(v.clipNow, v.clipPrev), v.reactive, smoothstep(0.05, 0.35, t5.y)));
}
`;
