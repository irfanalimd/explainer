# Frame cost: goals

Round 4 continues the round-3 pass (faster, more accurate, leaner, more polished; no new features). This branch takes
what #11 left under Next for the cost of a frame without a GPU. MapReduce is the test page, Raft the second.

## Targets (from #11's Next list)

1. **Cache the shadow, contact and bounce maps** while the slabs and bounds are unchanged (camera orbits, hover
   redraws, the full frame drawn again after a draft), skipping those fixed-size passes. Mirror on WebGPU, or show
   the change is WebGL2-only and safe.
2. **A draft scale that adapts to frame time**, as WebGPU's governor does, instead of the fixed 0.75, floored so the
   world's names stay readable (round 3 found 0.5 unreadable at 1440×900).
3. **Draft the frames where only an afterglow or ping is fading**, if they can be told apart from WebGPU's temporal
   convergence (both report `busy`).

## Rules that shape the fixes

- Captured frames must not change: shoot PNGs paired against `main` (MapReduce, all 4 stories, both sizes and themes;
  Raft's first story), and `main` against itself for the machine's own flakiness.
- Determinism: `renderAt(t)` gives the same frame for the same `t`.
- Fallback stays WebGPU, then WebGL2, then the DOM HUD alone.
- A draft may look rougher than a full frame, but the world's names must stay readable while it plays, and the
  frame the picture rests on is always the full one.

## Measured first: where a draft frame's time goes

Live MapReduce at 0.5×, with parts of the frame switched off by the renderer's debug flags (one load each, same
session):

| | 1440×900 | 390×844 |
|---|---|---|
| everything | 1.51 fps | 2.55 fps |
| no floor plane | 3.86 | 7.00 |
| no shadow sampling | 2.74 | 3.42 |
| no slabs | 2.77 | 5.57 |
| no bloom | 2.18 | 2.23 |

The floor plane (a full-screen pass, shaded under every slab too) and shadow sampling (up to 37 taps a pixel) cost
the most. The three maps of target 1 hardly figure: a frame drawn again with all three kept is about 5 % faster. So
two pixel-neutral or draft-only changes were added to the list:

4. **Shade the floor only where no slab covers it** (draw the opaque slabs first, the floor after them with the
   depth test), keeping every sample the same.
5. **A lighter shadow filter in drafts** (4 search and 4 filter taps for 12 and 16). Drafts are never captured.

## How each is measured

| Target | Measure |
|---|---|
| Live play | Frames drawn per second while MapReduce plays at 0.5× (and Raft), 1440×900 and 390×844, `main` and branch alternating, medians of three |
| A full frame | `renderAt` of one moment to pixels on screen, five times |
| Fades | Pause after playing: wall time until the page stops drawing, frames and drafts drawn |
| First frame, handout | As in #11 |
| Nothing captured changed | PNG pairing as above |
