> **Draft, for review only. Don't merge yet.** The owner is trying it on the unlisted preview pages first; changes from that feedback land here. Screenshots and logs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/combined-6).

**Merge this one instead of #31, #32 and #33.**

## TL;DR

Readers said there is so much on screen that they can't tell where to look. Three changes, one per PR, combined here on top of `main` (which already has #34):

- **#32, the next thing to do rings.**
  - One control at a time carries a clear ring with a soft halo: Play, Continue, the open question's options, Next, or Next story.
  - It ripples 3 times, then rests until the reader acts.
  - There's no flashing. Reduced motion gets the ring without the ripple. Nothing shows in captures.
  - A chapter's recap ends with "Up next: … Press Continue or Enter."
  - **Settings → Hints** turns it off. `?cue=quiet` gives the first, fainter look.
- **#33, the world shows what the step is about.**
  - What the step moves or names keeps its exact look; the rest of the world recedes toward the stage.
  - The things a step's sentence names are ringed for 1.6 s as it starts.
  - Default strength is subtle. `?spot=clear` and `?spot=off` compare.
- **#31, a calmer screen.**
  - The panel's Earlier steps fold to one line, and the level switch is one line.
  - While playing, the toolbar, scenario bar and speed step back a shade.
  - The chapter introduction goes quiet after its first step.

Plus two lead commits:
- `?spot=` reads the spotlight strength from the address, so the owner can compare looks on one page.
- `fffec76`, the review packet's "Why:" line from #28's branch, the one commit #34 didn't carry.

## Checks

- Unit tests: 385 / 385.
- HUD suite: 285 / 285.
- `verify.mjs`, all 8 examples: 211 runs, 0 failing. Warnings only: MapReduce 1 (its scenario name), Raft 3 (its maxima).
- The merges of #31, #32 and #33 were clean (`DESIGN.md`, `explain.mjs`, `hud.css`, `hud.mjs` and `test.html` auto-merged).
- Each PR's own checks, screenshots and a11y audit are in review folders 27, 28 and 29.
- **Not verified:** a real GPU, Safari, Firefox, a screen reader.

## Preview (unlisted)

Not on the site's homepage; the listed pages are unchanged, for comparing:
- https://sites.irfanali.me/p/learning/_preview-mapreduce-cluster.html
- https://sites.irfanali.me/p/learning/_preview-raft-consensus.html
- https://sites.irfanali.me/p/learning/_preview-javascript-event-loop.html

Add `?spot=clear`, `?spot=off` or `?cue=quiet` to compare.

## Open questions for the owner

1. Spotlight strength: subtle or clear?
2. Ring: clear (default) or quiet?
3. Should Hints in Settings also turn the spotlight off?
4. Should the printed handout's pictures keep the spotlight?
