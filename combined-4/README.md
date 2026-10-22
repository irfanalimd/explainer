> **Draft, for review only. Don't merge yet.** Screenshots and logs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review). Each change is explained, with before and after screenshots, in its own PR: #14 framing check, #15 frame cost, #16 phone sheets, #17 code panel and landscape accessibility, #18 lesson words.

Combines #14–#18 on top of `main` (`1f93977`, which has round 3). Like round 3, this round adds no features: it works
through round 3's Next lists, the items that needed no decision.

**Merge this one instead of #14–#18.** Once it's in, GitHub marks those five as merged.

## Before and after, on the merged branch

One machine (4 cores, 8 GB, no GPU: Chrome draws WebGL2 on SwiftShader), `main` and this branch measured side by side
in the same session; page timings with no other Chrome running, medians of three unless noted.

| | `main` (1f93977) | this branch |
|---|---|---|
| **Live play, MapReduce, 1440×900 / 390×844** | 2.24 / 7.10 fps | **2.47 / 10.28 fps** |
| Live play, Raft, 1440×900 / 390×844 (one run) | 2.44 / 7.51 fps | 2.29 / 7.89 fps |
| A full frame, MapReduce, 1440×900 / 390×844 | 1.75 / 1.66 s | 1.61 / 1.40 s |
| Time to first frame, 1440×900 / 390×844 (median of 7) | 3.39 / 2.54 s | 3.34 / 2.61 s |
| MapReduce page | 1.13 MB | 1.14 MB |
| **`check --full`, MapReduce, end to end** | 70.3 min, "Ready for review" | **63.7 min, "Ready for review"** |
| its shots and teaching cards (264) | 55.2 min | 44.9 min |
| Framing in verify (camera's shot plan every 0.1 s, both sizes) | not checked | **checked**: 0 s out of frame on all 8 examples |
| `audit --a11y`, MapReduce, with the code and parameters panels opened | 8 problems (main's audit never opened them, so it said 0) | **0** |
| Code panel contrast findings, phone, light / dark | 56 / 56 | 0 / 0 |
| Parameters drawer / code panel on an 844×390 landscape phone | 44 px, header only / not shown | 294 px / about 246 px |
| a11y findings behind an open phone sheet (settings) | 4–5 | 0 |
| Raft at 7 servers: a server sends the client back to itself | yes | never |
| Raft captions over 18 words at its maxima | 8 | 5 |
| `verify.mjs`, all 8 examples | 211 runs, 0 failing | 211 runs, 0 failing |
| Unit tests | 332 / 332 | **342 / 342** |
| HUD browser suite | 275 / 275 | 278 / 278 |
| `audit --a11y --at phases`, both themes, MapReduce and Raft | 0 problems | 0 problems |

## What's in it

**The five branches, merged in this order:** framing check (#14), phone sheets (#16), lesson words (#18), frame cost
(#15), code panel and landscape accessibility (#17). Nothing conflicted. Two pairs touch the same files and were
checked together:

- **#16 and #18 both edit Raft's words at its maxima.** #16 shortens the captions; #18 fixes the run underneath them
  (a leader that stepped down still named itself), which changes one step's timing. Merged, Raft has 5 captions over
  18 words, the same as #16 alone. At its default settings the only change to Raft's words is the start card's
  hook: "Five servers…" is now "A few servers…", because the hook showed at every server count.
- **#16 and #17 both edit `engine/hud/hud.css` for phones.** #16 hides the caption and dock under a covering sheet;
  #17 gives the parameters drawer and the code panel room on a landscape phone. The HUD suite (278 checks, #16's
  three new ones included) and `audit --a11y` with #17's panel frames pass on the merged page.

**Known costs, stated in their PRs:**
- #15: the first frame on a phone came about 0.35 s later in its own measurements. Merged and measured seven times against `main`, the first frame is 3.34 s against 3.39 s at 1440×900 and 2.61 s against 2.54 s on a phone, inside the run-to-run spread (2.18–2.80 s on `main` alone).
- #15: 3 of 28 teaching cards come out framed a little differently from `main`'s. Frames are cheaper, so the
  camera gets more of them in the 1.4 s before each shot. The cards and their words are the same.

## Checks

- `verify.mjs`: all 8 examples, 211 runs, 0 failing, now including the framing sweep ([log](verify-after.txt)).
- Unit tests: 342 / 342 ([log](tests-after.txt)). HUD browser suite: 278 / 278 ([log](hud-suite-after.txt)).
- `audit --a11y --at phases --themes light,dark` with the panels opened: MapReduce and Raft, 0 problems; the only
  warnings are frame time ([MapReduce](audit-a11y-mapreduce.txt), [Raft](audit-a11y-raft.txt)).
- `audit --at phases`, MapReduce and Raft, both sizes: 0 problems (MapReduce: 2 frame-time warnings).
- `check --full` on MapReduce: "Ready for review" on both, 264 shots and 104 teaching cards, the audit over every step, 0 page errors. Both ran side by side at load 6 to 9 from other jobs on the machine.
- **Not verified:** a real GPU and the WebGPU tier (its canvas is blank in headless screenshots here), a real phone,
  a real screen reader.

## Next, ranked

Each needs a decision, so none is in this round:

1. **The phone's tallest caption** (264 px, 31 % of the screen) on a chapter's first step: hide the why behind its
   chip there, or hold the peek back (#16).
2. **Shoot each teaching card once the camera is at rest:** repeatable cards, but different from `main`'s (#15).
3. **Split Raft's "Copying the log" and "Re-election" at 7 servers:** both run over 150 s at 1× (#16, #18).
4. **Remove the camera's pull-out overshoot** (2–5 px past the dock before settling): it changes every figure's
   frames (#14).
5. **Let verify try the free-text knobs**, so lesson entries only typed input reaches stop showing as unreached (#18).
6. **The phone's first-frame cost** of #15's shadow loops: a fixed-bound loop or a separate draft shader (#15).
7. The code sheet cuts comments at the right edge with no sign that it scrolls (#17).

The full lists are in each PR.
