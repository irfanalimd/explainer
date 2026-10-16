// Virtual memory: how one load finds its byte. x86-64, 4 KiB pages, 4-level paging (Intel SDM Vol. 3A §4.5).
//
// A real run. Physical memory is modelled as 8-byte words: every page-table entry is a genuine x86-64 entry
// (frame number in bits 51:12, P/RW/US/A/D flags, NX on data pages), and the walker below reads those words at
// table + 8 × index exactly as the hardware does. The TLB is sim/machine.mjs's fully associative LRU TLB; the
// walker's reads go through machine.mjs's cache model, so a line it read once is cheap the next time. The page
// fault really finds P = 0, the "kernel" really allocates a frame, copies the page in and rewrites the entry,
// and the load really restarts. A second program really has its own tables (its own CR3), so the same virtual
// address walks to another frame; the CR3 write flushes the TLB, as it does on x86-64 without PCIDs.
// Invariants check every physical address on screen against machine.mjs's own page-table model (a second,
// independent implementation fed the same virtual → physical mapping, one per program).
//
// Costs (cycles at 3 GHz; the sources are in the README):
//   TLB lookup 1 · table read from DRAM 240 · table read that hits the cache (L2) 14 ·
//   #PF trap + kernel handler ≈ 1 µs = 3 000 · 4 KiB read from an NVMe SSD ≈ 20 µs = 60 000.
//
// The lesson (references/teaching.md; the full plan is in the README):
//   Reader    knows that programs read memory by address; has never met pages, page tables or the TLB.
//   Picture   a building where each program has its own apartment numbers. The building directory (one per
//             program, the page table) turns a number into a real room (the frame); the receptionist's sticky
//             notes of recent lookups are the TLB; a room whose boxes went to storage is a page out on disk.
//   Problem   two programs use the same address: if it were a real place, they would overwrite each other.
//   Ladder    apartment numbers · sticky notes · the directory · the real room · same page again (the aha:
//             one cycle) · another program (the same number, another room).
//   Wrong     "every read walks the directory" and "an address is one fixed place in memory".

import { tlb as makeTlb, cache as makeCache, pageTable } from "../../sim/machine.mjs";
import { rng } from "../../sim/rng.mjs";
import * as fmt from "../../sim/fmt.mjs";
import { stateOf, counterOf } from "../../sim/inspect.mjs";

export const meta = {
  title: "Virtual memory",
  subtitle: "How each program gets its own addresses, and how one read finds its byte",
  kicker: "Operating systems",
  fig: 4,
  level: "core",
  cite: {
    text: "Intel SDM Vol. 3A §4.5, 4-level paging · latencies: Drepper, “What Every Programmer Should Know About Memory”, 2007",
    url: "https://www.akkadia.org/drepper/cpumemory.pdf",
  },
  theme: "dark",
  hook: "Two programs can use the same memory address for their own data. Why don't they overwrite each other, and how is it fast?",
  terms: {
    "virtual address": "The number a program uses for a place in its memory: its own apartment number, not a real room.",
    page: "A block of 4,096 bytes. Memory is handed out, looked up and moved one block at a time.",
    offset: "How many bytes into its page a byte sits, counting from the page's start.",
    TLB: "Translation lookaside buffer: the CPU's few sticky notes of recently looked-up pages and their real rooms.",
    cycle: "One tick of the CPU's clock. A 3 GHz CPU ticks 3 billion times a second.",
    "page table": "A program's directory: for each of its pages, a line saying which real room holds it.",
    CR3: "A slot inside the CPU that holds where the running program's directory starts in memory.",
    frame: "A page-sized room of real memory. A page lives in one while it is in memory.",
    "physical address": "The real place in memory: the room's start plus the offset inside it.",
    "page fault": "The CPU finds a page is not in memory, stops, and asks the operating system to fetch it.",
    kernel: "The core of the operating system: it hands out memory and fetches pages back from disk.",
    cache: "Small, fast memory beside the CPU that keeps copies of recently read memory, so reading again is cheap.",
  },
  recap: [
    "A program's address is its own number, not a real place in memory.",
    "Sticky notes, the TLB, are checked first; a miss means a four-level directory walk.",
    "The note made every later read in that page take one cycle.",
    "Program B's same address led through its own directory to a different room.",
  ],
  takeaway: "Each program's addresses go through its own directory, so programs can't touch each other's memory; sticky notes make most lookups take one cycle.",
};

const ADDRESSES = [
  { value: "0x7f3a2c108e48", label: "0x7f3a_2c10_8e48 · a data buffer" },
  { value: "0x555555559a20", label: "0x5555_5555_9a20 · heap data" },
  { value: "0x7ffde4b21f9c", label: "0x7ffd_e4b2_1f9c · the stack" },
];

export const params = {
  address: { label: "Address the program reads", type: "select", options: ADDRESSES.map(({ value, label }) => ({ value, label })), value: ADDRESSES[0].value },
  custom: { label: "Or type your own address (hex)", type: "text", value: "" },
  tlbSize: { label: "Sticky notes (TLB size)", type: "int", min: 2, max: 8, value: 8 },
  seed: { label: "Seed (where pages land in memory)", type: "int", value: 11 },
};

export const scenarios = [
  { id: "miss", label: "A new address", whatIf: "the program reads a new address",
    description: "Nothing is noted for this page yet, so the CPU looks it up in the program's directory. Then a second program uses the same address." },
  { id: "hit", label: "A recent address", whatIf: "the page was used a moment ago",
    description: "The page was used a moment ago, so a sticky note already holds its room: one cycle, no directory.",
    takeaway: "With the page already on a sticky note, finding its room takes one cycle and never opens the directory.",
    recap: [
      "The page was used a moment ago, so a sticky note had its room.",
      "The real address came straight from the note, in one cycle.",
      "The directory was never opened.",
    ] },
  { id: "fault", label: "The page isn't in memory", whatIf: "the page was moved out to disk",
    description: "The page was moved out to disk: the CPU stops, the operating system fetches it back, and the read starts over.",
    takeaway: "A page out on disk costs tens of thousands of cycles. That is why the operating system keeps busy pages in memory.",
    recap: [
      "The directory said the page was out on disk: a page fault.",
      "The kernel copied it into a free room and fixed the directory line.",
      "The read started over, walked the directory again and found the room.",
    ] },
];

export const counters = {
  cycles: { label: "cycles spent translating", short: "cycles", format: "int", primary: true,
    hint: "CPU clock ticks spent turning program addresses into real ones: sticky-note checks, directory reads and any trip to disk." },
  hits: { label: "answered by a sticky note", short: "note hits", format: "int", primary: ["miss", "hit"],
    hint: "Lookups the TLB, the CPU's sticky notes, answered on its own in one cycle." },
  misses: { label: "not on a sticky note", short: "note misses", format: "int",
    hint: "Lookups the sticky notes could not answer, so the directory had to be read." },
  dram: { label: "directory reads from memory", short: "memory reads", format: "int", primary: ["miss", "fault"],
    hint: "Directory lines (page-table entries) read from main memory: about 240 cycles each." },
  cached: { label: "directory reads from the cache", short: "cache reads", format: "int",
    hint: "Directory lines the CPU's small fast cache already held: about 14 cycles each." },
  faults: { label: "pages fetched from disk", short: "from disk", format: "int", primary: ["fault"],
    hint: "Times the page was not in memory, so the operating system had to bring it back from disk." },
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
const SHIFT = [39, 30, 21, 12];
const F = { P: 1n, RW: 2n, US: 4n, A: 0x20n, D: 0x40n, NX: 1n << 63n };
const TABLE = F.P | F.RW | F.US | F.A | F.D;          // 0x067, what Linux puts in a non-leaf entry
const DATA = TABLE | F.NX;                            // a user data page: no execute
const TEXT = F.P | F.US | F.A;                        // a user code page: read + execute
const FRAME_MASK = 0x000f_ffff_ffff_f000n;            // bits 51:12

// each field's bracket prints its name and its bits ("PML4 · bits 47–39")
const named = (f) => ({ ...f, label: `${f.name} · bits ${f.to}–${f.from}` });
const VA_FIELDS = [
  { name: "PML4", from: 39, to: 47, key: "PML4" },
  { name: "PDPT", from: 30, to: 38, key: "PDPT" },
  { name: "PD", from: 21, to: 29, key: "PD" },
  { name: "PT", from: 12, to: 20, key: "PT" },
  { name: "offset", from: 0, to: 11, key: "offset" },
].map(named);
const PA_BITS = 39;                                    // "address sizes: 39 bits physical, 48 bits virtual"
const PA_FIELDS = [
  { name: "frame number", from: 12, to: PA_BITS - 1, key: "frame" },
  { name: "offset", from: 0, to: 11, key: "offset" },
].map(named);

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
  const out = { va: Number(sel.value), note: "" };
  const raw = String(p.custom ?? "").trim().toLowerCase().replace(/[_\s]/g, "");
  if (!raw) return out;
  const m = /^(0x)?([0-9a-f]{1,16})$/.exec(raw);
  if (!m) { out.note = `\`${fmt.escape(String(p.custom)).slice(0, 24)}\` is not a hex address`; return out; }
  const v = BigInt("0x" + m[2]);
  if (v >= 0x1000n && v < BigInt(USER_TOP)) { out.va = Number(v); return out; }
  out.note = v < 0x1000n ? "page 0 is never mapped" : "that is not a user-space address";
  return out;
}

const memo = new Map();
/**
 * Physical memory for one seed: frames from a seeded allocator, real page-table entries at table + 8 × index.
 * Program A (the one we follow) has the target page, its neighbours and a realistic set of other pages; program B
 * (built last, so it never shifts A's layout) has its own tables mapping the same three virtual pages to frames of
 * its own. Pure (memoised); build() copies `words` before it changes anything.
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
  const leafAddr = (vpn, create, root = cr3) => {
    let table = BigInt(root) << 12n;
    for (let L = 0; L < 3; L++) {
      const at = table + 8n * BigInt(index(vpn * 4096, L));
      let e = words.get(at) ?? 0n;
      if (!(e & F.P)) { if (!create) return null; e = (BigInt(alloc()) << 12n) | TABLE; words.set(at, e); }
      table = e & FRAME_MASK;
    }
    return table + 8n * BigInt(index(vpn * 4096, 3));
  };
  const vpn = vpnOf(va);
  const near = [-1, 0, 1].filter((d) => vpn + d >= 1 && (vpn + d) * 4096 < USER_TOP).map((d) => vpn + d);
  const list = RESIDENTS.map(([v, what, flags]) => ({ vpn: vpnOf(v), what, flags }));
  for (const v of near) list.push({ vpn: v, what: v !== vpn ? "neighbouring page" : "target", flags: DATA });
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
  // program B: another CR3, other tables, the same virtual pages in frames of its own
  const other = { cr3: alloc(), pages: new Map() };
  for (const v of near) {
    const pfn = alloc();
    other.pages.set(v, { pfn, flags: DATA, what: "program B's data" });
    words.set(leafAddr(v, true, other.cr3), (BigInt(pfn) << 12n) | DATA);
  }
  const out = { cr3, words, pages, vpn, swapSlot, faultFrame, seed, other };
  memo.set(k, out);
  return out;
}

/** The byte stored at (page, offset) of a program: printable ASCII, fixed per seed. */
const byteAt = (seed, vpn, off, who = "A") => rng(`${seed}/data/${who === "A" ? "" : who}${vpn}/${off}`).int(0x21, 0x7e);

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
  let cr3Now = BigInt(mem.cr3) << 12n;                                 // the running program's PML4 (A, then B)

  // the TLB, full of the process's other pages (in the hit scenario, ours too), in a seeded recency order
  const T = makeTlb({ entries: N, policy: "lru" });
  const others = s.rng.shuffle([...mem.pages.keys()].filter((v) => Math.abs(v - vpn0) > 1 && mem.pages.get(v).pfn !== null));
  const residents = others.slice(0, sc === "hit" ? N - 1 : N);
  if (sc === "hit") residents.splice(s.rng.int(0, residents.length), 0, vpn0);
  for (const v of residents) T.insert(v, mem.pages.get(v).pfn);
  for (let i = 0; i < N; i++) T.lookup(s.rng.pick(residents));       // the program touched some of them since
  const C = makeCache({ sets: 64, ways: 8, line: 64, addressBits: 40 }); // what the walker's reads go through: cold

  // ---- the opening picture ----
  // wide screens: the CPU (TLB over CR3) beside the address, the rooms in one row under both, so the whole path
  // (address, sticky notes, directory, room) fits beside the explain panel; portrait phones: the address, then the
  // CPU (TLB beside CR3), then the rooms, so the world is about square
  if (portrait) {
    s.column("addr", { align: "end", gap: 4 });
    s.column("machine", { gap: 56 });
    s.row("cpu", { in: "machine", gap: 40, title: "CPU core" });
  } else {
    s.row("top", { gap: 12, align: "start" });
    s.column("cpu", { in: "top", gap: 28, title: "CPU core" });
    if (fault) s.column("side", { in: "top", align: "end", gap: 40 });   // the disk sits under the address
    s.column("addr", { in: fault ? "side" : "top", align: "end", gap: 4 });
  }
  const vaLabel = (v) => `the program's address (virtual) · ${vaHex(v)}`;
  s.bits("va", { in: "addr", width: 48, value: va0, fields: VA_FIELDS, label: vaLabel(va0) });
  s.spacer("addr.gap", { in: "addr", d: 14 });
  s.bits("pa", { in: "addr", width: PA_BITS, value: 0, fields: PA_FIELDS, label: "the real address (physical) · not known yet" });

  const tlbState = () => ({ entries: N, policy: "LRU, fully associative", slots: T.slots().map((x) => (x ? `${vpnHex(x.vpn)} → ${pfnHex(x.pfn)}` : "empty")) });
  s.housing("tlb", { in: "cpu", variant: "chip", title: "TLB", sub: `${N} sticky notes`, tray: { cols: 2, rows: N, of: "record" }, led: "idle", state: tlbState() });
  const regs = fault ? "regs" : "cpu";
  if (regs === "regs") (portrait ? s.column : s.row)("regs", { in: "cpu", gap: portrait ? 24 : 12 });
  const cr3State = (who) => ({ cr3: paHex(Number(cr3Now)), holds: `where program ${who}'s directory (its PML4) starts`, program: who });
  s.housing("cr3", { in: regs, variant: "chip", title: "CR3", sub: paHex(Number(cr3Now)), tray: { cols: 1, rows: 1, of: "record" }, state: cr3State("A") });
  s.tile("cr3.v", { in: "cr3", of: "record", text: "PML4", sub: tilePfn(mem.cr3), state: { pml4: pfnHex(mem.cr3) } });
  if (fault) s.housing("kernel", { in: regs, variant: "chip", title: "kernel", sub: "page faults", led: "off", state: { handled: false } });

  // portrait: the disk goes under the rooms; wide: under the address, beside the CPU
  const memCol = !portrait ? null : fault ? "memcol" : "machine";
  if (memCol === "memcol") s.column("memcol", { in: "machine", gap: 48, align: "end" });
  s.row("dram", { ...(memCol ? { in: memCol } : {}), gap: portrait ? 26 : 28, title: "main memory · the real rooms" });
  // On a wide screen the whole machine fits beside the explain panel at a readable size, so every step frames all of
  // it: the reader keeps the whole path (address, sticky notes, directory, room) in view while the lit parts move.
  // Portrait phones frame the step's own parts.
  const wide = !portrait && !env.phone;
  const see = (...ids) => s.focus(...ids, ...(wide ? ["cpu", "va", "pa", "dram", ...(fault ? ["ssd"] : [])] : []));

  // the walk an address takes through the running program's tables
  const pathOf = (va) => {
    const out = [];
    let table = cr3Now;
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
  const byteContent = (vpn, o, who = "A") => { const b = byteAt(mem.seed, vpn, o, who); return { text: offHex(o).slice(2), sub: b.toString(16), state: { offset: offHex(o), byte: hx(b, 2), char: String.fromCharCode(b), program: who } }; };
  s.housing("page", { in: "dram", title: fault ? "free room" : "page", sub: paHex(pfn0 * 4096), tray: { cols: 1, rows: 3, of: "record" }, led: "idle", state: { frame: pfnHex(pfn0), base: paHex(pfn0 * 4096), loads: [] } });
  if (fault) {
    s.housing("ssd", { in: portrait ? memCol : "side", variant: "store", title: "disk · SSD", sub: `slot ${hx(mem.swapSlot, 3)}`, tray: { cols: 1, rows: 3, of: "record" }, led: "idle", state: { device: "NVMe SSD", slot: hx(mem.swapSlot, 3), page: vpnHex(vpn0) } });
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
  // the walk is a chain of pointers, CR3 to each table to the page, followed one way: the arrows say which
  s.trace("w0", "cr3", "t0", { arrow: true });
  for (let L = 1; L < 4; L++) s.trace(`w${L}`, `t${L - 1}`, `t${L}`, { arrow: true });
  s.trace("w4", "t3", "page", { arrow: true });
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
  const setVA = (v) => { const ch = showBits("va", vaShown, BigInt(v), 0, 47); vaShown = BigInt(v); s.set("va", { label: vaLabel(v) }); return ch; };
  const setPA = (frame, off) => {
    const next = (frame === null ? 0n : BigInt(frame) << 12n) | BigInt(off);
    const ch = showBits("pa", paShown, next, 0, PA_BITS - 1);
    paShown = next;
    s.set("pa", { label: frame === null ? "the real address (physical) · not known yet" : `the real address (physical) · ${paHex(Number(next))}` });
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

  function splitOffset(va) {
    const off = va % 4096;
    s.lit(...vaCells(0, 11));
    s.tag(mid(4), c(offHex(off)));
    s.beat();
    setPA(null, off);
    s.lit(...paCells(0, 11));
    see("va", "pa");
    s.line(3);
    s.step(`The low 12 bits, ${c(offHex(off))}, are the {term:offset}, the byte's place in its {term:page}. They copy straight over.`, { keep: true });
  }
  function splitVpn(va) {
    s.lit(...vaCells(12, 47));
    s.tag("va[30]", `page ${vpnHex(vpnOf(va))}`);
    see("va");
    s.line(3);
    s.step(`The upper 36 bits, ${c(vpnHex(vpnOf(va)))}, name the page, the apartment. Only this part is looked up.`, { keep: true });
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
    see("va", "tlb");
    if (!quiet) {
      s.step(r.hit
        ? `Page ${c(vpnHex(vpn))} is on note ${r.slot + 1}: a {tone:ok|hit}. Its real room, {term:frame} ${c(pfnHex(r.pfn))}, in 1 cycle.`
        : `The {ref:tlb|TLB} checks all ${N} notes at once for page ${c(vpnHex(vpn))}: a {tone:warn|miss}, 1 cycle.`);
    }
    return r;
  }

  // one level of the walk: the read goes from the previous table (or CR3) to this one, and returns its entry
  function readLevel(L, va, table, { warm, tags = true } = {}) {
    const i = index(va, L), addr = table + 8n * BigInt(i), e = words.get(addr) ?? 0n;
    const tile = entryTile(L, table, i);
    s.lit(...fieldCells(L));
    if (tags && !warm) s.tag(mid(L), `line ${i}`);
    s.send(s.uid("rd"), L ? `t${L - 1}` : "cr3", `t${L}`, { via: `w${L}`, key: VA_FIELDS[L].key, text: paHex(Number(addr)) });
    s.beat();
    const hit = C.access(Number(addr)).hit;
    const cost = hit ? COST.cache : COST.dram;
    s.count(hit ? "cached" : "dram");
    spend(cost);
    const present = !!(e & F.P);
    s.set(tile, { key: VA_FIELDS[L].key, tone: present ? null : "fail" });
    s.lit(tile);
    if (tags) s.tag(tile, hit ? `cache · ${COST.cache} cycles` : `memory · ${COST.dram} cycles`, hit ? { tone: "ok" } : {});
    s.line(8, 9);
    return { L, i, addr, e, present, next: e & FRAME_MASK, cost, hit, tile };
  }
  const bitsText = (L) => `Bits ${VA_FIELDS[L].to}–${VA_FIELDS[L].from}`;

  // a cold walk: one step per level, so each read is its own moment
  function coldWalk(va) {
    s.send(s.uid("go"), "tlb", "cr3", { via: "miss" });
    s.beat();
    s.lit("cr3.v");
    s.tag("cr3", "directory starts here", {});
    s.set("tlb", { led: "idle" });
    s.line(6);
    see("tlb", "cr3", "t0");
    s.step(`On a miss, the CPU opens this program's directory. {term:CR3} holds where it starts: ${c(paHex(Number(cr3Now)))}.`, { keep: true });
    const path = [];
    let table = cr3Now;
    for (let L = 0; L < 4; L++) {
      const rd = readLevel(L, va, table);
      path.push({ table: hx(table, 10), index: rd.i, entry: pteHex(rd.e) });
      see("va", L ? `t${L - 1}` : "cr3", `t${L}`);
      if (!rd.present) {
        s.set(`t${L}`, { led: "fail" });
        s.line(10, 11);
        s.step(`${bitsText(L)} pick line ${rd.i} of level ${L + 1}, ${LEVELS[L]}: it says {tone:fail|not present}. The page isn't in memory.`);
        return { path, fault: rd };
      }
      s.step(L < 3
        ? `${bitsText(L)} pick line ${rd.i} of level ${L + 1}, ${LEVELS[L]}, which says where level ${L + 2} starts: ${rd.cost} cycles.`
        : `${bitsText(L)} pick line ${rd.i} of level 4, ${LEVELS[L]}, which gives the page's real room: {term:frame} ${c(pfnHex(Number(rd.next >> 12n)))}.`);
      table = rd.next;
    }
    return { path, frame: Number(table >> 12n) };
  }
  // a later walk: the same reads in one step, beat by beat; `say(reads, cost, hits)` writes its caption
  function quickWalk(va, say) {
    s.send(s.uid("go"), "tlb", "cr3", { via: "miss" });
    s.set("tlb", { led: "idle" });
    s.beat();
    const path = [], reads = [];
    let table = cr3Now;
    for (let L = 0; L < 4; L++) {
      const rd = readLevel(L, va, table, { warm: true, tags: false });
      reads.push(rd);
      path.push({ table: hx(table, 10), index: rd.i, entry: pteHex(rd.e) });
      table = rd.next;
      if (L < 3) s.beat();
    }
    const hits = reads.filter((r) => r.hit).length;
    const pt = reads[3];
    s.tag(pt.tile, hits === 4 ? "all from the cache" : hits === 0 ? "all from memory" : `${hits} of 4 from the cache`, hits === 4 ? { tone: "ok" } : {});
    const cost = reads.reduce((a, r) => a + r.cost, 0);
    see(...(fault ? [] : ["tlb"]), "cr3", "t0", "t1", "t2", "t3");
    s.line(7, 12);
    s.step(say(reads, cost, hits));
    return { path, frame: Number(table >> 12n), reads };
  }
  function formPA(va, frame, from, { page = "page", via = "w4", say } = {}) {
    const off = va % 4096;
    if (from === "tlb") s.send(s.uid("pfn"), "tlb", "pa", { via: "air", key: "frame", text: pfnHex(frame) });
    else s.send(s.uid("pfn"), "t3", page, { via, key: "frame", text: pfnHex(frame) });
    s.beat();
    setPA(frame, off);
    s.lit(...paCells(12, PA_BITS - 1));
    s.line(from === "tlb" ? 5 : 15);
    see(from === "tlb" ? "tlb" : "t3", "pa", ...(from === "tlb" ? [] : [page]));
    const pa = frame * 4096 + off;
    s.step(say ? say(pa) : from === "tlb"
      ? `Room ${c(pfnHex(frame))}, then offset ${c(offHex(off))}, side by side: real address ${c(paHex(pa))}, no directory opened.`
      : `Room ${c(pfnHex(frame))}, then offset ${c(offHex(off))}, side by side: the real address, the {term:physical address}, ${c(paHex(pa))}.`);
    return pa;
  }
  function fill(va, frame) {
    const vpn = vpnOf(va);
    const ins = T.insert(vpn, frame);
    s.send(s.uid("fill"), "t3", "tlb", { via: "air", key: "frame", text: `${vpnHex(vpn)} → ${pfnHex(frame)}` });
    s.beat();
    const [v, f] = showSlot(ins.slot);
    if (ins.evicted) s.tag(`tlb.v${ins.slot}`, `replaces ${tileVpn(ins.evicted.vpn)}`, { tone: "warn" });
    s.set(`tlb.v${ins.slot}`, { text: v.text, tone: null, state: v.state });
    if (keyedTlb && keyedTlb !== `tlb.p${ins.slot}`) s.set(keyedTlb, { key: null });
    s.set(`tlb.p${ins.slot}`, { text: f.text, tone: null, key: "frame", state: f.state });
    keyedTlb = `tlb.p${ins.slot}`;
    s.lit(`tlb.v${ins.slot}`, `tlb.p${ins.slot}`);
    s.set("tlb", { state: tlbState() });
    s.line(14);
    see(...(fault ? ["tlb"] : ["t3", "tlb"]));                     // the fault layout puts the kernel between them
    s.step(`A sticky note now maps page ${c(vpnHex(vpn))} to room ${c(pfnHex(frame))}` + (ins.evicted
      ? ", replacing the note used longest ago."
      : ", on a free note."));
  }
  function readByte(va, pa, via, path, extra) {
    const off = va % 4096;
    const t = byteTile(off);
    const b = byteAt(mem.seed, vpnOf(va), off);
    s.set(t, { key: "offset" });
    s.lit(t);
    s.tag(t, `${hx(b, 2)} '${String.fromCharCode(b)}'`);
    logLoads.push({ va: vaHex(va), pa: paHex(pa), via, who: "A", ...(path ? { path } : {}) });
    s.set("page", { state: { frame: pfnHex(Math.floor(pa / 4096)), base: paHex(Math.floor(pa / 4096) * 4096), loads: logLoads.slice() } });
    see("page", "pa");
    s.line(null);
    s.step(`The byte at ${c(paHex(pa))} is ${c(hx(b, 2))}. ${extra}`);
    return b;
  }

  // ---- the run ----
  s.phase("Apartment numbers", { about: "Think of a building where each program has its own apartment numbers. A directory per program turns a number into a real room, so two programs can use the same number safely." });
  s.line(2);
  see("va", "pa");
  s.step(`The program reads one byte at ${c(vaHex(va0))}. That number is its own address, a {term:virtual address}.` +
    (target.note ? ` (You typed an address the figure cannot use: ${target.note}.)` : ""), { keep: true });
  splitOffset(va0);
  splitVpn(va0);

  s.phase("Sticky notes", { about: "Reading the directory is slow, because it sits in memory too. So the CPU keeps sticky notes of recent lookups, the {term:TLB}, and checks them first, in one {term:cycle}." });
  if (sc === "hit") {
    const r = lookup(va0);
    s.phase("The real room", { about: "The note already had the room, so the CPU puts the offset after it to get the real address and reads the byte. The directory is never opened." });
    const pa = formPA(va0, r.pfn, "tlb");
    readByte(va0, pa, "tlb", null, `Walking the directory would have added ${4 * COST.dram} cycles.`);
    s.focus("tlb", "t0", "t1", "t2", "t3");
    s.step(`Finding the room cost ${plural(cycles, "cycle")}. Real programs reuse pages, so notes answer over 99% of lookups.`);
    return;
  }

  lookup(va0);
  s.phase("The directory", { about: "On a miss, the CPU reads this program's directory, the {term:page table}. It has four levels, and each 9-bit slice of the page number picks one line in one of them." });
  let w = coldWalk(va0);

  if (fault) {
    s.phase("Fetch from disk", { about: "The page's boxes went to storage: the operating system moved it to disk to free memory. This is a {term:page fault}: the CPU stops, and the {term:kernel} copies the page back." });
    const pt = w.fault;
    s.send(s.uid("pf"), "t3", "kernel", { via: "air", tone: "fail", text: "page fault" });
    s.beat();
    s.set("kernel", { led: "busy" });
    s.tag("kernel", `address ${vaHex(va0)}`, { tone: "fail" });
    s.count("faults");
    spend(COST.trap);
    s.line(19, 20);
    see("t3", "kernel");
    s.step(`The CPU stops the program and hands the address to the {term:kernel}: about 1 µs, ${fmt.int(COST.trap)} cycles.`);

    s.set("ssd", { led: "busy", state: { device: "NVMe SSD", slot: hx(mem.swapSlot, 3), page: vpnHex(vpn0), reads: 1 } });
    s.set("page", { title: "page", led: "busy" });
    s.beat();
    for (let k = 0; k < 3; k++) s.move(`page.b${k}`, "page", { via: "swap-in" });
    spend(COST.ssd);
    s.line(21, 22);
    see("ssd", "page");
    s.step(`Its directory line names disk slot ${c(hx(mem.swapSlot, 3))}. Copying 4 KiB into free room ${c(pfnHex(mem.faultFrame))} takes ${fmt.int(COST.ssd)} cycles.`);

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
    see("kernel", "t3");
    s.step(`The kernel writes room ${c(pfnHex(mem.faultFrame))} into line ${pt.i}, marks it present, and returns. The read starts over.`);

    s.phase("Try again", { about: "The CPU runs the same read again from the start. No sticky note has the page, so it walks the directory again; this time its lines are in the fast {term:cache}." });
    s.ask("The read starts over. Will a sticky note have the page now?",
      ["Yes: the kernel just put the page in memory", "No: no note was written, so it walks again"], 1,
      { why: "The CPU writes a note only after a walk that finds the room, and the kernel fixed the directory, not the notes." });
    lookup(va0, { quiet: true });
    s.step(`Still no note: a {tone:warn|miss}. The CPU only writes a note after a walk that succeeds.`, { keep: true });
    w = quickWalk(va0, (reads, cost, hits) => (hits === 4
      ? `The same 4 directory lines again, but now from the {term:cache}: ${COST.cache} cycles each, ${cost} in all.`
      : `The same 4 directory lines again: ${hits} from the {term:cache}, ${4 - hits} from memory, ${cost} cycles.`));
    const pa = formPA(va0, w.frame, "walk");
    fill(va0, w.frame);
    readByte(va0, pa, "walk", w.path, `${plural(cycles, "cycle")} for one byte, ${fmt.pct(COST.ssd / cycles)} of it the disk.`);
    s.focus("tlb", "kernel", "t3", "ssd", "page");
    s.step(`A note hit costs 1 cycle and a full walk ${1 + 4 * COST.dram}; this trip to disk cost ${fmt.int(cycles)}.`);
    return;
  }

  // ---- a new address: the cold walk, then the same page again, then another program ----
  s.phase("The real room", { about: "The walk found the page's room. The CPU puts the offset after the room number to get the real address, writes a sticky note for next time, and reads the byte." });
  const pa0 = formPA(va0, w.frame, "walk");
  fill(va0, w.frame);
  const first = cycles;
  const byteA = readByte(va0, pa0, "walk", w.path, `Finding its room cost ${plural(first, "cycle")}, mostly directory reads.`);

  let loads = 1;
  if (off0 < 4095) {
    s.phase("Same page again", { about: "The program reads on through the same page. Every byte there shares the page number, so the sticky note just written answers in one cycle." });
    const v1 = va0 + 1;
    const ch = setVA(v1);
    s.lit(...ch);
    s.beat();
    setPA(null, v1 % 4096);
    s.lit(...paCells(0, 11));
    see("va", "pa");
    s.line(2, 3);
    s.step(`Next it reads the following byte, ${c(vaHex(v1))}: the same page, one byte further in.`);
    s.ask("How long will finding this byte's room take?",
      [`${fmt.int(first)} cycles again: every read walks the directory`, "1 cycle: a sticky note has this page", "About half: part of the walk is remembered"], 1,
      { why: `Both bytes are in page ${vpnHex(vpn0)}, and the note written a moment ago already maps that page to its room.` });
    const r = lookup(v1, { quiet: true });
    s.step(`A sticky note {tone:ok|has} page ${c(vpnHex(vpn0))}: room ${c(pfnHex(r.pfn))} in 1 cycle, no directory read.`, { keep: true });
    loads++;
    const pa1 = formPA(v1, r.pfn, "tlb");
    readByte(v1, pa1, "tlb", null, `Two reads so far: ${plural(cycles, "cycle")}.`);
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
      logLoads.push({ va: `${vaHex(v1 + 1)} … ${vaHex(last)}`, loads: rest, via: "tlb", who: "A" });
      const slot = T.slots().findIndex((x) => x && x.vpn === vpn0);
      s.lit(`tlb.v${slot}`, `tlb.p${slot}`);
      s.tag(`tlb.v${slot}`, `${fmt.int(rest)} hits`, { tone: "ok" });
      see("va", "pa", "tlb");
      s.step(`It reads on to the page's end: ${fmt.int(rest)} more bytes, each found by the note in 1 cycle.`);
    }
    see("va", "tlb");
    s.step(`${fmt.int(loads)} reads, ${fmt.int(cycles)} cycles: about ${fmt.num(cycles / loads, 1)} each. One slow lookup, then the note did the rest.`);
  }

  // ---- program B: the same address, its own directory ----
  const B = mem.other;
  s.phase("Another program", { about: "The operating system now runs program B, which uses the very same address for its own data. B has its own directory, so the number leads to a different room." });
  cr3Now = BigInt(B.cr3) << 12n;
  T.flush();                                                           // a CR3 write drops every user TLB entry (no PCIDs)
  s.set("cr3", { sub: paHex(Number(cr3Now)), state: cr3State("B") });
  s.set("cr3.v", { sub: tilePfn(B.cr3), state: { pml4: pfnHex(B.cr3) } });
  s.tag("cr3", "program B", { tone: "busy" });
  for (let k = 0; k < N; k++) {
    const [v, f] = showSlot(k);
    s.set(`tlb.v${k}`, { text: v.text, tone: v.tone, state: v.state });
    s.set(`tlb.p${k}`, { text: f.text, tone: f.tone, key: null, state: f.state });
  }
  keyedTlb = null;
  s.set("tlb", { led: "idle", state: tlbState() });
  setPA(null, Number(paShown & 0xfffn));                               // A's room no longer applies
  s.lit("cr3.v");
  s.line(null);
  see("cr3", "tlb");
  s.step(`The operating system switches to program B: {term:CR3} now holds B's directory, and A's sticky notes are wiped.`, { keep: true });

  const chB = setVA(va0);
  s.lit(...chB);
  s.beat();
  setPA(null, off0);
  lookup(va0, { quiet: true });
  s.step(`Program B reads the very same address, ${c(vaHex(va0))}. No sticky note has it: a {tone:warn|miss}.`);

  s.ask("B uses the same address as A. Whose byte will B read?",
    ["A's byte: an address is one fixed place in memory", "Its own byte: B's directory points to another room", "Neither: two programs can't share an address"], 1,
    { why: "Every program has its own directory. B's lines lead to a room the operating system gave B, so A's room is never reached." });
  const pfnB = B.pages.get(vpn0).pfn;
  s.set("page", { title: "A's page" });
  s.housing("pageB", { in: "dram", title: "B's page", sub: paHex(pfnB * 4096), tray: { cols: 1, rows: 3, of: "record" }, led: "idle", state: { frame: pfnHex(pfnB), base: paHex(pfnB * 4096), program: "B", loads: [] } });
  const winB = Math.max(0, Math.min(4093, off0 - 1));
  for (let k = 0; k < 3; k++) s.tile(`pageB.b${k}`, { in: "pageB", of: "record", ...byteContent(vpn0, winB + k, "B") });
  s.trace("w4b", "t3", "pageB", { arrow: true });
  s.beat();
  const wB = quickWalk(va0, (reads, cost) => `B's own directory, read line by line (${cost} cycles), leads to room ${c(pfnHex(Number(reads[3].next >> 12n)))}, not ${c(pfnHex(pfn0))}.`);
  const paB = formPA(va0, wB.frame, "walk", { page: "pageB", via: "w4b",
    say: (pa) => `Room ${c(pfnHex(wB.frame))}, then the same offset ${c(offHex(off0))}: B's real address is ${c(paHex(pa))}.` });
  fill(va0, wB.frame);
  const byteB = byteAt(mem.seed, vpn0, off0, "B");
  const tB = `pageB.b${off0 - winB}`;
  s.set(tB, { key: "offset" });
  const tA = byteTile(off0);                                           // A's byte at the same offset, still there
  s.set(tA, { key: "offset" });
  s.lit(tB, tA);
  s.tag(tB, `${hx(byteB, 2)} '${String.fromCharCode(byteB)}'`);
  s.set("pageB", { state: { frame: pfnHex(wB.frame), base: paHex(wB.frame * 4096), program: "B", loads: [{ va: vaHex(va0), pa: paHex(paB), via: "walk", who: "B", path: wB.path }] } });
  see("page", "pageB", "pa");
  s.line(null);
  s.step(`Program B reads ${c(hx(byteB, 2))} from room ${c(pfnHex(wB.frame))}. A's byte, ${c(hx(byteA, 2))}, sits untouched in room ${c(pfnHex(pfn0))}.`);
  s.tag("page", "program A", { tone: "ok" });
  s.tag("pageB", "program B", { tone: "busy" });
  s.focus("page", "pageB");
  s.step("Same address, two rooms: each program's own directory keeps their data apart.");
}

// ---- invariants ---------------------------------------------------------------------------------------------

const scenarioId = (x) => (typeof x === "string" ? x : x?.id ?? "miss");
const refOf = (ctx) => { const t = resolveAddress(ctx.params); return memoryMap(ctx.params.seed, t.va, scenarioId(ctx.scenario)); };
const oracles = new Map();
/** machine.mjs's page-table model holding the same virtual → physical mapping as one program (its own table frames). */
function oracle(mem, handled, who = "A") {
  const k = `${mem.seed}|${mem.vpn}|${mem.faultFrame}|${handled}|${mem.swapSlot}|${who}|${mem.other.cr3}`;
  if (oracles.has(k)) return oracles.get(k);
  const pt = pageTable();
  for (const [vpn, pg] of who === "B" ? mem.other.pages : mem.pages) {
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
const runningIn = (snap) => stateOf(snap, "cr3")?.program ?? "A";

export const invariants = {
  // the physical address on screen is what an independent page-table model says this virtual address maps to,
  // for the program that is running
  "physical address = reference translation": (snap, ctx) => {
    const va = readBits(snap, "va", 48), pa = readBits(snap, "pa", PA_BITS);
    if (va === null || pa === null) return "the address strips are missing";
    if (pa >> 12n === 0n) return true;                                 // the frame part is not known yet
    const who = runningIn(snap);
    const want = oracle(refOf(ctx), handledIn(snap), who).translate(Number(va));
    if (want === null) return `PA ${paHex(Number(pa))} is shown for ${vaHex(Number(va))}, which the reference says faults (program ${who})`;
    return BigInt(want) === pa || `PA ${paHex(Number(pa))} is shown for ${vaHex(Number(va))}; the reference says ${paHex(want)} (program ${who})`;
  },
  // every completed walk read exactly the entries the address bits select, from its program's CR3, each pointing
  // at the next table
  "each walk follows the address bits": (snap, ctx) => {
    const ref = refOf(ctx);
    const loads = [...(stateOf(snap, "page")?.loads ?? []), ...(stateOf(snap, "pageB")?.loads ?? [])];
    for (const ld of loads) {
      if (!ld.path) continue;
      const va = BigInt(ld.va.replaceAll("_", ""));
      let table = BigInt(ld.who === "B" ? ref.other.cr3 : ref.cr3) << 12n;
      for (let L = 0; L < 4; L++) {
        const st = ld.path[L], e = BigInt(st.entry.replaceAll("_", ""));
        if (BigInt(st.table.replaceAll("_", "")) !== table) return `${ld.va}: level ${LEVELS[L]} read table ${st.table}, expected ${hx(table, 10)}`;
        if (st.index !== Number((va >> BigInt(SHIFT[L])) & 511n)) return `${ld.va}: ${LEVELS[L]} index ${st.index} is not bits ${SHIFT[L] + 8}–${SHIFT[L]} of the address`;
        if (!(e & F.P)) return `${ld.va}: a completed walk used a not-present ${LEVELS[L]} entry`;
        table = e & FRAME_MASK;
      }
      const pa = table | (va & 0xfffn);
      if (pa !== BigInt(ld.pa.replaceAll("_", ""))) return `${ld.va}: the walk ends at ${hx(pa, 8)} but the load used ${ld.pa}`;
      const want = oracle(ref, true, ld.who ?? "A").translate(Number(va));
      if (want !== null && BigInt(want) !== pa) return `${ld.va} (program ${ld.who}): the walk ends at ${hx(pa, 8)}, the reference says ${paHex(want)}`;
    }
    return true;
  },
  // the TLB is a cache of the running program's page tables: every entry it holds is a translation they contain
  "TLB agrees with the page tables": (snap, ctx) => {
    const ref = oracle(refOf(ctx), handledIn(snap), runningIn(snap));
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
