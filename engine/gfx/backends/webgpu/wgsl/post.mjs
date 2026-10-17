// WGSL for the full-screen passes: bloom (13-tap downsample with an optional Karis average, 3x3 tent
// upsample; Jimenez 2014), the small dual-filter downsample used by tilt-shift and the reflection blur,
// supersample accumulation, and the composite (tonemap shoulder, bloom, vignette, grain, dither).
export const POST_WGSL = /* wgsl */ `
@group(0) @binding(0) var srcT: texture_2d<f32>;
@group(0) @binding(1) var baseT: texture_2d<f32>;
@group(0) @binding(2) var auxT: texture_2d<f32>;
@group(0) @binding(3) var aux2T: texture_2d<f32>;
@group(0) @binding(4) var linS: sampler;
struct Post { a: vec4f, b: vec4f, c: vec4f, d: vec4f }
@group(0) @binding(5) var<uniform> P: Post;

struct FsVary { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn fsVS(@builtin(vertex_index) vi: u32) -> FsVary {
  let p = vec2f(f32(vi & 1u) * 4.0 - 1.0, f32(vi >> 1u) * 4.0 - 1.0);
  return FsVary(vec4f(p, 0.0, 1.0), vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5));
}
// the glass layer, premultiplied, laid over the scene (the pipeline blends)
@fragment fn overFS(v: FsVary) -> @location(0) vec4f { return textureLoad(srcT, vec2i(v.pos.xy), 0); }
fn S(t: texture_2d<f32>, uv: vec2f) -> vec3f { return textureSampleLevel(t, linS, uv, 0.0).rgb; }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

// a.xy: half a source texel (alpha is kept: the reflection blur carries coverage in it)
fn S4(uv: vec2f) -> vec4f { return textureSampleLevel(srcT, linS, uv, 0.0); }
@fragment fn down5FS(v: FsVary) -> @location(0) vec4f {
  let h = P.a.xy;
  let c = S4(v.uv) * 4.0 + S4(v.uv + vec2f(-h.x, -h.y)) + S4(v.uv + vec2f(h.x, -h.y)) + S4(v.uv + vec2f(-h.x, h.y)) + S4(v.uv + vec2f(h.x, h.y));
  return c / 8.0;
}

// a.xy: one source texel, a.z: Karis average (1 on the first level: a lone hot pixel cannot flicker)
fn karis(c: vec3f) -> f32 { return 1.0 / (1.0 + luma(c)); }
@fragment fn down13FS(v: FsVary) -> @location(0) vec4f {
  let t = P.a.xy; let uv = v.uv;
  let a = S(srcT, uv + t * vec2f(-2.0, -2.0)); let b = S(srcT, uv + t * vec2f(0.0, -2.0)); let c = S(srcT, uv + t * vec2f(2.0, -2.0));
  let d = S(srcT, uv + t * vec2f(-2.0, 0.0));  let e = S(srcT, uv);                          let f = S(srcT, uv + t * vec2f(2.0, 0.0));
  let g = S(srcT, uv + t * vec2f(-2.0, 2.0));  let h = S(srcT, uv + t * vec2f(0.0, 2.0));  let i = S(srcT, uv + t * vec2f(2.0, 2.0));
  let j = S(srcT, uv + t * vec2f(-1.0, -1.0)); let k = S(srcT, uv + t * vec2f(1.0, -1.0));
  let l = S(srcT, uv + t * vec2f(-1.0, 1.0));  let m = S(srcT, uv + t * vec2f(1.0, 1.0));
  // five overlapping 2x2 boxes: the centre one weighs 0.5, the four corner ones 0.125 each
  let g0 = (j + k + l + m) * 0.25;
  let g1 = (a + b + d + e) * 0.25; let g2 = (b + c + e + f) * 0.25;
  let g3 = (d + e + g + h) * 0.25; let g4 = (e + f + h + i) * 0.25;
  if (P.a.z < 0.5) { return vec4f(g0 * 0.5 + (g1 + g2 + g3 + g4) * 0.125, 1.0); }
  let w0 = 0.5 * karis(g0); let w1 = 0.125 * karis(g1); let w2 = 0.125 * karis(g2); let w3 = 0.125 * karis(g3); let w4 = 0.125 * karis(g4);
  return vec4f((g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4), 1.0);
}

// a.xy: one source texel (the smaller level), a.z: how much of it to add onto base
@fragment fn upFS(v: FsVary) -> @location(0) vec4f {
  let t = P.a.xy; let uv = v.uv;
  var c = S(srcT, uv) * 4.0;
  c += (S(srcT, uv + vec2f(t.x, 0.0)) + S(srcT, uv - vec2f(t.x, 0.0)) + S(srcT, uv + vec2f(0.0, t.y)) + S(srcT, uv - vec2f(0.0, t.y))) * 2.0;
  c += S(srcT, uv + t) + S(srcT, uv - t) + S(srcT, uv + vec2f(t.x, -t.y)) + S(srcT, uv + vec2f(-t.x, t.y));
  return vec4f(S(baseT, uv) + c / 16.0 * P.a.z, 1.0);
}

// supersampling: src = the running mean, base = this sample, a.x = its share of the total weight
@fragment fn accumFS(v: FsVary) -> @location(0) vec4f {
  let p = vec2i(v.pos.xy);
  return mix(textureLoad(srcT, p, 0), textureLoad(baseT, p, 0), P.a.x);
}

// temporal anti-aliasing for live frames (each drawn at the next Halton offset): src = this frame, base = the
// history, aux = screen motion (uv per frame). a.x > 0: nothing changed since the last frame, so this is one more
// supersample, mixed in at that share exactly as accumFS does (a paused frame converges to the captured still);
// a.x = 0: reproject the history along the motion (Catmull-Rom), clip it to this frame's 3x3 neighbourhood
// (variance box in YCoCg) so nothing ghosts, and mix in a.y of the new frame (more as things move faster, up to 0.8
// where the look changed: a recoloured or relabelled tile, a pulse along a groove, a particle; and all of it where
// the history moved at another speed than this pixel: something just uncovered it). The history keeps each pixel's
// speed (px per frame) in alpha for that test.
// a.z: 0 = no history (first frame, resized): this frame alone
fn tmap(c: vec3f) -> vec3f { return c / (1.0 + luma(c)); }          // blend in a compressed range: no fireflies
fn untmap(c: vec3f) -> vec3f { return c / max(1.0 - luma(c), 1e-4); }
fn ycocg(c: vec3f) -> vec3f { return vec3f(dot(c, vec3f(0.25, 0.5, 0.25)), dot(c, vec3f(0.5, 0.0, -0.5)), dot(c, vec3f(-0.25, 0.5, -0.25))); }
fn rgbOf(c: vec3f) -> vec3f { return vec3f(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
fn H(uv: vec2f) -> vec4f { return textureSampleLevel(baseT, linS, uv, 0.0); }
fn historyAt(uv: vec2f) -> vec4f {
  let size = vec2f(textureDimensions(baseT));
  let sp = uv * size; let tp = floor(sp - 0.5) + 0.5; let f = sp - tp;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f)); let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f)); let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let t0 = (tp - 1.0) / size; let t3 = (tp + 2.0) / size; let t12 = (tp + w2 / w12) / size;
  let c = H(vec2f(t12.x, t0.y)) * (w12.x * w0.y) + H(vec2f(t0.x, t12.y)) * (w0.x * w12.y)
        + H(t12) * (w12.x * w12.y) + H(vec2f(t3.x, t12.y)) * (w3.x * w12.y) + H(vec2f(t12.x, t3.y)) * (w12.x * w3.y);
  let w = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(c / w, vec4f(0.0));
}
const DIAG = array<vec2i, 5>(vec2i(0, 0), vec2i(-1, -1), vec2i(1, -1), vec2i(-1, 1), vec2i(1, 1));
@fragment fn taaFS(v: FsVary) -> @location(0) vec4f {
  let p = vec2i(v.pos.xy);
  let cur = textureLoad(srcT, p, 0);
  if (P.a.x > 0.0) { return vec4f(mix(textureLoad(baseT, p, 0).rgb, cur.rgb, P.a.x), 0.0); }
  let res = vec2f(textureDimensions(srcT));
  if (P.a.z < 0.5) { return vec4f(cur.rgb, length(textureLoad(auxT, p, 0).xy * res)); }
  let hi = vec2i(res) - 1;
  // this frame's 3x3 neighbourhood
  let c0 = ycocg(tmap(cur.rgb));
  var m1 = c0; var m2 = c0 * c0;
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) { continue; }
      let c = ycocg(tmap(textureLoad(srcT, clamp(p + vec2i(i, j), vec2i(0), hi), 0).rgb));
      m1 += c; m2 += c * c;
    }
  }
  // the fastest motion round the pixel (centre and diagonals): a moving thing's edge carries its own motion
  var mv = vec2f(0.0); var ml = 0.0; var re = 0.0;
  for (var i = 0; i < 5; i++) {
    let w = textureLoad(auxT, clamp(p + DIAG[i], vec2i(0), hi), 0); let l = dot(w.xy, w.xy);
    if (l > ml) { ml = l; mv = w.xy; }
    re = max(re, w.z);
  }
  let px = length(mv * res);
  let uvp = v.uv - mv;
  if (uvp.x < 0.0 || uvp.y < 0.0 || uvp.x > 1.0 || uvp.y > 1.0) { return vec4f(cur.rgb, px); }
  m1 /= 9.0;
  re = clamp(re, 0.0, 1.0);
  let sd = sqrt(max(m2 / 9.0 - m1 * m1, vec3f(0.0))) * (1.1 - 0.5 * re);
  // the history where this pixel was (still: the very texel, no resampling), clipped toward the neighbourhood mean
  // until it lies inside the box
  var hs: vec4f;
  if (px < 0.01) { hs = textureLoad(baseT, p, 0); } else { hs = historyAt(uvp); }
  var h = ycocg(tmap(hs.rgb));
  let d = h - m1;
  let k = abs(d) / max(sd, vec3f(1e-5));
  let far = max(k.x, max(k.y, k.z));
  if (far > 1.0) { h = m1 + d / far; }
  let uncovered = smoothstep(0.5, 2.0, abs(hs.a - px));
  let a = max(max(clamp(P.a.y + px * 0.03, P.a.y, 0.35), 0.8 * re), uncovered);
  return vec4f(untmap(rgbOf(mix(h, c0, a))), px);
}

// a: focus band y0, y1 (uv, y up), ramp, enabled; b: far, near blur (device px), quarter texel px, theme;
// c: bloom strength, vignette, grain, exposure; d: knee, frame, bloom normalisation
fn shoulder(x: vec3f, k: f32) -> vec3f {
  let over = max(x - k, vec3f(0.0));
  return min(x, vec3f(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
// identity below the knee (albedo-range colours land exactly on their tokens); above it, compress the
// brightest channel and keep the hue, with a little per-channel roll-off so very hot cores whiten slightly
fn tonemap(c: vec3f, k: f32) -> vec3f {
  let m = max(c.r, max(c.g, c.b));
  if (m <= k) { return c; }
  let mm = shoulder(vec3f(m), k).r;
  return mix(c * (mm / m), shoulder(c, k), 0.22);
}
fn hash(q: vec3f) -> f32 { var p = fract(q * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
fn toSrgb(x: vec3f) -> vec3f { let c = max(x, vec3f(0.0)); return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c < vec3f(0.0031308)); }

@fragment fn compositeFS(v: FsVary) -> @location(0) vec4f {
  let uv = v.uv; let yUp = 1.0 - uv.y;
  var c = S(srcT, uv);
  // tilt-shift: crisp inside the focus band, far rows (top) and near rows (bottom) soften beyond it
  if (P.a.w > 0.5) {
    let far = smoothstep(0.0, P.a.z, yUp - P.a.y); let near = smoothstep(0.0, P.a.z, P.a.x - yUp);
    let px = far * far * P.b.x + near * near * P.b.y;
    if (px > 0.05) {
      let k = clamp(px / P.b.z, 0.0, 1.25);
      let hb = S(auxT, uv);
      let qt = 1.0 / vec2f(textureDimensions(aux2T));
      let rr = max(k - 0.5, 0.0) * 1.4;
      var qb = S(aux2T, uv) * 0.4;
      qb += (S(aux2T, uv + vec2f(rr, 0.0) * qt) + S(aux2T, uv - vec2f(rr, 0.0) * qt) + S(aux2T, uv + vec2f(0.0, rr) * qt) + S(aux2T, uv - vec2f(0.0, rr) * qt)) * 0.15;
      c = select(mix(hb, qb, clamp((k - 0.5) * 2.0, 0.0, 1.0)), mix(c, hb, k * 2.0), k < 0.5);
    }
  }
  c *= P.c.w;
  let b = S(baseT, uv) * P.d.z * P.c.x;
  if (P.b.w < 0.5) { c += b; }
  else {
    // a coloured halo on paper: multiply the paper toward the light's own hue, never toward grey
    let a = 1.0 - exp(-luma(b) * 6.0);
    c *= mix(vec3f(1.0), b / max(max(b.r, b.g), max(b.b, 1e-4)), a * 0.72);
  }
  c = tonemap(c, P.d.x);
  let res = vec2f(textureDimensions(srcT));
  let q = (vec2f(uv.x, yUp) - 0.5) * vec2f(res.x / res.y, 1.0);
  let vr = length(q) / length(vec2f(res.x / res.y, 1.0) * 0.5);
  c *= 1.0 - P.c.y * smoothstep(0.62, 1.12, vr);
  var s = toSrgb(c);
  let L = luma(s);
  let fc = vec2f(v.pos.x, res.y - v.pos.y);
  let g = hash(vec3f(fc, P.d.y)) + hash(vec3f(fc.yx + 17.0, P.d.y + 3.0)) - 1.0;
  s += g * P.c.z * (0.25 + 0.75 * smoothstep(0.0, 0.45, L) * (1.0 - smoothstep(0.7, 1.0, L))) * 0.6;
  s += (hash(vec3f(fc, P.d.y + 7.0)) - 0.5) / 255.0;
  return vec4f(s, 1.0);
}
`;
