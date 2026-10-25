# The other five lessons in the new voice

> Draft, for review only. Don't merge yet.

MapReduce, Raft and the event loop were rewritten earlier to sound like a teacher sitting beside the reader (#35, #36).
This branch does the same for the other five examples: B+ tree, consistent hashing, linked list, quicksort and virtual
memory. Only the words change. Every number, source and fact is the one that was checked before.

## What changed, in every lesson

- **Captions are sentences.** "Ring: 3 of 16 moved; one in 5 is 3.2. Remainder way: 14." now reads "The ring moved 3 of 16
  keys, and one in 5 is 3.2. The remainder way moved 14." Quicksort's "29 is smaller than 87: it swaps…" became "…, so
  it swaps…" throughout.
- **No sentence starts on a lowercase label.** "p1 splits…" is "Page p1 splits…", "db05 joins…" is "When db05 joins…",
  and "head holds…" is "A variable called head holds…".
- **Each wrong answer gets its own reply.** The 25 replies that opened with "If you thought…" now say why the pick was
  tempting and what the run shows instead. No two replies under one question share a line.
- **The "why" lines vary.** Some answer the reader's objection ("You might expect only the new server's share to
  move."), some point at the screen ("Look at how little of the tree lights up."), and some compare with what a person
  would do.
- **The expert notes lose their semicolon chains and colon reveals**, one idea per sentence, with the same citations.
- **The hooks, recaps, takeaways and question wording** in each `figure.mjs` got the same treatment.

## Checks (on 7af669f)

| | `main` (4c343db) | this branch |
|---|---|---|
| Unit tests | 387 / 387 | 387 / 387 |
| `verify.mjs`, the five rewritten examples | 0 failing, 0 warnings | 0 failing, 0 warnings |
| `verify.mjs`, all 8 | 0 failing (Raft's 3 known warnings, MapReduce 1) | 0 failing (Raft's 3 known warnings) |

The lessons are a little longer, because full sentences need their small words back. The reading grade stays about
the same:

| | words before → after | reading grade before → after |
|---|---|---|
| B+ tree | 1582 → 1863 | 4.7 → 4.7 |
| Consistent hashing | 1175 → 1310 | 4.5 → 4.9 |
| Linked list | 968 → 1055 | 3.9 → 4.4 |
| Quicksort | 2026 → 2205 | 5.2 → 5.2 |
| Virtual memory | 1093 → 1155 | 5.7 → 5.7 |

Every caption is still under 18 words and every chapter intro under 40, at every knob setting verify tries.

## Files here

- `lessons/<example>-before.txt` and `-after.txt`: each lesson printed by `node scripts/lesson.mjs`, story by story,
  so the two can be read side by side or diffed.
- `verify.txt`, `tests.txt`: the check logs.
- `btree-descend.png`: the B+ tree's Descend chapter at 1440×900, to show the longer text still fits the panel.
