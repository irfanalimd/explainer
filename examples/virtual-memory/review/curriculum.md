# Virtual memory: curriculum

Level `core`. The figure exists; another agent is adding its step, chapter and ask ids now, so this plan names steps
by the moment in the run and asks by their question, never by a new id. `lesson.mjs` holds only `goal`,
`objectives`, `misconceptions`, `picture` and `terms`.

## Sources

Canonical
- Intel® 64 and IA-32 Architectures Software Developer's Manual, Vol. 3A: §4.5 4-level paging (CR3, PML4/PDPT/PD/PT,
  9-bit indexes, entry format, P/RW/US/A/D/NX), §4.7 page-fault exceptions (CR2), §4.10 caching translations (§4.10.1
  PCIDs; §4.10.2 the TLB never caches a not-present translation; §4.10.3 paging-structure caches; §4.10.4 what a
  CR3 write invalidates; global pages). https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html
- U. Drepper, "What Every Programmer Should Know About Memory", 2007, §3.3 and §4 (L2 ≈ 14 cycles, DRAM ≈ 240 cycles,
  TLB and page-walk costs). https://www.akkadia.org/drepper/cpumemory.pdf

Secondary
- Arpaci-Dusseau, *Operating Systems: Three Easy Pieces*, ch. 18 Paging, ch. 19 TLBs (ASIDs, context switches), ch. 20
  Smaller Tables (multi-level), ch. 21 Swapping. https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf ·
  https://pages.cs.wisc.edu/~remzi/OSTEP/vm-tlbs.pdf · https://pages.cs.wisc.edu/~remzi/OSTEP/vm-smalltables.pdf ·
  https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys.pdf
- Linux PCID use (4.14+, with KPTI): D. Hansen, "x86/mm/kaiser: Use PCID feature to make user and kernel switches
  faster", LKML 2017. https://lkml.iu.edu/hypermail/linux/kernel/1711.3/00118.html ; Linux keeps a few dynamic ASIDs
  per CPU (`TLB_NR_DYN_ASIDS`, 6) in `arch/x86/include/asm/tlbflush.h`.
  https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/tlbflush.h
- Hennessy & Patterson, *Computer Architecture* 6e, App. B (TLB hit time 0.5–1 cycle, hit rates above 99 %).
- B. Gregg, *Systems Performance* 2e, Table 2.2 (SSD I/O 10–100 µs).

Misconception evidence
- OSTEP's virtual-memory dialogue and ch. 13 ("every address you see is virtual"), aimed at the belief that a
  printed pointer is a real place. https://pages.cs.wisc.edu/~remzi/OSTEP/vm-dialogue.pdf
- UCSD CSE 120 lecture 12 (TLBs and swapping: a fixed page-table entry vs. a stale TLB entry; flush on switch).
  https://cseweb.ucsd.edu/classes/sp23/cse120-b/slides/lec12_tlbs_swapping.pdf
- MIT 6.191 quiz 3 (TLB flushed on every context switch, and when a tag makes that unnecessary).
  https://6191.mit.edu/_static/spring26/resources/quizzes/q3.sp26.pdf
- A further real one, not used because no ask confronts it: "virtual memory means using the disk as extra memory"
  (OSTEP ch. 21 separates translation from swapping; the miss story never touches the disk).

## Prerequisites

Programs read memory by address; memory is a long row of bytes; hex numbers (the first about says each hex digit is
4 bits); "a cache keeps recent things close". Not needed: binary arithmetic beyond "the low 12 bits", operating
system internals, CPU registers.

## Exact rules and numbers (what the run does)

- x86-64, 4 KiB pages, 48-bit virtual addresses, 39-bit physical addresses (a common laptop CPU).
- Offset = low 12 bits (copied, never translated). Page number = bits 47–12 (36 bits), split into four 9-bit
  indexes: bits 47–39, 38–30, 29–21, 20–12. Each table has 512 entries of 8 bytes; entry i of a table is at
  table base + 8 × i. The frame number is in entry bits 51–12; P = bit 0.
- Default address 0x7f3a_2c10_8e48: offset 0xe48; page 0x7f3a2c108; indexes 254, 232, 352, 264 (README: PT[264]).
- Costs at 3 GHz: TLB lookup 1 cycle; table read from DRAM 240; from cache (L2) 14; page-fault trap + handler ≈ 1 µs
  = 3,000; a 4 KiB read from an NVMe SSD ≈ 20 µs = 60,000.
- Cold walk = 1 + 4 × 240 = 961 cycles. Then 439 hits in the same page (1 cycle each): 440 reads, 1,400 cycles,
  about 3.2 per read. A walk "up to 961"; a hit "1".
- TLB: fully associative, LRU, 2–8 notes (default 8). A note is written only after a walk that finds the room; a
  not-present entry is never noted (SDM §4.10.2).
- Program B: its own CR3 and tables; the switch writes CR3 and, with no PCIDs on this CPU, drops every non-global
  note. B's same address walks to another frame; A's byte stays in A's frame.
- Fault story: the last-level entry has P = 0 (the run keeps a swap slot in bits 12+, not Linux's real encoding);
  trap 3,000 + SSD 60,000; the kernel writes the entry; the read restarts, misses again, walks from the cache
  (4 × 14), fills a note. Total 64,018 cycles, the SSD 94 % of it.

## Objectives and their quiz stems

| id | objective | stem (answer) |
|---|---|---|
| o-split | Perform the page/offset split | "In 0x5555_5555_9a20, which hex digits are the offset, and which part is looked up?" (a20; 0x555555559) |
| o-walk | Explain the 4-level walk from CR3 | "Bits 47–39 of an address are 000000101. Which line of which table do they pick?" (line 5 of the first table, the one CR3 points to) |
| o-cost | Compare a hit with a walk, and average | "The first read in a page costs 961 cycles, each later one 1. What is the average over 100 reads in that page?" (10.6) |
| o-apart | Explain why two programs' same address differ | "Programs A and B both read 0x7f3a_2c10_8e48. What makes them reach different bytes?" (each has its own directory, chosen by CR3) |
| o-fault | Predict the page-fault sequence and its main cost | "A page is out on disk. Put in order: kernel copies the page / walk finds 'not present' / read starts over. Which costs most?" (walk, kernel copies, restart; the disk copy) |

## Chapters (current names in the figure)

The parts chapter, whose entry card shows the picture map (`enter.picture: true`), is **Apartment numbers**: its about
carries the building picture, and it introduces virtual address, offset and page on lit bits (3 terms). Then
`Sticky notes`: TLB, cycle (+ frame in the "A recent address" story); `The directory`: page table, CR3, frame (3);
`The real room`: physical address; `Fetch from disk`: page fault, kernel; `Try again`: cache. The picture's
"boxes went to storage" row names page fault, which only the fault story reaches: give that story the full map and
the others a map without that row, or accept one row the reader meets only in "The page isn't in memory".

| chapter | stories | So far | Now | You'll know it worked when |
|---|---|---|---|---|
| Apartment numbers | all | Programs read memory by address, like a[3] in an array. | Split the program's address into its page and its place inside it. | The low 12 bits copy straight into the real address. |
| Sticky notes | all | Only the page number needs looking up. But the directory sits in slow memory. | Check the CPU's sticky notes first. | The notes answer, a hit or a miss, in 1 cycle. |
| The directory | new address, fault | No note has this page. | Read the program's directory, one table after another. | The last table names the page's room, or says it isn't in memory. |
| The real room | new address, recent address | The room for this page is known. | Put the offset after the room number and read the byte. | The real address is filled in, and the byte lights up. |
| Same page again | new address | The first read cost 961 cycles, every line from slow memory. | Read the next byte, in the same page. | The note answers in 1 cycle, with no directory read. |
| Another program | new address | One slow lookup, then the note did the rest. | Run program B, and read the very same address. | B lands in another room, and A's byte is untouched. |
| Fetch from disk | fault | The directory says this page is not in memory. | The CPU stops, and the kernel fetches the page from disk. | The directory line names a room again, marked present. |
| Try again | fault | The kernel fixed the directory line. | Run the same read again from the start. | The walk now finds the room, from the fast cache. |

## Key steps (by moment; attach to the ids once they exist)

- The first step: the program's address is its own number (the hook's tension).
- The offset split (copies straight over) and the page-number split (only this is looked up). Both `keep: true`.
- The first TLB miss.
- "On a miss, the CPU opens this program's directory. CR3 holds where it starts" (`keep: true`).
- The last-level read that gives the frame; the physical address formed from frame + offset.
- The note written for next time.
- **The same-page hit** (the aha; the "How long will finding this byte's room take?" ask before it), and the average
  ("about 3.2 cycles each").
- The switch to program B (CR3 rewritten, notes wiped); B's walk to another room; "Same address, two rooms".
- Fault story: "not present"; the trap; the disk copy (the dominant cost); the kernel's write; the retry's miss
  (`keep: true`; the ask before it); the closing cost comparison.
- Recent-address story: the hit with its frame; the closing "Walking would have added up to 960 cycles".

## Asks and the misconceptions they confront (by question)

| ask (question) | story · chapter | options (index) → misconception |
|---|---|---|
| "How long will finding this byte's room take?" | new address · Same page again | 0 "961 cycles again: every read walks the directory" → `m-walk`; 1 right; 2 "About half: part of the walk is remembered" → `m-walk` (feedback must not say partial remembering never happens: real CPUs do cache upper table lines, but the note answers first) |
| "B uses the same address as A. Whose byte will B read?" | new address · Another program | 0 "A's byte: an address is one fixed place" → `m-fixed`; 1 right; 2 "Neither: two programs can't share an address" → `m-unique` |
| "The read starts over. Will a sticky note have the page now?" | fault · Try again | 0 "Yes: the kernel just put the page in memory" → `m-note`; 1 right |

The "A recent address" story has no ask; at `core` verify warns about a story with no question (see notes).

## Expert nuances for `deeper`

- TLB hit (cost, how): an L1 data TLB is looked up in parallel with the L1 cache's set index (the low 12 bits need no
  translation), so a hit adds roughly nothing; that is why L1 data caches are 32–48 KiB (4 KiB × ways). A second-level
  TLB hit costs about 7–10 cycles. Real L1 TLBs are set-associative (e.g. 64 entries, 4-way), not fully associative.
- The cold walk (edge, SDM §4.10.3): paging-structure caches keep upper-level entries, so a walk for a nearby page
  often reads only the last table: one memory read, not four. The run models none of this (the worst case, said so).
- The walk (edge): the walker sets the Accessed bit (and Dirty on a write) in the entries; the kernel reads A to pick
  pages to move out. Under a hypervisor each guest table read is itself translated: up to 24 memory reads per miss.
- Huge pages (real): a 2 MiB page stops the walk at the third table and one note covers 512 small pages.
- 5-level paging (real): Ice Lake and later support 57-bit addresses, adding a fifth table (Linux since 4.14).
- Another program (how, real, SDM §4.10.1, Linux): with PCIDs, CR3 carries a 12-bit tag and notes of other tags
  survive the switch. Linux does not give each process a permanent tag: each CPU recycles 6 dynamic ASIDs among
  recently run processes, and with page-table isolation each one uses a pair (user and kernel). Without PCIDs a CR3
  write still keeps global (kernel) entries. ARM and RISC-V tag notes with an ASID too.
- Fault story (edge, SDM §4.10.2): no invalidation is needed after making a not-present entry present, because
  not-present entries are never cached. Changing a present entry does need `invlpg`, and on many cores a TLB
  shootdown (an interrupt to every core that may hold the note).
- Fault story (real): during the 20 µs disk read the kernel puts the program to sleep and runs another; "cycles spent
  translating" is this program's wait, not CPU work. A fault that needs no disk (a minor fault) costs about 1 µs.
- A ten-year practitioner might not know: the reason "the TLB is 1 cycle" holds is the VIPT trick above, and it is
  also why 4 KiB pages cap the L1 cache's size per way.

## Why this ladder

The address is split before anything is looked up, so the reader sees that only the page number needs translating.
The notes come before the directory so a miss motivates the walk; the room closes the loop; the same-page read is the
payoff (one slow lookup amortised over a page); the second program answers the hook's other half (why programs don't
collide). The fault story reuses the same rungs and swaps in the disk, where the cost jumps by orders of magnitude.

## Notes on the run

- No ask carries an `id` and no chapter has an `id` yet; steps are captioned inline only.
- The "A recent address" story has no predict question (core warns on a story with none). A natural one, before the
  hit: "This page was read a moment ago. How long will finding its room take?" with "961 cycles" (`m-walk`).
- The code panel's `do_page_fault` writes `frame | PRESENT | RW | USER`; the run writes the full data-page flags
  (P RW US A D NX). Harmless, but a reader comparing the entry's hex with the code will see a mismatch.
- The cycle counter in the fault story counts the 60,000-cycle disk wait as "cycles spent translating"; true as the
  program's delay, misleading as CPU work (see the nuance above).
- The "Another program" about says "most real CPUs tag each note with its program". Closer: "most real CPUs tag each
  note with a small number for a recently run program"; Linux recycles 6 tags per CPU.
