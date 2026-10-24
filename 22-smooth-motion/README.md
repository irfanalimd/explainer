> **Draft, for review only. Don't merge yet.** Measurements and tools are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/22-smooth-motion), with the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/22-smooth-motion/GOALS.md)). The code diff is under **Files changed**.

## TL;DR

- **Pointing at the world while it plays no longer stalls each frame on WebGL2** (Safari and Firefox on a Mac,
  everything on Linux). Every tick picks the thing under the pointer, and WebGL2's pick ended in `readPixels`, which
  makes the CPU wait for the GPU to finish everything queued, the previous frame included. The pick is now asked a frame
  ahead and read back from a buffer behind a fence. A hover pick took 16–19 ms of the main thread (median), now
  1.3–1.9 ms. Every answer is the one the synchronous pick gives.
- **A new label's distance field costs about 15 % less**, to the same bytes.
- **No frame looks different.** Frozen captures, a live-camera sequence with the pointer over the world, and the
  hover answers all match #20's build exactly.
- **What this branch did not find:** a step change, the HUD and the rest of a frame cost the same as in the original
  pages (`9c8b16d`) when measured back to back. Outside the world's draw a frame takes under 1 ms. What remains for
  smoothness on a slow GPU is the GPU's own work, which this machine cannot measure; every way to reduce it changes
  pixels, so those are proposals below.
- Branch **`perf/smooth-motion`**, 2 commits on #20 (`a1f1f8c`). Unit tests 333 / 333.

## Before and after

On this machine (4 cores, no GPU, Chrome drawing WebGL2 on SwiftShader), with the page made to believe it runs on an
Apple GPU. SwiftShader takes a second or more for a full frame, so these numbers are the main thread's work, not GPU
time. Medians unless noted.

| | #20 (`a1f1f8c`) | this branch |
|---|---|---|
| **Hover pick while playing, pointer over the world** (720×450, two runs) | 18.6 / 16.3 ms | **1.3 / 1.9 ms** |
| Hover picks answered without waiting on the GPU | 0 | 20 of 20, 23 of 24 |
| A frame outside the world's draw, MapReduce 1440×900 @2× (median / p95 / max) | 0.5 / 0.8 / 19.9 ms | 0.5 / 0.7 / 18.8 ms |
| The same, MapReduce 390×844 @2× | 0.4 / 0.8 / 9.6 ms | 0.5 / 0.7 / 9.1 ms |
| The same, Raft 1440×900 @2× | 0.4 / 0.5 / 6.4 ms | 0.4 / 0.5 / 7.2 ms |
| Frames over 16.7 ms of JS outside the draw, per 10 s (MapReduce 1440×900) | 1 | 1 |
| A step change's frame, mean / p95 (the draw stubbed, two rounds back to back) | 7.5–7.6 / 11.7–12.1 ms | 7.5–7.6 / 12.0–12.6 ms |
| The same on the original pages (`9c8b16d`), same session | 7.0–7.4 / 10.0–11.9 ms | |
| A string's distance field, 280×92 (Node, median of 3) | 3.7 ms | 3.2 ms |
| Unit tests | 332 | 333 |

The world's draw itself (`render()`) is 1.1–2.6 ms of JavaScript a frame here (p95 6.5–7.7 ms). The rest of its time is the
GPU's.

---

## 1. The hover pick no longer waits on the GPU

`664d4f0`. Files: `engine/gfx/backends/webgl2/renderer.mjs`, `engine/gfx/select.mjs`, `engine/runtime.mjs`.

**The problem.** While the pointer rests over the world, every tick asks the renderer what is under it, so a hovered
tile lifts and the inspector follows. On WebGL2 the answer comes from a 1×1 pick pass and `gl.readPixels`, a
synchronous readback: the CPU waits for the GPU to finish every command it has queued, the frame before included. So
with the pointer over the world, CPU and GPU took turns each frame instead of working at the same time, and a frame
took their sum. On this machine a hover pick took 16–19 ms of the main thread for a pass that draws one pixel. The
WebGPU tier picks on the CPU and never had this.

**What changed.**
- After each frame, while the pointer is over the world, the runtime calls `renderer.prepick(x, y)`: the question the
  next tick will ask.
- The renderer draws the same pick pass and reads the pixel into a pixel buffer, then sets a fence. Nothing waits.
- At the next tick, `pick(x, y)` takes that answer when the point, the frame (the renderer's frame count), the canvas
  size and its backing size are all the same as the prepick's and the fence has passed. Otherwise it picks
  synchronously, as before.
- So every answer is the synchronous pick's own: the same frame's slabs, the same camera, the same pixel, the same
  shader.

**Checked.**
- 900 points over three frozen frames: 900 the same, 886 through the prepick.
- A moved point and a new frame both fall back.
- A live-camera sequence with the pointer over the world: 10 frames byte-identical, the same hover answers.
- `__gfx.stats()` counts `picks` and `picksAhead`.

## 2. A new label's distance field, faster to the same bytes

`abb7248`, `engine/gfx/edt.mjs`. A label the run shows for the first time is drawn into a canvas and turned into a
distance field on the CPU, in the frame that first needs it. The transform walked every column with a stride of the
image's width and allocated fresh fields for every string. Now:
- each column is copied into one contiguous line, transformed, and copied back;
- the fields and scratch arrays are kept between strings;
- a line whose values are all equal is left as it is. The transform would return it unchanged: each parabola's own
  centre is its minimum, and `c - c` is exactly 0.

Every value goes through the same operations in the same order. A new test compares the result double for double with
the strided transform as first written, on 6 sizes with flat lines and reused scratch. About 15 % less time per
string.

## What I looked at and left alone

- **The frame loop** (`engine/runtime.mjs` `tick`): one `requestAnimationFrame` at a time, time from rAF timestamps,
  a cap of 1/20 s a frame that only bites below 20 fps, no frame drawn twice in one vsync, none waiting on a promise.
  The camera's springs are closed-form in time, so they move the same at any frame rate.
- **Step changes.** A step change is the most expensive frame outside the draw: about 7.5 ms here, with 4 forced
  layouts and 5–6 style recalculations, mostly the explain panel fitting its card (`explain.mjs` `fit`) and tags
  measuring new text. It costs the same as in the original pages, measured back to back. Batching the HUD's reads and
  writes could save half of it, but the order of those reads decides what the panel and tags show on that frame.
  That needs its own careful pass (Next 3).
- **Allocation:** about 67 KB a frame outside the draw (poses, skin, motion), a minor collection of a millisecond or
  two every few seconds.
- **The HUD each frame:** 0.05 layouts and 0.6 style recalculations a frame between steps.

## Checks

- Frames unchanged ([pairing.txt](pairing.txt)):
  - frozen MapReduce, every story, both sizes and themes, 160 / 160 byte-identical. One shot differed on #20's first
    run only; #20's second run matches this branch exactly.
  - Raft's first story 24 / 24.
  - the live-camera sequence with the pointer over the world 10 / 10.
- `verify.mjs`: all 8 examples, 211 runs, 0 failing ([log](verify-after.txt)). Unit tests 333 / 333
  ([log](tests-after.txt)). HUD browser suite 275 / 275 ([log](hud-suite-after.txt)).
- `audit --a11y --at phases --themes light,dark`: MapReduce and Raft, 0 problems.
- **Not verified:**
  - A real GPU: the stall a sync pick costs there is whatever is left of the previous frame's GPU work, plus a round
    trip to the GPU process. It can't be measured here.
  - WebGPU: unchanged, and it already picks on the CPU.

## Next (each needs a decision or a real GPU)

1. **Measure the GPU on the machines that feel slow.** On WebGPU (Chrome or Safari on a Mac), `__gfx.stats().gpuMs` in
   the console gives the GPU's time per frame. A full frame at 2× draws 4× MSAA, 2048 px shadow and contact maps, 6
   bloom levels and tilt-shift. If it is over 16.7 ms on an integrated GPU, only a lighter preset makes it smooth there,
   and that changes pixels.
2. **The WebGL2 map cache** (#15's `a31b6ca`): it skips the shadow, contact and bounce passes on frames where only the
   camera moves, without changing a pixel, but it was taken out because nothing confirmed it on a real GPU.
3. **One layout per step change:** batch the HUD's reads before its writes (`fit`, `placeTags`, `fitLabels`). About
   half of a step change's 7.5 ms here, with the same final DOM.
4. **Spread new labels over frames** (`TextAtlas.budgetMs`): a frame with several new strings would not stall, but a
   label would appear a frame later, which changes that frame.
