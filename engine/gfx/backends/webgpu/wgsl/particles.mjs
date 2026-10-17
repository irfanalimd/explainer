// WGSL for data in motion (engine/gfx/motion.mjs): a compute pass turns the frame's emitters into particles
// (pure functions of the playhead and fixed seeds, never integrated, so a frame is the same however it is reached),
// and a render pipeline draws them as camera-facing sprites into the main pass's colour and emission targets.
import { FRAME_WGSL } from "../uniforms.mjs";
import { PATH_N, EMIT } from "../../../motion.mjs";
import { MOTION_FX as FX } from "../../../../tokens.mjs";

const f = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
const CORE = 3.0, CORE_GLOW = 0.6;    // a light trail's hot core, and how much of its broad glow it keeps (dark theme)
const MIRROR_GAIN = 0.5, MIRROR_HEIGHT = 4;   // particles in the floor's reflection: gain, and the height (u) it halves over / ln 2

// emitters: 4 vec4 each   a: type, first particle, count, path    b: linear rgb, intensity
//   trail   c: L, s0, s1, width                d: z0, z1, spacing, seed
//   bytes   c: L, head, zHead, age             d: drift level, seed, time, 0
//   shatter c: x, y, z (top), age              d: w, d, seed, 0
//   (a bytes emitter's count is twice its bytes: each byte rides, then drifts)
// particles: 2 vec4 each   p0: xyz, size u (negative: a trail sprite, drawn with a hot core)    p1: rgb, intensity
export const PARTICLES_CS = /* wgsl */ `
struct Params { time: f32, nEm: u32, total: u32, light: f32 }
@group(0) @binding(0) var<uniform> U: Params;
@group(0) @binding(1) var<storage, read> E: array<vec4f>;
@group(0) @binding(2) var<storage, read> PTS: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> OUT: array<vec4f>;

const PATH_N = ${PATH_N}u;

fn hash(a: u32, b: u32, c: u32) -> f32 {
  var h = a * 747796405u + b * 2891336453u + c * 277803737u + 1013904223u;
  h ^= h >> 16u; h *= 2246822519u; h ^= h >> 13u; h *= 3266489917u; h ^= h >> 16u;
  return f32(h >> 8u) / 16777216.0;
}
fn sstep(x: f32) -> f32 { let c = clamp(x, 0.0, 1.0); return c * c * (3.0 - 2.0 * c); }
// toward neutral by k: on the dark stage a whiter, hotter light; on paper a deeper ink (a pale dot would vanish)
fn neutral(c: vec3f, k: f32) -> vec3f {
  if (U.light > 0.5) { return mix(c, vec3f(0.035, 0.04, 0.055), k * 0.55); }
  return mix(c, vec3f(max(max(c.r, c.g), c.b)), k);
}

// a point on path p at local arc length s (0..L): xy and the unit direction there
fn along(p: u32, L: f32, s: f32) -> vec4f {
  let x = clamp(s / max(L, 1e-3), 0.0, 1.0) * f32(PATH_N - 1u);
  let i = min(u32(x), PATH_N - 2u);
  let a = PTS[p * PATH_N + i]; let b = PTS[p * PATH_N + i + 1u];
  let d = b - a; let dl = length(d);
  return vec4f(mix(a, b, x - f32(i)), select(vec2f(1.0, 0.0), d / dl, dl > 1e-5));
}

fn emit(i: u32, pos: vec3f, size: f32, col: vec3f, inten: f32) {
  OUT[i * 2u] = vec4f(pos, size);
  OUT[i * 2u + 1u] = vec4f(col, max(inten, 0.0));
}

// a ribbon of light behind a moving thing: brightest and widest at the thing, thinning to nothing at the tail
fn trail(i: u32, j: u32, n: u32, a: vec4f, b: vec4f, c: vec4f, d: vec4f) {
  let u = select(f32(j) / f32(n - 1u), 1.0, n < 2u);
  let s = mix(c.y, c.z, u);
  let q = along(u32(a.w), c.x, s);
  let z = mix(d.x, d.y, pow(u, ${f(FX.trail.hold)}));   // holds the thing's height, then sinks to the groove
  let size = c.w * (0.18 + 0.82 * u);
  // overlapping sprites: scale each by its share so the ribbon's brightness does not depend on the spacing
  let share = clamp(d.z / (size * 0.9), 0.0, 1.0);
  // a whiter core toward the head, as a hot line of light reads
  let col = neutral(b.rgb, 0.28 * u * u);
  emit(i, vec3f(q.xy, z), -size, col, b.w * u * u * share);
}

// one particle per byte, twice: j < n is a bead riding single file behind the moving thing, on its trail (so a
// slip of 9 bytes trails 9 beads); j >= n is the same byte on the wire it used after it lands, the n beads evenly
// spaced and drifting slowly toward where they went. The two cross-fade (b.w: the ride, d.x: the drift).
fn bytes(i: u32, j: u32, n: u32, a: vec4f, b: vec4f, c: vec4f, d: vec4f) {
  let seed = u32(d.y); let t = d.z; let k = j % n;
  let L = c.x; let p = u32(a.w);
  if (j < n) {
    // on landing the beads close up into the thing, nearest first
    let settle = sstep(max(c.w, 0.0) / ${f(FX.stream.settle)});
    let lag = (${f(FX.stream.gap)} + f32(k) * ${f(FX.stream.spacing)}) * (1.0 - settle);
    let s = c.y - lag;
    let q = along(p, L, max(s, 0.0));
    let u = clamp(1.0 - lag / ${f(FX.trail.length)}, 0.0, 1.0);
    let z = mix(${f(FX.trail.zFloor)}, c.z, pow(u, ${f(FX.trail.hold)}));
    let fall = 1.0 - 0.45 * f32(k) / f32(max(n, 2u) - 1u);
    let col = neutral(b.rgb, ${f(FX.stream.white)});
    emit(i, vec3f(q.xy, z + 0.4), ${f(FX.stream.size)}, col, b.w * fall * sstep(s / 4.0) * (1.0 - settle * 0.6));
    return;
  }
  // the drift: the flight's n bytes evenly spread along the whole wire, faded at both ends
  let s = fract((f32(k) + 0.5) / f32(n) + hash(seed, 7u, 1u) + t * ${f(FX.flow.speed)} / L) * L;
  let q = along(p, L, s);
  let side = vec2f(-q.w, q.z);
  let e = ${f(FX.flow.edge)};
  let ends = sstep(s / e) * sstep((L - s) / e);
  let pos = vec3f(q.xy + side * (hash(seed, k, 2u) - 0.5) * 0.8, ${f(FX.flow.rise)});
  emit(i, pos, ${f(FX.flow.size)}, neutral(b.rgb, ${f(FX.flow.white)}), d.x * ends);
}

// a crashed machine's lost work: the slip's colour rises out of it as soft motes (the slip itself greys out
// beneath them), one after another, drifting up and a little apart, fading as they go. On paper a mote is an ink
// dot that would sit on the greyed label: there they leave from the slip's rim, outward
fn shatter(i: u32, j: u32, n: u32, a: vec4f, b: vec4f, c: vec4f, d: vec4f) {
  let seed = u32(d.z);
  let h1 = hash(seed, j, 1u); let h2 = hash(seed, j, 2u); let h3 = hash(seed, j, 3u); let h4 = hash(seed, j, 4u);
  var start = (vec2f(h1, h2) - 0.5) * vec2f(d.x, d.y) * 0.85;
  if (U.light > 0.5) {
    let dir = vec2f(cos(h1 * 6.2831853), sin(h1 * 6.2831853));
    start = dir / max(abs(dir.x) / (0.5 * d.x), abs(dir.y) / (0.5 * d.y));
  }
  let life = ${f(FX.shatter.life)};
  let age = c.w - h3 * ${f(FX.shatter.stagger)};
  if (age <= 0.0) { emit(i, vec3f(0.0), 0.0, vec3f(0.0), 0.0); return; }
  let x = clamp(age / life, 0.0, 1.0);
  let ease = 1.0 - (1.0 - x) * (1.0 - x);
  let outv = normalize(start + vec2f(1e-3, 0.0)) * ${f(FX.shatter.spread)} * (0.4 + h4) * ease;
  let pos = vec3f(c.xy + start + outv, c.z + 0.8 + ${f(FX.shatter.rise)} * (0.6 + 0.6 * h4) * ease);
  let fade = sstep(age / 0.3) * pow(1.0 - x, 1.5);
  emit(i, pos, ${f(FX.shatter.size)} * (0.8 + 0.4 * h2), b.rgb, b.w * fade);
}

@compute @workgroup_size(64) fn particlesCS(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= U.total) { return; }
  // the emitter that owns particle i: the last one whose first particle is <= i
  var lo = 0u; var hi = U.nEm;
  loop { if (hi - lo <= 1u) { break; } let mid = (lo + hi) / 2u; if (u32(E[mid * 4u].y) <= i) { lo = mid; } else { hi = mid; } }
  let a = E[lo * 4u]; let b = E[lo * 4u + 1u]; let c = E[lo * 4u + 2u]; let d = E[lo * 4u + 3u];
  let j = i - u32(a.y);
  let kind = u32(a.x);
  if (kind == ${EMIT.trail}u) { trail(i, j, u32(a.z), a, b, c, d); }
  else if (kind == ${EMIT.bytes}u) { bytes(i, j, max(u32(a.z) / 2u, 1u), a, b, c, d); }
  else { shatter(i, j, u32(a.z), a, b, c, d); }
}
`;

export const PARTICLES_RS = /* wgsl */ `
${FRAME_WGSL}
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> P: array<vec4f>;

// the floor's mirror image: the same sprites, fainter, and only those near the floor (a light high above would
// mirror as a detached ghost far below it)
override MIRROR: bool = false;
struct Vary { @builtin(position) pos: vec4f, @location(0) uv: vec2f, @location(1) col: vec4f, @location(2) @interpolate(flat) core: f32 }
struct Targets { @location(0) color: vec4f, @location(1) emis: vec4f, @location(2) motion: vec4f }   // motion: reactive only

@vertex fn particleVS(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Vary {
  let p0 = P[ii * 2u]; let p1 = P[ii * 2u + 1u];
  var o: Vary;
  let size0 = abs(p0.w);
  if (size0 <= 0.0 || p1.w <= 0.0) { o.pos = vec4f(2.0, 2.0, 2.0, 1.0); return o; }
  let corner = vec2f(f32(vi & 1u) * 2.0 - 1.0, f32(vi >> 1u) * 2.0 - 1.0);
  let toEye = normalize(F.eye.xyz - p0.xyz);
  let upRef = select(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), abs(toEye.z) > 0.98);
  let right = normalize(cross(upRef, toEye));
  let up = cross(toEye, right);
  // never smaller than about 2 device px (no shimmer); a sprite held at that floor dims a little
  let size = max(size0, F.keyPlan.z * 2.0);
  let world = p0.xyz + (right * corner.x + up * corner.y) * size;
  o.pos = F.viewProj * vec4f(world, 1.0);
  o.uv = corner;
  o.col = vec4f(p1.rgb, p1.w * (size0 / size));
  o.core = select(0.0, 1.0, p0.w < 0.0);
  if (MIRROR) { o.col.a *= ${f(MIRROR_GAIN)} * exp(-max(abs(p0.z), 0.0) / ${f(MIRROR_HEIGHT)}); }
  return o;
}

fn luma3(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
@fragment fn particleFS(v: Vary) -> Targets {
  let r2 = dot(v.uv, v.uv);
  // a bright core and a soft shoulder, reaching zero at the sprite's edge
  let g = (exp(-r2 * 7.0) + 0.22 * exp(-r2 * 2.2)) * (1.0 - smoothstep(0.7, 1.0, r2));
  if (F.eye.w > 0.5) {
    // light theme: no glow to carry a small light, so a crisp ink dot (a soft-edged disc), saturated on the paper,
    // with a little halo through the emission target
    let a = v.col.a * (1.0 - smoothstep(0.5, 0.95, sqrt(r2)));
    let k = clamp(a, 0.0, 1.0);
    return Targets(vec4f(v.col.rgb * k, k), vec4f(v.col.rgb * a * 0.35, 0.0), vec4f(0.0, 0.0, k, 0.0));
  }
  // a trail's hot core: a narrow, whiter line down the ribbon's middle, so it reads apart from the groove's glow;
  // the broad glow round it gives up a little, so the ribbon is no brighter overall
  let a = v.col.a * g * mix(1.0, ${f(CORE_GLOW)}, v.core);
  let hot = v.core * v.col.a * exp(-r2 * 28.0) * ${f(CORE)};
  let c = v.col.rgb * a + mix(v.col.rgb, vec3f(luma3(v.col.rgb)), 0.75) * hot;
  return Targets(vec4f(c, 0.0), vec4f(c * 0.9, 0.0), vec4f(0.0, 0.0, clamp(luma3(c) * 4.0, 0.0, 1.0), 0.0));
}
`;
