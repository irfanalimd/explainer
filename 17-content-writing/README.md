> **Draft, for review only. Don't merge yet.** The planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/17-content-writing/GOALS.md)), every lint hit on the 8 examples ([lint-main.txt](https://github.com/irfanalimd/explainer/blob/review/17-content-writing/lint-main.txt)) and the check logs are on the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/17-content-writing). The code diff is under **Files changed**. This branch is cut from `polish/round-4` (the round-4 combined branch), so review it after that one.

## TL;DR

- **A writing standard for every sentence a figure shows**, in `references/writing.md`. It has eleven rules:
  - the run's own numbers, and one claim per sentence;
  - no inflating words, stock phrases or softeners;
  - a number or a source for any claim about real systems;
  - statements, not rhetorical questions;
  - quiet punctuation;
  - say it once;
  - the field's canonical example.

  It also has the word list with a rewrite for each word, and 15 before/after pairs from the examples' own text.
- **verify now lints the writing.** It reads every prose string of `figure.mjs` and `lesson.mjs`, so it covers every layer, card, definition, teacher's note and world label; the old teaching lint read only captions, abouts and questions. Then it reads the compiled lesson for a why that restates its step and a sentence said twice.
  - Each hit names the file, the line and a rewrite.
  - verify groups the hits, one warning per kind.
  - `node scripts/lesson.mjs figure.mjs --style` lists them all.
- **The words' writers and readers use it.** The teacher skill and agent gate on no writing warnings. Both blind readers report a `sloppy` list, quote-checked like their other findings. The scaffold points to the standard.
- The 8 examples have **22 hits** between them; btree and quicksort have none. All are warnings for now, and the branches rewriting the examples' words take the list.
- Branch **`content/writing`**, 2 commits on `polish/round-4`. Unit tests 342 → 353, verify 0 failing on all 8.

## Before and after

| | `polish/round-4` (e2a9b24) | this branch |
|---|---|---|
| Text the teaching checks read | captions, abouts, questions and options, hook, recap, takeaway, labels | the same, plus every prose string in `figure.mjs` and `lesson.mjs`: `why`, `deeper`, entry cards, feedback, end checks, definitions, teacher's notes, world labels |
| Words and phrases checked | 8 filler words (obviously, clearly, simply, …) | the same, plus 40 words, 19 stock phrases, 13 sentence openers, 8 softeners, 11 fluff words and praise tricolons |
| Structure checked | caption, about and sentence length; reading grade | the same, plus rhetorical questions in an explanation, vague amounts in a claim about real systems, a why that restates its step, a sentence said in two places |
| Where a finding points | the step or chapter | the file and line (`lesson.mjs:222`) and a rewrite |
| Writing hits on the 8 examples | not checked | 22: softeners 7, vague amounts 6, rhetorical questions 6, repeats 3 ([full list](https://github.com/irfanalimd/explainer/blob/review/17-content-writing/lint-main.txt)) |
| verify, all 8 examples | 211 runs, 0 failing | 211 runs, 0 failing; writing warnings: consistent hashing 3 kinds, linked list 3, Raft 2, virtual memory 2, event loop 1, MapReduce 1, btree and quicksort none |
| Unit tests | 342 / 342 | 353 / 353 |

---

## 1. The standard

**The problem.** `references/teaching.md` says what to teach and where each part goes, and its lint checks the
shape: lengths, jargon, a reading grade. Nothing said how a sentence should read, so nothing stopped a figure from
explaining Raft as "a robust, reliable and elegant consensus algorithm" or a deeper layer from saying "many databases
do this". Those sentences pass every existing check.

**What changed.** `references/writing.md`, linked from SKILL.md, `teaching.md` (sections 3 and 9) and `tooling.md`:

1. Say what happens, with the run's own numbers.
2. One claim per sentence, subject first.
3. Cut words that inflate (the list, each with its rewrite: crucial → "drop it, or say what breaks without it";
   leverage → use; myriad → the number).
4. Cut stock phrases ("it's worth noting", "plays a key role", "under the hood" past its first use).
5. No softeners or intensifiers ("the very same" is fine: it names one thing exactly).
6. A claim about real systems carries a number or a named source.
7. Explain with statements; questions belong to the hook, the predictions, the picks, the end check and the
   teacher's prompt.
8. No rhetorical frames: "not just X, but Y", praise tricolons, algorithms that act "cleverly".
9. Quiet punctuation: no em dashes (the examples have one between them), no exclamation marks, no emoji; an en dash
   for a range.
10. Say it once (citations and entry cards may repeat).
11. Use the field's canonical example, and cite it.

Fifteen before/after pairs come from the examples' current text. A few:

| Before | After |
|---|---|
| MapReduce story label: "One word is very common" | "One word is everywhere" |
| Consistent hashing, why: "Which keys now meet {extra} first on their clockwise walk?" | "The keys whose clockwise walk now meets {extra} first are the ones that move." |
| Linked list, edge: "Measured, arrays often win anyway, even for inserts in the middle…" | "In Stroustrup's measurements (GoingNative 2012) an array beat a linked list for inserts in the middle at every size he tried…" |
| Virtual memory, edge: "…so a walk to a nearby page often reads only the last table." | "…in small paging-structure caches (Intel SDM Vol. 3A, §4.10.3), so a walk to a nearby page can read only the last table." |
| Raft, edge: "Why the blank `nop`? A new leader learns which older entries are final only once…" | "The blank `nop` is there because a new leader learns which older entries are final only once…" |

## 2. The lint

**The problem.** The teaching lint reads the lesson as the page compiles it, so it only sees what it extracts:
captions, abouts, questions. It never read a `why`, a `deeper` layer, an entry card, feedback or a teacher's note, and
its findings named a step, not a line.

**What changed** (`scripts/lib/style.mjs`, `scripts/verify.mjs`, `scripts/lesson.mjs`).
- **The source scan.** It reads every string literal of `figure.mjs` and `lesson.mjs` with the build's own lexer
  (`tokenize` in `scripts/lib/modules.mjs`). It keeps those that read as words, and skips comments, ids, object
  keys, imports and the program listing (`export const code`). Each string knows its field: the key it is the value
  of (`why`, `deeper.edge`, `recap`), or the call it is an argument of (`step#0`, s.step's caption). Chips, inline
  code and template slots are read as placeholders, so a key named "vital" or a function `crucial()` is not a word.
- **The rules,** with their fields:

| rule | what | where |
|---|---|---|
| `words`, `phrases` | the lists in `writing.md` section 2 | every prose string |
| `openers`, `hedges`, `contrast`, `tricolon`, `fluff` | empty openers, softeners, "not just X, but Y", three praise words, personality words | every prose string |
| `punctuation` | em dash, exclamation mark, emoji | every prose string |
| `questions` | a sentence ending in "?" | captions, `plain`, `why`, abouts, cards, `deeper`, feedback, recap, takeaway, definitions, descriptions |
| `vague` | many, often, typically, in practice, most systems… with no number (digits or number words) and no named source | a step's `deeper` layers |
| `repeats` | a `why` that adds at most one content word to its `plain`; a sentence of 7 words or more said in two places | the compiled lesson |

- **Tuned on the real text.** Every rule ran over the 8 examples and every hit was read. Six patterns caught good
  writing, so they were narrowed:
  - "the very same" and "the very next" name one thing exactly;
  - "however many" and "many-core" count nothing;
  - "most servers" in a quorum is exact;
  - the picture map's `real` side is not a claim about real systems;
  - "it just hears nothing back" uses "just" to mean "only";
  - "truly random" is a technical term.
- **The output.** In verify, each kind is one warning with its first four hits:

  `5 softeners (references/writing.md): figure.mjs:51 "very" → drop it; …`

  `node scripts/lesson.mjs figure.mjs --style` prints every hit, one per line:

  `lesson.mjs:222  questions  "?" → say the answer as a statement; …  (why: "Which keys now meet X first on their clockwise walk?")`

Tests: `scripts/lib/style.test.mjs`, 11 tests: every rule's true and false cases, the field detection, the skipped
strings, the repeats, and the grouping.

## 3. The writers and the readers

- **The teacher** (`agents/teacher.md`, `skills/teacher/SKILL.md`): reads `writing.md` first. A "Write to
  references/writing.md" rule joins its words section. Its gate adds "no writing warnings". A `sloppy` finding is
  fixed, never declined.
- **The blind readers** (`agents/novice-reader.md`, `agents/expert-reader.md`) return a `sloppy` list. The novice's
  holds sentences that made them stop trusting the text; the expert's holds wording a technical editor would cut.
  `scripts/review-check.mjs` quote-checks it like their other findings, so it reaches the teacher's findings.json.
- **The scaffold** (`scripts/templates/lesson.mjs`) points to `writing.md` and `--style`. It has 0 hits itself.

## Checks

- `verify.mjs` on all 8 examples: 0 failing, 211 runs ([log](https://github.com/irfanalimd/explainer/blob/review/17-content-writing/verify-after.txt)).
- Unit tests: 353 / 353 ([log](https://github.com/irfanalimd/explainer/blob/review/17-content-writing/tests-after.txt)).
- Every one of the 22 hits read by hand ([lint-main.txt](https://github.com/irfanalimd/explainer/blob/review/17-content-writing/lint-main.txt)): each is a real case of its rule.
- The scaffold (`scripts/templates/`): 0 hits.
- **Not verified:**
  - A blind-review round with the new `sloppy` field. The schema is unchanged (an extra list), and `review-check` reads it, but no reader has filled it in yet.
  - The e2e harness (`scripts/test/e2e.mjs`): it asserts verify's failing counts, not its warnings, but it was not rerun.
  - The lint on a figure written by a model from scratch. The examples were written to a careful house style, so their 22 hits are a low bar; a fresh figure will show more.

## Next

1. **Make `words`, `phrases`, `punctuation` and `repeats` errors** once the examples' rewrites land (the two content
   branches take `lint-main.txt` as their list).
2. Check the `why` against its chapter's entry card too: "Never show the same words twice: a card vs its first
   step" (skills/teacher/SKILL.md) is not checked yet.
3. Read the template vars' values: a var that is itself prose (a `{ markup }` built in `figure.mjs`) is linted at its
   source, but a template that only fills at run time (`{lead}`) is read as a placeholder.
4. A `sloppy` count in the scorer's rubric (`agents/scorer.md`), so a round with sloppy findings cannot pass.
