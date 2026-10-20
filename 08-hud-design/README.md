> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/08-hud-design), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/GOALS.md)) and the check logs. The code diff is under **Files changed**.

## TL;DR

- **The world gets a little more of the screen.**
  - At 1440×900 it comes down to the dock bar whenever nothing floats above the bar.
  - On a phone, the numbers strip is a 32 px row.
  - The HUD's share of the screen: 40.5 % → 39.2 % at 1440×900, and 44.3 % → 43.4 % on a phone (MapReduce).
  - Raft draws 2 % larger on both screens. MapReduce's 1440×900 scale stays the same, because the explain panel's
    width is what limits it (first under Next).
- **The newest pieces now match DESIGN.md:**
  - the caption offers the deeper layer once, not twice;
  - the share panel's switches have names;
  - the no-GPU board titles stages as the world prints them;
  - the presenter view's chapter dots are 24 px targets, and its picker is called "Scenario", as on the page.
- **The HUD browser suite runs again.** It had thrown at its first stale selector since Oct 16 and reported nothing;
  it now runs 271 checks, 0 failing. Bringing it up to date found a real bug, now fixed: a long revealed question
  ran under the header on a phone.
- `audit --a11y` stays at 0 problems.
- Branch **`polish/hud-design`**, 10 commits on `8ccff12`. No new features.

## Before and after

Light theme, settled frames at the middle of each phase. Scale is pixels per world unit on the director's goal
distance.

| | `main` (8ccff12) | this branch |
|---|---|---|
| HUD share of the viewport, 1440×900 (MapReduce, Raft) | 40.5 % (insets top 64, right 384, bottom 106) | 39.2 % (bottom 90) |
| World scale at 1440×900, MapReduce | 0.879 | 0.879 (held by the panel's width; 1.165 without it) |
| World scale at 1440×900, Raft (whole / push-in / payoff) | 1.198 / 1.141 / 1.225 | 1.224 / 1.166 / 1.250 |
| HUD share, 390×844, MapReduce Map | 44.3 % (bottom 282) | 43.4 % (bottom 274) |
| World scale at 390×844, MapReduce Map / Split | 0.440 / 0.295 | 0.448 / 0.302 |
| HUD share, 390×844, Raft Election | 52.8 % | 51.9 % |
| World scale at 390×844, Raft Election / Agreement | 0.784 / 0.736 | 0.799 / 0.752 |
| Phone dock bar / numbers row (with its margin) | 150 px / 44 px | 142 px / 36 px |
| `audit --a11y --at phases`, light and dark, MapReduce and Raft | 0 problems | 0 problems |
| a11y probe, share panel (both themes and sizes) | 8 unnamed controls | 0 |
| a11y probe, presenter view window (both themes) | 10 small targets | 0 |
| HUD browser suite (`engine/hud/test.html`) | throws at line 355, reports nothing | **271 pass, 0 fail** (275 on the combined branch, with the accuracy branch's checks) |
| Unit tests / verify on all 8 | 321 / 0 failing | 321 / 0 failing |

---

## 1. The world comes down to the dock

**At 1440×900** (`c197d13`, `engine/hud/hud.mjs` `updateInsets`). When the explain panel is docked, it tells the
step, so the caption is hidden and the row above the dock bar is empty. That empty row's 16 px still counted in
`insets.bottom`, so the camera framed the world 16 px higher than it needed to. Now, when the row has no height, the
bar itself is the bottom overlay; `--ix-bottom-h` follows it, so the scrim and the drawers move with it.
`insets.bottom` 106 → 90; Raft draws 2.2 % larger (table). The difference is small to the eye:

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/before/raft-1440x900-election.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/after/raft-1440x900-election.png?raw=true) |

(The client under the dock here is a framing problem on `main`; the accuracy branch fixes it.)

**On a phone** (`4ba16bc`, `engine/hud/hud.css`). The roadmap asked for a one-line numbers strip that opens on tap.
That was already built: one line, a real button with `aria-expanded` that opens the readout sheet. What was left was
its height: it was a 36 px row with 8 px above it. It is now 32 px with 4 px above, and the legend chip matches. The
dock bar is 8 px shorter at every phase.

| Before (Map) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/before/mapreduce-390x844-map.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/after/mapreduce-390x844-map.png?raw=true) |

## 2. One way into the deeper layer

`6f2134a`, `engine/hud/layers.mjs`. At "I know the basics", the caption on phones and narrow screens showed a
**Deeper** chip and also the peek line's **More**. Both opened the explain card, against DESIGN.md 9.2 ("no two
controls in view do the same thing"). Where the level shows the peek, the chip is gone; at Expert, which shows no
peek, it stays.

| Before (Split) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/before/mapreduce-390x844-split.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/after/mapreduce-390x844-split.png?raw=true) |

## 3. The newest pieces against DESIGN.md

**Share panel** (`a51b6b3`, `engine/hud/share.mjs`). The switches ("Open at step 7 of 25", "Use my level") sat inside
a wrapping `<label>` with no name of their own, and the a11y probe found 2 unnamed controls per frame. Each switch now
points at its line with `aria-labelledby`: 8 findings → 0. Nothing changes on screen. The panel's titles, rows and
switches match Settings; it is 360 px wide against Settings' 336, which I left.

**The no-GPU board** (`3f2eda0`, `engine/a11y/describe.mjs`). The board and the screen reader said "map" and
"reduce", where the world prints "Map" and "Reduce". Group headings now go through the same `worldCase`.

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/before/mapreduce-nogfx-light-1440x900.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/after/mapreduce-nogfx-light-1440x900.png?raw=true) |

**The presenter view** (`6702e85`, `engine/hud/hud.css`; `6a6b8c3`, `engine/hud/presenter-view.mjs`). Each chapter
dot's button was 14 × 24 px and touched its neighbours, so the dots failed WCAG 2.5.8, though the CSS comment said
they passed. They are now 24 px apart and each button is a 24 px circle, close to the explain panel's map (26 px):
10 findings → 0, measured in the real popup window at 1280×800. Its scenario picker was labelled "Story" while the
page's own reads "Scenario · name" (DESIGN.md 9.3); it now says "Scenario". The handout's "Story" column and the
end card's "Next story" stay: there the word means the lesson run, not the picker.

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/before/mapreduce-pvwin-light.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/08-hud-design/shots/after/mapreduce-pvwin-light.png?raw=true) |

**Checked, nothing to fix:** the handout preview at both sizes and its print view (print media emulated at 816 px),
presenter mode, and focus rings and pixel contrast in both themes.

## 4. The HUD browser suite runs again

`6cad48e`, `engine/hud/test.html`. The suite was last updated on Oct 16; the redesign and about 20 later HUD commits
changed the HUD on purpose, so it threw at its first stale selector (line 355) and reported nothing. Every
expectation that changed is a deliberate HUD change:

- the toolbar button with the parameters card docked is "Playback settings", not "Settings";
- "Story" became "Scenario" in the strip, the tabs and the pill;
- the header row is 40 px (`insets.top` 64), and the phone title, pill and gap are 40, 32 and 8 px (DESIGN 9.3);
- the start card shows the run's promise line and a hidden "Welcome back" line;
- the pause button reads "Continue to Reduce" with an Enter chip, and is the solid primary pill (the HUD has no
  accent colour now);
- the explain panel's selectors moved (`.ix-ex-now .ix-l-plain`, `.ix-map-pos`, `.ix-ex-extra`);
- a story with another after it ends on "Next story: …" with a quiet Replay; two checks are added for the last
  story, which ends on Replay alone;
- folding the explain panel leaves `insets.right` at the parameters card's width, not 0.

To list every stale spot in one run I used a throwaway copy of the page that logged a missing selector instead of
throwing; the result above is from the real file.

**A real bug it found** (`87ccd44`, `engine/hud/hud.css`). On a 390×844 phone, a long question (four two-line
options and a three-sentence why) is 658 px tall once revealed, and its top sat at y 46, under the header (which ends
at 52). On phones the feedback and why now sit as close under the options as they do on short screens (margin
16 → 8 px, gap 12 → 8 px): the card is 12 px shorter and clears the header.

**A known limit it now states:** at 1280×720 a long question cannot fit the docked panel (601 px against a 443 px
body), even with every fit step taken, so the panel scrolls. That breaks DESIGN 9.4 ("never scrolls") and needs a
design decision (Next).

## Checks

- Every number in the table measured on `main` and on this branch; every screenshot read.
- `verify.mjs` on all 8 examples: 0 failing ([log](verify-after.txt)). Unit tests 321 / 321 ([log](tests-after.txt)).
- HUD browser suite: 271 pass, 0 fail on this branch; 275, 0 fail on the combined branch, which adds the accuracy
  branch's checks ([log](hud-suite-after.txt)).
- `audit --a11y --at phases --themes light,dark` on MapReduce and Raft: 0 problems, before and after.
- **Not verified:**
  - Print was checked through print-media emulation only; no PDF was rendered (no PDF rasterizer here).
  - One probe finding on the phone share sheet is a false positive: in dark it flags the caption chip "the" at
    1.04:1, but the chip sits behind the opaque sheet (Next 6 removes it).

## Next

1. **A narrower docked panel while playing**, where the panel's width limits the world: MapReduce at 1440×900 would
   go from 0.88 to up to 1.17 px/u. The panel alone is 27 % of the screen.
2. A long question that can't fit the docked panel at 1280×720 needs a place to go (for example, the caption area at
   that height). Needs a design decision.
3. Folding the explain panel gives the world no width while the parameters card is docked: the card counts as a
   full-height band in `insets.right`. The director would have to handle a corner overlay.
4. A shorter first-step caption on phones: it reaches 264 px (31 % of the screen) with the Now line, the why and the
   peek. The why could wait behind its chip on a chapter's first step.
5. Cinema mode (hide the chrome while playing): a feature, so not done here.
6. Hide the phone caption while a bottom sheet covers it, as the explain sheet already does.
