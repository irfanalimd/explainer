# Linked list: inserting without moving anything

The reference **intro** figure (`meta.level: "intro"`): one simple idea, taught to someone who knows what a variable
and an array are but has never thought about memory addresses. The same numbers live twice: in an array (one block,
side by side, with one free slot) and in a singly linked list (one node per number, wherever memory had room). Each
node is a housing titled with its own address; its tray holds two fields, `value` and `next`, and `next` holds the
real address of the following node. Every line on the floor is one of those `next` fields, drawn in the colour of the
node it leads to. Nodes sit at fixed spots and never move: that is the lesson. The reader should leave knowing:

- an array keeps items side by side, so making room in the middle slides every later item over;
- a node is a value plus the address of the next node (scavenger hunt: each clue says where the next one is hidden);
  `head` holds the first address, `null` marks the end;
- you reach item k only by following arrows from head, one at a time, because each address is written only in the
  node before it;
- inserting is two arrow changes, and their order matters: point the new node onward first, then point the old node
  at it. The other way round loses the rest of the list.

- **Source:** D. E. Knuth, *The Art of Computer Programming*, Vol. 1, §2.2.3 "Linked Allocation".
- **What is real:** the array really slides one item per step (from the end, into the free slot); every `next` tile
  shows the address the model holds; walks really follow those addresses from `head` (packets run along the lines,
  the `node` rod is the walking variable); the wrong order really runs `node.next = new` before
  `new.next = node.next`, so 42 really points at itself. The code panel (Python) lights the line each step runs.
- **Simplifications:** a singly linked list of small ints; 16-byte nodes at made-up but plausible heap addresses;
  the array holds 4-byte ints. No allocator, no garbage collector shown (lost nodes simply stay lost).

## Scenarios

| Story | What happens | What it teaches |
|---|---|---|
| Insert in the middle | 42 goes after 12: the array slides 3 items; the list walks 1 arrow, makes a node anywhere, changes 2 arrows, and a read from head shows the new order. Predict: which arrow changes first? | The aha: inserting moves nothing. The cost moves to finding the spot. |
| Find the 5th item | The array computes `0x7f3a_1000 + 4 × 4` and jumps; the list follows 4 arrows. Predict: how many arrows? | Arrays find by position in one step; lists have no shortcut. |
| Arrows in the wrong order | The same insert with the two updates swapped: 12's arrow is overwritten first, 42 then points at itself (predict: where does it point?), and 48, 17, 23 sit in a dashed "lost" zone while a walk loops 42, 42, 42… Then a rewind and the right order. | The classic bug, and why the order of the two updates matters. |

**Knobs:** list length (5–7), insert after item (1–4).
**Numbers (dock):** items moved and arrows changed (insert), arrows followed (find), items moved and nodes lost
(wrong order).

**Teaching features used:** `meta.level: "intro"` (slower reading), `meta.terms` with `{term:…}` at each first use
(node, address, pointer, head, null), `s.ask(…, { why })` once per story, `meta.recap` and per-story recaps, the
scavenger-hunt analogy in the "Boxes and arrows" chapter. `node scripts/lesson.mjs figure.mjs` prints the whole lesson as text.

Layout: landscape puts the nodes left to right with a little vertical jitter and the new node below the gap it
fills; a list of 6 or 7 folds into two rows (the second runs back right to left), with the new node above a gap in
the first row, beside the turn, or below a gap in the second, so the whole chain fits beside the explain panel at
1280×720. A portrait phone stacks the nodes top to bottom and puts the new node beside the gap. Every step frames
the whole world (`s.focus("world")`): the lesson is "follow the arrows from head", so head and the end of the
chain are always in view.

## Invariants (verify checks every step of every run)

- Every `next` tile shows exactly the address its node's `next` holds (`null` at the end).
- Walking the published `next` addresses from `head` reads the list the story says it is at that moment (and loops
  only while the wrong-order story says it does).
- A node is reachable from `head` unless it is marked lost (a new node not yet linked in is exempt).
- The array's tiles show exactly the values it holds, in slot order.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 15 runs, 0 failing, teaching checks clean
node ../../scripts/lesson.mjs figure.mjs                 # the lesson as a beginner reads it
node ../../scripts/build.mjs figure.mjs                  # linked-list.html
node ../../scripts/shoot.mjs linked-list.html --scenario all
node ../../scripts/audit.mjs linked-list.html --scenario all
```
