> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/24-visual-defects), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/GOALS.md)), the full list of what was read and found ([defects.md](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/defects.md)) and the check logs. The code diff is under **Files changed**.

## TL;DR

- **Every frame of all 8 examples was read** for defects: both themes at 1440×900 and 390×844, and MapReduce and
  Raft also on a landscape phone (844×390) and at 1280×720. About 1,500 frames.
- **One defect, fixed.** In MapReduce's shuffle, the chip "hash(over) % 2 = 1" sat on reduce 1's header, hiding its
  state ("2 slips") and crowding its title, at 1440×900, 1280×720 and on a landscape phone. It sits in the gap above
  the housing again, where the original pages had it. One line in `engine/scene/sampler.mjs`.
- **Nothing else changes.** Every other frame of every example comes out the same as on `site/build`.
- **One proposal for you:** on a landscape phone the caption leaves the world a thin strip (MapReduce, Raft). That
  needs a layout decision, so it is not changed here.
- Branch **`visual/defects`**, 1 commit on `site/build` (#25 + #26 + #27 on #20's original look). No style changes:
  colours, sizes, materials, lighting and the camera are untouched.

## The one fix: the shuffle's chip

**The problem.** A tile's chip (a step's note, such as the hash that picks a counter) is drawn just above its housing's
back edge, in the gap between machines. `309ae0e` (18 October, after the original pages) kept a housing's own chip off
the housing just behind it, and also moved a *tile's* chip there to just above the tile. A tile in the tray's first
row sits right under the header, so the chip covered the header.

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/before/mapreduce-happy-1440-011-zoom.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/after/mapreduce-happy-1440-011-zoom.png?raw=true) |

The whole frame, and the same step at 1280×720:

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/before/mapreduce-happy-1440-011-mid.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/after/mapreduce-happy-1440-011-mid.png?raw=true) |
| ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/before/mapreduce-happy-1280x720-011-mid.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/after/mapreduce-happy-1280x720-011-mid.png?raw=true) |

**What changed** (`97d66ca`). A tile's chip anchors at its housing's back edge again, as before `309ae0e`: it points at
the tile, so it can sit in the gap. A housing's own chip keeps `309ae0e`'s rule, so it still never hangs over the
machine behind it.

**Against the original look,** at 2× (your screen's density): the original pages, then `site/build`, then this
branch. The chip is back where the original had it; the tiles, colours and labels are the same.

| Original (`9c8b16d`) | `site/build` | This branch |
|---|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/original-2x-mapreduce-011.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/before/mapreduce-2x-011.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/after/mapreduce-2x-011.png?raw=true) |

## Everything else is unchanged

Each example shot again from this branch and paired, frame by frame, against `site/build`'s shots:

| Example | Frames paired | Byte-identical | Differ | Where they differ |
|---|---|---|---|---|
| MapReduce (1440×900, 390×844) | 160 | 152 | 8 | 6 at the fixed chip; 2 by 1/255, nothing visible |
| MapReduce (844×390) | 80 | 74 | 6 | all at the fixed chip |
| MapReduce (1280×720) | 80 | 74 | 6 | all at the fixed chip |
| Raft (1440×900, 390×844, 844×390) | 180 | 180 | 0 | |
| Raft (1280×720) | 60 | 58 | 2 | the explain panel's chapter dots, by 26/255 at most |
| Linked list | 112 | 112 | 0 | |
| Event loop | 104 | 97 | 7 | 2 px of the dock on the phone, by 14/255 at most |
| B+ tree | 136 | 134 | 2 | the Play button's lower edge in the dock |
| Consistent hashing | 120 | 113 | 7 | the dock's Play button and the phone dock, by 60/255 at most |
| Quicksort | 120 | 110 | 10 | by 8/255 at most, nothing visible |
| Virtual memory | 112 | 108 | 4 | the dock's Play button, by 59/255 at most |

The fix only moves chips in the world. Every difference outside MapReduce's chip is in the interface (the dock, the
explain panel's dots), in the same places across examples: the run-to-run noise of two shoots of one build.

## A proposal: the caption on a landscape phone

On an 844×390 landscape phone, the caption (the step line, its why, the peek and the chips) and the dock leave the
world a strip of about 60 px; on MapReduce's first steps it covers the world completely. The original pages were no
better. Fixing it is a layout decision: for example, show only the step line on short screens and fold the why and
the peek behind Explain, or move the caption to a side column in landscape, as the explain panel does on desktop.

![](https://github.com/irfanalimd/explainer/blob/review/24-visual-defects/shots/proposal-landscape-caption.png?raw=true)

## Checks

- verify on all 8 examples: 211 runs, 0 failing ([log](verify-after.txt)).
- Unit tests 369 / 369 ([log](tests-after.txt)). HUD browser suite 278 / 278 ([log](hud-suite-after.txt)).
- `audit --a11y --at phases --themes light,dark`: MapReduce and Raft, 0 problems
  ([MapReduce](audit-a11y-mapreduce.txt), [Raft](audit-a11y-raft.txt)); the only warnings are frame time.
- `audit --at phases`: MapReduce and Raft, 0 problems ([MapReduce](audit-phases-mapreduce.txt),
  [Raft](audit-phases-raft.txt)).
- Every contact sheet read, and every suspicious frame at full size or zoomed; every screenshot here read.
- **Not verified:** a real GPU or a real phone. The no-GPU text board and the handout pictures were not re-shot: the
  board has no chips, and the handout's pictures are frozen captures from the same sampler, so only MapReduce's
  shuffle pictures would show the chip moved, as in the frames above.

## Next

1. **The landscape caption** (above): needs a decision.
2. Linked list on the phone: the whole-memory column is small, so the addresses are hard to read until the camera
   pushes in. Framing, low.
3. Consistent hashing: one ring position label is cut at the frame's edge during a push-in. Low.
