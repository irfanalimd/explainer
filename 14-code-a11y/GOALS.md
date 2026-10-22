# Code sheet and landscape accessibility: goals

Round 4 keeps to fixes: no new features. This branch takes accessibility findings the phone-sheets branch's probe
turned up but left alone, because they were not about sheets.

## Targets

1. **The code panel and code sheet.** The a11y probe reported 56 contrast findings on its syntax colours. Sort the
   real ones from the probe's limits ("def" at 1.05:1 looked like a measuring artefact), fix the real ones so line
   numbers, operators and code reach WCAG AA (4.5:1) in both themes while keeping the syntax palette restrained, and
   fix the probe if it mis-measures.
2. **A landscape phone (844×390).** The peek's More measured as a 20 px target with the parameters panel open, and
   "Scenario" at 4.39:1 with the code panel open. Fix both.
3. **Regression.** `audit --a11y` never opened the code panel: say whether it should, and add it if cheap.

## Rules that shape the fixes

- Restrained, monochrome interface; colour only for data. The code panel's hues stay "a whisper, mixed far toward
  the ink" (its own CSS comment).
- No new features: a panel that cannot open at a size is a bug, and is in scope.
- Measure the real page, before and after, with main's probe for main and the branch's probe for the branch, and
  read every screenshot.

## How each target is measured

| Target | Measure |
|---|---|
| Code contrast | The a11y probe with the code panel open on a step that lights a line: 1440×900, 390×844 and 844×390, light and dark |
| Probe accuracy | The computed colours Chrome reports for each token (`getComputedStyle`), against what the probe read; a unit test for the parser |
| Landscape | The drawer's and the code panel's boxes at 844×390 (`getBoundingClientRect`, `max-height`), the probe with each open, screenshots |
| Regression | `audit --a11y --at phases --themes light,dark` on MapReduce and Raft, main against the branch, and at 844×390 too |
