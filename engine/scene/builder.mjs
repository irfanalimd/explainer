// The builder API `s` that figure authors (and sim runtimes) write against (CONTRACTS.md 4.2).
// It records a Script: the opening state S0 (everything before the first s.step()) plus a list of steps,
// each a list of beats, each a list of ops. Ops are applied as they are recorded (so s.get / s.has see the
// live world) and every beat boundary freezes a copy-on-write state.
import { SIZE, MOTION } from "../tokens.mjs";
import { Draft, applyOp, isContainer, isParent, indexIn, WORLD_OPS } from "./state.mjs";
import { rng as localRng } from "./rng.mjs";

export const ROOT = "@root";
const OFS = new Set(["tile", "record", "bit", "page"]);
const VARIANTS = new Set(["node", "client", "store", "queue", "chip"]);
const SET_PROPS = new Set(["text", "sub", "key", "tone", "led", "title", "meter", "dim", "state", "variant", "label", "size", "around", "dashed"]);
// connections only draw these; anything else set on them would be silently ignored, so it is a problem
const KIND_PROPS = { trace: new Set(["tone", "dashed", "dim", "state"]), bus: new Set(["tone", "dim", "state"]) };

const idOf = (x) => (x && typeof x === "object" ? x.id : x);

export function createBuilder({ params = {}, scenario = null, rng: rngFactory, seed } = {}) {
  const problems = [];
  const draft = new Draft(new Map([[ROOT, Object.freeze({ id: ROOT, kind: "group", layout: "root", parent: null, children: Object.freeze([]), inc: 0 })]]));
  const opening = [];                // ops applied to S0 (for the hash)
  const steps = [];                  // committed steps
  const trailing = [];               // world ops after the last s.step() (a problem)
  const keyNames = new Map();        // key name -> index (first-seen order)
  const incs = new Map();            // id -> incarnation count
  const counters = {};               // live counter values
  let S0 = null;                     // opening state, set by the first s.step()
  let pending = freshPending();
  let lastCaption = "";
  let line = null;
  let markN = 0;
  let pace = null;
  let autoN = 0;
  let simNow = 0;                    // the sim time of the last committed step (a step without `t` keeps it)
  let openMarks = [];                // create ops of marks recorded without `t`: resolved when their step commits

  function freshPending() {
    return { beats: [{ ops: [], state: null }], phase: undefined, about: undefined, ask: null, focus: null, says: [], hasWorld: false };
  }
  const problem = (kind, message, id) => { problems.push({ kind, message, step: steps.length, id: id ?? null }); };
  const stepNo = () => steps.length;
  const opened = () => S0 !== null;

  function keyOf(name) {
    if (name === undefined || name === null || name === "") return null;
    const k = String(name);
    if (!keyNames.has(k)) {
      keyNames.set(k, keyNames.size);
      if (keyNames.size === 9) problem("keys", `more than 8 identity keys (${[...keyNames.keys()].join(", ")}): colours repeat`);
    }
    return keyNames.get(k);
  }

  function nextInc(id) { const n = (incs.get(id) ?? 0) + 1; incs.set(id, n); return n; }

  function resolveParent(inId, forKind, id) {
    const pid = idOf(inId) ?? ROOT;
    const p = draft.get(pid);
    if (!p) { problem("unknown-id", `${forKind} "${id}": unknown parent "${pid}"`, id); return ROOT; }
    if (forKind === "tile") {
      if (!isParent(p)) { problem("not-container", `tile "${id}" placed in "${pid}", which is a ${p.kind} without a tray`, id); return null; }
      return pid;
    }
    if (p.kind !== "group") { problem("not-group", `${forKind} "${id}" placed in "${pid}", which is not a layout group`, id); return ROOT; }
    return pid;
  }

  // every op goes through here: before the first step it shapes S0, afterwards it is recorded and animates
  function record(op) {
    if (!opened()) {
      applyOp(draft, op);
      opening.push(op);
      return op;
    }
    const beat = pending.beats[pending.beats.length - 1];
    op.beat = pending.beats.length - 1;
    op.seq = beat.ops.length;
    beat.ops.push(op);
    if (WORLD_OPS.has(op.op)) pending.hasWorld = true;
    applyOp(draft, op);
    return op;
  }

  function create(rec, index) {
    if (draft.has(rec.id)) { problem("duplicate-id", `"${rec.id}" is declared twice`, rec.id); return null; }
    if (rec.id === ROOT || typeof rec.id !== "string" || !rec.id) { problem("bad-id", `bad id ${JSON.stringify(rec.id)}`); return null; }
    rec.inc = nextInc(rec.id);
    rec.born = stepNo();
    if (isParent(rec) || rec.kind === "group") rec.children = Object.freeze([]);
    record({ op: "create", id: rec.id, rec: Object.freeze(rec), index });
    return rec;
  }

  const need = (id, what) => {
    const rid = idOf(id);
    const rec = draft.get(rid);
    if (!rec) problem("unknown-id", `${what}: unknown id "${rid}"`, rid);
    return rec;
  };

  function group(layout, id, o = {}) {
    const parent = resolveParent(o.in, "group", id);
    const titled = o.title !== undefined && o.title !== null && o.title !== "";
    create({
      id, kind: "group", layout, parent, at: o.at ?? null,
      gap: o.gap ?? (layout === "row" ? SIZE.gutter : 18),
      align: o.align ?? "center", pad: o.pad ?? (titled ? SIZE.zone.pad : 0),
      title: titled ? String(o.title) : null, tone: o.tone ?? null, dashed: !!o.dashed,
      cols: o.cols ?? null, radius: o.radius ?? null, start: o.start ?? -90,
    }, o.index);
    return { id };
  }

  function tileRec(id, o, parent) {
    const of = OFS.has(o.of) ? o.of : "tile";
    return {
      id, kind: "tile", of, parent, text: o.text === undefined || o.text === null ? "" : String(o.text),
      sub: o.sub === undefined || o.sub === null ? null : String(o.sub),
      key: o.key ?? null, keyIndex: keyOf(o.key), tone: o.tone ?? null, state: o.state ?? null,
      dim: !!o.dim, at: o.at ?? null, lod: o.lod ?? null,
      // optional width override (a wider cell, e.g. a pointer-sized word holding a full address)
      w: Number.isFinite(o.w) && o.w > 0 ? o.w : null,
    };
  }

  const s = {
    // ---- layout groups ----
    row: (id, o) => group("row", id, o),
    column: (id, o) => group("column", id, o),
    grid: (id, o) => group("grid", id, o),
    ring: (id, o) => group("ring", id, o),
    free: (id, o) => group("free", id, o),
    spacer(id, o = {}) {
      create({ id, kind: "spacer", parent: resolveParent(o.in, "spacer", id), w: o.w ?? 0, d: o.d ?? 0, at: o.at ?? null }, o.index);
      return { id };
    },

    // ---- solids and containers ----
    housing(id, o = {}) {
      const variant = VARIANTS.has(o.variant) ? o.variant : "node";
      let tray = null;
      if (o.tray) {
        const t = o.tray;
        tray = Object.freeze({
          cols: t.cols ?? null, rows: t.rows ?? null, of: OFS.has(t.of) ? t.of : "tile",
          order: ["row", "column", "stack"].includes(t.order) ? t.order : "row", capacity: t.capacity ?? null,
        });
      }
      create({
        id, kind: "housing", variant, parent: resolveParent(o.in, "housing", id), at: o.at ?? null,
        title: o.title ?? id, sub: o.sub ?? null, tray, w: o.w ?? null, d: o.d ?? null,
        led: o.led ?? null, key: o.key ?? null, keyIndex: keyOf(o.key), meter: o.meter ?? null,
        state: o.state ?? null, tone: o.tone ?? null, dim: !!o.dim, lod: o.lod ?? null,
      }, o.index);
      return { id };
    },
    container(id, o = {}) {
      create({
        id, kind: "container", parent: resolveParent(o.in, "container", id), at: o.at ?? null,
        of: OFS.has(o.of) ? o.of : "tile", cols: o.cols ?? null, rows: o.rows ?? null,
        axis: ["x", "y", "z"].includes(o.axis) ? o.axis : "x", label: o.label ?? null, indices: !!o.indices,
        capacity: o.capacity ?? null, fields: o.fields ?? null, dim: !!o.dim, tone: o.tone ?? null, lod: o.lod ?? null,
      }, o.index);
      return { id };
    },
    tile(id, o = {}) {
      const parent = resolveParent(o.in, "tile", id);
      if (!parent) return { id };
      create(tileRec(id, o, parent), o.index);
      return { id };
    },
    array(id, values, o = {}) {
      const list = Array.from(values ?? []);
      s.container(id, { in: o.in, at: o.at, of: o.of ?? "tile", axis: "x", label: o.label ?? null, indices: o.indices ?? true, capacity: o.capacity ?? list.length, cols: o.cols ?? null });
      const cells = list.map((v, i) => {
        const cid = `${id}[${i}]`;
        s.tile(cid, { in: id, of: o.of ?? "tile", text: v, key: o.keyOf ? o.keyOf(v, i) : undefined, state: { value: v } });
        return cid;
      });
      return { id, cells, cell: (i) => cells[i] };
    },
    bits(id, o = {}) {
      const width = o.width ?? 8;
      const fields = (o.fields ?? []).map((f) => ({ name: f.name, from: Math.min(f.from, f.to), to: Math.max(f.from, f.to), key: f.key ?? null }));
      s.container(id, { in: o.in, at: o.at, of: "bit", axis: "x", capacity: width, fields, label: o.label ?? null });
      const v = BigInt(Math.trunc(Number(o.value ?? 0)));
      const byBit = [];
      for (let bit = width - 1; bit >= 0; bit--) {
        const f = fields.find((x) => bit >= x.from && bit <= x.to);
        const cid = `${id}[${bit}]`;
        s.tile(cid, { in: id, of: "bit", text: String(Number((v >> BigInt(bit)) & 1n)), key: f?.key ?? undefined, state: { bit } });
        byBit[bit] = cid;
      }
      const cells = byBit.slice().reverse();
      return { id, cells, cell: (i) => byBit[i] };
    },
    pointer(id, o = {}) {
      const target = idOf(o.at);
      const t = target ? need(target, `pointer "${id}"`) : null;
      create({
        id, kind: "pointer", parent: null, target: t ? target : null, slot: t ? slotRef(target) : null,
        follow: o.follow === "tile" ? "tile" : "slot", text: o.text ?? id, tone: o.tone ?? null,
      });
      return { id };
    },
    text(id, o = {}) {
      create({
        id, kind: "text", parent: resolveParent(o.in, "text", id), at: o.at ?? null, text: String(o.text ?? ""),
        size: o.size ?? 8, tone: o.tone ?? null, align: o.align ?? "center", lod: o.lod ?? null,
      }, o.index);
      return { id };
    },

    // ---- connections ----
    trace(id, from, to, o = {}) {
      const a = need(from, `trace "${id}" from`), b = need(to, `trace "${id}" to`);
      if (!a || !b) return { id };
      create({
        id, kind: "trace", parent: null, from: idOf(from), to: idOf(to), route: o.route ?? "auto",
        fromSide: o.fromSide ?? null, toSide: o.toSide ?? null, style: o.style ?? "groove", dashed: !!o.dashed, tone: o.tone ?? null,
      });
      return { id };
    },
    bus(id, o = {}) {
      const from = (o.from ?? []).map(idOf), to = (o.to ?? []).map(idOf);
      for (const x of [...from, ...to]) need(x, `bus "${id}"`);
      if (o.via) need(o.via, `bus "${id}" via`);
      create({ id, kind: "bus", parent: null, from: Object.freeze(from.filter((x) => draft.has(x))), to: Object.freeze(to.filter((x) => draft.has(x))), via: idOf(o.via) ?? null, style: o.style ?? "groove" });
      return { id };
    },
    // a printed floor region around any entities; its bounds follow them every frame
    zone(id, o = {}) {
      const around = (o.around ?? []).map(idOf).filter((x) => need(x, `zone "${id}"`));
      create({ id, kind: "zone", parent: null, around: Object.freeze(around), title: o.title ?? null, tone: o.tone ?? null, dashed: !!o.dashed });
      return { id };
    },
    lanes(id, o = {}) {
      const list = (o.for ?? []).map(idOf);
      for (const x of list) need(x, `lanes "${id}"`);
      create({
        id, kind: "lanes", parent: resolveParent(o.in, "lanes", id), at: o.at ?? null, for: Object.freeze(list),
        length: o.length ?? 600, scale: o.scale ?? null, label: o.label ?? null, unit: o.unit ?? "ms",
      }, o.index);
      return { id };
    },
    mark(laneFor, o = {}) {
      const ent = idOf(laneFor);
      const board = [...draft.state.values()].find((r) => r.kind === "lanes" && r.for.includes(ent));
      if (!board) { problem("no-lane", `mark on "${ent}": no lanes board has a lane for it`, ent); return { id: null }; }
      const id = o.id ?? `${ent}@mark${++markN}`;
      const t = o.t ?? null;
      const rec = create({ id, kind: "mark", parent: null, board: board.id, lane: ent, t, text: o.text ?? null, tone: o.tone ?? null });
      // no `t`: the mark lands at the sim time of the step it is committed in (resolved in s.step)
      if (rec && t === null && opened()) openMarks.push(rec.id);
      return { id };
    },

    // ---- step operations ----
    move(tile, to, o = {}) {
      const id = idOf(tile), rec = need(id, "move");
      const dest = draft.get(idOf(to));
      if (!rec) return;
      if (!dest) { problem("unknown-id", `move "${id}": unknown destination "${idOf(to)}"`, id); return; }
      if (!isParent(dest)) { problem("not-container", `move "${id}" into "${dest.id}", which is a ${dest.kind}${dest.kind === "housing" ? " without a tray" : ""}`, id); return; }
      if (rec.kind !== "tile") { problem("not-tile", `move "${id}": only tiles move between containers (it is a ${rec.kind})`, id); return; }
      record({ op: "move", id, to: dest.id, via: o.via ?? "auto", index: o.index ?? null, fromParent: rec.parent, fromIndex: indexIn(draft.state, id) });
    },
    swap(a, b) {
      const ra = need(a, "swap"), rb = need(b, "swap");
      if (!ra || !rb) return;
      if (ra.kind !== "tile" || rb.kind !== "tile") { problem("not-tile", `swap "${ra.id}" and "${rb.id}": both must be tiles`); return; }
      record({ op: "swap", a: ra.id, b: rb.id });
    },
    spawn(id, o = {}) {
      const src = o.from ? need(o.from, `spawn "${id}" from`) : null;
      const parent = resolveParent(o.in, "tile", id);
      if (!parent) return { id };
      if (draft.has(id)) { problem("duplicate-id", `spawn "${id}": id exists`, id); return { id }; }
      const rec = tileRec(id, o, parent);
      rec.inc = nextInc(id); rec.born = stepNo();
      record({ op: "spawn", id, from: src ? src.id : null, rec: Object.freeze(rec), index: o.index ?? null, via: o.via ?? "auto" });
      return { id };
    },
    remove(id, o = {}) {
      const rec = need(id, "remove");
      if (!rec) return;
      const to = o.to ? need(o.to, `remove "${idOf(id)}" to`) : null;
      record({ op: "remove", id: rec.id, style: o.style === "fade" ? "fade" : "sink", to: to ? to.id : null });
    },
    set(id, props = {}) {
      const rec = need(id, "set");
      if (!rec) return;
      const p = {};
      for (const [k, v] of Object.entries(props)) {
        if (!SET_PROPS.has(k)) { problem("bad-prop", `set "${rec.id}": unknown property "${k}"`, rec.id); continue; }
        if (KIND_PROPS[rec.kind] && !KIND_PROPS[rec.kind].has(k)) { problem("bad-prop", `set "${rec.id}": a ${rec.kind} has no "${k}" (it takes ${[...KIND_PROPS[rec.kind]].join(", ")})`, rec.id); continue; }
        if (k === "text" || k === "sub" || k === "title") p[k] = v === null || v === undefined ? (k === "text" ? "" : null) : String(v);
        else if (k === "dim") p.dim = !!v;
        else if (k === "key") { p.key = v ?? null; p.keyIndex = keyOf(v); }
        else if (k === "variant") p.variant = VARIANTS.has(v) ? v : rec.variant;
        else if (k === "around") p.around = Object.freeze((v ?? []).map(idOf).filter((x) => need(x, `set "${rec.id}" around`)));
        else if (k === "dashed") p.dashed = !!v;
        else p[k] = v;
      }
      record({ op: "set", id: rec.id, props: Object.freeze(p), prev: rec });
    },
    send(id, from, to, o = {}) {
      const a = need(from, `send "${id}" from`), b = need(to, `send "${id}" to`);
      if (!a || !b) return { id };
      if (draft.has(id)) { problem("duplicate-id", `send "${id}": id exists`, id); return { id }; }
      const hold = o.deliver === "hold";
      // departure offset inside the step: `delay` in sim time units, or `at` as a fraction (0..1) of the step
      const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const at = num(o.at) === null ? null : Math.max(0, Math.min(1, o.at));
      const delay = num(o.delay) === null ? null : Math.max(0, o.delay);
      if ((o.at !== undefined && at === null) || (o.delay !== undefined && delay === null)) problem("bad-prop", `send "${id}": at/delay must be numbers`, id);
      const rec = Object.freeze({
        id, kind: "packet", parent: null, from: a.id, to: b.id, text: o.text ?? null, key: o.key ?? null, keyIndex: keyOf(o.key),
        via: o.via ?? "auto", lane: !!o.lane, hold, inc: nextInc(id), born: stepNo(), tone: o.tone ?? null,
      });
      record({ op: "send", id, from: a.id, to: b.id, via: rec.via, lane: rec.lane, hold, rec, ...(at !== null ? { at } : {}), ...(delay !== null ? { delay } : {}) });
      return { id };
    },
    deliver(id, o = {}) {
      const rec = need(id, "deliver");
      if (!rec) return;
      if (rec.kind !== "packet" || !rec.hold) { problem("not-held", `deliver "${rec.id}": not a held message`, rec.id); return; }
      if (o.into && !o.remove) {
        const dest = draft.get(idOf(o.into));
        if (!isContainer(dest)) { problem("not-container", `deliver "${rec.id}" into "${idOf(o.into)}", not a container`, rec.id); return; }
        const of = dest.kind === "housing" ? dest.tray.of : dest.of;
        const tile = tileRec(rec.id, { of: o.of ?? of, text: o.text ?? rec.text ?? "", key: o.key ?? rec.key, sub: o.sub, state: o.state, tone: o.tone }, dest.id);
        tile.inc = rec.inc; tile.born = rec.born;
        record({ op: "deliver", id: rec.id, into: dest.id, index: o.index ?? null, rec: Object.freeze(tile), msg: rec });
      } else record({ op: "deliver", id: rec.id, into: null, msg: rec, lost: !!o.lost, at: o.at ?? null });
    },
    // a held message lost in flight: it stops where it is (or at fraction `at` of its path), flashes and fades
    drop(id, o = {}) { s.deliver(id, { remove: true, lost: true, at: o.at }); },
    point(pointer, tile) {
      const p = need(pointer, "point"), t = need(tile, "point");
      if (!p || !t) return;
      if (p.kind !== "pointer") { problem("not-pointer", `point "${p.id}": not a pointer`, p.id); return; }
      record({ op: "point", id: p.id, target: t.id, slot: slotRef(t.id) });
    },
    lit(...ids) { const list = ids.flat().map(idOf).filter((x) => need(x, "lit")); if (list.length) annotate({ op: "lit", ids: list }); },
    focus(...ids) { const list = ids.flat().map(idOf).filter((x) => need(x, "focus")); if (list.length) pending.focus = (pending.focus ?? []).concat(list); },
    tag(entity, text, o = {}) {
      const rec = need(entity, "tag");
      if (rec) annotate({ op: "tag", id: rec.id, text: String(text), tone: o.tone ?? null });
    },
    count(name, delta = 1) { counters[name] = (counters[name] ?? 0) + delta; annotate({ op: "count", name, delta, value: counters[name] }); },
    gauge(name, value) { counters[name] = value; annotate({ op: "gauge", name, value }); },
    line(from, to = from) { line = from === null || from === undefined ? null : [from, to]; annotate({ op: "line", line }); },
    say(markup) { if (markup !== undefined && markup !== null && markup !== "") pending.says.push(String(markup)); },
    // predict: `why` (optional) is one plain sentence on why the answer is right, shown once the answer is revealed
    ask(question, options = [], answer = 0, o = {}) {
      const why = o?.why === undefined || o?.why === null || o?.why === "" ? undefined : String(o.why);
      pending.ask = Object.freeze({ question: String(question), options: Object.freeze(options.map(String)), answer, ...(why ? { why } : {}) });
    },
    // a chapter; `about` is an optional plain-English line on what the chapter does and why (the explain panel shows it)
    phase(name, o) {
      pending.phase = String(name);
      const about = typeof o === "string" ? o : o?.about;
      pending.about = about === undefined || about === null || about === "" ? undefined : String(about);
    },
    // opt-in pacing for simulated time: steps with a sim time `t` and no explicit dur last
    // (t_next - t) / ms seconds, clamped to [min, max], so packets fly at a constant speed. A step still lasts at
    // least its caption's reading time (MOTION.read) unless `read: false`, which keeps sim-time proportions exact.
    pace(o) { pace = o === null || o === false ? null : { ms: o?.ms ?? 10, min: o?.min ?? 0.45, max: o?.max ?? 2.4, ...(o?.read === false ? { read: false } : {}) }; },
    beat() {
      const cur = pending.beats[pending.beats.length - 1];
      if (cur.ops.length && opened()) { cur.state = draft.commit(); pending.beats.push({ ops: [], state: null }); }
    },
    step(caption, o = {}) {
      const dur = o.dur ?? null;
      let simTime = o.t ?? null;
      if (simTime !== null) simNow = simTime;
      if (!opened()) {
        S0 = draft.commit();
        pending.beats[0].state = S0;
      } else {
        const cur = pending.beats[pending.beats.length - 1];
        if (!cur.ops.length && pending.beats.length > 1) pending.beats.pop();
        else cur.state = draft.commit();
      }
      if (openMarks.length) resolveMarks(simNow);
      const text = [caption, ...pending.says].filter((x) => x !== undefined && x !== null && x !== "").join(" ");
      if (!text) problem("no-caption", `step ${steps.length} has no caption`);
      steps.push({
        index: steps.length, caption: text, dur, simTime, pace, phase: pending.phase, about: pending.about, ask: pending.ask, focus: pending.focus,
        beats: pending.beats, line, counters: Object.freeze({ ...counters }),
        ...(o.keep ? { keep: true } : {}),   // never folded into a fast run of repeats (engine/playback.mjs)
      });
      lastCaption = text;
      pending = freshPending();
    },
    hold(dur, caption) { s.step(caption ?? lastCaption, { dur: dur ?? MOTION.step }); },

    // ---- queries ----
    rng: (rngFactory ?? localRng)(seed ?? params.seed ?? 1),
    key: (name) => keyOf(name),
    has: (id) => draft.has(idOf(id)),
    get(id) {
      const rec = draft.get(idOf(id));
      if (!rec) return undefined;
      return rec.parent ? Object.freeze({ ...rec, index: indexIn(draft.state, rec.id) }) : rec;
    },
    get params() { return params; },
    get scenario() { return scenario; },
    get stepIndex() { return steps.length; },
    uid(prefix = "e") { return `${prefix}#${++autoN}`; },
  };

  // give the step's unresolved marks its sim time, in the recorded ops and in every state of this step
  function resolveMarks(t) {
    const ids = new Set(openMarks);
    openMarks = [];
    for (const b of pending.beats) for (const op of b.ops) {
      if (op.op !== "create" || !ids.has(op.id) || op.rec.t !== null) continue;
      const inc = op.rec.inc;
      op.rec = Object.freeze({ ...op.rec, t });
      for (const bb of pending.beats) {
        const r = bb.state?.get(op.id);
        if (r && r.inc === inc && r.t === null) bb.state.set(op.id, Object.freeze({ ...r, t }));
      }
    }
  }

  function annotate(op) {
    if (!opened()) { opening.push(op); op.beat = 0; op.seq = 0; op.opening = true; pending.beats[0].ops.push(op); return; }
    record(op);
  }

  function slotRef(tileId) {
    const rec = draft.get(tileId);
    if (!rec?.parent) return null;
    return Object.freeze({ parent: rec.parent, index: indexIn(draft.state, tileId) });
  }

  /** Close the recording: returns the Script. Ops after the last step are reported and dropped. */
  function finish() {
    if (!opened()) {
      // a figure with no steps at all: one implicit step showing the opening state
      problem("no-steps", "the figure never calls s.step()");
      s.step(" ");
    }
    for (const b of pending.beats) for (const op of b.ops) if (WORLD_OPS.has(op.op) || op.op === "tag" || op.op === "count") trailing.push(op);
    if (trailing.length) problems.push({ kind: "trailing-ops", message: `${trailing.length} op(s) after the last s.step() are never shown (${[...new Set(trailing.map((o) => o.op))].join(", ")})`, step: steps.length - 1, id: null });
    // the state the world ends in is the last committed one, not the dropped trailing ops
    return {
      S0, steps, opening, trailing, problems,
      keys: [...keyNames.entries()].map(([name, index]) => ({ name, index })),
      final: steps.length ? lastState(steps[steps.length - 1]) : S0,
    };
  }
  const lastState = (st) => st.beats[st.beats.length - 1].state;

  return { s, finish };
}
