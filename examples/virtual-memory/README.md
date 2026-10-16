# Virtual memory: how one load finds its byte

One byte load, `movzx eax, byte [rdi]`, followed from a 48-bit virtual address to a physical byte on x86-64. The
address is split into four 9-bit indices and a 12-bit offset. The TLB is checked. On a miss, CR3 → PML4 → PDPT →
PD → PT is walked, one 8-byte read at `table + 8 × index` per level. Then the TLB is filled and
`PA = frame << 12 | offset`. The reader should leave knowing:
- the offset is never translated;
- a TLB hit costs about 1 cycle, while a cold walk costs four DRAM reads;
- locality pays for the walk: 8 entries share a 64-byte line;
- a page fault costs tens of thousands of cycles.

- **Source:** Intel SDM Vol. 3A §4.5 (4-level paging) and §4.10 (the TLB never caches a not-present entry).
  The latencies are from Drepper, *What Every Programmer Should Know About Memory* (2007), §3.3: L2 ~14 cycles,
  main memory ~240 cycles. The TLB hit time is 0.5–1 cycle and the hit rate is over 99% (Hennessy & Patterson,
  App. B). The SSD figure, 10–100 µs per I/O, is from Gregg, *Systems Performance* 2e, Table 2.2.
- **The model:**
  - Physical memory is a set of real 64-bit entries: frame number in bits 51:12, `P RW US A D` flags (0x067, as
    Linux writes them) and NX on data pages. Frames come from a seeded allocator. The physical address is 39 bits
    wide (`address sizes: 39 bits physical, 48 bits virtual`).
  - The TLB is `machine.tlb` (fully associative, LRU, 2–8 entries). The walker's reads go through `machine.cache`
    and start cold.
  - Costs, at 3 GHz:
    - TLB lookup: 1 cycle
    - table read from DRAM: 240 cycles
    - table read that hits the cache: 14 cycles
    - #PF trap plus handler: ≈1 µs = 3 000 cycles (an order-of-magnitude estimate)
    - 4 KiB read from an NVMe SSD: ≈20 µs = 60 000 cycles
  - Not modelled:
    - paging-structure caches (Intel's PDE cache would skip the upper three reads of a warm walk)
    - A/D bit updates by the walker
    - huge pages
    - Linux's real swap-entry encoding (here P = 0 and the slot sits in bits 12+)
- **Scenarios:**
  - **TLB miss** (the default): a cold 4-level walk (961 cycles). Then `rdi + 1` hits the TLB (1 cycle), and the
    scan runs on to the end of the page with 438 more hits. At the next page the walk is all cache hits (56 cycles),
    because PT[265] shares PT[264]'s 64-byte line. That is 441 loads in 1 457 cycles. Two predict questions.
  - **TLB hit**: the page was used a moment ago. The frame comes straight from the TLB and the page tables are never read.
  - **Page fault**: PT[264] has P = 0. The CPU raises #PF with CR2 = va, and the kernel reads the 4 KiB from swap into a
    free frame and rewrites the entry. The load restarts: it misses the TLB again, then a warm walk finds the page.
    The total is 64 018 cycles, and the SSD read is 94% of it. One predict question.
- **Knobs:**
  - Virtual address: an mmap'd buffer, the heap or the stack. You can also type any user-space hex address.
  - TLB entries: 2–8.
  - Seed: the physical layout.
- **Invariants** (checked on every step):
  - The physical address on screen, read back from the bit tiles, equals the translation from `machine.pageTable`.
    That is an independent implementation fed the same virtual → physical mapping.
  - Every completed walk read exactly the entries the address bits select, each pointing at the next table.
  - Every TLB entry agrees with the page tables, and no page is in the TLB twice.
  - `cycles = (hits + misses)·1 + dram·240 + cached·14 + faults·3000 + ssd reads·60000`.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs
node ../../scripts/build.mjs figure.mjs
node ../../scripts/shoot.mjs virtual-memory.html --scenario all
node ../../scripts/audit.mjs virtual-memory.html --scenario all
```
