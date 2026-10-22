# Content quality, foundations: goals

The user asked for the quality of the information to be much better: famous, canonical examples from the field's
best-known sources, every fact checkable, plain language with no AI filler. This branch takes four of the eight
examples: Event loop, Quicksort, Virtual memory and Linked list. Text only: the simulation and the pictures do not
change.

## The bar

1. **Every real-world claim names its source**, as `[id]` from `lesson.sources` (a convention shared with the
   lint-and-render branch of this round). Every number is a var from the run or cited.
2. **The famous example, where the field has one:** Jake Archibald's 2015 ordering test (the "order" story is it,
   extended), Philip Roberts' JSConf EU 2014 boxes, CLRS's Figure 7.1 array, Bentley and McIlroy's 1991 `qsort`
   failure, Drepper's Pentium M latency table, Stroustrup's vector-versus-list measurement.
3. **Facts checked against the source, not memory:** spec text fetched and searched, source code read at the line,
   DOIs resolved on Crossref, papers read where they could be opened.
4. **No filler:** none of delve, crucial, robust, seamless, "it's worth noting", "in essence"; no softeners (just,
   very, really, simply, basically); no vague quantities (often, many, in practice) where a number or a source exists;
   no superlatives a source does not back.
5. **Keep what works:** chapters, step ids, predictions and misconceptions stay unless a change is a fix. The house
   voice (DESIGN.md, references/teaching.md) is the model.
6. **A teacher note for every chapter** (`teach: { prompt, listen, minutes }`): a question for the room, and what to
   listen for, grounded in the run.

## How it is checked

| | How |
|---|---|
| Sources | Every `[id]` cited exists in `lesson.sources`, every source is cited, every entry has id, title, by, year, url and supports (a script over the four lessons) |
| Facts | Each claim read at its source; the ones that could not be read (books, bot-blocked sites) are listed in the README's Checks |
| Words | verify's teaching lint (lengths, jargon, reading grade) at 0 warnings; a scan for the banned list |
| Nothing broke | verify on all 8 examples, the unit tests, before/after screenshots of the changed layers |
