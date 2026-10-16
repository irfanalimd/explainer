# Explainer — design bible ("Prism")

This is the art direction for every figure the skill makes. The engine enforces it; a figure author never touches colour, type, lighting or motion. If something here is ambiguous, the bar is: **would this frame survive in an Apple silicon keynote, a Stripe landing page, or a Bartosz Ciechanowski essay?** If not, it is not done.

## 1. The idea

**Run it, don't draw it.** A figure is a real, deterministic simulation of a CS concept (MapReduce really counts the words, Raft really elects a leader, quicksort really sorts). The simulation records a trace; the engine renders that trace as a small, beautifully lit world of physical-feeling objects that you can play, pause, scrub, rewind, inspect, perturb and export. Every number on screen comes from the run.

The world is literal, not metaphorical: a worker is a worker, a record is a record. What makes it feel premium is the *rendering* of those literal things: precise solids, real light, calm physical motion, a directed camera, and immaculate typography.

## 2. The look in one paragraph

A deep ink-blue studio whose floor rises into a soft indigo-to-teal glow behind the world. On the stage sit slim slate housings with shallow, quiet trays, each carrying a thin luminous **status accent** under its header: green when healthy, blue when busy, amber on a warning, slow-pulsing red when it fails. A crashed node goes dark. The data is the brightest thing on stage: satin tiles in one harmonized vivid palette, inked white or near-black for contrast. Traces are fine inlaid lines that turn into **light tubes** in the data's colour while it flows, then keep a short afterglow. Shadows are tinted, arrivals send a soft ping ring across the surface, and a subtle tilt-shift keeps the focus plane crisp. The camera frames each step but keeps half of the surrounding world in view. One compact glass dock carries the caption, the scrubber and the meters, so the world gets about three quarters of the screen. In the light theme the same world is white ceramic in a cool white studio. (The previous direction, "Lumen", was graphite on near-black with engraved mono titles; it was retired because nothing popped.)

## 3. Principles (the grammar)

1. **Position is structure. Motion is data flow. Colour is identity. Light is attention.**
   - Identity colour (8 keys, `PALETTE.*.keys`) is given to a *thing in the data*: a key, a partition, a thread, a node, a term. It never changes for that thing, across every view and the HUD. Colour is never decoration.
   - Light (emission, bloom, the floor light pool) marks the one or two things the reader should watch this step. Everything else is lit only by the studio.
   - In light theme, attention is elevation plus ink: the watched thing lifts (`MOTION.litRise`) and gets a crisp ink rim.
2. **Time runs left to right** (space-time lanes, Gantt lanes, pipelines) or **top to bottom** (stacks of layers). Never both in one board.
3. **Everything sits on something.** Tiles sit in trays or on the floor; housings stand on the floor; nothing floats except a tile that is mid-flight, and a mid-flight tile casts its shadow on whatever is below.
4. **Every line ends on a port.** Traces leave a housing at a port on its edge and enter one on another. No arrowheads, no leader lines, no labels in the air. Direction is shown by motion (packets, flowing dashes), not by arrowheads.
5. **Words stay on surfaces.** Labels are printed on tile tops or engraved in housing headers and on the floor. The only floating text is a *tag* (a small glass chip) that lives for one step and annotates an event (`hash("fox") % 2 = 1`).
6. **Real data.** Real words, real hex addresses (`0x7f3a_2c10`), real IPs from documentation ranges (`192.0.2.14`), real sizes and latencies. Never "A", "B", "data", "foo".
7. **Small n, then scale.** At most ~12 items per container in the detailed view. Large n belongs in a scale-up plot, not in the world.
8. **One causal chain moves at a time.** If five things change in a step, they move in beats, staggered, so the eye can follow cause to effect.
9. **True numbers only.** The readout, the counters, the captions and the sizes of things come from the run. A caption must never claim something the trace does not contain.

## 4. The stage

- Infinite floor plane, `PALETTE.stage`, lit by a large soft key light whose pool is centred under the scene (`stageLift`) and falls off to `stageEdge` beyond the scene bounds, so the world sits in a studio sweep and the edges of the frame go quiet.
- A dot grid every 16 u (dot radius ≈ 0.6 u) with a slightly stronger dot every 128 u; the grid fades out with distance from the scene so it never reaches the frame edge at full strength.
- Fine film grain (animated, deterministic per frame) and a gentle vignette (`POST`).

## 5. Objects (the vocabulary)

All solids are one primitive: an extruded rounded rectangle with a rounded top edge (a *slab*). Sizes are in `SIZE`.

| Object | Built from | Notes |
|---|---|---|
| **Housing** (node, worker, server, stage, cache, CPU, TLB) | slab `h 16, r 11, bevel 2.2`, matte graphite | A header strip (24 u) carries an engraved title (mono 600, uppercase, tracking 0.08 em) at top-left and a status LED puck at top-right. Below it a recessed **well** (tray) inset 8 u, r 7, darker, with an inner shadow. Tiles sit in the well. Optional engraved sub-label right-aligned in the header (`task 3/5`). |
| Housing kinds | silhouette changes, not colour | `node` rounded rect; `client` more rounded (r 18) and lower (h 12); `store` a disc/puck (database = cylinder) with a round well; `queue` a long low trough (h 10) with a channel well; `chip` square with fine pin ticks printed along its edges (CPU, cache, TLB). |
| **Tile** (cell, token, item) | slab `26×26×5, r 5, bevel 1.3`, ceramic | Label printed in Geist Mono 500. Neutral tiles are graphite ceramic with light ink; keyed tiles take their identity colour on the whole body with dark ink (`keyInk`), like coloured keycaps. |
| **Record** (key/value pair) | slab `54×24×5` | `fox · 1`: key left in key ink, value right in a lighter weight. |
| **Bit** | slab `12×18×3.5` | A row of bits forms a bitfield; fields are printed as floor brackets under the row with their name. 1 = lit ceramic, 0 = ghost. |
| **Page / block** | slab `40×30×4` | Memory pages, disk blocks, SSTables. |
| **Packet** (message in flight) | pill `13×7.5×4.5`, emissive in its key colour (≈ 2.2, blooms) | Lifted 9 u, casts a point light (radius 34 u) that pools on the floor and tints nearby housings. Trails a luminous stretch of the trace behind it (pulse, ≈ 60 u long, fading to zero). |
| **Trace** (link, channel, edge) | floor groove, width 3.2 u | A cut channel: dark core, a 1 px catch-light on its lower lip. Corners are rounded (radius 14). Idle traces are quiet; a trace carrying data glows faintly in the data's colour for the duration of the flight. **Bus** traces (shuffle, broadcast) are 5 u trunks that branches merge into with rounded tees. |
| **Lane** (space-time, Gantt) | floor rail 4 u, raised | One per process; name engraved at its left end on the floor; a ruler of ticks (minor 10 u, major 50 u) under it with time labels in mono. Events are small pucks on the rail. Messages between lanes are grooves that *grow* diagonally from sender (t_send) to receiver (t_recv) behind the packet and stay, quietly, afterward. The playhead is a thin lit line across all lanes. |
| **Zone** (group, rack, data centre, partition) | printed floor region, r 20 | 2.5 % fill, hairline border, title engraved at top-left. A network partition is a zone with a dashed `fail`-toned border. |
| **Pointer** (`i`, `j`, `lo`, `hi`, `head`, `tail`) | thin metal rod 26 u tall with a small flag tile carrying the name | Stands on the floor just in front of the tile it points at; glides between tiles. |
| **Meter** | a 4 u inlay on a housing top | Progress of a task; fills in the housing's identity or `busy` colour. |
| **LED** | puck r 2.8 | `ok` green, `busy` blue, `warn` amber, `fail` red (blinking 1.6 Hz while the node is down), `idle` dim, `off`. Emissive, small light pool. |

## 6. Light and materials

- Key light upper-left-back, soft shadows (shadow map with wide soft filtering) plus a tight contact shadow under every solid so nothing floats by accident. Fill light from the right, a hemisphere ambient.
- Materials (`MATERIAL`): matte (stage, housings), ceramic (tiles: a crisp specular catch-light on the bevel is what makes them read as precise objects), metal (pointer rods), glass (optional lids).
- Point lights: every emissive object with `light` is a real point light (up to 16) that lights the floor and the sides of nearby objects in its colour. This is the single most important "expensive" cue.
- Bloom only from emission. Dark theme: additive bloom. Light theme: a glow is a saturated body with a soft coloured halo on the paper; never a grey haze, never a darkened dark-theme glow.
- Dead or disabled things desaturate and darken (`desaturate`), they do not vanish.

## 7. Typography

- **Geist** for titles, captions and UI. **Geist Mono** for every value, key, address, id, label on a solid, counter and code. Tabular figures everywhere numbers change.
- Housing titles are Geist 600 in bright ink, sentence case (`map 1`, `reduce 0`); addresses and sub-labels are small mono in muted ink.
- Title block (top-left over the canvas, no panel, on a soft top scrim): kicker in mono 11 px uppercase tracking 0.14 em `inkMuted` (`DISTRIBUTED SYSTEMS · FIG 1`), title Geist 26 px 600 tracking −0.02 em, subtitle 14 px `inkMuted`, and the citation of the source paper in 11.5 px.
- Captions: Geist 17/26, max 64 ch, centred above the transport, like film subtitles; inline key chips (identity colour), entity chips (hover lights the entity), inline code in mono.
- On solids: tile labels mono 500 9.5 u; housing titles mono 600 8.5 u uppercase engraved; floor text mono 7–8 u.

## 8. Motion

- Time-based, eased, physical. Default step 0.9 s at 1×; easing `MOTION.ease` (emphasised decelerate). Arcs are parabolic with height `0.32 × distance` clamped to 12–72 u; a hopping tile tilts a few degrees into its direction of travel and levels as it lands.
- Moves along a trace: the tile lifts 8 u from its slot (first ~15 %), runs to the port, glides along the groove with its trail, and settles into its new slot with a small critically damped settle (no bounce).
- Reflow: when a tray gains or loses a tile, its other tiles slide to their new slots in the same beat.
- Enter: rise out of the floor/source (0.45 s) with a brief emission flash. Exit: sink into the floor and fade (0.4 s).
- Value change: odometer roll on the label (old text slides up and fades, new slides in from below, 0.28 s) plus a short flash.
- Beats: a step may have several beats; beat k starts when beat k−1 finishes. Siblings in one beat stagger by 45 ms.
- Camera: critically damped spring (ω 3.0). It reframes only when the focus leaves the central 70 % of the frame or needs a zoom change of more than 22 %; at a phase change it pulls back to an establishing shot. Idle drift ±2.5° of yaw, very slow. User input (drag, wheel, pinch) takes the camera over; auto-direction resumes 4 s after the last input.
- Reduced motion: no drift, no grain animation, transitions become 150 ms crossfades, the camera cuts instead of flying. The figure still steps and responds.

## 9. The HUD (DOM over the canvas)

Frosted glass: background `glass`, `backdrop-filter: blur(18px) saturate(1.4)`, 1 px border `glassBorder`, a 1 px inner top highlight, radius 14 px, shadow `0 10px 40px rgba(0,0,0,.35)` (light: `.08`).

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ MapReduce  Counting words across a cluster                      </> ⚙ ◐ ? ⛶   │
│ (Story 2 of 4 · Worker dies ⌄)  A mapper crashes halfway through its split…   │
│                                                                               │
│                                                                               │
│                          (the world, full bleed)                              │
│                                                                               │
│                                                                               │
│        Mapper w2 emits (fox, 1) → partition hash(fox) % 2 = 1                 │
│                                                                               │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │ Speed 1× │ ◁ ▶ ▷  MAP ━┿━ SHUFFLE  41/118 │ Words mapped 11  Sent 1.4 KB ?│ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Transport**: speed first, on the far left with its name ("Speed 1×", [ ] keys) and a hairline after it, then step back, play/pause, step forward, the scrubber and the step counter. The scrubber is a chapter bar: one segment per phase with its name above it, small event ticks coloured by kind, a hover preview showing that step's caption. Dragging scrubs continuously; the world follows in real time (scrubbing backwards is exact).
- **Stories** (the scenarios): a compact pill under the title, "Story · Worker dies ⌄" (hidden when a figure has one story); the header is just the title and this pill, with the subtitle on the start card. After a switch, the new story's one-line `description` shows once under the pill (a polite status line that fades after about 4 s, without moving the world). It opens a menu of every story, numbered (1–9 pick one from anywhere), each with its description; the current one is checked. A story is the same system told another way, so it belongs with the figure's name, not in the toolbar, where tabs read as a menu bar. At the end of a run the "What if…" invitations carry the other stories, and the next one in order is the suggested one (filled, with an arrow). **Settings** (⚙) opens the knobs drawer: sliders, toggles, text input, seed; changing anything re-runs the simulation instantly and keeps the playhead at the same phase.
- **Meters** ("the numbers"): the dock shows only the 1–3 numbers that tell this story (`primary`), in plain words ("Words mapped", "Sent between machines"), sentence case, never code-like capitals. Pointing at one shows its `hint`, one line on what it means; a click or tap (the ? after them) opens every number with its hint and a sparkline of its history. Numbers count up with tabular figures; compare mode shows two columns racing.
- **Legend**: identity chips for the keys currently in the world, bottom-left, small.
- **Inspector**: hovering any solid shows a glass card with its kind, id and full state in mono (like a debugger hover). Clicking pins it.
- **Code panel** (optional, toggled with C): syntax-highlighted source with the active line lit and current variable values ghosted at line end.
- **Predict**: before a step marked `ask`, playback pauses and the question appears with its options: in the explain panel, in the current step's place, on wide screens (so nothing covers or shrinks the world), otherwise in a glass card above the caption. The answer is revealed by the step itself, and until then nothing on screen gives it away (the step's caption shows "…", its tags and new legend keys wait, the chapter's `about` is withheld).
- **Pauses** (chapter ends, the run's end): no card floats over the world. The transport's primary button reads "Continue: Shuffle ↵" (Enter) in the HUD's one accent (`busy` blue, ink at ≥ 4.5:1 in both themes), with a soft ring that calls three times and then rests as a steady glow (reduced motion: the glow only); a quiet Replay sits beside it for the chapter. At the end the button reads a calm "Replay"; the recap ("✓ Map complete") and, at the end, the takeaway and "What if…" scenario invitations go where the words live (the explain panel, or the caption on narrow screens). The start card asks `meta.hook` over the chapter names; the last step's focus is framed close and large (the payoff).
- **Explain panel** (E): on wide screens (≥ 1200 px) a stationary glass card under the toolbar on the right, and the only place the words live there: the chapter once (`Shuffle  3 of 5`) and its `about` line, the current step's caption in reading type, and the chapter's earlier steps, newest first, with their chips, each a way back. While it is open the bottom caption steps aside and the camera frames the world beside it, never under it. It collapses to a small "Explain" tab (remembered). Narrower screens have an Explain button at the caption's end that opens the chapter and its earlier steps (never the current step a second time) in the caption's place, above the dock.
- **Help** (?): keyboard map.
- Keyboard: Space play/pause, Enter continue, ←/→ step, Shift+←/→ phase, Home/End, [ / ] speed, 1–9 stories, T theme, F fit camera, C code, I inspector pin, R restart, ? help, Esc close.
- Deep links: `#s=crash&t=12.4&p=mappers:4`. The page restores scenario, params and playhead from the hash and writes it back (debounced) as you play.
- Phone (390 px): the title compresses to one line with the story picker under it (no description; the menu carries it), the caption sits above a compact two-row transport (chapter bar, then Speed on the left and Back / Play / Next on the right; Continue keeps its word and its accent), the numbers sit in one row above it, drawers and the numbers list are bottom sheets, the world still fills the screen.

## 10. Accessibility

- Canvas has `role="img"` and an `aria-label` describing the figure; the caption is an `aria-live="polite"` region updated per step (not per frame).
- Every control is a real button/input with a label and a visible focus ring (`outline: 1.5px solid` ink at 60 %, offset 2 px).
- Identity colours are paired with text (keys are printed on the tiles) so colour is never the only cue.
- Reduced motion respected (section 8).
- Without WebGL the HUD still works and the caption track still reads; the stage shows a quiet notice.

## 11. Anti-patterns (rejected on sight)

- Boxes-and-arrows: floating rectangles connected by arrowheads.
- Labels hovering in space with leader lines.
- More than one glowing thing that is not part of the current causal chain.
- Rainbow colour for decoration; colours that change meaning between views.
- Bouncy, cartoon easing; things snapping; the camera cutting while playing (except reduced motion).
- Placeholder data ("A", "B", "foo"); numbers in captions that do not come from the run.
- A crowded frame: if the world needs more than ~60 solids in view at once, split it into boards and let the camera direct.
