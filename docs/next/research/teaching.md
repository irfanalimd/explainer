# R2 · Learning science and teaching UX

Research report for `docs/next/PLAN.md` §2 (Track A: the Teacher). It changes no code.

**Sources.** Every DOI below was resolved against Crossref (title, first author and year match) on 2026-10-16.
- Effect sizes are quoted only where I read them in the abstract (OpenAlex or Crossref). Everything else is direction only.
- Anything marked **(unverified)** I could not confirm this session. Treat it as a lead, not a fact.
- The LibKey connector was not authenticated in this session, so no full texts were read through it. Claims rest on abstracts, the verified bibliographic data and the primary sources linked below.

**Scope.**
- Inputs: PLAN.md §1.2, §2, §7 and §9; `references/teaching.md`; `engine/hud/explain.mjs`; `examples/linked-list/figure.mjs`; and the lesson printed by `scripts/lesson.mjs` (3 stories: 17, 14 and 21 steps).
- Code facts quoted in the depth layer were checked against the real sources:
  - CPython `Objects/listobject.c`
  - CPython `Modules/_collectionsmodule.c`
  - Linux `include/linux/list.h` and `rculist.h`
  - the Python `collections` docs

---

## 1. Evidence

| Principle | Design rule for this panel | Limits: where it fails or reverses | Source |
|---|---|---|---|
| **Expertise reversal** | The level switch changes the *amount of guidance*, not the facts. New gets why, look, picture and fully worked moves. Expert gets less text and **more doing**: the insert as a problem to solve, not a demo to watch. | <ul><li>Expertise is relative to the task: a "core" reader can be new to linked lists.</li><li>A self-chosen level is a weak signal: novices choose their own guidance poorly.</li><li>Fix: default from `meta.level`, then *nudge* (never auto-switch) from performance on the first your-turn (rapid assessment).</li><li>Most studies are short lab tasks.</li></ul> | Kalyuga, Ayres, Chandler & Sweller 2003, doi:10.1207/S15326985EP3801_4 · Kalyuga 2007, doi:10.1007/s10648-007-9054-3 · Kalyuga, Chandler, Tuovinen & Sweller 2001, doi:10.1037/0022-0663.93.3.579 (worked examples help novices; "with more experience… problem solving proved superior") · Kalyuga & Sweller 2004 (rapid knowledge test), doi:10.1037/0022-0663.96.3.558 · Kalyuga & Sweller 2005, doi:10.1007/BF02504800 · Scheiter & Gerjets 2007 (learner control), doi:10.1007/s10648-007-9046-3 |
| **Pre-training** | <ul><li>One "parts" chapter names each part on its own lit entity, **one term per step**, before the process runs.</li><li>Close it with a name-the-part check in the world.</li><li>The linked list's chapter 2 is already this chapter. Its problem is not "5 terms": it is that `address` shows in the world in chapter 1 (the array's label) and is never named there, and nothing retrieves the names before chapter 3 uses them.</li></ul> | <ul><li>Helps learners with low prior knowledge.</li><li>Shown for fast, system-paced narrated animations. With learner pacing the gain is likely smaller (unverified for this format).</li><li>Naming parts without showing their *states* helps less: the 2002 pre-training "described or depicted the possible states of each part".</li></ul> | Mayer, Mathias & Wetzell 2002, doi:10.1037/1076-898X.8.3.147 · Mayer & Moreno 2003, doi:10.1207/S15326985EP3801_6 |
| **Segmenting** | <ul><li>One event per step (already true).</li><li>At New, the run holds after each *key* step until the reader continues (learner-paced), not only at chapter ends.</li><li>Never split one cause–effect pair across steps: "12 points at 42" and "48's address is gone" belong together, or the second must come next.</li></ul> | <ul><li>Costs time.</li><li>Too many "continue" stops become tedious and break flow, so key steps only.</li><li>The meta-analysis reports benefits, but I did not read its moderators (unverified).</li></ul> | Mayer & Chandler 2001, doi:10.1037/0022-0663.93.2.390 · Rey et al. 2019 (meta-analysis), doi:10.1007/s10648-018-9456-4 |
| **Signalling / cueing, and contiguity** | <ul><li>The `look` chip and the in-world highlight fire *together* with the words (temporal contiguity).</li><li>Put numbers the step talks about **in the world** as tags next to the thing (spatial contiguity), not only in the panel 400 px away.</li><li>One cue per step: a step that lights everything signals nothing.</li></ul> | <ul><li>The benefit concentrates in learners with low prior knowledge and shrinks or vanishes for experts (the 2016 meta-analysis moderator).</li><li>So the look chip auto-pulses at New, sits quiet at Basics, and is off at Expert. The world still lights.</li></ul> | Schneider, Beege, Nebel & Rey 2018, doi:10.1016/j.edurev.2017.11.001 · Richter, Scheiter & Eitel 2016, doi:10.1016/j.edurev.2015.12.003 · Ginns 2006 (spatial and temporal contiguity), doi:10.1016/j.learninstruc.2006.10.001 |
| **Worked examples and fading** | The first insert is fully worked. The next instance fades **one** write: the reader does `new.next = node.next` and the run does the other. The last instance has the reader do both. | <ul><li>**Reverses for experts** (Kalyuga 2001): at Expert, skip straight to "do both writes".</li><li>Fading needs ≥2 instances of the move. The linked list does one insert per story today, so M3 needs one more instance (see §5).</li><li>Forward vs backward fading order: evidence mixed (unverified).</li></ul> | Sweller & Cooper 1985, doi:10.1207/s1532690xci0201_3 · Renkl, Atkinson, Maier & Staley 2002, doi:10.1080/00220970209599510 · Renkl & Atkinson 2003, doi:10.1207/S15326985EP3801_3 · Atkinson, Renkl & Merrill 2003, doi:10.1037/0022-0663.95.4.774 |
| **Concreteness fading** | <ul><li>Concrete first (42, `0x7f3a_5a30`, 3 items moved).</li><li>Then iconic (arrows, counts).</li><li>Then abstract (`new.next = node.next`, O(k)), which lives in `deeper`, the recap and the code line.</li><li>The run already supplies the concrete layer for free. Keep O(·) out of `plain` and `why` at intro.</li></ul> | <ul><li>Evidence is mostly maths and science, with few direct three-stage comparisons. The main benefit is transfer.</li><li>Concrete-only instruction transfers poorly, so the abstract layer must appear by the end (recap or takeaway) at every level.</li></ul> | Fyfe, McNeil, Son & Goldstone 2014, doi:10.1007/s10648-014-9249-3 · Goldstone & Son 2005, doi:10.1207/s15327809jls1401_4 |
| **Retrieval practice** | <ul><li>A chapter-exit check where the next chapter depends on it.</li><li>An end check of ≤3 questions.</li><li>Prefer recall or production (do the write, type the number) over recognition (MC).</li><li>Always give feedback.</li></ul> | <ul><li>The effect **shrinks or disappears for high element-interactivity material** (van Gog & Sweller 2015), so test the mechanism (do it), not the captions.</li><li>The main payoff is *delayed* retention, which a single session barely sees.</li><li>MC without feedback can teach the lure (Butler & Roediger 2008).</li></ul> | Roediger & Karpicke 2006, doi:10.1111/j.1467-9280.2006.01693.x · Rowland 2014 (recall > recognition), doi:10.1037/a0037559 · Adesope, Trevisan & Sundararajan 2017, doi:10.3102/0034654316689306 · Dunlosky et al. 2013, doi:10.1177/1529100612453266 · van Gog & Sweller 2015, doi:10.1007/s10648-015-9310-x · Butler & Roediger 2008, doi:10.3758/MC.36.3.604 |
| **Prediction before the reveal** (keep what exists) | One prediction right before the surprising step. Its value is the *surprise*, so ask only where the naive answer is wrong. | <ul><li>Guessing with no basis teaches little.</li><li>Prediction effects vary with age (Brod 2021).</li><li>Wrong guesses are useful only if the reveal explains them.</li></ul> | Brod, Hasselhorn & Bunge 2018, doi:10.1016/j.learninstruc.2018.01.013 · Crouch, Fagen, Callan & Mazur 2004, doi:10.1119/1.1707018 · Richland, Kornell & Kao 2009 (pretesting), doi:10.1037/a0016496 · Brod 2021, doi:10.1007/s10648-020-09571-9 |
| **Misconception-based / refutation** | <ul><li>Each misconception gets: (1) a step or question where the reader can commit to it; (2) feedback that **states it, says it is wrong, and explains why** from the run; (3) the correct state shown last.</li><li>Feedback is per option, not one shared `why`.</li></ul> | <ul><li>Works when the reader actually holds the belief.</li><li>Stating a misconception without the explanation is weaker.</li><li>In a multimedia physics study, refutation gave d = 0.79 (dialogue 0.83) over plain exposition. Low prior knowledge gained most; high prior knowledge was **not** disadvantaged. This is one of few effects that does not reverse for experts.</li></ul> | Muller, Bewes, Sharma & Reimann 2008, doi:10.1111/j.1365-2729.2007.00248.x · Tippett 2010, doi:10.1007/s10763-010-9203-x · Schroeder & Kucera 2022 (meta-analysis), doi:10.1007/s10648-021-09656-z · Prinz, Golke & Wittwer 2019, doi:10.1037/edu0000329 |
| **Self-explanation prompts** | At the aha step only (New and Basics): an **assisting** prompt with a menu of reasons ("Why must 42's arrow change first? Pick the reason"), not an open text box. Give feedback on the pick. | <ul><li>Open prompts yield shallow answers unless scaffolded (Berthold 2009).</li><li>Without feedback a wrong self-explanation sticks.</li><li>It costs time, so one per lesson.</li></ul> | Chi, de Leeuw, Chiu & LaVancher 1994, doi:10.1207/s15516709cog1803_3 · Bisra et al. 2018 (meta-analysis), doi:10.1007/s10648-018-9434-x · Berthold, Eysink & Renkl 2009, doi:10.1007/s11251-008-9051-z |
| **Redundancy and coherence** | <ul><li>Never show the same words twice on screen: panel vs caption, why vs plain, a persistent analogy table under steps that don't use it.</li><li>`deeper` is collapsed below Expert.</li><li>Depth content must be about *this step's mechanism*. Trivia is a seductive detail.</li></ul> | <ul><li>Redundancy is learner-relative: for novices, extra on-screen key terms can *help* (Adesope & Nesbit 2012: spoken and written beat spoken-only for low prior knowledge, and key terms beat verbatim text).</li><li>There is no narration audio today, so the classic text-plus-speech case does not arise. The §4.1 audio track should read `plain` and `why` while the screen shows them, not a different text.</li></ul> | Chandler & Sweller 1991, doi:10.1207/s1532690xci0804_2 · Kalyuga, Chandler & Sweller 1999, doi:10.1002/(SICI)1099-0720(199908)13:4<351::AID-ACP589>3.0.CO;2-6 · Mayer, Heiser & Lonn 2001, doi:10.1037/0022-0663.93.1.187 · Adesope & Nesbit 2012, doi:10.1037/a0026147 · Rey 2012 (seductive details), doi:10.1016/j.edurev.2012.05.003 |
| **Elaborated feedback** (for §2.3) | Every answer (right or wrong) gets an explanation, not just ✓/✗. | Elaborated feedback g = 0.49, versus 0.05 for right/wrong only and 0.32 for showing the correct answer. It helps higher-order outcomes most. Delayed feedback was negative in that set. | Van der Kleij, Feskens & Eggen 2015, doi:10.3102/0034654314564881 · Shute 2008, doi:10.3102/0034654307313795 · Hattie & Timperley 2007, doi:10.3102/003465430298487 |
| **Productive failure** (letting the wrong branch play) | Let a wrong in-world choice run for real, then explain. | Pooled g = 0.36 for problem-first over instruction-first. **Reversed for grades 2–5 and for domain-general skills.** Our readers are older and the skill is domain-specific, so it fits, but the failure must be followed by instruction. | Kapur 2008, doi:10.1080/07370000802212669 · Sinha & Kapur 2021, doi:10.3102/00346543211019105 |
| **Animation and engagement** | Engagement beats graphics: "what learners *do* with a visualization matters more than what it shows". Fidelity (WebGPU) will not buy learning by itself. Interaction (respond, change, construct) will. | <ul><li>Animation beats static pictures on average (medium effect, Höffler & Leutner).</li><li>Many animation studies confound animation with interactivity (Tversky et al.).</li></ul> | Hundhausen, Douglas & Stasko 2002, doi:10.1006/jvlc.2002.0237 · Naps et al. 2002 (engagement taxonomy: viewing < responding < changing < constructing), doi:10.1145/960568.782998 · Höffler & Leutner 2007, doi:10.1016/j.learninstruc.2007.09.013 · Tversky, Morrison & Bétrancourt 2002, doi:10.1006/ijhc.2002.1017 |
| **Analogy** | Map it explicitly, keep the picture and the real thing visible *together* when the mapping is introduced, say where it stops matching, then fade it. | A persistent map no one looks at is clutter. Analogies mislead where unstated differences matter. | Richland, Zur & Holyoak 2007, doi:10.1126/science.1142103 · Richland & Simms 2015, doi:10.1002/wcs.1336 |
| **Programming misconceptions** (domain) | <ul><li>Novices hold non-viable models of reference assignment: "`a = b` links them", or "copying `node.next` copies the old value".</li><li>The wrong-order question targets exactly this. Name it in feedback.</li></ul> | Studied mostly in Java and Python intro courses. | Ma, Ferguson, Roper & Wood 2011, doi:10.1080/08993408.2011.554722 · Kaczmarczyk et al. 2010, doi:10.1145/1734263.1734299 · Sorva 2013 (notional machines), doi:10.1145/2483710.2483713 |

---

## 2. Patterns from best-in-class explainers

Only patterns that fit "a real run in a 3D world on the left, an explain panel on the right".

| Source | Pattern (observed) | What to do here |
|---|---|---|
| **Bartosz Ciechanowski** ([mechanical-watch](https://ciechanow.ski/mechanical-watch/), [internal-combustion-engine](https://ciechanow.ski/internal-combustion-engine/)) | <ul><li>One small demo per idea, each with one control.</li><li>Sliders are **colour-coded to the part they move**: the page has ~73 sliders with classes `slider_red`, `slider_blue`, `slider_green`.</li><li>Prose says "drag the slider" right where the demo is.</li><li>A global "pause all animations" control for readers who find motion distracting.</li></ul> | <ul><li>Colour the `look` chip and the term underline in the **identity colour of the entity** they point at, so words and world share one colour key.</li><li>Add a "hold still while I read" toggle (New: on). The world pauses its idle motion while the panel text is new. This also covers reduced motion.</li></ul> |
| **3Blue1Brown** (videos; [3blue1brown.com](https://www.3blue1brown.com/)) | <ul><li>Each symbol keeps the colour of the visual it stands for.</li><li>"Pause and ponder" invitations before a reveal.</li><li>Shows the naive attempt first and lets it fail.</li><li>The question comes before the machinery.</li></ul> (From viewing; not re-checked this session: unverified.) | <ul><li>In `deeper`, colour code tokens to entities (`new`, `node.next`).</li><li>"Pause and ponder" maps to a soft hold before predictions at Basics and Expert, without the multiple-choice card.</li></ul> |
| **Brilliant** ([brilliant.org](https://brilliant.org/)) | <ul><li>Almost every screen asks the learner to do something.</li><li>Each answer choice has its own explanation.</li><li>Hints before the answer.</li><li>Short text between interactions.</li></ul> (Product knowledge; unverified this session.) | <ul><li>Per-option feedback (adopt).</li><li>Brilliant's density is wrong for a *watch-first* simulation: cap the interactions (§5).</li></ul> |
| **Distill** (Hohman et al. 2020, doi:10.23915/distill.00028; Olah & Carter 2017, "Research Debt", doi:10.23915/distill.00005) | <ul><li>Five affordances of interactive articles: connecting people and data, playful systems, prompting self-reflection, **personalisation**, reducing cognitive load.</li><li>Distill cites segmenting to justify play, pause and scrub.</li><li>Margin notes and hover footnotes keep depth *beside* the text, not in its way.</li></ul> | <ul><li>`deeper` opens **inline under the step** (a disclosure), never as a modal.</li><li>Personalisation is the level switch.</li><li>Self-reflection is the one self-explanation prompt.</li></ul> |
| **VisuAlgo** (Halim, Koh, Loh & Halim 2012, *Olympiads in Informatics* 6:53–68, [PDF](https://ioinformatics.org/journal/INFOL099.pdf); [visualgo.net/en/list](https://visualgo.net/en/list)) | <ul><li>**e-Lecture mode by default for first-time visitors**, exploration mode for returning ones.</li><li>Slides interleave text with live actions ("Try InsertHead(50)").</li><li>The linked-list e-Lecture explicitly enumerates the insert cases: head, empty list, … tail with or without a tail pointer.</li><li>Randomly generated, auto-graded quizzes.</li></ul> | <ul><li>Default-by-level plus a remembered choice matches §9 decision 2.</li><li>"Try it" links in the panel run the operation in the world.</li><li>An **Expert "edge cases" card** (empty list, insert at head, insert at tail).</li><li>**The end check runs the figure at a different knob setting.** Because the run is deterministic, a "new list" question is free and its answer is computed, not written.</li></ul> |
| **Seeing Theory** ([seeing-theory.brown.edu](https://seeing-theory.brown.edu/)) | Text column beside the demo. The *theoretical* bars (draggable, blue) sit next to the *observed* results. | Predict-the-number: show **your prediction next to the run's count** in the dock once revealed (e.g. "you said 5 · the run took 4"). |
| **Khan Academy** ([khanacademy.org](https://www.khanacademy.org/)) | <ul><li>Mastery levels per skill.</li><li>Hints that step through the solution one line at a time.</li><li>A "watch the explanation" escape.</li></ul> (Product knowledge; unverified this session.) | <ul><li>After 2 wrong tries, "Show me" plays the worked path. Never let a reader flounder.</li><li>No mastery levels: too heavy for one figure.</li></ul> |
| **Nicky Case** ([How I make explorable explanations](https://blog.ncase.me/how-i-make-an-explorable-explanation/), 2017; [The Evolution of Trust](https://ncase.me/trust/)) | <ul><li>Start with a question.</li><li>Start "on the ground" with a concrete experience, then climb the ladder of abstraction.</li><li>Chain beats with **"therefore / but"**, not "and then".</li><li>End with a **sandbox** so the reader asks their own questions.</li></ul> | <ul><li>The chapter-entry card's "So far / Now" line should carry the **but**. The array moves 3 **but** the list moves none **but** reaching the spot costs arrows **but** the wrong order loses data.</li><li>At the end, offer "Play with it": knobs open, every operation available.</li></ul> |
| **Red Blob Games** ([A\* intro](https://www.redblobgames.com/pathfinding/a-star/introduction.html), [making-of](https://www.redblobgames.com/making-of/line-drawing/)) | <ul><li>Draggable handles and **scrubbable numbers in the prose** that recompute the diagram.</li><li>Diagrams built in layers.</li></ul> | <ul><li>At Basics and Expert, make knob values in panel text scrubbable inline ("insert after the **2nd** item"): dragging re-runs the deterministic build.</li><li>Off at New (it changes the story under the reader).</li></ul> |
| **Bret Victor** ([Up and Down the Ladder of Abstraction](https://worrydream.com/LadderOfAbstraction/), [Explorable Explanations](https://worrydream.com/ExplorableExplanations/)) | Step down to one concrete case, step up to "all cases at once". | In `deeper.cost` at Expert, a tiny **small-multiples line from real runs**: "items moved at k = 1…4: 4, 3, 2, 1". Verify already runs the knob extremes, so these numbers are computed, not stated. |
| **Python Tutor** (Guo 2013, doi:10.1145/2445196.2445368) | Real execution, boxes and arrows for the heap, the current code line lit, step back. | The closest precedent for this engine. Keep the code line in sync with each step (it exists: `s.line`), and make "Earlier" steps a way back (exists). |

**The one strong cross-cutting finding.** Hundhausen et al. and the Naps taxonomy: the leap in learning comes from moving readers from *viewing* to *responding/changing*, not from fidelity. M3 (active learning) matters more for learning than M4/M5 do. Ship M3 early in the Teacher track.

---

## 3. Schema verdict and changes

**Verdict:** keep `plain`, `look` and `deeper`; keep `why` but change when it is required; demote the persistent analogy map. Specific changes:

1. **`why` is per-chunk by default and per-step by exception.**
   - The chunk's purpose lives on the **chapter-entry card**: "Now: … / You'll know it worked when: …".
   - A step carries its own `why` only when its purpose differs from the chunk's or defies intuition: the first time a move happens, the aha step, misconception steps, failure steps.
   - Repeated steps (slide 2, slide 3; hop 2, hop 3…) carry none.
   - Today's captions already pack "what + why" into ≤18 words (teaching.md §3). Splitting them lets Expert see only `plain`.
   - Lint: a `why` that restates its `plain` (≥50 % shared content words) is a warning.
2. **`look`** stays a first-class list of entity ids, templated (`"{prevId}.next"`).
   - Its highlight fires in the same frame as the text (contiguity).
   - Numbers the step names also get an in-world tag (spatial contiguity).
3. **`deeper` becomes structured, not one paragraph:** `{ cost, how, code, edge, real, source }`, all optional.
   - Basics shows the **first present field** as a one-line peek.
   - Expert shows all of them.
   - This gives the "peek" a defined meaning, and lets the expert reviewer check each kind of claim.
4. **`picture` stays a step field, but the bottom analogy map goes.**
   - A persistent table under every step is redundancy and split attention: the reader's eyes are in the world, and the table is the furthest point from it. It is also coherence clutter once the mapping is learned (§1).
   - Replace it with:
     - (a) the full map **once**, on the entry card of the parts chapter, with its "where it stops matching" line;
     - (b) an **inline one-liner** under `plain` at New, only on steps whose `picture` is set ("Picture: the clue's hiding place → `next`");
     - (c) the map in the Words drawer (glossary) for anyone who wants it back.
5. **New fields:**
   - `key: true`: requires `why`, holds at New, and is eligible for checks.
   - `when`: a predicate over the run's vars, for lines that are only true at some knob settings (e.g. "start at the end" only when more than one item moves).
   - `first`: an override for the first of a repeated step.
   - `@story` keys for per-story overrides.
   - Chapter `enter` and `exit`.
   - `asks` with **per-option feedback** and a misconception id.
   - `checks` with a run spec (knob values) so answers come from the run.
6. **Templating contract.** The figure passes run values: `s.step(fallback, { id, vars })`. The lesson never computes. Formatting is fixed by var kind: a value renders as a key chip, an address as code, a list via `fmt.and` or comma. Plurals use `{count:moved|item}`.
7. **Spoiler rule carries over.** While a question is open, the revealing step's `why`, `deeper` and `picture` are veiled with its `plain` (today's `veil()`).

---

## 4. Level behaviour

Default level from `meta.level` (intro → New, core/deep → Basics), remembered per viewer (§9 decision 2).

**Nudge, never switch.**
- Two right first tries at New offer "Switch to I know the basics?".
- A wrong pick at Expert offers "Show the step-by-step version?".

The nudge is one dismissible line. Rationale: rapid assessment beats self-report (Kalyuga & Sweller 2004/2005), and learner control is unreliable for novices (Scheiter & Gerjets 2007).

| Part | New to this | I know the basics | Expert |
|---|---|---|---|
| Progress map and goal line | shown | shown | dots only (goal in the tooltip) |
| Chapter entry card | So far / Now / You'll know it worked when; the run holds 1.5 s | "Now:" line only | off (chapter title and about only) |
| `about` | full | full | first sentence, with "More" |
| `plain` | shown | shown | shown |
| `why` | every step that has one | `key` steps only; a quiet "why?" toggle elsewhere | hidden; "why?" toggle |
| `look` | chip auto-pulses with the world highlight | chip on hover or tap | no chip (the world still lights) |
| `picture` | inline one-liner on flagged steps; full map on the parts card | full map on the parts card only | Words drawer only |
| `deeper` | collapsed: "Go deeper" | peek: first field, one line, then "More" | open: all fields; code line lit |
| Terms | plain word first, then the name ("an arrow, called a pointer"); definition block under the step | name first, definition on hover | name only; tooltip |
| Pace | 1.2× reading time; hold after each `key` step | 1× | 1×; repeats fold sooner |
| Prediction (`ask`) | multiple-choice card | multiple-choice card | "pause and ponder": prediction hidden behind "Predict"; skippable |
| Your turn: choose-in-world | yes | yes | yes, harder: do both writes, no options |
| Faded examples | full → one write → both writes | one write → both | both writes at once (problem first) |
| Chapter exit checks | ≤2 per story, on chapters with a key idea | ≤1 | none |
| Self-explanation (menu) | 1, at the aha step | 1 | none |
| End check | 3 questions | 2 | 1 transfer or edge-case question |
| Expert extras | — | — | edge-cases card; small multiples from real runs; source links |
| Earlier list | shown | shown | shown |

**Calm budget for the step area:** at most 6 lines of panel text at New and 4 at Basics, excluding an opened `deeper`. Panel width at 1440 is ~44 characters. `fit()` already drops content in order. Add "picture line, then why" to its drop order for the non-question case.

---

## 5. "Your turn" patterns

Ranked by evidence × fit:

| Pattern | Evidence | Fit | Verdict |
|---|---|---|---|
| **Per-misconception feedback** on every option | strong: refutation meta-analyses; elaborated feedback 0.49 vs 0.05 | trivial: data only | **M1** (it's words). Every `ask` today gets per-option feedback. |
| **Choose-in-world with the real branch playing** | productive failure g = 0.36 for older learners; engagement taxonomy; surprise | excellent: the "wrong" story already *is* the branch. It forks from the insert story at step 12. | **M3 headline.** Replaces the order `ask` at New and Basics. |
| **Predict-the-number** | prediction and surprise; testing effect (recall > recognition) | good for cost: "how many arrows to the 5th?" | Keep. On phones use a stepper (− 4 +) rather than a keyboard. Reveal next to the run's counter. |
| **Faded worked example** | strong for novices; reverses for experts | needs a second instance of the move: one insert per story today | M3. Use the "Right order" chapter of the wrong story as the faded instance. The reader does write 1, the run does write 2. The end check does both. |
| **End mastery check** | testing effect; smaller for complex material | good if it is a *new run* (different knobs), not a recall of captions | M3, ≤3 questions, each with "replay that chapter". |
| **Self-explanation menu** | moderate (Bisra 2018); assisting > open | good at one aha | M1 (words) / M3 (UI). |

**How many before it gets tedious.** No study gives a number for this format. The following is a design heuristic built from segmenting and engagement, and it should be tuned with §4.5 user testing:
- at most 1 interaction per chapter, and never two within 4 steps of each other;
- per story, inline interactions ≤3 at New, ≤2 at Basics, ≤1 at Expert;
- the end check is separate, and optional at Expert;
- every interaction has "Just show me".

**Feedback when a wrong in-world choice plays out for real** (protocol):
1. **Commit.** The picked entity rings; a 0.4 s beat, then the branch plays at 1×. No skipping inside the consequence: the reader must see it.
2. **Narrate neutrally while it plays.** Use the branch's own `plain` lines ("12's next now points at 42"). Never say "Wrong!". The counters (lost, rewired) move for real.
3. **Hold on the consequence frame** (the lost zone lit). The feedback card:
   - names the belief: "If you thought either order works…";
   - says what the run shows: "12's next held the only copy of 48's address, so 48, 17 and 23 can't be reached.";
   - asks one assisting question: "What would have saved it?" with 2 options.
4. **Primary action:** "Rewind and try the other arrow". The reader redoes it. The reverse plays as a fast rewind of the same timeline, so it is honest.
5. **Never end on the broken state.** The last thing seen is the correct list (Butler & Roediger 2008: unexplained lures get learned).
6. **A right first pick** gets a one-line why, plus "See what the other order does" (an optional curiosity branch, not counted as an error).
7. **After 2 wrong picks** (possible with 3+ options), "Show me" plays the worked path with full `why`s.
8. **No score until the end check.** Even there, show "You can now…" outcomes, not a percentage.

**Accessibility.**
- Every in-world choice has a keyboard and list equivalent ("or pick from a list").
- Targets are ≥44 px on touch. WCAG 2.2 AA requires 24 px; 44 px is the AAA bar and Apple's guidance.

---

## 6. Lint thresholds

| PLAN rule | Verdict | Better-grounded rule |
|---|---|---|
| ≤2 new terms per chapter at intro, 3 at core | **The chapter is the wrong unit.** It would flag the parts chapter, which is pre-training done right. Working-memory capacity is ~4 chunks (Cowan 2001, doi:10.1017/S0140525X01003922), and what matters is how many *new, interacting* items are live at once. | <ul><li>(a) **≤1 new term per step**, all levels.</li><li>(b) Per chapter: ≤2 intro, ≤3 core, ≤4 deep.</li><li>(c) Except one chapter marked `parts: true`, which may hold ≤4 (intro) / 5 (core) / 6 (deep), if every term is anchored to an entity lit on that step.</li><li>(d) **Use it or lose it:** each defined term reappears in ≥2 later steps, the first within 3 steps; otherwise don't introduce it (coherence).</li><li>(e) A term shown as a label in the world counts as introduced at the step it appears. This catches `address` in the linked list's chapter 1.</li></ul> |
| `plain`/`why` at grade ≤6 | **Not defensible per line.** Flesch-Kincaid is meant for passages. On 10-word lines it is noise (Redish 2000, doi:10.1145/344599.344637), and hex addresses and code inflate it. `teach.mjs` already pools text, needs ≥30 words, and drops inline code. That is right; keep it. | <ul><li>(a) **Hard per-line limits:** `plain` ≤14 words (at most 2 sentences), `why` ≤18 words (1 sentence), no sentence over 18.</li><li>(b) **Pooled grade** per layer per lesson, ≥100 words, code and numbers stripped: `plain`+`why` ≤7 at intro, ≤9 at core, ≤11 at deep. A warning, not an error. The current linked list pools to grade 4, so 6 is achievable but needlessly tight as a gate.</li><li>(c) **Unknown-word density** for New-level text: ≥95 % of content words come from a common-word list (e.g. the top 3,000) plus the §1 prerequisites plus terms already defined. The anchor is L2 reading research (95 % minimal, 98 % comfortable: Hu & Nation 2000 *(no DOI; journal: Reading in a Foreign Language 13(1))*; Laufer & Ravenhorst-Kalovski 2010, doi:10.64152/10125/66648). Caveats: the 98 % figure did not fully replicate (Kremmel et al. 2023, doi:10.1111/lang.12622), and these are L2 adults, so treat 95 % as a warning threshold.</li></ul> |
| Layers present | Good. | `plain` everywhere; `why` on every `key` step and the first of each repeat; `deeper` on every `key` step; a lesson with no `deeper.cost` anywhere is a warning (expert bar §7). |
| No forward references | Good. | Extend it to world labels (rule (e) above) and to `deeper` at Basics (the peek may not use a term defined only in a later chapter). |
| Misconception coverage | Good. | Also: every misconception id appears in **some option's feedback**, and the option is plausible (it is the one the misconception predicts). |
| New | — | <ul><li>`why` restating `plain` (≥50 % shared content words) is a warning.</li><li>Interaction spacing (§5) is a warning.</li><li>Every `check` resolves its answer from a run, not a literal.</li><li>The `deeper.source` URL is present when `deeper.real` makes a claim about a real system.</li></ul> |

---

## 7. Panel mocks

Same step for every level: insert story, step 13, `insert.save-next`, at default knobs (n = 5, k = 2).

### 7.1 Desktop, New to this (1440 × 900, panel ≈ 44 ch)

```
┌ Insert ───────────────────────── 4 of 5 ┐
│ ●─●─●─◉─○  Goal: insert without moving  │
│            anything                     │
├─────────────────────────────────────────┤
│ 2  42's next copies 12's. Now 42 points │  ← plain
│    at 48 too.                           │
│    48's address is now saved in two     │  ← why (key step)
│    places, so changing 12 is safe.      │
│    ◎ 42's arrow to 48                   │  ← look: pulses with the world
│    Picture: copy the hiding place onto  │  ← picture (flagged step, New only)
│    the new clue before you change the   │
│    old one.                             │
│    ▸ Go deeper                          │  ← collapsed
│                       [ Continue ▸ ]    │  ← hold after a key step (New)
├─────────────────────────────────────────┤
│ EARLIER                                 │
│ 1  A new node for 42, wherever memory   │
│    had room.                            │
└─────────────────────────────────────────┘
```

### 7.2 Desktop, I know the basics

```
┌ Insert ───────────────────────── 4 of 5 ┐
│ ●─●─●─◉─○  Goal: insert without moving  │
│            anything                     │
├─────────────────────────────────────────┤
│ 2  42's next copies 12's. Now 42 points │
│    at 48 too.                           │
│    48's address is now saved in two     │  ← why shown: key step
│    places, so changing 12 is safe.      │
│    ◎ Look                               │  ← chip; hover lights it
│    O(1): two pointer writes, whatever   │  ← deeper peek = deeper.cost
│    the length.                  More ▸  │
├─────────────────────────────────────────┤
│ EARLIER  1  A new node for 42…          │
└─────────────────────────────────────────┘
```

### 7.3 Desktop, Expert

```
┌ Insert ───────────────────────── 4 of 5 ┐
│ ●─●─●─◉─○                               │
├─────────────────────────────────────────┤
│ 2  42's next copies 12's. Now 42 points │
│    at 48 too.                    why? ▸ │
│ ┌ Deeper ─────────────────────────────┐ │
│ │ Cost  O(1) once you stand on 12: two│ │
│ │       writes. Getting to 12 was O(k)│ │
│ │ How   new.next = node.next runs     │ │
│ │       first: until then 12's next is│ │
│ │       the only copy of 48's address.│ │
│ │ Real  Linux list_add fills new->next│ │
│ │       and new->prev, then writes    │ │
│ │       prev->next last. ↗ list.h     │ │
│ │ Code  line 14 ▸ new.next = node.next│ │
│ └─────────────────────────────────────┘ │
├─────────────────────────────────────────┤
│ EARLIER  1  A new node for 42…          │
└─────────────────────────────────────────┘
```

### 7.4 Desktop, chapter-entry card (New; Basics shows only the "Now" line)

```
┌ Insert ───────────────────────── 4 of 5 ┐
│ ●─●─●─◉─○  Goal: insert without moving  │
│            anything                     │
├─────────────────────────────────────────┤
│ SO FAR  Our marker stands on 12, the 2nd│
│         item. But the array had to move │
│         3 numbers.                      │
│ NOW     Link 42 in after 12 by changing │
│         two arrows.                     │
│ WATCH   Reading from head should pass   │
│         12 → 42 → 48.                   │
├─────────────────────────────────────────┤
│ 1  A new node for 42, wherever memory   │  ← the chapter's first step,
│    had room. Its next is null for now.  │    under the card
└─────────────────────────────────────────┘
```

The card stays for the chapter's first step, then folds into the goal line. The parts chapter's card adds the picture map:

```
│ THE PICTURE   a treasure hunt           │
│  clue card ............ node            │
│  where the next clue is  next (pointer) │
│  the clue you're handed  head           │
│  "this is the last one"  null           │
│ Stops matching: a hiding place here is  │
│ a number. If you know it, you jump      │
│ straight there. The trouble is knowing. │
```

### 7.5 Desktop, chapter-exit check (at the "Boxes and arrows complete" pause; New only)

```
┌ Boxes and arrows ─────────────── 2 of 5 ┐
│ ✓ Boxes and arrows complete             │
├─────────────────────────────────────────┤
│ YOUR TURN                               │
│ Click the box that says where 12 lives. │
│ (or pick from a list ▾)                 │
│                                         │
│                          Just show me ▸ │
└─────────────────────────────────────────┘
   reader clicks 12's own value tile →
│ That's 12 itself. The list only learns  │
│ 12's address from the box before it:    │
│ 31's next, 0x7f3a_4e80.   ◎ 31's next   │
│                  [ Try again ] [ Next ▸ ]│
```

### 7.6 Desktop, your turn in the world, wrong pick played out (M3)

```
┌ Insert ───────────────────────── 4 of 5 ┐
│ YOUR TURN                               │
│ Two arrows must change. Click the one   │
│ you'd change first.                     │
│ (in the world: 42's next · 12's next)   │
│ [ Either order works ]                  │
└─────────────────────────────────────────┘
   reader clicks 12's next → the wrong branch plays for real
   (12 → 42; 42 → itself; lost: 3) → hold:
┌ Insert ───────────────────────── 4 of 5 ┐
│ Here's what happened                    │
│ 12's next held the only copy of 48's    │
│ address. Once it pointed at 42, nothing │
│ led to 48, 17 or 23.    ◎ lost nodes    │
│                                         │
│ What would have saved it?               │
│  ○ Copy 12's next into 42 first         │
│  ○ Point 12 at 42 more carefully        │
│                                         │
│ [ Rewind and try the other arrow ]      │
│                         Show me ▸       │
└─────────────────────────────────────────┘
```

### 7.7 Phone, 390 × 844, New

No side panel. The caption bar carries the step; the sheet carries the rest.

```
┌──────────────────────────────────────┐
│               (world)                │
│      head → 31 → 12    42            │
│                 ↘      ↓  (lit)      │
│                   48 → 17 → 23       │
├──────────────────────────────────────┤
│ 4/5 Insert · step 2        ⓘ Explain │
│ 42's next copies 12's. Now 42 points │
│ at 48 too.                           │
│ 48's address is saved in two places, │
│ so changing 12 is safe.              │
│ ◎ 42's arrow           [Continue ▸]  │
├──────────────────────────────────────┤
│ ◀  ▮▮  ▶   ━━━━━●━━━━   1.2×          │  (dock)
└──────────────────────────────────────┘
```

The phone **drops the picture line at New** (it lives in the sheet). `plain`+`why` cap at 5 lines; overflow moves `why` to the sheet.

### 7.8 Phone, Basics and Expert

```
│ 4/5 Insert · step 2        ⓘ Explain │
│ 42's next copies 12's. Now 42 points │
│ at 48 too.                  why? ▸   │   Expert: no why, "Deeper ▸" chip
│ O(1): two writes.        Deeper ▸    │   Basics: one-line peek
```

### 7.9 Phone, the Explain sheet (opened)

```
┌──────────────────────────────────────┐
│ Insert                    4 of 5   ✕ │
│ ●─●─●─◉─○ Goal: insert without moving│
│ To add 42 after 12, make a new node  │
│ anywhere there is room, then change  │
│ two arrows.                          │
│ ▸ Go deeper (this step)              │
│ ▸ The picture                        │
│ EARLIER  1 A new node for 42…        │
└──────────────────────────────────────┘
```

### 7.10 Phone, entry card and exit check

```
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│ 4/5 Insert                           │   │ ✓ Boxes and arrows complete          │
│ NOW   Link 42 in after 12 by         │   │ Tap the box that says where 12 lives.│
│       changing two arrows.           │   │ (or pick from a list ▾)              │
│ WATCH 12 → 42 → 48 when we read.     │   │                       Just show me ▸ │
│                         [Start ▸]    │   └──────────────────────────────────────┘
└──────────────────────────────────────┘
```

At New on a phone, the "So far" line moves to the sheet.

---

## 8. Linked-list reference lesson draft

A draft `lesson.mjs` object. It is **not** written to `examples/linked-list/` (the brief said not to).

Facts are checked against `figure.mjs` at default knobs:
- values 31, 12, 48, 17, 23; new node 42 at `0x7f3a_5a30`
- array at `0x7f3a_1000`, 4-byte ints
- insert after item 2: 3 items move, 1 arrow followed, 2 arrows changed
- find the 5th item: 4 arrows, `0x7f3a_1010`, value 23
- wrong order: 48, 17 and 23 lost; 42 loops on itself

Every template is written to stay true at n ∈ 5…7 and k ∈ 1…4 (the knob ranges). `when` guards the one line that is not.

**Vars the figure must pass** (M1 work in `figure.mjs`, not done here):
- `n`, `k`, `kth`, `new`, `newAddr`, `prev`, `prevId`, `after`, `afterId`
- `moved` (n − k), `hops` (k − 1), `first`, `second`, `secondAddr`, `others` (n − 1)
- `lastId`, `arr`, `v` (slide value)
- `a`, `aId`, `b`, `bId`, `baddr`, `ith` (hop)
- `chain`, `lost`, `lostN`
- `find`, `findth`, `findAt`, `findV`, `findPrev`, `findHops`

Step ids are listed per story at the end.

```js
// examples/linked-list/lesson.mjs (DRAFT, R2 reference; not wired)
export const lesson = {
  goal: "Insert into the middle of a list without moving anything.",
  objectives: [
    { id: "o-shift", text: "Explain why inserting into an array moves items and inserting into a linked list does not." },
    { id: "o-order", text: "Do the two pointer writes of an insert in the right order, and say why the order matters." },
    { id: "o-cost",  text: "Say what a linked list pays instead: walking from head to reach a position." },
  ],
  prerequisites: ["variables and assignment", "arrays / Python lists and a[i]", "loops"],

  misconceptions: [
    { id: "m-order", wrong: "Either order of the two writes works.",
      fix: "The first write must save the only copy of the next node's address.", confrontedBy: ["insert.order", "wrong.prev-first", "wrong.lost"] },
    { id: "m-jump",  wrong: "A linked list is an array with arrows drawn on it, so I can jump to item 5.",
      fix: "A node's address is written only in the node before it, so you must walk.", confrontedBy: ["walk.hops", "walk.found"] },
    { id: "m-copy",  wrong: "Copying node.next copies the address it held earlier.",
      fix: "Assignment copies what the variable holds right now.", confrontedBy: ["wrong.self", "wrong.self-loop"] },
    { id: "m-fast",  wrong: "Linked lists are faster than arrays.",
      fix: "Only the splice is O(1); finding the spot is O(k), and each hop can miss the cache.", confrontedBy: ["tradeoff.insert", "tradeoff.find"] },
  ],

  picture: {
    name: "a treasure hunt",
    rows: [
      { id: "node", picture: "a clue card",                      real: "a node",          term: "node" },
      { id: "value", picture: "the prize written on the card",   real: "its value" },
      { id: "next", picture: "where the next clue is hidden",    real: "next, an address", term: "pointer" },
      { id: "head", picture: "the first clue, handed to you",    real: "head",            term: "head" },
      { id: "null", picture: "\"this is the last clue\"",        real: "null",            term: "null" },
    ],
    breaks: "A hiding place here is a number. If you know it, you can jump straight there. The trouble is knowing it.",
  },

  // plain word first at New ("lead"), the real name first elsewhere; defs stay under 20 words (teaching.md §3)
  terms: {
    address: { lead: "a house number for memory", def: "The number that says where something is stored in memory, like a house number." },
    node:    { lead: "a box",                     def: "One item of a linked list: a value, plus the address of the next box." },
    pointer: { lead: "an arrow",                  def: "A value that holds a memory address, so it says where something else lives." },
    head:    { lead: "the first arrow",           def: "A variable holding the address of the first box. Every trip starts there." },
    null:    { lead: "no address",                def: "A special value meaning “no address”. In next, it means nothing comes after." },
  },

  chapters: {
    array: {
      title: "Arrays shift",
      about: "An array keeps its items side by side in one block. Its label is the block's {term:address}: where it starts in memory, like a house number. To open a gap, every later item slides over.",
      enter: { sofar: "You know arrays: a row of values, like a[2].", now: "Put {new} into the middle, right after {prev}.", watch: "Count how many numbers have to move." },
    },
    "array@find": {
      title: "Arrays jump",
      about: "An array keeps its items side by side, 4 bytes each, from one {term:address}: where the block starts, like a house number. So item k sits at start + (k − 1) × 4.",
      enter: { sofar: "You know arrays: a row of values, like a[4].", now: "Find the {findth} item.", watch: "Count the steps it takes." },
    },
    nodes: {
      title: "Boxes and arrows", parts: true, showPicture: true,
      about: "Think of a treasure hunt: each clue says where the next clue is hidden. A linked list gives each item its own {term:node}, anywhere in memory.",
      enter: { sofar: "But the array had to move {count:moved|number} to fit one in.", now: "Meet the parts of a linked list, one at a time.", watch: "Each item will say where the next one is." },
      "enter@find": { sofar: "The array found it with one sum.", now: "Meet the parts of a linked list, one at a time.", watch: "Each item will say where the next one is." },
      exit: { level: "new", check: "parts" },
    },
    walk: {
      title: "Walk",
      about: "No node knows its own position. To reach the {kth} item, start at head and follow the `next` addresses, one arrow at a time.",
      enter: { sofar: "Each node holds a value and the next node's address.", now: "But to insert after {prev}, we first have to reach it.", watch: "Count the arrows we follow." },
    },
    "walk@find": {
      title: "Walk",
      about: "A node's address is written only inside the node before it, so there is no jumping ahead. Start at head and follow the arrows, one by one.",
      enter: { sofar: "Each node holds a value and the next node's address.", now: "Reach the {findth} item.", watch: "Count the arrows we follow." },
    },
    insert: {
      title: "Insert",
      about: "To add {new} after {prev}, make a new node anywhere there is room, then change two arrows. Nothing already in the list moves.",
      enter: { sofar: "Our marker stands on {prev}, the {kth} item.", now: "Link {new} in after {prev} by changing two arrows.", watch: "Reading from head should pass {prev} → {new} → {after}." },
    },
    wrong: {
      title: "Wrong order",
      about: "This time {prev} is pointed at the new node first. But {prev}'s `next` held the only copy of {after}'s address.",
      enter: { sofar: "Same list, same new node for {new}.", now: "But do the two writes the other way round.", watch: "Can head still reach {after}?" },
    },
    right: {
      title: "Right order",
      about: "Swap the two updates. The new node copies {prev}'s `next` first, so {after}'s address is saved. Then {prev} can safely point at it.",
      enter: { sofar: "Changing {prev} first lost {count:lostN|node}.", now: "Rewind, and do it in the right order.", watch: "{after}'s address should be in two places before {prev} changes." },
    },
    tradeoff: {
      title: "Trade-off",
      about: "Each is quick at something. An array slides items to make room. A linked list just changes two arrows, but must walk from head to find the spot.",
      enter: { sofar: "Both now hold {chain}.", now: "Compare what each one paid.", watch: "The counts side by side." },
    },
    "tradeoff@find": {
      title: "Trade-off",
      about: "Each is quick at something. An array jumps to any position with one sum. A linked list must walk there from head, one arrow at a time.",
      enter: { sofar: "The array took one sum; the list walked.", now: "Compare what each one paid.", watch: "The counts side by side." },
    },
  },

  steps: {
    // ---- chapter 1, insert and wrong stories ----
    "array.goal": {
      plain: "{n} numbers side by side, plus one free slot at the end.",
      why: "We want {new} right after {prev}, like adding one song mid-playlist.",
      look: ["arr"],
      deeper: {
        cost: "Inserting at position i of n moves n − i items: O(n) in the worst case.",
        how: "The free slot is spare capacity. Python lists keep some; when none is left, the list grows into a bigger block, which can mean copying all of it.",
      },
    },
    "array.slide": {
      first: {
        key: true,
        plain: "{v} slides one slot right, into the free slot.",
        why: "We start at the end. Starting at the front would write over a number before it moved.",
        when: "moved > 1",
        look: ["arr"],
        deeper: {
          code: "CPython's list insert shifts the same way, last item first: `for (i = last; --i >= first;) items[i+1] = items[i];`",
          source: "https://github.com/python/cpython/blob/main/Objects/listobject.c",
        },
      },
      plain: "{v} slides one slot right.",
      look: ["arr"],
    },
    "array.drop": {
      key: true,
      plain: "{new} drops into the gap. {count:moved|other number} had to move.",
      why: "Every insert pays this: the more items after the gap, the more slide.",
      look: ["arr"],
      deeper: {
        cost: "Here {moved} moves for {n} items: one block copy of {moved} × 4 bytes. Cheap per item, but it grows with the list.",
        how: "For short arrays this is fast in practice: the bytes sit side by side, so the CPU streams them.",
      },
    },

    // ---- chapter 1, find story ----
    "jump.where": {
      plain: "{n} numbers side by side from {arr}. Where is the {findth} item?",
      why: "An address is a number, so we can do arithmetic with it.",
      look: ["arr"],
    },
    "jump.sum": {
      key: true,
      plain: "Start + {findHops} × 4 bytes = {findAt}. One sum, one jump: it's {findV}.",
      why: "No searching: the position alone gives the address.",
      look: ["arr"],
      deeper: {
        cost: "O(1) for any position.",
        how: "This is what a[k] compiles to: base + k × size, a single scaled-index load on x86. It needs equal-size items, side by side.",
      },
    },

    // ---- chapter 2: the parts (every story) ----
    "nodes.one": {
      key: true,
      plain: "A {term:node} holds the value {first} and `next`: the address of the next node.",
      why: "Like a clue card: a prize, and where to find the next card.",
      look: ["n0"], picture: "node",
      deeper: {
        cost: "Memory per item goes up: in C on a 64-bit machine this node is 16 bytes (4-byte int, 4 bytes padding, 8-byte address), against 4 bytes per number in the array.",
        how: "In Python each Node is a full object with its own header, so it is far bigger still.",
      },
    },
    "nodes.scattered": {
      plain: "The other {others} nodes sit wherever memory had room.",
      why: "Not side by side, so making room never means sliding anything.",
      look: ["mem"],
      deeper: {
        how: "Each node comes from the allocator (malloc in C, Node() in Python). Its label is its address; nothing keeps neighbours together.",
        cost: "Scattered nodes are why walking a list is slow on real hardware (see Walk).",
      },
    },
    "nodes.pointer": {
      key: true,
      plain: "{first}'s `next` holds {secondAddr}. The arrow to that node is a {term:pointer}.",
      why: "An arrow is just an address written down. Follow it and you arrive.",
      look: ["n0.next", "n0->n1"], picture: "next",
      deeper: { how: "The machine stores only the number {secondAddr}; the arrow is our drawing of it. Python hides the number, but a reference is stored the same way." },
    },
    "nodes.head": {
      plain: "{term:head} holds the first node's address.",
      why: "It's the clue you're handed. Every trip through the list starts here.",
      look: ["head", "head->n0"], picture: "head",
      deeper: { edge: "Inserting at the very front changes head itself, a special case where bugs hide. A dummy first node (a sentinel) removes it." },
    },
    "nodes.null": {
      plain: "The last `next` is {term:null}: no address. The list ends here.",
      why: "It's the “last clue” card. A walk stops when it reads null.",
      look: ["{lastId}.next"], picture: "null",
      deeper: { edge: "C writes NULL, Python None. Following it crashes: a segfault in C, AttributeError in Python." },
    },

    // ---- chapter 3: walk ----
    "walk.start": {
      plain: "Start where head points. Our marker, `node`, is on {first}, the 1st item.",
      why: "We need to stand on {prev}, the node {new} goes after.",
      "why@find": "We can't jump: only {first}'s box knows where the 2nd item lives.",
      look: ["head", "cur"],
      deeper: { code: "line 7 ▸ node = head" },
    },
    "walk.hop": {
      first: {
        key: true,
        plain: "Follow {a}'s `next`, {baddr}: it's {b}, the {ith} item.",
        why: "One arrow, one step. There is no way to skip ahead.",
        look: ["{aId}->{bId}"],
        deeper: {
          cost: "Reaching item k takes k − 1 hops: O(k).",
          how: "Each hop loads an address that the previous load produced, so the CPU can't start the next hop early. On scattered nodes each can be a cache miss, on the order of 100 ns from main memory.",
          source: "U. Drepper, What Every Programmer Should Know About Memory (2007), https://people.freebsd.org/~lstewart/articles/cpumemory.pdf",
          code: "lines 8–9 ▸ node = node.next",
        },
      },
      plain: "Follow {a}'s `next`, {baddr}: it's {b}, the {ith} item.",
      look: ["{aId}->{bId}"],
    },
    "walk.found": {
      key: true,
      plain: "Found the {findth} item, {findV}, after {count:findHops|arrow}.",
      why: "Every position costs one more arrow. The 1000th would take 999.",
      look: ["{lastFoundId}"],
      deeper: {
        cost: "Array: O(1) by position. List: O(k).",
        real: "Python's deque is a linked list of 64-item blocks; its docs say indexed access is O(1) at both ends but O(n) in the middle.",
        source: "https://docs.python.org/3/library/collections.html#collections.deque",
      },
    },

    // ---- chapter 4: insert ----
    "insert.make": {
      plain: "A new node for {new}, wherever memory had room. Its `next` is null for now.",
      why: "It exists, but no arrow leads to it yet, so the list can't reach it.",
      look: ["nx"],
      deeper: { code: "line 13 ▸ new = Node(value)", how: "In this run it landed at {newAddr}. Any free spot works; that's the point." },
    },
    "insert.save-next": {
      key: true,
      plain: "{new}'s `next` copies {prev}'s. Now {new} points at {after} too.",
      why: "{after}'s address is now saved in two places, so changing {prev} is safe.",
      look: ["nx.next", "nx->{afterId}"], picture: "next",
      deeper: {
        cost: "O(1) once you stand on {prev}: two writes, whatever the length. Getting to {prev} was the O(k) part.",
        how: "new.next = node.next must run first: until it does, {prev}'s next is the only copy of {after}'s address.",
        real: "Linux's list_add fills in new->next and new->prev, then writes prev->next last.",
        source: "https://github.com/torvalds/linux/blob/master/include/linux/list.h",
        code: "line 14 ▸ new.next = node.next",
      },
    },
    "insert.link-prev": {
      key: true,
      plain: "{prev}'s `next` now points at {new}. The chain runs {prev} → {new} → {after}.",
      why: "One write, and every walk from head now passes through {new}.",
      look: ["{prevId}.next", "{prevId}->nx"],
      deeper: {
        real: "With readers running at the same time, this last write is the “publish”. Linux RCU lists set new->next and new->prev, then rcu_assign_pointer(prev->next, new). Lock-free lists do it with one compare-and-swap (Harris 2001, doi:10.1007/3-540-45414-4_21).",
        source: "https://github.com/torvalds/linux/blob/master/include/linux/rculist.h",
        edge: "A doubly linked list needs four writes; the same rule holds: finish the new node before anything points at it.",
        code: "line 15 ▸ node.next = new",
      },
    },
    "insert.read": {
      plain: "Read from head: {chain}. {new} is in, and nothing moved.",
      why: "The proof: walking the arrows now meets {new} in its place.",
      look: ["head"],
      deeper: { how: "Every old node still sits at the address on its label. Nothing was copied." },
    },

    // ---- chapter 5: trade-off ----
    "tradeoff.insert": {
      key: true,
      plain: "Array: {count:moved|item} moved. List: none moved, 2 arrows changed, {count:hops|arrow} followed.",
      why: "Neither is free. The list moves nothing, but reaching the spot costs one arrow per item.",
      look: ["arr", "{prevId}"],
      deeper: {
        cost: "At position k: array O(1) to find + O(n − k) to shift; list O(k) to walk + O(1) to splice. Items moved here at k = 1…4 (n = 5): 4, 3, 2, 1.",
        real: "On real hardware arrays often win anyway: shifting is a streaming copy, while every list hop risks a cache miss. Lists earn their place when you already hold the node: an LRU cache's list, allocator free lists, Linux's list_head.",
      },
    },
    "tradeoff.find": {
      key: true,
      plain: "Array: one calculation. List: {count:findHops|arrow} followed.",
      why: "Finding by position is the list's weak spot, and it grows with the position.",
      look: ["arr", "{lastFoundId}"],
      deeper: { real: "Need fast inserts *and* fast lookups? Skip lists add express lanes over a list (Pugh 1990, doi:10.1145/78973.78977); B-trees are the other usual answer." },
    },

    // ---- wrong-order story ----
    "wrong.prev-first": {
      key: true,
      plain: "{prev}'s `next` now points at {new}, first.",
      why: "That was the only place {after}'s address was written. It's gone now.",
      look: ["{prevId}.next"], picture: "next",
      deeper: { how: "Overwriting a pointer you still need is the classic linked-list bug. It's why textbooks write the two lines in a fixed order." },
    },
    "wrong.self-loop": {
      key: true,
      plain: "{new}'s `next` copies {prev}'s: that's {new}'s own address. It points at itself.",
      why: "A loop of one: {new} leads back to {new}.",
      look: ["nx.next"],
      deeper: { how: "A walk now never reaches null. Floyd's “tortoise and hare” finds such loops with two markers moving at different speeds (Knuth, TAOCP Vol. 2 §3.1, ex. 6; unverified)." },
    },
    "wrong.lost": {
      key: true,
      plain: "No arrow leads to {after} now, so {lost} are lost for good.",
      why: "Each address was written only in the node before it. Nothing remembers them.",
      look: ["lost"],
      deeper: { real: "In C those {count:lostN|node} leak: still allocated, never freeable. In CPython their reference counts hit zero the moment {prev}'s next was overwritten, and they are freed. Either way the data is gone." },
    },
    "wrong.read-loop": {
      plain: "From head: {chain}, {new}, {new}… forever. It never reaches the end.",
      why: "A program walking this list would hang, not crash.",
      look: ["nx"],
    },
    "right.rewind": {
      plain: "Rewind to before the mistake: {prev} still points at {after}.",
      why: "Same list, same new node. Only the order changes.",
      look: ["{prevId}->{afterId}"],
    },
    "right.save-next": {
      key: true, yourTurn: "fade-1",
      plain: "First, {new}'s `next` copies {prev}'s. {after}'s address is now in two places.",
      why: "The copy is the safety net: {prev} can change without losing {after}.",
      look: ["nx.next", "nx->{afterId}"],
    },
    "right.link-prev": {
      plain: "Then {prev} points at {new}. Every node can still be reached.",
      look: ["{prevId}->nx"],
    },
    "right.read": {
      plain: "From head: {chain}. Save the old arrow before you change it.",
      look: ["head"],
    },
  },

  // predictions (today's s.ask), now with feedback per option; `misconception` ties an option to a belief
  asks: {
    "insert.order": {
      before: "insert.save-next",
      question: "Two arrows must change. Which one do we change first?",
      options: [
        { text: "{new}'s next: point it at {after}", correct: true,
          feedback: "Right. {prev}'s next is the only place {after}'s address is written, so copy it before anything overwrites it." },
        { text: "{prev}'s next: point it at {new}", misconception: "m-order",
          feedback: "That overwrites the only copy of {after}'s address, and nothing could reach {after} again. The third story plays it out." },
        { text: "Either order works", misconception: "m-order",
          feedback: "It looks symmetric, but one write destroys what the other needs: {after}'s address. The third story plays it out." },
      ],
      // M3: becomes s.choose in the world (nx.next | {prevId}.next | chip "Either order works"); a wrong pick forks to the wrong story at this step
    },
    "walk.hops": {
      before: "walk.start", story: "find",
      question: "Starting on the 1st node, how many arrows must we follow to reach the {findth}?",
      options: [
        { text: "1: jump straight there", misconception: "m-jump",
          feedback: "That works in an array, where the address is a sum. Here {findV}'s address is written only in {findPrev}'s next, so we must reach {findPrev} first." },
        { text: "{findHops}", correct: true,
          feedback: "Each arrow moves one node along. From the 1st node, {findHops} arrows reach the {findth}." },
        { text: "{find}",
          feedback: "That counts nodes, not arrows. We start on the 1st node already, so it's one arrow fewer." },
      ],
    },
    "wrong.self": {
      before: "wrong.self-loop", story: "wrong",
      question: "Now `new.next = node.next` runs. Where will {new}'s next point?",
      options: [
        { text: "At {after}", misconception: "m-copy",
          feedback: "It did a moment ago. But assignment copies what node.next holds *now*: {new}'s own address." },
        { text: "At {new} itself", correct: true,
          feedback: "Yes: node.next was just set to {new}'s own address, so copying it makes {new} point at itself." },
        { text: "Nowhere: null",
          feedback: "node.next isn't null: it holds an address, {new}'s own." },
      ],
    },
  },

  // self-explanation (assisting menu), New and Basics only, after the aha step
  explain: {
    "insert.link-prev": {
      prompt: "Why did {new}'s arrow have to change first?",
      options: [
        { text: "It saved the only copy of {after}'s address.", correct: true },
        { text: "New nodes always go first.", feedback: "The rule isn't about new nodes: it's about not overwriting the last copy of an address." },
      ],
    },
  },

  // your turn (M3): in-world picks; every option is a real branch of the deterministic run
  yourTurn: {
    "fade-1": { at: "right.save-next", level: ["new", "basics"],
      ask: "Your turn: make {new} point at the rest of the list. Click {new}'s next, then the node it should point at.",
      expect: [{ pick: "nx.next" }, { pick: "{afterId}" }],
      wrong: { "{prevId}.next": "That's {prev}'s arrow. Changing it first is what lost the list a moment ago." } },
    "both": { at: "right.save-next", level: ["expert"],
      ask: "Do the insert: make both writes, in the order that loses nothing.",
      expect: [{ pick: "nx.next", to: "{afterId}" }, { pick: "{prevId}.next", to: "nx" }] },
  },

  // chapter-exit check (parts chapter, New only)
  exits: {
    parts: { in: "nodes", level: ["new"],
      ask: "Click the box that says where {second} lives.", answer: "n0.next",
      wrong: {
        "n1":   "That's {second} itself. The list only learns {second}'s address from the box before it: {first}'s next, {secondAddr}.",
        "head": "head says where the 1st node, {first}, lives.",
      } },
  },

  // end check: each answer comes from a run (verify executes it), never a literal
  checks: [
    { id: "c-shift", objective: "o-shift", level: ["new", "basics"], run: { story: "insert", n: 7, at: 4 },
      question: "A 7-number array with a free slot. We insert after the 4th number. How many numbers slide?",
      answer: "counter:moved@chapter-end:array",              // = 3
      options: ["0", "{answer}", "4", "7"],
      feedback: { "0": "That's the linked list. In an array, every number after the gap slides: the 5th, 6th and 7th.",
                  "4": "Count only the numbers after the 4th: the 5th, 6th and 7th.",
                  "7": "The first four stay where they are; only the ones after the gap move." },
      replay: "array" },
    { id: "c-order", objective: "o-order", level: ["new", "basics", "expert"], run: { story: "insert", n: 7, at: 3 },
      question: "Insert {new} after {prev}. Which line must run first?",
      options: ["new.next = node.next", "node.next = new", "Either order works"], correct: 0,
      feedback: { 1: "That overwrites the only copy of {after}'s address first, and the rest is lost.",
                  2: "One write destroys what the other needs: {after}'s address." },
      replay: "wrong" },
    { id: "c-cost", objective: "o-cost", level: ["new"], run: { story: "find", n: 7 },
      question: "The list has 7 nodes. Starting on the 1st, how many arrows to reach the 7th?",
      answer: "6", options: ["1", "6", "7"],   // M3: compute from a walk run to item 7 (figure needs a 'find k' var)
      feedback: { "1": "Only an array can jump. Here each address sits in the node before it.",
                  "7": "Counting nodes, not arrows: we start on the 1st." },
      replay: "walk" },
    { id: "c-rcu", objective: "o-order", level: ["expert"],
      question: "Other threads read the list forward with no locks (Linux RCU). What must be true before prev->next = new is written?",
      options: ["new->next and new->prev are already set", "next->prev already points at new", "Nothing: one write is atomic"], correct: 0,
      feedback: { 1: "list_add_rcu writes next->prev after publishing; forward readers never use it.",
                  2: "The write is atomic, but a reader could follow it into a half-built node." },
      source: "https://github.com/torvalds/linux/blob/master/include/linux/rculist.h" },
  ],

  // Expert-only edge-case card at the end (VisuAlgo enumerates these cases too)
  edges: [
    "Empty list: head is null; inserting means head = new.",
    "Insert at the front: the new node's next = head, then head = new; same order rule.",
    "Insert at the end with no tail pointer: walk all n nodes first, O(n).",
    "Delete: point the node before at the one after; in C, free the removed node yourself.",
  ],

  stories: {
    insert: { recap: [
      "The array had to slide every later item over to make room.",
      "A node holds a value and `next`, the address of the next node.",
      "Inserting changed two arrows, in the right order. Nothing moved.",
      "Reaching the spot meant following arrows from head, one at a time.",
    ], takeaway: "A linked list never moves its items: inserting just changes two arrows. The price is finding things: you must follow the arrows from head." },
    find:   { recap: [
      "The array found the item with one sum: start + position × size.",
      "A node's address is written only in the node before it.",
      "So the list walked from head, one arrow per item.",
    ], takeaway: "An array finds item k with one calculation. A linked list has no shortcut: it follows k − 1 arrows from head." },
    wrong:  { recap: [
      "Changing the old arrow first erased the only copy of the next address.",
      "The new node then pointed at itself, and the rest of the list was lost.",
      "In the right order the new node saves the address first. Nothing is lost.",
    ], takeaway: "Before you overwrite an arrow, save where it pointed: point the new node onward first, then point the old one at it." },
  },
};
```

**Step ids per story** (what `figure.mjs` would pass):

| # | insert (17) | find (14) | wrong (21) |
|---|---|---|---|
| 0 | array.goal | jump.where | array.goal |
| 1 | array.slide (first) | jump.sum | array.slide (first) |
| 2–3 | array.slide | nodes.one, nodes.scattered | array.slide |
| 4 | array.drop | nodes.pointer | array.drop |
| 5 | nodes.one | nodes.head | nodes.one |
| 6 | nodes.scattered | nodes.null | nodes.scattered |
| 7 | nodes.pointer | walk.start (ask walk.hops before it) | nodes.pointer |
| 8 | nodes.head | walk.hop (first) | nodes.head |
| 9 | nodes.null | walk.hop | nodes.null |
| 10 | walk.start | walk.hop | walk.start |
| 11 | walk.hop (first) | walk.hop | walk.hop (first) |
| 12 | insert.make (ask insert.order after) | walk.found | insert.make |
| 13 | insert.save-next | tradeoff.find | wrong.prev-first (ask wrong.self after) |
| 14 | insert.link-prev | | wrong.self-loop |
| 15 | insert.read | | wrong.lost |
| 16 | tradeoff.insert | | wrong.read-loop |
| 17–20 | | | right.rewind, right.save-next, right.link-prev, right.read |

**Template checks at the knob extremes:**
- **k = 1:** no hops after `walk.start`; `{count:hops|arrow}` reads "0 arrows"; `{prev}` = `{first}`.
- **k = 4, n = 5:** one slide; `array.slide.first`'s why is suppressed by `when: moved > 1`; `{lost}` is a single node, so the `wrong.lost` line must use `fmt.and` plus a singular verb. Add `{be:lostN}` → "is" or "are". This is a template-helper requirement.
- **n = 7:** `{others}` is 6.

The current caption "48, 17 and 23 are lost" already has the singular bug at k = 4 ("23 are lost"). The figure's caption is hard-coded "are". **Flag for M1:** at n = 5, k = 4, today's caption reads "No arrow leads to 23 now, so 23 are lost for good". I found this by reading `build()`: `lesson.mjs` has no knob flag, so I could not print it.

**Term placement vs today:**
- `address` moves to chapter 1, where the world first shows one (the array label).
- `node`, `pointer`, `head` and `null` stay in the parts chapter, one per step, each lit.
- With the parts-chapter rule (§6), chapter 2 passes. Without it, PLAN's ≤2 rule would fail on correct pre-training.

---

## 9. Changes I'd make to PLAN.md §2 (and §1.2)

1. **§1.2, first bullet:** reword. Five terms in the parts chapter is pre-training, not overload, *if* it is one term per step, each lit, with states shown. The real defects:
   - `address` appears in the world in chapter 1 unnamed;
   - nothing retrieves the names before chapter 3 uses them.

   Fix both: move `address` to chapter 1, and add a parts exit check at New.
2. **§2.1 / §2.2, `why`:** change "a why line on every step" to: chunk purpose on the chapter-entry card; step `why` only on `key` steps and the first of each repeat. Add the lint "why must not restate plain".
3. **§2.2 item 3, analogy map:** delete the persistent bottom map. Replace it with: the full map once on the parts-chapter entry card (with "where it stops matching"), an inline picture line on flagged steps at New, and the map in the Words drawer.
4. **§2.2 item 2, "Go deeper":** make `deeper` structured (`cost`, `how`, `code`, `edge`, `real`, `source`). Define "peek" as the first present field. Require `source` whenever `real` names a real system.
5. **§2.2 "The reader's level":**
   - Adopt the level table in §4 here, including **Expert gets problems, not just more text** (expertise reversal applies to worked examples too).
   - Add the **performance nudge** (never an automatic switch).
   - Add "hold after key steps" at New.
6. **§2.2 `look`:** fire with the words in the same frame; colour the chip and term underline in the entity's identity colour (Ciechanowski); put the step's number in the world as a tag; the chip pulses only at New.
7. **§2.3:**
   - Rank the patterns as in §5, and make per-option feedback an **M1** item (it's words).
   - Adopt the wrong-pick protocol (commit → play → hold → name the belief → rewind and retry → never end broken → "Show me" after 2).
   - Add interaction caps (≤1 per chapter, ≥4 steps apart, ≤3/2/1 per story by level).
   - End checks run the figure at other knobs (VisuAlgo-style generated questions; answers from the run).
   - Fading needs a second instance of the move: use the "Right order" chapter.
8. **§2.3:** add one **assisting self-explanation** menu at the aha step (New and Basics).
9. **§2.4 schema:** add `key`, `when`, `first`, `@story` overrides, chapter `enter`/`exit`/`parts`, `asks` with options and feedback, `checks` with a run spec, and the vars contract (`s.step(fallback, { id, vars })`), plus helpers `{count:x|noun}` and `{be:x}`.
10. **§2.5 lint:** replace the term-load and grade rules with §6:
    - ≤1 new term per step;
    - chapter caps with a `parts` exception;
    - use-it-or-lose-it;
    - world labels count as introductions;
    - pooled grade ≥100 words, code stripped;
    - unknown-word density ≥95 % at New.
11. **§2.5 benchmark:** the end checks double as the post-quiz. Add a **transfer item at other knobs** to every quiz, so simulated learners can't pass by echoing captions (the testing effect is weaker on high element-interactivity material).
12. **§6 milestones:** move per-option feedback and the level table into M1. Treat M3 (choose-in-world) as the highest learning-value item in either track (Hundhausen 2002; Naps 2002). Do not let M4/M5 polish displace it.
13. **§7 acceptance, first-timer:** add "chooses the right write order in the world on the first or second try" as a behavioural check, alongside the quiz score.
14. **Fix found while drafting (figure, not PLAN):** at n = 5, k = 4 the wrong story's caption reads "so 23 are lost for good" (plural verb, one node).

---

### Unverified or not checked this session

- 3Blue1Brown, Brilliant and Khan Academy patterns (product and viewing knowledge).
- Rey et al. 2019 moderators; Schneider 2018 and Richter 2016 effect sizes (direction only from my reading).
- Forward vs backward fading.
- The Knuth attribution of Floyd's cycle-finding algorithm.
- The "~100 ns" DRAM miss figure (order of magnitude, from Drepper 2007; not re-read).
- Hu & Nation 2000 bibliographic details (no DOI found; its replication is verified).
- That learner pacing shrinks the pre-training effect.
- The 44 px touch-target figure as "Apple guidance".
