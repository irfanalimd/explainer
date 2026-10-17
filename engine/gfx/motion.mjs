// Motion: the run's flights and events -> light trails and particle emitters (DESIGN.md "Motion is data flow").
// Pure and DOM-free. Called once per frame after the skin; writes dl.motion, which the WebGPU tier draws
// (backends/webgpu/particles.mjs) and the WebGL2 tier ignores, so that tier keeps today's look.
//
//   motionFx(tl, frame, dl, { theme, reducedMotion }) -> dl.motion = { time, light, paths, emitters } | null
//
// Nothing here is decorative. Each emitter is one thing the run did:
//   trail   a flight: a short ribbon of light in the data's colour behind the moving thing, its width set by the
//           bytes the flight carries (a counter the figure formats as "bytes"; flights without one stay slim)
//   bytes   the same flight's bytes, one particle per byte: they ride behind it, then stay on the wire it used for
//           the rest of the chapter, drifting slowly toward where they went. A wire's density is the bytes it carried.
//   shatter a crash: each slip in the failed machine's tray loses its colour, which rises out of it as motes and fades.
// Everything is a function of the playhead (frame.time) and fixed seeds, so renderAt(t) draws the same frame twice.
import { MOTION_FX as FX, PALETTE, keyColor } from "../tokens.mjs";

export const PATH_N = 64;                  // samples per flight path (the GPU interpolates between them)
export const EMIT = { trail: 1, bytes: 2, shatter: 3 };
const TILES = new Set(["record", "tile", "page", "bit"]);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// FNV-1a: a stable seed from an id, so a thing's particles never depend on what else is on screen
function seedOf(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % 65521;
}

const cache = new WeakMap();

/** Once per timeline: every flight with the bytes it carried and the end of its chapter, and the crash times. */
function prepare(tl) {
  const X = tl._;
  if (!X?.flightsByStep) return null;
  const seen = new Set(), list = [];
  for (const step of X.flightsByStep) for (const f of step ?? []) if (!seen.has(f)) { seen.add(f); list.push(f); }
  list.sort((a, b) => a.start - b.start);

  // real bytes: each rise of a bytes counter goes to the flight it lands with (the nearest one in its step)
  const named = new Set(Object.entries(tl.counters ?? {}).filter(([, d]) => d?.format === "bytes").map(([k]) => k));
  const bytes = new Map(), last = {};
  for (const ev of X.counterEvents ?? []) {
    if (!named.has(ev.name)) continue;
    const d = ev.value - (last[ev.name] ?? 0);
    last[ev.name] = ev.value;
    if (!(d > 0)) continue;
    let best = null, bd = Infinity;
    for (const f of X.flightsByStep[tl.stepAt(ev.t)] ?? []) {
      const end = f.end ?? f.seg.t1, dist = ev.t < f.start ? f.start - ev.t : ev.t > end ? ev.t - end : 0;
      if (dist < bd) { bd = dist; best = f; }
    }
    if (best) bytes.set(best, (bytes.get(best) ?? 0) + d);
  }
  const chapterEnd = (t) => tl.phases.find((p) => t >= p.t0 && t < p.t1)?.t1 ?? tl.duration;
  return {
    flights: list.map((f, i) => ({
      f, seed: i * 7919 + 13, id: X.incs[f.inc]?.id ?? null, bytes: Math.round(bytes.get(f) ?? 0),
      end: f.end ?? f.seg.t1, until: chapterEnd(f.start), L: Math.max(1e-3, f.sEnd - f.sOff), pts: null,
    })),
    fails: (tl.events ?? []).filter((e) => e.kind === "fail").map((e) => e.t),
  };
}

// the groove part of a flight's path, resampled evenly: PATH_N points, local arc length 0..L
function pathOf(F) {
  if (F.pts) return F.pts;
  const pts = new Float32Array(PATH_N * 2), p = [0, 0, 0];
  for (let i = 0; i < PATH_N; i++) {
    F.f.seg.path.at(F.f.sOff + (F.L * i) / (PATH_N - 1), p);
    pts[2 * i] = p[0]; pts[2 * i + 1] = p[1];
  }
  return (F.pts = pts);
}

/**
 * @param tl     the compiled timeline (engine/scene)
 * @param frame  tl.sample(t) for this frame
 * @param dl     the frame's DrawList; dl.motion is replaced
 */
export function motionFx(tl, frame, dl, { theme = "dark", reducedMotion = false } = {}) {
  dl.motion = null;
  if (!tl || !frame) return null;
  let M = cache.get(tl);
  if (M === undefined) { M = prepare(tl); cache.set(tl, M); }
  if (!M) return null;
  const t = frame.time ?? 0;
  const P = PALETTE[theme] ?? PALETTE.dark;
  const colorOf = (key) => (key === null || key === undefined ? P.lit : keyColor(theme, key));
  const out = { time: reducedMotion ? 0 : t, light: theme === "light", paths: [], emitters: [] };
  let byId = null;
  const pose = (id) => {
    if (!byId) { byId = new Map(); for (const p of frame.poses ?? []) if (p.id) byId.set(p.id, p); }
    return byId.get(id) ?? null;
  };

  for (const F of M.flights) {
    const { f } = F;
    const hasBytes = F.bytes > 0;
    const last = Math.max(F.end + FX.trail.fade, hasBytes ? F.until + FX.flow.fade : 0);
    if (t < f.start || t > last) continue;
    if (f.seg.dropped && t >= f.seg.t1) continue;
    const color = colorOf(f.key);
    const age = t - F.end;                       // < 0 while in flight
    let path = -1;
    const usePath = () => { if (path < 0) { path = out.paths.length; out.paths.push(pathOf(F)); } return path; };

    // where the moving thing is: its pose, projected onto the groove
    const p = F.id ? pose(F.id) : null;
    if (age < 0 && !p) continue;
    let head = F.L, back = 0;
    const zHead = p ? (p.z ?? 0) + (p.h ?? 0) * 0.5 : FX.trail.zFloor;
    if (age < 0) {
      head = Math.min(F.L, Math.max(0, f.seg.path.project(p.x, p.y) - f.sOff));
      // the trail leaves the thing's back edge: its half extent along the direction of travel
      const d = [0, 0, 0];
      f.seg.path.at(f.sOff + head, d);
      const a = (d[2] - (p.yaw ?? 0)) * (Math.PI / 180);
      back = Math.abs(Math.cos(a)) * (p.w ?? 0) * 0.5 + Math.abs(Math.sin(a)) * (p.d ?? 0) * 0.5;
    }
    const scale = hasBytes ? Math.min(FX.bytes.max, Math.max(FX.bytes.min, Math.sqrt(F.bytes / FX.bytes.ref))) : FX.bytes.none;

    // the light trail: rides behind the thing, then draws itself into the destination and fades
    if (!reducedMotion && age < FX.trail.fade) {
      const k = age < 0 ? 0 : smooth(age / FX.trail.fade);
      const s1 = Math.max(0, head - back), len = FX.trail.length * (0.75 + 0.25 * scale);
      const s0 = Math.max(0, s1 - len * (1 - k));
      const fadeIn = smooth((t - f.start) / 0.2);
      if (s1 - s0 > 1) out.emitters.push({
        type: EMIT.trail, path: usePath(), L: F.L, s0, s1, z0: FX.trail.zFloor, z1: Math.max(FX.trail.zFloor, zHead),
        width: FX.trail.width * scale, color, intensity: FX.trail.intensity[theme] * fadeIn * (1 - k), seed: F.seed,
      });
    }

    // the bytes: ride behind the thing, then stay on the wire until the chapter ends
    if (hasBytes) {
      const comet = reducedMotion ? 0 : age < 0 ? smooth((t - f.start) / 0.25) : 1 - smooth(age / FX.stream.settle);
      const flow = (age < 0 ? 0 : reducedMotion ? 1 : smooth(age / FX.flow.appear)) * (1 - smooth((t - F.until) / FX.flow.fade));
      if (comet > 0.001 || flow > 0.001) out.emitters.push({
        type: EMIT.bytes, path: usePath(), L: F.L, head: Math.max(0, head - back), zHead, age,
        n: F.bytes, color, intensity: FX.stream.intensity[theme] * comet, flow: FX.flow.level[theme] * flow, seed: F.seed,
      });
    }
  }

  // a crash: the failed machine's slips (its lost work) give up their colour, mote by mote
  if (!reducedMotion) for (const tf of M.fails) {
    const age = t - tf;
    if (age < 0 || age > FX.shatter.life + FX.shatter.stagger) continue;
    for (const h of frame.poses ?? []) {
      if (h.kind !== "housing" || h.led !== "fail") continue;
      for (const p of frame.poses) {
        // only data loses its colour: a keyed slip (the work); the input piece is still safe in the input
        if (!TILES.has(p.kind) || p.key === null || p.key === undefined) continue;
        if (Math.abs(p.x - h.x) > h.w / 2 || Math.abs(p.y - h.y) > h.d / 2) continue;
        out.emitters.push({
          // on paper fewer, from the slip's rim (particles.mjs): ink dots over a greyed label would only add noise
          type: EMIT.shatter, x: p.x, y: p.y, z: (p.z ?? 0) + (p.h ?? 4), w: p.w ?? 20, d: p.d ?? 20, age,
          n: theme === "light" ? Math.round(FX.shatter.count * 0.6) : FX.shatter.count,
          color: colorOf(p.key), intensity: FX.shatter.intensity[theme], seed: seedOf(String(p.id)),
        });
      }
    }
  }

  if (!out.emitters.length) return null;
  dl.motion = out;
  return out;
}
