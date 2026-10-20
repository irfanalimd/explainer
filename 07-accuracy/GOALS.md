# Accuracy and correctness: goals

This pass makes what exists faster, more accurate, leaner and more polished, with no new features. This branch takes
the "accuracy and correctness" targets. MapReduce is the test page, and every engine change is checked on at least
one other example (Raft, then whichever example the change touches).

## Targets from the brief

1. **Framing.** `audit.mjs` has always reported focus outside the frame at step 22 on a 390×844 phone, so `check`
   says "Needs work". A fresh scaffold showed it at 1440×900 too (steps 6, 7, 9, 12, 15). Fix the framing, and make
   the verdict honest.
2. **verify** varies one knob at a time. Add combined extremes, and the phone layout at extremes, if it's cheap.
3. **Roadmap correctness gaps:**
   - counters are global, so one meant for one story shows in every story's tab;
   - an unset `x` gauge shows `0.0×` instead of nothing;
   - lane-mark labels collide when events land close together;
   - `{ref:id}` chips can't take the entity's key colour.
4. **WebGPU parity** has never been checked. If it can't be run here, make sure nothing changed is WebGL2-only.

## Ground rules that shape the fixes

- Run it, don't draw it: every number on screen comes from the deterministic run.
- Determinism: `renderAt(t)` gives the same frame for the same `t`. The camera's bridge keyframe is part of the shot
  plan, so it is a function of `t` like every other move.
- Measure before and after for every change, and read every screenshot.

## How each target is measured

| Target | Measure |
|---|---|
| Framing | `audit --at phases` on MapReduce and Raft; a 0.1 s sweep of the director's shot plan over all 8 examples at both sizes and five other layouts (`framesweep.mjs`, kept outside the repo); `check` quick tier's verdict |
| Honest verdict | Read `verdictOf` and the report's card logic: does a real problem produce "Needs work", and an advisory not? |
| verify extremes | Run counts and wall and CPU time per example; any new failure is investigated before it is accepted |
| Counters, gauge, lane marks, chips | DOM state and screenshots at the steps that showed each gap |
| WebGPU | Not runnable here (no GPU; SwiftShader's WebGPU canvas is blank in screenshots): keep every change renderer-neutral |

## Found along the way

- Event loop's lesson printed `{key:timeout}` as text in 55 lines (found while reading the Event loop screenshots).
- Raft's `x←3` tiles overflowed their face (an audit finding the HUD branch reported on `main`).
