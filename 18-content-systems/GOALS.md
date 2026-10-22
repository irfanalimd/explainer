# Content: the systems examples' words

The user asked for the quality of the information to be much better: every example explained with the field's
famous, canonical examples, every fact checkable against a source, and plain language with none of the habits that
make text read as machine-written. This branch takes four examples: MapReduce, Raft, Consistent hashing and the
B+ tree. Text only: the simulation is untouched, and the words must still say what the deterministic run does.

## What "better" means here

1. **The canonical source, and its own examples.** Each concept has a paper the field learns it from: Dean &
   Ghemawat (2004), Ongaro & Ousterhout (2014), Karger et al. (1997) with Dynamo (2007), Bayer & McCreight (1972) with
   Comer (1979). Where the page's example is that paper's own (word count, URL access counts, Figure 6's log), it says so.
2. **Every real-world fact is checkable.** A layer that states a fact about a real system names its source as an id
   and a locator (`[dean2004] §3.6`), and `lesson.sources` lists each source with what it supports. The facts are read
   against the source itself, not recalled.
3. **No sloppy language.** None of the shared banned list (delve, robust, crucial, "it's worth noting", softeners
   such as just, simply, very, vague quantities without a number or source). Short, concrete sentences.
4. **Nothing lost.** Chapters, step ids, predictions and misconceptions stay; verify stays at 0 failing.

## How it is checked

| Check | How |
|---|---|
| Facts | Each quoted number and claim compared with the source's text: the papers extracted to text (USENIX HTML for MapReduce), docs and code fetched (PostgreSQL's nbtree README and nbtsplitloc.c, etcd's raft.go, Cassandra's docs and JIRA) |
| Links | Every source URL fetched; ACM and O'Reilly pages refuse scripts (403) but resolve in a browser |
| Language | A scan for the banned list over the lessons and the figures' printed text; then a cold read with `scripts/lesson.mjs` |
| Nothing broken | verify on all 8 examples, unit tests, before/after `lesson.mjs --all` diffs |

## Depends on

The `[id]` form in `deeper.source` is the shared convention for this round. Rendering it as a link (and linting
that every fact layer names a source) is the sources agent's branch. On this branch alone the Source row shows the
id and locator as plain text; merged with that branch it links to the source.
