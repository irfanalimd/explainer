# 01 · The learner's journey: goals

Lens: the first-time learner, from the moment a link opens to "I get it", and the same learner two days later.
Branch `product/01-learner-journey`. Baseline: `00-baseline/` (commit `9c8b16d`). Extra baseline evidence I captured
myself (live play, a second visit in the same browser) is in `shots/extra/before-*.png`.

## 1. Who, the job, and what success looks like

**Maya**, second-year CS student. She knows loops, functions and dictionaries; she has never heard of MapReduce. A
friend drops a link in a group chat: "this explains MapReduce really well". She has 15 minutes between classes, a
laptop (sometimes only her phone), and nobody to ask.

**The job she hires the page for:** "Make me understand MapReduce well enough to explain it, without wasting my 15
minutes, and let me stop and come back."

**Success, in observable terms:**

1. Within 10 seconds of arrival she knows what the page is, what she will get out of it, roughly how long it takes,
   and that pressing Play is the way in. Nothing starts before she is ready.
2. At every moment she can answer: where am I, how much is left, what do I press to go on. No state on screen is
   empty, contradictory or a dead end.
3. At the end she has evidence that she learned it (the check), a short summary she could say back, and an obvious
   next thing to do: the next story, try the knobs, or the next lesson.
4. **Two days later**, opening the same link from the chat, the page remembers her: her level, which stories she
   has finished, and where she stopped, and offers to pick up there. It never forces it.
5. All of this works on a phone, and none of it changes what a capture (shoot, record) shows for the same `t`.

**The second persona, Sam (returning learner):** finished "Everything works" on Tuesday and closed the tab. On
Thursday he wants the failure stories. Success: one click from the link to "One machine crashes".

## 2. What "complete" means for her

The whole path, including its edges:

| Moment | What complete looks like |
|---|---|
| Arrival | A start card that asks the question (the hook), says what the run holds (chapters, minutes, questions, what-ifs) and lets her pick a level knowing what each level does. Nothing plays until she says so. |
| First chapter | The chapter card she is told about is actually on screen (the "table" of parts), the step in view, room to read. |
| A question | The transport and the panel agree on the one way on (answer). Before the question opens, nothing refers to a prediction she has not been asked yet. |
| Lost | Back, Earlier, Replay this chapter (already present), and a primary button that never lies about what it will do. |
| Story's end | The check, "You can now…", the recap and takeaway, then the **next story** as the primary action, "Try it yourself" with the knobs, and after the last story the lessons that follow. |
| Return | "Welcome back": where she stopped (chapter, step, story), how many stories are done, "Pick up where you left off" or "Start from the beginning". Finished stories carry a check. Her level is kept, also on the next figure she opens. |
| Phone | The same promises: the start card sheet, Welcome back, "Next story" in the dock, the end sheet with the same after-run rows. |
| No storage | Private window, blocked storage: everything still works; the page just forgets (every read and write is wrapped). |
| Capture | Frozen capture never writes progress and never shows the marks; the start card never opens in capture; a resume is never automatic. |

## 3. Audit of the baseline

Each gap with its evidence. "B:" marks a baseline shot in `00-baseline/shots/`, "X:" one of my extra captures of
the baseline in `shots/extra/`.

### Arrival

1. **No promise of size or time.** The start card has the title, the hook, the level switch and two buttons, but
   nothing on how long it takes, how many chapters, that there are questions, or that four stories follow
   (X: `before-start.png`). A student with 15 minutes cannot plan. The run itself knows all of this: 25 steps,
   140 s at 1× (`lesson.txt`: "Story 1 of 4 · Everything works … 25 steps, 140 s at 1x"), 5 chapters, 3 asks,
   3 end-check questions.
2. **The level switch is a guess.** "How well do you know this?" with three labels and no word on what each one
   changes (X: `before-start.png`). Picking "Expert" by mistake opens every deeper field and makes predictions
   skippable (`engine/hud/level.mjs` POLICY), which a beginner would not expect.
3. **The subtitle never appears on desktop** ("Counting words with a team of machines", `figure.mjs` meta). Minor:
   the hook carries the card well, so I leave it.

### Orientation and ambiguous states

4. **The first chapter card points at a table that is not there.** At step 1 the panel says *"Cut the text into
   pieces, one per machine. The table names the parts; each comes back when its step plays."* but no table is on
   screen, at Basics (B: `happy-light-1440x900-000-mid.png`) or at New (X: `before-new-step0.png`). Cause:
   the Parameters card takes ~270 px of the right column at 1440×900, so `fit()` in `engine/hud/explain.mjs`
   drops the entry card's So far / Done lines **and the picture map** (`hud.css`: `.ix-ex-fit-entry
   :is(.ix-entry-sofar, .ix-entry-done, .ix-picture) { display: none }`). At New the learner loses exactly the
   orientation New exists to give.
5. **"Explained once you have made your prediction."** shows in place of the chapter's summary on steps *before*
   any question has been asked (B: `crash-dark-1440x900-005-mid.png`, step 6 of 27; the question opens at step 8).
   A first-time learner reads it as "I missed a prediction" (`engine/hud/explain.mjs:41`, `WITHHELD`).
6. **An empty "Earlier" heading** at the foot of the panel when it runs out of room
   (B: `crash-dark-1440x900-005-mid.png`). Same root cause as 4.
7. **Play that does nothing.** While a prediction or a pick is open, the dock's primary pill still says "Play"
   (B: `crash-light-1440x900-007-ask.png`; X: `before-pick-open.png`). Pressing it plays for a frame and stops
   again at the same question, and nothing says why: `before-pick-play-pressed.png` is the same picture as the shot
   before it. It breaks DESIGN.md §9.2, "One way on".

### The end

8. **The end of a story offers "Replay" as the way on** (B: `crash-light-1440x900-026-end-card.png`, dock: "Replay").
   For a learner who just finished "One machine crashes", replaying it is the least useful next step; the next story
   is only a highlighted chip in the panel's "What if…" row, below the end check.
9. **No "try it yourself".** The page's best tool for checking one's own understanding (change the machines and the
   run recomputes) is never suggested at the end. Meanwhile the Parameters card sits open from the first second,
   competing with the lesson (see 4).
10. **No next lesson.** After the last story there is nowhere to go. Seven more lessons exist in `examples/`
    (consistent hashing and Raft follow directly from this one: `hash % R`, and a master with no backup), but the
    page never mentions them.
11. **Neither the end check's end nor the payoff is ever captured.** B: `crash-*-026-end-card.png` show the check's
    first question answered; the recap, takeaway and what-ifs that `references/tooling.md` says the end card shows
    sit under it. No baseline shot shows the end of the happy path at all (see 13).

### Return

12. **The page forgets her.** A second visit in the same browser opens on step 1 of 25, paused, with no card and no
    trace of the chapter she reached or the story she finished (X: `before-return.png`, `before-return-phone.png`;
    `engine/runtime.mjs:518` opens the start card only when `!hud.introSeen`, so once ever). The URL hash carries
    `t=` while she plays, but a link reopened from a chat message has no hash. Her level *is* remembered, per
    figure only, so the next lesson she opens starts at its own default again (`level.mjs`, `level:${key}`).

### The capture itself

13. **The `--teach` failures are timeouts, not page bugs.** With the machine loaded (load average 17 on 4 cores) and
    software rendering, a frame takes about 4 s: I measured 3 frames drawn in 11.6 s at 1440×900
    (`__internals.stats().renders`), and the playhead moved 0.117 s in that time. The runtime caps each frame's step
    at 1/20 s (`engine/runtime.mjs` `tick`: `clamp(dt, 0, 1 / 20)`), so 1× live play ran at about 1/100 of real
    time and every wait in `teachShots` (15–30 s) expired: "questions at steps 6/7 never revealed", "the pick at
    step 12 never held", "never reached its end card". The flows themselves work: my live drives at 8× open, answer
    and reveal all of them (`shots/extra/`). Fix: `--teach` plays at 8× between cards and waits three times longer
    (questions, picks and pauses stop the run at their own step at any speed), and the end card now walks through
    the end check. *Product note, not fixed:* on a device that draws under 20 frames a second the same cap makes
    playback slower than real time (a 10 fps Chromebook plays at 0.5×).

### Phone

14. The same gaps apply (X: `before-start-phone.png`, `before-return-phone.png`). The phone end
    (B: `crash-dark-390x844-026-end-caption.png`) stacks the check over the takeaway and what-ifs, and the dock offers
    only Replay.

## 4. Ideas, ranked

Impact: how much closer Maya gets to "understood, and knows what next" (or Sam to "back in one click").
Cost and risk: code size, shared files touched, capture determinism, risk to the design language.

| # | Idea | Impact | Cost / risk | Why this rank |
|---|---|---|---|---|
| 1 | **Welcome back: resume where you stopped** (saved per viewer; the start card offers it; a finished story offers the next one) | very high | medium: runtime and HUD; storage must never move a capture | The only way Sam gets back in one click. It also gives the start card a second life instead of "shown once ever". |
| 2 | **At a story's end, "Next story" is the primary action** (Replay stays, quiet) | high | low: the transport's held state | Turns four separate stories into one course. The page already suggests the next story in the chips; this makes it the one way on. |
| 3 | **Finished stories carry a check** in the strip and the menu | high (orientation across visits) | low; hidden in capture | Answers "what have I done, what is left" for the whole lesson. |
| 4 | **Parameters start folded on a lesson figure**, and the end invites "Try it yourself" | high | low code; design risk (the owner chose "starts open") | Fixes gaps 4 and 6 at the root: the panel gets its room back, so the chapter card and its picture map show. The knobs become a follow-up instead of noise in minute one. |
| 5 | **The start card's promise**: chapters, minutes, questions, what-ifs, from the run | high at arrival | low | A 15-minute learner can plan; every number is from the timeline and the level. |
| 6 | **A line on what each level changes**, under the switch | medium | very low | Removes the guess. |
| 7 | **No dead Play**: "Answer to go on" while a question waits; pressing it points at the options | medium | low | Fixes a "nothing happens" moment at the page's most important beat. |
| 8 | **Withheld-summary wording** that does not refer to a question not yet asked | medium | trivial | Fixes gap 5 for every figure with a prediction. |
| 9 | **Next lessons** after the last story (`lesson.next`) | medium | low: lesson data and HUD | Gives the end a "where now" beyond this page. |
| 10 | **The level carries over to the next figure** | medium (across lessons) | trivial | A learner who chose New on MapReduce should not have to choose again on Raft. |
| 11 | **Fix the `--teach` capture** (8× between cards, longer waits, walk the end check) | high for this review, indirect for the learner | low: `scripts/shoot.mjs` | Without it the owner cannot see any end-state work in the standard capture. |
| 12 | "About 1 min left in this story" in the dock | medium | medium: the dock is crowded at every size | Nice, but "12 / 25" already gives a sense of it, and the dock is the most contested space. |
| 13 | A one-key "what just happened?" replay of the last step | medium | medium | Back then Play already does it in two presses. |
| 14 | A one-question pre-check at the start, to prime | medium | high: new lesson content and more reading before the first frame | Good learning science, but it lengthens the arrival this lens wants shorter. |
| 15 | Raise the 1/20 s frame cap so slow devices play at true speed | low–medium | camera springs and fades read `dt`; risk to motion polish | Real, but belongs to the motion owner. Noted, not done. |
| 16 | Show the subtitle on the start card too | low | trivial, but it competes with the hook | The hook already does the job. |

## 5. The chosen set

1. **Welcome back** (ideas 1, 3, 10): `engine/hud/journey.mjs` (new), the start card, `runtime.mjs` `resume()`.
2. **The way on at a story's end** (idea 2) and **after the run** (idea 4's invitation, idea 9).
3. **Room to teach** (idea 4): Parameters folded on a lesson figure.
4. **Arrival** (ideas 5, 6).
5. **No ambiguous states** (ideas 7, 8).
6. **A capture that reaches the cards** (idea 11).

Why this set: it covers the four moments where a learner loses the thread (arrival, the first chapter, the end and
the return) with structural changes rather than cosmetic ones, and every one generalises to the other 7 examples
with no per-figure work except the optional `lesson.next` list. Several are visible in the standard capture (the
folded Parameters and full chapter cards in every desktop shot, the withheld line in crash 005, "Answer to go on" in
every ask shot, "Next story" and the after-run rows in the end-card shots); the rest (start card, Welcome back,
resume, finished marks) are in `shots/extra/`.

## 6. What I will deliberately not do

- **No autoplay and no automatic resume.** The page waits for the learner; a resume is an offer. Auto-seeking would
  also make a capture depend on what the browser remembers.
- **No scores, streaks or badges.** teaching.md §5.5: the check ends on "You can now…", never a score. A check mark
  on a finished story is orientation, not a reward.
- **No chapter list on the start card.** The owner removed it on purpose (newcomers don't know the terms yet;
  `hud.mjs` renderIntro). The promise counts chapters without naming them.
- **No new lesson words beyond `lesson.next`.** The lesson passed its blind review; I don't rewrite it.
- **No change to the frame-time cap** (idea 15) or to the phone caption layout: other owners, other risks.
- **No cross-device sync or accounts.** Per-viewer browser storage only, as the brief says.

## 7. What changed in my thinking (written at the end)

- **The chosen set held, with one design turn.** I first meant to stop the chapter card's picture map from vanishing by
  making room for it (Parameters folded). That helped (the step and the card's Now line are back in every desktop
  shot), but the map is seven rows and a "where it stops matching" line; at 1440×900 it still does not fit beside the
  first step. Rather than drop the step's why to make room, the map now **folds to its heading, a disclosure**
  ("The picture · a library counted by a team ⌄"), before So far and Done go. The card's "the table names the parts"
  now points at something on screen that opens in one click. A learner who opens it keeps it open (the panel scrolls).
- **A resume must not land on an answer.** Picking up at a step that asks would have played the answer before the
  question; resume now lands just before such a step, so the question opens again (`runtime.mjs` `resume()`).
- **The end check needed the same "one way on" rule as a question.** Once the end's pill became "Next story" (solid,
  ringing, with an Enter chip) it competed with the end check's own "Next question" while the check was still asking.
  It now waits in a quiet raised form until the check reaches "You can now…", then turns solid and calls.
- **The level carries over** (an idea I ranked 10th) turned out to be the cheapest fix for the return journey across
  lessons, and it rode along with the journey work.
- **The storage-injection plan for the return journey.** To show the return states, I first considered writing crafted
  values into localStorage before load. I chose instead to drive the real journey in one browser (play a story to its
  end, take the next story, stop in Shuffle, reload the same link), so the stored state in every return shot is what the
  page itself wrote. Injection is used for one case only: a browser whose `localStorage` throws, to show the page still
  works and simply forgets.
- **Capture on this machine.** The `--teach` timeouts were the loaded machine, not page bugs (§3, gap 13). Live play now
  runs at 16× between cards with four times the waits. Even so, under a load average of 13 to 17, a few live steps (the
  end check's walk-through over the 2,000-machine scale shot) can still exceed a wait; I report any that did in CHANGES.md.
- **A tooling leak found on the way:** `scripts/lib/cdp.mjs` removes Chrome's temporary profile in an `unref()`'d timer,
  so a script that exits right after `browser.close()` leaves ~150 MB in `/tmp` each run. By this afternoon they had
  filled the per-user quota on `/tmp` (my shell could not write its output). I cleaned up the idle ones but did not fix
  the shared script (another owner's file); it is the first item under Next.
