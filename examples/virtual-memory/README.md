# Virtual memory: how each program gets its own addresses

Two programs can use the same memory address for their own data. This figure follows one byte read on x86-64
from the program's own (virtual) address to a real byte in memory: the address is split into a page number and a
12-bit offset, the TLB (the CPU's sticky notes) is checked, and on a miss the program's four-level page table is
read, one 8-byte line per level. Then a second program reads the very same address and lands in a different room.
The reader should leave knowing:
- an address is the program's own number, not a real place; each program has its own directory (page table);
- the offset is never translated;
- a sticky-note (TLB) hit costs about 1 cycle, a walk four memory reads, so one walk pays for a whole page of reads;
- a page out on disk (a page fault) costs tens of thousands of cycles.

## The lesson (`meta.level: "core"`, plan per `references/teaching.md`)

- **Hook:** "Two programs can use the same memory address for their own data. Why don't they overwrite each other,
  and how is it fast?"
- **Picture:** a building where each program has its own apartment numbers. The building directory, one per
  program, is the page table; the real room is the frame; the receptionist's sticky notes of recent lookups are the
  TLB; a room whose contents went to storage is a page out on disk (a page fault). The first chapter's about says it,
  and also that addresses are written in hex, 4 bits a digit. Captions name the tables first, second, third and
  last (Intel numbers them 4 down to 1); the PML4/PDPT/PD/PT names stay on the table plates.
- **Ladder** (the main story): Apartment numbers → Sticky notes → The directory → The real room → Same page again
  (the aha: 1 cycle) → Another program (the same address, a different room).
- **Misconceptions, predicted first:** "every read walks the directory" (before the TLB hit) and "an address is one
  fixed place in memory" (before program B's walk). The page-fault story asks whether the TLB knows the page after
  the kernel fixed it.
- **Words** (`meta.terms`, marked at first use): virtual address, page, offset, TLB, cycle, page table, CR3, frame,
  physical address, page fault, kernel, cache.
- **Trimmed for the level:** the old "Next page" chapter (the warm walk whose PT entry shares a 64-byte line with the
  last one) is gone; `machine.cache` still makes the fault story's retry walk cheap.

## The model

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
    - PCIDs (Linux uses them to keep TLB entries across a switch; here the CR3 write flushes them) and the
      scheduler itself: program B simply runs next, with its own tables mapping the same three virtual pages
- **Scenarios:**
  - **A new address** (the default): a cold 4-level walk (961 cycles, every line from DRAM: the worst case, and the
    words say so; real MMUs cache upper-level entries). Then the next byte hits the TLB (1 cycle), and
    the scan runs on to the end of the page with 438 more hits: 440 reads in 1 400 cycles. Then the OS switches to
    program B: CR3 gets B's PML4 and the TLB is flushed (a CR3 write without PCIDs drops every non-global entry; the
    words call this "this CPU" and the about says most real CPUs tag notes by program instead).
    B reads the same virtual address, misses, walks its own tables (4 × 240 cycles) and reads a byte from a
    different frame, while A's byte stays in A's frame. Two predict questions.
  - **A recent address**: the page was used a moment ago. The frame comes straight from the TLB and the page tables
    are never read.
  - **The page isn't in memory**: PT[264] has P = 0. The CPU raises #PF with CR2 = va, and the kernel reads the 4 KiB
    from swap into a free frame and rewrites the entry. The load restarts: it misses the TLB again, then a walk from
    the cache finds the page. The total is 64 018 cycles, and the SSD read is 94% of it. One predict question.
- **Knobs:**
  - Address the program reads: a data buffer, the heap or the stack. You can also type any user-space hex address.
  - Sticky notes (TLB size): 2–8.
  - Seed: where pages land in physical memory.
- **Invariants** (checked on every step):
  - The physical address on screen, read back from the bit tiles, equals the translation from `machine.pageTable`
    for the running program (A or B). That is an independent implementation fed the same virtual → physical mapping.
  - Every completed walk read exactly the entries the address bits select, from its own program's CR3, each pointing
    at the next table, and ended where the reference says.
  - Every TLB entry agrees with the running program's page tables, and no page is in the TLB twice.
  - `cycles = (hits + misses)·1 + dram·240 + cached·14 + faults·3000 + ssd reads·60000`.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs
node ../../scripts/build.mjs figure.mjs
node ../../scripts/shoot.mjs virtual-memory.html --scenario all
node ../../scripts/audit.mjs virtual-memory.html --scenario all
```
