# Review: making Explainer a better product

Each branch improves Explainer from one angle, using `examples/mapreduce` as the test page. Each one is a draft pull
request, and they come in rounds, each with one combined PR. Rounds 1 and 2 added features; rounds 3 and 4 add none and
make what exists faster, more accurate, leaner and more polished.

| Round | Combined PR | What it holds | State |
|---|---|---|---|
| 1 | [#4](https://github.com/irfanalimd/explainer/pull/4) | learner journey, active learning, world storytelling (#1–#3) | **merged** |
| 2 | [#8](https://github.com/irfanalimd/explainer/pull/8) | author pipeline, share & teach, interface & access (#5–#7) | **merged** |
| 3 | [#13](https://github.com/irfanalimd/explainer/pull/13) | accuracy, HUD and design, page speed, tooling speed (#9–#12) | **merged** |
| 4 | [#19](https://github.com/irfanalimd/explainer/pull/19) | framing check, phone sheets, code panel and landscape accessibility, lesson words (#14, #16–#18) | **merged** (via #34) |
| 5 | [#34](https://github.com/irfanalimd/explainer/pull/34) | the original tile look (#20), sources, writing and example rewrites (#21–#25), smooth motion and faster full frames (#26, #27), reader passes and the visual defect pass (#28–#30): what the live site is built from | **merged** |
| 6 | [#35](https://github.com/irfanalimd/explainer/pull/35) | guiding the reader's eye: a ring on the next thing to do, the world's focus on the step, a calmer screen (#31–#33), and MapReduce's lesson in a teacher's voice | **merged** |
| 7 | [#36](https://github.com/irfanalimd/explainer/pull/36) | Raft and the event loop in the same voice, and the writing rules that ask for it | **merged** |
| 8 | [#37](https://github.com/irfanalimd/explainer/pull/37) | the other five lessons in the same voice ([30](30-examples-voice/)) | **merged** |

| | Branch | What changes | Pull request |
|---|---|---|---|
| 01 | Learner journey | The page remembers where you stopped. The four stories chain into a course. Every waiting state says what is going on. | [#1](https://github.com/irfanalimd/explainer/pull/1) (merged via #4) |
| 02 | Active learning | More predictions, placed where the obvious answer is wrong. Each story ends with its own check on a new situation. | [#2](https://github.com/irfanalimd/explainer/pull/2) (merged via #4) |
| 04 | World storytelling | Slips you can read, live machine states, the world lighting up what the lesson points at, colour-blind-safe colours. | [#3](https://github.com/irfanalimd/explainer/pull/3) (merged via #4) |
| 05 | Share & teach | Links to an exact moment, a share panel (link, image, embed), a printable handout and teacher guide, presenter notes. | [#5](https://github.com/irfanalimd/explainer/pull/5) (merged via #8) |
| 06 | Author pipeline | `doctor`, a one-command `check` with a quality report, errors that point at the line, all unit tests passing. | [#6](https://github.com/irfanalimd/explainer/pull/6) (merged via #8) |
| 03 | Interface & access | Screen-reader narration, the world in words without a GPU, accessible contrast and target sizes. | [#7](https://github.com/irfanalimd/explainer/pull/7) (merged via #8) |
| 07 | Accuracy | The camera keeps each step's subject in shot (so `check` passes), verify tries knob extremes together, four roadmap correctness gaps closed, Event loop's raw markup fixed. | [#9](https://github.com/irfanalimd/explainer/pull/9) (merged via #13) |
| 08 | HUD and design | A little more screen for the world, the newest pieces matched to DESIGN.md, the HUD browser suite running again. | [#10](https://github.com/irfanalimd/explainer/pull/10) (merged via #13) |
| 09 | Page speed | Live play without a GPU 2.6× (desktop) to 3.7× (phone) faster, the page 38 % smaller, the handout's pictures 5 s quicker. | [#11](https://github.com/irfanalimd/explainer/pull/11) (merged via #13) |
| 10 | Tooling speed | Chrome's fast PNG encoding, and where the teaching pass really spends its time. | [#12](https://github.com/irfanalimd/explainer/pull/12) (merged via #13) |
| 11 | Framing check | verify sweeps the camera's shot plan every 0.1 s; audit warns when the focus is under the HUD; the report's card gives advice. | [#14](https://github.com/irfanalimd/explainer/pull/14) |
| 12 | Frame cost | Faster live play without a GPU (phone 7.1 → 10.3 fps), a paused page at rest about 3× sooner, captures unchanged. | [#15](https://github.com/irfanalimd/explainer/pull/15) |
| 13 | Phone sheets | The caption and dock hide under a sheet that covers them; Raft's busy steps say each thing once. | [#16](https://github.com/irfanalimd/explainer/pull/16) |
| 14 | Code panel and landscape | Readable code lines (56 contrast findings → 0), usable panels on a landscape phone, an audit that opens them. | [#17](https://github.com/irfanalimd/explainer/pull/17) |
| 15 | Lesson words | A Raft leader bug behind a contradiction, counts that follow the run, every unreached lesson entry explained. | [#18](https://github.com/irfanalimd/explainer/pull/18) (merged via #34) |
| 16–19 | Content | Every figure cites its sources, a writing standard and lint, all eight examples rewritten against their sources. | [#21](https://github.com/irfanalimd/explainer/pull/21)–[#25](https://github.com/irfanalimd/explainer/pull/25) (merged via #34) |
| 21 | Original look | The original tile look, every frame drawn in full. | [#20](https://github.com/irfanalimd/explainer/pull/20) (merged via #34) |
| 22–23 | Smooth motion, full frames | The hover pick no longer waits on the GPU; faster full frames, every pixel the same. | [#26](https://github.com/irfanalimd/explainer/pull/26), [#27](https://github.com/irfanalimd/explainer/pull/27) (merged via #34) |
| 24–26 | Visual defects, reader passes | The shuffle chip off reduce 1's header; reader passes on all eight lessons; citation labels that name the document. | [#28](https://github.com/irfanalimd/explainer/pull/28)–[#30](https://github.com/irfanalimd/explainer/pull/30) (merged via #34) |
| 27 | Next cue | One clear ring on the next thing to do, with an "Up next" line and a Hints switch. | [#32](https://github.com/irfanalimd/explainer/pull/32) |
| 28 | World focus | What the step is about keeps its look and the rest recedes; the words a step names are ringed in the world. | [#33](https://github.com/irfanalimd/explainer/pull/33) |
| 29 | Calm screen | Earlier steps fold, the level is one line, the chrome steps back while the story plays. | [#31](https://github.com/irfanalimd/explainer/pull/31) |
| 30 | Five lessons, new voice | B+ tree, consistent hashing, linked list, quicksort and virtual memory, said as a teacher would say them. | [#37](https://github.com/irfanalimd/explainer/pull/37) |

## How to review one

1. **Open the pull request.** Its description is the write-up: what was wrong, what changed, and before/after
   screenshots for each change.
2. **Open Files changed** for the code.
3. Optional: the folder for that branch here ([01](01-learner-journey/), [02](02-active-learning/),
   [04](04-world-storytelling/), … [07](07-accuracy/), [08](08-hud-design/), [09](09-page-speed/),
   [10](10-tooling-speed/)) has the same write-up as `README.md`, the planning notes behind it (`GOALS.md`) and the
   raw check logs. [`combined-3/`](combined-3/) has round 3's combined write-up.

## Checks (run on each branch's final commit)

| | 01 | 02 | 04 |
|---|---|---|---|
| `verify.mjs`, all 8 examples | 0 failing | 0 failing | 0 failing |
| Unit tests | same 11 failures as `main`, 4 new tests pass | same 11 as `main` | same 11 as `main` |
| Full screenshot run | 232 shots, no errors | 232 shots, no errors | 186 shots; some teaching cards missing* |

The 11 failing unit tests fail on `main` too ([list](00-baseline/unit-test-failures.txt)).

\* The screenshot tool timed out on the teaching cards on the slow test machine, as it did on `main`. Branches 01
and 02 each include a fix for that; 04 doesn't, so its run misses the same cards `main`'s did.

## Round 3 checks (on the combined branch)

| | `main` (8ccff12) | #13 |
|---|---|---|
| `verify.mjs`, all 8 examples | 159 runs, 0 failing | 211 runs, 0 failing |
| Unit tests | 321 / 321 | 332 / 332 |
| HUD browser suite | throws, reports nothing | 275 / 275 |
| `audit --a11y`, MapReduce and Raft, both themes | 0 problems | 0 problems |
| `check`, MapReduce, quick tier | "Needs work" | "Passes the quick check" |
| `check --full`, MapReduce | 74.4 min, "Needs work" | 59.2 min, "Ready for review" |

## Round 4 checks (on the combined branch)

| | `main` (1f93977) | #19 |
|---|---|---|
| `verify.mjs`, all 8 examples (now with the framing sweep) | 211 runs, 0 failing | 211 runs, 0 failing |
| Unit tests | 332 / 332 | 342 / 342 |
| HUD browser suite | 275 / 275 | 278 / 278 |
| `audit --a11y`, with the code and parameters panels opened | 8 problems | 0 problems |
| `check --full`, MapReduce | 70.3 min, "Ready for review" | 63.7 min, "Ready for review" |

## If you merge them

Merge [#19](https://github.com/irfanalimd/explainer/pull/19), not #14–#18 separately. GitHub then marks #14–#18 as merged
too.

---

Every screenshot is a frame of the real page, captured headless on the test machine with the WebGL2 renderer. The
"before" shots in [`00-baseline/`](00-baseline/shots/) come from `main` at `9c8b16d`. This branch holds review
material only and is never merged.
