# Visual defects: goals

The owner judges Explainer by how the world looks, and liked the original pages (commit `9c8b16d`); #20 brought that
look back. This pass reads every frame of every example and fixes **defects only**: things that are clearly broken,
not matters of taste.

## What counts as a defect

- labels or chips that collide, overlap, clip or overflow their face or the frame;
- tiles or housings that crowd or overlap;
- traces that pass through objects;
- a step's subject cut off, or hidden under the interface;
- empty or dead frames;
- something clearly broken in the no-GPU text board or the handout pictures.

## What it may not change

Colour, palette order, font size or weight, materials, lighting, bloom, shadow softness, tile proportions, the
camera's behaviour in general, resolution or antialiasing. Anything that would need one of these is a proposal for the
owner, with a screenshot.

## How it is checked

- Every example shot from `site/build` with `shoot.mjs --scenario all` at 1440×900 and 390×844 in both themes;
  MapReduce and Raft also at 844×390 and 1280×720. Every contact sheet read, then every suspicious frame at full
  size or zoomed.
- Each fix: before and after shots, read; the fixed moment at 2× next to the same moment from the original pages.
- Every other frame paired against `site/build`'s own shots: it must be unchanged (run-to-run noise reported).
- verify on all 8 examples, the unit tests, the HUD browser suite, `audit --a11y` and `audit --at phases` on MapReduce
  and Raft.
