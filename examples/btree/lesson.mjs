// The words the B+ tree figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure owns every
// fact and passes it as a var; nothing here computes. Every line stays true at every knob value (3–5 ids per page,
// 4–14 ids, typed ids, the range search on or off). Plan and sources: review/curriculum.md.
//   every step:     M (ids per page), n (ids in all)
//   noindex:        keys, keyIds, sequential (pile); target, targetId, checks (check)
//   inserts:        key, keyId, leaf, leafId, over, held, reads, prev?, next?, path, pathIds; pages, levels, compares
//                   (descend only: one test per signpost page, in path order)
//   splits:         page, pageId, right, rightId, moved, movedIds, sep, sepId, parent, parentId, growing, over, kept, height
//                   (split.over: a leaf split that leaves {parent} over-full)
//   summary:        height, checks, pages, leaves, leafIds, thin, minLeaf, fill
//   scan:           lo, hi, reads, leaf, leafId, hits, hitIds, path, pathIds (descend); from, fromId, link, hop, last
//                   (walk, stop), stop (stop only); found, foundKeys, foundIds, down, along (done)
// A run that reaches 3 levels opens Descend (and its descend.reads question) after the root split, so the chapter's
// words hold in either order.
// A layer that states a fact about real systems names its source in `deeper.source` as [id] plus a locator; the ids are
// `lesson.sources`. The PostgreSQL claims were checked against the nbtree README, nbtsplitloc.c and the docs.

export const lesson = {
  sources: [
    { id: "bayer1972", title: "Organization and Maintenance of Large Ordered Indexes", by: "R. Bayer, E. McCreight", year: 1972,
      where: "Acta Informatica 1(3)", url: "https://doi.org/10.1007/BF00288683",
      supports: "the B-tree: fixed-size pages that split, a tree that grows at the root so every leaf sits at one depth" },
    { id: "comer1979", title: "The Ubiquitous B-Tree", by: "D. Comer", year: 1979, where: "ACM Computing Surveys 11(2)",
      url: "https://doi.org/10.1145/356770.356776",
      supports: "the B+ tree: ids in the leaves, separators above, the leaves linked for sequential access; B-trees as the de facto standard for indexing files" },
    { id: "lehman1981", title: "Efficient Locking for Concurrent Operations on B-Trees", by: "P. Lehman, S. B. Yao", year: 1981, where: "ACM TODS 6(4)",
      url: "https://doi.org/10.1145/319628.319663",
      supports: "right-links and high keys, so a reader that meets a concurrent split moves right" },
    { id: "pg-nbtree-readme", short: "PostgreSQL nbtree README", title: "src/backend/access/nbtree/README", by: "PostgreSQL", year: 2024, where: "PostgreSQL source tree",
      url: "https://github.com/postgres/postgres/blob/master/src/backend/access/nbtree/README",
      supports: "PostgreSQL implements Lehman and Yao; left links for backward scans; only completely empty pages are deleted; suffix truncation works on whole columns" },
    { id: "pg-splitloc", short: "PostgreSQL nbtsplitloc.c", title: "src/backend/access/nbtree/nbtsplitloc.c", by: "PostgreSQL", year: 2024, where: "PostgreSQL source tree",
      url: "https://github.com/postgres/postgres/blob/master/src/backend/access/nbtree/nbtsplitloc.c",
      supports: "a rightmost leaf split leaves the left half fillfactor% full; other leaf splits are 50:50" },
    { id: "pg-create-index", short: "PostgreSQL docs, CREATE INDEX", title: "CREATE INDEX", by: "PostgreSQL", year: 2024, where: "PostgreSQL documentation",
      url: "https://www.postgresql.org/docs/current/sql-createindex.html",
      supports: "btree is the default index method; B-trees use a default fillfactor of 90, applied when extending the index at the right" },
    { id: "pg-page-layout", short: "PostgreSQL docs, page layout", title: "Database Page Layout", by: "PostgreSQL", year: 2024, where: "PostgreSQL documentation",
      url: "https://www.postgresql.org/docs/current/storage-page-layout.html",
      supports: "tables and indexes are arrays of fixed-size pages, usually 8 kB" },
    { id: "pg-btree", short: "PostgreSQL docs, B-tree structure", title: "B-Tree Indexes: B-Tree Structure", by: "PostgreSQL", year: 2024, where: "PostgreSQL documentation",
      url: "https://www.postgresql.org/docs/current/btree.html#BTREE-STRUCTURE",
      supports: "each level of the tree can be used as a doubly-linked list of pages" },
    { id: "pg-explain", short: "PostgreSQL docs, EXPLAIN", title: "Using EXPLAIN", by: "PostgreSQL", year: 2024, where: "PostgreSQL documentation",
      url: "https://www.postgresql.org/docs/current/using-explain.html",
      supports: "a Seq Scan reads the whole table" },
    { id: "mysql-innodb", short: "MySQL docs, innodb_page_size", title: "InnoDB Startup Options and System Variables: innodb_page_size", by: "Oracle", year: 2024, where: "MySQL 8.4 Reference Manual",
      url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-parameters.html",
      supports: "InnoDB's default page size is 16 KB" },
  ],

  goal: "Find any id among many by reading one page per level, and keep the tree that short as ids arrive.",

  objectives: [
    { id: "o-descend", text: "Predict how many pages a search reads from the tree's height, not from how many pages it has." },
    { id: "o-split", text: "Perform a split: say which ids stay, which move to the new page, and which id goes up." },
    { id: "o-grow", text: "Explain why the tree grows a new level at the top, so every bottom page stays equally deep.", stories: ["sequential", "rootsplit"] },
    { id: "o-scan", text: "Count the pages a range search reads: one per level going down, then one per page walked along." },
    { id: "o-seq", text: "Explain why ids that only grow leave half-full pages behind when every split is down the middle.", stories: ["sequential"] },
  ],

  misconceptions: [
    { id: "m-every", wrong: "To be sure it finds the id, a search has to look through every page.",
      fix: "Each signpost page sends the search to exactly one page below it, so it reads one page per level." },
    { id: "m-bottom", wrong: "When the tree needs more room, it grows downward: new levels appear under the bottom pages.",
      fix: "Full pages split and send an id up; only a root split adds a level, and it adds it on top." },
    { id: "m-grow", wrong: "A full page can stretch to hold one more id, or the new id gets a page of its own.",
      fix: "A page is a fixed-size block on disk, so a page with too many ids must split into two." },
    { id: "m-back", wrong: "To reach the next ids in a range, the search climbs back up the tree, like in a binary search tree.",
      fix: "Each bottom page links to the next one, so the search walks sideways and never re-reads the pages above." },
  ],

  picture: {
    name: "a library with signposts",
    rows: [
      { id: "pile", picture: "books dropped in a pile, checked spine by spine", real: "a table with no index", term: "index" },
      { id: "shelf", picture: "a shelf holding a few books in order", real: "a bottom page of the tree, a leaf", term: "leaf" },
      { id: "signpost", picture: "a signpost saying which aisle to take", real: "an upper page and its separators", term: "separator" },
      { id: "door", picture: "the signpost at the door", real: "the root, where every search starts", term: "root" },
      { id: "walk", picture: "walking from the door to one shelf", real: "the descent: one page read per level" },
      { id: "chain", picture: "shelves standing side by side", real: "the leaf chain, each leaf linked to the next" },
    ],
    breaks: "A library adds shelves at the end of an aisle. A full page here splits in two and sends a signpost up, so new levels appear at the top, by the door.",
  },

  terms: {
    index: { lead: "a sorted guide", def: "A sorted guide that says where each row is, like the tabs of a phone book." },
    page: { lead: "a fixed-size block", def: "A fixed-size block that the disk reads in one go; here it holds a few ids." },
    root: { lead: "the top page", def: "The top page of the tree, where every search starts." },
    leaf: { lead: "a bottom page", def: "A page at the bottom of the tree, holding the ids themselves." },
    separator: { lead: "a signpost id", def: "An id in an upper page that says which way to go: smaller ids go left." },
  },

  chapters: {
    noindex: {
      about: "Think of a library with no signs and no order: to find one book, you check every spine. A table with no {term:index}, no sorted guide, works the same way.",
      enter: { sofar: "You can find a value in a list by checking each item in turn.",
        now: "Find one order id among {n}, with no index to help.",
        done: "The marker stops on the target, and its tag shows how many ids it checked." },
    },
    page: {
      about: "A B+ tree keeps ids sorted in {term:page|pages}, fixed-size blocks, like books on a shelf. A page here holds {M} ids. The first page is also the {term:root}, the top page, where every search starts.",
      enter: { sofar: "In the pile, every extra order meant one more check, and the pile only grows.",
        now: "Keep the ids sorted, in one page that is also the root.",
        done: "Each id lands in its sorted place, until the page holds more than {M}.", picture: true },
    },
    split: {
      about: "A full {term:leaf}, a bottom page, splits into two. The right half's first id is copied up as a signpost, a {term:separator}: smaller ids go left, the rest go right. New pages are numbered in the order they are made.",
      enter: { sofar: "One page holds the ids in order, but it fits only {M}, and now it holds one too many.",
        now: "Split the full page in two, and put a signpost above the halves.",
        done: "Two half-full leaves sit side by side under a new top page." },
    },
    descend: {
      about: "Every insert starts at the root and follows its signposts down, one page per level, to the one leaf where the id belongs.",
      "about@sequential": "Every insert starts at the root and follows its signposts down, one page per level, to the one leaf where the id belongs. Rising ids always take the rightmost path.",
      enter: { sofar: "Splitting put signposts above the leaves: {pages} pages in {levels} levels now.",
        now: "Follow the signposts from the root down to the one leaf for {key}.",
        done: "Each insert lights one page per level, {levels} here, never all {pages}." },
      "enter@sequential": { sofar: "Splitting put signposts above the leaves, and every new id is the biggest yet.",
        now: "Follow the signposts down: rising ids always take the rightmost path.",
        done: "Every insert lands in the rightmost leaf, and the leaves to its left stop filling." },
    },
    root: {
      about: "A signpost page that is over-full splits too, and its middle id moves up, out of it. When the root splits, a new root appears on top: the tree grows at the top, never at the bottom.",
      enter: { sofar: "Each leaf split sent a signpost up to {page}, but now {page} holds one too many.",
        now: "Split the top page too, and send its middle id up into a new root.",
        done: "A new root sits on top, and every leaf is still on the bottom row." },
      "enter@rootsplit": { sofar: "Small pages filled fast, and each split sent a signpost up, until {page} itself overflowed.",
        now: "Split the top page too, and send its middle id up into a new root.",
        done: "A new root sits on top, and every leaf is still on the bottom row." },
    },
    scan: {
      about: "To find every id from {lo} to {hi}, go down once, to the first one. The leaves are linked left to right, like shelves side by side, so the search then walks along them.",
      enter: { sofar: "Any one id is found by reading one page per level, but a range can hold many ids.",
        now: "Go down once to where {lo} would be, then walk along the leaves.",
        done: "The search moves sideways from leaf to leaf, and stops once it passes {hi} or runs out of leaves." },
    },
  },

  steps: {
    // ---- Without an index ----
    "noindex.pile": {
      plain: "{n} order ids arrive and stay as they came, like books dropped in a pile.",
      "plain@sequential": "{n} order ids arrive, each one bigger than the last, and stay as they came.",
      why: "Nothing says where any one id sits, so a search can only check them in turn.",
      look: ["inserts"], picture: "pile",
    },
    "noindex.check": {
      key: true,
      plain: "With no index, finding {target} takes {count:checks|check}, one id at a time.",
      why: "Each check rules out only one id, so every new order adds work to every search.",
      look: ["{targetId}"],
      deeper: {
        cost: "{checks} of {n} checks here. On average a search with no index checks half the rows, and an id that isn't there costs all of them: O(n).",
        real: "A database does exactly this when no index fits the query: PostgreSQL's plan says Seq Scan, a read of every page of the table.",
        source: "[pg-explain]",
      },
    },

    // ---- One page ----
    "page.insert": {
      first: {
        why: "A sorted page can be searched by halves, and keeping it sorted now costs almost nothing.",
        picture: "shelf",
        deeper: {
          how: "Within a page the ids stay sorted, so finding an id's place is a binary search over the page, done in memory once the page is read.",
          code: "`insort(node.keys, key)` (line 6)",
          real: "Real pages are much bigger: PostgreSQL stores every table and index in 8 KB pages, and MySQL's InnoDB uses 16 KB pages by default, so one page holds hundreds of ids, not {M}.",
          source: "[pg-page-layout]; [mysql-innodb]",
        },
      },
      plain: "{key} goes into {leaf} in sorted order; it holds {count:held|id}, room for {M}.",
      look: ["{leafId}"],
    },

    // ---- Leaf split ----
    "split.leaf": {
      first: {
        key: true,
        why: "Both halves have room again, and the separator {sep}, up in the new root {parent}, picks the half.",
        picture: "signpost",
        deeper: {
          how: "{page} keeps the first {count:kept|id}; the rest move to {right}. A leaf copies its new right half's first id up, because every id must stay in a leaf. Since {page} was the root, the copy goes into a new root, {parent}.",
          code: "`sep = right.keys[0]  # copied up: it stays in the leaf` (line 12)",
          edge: "A separator need not be a real id, only something between the two halves. On a key of several columns, PostgreSQL 12 and later drop the trailing columns the separator doesn't need (suffix truncation), so upper pages fit more separators and the tree stays shorter.",
          source: "[pg-nbtree-readme]",
        },
      },
      plain: "{page} splits: {moved} move to {right}; {sep} is copied up to {parent}.",
      look: ["{rightId}", "{sepId}"],
    },
    "split.over": {
      plain: "{page} splits and copies {sep} up to {parent}; {parent} is now over-full.",
      why: "Each leaf split adds one signpost to the page above, and {parent} has room for only {M}.",
      look: ["{rightId}", "{sepId}", "{parentId}"],
    },

    // ---- Descend ----
    "descend.insert": {
      first: {
        key: true,
        why: "The separator in each page rules out every page below it but one, so only {count:reads|page} are read.",
        picture: "walk",
        deeper: {
          cost: "{count:reads|page read}, one per level, however many pages the tree holds. Each level multiplies the ids within reach by the ids per page, so levels grow as log n: O(log n) reads.",
          how: "At each page the search counts the separators that are ≤ the id and takes that child (Python's bisect_right). So an id equal to a separator goes right, to the leaf where that id itself lives.",
          code: "`node = node.kids[bisect_right(node.keys, key)]` (line 5)",
          real: "An 8 KB page holds a few hundred separators, so 3 levels reach tens of millions of rows and 4 reach billions. Every lookup reads the top levels, so they stay in memory, and a lookup that goes to disk reads only the lower levels there.",
          source: "[pg-page-layout]; [comer1979]",
        },
      },
      plain: "Insert {key} down {path}: {compares}.",
      look: ["{pathIds}"],
    },

    // ---- the end of the inserts ----
    "summary.done": {
      key: true,
      plain: "All {n} ids are in. Finding one reads {count:height|page}; the pile took {count:checks|check}.",
      why: "Reads follow the levels, not the ids, and a level is added only when the top page splits.",
      look: ["{leafIds}"],
      deeper: {
        cost: "{count:height|page read} per lookup, against {count:checks|check} in the pile. More ids add a level only after every page on the way down has filled.",
        how: "The leaves end {fill}% full. A leaf split leaves both halves at least {minLeaf} of {M} ids, so no leaf but the root falls below that: the B-tree's space promise.",
        edge: "Deletes do not merge half-empty pages back together. PostgreSQL deletes a page only once it is completely empty, and never the rightmost page of a level, so a tree almost never gets shorter.",
        source: "[pg-nbtree-readme]",
      },
    },
    "summary.thin": {
      key: true,
      plain: "Done, but {thin} of {leaves} leaves are stuck at {minLeaf} of {M} ids.",
      why: "Each split leaves its left half behind, and no later, bigger id ever lands there again.",
      look: ["{leafIds}"],
      deeper: {
        cost: "The leaves end {fill}% full, spread over {pages} pages. A fuller tree would hold the same ids in fewer pages, and fit more of itself in memory.",
        real: "PostgreSQL treats a split of the rightmost leaf as a sign of rising ids: the left half keeps the leaf fillfactor, 90% by default, instead of half. Every other leaf split is 50:50.",
        source: "[pg-splitloc]; [pg-create-index]",
      },
    },

    // ---- Root split / Signpost split ----
    "split.root": {
      key: true,
      plain: "{page} splits, and its middle id {sep} moves up into a new root, {parent}.",
      why: "The new level appears on top, so every leaf moves down together and stays equally deep.",
      look: ["{parentId}"], picture: "door",
      deeper: {
        how: "A signpost page moves its middle id up instead of copying it: {sep} leaves {page}, which keeps {count:kept|id}, and {moved} {be:moved} now in {right}. No copy is needed, because the leaves already hold every id.",
        code: "`tree.root = Inner([sep], [node, right])  # one level taller` (line 19)",
        edge: "This is the only step that makes the tree taller, now {height} levels. Adding the level above every leaf at once is why all leaves always sit at one depth.",
        real: "Bayer and McCreight published the B-tree in 1972. By 1979 Comer's survey could call it “ubiquitous”: the de facto standard way to index a file. It is still the index PostgreSQL's CREATE INDEX builds unless told otherwise.",
        source: "[bayer1972]; [comer1979]; [pg-create-index]",
      },
    },
    // only with your own ids at order 3, e.g. "99 98 … 86" (descending); verify's knob runs never split a signpost page
    "split.signpost": {
      first: {
        why: "Signpost pages split like leaves, but their middle id moves up, since the leaves already hold every id.",
        deeper: {
          how: "{page} keeps {count:kept|id}, {moved} {be:moved} now in {right}, and {sep} leaves both, moving up to {parent}. The tree stays {height} levels tall.",
          code: "`sep = node.keys[mid]  # pushed up: it leaves this page` (line 15)",
          source: "[comer1979]",
        },
      },
      plain: "{page} is over-full, so it splits: its middle id {sep} moves up to {parent}.",
      look: ["{sepId}", "{rightId}"],
    },

    // ---- Range scan ----
    "scan.descend": {
      plain: "Find ids {lo} to {hi}: going down {path} reads {count:reads|page}.",
      why: "Going down only finds where the range starts; the rest lies to the right, in order.",
      look: ["{pathIds}"],
    },
    "scan.walk": {
      first: {
        why: "Each leaf keeps a link to the next one, so the search never climbs back up.",
        picture: "chain",
        deeper: {
          how: "The search reads each leaf's ids in order and stops at the first id past {hi}, or when there is no next leaf.",
          code: "`leaf = leaf.next  # sideways, never back up` (line 33)",
          real: "The link matters beyond ranges. In Lehman and Yao's design, which PostgreSQL follows, a reader that reaches a page someone just split moves right along the link and still finds its id, without locking the path.",
          source: "[lehman1981]; [pg-nbtree-readme]",
        },
      },
      plain: "Walk on to {leaf}: {count:hits|id} in range, none past {hi}.",
      look: ["{link}", "{leafId}"],
    },
    "scan.stop": {
      first: {
        when: (v) => v.hop === 1,
        why: "Each leaf keeps a link to the next one, so the search never climbs back up.",
        picture: "chain",
        deeper: {
          how: "The search reads each leaf's ids in order and stops at the first id past {hi}, so it never reads a leaf it doesn't need.",
          code: "`if k > hi: return` (line 31)",
          real: "The link matters beyond ranges. In Lehman and Yao's design, which PostgreSQL follows, a reader that reaches a page someone just split moves right along the link and still finds its id, without locking the path.",
          source: "[lehman1981]; [pg-nbtree-readme]",
        },
      },
      plain: "Walk on to {leaf}: {count:hits|id} in range. {stop} is past {hi}, so the search stops.",
      why: "The leaves are in order, so every id after {stop} is past {hi} too.",
      look: ["{link}", "{leafId}"],
    },
    "scan.done": {
      key: true,
      plain: "{count:found|id} found with {count:reads|page read}: {down} going down, {along} along.",
      why: "The way down is paid once; every further read is one more leaf of the range.",
      look: ["{foundIds}"],
      deeper: {
        cost: "{count:reads|read} = {count:down|level} down + {count:along|leaf|leaves} walked. A range costs the height plus the leaves it spans, however many ids lie outside it.",
        real: "PostgreSQL links each level's pages both ways, so a descending range (ORDER BY id DESC) walks the same chain to the left.",
        source: "[pg-btree]; [pg-nbtree-readme]",
      },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "split.what": {
      options: [
        { feedback: "Right. A page is a fixed-size block, so {page} splits: it keeps {count:kept|id}, and {moved} move to {right}." },
        { misconception: "m-grow",
          feedback: "If you thought the newcomer gets a page of its own: pages would sit nearly empty, and every search would read more of them. Instead {page} splits, and both halves keep room to spare." },
        { misconception: "m-grow",
          feedback: "If you thought a page can stretch: it is a fixed-size block on disk, with room for {M}. So {page} splits: {count:kept|id} stay, {moved} move to {right}." },
      ],
    },
    "descend.reads": {
      options: [
        { feedback: "Right. The search reads {path}: {levels} pages, one per level. Each signpost page points to only one page below it." },
        { misconception: "m-every",
          feedback: "If you thought a search must look everywhere to be sure: each signpost page points to only one page below it, so it is {levels} reads out of {pages} pages. A real tree of billions of rows reads about 4." },
        { feedback: "Every search must start at the root, the only page it can find on its own, then read one page per level: {levels} pages." },
      ],
    },
    "root.where": {
      options: [
        { misconception: "m-bottom",
          feedback: "If you thought trees grow downward: a level under some leaves would leave the others shallower. Instead {page} splits and a new root, {parent}, appears above it." },
        { feedback: "Right. {page} splits, its middle id {sep} moves up into a new root, {parent}, and every leaf moves down together." },
        { misconception: "m-grow",
          feedback: "If you thought a page can stretch: {page} is a fixed-size block with room for {M} ids, so it must split, like the leaves did." },
      ],
    },
    "scan.next": {
      options: [
        { feedback: "Right. {from} links to {leaf}, so the next read is the very next leaf, and no page above is read again." },
        { misconception: "m-back",
          feedback: "If you thought it climbs back up, as in a binary search tree: {from} keeps a link to {leaf}, so the search walks sideways. Climbing would re-read a page it has already read." },
        { misconception: "m-back",
          feedback: "If you thought it starts over: that would re-read every page on the way down, once per leaf. The link from {from} to {leaf} skips all of that." },
      ],
    },
  },
};
