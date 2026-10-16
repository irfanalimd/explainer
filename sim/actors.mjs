// Deterministic discrete-event simulation of message-passing nodes, rendered through the Scene builder.
// One event (a delivery, a lost message, a timer, a crash, a recovery, a partition, an external event) is one
// builder step with t = sim time in ms. Events are ordered by (time, seq): ties go in scheduling order.
//
//   const net = network(s, { nodes: ["s1", "s2", "s3"], in: "cluster", latency: { mean: 12, jitter: 4 }, seed: 7 });
//   net.onStart("*", (ctx) => ctx.timer("ping", 50));
//   net.onTimer("s1", "ping", (ctx) => ctx.broadcast("Ping", { n: 1 }));
//   net.on("*", "Ping", (msg, ctx) => ctx.reply(msg, "Pong", {}));
//   net.run({ until: 500, intro: "Three nodes, one pinger" });
//
// Messages: s.send(id, from, to, { text, key, via, lane, deliver: "hold" }) at send time, s.deliver(id) when they
// arrive. A message that is dropped, cut by a partition or addressed to a crashed node visibly dies: a fail-toned
// tag on the packet, then s.deliver(id, { remove: true }). Random drops die halfway; partition cuts at send time
// die halfway; a partition or crash that happens while the message is in flight kills it on arrival.
//
// Batching (opts.batch = window ms, default 0 = every event its own step): consecutive deliveries or losses of one
// message type fanning out from one sender or into one receiver, and same-named timers, that fall within the window
// share one step. Handlers narrate with ctx.say (verbatim) or ctx.chorus(key, (who, n) => markup), which merges with
// the same key across the batch ("s3, s4 and s5 take the heartbeat"). Events that say nothing get generated captions
// that merge the same way. opts.quiet = ["partition", "drop", "down"]: losses of those reasons make no step of their
// own; their ops join the next step.
//
// Pacing: a step plays for the sim time until the next step, scaled and clamped so bursts stay readable and idle
// stretches do not drag:  dur = MOTION.step · clamp((gap / ref)^γ, PACE.min, PACE.max), ref = the mean latency.
// By default γ = 1 (constant packet speed: one mean latency of flight plays in MOTION.step) and the builder does
// the arithmetic itself: run() calls s.pace({ ms: ref / MOTION.step, min, max }) and gives every step its sim time
// t; on a builder without s.pace the same durations are passed per step. compress: γ < 1 compresses long gaps
// harder (explicit durations), false leaves every step at the builder's default.

import { MOTION } from "../engine/tokens.mjs";
import { rng as makeRng } from "./rng.mjs";
import * as fmt from "./fmt.mjs";

/** Pacing constants, as multiples of MOTION.step (and the default exponent: 1 = constant packet speed). */
export const PACE = { min: 0.4, max: 2.2, gamma: 1 };

const round1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** Seconds of playback for a step whose next step comes `gap` ms of sim time later (see header). */
export function pace(gap, { ref = 10, gamma = PACE.gamma } = {}) {
  const x = gap > 0 ? Math.pow(gap / ref, gamma) : 0;
  return Math.round(MOTION.step * clamp(x, PACE.min, PACE.max) * 1000) / 1000;
}

// binary min-heap on (time, seq)
class Agenda {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  less(x, y) { return x.time < y.time || (x.time === y.time && x.seq < y.seq); }
  push(e) {
    const a = this.a; a.push(e);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  peek() { return this.a[0]; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}

const R = (id) => fmt.ref(id);

/**
 * @param {Object} s     the Scene builder
 * @param {Object} opts
 *   id          network id, prefixes message ids (default "net")
 *   nodes       ["s1", …] or [{ id, title, sub, variant, tray, in, led, key, broadcast, lane }] — housings are created
 *               unless they already exist (s.has)
 *   clients     extra endpoints (variant "client"): they send and receive but are not broadcast targets
 *   in          group for created housings
 *   latency     ms: a number, { mean, jitter, min } (uniform in mean ± jitter), or (from, to, rng) => ms
 *   drop        probability a message is lost (default 0)
 *   fifo        keep per-link order (default false: jitter can reorder)
 *   seed        seeds the network's streams; default: s.rng.fork("network:<id>")
 *   state       (id) => initial node state
 *   inspect     (state, id) => inspector view, or false to never publish state (default: the state itself)
 *   text, key   (msg) => packet label / identity key (default: the type, no key)
 *   via         "air" | trace id | (from, to) => via (default "air")
 *   lanes       { id, in, at, length, scale, label, for } — a space-time board; sends between laned nodes draw
 *               diagonals and timers mark the lane
 *   compress    default: builder pacing (s.pace), linear; a number γ: explicit durations (gap / ref)^γ; a function
 *               (gapToNextMs) => seconds; false: every step at the builder's default duration
 *   pace        { ref, at, min, max, minor }: ref ms of sim time play in `at` seconds (defaults: the mean latency,
 *               MOTION.step), clamped to [min, max] seconds (defaults: MOTION.step × PACE.min / PACE.max); with
 *               `minor`, a step whose caption repeats a recent one, or that says only { minor } things, lasts minor s
 *   counters    { sent, delivered, lost } counter names to bump automatically (default: none)
 *   led         LED of a healthy node (default "ok")
 *   batch       window in ms for merging bursts into one step (default 0, see header)
 *   focus       ids (or (net) => ids) the camera frames on every step, e.g. the whole cluster (default: what moved)
 *   quiet       loss reasons ("partition", "drop", "down") whose deaths join the next step (default none)
 *   zones       draw a partition's smaller side as a dashed fail zone when the builder has s.zone (default true)
 */
export function network(s, opts = {}) {
  const netId = opts.id ?? "net";
  const base = opts.seed !== undefined ? makeRng(opts.seed).fork(`network:${netId}`)
    : typeof s.rng?.fork === "function" ? s.rng.fork(`network:${netId}`) : makeRng(`network:${netId}`);
  const latRng = base.fork("latency"), dropRng = base.fork("drop");
  const counters = opts.counters ?? {};

  const lat = opts.latency ?? { mean: 10, jitter: 0 };
  const latMean = typeof lat === "number" ? lat : typeof lat === "object" ? lat.mean ?? 10 : 10;
  const latencyOf = (from, to) => {
    let x;
    if (typeof lat === "function") x = lat(from, to, latRng);
    else if (typeof lat === "number") x = lat;
    else x = (lat.mean ?? 10) + (lat.jitter ?? 0) * (2 * latRng.next() - 1);
    const min = (typeof lat === "object" && lat.min) || Math.max(0.1, latMean * 0.05);
    if (!Number.isFinite(x)) throw new Error(`network: latency for ${from} → ${to} is not a number`);
    return round1(Math.max(min, x));
  };

  // ---- nodes ----
  const nodes = new Map();
  const order = [];
  const norm = (n, client) => (typeof n === "string" ? { id: n, client } : { ...n, client });
  const specs = [...(opts.nodes ?? []).map((n) => norm(n, false)), ...(opts.clients ?? []).map((n) => norm(n, true))];
  if (!specs.length) throw new Error("network: no nodes");
  const laneFor = new Set(opts.lanes ? opts.lanes.for ?? specs.filter((x) => !x.client && x.lane !== false).map((x) => x.id) : []);
  for (const sp of specs) {
    if (nodes.has(sp.id)) throw new Error(`network: duplicate node "${sp.id}"`);
    if (!s.has(sp.id)) {
      const ho = { title: sp.title ?? sp.id, variant: sp.variant ?? (sp.client ? "client" : "node"), led: sp.led ?? opts.led ?? "ok" };
      const inId = sp.in ?? opts.in;
      if (inId !== undefined) ho.in = inId;
      for (const k of ["sub", "tray", "key", "meter", "w", "d"]) if (sp[k] !== undefined) ho[k] = sp[k];
      s.housing(sp.id, ho);
    }
    const node = {
      id: sp.id, client: sp.client, up: true, led: sp.led ?? opts.led ?? "ok",
      broadcast: sp.broadcast ?? !sp.client, lane: laneFor.has(sp.id),
      state: opts.state ? opts.state(sp.id) : {}, timers: new Map(), rng: base.fork(`node:${sp.id}`),
      lastJson: null, skipSync: false, ctx: null,
    };
    nodes.set(sp.id, node);
    order.push(sp.id);
  }
  const clusterIds = order.filter((id) => !nodes.get(id).client);
  const clientIds = order.filter((id) => nodes.get(id).client);

  let lanesId = null;
  if (opts.lanes) {
    const L = opts.lanes;
    lanesId = L.id ?? `${netId}.lanes`;
    const lo = { for: [...laneFor], unit: "ms" };
    for (const k of ["in", "at", "length", "scale", "label"]) if (L[k] !== undefined) lo[k] = L[k];
    s.lanes(lanesId, lo);
  }

  // ---- handlers ----
  const K = (a, b) => `${a}\u0001${b}`;
  const msgH = new Map(), timerH = new Map();
  const hooks = { start: [], crash: [], recover: [] };
  const known = (node, who) => { if (node !== "*" && !nodes.has(node)) throw new Error(`network.${who}: unknown node "${node}"`); };
  const findMsg = (node, type) => msgH.get(K(node, type)) ?? msgH.get(K("*", type)) ?? msgH.get(K(node, "*")) ?? msgH.get(K("*", "*"));
  const findTimer = (node, name) => timerH.get(K(node, name)) ?? timerH.get(K("*", name));

  // ---- the agenda ----
  const agenda = new Agenda();
  let seq = 0, msgSeq = 0;
  let now = 0;
  const schedule = (time, kind, data) => {
    if (!(time >= now)) throw new Error(`network: cannot schedule ${kind} at ${time} ms, before now (${now} ms)`);
    const ev = { time, seq: seq++, kind, ...data, cancelled: false };
    agenda.push(ev);
    return ev;
  };

  let partition = null; // { groups, side: Map }
  let zoneId = null, zoneSeq = 0;
  let dropRate = opts.drop ?? 0;
  const inFlight = new Map(); // msg id -> msg
  const lastOnLink = new Map();
  const stats = { sent: 0, delivered: 0, dropped: 0, cut: 0, toDown: 0, events: 0, steps: 0 };
  let started = false, stopped = false, ended = false;
  let narr = null;           // narration items of the step being built: { say } | { chorus, fn, subject }
  const early = [];          // narration given outside an event, for the next step
  let batchSent = null;      // ids of messages sent while a batch is open (they cannot join it)
  let stepSends = [];        // sends of the step being built (narrated when nothing else is)
  let stepOps = 0;           // other visible network ops in the step being built
  let stepT0 = 0;            // sim time of the first event of the step being built
  let stepNo = 0;            // serial of the step being built
  let lossTagged = false;    // a loss chip was already placed in this step
  const toldDown = new Set();  // down nodes whose lost messages have been narrated this outage
  let batchWindow = opts.batch ?? 0;
  const quietLoss = new Set(opts.quiet ?? []);   // loss reasons whose deaths join the next step instead of making one
  let quietPending = 0;
  let compress = opts.compress;
  const paceRef = opts.pace?.ref ?? latMean;

  const blocked = (a, b) => !!partition && partition.side.has(a) && partition.side.has(b) && partition.side.get(a) !== partition.side.get(b);
  const bump = (name, d = 1) => { if (counters[name]) s.count(counters[name], d); };

  function textOf(msg) { return opts.text ? opts.text(msg) : msg.type; }
  function keyOf(msg) { return opts.key ? opts.key(msg) : undefined; }
  function viaOf(from, to) { return typeof opts.via === "function" ? opts.via(from, to) : opts.via ?? "air"; }

  function send(from, to, type, body, o = {}) {
    const src = nodes.get(from), dst = nodes.get(to);
    if (!src) throw new Error(`network.send: unknown sender "${from}"`);
    if (!dst) throw new Error(`network.send: unknown receiver "${to}"`);
    if (from === to) throw new Error(`network.send: ${from} cannot send to itself`);
    if (!src.up) throw new Error(`network.send: ${from} is down`);
    const id = `${netId}.m${msgSeq++}`;
    const latency = latencyOf(from, to);
    let at = round1(now + latency);
    if (opts.fifo) { const l = K(from, to); at = Math.max(at, round1((lastOnLink.get(l) ?? -Infinity) + 0.1)); lastOnLink.set(l, at); }
    const msg = { id, type, from, to, body, sent: now, due: at, latency: round1(at - now) };
    const so = { text: o.text ?? textOf(msg), deliver: "hold", via: o.via ?? viaOf(from, to) };
    const k = o.key !== undefined ? o.key : keyOf(msg);
    if (k !== undefined) so.key = k;
    if (src.lane && dst.lane) so.lane = true;
    s.send(id, from, to, so);
    if (batchSent) batchSent.add(id);
    stepSends.push({ from, to, type });
    stats.sent++; bump("sent");
    inFlight.set(id, msg);
    const drop = dropRate > 0 && dropRng.chance(dropRate);
    const mid = round1(Math.max(now + 0.1, now + (at - now) / 2));
    if (blocked(from, to)) schedule(mid, "lost", { msg, reason: "partition" });
    else if (drop) schedule(mid, "lost", { msg, reason: "drop" });
    else schedule(at, "deliver", { msg });
    return id;
  }

  function ctxFor(node) {
    if (node.ctx) return node.ctx;
    const id = node.id;
    const ctx = {
      id,
      s,
      net: null,
      rng: node.rng,
      get now() { return now; },
      get state() { return node.state; },
      set state(v) { node.state = v; },
      get up() { return node.up; },
      nodes: clusterIds,
      clients: clientIds,
      peers: order.filter((x) => x !== id && nodes.get(x).broadcast),
      send(to, type, body, o) { return send(id, to, type, body, o); },
      broadcast(type, body, o) { return ctx.peers.map((to) => send(id, to, type, typeof body === "function" ? body(to) : body, o)); },
      reply(msg, type, body, o) { return send(id, msg.from, type, body, o); },
      /** (re)arm a named timer: an existing one with the same name is replaced */
      timer(name, ms, o = {}) {
        if (!(ms >= 0)) throw new Error(`timer ${name}: delay must be >= 0`);
        ctx.cancel(name);
        node.timers.set(name, schedule(round1(now + ms), "timer", { node: id, name, o }));
      },
      cancel(name) { const ev = node.timers.get(name); if (ev) { ev.cancelled = true; node.timers.delete(name); } },
      hasTimer(name) { return node.timers.has(name); },
      timerAt(name) { return node.timers.get(name)?.time ?? null; },
      set(patch) {
        if (patch.led !== undefined && node.up) node.led = patch.led;
        if (patch.state !== undefined) node.skipSync = true;
        stepOps++;
        s.set(id, patch);
      },
      /** { minor: true }: routine narration; a step that says only minor things plays at pace.minor */
      say(markup, o) { (narr ?? early).push({ say: markup, minor: !!o?.minor }); },
      /**
       * Narration that merges with the same key from neighbouring events in a batch:
       * fn(who, n) gets the joined subject list ("s3, s4 and s5") and its size; returning null says nothing.
       */
      chorus(key, fn, subject = id, o) { (narr ?? early).push({ chorus: key, fn, subject, minor: !!o?.minor }); },
      tag(text, tone) { stepOps++; s.tag(id, text, tone ? { tone } : {}); },
      mark(text, tone) { if (node.lane) { stepOps++; s.mark(id, tone ? { t: now, text, tone } : { t: now, text }); } },
      lit() { stepOps++; s.lit(id); },
      count(name, d = 1) { s.count(name, d); },
      gauge(name, v) { s.gauge(name, v); },
      phase(name, o) { s.phase(name, o); },
      isUp(other) { return nodes.get(other)?.up ?? false; },
      stop() { stopped = true; },
    };
    node.ctx = ctx;
    return ctx;
  }

  function syncStates() {
    if (opts.inspect === false) return;
    for (const id of order) {
      const n = nodes.get(id);
      if (n.skipSync) { n.skipSync = false; n.lastJson = null; continue; }
      const view = opts.inspect ? opts.inspect(n.state, id) : n.state;
      if (view === undefined) continue;
      const j = JSON.stringify(view);
      if (j !== n.lastJson) { n.lastJson = j; s.set(id, { state: JSON.parse(j) }); }
    }
  }

  // builder pacing when the builder offers it and nothing else was asked for
  const builderPaced = () => compress === undefined && typeof s.pace === "function";
  const paceMin = opts.pace?.min ?? MOTION.step * PACE.min, paceMax = opts.pace?.max ?? MOTION.step * PACE.max;
  const paceConfig = () => ({ ms: paceRef / (opts.pace?.at ?? MOTION.step), min: paceMin, max: paceMax });
  function durFor(gap) {
    const c = compress;
    if (c === false || builderPaced()) return undefined;
    if (typeof c === "function") return c(gap);
    const sec = pace(gap, { ref: paceRef, gamma: typeof c === "number" ? c : PACE.gamma }) * ((opts.pace?.at ?? MOTION.step) / MOTION.step);
    return Math.round(clamp(sec, paceMin, paceMax) * 1000) / 1000;
  }
  // sim time of the next event that can still happen (cancelled timers at the top are discarded)
  function nextTime() {
    while (agenda.size && agenda.peek().cancelled) agenda.pop();
    return agenda.size ? agenda.peek().time : now;
  }

  const sentence = (t) => (/[.!?…]$/.test(t) ? t : t + ".");
  const uniq = (xs) => [...new Set(xs)];
  const who = (ids) => fmt.and(ids.map(R));
  // generated narration for a group of message events of one kind, fanning out (one sender) or in (one receiver)
  function told(g) {
    const T = fmt.escape(g.type), froms = uniq(g.items.map((x) => x.from)), tos = uniq(g.items.map((x) => x.to));
    const out = froms.length === 1, n = (out ? tos : froms).length;
    const pair = out ? [R(froms[0]), who(tos)] : [who(froms), R(tos[0])];
    switch (g.gen) {
      case "recv": return out ? `${pair[1]} ${n > 1 ? "receive" : "receives"} ${T} from ${pair[0]}` : `${pair[1]} receives ${T} from ${pair[0]}`;
      case "drop": return `The network {tone:fail|drops} ${T} from ${pair[0]} to ${pair[1]}`;
      case "partition": return `${T} from ${pair[0]} to ${pair[1]} cannot cross the partition`;
      case "sent": {
        const per = g.items.length / tos.length;
        return out ? `${pair[0]} sends ${per > 1 || g.items.length > tos.length ? `${fmt.plural(g.items.length, `${g.type} message`)}` : T} to ${pair[1]}` : `${pair[0]} send ${T} to ${pair[1]}`;
      }
      default: return out && tos.length > 1 ? `${T} from ${pair[0]} to ${pair[1]} is lost: they are {tone:fail|down}` : `${T} from ${pair[0]} is lost: ${pair[1]} is {tone:fail|down}`;
    }
  }
  function compose(items) {
    const out = [], groups = new Map();
    for (const it of items) {
      if (it.say !== undefined) { out.push({ text: it.say }); continue; }
      if (it.gen !== undefined) {
        // one group per kind and type, split further if the burst is neither one-to-many nor many-to-one
        const base = `gen|${it.gen}|${it.type}`;
        let k = base, g = groups.get(k), i = 0;
        while (g && !(g.items.every((x) => x.from === it.from) || g.items.every((x) => x.to === it.to))) { k = `${base}|${++i}`; g = groups.get(k); }
        if (!g) { g = { gen: it.gen, type: it.type, items: [] }; groups.set(k, g); out.push(g); }
        g.items.push(it);
        continue;
      }
      let g = groups.get(it.chorus);
      if (!g) { g = { fn: it.fn, subjects: [] }; groups.set(it.chorus, g); out.push(g); }
      if (!g.subjects.includes(it.subject)) g.subjects.push(it.subject);
    }
    return out.map((x) => x.text ?? (x.gen ? told(x) : x.fn(who(x.subjects), x.subjects.length))).filter(Boolean).map(sentence).join(" ");
  }

  function frame() {
    const f = typeof opts.focus === "function" ? opts.focus(api) : opts.focus;
    if (f && f.length) s.focus(...f);
  }
  // captions that just repeat a recent one, or steps that say only routine things, need no reading time
  const recent = [];
  function commit(text, minor = false) {
    syncStates();
    frame();
    const o = { t: now };
    const repeat = recent.includes(text);
    recent.push(text);
    if (recent.length > 12) recent.shift();
    const d = (minor || repeat) && opts.pace?.minor ? opts.pace.minor : durFor(nextTime() - now);
    if (d !== undefined) o.dur = d;
    s.step(text, o);
    stats.steps++;
    stepSends = [];
    stepOps = 0;
  }

  function lose(msg, reason) {
    inFlight.delete(msg.id);
    const label = reason === "drop" ? "dropped" : reason === "partition" ? "partitioned" : `${msg.to} is down`;
    // one chip per step, and none for quiet losses: a burst of deaths would bury the housings under tags
    if (!quietLoss.has(reason) && !lossTagged) { s.tag(msg.id, label, { tone: "fail" }); lossTagged = true; }
    s.deliver(msg.id, { remove: true, lost: true }); // lost: the packet dies where it is (engines that support it)
    bump("lost");
    if (reason === "drop") stats.dropped++;
    else if (reason === "partition") stats.cut++;
    else stats.toDown++;
    return { gen: reason, type: msg.type, from: msg.from, to: msg.to };
  }

  // the narration item an event makes when its handlers say nothing, or null when it makes no step
  function process(ev) {
    switch (ev.kind) {
      case "deliver": {
        const msg = ev.msg, dst = nodes.get(msg.to);
        if (!dst.up) return lose(msg, "down");
        if (blocked(msg.from, msg.to)) return lose(msg, "partition");
        inFlight.delete(msg.id);
        s.deliver(msg.id);
        stats.delivered++; bump("delivered");
        const fn = findMsg(msg.to, msg.type);
        const view = { id: msg.id, type: msg.type, from: msg.from, to: msg.to, body: msg.body, sent: msg.sent, at: now, latency: msg.latency };
        if (fn) fn(view, ctxFor(dst));
        return { gen: "recv", type: msg.type, from: msg.from, to: msg.to };
      }
      case "lost": return lose(ev.msg, ev.reason);
      case "timer": {
        const node = nodes.get(ev.node);
        if (node.timers.get(ev.name) === ev) node.timers.delete(ev.name);
        if (!node.up) return null;
        const label = ev.o.label ?? ev.name;
        if (ev.o.mark !== false) {
          if (node.lane) s.mark(node.id, { t: now, text: label, tone: ev.o.tone ?? "busy" });
          else if (ev.o.tag) s.tag(node.id, label, { tone: ev.o.tone ?? "busy" });
        }
        const fn = findTimer(node.id, ev.name);
        if (fn) fn(ctxFor(node));
        return { say: `${R(node.id)}: the ${fmt.escape(label)} timer fires` };
      }
      case "crash": {
        const node = nodes.get(ev.node);
        if (!node.up) return null;
        node.up = false;
        for (const t of node.timers.values()) t.cancelled = true;
        node.timers.clear();
        s.set(node.id, { led: "fail", dim: true });
        if (node.lane) s.mark(node.id, { t: now, text: "crash", tone: "fail" });
        for (const h of hooks.crash) if (h.node === "*" || h.node === node.id) h.fn(ctxFor(node));
        return { say: `${R(node.id)} {tone:fail|crashes}` };
      }
      case "recover": {
        const node = nodes.get(ev.node);
        if (node.up) return null;
        node.up = true;
        toldDown.delete(node.id);
        s.set(node.id, { led: node.led, dim: false });
        if (node.lane) s.mark(node.id, { t: now, text: "recover", tone: "ok" });
        for (const h of hooks.recover) if (h.node === "*" || h.node === node.id) h.fn(ctxFor(node));
        return { say: `${R(node.id)} {tone:ok|recovers}` };
      }
      case "partition": {
        const side = new Map();
        ev.groups.forEach((g, i) => g.forEach((id) => side.set(id, i)));
        partition = { groups: ev.groups, side };
        // a dashed fail-toned zone around the smaller side, on builders that draw zones (DESIGN.md: partitions)
        if (typeof s.zone === "function" && opts.zones !== false) {
          if (zoneId && s.has(zoneId)) s.remove(zoneId);
          const small = ev.groups.reduce((a, g) => (g.length < a.length ? g : a), ev.groups[0]);
          zoneId = `${netId}.cut${++zoneSeq}`;
          s.zone(zoneId, { around: small.slice(), title: "cut off", tone: "fail", dashed: true });
        }
        const names = "ABCDEFGH";
        ev.groups.forEach((g, i) => g.forEach((id) => {
          s.tag(id, `side ${names[i] ?? i + 1}`, { tone: "warn" });
          if (nodes.get(id).lane) s.mark(id, { t: now, text: "split", tone: "warn" });
        }));
        const list = ev.groups.map((g) => fmt.and(g.map(R)));
        return { say: ev.groups.length === 2 ? `The network splits: ${list[0]} on one side, ${list[1]} on the other` : `The network splits into ${ev.groups.length} sides: ${list.join("; ")}` };
      }
      case "heal": {
        if (!partition) return null;
        const was = partition;
        partition = null;
        if (zoneId && s.has(zoneId)) s.remove(zoneId);
        zoneId = null;
        for (const g of was.groups) for (const id of g) if (nodes.get(id).lane) s.mark(id, { t: now, text: "heal", tone: "ok" });
        return { say: `The partition {tone:ok|heals}: every node can reach every other again` };
      }
      case "rate": dropRate = ev.rate; return null;
      case "at": {
        const before = narr.length;
        ev.fn(api);
        if (ev.quiet && narr.length === before) return null;
        return { say: `At ${fmt.ms(now)}` };
      }
      default: throw new Error(`network: unknown event ${ev.kind}`);
    }
  }

  function start(intro) {
    started = true;
    narr = early.splice(0);
    for (const id of order) {
      const node = nodes.get(id);
      for (const h of hooks.start) if (h.node === "*" || h.node === id) h.fn(ctxFor(node));
    }
    syncStates();
    const items = intro ? [{ say: intro }, ...narr] : narr;
    narr = null;
    if (!items.length) for (const x of stepSends) items.push({ gen: "sent", type: x.type, from: x.from, to: x.to });
    if (items.length || stepOps) {
      frame();
      const o = { t: now };
      const d = durFor(nextTime() - now);
      if (d !== undefined) o.dur = d;
      s.step(items.length ? compose(items) : "The nodes start.", o);
    }
    stepSends = []; stepOps = 0;
  }

  // events that may share a step: deliveries or losses of one type fanning out from one sender or into one
  // receiver, and timers of the same name firing on different nodes
  function sigsOf(ev) {
    if (ev.kind === "deliver") return [`d|${ev.msg.type}|f:${ev.msg.from}`, `d|${ev.msg.type}|t:${ev.msg.to}`];
    if (ev.kind === "lost") return [`l|${ev.reason}|${ev.msg.type}|f:${ev.msg.from}`, `l|${ev.reason}|${ev.msg.type}|t:${ev.msg.to}`];
    if (ev.kind === "timer") return [`t|${ev.name}`];
    return null;
  }

  // process one event, or a batch of compatible events within the batch window, as one step
  function runStep(first, until, onlyMessages = false) {
    stepT0 = first.time;
    lossTagged = false;
    stepNo++;
    const gens = [];
    narr = early.splice(0);
    const sendsBefore = stepSends.length, opsBefore = stepOps;
    batchSent = batchWindow > 0 ? new Set() : null;
    const take = (ev) => {
      now = ev.time;
      const mark = narr.length;
      const quiet = ev.kind === "lost" && quietLoss.has(ev.reason);
      const g = process(ev);
      stats.events++;
      if (quiet) { quietPending++; return; }
      if (g) gens.push(g);
      if (narr.length === mark && g) narr.push(g);
    };
    take(first);
    let sigs = batchWindow > 0 ? sigsOf(first) : null;
    while (sigs && agenda.size) {
      const nx = agenda.peek();
      if (nx.cancelled) { agenda.pop(); continue; }
      if (nx.time > first.time + batchWindow || nx.time > until) break;
      if (onlyMessages && nx.kind !== "deliver" && nx.kind !== "lost") break;
      const ns = sigsOf(nx);
      const both = ns ? sigs.filter((x) => ns.includes(x)) : [];
      if (!both.length || (nx.msg && batchSent.has(nx.msg.id))) break;
      agenda.pop();
      sigs = both;
      take(nx);
    }
    batchSent = null;
    // "… is lost: n3 is down" is said once per outage; afterwards only when nothing else happens in the step
    let items = narr;
    narr = null;
    if (items.length > 1) {
      const kept = items.filter((it) => !(it.gen === "down" && toldDown.has(it.to)));
      if (kept.length) items = kept;
    }
    for (const it of items) if (it.gen === "down") toldDown.add(it.to);
    // routine narration is spoken only when nothing important happens in the step
    const allMinor = items.every((it) => it.minor);
    if (!allMinor) items = items.filter((it) => !it.minor);
    if (!items.length) {
      // a quiet event that still sent or showed something gets a generated caption instead of leaking into a later step
      if (stepSends.length === sendsBefore && stepOps === opsBefore) return false;
      for (const x of stepSends.slice(sendsBefore)) items.push({ gen: "sent", type: x.type, from: x.from, to: x.to });
      if (!items.length) items.push({ say: `At ${fmt.ms(now)}` });
    }
    let text = compose(items);
    if (!text && gens.length) text = compose(gens); // every handler sentence declined: fall back to the generated ones
    if (!text) text = `At ${fmt.ms(now)}.`;
    commit(text, allMinor);
    quietPending = 0;
    return true;
  }

  const api = {
    id: netId,
    s,
    get now() { return now; },
    nodes: clusterIds,
    clients: clientIds,
    all: order,
    get stats() { return { ...stats, inFlight: inFlight.size }; },
    get lanes() { return lanesId; },
    /** sim time of the first event in the step being built (a batch can span several) */
    get stepStart() { return stepT0; },
    /** serial number of the step being built: narration can tell "in this very step" from "earlier" */
    get stepSerial() { return stepNo; },

    on(node, type, fn) { known(node, "on"); msgH.set(K(node, type), fn); return api; },
    onTimer(node, name, fn) { known(node, "onTimer"); timerH.set(K(node, name), fn); return api; },
    onStart(node, fn) { known(node, "onStart"); hooks.start.push({ node, fn }); return api; },
    onCrash(node, fn) { known(node, "onCrash"); hooks.crash.push({ node, fn }); return api; },
    onRecover(node, fn) { known(node, "onRecover"); hooks.recover.push({ node, fn }); return api; },

    /** an external event at sim time ms; fn(net). { quiet: true } makes no step unless it says something */
    at(ms, fn, o = {}) { schedule(ms, "at", { fn, quiet: !!o.quiet }); return api; },
    crash(node, at = now) { known(node, "crash"); schedule(at, "crash", { node }); return api; },
    recover(node, at = now) { known(node, "recover"); schedule(at, "recover", { node }); return api; },
    /** groups: [[a, b], [c, d, e]]; nodes in different groups cannot talk; unlisted nodes reach everyone */
    partition(groups, at = now, until) {
      const seen = new Set();
      for (const g of groups) for (const id of g) { known(id, "partition"); if (seen.has(id)) throw new Error(`network.partition: ${id} is in two groups`); seen.add(id); }
      schedule(at, "partition", { groups: groups.map((g) => g.slice()) });
      if (until !== undefined) schedule(until, "heal", {});
      return api;
    },
    heal(at = now) { schedule(at, "heal", {}); return api; },
    /** set the random drop probability, now or from sim time `at` */
    drop(rate, at) {
      if (!(rate >= 0 && rate <= 1)) throw new RangeError(`network.drop: rate must be in 0..1`);
      if (at === undefined || (!started && at <= now)) dropRate = rate; else schedule(at, "rate", { rate });
      return api;
    },

    send(from, to, type, body, o) { return send(from, to, type, body, o); },
    node(id) { const n = nodes.get(id); if (!n) throw new Error(`network.node: unknown node "${id}"`); return ctxFor(n); },
    state(id) { return nodes.get(id)?.state; },
    isUp(id) { return nodes.get(id)?.up ?? false; },
    blocked(a, b) { return blocked(a, b); },
    inFlight() { return [...inFlight.values()].map((m) => ({ ...m })); },
    timers(id) { return [...(nodes.get(id)?.timers ?? new Map()).entries()].map(([name, ev]) => ({ name, at: ev.time })); },
    say(markup, o) { (narr ?? early).push({ say: markup, minor: !!o?.minor }); },
    stop() { stopped = true; },
    pace(gap) { return durFor(gap); },

    /**
     * Run the simulation. until: ms (no new events after it), maxSteps, stopWhen(net) checked after every event,
     * intro: the caption of the opening step (start hooks run first and belong to it), compress (see header),
     * drain (default true): after stopping, keep delivering the messages still in flight (timers no longer fire)
     * so no packet is left hanging; a drained network is finished and cannot run again.
     * @returns {{ steps, time, reason, sent, delivered, dropped, cut, toDown, events }}
     */
    run(o = {}) {
      if (ended) throw new Error("network.run: this network was drained; it cannot run again");
      if (o.compress !== undefined) compress = o.compress;
      if (o.batch !== undefined) batchWindow = o.batch;
      const until = o.until ?? Infinity, maxSteps = o.maxSteps ?? 5000;
      const paced = builderPaced();
      if (paced) s.pace(paceConfig());
      if (!started) start(o.intro);
      else if (o.intro) s.step(o.intro, { t: now });
      stopped = false;
      let made = 0, reason = "idle";
      while (agenda.size) {
        const ev = agenda.peek();
        if (ev.time > until) { reason = "until"; break; }
        agenda.pop();
        if (ev.cancelled) continue;
        if (runStep(ev, until)) made++;
        if (stopped) { reason = "stopped"; break; }
        if (o.stopWhen && o.stopWhen(api)) { reason = "stopWhen"; break; }
        if (made >= maxSteps) { reason = "maxSteps"; break; }
      }
      if (o.drain !== false && inFlight.size) {
        ended = true;
        const budget = o.drainSteps ?? 200;
        let extra = 0;
        while (agenda.size && inFlight.size && extra < budget) {
          const ev = agenda.pop();
          if (ev.cancelled || (ev.kind !== "deliver" && ev.kind !== "lost")) continue; // timers no longer fire
          if (runStep(ev, Infinity, true)) { made++; extra++; }
        }
        if (inFlight.size) {
          for (const m of inFlight.values()) s.deliver(m.id, { remove: true });
          commit(`The run ends with ${fmt.plural(inFlight.size, "message")} still in flight.`);
          made++;
          quietPending = 0;
          inFlight.clear();
        }
      }
      if (quietPending && (ended || !agenda.size)) {
        commit(`${fmt.plural(quietPending, "message")} ${quietPending > 1 ? "die" : "dies"} on the way.`);
        made++;
        quietPending = 0;
      }
      if (paced) s.pace(null); // later steps of the figure are the author's to pace
      return { steps: made, time: now, reason, ...stats };
    },
  };
  for (const n of nodes.values()) ctxFor(n).net = api;
  return api;
}

export default network;
