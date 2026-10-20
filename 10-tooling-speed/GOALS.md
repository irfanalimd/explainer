# Tooling speed: goals

This pass makes what exists faster, more accurate, leaner and more polished, with no new features. This branch takes
"speed (the tooling)".

## Target from the brief

`shoot --scenario all --teach` takes about 57 min and `check --full` about 62 min on a 4-core box. Look at parallel
tabs in one Chrome, skipping work that repeats, and smarter waits. **The images must not change:** confirm by pairing
PNGs before and after.

## Where the time goes (measured first)

On MapReduce, on this machine (no GPU, SwiftShader), a full `shoot --scenario all --teach` is about 160 frozen phase
shots in about 10 minutes, then 104 teaching cards in the rest. The cards dominate, and within them the first story
does: its cards follow steps that light tiles, and a ping (0.7 s) and an afterglow (1.1 s) fade on the runtime's clock,
which steps at most 1/20 s a frame. So the page keeps drawing 14 to 22 frames after the run stops on a card, at about a
second a frame.

## What was tried

| Idea | Result | Kept? |
|---|---|---|
| More tabs in one Chrome | Software rendering runs in Chrome's one GPU process: 2 to 4 tabs drew 1.2× the frozen frames of one on an idle machine, no more on a loaded one | no |
| Chrome's fast PNG encoding (`optimizeForSpeed`) | 652 → 246 ms a 1440×900 shot, 201 → 80 ms at 390×844; decoded, the same pixels | **yes** |
| Change the playback speed only when the run starts or stops (two frames fewer a card) | About 8 % off the phone's teaching pass, but the camera moves only when a frame is drawn, so cards shot right after another were framed differently (4.3 % of pixels on one card where two `main` runs matched exactly) | no: the images must not change |

## How it is measured

- Timings with `chrome-slot.sh`: `main`'s tools and this branch's tools run side by side on the **same built page**,
  so they share the machine's load and only the tools differ.
- PNG pairing (`pngcmp.mjs`, RGBA compare after decoding) against `main`'s run, and `main` against a second run of
  itself, so the machine's own run-to-run differences (live cards follow the wall clock) are known.
