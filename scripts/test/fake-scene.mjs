// A stand-in for engine/scene/index.mjs compile(), used to test the tooling (verify, build, shoot, audit,
// record) before and independently of the real scene engine. It implements a small, permissive slice of the
// builder (housings in a row, sends, set, focus, tag, counters, phases, steps); any other builder call is
// recorded and returns a handle, so real figures and the new.mjs template also run through it.
import { SIZE, MOTION } from "../../engine/tokens.mjs";

const HOUSING = { w: 120, d: 92, h: SIZE.housing.h };

function lcg(seed) {
  let s = (seed >>> 0) || 1;
  const next = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return { next, int: (a, b) => a + Math.floor(next() * (b - a + 1)), float: (a, b) => a + next() * (b - a), pick: (xs) => xs[Math.floor(next() * xs.length)], chance: (p) => next() < p, fork: () => lcg(s ^ 0x9e3779b9) };
}

function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

export function compile(figure, { params = {}, scenario } = {}) {
  const defs = figure.params ?? {};
  const values = { ...Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, d.value])), ...params };
  const scen = (figure.scenarios ?? []).find((s) => s.id === scenario) ?? (figure.scenarios ?? [])[0] ?? { id: "default" };
  Object.assign(values, scen.params ?? {}, params);

  const entities = new Map();      // live state
  const order = [];                // housing order (layout)
  const problems = [];
  const steps = [], phases = [], events = [], keys = [];
  const counters = Object.fromEntries(Object.keys(figure.counters ?? {}).map((k) => [k, 0]));
  let pending = { ops: [], focus: null, tags: [], lit: [], say: null, phase: null, line: null, ask: null };
  let nextPhase = null, started = false, opening = null;
  const script = [];

  const handle = (id, extra = {}) => ({ id, ...extra });
  const idOf = (x) => (x && typeof x === "object" ? x.id : x);
  const need = (id, what) => { if (!entities.has(id)) problems.push({ kind: "unknown-id", message: `${what}: no entity "${id}"`, step: steps.length, id }); };
  const snap = () => ({ entities: new Map([...entities].map(([k, v]) => [k, { ...v, state: { ...(v.state ?? {}) } }])), counters: { ...counters } });
  const record = (op) => { script.push(op); if (started) pending.ops.push(op); };

  const known = {
    housing(id, o = {}) { entities.set(id, { kind: "housing", title: o.title ?? id, sub: o.sub ?? "", led: o.led ?? "idle", key: o.key ?? null, state: o.state ?? {}, dim: false }); order.push(id); record({ op: "housing", id }); return handle(id); },
    array(id, values, o = {}) {
      const cells = values.map((v, i) => { const cid = `${id}.${i}`; entities.set(cid, { kind: o.of ?? "tile", title: String(v), parent: id, state: { value: v } }); return cid; });
      entities.set(id, { kind: "container", title: o.label ?? id, state: {} });
      record({ op: "array", id });
      return handle(id, { cells, cell: (i) => cells[i] });
    },
    tile(id, o = {}) { entities.set(id, { kind: o.of ?? "tile", title: o.text ?? id, parent: idOf(o.in), state: o.state ?? {} }); record({ op: "tile", id }); return handle(id); },
    container(id, o = {}) { entities.set(id, { kind: "container", title: o.label ?? id, state: {} }); record({ op: "container", id }); return handle(id); },
    pointer(id, o = {}) { need(idOf(o.at), "pointer at"); entities.set(id, { kind: "pointer", title: o.text ?? id, at: idOf(o.at), state: {} }); record({ op: "pointer", id }); return handle(id); },
    point(ptr, tile) { ptr = idOf(ptr); tile = idOf(tile); need(ptr, "point"); need(tile, "point to"); const e = entities.get(ptr); if (e) e.at = tile; record({ op: "point", id: ptr, to: tile }); },
    set(id, o = {}) { id = idOf(id); need(id, "set"); const e = entities.get(id); if (e) { Object.assign(e, o); if (o.state) e.state = { ...o.state }; } record({ op: "set", id, o }); },
    send(id, from, to, o = {}) { from = idOf(from); to = idOf(to); need(from, "send from"); need(to, "send to"); record({ op: "send", id, from, to, text: o.text ?? "", key: o.key ?? null }); return handle(id); },
    focus(...ids) { pending.focus = ids.map(idOf); },
    lit(...ids) { pending.lit.push(...ids.map(idOf)); },
    tag(entity, text, o = {}) { pending.tags.push({ entity: idOf(entity), text, tone: o.tone, at: o.at }); },
    count(name, delta = 1) { if (!(name in counters)) counters[name] = 0; counters[name] += delta; record({ op: "count", name, delta }); },
    gauge(name, value) { counters[name] = value; record({ op: "gauge", name, value }); },
    say(markup) { pending.say = markup; },
    line(from, to = from) { pending.line = [from, to]; },
    ask(question, options, answer) { pending.ask = { question, options, answer }; },
    phase(name) { nextPhase = name; },
    beat() {},
    key(name) { let k = keys.find((x) => x.name === name); if (!k) keys.push((k = { name, index: keys.length })); return k.index; },
    has: (id) => entities.has(idOf(id)),
    get: (id) => entities.get(idOf(id)),
    step(caption, o = {}) {
      if (!started) { started = true; opening = snap(); }     // like the real builder: the first step shows the opening state
      const dur = o.dur ?? MOTION.step;
      const t0 = steps.length ? steps[steps.length - 1].t1 : 0;
      const phase = nextPhase ?? (phases.length ? phases[phases.length - 1].name : "");
      if (nextPhase !== null || !phases.length) { phases.push({ name: phase, step: steps.length, t0, t1: t0 }); nextPhase = null; }
      const kinds = [...new Set(pending.ops.map((x) => x.op))];
      const st = { index: steps.length, t0, t1: t0 + dur, dur, caption: [caption, pending.say].filter(Boolean).join(" "), phase, simTime: o.t ?? null, ask: pending.ask, kinds, ops: pending.ops, focus: pending.focus, tags: pending.tags, lit: pending.lit, line: pending.line };
      steps.push(st);
      phases[phases.length - 1].t1 = st.t1;
      for (const k of kinds) events.push({ t: t0, kind: k, step: st.index });
      st.after = snap();
      script.push({ op: "step", caption: st.caption, dur });
      pending = { ops: [], focus: null, tags: [], lit: [], say: null, phase: null, line: null, ask: null };
    },
    hold(dur, caption) { known.step(caption ?? "", { dur }); },
  };
  const s = new Proxy(known, {
    get(target, prop) {
      if (prop === "rng") return lcg(Number(values.seed ?? 1));
      if (prop in target) return target[prop];
      return (...args) => { const id = idOf(args[0]); record({ op: String(prop), id }); return handle(id ?? String(prop), { cells: [], cell: (i) => handle(`${id}.${i}`) }); };
    },
  });
  figure.build(s, values, scen.id);
  if (!opening) opening = snap();
  if (pending.ops.length) problems.push({ kind: "trailing-ops", message: `${pending.ops.length} op(s) after the last s.step() are never shown`, step: steps.length - 1, id: null });

  // layout: housings in a row
  const gap = SIZE.gutter;
  const total = order.length * HOUSING.w + Math.max(0, order.length - 1) * gap;
  const pos = new Map(order.map((id, i) => [id, { x: -total / 2 + HOUSING.w / 2 + i * (HOUSING.w + gap), y: 0 }]));
  const world = { minX: -total / 2 - SIZE.zone.pad, maxX: total / 2 + SIZE.zone.pad, minY: -HOUSING.d / 2 - SIZE.zone.pad, maxY: HOUSING.d / 2 + SIZE.zone.pad, minZ: 0, maxZ: 30 };
  const boxOf = (ids) => {
    let b = null;
    for (const id of ids) {
      const p = pos.get(id); if (!p) continue;
      const r = { minX: p.x - HOUSING.w / 2, maxX: p.x + HOUSING.w / 2, minY: p.y - HOUSING.d / 2, maxY: p.y + HOUSING.d / 2 };
      b = b ? { minX: Math.min(b.minX, r.minX), maxX: Math.max(b.maxX, r.maxX), minY: Math.min(b.minY, r.minY), maxY: Math.max(b.maxY, r.maxY) } : r;
    }
    return b ? { ...b, minZ: 0, maxZ: 30 } : null;
  };

  const states = [opening, ...steps.map((x) => x.after)];      // states[i] = state at the start of step i
  const duration = steps.length ? steps[steps.length - 1].t1 : 0;
  const ease = (u) => 1 - Math.pow(1 - u, 3);
  const stepAt = (t) => { let lo = 0, hi = steps.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (steps[m].t0 <= t + 1e-9) lo = m; else hi = m - 1; } return lo; };

  function sample(time) {
    time = Math.max(0, Math.min(duration, time));
    const i = stepAt(time), st = steps[i];
    const u = st ? Math.min(1, (time - st.t0) / st.dur) : 0;
    const state = u >= 1 ? states[i + 1] : states[i];
    const poses = [];
    for (const id of order) {
      const e = (u >= 0.5 ? states[i + 1] : states[i])?.entities.get(id) ?? state.entities.get(id);
      if (!e) continue;
      const p = pos.get(id);
      poses.push({ id, kind: "housing", variant: "node", x: p.x, y: p.y, z: 0, w: HOUSING.w, d: HOUSING.d, h: HOUSING.h, title: e.title, sub: e.sub, led: e.led, dim: e.dim ? 1 : 0, lit: st?.lit.includes(id) ? 1 : 0, key: e.key });
    }
    const tags = [];
    for (const op of st?.ops ?? []) {
      if (op.op !== "send") continue;
      const a = pos.get(op.from), b = pos.get(op.to);
      if (!a || !b) continue;
      const k = ease(u), dist = Math.hypot(b.x - a.x, b.y - a.y);
      const hop = Math.min(MOTION.hop.max, Math.max(MOTION.hop.min, MOTION.hop.k * dist));
      poses.push({ id: op.id, kind: "packet", x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: HOUSING.h + 4 * hop * k * (1 - k), w: SIZE.packet.w, d: SIZE.packet.d, h: SIZE.packet.h, key: op.key, text: op.text, lit: 1 });
    }
    for (const [n, tg] of (st?.tags ?? []).entries()) {
      const p = pos.get(tg.entity);
      const at = tg.at ?? (p ? [p.x, p.y, HOUSING.h + 30] : [0, 0, 0]);
      tags.push({ id: `${i}:${n}`, text: tg.text, tone: tg.tone, at, opacity: Math.min(1, u * 4) });
    }
    return {
      poses, time, step: i, u, caption: st?.caption ?? "", phase: st?.phase ?? "", tags,
      focus: boxOf(st?.focus ?? st?.ops.flatMap((o) => [o.id, o.from, o.to]).filter(Boolean) ?? []) ?? world,
      world, counters: { ...state.counters }, line: st?.line ?? null,
      entities: new Map([...state.entities].map(([id, e]) => [id, { kind: e.kind, title: e.title, tone: e.led, state: e.state }])),
      ask: st?.ask ?? null,
    };
  }

  return {
    duration,
    steps: steps.map(({ index, t0, t1, dur, caption, phase, simTime, ask, kinds }) => ({ index, t0, t1, dur, caption, phase, simTime, ask, kinds })),
    phases, events, keys,
    counters: Object.fromEntries(Object.keys(counters).map((k) => [k, { label: k, format: "int", ...(figure.counters?.[k] ?? {}) }])),
    snapshot: (i) => states[i],
    final: states[states.length - 1],
    sample,
    hash: fnv(JSON.stringify(script)),
    problems,
  };
}
