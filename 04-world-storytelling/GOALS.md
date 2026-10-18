# 04 · The world as the teacher: goals

Lens: the 3D world (machines, slips, traces, camera, the scale reveal) is where "run it, don't draw it" becomes
visible. The test: **could a learner follow MapReduce from the world alone, with the panel hidden?**

## Who this serves, and the job

| Person | What they hire the world for | Success, observable |
|---|---|---|
| **Learner, new** (knows loops and dicts) | To *see* the idea: a word goes in, a slip comes out, it travels to a counter, the counter adds | With the panel collapsed they can say, at any paused frame, "this slip is `the`, it came from map 1, it is going to reduce 0, and that's where the other `the` is". They can read every slip's word at 1440×900 without leaning in. |
| **Learner, expert** | To check the mechanism is real: partitions, load, re-execution | The world carries real per-machine state (how many slips each counter holds, which map is down) instead of decoration; the hot key's load is visible *in* the world, not only in the dock. |
| **Teacher / presenter** | To point at the screen and have the class look at the right thing | The world itself lights what the step is about (the same things the panel's Look chip names), so the presenter doesn't need to hover chips; a projector at the back of a room can read the slip words. |
| **Author** | A world that tells the story without hand-tuning | Every improvement lands in the engine where it generalises (type, attention, camera), and the figure only chooses what its housings say. |

"Complete" for the world means: every step has **one** obvious place to look, the thing there is **readable**,
its **cause** (where it came from) is in the same frame as its **effect**, every number printed on a solid is
**from the run**, and the empty or idle parts of the world **say so** instead of looming. Both themes, both
backends, desktop and phone.

## Audit of the baseline (with evidence)

Backend note first: **headless capture on this box draws with WebGL2.** `navigator.gpu` exists, but the WebGPU
device fails to start and the page falls back. My probe over `__internals` reports `backend: "webgl2"` on every
shot, and a forced `?gfx=webgpu` logs the `[gfx]` error and still draws with WebGL2. So every baseline PNG is
the WebGL2 tier (printed zones, not glass plinths), and WebGPU cannot be viewed on this box. Everything I change
must therefore live in the backend-neutral layers (tokens, skin, scene, director, figure). Both backends consume
these through the same DrawList, so the WebGPU tier gets the changes too.

### Legibility

1. **Slip words print at about 8–10 CSS px.** I measured px/u at a slip with my probe over `renderAt` at
   1440×900: 0.89 in the establishing shot, 1.17 in the shuffle push, and 1.0–1.6 in detail shots. The record
   label is 9 u (`SIZE.record.label`), so for most of the run a slip's word is drawn at an 8–10 px font size.
   That is smaller than the HUD's smallest text (12 px, `TYPE.scale.xs`). In `crash-dark-1440x900-005-mid.png`,
   "the 1" and "quick 1" are barely legible; in `happy-light-1440x900-011-mid.png`, "jumps" and "lazy" need a
   squint. The label fills only 37 % of the slip's depth (9 of 24 u), so the slip has room for more.
2. **Header sub-labels are unreadable** at 7.2 u (`WORLD_TYPE.sub`), which is about 6–7 px. Every one of them is
   an IP address (`192.0.2.10`, `figure.mjs:209,212`); see any 1440 shot.
3. **The zone labels "Map" and "Reduce" are 11 u, muted, and in the corner** (`WORLD_TYPE.zone`). In
   `crash-dark-1440x900-005-mid.png` they are about 9 px of grey text at the top-left of each zone, the least
   noticeable text on screen. Yet they are the world's names for the chapters the panel is in.

### Signal against noise

4. **IP addresses are the only per-machine text besides the title.** They never change, and the lesson never uses
   them. Meanwhile the per-machine facts that *do* matter appear only in the panel or the dock: how many slips a
   counter holds, that a map is down, that the output is still empty. Other examples already use the sub-label
   for live state (`event-loop` "0 lines", `btree` "N ids", `consistent-hashing` "x % of ring"), so MapReduce is
   the odd one out.
5. **The empty output disc dominates the frame for four chapters.** It is the largest solid (a round store sized
   for 8 totals), and detail shots slide toward it to avoid bare floor (`director.mjs` `fillShot`). In
   `happy-light-1440x900-012-end` (the aha step, "the from map 1 goes to reduce 0 too") and `…-018-end`
   (reduce 0 adds up fox = 2 and the = 3), the empty disc fills half the world area. It is labelled
   `part-r-0000*`, a Hadoop file glob that a beginner cannot read.

### Where to look

6. **The world does not light what the step is about.** The lesson names `look` ids for almost every step
   (`lesson.txt`: `look m0`, `look m1.s1.w2, r0`, `look r0` …), but the world lights them only while the reader
   *hovers* the Look chip (`runtime.mjs:364`). The level table in DESIGN.md 9.4 says that at Expert "look: none
   (the world still lights)", but nothing lights it. Moved tiles light themselves, but the step's other subjects
   do not: a destination machine, the mapper that is reading, or the reducer that is sorting.

### Provenance and causality

7. **Detail shots frame the effect without its cause.** `shots.mjs` `marksOf` takes a step's look box at the
   step's *end*. For "`the` from map 1 goes to reduce 0 too", the slip ends in reduce 0, so the detail shot
   frames reduce 0 (plus the empty output), and map 1, where the slip came from, is off-screen
   (`base-happy-light-1440x900-012-end.png`). The one step the lesson calls the aha is shown without its "from".
8. **Why a hot key hurts is invisible in the world after the shuffle.** In skew, at the Output chapter
   (`skew-dark-1440x900-027-mid.png`), all three reducers are empty and look identical; "reduce 0 got 12 of 14
   slips" exists only as words in the panel. Even during the shuffle, the load is only implied by how full each
   tray is.
9. **A housing's tag can sit on the wrong machine.** In `crash-dark-1440x900-005-mid.png`, map 1's "stopped
   answering" chip is drawn over map 0's tray. A housing's tag anchors at its back edge, and the column's gap
   (18 u) is smaller than the chip.

### Colour as meaning

10. **The identity palette collapses for red-green colour-blind readers exactly where the story is.** I simulated
    the 8 key colours (Machado 2009 matrices, CIELAB ΔE). Key 0 against key 3 is ΔE 4.9 under deuteranopia
    (light theme) and ΔE 2.9 under protanopia (dark theme): effectively the same colour. In the default run,
    key 0 is `the` and key 3 is `fox`. These are the two repeated words, and they sit side by side in reduce 0
    when the lesson says "fox = 2 and the = 3". Words are printed on the slips, so colour is not the only cue,
    but colour is what the eye uses to group.
11. The dock legend reads "8 keys" with four swatches (every 1440 shot). There is no world legend, but there
    doesn't need to be one: each slip prints its word. This gap is not worth adding chrome for.

### Camera

12. The plan's vocabulary (establish, push, detail, pull, payoff, scale) is good, and the camera is a pure function
    of time, so it stays smooth across a scrub (`shots.mjs` `cameraAt`). Its weak spots are #7 and the phone: the
    baseline audit reports `focus-outside` at steps 4, 19 and 22 on 390×844 (`00-baseline/shoot-log.txt:12`).
13. The scale reveal (`happy-light-1440x900-024-end.png`) is clear and correctly labelled.

## Ideas, ranked (impact on the learner against cost and risk)

| # | Idea | Impact | Cost / risk | Rank reason |
|---|---|---|---|---|
| 1 | **Slip words that fill the slip**: record keys at about 11 u, shrunk to fit their measured width so they never overflow | Very high: every frame, in every example with records | Low–mid: tokens and skin; the fitting handles the overflow risk | The single most visible fix for "I can't read it"; cheap and general |
| 2 | **The world lights the step's `look` ids** (eased, exact under scrubbing, in the timeline): the same light the Look chip gives | Very high: "where to look" from the world alone, at every level | Mid: engine, touches the frames of all 8 examples | Makes the panel and the world point at the same thing; DESIGN already promises it |
| 3 | **Housings say what they hold**: sub-labels carry live run state (slips, totals, down, empty) instead of IPs, and are readable (sub 7.2 → about 8.5 u) | High: the hot key's load, the empty output and the crashed map become visible facts | Low: figure, plus a token | Signal replaces noise, and it matches the other examples' idiom |
| 4 | **Detail shots frame cause and effect**: the look box spans where the look ids start and where they land | High at the aha step and every key move | Mid: director, all examples | Provenance is the lens's core question |
| 5 | **Colour-blind-safe key order**: reorder the 8 identity colours so the first five stay apart under deutan and protan (min ΔE 2.9 → 24) | Mid–high for the roughly 8 % of male readers with red-green colour blindness; no cost to others | Mid: every example's colours shift (same hues, new order) | A real accessibility gain with no change to the palette's look, but it churns every image |
| 6 | **Zone names you can read**: Map and Reduce larger, in ink | Mid: the world names its stages | Low: tokens | Cheap, and it ties the world to the chapters |
| 7 | **Skew load in the world**: reducer meters (each one's share of slips) and subs | High for the skew story | Low: figure (the meter already exists) | Shows "why it hurts" as a picture |
| 8 | Anchor a housing's tag on its own housing (not its back edge) | Mid: the crash moment | Mid: sampler, and a HUD chip that can point up | A real ambiguity, but it needs a new chip direction; defer unless there is time |
| 9 | Recede what is not in play (desaturate it a little) | Mid | High: murky frames, and it conflicts with `dim` meaning dead | Light the subject first (2); recede the rest only if 2 is not enough |
| 10 | Show each split's words on its page | Mid | High: the page width drives the tray's slot width (layout `traySpec`), so the mappers would double in width | Idea 4 serves provenance better |
| 11 | Raise the director's minimum zoom | Mid | Mid: crops wide worlds in other examples | Idea 1 gets the same gain without cropping |
| 12 | A world legend of word colours | Low | Mid | The words are printed; a legend is chrome |
| 13 | Make the output disc smaller, or hide it until it is used | Mid | Mid: the layout is fixed per run by design | Ideas 3 ("empty" sub) and 4 (framing) address it more cheaply |
| 14 | Phone `focus-outside` at steps 4, 19 and 22 | Mid | Mid: director hold logic | Check after 4, and fix it if it is mine |

## The chosen set

1. **Readable slips** (ideas 1 and 6): record keys sized to fill the slip and fitted to its width; zone names and
   housing sub-labels up a step. Engine tokens and skin.
2. **The world points where the lesson points** (idea 2): each step's `look` ids light in the world for that step.
   Engine timeline.
3. **Cause and effect in one frame** (idea 4): detail shots hold where a look id starts as well as where it ends.
   Engine director.
4. **Housings that report the run** (ideas 3 and 7): live subs on every MapReduce machine, an output that says
   when it is empty, and in skew a load meter on each reducer. Figure.
5. **Colour-blind-safe identity order** (idea 5): one token reorder, in its own commit so the owner can drop it.

Why these: together they answer the lens's five questions (legibility, signal, where to look, provenance,
colour). Three are engine changes that every example inherits, and one is a figure change that shows how a
figure should use the world. Each is substantial in effect but small in code, so the risk is in the look, which
I can judge from the shots.

## What I will deliberately not do

- **No backend shader work.** WebGPU cannot run here, so I won't touch WGSL or GLSL. All changes go through the
  DrawList that both backends read.
- **No HUD or lesson-word changes** beyond what the figure's world needs, since other lenses own the panel and the
  words. I won't change the words in `lesson.mjs`; I only make visible the look ids it already names.
- **No fake data.** Meters and subs print only counts the run computed; no decorative counts.
- **No "recede everything else" pass** unless the lit-look change proves too weak. In this design language,
  dimming means "dead" (DESIGN.md 6), and overloading it would lie.
- **No new legend chrome**, and no smaller output disc (the layout is fixed per run on purpose).

## At the end: what changed in my thinking

- **All five chosen changes shipped, plus idea 8.** The tag anchor (idea 8) turned out cheaper than I feared: no new HUD
  chip direction was needed, because a crowded housing can anchor its chip on its own tray. It costs some occlusion
  (the chip covers the tray's top row), which I judged better than pointing at the wrong machine. A sideways chip is
  still the right long-term answer.
- **Signal against noise moved more than I expected.** Swapping the IP sub-labels for live counts did more for the
  "world alone" test than any type size. In the skew story, `got 12 slips` / `no slips` / `got 2 slips` beside the meters
  reads as the hot-key lesson with the panel hidden. A late refine added `0 slips` when the shuffle opens: an empty
  counter used to keep saying `waiting` while the others filled, which hid the very imbalance the story is about.
- **The empty output disc is still the weakest frame.** The `empty` sub-label says what the disc is, but in the
  Reduce-chapter close-ups it still takes a third of the frame. That is the director's `fillShot` policy (no bare floor),
  and changing it is a layout decision for the owner, so it is in *Next* and not in this branch.
- **WebGPU could not be checked by eye.** Headless Chrome on this box falls back to WebGL2 every time, so I kept every
  change in the backend-neutral layers. Parity holds by construction. I have not seen it.
- **The colour-order change is real but costly in churn.** Under simulation, the minimum ΔE among the first five keys
  went from 2.8 to 24.2. It shifts every example's colours, so it is a separate commit that the owner can drop.
