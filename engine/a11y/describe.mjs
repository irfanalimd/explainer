// The described scene's words: a figure's entities as a screen reader should hear them (PhET-style "interactive
// description"). DOM-free, so it runs in Node. Everything here reads the entity records the scene keeps per step
// (`frame.entities`, `tl.snapshot(i).entities`): names, status, what a tray holds, and what one step changed.
//   outline(entities)          -> [{ id, title, items: [{ id, text, depth }] }]   sections in layout order
//   describe(id, entities)     -> "map 1, busy, 4 records"
//   changes(before, after)     -> ["the, 1 moved from map 1 to reduce 0.", …]      what a step did, short sentences
//   stepChanges(tl, i)         -> the same for step i of a Timeline (lost messages said as lost)
//   lookLine(ids, entities)    -> "Look at: reduce 0 and the, 1."

import { WORLD_TYPE, worldCase } from "../tokens.mjs";

// things a reader can go to; groups and zones are headings, wires and floor prints are not things
export const THING = new Set(["housing", "container", "tile", "pointer", "packet", "lanes"]);
const NOUN = { record: ["record", "records"], page: ["page", "pages"], bit: ["bit", "bits"], tile: ["item", "items"] };
const STATUS = { busy: "busy", warn: "warning", fail: "failed" };   // ok and idle are the quiet default: not said
const SALIENT = ["role", "status", "phase", "mode", "task"];        // short state fields worth hearing
const MAX_CHANGES = 3;

/** Speakable text: the HUD's " · " separators become commas, arrows and markup marks are read as words. */
export const speak = (s) => String(s ?? "").replace(/\s*·\s*/g, ", ").replace(/\s*→\s*/g, " to ").replace(/\s*←\s*/g, " set to ").replace(/[{}`]/g, "").replace(/\s+/g, " ").trim();
const count = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;
const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const get = (ents, id) => (ents?.get ? ents.get(id) : null);
// a record's `children` is fixed when it is made; tiles that moved say where they are in `parent`. Children in layout
// order, then any that arrived later.
const kidsCache = new WeakMap();
function kidsOf(ents, id) {
  let by = kidsCache.get(ents);
  if (!by) {
    by = new Map();
    for (const [cid, e] of ents) if (e.parent != null) by.set(e.parent, [...(by.get(e.parent) ?? []), cid]);
    kidsCache.set(ents, by);
  }
  const now = by.get(id) ?? [];
  const listed = (get(ents, id)?.children ?? []).filter((c) => get(ents, c)?.parent === id);
  return [...listed, ...now.filter((c) => !listed.includes(c))];
}
const nounOf = (e) => NOUN[e?.of ?? "tile"] ?? NOUN.tile;

/** The entity's name alone: its title, text or label, else its id. */
export function nameOf(e, ents) {
  if (!e) return "";
  if (e.kind === "tile") {
    const slot = /\[(\d+)\]$/.exec(e.id);
    const parent = get(ents, e.parent);
    const text = speak(e.text) || "empty";
    return slot && parent?.kind === "container" && parent.of !== "bit" ? `${text}, slot ${slot[1]}` : text;
  }
  return speak(e.title ?? e.label ?? e.text ?? e.id);
}

/** One line per entity: name, then what matters about it now. */
export function describe(id, ents) {
  const e = get(ents, id);
  if (!e) return "";
  const name = nameOf(e, ents);
  const bits = [name];
  const st = e.state && typeof e.state === "object" && !(e.state instanceof Map) ? e.state : null;
  if (st) for (const k of SALIENT) {
    const v = st[k];
    if (((typeof v === "string" && v.length <= 24) || typeof v === "number") && speak(v) !== name) bits.push(speak(v));
  }
  // a sub that reads as words ("11 words", "term 2"); bare addresses and file names are noise
  if (e.sub && /\s/.test(String(e.sub)) && e.kind !== "tile") bits.push(speak(e.sub));
  if (e.kind === "tile" && e.sub && /\s/.test(String(e.sub))) bits.push(speak(e.sub));
  if (STATUS[e.led]) bits.push(STATUS[e.led]);
  if (e.kind === "packet") bits.push(`in flight from ${nameOf(get(ents, e.from), ents) || e.from} to ${nameOf(get(ents, e.to), ents) || e.to}`);
  if (e.kind === "pointer" && e.target) bits.push(`points at ${nameOf(get(ents, e.target), ents)}`);
  const held = kidsOf(ents, id).filter((c) => get(ents, c)?.kind === "tile");
  if (e.kind === "housing" || e.kind === "container") {
    const of = e.tray?.of ?? e.of ?? "tile";
    if (held.length || e.tray || e.kind === "container") bits.push(held.length ? count(held.length, NOUN[of] ?? NOUN.tile) : "empty");
  }
  if (e.dim) bits.push("faded");
  return bits.filter(Boolean).join(", ");
}

/**
 * Sections in layout order: a titled group is a heading over the things inside it; untitled groups are see-through.
 * Things outside any titled group gather in a first, untitled section. Items nest one level (a tray's tiles).
 */
export function outline(ents) {
  if (!ents?.get) return [];
  const loose = { id: null, title: null, items: [] };
  const sections = [loose];
  const seen = new Set();
  const addThing = (id, sec, depth) => {
    const e = get(ents, id);
    if (!e || seen.has(id)) return;
    seen.add(id);
    if (THING.has(e.kind)) {
      sec.items.push({ id, text: describe(id, ents), depth: Math.min(depth, 1) });
      for (const c of kidsOf(ents, id)) addThing(c, sec, depth + 1);
    } else if (e.kind === "group" && e.title) {
      const s = { id, title: worldCase(speak(e.title), WORLD_TYPE.zone), items: [] };   // as the world prints it: "Map"
      sections.push(s);
      for (const c of kidsOf(ents, id)) addThing(c, s, 0);
    } else for (const c of kidsOf(ents, id)) addThing(c, sec, depth);
  };
  addThing("@root", loose, 0);
  // things outside the tree: pointers and free entities join the scene, messages travelling get a section of their own
  const flight = { id: "@flight", title: "In flight", items: [] };
  for (const [id, e] of ents) if (!seen.has(id) && THING.has(e.kind) && (e.parent == null || !get(ents, e.parent))) addThing(id, e.kind === "packet" ? flight : loose, 0);
  return [...sections, flight].filter((s) => s.items.length);
}

/**
 * What one step did to the world, as at most MAX_CHANGES short sentences (then "And 4 more changes."). Status comes
 * first, then moves, arrivals and departures, then the rest. The same change on several things is one sentence
 * ("S2, S3 and S4 are now term 2.").
 */
export function changes(before, after, { lost } = {}) {
  if (!before?.get || !after?.get) return [];
  const groups = [new Map(), new Map(), new Map(), new Map()];   // by priority: phrase -> { names, say(names) }
  const add = (rank, key, who, say) => {
    const g = groups[rank].get(key) ?? { names: [], say };
    if (!g.names.includes(who)) g.names.push(who);
    groups[rank].set(key, g);
  };
  const is = (names) => (names.length > 1 ? "are" : "is");
  const sent = [], landed = [];   // messages that left or landed this step: grouped below by what fans in or out
  const n = (e, m) => nameOf(e, m);
  for (const [id, e] of after) {
    if (!THING.has(e.kind)) continue;
    const was = before.get(id), who = n(e, after);
    if (!was) {
      if (e.kind === "packet") { sent.push({ text: n(e, after) || "a message", from: n(get(after, e.from), after), to: n(get(after, e.to), after), lost: false }); continue; }
      const where = n(get(after, e.parent), after), noun = e.kind === "tile" ? nounOf(e) : ["new thing", "new things"];
      add(2, `new|${where}`, who, (ns) => `${ns.length > 3 ? `${count(ns.length, noun)} appear` : `New: ${list(ns)}`}${where ? ` in ${where}` : ""}.`);
      continue;
    }
    const st = e.state && typeof e.state === "object" ? e.state : {}, ws = was.state && typeof was.state === "object" ? was.state : {};
    let said = false;
    for (const k of SALIENT) {
      const v = st[k];
      if (v == null || v === ws[k] || !(typeof v === "string" || typeof v === "number") || speak(v) === who) continue;
      add(0, `st|${speak(v)}`, who, (ns) => `${list(ns)} ${is(ns)} now ${speak(v)}.`);
      said = true;
    }
    // a light that follows a new role ("leader") says nothing the role did not
    if (e.led !== was.led && e.led && !said) { const v = STATUS[e.led] ?? e.led; add(0, `led|${v}`, who, (ns) => `${list(ns)} ${is(ns)} now ${v}.`); }
    if (e.parent !== was.parent && e.parent && was.parent) {
      const from = n(get(before, was.parent), before), to = n(get(after, e.parent), after);
      add(1, `move|${from}|${to}`, who, (ns) => `${list(ns)} moved from ${from} to ${to}.`);
    }
    if (e.kind === "tile" && e.text !== was.text) add(1, `text|${id}`, n(was, before), (ns) => `${ns[0]} became ${speak(e.text) || "empty"}.`);
    else if (e.sub !== was.sub && e.sub && /\s/.test(String(e.sub))) add(3, `sub|${speak(e.sub)}`, who, (ns) => `${list(ns)} ${is(ns)} now ${speak(e.sub)}.`);
    if (!!e.dim !== !!was.dim) add(3, `dim|${!!e.dim}`, who, (ns) => `${list(ns)} ${e.dim ? (ns.length > 1 ? "fade" : "fades") : `${is(ns)} back`}.`);
  }
  for (const [id, e] of before) {
    if (!THING.has(e.kind) || after.has(id)) continue;
    if (e.kind === "packet") landed.push({ text: n(e, before) || "a message", from: n(get(before, e.from), before), to: n(get(before, e.to), before), lost: !!lost?.has(id) });
    else {
      const from = n(get(before, e.parent), before);
      add(3, `gone|${from}`, n(e, before), (ns) => `Gone${from ? ` from ${from}` : ""}: ${ns.length > 3 ? count(ns.length, ["thing", "things"]) : list(ns)}.`);
    }
  }
  // one sender to many ("S1 sends copy to S2, S3 and S4"), else many senders to one ("S2 and S3 send vote to S1")
  const fan = (msgs, kind, say) => {
    const by = new Map();
    for (const m of msgs) {
      const out = msgs.filter((x) => x.text === m.text && x.from === m.from && x.lost === m.lost).length > 1;
      const k = `${kind}|${m.text}|${m.lost}|${out ? `from ${m.from}` : `to ${m.to}`}`;
      by.set(k, [...(by.get(k) ?? []), m]);
    }
    for (const [k, ms] of by) {
      const one = ms.length > 1 && ms.every((m) => m.from === ms[0].from);
      add(1, k, k, () => say(ms[0], one ? ms[0].from : list(ms.map((m) => m.from)), one ? list(ms.map((m) => m.to)) : ms[0].to, !one && ms.length > 1));
    }
  };
  fan(sent, "send", (m, from, to, many) => `${from} ${many ? "send" : "sends"} ${m.text} to ${to}.`);
  fan(landed, "land", (m, from, to, many) => `${m.text} from ${from} ${m.lost ? (many ? "are lost on the way to" : "is lost on the way to") : many ? "arrive at" : "arrives at"} ${to}.`);
  const all = groups.flatMap((g) => [...g.values()].map(({ names, say }) => say(names)));
  if (all.length <= MAX_CHANGES) return all;
  const rest = all.length - MAX_CHANGES + 1;
  return [...all.slice(0, MAX_CHANGES - 1), `And ${count(rest, ["more change", "more changes"])}.`];
}

/** The ids of the messages a step loses in flight (`s.drop`), read from the Script's ops. */
export function lostIn(tl, i) {
  const out = new Set();
  for (const b of tl?.script?.steps?.[i]?.beats ?? []) for (const o of b.ops ?? []) if (o.op === "deliver" && o.lost) out.add(o.id);
  return out;
}

/** What step i of a Timeline did, from the snapshots on either side of it. */
export const stepChanges = (tl, i) => changes(tl.snapshot(i).entities, tl.snapshot(i + 1).entities, { lost: lostIn(tl, i) });

/** The step's look ids as one line: "Look at: reduce 0 and the, 1." */
export function lookLine(ids, ents) {
  const names = (ids ?? []).map((id) => nameOf(get(ents, id), ents)).filter(Boolean);
  return names.length ? `Look at: ${list([...new Set(names)])}.` : "";
}
