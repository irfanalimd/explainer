// The camera director: a calm documentary operator. DOM-free, runs in Node and the browser.
// With a timeline it directs from a shot plan (shots.mjs): establishing, push-in, detail and pull-back per chapter,
// the payoff and any scale shot, each move eased and the camera a pure function of the playhead. Without one it
// follows the step's focus: it keeps a shot unless the focus leaves the dead zone or needs a real zoom change, and
// flies there on critically damped springs. Gestures take over; auto direction resumes after a quiet spell and eases
// back into the plan. While the reader must click something (an s.choose pick) the director keeps those things in the
// free area (keep()): the plan's shot when it already shows them, else a shot of them at the plan's angle, so on a
// phone the candidates sit above the pick card (which the HUD reports as a bottom inset). The thing the keyboard is on
// is kept the same way, ahead of the pick.
//
// Conventions (shared with the renderer; see cameraBasis):
//   eye = target + distance * (sin(yaw) cos(pitch), cos(yaw) cos(pitch), sin(pitch))
//   screen right R = (cos yaw, -sin yaw, 0); screen up U = (-sin yaw sin pitch, -cos yaw sin pitch, cos pitch)
//   forward F = -(eye - target) / distance. fov is vertical. NDC x right, y up, both in [-1, 1].
import { CAMERA, MOTION, SIZE } from "../tokens.mjs";
import { planShots, cameraAt, blend, union } from "./shots.mjs";
import { easeInOut } from "../scene/transitions.mjs";

const RAD = Math.PI / 180;

// Director tuning, derived from tokens where a token exists.
export const DIRECTOR = {
  establish: 2 * MOTION.step,      // s of playhead the establishing shot holds after a phase starts
  resume: 4,                       // s after the last gesture before auto direction resumes (DESIGN.md 8)
  maxZoom: 1.7,                    // closest auto push-in, CSS px per u at the target (9.5 u labels at ~16 px)
  context: 0.5,                    // a focus shot grows this far toward the world box, so close-ups keep their surroundings
  gestureMaxZoom: 4.0,             // closest a user may zoom, px per u
  gestureMaxOut: 3.0,              // furthest a user may zoom out, multiple of the world-shot distance
  focusPad: SIZE.zone.pad,         // context around a focus box, u
  zRange: [0, 30],                 // z range of a bounds box that has none
  safe: 0.5,                       // a focus corner may not come closer to the edge than this much of the margin
  hudGap: 1 / 3,                   // breathing room between the world and a HUD overlay, as a fraction of the margin
  insetSlack: 24,                  // HUD inset changes smaller than this (css px) do not reframe...
  phoneInsetSlack: 2,              // ...except an overlay that grows on a phone, where every px of free area counts
  driftPeriods: [41, 17],          // s; two incommensurate sines make the drift feel unmechanical
  driftMix: [0.8, 0.2],
  manualOmega: MOTION.camera.omega * 4,  // springs while the user drives (wheel zoom smoothing)
  orbitSpeed: 0.25,                // degrees of yaw per CSS px of horizontal drag
  pitchSpeed: 0.2,                 // degrees of pitch per CSS px of vertical drag
  // Never shrink the world to fit the chrome (UX review C2). Tile labels are 9.5 u of Geist Mono: at 0.9 px/u they
  // print at ~8.6 CSS px, the size of the dock's own smallest labels and the least at which digits stay distinct.
  // A world too wide for the free area at this size gets a closer shot instead (the step's focus stays in frame).
  // Phones (< phoneWidth) keep fitting the whole board width first: their figures lay themselves out in portrait.
  minZoom: 0.9,
  phoneWidth: 640,
  fill: 0.62,                      // a small board fills at least this much of the free area (quicksort's array)...
  smallMaxZoom: 3.0,               // ...but is never pushed in closer than this
  payoffMaxZoom: 2.2,              // the last step's focus (the result) is framed close and large, up to this
  detailZoom: [1.7, 2.1],          // closest a detail shot pushes in, px per u: [wide screens, phones]
  phoneMinZoom: 1.1,               // phones: shots closer than the world shot hold tile labels at >= ~10 px
  tagRoom: 34,                     // css px a tag needs above its anchor (its label and caret)
  keepContext: 0.6,                // a kept box's context (a pick's source) may shrink it to this share of its own size
  handoff: 1.3,                    // s to ease back into the plan after a gesture or a HUD inset change
};

// ---------------------------------------------------------------- math

export function cameraBasis(yaw, pitch) {
  const cy = Math.cos(yaw * RAD), sy = Math.sin(yaw * RAD), cp = Math.cos(pitch * RAD), sp = Math.sin(pitch * RAD);
  return {
    R: [cy, -sy, 0],
    U: [-sy * sp, -cy * sp, cp],
    F: [-sy * cp, -cy * cp, -sp],
    O: [sy * cp, cy * cp, sp],   // unit offset from target to eye
  };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function eyeOf(cam) {
  const { O } = cameraBasis(cam.yaw, cam.pitch);
  const t = cam.target;
  return [t[0] + cam.distance * O[0], t[1] + cam.distance * O[1], t[2] + cam.distance * O[2]];
}

// World point -> [ndcX, ndcY, depth]. depth <= 0 means behind the eye.
export function projectPoint(cam, p, aspect, out = [0, 0, 0]) {
  const { R, U, F } = cameraBasis(cam.yaw, cam.pitch);
  const e = eyeOf(cam);
  const v = [p[0] - e[0], p[1] - e[1], (p[2] ?? 0) - e[2]];
  const z = dot(v, F), t = Math.tan((cam.fov * RAD) / 2);
  out[0] = dot(v, R) / (z * t * aspect);
  out[1] = dot(v, U) / (z * t);
  out[2] = z;
  return out;
}

export function ndcToCss(ndc, viewport) {
  return [(ndc[0] + 1) * 0.5 * viewport.width, (1 - ndc[1]) * 0.5 * viewport.height];
}

// CSS point -> world point on the horizontal plane at height z (null if the ray misses it).
export function unprojectPoint(cam, cssX, cssY, viewport, z = 0) {
  const { R, U, F } = cameraBasis(cam.yaw, cam.pitch);
  const e = eyeOf(cam), t = Math.tan((cam.fov * RAD) / 2), aspect = viewport.width / viewport.height;
  const nx = (cssX / viewport.width) * 2 - 1, ny = 1 - (cssY / viewport.height) * 2;
  const d = [0, 1, 2].map((i) => F[i] + R[i] * nx * t * aspect + U[i] * ny * t);
  if (Math.abs(d[2]) < 1e-9) return null;
  const s = (z - e[2]) / d[2];
  return s > 0 ? [e[0] + d[0] * s, e[1] + d[1] * s, z] : null;
}

// CSS px per world unit at the target for a camera at this distance.
export const pxPerUnitAt = (distance, height, fov = CAMERA.fov) => height / (2 * distance * Math.tan((fov * RAD) / 2));

export function validBounds(b) {
  return !!b && [b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) && b.maxX >= b.minX && b.maxY >= b.minY;
}

export function boxCorners(b, pad = 0, out = []) {
  const z0 = Number.isFinite(b.minZ) ? b.minZ : DIRECTOR.zRange[0];
  const z1 = Number.isFinite(b.maxZ) ? b.maxZ : DIRECTOR.zRange[1];
  let i = 0;
  for (const x of [b.minX - pad, b.maxX + pad]) for (const y of [b.minY - pad, b.maxY + pad]) for (const z of [z0, z1]) {
    const c = out[i] || (out[i] = [0, 0, 0]);
    c[0] = x; c[1] = y; c[2] = z; i++;
  }
  out.length = 8;
  return out;
}

// The framing region in NDC. Each edge keeps the margin (a fraction of the shorter side) from the viewport
// edge, or, where a HUD overlay covers that side (viewport.insets, css px), sits a small gap inside the overlay.
// `stage` is the visible stage: the viewport minus the overlays.
export function frameRegion(viewport, margin = CAMERA.margin) {
  const W = viewport.width, H = viewport.height, ins = viewport.insets || {};
  const m = margin * Math.min(W, H), gap = m * DIRECTOR.hudGap;
  const edge = (inset) => (inset > 0 ? Math.max(m, inset + gap) : m);
  const stage = { left: ins.left || 0, right: W - (ins.right || 0), top: ins.top || 0, bottom: H - (ins.bottom || 0) };
  let css = { left: edge(ins.left), right: W - edge(ins.right), top: edge(ins.top), bottom: H - edge(ins.bottom) };
  // overlays that leave too little room: fall back to an even margin inside the stage
  if (css.right - css.left < W * 0.2 || css.bottom - css.top < H * 0.2) {
    const mm = Math.min(m, (stage.right - stage.left) * 0.2, (stage.bottom - stage.top) * 0.2);
    css = { left: stage.left + mm, right: stage.right - mm, top: stage.top + mm, bottom: stage.bottom - mm };
    if (css.right - css.left < 1 || css.bottom - css.top < 1) css = { left: m, right: W - m, top: m, bottom: H - m };
  }
  const toNdc = (r) => ({ xL: (2 * r.left) / W - 1, xR: (2 * r.right) / W - 1, yLo: 1 - (2 * r.bottom) / H, yHi: 1 - (2 * r.top) / H });
  return { fit: toNdc(css), stage: toNdc(stage), marginPx: m };
}

// Solve one axis of the fit: given camera-space coordinates p (along the axis) and q (depth) of each
// corner, NDC limits [lo, hi] and k = tan(fov/2) (* aspect for x), the largest eye depth c that fits.
function fitDepth(p, q, lo, hi, k) {
  let A = Infinity, B = -Infinity;
  for (let i = 0; i < p.length; i++) {
    A = Math.min(A, p[i] - lo * k * q[i]);
    B = Math.max(B, p[i] - hi * k * q[i]);
  }
  return (A - B) / ((hi - lo) * k);
}

// With the eye depth c fixed, find the eye offset a along the axis that centres the projected extent in [lo, hi].
function centreAxis(p, q, c, lo, hi, k) {
  const goal = (lo + hi) / 2;
  let maxDepth = 0, pMin = Infinity, pMax = -Infinity;
  for (let i = 0; i < p.length; i++) { maxDepth = Math.max(maxDepth, q[i] - c); pMin = Math.min(pMin, p[i]); pMax = Math.max(pMax, p[i]); }
  let a0 = pMin - 4 * k * maxDepth, a1 = pMax + 4 * k * maxDepth;   // g(a0) > 0 > g(a1)
  for (let it = 0; it < 64; it++) {
    const a = (a0 + a1) / 2;
    let sMin = Infinity, sMax = -Infinity;
    for (let i = 0; i < p.length; i++) { const s = (p[i] - a) / (k * (q[i] - c)); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s); }
    if ((sMin + sMax) / 2 > goal) a0 = a; else a1 = a;
  }
  return (a0 + a1) / 2;
}

/**
 * Exact framing: the camera at this yaw/pitch/fov whose frustum holds the eight corners of `bounds`
 * inside the margin, as tight as possible, centred in the framing region.
 * @returns {import("../contracts.mjs").Camera & { fit: number }}  fit: 1 when the box fills the region, < 1 when maxZoom held it back
 */
export function frameBounds(bounds, viewport, { yaw = CAMERA.yaw, pitch = CAMERA.pitch, fov = CAMERA.fov, pad = 0,
  margin = CAMERA.margin, maxZoom = DIRECTOR.maxZoom, maxDistance = Infinity } = {}) {
  const corners = boxCorners(bounds, pad);
  const { R, U, F } = cameraBasis(yaw, pitch);
  const t = Math.tan((fov * RAD) / 2), aspect = viewport.width / viewport.height;
  const px = corners.map((c) => dot(c, R)), py = corners.map((c) => dot(c, U)), pz = corners.map((c) => dot(c, F));
  const { fit } = frameRegion(viewport, margin);
  const cFit = Math.min(fitDepth(px, pz, fit.xL, fit.xR, t * aspect), fitDepth(py, pz, fit.yLo, fit.yHi, t));
  // the target sits on the view axis at the depth of the box centre
  const centre = [(corners[0][0] + corners[7][0]) / 2, (corners[0][1] + corners[7][1]) / 2, (corners[0][2] + corners[7][2]) / 2];
  const qc = dot(centre, F);
  const minDistance = Number.isFinite(maxZoom) && maxZoom > 0 ? viewport.height / (2 * t * maxZoom) : 0;
  let c = Math.min(cFit, qc - minDistance);
  if (qc - c > maxDistance) c = qc - maxDistance;
  const a = centreAxis(px, pz, c, fit.xL, fit.xR, t * aspect);
  const b = centreAxis(py, pz, c, fit.yLo, fit.yHi, t);
  const eye = [0, 1, 2].map((i) => a * R[i] + b * U[i] + c * F[i]);
  const distance = qc - c;
  return {
    target: [eye[0] + distance * F[0], eye[1] + distance * F[1], eye[2] + distance * F[2]],
    distance, yaw, pitch, fov,
    fit: (qc - cFit) / distance,
  };
}

// Projected NDC extent of a box under a camera.
export function projectBounds(cam, bounds, viewport, pad = 0) {
  const aspect = viewport.width / viewport.height, p = [0, 0, 0];
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity, behind = false;
  for (const c of boxCorners(bounds, pad)) {
    projectPoint(cam, c, aspect, p);
    if (p[2] <= 0) behind = true;
    xMin = Math.min(xMin, p[0]); xMax = Math.max(xMax, p[0]); yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]);
  }
  return { xMin, xMax, yMin, yMax, behind };
}

// Deterministic idle drift of yaw, degrees, from playhead time.
export function drift(time) {
  const [p0, p1] = DIRECTOR.driftPeriods, [m0, m1] = DIRECTOR.driftMix;
  return CAMERA.drift * (m0 * Math.sin((2 * Math.PI * time) / p0) + m1 * Math.sin((2 * Math.PI * time) / p1));
}

// Exact critically damped spring step (frame-rate independent for a constant goal).
function spring(s, goal, omega, dt) {
  const x0 = s.x - goal, k = s.v + omega * x0, e = Math.exp(-omega * dt);
  s.x = goal + (x0 + k * dt) * e;
  s.v = (s.v - omega * k * dt) * e;
}

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const SIDES = ["top", "right", "bottom", "left"];
const distanceAt = (zoom, height, fov = CAMERA.fov) => height / (2 * Math.tan((fov * RAD) / 2) * zoom);
const minZoomFor = (vp) => (vp.width < DIRECTOR.phoneWidth ? 0 : DIRECTOR.minZoom);

/** A shot of `box` at exactly this distance, centred in the framing region (closer or wider than a fit). */
export function shotAt(box, viewport, distance, pad = 0, angle = {}) {
  return frameBounds(box, viewport, { ...angle, pad, maxZoom: pxPerUnitAt(distance, viewport.height), maxDistance: distance });
}

/**
 * The world shot: the whole world in the free area, but never smaller than DIRECTOR.minZoom (a too-wide world is
 * framed at the minimum, slid to hold `focus` and to keep side panels clear) and, for a small board, filling
 * DIRECTOR.fill of the area instead of sitting tiny at maxZoom. A `minZoom` of 0 always shows the whole world.
 */
export function worldFrame(world, viewport, focus = null, angle = {}, minZoom = minZoomFor(viewport)) {
  const fit = frameBounds(world, viewport, { ...angle, maxZoom: Infinity });
  const pFit = pxPerUnitAt(fit.distance, viewport.height);
  if (pFit < minZoom) return slideShot(shotAt(world, viewport, distanceAt(minZoom, viewport.height), 0, angle), world, focus, viewport);
  const cap = Math.max(DIRECTOR.maxZoom, Math.min(DIRECTOR.smallMaxZoom, pFit * DIRECTOR.fill));
  return frameBounds(world, viewport, { ...angle, maxZoom: cap });
}

const isPhone = (vp) => vp.width < DIRECTOR.phoneWidth;

/**
 * The framing a shot plan uses (shots.mjs). Establishing shots and, beside a docked panel, pull-backs show the whole
 * world in the free area, small if they must; on phones a pull-back stays on its stage so the tiles stay readable.
 * A box too big for the minimum size gives way to its `focus` at that size; phones hold a closer minimum so tile
 * labels stay readable. No shot leaves its focus, or where it can help it any of the world, under a side panel.
 * On a phone every shot also holds the step's `hold` (its focus and tags, holdShot) in the free area.
 */
export function framer(viewport, world) {
  const phone = isPhone(viewport);
  const minZoom = phone ? DIRECTOR.phoneMinZoom : DIRECTOR.minZoom;
  const wide = (box, angle) => worldFrame(box, viewport, null, angle, 0);
  const fr = {
    establish: DIRECTOR.establish,
    detailZoom: DIRECTOR.detailZoom[phone ? 1 : 0],
    payoffZoom: DIRECTOR.payoffMaxZoom,
    wide,
    pull: (box, angle, focus, hold) => (phone || !world ? fr.fit(box, angle, { focus, hold }) : wide(world, angle)),
    fit(box, angle, { hold = null, ...o } = {}) {
      return phone && !o.raw ? holdShot(fit(box, angle, o), hold, viewport) : fit(box, angle, o);
    },
    /** True when this shot needs no move to hold `hold` (always, off phones). */
    holds: (shot, hold) => !phone || holdShot(shot, hold, viewport) === shot,
  };
  function fit(box, angle, { zoom = DIRECTOR.maxZoom, focus = null, raw = false } = {}) {
    if (raw) return frameBounds(box, viewport, { ...angle, maxZoom: zoom });
    let shot = frameBounds(box, viewport, { ...angle, pad: DIRECTOR.focusPad, maxZoom: Math.max(zoom, minZoom) });
    if (pxPerUnitAt(shot.distance, viewport.height) < minZoom - 1e-9) shot = shotAt(focus ?? box, viewport, distanceAt(minZoom, viewport.height, angle.fov), DIRECTOR.focusPad, angle);
    if (!world) return focus ? slideShot(shot, null, focus, viewport) : shot;
    // never wider than the world shot: a shot that would show more floor shows the whole world instead
    if (box !== world) {
      const ws = worldFrame(world, viewport, null, angle);
      if (ws.distance < shot.distance) shot = ws;
    }
    const subject = focus ?? box;
    shot = clearPanel(slideShot(shot, world, subject, viewport), box, world, subject, viewport, DIRECTOR.focusPad, angle, 0);
    return fillShot(shot, world, subject, viewport);
  }
  return fr;
}

/**
 * Hold a step's focus and its tags in the free area: a shot that leaves part of `hold` ({ box, points }: the focus box
 * and the tags' world anchors, each tag with DIRECTOR.tagRoom px above its anchor) outside the framing region slides
 * as little as brings it in, and pulls back only when it is too big to fit at the shot's distance. Returns the same
 * shot when it already holds them. Pure.
 */
export function holdShot(shot, hold, viewport) {
  const box = validBounds(hold?.box) ? hold.box : null, points = hold?.points ?? [];
  if (!box && !points.length) return shot;
  const { fit } = frameRegion(viewport), eps = 1e-4;
  const aspect = viewport.width / viewport.height, t = Math.tan((shot.fov * RAD) / 2), room = (2 * DIRECTOR.tagRoom) / viewport.height;
  const { R } = cameraBasis(shot.yaw, shot.pitch);
  const sp = Math.max(0.2, Math.sin(shot.pitch * RAD)), fh = [-Math.sin(shot.yaw * RAD), -Math.cos(shot.yaw * RAD)];
  const p = [0, 0, 0];
  const extent = (cam) => {
    const e = box ? projectBounds(cam, box, viewport) : { xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity, behind: false };
    for (const a of points) {
      projectPoint(cam, a, aspect, p);
      if (p[2] <= 0) e.behind = true;
      e.xMin = Math.min(e.xMin, p[0]); e.xMax = Math.max(e.xMax, p[0]); e.yMin = Math.min(e.yMin, p[1]); e.yMax = Math.max(e.yMax, p[1] + room);
    }
    return e;
  };
  const inside = (e) => !e.behind && e.xMin >= fit.xL - eps && e.xMax <= fit.xR + eps && e.yMin >= fit.yLo - eps && e.yMax <= fit.yHi + eps;
  if (inside(extent(shot))) return shot;
  const out = { ...shot, target: shot.target.slice() };
  for (let it = 0; it < 16; it++) {
    let e = extent(out);
    // too big for the region at this distance: pull back by the overflow (perspective makes it a few rounds)
    const r = Math.max((e.xMax - e.xMin) / (fit.xR - fit.xL), (e.yMax - e.yMin) / (fit.yHi - fit.yLo));
    if (e.behind || r > 1 + eps) { out.distance *= e.behind ? 1.5 : r; e = extent(out); }
    const lo = fit.xL - e.xMin, hi = fit.xR - e.xMax, lo2 = fit.yLo - e.yMin, hi2 = fit.yHi - e.yMax;
    const wx = lo <= hi ? clamp(0, lo, hi) : (lo + hi) / 2, wy = lo2 <= hi2 ? clamp(0, lo2, hi2) : (lo2 + hi2) / 2;
    if (Math.abs(wx) < eps && Math.abs(wy) < eps && r <= 1 + eps) break;
    const kx = -wx * out.distance * t * aspect, ky = -wy * out.distance * t / sp;
    out.target[0] += kx * R[0] + ky * fh[0];
    out.target[1] += kx * R[1] + ky * fh[1];
  }
  return out;
}

// Which side a docked panel covers (explain panel right, code panel left); none when both or neither do.
function panelSide(viewport) {
  const ins = viewport.insets || {};
  const l = (ins.left || 0) > 0, r = (ins.right || 0) > 0;
  return l === r ? 0 : r ? 1 : -1;
}

/**
 * Slide a shot (same distance) so that the focus sits inside the framing region and, where a side panel is docked,
 * the world does not run under it: the cut falls at the bare screen edge instead, as far as the focus allows.
 * Pure; returns a new shot.
 */
export function slideShot(shot, world, focus, viewport) {
  const side = panelSide(viewport);
  const hasWorld = validBounds(world), hasFocus = validBounds(focus);
  if (!hasFocus && !(side && hasWorld)) return shot;
  const { fit } = frameRegion(viewport);
  const aspect = viewport.width / viewport.height, t = Math.tan((shot.fov * RAD) / 2);
  const { R } = cameraBasis(shot.yaw, shot.pitch);
  const sp = Math.max(0.2, Math.sin(shot.pitch * RAD)), fh = [-Math.sin(shot.yaw * RAD), -Math.cos(shot.yaw * RAD)];
  const out = { ...shot, target: shot.target.slice() };
  let align = false;   // once the world is found running under the panel, its edge is pulled to the panel's (both ways)
  for (let it = 0; it < 6; it++) {
    let wx = 0, wy = 0;
    if (side && hasWorld) {
      const w = projectBounds(out, world, viewport);
      const d = side > 0 ? fit.xR - w.xMax : fit.xL - w.xMin;
      if (!align && (side > 0 ? d < 0 : d > 0)) align = true;
      if (align) wx = d;
    }
    if (hasFocus) {
      const f = projectBounds(out, focus, viewport);
      const lo = fit.xL - f.xMin, hi = fit.xR - f.xMax;
      wx = lo <= hi ? clamp(wx, lo, hi) : (lo + hi) / 2;
      const lo2 = fit.yLo - f.yMin, hi2 = fit.yHi - f.yMax;
      wy = lo2 <= hi2 ? clamp(0, lo2, hi2) : (lo2 + hi2) / 2;
    }
    if (Math.abs(wx) < 1e-5 && Math.abs(wy) < 1e-5) break;
    // content moves right (up) by w in NDC when the camera moves left (toward the viewer) by w * depth * tan
    const kx = -wx * out.distance * t * aspect, ky = -wy * out.distance * t / sp;
    out.target[0] += kx * R[0] + ky * fh[0];
    out.target[1] += kx * R[1] + ky * fh[1];
  }
  return out;
}

/**
 * Slide a shot (same distance) so that a world bigger than the frame fills it: no bare floor shows beyond the world's
 * edge on an axis the world overflows, and the world sits centred on an axis it fits, as far as keeping `focus` in the
 * framing region allows, and never by sliding the world under a docked side panel. Pure.
 */
export function fillShot(shot, world, focus, viewport) {
  if (!validBounds(world)) return shot;
  const floor = { ...world, maxZ: Math.min(world.maxZ ?? 0, SIZE.housing.h + 4) };   // solids, not the arcs over them
  const { fit } = frameRegion(viewport), side = panelSide(viewport);
  const aspect = viewport.width / viewport.height, t = Math.tan((shot.fov * RAD) / 2);
  const { R } = cameraBasis(shot.yaw, shot.pitch);
  const sp = Math.max(0.2, Math.sin(shot.pitch * RAD)), fh = [-Math.sin(shot.yaw * RAD), -Math.cos(shot.yaw * RAD)];
  const out = { ...shot, target: shot.target.slice() };
  // an axis the world overflows shows no bare floor beyond its edge; an axis it fits centres it in the free area
  const gap = (lo, hi, a, b) => (b - a < hi - lo ? (lo + hi - a - b) / 2 : a > lo ? lo - a : b < hi ? hi - b : 0);
  for (let it = 0; it < 6; it++) {
    const w = projectBounds(out, floor, viewport);
    let wx = gap(fit.xL, fit.xR, w.xMin, w.xMax), wy = gap(fit.yLo, fit.yHi, w.yMin, w.yMax);
    // filling never slides the world (arcs and all) under a docked side panel
    if (side) {
      const all = projectBounds(out, world, viewport);
      wx = side > 0 ? Math.min(wx, Math.max(0, fit.xR - all.xMax)) : Math.max(wx, Math.min(0, fit.xL - all.xMin));
    }
    if (validBounds(focus)) {
      const f = projectBounds(out, focus, viewport);
      wx = clamp(wx, Math.min(0, fit.xL - f.xMin), Math.max(0, fit.xR - f.xMax));
      wy = clamp(wy, Math.min(0, fit.yLo - f.yMin), Math.max(0, fit.yHi - f.yMax));
    }
    if (Math.abs(wx) < 1e-5 && Math.abs(wy) < 1e-5) break;
    const kx = -wx * out.distance * t * aspect, ky = -wy * out.distance * t / sp;
    out.target[0] += kx * R[0] + ky * fh[0];
    out.target[1] += kx * R[1] + ky * fh[1];
  }
  return out;
}

/** True when part of the world sits under a side panel in this shot. */
export function spillsUnderPanel(shot, world, viewport) {
  const side = panelSide(viewport);
  if (!side || !validBounds(world)) return false;
  const { fit } = frameRegion(viewport);
  const w = projectBounds(shot, world, viewport), eps = 1e-3;
  return side > 0 ? w.xMax > fit.xR + eps : w.xMin < fit.xL - eps;
}

/**
 * A shot that leaves part of the world under a docked side panel pulls back, at its angle, as little as clears it
 * (slid by slideShot, `focus` held in the free area); to the world shot when the whole world fits at a readable
 * size, except when presenting (viewport.presenting), where a projector's room is better spent close up. It pulls back no further than the world shot at `minZoom` (0: the whole world); a shot that cannot clear
 * the panel by then is kept. Pure.
 */
export function clearPanel(shot, box, world, focus, viewport, pad = 0, angle = {}, minZoom = minZoomFor(viewport)) {
  if (!validBounds(world) || !spillsUnderPanel(shot, world, viewport)) return shot;
  const ws = worldFrame(world, viewport, null, angle, minZoom);
  if (!viewport.presenting && pxPerUnitAt(frameBounds(world, viewport, { ...angle, maxZoom: Infinity }).distance, viewport.height) >= minZoomFor(viewport)) return ws;
  const far = Math.max(shot.distance, ws.distance);
  const at = (d) => slideShot(shotAt(box, viewport, d, pad, angle), world, focus, viewport);
  let best = at(far);
  if (!(far > shot.distance) || spillsUnderPanel(best, world, viewport)) return shot;
  let lo = shot.distance, hi = far;
  for (let i = 0; i < 12; i++) {
    const mid = Math.sqrt(lo * hi), s1 = at(mid);
    if (spillsUnderPanel(s1, world, viewport)) lo = mid; else { hi = mid; best = s1; }
  }
  return best;
}
const insetsMoved = (a = {}, b = {}, phone = false) => SIDES.some((k) => {
  const d = (b?.[k] || 0) - (a?.[k] || 0);
  return Math.abs(d) > (phone && d > 0 ? DIRECTOR.phoneInsetSlack : DIRECTOR.insetSlack);
});
const boundsKey = (b) => b ? `${b.minX},${b.minY},${b.maxX},${b.maxY},${b.minZ},${b.maxZ}` : "";

// ---------------------------------------------------------------- director

/**
 * @param {{ reducedMotion?: boolean, timeline?: { phases: {name:string, t0:number, t1?:number}[] } }} [opts]
 */
export function createDirector({ reducedMotion = false, timeline = null } = {}) {
  const cam = { target: [0, 0, 0], distance: 1000, yaw: CAMERA.yaw, pitch: CAMERA.pitch, fov: CAMERA.fov };
  const S = { tx: { x: 0, v: 0 }, ty: { x: 0, v: 0 }, tz: { x: 0, v: 0 }, ld: { x: Math.log(1000), v: 0 }, yaw: { x: CAMERA.yaw, v: 0 }, pitch: { x: CAMERA.pitch, v: 0 } };
  const goal = { target: [0, 0, 0], distance: 1000, yaw: CAMERA.yaw, pitch: CAMERA.pitch };   // the shot, without drift
  let viewport = { width: 1440, height: 900 };
  let auto = true, idle = 0, started = false, tl = timeline, rm = reducedMotion, snapNext = false;
  let plan = null, handoff = null;   // the shot plan (shots.mjs) and an ease back into it after a gesture or a reinset
  const planned = { target: [0, 0, 0] };
  let lens = CAMERA.fov;             // the planned shot's field of view (a scale shot widens it)
  let lastPhase, phaseT0 = 0, lastTime = 0, shotKind = "none", worldCache = { key: "", shot: null }, lastWorld = null;
  // boxes the shot must hold in the free area (keep()): an open pick's, and the keyboard's, which comes first
  const keeps = { pick: null, focus: null };
  let keepCache = { key: "", shot: null };

  function setGoal(shot) {
    goal.target[0] = shot.target[0]; goal.target[1] = shot.target[1]; goal.target[2] = shot.target[2];
    goal.distance = shot.distance; goal.yaw = shot.yaw; goal.pitch = shot.pitch;
  }

  const vpKey = () => viewport.width + "x" + viewport.height + JSON.stringify(viewport.insets || null) + (viewport.presenting ? "p" : "");
  let worldCacheF = { key: "", shot: null };   // the establishing shot also depends on the focus (too-wide worlds)
  function worldShot(world, focus = null) {
    const key = boundsKey(world) + "|" + vpKey() + "|" + boundsKey(focus);
    const c = focus ? worldCacheF : worldCache;
    if (c.key === key) return c.shot;
    const shot = worldFrame(world, viewport, focus);
    if (focus) worldCacheF = { key, shot }; else worldCache = { key, shot };
    return shot;
  }

  // The step's focus with some of the world around it, never wider than the world shot and never smaller than the
  // minimum size. Where a side panel is docked the shot slides (and, down to the world shot, pulls back) until no
  // part of the world sits under the panel. The last step's focus is the payoff: tight, large and legible.
  let focusCache = { key: "", shot: null };
  function focusShot(focus, world, payoff = false) {
    const key = boundsKey(focus) + "|" + boundsKey(world) + "|" + vpKey() + "|" + payoff;
    if (focusCache.key === key) return focusCache.shot;
    let shot;
    if (payoff) {
      shot = slideShot(frameBounds(focus, viewport, { pad: DIRECTOR.focusPad, maxZoom: DIRECTOR.payoffMaxZoom }), world, focus, viewport);
    } else {
      const ws = world ? worldShot(world) : null;
      const k = world ? DIRECTOR.context : 0;
      const box = k ? {
        minX: focus.minX + (world.minX - focus.minX) * k, maxX: focus.maxX + (world.maxX - focus.maxX) * k,
        minY: focus.minY + (world.minY - focus.minY) * k, maxY: focus.maxY + (world.maxY - focus.maxY) * k,
        minZ: focus.minZ ?? 0, maxZ: focus.maxZ ?? 0,
      } : focus;
      const wsZoom = ws ? pxPerUnitAt(ws.distance, viewport.height) : 0;
      shot = frameBounds(box, viewport, { pad: DIRECTOR.focusPad, maxZoom: Math.max(DIRECTOR.maxZoom, wsZoom), maxDistance: ws ? ws.distance : Infinity });
      // a context box too wide for the minimum size gives way to the focus itself at that size
      const minZoom = minZoomFor(viewport);
      if (pxPerUnitAt(shot.distance, viewport.height) < minZoom - 1e-9) shot = frameBounds(focus, viewport, { pad: DIRECTOR.focusPad, maxZoom: minZoom });
      shot = slideShot(shot, world, focus, viewport);
      if (world) shot = clearPanel(shot, box, world, focus, viewport, DIRECTOR.focusPad);
    }
    focusCache = { key, shot };
    return shot;
  }

  // Phase tracking runs every frame (also while the user drives) so a resume does not mistake an old change for a new one.
  function trackPhase(frame) {
    const time = frame.time ?? 0;
    if (!started || frame.phase !== lastPhase) { lastPhase = frame.phase; phaseT0 = time; }
    else if (time < phaseT0) phaseT0 = -Infinity;     // scrubbed back inside the same phase: no re-establishing
  }

  function establishing(frame, stateless) {
    const time = frame.time ?? 0;
    if (tl && Array.isArray(tl.phases)) {
      let t0 = 0;
      for (const p of tl.phases) if (p.t0 <= time + 1e-9) t0 = p.t0;
      return time - t0 < DIRECTOR.establish;
    }
    if (stateless) return time < DIRECTOR.establish;   // no timeline: a settled frame cannot know when its phase began
    return time - phaseT0 < DIRECTOR.establish;
  }

  // Keep the current shot unless the focus has left the dead zone, is near the frame edge, or needs a real zoom change.
  function needsReframe(focus, next) {
    const shot = { target: goal.target, distance: goal.distance, yaw: goal.yaw, pitch: goal.pitch, fov: CAMERA.fov };
    const { stage } = frameRegion(viewport);
    const e = projectBounds(shot, focus, viewport, DIRECTOR.focusPad);
    if (e.behind) return true;
    // the dead zone is measured from where the ideal shot would put the focus (not always the centre: shots slide)
    const n = projectBounds(next, focus, viewport, DIRECTOR.focusPad);
    const cx = (n.xMin + n.xMax) / 2, cy = (n.yMin + n.yMax) / 2, hx = (stage.xR - stage.xL) / 2, hy = (stage.yHi - stage.yLo) / 2;
    const mx = (e.xMin + e.xMax) / 2, my = (e.yMin + e.yMax) / 2, dz = MOTION.camera.deadZone;
    if (Math.abs(mx - cx) > dz * hx || Math.abs(my - cy) > dz * hy) return true;
    const { fit } = frameRegion(viewport, CAMERA.margin * DIRECTOR.safe);
    if (e.xMin < fit.xL || e.xMax > fit.xR || e.yMin < fit.yLo || e.yMax > fit.yHi) return true;
    const zoom = goal.distance / next.distance, h = 1 + MOTION.camera.zoomHysteresis;
    return zoom > h || zoom < 1 / h;
  }

  // The shot auto direction wants for this frame. `stateless` ignores hysteresis (settled capture).
  function chooseShot(frame, stateless) {
    if (validBounds(frame.world)) lastWorld = frame.world;
    const world = lastWorld;
    const focus = validBounds(frame.focus) ? frame.focus : null;
    // the run's last step frames its focus (the result) close and large: the payoff shot
    const steps = tl && Array.isArray(tl.steps) ? tl.steps.length : 0;
    if (focus && steps > 1 && frame.step === steps - 1) { shotKind = "payoff"; setGoal(focusShot(focus, world, true)); return; }
    if (establishing(frame, stateless) && world) { shotKind = "establish"; setGoal(worldShot(world, focus)); return; }
    if (validBounds(frame.focus)) {
      const next = focusShot(frame.focus, world);
      if (stateless || shotKind === "none" || shotKind === "manual" || shotKind === "payoff" || needsReframe(frame.focus, next)) { shotKind = "focus"; setGoal(next); }
      else if (shotKind === "establish") shotKind = "focus";   // the focus already sits well inside the world shot
      return;
    }
    if (world && (stateless || shotKind === "none" || shotKind === "manual" || shotKind === "payoff")) { shotKind = "establish"; setGoal(worldShot(world)); }
  }

  const yawGoal = (time) => goal.yaw + (auto && !rm ? drift(time) : 0);

  function snap(time) {
    S.tx.x = goal.target[0]; S.ty.x = goal.target[1]; S.tz.x = goal.target[2];
    S.ld.x = Math.log(goal.distance); S.yaw.x = yawGoal(time); S.pitch.x = goal.pitch;
    for (const k in S) S[k].v = 0;
  }

  function output() {
    cam.target[0] = S.tx.x; cam.target[1] = S.ty.x; cam.target[2] = S.tz.x;
    cam.distance = Math.exp(S.ld.x); cam.yaw = S.yaw.x; cam.pitch = S.pitch.x; cam.fov = auto ? lens : CAMERA.fov;
    return cam;
  }

  // The user grabs the camera where it is now (drift included), then moves it from there.
  function takeOver() {
    if (auto) {
      auto = false; shotKind = "manual";
      goal.target[0] = S.tx.x; goal.target[1] = S.ty.x; goal.target[2] = S.tz.x;
      goal.distance = Math.exp(S.ld.x); goal.yaw = S.yaw.x; goal.pitch = S.pitch.x;
    }
    idle = 0;
  }

  // ---- directing from the shot plan ----
  function planFor() {
    if (!tl || !Array.isArray(tl.steps) || !tl.steps.length) return null;
    const key = vpKey();
    if (!plan || plan.tl !== tl || plan.key !== key) plan = { ...planShots(tl, viewport, framer(viewport, tl.world)), tl, key };
    return plan;
  }
  // the camera where it is now, as a pose to ease from
  function beginHandoff() {
    handoff = { from: { target: [S.tx.x, S.ty.x, S.tz.x], distance: Math.exp(S.ld.x), yaw: S.yaw.x, pitch: S.pitch.x, fov: cam.fov }, t: 0 };
  }
  // Auto direction with a timeline: the planned shot at this playhead time, eased in after a handoff. False without a plan.
  function directed(frame, dt, cut) {
    const P = planFor();
    if (!P || !cameraAt(P, frame.time ?? 0, rm, planned)) return false;
    shotKind = planned.kind;
    let pose = planned;
    if (handoff && !cut && !rm) {
      handoff.t += dt;
      const u = Math.min(1, handoff.t / DIRECTOR.handoff);
      pose = blend(handoff.from, planned, easeInOut(u));
      if (u >= 1) handoff = null;
    } else handoff = null;
    setGoal(planned);
    S.tx.x = pose.target[0]; S.ty.x = pose.target[1]; S.tz.x = pose.target[2];
    S.ld.x = Math.log(pose.distance); S.yaw.x = pose.yaw; S.pitch.x = pose.pitch; lens = pose.fov ?? CAMERA.fov;
    for (const k in S) S[k].v = 0;
    return true;
  }

  // What to keep: the keyboard's thing, with an open pick's box as its context; else the pick's box, with its source.
  const kept = () => keeps.focus ? { box: keeps.focus.box, also: keeps.pick ? [keeps.pick.box] : [], seen: true } : keeps.pick;
  const keyOf = (k) => k ? [k.box, ...k.also].map(boundsKey).join(";") : "";

  // The shot that holds the kept box in the free area at this playhead time, or null when the planned shot already does.
  // Its context (`also`, tried in order) joins it when the planned shot holds both, or a shot of both is still readable:
  // at the readable size, or at no less than DIRECTOR.keepContext of the size the box alone gets. The keyboard's thing
  // only needs to be seen (inside the stage); a pick's candidates keep half the margin. Like a planned shot, a keep shot
  // leaves no part of the world under a side panel where it can help it.
  function keepShot(time) {
    const k = kept();
    const P = planFor();
    const base = P ? cameraAt(P, time, rm, { target: [0, 0, 0] }) : { ...goal, target: goal.target.slice(), fov: CAMERA.fov };
    const key = `${keyOf(k)}|${vpKey()}|${base.target.join()},${base.distance},${base.yaw},${base.pitch}`;
    if (keepCache.key === key) return keepCache.shot;
    const region = frameRegion(viewport, CAMERA.margin * DIRECTOR.safe), fit = k.seen ? region.stage : region.fit;
    const cam = { ...base, fov: base.fov ?? CAMERA.fov };
    const holds = (box) => { const e = projectBounds(cam, box, viewport); return !e.behind && e.xMin >= fit.xL && e.xMax <= fit.xR && e.yMin >= fit.yLo && e.yMax <= fit.yHi; };
    const maxZoom = Math.min(DIRECTOR.maxZoom, pxPerUnitAt(base.distance, viewport.height) * 1.25);
    const angle = { yaw: base.yaw, pitch: base.pitch }, world = tl?.world ?? lastWorld;
    const shotOf = (box) => clearPanel(slideShot(frameBounds(box, viewport, { ...angle, pad: DIRECTOR.focusPad, maxZoom }), world, box, viewport),
      box, world, box, viewport, DIRECTOR.focusPad, angle, 0);
    const zoomOf = (s) => pxPerUnitAt(s.distance, viewport.height);
    const alone = shotOf(k.box);
    const readable = Math.min(isPhone(viewport) ? DIRECTOR.phoneMinZoom : DIRECTOR.minZoom, zoomOf(alone) * DIRECTOR.keepContext);
    let shot;
    for (const also of k.also) {
      const box = union(k.box, also);
      if (holds(box)) { shot = null; break; }
      const s = shotOf(box);
      if (zoomOf(s) >= readable - 1e-9) { shot = s; break; }
    }
    if (shot === undefined) shot = holds(k.box) ? null : alone;
    keepCache = { key, shot };
    return shot;
  }

  const dir = {
    /**
     * @param {import("../contracts.mjs").Frame} frame
     * @param {{width:number, height:number, insets?:{top?:number,right?:number,bottom?:number,left?:number}}} vp CSS px
     * @param {number} dt seconds since the last update (wall clock)
     * @param {{settled?: boolean}} [opts] settled (alias settle): jump straight to this frame's shot, ignoring history (capture)
     * @returns {import("../contracts.mjs").Camera} reused object; copy it to keep it
     */
    update(frame, vp, dt = 1 / 60, opts = {}) {
      if (opts.settle && opts.settled === undefined) opts = { ...opts, settled: true };
      dt = Number.isFinite(dt) ? clamp(dt, 0, 1) : 0;
      // a new size cuts to the new framing; a HUD overlay that grows or shrinks noticeably reframes smoothly
      const valid = !!vp && vp.width > 0 && vp.height > 0;
      const resized = valid && (vp.width !== viewport.width || vp.height !== viewport.height);
      const reinset = valid && !resized && (insetsMoved(viewport.insets, vp.insets, isPhone(vp)) || !!vp.presenting !== !!viewport.presenting);
      if (resized || reinset) {
        viewport = { width: vp.width, height: vp.height, insets: vp.insets ? { ...vp.insets } : undefined, presenting: !!vp.presenting };
        if (shotKind !== "manual") shotKind = "none";
        if (reinset && auto && started) beginHandoff();
      }
      if (!auto) { idle += dt; if (idle >= DIRECTOR.resume) { auto = true; shotKind = "manual"; beginHandoff(); } }
      if (opts.settled && !auto) { auto = true; shotKind = "none"; }
      const time = frame?.time ?? lastTime;
      if (frame) trackPhase(frame);
      lastTime = time;
      const held = frame && auto && kept() ? keepShot(time) : null;
      if (held) {
        if (shotKind !== "keep") { shotKind = "keep"; handoff = null; }
        setGoal(held);
      } else {
        // let go, or the plan holds the kept box again: ease back into the plan from where the camera is
        if (shotKind === "keep" && auto && started) { shotKind = "none"; beginHandoff(); }
        if (frame && auto && directed(frame, dt, !!opts.settled || resized || snapNext || !started)) { snapNext = false; started = true; return output(); }
      }
      lens = CAMERA.fov;
      if (frame && auto && !held) chooseShot(frame, !!opts.settled);
      if (!started || opts.settled || rm || snapNext || resized) { snap(time); snapNext = false; }
      else {
        const w = auto ? MOTION.camera.omega : DIRECTOR.manualOmega;
        spring(S.tx, goal.target[0], w, dt); spring(S.ty, goal.target[1], w, dt); spring(S.tz, goal.target[2], w, dt);
        spring(S.ld, Math.log(goal.distance), w, dt); spring(S.yaw, yawGoal(time), w, dt); spring(S.pitch, goal.pitch, w, dt);
      }
      started = true;
      return output();
    },

    /** User orbit / zoom / pan / focus. dx, dy in CSS px; scale > 1 zooms in; x, y is the pointer (zoom anchor); focus takes bounds. */
    gesture({ type, dx = 0, dy = 0, scale = 1, x, y, bounds } = {}) {
      if (type === "focus") return dir.fit(bounds);
      takeOver();
      if (type === "orbit") {
        goal.yaw = clamp(goal.yaw - dx * DIRECTOR.orbitSpeed, CAMERA.yaw - CAMERA.yawRange, CAMERA.yaw + CAMERA.yawRange);
        goal.pitch = clamp(goal.pitch + dy * DIRECTOR.pitchSpeed, CAMERA.minPitch, CAMERA.maxPitch);
        S.yaw.x = goal.yaw; S.pitch.x = goal.pitch; S.yaw.v = S.pitch.v = 0;     // direct manipulation
      } else if (type === "zoom" && Number.isFinite(scale) && scale > 0) {
        const t = Math.tan((CAMERA.fov * RAD) / 2);
        const dMin = viewport.height / (2 * t * DIRECTOR.gestureMaxZoom);
        const dMax = lastWorld ? worldShot(lastWorld).distance * DIRECTOR.gestureMaxOut : Infinity;
        const before = { ...goal, fov: CAMERA.fov, target: goal.target.slice() };
        goal.distance = clamp(goal.distance / scale, dMin, dMax);
        if (Number.isFinite(x) && Number.isFinite(y)) {        // keep the floor point under the pointer still
          const p0 = unprojectPoint(before, x, y, viewport, goal.target[2]);
          const p1 = unprojectPoint({ ...goal, fov: CAMERA.fov }, x, y, viewport, goal.target[2]);
          if (p0 && p1) { goal.target[0] += p0[0] - p1[0]; goal.target[1] += p0[1] - p1[1]; }
        }
      } else if (type === "pan") {
        const ppu = pxPerUnitAt(Math.exp(S.ld.x), viewport.height);
        const { R } = cameraBasis(goal.yaw, goal.pitch);
        const fh = [-Math.sin(goal.yaw * RAD), -Math.cos(goal.yaw * RAD)];
        const along = dy / (ppu * Math.max(0.2, Math.sin(goal.pitch * RAD)));
        let nx = goal.target[0] - (R[0] * dx) / ppu + fh[0] * along;
        let ny = goal.target[1] - (R[1] * dx) / ppu + fh[1] * along;
        if (lastWorld) {           // never lose the scene
          const mx = (lastWorld.maxX - lastWorld.minX) * 0.25 + 100, my = (lastWorld.maxY - lastWorld.minY) * 0.25 + 100;
          nx = clamp(nx, lastWorld.minX - mx, lastWorld.maxX + mx); ny = clamp(ny, lastWorld.minY - my, lastWorld.maxY + my);
        }
        S.tx.x += nx - goal.target[0]; S.ty.x += ny - goal.target[1];
        goal.target[0] = nx; goal.target[1] = ny;
      }
      if (rm) snapNext = true;
      return dir;
    },

    /**
     * Frame these bounds now (F key). By default it holds them like a gesture and auto direction resumes after
     * DIRECTOR.resume s; hold: false frames them and stays in auto (e.g. after a recompile).
     */
    fit(bounds, { instant = false, hold = true } = {}) {
      if (!validBounds(bounds)) return dir;
      if (hold) takeOver(); else { auto = true; idle = 0; shotKind = "establish"; handoff = null; }
      setGoal(frameBounds(bounds, viewport, { maxZoom: DIRECTOR.maxZoom }));
      if (instant || rm) snapNext = true;
      return dir;
    },

    /**
     * Keep this box in the free area until keep(null): a pick's candidates (as "pick", the default) or the thing the
     * keyboard is on (as "focus", which comes first, with an open pick's box as its context). The camera eases to a
     * shot of it when the planned one does not show it, and eases back into the plan when let go. `also` boxes (the
     * pick's source) join it, the first that the plan or a shot at a readable size holds with it.
     */
    keep(bounds, { also = [], as = "pick" } = {}) {
      const next = validBounds(bounds) ? { box: { ...bounds }, also: also.filter(validBounds).map((b) => ({ ...b })) } : null;
      if (keyOf(next) === keyOf(keeps[as])) return dir;
      keeps[as] = next;
      if (rm) snapNext = true;
      return dir;
    },
    /** Hand the camera back to auto direction now. */
    resume() { if (!auto) { auto = true; shotKind = "manual"; beginHandoff(); } idle = 0; return dir; },
    /** Phase starts then come from tl.phases (exact, history-free establishing shots). Call after every compile. */
    setTimeline(t) { tl = t || null; return dir; },
    setReducedMotion(on) { rm = !!on; return dir; },
    reset() { started = false; auto = true; idle = 0; shotKind = "none"; lastPhase = undefined; plan = null; handoff = null; worldCache = { key: "", shot: null }; worldCacheF = { key: "", shot: null }; focusCache = { key: "", shot: null }; return dir; },

    get auto() { return auto; },
    get camera() { return cam; },
    /** Debug view: the goal shot, its kind, and seconds until auto direction resumes. */
    get state() {
      return { shot: shotKind, goal: { ...goal, target: goal.target.slice() }, auto, resumeIn: auto ? 0 : Math.max(0, DIRECTOR.resume - idle), viewport,
        plan: plan ? plan.keys.map((k) => ({ at: k.at, kind: k.kind, move: k.move })) : null };
    },
  };
  return dir;
}
