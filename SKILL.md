---
name: explainer
description: 'Build cinematic, interactive explainers of computer-science concepts (invoked as /explainer <concept>) as real running simulations in a lit 3D world. A deterministic model of the concept (Raft really elects a leader, MapReduce really counts words, quicksort really sorts, the MMU really walks page tables) is narrated step by step, with a chapter scrubber that rewinds, captions, meters, failure scenarios, knobs, an inspector, a code panel and predict-the-next-step questions. Output: one self-contained HTML file, plus optional WebM/MP4 video and PNG stills. Use it whenever someone wants to explain, visualize, animate or teach how a CS concept works: distributed systems, consensus, operating systems, memory, caches, CPUs, databases, storage engines, networking, algorithms and data structures, compilers, concurrency, ML systems or security protocols, even if they only say "diagram", "figure", "animation" or "interactive". Not for concepts outside computing.'
license: MIT
compatibility: Claude Code. Needs Node.js 20.10+ and Chrome or Chromium (for screenshots, audit and video). No npm installs, no network.
metadata:
  opencode/slash: "true"
---

# Explainer

Explainer makes figures that **run** the concept instead of drawing it. You write a small, deterministic simulation of the real algorithm or protocol and narrate it step by step through a builder. The engine turns that run into a cinematic world:
- machined housings with recessed trays
- keycap-like data tiles in identity colours
- inlaid traces that light up as packets glide along them
- a camera that directs itself
- film-style captions
- a scrubber that rewinds exactly

The engine owns layout, look, light, motion and controls, so every figure shares one design language, whatever the prompt. You own the truth.

Bar: an Apple keynote render, a Stripe or Linear page, a Bartosz Ciechanowski essay. `DESIGN.md` is the art direction; read it once.

## The one idea that matters

**Run it, don't draw it.** Never fake a picture of the concept. Implement the concept, at small scale, with real data, and let each real event become a step:
- the shuffle partitions by an actual `hash(word) % R`
- the follower rejects AppendEntries because its log really doesn't match
- the TLB misses because that page really isn't in it

The captions, counters, colours and positions all come from that run. If a caption says "9 bytes", the run moved 9 bytes. That is what makes these figures trustworthy to a CS student, and what makes them hold up when a professional changes a knob or picks the failure scenario.

**And teach it to a beginner.** The default reader knows basic programming, not the concept. A figure that runs perfectly but uses words the reader has never met teaches nothing. `references/teaching.md` is the teaching standard: plan the lesson before the code, and `verify` checks it.

## Workflow

1. **Size it** and tell the user before starting, with a time estimate:
   - **Sketch** (~10–20 min): one board, one scenario, 10–25 steps.
   - **Figure** (~30–60 min): 2–4 scenarios including a failure or edge case, knobs, counters, code panel, both themes checked. This is the default.
   - **Feature** (1–2 h): several boards (for example a cluster plus a space-time lanes board), predict questions, a lockstep comparison, a recorded video.
2. **Truth first.** Pin down the real mechanism and its numbers before writing any code:
   - the exact rules, such as Raft's term and vote rules, or what the combiner is allowed to do
   - realistic sizes, latencies and counts
   - the canonical source to cite in `meta.cite`

   Choose a small instance that still shows the interesting behaviour: 3 mappers, not 300; a 5-node cluster; 8 keys. Decide which **scenarios** tell the story: the happy path, then what breaks (crash, partition, skew, worst case, collision, miss).
3. **Plan the lesson** (`references/teaching.md`, read it every time) before any code. Write down, in plain text:
   - the level (`intro` for a linked list or binary search, `core`, `deep` for Raft), which sizes everything
   - the learner's question (the hook), and an everyday picture with an explicit mapping to the real parts
   - the problem shown before the solution: the naive way, run for real, and why it hurts
   - the ladder of chapters, one new idea each: what it is, the basic move, the payoff, the cost, what breaks
   - the one misconception to disprove, the aha step (a predict question goes right before it), the recap
   - every new word with a plain definition (`meta.terms`), and stories named the way a learner would ask
4. **Pick the boards** from the catalog below. Most figures need one main board; a protocol often adds a lanes board (space-time diagram) for the same nodes.
5. **Scaffold**: `node scripts/new.mjs <dir>` writes a commented `figure.mjs` and a README. `--from <example>` starts from one of `examples/`. Open the closest example first.
6. **Write `figure.mjs`**:
   - `meta` (with a `level`, a `hook`, `terms`, a `recap` and a `takeaway`), `params` (knobs), `scenarios` (each with a one-line `description` of its story, a `whatIf`, and its own `takeaway` when the lesson differs), `counters` (numbers in real units, each with a plain `label` and a one-line `hint`, the 1–3 that tell the story marked `primary`), optional `code`
   - `invariants` (the properties that must hold on every step)
   - `build(s, params, scenario)`

   Use the simulation runtimes in `sim/` rather than hand-rolling: `actors` for anything with messages and time, `tracked` for arrays and structures, `lockstep` to race two algorithms, `machine` for bits, caches and page tables. All randomness goes through `s.rng` (or `s.rng.fork(label)`); the runtimes fork it by default and take a `seed` only to decouple their stream (`references/sim.md`).
7. **Verify** with `node scripts/verify.mjs figure.mjs`. It must end with `0 failing`. It checks:
   - every scenario at defaults and every param at its extremes
   - determinism and invariants on every step
   - compile problems: unknown ids, overflowing trays, overlapping housings, missing captions
   - pacing, and the sampler
   - the lesson (its **teaching** section): undefined terms, jargon, long captions, a missing hook, analogy, recap or why, size for the level

   Then **read the lesson**: `node scripts/lesson.mjs figure.mjs` prints every story as a script (hook, chapters and abouts, captions, questions with their why, recap, takeaway). Read it top to bottom as a beginner and fix the first line you would not understand.
   Once it builds, `node scripts/shoot.mjs page.html --teach` also shoots every predict card (asked, then revealed with its why) and the end card; look at them too.
8. **Build and look**:
   - `node scripts/build.mjs figure.mjs` writes one self-contained HTML file. Use `--serve` for a live-reloading dev page.
   - `node scripts/shoot.mjs page.html` takes every phase in both themes, desktop and phone, plus `contact.png`. **Read the contact sheet and every PNG that matters.**
   - `node scripts/audit.mjs page.html` checks label overflow, tags off-screen and focus out of frame.

   Iterate until it reads instantly. Common fixes:
   - a caption that says too little, or says too much
   - a step that does two unrelated things (split it, or use `s.beat()`)
   - focus that jumps around (use `s.focus`)
   - a board too crowded (reduce n, or split into boards)
9. **Deliver**:
   - the HTML file (it works from `file://`, offline, with no dependencies)
   - a light-theme build if the destination is light (`--theme light`)
   - a video if asked: `node scripts/record.mjs page.html --out x.webm --captions` (`--size vertical` for 9:16)

   Tell the user what the figure shows, its scenarios and its knobs.

## Writing `build()`

Read `references/builder.md` for the full API, and `references/sim.md` for the runtimes. The shape:

```js
export function build(s, p, scenario) {
  // 1. The opening picture: layout groups, housings, containers, tiles, traces, buses, lanes.
  //    Nothing before the first s.step() animates.
  s.row("job", { gap: 84 });
  s.housing("input", { in: "job", variant: "store", title: "input", tray: { cols: 1, of: "page" } });
  s.column("map", { in: "job", title: "map" });
  s.housing("m0", { in: "map", title: "map 0", sub: "192.0.2.10", tray: { cols: 2, of: "record" }, led: "idle" });
  s.trace("in-m0", "input", "m0");
  s.phase("Split", { about: "The input is cut into splits, one per map task, so every machine can work at once." });
  s.step("A word-count job: 3 map tasks, 2 reduce tasks, 11 words of input");

  // 2. The run. Each s.step(caption) commits one animated step.
  s.spawn("rec7", { from: "m0", in: "m0", of: "record", text: "fox · 1", key: "fox" });
  s.count("records");
  s.step("{ref:m0|map 0} emits `(fox, 1)`");
}
```

Rules that make a figure teach. The beginner rules come first (detail and examples in `references/teaching.md`):

- **Write for a beginner who knows basic programming, not the concept.** Start from what they know (an array, a dictionary, a group chat) and contrast the new idea with it.
- **Beginner words first, the real name second, defined at first use.** "an arrow to the next box, called a {term:pointer}", with `meta.terms = { pointer: "an arrow that says where the next box lives" }`. The HUD underlines the word and shows its definition on hover, focus or tap. No flagged jargon (hash, mapper, straggler, quorum, pivot, TLB, …) without a definition, and none at all in the hook or a story's label, what-if or description.
- **A picture, then the problem, then the idea.** The first chapter's `about` maps an everyday analogy onto the parts on screen; run the naive way and show why it hurts before the solution.
- **A ladder, one new idea per chapter**: what it is, the basic move (every sub-step of its first occurrence, at full length), the payoff, the cost, what breaks. Size it with `meta.level`: an `intro` concept gets 3–5 slow chapters, at most two knobs and one or two numbers.
- **Predict where a beginner would guess wrong**, and say why: `s.ask(question, options, answer, { why })` right before the step that disproves the misconception. Wrong options are the real misconceptions.
- **Close with a recap and a takeaway.** `meta.recap` (2–4 short lines, in the order the run showed them) sits above `meta.takeaway` at the end.
- **Stories are a learner's what-ifs.** Label them in learner words ("One slow machine", not "Straggler"); `whatIf` finishes "What if…" the way a learner would ask it.
- **One idea per step.** A step moves one causal chain: a send and its delivery, a compare and its swap. Use `s.beat()` to sequence parts of one step. Use `s.phase(name, { about })` for chapters (3–6 per figure).
- **A hook at the start, a payoff at the end.** `meta.hook` is the one question the run answers, asked on the start card ("Five servers, any of which can crash. How do they still agree on one log?"). End on the result and `s.focus` it: the last step's focus is framed close and large. `meta.takeaway` (or a scenario's own `takeaway`) is the one sentence worth remembering, shown with the result beside "What if…" invitations to the other scenarios (`whatIf: "a worker dies"`). Both must be true of the run in every scenario they cover; state the principle, not knob-dependent numbers.
- **Every chapter says what it is for.** Give each `s.phase` an `about`: 1–2 plain-English sentences, at most 40 words, on what the chapter does and why. It heads the explain panel beside the world. Explain any jargon in a word ("the TLB, a tiny cache of recent translations"), and keep it true in every scenario (build it from the run when the chapter differs).
- **Captions are true, short and specific.** What happened and why, at most 18 words, present tense, with the real numbers from the run.
  - `{key:fox}` makes an identity chip, `{ref:m2|map 2}` an entity chip, `{tone:fail|crashes}` a status word, `{term:hash}` a defined word, and `` `hash(fox) % 2 = 1` `` inline code.
  - Say *why*, not only *what*: "goes to reduce 1 because `hash(fox) % 2 = 1`".
- **Identity colour is for data identity.** Give `key` to the thing the reader tracks: a word, a partition, a node, a term. Use at most 8 keys; more repeat colours. Status uses `tone` and `led`, never a key.
- **Light the one thing to watch.** Moved and spawned tiles are lit automatically; `s.lit(id)` for anything else. Use `s.tag(id, text)` for one short annotation of an event, never a paragraph.
- **Small n, real data.**
  - At most ~12 tiles in a tray.
  - Real words, real-looking addresses (`0x7f3a_2c10`), documentation IPs (`192.0.2.x`), real sizes and latencies.
  - Never "A", "B", "foo".
- **Scenarios carry the insight.** The happy path shows the mechanism; the failure or edge scenario shows why it is designed that way. Each scenario is a story with its own first caption, a short `label` ("Worker dies") and a `description`, one true sentence on what happens in it, shown in the story menu and briefly under the picker when the reader switches to it. Switching to a later scenario starts where it diverges from the first one (the shared setup is skipped, with a "Watch from the start" note); set `scenarios[i].start: "<phase name>"` when the automatic fork is wrong.
- **Repeats speed up on their own.** After a step pattern has played twice, its repeats play at about 3× with a "4 of 11" counter. Keep repeated captions in one shape and lead with the event; `s.step(caption, { keep: true })` keeps a step at full length.
- **Few numbers, in plain words and real units**: bytes moved, messages sent, comparisons, cache misses, simulated milliseconds. Label each the way a newcomer would say it ("sent between machines", not "shuffled"), give it a one-line `hint` on what it means, and mark only the 1–3 that tell the story `primary` (`primary: ["skew"]` for one scenario); the rest stay in the full list.
- **Invariants are the safety net.** State the property the concept guarantees: records conserved, at most one leader per term, output sorted and a permutation of the input. Let verify prove it on every step of every scenario.
- **Code panel when there is code.** Export `code` and call `s.line(a, b)` as the run moves through it.
- **Fit the screen.** `build(s, p, scenario, env)` receives `env.portrait` and `env.phone`. On a portrait phone, use a compact layout: a 2-column `grid` instead of a wide `ring` or `row`, and secondary boards (such as a lanes board) off by default, behind a knob. Check both sizes in the contact sheet.

## Boards: how CS concepts map to the world

| Concept shape | Board | Built with | Examples |
|---|---|---|---|
| Stages of data processing | a `row` of columns of housings, `bus` through a `spacer` for all-to-all | `s.row`, `s.column`, `s.housing`, `s.trace`, `s.bus` | MapReduce, Spark stages, ETL, compiler pipeline |
| A cluster of peers | a `ring` of housings, messages as air arcs or traces | `actors.network` | Raft, Paxos, gossip, 2PC, consistent hashing |
| Who said what, when | a `lanes` board: one rail per node, messages as growing diagonals | `s.lanes`, `send(..., { lane: true })`, `s.mark` | TCP handshake, TLS, consensus, vector clocks |
| An array or sequence | a floor `container` with indices and `pointer`s | `tracked.array`, `s.array`, `s.pointer` | sorting, searching, two pointers, sliding window |
| A structure | containers, stacks (axis z), queues, hash buckets | `tracked.stack/queue/hashtable` | event loop, call stack, hash table probing |
| Bits and addresses | a `bits` strip with field brackets | `s.bits`, `machine.*` | virtual memory, IEEE 754, packet headers, cache index |
| Memory hierarchy | a `column` of `chip` housings (TLB, L1, L2, RAM), pages as tiles | `machine.cache`, `s.housing({ variant: "chip" })` | caches, TLB, page walk, buffer pool |
| Two algorithms compared | two boards in a `row`, stepped together | `lockstep.race` | quicksort vs mergesort, LRU vs LFU |

Housing variants: `node` (server or worker), `client`, `store` (a disc: databases, input and output), `queue` (a trough), `chip` (CPU, cache, TLB, MMU).

## The look (owned by the engine)

You do not choose colours, sizes, fonts or motion. If something looks wrong, fix the *structure*:
- fewer tiles
- a clearer step boundary
- a better layout group
- a shorter caption

Never fix it with styling hacks. The design language (`DESIGN.md`):
- Prism: a deep ink-blue studio with an indigo-to-teal horizon glow, or white ceramic in a cool white studio in the light theme
- ceramic tiles; the identity palette for data, status tones for health
- light marks attention
- time runs left to right
- every line ends on a port
- words live on surfaces
- the camera frames each step's focus inside the area the HUD leaves free

## Verification checklist

Before delivering, all of these must be true:
- verify ends `0 failing`, with no warnings you can't justify (teaching warnings included)
- you read `node scripts/lesson.mjs figure.mjs` top to bottom **as a beginner** and passed the cold-read rubric (`references/teaching.md` section 8): every word defined before it is needed, the problem before the solution, one idea per chapter, a prediction with its why, a recap you could say back
- audit ends clean at 1440×900 and 390×844
- you read `contact.png` and the key frames in both themes:
  - every label fits
  - nothing important is hidden under the HUD
  - each phase reads at a glance
  - the failure scenario visibly fails and recovers
- captions tell the story on their own; read them in order
- knobs at their extremes still produce a sensible figure (verify runs them; look at one or two)

## Files

- `DESIGN.md`: the art direction (the look, motion, HUD and anti-patterns).
- `CONTRACTS.md`: the engine architecture, if you need to go deeper.
- `references/teaching.md`: the teaching standard: the reader, the lesson plan, words and jargon, sizing by level, a worked linked-list plan, a before/after MapReduce rewrite, the cold-read rubric and what the teaching lint checks.
- `references/builder.md`: the full builder API: groups, housings, containers, tiles, traces, buses, lanes, zones, step ops, pacing, held messages, narration markup, pitfalls.
- `references/sim.md`: the runtimes: `rng`, `fmt`, `tracked`, `actors`, `lockstep`, `machine`.
- `references/tooling.md`: every script and flag: verify, lesson, build, serve, shoot, audit, record, new.
- `references/roadmap.md`: known gaps and their workarounds (ring by angle, keyed traces, desktop scale). Check it when the engine seems unable to do something.
- `examples/`: complete flagship figures. Open the closest one before starting:
  - `raft/`: consensus with crash and partition, a responsive layout, predict questions, and a space-time lanes board that is off by default (opt in with the "Message timeline" setting: Show, or Show below the servers).
  - `mapreduce/`: pipeline with a bus shuffle, worker crash, straggler with a backup task, skewed keys, combiner.
  - `quicksort/`: `tracked.array` with pointers, sorted regions, worst case and duplicates.
  - `consistent-hashing/`: a 2³² MurmurHash3 ring, add or remove a server, ring vs `hash % N`, virtual nodes.
  - `virtual-memory/`: x86-64 4-level page walk, TLB hit, miss and fill, page fault with swap-in, a second program reaching a different frame from the same address, cycles counted.
  - `event-loop/`: tasks vs microtasks, `await`, microtask starvation, yielding with `setTimeout`, predict questions.
  - `btree/`: a B+ tree index taking inserts, leaf and root splits, sequential vs random keys, a range scan over the leaf chain.
  - `linked-list/`: the reference **intro** figure (`meta.level: "intro"`): array vs linked list, nodes at real addresses, walking, inserting by changing two arrows, and the wrong-order bug. Open it first for any beginner-level concept.
- `scripts/templates/figure.mjs`: the annotated template that `new.mjs` writes.

Paths in this file are relative to the skill folder (the folder holding this `SKILL.md`). The engine keeps a few internal names from before the skill was called Explainer: the page API `window.__internals`, the `@internals/<path>` import specifier and the `ix-` CSS prefix. They are stable; use them as written.
