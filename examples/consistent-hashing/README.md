# Consistent hashing

Servers and keys hashed onto one 32-bit ring with MurmurHash3. Each key is stored on the first server seat (token)
clockwise from its hash. Written for a beginner who knows dictionaries and the remainder operator but has never met
a hash ring (`meta.level: "core"`).

**The lesson** (the plan sits at the top of `figure.mjs`):

- **Hook:** several servers share the keys. Add one more server: how many keys have to move?
- **Problem first:** "Add a server" opens with the simple way, for real: the same 16 keys sit on server
  `hash(key) % 4` (a board beside the ring), db05 joins, and `hash % 5` moves 14 of 16. The reader predicts first
  (the misconception: "one more server moves only its fair share, whatever the scheme").
- **Picture:** seats around a round table. Each server sits at the seat its name hashes to; each key sits with the
  next server clockwise; a newcomer pulls up a chair inside one stretch (an arc) and takes only the guests just
  before it. The remainder way is "counting off into teams".
- **Chapters ("Add a server"):** The simple way · One more server · The ring · Keys · Add a server · Result. The
  other stories start at the ring.
- **Aha:** db05 joins inside db04's arc; the reader predicts how many keys move (only the ones between db05 and the
  server before it: 3), against 14 the remainder way.
- **Words:** hash, ring, arc, virtual node (only in its story).

Every predict question sits on its chapter's first step except the ring add, which follows the join step it asks
about, because the HUD withholds a chapter's about until its predictions are revealed.

The reader should come away knowing three things:

- Adding or removing a server on the ring moves only the keys in the arcs that change hands, about K/N of them.
- `hash(key) % N` moves almost all the keys when N changes.
- Many seats per server (virtual nodes) even out each server's share of the ring, and scatter a leaving server's
  keys across many servers instead of piling them onto one.

- **Source:** Karger et al., "Consistent Hashing and Random Trees", STOC 1997 (doi:10.1145/258533.258660), and
  DeCandia et al., "Dynamo: Amazon's Highly Available Key-value Store", SOSP 2007 (doi:10.1145/1294261.1294281),
  for tokens and virtual nodes.
- **What is real:**
  - Every position is `murmur3_32(name)`. The function is checked against the published answers: `"hello"` → `0x248bfa47`.
  - Server seats are `murmur3("db01")`, then `murmur3("db01#1")` … for virtual nodes.
  - Keys are real-looking names (`user:1042`, `cart:88`, `cat.jpg`), drawn from a pool by the seed.
  - Ownership is `bisect_left` on the sorted seats, wrapping past 2³² − 1.
  - "Busiest server's share" is the max/mean of each server's exact share of the ring, computed from the live seats.
  - The remainder-way board and its counts are computed for real on the same keys.
- **Layout honesty:** every tile sits at its hash angle on the ring. Where tiles would touch, an isotonic regression
  nudges them apart. It keeps the clockwise order exact and never moves a tile more than 9° (the worst case is 8°).
  The tags and the inspector show the exact hash.

## Stories

| Story | What happens | What it teaches |
|---|---|---|
| Add a server | The same 16 keys first sit on a `hash(key) % 4` board; db05 joins and 14 of 16 move. Then the ring: four servers take their seats, one key's clockwise walk is shown, each server's arc fills with its keys. db05 joins inside db04's arc and takes over its slice. | 3 of 16 keys move on the ring (one in 5 would be 3.2), all from one neighbour, against 14 the remainder way. The hot spot (db03, 49% of the ring) is untouched: one seat per server shares the ring unevenly. |
| A server leaves | The server with the most keys drains and leaves. | All of its keys go to the next server clockwise, which now owns 70% of the ring. Its arc moved, nothing else did; the remainder way would move 10. |
| Many seats per server | Seats per server double: 1 → 2 → 4 → 8. Then a server leaves. | The busiest share goes 2.0× → 1.6× → 1.4× → 1.3× the average. The leaver's keys spread over 3 servers. A scale-up line gives 256 seats (computed, not drawn). |

The old "mod N vs ring" story is folded into "Add a server", where the problem now comes first.

Knobs: servers (2–6), keys (6–24), seats per server (1–8), seed (which keys).
Numbers: keys moved on the ring, keys moved the remainder way (in the dock); busiest server's share (in the dock for
"Many seats per server"); servers.

## Invariants (verify checks every step of every run)

- Every key is stored on exactly one live server, and each server's badge matches the ring.
- A key's server is the first active token clockwise from its hash.
- On an add, keys moved on the ring = keys now in the new server's arcs, and every moved key went to the new server.
- On a removal, only the departed server's keys move.
- The remainder way: every key on that board sits on server `hash(key) % N`.
- The load meter equals the max/mean share computed from the live tokens.

## Commands

```sh
node ../../scripts/lesson.mjs figure.mjs --all           # the lesson as text, then the teaching checks
node ../../scripts/verify.mjs figure.mjs                 # 20 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # consistent-hashing.html
node ../../scripts/shoot.mjs consistent-hashing.html --scenario all
node ../../scripts/audit.mjs consistent-hashing.html --scenario all
```
