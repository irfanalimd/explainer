# B+ tree: curriculum

Level `core`. Planned against the figure as it stands (`figure.mjs`, step ids already in place: `noindex.*`,
`page.insert`, `descend.insert`, `split.leaf|signpost|root`, `summary.done|thin`, `scan.*`; asks `split.what`,
`descend.reads`, `root.where`, `signpost.what`, `scan.next`). This file plans words, not ids: if an id changes, the
plan maps by the step's meaning.

## Sources

- Canonical: D. Comer, "The Ubiquitous B-Tree", ACM Computing Surveys 11(2), 1979, section 3 (B+ trees: keys only in
  leaves, separators route, leaves linked). https://doi.org/10.1145/356770.356776
- R. Bayer and E. McCreight, "Organization and Maintenance of Large Ordered Indexes", Acta Informatica 1, 1972 (the
  original B-tree; split and grow-at-the-root). https://doi.org/10.1007/BF00288683
- P. Lehman and S. B. Yao, "Efficient Locking for Concurrent Operations on B-Trees", ACM TODS 6(4), 1981 (right-links
  between siblings; the design PostgreSQL's nbtree follows). https://doi.org/10.1145/319628.319663
- PostgreSQL nbtree split-point logic (rightmost split leaves the left page at fillfactor, 90 % leaf default, 70 %
  upper; "50/50 page splits are only appropriate with truly random insertions"):
  https://doxygen.postgresql.org/nbtsplitloc_8c_source.html and
  https://github.com/postgres/postgres/blob/master/src/backend/access/nbtree/README
- Misconception evidence: Stack Overflow, "What are the differences between B trees and B+ trees?" (linked leaves and
  range scans are the most-asked difference), https://stackoverflow.com/questions/870218 (not re-fetched: the site
  blocks this agent's fetcher).

## Prerequisites

Arrays and sorted order; binary search on a sorted list (helpful, not required); dictionaries; that a disk reads in
blocks and that a disk read is slow next to work in memory. Not assumed: trees, pointers, indexes, pages.

## Exact rules and numbers (from the run)

- Order M = ids per page, knob 3–5 (default 3). A page overflows at M + 1 and splits in the same insert.
- Leaf split: the left page keeps `ceil((M+1)/2)` ids, the right gets the rest; the right page's first id is
  **copied** up (it stays in the leaf). The new right leaf joins the chain: left → right → old next.
- Inner split: of M + 1 ids, the left keeps `floor((M+1)/2)`, the middle id **moves** up (it leaves the page), the rest
  go right with their children.
- Root split: a new root with one separator and two children; height + 1. The only way the tree gets taller.
- Minimums (non-root): leaf `floor((M+1)/2)`, inner `floor(M/2)`. All leaves at the same depth.
- Routing: child index = number of separators ≤ the id (`bisect_right`), so an id equal to a separator goes right.
- Page reads: an insert or search reads `height` pages (one per level). A range scan reads `height` going down plus
  one per extra leaf walked; it stops at the first id past `hi` or at the last leaf.
- Default run ("Ids in any order", 10 ids, M = 3): the pile takes 8 checks for the target; the tree ends at 2 levels,
  leaves 83 % full. "Ids that only grow": leaves stuck at 2 of 3 (67 %), 3 levels for the same 10 ids. "The top page
  fills up": `41 18 63 29 75 52 11 24 84 89 57 35`, the root splits at the 10th insert, 63 moves up.
- Real scale: PostgreSQL pages are 8 KB, InnoDB pages 16 KB; with hundreds of separators per page, 3 levels reach
  millions of rows and 4 levels billions, which is where the hook's "three or four reads" comes from.

## Objectives and their quiz stems

| Objective | Quiz stem |
|---|---|
| o-descend | "A tree has 3 levels and 40 pages. How many pages does finding one id read?" |
| o-split | "A page holds 12 18 25 and fits 3. Insert 21: what does each half hold, and which id goes up?" |
| o-grow | "The root splits. Which pages end up one level deeper than before?" (none: every leaf moves down together) |
| o-scan | "Ids 20 to 45 span 3 bottom pages of a 2-level tree. How many pages does the range search read?" (2 + 2 = 4) |
| o-seq | "Ids 10, 11, 12, … arrive in order, 3 per page, every split down the middle. How full are the pages left behind?" |

## Chapters (by their current names)

The parts chapter, whose entry card shows the picture map: **One page** (page and root, the first part of the tree on
screen; leaf and separator follow in Leaf split, so no chapter holds more than 3 new terms). The first chapter's about
already carries the library opening; the map's "pile" row is what it just showed.

| Chapter | So far | Now | You'll know it worked when |
|---|---|---|---|
| Without an index | You can find a value in a list by checking each item in turn. | Find one order id in a pile of ids, with no index. | The marker has checked {checks} ids before it reaches the target. |
| One page (parts, `picture: true`) | Without an index, finding one id meant checking them one by one. | Keep the ids sorted in one page, the root. | Each new id lands in its sorted place in the page. |
| Leaf split | One page holds the ids in order, but it only fits {M}. | Split a full page in two and send a signpost up. | Two half-full leaves sit under a page holding one separator. |
| Descend | A split left signpost pages above the leaves. | Follow the signposts down, one page per level, to the one right leaf. | Each insert lights one page per level, never the whole tree. |
| Root split / Signpost split | Inserts read one page per level, and full leaves split. | When an upper page overflows, split it too: its middle id moves up. | A new root appears on top (Root split), or the page above gains a signpost (Signpost split). |
| Range scan | Any one id is found in one page per level. | Find every id in a range: go down once, then walk along the leaves. | The search moves sideways along the chain and stops at the first id past the range. |

Story overrides worth writing: `enter@sequential` for Descend ("Rising ids always take the rightmost path"),
`enter@rootsplit` for Root split (its So far: "Five leaves sit under one top page that is already full").

## Key steps

- `noindex.check`: the naive way's cost, the number the summary compares against.
- the first `split.leaf` (`first: { key }`): the first split, which also grows the one-page root into two levels.
- the first `descend.insert` (`first: { key }`): one page per level, the claim of the hook.
- `split.root`: the aha of growing at the top.
- `summary.done` and `summary.thin` (the sequential story's payoff: pages stuck half full).
- `scan.done`: down once, then along.

`page.insert`, later `descend.insert`s, `split.signpost` and `scan.walk` are repeats: no `why` after the first.

## Asks and the misconceptions they confront

| Ask | Option → misconception |
|---|---|
| `split.what` | 0 right · 1 "the new id gets a page of its own" → m-grow · 2 "the page grows to fit" → m-grow |
| `descend.reads` | 0 right · 1 "all pages, to be sure" → m-every · 2 "only 1, straight to a leaf" → no misconception (feedback: the root is the only page the search can start from; a leaf is reached through it) |
| `root.where` | 0 "at the bottom" → m-bottom · 1 right · 2 "it just keeps N ids" → m-grow |
| `signpost.what` | 0 right · 1 "its extra id moves down into a leaf" → m-bottom · 2 "it keeps N ids" → m-grow |
| `scan.next` | 0 right · 1 "climbs back up to the page above" → m-back · 2 "starts again from the root" → m-back |

Every misconception is named by at least one ask in every story that reaches it; `split.what` is skipped when an
upper page will split (to stay at 3 questions), so m-grow is then carried by `root.where`/`signpost.what`.

## Expert nuances for `deeper`

- `split.leaf` how: a leaf **copies** its separator up (every id must stay in a leaf), an inner page **moves** its
  middle id up; edge: a separator need not be a real id at all; PostgreSQL 12+ truncates it to the shortest prefix that
  still separates (suffix truncation), so upper pages hold more and the tree stays shorter. Source: nbtree README.
- `descend.insert` cost: `height` reads, against `n` checks without an index; real: fan-out is hundreds per 8 KB page,
  so 4 levels cover billions, and the top levels sit in memory, so a lookup often costs one or two disk reads.
- `split.root` how: the only operation that changes height, which is why all leaves stay at one depth (Bayer &
  McCreight 1972).
- `summary.thin` real: PostgreSQL leaves the left page of a rightmost split 90 % full (fillfactor) and InnoDB splits at
  the insert point for rising keys, exactly because a 50/50 split leaves pages half full forever (nbtsplitloc.c).
- `scan.walk` real (the ten-year nuance): the leaf chain is not only for range scans; Lehman and Yao's right-links let
  a reader that lands on a page just split by someone else move right and still find its key, without locking the
  path. PostgreSQL's nbtree is built on it (TODS 1981).
- Edge for any lesson: real engines rarely merge half-empty pages on delete; PostgreSQL only removes pages that become
  empty.

## Why this ladder

The naive scan comes first so the reader wants the index; one sorted page shows "sorted" before "tree"; the leaf split
is the first moment there is a tree at all, so the descent can only come after it; growth at the top is held for its
own chapter because it carries the second misconception; the range scan is last because it needs the leaf chain the
splits built.

## Unsure

- m-grow and m-back are grounded in how readers who know Python lists and binary search trees reason (a list grows; a
  binary search tree's next value is found by climbing back up), not in a published concept inventory; none was found
  for B-trees.
- `descend.reads` fires on the first insert after the first split, when the tree has 3 pages and 2 levels: "all 3
  pages" against "2" is a weak contrast. Asking it later (more pages) or quoting the real scale in its feedback would
  make m-every vivid.
