# HUD and design polish: goals

This pass makes what exists faster, more accurate, leaner and more polished, with no new features. This branch takes
the "slight design and UX polish" targets. MapReduce is the test page, Raft the second.

## Targets from the brief

1. **Room for the world.** The HUD takes about 40 % of a 1440×900 screen, and on a phone the meters panel about 25 %
   of the height (roadmap). Win back room without losing what the HUD tells.
2. **The newest pieces against DESIGN.md:** the share panel, the handout, the presenter view and the no-GPU text
   board. Look for spacing, type scale, contrast in both themes and focus states. Fix inconsistencies only.
3. **Keep `audit.mjs --a11y` at 0 problems.**

## Rules that shape the fixes

- Restrained, monochrome interface; colour only for data (DESIGN.md 9.1).
- No two controls in view do the same thing (DESIGN.md 9.2).
- The explain panel never scrolls (DESIGN.md 9.4).
- No new features: anything that needs one (cinema mode, a narrower panel while playing) goes under Next.

## How each target is measured

| Target | Measure |
|---|---|
| Room | `__internals.insets` at the middle of each phase; HUD share of the viewport; world scale in px per unit from the director's goal distance; both sizes, MapReduce and Raft |
| Consistency | Each piece read against DESIGN.md, in both themes and both sizes, with screenshots before and after |
| Accessibility | `audit --a11y --at phases --themes light,dark` on MapReduce and Raft, plus the audit's own probe run on the share panel, the presenter view's real window and the no-GPU board, which the audit's frames never open |
| Nothing broken | verify on all 8 examples, unit tests, and the HUD browser suite (`engine/hud/test.html`), which was found broken on `main` and brought up to date |
