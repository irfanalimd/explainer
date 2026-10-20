# Page speed: goals

This pass makes what exists faster, more accurate, leaner and more polished, with no new features. This branch takes
"speed (the page)". MapReduce is the test page, Raft the second.

## Targets from the brief

1. **Frame time** is 166–185 ms on a machine with no GPU (`audit.mjs` warns against a 16 ms budget). Profile the
   WebGL2 path: skip work when nothing changed, find a cheaper tier when there's no GPU, cut per-frame allocations.
   Report fps before and after on the same machine.
2. **Page size.** The built MapReduce page grew from 1.6 MB to about 1.8 MB. Find what's in it (`build.mjs` inlines
   81 modules, the fonts and about 130 KB of CSS) and make it smaller without breaking offline use. Also measure
   time to first frame.
3. **The handout's pictures** took about 27 s to draw. Make that cheaper.

## Rules that shape the fixes

- One self-contained HTML file that works offline from `file://`; no CDN, install or server.
- Determinism: `renderAt(t)` gives the same frame for the same `t`. So captured frames (shoot, audit, record, the
  handout, Save image) must not change: confirmed by pairing PNGs against `main`.
- Fallback order stays WebGPU, then WebGL2, then the DOM HUD alone. Anything changed on WebGL2 is mirrored on WebGPU
  or shown to be WebGL2-only.
- A faster frame must not cost the lesson: the world's text must stay readable while it plays.

## How each target is measured

| Target | Measure |
|---|---|
| Frame time | Frames drawn per second while a story plays (`stats().renders` over 10 s, rAF agreeing); a full frame's render-to-pixels time; audit's own number, explained |
| Size | `build.mjs` output, split into modules, fonts and CSS; byte-identical rebuilds |
| First frame | Navigation to the first drawn frame from `file://`, with a hook injected before navigation |
| Handout | Share → Handout until the busy state ends; the JPEGs compared byte for byte |
| Nothing changed that shouldn't | `shoot` PNGs paired against `main` (and `main` against itself for the machine's flakiness); verify on all 8; unit tests |

All timings with `chrome-slot.sh --exclusive` (no other Chrome on the machine), `main` and the branch alternating.
