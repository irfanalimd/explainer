// Virtual memory: how one load finds its byte. x86-64, 4 KiB pages, 4-level paging (Intel SDM Vol. 3A §4.5).
//
// A real run. Physical memory is modelled as 8-byte words: every page-table entry is a genuine x86-64 entry
// (frame number in bits 51:12, P/RW/US/A/D flags, NX on data pages), and the walker below reads those words at
// table + 8 × index exactly as the hardware does. The TLB is sim/machine.mjs's fully associative LRU TLB; the
// walker's reads go through machine.mjs's cache model, so a line it read once is cheap the next time. The page
// fault really finds P = 0, the "kernel" really allocates a frame, copies the page in and rewrites the entry,
// and the load really restarts. Invariants check every physical address on screen against machine.mjs's own
// page-table model (a second, independent implementation fed the same virtual → physical mapping).
//
// Costs (cycles at 3 GHz; the sources are in the README):
//   TLB lookup 1 · table read from DRAM 240 · table read that hits the cache (L2) 14 ·
//   #PF trap + kernel handler ≈ 1 µs = 3 000 · 4 KiB read from an NVMe SSD ≈ 20 µs = 60 000.

import { tlb as makeTlb, cache as makeCache, pageTable } from "../../sim/machine.mjs";
import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf, counterOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "Virtual memory",
  subtitle: "How one load finds its byte",
  kicker: "Operating systems",
  fig: 4,
  cite: {
    text: "Intel SDM Vol. 3A §4.5, 4-level paging · latencies: Drepper, “What Every Programmer Should Know About Memory”, 2007",
    url: "https://www.akkadia.org/drepper/cpumemory.pdf",
  },
  theme: "dark",
  hook: "A program never sees a real memory address. How does each load still find its byte, and quickly?",
  takeaway: "A TLB miss costs a four-level page walk, but the TLB keeps the answer, so the loads that follow in the same page cost one cycle each.",
};

const ADDRESSES = [
  { value: "0x7f3a2c108e48", label: "0x7f3a_2c10_8e48 · mmap'd buffer", what: "an mmap'd buffer" },
  { value: "0x555555559a20", label: "0x5555_5555_9a20 · heap", what: "the heap" },
  { value: "0x7ffde4b21f9c", label: "0x7ffd_e4b2_1f9c · stack", what: "the stack" },
];

export const params = {
  address: { label: "Virtual address", type: "select", options: ADDRESSES.map(({ value, label }) => ({ value, label })), value: ADDRESSES[0].value },
  custom: { label: "Or type a user address (hex)", type: "text", value: "" },
  tlbSize: { label: "TLB entries", type: "int", min: 2, max: 8, value: 8 },
  seed: { label: "Seed (physical layout)", type: "int", value: 11 },
};

export const scenarios = [
  { id: "miss", label: "TLB miss", whatIf: "the TLB has never seen the page",
    description: "The TLB has never seen this page, so the hardware walks four levels of page tables; later loads from it are cheap." },
  { id: "hit", label: "TLB hit", whatIf: "the TLB already knows the page",
    description: "The page's translation is already in the TLB: a one-cycle lookup and no page-table reads.",
    takeaway: "With the translation already in the TLB, a load costs one cycle and never touches the page tables." },
  { id: "fault", label: "Page fault", whatIf: "the page is not in memory",
    description: "The page is not in RAM: the walk finds it missing, the kernel reads it in from the SSD, and the load runs again.",
    takeaway: "A page that is not in RAM costs a trap and an SSD read, tens of thousands of cycles: that is why the OS keeps hot pages resident." },
];

export const counters = {
  cycles: { label: "cycles to translate", short: "cycles", format: "int", primary: true,
    hint: "CPU cycles spent turning virtual addresses into physical ones: TLB checks, page-table reads and any fault." },
  hits: { label: "TLB hits", format: "int", primary: ["miss", "hit"],
    hint: "Translations the TLB, a tiny cache of recent ones, answered on its own in about one cycle." },
  misses: { label: "TLB misses", format: "int",
    hint: "Lookups the TLB could not answer, so the page tables had to be walked." },
  dram: { label: "page-table reads from memory", short: "memory reads", format: "int", primary: ["miss", "fault"],
    hint: "Page-table entries read from main memory (DRAM), the slowest kind of read." },
  cached: { label: "page-table reads from cache", short: "cache reads", format: "int",
    hint: "Page-table entries the CPU cache already held: far cheaper than a read from memory." },
  faults: { label: "page faults", format: "int", primary: ["fault"],
    hint: "Times the page was not in RAM, so the kernel had to bring it in from storage." },
};

export const COST = { tlb: 1, dram: 240, cache: 14, trap: 3000, ssd: 60000 };
const GHZ = 3;

export const code = {
  lang: "c",
  source: [
    "// the MMU, on every load (x86-64, 4 KiB pages)",
    "u64 translate(u64 va) {",
    "    u64 vpn = va >> 12, off = va & 0xfff;",
    "    if (tlb_lookup(vpn, &pfn))                  // 1 cycle",
    "        return pfn << 12 | off;",
    "    u64 table = cr3 & ~0xfffull;                // the PML4's frame",
    "    for (int level = 3; level >= 0; level--) {  // PML4, PDPT, PD, PT",
    "        int i = (va >> (12 + 9 * level)) & 511;",
    "        u64 e = read64(table + 8 * i);          // a memory read",
    "        if (!(e & PRESENT))",
    "            raise(PAGE_FAULT, va);              // CR2 = va; the load restarts",
    "        table = e & 0x000ffffffffff000;         // next table, or the page",
    "    }",
    "    tlb_insert(vpn, table >> 12);",
    "    return table | off;",
    "}",
    "",
    "// the kernel, entered through #PF",
    "void do_page_fault(u64 va) {",
    "    pte_t *pte = lookup_pte(current->mm, va);",
    "    u64 frame = alloc_frame();",
    "    swap_read(pte_to_swp_entry(*pte), frame);   // 4 KiB from the SSD",
    "    *pte = frame | PRESENT | RW | USER;",
    "}                                               // iret: run the load again",
  ].join("\n"),
};

// ---- the machine: real entries in a sparse physical memory -------------------------------------------------

const LEVELS = ["PML4", "PDPT", "PD", "PT"];
const NEXT = ["the PDPT", "the page directory", "the page table", "the data page"];
const SHIFT = [39, 30, 21, 12];
const F = { P: 1n, RW: 2n, US: 4n, A: 0x20n, D: 0x40n, NX: 1n << 63n };
const TABLE = F.P | F.RW | F.US | F.A | F.D;          // 0x067, what Linux puts in a non-leaf entry
const DATA = TABLE | F.NX;                            // a user data page: no execute
const TEXT = F.P | F.US | F.A;                        // a user code page: read + execute
const FRAME_MASK = 0x000f_ffff_ffff_f000n;            // bits 51:12

const VA_FIELDS = [
  { name: "PML4", from: 39, to: 47, key: "PML4" },
  { name: "PDPT", from: 30, to: 38, key: "PDPT" },
  { name: "PD", from: 21, to: 29, key: "PD" },
  { name: "PT", from: 12, to: 20, key: "PT" },
  { name: "offset", from: 0, to: 11, key: "offset" },
];
const PA_BITS = 39;                                    // "address sizes: 39 bits physical, 48 bits virtual"
const PA_FIELDS = [
  { name: "frame number", from: 12, to: PA_BITS - 1, key: "frame" },
  { name: "offset", from: 0, to: 11, key: "offset" },
];

// pages a running process has mapped besides the one we load from (realistic x86-64 Linux layout)
const RESIDENTS = [
  [0x555555554000, "program text", TEXT], [0x555555555000, "program text", TEXT], [0x555555558000, "program data", DATA],
  [0x55555555a000, "heap", DATA], [0x55555555b000, "heap", DATA],
  [0x7f3a2c3e5000, "libc text", TEXT], [0x7f3a2c3e6000, "libc text", TEXT], [0x7f3a2c5d1000, "libc data", DATA],
  [0x7f3a2c412000, "ld.so", TEXT],
  [0x7ffde4b20000, "stack", DATA], [0x7ffde4b1f000, "stack", DATA], [0x7ffde4bfc000, "vdso", TEXT],
];

const index = (va, L) => Number((BigInt(va) >> BigInt(SHIFT[L])) & 511n);
const vpnOf = (va) => Math.floor(va / 4096);
const USER_TOP = 2 ** 47;                              // bit 47 = 0: the lower, user half of the address space

/** The address the figure loads from: the select, unless a valid user-space hex address was typed. */
export function resolveAddress(p) {
  const sel = ADDRESSES.find((a) => a.value === p.address) ?? ADDRESSES[0];
  const out = { va: Number(sel.value), what: sel.what, note: "" };
  const raw = String(p.custom ?? "").trim().toLowerCase().replace(/[_\s]/g, "");
  if (!raw) return out;
  const m = /^(0x)?([0-9a-f]{1,16})$/.exec(raw);
  if (!m) { out.note = `\`${fmt.escape(String(p.custom)).slice(0, 24)}\` is not a hex address`; return out; }
  const v = BigInt("0x" + m[2]);
  if (v >= 0x1000n && v < BigInt(USER_TOP)) { out.va = Number(v); out.what = "the address you typed"; return out; }
  out.note = v < 0x1000n ? "page 0 is never mapped" : "that is not a user-space address";
  return out;
}

const memo = new Map();
/**
 * Physical memory for one seed: frames from a seeded allocator, real page-table entries at table + 8 × index.
 * Pure (memoised); build() copies `words` before it changes anything.
 */
export function memoryMap(seed, va, scenario) {
  const k = `${seed}|${va}|${scenario}`;
  if (memo.has(k)) return memo.get(k);
  const r = rng(`${seed}/physical`);
  const used = new Set();
  const alloc = () => { for (;;) { const f = r.int(0x10000, 0xfffff); if (!used.has(f)) { used.add(f); return f; } } };
  const cr3 = alloc();
  const words = new Map();      // physical address (BigInt) -> 64-bit entry (BigInt); missing = 0
  const pages = new Map();      // vpn -> { pfn, flags, what }
  const leafAddr = (vpn, create) => {
    let table = BigInt(cr3) << 12n;
    for (let L = 0; L < 3; L++) {
      const at = table + 8n * BigInt(index(vpn * 4096, L));
      let e = words.get(at) ?? 0n;
      if (!(e & F.P)) { if (!create) return null; e = (BigInt(alloc()) << 12n) | TABLE; words.set(at, e); }
      table = e & FRAME_MASK;
    }
    return table + 8n * BigInt(index(vpn * 4096, 3));
  };
  const vpn = vpnOf(va);
  const list = RESIDENTS.map(([v, what, flags]) => ({ vpn: vpnOf(v), what, flags }));
  for (const d of [-1, 0, 1]) if (vpn + d >= 1 && (vpn + d) * 4096 < USER_TOP) list.push({ vpn: vpn + d, what: d ? "neighbouring page" : "target", flags: DATA });
  for (const pg of r.shuffle(list)) {
    if (pages.has(pg.vpn)) continue;
    const pfn = alloc();
    pages.set(pg.vpn, { pfn, flags: pg.flags, what: pg.what });
    words.set(leafAddr(pg.vpn, true), (BigInt(pfn) << 12n) | pg.flags);
  }
  let swapSlot = null, faultFrame = null;
  if (scenario === "fault") {
    // the kernel swapped this page out earlier: P = 0, and the rest of the entry is the kernel's (its swap slot)
    swapSlot = r.int(0x100, 0xfff);
    words.set(leafAddr(vpn, false), BigInt(swapSlot) << 12n);
    pages.set(vpn, { ...pages.get(vpn), pfn: null });
    faultFrame = alloc();
  }
  const out = { cr3, words, pages, vpn, swapSlot, faultFrame, seed };
  memo.set(k, out);
  return out;
}

/** The byte stored at (page, offset): printable ASCII, fixed per seed. */
const byteAt = (seed, vpn, off) => rng(`${seed}/data/${vpn}/${off}`).int(0x21, 0x7e);

// ---- formatting ---------------------------------------------------------------------------------------------

const hx = (n, w) => fmt.hex(n, w);
const vaHex = (v) => fmt.hex(v, 12);                                   // 0x7f3a_2c10_8e48
const paHex = (v) => fmt.hex(v, 8);                                    // 0x3c0d_ee48
const pfnHex = (f) => fmt.hex(f, 5);                                   // 0x3c0de
const vpnHex = (v) => fmt.hex(v, 9, { group: false });                 // 0x7f3a2c108
const offHex = (o) => fmt.hex(o, 3);                                   // 0xe48
const pteHex = (e) => fmt.hex(e, 16);                                  // 0x8000_0000_3c0d_e067
const tilePfn = (f) => f.toString(16).padStart(5, "0");                // 3c0de, as hardware dumps print it
const tileVpn = (v) => v.toString(16).padStart(9, "0");                // 7f3a2c108
const c = fmt.code;
const flagsOf = (e) => (e & F.P ? ["P", e & F.RW ? "RW" : "RO", e & F.US ? "US" : "S", e & F.A ? "A" : "", e & F.D ? "D" : "", e & F.NX ? "NX" : ""].filter(Boolean).join(" ") : "not present");
const plural = (n, one, many) => `${fmt.int(n)} ${n === 1 ? one : many ?? one + "s"}`;

// ---- the figure ---------------------------------------------------------------------------------------------

export function build(s, p, scenario, env = {}) {
  const sc = ["miss", "hit", "fault"].includes(scenario) ? scenario : "miss";
  const N = Math.max(2, Math.min(8, Math.round(Number(p.tlbSize) || 8)));
  const target = resolveAddress(p);
  const mem = memoryMap(p.seed, target.va, sc);
  const words = new Map(mem.words);                                   // the live physical memory (the kernel writes it)
  const portrait = !!env.portrait;
  const fault = sc === "fault";
  const va0 = target.va, vpn0 = vpnOf(va0), off0 = va0 % 4096;
  const cr3Base = BigInt(mem.cr3) << 12n;

  // the TLB, full of the process's other pages (in the hit scenario, ours too), in a seeded recency order
  const T = makeTlb({ entries: N, policy: "lru" });
  const others = s.rng.shuffle([...mem.pages.keys()].filter((v) => Math.abs(v - vpn0) > 1 && mem.pages.get(v).pfn !== null));
  const residents = others.slice(0, sc === "hit" ? N - 1 : N);
  if (sc === "hit") residents.splice(s.rng.int(0, residents.length), 0, vpn0);
  for (const v of residents) T.insert(v, mem.pages.get(v).pfn);
  for (let i = 0; i < N; i++) T.lookup(s.rng.pick(residents));       // the program touched some of them since
  const C = makeCache({ sets: 64, ways: 8, line: 64, addressBits: 40 }); // what the walker's reads go through: cold

  // ---- the opening picture ----
  s.column("addr", { align: "end", gap: 4 });
  // field names printed on the floor under each strip, centred on their bits (the engine's own bracket prints sit
  // under the strip's base plate and do not show; see README)
  const fieldNames = (id, width, fields) => {
    const W = width * 14 + 12;                                        // the strip's plate: 12 u bits on a 14 u pitch, 7 u pad
    s.free(`${id}.names`, { in: "addr" });
    s.spacer(`${id}.names.w`, { in: `${id}.names`, at: [0, 0], w: W, d: 12 });
    for (const f of fields) {
      const x0 = -W / 2 + 8 + (width - 1 - f.to) * 14, x1 = x0 + (f.to - f.from + 1) * 14 - 4;
      const span = f.to - f.from + 1;
      s.text(`${id}.names.${f.key}`, { in: `${id}.names`, at: [(x0 + x1) / 2, 0], text: span > 9 ? `${f.name} · bits ${f.to}–${f.from}` : `${f.name} · ${f.to}–${f.from}`, size: 7 });
    }
  };
  s.bits("va", { in: "addr", width: 48, value: va0, fields: VA_FIELDS, label: `virtual address · ${vaHex(va0)}` });
  fieldNames("va", 48, VA_FIELDS);
  s.spacer("addr.gap", { in: "addr", d: 14 });
  s.bits("pa", { in: "addr", width: PA_BITS, value: 0, fields: PA_FIELDS, label: "physical address · not known yet" });
  fieldNames("pa", PA_BITS, PA_FIELDS);

  // wide screens: CPU beside DRAM, one long row; portrait phones: CPU above DRAM, so the world is about square
  (portrait ? s.column : s.row)("machine", { gap: portrait ? 56 : 76 });
  s.row("cpu", { in: "machine", gap: 40, title: "CPU core" });
  const tlbState = () => ({ entries: N, policy: "LRU, fully associative", slots: T.slots().map((x) => (x ? `${vpnHex(x.vpn)} → ${pfnHex(x.pfn)}` : "empty")) });
  s.housing("tlb", { in: "cpu", variant: "chip", title: "TLB", sub: `${N} entries · LRU`, tray: { cols: 2, rows: N, of: "record" }, led: "idle", state: tlbState() });
  const regs = fault ? "regs" : "cpu";
  if (regs === "regs") s.column("regs", { in: "cpu", gap: 24 });
  s.housing("cr3", { in: regs, variant: "chip", title: "CR3", sub: paHex(Number(cr3Base)), tray: { cols: 1, rows: 1, of: "record" }, state: { cr3: paHex(Number(cr3Base)), holds: "physical address of the PML4" } });
  s.tile("cr3.v", { in: "cr3", of: "record", text: "PML4", sub: tilePfn(mem.cr3), state: { pml4: pfnHex(mem.cr3) } });
  if (fault) s.housing("kernel", { in: regs, variant: "chip", title: "kernel", sub: "#PF handler", led: "off", state: { handled: false } });

  const memCol = fault && portrait ? "memcol" : "machine";
  if (memCol === "memcol") s.column("memcol", { in: "machine", gap: 48, align: "end" });
  s.row("dram", { in: memCol, gap: portrait ? 26 : 40, title: "DRAM · physical memory" });

  // the walk the target address takes through today's tables, for the opening windows
  const pathOf = (va) => {
    const out = [];
    let table = cr3Base;
    for (let L = 0; L < 4; L++) {
      const i = index(va, L), addr = table + 8n * BigInt(i), e = words.get(addr) ?? 0n;
      out.push({ L, table, index: i, addr, e });
      if (!(e & F.P)) break;
      table = e & FRAME_MASK;
    }
    return out;
  };
  const path0 = pathOf(va0);
  const win = [];                                                      // per level: { table, first }
  const entryContent = (L, table, i) => {
    const addr = table + 8n * BigInt(i), e = words.get(addr) ?? 0n;
    const present = !!(e & F.P);
    return {
      text: String(i), sub: present ? tilePfn(Number((e & FRAME_MASK) >> 12n)) : e ? "P=0" : "—", tone: present ? null : e ? null : "ghost",
      state: { level: LEVELS[L], index: i, address: paHex(Number(addr)), entry: pteHex(e), flags: flagsOf(e), ...(present ? { next: paHex(Number(e & FRAME_MASK)) } : e ? { swap: hx(Number(e >> 12n), 3) } : {}) },
    };
  };
  const firstOf = (i) => Math.max(0, Math.min(509, i - 1));
  for (let L = 0; L < 4; L++) {
    const st = path0[L] ?? path0[path0.length - 1];
    const table = st.table, first = firstOf(st.index);
    win.push({ table, first });
    s.housing(`t${L}`, { in: "dram", title: LEVELS[L], sub: paHex(Number(table)), tray: { cols: 1, rows: 3, of: "record" }, led: "idle", state: { level: LEVELS[L], base: paHex(Number(table)), entries: "512 × 8 bytes" } });
    for (let k = 0; k < 3; k++) s.tile(`t${L}.e${k}`, { in: `t${L}`, of: "record", ...entryContent(L, table, first + k) });
  }
  const pfn0 = fault ? mem.faultFrame : mem.pages.get(vpn0).pfn;
  let byteWin = Math.max(0, Math.min(4093, off0 - 1));
  const byteContent = (vpn, o) => { const b = byteAt(mem.seed, vpn, o); return { text: offHex(o).slice(2), sub: b.toString(16), state: { offset: offHex(o), byte: hx(b, 2), char: String.fromCharCode(b) } }; };
  s.housing("page", { in: "dram", title: fault ? "free frame" : "page", sub: paHex(pfn0 * 4096), tray: { cols: 1, rows: 3, of: "record" }, led: "idle", state: { frame: pfnHex(pfn0), base: paHex(pfn0 * 4096), loads: [] } });
  if (fault) {
    s.housing("ssd", { in: memCol, variant: "store", title: "swap · SSD", sub: `slot ${hx(mem.swapSlot, 3)}`, tray: { cols: 1, rows: 3, of: "record" }, led: "idle", state: { device: "NVMe SSD", slot: hx(mem.swapSlot, 3), page: vpnHex(vpn0) } });
    for (let k = 0; k < 3; k++) s.tile(`page.b${k}`, { in: "ssd", of: "record", ...byteContent(vpn0, byteWin + k) });
  } else {
    for (let k = 0; k < 3; k++) s.tile(`page.b${k}`, { in: "page", of: "record", ...byteContent(vpn0, byteWin + k) });
  }
  // the TLB's slots: page number | frame number
  const showSlot = (k, o = {}) => {
    const x = T.slots()[k];
    return [
      { text: x ? tileVpn(x.vpn) : "", tone: x ? null : "ghost", state: x ? { slot: k, vpn: x.vpn, pfn: x.pfn, maps: `${vpnHex(x.vpn)} → ${pfnHex(x.pfn)}` } : { slot: k, empty: true }, ...o },
      { text: x ? tilePfn(x.pfn) : "", tone: x ? null : "ghost", state: x ? { slot: k, frame: pfnHex(x.pfn) } : { slot: k, empty: true } },
    ];
  };
  for (let k = 0; k < N; k++) {
    const [v, f] = showSlot(k);
    s.tile(`tlb.v${k}`, { in: "tlb", of: "record", ...v });
    s.tile(`tlb.p${k}`, { in: "tlb", of: "record", ...f });
  }
  s.trace("va-tlb", "va", "tlb");
  s.trace("miss", "tlb", "cr3");
  s.trace("w0", "cr3", "t0");
  for (let L = 1; L < 4; L++) s.trace(`w${L}`, `t${L - 1}`, `t${L}`);
  s.trace("w4", "t3", "page");
  if (fault) s.trace("swap-in", "ssd", "page");

  // ---- helpers that narrate the real run ----
  let vaShown = BigInt(va0), paShown = 0n;
  const bitOf = (v, b) => (v >> BigInt(b)) & 1n;
  const vaCells = (from, to) => { const out = []; for (let b = to; b >= from; b--) out.push(`va[${b}]`); return out; };
  const paCells = (from, to) => { const out = []; for (let b = to; b >= from; b--) out.push(`pa[${b}]`); return out; };
  const showBits = (id, cur, next, from, to) => {
    const changed = [];
    for (let b = from; b <= to; b++) if (bitOf(cur, b) !== bitOf(next, b)) { s.set(`${id}[${b}]`, { text: String(bitOf(next, b)) }); changed.push(`${id}[${b}]`); }
    return changed;
  };
  const setVA = (v) => { const ch = showBits("va", vaShown, BigInt(v), 0, 47); vaShown = BigInt(v); s.set("va", { label: `virtual address · ${vaHex(v)}` }); return ch; };
  const setPA = (frame, off) => {
    const next = (frame === null ? 0n : BigInt(frame) << 12n) | BigInt(off);
    const ch = showBits("pa", paShown, next, 0, PA_BITS - 1);
    paShown = next;
    s.set("pa", { label: frame === null ? "physical address · not known yet" : `physical address · ${paHex(Number(next))}` });
    return ch;
  };
  const mid = (L) => `va[${Math.floor((VA_FIELDS[L].from + VA_FIELDS[L].to) / 2)}]`;
  const fieldCells = (L) => vaCells(VA_FIELDS[L].from, VA_FIELDS[L].to);
  let keyedEntry = [null, null, null, null], keyedTlb = null, keyedByte = null;
  const logLoads = [];
  let cycles = 0;
  const spend = (n) => { cycles += n; s.count("cycles", n); };

  // show the window of a table around entry i (moving it only when i is outside), and colour the entry by its field
  function entryTile(L, table, i) {
    const w = win[L];
    if (w.table !== table || i < w.first || i > w.first + 2) {
      if (w.table !== table) s.set(`t${L}`, { sub: paHex(Number(table)), state: { level: LEVELS[L], base: paHex(Number(table)), entries: "512 × 8 bytes" } });
      w.table = table; w.first = firstOf(i);
      for (let k = 0; k < 3; k++) s.set(`t${L}.e${k}`, { ...entryContent(L, table, w.first + k), key: null });
      keyedEntry[L] = null;
    }
    const id = `t${L}.e${i - w.first}`;
    if (keyedEntry[L] && keyedEntry[L] !== id) s.set(keyedEntry[L], { key: null });
    keyedEntry[L] = id;
    return id;
  }
  function byteTile(o) {
    if (o < byteWin || o > byteWin + 2) {
      byteWin = Math.max(0, Math.min(4093, o - 1));
      for (let k = 0; k < 3; k++) s.set(`page.b${k}`, { ...byteContent(vpnOf(Number(vaShown)), byteWin + k), key: null });
      keyedByte = null;
    }
    const id = `page.b${o - byteWin}`;
    if (keyedByte && keyedByte !== id) s.set(keyedByte, { key: null });
    keyedByte = id;
    return id;
  }

  function splitOffset(va, first) {
    const off = va % 4096;
    s.lit(...vaCells(0, 11));
    s.tag(mid(4), c(offHex(off)));
    s.beat();
    const ch = setPA(null, off);
    s.lit(...paCells(0, 11));
    s.focus("va", "pa");
    s.line(3);
    s.step(first
      ? `The low 12 bits are the byte's place inside its 4 KiB page, offset ${c(offHex(off))}. They pass into the physical address untranslated.`
      : `Its offset, ${c(offHex(off))}, again goes straight into the physical address${ch.length ? "" : " (it was already there)"}.`);
  }
  function splitVpn(va) {
    s.lit(...vaCells(12, 47));
    s.tag("va[30]", `VPN ${vpnHex(vpnOf(va))}`);
    s.focus("va");
    s.line(3);
    s.step(`The upper 36 bits are the virtual page number, ${c(vpnHex(vpnOf(va)))}. Only this part needs translating.`);
  }
  function lookup(va, { quiet } = {}) {
    const vpn = vpnOf(va);
    s.send(s.uid("vpn"), "va", "tlb", { via: "va-tlb", text: vpnHex(vpn) });
    s.beat();
    const r = T.lookup(vpn);
    spend(COST.tlb);
    s.line(4);
    if (r.hit) {
      s.count("hits");
      s.lit(`tlb.v${r.slot}`, `tlb.p${r.slot}`);
      if (keyedTlb && keyedTlb !== `tlb.p${r.slot}`) s.set(keyedTlb, { key: null });
      s.set(`tlb.p${r.slot}`, { key: "frame" });
      keyedTlb = `tlb.p${r.slot}`;
      s.tag(`tlb.v${r.slot}`, "hit", { tone: "ok" });
      s.set("tlb", { led: "ok" });
    } else {
      s.count("misses");
      s.lit(...Array.from({ length: N }, (_, k) => `tlb.v${k}`));
      s.tag("tlb", "miss", { tone: "warn" });
      s.set("tlb", { led: "warn" });
    }
    s.focus("va", "tlb");
    if (!quiet) {
      s.step(r.hit
        ? `The {ref:tlb|TLB} has ${c(vpnHex(vpn))} in entry ${r.slot}: a {tone:ok|hit}, frame ${c(pfnHex(r.pfn))}, in 1 cycle.`
        : `The {ref:tlb|TLB} checks ${c(vpnHex(vpn))} against all ${N} cached page numbers at once: a {tone:warn|miss}, 1 cycle.`);
    }
    return r;
  }

  // one level of the walk: the read goes from the previous table (or CR3) to this one, and returns its entry
  function readLevel(L, va, table, { warm, tags = true } = {}) {
    const i = index(va, L), addr = table + 8n * BigInt(i), e = words.get(addr) ?? 0n;
    const tile = entryTile(L, table, i);
    s.lit(...fieldCells(L));
    if (tags && !warm) s.tag(mid(L), String(i));
    s.send(s.uid("rd"), L ? `t${L - 1}` : "cr3", `t${L}`, { via: `w${L}`, key: VA_FIELDS[L].key, text: paHex(Number(addr)) });
    s.beat();
    const hit = C.access(Number(addr)).hit;
    const cost = hit ? COST.cache : COST.dram;
    s.count(hit ? "cached" : "dram");
    spend(cost);
    const present = !!(e & F.P);
    s.set(tile, { key: VA_FIELDS[L].key, tone: present ? null : "fail" });
    s.lit(tile);
    if (tags) s.tag(tile, hit ? `cache · ${COST.cache} cycles` : `DRAM · ${COST.dram} cycles`, hit ? { tone: "ok" } : {});
    s.line(8, 9);
    return { L, i, addr, e, present, next: e & FRAME_MASK, cost, hit, tile };
  }
  const bitsText = (L) => `Bits ${VA_FIELDS[L].to}–${VA_FIELDS[L].from}`;
  const costText = (rd) => (rd.hit ? `cache, ${rd.cost} cycles` : `DRAM, ${rd.cost} cycles`);

  // a cold walk: one step per level, so each read is its own moment
  function coldWalk(va) {
    s.send(s.uid("go"), "tlb", "cr3", { via: "miss" });
    s.beat();
    s.lit("cr3.v");
    s.tag("cr3", "PML4 base", {});
    s.set("tlb", { led: "idle" });
    s.line(6);
    s.focus("tlb", "cr3", "t0");
    s.step(`On a miss the hardware walks the page tables. {ref:cr3|CR3} holds the PML4's physical address, ${c(paHex(Number(cr3Base)))}.`);
    const path = [];
    let table = cr3Base;
    for (let L = 0; L < 4; L++) {
      const rd = readLevel(L, va, table);
      path.push({ table: hx(table, 10), index: rd.i, entry: pteHex(rd.e) });
      s.focus("va", L ? `t${L - 1}` : "cr3", `t${L}`);
      if (!rd.present) {
        s.set(`t${L}`, { led: "fail" });
        s.line(10, 11);
        s.step(`${bitsText(L)} = ${rd.i}: entry ${c(paHex(Number(rd.addr)))} has P = 0 (${costText(rd)}). The page is not in memory: a {tone:fail|page fault}.`);
        return { path, fault: rd };
      }
      s.step(`${bitsText(L)} = ${rd.i}: entry ${c(paHex(Number(rd.addr)))} holds ${NEXT[L]}'s frame, ${c(pfnHex(Number(rd.next >> 12n)))} (${costText(rd)}).`);
      table = rd.next;
    }
    return { path, frame: Number(table >> 12n) };
  }
  // a warm walk: the same reads in one step, beat by beat
  function warmWalk(va, prev) {
    s.send(s.uid("go"), "tlb", "cr3", { via: "miss" });
    s.set("tlb", { led: "idle" });
    s.beat();
    const path = [], reads = [];
    let table = cr3Base;
    for (let L = 0; L < 4; L++) {
      const rd = readLevel(L, va, table, { warm: true, tags: false });
      reads.push(rd);
      path.push({ table: hx(table, 10), index: rd.i, entry: pteHex(rd.e) });
      table = rd.next;
      if (L < 3) s.beat();
    }
    const hits = reads.filter((r) => r.hit).length;
    const pt = reads[3];
    const prevPt = prev?.[3];
    const sameLine = prevPt && prevPt.addr !== pt.addr && (prevPt.addr >> 6n) === (pt.addr >> 6n);
    if (sameLine) s.tag(pt.tile, `same 64 B line as PT[${prevPt.i}]`, { tone: "ok" });
    else s.tag(pt.tile, pt.hit ? "cached" : "DRAM", pt.hit ? { tone: "ok" } : {});
    const cost = reads.reduce((a, r) => a + r.cost, 0);
    s.focus("tlb", "cr3", "t0", "t1", "t2", "t3");
    s.line(7, 12);
    s.step(hits === 4
      ? `The walk reads 4 entries again, but every line is already in the cache: ${COST.cache} cycles each, ${cost} in all.`
      : `The walk reads 4 entries again: ${hits} hit the cache and ${4 - hits} go to DRAM, ${cost} cycles in all.`);
    return { path, frame: Number(table >> 12n), reads };
  }
  function formPA(va, frame, from) {
    const off = va % 4096;
    if (from === "tlb") s.send(s.uid("pfn"), "tlb", "pa", { via: "air", key: "frame", text: pfnHex(frame) });
    else s.send(s.uid("pfn"), "t3", "page", { via: "w4", key: "frame", text: pfnHex(frame) });
    s.beat();
    setPA(frame, off);
    s.lit(...paCells(12, PA_BITS - 1));
    s.line(from === "tlb" ? 5 : 15);
    s.focus(from === "tlb" ? "tlb" : "t3", "pa", ...(from === "tlb" ? [] : ["page"]));
    const pa = frame * 4096 + off;
    s.step(from === "tlb"
      ? `PA = ${c(`${pfnHex(frame)} << 12 | ${offHex(off)}`)} = ${c(paHex(pa))}, without reading a single page table.`
      : `Frame ${c(pfnHex(frame))}, shifted past the offset: PA = ${c(`${pfnHex(frame)} << 12 | ${offHex(off)}`)} = ${c(paHex(pa))}.`);
    return pa;
  }
  function fill(va, frame) {
    const vpn = vpnOf(va);
    const ins = T.insert(vpn, frame);
    s.send(s.uid("fill"), "t3", "tlb", { via: "air", key: "frame", text: `${vpnHex(vpn)} → ${pfnHex(frame)}` });
    s.beat();
    const [v, f] = showSlot(ins.slot);
    if (ins.evicted) s.tag(`tlb.v${ins.slot}`, `evict ${tileVpn(ins.evicted.vpn)}`, { tone: "warn" });
    s.set(`tlb.v${ins.slot}`, { text: v.text, tone: null, state: v.state });
    if (keyedTlb && keyedTlb !== `tlb.p${ins.slot}`) s.set(keyedTlb, { key: null });
    s.set(`tlb.p${ins.slot}`, { text: f.text, tone: null, key: "frame", state: f.state });
    keyedTlb = `tlb.p${ins.slot}`;
    s.lit(`tlb.v${ins.slot}`, `tlb.p${ins.slot}`);
    s.set("tlb", { state: tlbState() });
    s.line(14);
    s.focus("t3", "tlb");
    const what = ins.evicted ? mem.pages.get(ins.evicted.vpn)?.what : null;
    s.step(`The {ref:tlb|TLB} keeps ${c(`${vpnHex(vpn)} → ${pfnHex(frame)}`)}` + (ins.evicted
      ? `, evicting ${c(vpnHex(ins.evicted.vpn))}${what ? ` (${what})` : ""}, its least recently used entry.`
      : " in a free entry."));
  }
  function readByte(va, pa, via, path, extra) {
    const off = va % 4096;
    const t = byteTile(off);
    const b = byteAt(mem.seed, vpnOf(va), off);
    s.set(t, { key: "offset" });
    s.lit(t);
    s.tag(t, `al = ${hx(b, 2)} '${String.fromCharCode(b)}'`);
    logLoads.push({ va: vaHex(va), pa: paHex(pa), via, ...(path ? { path } : {}) });
    s.set("page", { state: { frame: pfnHex(Math.floor(pa / 4096)), base: paHex(Math.floor(pa / 4096) * 4096), loads: logLoads.slice() } });
    s.focus("page", "pa");
    s.line(null);
    s.step(`The load reads byte ${c(hx(b, 2))} at ${c(paHex(pa))}. ${extra}`);
  }

  // ---- the run ----
  s.phase("Address", { about: "Programs use virtual addresses, so the CPU must translate each one before it can read memory. The low 12 bits are the byte's offset inside a 4 KiB page; the upper bits name the page." });
  s.line(2);
  s.step(`${c("movzx eax, byte [rdi]")} loads one byte from ${target.what} at ${c(vaHex(va0))}. Where is it in physical memory?` +
    (target.note ? ` (You typed an address the figure cannot use: ${target.note}.)` : ""));
  splitOffset(va0, true);
  splitVpn(va0);

  s.phase("TLB", { about: "First the CPU checks the TLB, a tiny cache of recent page translations. A hit gives the physical frame in about one cycle; a miss means reading the page tables in memory." });
  if (sc === "hit") {
    const r = lookup(va0);
    s.phase("Load", { about: "The TLB had the frame, so the CPU joins frame number and offset into a physical address and reads the byte. The page tables were never touched." });
    const pa = formPA(va0, r.pfn, "tlb");
    readByte(va0, pa, "tlb", null, `The page tables were never touched: a walk from DRAM would have added 4 × ${COST.dram} = ${4 * COST.dram} cycles.`);
    s.focus("tlb", "t0", "t1", "t2", "t3");
    s.step(`Translation cost ${plural(cycles, "cycle")}. Programs touch the same pages over and over, so real TLBs hit over 99% of the time.`);
    return;
  }

  lookup(va0);
  s.phase("Page walk", { about: "On a miss, the hardware walks four levels of page tables. Each 9-bit slice of the page number picks an entry that points to the next table" +
    (fault ? ", until the last entry says the page is not in memory." : ", until the last one gives the physical frame.") });
  let w = coldWalk(va0);

  if (fault) {
    s.phase("Page fault", { about: "The last entry's present bit is 0: the page is not in RAM. The CPU traps into the kernel, which reads the page from the SSD into a free frame, maps it and returns." });
    const pt = w.fault;
    s.send(s.uid("pf"), "t3", "kernel", { via: "air", tone: "fail", text: "#PF" });
    s.beat();
    s.set("kernel", { led: "busy" });
    s.tag("kernel", `CR2 = ${vaHex(va0)}`, { tone: "fail" });
    s.count("faults");
    spend(COST.trap);
    s.line(19, 20);
    s.focus("t3", "kernel");
    s.step(`#PF: the CPU saves the address in CR2 and traps into the {ref:kernel|kernel} (≈ 1 µs, ${fmt.int(COST.trap)} cycles at ${GHZ} GHz).`);

    s.set("ssd", { led: "busy", state: { device: "NVMe SSD", slot: hx(mem.swapSlot, 3), page: vpnHex(vpn0), reads: 1 } });
    s.set("page", { title: "page", led: "busy" });
    s.beat();
    for (let k = 0; k < 3; k++) s.move(`page.b${k}`, "page", { via: "swap-in" });
    spend(COST.ssd);
    s.line(21, 22);
    s.focus("ssd", "page");
    s.step(`The entry names swap slot ${c(hx(mem.swapSlot, 3))}. The kernel reads those 4 KiB from the SSD into free frame ${c(pfnHex(mem.faultFrame))}: ≈ 20 µs, ${fmt.int(COST.ssd)} cycles.`);

    const pte = (BigInt(mem.faultFrame) << 12n) | DATA;
    words.set(pt.addr, pte);
    C.access(Number(pt.addr), { write: true });                       // the kernel's store leaves the line in the cache
    s.send(s.uid("wr"), "kernel", "t3", { via: "air", text: pteHex(pte) });
    s.beat();
    s.set(pt.tile, { ...entryContent(3, win[3].table, pt.i), key: "PT", tone: null });
    s.lit(pt.tile);
    s.set("t3", { led: "idle" });
    s.set("ssd", { led: "idle", state: { device: "NVMe SSD", slot: "freed", page: vpnHex(vpn0), reads: 1 } });
    s.set("page", { led: "idle" });
    s.set("kernel", { led: "idle", state: { handled: true, frame: pfnHex(mem.faultFrame), slot: hx(mem.swapSlot, 3) } });
    s.line(23, 24);
    s.focus("kernel", "t3");
    s.step(`It writes PT[${pt.i}] = frame ${c(pfnHex(mem.faultFrame))} with P = 1 and returns. The CPU runs the same load again, from the top.`);

    s.phase("Retry", { about: "The CPU runs the same load again from the start. The TLB still misses, so it walks again, this time finds the page, fills the TLB and reads the byte." });
    s.ask("The load runs again. Does the TLB hit this time?", ["Yes: the kernel just mapped the page", "No: it misses and walks again"], 1);
    lookup(va0, { quiet: true });
    s.step(`Still a TLB {tone:warn|miss}: the CPU never caches a not-present entry, and the kernel does not fill the TLB.`);
    const prev = null;
    w = warmWalk(va0, prev);
    const pa = formPA(va0, w.frame, "walk");
    fill(va0, w.frame);
    readByte(va0, pa, "walk", w.path, `${plural(cycles, "cycle")} for one byte; the SSD read alone is ${fmt.pct(COST.ssd / cycles)}.`);
    s.focus("tlb", "kernel", "t3", "ssd", "page");
    s.step(`A TLB hit costs 1 cycle and a cold walk ${1 + 4 * COST.dram}; this fault cost ${fmt.int(cycles)}. That gap is why the OS works so hard to keep pages resident.`);
    return;
  }

  // ---- TLB miss: the cold walk, then locality ----
  s.phase("Fill", { about: "The walk found the frame. The CPU stores the translation in the TLB, so later loads from this page skip the walk, then reads the byte." });
  const pa0 = formPA(va0, w.frame, "walk");
  fill(va0, w.frame);
  const first = cycles;
  readByte(va0, pa0, "walk", w.path, `Translating it cost ${plural(first, "cycle")}: 1 for the TLB and ${4 * COST.dram} for four DRAM reads.`);

  s.phase("Same page", { about: "The program reads on through the same page. Every load shares the page number, so each one hits the TLB entry just filled and costs one cycle." });
  let loads = 1;
  if (off0 < 4095) {
    const v1 = va0 + 1;
    const ch = setVA(v1);
    s.lit(...ch);
    s.beat();
    setPA(null, v1 % 4096);
    s.lit(...paCells(0, 11));
    s.focus("va", "pa");
    s.line(2, 3);
    s.step(`The program is scanning the buffer: the next load reads ${c("rdi + 1")} = ${c(vaHex(v1))}, in the same page.`);
    s.ask(`How many cycles will translating ${vaHex(v1)} take?`, ["1", `${1 + 4 * COST.dram}`, `${1 + 4 * COST.cache}`], 0);
    const r = lookup(v1, { quiet: true });
    s.step(`TLB {tone:ok|hit}: same page, same entry, frame ${c(pfnHex(r.pfn))} in 1 cycle. No walk at all.`);
    loads++;
    const pa1 = formPA(v1, r.pfn, "tlb");
    readByte(v1, pa1, "tlb", null, `Two loads, ${plural(cycles, "cycle")} of translation.`);
    const last = vpn0 * 4096 + 4095;
    const rest = last - v1;
    if (rest > 0) {
      const chr = setVA(last);
      s.lit(...chr);
      s.beat();
      setPA(r.pfn, 4095);
      for (let i = 0; i < rest; i++) T.lookup(vpn0);
      s.count("hits", rest);
      spend(rest * COST.tlb);
      loads += rest;
      logLoads.push({ va: `${vaHex(v1 + 1)} … ${vaHex(last)}`, loads: rest, via: "tlb" });
      const slot = T.slots().findIndex((x) => x && x.vpn === vpn0);
      s.lit(`tlb.v${slot}`, `tlb.p${slot}`);
      s.tag(`tlb.v${slot}`, `${fmt.int(rest)} hits`, { tone: "ok" });
      s.focus("va", "pa", "tlb");
      s.step(`The scan reads on to the end of the page: ${fmt.int(rest)} more loads, up to ${c(vaHex(last))}, all {tone:ok|hit} this entry at 1 cycle each.`);
    }
  }
  const v2 = (vpn0 + 1) * 4096;
  if (v2 < USER_TOP && mem.pages.has(vpn0 + 1)) {
    s.phase("Next page", { about: "Crossing into the next page needs a new translation, so the TLB misses again. Neighbouring pages share most of the walk, so its table reads can come from the CPU cache instead of DRAM." });
    const prevReads = [0, 1, 2, 3].map((L) => ({ i: index(va0, L), addr: pathOf(va0)[L].addr }));
    const ch = setVA(v2);
    s.lit(...ch);
    s.beat();
    setPA(null, 0);
    s.focus("va", "pa");
    s.line(2, 3);
    s.step(`At ${c(vaHex(v2))} the scan crosses into the next page, ${c(vpnHex(vpn0 + 1))}: a new page number, so a new translation.`);
    lookup(v2);
    const ptSame = (prevReads[3].addr >> 6n) === (pathOf(v2)[3].addr >> 6n);
    // the answer comes from the cache model, not from an assumption: probe the lines the walk will read
    const dramReads = pathOf(v2).filter((x) => !C.lookup(Number(x.addr)).hit).length;
    const choices = ["All 4, like last time", "None of them", "Just the PT entry"];
    const answer = dramReads === 4 ? 0 : dramReads === 0 ? 1 : dramReads === 1 && !C.lookup(Number(pathOf(v2)[3].addr)).hit ? 2 : -1;
    if (answer >= 0) s.ask(`The walk for page ${vpnHex(vpn0 + 1)} reads four entries again. How many come from DRAM?`, choices, answer);
    const ww = warmWalk(v2, prevReads);
    loads++;
    const pa2 = formPA(v2, ww.frame, "walk");
    fill(v2, ww.frame);
    readByte(v2, pa2, "walk", ww.path, ptSame
      ? `Eight 8-byte entries share a 64-byte line, so neighbouring pages walk almost for free.`
      : `This page's entry lives in another line, so part of the walk went back to DRAM.`);
  }
  s.focus("va", "tlb", "t0", "t1", "t2", "t3", "page");
  s.step(`${fmt.int(loads)} loads, ${fmt.int(cycles)} translation cycles: ${fmt.num(cycles / loads, 1)} per load. One cold walk, then locality pays it back.`);
}

// ---- invariants ---------------------------------------------------------------------------------------------

const scenarioId = (x) => (typeof x === "string" ? x : x?.id ?? "miss");
const refOf = (ctx) => { const t = resolveAddress(ctx.params); return memoryMap(ctx.params.seed, t.va, scenarioId(ctx.scenario)); };
const oracles = new Map();
/** machine.mjs's page-table model holding the same virtual → physical mapping (its own table frames). */
function oracle(mem, handled) {
  const k = `${mem.seed}|${mem.vpn}|${mem.faultFrame}|${handled}|${mem.swapSlot}`;
  if (oracles.has(k)) return oracles.get(k);
  const pt = pageTable();
  for (const [vpn, pg] of mem.pages) {
    const pfn = pg.pfn ?? (handled && vpn === mem.vpn ? mem.faultFrame : null);
    if (pfn !== null) pt.map(vpn * 4096, pfn * 4096);
  }
  oracles.set(k, pt);
  return pt;
}
const readBits = (snap, id, width) => {
  let v = 0n;
  for (let b = 0; b < width; b++) {
    const r = snap.entities.get(`${id}[${b}]`);
    if (!r) return null;
    if (r.text === "1") v |= 1n << BigInt(b);
  }
  return v;
};
const handledIn = (snap) => !!stateOf(snap, "kernel")?.handled;

export const invariants = {
  // the physical address on screen is what an independent page-table model says this virtual address maps to
  "physical address = reference translation": (snap, ctx) => {
    const va = readBits(snap, "va", 48), pa = readBits(snap, "pa", PA_BITS);
    if (va === null || pa === null) return "the address strips are missing";
    if (pa >> 12n === 0n) return true;                                 // the frame part is not known yet
    const want = oracle(refOf(ctx), handledIn(snap)).translate(Number(va));
    if (want === null) return `PA ${paHex(Number(pa))} is shown for ${vaHex(Number(va))}, which the reference says faults`;
    return BigInt(want) === pa || `PA ${paHex(Number(pa))} is shown for ${vaHex(Number(va))}; the reference says ${paHex(want)}`;
  },
  // every completed walk read exactly the entries the address bits select, each pointing at the next table
  "each walk follows the address bits": (snap, ctx) => {
    const loads = stateOf(snap, "page")?.loads ?? [];
    const cr3 = BigInt(refOf(ctx).cr3) << 12n;
    for (const ld of loads) {
      if (!ld.path) continue;
      const va = BigInt(ld.va.replaceAll("_", ""));
      let table = cr3;
      for (let L = 0; L < 4; L++) {
        const st = ld.path[L], e = BigInt(st.entry.replaceAll("_", ""));
        if (BigInt(st.table.replaceAll("_", "")) !== table) return `${ld.va}: level ${LEVELS[L]} read table ${st.table}, expected ${hx(table, 10)}`;
        if (st.index !== Number((va >> BigInt(SHIFT[L])) & 511n)) return `${ld.va}: ${LEVELS[L]} index ${st.index} is not bits ${SHIFT[L] + 8}–${SHIFT[L]} of the address`;
        if (!(e & F.P)) return `${ld.va}: a completed walk used a not-present ${LEVELS[L]} entry`;
        table = e & FRAME_MASK;
      }
      const pa = table | (va & 0xfffn);
      if (pa !== BigInt(ld.pa.replaceAll("_", ""))) return `${ld.va}: the walk ends at ${hx(pa, 8)} but the load used ${ld.pa}`;
    }
    return true;
  },
  // the TLB is a cache of the page tables: every entry it holds is a translation the tables really contain
  "TLB agrees with the page tables": (snap, ctx) => {
    const ref = oracle(refOf(ctx), handledIn(snap));
    const seen = new Set();
    for (let k = 0; k < 8; k++) {
      const st = stateOf(snap, `tlb.v${k}`);
      if (!st || st.empty) continue;
      if (seen.has(st.vpn)) return `page ${vpnHex(st.vpn)} is in the TLB twice`;
      seen.add(st.vpn);
      const want = ref.translate(st.vpn * 4096);
      if (want !== st.pfn * 4096) return `TLB slot ${k} maps ${vpnHex(st.vpn)} → ${pfnHex(st.pfn)}; the page tables say ${want === null ? "not present" : pfnHex(want / 4096)}`;
      const shown = snap.entities.get(`tlb.p${k}`)?.text;
      if (shown !== tilePfn(st.pfn)) return `TLB slot ${k} shows frame ${shown}, holds ${tilePfn(st.pfn)}`;
    }
    return true;
  },
  // the cycle meter is exactly the sum of the costs of the events the other meters count
  "cycles = sum of the step costs": (snap) => {
    const n = (k) => counterOf(snap, k);
    const ssdReads = stateOf(snap, "ssd")?.reads ?? 0;
    const want = (n("hits") + n("misses")) * COST.tlb + n("dram") * COST.dram + n("cached") * COST.cache + n("faults") * COST.trap + ssdReads * COST.ssd;
    return n("cycles") === want || `cycles ${n("cycles")} but the counted events cost ${want}`;
  },
};
