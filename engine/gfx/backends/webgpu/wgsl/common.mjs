// WGSL shared by every scene pass: the bindings (one numbering for the whole scene module; each pipeline's
// layout lists only the ones its entry points use), slab instance access, SDF and colour helpers.
// Slab instance data is a storage buffer of 26 vec4s per slab, laid out as in pack.mjs.
import { FRAME_WGSL } from "../uniforms.mjs";

export const COMMON = /* wgsl */ `
diagnostic(off, derivative_uniformity);
${FRAME_WGSL}

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> I: array<vec4f>;
@group(0) @binding(2) var atlasT: texture_2d<f32>;
@group(0) @binding(3) var linS: sampler;
@group(0) @binding(4) var shadowT: texture_depth_2d;
@group(0) @binding(5) var cmpS: sampler_comparison;
@group(0) @binding(6) var shadowMinT: texture_2d<f32>;
@group(0) @binding(7) var contactT: texture_2d<f32>;
@group(0) @binding(8) var bounceT: texture_2d<f32>;
@group(0) @binding(9) var layer0T: texture_2d<f32>;
@group(0) @binding(10) var layer1T: texture_2d<f32>;
@group(0) @binding(11) var reflT: texture_2d<f32>;
@group(0) @binding(12) var reflBlurT: texture_2d<f32>;
@group(0) @binding(13) var reflAuxT: texture_2d<f32>;
@group(0) @binding(14) var<storage, read> G: array<vec4f>;
@group(0) @binding(15) var idT: texture_2d<f32>;
@group(0) @binding(16) var behindT: texture_2d<f32>;        // the resolved opaque world, seen through glass
@group(0) @binding(17) var<storage, read> prevI: array<vec4f>;  // each slab at the last frame: texels 0, 1, 2, 6, changed

fn inst(id: u32, k: u32) -> vec4f { return I[id * 26u + k]; }
fn slabRot(ypr: vec3f) -> mat3x3f {
  let cy = cos(ypr.x); let sy = sin(ypr.x); let cp = cos(ypr.y); let sp = sin(ypr.y); let cr = cos(ypr.z); let sr = sin(ypr.z);
  let Rz = mat3x3f(cy, sy, 0.0, -sy, cy, 0.0, 0.0, 0.0, 1.0);
  let Rx = mat3x3f(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  let Ry = mat3x3f(cr, 0.0, -sr, 0.0, 1.0, 0.0, sr, 0.0, cr);
  return Rz * Rx * Ry;
}
fn isLight() -> bool { return F.eye.w > 0.5; }

fn sdRR(p: vec2f, hs: vec2f, r: f32) -> f32 {
  let q = abs(p) - hs + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn toLin(c: vec3f) -> vec3f { return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c < vec3f(0.04045)); }
fn toSrgb(x: vec3f) -> vec3f { let c = max(x, vec3f(0.0)); return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c < vec3f(0.0031308)); }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
// the same noise, moved on per sample (supersampled and temporal frames average it away instead of freezing it)
fn ignT(p: vec2f) -> f32 { return ign(p + 5.588238 * F.keyPlan.w); }
// screen motion since the last frame (uv units), from un-jittered clip positions now and then
fn motionOf(now: vec4f, prev: vec4f) -> vec2f {
  if (prev.w <= 1e-6 || now.w <= 1e-6) { return vec2f(0.0); }
  return (now.xy / now.w - prev.xy / prev.w) * vec2f(0.5, -0.5);
}
fn fmod(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
// the hue of a colour at full brightness (for tinting paper toward a light's own colour)
fn hueOf(c: vec3f) -> vec3f { return c / max(max(c.r, c.g), max(c.b, 1e-4)); }

// a unit quad as a 4-vertex triangle strip
fn quadCorner(vi: u32) -> vec2f { return vec2f(f32(vi & 1u) * 2.0 - 1.0, f32(vi >> 1u) * 2.0 - 1.0); }
`;
