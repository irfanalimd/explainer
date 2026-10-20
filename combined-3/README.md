> **Draft, for review only. Don't merge yet.** Screenshots and logs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review). Each change is explained, with before and after screenshots, in its own PR: #9 accuracy, #10 HUD and design, #11 page speed, #12 tooling speed.

Combines #9 (accuracy), #10 (HUD and design), #11 (page speed) and #12 (tooling speed) on top of `main` (`8ccff12`).
This pass adds no features: it makes what exists faster, more accurate, leaner and more polished.

**Merge this one instead of #9–#12.** Once it's in, GitHub marks those four as merged.

## Before and after, on the merged branch

One machine (4 cores, 8 GB, no GPU: Chrome draws WebGL2 on SwiftShader), `main` and this branch measured side by side
in the same session. Page timings had no other Chrome running; medians of three unless noted.

| | `main` (8ccff12) | this branch |
|---|---|---|
| **Live play, MapReduce, 1440×900** | 0.89 fps | **2.28 fps** |
| **Live play, MapReduce, 390×844** | 2.04 fps | **7.46 fps** |
| Live play, Raft, 1440×900 / 390×844 (one run) | 0.96 / 1.92 fps | 2.51 / 7.09 fps |
| A full frame, 1440×900 (unchanged: still frames are never drafts) | 1.56 s | 1.63 s |
| **MapReduce page size** | 1.83 MB | **1.13 MB** |
| Raft page size | 1.89 MB | 1.16 MB |
| Time to first frame, 1440×900 / 390×844 | 3.78 / 2.79 s | 3.73 / 2.48 s |
| Handout pictures, MapReduce | 26.6 s | 21.6 s (JPEGs byte-identical) |
| `shoot --scenario all --teach`, the same page, `main`'s tools vs this branch's | 68.4 min | 68.2 min |
| **`check --full`, MapReduce, end to end** | 74.4 min, "Needs work" (focus outside the frame) | **59.2 min, "Ready for review"** (0 findings) |
| its shots and teaching cards (264, of which 104 cards) | 64.8 min | 45.5 min (live play draws drafts) |
| `check` verdict, MapReduce, quick tier | "Needs work" | **"Passes the quick check"** |
| `audit --at phases`, MapReduce | focus outside the frame at steps 4, 19, 22 (phone) | 0 problems |
| `audit --at phases`, Raft | 3 label overflows, focus outside the frame at steps 1, 2, 29 (1440×900) | 0 problems |
| Focus out of shot (0.1 s sweep, all 8 examples), 390×844 / 1440×900 | 65 s / 310 s | 0 / 0 |
| `audit --a11y --at phases`, light and dark, MapReduce and Raft | 0 problems | 0 problems |
| HUD share of the viewport, 1440×900 / 390×844 (MapReduce) | 40.5 % / 44.3 % | 39.2 % / 43.4 % |
| `verify.mjs`, all 8 examples | 159 runs, 0 failing | 211 runs, 0 failing |
| Unit tests | 321 / 321 | 332 / 332 |
| HUD browser suite (`engine/hud/test.html`) | throws at line 355, reports nothing | 275 pass, 0 fail |
| Event loop lesson lines printing raw markup | 55 | 0 |

## What's in it

**1. The four branches, merged in this order:** accuracy (#9), HUD and design (#10), page speed (#11), tooling speed
(#12). Fixes that landed on a branch after its first merge (Raft's tiles and the Event loop chips on #9; the HUD suite,
the phone question and the presenter view's label on #10; the draft scale on #11) are merged again from their branch,
so every commit of #9–#12 is in this one.

| Merge | Conflicts | How they were resolved |
|---|---|---|
| HUD and design (#10) onto accuracy (#9) | `references/roadmap.md` | Both edited "Camera and frame" and "Done (recent)". Kept #10's re-measured desktop and phone items and #9's removal of the four "Timeline and narration" gaps it closed, with both branches' entries under Done. |
| Tooling speed (#12) onto page speed (#11) | `references/tooling.md` Known gaps | Both rewrote the first item. Kept #12's account of where the teaching pass spends its time, then #11's live-play numbers for drafts. |

No code conflicted. The accuracy branch's framing reads whatever `hud.insets` reports, and the HUD branch makes the
insets smaller, so the framing was re-checked after merging: `audit --at phases` on MapReduce and Raft, both sizes,
0 problems.

**2. Checked together, not just apart.** The HUD browser suite only runs with #10's repair, and #9 added three checks
to it, so those three ran for the first time on the merged branch (275 / 275). The unit test count is the sum: 321 on
`main`, +7 from #9, +4 from #11.

## Checks

- `verify.mjs`: all 8 examples, 211 runs, 0 failing. Raft has 3 warn-level advisories at its maxima (7 servers),
  true at those settings, as its README says.
- Unit tests: 332 / 332.
- HUD browser suite: 275 / 275.
- `audit --a11y --at phases --themes light,dark`: MapReduce and Raft, 0 problems. The only warnings are frame time
  (see #11: audit's frame time is the CPU time of one frame and does not measure what makes play slow here).
- `check --full` on MapReduce: "Ready for review": 34 runs and 11 branch runs, 264 shots and 104 teaching cards, the audit over every step (436 frames), 0 findings, 0 page errors. On `main` the same run says "Needs work". Both sides ran at the same time, at load 4 to 8 from other jobs on the machine.
- Frozen screenshots unchanged by the speed work: #11 and #12 each paired their PNGs against `main` (details there).
- **Not verified:** a real GPU, and the WebGPU tier. Chrome's WebGPU on SwiftShader starts and passes its self-test,
  but its canvas is blank in screenshots, on `main` too, so WebGPU and WebGL2 could not be compared. Nothing here
  drafts on a GPU, and every renderer change is mirrored on WebGPU, but that is unchecked.

## Next, ranked

1. **Check the WebGPU tier**, and the draft mirror, on a real GPU and on a software adapter that presents (#11).
2. **A Node-side framing check** in verify or check: audit's two samples per step miss most camera transients (#9).
3. **A narrower docked panel while playing** where it limits the world: MapReduce at 1440×900 would go from 0.88 to
   up to 1.17 px/u (#10).
4. **The teaching pass is bound by fades on a 1/20 s clock**, not by the tools: separating the playhead from the frame
   cap, or a capture mode that settles fades, would cut `shoot --teach` far more than anything in #12, but changes
   behaviour or images, so it needs a decision (#12, #11).
5. A long question that can't fit the docked panel at 1280×720 needs a place to go (#10).
6. A draft scale that adapts to frame time (#11).
7. Report focus under the HUD as a warning; 12 s on phones remain (#9).
8. Cache shadow, contact and bounce maps while nothing moves (#11).

The full lists are in each PR.
