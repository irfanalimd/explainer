// Compile: Script -> Timeline. Lays out every beat-state, routes traces, times steps and beats (beat k after
// k-1, siblings staggered), and turns every op and every layout change into motion segments on entity
// "incarnations". The sampler (sampler.mjs) evaluates them for any instant.
import { MOTION, SIZE } from "../tokens.mjs";
import { ROOT } from "./builder.mjs";
import { computeLayout, scanCapacities, tileSize, gridPositions } from "./layout.mjs";
import { routeAll, busRoute } from "./routing.mjs";
import { Path } from "./path.mjs";
import { T, hopHeight, travelTime, flightPath, evalSeg } from "./transitions.mjs";
import { growBounds, canonical, hashString, lastLEn } from "./util.mjs";
import { mentions, plain } from "./narrate.mjs";
import { createSampler } from "./sampler.mjs";

const LAYOUT_SET_PROPS = new Set(["variant", "label", "size"]);
const PTR = { gap: 8, pitch: SIZE.pointer.flag + 5 };
const BEAT_MIN = 0.3;
const LOST_FADE = 0.65;                 // s a lost packet lingers, flashing fail, before it is gone

function niceCeil(x, steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
  if (!(x > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of steps) if (m * p >= x - 1e-9) return m * p;
  return 10 * p;
}

/** Monotone cubic (Fritsch-Carlson) through knots (xs strictly increasing). Returns f(x). */
function pchip(xs, ys) {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const h = [], dl = [];
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); dl.push((ys[i + 1] - ys[i]) / (h[i] || 1)); }
  const m = new Float64Array(n);
  m[0] = dl[0]; m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (dl[i - 1] * dl[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]); }
  }
  for (let i = 0; i < n - 1; i++) if (dl[i] === 0) { m[i] = 0; m[i + 1] = 0; }
  const X = Float64Array.from(xs);
  return (x) => {
    if (x <= X[0]) return ys[0];
    if (x >= X[n - 1]) return ys[n - 1];
    const i = Math.max(0, Math.min(n - 2, lastLEn(X, x)));
    const hh = h[i], t = (x - X[i]) / hh, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * hh * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * hh * m[i + 1];
  };
}

export function buildTimeline(script, { figure = {}, values = {}, scenario = null } = {}) {
  const problems = script.problems.slice();
  const steps = script.steps;
  const nSteps = steps.length;
  // reading time at 1x: an "intro" figure (meta.level) gives every caption a little longer
  const readK = figure.meta?.level === "intro" ? MOTION.readIntro : 1;
  const readTime = (caption) => {
    const words = plain(caption ?? "").split(/\s+/).filter(Boolean).length;
    const R = MOTION.read;
    return Math.min(R.max * readK, (R.base + R.perWord * words) * readK);
  };

  // ---------- states, run-wide facts ----------
  const allStates = [script.S0];
  for (const st of steps) for (const b of st.beats) if (b.state !== allStates[allStates.length - 1]) allStates.push(b.state);
  const info = scanCapacities(allStates);

  const simTimes = [];
  { let cur = 0; for (const st of steps) { if (st.simTime !== null && st.simTime !== undefined) cur = st.simTime; simTimes.push(cur); } }
  // mark times default to their step's sim time
  steps.forEach((st, i) => { for (const b of st.beats) for (const op of b.ops) if (op.op === "create" && op.rec.kind === "mark" && (op.rec.t === null || op.rec.t === undefined)) op.rec = Object.freeze({ ...op.rec, t: simTimes[i] }); });
  for (const op of script.opening) if (op.op === "create" && op.rec.kind === "mark" && op.rec.t === null) { op.rec = Object.freeze({ ...op.rec, t: 0 }); }
  const laneScale = new Map(), laneTicks = new Map();
  {
    let maxT = simTimes.length ? Math.max(...simTimes) : 0;
    for (const s of allStates) for (const r of s.values()) if (r.kind === "mark" && r.t > maxT) maxT = r.t;
    // the rail ends at the last event (plus a small margin), rounded up to a whole major tick; one major tick is a
    // round amount of time (1, 2, 2.5 or 5 x 10^k) and its spacing on the rail stretches so the ticks fill it exactly
    const major = SIZE.lane.tickMajor;
    for (const s of allStates) for (const r of s.values()) {
      if (r.kind !== "lanes" || laneScale.has(r.id)) continue;
      if (r.scale) { laneScale.set(r.id, r.scale); laneTicks.set(r.id, { major, minor: SIZE.lane.tickMinor }); continue; }
      const end = (maxT || 1) * 1.03;
      const T = niceCeil((end * major) / r.length, [1, 2, 2.5, 5, 10]);
      const n = Math.max(1, Math.ceil(end / T - 1e-9));
      laneScale.set(r.id, r.length / (n * T));
      laneTicks.set(r.id, { major: r.length / n, minor: r.length / n / 5 });
    }
  }

  // ---------- layouts and routes (cached; reused when a beat cannot change the layout) ----------
  const layoutOf = new Map(), routesOf = new Map();
  const seenProblem = new Set();
  const addLayoutProblems = (list, step) => { for (const p of list) { const k = p.kind + "|" + (p.kind === "overflow" ? p.id : p.message); if (!seenProblem.has(k)) { seenProblem.add(k); problems.push({ ...p, step }); } } };
  const layoutFor = (state, prevState, ops, step) => {
    if (layoutOf.has(state)) return layoutOf.get(state);
    let L;
    const structural = !prevState || ops.some((op) => op.op === "create" || op.op === "spawn" || op.op === "move" || op.op === "swap" || op.op === "remove" || (op.op === "deliver" && op.into) || op.op === "point" || (op.op === "set" && (Object.keys(op.props).some((k) => LAYOUT_SET_PROPS.has(k)) || (op.props.text !== undefined && prevState.get(op.id)?.kind === "text"))));
    if (!structural && layoutOf.has(prevState)) L = layoutOf.get(prevState);
    else { L = computeLayout(state, { info, laneScale }); addLayoutProblems(L.problems, step); }
    layoutOf.set(state, L);
    if (!routesOf.has(L)) {
      const prevL = prevState ? layoutOf.get(prevState) : null;
      const sameConns = prevL && routesOf.has(prevL) && !ops.some((op) => op.op === "create" && (op.rec.kind === "trace" || op.rec.kind === "bus")) && !ops.some((op) => op.op === "remove");
      if (prevL && sameConns && sameSolids(prevL, L)) routesOf.set(L, routesOf.get(prevL));
      else { const r = routeAll(L, state); addLayoutProblems(r.problems, step); routesOf.set(L, r); }
    }
    return L;
  };

  // ---------- incarnations ----------
  const incs = [];
  const live = new Map();               // id -> inc index in the state being processed
  const newInc = (rec, born) => {
    const inc = { idx: incs.length, id: rec.id, kind: rec.kind, born, died: Infinity, rest0: null, segs: [], recs: [{ t: born, rec }], flashes: [], lits: [], dim: [], meter: [], geo: [], grow: null, fade: [], morph: [] };
    incs.push(inc);
    live.set(rec.id, inc.idx);
    return inc;
  };

  // places: where an entity rests in a given state (world, or local to its parent container)
  const placesOf = new Map();           // state -> Map(id -> place)
  function computePlaces(state, layout) {
    const out = new Map();
    const ptrCount = new Map();
    for (const rec of state.values()) {
      const pl = placeFor(rec, state, layout, ptrCount);
      if (pl) out.set(rec.id, pl);
    }
    return out;
  }
  function placeFor(rec, state, layout, ptrCount) {
    const id = rec.id;
    if (rec.kind === "tile" && layout.local.has(id)) {
      const l = layout.local.get(id), pb = layout.boxes.get(l.parent), z = tileSize(rec);
      return { mode: "local", parent: live.get(l.parent), pid: l.parent, x: l.x, y: l.y, z: l.z, w: z.w, d: z.d, h: z.h, wx: pb.x + l.x, wy: pb.y + l.y, wz: l.z };
    }
    if (rec.kind === "pointer") return pointerPlace(rec, state, layout, ptrCount);
    if (rec.kind === "mark") {
      const lane = layout.lanes.get(rec.board), bb = layout.boxes.get(rec.board);
      if (!lane || !bb) return null;
      const rail = lane.rails.find((r) => r.ent === rec.lane);
      if (!rail) return null;
      const x = lane.x0 + Math.max(0, rec.t ?? 0) * lane.scale;
      return { mode: "local", parent: live.get(rec.board), pid: rec.board, x: x - bb.x, y: rail.y - bb.y, z: 0, w: 7, d: 7, h: 3, wx: x, wy: rail.y, wz: 0 };
    }
    const b = layout.boxes.get(id);
    if (!b) return null;
    const pl = { mode: "world", x: b.x, y: b.y, z: 0, w: b.w, d: b.d, h: b.h ?? 0, wx: b.x, wy: b.y, wz: 0 };
    if (b.tray) pl.tray = b.tray;
    if (rec.kind === "container") Object.assign(pl, plateDecor(rec, layout));
    return pl;
  }
  // index numbers and bitfield brackets printed on a plate, local to its centre
  function plateDecor(rec, layout) {
    const tr = layout.trays.get(rec.id);
    if (!tr) return {};
    const { spec, tray } = tr;
    const cap = Math.max(spec.capacity, rec.children.length);
    const pos = gridPositions(spec, new Array(cap).fill(spec.slot));
    const sx = (k) => tray.x - spec.gw / 2 + pos[k][0];
    const out = {};
    const frontY = tray.y + tray.d / 2;
    if (rec.indices) out.slots = pos.map((p, k) => [sx(k), frontY + (SIZE.tile.sub + 7) / 2 - 1]);
    if (rec.fields?.length) {
      const width = cap, yt = frontY + (rec.indices ? SIZE.tile.sub + 7 : 0) + 2, sw = spec.slot.w;
      out.brackets = rec.fields.map((f) => {
        const kl = width - 1 - f.to, kr = width - 1 - f.from;
        if (kl < 0 || kr >= width) return null;
        const xl = sx(kl) - sw / 2 + 1, xr = sx(kr) + sw / 2 - 1;
        return { name: f.name, label: f.label ?? f.name, key: f.key === null || f.key === undefined ? null : keyIndexOf(f.key), lx: (xl + xr) / 2, ly: yt + 12, points: [[xl, yt], [xl, yt + 4], [xr, yt + 4], [xr, yt]] };
      }).filter(Boolean);
    }
    return out;
  }
  function keyIndexOf(name) { const k = script.keys.find((x) => x.name === String(name)); return k ? k.index : null; }
  function slotLocal(state, layout, cid, index) {
    const c = state.get(cid);
    const tid = c?.children?.[index];
    if (tid && layout.local.has(tid)) { const l = layout.local.get(tid); const z = tileSize(state.get(tid)); return { x: l.x, y: l.y, z: l.z, d: z.d }; }
    const tr = layout.trays.get(cid);
    if (!tr) return null;
    const sizes = new Array(index + 1).fill(tr.spec.slot);
    const pos = gridPositions(tr.spec, sizes)[index];
    return { x: tr.tray.x - tr.spec.gw / 2 + pos[0], y: tr.tray.y - tr.spec.gd / 2 + pos[1], z: tr.z, d: tr.spec.slot.d };
  }
  function pointerPlace(rec, state, layout, ptrCount) {
    let cid, index;
    if (rec.follow === "tile" && rec.target && state.get(rec.target)?.parent) { cid = state.get(rec.target).parent; index = state.get(cid).children.indexOf(rec.target); }
    else if (rec.slot) { cid = rec.slot.parent; index = rec.slot.index; }
    if (!cid || !state.has(cid)) return null;
    const sl = slotLocal(state, layout, cid, index);
    const cb = layout.boxes.get(cid);
    if (!sl || !cb) return null;
    const key = cid + "#" + index;
    const k = ptrCount.get(key) ?? 0;
    ptrCount.set(key, k + 1);
    // a rod stands on the floor in front of its container, or in front of the housing whose tray holds the tile
    const floor = cb.kind === "container" || cb.kind === "housing";
    const y = floor ? cb.d / 2 + PTR.gap + k * PTR.pitch : sl.y + sl.d / 2 + 4 + k * PTR.pitch;
    const z = floor ? 0 : sl.z;
    return { mode: "local", parent: live.get(cid), pid: cid, x: sl.x, y, z, w: SIZE.pointer.flag, d: SIZE.pointer.flag, h: SIZE.pointer.h, wx: cb.x + sl.x, wy: cb.y + y, wz: z };
  }
  const placeSame = (a, b) => {
    if (!a || !b) return a === b;
    if (a.mode !== b.mode || a.parent !== b.parent) return false;
    return Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05 && Math.abs(a.z - b.z) < 0.05 && Math.abs((a.w ?? 0) - (b.w ?? 0)) < 0.05 && Math.abs((a.d ?? 0) - (b.d ?? 0)) < 0.05;
  };

  // ---------- S0 ----------
  const L0 = layoutFor(script.S0, null, [], 0);
  for (const rec of script.S0.values()) newInc(rec, -Infinity);
  placesOf.set(script.S0, computePlaces(script.S0, L0));
  for (const [id, pl] of placesOf.get(script.S0)) incs[live.get(id)].rest0 = pl;
  for (const inc of incs) if (inc.kind === "trace" || inc.kind === "bus") inc.geo0 = geomOf(routesOf.get(L0), inc.id);

  function geomOf(routes, id) {
    return routes.traces.get(id) ?? routes.buses.get(id) ?? null;
  }

  // ---------- per step: plan, time, instantiate ----------
  const stepOut = [];
  const phases = [];
  const events = [];
  const counterEvents = [];             // { t, name, value }
  const tagsByStep = [];
  const flights = [];                   // segments that light traces/buses (tile moves and packets)
  const messages = [];                  // lane diagonals
  const prints = [];                    // floor prints under air sends
  const heldOpen = new Map();           // packet id -> { seg, msg, sendStep }
  const simLatencies = [];              // sim ms of delivered held messages (to place lost ones)
  const focusByStep = [];
  const beatStates = [];
  let t = 0;
  let prevState = script.S0;
  let prevPhase = undefined;
  const startCounters = [];
  let curCounters = {};
  for (const op of script.opening) if (op.op === "count" || op.op === "gauge") curCounters[op.name] = op.value;

  for (let i = 0; i < nSteps; i++) {
    const st = steps[i];
    startCounters.push(Object.freeze({ ...curCounters }));
    const touched = new Map();          // id -> bounds for focus
    const touch = (id, place) => {
      if (!place) return;
      const b = touched.get(id) ?? null;
      touched.set(id, growBounds(b, place.wx - place.w / 2, place.wy - place.d / 2, place.wx + place.w / 2, place.wy + place.d / 2, place.wz, place.wz + (place.h ?? 0)));
    };
    const touchPoint = (key, x, y, z, r = 8) => touched.set(key, growBounds(touched.get(key) ?? null, x - r, y - r, x + r, y + r, 0, z));

    // 1. plan every beat: layouts, routes and natural durations
    const plans = [];
    let P = prevState;
    for (let b = 0; b < st.beats.length; b++) {
      const beat = st.beats[b];
      const N = beat.state;
      const LP = layoutOf.get(P) ?? layoutFor(P, null, [], i);
      const LN = layoutFor(N, P, beat.ops.filter((o) => !o.opening), i);
      const plan = { b, P, N, LP, LN, RP: routesOf.get(LP), RN: routesOf.get(LN), ops: [], slots: 0 };
      for (const op of beat.ops) {
        if (op.opening) continue;
        const p = planOp(op, plan, i);
        plan.ops.push(p);
      }
      let slot = 0, nat = 0;
      for (const p of plan.ops) if (p.visual) { p.slot = slot++; }
      plan.slots = slot;
      for (const p of plan.ops) if (p.visual) nat = Math.max(nat, p.nd + p.slot * MOTION.stagger);
      plan.nat = plan.ops.length ? Math.max(BEAT_MIN, nat) : (st.beats.length === 1 ? MOTION.step : BEAT_MIN);
      plans.push(plan);
      P = N;
    }

    // 2. timing: beats fill the step in proportion to their natural lengths
    const sumNat = plans.reduce((a, p) => a + p.nat, 0);
    let dur = st.dur ?? Math.max(MOTION.step, sumNat), fill = dur;
    const paced = st.dur === null && st.pace && st.simTime !== null && i + 1 < nSteps;
    if (paced) {
      const dt = Math.max(0, simTimes[i + 1] - simTimes[i]);
      dur = fill = Math.min(st.pace.max, Math.max(st.pace.min, dt / st.pace.ms));
      // a sim-timed step still holds long enough to read its caption (unless s.pace({ read: false })); packets keep
      // their speed, the hold follows
      const read = readTime(st.caption);
      if (st.pace.read !== false && read > dur) dur = read;
    } else if (st.dur === null) {
      // reading time: the caption must be readable at 1x; motion keeps (nearly) its natural speed and a hold follows
      const read = readTime(st.caption);
      if (read > dur) { fill = Math.min(read, dur * MOTION.read.stretch); dur = read; }
    }
    const t0 = t, t1 = t + dur;
    let bt = t0;
    for (const plan of plans) {
      const bd = fill * (plan.nat / sumNat);
      plan.B0 = bt; plan.B1 = plan.M1 = bt + bd; bt += bd;
      const n = plan.slots;
      const stag = n > 1 ? Math.min(MOTION.stagger, (0.4 * bd) / (n - 1)) : 0;
      const D = bd - (n > 1 ? (n - 1) * stag : 0);
      for (const p of plan.ops) {
        if (p.visual) { p.w0 = plan.B0 + p.slot * stag; p.w1 = p.w0 + D; }
        else { p.w0 = plan.B0; p.w1 = plan.B1; }
      }
    }
    plans[plans.length - 1].B1 = t1;

    // 3. instantiate
    const stepTags = [];
    for (const plan of plans) instantiate(plan, i, { t0, t1, touch, touchPoint, stepTags });

    // phases, events, counters
    const phaseName = st.phase !== undefined ? st.phase : prevPhase;
    if (i === 0 || phaseName !== prevPhase) phases.push({ name: phaseName ?? "", step: i, t0, t1, about: st.about ?? null });
    else if (st.about && !phases[phases.length - 1].about) phases[phases.length - 1].about = st.about;
    phases[phases.length - 1].t1 = t1;
    prevPhase = phaseName;
    const kinds = new Set();
    const evSeen = new Set();
    for (const plan of plans) for (const p of plan.ops) {
      kinds.add(p.op.op);
      for (const k of p.events ?? []) if (!evSeen.has(k)) { evSeen.add(k); events.push({ t: p.w0, kind: k, step: i }); }
      // a counter changes once its beat's motion has mostly landed (not 70% into a reading hold that follows it)
      if (p.op.op === "count" || p.op.op === "gauge") { counterEvents.push({ t: plan.B0 + 0.7 * (plan.M1 - plan.B0), name: p.op.name, value: p.op.value }); curCounters[p.op.name] = p.op.value; }
    }
    if (st.ask) events.push({ t: t0, kind: "ask", step: i });
    tagsByStep.push(stepTags);

    // focus: everything touched this step, unless the figure says otherwise
    let focus = null;
    if (st.focus?.length) {
      const N = plans[plans.length - 1].N;
      const pl = placesOf.get(N);
      // a zone drawn around entities has no place of its own: focusing it frames its members (with the zone's pad)
      const ids = st.focus.flatMap((id) => { const r = N.get(id); return r?.kind === "zone" && r.around?.length ? r.around : [id]; });
      for (const id of ids) { const p = pl.get(id); if (p) focus = growBounds(focus, p.wx - p.w / 2, p.wy - p.d / 2, p.wx + p.w / 2, p.wy + p.d / 2, 0, p.h ?? 0); }
      if (focus && ids.length !== st.focus.length) {
        const z = SIZE.zone.pad;
        focus = growBounds(focus, focus.minX - z, focus.minY - z, focus.maxX + z, focus.maxY + z, focus.minZ ?? 0, focus.maxZ ?? 0);
      }
    }
    if (!focus) for (const b of touched.values()) focus = growBounds(focus, b.minX, b.minY, b.maxX, b.maxY, b.minZ, b.maxZ);
    focusByStep.push(focus);

    beatStates.push(plans.map((p) => p.N));
    stepOut.push({
      index: i, t0, t1, dur, caption: st.caption, phase: phaseName ?? "", simTime: simTimes[i], ask: st.ask ?? null,
      kinds: [...kinds], beats: plans.map((p) => ({ t0: p.B0, t1: p.B1 })), line: st.line,
      ...(st.keep ? { keep: true } : {}),
    });
    t = t1;
    prevState = plans[plans.length - 1].N;
  }
  const duration = t;

  // ---------- simulated time, held messages, lane diagonals ----------
  const knotT = stepOut.map((s) => s.t0), knotV = simTimes.slice();
  knotT.push(duration); knotV.push(simTimes[simTimes.length - 1] ?? 0);
  // keep knots strictly increasing
  const kx = [], ky = [];
  knotT.forEach((x, k) => { if (!kx.length || x > kx[kx.length - 1] + 1e-9) { kx.push(x); ky.push(knotV[k]); } else ky[ky.length - 1] = knotV[k]; });
  const sim = pchip(kx, ky);
  for (const f of flights) {
    const seg = f.seg;
    if (seg.type !== "flight" || !seg.held) continue;
    if (seg.tArr === null) {
      // never delivered: it keeps travelling at the median pace and stops short of the receiver
      const delivered = flights.filter((g) => g.seg.held && g.seg.tArr !== null).map((g) => g.seg.tArr - g.seg.t0).sort((a, b) => a - b);
      seg.tArr = seg.t0 + (delivered.length ? delivered[delivered.length >> 1] : MOTION.step * 2);
      seg.cap = 0.9;
      seg.simB = null;
    }
    seg.simA = sim(seg.t0);
    seg.sim = seg.simB !== null && seg.simB - seg.simA > 1e-6;
    if (seg.simOff > 0 && seg.sim) {
      // a late departure: it leaves when the playhead's sim time passes t + offset (found by bisection; sim is monotone)
      const target = Math.min(seg.simB - 1e-6, seg.simA + seg.simOff);
      let lo = seg.t0, hi = seg.tArr;
      for (let k = 0; k < 48; k++) { const mid = (lo + hi) / 2; if (sim(mid) < target) lo = mid; else hi = mid; }
      depart(seg, hi);
      seg.simA = target;
    } else if (seg.fracOff > 0 && !seg.sim && seg.tArr > seg.t0) depart(seg, seg.t0 + Math.min(0.95, seg.fracOff) * 0.6 * (seg.tArr - seg.t0));
  }
  function depart(seg, t) {
    seg.t0 = t;
    if (seg.flight) seg.flight.start = t;
    if (seg.print) seg.print.t0 = t;
  }
  for (const m of messages) {
    m.tSend = simTimes[m.sendStep] + (m.simOff ?? 0);
    m.tRecv = m.deliverStep !== null ? simTimes[m.deliverStep] : m.held ? null : simTimes[Math.min(nSteps - 1, m.sendStep + 1)];
    if (m.lost && m.tRecvV !== undefined) m.tRecv = m.tRecvV;
    m.useSim = m.tRecv !== null && m.tRecv > m.tSend;
    // on the board a message lives in simulated time: it leaves its rail exactly when the playhead passes t_send
    if (m.useSim) m.t0 = m.tStep;
  }

  // ---------- world bounds (stable across the run) ----------
  let world = null;
  for (const L of new Set(layoutOf.values())) world = growBounds(world, L.bounds.minX, L.bounds.minY, L.bounds.maxX, L.bounds.maxY, 0, L.bounds.maxZ);
  for (const R of new Set(routesOf.values())) {
    for (const r of R.traces.values()) for (const p of r.path.points) world = growBounds(world, p[0], p[1], p[0], p[1]);
  }
  for (const R of new Set(routesOf.values())) for (const b of R.buses.values()) {
    for (const p of b.trunk.points) world = growBounds(world, p[0], p[1], p[0], p[1]);
    for (const br of b.branches) for (const p of br.path.points) world = growBounds(world, p[0], p[1], p[0], p[1]);
  }
  // things that stand outside their container's box: pointers (rod + flag) and lane marks
  for (const [state, places] of placesOf) for (const [id, pl] of places) {
    const k = state.get(id)?.kind;
    if (k === "pointer" || k === "mark") world = growBounds(world, pl.wx - pl.w / 2, pl.wy - pl.d / 2, pl.wx + pl.w / 2, pl.wy + pl.d / 2, pl.wz, pl.wz + (pl.h ?? 0));
  }
  // zones drawn around members reach SIZE.zone.pad beyond them
  for (const [state, places] of placesOf) for (const rec of state.values()) {
    if (rec.kind !== "zone") continue;
    for (const id of rec.around) { const pl = places.get(id); if (pl) world = growBounds(world, pl.wx - pl.w / 2 - SIZE.zone.pad, pl.wy - pl.d / 2 - SIZE.zone.pad, pl.wx + pl.w / 2 + SIZE.zone.pad, pl.wy + pl.d / 2 + SIZE.zone.pad); }
  }
  world = world ?? { minX: -100, minY: -100, maxX: 100, maxY: 100, minZ: 0, maxZ: 0 };
  // the highest anything flies: hop and arc peaks, tiles lifted over housings
  for (const inc of incs) for (const sg of inc.segs) {
    let top = 0;
    if (sg.H) top = Math.max(sg.from?.wz ?? 0, sg.to?.wz ?? 0, sg.src?.[2] ?? 0) + sg.H + (sg.type === "flight" ? SIZE.packet.lift : 0) + SIZE.tile.h;
    else if (sg.prof) top = Math.max(sg.prof.z0, sg.prof.z1, sg.prof.hA, sg.prof.hB) + MOTION.lift + T.clear + SIZE.page.h;
    if (top > world.maxZ) world.maxZ = top;
  }
  for (let i = 0; i < focusByStep.length; i++) if (!focusByStep[i]) focusByStep[i] = i ? focusByStep[i - 1] : world;
  // the world always contains every step's focus
  for (const f of focusByStep) world = growBounds(world, f.minX, f.minY, f.maxX, f.maxY, f.minZ ?? 0, f.maxZ ?? 0);

  // lane boards: rails relative to the board centre, plus ruler labels
  const laneGeo = new Map();
  for (const L of layoutOf.values()) for (const [id, lane] of L.lanes) {
    if (laneGeo.has(id)) continue;
    const bb = L.boxes.get(id);
    const rec = allStates.find((s) => s.has(id)).get(id);
    const labels = [];
    const ticks = laneTicks.get(id) ?? { major: SIZE.lane.tickMajor, minor: SIZE.lane.tickMinor };
    for (let x = 0; x <= lane.length + 0.01; x += ticks.major) labels.push({ x, text: fmtTime(x / lane.scale, lane.unit) });
    laneGeo.set(id, {
      ticks,
      x0: lane.x0 - bb.x, x1: lane.x1 - bb.x, labelX: lane.labelX - bb.x, length: lane.length, scale: lane.scale, unit: lane.unit,
      rails: lane.rails.map((r) => ({ ent: r.ent, y: r.y - bb.y })), labels, title: rec.label ?? null,
    });
  }

  // ---------- finalise incarnations ----------
  for (const inc of incs) {
    inc.segs.sort((a, b) => a.t0 - b.t0);
    inc.segT0 = Float64Array.from(inc.segs.map((s) => s.t0));
    inc.recT = Float64Array.from(inc.recs.map((r) => r.t));
    inc.flashT = Float64Array.from(inc.flashes.map((f) => f.t));
    mergeLits(inc);
  }
  const incsById = new Map();
  for (const inc of incs) { if (!incsById.has(inc.id)) incsById.set(inc.id, []); incsById.get(inc.id).push(inc.idx); }
  const alive = stepOut.map((s) => {
    const list = [];
    for (const inc of incs) if (inc.born < s.t1 + 1e-9 && inc.died > s.t0) list.push(inc.idx);
    return Int32Array.from(list);
  });
  const flightsByStep = stepOut.map((s) => flights.filter((f) => f.seg.t0 < s.t1 && (f.end ?? f.seg.t1) + T.trailFade > s.t0));
  const messagesByStep = stepOut.map((s) => messages.filter((m) => m.t0 < s.t1));
  const printsByStep = stepOut.map((s) => prints.filter((pr) => pr.t0 < s.t1 && (pr.seg.tArr ?? Infinity) + T.printFade > s.t0));

  // captions may only reference real things
  steps.forEach((st, i) => {
    const { refs } = mentions(st.caption);
    const known = (id) => allStates.some((s) => s.has(id));
    for (const r of refs) if (!known(r)) problems.push({ kind: "unknown-ref", message: `caption of step ${i} refers to unknown entity "${r}"`, step: i, id: r });
  });
  phases.forEach((ph) => {
    if (!ph.about) return;
    const known = (id) => allStates.some((s) => s.has(id));
    for (const r of mentions(ph.about).refs) if (!known(r)) problems.push({ kind: "unknown-ref", message: `about of chapter "${ph.name}" refers to unknown entity "${r}"`, step: ph.step, id: r });
  });

  // ---------- hash ----------
  const hash = hashString(canonical({ opening: script.opening, steps: steps.map((s) => ({ c: s.caption, d: s.dur, t: s.simTime, p: s.phase, ...(s.about ? { pa: s.about } : {}), a: s.ask, f: s.focus, l: s.line, b: s.beats.map((b) => b.ops) })) }));

  // ---------- snapshots ----------
  const snapState = (i) => (i <= 0 ? script.S0 : steps[i - 1].beats[steps[i - 1].beats.length - 1].state);
  const finalCounters = Object.freeze({ ...curCounters });
  const snapshots = new Map();
  const snapshot = (i) => {
    i = Math.max(0, Math.min(nSteps, i | 0));
    if (snapshots.has(i)) return snapshots.get(i);
    const state = snapState(i);
    const snap = Object.freeze({
      index: i, final: i === nSteps, entities: state, counters: i < nSteps ? startCounters[i] : finalCounters,
      phase: i < nSteps ? stepOut[i].phase : stepOut[nSteps - 1]?.phase ?? "", simTime: i < nSteps ? simTimes[i] : simTimes[nSteps - 1] ?? 0,
      line: i > 0 ? steps[i - 1].line : null,
    });
    snapshots.set(i, snap);
    return snap;
  };

  const counterDefs = { ...(figure.counters ?? {}) };
  for (const e of counterEvents) if (!counterDefs[e.name]) counterDefs[e.name] = { label: e.name, format: "int" };
  for (const k of Object.keys(curCounters)) if (!counterDefs[k]) counterDefs[k] = { label: k, format: "int" };

  const tl = {
    duration, steps: stepOut, phases, events: events.sort((a, b) => a.t - b.t), keys: script.keys, counters: counterDefs,
    snapshot, get final() { return snapshot(nSteps); }, hash, problems, world,
    meta: figure.meta ?? {}, values, scenario, code: figure.code ?? null,
    stepAt(time) { if (!nSteps) return 0; const k = lastLEn(stepT0, time); return Math.max(0, Math.min(nSteps - 1, k)); },
    timeOf(step, u = 0) { const s = stepOut[Math.max(0, Math.min(nSteps - 1, step))]; return s ? s.t0 + u * s.dur : 0; },
    sim,
    // internals for the sampler and tests
    _: { incsById, incs, alive, flightsByStep, messagesByStep, printsByStep, tagsByStep, focusByStep, counterEvents, startCounters, layoutOf, routesOf, live, steps: stepOut, beatStates, laneGeo },
  };
  const stepT0 = Float64Array.from(stepOut.map((s) => s.t0));
  tl.sample = createSampler(tl);
  return tl;

  // =====================================================================================================
  // op planning: geometry + natural duration (before the beat's timing is known)
  function planOp(op, plan, step) {
    const p = { op, visual: false, nd: 0, events: [] };
    const { P, N, LP, LN } = plan;
    const RN = routesOf.get(LN), RP = routesOf.get(LP);
    const placesP = placesOf.get(P) ?? (placesOf.set(P, computePlaces(P, LP)), placesOf.get(P));
    const pNew = (id) => {
      // place in N computed on demand with the incarnations N will have (new ids get a provisional parent lookup)
      const rec = N.get(id);
      if (!rec) return null;
      return placeFor(rec, N, LN, new Map());
    };
    switch (op.op) {
      case "create": {
        p.visual = true;
        p.nd = MOTION.enter + 0.15;
        if (op.rec.kind === "mark") p.events.push("mark");
        break;
      }
      case "spawn": {
        p.visual = true;
        const to = pNew(op.id);
        const src = op.from ? sourcePoint(op.from, P, placesP, LP) : null;
        p.inPlace = !src || op.from === op.rec.parent;
        if (p.inPlace) { p.nd = MOTION.enter + 0.2; break; }
        const route = to ? routeBetween(boxHome(op.from, P), boxHome(op.rec.parent, N), op.via, RP, RN) : null;
        p.src = src; p.route = route;
        if (route && to) {
          const fp = flightPath([src[0], src[1]], [to.wx, to.wy], route.raw);
          p.fp = fp;
          p.nd = 0.25 + travelTime(fp.path.length);
        } else p.nd = 0.2 + travelTime(to ? Math.hypot(to.wx - src[0], to.wy - src[1]) : 0) * 0.85;
        p.events.push("spawn");
        break;
      }
      case "move": {
        p.visual = true;
        const from = placesP.get(op.id), to = pNew(op.id);
        p.from = from; p.to = to;
        if (!from || !to) { p.nd = MOTION.step; break; }
        if (op.fromParent === op.to || op.via === "air") { p.kind = "hop"; p.nd = travelTime(Math.hypot(to.wx - from.wx, to.wy - from.wy)) * 0.85; break; }
        const route = routeBetween(boxHome(op.fromParent, P), boxHome(op.to, N), op.via, RP, RN);
        if (route) {
          p.kind = "path"; p.route = route;
          p.fp = flightPath([from.wx, from.wy], [to.wx, to.wy], route.raw);
          p.nd = travelTime(p.fp.path.length);
        } else { p.kind = "hop"; p.nd = travelTime(Math.hypot(to.wx - from.wx, to.wy - from.wy)) * 0.85; }
        p.events.push("move");
        break;
      }
      case "swap": {
        p.visual = true;
        const a = placesP.get(op.a), b = placesP.get(op.b);
        p.nd = travelTime(a && b ? Math.hypot(a.wx - b.wx, a.wy - b.wy) : 0) * 0.85;
        break;
      }
      case "remove": {
        p.visual = true;
        p.nd = op.to ? travelTime(60) * 0.8 : MOTION.exit + 0.15;
        p.events.push("remove");
        break;
      }
      case "set": {
        const pr = op.props, prev = op.prev;
        const visible = ["text", "sub", "key", "tone", "led", "title", "meter", "dim", "variant", "label", "size", "around", "dashed", "arrow"].some((k) => pr[k] !== undefined && pr[k] !== prev[k]);
        p.visual = visible;
        p.nd = pr.text !== undefined && pr.text !== prev.text ? MOTION.roll + 0.32 : 0.5;
        if (pr.led === "fail" || pr.tone === "fail") p.events.push("fail");
        else if (pr.led === "warn" || pr.tone === "warn") p.events.push("warn");
        else if ((pr.led === "ok" && prev.led === "fail") || (pr.dim === false && prev.dim)) p.events.push("recover");
        break;
      }
      case "send": {
        p.visual = true;
        const route = op.via === "air" ? null : routeBetween(boxHome(op.from, P), boxHome(op.to, P), op.via, RP, RN);
        p.route = route;
        const ends = packetEnds(op.from, op.to, LP, P, route);
        p.ends = ends;
        p.nd = op.hold ? 0.45 : travelTime(ends.path.length);
        p.events.push("send");
        break;
      }
      case "deliver": {
        p.visual = true;
        p.nd = op.into ? travelTime(60) : T.absorb + 0.3;
        p.events.push("deliver");
        break;
      }
      case "point": { p.visual = true; p.nd = 0.6; break; }
      default: break;   // annotations: lit, tag, count, gauge, line
    }
    return p;
  }

  function sourcePoint(fromId, state, places, layout) {
    const rec = state.get(fromId);
    const pl = places.get(fromId);
    if (!rec || !pl) return null;
    if (rec.kind === "tile") return [pl.wx, pl.wy, pl.wz + (pl.h ?? 0)];
    const b = layout.boxes.get(fromId);
    if (b?.tray) {
      const z = rec.kind === "housing" ? (SIZE.variant[rec.variant] ?? SIZE.variant.node).h - SIZE.well.depth : SIZE.plate.h;
      return [b.x + b.tray.x, b.y + b.tray.y, z];
    }
    return [pl.wx, pl.wy, pl.h ?? 0];
  }

  // the box a tile's container attaches connections to (the container itself, or its housing)
  function boxHome(id, state) {
    let cur = id;
    for (let k = 0; k < 8 && cur; k++) {
      const r = state.get(cur);
      if (!r) return null;
      if (r.kind === "housing" || r.kind === "container") return cur;
      cur = r.parent;
    }
    return null;
  }

  // a route between two boxes: a named trace/bus, or the trace/bus that connects them
  function routeBetween(a, b, via, RP, RN) {
    // a send from a box to itself only has a way to go along a named trace (a self-loop)
    if (!a || !b || (a === b && !(via && via !== "auto" && via !== "air"))) return null;
    const pick = (R) => {
      if (!R) return null;
      const tr = (r) => {
        if (r.fromBox === a && r.toBox === b) return { kind: "trace", id: r.id, raw: r.raw, rev: false, route: r };
        if (r.fromBox === b && r.toBox === a) return { kind: "trace", id: r.id, raw: r.raw.slice().reverse(), rev: true, route: r };
        return null;
      };
      const bs = (bus) => {
        const br = busRoute(bus, a, b);
        if (br) return { kind: "bus", id: bus.id, raw: br.raw, bus, br };
        // against the bus's direction (a reply): the same route, travelled backwards
        const rb = busRoute(bus, b, a);
        if (!rb) return null;
        const key = `${b}<${a}`;
        if (!bus.routes.has(key)) bus.routes.set(key, { raw: rb.raw.slice().reverse(), path: rb.path.reversed(), bf: rb.bt, bt: rb.bf, rev: true });
        const r = bus.routes.get(key);
        return { kind: "bus", id: bus.id, raw: r.raw, bus, br: r };
      };
      if (via && via !== "auto" && via !== "air") {
        if (R.traces.has(via)) return tr(R.traces.get(via)) ?? { kind: "trace", id: via, raw: R.traces.get(via).raw, rev: false, route: R.traces.get(via) };
        if (R.buses.has(via)) return bs(R.buses.get(via));
        return null;
      }
      for (const r of R.traces.values()) { const x = tr(r); if (x) return x; }
      for (const bus of R.buses.values()) {
        const on = (id) => bus.branches.some((x) => x.of === id);
        if (on(a) && on(b)) { const x = bs(bus); if (x) return x; }
      }
      return null;
    };
    return pick(RN) ?? pick(RP);
  }

  // packet route: along a trace/bus from port to port, or an air arc between facing edges
  function packetEnds(fromId, toId, layout, state, route) {
    if (route) {
      if (route.kind === "trace") return { path: route.rev ? route.route.path.reversed() : route.route.path, air: false };
      return { path: route.br.path, air: false };
    }
    const box = (id) => { let cur = id; for (let k = 0; k < 8 && cur; k++) { const b = layout.boxes.get(cur); if (b && b.kind !== "spacer") return b; cur = state.get(cur)?.parent; } return null; };
    const A = box(fromId), B = box(toId);
    const placesS = placesOf.get(state);
    const pa = placesS?.get(fromId), pb = placesS?.get(toId);
    const ax = pa ? pa.wx : A?.x ?? 0, ay = pa ? pa.wy : A?.y ?? 0, bx = pb ? pb.wx : B?.x ?? 0, by = pb ? pb.wy : B?.y ?? 0;
    const L0 = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L0, uy = (by - ay) / L0;
    const edge = (b, dx, dy) => { if (!b) return 0; if (b.round) return b.w / 2; const tx = Math.abs(dx) > 1e-6 ? b.w / 2 / Math.abs(dx) : Infinity, ty = Math.abs(dy) > 1e-6 ? b.d / 2 / Math.abs(dy) : Infinity; const m = Math.min(tx, ty); return Number.isFinite(m) ? m : 0; };
    const ea = A && (!pa || pa.mode === "world") ? edge(A, ux, uy) : 6, eb = B && (!pb || pb.mode === "world") ? edge(B, ux, uy) : 6;
    const s = [ax + ux * ea, ay + uy * ea], e = [bx - ux * eb, by - uy * eb];
    const path = new Path([s, e]);
    return { path, air: true, H: hopHeight(path.length) };
  }

  // =====================================================================================================
  function instantiate(plan, step, ctx) {
    const { P, N, LN } = plan;
    const RN = routesOf.get(LN);
    const placesP = placesOf.get(P);
    const segmented = new Set();
    const causeOf = new Map();          // parent id -> [w0, w1] of the first op that touched it
    const recTime = new Map();          // id -> time its record changes
    // dir: "out" (something left this parent), "in" (something arrived), "any"
    const cause = (pid, p, dir = "any") => {
      if (!pid) return;
      const c = causeOf.get(pid);
      if (!c) causeOf.set(pid, [p.w0, p.w1, dir]);
      else if (c[2] !== dir) c[2] = "any";
    };
    // explicit attention lasts the step; automatic attention (moved, spawned) lasts its beat
    const lit = (id, from, until = ctx.t1) => { const idx = live.get(id); if (idx !== undefined) incs[idx].lits.push([from, until]); };
    const flash = (id, at, a) => { const idx = live.get(id); if (idx !== undefined) incs[idx].flashes.push({ t: at, a }); };

    // removals first (they free ids), then creations (so N places see the new incarnations)
    for (const p of plan.ops) {
      const op = p.op;
      if (op.op !== "remove") continue;
      const removed = removedTree(op.id, P);
      const pr = P.get(op.id);
      cause(pr?.parent, p, "out");
      removed.forEach((rid, k) => {
        const idx = live.get(rid);
        if (idx === undefined) return;
        const inc = incs[idx];
        const from = currentPlace(inc, p.w0, placesP.get(rid));
        if (k === 0 && op.to && from) {
          const target = placesOf.get(P)?.get(op.to) ?? null;
          const tb = target ? target : null;
          const dist = tb ? Math.hypot(tb.wx - from.wx, tb.wy - from.wy) : 0;
          const dir = tb && dist > 0 ? [(tb.wx - from.wx) / dist, (tb.wy - from.wy) / dist] : [0, 0];
          if (tb) {
            inc.segs.push({ type: "consume", t0: p.w0, t1: p.w1, from, target: tb, top: tb.h ?? 0, H: hopHeight(dist) * 0.8, dir });
            inc.died = p.w1;
            flash(op.to, p.w1 - 0.04, 0.75);
            ctx.touch(rid, from); ctx.touch(op.to, tb);
            lit(op.to, p.w1 - 0.1);
            return;
          }
        }
        if (inc.kind === "zone") {
          const ex = Math.min(MOTION.exit, p.w1 - p.w0);
          inc.fade.push({ t0: p.w0, t1: p.w0 + ex, v0: 1, v1: 0 });
          inc.died = p.w0 + ex;
          return;
        }
        if (inc.kind === "packet" && heldOpen.has(rid)) {
          const h = heldOpen.get(rid);
          heldOpen.delete(rid);
          const m = messages.find((x) => x.id === rid && x.deliverStep === null);
          if (simTimes[step] > simTimes[h.sendStep]) {
            // it got there (at this step's sim time) and was discarded: arrive, then sink at the receiver
            h.seg.tArr = ctx.t0; h.seg.simB = simTimes[step]; h.seg.t1 = p.w0;
            if (m) { m.deliverStep = step; m.lost = true; }
            inc.segs.push({ type: "exit", t0: p.w0, t1: p.w0 + MOTION.exit, from: h.seg.to, style: "sink", depth: SIZE.packet.lift });
            inc.died = p.w0 + MOTION.exit;
            return;
          }
          // dropped in flight at the same instant: it stops where it is and sinks; its diagonal stops growing there
          h.seg.tArr = p.w0 + MOTION.step; h.seg.simB = null; h.seg.t1 = p.w0; h.seg.dropped = true;
          if (m) m.dropT = p.w0;
          const o = {};
          evalSeg(h.seg, p.w0, { sim: () => 0, pose: () => null, reduced: false }, o);
          const at = { mode: "world", x: o.x, y: o.y, z: o.z, w: SIZE.packet.w, d: SIZE.packet.d, h: SIZE.packet.h, wx: o.x, wy: o.y, wz: o.z };
          inc.segs.push({ type: "exit", t0: p.w0, t1: p.w0 + MOTION.exit, from: at, style: "sink", depth: SIZE.packet.lift });
          inc.died = p.w0 + MOTION.exit;
          return;
        }
        if (inc.kind === "packet" && from) {
          inc.segs.push({ type: "exit", t0: p.w0, t1: p.w0 + MOTION.exit, from, style: "sink", depth: SIZE.packet.lift });
          inc.died = p.w0 + MOTION.exit;
          return;
        }
        const ex = Math.min(MOTION.exit, p.w1 - p.w0);
        if (from) inc.segs.push({ type: "exit", t0: p.w0, t1: p.w0 + ex, from, style: k === 0 ? op.style : "fade", depth: (from.h ?? 0) + 2 });
        inc.died = p.w0 + ex;
        if (k === 0) ctx.touch(rid, from);
      });
      for (const rid of removed) live.delete(rid);
      segmented.add(op.id);
    }
    for (const p of plan.ops) {
      const op = p.op;
      if (op.op === "create" || op.op === "spawn") { newInc(op.rec, p.w0); }
      else if (op.op === "send") {
        const inc = newInc(op.rec, p.w0);
        if (!op.hold) live.delete(op.id);
        p.inc = inc;
      }
    }
    // N places (with N's incarnations)
    let placesN;
    const reuse = placesP && plan.LP === LN && !plan.ops.some((p) => ["create", "spawn", "remove", "deliver", "send", "move", "swap", "point"].includes(p.op.op));
    placesN = reuse ? placesP : computePlaces(N, LN);
    placesOf.set(N, placesN);

    for (const p of plan.ops) {
      const op = p.op;
      switch (op.op) {
        case "create": {
          const inc = incs[live.get(op.id)];
          const to = placesN.get(op.id);
          const k = op.rec.kind;
          inc.rest0 = to;
          if (k === "trace" || k === "bus") { inc.geo0 = geomOf(RN, op.id); inc.grow = { t0: p.w0, t1: p.w1 }; break; }
          if (k === "zone") { inc.fade.push({ t0: p.w0, t1: p.w0 + Math.min(MOTION.enter, p.w1 - p.w0), v0: 0, v1: 1 }); segmented.add(op.id); break; }
          if (!to) break;
          const rise = k === "tile" ? to.h + 1 : k === "housing" ? to.h : k === "pointer" ? SIZE.pointer.h * 0.5 : k === "mark" ? 3 : 0;
          const D = Math.min(MOTION.enter, p.w1 - p.w0);
          inc.segs.push({ type: "enter", t0: p.w0, t1: p.w0 + D, to, rise, grow: k === "tile" || k === "housing" || k === "mark" });
          if (k === "tile" || k === "mark") flash(op.id, p.w0, 0.85);
          else if (k === "housing") flash(op.id, p.w0, 0.35);
          cause(op.rec.parent, p, "in");
          ctx.touch(op.id, to);
          segmented.add(op.id);
          break;
        }
        case "spawn": {
          const inc = incs[live.get(op.id)];
          const to = placesN.get(op.id);
          inc.rest0 = to;
          cause(op.rec.parent, p, "in");
          segmented.add(op.id);
          if (!to) break;
          if (p.inPlace) {
            const D = Math.min(MOTION.enter + 0.1, p.w1 - p.w0);
            inc.segs.push({ type: "enter", t0: p.w0, t1: p.w0 + D, to, rise: to.h + 1, grow: true });
          } else {
            const src = p.src;
            const dx = to.wx - src[0], dy = to.wy - src[1], dist = Math.hypot(dx, dy) || 1;
            const seg = { type: "spawn", t0: p.w0, t1: p.w1, src, to, emerge: T.emerge, H: hopHeight(dist), dir: [dx / dist, dy / dist] };
            if (p.fp) {
              seg.path = p.fp.path;
              seg.prof = { z0: src[2], z1: to.wz, hA: homeHeight(op.from, P), hB: homeHeight(op.rec.parent, N), sA: p.fp.sA, sB: p.fp.sB };
              flights.push({ seg, inc: inc.idx, route: p.route, key: op.rec.keyIndex, start: p.w0 + (p.w1 - p.w0) * T.emerge, sOff: p.fp.sA, sEnd: p.fp.sB, end: p.w1 });
            }
            inc.segs.push(seg);
            ctx.touchPoint("spawn:" + op.id, src[0], src[1], src[2]);
          }
          flash(op.id, p.w0, 0.9);
          lit(op.id, p.w0, plan.B1);
          ctx.touch(op.id, to);
          break;
        }
        case "move": {
          const idx = live.get(op.id);
          if (idx === undefined || !p.from) break;
          const inc = incs[idx];
          const from = currentPlace(inc, p.w0, placesP.get(op.id) ?? p.from);
          const to = placesN.get(op.id);
          if (!to) break;
          if (op.fromParent === op.to) cause(op.to, p, "any"); else { cause(op.fromParent, p, "out"); cause(op.to, p, "in"); }
          segmented.add(op.id);
          const dx = to.wx - from.wx, dy = to.wy - from.wy, dist = Math.hypot(dx, dy) || 1;
          if (p.kind === "path") {
            const seg = { type: "path", t0: p.w0, t1: p.w1, from, to, path: p.fp.path, prof: { z0: from.wz, z1: to.wz, hA: homeHeight(op.fromParent, P), hB: homeHeight(op.to, N), sA: p.fp.sA, sB: p.fp.sB } };
            inc.segs.push(seg);
            flights.push({ seg, inc: idx, route: p.route, key: N.get(op.id).keyIndex, start: p.w0, sOff: p.fp.sA, sEnd: p.fp.sB, end: p.w1 });
          } else inc.segs.push({ type: "hop", t0: p.w0, t1: p.w1, from, to, H: hopHeight(dist) * (op.fromParent === op.to ? 0.7 : 1), dir: [dx / dist, dy / dist] });
          lit(op.id, p.w0, plan.B1);
          ctx.touch(op.id, from); ctx.touch(op.id + ">", to);
          break;
        }
        case "swap": {
          const ia = live.get(op.a), ib = live.get(op.b);
          if (ia === undefined || ib === undefined) break;
          [[op.a, ia, 1], [op.b, ib, 0.55]].forEach(([id, idx, hk]) => {
            const inc = incs[idx];
            const from = currentPlace(inc, p.w0, placesP.get(id)), to = placesN.get(id);
            if (!from || !to) return;
            const dx = to.wx - from.wx, dy = to.wy - from.wy, dist = Math.hypot(dx, dy) || 1;
            inc.segs.push({ type: "hop", t0: p.w0, t1: p.w1, from, to, H: hopHeight(dist) * hk, dir: [dx / dist, dy / dist] });
            segmented.add(id);
            lit(id, p.w0, plan.B1);
            ctx.touch(id, from); ctx.touch(id + ">", to);
            cause(P.get(id)?.parent, p);
          });
          break;
        }
        case "set": {
          recTime.set(op.id, p.w0);
          const idx = live.get(op.id);
          if (idx === undefined) break;
          const inc = incs[idx];
          const pr = op.props, prev = op.prev;
          if (pr.dim !== undefined && pr.dim !== !!prev.dim) inc.dim.push({ t0: p.w0, t1: p.w0 + Math.min(0.6, Math.max(0.25, p.w1 - p.w0)), v0: prev.dim ? 1 : 0, v1: pr.dim ? 1 : 0 });
          if (pr.meter !== undefined && pr.meter !== prev.meter) inc.meter.push({ t0: p.w0, t1: p.w1, v0: prev.meter ?? 0, v1: pr.meter ?? 0 });
          if (pr.around !== undefined && inc.kind === "zone") inc.morph.push({ t0: p.w0, t1: p.w1, from: prev.around, to: pr.around });
          for (const id of pr.around ?? []) ctx.touch(id, placesN.get(id) ?? placesP.get(id));
          const changed = (k) => pr[k] !== undefined && pr[k] !== prev[k];
          if (changed("text") || changed("key") || changed("tone")) flash(op.id, p.w0, inc.kind === "housing" ? 0.3 : 0.6);
          if (changed("text") || changed("key") || changed("tone") || changed("led") || changed("dim") || changed("meter") || changed("sub") || changed("title")) {
            const pl = placesN.get(op.id) ?? placesP.get(op.id);
            ctx.touch(op.id, pl);
          }
          break;
        }
        case "send": {
          const inc = p.inc;
          const { path, air, H } = p.ends;
          // departure offset (s.send { at | delay }): a fraction of the step, or sim time after the step's t
          const dtSim = step + 1 < nSteps ? Math.max(0, simTimes[step + 1] - simTimes[step]) : 0;
          const fracOff = op.at ?? (op.delay && dtSim > 0 ? Math.min(1, op.delay / dtSim) : 0);
          const simOff = op.delay ?? (op.at ? op.at * dtSim : 0);
          // without sim time to ride, a late departure shortens the flight (it still lands by the end of its window)
          const w0 = op.hold ? p.w0 : p.w0 + Math.min(0.95, fracOff) * 0.6 * (p.w1 - p.w0);
          const seg = { type: "flight", t0: w0, t1: Infinity, tArr: op.hold ? null : p.w1, path, air, H: H ?? 0, held: op.hold, simA: 0, simB: null, sim: false, simOff, fracOff };
          inc.segs.push(seg);
          const end = path.at(path.length);
          const restEnd = { mode: "world", x: end[0], y: end[1], z: SIZE.packet.lift, w: SIZE.packet.w, d: SIZE.packet.d, h: SIZE.packet.h, wx: end[0], wy: end[1], wz: SIZE.packet.lift };
          seg.to = restEnd;
          if (!op.hold) {
            seg.t1 = p.w1;
            inc.segs.push({ type: "absorb", t0: p.w1, t1: p.w1 + T.absorb, from: restEnd, dir: unitDir(path), yaw: end[2] });
            inc.died = p.w1 + T.absorb;
            if (N.has(op.to)) flash(op.to, p.w1, 0.3);
          } else heldOpen.set(op.id, { seg, inc, sendStep: step });
          const flight = { seg, inc: inc.idx, route: p.route, key: op.rec.keyIndex, start: w0, sOff: 0, sEnd: path.length, end: op.hold ? null : p.w1, packet: true, air };
          seg.flight = flight;
          flights.push(flight);
          const fp = placesP.get(op.from), tp = placesP.get(op.to);
          ctx.touch(op.from, fp); ctx.touch(op.to, tp);
          if (air) seg.print = prints[prints.push({ id: op.id, n: op.rec.inc, path, seg, key: op.rec.keyIndex, t0: w0 }) - 1];
          if (op.lane) {
            const board = [...N.values()].find((r) => r.kind === "lanes" && r.for.includes(op.from) && r.for.includes(op.to));
            if (board) messages.push({ id: op.id, n: op.rec.inc, inc: inc.idx, board: board.id, boardInc: live.get(board.id), from: op.from, to: op.to, key: op.rec.keyIndex, seg, sendStep: step, deliverStep: null, held: op.hold, t0: w0, tStep: ctx.t0, simOff });
          }
          break;
        }
        case "deliver": {
          const h = heldOpen.get(op.id);
          const idx = live.get(op.id);
          if (idx === undefined) break;
          const inc = incs[idx];
          if (op.lost && h) {
            // lost in flight: the packet stops at fraction `at` of its path at this step's sim time, flashes fail and fades
            heldOpen.delete(op.id);
            const tSend = simTimes[h.sendStep] + (h.seg.simOff ?? 0), tDrop = simTimes[step];
            const lat = simLatencies.length ? simLatencies.slice().sort((a, b) => a - b)[simLatencies.length >> 1] : 0;
            const frac = Math.min(0.95, Math.max(0.05, op.at ?? (lat > 0 ? Math.min(0.85, Math.max(0.2, (tDrop - tSend) / lat)) : 0.5)));
            const seg = h.seg;
            seg.stopAt = frac; seg.dropped = true; seg.t1 = p.w0;
            if (tDrop > tSend) { seg.simB = tSend + (tDrop - tSend) / frac; seg.tArr = ctx.t0; }
            else { seg.simB = null; seg.linear = true; seg.tArr = seg.t0 + (p.w0 - seg.t0) / frac; }
            const m = messages.find((x) => x.id === op.id && x.deliverStep === null);
            if (m) { m.lost = true; m.stopAt = frac; m.dropT = p.w0; m.tRecvV = tDrop > tSend ? seg.simB : null; }
            const pos = seg.path.at(seg.path.length * frac);
            const z = SIZE.packet.lift + (seg.air ? 4 * seg.H * frac * (1 - frac) : 0);
            const at = { mode: "world", x: pos[0], y: pos[1], z, w: SIZE.packet.w, d: SIZE.packet.d, h: SIZE.packet.h, wx: pos[0], wy: pos[1], wz: z };
            inc.segs.push({ type: "exit", t0: p.w0, t1: p.w0 + LOST_FADE, from: at, style: "fade", depth: 0, yaw: pos[2] });
            inc.recs.push({ t: p.w0, rec: Object.freeze({ ...op.msg, tone: "fail" }) });
            inc.flashes.push({ t: p.w0, a: 1 });
            inc.died = p.w0 + LOST_FADE;
            live.delete(op.id);
            recTime.set(op.id, p.w0);
            segmented.add(op.id);
            ctx.touchPoint("lost:" + op.id, pos[0], pos[1], z);
            break;
          }
          if (h) {
            const lat = simTimes[step] - simTimes[h.sendStep];
            if (lat > 0) simLatencies.push(lat);
            h.seg.tArr = ctx.t0;
            h.seg.simB = simTimes[step];
            h.seg.t1 = p.w0;
            const m = messages.find((x) => x.id === op.id && x.deliverStep === null);
            if (m) m.deliverStep = step;
            heldOpen.delete(op.id);
          }
          const from = h ? h.seg.to : currentPlace(inc, p.w0, null);
          if (op.into) {
            const to = placesN.get(op.id);
            if (to && from) {
              const dx = to.wx - from.wx, dy = to.wy - from.wy, dist = Math.hypot(dx, dy) || 1;
              inc.segs.push({ type: "spawn", t0: p.w0, t1: p.w1, src: [from.wx, from.wy, Math.max(0, from.wz - MOTION.lift)], to, emerge: 0.18, H: hopHeight(dist), dir: [dx / dist, dy / dist] });
              inc.rest0 = inc.rest0 ?? to;
              flash(op.id, p.w0, 0.8);
              lit(op.id, p.w0);
              ctx.touch(op.id, to);
            }
            cause(op.into, p, "in");
          } else {
            if (from) inc.segs.push({ type: "absorb", t0: p.w0, t1: p.w0 + T.absorb, from, dir: h ? unitDir(h.seg.path) : [0, 0], yaw: h ? h.seg.path.at(h.seg.path.length)[2] : 0 });
            inc.died = p.w0 + T.absorb;
            live.delete(op.id);
            if (N.has(op.msg.to)) flash(op.msg.to, p.w0, 0.3);
          }
          recTime.set(op.id, p.w0);
          segmented.add(op.id);
          ctx.touch(op.msg.to, placesN.get(op.msg.to) ?? placesP.get(op.msg.to));
          break;
        }
        case "point": {
          const idx = live.get(op.id);
          if (idx === undefined) break;
          const inc = incs[idx];
          const from = currentPlace(inc, p.w0, placesP.get(op.id)), to = placesN.get(op.id);
          if (from && to && !placeSame(from, to)) inc.segs.push({ type: "glide", t0: p.w0, t1: p.w1, from, to });
          segmented.add(op.id);
          ctx.touch(op.id, to);
          break;
        }
        case "lit": for (const id of op.ids) { lit(id, p.w0); ctx.touch(id, placesN.get(id) ?? placesP.get(id)); } break;
        case "tag": {
          ctx.stepTags.push({ id: `tag:${step}:${ctx.stepTags.length}`, entity: op.id, inc: live.get(op.id), text: op.text, tone: op.tone, t0: p.w0, t1: ctx.t1 });
          ctx.touch(op.id, placesN.get(op.id) ?? placesP.get(op.id));
          break;
        }
        default: break;
      }
    }

    // implicit motion: everything whose resting place changed glides there (reflow, zones following members)
    const beatWin = [plan.B0, plan.B1];
    const visualWins = plan.ops.filter((p) => p.visual);
    const anyWin = visualWins.length ? [Math.min(...visualWins.map((p) => p.w0)), Math.max(...visualWins.map((p) => p.w1))] : beatWin;
    if (placesN !== placesP) {
      for (const [id, to] of placesN) {
        if (segmented.has(id)) continue;
        const idx = live.get(id);
        if (idx === undefined) continue;
        const inc = incs[idx];
        if (inc.born >= plan.B0 && !placesP.has(id)) continue;
        const from0 = placesP.get(id);
        if (!from0 || placeSame(from0, to)) continue;
        const c = windowFor(id, N, causeOf);
        let win = anyWin;
        if (c) {
          // make room before an arrival lands; close the gap only once a leaver has lifted clear
          const D = c[1] - c[0];
          win = c[2] === "out" ? [c[0] + 0.22 * D, c[1]] : c[2] === "in" ? [c[0], c[0] + 0.78 * D] : [c[0], c[1]];
        }
        const from = currentPlace(inc, win[0], from0);
        // a tile that changes row in a tray hops over its neighbours instead of sliding through them
        const wrap = from.mode === "local" && to.mode === "local" && from.parent === to.parent && Math.abs(to.y - from.y) > 2 && inc.kind === "tile";
        if (wrap) {
          const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
          inc.segs.push({ type: "hop", t0: win[0], t1: win[1], from, to, H: MOTION.hop.min, dir: [dx / dist, dy / dist] });
        } else inc.segs.push({ type: "glide", t0: win[0], t1: win[1], from, to });
      }
    }
    // route geometry changes morph over the beat
    if (plan.RP !== RN) {
      for (const [id, idx] of live) {
        const inc = incs[idx];
        if (inc.kind !== "trace" && inc.kind !== "bus") continue;
        if (inc.born >= plan.B0) continue;
        const a = currentGeom(inc), b = geomOf(RN, id);
        if (!b || geomSame(a, b)) continue;
        inc.geo.push({ t0: anyWin[0], t1: anyWin[1], a, b });
      }
    }
    // record changes (text, led, tone, ...) take effect when their op starts
    for (const [id, rec] of N) {
      if (P.get(id) === rec) continue;
      const idx = live.get(id);
      if (idx === undefined) continue;
      const inc = incs[idx];
      if (inc.recs[inc.recs.length - 1].rec === rec) continue;
      if (inc.born >= plan.B0 && inc.recs.length === 1 && inc.recs[0].t === inc.born) { inc.recs[0] = { t: inc.born, rec }; continue; }
      inc.recs.push({ t: recTime.get(id) ?? (causeOf.get(id)?.[0] ?? plan.B0), rec });
    }
  }

  function windowFor(id, state, causeOf) {
    let cur = state.get(id)?.parent ?? (state.get(id)?.kind === "pointer" ? state.get(id).slot?.parent : null);
    if (state.get(id)?.kind === "pointer" && state.get(id).slot) cur = state.get(id).slot.parent;
    for (let k = 0; k < 12 && cur; k++) {
      if (causeOf.has(cur)) return causeOf.get(cur);
      cur = state.get(cur)?.parent;
    }
    return null;
  }

  function removedTree(id, state, out = []) {
    const r = state.get(id);
    if (!r) return out;
    out.push(id);
    if (r.children) for (const c of r.children) removedTree(c, state, out);
    return out;
  }

  // the place an incarnation is at (or heading to) at time t, frozen as a static world place if it is mid-flight
  function currentPlace(inc, t, fallback) {
    const k = inc.segs.length ? inc.segs.length - 1 : -1;
    if (k < 0) return fallback ?? inc.rest0;
    const seg = inc.segs[k];
    if (seg.type === "flight") {
      const o = {};
      const ctx = { sim: () => 0, pose: () => null, reduced: false };
      if (seg.tArr === null) {
        // held and still travelling: estimate by elapsed playhead time against one step
        const pr = Math.min(0.95, (t - seg.t0) / (MOTION.step * 2));
        const pt = seg.path.at(seg.path.length * pr);
        return { mode: "world", x: pt[0], y: pt[1], z: SIZE.packet.lift, w: SIZE.packet.w, d: SIZE.packet.d, h: SIZE.packet.h, wx: pt[0], wy: pt[1], wz: SIZE.packet.lift };
      }
      evalSeg(seg, Math.min(t, seg.tArr), ctx, o);
      return { mode: "world", x: o.x, y: o.y, z: o.z, w: SIZE.packet.w, d: SIZE.packet.d, h: SIZE.packet.h, wx: o.x, wy: o.y, wz: o.z };
    }
    if (seg.t1 > t + 1e-9 && seg.to) return seg.to;   // overlapping beats should not happen; take its destination
    return seg.to ?? fallback ?? inc.rest0;
  }

  function currentGeom(inc) { return inc.geo.length ? inc.geo[inc.geo.length - 1].b : inc.geo0; }

  function homeHeight(id, state) {
    const h = boxHome(id, state);
    const r = h ? state.get(h) : null;
    if (!r) return 0;
    return r.kind === "housing" ? (SIZE.variant[r.variant] ?? SIZE.variant.node).h : SIZE.plate.h;
  }
}

export function fmtTime(v, unit = "ms") {
  const r = Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100;
  return `${r} ${unit}`;
}

function unitDir(path) {
  const a = path.at(Math.max(0, path.length - 4)), b = path.at(path.length);
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  return [dx / L, dy / L];
}

function geomSame(a, b) {
  if (!a || !b) return a === b;
  if (a === b) return true;
  const pa = a.path ?? a.trunk, pb = b.path ?? b.trunk;
  if (pa.n !== pb.n) return false;
  for (let i = 0; i < pa.xy.length; i++) if (Math.abs(pa.xy[i] - pb.xy[i]) > 0.25) return false;
  if (a.branches) {
    if (a.branches.length !== b.branches.length) return false;
    for (let k = 0; k < a.branches.length; k++) { const x = a.branches[k].path, y = b.branches[k].path; if (x.n !== y.n) return false; for (let i = 0; i < x.xy.length; i++) if (Math.abs(x.xy[i] - y.xy[i]) > 0.25) return false; }
  }
  return true;
}

function sameSolids(A, B) {
  if (A === B) return true;
  let n = 0;
  for (const [id, a] of A.boxes) {
    if (a.kind !== "housing" && a.kind !== "container" && a.kind !== "spacer") continue;
    const b = B.boxes.get(id);
    if (!b || Math.abs(a.x - b.x) > 0.01 || Math.abs(a.y - b.y) > 0.01 || Math.abs(a.w - b.w) > 0.01 || Math.abs(a.d - b.d) > 0.01) return false;
    n++;
  }
  let m = 0;
  for (const b of B.boxes.values()) if (b.kind === "housing" || b.kind === "container" || b.kind === "spacer") m++;
  return n === m;
}

function mergeLits(inc) {
  if (!inc.lits.length) return;
  inc.lits.sort((a, b) => a[0] - b[0]);
  const out = [inc.lits[0].slice()];
  for (let k = 1; k < inc.lits.length; k++) {
    const [a, b] = inc.lits[k], last = out[out.length - 1];
    if (a <= last[1] + 1e-6) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  inc.lits = out;
}

export { ROOT };
