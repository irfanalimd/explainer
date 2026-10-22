# Lesson words: goals

Round 4 fixes what exists, with no new features. This branch takes the words: every line a reader sees must say what
the deterministic run does, at every knob value, and agree with the other lines.

## Targets

1. **The lesson ids verify never reaches.** On `main`, verify notes ids "no run here reaches" in four examples (B+ tree
   `split.signpost`, MapReduce `map.empty` and `reduce.sum-all`, Quicksort `repeat.copy`; Raft has five more). For
   each: a typo, a step the figure no longer makes, or one only untried knob values reach? Fix typos, remove dead
   entries, and keep the rest with the values that reach them. No lesson meaning may be lost.
2. **Raft's crash story at its maxima** (7 servers) reads as a contradiction: the client "hears that s3 is not the
   leader", then sends to s3, "the leader it knows". Find what the run does and make the words say it truthfully.
3. **Read every lesson as a beginner would**, for places where the words contradict the run or each other (not style).
   Fix clear errors; list the rest.

## Rules that shape the fixes

- Run it, don't draw it: when the words and the run disagree because the simulation is wrong, fix the simulation,
  not the words.
- A lesson never computes: a number that depends on the run comes from the figure as a var.
- The default stories' words change only where they were wrong.

## How it is checked

| Target | Check |
|---|---|
| Unreached ids | A knob sweep outside the repo: every value of each knob alone, 300-600 random combinations per story, seeds 1-40, plus the free-text knobs verify leaves at their defaults; then each reaching run's words read |
| Raft's crash | The run's state at the steps (who leads, what each server believes), the words before and after, both at the maxima and at the defaults; the Raft sim tests |
| Contradictions | Every prediction, pick and end check of all 8 lessons read against its run; the static text a knob can falsify (start-card hooks, chapter abouts, takeaways) found by searching for written-in counts and checked at other knob values |
| Nothing lost | `node scripts/lesson.mjs` before and after for all 8 examples, diffed; verify on all 8; unit tests |
