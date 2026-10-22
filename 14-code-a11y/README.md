> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/14-code-a11y), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/GOALS.md)) and the check logs. The code diff is under **Files changed**.

## TL;DR

- **The code is readable while a step lights a line.** The other lines faded to 55 % opacity, which put line
  numbers and comments at 2.2:1 and operators at 2.7:1. They now recede to the faint ink at full opacity (4.5:1 and
  more): on the phone's code sheet, 56 contrast findings in each theme become 0.
- **On a landscape phone, the code and parameters panels open.** At 844×390 the drawer opened to its header alone
  (44 px tall, its header 56) and the code panel to nothing, so the knobs and the code could not be reached. They now
  run down over the caption and the dock and scroll inside themselves. The 20 px "More" finding was a symptom.
- **The a11y probe tells the truth about colour.** It read every `color-mix()` ink as black, so in dark `def`
  measured 1.05:1, and in light the keywords passed when they were really 3.3:1. It now reads Chrome's `oklab()`,
  `oklch()` and `color(srgb …)`, and skips text and controls an open panel covers.
- **`audit --a11y` now opens the code and parameters panels**, so none of this can come back unseen. On `main` it
  reported 0 problems because no step frame opens a panel.
- Branch **`polish/code-a11y`**, 4 commits on `1f93977`. Unit tests 332 → 335.

## Before and after

MapReduce, the code panel open on a step that lights lines 8–9.

| | `main` (1f93977) | this branch |
|---|---|---|
| Contrast findings, code sheet, 390×844, light / dark | 56 / 56 | **0 / 0** |
| Line numbers and comments, inactive lines, light / dark | 2.23 / 2.65 :1 | 4.5:1 and more (faint ink, full opacity) |
| Operators and plain code, inactive lines, light / dark | 2.75 / 3.68 :1 | 4.5:1 and more |
| Keywords (`def`, `for`), dark: as main's probe read them / as they are | 1.05:1 / 4.47:1 | passes |
| Keywords, light: as main's probe read them / as they are | passed / 3.30:1 | passes |
| Parameters drawer at 844×390 | 44 px tall: its header only | 294 px, knobs reachable, scrolls |
| Code panel at 844×390 | not shown (no height left) | about 246 px, scrolled to the lit line |
| "More" as a crowded 20 px target, parameters open, 844×390 | 1 finding | 0 (its neighbour was a slider clipped in the collapsed drawer) |
| `audit --a11y`, phases, both themes, MapReduce, `main`'s audit on `main` | 0 problems (never opens a panel) | |
| The same with this branch's audit, at 1440×900, 390×844 and 844×390 | **8 a11y problems** (7 code contrast, the More target) | **0** |
| `audit --a11y`, Raft | 0 | 0 |
| HUD browser suite | 275 / 275 | 275 / 275 |
| Unit tests / verify on all 8 | 332 / 0 failing | 335 / 0 failing |

---

## 1. Code lines recede by colour, not by fading

`43c40a8`, `engine/hud/hud.css`. With a line lit, `.ix-code.ix-has-active .ix-line:not(.ix-on)` faded to 0.55
opacity. The faint ink (5.3:1 on the panel in light) at 55 % lands at 2.2:1; the muted ink at 2.7:1; even the full
ink of a function name at 4.4:1. Inactive lines now take the faint ink, every token alike, at full opacity. The lit
line keeps the ink, the syntax's whisper of hue and its bar, so it still stands out by more than before.

| Before (390×844, light) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/before/code-light-390x844.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/after/code-light-390x844.png?raw=true) |

| Before (390×844, dark) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/before/code-dark-390x844.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/after/code-dark-390x844.png?raw=true) |

The desktop panel is the same component:

| Before (1440×900, dark) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/before/code-dark-1440x900.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/after/code-dark-1440x900.png?raw=true) |

## 2. The panels open on a landscape phone

`770ec8a`, `engine/hud/hud.css`. At 844×390 the page is compact (not phone) and short. A side panel's
`max-height` subtracts the header and the dock: 44 px were left for the parameters drawer, whose header is 56, and
less than nothing for the code panel. So the drawer showed its header and the code button lit up with no panel. On a
short screen that is not a phone, both now run down over the caption and the dock, and scroll inside themselves.

| Before (parameters open) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/before/parameters-light-844x390.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/after/parameters-light-844x390.png?raw=true) |

| Before (code open) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/before/code-light-844x390.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/14-code-a11y/shots/after/code-light-844x390.png?raw=true) |

**"More" as a 20 px target.** The finding was real as measured but not as experienced: the More link's
"neighbour" was a slider clipped out of sight inside the collapsed drawer. With the drawer open, More is under it;
with it closed, nothing crowds More.

**"Scenario" at 4.39:1 with the code panel open** (found by the phone-sheets branch) did not reproduce at the step
and timing measured here, before or after; at 844×390 the code panel never opened on `main`, so the reading was of
the pill over the world. Listed under Next.

## 3. The probe reads every colour, and only what is shown

`8c643cf`, `scripts/lib/a11y.mjs`, `scripts/lib/a11y.test.mjs`.

**Colour.** The probe read a text's colour with an `rgb()` pattern and took anything else as black. Chrome keeps a
`color-mix()` in its own space (`oklab(0.86 -0.006 -0.062)` for the dark keyword ink), so every token mixed from a
tone was "black": 1.05:1 in dark, and a false pass in light, where the keyword ink is really 3.30:1. `parseColor()`
reads `rgb()`, `oklab()`, `oklch()` and `color(srgb …)` (CSS red in oklab comes out `#ff0000`), and a colour it cannot
read is left unjudged. It runs in Node under test and the in-page probe is built from the same source.

**Coverage.** Text and controls under an open sheet or panel were judged as if shown: the caption's words behind the
parameters sheet (More at 1.00:1), the dock's Play behind the code panel, the clipped slider above. Each point is now
hit-tested with pointer events forced on, and skipped when an opaque or frosted layer that is not the element covers
it. A faded-out or see-through layer does not count.

## 4. `audit --a11y` opens the panels

`91003c7`, `scripts/audit.mjs`, `references/tooling.md`. No step's frame opens a panel, so the audit had never seen
the code panel or the drawer. With `--a11y`, each size and theme of the first scenario now adds two frames on its last
step, code panel open and parameters panel open (reported as `…/code`, `…/parameters`): four frames more per size.
Run on `main`'s page it finds the 7 code-contrast findings and the More target; on this branch, none.

## Checks

- Every number above measured on `main` and on this branch, with `main`'s probe for `main` and the branch's for the
  branch (and the branch's probe on `main`'s page, to separate the two kinds of fix: [probe/](probe/)). Every
  screenshot here was read.
- `audit --a11y --at phases --themes light,dark`: MapReduce and Raft, both sizes, 0 a11y problems; MapReduce at
  844×390 too ([logs](probe/)).
- HUD browser suite 275 / 275 ([log](hud-suite-after.txt)). Unit tests 335 / 335 ([log](tests-after.txt)). verify on
  all 8: 211 runs, 0 failing ([log](verify-after.txt)).
- **Not verified:**
  - Figures other than MapReduce and Raft with the code panel open, and a real phone or screen reader.
  - My ad hoc probe (not the audit) twice caught a frame mid-transition at 1440×900: the toolbar's "Code" label
    still in the light theme's ink 1 s after switching to dark, and a world tag fading in. The frozen audit does not
    see either; neither is a page bug.
  - The new coverage rule decides "covered" by a layer's background alpha (0.3 and up) or backdrop filter. A panel
    drawn some other way (a gradient, an image) would not count as covering.

## Next

1. MapReduce at 844×390, skew story, step 1: the step's focus and a world tag ("alone: 14 reads · shared: 5 each")
   are outside the frame. It is on `main` too; the framing-check branch's sweep is the place to catch it.
2. "Scenario" at 4.39:1 over the world on a landscape phone with the code panel open (the phone-sheets probe): check
   it again now that the panel opens, on several steps.
3. On a short screen, the open drawer and code panel cover the dock. A scrim or a dimmed dock, as phone sheets have,
   would say so; it is a small design choice.
4. The code sheet's comments still clip at the right edge on a phone (`# a readin…`): a horizontal scroll with no
   affordance. Wrapping comments, or a fade at the edge, needs a decision.
