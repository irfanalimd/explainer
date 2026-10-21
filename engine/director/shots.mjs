// Shot planning: the director's script. From a compiled timeline and the viewport it writes a list of keyframes,
// each a shot (target, distance, yaw, pitch) the camera moves to from time `at` over `move` seconds. The camera at
// any playhead time is a function of that time alone (cameraAt), so playing, scrubbing, stepping and capture agree.
//
// The vocabulary, per chapter:
//   establish  the chapter opens on the whole world, from the chapter's own angle, and holds while the entry reads
//   push       the chapter's stage: everything its steps touch, framed to fill the free area
//   detail     a key step's look ids (the lesson's strongest signal), where they start and where they land, close
//   pull       the chapter's last step pulls back to the whole world (phones: to the stage), its result in view at the recap
//   payoff     the run's last step (before any scale shot) frames the answer close and large
//   scale      s.scale: a tracking shot that follows the reveal box from the answer out to the whole field
//   bridge     just before a step whose focus the shot on screen does not hold: both steps' focus, so neither leaves
//              the frame at the boundary (every shot holds its own step's focus and tags)
// Moves are eased in and out and never shorter than DIRECTOR.move[0]; a shot close to the current one is not taken,
// so the camera rests while the reader reads. Reduced motion cuts.
import { CAMERA } from "../tokens.mjs";
import { easeInOut } from "../scene/transitions.mjs";
import { revealAt, revealBox, SCALE } from "../scene/scale.mjs";

const RAD = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;

export const SHOTS = {
  move: [1.1, 2.4],        // s, shortest and longest camera move
  movePerOctave: 0.55,     // s added per doubling or halving of the distance
  settle: 0.35,            // s a move leaves before the next keyframe, so a step ends on a still frame
  establishHold: 0.42,     // share of a chapter's first step the establishing shot holds (at most DIRECTOR.establish)
  rest: { pan: 0.07, zoom: 1.14, angle: 1.5 },   // a new shot closer than this to the current one is not taken
  bridge: 0.7,             // s before a step the camera may set off, when its shot does not cover the step's focus
  // angles, degrees: pitch per shot kind; each chapter turns the world a little, alternating sides
  pitch: { establish: 60, push: 56, pull: 58, detail: 50, payoff: 52 },
  yaw: { chapter: 4.5, detail: 0.6 },              // detail keeps this share of the chapter's yaw
  context: { push: 0.12, pull: 0.32, detail: 0.08 }, // how far a shot's box grows toward the world box
  scale: { pitch: 40, yaw: -12, fov: 30 },           // the scale shot's crane: final pitch and lens, and the turn on the way
};

/**
 * @param {object} tl         compiled timeline (engine/scene/timeline.mjs)
 * @param {object} viewport   { width, height, insets } css px
 * @param {object} frame      framing functions from director.mjs: { wide(box, angle), pull(box, angle, focus, hold), fit(box, angle, opts), holds(shot, hold), detailZoom }
 * @returns {{ keys: object[], key: string }}
 */
export function planShots(tl, viewport, frame) {
  const steps = tl.steps ?? [], world = tl.world;
  const focus = tl._?.focusByStep ?? [];
  const scaleAt = new Map((tl.scales ?? []).map((s) => [s.step, s]));
  const { looks, tags } = marksOf(tl);

  // chapters: their steps and stage (everything their steps touch or look at)
  const chapters = (tl.phases ?? []).map((p, k) => {
    const next = tl.phases[k + 1]?.step ?? steps.length;
    let stage = null;
    for (let i = p.step; i < next; i++) if (!scaleAt.has(i)) stage = union(union(stage, focus[i]), looks[i]);
    return { from: p.step, to: next - 1, stage: stage ?? world, yaw: (k % 2 ? 1 : -1) * SHOTS.yaw.chapter };
  });
  const chapterOf = (i) => chapters.find((c) => i >= c.from && i <= c.to) ?? { from: 0, to: steps.length - 1, stage: world, yaw: 0 };
  const lastRun = (() => { let i = steps.length - 1; while (i > 0 && scaleAt.has(i)) i--; return i; })();

  const keys = [];
  // a shot close to the current one is not taken, unless the current one leaves the step's focus or tags out
  let step = 0;
  const add = (at, kind, shot, o = {}, hold = null) => {
    const prev = keys[keys.length - 1];
    if (prev && !o.force && !prev.track && !shot.track && resting(prev.shot, shot, viewport) && (!hold || frame.holds?.(prev.shot, hold) !== false)) return;
    keys.push({ at, kind, shot, step, ...o });
  };
  const angle = (kind, c, lean = 1) => ({ pitch: SHOTS.pitch[kind], yaw: c.yaw * lean });
  const grow = (box, k) => (k > 0 ? toward(box, world, k) : box);

  for (let i = 0; i < steps.length; i++) {
    const st = steps[i], c = chapterOf(i);
    step = i;
    let at = st.t0;
    const scale = scaleAt.get(i);
    if (scale) { add(at, "scale", { track: scaleTrack(scale, frame) }, { force: true, move: SCALE.hold + 0.6, local: st.t0 }); continue; }
    if (i === c.from && i !== lastRun) {
      add(at, "establish", frame.wide(world, angle("establish", c)), { force: true });
      at += Math.min(st.dur * SHOTS.establishHold, frame.establish);
    }
    const look = looks[i], f = focus[i] ?? world, hold = { box: f, points: tags[i] };
    let kind, shot;
    if (i === lastRun) { kind = "payoff"; shot = frame.fit(union(f, look), angle("payoff", c, SHOTS.yaw.detail), { zoom: frame.payoffZoom, hold }); }
    else if (st.layers?.key && look) { kind = "detail"; shot = frame.fit(grow(look, SHOTS.context.detail), angle("detail", c, SHOTS.yaw.detail), { zoom: frame.detailZoom, focus: look, hold }); }
    else if (i === c.to && c.to > c.from) { kind = "pull"; shot = frame.pull(grow(c.stage, SHOTS.context.pull), angle("pull", c), f, hold); }
    else { kind = "push"; shot = frame.fit(grow(c.stage, SHOTS.context.push), angle("push", c), { focus: f, hold }); }
    add(at, kind, shot, {}, hold);
  }

  // move lengths: longer for bigger zooms, never running into the next keyframe; then where each move starts from
  for (let k = 0; k < keys.length; k++) {
    const K = keys[k], next = keys[k + 1]?.at ?? Infinity;
    if (K.move === undefined) {
      const prev = keys[k - 1]?.shot;
      const octaves = prev && !prev.track && !K.shot.track ? Math.abs(Math.log2(K.shot.distance / prev.distance)) : 1;
      K.move = clamp(SHOTS.move[0] + SHOTS.movePerOctave * octaves, SHOTS.move[0], SHOTS.move[1]);
    }
    K.move = Math.max(0.2, Math.min(K.move, next - K.at - SHOTS.settle));
  }
  // A step boundary the shot on screen does not cover: the new step's focus would sit out of frame while the camera
  // catches up. The camera sets off a little earlier instead, through a bridge shot that holds the step ending and the
  // step beginning, so at the boundary both are in frame; the planned move then carries on from there.
  for (let k = 1; k < keys.length; k++) {
    const K = keys[k], P = keys[k - 1], i = K.step;
    if (K.track || P.track || K.bridge || P.bridge || !i || K.at !== steps[i].t0 || !focus[i] || !focus[i - 1] || frame.holds?.(P.shot, { box: focus[i] }) !== false) continue;
    const at = Math.max(P.at + Math.min(P.move, SHOTS.move[0]), K.at - SHOTS.bridge);
    if (!(at < K.at - 0.05) || !frame.bridge) continue;
    const near = Math.min(frame.zoomOf(P.shot), frame.zoomOf(K.shot));
    keys.splice(k, 0, { at, kind: "bridge", shot: frame.bridge(union(focus[i - 1], focus[i]), { yaw: K.shot.yaw, pitch: K.shot.pitch }, near), step: i - 1, bridge: true, move: K.at - at });
    P.move = Math.min(P.move, at - P.at);
    k++;
  }
  for (let k = 0; k < keys.length; k++) keys[k].from = k ? poseOf(keys, k - 1, keys[k].at, false) : null;
  return { keys };
}

/** The camera at playhead `time`: { target, distance, yaw, pitch, fov, kind }. */
export function cameraAt(plan, time, reduced = false, out = { target: [0, 0, 0] }) {
  const keys = plan.keys;
  if (!keys.length) return null;
  let k = 0;
  for (let lo = 0, hi = keys.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (keys[m].at <= time + 1e-9) { k = m; lo = m + 1; } else hi = m - 1; }
  if (reduced && k && keys[k].bridge) k--;   // reduced motion cuts at the step itself, straight to a shot that holds it
  const p = poseOf(keys, k, time, reduced);
  out.target[0] = p.target[0]; out.target[1] = p.target[1]; out.target[2] = p.target[2];
  out.distance = p.distance; out.yaw = p.yaw; out.pitch = p.pitch; out.fov = p.fov ?? CAMERA.fov; out.kind = keys[k].kind;
  return out;
}

// keyframe k's pose at `time`: from where its move began, eased to its shot (a track shot is followed live)
function poseOf(keys, k, time, reduced) {
  const K = keys[k];
  const goal = K.shot.track ? K.shot.track(time - (K.local ?? K.at), reduced) : K.shot;
  if (!K.from || reduced) return goal;
  const u = easeInOut(clamp((time - K.at) / K.move, 0, 1));
  return blend(K.from, goal, u);
}

/** Interpolate two poses: target linearly, distance in log, angles linearly. */
export function blend(a, b, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  return {
    target: [lerp(a.target[0], b.target[0], u), lerp(a.target[1], b.target[1], u), lerp(a.target[2], b.target[2], u)],
    distance: Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), u)),
    yaw: lerp(a.yaw, b.yaw, u), pitch: lerp(a.pitch, b.pitch, u), fov: lerp(a.fov ?? CAMERA.fov, b.fov ?? CAMERA.fov, u),
  };
}

// a shot so close to the current one that moving would only fidget
function resting(a, b, vp) {
  const view = 2 * a.distance * Math.tan((CAMERA.fov * RAD) / 2) * (vp.width / vp.height);
  const pan = Math.hypot(a.target[0] - b.target[0], a.target[1] - b.target[1]) / view;
  const zoom = Math.max(a.distance / b.distance, b.distance / a.distance);
  return pan < SHOTS.rest.pan && zoom < SHOTS.rest.zoom && Math.abs(a.yaw - b.yaw) < SHOTS.rest.angle && Math.abs(a.pitch - b.pitch) < SHOTS.rest.angle;
}

// the scale shot: frame the reveal box, craning up and turning as it widens
function scaleTrack(scale, frame) {
  const box = {};
  return (local, reduced) => {
    const q = revealAt(local, reduced);
    revealBox(scale, q, box);
    const e = q * q * (3 - 2 * q);
    // the crane turns away as it pulls back and comes round square, so the field's printed lines land level; the lens
    // widens and the camera drops toward the horizon, so the field recedes into the dark rather than lying flat
    const angle = { pitch: lerp(SHOTS.pitch.payoff, SHOTS.scale.pitch, e), yaw: SHOTS.scale.yaw * Math.sin(Math.PI * e), fov: lerp(CAMERA.fov, SHOTS.scale.fov, e) };
    return { ...frame.fit(box, angle, { zoom: frame.payoffZoom, raw: true }), fov: angle.fov };
  };
}

// Per step, sampled once per timeline: the bounds of its look ids at its end (the lesson names what the reader should
// watch) and the world anchors of the tags it shows, mid-step and at its end.
const marks = new WeakMap();
function marksOf(tl) {
  if (marks.has(tl)) return marks.get(tl);
  const out = { looks: [], tags: [] };
  if (typeof tl.sample === "function") {
    let frame = null;
    for (const st of tl.steps) {
      const ids = st.layers?.look, anchors = [];
      const want = ids?.length ? new Set(ids) : null;
      // the look ids where they start and where they land: a detail shot holds the cause with its effect (a slip
      // seen leaving its reading machine as well as arriving on its counter)
      let b = null;
      const take = () => {
        if (!want) return;
        for (const p of frame.poses) {
          if (!want.has(p.id) || !(p.w > 0)) continue;
          b = union(b, { minX: p.x - p.w / 2, maxX: p.x + p.w / 2, minY: p.y - p.d / 2, maxY: p.y + p.d / 2, minZ: 0, maxZ: (p.z ?? 0) + (p.h ?? 0) });
        }
      };
      if (want) { frame = tl.sample(Math.min(st.t1, st.t0 + 1e-3), {}, frame); take(); }
      frame = tl.sample((st.t0 + st.t1) / 2, {}, frame);
      for (const g of frame.tags ?? []) if (g.opacity > 0) anchors.push(g.at.slice());
      frame = tl.sample(Math.max(st.t0, st.t1 - 1e-3), {}, frame);
      for (const g of frame.tags ?? []) if (g.opacity > 0) anchors.push(g.at.slice());
      take();
      out.looks.push(b);
      out.tags.push(anchors);
    }
  }
  marks.set(tl, out);
  return out;
}

export function union(a, b) {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
    minZ: Math.min(a.minZ ?? 0, b.minZ ?? 0), maxZ: Math.max(a.maxZ ?? 0, b.maxZ ?? 0),
  };
}

// a box grown a share k of the way toward another
function toward(a, w, k) {
  return {
    minX: lerp(a.minX, w.minX, k), maxX: lerp(a.maxX, w.maxX, k), minY: lerp(a.minY, w.minY, k), maxY: lerp(a.maxY, w.maxY, k),
    minZ: a.minZ ?? 0, maxZ: a.maxZ ?? 0,
  };
}
