> **Draft, for review only. Don't merge yet.** The planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/10-tooling-speed/GOALS.md)), the PNG pairings and the timing logs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/10-tooling-speed). The code diff is under **Files changed**.

## TL;DR

- **Screenshots are encoded with Chrome's fast PNG encoder.**
  - A 1440×900 shot encodes in 246 ms, not 652 ms; a 390×844 shot in 80 ms, not 201 ms.
  - Decoded, the pixels are the same. The files are about a third larger.
- **On a full run this is small.** The same page and the same run of `shoot --scenario all --teach` took 68.4 min
  with `main`'s tools and 68.2 min with this branch's.
  - The frozen phase shots got 9 % faster (536 → 486 s).
  - The teaching cards (59 of the 68 min) did not change.
- **The brief's targets (57 and 62 min, down) are not met by this branch alone.** The teaching cards are shot during
  live play, and live play is bound by how fast the page draws without a GPU.
  - The lever is on the page side: the page-speed branch's drafts.
  - With them, the combined branch's `check --full` took 59.2 min against `main`'s 74.4 min, run side by side.
- **The images do not change.**
  - Frozen shots: 158 of 160 have the same pixels; the other two differ by 2 pixels at 1/255.
  - Teaching cards: none differs from `main` by more than `main` differs from a second run of itself.
- **One idea was tried and dropped because it changed images:** changing the playback speed only when the run starts
  or stops. It reframed cards shot back to back. The known gaps now say why, along with where the time goes and why
  more tabs do not help.
- Branch **`perf/tooling-speed`**, 2 commits on `8ccff12`. Unit tests 321 / 321, verify 0 failing on all 8.

## Before and after

On this machine: 4 cores, no GPU (Chrome draws WebGL2 on SwiftShader), load 6 to 8 from other users' jobs
throughout. Each pair ran side by side, one Chrome job each, so both sides saw the same load.

| | `main`'s tools | this branch's tools |
|---|---|---|
| PNG encode, one 1440×900 shot | 652 ms | 246 ms |
| PNG encode, one 390×844 shot | 201 ms | 80 ms |
| `check` quick tier on MapReduce, shoot stage (80 shots, no other Chrome running) | 3:06 | 2:48 |
| **`shoot --scenario all --teach`**, MapReduce, the same built page (`main`'s) | **4102.8 s (68.4 min)** | **4092.4 s (68.2 min)** |
| of which the 160 frozen phase shots | 536 s | 486 s |
| of which the 104 teaching cards | 3512 s | 3547 s |
| of which the first story's cards ("Everything works", 4 of the 16 groups) | 2290 s | 2330 s |
| Shot folder, all 266 PNGs | 161 MB | 218 MB |
| Frozen phase shots, same pixels as `main`'s run | (`main` against a second run of itself: 159 / 160) | 158 / 160 |
| Teaching cards, the most any card differs (share of pixels past pngcmp's threshold) | `main` against itself: 15.4 % | against `main`: 4.1 % |
| Unit tests / verify on all 8 | 321 / 0 failing | 321 / 0 failing |

**End to end, with the page-speed changes** (`check --full`, `main` against the combined branch, side by side; this is
not the tools alone):

| `check --full`, MapReduce | `main` | combined branch |
|---|---|---|
| Whole run | 74 min 25 s | **59 min 11 s** |
| Shoot stage (264 shots and teaching cards) | 64 min 45 s | 45 min 31 s |
| Audit stage (every step, both sizes) | 9 min 14 s | 12 min 57 s * |
| Verdict | "Needs work" (focus outside the frame at steps 4, 19, 22, at 390×844) | "Ready for review" |

\* Not comparable: the combined branch's audit ran while `main`'s shoot stage was still drawing, and `main`'s ran
alone after the combined branch had finished. The audit draws frozen frames only, which neither branch changes.

---

## 1. Chrome's fast PNG encoding

`0ae689c`, `scripts/shoot.mjs`. Each `Page.captureScreenshot` encodes the frame as PNG inside Chrome while the page
waits, and the default encoder is slow: 652 ms for a 1440×900 shot. With `optimizeForSpeed` it takes 246 ms. On
software rendering that is about a fifth of a frozen shot. The fast encoder only compresses less, so a shot decodes
to the same pixels: commit `0ae689c` paired the 80 shots of a quick check and its contact sheet against `main`'s,
80 of 80. Phase shots, teaching cards and contact sheets use it. The PNGs take about a third more disk (48 → 66 MB for
a quick check, 161 → 218 MB for a full run).

## 2. Where the time goes, and what did not help

`b284025`, `references/tooling.md` (Known gaps). The old paragraph gave one run's times and blamed frame time in
general. Measured:

- **Most of the time is one story's teaching cards.** In the run above, "Everything works" took 2290 of the 3512 s
  of cards (65 %). Its cards follow steps that light tiles. A lit tile's ping (0.7 s) and a trace's afterglow (1.1 s)
  fade on the runtime's clock, which steps at most 1/20 s a frame. So the page keeps drawing 14 to 22 frames after
  the run stops on a card, at about a second a frame, and the card is shot mid-fade. This is also why live cards
  differ a little from run to run, along with the shimmer, which follows the wall clock.
- **More tabs in one Chrome do not help.** Software rendering runs in Chrome's one GPU process. 2 to 4 tabs drew
  1.2× the frozen frames of one tab on an idle machine, and no more than one on a loaded machine.
- **Changing the speed only when the run starts or stops was dropped.** The teaching pass sets the speed to 1× before
  each card's shot and back to 16× after it, and each change draws a frame. Skipping the change back saved two frames
  a card. But the camera moves only when a frame is drawn, so a card shot right after another got one frame less to
  follow the panel it had just changed. Paired against two runs of `main`'s tools (phone, dark, 28 cards):

  | Card | the change against `main` | `main` against itself |
  |---|---|---|
  | crash, end caption | 4.28 % | 0.00 % |
  | happy, the pick's wrong branch (step 12) | 4.77 % | 0.45 % |
  | the whole pass | 695 s | 760 s |

  The 9 % gain was close to the noise (one story ran slower). The images must not change, so the pass keeps both
  speed changes ([pairing](dropped-change-pairing.txt), [logs](dropped-change-main.log),
  [the change's run](dropped-change-new.log)).

## Checks

- **PNG pairing** ([png-pairing.txt](png-pairing.txt)): the same built page shot with `main`'s tools and this
  branch's, and `main`'s against an earlier run of its own on the same page.
  - Frozen phase shots: 158 / 160 same pixels. The other two (skew, light, 1440×900, step 1 mid and end) differ in
    2 pixels by 1/255. `main` against itself: 159 / 160, one shot 43 px off by up to 60/255.
  - Teaching cards: no two runs match (`main` against itself: 0 / 104), because live play follows the wall clock.
    Against `main`, the median card differs by 0.00 % past the threshold and the worst by 4.1 %. `main` against
    itself: median 0.00 %, worst 15.4 %.
  - I read the two cards that exceed their own baseline most (skew, step 7 question; crash, "You can now"). Each
    shows the same card and words; only the small world strip above it is framed a little differently.
- Logs: [`shoot`, main's tools](shoot-teach-main-tools.log), [`shoot`, this branch](shoot-teach-branch-tools.log),
  [`check --full`, main](check-full-main.log) ([report](check-full-main.md)),
  [`check --full`, combined](check-full-branch.log) ([report](check-full-branch.md)). The reports' contact sheets
  are not copied here.
- `verify.mjs` on all 8 examples: 0 failing ([log](verify-after.txt)). Unit tests 321 / 321 ([log](tests-after.txt)).
- **Not verified:**
  - A machine with a GPU, where the encode share of a shot is larger and the gain should be too.
  - A quiet machine for the full runs: every full run here had a load of 6 to 8 from other users. The quick-tier
    numbers come from a moment with no other Chrome running.

## Next

1. **Let a card's shot skip the fade.** Separate the playhead's step from the 1/20 s frame cap, or give the runtime a
   capture flag that ends pings and afterglow when the run stops on a card. Most of the teaching pass is spent
   waiting for fades. Both change what a card shows (it is shot mid-fade today), so they need a decision.
2. **Shoot teaching cards with a settled camera,** as phase shots are. The cards would then be deterministic and
   pairable shot for shot, and the speed changes could go (two frames a card). This changes the card images.
3. Run the two sizes' teaching passes in two Chrome processes, not tabs, when the machine has the cores. It is worth
   measuring on a machine with a GPU; here one GPU process per Chrome is the limit.
