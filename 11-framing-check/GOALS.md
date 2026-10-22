# Framing check: goals

Round 4 picks up the first items of #9's Next list. No new features: these make the existing checks honest about
what the camera does between the two instants a step that audit looks at.

## Targets

1. **A Node-side framing check.** Sweep the director's shot plan (`planShots`) every 0.1 s at 1440×900 and 390×844,
   with typical HUD insets, and report a step's focus out of the frame as an error. It must pass on `main` (round 3
   brought this to 0 on all 8 examples) and cost little: measure verify's wall and CPU time per example, before and
   after, median of 3.
2. **Focus under the HUD as a warning**, in audit and in the sweep. Round 3 left "about 12 s on phones": say where,
   fix the framing if it is cheap and changes no other example, and otherwise leave an honest warning.
3. **The check report's "Looks right" card** says "ok" with warn-level findings (frame time). It should say Advice,
   as the other cards do, without changing the verdict.

## Where the check lives

verify, not check. CONTRACTS.md and `references/tooling.md` describe verify as the Node-only checks of the run
(compile, determinism, invariants, sampler, lesson) and check as verify plus build, Chrome shots and audit. The sweep
needs only the compiled timeline and the director, both plain modules, and is deterministic, so it belongs with the
Node checks: an author gets it in seconds in the authoring loop, without Chrome, and check inherits it.

## How it is measured

| Target | Measure |
|---|---|
| Framing check | The sweep on all 8 examples at both sizes on `main` (must be 0) and on the tree before round 3, `8ccff12` (must find what round 3 measured: 65 s at 390×844, 310 s at 1440×900) |
| Insets | `__internals.insets` read from the real page at the middle of every step of every story, MapReduce and Raft, both sizes |
| Cost | verify on all 8 examples, `main` and the branch alternating, 3 rounds, `/usr/bin/time` wall and user + sys |
| Under the HUD | The sweep's seconds per step, and the camera's projected focus edges every 0.1 s for any step it reports |
| Audit warning | Every-step audit of MapReduce and Raft at both sizes; a probe that grows the dock's inset over the focus |
| Card | The round-3 `check --full` result rendered with `main`'s report code and with this branch's |
