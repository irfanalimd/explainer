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
// Scenarios: add a server (only one arc moves); remove one (its arc falls to its clockwise successor, a hot
// spot); mod N beside the ring (adding a server reshuffles almost everything); virtual nodes (1 -> 8 tokens per
// server, the max/mean share tightens, and a departing server's keys scatter instead of piling onto one).

import * as fmt from "../../sim/fmt.mjs";
import { rng } from "../../sim/rng.mjs";
import { SIZE } from "../../engine/tokens.mjs";

export const meta = {
  title: "Consistent hashing",
  subtitle: "Adding a server moves one arc of keys, not all of them",
  kicker: "Distributed systems",
  fig: 4,
  cite: {
    text: "Karger et al., “Consistent Hashing and Random Trees”, STOC 1997 · DeCandia et al., “Dynamo”, SOSP 2007",
    url: "https://doi.org/10.1145/258533.258660",
  },
  theme: "dark",
  hook: "Add one server to a cache cluster. Does every key have to move?",
  takeaway: "A new server takes over one arc of the ring, so only the keys in that arc move; every other key stays where it is.",
};

export const params = {
  servers: { label: "Servers", type: "int", min: 2, max: 6, value: 4 },
  keys: { label: "Keys", type: "int", min: 6, max: 24, value: 16 },
  vnodes: { label: "Tokens per server (virtual nodes)", type: "int", min: 1, max: 8, value: 1 },
  seed: { label: "Seed (which keys)", type: "int", value: 6 },
};

export const scenarios = [
  { id: "add", label: "Add a server", whatIf: "a server joins",
    description: "A new server joins the ring and takes over only the keys in the arc just before it." },
  { id: "remove", label: "Remove a server", whatIf: "a server leaves",
    description: "A server leaves the ring: only its own keys move, all of them to the next server clockwise.",
    takeaway: "When a server leaves, only its own keys move, and all of them go to the next server clockwise." },
  { id: "modn", label: "mod N vs ring", whatIf: "keys use hash % N instead",
    description: "The same change counted two ways: keys placed on the ring, and keys placed by hash % N.",
    takeaway: "Under hash % N, changing N moves almost every key; the ring moves only the keys in one arc, about one in N." },
  { id: "vnodes", label: "Virtual nodes", params: { vnodes: 8 }, whatIf: "each server owns many small arcs",
    description: "Each server owns many small arcs, so when one leaves, its keys spread over several neighbours.",
    takeaway: "With many tokens per server, a departing server's keys spread over several neighbours instead of piling onto one." },
];

export const counters = {
  moved: { label: "keys moved", group: "ring", better: "lower", primary: true,
    hint: "Keys that had to change server because of this change. Each one is data copied over the network." },
  modmoved: { label: "keys moved", group: "mod N", better: "lower", primary: true,
    hint: "Keys that had to change server because of this change. Each one is data copied over the network." },
  load: { label: "busiest server's load", short: "busiest server", format: "x", primary: ["vnodes"],
    hint: "Keys on the busiest server divided by the average per server. 1× is perfectly even." },
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
    if (scenario !== "add" && scenario !== "modn") return true;
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
  const N = Math.max(2, Math.min(6, p.servers | 0));
  const K = Math.max(1, Math.min(POOL.length, p.keys | 0));
  const V = Math.max(1, Math.min(8, p.vnodes | 0));
  const sc = ["add", "remove", "modn", "vnodes"].includes(scenario) ? scenario : "add";
  const keys = rng(p.seed ?? 6).fork("keys").sample(POOL, K).map((name) => ({ name, hash: murmur3(name) }));
  const servers = NAMES.slice(0, N);
  const extra = sc === "add" || sc === "modn" ? NAMES[N] : null;
  const levels = [];
  if (sc === "vnodes") { for (let v = 1; v < V; v *= 2) levels.push(v); levels.push(V); } else levels.push(V);
  const Vmax = levels[levels.length - 1];
  const everyone = extra ? [...servers, extra] : servers;
  const stations = keys.map((k) => ({ id: `k.${k.name}`, theta: (k.hash / SPACE) * TAU, w: SIZE.record.w, d: SIZE.record.d, gap: 6 }));
  for (const t of buildRing(everyone, Vmax)) stations.push({ id: `t.${t.name}`, theta: (t.hash / SPACE) * TAU, w: SIZE.bit.w, d: SIZE.bit.d, gap: 5 });
  const geo = layoutRing(stations, everyone);
  return { N, K, V, sc, keys, servers, extra, levels, Vmax, everyone, geo };
}

const plainWords = (markup) => fmt.plain(markup).split(/\s+/).filter(Boolean).length;
// motion plays at its natural pace; a long caption gets enough time to be read at 1x
const readable = (markup, min = 1.3) => Math.min(4.2, Math.max(min, 0.24 * plainWords(markup)));

export function build(s, p, scenario) {
  const P = plan(p, scenario);
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
  const say = (markup, o = {}) => s.step(markup, { dur: o.dur ?? readable(markup, o.min) });
  const K_ = (sv) => fmt.key(sv);
  const keyRef = (name) => fmt.ref(`k.${name}`, name);

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
  const marks = ["0x0000_0000", "0x4000_0000", "0x8000_0000", "0xc000_0000"];
  const markAt = [[0, -(R + 34)], [R + 80, 0], [0, R + 34], [-(R + 80), 0]];
  marks.forEach((m, i) => s.text(`q${i}`, { text: m, size: 8.5, at: markAt[i] }));
  s.zone("ringzone", { around: ["q0", "q1", "q2", "q3"], title: "hash ring · murmur3, 32-bit" });
  const RING = ["q0", "q1", "q2", "q3"];   // a zone cannot be a focus target, its four corner marks can

  const addHousing = (sv, o = {}) => {
    s.housing(sv, { at: house.get(sv), title: sv, sub: o.sub ?? null, led: o.led ?? "idle", key: sv, tray: { cols: 1, of: "tile" }, state: housingState(sv, { active: o.active ?? false }) });
    s.tile(`n.${sv}`, { in: sv, text: "0", sub: "keys", key: sv, state: { badge: sv } });
  };
  for (const sv of servers) addHousing(sv);

  // the mod N board, beside the ring: one housing per server, server i holds the keys with hash % N = i
  const modAt = new Map();
  const modOwner = new Map();
  let modIds = [];
  let addMod = null;
  if (sc === "modn") {
    const all = [...servers, extra];
    const fullest = (n) => Math.max(...Array.from({ length: n }, (_, b) => keys.filter((k) => k.hash % n === b).length));
    const rows = Math.max(1, Math.ceil(Math.max(fullest(servers.length), fullest(all.length)) / 2));
    const mw = Math.max(120, 2 * SIZE.record.w + SIZE.record.gap + 2 * SIZE.housing.pad + 2 * SIZE.well.inset);
    const md = Math.max(80, SIZE.housing.header + rows * SIZE.record.d + (rows - 1) * SIZE.record.gap + 2 * SIZE.housing.pad + SIZE.well.inset);
    const x0 = R + 74 + 40 + 2 * SIZE.zone.pad + SIZE.gutter + mw / 2, rowsN = Math.ceil(all.length / 2);
    const y0 = -((rowsN - 1) * (md + 18)) / 2;
    all.forEach((sv, i) => { modAt.set(sv, [x0 + (i % 2) * (mw + 18), y0 + Math.floor(i / 2) * (md + 18)]); });
    addMod = (sv, n) => {
      const b = all.indexOf(sv);
      s.housing(`m.${sv}`, { at: modAt.get(sv), w: mw, d: md, title: sv, sub: `h % ${n} = ${b}`, led: "ok", key: sv, tray: { cols: 2, rows, of: "record" }, state: { kind: "bucket", server: sv, index: b, n } });
    };
    servers.forEach((sv) => addMod(sv, servers.length));
    modIds = servers.map((sv) => `m.${sv}`);
    s.zone("modzone", { around: modIds, title: "the same keys under hash(key) mod N" });
  }

  s.gauge("moved", 0);
  s.gauge("servers", servers.length);
  s.phase("The ring", { about: P.levels[0] === 1
    ? "Each server's name is hashed to a number from 0 to 2³² − 1: a point on a circle. A server owns the stretch of ring that runs clockwise up to its point."
    : "Each server hashes its name and a few variants to points on a circle of 2³² values. Every point owns the stretch of ring that runs clockwise up to it." });
  s.line(3, 4);
  say(`${servers.length} database servers and the ring of all 2³² hash values: 0 at the top, rising clockwise`, { min: 2.2 });

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
  say(V0 === 1
    ? `Each server sits at \`murmur3(name)\`, cutting the ring into ${servers.length} arcs; ${K_(biggest[0])}'s is ${pct(biggest[1])} of it`
    : `Each server hashes its name and ${V0 - 1} variants (\`db01#1\` …) onto the ring: ${active.size} tokens, ${active.size} arcs`, { min: 2.6 });

  // ---- keys: one lookup in full, then the rest arc by arc ----
  s.phase("Keys", { about: "Keys are hashed the same way. To find a key's server, start at the key's point and walk clockwise to the first server point: that server stores the key." });
  const ownerNow = (h) => successor(ringNow(), h).server;
  // the lookup shown in full: a key whose clockwise walk to its server is long enough to watch
  const walkLen = (k) => { const t = successor(ringNow(), k.hash); return (((t.hash - k.hash) + SPACE) % SPACE) / SPACE; };
  const probe = keys.slice().sort((a, b) => Math.abs(walkLen(a) - 0.11) - Math.abs(walkLen(b) - 0.11) || (a.name < b.name ? -1 : 1))[0];
  const keyTile = (k, o = {}) => s.tile(`k.${k.name}`, { of: "record", text: k.name, key: owner.get(k.name) ?? undefined, at: polar(R, at.get(`k.${k.name}`)), state: keyState(k), ...o });

  keyTile(probe);
  s.tag(`k.${probe.name}`, `${hex(probe.hash)} · ${deg(probe.hash)}`);
  s.line(13, 14);
  say(`A key is hashed the same way: ${keyRef(probe.name)} lands at \`${hex(probe.hash)}\`, ${deg(probe.hash)} round the ring`, { min: 2.4 });

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
  s.tag(`t.${tok.name}`, `first token ≥ ${hex(probe.hash)}`);
  s.line(15, 16);
  say(`Walk clockwise from it: the first server token is ${K_(tok.server)}'s, so ${K_(tok.server)} stores ${keyRef(probe.name)}`, { dur: Math.max(2.8, hops * 0.34 + 1) });

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
      say(tokensOf === 1
        ? (n ? `${K_(sv)} owns the arc that ends at its token: ${pct(share)} of the ring, ${fmt.plural(n, "key")}` : `${K_(sv)}'s arc is only ${pct(share)} of the ring, and no key lands in it`)
        : `${K_(sv)}'s ${tokensOf} arcs add up to ${pct(share)} of the ring: ${fmt.plural(n, "key")}`, { min: 2.2 });
    }
  } else {
    for (const k of rest) { owner.set(k.name, ownerNow(k.hash)); keyTile(k); }
    for (const sv of servers) refreshServer(sv);
    s.focus(...RING);
    s.line(13, 16);
    say(`The other ${K - 1} keys do the same, and each takes the colour of the server it lands on`, { min: 2.4 });
  }
  sh = shareNow();
  const loads = servers.map((sv) => count(sv));
  const hot = servers.slice().sort((a, b) => sh[b] - sh[a])[0];
  s.lit(hot);
  s.focus(...RING);
  say(`${K} keys on ${servers.length} servers: ${loads.join(" / ")}. ${K_(hot)} owns ${pct(sh[hot])} of the ring, ${ratioText(maxOverMean(sh))} the mean share`, { min: 3 });

  if (sc === "modn") {
    const n0 = servers.length;
    for (const k of keys) {
      const b = k.hash % n0, dst = servers[b];
      modOwner.set(k.name, dst);
      s.spawn(`mk.${k.name}`, { from: `k.${k.name}`, in: `m.${dst}`, of: "record", text: k.name, key: dst, state: { kind: "modkey", key: k.name, hash: k.hash, bucket: b, n: n0, server: dst } });
    }
    s.focus(...RING, ...modIds);
    s.line(18, 19);
    say(`The same ${K} keys under \`hash(key) % ${n0}\` instead: server number \`h % ${n0}\` stores each one`, { min: 3 });
  }

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
  if (sc === "add" || sc === "modn") {
    s.phase("Add a server", { about: P.levels[0] === 1
      ? "A new server hashes onto the ring and takes over part of one neighbour's arc. Only the keys in that slice move to it; every other key stays where it is."
      : "A new server hashes its points onto the ring and takes a slice of several arcs. Only the keys in those slices move to it; every other key stays where it is." });
    live.add(extra);
    addHousing(extra, { led: "busy" });
    placeTokens(extra, 0, P.levels[0], { activate: false });
    s.trace(`spoke.${extra}`, extra, `t.${extra}`, { route: "straight" });
    if (sc === "modn") { addMod(extra, servers.length + 1); s.set("modzone", { around: [...modIds, `m.${extra}`] }); }
    const h = murmur3(extra);
    const cand = buildRing([...servers, extra], P.levels[0]);
    const takes = keys.filter((k) => successor(cand, k.hash).server === extra);
    const pred = successor(ringNow(), h);       // whose arc the new token lands in
    s.tag(`t.${extra}`, `${extra} · ${hex(h)}`);
    s.focus(extra, `t.${extra}`, ...(P.levels[0] === 1 ? [`t.${pred.name}`] : []));
    s.line(6, 11);
    say(P.levels[0] === 1
      ? `${K_(extra)} joins at \`${hex(h)}\`, inside ${K_(pred.server)}'s arc. It boots and waits for its data`
      : `${K_(extra)} joins with ${P.levels[0]} tokens, landing in ${P.levels[0]} different arcs. It boots and waits for its data`, { min: 2.8 });

    s.ask(`${extra} takes over its arc. How many of the ${K} keys have to move?`, [
      `Only the keys between its predecessor and ${extra}`,
      `About half of them`,
      `Nearly all of them`,
    ], 0);
    for (let i = 0; i < P.levels[0]; i++) { const name = tokenName(extra, i); active.set(name, { name, server: extra, i, hash: murmur3(name) }); s.set(`t.${name}`, { dim: false, state: { kind: "token", token: name, server: extra, hash: murmur3(name), hex: hex(murmur3(name)), active: true } }); }
    const srcs = takes.length ? migrate(takes, () => extra, [13, 16]) : new Map();
    if (!takes.length) s.lit(`t.${extra}`);
    s.set(extra, { led: "ok" });
    for (const sv of live) refreshServer(sv);
    gaugeLoad();
    const fromList = [...srcs.keys()];
    say(takes.length
      ? `${fmt.plural(takes.length, "key")} stream to ${K_(extra)}${fromList.length === 1 ? ` from ${K_(fromList[0])}` : ` from ${fromList.length} servers`}; the other ${K - takes.length} stay exactly where they are`
      : `None of the ${K} keys hash into ${K_(extra)}'s arc, so nothing moves at all`, { min: 3 });

    const modm = modWhatIf(servers, [...servers, extra]);
    if (sc === "add") {
      s.phase("Result", { about: "About one key in N moved, where N is the number of servers: the least any scheme can move. Under `hash % N`, most keys would have changed server." });
      s.gauge("modmoved", modm);
      s.focus(...RING);
      if (takes.length) s.lit(...takes.map((k) => `k.${k.name}`));
      s.line(18, 19);
      say(`${takes.length} of ${K} keys moved (${pct(takes.length / K)}), close to K/N = ${K}/${servers.length + 1} ≈ ${fmt.num(K / (servers.length + 1), 1)}. Under \`hash % N\`, ${modm} would have`, { min: 4 });
      const sh5 = shareNow(), top = Object.keys(sh5).sort((a, b) => sh5[b] - sh5[a])[0];
      s.lit(top);
      s.focus(...RING);
      say(P.levels[0] === 1
        ? `But the new server only split one arc: ${K_(top)} still owns ${pct(sh5[top])} of the ring, ${ratioText(maxOverMean(sh5))} the mean. Virtual nodes even that out`
        : `With ${P.levels[0]} tokens each, the busiest server owns ${pct(sh5[top])} of the ring, ${ratioText(maxOverMean(sh5))} the mean`, { min: 3.6 });
    } else {
      // the same change under mod N
      s.phase("mod N", { about: "The common alternative stores a key on server number `hash(key) % N`. Adding a server changes N, so almost every remainder changes and most keys move." });
      const all = [...servers, extra];
      const n1 = all.length;
      s.ask(`Under hash(key) mod N, N goes from ${servers.length} to ${n1}. How many keys move?`, [`About ${Math.round(K / n1)}, like the ring`, `About half`, `Nearly all of them`], 2);
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
      say(`Under \`hash(key) % ${n1}\`, ${moved} of ${K} keys change server (${pct(moved / K)}), because almost every remainder changes when N does`, { min: 3.6 });
      s.phase("Result", { about: "Side by side: the ring moved only the keys in one slice, while mod N reshuffled most of them. For a cache, every moved key is a miss that must be refetched." });
      s.focus(...RING, ...modIds, `m.${extra}`);
      say(`One new server: the ring moved ${takes.length} ${takes.length === 1 ? "key" : "keys"}, mod N moved ${moved}. For a cache, mod N means a cold start for ${pct(moved / K)} of it`, { min: 4 });
    }
  }

  // ---- remove a server ----
  const removeServer = (victim) => {
    const tokensOf = ringNow().filter((t) => t.server === victim);
    s.phase("Remove a server", { about: tokensOf.length === 1
      ? "A server leaves the ring. Its keys go to the next server clockwise, and no other key moves."
      : "A server leaves the ring. The keys at each of its points go to the next point clockwise, so they spread over several servers; no other key moves." });
    const theirs = keys.filter((k) => owner.get(k.name) === victim);
    const after = ringNow().filter((t) => t.server !== victim);
    const dest = (k) => successor(after, k.hash).server;
    const dests = [...new Set(theirs.map(dest))];
    s.set(victim, { led: "warn", state: housingState(victim, { leaving: true }) });
    for (const t of tokensOf) s.set(`t.${t.name}`, { dim: true });
    s.tag(victim, "draining", { tone: "warn" });
    s.focus(victim, ...tokensOf.map((t) => `t.${t.name}`), ...theirs.map((k) => `k.${k.name}`));
    say(`${K_(victim)} is leaving the ring. It holds ${fmt.plural(theirs.length, "key")}, ${pct(shareNow()[victim])} of the ring`, { min: 2.6 });

    s.ask(`Where do ${victim}'s ${theirs.length} keys go?`, [
      tokensOf.length === 1 ? `All to the next server clockwise` : `To the next server clockwise of each of its ${tokensOf.length} tokens`,
      `Spread evenly over every other server`,
      `Everything is rehashed across the cluster`,
    ], 0);
    for (const t of tokensOf) {
      active.delete(t.name);
      s.set(`t.${t.name}`, { state: { kind: "token", token: t.name, server: victim, hash: t.hash, hex: hex(t.hash), active: false } });
    }
    if (theirs.length) migrate(theirs, dest, [13, 16]);
    for (const sv of live) refreshServer(sv, { leaving: sv === victim });
    s.set(victim, { led: "off" });
    gaugeLoad();
    say(theirs.length
      ? (dests.length === 1
        ? `Each key goes to the next token clockwise, so all ${theirs.length} land on ${K_(dests[0])}; no other server is touched`
        : `Each key goes to the next token clockwise: ${theirs.length} keys spread over ${fmt.and(dests.map(K_))}`)
      : `${K_(victim)} held no keys, so nothing moves`, { min: 3 });

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
    s.phase("Result", { about: r.dests.length === 1
      ? "Only the departed server's keys moved, but all of them went to one neighbour, which now owns a far bigger share of the ring than the rest."
      : "Only the departed server's keys moved, spread over its neighbours. Under `hash % N` far more keys would have moved." });
    say(r.dests.length === 1
      ? `${K_(r.heavy[0])} now owns ${pct(r.heavy[1])} of the ring, ${ratioText(r.ratio)} the mean: one neighbour took the whole arc. \`hash % N\` would have moved ${r.modm} keys`
      : `${K_(r.heavy[0])} now owns ${pct(r.heavy[1])} of the ring, ${ratioText(r.ratio)} the mean. Under \`hash % N\`, ${r.modm} keys would have moved`, { min: 4.2 });
  }

  // ---- virtual nodes ----
  if (sc === "vnodes") {
    s.phase("Virtual nodes", { about: "Each server adds more points on the ring, called virtual nodes, so it owns many small arcs instead of one big one. More arcs per server even out each server's share." });
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
      const added = v - prevV, first = `${servers[0]}#${prevV}`;
      say(`Each server adds ${added === 1 ? `a token at \`murmur3("${first}")\`` : `${added} tokens (\`${first}\` … \`#${v - 1}\`)`}: ${fmt.plural(changed.length, "key")} change owner, max/mean ${ratioText(before)} → ${ratioText(after)}`, { min: 3.4 });
      prevV = v;
    }
    const r = removeServer(victimOf());
    const big = [64, 256].map((v) => maxOverMean(shares(buildRing([...live], v), [...live])));
    s.phase("Result", { about: r.dests.length > 1
      ? "With many small arcs, the departed server's keys spread over several servers instead of landing on one, so no single neighbour is overloaded."
      : "With many small arcs per server, the load stays closer to even after a server leaves. More points per server even it out further." });
    say(r.dests.length > 1
      ? `${K_(r.theirs.length ? r.heavy[0] : servers[0])} is now the busiest at ${ratioText(r.ratio)} the mean: the departed arcs were scattered. At 256 tokens per server it would be ${ratioText(big[1])}`
      : `The busiest server is at ${ratioText(r.ratio)} the mean. With 64 tokens per server it would be ${ratioText(big[0])}, with 256 ${ratioText(big[1])}`, { min: 4.2 });
  }
}
