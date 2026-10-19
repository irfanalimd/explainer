# Review: six ways to make Explainer a better product

Each branch improves Explainer from one angle, using `examples/mapreduce` as the test page. Each one is a draft pull
request, and they come in two rounds, each with one combined PR.

| Round | Combined PR | What it holds | State |
|---|---|---|---|
| 1 | [#4](https://github.com/irfanalimd/explainer/pull/4) | learner journey, active learning, world storytelling (#1–#3) | **merged** |
| 2 | [#8](https://github.com/irfanalimd/explainer/pull/8) | author pipeline, share & teach, interface & access (#5–#7) | **draft: merge this one** |

| | Branch | What changes | Pull request |
|---|---|---|---|
| 01 | Learner journey | The page remembers where you stopped. The four stories chain into a course. Every waiting state says what is going on. | [#1](https://github.com/irfanalimd/explainer/pull/1) (merged via #4) |
| 02 | Active learning | More predictions, placed where the obvious answer is wrong. Each story ends with its own check on a new situation. | [#2](https://github.com/irfanalimd/explainer/pull/2) (merged via #4) |
| 04 | World storytelling | Slips you can read, live machine states, the world lighting up what the lesson points at, colour-blind-safe colours. | [#3](https://github.com/irfanalimd/explainer/pull/3) (merged via #4) |
| 05 | Share & teach | Links to an exact moment, a share panel (link, image, embed), a printable handout and teacher guide, presenter notes. | [#5](https://github.com/irfanalimd/explainer/pull/5) |
| 06 | Author pipeline | `doctor`, a one-command `check` with a quality report, errors that point at the line, all unit tests passing. | [#6](https://github.com/irfanalimd/explainer/pull/6) |
| 03 | Interface & access | Screen-reader narration, the world in words without a GPU, accessible contrast and target sizes. | [#7](https://github.com/irfanalimd/explainer/pull/7) |

## How to review one

1. **Open the pull request.** Its description is the write-up: what was wrong, what changed, and before/after
   screenshots for each change.
2. **Open Files changed** for the code.
3. Optional: the folder for that branch here ([01](01-learner-journey/), [02](02-active-learning/),
   [04](04-world-storytelling/)) has the same write-up as `README.md`, the planning notes behind it (`GOALS.md`)
   and the raw check logs.

## Checks (run on each branch's final commit)

| | 01 | 02 | 04 |
|---|---|---|---|
| `verify.mjs`, all 8 examples | 0 failing | 0 failing | 0 failing |
| Unit tests | same 11 failures as `main`, 4 new tests pass | same 11 as `main` | same 11 as `main` |
| Full screenshot run | 232 shots, no errors | 232 shots, no errors | 186 shots; some teaching cards missing* |

The 11 failing unit tests fail on `main` too ([list](00-baseline/unit-test-failures.txt)).

\* The screenshot tool timed out on the teaching cards on the slow test machine, as it did on `main`. Branches 01
and 02 each include a fix for that; 04 doesn't, so its run misses the same cards `main`'s did.

## If you merge them

Merge [#8](https://github.com/irfanalimd/explainer/pull/8), not #5–#7 separately: it resolves where they overlap with
each other and with what #4 already merged. GitHub then marks #5–#7 as merged too.

---

Every screenshot is a frame of the real page, captured headless on the test machine with the WebGL2 renderer. The
"before" shots in [`00-baseline/`](00-baseline/shots/) come from `main` at `9c8b16d`. This branch holds review
material only and is never merged.
