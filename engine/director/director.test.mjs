// Director tests: exact framing (checked with an independent lookAt projection), dead zone, zoom
// hysteresis, springs, drift, gestures, reduced motion, settled capture, establishing shots.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMERA, MOTION } from "../tokens.mjs";
import {
  createDirector, frameBounds, frameRegion, projectPoint, unprojectPoint, boxCorners, drift, DIRECTOR, pxPerUnitAt,
  projectBounds, worldFrame, slideShot, framer,
} from "./director.mjs";
import { planShots, cameraAt, SHOTS } from "./shots.mjs";

const RAD = Math.PI / 180;
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };

// Independent projection: eye from the documented convention, basis from a lookAt with z up.
// The world is left-handed (x right, y toward the viewer, z up), so right = up x forward.
function lookAtProject(cam, p, aspect) {
  const y = cam.yaw * RAD, pt = cam.pitch * RAD;
  const eye = [cam.target[0] + cam.distance * Math.sin(y) * Math.cos(pt), cam.target[1] + cam.distance * Math.cos(y) * Math.cos(pt), cam.target[2] + cam.distance * Math.sin(pt)];
  const f = norm(sub(cam.target, eye));
  const r = norm(cross([0, 0, 1], f));
  const u = cross(f, r);
  const v = sub(p, eye), z = dot(v, f), t = Math.tan((cam.fov * RAD) / 2);
  return [dot(v, r) / (z * t * aspect), dot(v, u) / (z * t), z];
}

// Small deterministic PRNG for property tests.
function prng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

const SIZES = [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 1080, height: 1920 }, { width: 1920, height: 1080 }, { width: 1080, height: 1080 }];

function extent(cam, b, vp, pad = 0) {
  const aspect = vp.width / vp.height;
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const c of boxCorners(b, pad)) {
    const [x, y, z] = lookAtProject(cam, c, aspect);
    assert.ok(z > 0, "corner in front of the eye");
    xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
  }
  return { xMin, xMax, yMin, yMax };
}

test("frameBounds fits the eight corners exactly inside the margin (independent projection)", () => {
  const rnd = prng(7);
  for (let n = 0; n < 400; n++) {
    const vp = SIZES[n % SIZES.length];
    const w = 20 + rnd() * 1600, d = 20 + rnd() * 900, x0 = (rnd() - 0.5) * 2000, y0 = (rnd() - 0.5) * 2000;
    const b = { minX: x0, maxX: x0 + w, minY: y0, maxY: y0 + d };
    if (n % 3 === 0) { b.minZ = rnd() * 10; b.maxZ = b.minZ + rnd() * 120; }
    const yaw = (rnd() - 0.5) * 2 * CAMERA.yawRange, pitch = CAMERA.minPitch + rnd() * (CAMERA.maxPitch - CAMERA.minPitch);
    const cam = frameBounds(b, vp, { yaw, pitch, maxZoom: Infinity });
    const { fit } = frameRegion(vp);
    const e = extent(cam, b, vp);
    const eps = 1e-7;
    assert.ok(e.xMin >= fit.xL - eps && e.xMax <= fit.xR + eps, `x inside (${n})`);
    assert.ok(e.yMin >= fit.yLo - eps && e.yMax <= fit.yHi + eps, `y inside (${n})`);
    const tightX = Math.abs(e.xMin - fit.xL) < 1e-6 && Math.abs(e.xMax - fit.xR) < 1e-6;
    const tightY = Math.abs(e.yMin - fit.yLo) < 1e-6 && Math.abs(e.yMax - fit.yHi) < 1e-6;
    assert.ok(tightX || tightY, `tight on one axis (${n})`);
    assert.ok(Math.abs((e.xMin + e.xMax) / 2 - (fit.xL + fit.xR) / 2) < 1e-6, `centred in x (${n})`);
    assert.ok(Math.abs((e.yMin + e.yMax) / 2 - (fit.yLo + fit.yHi) / 2) < 1e-6, `centred in y (${n})`);
    assert.equal(cam.fit, 1);
  }
});

test("projectPoint agrees with the independent projection", () => {
  const cam = { target: [120, -40, 10], distance: 1700, yaw: 17, pitch: 61, fov: CAMERA.fov };
  for (const p of [[0, 0, 0], [400, 300, 20], [-800, -100, 60]]) {
    const a = projectPoint(cam, p, 1.6), b = lookAtProject(cam, p, 1.6);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-9);
  }
});

test("margin is a fraction of the shorter side; HUD insets shrink and shift the region", () => {
  const vp = { width: 1440, height: 900 };
  const { fit, marginPx } = frameRegion(vp);
  assert.equal(marginPx, CAMERA.margin * 900);
  assert.ok(Math.abs(fit.yHi - (1 - (2 * marginPx) / 900)) < 1e-12);
  // the HUD at 1440x900: ~132 px on top, ~230 px at the bottom
  const withInsets = { ...vp, insets: { top: 132, right: 0, bottom: 230, left: 0 } };
  const r = frameRegion(withInsets).fit, gap = marginPx * DIRECTOR.hudGap;
  assert.ok(Math.abs(r.yHi - (1 - (2 * (132 + gap)) / 900)) < 1e-12, "top edge sits a gap below the top overlay");
  assert.ok(Math.abs(r.yLo - (1 - (2 * (900 - 230 - gap)) / 900)) < 1e-12, "bottom edge sits a gap above the bottom overlay");
  assert.ok(Math.abs(r.xL - (2 * marginPx / 1440 - 1)) < 1e-12, "uncovered sides keep the margin");
  const b = { minX: -400, maxX: 400, minY: -150, maxY: 150 };
  const cam = frameBounds(b, withInsets, { maxZoom: Infinity });
  const e = extent(cam, b, withInsets);
  assert.ok(e.yMin >= r.yLo - 1e-7 && e.yMax <= r.yHi + 1e-7);
  assert.ok(Math.abs((e.yMin + e.yMax) / 2 - (r.yLo + r.yHi) / 2) < 1e-6, "projected centre shifts to the free rectangle");
  assert.ok((r.yLo + r.yHi) / 2 > 0.05, "the free rectangle's centre is above the screen centre");
});

test("HUD inset changes reframe smoothly; small ones are ignored; a resize cuts", () => {
  const dir = createDirector({ timeline: { phases: [{ name: "Map", t0: 0 }] } });
  const f = { minX: -300, maxX: 300, minY: -120, maxY: 120 };
  const vp = (bottom) => ({ width: 1440, height: 900, insets: { top: 132, bottom, left: 0, right: 0 } });
  dir.update(frame(5, f), vp(230), 1 / 60);
  const g0 = dir.state.goal, c0 = { ...dir.camera, target: dir.camera.target.slice() };
  dir.update(frame(5, f), vp(240), 1 / 60);
  assert.ok(sameShot(dir.state.goal, g0), "10 px change keeps the shot");
  dir.update(frame(5, f), vp(320), 1 / 60);
  assert.ok(!sameShot(dir.state.goal, g0), "90 px change reframes");
  assert.ok(sameShot(dir.camera, c0, 1e-2), "...without a cut");
  dir.update(frame(5, f), { ...vp(320), width: 1000 }, 1 / 60);
  assert.ok(sameShot(dir.camera, dir.state.goal), "a resize cuts");
});

test("focus gesture frames the given bounds and holds them", () => {
  const dir = settledOnFocus({ minX: -100, maxX: 100, minY: -60, maxY: 60 });
  const tile = { minX: 300, maxX: 326, minY: 40, maxY: 66, minZ: 0, maxZ: 5 };
  dir.gesture({ type: "focus", bounds: tile });
  assert.equal(dir.auto, false);
  assert.ok(sameShot(dir.state.goal, frameBounds(tile, VP)));
});

test("settled without a timeline is stateless across phase changes", () => {
  const f = { minX: 100, maxX: 300, minY: -60, maxY: 60 };
  const a = createDirector(), b = createDirector();
  a.update(frame(30, f, "Reduce"), VP, 0, { settled: true });
  a.update(frame(12, f, "Map"), VP, 0, { settled: true });
  const ca = { ...a.update(frame(20, f, "Shuffle"), VP, 0, { settled: true }) };
  const cb = { ...b.update(frame(20, f, "Shuffle"), VP, 0, { settled: true }) };
  assert.deepEqual(ca, cb);
  assert.equal(a.state.shot, "focus", "a phase change seen only in settled frames does not force the establishing shot");
});

test("maxZoom stops the push-in on small things and keeps them centred", () => {
  const vp = { width: 1440, height: 900 };
  const tile = { minX: 300, maxX: 326, minY: 40, maxY: 66, minZ: 0, maxZ: 5 };
  const cam = frameBounds(tile, vp, { maxZoom: 2 });
  assert.ok(Math.abs(pxPerUnitAt(cam.distance, vp.height) - 2) < 1e-9);
  assert.ok(cam.fit < 0.2);
  const e = extent(cam, tile, vp);
  assert.ok(Math.abs((e.xMin + e.xMax) / 2) < 1e-6);
});

const WORLD = { minX: -560, maxX: 560, minY: -220, maxY: 220 };
const VP = { width: 1440, height: 900 };
const frame = (time, focus, phase = "Map", extra = {}) => ({ time, phase, step: 0, focus, world: WORLD, ...extra });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps * Math.max(1, Math.abs(b));
const sameShot = (a, b, eps) => near(a.distance, b.distance, eps) && a.target.every((x, i) => Math.abs(x - b.target[i]) < (eps ?? 1e-6) * 1000);

test("starts on the establishing shot of the world, then pushes in on the focus", () => {
  const dir = createDirector({ reducedMotion: true });
  const f = { minX: -500, maxX: -380, minY: -80, maxY: 0 };
  const c0 = { ...dir.update(frame(0, f), VP, 1 / 60) };
  assert.equal(dir.state.shot, "establish");
  assert.ok(sameShot(c0, frameBounds(WORLD, VP)));
  dir.update(frame(DIRECTOR.establish + 0.1, f), VP, 1 / 60);
  assert.equal(dir.state.shot, "focus");
  assert.ok(dir.camera.distance < c0.distance * 0.8);
});

test("phase change returns to the establishing shot (history and timeline modes)", () => {
  const f = { minX: -500, maxX: -380, minY: -80, maxY: 0 };
  for (const tl of [null, { phases: [{ name: "Map", t0: 0 }, { name: "Shuffle", t0: 20 }] }]) {
    const dir = createDirector({ reducedMotion: true, timeline: tl });
    dir.update(frame(0, f), VP); dir.update(frame(10, f), VP);
    assert.equal(dir.state.shot, "focus");
    dir.update(frame(20, f, "Shuffle"), VP);
    assert.equal(dir.state.shot, "establish");
    dir.update(frame(20 + DIRECTOR.establish + 0.01, f, "Shuffle"), VP);
    assert.equal(dir.state.shot, "focus");
  }
});

function settledOnFocus(f) {
  const dir = createDirector({ reducedMotion: true });
  dir.update(frame(0, f), VP); dir.update(frame(5, f), VP);
  return dir;
}

test("dead zone: small focus moves keep the shot, leaving the central region reframes", () => {
  const f = { minX: -100, maxX: 100, minY: -60, maxY: 60 };
  const dir = settledOnFocus(f);
  const g0 = dir.state.goal;
  dir.update(frame(6, { ...f, minX: f.minX + 30, maxX: f.maxX + 30 }), VP);
  assert.ok(sameShot(dir.state.goal, g0), "small move keeps the shot");
  dir.update(frame(7, { ...f, minX: f.minX + 420, maxX: f.maxX + 420 }), VP);
  assert.ok(!sameShot(dir.state.goal, g0), "big move reframes");
});

test("zoom hysteresis: < 22 % size change keeps the shot, more reframes", () => {
  const f = { minX: -400, maxX: 400, minY: -200, maxY: 200 };   // big enough that maxZoom does not clamp
  const grow = (k) => ({ minX: f.minX * k, maxX: f.maxX * k, minY: f.minY * k, maxY: f.maxY * k });
  let dir = settledOnFocus(f);
  let g0 = dir.state.goal;
  dir.update(frame(6, grow(0.9)), VP);
  assert.ok(sameShot(dir.state.goal, g0), "10 % smaller keeps");
  // a focus shot keeps DIRECTOR.context of the world around it, so the box must change more than the hysteresis
  dir.update(frame(7, grow(0.4)), VP);
  assert.ok(dir.state.goal.distance < g0.distance / (1 + MOTION.camera.zoomHysteresis), "60 % smaller pushes in");
  dir = settledOnFocus(grow(0.4)); g0 = dir.state.goal;
  dir.update(frame(6, f), VP);
  assert.ok(dir.state.goal.distance > g0.distance * 1.2, "much bigger pulls out");
});

test("springs are critically damped (no overshoot) and frame-rate independent", () => {
  const near0 = { minX: -520, maxX: -400, minY: -80, maxY: 20 };
  const run = (fps, secs) => {
    const dir = createDirector();
    dir.update(frame(0, near0), VP, 0);
    const d0 = dir.camera.distance;
    const ds = [];
    for (let i = 1; i <= fps * secs; i++) { dir.update(frame(DIRECTOR.establish + 0.05, near0), VP, 1 / fps); ds.push(dir.camera.distance); }
    return { d0, ds, goal: dir.state.goal.distance, cam: { ...dir.camera, target: dir.camera.target.slice() } };
  };
  const a = run(60, 3), b = run(30, 3), c = run(144, 3);
  for (let i = 1; i < a.ds.length; i++) assert.ok(a.ds[i] <= a.ds[i - 1] + 1e-9, "monotone approach");
  assert.ok(a.ds.every((d) => d >= a.goal - 1e-6), "never overshoots");
  assert.ok(Math.abs(a.cam.distance - b.cam.distance) < 1e-6 * a.cam.distance);
  assert.ok(Math.abs(a.cam.distance - c.cam.distance) < 1e-6 * a.cam.distance);
  // omega 3: within 2 % of the goal (in log distance) after 2 s
  const at2 = a.ds[119];
  assert.ok(Math.abs(Math.log(at2 / a.goal)) < 0.02 * Math.abs(Math.log(a.d0 / a.goal)));
});

test("idle drift: bounded, slow, deterministic; none with reduced motion", () => {
  let max = 0, maxRate = 0;
  for (let t = 0; t < 200; t += 0.05) { max = Math.max(max, Math.abs(drift(t))); maxRate = Math.max(maxRate, Math.abs(drift(t + 0.05) - drift(t)) / 0.05); }
  assert.ok(max <= CAMERA.drift + 1e-9 && max > CAMERA.drift * 0.7);
  assert.ok(maxRate < 1, "less than a degree per second");
  const f = { minX: -100, maxX: 100, minY: -60, maxY: 60 };
  const a = createDirector(), b = createDirector();
  a.update(frame(13.7, f), VP, 0, { settled: true }); b.update(frame(13.7, f), VP, 0, { settled: true });
  assert.equal(a.camera.yaw, b.camera.yaw);
  assert.ok(Math.abs(a.camera.yaw - (CAMERA.yaw + drift(13.7))) < 1e-12);
  const r = createDirector({ reducedMotion: true });
  r.update(frame(13.7, f), VP, 0);
  assert.equal(r.camera.yaw, CAMERA.yaw);
});

test("reduced motion cuts to the new shot instead of flying", () => {
  const f = { minX: -100, maxX: 100, minY: -60, maxY: 60 };
  const dir = settledOnFocus(f);
  dir.update(frame(6, { minX: 300, maxX: 500, minY: 100, maxY: 200 }), VP, 1 / 60);
  assert.ok(sameShot(dir.camera, dir.state.goal));
});

test("settled mode is stateless: same frame, same camera, whatever came before", () => {
  const tl = { phases: [{ name: "Map", t0: 0 }, { name: "Shuffle", t0: 30 }] };
  const f = { minX: 100, maxX: 300, minY: -60, maxY: 60 };
  const a = createDirector({ timeline: tl }), b = createDirector({ timeline: tl });
  for (let i = 0; i < 50; i++) a.update(frame(i * 0.3, { minX: -500 + i * 3, maxX: -300 + i * 3, minY: 0, maxY: 80 }), VP, 1 / 60);
  a.gesture({ type: "orbit", dx: 80, dy: 20 });
  const ca = { ...a.update(frame(22, f), VP, 1 / 60, { settled: true }) };
  const cb = { ...b.update(frame(22, f), VP, 1 / 60, { settled: true }) };
  assert.deepEqual(ca, cb);
  assert.equal(a.auto, true);
});

test("orbit gestures take over within limits; auto resumes 4 s after the last gesture", () => {
  const f = { minX: -100, maxX: 100, minY: -60, maxY: 60 };
  const dir = settledOnFocus(f);
  dir.gesture({ type: "orbit", dx: -10000, dy: 10000 });
  assert.equal(dir.auto, false);
  assert.equal(dir.camera.yaw, CAMERA.yaw); // camera object updates on the next update()
  dir.update(frame(6, f), VP, 1 / 60);
  assert.ok(Math.abs(dir.camera.yaw - (CAMERA.yaw + CAMERA.yawRange)) < 1e-9);
  assert.ok(Math.abs(dir.camera.pitch - CAMERA.maxPitch) < 1e-9);
  dir.gesture({ type: "orbit", dx: 1e5, dy: -1e5 });
  dir.update(frame(6, f), VP, 1 / 60);
  assert.ok(Math.abs(dir.camera.yaw - (CAMERA.yaw - CAMERA.yawRange)) < 1e-9);
  assert.ok(Math.abs(dir.camera.pitch - CAMERA.minPitch) < 1e-9);
  for (let i = 0; i < 60 * 3.9; i++) dir.update(frame(6, f), VP, 1 / 60);
  assert.equal(dir.auto, false, "still manual at 3.9 s");
  for (let i = 0; i < 12; i++) dir.update(frame(6, f), VP, 1 / 60);
  assert.equal(dir.auto, true, "auto after 4 s");
  assert.equal(dir.state.goal.yaw, CAMERA.yaw);
  assert.equal(dir.state.goal.pitch, CAMERA.pitch);
});

test("zoom gesture keeps the floor point under the pointer; pan follows the pointer", () => {
  const f = { minX: -200, maxX: 200, minY: -100, maxY: 100 };
  const dir = settledOnFocus(f);
  const px = 1000, py = 300;
  const before = unprojectPoint({ ...dir.camera, target: dir.camera.target.slice() }, px, py, VP, dir.camera.target[2]);
  dir.gesture({ type: "zoom", scale: 1.25, x: px, y: py });
  for (let i = 0; i < 120; i++) dir.update(frame(6, f), VP, 1 / 60);
  const after = unprojectPoint(dir.camera, px, py, VP, dir.camera.target[2]);
  assert.ok(Math.hypot(after[0] - before[0], after[1] - before[1]) < 0.5, "anchor stays put");

  const p0 = unprojectPoint({ ...dir.camera, target: dir.camera.target.slice() }, 720, 450, VP, dir.camera.target[2]);
  dir.gesture({ type: "pan", dx: 40, dy: 25 });
  dir.update(frame(6, f), VP, 1 / 60);
  const p1 = unprojectPoint(dir.camera, 760, 475, VP, dir.camera.target[2]);
  assert.ok(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1.5, "the grabbed point follows the pointer");
});

test("fit frames the given bounds (instant) and holds them like a gesture", () => {
  const f = { minX: -100, maxX: 100, minY: -60, maxY: 60 };
  const dir = settledOnFocus(f);
  dir.fit(WORLD, { instant: true });
  dir.update(frame(6, f), VP, 1 / 60);
  assert.ok(sameShot(dir.camera, frameBounds(WORLD, VP)));
  assert.equal(dir.auto, false);
});

test("resizing reframes for the new aspect without a flight", () => {
  const dir = createDirector();
  dir.update(frame(0, null), VP);
  dir.update(frame(0.1, null), { width: 390, height: 844 });
  assert.ok(sameShot(dir.camera, frameBounds(WORLD, { width: 390, height: 844 })));
});

// ---- never cover the world, never shrink it to fit the chrome (UX review C2) ----
const PANEL = { width: 1440, height: 900, insets: { top: 60, right: 344, bottom: 94, left: 0 } };
const zoomOf = (cam, vp) => pxPerUnitAt(cam.distance, vp.height);
const inside = (cam, b, vp, eps = 1e-6) => {
  const { fit } = frameRegion(vp), e = projectBounds(cam, b, vp);
  return e.xMin >= fit.xL - eps && e.xMax <= fit.xR + eps && e.yMin >= fit.yLo - eps && e.yMax <= fit.yHi + eps;
};

test("a world too wide for the free area is framed at the minimum size, holding the focus, cut at the bare edge", () => {
  const wide = { minX: -800, maxX: 800, minY: -200, maxY: 200 };
  const focus = { minX: 300, maxX: 420, minY: -40, maxY: 40 };
  const fit = frameBounds(wide, PANEL, { maxZoom: Infinity });
  assert.ok(zoomOf(fit, PANEL) < DIRECTOR.minZoom, "the fit would shrink it");
  const shot = worldFrame(wide, PANEL, focus);
  assert.ok(Math.abs(zoomOf(shot, PANEL) - DIRECTOR.minZoom) < 1e-9, "held at the minimum");
  assert.ok(inside(shot, focus, PANEL), "the focus is in the free area");
  const { fit: r } = frameRegion(PANEL), w = projectBounds(shot, wide, PANEL);
  assert.ok(Math.abs(w.xMax - r.xR) < 1e-3, "the world ends at the panel's edge: nothing under the panel");
  assert.ok(w.xMin < r.xL, "the cut falls at the bare left edge");
  // phones keep fitting the board width first
  const phone = { width: 390, height: 844 };
  assert.ok(zoomOf(worldFrame(wide, phone), phone) < DIRECTOR.minZoom);
});

test("a focus the panel side can't reach keeps the focus, even if the world must run under the panel", () => {
  const wide = { minX: -800, maxX: 800, minY: -200, maxY: 200 };
  const focus = { minX: -780, maxX: -660, minY: -40, maxY: 40 };
  const shot = slideShot(worldFrame(wide, PANEL), wide, focus, PANEL);
  assert.ok(inside(shot, focus, PANEL));
});

test("with a docked panel, a close-up that would leave the world under it shows the whole world when it fits", () => {
  const W = { minX: -480, maxX: 480, minY: -200, maxY: 200 };
  const left = { minX: -460, maxX: -330, minY: -60, maxY: 20 };
  const tl = { phases: [{ name: "Map", t0: 0, step: 0 }], world: W, steps: [0, 1, 2, 3].map((i) => ({ t0: 2 * i, dur: 2 })),
    _: { focusByStep: [W, left, left, left] } };
  const dir = createDirector({ reducedMotion: true, timeline: tl });
  const fr = (t, focus) => ({ time: t, phase: "Map", step: 1, focus, world: W });
  dir.update(fr(DIRECTOR.establish + 1, left), PANEL, 0, { settled: true });
  const cam = { ...dir.camera, target: dir.camera.target.slice() };
  assert.ok(zoomOf(frameBounds(W, PANEL, { maxZoom: Infinity }), PANEL) >= DIRECTOR.minZoom, "the world fits at a readable size");
  const { fit: r } = frameRegion(PANEL), w = projectBounds(cam, W, PANEL);
  assert.ok(w.xMax <= r.xR + 1e-3, "no part of the world is under the panel");
  assert.ok(inside(cam, left, PANEL), "and the focus is in view");
  // without the panel the same step gets its close-up
  const d2 = createDirector({ reducedMotion: true, timeline: tl });
  d2.update(fr(DIRECTOR.establish + 1, left), { width: 1440, height: 900, insets: { top: 60, bottom: 94 } }, 0, { settled: true });
  assert.ok(d2.camera.distance < cam.distance * 0.9);
});

test("a small board fills a fair share of the free area instead of sitting tiny", () => {
  const array = { minX: -144, maxX: 144, minY: -53, maxY: 53 };
  const shot = worldFrame(array, PANEL);
  const { fit: r } = frameRegion(PANEL), e = projectBounds(shot, array, PANEL);
  // the fill is solved on the zoom, so perspective leaves it within a few per cent of the target
  assert.ok((e.xMax - e.xMin) / (r.xR - r.xL) >= DIRECTOR.fill * 0.95, `fills ${((e.xMax - e.xMin) / (r.xR - r.xL)).toFixed(2)}`);
  assert.ok(zoomOf(shot, PANEL) > DIRECTOR.maxZoom && zoomOf(shot, PANEL) <= DIRECTOR.smallMaxZoom + 1e-9);
});

test("the last step frames its focus close and large: the payoff", () => {
  const out = { minX: 380, maxX: 540, minY: -90, maxY: 90, minZ: 0, maxZ: 20 };
  // a compiled timeline's shape: the planner reads steps' times, phases' first steps, the world and each step's focus
  const tl = { phases: [{ name: "Map", t0: 0, step: 0 }, { name: "Output", t0: 30, step: 2 }], world: WORLD,
    steps: [{ t0: 0, dur: 10 }, { t0: 10, dur: 20 }, { t0: 30, dur: 5 }], _: { focusByStep: [WORLD, WORLD, out] } };
  const dir = createDirector({ reducedMotion: true, timeline: tl });
  dir.update({ time: 31, phase: "Output", step: 2, focus: out, world: WORLD }, PANEL, 0, { settled: true });
  assert.equal(dir.state.shot, "payoff");
  assert.ok(inside(dir.camera, out, PANEL));
  assert.ok(zoomOf(dir.camera, PANEL) > 1.5 * zoomOf(frameBounds(WORLD, PANEL), PANEL), "much closer than the world shot");
  dir.update({ time: 29, phase: "Map", step: 1, focus: out, world: WORLD }, PANEL, 0, { settled: true });
  assert.notEqual(dir.state.shot, "payoff");
});

test("a key step's detail shot pushes in only as far as keeps the step's focus (a whole cluster) in frame", () => {
  // raft-like: the step focuses the whole ring; the lesson's look ids are two servers on one side of it
  const ring = { minX: -200, maxX: 200, minY: -160, maxY: 160, minZ: 0, maxZ: 20 };
  const look = { minX: 120, maxX: 200, minY: -40, maxY: 40, minZ: 0, maxZ: 20 };
  const fr = framer(PANEL, WORLD);
  const shot = fr.fit(look, { pitch: 50, yaw: 0 }, { zoom: fr.detailZoom, focus: look, hold: { box: ring, points: [] } });
  assert.ok(inside(shot, ring, PANEL, 1e-3), "the whole ring stays in the free area");
  assert.ok(fr.holds(shot, { box: ring }));
});

test("at a step boundary the camera sets off early, through a shot that holds both steps' focus", () => {
  // a phone, two far-apart things: one shot cannot hold both at a readable size, so each step's shot is its own
  const PHONE = { width: 390, height: 844, insets: { top: 92, right: 0, bottom: 282, left: 0 } };
  const a = { minX: -520, maxX: -400, minY: -60, maxY: 60, minZ: 0, maxZ: 20 }, b = { minX: 400, maxX: 520, minY: -60, maxY: 60, minZ: 0, maxZ: 20 };
  const world = { minX: -560, maxX: 560, minY: -100, maxY: 100, minZ: 0, maxZ: 20 };
  const tl = { phases: [{ name: "One", t0: 0, step: 0 }], world,
    steps: [0, 1, 2, 3].map((i) => ({ index: i, t0: 5 * i, t1: 5 * i + 5, dur: 5 })), _: { focusByStep: [a, a, b, b] } };
  const plan = planShots(tl, PHONE, framer(PHONE, world));
  const bridge = plan.keys.find((k) => k.kind === "bridge");
  assert.ok(bridge && bridge.at < 10 && bridge.at >= 10 - SHOTS.bridge - 1e-9 && Math.abs(bridge.at + bridge.move - 10) < 1e-9, JSON.stringify(plan.keys.map((k) => [k.at, k.kind])));
  // every 0.05 s across the boundary, the focus of the step on screen is inside the frame
  const inFrame = (cam, f) => { const e = projectBounds(cam, f, PHONE); return !e.behind && e.xMin >= -1 && e.xMax <= 1 && e.yMin >= -1 && e.yMax <= 1; };
  for (let t = 8; t < 13; t += 0.05) assert.ok(inFrame(cameraAt(plan, t), t < 10 ? a : b), `t = ${t.toFixed(2)}`);
  // reduced motion has no moves to bridge: it holds the old shot up to the step, then cuts to the new one
  for (let t = 8; t < 13; t += 0.05) assert.ok(inFrame(cameraAt(plan, t, true), t < 10 ? a : b), `reduced, t = ${t.toFixed(2)}`);
  assert.deepEqual(cameraAt(plan, 9.9, true).target, cameraAt(plan, 9, true).target);
});
