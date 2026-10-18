# Explainer — design bible ("Prism")

This is the art direction for every figure the skill makes. The engine enforces it; a figure author never touches colour, type, lighting or motion. If something here is ambiguous, the bar is: **would this frame survive in an Apple silicon keynote, a Stripe landing page, or a Bartosz Ciechanowski essay?** If not, it is not done.

## 1. The idea

**Run it, don't draw it.** A figure is a real, deterministic simulation of a CS concept (MapReduce really counts the words, Raft really elects a leader, quicksort really sorts). The simulation records a trace; the engine renders that trace as a small, beautifully lit world of physical-feeling objects that you can play, pause, scrub, rewind, inspect, perturb and export. Every number on screen comes from the run.

The world is literal, not metaphorical: a worker is a worker, a record is a record. What makes it feel premium is the *rendering* of those literal things: precise solids, real light, calm physical motion, a directed camera, and immaculate typography.

## 2. The look in one paragraph

A deep ink-blue studio whose floor rises into a soft indigo-to-teal glow behind the world. On the stage sit slim slate housings with shallow, quiet trays, each carrying a thin luminous **status accent** under its header: green when healthy, blue when busy, amber on a warning, slow-pulsing red when it fails. A crashed node goes dark. The data is the brightest thing on stage: satin tiles in one harmonized vivid palette, inked white or near-black for contrast. Traces are fine inlaid lines that turn into **light tubes** in the data's colour while it flows, then keep a short afterglow. Shadows are tinted, arrivals send a soft ping ring across the surface, and a subtle tilt-shift keeps the focus plane crisp. The camera frames each step but keeps half of the surrounding world in view. One compact glass dock carries the caption, the scrubber and the meters, so the world gets about three quarters of the screen. In the light theme the same world is white ceramic in a cool white studio. (The previous direction, "Lumen", was graphite on near-black with engraved mono titles; it was retired because nothing popped.)

## 3. Principles (the grammar)

1. **Position is structure. Motion is data flow. Colour is identity. Light is attention.**
   - Identity colour (8 keys, `PALETTE.*.keys`) is given to a *thing in the data*: a key, a partition, a thread, a node, a term. It never changes for that thing, across every view and the HUD. Colour is never decoration. The order keeps the first five keys distinct for red-green colour-blind readers (blue, orange, pink, cyan, amber; then green, violet, lime), so a figure with up to five keys never relies on a pair they cannot tell apart.
   - Light (emission, bloom, the floor light pool) marks the one or two things the reader should watch this step. Everything else is lit only by the studio.
   - In light theme, attention is elevation plus ink: the watched thing lifts (`MOTION.litRise`) and gets a crisp ink rim.
2. **Time runs left to right** (space-time lanes, Gantt lanes, pipelines) or **top to bottom** (stacks of layers). Never both in one board.
3. **Everything sits on something.** Tiles sit in trays or on the floor; housings stand on the floor; nothing floats except a tile that is mid-flight, and a mid-flight tile casts its shadow on whatever is below.
4. **Every line ends on a port.** Traces leave a housing at a port on its edge and enter one on another. No clip-art arrowheads, no leader lines, no labels in the air. Direction is shown by motion (packets, flowing dashes); where a still frame must say which way a line points (a pointer, a one-way flow), the trace ends in a small chevron cut into the floor at the receiving port, in the trace's own groove and light (`arrow`). A node that points at itself gets a loop round its own corner.
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
| **Housing** (node, worker, server, stage, cache, CPU, TLB) | slab `h 16, r 11, bevel 2.2`, matte graphite | A header strip (28 u) carries the printed title (Geist 560, 12 u, the author's case: `map 1`) at top-left and a status LED puck at top-right. Below it a recessed **well** (tray) inset 7 u, r 7, darker, with an inner shadow. Tiles sit in the well. Optional sub-label right-aligned in the header, in Geist Mono 400 8.4 u, muted: preferably the housing's live state from the run (`7 slips`, `down`, `empty`), else an address (`192.0.2.11`). The top bevel carries a fine machined catch-light in the dark studio (`MATERIAL.*.edge`). |
| Housing kinds | silhouette changes, not colour | `node` rounded rect; `client` more rounded (r 18) and lower (h 12); `store` a disc/puck (database = cylinder) with a round well; `queue` a long low trough (h 10) with a channel well; `chip` square with fine pin ticks printed along its edges (CPU, cache, TLB). |
| **Tile** (cell, token, item) | slab `26×26×5, r 5, bevel 1.3`, ceramic | Label printed in Geist Mono 500 (a record's value in 400 at 74 %). Neutral tiles are graphite ceramic with light ink; keyed tiles take their identity colour on the whole body with dark ink (`keyInk`), like coloured keycaps: the skin picks whichever of near-black and white contrasts more (WCAG), which is near-black for every identity colour, and small dark labels are dilated and blended in sRGB so they stay at least 4.5:1 in the rendered pixels. |
| **Record** (key/value pair) | slab `54×24×5` | `fox · 1`: key left in key ink, value right in a lighter weight. |
| **Bit** | slab `12×18×3.5` | A row of bits forms a bitfield; fields are printed as floor brackets under the row with their name. 1 = lit ceramic, 0 = ghost. |
| **Page / block** | slab `40×30×4` | Memory pages, disk blocks, SSTables. |
| **Packet** (message in flight) | pill `13×7.5×4.5`, emissive in its key colour (≈ 2.2, blooms) | Lifted 9 u, casts a point light (radius 34 u) that pools on the floor and tints nearby housings. Trails a luminous stretch of the trace behind it (pulse, ≈ 60 u long, fading to zero). |
| **Trace** (link, channel, edge) | floor groove, width 3.2 u | A cut channel: dark core, a 1 px catch-light on its lower lip. Corners are rounded (radius 14). Idle traces are quiet; a trace carrying data glows faintly in the data's colour for the duration of the flight. A keyed trace (a pointer in its target's colour) keeps a faint glow in dark and is inked in its colour on light ceramic; an `arrow` trace ends in an inlaid chevron that lights as something lands through it. Facing ports line up, so neighbours in a row get one straight run. **Bus** traces (shuffle, broadcast) are 5 u trunks that branches merge into with rounded tees. |
| **Lane** (space-time, Gantt) | floor rail 4 u, raised | One per process; name engraved at its left end on the floor; a ruler of ticks (minor 10 u, major 50 u) under it with time labels in mono. Events are small pucks on the rail. Messages between lanes are grooves that *grow* diagonally from sender (t_send) to receiver (t_recv) behind the packet and stay, quietly, afterward. The playhead is a thin lit line across all lanes. |
| **Zone** (group, rack, data centre, partition) | WebGPU: a **glass plinth** (`PRISM2.glass`), r 20, 5 u thick. WebGL2: a printed floor region | A titled, solid zone (a stage: Map, Reduce) becomes a slab of clear glass; what stands in it rises onto its top (easing up over 14 u at the edge, so a tile gliding in rises smoothly) and its title is etched into the glass at top-left. The floor, its grooves and the pulses in them stay visible through it (section 6). WebGL2 and every other zone keep the printed region: 2.5 % fill, hairline border, the title printed at top-left in Geist 500 11 u, sentence case, muted (`Map`). A network partition is a zone with a dashed `fail`-toned border and is never glass. |
| **Pointer** (`i`, `j`, `lo`, `hi`, `head`, `tail`) | thin metal rod 26 u tall with a small flag tile carrying the name | Stands on the floor just in front of the tile it points at; glides between tiles. |
| **Meter** | a 4 u inlay on a housing top | Progress of a task; fills in the housing's identity or `busy` colour. |
| **LED** | puck r 2.8 | `ok` green, `busy` blue, `warn` amber, `fail` red (blinking 1.6 Hz while the node is down), `idle` dim, `off`. Emissive, small light pool. |

## 6. Light and materials

- Key light upper-left-back, soft shadows (shadow map with wide soft filtering) plus a tight contact shadow under every solid so nothing floats by accident. Fill light from the right, a hemisphere ambient.
- Materials (`MATERIAL`): matte (stage, housings: satin anodised, with a fine machined catch-light along the top bevel in the dark studio), ceramic (tiles: a crisp specular catch-light on the bevel and a satin top gradient, `GLOW.satin`, are what make them read as precise objects), metal (pointer rods), glass (zones on WebGPU).
- **Glass** (WebGPU, `PRISM2.glass`, `backends/webgpu/wgsl/glass.mjs`). Drawn after the opaque world has resolved: the opaque solids lay their depth down again, then the glass reads the resolved world behind it. Refraction is exact for the floor (ior 1.5: the bent ray meets z = 0 elsewhere than the straight one, so grooves and arrows shift at the edge and lens round the bevel), with a fine frost (a 9-tap disc, 1.1 px) and absorption toward a cool tint along the path inside (the sides are seen lengthwise, so they hold more tint). On top: Fresnel (F0 0.04) of the studio, kept to a whisper on the broad top in dark and none on white so the glass stays clear, and full on the bevel and sides; the world's floor mirror image raised to the glass top; a crisp catch-light along the top bevel (the line that makes it read as glass); contact shadows of what stands on it; the etched title (light frost in dark, a grey print on white). Restraint is the rule: the top never veils the floor; the edge does the talking. Cost at 1440p: about +0.6 ms on the frame span (6.6 → 7.2 ms on an M-series Mac); about 1.5 ms when its pass is timed alone, which overstates it.
- Point lights: every emissive object with `light` is a real point light (up to 16) that lights the floor and the sides of nearby objects in its colour. This is the single most important "expensive" cue.
- Bloom only from emission. Dark theme: additive bloom. Light theme: a glow is a saturated body with a soft coloured halo on the paper; never a grey haze, never a darkened dark-theme glow.
- Dead or disabled things desaturate and darken (`desaturate`), they do not vanish.

## 7. Typography

- The world and the HUD are one product: one family. **Geist** names things (housing titles, zone, lane and bracket labels, captions, UI); **Geist Mono** prints only data (keys, values, addresses, ids, code, world tags). HUD counters use Geist with tabular figures. Tabular figures everywhere numbers change.
- World type is `WORLD_TYPE` (tokens), rendered through the SDF atlas from the same embedded faces as the HUD (Geist is variable, so any weight there loads from the one file). No tracked uppercase anywhere in the world; zone and lane names are sentence case (`Map`, `Reduce`), titles keep the author's case (`map 1`).
- Ink is mixed in sRGB on every surface, as a print (and the browser's text) would, so light-on-dark labels keep their real weight instead of swelling bold; small dark ink is dilated only a hair (≤ 0.07 of the field). Far, minified text keeps its weight (the edge never softens past a fifth of the field). On white ceramic, muted floor print is set in ink at 78 % so it holds at a distance.
- The HUD's type scale (title, captions, panel) is in section 9.1: five sizes, 12 to 28 px, sentence case, no tracked uppercase.
- Captions: max 60 ch, centred above the transport like film subtitles on wide screens, left-aligned in layers on narrow ones; inline key chips (identity colour), entity chips (hover lights the entity), inline code in mono.
- The world scale (u): housing title Geist 560 12; zone label Geist 560 13, in ink; lane label Geist 500 8; header sub-label Geist Mono 400 8.4; tile key Geist Mono 500 9.5 (value 400); a record's key and value as large as its face allows, 9 to 11.5 (`SIZE.record.fill`), so a slip's word fills it like a keycap's legend; floor data Geist Mono 400 6–7.

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

The page opens in the **light theme**, always: whatever the figure, whatever the system preference (`meta.theme` and the build default are "light"); the viewer can switch with the theme button or T, for that visit. The world is the colourful thing; the HUD is not. It is a quiet, typography-led layer in the spirit of a modern audio-tool product page: near-black on white in light, near-white on near-black in dark, flat surfaces, hairlines, pill controls, generous space. Hierarchy comes from type size and weight, never from colour or chrome.

### 9.1 Tokens (`engine/tokens.mjs` `TYPE.scale` and `UI`, applied by `engine/hud/theme.mjs`)

- **Type.** One family, **Geist** (OFL, already embedded by `build.mjs` as a 29 KB latin variable woff2, so it works offline from `file://`); **Geist Mono** only for data: keys, addresses, code, world tags, inspector values. Weights 400 (reading), 500 (labels, controls), 600 (titles). Sentence case everywhere; no uppercase tracked kickers. Tabular figures on every counter, readout and step number. Five sizes:

  | Token | Size / line | Tracking | Use |
  |---|---|---|---|
  | `xs` | 12 / 16 | 0 | labels ("So far", "Earlier", "Goal"), counters' names, meta lines, tooltips |
  | `sm` | 13 / 20 | −0.003 em | UI text, secondary reading text (about, why on narrow screens, deeper fields) |
  | `md` | 15 / 24 | −0.008 em | reading text: the step's plain line and why, the phone caption, card bodies |
  | `lg` | 20 / 28 | −0.016 em | panel titles, the desktop caption, the start card's hook |
  | `xl` | 28 / 34 | −0.024 em | the figure title, the start card title |

- **Greys.** Four inks per theme. `ink` (#0B0B0C / #F5F5F6) for primary text; `ink2` (`--ix-ink-muted`) secondary; `ink3` (`--ix-ink-faint`) the faintest *text*, ≥ 4.5:1 on its surface in both themes; `ink4` for non-text marks only (rails, hollow dots, ticks). `line` and `lineStrong` hairlines; `hover` and `press` washes; `raised` for tracks and inputs; `thumb` for knobs.
- **Colour.** Only identity keys (data) and status tones (`ok`, `warn`, `fail`, …) carry hue in the HUD: key chips, legend swatches, scrubber event ticks, a predict answer's right/wrong, a recap's check. Chrome is never coloured; there is no accent.
- **Surfaces** (`.ix-glass`). One kind: `surface` (white 94 % / near-black 92 %), a 12 px backdrop blur, a 1 px `line` border, radius 16 (`--ix-r-lg`), a very soft shadow. Radii: 8 chips and menu rows, 12 inputs and inner wells, 16 cards and bars, 24 the start card, help and phone sheets, 999 pills. No gradients, glows or inner highlights on chrome.
- **Space.** A 4 px grid: gaps 4/8/12/16/20/24, card padding 20, the 40 px header row, the 64 px dock.
- **Motion.** 150 / 200 / 250 ms, ease-out `cubic-bezier(.16, 1, .3, 1)`; things arrive with opacity plus a 2–4 px translate. No scale pops, no bounce. Reduced motion drops it all.

### 9.2 Controls

- **Primary**: a solid pill in `primary` (ink): Play, Continue, the start card's Play, the suggested next scenario. **Secondary**: a hairline pill (`.ix-pill`, Speed, Step through it yourself, look and why chips). **Quiet**: text alone (Back, Next, Replay, Skip). **Toolbar**: one pill; the controls that matter carry a word (`.ix-tool`: icon + "Code", icon + "Parameters"/"Settings"; phones keep the word and drop the icon), then a hairline and two 32 px icon circles (`.ix-btn`) everyone knows: the theme (a moon in light mode, a sun in dark: it shows where it goes; tooltip and name "Dark mode" / "Light mode") and full screen. No mystery icons.
- **Help** is not in the toolbar: a quiet 32 px circle with a "?" (`.ix-help-fab`) in the bottom-left corner, just above the dock. Phones have no circle: the about card the title opens ends, under a hairline, with a quiet "? How to use this figure" row, and help opens as a bottom sheet (radius 24, header pinned) with the interface in plain words (the keys stay on screens with a keyboard). On a touch screen (no hover, a coarse pointer) the guide speaks in touch words ("tap", "pinch to zoom", "drag to turn") and drops the keys. Embedded (`?embed=1`) it moves to the top-right corner under the toolbar, away from the caption's chips.
- **One way on**: no two controls in view do the same thing. At a pause Next steps aside (Continue is the way on); Play becomes Continue rather than sitting beside it.
- **Segmented controls** (scenarios strip, the level switch): a `raised` track, the current item on a `thumb` that slides.
- **Tooltips** are the one inverted surface: `primary` background, `on-primary` text, 12 px, radius 8.
- **Focus**: one ring everywhere, 2 px of ink, offset 2 px (`--ix-ring`).

### 9.3 Layout

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ MapReduce ( Scenarios │ Everything works │ One machine crashes … ) ( </> Code ⚙ Settings │ ☾ ⛶ ) │
│                                                              ┌──────────────────────┐ │
│                                                              │ ●─●─◉─○─○  3 of 5  ▯ │ │
│                    (the world, full bleed)                   │ Shuffle              │ │
│                                                              │ Goal  Count every …  │ │
│                                                              │ (New│Basics│Expert)  │ │
│                                                              │──────────────────────│ │
│                                                              │ about · entry card   │ │
│                                                              │ 2  the step, layered │ │
│                                                              │ Earlier …            │ │
│                                                              └──────────────────────┘ │
│                                                              ┌──────────────────────┐ │
│                                                              │ Parameters ⌄   Reset │ │
│                                                              │ Reading machines ━●━ 3│ │
│ (?)                                                          │ Add up repeats    ◯━ │ │
│                                                              └──────────────────────┘ │
│ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│ │ (Speed 1× ⌄) │ ⏮ Back (▶ Play) Next ⏭  Shuffle ━━●━━━━  7 / 24 │ Words read 11 … │ │
│ └───────────────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Header** (one 40 px row): the title (`xl`, a link to the paper with an arrow on hover), the **scenarios** strip centred on the free stage (collapsing to a "Scenario · name ⌄" pill, and on phones to a row of its own), the toolbar pill.
- **Parameters** (the figure's knobs) are never behind an icon. Where the explain panel docks they are a card of their own at the foot of the right column, the panel's width, under it with 12 px between (the panel ends where the card begins): a header ("Parameters" `md` 600 with a chevron that folds it, remembered; "Reset" only once a value differs from the scenario's), then one 40 px row per knob on a shared grid (name `sm` `ink2`, the control, the value `sm` 500 tabular), so every control starts on the same line; the text knob stays one line. It starts open, or folded to its title on a root under 800 px tall so the step keeps its room. The world is framed beside it. Narrower screens: the same rows lead the drawer, which the toolbar's "Parameters" opens (a bottom sheet on phones, scrolling as one piece), with Playback under them; docked, the drawer holds only Playback and the toolbar calls it "Settings".
- **Dock**: Speed (hairline pill) │ Back · Play (solid) · Next │ the chapter scrubber (names in `xs` over a 4 px track, status ticks under it, a 16 px knob) and "7 / 24" │ the 1–3 primary numbers (name in `xs` `ink3`, value in `md` 500 tabular) │ the legend swatches. Narrow screens stack the numbers above the transport.
- **Pauses**: no card floats over the world. The primary pill grows a step (44 px, `md`) and says where it goes: "Continue to Shuffle" with a soft "Enter" key chip inside it (desktop), "Continue" on a phone; a ring calls three times. Next hides while it shows (Back and "Replay" this chapter stay, quiet). The recap ("✓ Map complete") and the end's payoff go where the words live.
- **Predict**: hairline option rows (44 px, a circled letter), the chosen one ringed in ink, then green/red only for right/wrong. After the reveal the reader's own wrong pick answers back with its feedback, then the Why.

### 9.4 The explain panel: the teacher (`explain.mjs`, `layers.mjs`, `level.mjs`, `progress.mjs`, `chapter-card.mjs`)

Wide screens (≥ 1200 px) dock it on the right, `clamp(320px, 25vw, 376px)` wide, under the toolbar and above the dock; the world is framed beside it. It collapses to an "Explain" pill (E).

- **Header**: the progress map (an 8 px dot per chapter on a hairline; filled behind, ringed now, hollow ahead; each a button that jumps), "3 of 5", the chapter (`lg`), the lesson's goal (`sm` `ink2`, with a quiet "Goal" label), and the level switch. A hairline closes it.
- **Body**, top to bottom, sections set apart by 16 px and one hairline (never boxes in boxes): the chapter's about (`sm` `ink2`); the **entry card** on the chapter's first step (So far / **Now** in `md` 500 / You'll know it worked when; labels `xs` `ink3`; the picture map on the card that carries it); the **current step**: its number in a 20 px gutter, the plain line (`md` ink), the why (`md` `ink2`), the picture line, the chips (Look, Why?), then **Go deeper**: a disclosure, a one-line peek ("How  A real mapper buffers… More"), or every field open in a quiet well (label `xs` above text `sm`); then **Earlier** (`sm` `ink3`, two lines each, a way back).
- **Levels** (teaching.md §4; it changes what shows, never the facts):

  | | New to this | I know the basics | Expert |
  |---|---|---|---|
  | goal line | shown | shown | dots only (goal in the current dot's tooltip) |
  | entry card | So far, Now, Done; the run lingers 1.5 s | Now | off |
  | about | full | full | first sentence, More |
  | why | every step that has one | key steps; "Why?" chip elsewhere | "Why?" chip |
  | look | chip, calls twice as the step lands | chip | none (the world still lights) |
  | picture line | on flagged steps | off | off |
  | deeper | Go deeper (closed) | peek, More | open |
  | pace | 1.2× reading time; holds after each key step (Continue) | 1× | 1× |
  | predict | card | card | "Think first": Predict or Skip |

  The default comes from `meta.level` (intro → New, else Basics) and the viewer's choice is remembered per figure. The switch sits in the panel header and on the start card.
- **Look**: the step's `look` entities light in the world for the whole step at every level (the timeline adds them to the step's attention), so the world and the chip always point at the same thing; hover, focus or tap adds the hover ring (tap keeps it).
- **Calm**: while a question is open only the question speaks; `fit()` drops what is left in order so it never scrolls (definitions, about, Earlier, a tighter card); without a question it keeps the current step in view by dropping definitions, the picture line, the entry card's outer lines, then the why.
- **Narrow screens**: no side panel. The caption tells the step in layers, left-aligned (a meta line "Shuffle · step 2 of 11", the Now line on a chapter's first step, the plain line in `md`, the why, the chips); a 32 px Explain circle opens the panel as a sheet above the dock, headed "Chapter 3 of 5 · Shuffle", with the goal, level, about, entry card, this step's deeper layer and the picture.
- **Without a lesson file** the panel still works: the plain layer is the caption, there is no goal line or level switch, everything else is simply absent.

### 9.5 Other pieces

Settings (a 336 px drawer: Playback preferences, including turning off the letter and number shortcuts; on narrower screens the parameters lead it and it is called Parameters), the code panel, the inspector (kind in `xs`, title `md` 600, values in mono), help (the interface in plain words, then the keys), the start card (title, hook in `lg` `ink2`, "How well do you know this?" and the level switch, Play and Step through it yourself), glossary words (a dotted underline; definition in the tooltip and, on first use, in a quiet well under the step; New leads with the plain word: "a reading machine, called a mapper"), world tags (small surfaces with a caret, mono), coach hints, toasts. Phones turn drawers, the readout and the start card into bottom sheets (radius 24).

Keyboard: Space play/pause, Enter continue, ←/→ step, Shift+←/→ chapter, Home/End, [ / ] speed, 1–9 scenarios, S parameters (or settings), T theme, F fit, C code, I inspector, R restart, E explain, L level (cycles), P presenter mode, ? help, Esc close. Single-character keys can be turned off in Settings. Tab reaches the world after the header: ←↑↓→ move to the nearest thing in that direction on screen, Home/End the first and last, Enter shows its details (or picks it in your turn), Esc leaves; the focused thing lights, gets a ring (2 px of ink with a stage-coloured halo, radius 12, 6 px off its projected bounds) and a small inverted tag with its name and an "Enter" key. Deep links: `#s=crash&t=12.4&p=mappers:4`, and the readable `#step-12`, `#scenario-crash`, `#level-expert` (joinable with `&`; consumed on load and on hashchange).

**Embedded** (`?embed=1`, for iframes, sensible from 800×500): no full-screen button, the title one size down (`lg`), a 16 px edge, the help circle top right, and the **one-row dock** (also on any screen under 600 px tall, phones aside): one 56 px row of Play (Continue at a pause), the timeline with its chapter names, the count, and one number (the first primary). Back and Next are the arrow keys (Next returns in step mode); speed, the legend and the other numbers live in the readout and Settings. Everything else is the same figure.

### 9.6 Presenter mode (`presenter.mjs`, `presenter-view.mjs`)

For teaching from a projector: `?present=1`, P, or Settings → Presenting. It changes the look, never the figure.

- **Big type**: every type token steps up one size (xs 15, sm 17, md 22, lg 30, xl 40); the caption is 36 px (40 px with the presenter view open), the explain panel `clamp(400px, 28vw, 560px)`, the dock 84 px with a 56 px primary pill and a 6 px track.
- **High contrast**: inks to black (white in dark), stronger hairlines (16 % / 30 %), opaque surfaces, a 3 px focus ring. Light by default like every page; T still switches.
- **A clicker**: → Page Down and Space go on (from the start card into step 1, through a pause by its Continue, else one step played to its end); ← and Page Up go back; Enter continues. An open question waits for its answer.
- **Minimal chrome**: no speed, legend, code button, help circle or level switch in the panel. The toolbar reads "Presenter view · Parameters │ theme · full screen · ✕ (end presenting)"; the knobs lead the drawer (S), and L cycles the level with a toast.
- **Presenter view**: a second window on the laptop (`window.open` of `about:blank`, written by the page itself, so it works from `file://` with no messages to sync). Header (title, a clock, "End presenter view"), where we are (chapter dots, "Chapter 3 of 5 · Shuffle", "Step 9 of 25", a 2 px progress line), then two columns: **On screen now** (the plain line at 28 px, the why, every deeper field as a hairline list, an open question with its answer marked) and **Next step** (its words, muted; "Next chapter · Reduce" across a chapter's end; the chapter's about under a hairline). The dock: Back, the primary pill, Next; the scenario's name and the level switch. The clicker works in either window. While it is open the projector's panel steps aside and the caption carries the step.

## 10. Accessibility

- Canvas has `role="img"` and an `aria-label` describing the figure; the caption is an `aria-live="polite"` region updated per step (not per frame).
- The figure root is the page's `main` landmark (unless the page has one) and its title an `h1`.
- Every control is a real button/input with a label and a visible focus ring (2 px solid ink, offset 2 px); look chips and progress dots are buttons too.
- HUD text keeps 4.5:1 contrast in both themes (`ink3` is the faintest text). Single-character shortcuts can be turned off in Settings (WCAG 2.1.4).
- Identity colours are paired with text (keys are printed on the tiles) so colour is never the only cue.
- Reduced motion respected (section 8).
- Without WebGL the HUD still works and the caption track still reads; the stage shows a quiet notice.
- **Described scene** (PhET's parallel DOM, `engine/a11y/`): a visually hidden "Scene" section after the header: the step, chapter and the run's numbers; a heading per titled group with a list of its things in words ("map 1, busy, 4 records"; a tray's tiles under it; messages "In flight"); the step's "Look at: …". A second polite live region says what the step changed ("the, 1 moved from map 1 to reduce 0."; at most three sentences, the same change on several things said once), after the caption's own announcement, silent while scrubbing and at 2× and up, never repeating the caption.
- **Keyboard into the world**: the scene's list is one Tab stop with roving focus (keys above); it uses no character keys, so the shortcuts setting is untouched, and the playback keys keep working around it.

## 11. Anti-patterns (rejected on sight)

- Boxes-and-arrows: floating rectangles connected by arrowheads.
- Labels hovering in space with leader lines.
- More than one glowing thing that is not part of the current causal chain.
- Rainbow colour for decoration; colours that change meaning between views.
- Bouncy, cartoon easing; things snapping; the camera cutting while playing (except reduced motion).
- Placeholder data ("A", "B", "foo"); numbers in captions that do not come from the run.
- A crowded frame: if the world needs more than ~60 solids in view at once, split it into boards and let the camera direct.
