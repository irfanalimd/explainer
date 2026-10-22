// The words the virtual-memory figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure owns
// every fact and passes it as a var; nothing here computes. Every line stays true at every knob value (the three
// addresses or a typed one, 2–8 sticky notes, any seed). The plan is in review/curriculum.md.
// Every line stays true to the run: x86-64, 4 KiB pages, 4-level paging (Intel SDM Vol. 3A §4.5); this CPU has no
// PCIDs, so switching programs wipes the sticky notes, and the lesson says most real CPUs tag them instead.
//   run-wide vars: va, vpn, off (hex, as code), N (sticky notes), story ("miss" | "hit" | "fault")
//   the walk:      level, name, nth, next, bits, line, cost, cached, tableId, entryId (+ frame on walk.leaf)
//   the fault:     cycles, kernelId (trap); slot, frame, cycles, ssdId (disk); frame, line, entryId (fix)
//   lookups:       slot, frame, noteIds, walk (notes.hit); frame, first, noteIds (again.hit); cost, cached, reads, frame (*.walk)
//   the room:      frame, off, pa, from, pageId (*.address); frame, evicted?, noteIds (*.fill); pa, byte, byteId, cycles, from (*.byte)
//   totals:        cycles, walk (room.cost); cycles, hit, walk, disk (retry.cost); rest, last, noteIds (again.rest);
//                  loads, cycles, each, first (again.total)
//   program B:     cr3 (other.switch); byteB, frameB, byteIdB, byteA, frameA, byteIdA (other.byte); pageIds (other.apart)
// Chapter abouts and cards are filled with each step's own vars, so they use only the run-wide ones.
// Every real-world claim names its source as [id] (lesson.sources below), with a locator where it helps.
const SDM = "[intel-sdm3a] ch. 4, Paging";
const SDM1 = "[intel-sdm1] §3.3.7.1, canonical addressing";
const DREPPER = "[drepper2007] §3.3 and §4";
const OSTEP_TLB = "[ostep19]";
const OSTEP_SMALL = "[ostep20]";
const OSTEP_SWAP = "[ostep21]";
const OSTEP_PAGING = "[ostep18]";
const LINUX_TLB = "[linux-tlbflush] TLB_NR_DYN_ASIDS";
const LINUX_SWP = "[linux-pgtable64] __swp_entry";
const KPTI = "[hansen2017]";
const NESTED = "[bhargava2008]";
const THP = "[linux-thp]";
const GREGG = "[gregg2020] Table 2.2";

export const lesson = {
  sources: [
    { id: "intel-sdm3a", title: "Intel 64 and IA-32 Architectures Software Developer's Manual, Volume 3A, chapter 4: Paging", by: "Intel", year: 2025, where: "intel.com",
      url: "https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html",
      supports: "4-level paging: CR3, four tables of 512 eight-byte entries, 9 index bits per level, the P, RW, US, A, D and NX flags, PCIDs, the paging-structure caches, invalidation (§4.10)" },
    { id: "intel-sdm1", title: "Intel 64 and IA-32 Architectures Software Developer's Manual, Volume 1, §3.3.7.1 Canonical addressing", by: "Intel", year: 2025, where: "intel.com",
      url: "https://www.intel.com/content/www/us/en/developer/articles/technical/intel-sdm.html",
      supports: "with 48-bit linear addresses, bits 63–48 must copy bit 47" },
    { id: "drepper2007", title: "What Every Programmer Should Know About Memory", by: "Ulrich Drepper", year: 2007, where: "akkadia.org (Red Hat)",
      url: "https://www.akkadia.org/drepper/cpumemory.pdf",
      supports: "the access times Intel lists for a Pentium M (L2 about 14 cycles, main memory about 240), the model's latencies; a fully associative TLB holds a few dozen entries at most" },
    { id: "ostep18", title: "Operating Systems: Three Easy Pieces, ch. 18, Paging: Introduction", by: "Remzi H. Arpaci-Dusseau and Andrea C. Arpaci-Dusseau", year: 2023, where: "pages.cs.wisc.edu/~remzi/OSTEP",
      url: "https://pages.cs.wisc.edu/~remzi/OSTEP/vm-paging.pdf",
      supports: "an address splits into a page number, which is translated, and an offset, which is not" },
    { id: "ostep19", title: "Operating Systems: Three Easy Pieces, ch. 19, Paging: Faster Translations (TLBs)", by: "Remzi H. Arpaci-Dusseau and Andrea C. Arpaci-Dusseau", year: 2023, where: "pages.cs.wisc.edu/~remzi/OSTEP",
      url: "https://pages.cs.wisc.edu/~remzi/OSTEP/vm-tlbs.pdf",
      supports: "the TLB caches translations; a hit avoids the extra memory reads; ASIDs instead of flushing on a switch" },
    { id: "ostep20", title: "Operating Systems: Three Easy Pieces, ch. 20, Paging: Smaller Tables", by: "Remzi H. Arpaci-Dusseau and Andrea C. Arpaci-Dusseau", year: 2023, where: "pages.cs.wisc.edu/~remzi/OSTEP",
      url: "https://pages.cs.wisc.edu/~remzi/OSTEP/vm-smalltables.pdf",
      supports: "multi-level page tables: a directory of tables, each index picking one line" },
    { id: "ostep21", title: "Operating Systems: Three Easy Pieces, ch. 21, Beyond Physical Memory: Mechanisms", by: "Remzi H. Arpaci-Dusseau and Andrea C. Arpaci-Dusseau", year: 2023, where: "pages.cs.wisc.edu/~remzi/OSTEP",
      url: "https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys.pdf",
      supports: "the present bit, the page fault, the swap slot kept in the entry, retrying the instruction" },
    { id: "linux-tlbflush", title: "Linux, arch/x86/include/asm/tlbflush.h", by: "The Linux kernel", year: 2026, where: "kernel source",
      url: "https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/tlbflush.h",
      supports: "TLB_NR_DYN_ASIDS: each CPU recycles 6 PCID tags among recent address spaces" },
    { id: "linux-pgtable64", title: "Linux, arch/x86/include/asm/pgtable_64.h", by: "The Linux kernel", year: 2026, where: "kernel source",
      url: "https://github.com/torvalds/linux/blob/master/arch/x86/include/asm/pgtable_64.h",
      supports: "__swp_entry stores the swap offset inverted, against L1TF" },
    { id: "hansen2017", title: "x86/mm/kaiser: Use PCID feature to make user and kernel switches faster", by: "Dave Hansen", year: 2017, where: "Linux kernel mailing list",
      url: "https://lkml.iu.edu/hypermail/linux/kernel/1711.3/00118.html",
      supports: "page-table isolation uses a pair of PCIDs per address space" },
    { id: "bhargava2008", title: "Accelerating two-dimensional page walks for virtualized systems", by: "Ravi Bhargava, Benjamin Serebrin, Francesco Spadini and Srilatha Manne", year: 2008, where: "ASPLOS 2008",
      url: "https://dl.acm.org/doi/10.1145/1346281.1346286",
      supports: "a nested walk under a virtual machine takes up to 24 memory references" },
    { id: "linux-thp", title: "Transparent Hugepage Support", by: "The Linux kernel documentation", year: 2026, where: "docs.kernel.org",
      url: "https://docs.kernel.org/admin-guide/mm/transhuge.html",
      supports: "2 MiB pages for large memory areas, one TLB entry for 512 small pages" },
    { id: "gregg2020", title: "Systems Performance: Enterprise and the Cloud, 2nd edition", by: "Brendan Gregg", year: 2020, where: "Addison-Wesley",
      url: "https://www.brendangregg.com/systems-performance-2nd-edition-book.html",
      supports: "Table 2.2, example latencies: main memory about 100 ns, an SSD I/O 10–100 µs, a rotational disk I/O 1–10 ms" },
  ],

  goal: "Turn a program's own address into a real place in memory, so programs stay apart and reads stay fast.",

  objectives: [
    { id: "o-split", text: "Perform the split of an address into its page number, which is looked up, and its offset, which copies straight over." },
    { id: "o-walk", text: "Explain how four groups of 9 bits each pick one line in a chain of four tables, starting from CR3." },
    { id: "o-cost", text: "Compare a sticky-note hit with a directory walk, and compute the average cost of many reads in one page." },
    { id: "o-apart", text: "Explain why two programs reading the same address reach different rooms." },
    { id: "o-fault", text: "Predict what happens when a page is out on disk, in order, and which part costs the most." },
  ],

  misconceptions: [
    { id: "m-walk", wrong: "Every read looks its address up in the directory, so every read is slow.",
      fix: "Only a miss reads the directory. The note it leaves answers every later read in that page in one cycle." },
    { id: "m-fixed", wrong: "An address is one fixed place in memory, the same for every program.",
      fix: "An address is the program's own number. Its directory decides which real room it means." },
    { id: "m-unique", wrong: "Two programs can't use the same address: the system gives each its own addresses.",
      fix: "Programs use the same addresses all the time. Their directories send them to different rooms." },
    { id: "m-note", wrong: "Once the kernel brings the page back, the sticky notes know about it too.",
      fix: "The kernel fixes the directory line, not the notes. A note is written only after a walk that finds the room." },
  ],

  picture: {
    name: "a building where each program has its own apartment numbers",
    rows: [
      { id: "number", picture: "an apartment number", real: "a virtual address: the program's own number", term: "virtual address" },
      { id: "spot", picture: "the spot inside the apartment", real: "the offset, the low 12 bits", term: "offset" },
      { id: "directory", picture: "the program's building directory", real: "its page table", term: "page table" },
      { id: "desk", picture: "which directory lies open on the desk", real: "CR3, where that page table starts", term: "CR3" },
      { id: "room", picture: "the real room", real: "a frame of physical memory", term: "frame" },
      { id: "notes", picture: "the receptionist's sticky notes", real: "the TLB", term: "TLB" },
      { id: "storage", picture: "a room whose boxes went to storage", real: "a page out on disk: a page fault", term: "page fault" },
    ],
    breaks: "A receptionist reads one big directory. The CPU's is four small tables, each saying where the next starts, and it keeps only a few notes.",
  },

  terms: {
    "virtual address": { lead: "the program's own address", def: "The number a program uses for a place in its memory: its own apartment number, not a real room." },
    page: { lead: "a 4,096-byte block", def: "A block of 4,096 bytes. Memory is handed out, looked up and moved one block at a time." },
    offset: { lead: "the place inside the block", def: "How many bytes into its 4,096-byte block a byte sits, counting from the block's start." },
    TLB: { lead: "the sticky notes", def: "Translation lookaside buffer: the CPU's few sticky notes of recently looked-up pages and their real rooms." },
    cycle: { lead: "one clock tick", def: "One tick of the CPU's clock. A 3 GHz CPU ticks 3 billion times a second." },
    "page table": { lead: "the directory", def: "A program's directory: for each of its pages, a line saying which real room holds it." },
    CR3: { lead: "where the directory starts", def: "A slot inside the CPU that holds where the running program's directory starts in memory." },
    frame: { lead: "a real room", def: "A page-sized room of real memory. A page lives in one while it is in memory." },
    "physical address": { lead: "the real address", def: "The real place in memory: the room's start plus the offset inside it." },
    "page fault": { lead: "the page isn't here", def: "The CPU finds a page is not in memory, stops, and asks the operating system to fetch it." },
    kernel: { lead: "the operating system's core", def: "The core of the operating system: it hands out memory and fetches pages back from disk." },
    cache: { lead: "fast memory beside the CPU", def: "Small, fast memory beside the CPU that keeps copies of recently read memory, so reading again is cheap." },
  },

  chapters: {
    address: {
      teach: { prompt: "Two programs both print the address of one of their variables, and they print the same number. Are they using the same byte of memory?", listen: "Expect “yes”: a number feels like a place. Each program's address is its own; its directory decides which real room it means. Hold the answer until program B's story.", minutes: 3 },
      about: "Think of a building where each program has its own apartment numbers, and its own directory that turns a number into a real room. Addresses are written in hex: each digit is 4 bits.",
      enter: {
        sofar: "Programs read memory by address, like a[3] in an array.",
        now: "Split the program's address into the part that is looked up and the part that isn't.",
        done: "The last 3 hex digits copy straight into the real address below.",
        picture: true,
      },
    },
    notes: {
      teach: { prompt: "Finding the room means reading the directory from memory, four times. Why isn't every read of memory four times slower, then?", listen: "Because the CPU remembers recent answers: the sticky notes, the TLB. Listen for “it caches something”; ask what, and for how much memory one note answers.", minutes: 3 },
      about: "Reading the directory is slow, because it sits in memory too. So the CPU keeps sticky notes of recent lookups, the {term:TLB}, and checks them first, in one {term:cycle}.",
      enter: {
        sofar: "Only the page number, {vpn}, needs looking up. But the directory sits in slow memory.",
        now: "Check the CPU's sticky notes for this page first.",
        done: "The notes answer at once: a hit or a miss.",
      },
    },
    walk: {
      teach: { prompt: "One directory line for every page would be 2^36 lines. How does a chain of four small tables avoid that?", listen: "Each 9 bits of the page number picks one line in one table of 512, and only the tables a program uses need to exist. A program using a few pages needs a few tables, not 2^36 lines.", minutes: 4 },
      about: "On a miss, the CPU reads this program's directory, the {term:page table}: four small tables in a chain. Each 9 bits of the page number pick one line in one table.",
      enter: {
        sofar: "No note has page {vpn}, so the notes can't say where it lives.",
        now: "Read the program's directory, one table after another.",
        done: "The last table's line names the page's room.",
      },
      "enter@fault": {
        sofar: "No note has page {vpn}, so the notes can't say where it lives.",
        now: "Read the program's directory, one table after another.",
        done: "The last table's line names the page's room, or says it has none.",
      },
    },
    room: {
      teach: { prompt: "The room is found. What does the CPU do with the last 3 hex digits of the address?", listen: "Nothing: the offset copies straight over, after the room number. Only the page number is ever translated.", minutes: 2 },
      about: "The walk found the page's room. The CPU puts the offset after the room number to get the real address, writes a sticky note for next time, and reads the byte.",
      enter: {
        sofar: "Four slow reads later, the last table named the page's room.",
        now: "Put the offset after the room number, and read the byte.",
        done: "The real address fills in, a note remembers the room, and the byte lights up.",
      },
    },
    "room@hit": {
      teach: { prompt: "The note handed over the room in one cycle. Which part of the address still needs no lookup at all?", listen: "The offset, the last 3 hex digits: it copies straight over, after the room number. Only the page number was ever translated, and the note did that.", minutes: 2 },
      about: "The note already had the room, so the CPU puts the offset after it to get the real address and reads the byte. The directory stays shut.",
      enter: {
        sofar: "A note already held page {vpn} and its room.",
        now: "Put the offset after the room number, and read the byte.",
        done: "The real address fills in without one directory read.",
      },
    },
    again: {
      teach: { prompt: "The program reads the next byte in the same page. How much of the slow walk happens again?", listen: "None: the note answers in 1 cycle. Ask what changes if every read lands in a different page.", minutes: 2 },
      about: "The program reads on through the same page. Every byte there has the same page number, so the note written a moment ago answers for all of them.",
      enter: {
        sofar: "The first byte's room took four slow reads, every line from main memory.",
        now: "Read the next byte, in the same page {vpn}.",
        done: "The note answers, and no directory line lights up.",
      },
    },
    other: {
      teach: { prompt: "Program B reads the address program A read a moment ago. Does B see A's byte?", listen: "No: B's own directory sends it to a different room. Listen for “the system gives each program different addresses”; the run shows them sharing one.", minutes: 4 },
      about: "The operating system now runs program B, which uses the same address through its own directory. This CPU wipes the notes on a switch. Real CPUs can tag each note with a small number for a recent program instead.",
      enter: {
        sofar: "Program A found its room and noted it. But program B may use the same address.",
        now: "Switch to program B, and read {va} there.",
        done: "B lands in a different room, and A's byte stays as it was.",
      },
    },
    fault: {
      teach: { prompt: "The directory line says the page isn't in memory. List, in order, what has to happen before the program gets its byte.", listen: "The CPU stops the program; the kernel copies the page back from disk, fixes the directory line, and the read runs again from the start. The disk copy is by far the slowest part.", minutes: 4 },
      about: "The page's contents went to storage: the operating system moved them to disk to free memory. This is a {term:page fault}: the CPU stops, and the operating system copies the page back.",
      enter: {
        sofar: "The last table's line says page {vpn} is not in memory.",
        now: "Stop the program, and fetch the page back from disk.",
        done: "The directory line names a room again, marked present.",
      },
    },
    retry: {
      teach: { prompt: "The kernel fixed the directory line. Does the sticky note know about the page now?", listen: "No: the kernel fixes the line, not the notes. The retried read misses once more and walks again, this time to a present page.", minutes: 3 },
      about: "The CPU runs the same read again from the start: note check, directory, room. The directory lines it needs were read moments ago.",
      enter: {
        sofar: "The kernel fixed the directory line, but the read itself never finished.",
        now: "Run the same read again, from the start.",
        done: "The real address fills in, and the byte lights up.",
      },
    },
  },

  steps: {
    // ---- Apartment numbers (every story) ----
    "address.read": {
      first: {                                       // the typed address was replaced: say why, in the same words
        when: (v) => !!v.typed,
        plain: "Can't use that address ({typed}). It reads {va}, its own {term:virtual address}.",
      },
      key: true,
      plain: "The program reads one byte at {va}. That is its own {term:virtual address}.",
      why: "If it were a real place, two programs using this number would overwrite each other's data.",
      look: ["va"], picture: "number",
      deeper: {
        how: "Every address a program ever sees, from a printed pointer to its stack, is virtual. The CPU translates it on every read, write and instruction fetch.",
        edge: "Only 48 of the 64 bits count: bits 63–48 must copy bit 47, or the CPU refuses the address. Programs live in the lower half, below 0x8000_0000_0000.",
        source: SDM1,
      },
    },
    "address.offset": {
      key: true,
      plain: "The low 12 bits, {off}, are the {term:offset}: the byte's place in its block.",
      why: "They copy straight down into the real address, unchanged: nothing needs looking up.",
      look: ["pa"], picture: "spot",
      deeper: {
        how: "12 bits count from 0 to 4,095: one number for each byte of a 4,096-byte block. In hex that is the last 3 digits, here {off}.",
        code: "`off = va & 0xfff;` (line 3)",
        source: OSTEP_PAGING,
      },
    },
    "address.page": {
      key: true,
      plain: "The upper 36 bits, {vpn}, name its {term:page}. Only this part is looked up.",
      why: "One lookup for a whole page of 4,096 bytes, not one per byte, keeps the directory small.",
      look: ["va"], picture: "number",
      deeper: {
        cost: "Translation works per page: 2^36 possible pages to describe, not 2^48 single bytes.",
        how: "Bits 47–12 are the page number: {vpn} is {va} with its last 3 hex digits dropped.",
        code: "`vpn = va >> 12;` (line 3)",
      },
    },

    // ---- Sticky notes ----
    "notes.miss": {
      key: true,
      plain: "The TLB checks all {N} notes at once for page {vpn}: a {tone:warn|miss}.",
      why: "No note has this page yet, so the CPU must find its room the slow way.",
      look: ["tlb"], picture: "notes",
      deeper: {
        cost: "1 cycle, hit or miss: every note is compared at the same moment.",
        how: "Each note pairs a page number with a room number. The TLB compares {vpn} with all {N} page numbers in parallel; a match is a hit.",
        real: "Real CPUs keep two levels of notes: a first level of a few dozen, checked in parallel like these, then a bigger second level that costs a few cycles more.",
        source: "[drepper2007] §3.3.1 and §4.3; [ostep19]",
      },
    },
    "notes.hit": {
      key: true,
      plain: "Page {vpn} is on note {slot}: a {tone:ok|hit}. Its real room, {term:frame} {frame}.",
      why: "The program used this page a moment ago, so the note still remembers its room.",
      look: ["{noteIds}"], picture: "notes",
      deeper: {
        cost: "1 cycle. Without the note, the CPU would read up to 4 directory lines from main memory, about 240 cycles each: the Pentium M numbers Drepper quotes, which this model uses. A 2020 server's main memory takes about 100 ns, some 300 cycles at 3 GHz.",
        how: "The TLB compares {vpn} with all {N} notes at once; note {slot} matches and hands over its room number, {frame}.",
        real: "One note covers a whole page, so a program reading through 4,096 one-byte values in a row misses once and hits 4,095 times. That reuse is why so few notes are enough.",
        source: "[ostep19]; [drepper2007] §3.3; [gregg2020] Table 2.2",
      },
    },

    // ---- The directory ----
    "walk.cr3": {
      key: true,
      plain: "The CPU opens this program's directory. {term:CR3} says where it starts: {cr3}.",
      why: "Each program has its own directory, and CR3 picks which one the CPU reads.",
      look: ["cr3"], picture: "desk",
      deeper: {
        how: "CR3 holds the start of the first table (Intel calls it the PML4); its low 12 bits hold flags, so the CPU masks them off.",
        code: "`u64 table = cr3 & ~0xfffull;` (line 6)",
        edge: "Only the operating system may write CR3. A program that tries is stopped by the CPU, so it can never point the CPU at another program's directory.",
        source: SDM,
      },
    },
    "walk.level": {
      first: {
        why: "Each line says where the next table starts, so the four reads must go one after another.",
        picture: "directory",
        deeper: {
          cost: "{cost} cycles: the line comes from main memory, the slow way.",
          how: "Each table has 512 lines of 8 bytes. 9 bits count from 0 to 511, so bits {bits} pick line {line}, read at the table's start + 8 × {line}.",
          code: "`u64 e = read64(table + 8 * i);` (line 9)",
          edge: "Real CPUs keep recently used upper lines in small paging-structure caches, so a walk to a nearby page may read only the last table. This run keeps none: the worst case.",
          source: SDM,
        },
      },
      plain: "Bits {bits} pick line {line} of the {nth} table, which leads to the {next}.",
      look: ["{entryId}"],
    },
    "walk.leaf": {
      key: true,
      plain: "Bits {bits} pick line {line} of the last table: the page's room, {term:frame} {frame}.",
      why: "This line holds the answer: the real room where page {vpn} lives right now.",
      look: ["{entryId}"], picture: "room",
      deeper: {
        cost: "4 lines, each read from main memory at {cost} cycles: the walk is 4 reads one after another.",
        how: "The line is a real x86-64 entry: the frame number sits in bits 51–12, and the low bits are flags: P (present), RW (may write), US (programs may use it), A (accessed), D (dirty), and NX (no running code from it) in bit 63.",
        edge: "The CPU sets the A flag in each line it walks through, and D on a write. The operating system reads A later to pick pages to move out.",
        real: "Under a virtual machine each table read is itself translated through the host's tables: up to 24 memory reads for one miss.",
        source: NESTED,
      },
    },
    "walk.absent": {
      key: true,
      plain: "Line {line} of the last table says {tone:fail|not present}: the page isn't in memory.",
      why: "The line's present flag is 0, so it names no room for the CPU to use.",
      look: ["{entryId}"], picture: "storage",
      deeper: {
        how: "Bit 0 of the line, P, is 0. The CPU then ignores every other bit, so the operating system may keep its own notes there: here, the page's slot on disk.",
        real: "Linux keeps the slot there too, but stored inverted (every bit flipped), so the line can never look like a real frame number to a CPU that reads it by mistake (the L1TF flaw, 2018). This run stores the slot plainly in bits 12 and up.",
        source: LINUX_SWP,
      },
    },

    // ---- The real room (the new-address story, then the recent-address story) ----
    "room.address": {
      key: true,
      plain: "Room {frame}, then offset {off}: the real address, the {term:physical address}, {pa}.",
      why: "Only the room number came from the directory; the offset copied over unchanged.",
      look: ["pa"], picture: "room",
      deeper: {
        how: "The frame number fills bits 38–12 of the physical address and the offset bits 11–0: frame × 4,096 + offset. This CPU has 39 physical address bits, a common laptop size.",
        code: "`return table | off;` (line 15)",
        source: SDM,
      },
      "plain@hit": "Frame {frame}, then offset {off}: the {term:physical address}, {pa}.",
      "why@hit": "The note gave the room, so not one directory line was read.",
      "deeper@hit": {
        how: "The frame number fills bits 38–12 of the physical address and the offset bits 11–0: frame × 4,096 + offset.",
        code: "`return pfn << 12 | off;` (line 5)",
      },
    },
    "room.fill": {
      first: {
        when: (v) => !!v.evicted,
        plain: "A sticky note now maps page {vpn} to room {frame}, replacing {evicted}'s note.",
      },
      key: true,
      plain: "A sticky note now maps page {vpn} to room {frame}, on a free note.",
      why: "The next read in this page can skip the directory entirely.",
      look: ["{noteIds}"], picture: "notes",
      deeper: {
        how: "With every note in use, the one used longest ago makes room: least recently used, LRU.",
        code: "`tlb_insert(vpn, table >> 12);` (line 14)",
        edge: "A note is written only after a walk that ends in a room. A walk that finds “not present” leaves no note behind.",
        source: SDM,
      },
    },
    "room.byte": {
      plain: "The byte at {pa} is {byte}. Finding its room cost {cycles} cycles.",
      why: "Nothing was remembered, so every directory line came from slow memory: the worst case.",
      look: ["{byteId}"],
      deeper: {
        cost: "{cycles} cycles: 1 for the note check, then 4 directory reads at 240 each.",
        source: DREPPER,
      },
      "plain@hit": "The byte at physical address {pa} is {byte}, after {count:cycles|cycle}.",
      "why@hit": null,
      "deeper@hit": null,
    },
    "room.cost": {
      key: true,
      plain: "Finding the room cost {count:cycles|cycle}; the directory would have added up to {walk}.",
      why: "Real programs keep reusing their pages, so notes answer almost every lookup.",
      look: ["tlb"],
      deeper: {
        cost: "Up to 4 directory reads at about 240 cycles each from main memory: {walk} cycles saved.",
        how: "A first-level TLB hit costs about nothing: the CPU's first cache starts looking with the 12 offset bits, which need no translating, while the notes translate the rest at the same time.",
        source: DREPPER,
      },
    },

    // ---- Same page again ----
    "again.next": {
      plain: "Next it reads the following byte, {va}: same page, one byte further in.",
      look: ["va"],
      deeper: { how: "{va} differs only in its offset, now {off}; bits 47–12 still say page {vpn}." },
    },
    "again.hit": {
      key: true,
      plain: "A note {tone:ok|has} page {vpn}: room {frame} in 1 cycle, no directory read.",
      why: "One slow lookup per page, then every later read in that page rides on the note.",
      look: ["{noteIds}"], picture: "notes",
      deeper: {
        cost: "1 cycle, against {first} for the first byte.",
        how: "A first-level hit is close to free: the CPU's first cache (L1, the smallest copy of memory beside it) starts its lookup with the 12 offset bits, which need no translating, while the TLB translates the rest at the same time.",
        edge: "That trick caps the L1 cache: each of its ways can hold at most one 4 KiB page's worth. So a 32 KiB L1 has 8 ways and a 48 KiB one has 12.",
        source: DREPPER,
      },
    },
    "again.address": {
      plain: "Room {frame}, then offset {off}: physical address {pa}, no directory opened.",
      look: ["pa"],
    },
    "again.byte": {
      plain: "The byte at {pa} is {byte}. Two reads so far: {cycles} cycles.",
      look: ["{byteId}"],
    },
    "again.rest": {
      plain: "It reads on to the page's end: {count:rest|more byte}, 1 cycle each.",
      look: ["{noteIds}"],
      deeper: { cost: "{rest} note hits at 1 cycle each: {rest} cycles, and not one directory read." },
    },
    "again.total": {
      key: true,
      plain: "{loads} reads, {cycles} cycles: about {each} each. The note did nearly all the work.",
      why: "The one slow lookup is shared by every read in the page, so the average stays small.",
      look: ["tlb"],
      deeper: {
        cost: "{first} cycles for the first read, then 1 for each of the rest: {cycles} cycles over {loads} reads.",
        edge: "Reading one byte from each of many pages instead would miss on every page and pay a walk each time. Code that hops across a huge array feels this.",
        real: "A 2 MiB huge page lets one note cover 512 small pages, and its walk stops at the third table. Linux uses them for large memory areas.",
        source: THP,
      },
    },

    // ---- Another program ----
    "other.switch": {
      key: true,
      plain: "Switching to program B, the operating system loads B's directory into CR3: {cr3}.",
      why: "On this CPU, writing CR3 also wipes every sticky note, since A's notes would mislead B.",
      look: ["cr3"], picture: "desk",
      deeper: {
        cost: "The wipe is the hidden cost of a switch: B's first reads all miss and walk.",
        how: "With PCIDs (process-context identifiers), CR3 carries a 12-bit tag, each note keeps the tag of the program that made it, and a switch keeps other tags' notes. Without them, a CR3 write drops every note except global ones, which the operating system uses for its own pages.",
        real: "Linux does not give each process a lasting tag: each CPU recycles 6 tags (TLB_NR_DYN_ASIDS) among the programs it ran most recently, and with page-table isolation each uses a pair, one for the program and one for the operating system side. ARM and RISC-V tag notes the same way (an ASID).",
        source: LINUX_TLB,
      },
    },
    "other.miss": {
      plain: "Program B reads the same address, {va}. No note has it: a {tone:warn|miss}.",
      look: ["tlb"],
    },
    "other.walk": {
      key: true,
      plain: "B's own directory leads {va} to room {frame}, after {cost} cycles.",
      why: "B's CR3 starts a different chain of tables, so the same bits pick lines in other tables.",
      look: ["t0", "t1", "t2", "t3"], picture: "directory",
      deeper: {
        cost: "{reads} reads, {cost} cycles: the wipe made B start with no notes.",
        how: "The 4 line numbers are the same as A's, because {va} has not changed. Only the tables they index differ, because the chain starts from B's CR3.",
        edge: "Two directories may name the same room on purpose: that is how programs share library code (marked read-only) and shared memory.",
        source: OSTEP_SMALL,
      },
    },
    "other.address": {
      plain: "Room {frame}, then the same offset {off}: B's physical address is {pa}.",
      look: ["pa"],
    },
    "other.fill": {
      plain: "A sticky note now maps page {vpn} to room {frame}, B's room this time.",
      look: ["{noteIds}"],
    },
    "other.byte": {
      plain: "B reads {byteB} from room {frameB}. A's byte, {byteA}, sits untouched in {frameA}.",
      look: ["{byteIdB}", "{byteIdA}"],
    },
    "other.apart": {
      key: true,
      plain: "Same address, two rooms: each program's directory keeps their data apart.",
      why: "A program reaches only rooms its own directory names, and only the operating system writes directories.",
      look: ["{pageIds}"], picture: "directory",
      deeper: {
        how: "Each line also has a US flag (programs may use it) and RW (may write). The operating system's own pages sit in every directory but are marked off-limits to programs.",
        real: "Meltdown (2018) read those off-limits pages anyway, through the CPU's guesswork. Linux answered with page-table isolation: a second directory without them, swapped in on every system call, which made PCID tags matter.",
        source: KPTI,
      },
    },

    // ---- Fetch from disk ----
    "fault.trap": {
      plain: "The CPU stops the program and hands the address to the {term:kernel}: {cycles} cycles.",
      why: "Only the operating system knows where the page went, so the CPU must ask it.",
      look: ["{kernelId}"],
      deeper: {
        cost: "{cycles} cycles, about 1 µs: saving the program's place, entering the kernel, finding the line, and returning.",
        how: "The CPU raises exception 14, a page fault, puts the address in register CR2 and jumps to the kernel's handler. The read is undone, so it can run again from the start.",
        code: "`raise(PAGE_FAULT, va);` (line 11)",
        source: SDM,
      },
    },
    "fault.disk": {
      key: true,
      plain: "The kernel copies the page from disk slot {slot} into free room {frame}.",
      why: "This copy is the slow part: {cycles} cycles, longer than everything else in this read together.",
      look: ["page"], picture: "storage",
      deeper: {
        cost: "{cycles} cycles at 3 GHz is 20 µs, a typical 4 KiB read from an NVMe SSD. The counter adds them as this read's delay, but the program does no work then: it sleeps, and the CPU runs another program until the disk is done.",
        how: "The kernel takes a free room, asks the disk for the slot named in the line, and waits for the copy to finish.",
        code: "`swap_read(pte_to_swp_entry(*pte), frame);` (line 22)",
        edge: "A fault that needs no disk, such as the first touch of fresh memory (a minor fault), costs only the stop and the kernel's work: no copy, no wait.",
        real: "An SSD read takes about 10–100 µs; a spinning disk takes milliseconds, millions of cycles.",
        source: GREGG,
      },
    },
    "fault.fix": {
      plain: "The kernel writes room {frame} into line {line}, marks it present, and returns.",
      why: "The read that stopped halfway can now start over from the beginning.",
      look: ["{entryId}"],
      deeper: {
        how: "The new line holds frame {frame} with P set, plus RW, US, A, D and NX, the flags of a data page.",
        code: "`*pte = frame | PRESENT | RW | USER | ACCESSED | DIRTY | NX;` (line 23)",
        source: OSTEP_SWAP,
      },
    },

    // ---- Try again ----
    "retry.miss": {
      key: true,
      plain: "Still no note for page {vpn}: a {tone:warn|miss}.",
      why: "A note is written only after a walk that finds a room, and the last walk didn't.",
      look: ["tlb"],
      deeper: {
        how: "The CPU never keeps a note of a not-present line, so turning P from 0 to 1 needs no clearing of notes (SDM §4.10.2 and §4.10.4).",
        edge: "Changing a line that was present is different: an old note may still hold it. The kernel must drop it with `invlpg`, and on a many-core machine interrupt every core that may hold it, a TLB shootdown.",
        source: SDM,
      },
    },
    "retry.walk": {
      when: (v) => v.cached === v.reads,
      plain: "The same {reads} lines again, now from the {term:cache}: {cost} cycles in all.",
      why: "The first walk left these lines in fast memory beside the CPU, so each read is cheap.",
      look: ["t0", "t1", "t2", "t3"],
      deeper: {
        cost: "{cost} cycles for {reads} reads, against 240 each from main memory.",
        how: "The cache here models the CPU's second-level cache: about 14 cycles a read. The kernel's own write of the last line left that line there too.",
        source: DREPPER,
      },
    },
    "retry.address": {
      plain: "Room {frame}, then offset {off}: the {term:physical address}, {pa}.",
      why: "The offset copies over unchanged; only the room number came from the directory.",
      look: ["pa"], picture: "room",
      deeper: {
        how: "The frame number fills bits 38–12 of the physical address and the offset bits 11–0: frame × 4,096 + offset.",
        code: "`return table | off;` (line 15)",
      },
    },
    "retry.fill": {
      first: {
        when: (v) => !!v.evicted,
        plain: "A sticky note now maps page {vpn} to room {frame}, replacing {evicted}'s note.",
      },
      plain: "A sticky note now maps page {vpn} to room {frame}, on a free note.",
      look: ["{noteIds}"],
      deeper: { how: "With every note in use, the one used longest ago makes room: least recently used, LRU." },
    },
    "retry.byte": {
      plain: "The byte at physical address {pa} is {byte}: {cycles} cycles for one byte.",
      look: ["{byteId}"],
    },
    "retry.cost": {
      key: true,
      plain: "A hit costs {hit} cycle and a walk up to {walk}; this read cost {cycles}.",
      why: "The disk made up {disk} of it, which is why the system keeps busy pages in memory.",
      look: ["ssd"],
      deeper: {
        cost: "Of {cycles} cycles, 60 000 were the disk copy and 3 000 the stop and the kernel's handler; the note checks and walks were the rest.",
        edge: "The disk share is waiting, not CPU work: the program sleeps through it while others run. A machine short of memory that faults constantly does little but wait, which is called thrashing.",
        source: OSTEP_SWAP,
      },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "notes.cost": {
      options: [
        { misconception: "m-walk",
          feedback: "If you thought every read walks the directory: only a miss does. A note still maps page {vpn} to room {frame}, so this lookup takes 1 cycle, not {walk}." },
        { feedback: "Right. The page was read a moment ago, so note {slot} still holds its room, {frame}: 1 cycle, no directory." },
      ],
    },
    "again.cost": {
      options: [
        { misconception: "m-walk",
          feedback: "If you thought every read walks the directory: only a miss does. The note written a moment ago maps page {vpn} to room {frame}, so this read takes 1 cycle." },
        { feedback: "Right. Both bytes are in page {vpn}, and a note already maps it to room {frame}: 1 cycle, no directory." },
        { misconception: "m-walk",
          feedback: "Real CPUs do keep some upper directory lines in small caches, which can shorten a walk. But here the note answers first, for the whole page, so no walk starts at all: 1 cycle, not {first}." },
      ],
    },
    "other.whose": {
      options: [
        { misconception: "m-fixed",
          feedback: "If you thought an address is one fixed place: it is only B's own number. B's directory turns {va} into room {frame}, a room A never uses." },
        { feedback: "Right. CR3 now points at B's directory, and its lines lead {va} to room {frame}, a room only B was given." },
        { misconception: "m-unique",
          feedback: "If you thought two programs can't share an address: they share them all the time. B reads {va}, the same number A read, and its own directory sends it to room {frame}." },
      ],
    },
    "retry.note": {
      options: [
        { misconception: "m-note",
          feedback: "If you thought the notes learn what the kernel fixed: the kernel wrote the directory line, not a note. A note is written only after a walk that ends in a room, and the last one ended at “not present”." },
        { feedback: "Right. The last walk found no room, so it left no note, and the kernel only changed the directory. The CPU walks again." },
      ],
    },
  },
};
