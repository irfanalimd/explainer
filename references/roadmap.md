# Roadmap and known gaps

What the engine does not do yet, collected while building the flagship examples with the skill. When a figure needs one of these, work around it in the figure (the workaround is listed), and keep it in mind as engine work.

## Layout and geometry

- **No angle-based ring layout and no circular trace.** `s.ring` spaces members by index, and `free` positions cannot change after creation.
  - Workaround (from `examples/consistent-hashing`): build the ring from short straight traces between invisible anchors, and relax tile overlaps in the figure.
  - Wanted:
    - `s.ring(id, { angleOf })`
    - `s.trace(..., { route: "arc", center, radius })`
    - `s.set(id, { at })` for free members
- **Grooves and zones above the floor draw at z = 0** (renderer).
- **Rails don't show pulses** (renderer).
- **Glass has no refraction** (renderer).

## Camera and frame

- **Desktop scale.** At 1440×900 the HUD covers 39 % of the viewport: the docked explain panel 384 px of the width
  (27 % on its own), the header 64 px and the dock 90 px. A world that is wide rather than tall is held by the
  panel's width (MapReduce: 0.88 px/u; 1.17 without the panel), so trimming the top and bottom no longer helps it.
  Ideas:
  - a narrower docked panel, or one that folds to its pill while playing, when the world is width-bound
  - an optional "cinema" mode that hides the chrome while playing
- **Phone dock.** At 390×844 the dock is 142 px (the numbers' line 36 px of it, the timeline and the transport the
  rest) and the layered caption above it 108–264 px, so a tall world gets 0.45 px/u. The numbers could share the
  transport's row only by hiding a number behind "+1" (the speed pill and the three buttons leave about 100 px).
- **Focus shots can crop a ring.** A figure whose whole picture matters (rings, clusters) should `s.focus` the group every step, as `examples/raft` does.

## Done (recent)

- A step boundary the shot on screen does not cover gets a bridge move that starts up to 0.7 s early, so the new
  step's focus is in frame from its first frame. With the detail-shot fix below, steps over the 8 examples with
  the focus partly off screen: 119 → 0 at 1440×900, 89 → 0 at 390×844.
- A detail shot holds the step's focus on every screen, not only phones, so a focused ring or cluster stays whole.
- verify also runs every scenario with its knobs at their extremes combined (all low, all high) on the phone (from
  `examples/event-loop`, whose repaint count was wrong only with two knobs at once).
- A `{ref:id}` chip on an entity with an identity key shows that key's colour in its dot (a legend swatch) and
  stays a link (from `examples/quicksort`: the duplicate values in "Many repeats").
- Lane-mark names that would run into each other on a rail stack up a level (`SIZE.lane.mark`: at most 3 high; a
  name with no free level is left off, its puck stays). Raft's split story: 4 of 14 names overlapped, now none.
- A counter definition takes `scenarios: [ids]`; other stories leave it out of the dock and the readout (from
  `examples/event-loop`: screen repaints only in the stories that repaint).
- A counter the run has not set yet reads `—` when it is a reading (`ms`, `pct`, `x`) and 0 when it is a tally
  (`int`, `bytes`); `decimals` sets the digits of an `x` counter.
- The world comes down to the dock bar when nothing floats over it (the docked panel tells the step): at 1440×900
  `insets.bottom` 106 → 90 px, Raft 1.198 → 1.224 px/u. The phone's numbers are one 32 px line in the dock that
  opens the full readout on tap (a button with `aria-expanded`): the dock 150 → 142 px, MapReduce 0.440 → 0.448 px/u.

- `s.trace(..., { key })`: a trace in an identity colour; `s.tile(..., { w })`: a wider tile; a pointer on a housing's
  tile stands on the floor in front of the housing (from `examples/linked-list`).

- `build(s, p, scenario, env)` for portrait and phone layouts; verify runs every scenario in a 390×844 env.
- Reading time: a step lasts at least `MOTION.read.base + perWord × words` (capped at `max`). Motion stretches at most `stretch`, and the rest of the time is a hold.
- `s.focus(zoneId)` frames the zone's members.
- Captures refresh the legend and snap the meters on every shot.
- `s.zone(..., { around })` and in-flight loss (`s.drop`).
