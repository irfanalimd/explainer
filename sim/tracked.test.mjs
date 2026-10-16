import { test } from "node:test";
import assert from "node:assert/strict";
import { stubScene } from "./stub.mjs";
import { tracked, HASHES } from "./tracked.mjs";
import { rng } from "./rng.mjs";
import * as fmt from "./fmt.mjs";

const plain = (c) => fmt.ascii(fmt.plain(c));
const texts = (s, id) => s.$.texts(id);

test("a comparison and its swap are one step with precise narration", () => {
  const s = stubScene();
  const a = tracked.array(s, "a", [5, 2, 9, 1, 7]);
  a.step("Five numbers.");
  if (a.cmp(2, 3) > 0) a.swap(2, 3);
  a.cmp(0, 1);
  a.cmp(3, 4, { as: "pivot" });
  a.flush();
  const caps = s.$.captions();
  assert.equal(caps[1], "Compare {ref:a.2|a[2]} = 9 with {ref:a.3|a[3]} = 1 — 9 > 1, so swap.");
  assert.equal(plain(caps[2]), "Compare a[0] = 5 with a[1] = 2 — 5 > 2.");
  assert.equal(plain(caps[3]), "Compare a[3] = 9 with pivot a[4] = 7 — 9 > 7.");
  assert.deepEqual(a.values(), [5, 2, 1, 9, 7]);
  assert.deepEqual(texts(s, "a"), ["5", "2", "1", "9", "7"]);
  const step1 = s.$.ops(1).map((c) => c.method);
  assert.ok(step1.indexOf("lit") >= 0 && step1.indexOf("lit") < step1.indexOf("beat"));
  assert.ok(step1.includes("beat") && step1.indexOf("beat") < step1.indexOf("swap"), "the swap is its own beat after the compare");
  assert.deepEqual(s.$.finish(), []);
});

test("bubble sort through tracked.array matches a naive bubble sort, step for step", () => {
  const r = rng(21);
  for (let trial = 0; trial < 25; trial++) {
    const xs = Array.from({ length: r.int(2, 10) }, () => r.int(1, 30));
    const naive = xs.slice();
    let c = 0, w = 0;
    for (let n = naive.length; n > 1; n--) for (let i = 0; i + 1 < n; i++) { c++; if (naive[i] > naive[i + 1]) { [naive[i], naive[i + 1]] = [naive[i + 1], naive[i]]; w++; } }
    const s = stubScene({}, { counters: { comparisons: {}, swaps: {}, reads: {}, writes: {} } });
    const a = tracked.array(s, "a", xs);
    a.step("Start.");
    for (let n = a.length; n > 1; n--) for (let i = 0; i + 1 < n; i++) if (a.cmp(i, i + 1) > 0) a.swap(i, i + 1);
    a.flush();
    assert.deepEqual(a.values(), naive);
    assert.deepEqual(texts(s, "a"), naive.map(String), "the world agrees with the array");
    assert.deepEqual(a.stats, { comparisons: c, swaps: w, reads: 2 * c + 2 * w, writes: 2 * w });
    assert.deepEqual({ comparisons: 0, swaps: 0, reads: 0, writes: 0, ...s.$.counters }, { comparisons: c, swaps: w, reads: 2 * c + 2 * w, writes: 2 * w });
    assert.equal(s.$.steps.length, 1 + c, "one step per comparison");
    assert.deepEqual(s.$.finish(), []);
  }
});

test("insertion sort with writes: set joins its comparison", () => {
  const xs = [5, 2, 4, 6, 1, 3];
  const s = stubScene();
  const a = tracked.array(s, "a", xs, { counters: false });
  a.step("Start.");
  for (let i = 1; i < a.length; i++) {
    const key = a.get(i);
    let j = i - 1;
    while (j >= 0 && a.cmp(j, { value: key, label: "key" }) > 0) { a.set(j + 1, a.get(j)); j--; }
    a.set(j + 1, key);
  }
  a.flush();
  assert.deepEqual(a.values(), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(texts(s, "a"), ["1", "2", "3", "4", "5", "6"]);
  const caps = s.$.captions().map(plain);
  assert.equal(caps[1], "Compare a[0] = 5 with key 2 — 5 > 2, so a[1] ← 5.");
  assert.equal(caps[2], "a[0] ← 2 (was 5).");
  assert.equal(caps[3], "Compare a[1] = 5 with key 4 — 5 > 4, so a[2] ← 5.");
  assert.equal(caps[4], "Compare a[0] = 2 with key 4 — 2 < 4, so a[1] ← 4.");
  assert.deepEqual(s.$.counters, {}, "counters: false emits none");
  assert.deepEqual(s.$.finish(), []);
});

test("pointers stay on their slots through swaps, hide off the ends and narrate as consequences", () => {
  const s = stubScene();
  const a = tracked.array(s, "a", [4, 8, 1, 6]);
  const I = a.pointer("i", 0);
  const J = a.pointer("j", 0, { loop: true });
  a.step("Start.");
  assert.equal(s.get(I.id).at, a.tile(0));
  a.swap(0, 2);
  assert.equal(s.get(I.id).at, a.tile(0), "re-pointed at the tile now in slot 0");
  assert.equal(s.get(I.id).at, "a.2");
  a.flush();
  J.to(1);
  if (a.cmp(1, 3) > 0) I.to(1);
  J.to(2);
  a.flush();
  const caps = s.$.captions().map(plain);
  assert.equal(caps[2], "Compare a[1] = 8 with a[3] = 6 — 8 > 6, so i → 1.");
  assert.equal(caps.length, 4, "the loop pointer's move started a step of its own");
  I.to(4);
  assert.equal(I.id, null);
  assert.ok(!s.has("a.i"));
  I.to(3);
  assert.equal(I.id, "a.i~2");
  assert.equal(s.get("a.i~2").at, a.tile(3));
  assert.equal(a.pointer("i", 1), I, "asking for an existing pointer moves it");
  assert.equal(I.index, 1);
  I.hide();
  a.flush();
  assert.deepEqual(s.$.finish(), []);
});

test("marks and dims belong to slots, not tiles", () => {
  const s = stubScene();
  const a = tracked.array(s, "a", [3, 1, 2, 5]);
  a.step("Start.");
  a.mark(0, 1, "ok");
  a.swap(1, 3);
  a.flush();
  assert.equal(s.get(a.tile(1)).tone, "ok");
  assert.equal(s.get(a.tile(3)).tone, null);
  a.only(1, 2);
  a.flush();
  assert.deepEqual([0, 1, 2, 3].map((k) => s.get(a.tile(k)).dim), [true, false, false, true]);
  a.dim(0, 3, false);
  a.mark(0, 3, null, { say: "Clear." });
  a.flush();
  assert.deepEqual([0, 1, 2, 3].map((k) => [s.get(a.tile(k)).dim, s.get(a.tile(k)).tone]), [[false, null], [false, null], [false, null], [false, null]]);
  assert.equal(s.$.captions().at(-1), "Clear.");
  assert.throws(() => a.mark(0, 9, "ok"), /outside 0..3/);
  assert.throws(() => a.mark(0, 1, "shiny"), /unknown tone/);
  assert.deepEqual(s.$.finish(), []);
});

test("auto: none leaves stepping to the author and hands back the narration", () => {
  const s = stubScene();
  const a = tracked.array(s, "b", [3, 1, 2], { auto: "none", name: "b" });
  s.step("Start.");
  if (a.cmp(0, 1) > 0) a.swap(0, 1);
  a.cmp(1, 2, { line: 4 });
  assert.equal(s.$.steps.length, 1);
  const cap = a.caption();
  assert.equal(plain(cap), "Compare b[0] = 3 with b[1] = 1 — 3 > 1, so swap. Compare b[1] = 3 with b[2] = 2 — 3 > 2.");
  assert.equal(a.caption(), "");
  s.step(cap);
  assert.deepEqual(s.$.steps[1].line, [4, 4]);
  assert.deepEqual(a.values(), [1, 3, 2]);
  assert.deepEqual(s.$.finish(), []);
});

test("array state is published for invariants and survives as a copy", () => {
  const s = stubScene();
  const a = tracked.array(s, "a", [2, 1]);
  a.state({ input: [2, 1] });
  a.step("Start.");
  a.swap(0, 1);
  a.state({ done: true });
  a.flush();
  assert.deepEqual(s.$.snapshot(0).entities.get("a").state, { values: [2, 1], input: [2, 1] });
  assert.deepEqual(s.$.final.entities.get("a").state, { values: [1, 2], input: [2, 1], done: true });
});

test("stack and queue agree with native arrays over random operations", () => {
  for (const kind of ["stack", "queue"]) {
    const r = rng(kind);
    const s = stubScene();
    s.housing("src", {});
    const q = tracked[kind](s, "q", { counters: kind === "stack" ? { pushes: "pushes", pops: "pops" } : undefined });
    const ref = [];
    s.step("Start.");
    for (let i = 0; i < 300; i++) {
      if (ref.length && r.chance(0.45)) {
        const want = kind === "stack" ? ref.pop() : ref.shift();
        assert.equal(kind === "stack" ? q.pop() : q.dequeue(), want);
      } else {
        const v = r.int(1, 99);
        ref.push(v);
        if (kind === "stack") q.push(v, r.chance(0.5) ? { from: "src" } : {}); else q.enqueue(v);
      }
      assert.deepEqual(q.values(), ref);
    }
    q.flush();
    assert.deepEqual(texts(s, "q"), ref.map(String));
    assert.equal(q.size, ref.length);
    assert.deepEqual(s.$.finish(), []);
    while (q.size) kind === "stack" ? q.pop() : q.dequeue();
    assert.throws(() => (kind === "stack" ? q.pop() : q.dequeue()), /empty/);
  }
  const s = stubScene();
  const st = tracked.stack(s, "st", { label: "stack" });
  st.push(7);
  st.push(9);
  assert.equal(st.peek(), 9);
  st.pop();
  st.flush();
  assert.deepEqual(s.$.captions().map(plain), ["Push 7 onto stack (1 item).", "Push 9 onto stack (2 items).", "Pop 9 off stack (1 item left)."]);
  const q = tracked.queue(s, "qq", { label: "queue" });
  q.enqueue(3); q.enqueue(4); q.dequeue(); q.flush();
  assert.deepEqual(s.$.captions().slice(3).map(plain), ["Enqueue 3 at the tail of queue (1 item).", "Enqueue 4 at the tail of queue (2 items).", "Dequeue 3 from the head of queue (1 item left)."]);
});

const WORDS = ["fox", "dog", "cat", "owl", "elk", "yak", "ant", "bee", "cod", "emu", "gnu"];

test("hash tables (chaining and linear probing) agree with a Map over random operations", () => {
  for (const probing of ["chain", "linear"]) {
    for (let seed = 0; seed < 12; seed++) {
      const r = rng(`${probing}/${seed}`);
      const s = stubScene();
      const m = probing === "chain" ? 4 : 8;
      const ht = tracked.hashtable(s, "ht", { buckets: m, probing });
      const ref = new Map();
      s.step("Start.");
      const universe = WORDS.slice(0, probing === "chain" ? 11 : 6);
      for (let i = 0; i < 80; i++) {
        const k = r.pick(universe), op = r.int(0, 9);
        if (op < 5) { const v = r.int(1, 9); ht.put(k, v); ref.set(k, v); }
        else if (op < 7) assert.equal(ht.get(k), ref.get(k));
        else if (op < 8) assert.equal(ht.has(k), ref.has(k));
        else assert.equal(ht.delete(k), ref.delete(k));
        assert.equal(ht.size, ref.size);
      }
      ht.flush();
      assert.deepEqual(new Map(ht.entries()), ref);
      const layout = ht.layout();
      if (probing === "chain") {
        for (let b = 0; b < m; b++) {
          assert.deepEqual(texts(s, `ht.b${b}`), layout[b], `bucket ${b} in the world`);
          for (const k of layout[b]) assert.equal(ht.bucket(k), b);
        }
      } else {
        assert.deepEqual(texts(s, "ht").map((t) => (t === "" ? null : t)), layout.map((x) => (x === null ? null : String(x))));
        // every live key is reachable from its home slot without crossing an empty slot
        for (const [k] of ref) {
          for (let b = ht.bucket(k); layout[b] !== k; b = (b + 1) % m) assert.notEqual(layout[b], null, `${k} is cut off from its home slot`);
        }
      }
      assert.deepEqual(s.$.finish(), [], `${probing} seed ${seed}`);
    }
  }
});

test("hash table narration and tags show hash(k) % m and the probe sequence", () => {
  const s = stubScene({}, { counters: { probes: {}, collisions: {} } });
  const h = (k) => HASHES.fnv1a(k) % 8;
  const ht = tracked.hashtable(s, "t", { buckets: 8, probing: "linear" });
  s.step("Start.");
  // find two words that collide on slot
  const a = WORDS.find((w) => WORDS.some((x) => x !== w && h(x) === h(w)));
  const b = WORDS.find((x) => x !== a && h(x) === h(a));
  ht.put(a, 1);
  ht.put(b, 2);
  ht.flush();
  const tags = s.$.find("tag").map((c) => c.args[1]);
  assert.ok(tags.includes(`hash("${a}") % 8 = ${h(a)}`), tags.join("\n"));
  assert.ok(tags.includes(`(${h(a)} + 1) % 8 = ${(h(a) + 1) % 8}`), "the probe step shows the probe formula");
  const caps = s.$.captions().map(plain);
  assert.equal(caps[1], `Put ${a}: hash("${a}") % 8 = ${h(a)}; slot ${h(a)} is empty, so store ${a} there.`);
  assert.equal(caps[2], `Put ${b}: hash("${b}") % 8 = ${h(a)}; slot ${h(a)} holds ${a}, so probe slot ${(h(a) + 1) % 8}.`);
  assert.equal(caps[3], `Slot ${(h(a) + 1) % 8} is empty, so store ${b} there.`);
  assert.equal(s.$.counters.collisions, 1);
  assert.equal(s.$.counters.probes, 3);
  // tombstones: delete then the probe passes over it
  ht.delete(a);
  assert.equal(ht.get(b), 2);
  ht.flush();
  assert.ok(s.$.captions().some((c) => /is a tombstone, so keep probing/.test(plain(c))));
  const ints = tracked.hashtable(stubScene(), "i", { buckets: 5, probing: "chain" });
  ints.put(12, "x");
  ints.flush();
  assert.equal(ints.bucket(12), 2);
  assert.throws(() => tracked.hashtable(stubScene(), "z", { probing: "cuckoo" }), /probing/);
  const full = tracked.hashtable(stubScene(), "f", { buckets: 2, probing: "linear" });
  full.put("fox", 1); full.put("dog", 2);
  assert.throws(() => full.put("cat", 3), /table is full/);
});
