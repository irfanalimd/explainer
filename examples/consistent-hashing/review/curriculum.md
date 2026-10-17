# Consistent hashing: curriculum

Level `core`. Planned against the figure as it stands. Step ids already in place: `simple.intro|place`, `more.move`,
`ring.intro|seats`, `keys.hash|walk|arc|rest|loads`, `add.join|move`, `leave.drain|move`, `vnodes.more`,
`result.moved|uneven|leave|vnodes`; asks `more.moved`, `add.which`, `leave.where`. Chapter ids: `simple`, `more`,
`ring`, `keys`, `add`, `leave`, `vnodes`, `result`. This file plans words, not ids.

## Sources

- Canonical: D. Karger, E. Lehman, T. Leighton, R. Panigrahy, M. Levine, D. Lewin, "Consistent Hashing and Random
  Trees", STOC 1997 (smoothness: a change of servers moves about K/N keys; O(log N) copies per server balance the
  load). https://doi.org/10.1145/258533.258660
- G. DeCandia et al., "Dynamo: Amazon's Highly Available Key-value Store", SOSP 2007, §4.2 (ring, tokens, virtual
  nodes; a leaving node's load spreads over many with virtual nodes) and §6.2 (the three partitioning strategies; Q/S
  equal-size tokens won). https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf
- Apache Cassandra, production docs: `num_tokens` default 256 → 16 in 4.0 with the token allocator; about 15 % spread
  between smallest and largest node at 16. https://cassandra.apache.org/doc/latest/getting-started/production.html
  and https://thelastpickle.com/blog/2021/01/29/impacts-of-changing-the-number-of-vnodes.html
- T. White, "Consistent Hashing" (2007), the explainer most courses link; motivates the ring with `hash % N`
  reshuffling. https://tom-e-white.com/2007/11/consistent-hashing.html
- J. Lamping and E. Veach, "A Fast, Minimal Memory, Consistent Hash Algorithm" (jump hash), 2014.
  https://arxiv.org/abs/1406.2294

## Prerequisites

Dictionaries (look a value up by key); the remainder after division; that servers store data and copying data over a
network costs time. Not assumed: hash functions (defined in the first chapter), rings, tokens, replication.

## Exact rules and numbers (from the run)

- Every position is MurmurHash3 x86_32, seed 0, of the name (`"hello"` → `0x248bfa47`). Servers `db01…db06`; with
  virtual nodes, seats `db01`, `db01#1`, … `db01#7`.
- Owner of a key: the first seat at or after its hash (`bisect_left`), wrapping past 2^32 − 1 to the first seat. A
  seat owns (previous seat, itself].
- The remainder way: server `hash(key) % N`. Going N → N + 1, a key stays only when both remainders agree: a fraction
  1/(N + 1) on average, so N/(N + 1) of the keys move (4 → 5: 80 %). On the ring, adding a server moves on average
  K/(N + 1) keys, all from the server(s) whose arc the new seat lands in.
- Busiest share = max / mean of each server's exact share of the ring. With one seat per server the largest arc is
  about (ln N)/N of the ring on average, so shares are uneven by design.
- Knobs: servers 2–6 (default 4), keys 6–24 (16), seats per server 1–8 (1; the "Many seats per server" story sets 8,
  doubling 1 → 2 → 4 → 8).
- Default runs (README): add: remainder way moves 14 of 16, the ring 3 of 16 (one in 5 would be 3.2), db03 still owns
  49 %. Remove: all of the leaver's keys go to one neighbour, which ends at 70 % of the ring; `hash % 3` would move 10.
  Virtual nodes: busiest share 2.0× → 1.6× → 1.4× → 1.3×; the leaver's 4 keys spread over 3 servers; 256 seats
  computed for the scale line.

## Objectives and their quiz stems

| Objective | Quiz stem |
|---|---|
| o-mod | "4 servers become 5, and every key goes to `hash % N`. About how many of 100 keys change server?" (about 80) |
| o-owner | "Servers sit at 10°, 130° and 250°. A key hashes to 300°. Which server stores it?" (the one at 10°: wrap) |
| o-add | "A new server sits at 70°, between the servers at 10° and 130°. Which keys move, and from which server?" |
| o-leave | "The server at 130° leaves. Where do its keys go? And if every server had 8 seats?" |
| o-even | "With one seat each, one server owns 49 % of the ring. What happens to that share as seats per server grow?" |

## Chapters (by their current names)

The parts chapter, whose entry card shows the picture map: **The ring** (it is the first chapter of "A server leaves"
and "Many seats per server", and in "Add a server" it follows the two remainder chapters; it introduces ring and arc,
plus hash in the stories that skip "The simple way"). The remainder chapters keep their own small picture, "counting
off into teams", in their about; it is not a row of the map.

| Chapter | So far | Now | You'll know it worked when |
|---|---|---|---|
| The simple way | You can look a value up by its key in a dictionary. | Share {K} keys over {N} servers: the remainder of each key's hash picks its server. | Every key sits in the box its remainder names. |
| One more server | Each key sits on server `hash % {N}`. | Add one server, so every key divides by one more. | The moved-keys count shows how many keys changed box. |
| The ring (parts, `picture: true`) | The remainder way moved most keys when one server joined. (`@remove`, `@vnodes`: "You can share keys over servers by a rule everyone agrees on.") | Bend every hash number into a circle and seat each server at its name's hash. | Each server has one seat, and the seats split the circle into uneven arcs. |
| Keys | Each server has a seat on the ring. | Hash each key onto the ring too, and walk clockwise to its server. | Every key takes the colour of the first server after it. |
| Add a server | Each key sits with the next server clockwise. | Seat one more server, inside one arc. | Only the keys just before the new seat change colour. |
| A server leaves | Each key sits with the next server clockwise. (`@vnodes`: "Each server now has many seats, and the shares are closer to even.") | Take one server, the busiest, off the ring. | Its keys turn the colour of the next server clockwise, and nothing else changes. |
| Many seats each | One seat per server leaves the arcs uneven. | Give every server more seats, doubling up to {V}. | The busiest-share meter falls toward 1×. |
| Result | (varies by story: the moved counts.) | Compare the keys moved, and the busiest server's share. | Both counts sit side by side: the ring's against the remainder way's. |

## Key steps

- `more.move`: the naive way's cost (14 of 16), the problem the ring answers.
- `ring.seats`: the parts at rest, and the first sign of unevenness.
- `keys.walk`: the one lookup rule, shown in full.
- `add.move`: the aha (only the arc's keys move).
- `result.moved`: ring against remainder, with the fair-share number.
- `leave.move`: all keys to one neighbour (the hot spot), or spread with virtual nodes.
- `vnodes.more` first (`first: { key }`): more seats, a smaller busiest share.
- `result.vnodes`: the 256-seat scale line.

Repeats with no `why`: `keys.arc`, later `vnodes.more`.

## Asks and the misconceptions they confront

| Ask | Option → misconception |
|---|---|
| `more.moved` | 0 "about K/(N+1), its fair share" → m-fair · 1 "about half" → no misconception (a hedge; feedback gives the real count) · 2 right |
| `add.which` | 0 right · 1 "most of them, like the remainder way" → m-reshuffle · 2 "all of the neighbour's keys" (or "about half") → no misconception |
| `leave.where` | 0 right · 1 "spread evenly over the other servers" → m-even (in `@vnodes` this option reads "all to one neighbour": no misconception) · 2 "every key is reshuffled" → m-reshuffle |

## Expert nuances for `deeper`

- `more.move` cost: the fraction that stays is 1/(N + 1), so N/(N + 1) move: 80 % at 4 → 5, and it gets worse as N
  grows. edge: the run's 14 of 16 (88 %) is the expected 80 % plus small-sample noise.
- `keys.walk` code: `bisect_left` on the sorted seats, then `% len(ring)` to wrap; how: a lookup is a binary search,
  O(log of seats), and every client computes the same answer without asking anyone.
- `add.move` how: Karger's smoothness: about K/N keys move, all from the arc the new seat splits; real: Dynamo moves a
  joining node's ranges from its neighbours (§4.9). Source: Karger 1997.
- `ring.seats` edge: with one seat each the expected largest arc is about (ln N)/N of the ring, not 1/N; Karger's fix
  is O(log N) seats per server.
- `result.vnodes` real (the ten-year nuance): random seats balance slowly; Dynamo abandoned random tokens for Q equal
  partitions handed out Q/S per node (§6.2), and Cassandra cut its default from 256 random tokens to 16 placed by an
  allocator (4.0), because more tokens also mean more neighbours to stream from and more repair work.
- `result.moved` real: jump consistent hash (Lamping & Veach 2014) moves exactly the optimal 1/(N + 1) with no ring in
  memory, but servers can only be added or removed at the end; rendezvous hashing is the other classic answer.
- `leave.move` edge: in Dynamo the key is also copied to the next N − 1 distinct servers clockwise (the preference
  list), so a leaving server's data already has copies there; the run stores one copy only.
- hash edge: the run uses MurmurHash3 x86_32; Cassandra's Murmur3Partitioner uses a 64-bit token from MurmurHash3
  x64_128, and Dynamo used MD5.

## Why this ladder

"Add a server" shows the remainder way failing first, for real, so the ring arrives as an answer. The ring's parts
(seats, arcs) come before any key, the single lookup before the arc-by-arc fill, and the join before the comparison.
Leaving and virtual nodes are their own stories because each answers a separate "what if": the hot spot a leave
creates is the reason for many seats.

## Unsure

- m-even rests on Dynamo §4.2 and the Cassandra docs, which present spreading a leaver's load as the reason for virtual
  nodes; no concept-inventory study of consistent hashing was found.
- `more.moved` fixes "Nearly all" as the answer at every knob. At 2 servers (2 → 3) the expected share moved is 2/3,
  and with 6 keys the real count can be 3 or 4, where "About half of them" is the closer answer.
