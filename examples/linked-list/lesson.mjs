// The words the linked-list figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure owns
// every fact and passes it as a var; nothing here computes. Templates stay true at every knob value (n 5–7, k 1–4).
//   run-wide vars: n, first, second, secondAddr, others, lastId, arr
//   insert, wrong: k, kth, new, newAddr, prev, prevId, after, afterId, moved, hops (+ lost, lostN in wrong)
//   find:          find, findth, findAt, findV, findPrev, findHops, findId
//   per step:      v (a slide), a, aId, b, bId, baddr, ith (a hop), chain (a read from head), lostZones
// Every real-world claim names its source as [id] (lesson.sources below), with a locator where it helps.
const CPYTHON_LIST = "[cpython-list] list_resize";
const LINUX_LIST = "[linux-list] __list_add";

export const lesson = {
  sources: [
    { id: "clrs4", title: "Introduction to Algorithms, 4th edition, §10.2 Linked lists", by: "Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest and Clifford Stein", year: 2022, where: "MIT Press",
      url: "https://mitpress.mit.edu/9780262046305/introduction-to-algorithms/",
      supports: "insert after a known node in constant time, search by walking from the head, and the sentinel that removes the empty-list special case" },
    { id: "knuth1", title: "The Art of Computer Programming, Vol. 1: Fundamental Algorithms, 3rd edition, §2.2.3 Linked allocation", by: "Donald E. Knuth", year: 1997, where: "Addison-Wesley",
      url: "https://www-cs-faculty.stanford.edu/~knuth/taocp.html",
      supports: "linked against sequential allocation: insertion without moving other items, and no jump to the kth item" },
    { id: "knuth2", title: "The Art of Computer Programming, Vol. 2: Seminumerical Algorithms, 3rd edition, §3.1, exercise 6", by: "Donald E. Knuth", year: 1997, where: "Addison-Wesley",
      url: "https://www-cs-faculty.stanford.edu/~knuth/taocp.html",
      supports: "Floyd's cycle-finding method: one marker moves one step, the other two" },
    { id: "stroustrup2012", title: "Software Development for Infrastructure", by: "Bjarne Stroustrup", year: 2012, where: "IEEE Computer 45(1):47–58",
      url: "https://doi.org/10.1109/MC.2011.353",
      supports: "inserting random numbers into a sorted sequence and removing them at random positions, a vector beat a linked list for N “much larger than 500,000”; a list of 4-byte ints takes 12 bytes per item with 4-byte links" },
    { id: "cpython-list", title: "CPython, Objects/listobject.c", by: "The Python developers", year: 2026, where: "CPython source",
      url: "https://github.com/python/cpython/blob/main/Objects/listobject.c",
      supports: "list_resize over-allocates to newsize + newsize/8 + 6, rounded down to a multiple of 4; a list stores one pointer per item" },
    { id: "cpython-functools", title: "CPython, Lib/functools.py: lru_cache", by: "The Python developers", year: 2026, where: "CPython source",
      url: "https://github.com/python/cpython/blob/main/Lib/functools.py",
      supports: "the LRU cache keeps a circular doubly linked list, so a hit moves a node to the front with a few pointer writes" },
    { id: "python-deque", title: "collections.deque", by: "Python documentation", year: 2026, where: "docs.python.org",
      url: "https://docs.python.org/3/library/collections.html#collections.deque",
      supports: "indexed access is O(1) at both ends but slows to O(n) in the middle" },
    { id: "python-assign", title: "The Python Language Reference, §7.2 Assignment statements", by: "Python documentation", year: 2026, where: "docs.python.org",
      url: "https://docs.python.org/3/reference/simple_stmts.html#assignment-statements",
      supports: "the right-hand side is evaluated in full before any target is assigned" },
    { id: "linux-list", title: "Linux, include/linux/list.h", by: "The Linux kernel", year: 2026, where: "kernel source",
      url: "https://github.com/torvalds/linux/blob/master/include/linux/list.h",
      supports: "__list_add: next->prev = new, new->next, new->prev, then WRITE_ONCE(prev->next, new); a list_head is a sentinel in a circular list" },
    { id: "linux-rculist", title: "Linux, include/linux/rculist.h", by: "The Linux kernel", year: 2026, where: "kernel source",
      url: "https://github.com/torvalds/linux/blob/master/include/linux/rculist.h",
      supports: "__list_add_rcu fills in new->next and new->prev, then rcu_assign_pointer(prev->next, new)" },
    { id: "linux-mmap-min", title: "Documentation for /proc/sys/vm: mmap_min_addr", by: "The Linux kernel documentation", year: 2026, where: "docs.kernel.org",
      url: "https://docs.kernel.org/admin-guide/sysctl/vm.html#mmap-min-addr",
      supports: "user processes may not map the lowest pages, so a null dereference faults" },
    { id: "glibc-malloc", title: "glibc, malloc/malloc.c", by: "The GNU C Library", year: 2026, where: "glibc source",
      url: "https://sourceware.org/git/?p=glibc.git;a=blob;f=malloc/malloc.c",
      supports: "minimum allocated size with 8-byte pointers: 24/32 bytes (32 with an 8-byte size field)" },
    { id: "harris2001", title: "A pragmatic implementation of non-blocking linked-lists", by: "Timothy L. Harris", year: 2001, where: "DISC 2001, LNCS 2180:300–314",
      url: "https://doi.org/10.1007/3-540-45414-4_21",
      supports: "a lock-free list inserts with one compare-and-swap" },
    { id: "pugh1990", title: "Skip lists: a probabilistic alternative to balanced trees", by: "William Pugh", year: 1990, where: "Communications of the ACM 33(6):668–676",
      url: "https://doi.org/10.1145/78973.78977",
      supports: "express lanes of extra links over a sorted linked list, so a search skips most nodes" },
    { id: "valgrind", title: "Valgrind Memcheck manual, §4.2.10 Memory leak detection", by: "The Valgrind developers", year: 2026, where: "valgrind.org",
      url: "https://valgrind.org/docs/manual/mc-manual.html#mc-manual.leaks",
      supports: "“definitely lost” blocks have no pointer to them; “indirectly lost” ones are pointed to only from lost blocks" },
    { id: "gregg2020", title: "Systems Performance: Enterprise and the Cloud, 2nd edition", by: "Brendan Gregg", year: 2020, where: "Addison-Wesley",
      url: "https://www.brendangregg.com/systems-performance-2nd-edition-book.html",
      supports: "Table 2.2, example latencies: main memory about 100 ns" },
    { id: "drepper2007", title: "What Every Programmer Should Know About Memory", by: "Ulrich Drepper", year: 2007, where: "akkadia.org (Red Hat)",
      url: "https://www.akkadia.org/drepper/cpumemory.pdf",
      supports: "a dependent load that misses the cache waits on main memory; §3.3.2 measures it for lists of scattered elements" },
  ],

  goal: "Insert into the middle of a list without moving anything.",
  objectives: [
    { id: "o-shift", text: "Explain why inserting into an array moves items and inserting into a linked list does not." },
    { id: "o-order", text: "Do the two pointer writes of an insert in the right order, and say why the order matters." },
    { id: "o-cost", text: "Say what a linked list pays instead: a walk from head, an extra address and an allocation per node." },
  ],

  misconceptions: [
    { id: "m-prevfirst", wrong: "You point the old node at the new one first, then fill in the new node.", fix: "The old node's `next` is the only copy of the next address. Overwrite it first and the rest of the list is gone." },
    { id: "m-order", wrong: "The two writes don't touch each other, so either order works.", fix: "One write reads the old node's `next`, the other overwrites it. The read has to come first." },
    { id: "m-jump", wrong: "A linked list is an array with arrows drawn on it, so you can jump to item 5.", fix: "A node's address is written only in the node before it, so you must walk there." },
    { id: "m-count", wrong: "Reaching the 5th item takes 5 arrows, one per item.", fix: "You start standing on the 1st node, so 4 arrows reach the 5th." },
    { id: "m-copy", wrong: "Copying a node's `next` copies the address it held earlier.", fix: "A copy takes what the field holds right now." },
    { id: "m-empty", wrong: "Overwriting an arrow leaves it empty, so a copy of it reads null.", fix: "An overwrite puts a new address in its place. Null appears only where null is written." },
  ],

  picture: {
    name: "a treasure hunt",
    rows: [
      { id: "node", picture: "a clue card", real: "a node", term: "node" },
      { id: "value", picture: "the prize written on the card", real: "its value" },
      { id: "next", picture: "where the next clue is hidden", real: "next, an address", term: "pointer" },
      { id: "head", picture: "the first clue, handed to you", real: "head", term: "head" },
      { id: "null", picture: "“this is the last clue”", real: "null", term: "null" },
    ],
    breaks: "A hiding place here is a number. If you know it, you can jump straight there. The trouble is knowing it.",
  },

  terms: {
    address: { lead: "a house number for memory", def: "The number that says where something is stored in memory, like a house number." },
    node: { lead: "a box", def: "One item of a linked list: a value, plus the address of the next box." },
    pointer: { lead: "an arrow", def: "A value that holds a memory address, so it says where something else lives." },
    head: { lead: "the first arrow", def: "A variable holding the address of the first box. Every trip starts there." },
    null: { lead: "no address", def: "A special value meaning “no address”. In next, it means nothing comes after." },
  },

  chapters: {
    array: {
      teach: { prompt: "Before it runs: to fit one new number into the middle of an array, how many numbers have to move?", listen: "Every number after the gap, each one slot to the right. Ask what that costs for the first slot of a million-item array.", minutes: 2 },
      about: "An array keeps its items side by side in one block of memory. Its label is the block's {term:address}: where it starts, like a house number. To open a gap, every later item slides over.",
      enter: { sofar: "You know arrays: a row of values in order, like a[2].", now: "Put {new} into the middle, right after {prev}.", done: "{new} sits right after {prev}, and the counter shows how many numbers moved." },
    },
    "array@find": {
      teach: { prompt: "The array starts at one address and each int takes 4 bytes. How do you find the address of the 4th item without looking at the others?", listen: "Start plus 3 × 4: one sum, whatever the length. That works only because the items sit side by side.", minutes: 2 },
      about: "An array keeps its items side by side, 4 bytes each (one int), from one {term:address}: where the block starts, like a house number. So item k sits at start + (k − 1) × 4.",
      enter: { sofar: "You know arrays: a row of values in order, like a[4].", now: "Find the {findth} item.", done: "We know its address without looking at any other item." },
    },
    nodes: {
      teach: { prompt: "In a treasure hunt, each clue says where the next one is hidden. What do you need in your hand to start?", listen: "Only the first clue. In the list that is head: lose it and every node is out of reach, though all of them are still in memory.", minutes: 3 },
      about: "Think of a treasure hunt: each clue says where the next clue is hidden. A linked list gives each item its own {term:node}, anywhere in memory.",
      enter: { sofar: "The array fit {new} in, but {count:moved|number} had to slide over first.", now: "Give each item its own box that says where the next one is.", done: "Every node can be reached by following arrows from head.", picture: true },
      "enter@find": { sofar: "The array found the {findth} item with one sum, but only because its items sit side by side.", now: "Give each item its own box that says where the next one is.", done: "Every node can be reached by following arrows from head.", picture: true },
    },
    walk: {
      teach: { prompt: "We want to stand on the 3rd item. How many arrows do we follow from head?", listen: "Two: you start on the 1st node. Expect “three”. Then ask why the walk can't skip ahead.", minutes: 2 },
      about: "No node knows its own position, so every trip starts at head and follows the `next` addresses, one arrow at a time. Here we need the {kth} item.",
      enter: { sofar: "Every node can be reached from head, but only through the arrows.", now: "To insert after {prev}, first reach it.", done: "Our marker stands on {prev}, the {kth} item." },
    },
    "walk@find": {
      teach: { prompt: "The array found its item with one sum. Why can't the list do the same?", listen: "A node's address is written only in the node before it, so you have to walk there. Expect “it's an array with arrows drawn on”.", minutes: 3 },
      about: "A node's address is written only inside the node before it, so there is no jumping ahead. Start at head and follow the arrows, one by one.",
      enter: { sofar: "Every node can be reached from head, but only through the arrows.", now: "Reach the {findth} item.", done: "Our marker stands on {findV}, and the counter shows the arrows it took." },
    },
    insert: {
      teach: { prompt: "To put the new node after `prev`, which two arrows change, and which one do you write first?", listen: "The new node's `next` takes `prev`'s `next`, then `prev` points at the new node. Take guesses on the order before the next chapter shows the wrong one.", minutes: 4 },
      about: "To add {new} after {prev}, make a new node anywhere there is room, then change two arrows. Nothing already in the list moves.",
      enter: { sofar: "Our marker stands on {prev}, the {kth} item; the insert code calls it `prev`.", now: "Link {new} in after {prev} by changing two arrows.", done: "Reading from head passes {prev} → {new} → {after}." },
    },
    wrong: {
      teach: { prompt: "This time `prev` is pointed at the new node first. Before it runs: what happens to the rest of the list?", listen: "`prev`'s `next` was the only copy of the next node's address. Overwritten first, the rest of the list is unreachable, and the new node points at itself.", minutes: 4 },
      about: "This time {prev} is pointed at the new node first. But {prev}'s `next` held the only copy of {after}'s address.",
      enter: { sofar: "Our marker stands on {prev}, the {kth} item; the insert code calls it `prev`.", now: "Link {new} in after {prev}, but change {prev}'s arrow first.", done: "A read from head shows whether {after} can still be reached." },
    },
    right: {
      teach: { prompt: "Same two writes, other order. Why does that one swap fix everything?", listen: "Reading `prev.next` into the new node first saves the address in a second place. Only then is it safe to overwrite it.", minutes: 3 },
      about: "Swap the two writes. The new node copies {prev}'s `next` first, so {after}'s address is saved. Then {prev} can safely point at it.",
      enter: { sofar: "Changing {prev} first lost {count:lostN|node}, and the walk never ends.", now: "Rewind, and do the two writes in the other order.", done: "{after}'s address is in two places before {prev} changes, and nothing is lost." },
    },
    tradeoff: {
      teach: { prompt: "So should we always use a linked list for inserts in the middle?", listen: "Not by default. The list skips the shifting but pays a walk, an extra address per node and an allocation each. Stroustrup measured a vector beating a list on exactly this job, past 500,000 numbers.", minutes: 4 },
      about: "Each is quick at something. An array slides items to make room. A linked list changes two arrows, but must walk from head to find the spot.",
      enter: { sofar: "Both now hold {new} right after {prev}, but each paid a different price.", now: "Line up the two costs.", done: "You can say what each cost grows with." },
    },
    "tradeoff@find": {
      teach: { prompt: "Name a program that reaches items by position all the time, and one that only ever adds and removes at the front.", listen: "By position, an array wins with one sum. Only at the front, a list never walks at all. Listen for the cost of each operation, not the name of the structure.", minutes: 3 },
      about: "Each is quick at something. An array jumps to any position with one sum. A linked list must walk there from head, one arrow at a time.",
      enter: { sofar: "The array took one sum, but the list had to walk.", now: "Line up the two costs.", done: "You can say what each cost grows with." },
    },
  },

  steps: {
    // ---- chapter 1, insert and wrong stories ----
    "array.goal": {
      plain: "{n} numbers sit side by side, then one free slot. {new} goes after {prev}.",
      why: "Lists change in the middle all the time: a song added mid-playlist, a line typed mid-document.",
      look: ["arr"],
      deeper: {
        cost: "Inserting after item k of n moves n − k items: {moved} of {n} here. O(n) in the worst case.",
        how: "The free slot is spare room the array keeps at its end. When none is left, the array grows into a bigger block and copies every item over.",
        real: "CPython's list over-allocates by about one eighth when it grows (newsize + newsize/8 + 6, rounded down to a multiple of 4), so appends are cheap on average. It never leaves a gap in the middle.",
        source: CPYTHON_LIST,
      },
    },
    "array.slide": {
      first: {
        key: true,
        when: (v) => v.moved > 1,
        plain: "{v} slides one slot right, into the free slot.",
        why: "We start at the end. Starting at the front would write over a number before it had moved.",
        deeper: {
          how: "Each slide is one copy into the slot to the right. Going from the end, every copy lands on a slot already emptied.",
          code: "CPython's list insert shifts the same way, last item first: `for (i = n; --i >= where; ) items[i+1] = items[i];`",
          source: CPYTHON_LIST,
        },
      },
      plain: "{v} slides one slot right.",
      look: ["arr"],
    },
    "array.drop": {
      key: true,
      plain: "{new} drops into the gap. {count:moved|other number} had to move.",
      why: "Every insert pays this: the more items after the gap, the more slide.",
      look: ["arr"],
      deeper: {
        cost: "Here {moved} of {n} items moved. C code can do it as one block copy (memmove) of {moved} × 4 bytes: cheap per item, but it grows with the list.",
        how: "For short arrays this is fast: the bytes sit side by side, so the CPU streams them.",
        edge: "Where you insert sets the bill: at the front all {n} move, at the end none. That is why Python's `append` is cheap and `insert(0, x)` is not.",
      },
    },

    // ---- chapter 1, find story ----
    "jump.where": {
      plain: "{n} numbers side by side from {arr}. Where is the {findth} item?",
      why: "An address is a number, so we can do arithmetic with it.",
      look: ["arr"],
      deeper: {
        how: "Each int takes 4 bytes, so every slot's address is the start plus a multiple of 4.",
        edge: "This only works if every item has the same size. A Python list of mixed objects still qualifies: it stores an 8-byte pointer per item, not the objects themselves.",
        source: CPYTHON_LIST,
      },
    },
    "jump.sum": {
      key: true,
      plain: "Start + {findHops} × 4 bytes = {findAt}. One sum, one jump: it's {findV}.",
      why: "The 1st item sits at the start, so the {findth} is {findHops} slots past it.",
      look: ["arr"],
      deeper: {
        cost: "O(1) for any position: the same one sum for the 2nd item or the millionth.",
        how: "This is what a[i] compiles to: base + i × size, counting i from 0, so the 1st item is base + 0.",
        code: "x86 does the sum inside the load itself: `mov eax, [rdi + rsi*4]`.",
      },
    },

    // ---- chapter 2: the parts (every story) ----
    "nodes.one": {
      key: true,
      plain: "A {term:node} holds the value {first} and `next`: the next node's address.",
      why: "Each item carries the next one's address, so the items no longer need to sit side by side.",
      look: ["n0"], picture: "node",
      deeper: {
        cost: "Memory per item goes up. In C on a 64-bit machine this node is 16 bytes (a 4-byte int, 4 bytes of padding, an 8-byte address), against 4 bytes per number in the array.",
        how: "The padding is there because the CPU wants an 8-byte address to start at a multiple of 8.",
        code: "C: `struct node { int value; struct node *next; };`",
        edge: "In Python each Node is a full object with its own header, and its value is another object, so it is far bigger still.",
      },
    },
    "nodes.scattered": {
      plain: "The other {others} nodes sit wherever memory had room. Each label is its address.",
      why: "They are not side by side, so making room never means sliding anything.",
      look: ["mem"],
      deeper: {
        cost: "One allocation per node: malloc in C, Node() in Python. The array asked for its whole block once.",
        how: "Nothing keeps neighbours together: each node lands wherever the allocator found room at that moment.",
        real: "glibc's malloc hands out at least a 32-byte chunk on a 64-bit machine, so a 16-byte node takes 32.",
        source: "[glibc-malloc] “Minimum allocated size”",
      },
    },
    "nodes.pointer": {
      key: true,
      plain: "{first}'s `next` holds {secondAddr}, {second}'s address. A stored address is a {term:pointer}, drawn as an arrow.",
      why: "Every node does the same, so the arrows chain all {n} nodes together.",
      look: ["n0.next", "n0->n1"], picture: "next",
      deeper: {
        how: "The machine stores only the number {secondAddr}; the arrow is our drawing of it. Python hides the number, but a reference is stored the same way.",
        code: "C: `a->next = b;` copies b's 8-byte address into a.",
      },
    },
    "nodes.head": {
      plain: "{term:head} holds the first node's address.",
      why: "No node points at {first}, so head is the only way in.",
      look: ["head", "head->n0"], picture: "head",
      deeper: {
        how: "head is not a node: it is one variable holding an address. Lose it and you lose the whole list.",
        edge: "Inserting at the front changes head itself, a special case where bugs hide. A dummy first node (a sentinel) removes it.",
        real: "Linux's lists do exactly that: the list_head you hold is a sentinel, and the list loops back to it instead of ending.",
        source: "[clrs4] §10.2, sentinels; [linux-list]",
      },
    },
    "nodes.null": {
      plain: "The last `next` is {term:null}: no address. The list ends here.",
      why: "A walk stops when it reads null.",
      look: ["{lastId}.next"], picture: "null",
      deeper: {
        how: "On Linux a C null pointer is address 0, and no program may map the lowest pages, so no node can live there.",
        code: "C writes `NULL`, Python `None`.",
        edge: "Following null is a bug: in C it is undefined behaviour, which on Linux is a segmentation fault, because that page is unmapped; in Python, an AttributeError.",
        source: "[linux-mmap-min]",
      },
    },

    // ---- chapter 3: walk ----
    "walk.start": {
      plain: "Start where head points. Our marker, `cur`, is on {first}, the 1st item.",
      why: "We need to stand on {prev}, the node {new} goes after.",
      "why@find": "We can't jump: only {first}'s `next` knows where the 2nd item lives.",
      look: ["head", "cur"],
      deeper: {
        how: "`cur` holds a copy of head's address. Moving it changes nothing in the list.",
        code: "`cur = head` (line 7)",
      },
    },
    "walk.hop": {
      first: {
        key: true,
        why: "One arrow, one step. There is no way to skip ahead.",
        deeper: {
          cost: "Reaching item k takes k − 1 hops: O(k).",
          how: "Each hop loads an address that the previous load produced, so the CPU can't start the next hop early. On scattered nodes each hop can miss the cache and wait on main memory, on the order of 100 ns.",
          code: "`cur = cur.next` (lines 8–9)",
          edge: "Real code also checks `cur is None` on every hop: a list shorter than k runs off the end.",
          source: "[knuth1] §2.2.3; [drepper2007] §3.3.2; [gregg2020] Table 2.2",
        },
      },
      plain: "Follow {a}'s `next`, {baddr}: it's {b}, the {ith} item.",
      look: ["{aId}->{bId}", "cur"],
    },
    "walk.found": {
      key: true,
      plain: "Found the {findth} item, {findV}, after {count:findHops|arrow}.",
      why: "Every position costs one more arrow. The 1000th would take 999.",
      look: ["{findId}"],
      deeper: {
        cost: "Array: O(1) by position. List: O(k), {findHops} hops here.",
        real: "CPython's deque is a linked list of blocks. Its docs say indexed access is O(1) at both ends but slows to O(n) in the middle.",
        source: "[python-deque]",
      },
    },

    // ---- chapter 4: insert (the make step is shared with the wrong story) ----
    "insert.make": {
      plain: "Make `new`, a node for {new}, wherever memory has room. Its `next` is null.",
      why: "No arrow leads to it yet, so a walk from head can't reach it.",
      look: ["nx"],
      deeper: {
        how: "In this run it landed at {newAddr}. Any free spot works; that's the point.",
        code: "`new = Node(value)` (line 13)",
        edge: "In C, malloc can fail and return NULL. Real code checks before linking the node in.",
      },
    },
    "insert.save-next": {
      key: true,
      plain: "{new}'s `next` copies {prev}'s. Now {new} points at {after} too.",
      why: "{after}'s address is now written in two places, so changing {prev} is safe.",
      look: ["nx.next", "nx->{afterId}"], picture: "next",
      deeper: {
        cost: "O(1) once you stand on {prev}: two writes, whatever the length. Getting to {prev} was the O(k) part.",
        how: "`new.next = prev.next` must run first: until it does, {prev}'s `next` is the only copy of {after}'s address.",
        code: "`new.next = prev.next` (line 14)",
        real: "Linux's lists are doubly linked. Its __list_add sets next->prev, fills in new->next and new->prev, and writes prev->next last.",
        source: LINUX_LIST,
      },
    },
    "insert.link-prev": {
      key: true,
      plain: "{prev}'s `next` now points at {new}. The chain runs {prev} → {new} → {after}.",
      why: "One write, and every walk from head now passes through {new}.",
      look: ["{prevId}.next", "{prevId}->nx"],
      deeper: {
        how: "Storing one aligned address is a single write on common CPUs, so a reader sees the old list or the new one, never half of each.",
        code: "`prev.next = new` (line 15)",
        edge: "A doubly linked list needs four writes, and the same rule holds: finish the new node before anything points at it.",
        real: "With readers running at the same time, this last write is the “publish”. Linux's RCU lists set new->next and new->prev, then rcu_assign_pointer(prev->next, new). Lock-free lists do it with one compare-and-swap (Harris 2001).",
        source: "[linux-rculist] __list_add_rcu; [harris2001]",
      },
    },
    "insert.read": {
      plain: "Read from head: {chain}. {new} is in, and nothing moved.",
      why: "The proof: walking the arrows now meets {new} in its place.",
      look: ["head"],
      deeper: {
        how: "Every old node still sits at the address on its label. Nothing was copied, and only {prev}'s `next` changed.",
        edge: "Because nothing moved, any other variable still pointing at a node stays valid. An array insert can't promise that: a grow copies the block to a new address.",
      },
    },

    // ---- chapter 5: trade-off ----
    "tradeoff.insert": {
      key: true,
      plain: "Array: {count:moved|item} moved. List: none moved, 2 arrows changed, {count:hops|arrow} followed.",
      why: "Neither is free: the array pays for every item after the gap, the list for every item before it.",
      look: ["arr", "{prevId}"],
      deeper: {
        cost: "At position k of n: the array finds the spot in O(1) and shifts n − k items; the list walks k − 1 arrows and splices in O(1). The list also stores an extra address in every node and makes one allocation per node.",
        edge: "Measured, the array can win anyway. Stroustrup inserted random numbers into a sorted sequence, then removed them at random spots: a C++ vector beat a linked list past 500,000 numbers. Finding each spot walks the list, one cache miss per hop.",
        real: "Lists earn their place when you already hold the node. CPython's lru_cache keeps a doubly linked list so a hit moves to the front with a few pointer writes, no walk.",
        source: "[stroustrup2012] Figure 1; [cpython-functools] lru_cache",
      },
    },
    "tradeoff.find": {
      key: true,
      plain: "Array: one calculation. List: {count:findHops|arrow} followed.",
      why: "Finding by position is the list's weak spot, and it grows with the position.",
      look: ["arr", "{findId}"],
      deeper: {
        cost: "Array: one sum and one load. List: {findHops} loads, each waiting on the one before.",
        real: "Need fast inserts and fast lookups? Skip lists add express lanes over a linked list, so a search skips most nodes (Pugh 1990).",
        source: "[pugh1990]",
      },
    },

    // ---- the wrong-order story ----
    "wrong.prev-first": {
      key: true,
      plain: "First, {prev}'s `next` is pointed at {new}.",
      why: "That was the only place {after}'s address was written. It's gone now.",
      look: ["{prevId}.next"], picture: "next",
      deeper: {
        how: "Overwriting a pointer you still need is the classic linked-list bug. It's why textbooks write the two lines in a fixed order.",
        code: "`prev.next = new` ran before `new.next = prev.next`.",
        edge: "Python's tuple swap is safe in either order: `prev.next, new.next = new, prev.next` reads the whole right side before writing anything.",
        source: "[python-assign]",
      },
    },
    "wrong.self-loop": {
      key: true,
      plain: "{new}'s `next` copies {prev}'s: {new}'s own address. It points at itself.",
      why: "{prev}'s `next` already held {new}'s address, and a copy takes what is there now.",
      look: ["nx.next"],
      deeper: {
        how: "An assignment reads its right side at the moment it runs. Nothing remembers what {prev}'s `next` held before.",
        code: "`new.next = prev.next` (line 14): now {newAddr}, {new}'s own address.",
      },
    },
    "wrong.lost": {
      key: true,
      plain: "Nothing points at {after} now, so {count:lostN|node} {be:lostN} lost for good: {lost}.",
      why: "Each address was written only in the node before it. Nothing else remembers them.",
      look: ["{lostZones}"],
      deeper: {
        how: "In C, lost nodes leak: still allocated, but no pointer is left to free them with. In CPython, reference counts drop to zero when {prev}'s `next` is overwritten, so they are freed at once. Either way the data is gone.",
        real: "Valgrind calls the first lost block “definitely lost” and any behind it “indirectly lost”: pointed to only from lost blocks.",
        source: "[valgrind]",
      },
    },
    "wrong.read-loop": {
      plain: "From head: {chain} → {new} → … forever. It never reaches the end.",
      why: "A program walking this list would hang, not crash.",
      look: ["nx"],
      deeper: {
        how: "The walk waits for null, and the loop never reaches one. Floyd's “tortoise and hare” spots a loop with two markers: one moves 1 arrow a step, the other 2, and they meet only if there is a loop.",
        source: "[knuth2] §3.1, exercise 6",
      },
    },
    "right.rewind": {
      plain: "Rewind to before the mistake: {prev} still points at {after}.",
      why: "Same list, same new node. Only the order changes.",
      look: ["{prevId}->{afterId}"],
      deeper: { how: "{new} is back at {newAddr} with `next` null, and nothing points at it yet." },
    },
    "right.save-next": {
      key: true,
      plain: "First, {new}'s `next` copies {prev}'s. {after}'s address is now in two places.",
      why: "The copy is the safety net: {prev} can change without losing {after}.",
      look: ["nx.next", "nx->{afterId}"],
      deeper: {
        cost: "Still 2 writes: the right order costs nothing extra.",
        code: "`new.next = prev.next` (line 14), before `prev.next = new`.",
      },
    },
    "right.link-prev": {
      plain: "Then {prev} points at {new}. Every node can still be reached.",
      look: ["{prevId}->nx"],
      deeper: { code: "`prev.next = new` (line 15)" },
    },
    "right.read": {
      plain: "From head: {chain}. Save the old arrow before you change it.",
      look: ["head"],
      deeper: { how: "The walk ends at null again: no loop, and no node lost." },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "insert.order": {
      options: [
        { text: "{new}'s next: point it at {after}",
          feedback: "Right. Copy {after}'s address into {new} while {prev}'s `next` still holds it." },
        { text: "{prev}'s next: point it at {new}", misconception: "m-prevfirst",
          feedback: "{prev}'s `next` is the only place {after}'s address is written. Overwrite it first and nothing can reach {after} again." },
        { text: "Either order works", misconception: "m-order",
          feedback: "Both writes use {prev}'s `next`: one reads it, the other overwrites it. Read first, or {after}'s address is gone." },
      ],
    },
    "walk.hops": {
      options: [
        { text: "1: jump straight there", misconception: "m-jump",
          feedback: "No sum gives {findV}'s address: it is written only in {findPrev}'s `next`. We must stand on {findPrev} first." },
        { text: "{findHops}",
          feedback: "Right. Each arrow moves one node along, so from the 1st node {count:findHops|arrow} reach the {findth}." },
        { text: "{find}", misconception: "m-count",
          feedback: "We already stand on the 1st node, {first}. Each arrow adds one node, so {count:findHops|arrow} reach the {findth}." },
      ],
    },
    "wrong.self": {
      question: "Next, {new} copies {prev}'s `next` (`new.next = prev.next`). Where will {new}'s `next` point?",
      options: [
        { text: "At {after}", misconception: "m-copy",
          feedback: "{prev}'s `next` stopped holding {after}'s address one step ago. The copy reads what is there now: {new}'s own address." },
        { text: "At {new} itself",
          feedback: "Yes: {prev}'s `next` now holds {new}'s own address, so copying it makes {new} point at itself." },
        { text: "Nowhere: null", misconception: "m-empty",
          feedback: "{prev}'s `next` isn't empty: the overwrite put {new}'s own address there, {newAddr}." },
      ],
    },
  },
};
