// Linked list, for someone meeting it for the first time. The same numbers live in an array (one block, side by side)
// and in a singly linked list (one node per number, anywhere in memory, each holding the address of the next). The
// run really does each operation: the array slides its items one slot at a time; each node's `next` holds a real
// address, every line on the floor is one of those fields, and a walk really follows them from `head`.
// Nodes sit at fixed spots in a free layout and never move: that is the whole point.
// The words live in lesson.mjs, keyed by the step ids below; every step passes the run values its words need
// (vars), and keeps a plain caption as the fallback.

import * as fmt from "../../sim/fmt.mjs";
import { stateOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "Linked list",
  subtitle: "Items that point to the next one, so inserting moves nothing",
  kicker: "Data structures",
  fig: 8,
  level: "intro",
  cite: "[knuth1] §2.2.3",
  theme: "light",
  hook: "Putting a number in the middle of an array means sliding everything after it over. Can we insert without moving anything?",
  takeaway: "A linked list never moves its items, because an insert only changes two arrows. It pays for that with a walk from head and an extra address in every node.",
  terms: {
    address: "The number that says where something is stored in memory, like a house number, such as 0x7f3a_2c10.",
    node: "One item of a linked list: a little box holding a value and the address of the next box.",
    pointer: "A value that holds a memory address, so it says where something else lives. Drawn here as an arrow.",
    head: "A variable holding the address of the first box. Every trip through the list starts there.",
    null: "A special value meaning “no address”. When next holds it, nothing comes after: the list ends.",
  },
  recap: [
    "The array had to slide every later item over to make room.",
    "A node holds a value and `next`, the address of the next node.",
    "Inserting changed two arrows, in the right order. Nothing moved.",
    "Reaching the spot meant following arrows from head, one at a time.",
  ],
};

export const params = {
  n: { label: "List length", type: "int", min: 5, max: 7, value: 5 },
  at: { label: "Insert after item", type: "int", min: 1, max: 4, value: 2 },
};

const FIND = 5;   // "Find the 5th item"

export const scenarios = [
  { id: "insert", label: "Insert in the middle", whatIf: "we insert in the middle",
    description: "An array slides items over to make room, while the linked list changes two arrows and moves nothing." },
  { id: "find", label: "Find the 5th item", whatIf: "we look for the 5th item",
    description: "An array works out where the 5th item is, while the linked list has to walk there, arrow by arrow.",
    takeaway: "An array finds item k with one calculation. A linked list has no shortcut, so it follows k − 1 arrows from head.",
    recap: [
      "The array found the item with one sum, start + (k − 1) × 4.",
      "A node's address is written only in the node before it.",
      "So the list walked from head, one arrow per item.",
    ] },
  { id: "wrong", label: "Arrows in the wrong order", whatIf: "the arrows change in the wrong order",
    description: "The same insert with its two arrow changes swapped, which cuts off the rest of the list and loses it.",
    start: "Wrong order",
    takeaway: "Before you overwrite an arrow, save where it pointed. Point the new node onward first, and only then point the old node at it.",
    recap: [
      "Changing the old arrow first erased the only copy of the next address.",
      "The new node then pointed at itself, and the rest of the list was lost.",
      "In the right order the new node saves the address first, and nothing is lost.",
    ] },
];

export const counters = {
  moved: { label: "items moved", short: "moved", format: "int", primary: ["insert", "wrong"],
    hint: "Items that had to slide to a new place in memory. The array pays this; the linked list never does." },
  hops: { label: "arrows followed", short: "arrows", format: "int", primary: ["find"],
    hint: "Times we read a node's next address and went there, to reach the spot we need." },
  rewired: { label: "arrows changed", short: "changed", format: "int", primary: ["insert"],
    hint: "Next addresses that were overwritten. Putting one node in the middle changes two." },
  lost: { label: "nodes lost", short: "lost", format: "int", primary: ["wrong"],
    hint: "Nodes that no arrow leads to any more. The program can never reach them again." },
};

export const code = {
  lang: "python",
  source: [
    "class Node:",
    "    def __init__(self, value):",
    "        self.value = value",
    "        self.next = None          # address of the next node",
    "",
    "def walk(head, k):               # reach the k-th node",
    "    cur = head",
    "    for _ in range(k - 1):",
    "        cur = cur.next            # follow one arrow",
    "    return cur",
    "",
    "def insert_after(prev, value):",
    "    new = Node(value)             # anywhere in memory",
    "    new.next = prev.next          # 1. new points at the rest",
    "    prev.next = new               # 2. prev points at new",
  ].join("\n"),
};

// ---- the data: real-looking values and heap addresses (16-byte nodes, in no particular order) ----
const VALUES = [31, 12, 48, 17, 23, 56, 9];
const ADDRS = [0x7f3a2c10, 0x7f3a4e80, 0x7f3a1b20, 0x7f3a3d40, 0x7f3a6f00, 0x7f3a0a90, 0x7f3a5e60];
const NEW = { value: 42, addr: 0x7f3a5a30 };
const ARRAY_AT = 0x7f3a1000, INT = 4;   // the array: 4-byte ints from this address
const hex = (a) => fmt.hex(a, 8);
const ordinal = (k) => `${k}${k === 1 ? "st" : k === 2 ? "nd" : k === 3 ? "rd" : "th"}`;
const listOf = (xs) => xs.map((v) => fmt.key(v)).join(" → ");
// lesson var kinds (CONTRACTS.md 10.1): a value prints as a key chip, an address as code
const K = (v) => ({ key: v });
const A = (addr) => ({ code: hex(addr) });

// ---- invariants: they read the model each node publishes in its inspector state ----
const nodesOf = (snap) => {
  const m = new Map();
  for (const r of snap.entities.values()) if (r.kind === "housing" && r.state && r.state.addr) m.set(r.state.addr, { id: r.id, ...r.state });
  return m;
};
/** Follow the published next addresses from head: the values seen, and where it loops (if it does). */
const walkFrom = (snap, limit = 20) => {
  const head = stateOf(snap, "head");
  if (!head) return null;
  const nodes = nodesOf(snap), seen = [], ids = new Set();
  for (let a = head.next; a !== null && seen.length < limit; ) {
    const n = nodes.get(a);
    if (!n) return { error: `an arrow leads to ${hex(a)}, where there is no node` };
    if (ids.has(n.id)) return { seen, cycle: n.id };
    ids.add(n.id);
    seen.push(n);
    a = n.next;
  }
  return { seen };
};

export const invariants = {
  "every next tile shows its node's real next address": (snap) => {
    for (const n of nodesOf(snap).values()) {
      const tile = snap.entities.get(`${n.id}.next`);
      const want = n.next === null ? "null" : hex(n.next);
      if (tile && tile.text !== want) return `${n.id}'s next tile reads ${tile.text}, but its next is ${want}`;
    }
    return true;
  },
  // `expect` is what the story says the list is at this point (the values, and whether it now loops): the pointer
  // updates must really produce it
  "walking from head reads the list the story says": (snap) => {
    const head = stateOf(snap, "head");
    if (!head) return true;
    const w = walkFrom(snap);
    if (w.error) return w.error;
    const got = w.seen.map((n) => n.value).join(" ");
    if (got !== head.expect.join(" ")) return `walking from head reads [${got}], the story says [${head.expect.join(" ")}]`;
    if (!!w.cycle !== !!head.loops) return w.cycle ? `the walk loops back to ${w.cycle}` : "the story says the walk loops, but it ends";
    return true;
  },
  "a node is reachable from head unless it is marked lost": (snap) => {
    const w = walkFrom(snap);
    if (!w || w.error) return true;
    const reach = new Set(w.seen.map((n) => n.id));
    for (const n of nodesOf(snap).values()) {
      if (n.fresh) continue;   // a new node, made but not linked in yet
      if (reach.has(n.id) === !!n.lost) return n.lost ? `${n.id} is marked lost but head reaches it` : `${n.id} cannot be reached from head and is not marked lost`;
    }
    return true;
  },
  "the array shows exactly the values it holds, in order": (snap) => {
    const arr = snap.entities.get("arr");
    const st = stateOf(snap, "arr");
    if (!arr || !st) return true;
    const shown = arr.children.map((id) => snap.entities.get(id)?.text ?? "");
    return shown.join(" ") === st.slots.map((v) => (v === null ? "" : String(v))).join(" ") ? true : `the array shows [${shown}] but holds [${st.slots}]`;
  },
};

export function build(s, p, scenario, env = {}) {
  const n = Math.max(5, Math.min(7, p.n | 0 || 5));
  const k = Math.max(1, Math.min(4, p.at | 0 || 2));            // insert after item k (1-based)
  const portrait = !!env.portrait;
  const sc = scenario ?? "insert";
  // every step of the list frames the whole world, the array and the chain from head to null, because the lesson is
  // "follow the arrows from head" (a close-up of the nodes at work would cut off head, or leave the array half
  // under the header)
  const list = "world";

  // ---- the model ----
  const nodes = VALUES.slice(0, n).map((value, i) => ({ id: `n${i}`, value, addr: ADDRS[i], next: null, lost: false, fresh: false, spot: null }));
  nodes.forEach((x, i) => { x.next = i + 1 < n ? nodes[i + 1].addr : null; });
  const byAddr = new Map(nodes.map((x) => [x.addr, x]));
  let expect = nodes.map((x) => x.value), loops = false;
  const syncHead = () => s.set("head", { state: { next: nodes[0].addr, expect: expect.slice(), loops } });
  const syncNode = (x) => s.set(x.id, { state: { addr: x.addr, value: x.value, next: x.next, lost: x.lost, fresh: x.fresh, spot: x.spot } });

  // ---- the run values the lesson's words use; a step adds its own (a slide's value, a hop's two nodes) ----
  const V = { n, first: K(nodes[0].value), second: K(nodes[1].value), secondAddr: A(nodes[1].addr), others: n - 1, lastId: nodes[n - 1].id, arr: A(ARRAY_AT) };
  if (sc === "find") Object.assign(V, { find: FIND, findth: ordinal(FIND), findAt: A(ARRAY_AT + (FIND - 1) * INT), findV: K(nodes[FIND - 1].value),
    findPrev: K(nodes[FIND - 2].value), findHops: FIND - 1, findId: nodes[FIND - 1].id });
  else Object.assign(V, { k, kth: ordinal(k), new: K(NEW.value), newAddr: A(NEW.addr), prev: K(nodes[k - 1].value), prevId: nodes[k - 1].id,
    after: K(nodes[k].value), afterId: nodes[k].id, moved: n - k, hops: k - 1 });
  if (sc === "wrong") Object.assign(V, { lost: nodes.slice(k).map((x) => K(x.value)), lostN: n - k });   // what the wrong order cuts off
  const step = (id, caption, vars = {}, o = {}) => s.step(caption, { ...o, id, vars: { ...V, ...vars } });

  // ---- the world: the array on top, memory below ----
  s.column("world", { gap: portrait ? 56 : 64, align: "center" });

  // the array: one block of memory, 4 bytes per item, one free slot at the end
  const slots = VALUES.slice(0, n).concat(sc === "find" ? [] : [null]);   // a free slot to insert into
  const cells = slots.map((_, i) => `a${i}`);
  s.container("arr", { in: "world", axis: "x", label: `array · one block at ${hex(ARRAY_AT)}`, indices: true });
  slots.forEach((v, i) => s.tile(cells[i], v === null ? { in: "arr", text: "", tone: "ghost" } : { in: "arr", text: v, key: v, state: { value: v } }));
  const syncArr = () => s.set("arr", { state: { slots: slots.slice() } });
  syncArr();

  // memory: every node gets a fixed spot (it never moves), jittered so the nodes read as scattered. On a desktop a
  // list of 6 or 7 folds into two rows, the second running back right to left, so the whole chain from head to null
  // fits beside the explain panel at a readable size.
  const X = 150, Y = 128, Y2 = 220;
  const jitter = [-14, 22, -8, 26, -18, 12, -4];
  const snake = !portrait && n > 5, turn = Math.ceil(n / 2);   // the first node of the second row
  const rowOf = (i) => (snake && i >= turn ? 1 : 0);
  const spotOf = (i) => (portrait ? [Math.round(jitter[i] * 1.4), i * Y]
    : !snake ? [i * X, jitter[i]]
    : i < turn ? [i * X, Math.round(jitter[i] / 2)] : [(2 * turn - 1 - i) * X, Y2 + Math.round(jitter[i] / 2)]);
  nodes.forEach((x, i) => { x.spot = spotOf(i); });
  const headSpot = portrait ? [0, -Y] : [-X, 0];
  // a new node goes beside the gap between item k and item k + 1: below a single row; in two rows, above a gap in the
  // first, beside the turn, or below a gap in the second
  const gap = portrait ? "side" : !snake || rowOf(k) === 1 && rowOf(k - 1) === 1 ? "below" : rowOf(k) === 0 ? "above" : "turn";
  const newSpot = (() => {
    const [ax, ay] = spotOf(k - 1), [bx, by] = spotOf(k);
    return gap === "side" ? [Math.max(ax, bx) + 168, Math.round((ay + by) / 2)]
      : gap === "above" ? [Math.round((ax + bx) / 2), Math.min(ay, by) - 150]
      : gap === "turn" ? [ax + X + 10, Math.round((ay + by) / 2)]
      : [Math.round((ax + bx) / 2), Math.max(ay, by) + 150];
  })();

  // every next pointer is a trace in the colour of the node it leads to
  const S = (fromSide, toSide) => ({ fromSide, toSide });
  const alongOf = (a, b) => (portrait ? S("bottom", "top") : rowOf(a) !== rowOf(b) ? S("bottom", "top") : rowOf(a) ? S("left", "right") : S("right", "left"));
  const along = alongOf(0, 0);
  const backward = snake && rowOf(k) === 1 && rowOf(k - 1) === 1;   // the second row runs right to left
  const toNew = { side: S("right", "top"), above: S("top", "left"), turn: S("right", "top"), below: backward ? S("bottom", "right") : S("bottom", "left") }[gap];
  const fromNew = { side: S("bottom", "right"), above: S("right", "top"), turn: S("bottom", "right"), below: backward ? S("left", "bottom") : S("right", "bottom") }[gap];
  // a pointer has a direction, so every trace ends in an arrow at the node it leads to; a node that points at
  // itself gets a loop (the default sides of a self-trace)
  const arrows = new Map();   // node id -> the trace drawing its next pointer
  const arrow = (from, to) => {
    const id = `${from.id}->${to.id}`;
    const sides = from === to ? {} : to.id === "nx" ? toNew : from.id === "nx" ? fromNew : alongOf(nodes.indexOf(from), nodes.indexOf(to));
    s.trace(id, from.id, to.id, { ...sides, key: to.value, arrow: true });
    arrows.set(from.id, id);
  };
  const unarrow = (from) => { const id = arrows.get(from.id); if (id) { s.remove(id); arrows.delete(from.id); } };
  const nodeHousing = (x) => {
    s.housing(x.id, { in: "mem", at: x.spot, title: hex(x.addr), tray: { cols: 1 }, state: { addr: x.addr, value: x.value, next: x.next, lost: false, fresh: x.fresh, spot: x.spot } });
    s.tile(`${x.id}.val`, { in: x.id, text: x.value, sub: "value", key: x.value, w: 76 });
    s.tile(`${x.id}.next`, { in: x.id, text: x.next === null ? "null" : hex(x.next), sub: "next", w: 76, ...(x.next === null ? { tone: "ghost" } : {}) });
  };
  const setNext = (x, addr) => {
    x.next = addr;
    s.set(`${x.id}.next`, addr === null ? { text: "null", tone: "ghost" } : { text: hex(addr), tone: null });
    syncNode(x);
  };

  // ---- chapter 1: the array (the cost the list avoids, or the trick it cannot do) ----
  s.focus("arr");
  if (sc === "find") {
    const at = ARRAY_AT + (FIND - 1) * INT;
    s.phase("Arrays jump", { id: "array", about: `An array keeps its items side by side, ${INT} bytes each. So item k sits at start + (k − 1) × ${INT}: one sum finds it.` });
    step("jump.where", `An array of ${n} numbers, side by side from ${fmt.code(hex(ARRAY_AT))}. Where is the ${ordinal(FIND)} item?`);
    s.lit(cells[FIND - 1]);
    s.tag(cells[FIND - 1], `\`${hex(ARRAY_AT)} + ${FIND - 1} × ${INT} = ${hex(at)}\``);
    s.focus("arr");
    step("jump.sum", `Start + ${FIND - 1} × ${INT} bytes: one calculation, one jump. The ${ordinal(FIND)} item is ${fmt.key(slots[FIND - 1])}.`);
  } else {
    s.phase("Arrays shift", { id: "array", about: "An array keeps its items side by side in one block of memory, with no gaps. To open a gap, every item after it must slide over one slot." });
    step("array.goal", `${n} numbers side by side, plus one free slot. We want ${fmt.key(NEW.value)} right after ${fmt.key(slots[k - 1])}.`);
    for (let i = n - 1; i >= k; i--) {
      const v = slots[i];
      s.move(cells[i], "arr", { index: i + 1 });
      [cells[i], cells[i + 1]] = [cells[i + 1], cells[i]];
      [slots[i], slots[i + 1]] = [slots[i + 1], slots[i]];
      syncArr();
      s.count("moved");
      // the first slide says why it starts at the end; the rest share one shape, so they speed up
      step("array.slide", i === n - 1 ? `Start at the end: ${fmt.key(v)} slides one slot to the right, into the free slot.` : `${fmt.key(v)} slides one slot to the right`, { v: K(v) });
    }
    s.set(cells[k], { text: NEW.value, key: NEW.value, tone: null, state: { value: NEW.value } });
    slots[k] = NEW.value;
    syncArr();
    s.focus("arr");
    step("array.drop", `${fmt.key(NEW.value)} drops into the gap. Inserting one number moved ${fmt.plural(n - k, "other")}.`);
  }

  // ---- chapter 2: what a node is ----
  s.free("mem", { in: "world", title: "memory" });   // made here, so no empty zone waits through chapter 1
  s.phase("Boxes and arrows", { id: "nodes", about: "Think of a treasure hunt: each clue says where the next clue is hidden. A linked list gives each item its own {term:node}, anywhere in memory." });
  nodeHousing(nodes[0]);
  s.focus("n0");
  step("nodes.one", `A {term:node}: the value ${fmt.key(nodes[0].value)}, plus \`next\`, the {term:address} where the next node lives.`);
  nodes.slice(1).forEach(nodeHousing);
  s.focus(list);
  step("nodes.scattered", `The other ${n - 1} nodes sit wherever memory had room, not side by side. Each label is its address.`);
  arrow(nodes[0], nodes[1]);
  s.beat();
  nodes.slice(1, -1).forEach((x, i) => arrow(x, nodes[i + 2]));
  s.focus(list);
  step("nodes.pointer", `${fmt.key(nodes[0].value)}'s \`next\` holds ${fmt.code(hex(nodes[1].addr))}, ${fmt.key(nodes[1].value)}'s address. A stored address is a {term:pointer}, drawn as an arrow.`);
  s.housing("head", { in: "mem", at: headSpot, title: "head", tray: { cols: 1 }, state: { next: nodes[0].addr, expect: expect.slice(), loops } });
  s.tile("head.next", { in: "head", text: hex(nodes[0].addr), sub: "first node", w: 76 });
  s.trace("head->n0", "head", "n0", { ...along, key: nodes[0].value, arrow: true });
  s.focus(list);
  step("nodes.head", `{term:head} holds the first node's address. Every trip through the list starts here.`);
  const last = nodes[n - 1];
  s.lit(`${last.id}.next`);
  s.focus(list);
  step("nodes.null", `The last \`next\` is {term:null}, meaning no address: the list ends here.`);

  // ---- chapter 3: walking (the rod `cur` is our finger on the list) ----
  const walkTo = (target, ask) => {
    if (ask) ask();
    s.pointer("cur", { at: "n0.val", text: "cur", follow: "tile", tone: "busy" });
    s.lit("head", "n0");
    s.line(7);
    s.focus(list);
    step("walk.start", `Start where head points. Our marker, \`cur\`, is on ${fmt.key(nodes[0].value)}, the 1st item.`);
    for (let i = 1; i < target; i++) {
      const a = nodes[i - 1], b = nodes[i];
      s.send(s.uid("hop"), a.id, b.id, { via: arrows.get(a.id), key: b.value });
      s.beat();
      s.point("cur", `${b.id}.val`);
      s.lit(b.id);
      s.count("hops");
      s.line(8, 9);
      s.focus(list);
      step("walk.hop", `Follow ${fmt.key(a.value)}'s \`next\`, ${fmt.code(hex(b.addr))}: it's ${fmt.key(b.value)}, the ${ordinal(i + 1)} item`,
        { a: K(a.value), aId: a.id, b: K(b.value), bId: b.id, baddr: A(b.addr), ith: ordinal(i + 1) });
    }
  };

  if (sc === "find") {
    s.phase("Walk", { id: "walk", about: "A node's address is written only inside the node before it, so there is no jumping ahead. Start at head and follow the arrows, one by one." });
    walkTo(FIND, () => s.ask(`Starting on the 1st node, how many arrows must we follow to reach the ${ordinal(FIND)}?`,
      ["1: jump straight there", String(FIND - 1), String(FIND)], 1,
      { id: "walk.hops", why: `Each arrow moves you one node along. From the 1st node, ${FIND - 1} arrows bring you to the ${ordinal(FIND)}.` }));
    s.lit(nodes[FIND - 1].id);
    s.line(10);
    s.focus(list);
    step("walk.found", `Found the ${ordinal(FIND)} item, ${fmt.key(nodes[FIND - 1].value)}, after ${FIND - 1} arrows. The 1000th would take 999.`);
    s.phase("Trade-off", { id: "tradeoff", about: "Each is quick at something. An array jumps to any position with one sum. A linked list must walk there from head, one arrow at a time." });
    s.remove("cur");
    s.line(null);
    s.tag("arr", "1 calculation", { tone: "ok" });
    s.tag(nodes[FIND - 1].id, `${FIND - 1} arrows followed`, { tone: "warn" });
    s.focus("world");
    step("tradeoff.find", `Array: one calculation. Linked list: ${FIND - 1} arrows followed. Finding by position is slow in a list.`);
    return;
  }

  const prev = nodes[k - 1];
  const after = nodes[k];
  s.phase("Walk", { id: "walk", about: `No node knows its own position. To reach the ${ordinal(k)} item, start at head and follow the \`next\` addresses, one arrow at a time.` });
  walkTo(k);

  // ---- chapter 4: insert (or the wrong order) ----
  const fresh = { id: "nx", value: NEW.value, addr: NEW.addr, next: null, lost: false, fresh: true, spot: newSpot };
  const linkNewFirst = () => {   // new.next = node.next
    setNext(fresh, prev.next);
    arrow(fresh, after);
    s.count("rewired");
    s.line(14);
    s.focus(list);
  };
  const pointPrevAtNew = () => {  // node.next = new
    unarrow(prev);
    setNext(prev, fresh.addr);
    arrow(prev, fresh);
    s.count("rewired");
    s.line(15);
    s.focus(list);
  };
  // a check, not a search: packets run the whole chain from head, lighting each node they reach
  const readAll = (id, caption) => {
    const chain = [];
    const seen = new Set();
    let from = "head", via = "head->n0", a = nodes[0].addr;
    while (a !== null && !seen.has(a)) {
      const x = byAddr.get(a);
      seen.add(a);
      s.send(s.uid("read"), from, x.id, { via, key: x.value });
      s.lit(x.id);
      s.beat();
      chain.push(x.value);
      from = x.id; via = arrows.get(x.id); a = x.next;
    }
    // a node that points at itself: the read goes round its loop once more, and would forever
    if (a !== null && byAddr.get(a)?.id === from && via) { s.send(s.uid("read"), from, from, { via, key: byAddr.get(a).value }); s.lit(from); }
    s.focus(list);
    step(id, caption(chain), { chain: { path: chain.map(K) } }, { dur: 1.4 + 0.55 * chain.length });
  };

  s.phase(sc === "wrong" ? "Wrong order" : "Insert", { id: sc, about: sc === "wrong"
    ? `This time ${fmt.key(prev.value)} is pointed at the new node first. But ${fmt.key(prev.value)}'s \`next\` held the only copy of ${fmt.key(after.value)}'s address.`
    : `To add ${fmt.key(NEW.value)} after ${fmt.key(prev.value)}, make a new node anywhere there is room, then change two arrows. Nothing already in the list moves.` });
  nodeHousing(fresh);
  nodes.push(fresh);
  byAddr.set(fresh.addr, fresh);
  s.line(13);
  s.focus(list);
  step("insert.make", `Make a node for ${fmt.key(NEW.value)} wherever memory has room; the code calls it \`new\`. Its \`next\` is null for now.`);

  if (sc === "insert") {
    s.ask("Two arrows must change. Which one do we change first?",
      [`${NEW.value}'s next: point it at ${after.value}`, `${prev.value}'s next: point it at ${NEW.value}`, "Either order works"], 0,
      { id: "insert.order", why: `${prev.value}'s next is the only place ${after.value}'s address is written. Copy it into ${NEW.value} first, or it is gone.` });
    linkNewFirst();
    step("insert.save-next", `First, copy ${fmt.key(prev.value)}'s \`next\` into ${fmt.key(NEW.value)}'s. Now ${fmt.key(NEW.value)} points at ${fmt.key(after.value)} too.`);
    pointPrevAtNew();
    fresh.fresh = false;
    syncNode(fresh);
    expect.splice(k, 0, NEW.value);
    syncHead();
    step("insert.link-prev", `Then point ${fmt.key(prev.value)}'s \`next\` at ${fmt.key(NEW.value)}. The chain runs ${fmt.key(prev.value)} → ${fmt.key(NEW.value)} → ${fmt.key(after.value)}.`);
    s.line(null);
    readAll("insert.read", (chain) => `Read from head: ${listOf(chain)}. Now ${fmt.key(NEW.value)} is in, and nothing moved.`);
    s.phase("Trade-off", { id: "tradeoff", about: "Each is quick at something. An array slides items to make room. A linked list changes two arrows, but must walk from head to find the spot." });
    s.remove("cur");
    s.tag("arr", `${n - k} moved`, { tone: "warn" });
    s.tag(prev.id, "2 arrows changed", { tone: "ok" });
    s.focus("world");
    step("tradeoff.insert", `Array: ${fmt.plural(n - k, "item")} moved. List: none moved, 2 arrows changed, ${fmt.plural(k - 1, "arrow")} followed.`);
    return;
  }

  // ---- the wrong order: prev.next = new runs first ----
  const lostOnes = nodes.slice(k, n);
  pointPrevAtNew();
  for (const x of lostOnes) { x.lost = true; syncNode(x); }   // nothing reaches them from here on
  fresh.fresh = false;
  syncNode(fresh);
  expect = expect.slice(0, k).concat([NEW.value]);
  syncHead();
  step("wrong.prev-first", `Point ${fmt.key(prev.value)}'s \`next\` at ${fmt.key(NEW.value)} first. ${fmt.key(after.value)}'s address was written only there.`);
  s.ask(`Next, ${NEW.value} copies ${prev.value}'s next (\`new.next = prev.next\`). Where will ${NEW.value}'s next point?`,
    [`At ${after.value}`, `At ${NEW.value} itself`, "Nowhere: null"], 1,
    { id: "wrong.self", why: `${prev.value}'s next now holds ${NEW.value}'s own address, so copying it makes ${NEW.value} point at itself.` });
  setNext(fresh, prev.next);
  arrow(fresh, fresh);   // its next is its own address: an arrow that comes straight back
  loops = true;
  syncHead();
  s.count("rewired");
  s.line(14);
  s.set("nx.next", { tone: "fail" });   // its own address: a loop of one
  s.lit("nx.next");
  s.tag("nx", "points at itself", { tone: "fail" });
  s.focus(list);
  step("wrong.self-loop", `Copy ${fmt.key(prev.value)}'s \`next\` into ${fmt.key(NEW.value)}'s: that's ${fmt.key(NEW.value)}'s own address. It points at itself.`);
  for (const x of lostOnes) { s.set(x.id, { dim: true }); if (arrows.has(x.id)) s.set(arrows.get(x.id), { dim: true }); }
  // one zone per row of lost nodes (a box round both rows of a two-row list would take in nodes that are not lost);
  // a narrow zone keeps its title short
  const lostRows = [0, 1].map((r) => lostOnes.filter((x) => rowOf(nodes.indexOf(x)) === r)).filter((g) => g.length);
  const widest = lostRows.reduce((m, g, i) => (g.length > lostRows[m].length ? i : m), 0);
  const lostZones = lostRows.map((g, i) => {
    const id = i ? `lost${i + 1}` : "lost";
    s.zone(id, { around: g.map((x) => x.id), title: portrait || i !== widest ? "lost" : "lost: no arrow leads here", tone: "fail" });
    return id;
  });
  s.count("lost", lostOnes.length);
  s.line(null);
  s.focus(list);
  step("wrong.lost", `Nothing points at ${fmt.key(after.value)} now, so ${fmt.plural(lostOnes.length, "node")} ${lostOnes.length === 1 ? "is" : "are"} lost for good: ${fmt.and(lostOnes.map((x) => fmt.key(x.value)))}.`,
    { lostZones });
  readAll("wrong.read-loop", (chain) => `From head: ${listOf(chain)} → ${fmt.key(NEW.value)} → … forever. It never reaches the end.`);

  s.phase("Right order", { id: "right", about: `Swap the two updates. The new node copies ${fmt.key(prev.value)}'s \`next\` first, so ${fmt.key(after.value)}'s address is saved. Then ${fmt.key(prev.value)} can safely point at it.` });
  // rewind to just after the new node was made
  unarrow(prev);
  setNext(prev, after.addr);
  arrow(prev, after);
  unarrow(fresh);
  setNext(fresh, null);
  fresh.fresh = true;
  syncNode(fresh);
  for (const x of lostOnes) { x.lost = false; syncNode(x); s.set(x.id, { dim: false }); if (arrows.has(x.id)) s.set(arrows.get(x.id), { dim: false }); }
  lostZones.forEach((id) => s.remove(id));
  s.count("lost", -lostOnes.length);
  s.count("rewired", -2);
  expect = nodes.slice(0, n).map((x) => x.value);
  loops = false;
  syncHead();
  s.line(13);
  s.focus(list);
  step("right.rewind", `Rewind to before the mistake: ${fmt.key(prev.value)} still points at ${fmt.key(after.value)}.`);
  linkNewFirst();
  step("right.save-next", `First, ${fmt.key(NEW.value)}'s \`next\` copies ${fmt.key(prev.value)}'s. ${fmt.key(after.value)}'s address is now in two places.`);
  pointPrevAtNew();
  fresh.fresh = false;
  syncNode(fresh);
  expect.splice(k, 0, NEW.value);
  syncHead();
  step("right.link-prev", `Then point ${fmt.key(prev.value)} at ${fmt.key(NEW.value)}. Every node can still be reached.`);
  s.line(null);
  s.remove("cur");
  readAll("right.read", (chain) => `From head: ${listOf(chain)}. Save the old arrow before you change it.`);
}
