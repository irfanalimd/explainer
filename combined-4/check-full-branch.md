# MapReduce: check report

**Ready for review.** Run the blind review (SKILL.md, Teacher pipeline) for scores, then check --full again.

`../../new/examples/mapreduce/figure.mjs` · full check · 2026-10-22 03:12 UTC · 63 min 02 s

| | | |
|---|---|---|
| ✓ **Correct** | 0 failing | 34 runs and 11 branch runs checked: invariants on every step, determinism, timing, captions; 0 errors, 0 warnings |
| ✓ **Teaches** | grade 5.9 | reading grade 5.9 (at most 10 for a core lesson); 5 chapters, 5 questions, 8 defined words, 2,147 words; no teaching advice |
| ! **Looks right** | 0 findings | 264 shots (dark and light, 1440×900 and 390×844), 104 teaching cards; audit over every step: 436 frames; 0 page errors, 2 pieces of advice |
| ✓ **Pacing** | 2 min 01 s | "Everything works" takes 2 min 01 s to watch at 1x (repeats sped up), 25 steps; longest chapter: Shuffle in "One word is very common", 62 s (advice above 150 s) |
| ✓ **One file** | 1.14 MB | 46% of the 2.5 MB budget: 86 modules, fonts and CSS inlined; works offline, from file:// |
| – **Reviewed** | not yet | no review/round-N/scores.json beside the figure; the teacher pipeline in SKILL.md writes it |

## Stories

| Story | Steps | To watch | Chapters (time to watch each) | Questions | Picks |
|---|---|---|---|---|---|
| Everything works | 25 | 2 min 01 s | Split 12 s · Map 18 s · Shuffle 43 s · Reduce 19 s · Output 29 s | 1 | 1 |
| One machine crashes | 27 | 2 min 06 s (1 min 54 s from where it splits off) | Split 12 s · Map 37 s · Shuffle 43 s · Reduce 19 s · Output 15 s | 1 | 0 |
| One machine is slow | 27 | 2 min 08 s (1 min 56 s from where it splits off) | Split 12 s · Map 38 s · Shuffle 43 s · Reduce 19 s · Output 16 s | 1 | 0 |
| One word is very common | 30 | 2 min 22 s | Split 10 s · Map 19 s · Shuffle 62 s · Reduce 25 s · Output 26 s | 2 | 0 |

## Contact sheet

![](shots/contact.png)
![](shots/contact-2.png)

## Lesson file

- · lesson.steps names 2 step id(s) no run here reaches: "map.empty", "reduce.sum-all" (a typo, a step the figure no longer makes, or one only untried knob values reach)

## Audit

- ! frame-time: average frame 136.7 ms > 16 ms budget _(happy/1440x900)_
- ! frame-time: average frame 154.0 ms > 16 ms budget _(happy/390x844)_

## Steps

- verify: 6 s
- stories: 0 s
- build: 3 s
- shoot: 44 min 48 s
- audit: 18 min 06 s

Re-run: `node scripts/check.mjs new/examples/mapreduce/figure.mjs --full`
