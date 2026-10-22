> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/15-lesson-words), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/15-lesson-words/GOALS.md)), the lesson diffs and the check logs. The code diff is under **Files changed**.

## TL;DR

- **Raft's crash story contradicted itself because the simulation was wrong, not the words.** A leader that stepped
  down kept itself as "the leader it knows". So with 7 servers and lost messages, s3 turned the client away
  "pointing at s3", and the client sent its command straight back to s3. A server now forgets who leads when it sees
  a newer term, as Raft does, until that leader's heartbeat names it. A refusal with no hint was also told as a
  retry "after 210 ms" when no time had passed; now the client looks for the leader at once.
- **Two lines a knob could make false, and one wrong number:**
  - Raft's start card said "Five servers…" whatever the Servers knob said (3 to 7, and a shared link can open at any
    of them).
  - MapReduce's Shuffle chapter said "with 2 counters, 0 or 1" at every number of counters.
  - Consistent hashing gave "52% for 4 servers" next to a formula that gives 49%.
- **The 9 lesson ids verify never reaches are all live.** None is a typo or dead; each is reached by settings verify
  doesn't try (your own input text, n = 5 in one story, message loss, a test-only switch). Each now has a comment
  naming them, so nobody deletes live words.
- Branch **`polish/lesson-words`**, 5 commits on `1f93977`. The default stories' words change only in the three
  lines above. verify 0 failing on all 8, unit tests 332 / 332.

## Before and after

| | `main` (1f93977) | this branch |
|---|---|---|
| Raft, crash at its maxima: a server points the client at itself | yes (step 90: "s3 … turns `y←7` away, pointing at s3") | never |
| Raft, crash at its maxima: "the client sends `y←7` to s3", just refused by s3 | yes (step 97) | no: "… to s5, the leader it knows" |
| A refusal with no hint told as "No answer … after 210 ms" | yes | no |
| Raft's start card at 3, 4, 6 or 7 servers | "Five servers keep copies…" | "A few servers keep copies…" |
| MapReduce's Shuffle chapter at 1, 3 or 4 counters | "with 2 counters, 0 or 1" | "here {R}: the remainder, always less than {R}" |
| Consistent hashing: the biggest arc for 4 servers | "about (ln N + 0.58)/N, roughly 52%" (the formula gives 49%) | "(1 + 1/2 + … + 1/N)/N, near (ln N + 0.58)/N for many servers: 52% for 4" |
| Lesson ids verify reports unreached | 9 (in 4 examples), unexplained | 9, each with the settings that reach it |
| Default lessons' words changed (`lesson.mjs` diff, all 8 examples) | | 3 lines: the Raft hook, MapReduce's shuffle, consistent hashing's arc |
| Raft captions over 18 words at its maxima (verify advisory) | 8 | 9 here; 5 merged with the phone branch (section 1) |
| Raft sim tests / unit tests / verify on all 8 | 7 / 332 / 0 failing | 7 / 332 / 0 failing |

---

## 1. Raft: a server that steps down forgets who leads

`0833a87`, `examples/raft/figure.mjs`, `examples/raft/lesson.mjs`.

**The problem.** In the crash story with every knob at its maximum (7 servers, 30 ms, 1 message in 10 lost), the
explain panel read, two steps apart: "s3 is not the leader: it turns `y←7` away, pointing at s3." and "The client
hears that s3 is not the leader. The client sends `y←7` to s3, the leader it knows." Both were what the run did. The
run was wrong: s3 had led an earlier term, stepped down when it saw a newer one, and kept `leader = s3`.
`becomeFollower` cleared the role and the votes but not the leader, so a stepped-down leader pointed clients at
itself.

In Raft, a server that sees a newer term does not know who leads it until that leader's heartbeat arrives (§5.2).
`becomeFollower` now forgets the leader on a newer term and whenever a leader steps down; the heartbeat handler sets
it right after, as before.

That exposed a second wrong line. A refusal with no hint called the retry path, which says "No answer for `y←7` after
210 ms: the client sends it again", though no timeout had run out. Such a refusal now looks for the leader at once
(a "lookup", the same as when the client has none), and is not counted as a retry.

| Before (step 97, the client sends `y←7` back to s3) | After (to s5) |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/15-lesson-words/shots/before/raft-crash-max-step-97.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/15-lesson-words/shots/after/raft-crash-max-step-97.png?raw=true) |

The full set of changed lines at the maxima is in
[`lesson-diff/raft-crash-at-maxima.diff`](lesson-diff/raft-crash-at-maxima.diff). Later steps change because the
run's timing changes, and each still says what the run does. The default stories are word for word the same, and
the Raft sim tests (`sim/fixtures/raft.test.mjs`, Figure 8 included) pass 7 / 7.

The new timing has two followers lack the same entry in one step, so the leader's step back is said once for both
("s7 and s2 are missing entry 3, so s5 steps back…"). The phone polish branch does the same for the refused update
itself. This branch alone has 9 captions over 18 words at the maxima, against `main`'s 8; merged with the phone
branch there are 5, as on that branch, and the two merge without a conflict (tried).

## 2. Lines a knob could make false

**Raft's start card** (`a0f2f92`, `examples/raft/figure.mjs`, `README.md`). The hook is static text, read by the start
card and the handout, and it said "Five servers keep copies of the same list…". The Servers knob runs from 3 to 7, and a
shared link can open the page at any of them:

| Before (a link at 7 servers) | After |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/15-lesson-words/shots/before/raft-start-7-servers.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/15-lesson-words/shots/after/raft-start-7-servers.png?raw=true) |

It now says "A few servers"; the election chapter's Now line, right beside it, already gives the count from the run.

**MapReduce's Shuffle chapter** (`1f57d32`, `examples/mapreduce/lesson.mjs`). "Divide it by the number of counters:
the remainder (with 2 counters, 0 or 1) names the counter" was true only at the default. The lesson's own header
promises every line stays true at every knob value (1–4 counters). It now reads "…the number of counters, here
{R}: the remainder, always less than {R}, names the counter", with `R` from the run. With one counter it says
"always less than 1", which is right: the remainder is always 0. The skew story has its own words and is unchanged.

**Consistent hashing's biggest arc** (`e34d8be`, `examples/consistent-hashing/lesson.mjs`). The deeper layer said the
biggest of N random arcs is "about (ln N + 0.58)/N, roughly 52% for 4 servers". At N = 4 that formula gives 49.1%;
52.1% is the exact average, (1 + 1/2 + … + 1/N)/N, and ln N + 0.58 is its approximation for many servers. Both are now
given, so the number matches what it follows from.

## 3. The lesson ids verify never reaches

`1663010`, comments in four `lesson.mjs` files. verify notes, on `main`, 9 lesson ids that no run it makes reaches: "a
typo, a step the figure no longer makes, or one only untried knob values reach". A sweep outside the repo tried every
value of each knob alone, 300–600 random combinations per story, seeds 1–40, and the free-text knobs verify leaves at
their defaults ([`unreached-ids.txt`](unreached-ids.txt) has every finding):

| Example | Id | Reached by |
|---|---|---|
| B+ tree | `split.signpost` | order 3 and your own ids in falling order ("99 98 … 86") |
| MapReduce | `map.empty` | your own input shorter than the mappers ("a b" on 6) |
| MapReduce | `reduce.sum-all` | every word on a counter repeating ("fox fox dog dog the the") |
| Quicksort | `repeat.copy` | "Lots of repeated numbers" at n = 5 |
| Raft | `vote.old` | message loss on, some seeds |
| Raft | `stuck.old`, chapter "Stuck" | `noop: false`, which only the Figure 8 tests (and old links) set |
| Raft | `agree.where` | an empty "Client commands" field |
| Raft | `beat.send-many` | none of 2,592 settings tried; the figure can still say it |

None is a typo or dead, so nothing was removed. The words were read in each reaching run and are right. Each entry
now carries a one-line comment with its settings.

## 4. Read, and found right

Every prediction (38), pick and end check of the 8 lessons was read against its run, and so was the static text a knob
can change (hooks, chapter abouts, takeaways, scenario descriptions). The numbers checked include MapReduce's 4 totals
from 7 slips and its skew counts (10 of 14, 12 on reduce 0, 11 with 4 counters), Quicksort's expected comparisons
(20.6 for 9, 32.7 for 12), the timer clamp (4 ms past five levels), the L1 cache's ways, and Virtual memory's 1,400
cycles over 440 reads. Linked list's "Reaching the 5th item takes 5 arrows" looked wrong, but it is a misconception's
wrong belief, and its fix says 4.

## Checks

- `verify.mjs`, all 8 examples: 211 runs, 0 failing; Raft's 3 warn-level advisories at its maxima, as on `main`
  ([log](verify-after.txt)).
- Unit tests: 332 / 332 ([log](tests-after.txt)); Raft sim tests 7 / 7.
- `node scripts/lesson.mjs`, all 8 examples, before and after: [`lesson-diff/`](lesson-diff/). Only the three lines in
  section 2 change in the default stories.
- A trial merge with `polish/phone-sheets`: no conflict; verify 0 failing; 5 Raft captions over 18 words at the maxima.
- Every screenshot here was read.
- **Not verified:** I read every prediction, pick and end check and the knob-dependent static text, not every one of
  the 5,841 lesson lines at New and at Expert; the rest was searched (written-in counts against knob ranges), not read
  line by line. Not run: `check --full`, the a11y audit and the HUD browser suite, since nothing here touches the HUD.

## Next

1. **Raft at 7 servers: pacing.** "Copying the log" and "Re-election" still run over 150 s at 1×. Splitting them is a
   lesson-structure decision.
2. **verify could try the free-text knobs** (a short input, a falling list, an empty field) so live lesson entries stop
   showing as unreached. That is a new kind of run, so it needs a decision.
3. **Event loop treats a repaint as a task in the task queue.** The HTML spec runs rendering as a step of the event loop
   between tasks, not a queued task. The lesson is consistent with its own model; the model is the simplification.
4. **Virtual memory:** program A's first lookup "cost 961 cycles" (with the note check), and B's "after 960 cycles" (the
   walk alone). Both are true, but side by side a reader may wonder why B was quicker; one framing for both would help.
5. `beat.send-many` (two leaders heartbeating in one step) was never reached; a split that leaves both sides fully
   caught up would show it, if the story wants it.
