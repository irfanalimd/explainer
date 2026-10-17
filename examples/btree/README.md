# B+ tree: how a database finds one row without reading them all

A real B+ tree (Comer, "The Ubiquitous B-Tree", ACM Computing Surveys 11(2), 1979, section 3) indexes `orders.id`,
written for a beginner who knows arrays and sorting but has never met an index (`meta.level: "core"`). Ids live only
in the bottom pages (the leaves); upper pages hold signposts (separators) that only route searches; leaves are linked
left to right. Each page is a housing, each id a tile coloured by its value band (10–19, 20–29, …), so sorted order
and a range read as runs of colour.

**The lesson** (the plan sits at the top of `figure.mjs`):

- **Hook:** a table of a million orders. How does a database find one order in three or four reads, instead of
  checking every row?
- **Picture:** a library. Books in a pile (a table with no index) must be checked spine by spine. Shelves of 3 books
  in order are leaf pages; signposts saying which aisle are the upper pages and their separators; the signpost at the
  door is the root; walking from the door to one shelf is the descent, one page per level; a crowded shelf becoming
  two is a split; shelves side by side are the leaf chain.
- **Problem first:** chapter 1 checks the arriving ids one by one, a "check" marker walking the pile, until the
  target turns up (8 checks for 10 ids). The summary compares: any id now takes one page read per level.
- **Chapters:** Without an index · One page · Leaf split · Descend · Root split (in two stories) · Range scan.
- **Misconceptions:** "a search checks every page" (predicted at the first descent: 2 pages, one per level) and
  "the tree grows at the bottom" (predicted at the root split: a new root appears on top).
- **Words:** index, page, root, leaf, separator, each defined at first use.

Every predict question sits on its chapter's first step (the range scan's on its second), because the HUD withholds
a chapter's about until its predictions are revealed.

- **What is real:** the whole algorithm, at the knob's page size (3–5 ids). Leaves split `ceil((m+1)/2)` left and
  the rest right; an inner page of m+1 ids keeps `floor((m+1)/2)`, sends the next up and moves the rest right.
  Page reads are counted as one per page visited. The range bounds are picked from the inserted ids. The opening
  scan really checks the arriving ids in order until it reaches the target.
- **Simplifications:** ids are unique; no deletes, no latches, no write-ahead log; pages hold ids only (no record
  pointers); every rightmost split is a plain half split. Real engines special-case it (InnoDB splits at the insert
  point; PostgreSQL fills the rightmost leaf to its fillfactor) precisely because of what "Ids that only grow" shows.

## Stories

| Story | What happens | What it teaches |
|---|---|---|
| Ids in any order | 10 random two-digit ids, 3 per page. Predicts: what happens to a page with 4 ids? How many pages must the search for 15's leaf read? How does the range search reach the next ids? | The first leaf split grows a new root on top; later leaf splits copy a signpost up; the tree stays 2 levels with leaves 83 % full; a range search goes down once and walks along the leaves. |
| Ids that only grow | 10 ids, each one bigger than the last. | Every insert takes the rightmost path; each textbook half split leaves a leaf 2 of 3 full that never fills again (67 %; real engines split rising ids unevenly), and the tree reaches 3 levels with the same 10 ids. |
| The top page fills up | `41 18 63 29 75 52 11 24 84 89 57 35`, chosen so every split leaves two half-full leaves. | The fifth leaf overflows the root at the 10th insert. Predict: where does the new level go? The root splits, 63 moves up into a new root, and the tree grows at the top. Two more inserts then descend 3 levels. |

Knobs: ids per page (3–5), how many ids (4–14), your own ids, finish with a range search, seed. The old "Insert
order" knob is gone: the stories set it (`pattern` is a hidden scenario param).
Numbers: levels and pages split in two (in the dock), how full the bottom pages are (in the dock for "Ids that only
grow"), pages, pages read, ids checked one by one.

Layout: landscape draws one row per level, root on top, leaf chain along the bottom. A portrait phone draws the
tree on its side (root on the left, one column per level, the leaf chain running down) so pages stay legible.

## Invariants (verify checks every step of every run)

- Keys are sorted in every page, and the tiles in each page are exactly the model's keys in order.
- Every page is within bounds: at most m keys (m + 1 only in the step where it overflows, before its split), at
  least the minimum except the root, and an inner page has one more child than keys.
- All leaves sit at the same depth, equal to the height.
- Separators bound their subtrees: every key under child i of an inner page lies in `[keys[i-1], keys[i])`.
- The leaf chain, from the leftmost leaf, lists every leaf key in increasing order.
- The leaves hold exactly the keys inserted so far, and all of them at the end.

## Commands

```sh
node ../../scripts/lesson.mjs figure.mjs --all           # the lesson as text, then the teaching checks
node ../../scripts/verify.mjs figure.mjs                 # 17 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # b-tree.html
node ../../scripts/shoot.mjs b-tree.html --scenario all
node ../../scripts/audit.mjs b-tree.html --scenario all
```
