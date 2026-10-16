import { test } from "node:test";
import assert from "node:assert/strict";
import { bitfield, cache, tlb, pageTable, mmu, canonical, VA48, X86_64, bitsView, cacheView, walkView } from "./machine.mjs";
import { stubScene } from "./stub.mjs";
import { rng } from "./rng.mjs";
import * as fmt from "./fmt.mjs";

const plain = (c) => fmt.ascii(fmt.plain(c));

test("bit fields split and join, with masks and shifts, beyond 32 bits", () => {
  const f = bitfield([{ name: "tag", bits: 20 }, { name: "index", bits: 6 }, { name: "offset", bits: 6 }]);
  assert.equal(f.width, 32);
  assert.deepEqual(f.split(0x7f3a2c10), { tag: 0x7f3a2, index: 0x30, offset: 0x10 });
  assert.equal(f.mask("index"), 0xfc0);
  assert.equal(f.shift("tag"), 12);
  assert.equal(f.join({ tag: 0x7f3a2, index: 0x30, offset: 0x10 }), 0x7f3a2c10);
  assert.equal(f.set(0, "index", 5), 5 << 6);
  assert.equal(f.format(0x7f3a2c10), "tag 0x7f3a2 · index 48 · offset 16");
  assert.deepEqual(f.builder(), [{ name: "tag", from: 12, to: 31 }, { name: "index", from: 6, to: 11 }, { name: "offset", from: 0, to: 5 }]);
  assert.throws(() => f.split(2 ** 32), /does not fit/);
  assert.throws(() => f.set(0, "index", 64), /does not fit/);
  assert.throws(() => bitfield([{ name: "a", from: 0, to: 4 }, { name: "b", from: 4, to: 6 }]), /both a and b/);
  const r = rng(1);
  for (let i = 0; i < 500; i++) {
    const v = r.int(0, 2 ** 48 - 1);
    const p = VA48.split(v);
    const b = BigInt(v);
    assert.equal(p.offset, Number(b & 0xfffn));
    assert.equal(p.pt, Number((b >> 12n) & 511n));
    assert.equal(p.pd, Number((b >> 21n) & 511n));
    assert.equal(p.pdpt, Number((b >> 30n) & 511n));
    assert.equal(p.pml4, Number((b >> 39n) & 511n));
    assert.equal(VA48.join(p), v);
  }
  const wide = bitfield([{ name: "hi", bits: 40 }, { name: "lo", bits: 24 }]);
  assert.equal(wide.get(0xffff_8000_0000_1234n, "lo"), 0x1234);
  assert.equal(typeof wide.get(0xffff_8000_0000_1234n, "hi"), "number");
  assert.equal(wide.join({ hi: 0xffff800000, lo: 0x1234 }), 0xffff_8000_0000_1234n, "values past 2^53 come back as BigInt");
});

// independent LRU oracle: a line hits iff fewer than `ways` distinct lines of its set were touched since its last use
function lruOracle(trace, { sets, ways, line }) {
  const history = new Map();
  return trace.map((addr) => {
    const lineNo = Math.floor(addr / line), set = lineNo % sets;
    const h = history.get(set) ?? [];
    const i = h.lastIndexOf(lineNo);
    const hit = i >= 0 && new Set(h.slice(i + 1)).size < ways;
    h.push(lineNo);
    history.set(set, h);
    return hit;
  });
}
function fifoOracle(trace, { sets, ways, line }) {
  const q = new Map();
  return trace.map((addr) => {
    const lineNo = Math.floor(addr / line), set = lineNo % sets;
    const list = q.get(set) ?? [];
    q.set(set, list);
    if (list.includes(lineNo)) return true;
    list.push(lineNo);
    if (list.length > ways) list.shift();
    return false;
  });
}

test("the cache agrees with independent LRU and FIFO oracles on random traces", () => {
  for (const cfg of [{ sets: 4, ways: 2, line: 64 }, { sets: 1, ways: 4, line: 32 }, { sets: 8, ways: 1, line: 16 }, { sets: 16, ways: 4, line: 64 }]) {
    for (const policy of ["lru", "fifo"]) {
      const r = rng(`${policy}/${cfg.sets}/${cfg.ways}`);
      const hot = Array.from({ length: 12 }, () => r.int(0, 2 ** 20) * cfg.line);
      const trace = Array.from({ length: 2000 }, () => (r.chance(0.8) ? r.pick(hot) + r.int(0, cfg.line - 1) : r.int(0, 2 ** 26)));
      const c = cache({ ...cfg, policy });
      const got = trace.map((a) => c.access(a).hit);
      assert.deepEqual(got, (policy === "lru" ? lruOracle : fifoOracle)(trace, cfg), `${policy} ${JSON.stringify(cfg)}`);
      const st = c.stats;
      assert.equal(st.hits + st.misses, trace.length);
      assert.equal(st.hits, got.filter(Boolean).length);
    }
  }
});

test("cache details: evicted line addresses, dirty write-backs, order and reset", () => {
  const c = cache({ sets: 2, ways: 2, line: 64, addressBits: 16 });
  assert.equal(c.tagBits, 9);
  const a = 0x0040, b = 0x00c0, d = 0x0140;          // all map to set 1
  assert.equal(c.access(a, { write: true }).hit, false);
  c.access(b);
  assert.deepEqual(c.order(1), [1, 0]);
  const r = c.access(d);
  assert.equal(r.hit, false);
  assert.deepEqual(r.evicted, { tag: c.parts(a).tag, addr: a, dirty: true });
  assert.equal(c.stats.writebacks, 1);
  assert.equal(c.lookup(b).hit, true);
  assert.equal(c.lookup(a).hit, false);
  c.reset();
  assert.equal(c.stats.accesses, 0);
  assert.throws(() => cache({ sets: 3 }), /power of two/);
  const rnd = cache({ sets: 1, ways: 2, policy: "random", seed: 4 });
  for (let i = 0; i < 50; i++) rnd.access(i * 64);
  assert.equal(rnd.stats.misses, 50);
});

test("TLB: LRU slots stay put; FIFO evicts the oldest", () => {
  const t = tlb({ entries: 2 });
  assert.deepEqual(t.insert(10, 100), { slot: 0, evicted: null });
  t.insert(11, 110);
  assert.equal(t.lookup(10).hit, true);
  assert.deepEqual(t.insert(12, 120), { slot: 1, evicted: { vpn: 11, pfn: 110 } });
  assert.deepEqual(t.slots(), [{ vpn: 10, pfn: 100 }, { vpn: 12, pfn: 120 }]);
  const f = tlb({ entries: 2, policy: "fifo" });
  f.insert(1, 1); f.insert(2, 2); f.lookup(1);
  assert.deepEqual(f.insert(3, 3).evicted, { vpn: 1, pfn: 1 });
});

test("x86-64 page walk: indices, entry addresses, faults, canonical addresses", () => {
  const pt = pageTable({ cr3: 0x1000, tables: 0x2000, frames: 0x10_0000 });
  const r = rng("walk");
  const mapped = new Map();
  for (let i = 0; i < 64; i++) {
    const va = Math.floor(r.int(0, 2 ** 47 - 1) / 4096) * 4096;
    const frame = pt.map(va);
    mapped.set(va, frame);
  }
  for (const [va, frame] of mapped) {
    const off = r.int(0, 4095);
    const w = pt.walk(va + off);
    assert.equal(w.fault, null);
    assert.equal(w.pa, frame + off);
    assert.equal(w.steps[0].table, 0x1000);
    for (const st of w.steps) assert.equal(st.entryAddr, st.table + st.index * 8);
    assert.deepEqual(w.steps.map((x) => x.index), [w.indices.pml4, w.indices.pdpt, w.indices.pd, w.indices.pt]);
    for (let L = 0; L < 3; L++) assert.equal(w.steps[L].entry.frame, w.steps[L + 1].table, "each entry points at the next table");
  }
  const f = pt.walk(0x7fff_ffff_f000);
  assert.ok(f.fault);
  assert.equal(f.pa, null);
  const one = [...mapped.keys()][0];
  assert.equal(pt.unmap(one), true);
  assert.equal(pt.walk(one).fault.level, "PT");
  assert.ok(canonical(0x7fff_ffff_ffff) && canonical(0xffff_8000_0000_0000n));
  assert.ok(!canonical(0x8000_0000_0000) && !canonical(0x0001_0000_0000_0000n));
  assert.throws(() => pt.walk(0x8000_0000_0000), /canonical/);
  const pt2 = pageTable();
  pt2.map(0xffff_8000_0000_0000n, 0x5000);
  assert.equal(pt2.walk(0xffff_8000_0000_0123n).pa, 0x5123, "kernel half addresses walk with BigInt");
  assert.equal(pt2.walk(0xffff_8000_0000_0123n).indices.pml4, 256);
});

test("MMU: a TLB hit skips the walk", () => {
  const table = pageTable();
  const va = 0x7f3a_2c10_8000;
  table.map(va, 0x12_3000);
  const m = mmu({ table, tlb: tlb({ entries: 4 }) });
  const a = m.translate(va + 0x42);
  assert.equal(a.hit, false);
  assert.equal(a.pa, 0x12_3042);
  const b = m.translate(va + 0x99);
  assert.equal(b.hit, true);
  assert.equal(b.pa, 0x12_3099);
  assert.equal(b.walk, null);
  assert.deepEqual(m.stats, { translations: 2, walks: 1, faults: 0 });
  assert.ok(m.translate(0x1000).fault);
});

test("render helpers drive the builder cleanly", () => {
  const s = stubScene({}, { counters: { hits: {}, misses: {} } });
  const bv = bitsView(s, "addr", bitfield([{ name: "hi", bits: 4 }, { name: "lo", bits: 4 }]), 0b1010_0101);
  s.step("Bits.");
  bv.set(0b1010_0110);
  assert.equal(s.$.pending.filter((c) => c.method === "set").length, 2, "only the changed bits are touched");
  s.step("Two bits flip.");
  assert.deepEqual(bv.cellsOf("lo"), ["addr.b3", "addr.b2", "addr.b1", "addr.b0"]);

  const c = cache({ sets: 4, ways: 2, line: 64, addressBits: 16 });
  const view = cacheView(s, "l1", c, { title: "L1d" });
  s.step("An empty cache.");
  const trace = [0x0040, 0x0140, 0x0040, 0x0240, 0x0340, 0x0040, 0x1000];
  for (const a of trace) view.access(a);
  assert.equal(s.$.counters.hits, c.stats.hits);
  assert.equal(s.$.counters.misses, c.stats.misses);
  const lines = c.lines();
  for (let set = 0; set < 4; set++) for (let way = 0; way < 2; way++) {
    const t = s.get(view.tile(set, way));
    assert.equal(t.text === "" ? null : t.text, lines[set][way].valid ? fmt.hex(lines[set][way].tag, 2) : null);
  }
  const caps = s.$.captions().slice(3).map(plain);
  assert.equal(caps[0], "Load 0x0040: set 1, tag 0x00 — miss; fill way 0.");
  assert.equal(caps[2], "Load 0x0040: set 1, tag 0x00 — hit in way 0.");
  assert.match(caps[3], /evicting 0x01 \(least recently used\)/);
  assert.match(caps[4], /evicting 0x00 \(least recently used\)/);

  const table = pageTable();
  table.map(0x7f3a_2c10_8000, 0x12_3000);
  const m = mmu({ table, tlb: tlb({ entries: 4 }) });
  const wv = walkView(s, "mmu", m, {});
  s.step("An MMU.");
  const before = s.$.steps.length;
  wv.translate(0x7f3a_2c10_8123);
  assert.equal(s.$.steps.length - before, 7, "split, TLB miss, four levels, the physical address");
  wv.translate(0x7f3a_2c10_8456);
  assert.equal(s.$.steps.length - before, 9, "split and a TLB hit");
  wv.translate(0x1000);
  const last = plain(s.$.captions().at(-1));
  assert.match(last, /^PML4\[0\] at 0x1000 is not present: page fault\.$/);
  wv.translate(0x7f3a_2c10_8000);
  assert.ok(s.$.captions().at(-1).includes("TLB"));
  assert.deepEqual(s.$.finish(), []);
});
