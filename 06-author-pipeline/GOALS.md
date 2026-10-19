# 06 · Author pipeline: `/explainer` itself as the product

Branch `product/06-author-pipeline`. Specimen: MapReduce, authored from scratch with
`node scripts/new.mjs <tmp>/mr --from mapreduce`, then taken through every step of the
authoring loop on a 4-core, 8 GB machine (Node 22, Google Chrome, no GPU, other heavy jobs
sharing it).

## 1. Who this serves

Two authors, and they are not the same person.

- **The agent.** Most pages are made by Claude running `/explainer <concept>`. It reads
  `SKILL.md`, runs the scripts through a Bash tool that gives up after 2 minutes by default
  and 10 at most, and it can act only on what the scripts print. It never sees a screen.
  It needs every failure to say *which file, which line, and what to do*, and every long job
  to report progress and finish inside its tool's limits.
- **The person.** A teacher, TA or engineer who installs the plugin, types `/explainer bloom
  filters`, and later opens `figure.mjs` to change a knob or a caption. They need to know up
  front whether their machine can do this, roughly how long it takes, and, at the end, one
  place that says whether the page is good enough to put in front of a class.

**The job they hire it for:** go from an idea to a page they can ship, with evidence that it
is right, without the owner explaining the tooling.

**Success, observably:**

1. On a machine missing Node or Chrome, the first command says so and names the fix for that
   OS, and nothing later fails mysteriously. (Today: `node: command not found`, or
   `Chrome not found` from deep inside `shoot`, after the figure is written.)
2. One command takes a figure to a verdict: verify, the lesson lint, build, audit and a
   contact sheet, with progress lines and a pass/fail exit code, in about a minute for the
   quick tier.
3. A report the owner can glance at: is it correct, does it teach, does it look right, how
   long is each story, what did the reviewers score.
4. Every common mistake produces a message that names the file and line and the fix.
5. `shoot --teach` completes, with every card it promises, on a slow machine.

## 2. What "complete" means for an author

The whole journey, including the parts nobody demos:

| Moment | Needed | Today |
|---|---|---|
| Install | know the requirements are met; know the fence hook works | README line "Node.js 20.10+ … Chrome"; nothing checks it |
| Scaffold | a folder whose README commands work from where it is | `--from` copies the example's README with `../../scripts/…` paths that are wrong outside `examples/` |
| Write | errors that point at the line | several messages lack a file or a line (below) |
| Check | one command, quick and full tiers, progress, exit code | 6 commands, each with its own flags, no progress, no summary |
| Look | every teaching card shot | `--teach` drops cards on slow machines and never shoots the real end card |
| Review | the packet's images are complete | `review-packet` shoots with `--teach` and exits 1 when an image is missing, so on this box the blind review cannot start |
| Ship | a scorecard | none |
| After | the report sits beside the figure for the next edit | none |

## 3. Audit of the baseline (with evidence)

**Install and preflight**
- `SKILL.md:5` and `README.md:225` state the requirements; no script checks them. Chrome
  discovery (`scripts/lib/cdp.mjs:15-19`) looks at seven fixed paths: no `PATH` lookup, no
  `/snap/bin/chromium`, no Windows paths, no Playwright or Puppeteer browser caches. The
  error, `Chrome not found. Install Google Chrome or set CHROME_PATH…`, surfaces only at the
  first `shoot`/`audit`/`review-packet`, after the figure is written.
- Nothing checks the Node version before the scripts use `module.register`, the built-in
  WebSocket or `fs.cpSync`; on Node 18 the failures are generic stack traces.
- The reader fence (`hooks/hooks.json`) runs `node …/reader-fence.mjs`. If `node` is not on
  the hook's PATH, or the script throws, the hook exits non-zero but not 2, which Claude Code
  treats as a *non-blocking* error: the tool call goes through. **The blind readers' fence
  fails open.**

**The golden path**
- README "Making your own figure" is 5 commands; SKILL.md steps 8–10 add `audit`, `lesson`,
  `--teach`, and the checklist adds two sizes and both themes. No one command says "this
  page passes".
- `shoot` prints nothing until it is done. The baseline capture took **27m50s**
  (`00-baseline/NOTES.md`), far past the Bash tool's 10-minute ceiling: an agent that follows
  SKILL.md step 8 in the foreground is killed mid-run.

**`shoot --teach` on a slow machine** (`00-baseline/shoot-log.txt`): 23 page errors —
questions at steps 6 and 7 "never revealed", the pick at step 12 "never held its wrong
branch's consequence", "the run never reached its end card" ×7. Of 4 stories × 2 themes ×
2 sizes the baseline has **0 why cards, 0 pick cards and 0 happy-story cards** (its shot list
has only `-ask` and `-end-card`). The cause, from the code: the runtime clamps a frame's step
to 1/20 s (`engine/runtime.mjs:400`), so when software rendering takes ~300 ms a frame the page
plays ~6× slower than real time, and shoot's fixed wall-clock timeouts
(`scripts/shoot.mjs:112,117,163,172,188`) expire. Its 1.4 s `settle()` is wall-clock too, so
on this box the camera springs can still be moving when a card is shot.

**The end card is never shot, on any machine.** `crash-dark-1440x900-026-end-card.png` shows
the *first end-check question*, answered, with "Next question", not the recap, takeaway and
what-ifs the docs promise (`references/tooling.md:199`). shoot clicks one check option and
never presses "Next question" or "Finish" (`scripts/shoot.mjs:188-196`).

**Errors that teach** (a copy of MapReduce broken ten ways; full logs in
`shots/extra/errors-before/`):

| Break | What verify said | Gap |
|---|---|---|
| step id typo in `lesson.mjs` (`map.raed`) | exit 0; a warning that `map.read` has no words, and a separate *note* listing `map.raed` among unreached ids | the two halves are never connected; no line; exits 0 |
| template var typo `{mapp}` | 50+ lines: the same error per step, per run, per branch | no `lesson.mjs` line, no "did you mean {map}" |
| `Math.random()` | `line 167: Math.random()…` | no file name |
| infinite loop | `no result within 20 s: an infinite loop in build() (or in the compiler)?` | no file or line; a guess |
| param default 9 > max 6; `"2"` for an int | the right messages | no line |
| syntax error in `lesson.mjs` | `lesson.mjs failed to import: Unexpected token '{'` | no line |
| caption `{ref:mm0|…}` naming an entity that does not exist | **exit 0, nothing** | silent |
| `ReferenceError` in build | the error plus verify's own stack, then 5 cascade errors per run (no caption, no steps, invariants threw) | the real cause is buried |

**Tests.** 11 of 305 unit tests fail on main. I traced each one (CHANGES.md §7): all 11 are
stale tests left behind by deliberate engine changes (sentence-case world labels, UI tokens for
the HUD chrome, ask ids, the shot planner reading `tl.world`, the scale field's id-less poses,
a rewritten quicksort caption). None is a product bug.

**Scaffold.** `new.mjs --from` relocates imports but copies the README verbatim: its commands
say `node ../../scripts/verify.mjs`, which is wrong anywhere but `examples/<name>/`.

## 4. Ideas, ranked (impact on the author against cost and risk)

1. **Make `shoot --teach` finish on a slow machine** by pacing its waits by the measured frame
   time instead of fixed wall-clock timeouts, and by settling on the page going idle. *Why
   first:* it is broken today on exactly the hardware students and CI have, it silently drops
   the cards a teacher most needs to check, and `review-packet` depends on it (a missing image
   means exit 1, so the blind review cannot start). Medium cost, low risk: only `shoot.mjs`,
   and on a fast machine the waits are unchanged.
2. **Shoot the real end card**: answer the end checks through to "You can now…", shoot that,
   then the recap. Cheap, and it keeps a promise the docs already make.
3. **`doctor`**: Node version, Chrome found and actually launching, WebGPU or WebGL2 in headless
   Chrome, fonts, writable dirs, the fence hook's `node`, ffmpeg (optional), a speed estimate;
   one fix line per problem, per OS. Cheap, and the highest value at minute zero.
4. **`check`, the golden path in one command**, with `--quick` (about a minute) and `--full`
   (ship) tiers, progress lines with timings and one exit code. Medium cost; it composes the
   existing scripts, so low risk.
5. **The quality report** (`check` writes `report.html` and `report.md`): a scorecard of verify,
   the teaching lint, the reading grade, audit, the contact sheet, each story's steps and
   chapter pacing, the build size and review scores if present. Medium cost; the owner's
   glanceable answer to "is this shippable?".
6. **Errors that teach**: the hung line, found through the inspector; a "did you mean" for
   lesson ids and template vars, with `lesson.mjs:line`; the line of a lesson syntax error; the
   figure's file on determinism smells; build errors without the cascade; params with their
   line. Medium cost; each is local to `verify.mjs` or `lesson-load.mjs`.
7. **Progress output for long scripts** (shoot, audit): one line per group with elapsed time,
   so an agent can see it is alive, and SKILL.md can tell it to run them in the background.
   Cheap.
8. **Chrome discovery** on `PATH`, snap, Windows, and the Playwright and Puppeteer caches, with
   an error that points at `doctor`. Cheap.
9. **The fence fails closed**: if the fence cannot run, deny the fenced agents' tools instead of
   letting them through. Cheap, and it protects the pipeline's main claim, blind review.
10. **`new` writes a README whose commands work from the new folder**, and prints the golden
    path as its next step. Cheap.
11. **SKILL.md, tooling.md and README**: a step 0 preflight, `check` as the loop, background
    runs for long jobs, timings measured on this box. Cheap, and high leverage for the agent.
12. **Fix the 11 stale tests** so a red test means something again. Cheap. Done first, since
    every later change needs a green suite to prove it added no failures.
13. **Shoot speed**: profile renderAt against the screenshot and the audit; parallel tabs; skip
    duplicates. An uncertain gain on a CPU-bound box whose Chrome jobs are already rationed to
    two, so I measure before changing anything.
14. A caption `{ref:…}` check in verify (the silent case). It needs the compiler's entity list
    per step; worth doing if it stays local.
15. A `SessionStart` hook that warns when Node or Chrome is missing. Considered and rejected
    (below).

## 5. The chosen set

1 and 2 (shoot robustness and the end card), 3 (doctor), 4 and 5 (`check` and its report),
6 (errors that teach), 7, 8, 9, 10, 11 and 12. Together they move an author from "six commands
and a hope" to "one command and a scorecard", and they make the machinery the pipeline depends
on work on ordinary hardware. 13 and 14 only if the measurements say they are cheap.

## 6. Deliberately not doing

- **No `SessionStart` hook.** It would run in every Claude Code session of everyone with the
  plugin, to catch a problem that matters only when `/explainer` runs. SKILL.md step 0 runs
  `doctor` exactly when it matters.
- **No change to what a page looks like.** No renderer, HUD, lesson or figure edits. The
  frozen shots of the standard after-capture should match the baseline; the teaching cards
  change only where the baseline was wrong or missing.
- **No change to the runtime's 1/20 s frame clamp.** It keeps motion from jumping on a slow
  device; the capture tool should adapt to it, not the page.
- **No npm dependencies and no network**, in keeping with the scripts' "Node built-ins plus
  headless Chrome" rule.
- **No forced WebGL2 to speed up capture**: it would change the images.

## 7. What changed in my thinking (written at the end)

- **Leaked Chrome profiles are not a tidiness issue; they stop the machine.** Mid-session, every command on this box
  started failing with `EDQUOT` (disk quota exceeded) on `/tmp`: about 3 GB of `explainer-chrome-*` profiles left
  behind by runs that were killed (Ctrl-C, a tool timeout, `process.exit` before the old 300 ms `unref`'d cleanup
  timer fired), from every job on the machine. That is exactly the cleanup `cdp.mjs` now does (kill and remove the
  profile synchronously on exit, on SIGINT/SIGTERM/SIGHUP, and when Chrome fails to start, with a watchdog for
  SIGKILL). Other people's leftovers were not mine to delete, so I ran my own jobs with `TMPDIR` on the big disk,
  which is the workaround doctor's `temp` line now suggests.
- **The "silent" bad-ref case was narrower than I wrote.** A `{ref:…}` chip naming a missing entity is reported
  whenever the reader would see it. It is silent only in a figure's *fallback* caption that `lesson.mjs` overrides,
  which no reader sees. So the real gap was noise (80 errors for one typo, never connected to a line), not silence;
  verify now folds it to one line per step id with the likely id and the figure line.
- **I found a real bug in the gate itself.** `verify`'s summary counted only runs, so a param error or a hung build
  ended with `0 failing` while exiting 1, and `check` (which reads that count) would have said "Passes". SKILL.md and
  the teacher agent gate on `0 failing`. Fixed in both.
- **A lesson-id typo stays a warning**, not an error: the page still works (the step shows the figure's caption), and
  the teacher gate already refuses lesson warnings. The change is that the warning now says what to type.
- **Speed, measured, not hoped for.** The full capture takes 57 min against the baseline's 27m50s on the same
  machine: twice as long, because it now plays the 58 cards the baseline timed out on or never tried, with no errors.
  Doctor's first speed model predicted 239 min for it; I refitted the model to the measured run rather than leave an
  estimate that would make an author give up.
- **The 11 failing tests were a symptom, and the symptom had a sibling.** Proving the Chrome change safe meant
  running `scripts/test/e2e.mjs`, and it failed 5 of 11 checks on the base commit for the same reason as two of the
  stale director tests: a fake timeline with no `world`, which the timeline contract requires. A one-line fixture fix
  brought it to 11/11. Every one of the 11 test fixes was checked against the engine change behind it (CHANGES.md
  §8); the same commit takes current `main` from 298/309 to 309/309.
