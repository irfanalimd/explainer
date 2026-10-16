# B+ tree: insert and split

A real B+ tree (Comer, "The Ubiquitous B-Tree", ACM Computing Surveys 11(2), 1979, section 3) indexes `orders.id`.
Keys live only in the leaves; inner pages hold separators that only route searches; leaves are chained left to
right. Each page is a housing, each key a tile coloured by its value band (10–19, 20–29, …), so sorted order and a
range read as runs of colour. The reader should come away knowing:

- An insert reads one page per level: at each inner page, `bisect_right(keys, key)` picks the child.
- A full leaf splits in half. The right half's first key is **copied** up: it stays in the leaf and becomes a
  separator in the parent. The leaf chain is relinked around the new page.
- An inner page that overflows splits too, but its middle key is **pushed** up and leaves the page.
- When the root splits, a new root appears above it: a B+ tree grows at the top, so every leaf stays at the same
  depth.
- A range query descends once, then walks the leaf chain sideways.

- **What is real:** the whole algorithm, at the knob's page size (3–5 keys). Leaves split `ceil((m+1)/2)` left and
  the rest right; an inner page of m+1 keys keeps `floor((m+1)/2)`, pushes the next up and moves the rest right.
  Page reads are counted as one per page visited. The range bounds are picked from the inserted keys.
- **Simplifications:** keys are unique; no deletes, no latches, no write-ahead log; pages hold keys only (no record
  pointers); every rightmost split is a plain half split. Real engines special-case it (InnoDB splits at the insert
  point; PostgreSQL fills the rightmost leaf to its fillfactor) precisely because of what "Sequential inserts" shows.

## Scenarios

| tab | story | what it teaches |
|---|---|---|
| Random inserts | 10 random two-digit ids, 3 keys per page. | Leaf splits copy a separator up; the tree stays 2 levels with leaves 83 % full. Predict: what happens to a page with 4 keys? Then a range scan follows the chain. |
| Sequential inserts | 10 auto-increment ids. | Every insert takes the rightmost path; each split leaves a half-full leaf behind that never fills again (67 %), and the tree reaches 3 levels with the same 10 keys. |
| Root split | `41 18 63 29 75 52 11 24 84 89 57 35`, chosen so every split leaves two half-full leaves. | The fifth leaf overflows the root at the 10th insert: the root splits, pushes 63 up into a new root, and the tree grows a level. Predict: push or copy? Two more inserts then descend 3 levels. |

Knobs: max keys per page (3–5), keys to insert (4–14), insert order, a typed key list, range scan on or off, seed.
Counters: height, pages, page reads, splits, leaf fill.

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
node ../../scripts/verify.mjs figure.mjs                 # 18 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # b-tree.html
node ../../scripts/shoot.mjs b-tree.html --scenario all
node ../../scripts/audit.mjs b-tree.html --scenario all
```
