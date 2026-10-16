// Machine models for architecture figures: bit fields (split an address into named fields), a set-associative
// cache (LRU / FIFO / random), a TLB, and the x86-64 4-level page-table walk; plus helpers that render them
// through the Scene builder (bitsView, cacheView, walkView). Values may be Numbers (up to 2^53) or BigInts;
// results come back as Numbers whenever they fit.

import * as fmt from "./fmt.mjs";
import { rng as makeRng } from "./rng.mjs";

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const big = (v, who = "value") => {
  if (typeof v === "bigint") { if (v < 0n) throw new RangeError(`${who} must be >= 0`); return v; }
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new TypeError(`${who} must be a non-negative safe integer or BigInt, got ${v}`);
  return BigInt(v);
};
const small = (b) => (b <= SAFE ? Number(b) : b);
const isPow2 = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
const log2 = (n) => Math.round(Math.log2(n));

// ---- bit fields ----------------------------------------------------------------------------------

/**
 * bitfield([{ name: "tag", bits: 20 }, { name: "index", bits: 6 }, { name: "offset", bits: 6 }])   msb → lsb
 * bitfield([{ name: "pt", from: 12, to: 20 }, …], { width: 48 })                                    explicit
 * Fields with 0 bits are dropped. Bit numbers are LSB = 0; `from` <= `to`, inclusive.
 */
export function bitfield(spec, opts = {}) {
  let fields;
  if (spec.every((f) => f.bits !== undefined)) {
    let hi = spec.reduce((a, f) => a + f.bits, 0) - 1;
    fields = [];
    for (const f of spec) {
      if (!Number.isInteger(f.bits) || f.bits < 0) throw new RangeError(`bitfield: field ${f.name} has ${f.bits} bits`);
      if (f.bits > 0) fields.push({ name: f.name, lo: hi - f.bits + 1, hi, key: f.key });
      hi -= f.bits;
    }
  } else {
    fields = spec.map((f) => ({ name: f.name, lo: f.from, hi: f.to, key: f.key }));
  }
  const width = opts.width ?? Math.max(...fields.map((f) => f.hi)) + 1;
  const used = new Array(width).fill(null);
  for (const f of fields) {
    if (!(Number.isInteger(f.lo) && Number.isInteger(f.hi) && f.lo >= 0 && f.hi < width && f.lo <= f.hi)) throw new RangeError(`bitfield: field ${f.name} [${f.lo}, ${f.hi}] is outside 0..${width - 1}`);
    for (let b = f.lo; b <= f.hi; b++) { if (used[b]) throw new RangeError(`bitfield: bit ${b} is in both ${used[b]} and ${f.name}`); used[b] = f.name; }
    f.bits = f.hi - f.lo + 1;
    f.shift = f.lo;
    f.maskBig = ((1n << BigInt(f.bits)) - 1n) << BigInt(f.lo);
    f.mask = small(f.maskBig);
  }
  const byName = new Map(fields.map((f) => [f.name, f]));
  const field = (name) => { const f = byName.get(name); if (!f) throw new Error(`bitfield: no field "${name}"`); return f; };
  const limit = 1n << BigInt(width);
  const check = (v) => { const b = big(v); if (b >= limit) throw new RangeError(`bitfield: ${fmt.hex(b)} does not fit in ${width} bits`); return b; };

  const api = {
    width,
    fields: fields.map(({ maskBig, ...f }) => f),
    get(v, name) { const f = field(name); return small((check(v) & f.maskBig) >> BigInt(f.lo)); },
    set(v, name, x) {
      const f = field(name), xb = big(x);
      if (xb >> BigInt(f.bits)) throw new RangeError(`bitfield: ${x} does not fit in ${f.name} (${f.bits} bits)`);
      return small((check(v) & ~f.maskBig) | (xb << BigInt(f.lo)));
    },
    /** { [name]: value } */
    split(v) { const b = check(v); return Object.fromEntries(fields.map((f) => [f.name, small((b & f.maskBig) >> BigInt(f.lo))])); },
    /** inverse of split; missing fields are 0 */
    join(parts) { let b = 0n; for (const f of fields) if (parts[f.name] !== undefined) b = big(api.set(b, f.name, parts[f.name])); return small(b); },
    mask(name) { return field(name).mask; },
    shift(name) { return field(name).shift; },
    /** [{ name, value, lo, hi, bits }] msb first */
    describe(v) { const p = api.split(v); return fields.map((f) => ({ name: f.name, value: p[f.name], lo: f.lo, hi: f.hi, bits: f.bits })); },
    /** fields as s.bits() wants them: [{ name, from, to, key }] */
    builder() { return fields.map((f) => { const o = { name: f.name, from: f.lo, to: f.hi }; if (f.key !== undefined) o.key = f.key; return o; }); },
    /** "tag 0x7f3a2 · index 48 · offset 16" (fields wider than 8 bits in hex unless listed in o.decimal) */
    format(v, o = {}) {
      return api.describe(v).map((d) => `${o.names?.[d.name] ?? d.name} ${d.bits > 8 && !o.decimal?.includes(d.name) ? fmt.hex(d.value) : d.value}`).join(" · ");
    },
  };
  return api;
}

// ---- cache ---------------------------------------------------------------------------------------

/**
 * A set-associative cache. sets and line (bytes) are powers of two; sets = 1 is fully associative.
 * policy "lru" | "fifo" | "random" (seeded); write-back, write-allocate.
 */
export function cache({ sets = 4, ways = 2, line = 64, addressBits = 32, policy = "lru", seed = 1 } = {}) {
  if (!isPow2(sets)) throw new RangeError(`cache: sets must be a power of two, got ${sets}`);
  if (!isPow2(line)) throw new RangeError(`cache: line must be a power of two, got ${line}`);
  if (!Number.isInteger(ways) || ways < 1) throw new RangeError(`cache: ways must be a positive integer`);
  if (!["lru", "fifo", "random"].includes(policy)) throw new TypeError(`cache: unknown policy "${policy}"`);
  const offsetBits = log2(line), indexBits = log2(sets), tagBits = addressBits - indexBits - offsetBits;
  if (tagBits < 1) throw new RangeError(`cache: ${addressBits}-bit addresses leave no tag bits`);
  const fields = bitfield([{ name: "tag", bits: tagBits }, { name: "index", bits: indexBits }, { name: "offset", bits: offsetBits }]);
  const r = makeRng(seed).fork("cache");
  const empty = () => ({ valid: false, tag: 0, dirty: false, used: 0, filled: 0 });
  let lines = Array.from({ length: sets }, () => Array.from({ length: ways }, empty));
  let tick = 0;
  const stats = { accesses: 0, hits: 0, misses: 0, evictions: 0, writebacks: 0 };

  const parts = (addr) => { const p = fields.split(addr); return { tag: p.tag, index: p.index ?? 0, offset: p.offset ?? 0 }; };
  const lineAddr = (tag, index) => small((big(tag) << BigInt(indexBits + offsetBits)) | (BigInt(index) << BigInt(offsetBits)));

  const api = {
    sets, ways, line, addressBits, policy, offsetBits, indexBits, tagBits, fields,
    get stats() { return { ...stats, hitRate: stats.accesses ? stats.hits / stats.accesses : 0 }; },
    parts,
    /** look without touching state */
    lookup(addr) {
      const { tag, index } = parts(addr);
      const way = lines[index].findIndex((l) => l.valid && l.tag === tag);
      return { hit: way >= 0, set: index, way, tag };
    },
    /** access(addr, { write }) -> { addr, write, hit, set, way, tag, offset, evicted: { tag, addr, dirty } | null } */
    access(addr, o = {}) {
      const write = !!o.write;
      const { tag, index, offset } = parts(addr);
      const set = lines[index];
      tick++; stats.accesses++;
      let way = set.findIndex((l) => l.valid && l.tag === tag);
      if (way >= 0) {
        stats.hits++;
        set[way].used = tick;
        if (write) set[way].dirty = true;
        return { addr, write, hit: true, set: index, way, tag, offset, evicted: null };
      }
      stats.misses++;
      way = set.findIndex((l) => !l.valid);
      if (way < 0) {
        if (policy === "lru") way = set.reduce((best, l, i) => (l.used < set[best].used ? i : best), 0);
        else if (policy === "fifo") way = set.reduce((best, l, i) => (l.filled < set[best].filled ? i : best), 0);
        else way = r.int(0, ways - 1);
      }
      const old = set[way];
      let evicted = null;
      if (old.valid) {
        evicted = { tag: old.tag, addr: lineAddr(old.tag, index), dirty: old.dirty };
        stats.evictions++;
        if (old.dirty) stats.writebacks++;
      }
      set[way] = { valid: true, tag, dirty: write, used: tick, filled: tick };
      return { addr, write, hit: false, set: index, way, tag, offset, evicted };
    },
    /** valid ways of a set from most to least recently used */
    order(index) { return lines[index].map((l, i) => [l, i]).filter(([l]) => l.valid).sort((a, b) => b[0].used - a[0].used).map(([, i]) => i); },
    /** a copy of the lines: [set][way] = { valid, tag, dirty } */
    lines() { return lines.map((set) => set.map(({ valid, tag, dirty }) => ({ valid, tag, dirty }))); },
    reset() { lines = Array.from({ length: sets }, () => Array.from({ length: ways }, empty)); tick = 0; for (const k of Object.keys(stats)) stats[k] = 0; },
  };
  return api;
}

// ---- TLB and the x86-64 page walk ---------------------------------------------------------------------

export const X86_64 = { levels: ["PML4", "PDPT", "PD", "PT"], indexBits: 9, offsetBits: 12, entryBytes: 8, pageBytes: 4096, entries: 512 };

/** 48-bit virtual address fields (bits 63..48 must copy bit 47; see canonical()). */
export const VA48 = bitfield([
  { name: "pml4", bits: 9, key: "PML4" }, { name: "pdpt", bits: 9, key: "PDPT" }, { name: "pd", bits: 9, key: "PD" },
  { name: "pt", bits: 9, key: "PT" }, { name: "offset", bits: 12, key: "offset" },
]);
const LEVEL_FIELD = ["pml4", "pdpt", "pd", "pt"];

/** true if bits 63..48 of a 64-bit VA all equal bit 47 */
export function canonical(va) {
  const b = big(va, "va");
  if (b >> 64n) return false;
  const top = b >> 47n;
  return top === 0n || top === (1n << 17n) - 1n;
}

/** A small TLB with fixed slots (so a view can keep tiles in place). Fully associative, LRU or FIFO. */
export function tlb({ entries = 8, policy = "lru" } = {}) {
  if (!["lru", "fifo"].includes(policy)) throw new TypeError(`tlb: unknown policy "${policy}"`);
  let slots = Array.from({ length: entries }, () => null);
  let tick = 0;
  const stats = { lookups: 0, hits: 0, misses: 0, evictions: 0 };
  const api = {
    entries, policy,
    get stats() { return { ...stats }; },
    /** -> { hit, pfn, slot } */
    lookup(vpn) {
      tick++; stats.lookups++;
      const slot = slots.findIndex((x) => x && x.vpn === vpn);
      if (slot < 0) { stats.misses++; return { hit: false, pfn: undefined, slot: -1 }; }
      stats.hits++;
      slots[slot].used = tick;
      return { hit: true, pfn: slots[slot].pfn, slot };
    },
    /** -> { slot, evicted: { vpn, pfn } | null } */
    insert(vpn, pfn) {
      tick++;
      let slot = slots.findIndex((x) => x && x.vpn === vpn);
      let evicted = null;
      if (slot < 0) slot = slots.findIndex((x) => !x);
      if (slot < 0) {
        const k = policy === "lru" ? "used" : "filled";
        slot = slots.reduce((best, x, i) => (x[k] < slots[best][k] ? i : best), 0);
        evicted = { vpn: slots[slot].vpn, pfn: slots[slot].pfn };
        stats.evictions++;
      }
      slots[slot] = { vpn, pfn, used: tick, filled: tick };
      return { slot, evicted };
    },
    flush() { slots = slots.map(() => null); },
    slots() { return slots.map((x) => (x ? { vpn: x.vpn, pfn: x.pfn } : null)); },
  };
  return api;
}

/**
 * x86-64 4-level page tables in a sparse model of physical memory. Table frames come from a bump allocator
 * starting at `tables`; data frames (when map() is not given one) from `frames`. All addresses are byte addresses.
 */
export function pageTable({ cr3 = 0x1000, tables = 0x2000, frames = 0x100000 } = {}) {
  const P = X86_64.pageBytes;
  for (const [k, v] of Object.entries({ cr3, tables, frames })) if (v % P) throw new RangeError(`pageTable: ${k} must be page-aligned`);
  const memory = new Map([[cr3, new Map()]]); // table base -> Map(index -> { present, frame, writable, user })
  let nextTable = tables, nextFrame = frames;
  const allocTable = () => { const b = nextTable; nextTable += P; memory.set(b, new Map()); return b; };
  const indices = (va) => {
    if (!canonical(va)) throw new RangeError(`pageTable: ${fmt.hex(big(va, "va"))} is not a canonical address`);
    const low = big(va) & ((1n << 48n) - 1n);
    return VA48.split(low);
  };

  const api = {
    cr3,
    indices,
    /** map the page containing va to physical frame `pa` (allocated when omitted); returns the frame */
    map(va, pa, flags = {}) {
      const ix = indices(va);
      let table = cr3;
      for (let L = 0; L < 3; L++) {
        const t = memory.get(table);
        let e = t.get(ix[LEVEL_FIELD[L]]);
        if (!e || !e.present) { e = { present: true, frame: allocTable(), writable: true, user: true }; t.set(ix[LEVEL_FIELD[L]], e); }
        table = e.frame;
      }
      let frame = pa;
      if (frame === undefined) { frame = nextFrame; nextFrame += P; }
      if (frame % P) throw new RangeError(`pageTable.map: frame ${fmt.hex(frame)} is not page-aligned`);
      memory.get(table).set(ix.pt, { present: true, frame, writable: flags.writable ?? true, user: flags.user ?? true });
      return frame;
    },
    unmap(va) {
      const w = api.walk(va);
      if (w.fault) return false;
      memory.get(w.steps[3].table).get(w.steps[3].index).present = false;
      return true;
    },
    /** the entry at (table base, index), or null */
    entry(table, index) { const e = memory.get(table)?.get(index); return e ? { ...e } : null; },
    /**
     * walk(va) -> { va, indices, offset, steps: [{ level, table, index, entryAddr, entry }], fault: { level, index } | null, pa, frame }
     */
    walk(va) {
      const ix = indices(va);
      const steps = [];
      let table = cr3;
      for (let L = 0; L < 4; L++) {
        const index = ix[LEVEL_FIELD[L]];
        const e = memory.get(table)?.get(index) ?? null;
        steps.push({ level: X86_64.levels[L], table, index, entryAddr: table + index * X86_64.entryBytes, entry: e ? { ...e } : null });
        if (!e || !e.present) return { va, indices: ix, offset: ix.offset, steps, fault: { level: X86_64.levels[L], index }, pa: null, frame: null };
        table = e.frame;
      }
      return { va, indices: ix, offset: ix.offset, steps, fault: null, frame: table, pa: table + ix.offset };
    },
    translate(va) { return api.walk(va).pa; },
    /** table bases in allocation order */
    tables() { return [...memory.keys()]; },
  };
  return api;
}

/** TLB in front of a page table. translate(va) -> { va, vpn, offset, hit, pa, frame, walk, fault, slot, evicted } */
export function mmu({ table, tlb: t }) {
  const stats = { translations: 0, walks: 0, faults: 0 };
  return {
    table, tlb: t,
    get stats() { return { ...stats }; },
    translate(va) {
      stats.translations++;
      const ix = table.indices(va);
      const vpn = small((big(va) & ((1n << 48n) - 1n)) >> 12n);
      const hit = t ? t.lookup(vpn) : { hit: false };
      if (hit.hit) return { va, vpn, offset: ix.offset, hit: true, frame: hit.pfn * X86_64.pageBytes, pa: hit.pfn * X86_64.pageBytes + ix.offset, walk: null, fault: null, slot: hit.slot, evicted: null };
      stats.walks++;
      const w = table.walk(va);
      if (w.fault) { stats.faults++; return { va, vpn, offset: ix.offset, hit: false, frame: null, pa: null, walk: w, fault: w.fault, slot: -1, evicted: null }; }
      const ins = t ? t.insert(vpn, w.frame / X86_64.pageBytes) : { slot: -1, evicted: null };
      return { va, vpn, offset: ix.offset, hit: false, frame: w.frame, pa: w.pa, walk: w, fault: null, slot: ins.slot, evicted: ins.evicted };
    },
  };
}

// ---- render helpers ------------------------------------------------------------------------------

const opt = (o, keys) => { const out = {}; for (const k of keys) if (o[k] !== undefined) out[k] = o[k]; return out; };
const valueFor = (b) => (b <= SAFE ? Number(b) : b);

/**
 * A row of bits for a bitfield: s.bits(id, { width, value, fields }) plus update helpers.
 * Field keys default to the field names, so every field has a stable identity colour.
 */
export function bitsView(s, id, field, value = 0, o = {}) {
  const fields = field.builder().map((f) => ({ ...f, key: f.key ?? f.name }));
  let cur = big(value);
  const h = s.bits(id, { ...opt(o, ["in", "at"]), width: field.width, value: valueFor(cur), fields });
  const cells = Array.from({ length: field.width }, (_, i) => h.cell(i)); // cells[i] = bit i (h.cells is msb first)
  const bit = (v, i) => (v >> BigInt(i)) & 1n;
  return {
    id, cells,
    get value() { return small(cur); },
    /** show a new value: only the bits that change are touched */
    set(v) {
      const nb = big(v);
      for (let i = 0; i < field.width; i++) {
        if (bit(nb, i) !== bit(cur, i)) s.set(cells[i], bit(nb, i) ? { text: "1", tone: null } : { text: "0", tone: "ghost" });
      }
      cur = nb;
    },
    /** the cells of a field, msb first */
    cellsOf(name) { const f = field.fields.find((x) => x.name === name); return Array.from({ length: f.bits }, (_, k) => cells[f.hi - k]); },
    lit(...names) { for (const n of names) s.lit(...this.cellsOf(n)); },
    tag(name, text, tone) { const c = this.cellsOf(name); s.tag(c[Math.floor(c.length / 2)], text, tone ? { tone } : {}); },
  };
}

/**
 * Render a cache as a chip housing whose tray holds one record per (set, way), with an address row above it.
 * view.access(addr, { write, say }) runs the access and narrates it as one step (auto: "op") or leaves the
 * stepping to you (auto: "none"; view.caption() returns the narration).
 */
export function cacheView(s, id, c, o = {}) {
  const auto = o.auto ?? "op";
  const addrDigits = Math.ceil(c.addressBits / 4);
  const tagDigits = Math.ceil(c.tagBits / 4);
  const names = o.names ?? { tag: "tag", index: "set", offset: "offset" };
  const counters = o.counters === false ? {} : { hits: "hits", misses: "misses", ...(o.counters ?? {}) };
  let parent = o.in, bits = null;
  if (o.addr !== false) {
    s.column(`${id}.view`, { ...opt(o, ["in", "gap"]) });
    parent = `${id}.view`;
    bits = bitsView(s, `${id}.addr`, c.fields, 0, { in: parent });
  }
  s.housing(id, {
    ...(parent !== undefined ? { in: parent } : {}), ...opt(o, ["at"]),
    title: o.title ?? "L1d", sub: o.sub ?? `${c.sets} × ${c.ways} · ${c.line} B lines`, variant: "chip",
    tray: { cols: c.ways, rows: c.sets, of: "record" }, led: "idle",
  });
  const tile = (set, way) => `${id}.l${set}w${way}`;
  const lines = c.lines();
  for (let set = 0; set < c.sets; set++) for (let way = 0; way < c.ways; way++) {
    const l = lines[set][way];
    s.tile(tile(set, way), { in: id, of: "record", index: set * c.ways + way, text: l.valid ? fmt.hex(l.tag, tagDigits) : "", sub: l.valid && l.dirty ? "dirty" : "", tone: l.valid ? null : "ghost" });
  }
  const buffer = [];
  const api = {
    id, cache: c, bits, tile,
    access(addr, a = {}) {
      const r = c.access(addr, a);
      const hx = fmt.hex(addr, addrDigits);
      const verb = r.write ? "Store to" : "Load";
      if (bits) { bits.set(addr); bits.lit("index"); }
      const row = Array.from({ length: c.ways }, (_, w) => tile(r.set, w));
      s.lit(...row);
      s.beat();
      const head = `${verb} ${fmt.code(hx)}: ${names.index} ${r.set}, ${names.tag} ${fmt.code(fmt.hex(r.tag, tagDigits))}`;
      let text;
      if (r.hit) {
        s.lit(tile(r.set, r.way));
        s.tag(tile(r.set, r.way), "hit", { tone: "ok" });
        if (r.write) s.set(tile(r.set, r.way), { sub: "dirty" });
        text = `${head} — {tone:ok|hit} in way ${r.way}`;
        if (counters.hits) s.count(counters.hits);
      } else {
        const t = tile(r.set, r.way);
        s.set(t, { text: fmt.hex(r.tag, tagDigits), sub: r.write ? "dirty" : "", tone: null });
        s.tag(t, r.evicted ? `evict ${fmt.hex(r.evicted.tag, tagDigits)}` : "miss", { tone: "warn" });
        const why = c.policy === "lru" ? "least recently used" : c.policy === "fifo" ? "oldest" : "random victim";
        text = `${head} — {tone:warn|miss}; fill way ${r.way}` + (r.evicted ? `, evicting ${fmt.code(fmt.hex(r.evicted.tag, tagDigits))} (${why}${r.evicted.dirty ? ", written back" : ""})` : "");
        if (counters.misses) s.count(counters.misses);
      }
      text = a.say ?? text + ".";
      if (auto === "op") s.step(text, opt(a, ["dur", "t"]));
      else buffer.push(text);
      return r;
    },
    caption() { const t = buffer.join(" "); buffer.length = 0; return t; },
  };
  return api;
}

/**
 * Render an MMU: the VA bit row on top, then CR3, the four table levels, the physical page and the TLB in a row,
 * joined by traces. view.translate(va) narrates the translation over several steps: split, TLB lookup, one step
 * per level, and the physical address (or the page fault). auto: "none" leaves stepping to you (view.caption()).
 */
export function walkView(s, id, m, o = {}) {
  const auto = o.auto ?? "op";
  const win = o.window ?? 3;
  const half = Math.floor(win / 2);
  const counters = o.counters === false ? {} : { ...(o.counters ?? {}) };
  s.column(id, { ...opt(o, ["in", "gap"]) });
  const bits = bitsView(s, `${id}.va`, VA48, 0, { in: id });
  const row = `${id}.path`;
  s.row(row, { in: id, gap: o.rowGap ?? 40 });
  const ids = { cr3: `${id}.cr3`, page: `${id}.page`, tlb: `${id}.tlb`, levels: X86_64.levels.map((L) => `${id}.${L.toLowerCase()}`) };
  if (m.tlb) s.housing(ids.tlb, { in: row, title: "TLB", sub: `${m.tlb.entries} entries`, variant: "chip", tray: { cols: 1, rows: m.tlb.entries, of: "record" }, led: "idle" });
  s.housing(ids.cr3, { in: row, title: "CR3", sub: fmt.hex(m.table.cr3), variant: "chip", led: "idle" });
  // each level wears its VA field's identity colour, so the field and the table it indexes read as one thing
  X86_64.levels.forEach((L, i) => s.housing(ids.levels[i], { in: row, title: L, sub: "512 entries", variant: "chip", tray: { cols: 1, rows: win, of: "record" }, led: "idle", key: L }));
  s.housing(ids.page, { in: row, title: "Page", sub: "4 KiB frame", variant: "store", tray: { cols: 1, rows: 1, of: "record" }, led: "idle" });
  const chain = [ids.cr3, ...ids.levels, ids.page];
  for (let i = 0; i + 1 < chain.length; i++) s.trace(`${id}.t${i}`, chain[i], chain[i + 1], {});
  const entryTile = (lvl, k) => `${ids.levels[lvl]}.e${k}`;
  X86_64.levels.forEach((_, lvl) => { for (let k = 0; k < win; k++) s.tile(entryTile(lvl, k), { in: ids.levels[lvl], of: "record", text: "", tone: "ghost" }); });
  const tlbTile = (k) => `${ids.tlb}.e${k}`;
  if (m.tlb) for (let k = 0; k < m.tlb.entries; k++) s.tile(tlbTile(k), { in: ids.tlb, of: "record", text: "", tone: "ghost" });
  s.tile(`${ids.page}.pa`, { in: ids.page, of: "record", text: "", tone: "ghost" });

  let seq = 0, faulted = null;
  const buffer = [];
  const say = (text, a) => { if (auto === "op") s.step(text, opt(a, ["dur"])); else buffer.push(text); };
  const shownWin = X86_64.levels.map(() => []);
  function showWindow(lvl, table, index) {
    const first = Math.max(0, Math.min(X86_64.entries - win, index - half));
    for (let k = 0; k < win; k++) {
      const i = first + k;
      const e = m.table.entry(table, i);
      const content = { text: String(i), sub: e && e.present ? fmt.hex(e.frame) : "not present", tone: e && e.present ? null : "ghost" };
      const key = JSON.stringify(content);
      if (shownWin[lvl][k] !== key) { s.set(entryTile(lvl, k), content); shownWin[lvl][k] = key; }
    }
    return entryTile(lvl, index - first);
  }

  return {
    id, bits, ids,
    translate(va, a = {}) {
      if (faulted) { s.set(faulted, { led: "idle" }); faulted = null; }
      const r = m.translate(va);
      const low = small(big(va) & ((1n << 48n) - 1n));
      bits.set(low);
      s.lit(...bits.cells);
      const parts = VA48.split(low);
      say(`Translate ${fmt.code(fmt.hex(va, 12))}: ${X86_64.levels.map((L, i) => `${L} ${parts[LEVEL_FIELD[i]]}`).join(" · ")} · offset ${fmt.code(fmt.hex(parts.offset, 3))}.`, a);
      const vpnHex = fmt.code(fmt.hex(r.vpn));
      if (m.tlb) {
        s.lit(ids.tlb);
        if (r.hit) {
          s.lit(tlbTile(r.slot)); s.tag(tlbTile(r.slot), "hit", { tone: "ok" });
          if (counters.hits) s.count(counters.hits);
          s.beat();
          s.set(`${ids.page}.pa`, { text: fmt.hex(r.pa), sub: "physical", tone: null });
          s.lit(`${ids.page}.pa`);
          say(`TLB {tone:ok|hit}: page ${vpnHex} lives in frame ${fmt.code(fmt.hex(r.frame))}, so PA = ${fmt.code(fmt.hex(r.pa))} without touching the page tables.`, a);
          return r;
        }
        s.tag(ids.tlb, "miss", { tone: "warn" });
        if (counters.misses) s.count(counters.misses);
        say(`TLB {tone:warn|miss} for page ${vpnHex}: walk the tables from CR3 = ${fmt.code(fmt.hex(m.table.cr3))}.`, a);
      }
      const w = r.walk ?? m.table.walk(va);
      let from = ids.cr3;
      for (let lvl = 0; lvl < w.steps.length; lvl++) {
        const st = w.steps[lvl];
        const t = showWindow(lvl, st.table, st.index);
        s.send(`${id}.w${seq++}`, from, ids.levels[lvl], { text: fmt.hex(st.table), via: `${id}.t${lvl}` });
        s.beat();
        s.lit(t);
        s.tag(t, `${fmt.hex(st.table)} + ${st.index}·8`);
        if (counters.reads) s.count(counters.reads);
        if (!st.entry || !st.entry.present) {
          s.set(ids.levels[lvl], { led: "fail" });
          faulted = ids.levels[lvl];
          say(`${st.level}[${st.index}] at ${fmt.code(fmt.hex(st.entryAddr))} is not present: {tone:fail|page fault}.`, a);
          return r;
        }
        const next = lvl < 3 ? `the ${X86_64.levels[lvl + 1]} at` : "frame";
        say(`${st.level}[${st.index}] at ${fmt.code(fmt.hex(st.entryAddr))} → ${next} ${fmt.code(fmt.hex(st.entry.frame))}.`, a);
        from = ids.levels[lvl];
      }
      s.send(`${id}.w${seq++}`, ids.levels[3], ids.page, { text: fmt.hex(r.frame), via: `${id}.t4` });
      s.beat();
      s.set(`${ids.page}.pa`, { text: fmt.hex(r.pa), sub: "physical", tone: null });
      s.lit(`${ids.page}.pa`);
      if (m.tlb && r.slot >= 0) {
        s.set(tlbTile(r.slot), { text: fmt.hex(r.vpn), sub: `→ ${fmt.hex(r.frame / X86_64.pageBytes)}`, tone: null });
        s.lit(tlbTile(r.slot));
      }
      say(`PA = ${fmt.code(fmt.hex(r.frame))} + ${fmt.code(fmt.hex(r.offset, 3))} = ${fmt.code(fmt.hex(r.pa))}` + (m.tlb && r.slot >= 0 ? `; the TLB keeps page ${vpnHex} → frame for next time${r.evicted ? `, evicting page ${fmt.code(fmt.hex(r.evicted.vpn))}` : ""}.` : "."), a);
      return r;
    },
    caption() { const t = buffer.join(" "); buffer.length = 0; return t; },
  };
}
