// Tracked data structures: plain-looking arrays, stacks, queues and hash tables whose every operation is
// mirrored onto the Scene builder (CONTRACTS.md 4.2) with counters and precise generated narration.
//
//   const a = tracked.array(s, "a", [5, 2, 9, 1, 7], { label: "a" });          // auto: "op" by default
//   if (a.cmp(2, 3) > 0) a.swap(2, 3);   // one step: "Compare a[2] = 9 with a[3] = 1 — 9 > 1, so swap."
//   a.flush();                            // commit the step that is still open
//
// auto: "op"   every operation is committed as its own step. A comparison stays open until the next operation so
//              that its consequence (a swap or write, plus pointer moves) joins it: one causal chain per step.
//              Pointer moves and marks never stand alone; they join the step being built.
// auto: "none" nothing is committed; operations land in the builder's current step and a.caption() returns the
//              narration accumulated since the last call, for the author's own s.step().
// In "op" mode, call a.flush() (or use a.step / a.phase / a.say) before builder calls that must land in a fresh
// step, and once at the end.

import * as fmt from "./fmt.mjs";

const idOf = (x) => (x !== null && typeof x === "object" && "id" in x ? x.id : x);
const REL = { "-1": "<", "0": "=", "1": ">" };
const MARK_TONES = new Set(["ok", "busy", "warn", "fail", "idle", "ghost"]);

function defaultCompare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

function counterNames(spec, defaults) {
  if (spec === false) return {};
  const out = { ...defaults };
  if (spec && typeof spec === "object") for (const [k, v] of Object.entries(spec)) out[k] = v || null;
  return out;
}

// value text, escaped for captions
const showWith = (fmtValue) => (v) => fmt.escape(fmtValue ? fmtValue(v) : String(v));

// a key chip when the name can be a chip, otherwise inline code
function chip(k) {
  try { return fmt.key(String(k)); } catch { return fmt.code(String(k)); }
}

// ---- the pending step ----------------------------------------------------------------------------
// lead: the operation that owns the step; conseq: what followed from it; pre: narration of joining ops that is
// used only if no lead arrives; notes: author text appended verbatim.
function narrator(s, { auto, dur, t }) {
  if (auto !== "op" && auto !== "none") throw new TypeError(`tracked: auto must be "op" or "none", got ${JSON.stringify(auto)}`);
  let pending = null;
  const buffer = [];

  const open = () => (pending ??= { lead: null, action: false, conseq: [], pre: [], notes: [], lines: null, override: null });

  function addLine(o) {
    if (!o || o.line === undefined || o.line === null) return;
    const [a, b] = Array.isArray(o.line) ? o.line : [o.line, o.line];
    if (auto === "none") { s.line(a, b); return; }
    const p = open();
    p.lines = p.lines ? [Math.min(p.lines[0], a), Math.max(p.lines[1], b)] : [a, b];
  }

  function compose(p) {
    if (p.override) return p.override;
    let text = "";
    if (p.lead) {
      text = p.lead.text;
      if (p.conseq.length) text += (p.lead.kind === "cmp" ? ", so " : "; ") + p.conseq.join(", ");
    } else if ((p.conseq.length || p.pre.length) && !p.notes.length) {
      text = [...p.pre, ...p.conseq].join(", ");
    }
    if (text && !/[.!?]$/.test(text)) text += ".";
    return [text, ...p.notes].filter(Boolean).join(" ");
  }

  function flush(fallback) {
    if (!pending) return null;
    const p = pending;
    pending = null;
    const caption = compose(p) || fallback || "";
    if (auto === "op") {
      if (p.lines) s.line(p.lines[0], p.lines[1]);
      const o = {};
      if (dur !== undefined) o.dur = dur;
      if (t !== undefined) o.t = typeof t === "function" ? t() : t;
      s.step(caption || "The structure is unchanged.", o);
    } else if (caption) buffer.push(caption);
    return caption;
  }

  return {
    get pending() { return pending; },
    open,
    addLine,
    /** start a step owned by an operation (closes the previous one, adopts joining ops) */
    lead(kind, text, o) {
      if (pending && (pending.lead || pending.conseq.length || pending.override)) flush();
      const p = open();
      p.lead = { kind, text: o?.say ?? text + (o?.why ? ` ${o.why}` : "") };
      p.pair = null;
      addLine(o);
      return p;
    },
    /** true when an action (swap/set) can join the open comparison */
    canAbsorb() { return !!(pending && pending.lead && pending.lead.kind === "cmp" && !pending.action); },
    /** commit the open step only if an operation owns it (joining ops stay open for the next one) */
    close() { if (pending && (pending.lead || pending.override)) flush(); },
    conseq(text) { const p = open(); if (p.lead) p.conseq.push(text); else p.pre.push(text); },
    pre(text) { open().pre.push(text); },
    note(text) { open().notes.push(text); },
    flush,
    step(caption, o = {}) {
      if (auto === "none") {
        const drained = this.caption();
        const opts = {};
        if (o.dur ?? dur) opts.dur = o.dur ?? dur;
        if (o.t !== undefined) opts.t = o.t;
        return s.step(caption ?? (drained || "The structure is unchanged."), opts);
      }
      const p = open();
      if (caption !== undefined && caption !== null) p.override = caption;
      addLine(o);
      const saveDur = dur, saveT = t;
      if (o.dur !== undefined) dur = o.dur;
      if (o.t !== undefined) t = o.t;
      try { return flush(); } finally { dur = saveDur; t = saveT; }
    },
    caption() {
      if (pending) {
        const p = pending; pending = null;
        if (p.lines && auto === "op") s.line(p.lines[0], p.lines[1]);
        const c = compose(p);
        if (c) buffer.push(c);
      }
      const out = buffer.join(" ");
      buffer.length = 0;
      return out;
    },
  };
}

// ---- array --------------------------------------------------------------------------------------

/**
 * @param {Object} s        the Scene builder
 * @param {string} id
 * @param {Array} values
 * @param {Object} [opts]   in, at, label, indices, of, keyOf (value, index) -> key  (passed to s.array)
 *                          auto "op" | "none", name (narration name, default label or id), format (value -> text),
 *                          compare (a, b) -> number, counters (false | { comparisons, swaps, reads, writes } renames,
 *                          a falsy name disables one), merge (default true), dur, state (default true: the array's
 *                          inspector state carries { values, ...a.state() })
 */
function array(s, id, values, opts = {}) {
  const auto = opts.auto ?? "op";
  const name = String(opts.name ?? opts.label ?? id);
  const V = showWith(opts.format);
  const compare = opts.compare ?? defaultCompare;
  const keyOf = opts.keyOf;
  const merge = opts.merge !== false;
  const C = counterNames(opts.counters, { comparisons: "comparisons", swaps: "swaps", reads: "reads", writes: "writes" });
  const n = narrator(s, { auto, dur: opts.dur });

  const arrOpts = { label: opts.label ?? name };
  for (const k of ["in", "at", "indices", "of", "keyOf"]) if (opts[k] !== undefined) arrOpts[k] = opts[k];
  const h = s.array(id, values.slice(), arrOpts);
  const vals = values.slice();
  const slots = h.cells.slice();
  if (slots.length !== vals.length) throw new Error(`tracked.array: the builder returned ${slots.length} cells for ${vals.length} values`);
  const stats = { comparisons: 0, swaps: 0, reads: 0, writes: 0 };
  const tones = vals.map(() => null), dims = vals.map(() => false);
  const pointers = new Map();
  const extra = {};
  let lastState = null;

  const R = (i) => fmt.ref(slots[i], `${name}[${i}]`);
  const count = (k, d = 1) => { stats[k] += d; if (C[k]) s.count(C[k], d); };
  const inRange = (i) => Number.isInteger(i) && i >= 0 && i < vals.length;
  const check = (i, who) => { if (!inRange(i)) throw new RangeError(`${name}.${who}: index ${i} is outside 0..${vals.length - 1}`); };

  function syncState() {
    if (opts.state === false) return;
    const st = { values: vals.slice(), ...extra };
    const j = JSON.stringify(st);
    if (j === lastState) return;
    lastState = j;
    s.set(id, { state: JSON.parse(j) });
  }
  syncState();

  // after slots i and j exchanged tiles: pointers stay on their slots, marks stay on their slots
  function settle(ks) {
    for (const p of pointers.values()) if (p.alive && ks.includes(p.index)) s.point(p.id, slots[p.index]);
    for (const k of new Set(ks)) restyle(k);
  }
  // make the tile in slot k show the slot's tone and dim (tiles carry their look with them when they move)
  const shown = new Map(); // tile id -> { tone, dim } it currently shows
  function restyle(k) {
    const tile = slots[k];
    const now = shown.get(tile) ?? { tone: null, dim: false };
    const patch = {};
    if (now.tone !== tones[k]) patch.tone = tones[k];
    if (now.dim !== dims[k]) patch.dim = dims[k];
    if (Object.keys(patch).length) { s.set(tile, patch); shown.set(tile, { tone: tones[k], dim: dims[k] }); }
  }

  const api = {
    id,
    name,
    get length() { return vals.length; },
    get stats() { return { ...stats }; },
    get tiles() { return slots.slice(); },
    /** the tile id currently in slot i */
    tile(i) { check(i, "tile"); return slots[i]; },
    /** caption chip for slot i: "{ref:<tile>|a[i]}" */
    ref(i) { check(i, "ref"); return R(i); },
    /** caption text of a value (escaped, through opts.format) */
    show(v) { return V(v); },
    values() { return vals.slice(); },

    get(i) {
      check(i, "get");
      count("reads");
      return vals[i];
    },

    /** -1 | 0 | 1. j is an index, or { value, label } to compare against a value held outside the array. */
    cmp(i, j, o = {}) {
      check(i, "cmp");
      const a = vals[i];
      let b, second, lit = [slots[i]];
      if (typeof j === "number") {
        check(j, "cmp");
        b = vals[j];
        second = `${o.as ? o.as + " " : ""}${R(j)} = ${V(b)}`;
        lit.push(slots[j]);
        count("reads", 2);
      } else if (j && typeof j === "object" && "value" in j) {
        b = j.value;
        second = j.label ? `${j.label} ${V(b)}` : V(b);
        count("reads", 1);
      } else throw new TypeError(`${name}.cmp: second operand must be an index or { value, label }`);
      const r = Math.sign(compare(a, b));
      count("comparisons");
      const p = n.lead("cmp", `Compare ${R(i)} = ${V(a)} with ${second} — ${V(a)} ${REL[r]} ${V(b)}`, o);
      p.pair = typeof j === "number" ? [i, j] : null;
      s.lit(...lit);
      return r;
    },
    less(i, j, o) { return api.cmp(i, j, o) < 0; },

    swap(i, j, o = {}) {
      check(i, "swap"); check(j, "swap");
      const a = vals[i], b = vals[j];
      const Ri = R(i), Rj = R(j);
      count("swaps"); count("reads", 2); count("writes", 2);
      const absorb = merge && n.canAbsorb();
      if (absorb) {
        const p = n.pending;
        p.action = true;
        const same = p.pair && ((p.pair[0] === i && p.pair[1] === j) || (p.pair[0] === j && p.pair[1] === i));
        n.conseq(o.say ?? (same ? "swap" : i === j ? `${Ri} stays` : `swap ${Ri} ↔ ${Rj}`));
        n.addLine(o);
        s.beat();
      } else {
        n.lead("swap", i === j ? `${Ri} = ${V(a)} stays in place` : `Swap ${Ri} = ${V(a)} with ${Rj} = ${V(b)}`, o);
      }
      if (i !== j) {
        s.swap(slots[i], slots[j]);
        [slots[i], slots[j]] = [slots[j], slots[i]];
        [vals[i], vals[j]] = [vals[j], vals[i]];
        settle([i, j]);
      }
      syncState();
    },

    set(i, v, o = {}) {
      check(i, "set");
      const old = vals[i];
      count("writes");
      if (merge && n.canAbsorb()) {
        n.pending.action = true;
        n.conseq(o.say ?? `${R(i)} ← ${V(v)}`);
        n.addLine(o);
        s.beat();
      } else {
        n.lead("set", `${R(i)} ← ${V(v)} (was ${V(old)})`, o);
      }
      vals[i] = v;
      const patch = { text: opts.format ? String(opts.format(v)) : String(v), state: { value: v } };
      if (keyOf) patch.key = keyOf(v, i);
      s.set(slots[i], patch);
      syncState();
    },

    /**
     * A pointer rod named `label` standing at slot i. { tone, loop: true } — a loop variable: each move starts
     * the next step instead of joining the current one as a consequence. { say: false } keeps it out of captions.
     * Moving off either end hides it; moving back shows it again. Asking for an existing label moves that pointer.
     */
    pointer(label, i, o = {}) {
      if (pointers.has(label)) return pointers.get(label).handle.to(i, o);
      const p = { label, index: i, id: null, gen: 0, alive: false, tone: o.tone, loop: !!o.loop, quiet: o.say === false };
      const show = () => {
        p.gen++;
        p.id = p.gen === 1 ? `${id}.${label}` : `${id}.${label}~${p.gen}`;
        const po = { at: slots[p.index], text: label };
        if (p.tone !== undefined) po.tone = p.tone;
        s.pointer(p.id, po);
        p.alive = true;
      };
      if (inRange(i)) show();
      pointers.set(label, p);
      const handle = {
        label,
        get id() { return p.alive ? p.id : null; },
        get index() { return p.index; },
        /** move to slot j */
        to(j, o2 = {}) {
          if (!Number.isInteger(j)) throw new TypeError(`${name}.${label}.to: index must be an integer`);
          if (j === p.index && (p.alive || !inRange(j))) return handle;
          if (p.loop) n.close();
          p.index = j;
          if (inRange(j)) { if (p.alive) s.point(p.id, slots[j]); else show(); }
          else if (p.alive) { s.remove(p.id, { style: "fade" }); p.alive = false; }
          const text = o2.say ?? `${label} → ${j}`;
          if (!p.quiet && o2.say !== false) { if (p.loop) n.pre(text); else n.conseq(text); } else n.open();
          n.addLine(o2);
          return handle;
        },
        by(d, o2) { return handle.to(p.index + d, o2); },
        /** take the rod away (a later to() brings it back) */
        hide() {
          if (p.alive) { n.open(); s.remove(p.id, { style: "fade" }); p.alive = false; }
          p.index = -1;
          return handle;
        },
      };
      p.handle = handle;
      return handle;
    },

    /** Mark slots from..to (inclusive) with a tone (ok, busy, warn, fail, idle, ghost) or null to clear. Slot-based: survives swaps. */
    mark(from, to, tone, o = {}) {
      check(from, "mark"); check(to, "mark");
      if (tone !== null && !MARK_TONES.has(tone)) throw new TypeError(`${name}.mark: unknown tone "${tone}"`);
      n.open();
      for (let k = Math.min(from, to); k <= Math.max(from, to); k++) { tones[k] = tone; restyle(k); }
      if (o.say) n.note(o.say);
      else n.pre(from === to ? `${R(from)} marked` : `${name}[${from}..${to}] marked`);
      n.addLine(o);
    },
    /** Dim (or undim) slots from..to. */
    dim(from, to, on = true, o = {}) {
      check(from, "dim"); check(to, "dim");
      n.open();
      for (let k = Math.min(from, to); k <= Math.max(from, to); k++) { dims[k] = !!on; restyle(k); }
      if (o.say) n.note(o.say);
      n.addLine(o);
    },
    /** Dim everything outside from..to and undim inside: the active region. */
    only(from, to, o = {}) {
      check(from, "only"); check(to, "only");
      n.open();
      for (let k = 0; k < vals.length; k++) { dims[k] = k < from || k > to; restyle(k); }
      if (o.say) n.note(o.say);
      else n.pre(`Focus on ${name}[${from}..${to}]`);
      n.addLine(o);
    },
    /** Merge fields into the array's inspector state (e.g. { done: true }). */
    state(obj) { Object.assign(extra, obj); syncState(); },

    say(markup) { n.note(markup); },
    flush() { n.flush(); },
    step(caption, o) { return n.step(caption, o); },
    phase(label, o) { n.flush(); s.phase(label, o); },
    caption() { return n.caption(); },
  };
  return api;
}

// ---- stack and queue -------------------------------------------------------------------------------

function sequence(kind, s, id, opts = {}) {
  const auto = opts.auto ?? "op";
  const name = String(opts.name ?? opts.label ?? id);
  const V = showWith(opts.format);
  const text = (v) => (opts.format ? String(opts.format(v)) : String(v));
  const n = narrator(s, { auto, dur: opts.dur });
  const isStack = kind === "stack";
  const C = counterNames(opts.counters, isStack ? { pushes: null, pops: null } : { enqueues: null, dequeues: null });
  const co = { of: opts.of ?? "tile", axis: opts.axis ?? (isStack ? "z" : "x"), label: opts.label ?? name };
  for (const k of ["in", "at", "capacity", "cols", "rows"]) if (opts[k] !== undefined) co[k] = opts[k];
  s.container(id, co);
  const items = [];
  let seq = 0;
  const me = fmt.ref(id, name);
  const many = (k) => fmt.plural(k, "item");
  const count = (k) => { if (C[k]) s.count(C[k], 1); };

  function add(v, o, verb) {
    const tid = `${id}.${seq++}`;
    const to = { in: id, of: co.of, text: text(v) };
    if (opts.keyOf) to.key = opts.keyOf(v);
    if (o.key !== undefined) to.key = o.key;
    n.lead(verb, verb === "push" ? `Push ${V(v)} onto ${me} (${many(items.length + 1)})` : `Enqueue ${V(v)} at the tail of ${me} (${many(items.length + 1)})`, o);
    if (o.from !== undefined) s.spawn(tid, { ...to, from: o.from });
    else s.tile(tid, to);
    items.push({ id: tid, value: v });
    count(isStack ? "pushes" : "enqueues");
    return tid;
  }
  function take(o, verb) {
    if (!items.length) throw new RangeError(`${name}: ${verb} from an empty ${kind}`);
    const it = isStack ? items.pop() : items.shift();
    n.lead(verb, verb === "pop" ? `Pop ${V(it.value)} off ${me} (${many(items.length)} left)` : `Dequeue ${V(it.value)} from the head of ${me} (${many(items.length)} left)`, o);
    if (o.to !== undefined) s.move(it.id, o.to, o.via !== undefined ? { via: o.via } : {});
    else s.remove(it.id, { style: "sink" });
    count(isStack ? "pops" : "dequeues");
    return it.value;
  }
  function look(o, which) {
    if (!items.length) return undefined;
    const it = which === "top" ? items[items.length - 1] : items[0];
    if (o.lit !== false) s.lit(it.id);
    return it.value;
  }

  const api = {
    id, name,
    get size() { return items.length; },
    get length() { return items.length; },
    isEmpty() { return items.length === 0; },
    /** bottom → top (stack) or head → tail (queue) */
    values() { return items.map((x) => x.value); },
    tiles() { return items.map((x) => x.id); },
    say(markup) { n.note(markup); },
    flush() { n.flush(); },
    step(caption, o) { return n.step(caption, o); },
    phase(label, o) { n.flush(); s.phase(label, o); },
    caption() { return n.caption(); },
  };
  if (isStack) {
    /** push(v, { from, key, say, why, line }) -> tile id */
    api.push = (v, o = {}) => add(v, o, "push");
    /** pop({ to, via, say }) -> value; with `to` the tile travels into that container instead of sinking */
    api.pop = (o = {}) => take(o, "pop");
    api.peek = (o = {}) => look(o, "top");
  } else {
    api.enqueue = (v, o = {}) => add(v, o, "enqueue");
    api.dequeue = (o = {}) => take(o, "dequeue");
    api.front = (o = {}) => look(o, "front");
    api.push = api.enqueue;
    api.shift = api.dequeue;
  }
  return api;
}

const stack = (s, id, opts) => sequence("stack", s, id, opts);
const queue = (s, id, opts) => sequence("queue", s, id, opts);

// ---- hash table ------------------------------------------------------------------------------------

/** String hashes over UTF-16 code units, all uint32. */
export const HASHES = {
  fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  },
  djb2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) + str.charCodeAt(i)) | 0;
    return h >>> 0;
  },
  sum(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h + str.charCodeAt(i)) >>> 0;
    return h;
  },
};

function resolveHash(spec, label) {
  if (typeof spec === "function") return { fn: (k) => spec(k) >>> 0, identity: false, label };
  if (spec === "identity" || spec === "mod") return { fn: (k) => { if (!Number.isInteger(k)) throw new TypeError(`hash "${spec}" needs integer keys`); return k; }, identity: true, label };
  if (spec === "auto") return { fn: (k) => (Number.isInteger(k) ? k : HASHES.fnv1a(String(k))), identity: "auto", label };
  const f = HASHES[spec];
  if (!f) throw new TypeError(`unknown hash "${spec}" (use auto, identity, ${Object.keys(HASHES).join(", ")} or a function)`);
  return { fn: (k) => f(String(k)), identity: false, label };
}

/**
 * @param {Object} opts  buckets (m, default 8), hash ("auto" | "identity" | "fnv1a" | "djb2" | "sum" | fn), hashName
 *                       (default "hash"), probing ("chain" | "linear"), in, at, label, name, auto, dur, from (default
 *                       spawn source for new entries), capacity (records per chain bucket), counters (false | { probes,
 *                       collisions } renames), tombstone (text, default "†")
 */
function hashtable(s, id, opts = {}) {
  const m = opts.buckets ?? 8;
  if (!Number.isInteger(m) || m < 1) throw new RangeError(`hashtable: buckets must be a positive integer`);
  const probing = opts.probing ?? "chain";
  if (probing !== "chain" && probing !== "linear") throw new TypeError(`hashtable: probing must be "chain" or "linear"`);
  const auto = opts.auto ?? "op";
  const name = String(opts.name ?? opts.label ?? id);
  const H = resolveHash(opts.hash ?? "auto", opts.hashName ?? "hash");
  const V = showWith(opts.format);
  const text = (v) => (opts.format ? String(opts.format(v)) : String(v));
  const C = counterNames(opts.counters, { probes: "probes", collisions: "collisions" });
  const n = narrator(s, { auto, dur: opts.dur });
  const TOMB = opts.tombstone ?? "†";
  const stats = { probes: 0, collisions: 0 };
  const count = (k, d = 1) => { stats[k] += d; if (C[k]) s.count(C[k], d); };
  let seq = 0, size = 0;

  const bucketOf = (k) => {
    const h = H.fn(k);
    if (!Number.isInteger(h)) throw new TypeError(`hash of ${String(k)} is not an integer`);
    return ((h % m) + m) % m;
  };
  const expr = (k, b) => (H.identity && Number.isInteger(k) ? `${k} % ${m} = ${b}` : `${H.label}(${JSON.stringify(String(k))}) % ${m} = ${b}`);
  const K = (k) => chip(k);
  const final = (o, text) => (o.say ?? text) + (o.why && !o.say ? ` ${o.why}` : "");

  let buckets = null, chains = null, slots = null;
  if (probing === "chain") {
    const g = { title: opts.label ?? name };
    for (const k of ["in", "gap", "pad"]) if (opts[k] !== undefined) g[k] = opts[k];
    s.column(id, g);
    buckets = []; chains = [];
    for (let b = 0; b < m; b++) {
      const bid = `${id}.b${b}`;
      const co = { in: id, of: "record", axis: "x", label: String(b) };
      if (opts.capacity !== undefined) co.capacity = opts.capacity;
      s.container(bid, co);
      buckets.push(bid); chains.push([]);
    }
  } else {
    const co = { of: "record", axis: opts.axis ?? "y", label: opts.label ?? name, capacity: m, indices: true };
    for (const k of ["in", "at"]) if (opts[k] !== undefined) co[k] = opts[k];
    s.container(id, co);
    slots = [];
    for (let b = 0; b < m; b++) {
      const tid = `${id}.s${b}`;
      s.tile(tid, { in: id, of: "record", text: "", tone: "ghost" });
      slots.push({ tile: tid, state: "empty", key: undefined, value: undefined });
    }
  }
  const slotRef = (b, cap = false) => fmt.ref(slots[b].tile, `${cap ? "Slot" : "slot"} ${b}`);
  const bucketRef = (b) => fmt.ref(buckets[b], `bucket ${b}`);

  function spawnRecord(k, v, inId, o) {
    const tid = `${id}.e${seq++}`;
    const to = { in: inId, of: "record", text: String(k), sub: text(v), key: String(k) };
    const from = o.from ?? opts.from;
    if (from !== undefined) s.spawn(tid, { ...to, from });
    else s.tile(tid, to);
    return tid;
  }

  // ---- chaining ----
  function chainPut(k, v, o) {
    const b = bucketOf(k), chain = chains[b];
    const head = `Put ${K(k)} → ${V(v)}: ${fmt.code(expr(k, b))}`;
    const p = n.lead("put", head, o);
    s.tag(buckets[b], expr(k, b));
    s.lit(buckets[b]);
    for (const e of chain) {
      count("probes");
      if (e.key === k) {
        s.beat();
        s.lit(e.tile);
        s.set(e.tile, { sub: text(v) });
        const old = e.value;
        e.value = v;
        p.lead.text = final(o, `${head}; ${K(k)} is already in ${bucketRef(b)}, so update ${V(old)} → ${V(v)}`);
        return;
      }
    }
    s.beat();
    if (chain.length) count("collisions");
    const others = chain.map((e) => K(e.key));
    const tile = spawnRecord(k, v, buckets[b], o);
    chain.push({ key: k, value: v, tile });
    size++;
    p.lead.text = final(o, others.length ? `${head}; ${bucketRef(b)} already holds ${fmt.and(others)}, so chain it` : `${head}; ${bucketRef(b)} is empty`);
  }
  function chainGet(k, o, remove) {
    const b = bucketOf(k), chain = chains[b];
    const head = `${remove ? "Delete" : "Get"} ${K(k)}: ${fmt.code(expr(k, b))}`;
    const p = n.lead(remove ? "delete" : "get", head, o);
    s.tag(buckets[b], expr(k, b));
    s.lit(buckets[b]);
    let walked = 0;
    for (let i = 0; i < chain.length; i++) {
      const e = chain[i];
      count("probes"); walked++;
      if (e.key === k) {
        s.beat();
        s.lit(e.tile);
        if (remove) {
          s.remove(e.tile, { style: "fade" });
          chain.splice(i, 1);
          size--;
          p.lead.text = final(o, `${head}; found after ${fmt.plural(walked, "probe")}, unlink it`);
        } else p.lead.text = final(o, `${head}; found after ${fmt.plural(walked, "probe")} → ${V(e.value)}`);
        return { found: true, value: e.value };
      }
    }
    p.lead.text = final(o, `${head}; ${chain.length ? `not among the ${fmt.plural(chain.length, "key")} in ${bucketRef(b)}` : `${bucketRef(b)} is empty`}, so it is absent`);
    return { found: false, value: undefined };
  }

  // ---- linear probing: one step per probe ----
  function linearWalk(k, o, mode) {
    const h = bucketOf(k);
    const verb = mode === "put" ? "Put" : mode === "delete" ? "Delete" : "Get";
    let tomb = -1;
    for (let i = 0; i < m; i++) {
      const b = (h + i) % m, sl = slots[b];
      count("probes");
      const head = i === 0 ? `${verb} ${K(k)}: ${fmt.code(expr(k, b))}; ` : "";
      const lead = (t) => n.lead("probe", head + t, i === 0 ? o : { line: o.line });
      const here = slotRef(b, i > 0);
      const tagText = i === 0 ? expr(k, b) : `(${h} + ${i}) % ${m} = ${b}`;
      if (sl.state === "full" && sl.key === k) {
        lead(mode === "put" ? `${here} holds ${K(k)}, so update ${V(sl.value)} → ${V(o.value)}` : mode === "delete" ? `${here} holds ${K(k)}, so leave a tombstone` : `${here} holds ${K(k)} → ${V(sl.value)}`);
        s.tag(sl.tile, tagText); s.lit(sl.tile);
        const value = sl.value;
        if (mode === "put") { s.set(sl.tile, { sub: text(o.value) }); sl.value = o.value; }
        if (mode === "delete") { s.set(sl.tile, { text: TOMB, sub: "tomb", tone: "ghost" }); sl.state = "tomb"; sl.key = undefined; sl.value = undefined; size--; }
        return { found: true, value, slot: b };
      }
      if (sl.state === "empty") {
        if (mode === "put") {
          const at = tomb >= 0 ? tomb : b;
          lead(tomb >= 0 ? `${here} is empty, so ${K(k)} is absent; reuse the tombstone in ${slotRef(at)}` : `${here} is empty, so store ${K(k)} there`);
          s.tag(sl.tile, tagText); s.lit(slots[at].tile);
          s.set(slots[at].tile, { text: String(k), sub: text(o.value), key: String(k), tone: null });
          Object.assign(slots[at], { state: "full", key: k, value: o.value });
          size++;
          return { found: false, value: undefined, slot: at };
        }
        lead(`${here} is empty, so ${K(k)} is absent`);
        s.tag(sl.tile, tagText); s.lit(sl.tile);
        return { found: false, value: undefined, slot: -1 };
      }
      if (sl.state === "tomb") {
        if (tomb < 0) tomb = b;
        lead(`${here} is a tombstone, so keep probing`);
      } else {
        if (mode === "put") count("collisions");
        lead(`${here} holds ${K(sl.key)}, so probe ${slotRef((b + 1) % m)}`);
      }
      s.tag(sl.tile, tagText); s.lit(sl.tile);
    }
    if (mode === "put" && tomb >= 0) {
      n.lead("probe", `Every slot was probed; store ${K(k)} in the tombstone at ${slotRef(tomb)}`, { line: o.line });
      s.lit(slots[tomb].tile);
      s.set(slots[tomb].tile, { text: String(k), sub: text(o.value), key: String(k), tone: null });
      Object.assign(slots[tomb], { state: "full", key: k, value: o.value });
      size++;
      return { found: false, value: undefined, slot: tomb };
    }
    if (mode === "put") throw new RangeError(`${name}: the table is full (${m} slots); linear probing cannot place ${String(k)}`);
    return { found: false, value: undefined, slot: -1 };
  }

  const api = {
    id, name, buckets: m, probing,
    get size() { return size; },
    get load() { return size / m; },
    get stats() { return { ...stats }; },
    /** bucket index of a key, without narration */
    bucket(k) { return bucketOf(k); },
    /** put(k, v, { from, say, why, line }) */
    put(k, v, o = {}) { if (probing === "chain") chainPut(k, v, o); else linearWalk(k, { ...o, value: v }, "put"); },
    /** get(k) -> value | undefined (narrated walk) */
    get(k, o = {}) { return (probing === "chain" ? chainGet(k, o, false) : linearWalk(k, o, "get")).value; },
    has(k, o = {}) { return (probing === "chain" ? chainGet(k, o, false) : linearWalk(k, o, "get")).found; },
    /** delete(k) -> true if it was present (chaining unlinks; linear probing leaves a tombstone) */
    delete(k, o = {}) { return (probing === "chain" ? chainGet(k, o, true) : linearWalk(k, o, "delete")).found; },
    /** entries in bucket/slot order, no narration */
    entries() {
      if (probing === "chain") return chains.flatMap((c) => c.map((e) => [e.key, e.value]));
      return slots.filter((x) => x.state === "full").map((x) => [x.key, x.value]);
    },
    keys() { return api.entries().map((e) => e[0]); },
    /** chain: keys per bucket; linear: per slot (key | null | TOMB) */
    layout() {
      if (probing === "chain") return chains.map((c) => c.map((e) => e.key));
      return slots.map((x) => (x.state === "full" ? x.key : x.state === "tomb" ? TOMB : null));
    },
    /** the builder entity of bucket b (chain) or slot b (linear) */
    entity(b) { return probing === "chain" ? buckets[b] : slots[b].tile; },
    say(markup) { n.note(markup); },
    flush() { n.flush(); },
    step(caption, o) { return n.step(caption, o); },
    phase(label, o) { n.flush(); s.phase(label, o); },
    caption() { return n.caption(); },
  };
  return api;
}

export const tracked = { array, stack, queue, hashtable };
export default tracked;
