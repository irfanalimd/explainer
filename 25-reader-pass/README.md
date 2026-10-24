> **Draft, for review only. Don't merge yet.** The diffs per example are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/25-reader-pass). The code diff is under **Files changed**.

## TL;DR

A careful reader pass over the three lessons published on the site (MapReduce, Raft, Event loop): each read end to end
at New and at Expert, every story, once as a beginner marking every place they would get lost, once as an expert
checking every number against the run and every claim against its cited source. **14 fixes**, text only. The owner
saw the result on the remade MapReduce page and approved it.

Branch **`content/reader-pass`**, 3 commits on `site/build` (#25 content round + #26 + #27 on #20's original look).
Unit tests 369 / 369, verify 211 runs, 0 failing on all 8 examples.

## MapReduce (4)

- **End check "add one more the":** B and C had the same feedback, which missed C's mistake (12 is every word read).
  Now: "the already has a total, so one more raises that total by 1 and adds no new one. The output holds one total
  per different word, not one per word read: 8."
- **End check "4 reading machines, how many words does the busiest read?":** a wrong pick had no feedback. Now: "The
  master cuts the 11 words into 4 pieces of nearly the same size, one per machine, so no machine reads them all and
  the biggest piece has 3." The common-word story gets the same line about log lines.
- **Steps 24 and 25** both stated §3.5's 200,000 map tasks on 2,000 machines. Step 24 now gives Table 1: "At Google in
  August 2004 the average job ran 3,351 map tasks and 55 reduce tasks on 157 machines (Table 1), so each machine ran
  about 21 map tasks in turn."
- **Split's Now card** pointed at a table not yet shown ("The table names the parts; each comes back when its step
  plays"). Now: "“The picture” below matches each part of the library to a part of the system."

## Raft (5)

- **Chapter 2's card** said "One server won the vote" a step before S1 wins. Now: "One server asked for votes, and they
  are on their way. No command has been saved yet."
- **Agreement:** "the same committed log" became "the same committed commands" (each lit log also holds the `nop`), in
  the lesson and the figure's caption.
- **Crash story:** right after "Leader S1 crashes", its `y←7` still arrives on 4 servers; the crash step's why now adds
  "Copies already on the wire still arrive."
- **Crash story, re-election win:** the why restated the prediction's answer just revealed. Now, in that story only:
  "So nothing that counted has to come back from the crashed server: the new leader already holds it."
- **Split story:** "its copies can't cross the split" was followed by S4 and S5 storing them. Now, true for both
  leaders: "its copies reach only its own side of the split."

## Event loop (5)

- **"Callback"** was defined only at step 11; it is now defined at step 4, where a function is first handed over
  ("`setTimeout` hands timeout, a function for later (a callback), to the browser's timer…"); step 11 becomes
  "then 1 runs first and prints `then 1`."
- The start card's story list, the picture table and story 2's feedback no longer use "callback" before it is defined.
- **Starve and yield stories, step 6:** "The screen can't redraw, a repaint, while JavaScript runs." became "While
  JavaScript runs, the screen can't be redrawn: no repaint."

## Checked and right, no change

MapReduce's hash remainders and slip counts, 85 and 98 bytes, the 2.6× load, the combiner's 7 slips, the 13 reads, and
every cited Dean & Ghemawat section and Table 1; Raft's Figure 2, §5.4.1 and §5.4.2, the 150–300 ms timers, the crash
and split timelines; Event loop's timer nesting rule, rendering task, ECMAScript's Await, Archibald 2015's browser
split, Chrome's hidden-tab throttling, Node's `nextTick` order, `scheduler.yield()`, and every timing in the run.

## Checks

- `verify.mjs`, all 8 examples: 211 runs, 0 failing (the known warnings: MapReduce's scenario name, Raft at its
  maxima). Writing lint: MapReduce 1 hit (the scenario name), Raft 0, Event loop 0. Unit tests 369 / 369.
- The remade MapReduce page, built with this and the shuffle-chip fix, was read at 2× ([shuffle](mapreduce-shuffle-2x.png))
  and approved by the owner.
- **Not verified:** the "I know the basics" level was not read separately (New and Expert bracket it); Raft's and the
  HTML standard's sources were checked from the lesson's cited entries, not fetched again.

## Next

1. The scenario name "One word is very common": keep or rename (README and hero image included).
2. Done: the review packet now gives a revealed answer's why its own sentence ("… Why: …").
