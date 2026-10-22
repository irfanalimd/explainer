> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/12-frame-cost), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/12-frame-cost/GOALS.md)) and the raw measurements. The code diff is under **Files changed**.

## TL;DR

- **Live play without a GPU is faster again.** MapReduce goes from 2.13 to 2.48 fps at 1440×900 and from 6.53 to
  8.60 fps on a 390×844 phone. Raft goes from 2.26 to 2.65 and from 7.11 to 8.26.
  - The floor plane is now shaded only where no slab covers it.
  - Drafts take a lighter shadow filter.
- **A paused page comes to rest about 3× sooner.** The frames where only an afterglow or ping is still fading are now
  drafts, as frames in motion already were. MapReduce at 1440×900 rests after 4.3–4.9 s instead of 12.7–16.9 s.
- **A full frame costs 12–14 % less** (the floor change). Drawing the same moment again also keeps the shadow,
  contact and bounce maps.
- **Captured frames don't change:**
  - MapReduce's 160 frozen shots: 159 byte-identical to `main`'s; the other differs as `main` differs from itself;
  - Raft's 24 of 24 byte-identical;
  - the handout's 8 pictures byte-identical.
- **`shoot --teach` keeps fading frames full**, so its cards are drawn as on `main`. They differ from `main`'s no more than
  `main`'s own runs differ from each other, except three end cards framed a little differently (below).
- **Not done:** a draft scale that adapts to frame time, which can't do anything on this machine (below).
- **One cost:** the first frame on a phone comes about 0.35 s later (below). At 1440×900 it is unchanged.
- Branch **`perf/frame-cost`**, 6 commits on `main` (`1f93977`). Unit tests 332 → 335.

## Before and after

Measured on this machine (4 cores, no GPU, Chrome drawing WebGL2 on SwiftShader), with nothing else using Chrome and
`main` and this branch alternating. Medians of three unless noted. Other jobs kept the machine at load 3–7, so treat
differences under about 10 % as noise.

| | `main` (1f93977) | this branch |
|---|---|---|
| **Live play, MapReduce, 1440×900** (frames drawn per second, story playing at 0.5×) | 2.13 fps | **2.48 fps** |
| **Live play, MapReduce, 390×844** | 6.53 fps | **8.60 fps** |
| Live play, Raft, 1440×900 / 390×844 (one run each) | 2.26 / 7.11 fps | 2.65 / 8.26 fps |
| A full frame, MapReduce mid-run, 1440×900 / 390×844 (`renderAt` to pixels on screen) | 1.73 / 1.76 s | 1.50 / 1.56 s |
| The same moment drawn again, 1440×900 / 390×844 (median of four) | 1.42 / 0.91 s | 1.22 / 0.60 s |
| **A fade frame after a pause, 1440×900 / 390×844** (two loads, six pauses each) | 1.63–1.69 / 0.73–0.80 s | **0.43–0.47 / 0.18 s** |
| **Pause to rest when something was fading, 1440×900** | 12.7–16.9 s | **4.3–4.9 s** |
| Pause to rest when something was fading, 390×844 (mean of 3–4 rests a load) | 7.5–8.7 s | 2.5–3.5 s |
| Handout pictures, MapReduce (8) | 25.4 s | 25.5 s (byte-identical) |
| Time to first frame, 1440×900 (five rounds) | 3.80 s | 3.77 s |
| Time to first frame, 390×844 (three batches of 3–5 rounds) | 2.44 / 2.13 / 2.46 s | 2.80 / 2.62 / 2.81 s |
| Frozen screenshots, MapReduce, all 4 stories, both themes and sizes (160) | `main` against itself: 157 byte-identical | 159 byte-identical to `main` |
| Raft, first story (24) | | 24 byte-identical |
| Teaching cards, MapReduce, every story, 390×844 dark (28): median share of pixels that differ | `main` against itself: 2.12 % | 2.03 % / 2.13 % against `main`'s two runs |
| That teaching pass, side by side | 437 s | 407 s |
| `audit --a11y --at phases --themes light,dark`, MapReduce | 0 problems | 0 problems |
| Unit tests / verify on all 8 | 332 / 211 runs, 0 failing | 335 / 211 runs, 0 failing |

---

## Where a draft frame's time went

Before changing anything I switched parts of a live MapReduce frame off with the renderer's debug flags, one page
load each, in the same session ([raw](raw/draft-parts-profile.txt)):

| | 1440×900 | 390×844 |
|---|---|---|
| everything | 1.51 fps | 2.55 fps |
| no floor plane | 3.86 | 7.00 |
| no shadow sampling | 2.74 | 3.42 |
| no slabs | 2.77 | 5.57 |
| no bloom | 2.18 | 2.23 |

The floor plane and shadow sampling cost the most. The three maps #11 listed under Next (shadow, contact, bounce)
hardly figure: with all three kept, a frame is about 5 % cheaper. So I kept that change, since it is cheap and safe,
and added two that go after the real cost.

## 1. The floor is shaded only where no slab covers it

`4c76959`, `engine/gfx/backends/webgl2/renderer.mjs`. The floor plane is a full-screen pass, and it was drawn before
the slabs. So every pixel ran the floor's lighting, shadow and contact lookups, and most slab pixels then painted over
it. Now the opaque slabs draw first and the floor after them with the depth test, so a covered pixel skips the
floor's shader. The floor passes ties (`LEQUAL`) as it did when it was drawn first and a slab failed them (`LESS`).
So per sample the nearer surface wins as before, ties go to the floor as before, and every sample comes out the same.
The PNG pairing and the byte-identical handout bear that out. A full frame: 1.73 → 1.50 s at 1440×900, 1.76 → 1.56 s on
the phone.

## 2. Frames where only a fade is running are drafts

`4a00285`. Files: `engine/runtime.mjs`, `engine/gfx/select.mjs`, both renderers.

**The problem.** After a pause the page keeps drawing while an afterglow (1.1 s) or a ping (0.7 s) fades out. A fade
runs on the render clock, at most 1/20 s a frame, so it takes the same number of frames however slow they are: up to
22. Without a GPU each of those was a full frame, 1.6 s at 1440×900, so a paused picture took 13 to 17 s to come to
rest, and the teaching cards in `shoot --teach` wait on the same fades (#12).

**What changed.** The renderers say when the last frame was still fading (`fading`). On WebGPU this is kept apart from
`busy`, which also covers a resting picture still gathering its temporal samples, and that picture is never a draft.
The runtime drafts the next frame while the last one was fading, and draws the frame it comes to rest on again in
full, as it already does when the camera comes to rest. A fade frame goes from 1.63–1.69 s to 0.43–0.47 s at
1440×900 and from 0.73–0.80 s to 0.18 s on the phone ([raw](raw/fade-cycles.txt)). Captured frames never draft, so
no shot changes.

**The teaching cards** (`23582b3`, `scripts/shoot.mjs`, both renderers). `shoot --teach`'s cards are screenshots of
live play, often taken while an afterglow fades, so a card could now be shot as a draft. The renderers' `fading`
honours `debug.draftFades`, and the teaching pass sets it false for its page, so a fading frame there is drawn in
full, as before. Only fade drafts are turned off. Play between cards and the camera's easing stay drafts, as on
`main`, so the camera gets the frames it got there. Turning every draft off would have given it fewer, slower frames
and framed the cards differently. Nothing else in `scripts/` screenshots live play: `shoot`'s phase shots, `audit`,
`record` and the review packet all capture frozen frames, which never draft.

## 3. Drafts take a lighter shadow filter

`b1c83c6`, `engine/gfx/backends/webgl2/shaders.mjs`, `renderer.mjs`. A shadowed pixel took 9 coarse, 12 search and
16 filter taps, on the floor and on every slab. A draft now takes every third search tap and every fourth filter tap
(4 and 4), still rotated per pixel (`uShadowP.w` 2). Full frames take the same taps in the same order as before.
Together with section 1, live play goes from 2.13 to 2.48 fps at 1440×900 and from 6.53 to 8.60 fps on the phone. Mid-run
the drafts look the same as `main`'s, and the world's names read at both sizes:

| `main`, playing | This branch, playing |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/12-frame-cost/shots/main-1440-playing.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/12-frame-cost/shots/branch-1440-playing.png?raw=true) |
| ![](https://github.com/irfanalimd/explainer/blob/review/12-frame-cost/shots/main-390-playing.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/12-frame-cost/shots/branch-390-playing.png?raw=true) |

At rest, the frame is the full one:

![](https://github.com/irfanalimd/explainer/blob/review/12-frame-cost/shots/branch-1440-at-rest.png?raw=true)

## 4. The shadow, contact and bounce maps are kept while their inputs don't change

`a31b6ca`, `engine/gfx/backends/webgl2/renderer.mjs`, `mapkey.mjs` (new, with a test). The three maps depend on the
slabs' placements and footprints and on the world's bounds, never on the camera. Each map now keeps the inputs it was
drawn from (`MapKey`: compared exactly, in doubles) and is skipped when they are the same:
- the shadow pass compares the slab texels its vertex shader reads and the light's box;
- the contact and bounce passes compare their footprints and the plan rect.

The full tier and the draft tier keep a set of maps each, so a change of tier no longer reallocates the 2048 px maps
either. It helps a frame that only moves the camera or draws the same moment again, such as a change of speed or the
full frame after a draft. Live play changes the slabs every frame, so it gains nothing there. The same moment drawn
again: 1.42 → 1.22 s at 1440×900, 0.91 → 0.60 s on the phone (with section 1).

**WebGPU:** this, section 1 and section 3 are WebGL2-only. They change no pixel of a full frame, so the tiers' parity
is untouched. On a GPU, where WebGPU runs, frames are cheap anyway. Section 2 is mirrored on both tiers, because the
runtime decides drafts for both.

## 5. Not done: a draft scale that adapts to frame time

On this machine every draft runs 4 to 10 times over any frame budget, so an adaptive scale would sit at its floor all
the time. The floor can't go below 0.75 without losing the world's names (round 3 measured 0.5 unreadable at
1440×900). So here it would behave exactly like today's fixed 0.75, and I had no slower-than-GPU but fast machine to
show it doing anything. It is listed under Next.

## 6. Docs

`a19cb13`, `23582b3`: CONTRACTS.md 3.1 and the tooling guide say:
- which frames are drafts now (fades too, `r.fading`);
- that a draft takes a lighter shadow filter;
- that the frame the picture rests on is drawn in full;
- that `shoot --teach` turns fade drafts off (`debug.draftFades`).

## Checks

- Frozen screenshots unchanged ([pairing](png-pairing.txt)):
  - MapReduce, all 4 stories, both themes and sizes: 159 of 160 byte-identical to `main`. The other (phone, dark,
    step 1) differs by 23 px in the dock's text, as a second run of `main` differs from the first (157 of 160);
  - Raft's first story, 24 of 24;
  - the handout's 8 pictures, byte for byte.
- Teaching cards ([pairing](teach-card-pairing.txt)): MapReduce, every story, 390×844 dark, cards only.
  - `main` ran twice for its own noise; the branch ran side by side with the first run.
  - Across the 28 cards the branch differs from `main` by a median 2.03 % and 2.13 % of pixels; `main` differs from
    itself by 2.12 %. The worst card is 17.7 % against `main`'s 15.2 %.
  - 25 of 28 cards sit inside `main`'s own range. Three end cards (crash's end check and "You can now", the first
    story's end caption) are 1 to 2.6 points farther from both `main` runs than those are from each other: the same
    card and words, with the world behind framed a little differently. Fade drafts are off there, so the likely cause
    is the cheaper frames of sections 1 and 3: the camera eases only when a frame is drawn, and it gets more of them in
    the 1.4 s before each shot.
  - The pass took 407 s against `main`'s 437 s, side by side.
- The committed branch builds the page the cards were paired on, byte for byte. The frozen shots were paired on the
  build before the `draftFades` switch, which captured frames never consult.
- `verify.mjs` on all 8 examples: 211 runs, 0 failing ([log](verify-after.txt)). Unit tests 335 / 335
  ([log](tests-after.txt)).
- `audit --a11y --at phases --themes light,dark` on MapReduce: 0 problems ([log](audit-a11y-after.txt)).
- Every screenshot here was read.
- **Not verified:**
  - A real GPU, and the WebGPU tier's fade drafts. WebGPU's canvas is blank in headless screenshots here (#11).
  - Whether the lighter draft shadows show on a world with tall casters. MapReduce and Raft were checked; their
    shadows are short.
- **A cost I could not remove:** the first frame on the phone comes about 0.35 s later. Three batches agree on the
  direction, though their ranges overlap: 2.44 → 2.80, 2.13 → 2.62, 2.46 → 2.81 s. At 1440×900 it is unchanged. The
  first frame itself draws faster, and a per-frame log shows it starting no later, so the time is most likely the
  first draw's shader compile. Half of it goes with the draft shadow filter's run-time loop stride; I could not
  isolate the rest.

## Next

1. **Find the phone's first-frame cost.** Try constant-bound loops for the draft shadow filter, or a separate draft
   shader, and time each piece of the first draw.
2. **Steadier teaching cards.** A card is shot 1.4 s after the run stops, wherever the camera's easing has got to, so
   faster or slower frames frame it differently: the three end cards above, and `main` varies the same way between its
   own runs. Waiting for the camera to rest before each card would make the cards repeatable, but different from
   `main`'s, so it needs a decision.
3. A draft scale that adapts to frame time, between 0.75 and 1, for software rasterizers fast enough to afford more.
4. A cheaper floor in drafts: its point lights and dots grid run on every uncovered pixel.
5. Mirror sections 1 and 3 on WebGPU once that tier can be checked.
