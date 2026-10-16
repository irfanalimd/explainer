# Simulation runtimes (`sim/`)

Every figure Explainer makes is a real, deterministic simulation whose trace the engine renders: *run it, don't draw it*.
The modules in `sim/` make writing such simulations short and correct. They are DOM-free, dependency-free, run in Node
and the browser, and touch the world **only** through the Scene builder `s` (CONTRACTS.md 4.2). Randomness comes
only from `sim/rng.mjs`.

| Module | What it gives you |
|---|---|
| `rng.mjs` | `rng(seed)`: seeded xoshiro128** with independent `fork(label)` streams |
| `fmt.mjs` | number formatting (`bytes`, `ms`, `hex`, `pct`, `num`, `plural`…) and caption markup (`key`, `ref`, `tone`, `code`) |
| `tracked.mjs` | `tracked.array / stack / queue / hashtable`: data structures that narrate and count every operation |
| `actors.mjs` | `network(s, opts)`: a discrete-event simulation of message-passing nodes with faults, lanes and pacing |
| `lockstep.mjs` | `race(s, variants)`: generator variants advanced in lockstep, one shared step per round |
| `machine.mjs` | bit fields, a set-associative cache, a TLB, the x86-64 page walk, and views that render them |
| `inspect.mjs` | `stateOf(snap, id)`, `counterOf(snap, name)`: read step snapshots from figure invariants |
| `stub.mjs` | `stubScene()`: a recording, validating stand-in for the builder; `runFigure()` for tests |
| `fixtures/` | `quicksort.mjs`, `raft.mjs`: complete figure modules built on these runtimes |

Rules that keep a figure deterministic and honest:
- All randomness goes through `s.rng` (seeded from `params.seed`), or a fork of it; never `Math.random`, `Date.now`
  or `new Date()` (a test greps for them).
- Captions describe only what the run did. The runtimes generate their narration from the actual values and events.
- Publish the model's state in the entities' inspector `state` (copies, never live objects) so invariants can check it
  on every snapshot and readers can hover it.

---

## rng

```js
import { rng } from "./sim/rng.mjs";
const r = rng(7);            // 7 and "7" are the same seed
r.next();                    // float in [0, 1)
r.int(1, 6);                 // integer in [1, 6], both inclusive (non-integer bounds: the integers between them)
r.float(2, 5); r.chance(0.3); r.bool(); r.u32();
r.pick(xs); r.shuffle(xs) /* a copy */; r.sample(xs, k); r.weighted(items, weights);
r.exp(mean); r.normal(mu, sd);
const net = r.fork("network");   // independent stream: rng("7/network")
r.clone();                       // continues from the same position
```

`fork(label)` is a pure function of the seed path and the label, not of how many numbers the parent has drawn. Adding a
draw in one stream never shifts another, which keeps traces stable when a figure changes. The surface is a superset of
the scene's local RNG, and it is what backs `s.rng` everywhere a figure runs: the page (`engine/runtime.mjs`),
verify and the test stub all pass it to `compile(figure, { rng })`, so they produce the same trace.

**Inside figures, use `s.rng`** (and `s.rng.fork("label")` for an independent stream). The sim runtimes take one too:
by default they fork `s.rng` (`network` uses `s.rng.fork("network:<id>")`). Pass a runtime an explicit `seed` only when
its stream must not depend on the figure's (for example to keep a network's faults identical while the figure draws
differently); `rng(p.seed).fork("…")` is equivalent and fine in existing figures.

## fmt

```js
import * as fmt from "./sim/fmt.mjs";
fmt.bytes(1400)              // "1.4 KB"   (bytes(4096, { binary: true }) → "4 KiB")
fmt.ms(4.1)                  // "4.1 ms"   (0.42 → "420 µs", 1500 → "1.5 s")
fmt.hex(0x7f3a, 4)           // "0x7f3a";  hex(0x7f3a2c10) → "0x7f3a_2c10" (groups of 4 from 8 digits; BigInt ok)
fmt.pct(0.42)                // "42%"      ratio(2.34) → "2.3×"
fmt.num(1234567)             // "1 234 567" (narrow no-break spaces); plural(3, "entry") → "3 entries"
fmt.and(["a", "b", "c"])     // "a, b and c"
fmt.key("fox"), fmt.key("fox", "the word fox")   // "{key:fox}", "{key:fox|the word fox}"
fmt.ref("m2"), fmt.ref("m2", "mapper 2")          // entity chips (hover lights the entity)
fmt.tone("fail", "crashed"), fmt.code("hash(k) % R"), fmt.bold("…"), fmt.escape(userText)
fmt.ascii(s), fmt.plain(markup)                   // for tests and logs
```

A no-break space joins a number to its unit and a narrow no-break space groups thousands, so captions never wrap
inside a quantity. Negative numbers use a true minus. Mark names refuse `{ } | \` ` and mark text refuses `{ } \`,
because those characters cannot be expressed in a mark for every caption parser.

---

## tracked: data structures that narrate themselves

### tracked.array

```js
import { tracked } from "./sim/tracked.mjs";
const a = tracked.array(s, "a", [5, 2, 9, 1, 7], { label: "a" });   // auto: "op" by default
a.step("Five numbers to sort.");
if (a.cmp(2, 3) > 0) a.swap(2, 3);   // ONE step: "Compare a[2] = 9 with a[3] = 1 — 9 > 1, so swap."
a.flush();                            // commit the step that is still open
```

Calls: `get(i)`, `set(i, v)`, `cmp(i, j | { value, label })` → −1/0/1, `less(i, j)`, `swap(i, j)`, `length`,
`values()`, `tile(i)`, `ref(i)` (caption chip for slot i), `show(v)`, `stats`.

**Stepping.** With `auto: "op"` every operation is a step, but a comparison stays open until the next operation, so
that its consequence (a swap or a write, plus pointer moves) joins it: one causal chain per step, in beats (the
compare lights both tiles, then the swap moves them). Joining operations never stand alone: pointer moves, marks,
`a.say(markup)` and option `line` ranges. Close a step explicitly with `a.flush()`, `a.step(caption?)` (the caption
replaces the generated one), or `a.phase(name)` (flush, then start a chapter). **Rule:** in `"op"` mode, use these
instead of a bare `s.step()` / `s.phase()`, and `a.flush()` once at the end. With `auto: "none"` nothing is
committed, and `a.caption()` returns the narration so far for your own `s.step()`. Use that mode inside `race()`.

Per-operation options: `{ say }` (replace the narration), `{ why }` (append to it: `"to put the pivot in its final
place"`), `{ line: n | [from, to] }` (code lines; the step lights the union), `{ as: "pivot" }` on `cmp`.

**Pointers** are rods named by a label: `const i = a.pointer("i", 0, { tone: "busy" })`, then `i.to(j)`, `i.by(1)` and
`i.hide()`. A pointer stays on its *slot* when tiles swap. Moving off either end hides it, and moving back shows it
again. A move after a comparison is narrated as a consequence ("…, so i → 4"). `{ loop: true }` marks a loop variable,
whose move starts the next step instead of joining the current one. `{ say: false }` keeps a pointer silent.

**Regions** are slot-based and survive swaps: `a.mark(from, to, tone)` (inclusive; tones `ok busy warn fail idle
ghost`, or `null` to clear), `a.dim(from, to, on)`, and `a.only(from, to)` (dim everything outside, the active
partition). `a.state({ … })` merges fields into the array's inspector state (`{ values, … }`), which is what
invariants read.

**Counters**: `comparisons`, `swaps`, `reads` and `writes` are counted as the real operations would (`cmp` reads 2,
`swap` reads 2 and writes 2). `counters: { reads: false }` disables one, `{ swaps: "exchanges" }` renames one, and
`counters: false` disables all. Declare the ones you keep in the figure's `counters` export.

### tracked.stack / tracked.queue

```js
const st = tracked.stack(s, "calls", { label: "call stack", axis: "y" });  // axis z (pile) by default
st.push("qs(0, 8)", { from: "cpu" });   // "Push qs(0, 8) onto call stack (1 item)."
st.pop({ to: "done" });                  // travels into "done" instead of sinking
const q = tracked.queue(s, "ready", { label: "run queue" });
q.enqueue("p1"); q.dequeue();            // "Dequeue p1 from the head of run queue (0 items left)."
```

Each operation is its own step in `"op"` mode. `peek()` / `front()` light the item, and `values()` runs bottom → top
(head → tail). Counters are off unless named: `counters: { pushes: "pushes", pops: "pops" }`.

### tracked.hashtable

```js
const ht = tracked.hashtable(s, "ht", { buckets: 8, probing: "linear", label: "table" });
ht.put("fox", 1);   // "Put fox: `hash("fox") % 8 = 6`; slot 6 is empty, so store fox there."
ht.get("dog"); ht.has("owl"); ht.delete("fox");   // linear probing leaves a tombstone
```

`probing: "chain"` draws one bucket container per index, inside a titled column. `"linear"` draws one container of
`m` slots and makes one step per probe, with a tag showing the probe formula `(h + i) % m = b`. `hash`: `"auto"`
(integers map to themselves, strings use FNV-1a), `"identity"`, `"fnv1a"`, `"djb2"`, `"sum"`, or a function. Tags
read `hash("fox") % 8 = 6`. Counters are `probes` and `collisions`. Entries are keyed by their key, so a key keeps its
identity colour everywhere. Queries that don't narrate: `bucket(k)`, `entries()`, `layout()`, `size`, `load`.

---

## network: discrete-event simulation

```js
import { network } from "./sim/actors.mjs";
s.ring("cluster", { title: "cluster" });
const net = network(s, {
  nodes: ["n1", "n2", "n3"], in: "cluster",            // housings are created unless they exist
  latency: { mean: 12, jitter: 5 }, seed: p.seed,
  lanes: { in: "world", length: 900 },                  // optional space-time board
  state: (id) => ({ term: 0 }),                         // per-node state (published to the inspector)
  batch: 10, quiet: ["partition"],                      // optional pacing aids (below)
});
net.onStart("*", (ctx) => ctx.timer("ping", ctx.rng.int(20, 40), { tone: "busy" }));
net.onTimer("*", "ping", (ctx) => { ctx.broadcast("Ping", { n: 1 }); ctx.say(`${fmt.ref(ctx.id)} pings everyone.`); });
net.on("*", "Ping", (msg, ctx) => {
  ctx.reply(msg, "Pong", {});
  ctx.chorus(`pong|${msg.from}`, (who, n) => `${who} ${n > 1 ? "answer" : "answers"} ${fmt.ref(msg.from)}`);
});
net.crash("n3", 120); net.recover("n3", 400);
net.partition([["n1"], ["n2", "n3"]], 200, 300);        // groups, at, until; unlisted nodes reach everyone
net.at(250, (n) => { n.send("n1", "n2", "Hello", {}); n.say("An external event."); });
net.run({ until: 1000, intro: "Three nodes.", stopWhen: (n) => n.state("n1").done });
```

**Events.** Deliveries, losses, timers, crashes, recoveries, partitions, heals and external `at()` callbacks sit in a
priority queue ordered by (time, scheduling order). Each event is one builder step with `t` = sim time in ms. A
caption comes from what the handlers said, or is generated ("n2 receives Ping from n1.").

**Messages.** At send time the runtime calls `s.send(id, from, to, { text, key, via, lane, deliver: "hold" })`, and
on arrival `s.deliver(id)`. A message dies visibly, as a fail-toned tag then `s.deliver(id, { remove: true })`, in three ways:
- it is dropped at random (at its midpoint);
- it is cut by a partition at send time (at its midpoint);
- its link is cut, or its receiver is down, by the time it arrives (on arrival).

`opts.drop` / `net.drop(rate, at)` set the loss rate. Latency and loss draw from separate forks, so changing the loss
rate never changes the surviving messages' latencies. `fifo: true` keeps per-link order. `text` / `key` (msg) => …
label packets and give them identity colours.

**Handlers** get `(msg, ctx)` (`msg = { id, type, from, to, body, sent, at, latency }`) and `ctx`:
- **messaging:** `send(to, type, body, o)`, `broadcast(type, body)` (to `peers`: other nodes, clients excluded), `reply(msg, type, body)`;
- **timers:** `timer(name, ms, { tone, label, mark })` (re-arming replaces), `cancel(name)`, `hasTimer`, `timerAt`;
- **state and look:** `state` (mutable), `set({ led, sub, title, … })`;
- **narration and marks:** `say(markup)`, `chorus(key, fn, subject)`, `tag(text, tone)`, `mark(text, tone)` (on the lane), `lit()`;
- **counters and chapters:** `count`, `gauge`, `phase`;
- **context:** `rng` (a per-node fork), `now`, `isUp(id)`, `stop()`, `net`, and `s` (the builder, as an escape hatch).

**Faults.** A crashed node's timers are cancelled and its handlers stop. Its housing shows LED `fail` and dims, and its
lane gets a "crash" mark. Its `state` survives (that's its disk). `onCrash` / `onRecover` hooks run at those moments,
and recovery restores the node's LED and undims it. Partitions show as warn-toned "side A/B" tags and lane marks; only
one partition is active at a time.

**Narration of bursts.** With `batch: ms`, consecutive events that share a step are:
- deliveries or losses of one type, fanning out from one sender or into one receiver;
- timers with the same name.

`ctx.chorus(key, (who, n) => …)` merges the same key across a batch into one sentence ("s3, s4 and s5 take the
heartbeat"). Generated captions merge the same way in both directions ("l receives Ack from f1, f2 and f3"). With
`quiet: ["partition", "drop", "down"]`, those losses make no step of their own: their ops ride along with the next step,
and the sender's caption can name them.

**Pacing.** A step plays for the sim time until the next step, linearly (packets fly at constant speed) and clamped:

    dur = MOTION.step · clamp(gap / ref, PACE.min = 0.4, PACE.max = 2.2),   ref = latency mean (opts.pace.ref)

so one mean latency of flight plays in `MOTION.step`, a burst never goes below 0.36 s per step and an idle stretch
never above 1.98 s. `run()` hands this to the builder as `s.pace({ ms: ref / MOTION.step, min, max })` and gives
every step its `t`. On a builder without `s.pace`, it passes the same durations per step. `compress: γ` (< 1)
compresses long gaps harder through explicit durations, `compress: fn` sets them yourself, and `compress: false`
leaves every step at the builder's default.

**Presentation options** (all opt-in) make a dense protocol readable:
- `focus: ["world"]` frames these ids on every step. The Raft flagship uses it so the cluster is never cropped.
- `pace: { ref, at, min, max, minor }` means `ref` ms of flight play in `at` seconds, clamped to [min, max].
  - A step whose caption repeats a recent one, or that says only `{ minor: true }` things, plays for `minor` seconds.
  - Sentences marked `ctx.say(markup, { minor: true })` or `ctx.chorus(key, fn, subject, { minor: true })` are dropped
    whenever the same step has news.
- `zones` (default on) draws the smaller side of a partition as a dashed, fail-toned `s.zone`, on builders that have one.
- `describe` puts the runtime's own sentences in the figure's words (below).
- Lost packets are delivered with `{ remove: true, lost: true }`, so they die in flight where the engine supports that.
- A loss gets at most one chip per step, and quiet losses get none.
- "…is lost: n3 is down" is said once per outage, then only when nothing else happens.
- `net.stepStart` and `net.stepSerial` let a chorus tell "in this very step" from "earlier".

**The runtime's own words** (`describe`). A few captions and labels come from the runtime, not a handler: the
split and heal captions, the "cut off" zone title, and the generated captions of lost messages, which name the raw
message type. Each can be replaced; a function that returns `null` or `undefined` keeps the default, and without
`describe` nothing changes.

```js
network(s, { …, describe: {
  split: (groups) => "The network breaks in two",                        // default "The network splits: … on one side, … on the other"
  heal: "The network is {tone:ok|whole again}: every server can reach every other",   // a string or (groups) => markup
  zone: "on their own",                                                    // the zone title: a string, (groups) => string, or false
  message: "text",                                                         // name messages by their packet labels (below)
  lost: (g) => (g.reason === "drop" ? `${g.name} from ${fmt.ref(g.from[0])} is {tone:fail|lost}` : null),
} });
net.partition([["n1"], ["n2", "n3"]], { at: 200, until: 300, caption: "The cable to n1 is cut", title: "alone", heal: "The cable is fixed" });
net.heal({ at: 400, caption: "Everyone can talk again" });                 // or heal(at, { caption })
```

- `lost(g)` gets `{ reason: "drop" | "partition" | "down", type, name, from: [ids], to: [ids] }` for one caption
  (a batch can merge several losses), where `name` is what `message` calls the message.
- `message` names messages in every generated caption (receives, sends, losses): `(type, items) => markup`, or
  `"text"` to use the packets' own labels (the send's `{ text }` or `opts.text`) when every message in the caption
  shares one; otherwise the type.
- Per call, `partition(groups, at, until, { caption, title, heal })` (or `partition(groups, { at, until, … })`) and
  `heal(at, { caption })` override `describe` for that split and heal; `title: false` draws the zone without a title.

**Running.** `run({ until, maxSteps, stopWhen, intro, compress, batch, drain })`. Start hooks run first and belong to
the opening step (`intro`). When the run stops, `drain` (default on) keeps delivering the messages still in flight,
though timers no longer fire, so no packet is left hanging. A drained network cannot run again. Node state is
published to each housing's inspector `state` whenever it changes (`inspect: (state, id) => view` to shape it,
`false` to skip). Queries: `net.state(id)`, `isUp`, `blocked(a, b)`, `inFlight()`, `timers(id)`, `stats`, `now`.

---

## race: algorithms side by side

```js
import { race } from "./sim/lockstep.mjs";
race(s, {
  bubble: function* (v) {
    const a = tracked.array(v, v.id("a"), input, { in: "left", auto: "none" });
    for (let n = a.length; n > 1; n--) for (let i = 0; i + 1 < n; i++) { if (a.cmp(i, i + 1) > 0) a.swap(i, i + 1); yield a.caption(); }
  },
  insertion: function* (v) { /* … */ },
}, { labels: { bubble: "Bubble sort", insertion: "Insertion sort" } });
```

Each round advances every unfinished variant to its next `yield`, and the round becomes one shared step whose caption
is `**Bubble sort**: … · **Insertion sort**: …`. A variant's builder `v` passes through to `s`, except for these:
- `v.count` and `v.gauge` are prefixed (`bubble.comparisons`: declare these in `counters`);
- `v.say` joins the variant's part of the caption;
- `v.step` throws (yield instead);
- `v.id(x)` returns `"bubble.x"`;
- `v.rng` is the variant's own fork.

The call returns `{ rounds, results, finishedAt }`.

---

## machine: architecture models

```js
import * as machine from "./sim/machine.mjs";
const f = machine.bitfield([{ name: "tag", bits: 20 }, { name: "index", bits: 6 }, { name: "offset", bits: 6 }]);
f.split(0x7f3a2c10);           // { tag: 0x7f3a2, index: 48, offset: 16 }; join, get, set, mask, shift, format, builder()
const c = machine.cache({ sets: 4, ways: 2, line: 64, addressBits: 16, policy: "lru" });   // "fifo", "random"
c.access(0x0040, { write: true }); // { hit, set, way, tag, offset, evicted: { tag, addr, dirty } | null }
const table = machine.pageTable({ cr3: 0x1000 });
table.map(0x7f3a_2c10_8000, 0x12_3000);
const mmu = machine.mmu({ table, tlb: machine.tlb({ entries: 4 }) });
mmu.translate(0x7f3a_2c10_8123);   // { hit, pa: 0x12_3123, walk: { steps: [{ level, table, index, entryAddr, entry }] }, fault }
```

Values may be Numbers (up to 2^53) or BigInts (kernel-half addresses); results come back as Numbers when they fit.
`canonical(va)` checks the sign extension of bits 63..48. Writes are write-back and write-allocate; `order(set)`
gives LRU order; `stats` holds hits, misses, evictions and write-backs.

Views render a model and narrate it, one step per action in `auto: "op"` (or `auto: "none"` + `view.caption()`):
- `bitsView(s, id, field, value)` draws an `s.bits` row whose field brackets carry the field names as identity keys;
  `.set(v)` touches only the bits that change.
- `cacheView(s, id, cache, { title })` draws an address row and a chip housing with one record per (set, way). Each
  `access(addr)` lights the set, then shows the hit, or the fill and eviction, with a tag ("Load `0x0040`: set 1, tag
  `0x00` — miss; fill way 0."). It counts `hits` and `misses`.
- `walkView(s, id, mmu)` draws the VA row, then the TLB, CR3, PML4, PDPT, PD, PT and the physical page, joined by
  traces. Each level wears its VA field's colour. `translate(va)` is narrated as the split, the TLB lookup, one step
  per level (a packet travels down the chain), then the physical address or the page fault.

---

## Testing figures: the stub

```js
import { stubScene, runFigure } from "./sim/stub.mjs";
const r = runFigure(figure, { scenario: "crash", params: { seed: 9 } });   // resolves params like the runtime
r.problems;   // [] — unknown ids, use before declaration, bad tones/LEDs/fields, steps without captions,
              //      held messages never delivered, trailing ops, overflowing trays, sim time running backwards
r.failures;   // [] — the figure's invariants, run on every step snapshot
r.rec.steps, r.rec.captions(), r.rec.find("swap"), r.rec.snapshot(i), r.rec.final, r.rec.texts("a"), r.rec.hash()
```

`stubScene(params, { counters, strict, rng })` implements the whole builder surface, including `s.pace`, and records
every call with a snapshot of its arguments. It keeps a world model (membership, slots, inspector state, counters), so
`s.get`/`s.has` and snapshots work. It follows the engine's conventions: array cells are its own ids, but bit
`cells` are listed MSB first with `cell(i)` = bit i; ids are reusable once gone; `line` persists; `hold()` repeats the
last caption. Write invariants with `stateOf(snap, id)` so they read the stub's snapshots and the engine's alike. Test
on the real engine too: `compile(figure, { scenario })` + `checkInvariants(figure, tl)` (see `sim/engine.test.mjs`).

Run the suite with `node --test "sim/**/*.test.mjs"`, or on Node 20 `node --test sim/*.test.mjs sim/fixtures/*.test.mjs`.

---

## The fixtures

**`fixtures/quicksort.mjs`** runs Lomuto partitioning (the CLRS form: pivot `a[hi]`, store index `i`, loop pointer
`j`). Each comparison is a step, and its swap and pointer advance join it. The active partition is the only undimmed
region, the pivot is warn-toned, and each pivot turns `ok` in its final slot. One chapter per partition call.
- **Params:** `n`, `order`, `input` (overrides), `seed`.
- **Scenarios:** random, already sorted (the worst case: n(n−1)/2 comparisons), and many duplicates (keyed by value).
- **Invariants:** a permutation of the input at every step; placed pivots are final; sorted at the end.
- **Code:** the Python source, with active lines.

**`examples/raft/figure.mjs`**, the flagship; `fixtures/raft.mjs` re-exports it. It follows Figure 2 of Ongaro &
Ousterhout rule by rule:
- randomized election timeouts (with at least 30 ms of spread);
- RequestVote with the up-to-date check;
- AppendEntries with the consistency check and conflict truncation;
- `commitIndex = min(leaderCommit, last new entry)`;
- commit only of current-term entries by majority, plus a no-op on election (§8, knob `noop`);
- a closed-loop client that retries and is deduplicated.

The world:
- the servers sit in a ring;
- each tray is that server's log, one tile per entry, keyed by term, and dim until the server knows it is committed;
- the LED shows the role and the sub shows the term;
- the lanes board shows every message, with marks for election timeouts, new leaders (green) and commits (unlabelled
  green pucks).

The lanes board is off by default: the `lanes` knob ("Message timeline" in settings: Hide, Show, or Show below the
servers) turns it on (`"on"`, beside the cluster on a wide screen, or `"below"`, stacked under it; build still reads
an old link's `"auto"`, which shows it on wide screens only). On a portrait phone the boards always stack, and a
`layout` param (no longer a knob, kept for old links) can force either. At 1440×900 the two layouts draw objects at about the same size,
about 0.8 px per world unit, but on a 390×844 phone the stacked one is 2.4× larger, and side by side is unreadable
there. The code panel shows the real handlers, and `s.line` lights the
ones each step runs.

There are three predict questions, each placed on the step that answers it:
- **crash:** "When does `y←7` from term 1 commit?" The answer is through the new leader's own no-op (§8).
- **partition:** "Can S1, cut off with S2, commit `y←7`?" No: 2 of 5 servers is not a majority.
- **heal:** "What happens to S1's uncommitted entry?" It is replaced by the term-2 log.

Captions name the rule behind each event ("S3 votes for S2: its log (term 1, index 3) is at least as up-to-date").
Counters: term, commit index, leaderless for (ms), messages, lost. Steps play for at least 1.2 s each, and routine
traffic plays at 0.6 s. Lengths: happy 30 steps (37 s), crash 40 (52 s), partition 86 (87 s).

Scenarios, with their chapters:
- **happy:** Election → Replication;
- **crash:** the leader crashes mid-replication → Re-election in a higher term → Catch-up;
- **partition:** the leader is stranded in a minority → New leader → Heal, after which its uncommitted entry is truncated.

With `noop` off, the crash scenario stops at a "Stuck" chapter that explains why the old-term entry can never commit.
Invariants:
- at most one leader per term, using the ghost variable `ledTerms`;
- logs match up to `commitIndex`;
- log matching;
- committed entries never lost, using the ghost variable `commits`. Every current leader of a later term must hold
  each committed entry.

`buildRaft(s, p, scenario, { bugs, faults, window, until, stopWhen, tray })` is the same figure with test hooks.

---

## Known gaps

- Hash tables never resize, and only linear probing is offered (no quadratic or double hashing).
- The page walk has 4 KiB pages only (no 2 MiB or 1 GiB pages, no PCID). The cache is one level with no coherence protocol.
- The network has one partition at a time, symmetric links, and a single global drop rate. It has no duplication,
  corruption or clock skew.
- A quiet loss ends its lane diagonal at the next step's time (usually a few ms late).
- Raft has no membership changes, snapshots or log compaction. Client deduplication is simplified: the leader looks
  the command id up in its log.
