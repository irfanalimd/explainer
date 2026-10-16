// B+ tree insert and split: a real B+ tree of order MAX_KEYS (Comer 1979, section 3). Keys live only in the leaves;
// inner pages hold separators that route searches; leaves are chained left to right. Every insert descends from the
// root (one page read per level), lands in the one leaf where the key belongs, and an overflowing page splits: a leaf
// copies its right half's first key up, an inner page pushes its middle key up, and a root split grows the tree a
// level at the top. A range scan at the end descends once and then walks the leaf chain.

import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "B+ tree",
  subtitle: "Inserting keys, splitting pages, growing at the root",
  kicker: "Databases",
  fig: 7,
  cite: { text: "D. Comer, “The Ubiquitous B-Tree”, ACM Computing Surveys, 1979", url: "https://doi.org/10.1145/356770.356776" },
  theme: "dark",
};

export const params = {
  order: { label: "Max keys per page", type: "int", min: 3, max: 5, value: 3 },
  n: { label: "Keys to insert", type: "int", min: 4, max: 14, value: 10 },
  pattern: {
    label: "Insert order", type: "select", value: "random",
    options: [{ value: "random", label: "Random ids" }, { value: "sequential", label: "Auto-increment ids" }],
  },
  input: { label: "Keys (overrides)", type: "text", value: "" },
  scan: { label: "Range scan at the end", type: "bool", value: true },
  seed: { label: "Seed", type: "int", value: 7 },
};

export const scenarios = [
  { id: "random", label: "Random inserts", params: { pattern: "random" },
    description: "Keys arrive in random order, land in leaves all over the tree, and full pages split to make room." },
  { id: "sequential", label: "Sequential inserts", params: { pattern: "sequential" },
    description: "Ids arrive in increasing order, so every insert takes the rightmost path and splits leave half-full leaves behind." },
  // chosen so every split leaves two half-full leaves: the fifth leaf overflows the root at the 10th insert
  { id: "rootsplit", label: "Root split", params: { order: 3, input: "41 18 63 29 75 52 11 24 84 89 57 35" },
    description: "Small pages fill fast: a leaf split overflows the root, and the tree grows a new level at the top." },
];

export const counters = {
  height: { label: "tree height", short: "height", format: "int", primary: true,
    hint: "Levels from the root down to the leaves. Every lookup reads one page per level." },
  pages: { label: "pages", format: "int",
    hint: "Pages the tree uses, inner pages and leaves together." },
  reads: { label: "page reads", format: "int",
    hint: "Pages read to find where each key belongs: one per level, for every insert." },
  splits: { label: "page splits", short: "splits", format: "int", primary: true,
    hint: "Times a full page split in two to make room for a key." },
  fill: { label: "leaf fullness", short: "leaf fill", format: "pct", primary: ["sequential"],
    hint: "How full the leaf pages are on average. Emptier leaves waste disk space and cache." },
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
  const subOf = (n) => (n === root ? (n.leaf ? "root · leaf" : "root") : n.leaf ? "leaf" : "inner");
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
    in: "world", variant: "queue", title: sequential ? "insert · auto-increment" : "insert",
    sub: `${keys.length} keys`, tray: { cols: portrait ? Math.ceil(keys.length / 2) : keys.length, of: "tile" },
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
  s.phase("One page", { about: `An empty tree is a single page that is both the root and a leaf. A page here fits ${M} keys; until it is full, an insert only keeps the page sorted.` });
  step(sequential
    ? `An index on \`orders.id\`: ${keys.length} auto-increment ids to insert, ${M} keys per page`
    : `An index on \`orders.id\`: ${keys.length} ids to insert into a B+ tree with ${M} keys per page`);

  // ---- one insert: descend, comparing against separators, then land in the leaf in sorted order ----
  let splitPhase = false, insertPhase = false, innerPhase = false, asked = 0;
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
    if (n.over) { s.set(n.id, { led: "warn" }); s.tag(n.id, `${n.keys.length} keys > ${M}`, { tone: "warn" }); }
    sync(n);
    syncTree();
    gauges();
    s.line(path.length ? 3 : 6, 6);
    const where = pos === 0 ? (n.keys.length > 1 ? `in front of ${n.keys[1]}` : "") : pos === n.keys.length - 1 ? `after ${n.keys[pos - 1]}` : `between ${n.keys[pos - 1]} and ${n.keys[pos + 1]}`;
    const tail = n.over ? `, and ${ref(n)} {tone:warn|overflows} to ${n.keys.length} keys` : where ? `, ${where}` : "";
    if (!path.length) {
      step(`Insert ${chip(k)}: the root is the only page, so it goes straight in${tail}`);
    } else {
      const cmp = path.map(({ n: a, ci }) => {
        const c = ci === 0 ? `${k} < ${a.keys[0]}` : ci === a.keys.length ? `${k} ≥ ${a.keys[ci - 1]}` : `${a.keys[ci - 1]} ≤ ${k} < ${a.keys[ci]}`;
        return `\`${c}\` at ${ref(a)}`;
      });
      step(`Insert ${chip(k)}: ${cmp.join(", ")}; it lands in leaf ${ref(n)}${tail}`);
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
    if (P.over) { s.set(P.id, { led: "warn" }); s.tag(P.id, `${P.keys.length} keys > ${M}`, { tone: "warn" }); }
    else if (growing) s.tag(G.id, `height ${height() - 1} → ${height()}`, { tone: "ok" });
    sync(x, R, P);
    syncTree();
    gauges();
    s.line(leaf ? 9 : 14, leaf ? 12 : 17);

    const half = `${list(R.keys)} ${R.keys.length === 1 ? "moves" : "move"} to new ${leaf ? "leaf" : "page"} ${ref(R)}`;
    const up = leaf ? `${chip(sep)} is **copied** up` : `${chip(sep)} is **pushed** up`;
    const dest = growing ? `into new root ${ref(G)}: ${height()} levels now` : `to ${ref(P)}`;
    const over = P.over ? `, which {tone:warn|overflows}` : "";
    step(`${ref(x)} splits: ${half}; ${up} ${dest}${over}`);
    return P;
  }

  // ---- the run ----
  const willInnerSplit = !!dry && dry.innerSplits > 0;
  for (const k of keys) {
    if (splitPhase && !insertPhase) {
      insertPhase = true;
      s.phase("Descend", { about: sequential
        ? "Each insert reads one page per level, comparing the key with the separators. Ascending ids always take the rightmost path, so only the right edge of the tree ever fills."
        : "Each insert reads one page per level, comparing the key with the separators to choose a child, until it reaches the one leaf where the key belongs." });
    }
    const { leaf, path } = insert(k);
    let x = leaf;
    while (x.over) {
      if (x.leaf && !splitPhase) {
        splitPhase = true;
        s.phase("Leaf split", { about: "A full leaf splits into two half-full pages. The right page's smallest key is copied up to the parent as a separator, and the leaf chain is relinked around the new page." });
        if (!willInnerSplit && !asked) {
          asked++;
          s.ask(`${x.id} holds ${x.keys.length} keys, but a page fits ${M}. What happens to it?`,
            ["It splits into two half-full leaves", "The extra key goes to an overflow page", "The page grows to make room"], 0);
        }
      }
      if (!x.leaf && !innerPhase) {
        innerPhase = true;
        s.phase(x === root ? "Root split" : "Inner split", { about: "An inner page that overflows splits too, but its middle key is pushed up rather than copied: separators only route searches. When the root splits, a new root appears above it and the tree grows one level, at the top." });
        if (asked < 2) {
          asked++;
          s.ask(`${x.id} now holds ${x.keys.length} separators, one too many. What happens?`,
            [`It splits and pushes its middle key up${x === root ? " into a new root" : ""}`, "It splits and copies its middle key up, like a leaf", "It keeps the extra key in an overflow page"], 0);
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
  step(sequential && ls.length > 2
    ? `All ${keys.length} ids are in: ${height()} levels, ${pageNo} pages. ${thin} of ${ls.length} leaves were left half full and never fill again: ${fill}% on average`
    : `All ${keys.length} keys are in: ${height()} levels, ${pageNo} pages, ${ls.length} leaves ${fill}% full on average`);

  if (!p.scan) return { ...stats };

  // ---- range scan: descend once to lo, then follow the leaf chain ----
  const sorted = keys.slice().sort((a, b) => a - b);
  const i0 = Math.floor(sorted.length * 0.3), i1 = Math.min(sorted.length - 1, i0 + 4);
  const lo = Math.max(i0 > 0 ? sorted[i0 - 1] + 1 : 1, Math.floor(sorted[i0] / 5) * 5);
  const hi = Math.min(i1 < sorted.length - 1 ? sorted[i1 + 1] - 1 : 99, Math.ceil(sorted[i1] / 5) * 5);
  s.phase("Range scan", { about: "Leaves are linked left to right, so a range query descends once, to the leaf where its first key would be, then walks the leaf chain sideways instead of climbing back up the tree." });
  s.set("inserts", { title: "query", sub: `id ${lo}–${hi}` });
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
  step(`\`WHERE id BETWEEN ${lo} AND ${hi}\`: one descent of ${fmt.plural(path.length + 1, "page read")} reaches leaf ${ref(n)}` +
    (r.hits.length ? `, where ${list(r.hits)} match` : `, where nothing matches yet`));
  let hop = 0;
  while (!r.done) {
    const next = n.next;
    if (!hop++ && asked < 2) {
      asked++;
      s.ask(`${ref(n)} is used up and the range goes on. How does the scan reach the next keys?`,
        ["It follows the leaf chain sideways", "It climbs back up to the parent", "It descends again from the root"], 0);
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
    step(`The chain leads to ${ref(n)}` + (r.hits.length ? `: ${list(r.hits)} match` : "") +
      (stop !== undefined ? `${r.hits.length ? "; " : ": "}${stop} > ${hi}, so the scan stops` : !n.next ? ", the last leaf" : ""));
  }
  for (const l of leaves()) for (const k of l.keys) if (!found.includes(k)) s.set(`k${k}`, { dim: true });
  s.focus("world");
  s.lit(...found.map((k) => `k${k}`));
  s.line(null);
  step(`${fmt.plural(found.length, "key")} found with ${fmt.plural(reads, "page read")}: ${path.length + 1} down the tree, ${reads - path.length - 1} along the chain`);
  return { ...stats };
}
