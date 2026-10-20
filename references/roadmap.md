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

- **Desktop scale.** The HUD's top and bottom overlays take about 40 % of a 1440×900 viewport, so wide worlds (a cluster plus a lanes board) render at about 0.8 px/u. Ideas:
  - let the world extend under the empty parts of the bottom dock
  - collapse the meters panel into the dock
  - add an optional "cinema" mode that hides the chrome while playing
- **The phone meters panel** takes about 25 % of the screen height. A one-line strip that expands on tap would be better.
- **Focus shots can crop a ring.** A figure whose whole picture matters (rings, clusters) should `s.focus` the group every step, as `examples/raft` does.

## Timeline and narration


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
- `s.trace(..., { key })`: a trace in an identity colour; `s.tile(..., { w })`: a wider tile; a pointer on a housing's
  tile stands on the floor in front of the housing (from `examples/linked-list`).

- `build(s, p, scenario, env)` for portrait and phone layouts; verify runs every scenario in a 390×844 env.
- Reading time: a step lasts at least `MOTION.read.base + perWord × words` (capped at `max`). Motion stretches at most `stretch`, and the rest of the time is a hold.
- `s.focus(zoneId)` frames the zone's members.
- Captures refresh the legend and snap the meters on every shot.
- `s.zone(..., { around })` and in-flight loss (`s.drop`).
