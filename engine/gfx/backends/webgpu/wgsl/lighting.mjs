// WGSL lighting shared by the floor and the slabs: PCSS shadows with a coarse min-depth early-out, plan-space
// contact shadows and colour bounce, the key light's pool, point lights and the procedural photo studio.
// A line-for-line port of the GLSL in backends/webgl2/shaders.mjs, so both tiers light a frame alike.
import { STUDIO } from "../../../look.mjs";

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = (a) => `vec3f(${a.map(f).join(", ")})`;
const { KEY, KEY_X, KEY_Y, STRIP, STRIP_Y, SIDE, SIDE_X, SIDE_Y, BACK } = STUDIO;

export const LIGHTING = /* wgsl */ `
// a shadow factor (1 lit .. 0 black) as a tinted multiplier: shadows lean toward PALETTE.*.shadow
fn tintShade(L: f32) -> vec3f { return vec3f(1.0) - (1.0 - clamp(L, 0.0, 1.0)) * F.shadowMix.rgb; }
fn planUv(p: vec2f) -> vec2f { return (p - F.contactRect.xy) * F.contactRect.zw; }
fn inPlan(uv: vec2f) -> bool { return uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0; }
fn bounceAt(p: vec2f) -> vec4f {
  let uv = planUv(p);
  if (!inPlan(uv)) { return vec4f(0.0); }
  return textureSampleLevel(bounceT, linS, uv, 0.0);
}
// colour bounce onto a surface: light added in dark, the paper multiplied toward the data's hue in light
fn applyBounce(col: vec3f, p: vec2f, k: f32) -> vec3f {
  let b = bounceAt(p);
  if (b.a < 1e-3) { return col; }
  if (!isLight()) { return col + b.rgb * F.bounceSatin.x * k; }
  let a = (1.0 - exp(-b.a * 1.3)) * F.bounceSatin.y * k;
  return col * mix(vec3f(1.0), hueOf(b.rgb), a);
}
// the key light is a large soft area light centred over the scene: a broad pool, 1 at the centre, 0 outside
fn keyPool(p: vec2f) -> f32 {
  let rr = length((p - F.scene.xy) / max(F.scene.zw, vec2f(1.0)));
  let k = 1.0 - smoothstep(0.0, 1.12, rr);
  return k * k * (3.0 - 2.0 * k);
}

var<private> PD: array<vec2f, 16> = array<vec2f, 16>(
  vec2f(-0.94201624, -0.39906216), vec2f(0.94558609, -0.76890725), vec2f(-0.094184101, -0.92938870), vec2f(0.34495938, 0.29387760),
  vec2f(-0.91588581, 0.45771432), vec2f(-0.81544232, -0.87912464), vec2f(-0.38277543, 0.27676845), vec2f(0.97484398, 0.75648379),
  vec2f(0.44323325, -0.97511554), vec2f(0.53742981, -0.47373420), vec2f(-0.26496911, -0.41893023), vec2f(0.79197514, 0.19090188),
  vec2f(-0.24188840, 0.99706507), vec2f(-0.81409955, 0.91437590), vec2f(0.19984126, 0.78641367), vec2f(0.14383161, -0.14100790));

fn shadowVis(wp: vec3f, n: vec3f, ndl: f32, frag: vec2f) -> f32 {
  let P = F.shadowP;
  if (P.w < 0.5) { return 1.0; }
  let texU = P.y * P.x;
  let off = n * texU * (0.9 + 2.2 * (1.0 - clamp(ndl, 0.0, 1.0)));
  let c = F.lightVP * vec4f(wp + off, 1.0);
  let s = vec3f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5, c.z);
  if (s.x <= 0.0 || s.y <= 0.0 || s.x >= 1.0 || s.y >= 1.0 || s.z >= 1.0) { return 1.0; }
  let zr = s.z - 0.6 / P.z;
  // early out: no occluder anywhere within the search radius (3x3 coarse texels >= 11 u around, pre-reduced
  // into one texel by shadowNearFS)
  let ms = vec2i(textureDimensions(shadowMinT));
  let mn = textureLoad(shadowMinT, clamp(vec2i(s.xy * vec2f(ms)), vec2i(0), ms - 1), 0).r;
  if (mn >= zr) { return 1.0; }
  let ang = ignT(frag) * 6.2831853;
  let ca = cos(ang); let sa = sin(ang);
  let rot = mat2x2f(ca, sa, -sa, ca);
  let search = 7.0 / P.y;
  let sz = vec2i(textureDimensions(shadowT));
  var sum = 0.0; var cnt = 0.0;
  for (var i = 0; i < 12; i++) {
    let q = clamp(vec2i((s.xy + rot * PD[i] * search) * vec2f(sz)), vec2i(0), sz - 1);
    let d = textureLoad(shadowT, q, 0);
    if (d < zr) { sum += d; cnt += 1.0; }
  }
  if (cnt < 0.5) { return 1.0; }
  let gap = (zr - sum / cnt) * P.z;
  var pen = clamp(0.35 + gap * F.shade.x, 0.45, 9.0) / P.y;
  pen = max(pen, 1.2 * P.x);
  var v = 0.0;
  for (var i = 0; i < 16; i++) { v += textureSampleCompareLevel(shadowT, cmpS, s.xy + rot * PD[i] * pen, zr); }
  return v / 16.0;
}

// the contact map through a cubic B-spline (four bilinear taps): its texels are about half a unit, and a plain
// bilinear read shows them as steps along a shadow's edge
fn contactAt(p: vec2f) -> vec4f {
  let uv = planUv(p);
  if (!inPlan(uv)) { return vec4f(0.0); }
  let size = vec2f(textureDimensions(contactT));
  let x = uv * size - 0.5; let i = floor(x); let f = x - i;
  let f2 = f * f; let f3 = f2 * f;
  let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0; let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0; let w3 = f3 / 6.0;
  let g0 = w0 + w1; let g1 = w2 + w3;
  let h0 = (i - 0.5 + w1 / g0) / size; let h1 = (i + 1.5 + w3 / g1) / size;
  return (textureSampleLevel(contactT, linS, vec2f(h0.x, h0.y), 0.0) * g0.x + textureSampleLevel(contactT, linS, vec2f(h1.x, h0.y), 0.0) * g1.x) * g0.y
       + (textureSampleLevel(contactT, linS, vec2f(h0.x, h1.y), 0.0) * g0.x + textureSampleLevel(contactT, linS, vec2f(h1.x, h1.y), 0.0) * g1.x) * g1.y;
}
// the contact shadow on a raised receiver at height z (0 where the map's receiver is another surface)
fn raisedContact(cs: vec4f, z: f32) -> f32 { return select(0.0, cs.g, cs.g > 0.0 && abs(z - cs.b) < 0.7); }

fn atten(d: f32, R: f32) -> f32 {
  let x = d / R;
  let w = clamp(1.0 - x * x * x * x, 0.0, 1.0);
  return w * w / (1.0 + 14.0 * x * x);
}

fn pointLights(P: vec3f, N: vec3f, wrap: f32) -> vec3f {
  var s = vec3f(0.0);
  let n = u32(F.light.w + 0.5);
  for (var i = 0u; i < 16u; i++) {
    if (i >= n) { break; }
    let d = F.lp[i].xyz - P;
    let dist = length(d);
    if (dist >= F.lp[i].w) { continue; }
    let nl = clamp((dot(N, d / max(dist, 1e-4)) + wrap) / (1.0 + wrap), 0.0, 1.0);
    s += F.lc[i].rgb * atten(dist, F.lp[i].w) * nl;
  }
  return s;
}

fn softbox(r: vec3f, c: vec3f, ax: vec3f, ay: vec3f, hs: vec2f, blur: f32) -> f32 {
  let k = dot(r, c);
  if (k <= 0.05) { return 0.0; }
  let q = vec2f(dot(r, ax), dot(r, ay)) / k;
  let d = abs(q) - hs;
  let sd = length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-blur, blur, sd);
}

// a procedural photo studio: dim surround, a long strip box behind the camera (the catch-light on
// front bevels), a smaller box at the key light, a faint overhead panel
fn studioEnv(r: vec3f, rough: f32) -> vec3f {
  let blur = 0.02 + rough * rough * 0.2;
  let sky = smoothstep(-0.25, 0.35, r.z);
  let g = F.envGain;
  var e = F.envTint.rgb * g.x * mix(F.light.y * 0.6, 1.0, sky);
  e += g.y * softbox(r, ${v3(STRIP)}, vec3f(1.0, 0.0, 0.0), ${v3(STRIP_Y)}, vec2f(2.4, 0.2), blur);
  e += g.y * 0.55 * softbox(r, ${v3(SIDE)}, ${v3(SIDE_X)}, ${v3(SIDE_Y)}, vec2f(0.16, 0.42), blur);
  e += g.z * softbox(r, ${v3(KEY)}, ${v3(KEY_X)}, ${v3(KEY_Y)}, vec2f(0.30, 0.18), blur);
  e += g.x * 0.8 * softbox(r, vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec2f(0.55, 0.4), blur * 2.0);
  // very soft-edged, so a flat top sees a gradient (brighter toward the back) rather than a shape
  let back = smoothstep(-0.9, 0.95, dot(r, ${v3(BACK)})) * smoothstep(-0.1, 0.5, r.z);
  e += F.envTint.rgb * g.w * back * back;
  return vec3f(e);
}
`;
