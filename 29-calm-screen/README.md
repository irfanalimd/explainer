> **Draft, for review only. Don't merge yet.** Before and after shots, counts and logs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/29-calm-screen). The code diff is under **Files changed**.

## TL;DR

Readers said there is so much on screen that they can't tell what matters. This branch makes less compete for
attention at once, so the eye goes from the world to the step being played, and only then to the controls. Nothing
is removed: everything folded opens with one click and stays reachable by keyboard and screen reader.

- **Five commits, one change each, so any one can be dropped.**
  1. The panel's earlier steps fold to one line ("Earlier 5 steps ›").
  2. The level shows as one quiet line ("Level I know the basics ⌄") that opens the switch.
  3. While the story plays, the toolbar, the scenario name and the speed step back one ink.
  4. The folded Parameters card reads as a way in, not as a second heading.
  5. A chapter's introduction steps back one ink once its first step has played.
- **On the desktop panel mid-story:** 32 → 26 controls on Raft, about half the words (120 → 70 on Raft, 124 → 68 on
  MapReduce), and 26 → 15 text items in the full ink on Raft (MapReduce 25 → 15).
- **On phones:** already one caption. Only commit 3 applies there.
- **Unchanged:** the world, the HUD's colours, fonts and cards. No new colour or animation. Nothing moves under the
  pointer.

Branch **`guide/calm-screen`**, 5 commits on `polish/after-remake` (`f874a48`), only `engine/hud/explain.mjs`,
`engine/hud/hud.css` and the HUD suite. Unit tests 371 / 371, verify 211 runs with 0 failing, HUD suite 281 / 281,
`audit --a11y` with no problems on all three site pages.

## What was on screen (the inventory)

MapReduce, Raft and Event loop, at 1440×900 and 390×844, at four moments: the open, mid-story paused, mid-story
playing, and the last step. Every shot is in `shots/before` and `shots/after`.

**Desktop (1440×900), mid-story: what a first-time reader needs each element for at that moment.**

| Element | Needed now? | Before | After |
|---|---|---|---|
| The world | **Yes:** the step happens here | | |
| Panel: the current step and Look | **Yes:** what just happened | full ink, large | unchanged, now the loudest text in the panel |
| Panel: the chapter's name and progress dots | Yes: where am I | | unchanged |
| Panel: the chapter's introduction | Once, at the chapter's first step | muted ink, on every step | muted on the first step, faint after |
| Panel: Goal | Sometimes: the lesson's aim | muted | unchanged |
| Panel: level switch (3 options) | No: picked on the start card | a full segmented control | one line, `Level  I know the basics ⌄` |
| Panel: Earlier, up to 5 steps with colour chips | No: a way back | 5 items with full-colour chips, about 50 words | one line, `Earlier  5 steps ›` |
| Parameters card | No: for after the first run | a heading in the full ink | the toolbar's weight and ink |
| Scenario bar | No: for after the first run | selected one in the full ink | muted while playing |
| Code, Share, Settings, theme, full screen | No | muted | faint while playing |
| Play, Back, Next | Yes, to start and step | | unchanged |
| Timeline and step count | Yes: how far along | | unchanged |
| Speed | Rarely | value in the full ink | muted while playing |
| Counters (Words read, Sent…) | Yes: the run's numbers | | unchanged |
| Keys legend, help `?` | Rarely | muted | the legend faint while playing |

**Open.** The start card already dims everything behind it and asks one question, so it is unchanged. The panel
behind it gets the level line.

**Phone (390×844).** Mid-story the screen holds only these:
- the title;
- a two-word toolbar;
- the scenario pill;
- the world;
- the caption with Look and Explain;
- the dock.

The panel is a sheet the reader opens, and it keeps Earlier open, since that is what the reader opened it for. So on
phones only commit 3 applies.

## Counts, before → after

Counted on the page:
- **controls:** visible focusable controls;
- **in the full ink:** visible text in the strongest of the four inks, the loudest;
- **words:** words on screen outside the world.

Light theme. MapReduce in dark shows the same changes, for example mid-story 34 → 30 controls, 25 → 15 in the full ink
and 124 → 68 words (`counts/table.md`). MapReduce's before at 1440×900 light comes from the first base run. Its
re-run, which added the playing shot, lost its Chrome connection twice on this machine, so
`shots/before/mapreduce-1440x900-light-playing.png` is missing.

| Page | Size | Moment | Controls | Text in full ink | Words |
|---|---|---|---|---|---|
| MapReduce | 1440×900 | mid | 35 → **30** | 25 → **15** | 124 → **68** |
| MapReduce | 1440×900 | playing | 35 → **29** | 24 → **11** | 135 → **62** |
| MapReduce | 1440×900 | end | 32 → **29** | 14 → **11** | 106 → **82** |
| Raft | 1440×900 | open | 31 → **29** | 19 → **17** | 136 |
| Raft | 1440×900 | mid | 32 → **26** | 26 → **15** | 120 → **70** |
| Raft | 1440×900 | playing | 32 → **26** | 26 → **13** | 120 → **70** |
| Raft | 1440×900 | end | 27 → **25** | 19 → **17** | 76 |
| Event loop | 1440×900 | open | 34 → **32** | 19 → **17** | 129 |
| Event loop | 1440×900 | mid | 32 → **27** | 14 → **12** | 120 → **62** |
| Event loop | 1440×900 | playing | 32 → **27** | 14 → **10** | 120 → **62** |
| Event loop | 1440×900 | end | 31 → **28** | 19 → **17** | 106 → **82** |
| MapReduce | 390×844 | playing | 16 | 11 → **9** | 9 |
| Raft | 390×844 | playing | 16 | 13 → **11** | 14 |
| Event loop | 390×844 | playing | 15 | 10 → **8** | 14 |

The other phone moments are unchanged: 15–21 controls, 9–15 text items in the full ink. The full table, with every
moment, is in `counts/`.

## The commits

### 1. The earlier steps fold to one line

`0691a92`

**Why.** In the docked panel, Earlier listed up to five earlier steps under the current one. Each had its colour
chips (`jumps`, `fox`, `brown`…), the same colours as the world. That made Earlier the most colourful block on screen
after the world, and it sat right under the step being played.

**What changed.**
- It is now one line, "Earlier  5 steps ›", and a click opens the list. The reader's choice is remembered, like the
  panel's own open state.
- The button has `aria-expanded` and `aria-controls`. Each earlier step is still a way back, and so are Back and the
  timeline.
- The phone and tablet sheet keeps the list open, as before. The reader opened that card to see it.
- HUD suite: the fold, the count, opening it, remembering it, and the sheet's list staying open.

### 2. The level as one line

`202483b`

**Why.** The panel's header carried the full three-option level switch on every step. That is a second control as
wide as the panel, for a choice the reader already made on the start card.

**What changed.**
- The header now says `Level  I know the basics ⌄` in the xs size. A click opens the same switch under it, and the
  line follows any change.
- The start card, the nudge ("You're getting these right. Switch to I know the basics?") and the `L` key still set
  it.

### 3. The chrome steps back while the story plays

`30e36e9`

**What changed.** While the story plays, these step down one ink:
- Code, Share, Settings, theme and full screen: muted → faint;
- the keys legend: muted → faint;
- the selected scenario and the phone's scenario pill: full → muted;
- the speed value: full → muted.

**Limits.**
- Pointing at a control, tabbing to it, or any pause brings it back.
- It is colour only. Nothing moves, and nothing changes size.
- Nothing goes below `ink-faint`, the faintest text ink, which the inactive scenario names already use.
- Measured in the shots: the selected scenario goes from `#0B0B0C` to `#484B52`, and Code from `#484B52` to `#676B73`.

### 4. The folded Parameters card

`2e2bbcb`

**Why.** Folded, the card's title was a heading in the full ink, the size and weight of the chapter's name, so the
right column had two headings.

**What changed.** Folded, the title reads like the toolbar's words: sm, 500, muted. Opened, it is the heading it
was. The card's height is unchanged, so the panel above it doesn't move.

### 5. The introduction steps back once it has been read

`1082ef9`

**What changed.** The chapter's introduction keeps the muted ink on the chapter's first step. From the second step
on it uses the faint ink, so the step being played is clearly the thing to read. Questions and pauses are unchanged.

## Checks

- Unit tests 371 / 371 (`tests-after.txt`).
- `verify.mjs` on all 8 examples: 211 runs, 0 failing. The warnings are the known ones: MapReduce's scenario name
  and Raft at its maxima (`verify-after.txt`).
- HUD browser suite: 281 / 281, which is 278 plus the 3 new fold checks (`hud-suite-after.txt`).
- `audit --a11y --at phases`, light and dark, 1440×900 and 390×844: MapReduce, Raft and Event loop before and after.
  - Contrast, target size, names and focus: no problems on any of them.
  - The only warnings are frame time on this GPU-less machine (`audit/`).
- Every shot in `shots/` was read.
- **Not verified:**
  - The audit measures paused frames. The playing state's contrast is argued from its tokens (`ink-faint`, the
    palette's faintest text ink), not measured.
  - No real GPU.
  - No screen reader was run. The new controls are plain buttons with `aria-expanded` and `aria-controls`.

## Open questions

1. **Earlier folded by default.** Readers who use Earlier to re-read may want it open. One click opens it, and the
   page remembers.
2. **Goal on every chapter.** It stays: it is the lesson's aim in two lines. It could fold too, after the first
   chapter.
3. **Seen while shooting, not in this branch's area:** on a phone, while a repeat folds ("» 5 of 5 speeding through
   repeats"), the caption's two lines draw on top of each other for a moment
   (`shots/before/mapreduce-390x844-light-playing.png`). It does the same before and after this branch.
