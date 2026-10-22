# Sources: goals

The content round makes the information every Explainer figure puts out much better: grounded in the examples the
field's best-known sources teach with, every fact a reader can check, written plainly. This branch changes the skill
itself (how any `/explainer <concept>` gathers and records its facts). Rewriting the 8 examples' words, and a lint for
sloppy writing, are other branches.

## Targets

1. **Record sources as data.** `lesson.sources = [{ id, title, by, year, where, url, supports }]`, so a figure's facts
   have a checkable origin, not a URL pasted into a sentence.
2. **Cite in the text.** Any layer cites a source as `[id]` with an optional locator (`"[dean2004] §3.6"`). The page
   shows a short readable citation ("Dean & Ghemawat 2004, §3.6"), linked when there is a url, never the brackets: in
   the explain panel, the caption, the presenter view, the handout, the saved still and the spoken text.
   `meta.cite` keeps working and can be `[id]`.
3. **Check it in verify.** An unknown `[id]` is an error; an uncited source, a `real` or `source` layer with no
   citation, and a figure with no sources are warnings (warnings so the 8 examples keep passing until their rewrite
   lands; then they should become errors).
4. **Make every new figure do it from the start.** The research step (SKILL.md step 2), the curriculum designer, the
   teacher, the expert reader, `references/teaching.md`, CONTRACTS.md section 10 and the scaffold.

## Rules that shape it

- Prefer the primary source (the paper, the spec, the standard, the original author's talk or post), then the
  best-known textbook or reference, then famous, widely cited explanations.
- Start from the example the field teaches with, at its size; change it only where it cannot show what the lesson
  needs, and say so.
- A citation must say what the sentence claims, in those terms. Open the source; read the section the locator names.
- Text quality only: no graphics or engine behaviour beyond what showing a citation needs.

## How it is checked

| Target | Check |
|---|---|
| Parsing | unit tests: citations found where a word may start, never inside a word, an escape or inline code; locators; short and full forms |
| Rendering | screenshots of a citation in the panel (with its tooltip), the handout's Sources section and the presenter view, both themes, on a copy of MapReduce whose lesson cites the paper; the a11y probe on the panel frame |
| verify | unit tests for every finding; verify on all 8 examples (0 failing; the one new warning each counted) and on a fresh scaffold (clean) |
| The pipeline | the scaffold, the lesson printer and the review packet read citations the same way; the docs' own examples checked against the papers |
