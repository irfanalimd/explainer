# Consistent hashing

Servers and keys hashed onto one 32-bit ring with MurmurHash3. Each key is stored on the first server token
clockwise from its hash. The reader should come away knowing three things:

- Adding or removing a server moves only the keys in the arcs that change hands, about K/N of them.
- `hash(key) % N` moves almost all the keys when N changes.
- Virtual nodes (several tokens per server) even out each server's share of the ring. They also scatter a departing
  server's keys across many servers instead of piling them onto one.

- **Source:** Karger et al., "Consistent Hashing and Random Trees", STOC 1997 (doi:10.1145/258533.258660), and
  DeCandia et al., "Dynamo: Amazon's Highly Available Key-value Store", SOSP 2007 (doi:10.1145/1294261.1294281),
  for tokens and virtual nodes.
- **What is real:**
  - Every position is `murmur3_32(name)`. The function is checked against the published answers: `"hello"` → `0x248bfa47`.
  - Server tokens are `murmur3("db01")`, then `murmur3("db01#1")` … for virtual nodes.
  - Keys are real-looking names (`user:1042`, `cart:88`, `cat.jpg`), drawn from a pool by the seed.
  - Ownership is `bisect_left` on the sorted tokens, wrapping past 2³² − 1.
  - "Load" is each server's exact share of the ring: the fraction of all keys it expects to receive. The max/mean
    meter is computed from the live tokens.
  - The mod-N what-if counts are computed for real on the same keys.
- **Layout honesty:** every tile sits at its hash angle on the ring. Where tiles would touch, an isotonic regression
  nudges them apart. It keeps the clockwise order exact and never moves a tile more than 9° (the worst case is 8°).
  The tags and the inspector show the exact hash.

## Scenarios

| tab | story | what it teaches |
|---|---|---|
| Add a server | Four servers. A key is hashed and its clockwise walk to its server is shown. Each server's arc fills with its keys. `db05` joins, waits dimmed, then takes over its arc. | 3 of 16 keys move (K/N = 3.2), all from one neighbour. The hot spot (`db03`, 49% of the ring) is untouched: one token per server balances badly. |
| Remove a server | The server with the most keys drains and leaves. | All of its keys go to its clockwise successor, which now owns 70% of the ring (2.1× the mean). Its arc moved, nothing else did. |
| mod N vs ring | The same keys also sit on a `hash(key) % N` board. A server joins both. | The ring moves 3 keys. mod N moves 14 of 16 (88%), a cold start for a cache. |
| Virtual nodes | Tokens per server double: 1 → 2 → 4 → 8. Then a server leaves. | Max/mean share goes 2.0× → 1.6× → 1.4× → 1.3×. The leaver's keys spread over 3 servers. A scale-up line gives 256 tokens (computed, not drawn). |

Knobs: servers (2–6), keys (6–24), tokens per server (1–8), seed (which keys).

## Invariants (verify checks every step of every run)

- Every key is stored on exactly one live server, and each server's badge matches the ring.
- A key's server is the first active token clockwise from its hash.
- On an add, keys moved = keys now in the new server's arcs, and every moved key went to the new server.
- On a removal, only the departed server's keys move.
- mod N: every key sits on server `hash(key) % N`.
- The load meter equals the max/mean share computed from the live tokens.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 27 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # consistent-hashing.html
node ../../scripts/shoot.mjs consistent-hashing.html --scenario all
node ../../scripts/audit.mjs consistent-hashing.html
```
