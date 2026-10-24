# Calm screen: goals

Readers said there is so much on screen that they can't tell what matters. This pass makes less compete for
attention at any moment, so the eye goes from the world to the step being played, and only then to the controls.

## What it may change

- **The HUD's hierarchy:** weight, size, contrast (staying within the four existing inks) and folding.
- **Defaults:** what starts folded, and what steps back a shade while the story plays.

## What it may not change

- **The world:** no rendering, camera, colours, tiles or tags.
- **The HUD's style:** its colours and fonts, and its glass cards. No new colour, no animation that draws the eye.
- **Reach:** nothing is removed. Every control stays reachable by pointer, keyboard and screen reader, and one click
  opens whatever is folded.
- **Movement:** nothing moves under the pointer, and there are no new layout jumps during play.
- **Contrast:** text never goes below `ink-faint`, the faintest text ink, which is AA on its surfaces.
- **Other forks' areas:** no beacon on controls (`guide/next-cue`), and no change to what the world highlights
  (`guide/world-focus`).

## How it is checked

- **Inventory:** every element on screen for MapReduce, Raft and Event loop.
  - Three moments, the open card, mid-story paused and the last step, plus mid-story while it plays.
  - At 1440×900 and 390×844, light, with MapReduce dark too.
  - What a first-time reader needs each element for at that moment.
- **Before and after:** the same moments from `polish/after-remake` and from this branch, every shot read. For each
  moment it counts:
  - the focusable controls;
  - the text items in the full ink, which is the loudest;
  - the colour chips outside the world;
  - the words on screen.
- **Tests and audits:**
  - the unit tests, verify on all 8 examples and the HUD browser suite;
  - `audit --a11y --at phases` in both themes on the three site pages, before and after.
- **Commits:** each change is its own commit, so any one can be dropped.
