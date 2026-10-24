// The sampler: Timeline x time -> Frame (engine/contracts.mjs), poses per CONTRACTS.md 4.6.
// Pure and stable: every value is a function of (time, view) only, so scrubbing backward is exact.
// Work per frame is proportional to what is alive in the current step; scratch state is reused.
import { MOTION, SIZE, SPOT } from "../tokens.mjs";
import { T, evalSeg, anchor, flightProgress, ease, easeInOut } from "./transitions.mjs";
import { clamp01, smoothstep, lastLEn } from "./util.mjs";
import { emitScale } from "./scale.mjs";

const TAG_LIFT = 12;          // u above a tile's top
const TAG_EDGE = 4;           // u above a housing's top, at its back edge
const TAG_BLEND = 36;         // u outside a housing over which a tile's tag anchor moves from the edge to the tile
const TAG_CROWD = 30;         // u: a housing closer than this behind another leaves no room for that one's chip
const TAG_INSET = 0.42;       // share of the tray's depth below the header where a crowded housing's chip points
// kinds that are the world's structure, not things in it: the spotlight never recedes them (timeline.mjs counts the rest)
export const SPOT_STRUCTURE = new Set(["zone", "group", "spacer", "text", "lanes", "mark", "trace", "bus", "choose", "turns"]);
const STATUS = new Set(["ok", "busy", "warn", "fail", "idle", "ghost", "neutral", "key"]);

export function createSampler(tl) {
  const X = tl._;
  const { incs, alive, flightsByStep, messagesByStep, printsByStep, tagsByStep, focusByStep, spotByStep, refsByStep, scaleByStep, counterEvents, startCounters, steps, beatStates, laneGeo, markLevel } = X;
  const n = incs.length;
  const stamp = new Float64Array(n).fill(NaN);
  const spots = new Map();              // step -> { keep, memo }: the spotlight (recedeIn)
  const kin = incs.map(() => ({ x: 0, y: 0, z: 0, w: 0, d: 0, h: 0, opacity: 1, scale: 1, pitch: 0, bank: 0, yaw: 0, s: -1, zl: 0, ok: false, seg: null }));
  const cevT = Float64Array.from(counterEvents.map((e) => e.t));
  const tmp = [0, 0, 0];
  let curT = 0;
  const housings = [], zones = [];
  const ZA = [0, 0, 0, 0], ZB = [0, 0, 0, 0];
  const ctx = { reduced: false, sim: tl.sim, pose: (idx, t) => (idx === undefined || idx === null ? null : t === curT ? kinOf(idx) : kinAt(idx, t)) };

  function kinOf(idx) {
    if (stamp[idx] === curT) return kin[idx].ok ? kin[idx] : null;
    stamp[idx] = curT;
    const k = kin[idx];
    k.ok = evalKin(incs[idx], curT, k);
    return k.ok ? k : null;
  }
  // a pose at some other time (rare: only for anchors queried off-frame); not cached
  function kinAt(idx, t) {
    const k = { x: 0, y: 0, z: 0, w: 0, d: 0, h: 0, opacity: 1, scale: 1, pitch: 0, bank: 0, yaw: 0, s: -1, ok: false, seg: null };
    const save = curT; curT = t;
    const ok = evalKin(incs[idx], t, k);
    curT = save;
    return ok ? k : null;
  }

  function evalKin(inc, t, k) {
    if (t < inc.born || t >= inc.died) return false;
    if (inc.kind === "trace" || inc.kind === "bus" || inc.kind === "zone") {
      k.x = k.y = k.z = 0; k.w = k.d = k.h = 0; k.opacity = 1; k.scale = 1; k.pitch = k.bank = k.yaw = 0; k.s = -1; k.seg = null;
      return true;
    }
    const si = lastLEn(inc.segT0, t);
    k.seg = null;
    let place = inc.rest0;
    if (si >= 0) {
      const seg = inc.segs[si];
      if (t < seg.t1 || seg.type === "flight") {
        k.w = undefined;
        if (!evalSeg(seg, t, ctx, k)) return false;
        k.seg = seg;
        const pl = seg.to ?? seg.from;
        if (k.w === undefined) { k.w = pl?.w ?? 0; k.d = pl?.d ?? 0; }
        k.h = pl?.h ?? 0;
        return true;
      }
      if (seg.type === "exit" || seg.type === "consume" || seg.type === "absorb") return false;
      place = seg.to ?? place;
    }
    if (!place) return false;
    anchor(place, t, ctx, tmp);
    k.x = tmp[0]; k.y = tmp[1]; k.z = tmp[2];
    k.w = place.w; k.d = place.d; k.h = place.h ?? 0;
    k.opacity = 1; k.scale = 1; k.pitch = 0; k.bank = 0; k.yaw = 0; k.s = -1;
    return true;
  }

  const recAt = (inc, t) => {
    const i = lastLEn(inc.recT, t);
    return i >= 0 ? i : 0;
  };
  const litAt = (inc, t) => {
    let v = 0;
    for (const [a, b] of inc.lits) {
      if (t < a) break;
      if (t <= b) v = Math.max(v, smoothstep((t - a) / T.litIn));
      else if (t < b + T.litOut) v = Math.max(v, 1 - smoothstep((t - b) / T.litOut));
    }
    return v;
  };
  const flashAt = (inc, t) => {
    const i = lastLEn(inc.flashT, t);
    if (i < 0) return 0;
    let v = 0;
    for (let j = i; j >= 0 && j > i - 3; j--) {
      const f = inc.flashes[j], u = (t - f.t) / MOTION.flash;
      if (u < 1) v = Math.max(v, f.a * (1 - u) * (1 - u));
    }
    return v;
  };
  const chanAt = (list, t, v) => {
    for (const c of list) {
      if (t < c.t0) break;
      v = t >= c.t1 ? c.v1 : c.v0 + (c.v1 - c.v0) * ease((t - c.t0) / (c.t1 - c.t0));
    }
    return v;
  };
  const lodAt = (lod, ppu) => {
    if (!lod || !ppu) return 1;
    let f = 1;
    if (lod.minPx) f *= smoothstep((ppu - lod.minPx * 0.8) / (lod.minPx * 0.45));
    if (lod.maxPx) f *= 1 - smoothstep((ppu - lod.maxPx * 0.8) / (lod.maxPx * 0.45));
    return f;
  };
  const toneOf = (rec) => {
    if (rec.tone && STATUS.has(rec.tone)) return rec.tone;
    if (rec.kind === "tile" && rec.of === "bit" && rec.text === "0") return "ghost";
    return rec.keyIndex !== null && rec.keyIndex !== undefined ? "key" : "neutral";
  };

  /**
   * sample(time, view?, out?) -> Frame. With `out` (a Frame from an earlier call) its arrays are refilled in place.
   */
  return function sample(time, view = {}, out = null) {
    const nSteps = steps.length;
    const dur = tl.duration;
    const t = Math.max(0, Math.min(dur, Number.isFinite(time) ? time : 0));
    const i = nSteps ? tl.stepAt(t) : 0;
    const st = steps[i];
    curT = t;
    ctx.reduced = !!view.reducedMotion;
    // a different reduced-motion setting must not reuse cached kinematics
    if (ctx.reduced !== sample._reduced) { stamp.fill(NaN); sample._reduced = ctx.reduced; }
    const ppu = view.pxPerUnit ?? 0;
    const poses = out?.poses ?? [];
    poses.length = 0;
    const byId = new Map();
    const lanePoses = [];

    const list = alive[i] ?? [];
    for (let q = 0; q < list.length; q++) {
      const idx = list[q];
      const inc = incs[idx];
      const k = kinOf(idx);
      if (!k) continue;
      const ri = recAt(inc, t);
      const rec = inc.recs[ri].rec;
      const prev = ri > 0 ? inc.recs[ri - 1] : null;
      const lod = lodAt(rec.lod, ppu);
      if (lod <= 0.001) continue;
      const pose = basePose(inc, rec, k, t, view);
      pose.opacity *= lod;
      switch (rec.kind) {
        case "zone": {
          if (!zoneAround(inc, rec, t, pose)) continue;
          break;
        }
        case "group": {
          if (!rec.title) continue;
          pose.kind = "zone"; pose.title = rec.title; pose.dashed = !!rec.dashed; pose.h = 0; pose.z = 0;
          break;
        }
        case "spacer": continue;
        case "housing": {
          pose.variant = rec.variant; pose.title = rec.title; pose.sub = rec.sub;
          pose.led = rec.led ?? null;
          const lp = prev && prev.rec.led !== rec.led && t - inc.recs[ri].t < T.ledMix ? prev.rec.led : null;
          pose.ledPrev = lp; pose.ledMix = lp !== null ? clamp01((t - inc.recs[ri].t) / T.ledMix) : 1;
          pose.meter = rec.meter === null || rec.meter === undefined ? null : chanAt(inc.meter, t, rec.meter);
          if (inc.meter.length && pose.meter === null) pose.meter = chanAt(inc.meter, t, 0);
          const tr = inc.rest0 ? trayOf(inc, t) : null;
          pose.tray = tr;
          pose.r = rec.variant === "store" ? pose.w / 2 : (SIZE.variant[rec.variant] ?? SIZE.variant.node).r;
          pose.state = rec.state ?? null;
          break;
        }
        case "container": {
          pose.variant = rec.axis; pose.h = SIZE.plate.h; pose.label = rec.label;
          pose.tray = trayOf(inc, t);
          emitContainerTexts(inc, rec, pose, poses);
          break;
        }
        case "tile": {
          pose.kind = rec.of; pose.text = rec.text; pose.sub = rec.sub;
          pose.h = (SIZE[rec.of] ?? SIZE.tile).h;
          if (prev && prev.rec.kind === rec.kind && prev.rec.text !== rec.text && t - inc.recs[ri].t < MOTION.roll) {
            pose.textOut = prev.rec.text; pose.roll = easeInOut(clamp01((t - inc.recs[ri].t) / MOTION.roll));
          }
          // a tile in a dimmed housing dims with it
          const pl = k.seg ? (k.seg.to ?? k.seg.from) : null;
          const parentIdx = (pl && pl.mode === "local" ? pl.parent : null) ?? (inc.rest0?.mode === "local" ? currentParent(inc, t) : null);
          if (parentIdx !== null && parentIdx !== undefined) { const pp = poseCacheDim(parentIdx, t); if (pp > pose.dim) pose.dim = pp; }
          pose.state = rec.state ?? null;
          break;
        }
        case "pointer": pose.text = rec.text; pose.h = SIZE.pointer.h; pose.w = SIZE.pointer.flag; pose.d = SIZE.pointer.flag; break;
        case "text": pose.text = rec.text; pose.size = rec.size; pose.align = rec.align; pose.h = 0; pose.variant = "floor"; break;
        case "mark": pose.text = rec.text; pose.t = rec.t; pose.level = markLevel?.get(rec.id) ?? 0; pose.w = 7; pose.d = 7; pose.h = 3; break;
        case "lanes": {
          emitLanes(inc, rec, k, t, lanePoses);
          continue;
        }
        case "packet": {
          pose.text = rec.text;
          pose.w = SIZE.packet.w; pose.d = SIZE.packet.d; pose.h = SIZE.packet.h;
          pose.lit = 1;
          break;
        }
        case "trace": case "bus": {
          emitConnection(inc, rec, t, pose);
          break;
        }
        default: break;
      }
      poses.push(pose);
      byId.set(pose.id, pose);
    }
    for (const p of lanePoses) poses.push(p);

    // pulses: everything travelling along a trace or bus lights a stretch of it
    for (const f of flightsByStep[i] ?? []) applyPulse(f, t, byId);
    // lane diagonals, the lane packet, playheads
    for (const m of messagesByStep[i] ?? []) emitMessage(m, t, poses);
    for (const pr of printsByStep[i] ?? []) emitPrint(pr, t, poses);

    // a scale shot: the field round the world, and how far the reveal has got (frame.scale, for the director)
    const sc = st ? scaleByStep[i] : null;
    const scale = sc ? { step: i, ...emitScale(sc, t - st.t0, poses, !!view.reducedMotion), bounds: sc.box1 } : null;

    // the spotlight: what the step is about keeps its look, the rest recedes (pose.recede, 0..1; the skin draws it),
    // crossfading from the step before; the things its words name wear the chip-hover ring as it begins
    if (st && view.spot !== false && !scale) {
      const w = i > 0 ? smoothstep((t - st.t0) / SPOT.ease) : 1;
      const ring = t - st.t0 < SPOT.ring ? refsByStep[i] : null;
      for (const p of poses) {
        const r = recedeIn(i, p);
        p.recede = w < 1 ? r * w + recedeIn(i - 1, p) * (1 - w) : r;
        if (ring?.includes(p.id)) p.hover = true;
      }
    }

    // tags
    const tags = out?.tags ?? [];
    tags.length = 0;
    const tagList = tagsByStep[i] ?? [];
    if (tagList.length) {
      housings.length = 0; zones.length = 0;
      for (const p of poses) { if (p.kind === "housing") housings.push(p); else if (p.kind === "zone" && p.title) zones.push(p); }
    }
    for (const tg of tagList) {
      if (t < tg.t0) continue;
      const a = clamp01((t - tg.t0) / T.tagFade) * clamp01((tg.t1 - t) / T.tagFade + (i === nSteps - 1 ? 1 : 0));
      const k = tg.inc !== undefined ? kinOf(tg.inc) : null;
      if (!k) continue;
      tags.push({ id: tg.id, entity: tg.entity, text: tg.text, tone: tg.tone, at: tagAnchor(tg, k), opacity: a });
    }

    // counters at this instant
    const counters = { ...(startCounters[i] ?? {}) };
    if (st) {
      let e = lastLEn(cevT, st.t0 - 1e-9) + 1;
      for (; e < counterEvents.length && cevT[e] <= t + 1e-9; e++) counters[counterEvents[e].name] = counterEvents[e].value;
    }

    const u = st ? clamp01((t - st.t0) / st.dur) : 0;
    let b = 0;
    if (st) { for (let q = 0; q < st.beats.length; q++) if (t >= st.beats[q].t0) b = q; }
    const frame = out ?? {};
    frame.poses = poses;
    frame.time = t;
    frame.step = i;
    frame.u = u;
    frame.beat = b;
    frame.caption = st?.caption ?? "";
    frame.phase = st?.phase ?? "";
    frame.tags = tags;
    frame.focus = focusByStep[i] ?? tl.world;
    frame.world = tl.world;
    frame.counters = counters;
    frame.line = st?.line ?? null;
    frame.entities = beatStates[i]?.[b] ?? beatStates[i]?.[0] ?? new Map();
    frame.ask = st?.ask ?? null;
    frame.simTime = tl.sim(t);
    frame.scale = scale;
    return frame;
  };

  // A chip is drawn just above its anchor. Over a housing it would cover the engraved header, so a tag on a
  // housing, or on a tile resting in one, anchors above the housing's back edge; as the tile flies out the anchor
  // blends to just above the tile.
  function tagAnchor(tg, k) {
    const top = k.z + (k.h ?? 0) + TAG_LIFT;
    const idx = tg.inc;
    if (incs[idx].kind === "housing") {
      // a housing with another just behind it would hang its chip over that one (a column of machines): the chip
      // sits on its own tray instead, under its header, so it cannot be read as the neighbour's
      if (crowded(k)) return [k.x, k.y - k.d / 2 + SIZE.housing.header + TAG_INSET * (k.d - SIZE.housing.header), k.z + k.h + TAG_EDGE];
      return [k.x, edgeY(k.x, k.y - k.d / 2), k.z + k.h + TAG_EDGE];
    }
    let best = null, bd = Infinity;
    for (const h of housings) {
      const dx = Math.max(0, Math.abs(k.x - h.x) - h.w / 2), dy = Math.max(0, Math.abs(k.y - h.y) - h.d / 2);
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = h; }
    }
    // a tile's chip points at the tile, so it may sit at its housing's back edge even in a column of machines; just
    // above a tile in the tray's first row it would cover the housing's header
    if (!best || bd >= TAG_BLEND) return [k.x, k.y, top];
    const w = smoothstep(bd / TAG_BLEND);
    const ey = edgeY(k.x, best.y - best.d / 2), ez = best.z + best.h + TAG_EDGE;
    return [k.x, ey + (k.y - ey) * w, ez + (top - ez) * w];
  }

  // another housing whose front edge is less than TAG_CROWD behind this one's back edge, overlapping it across
  function crowded(k) {
    const back = k.y - k.d / 2;
    for (const h of housings) {
      if (Math.abs(h.x - k.x) < 1e-6 && Math.abs(h.y - k.y) < 1e-6) continue;
      const front = h.y + h.d / 2;
      if (front <= back + 1 && front > back - TAG_CROWD && Math.abs(h.x - k.x) < (h.w + k.w) / 2 - 8) return true;
    }
    return false;
  }

  // a housing's back edge just under a titled zone's top strip would put the chip on the zone title: use the zone's edge
  function edgeY(x, y) {
    for (const z of zones) {
      const top = z.y - z.d / 2;
      if (x > z.x - z.w / 2 && x < z.x + z.w / 2 && y >= top - 1 && y <= top + SIZE.zone.pad + 6) return top - 2;
    }
    return y;
  }

  function basePose(inc, rec, k, t, view) {
    return {
      id: inc.id, kind: rec.kind, variant: rec.variant ?? null,
      x: k.x, y: k.y, z: k.z, w: k.w, d: k.d, h: k.h, yaw: k.yaw, pitch: k.pitch, bank: k.bank, scale: k.scale,
      opacity: k.opacity, lit: litAt(inc, t), flash: flashAt(inc, t), dim: chanAt(inc.dim, t, rec.dim ? 1 : 0),
      hover: view.hover === inc.id, selected: view.selected === inc.id,
      tone: toneOf(rec), key: rec.keyIndex ?? null,
      text: null, sub: null, textOut: null, roll: 0, title: null, led: null, meter: null, tray: null,
    };
  }

  // 1 when pose p is outside step j's spotlight, 0 inside it or when the step has none. A label or part of a thing
  // (id#label, id@mark1) goes with the thing; a connection stays while it touches a kept thing or carries this step's
  // traffic. Per step and owner, memoised (spots).
  function recedeIn(j, p) {
    let sp = spots.get(j);
    if (!sp) {
      const keep = spotByStep[j] ? new Set(spotByStep[j]) : null;
      if (keep) for (const f of flightsByStep[j] ?? []) if (f.route && f.start >= steps[j].t0 - 1e-9) keep.add(f.route.id);
      spots.set(j, sp = { keep, memo: new Map() });
    }
    if (!sp.keep || typeof p.id !== "string") return 0;
    const cut = X.incsById.has(p.id) ? -1 : p.id.search(/[#@]/);   // an id may hold # itself (timeout#1)
    const owner = cut < 0 ? p.id : p.id.slice(0, cut);
    let r = sp.memo.get(owner);
    if (r === undefined) {
      const inc = incs[X.incsById.get(owner)?.[0]];
      const rec = inc?.recs[0].rec;
      if (!inc || sp.keep.has(owner)) r = 0;
      else if (inc.kind === "trace" || inc.kind === "bus") r = [].concat(rec.from, rec.to).some((x) => sp.keep.has(x)) ? 0 : 1;
      else r = SPOT_STRUCTURE.has(inc.kind) ? 0 : 1;
      sp.memo.set(owner, r);
    }
    return r;
  }

  function currentParent(inc, t) {
    const si = lastLEn(inc.segT0, t);
    const pl = si >= 0 ? (inc.segs[si].to ?? inc.rest0) : inc.rest0;
    return pl?.mode === "local" ? pl.parent : null;
  }
  function poseCacheDim(idx, t) {
    const inc = incs[idx];
    if (!inc) return 0;
    const rec = inc.recs[recAt(inc, t)].rec;
    return chanAt(inc.dim, t, rec.dim ? 1 : 0);
  }
  // the pose of the incarnation of `id` alive at time t
  function kinById(id, t) {
    const list = X.incsById.get(id);
    if (!list) return null;
    for (let q = list.length - 1; q >= 0; q--) { const inc = incs[list[q]]; if (t >= inc.born && t < inc.died) return kinOf(inc.idx); }
    return null;
  }
  function boundsOf(ids, t, out) {
    let ok = false;
    for (const id of ids ?? []) {
      const k = kinById(id, t);
      if (!k) continue;
      const x0 = k.x - (k.w ?? 0) / 2, x1 = k.x + (k.w ?? 0) / 2, y0 = k.y - (k.d ?? 0) / 2, y1 = k.y + (k.d ?? 0) / 2;
      if (!ok) { out[0] = x0; out[1] = y0; out[2] = x1; out[3] = y1; ok = true; }
      else { if (x0 < out[0]) out[0] = x0; if (y0 < out[1]) out[1] = y0; if (x1 > out[2]) out[2] = x1; if (y1 > out[3]) out[3] = y1; }
    }
    return ok;
  }
  // a free zone (s.zone) is printed around its members' current poses; a membership change glides between the two
  function zoneAround(inc, rec, t, pose) {
    let ids = rec.around, e = 1, from = null;
    for (const m of inc.morph) { if (t < m.t0) break; if (t < m.t1) { from = m.from; ids = m.to; e = ease((t - m.t0) / (m.t1 - m.t0)); break; } ids = m.to; }
    const hasB = boundsOf(ids, t, ZB);
    const hasA = from ? boundsOf(from, t, ZA) : false;
    if (!hasA && !hasB) return false;
    const b = hasB && hasA ? ZB.map((v, q) => ZA[q] + (v - ZA[q]) * e) : hasB ? ZB : ZA;
    const pad = SIZE.zone.pad;
    pose.x = (b[0] + b[2]) / 2; pose.y = (b[1] + b[3]) / 2; pose.z = 0; pose.h = 0;
    pose.w = b[2] - b[0] + 2 * pad; pose.d = b[3] - b[1] + 2 * pad;
    pose.title = rec.title; pose.variant = "around";
    pose.dashed = !!rec.dashed || rec.tone === "fail";
    pose.tone = rec.tone && STATUS.has(rec.tone) ? rec.tone : "neutral";
    pose.opacity = chanAt(inc.fade, t, 1);
    return pose.opacity > 0.001;
  }

  function placeNow(inc, t) {
    const si = lastLEn(inc.segT0, t);
    return si >= 0 ? (inc.segs[si].to ?? inc.rest0) : inc.rest0;
  }
  function trayOf(inc, t) {
    const pl = placeNow(inc, t);
    return pl?.tray ?? inc.rest0?.tray ?? null;
  }

  function emitContainerTexts(inc, rec, pose, poses) {
    if (rec.label) poses.push({ id: inc.id + "#label", kind: "text", variant: "label", x: pose.x - pose.w / 2 + 2, y: pose.y - pose.d / 2 - 8, z: 0, text: rec.label, size: SIZE.zone.title, tone: "muted", align: "left", opacity: pose.opacity, dim: pose.dim, upper: false });
    const cp = placeNow(inc, curT);
    const info = cp?.slots;
    if (rec.indices && info) {
      for (let s = 0; s < info.length; s++) {
        const [lx, ly] = info[s];
        poses.push({ id: `${inc.id}#${s}`, kind: "text", variant: "index", x: pose.x + lx, y: pose.y + ly, z: SIZE.plate.h, text: String(s), size: SIZE.tile.sub + 0.5, tone: "faint", align: "center", opacity: pose.opacity, dim: pose.dim });
      }
    }
    if (rec.fields?.length && cp?.brackets) {
      // brackets are printed on the floor, so they must lie in front of the plate, never under it
      const front = pose.d / 2 + 3;
      for (const br of cp.brackets) {
        const top = Math.min(...br.points.map(([, y]) => y));
        const dy = top < front ? front - top : 0;
        poses.push({
          id: `${inc.id}#${br.name}`, kind: "bracket", x: pose.x + br.lx, y: pose.y + br.ly + dy, z: 0,
          points: br.points.map(([x, y]) => [pose.x + x, pose.y + y + dy]), label: br.label ?? br.name, text: br.label ?? br.name, key: br.key, tone: br.key !== null ? "key" : "neutral", opacity: pose.opacity, dim: pose.dim,
        });
      }
    }
  }

  function emitLanes(inc, rec, k, t, outList) {
    const g = laneGeo.get(inc.id);
    if (!g) return;
    const op = k.opacity;
    const titles = (ent) => {
      const e = X.live.has(ent) ? incs[X.live.get(ent)] : null;
      return e ? e.recs[recAt(e, t)].rec.title ?? ent : ent;
    };
    g.rails.forEach((r, q) => {
      outList.push({
        id: `${inc.id}:${r.ent}`, kind: "lane", for: r.ent, x: k.x + (g.x0 + g.x1) / 2, y: k.y + r.y, z: 0, w: g.length, d: SIZE.lane.w, h: 0,
        points: [[k.x + g.x0, k.y + r.y], [k.x + g.x1, k.y + r.y]], label: titles(r.ent), labelAt: [k.x + g.labelX, k.y + r.y],
        t0: 0, scale: g.scale, unit: g.unit, length: g.length, ticks: g.ticks ?? { minor: SIZE.lane.tickMinor, major: SIZE.lane.tickMajor },
        ruler: q === g.rails.length - 1, labels: q === g.rails.length - 1 ? g.labels.map((l) => ({ x: k.x + g.x0 + l.x, y: k.y + r.y + 14, text: l.text })) : null,
        opacity: op, lit: 0, flash: 0, dim: 0, tone: "neutral", key: null,
      });
    });
    const simNow = tl.sim(t);
    const px = k.x + g.x0 + Math.max(0, Math.min(g.length, simNow * g.scale));
    const y0 = k.y + g.rails[0].y - 14, y1 = k.y + g.rails[g.rails.length - 1].y + 14;
    outList.push({ id: `${inc.id}@playhead`, kind: "playhead", x: px, y: (y0 + y1) / 2, z: 0, w: 1, d: y1 - y0, h: 0, points: [[px, y0], [px, y1]], t: simNow, opacity: op, lit: 1, flash: 0, dim: 0, tone: "neutral", key: null });
    if (g.title) outList.push({ id: `${inc.id}#title`, kind: "text", variant: "label", x: k.x - k.w / 2 + 6, y: k.y - k.d / 2 + 8, z: 0, text: g.title, size: SIZE.zone.title, tone: "muted", align: "left", opacity: op });
  }

  function suffix(n) { return n > 1 ? `~${n}` : ""; }
  // an air send prints a faint line on the floor under its arc; it grows with the packet and fades after arrival
  function emitPrint(pr, t, poses) {
    if (t < pr.t0) return;
    const seg = pr.seg;
    const end = seg.dropped ? seg.t1 : seg.tArr;
    const p = flightProgress(seg, Math.min(t, end ?? t), ctx);
    const arrived = end !== null && t >= end;
    const fade = arrived ? 1 - smoothstep((t - end) / T.printFade) : 1;
    if (fade <= 0) return;
    const a = smoothstep((t - pr.t0) / T.packetEmerge);
    poses.push({ id: pr.id + "@print" + suffix(pr.n), kind: "trace", variant: "print", style: "print", points: pr.path.points, length: pr.path.length, grow: p, key: pr.key ?? null, opacity: 0.85 * fade * a, dim: 0, lit: 0, flash: 0, glow: 0, pulses: [], tone: pr.key !== null && pr.key !== undefined ? "key" : "neutral", x: 0, y: 0, z: 0 });
  }

  function emitConnection(inc, rec, t, pose) {
    const g = geomAt(inc, t);
    pose.style = rec.style ?? "groove"; pose.dashed = !!rec.dashed;
    if (rec.kind === "trace") pose.arrow = rec.arrow ?? null;
    pose.x = 0; pose.y = 0; pose.z = 0; pose.h = 0;
    pose.glow = 0;
    pose.pulses = [];
    pose.tone = rec.tone && STATUS.has(rec.tone) ? rec.tone : "neutral";
    pose.grow = inc.grow ? ease(clamp01((t - inc.grow.t0) / (inc.grow.t1 - inc.grow.t0))) : 1;
    if (!g) { pose.points = []; return; }
    if (rec.kind === "trace") {
      pose.points = g.points;
      pose.length = g.length;
      pose.from = rec.from; pose.to = rec.to;
    } else {
      pose.points = g.trunk;
      pose.length = g.trunkLength;
      pose.branches = g.branches;
      pose.tees = g.tees;
    }
  }

  // geometry of a trace or bus at time t, morphing between routes when the layout changes
  function geomAt(inc, t) {
    let geo = inc.geo0, from = null, e = 1;
    for (const gk of inc.geo) {
      if (t < gk.t0) break;
      if (t < gk.t1) { from = gk.a; geo = gk.b; e = ease((t - gk.t0) / (gk.t1 - gk.t0)); break; }
      geo = gk.b;
    }
    if (!geo) return null;
    const pack = (G) => G.path ? { points: G.path.points, length: G.path.length } : {
      trunk: G.trunk.points, trunkLength: G.trunk.length, tees: G.tees,
      branches: G.branches.map((b) => ({ of: b.of, kind: b.kind, points: b.path.points, length: b.path.length, pulses: [] })),
    };
    if (!from || e >= 1) {
      const c = geo._pack ?? (geo._pack = pack(geo));
      // branches carry per-frame pulses: hand out fresh shells
      return c.branches ? { ...c, branches: c.branches.map((b) => ({ ...b, pulses: [] })) } : c;
    }
    const mix = (pa, pb) => {
      const N = 32, ka = pa._rs ?? (pa._rs = pa.resample(N)), kb = pb._rs ?? (pb._rs = pb.resample(N));
      return ka.map((p, q) => [p[0] + (kb[q][0] - p[0]) * e, p[1] + (kb[q][1] - p[1]) * e]);
    };
    if (geo.path) { const pts = mix(from.path, geo.path); return { points: pts, length: geo.path.length }; }
    return {
      trunk: mix(from.trunk, geo.trunk), trunkLength: geo.trunk.length, tees: geo.tees,
      branches: geo.branches.map((b) => {
        const a = from.branches.find((x) => x.of === b.of && x.kind === b.kind);
        return { of: b.of, kind: b.kind, points: a ? mix(a.path, b.path) : b.path.points, length: b.path.length, pulses: [] };
      }),
    };
  }

  // light the stretch of trace/bus behind something travelling along it
  function applyPulse(f, t, byId) {
    if (!f.route || t < f.start) return;
    const seg = f.seg;
    const end = f.end ?? seg.tArr ?? Infinity;
    let head, inten = 1;
    if (t < end) {
      const k = kinOf(f.inc);
      if (!k || k.seg !== seg || k.s < 0) {
        if (!(seg.type === "flight" && k)) return;
      }
      head = k.s;
    } else {
      if (t > end + T.trailFade) return;
      head = f.sEnd;
      inten = 1 - clamp01((t - end) / T.trailFade);
    }
    if (seg.type === "flight" && seg.dropped && t >= seg.t1) return;
    const path = seg.path;
    const lo = Math.max(f.sOff, 0), hi = f.sEnd;
    if (head <= lo) return;
    const sH = Math.min(head, hi), sT = Math.max(lo, head - T.trail);
    if (sH - sT < 0.5) return;
    const pose = byId.get(f.route.id);
    if (!pose) return;
    const env = Math.min(1, (t - f.start) / 0.15) * inten;
    pose.glow = Math.max(pose.glow ?? 0, 0.45 * env);
    if (pose.key === null || pose.key === undefined) pose.key = f.key ?? null;
    const P0 = path.at(sT), P1 = path.at(sH);
    const comps = f.comps ?? (f.comps = compsOf(f));
    for (const c of comps) {
      const u0 = Math.max(sT, c.a), u1 = Math.min(sH, c.b);
      if (u1 - u0 < 0.25) continue;
      const pa = u0 === sT ? P0 : path.at(u0), pb = u1 === sH ? P1 : path.at(u1);
      const geo = c.target(pose);
      if (!geo) continue;
      const s0 = c.path.project(pa[0], pa[1]), s1 = c.path.project(pb[0], pb[1]);
      geo.pulses.push({ s0, s1, key: f.key ?? null, intensity: env, a0: (u0 - sT) / (sH - sT), a1: (u1 - sT) / (sH - sT) });
    }
  }

  // which components of a trace/bus a flight's path covers, as path arc-length intervals
  function compsOf(f) {
    const r = f.route;
    if (r.kind === "trace") return [{ a: f.sOff, b: f.sEnd, path: r.route.path, target: (pose) => pose }];
    const { br, bus } = r;
    const bf = br.bf, bt = br.bt;
    const L = f.sEnd - f.sOff;
    const lenF = Math.hypot(bf.junction[0] - bf.port[0], bf.junction[1] - bf.port[1]);
    const lenT = Math.hypot(bt.junction[0] - bt.port[0], bt.junction[1] - bt.port[1]);
    const a = f.sOff, b1 = a + Math.min(L, lenF), b2 = f.sEnd - Math.min(L, lenT);
    const branchTarget = (of, kind) => (pose) => pose.branches?.find((x) => x.of === of && x.kind === kind) ?? null;
    const trunkTarget = (pose) => pose;
    return [
      { a, b: b1, path: bf.path, target: branchTarget(bf.of, bf.kind) },
      { a: b1, b: b2, path: bus.trunk, target: trunkTarget },
      { a: b2, b: f.sEnd, path: bt.path, target: branchTarget(bt.of, bt.kind) },
    ];
  }

  function emitMessage(m, t, poses) {
    if (t < m.t0) return;
    const g = laneGeo.get(m.board);
    const bk = m.boardInc !== undefined ? kinOf(m.boardInc) : null;
    if (!g || !bk || m.tRecv === null) return;
    const rf = g.rails.find((r) => r.ent === m.from), rt = g.rails.find((r) => r.ent === m.to);
    if (!rf || !rt) return;
    const x0 = bk.x + g.x0 + m.tSend * g.scale, y0 = bk.y + rf.y;
    const x1 = bk.x + g.x0 + m.tRecv * g.scale, y1 = bk.y + rt.y;
    let grow;
    const tEnd = m.dropT ?? (m.seg.tArr ?? Infinity);
    if (m.useSim && !m.dropT) grow = clamp01((tl.sim(t) - m.tSend) / (m.tRecv - m.tSend));
    else grow = flightProgress(m.seg, Math.min(t, tEnd), ctx);
    const arrived = t >= tEnd;
    const L = Math.hypot(x1 - x0, y1 - y0);
    const dim = arrived ? 0.6 * smoothstep((t - tEnd) / 0.5) : 0;
    const pose = {
      id: m.id + "@lane" + suffix(m.n), kind: "trace", variant: "message", style: "groove", points: [[x0, y0], [x1, y1]], length: L, grow,
      key: m.key ?? null, tone: m.key !== null && m.key !== undefined ? "key" : "neutral", dim, opacity: bk.opacity, lit: arrived ? 0 : 1, flash: 0,
      dashed: !!m.dropT || !!m.lost, lost: !!(m.dropT || m.lost), glow: arrived ? 0 : 0.5, pulses: arrived ? [] : [{ s0: Math.max(0, grow * L - 26), s1: grow * L, key: m.key ?? null, intensity: 1, a0: 0, a1: 1 }],
      x: 0, y: 0, z: 0,
    };
    poses.push(pose);
    if (!arrived && grow > 0) {
      const hx = x0 + (x1 - x0) * grow, hy = y0 + (y1 - y0) * grow;
      // it leaves the sender's rail and sinks into the receiver's: fade over the first and last 12 u
      const sh = grow * L, fadeIn = smoothstep(sh / 12), fadeOut = smoothstep((L - sh) / 12);
      poses.push({
        id: m.id + "@lanepkt" + suffix(m.n), kind: "packet", variant: "lane", x: hx, y: hy, z: 2, w: SIZE.packet.w * 0.7, d: SIZE.packet.d * 0.7, h: SIZE.packet.h * 0.7,
        yaw: Math.atan2(y1 - y0, x1 - x0) * 57.29577951308232, pitch: 0, bank: 0, scale: 1, opacity: bk.opacity * fadeIn * fadeOut, lit: 1, flash: 0, dim: 0,
        key: m.key ?? null, tone: m.key !== null && m.key !== undefined ? "key" : "neutral", text: null,
      });
    }
  }
}
