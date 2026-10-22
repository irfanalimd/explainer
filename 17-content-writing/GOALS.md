# Content: the writing standard and its lint

The user asked for every explanation Explainer puts out to read as if a careful human teacher wrote it: plain,
concrete and specific, with famous examples and no sloppy, machine-sounding language. Four branches share the work.
This one changes the skill itself, so that every future figure meets the standard: the rules, the lint that checks
them, and the agents that write and review the words. The other branches rewrite the 8 examples' words and build the
sources pipeline.

## Targets

1. A written standard for the words, with rules and before/after pairs from the examples' real text.
2. A lint over every text the reader meets (hook, abouts, entry cards, every step layer, questions, options and
   feedback, end checks, recap, takeaway, definitions, teacher's notes, story names, world labels), with:
   - a shared list of banned words and phrases (delve, crucial, seamlessly, plays a key role, it's worth noting, …);
   - empty sentence openers, softeners, "not just X, but Y", praise tricolons, fluff;
   - em dashes, exclamation marks, emoji;
   - rhetorical questions outside a prediction, the hook and the teacher's prompt;
   - vague amounts in a claim about real systems with no number or source;
   - structure: a why that restates its step, and the same sentence in two places.
3. Exact locations (`lesson.mjs:144`) and a concrete rewrite for each hit.
4. Warnings for now, so the 8 examples keep passing until their rewrites land.
5. The teacher skill and agent, both blind readers and the scaffold point to the standard.

## Rules that shape it

- Few false positives. A lint that cries wolf gets ignored, so every rule was run over the 8 examples and every hit
  read. Patterns that caught good writing were narrowed ("the very same", "however many", "most servers" in a quorum,
  the picture map's "real" side, chips and inline code).
- The standard obeys itself: no em dashes, no inflating words.
- No figure's words are changed here; the hit list is the input for the branches that rewrite them.

## How it is measured

| Target | Measure |
|---|---|
| Coverage | Every prose string literal of `figure.mjs` and `lesson.mjs`, found with the build's own lexer: comments, ids, keys, imports and the program listing skipped (unit tests) |
| Accuracy | Every hit on the 8 examples read by hand (`lint-main.txt`); unit tests for each rule's true and false cases |
| Nothing broken | verify on all 8 (0 failing), the full unit suite |
