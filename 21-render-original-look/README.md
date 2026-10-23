> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/21-render-original-look). The code diff is under **Files changed**.

## TL;DR

The published pages looked worse than the original builds (`9c8b16d`, 18 October) on every machine the owner tried.
This brings the world's tiles back to how they looked there, on top of `main`:

- **The original tile look:** the identity colours in their original order, and slip keys at their original size.
- **Every frame drawn in full again**, with or without a GPU: no more drafts at three quarters of the resolution
  without antialiasing while the page plays.
- **The original WebGL2 slab pass**, as a precaution.

Branch **`fix/render-original-look`**, 4 commits on `main` (`1f93977`). Unit tests 332 / 332, verify 211 runs,
0 failing. The three published pages (MapReduce, Raft, Event loop) are already rebuilt from this branch.

## What was different, and how it was found

The original pages were built from `9c8b16d`: every one of their 81 modules matches it once the build's import
rewriting is set aside. Between that commit and `main`, two forks looked for the cause:

- **A code review** of every drawing change for anything that behaves differently on a real GPU or another browser.
  Every shader in the built page is character-for-character its source (30 of 30), the text atlas never overflows,
  the WebGL2 map cache's key is complete, and every WebGPU change is gated on a software adapter.
- **A live capture** of playing, pausing and the frames after a pause, with the page made to believe it runs on an
  Apple GPU, on WebGL2 and (for the first time on this machine) on WebGPU, read back from the GPU texture.

Neither found a fault in how tiles are drawn on a GPU. What does differ:

| Commit | Change | Seen by |
|---|---|---|
| `12172f4` | The identity colours reordered for colour-blind readers: "over" pink → green, "lazy" cyan → violet, "brown" green → pink, "fox" violet → cyan | everyone |
| `2369359` | Slip keys printed as large as the face allows (9 → up to 11.5 u, weight 500); stage names 11 → 13 u | everyone |
| `57a6135`, `1ca3420` | Frames in motion drawn at 0.75 of the pixel ratio with the low preset's maps and no MSAA or tilt-shift | machines without a working GPU (Linux without GPU acceleration, VMs, remote desktops) |

| Original (`9c8b16d`) | Round 4 | This branch |
|---|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/original-map1.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/round4-map1.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/fix-map1.png?raw=true) |

The same MapReduce moment at 1440×900, 2×:

| Original | `main` | This branch |
|---|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/original-mapreduce.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/main-mapreduce.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/fix-mapreduce.png?raw=true) |

Raft, original and this branch (the wider shot keeps the client in view: round 3's framing fix, kept):

| Original | This branch |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/original-raft.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/21-render-original-look/shots/fix-raft.png?raw=true) |

## The commits

- `4048c94` **Draw every frame in full again, with or without a GPU.** Reverts the draft tier (57a6135, 1ca3420) in
  the runtime, both renderers, `look.mjs`, `select.mjs` and the WebGPU device, and its docs. Live play without a GPU
  goes back to about 0.9 frames a second at 1440×900, but every frame is the full one.
- `98c047d` **Draw the whole slab template on WebGL2 again.** Reverts 905284f. It changed no pixel on the software
  renderer, but nothing confirmed it on a real GPU, and it only sped up the closing scale shot.
- `d6fd4b0` **Print slip keys, header lines and stage names at their original sizes.** Reverts 2369359.
- `a1f1f8c` **Give the identity colours their original order again.** Reverts 12172f4.

Kept: round 3's camera framing, the page-size and handout speed-ups (no effect on pixels), the HUD, accuracy and
lesson fixes, and the headers' live state ("4 slips"), which came from world storytelling, not from these commits.

## Checks

- Unit tests 332 / 332; `verify.mjs` on all 8 examples, 211 runs, 0 failing.
- Built MapReduce, Raft and Event loop from this branch and compared them with the original pages at the same moment,
  at 2×: same tile colours, label sizes, bevels and shadows.
- **Not verified:** a real GPU (none on this machine); the colour-blind readability that `12172f4` bought is lost.

## Effect on round 4 (#19)

#19 carries round 4's frame-cost commits on top of the draft tier (fade drafts, the draft shadow filter, the
WebGL2 map cache and the floor drawn after the slabs). It needs rebasing onto this branch with those taken out
before it merges.

## Next

1. Colour-blind safety without changing the familiar colours: for example, pattern or label cues on the keys that
   collide, rather than a new order.
2. If faster play without a GPU is wanted again, an opt-in draft mode, off by default.
