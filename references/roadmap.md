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

- **Lane-mark labels collide** when events fall within about 25 ms of each other; the lanes board should thin or offset them.
- **The `x` counter format is fixed at one decimal**, and an unset gauge shows `0.0×` instead of `—`.
- **Counters are global**, so a counter meant for one scenario shows in every tab. Wanted: a counter definition `scenarios: [ids]`, or hide counters that never move in the current timeline.
- **No chip is both identity-coloured and linked.** Wanted: `{ref:id}` takes the entity's key colour when it has one.
- **verify varies one knob at a time.** Combined extremes and the phone env at extremes are not exercised.

## Done (recent)

- `s.trace(..., { key })`: a trace in an identity colour; `s.tile(..., { w })`: a wider tile; a pointer on a housing's
  tile stands on the floor in front of the housing (from `examples/linked-list`).

- `build(s, p, scenario, env)` for portrait and phone layouts; verify runs every scenario in a 390×844 env.
- Reading time: a step lasts at least `MOTION.read.base + perWord × words` (capped at `max`). Motion stretches at most `stretch`, and the rest of the time is a hold.
- `s.focus(zoneId)` frames the zone's members.
- Captures refresh the legend and snap the meters on every shot.
- `s.zone(..., { around })` and in-flight loss (`s.drop`).
