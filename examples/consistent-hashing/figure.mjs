// Consistent hashing (Karger et al., STOC 1997), the way Dynamo partitions keys (DeCandia et al., SOSP 2007),
// run for real. Every server and every key is hashed with MurmurHash3 (x86, 32-bit, seed 0) onto the ring of all
// 2^32 hash values. A key is stored on the first server token at or after its hash, walking clockwise and
// wrapping past 2^32 - 1. Nothing on screen is drawn by hand: positions, owners, arcs, loads and every count in
// the captions come from those hashes.
//
// The board: an inlaid ring groove (a 72-sided polygon through invisible anchors, so it reads as a circle), the
// server tokens as small pegs and the keys as records sitting on it at their hash angle, each key coloured by the
// server that owns it. Inside the ring each server is a housing joined to its token by a spoke; its well holds
// a badge with its key count and its header shows its share of the ring. Tiles are relaxed apart along the ring
// so they never overlap; the relaxation keeps their clockwise order exact and moves none of them more than a few
// degrees (tags and the inspector show the exact hash).
//
// Scenarios: add a server (the problem first: hash % N beside the ring reshuffles almost everything; then on the
// ring only one arc moves); remove one (its arc falls to its clockwise successor, a hot spot); virtual nodes
// (1 -> 8 tokens per server, the max/mean share tightens, and a departing server's keys scatter instead of piling
// onto one).
//
// Lesson plan (references/teaching.md)
//   Reader      knows dictionaries and the remainder operator; has never met a hash ring or a token.
//   Level       core.
//   Hook        several servers share the keys; add one more: how many keys have to move?
//   Picture     seats around a round table: each server sits at the seat its name hashes to, each key sits with
//               the next server clockwise, a newcomer pulls up a chair inside one stretch and takes only the guests
//               just before it. (The remainder way is "counting off into teams".)
//   Problem     "Add a server" runs hash % N first, for real: N goes 4 -> 5 and most keys move.
//   Ladder      The simple way · One more server · The ring · Keys · Add a server · Result
//   Misconception "one more server moves only its fair share, whatever the scheme" (predicted for hash % N).
//   Stories     Add a server · A server leaves · Many seats per server
// Each question sits on its chapter's first step, because the HUD withholds a chapter's about until its
// predictions are revealed.
//
// The words live in lesson.mjs, keyed by the ids below (CONTRACTS.md section 10); each step keeps a plain caption as
// the fallback. Servers print as key chips in their colour, keys as entity chips, shares and ratios as text ("37%",
// "1.4×"). Every step passes K (keys) and N (servers at the start), plus:
//   chapters       simple · more · ring · keys · add · leave · vnodes · result
//   simple.intro   rule, boxIds                              (the remainder board's housings)
//   simple.place   per, servers, example, exampleId, eq, boxIds
//   more.move      extra, extraId, n1, moved, stayed, rule, fair
//   ring.intro     again (the add story, after the remainder way), ringIds
//   ring.seats     seats, total, order, biggest, biggestId, share, tokenIds
//   keys.hash      key, keyId, hash, angle
//   keys.walk      key, keyId, hash, server, serverId, tokenId, seat, hops
//   keys.arc       server, serverId, tokenId, share, count, arcs, keys, keyIds   (add only, once per server)
//   keys.rest      rest, keyIds                              (remove and vnodes)
//   keys.loads     loads, servers, hot, hotId, share, hotKeys
//   add.join       extra, extraId, tokenId, hash, seats, pred, predId, predTokenId, predKeys
//   add.move       moved, stayed, extra, extraId, from, fromIds, keys, keyIds
//   result.moved   moved, n1, fair, modm, keyIds
//   result.uneven  seats, top, topId, share, ratio
//   vnodes.more    seats, was, changed, keyIds, before, after, total            (once per doubling)
//   leave.drain    victim, victimId, count, share, seats, tokenIds, keys, keyIds
//   leave.move     victim, victimId, count, dests, destIds, keyIds
//   result.leave   heavy, heavyId, share, left, modm, dests, rule
//   result.vnodes  spread, alone, heavy, heavyId, ratio, big64, big256, left, dests
//   asks           more.moved · add.which · leave.where

import * as fmt from "../../sim/fmt.mjs";
import { rng } from "../../sim/rng.mjs";
import { SIZE } from "../../engine/tokens.mjs";

export const meta = {
  title: "Consistent hashing",
  subtitle: "Adding a server moves one arc of keys, not all of them",
  kicker: "Distributed systems",
  fig: 4,
  level: "core",
  cite: "[karger1997]",
  theme: "light",
  hook: "Several servers share the keys between them. If you add one more server, how many keys have to move?",
  terms: {
    hash: "a scrambling recipe that turns a name into a big number, the same number every time",
    ring: "every possible number from 0 to about 4.3 billion, bent into a circle that wraps back to 0",
    arc: "the stretch of the circle from one server's seat back to the seat before it",
    "virtual node": "one of several seats a single server takes on the circle",
  },
  recap: [
    "The remainder way moved more keys than the ring when one more server joined.",
    "On the ring, each key sits with the next server clockwise.",
    "A new server took only the keys just before its new seats.",
    "The seats shared the ring unevenly, so the busiest server owned more than its fair share.",
  ],
  takeaway: "On a ring, a new server takes only the keys just before its seats. The remainder way moves far more, on average N keys in every N + 1.",
};

export const params = {
  servers: { label: "Servers", type: "int", min: 4, max: 6, value: 4 },   // from 4 the remainder way always moves more
  keys: { label: "Keys", type: "int", min: 6, max: 24, value: 16 },
  vnodes: { label: "Seats per server", type: "int", min: 1, max: 8, value: 1 },
  seed: { label: "Seed (which keys)", type: "int", value: 6 },
};

export const scenarios = [
  { id: "add", label: "Add a server", whatIf: "a server joins",
    description: "First the simple remainder way, then the ring: a new server takes only the keys just before its seat." },
  { id: "remove", label: "A server leaves", whatIf: "a server leaves",
    description: "A server leaves the ring: only its own keys move, each to the next seat clockwise.",
    takeaway: "When a server leaves, only its keys move, each to the next seat clockwise. With one seat each, they all land on one neighbour.",
    recap: [
      "Each key sits with the next server clockwise.",
      "The leaving server's keys moved on to the next seat clockwise.",
      "No other key moved, and one server took them all, so its share grew.",
    ] },
  { id: "vnodes", label: "Many seats per server", params: { vnodes: 8 }, whatIf: "each server takes many seats",
    description: "Each server takes many seats around the ring, so when one leaves, its keys spread over several servers.",
    takeaway: "With many seats per server, the shares tend to even out, and a leaving server's keys can spread over several neighbours.",
    recap: [
      "A server's share is the sum of its arcs, and more seats make more, smaller arcs.",
      "When a server left, each of its keys walked on to the next seat clockwise.",
      "Only the leaving server's keys moved on the leave.",
    ] },
];

export const counters = {
  moved: { label: "keys moved on the ring", short: "moved, ring", better: "lower", primary: true,
    hint: "Keys that had to change server on the ring. Each one is data copied over the network." },
  modmoved: { label: "keys moved the remainder way", short: "moved, remainder", better: "lower", primary: ["add"],
    hint: "Keys that would change server if each key used hash(key) % N, the remainder way." },
  load: { label: "busiest server's share", short: "busiest server", format: "x", primary: ["vnodes"],
    hint: "The busiest server's share of the ring, divided by the average share. 1× is perfectly even." },
  servers: { label: "servers", format: "int",
    hint: "Servers on the ring right now." },
};

export const code = {
  lang: "python",
  source: [
    "from bisect import bisect_left",
    "",
    "def position(name):",
    "    return murmur3_32(name)            # 0 .. 2**32 - 1",
    "",
    "def build_ring(servers, vnodes):",
    "    ring = []",
    "    for s in servers:",
    "        for i in range(vnodes):        # virtual nodes",
    "            ring.append((position(s if i == 0 else f\"{s}#{i}\"), s))",
    "    return sorted(ring)",
    "",
    "def owner(ring, key):",
    "    h = position(key)",
    "    i = bisect_left(ring, (h, \"\"))     # first token clockwise",
    "    return ring[i % len(ring)][1]      # past 2**32 - 1: wrap to 0",
    "",
    "def owner_mod_n(servers, key):",
    "    return servers[position(key) % len(servers)]",
  ].join("\n"),
};

// ---- the hash ------------------------------------------------------------------------------------------------

/** MurmurHash3 x86_32 of an ASCII string (known answers: "" -> 0, "hello" -> 0x248bfa47). */
export function murmur3(str, seed = 0) {
  let h = seed >>> 0;
  const len = str.length, c1 = 0xcc9e2d51, c2 = 0x1b873593;
  let i = 0;
  for (; i + 4 <= len; i += 4) {
    let k = (str.charCodeAt(i) & 0xff) | ((str.charCodeAt(i + 1) & 0xff) << 8) | ((str.charCodeAt(i + 2) & 0xff) << 16) | ((str.charCodeAt(i + 3) & 0xff) << 24);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  let k = 0;
  switch (len & 3) {
    case 3: k ^= (str.charCodeAt(i + 2) & 0xff) << 16; // falls through
    case 2: k ^= (str.charCodeAt(i + 1) & 0xff) << 8;  // falls through
    case 1: k ^= str.charCodeAt(i) & 0xff; k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2); h ^= k;
  }
  h ^= len; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}

const SPACE = 2 ** 32;
const TAU = Math.PI * 2;
const hex = (h) => fmt.hex(h, 8);                        // 0x9b1e_44c2
const deg = (h) => `${Math.round((h / SPACE) * 360) % 360}°`;
const tokenName = (server, i) => (i === 0 ? server : `${server}#${i}`);

// ---- the model: plain functions the invariants share with build() --------------------------------------------

/** Tokens sorted clockwise: [{ name, server, i, hash }]. */
export function buildRing(servers, vnodes) {
  const ring = [];
  for (const s of servers) for (let i = 0; i < vnodes; i++) { const name = tokenName(s, i); ring.push({ name, server: s, i, hash: murmur3(name) }); }
  return ring.sort((a, b) => a.hash - b.hash || (a.name < b.name ? -1 : 1));
}

/** The first token at or after h, wrapping past 2^32 - 1 (bisect_left on (hash, name)). */
export function successor(ring, h) {
  let lo = 0, hi = ring.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ring[m].hash < h) lo = m + 1; else hi = m; }
  return ring.length ? ring[lo % ring.length] : null;
}

/** Fraction of the ring each server owns: a token owns (previous token, itself]. */
export function shares(ring, servers) {
  const out = Object.fromEntries(servers.map((s) => [s, 0]));
  ring.forEach((t, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length];
    out[t.server] += ring.length === 1 ? 1 : (((t.hash - prev.hash) + SPACE) % SPACE) / SPACE;
  });
  return out;
}

const maxOverMean = (sh) => {
  const v = Object.values(sh);
  return v.length ? Math.max(...v) / (v.reduce((a, b) => a + b, 0) / v.length) : 0;
};
const round2 = (x) => Math.round(x * 100) / 100;
// the meter shows the gauged value at one decimal; captions print that same number
const ratioText = (x) => fmt.ratio(round2(x));

// real-looking keys, at most 9 characters so they fit a record tile
const POOL = [
  "user:1042", "cart:88", "cat.jpg", "sess:7f3a", "order:551", "user:77", "feed:home", "dog.png", "app.css", "sku:1182",
  "cart:301", "user:2001", "post:4410", "inv:0193", "geo:nyc", "tok:9c2e", "user:318", "cart:12", "logo.svg", "post:87",
  "sess:a91c", "user:5150", "acct:204", "page:faq", "img:4096", "sku:7731", "cart:950", "post:12", "user:9", "feed:top",
];
const NAMES = ["db01", "db02", "db03", "db04", "db05", "db06", "db07"];
const IPS = NAMES.map((_, i) => `192.0.2.${11 + i}`);

// ---- invariants: checked by verify on every step of every scenario and knob extreme ----------------------------

const recsOf = (snap, kind) => [...snap.entities.values()].filter((r) => r.state && r.state.kind === kind);
const activeRing = (snap) => recsOf(snap, "token").filter((t) => t.state.active)
  .map((t) => ({ name: t.state.token, server: t.state.server, hash: t.state.hash }))
  .sort((a, b) => a.hash - b.hash || (a.name < b.name ? -1 : 1));

export const invariants = {
  "every key is stored on exactly one live server": (snap) => {
    const servers = new Map(recsOf(snap, "server").map((r) => [r.state.server, r]));
    const held = new Map([...servers.keys()].map((sv) => [sv, 0]));
    const ids = new Set();
    for (const k of recsOf(snap, "key")) {
      if (ids.has(k.state.key)) return `${k.state.key} appears twice on the ring`;
      ids.add(k.state.key);
      if (!k.state.stored) { if (snap.final) return `${k.state.key} is never stored`; continue; }
      if (!servers.has(k.state.owner)) return `${k.state.key} is owned by ${k.state.owner}, which is not on the board`;
      held.set(k.state.owner, held.get(k.state.owner) + 1);
    }
    for (const [sv, r] of servers) if (r.state.keys !== held.get(sv)) return `${sv} says it holds ${r.state.keys} keys, the ring gives it ${held.get(sv)}`;
    return true;
  },
  "a key's server is the first token clockwise from its hash": (snap) => {
    const ring = activeRing(snap);
    for (const k of recsOf(snap, "key")) {
      if (!k.state.stored) continue;
      const t = successor(ring, k.state.hash);
      if (!t || t.server !== k.state.owner) return `${k.state.key} (${hex(k.state.hash)}) is on ${k.state.owner}, but the first token clockwise is ${t ? t.name : "none"}`;
    }
    return true;
  },
  "keys moved on add = keys in the new server's arcs": (snap, { scenario }) => {
    if (scenario !== "add") return true;
    const joined = recsOf(snap, "server").find((r) => r.state.joined);
    const moved = snap.counters.moved ?? 0;
    const inArcs = joined ? recsOf(snap, "key").filter((k) => k.state.owner === joined.state.server).length : 0;
    if (moved !== inArcs) return `moved counter ${moved}, but ${inArcs} keys sit in the new server's arcs`;
    for (const k of recsOf(snap, "key")) if (k.state.moves > 0 && k.state.owner !== joined?.state.server) return `${k.state.key} moved, but not to the new server`;
    return true;
  },
  "on removal only the departed server's keys move": (snap, { scenario }) => {
    if (scenario !== "remove") return true;
    const keys = recsOf(snap, "key");
    const moved = keys.filter((k) => k.state.moves > 0);
    if ((snap.counters.moved ?? 0) !== moved.length) return `moved counter ${snap.counters.moved}, ${moved.length} keys moved`;
    const froms = new Set(moved.map((k) => k.state.from));
    return froms.size <= 1 || `keys moved off ${[...froms].join(", ")}`;
  },
  "mod N: every key sits on server hash(key) % N": (snap) => {
    for (const k of recsOf(snap, "modkey")) {
      if (k.state.bucket !== k.state.hash % k.state.n) return `${k.state.key}: bucket ${k.state.bucket}, but hash % ${k.state.n} = ${k.state.hash % k.state.n}`;
      const box = snap.entities.get(k.parent);
      if (!box || box.state?.server !== k.state.server || box.state.index !== k.state.bucket) return `${k.state.key} is in ${k.parent}, not server ${k.state.bucket}`;
    }
    return true;
  },
  "the load meter is the max / mean share of the ring": (snap) => {
    const ring = activeRing(snap);
    if (!ring.length || snap.counters.load === undefined) return true;
    const owners = [...new Set(ring.map((t) => t.server))];
    const want = round2(maxOverMean(shares(ring, owners)));
    return Math.abs(want - snap.counters.load) < 0.006 || `meter says ${snap.counters.load}, the ring gives ${want}`;
  },
};

// ---- layout on the ring ----------------------------------------------------------------------------------------
// Positions are computed once, for every tile that ever sits on the ring during the run, so nothing has to
// move to make room later. Each tile goes at its hash angle; where tiles would touch, an isotonic regression
// (pool-adjacent-violators) shifts them apart by the least squared angle that keeps their clockwise order.

const polar = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];   // 0 at the top, clockwise on screen

// the angle two neighbouring boxes need at radius R so their axis-aligned extents clear by `gap`
function need(a, b, mid, R, gap) {
  const cx = Math.abs(Math.cos(mid)), sy = Math.abs(Math.sin(mid));
  const byX = cx > 1e-3 ? ((a.w + b.w) / 2 + gap) / (R * cx) : Infinity;
  const byY = sy > 1e-3 ? ((a.d + b.d) / 2 + gap) / (R * sy) : Infinity;
  return 1.04 * Math.min(byX, byY);
}

function pav(y) {
  const blocks = [];   // [sum, count]
  for (const v of y) {
    blocks.push([v, 1]);
    while (blocks.length > 1) {
      const [s1, n1] = blocks[blocks.length - 2], [s2, n2] = blocks[blocks.length - 1];
      if (s1 / n1 <= s2 / n2) break;
      blocks.splice(blocks.length - 2, 2, [s1 + s2, n1 + n2]);
    }
  }
  const out = [];
  for (const [s, n] of blocks) for (let k = 0; k < n; k++) out.push(s / n);
  return out;
}

/** items: [{ theta, w, d, gap }] sorted by theta. Returns relaxed angles, or null if they cannot fit at R. */
function relax(items, R) {
  const n = items.length;
  if (n <= 1) return items.map((x) => x.theta);
  let cut = 0, big = -1;
  for (let i = 0; i < n; i++) {
    const g = (items[(i + 1) % n].theta - items[i].theta + TAU) % TAU;
    if (g > big) { big = g; cut = (i + 1) % n; }
  }
  const order = Array.from({ length: n }, (_, k) => (cut + k) % n);
  const t = order.map((idx) => items[idx].theta + (idx < cut ? TAU : 0));
  let phi = t.slice();
  for (let iter = 0; iter < 4; iter++) {
    const c = [0];
    for (let k = 0; k < n - 1; k++) {
      const a = items[order[k]], b = items[order[k + 1]];
      c.push(c[k] + need(a, b, (phi[k] + phi[k + 1]) / 2, R, Math.max(a.gap, b.gap)));
    }
    const psi = pav(t.map((v, k) => v - c[k]));
    phi = psi.map((v, k) => v + c[k]);
  }
  const first = items[order[0]], last = items[order[n - 1]];
  if (phi[0] + TAU - phi[n - 1] < need(last, first, phi[n - 1] + (phi[0] + TAU - phi[n - 1]) / 2, R, Math.max(first.gap, last.gap))) return null;
  const out = new Array(n);
  order.forEach((idx, k) => { out[idx] = ((phi[k] % TAU) + TAU) % TAU; });
  return out;
}

const angDiff = (a, b) => { const d = Math.abs(a - b) % TAU; return Math.min(d, TAU - d); };

const HOUSING = { w: 134, d: 80 };       // header: title + "100% of ring" + LED; well: one badge tile
const FILLERS = 72;                      // the ring groove: a 72-gon (sagitta < 0.3 u at R = 320)

function layoutRing(stations, servers) {
  const st = stations.slice().sort((a, b) => a.theta - b.theta || (a.id < b.id ? -1 : 1));
  for (let R = 290, tries = 0; tries < 40; tries++, R = Math.round(R * 1.05)) {
    const phi = relax(st, R);
    if (!phi) continue;
    if (st.some((x, i) => angDiff(x.theta, phi[i]) > 0.15)) continue;   // never more than ~9 degrees off its hash
    const at = new Map(st.map((x, i) => [x.id, phi[i]]));
    const rh = R - 128;
    const hs = servers.map((sv) => ({ id: sv, theta: at.get(`t.${sv}`), w: HOUSING.w, d: HOUSING.d, gap: 26 }))
      .sort((a, b) => a.theta - b.theta || (a.id < b.id ? -1 : 1));
    const hphi = relax(hs, rh);
    if (!hphi) continue;
    const house = new Map(hs.map((x, i) => [x.id, polar(rh, hphi[i])]));
    return { R, at, house };
  }
  throw new Error("consistent-hashing: the ring cannot fit its tiles");
}

// ---- the run ---------------------------------------------------------------------------------------------------

function plan(p, scenario) {
  const N = Math.max(4, Math.min(6, p.servers | 0));
  const K = Math.max(1, Math.min(POOL.length, p.keys | 0));
  const V = Math.max(1, Math.min(8, p.vnodes | 0));
  const sc = ["add", "remove", "vnodes"].includes(scenario) ? scenario : "add";
  const keys = rng(p.seed ?? 6).fork("keys").sample(POOL, K).map((name) => ({ name, hash: murmur3(name) }));
  const servers = NAMES.slice(0, N);
  const extra = sc === "add" ? NAMES[N] : null;
  const levels = [];
  if (sc === "vnodes") { for (let v = 1; v < V; v *= 2) levels.push(v); levels.push(V); } else levels.push(V);
  const Vmax = levels[levels.length - 1];
  const everyone = extra ? [...servers, extra] : servers;
  const stations = keys.map((k) => ({ id: `k.${k.name}`, theta: (k.hash / SPACE) * TAU, w: SIZE.record.w, d: SIZE.record.d, gap: 6 }));
  // a seat keeps more room than a record needs: under the camera's tilt a record standing just in front of a seat hides it
  for (const t of buildRing(everyone, Vmax)) stations.push({ id: `t.${t.name}`, theta: (t.hash / SPACE) * TAU, w: SIZE.bit.w, d: SIZE.bit.d, gap: 14 });
  const geo = layoutRing(stations, everyone);
  return { N, K, V, sc, keys, servers, extra, levels, Vmax, everyone, geo };
}

const plainWords = (markup) => fmt.plain(markup).split(/\s+/).filter(Boolean).length;
// motion plays at its natural pace; a long caption gets enough time to be read at 1x
const readable = (markup, min = 1.3) => Math.min(4.2, Math.max(min, 0.24 * plainWords(markup)));

export function build(s, p, scenario, env) {
  const P = plan(p, scenario);
  const portrait = !!env?.portrait;   // a layout choice only: the run is the same
  const { R, at, house } = P.geo;
  const { sc, keys, servers, extra } = P;
  const K = keys.length;

  // live model
  const active = new Map();            // token name -> token, the tokens lookups use
  const owner = new Map();             // key name -> server
  const moves = new Map(keys.map((k) => [k.name, 0]));
  const from = new Map();
  const live = new Set(servers);       // servers with a housing on the board
  const ringNow = () => [...active.values()].sort((a, b) => a.hash - b.hash || (a.name < b.name ? -1 : 1));
  const shareNow = () => shares(ringNow(), [...live].filter((sv) => ringNow().some((t) => t.server === sv)));
  const count = (sv) => keys.filter((k) => owner.get(k.name) === sv).length;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const say = (id, markup, vars = {}, o = {}) => s.step(markup, { id, vars: { K, N: servers.length, ...vars }, dur: o.dur ?? readable(markup, o.min) });
  const K_ = (sv) => fmt.key(sv);
  const keyRef = (name) => fmt.ref(`k.${name}`, name);
  // lesson var kinds (CONTRACTS.md 10.1): a server prints as a key chip in its colour, a key as an entity chip
  const SV = (sv) => ({ key: sv });
  const KEY = (name) => ({ ref: `k.${name}`, text: name });
  const keyIds = (list) => list.map((k) => `k.${k.name}`);

  const keyState = (k, extraState = {}) => ({ kind: "key", key: k.name, hash: k.hash, hex: hex(k.hash), owner: owner.get(k.name) ?? null, stored: owner.has(k.name), moves: moves.get(k.name), from: from.get(k.name) ?? null, ...extraState });
  const housingState = (sv, o = {}) => {
    const sh = shareNow()[sv] ?? 0;
    return { kind: "server", server: sv, ip: IPS[NAMES.indexOf(sv)], keys: count(sv), share: round2(sh), tokens: [...active.values()].filter((t) => t.server === sv).length, active: o.active ?? true, joined: sv === extra, leaving: !!o.leaving };
  };
  const refreshServer = (sv, o = {}) => {
    const sh = shareNow()[sv] ?? 0;
    s.set(sv, { sub: `${pct(sh)} of ring`, state: housingState(sv, o) });
    s.set(`n.${sv}`, { text: String(count(sv)), sub: count(sv) === 1 ? "key" : "keys" });
  };
  const gaugeLoad = () => { const sh = shareNow(); s.gauge("load", round2(maxOverMean(sh))); s.gauge("servers", Object.keys(sh).length); return sh; };

  // ---- the opening picture: the ring and the servers ----
  for (let i = 0; i < FILLERS; i++) s.text(`f${i}`, { text: "", size: 1, at: polar(R, (i / FILLERS) * TAU) });
  for (let i = 0; i < FILLERS; i++) s.trace(`ring${i}`, `f${i}`, `f${(i + 1) % FILLERS}`, { route: "straight" });
  // Hash marks at the top, the bottom and the four diagonals, where the corners of the ring's zone have room, so
  // the zone is only as wide as the ring itself and the remainder board fits beside it. Two blank anchors at the
  // sides hold the zone's left and right edges 14 u outside the keys there (records reach R + 32).
  const marks = [0, 1, 3, 4, 5, 7].map((e) => ({ e, text: fmt.hex(e * 2 ** 29, 8) }));
  const markAt = (e) => (e % 4 === 0 ? polar(R + 38, (e / 8) * TAU) : polar(R + 70, (e / 8) * TAU));
  marks.forEach((m) => s.text(`q${m.e}`, { text: m.text, size: 8.5, at: markAt(m.e) }));
  s.text("qr", { text: "", size: 1, at: [R + 18, 0] });
  s.text("ql", { text: "", size: 1, at: [-(R + 18), 0] });
  const RING = ["q0", "qr", "q4", "ql"];   // a zone cannot be a focus target; its outermost marks can
  s.zone("ringzone", { around: [...RING, ...marks.map((m) => `q${m.e}`)], title: "hash ring · murmur3, 32-bit" });

  const addHousing = (sv, o = {}) => {
    s.housing(sv, { at: house.get(sv), title: sv, sub: o.sub ?? null, led: o.led ?? "idle", key: sv, tray: { cols: 1, of: "tile" }, state: housingState(sv, { active: o.active ?? false }) });
    s.tile(`n.${sv}`, { in: sv, text: "0", sub: "keys", key: sv, state: { badge: sv } });
  };
  for (const sv of servers) addHousing(sv);

  // the mod N board, beside the ring (under it in portrait): one housing per server; server i holds hash % N = i
  const modAt = new Map();
  const modOwner = new Map();
  let modIds = [];
  let addMod = null;
  if (sc === "add") {
    const all = [...servers, extra];
    const fullest = (n) => Math.max(...Array.from({ length: n }, (_, b) => keys.filter((k) => k.hash % n === b).length));
    // Landscape: one column of housings just right of the ring, with 3-wide trays so the column stands about as
    // tall as the ring (two columns when it would be far taller), so ring and board fit beside the explain panel.
    // Portrait: a 3-column grid of housings, 2-wide trays, under the ring.
    const trayCols = portrait ? 2 : 3;
    const rows = Math.max(1, Math.ceil(Math.max(fullest(servers.length), fullest(all.length)) / trayCols));
    const mw = Math.max(120, trayCols * SIZE.record.w + (trayCols - 1) * SIZE.record.gap + 2 * SIZE.housing.pad + 2 * SIZE.well.inset);
    const md = Math.max(80, SIZE.housing.header + rows * SIZE.record.d + (rows - 1) * SIZE.record.gap + 2 * SIZE.housing.pad + SIZE.well.inset);
    const GAP = 14, ZONES = 12;                       // between housings; between the two zones' borders
    const ringRight = R + 18 + SIZE.zone.pad;         // the ring zone's right border (the blank side anchor)
    const ringBottom = R + 38 + 5 + SIZE.zone.pad;    // its bottom border (the 0x8000_0000 mark)
    const colH = (c) => { const r = Math.ceil(all.length / c); return r * md + (r - 1) * GAP; };
    const cols = portrait ? Math.min(3, all.length) : colH(1) <= 1.25 * 2 * ringBottom ? 1 : 2;
    const rowsN = Math.ceil(all.length / cols);
    const pitchX = mw + GAP, pitchY = md + GAP;
    const ox = portrait ? -((cols - 1) * pitchX) / 2 : ringRight + ZONES + SIZE.zone.pad + mw / 2;
    const oy = portrait ? ringBottom + ZONES + SIZE.zone.pad + 14 + md / 2 : -((rowsN - 1) * pitchY) / 2;
    all.forEach((sv, i) => { modAt.set(sv, [ox + (i % cols) * pitchX, oy + Math.floor(i / cols) * pitchY]); });
    addMod = (sv, n) => {
      const b = all.indexOf(sv);
      s.housing(`m.${sv}`, { at: modAt.get(sv), w: mw, d: md, title: sv, sub: `h % ${n} = ${b}`, led: "ok", key: sv, tray: { cols: trayCols, rows, of: "record" }, state: { kind: "bucket", server: sv, index: b, n } });
    };
    servers.forEach((sv) => addMod(sv, servers.length));
    modIds = servers.map((sv) => `m.${sv}`);
    s.zone("modzone", { around: modIds, title: "the remainder way: hash(key) % N" });
  }

  s.gauge("moved", 0);
  s.gauge("servers", servers.length);
  const n0 = servers.length;

  // ---- the problem first ("Add a server"): the same keys placed by hash(key) % N, then N grows by one ----
  if (sc === "add") {
    s.phase("The simple way", { id: "simple", about: `Like counting off into ${n0} teams. Each key's name becomes a number with a {term:hash}; divide it by ${n0}, and the remainder picks the server.` });
    s.focus(...modIds);
    s.line(18, 19);
    say("simple.intro", `${n0} servers share ${K} keys. The simple way sends each key to server \`hash(key) % ${n0}\`.`,
      { rule: { code: `hash(key) % ${n0}` }, boxIds: modIds }, { min: 3 });
    for (const k of keys) {
      const b = k.hash % n0, dst = servers[b];
      modOwner.set(k.name, dst);
      s.spawn(`mk.${k.name}`, { from: `m.${dst}`, in: `m.${dst}`, of: "record", text: k.name, key: dst, state: { kind: "modkey", key: k.name, hash: k.hash, bucket: b, n: n0, server: dst } });
    }
    const k0 = keys[0];
    s.tag(`mk.${k0.name}`, `${hex(k0.hash)} % ${n0} = ${k0.hash % n0}`);
    s.focus(...modIds);
    const per = servers.map((sv) => keys.filter((k) => modOwner.get(k.name) === sv).length);
    say("simple.place", `Each key goes to the server its remainder names: ${fmt.and(per.map(String))} keys.`,
      { per, servers: servers.map(SV), example: k0.name, exampleId: `mk.${k0.name}`, eq: { code: `${hex(k0.hash)} % ${n0} = ${k0.hash % n0}` }, boxIds: modIds }, { min: 2.6 });

    const all = [...servers, extra];
    const n1 = all.length;
    s.phase("One more server", { id: "more", about: `Now there are ${n1} servers, so every key's number is divided by ${n1} instead of ${n0}. The remainders change, and each key follows its remainder.` });
    // the misconception: "one more server moves only its fair share, whatever the scheme"
    // the right option is the one nearest this run's real count: luck with few keys can make it "about half"
    const movedNow = keys.filter((k) => all[k.hash % n1] !== servers[k.hash % n0]).length;
    const guesses = [K / n1, K / 2, (K * n0) / n1].map((x) => Math.abs(x - movedNow));
    s.ask(`Server ${extra} joins, so each key now goes to server hash % ${n1}. How many of the ${K} keys change server?`,
      [`About ${Math.round(K / n1)}: the new server's fair share`, "About half of them", "Nearly all of them"], guesses.lastIndexOf(Math.min(...guesses)),
      { id: "more.moved", why: `A key keeps its server only when its remainders by ${n0} and ${n1} agree, which is 1 key in ${n1} on average. Here ${movedNow} of ${K} change server.` });
    addMod(extra, n1);
    s.set("modzone", { around: [...modIds, `m.${extra}`] });
    for (const sv of all) s.set(`m.${sv}`, { sub: `h % ${n1} = ${all.indexOf(sv)}`, state: { kind: "bucket", server: sv, index: all.indexOf(sv), n: n1 } });
    s.beat();
    let moved = 0;
    for (const k of keys) {
      const b = k.hash % n1, dst = all[b];
      if (modOwner.get(k.name) !== dst) {
        moved++;
        modOwner.set(k.name, dst);
        s.move(`mk.${k.name}`, `m.${dst}`, { via: "air" });
        s.set(`mk.${k.name}`, { key: dst, state: { kind: "modkey", key: k.name, hash: k.hash, bucket: b, n: n1, server: dst } });
      }
    }
    s.count("modmoved", moved);
    s.focus(...modIds, `m.${extra}`);
    s.line(18, 19);
    say("more.move", `${K_(extra)} joins, so every key now uses \`hash % ${n1}\`: ${moved} of ${K} keys change server.`,
      { extra: SV(extra), extraId: `m.${extra}`, n1, moved, stayed: K - moved, rule: { code: `hash % ${n1}` }, fair: Math.round(K / n1) }, { min: 3.6 });
  }

  s.phase("The ring", { id: "ring", about: (P.levels[0] === 1
    ? "Think of a round table whose seats are every {term:hash} number, bent into a {term:ring}. Each server sits at the seat its name hashes to."
    : "Think of a round table whose seats are every {term:hash} number, bent into a {term:ring}. Each server takes several seats: its name and a few variants, hashed.") });
  s.line(3, 4);
  if (sc === "add") s.focus(...RING);
  say("ring.intro", sc === "add"
    ? `Now the ring way, with the same ${servers.length} servers: 0 at the top, numbers rising clockwise.`
    : `${servers.length} database servers, and a ring of every hash number: 0 at the top, rising clockwise.`, { again: sc === "add", ringIds: RING }, { min: 2.2 });

  // ---- servers take their places ----
  const V0 = P.levels[0];
  const placeTokens = (sv, v0, v1, o = {}) => {
    for (let i = v0; i < v1; i++) {
      const name = tokenName(sv, i), h = murmur3(name);
      const tok = { name, server: sv, i, hash: h };
      if (o.activate !== false) active.set(name, tok);
      s.tile(`t.${name}`, { of: "bit", text: sv.slice(-1), key: sv, dim: o.activate === false, at: polar(R, at.get(`t.${name}`)), state: { kind: "token", token: name, server: sv, hash: h, hex: hex(h), active: o.activate !== false } });
    }
  };
  for (const sv of servers) placeTokens(sv, 0, V0);
  for (const sv of servers) s.trace(`spoke.${sv}`, sv, `t.${sv}`, { route: "straight" });
  let sh = gaugeLoad();
  for (const sv of servers) { s.set(sv, { led: "ok" }); refreshServer(sv); }
  for (const sv of servers) s.tag(`t.${sv}`, `${sv} · ${hex(murmur3(sv))}`);
  s.line(6, 11);
  const ringOrder = ringNow().filter((t) => t.i === 0).map((t) => t.server);
  const biggest = Object.entries(sh).sort((a, b) => b[1] - a[1])[0];
  say("ring.seats", V0 === 1
    ? `Each server sits at the seat its name hashes to. The seats are uneven: ${K_(biggest[0])}'s {term:arc} is ${pct(biggest[1])}.`
    : `Each server takes ${V0} seats, its name and ${V0 - 1} variants: ${active.size} seats, ${active.size} {term:arc|arcs}.`,
    { seats: V0, total: active.size, order: ringOrder.map(SV), biggest: SV(biggest[0]), biggestId: biggest[0], share: pct(biggest[1]),
      tokenIds: ringNow().map((t) => `t.${t.name}`) }, { min: 2.6 });

  // ---- keys: one lookup in full, then the rest arc by arc ----
  s.phase("Keys", { id: "keys", about: "Each key's name is hashed onto the ring as well. Then, like a guest looking for a host, the key walks clockwise and sits with the first server it meets." });
  const ownerNow = (h) => successor(ringNow(), h).server;
  // the lookup shown in full: a key whose clockwise walk to its server is long enough to watch
  const walkLen = (k) => { const t = successor(ringNow(), k.hash); return (((t.hash - k.hash) + SPACE) % SPACE) / SPACE; };
  const probe = keys.slice().sort((a, b) => Math.abs(walkLen(a) - 0.11) - Math.abs(walkLen(b) - 0.11) || (a.name < b.name ? -1 : 1))[0];
  const keyTile = (k, o = {}) => s.tile(`k.${k.name}`, { of: "record", text: k.name, key: owner.get(k.name) ?? undefined, at: polar(R, at.get(`k.${k.name}`)), state: keyState(k), ...o });

  keyTile(probe);
  s.tag(`k.${probe.name}`, `${hex(probe.hash)} · ${deg(probe.hash)}`);
  s.line(13, 14);
  say("keys.hash", `A key is hashed the same way: ${keyRef(probe.name)} lands at \`${hex(probe.hash)}\`, ${deg(probe.hash)} round the ring.`,
    { key: KEY(probe.name), keyId: `k.${probe.name}`, hash: { code: hex(probe.hash) }, angle: deg(probe.hash) }, { min: 2.4 });

  const tok = successor(ringNow(), probe.hash);
  const a0 = at.get(`k.${probe.name}`), a1 = at.get(`t.${tok.name}`);
  const f0 = Math.floor((a0 / TAU) * FILLERS), span = ((((a1 - a0) / TAU) * FILLERS) + FILLERS) % FILLERS;
  const hops = Math.max(1, Math.ceil(span + ((a0 / TAU) * FILLERS - f0)));
  for (let j = 0; j < hops; j++) {
    if (j) s.beat();
    const fa = (f0 + j) % FILLERS, fb = (f0 + j + 1) % FILLERS;
    s.send(`walk${j}`, `f${fa}`, `f${fb}`, { via: `ring${fa}` });
  }
  s.beat();
  owner.set(probe.name, tok.server);
  s.set(`k.${probe.name}`, { key: tok.server, state: keyState(probe) });
  refreshServer(tok.server);
  s.lit(`t.${tok.name}`);
  s.tag(`t.${tok.name}`, `first seat ≥ ${hex(probe.hash)}`);
  s.line(15, 16);
  say("keys.walk", `Walk clockwise from it: the first server seat is ${K_(tok.server)}'s, so ${K_(tok.server)} stores ${keyRef(probe.name)}.`,
    { key: KEY(probe.name), keyId: `k.${probe.name}`, hash: { code: hex(probe.hash) }, server: SV(tok.server), serverId: tok.server, tokenId: `t.${tok.name}`,
      seat: { code: hex(tok.hash) }, hops }, { dur: Math.max(2.8, hops * 0.34 + 1) });

  const rest = keys.filter((k) => k !== probe);
  if (sc === "add") {
    // arc by arc, in ring order from the top: each server owns everything behind it up to its predecessor
    for (const sv of ringOrder) {
      const mine = rest.filter((k) => ownerNow(k.hash) === sv);
      for (const k of mine) { owner.set(k.name, sv); keyTile(k); }
      refreshServer(sv);
      const n = count(sv), share = shareNow()[sv];
      if (!mine.length) s.lit(`t.${sv}`);
      s.focus(sv, `t.${sv}`, ...mine.map((k) => `k.${k.name}`));
      s.line(13, 16);
      const tokensOf = ringNow().filter((t) => t.server === sv).length;
      say("keys.arc", tokensOf === 1
        ? (n ? `${K_(sv)} owns the arc that ends at its seat: ${pct(share)} of the ring, ${fmt.plural(n, "key")}.` : `${K_(sv)}'s arc is only ${pct(share)} of the ring, and no key lands in it.`)
        : `${K_(sv)}'s ${tokensOf} arcs add up to ${pct(share)} of the ring: ${fmt.plural(n, "key")}.`,
        { server: SV(sv), serverId: sv, tokenId: `t.${sv}`, share: pct(share), count: n, arcs: tokensOf, keys: mine.map((k) => KEY(k.name)), keyIds: keyIds(mine) }, { min: 2.2 });
    }
  } else {
    for (const k of rest) { owner.set(k.name, ownerNow(k.hash)); keyTile(k); }
    for (const sv of servers) refreshServer(sv);
    s.focus(...RING);
    s.line(13, 16);
    say("keys.rest", `The other ${K - 1} keys do the same, and each takes its server's colour.`, { rest: K - 1, keyIds: keyIds(rest) }, { min: 2.4 });
  }
  sh = shareNow();
  const loads = servers.map((sv) => count(sv));
  const hot = servers.slice().sort((a, b) => sh[b] - sh[a])[0];
  s.lit(hot);
  s.focus(...RING);
  say("keys.loads", `${K} keys on ${servers.length} servers: ${fmt.and(loads.map(String))}. ${K_(hot)} has the biggest arc, ${pct(sh[hot])}.`,
    { loads, servers: servers.map(SV), hot: SV(hot), hotId: hot, share: pct(sh[hot]), hotKeys: count(hot) }, { min: 3 });

  // a membership change: moving keys stream from their old owner to the new one, then recolour
  const migrate = (list, toOf, line) => {
    const bySrc = new Map();
    for (const k of list) { const src = owner.get(k.name); if (!bySrc.has(src)) bySrc.set(src, []); bySrc.get(src).push(k); }
    let n = 0;
    for (const k of list) {
      const src = owner.get(k.name), dst = toOf(k);
      s.send(`pk.${k.name}.${n++}`, src, dst, { text: k.name, key: src });
    }
    s.beat();
    for (const k of list) {
      const src = owner.get(k.name), dst = toOf(k);
      from.set(k.name, src); owner.set(k.name, dst); moves.set(k.name, moves.get(k.name) + 1);
      s.set(`k.${k.name}`, { key: dst, state: keyState(k) });
      s.tag(`k.${k.name}`, hex(k.hash));
    }
    s.count("moved", list.length);
    s.line(line[0], line[1]);
    return bySrc;
  };
  const modWhatIf = (before, after) => keys.filter((k) => before[k.hash % before.length] !== after[k.hash % after.length]).length;

  // ---- add a server ----
  if (sc === "add") {
    s.phase("Add a server", { id: "add", about: P.levels[0] === 1
      ? "A new server pulls up a chair inside one neighbour's arc. It takes only the keys between its seat and the server before it; every other key stays put."
      : "A new server pulls up several chairs, each inside an arc. It takes only the keys just before each of its seats; every other key stays put." });
    live.add(extra);
    addHousing(extra, { led: "busy" });
    placeTokens(extra, 0, P.levels[0], { activate: false });
    s.trace(`spoke.${extra}`, extra, `t.${extra}`, { route: "straight" });
    const h = murmur3(extra);
    const cand = buildRing([...servers, extra], P.levels[0]);
    const takes = keys.filter((k) => successor(cand, k.hash).server === extra);
    const pred = successor(ringNow(), h);       // whose arc the new token lands in
    s.tag(`t.${extra}`, `${extra} · ${hex(h)}`);
    s.focus(extra, `t.${extra}`, ...(P.levels[0] === 1 ? [`t.${pred.name}`] : []));
    s.line(6, 11);
    say("add.join", P.levels[0] === 1
      ? `${K_(extra)} joins at \`${hex(h)}\`, inside ${K_(pred.server)}'s arc. It waits, empty, for its keys.`
      : `${K_(extra)} joins with ${P.levels[0]} seats, landing in ${P.levels[0]} different arcs. It waits, empty, for its keys.`,
      { extra: SV(extra), extraId: extra, tokenId: `t.${extra}`, hash: { code: hex(h) }, seats: P.levels[0], pred: SV(pred.server), predId: pred.server,
        predTokenId: `t.${pred.name}`, predKeys: count(pred.server) }, { min: 2.8 });

    // the aha: on the ring, one more server moves only one arc's keys (the remainder way moved most of them)
    const modm = modWhatIf(servers, [...servers, extra]);
    const whole = takes.length === count(pred.server);   // the newcomer takes its neighbour's whole arc (or both hold none)
    s.ask(P.levels[0] === 1
      ? `The new server ${extra} takes over part of ${pred.server}'s arc. Which of the ${K} keys have to move?`
      : `The new server ${extra} has seats in ${P.levels[0]} arcs. Which of the ${K} keys have to move?`, [
      P.levels[0] === 1 ? `Only the keys between ${extra} and the server before it` : "Only the keys just before each of its seats",
      "Keys from all around the ring, like the remainder way",
      whole || P.levels[0] > 1 ? `All ${K} of them` : `All of ${pred.server}'s ${count(pred.server)} keys`,
    ], 0, { id: "add.which", why: P.levels[0] === 1
      ? `The new seat splits one arc. Only the keys between the server before it and ${extra}'s seat now meet ${extra} first.`
      : `Each new seat splits one arc. Only the keys just before a new seat now meet ${extra} first.` });
    for (let i = 0; i < P.levels[0]; i++) { const name = tokenName(extra, i); active.set(name, { name, server: extra, i, hash: murmur3(name) }); s.set(`t.${name}`, { dim: false, state: { kind: "token", token: name, server: extra, hash: murmur3(name), hex: hex(murmur3(name)), active: true } }); }
    const srcs = takes.length ? migrate(takes, () => extra, [13, 16]) : new Map();
    if (!takes.length) s.lit(`t.${extra}`);
    s.set(extra, { led: "ok" });
    for (const sv of live) refreshServer(sv);
    gaugeLoad();
    const fromList = [...srcs.keys()];
    say("add.move", takes.length
      ? `${fmt.plural(takes.length, "key")} stream to ${K_(extra)}${fromList.length === 1 ? ` from ${K_(fromList[0])}` : ` from ${fromList.length} servers`}; the other ${K - takes.length} stay exactly where they are.`
      : `None of the ${K} keys land in ${K_(extra)}'s arc, so nothing moves at all.`,
      { moved: takes.length, stayed: K - takes.length, extra: SV(extra), extraId: extra, from: fromList.map(SV), fromIds: fromList,
        keys: takes.map((k) => KEY(k.name)), keyIds: keyIds(takes) }, { min: 3 });

    s.phase("Result", { id: "result", about: `Only the keys just before the new seats moved: on average one key in ${servers.length + 1}. The remainder way moved more, and every moved key is data copied across the network.` });
    s.gauge("modmoved", modm);
    s.focus(...RING, ...modIds, `m.${extra}`);   // both boards: the ring's 3 against the remainder way's 14
    if (takes.length) s.lit(...takes.map((k) => `k.${k.name}`));
    s.line(18, 19);
    say("result.moved", `${takes.length} of ${K} keys moved; one in ${servers.length + 1} would be ${fmt.num(K / (servers.length + 1), 1)}. The remainder way moved ${modm}.`,
      { moved: takes.length, n1: servers.length + 1, fair: fmt.num(K / (servers.length + 1), 1), modm, keyIds: keyIds(takes) }, { min: 4 });
    const sh5 = shareNow(), top = Object.keys(sh5).sort((a, b) => sh5[b] - sh5[a])[0];
    s.lit(top);
    s.focus(...RING);
    say("result.uneven", P.levels[0] === 1
      ? `But one seat each shares the ring unevenly: ${K_(top)} still owns ${pct(sh5[top])} of it.`
      : `With ${P.levels[0]} seats each, the busiest server owns ${pct(sh5[top])} of the ring, ${ratioText(maxOverMean(sh5))} the average.`,
      { seats: P.levels[0], top: SV(top), topId: top, share: pct(sh5[top]), ratio: ratioText(maxOverMean(sh5)) }, { min: 3.6 });
  }

  // ---- remove a server ----
  const removeServer = (victim) => {
    const tokensOf = ringNow().filter((t) => t.server === victim);
    s.phase("A server leaves", { id: "leave", about: tokensOf.length === 1
      ? "A server leaves the table. Its guests walk on clockwise to the next server, and no other key moves."
      : "A server leaves the table. The keys at each of its seats walk on to the next seat clockwise, so they spread over several servers." });
    const theirs = keys.filter((k) => owner.get(k.name) === victim);
    s.gauge("moved", 0);                         // this chapter counts only the moves the departure causes
    const after = ringNow().filter((t) => t.server !== victim);
    const dest = (k) => successor(after, k.hash).server;
    const dests = [...new Set(theirs.map(dest))];
    // "spread evenly" is the misconception, so it is the wrong option, unless this run's keys really did split evenly
    const even = dests.length === live.size - 1 && dests.every((d) => theirs.filter((k) => dest(k) === d).length === theirs.length / dests.length);
    s.set(victim, { led: "warn", state: housingState(victim, { leaving: true }) });
    for (const t of tokensOf) s.set(`t.${t.name}`, { dim: true });
    s.tag(victim, "draining", { tone: "warn" });
    s.focus(victim, ...tokensOf.map((t) => `t.${t.name}`), ...theirs.map((k) => `k.${k.name}`));
    say("leave.drain", `${K_(victim)} is leaving the ring. It holds ${fmt.plural(theirs.length, "key")}, ${pct(shareNow()[victim])} of the ring.`,
      { victim: SV(victim), victimId: victim, count: theirs.length, share: pct(shareNow()[victim]), seats: tokensOf.length,
        tokenIds: tokensOf.map((t) => `t.${t.name}`), keys: theirs.map((k) => KEY(k.name)), keyIds: keyIds(theirs) }, { min: 2.6 });

    s.ask(`Where do ${victim}'s ${theirs.length} keys go?`, [
      tokensOf.length === 1 ? `All to the next server clockwise` : `To the next server clockwise of each of its ${tokensOf.length} seats`,
      even ? `All to one neighbour` : `Spread evenly over the other servers`,
      `Every key in the cluster is reshuffled`,
    ], 0, { id: "leave.where", why: dests.length === 1
      ? `Each key walks clockwise to the first seat still there. With ${victim}'s seat gone, that is ${dests[0]}'s for all of them.`
      : `Each key walks clockwise to the first seat still there. The seats of ${victim} sat in different places, so the keys reach different servers.` });
    for (const t of tokensOf) {
      active.delete(t.name);
      s.set(`t.${t.name}`, { state: { kind: "token", token: t.name, server: victim, hash: t.hash, hex: hex(t.hash), active: false } });
    }
    if (theirs.length) migrate(theirs, dest, [13, 16]);
    for (const sv of live) refreshServer(sv, { leaving: sv === victim });
    s.set(victim, { led: "off" });
    gaugeLoad();
    say("leave.move", theirs.length
      ? (dests.length === 1
        ? `Each key walks on clockwise, so all ${theirs.length} land on ${K_(dests[0])}. No other server is touched.`
        : `Each key walks on clockwise: ${theirs.length} keys spread over ${fmt.and(dests.map(K_))}.`)
      : `${K_(victim)} held no keys, so nothing moves.`,
      { victim: SV(victim), victimId: victim, count: theirs.length, dests: dests.map(SV), destIds: dests, keyIds: keyIds(theirs) }, { min: 3 });

    for (const t of tokensOf) s.remove(`t.${t.name}`, { style: "sink" });
    s.remove(`spoke.${victim}`, { style: "fade" });
    s.remove(victim, { style: "sink" });
    live.delete(victim);
    const sh2 = gaugeLoad();
    const heavy = Object.entries(sh2).sort((a, b) => b[1] - a[1])[0];
    const modm = modWhatIf(servers.filter((x) => live.has(x) || x === victim), [...live].filter((x) => servers.includes(x)));
    s.gauge("modmoved", modm);
    s.focus(...RING);
    s.lit(heavy[0]);
    return { theirs, dests, heavy, ratio: maxOverMean(sh2), modm };
  };

  const victimOf = () => servers.slice().sort((a, b) => count(b) - count(a) || shareNow()[b] - shareNow()[a])[0];

  if (sc === "remove") {
    const r = removeServer(victimOf());
    s.phase("Result", { id: "result", about: r.dests.length === 1
      ? "Only the leaving server's keys moved, but all of them went to one neighbour. That neighbour now owns a far bigger share of the ring than the rest."
      : "Only the leaving server's keys moved, spread over its neighbours. The remainder way, `hash(key) % N`, would have moved far more." });
    say("result.leave", r.dests.length === 1
      ? `${K_(r.heavy[0])} now owns ${pct(r.heavy[1])} of the ring. The remainder way, \`hash % ${live.size}\`, would move ${r.modm}.`
      : `${K_(r.heavy[0])} now owns ${pct(r.heavy[1])} of the ring. The remainder way, \`hash % ${live.size}\`, would move ${r.modm} keys.`,
      { heavy: SV(r.heavy[0]), heavyId: r.heavy[0], share: pct(r.heavy[1]), left: live.size, modm: r.modm, dests: r.dests.length, rule: { code: `hash % ${live.size}` } }, { min: 4.2 });
  }

  // ---- virtual nodes ----
  if (sc === "vnodes") {
    s.phase("Many seats each", { id: "vnodes", about: "Each server takes more seats around the table, called {term:virtual node|virtual nodes}, so it owns many small arcs and the shares even out. Each new seat splits an arc, so a few keys move; real servers start with all their seats." });
    let prevV = P.levels[0];
    for (const v of P.levels.slice(1)) {
      const before = maxOverMean(shareNow());
      for (const sv of servers) placeTokens(sv, prevV, v);
      s.beat();
      const changed = keys.filter((k) => ownerNow(k.hash) !== owner.get(k.name));
      for (const k of changed) {
        from.set(k.name, owner.get(k.name)); owner.set(k.name, ownerNow(k.hash)); moves.set(k.name, moves.get(k.name) + 1);
        s.set(`k.${k.name}`, { key: owner.get(k.name), state: keyState(k) });
      }
      if (changed.length) s.count("moved", changed.length);
      for (const sv of servers) refreshServer(sv);
      const after = maxOverMean(gaugeLoad());
      s.focus(...RING);
      s.line(9, 10);
      // more seats even the shares out only on average: one doubling can leave the busiest share level or higher
      const [b, a] = [ratioText(before), ratioText(after)];
      const trend = a === b ? `stays at ${a}` : `${parseFloat(a) < parseFloat(b) ? "falls" : "rises"} from ${b} to ${a}`;
      say("vnodes.more", `Now ${v} seats each: ${fmt.plural(changed.length, "key")} change server; the busiest share ${trend} the average.`,
        { seats: v, was: prevV, changed: changed.length, keyIds: keyIds(changed), before: ratioText(before), after: ratioText(after), total: active.size }, { min: 3.4 });
      prevV = v;
    }
    const r = removeServer(victimOf());
    const big = [64, 256].map((v) => maxOverMean(shares(buildRing([...live], v), [...live])));
    s.phase("Result", { id: "result", about: r.dests.length > 1
      ? "With many small arcs, the leaving server's keys spread over several servers instead of landing on one, so no single neighbour is overloaded."
      : "With many small arcs per server, the load stays closer to even after a server leaves. More seats per server even it out further." });
    say("result.vnodes", r.dests.length > 1
      ? `${K_(r.theirs.length ? r.heavy[0] : servers[0])} is now the busiest, at ${ratioText(r.ratio)} the average share. With 256 seats each: ${ratioText(big[1])}.`
      : live.size === 1 ? `Only ${K_([...live][0])} is left, so it holds every key and the whole ring.`
        : `The busiest server is at ${ratioText(r.ratio)} the average; 64 seats each would give ${ratioText(big[0])}, 256 ${ratioText(big[1])}.`,
      { spread: r.dests.length > 1, alone: live.size === 1, heavy: SV(r.theirs.length ? r.heavy[0] : servers[0]), heavyId: r.theirs.length ? r.heavy[0] : servers[0],
        ratio: ratioText(r.ratio), big64: ratioText(big[0]), big256: ratioText(big[1]), left: live.size, dests: r.dests.length }, { min: 4.2 });
  }
}
