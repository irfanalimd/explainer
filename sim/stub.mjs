// A recording stand-in for the Scene builder (CONTRACTS.md 4.2). It implements the whole builder surface,
// records every call with a snapshot of its arguments, keeps a small world model (membership, slots, state,
// counters) so snapshots and s.get() work, and reports light validation problems: unknown ids, ids used before
// they are declared, ops on removed entities, steps without captions, bad tones/LEDs, held messages never
// delivered, trailing ops never committed, overflowing containers, sim time running backwards.
//
//   const s = stubScene({ seed: 7 });           // builder
//   build(s, params, "happy");
//   s.$.finish();                               // end-of-build checks
//   s.$.steps, s.$.problems, s.$.snapshot(i), s.$.find("swap"), s.$.json(), s.$.hash()
//
// runFigure(figure, { params, scenario }) resolves params like the runtime, builds on a stub and checks the
// figure's invariants on every step snapshot.

import { rng as makeRng } from "./rng.mjs";

const GROUPS = new Set(["row", "column", "grid", "ring", "free", "spacer"]);
const CONTAINERS = new Set(["housing", "container"]);
const LEDS = new Set(["ok", "busy", "warn", "fail", "idle", "off"]);
const TONES = new Set(["ok", "busy", "warn", "fail", "idle", "ghost", "neutral", "key"]);
const VARIANTS = new Set(["node", "client", "store", "queue", "chip"]);
const OF = new Set(["tile", "record", "bit", "page"]);
const SET_KEYS = new Set(["text", "sub", "key", "tone", "led", "title", "meter", "dim", "state", "variant", "label", "around"]);
const VIA_WORDS = new Set(["air", "auto"]);
const HARMLESS = new Set(["pace", "line", "phase", "beat", "focus", "lit", "ask"]);

const idOf = (x) => (x !== null && typeof x === "object" && "id" in x ? x.id : x);

// stable 53-bit string hash (cyrb53)
export function hashText(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * @param {Object} [params]                 resolved figure params; params.seed seeds s.rng
 * @param {Object} [opts]
 * @param {Object} [opts.counters]          the figure's counters export: count/gauge of an undeclared name is a problem
 * @param {boolean} [opts.strict]           throw on the first problem (handy for stack traces)
 * @param {function} [opts.rng]             seed -> RNG factory for s.rng (default sim/rng.mjs)
 */
export function stubScene(params = {}, opts = {}) {
  const handles = new WeakSet();
  const calls = [];
  const steps = [];
  const snapshots = [];
  const problems = [];
  const unknownRefs = [];          // [{ id, problem }] for "used before declaration" refinement
  const declaredAt = new Map();    // id -> { step, seq }
  const removed = new Set();
  const laneOf = new Map();        // entity -> lanes id
  const keys = new Map();          // key name -> index
  const counterDefs = opts.counters ?? null;
  const counters = {};
  const world = new Map();         // id -> frozen record
  const overflowed = new Set();
  let seq = 0;
  let lastT = -Infinity;
  let line = null;                 // active code lines persist until changed, like the engine
  let pace = null;                 // s.pace() config, captured by each step
  let lastCaption = "";
  let finished = false;
  let cur = freshStep(0);

  function freshStep(index) {
    return { index, ops: [], says: [], beats: 0, lit: [], focus: [], tags: [], line: null, ask: null, phase: null, sent: [] };
  }

  // ---- argument snapshots ----
  function snap(v, seen = new Set()) {
    if (v === null || v === undefined) return v;
    const t = typeof v;
    if (t === "function") return `[fn ${v.name || "anonymous"}]`;
    if (t !== "object") return v;
    if (handles.has(v)) return v.id;
    if (seen.has(v)) return "[circular]";
    seen.add(v);
    let out;
    if (Array.isArray(v)) out = v.map((x) => snap(x, seen));
    else if (v instanceof Map) out = [...v.entries()].map(([k, x]) => [snap(k, seen), snap(x, seen)]);
    else if (v instanceof Set) out = [...v].map((x) => snap(x, seen));
    else {
      out = {};
      for (const k of Object.keys(v)) if (v[k] !== undefined) out[k] = snap(v[k], seen);
    }
    seen.delete(v);
    return out;
  }
  const deepFreeze = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };

  // ---- problems ----
  let current = null; // the call being validated
  function problem(message, extra = {}) {
    const p = { step: cur.index, seq: current?.seq ?? null, method: current?.method ?? null, message, ...extra };
    problems.push(p);
    if (opts.strict) throw new Error(`stub: ${p.method ?? "?"} in step ${p.step}: ${message}`);
    return p;
  }

  function need(x, what = "entity") {
    const id = idOf(x);
    if (typeof id !== "string" || !id) { problem(`${what}: expected an id, got ${JSON.stringify(snap(x))}`); return null; }
    const rec = world.get(id);
    if (rec) return rec;
    if (removed.has(id)) problem(`${what} "${id}" was removed earlier`);
    else unknownRefs.push({ id, problem: problem(`unknown ${what} "${id}"`) });
    return null;
  }

  function declare(id, rec, method) {
    id = idOf(id);
    if (typeof id !== "string" || !id) { problem(`${method}: id must be a non-empty string`); return null; }
    if (world.has(id)) { problem(`duplicate id "${id}"`); return null; }
    removed.delete(id); // like the engine: an id is reusable once its entity is gone (a new incarnation)
    const r = deepFreeze({ id, ...rec });
    world.set(id, r);
    declaredAt.set(id, { step: cur.index, seq: current.seq });
    return r;
  }

  function update(id, patch) {
    const old = world.get(id);
    if (!old) return null;
    const r = deepFreeze({ ...old, ...patch });
    world.set(id, r);
    return r;
  }

  function handle(id, extra = {}) {
    const h = { id, ...extra };
    handles.add(h);
    return h;
  }

  function registerKey(k) {
    if (k === undefined || k === null) return;
    const name = String(k);
    if (!keys.has(name)) keys.set(name, keys.size);
  }

  function checkTone(t) { if (t !== undefined && t !== null && !TONES.has(t)) problem(`unknown tone "${t}"`); }
  function checkLed(l) { if (l !== undefined && l !== null && !LEDS.has(l)) problem(`unknown led "${l}"`); }
  function checkOf(of) { if (of !== undefined && !OF.has(of)) problem(`unknown tile kind of: "${of}"`); }

  function parentFor(inId, { tileLike = false } = {}) {
    if (inId === undefined || inId === null) return null;
    const rec = need(inId, "parent");
    if (!rec) return null;
    if (tileLike && !CONTAINERS.has(rec.kind)) { problem(`"${rec.id}" (${rec.kind}) cannot hold tiles`); return null; }
    if (!tileLike && !(GROUPS.has(rec.kind) || CONTAINERS.has(rec.kind))) problem(`"${rec.id}" (${rec.kind}) is not a group`);
    return rec.id;
  }

  function capacityOf(rec) {
    if (rec.capacity) return rec.capacity;
    const t = rec.tray ?? rec;
    return t.cols && t.rows ? t.cols * t.rows : Infinity;
  }

  function insertMember(parentId, tileId, index) {
    const p = world.get(parentId);
    const members = (p.members ?? []).slice();
    const i = index === undefined || index === null ? members.length : Math.max(0, Math.min(members.length, index));
    members.splice(i, 0, tileId);
    update(parentId, { members });
    if (members.length > capacityOf(p) && !overflowed.has(parentId)) {
      overflowed.add(parentId);
      problem(`container "${parentId}" overflows: ${members.length} tiles, room for ${capacityOf(p)}`);
    }
  }
  function removeMember(parentId, tileId) {
    const p = world.get(parentId);
    if (!p) return;
    update(parentId, { members: (p.members ?? []).filter((m) => m !== tileId) });
  }

  // ---- recording ----
  function record(method, args, fn) {
    if (finished) problem(`${method} after finish()`);
    const c = { seq: seq++, step: cur.index, method, args: args.map((a) => snap(a)) };
    calls.push(c);
    const prev = current;
    current = c;
    cur.ops.push(c); // before fn: step() commits the step its own call belongs to
    try {
      return fn();
    } finally {
      current = prev;
    }
  }

  const s = {};

  // layout groups
  for (const g of ["row", "column", "grid", "ring", "free", "spacer"]) {
    s[g] = (id, o = {}) => record(g, [id, o], () => {
      const parent = parentFor(o.in);
      checkTone(o.tone);
      declare(id, { kind: g, parent, title: o.title ?? null, members: [] }, g);
      if (parent) insertMember(parent, idOf(id));
      return handle(idOf(id));
    });
  }

  s.housing = (id, o = {}) => record("housing", [id, o], () => {
    const parent = parentFor(o.in);
    if (o.variant !== undefined && !VARIANTS.has(o.variant)) problem(`unknown housing variant "${o.variant}"`);
    checkLed(o.led);
    if (o.tray) checkOf(o.tray.of);
    if (o.meter !== undefined && !(o.meter >= 0 && o.meter <= 1)) problem(`meter must be in 0..1, got ${o.meter}`);
    registerKey(o.key);
    declare(id, {
      kind: "housing", parent, variant: o.variant ?? "node", title: o.title ?? idOf(id), sub: o.sub ?? null,
      tray: o.tray ? snap(o.tray) : null, led: o.led ?? null, key: o.key ?? null, meter: o.meter ?? null,
      state: snap(o.state) ?? null, dim: false, members: [],
    }, "housing");
    if (parent) insertMember(parent, idOf(id));
    return handle(idOf(id));
  });

  s.container = (id, o = {}) => record("container", [id, o], () => {
    const parent = parentFor(o.in);
    checkOf(o.of);
    if (o.axis !== undefined && !["x", "y", "z"].includes(o.axis)) problem(`unknown axis "${o.axis}"`);
    declare(id, {
      kind: "container", parent, of: o.of ?? "tile", axis: o.axis ?? "x", cols: o.cols ?? null, rows: o.rows ?? null,
      label: o.label ?? null, capacity: o.capacity ?? null, members: [], state: null, dim: false,
    }, "container");
    if (parent) insertMember(parent, idOf(id));
    return handle(idOf(id));
  });

  function tileRecord(o, parent) {
    checkOf(o.of);
    checkTone(o.tone);
    registerKey(o.key);
    return { kind: "tile", of: o.of ?? "tile", parent, text: o.text ?? null, sub: o.sub ?? null, key: o.key ?? null, tone: o.tone ?? null, state: snap(o.state) ?? null, dim: false };
  }

  s.tile = (id, o = {}) => record("tile", [id, o], () => {
    const parent = parentFor(o.in, { tileLike: true });
    if (o.text !== undefined && o.text !== null && typeof o.text !== "string" && typeof o.text !== "number") problem(`tile text must be a string`);
    if (declare(id, tileRecord(o, parent), "tile") && parent) insertMember(parent, idOf(id), o.index);
    return handle(idOf(id));
  });

  s.array = (id, values, o = {}) => record("array", [id, values, o], () => {
    const parent = parentFor(o.in);
    if (!Array.isArray(values)) problem(`array values must be an array`);
    checkOf(o.of);
    const list = Array.isArray(values) ? values : [];
    const cells = list.map((_, i) => `${idOf(id)}.${i}`);
    if (!declare(id, { kind: "container", array: true, parent, of: o.of ?? "tile", axis: "x", label: o.label ?? null, indices: o.indices ?? true, members: [], state: null, dim: false, capacity: null }, "array")) return handle(idOf(id), { cells: [], cell: () => undefined });
    if (parent) insertMember(parent, idOf(id));
    list.forEach((v, i) => {
      const k = o.keyOf ? o.keyOf(v, i) : undefined;
      registerKey(k);
      declare(cells[i], { kind: "tile", of: o.of ?? "tile", parent: idOf(id), text: String(v), sub: null, key: k ?? null, tone: null, state: null, dim: false }, "array");
      insertMember(idOf(id), cells[i]);
    });
    return handle(idOf(id), { cells, cell: (i) => cells[i] });
  });

  s.bits = (id, o = {}) => record("bits", [id, o], () => {
    const parent = parentFor(o.in);
    const width = o.width;
    if (!Number.isInteger(width) || width <= 0) problem(`bits width must be a positive integer, got ${width}`);
    const w = Number.isInteger(width) && width > 0 ? width : 0;
    for (const f of o.fields ?? []) {
      if (!(Number.isInteger(f.from) && Number.isInteger(f.to) && f.from >= 0 && f.to < w && f.from <= f.to)) problem(`bits field "${f.name}" [${f.from}, ${f.to}] is outside 0..${w - 1}`);
      registerKey(f.key);
    }
    const value = o.value === undefined ? 0n : BigInt(o.value);
    const byBit = Array.from({ length: w }, (_, i) => `${idOf(id)}.b${i}`);
    const cells = byBit.slice().reverse();           // like the engine: cells msb first, cell(i) = bit i
    if (!declare(id, { kind: "container", bits: true, parent, of: "bit", axis: "x", width: w, value: String(value), fields: snap(o.fields ?? []), members: [], capacity: null, state: null, dim: false }, "bits")) return handle(idOf(id), { cells: [], cell: () => undefined });
    if (parent) insertMember(parent, idOf(id));
    for (let i = w - 1; i >= 0; i--) {
      declare(byBit[i], { kind: "tile", of: "bit", parent: idOf(id), text: (value >> BigInt(i)) & 1n ? "1" : "0", sub: null, key: null, tone: null, state: null, dim: false }, "bits");
      insertMember(idOf(id), byBit[i]);
    }
    return handle(idOf(id), { cells, cell: (i) => byBit[i] });
  });

  s.pointer = (id, o = {}) => record("pointer", [id, o], () => {
    const at = need(o.at, "pointer target");
    if (at && at.kind !== "tile") problem(`pointer target "${at.id}" is a ${at.kind}, not a tile`);
    checkTone(o.tone);
    declare(id, { kind: "pointer", at: at?.id ?? null, text: o.text ?? null, tone: o.tone ?? null }, "pointer");
    return handle(idOf(id));
  });

  // a printed floor region around entities (the engine's s.zone): partitions, racks, data centres
  s.zone = (id, o = {}) => record("zone", [id, o], () => {
    const list = o.around ?? [];
    if (!Array.isArray(list) || !list.length) problem(`zone needs around: [entity ids]`);
    for (const x of list) need(x, "zone member");
    checkTone(o.tone);
    declare(id, { kind: "zone", around: list.map(idOf), title: o.title ?? null, tone: o.tone ?? null, dashed: !!o.dashed }, "zone");
    return handle(idOf(id));
  });

  s.text = (id, o = {}) => record("text", [id, o], () => {
    const parent = parentFor(o.in);
    checkTone(o.tone);
    declare(id, { kind: "text", parent, text: o.text ?? "" }, "text");
    return handle(idOf(id));
  });

  s.trace = (id, from, to, o = {}) => record("trace", [id, from, to, o], () => {
    const a = need(from, "trace end"), b = need(to, "trace end");
    declare(id, { kind: "trace", from: a?.id ?? null, to: b?.id ?? null }, "trace");
    return handle(idOf(id));
  });

  s.bus = (id, o = {}) => record("bus", [id, o], () => {
    for (const x of [...(o.from ?? []), ...(o.to ?? [])]) need(x, "bus end");
    if (o.via !== undefined) need(o.via, "bus via");
    declare(id, { kind: "bus", from: (o.from ?? []).map(idOf), to: (o.to ?? []).map(idOf) }, "bus");
    return handle(idOf(id));
  });

  s.lanes = (id, o = {}) => record("lanes", [id, o], () => {
    const parent = parentFor(o.in);
    const list = o.for ?? [];
    if (!Array.isArray(list) || list.length === 0) problem(`lanes needs a non-empty for: [entity ids]`);
    for (const x of list) { if (need(x, "lane entity")) laneOf.set(idOf(x), idOf(id)); }
    declare(id, { kind: "lanes", parent, for: list.map(idOf), marks: [] }, "lanes");
    return handle(idOf(id));
  });

  s.mark = (laneFor, o = {}) => record("mark", [laneFor, o], () => {
    const rec = need(laneFor, "lane entity");
    if (rec && !laneOf.has(rec.id)) problem(`"${rec.id}" has no lane (declare it in s.lanes for: [...])`);
    if (!Number.isFinite(o.t)) problem(`mark needs a finite sim time t`);
    checkTone(o.tone);
  });

  // ---- step operations ----
  s.move = (tile, to, o = {}) => record("move", [tile, to, o], () => {
    const t = need(tile, "tile"), dst = need(to, "destination");
    if (o.via !== undefined && !VIA_WORDS.has(o.via)) need(o.via, "via");
    if (!t || !dst) return;
    if (t.kind !== "tile") return void problem(`move: "${t.id}" is a ${t.kind}, not a tile`);
    if (!CONTAINERS.has(dst.kind)) return void problem(`move: "${dst.id}" (${dst.kind}) cannot hold tiles`);
    if (t.parent) removeMember(t.parent, t.id);
    update(t.id, { parent: dst.id });
    insertMember(dst.id, t.id, o.index);
  });

  s.swap = (a, b) => record("swap", [a, b], () => {
    const x = need(a, "tile"), y = need(b, "tile");
    if (!x || !y) return;
    if (x.kind !== "tile" || y.kind !== "tile") return void problem(`swap needs two tiles`);
    if (x.id === y.id) return void problem(`swap of "${x.id}" with itself`);
    const px = x.parent, py = y.parent;
    if (!px || !py) return void problem(`swap: both tiles must sit in containers`);
    if (px === py) {
      const m = world.get(px).members.slice();
      const i = m.indexOf(x.id), j = m.indexOf(y.id);
      m[i] = y.id; m[j] = x.id;
      update(px, { members: m });
    } else {
      const mx = world.get(px).members.slice(), my = world.get(py).members.slice();
      mx[mx.indexOf(x.id)] = y.id; my[my.indexOf(y.id)] = x.id;
      update(px, { members: mx }); update(py, { members: my });
      update(x.id, { parent: py }); update(y.id, { parent: px });
    }
  });

  s.spawn = (id, o = {}) => record("spawn", [id, o], () => {
    if (o.from !== undefined) need(o.from, "spawn source");
    const parent = parentFor(o.in, { tileLike: true });
    if (!parent) problem(`spawn needs in: a container`);
    if (declare(id, tileRecord(o, parent), "spawn") && parent) insertMember(parent, idOf(id), o.index);
    return handle(idOf(id));
  });

  s.remove = (id, o = {}) => record("remove", [id, o], () => {
    const r = need(id, "entity");
    if (o.to !== undefined) need(o.to, "consumer");
    if (o.style !== undefined && !["sink", "fade"].includes(o.style)) problem(`unknown remove style "${o.style}"`);
    if (!r) return;
    drop(r.id);
  });

  function drop(id) {
    const r = world.get(id);
    if (!r) return;
    if (r.parent) removeMember(r.parent, id);
    for (const m of r.members ?? []) drop(m);
    world.delete(id);
    removed.add(id);
  }

  s.set = (id, patch = {}) => record("set", [id, patch], () => {
    const r = need(id, "entity");
    for (const k of Object.keys(patch)) if (!SET_KEYS.has(k)) problem(`set: unknown field "${k}"`);
    checkTone(patch.tone); checkLed(patch.led);
    if (patch.variant !== undefined && !VARIANTS.has(patch.variant)) problem(`unknown variant "${patch.variant}"`);
    if (patch.meter !== undefined && patch.meter !== null && !(patch.meter >= 0 && patch.meter <= 1)) problem(`meter must be in 0..1, got ${patch.meter}`);
    registerKey(patch.key);
    if (!r) return;
    const p = {};
    for (const k of Object.keys(patch)) if (patch[k] !== undefined) p[k] = k === "state" ? snap(patch[k]) : patch[k];
    if ("dim" in p) p.dim = !!p.dim;
    update(r.id, p);
  });

  s.send = (id, from, to, o = {}) => record("send", [id, from, to, o], () => {
    const a = need(from, "sender"), b = need(to, "receiver");
    if (o.via !== undefined && !VIA_WORDS.has(o.via)) need(o.via, "via");
    if (o.deliver !== undefined && !["end", "hold"].includes(o.deliver)) problem(`unknown deliver mode "${o.deliver}"`);
    if (o.lane && a && b && !(laneOf.has(a.id) && laneOf.has(b.id))) problem(`send with lane: true needs lanes for both "${a.id}" and "${b.id}"`);
    registerKey(o.key);
    const held = o.deliver === "hold";
    if (declare(id, { kind: "packet", from: a?.id ?? null, to: b?.id ?? null, text: o.text ?? null, key: o.key ?? null, held, sentStep: cur.index }, "send") && !held) cur.sent.push(idOf(id));
    return handle(idOf(id));
  });

  s.deliver = (id, o = {}) => record("deliver", [id, o], () => {
    const r = need(id, "message");
    if (!r) return;
    if (r.kind !== "packet") return void problem(`deliver: "${r.id}" is a ${r.kind}, not a message`);
    if (!r.held) return void problem(`deliver: "${r.id}" was not sent with deliver: "hold"`);
    if (r.sentStep === cur.index) problem(`deliver: "${r.id}" is delivered in the step that sent it`);
    if (o.into !== undefined && o.remove) problem(`deliver: give into or remove, not both`);
    if (o.into !== undefined) {
      const dst = need(o.into, "container");
      if (dst && !CONTAINERS.has(dst.kind)) return void problem(`deliver: "${dst.id}" cannot hold tiles`);
      if (!dst) return;
      update(r.id, { kind: "tile", of: "tile", parent: dst.id, held: false, tone: null, sub: null, state: null, dim: false });
      insertMember(dst.id, r.id);
    } else drop(r.id);
  });

  s.point = (pointer, tile) => record("point", [pointer, tile], () => {
    const p = need(pointer, "pointer"), t = need(tile, "pointer target");
    if (p && p.kind !== "pointer") problem(`point: "${p.id}" is not a pointer`);
    if (t && t.kind !== "tile") problem(`point: target "${t.id}" is a ${t.kind}, not a tile`);
    if (p && t && p.kind === "pointer" && t.kind === "tile") update(p.id, { at: t.id });
  });

  s.lit = (...ids) => record("lit", ids, () => { for (const x of ids) if (need(x, "lit entity")) cur.lit.push(idOf(x)); });
  s.focus = (...ids) => record("focus", ids, () => { for (const x of ids) if (need(x, "focus entity")) cur.focus.push(idOf(x)); });
  s.tag = (entity, text, o = {}) => record("tag", [entity, text, o], () => {
    need(entity, "tag anchor");
    if (typeof text !== "string" || !text.trim()) problem(`tag text must be a non-empty string`);
    checkTone(o.tone);
    cur.tags.push({ entity: idOf(entity), text, tone: o.tone ?? null });
  });

  function checkCounter(name) {
    if (typeof name !== "string" || !name) problem(`counter name must be a non-empty string`);
    else if (counterDefs && !(name in counterDefs)) problem(`counter "${name}" is not declared in the figure's counters`);
  }
  s.count = (name, delta = 1) => record("count", [name, delta], () => {
    checkCounter(name);
    if (!Number.isFinite(delta)) problem(`count delta must be finite`);
    counters[name] = (counters[name] ?? 0) + delta;
  });
  s.gauge = (name, value) => record("gauge", [name, value], () => {
    checkCounter(name);
    if (!Number.isFinite(value)) problem(`gauge value must be finite`);
    counters[name] = value;
  });
  s.line = (from, to = from) => record("line", [from, to], () => {
    if (from === null || from === undefined) { line = null; return; }
    if (!(Number.isInteger(from) && Number.isInteger(to) && from >= 1 && to >= from)) problem(`line(${from}, ${to}) must be 1-based with from <= to`);
    else line = [from, to];
  });
  s.pace = (o) => record("pace", [o], () => {
    if (o === null || o === false) { pace = null; return; }
    const cfg = { ms: o?.ms ?? 10, min: o?.min ?? 0.45, max: o?.max ?? 2.4 };
    if (!(cfg.ms > 0 && cfg.min > 0 && cfg.max >= cfg.min)) problem(`pace needs ms > 0 and 0 < min <= max`);
    pace = cfg;
  });
  s.say = (markup) => record("say", [markup], () => {
    if (typeof markup !== "string" || !markup.trim()) problem(`say needs non-empty markup`);
    else cur.says.push(markup);
  });
  s.ask = (question, options, answerIndex) => record("ask", [question, options, answerIndex], () => {
    if (typeof question !== "string" || !question.trim()) problem(`ask needs a question`);
    if (!Array.isArray(options) || options.length < 2) problem(`ask needs at least two options`);
    else if (!(Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length)) problem(`ask answer index ${answerIndex} is out of range`);
    cur.ask = { question, options: snap(options), answer: answerIndex };
  });
  s.phase = (name) => record("phase", [name], () => {
    if (typeof name !== "string" || !name.trim()) problem(`phase needs a name`);
    cur.phase = name;
  });
  s.beat = () => record("beat", [], () => { cur.beats++; });

  function commit(caption, o, method) {
    const text = [caption, ...cur.says].filter((x) => typeof x === "string" && x.trim()).join(" ");
    if (!text) problem(`${method} without a caption`);
    if (o.dur !== undefined && !(o.dur > 0)) problem(`${method}: dur must be > 0, got ${o.dur}`);
    if (o.t !== undefined) {
      if (!Number.isFinite(o.t)) problem(`${method}: t must be a finite sim time`);
      else if (o.t < lastT) problem(`${method}: sim time runs backwards (${o.t} < ${lastT})`);
      else lastT = o.t;
    }
    for (const id of cur.sent) drop(id); // deliver: "end" messages arrive within their step
    const step = {
      index: cur.index, caption: text, dur: o.dur ?? null, t: o.t ?? null, phase: cur.phase,
      ops: cur.ops, beats: cur.beats, lit: cur.lit, focus: cur.focus, tags: cur.tags, line, ask: cur.ask, pace,
    };
    lastCaption = text;
    steps.push(step);
    snapshots.push({ step: step.index, t: step.t, caption: text, phase: step.phase, entities: new Map(world), counters: { ...counters } });
    cur = freshStep(cur.index + 1);
    return step.index;
  }

  s.step = (caption, o = {}) => record("step", [caption, o], () => {
    if (caption !== undefined && caption !== null && typeof caption !== "string") problem(`step caption must be markup text`);
    return commit(caption, o, "step");
  });
  s.hold = (dur, caption) => record("hold", [dur, caption], () => {
    if (cur.ops.length > 1) problem(`hold after ${cur.ops.length - 1} pending ops: commit them with s.step first`);
    return commit(caption ?? lastCaption, dur === undefined ? {} : { dur }, "hold"); // no caption: repeat the last one
  });

  // ---- queries ----
  Object.defineProperty(s, "rng", { value: (opts.rng ?? makeRng)(params.seed ?? 1), enumerable: true });
  s.key = (name) => { registerKey(name); return keys.get(String(name)); };
  s.has = (id) => world.has(idOf(id));
  s.get = (id) => {
    const r = world.get(idOf(id));
    if (!r) return null;
    return r.parent ? Object.freeze({ ...r, index: (world.get(r.parent)?.members ?? []).indexOf(r.id) }) : r;
  };

  // ---- inspection ----
  function finish() {
    if (finished) return problems;
    current = { seq: null, method: "finish" };
    // like the engine, only ops that would have shown something count (a trailing pace, line or phase is harmless)
    const lost = cur.ops.filter((c) => !HARMLESS.has(c.method));
    if (lost.length) problem(`${lost.length} operation(s) after the last step were never committed (${[...new Set(lost.map((c) => c.method))].join(", ")})`);
    for (const r of world.values()) if (r.kind === "packet" && r.held) problem(`message "${r.id}" was held but never delivered`);
    for (const u of unknownRefs) {
      const d = declaredAt.get(u.id);
      if (d) u.problem.message = `"${u.id}" used before it was declared (declared in step ${d.step})`;
    }
    current = null;
    finished = true;
    return problems;
  }

  const $ = {
    calls, steps, problems, keys, counters, snapshots,
    finish,
    get pending() { return cur.ops; },
    get finished() { return finished; },
    /** state after step i: { step, t, caption, phase, entities: Map(id -> record), counters } */
    snapshot(i) { return snapshots[i] ?? null; },
    get final() { return snapshots[snapshots.length - 1] ?? null; },
    entity(id) { return world.get(idOf(id)) ?? null; },
    /** every call of a method (optionally filtered) */
    find(method, pred = () => true) { return calls.filter((c) => c.method === method && pred(c)); },
    /** ops of step i */
    ops(i, method) { const st = steps[i]; return st ? st.ops.filter((c) => !method || c.method === method) : []; },
    captions() { return steps.map((x) => x.caption); },
    members(id) { return (world.get(idOf(id))?.members ?? []).slice(); },
    texts(id) { return $.members(id).map((m) => world.get(m)?.text ?? null); },
    json() { return JSON.stringify({ calls: calls.map(({ seq: q, step, method, args }) => [q, step, method, args]) }, (k, v) => (typeof v === "bigint" ? `${v}n` : v)); },
    hash() { return hashText($.json()); },
    summary() {
      const kinds = {};
      for (const c of calls) kinds[c.method] = (kinds[c.method] ?? 0) + 1;
      return { steps: steps.length, calls: calls.length, problems: problems.length, kinds, counters: { ...counters } };
    },
  };
  Object.defineProperty(s, "$", { value: $, enumerable: false });
  return s;
}

/** Resolve params the way the runtime does: defaults, then the scenario's overrides, then explicit overrides. */
export function resolveParams(figure, scenario, overrides = {}) {
  const defs = Object.fromEntries(Object.entries(figure.params ?? {}).map(([k, d]) => [k, d.value]));
  const list = figure.scenarios ?? [];
  const sc = list.find((x) => x.id === scenario) ?? list[0] ?? { id: "default" };
  return { scenario: sc.id, params: { ...defs, ...(sc.params ?? {}), ...overrides } };
}

/**
 * Build a figure module on a stub and check it.
 * @returns {{ s, rec, params, scenario, problems, failures: {step, name, message}[] }}
 */
export function runFigure(figure, { params, scenario, strict = false, invariants = true } = {}) {
  const r = resolveParams(figure, scenario, params);
  const s = stubScene(r.params, { counters: figure.counters, strict });
  figure.build(s, r.params, r.scenario);
  const problems = s.$.finish();
  const failures = [];
  if (invariants) {
    for (const [name, fn] of Object.entries(figure.invariants ?? {})) {
      for (const snap of s.$.snapshots) {
        let res;
        try { res = fn(snap); } catch (e) { res = `threw ${e && e.message}`; }
        if (res !== true && res !== undefined) { failures.push({ step: snap.step, name, message: typeof res === "string" ? res : "false" }); break; }
      }
    }
  }
  return { s, rec: s.$, params: r.params, scenario: r.scenario, problems, failures };
}
