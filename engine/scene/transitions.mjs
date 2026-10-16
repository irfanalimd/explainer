// Transitions (DESIGN.md section 8): every motion segment is a pure function of time. The compiler builds
// segments; the sampler evaluates them. Endpoints are "places" (world, or local to a parent that may itself
// be moving), so a tile in a gliding housing rides along and a flight lands exactly in a moving slot.
import { MOTION, SIZE } from "../tokens.mjs";
import { bezier, clamp01, smoothstep, settle } from "./util.mjs";
import { Path, roundCorners } from "./path.mjs";

export const ease = bezier(MOTION.ease);
export const easeInOut = bezier(MOTION.easeInOut);
// long runs along a groove: accelerate gently out of the port, cruise, and take the emphasised settle at the end
export const easeTravel = bezier([MOTION.easeInOut[0] * 0.7, 0, MOTION.ease[2] + 0.12, 1]);
const easeOutQuad = (x) => 1 - (1 - x) * (1 - x);
const easeInQuad = (x) => x * x;

export const T = {
  lead: 0.15,                     // fraction of a trace move spent lifting out of the slot
  tilt: 5,                        // degrees a hopping tile leans into its travel
  clear: 4,                       // u a travelling tile keeps above a housing it crosses
  desc: 22,                       // u of trace over which a tile drops from the housing top to glide height
  land: 26,                       // u over which it settles down into its slot
  emerge: 0.24,                   // fraction of a spawn spent emerging from the source
  trail: 60,                      // u, luminous pulse behind a travelling thing
  trailFade: 0.32,                // s, the pulse fades after arrival
  packetEmerge: 0.18,             // s
  absorb: 0.2,                    // s, a delivered packet shrinks into its receiver
  printFade: 0.9,                 // s, an air send's floor print fades after arrival
  litIn: 0.18, litOut: 0.32,      // s, attention ramps
  tagFade: 0.2,                   // s
  ledMix: 0.3,                    // s
  rmFade: 0.15,                   // s, reduced-motion crossfade
};

export const hopHeight = (dist) => Math.min(MOTION.hop.max, Math.max(MOTION.hop.min, MOTION.hop.k * dist));

/** Natural duration (s) of a travel of `dist` u. Longer runs take a little longer, so speed reads physical. */
export const travelTime = (dist) => MOTION.step * Math.min(2, Math.max(0.8, 0.55 + dist / 600));

/** World position of a place at time t. ctx.pose(incIdx, t) returns the parent's sampled pose. */
export function anchor(place, t, ctx, out) {
  if (place.mode === "local") {
    const p = ctx.pose(place.parent, t);
    if (p) { out[0] = p.x + place.x * (p.scale ?? 1); out[1] = p.y + place.y * (p.scale ?? 1); out[2] = (p.z ?? 0) + place.z; return out; }
    out[0] = place.wx; out[1] = place.wy; out[2] = place.wz; return out;
  }
  out[0] = place.x; out[1] = place.y; out[2] = place.z ?? 0;
  return out;
}

/**
 * Build a flight path for a tile: start -> (route raw points, oriented) -> end, all corners rounded.
 * Returns { path, sA, sB } with the arc lengths where the route begins and ends.
 */
export function flightPath(start, end, raw) {
  const pts = [start, ...raw, end];
  const path = new Path(roundCorners(pts, SIZE.trace.corner));
  const sA = path.project(raw[0][0], raw[0][1]), sB = path.project(raw[raw.length - 1][0], raw[raw.length - 1][1]);
  return { path, sA, sB: Math.max(sA, sB) };
}

/** Height profile of a trace move along its path (lifted over bodies, gliding along the groove). */
function zAlong(seg, s) {
  const { z0, z1, hA, hB, sA, sB } = seg.prof;
  const L = seg.path.length;
  const lift = MOTION.lift, glide = MOTION.lift;
  const zLift = z0 + lift;
  const zOverA = Math.max(zLift, hA + T.clear), zOverB = Math.max(z1 + lift, hB + T.clear);
  if (s <= sA) return zLift + (zOverA - zLift) * smoothstep(s / Math.max(1, Math.min(20, sA)));
  if (s <= sA + T.desc) return zOverA + (glide - zOverA) * smoothstep((s - sA) / T.desc);
  if (s < sB - T.desc) return glide;
  if (s < sB) return glide + (zOverB - glide) * smoothstep((s - (sB - T.desc)) / T.desc);
  const tail = Math.max(1, L - sB), landFrom = Math.max(sB, L - Math.min(T.land, tail));
  if (s < landFrom) return zOverB;
  return zOverB + (z1 - zOverB) * smoothstep((s - landFrom) / Math.max(1, L - landFrom));
}

const A = [0, 0, 0], B = [0, 0, 0], P = [0, 0, 0];

/**
 * Evaluate a segment at time t into `o` (x, y, z, opacity, scale, pitch, bank, yaw, s).
 * Returns false when the entity is gone (after an exit).
 */
export function evalSeg(seg, t, ctx, o) {
  const D = seg.t1 - seg.t0;
  const u = D > 0 ? clamp01((t - seg.t0) / D) : 1;
  o.opacity = 1; o.scale = 1; o.pitch = 0; o.bank = 0; o.yaw = 0; o.s = -1; o.zl = 0;
  if (ctx.reduced && seg.type !== "flight" && seg.type !== "geo") return evalReduced(seg, t, ctx, o);
  switch (seg.type) {
    case "glide": {
      const e = (seg.ease ?? ease)(u);
      anchor(seg.from, t, ctx, A); anchor(seg.to, t, ctx, B);
      o.x = A[0] + (B[0] - A[0]) * e; o.y = A[1] + (B[1] - A[1]) * e; o.z = A[2] + (B[2] - A[2]) * e;
      if (seg.from.w !== undefined && seg.to.w !== undefined) { o.w = seg.from.w + (seg.to.w - seg.from.w) * e; o.d = seg.from.d + (seg.to.d - seg.from.d) * e; }
      if (seg.lift) o.z += seg.lift * Math.sin(Math.PI * e);
      return true;
    }
    case "hop": {
      const e = ease(u);
      anchor(seg.from, t, ctx, A); anchor(seg.to, t, ctx, B);
      hopAt(seg, e, A, B, o);
      return true;
    }
    case "path": {
      const L = seg.path.length;
      let s, z;
      if (u < T.lead) { s = 0; z = seg.prof.z0 + MOTION.lift * easeOutQuad(u / T.lead); }
      else { s = L * easeTravel((u - T.lead) / (1 - T.lead)); z = zAlong(seg, s); }
      seg.path.at(s, P);
      // anchors may be moving: blend their drift in by progress
      const p = L > 0 ? s / L : 1;
      anchor(seg.from, t, ctx, A); anchor(seg.to, t, ctx, B);
      const dax = A[0] - seg.from.wx, day = A[1] - seg.from.wy, dbx = B[0] - seg.to.wx, dby = B[1] - seg.to.wy;
      o.x = P[0] + dax + (dbx - dax) * p; o.y = P[1] + day + (dby - day) * p;
      o.z = z + (A[2] - seg.from.wz) * (1 - p) + (B[2] - seg.to.wz) * p;
      o.s = s;
      return true;
    }
    case "enter": {
      const e = ease(u);
      anchor(seg.to, t, ctx, B);
      o.x = B[0]; o.y = B[1]; o.z = B[2] - seg.rise * (1 - e);
      o.opacity = smoothstep(u * 1.7);
      o.scale = seg.grow ? 0.9 + 0.1 * e : 1;
      return true;
    }
    case "exit": {
      if (t >= seg.t1) return false;
      anchor(seg.from, t, ctx, A);
      o.x = A[0]; o.y = A[1];
      const e = easeInQuad(u);
      o.z = A[2] - (seg.style === "sink" ? seg.depth * e : 0);
      o.opacity = 1 - smoothstep(u);
      if (seg.yaw !== undefined) o.yaw = seg.yaw;
      return true;
    }
    case "spawn": {
      const em = seg.emerge;
      if (u < em) {
        const k = u / em, e = easeOutQuad(k);
        o.x = seg.src[0]; o.y = seg.src[1]; o.z = seg.src[2] + MOTION.lift * e;
        o.scale = 0.55 + 0.45 * e; o.opacity = smoothstep(k * 1.4);
        return true;
      }
      const k = (u - em) / (1 - em);
      if (seg.path) {
        const L = seg.path.length, s = L * easeTravel(k);
        seg.path.at(s, P);
        anchor(seg.to, t, ctx, B);
        const p = L > 0 ? s / L : 1;
        o.x = P[0] + (B[0] - seg.to.wx) * p; o.y = P[1] + (B[1] - seg.to.wy) * p;
        o.z = zAlong(seg, s) + (B[2] - seg.to.wz) * p;
        o.s = s;
        return true;
      }
      A[0] = seg.src[0]; A[1] = seg.src[1]; A[2] = seg.src[2] + MOTION.lift;
      anchor(seg.to, t, ctx, B);
      hopAt(seg, ease(k), A, B, o);
      return true;
    }
    case "consume": {
      if (t >= seg.t1) return false;
      const e = ease(u);
      anchor(seg.from, t, ctx, A); anchor(seg.target, t, ctx, B);
      B[2] += seg.top;
      hopAt(seg, e, A, B, o);
      o.scale = 1 - 0.45 * smoothstep(u);
      o.opacity = 1 - smoothstep((u - 0.62) / 0.38);
      return true;
    }
    case "absorb": {
      if (t >= seg.t1) return false;
      anchor(seg.from, t, ctx, A);
      const e = easeInQuad(u);
      o.x = A[0] + seg.dir[0] * 10 * e; o.y = A[1] + seg.dir[1] * 10 * e; o.z = A[2] * (1 - 0.6 * e);
      o.scale = 1 - 0.7 * e; o.opacity = 1 - e; o.yaw = seg.yaw ?? 0;
      return true;
    }
    case "flight": return evalFlight(seg, t, ctx, o);
    default:
      anchor(seg.to ?? seg.from, t, ctx, B);
      o.x = B[0]; o.y = B[1]; o.z = B[2];
      return true;
  }
}

function hopAt(seg, e, A, B, o) {
  o.x = A[0] + (B[0] - A[0]) * e; o.y = A[1] + (B[1] - A[1]) * e;
  o.z = A[2] + (B[2] - A[2]) * e + 4 * seg.H * e * (1 - e);
  const th = T.tilt * Math.sin(Math.PI * e) * (seg.tiltSign ?? 1);
  // lean the top into the direction of travel: bank about local y (toward +x), pitch about local x (toward -y)
  o.bank = th * seg.dir[0]; o.pitch = -th * seg.dir[1];
}

/** Progress (0..1) of a flight at time t: eased over its window, or by simulated time for held messages. */
export function flightProgress(seg, t, ctx) {
  if (t <= seg.t0) return 0;
  let p;
  if (seg.sim && seg.simB - seg.simA > 1e-9) p = clamp01((ctx.sim(t) - seg.simA) / (seg.simB - seg.simA));
  else {
    const D = seg.tArr - seg.t0, u = D > 0 ? clamp01((t - seg.t0) / D) : 1;
    p = seg.linear ? u : (seg.sim ? easeInOut : ease)(u);
  }
  p *= seg.cap ?? 1;
  return seg.stopAt !== undefined ? Math.min(p, seg.stopAt) : p;
}

function evalFlight(seg, t, ctx, o) {
  const p = flightProgress(seg, t, ctx);
  const L = seg.path.length, s = L * p;
  seg.path.at(s, P);
  o.x = P[0]; o.y = P[1];
  o.z = SIZE.packet.lift + (seg.air ? 4 * seg.H * p * (1 - p) : 0);
  o.yaw = P[2];
  o.s = s;
  const k = clamp01((t - seg.t0) / T.packetEmerge);
  o.scale = 0.4 + 0.6 * easeOutQuad(k);
  o.opacity = smoothstep(k * 1.3);
  if (seg.air) { o.pitch = -8 * (1 - 2 * p); }
  return true;
}

function evalReduced(seg, t, ctx, o) {
  // transitions become short crossfades: dip out at the old place, come back at the new one
  const k = (t - seg.t0) / T.rmFade;
  const gone = seg.type === "exit" || seg.type === "consume" || seg.type === "absorb";
  if (gone) {
    if (t >= seg.t0 + T.rmFade) return false;
    anchor(seg.from, t, ctx, A);
    o.x = A[0]; o.y = A[1]; o.z = A[2]; o.opacity = 1 - clamp01(k);
    return true;
  }
  const to = seg.to;
  const useFrom = k < 0.5 && (seg.from || seg.src);
  if (useFrom && seg.from) anchor(seg.from, t, ctx, A);
  else if (useFrom) { A[0] = seg.src[0]; A[1] = seg.src[1]; A[2] = seg.src[2]; }
  else anchor(to, t, ctx, A);
  o.x = A[0]; o.y = A[1]; o.z = A[2];
  if (seg.type === "glide" && seg.from.w !== undefined && seg.to.w !== undefined) { const src = useFrom ? seg.from : seg.to; o.w = src.w; o.d = src.d; }
  const fresh = seg.type === "enter" || seg.type === "spawn";
  o.opacity = k >= 1 ? 1 : fresh ? clamp01(k) : Math.abs(1 - 2 * clamp01(k));
  return true;
}

export { settle };
