> **Draft, for review only. Don't merge yet.** Screenshots, logs and the capture tools are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/28-world-focus). The code diff is under **Files changed**.

## TL;DR

Readers couldn't tell where to look. Now the world shows them:

- **Spotlight.** While a step plays, what the step is about keeps its exact look. The rest of the world recedes toward
  the floor: bodies pale in light and darken in dark, printed text and wires fade. Shape and hue stay, so a receded
  machine still reads as itself. It crossfades over half a second at each step's start.
- **Words meet the picture.** As a step begins, the things its sentence names (`map 1`, `reduce 1`, …) wear the
  chip-hover ring for 1.6 s. They are also always in the spotlight. Chips in the explain panel now light their thing
  on keyboard focus too, not only on hover, and Enter pins them, as the caption's chips already did.
- **Two strengths for you to choose from:** subtle (default) and clear, side by side below.

Branch **`guide/world-focus`**, 6 commits on `polish/after-remake` (`f874a48`).
- Unit tests 375 / 375 (4 new).
- verify: 211 runs, 0 failing (the known warnings only).
- HUD suite: 278 pass, 0 fail.
- a11y audit: no problems on MapReduce, Raft or Event loop.
- Kept tiles are unchanged against the current build (max difference 1 of 255).

## What it looks like

Each image in `shots/compare/` shows the same frame four times: **before**, **subtle**, **clear** and **dark, subtle**. Each is at
1440×900 at 2×, shown at half size.

| | |
|---|---|
| MapReduce, "over goes to reduce 1" | [compare/mapreduce-s11.png](shots/compare/mapreduce-s11.png) |
| MapReduce, "reduce 0 adds up each group" | [compare/mapreduce-s18.png](shots/compare/mapreduce-s18.png) |
| Raft, "the client sends x←3 to s1" | [compare/raft-s04.png](shots/compare/raft-s04.png) |
| Raft, "x←5 is copied to s3 and s4" | [compare/raft-s22.png](shots/compare/raft-s22.png) |
| Event loop, "then 1 runs first" | [compare/event-loop-s10.png](shots/compare/event-loop-s10.png) |
| Event loop, "the network reply is queued" | [compare/event-loop-s15.png](shots/compare/event-loop-s15.png) |

- **Full size at 2×, before and subtle:** `shots/2x/` (MapReduce step 11, Raft step 22).
- **Phone, 390×844:** `shots/phone/` (before, subtle, clear).
- **The ring as a step begins:** `shots/ring/`.
- **Live play across a step start** (−0.03 s, +0.17 s, +0.57 s, +1 s, live camera): `shots/live/`.

**Decision for you: subtle or clear?**
- Subtle is quiet. In light theme it shows mostly on coloured slips. On Raft's white servers and grey entries it is
  gentle, so it is easy to miss.
- Clear greys the receded servers unmistakably. It does not look like a crash, which is darker and has a red light.

Subtle ships. Changing it is one number, `SPOT.recede` in `engine/tokens.mjs` (0.5 now, 0.85 for clear).

## How it decides what a step is about

`engine/scene/timeline.mjs`, per step, from the run (no lesson changes):
- **In the spotlight:**
  - what the step touches (moves, spawns, sends, lights);
  - its `focus` and `look` ids;
  - everything its caption and its "why" name;
  - what holds each of those (a slip's machine) and what each holds (a machine's slips).
- **Wires** stay lit when they touch a kept thing or carry this step's traffic.
- **No spotlight** on:
  - the opening step, which shows the whole world;
  - a scale shot;
  - a step about more than 70 % of the world's things (Raft's heartbeats, most of Virtual memory).

`logs/spotlight-per-step.txt` lists every step of the three published examples, with what recedes.

**Never receded:**
- what the pointer is over;
- what is selected;
- anything lit or flashing: the Look button, your-turn candidates, messages in flight.

So pausing and exploring with the pointer still shows whatever you point at at full strength. The spotlight stays on
while paused, because the paused step is still what the words are about.

## The look is kept

- **Pixel check** (`logs/kept-pixels.txt`): base and new, same moment, inside the screen box of every kept solid.
  - Kept tiles: max difference 1 of 255, over 44 frames (desktop light and dark, phone, both strengths).
  - Kept machines differ only where a receded thing sits inside them or in front of them. Examples: Event loop's
    `micro`, which waits in the microtask queue while `then 1` runs, and Raft's messages crossing a server's edge.
- **No shader, renderer or palette change.** The skin only moves a receded pose's colours toward the stage and fades
  its text (`engine/gfx/skin.mjs`). The same primitives reach WebGPU and WebGL2. The DOM tier draws no world, so it
  has nothing to recede.
- `renderAt(t)` stays deterministic: recede is a function of (t, hover, selection), like hover already was.
- **Frame cost:** sample plus skin in Node costs +0.01 to 0.07 ms a frame (`logs/cpu-cost.txt`). The GPU work is
  unchanged: same passes, same draw counts.

## Checks

- Unit tests 375 / 375. New: spotlight sets and the crossfade, rings, a step about most of the world, the receded
  look in the skin, ids that hold `#`.
- `verify.mjs`, all 8 examples: 211 runs, 0 failing. Warnings: MapReduce 1 (its scenario name) and Raft 3 (its
  maxima), as before.
- HUD browser suite: 278 pass, 0 fail.
- `audit --a11y --at phases --themes light,dark`: MapReduce, Raft, Event loop, no problems. MapReduce's 3 frame-time
  warnings are this GPU-less machine's software rendering.
- **Not verified:**
  - a real GPU (the change adds no GPU work);
  - the other five examples' screenshots (verify and unit tests cover them);
  - Safari and Firefox.

## Next (decisions)

1. Subtle or clear (or between).
2. A Settings switch to turn the spotlight off belongs with `guide/next-cue`'s Hints switch. The runtime takes
   `options.spotlight` (0 is off) for it.
3. The printed handout's pictures get the spotlight too, since they are drawn with the same `renderAt`. Keep that, or
   draw them without it?
