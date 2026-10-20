// The backend-neutral half of the look: quality presets, per-theme lighting constants, the studio's softbox
// directions and the tilt-shift focus band. Both backends read these, so a frame matches across them. Pure.
import { LIGHT, PALETTE, ACCENT, GLOW, POST } from "../tokens.mjs";
import { norm3, cross3 } from "./math.mjs";
import { linear } from "./color.mjs";

export const QUALITY = {
  high:   { shadow: 2048, contact: 2048, bloom: 6, samples: 4, dpr: 2, bounce: 512, dof: true },
  medium: { shadow: 1536, contact: 1024, bloom: 5, samples: 4, dpr: 2, bounce: 256, dof: false },
  low:    { shadow: 1024, contact: 512,  bloom: 4, samples: 2, dpr: 1.5, bounce: 128, dof: false },
};

// The draft tier: a frame in motion (playing, the camera easing) on a software rasterizer, where a full frame takes a
// second or more without a GPU. It draws over the quality preset at `scale` of its pixel ratio; the frame the picture
// comes to rest on, and every captured frame, is drawn in full (CONTRACTS.md 3.1, `draft`).
export const DRAFT = { shadow: 1024, contact: 512, bloom: 4, samples: 0, bounce: 128, dof: false, scale: 0.5 };
// renderer strings of software rasterizers (WebGL's UNMASKED_RENDERER, WebGPU's adapter info)
export const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i;

// studio environment geometry (directions toward each softbox), derived from the key light token
const KEY = norm3(LIGHT.key.dir), KEY_X = norm3(cross3([0, 0, 1], KEY));
const STRIP = norm3([0, 0.8, 0.6]);           // a long strip softbox behind the camera, above the horizon
const SIDE = norm3([0.74, -0.42, 0.52]), SIDE_X = norm3(cross3([0, 0, 1], SIDE));   // fill side: right bevels
export const STUDIO = {
  KEY, KEY_X, KEY_Y: cross3(KEY, KEY_X),
  STRIP, STRIP_Y: norm3(cross3(STRIP, [1, 0, 0]).map((x) => -x)),
  SIDE, SIDE_X, SIDE_Y: cross3(SIDE, SIDE_X),
  BACK: norm3([0, -0.72, 0.69]),              // a broad soft panel behind the set: the satin gradient on tops
};

// theme lighting constants derived from tokens (candidates for tokens)
export function themeLight(theme) {
  const dark = theme !== "light";
  const kd = norm3(LIGHT.key.dir), fd = norm3(LIGHT.fill.dir);
  const key = LIGHT.key[dark ? "dark" : "light"], fill = LIGHT.fill[dark ? "dark" : "light"], amb = LIGHT.ambient[dark ? "dark" : "light"];
  const L0 = amb + key * kd[2] + fill * Math.max(0, fd[2]);
  return {
    kd, fd, key, fill, amb, norm: 1 / L0,
    ground: dark ? 0.44 : 0.74,                 // hemisphere: how much the floor bounces onto downward faces
    env: dark ? [0.03, 8.0, 2.5] : [0.4, 2.6, 1.4],      // surround, strip boxes, key box
    backGain: dark ? 0.5 : 0.12,                // the satin panel: a gentle gradient across flat tops
    envTint: dark ? [0.85, 0.9, 1.0] : [1.0, 0.99, 0.97],
    poolGain: dark ? 0.85 : 1.0,
    contactK: dark ? 0.72 : 0.55,
    knee: dark ? 0.72 : 0.93,
    lightSize: LIGHT.shadowSoftness * 0.055,
    // solids share the floor's key pool, a gentler version of the stageLift / stage ratio
    solidPool: 1 + (lumLin(PALETTE[dark ? "dark" : "light"].stageLift) / lumLin(PALETTE[dark ? "dark" : "light"].stage) - 1) * 0.45,
    shadowMix: shadowMix(PALETTE[dark ? "dark" : "light"].shadow, LIGHT.shadowTint[dark ? "dark" : "light"]),
    bounceK: [GLOW.bounce.dark * 0.035, GLOW.bounce.light],
    accent: [ACCENT.emissive[dark ? "dark" : "light"], ACCENT.halo, 0],
    satin: [GLOW.satin, GLOW.tileLift[dark ? "dark" : "light"]],
  };
}
// per-channel share of a shadow's darkening: the shadow hue keeps more of its own channels
function shadowMix(hexc, k) {
  const l = linear(hexc), m = Math.max(l[0], l[1], l[2], 1e-4);
  return [0, 1, 2].map((i) => 1 - k * (l[i] / m));
}
function lumLin(hexc) { const l = linear(hexc); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; }

/**
 * Tilt-shift: a crisp band (uv, y up) round the camera target; far rows (top) and near rows (bottom) soften
 * beyond it. A world that sits inside the band is never blurred. Returns null when nothing would blur.
 */
export function dofBand(cam, camera, bounds, cssH) {
  const D = POST.dof;
  if (!D) return null;
  const b = bounds;
  const ty = 1 - cam.project(camera.target)[1] / cssH;
  const wy = [b.minY, b.maxY].map((yy) => 1 - cam.project([(b.minX + b.maxX) / 2, yy, 0])[1] / cssH);
  const band = [Math.min(ty - D.band, Math.max(wy[1], ty - 2 * D.band)), Math.max(ty + D.band, Math.min(wy[0], ty + 1.6 * D.band))];
  return band[0] <= 0 && band[1] >= 1 ? null : band;
}
