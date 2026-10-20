# Explainer — architecture and contracts

Read `DESIGN.md` first (the look). This file is the engineering contract between the five parts of the engine. You only need it to change the engine itself; figure authors work from `SKILL.md` and `references/`. Inside a part anything may change, but the interfaces below are fixed: a change to one is a change to every part that uses it.

## 0. Ground rules for every part

- **Zero dependencies.** Plain ES modules (`.mjs`), Node 20+ built-ins only, browser APIs only. No npm installs, no CDNs, no bundlers. Fonts are in `assets/fonts/`.
- **The look lives in `engine/tokens.mjs`.** Never hard-code a colour, size or duration elsewhere; import it. Need a new token? Add it to your own module as a clearly named constant derived from tokens, or add it to `tokens.mjs` if more than one part needs it.
- **`engine/scene/**`, `sim/**` and `engine/director/**` are DOM-free** and must run in Node (verification runs figures headless). Only `engine/gfx/**`, `engine/hud/**` and `engine/runtime.mjs` may touch the DOM, WebGPU or WebGL.
- **Deterministic.** No `Math.random()`, no `Date.now()` in anything that shapes the trace. Randomness comes from `sim/rng.mjs` seeded from params. Rendering may use time for grain and dashes; capture passes an explicit time.
- **Relative imports with the extension** (`import { x } from "./math.mjs"`). The build rewrites them for the single-file page.
- **Tests**: `node --test` files named `*.test.mjs` beside the code. Browser test pages are opened through `node scripts/serve.mjs` (http://127.0.0.1:5173/...). See them with `node scripts/snap.mjs <path-or-url> --out x.png [--size 1440x900] [--eval js]`. **Look at every PNG you make** (use the Read tool on the PNG).
- **Comments**: sparse; a short header per file saying what it is, and a line where the reason is not obvious.
- **Performance budget per frame** (300 entities, 1440×900 at DPR 2 on a laptop): scene sample ≤ 2 ms, skin ≤ 1 ms, render ≤ 6 ms GPU, HUD update ≤ 0.5 ms.

## 1. Data flow

```
figure.mjs ── build(s, params, scenario) ──► Script (entities + steps of ops)        [engine/scene]  B
lesson.mjs ── merged by step id (section 10) ──┤ compile
                                               ▼
                                            Timeline ── sample(time, view) ──► Frame { poses, tags, focus, caption, counters … }
                                                                                   │
                       ┌───────────────────────────────────────────────────────────┤
                       ▼                                                           ▼
             skin(poses, theme) ──► DrawList   [engine/gfx/skin]  A        director.update(frame) ──► Camera  [engine/director]  E
                                                                            (a shot plan from the Timeline, shots.mjs)
                       │                                                           │
                       └──────────────► renderer.render(drawList, camera) ◄────────┘   [engine/gfx]  A
                                                     │ project(tag anchors)
                                                     ▼
                                     hud.update(frame) / hud.placeTags(...)      [engine/hud]  C
   sim/* (rng, tracked, actors, machine, lockstep, fmt) only ever call the Scene builder API      D
   scripts/* build the single-file page, verify, shoot, record                                   E
   engine/runtime.mjs wires it all together
```

## 2. Parts

| Part | Discipline | Directory |
|---|---|---|
| A. Renderer + skin | graphics | `engine/gfx/` |
| B. Scene: builder, layout, routing, timeline, sampler | systems / animation | `engine/scene/` |
| C. HUD, interaction, page CSS | HCI | `engine/hud/` |
| D. Simulation runtimes | PL / distributed systems | `sim/` |
| E. Tooling + camera director | infrastructure | `scripts/`, `engine/director/` |
| Integration | runtime and docs | `engine/tokens.mjs`, `engine/contracts.mjs`, `engine/runtime.mjs`, docs, `examples/` |

The CLIs of `scripts/serve.mjs` and `scripts/snap.mjs` are part of the contract: improve them, keep their flags.

---

## 3. A. Renderer and skin (`engine/gfx/`)

### 3.1 Renderer

One API, two tiers. `engine/gfx/renderer.mjs` re-exports `createRenderer` from `engine/gfx/select.mjs`, which starts
the **WebGPU** backend (`engine/gfx/backends/webgpu/`) when `navigator.gpu` is there and it passes a startup
self-test, and the **WebGL2** backend (`engine/gfx/backends/webgl2/`) otherwise. `?gfx=webgl2|webgpu` in the page URL
(or `opts.gfx`) forces one. If WebGPU fails to start, or its device is lost later, the canvas is replaced and WebGL2
redraws the last frame, so a page never goes blank. Shared, backend-free modules stay in `engine/gfx/` (`skin.mjs`,
`pack.mjs`, `slabmesh.mjs`, `text.mjs`, `look.mjs`, `motion.mjs`, `pick.mjs`, `pool.mjs`, …).

```js
import { createRenderer } from "./engine/gfx/renderer.mjs";
const r = createRenderer(canvas, { theme: "light", quality: "high" /* | "medium" | "low" */, gfx /* "webgpu" | "webgl2" */, timing });
r.resize(cssWidth, cssHeight, devicePixelRatio);
r.setTheme("dark"); r.setQuality("medium");
r.render(drawList, camera, { time /* s: the shimmer clock (grain, dashes, blinking) */, clock /* s: the render clock fading memories run on (default time) */, reducedMotion, capture, draft });
r.pick(cssX, cssY)            // -> entity id string | null (slabs only)
r.project([x, y, z])          // -> [cssX, cssY, depth, onScreen]
r.unproject(cssX, cssY, z=0)  // -> [x, y] on the horizontal plane at height z
r.pxPerUnit(at = [x, y, z])   // -> CSS px per world unit at that point (for LOD and tag sizing)
r.stats()                     // -> { ms, drawCalls, instances, lights, slabs, strings, backend: "webgpu" | "webgl2", draft, gpuMs? }
r.busy                        // true while the last frame had something still fading out: draw another
r.drafted                     // true when the last frame was drawn as a draft: draw the frame that comes to rest again without `draft`
r.size                        // { cssW, cssH, dpr, W, H, scale } (scale: WebGPU's adaptive resolution, 1 on WebGL2)
r.profile(opts)               // -> Promise of per-pass GPU timings (WebGPU), or null
r.backend                     // "webgpu" | "webgl2" | null before ready
r.ready                       // Promise: a backend is drawing (fonts loaded, pipelines compiled)
r.lost                        // boolean; r.onLost(fn) for context or device loss
r.dispose()
```

The text atlas (`text.mjs`, `TextAtlas`) is backend-free: it rasterises and packs SDF strings, and the backend that
owns the GPU texture calls `atlas.attach(upload)`, where `upload(x, y, w, h, bytes)` writes one R8 rectangle into it.
`globalThis.__gfx` is the renderer, for tooling (`__gfx.size.scale` is the adaptive scale).

**Adaptive resolution (WebGPU).** `engine/gfx/backends/webgpu/adapt.mjs` (`ADAPT`, `Governor`): while live frames run
long (a second of frames over the GPU budget that miss their vsync), the scene passes draw at a lower internal scale of
the device pixel ratio (1, 0.92, 0.84, 0.75) and the composite still fills the canvas; it steps back up only when the
span at the higher scale would sit well inside the budget, never sooner than `ADAPT.hold`. Captured frames
(`capture: true`) always draw at full scale.

**Draft frames (no GPU).** The runtime passes `draft: true` for a frame the next one replaces at once: while playing,
and while the camera or the HUD's insets still move. On a software rasterizer (SwiftShader, llvmpipe and the like:
`look.mjs` `SOFTWARE`, read from WebGL's unmasked renderer or the WebGPU adapter's info) a draft is drawn in the draft
tier (`look.mjs` `DRAFT`): WebGL2 at three quarters of the pixel ratio with the low preset's maps and no MSAA or
tilt-shift, WebGPU at three quarters of its scene scale. When the camera comes to rest on a draft (`r.drafted`) the
runtime draws that frame again without `draft`, so a still picture is always the full one. A GPU never drafts; captured frames (`capture: true`) never do.

**The DrawList** carries `dl.fields`: the scale fields' packed machines (`[{ n, version, slabs, memo }]`, one per `field`
pose; `null` when none), which the packer caches by each machine's version.

`DrawList`, `Camera` and every primitive are defined in `engine/contracts.mjs`. World: x right, y toward the viewer, z up. Camera yaw 0 looks from +y toward −y; pitch is degrees above the horizon.

Required quality (see `DESIGN.md` sections 4–6):
- **One slab primitive** for every solid: extruded rounded rectangle with a rounded top edge, built procedurally in the vertex shader from per-instance `w, d, h, r, bevel` so radii never distort; instanced; MSAA. Smooth normals across the bevel; crisp specular catch-light on ceramic bevels.
- **Top-face decals** in the slab shader (both tiers): `label`, `label2`, `well` (recessed tray with inner shadow), `meter`. Text is SDF (generate per-string SDF bitmaps at runtime from canvas text with an exact Euclidean distance transform, packed into an atlas, LRU-evicted) so it is crisp at every zoom; engraved vs printed styles.
- **Floor pass**: stage colour with radial key-light falloff, dot grid that fades with distance from the scene bounds, zones (fill, solid or dashed border, engraved title), grooves (cut channel with lower-lip catch-light; rail; wire; print), groove `pulses` (luminous trails by arc length), `grow`, `dash` + `flow`, ticks, floor text.
- **Shadows**: soft directional shadow map (wide filter) from the key light onto floor and solids, plus a tight contact shadow under each slab. A hopping tile's shadow lands on whatever is below it.
- **Point lights** from slabs with `light > 0` and from `drawList.lights`, up to `LIGHT.maxPointLights`, lighting floor and solids (the floor light pool under a packet is essential).
- **Emission + bloom**: MRT emissive buffer, multi-level blur, composite; tonemap that leaves albedo-range colours matching the tokens (a stage pixel must come out as `PALETTE.*.stage` within a few levels); film grain; vignette. Light theme: emissive reads as a saturated body with a coloured halo on paper, never grey haze.
- **Picking** by id (render ids on demand for the pointer pixel).
- `opacity < 1` slabs drawn after opaque ones, sorted back to front; `desaturate`; `outline` ring on the floor.
- `quality` scales shadow map size, bloom levels, MSAA samples.

### 3.2 Skin

```js
import { skin } from "./engine/gfx/skin.mjs";
skin(poses, drawList, { theme, time, pxPerUnit });   // appends to drawList; returns drawList
```

Skin turns semantic **poses** (section 4.6) into styled primitives, exactly per `DESIGN.md` section 5: a housing becomes body slab + header engraving + LED puck + well + optional meter; a lane becomes rail groove + ticks + floor texts; a packet becomes an emissive pill with a point light; a pointer becomes rod + flag tile; a bitfield's field brackets become printed floor lines + texts; a `field` (a scale shot's thousands of machines) becomes one housing of the run's silhouette per risen machine with its page in the tray, sent to `dl.fields`; and so on. Skin is the only place that knows how each kind looks. Keep it pure (no DOM) so it can run in Node for tests.

Skin keeps a per-field memo (a `WeakMap` keyed by the field's `xy`): each machine's slabs are kept with the state row
that made them and remade only when that row changes (rising, a task finishing, the work wave), with a version per
machine for the packer's cache.

### 3.3 Deliverables

- `engine/gfx/renderer.mjs` and `select.mjs`, the two backends under `engine/gfx/backends/`, the shared modules, `engine/gfx/skin.mjs`.
- `engine/gfx/gallery.html`: a hand-built beauty scene using skin + renderer (no scene engine), both themes (toggle with `?theme=light`), with motion (packets travelling, a tile hopping, an LED blinking, a value rolling) so we can judge the look. It must reach the bar in `DESIGN.md`.

---

## 4. B. Scene (`engine/scene/`)

### 4.1 Figure module (what a figure author writes)

```js
export const meta = {
  title: "MapReduce",
  subtitle: "Counting words across a cluster",
  kicker: "Distributed systems",            // shown as "DISTRIBUTED SYSTEMS · FIG 1"
  fig: 1,
  cite: { text: "Dean & Ghemawat, OSDI 2004", url: "https://research.google/pubs/pub62/" },
  theme: "light",                           // optional; the page opens in this theme (default "light")
  level: "core",                            // "intro" | "core" | "deep": sizes the lesson; intro opens at the New reader level
};
export const params = {                      // knobs; every one appears in the settings drawer
  mappers:  { label: "Mappers",  type: "int",  min: 1, max: 6, value: 3 },
  reducers: { label: "Reducers", type: "int",  min: 1, max: 4, value: 2 },
  combiner: { label: "Combiner", type: "bool", value: false },
  input:    { label: "Input",    type: "text", value: "the quick brown fox jumps over the lazy dog the fox" },
  seed:     { label: "Seed",     type: "int",  value: 7 },
  // type "float" (min, max, step) and "select" (options: [{value, label}]) also exist
};
export const scenarios = [                   // the stories (the "Scenarios" strip at the top centre); each overrides params
  { id: "happy", label: "Normal run", description: "Every machine stays healthy: the whole job, start to finish." },
  { id: "crash", label: "Worker dies", params: { crash: 1 }, description: "A mapper crashes mid-task and its split runs again." },
];                                           // optional: description (one line), whatIf, takeaway, start
export const counters = {                    // the numbers, in display order
  bytes: { label: "sent between machines", short: "sent", format: "bytes", primary: true,   // format: "int" | "bytes" | "ms" | "pct" | "x" (ratio); int also takes decimals, unit
    hint: "Data the shuffle moves from mappers to reducers." },                               // hint: one line on what it means
  tasks: { label: "tasks finished", format: "int", hint: "Map and reduce tasks completed so far." },
};                                           // optional: short, hint, primary (true | [scenario ids]: shown in the dock), group, better
export const code = { lang: "python", source: "def map(doc):\n    for w in doc.split():\n        emit(w, 1)\n" }; // optional
export const invariants = {                  // checked on every step snapshot by verify; return true or a message
  "records conserved": (snap) => true,
};
export function build(s, p, scenario) { /* uses the builder below */ }
```

### 4.2 Builder API (`s`)

Everything returns a handle `{ id, ... }`; anywhere an id is accepted, a handle is too. Ids are strings, unique per figure. Calls before the first `s.step()` define the opening state (no animation). Calls after it are recorded into the current step and animate.

**Layout groups** (positions are never typed by hand unless you use `free`):
```js
s.row(id, { in, gap = SIZE.gutter, align: "center" | "start" | "end", pad, title, tone })   // members left→right
s.column(id, { in, gap = 18, align, pad, title, tone })                                      // members top→bottom (−y → +y)
s.grid(id, { in, cols, gap, pad, title })
s.ring(id, { in, radius /* or auto */, start = -90 /* deg */, pad, title })
s.free(id, { in, title })                                     // members use `at: [x, y]` relative to the group
s.spacer(id, { in, w, d })                                    // reserves room (a gutter for a bus)
```
A group with a `title` is drawn as a zone around its members. Groups nest (`in` another group). Layout is a pure function of the current membership and sizes: when membership changes during a step, the affected members glide to their new places in that step.

**Solids and containers**:
```js
s.housing(id, { in, at, title, sub, variant: "node" | "client" | "store" | "queue" | "chip",
                tray: { cols, rows, of: "tile" | "record" | "bit" | "page", order: "row" | "column" | "stack" },
                w, d,                 // optional; default fits the tray + header + padding
                led: "ok" | "busy" | "warn" | "fail" | "idle" | "off", key, meter /* 0..1 */, state /* inspector object */ })
s.container(id, { in, at, of, cols, rows, axis: "x" | "y" | "z", label, indices: false, capacity })
                                      // a tray-less arrangement on the floor: an array, a queue, a stack (axis z piles up)
s.tile(id, { in /* container or housing */, index, of = "tile", text, sub, key, tone, state })
s.array(id, values, { in, at, label, indices = true, of = "tile", keyOf })   // -> { id, cells: [tileId…], cell(i) }
s.bits(id, { in, at, width, value, fields: [{ name, from, to, key, label }] })   // -> { id, cells } bit i = cell(i), msb first
s.pointer(id, { at /* tile id */, text, tone })
s.text(id, { in, at, text, size, tone })                      // floor text
```
Housings act as containers: `in: "m0"` puts a tile in m0's tray. A container lays out its tiles in slots (row-major by default; `stack` piles them up in z; overflow compresses spacing). Tile `key` (any string or number) maps to a stable identity colour (`s.key(name)` returns the index; first-seen order); `tone` overrides with a status tone or `"ghost"`.

**Connections**:
```js
s.trace(id, from, to, { route: "auto" | "straight" | "orth", fromSide, toSide /* "left"|"right"|"top"|"bottom" */, style, key, tone, dashed,
                        arrow /* true | "end" | "both": an inlaid chevron at the receiving port */ })   // from === to: a self-loop
s.bus(id, { from: [ids], to: [ids], via /* spacer or gap */ })   // one trunk + branches, PCB style (shuffles, broadcasts)
s.lanes(id, { for: [entity ids], in, at, length, scale /* u per sim ms */, label, unit = "ms" })
                                      // a space-time board: one rail per entity; `lane:true` sends draw diagonals on it
s.mark(laneFor /* entity id */, { t, text, tone })            // an event puck on that entity's lane at sim time t (default: its step's t)
```
Traces route automatically between port points on the facing edges, orthogonally with rounded corners (`SIZE.trace.corner`), spreading multiple ports along an edge, avoiding housings. Routing is recomputed when layout changes.

**Step operations** (recorded into the current step):
```js
s.move(tile, to, { via /* trace id | bus id | "air" | "auto" */, index })   // into a container/housing; others reflow
s.swap(a, b)                                    // two tiles exchange slots (arcs over each other)
s.spawn(id, { from /* entity */, in, ...tileOptions })   // a new tile emerges from `from` and travels to `in`
s.remove(id, { style: "sink" | "fade", to /* entity it is consumed by */ })
s.set(id, { text, sub, key, tone, led, title, meter, dim /* bool */, state, variant })
s.send(id, from, to, { text, key, via /* trace | bus | "air" */, lane /* bool */, deliver /* "end" (default) | "hold" */, delay /* sim ms */ | at /* 0..1 of the step */ })
s.deliver(id, { into /* container */ } | { remove: true })    // finish a held message in a later step
s.point(pointer, tile)
s.lit(...ids)          // attention this step (moved/spawned tiles are lit automatically)
s.focus(...ids)        // camera hint this step (default: everything touched this step)
s.tag(entity, text, { tone })                   // a floating chip for this step only
s.count(name, delta = 1); s.gauge(name, value)  // counters (see `counters` export)
s.line(from, to = from)                          // active code lines
s.say(markup)                                    // narration (section 4.4)
s.ask(question, options, answerIndex, { why, id })   // predict mode: playback pauses before this step; why shows on reveal; id keys lesson.asks
s.phase(name, { about, id })                     // starts a chapter at the next step; about: 1-2 plain sentences; id keys lesson.chapters
s.scale({ count, run, like, from, title, lines, note })   // a scale shot on the next step (engine/scene/scale.mjs; below)
s.beat()                                         // ops after this run after the ops before it, in the same step
s.step(caption, { dur = MOTION.step, t /* sim time, ms */, id, vars, keep })   // commits the step; id and vars: section 10
s.hold(dur, caption)                             // an empty step that just holds the picture
s.rng                                            // seeded RNG (sim/rng.mjs) from params.seed
s.key(name) -> index; s.has(id) -> bool; s.get(id) -> current state record (read-only)
```

**Scale shot** (`s.scale`, `engine/scene/scale.mjs`): the step it is recorded on (lasting at least `SCALE.dur`,
12.5 s) pulls the camera back, in log size, from the `from` entities (default the world) to a field of `count`
machines laid out once round the finished world, each a silhouette of `like` (default `run[0]`) rising as the reveal
box reaches it; the `run` entities count among them. A cheap aggregate picture, not a simulation: nothing in the
field is computed (its LEDs only show busy or idle), so `count`, `title` and `lines` must come from the run or a cited
source, named, and the `note` (default `"shown at scale, simplified"`) is always printed. A bad spec is a `bad-scale`
problem. The sampler emits the field's poses during that step; the director follows its reveal box (7.1).

### 4.3 Compile and sample

```js
import { compile } from "./engine/scene/index.mjs";
const tl = compile(figureModule, { params /* resolved values */, scenario /* id */ });
tl.duration                       // seconds at 1x
tl.steps                          // [{ index, id, t0, t1, dur, caption, layers, phase, simTime, ask, kinds: [op kinds] }] (id, layers: section 10)
tl.phases                         // [{ name, id, step, t0, t1, about, enter? }]
tl.scales                         // [{ step, …the planned field }] one per s.scale, for the director and sampler
tl.world                          // bounds of everything the run shows (the establishing shot)
tl.lesson                         // null | the lesson header (section 10.3)
tl.events                         // [{ t, kind, step }] for scrubber ticks
tl.keys                           // [{ name, index }] legend
tl.counters                       // definitions merged with figure.counters
tl.snapshot(i)                    // state at the start of step i: { entities: Map(id -> record), counters, ... } (used by verify)
tl.final                          // state after the last step
tl.sample(time, view)             // -> Frame (contracts.mjs), view = { pxPerUnit, hover, selected, reducedMotion }
tl.hash                           // stable hash of the script, for determinism checks
tl.problems                       // build-time problems: unknown ids, overflowing containers, overlaps (see verify)
```

`sample` must be pure and fast (no allocation storms; reuse arrays), exact when scrubbing backward, and stable when called twice with the same time.

### 4.4 Narration markup

Captions are plain text with inline marks, rendered by the HUD:
- `{key:fox}` → a chip in fox's identity colour reading `fox`; `{key:fox|the word fox}` custom text.
- `{ref:m2}` → a chip with entity m2's title; hovering it lights m2 in the world; `{ref:m2|mapper 2}`.
- `{tone:fail|crashed}` → a word in a status tone (`ok`, `busy`, `warn`, `fail`, `idle`).
- `{term:pointer}` → a glossary word, underlined; its plain definition from `meta.terms` shows on hover, focus or tap (`{term:pointer|pointers}` custom text).
- `` `hash(k) % R` `` → inline code. `**bold**`.

### 4.5 Motion (choreography)

Implement every transition in `DESIGN.md` section 8: move along traces (lift, port, glide with trail pulse, settle), arc hops elsewhere (parabolic, tilt into travel), reflow, swap, spawn (emerge from source), remove (sink/fade/consumed), value roll (`textOut` + `roll`), flash, LED changes, dim, lit rise, beats and 45 ms sibling stagger, sends with packets (air arcs leave a fading printed trail on the floor), lane diagonals that grow with the packet and persist dimmed, pointer glides, zones that follow their members, LOD fades.

### 4.6 Poses (B → A skin)

`frame.poses` is an array of plain records, one per visible thing, in world units:

```js
{ id, kind, variant,                      // kind: "housing" | "container" | "tile" | "record" | "bit" | "page" | "packet" | "pointer"
                                          //       | "trace" | "bus" | "lane" | "mark" | "zone" | "text" | "bracket" | "playhead" | "field"
  x, y, z, w, d, h, yaw, pitch, roll, scale,
  opacity, lit /* 0..1 */, flash /* 0..1 */, dim /* 0..1 */, hover, selected,
  tone /* "neutral" | "key" | "ok" | "busy" | "warn" | "fail" | "idle" | "ghost" */, key /* index | null */,
  text, sub, textOut, roll /* 0..1 */,
  title, led, meter, tray /* {x, y, w, d} local to the housing centre */,
  points /* [[x,y]…] for trace/bus/lane/bracket */, pulses /* [{s0, s1, key, intensity}] */, grow, style, dashed, arrow /* trace: "end" | "both" | null */,
  t /* lane mark time */, label }
```

Sizes come from `SIZE` (by kind); the scene decides *where* and *what state*, the skin decides *how it looks*.

A scale shot (`s.scale`, `engine/scene/scale.mjs`) emits one pose of kind `field` for the whole field, plus its printed
`text` poses (title and lines, faded in with the reveal):

```js
{ id: null, kind: "field", n /* machines */, xy /* Float64Array [x, y] per machine */,
  state /* 6 numbers per machine: z, led, ledPrev, ledMix, page z, page flash; NaN z = not risen */,
  leds /* the LED tones the led numbers index */, like: { w, d, h, variant } /* the run's housing */,
  page: { dy, w, d, h } /* the piece of input in each tray */, opacity }
```

Division of labour on heights and effects, so the two sides agree:
- The scene places tiles in a housing at `z = SIZE.variant[v].h - SIZE.well.depth` (the well is a real recess), tiles in a floor container at `z = SIZE.plate.h`, loose tiles at 0, and adds hop/lift heights during motion. A `container` pose is the plate itself (x, y, w, d). Index numbers and container labels are emitted by the scene as small `text` poses.
- The skin adds the purely visual offsets: `z += MOTION.litRise * lit`, emission from `flash`, `rim` from `lit`, LED blinking from `time`, key index to colour, tone to colour.
- The housing pose carries `tray` (the well rect, local to the housing centre) and `h`; the skin cuts the well there.

### 4.7 Deliverables

- `engine/scene/index.mjs` exporting `compile`, plus modules for builder, layout, routing, timeline, sampler.
- `node --test` coverage: layout groups, routing, every op's transition endpoints, backward-scrub exactness, determinism.
- `engine/scene/preview.html`: a quick top-down 2D canvas preview that draws poses as rectangles (no renderer needed) with a scrubber, used to judge layout and motion while the renderer is being built.
- `engine/scene/fixtures/mapreduce.mjs`: the reference figure (section 9), written against your builder. It is the acceptance test.

---

## 5. C. HUD (`engine/hud/`)

```js
import { createHud } from "./engine/hud/hud.mjs";
const hud = createHud(rootElement /* the figure's root <div>, the canvas is its first child */, {
  meta, params /* definitions */, values /* current */, scenarios, scenario /* current id */, counters, code,
  theme /* default meta.theme, else "light" */, reducedMotion, hash /* deep links, default true */,
}, {
  onPlay, onPause, onToggle, onContinue, onSeek /* (time, { scrubbing }) */, onStep /* (±1) */, onPhase /* (±1) */, onSpeed /* (x) */,
  onScenario /* (id) */, onParams /* (values) */, onTheme /* (theme) */, onFit, onFullscreen, onRestart,
  onHover /* (cssX, cssY) | null */, onSelect /* (cssX, cssY) */, onRefHover /* (entityId | null) from caption chips */,
  onRefSelect /* (entityId, { x, y }) */, onUnpin, onGesture /* ({ type: "orbit" | "zoom" | "pan" | "focus", dx, dy, scale, x, y }) */,
  onAnswer /* (index, or -1 for skip) */, onStart /* (mode) from the start card */, onIntro /* (open) */,
  onGuided /* (on): pause between chapters */, onFolding /* (on): speed through repeats */, onReducedMotion /* (on) */,
  onLook /* (entityIds | null): light the step's look ids in the world, or stop */,
  onLevel /* ("new" | "basics" | "expert"): the reader changed level; reading pace and holds follow it */,
});
hud.setTimeline(tl)               // steps, phases, events, duration, keys, counters, lesson; called after every (re)compile
hud.update(frame, { time, playing, speed })   // every frame; touch the DOM only when something changed
hud.placeTags(tags)               // [{ id, text, tone, x, y /* css px */, opacity }] every frame
hud.inspect(info | null, { x, y, pinned })    // info = { id, kind, title, state }
hud.setTheme(theme); hud.setValues(values); hud.setScenario(id)
hud.ask(question | null)          // show/hide the predict card
hud.notice(text)                  // e.g. "WebGL is unavailable here"
hud.level                         // the reader's level: "new" | "basics" | "expert" (engine/hud/level.mjs)
hud.policy                        // what that level shows: level.mjs POLICY[level] ({ entry, about, why, look, picture, deeper, pace, holdKey, predict, goal })
hud.setLevel(level)               // also remembered per figure (localStorage); fires onLevel
hud.presenting; hud.present(on)   // presenter mode (also ?present=1, P, Settings): projector type, high contrast, clicker keys
hud.presenterView(open)           // the second window (presenter-view.mjs); false when pop-ups are blocked
hud.destroy()
```

What the reader meets (DESIGN.md section 9): the page opens in the **light** theme unless `meta.theme` or the build
says otherwise; the stories are called **Scenarios** (a strip at the top centre, or a pill and its menu); when the
explain panel is docked, the **Parameters** card under it shows the knobs and the toolbar button opens "Settings"
(playback settings), otherwise the knobs lead the drawer that button opens, then called "Parameters"; the **level switch** (New to this, I know the basics, Expert) sits in the explain
panel's header and on the start card, its default from `meta.level` (`intro` → New, else Basics); a setting
("Letter and number shortcuts") turns the single-key shortcuts off (WCAG 2.1.4); help is a quiet circle in the
bottom-left corner. The explain panel shows each step's lesson layers as the level's policy says
(`engine/hud/layers.mjs`, `chapter-card.mjs`, `progress.mjs`, `lesson.mjs`).

The HUD owns all input on the stage: pointer (hover, click, drag-orbit, wheel/pinch-zoom, double-click to focus), keyboard (DESIGN.md section 9), deep-link hash read/write (`#s=…&t=…&p=…`), reduced-motion detection, fullscreen, resize observation (`onResize` is not needed: the runtime observes the root itself). It applies the CSS custom properties from `tokens.mjs` for the current theme (`applyTheme(root, theme)` exported from `engine/hud/theme.mjs`) and ships `engine/hud/hud.css` (all classes prefixed `ix-`).

Deliverables: `engine/hud/hud.mjs`, `engine/hud/theme.mjs`, `engine/hud/hud.css`, `engine/hud/markup.mjs` (caption markup → DOM, exported for tests), `engine/hud/level.mjs` (levels and their policy), `engine/hud/presenter.mjs` (presenter mode: `presenterVars(theme)`, `presentQuery(search)`, `createPresenter`), `engine/hud/presenter-view.mjs` (the presenter view window), `engine/hud/mock.html` (the full HUD over a placeholder animated canvas, driven by a fake timeline, both themes, desktop and phone).

---

## 6. D. Simulation runtimes (`sim/`)

All of these talk to the world only through the builder `s` (section 4.2). Narration they generate uses the markup in 4.4 and formats numbers with `sim/fmt.mjs`.

```js
import { rng } from "./sim/rng.mjs";            // rng(seed) -> { next, int(a,b), float(a,b), pick, shuffle, chance(p), exp(mean), normal(mu,sd), fork(label) }
import * as fmt from "./sim/fmt.mjs";           // bytes(1400) "1.4 KB", ms(4.1) "4.1 ms", hex(0x7f3a, 4) "0x7f3a", pct, plural, key(name), ref(id), code(text)
import { tracked } from "./sim/tracked.mjs";
const a = tracked.array(s, "a", [5, 2, 9, 1, 7], { in, label: "a", auto: "op" /* each op its own step | "none" */ });
a.get(i); a.set(i, v); a.cmp(i, j) /* -1|0|1, counts and narrates */; a.less(i, j); a.swap(i, j); a.length;
a.pointer("i", 0).to(3); a.mark(from, to, tone); a.values()
tracked.stack(s, id, opts) / tracked.queue(s, id, opts) / tracked.hashtable(s, id, { buckets, hash, probing: "chain" | "linear" })
import { network } from "./sim/actors.mjs";     // deterministic discrete-event simulation
const net = network(s, { nodes: ["n1", …], in /* group */, latency: { mean, jitter }, seed, lanes: { in, length, scale } });
net.on(node | "*", type, (msg, ctx) => { ctx.send(to, type, body); ctx.broadcast(type, body); ctx.timer(name, ms); ctx.cancel(name);
                                         ctx.state; ctx.set({ led, sub, title, state }); ctx.say(markup); ctx.count(name) });
net.onTimer(node | "*", name, (ctx) => …);
net.at(ms, (net) => …); net.crash(node, at); net.recover(node, at); net.partition([[a, b], [c, d, e]], at, until); net.drop(rate);
net.run({ until /* ms */, maxSteps, compress /* idle-time compression */ });   // emits steps with t = sim time
import { race } from "./sim/lockstep.mjs";      // race(s, { quick: function* (s) {…}, merge: function* (s) {…} }) — runs generators in lockstep, one step per yield
import * as machine from "./sim/machine.mjs";   // bit fields, address split, set-associative cache sim (LRU), page-table walk, formatting
```

Deliverables: the modules above with `node --test` coverage (determinism, fault injection, correctness against naive implementations), using a **recording stub** of the builder (`sim/stub.mjs`, exporting `stubScene()` that records every call) so you are not blocked on part B; `references/sim.md` documents each runtime driving the builder.

---

## 7. E. Tooling and director (`scripts/`, `engine/director/`)

### 7.1 Director

```js
import { createDirector } from "./engine/director/director.mjs";
const dir = createDirector({ reducedMotion, timeline });
dir.setTimeline(tl)                                     // after every compile: the shot plan comes from it
dir.update(frame, { width, height, insets /* css px */ }, dt, { settled })  // -> Camera
dir.gesture({ type, dx, dy, scale, x, y, bounds })     // user orbit/zoom/pan/focus; auto resumes after 4 s idle, easing back into the plan
dir.fit(bounds, { instant, hold })                      // frame these bounds now
dir.keep(bounds | null)                                 // keep a box in the free area (an open pick's candidates) until null
dir.auto; dir.camera; dir.state                         // state.plan: [{ at, kind, move }]
```

**The shot plan** (`engine/director/shots.mjs`). With a timeline, `planShots(tl, viewport, framing)` writes keyframes
(a shot the camera moves to from time `at` over `move` seconds) and `cameraAt(plan, time)` is the camera at any
playhead time, so play, scrub, step and capture agree. Per chapter (`tl.phases`): **establish** (the whole world at
its first step, from the chapter's own yaw, held while the entry card reads), **push** (the chapter's stage, the
union of its steps' focus and `look` boxes), **detail** (a `key` step's `layers.look`, close), **pull** (its last
step, back to the world); then **payoff** (the run's last step before any scale shot) and **scale** (a tracking shot
along `tl.scales`' reveal box). Moves are eased, never shorter than `SHOTS.move[0]`; a shot within `SHOTS.rest` of
the current one is not taken. Reduced motion cuts. Authors never call it: chapters, focus and `look` ids drive it.
Without a timeline the director follows `frame.focus` with a dead zone and springs, and establishes at phase changes.
**Keep.** While a pick is open (10.5) the runtime passes the candidates' bounds to `dir.keep()`. When the planned shot
already holds them inside the free area (the viewport minus `insets`, with half the margin) nothing changes; otherwise
the camera springs to a shot of them at the plan's angle (`state.shot` is `"keep"`, never pushed in past 1.25× the
plan's zoom), and eases back into the plan when it is let go. On a phone the open pick card is part of
`insets.bottom`, so the candidates sit in the area above it.
Framing must be exact: project the eight corners of the bounds box with the real perspective (fov, pitch, yaw, aspect) and solve for the distance that fits them inside the margin. Pure, DOM-free, tested in Node.

### 7.2 Scripts (CLI, Node built-ins only, Chrome via CDP like `scripts/snap.mjs`)

| Script | Does |
|---|---|
| `build.mjs <figure.mjs> [--out f.html] [--theme dark]` | one self-contained HTML page (with the `lesson.mjs` beside the figure, mounted as `figure.lesson`): fonts inlined (base64 `@font-face`), `hud.css`, an import map that maps every engine module and the figure to `data:` URLs (relative imports rewritten to bare `@internals/<path>` specifiers), and a boot module that calls `mount()` from `engine/runtime.mjs`. Works from `file://`. Verified: import maps with `data:` URLs work in headless Chrome from file://. |
| `serve.mjs` | dev server (exists); add live reload. |
| `verify.mjs <figure.mjs>` | in Node, the figure loaded with its lesson (`scripts/lib/lesson-load.mjs`): compile every scenario (and param extremes), check determinism (`tl.hash` twice), run `invariants` on every snapshot, report `tl.problems` (lesson problems included), every step has a caption, counters defined, the lesson's coverage, the teaching lint. Every `s.choose` wrong option's branch is compiled at the same settings and checked the same way (plus: `tl.branch` names it, and it replays the main run up to the pick); its findings fold into the run's line ("+ N branches") and its steps count for the lesson's coverage. Exit 1 on any problem. Prints a compact report. |
| `shoot.mjs <page.html> [--at phases\|all\|0,5,9] [--themes dark,light] [--sizes 1440x900,390x844] [--scenario id] [--out dir] [--teach]` | screenshots at chosen steps (mid-step and end-of-step) via `window.__internals`, both themes, both sizes, plus a contact sheet PNG; reports console errors. `--teach` plays live: each predict card (asked, revealed), each pick (`-wrong.png`: a wrong pick's detour held on its consequence; `-right.png`: the right pick and its why) and the end card; every wait times out and is reported, never stalls. |
| `audit.mjs <page.html>` | in the browser via `window.__internals.audit()`: label overflow, tags off-screen or overlapping, focus outside frame, frame time; exit 1 on problems. |
| `record.mjs <page.html> --out x.mp4\|x.webm\|frames/ [--fps 60] [--size 1920x1080] [--scenario id] [--from s] [--to s]` | deterministic frame-by-frame capture via `__internals.renderAt(t)`; encodes with ffmpeg when available (PATH, or `npx -y ffmpeg-static` with the user's consent), otherwise writes PNG frames and prints the ffmpeg command. |
| `new.mjs <dir> [--from mapreduce]` | scaffolds a figure folder (`figure.mjs`, `lesson.mjs`, README) from the templates or an example. |
| `lesson.mjs <figure.mjs> [--scenario id] [--params k=v,…]` | the lesson as text, every layer, then the teaching checks. |
| `review-packet.mjs <figure.mjs> --out <dir>/review/packet [--round N]` / `review-check.mjs <dir>/review --round N` | the teacher pipeline's blind-reader packet and the check of the readers' reports (`references/tooling.md`). |

### 7.3 Page contract (`window.__internals`, provided by `engine/runtime.mjs`)

```js
window.__internals = {
  timeline,                    // current Timeline (steps, phases, duration, lesson)
  scenarios, scenario, values, frame, held,   // held: null | { kind: "chapter" | "key" | "end", … } (a playback pause)
  seek(t), play(), pause(), setSpeed(x) /* redraws, so the HUD shows it */, intro(on),
  setTheme(theme), setScenario(id), chooseScenario(id) /* as a viewer switches: starts at the fork */, setParams(values),
  level, setLevel(level),      // the reader's level: "new" | "basics" | "expert"
  fold, skipped,               // repeat folding: { on, regions, active }
  setCapture(on, { chrome }),  // capture mode: chrome hidden, instant captions and counters
  freeze(on),                  // stop the rAF loop (capture mode)
  renderAt(t, { camera: "auto" | "settled" }) // Promise: sample+render exactly at t (director settled for that frame)
  audit(),                     // -> [{ kind, message, step }]
  stats(),                     // renderer stats ({ ms, drawCalls, …, backend }) plus steps, duration, poses, renders (frames drawn)
  insets, director,            // the HUD's insets (css px) the camera frames around, and director.state (shot, goal, plan)
  profile(),                   // Promise: per-pass GPU timings on WebGPU, else null
};
// mount() returns a Promise of the same object (window.__ready in a built page).
```
Until the runtime exists, write the scripts against this contract and test them on the gallery/mock pages with a small fake `__internals`.

Deliverables: the scripts, `engine/director/director.mjs` with tests, `references/tooling.md`.

---

## 8. Runtime (`engine/runtime.mjs`)

`mount(root, figure, { theme, autoplay, intro })`: `figure` may carry `lesson` (`{ ...figure, lesson }`, section 10); resolve params from the hash and scenario, `compile`, create renderer, HUD, director; one rAF loop: advance playhead → `tl.sample` → `skin` → `director.update` → `renderer.render` → project tags → `hud.update` / `hud.placeTags`; playback holds (chapter ends, key steps at New, the end); hover/pick → inspector; the look ids `onLook` names lit in the world; the reading pace from the level; recompile on params or scenario change (keep the playhead at the same phase); stop when hidden; reduced motion; a notice when no GPU tier starts; `window.__internals`.

**Render on demand.** Frames are drawn while playing, and otherwise only when something changed the picture (an
input, a HUD inset, the camera still easing, `renderer.busy`); a paused, settled figure draws nothing
(`__internals.stats().renders` counts frames). Two clocks: the shimmer clock (`render`'s `time`: film grain, LED
blinks, flowing dashes) runs only while playing, so grain freezes while paused; the render clock (`clock`: afterglows
and pings fading out) runs on every frame drawn. Capture passes the playhead as both.

## 9. The reference figure (acceptance test for B and D)

MapReduce word count, as `engine/scene/fixtures/mapreduce.mjs` (B writes it with the builder; D's actors runtime must be able to express the crash scenario). Layout: a row of five columns: `input` (a `store` housing holding one `page` tile per split), `map` (a column of M `node` housings, trays of records), `shuffle` (a spacer the bus runs through), `reduce` (a column of R `node` housings), `output` (a `store` holding result records). Phases: **Split** (pages appear in the input), **Map** (each split travels to a mapper along its trace; the mapper emits `word · 1` records into its tray, one beat per word, keyed by word), **Shuffle** (each record travels along the bus to reducer `hash(word) % R` with a tag showing the hash; with the combiner on, records of the same word in a mapper first merge into `word · n`), **Reduce** (each reducer sorts its records by key, then merges runs into `word · total`), **Output** (results travel to the output store). Counters: records emitted, bytes shuffled (key length + 4 bytes per record), tasks done. Scenario "Worker dies": a mapper's LED turns `fail` mid-map, its tray dims, the master re-runs its split on another mapper. Invariant: the sum of counts at the end equals the number of words in the input.

---

## 10. Lesson (`engine/scene/lesson.mjs`, `examples/<name>/lesson.mjs`)

The words a figure teaches can live in a `lesson.mjs` beside `figure.mjs`, keyed by stable step ids. The figure owns the truth and passes the values; the lesson owns the words and only formats those values. `record()` merges the lesson into the Script by step id, so the Timeline carries finished, layered text. A figure without a lesson, or a step whose id the lesson does not name, falls back to its inline caption.

### 10.1 What the figure writes

```js
s.step(fallbackCaption, { id: "insert.save-next", vars: { new: { key: 42 }, prevId: "n1", moved: 3 } })
s.phase("Insert", { about, id: "insert" })          // a chapter id: the lesson's chapters are keyed by it
s.ask(question, options, answer, { why, id: "insert.order" })   // an ask id: the lesson's asks are keyed by it
```

A var's kind fixes how a template prints it:

| var value | prints as |
|---|---|
| number | `fmt.num` (`1 234`) |
| string | literal text (also the form for entity ids used in `look`) |
| `{ key: v }` | a key chip `{key:v}` |
| `{ code: s }` | inline code |
| `[a, b, c]` | each item by its kind, joined "a, b and c" |
| `{ path: [a, b, c] }` | each item by its kind, joined "a → b → c" |
| `{ ref: id, text }` | an entity chip `{ref:id\|text}`; in `look`, the id |
| `{ markup: m }` | caption markup as is (a composite item the figure builds, e.g. `{key:fox} = 2`) |

### 10.2 The lesson file

```js
export const lesson = {
  goal, objectives: [{ id, text, stories?: [scenarioId] }],
  misconceptions: [{ id, wrong, fix }],
  picture: { name, rows: [{ id, picture, real, term? }], breaks },
  terms: { [name]: { lead, def } },                  // merged over meta.terms (lesson wins)
  chapters: { [chapterId]: { about?, enter?: { sofar?, now, done, picture? } } },
  steps: { [stepId]: { plain, why?, look?: [id], deeper?: { cost?, how?, code?, edge?, real?, source? },
                       picture?: rowId, key?: true, when?: (vars) => bool, first?: { …same fields } } },
  asks: { [askId]: { question?, why?, options?: [{ text?, feedback?, misconception? }] } },
  choices: { [chooseId]: { prompt?, why?, options?: [{ text?, feedback?, misconception? }], wrong?: { feedback?, misconception? } } },
  checks: { [checkId]: { question?, why?, options?: [{ text?, feedback?, misconception? }], wrong?: { feedback?, misconception? } } },
  next: [{ title, href, why? }],                     // the lessons that follow; the end of the last story names them
};
```

- **Templates** (in every string of `chapters`, `steps` and `asks`): `{name}` prints a var by its kind; `{count:name|noun}` prints "3 items" / "1 item" (`{count:name|child|children}` for an irregular plural; a list counts its length); `{be:name}` prints "is" or "are". Caption markup (`{key:…}`, `{term:…}`, `` `code` ``) passes through. In `look`, `{name}` prints a string or number raw, and a whole entry `"{name}"` whose var is a list expands to one id per item.
- **Story overrides**: a key `x@story` replaces `x` when the scenario id is `story`. It works at every level: a whole chapter or step (`"array@find"`), or one field (`"why@find"`, `"enter@find"`).
- **`first`**: its fields replace the entry's for the first step with that id in the run.
- **`when`**: an entry (or its `first`) whose `when(vars)` is false is skipped. The step falls back to the base entry, then to the inline caption.
- **Asks**: options pair with the figure's options by index. The figure's `answer` decides which option is right. The lesson only replaces the text and adds `feedback` (markup) and a `misconception` id. A check (like a choice) may give `wrong` instead: one entry for every wrong option, for when the figure's options vary with a knob.
- **Objectives** with `stories` are taught only in those stories: `tl.lesson.objectives` keeps the ones for the run's story, so the end card's "You can now…" lists only what that story taught. Without `stories`, an objective belongs to every story.
- **Chapters** have no title here: the figure's phase name stays the title, because scenarios and forks find chapters by it.
- An entry without `plain` (a planned id in a curriculum skeleton: `"map.read": {}`) leaves the step on its inline caption.
- Problems (kind `"lesson"`, in `tl.problems`) cover an unknown var, a `look` id that does not exist at the end of its step, an unknown `picture` row, `deeper` field or misconception id, and an option count that differs from the figure's.

### 10.3 What the HUD reads (the Timeline)

```
tl.lesson = null | {
  goal, objectives: [{ id, text }],
  picture: null | { name, rows: [{ id, picture, real, term? }], breaks },
  terms: { [name]: { lead: string | null, def } },   // meta.terms merged with the lesson's; read definitions here, not meta.terms
  misconceptions: [{ id, wrong, fix }],
  next: [{ title, href, why }],                      // why is markup ("" when absent)
}
tl.steps[i].id     = string | null
tl.steps[i].layers = { plain, why?, look?: [entityId], deeper?: { cost?, how?, code?, edge?, real?, source? }, picture?: rowId, key?: true }
                     // markup with templates resolved; without a lesson entry: { plain: caption }
tl.steps[i].caption = tl.steps[i].layers.plain       // so reading time, folding and older readers see the lesson's words
tl.steps[i].ask    = null | { id, question, options: [string], answer, why?, feedback?: [{ text?, misconception? }] }
                     // feedback[j] belongs to options[j]; present only when the lesson gives some
tl.phases[j].id    = string | null
tl.phases[j].about = the lesson's about when it has one, else the figure's
tl.phases[j].enter = undefined | { sofar?, now, done, picture?: true }   // markup; picture: show the picture map on this card
```

- `look` ids are real entity ids that exist at the end of the step: light them in the world.
- `picture` is a row id of `tl.lesson.picture.rows`.
- Every string except ids is caption markup (section 4.4).
- The same fields are on `tl.script` (`script.lesson`; `script.steps[i]` carries `id`, `vars`, `layers` and `enter`).

### 10.4 Loading

- **Built page**: `scripts/build.mjs` bundles `lesson.mjs` when it sits beside the figure, and mounts `{ ...figure, lesson }`.
- **Node**: `loadFigure(path)` from `scripts/lib/lesson-load.mjs` does the same; `verify.mjs`, `lesson.mjs` and `review-packet.mjs` load figures with it, so the lesson is merged in every run they make. `compile(figure)` reads `figure.lesson`.
- `node scripts/lesson.mjs <figure.mjs> [--scenario id] [--params n=7,at=4]` prints every layer, the chapter cards and the asks with their feedback.

### 10.5 Your turn: in-world picks and the end check

```js
const pick = s.choose(id, { prompt, options: [{ pick: entityId, right?: true, text? }], why? })  // → { index, pick, right }
s.check(id, { question, options: [string], answer, chapter?: chapterId, why?, vars?, transfer?: true })
compile(figure, { params, scenario, choices: { [chooseId]: optionIndex } })   // a branch of the run
```

- **Branches.** `s.choose` records a decision on the next step; exactly one option is right. Without `choices` the run
  plays the right option (the main run). With `choices` it plays that option: the figure plays its consequence for real
  and ends the build there. The runs are identical up to the choose's step. `tl.branch` is `null` for the main run,
  else `{ [chooseId]: optionIndex }` for the wrong options this run plays. An invariant may excuse a branch's broken
  end state with `({ timeline }) => timeline.branch`.
- **The Timeline.** `tl.steps[i].choose = { kind: "choose", id, prompt, options: [{ pick, text, feedback?, misconception? }], answer, chosen, why? }`
  (markup; `chosen` is the option this run plays). `tl.checks = [{ id, question, options, answer, chapter, vars, why?, feedback?, transfer? }]`.
  The lesson's `choices[id]` merges by option index, or `wrong` for every wrong option; `checks[id]` like `asks`.
- **Caps.** One question (`s.ask` or `s.choose`) per chapter and at most 3 per story: more is a `turns` warning in
  `tl.problems`. The HUD keeps 3 / 2 / 1 per story at New / Basics / Expert, picks first (`liveTurns`), and 3 / 2 / 1
  end-check questions (Expert: the `transfer` one; `checksFor`).
- **Runtime and HUD.** The runtime pauses before a choose step (as for `s.ask`) and calls `hud.ask(choose)`. World
  clicks go to `hud.pick(entityId)` first (true: the pick took it). The HUD fires `onCandidates(ids | null)` (light
  them), `onRefHover(id)` (ring one) and `onBranch({ step, choices })`: the runtime compiles that branch, swaps it in and
  plays from the step; `choices: null` swaps the main run back, paused before the step, and asks again. A branch's end
  is the HUD's `{ kind: "turn" }` hold: the transport says "Rewind and try again", and the rewind seeks the branch back
  to the pick before the swap. The end check opens at the main run's end hold.
- **A detour, not another lesson.** While a branch plays, the HUD sees it against the main run it left
  (`detourOf(tl, main)` in `engine/hud/turn.mjs`: the pick's step and time, the main chapter it sits in, the scale both
  share). The progress map keeps the main run's chapters with the reader still in the pick's ("Detour · 3 of 5", the
  current ring dashed, the chapters ahead disabled); the scrubber keeps the main run's chapters and length, its fill
  stopped at the pick, and draws the branch as a dashed line from the pick over the faded track ahead; the counter
  reads the detour's own steps under a "Detour" tag.
- **Framing.** An open pick fires `onPickArea(ids)` (every candidate, at every level; `null` when it closes) and the
  runtime keeps their bounds in view with `director.keep()` (7.1). On a phone the pick card counts in `insets.bottom`.
- **Moving off a pick.** If the main run moves off an open pick (a seek, a chapter jump, an embed's `step`, the run's
  end), the pick card closes; the run asks again when it plays up to the pick. On short roots (`.ix-short`, under
  560 px tall, e.g. an embed frame) an open card speaks alone (caption and readout step aside), tightens, and scrolls
  inside itself if it is still too tall.

## 11. Access and embed (`engine/a11y/`, `engine/embed/`)

```js
import { createScene } from "./engine/a11y/scene.mjs";          // DOM: the described scene + keyboard path
const access = createScene(root, {
  project /* ([x, y, z]) -> [cssX, cssY, depth, onScreen]: renderer.project */,
  onFocus /* (entityId | null): light it (the runtime's hover path) */,
  onOpen  /* (entityId, { x, y }): Enter on it: the runtime offers it to hud.pick, else pins the inspector */,
});
access.update(frame, { tl, time, playing, speed, scrubbing })   // every frame drawn; a new tl (recompile, branch) restarts it
access.focused; access.destroy()

import { outline, describe, changes, stepChanges, lookLine } from "./engine/a11y/describe.mjs";   // DOM-free words
outline(entities)        // [{ id, title, items: [{ id, text, depth }] }]: titled groups as sections, "In flight" for packets
describe(id, entities)   // "map 1, busy, 4 records": name, salient state (role, status, phase, mode, task), a worded sub, light, tray count
stepChanges(tl, i)       // what step i did, from tl.snapshot(i) and tl.snapshot(i + 1) (lost messages from the Script's ops)
lookLine(ids, entities)  // "Look at: reduce 0 and the, 1."

import { attachEmbed, embedConfig, invalid, PROTOCOL } from "./engine/embed/embed.mjs";
const embed = attachEmbed(root, internals /* window.__internals */, { meta });   // chrome, postMessage bridge, deep links
embed.update(frame, { time, duration, held })   // every frame drawn: step / chapter / complete events
embed.answered(step, choice)                     // onAnswer and wrong picks (onBranch with choices); -1 is a skip
import { parseLinks, stripLinks } from "./engine/embed/deeplink.mjs";   // #step-12 #scenario-crash #level-expert
```

- The runtime creates the scene after the HUD (its Esc listener must run after the HUD's) and attaches the embed
  after `window.__internals` exists. Its hooks are the ones above; nothing else in the engine knows about either.
- The scene's DOM sits after `.ix-top` (reading order: header, world, explain panel, dock); the ring and tag sit over
  the tags layer. It owns arrows, Home, End and Enter only while focus is in its list (handled events are skipped by
  the HUD's keyboard handler), and no character keys.
- Messages and statements are the shapes in `references/tooling.md` ("Embedding and deep links"); `version` is 1 and
  changes only with a breaking change.

