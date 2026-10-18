# 02 · Active learning: teaching that sticks

Branch `product/02-active-learning`. Lens: does the MapReduce page make the learner **think and do**, or only watch?
And does it teach the novice and the ten-year expert measurably better?

## Who this lens serves, and the job

| Person | The job they hire the page for | Success, observably |
|---|---|---|
| **The novice** (knows Python lists, dicts, loops; never met MapReduce or hashing) | "Help me understand how many machines count words exactly, well enough to explain it and to answer a question I haven't seen." | Commits to a guess before each surprise, and is sometimes wrong on the way (that is the point); after a story, answers a question about a *new* situation (another number of counters, a crash at another moment, the combiner turned on) from the rule, not from memory of a caption; can say back what each story taught. |
| **The expert** (ten years of Hadoop or Spark) | "Show me something precise I didn't know, and don't tell me anything false." | Finds no `wrong` or `misleading` line at Expert depth; meets at least one real nuance per story, with a citation (paper section, Hadoop or Spark doc); the one question Expert gets is a transfer question, not arithmetic. |
| **The teacher** using it with a class | "Give me predictions to pause on, and questions that tell me who got it." | Every story has its own prediction(s) right before the aha and an end check about that story's idea; a wrong pick plays out for real, so the class *sees* the broken count. |
| **The author** running the teacher pipeline | "Let the blind readers see what the learner does." | `lesson.mjs` and the review packet show the in-world pick, its real wrong branch and the end check, so the novice and expert readers can judge them. |

**Complete** for the learner means the whole journey: the setup does not give away the answer; each prediction comes
right before the step that settles it; a wrong pick plays out and names the belief; the end of each story checks *that
story's* idea on a new situation and brings back an earlier idea (spacing); "You can now…" lists only what the story
taught; and the moment after (switching to the next story) asks fresh questions instead of showing a done card.

## Audit of the baseline (evidence)

Sources: `00-baseline/lesson.txt`, the baseline shots, `examples/mapreduce/*.mjs` at `9c8b16d`, and two **blind
reads** I ran on the baseline packet: a fresh Sonnet novice and a fresh Opus expert, each given only the packet folder
and the body of `agents/novice-reader.md` / `agents/expert-reader.md`. Both caught their canaries (the novice flagged
"This is the node at work.", the expert flagged "17 in all"), so both reports are valid. To make the before packet
fair, I built it with the packet tool *after* change 6 below, from the baseline `figure.mjs` and `lesson.mjs`, so it
shows the baseline's pick and end check (the old packet left them out). The packets have no images (Chrome was
saturated by six agents); the text is what was judged. (Those first raw reports were lost with the first session; the
end of this file has a fresh before/after pair, with raw reports in `evidence/`.)

### A. Active moments: where the learner decides, and where they only watch

| # | Gap | Evidence |
|---|---|---|
| A1 | Each story has **one** interaction. Basics (the default for `core`) can show two per story and New three; the happy story's Split, Map, Reduce and Output chapters ask nothing. | `00-baseline/lesson.txt`: one PREDICT each in stories 2–4; story 1's only question is the pick (not even printed, see D1). `engine/hud/turn.mjs:16` `CAP = { new: 3, basics: 2, expert: 1 }`. |
| A2 | The predictions are answered **from the setup text**, not by thinking. The scenario description, shown under the picker before the story starts, states the answer. | Crash description: "…and the master has that piece read again" = option B of the crash prediction. Straggler: "…so the master races a backup copy of its piece" = option B. Novice: crash prediction "Answered without understanding: the scenario blurb and the master definition gave away B"; straggler "Mostly a pure guess from the scenario blurb that mentioned a backup copy". |
| A3 | The Shuffle chapter's about and its "You'll know it worked when" state the very rule the pick asks for, before the pick. | `lesson.mjs:78` about "every slip for one word must reach the same counting machine"; enter.done "All the slips for any one word sit on the same counting machine". Expert: "This tests recall, not understanding… the page has just shown the first 'the'… and stated the rule". |
| A4 | The skew story repeats the happy story's prediction (same misconception `m-even`, same shape) instead of asking what is new in skew: where the *common* word's slips go, and what fixes the overload. | `lesson.txt:704` "The first "200" went to reduce 0. Where does this "200", from map 0, go?"; novice: "Recall of the previous lesson; I could answer it without thinking". |
| A5 | The pick itself is good (a wrong pick plays for real and names `m-even`), but the `--teach` capture never reached it on this box. | `00-baseline/shoot-log.txt`: "the pick at step 12 never opened/held", "questions at steps 6/7 never revealed", "the run never reached its end card" (23 errors). See E1. |

### B. Retrieval and transfer

| # | Gap | Evidence |
|---|---|---|
| B1 | The end check is the **same three questions in every story**. After "One machine crashes" the reader is asked about hashing and splitting, never about crashes; after "One machine is slow", never about backups. | `figure.mjs:588-605` (one `s.check` block for every scenario). Shot `crash-light-1440x900-026-end-card.png`: "Suppose a new job with 3 counting machines instead of 2. Which one gets every the slip?" Novice: "Check yourself s3 and end (same three questions repeated): No thinking the second and third time". |
| B2 | The headline transfer question is **arithmetic on a 10-digit number**: which counter gets "the" with 3 counters needs `3 020 861 980 % 3`. It tests a school digit-sum trick, not the idea. | Novice: "I had to compute 3 020 861 980 mod 3, using the digit-sum trick, which is outside the page"; for skew "3 286 718 301 divided by 4: last two digits". Expert: "All four Check yourself questions… are the same template… arithmetic and recall". Shot `skew-light-1440x900-028-end-card.png`. |
| B3 | Because the questions are identical, `check.mjs` keeps the progress (it compares a signature of the questions), so a reader who finished the happy check lands on the done card in later stories: no retrieval at all. | `engine/hud/check.mjs:111-114` (`if (C && C.sig === sig) return;`). |
| B4 | "You can now…" lists **all four objectives** after any story: after the happy story it claims "Say why a crashed or slow reading task can simply run again". | `engine/scene/lesson.mjs` `headerOf` (no story filter); `check.mjs` `renderDone`. Novice: "'Which finished work must re-run' was only touched once"; "The checklist claims I now know the shuffle's cost, but the text never says what the cost is" (**blocked**). |
| B5 | No spacing: no later story brings back the first story's idea on purpose. | The same check in every story (B1) is repetition of one item, not spaced retrieval. |

### C. Misconceptions confronted with a run

| Misconception | Baseline | Evidence |
|---|---|---|
| Hash partitioning = even spreading (`m-even`) | Confronted (pick + skew ask), but "a hash spreads the *load* evenly" only half: it spreads keys, never the copies of one key. | Expert: "'hash = balanced' is only half addressed: hashing spreads distinct KEYS roughly evenly… never the RECORDS". |
| "One machine adds it all at the end" (`m-central`) | Only an option in the skew ask. | `lesson.txt:704`. |
| "A counter writes one number" | Not confronted. | No question in Reduce. |
| A crash loses work (`m-lost`) | Confronted, but answer given away (A2), and the *why* was false: "The input is stored apart from the machines that read it". | Expert, `wrong`: GFS chunkservers run on the workers; the text survives by replication (§3.4). |
| Finished map work is safe when its machine dies | Only in an `edge` field; never asked. | Expert: "sits only in an Edge case; no question asks it". |
| Keeping both copies is harmless | Not asked. | — |
| More counting machines fix a hot key | Not confronted anywhere. | Expert: "This is the ideal place to confront 'add more reducers to fix a hot key', and the answer never takes it." |
| A combiner changes the counts | Not confronted; the remedy is a hypothetical last line. | Novice (**blocked**): "This is the key fix but it arrives as a final line after the run… slips can hold numbers other than 1? Map said every slip is 1. Confusing, and it was not shown happening." |
| Why one hot key slows the *job* | The load ratio is shown, never tied to time. | Expert: "never connects it to elapsed time: the job finishes when the slowest reducer finishes". |

### D. The words, and the tools that read them

| # | Gap | Evidence |
|---|---|---|
| D1 | `scripts/lesson.mjs` (the author's "read it as a beginner" tool) **does not print the in-world pick or the end check**, and `review-packet.mjs` leaves both out of the blind readers' packet. The main active moment and the transfer questions are invisible to the pipeline meant to judge them. | `00-baseline/lesson.txt`: no line for `shuffle.which` between steps 11 and 12, no check anywhere. `scripts/lib/lesson.mjs` (no `choose`, no `checks`); `scripts/review-packet.mjs` (no `choose`). |
| D2 | Verify's "every misconception is named by some option" counts only `s.ask` options, so a misconception named only by a pick or a check is reported as an orphan. | `scripts/verify.mjs:414`. |
| D3 | Words: "fair share" undefined; "3 of the 3 sent" unclear; "the others sat idle" when one had 2 slips. | Novice, skew steps 9 and 28. |
| D4 | Hard-coded numbers in the lesson, guarded only by `n === 11 && M === 3`. | `lesson.mjs:404-424` ("map 0 read 8 words back to back… In all 13 words"). |

### E. The expert layer (from the blind expert read; each checked against the paper)

- `wrong`: "The input is stored apart from the machines that read it" (§3.4: inputs are co-located and replicated).
- `misleading`: "one file per counting machine" (R regions, one per reduce *task*, §3.1; false at the paper's R = 5,000
  on 2,000 machines); "salting… by adding a random suffix" (a random suffix breaks the determinism the crash story just
  taught, §3.3); "A dictionary works only while every slip fits in memory" (distinct keys, not slips; Spark
  hash-aggregates).
- `missing`: a combiner may run zero or more times; its output type must match reduce's input; a combiner does not cure
  skew for a reduce that can't be pre-added.
- `nit`: the master-failure retry is not automatic; Hadoop's line reader also skips the partial first line; speculation
  is per attempt, not per phase; an empty reducer still writes an (empty) file.
- Citations the brief asks for and the lesson lacked: §4.1 (partitioning function), Hadoop and Spark speculative
  execution defaults, `reduceByKey` vs `groupByKey`.

### E1. The `--teach` capture errors: capture timing, not a page bug

I was asked whether the 23 `--teach` errors are a bug. They are a **capture-timing artifact**:

- The runtime advances the run's clock by at most 1/20 s per drawn frame (`engine/runtime.mjs` `tick`, the `dt` clamp).
  Under software rendering on this box, with other agents' Chrome running, I measured **0.25–0.5 frames per second**
  (load average 14–34). So the 0.25 s of run time before a pick takes ~20 s of wall time, and a prediction's reveal
  (70 % of its 4–5 s step) takes minutes, while `shoot.mjs` waited 15–20 s.
- Proof: in a fresh page the pick opened after 1.5 s; with the shoot's exact sequence under load it opened after
  **20.5 s**, past the 15 s timeout (`{"ms":20500,"frames":5,"open":true}`).
- At 60 fps none of this happens: there is no bug in the page. The fix belongs in the capture tool (change 7).

## Ideas, ranked by impact on the learner against cost and risk

| Rank | Idea | Impact | Cost / risk | Why it ranks here |
|---|---|---|---|---|
| 1 | **Story-specific end checks** that test transfer (a new situation, answered from the run's own rules) plus one spaced question from story 1 | Very high: fixes B1–B3 and B5; this is where "understood" is measured | Low: figure + lesson only | The biggest gap between "watched" and "learned". |
| 2 | **New predictions where the naive answer is wrong**: "how many totals will reduce 0 write?" (Reduce, happy), "where do all ten 200 slips go?" (Shuffle, skew), "which fix takes the work off the busy counter?" (Output, skew), each right before the step that settles it | High: A1, A4 and three misconceptions in C | Low–medium: inside the one-per-chapter cap | Uses the Basics budget of 2 per story the HUD already has. |
| 3 | **Run the "more counters" fix**: a new step applies the run's own hash at R + 1 and shows the hot code still lands on one counter | High: the expert's top missing misconception, with numbers | Low | Honest: same hash, same slips, stated as "would". |
| 4 | **Keep answers out of the setup**: scenario descriptions and the Shuffle about/done line no longer state what the question asks | High per question (A2, A3) | Very low | Without it, the predictions measure reading, not thinking. |
| 5 | **Scope "You can now…" to the story** (`objectives[].stories`) | Medium: removes false claims (B4) | Low: a few engine lines, backwards compatible | Small, generic, any example can use it. |
| 6 | **Print and packet the pick, its real wrong branch and the end check** (`lesson.mjs`, `review-packet.mjs`) | High for authors and every later review (D1) | Medium: shared scripts, merge risk | The blind-reader pipeline cannot judge what it cannot see. |
| 7 | **Fix `--teach` capture on slow machines** (scale waits by frame rate, play at 6× between shots) | Medium: teachers and authors see the cards; the final capture works | Low: shoot only | Needed to show my own changes. |
| 8 | **Expert layer**: fix the `wrong`/`misleading` lines; add §4.1, §4.2, Hadoop/Spark speculation defaults, `reduceByKey` vs `groupByKey`, the combiner's 0..n runs, deterministic salting, the hot-key-sets-the-pace link to the straggler story | High for the expert | Low; must cite carefully | Truth first. |
| 9 | Verify counts misconceptions named by picks and checks (D2); checks accept a `wrong` entry, as picks do | Low–medium | Low | Needed by 1; generic. |
| 10 | Pass the crash and backup costs as vars instead of hard-coding them (D4) | Medium (truth at other inputs) | Low | "If a number appears, the run produced it." |
| 11 | A second in-world pick (a faded worked example: the learner routes a *new* word, given its remainder) | Medium | High: the HUD asks one question per chapter; needs engine changes | Deferred: the cap is a deliberate teaching rule. |
| 12 | A crash-at-another-moment knob, so "finished work re-runs" plays for real, not only as a check | Medium | Medium: a new branch of the crash story, more verify runs | Deferred; the check covers it from the run's rule. |
| 13 | An objective-coverage lint (every objective checked by some question) | Medium for authors | Medium: lint + contract | Next. |
| 14 | "Average with a combiner" as a runnable wrong branch | Medium for experts | High (a second reduce function) | Next. |

## The chosen set

1–10. Together they move the learner from watching to deciding at least twice per story at Basics, make the end of
every story measure transfer for *that* story, and make every claim true at Expert, inside the house rules (one
interaction per chapter, at most 3 per story, every answer from the run's rules). 6, 7 and 9 are the tooling that lets
the pipeline, and this review, see the result.

## Deliberately not doing

- **No new interaction kinds** (fill in a number, drag a slip). The HUD's pick, predict and check cover the moves this
  lesson needs; a new kind means `engine/hud` work that other lenses own more directly.
- **No second pick per chapter.** The cap is a teaching rule ("keeps each one special"), enforced in `turn.mjs`.
- **No made-up numbers in questions** (a friendlier `hash(cat) = 14`): every answer comes from the run's FNV-1a.
- **Not chasing the failing unit tests**: the same 11 fail on a clean export of `9c8b16d` on this box; a 12th, the sampler's
  `<= 2 ms per sample` timing test, fails only under load and passes when run alone (see `tests-after.txt`).

---

## At the end: what was built, what the blind readers say, and what changed in my thinking

**Built:** all of the chosen set 1–10 (see `CHANGES.md`). Two things were added beyond it:

- spaced items that vary: story 1's ideas come back in later stories **at new numbers** (another word at 4 counters;
  a word the text doesn't have), and are not repeated word for word;
- `m-backup` ("a backup copy shares out a busy machine's work") as an end-check question in the common-word story. It
  ties the slow story's cure to the skew story's problem, which the expert's "the busy counter sets the pace" line had
  only stated.

**Fresh blind reads, before and after** (raw in `evidence/`; every report valid, every canary caught):

| What I watched for | Before (baseline lesson) | After |
|---|---|---|
| Does the novice ever get one wrong? (If not, the questions don't probe.) | 11 guesses, 0 wrong | 17 guesses, 1 wrong: the finished-map transfer. "I really guessed and got it wrong. I missed that the slips sit on the mapper's own disk." The card then names the belief and gives the fix. |
| Are predictions answered by thinking? | crash and slow: "Given away by the scenario description. No thinking needed." | crash: "given away by the master's definition" (a weaker leak, still open: Next #5). skew fix: "Real thinking by elimination, but step 4's remark … partly gave it away", so I removed that remark |
| Do the end checks test transfer? | expert: 0 transfer, 1 understanding, 3 recall, 2 arithmetic; novice: "the same three questions were repeated word for word three times" | expert: 2 transfer, 7 understanding, 1 recall; novice on skew's checks: "Applied the rule. Good thinking check"; "A bit tricky. Needed to separate this from the slow-machine backup idea" |
| Blocked moments (novice) | 2: the combiner "arrives as a final line"; "You can now … name what the shuffle costs" | 0 |
| Expert `wrong`/`misleading`, canary excluded | 3 misleading | round 2: 3 misleading → fixed; round 3: 1 wrong (the paper does name its output files) + 1 misleading (a "typical job" of 200,000 maps, also printed in the world) → fixed |

**What changed in my thinking:**

1. **A spaced item that repeats word for word is not retrieval.** The after-novice answered the repeated story-1
   questions with "Pure recall, an exact repeat of the earlier check". My plan said "bring back an earlier idea"; the
   reader showed that the *situation* has to change too. So the spaced items now use a new word and a new number.
2. **Leaks move; they don't vanish.** With the scenario blurbs fixed, the novice found the next-nearest giveaway (the
   master's glossary line, a hint in the map step's why). Keeping answers out of the setup has to be checked against
   everything the reader has seen up to that point, not only the blurb. The packet's commit-then-reveal chunks make
   that checkable, and that is reason enough for change 6.
3. **The expert layer needs a second and third read.** Each read of my own fixes found new, real problems (my "master
   cuts the text" was the paper's library's job; my salting line claimed too much; "typical job" contradicts the
   paper's own Table 1). A single expert pass is not enough when the deeper layer is long. Two passes after the last
   edit is the right bar.
4. **The `--teach` errors were capture timing, not a page bug**, and I measured it (E1). There were two causes: waits
   not scaled to the frame rate, and a revealed card leaving before the next poll. Both are fixed in `shoot.mjs`, and
   the after capture shows every card.
5. **Not built, deliberately, and still right:** a second pick per chapter, and new interaction kinds. The checks and
   predictions reached "decide twice per story, transfer at the end" inside the HUD's existing rules.
