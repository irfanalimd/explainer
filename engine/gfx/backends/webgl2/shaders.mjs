// GLSL ES 3.00 sources for every pass. Shared chunks are composed into programs by the renderer.
// Instance data for slabs lives in a float texture (26 texels per slab), see pack.mjs for the layout.
import { STUDIO } from "../../look.mjs";
import { MATERIAL } from "../../../tokens.mjs";

const EDGE = ["matte", "ceramic", "glass", "metal"].map((k) => (MATERIAL[k].edge ?? 0).toFixed(3)).join(", ");

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = (a) => `vec3(${a.map(f).join(", ")})`;
const { KEY, KEY_X, KEY_Y, STRIP, STRIP_Y, SIDE, SIDE_X, SIDE_Y, BACK } = STUDIO;

export const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DShadow;
`;

export const INST = `
uniform highp sampler2D uInst;
vec4 inst(int id, int k) { return texelFetch(uInst, ivec2((id & 63) * 26 + k, id >> 6), 0); }
mat3 slabRot(vec3 ypr) {
  float cy = cos(ypr.x), sy = sin(ypr.x), cp = cos(ypr.y), sp = sin(ypr.y), cr = cos(ypr.z), sr = sin(ypr.z);
  mat3 Rz = mat3(cy, sy, 0.0, -sy, cy, 0.0, 0.0, 0.0, 1.0);
  mat3 Rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  mat3 Ry = mat3(cr, 0.0, -sr, 0.0, 1.0, 0.0, sr, 0.0, cr);
  return Rz * Rx * Ry;
}
`;

export const SDF = `
float sdRR(vec2 p, vec2 hs, float r) {
  vec2 q = abs(p) - hs + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
vec3 toLin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

// --- slab vertex placement --------------------------------------------------------------------------
export const SLAB_VERTEX = `
layout(location = 0) in vec3 aPlan;
layout(location = 1) in vec2 aProf;
uniform int uBase;
vec2 rr(vec2 hs, float r, vec2 s, float th, float off, out vec2 n) {
  n = vec2(s.x * cos(th), s.y * sin(th));
  return s * max(hs - r, 0.0) + n * max(r + off, 0.0);
}
void slabVertex(int id, out vec3 world, out vec3 normal, out vec3 local, out vec3 localN) {
  vec4 t0 = inst(id, 0), t1 = inst(id, 1), t2 = inst(id, 2), t6 = inst(id, 6), t7 = inst(id, 7);
  vec2 hs = t1.xy * 0.5; float h = t1.z, r = t1.w, bev = t2.x;
  vec2 hc = t6.xy, hh = t6.zw; float hr = t7.x, dep = t7.y, lip = t7.z;
  vec2 s = aPlan.xy; float th = aPlan.z; int kind = int(aProf.x + 0.5); float phi = aProf.y;
  vec2 pn = vec2(0.0); vec3 p, n;
  if (kind == 0) { p = vec3(0.0); n = vec3(0.0, 0.0, -1.0); }
  else if (kind == 1) { p = vec3(rr(hs, r, s, th, 0.0, pn), 0.0); n = vec3(0.0, 0.0, -1.0); }
  else if (kind == 2) { p = vec3(rr(hs, r, s, th, 0.0, pn), 0.0); n = vec3(pn, 0.0); }
  else if (kind == 3) { p = vec3(rr(hs, r, s, th, -bev * (1.0 - cos(phi)), pn), h - bev + bev * sin(phi)); n = vec3(pn * cos(phi), sin(phi)); }
  else if (kind == 4) { p = vec3(hc + rr(hh, hr, s, th, lip * (1.0 - sin(phi)), pn), h - lip * (1.0 - cos(phi))); n = vec3(-pn * sin(phi), cos(phi)); }
  else if (kind == 5) { p = vec3(hc + rr(hh, hr, s, th, 0.0, pn), h - dep); n = vec3(-pn, 0.0); }
  else if (kind == 6) { p = vec3(hc + rr(hh, hr, s, th, 0.0, pn), h - dep); n = vec3(0.0, 0.0, 1.0); }
  else { p = vec3(hc, h - dep); n = vec3(0.0, 0.0, 1.0); }
  float sc = t0.w;
  mat3 R = slabRot(t2.yzw);
  vec3 piv = vec3(0.0, 0.0, 0.5 * h * sc);
  world = t0.xyz + piv + R * (p * sc - piv);
  normal = R * n; local = p; localN = n;
}
`;

export const slabVS = HEAD + INST + SLAB_VERTEX + `
uniform mat4 uViewProj;
out vec3 vWorld; out vec3 vNormal; out vec3 vLocal; out vec3 vLocalN; flat out int vId;
void main() {
  int id = uBase + gl_InstanceID;
  vec3 w, n, l, ln;
  slabVertex(id, w, n, l, ln);
  vWorld = w; vNormal = n; vLocal = l; vLocalN = ln; vId = id;
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;

export const shadowVS = HEAD + INST + SLAB_VERTEX + `
uniform mat4 uLightVP;
void main() {
  int id = uBase + gl_InstanceID;
  if ((int(inst(id, 5).w) & 1) == 1) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 w, n, l, ln;
  slabVertex(id, w, n, l, ln);
  gl_Position = uLightVP * vec4(w, 1.0);
}
`;
export const shadowFS = HEAD + `out vec4 o; void main() { o = vec4(1.0); }`;

export const pickVS = HEAD + INST + SLAB_VERTEX + `
uniform mat4 uViewProj;
flat out int vId;
void main() {
  int id = uBase + gl_InstanceID;
  vec3 w, n, l, ln;
  slabVertex(id, w, n, l, ln);
  vId = int(inst(id, 8).w);
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;
export const pickFS = HEAD + `
flat in int vId; out vec4 o;
void main() { int v = vId + 1; o = vec4(float(v & 255), float((v >> 8) & 255), float((v >> 16) & 255), 255.0) / 255.0; }
`;

// --- lighting shared by floor and slabs ------------------------------------------------------------------
export const LIGHTING = `
uniform vec3 uEye;
uniform vec3 uKeyDir; uniform vec3 uFillDir;
uniform float uKey, uFill, uAmb, uGround, uNorm;
uniform int uTheme;                       // 0 dark, 1 light
uniform int uNumLights;
uniform vec4 uLP[16];                     // xyz, radius
uniform vec4 uLC[16];                     // linear rgb * intensity
uniform highp sampler2DShadow uShadowCmp;
uniform highp sampler2D uShadowRaw;
uniform mat4 uLightVP;
uniform vec4 uShadowP;                    // 1/size, extent u, depth range u, enabled
uniform float uLightSize;
uniform highp sampler2D uShadowMin;       // min depth per 16x16 texels: a cheap "anything nearby?" test
uniform sampler2D uContact;
uniform vec4 uContactRect;                // x0, y0, 1/w, 1/h
uniform vec3 uEnvGain;                    // ambient env, strip, key box
 uniform vec3 uEnvTint;
uniform float uBackGain;                  // the satin panel behind the set
uniform vec4 uScene;                      // centre xy, half extents xy (plus margin) of the scene on the floor
uniform float uSolidPool;                 // how much brighter solids are at the centre of the key pool
uniform vec3 uShadowMix;                  // per-channel share of a shadow's darkening: < 1 on blue = cool shadows
uniform sampler2D uBounce;                // colour bounce from data (plan space, same rect as the contact map)
uniform vec2 uBounceK;                    // dark additive gain, light multiply gain

// a shadow factor (1 lit .. 0 black) as a tinted multiplier: shadows lean toward PALETTE.*.shadow
vec3 tintShade(float L) { return vec3(1.0) - (1.0 - clamp(L, 0.0, 1.0)) * uShadowMix; }
vec4 bounceAt(vec2 p) {
  vec2 uv = (p - uContactRect.xy) * uContactRect.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec4(0.0);
  return texture(uBounce, uv);
}
// colour bounce onto a surface: light added in dark, the paper multiplied toward the data's hue in light
vec3 applyBounce(vec3 col, vec2 p, float k) {
  vec4 b = bounceAt(p);
  if (b.a < 1e-3) return col;
  if (uTheme == 0) return col + b.rgb * uBounceK.x * k;
  vec3 hue = b.rgb / max(max(b.r, b.g), max(b.b, 1e-4));
  float a = (1.0 - exp(-b.a * 1.3)) * uBounceK.y * k;
  return col * mix(vec3(1.0), hue, a);
}

// the key light is a large soft area light centred over the scene: a broad pool, 1 at the centre, 0 outside
float keyPool(vec2 p) {
  float rr = length((p - uScene.xy) / max(uScene.zw, vec2(1.0)));
  float k = 1.0 - smoothstep(0.0, 1.12, rr);
  return k * k * (3.0 - 2.0 * k);
}

const vec2 PD[16] = vec2[](
  vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.094184101, -0.92938870), vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
  vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));

float shadowVis(vec3 wp, vec3 n, float ndl) {
  if (uShadowP.w < 0.5) return 1.0;
  float texU = uShadowP.y * uShadowP.x;
  vec3 off = n * texU * (0.9 + 2.2 * (1.0 - clamp(ndl, 0.0, 1.0)));
  vec4 c = uLightVP * vec4(wp + off, 1.0);
  vec3 s = c.xyz * 0.5 + 0.5;
  if (s.x <= 0.0 || s.y <= 0.0 || s.x >= 1.0 || s.y >= 1.0 || s.z >= 1.0) return 1.0;
  float zr = s.z - 0.6 / uShadowP.z;
  // early out: no occluder anywhere within the search radius (3x3 coarse texels >= 11 u around)
  ivec2 ms = textureSize(uShadowMin, 0);
  ivec2 mc = ivec2(s.xy * vec2(ms));
  float mn = 1.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) mn = min(mn, texelFetch(uShadowMin, clamp(mc + ivec2(i, j), ivec2(0), ms - 1), 0).r);
  if (mn >= zr) return 1.0;
  float ang = ign(gl_FragCoord.xy) * 6.2831853;
  float ca = cos(ang), sa = sin(ang);
  mat2 rot = mat2(ca, sa, -sa, ca);
  float search = 7.0 / uShadowP.y;
  float sum = 0.0, cnt = 0.0;
  // a draft (uShadowP.w 2: a frame the next one replaces) takes every third search tap and every fourth filter tap
  int stride = uShadowP.w > 1.5 ? 3 : 1;
  for (int i = 0; i < 12; i += stride) {
    float d = textureLod(uShadowRaw, s.xy + rot * PD[i] * search, 0.0).r;
    if (d < zr) { sum += d; cnt += 1.0; }
  }
  if (cnt < 0.5) return 1.0;
  float gap = (zr - sum / cnt) * uShadowP.z;
  float pen = clamp(0.35 + gap * uLightSize, 0.45, 9.0) / uShadowP.y;
  pen = max(pen, 1.2 * uShadowP.x);
  float v = 0.0;
  stride = uShadowP.w > 1.5 ? 4 : 1;
  for (int i = 0; i < 16; i += stride) v += texture(uShadowCmp, vec3(s.xy + rot * PD[i] * pen, zr));
  return v / (16.0 / float(stride));
}

vec3 contactAt(vec2 p) {
  vec2 uv = (p - uContactRect.xy) * uContactRect.zw;
  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return vec3(0.0);
  return texture(uContact, uv).rgb;
}

float atten(float d, float R) {
  float x = d / R;
  float w = clamp(1.0 - x * x * x * x, 0.0, 1.0);
  return w * w / (1.0 + 14.0 * x * x);
}

vec3 pointLights(vec3 P, vec3 N, float wrap) {
  vec3 s = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (i >= uNumLights) break;
    vec3 d = uLP[i].xyz - P;
    float dist = length(d);
    if (dist >= uLP[i].w) continue;
    float nl = clamp((dot(N, d / max(dist, 1e-4)) + wrap) / (1.0 + wrap), 0.0, 1.0);
    s += uLC[i].rgb * atten(dist, uLP[i].w) * nl;
  }
  return s;
}

float softbox(vec3 r, vec3 c, vec3 ax, vec3 ay, vec2 hs, float blur) {
  float k = dot(r, c);
  if (k <= 0.05) return 0.0;
  vec2 q = vec2(dot(r, ax), dot(r, ay)) / k;
  vec2 d = abs(q) - hs;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-blur, blur, sd);
}

// a procedural photo studio: dim surround, a long strip box behind the camera (the catch-light on
// front bevels), a smaller box at the key light, a faint overhead panel
vec3 studioEnv(vec3 r, float rough) {
  float blur = 0.02 + rough * rough * 0.2;
  float sky = smoothstep(-0.25, 0.35, r.z);
  vec3 e = uEnvTint * uEnvGain.x * mix(uGround * 0.6, 1.0, sky);
  e += uEnvGain.y * softbox(r, ${v3(STRIP)}, vec3(1.0, 0.0, 0.0), ${v3(STRIP_Y)}, vec2(2.4, 0.2), blur);
  e += uEnvGain.y * 0.55 * softbox(r, ${v3(SIDE)}, ${v3(SIDE_X)}, ${v3(SIDE_Y)}, vec2(0.16, 0.42), blur);
  e += uEnvGain.z * softbox(r, ${v3(KEY)}, ${v3(KEY_X)}, ${v3(KEY_Y)}, vec2(0.30, 0.18), blur);
  e += uEnvGain.x * 0.8 * softbox(r, vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec2(0.55, 0.4), blur * 2.0);
  // very soft-edged, so a flat top sees a gradient (brighter toward the back) rather than a shape
  float back = smoothstep(-0.9, 0.95, dot(r, ${v3(BACK)})) * smoothstep(-0.1, 0.5, r.z);
  e += uEnvTint * uBackGain * back * back;
  return e;
}
`;

// --- slab surface ----------------------------------------------------------------------------------------
export const slabFS = HEAD + INST + SDF + LIGHTING + `
const float EDGE[4] = float[4](${EDGE});
in vec3 vWorld; in vec3 vNormal; in vec3 vLocal; in vec3 vLocalN; flat in int vId;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oEmis;
uniform sampler2D uAtlas;
uniform float uAtlasSize, uSpreadPx;
uniform vec3 uLit;                       // attention colour (linear): warm white in dark, ink in light
uniform vec4 uMat[4];                    // per material: rough, spec, rim, metal
uniform float uPoolGain;
uniform float uTime;
uniform vec3 uAccent;                    // accent emissive gain, halo, (unused)
uniform vec2 uSatin;                     // keyed tile satin gradient, self-luminance

void main() {
  int id = vId;
  vec4 t1 = inst(id, 1), t2 = inst(id, 2), t3 = inst(id, 3), t4 = inst(id, 4), t5 = inst(id, 5);
  vec4 t6 = inst(id, 6), t7 = inst(id, 7), t8 = inst(id, 8), t10 = inst(id, 10), t11 = inst(id, 11);
  vec2 hs = t1.xy * 0.5; float h = t1.z, r = t1.w, bev = t2.x;
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uEye - vWorld);
  vec2 lp = vLocal.xy;
  float uPerPx = length(fwidth(vLocal)) * 0.7071 + 1e-5;
  mat3 R = slabRot(t2.yzw);
  vec3 Ll = transpose(R) * uKeyDir;
  int matId = int(t3.w + 0.5);
  vec4 M = uMat[matId];
  int flags = int(t5.w + 0.5);

  vec3 alb = t3.rgb;
  vec3 emis = vec3(0.0);
  float inkA = 0.0;                      // printed ink covers the glowing body
  float inkZone = 0.0;                   // inside a dark label's box: the body there sends no bloom over it
  float wellShadow = 1.0, ao = 1.0;
  bool hasWell = t6.z > 0.001;
  vec2 hc = t6.xy, hh = t6.zw; float hr = t7.x, dep = t7.y, lip = t7.z;
  float dHole = hasWell ? sdRR(lp - hc, hh, hr) : 1e3;
  bool topFace = vLocalN.z > 0.999 && vLocal.z > h - 0.02;
  bool interior = hasWell && vLocal.z < h - 0.002 && dHole < lip + 0.02;

  // a through-hole (selection rings): no floor inside
  if ((flags & 4) == 4 && interior && vLocal.z < 0.01) discard;
  if (interior) {
    float below = h - vLocal.z;
    bool floorS = vLocalN.z > 0.999 && vLocal.z < h - dep + 0.01;
    if (floorS) alb = t8.rgb;
    // the walls shade the tray: a ray toward the key light leaves the well through a wall?
    vec2 q = lp + Ll.xy / max(Ll.z, 0.25) * below;
    float dq = sdRR(q - hc, hh, hr);
    float soft = 0.18 + 0.22 * below;
    wellShadow = 1.0 - smoothstep(-soft, soft, dq);
    if (floorS) ao = mix(0.5, 1.0, smoothstep(0.0, 3.2, -dHole));
    else ao = mix(0.62, 1.0, clamp((vLocal.z - (h - dep)) / max(dep, 0.01), 0.0, 1.0));
  }

  if (topFace && !interior) {
    // meter inlay
    if ((flags & 2) == 2) {
      vec4 m = inst(id, 9);
      float dm = sdRR(lp - m.xy, m.zw, min(m.z, m.w));
      float inside = 1.0 - smoothstep(-uPerPx, uPerPx, dm);
      float edge = m.x - m.z + 2.0 * m.z * clamp(t7.w, 0.0, 1.0);
      float fill = (1.0 - smoothstep(-uPerPx, uPerPx, sdRR(lp - m.xy, m.zw - 0.55, max(min(m.z, m.w) - 0.55, 0.0))))
                 * (1.0 - smoothstep(edge - uPerPx, edge + uPerPx, lp.x));
      float lipShade = smoothstep(-1.2, 0.0, dm) * step(lp.y, m.y);   // inner shadow on the far edge
      alb = mix(alb, t8.rgb * (1.0 - 0.35 * lipShade), inside);
      alb = mix(alb, t10.rgb, fill);
      emis += t10.rgb * fill * t11.y;
    }
    // labels: SDF text printed or engraved on the top face
    int nl = int(t10.w + 0.5);
    inkA = 0.0;
    float faceD = sdRR(lp, hs - bev, max(r - bev, 0.0));
    float faceMask = 1.0 - smoothstep(-0.5, 0.0, faceD);
    vec2 lpl = normalize(Ll.xy + 1e-5);
    for (int k = 0; k < 3; k++) {
      if (k >= nl) break;
      vec4 qd = inst(id, 12 + 4 * k);
      vec2 rel = (lp - (qd.xy - qd.zw)) / (2.0 * qd.zw);
      if (rel.x < 0.0 || rel.y < 0.0 || rel.x > 1.0 || rel.y > 1.0) continue;
      vec4 uvr = inst(id, 13 + 4 * k), col = inst(id, 14 + 4 * k), ex = inst(id, 15 + 4 * k);
      vec2 uv = mix(uvr.xy, uvr.zw, rel);
      vec2 uvPerU = (uvr.zw - uvr.xy) / (2.0 * qd.zw);
      float texPerU = uvPerU.x * uAtlasSize;
      float sdPx = texPerU * uPerPx / (2.0 * uSpreadPx);        // SDF units per screen pixel
      float aa = clamp(sdPx * 0.85, 0.003, 0.2);
      float sd = textureLod(uAtlas, uv, 0.0).r;
      // dark ink on a bright body: linear-light coverage thins dark strokes to a grey hairline, so small
      // dark text is dilated (stem darkening, up to ~0.4 px) and blended in sRGB below
      float darkInk = ex.x > 0.5 ? 0.0 : smoothstep(0.03, 0.2, luma(alb) - luma(col.rgb));
      inkZone = max(inkZone, darkInk * col.a);
      float smallTxt = 1.0 - smoothstep(18.0, 54.0, 2.0 * qd.w / uPerPx);
      float grow = darkInk * min(sdPx * (0.05 + 0.15 * smallTxt), 0.07);
      float a = smoothstep(0.5 - grow - aa, 0.5 - grow + aa, sd) * col.a * faceMask;
      // clip box for rolling values (y window in face coords)
      a *= (1.0 - smoothstep(ex.z - uPerPx, ex.z, abs(lp.y - ex.w)));
      if (ex.x > 0.5) {
        // the cut's walls only read when the letters are big; small engraving lifts its fill to stay legible
        float hpx = 2.0 * qd.w / uPerPx;
        float big = smoothstep(26.0, 60.0, hpx);
        float o = ex.y;
        float sdT = textureLod(uAtlas, uv + lpl * o * uvPerU, 0.0).r;
        float sdA = textureLod(uAtlas, uv - lpl * o * uvPerU, 0.0).r;
        float shade = smoothstep(0.5 + aa, 0.5 - aa, sdT) * big;   // the wall toward the light shades the cut
        float catchL = smoothstep(0.5 + aa, 0.5 - aa, sdA) * big;  // the far wall faces the light
        vec3 fillC = uTheme == 0 ? col.rgb * mix(1.55, 1.15, big) : col.rgb * mix(0.8, 1.0, big);
        vec3 c = fillC * (1.0 - 0.36 * shade) + fillC * 0.3 * catchL * (1.0 - shade);
        alb = mix(alb, c, a);
      } else {
        // light ink keeps linear coverage (it already reads bold); dark ink mixes in sRGB, as a print would
        alb = toLin(mix(toSrgb(alb), toSrgb(col.rgb), a));   // ink mixes in sRGB, as a print would
      }
      inkA = max(inkA, a);
    }
  }

  // status accent: a luminous strip under the header (or a ring round a round well)
  vec4 t24 = inst(id, 24), t25 = inst(id, 25);
  float acL = t24.w, acCore = 0.0, acHalo = 0.0;
  if (acL > 0.0 && topFace && !interior) {
    float dA, ends = 1.0;
    if (t25.z < 0.0) dA = abs(dHole - t25.y) - t25.w;
    else {
      vec2 rel = lp - t25.xy;
      dA = sdRR(rel, vec2(t25.z, t25.w), t25.w);
      ends = 1.0 - 0.65 * smoothstep(0.5, 1.0, abs(rel.x) / t25.z);   // a light tube: brightest at its middle
    }
    acCore = clamp(0.5 - dA / max(uPerPx, 1e-4), 0.0, 1.0) * ends * (1.0 - inkA);
    acHalo = exp(-max(dA, 0.0) / 2.6) * (1.0 - smoothstep(-0.2, 0.6, -dA)) * ends;
  }

  // desaturate (dead or disabled), darken (crashed)
  float des = t5.z;
  alb = mix(alb, vec3(luma(alb)) * 0.8, des);
  alb *= 1.0 - t11.w;

  float NdK = dot(N, uKeyDir);
  float vis = NdK > 0.0 ? shadowVis(vWorld, N, NdK) : 0.0;
  vis = min(vis, wellShadow);
  float hemi = mix(uGround, 1.0, N.z * 0.5 + 0.5);
  float diffFull = (uAmb * hemi + uKey * max(NdK, 0.0) + uFill * max(dot(N, uFillDir), 0.0)) * uNorm;
  float diff = (uAmb * hemi + uKey * max(NdK, 0.0) * vis + uFill * max(dot(N, uFillDir), 0.0)) * uNorm;
  float pool = mix(1.0, uSolidPool, keyPool(vWorld.xy));

  // contact shadows from elevated casters (tiles in trays, LEDs on housings)
  if (N.z > 0.5) {
    vec3 cs = contactAt(vWorld.xy);
    if (cs.g > 0.0 && abs(vWorld.z - cs.b) < 0.7) ao *= 1.0 - cs.g * 0.7;
  }
  // a soft darkening where the sides meet whatever they stand on
  if (abs(vLocalN.z) < 0.5) ao *= mix(0.62, 1.0, mix(1.0, smoothstep(0.0, min(h, 5.0) + 1.5, vLocal.z), t11.x));

  // cast shadows and occlusion are tinted (cool), never neutral grey
  vec3 col = alb * diffFull * pool * tintShade(diff / max(diffFull, 1e-4) * ao);
  // colour bounce from data onto neutral surfaces facing up (wells, housing tops, plates)
  if (N.z > 0.5) {
    float chroma = max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b));
    col = applyBounce(col, vWorld.xy, (1.0 - smoothstep(0.08, 0.3, chroma)) * N.z);
  }
  // keyed ceramic tiles: a satin top gradient (inner luminance), brighter toward the back
  if (matId == 1 && topFace && !interior) {
    float mx = max(alb.r, max(alb.g, alb.b));
    float sat = (mx - min(alb.r, min(alb.g, alb.b))) / max(mx, 1e-4);
    float g = smoothstep(hs.y, -hs.y, lp.y);
    float inner = 1.0 - smoothstep(0.2, 1.0, length(lp / max(hs, vec2(1.0))));
    col *= 1.0 + uSatin.x * sat * (0.85 * g - 0.3 + 0.45 * inner) * (1.0 - 0.8 * inkA);
    col += alb * sat * uSatin.y * (1.0 - inkA);
    emis += alb * sat * uSatin.y * 0.6 * (1.0 - inkA);
  }

  // point lights
  vec3 pl = pointLights(vWorld, N, 0.15);
  // nearby lights tint solids (the floor pool stays the main cue): soft-saturated so a packet brushing
  // past a dark body colours it, never washes it out
  if (uTheme == 0) col += pl / (1.0 + luma(pl) * 1.6) * (alb * 0.9 + 0.01) * uPoolGain * ao;
  else {
    float a = 1.0 - exp(-luma(pl) * 1.4);
    vec3 hue = pl / max(max(pl.r, pl.g), max(pl.b, 1e-4));
    col = mix(col, col * mix(vec3(1.0), hue, 0.85), a * 0.55);
  }

  // specular: studio softbox reflections (the bevel catch-light) and the key highlight
  float NdV = max(dot(N, V), 1e-3);
  vec3 Rv = reflect(-V, N);
  float F0 = 0.02 + 0.4 * M.y * M.y;                  // reflectance: satin anodised matte ~0.02, ceramic glaze ~0.07
  float F = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
  vec3 specTint = mix(vec3(1.0), alb / max(max(alb.r, max(alb.g, alb.b)), 1e-3), M.w);
  float specOcc = mix(0.35, 1.0, vis) * ao;
  vec3 env = studioEnv(Rv, M.x);
  // flat tops keep their token colour legible: a satin sheen there, the crisp catch-lights live on bevels
  // printed ink is matte: the glaze's sheen over a label would lift dark ink toward grey
  float topK = vLocalN.z > 0.999 ? 0.35 * (1.0 - 0.85 * inkA) : 1.0;
  col += env * mix(F, 0.55 + 0.45 * F, M.w) * specTint * specOcc * topK;
  vec3 Hk = normalize(uKeyDir + V);
  float a2 = max(M.x * M.x, 0.02); a2 *= a2;
  float nh = max(dot(N, Hk), 0.0);
  float D = a2 / (3.14159 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  col += uKey * uNorm * vis * max(NdK, 0.0) * D * F * M.y * 0.25 * specTint * (1.0 - 0.85 * inkA);
  // material rim: a fresnel lift on silhouettes (environment)
  col += uEnvTint * uEnvGain.x * pow(1.0 - NdV, 4.0) * M.z * 0.5 * ao;
  // the machined chamfer: a fine catch-light along the top bevel (dark studio only)
  float chamfer = smoothstep(0.3, 0.7, vLocalN.z) * (1.0 - smoothstep(0.86, 0.985, vLocalN.z)) * step(h - bev - 0.02, vLocal.z);
  if (uTheme == 0) col += uEnvTint * chamfer * EDGE[min(matId, 3)] * (0.55 + 0.45 * vis) * ao;

  // attention rim on the bevel and silhouette
  float rim = t5.x;
  if (rim > 0.0) {
    float bevelMask = (vLocalN.z > 0.04 && vLocalN.z < 0.995 && vLocal.z > h - bev - 0.02) ? 1.0 : 0.0;
    float sil = pow(1.0 - NdV, 3.0) * step(abs(vLocalN.z), 0.7);
    float m = clamp(bevelMask * 0.9 + sil * 0.8, 0.0, 1.0) * rim;
    if (uTheme == 0) { col += uLit * m * 0.85; emis += uLit * m * 0.42; }
    else col = mix(col, uLit, clamp(m * 1.25, 0.0, 0.95));
  }

  // status accent: strip, its light on the top, and a faint matching rim on the bevel
  if (acL > 0.0) {
    vec3 ac = t24.rgb;
    float bevelA = (vLocalN.z > 0.04 && vLocalN.z < 0.995 && vLocal.z > h - bev - 0.02) ? 1.0 : 0.0;
    float silA = pow(1.0 - NdV, 3.0) * step(abs(vLocalN.z), 0.7);
    float rimA = clamp(bevelA * 0.9 + silA * 0.25, 0.0, 1.0) * t11.z;
    if (uTheme == 0) {
      col += ac * acL * (acCore * uAccent.x + acHalo * uAccent.y * 0.22);
      emis += ac * acL * (acCore * uAccent.x * 0.85 + acHalo * uAccent.y * 0.05);
      col += ac * rimA * 0.7; emis += ac * rimA * 0.3;
    } else {
      vec3 hue = ac / max(max(ac.r, max(ac.g, ac.b)), 1e-4);
      col *= mix(vec3(1.0), hue, clamp(acHalo * uAccent.y * acL * 0.55, 0.0, 0.6));
      col = mix(col, ac * 0.92, clamp(acCore * min(acL, 1.0) * 0.96, 0.0, 1.0));
      emis += ac * acL * acCore * uAccent.x * 0.45;
      col = mix(col, ac, clamp(rimA * 0.55, 0.0, 0.6));
    }
  }

  // self illumination
  float e = t4.w * (1.0 - 0.8 * des) * (1.0 - 0.92 * inkA);
  if (e > 0.0) {
    vec3 ec = t4.rgb;
    if (uTheme == 0) { col += ec * e; emis += ec * e; }
    else {
      col = mix(col, ec * (1.0 + 0.08 * max(e - 1.0, 0.0)), clamp(e, 0.0, 1.0) * 0.92);
      emis += ec * e * 0.75;
    }
  }
  float op = t5.y;
  // a glowing keycap still glows round its label, but its own halo would fill thin dark strokes with light
  emis *= 1.0 - 0.85 * inkZone;
  oColor = vec4(col, op);
  oEmis = vec4(emis, op);
}
`;

// --- floor ---------------------------------------------------------------------------------------------------
export const floorVS = HEAD + `
layout(location = 0) in vec2 aPos;
uniform mat4 uViewProj;
uniform vec4 uQuad;     // centre xy, half size
out vec3 vWorld;
void main() {
  vec3 w = vec3(uQuad.xy + aPos * uQuad.zw, 0.0);
  vWorld = w;
  gl_Position = uViewProj * vec4(w, 1.0);
}
`;

export const floorFS = HEAD + SDF + LIGHTING + `
in vec3 vWorld;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oEmis;
uniform vec3 uStage, uStageLift, uStageEdge;
uniform vec4 uGrid, uGridMajor;      // sRGB rgba
uniform sampler2D uLayer0, uLayer1;
uniform vec2 uViewport;
uniform float uPoolGain, uContactK;
uniform vec3 uHorizon, uHorizonAlt;  // linear: the soft two-hue glow behind the world
uniform float uHorizonK;

float dots(vec2 p, float spacing, float rad, float pxU) {
  vec2 c = (fract(p / spacing + 0.5) - 0.5) * spacing;
  float d = length(c);
  // crisp discs when they are bigger than a pixel, energy-preserving soft dots when smaller
  float sig = max(pxU * 0.5, rad * 0.5);
  float soft = (rad * rad) / (2.0 * sig * sig) * exp(-d * d / (2.0 * sig * sig));
  float crisp = 1.0 - smoothstep(rad - pxU * 0.5, rad + pxU * 0.5, d);
  float k = smoothstep(0.6, 1.4, rad / pxU);
  float v = mix(min(soft, 1.0), crisp, k);
  return v * smoothstep(3.0, 7.0, spacing / pxU);
}

void main() {
  vec2 p = vWorld.xy;
  float pxU = length(fwidth(p)) * 0.7071 + 1e-5;
  vec2 q = (p - uScene.xy) / max(uScene.zw, vec2(1.0));
  float rr = length(q);
  // the key light's pool: stageLift under the scene, exactly stage in a ring of open floor around it,
  // then the studio sweep falls to stageEdge
  vec3 base = mix(uStage, uStageLift, keyPool(p));
  base = mix(base, uStageEdge, smoothstep(1.4, 2.9, rr));
  // atmosphere: behind the world (-y is away from the camera) the floor rises into a horizon glow that holds
  // to infinity; it is centred on the world and leans indigo on the left, teal on the right
  float back = -q.y;
  float aur = smoothstep(0.62, 1.9, back) * exp(-pow(q.x / (1.9 + 0.5 * max(back, 0.0)), 2.0));
  // and toward the top of the frame (the horizon side) whatever the framing, outside the key pool
  float sy = gl_FragCoord.y / uViewport.y;
  aur = max(aur, smoothstep(0.5, 1.1, sy) * 0.72 * smoothstep(0.6, 1.25, rr));
  vec3 hz = mix(uHorizon, uHorizonAlt, smoothstep(-2.4, 2.4, q.x + 0.12 * back));
  base = mix(base, hz, clamp(aur * uHorizonK, 0.0, 1.0));

  vec3 bs = toSrgb(base);
  float gf = 1.0 - smoothstep(1.0, 1.9, rr);
  float dm = dots(p, ${f(128)}, 0.95, pxU) * gf;
  float dn = dots(p, ${f(16)}, 0.6, pxU) * gf * (1.0 - dm);
  bs = mix(bs, uGrid.rgb, uGrid.a * dn);
  bs = mix(bs, uGridMajor.rgb, uGridMajor.a * dm);

  vec4 L0 = texture(uLayer0, gl_FragCoord.xy / uViewport);
  vec4 L1 = texture(uLayer1, gl_FragCoord.xy / uViewport);
  bs = bs * (1.0 - L0.a) + L0.rgb;
  vec3 alb = toLin(bs);

  float vis = shadowVis(vec3(p, 0.0), vec3(0.0, 0.0, 1.0), uKeyDir.z);
  float lightF = (uAmb + uKey * uKeyDir.z * vis + uFill * max(uFillDir.z, 0.0)) * uNorm;
  vec3 cs = contactAt(p);
  vec3 col = alb * tintShade(lightF * (1.0 - cs.r * uContactK));
  col = applyBounce(col, p, 1.0 - cs.r * 0.5);

  vec3 pl = pointLights(vec3(p, 0.0), vec3(0.0, 0.0, 1.0), 0.0);
  if (uTheme == 0) {
    float ratio = clamp(luma(alb) / max(luma(base), 1e-4), 0.25, 3.0);
    col += pl * uPoolGain * mix(1.0, ratio, L0.a) * (1.0 - cs.r * 0.5);
    col += L1.rgb;
  } else {
    float a = 1.0 - exp(-luma(pl) * 2.2);
    vec3 hue = pl / max(max(pl.r, pl.g), max(pl.b, 1e-4));
    col = mix(col, col * mix(vec3(1.0), hue, 0.9), a * 0.72);
  }
  oColor = vec4(col, 1.0);
  oEmis = vec4(L1.rgb, 1.0);
}
`;

// --- floor ink: zones, text, ticks, rings (into the floor layer, sRGB premultiplied) --------------------------
export const inkVS = HEAD + `
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 iA;   // centre xy, half size
layout(location = 2) in vec4 iB;   // cos, sin, radius, type
layout(location = 3) in vec4 iC;   // colour
layout(location = 4) in vec4 iD;
layout(location = 5) in vec4 iE;
uniform mat4 uViewProj;
uniform float uPxU;
out vec2 vLocal; out vec2 vWorld2;
flat out vec4 vA; flat out vec4 vB; flat out vec4 vC; flat out vec4 vD; flat out vec4 vE;
void main() {
  float m = 3.0 * uPxU + 0.6 + (iB.w < 0.5 ? iD.x : 0.0);
  vec2 l = aPos * (iA.zw + m);
  vec2 w = iA.xy + vec2(iB.x * l.x - iB.y * l.y, iB.y * l.x + iB.x * l.y);
  vLocal = l; vWorld2 = w;
  vA = iA; vB = iB; vC = iC; vD = iD; vE = iE;
  float z = iB.w > 0.5 ? iE.w : 0.0;    // texts, ticks and rings may sit on raised surfaces
  gl_Position = uViewProj * vec4(w, z, 1.0);
}
`;

export const inkFS = HEAD + SDF + `
in vec2 vLocal; in vec2 vWorld2;
flat in vec4 vA; flat in vec4 vB; flat in vec4 vC; flat in vec4 vD; flat in vec4 vE;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
uniform sampler2D uAtlas;
uniform float uAtlasSize, uSpreadPx;
uniform vec2 uKeyPlan;
uniform int uDirect;
void main() {
  float pxU = length(fwidth(vLocal)) * 0.7071 + 1e-5;
  int type = int(vB.w + 0.5);
  vec2 hs = vA.zw; float r = vB.z;
  vec3 c = vC.rgb; float a = 0.0;
  if (type == 0) {             // zone: fill + solid or dashed border
    float d = sdRR(vLocal, hs, r);
    float fill = (1.0 - smoothstep(-pxU * 0.5, pxU * 0.5, d)) * vC.a;
    float bw = vD.x;
    float band = 1.0 - smoothstep(bw * 0.5 - pxU * 0.5, bw * 0.5 + pxU * 0.5, abs(d + bw * 0.5));
    band *= smoothstep(0.0, 1.0, bw / pxU + 0.15);
    if (vD.y > 0.0) {
      vec2 p = abs(vLocal); vec2 cc = hs - r;
      vec2 qq = p - cc;
      float s;
      float lq = cc.x + cc.y + 1.5707963 * r;
      if (qq.x > 0.0 && qq.y > 0.0) s = cc.x + r * (1.5707963 - atan(qq.y, qq.x));
      else if (qq.y > qq.x) s = p.x;
      else s = cc.x + 1.5707963 * r + (cc.y - p.y);
      float per = vD.y + vD.z;
      float n = max(1.0, floor(lq / per + 0.5));
      float P = lq / n, on = vD.y * P / per;
      float ph = mod(s + on * 0.5, P);
      band *= smoothstep(-pxU, pxU, on - ph) * smoothstep(-pxU, pxU, ph) ;
    }
    vec4 bc = vE;
    float ba = band * bc.a;
    vec3 rgb = c * fill * (1.0 - ba) + bc.rgb * ba;
    a = fill * (1.0 - ba) + ba;
    o0 = vec4(rgb, a);
    o1 = vec4(0.0, 0.0, 0.0, 0.0);
    if (a < 0.001) discard;
    return;
  } else if (type == 1) {      // text
    vec2 rel = (vLocal + hs) / (2.0 * hs);
    if (rel.x < 0.0 || rel.y < 0.0 || rel.x > 1.0 || rel.y > 1.0) discard;
    vec2 uv = mix(vD.xy, vD.zw, rel);
    vec2 uvPerU = (vD.zw - vD.xy) / (2.0 * hs);
    float aa = clamp(uvPerU.x * uAtlasSize * pxU / (2.0 * uSpreadPx) * 0.85, 0.003, 0.2);   // far text keeps its weight
    float sd = textureLod(uAtlas, uv, 0.0).r;
    a = smoothstep(0.5 - aa, 0.5 + aa, sd) * vC.a;
    if (vE.x > 0.5) {
      vec2 lpl = vec2(vB.x * uKeyPlan.x + vB.y * uKeyPlan.y, -vB.y * uKeyPlan.x + vB.x * uKeyPlan.y);
      float big = smoothstep(26.0, 60.0, 2.0 * hs.y / pxU);
      float o = vE.y;
      float sdT = textureLod(uAtlas, uv + lpl * o * uvPerU, 0.0).r;
      float sdA = textureLod(uAtlas, uv - lpl * o * uvPerU, 0.0).r;
      float shade = smoothstep(0.5 + aa, 0.5 - aa, sdT) * big;
      float catchL = smoothstep(0.5 + aa, 0.5 - aa, sdA) * big;
      c = c * (1.0 - 0.5 * shade) + c * 0.4 * catchL * (1.0 - shade);
    }
  } else if (type == 2) {      // rect (ticks)
    vec2 d2 = abs(vLocal) - hs;
    float d = length(max(d2, 0.0)) + min(max(d2.x, d2.y), 0.0);
    float thin = clamp(2.0 * min(hs.x, hs.y) / pxU, 0.0, 1.0);
    a = (1.0 - smoothstep(-pxU * 0.5, pxU * 0.5, d / max(thin, 0.35))) * vC.a * mix(0.6, 1.0, thin);
  } else {                     // ring (selection outline, arrival ping)
    float d = sdRR(vLocal, hs, r);
    float bw = vD.x;
    float hw = max(bw * 0.5, pxU * 0.5);
    a = (1.0 - smoothstep(hw - pxU * 0.6, hw + pxU * 0.6, abs(d))) * vC.a * min(1.0, bw / max(pxU, 1e-4) + 0.25);
    // a ping is light: a soft inner wash and emission
    if (vD.y > 0.0) a = max(a, exp(-max(-d, 0.0) / 2.2) * step(d, 0.0) * vC.a * 0.16);
  }
  if (a < 0.001) discard;
  // the floor layer is sRGB premultiplied; drawn straight into the lit HDR buffer it is linear
  o0 = uDirect == 1 ? vec4(toLin(c) * a, a) : vec4(c * a, a);
  o1 = type == 3 && vD.y > 0.0 ? vec4(toLin(c) * a * vD.y, a) : vec4(0.0, 0.0, 0.0, a);
}
`;

// --- grooves: one capsule per segment; nearest segment wins (depth = distance) so joints never double ------
export const grooveVS = HEAD + `
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 iSeg;    // x0 y0 x1 y1
layout(location = 2) in vec4 iInfo;   // s0, groove index, half width, segment index
uniform mat4 uViewProj;
uniform float uPxU;
out vec2 vP;
flat out vec4 vSeg; flat out vec4 vInfo;
void main() {
  vec2 a = iSeg.xy, b = iSeg.zw;
  vec2 d = b - a; float L = length(d);
  vec2 t = L > 1e-5 ? d / L : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float m = iInfo.z + 3.0 * uPxU + 0.5;
  vec2 c = (a + b) * 0.5;
  vec2 w = c + t * aPos.x * (L * 0.5 + m) + n * aPos.y * m;
  vP = w; vSeg = iSeg; vInfo = iInfo;
  gl_Position = uViewProj * vec4(w, 0.0, 1.0);
}
`;

export const grooveFS = HEAD + SDF + `
in vec2 vP;
flat in vec4 vSeg; flat in vec4 vInfo;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
uniform highp sampler2D uGrooves;
uniform vec2 uKeyPlan;
uniform int uTheme;
uniform vec3 uGrooveRim;          // sRGB catch-light colour
uniform int uIdPass;
uniform highp sampler2D uIds;
vec4 G(int g, int k) { return texelFetch(uGrooves, ivec2(k, g), 0); }
void main() {
  float pxU = length(fwidth(vP)) * 0.7071 + 1e-5;
  vec2 a = vSeg.xy, b = vSeg.zw, ba = b - a;
  float L2 = dot(ba, ba);
  float t = L2 > 1e-8 ? clamp(dot(vP - a, ba) / L2, 0.0, 1.0) : 0.0;
  vec2 dv = vP - (a + ba * t);
  float d = length(dv);
  float hw = vInfo.z;
  float aa = pxU * 0.6;
  if (d > hw + aa) discard;
  int g = int(vInfo.y + 0.5);
  vec4 g0 = G(g, 0), g1 = G(g, 1), g2 = G(g, 2), g3 = G(g, 3);
  float s = vInfo.x + t * sqrt(L2);
  float cov = 1.0 - smoothstep(hw - aa, hw + aa, d);
  // thin lines keep their energy instead of breaking up
  cov *= clamp(2.0 * hw / pxU, 0.35, 1.0);
  if (g3.x > 0.0) {
    float per = g3.x + g3.y;
    float ph = mod(s - g3.z, per);
    float aS = max(pxU, 0.05);
    cov *= smoothstep(-aS, aS, ph) * (1.0 - smoothstep(g3.x - aS, g3.x + aS, ph));
  }
  float alpha = cov * g0.z;
  if (alpha < 0.002) discard;
  if (uIdPass == 1) {
    // pass 1: the nearest segment (depth = distance from its centre line) records its id
    // ties (collinear overlaps at tees) go to the groove that carries light, then to the lower index
    gl_FragDepth = clamp(d / (hw + aa + 1e-3), 0.0, 1.0) * 0.95 + g2.w * 0.004 + float(g) * 1e-6;
    o0 = vec4(vInfo.w + 1.0, 0.0, 0.0, 0.0);
    o1 = vec4(0.0);
    return;
  }
  // pass 2: only the winner shades this pixel, so overlapping capsules never double up
  if (abs(texelFetch(uIds, ivec2(gl_FragCoord.xy), 0).r - (vInfo.w + 1.0)) > 0.5) discard;

  vec3 c = g1.rgb;                // sRGB
  float x = clamp(d / hw, 0.0, 1.0);
  vec2 nE = d > 1e-4 ? dv / d : vec2(0.0);
  float side = dot(nE, uKeyPlan); // +1: the half toward the light, -1: away
  float prof = 1.0 - x * x;
  if (g0.x < 0.5) {
    // cut channel: dark core, the far wall's shadow inside the light-side half, a catch-light on the lip
    // whose rounded top faces the light (the lower lip from the default camera)
    // the channel floor away from the light catches a little key light; the half under the far wall is shaded
    float lit = smoothstep(-0.2, 0.9, -side * x) * (1.0 - smoothstep(0.62, 0.9, x));
    c = mix(c, uGrooveRim, 0.3 * lit);
    c *= 1.0 - 0.45 * smoothstep(0.1, 0.95, x) * max(side, 0.0);
    float lipW = max(0.32, pxU * 1.1) / hw;
    float lipBand = smoothstep(1.0 - lipW * 2.2, 1.0 - lipW * 0.8, x) * (1.0 - smoothstep(1.0 - lipW * 0.4, 1.0 + lipW * 0.6, x));
    c = mix(c, uGrooveRim, clamp(lipBand * max(-side, 0.0) * 1.2, 0.0, 1.0));
  }
  // emission: a light tube while data flows (bright core, soft edges; bloom adds the halo), pulses by arc
  // length on top (tail -> 0, head brightest)
  float core = exp(-x * x * 4.5);
  vec3 e = g2.rgb * g1.w * (0.22 + 0.9 * core);
  if (uTheme == 0 && g1.w > 0.0) c = mix(c, toSrgb(g2.rgb) * 0.4, clamp(g1.w * 1.2, 0.0, 0.45) * prof);
  int np = int(g3.w + 0.5);
  for (int k = 0; k < 6; k++) {
    if (k >= np) break;
    vec4 pa = G(g, 4 + 2 * k), pc = G(g, 5 + 2 * k);
    // s1 is the head; s0 > s1 when the pulse travels against the polyline. a0/a1: relative intensity at
    // each end (a trail split across a branch and the trunk), so pieces join into one continuous trail
    float s0 = pa.x, s1 = pa.y, dir = s1 >= s0 ? 1.0 : -1.0;
    float along = (s - s0) * dir, len = max(abs(s1 - s0), 1e-3);
    if (along < -0.5 || along > len + 1.0) continue;
    float u = clamp(along / len, 0.0, 1.0);
    float a = mix(pc.w, pa.w, u);
    float trail = a * a * (3.0 - 2.0 * a) * a;
    float head = pa.w > 0.999 ? exp(-max(len - along, 0.0) / 2.5) * 1.4 : 0.0;
    float cut = (1.0 - smoothstep(len - 0.3, len + 0.6, along)) * smoothstep(-0.5, 0.3, along);
    e += pc.rgb * pa.z * (trail + head) * cut;
  }
  e *= mix(0.6, 1.0, prof);
  if (uTheme == 1) {
    // on paper a line that means something (a keyed pointer, a toned link, data in flight) is inked in its own
    // colour, a little deeper than the token so it holds on white ceramic; plain wiring (no glow) stays a quiet cut
    float lineA = clamp(g1.w * 5.2, 0.0, 0.92) * mix(0.7, 1.0, prof);
    c = mix(c, toSrgb(g2.rgb * 0.6), lineA);
    // pulses and their heads: a saturated colour in the channel; the halo comes from the bloom tint
    float el = luma(e);
    vec3 hue = e / max(max(e.r, e.g), max(e.b, 1e-4));
    c = mix(c, toSrgb(hue * 0.6), clamp(el * 3.2, 0.0, 0.94));
  }
  o0 = vec4(c * alpha, alpha);
  o1 = vec4(e * alpha, alpha);
}
`;

// --- contact shadows in plan space: Gaussian-blurred rounded rects (Evan Wallace's erf method) -------------
export const contactVS = HEAD + `
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 iA;   // centre xy, half size
layout(location = 2) in vec4 iB;   // cos, sin, radius, sigma
layout(location = 3) in vec4 iC;   // strength, receiver z, ground, 0
uniform vec4 uRect;                // x0, y0, 1/w, 1/h
out vec2 vL; flat out vec4 vA; flat out vec4 vB; flat out vec4 vC;
void main() {
  vec2 l = aPos * (iA.zw + 3.0 * iB.w);
  vec2 w = iA.xy + vec2(iB.x * l.x - iB.y * l.y, iB.y * l.x + iB.x * l.y);
  vL = l; vA = iA; vB = iB; vC = iC;
  vec2 uv = (w - uRect.xy) * uRect.zw;
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
}
`;
export const contactFS = HEAD + `
in vec2 vL; flat in vec4 vA; flat in vec4 vB; flat in vec4 vC;
out vec4 o;
float gaussian(float x, float sigma) { return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066283 * sigma); }
vec2 erf2(vec2 x) { vec2 s = sign(x), a = abs(x); x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a; x *= x; return s - s / (x * x); }
float boxX(float x, float y, float sigma, float corner, vec2 hs) {
  float delta = min(hs.y - corner - abs(y), 0.0);
  float curved = hs.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  vec2 integral = 0.5 + 0.5 * erf2((x + vec2(-curved, curved)) * (0.70710678 / sigma));
  return integral.y - integral.x;
}
float roundedBoxShadow(vec2 hs, vec2 p, float sigma, float corner) {
  float low = p.y - hs.y, high = p.y + hs.y;
  float start = clamp(-3.0 * sigma, low, high), end = clamp(3.0 * sigma, low, high);
  float step = (end - start) / 4.0;
  float y = start + step * 0.5, v = 0.0;
  for (int i = 0; i < 4; i++) { v += boxX(p.x, p.y - y, sigma, corner, hs) * gaussian(y, sigma) * step; y += step; }
  return v;
}
void main() {
  float s = roundedBoxShadow(vA.zw, vL, vB.w, min(vB.z, min(vA.z, vA.w))) * vC.x;
  if (s < 0.002) discard;
  o = vC.z > 0.5 ? vec4(s, 0.0, 0.0, 0.0) : vec4(0.0, s, vC.y, 0.0);
}
`;

// colour bounce: the same blurred footprints, much wider, carrying the caster's colour (additive)
export const bounceFS = HEAD + `
in vec2 vL; flat in vec4 vA; flat in vec4 vB; flat in vec4 vC;
out vec4 o;
float gaussian(float x, float sigma) { return exp(-(x * x) / (2.0 * sigma * sigma)) / (2.5066283 * sigma); }
vec2 erf2(vec2 x) { vec2 s = sign(x), a = abs(x); x = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a; x *= x; return s - s / (x * x); }
float boxX(float x, float y, float sigma, float corner, vec2 hs) {
  float delta = min(hs.y - corner - abs(y), 0.0);
  float curved = hs.x - corner + sqrt(max(0.0, corner * corner - delta * delta));
  vec2 integral = 0.5 + 0.5 * erf2((x + vec2(-curved, curved)) * (0.70710678 / sigma));
  return integral.y - integral.x;
}
float roundedBoxShadow(vec2 hs, vec2 p, float sigma, float corner) {
  float low = p.y - hs.y, high = p.y + hs.y;
  float start = clamp(-3.0 * sigma, low, high), end = clamp(3.0 * sigma, low, high);
  float step = (end - start) / 4.0;
  float y = start + step * 0.5, v = 0.0;
  for (int i = 0; i < 4; i++) { v += boxX(p.x, p.y - y, sigma, corner, hs) * gaussian(y, sigma) * step; y += step; }
  return v;
}
void main() {
  float s = roundedBoxShadow(vA.zw, vL, vB.w, min(vB.z, min(vA.z, vA.w))) * vC.w;
  if (s < 0.002) discard;
  o = vec4(vC.rgb * s, s);
}
`;

// --- post: dual-filter bloom, composite, tonemap, grain ---------------------------------------------------
export const fsqVS = HEAD + `
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;
export const downFS = HEAD + `
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uHalf;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv + vec2(-uHalf.x, -uHalf.y)).rgb;
  c += texture(uSrc, vUv + vec2(uHalf.x, -uHalf.y)).rgb;
  c += texture(uSrc, vUv + vec2(-uHalf.x, uHalf.y)).rgb;
  c += texture(uSrc, vUv + vec2(uHalf.x, uHalf.y)).rgb;
  o = vec4(c / 8.0, 1.0);
}
`;
export const upFS = HEAD + `
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform sampler2D uBase; uniform vec2 uHalf; uniform float uMix;
void main() {
  vec2 h = uHalf;
  vec3 c = texture(uSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb;
  c += texture(uSrc, vUv + vec2(-h.x, h.y)).rgb * 2.0;
  c += texture(uSrc, vUv + vec2(0.0, h.y * 2.0)).rgb;
  c += texture(uSrc, vUv + vec2(h.x, h.y)).rgb * 2.0;
  c += texture(uSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb;
  c += texture(uSrc, vUv + vec2(h.x, -h.y)).rgb * 2.0;
  c += texture(uSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb;
  c += texture(uSrc, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  o = vec4(texture(uBase, vUv).rgb + c / 12.0 * uMix, 1.0);
}
`;
export const compositeFS = HEAD + SDF + `
in vec2 vUv; out vec4 o;
uniform sampler2D uColor, uBloom;
uniform sampler2D uDofHalf, uDofQuarter;
uniform vec4 uDof;      // focus band y0, y1 (uv, y up), ramp (uv), enabled
uniform vec3 uDofMax;   // far, near blur (device px), quarter texel size in device px
uniform int uTheme;
uniform vec4 uPost;     // bloom strength, vignette, grain, exposure
uniform float uKnee, uFrame, uBloomNorm;
uniform vec2 uRes;
vec3 shoulder(vec3 x, float k) {
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
// identity below the knee (albedo-range colours land exactly on their tokens); above it, compress the
// brightest channel and keep the hue, with a little per-channel roll-off so very hot cores whiten slightly
vec3 tonemap(vec3 c, float k) {
  float m = max(c.r, max(c.g, c.b));
  if (m <= k) return c;
  float mm = shoulder(vec3(m), k).r;
  vec3 hue = c * (mm / m);
  return mix(hue, shoulder(c, k), 0.22);
}
float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 c = texture(uColor, vUv).rgb;
  // tilt-shift: crisp inside the focus band, far rows (top) and near rows (bottom) soften beyond it
  if (uDof.w > 0.5) {
    float far = smoothstep(0.0, uDof.z, vUv.y - uDof.y), near = smoothstep(0.0, uDof.z, uDof.x - vUv.y);
    float px = far * far * uDofMax.x + near * near * uDofMax.y;
    if (px > 0.05) {
      float k = clamp(px / uDofMax.z, 0.0, 1.25);
      vec3 hb = texture(uDofHalf, vUv).rgb;
      vec2 qt = 1.0 / vec2(textureSize(uDofQuarter, 0));
      vec3 qb = texture(uDofQuarter, vUv).rgb * 0.4;
      float rr = max(k - 0.5, 0.0) * 1.4;
      qb += texture(uDofQuarter, vUv + vec2(rr, 0.0) * qt).rgb * 0.15;
      qb += texture(uDofQuarter, vUv - vec2(rr, 0.0) * qt).rgb * 0.15;
      qb += texture(uDofQuarter, vUv + vec2(0.0, rr) * qt).rgb * 0.15;
      qb += texture(uDofQuarter, vUv - vec2(0.0, rr) * qt).rgb * 0.15;
      c = k < 0.5 ? mix(c, hb, k * 2.0) : mix(hb, qb, clamp((k - 0.5) * 2.0, 0.0, 1.0));
    }
  }
  c *= uPost.w;
  vec3 b = texture(uBloom, vUv).rgb * uBloomNorm * uPost.x;
  if (uTheme == 0) c += b;
  else {
    // a coloured halo on paper: multiply the paper toward the light's own hue, never toward grey
    float a = 1.0 - exp(-luma(b) * 6.0);
    vec3 hue = b / max(max(b.r, b.g), max(b.b, 1e-4));
    c *= mix(vec3(1.0), hue, a * 0.72);
  }
  c = tonemap(c, uKnee);
  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vr = length(q) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
  c *= 1.0 - uPost.y * smoothstep(0.62, 1.12, vr);
  vec3 s = toSrgb(c);
  float L = luma(s);
  float g = (hash(vec3(gl_FragCoord.xy, uFrame)) + hash(vec3(gl_FragCoord.yx + 17.0, uFrame + 3.0)) - 1.0);
  s += g * uPost.z * (0.25 + 0.75 * smoothstep(0.0, 0.45, L) * (1.0 - smoothstep(0.7, 1.0, L))) * 0.6;
  s += (hash(vec3(gl_FragCoord.xy, uFrame + 7.0)) - 0.5) / 255.0;
  o = vec4(s, 1.0);
}
`;

// min-depth reduction of the shadow map (16 x 16 texels per output texel)
export const shadowMinFS = HEAD + `
out vec4 o;
uniform highp sampler2D uSrc;
void main() {
  ivec2 b = ivec2(gl_FragCoord.xy) * 16;
  ivec2 sz = textureSize(uSrc, 0) - 1;
  float m = 1.0;
  for (int j = 0; j < 16; j += 2) for (int i = 0; i < 16; i += 2) {
    m = min(m, texelFetch(uSrc, min(b + ivec2(i, j), sz), 0).r);
    m = min(m, texelFetch(uSrc, min(b + ivec2(i + 1, j + 1), sz), 0).r);
    m = min(m, texelFetch(uSrc, min(b + ivec2(i + 1, j), sz), 0).r);
    m = min(m, texelFetch(uSrc, min(b + ivec2(i, j + 1), sz), 0).r);
  }
  o = vec4(m);
}
`;
