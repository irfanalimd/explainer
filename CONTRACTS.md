# Explainer — architecture and contracts

Read `DESIGN.md` first (the look). This file is the engineering contract between the five parts of the engine. You only need it to change the engine itself; figure authors work from `SKILL.md` and `references/`. Inside a part anything may change, but the interfaces below are fixed: a change to one is a change to every part that uses it.

## 0. Ground rules for every part

- **Zero dependencies.** Plain ES modules (`.mjs`), Node 20+ built-ins only, browser APIs only. No npm installs, no CDNs, no bundlers. Fonts are in `assets/fonts/`.
- **The look lives in `engine/tokens.mjs`.** Never hard-code a colour, size or duration elsewhere; import it. Need a new token? Add it to your own module as a clearly named constant derived from tokens, or add it to `tokens.mjs` if more than one part needs it.
- **`engine/scene/**`, `sim/**` and `engine/director/**` are DOM-free** and must run in Node (verification runs figures headless). Only `engine/gfx/**`, `engine/hud/**` and `engine/runtime.mjs` may touch the DOM or WebGL.
- **Deterministic.** No `Math.random()`, no `Date.now()` in anything that shapes the trace. Randomness comes from `sim/rng.mjs` seeded from params. Rendering may use time for grain and dashes; capture passes an explicit time.
- **Relative imports with the extension** (`import { x } from "./math.mjs"`). The build rewrites them for the single-file page.
- **Tests**: `node --test` files named `*.test.mjs` beside the code. Browser test pages are opened through `node scripts/serve.mjs` (http://127.0.0.1:5173/...). See them with `node scripts/snap.mjs <path-or-url> --out x.png [--size 1440x900] [--eval js]`. **Look at every PNG you make** (use the Read tool on the PNG).
- **Comments**: sparse; a short header per file saying what it is, and a line where the reason is not obvious.
- **Performance budget per frame** (300 entities, 1440×900 at DPR 2 on a laptop): scene sample ≤ 2 ms, skin ≤ 1 ms, render ≤ 6 ms GPU, HUD update ≤ 0.5 ms.

## 1. Data flow

```
figure.mjs ── build(s, params, scenario) ──► Script (entities + steps of ops)        [engine/scene]  B
                                               │ compile
                                               ▼
                                            Timeline ── sample(time, view) ──► Frame { poses, tags, focus, caption, counters … }
                                                                                   │
                       ┌───────────────────────────────────────────────────────────┤
                       ▼                                                           ▼
             skin(poses, theme) ──► DrawList   [engine/gfx/skin]  A        director.frame(frame) ──► Camera   [engine/director]  E
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

```js
import { createRenderer } from "./engine/gfx/renderer.mjs";
const r = createRenderer(canvas, { theme: "dark", quality: "high" /* | "medium" | "low" */, maxDpr: 2 });
r.resize(cssWidth, cssHeight, devicePixelRatio);
r.setTheme("light");
r.render(drawList, camera, { time /* s, for grain, dashes, blinking */, reducedMotion });
r.pick(cssX, cssY)            // -> entity id string | null (slabs only)
r.project([x, y, z])          // -> [cssX, cssY, depth, onScreen]
r.unproject(cssX, cssY, z=0)  // -> [x, y] on the horizontal plane at height z
r.pxPerUnit(at = [x, y, z])   // -> CSS px per world unit at that point (for LOD and tag sizing)
r.stats()                     // -> { ms, drawCalls, instances, lights }
r.ready                       // Promise: fonts loaded, programs compiled
r.lost                        // boolean; r.onLost(fn) for context loss
r.dispose()
```

`DrawList`, `Camera` and every primitive are defined in `engine/contracts.mjs`. World: x right, y toward the viewer, z up. Camera yaw 0 looks from +y toward −y; pitch is degrees above the horizon.

Required quality (see `DESIGN.md` sections 4–6):
- **One slab primitive** for every solid: extruded rounded rectangle with a rounded top edge, built procedurally in the vertex shader from per-instance `w, d, h, r, bevel` so radii never distort; instanced; MSAA. Smooth normals across the bevel; crisp specular catch-light on ceramic bevels.
- **Top-face decals** in the slab shader: `label`, `label2`, `well` (recessed tray with inner shadow), `meter`. Text is SDF (generate per-string SDF bitmaps at runtime from canvas text with an exact Euclidean distance transform, packed into an atlas, LRU-evicted) so it is crisp at every zoom; engraved vs printed styles.
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

Skin turns semantic **poses** (section 4.6) into styled primitives, exactly per `DESIGN.md` section 5: a housing becomes body slab + header engraving + LED puck + well + optional meter; a lane becomes rail groove + ticks + floor texts; a packet becomes an emissive pill with a point light; a pointer becomes rod + flag tile; a bitfield's field brackets become printed floor lines + texts; and so on. Skin is the only place that knows how each kind looks. Keep it pure (no DOM) so it can run in Node for tests.

### 3.3 Deliverables

- `engine/gfx/renderer.mjs` (+ any internal modules), `engine/gfx/skin.mjs`.
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
  theme: "dark",                            // default page theme
};
export const params = {                      // knobs; every one appears in the settings drawer
  mappers:  { label: "Mappers",  type: "int",  min: 1, max: 6, value: 3 },
  reducers: { label: "Reducers", type: "int",  min: 1, max: 4, value: 2 },
  combiner: { label: "Combiner", type: "bool", value: false },
  input:    { label: "Input",    type: "text", value: "the quick brown fox jumps over the lazy dog the fox" },
  seed:     { label: "Seed",     type: "int",  value: 7 },
  // type "float" (min, max, step) and "select" (options: [{value, label}]) also exist
};
export const scenarios = [                   // the stories (story picker under the title); each overrides params
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
s.bits(id, { in, at, width, value, fields: [{ name, from, to, key }] })   // -> { id, cells } bit i = cell(i), msb first
s.pointer(id, { at /* tile id */, text, tone })
s.text(id, { in, at, text, size, tone })                      // floor text
```
Housings act as containers: `in: "m0"` puts a tile in m0's tray. A container lays out its tiles in slots (row-major by default; `stack` piles them up in z; overflow compresses spacing). Tile `key` (any string or number) maps to a stable identity colour (`s.key(name)` returns the index; first-seen order); `tone` overrides with a status tone or `"ghost"`.

**Connections**:
```js
s.trace(id, from, to, { route: "auto" | "straight" | "orth", fromSide, toSide /* "left"|"right"|"top"|"bottom" */, style })
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
s.ask(question, options, answerIndex)            // predict mode: playback pauses before this step
s.phase(name, { about })                         // starts a chapter at the next step; about: 1-2 plain sentences (explain panel)
s.beat()                                         // ops after this run after the ops before it, in the same step
s.step(caption, { dur = MOTION.step, t /* sim time, ms */ })   // commits the step
s.hold(dur, caption)                             // an empty step that just holds the picture
s.rng                                            // seeded RNG (sim/rng.mjs) from params.seed
s.key(name) -> index; s.has(id) -> bool; s.get(id) -> current state record (read-only)
```

### 4.3 Compile and sample

```js
import { compile } from "./engine/scene/index.mjs";
const tl = compile(figureModule, { params /* resolved values */, scenario /* id */ });
tl.duration                       // seconds at 1x
tl.steps                          // [{ index, t0, t1, dur, caption, phase, simTime, ask, kinds: [op kinds] }]
tl.phases                         // [{ name, step, t0, t1 }]
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
- `` `hash(k) % R` `` → inline code. `**bold**`.

### 4.5 Motion (choreography)

Implement every transition in `DESIGN.md` section 8: move along traces (lift, port, glide with trail pulse, settle), arc hops elsewhere (parabolic, tilt into travel), reflow, swap, spawn (emerge from source), remove (sink/fade/consumed), value roll (`textOut` + `roll`), flash, LED changes, dim, lit rise, beats and 45 ms sibling stagger, sends with packets (air arcs leave a fading printed trail on the floor), lane diagonals that grow with the packet and persist dimmed, pointer glides, zones that follow their members, LOD fades.

### 4.6 Poses (B → A skin)

`frame.poses` is an array of plain records, one per visible thing, in world units:

```js
{ id, kind, variant,                      // kind: "housing" | "container" | "tile" | "record" | "bit" | "page" | "packet" | "pointer"
                                          //       | "trace" | "bus" | "lane" | "mark" | "zone" | "text" | "bracket" | "playhead"
  x, y, z, w, d, h, yaw, pitch, roll, scale,
  opacity, lit /* 0..1 */, flash /* 0..1 */, dim /* 0..1 */, hover, selected,
  tone /* "neutral" | "key" | "ok" | "busy" | "warn" | "fail" | "idle" | "ghost" */, key /* index | null */,
  text, sub, textOut, roll /* 0..1 */,
  title, led, meter, tray /* {x, y, w, d} local to the housing centre */,
  points /* [[x,y]…] for trace/bus/lane/bracket */, pulses /* [{s0, s1, key, intensity}] */, grow, style, dashed,
  t /* lane mark time */, label }
```

Sizes come from `SIZE` (by kind); the scene decides *where* and *what state*, the skin decides *how it looks*.

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
  meta, params /* definitions */, values /* current */, scenarios, scenario /* current id */, counters, code, theme,
}, {
  onPlay, onPause, onToggle, onSeek /* (time, { scrubbing }) */, onStep /* (±1) */, onPhase /* (±1) */, onSpeed /* (x) */,
  onScenario /* (id) */, onParams /* (values) */, onTheme /* (theme) */, onFit, onFullscreen, onRestart,
  onHover /* (cssX, cssY) | null */, onSelect /* (cssX, cssY) */, onRefHover /* (entityId | null) from caption chips */,
  onGesture /* ({ type: "orbit" | "zoom" | "pan", dx, dy, scale, x, y }) */, onAnswer /* (index) */,
});
hud.setTimeline(tl)               // steps, phases, events, duration, keys, counters; called after every (re)compile
hud.update(frame, { time, playing, speed })   // every frame; touch the DOM only when something changed
hud.placeTags(tags)               // [{ id, text, tone, x, y /* css px */, opacity }] every frame
hud.inspect(info | null, { x, y, pinned })    // info = { id, kind, title, state }
hud.setTheme(theme); hud.setValues(values); hud.setScenario(id)
hud.ask(question | null)          // show/hide the predict card
hud.notice(text)                  // e.g. "WebGL unavailable"
hud.destroy()
```

The HUD owns all input on the stage: pointer (hover, click, drag-orbit, wheel/pinch-zoom, double-click to focus), keyboard (DESIGN.md section 9), deep-link hash read/write (`#s=…&t=…&p=…`), reduced-motion detection, fullscreen, resize observation (`onResize` is not needed: the runtime observes the root itself). It applies the CSS custom properties from `tokens.mjs` for the current theme (`applyTheme(root, theme)` exported from `engine/hud/theme.mjs`) and ships `engine/hud/hud.css` (all classes prefixed `ix-`).

Deliverables: `engine/hud/hud.mjs`, `engine/hud/theme.mjs`, `engine/hud/hud.css`, `engine/hud/markup.mjs` (caption markup → DOM, exported for tests), `engine/hud/mock.html` (the full HUD over a placeholder animated canvas, driven by a fake timeline, both themes, desktop and phone).

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
const dir = createDirector({ reducedMotion });
dir.update(frame, { width, height /* css px */ }, dt)  // -> Camera; frames frame.focus with dead zone, springs, establishing shot at phase changes, idle drift
dir.gesture({ type, dx, dy, scale, x, y })             // user orbit/zoom/pan; auto resumes after 4 s idle
dir.fit(bounds, { instant })                            // frame these bounds now
dir.auto                                                // boolean
dir.camera                                              // current Camera
```
Framing must be exact: project the eight corners of the bounds box with the real perspective (fov, pitch, yaw, aspect) and solve for the distance that fits them inside the margin. Pure, DOM-free, tested in Node.

### 7.2 Scripts (CLI, Node built-ins only, Chrome via CDP like `scripts/snap.mjs`)

| Script | Does |
|---|---|
| `build.mjs <figure.mjs> [--out f.html] [--theme light]` | one self-contained HTML page: fonts inlined (base64 `@font-face`), `hud.css`, an import map that maps every engine module and the figure to `data:` URLs (relative imports rewritten to bare `@internals/<path>` specifiers), and a boot module that calls `mount()` from `engine/runtime.mjs`. Works from `file://`. Verified: import maps with `data:` URLs work in headless Chrome from file://. |
| `serve.mjs` | dev server (exists); add live reload. |
| `verify.mjs <figure.mjs>` | in Node: compile every scenario (and param extremes), check determinism (`tl.hash` twice), run `invariants` on every snapshot, report `tl.problems`, every step has a caption, counters defined. Exit 1 on any problem. Prints a compact report. |
| `shoot.mjs <page.html> [--at phases\|all\|0,5,9] [--themes dark,light] [--sizes 1440x900,390x844] [--scenario id] [--out dir]` | screenshots at chosen steps (mid-step and end-of-step) via `window.__internals`, both themes, both sizes, plus a contact sheet PNG; reports console errors. |
| `audit.mjs <page.html>` | in the browser via `window.__internals.audit()`: label overflow, tags off-screen or overlapping, focus outside frame, frame time; exit 1 on problems. |
| `record.mjs <page.html> --out x.mp4\|x.webm\|frames/ [--fps 60] [--size 1920x1080] [--scenario id] [--from s] [--to s]` | deterministic frame-by-frame capture via `__internals.renderAt(t)`; encodes with ffmpeg when available (PATH, or `npx -y ffmpeg-static` with the user's consent), otherwise writes PNG frames and prints the ffmpeg command. |
| `new.mjs <dir> [--from mapreduce]` | scaffolds a figure folder from a template or example. |

### 7.3 Page contract (`window.__internals`, provided by `engine/runtime.mjs`)

```js
window.__internals = {
  ready,                       // Promise, resolves after first frame rendered
  timeline,                    // current Timeline (steps, phases, duration)
  seek(t), play(), pause(), setSpeed(x),
  setTheme(theme), setScenario(id), setParams(values),
  freeze(on),                  // stop the rAF loop (capture mode)
  renderAt(t, { camera: "auto" | "settled" }) // Promise: sample+render exactly at t (director settled for that frame)
  audit(),                     // -> [{ kind, message, step }]
  stats(),
};
```
Until the runtime exists, write the scripts against this contract and test them on the gallery/mock pages with a small fake `__internals`.

Deliverables: the scripts, `engine/director/director.mjs` with tests, `references/tooling.md`.

---

## 8. Runtime (`engine/runtime.mjs`)

`mount(root, figure, { theme })`: resolve params from the hash and scenario, `compile`, create renderer, HUD, director; one rAF loop: advance playhead → `tl.sample` → `skin` → `director.update` → `renderer.render` → project tags → `hud.update` / `hud.placeTags`; hover/pick → inspector; recompile on params or scenario change (keep the playhead at the same phase); stop when hidden; reduced motion; WebGL failure notice; `window.__internals`.

## 9. The reference figure (acceptance test for B and D)

MapReduce word count, as `engine/scene/fixtures/mapreduce.mjs` (B writes it with the builder; D's actors runtime must be able to express the crash scenario). Layout: a row of five columns: `input` (a `store` housing holding one `page` tile per split), `map` (a column of M `node` housings, trays of records), `shuffle` (a spacer the bus runs through), `reduce` (a column of R `node` housings), `output` (a `store` holding result records). Phases: **Split** (pages appear in the input), **Map** (each split travels to a mapper along its trace; the mapper emits `word · 1` records into its tray, one beat per word, keyed by word), **Shuffle** (each record travels along the bus to reducer `hash(word) % R` with a tag showing the hash; with the combiner on, records of the same word in a mapper first merge into `word · n`), **Reduce** (each reducer sorts its records by key, then merges runs into `word · total`), **Output** (results travel to the output store). Counters: records emitted, bytes shuffled (key length + 4 bytes per record), tasks done. Scenario "Worker dies": a mapper's LED turns `fail` mid-map, its tray dims, the master re-runs its split on another mapper. Invariant: the sum of counts at the end equals the number of words in the input.
