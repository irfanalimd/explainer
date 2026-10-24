> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/23-full-frames-faster), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/23-full-frames-faster/GOALS.md)) and the raw measurements. The code diff is under **Files changed**.

## TL;DR

- **Every frame is byte-identical to #20's.** 160 of 160 frozen MapReduce shots (four stories, both sizes, both
  themes), 24 of 24 for Raft, and a 24-frame live sequence at each of three sizes, camera moves and fades included.
  The handout's 8 JPEGs are byte-identical too.
- **The closing scale shot draws 23 % faster** (12.5 → 9.6 s, 6008 slabs) and **the handout's pictures 15 % faster**
  (24.5 → 20.9 s).
- **Live play does not get faster.** 0.96 → 0.97 frames a second at 1440×900 and 2.23 → 2.26 on a phone are within the
  spread between runs. A full frame's cost is the slabs' and the floor's shading at full resolution with 4× MSAA, and
  no change that keeps every pixel removes it. Faster live play without a GPU needs a decision (Next).
- Branch **`perf/full-frames-faster`**, 4 commits on `fix/render-original-look` (#20, `a1f1f8c`): two of the three
  WebGL2 speed-ups #20 reverted as a precaution, each re-landed with a proof that holds on a real GPU, and two tests
  that keep those proofs true.

## Before and after

Measured on this machine (4 cores, no GPU, Chrome drawing WebGL2 on SwiftShader), with nothing else using Chrome and
#20 and this branch alternating. Medians of three.

| | #20 (`a1f1f8c`) | this branch |
|---|---|---|
| Live play, MapReduce, 1440×900 / 390×844 | 0.96 / 2.23 fps | 0.97 / 2.26 fps |
| Live play, Raft, 1440×900 / 390×844 (one run) | 1.00 / 2.02 fps | 1.00 / 2.04 fps |
| A full frame, MapReduce mid-run, 1440×900 / 390×844 | 1.49 / 1.54 s | 1.47 / 1.47 s |
| **The closing scale shot** (6008 slabs, 1440×900) | 12.5 s, 10.0 M triangles a pass | **9.6 s**, 7.7 M |
| **The handout's 8 pictures** | 24.5 s | **20.9 s**, byte-identical |
| Time to first frame, 1440×900 / 390×844 | 3.17 / 2.27 s | 3.06 / 2.32 s |
| Frozen shots, MapReduce (160) | #20 against itself: 159 identical (one 23-pixel flake in the dock's text) | 160 / 160 byte-identical to #20's second run; the same 159 against its first |
| Frozen shots, Raft "Everything works" (24) | | 24 / 24 byte-identical |
| Live sequence (24 frames, camera "live"), MapReduce 1440×900 at 1×, 390×844 at 2×, Raft 1440×900 at 2× | | 24 / 24 byte-identical at each |
| Unit tests | 332 | 336 |

Where a full frame's time goes at 1440×900 (each pass switched off in turn, median of 5):

| Off | #20 | this branch |
|---|---|---|
| nothing | 1.32 s | 1.29 s |
| the slabs | 0.89 s | 0.88 s |
| the floor | 0.99 s | 0.98 s |
| shadow sampling | 1.11 s | 1.07 s |
| bloom, tilt-shift | within 0.05 s | within 0.05 s |

---

## 1. Draw the floor after the opaque slabs

`4d3a30d` (round 4's 4c76959, re-landed), `engine/gfx/backends/webgl2/renderer.mjs`.

The floor is a large opaque quad drawn with 4× MSAA. It was drawn first, so every pixel ran its lighting, shadow
and contact lookups before the slabs painted over most of them. Now the opaque slabs draw first and the floor after
them with `LEQUAL`, so the depth test skips the floor where a slab covers it.

**Why it is the same on any GPU, not just on SwiftShader.** Both draws are opaque: no blending, depth writes on.
The floor's shader never discards and neither shader writes `gl_FragDepth`, so each fragment's depth is fixed by its
triangle and sample, whatever order the draws run in. Floor first (`LESS` on a cleared buffer), then slabs (`LESS`):
the slab wins a sample exactly when `slab < floor`. Slabs first, then floor (`LEQUAL`): the floor wins exactly when
`floor ≤ slab`, the same split. The winner's colour comes from a shader that does not read the framebuffer, and the
depth left behind is the smaller of the two either way, so what draws after (raised ink, transparent slabs) sees the
same buffer. Early depth rejection is an optimization the GL spec requires to be invisible. MSAA resolves the same
samples. `order.test.mjs` (`ed4035f`) fails if a later change adds a discard or a written depth to these shaders, or
blending or a masked depth to that part of the pass.

What it buys is small mid-run (1.32 → 1.29 s a frame), because the slabs cover little of the screen there.

## 2. Draw only the slab template's solid part for slabs without a well

`f2444e6` (round 3's 905284f, re-landed), `engine/gfx/backends/webgl2/renderer.mjs`.

The slab template ends with a well's rings. A slab without a well drew them anyway in the shadow, main and pick
passes. WebGL2 now draws only the template's solid prefix for those slabs, as the WebGPU tier already does.

**Why it is the same on any GPU.** `pack.mjs` sorts a slab into a "without a well" class exactly when `hasWell` is
false, and then writes its well centre, half size, radius, depth and lip as 0. `SLAB_VERTEX` then places every well
ring at one point (each term is `0 × finite`). The scale shot's machines go through the same `lodOf` and `writeSlab`.
So every triangle past the prefix has three equal vertices, and a zero-area triangle covers no sample on any
conforming rasterizer. `slabmesh.test.mjs` (`2d5fa68`) places those rings as the shader does, in float32, for the
small, large and default templates, and checks each skipped triangle is a point.

This is what makes the scale shot 23 % faster (10.0 M → 7.7 M triangles a pass), and the handout pictures, two of
which are scale shots, 15 % faster. Mid-run frames have 26 slabs and are bound by shading, not triangles.

## 3. Left out

- **The WebGL2 map cache** (round 4's a31b6ca): it was built around the draft tier's two sets of maps, and its
  invalidation (context loss, resize, a quality change) adds risk on a real GPU for about 5 % of a frame.
- **Sorting opaque slabs front to back:** with `LESS`, a depth tie goes to the slab drawn first, so a new order can
  change a tied pixel.
- **Caching the floor ink layer:** it depends on the camera, so it would be redrawn on every frame the camera moves;
  same risk as the map cache.
- **Skipping redraws:** the runtime already draws only while something plays, moves or fades
  (`engine/runtime.mjs`, `tick`), so there were no repeated frames to skip.

## Checks

- Pixel identity as in the table: `pngcmp` (RGBA compare after decoding) on every frozen shot and live frame; the
  live sequence is `measurements/liveseq.mjs`.
- `verify.mjs` on all 8 examples: 211 runs, 0 failing ([log](verify-after.txt)). Unit tests 336 / 336
  ([log](tests-after.txt)). HUD browser suite 275 / 275 ([log](hud-suite-after.txt)). `audit --a11y --at phases
  --themes light,dark` on MapReduce: 0 problems ([log](audit-a11y-after.txt)).
- Every screenshot was read; a live frame on the phone at 2× and Raft at 2×:

| Phone, live, 2× | Raft, live, 2× |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/23-full-frames-faster/shots/live-branch-390-2x.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/23-full-frames-faster/shots/live-branch-raft-2x.png?raw=true) |

- **Not verified:** a real GPU (none on this machine); the argument above is what carries the two changes there.
  The WebGPU tier is unchanged.

## Next

1. **Faster live play without a GPU needs a decision.** Every pixel-identical option is used up. The remaining levers
   change what a reader sees: the runtime's 1/20 s cap per frame (live play there advances 0.05 s of story per 1 s
   frame, so it plays in slow motion; a bigger step plays at the right speed with fewer frames), or a lighter look
   while playing (what the draft tier was, which looked worse).
2. The WebGL2 map cache, rebuilt without the draft tier and with tests for each way its maps can go stale, if 5 % is
   worth it.
3. The same proof for the WebGPU tier's solid prefix and, if it is ever added there, the floor order.
