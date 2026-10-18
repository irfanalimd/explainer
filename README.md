# Review: three ways to make the MapReduce page a better product

Each branch improves `examples/mapreduce` from one angle. Each one is a **draft pull request**:
nothing is merged into `main`.

> **To merge: use [#4](https://github.com/irfanalimd/explainer/pull/4).** It combines all three below, resolves
> where they overlap, and updates the generator's instructions, so new `/explainer` pages come out the same way.
> #1–#3 stay open for their write-ups and screenshots.

| | Branch | What changes for the reader | Pull request | Size |
|---|---|---|---|---|
| **01** | Learner journey | The page remembers where you stopped. The four stories chain into a course. Every waiting state says what is going on. | [#1](https://github.com/irfanalimd/explainer/pull/1) | +494 / −70, 16 files |
| **02** | Active learning | More predictions, placed where the obvious answer is wrong. Each story ends with its own check on a new situation. The expert notes are corrected. | [#2](https://github.com/irfanalimd/explainer/pull/2) | +482 / −116, 11 files |
| **04** | World storytelling | Slips you can read, machines that show their live state, the 3D world lighting up what the lesson points at, and colour-blind-safe word colours. | [#3](https://github.com/irfanalimd/explainer/pull/3) | +108 / −42, 9 files |

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

Merge [#4](https://github.com/irfanalimd/explainer/pull/4), not the three separately. They overlap in a few files
(`examples/mapreduce/lesson.mjs`, `figure.mjs`, `scripts/shoot.mjs`, `DESIGN.md`, `references/tooling.md`), and #4
already resolves those overlaps.

## Not here yet

Three more branches are still in progress locally and are not pushed: interface & accessibility, sharing &
teaching (links to a moment, a printable handout, presenter notes), and the author pipeline (`doctor`, a
one-command `check`, a quality report).

---

Every screenshot is a frame of the real page, captured headless on the test machine with the WebGL2 renderer. The
"before" shots in [`00-baseline/`](00-baseline/shots/) come from `main` at `9c8b16d`. This branch holds review
material only and is never merged.
