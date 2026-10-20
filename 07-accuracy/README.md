> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/07-accuracy), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/GOALS.md)) and the check logs. The code diff is under **Files changed**.

## TL;DR

- **The camera keeps the step's subject in shot.** `audit` has always flagged MapReduce's phone layout ("focus outside
  the frame" at steps 4, 19 and 22), so `check` said "Needs work". There were two real causes: wide screens did not
  hold the step's focus in detail shots, and every step's camera move started only when the step did. Across all 8
  examples, the time the focus spends out of shot (sampled every 0.1 s) went from 65 s to 0 on a phone and from 310 s
  to 0 at 1440×900. `check` on MapReduce now says "Passes the quick check".
- **verify tries every knob at its extremes together**, on the phone layout. That found a real bug: Event loop's
  "Taking turns" story counted repaints the page never needed in 90 of 780 knob combinations.
- **Four correctness gaps from the roadmap are closed:**
  - counters can belong to some stories only;
  - an unset reading shows "—", not `0.0×`;
  - lane-mark names stack instead of colliding;
  - `{ref:id}` chips take the entity's key colour.
- **Two more fixes found along the way:**
  - Event loop printed raw markup (`{key:timeout}`) in 55 lesson lines, and verify now catches that in any figure;
  - Raft's `x←3` tiles overflowed their face.
- Branch **`polish/accuracy`**, 10 commits on `8ccff12`. Unit tests 321 → 328, verify 0 failing on all 8 examples.

## Before and after

| | `main` (8ccff12) | this branch |
|---|---|---|
| `audit --at phases`, MapReduce, both sizes | focus outside the frame at steps 4, 19, 22 (5 times, all 390×844) | **0 problems** |
| Focus out of shot, 0.1 s sweep over the shot plan, all 8 examples (657 steps), 390×844 | 89 steps, 65 s | **0 steps** |
| The same at 1440×900 | 119 steps, 310 s | **0 steps** |
| Focus under the HUD (in the viewport, outside the free area), 390 / 1440 | 130 s / 531 s | 12 s / 0.7 s |
| `check` verdict, MapReduce, quick tier | "Needs work" | **"Passes the quick check"** (80 shots, 0 findings, 0 page errors) |
| `audit --at phases`, Raft, three stories, both sizes | focus outside the frame 7 times (1440×900, steps 1, 2, 29); 3 labels overflow their face (`x←3`, `y←7`, `x←5`, 528 times) | **0 problems** |
| verify runs, all 8 examples | 159, 0 failing | 211, 0 failing |
| verify time, MapReduce / Raft (median of 3, loaded machine) | 5.2 s / 4.9 s | 6.2 s / 6.1 s |
| Event loop lesson lines that print raw markup | 55 | 0 |
| Unit tests | 321 / 321 | 328 / 328 |

The "free area" row is stricter than what audit checks (the viewport, ±2 px), and it is reported, not enforced:
12 s on phones remain, listed under Next.

---

## 1. The camera keeps the step's subject in shot

**The problem.** The finding was real, not an artefact of how audit measures. At MapReduce step 19 on a phone, the
caption says "reduce 1 sorts its 4 slips" while the frame shows reduce 0, and reduce 1 is off screen:

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/before/mapreduce-390-019-mid.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/after/mapreduce-390-019-mid.png?raw=true) |

It had two causes.

**Cause A: on wide screens, detail shots cropped the step's focus** (`32ce0b2`, `engine/director/director.mjs`). On
phones `framer.fit` already holds each step's focus and tags in a detail shot (`holdShot`); on wide screens it did not,
so a key step's close-up framed only the lesson's look ids. Raft, Virtual memory and Event loop focus the whole system
on every step on purpose, and their detail shots still left it up to 936 px off screen for whole steps. In Raft the
client sat under the dock:

| Before (Raft, step 1) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/before/raft-1440-001-mid.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/after/raft-1440-001-mid.png?raw=true) |

`holdShot` now applies on every screen. The trade-off: a detail shot pushes in only as far as the author's focus
allows. Virtual memory's "offset" step now shows the whole machine, not a close-up of the bits, which is what its
`figure.mjs` asks for ("every step frames all of it").

**Cause B: the camera set off only when the step began** (`37caffc`, `engine/director/shots.mjs`). Each planned move
started at the step's start, so for 0.2 to 1.4 s the new step played while its focus was still outside the old shot.
Where the shot on screen does not hold the next step's focus, the plan now inserts a `bridge` keyframe up to 0.7 s
before the step (`SHOTS.bridge`). The bridge holds both steps' focus, is no closer than either end, and is reached
exactly at the boundary; the planned move continues from there. Reduced motion skips it, since it already cuts
straight to a shot that holds the new focus.

The fix holds at five other screen and inset sets as well (1440 with a smaller HUD, 1440 with no panel, 1280×720,
390 with a taller or shorter dock, 844×390 landscape). The worst before was 844×390: 361 steps, 1049 s; now 0.

**The cost.** At some step boundaries the step's last frame is now the bridge, a wider frame. Here MapReduce step
20 ends looking toward the next chapter:

| Before (step 20, end) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/before/mapreduce-390-020-end.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/after/mapreduce-390-020-end.png?raw=true) |

**Why `check` said "Needs work".** The verdict logic was already honest. `verdictOf` and the report drop findings
with `level: "warn"`, and focus-outside had no level, so "Needs work" was the right verdict for a real problem. No
verdict code changed. The gap is sampling: audit looks at two instants per step and misses most transients, which is
why a plain `audit` showed 0 while `--at phases` showed 5. A Node-side sweep is first under Next.

**The scaffold at 1440×900** (steps 6, 7, 9, 12 and 15 in the brief) did not reproduce on `8ccff12`: the real audit,
the phase probe and the sweep at five inset sets were all clean. Its real problems were three phone transients, and
those are now 0.

Tests: two director tests, both failing on `main`: a detail shot holds a cluster, and the bridge holds both focuses,
sampled every 0.05 s across a boundary (reduced motion included). Docs: CONTRACTS.md (shot plan),
`references/tooling.md` (Director), roadmap (Done).

## 2. verify tries every knob's extremes together

**The problem.** verify varied one knob at a time. A bug that needs two knobs at once could never show up.

**What changed** (`25caae2`, `scripts/verify.mjs`). Each scenario also runs with every knob at its low end at once and
at its high end at once (switches off then on, selects first then last), in the 390×844 phone layout. Wide-screen
copies of those runs cost about 57 % more CPU and repeat a layout already checked knob by knob, so they were left out.
Cost: MapReduce 26 → 34 runs (5.2 → 6.2 s), Raft 24 → 30 (4.9 → 6.1 s).

**What it found** (`8bd7b67`, `examples/event-loop/figure.mjs`). In Event loop's "Taking turns" story, the repaint
and task counts disagreed with the figure's own reference model whenever a chunk of work outlasts a frame (6 ms
chunks at 120 Hz: 6 repaints against the reference's 4). It hit 90 of 780 knob combinations, and each knob alone was
fine. The figure marked the page changed when the work started, but the bar changes only when the work ends. A frame
that falls due while the page is unchanged is now skipped, as the reference already did. 0 of 780 fail now; the
default stories are unchanged, step for step.

Raft gains 3 warn-level advisories at its maxima (7 servers): two chapters run over 150 s at 1×, and 8 captions run
over 18 words. They are true at those settings, so they stay, and its README says so.

## 3. The roadmap's correctness gaps

**An unset reading shows "—"** (`db5c07d`, `engine/hud/format.mjs`, `hud.mjs`). An unset counter read 0, so
MapReduce's "Busiest counter's load" said `0.0×` before the shuffle, and Raft said "no leader 0 ms" at boot. Readings
(ms, pct, ×) now show "—" until the run sets them; tallies (int, bytes) still show 0.

| Before (skew, step 2) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/before/mapreduce-skew-1440-002.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/after/mapreduce-skew-1440-002.png?raw=true) |

**Counters per story** (`ff70793`). A counter can say `scenarios: [ids]`. I chose that over hiding counters that never
move: 16 counter-and-story pairs in 5 examples are honest zeros the lessons rely on (no page faults on a TLB hit).
The dock, the readout and the described scene respect it; verify errors on an unknown id and warns when such a
counter moves in a story it leaves out. Event loop's "screen repaints" now appears only in the two stories about
repaints.

**Lane-mark names stack** (`7b682c1`, `tokens.mjs`, `timeline.mjs`, `sampler.mjs`, `skin.mjs`). On each rail, in
time order, a name that would hit an earlier one moves up a 7 u level, at most 3 levels; past that the name is left
off and the puck stays. Earlier names never move when later marks arrive, so scrubbing is stable. Raft's network
split with the time board: 4 of 14 names overlapped, now 0 ("timeoutleader" is "timeout" with "leader" above it).

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/before/raft-partition-lanes-zoom.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/after/raft-partition-lanes-zoom.png?raw=true) |

**`{ref:id}` chips take the entity's key** (`e5403da`, `markup.mjs`, `hud.mjs`, 2 lines of `hud.css`). A chip on an
entity with an identity key shows that key's colour in its dot (7 px, like a legend swatch). It stays a hairline link
with ink text, so contrast and the hover ring are unchanged. The handout keeps the neutral dot, because it prints
other stories' captions, which use other keys. Quicksort's "Lots of repeated numbers" has 103 such chips:

![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/after/quicksort-dups-1440-004.png?raw=true)

## 4. Two more fixes found along the way

**Event loop printed markup as text** (`a802d80`). The figure passed its callbacks to the lesson as `fmt.key()`
strings, and the lesson prints a string var as literal text, so 55 lesson lines read "setTimeout hands
{key:timeout} to the browser's timer". It was on `main` too, in the explain panel at step 4 of "Which runs first?":

| Before | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/before/eventloop-order-1440-003.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/07-accuracy/shots/after/eventloop-order-1440-003.png?raw=true) |

The figure's steps now pass such vars as `{ markup }` (list items too). The lesson's template fill also
names any string var that holds chip markup, and verify reports it as an error, so no figure can ship this again:
without the figure's fix all 44 Event loop runs fail with it, and the other 7 examples have none. A unit test covers
the check, and CONTRACTS.md 10.1 says to pass `{ key }`, `{ ref }` or `{ markup }`.

**Raft's log tiles were too narrow for an arrow** (`ffc6ff3`, `examples/raft/figure.mjs`). In the mono face the
arrow is wider than a digit, so `x←3`, `y←7` and `x←5` measured 20.9 u on a 20 u face, and audit reported 3 label
overflows. The tiles are 2 u wider; the trays size their slots to the widest tile, so each server grows 8 u and
nothing else moves.

## Checks

- `verify.mjs`: all 8 examples, 0 failing (211 runs; [log](verify-after.txt)).
- Unit tests: 328 / 328 ([log](tests-after.txt)).
- `audit --at phases` on MapReduce and Raft, before and after; re-run at the end on `main`
  ([log](audit-phases-main.json)) and on the combined branch's pages ([log](audit-phases-combined.json)): focus outside
  the frame 12 times and 3 overflowing labels on `main`, no problems on the combined branch (one frame-time warning).
  `check` quick tier on MapReduce after.
- The 0.1 s framing sweep over all 8 examples at both sizes and five other layouts.
- In Chrome: the counters and the ref chips' dots in the DOM, at the steps above.
- Every screenshot here was read.
- **Not run on this branch alone:** the HUD browser suite (`engine/hud/test.html`). It throws at line 354 on `main`
  and reports nothing, and it does the same on this branch. The HUD and design branch brings it up to date. On the
  combined branch it runs: 275 / 275, including the 3 checks this branch adds. Also not run here: a full every-step
  audit or `check --full`; the combined PR has both.
- None of these changes is specific to a renderer; WebGPU was not exercised.

## Next

1. **A Node-side framing check in verify or check:** the 0.1 s sweep over `planShots` with nominal insets. Audit's
   two samples per step miss most transients.
2. Report focus under the HUD (outside the free area) as a warning: 12 s on phones remain.
3. Raft at its maxima: trim the captions that list voters, and consider splitting "Copying the log" and
   "Re-election" when there are 7 servers.
4. Bridge frames make some step-end stills wider. A plan that turns the camera less between far-apart focuses could
   keep them tight.
5. The "Looks right" card in the check report says "ok" even with warn-level findings (frame time). It could say
   "Advice", as the other cards do.
