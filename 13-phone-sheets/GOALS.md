# Phone polish: goals

Round 4 picks up items from the "Next" lists of #9 (accuracy) and #10 (HUD and design). Same rules as round 3: no
new features, restrained monochrome interface per DESIGN.md, verify 0 failing on all 8 examples, unit tests at 332 or
more, the HUD browser suite at 275 or more, `audit --a11y` at 0 problems, every change measured before and after.

## Targets

1. **Hide the phone caption while a bottom sheet covers it** (share, settings, readout), as the explain sheet already
   does, with `visibility` so screen readers and the a11y probe skip it too. This removes the share sheet's false
   a11y finding (the caption chip "the" at 1.04:1 behind the opaque sheet). Check every sheet in both themes at
   390×844 and on a landscape phone (844×390), and that the caption comes back, with focus where it was, when the
   sheet closes.
2. **Raft at its maxima** (7 servers): verify warns about 8 captions over 18 words (the longest 38, lists of voters)
   and two chapters over 150 s at 1×. Shorten the words without losing what each step teaches. Splitting chapters is
   a lesson-structure change: only if it is clearly right, otherwise list it.
3. **The phone's first-step caption** reaches 264 px (31 % of the screen). See whether the why can wait behind its
   chip on a chapter's first step where DESIGN.md allows it; if that needs a decision, write it up.

## How each is measured

| Target | Measure |
|---|---|
| Sheets | A probe that opens each sheet (parameters, code, share, readout, help) at 390×844 and 844×390 in both themes: how much of the caption the sheet's box covers, whether the caption shows, the audit's a11y probe with the sheet open, and the caption and focus after Escape. A second probe walks the keyboard: focus a dock control, open a sheet, Escape, where does focus land? |
| Raft | verify's long-caption and pacing warnings at the maxima, every long caption listed; the default lesson's text before and after (`lesson.mjs`) |
| First-step caption | The caption's height on each chapter's first step and the one after, at each level, and which layers it shows |
| Nothing broken | verify on all 8, unit tests, HUD browser suite, `audit --a11y --at phases` on MapReduce and Raft in both themes |
