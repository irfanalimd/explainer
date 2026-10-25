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
      fix: "Each signpost page sends the search to exactly one page below it, so the search reads one page per level and skips the rest." },
    { id: "m-bottom", wrong: "When the tree needs more room, it grows downward: new levels appear under the bottom pages.",
      fix: "Full pages split and send an id up to the page above. Only a split of the root adds a level, and the new level goes on top." },
    { id: "m-grow", wrong: "A full page can stretch to hold one more id, or the new id gets a page of its own.",
      fix: "A page is a fixed-size block on disk, so a page with one id too many has to split into two." },
    { id: "m-back", wrong: "To reach the next ids in a range, the search climbs back up the tree, like in a binary search tree.",
      fix: "Each bottom page links to the next one, so the search walks sideways and never reads the pages above it again." },
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
    breaks: "A library makes room by adding shelves at the end of an aisle. Here a full page splits in two and sends a signpost up instead, so new levels appear at the top, by the door.",
  },

  terms: {
    index: { lead: "a sorted guide", def: "A sorted guide that says where each row is, like the tabs of a phone book." },
    page: { lead: "a fixed-size block", def: "A fixed-size block that the disk reads in one go. Here each one holds a few ids." },
    root: { lead: "the top page", def: "The top page of the tree, where every search starts." },
    leaf: { lead: "a bottom page", def: "A page at the bottom of the tree, holding the ids themselves." },
    separator: { lead: "a signpost id", def: "An id in an upper page that tells a search which way to go. Smaller ids go to its left." },
  },

  chapters: {
    noindex: {
      about: "Picture a library where the books sit in the order they arrived. To find one, you would check spine after spine. A table with no {term:index} is the same, because nothing says where any row is.",
      enter: { sofar: "You can find a value in a list by checking each item in turn.",
        now: "Find one order id among {n}, with no index to help.",
        done: "The marker stops on the target, and its tag shows how many ids it checked." },
    },
    page: {
      about: "A B+ tree keeps its ids sorted in {term:page|pages}, fixed-size blocks, the way a shelf keeps books in order. Each page here fits {M} ids. The only page so far is also the {term:root}, where every search starts.",
      enter: { sofar: "In the pile, every new order meant one more check for every search, and the pile only grows.",
        now: "Keep the ids sorted, in one page that is also the root.",
        done: "Each id lands in its sorted place, until the page holds more than {M}.", picture: true },
    },
    split: {
      about: "When a {term:leaf} gets one id too many, it splits in two. The first id of the right half is copied up into the page above as a signpost, a {term:separator}. New pages are numbered as they are made.",
      enter: { sofar: "One page holds the ids in order, but it only fits {M}, and now it holds one too many.",
        now: "Split the full page in two, and put a signpost above the halves.",
        done: "Two half-full leaves sit side by side under a new top page." },
    },
    descend: {
      about: "From now on, each insert starts at the root. It follows the signposts down, one page per level, to the leaf where its id belongs.",
      "about@sequential": "From now on, each insert starts at the root. It follows the signposts down, one page per level, to the leaf where its id belongs. Each new id is the biggest yet, so it always takes the rightmost path.",
      enter: { sofar: "Splitting put signposts above the leaves, so the tree now has {pages} pages on {levels} levels.",
        now: "Follow the signposts from the root down to the one leaf for {key}.",
        done: "Each insert lights one page per level, {levels} here, out of {pages} pages." },
      "enter@sequential": { sofar: "Splitting put signposts above the leaves, and every new id is bigger than all the ones before it.",
        now: "Follow the signposts down. A rising id always takes the rightmost path.",
        done: "Every insert lands in the rightmost leaf, and the leaves to its left stop filling." },
    },
    root: {
      about: "A signpost page that fills up splits too, but its middle id moves up and leaves it. When the root splits, a new root appears above it, which is the only way the tree gets taller.",
      enter: { sofar: "Each leaf split sent a signpost up to {page}, and now {page} holds one too many.",
        now: "Split the top page too, and send its middle id up into a new root.",
        done: "A new root sits on top, and every leaf is still on the bottom row." },
      "enter@rootsplit": { sofar: "Pages this small fill quickly, and each split sent a signpost up, until {page} itself overflowed.",
        now: "Split the top page too, and send its middle id up into a new root.",
        done: "A new root sits on top, and every leaf is still on the bottom row." },
    },
    scan: {
      about: "To find every id from {lo} to {hi}, the search goes down once, to where {lo} would be. The leaves are linked left to right, like shelves standing side by side, so from there it walks along them.",
      enter: { sofar: "Any one id is found by reading one page per level, but a range can hold many ids.",
        now: "Go down once to where {lo} would be, then walk along the leaves.",
        done: "The search moves sideways from leaf to leaf, and stops once it passes {hi} or runs out of leaves." },
    },
  },

  steps: {
    // ---- Without an index ----
    "noindex.pile": {
      plain: "{n} order ids arrive and stay in the order they came, like books dropped in a pile.",
      "plain@sequential": "{n} order ids arrive, each one bigger than the last, and stay in the order they came.",
      why: "Nothing records where any one id sits, so the only way to find one is to check them one after another.",
      look: ["inserts"], picture: "pile",
    },
    "noindex.check": {
      key: true,
      plain: "With no index, finding {target} takes {count:checks|check}, one id at a time.",
      why: "Each check rules out just one id, so the work grows with the table. Every new order makes every later search one check longer.",
      look: ["{targetId}"],
      deeper: {
        cost: "{checks} of {n} checks here. On average a search with no index checks half the rows, and an id that isn't there costs all of them, which is O(n).",
        real: "A database does exactly this when no index fits the query. PostgreSQL's plan calls it a Seq Scan, which reads every page of the table.",
        source: "[pg-explain]",
      },
    },

    // ---- One page ----
    "page.insert": {
      first: {
        why: "Sorting a page this small might look like fuss. It pays off because a sorted page can be searched by halving it, and putting each id in its place now costs almost nothing.",
        picture: "shelf",
        deeper: {
          how: "Within a page the ids stay sorted, so finding an id's place is a binary search over the page, done in memory once the page is read.",
          code: "`insort(node.keys, key)` (line 6)",
          real: "Real pages are much bigger. PostgreSQL stores every table and index in 8 KB pages, and MySQL's InnoDB uses 16 KB pages by default, so one page holds hundreds of ids instead of {M}.",
          source: "[pg-page-layout]; [mysql-innodb]",
        },
      },
      plain: "The id {key} lands in {leaf}, in sorted order. Now it holds {count:held|id}, with room for {M}.",
      look: ["{leafId}"],
    },

    // ---- Leaf split ----
    "split.leaf": {
      first: {
        key: true,
        why: "Both halves have room again. The separator {sep}, up in the new root {parent}, is what tells a later search which half to read.",
        picture: "signpost",
        deeper: {
          how: "Page {page} keeps the first {count:kept|id}, and the rest move to {right}. A leaf copies the first id of its new right half up instead of moving it, because every id has to stay in some leaf. Since {page} was the root, the copy goes into a new root, {parent}.",
          code: "`sep = right.keys[0]  # copied up: it stays in the leaf` (line 12)",
          edge: "A separator only has to fall between the two halves, so it need not be a real id. On a key of several columns, PostgreSQL 12 and later drop the trailing columns a separator doesn't need, which is called suffix truncation. Upper pages then fit more separators, and the tree stays shorter.",
          source: "[pg-nbtree-readme]",
        },
      },
      plain: "Page {page} splits, sending {moved} to {right} and a copy of {sep} up to {parent}.",
      look: ["{rightId}", "{sepId}"],
    },
    "split.over": {
      plain: "Page {page} splits and copies {sep} up to {parent}, which leaves {parent} with one id too many.",
      why: "Every leaf split adds one signpost to the page above, and {parent} only has room for {M}.",
      look: ["{rightId}", "{sepId}", "{parentId}"],
    },

    // ---- Descend ----
    "descend.insert": {
      first: {
        key: true,
        why: "Look at how little of the tree lights up. The separators in each page rule out every page below it except one, so only {count:reads|page} are read.",
        picture: "walk",
        deeper: {
          cost: "{count:reads|page read}, one per level, however many pages the tree holds. Each level multiplies the ids within reach by the ids per page, so the number of levels, and of reads, grows as O(log n).",
          how: "At each page the search counts the separators that are ≤ the id and takes that child (Python's bisect_right). So an id equal to a separator goes right, to the leaf where that id itself lives.",
          code: "`node = node.kids[bisect_right(node.keys, key)]` (line 5)",
          real: "An 8 KB page holds a few hundred separators, so 3 levels reach tens of millions of rows and 4 reach billions. Every lookup reads the top levels, so they stay in memory, and a lookup that goes to disk reads only the lower levels there.",
          source: "[pg-page-layout]; [comer1979]",
        },
      },
      plain: "The id {key} goes down {path}, testing {compares}.",
      look: ["{pathIds}"],
    },

    // ---- the end of the inserts ----
    "summary.done": {
      key: true,
      plain: "All {n} ids are in. Finding any one now reads {count:height|page}, against {count:checks|check} in the pile.",
      why: "Adding ids didn't add reads. A search pays one read per level, and a level only appears when the top page splits.",
      look: ["{leafIds}"],
      deeper: {
        cost: "{count:height|page read} per lookup, against {count:checks|check} in the pile. More ids add a level only after every page on the way down has filled.",
        how: "The leaves end {fill}% full. A leaf split leaves each half with at least {minLeaf} of {M} ids, so no leaf except the root ever falls below that. This is the B-tree's promise about space.",
        edge: "Deletes do not merge half-empty pages back together. PostgreSQL deletes a page only once it is completely empty, and never the rightmost page of a level, so a tree almost never gets shorter.",
        source: "[pg-nbtree-readme]",
      },
    },
    "summary.thin": {
      key: true,
      plain: "All the ids are in, but {thin} of the {leaves} leaves are stuck at {minLeaf} of {M} ids.",
      why: "Each split leaves its left half behind. Every later id is bigger, so none of them ever lands there again.",
      look: ["{leafIds}"],
      deeper: {
        cost: "The leaves end {fill}% full, spread over {pages} pages. A fuller tree would hold the same ids in fewer pages, and fit more of itself in memory.",
        real: "PostgreSQL treats a split of the rightmost leaf as a sign that ids are rising. In that case the left half keeps the leaf fillfactor, 90% by default, instead of half. Every other leaf split is 50:50.",
        source: "[pg-splitloc]; [pg-create-index]",
      },
    },

    // ---- Root split / Signpost split ----
    "split.root": {
      key: true,
      plain: "Page {page} splits, and its middle id {sep} moves up into a new root, {parent}.",
      why: "This is how the tree gets taller. The new level appears on top, so every leaf moves down together and they all stay equally deep.",
      look: ["{parentId}"], picture: "door",
      deeper: {
        how: "A signpost page moves its middle id up instead of copying it. The id {sep} leaves {page}, which keeps {count:kept|id}, and {moved} {be:moved} now in {right}. No copy is needed, because the leaves already hold every id.",
        code: "`tree.root = Inner([sep], [node, right])  # one level taller` (line 19)",
        edge: "This is the only step that makes the tree taller, and it is now {height} levels. The new level goes above every leaf at once, which is why all the leaves always sit at the same depth.",
        real: "Bayer and McCreight published the B-tree in 1972. By 1979 Comer's survey could call it “ubiquitous”, the de facto standard way to index a file. It is still the index PostgreSQL's CREATE INDEX builds unless told otherwise.",
        source: "[bayer1972]; [comer1979]; [pg-create-index]",
      },
    },
    // only with your own ids at order 3, e.g. "99 98 … 86" (descending); verify's knob runs never split a signpost page
    "split.signpost": {
      first: {
        why: "Signpost pages split the way leaves do, except that their middle id moves up and leaves the page. The leaves already hold every id, so no copy needs to stay behind.",
        deeper: {
          how: "Page {page} keeps {count:kept|id}, {moved} {be:moved} now in {right}, and {sep} leaves both and moves up to {parent}. The tree stays {height} levels tall.",
          code: "`sep = node.keys[mid]  # pushed up: it leaves this page` (line 15)",
          source: "[comer1979]",
        },
      },
      plain: "Page {page} has one id too many, so it splits, and its middle id {sep} moves up to {parent}.",
      look: ["{sepId}", "{rightId}"],
    },

    // ---- Range scan ----
    "scan.descend": {
      plain: "To find ids {lo} to {hi}, the search goes down {path}, reading {count:reads|page}.",
      why: "Going down only finds where the range starts. Everything else in it lies to the right, already in order.",
      look: ["{pathIds}"],
    },
    "scan.walk": {
      first: {
        why: "Each leaf keeps a link to the one after it, so the search moves sideways and never climbs back up.",
        picture: "chain",
        deeper: {
          how: "The search reads each leaf's ids in order and stops at the first id past {hi}, or when there is no next leaf.",
          code: "`leaf = leaf.next  # sideways, never back up` (line 33)",
          real: "The link matters beyond ranges. In Lehman and Yao's design, which PostgreSQL follows, a reader that reaches a page someone has just split moves right along the link and still finds its id, without locking the path.",
          source: "[lehman1981]; [pg-nbtree-readme]",
        },
      },
      plain: "The search walks on to {leaf}, which has {count:hits|id} in range and none past {hi}.",
      look: ["{link}", "{leafId}"],
    },
    "scan.stop": {
      first: {
        when: (v) => v.hop === 1,
        why: "Each leaf keeps a link to the one after it, so the search moves sideways and never climbs back up.",
        picture: "chain",
        deeper: {
          how: "The search reads each leaf's ids in order and stops at the first id past {hi}, so it never reads a leaf it doesn't need.",
          code: "`if k > hi: return` (line 31)",
          real: "The link matters beyond ranges. In Lehman and Yao's design, which PostgreSQL follows, a reader that reaches a page someone has just split moves right along the link and still finds its id, without locking the path.",
          source: "[lehman1981]; [pg-nbtree-readme]",
        },
      },
      plain: "In {leaf} it finds {count:hits|id} in range, then meets {stop}, which is past {hi}, so it stops.",
      why: "The leaves are in order, so every id after {stop} is past {hi} as well, and there is nothing left worth reading.",
      look: ["{link}", "{leafId}"],
    },
    "scan.done": {
      key: true,
      plain: "The search found {count:found|id} in {count:reads|page read}, {down} down and {along} along the leaves.",
      why: "The trip down is paid once. After that, each extra read is one more leaf of the range.",
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
        { feedback: "Right. A page is a fixed-size block, so {page} splits. It keeps {count:kept|id}, and {moved} move to {right}." },
        { misconception: "m-grow",
          feedback: "Giving the newcomer a page of its own sounds tidy, but pages would sit nearly empty and every search would have more of them to read. Instead {page} splits, and both halves keep room to spare." },
        { misconception: "m-grow",
          feedback: "A page can't stretch, because it is a fixed-size block on disk with room for {M}. So {page} splits, keeping {count:kept|id} and moving {moved} to {right}." },
      ],
    },
    "descend.reads": {
      options: [
        { feedback: "Right. The search reads {path}, which is {levels} pages, one per level, because each signpost page points to only one page below it." },
        { misconception: "m-every",
          feedback: "Checking everything feels safer, but the signposts already rule the other pages out. Each one points to a single page below it, so the search reads {levels} of the {pages} pages. A real tree of billions of rows reads about 4." },
        { feedback: "The search can't jump straight to a leaf, because it doesn't know which leaf yet. It starts at the root, the only page it can find on its own, and reads one page per level, {levels} in all." },
      ],
    },
    "root.where": {
      options: [
        { misconception: "m-bottom",
          feedback: "Trees in pictures often grow downward, but a level added under some leaves would leave the others shallower. Instead {page} splits, and a new root, {parent}, appears above it." },
        { feedback: "Right. Page {page} splits, its middle id {sep} moves up into a new root, {parent}, and every leaf moves down together." },
        { misconception: "m-grow",
          feedback: "Keeping the extra id would mean the page stretching, and it can't. Page {page} is a fixed-size block with room for {M} ids, so it has to split, as the leaves did." },
      ],
    },
    "scan.next": {
      options: [
        { feedback: "Right. Page {from} links to {leaf}, so the next read is the very next leaf, and no page above it is read again." },
        { misconception: "m-back",
          feedback: "That is how you would move on in a binary search tree, which has no links between its leaves. Here {from} keeps a link to {leaf}, so the search walks sideways, and climbing would only re-read a page it has already read." },
        { misconception: "m-back",
          feedback: "Starting over would work, but it would re-read every page on the way down, once for each leaf. The link from {from} to {leaf} skips all of that." },
      ],
    },
  },
};
