# Interface and access: goals

The view taken here: the MapReduce page as an **interface**. Judged first as a product designer would judge a Linear or Apple
surface (what is primary at each moment, does every pixel earn its place), then as an accessibility specialist
(WCAG 2.2 AA), then as someone on a small phone, a zoomed browser, or a machine without a GPU.

## Who this serves, and the job they hire the page for

| Person | The job | Success, observable |
|---|---|---|
| **A learner who cannot see the screen** (screen reader: VoiceOver, NVDA) | Learn MapReduce from the same run everyone else sees | Steps through the whole lesson with the keyboard alone and hears, in order: the chapter it is in, what happened, why it matters (as their level shows it), what changed in the world, and whether their prediction was right. Never lost, never flooded. |
| **A keyboard-only learner** (motor impairment, power user) | Drive the page without a mouse | Every control, every pick and prediction, and every thing in the world is reachable with Tab and the arrows in a sensible order; focus is always visible; the shortcuts are discoverable without already knowing them. |
| **A low-vision learner** (zoom 200 %, needs contrast) | Read every word | All text at 4.5:1 against what is actually behind it (including text over the world); no control collides with another at 200 % zoom. |
| **A learner on a small phone, portrait or landscape** | Watch and read on the bus | The world is visible, the words are legible over it, controls are thumb-sized (≥ 24 px, mostly 44), nothing overlaps. |
| **A learner on a machine with no GPU** (old school laptop, locked-down lab, remote desktop) | Still learn | Sees a real picture of the run's state, in words, not an empty stage. |
| **A learner on a 1440×900 laptop** | Follow the lesson | The teacher (the explain panel) has room to say the step without being cut off; parameters are there but do not compete. |
| **Authors** (people running `/explainer`) | Ship a page that is accessible without being an a11y expert | `audit.mjs --a11y` tells them objectively, in plain lines, what fails: contrast against real pixels, target size, names, focus. |

## What "complete" means for these people

The whole journey: open the page (start card) → pick a level → play or step → predictions and the in-world pick →
chapter pauses → the end (recap, takeaway, what-ifs) → switch scenario → change a parameter. For each person above
every stage must work with their input (mouse, keys, touch) and their output (eyes, ears, small screen, no GPU),
including:
- **edges**: an open question at 200 % zoom; the end card on a short screen; help on a landscape phone
- **empty states**: no GPU at all; a step that changes nothing in the world
- **the moment after**: after the end, the next scenario is reachable from the keyboard and is announced

## Audit of the baseline (with evidence)

Evidence: `00-baseline/shots/`, my own probes in `shots/extra/before-*`, and the measured logs in this folder
(`narration-before.txt`, `focus-order-before.txt`, `audit-before.txt`, `audit-a11y-before.txt`).

### Screen-reader narration (what a blind learner hears)
I recorded every `aria-live` region while moving through "Everything works" at New (`narration-before.txt`).
What already works well: each step's plain line is spoken, then the described scene says what changed ("quick, 1
moved from map 0 to reduce 0. Look at: quick, 1 and reduce 0."). A strong base. Gaps:
1. **Chapters are never announced.** A sighted reader sees "Shuffle", "3 of 5", the chapter's about and its entry
   card; the listener hears nothing when the chapter changes (`narration-before.txt`: step 7 goes straight from
   "map 2 writes a slip…" to "the goes to reduce 0…").
2. **The why is never spoken**, even at New, where it is on screen for every step that has one. The live region
   speaks the plain layer only (`engine/hud/hud.mjs` `announce()` reads `S.capText`).
3. The predict card is one large `aria-live` section that is also `role="dialog"` (`hud.mjs` ~831): every change
   inside it (status, foot, feedback) is announced piecemeal, and the result is never one clear sentence.

### Keyboard and focus order
Measured with real Tab presses (`focus-order-before.txt`):
4. **The explain panel, the page's teacher, is the last thing in the Tab order**: header → world → dock → seven
   parameter controls → the help button → only then the chapter dots, the level switch, Look and More
   (`createExplain` appends the panel to the HUD after everything else). The screen-reader reading order is the
   same: the words that explain the step come after every control.
5. Help ("?") is reached only after the parameters; the shortcuts (P presenter, T theme, L level, E explain) are
   discoverable only by opening help or by hovering a control.

### Small, zoomed and landscape screens
6. **At 200 % zoom (720×450 CSS px) the help circle sits on top of the Look chip**
   (`shots/extra/before-zoom200-720x450.png`): it is pinned bottom-left "just above the dock", exactly where the
   one-row layout puts the caption's chips.
7. On a landscape phone (844×390) the same circle crowds the Look chip (`shots/extra/before-landscape-844x390.png`).
8. On a portrait phone the readout strip ("Words read / Sent / ⓘ / swatches") is a 44 px row of its own above the
   transport; with the caption the bottom stack takes ~37 % of 844 px (`happy-light-390x844-011-mid.png`).
   `references/roadmap.md` asks for "a one-line strip".
9. The phone caption's meta line ("Shuffle · step 6 of 11", `.ix-cap-meta`, 12 px `ink3`) sits directly on the
   world: in `happy-light-390x844-011-mid.png` it is printed over the yellow "jumps" tile.

### Space and hierarchy on a laptop
10. At 1440×900 the parameters card (~270 px) and the explain panel share the right column; the panel gets ~430 px
    and **the end of the run is cut off**: in `skew-light-1440x900-028-end-card.png` the "Next question / Replay
    Shuffle" row is clipped by the panel's bottom edge. While a lesson plays the step's words are primary; the
    knobs are for exploring.

### Robustness
11. **No GPU = an empty page.** With WebGL and WebGPU disabled (`--disable-3d-apis`) the stage is blank paper with a
    toast "WebGL is unavailable here…" (`shots/extra/before-nogpu.png`). The described scene
    (`engine/a11y/scene.mjs`) already holds a complete, live, structured picture of the world in words, but it is
    visually hidden.
12. No `lang` on the figure root; the HUD's ~200 strings live inline in `hud.mjs`, `explain.mjs`, `turn.mjs`…
    (translation needs an extraction pass).

### The objective audit
13. `audit.mjs` checks the world (labels, tags, focus framing) but nothing about the interface: no contrast, no
    target size, no names, no focus visibility. An author cannot know whether their page is accessible.

## Ideas (ranked by impact on these people against cost and risk)

| # | Idea | Impact | Cost / risk | Why ranked here |
|---|---|---|---|---|
| 1 | **`audit.mjs --a11y`**: contrast against the real pixels behind each line of text (the page shot once with the HUD's glyphs made transparent), target size with WCAG's spacing exception, accessible names, visible focus | High: every author, all 8 examples, every future change is measured | Medium; script-only, no runtime risk | Makes "accessible" objective and keeps it so; my before/after rests on it |
| 2 | **Narration that teaches**: announce the chapter on entry ("Chapter 3 of 5, Shuffle"), speak the why when the level shows it, one clear sentence for a prediction's result | High for blind learners | Low; the HUD's announce path | Closes gaps 1–3; the scene's change sentence stays as is |
| 3 | **Reading and Tab order**: the explain panel right after the header, then the parameters, the world, the dock | High for keyboard and SR users | Low; DOM order only, no visual change | Gap 4 |
| 4 | **A world in words when there is no GPU**: the described scene becomes a visible, typographic board in the free stage | High for the no-GPU learner; it makes the graceful-fallback rule real | Medium; CSS plus one class from the runtime | Gap 11; reuses the truth the a11y layer already computes, so "run it, don't draw it" holds |
| 5 | **The teacher first on laptops**: the parameters card starts folded to its one-line header while a lesson is present (open on demand, remembered as today) | Medium-high: every 1440×900 reader | Low; one default | Gap 10 |
| 6 | **Help never collides**: where the circle would crowd the caption (compact, short, zoomed screens) the "?" joins the toolbar | Medium (zoom, landscape) | Low | Gaps 6, 7 |
| 7 | **Fix what the audit finds** (faint text over the world, crowded small targets) | Medium-high | Low–medium | Gap 9 and whatever `--a11y` reports |
| 8 | **A one-line readout on phones** | Medium (more world on phones) | Medium; phone dock CSS | Gap 8, roadmap |
| 9 | **Discoverable shortcuts**: the first time someone uses the keyboard, a quiet one-time hint "Press ? for every shortcut"; help explains the timeline's marks | Medium | Low | Gap 5 |
| 10 | `lang` on the root (from `meta.lang`, default `en`) | Low-medium (SR pronunciation) | Trivial | Gap 12 |
| 11 | Cinema mode: chrome fades while playing, the world reframes full-bleed | Medium for watchers | High: the camera reframes every time chrome hides or returns (distracting, against reduced motion); overlaps E (tuck the panel), full screen and presenter mode | Roadmap idea, but E + F give most of it today |
| 12 | Full string extraction (`strings.mjs`, `t()`) for translation | High long-term | High: touches nearly every line the other product branches edit in `hud.mjs` → conflicts across six branches | Should land alone, after those branches merge |
| 13 | Non-text contrast (1.4.11) for control borders | Low-medium | Medium | Hairline pills are a deliberate design choice; a later pass |

## The chosen set

1, 2, 3, 4, 5, 6, 7, 9 and 10, and 8 if time allows. They move the product most for the people above: a blind
learner follows the lesson in order and hears the teacher; a keyboard learner meets the teacher first; a no-GPU
learner gets a world; a laptop reader gets the teacher's whole column; zoom and landscape stop colliding; and every
author gets an objective a11y report. All are engine-wide, so they apply to all 8 examples.

## What I will deliberately not do

- **Cinema mode** (11): reframing whenever chrome hides or returns fights DESIGN.md §8 and the reduced-motion
  promise; E and F already give a large world on demand.
- **Full i18n extraction** (12): right idea, wrong moment; it would conflict with every other product branch in `hud.mjs`.
- **Restyle the HUD.** DESIGN.md's monochrome, hairline, typography-led language stays; every fix uses its tokens.
- Touch the renderer, the lesson's words or the simulation.

## What changed in my thinking

- **Measuring what a reader actually sees is harder than measuring tokens, and worth it.** The first `--a11y` run
  reported five light-theme contrast failures, the worst the explain panel's "Earlier" list at 3.70:1. Every token
  involved (`ink3` #676B73 on a white surface) is 5.3:1. The failing lines were list rows scrolled out of the panel
  and a line-clamped third line, which the reader cannot see, measured against whatever lay behind the panel. The
  probe now clips each line of text to its scrolling and clipping ancestors and skips a scroll edge's fade. After
  that, the desktop panel is clean, and the two real failures stood out.
- **The real failures were not where I expected.** I had guessed faint grey text. The audit found (1) the status
  tones used as words ("crashes", "Done", a right answer's tick): in the light theme all four (`ok`, `busy`, `warn`,
  `fail`) are between 2.4:1 and 3.9:1 as text, because they are tuned as colours on tiles, not as ink on paper; and
  (2) the phone caption's meta line ("Shuffle · step 6 of 11"), the faintest ink at the edge of a radial plate,
  printed straight on a moving tile (1.09:1 in the worst frame). Gap 9 above, now measured.
- **Idea 8 shrank.** The phone readout became one line (name and value on one baseline, 44 → 36 px) rather than a
  merged strip; a fuller merge with the transport would have collided with other changes in the dock.
- **Not done, still right to skip:** cinema mode, string extraction, non-text contrast of hairline borders.
