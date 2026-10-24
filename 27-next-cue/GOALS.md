# The next thing to do: goals

Feedback from readers: there is so much on screen that people can't tell what matters, and they search for what to do
next. The owner asked that the page show it on its own, for example by highlighting the next button.

This branch covers one part of that: **a single cue on the control that moves the reader on**. Two sibling branches
cover the rest: `guide/world-focus` (where to look in the world) and `guide/calm-screen` (less chrome until it is
needed).

## Every moment a reader must act

Each was read in the HUD (`hud.mjs`, `turn.mjs`, `check.mjs`, `explain.mjs`, `journey.mjs`) and shot live on the
base build (`polish/after-remake`, f874a48).

| Moment | Way on today | What was missing |
|---|---|---|
| Start card | Play, solid, centred | nothing: it already holds the eye |
| Start card closed, nothing played | Play in the dock | nothing marks it; the world and panel look ready to read |
| A chapter ends (pause) | "Continue to Map  Enter", solid | a ring called 3 times, faintly, then nothing; the eyes are on the panel's recap at the far right |
| New's pause after a key step | "Continue" | same |
| A prediction opens | its options in the panel (or above the caption on a phone) | the eye is on the world; the dock says "Answer to go on", which points down, away from the answer |
| An in-world pick plays out wrong | "Rewind and try again" | same as a pause |
| The end check | its options, then "Next question" | nothing marks them |
| The story ends | "Next story: …", solid, once the check is done | same as a pause |
| Step through it yourself | Next, solid | a one-time coach bubble only |

## What it must do

- One cue at a time, on the control that moves the reader on, decided in one place from the HUD's state.
- A ring that calls (at most about one pulse a second, three times per cue) and then rests on the control until the
  reader acts. It must be seen at a glance at 1440×900 (the lead's review of the first, quiet look); the quiet look
  stays as an option. No flashing (WCAG 2.3.1), and the motion stops on its own (2.2.2).
- No cue while the run plays, after a reader paused on their own, while scrubbing, beside an open drawer, menu, help
  or the start card, while presenting, or in capture.
- Reduced motion: the resting ring alone. Keyboard focus wins over it.
- Nothing extra read aloud: each moment already says its way on to screen readers.
- A "Hints" switch in Settings, on by default and remembered.
- Where the control is far from the eyes (Continue in the dock while the reader reads the panel's recap), one line
  where they are reading.

## What it may not change

The world, tile colours, rendering, the camera. Chrome stays ink: DESIGN.md says chrome is never coloured and has no
accent, so the ring is ink too. A coloured ring would be a design change for the owner to decide.

## How it is checked

- `guide.test.mjs`: which cue each state gets, that nothing competes, and how it calls and rests.
- Live shots of every moment, before and after, at 1440×900 at 2× and 390×844 at 3×, light and dark, on MapReduce;
  pauses, questions and the end on Raft and Event loop too. A second set is shot mid-call.
- The unit tests, verify on all 8 examples, the HUD browser suite, and `audit --a11y` on MapReduce and Raft.
