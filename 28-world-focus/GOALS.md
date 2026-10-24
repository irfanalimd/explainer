# Goals: guide the eye in the world (`guide/world-focus`)

The owner's feedback: readers can't tell where to look because there is so much on screen. They want the page to
show by itself what to look at next, so nobody has to search.

This branch covers the world, and the link from the step's words to the world. A HUD cue on the next control is
`guide/next-cue`; hiding secondary chrome is `guide/calm-screen`.

1. **Spotlight.** While a step plays, what it is about keeps its look and the rest of the world recedes gently,
   easing in and out at step boundaries.
   - A pure function of t (and the view's hover and selection) inside `renderAt(t)`, so captures stay deterministic.
   - Works on the WebGPU and WebGL2 tiers. The DOM tier draws no world.
   - Never changes a kept thing's colours, sizes or the approved look (`site/remake`, the live MapReduce page).
   - Two strengths, subtle and clear, as screenshots for the owner to choose between. Subtle ships as the default.
2. **Text → world.** The things a step's words name are marked in the world as the step begins. Hovering or focusing
   a chip marks its thing, reusing the existing hover ring.
3. **No graphics optimisation.** Note any frame cost added.

Checks:
- unit tests;
- verify on all 8 examples;
- the HUD suite;
- the a11y audit;
- before and after shots for MapReduce, Raft and Event loop: desktop 1440×900 at 2× (light and dark) and phone
  390×844;
- a pixel check that kept things are unchanged against the current build.
