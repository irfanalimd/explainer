// B+ tree insert and split: a real B+ tree of order MAX_KEYS (Comer 1979, section 3). Keys live only in the leaves;
// inner pages hold separators that route searches; leaves are chained left to right. Every insert descends from the
// root (one page read per level), lands in the one leaf where the key belongs, and an overflowing page splits: a leaf
// copies its right half's first key up, an inner page pushes its middle key up, and a root split grows the tree a
// level at the top. A range scan at the end descends once and then walks the leaf chain.
//
// Lesson plan (references/teaching.md)
//   Reader      knows arrays, sorting and dictionaries; has never met an index or a page.
//   Level       core.
//   Hook        how does a database find one row by reading three or four pages instead of every row?
//   Picture     a library: books in a pile (a table with no index) must be checked spine by spine; shelves of 3
//               books in order (leaf pages), signposts that say which aisle (inner pages and their separators),
//               the signpost at the door (the root), walking from the door to one shelf (the descent, one page per
//               level), a crowded shelf becoming two (a split), shelves side by side (the leaf chain).
//   Problem     chapter 1 checks the arriving ids one by one until the target turns up, for real.
//   Ladder      Without an index · One page · Leaf split · Descend · Root split (two stories) · Range scan
//   Misconception "a search checks every page" (predicted at Descend) and "the tree grows at the bottom"
//               (predicted at the root split).
//   Stories     Ids in any order · Ids that only grow · The top page fills up
// Each question sits on its chapter's first step (the range scan's on its second), because the HUD withholds a
// chapter's about until its predictions are revealed.

import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "B+ tree",
  subtitle: "How a database finds one row without reading them all",
  kicker: "Databases",
  fig: 7,
  level: "core",
  cite: { text: "D. Comer, “The Ubiquitous B-Tree”, ACM Computing Surveys, 1979", url: "https://doi.org/10.1145/356770.356776" },
  theme: "dark",
  hook: "A table of a million orders. How does a database find one order in three or four reads, instead of checking every row?",
  terms: {
    index: "a sorted guide that says where each row is, like the tabs of a phone book",
    page: "a fixed-size block that the disk reads in one go; here it holds a few ids",
    root: "the top block of the tree, where every search starts",
    leaf: "a block at the bottom of the tree, holding the ids themselves",
    separator: "an id in an upper block that says which way to go: smaller ids go left",
  },
  recap: [
    "Without an index, finding one id meant checking them one by one.",
    "The tree keeps ids sorted in pages; a full page splits in two.",
    "Signposts in the upper pages lead each search down, one page per level.",
    "The bottom pages are linked, so a range is a walk along them.",
  ],
  takeaway: "A B+ tree finds any id by reading one page per level, and stays shallow because full pages split and it grows at the top.",
};

export const params = {
  order: { label: "Ids per page", type: "int", min: 3, max: 5, value: 3 },
  n: { label: "How many ids", type: "int", min: 4, max: 14, value: 10 },
  input: { label: "Your own ids (optional)", type: "text", value: "" },
  scan: { label: "Finish with a range search", type: "bool", value: true },
  seed: { label: "Seed", type: "int", value: 7 },
};

export const scenarios = [
  { id: "random", label: "Ids in any order", params: { pattern: "random" }, whatIf: "the ids arrive in any order",
    description: "Ids arrive in random order, land in pages all over the tree, and full pages split in two." },
  { id: "sequential", label: "Ids that only grow", params: { pattern: "sequential" }, whatIf: "every new id is bigger than the last",
    description: "Each new id is bigger than the last, so every insert goes to the far right and leaves half-full pages behind.",
    takeaway: "Ids that only grow fill only the right edge: each split leaves a half-full page behind that never fills again.",
    recap: [
      "Every new id was the biggest so far, so it went to the far right.",
      "Each split left a half-full page behind that no later id would reach.",
      "The tree grew taller and emptier than it needed to be.",
    ] },
  // chosen so every split leaves two half-full leaves: the fifth leaf overflows the root at the 10th insert
  { id: "rootsplit", label: "The top page fills up", params: { order: 3, input: "41 18 63 29 75 52 11 24 84 89 57 35" }, whatIf: "the top page fills up too",
    description: "Small pages fill fast, until the top page itself is full and the tree grows a new level on top.",
    takeaway: "When the top page fills, it splits and a new top page appears above it, so every bottom page stays equally deep.",
    recap: [
      "Full pages split, and each split sent one id up to the page above.",
      "When the top page filled, it split too, and a new top page appeared.",
      "The tree grew at the top, so every search still reads one page per level.",
    ] },
];

export const counters = {
  height: { label: "levels", format: "int", primary: true,
    hint: "Pages from the top of the tree to the bottom. Every search reads one page per level." },
  pages: { label: "pages", format: "int",
    hint: "Pages the tree uses, signpost pages and bottom pages together." },
  reads: { label: "pages read", format: "int",
    hint: "Pages read to find where each id belongs: one per level, for every insert." },
  splits: { label: "pages split in two", short: "splits", format: "int", primary: true,
    hint: "Times a full page split into two half-full ones to make room." },
  fill: { label: "how full the bottom pages are", short: "fullness", format: "pct", primary: ["sequential"],
    hint: "How full the bottom pages are on average. Emptier pages waste disk space and memory." },
  scanned: { label: "ids checked one by one", short: "checked", format: "int",
    hint: "Without an index, finding one id means checking each until it turns up." },
};

export const code = {
  lang: "python",
  source: [
    "def insert(tree, key):",
    "    node, path = tree.root, []",
    "    while not node.leaf:                  # one page read per level",
    "        path.append(node)",
    "        node = node.kids[bisect_right(node.keys, key)]",
    "    insort(node.keys, key)",
    "    while len(node.keys) > MAX_KEYS:      # overflow: split, then fix the parent",
    "        if node.leaf:",
    "            mid = (len(node.keys) + 1) // 2",
    "            right = Leaf(node.keys[mid:], next=node.next)",
    "            node.keys, node.next = node.keys[:mid], right",
    "            sep = right.keys[0]           # copied up: it stays in the leaf",
    "        else:",
    "            mid = len(node.keys) // 2",
    "            sep = node.keys[mid]          # pushed up: it leaves this page",
    "            right = Inner(node.keys[mid+1:], node.kids[mid+1:])",
    "            node.keys, node.kids = node.keys[:mid], node.kids[:mid+1]",
    "        if not path:                      # the root split:",
    "            tree.root = Inner([sep], [node, right])   # one level taller",
    "            return",
    "        parent = path.pop()",
    "        i = parent.kids.index(node)",
    "        parent.keys.insert(i, sep)",
    "        parent.kids.insert(i + 1, right)",
    "        node = parent",
    "",
    "def range_scan(tree, lo, hi):",
    "    leaf = descend(tree.root, lo)",
    "    while leaf:",
    "        for k in leaf.keys:",
    "            if k > hi: return",
    "            if k >= lo: yield k",
    "        leaf = leaf.next                  # sideways, never back up",
  ].join("\n"),
};

// ---- invariants: they read the model each page publishes in its inspector state ----

const pagesOf = (snap) => {
  const m = new Map();
  for (const r of snap.entities.values()) if (r.kind === "housing" && r.state && r.state.page) m.set(r.state.page, r.state);
  return m;
};
const treeOf = (snap) => stateOf(snap, "inserts");
const increasing = (xs) => xs.every((x, i) => i === 0 || xs[i - 1] < x);
const leftmost = (pages, id) => { let p = pages.get(id); while (p && !p.leaf) p = pages.get(p.children[0]); return p; };

export const invariants = {
  "keys sorted in every page": (snap) => {
    for (const p of pagesOf(snap).values()) if (!increasing(p.keys)) return `${p.page} holds [${p.keys}], not in order`;
    return true;
  },
  "tiles match the model": (snap) => {
    for (const p of pagesOf(snap).values()) {
      const tiles = snap.entities.get(p.page).children.map((id) => snap.entities.get(id)?.state?.key);
      if (tiles.join() !== p.keys.join()) return `${p.page} shows [${tiles}] but holds [${p.keys}]`;
    }
    return true;
  },
  "every page within bounds": (snap) => {
    const t = treeOf(snap);
    if (!t) return true;
    const M = t.order;
    for (const p of pagesOf(snap).values()) {
      const max = M + (p.over ? 1 : 0);
      if (p.keys.length > max) return `${p.page} holds ${p.keys.length} keys, max ${M}`;
      if (!p.leaf && p.children.length !== p.keys.length + 1) return `${p.page} has ${p.keys.length} keys but ${p.children.length} children`;
      if (p.page === t.root) continue;
      const min = p.leaf ? Math.floor((M + 1) / 2) : Math.floor(M / 2);
      if (p.keys.length < min) return `${p.page} holds ${p.keys.length} keys, min ${min}`;
    }
    return true;
  },
  "all leaves at the same depth": (snap) => {
    const t = treeOf(snap), pages = pagesOf(snap);
    if (!t) return true;
    const depths = new Set();
    const walk = (id, d) => { const p = pages.get(id); if (!p) return; if (p.leaf) depths.add(d); else p.children.forEach((c) => walk(c, d + 1)); };
    walk(t.root, 1);
    if (depths.size > 1) return `leaves at depths ${[...depths]}`;
    if (!depths.has(t.height)) return `leaves at depth ${[...depths]}, height says ${t.height}`;
    return true;
  },
  "separators bound their subtrees": (snap) => {
    const t = treeOf(snap), pages = pagesOf(snap);
    if (!t) return true;
    const walk = (id, lo, hi) => {
      const p = pages.get(id);
      if (!p) return `missing page ${id}`;
      for (const k of p.keys) if (k < lo || k >= hi) return `${k} in ${id} is outside [${lo}, ${hi})`;
      if (p.leaf) return true;
      for (let i = 0; i < p.children.length; i++) {
        const r = walk(p.children[i], i === 0 ? lo : p.keys[i - 1], i === p.keys.length ? hi : p.keys[i]);
        if (r !== true) return r;
      }
      return true;
    };
    return walk(t.root, -Infinity, Infinity);
  },
  "leaf chain lists every key in order": (snap) => {
    const t = treeOf(snap), pages = pagesOf(snap);
    if (!t) return true;
    const keys = [];
    let n = 0;
    for (let p = leftmost(pages, t.root); p; p = p.next ? pages.get(p.next) : null) { keys.push(...p.keys); if (++n > pages.size) return "the leaf chain loops"; }
    if (!increasing(keys)) return `the chain reads [${keys}]`;
    const all = [...pages.values()].filter((p) => p.leaf).reduce((a, p) => a + p.keys.length, 0);
    return keys.length === all || `the chain reaches ${keys.length} of ${all} leaf keys`;
  },
  "the tree holds exactly the keys inserted": (snap) => {
    const t = treeOf(snap);
    if (!t) return true;
    const inTree = [...pagesOf(snap).values()].filter((p) => p.leaf).flatMap((p) => p.keys).sort((a, b) => a - b);
    const want = t.inserted.slice().sort((a, b) => a - b);
    if (inTree.join() !== want.join()) return `leaves hold [${inTree}], inserted [${want}]`;
    if (snap.final && t.pending.length) return `${t.pending.length} keys never inserted`;
    return true;
  },
};

// ---- input ----

/** The keys for given params: an explicit list wins, else n distinct two-digit ids in the chosen order. */
export function keysFor(p) {
  const typed = [...new Set(String(p.input ?? "").split(/[\s,]+/).filter(Boolean).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 99))];
  if (typed.length >= 2) return typed.slice(0, 14);
  const n = Math.max(4, Math.min(14, p.n ?? 10));
  const r = rng(p.seed ?? 7).fork("btree-keys");
  if (p.pattern === "sequential") { const base = r.int(10, 89 - n); return Array.from({ length: n }, (_, i) => base + i); }
  return r.sample(Array.from({ length: 80 }, (_, i) => i + 10), n);
}

// identity colour by value band (10–19, 20–29, …): neighbouring keys share a colour, so sorted order and a range read
// as runs of colour. Decades, unless they give fewer than 3 colours (ids 51–60: pairs then) or more than 8
function bander(keys) {
  const bands = (x) => new Set(keys.map((k) => Math.floor(k / x))).size;
  const w = bands(10) > 8 ? ([20, 50].find((x) => bands(x) <= 8) ?? 50) : bands(10) >= 3 ? 10 : ([5, 2].find((x) => bands(x) >= 3 && bands(x) <= 8) ?? 10);
  return (k) => { const lo = Math.floor(k / w) * w; return `${lo}–${lo + w - 1}`; };
}

const upper = (xs, k) => { let i = 0; while (i < xs.length && xs[i] <= k) i++; return i; };
const list = (xs) => xs.join(" ");

// a scene that records nothing: the same run, to learn its shape (does an inner page ever split?) before narrating
const nullScene = () => new Proxy({}, { get: (_, k) => (k === "rng" ? rng(0) : () => ({})) });

export function build(s, p, scenario, env = {}) {
  const keys = keysFor(p);
  const dry = run(nullScene(), p, scenario, env, keys, null);
  run(s, p, scenario, env, keys, dry);
}

function run(s, p, scenario, env, keys, dry) {
  const M = Math.max(3, Math.min(5, p.order | 0 || 3));
  const sequential = String(p.input ?? "").trim() === "" && p.pattern === "sequential";
  const band = bander(keys);
  const chip = (k) => `{key:${band(k)}|${k}}`;
  const ref = (n) => `{ref:${n.id}|${n.id}}`;
  const portrait = !!env.portrait;
  const stats = { innerSplits: 0, leafSplits: 0 };

  // ---- the model ----
  let pageNo = 0, root = null;
  const rows = [];                                     // rows[level] = page ids left to right (level 0 = leaves)
  const inserted = [], pending = keys.slice();
  const page = (leaf, level) => ({ id: `p${++pageNo}`, leaf, level, keys: [], kids: [], next: null, over: false });
  const height = () => root.level + 1;
  const leaves = () => { const out = []; let n = root; while (!n.leaf) n = n.kids[0]; for (; n; n = n.next) out.push(n); return out; };
  const subOf = (n) => (n === root ? (n.leaf ? "root · leaf" : "root") : n.leaf ? "leaf" : "signposts");
  const state = (n) => ({ page: n.id, leaf: n.leaf, level: n.level, keys: n.keys.slice(), children: n.kids.map((c) => c.id), next: n.next ? n.next.id : null, over: n.over });
  const sync = (...ns) => { for (const n of ns) s.set(n.id, { state: state(n), sub: subOf(n) }); };
  const syncTree = () => s.set("inserts", { state: { root: root.id, order: M, height: height(), inserted: inserted.slice(), pending: pending.slice() } });
  const gauges = () => {
    const ls = leaves();
    s.gauge("height", height());
    s.gauge("pages", pageNo);
    // an overflowing leaf is a moment inside one insert, not a fill level: wait for its split
    if (!ls.some((n) => n.over)) s.gauge("fill", Math.round((100 * ls.reduce((a, n) => a + n.keys.length, 0)) / (ls.length * M)));
  };

  // ---- the world: the insert queue on top, then one row per level, root first ----
  const tray = { cols: M + 1, rows: 1, of: "tile" };
  // landscape: one row per level, root on top, the leaf chain running left to right along the bottom.
  // portrait (a phone): the tree on its side, one column per level, root on the left, the leaf chain running down
  const levelGroup = portrait ? s.column : s.row;
  const levelIn = portrait ? "tree" : "world";
  const down = portrait ? { fromSide: "right", toSide: "left" } : { fromSide: "bottom", toSide: "top" };
  const along = portrait ? { fromSide: "bottom", toSide: "top" } : { fromSide: "right", toSide: "left" };
  const rowGap = (level) => (level === 0 ? (portrait ? 26 : 48) : portrait ? 26 : 44);
  // every step frames the whole tree: its shape is the point
  const step = (caption) => { s.focus("world"); s.step(caption); };
  s.column("world", { gap: portrait ? 40 : 54, align: "center" });
  s.housing("inserts", {
    in: "world", variant: "queue", title: sequential ? "new ids · growing" : "new ids",
    sub: `${keys.length} ids`, tray: { cols: portrait ? Math.ceil(keys.length / 2) : keys.length, of: "tile" },
  });
  for (const k of keys) s.tile(`k${k}`, { in: "inserts", text: k, key: band(k), state: { key: k } });
  const housing = (n, index) => s.housing(n.id, { in: `lvl${n.level}`, index, title: n.id, sub: subOf(n), tray, led: "ok", state: state(n) });
  const edge = (a, b) => s.trace(`e-${a.id}-${b.id}`, a.id, b.id, down);
  const link = (a, b) => s.trace(`ln-${a.id}-${b.id}`, a.id, b.id, along);
  const feed = () => s.trace(`feed-${root.id}`, "inserts", root.id, { fromSide: "bottom", toSide: "top" });

  root = page(true, 0);
  rows[0] = [root.id];
  if (portrait) s.row("tree", { in: "world", gap: 40, align: "center" });
  levelGroup(`lvl0`, { in: levelIn, gap: rowGap(0), align: portrait ? "center" : "start" });
  housing(root);
  feed();
  syncTree();
  gauges();
  // ---- the problem first: with no index, finding one id means checking them one by one ----
  s.phase("Without an index", { about: "Think of a library with no signs and no order: to find one book, you check every spine. A table with no {term:index} works the same way." });
  step(sequential
    ? `${keys.length} orders arrive, each id one bigger than the last. Nothing sorts them yet.`
    : `${keys.length} orders arrive, their ids in no order, like books dropped in a pile.`);
  const tIdx = Math.min(keys.length - 1, Math.floor(keys.length * 0.7)), target = keys[tIdx], checks = tIdx + 1;
  // a marker walks the pile, one id per beat, until the target turns up
  s.pointer("scan", { at: `k${keys[0]}`, text: "check", tone: "busy" });
  for (let k = 1; k <= tIdx; k++) { s.beat(); s.point("scan", `k${keys[k]}`); }
  s.lit(`k${target}`);
  s.tag(`k${target}`, `found: ${fmt.plural(checks, "check")}`);
  s.count("scanned", checks);
  s.focus("inserts");
  s.step(`Without an index, finding ${chip(target)} means checking ids one by one: ${fmt.plural(checks, "check")}.`);

  s.remove("scan", { style: "fade" });
  s.phase("One page", { about: `A B+ tree keeps ids sorted in {term:page|pages}, like books on a shelf. A page here holds ${M} ids. The first page is also the {term:root}, where every search starts.` });

  // ---- one insert: descend, comparing against separators, then land in the leaf in sorted order ----
  let splitPhase = false, insertPhase = false, innerPhase = false;
  function insert(k) {
    const path = [];
    let n = root;
    while (!n.leaf) { const ci = upper(n.keys, k); path.push({ n, ci }); n = n.kids[ci]; }
    const pos = upper(n.keys, k);
    n.keys.splice(pos, 0, k);
    pending.splice(pending.indexOf(k), 1);
    inserted.push(k);
    if (path.length) {
      s.send(s.uid("q"), "inserts", root.id, { key: band(k) });
      path.forEach(({ n: a, ci }) => { s.beat(); s.send(s.uid("q"), a.id, a.kids[ci].id, { key: band(k) }); });
      s.lit(...path.map((e) => e.n.id));
      s.beat();
    }
    s.move(`k${k}`, n.id, { index: pos });
    s.count("reads", path.length + 1);
    n.over = n.keys.length > M;
    if (n.over) { s.set(n.id, { led: "warn" }); s.tag(n.id, `${n.keys.length} ids, room for ${M}`, { tone: "warn" }); }
    sync(n);
    syncTree();
    gauges();
    s.line(path.length ? 3 : 6, 6);
    const where = pos === 0 ? (n.keys.length > 1 ? `in front of ${n.keys[1]}` : "") : pos === n.keys.length - 1 ? `after ${n.keys[pos - 1]}` : `between ${n.keys[pos - 1]} and ${n.keys[pos + 1]}`;
    const tail = n.over ? `, now {tone:warn|over-full}` : where ? `, ${where}` : "";
    if (!path.length) {
      step(`Insert ${chip(k)}: it goes straight into the only page${tail}`);
    } else {
      const cmp = path.map(({ n: a, ci }) => {
        const c = ci === 0 ? `${k} < ${a.keys[0]}` : ci === a.keys.length ? `${k} ≥ ${a.keys[ci - 1]}` : `${a.keys[ci - 1]} ≤ ${k} < ${a.keys[ci]}`;
        return `\`${c}\` at ${ref(a)}`;
      });
      step(`Insert ${chip(k)}: ${cmp.join(", ")}, so into leaf ${ref(n)}${tail}`);
    }
    return { leaf: n, path: path.map((e) => e.n) };
  }

  // ---- a split: new right page, half the keys move, then a separator goes up (or a new root appears) ----
  function split(x, path) {
    const growing = x === root;
    const leaf = x.leaf;
    const R = page(leaf, x.level);
    const at = rows[x.level].indexOf(x.id) + 1;
    rows[x.level].splice(at, 0, R.id);
    let sep, moved;
    if (leaf) {
      const mid = (x.keys.length + 1) >> 1;
      R.keys = x.keys.splice(mid);
      R.next = x.next;
      x.next = R;
      sep = R.keys[0];
      moved = R.keys.slice();
    } else {
      const mid = x.keys.length >> 1;
      sep = x.keys[mid];
      R.keys = x.keys.splice(mid + 1);
      x.keys.pop();
      R.kids = x.kids.splice(mid + 1);
      moved = R.keys.slice();
    }
    x.over = false;
    s.count("splits");
    leaf ? stats.leafSplits++ : stats.innerSplits++;

    // beat 1: the new page (and, for a root split, a new row on top with an empty root)
    let G = null;
    housing(R, at);
    if (growing) {
      G = page(false, x.level + 1);
      rows[G.level] = [G.id];
      levelGroup(`lvl${G.level}`, { in: levelIn, index: portrait ? 0 : 1, gap: rowGap(G.level), align: portrait ? "center" : "start" });
      housing(G, 0);
    }
    s.set(x.id, { led: "busy" });
    s.beat();
    // beat 2: the right half moves over; a leaf relinks the chain, an inner page hands over its children
    moved.forEach((k, j) => s.move(leaf ? `k${k}` : `sep${k}`, R.id, { index: j }));
    if (leaf) {
      if (R.next) s.remove(`ln-${x.id}-${R.next.id}`);
      link(x, R);
      if (R.next) link(R, R.next);
    } else {
      for (const c of R.kids) { s.remove(`e-${x.id}-${c.id}`); edge(R, c); }
    }
    s.beat();
    // beat 3: the separator goes up: copied from a leaf (a new tile), moved out of an inner page
    let P;
    if (growing) {
      P = G;
      G.keys = [sep];
      G.kids = [x, R];
      s.remove(`feed-${root.id}`);
      root = G;
      feed();
      edge(G, x);
      edge(G, R);
    } else {
      P = path.pop();
      const i = P.kids.indexOf(x);
      P.keys.splice(i, 0, sep);
      P.kids.splice(i + 1, 0, R);
      edge(P, R);
    }
    const si = P.keys.indexOf(sep);
    if (leaf) s.spawn(`sep${sep}`, { from: `k${sep}`, in: P.id, index: si, text: sep, key: band(sep), state: { key: sep } });
    else s.move(`sep${sep}`, P.id, { index: si });
    P.over = P.keys.length > M;
    s.set(x.id, { led: "ok" });
    if (P.over) { s.set(P.id, { led: "warn" }); s.tag(P.id, `${P.keys.length} ids, room for ${M}`, { tone: "warn" }); }
    else if (growing) s.tag(G.id, `height ${height() - 1} → ${height()}`, { tone: "ok" });
    sync(x, R, P);
    syncTree();
    gauges();
    s.line(leaf ? 9 : 14, leaf ? 12 : 17);

    // a leaf keeps its ids and sends a copy up; a signpost page hands its middle id up and keeps it no more
    const half = `${fmt.and(R.keys.map(String))} ${R.keys.length === 1 ? "moves" : "move"} to ${leaf ? "leaf" : "page"} ${ref(R)}`;
    const up = leaf ? `${chip(sep)} is copied up` : `${chip(sep)} moves up`;
    const over = P.over ? `, now {tone:warn|over-full}` : "";
    step(`${ref(x)} splits: ${half}; ${up} ${growing ? "into a new root" : `to ${ref(P)}`}${over}.`);
    return P;
  }

  // ---- the run ----
  const willInnerSplit = !!dry && dry.innerSplits > 0;
  for (const k of keys) {
    if (splitPhase && !insertPhase) {
      insertPhase = true;
      s.phase("Descend", { about: "To insert an id, start at the root and follow its signposts down, one page per level, to the one leaf where the id belongs." +
        (sequential ? " Ids that only grow always take the rightmost path, so only the right edge fills." : "") });
      // the misconception: "a search checks every page"
      if (pageNo > height()) {
        s.ask(`Where does ${k} go? How many pages must be read to find out?`,
          [`${height()}: one page per level`, `All ${pageNo} pages, to be sure`, "Only 1: it goes straight to a leaf"], 0,
          { why: `The root's signposts point to exactly one page below it, so the search reads one page per level: ${height()} here.` });
      }
    }
    const { leaf, path } = insert(k);
    let x = leaf;
    while (x.over) {
      if (x.leaf && !splitPhase) {
        splitPhase = true;
        s.phase("Leaf split", { about: "A full {term:leaf} splits into two half-full leaves, like one crowded shelf becoming two. The right leaf's first id is copied up as a signpost, a {term:separator}: smaller ids go left, the rest right." });
        if (!willInnerSplit) {
          s.ask(`${x.id} holds ${x.keys.length} ids, but a page fits ${M}. What happens to it?`,
            ["It splits into two half-full pages", "The new id gets a page of its own", `The page grows to fit ${x.keys.length}`], 0,
            { why: "A page has a fixed size on disk, so it cannot grow. Splitting it in half leaves room in both halves for later ids." });
        }
      }
      if (!x.leaf && !innerPhase) {
        innerPhase = true;
        s.phase(x === root ? "Root split" : "Signpost split", { about: "A signpost page that is over-full splits too, and its middle id moves up out of it. When the root splits, a new root appears on top: the tree grows at the top, never at the bottom." });
        // the misconception: "the tree grows at the bottom"
        if (x === root) {
          s.ask(`${x.id} is the top page, and it is over-full too. Where does the tree get its new level?`,
            ["At the bottom: the leaves go a level deeper", "At the top: a new root appears above it", `Nowhere: ${x.id} just keeps ${x.keys.length} ids`], 1,
            { why: `${x.id} splits and its middle id moves up into a brand-new root. So every leaf stays equally deep.` });
        } else {
          s.ask(`${x.id} is a signpost page, and it is over-full too. What happens to it?`,
            ["It splits, and its middle id moves up to the page above", "Its extra id moves down into a leaf", `Nothing: it just keeps ${x.keys.length} ids`], 0,
            { why: "Signpost pages split like leaves. Their middle id moves up instead of being copied, since the leaves already hold every id." });
        }
      }
      x = split(x, path);
    }
  }

  // ---- summary ----
  const ls = leaves();
  const fill = Math.round((100 * keys.length) / (ls.length * M));
  s.focus("world");
  s.lit(...ls.map((n) => n.id));
  s.line(null);
  const minLeaf = Math.floor((M + 1) / 2);
  const thin = ls.slice(0, -1).filter((n) => n.keys.length === minLeaf).length;
  step(sequential && ls.length > 2 && thin > 0
    ? `All ${keys.length} ids are in, but ${thin} of ${ls.length} leaves sit half full: new ids never land there.`
    : `All ${keys.length} ids are in. Finding any one now reads ${fmt.plural(height(), "page")}; the pile took ${fmt.plural(checks, "check")}.`);

  if (!p.scan) return { ...stats };

  // ---- range scan: descend once to lo, then follow the leaf chain ----
  const sorted = keys.slice().sort((a, b) => a - b);
  const i0 = Math.floor(sorted.length * 0.3), i1 = Math.min(sorted.length - 1, i0 + 4);
  const lo = Math.max(i0 > 0 ? sorted[i0 - 1] + 1 : 1, Math.floor(sorted[i0] / 5) * 5);
  const hi = Math.min(i1 < sorted.length - 1 ? sorted[i1 + 1] - 1 : 99, Math.ceil(sorted[i1] / 5) * 5);
  s.phase("Range scan", { about: "To find every id in a range, go down once, to the first one. The leaves are linked left to right, like shelves side by side, so the search then walks along them." });
  s.set("inserts", { title: "find", sub: `ids ${lo}–${hi}` });
  const path = [];
  let n = root;
  while (!n.leaf) { const ci = upper(n.keys, lo); path.push({ n, ci }); n = n.kids[ci]; }
  s.send(s.uid("q"), "inserts", root.id, { key: band(lo) });
  path.forEach(({ n: a, ci }) => { s.beat(); s.send(s.uid("q"), a.id, a.kids[ci].id, { key: band(lo) }); });
  s.lit(...path.map((e) => e.n.id), n.id);
  let reads = path.length + 1;
  s.count("reads", path.length + 1);
  const found = [];
  // a page read: its matches light up, the keys it rules out dim
  const take = (leaf) => {
    const hits = leaf.keys.filter((k) => k >= lo && k <= hi);
    for (const k of leaf.keys) if (!hits.includes(k)) s.set(`k${k}`, { dim: true });
    if (hits.length) s.lit(...hits.map((k) => `k${k}`));
    found.push(...hits);
    return { hits, done: leaf.keys.some((k) => k > hi) || !leaf.next };
  };
  s.beat();
  let r = take(n);
  s.line(28);
  step(`Find ids ${lo} to ${hi}: going down reads ${fmt.plural(path.length + 1, "page")} to leaf ${ref(n)}` +
    (r.hits.length ? `, where ${list(r.hits)} match` : `, where nothing matches yet`));
  let hop = 0;
  while (!r.done) {
    const next = n.next;
    if (!hop++) {
      s.ask(`${n.id} is used up, and the range goes on. How does the search reach the next ids?`,
        ["It walks along to the next leaf", "It climbs back up to the page above", "It starts again from the root"], 0,
        { why: "Each leaf keeps a link to the next one, so the search walks sideways and never re-reads the pages above." });
    }
    s.send(s.uid("q"), n.id, next.id, { key: band(lo) });
    s.beat();
    s.lit(next.id);
    s.count("reads");
    reads++;
    n = next;
    r = take(n);
    s.line(29, 33);
    const stop = n.keys.find((k) => k > hi);
    step(`Walk on to leaf ${ref(n)}` + (r.hits.length ? `: ${list(r.hits)} match` : "") +
      (stop !== undefined ? `${r.hits.length ? "; " : ": "}${stop} is past ${hi}, so the search stops` : !n.next ? ", the last leaf" : ""));
  }
  for (const l of leaves()) for (const k of l.keys) if (!found.includes(k)) s.set(`k${k}`, { dim: true });
  s.focus("world");
  s.lit(...found.map((k) => `k${k}`));
  s.line(null);
  step(`${fmt.plural(found.length, "id")} found with ${fmt.plural(reads, "page read")}: ${path.length + 1} going down, ${reads - path.length - 1} walking along the leaves.`);
  return { ...stats };
}
