# Builder reference (`s`)

`build(s, params, scenario, env)` narrates a real run through `s`. The engine handles layout, look and motion.
Read `SKILL.md` first for the workflow and the rules of a good figure. This file is the exact API.

Contents: [1 Module](#1-the-figure-module) · [2 Model](#2-the-recording-model) · [3 Layout](#3-layout-groups) ·
[4 Solids](#4-solids-and-containers) · [5 Connections](#5-connections-and-time-boards) · [6 Ops](#6-step-operations) ·
[7 Timing](#7-steps-beats-timing) · [8 Messages](#8-messages-in-flight) · [9 Queries](#9-queries-and-ids) ·
[10 Narration](#10-narration-markup) · [11 Attention](#11-attention-camera-tags) · [12 Pitfalls](#12-pitfalls) ·
[13 Problems](#13-what-compile-reports)

---

## 1. The figure module

```js
export const meta = { title, subtitle, kicker, fig, cite: { text, url }, theme: "light" | "dark",  // optional (light)
  level: "intro" | "core" | "deep",              // optional (core): sizes the lesson; intro opens at the New reader level
  hook: "Five servers, any of which can crash. How do they still agree on one log?",      // optional: the start card's question
  terms: { leader: "the one server that decides the order of the log" },                 // optional: plain definitions, {term:leader}
  recap: ["Servers vote for one leader.", "The leader copies each entry to the others."], // optional: 2–4 lines at the end
  takeaway: "An entry is committed once a majority stores it, so it can never be lost." }; // optional: the end's one sentence
export const params = {                 // knobs; verify runs every one at its extremes
  n:    { label: "Keys", type: "int", min: 4, max: 12, value: 8 },   // also "float" (min, max, step), "bool", "text",
  seed: { label: "Seed", type: "int", value: 7 },                    // "select" (options: [{ value, label }])
};
export const scenarios = [                // the stories; label and description are shown in the Scenarios picker
  { id: "happy", label: "Normal run", description: "Every machine stays healthy: the whole job, start to finish." },
  { id: "crash", label: "Worker dies", params: { crash: 1 },
    description: "A mapper crashes halfway through its split, and the master runs it again elsewhere.",
    whatIf: "a worker dies", takeaway: "A worker died and the answer did not change: its split was re-run." }];
export const counters = {                 // the numbers; format: "int" | "bytes" | "ms" | "pct" | "x"
  bytes: { label: "sent between machines", short: "sent", format: "bytes", primary: true,
    hint: "Data the shuffle moves from mappers to reducers: each record's word plus a 4-byte count." },
  skew: { label: "busiest reducer's load", format: "x", primary: ["skew"],
    hint: "Records at the busiest reducer divided by the average per reducer. 1× is perfectly even." },
  tasks: { label: "tasks finished", format: "int", hint: "Map and reduce tasks completed so far." },
};
export const code = { lang: "python", source: "..." };                        // optional code panel
export const invariants = { "records conserved": (snap, ctx) => true || "what went wrong" };
export function build(s, p, scenario, env) { ... }   // env: { width, height, aspect, portrait, phone }
```

- **Params** are resolved in this order: each knob's `value`, then the scenario's `params`, then the user's settings.
  A scenario may set params that are not knobs (such as `crash` above). A param marked `hidden: true` is kept out of
  the settings drawer (a counter marked `hidden: true` stays out of the dock): it still resolves, a scenario may set
  it, verify still runs it at its extremes, and the teaching lint does not count it as a knob. `build` receives the
  resolved values `p` and the scenario **id** (a string).
- **Scenarios are stories.** Each one is the same system told another way, and the reader picks it from the
  "Scenarios" strip at the top centre (it collapses to a centred "Story · A machine crashes ⌄" pill when it does not
  fit). Say "scenario" in anything a reader sees; "story" is the authors' word.
  Give every scenario of a figure with more than one a `description`: one plain sentence, about 10–20 words, on what
  happens in this story ("A machine crashes halfway through its share, and the master runs it again elsewhere."). It
  is shown with the picker and in its menu, so it must be true at every knob value (no counts a knob can change).
  Keep `label` short (1–4 words) and in the learner's words ("A machine crashes", "One word everywhere", not
  "Straggler" or "Skewed keys"): the picker is read before anything is explained. verify warns when a description
  is missing, and its teaching section flags jargon in labels, what-ifs and descriptions.
- **Counters are the numbers a newcomer reads.** Few and plain:
  - `label`: plain words, lower case, as they would read in a sentence ("words mapped", "sent between machines",
    "time without a leader"), never jargon or code ("records emitted", "commit index"). `short` replaces it on
    phones and tablets.
  - `hint`: one line on what the number means, in a newcomer's words. It shows when the reader points at the number,
    and under it in the full list. verify warns when it is missing.
  - `primary: true` puts the number in the dock; `primary: ["skew"]` only in those scenarios (the busiest reducer
    matters in the skew story). Pick the 1–3 numbers that tell the story (verify warns above 3); the rest stay one
    click away in the full list. A figure that marks none shows its first three.
  - `format` sets how the value reads (default `"int"`). An `int` counter may also take `decimals` (fixed digits
    after the point, so a fractional value such as TCP's cwnd shows as `9.25` instead of being floored) and `unit`
    (a quiet suffix, such as `"MSS"`): `cwnd: { label: "congestion window", format: "int", decimals: 2, unit: "MSS" }`.
    `decimals` also applies to `x`. Until the run first sets a counter, `int` and `bytes` read 0 (nothing counted
    yet) and `ms`, `pct` and `x` read `—` (no reading yet), so a ratio is never shown as `0.0×` before it exists.
  - Declare only counters the run moves (verify warns on one that never changes, errors on one used but not declared).
- **Scenarios start at the fork.** When a viewer switches to a scenario other than the first, playback starts where
  it stops repeating the first scenario (the first step whose chapter or caption shape differs, backed off one step,
  or to the start of its chapter when that is close), and a quiet note offers "Watch from the start". The start
  card's Play and the capture scripts always start at 0. Name the chapter yourself when the automatic fork is wrong:
  `{ id: "crash", label: "Leader crashes", start: "Crash" }` (a `s.phase` name in that scenario).
- **A hook at the start, a payoff at the end.**
  - `meta.hook` is one question, in the reader's words, that the run answers ("Add one server to a cache cluster.
    Does every key have to move?"). The start card asks it instead of repeating the subtitle, over the chapter names.
    Without it the card shows the subtitle.
  - The **last step's focus is the payoff shot**: the camera frames it close and large (up to 2.2 px/u). End on the
    result and focus it: MapReduce focuses the `output` store, quicksort the sorted array, Raft adds a closing step on
    the cluster whose caption compares the committed logs it shows.
  - `meta.takeaway` is the one sentence worth remembering, shown with the result when the run ends (in the explain
    panel, or in the caption on narrow screens), above "What if…" invitations to the other scenarios. A scenario's own
    `takeaway` replaces it there, and its `whatIf` ("a worker dies") is the invitation's wording (default: `label`).
  - `meta.recap` is 2–4 short lines (markup allowed) on what the run showed, in order, shown at the end above the
    takeaway under "What you saw" (the explain panel; on narrow screens the Explain card). A scenario's own `recap`
    replaces it.
  - All three must be true of what the run shows, in every scenario they apply to and at any knob setting: state the
    principle, not numbers that a knob can change.
- **The lesson.** Plan it before the code with `references/teaching.md`, then write its words in a `lesson.mjs`
  beside the figure, keyed by the ids the figure gives its steps, chapters and questions (section 7, "Ids for the
  lesson"). `verify` checks it in its lesson and teaching sections and `node scripts/lesson.mjs figure.mjs` prints it.
  - `meta.level` sizes it: `"intro"` (a first encounter: linked list, stack, binary search) gives every caption 20 %
    more reading time at 1× and tighter limits (3–5 chapters, at most 2 knobs and 2 dock numbers); `"core"` is the
    default; `"deep"` allows more (Raft, page walks). An unknown value is an error.
  - `meta.terms` maps a word to its plain definition (under 20 words, only words the reader has). Mark its first use
    in a caption, about, tag or question with `{term:name}` (section 10): the HUD underlines it and shows the
    definition on hover, focus or tap, and the explain panel prints it under the words that use it for the first
    time. A `{term:x}` without `meta.terms.x` is an error.
- **`env`**, the 4th argument of `build`, describes the viewer's frame: `{ width, height, aspect, portrait, phone }`.
  Use it only to choose a *layout*; never let it change the simulation itself. The runtime recompiles, keeping the
  phase, when the orientation flips; verify and Node use a 1440×900 desktop env, and verify also runs a phone env.
  - A wide screen can take a `ring`; a portrait phone a 2-column `grid`, with secondary boards (such as a lanes
    board) left out or behind a knob. `examples/raft/figure.mjs` does this.
  - A flow on a portrait screen runs top to bottom: swap `row` and `column` for the main flow and lay out each stage
    as a `row` with `align: "start"`; give traces `{ fromSide: "bottom", toSide: "top" }`; use a spacer between two
    rows for the bus, so its trunk runs across; prefer one-column trays, so the rows stay narrow.
    `examples/mapreduce` does all of this.
- **Invariants** have the signature `(snap, { step, final, params, scenario, timeline })` and must return `true` or a
  message. They run on `snapshot(i)` (the state at the start of step i) for every step, and on the final state.
  - `snap.entities` is a `Map(id -> record)`. Records are frozen and have `kind`, `parent`, `children` (containers and
    groups) and the fields you set (`text`, `key`, `tone`, `led`, `dim`, `title`, `state`, ...).
  - `snap.counters`, `snap.final`, `snap.phase`, `snap.simTime`.
  - Put the facts an invariant needs into `state` (for example `state: { word, count }`), not into display text.

## 2. The recording model

- Every call **before the first `s.step()`** builds the opening picture, S0. Nothing in S0 animates.
- Every call **after** it is an op of the next step, and it animates.
- `s.step(caption)` commits one step. Step 0 shows S0 with its caption, so give it the establishing sentence.
- Ops are applied as you record them, so `s.get(id)` and `s.has(id)` always see the live world.
- Declaring a solid after step 0 is fine: it rises in with a flash, and its neighbours reflow around it.
- Ops after the last `s.step()` are dropped and reported. End every build with a step.

## 3. Layout groups

Positions come from groups. You never type coordinates, except inside `free`.

| call | arranges | options (defaults) |
|---|---|---|
| `s.row(id, o)` | left to right | `in`, `gap` (84), `align` (`"center"` \| `"start"` \| `"end"`, on y), `pad`, `title`, `tone`, `index` |
| `s.column(id, o)` | top to bottom (−y to +y) | `in`, `gap` (18), `align` (on x), `pad`, `title`, `tone`, `index` |
| `s.grid(id, o)` | row-major | `in`, `cols` (√n), `gap` (18), `pad`, `title` |
| `s.ring(id, o)` | on a circle | `in`, `radius` (auto: members never touch), `start` (−90 = top), `gap`, `pad`, `title` |
| `s.free(id, o)` | members' `at: [x, y]`, relative to the group | `in`, `title` |
| `s.spacer(id, o)` | reserves room | `in`, `w` (0), `d` (0). In a row it spans the row's depth; a bus `via` it runs down its middle. |

- `in` names the parent group. Without it, members go to the root: a column (gap 84) centred on the origin. A root
  member with `at: [x, y]` is placed at that absolute position instead.
- `index: k` inserts the member at position k in its group (the default is the end).
- A group with a `title` becomes a **zone**: a printed floor region whose engraved title sits at the top-left. Its
  `pad` defaults to 26. `tone: "fail"` (or `dashed: true`) gives a dashed border, for a network partition.
- Groups nest without limit. Layout is recomputed when membership changes, and moved members glide to their new
  places in that step. Zones and traces follow.
- **`s.zone(id, { around: [ids], title, tone, dashed })`** is a zone around any entities, independent of layout groups.
  It is usable in S0 or in any step.
  - Its bounds are recomputed every frame from its members' current poses, plus the 26 u pad.
  - It fades in when created, and fades out on `s.remove(id)`.
  - `s.set(id, { around, title, tone, dashed })` changes it; a new `around` glides the bounds over the op.
  - A partition: `s.zone("part", { around: ["n3", "n4"], title: "partition", tone: "fail" })`. The fail tone is dashed.
- Gaps are design units, not pixels. Leave the defaults unless a bus needs room: a `spacer` between two columns gives
  the bus a gutter of two gaps.

```js
s.row("job");
s.column("map", { in: "job", title: "map" });
s.spacer("shuffle", { in: "job" });
s.column("reduce", { in: "job", title: "reduce" });
```

## 4. Solids and containers

### Sizes come from contents

- A **tile** takes its size from `of`:

  | `of` | size (w × d) | use |
  |---|---|---|
  | `tile` | 26×26 | a keycap |
  | `record` | 64×24 | a key · value pair |
  | `bit` | 12×18 | |
  | `page` | 50×30 | a page or block |

- A **tray** is a grid of `cols × rows` slots. When you do not give `rows` (or the capacity), it is sized for **the
  most tiles it ever holds during the run**, so it never resizes. Rows and columns stretch to fit mixed tile kinds,
  so a page can sit in a tray of records.
- A **housing** is its tray plus the 24 u header and an 8 u inset, at least 120×80. It is also at least as wide as its
  widest engraved title, sub-label and LED over the whole run.
- **Overflow**: more tiles than an explicit capacity squeeze the spacing inside the fixed extent, and compile reports
  `overflow`.

### `s.housing(id, o)`: a machined body with a header, an LED and an optional tray

```js
s.housing("m0", { in: "map", title: "map 0", sub: "waiting", led: "idle",
                  tray: { cols: 2, of: "record" }, state: { host: "192.0.2.10" } });
s.set("m0", { led: "busy", sub: "reading" });   // later: sub: "4 slips", then "down" if it crashes
```

| option | meaning |
|---|---|
| `variant` | `"node"` (default: a server or worker), `"client"`, `"store"` (a disc with a round well; input, output, databases), `"queue"` (a low trough), `"chip"` (a square: CPU, cache, TLB) |
| `tray: { cols, rows, of = "tile", order = "row" \| "column" \| "stack", capacity }` | without a tray, the housing holds no tiles (sends and traces still work) |
| `title` (the id), `sub` | engraved in the header: the title top-left, the sub right-aligned. Make `sub` the housing's live state from the run (`waiting`, `reading`, `4 slips`, `down`) and keep it current with `s.set`, so the world tells the story without the panel. Identifiers such as an address belong in `state`, which the inspector shows. |
| `led` | `"ok"`, `"busy"`, `"warn"`, `"fail"` (blinks), `"idle"`, `"off"` |
| `meter` | progress inlay, 0..1 |
| `key`, `tone`, `dim`, `state`, `w`/`d` (minimum size), `at` (in `free`), `index`, `lod` | |

- Tiles in a housing sit in the recessed well.
- `order: "stack"` piles tiles up in z.

### `s.container(id, o)`: a tray-less arrangement on a floor plate

| option | meaning |
|---|---|
| `axis` | `"x"` (a row: arrays), `"y"` (a column: queues), `"z"` (a pile: stacks) |
| `of`, `cols`, `rows`, `capacity` | as for trays |
| `label` | engraved above the plate, left-aligned |
| `indices` (false) | prints slot numbers on the plate in front of each slot |

### Tiles

- `s.tile(id, { in, index, of = "tile", text, sub, key, tone, state, dim, w })`
  - `in` is a housing (with a tray), a container, or a group (a loose tile on the floor).
  - `index` inserts at that slot, and the others reflow.
  - `w` widens this one tile (u) beyond its kind's width, for a value that is longer than a keycap, such as a full
    address in a pointer field (`w: 76` fits `0x7f3a_2c10`). Its tray column grows to fit it. `sub` prints a small
    second line under the text: a field name (`value`, `next`).
- `key` (any string or number) gives the tile its **identity colour**, in first-seen order; there are at most 8 before
  colours repeat. Use it for the data the reader tracks. The engine inks every label in whichever of near-black and
  white contrasts more with the body (every identity colour takes near-black, like a keycap), so you never pick ink.
- `tone` gives a status colour (`ok`, `busy`, `warn`, `fail`, `idle`) or `"ghost"` (an empty or placeholder slot).
  `tone` wins over `key`. A ghost that still says something (`null`) prints it in muted ink.

### Arrays, bits, pointers, floor text

- `s.array(id, values, { in, at, label, indices = true, of = "tile", keyOf: (v, i) => key })` makes a container plus one
  tile per value.
  - It returns `{ id, cells, cell(i) }`. Cell ids are `` `${id}[${i}]` ``.
  - Each cell's `state` is `{ value }`.
- `s.bits(id, { in, at, width = 8, value, fields: [{ name, from, to, key, label }] })` makes a row of bit tiles, **msb first**.
  - `cell(i)` is bit i (0 = lsb), and `cells` is the visual order (msb first).
  - `from` and `to` are bit numbers, inclusive. Each field is printed as a floor bracket with its name (or its `label`,
    such as `"PML4 · bits 47–39"`), and its bits take the field's key. The bracket is the field's only label: do not add
    floor text of your own under the row (the audit reports a bracket name that runs into another print).
  - A bit whose text is `"0"` draws as a ghost.
- `s.pointer(id, { at: tileId, text = id, tone, follow = "slot" })` is a rod with a flag, standing in front of a slot.
  - `follow: "slot"` (the default) keeps it on the **slot** when values swap under it. Use this for index variables like
    `i`, `lo` and `hi`.
  - `follow: "tile"` makes it ride along with the tile, for `head` of a moving node.
  - On a tile in a housing's tray, the rod stands on the floor in front of the housing, under that tile (a cursor
    over nodes: `examples/linked-list`).
  - Move it with `s.point(id, tileId)`.
- `s.text(id, { in, at, text, size = 8, tone, align })` is floor text, laid out like a member. Prefer `title`, `sub` and
  `label`: words belong on surfaces.

## 5. Connections and time boards

- `s.trace(id, from, to, { route = "auto", fromSide, toSide, style, dashed, tone, key, arrow })` is an inlaid groove from
  port to port.
  - `key` tints it with an identity colour (a faint idle glow; `s.set(id, { key })` changes it). Use it when the line
    *is* data: a pointer drawn in the colour of the node it leads to.
  - `arrow: true` cuts a small chevron into the floor at the `to` port, in the trace's own groove and light (it lights
    up as something lands through it); `arrow: "both"` marks both ends. Use it when direction is the point and must
    read in a still frame: a pointer ("12 points at 42"), a one-way flow (input → map, queue → stack). Leave it off
    for links that carry traffic both ways (Raft peers) and for plain wiring. `s.set(id, { arrow })` changes it.
  - `from` may equal `to`: a self-loop (a node that points at itself) leaves the right edge, wraps the corner and
    comes back in through the front (`fromSide` / `toSide` pick other edges); a send `via` it flies the loop.
  - It is routed orthogonally, with rounded corners, through gutters, and detours around housings.
  - Facing ports that are alone on their edges line up, so side-by-side neighbours get one straight run instead of a
    small S-bend.
  - Ports spread when several traces share an edge.
  - `route: "straight"` draws a straight line, for rings; `"auto"` is already straight between members of a `ring`.
  - Sides are `"left" | "right" | "top" | "bottom"`.
- `s.bus(id, { from: [ids], to: [ids], via })` is one trunk plus branches, PCB style, for shuffles and broadcasts.
  - `via` is a spacer; without it, the trunk runs down the middle of the gap.
  - Tiles and messages can travel it in both directions.
- `s.lanes(id, { for: [entity ids], in, at, length = 600, scale, label, unit = "ms" })` is a space-time board with one
  rail per entity.
  - `scale` (u per sim ms) defaults so the rail ends just after the run's last event (its last step's `t`, or a later
    mark), rounded up to a whole major tick; major ticks fall at round times (1, 2, 2.5 or 5 × 10^k) and are spaced to
    fill `length` exactly. An explicit `scale` keeps the fixed 50 u major ticks.
  - Sends with `lane: true` draw growing diagonals on it, and a playhead follows simulated time.
- `s.mark(entity, { t, text, tone, id })` puts an event puck on that entity's lane at sim time `t`. Without `t` it lands
  at the sim time of the step it is committed in (`s.mark("sender", { text: "RTO" }); s.step("…", { t: 700 })` marks
  700); a mark in the opening picture sits at 0.

## 6. Step operations

Every op is recorded into the current step (or the current beat). An id or a handle `{ id }` works anywhere.

| op | what you see |
|---|---|
| `s.move(tile, to, { via, index })` | The tile goes to another container or housing; the others reflow. `via: "auto"` (the default) uses a trace or bus that connects the two, else an arc hop. You can also pass a trace or bus id, or `"air"`. On a trace: it lifts, glides along the groove with a lit trail, and settles into the slot. Within one container it hops. |
| `s.swap(a, b)` | Two tiles trade slots, in two arcs, one higher. |
| `s.spawn(id, { from, in, index, via, ...tile options })` | A new tile emerges from `from` (on top of a tile, or out of a tray) and travels to `in`. With `from` equal to `in`, it rises out of its own slot. |
| `s.remove(id, { style: "sink" \| "fade", to })` | Sinks into the floor, or fades. With `to`, it flies into that consumer, which flashes. A removed solid takes its contents with it. |
| `s.set(id, props)` | Changes any of `text`, `sub`, `key`, `tone`, `led`, `title`, `meter`, `dim`, `state`, `variant`, `label`. A text change rolls like an odometer and flashes; an LED change crossfades; `dim` and `meter` animate. A tile in a dimmed housing dims with it. A trace or bus takes only `tone`, `dim`, `state` (and `dashed` for a trace): a status tone (`s.set("link", { tone: "fail" })`) keeps a faint glow in that colour, idle or carrying; `tone: null` clears it. Any other property on a connection is a `bad-prop` problem. |
| `s.send(id, from, to, { text, key, via, lane, deliver = "end", delay, at })` | A glowing packet goes from `from`'s port to `to`'s, on a trace or bus, or as an air arc that leaves a fading print on the floor. With `deliver: "end"` it arrives in this step; with `"hold"`, see section 8. `lane: true` also draws it on the lanes board. `delay` (sim ms after the step's `t`) or `at` (0..1, a fraction of the step) makes it leave later, so a burst sent in one step shows its serialization (section 8). |
| `s.deliver(id, { into, index, of, text, key, state } \| { remove: true } \| { remove: true, lost: true, at })` | Finishes a held message. With `into`, it becomes a tile in that container. With `lost`, it dies in flight (section 8). |
| `s.drop(id, { at })` | Short for `s.deliver(id, { remove: true, lost: true, at })`. |
| `s.point(pointer, tile)` | The pointer glides to the tile's slot. |
| `s.lit(...ids)` | Attention for the rest of this step. |
| `s.focus(...ids)` | The camera frames these, instead of everything touched. |
| `s.tag(id, text, { tone })` | A glass chip for this step only, with markup allowed. |
| `s.count(name, delta = 1)`, `s.gauge(name, value)` | Counters. A count adds; a gauge sets. |
| `s.line(from, to = from)` | Lights code lines. The highlight stays until changed; `s.line(null)` clears it. |
| `s.say(markup)` | Appended to this step's caption. Sim runtimes use it. |
| `s.ask(question, options, answerIndex, { why, id })` | Predict mode: playback pauses before this step. Until the answer is revealed (70 % into the step) nothing gives it away: the step's caption shows "…", its tags and new legend keys wait, and the chapter's `about` is withheld from the chapter's start ("A question about this chapter is coming up…", and while it is open "This chapter's summary appears once you have answered."), since an about often states the answer. On wide screens the question sits in the explain panel. `why` (optional, recommended) is one plain sentence on why the answer is right; it replaces the card's footer once revealed, and the card stays long enough to read it. Put the question right before the step that disproves a beginner's likely misconception, and make the wrong options real misconceptions. `id` keys the lesson's wording and per-option feedback (section 7). |
| `s.choose(id, { prompt, options: [{ pick, right?, text? }], why? })` | Your turn, in the world: playback pauses before this step and the reader clicks (or tabs to) one of the `pick` entities, which light up. Exactly one option is `right`. Every option is a branch of the same run: `compile(figure, { choices: { [id]: j } })` plays option `j`, and without one the run plays the right option. It returns `{ index, pick, right }` for this run: on a wrong pick, play its consequence for real (the real ops, with their own step ids), then `return` from `build`; the run holds on that last step and the HUD rewinds to the pick. One per step (never with `s.ask` on the same step). Section 7 and `examples/mapreduce/figure.mjs` ("shuffle.which"). |
| `s.check(id, { question, options, answer, chapter?, why?, vars?, transfer? })` | One end-check question, shown when the main run ends (New 3, Basics 2, Expert 1: the one marked `transfer`). Compute `answer` from the figure's own rules, ideally at other knob values ("with 3 counting machines, which one gets `fox`?"), never as a literal. Write a set per story (branch on `scenario.id`): what that story taught, and in the stories after the first one earlier idea at new numbers, so no story repeats another's questions. `chapter` (a chapter id; default the current one) is what "Replay" offers on a miss; `vars` fill the lesson's `checks[id]` templates. Not a step: record it anywhere in `build`. |
| `s.scale({ count, run, like, from, title, lines, note })` | A scale shot on this step: the camera pulls back from the run into a field of `count` machines (section 11). |

```js
s.move(rec, `r${hash(word) % R}`, { via: "shuffle" });
s.tag(rec, `hash(${word}) % ${R} = ${hash(word) % R}`);
s.count("bytes", word.length + 4);
s.step(`{key:${word}} goes to {ref:r1|reduce 1} because \`hash(${word}) % ${R} = 1\``);
```

## 7. Steps, beats, timing

- **`s.step(caption, { dur, t, id, vars, keep })`** commits a step (`id` and `vars`: "Ids for the lesson" below).
  - `dur` defaults to the step's natural length: at least `MOTION.step` (0.9 s), and longer runs take longer.
  - `t` is the simulated time in ms. A step without `t` keeps the previous one.
- **Repeats fold.** In normal playback, once a step pattern has played twice in a row in a chapter (the same caption
  with different chips, numbers or code, or a short cycle such as heartbeat, ack), its further repeats play at about
  3× with a "4 of 11" counter and only the caption's leading clause. Nothing is removed: Next, the scrubber, step
  mode and captures show every step in full, and viewers can turn it off ("Speed through repeats"). So keep repeated
  captions in one shape, lead with the event ("{key:fox} goes to {ref:r0} because …"), and pass `{ keep: true }`
  (`s.step(caption, { keep: true })`) for a step that looks like its neighbours but must play at full length.
- **`s.beat()`** puts the ops after it after the ops before it, inside one step: beat k starts when beat k−1 ends.
  Ops within a beat are siblings and stagger by 45 ms. Use beats for cause and then effect:

  ```js
  s.remove(dup, { to: keep }); s.beat(); s.set(keep, { text: "the · 3" }); s.step("...");
  ```
  An explicit `dur` is shared between beats in proportion to their natural lengths.
- **`s.hold(dur, caption?)`** is a step that just holds the picture. Without a caption it repeats the previous one.
- **`s.phase(name, { about, id })`** starts a scrubber chapter at the next step. Use 3 to 6 per figure.
  - `about` (optional, recommended) is one or two plain-English sentences on what this chapter does and **why**,
    shown at the top of the explain panel beside the world while the chapter plays. Markup is allowed
    (`` `hash(word) % R` ``, `{key:…}`, `{ref:…}`). Keep it under 40 words, explain any jargon in a word (or mark it `{term:…}`), and make it
    true for every scenario and knob value: build it from the run (`victim >= 0 ? … : …`) when the chapter differs.
  - `s.phase(name)` and `s.phase(name, "about text")` also work. Sim runtimes pass it through
    (`ctx.phase(name, { about })`, `a.phase(name, { about })`). An unknown `{ref:…}` in it is an `unknown-ref` problem.

  ```js
  s.phase("Shuffle", { about: "Each record goes to the reducer picked by `hash(word) % R`, so every copy of a word lands on the same reducer." });
  ```
- **Ids for the lesson** (`CONTRACTS.md` section 10, `references/teaching.md` section 5). The figure owns the facts and
  passes them; `lesson.mjs` owns the words and only formats what it is given.
  - `s.step(caption, { id, vars })`: `id` names the step (`"map.read"`, `"insert.save-next"`: `chapter.verb-noun`).
    Every repeat of one move shares its id; the lesson's `first` covers the first time. `vars` holds every run value
    the words need, by kind: a number, a string (also the form for entity ids used in `look`), `{ key: v }` (a key
    chip), `{ ref: id, text }` (an entity chip), `{ code: s }`, a list `[a, b]`, `{ path: [a, b] }`, or
    `{ markup: m }` for a composite the figure builds. The caption stays the fallback for a step the lesson has no
    words for, so keep it true and short.
  - `s.phase(name, { about, id })`: the lesson's `chapters[id]` supplies the about and the entry card. The name stays
    the chapter's title (scenarios and forks find chapters by name).
  - `s.ask(question, options, answer, { why, id })`: the lesson's `asks[id]` can reword the question and options and
    adds per-option feedback; the figure's `answer` decides which option is right.
  - `s.choose(id, …)` and `s.check(id, …)`: the lesson's `choices[id]` words the prompt, the why and each option
    (`options[j]`, or `wrong` for every wrong option when the count follows a knob) with `{ feedback, misconception }`;
    a choose's templates use its step's vars. `checks[id]` words a check (`question`, `why`, `options`) from its `vars`.

    ```js
    const pick = s.choose("shuffle.which", { prompt: "Click the counter that should get this one.",
      options: Array.from({ length: R }, (_, q) => ({ pick: `r${q}`, right: q === r })) });
    if (!pick.right) { splitCount(pick.pick); return; }   // the wrong branch plays for real, then the run ends there
    ```

    `verify.mjs` compiles every wrong option's branch at every setting it tries and checks it like the run: give the
    branch's own steps ids and lesson words (verify counts them for the lesson's coverage), and let an invariant the
    branch is meant to break excuse it with `({ timeline }) => timeline.branch`. Keep the candidates near one another
    in the world: the camera keeps them all in view while the pick is open (on a phone, above the pick card).
  - A small helper keeps it tidy: `const step = (id, caption, vars = {}, o = {}) => s.step(caption, { ...o, id, vars: { ...V, ...vars } });`
    with the run-wide values in `V` (`examples/mapreduce/figure.mjs`).

  ```js
  s.phase("Shuffle", { id: "shuffle", about: "Each slip goes to the counter its hash picks." });
  s.ask(`Where does this "${w}" go?`, ["Reduce 1", "Reduce 0", "Nowhere yet"], 1, { why: "…", id: "shuffle.where" });
  s.move(rec, `r${r}`, { via: "shuffle" });
  s.step(`{key:${w}} goes to {ref:r${r}|reduce ${r}}`, { id: "shuffle.send", vars: { w: { key: w }, red: { ref: `r${r}`, text: `reduce ${r}` }, redId: `r${r}`, rem: r } });
  ```
- **Simulated time**: step i spans `[t_i, t_(i+1)]`. Its events happen at its start, then the clock runs to the next
  event, and packets and the playhead move by that clock. Steps that share a `t` (several handlers at one instant)
  freeze time while they narrate.
- **`s.pace({ ms = 10, min = 0.45, max = 2.4, read = true })`**: from now on, a step that has a `t` and no `dur`
  lasts `(t_next − t) / ms` seconds, clamped to `[min, max]`. Packets then fly at a constant speed. `s.pace(null)`
  turns it off. `actors.network().run()` sets this for you.
- **The reading floor.** Every step without an explicit `dur`, paced or not, lasts at least as long as its caption
  takes to read at 1× (`MOTION.read`: 1 s + 0.3 s per word, at most 6.5 s). For a paced step,
  **`dur = max((t_next − t) / ms clamped to [min, max], reading time)`**: the motion keeps the paced speed and the
  rest of the step is a hold. With 12-word captions that floor is about 4.6 s, so a 40 ms gap and a 160 ms gap can
  both become 4.6 s and a knob such as RTT stops changing the pace you see. To keep sim-time proportions visible:
  - write short captions for the dense, repeated steps (6 words read in 2.8 s), and let the explanation live in the
    chapter's `about` and in a few `{ keep: true }` steps;
  - choose `ms` so the paced lengths of the gaps you compare sit above the reading floor;
  - put the reading time in an explicit `s.hold(dur, caption)` after a burst of short steps;
  - or pass `s.pace({ ms, read: false })`: paced steps then last exactly their paced length (still clamped to
    `[min, max]`), so sim time is shown in true proportion. Readers can pause, step and rewind, so use it for runs of
    short, repetitive captions, not for a step whose caption carries new information.

## 8. Messages in flight

```js
s.send("rv3", "n1", "n3", { deliver: "hold", lane: true, key: "term 2", text: "RequestVote" });
s.step("n1 asks for votes", { t: 12 });
// ... other steps; many messages may be in flight at once ...
s.deliver("rv3");                                // or { into: "n3" } to keep it as a tile
s.step("n3 grants its vote", { t: 17 });
```

- A held message moves by simulated time and **arrives at the start of the step that delivers it**. Its lane diagonal
  then stays on the board, dimmed.
- `s.has(id)` is true while the message is in flight.
- **Lost in flight** (`s.drop(id)` or `s.deliver(id, { remove: true, lost: true, at })`): the packet stops where it is
  at that step's time, flashes in the fail tone and fades out over 0.65 s. Its lane diagonal stops growing at the same
  point and goes dashed.
  - `at` (0..1) is how far along its path it got.
  - Without `at`, it is estimated from the elapsed time against the typical latency of the messages delivered so far,
    clamped to 0.2–0.85, or 0.5 when there is no history.
- **Arrived but discarded** (`s.remove(id)` on a held message), for example at a dead node:
  - in a later step (a later `t`), it reaches the receiver, sinks there, and its diagonal is dashed.
  - in the same instant, it sinks where it is.
- A message never delivered parks short of its receiver. Always deliver or remove.
- **Departure offsets.** Every send leaves at the start of its step unless it has `{ delay: ms }` (sim time after the
  step's `t`) or `{ at: 0..1 }` (a fraction of the step: of its sim-time span for held messages, of the step's motion
  otherwise). A burst of segments sent in one step over a link that serializes one every 10 ms:

  ```js
  burst.forEach((seq, k) => s.send(`seg${seq}`, "sender", "receiver", { deliver: "hold", lane: true, delay: k * 10 }));
  s.step(`The sender sends segments ${burst[0]}–${burst.at(-1)}`, { t: now });
  ```
  The packets leave one after another and their lane diagonals start at `t + delay`, so they are parallel instead of
  stacked. A held message waits, unseen, until the playhead's sim time reaches its departure; keep `delay` below the
  time to the step that delivers it.

## 9. Queries and ids

- `s.get(id)` returns the frozen record plus `index` in its parent, or `undefined`. Read your own `state` back through
  it: `s.get(id).state.count`.
- `s.has(id)` tells you whether the id is in the world now.
- `s.key(name)` returns the colour index (first-seen order).
- `s.rng` is the seeded RNG, and all randomness goes through it: `next()`, `int(a, b)`, `float(a, b)`, `pick(arr)`,
  `shuffle(arr)`, `chance(p)`, `exp(mean)`, `normal(mu, sd)`, `fork(label)`. It is seeded from `params.seed`, and the
  page, verify and the test stub all back it with `sim/rng.mjs`, so they produce the same trace. Use
  `s.rng.fork("label")` for a stream that later draws elsewhere must not shift. **Never `Math.random`.**
- `s.params`, `s.scenario`, `s.stepIndex`, and `s.uid(prefix)` (a fresh id).
- Ids are strings, unique among the living. An id can be reused once its entity is gone, and it becomes a new thing.
  Declaring an id that is alive is a `duplicate-id` problem.

## 10. Narration markup

Captions, tags and `s.say` share one markup.

| markup | renders as |
|---|---|
| `{key:fox}`, `{key:fox\|the word fox}` | a chip in fox's identity colour |
| `{ref:m2}`, `{ref:m2\|map 2}` | an entity chip; hovering it lights m2 (an unknown id is a problem) |
| `{tone:fail\|crashes}` | a word in a status tone |
| `{term:pointer}`, `{term:pointer\|pointers}` | a glossary word (dotted underline): its `meta.terms` definition shows on hover, focus or tap; without one it is plain text and verify reports it |
| `` `hash(k) % R` `` | inline code |
| `**bold**` | bold |
| `\{` `\|` `` \` `` `\*` | literal characters |

Build markup safely with `sim/fmt.mjs` (`fmt.key`, `fmt.ref`, `fmt.term`, `fmt.code`), or with
`import { key, ref, tone, term, code } from "@internals/engine/scene/narrate.mjs"`.

Keep captions at 6 to 18 words, with the numbers from the run: what happened and why. Beginner words first and the
real name second, marked at first use: "each box keeps an arrow to the next, called a {term:pointer}".

## 11. Attention, camera, tags

- **Lit**: moved, spawned, swapped and delivered tiles light up automatically for their beat. `s.lit` lights things for
  the step. Light only the one or two things to watch.
- **Camera.** You never move it: the director (`engine/director/shots.mjs`) plans its shots from the compiled
  timeline, so the camera is a function of the playhead and playing, scrubbing and capture agree. Per chapter:
  - **establish**: the chapter's first step opens on the whole world, from the chapter's own angle (chapters turn the
    world a little, alternating sides), and holds while the entry card reads;
  - **push-in**: the chapter's *stage*, everything its steps touch or `look` at, framed to fill the free area with
    the step's focus in view;
  - **detail**: a `key` step with `look` ids (the lesson's strongest signal) goes close enough to read those tiles;
  - **pull-back**: the chapter's last step widens to the whole world (phones: to the stage);
  - **payoff**: the run's last step (before any scale shot) frames its focus close and large (§1);
  - **scale**: an `s.scale` step tracks the pull-back out to the whole field (below).
  A new shot too close to the current one is not taken, so the camera rests while the reader reads. Reduced motion
  cuts. So: give each chapter one stage, give key steps a `look`, and end on the result with `s.focus` on it.
- **Focus**: everything the step touches, both ends of each motion: lit and tagged things, set targets, the sender
  and receiver of each send. It builds the chapter's stage and stays in view in the push-in.
  - A step that touches nothing keeps the previous focus.
  - `s.focus(...)` overrides it, for a closing shot of a group or the payoff.
  - The camera frames only the space the HUD leaves free (the explain and code panels, title and dock), and never
    shrinks the world below 0.9 px/u on desktop (9.5 u tile labels at ~8.6 px) to fit it: a wider world gets a closer
    shot that holds the focus, and slides so any cut falls at a bare screen edge rather than under a panel. A small
    board (one array) fills about 62 % of the free area. Phones fit the board width first; lay out for portrait
    with `env`.
- **Scale shot**: `s.scale({ count, run, like, from, title, lines, note })`, called before the `s.step` it belongs to.
  The camera pulls back, in powers of ten, from `from` (an id or ids; default the whole world) to a field of `count`
  machines, each a silhouette of `like` (default `run[0]`) rising out of the floor as the view reaches it; the run's
  own machines (`run`, ids) count among them and stay where they are. `title` prints large, `lines` (each wraps at
  52 characters) below it, then the `note`, `"shown at scale, simplified"` unless you give another, always printed.
  The step lasts at least 12.5 s at 1×. A bad `count`, a missing `like`, or a `run` larger than `count` is a
  `bad-scale` problem.
  - **Use it** when the point is the real system's size (a 2,000-machine job, a data centre, a million keys), once
    per figure, on the last step of the happy path: the reader has seen the mechanism small, and now sees how big it
    runs.
  - **It is a picture, not a simulation.** Nothing in the field is computed: its lights only show busy or idle.
    So `count`, `title` and `lines` carry only numbers the run computed or a cited source gives, and say whose
    ("The paper's typical job: M = 200,000 map tasks", "Dean & Ghemawat, OSDI 2004, §3.5"). Never invent a number
    for it; keep the note.

  ```js
  if (scenario === "happy") {
    s.scale({ count: 2000, run: [...mapIds, ...reduceIds], from: "output", title: "2,000 machines",
      lines: ["The paper's typical job: M = 200,000 map tasks, R = 5,000 reduce tasks", "Dean & Ghemawat, OSDI 2004, §3.5"] });
    s.step("The same job at the paper's scale. Shown simplified.", { id: "scale.cluster", vars: { machines: "2,000" }, keep: true });
  }
  ```
- **Tags** live for one step and fade in and out. A tag on a housing, or on a tile resting in one, floats above the
  housing's back edge, clear of the engraved header. For the first housing of a titled zone, it floats above the zone's
  edge instead, clear of the zone title. Over the groove it rides just above the tile. One tag per event: a few words
  or an equation.

## 12. Pitfalls

| symptom | fix |
|---|---|
| A busy shuffle of tiles every time one leaves a 2-column tray (wraps hop over their neighbours) | Fine for one leaver at a time. For many moves at once use `tray: { cols: 1 }`, or `order: "column"`, or sort with `s.swap` (two arcs, nothing else moves) instead of `move(..., { index })`. |
| Everything moves at once and the reader cannot follow | Split into steps, or sequence with `s.beat()`. One causal chain per step. |
| A consumer's value changes before the things merging into it arrive | Put `s.set(keep, ...)` in the next beat, after `s.remove(dup, { to: keep })`. |
| `s.get(id)` is undefined right after `s.remove(id)` | Read what you need before removing it (totals, words). |
| Packets stall mid-flight between steps | Steps that share a sim time freeze the clock. Use `s.pace(...)`, or give `dur`. |
| `duplicate-id` on a re-run or a retry | Use a fresh id (`` `${id}.retry` ``, `s.uid()`), or remove the old one first. |
| A tray is huge in step 0 | It is sized for its fullest moment in the run. Clear the tiles out sooner, or split the work across housings. |
| A colour repeats | You used more than 8 keys. Key the thing the reader tracks, and use `tone` for status. |
| A tile tag covers a housing title | Not any more (tags anchor above the back edge). For a long tag, tag the housing instead. |
| A pointer drifts off its index after swaps | That is `follow: "tile"`. The default `"slot"` stays on the index. |
| The step-0 caption is missing, or the last ops vanish | Every build starts and ends with `s.step(caption)`. |
| An invariant fails only in the opening state | Snapshot 0 is S0. Guard with `snap.final`, or make the property true from the start. |
| A caption says something the run did not do | Compute the caption from the same values the ops used. |

## 13. What compile reports

`tl.problems` holds `{ kind, message, step, id }`. verify fails on any of them.

| kind | cause |
|---|---|
| `unknown-id` | An op references an id that does not exist at that moment. |
| `not-container` | A tile goes into something without a tray. |
| `overflow` | More tiles than an explicit capacity. |
| `overlap` | Two housings overlap, usually from `free` coordinates. |
| `no-caption` | A step has no caption. |
| `keys` | More than 8 identity keys. |
| `trailing-ops` | Ops after the last step. |
| `unknown-ref` | A `{ref:id}` in a caption names an entity that never exists. |
| `lesson` | `lesson.mjs` names a var the step does not pass, a `look` id that does not exist at the end of the step, an unknown picture row, `deeper` field or misconception id, or an ask with another option count (`CONTRACTS.md` 10.2). |
| `bad-scale` | `s.scale` without a usable `count` or `like`, or with more `run` machines than `count`. |
| `duplicate-id`, `not-tile`, `not-held`, `bad-prop`, `free-without-at`, `no-lane`, `unroutable`, `build-error` (the exception, with its stack) | |


Note: `s.focus(zoneId)` with a zone made by `s.zone(..., { around })` frames the zone's members plus its pad.
