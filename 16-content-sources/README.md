> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/16-content-sources), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/16-content-sources/GOALS.md)) and the check logs. The code diff is under **Files changed**.

## TL;DR

- **A lesson now lists where its facts come from**, as data: `lesson.sources = [{ id, title, by, year, where, url,
  supports }]`. Any text cites one as `[id]` with an optional locator: `"[dean2004] §3.3"`.
- **The reader sees a short, linked reference, never the brackets:** "Dean & Ghemawat 2004, §3.3".
  - It shows in the explain panel, the caption, the presenter view, the saved still and the spoken text.
  - Its tooltip and accessible name carry the full reference.
  - The handout gains a **Sources** section with each address written out, and on the teacher's copy what the figure
    takes from each source.
  - `meta.cite: "[dean2004]"` links the title to that source.
- **verify checks it.**
  - An `[id]` that names no source, or a malformed list, is an error.
  - These are warnings: a source nobody cites, a `real` or `source` layer with no citation, a plain-text
    `meta.cite`, and a lesson with no sources at all.
  - Each of the 8 examples gets one new warning, "no lesson.sources", until its lesson is rewritten to cite. Then
    these warnings should become errors.
- **Every new figure does this from the start.**
  - SKILL.md's research step gathers the primary source, the **example the field teaches with**, and the standard
    reference, and opens each one.
  - The curriculum designer records them; the teacher cites them and checks each says what the sentence claims; the
    expert reader checks every citation against its source.
  - The scaffold starts with a source and no warning.
- Branch **`content/sources`**, 5 commits on `polish/round-4` (#19). Unit tests 342 → 355. verify: 0 failing on all
  8. HUD suite 278 / 278. `audit --a11y` 0 problems.

## Before and after

| | `polish/round-4` | this branch |
|---|---|---|
| Where a figure records its sources | `meta.cite` (one), and URLs pasted into `deeper.source` strings | `lesson.sources`, one entry per source, cited as `[id]` |
| What a reader sees for a source | the raw string ("J. Dean and S. Ghemawat, MapReduce: …, OSDI 2004, https://…") or its host name | "Dean & Ghemawat 2004, §3.3", linked, full reference on hover |
| Sources in the handout | one line in the footer | a Sources section, addresses written out |
| verify on a citation that names nothing | — | error, with where it was written and a near id |
| verify on an uncited claim about real systems | — | warning (counted per layer) |
| verify, all 8 examples | 0 failing; Raft 3 warnings, the rest 0 | 0 failing; one new warning each ("no lesson.sources"), Raft 4 |
| A fresh scaffold (`new.mjs`) | 0 warnings | 0 warnings, 1 source, 2 citations |
| Unit tests | 342 | 355 (13 new) |
| HUD browser suite / e2e harness | 278 / 278, all passed | 278 / 278, all passed |
| `audit --a11y --at phases`, MapReduce, light and dark | 0 problems | 0 problems; the same on a copy whose lesson cites the paper |

---

## 1. Citations in the words

`b0ae609`. Files: `engine/scene/sources.mjs` (new), `engine/hud/markup.mjs`, `engine/scene/narrate.mjs`,
`engine/scene/template.mjs`, `engine/scene/lesson.mjs`.

**The problem.** A lesson had nowhere to put its sources. `meta.cite` held one, and `deeper.source` held a free-text
string with a URL in it, which the panel showed raw or as a host name. Nothing checked that a claim had a source, or
that a source was ever used.

**What changed.**
- `lesson.sources` lists them. `sources.mjs` finds citations in text: `[id]` only where a word may start (`a[i]` is an
  index, `\[` a literal bracket), with a locator if one follows (`§3.6`, `p. 171`, `pp. 170–173`, `ch. 7`, `fig. 2`,
  `table 1`, `line 12`).
- The short form: one surname, two joined by "&", or the first and "et al.", then the year. An organisation gives its
  own `short` ("HTML Standard"). The full reference: authors, title, venue and year.
- Both markup parsers return a `cite` node. `toDOM` makes a known one a link (new tab) with the full reference as
  tooltip and accessible name; an unknown one stays literal text, so nothing is lost and verify reports it.
- A run's string var never makes a citation: the template escapes its brackets ("[1, 2]" stays text).
- A scale shot's printed lines are drawn in the world, where no link can live, so their citations are written out
  ("2,000 machines, Dean & Ghemawat 2004, §3.5"); the ids are kept for verify.

## 2. What the reader sees

`73bbfd2`. Files: `engine/hud/hud.mjs`, `layers.mjs`, `lesson.mjs`, `still.mjs`, `explain.mjs`, `handout.mjs`,
`hud.css`.

These shots use a copy of MapReduce whose lesson cites the paper (`trial-mktrial.py` makes it from the example). **Its
locators are arbitrary, to exercise the rendering, not checked claims**: rewriting the examples' words with real
citations is the work of the other content branches.

In the explain panel (Expert, where every deeper field shows), the Source row is the short reference with the
outward arrow, and the tooltip gives the full reference:

| Light | Dark |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/16-content-sources/shots/panel-light.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/16-content-sources/shots/panel-dark.png?raw=true) |

The presenter view reads it the same way:

| Light | Dark |
|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/16-content-sources/shots/presenter-light.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/16-content-sources/shots/presenter-dark.png?raw=true) |

The handout lists the sources after "What you saw", with each address written out (a printed page cannot follow a
link), and its footer names the cited source:

![](https://github.com/irfanalimd/explainer/blob/review/16-content-sources/shots/handout-light.png?raw=true)

Measured in the page (`shots/facts-*.json`), in both themes: the citation is an `<a>` to the paper's URL, its
accessible name is "Dean & Ghemawat 2004, §3.2: Jeffrey Dean, Sanjay Ghemawat. MapReduce: Simplified Data Processing
on Large Clusters. OSDI, 2004. (opens in a new tab)", the title link names the same paper, and the a11y probe on that
panel frame reports nothing. The citation inherits the text's colour (it is underlined like the existing source
links), so it meets contrast wherever its sentence does, and the probe found no contrast, name or target problem
on it.

## 3. verify checks the sources

`1cf78ec`. Files: `scripts/lib/sources-lint.mjs` (new), `scripts/verify.mjs`, `scripts/lib/teach.mjs`.

A new **sources** section after the lesson section:

| Finding | Level |
|---|---|
| `lesson.sources` not a list; an entry that is not an object | error |
| an id missing, repeated, or not a lowercase slug | error |
| no `title`, `by` or `year`; a `url` that is not http(s) | error |
| `[id]` naming no source (with where it was written, and a near id: "did you mean [dean2004]?") | error |
| a source no text cites | warning |
| a source with no `where`, or no `supports` | warning |
| a `deeper.real` or `deeper.source` (any `@story` or `first` variant) with no citation | warning |
| a plain-text `meta.cite` when the lesson has sources | warning |
| a lesson with no `sources` at all: one warning, counting its uncited claims | warning |

verify reads the lesson file, the figure's meta and every run's captions and scale shots. Citations are found by the
markup tokenizer, so inline code is never read: the first version flagged B+ tree's `` `Inner([sep], [node, right])` ``.
The teaching lint no longer counts a citation as words for readability.

On the 8 examples: 0 failing, one warning each ("no lesson.sources: … (15 to 34 layers of In real systems, Source or
meta.cite)"). That count is the work list for the rewrite.

## 4. The printer, the review packet and the expert reader

`0a65b06`. Files: `scripts/lib/lesson.mjs`, `scripts/review-packet.mjs`, `scripts/review-check.mjs`,
`agents/expert-reader.md`.

- `node scripts/lesson.mjs` prints citations as the page shows them, and ends with a SOURCES block (id, short form,
  full reference, url, supports): [lesson-print-trial.txt](lesson-print-trial.txt).
- The review packet reads citations the same way in every file (no raw brackets anywhere in a trial packet), and the
  expert's packet gains `sources.md`, the list the handout prints.
- The expert reader now opens each cited source at its locator and checks it says what the sentence claims, in those
  terms. A wrong or unsupported citation is `wrong` or `misleading`; an uncited claim about real systems is `missing`.
  It also says whether the example is the field's own, and returns `citations_checked`, whose quotes review-check
  verifies like the others.

## 5. Every new figure starts from the field's example and its sources

`ed34cec`. Files: `SKILL.md`, `CONTRACTS.md` (10.2, new 10.6), `references/teaching.md` (5.2, new 5.6, 9),
`agents/curriculum-designer.md`, `agents/teacher.md`, `skills/teacher/SKILL.md`, `scripts/templates/`, `scripts/new.mjs`.

- **SKILL.md step 2** now gathers, before any code:
  - the primary source (the paper, standard or specification), read for its rules, numbers and worked example;
  - **the canonical example** the field teaches with (word count; the five-server election; Jake Archibald's
    `setTimeout` / `Promise` ordering puzzle; CLRS's partition trace), used at its size, with any change said;
  - the standard reference and any famous explanation.

  Each is opened and recorded in `lesson.sources` before the lesson is written.
- **The curriculum designer** writes the sources into the skeleton with what each supports and the section it comes
  from; "no source you have not opened; no url that does not load; no claim a source does not make in those terms".
- **The teacher** cites each fact about real systems as `[id]` with a locator and checks the source says it, in the
  same terms. Its gate now includes no sources warnings.
- **`references/teaching.md` 5.6** gives the rules with before/after pairs. **CONTRACTS.md 10.6** specifies the fields,
  the syntax, what the page shows and what verify checks.
- **The scaffold** cites Knuth §6.2.1 from `lesson.sources`, and its `meta.cite` names it.

The docs' own examples were checked against the papers' text, and two were wrong in the first draft:
- the paper's 2,000-machine MapReduce job is in §3.5 (Task Granularity), not §5;
- Raft's §9.3 reports a worst case of 513 ms over 1,000 trials with 150–200 ms timeouts, not "under 300 ms with
  150–300 ms".

The teaching.md example now says what the paper says. That is the check 5.6 asks every author to make.

## Checks

- Unit tests: 355 / 355 ([log](tests-after.txt)).
- `verify.mjs` on all 8 examples: 0 failing, one new warning each, of the "no lesson.sources" kind ([log](verify-after.txt)).
  A fresh scaffold: 0 warnings.
- HUD browser suite: 278 / 278 ([log](hud-suite-after.txt)). e2e harness: all checks passed ([log](e2e-after.txt)).
- `audit --a11y --at phases --themes light,dark`: MapReduce 0 problems ([log](audit-a11y-mapreduce.txt)); the trial
  copy with citations, 0 problems ([log](audit-a11y-trial-with-citations.txt)). Only frame-time warnings.
- Every screenshot here was read. Every url in the docs and templates loads (HTTP 200).
- **Not verified:**
  - **The audit's own frames.** They run at the default level, where the Source row is folded, so the citation chip
    was checked by the a11y probe on an Expert panel frame, not by audit's frames.
  - **Printing.** The handout's Sources section was checked on screen, not on paper.
  - **Text that keeps the brackets.** The embed's plain text (its xAPI statements) keeps `[id]` as written.
  - **The LibKey connector.** It needs a sign-in only you can complete, so the papers were read from their published
    PDFs instead.

## Next, ranked

1. **Cite the 8 examples' claims** (the content branches): the warning count per example is the work list. Then make
   "no lesson.sources" and uncited `real` / `source` layers errors.
2. Let audit open the Source row (an Expert frame), so the citation link is covered by its own frames.
3. Check citation urls in `doctor` or `check` (one HEAD request each, opt-in for offline machines).
4. Resolve citations in the embed's xAPI text.
5. A "Sources" entry in the About card for readers who never open the handout.
