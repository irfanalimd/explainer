> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/11-framing-check), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/11-framing-check/GOALS.md)) and the check logs. The code diff is under **Files changed**.

## TL;DR

- **verify now checks the camera between shots, in Node, without Chrome.** It plans each story's shots at
  1440×900 and 390×844 and samples them every 0.1 s, and a step whose focus leaves the frame is an error. audit
  looks at two instants per step, which is how MapReduce's framing problem hid for so long.
  - On `main` it finds nothing on all 8 examples.
  - On the tree before round 3 (`8ccff12`) it finds 65 s out of frame on a phone and 311 s at 1440×900, the numbers
    round 3 measured in Chrome.
  - It costs about 6 % of verify's time.
- **Focus under the HUD is a warning now**, in audit (`focus-under-hud`) and in verify (a step held there 0.5 s or
  more). Round 3's "about 12 s on phones" was measured against the camera's framing margin, not the HUD. Against the
  HUD itself, what remains is 0.3 s at one step in two of MapReduce's stories, a pull-out that overshoots the dock by
  2–5 px. That is too short to count and too costly to change, so it is written down, not fixed.
- **The check report's Looks right card says Advice** when the only findings are warnings (frame time), as the other
  cards do. The verdict is unchanged.
- Branch **`polish/framing-check`**, 3 commits on `main` (`1f93977`). Unit tests 332 → 336, verify 0 failing on all
  8 examples.

## Before and after

| | `main` (1f93977) | this branch |
|---|---|---|
| Framing checked in verify | no | the shot plan every 0.1 s, both sizes, every story |
| verify on the tree before round 3 (`8ccff12`), all 8 examples | 0 failing (the problem was invisible to it) | focus out of frame: 65.2 s at 390×844, 310.6 s at 1440×900 |
| verify on all 8 examples now | 211 runs, 0 failing | 211 runs, 0 failing, no new warnings |
| verify time, all 8 examples (median of 3, wall / CPU) | 32.1 s / 45.1 s | 34.0 s / 47.9 s |
| Focus under the HUD, sweep, all 8 examples, 390×844 / 1440×900 | not measured | 0.6 s / 0 s (no step reaches 0.5 s) |
| audit, every step, MapReduce and Raft, both sizes | no such check | 0 `focus-under-hud` |
| `audit --a11y --at phases`, light and dark, MapReduce and Raft | 0 problems | 0 problems |
| Looks right card with only warnings | "Pass", green | "Advice", "2 pieces of advice" |
| Unit tests | 332 / 332 | 336 / 336 |

Per example, verify's median wall / CPU time (`main` → branch; the machine had other load):

| | `main` | this branch |
|---|---|---|
| btree | 2.98 s / 4.59 s | 2.75 s / 4.29 s |
| consistent-hashing | 4.98 s / 6.31 s | 5.01 s / 6.44 s |
| event-loop | 3.93 s / 5.63 s | 4.34 s / 6.49 s |
| linked-list | 2.13 s / 2.72 s | 2.05 s / 2.91 s |
| mapreduce | 5.27 s / 8.12 s | 5.91 s / 9.05 s |
| quicksort | 2.19 s / 2.51 s | 2.52 s / 3.04 s |
| raft | 7.19 s / 9.84 s | 7.40 s / 9.61 s |
| virtual-memory | 3.48 s / 5.43 s | 4.06 s / 6.05 s |

---

## 1. verify sweeps the shot plan

`4c31c71`. Files: `scripts/lib/framing.mjs` (new), `scripts/verify.mjs`, tests, `references/tooling.md`,
CONTRACTS.md, roadmap.

**The problem.** audit renders the middle and the end of each step with the camera settled, so it sees two
instants. A step that starts while the camera is still on the last one, or a detail shot that crops the focus for
part of a step, can pass both. That is how MapReduce's phone framing stayed "Needs work" for so long: a plain audit
said 0, `--at phases` said 5, and round 3's 0.1 s sweep (a script outside the repo) found 65 s over the 8 examples.

**What changed.** `frameSweep(tl, viewport)` plans the run's shots with the director, as the page does, and walks
every step in 0.1 s samples. It projects the step's focus box through the planned camera and applies audit's own
test: more than 2 px outside the viewport. It reads each step's focus from the compiled plan instead of sampling the
timeline, so the sweep itself takes milliseconds. verify runs it on each story's two default runs (desktop and
phone), not on the knob runs or branches:
- focus out of the frame at any sample is an **error** ("the step's focus leaves the frame in the shot plan at
  390x844: steps 4 (1.0 s), …, first "<caption>"");
- focus held under a HUD overlay for 0.5 s or more is a **warning**.

**Why verify, not check.** CONTRACTS.md and the tooling reference describe verify as the Node checks of the run, and
check as verify plus the page in Chrome. The sweep needs only the compiled timeline and the director, and it is
deterministic, so it belongs with the Node checks. An author gets it in seconds in the authoring loop, and check
inherits it.

**The insets.** The plan depends on the HUD's overlays, which Node does not have. I read `__internals.insets` from the
real page at the middle of every step of every story:
- at 1440×900 it is 64 / 384 / 90 / 0 at every step, on MapReduce and on Raft;
- on the phone, the top is 92 and the bottom follows the caption: most often 274 (Raft's median is 274; MapReduce's
  is 298, and its range is 250–430).

`VIEWPORTS` uses 274 for the phone. A taller caption (346) gives the same result: no step out of frame, no step held
under the HUD.

**Does it catch real problems?** On the tree before round 3 it reproduces what round 3 measured in Chrome: 65.2 s out
of frame on the phone (MapReduce 37.7 s, Virtual memory 12.0 s, Consistent hashing 9.8 s, …) and 310.6 s at
1440×900. verify on that tree would have failed MapReduce, Raft and four more. The test fixture's "glitch" story,
which plants a far-away tag for audit's own test, now fails verify too: the plan follows the tag off the step's
focus at steps 9–11. Its unit test and the end-to-end harness now expect that, and the harness's run count is up to
date (28, not 22, since round 3 added the combined extremes).

## 2. Focus under the HUD, as a warning

`45d47f3`. Files: `engine/runtime.mjs` (the runtime's `audit()`), `scripts/shoot.mjs`.

**In audit.** A focus corner inside the viewport but more than 2 px under an overlay (`hud.insets`) is
`focus-under-hud`, at level `warn`. audit lists it under warnings and does not fail on it; shoot lists it as advice,
apart from its problems; check's Looks right card counts it as advice. The every-step audit of MapReduce and Raft at
both sizes finds none: with the camera settled, the framer keeps the focus inside the free area. I also rendered
MapReduce's crash story at seven moments of the step-24 pull-out with the camera following the plan: none, because
on the real page that step's caption is taller (bottom inset 302, not the sweep's 274) and the camera frames against
it. So no page on `main` shows this warning, and I have not seen it fire in a real page; its test is the
focus-outside test beside it, with the insets' edges in place of the viewport's.

**Where round 3's 12 s went.** That number measured the focus against the framing region, which keeps a margin
inside the HUD, so it counted focus that was close to the HUD, not under it. Against the HUD itself, the sweep finds
0.6 s on phones over all 8 examples, and 0 at 1440×900. All of it is in MapReduce's crash and straggler stories, 0.3 s
each at step 24, where the camera pulls out from reduce 0 to the output. The far edge of the focus passes the dock's
edge by 2–5 px (y 572–575 against 570) for three samples, then settles 8 px inside. Taking that out means changing
the curve of every camera move, which would change every figure's frames, so it is not cheap: it is written down
in the roadmap. A step has to stay under the HUD 0.5 s to count, so this passes.

## 3. Advice on the Looks right card

`e363161`, `scripts/lib/report.mjs`. With warn-level findings only (frame time), the card said **Pass** with a green
dot, while Correct and Teaches say **Advice** for theirs. It now says Advice and counts the advice beside the page
errors. The verdict reads only hard findings, so it is unchanged; a test checks both.

The round-3 `check --full` result for MapReduce, rendered with `main`'s report code and with this branch's:

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/11-framing-check/shots/before/check-report-scorecard.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/11-framing-check/shots/after/check-report-scorecard.png?raw=true) |

## Checks

- `verify.mjs` on all 8 examples: 0 failing, and the only warnings are Raft's three, as before
  ([log](verify-after.txt)).
- Unit tests: 336 / 336 ([log](tests-after.txt)). New: three framing tests (MapReduce in frame at both sizes; the
  step-24 pull-out measured and under the threshold; the planted far tag found), one report test.
- The sweep on `main` and on `8ccff12`, both sizes, all 8 examples (numbers above).
- `audit` over every step, MapReduce and Raft, both sizes: no problems, no `focus-under-hud`; the only warnings are
  frame time. `audit --a11y --at phases --themes light,dark` on both: 0 problems.
- The end-to-end harness (`scripts/test/e2e.mjs`, real Chrome): 11 / 11 ([log](e2e-after.txt)). On `main` it fails
  1 of 11, its verify check, on the run count round 3 changed ([log](e2e-main.txt)).
- Every screenshot here was read.
- **Not verified:** `focus-under-hud` firing in a real page (no page on `main` has the condition; see section 2).
  The phone's real insets move with the caption. The sweep uses a typical value and audit
  measures the real ones at its two instants a step, so a step with a much taller caption is only checked at those
  two instants. WebGPU: no renderer code changed.

## Next

1. **Sweep with each step's real insets.** The caption's height per step could come from the lesson's text and the
   type scale, so the phone sweep would frame against the caption that step actually shows.
2. Run the sweep for the knob runs too, if its cost stays small; today only the two default runs per story.
3. The pull-out's 2–5 px overshoot (roadmap): a move curve that never passes its end shot would remove it, but it
   changes every figure's frames, so it needs a decision.
4. Report the sweep's numbers in the check report, beside audit's.
