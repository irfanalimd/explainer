> **Draft, for review only. Don't merge yet.** Before and after shots, the goals and the check logs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/27-next-cue). The code diff is under **Files changed**.

## TL;DR

Readers said there is so much on screen that they can't tell what to do next. Now **one control at a time carries a
clear ring**: the control that moves the reader on.

- **When it shows:**
  - Play, before anything has played.
  - "Continue to …" at a chapter's pause, and "Rewind and try again" after an in-world pick plays out.
  - The options of an open question, ringed as one group.
  - The end check's question, then its "Next question".
  - "Next story" once the check is done.
  - Next, while stepping through.
- **How it moves:** on every new cue the ring ripples out three times, under one pulse a second, with a soft halo.
  Then it rests on the control until the reader acts. After 12 s of waiting it calls once more.
- **When it doesn't show:** while the run plays, after a reader paused on their own, during a scrub, beside an open
  menu or help, while presenting, or in capture.
- **Under the recap:** a chapter's recap in the panel now ends **"Up next: Map. Press Continue or Enter."**. The eyes
  are on the panel there, and the pill that continues is at the other end of the dock.
- **Settings → Hints** turns it off, together with the one-time coach hints.

**Two looks for you to choose from:**

| | **clear** (default) | **quiet** (`?cue=quiet`) |
|---|---|---|
| Resting ring | 3 px of ink at 60 %, with a soft halo | 2 px of ink at 26 %, no halo |
| Calls | on every new cue | on the first 3 cues of each kind, then rests only |

Both are ink only, as DESIGN.md asks: chrome is never coloured. I don't think a colour is needed, since the clear
ring holds the eye in both themes. The world, the tiles, rendering and the camera are untouched.

Branch **`guide/next-cue`**, 6 commits on `polish/after-remake` (f874a48). The last commit, `85dcbe4`, is the clear
look. Revert it to keep only the quiet one.

**Checks:**
- Unit tests 381 / 381 (10 new).
- HUD browser suite 282 / 282.
- Verify: 211 runs, 0 failing.
- `audit --a11y`: MapReduce and Raft clean.

## Quiet and clear, side by side

MapReduce, live play, with nothing remembered from earlier visits. In each pair, quiet is on the left and clear on
the right.

| Moment | 1440×900 at 2× | Phone 390×844 at 3× |
|---|---|---|
| Play, start card closed | [cmp-play-1440.png](shots/quiet-vs-clear/cmp-play-1440.png) | [cmp-phone-play-continue.png](shots/quiet-vs-clear/cmp-phone-play-continue.png) (top row) |
| Continue at a pause | [cmp-chapter-1440.png](shots/quiet-vs-clear/cmp-chapter-1440.png) | same sheet, bottom row |
| The prediction's options | [cmp-ask-1440.png](shots/quiet-vs-clear/cmp-ask-1440.png) | [cmp-phone-answer.png](shots/quiet-vs-clear/cmp-phone-answer.png) |
| At full size | [Continue, quiet](shots/quiet-vs-clear/zoom-quiet-continue.png), [Continue, clear](shots/quiet-vs-clear/zoom-clear-continue.png), [the options, clear](shots/quiet-vs-clear/zoom-clear-answer.png) | |
| Clear in dark (Play, Continue, the options) | [clear-dark-1440.png](shots/quiet-vs-clear/clear-dark-1440.png) | |

## Before and after (the quiet look)

These were shot before the clear look existed. Each sheet shows, left to right and top to bottom:
- the start card closed;
- a chapter's pause;
- a prediction;
- the story's end.

| | |
|---|---|
| Before | [light](shots/before-mapreduce-light-1440.png), [dark](shots/before-mapreduce-dark-1440.png), [phone](shots/before-mapreduce-light-390.png), [Raft and Event loop](shots/before-raft-eventloop.png) |
| After, quiet | [light](shots/quiet-after-mapreduce-light-1440.png), [dark](shots/quiet-after-mapreduce-dark-1440.png), [phone](shots/quiet-after-mapreduce-light-390.png), [Raft and Event loop](shots/quiet-after-raft-eventloop.png) |
| Stepping through (after, before; desktop, then phone) | [quiet-step-mapreduce.png](shots/quiet-step-mapreduce.png) |
| Mid-call, 0.7 s in | [quiet-mid-call.png](shots/quiet-mid-call.png) |
| At full size | [Continue before](shots/zoom-before-continue.png), [Continue after](shots/quiet-zoom-after-continue.png), [the options](shots/quiet-zoom-after-answer.png) |

## What changed

**`engine/hud/guide.mjs`** (new, with `guide.test.mjs`).
- `cueOf(state)` decides the one cue from the HUD's state. It is pure and tested.
- `createGuide()` puts the ring on that control and takes it off the last one.
- `cueStyle()` picks the look: `?cue=quiet`, then the HUD's `cue` option, else clear.
- Clear calls on every new cue. Quiet calls on the first 3 of a kind and only rests after that.

**`hud.mjs`.**
- Wires the guide in and sets `data-cue` on the root. It re-checks the cue when play state, a pause, a question, an
  overlay or a frame changes, and leaves the DOM alone when nothing moved (the suite's "the same pause re-renders
  nothing" still passes).
- Inside the question card, the way on is chosen in order: the check's Next question, then a ponder card's Predict,
  then the open options, then an in-world pick's list.
- Adds the **Hints** switch and gates the coach hints on it.

**`hud.css`.**
- The ring is a CSS outline 3 px off the control. Clear adds a box-shadow halo; a pill keeps its own hairline through
  `--ix-cue-base`.
- A call ripples the ring out (clear 12 px, quiet 11 px) and fades. Clear's halo brightens from 16 % to 30 % as a
  call starts.
- An option group sits 6 px off with an 8 px ripple and a smaller halo, so it stays inside the panel.
- Keyboard focus wins over it, reduced motion keeps the resting ring alone, and capture never shows it.
- The pause pill's own call (three rings in 5.6 s, then nothing) is gone: the guide calls instead, and its ring stays.

**`explain.mjs`.** The pause's recap takes one more node from the HUD: the "Up next" line. It shows only where the
panel docks (on a phone the caption and the pill already sit together).

**`DESIGN.md`.** The rule for the cue and both looks.

## Checks

- **Unit tests:** 381 / 381 ([tests-after.txt](tests-after.txt)).
- **HUD browser suite:** 282 / 282, on the clear default ([hud-suite-after.txt](hud-suite-after.txt)). The pause test
  checks the ring and its call. Other checks cover the recap's Up next line, the Hints switch both ways, and that
  playing takes the ring off.
- **Verify on all 8 examples:** 211 runs, 0 failing. The known warnings remain: MapReduce 1 (its scenario name) and
  Raft 3 (its maxima) ([verify-after.txt](verify-after.txt)).
- **`audit --a11y --at phases`, light and dark, on MapReduce and Raft:** no problems. Only frame-time warnings on
  this GPU-less machine ([MapReduce](audit-a11y-mapreduce.txt), [Raft](audit-a11y-raft.txt)). The audit runs in
  capture, where no ring shows.
- **Writing lint on the new strings:** 0 hits ([writing-lint.txt](writing-lint.txt)).
- **Flashing:** one ripple every 1.6 s, three per cue, well under WCAG 2.3.1's three flashes a second. The motion
  stops on its own (2.2.2).
- **Shots:** every moment above, live, through [`drive.mjs`](drive.mjs). It drives a built page to each moment with
  `__internals` and shoots it.
- **Not verified:**
  - A real GPU or another browser. The ring is an outline plus a box-shadow; outlines follow border-radius in current
    Chrome, Safari and Firefox.
  - A screen reader. Nothing new is announced, by design.
  - On desktop, step mode's ring after the first step: the step plays in slow motion here, so the shot caught it still
    playing. The phone shot shows the ring on Next once the step ends.
  - Clear mid-call: a shot 0.25 s into a call looks almost the same as the ring at rest. The ripple itself was only
    caught in the quiet set.

## Next (decisions for the owner)

1. **Clear or quiet.** Clear is the default. Revert `85dcbe4` to keep only quiet, or keep both.
2. **Colour.** A coloured ring would stand out more still, but DESIGN.md rules out an accent in the chrome. I don't
   think it is needed.
3. **Already there:** on a phone, the one-time "Press Next for each step" coach bubble covers the caption's first line
   (in the base build too). It belongs to the HUD layout, not to this branch.
