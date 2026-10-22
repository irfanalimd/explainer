> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/13-phone-sheets), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/13-phone-sheets/GOALS.md)), the probe results and the check logs. The code diff is under **Files changed**.

## TL;DR

- **On a phone, a sheet that covers the caption and the dock now hides them.** This applies to the settings, share,
  readout and help sheets on a 390×844 phone, and to help on an 844×390 landscape phone.
  - Before, the caption and dock stayed live underneath. A screen reader still read them, Tab still reached them,
    and the caption showed faintly through the glass.
  - The a11y probe measured them against the sheet: the caption's "the" chip at 1.04:1, the peek's More at 1.00:1
    and as a 20 px target, the dock's "/ 25" at 2.8:1.
  - With a covering sheet open, those findings go from 1–5 a sheet to 0. Closing the sheet brings everything back,
    and focus returns to the control that had it.
- **The readout gives focus back.** Its sheet covers the strip that opens it, so it now takes focus itself and returns
  it to the strip on close. On `main`, focus stayed on the strip behind the sheet.
- **Raft says each thing once at its maxima.** With 7 servers several moves share a step, and their sentences repeated
  each other ("s3 has 2 of the 4 votes it needs. s5 and s4 turn s3 down; it has 2 of the 4 votes it needs."). Captions
  over 18 words: 8 → 5, the longest 38 → 31 words. The default lesson's words are unchanged.
- **The seed's dice button keeps its size.** It was squeezed to 26 px wide by the field beside it; it is 32 px now.
- The phone's tallest caption (264 px, on a chapter's first step at "I know the basics") needs a design decision, so
  it is written up under Next, not changed.
- Branch **`polish/phone-sheets`**, 3 commits on `main` (`1f93977`). No new features.

## Before and after

MapReduce, both themes, measured with each sheet open and at rest. "Findings behind the sheet" are the a11y probe's
findings on elements the open sheet covers.

| | `main` (1f93977) | this branch |
|---|---|---|
| Sheets that cover the caption and dock bar, 390×844 | settings, share, readout, help (code covers 60 %) | the same |
| … caption and dock while one of them is open | shown, read aloud, reached by Tab | **hidden** |
| … a11y findings behind the open sheet, light / dark | settings 4 / 5, share 0 / 1, help 0 / 1, readout 0 / 1 | **0 everywhere** |
| Help on an 844×390 landscape phone (covers caption and dock) | 1 / 2 findings behind it | **0** |
| Caption after closing any sheet | shown | shown |
| Focus after Escape, readout opened from its strip | stayed on the strip behind the sheet, then on it | **into the sheet, then back to the strip** |
| Focus after Escape, settings opened with S from Play / help with ? from the timeline | Play / the timeline | Play / the timeline |
| Raft at the maxima: captions over 18 words | 8 (longest 38) | 5 (longest 31) |
| Raft at the maxima: chapters over 150 s at 1× | 2 | 2 (listed under Next) |
| Raft's default lesson (`lesson.mjs` text) | | unchanged, word for word |
| Seed's dice button, phone parameters sheet | 26 × 32 px | 32 × 32 px |
| `audit --a11y --at phases`, light and dark, MapReduce and Raft | 0 problems | 0 problems |
| HUD browser suite | 275 / 275 | **278 / 278** (3 new checks) |
| Unit tests / verify on all 8 | 332 / 0 failing | 332 / 0 failing |

---

## 1. A phone sheet that covers the caption and dock hides them

`48eb711`, `engine/hud/hud.mjs` (`syncCover`), `engine/hud/hud.css`, `engine/hud/test.html`.

**The problem.** On a phone the settings, share, readout and help sheets rise over the whole caption and dock bar. The
explain sheet already hides the caption under it (`.ix-ex-sheet-open .ix-caption { visibility: hidden }`); the others
did not. So what they covered was still read aloud, still reached by Tab, and still measured by the a11y probe
against the sheet's own surface:

- the caption's "the" chip at 1.04:1 (#10's known false positive);
- the peek's More at 1.00:1, and as a 20 px target;
- the dock's "/ 25" at 2.8:1.

On an 844×390 landscape phone the same happens under help: the transport's Play at 1.04:1. And the sheets are glass,
so the caption showed faintly through them:

| Before (the Seed row, 2×: the caption under the sheet) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/13-phone-sheets/shots/before/seed-row-dark-2x.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/13-phone-sheets/shots/after/seed-row-dark-2x.png?raw=true) |

**What changed.**
- A sheet whose box holds the whole caption and dock bar now sets `ix-sheet-covers` on the root, which hides
  `.ix-bottom` (caption and bar) with `visibility`. It is measured, not assumed: the code sheet covers 60 % of the
  caption, and a readout with only two numbers is short, so both leave the caption in view and hide nothing.
- It is measured as the sheets come to rest (again on `transitionend`), and rechecked when the caption grows while a
  sheet is open.
- The class drops the moment a sheet closes, before focus is given back, so Escape returns focus to the dock control
  that had it (a `visibility: hidden` control cannot take focus).
- The readout covers the strip that opened it, so when it covers it, it takes focus itself (it has `tabindex="-1"`,
  and no focus ring, like the other sheets) and gives it back to the strip on close.

On screen nothing changes where the sheet is opaque:

| Before (share, dark) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/13-phone-sheets/shots/before/share-dark-390x844.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/13-phone-sheets/shots/after/share-dark-390x844.png?raw=true) |

The full per-sheet results, both sizes and themes, are in [`probe/sheets-main.txt`](probe/sheets-main.txt) and
[`probe/sheets-branch.txt`](probe/sheets-branch.txt).

**Tests.** Three checks in the HUD browser suite: the settings sheet hides and restores the caption and dock and gives
focus back to Play; a readout hides the strip only when it covers it; a readout tall enough to cover takes focus and
gives it back.

## 2. Raft says each thing once in its busy steps

`b277331`, `examples/raft/figure.mjs`, `examples/raft/lesson.mjs`.

**The problem.** At Raft's maxima (7 servers) several moves share one step, and the step's caption joins their
sentences. Some said the same thing twice:

- "s3 has 2 of the 4 votes it needs. s5 and s4 turn s3 down; it has 2 of the 4 votes it needs." The refusal already
  ends with the tally.
- "s7 lacks entry 3 from term 1 and refuses the update. s2 lacks entry 3 from term 1 and refuses the update."
- "s4, s7 and s6 vote for s5: its log is as complete as theirs. … s2 steps down and votes for s5: its log is as
  complete as its own." The reason, twice.

**What changed.**
- The tally stays quiet beside a refusal for the same candidate in the same step: "s5 and s4 turn s3 down; it has 2
  of the 4 votes it needs."
- Servers that lack the same entry refuse it in one sentence: "s7 and s2 lack entry 3 from term 1 and refuse the
  update." The lesson's words for a refused update now read right for one server or several ("{who} {be:whoIds}
  missing entry …, so the update is refused").
- The servers that stepped down first vote "for s5 too", with no second reason.

verify at the maxima: captions over 18 words 8 → 5, the longest 38 → 31. The default lesson's text is the same, word
for word ([main](probe/raft-lesson-main.txt), [branch](probe/raft-lesson-branch.txt)). The five left
([list](probe/raft-long-captions-branch.txt)) each carry three different moves in one step, and the two chapters over
150 s are the same ones; shortening further means saying less of what happened or splitting steps and chapters, a
lesson-structure change (Next 2).

## 3. The seed's dice button keeps its size

`0be7397`, `engine/hud/hud.css`. In the knob rows the field took the room and squeezed the "New seed" button to 26 × 32 px
(its rule says 32). It no longer shrinks.

## Checks

- `verify.mjs` on all 8 examples: 0 failing ([log](verify-after.txt)). Raft keeps its 3 warn-level advisories at the
  maxima (above).
- Unit tests: 332 / 332 ([log](tests-after.txt)).
- HUD browser suite: 278 / 278 ([log](hud-suite-after.txt)).
- `audit --a11y --at phases --themes light,dark` on MapReduce and Raft: 0 problems
  ([MapReduce](audit-a11y-mapreduce.txt), [Raft](audit-a11y-raft.txt)).
- The sheet probe and the keyboard probe, both on `main` and this branch; every screenshot here was read.
- **Not verified:**
  - A real phone or a real screen reader: the reading order follows from `visibility: hidden`, which removes
    elements from the accessibility tree, but no assistive technology was run.
  - Figures other than MapReduce in the sheet probe (the rule is measured per sheet, so a figure with few knobs or
    numbers keeps its caption in view).

## Next

1. **The phone's tallest caption needs a decision.** At "I know the basics", a chapter's first step is the tallest:
   MapReduce step 0 is 264 px (31 % of 844) and step 6 is 248 px, with the Now line, the why and the peek. DESIGN.md's
   level table shows the why on key steps at that level, so putting it behind its chip on a chapter's first step
   changes the table. Two ways: the why waits behind "Why?" on a chapter's first step (the Now line already says what
   happens), or the peek waits there. At New the tallest is 236 px; at Expert, 132 px.
2. **Raft at 7 servers:** five steps still carry three moves each, and "Copying the log" and "Re-election" run over
   150 s at 1×. Splitting busy steps or those chapters at that size is a lesson-structure decision.
3. **The code sheet's syntax colours.** With the code sheet open the a11y probe reports 56 contrast findings on its
   own text (line numbers and comments about 2.2:1, operators 2.75:1, and "def" at 1.05:1, which suggests the probe
   samples coloured glyphs rather than the background). The audit never opens the code sheet; it needs a probe that
   handles syntax spans, then a look at the muted tones.
4. **Compact screens** (844×390) with the parameters panel open: the peek's More is a 20 px target next to another
   control; with the code panel open the "Scenario" label measures 4.39:1. Both are the same on `main`.
5. In Raft's crash story at its maxima the client "hears that s3 is not the leader" and then sends to s3, "the leader
   it knows". That is what the run does (no new leader is known yet), but the two sentences read as a contradiction.
