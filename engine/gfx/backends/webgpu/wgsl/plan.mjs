// WGSL for the plan-space maps: contact shadows and colour bounce (Gaussian-blurred rounded rects, Evan
// Wallace's erf method) and the shadow map's coarse min-depth reduction.
export const PLAN = /* wgsl */ `
struct Foot { @location(1) a: vec4f, @location(2) b: vec4f, @location(3) c: vec4f }   // centre xy, half size | cos, sin, radius, sigma | data
struct FootVary {
  @builtin(position) pos: vec4f,
  @location(0) l: vec2f,
  @location(1) @interpolate(flat) a: vec4f, @location(2) @interpolate(flat) b: vec4f, @location(3) @interpolate(flat) c: vec4f,
}

@vertex fn footVS(@builtin(vertex_index) vi: u32, i: Foot) -> FootVary {
  // 3 sigma round the footprint; a contact band (contactFS) eases out a little beyond
  let l = quadCorner(vi) * (i.a.zw + select(3.0, 3.6, i.c.w > 0.5) * i.b.w);
  let w = i.a.xy + vec2f(i.b.x * l.x - i.b.y * l.y, i.b.y * l.x + i.b.x * l.y);
  let uv = planUv(w);
  return FootVary(vec4f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, 0.0, 1.0), l, i.a, i.b, i.c);
}

fn gaussian(x: f32, sigma: f32) -> f32 { return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066283 * sigma); }
fn erf2(v: vec2f) -> vec2f {
  let s = sign(v); let a = abs(v);
  var x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
  x *= x;
  return s - s / (x * x);
}
fn boxX(x: f32, y: f32, sigma: f32, corner: f32, hs: vec2f) -> f32 {
  let delta = min(hs.y - corner - abs(y), 0.0);
  let curved = hs.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  let integral = 0.5 + 0.5 * erf2((x + vec2f(-curved, curved)) * (0.70710678 / sigma));
  return integral.y - integral.x;
}
fn roundedBoxShadow(hs: vec2f, p: vec2f, sigma: f32, corner: f32) -> f32 {
  let low = p.y - hs.y; let high = p.y + hs.y;
  let start = clamp(-3.0 * sigma, low, high); let end = clamp(3.0 * sigma, low, high);
  let stp = (end - start) / 4.0;
  var y = start + stp * 0.5; var v = 0.0;
  for (var i = 0; i < 4; i++) { v += boxX(p.x, p.y - y, sigma, corner, hs) * gaussian(y, sigma) * stp; y += stp; }
  return v;
}
fn footprint(v: FootVary, k: f32) -> f32 { return roundedBoxShadow(v.a.zw, v.l, v.b.w, min(v.b.z, min(v.a.z, v.a.w))) * k; }

// contact: r = on the floor, g = on a raised receiver whose height is in b (the channels keep their maximum).
// A raised caster leaves its own interior alone (its receiver there is hidden under it), so a tile in its tray
// shades the well floor by itself; c.w: a tile in a raised tray, whose shadow there is a band (the tray's full
// darkness out to where its footprint falls to 0.002, as it always reached), eased over about a sigma there
@fragment fn contactFS(v: FootVary) -> @location(0) vec4f {
  let s = footprint(v, v.c.x);
  let band = v.c.z < 0.5 && v.c.w > 0.5;
  if (s < select(0.002, 0.0002, band)) { discard; }
  if (v.c.z > 0.5) { return vec4f(s, 0.0, 0.0, 0.0); }
  if (sdRR(v.l, v.a.zw, min(v.b.z, min(v.a.z, v.a.w))) < -3.0 * v.b.w) { discard; }
  let g = select(s, max(s, smoothstep(0.0003, 0.008, s) * v.c.x), band);
  return vec4f(0.0, g, v.c.y, 0.0);
}

// colour bounce: the same blurred footprints, much wider, carrying the caster's colour (additive)
@fragment fn bounceFS(v: FootVary) -> @location(0) vec4f {
  let s = footprint(v, v.c.w);
  if (s < 0.002) { discard; }
  return vec4f(v.c.rgb * s, s);
}

// min-depth reduction of the shadow map (16 x 16 texels per output texel)
@vertex fn fullVS(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  return vec4f(f32(vi & 1u) * 4.0 - 1.0, f32(vi >> 1u) * 4.0 - 1.0, 0.0, 1.0);
}
@fragment fn shadowMinFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let b = vec2i(pos.xy) * 16;
  let sz = vec2i(textureDimensions(shadowT)) - 1;
  var m = 1.0;
  for (var j = 0; j < 16; j++) { for (var i = 0; i < 16; i++) { m = min(m, textureLoad(shadowT, min(b + vec2i(i, j), sz), 0)); } }
  return vec4f(m);
}
// each coarse texel's nearest occluder over its 3x3 neighbourhood: shadowVis's early-out in one load
@fragment fn shadowNearFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let ms = vec2i(textureDimensions(shadowMinT)) - 1;
  let mc = vec2i(pos.xy);
  var m = 1.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) { m = min(m, textureLoad(shadowMinT, clamp(mc + vec2i(i, j), vec2i(0), ms), 0).r); } }
  return vec4f(m);
}
`;
