# Teaching standard

A figure is a lesson before it is a picture. The engine makes it beautiful and true; this file makes it *teach*.
Every rule here is something a cold reader can check, and most of them `verify` checks for you (section 9).

Read this before writing `figure.mjs`. Fill in the lesson plan (section 2) first, in plain text, then build the run
that tells it, then write its words in `lesson.mjs` (section 5). Afterwards, read `node scripts/lesson.mjs figure.mjs`
as a beginner would (section 8).

Contents: [1 Reader](#1-know-the-reader) · [2 Plan](#2-the-lesson-plan-before-any-code) ·
[3 Words](#3-words) · [4 Size](#4-sizing-by-concept) · [5 In the figure](#5-where-each-part-goes) ·
[6 Linked list](#6-worked-example-a-linked-list) · [7 Before and after](#7-before-and-after-mapreduce) ·
[8 Rubric](#8-the-cold-read-rubric) · [9 Lint](#9-what-verify-checks) · [10 Why](#10-why-these-rules)

---

## 1. Know the reader

The default reader is a **curious beginner**. Write for them unless the user names someone else.

| They know | They do not know |
|---|---|
| Variables, `if`, loops, functions | The concept, or any word coined for it |
| Arrays / Python lists: a row of values, `a[3]` | Pointers, nodes, the heap, memory addresses |
| Dictionaries / maps: look a value up by key | Hashing, buckets, `% R` as a placement rule |
| That programs run on computers that talk over a network | Clusters, RPCs, replicas, leaders, quorums |
| Big numbers are slow, small numbers are fast | Big-O notation, logarithms, "amortized" |

Two consequences:
- **Start from what they know.** A linked list is explained against the array they already use; a hash table against
  a dictionary; consensus against a group chat that must agree on one plan.
- **Every new word is a debt.** Pay it the moment you use it (section 3), or do not use it.

If the user is an expert ("explain Raft's joint consensus to my team"), declare `meta.level: "deep"` and keep the
same structure: experts also learn faster from a question, a picture and a contrast.

## 2. The lesson plan, before any code

Write these seven things down (a comment at the top of `figure.mjs` is a good place). If one is hard to write, the
lesson is not ready; the code will not fix it.

1. **The learner's question (the hook).** The one question the run answers, in the reader's words, ending in `?`,
   under 25 words. It names a surprise or a tension, not a topic.
   - Yes: "Adding to the front of this list takes one step. Why does reaching the 5th item take five?"
   - No: "Linked lists" · "An overview of singly linked lists and their operations."
2. **The everyday picture (the analogy) and its mapping.** One familiar thing that behaves the same way, and an
   explicit table from its parts to the real parts. Say the mapping out loud in the first chapter's `about`. Pick
   a picture whose *mechanism* matches, not just its look, and say where it stops matching if that matters.

   | Everyday thing | Real part |
   |---|---|
   | a treasure-hunt clue card | a node ("box") |
   | the prize written on the card | the value |
   | "the next clue is under the bench" | the pointer ("arrow") |
   | the first clue, which you are handed | the head |
   | "this is the last clue" | null |
3. **The problem, shown before the solution.** The naive way first, run for real, and why it hurts: the array must
   shift every element to insert at the front; one machine would read the whole text alone; `hash % N` moves almost
   every key when a server is added. The reader must *want* the idea before it arrives.
4. **The ladder: chapters, one new idea each.** Each rung is one `s.phase`. Climb in this order, merging rungs for a
   simple concept and splitting them for a complex one:
   1. **What it is**: the parts, at rest, with their names.
   2. **The basic move**: the one operation, shown slowly, every sub-step its own step.
   3. **The payoff**: the move that the naive way could not do cheaply.
   4. **The cost or trade-off**: what it is bad at, shown, not stated.
   5. **What breaks**: the failure, the edge case or the classic bug (often its own story).
5. **The one misconception to correct.** The wrong belief a beginner is most likely to bring, and the step that
   disproves it. Put a predict question right before that step, so the reader commits to the wrong answer first.
   - Linked list: "it is an array with arrows drawn on it, so I can jump to item 5."
   - MapReduce: "the counting happens on one big machine at the end."
   - Quicksort: "the pivot is the median."
6. **The aha moment.** The single step where it clicks (two arrows changed, and the list of 3 million is updated).
   It is where the predict question goes, and the step whose caption you polish most. Keep it at full length
   (`s.step(caption, { keep: true })`).
7. **The recap.** 2–4 short lines, in the order the run showed them, that a reader could say back to you. Then the
   **takeaway**: the one sentence worth remembering.

Then choose the stories (scenarios): the happy path teaches the mechanism; each other story is a *what if* a learner
would actually ask ("What if I change the arrows in the wrong order?"), and shows why the design is the way it is.

## 3. Words

### Define every term at first use, beginner words first

Use the everyday word, then give the real name, then use either. Never the other way round.

- "each box keeps an arrow to the next box, called a {term:pointer}" (not "each node stores a next pointer")
- "a machine that reads one piece, a {term:mapper}" (not "each mapper processes its split")
- "the value everything is compared with, the {term:pivot}"

Mark the first use with `{term:name}` and give the plain definition in `meta.terms`. The word is underlined in the
HUD; its definition shows on hover, focus or tap, and the explain panel prints it under the words that first use it.
A definition is under 20 words, uses only words the reader already has, and does not use the word it defines.

```js
terms: {
  pointer: "an arrow that says where the next box lives",
  head: "the arrow to the first box: the only box we can reach directly",
},
```

An inline gloss counts as a definition too: "the TLB, a tiny cache of recent address translations".

### Flagged words

These words are flagged by the lint when they appear without a definition (the full list, with suggested plain
words, is `JARGON` in `scripts/lib/teach.mjs`): pointer, node, hash, partition, the shuffle, mapper, reducer,
combiner, straggler, skew, hot key, quorum, consensus, replica, shard, commit, RPC, heartbeat, latency, throughput,
idempotent, invariant, deterministic, amortized, asymptotic, logarithmic, O(n), recursion, pivot, in place,
permutation, TLB, MMU, page table, page fault, virtual / physical address, cache line, evict, LRU, microtask,
macrotask, call stack, fan-out, separator, virtual node, modulo, serialize, mutex, race condition, deadlock,
semaphore, dereference, heap, metadata, payload, checksum, linearizable.

The word may well appear: define it first. Also avoid:
- **Filler that tells the reader it should be easy**: obviously, clearly, simply, trivially, of course, note that,
  as we can see. Show the reason instead.
- **Symbols without words**: `%`, `⌈log2 n⌉`, `O(n log n)`, `→`. In code they are fine; in a sentence, say it
  ("the remainder after dividing by 2", "about 10 looks for 1,000 numbers").
- **Acronyms without their meaning**, and code names (`AppendEntries`) in prose: say what the message does.

### Captions: what happened, and why

- One event and its reason, **at most 18 words** (22 for a deep lesson), present tense, the event first. With a
  lesson file the event goes in `plain` (at most 14 words) and the reason, where one is needed, in `why` (5.2); the
  figure's caption stays as the fallback.
- "`28` is bigger than `19`, so we drop the right half: 4 places left." (what + why + the number that changed)
- Not "Compare a[4] with key." (no why) and not a paragraph (move the explanation into the chapter's `about`).
- Real numbers from the run; a number the reader cannot interpret needs its unit or its meaning.
- Repeated steps keep one shape, so they read as a rhythm and fold (SKILL.md).

### Chapter abouts

1–2 sentences, at most 40 words, **what the chapter does and why**, true in every story. No sentence over 25 words.
The first chapter's about carries the everyday picture and its mapping.

### Story labels, what-ifs and descriptions

The Scenarios picker is read before anything is explained, so it uses **no** flagged words at all. Nor do chapter
names: the scrubber shows every one of them from the first frame ("Copy the log", not "Replication").

| | Before | After |
|---|---|---|
| `label` (1–4 words, the situation) | Hot key · Straggler · Skewed keys · TLB miss | One word everywhere · One slow machine · A machine crashes · A new address |
| `whatIf` (finishes "What if…", the learner's question) | a straggler appears | one machine is much slower than the rest |
| `description` (one plain sentence) | A mapper crashes halfway through its split. | One reading machine crashes halfway, and its piece is read again elsewhere. |

### The hook

Plain text (the start card shows no markup), a question, under 25 words, no flagged words.

## 4. Sizing by concept

Declare the size with `meta.level`. It sets the lint's limits, and `"intro"` gives every caption 20 % more reading
time at 1×.

| | `intro` | `core` (the default) | `deep` |
|---|---|---|---|
| Concepts | linked list, stack, queue, binary search, a hash table, bubble sort | quicksort, MapReduce, B-tree, event loop, consistent hashing | Raft, a page walk, TCP congestion control, MVCC |
| Chapters | 3–5, slow | 4–6 | 5–8 |
| Stories | 1–3 | 2–4 | 3–6 |
| Knobs (besides seed) | 0–2 | at most 5 | at most 8 |
| Numbers in the dock | 1–2 | at most 3 | at most 3 |
| Predict questions | 1–2 | 1–3 | 2–4 |
| Captions | ≤ 18 words | ≤ 18 words | ≤ 22 words |

For a **simple concept** (intro):
- **Fewer, slower chapters.** One idea each; it is fine for a chapter to have three steps.
- **No clutter.** No knob that the lesson does not need (one for the list length is plenty), one or two numbers in
  plain words, no code panel unless the code *is* the lesson.
- **Every step of the first occurrence.** The first time a move happens, each sub-step is its own step at full
  length (`{ keep: true }`): make the box, point it at the old head, move the head. Later repeats may combine.
- **Contrast with what they know.** Run the familiar thing first (the array shifting six values) and then the new
  one (two arrows change), with the same numbers, side by side or as the first chapter.
- **The classic bug as a story.** "What if I change the arrows in the wrong order?" teaches more than a second
  happy path.

For a **complex concept** (deep): the same ladder with more rungs. Each rung still has one new idea; split the
protocol into its phases (elect, replicate, commit, recover), and let each failure be a story.

## 5. Where each part goes

A figure is two files. `figure.mjs` owns the truth: it runs the concept and names each step, chapter and question
with a stable id, passing the run's values as `vars`. `lesson.mjs` beside it owns the words, keyed by those ids. Its
templates print the vars; the lesson never computes. A step the lesson has no words for shows its inline caption, so
keep every caption true and short. `examples/mapreduce/` is the model to copy (`examples/linked-list/` for `intro`).

| Lesson part | Where it lives |
|---|---|
| Size | `meta.level: "intro" \| "core" \| "deep"` (also the reader's default level, 5.4) |
| Question | `meta.hook` |
| Goal, objectives | `lesson.goal`, `lesson.objectives: [{ id, text }]` (the progress map shows the goal) |
| Everyday picture + mapping | `lesson.picture: { name, rows: [{ id, picture, real, term? }], breaks }`; the full map on one chapter's entry card (`enter.picture: true`), a one-line picture on the steps that use it |
| Problem before solution | the first chapter or the first story: run the naive way for real |
| New words | `meta.terms` (plain definitions) and `lesson.terms: { name: { lead, def } }`; `{term:name}` at first use |
| One idea per chapter | `s.phase(name, { about, id })`; `lesson.chapters[id]: { about, enter: { sofar, now, done } }` |
| What happened, why, what to watch | `s.step(caption, { id, vars })`; `lesson.steps[id]: { plain, why, look, deeper, picture, key }` |
| Misconception, aha | `lesson.misconceptions: [{ id, wrong, fix }]`; `s.ask(question, options, answer, { why, id })` right before the revealing step; `lesson.asks[id].options[j]: { feedback, misconception }` |
| Your turn, in the world | `s.choose(id, { prompt, options: [{ pick, right }] })` at the decision; the wrong branch plays for real; `lesson.choices[id]: { prompt, why, wrong: { feedback, misconception } }` |
| End check | `s.check(id, { question, options, answer, chapter, vars })` with answers from the run's rules at other knob values; `lesson.checks[id]: { question, why }`; `lesson.objectives` become "You can now…" |
| What breaks | a scenario with a learner-language `label`, `whatIf` and `description` |
| The real scale | `s.scale({ … })` on the happy path's last step, numbers from the run or a cited source (`references/builder.md` section 11) |
| Recap, takeaway | `meta.recap` (2–4 lines), `meta.takeaway` (a scenario may have its own of each) |

### 5.1 The lesson file

```js
export const lesson = {
  goal: "Count every word of a text exactly, with machines that each read only part of it.",
  objectives: [{ id: "o-hash", text: "Explain why every copy of a word must reach the same counter." }],
  misconceptions: [{ id: "m-even", wrong: "Spreading the slips evenly is best.", fix: "Copies of one word would land on different counters." }],
  picture: { name: "a library counted by a team", rows: [{ id: "split", picture: "one shelf of books", real: "a split", term: "split" }],
             breaks: "Helpers would agree on who counts which word. Machines never ask: each one hashes the word." },
  terms: { split: { lead: "one piece of the text", def: "One piece of the input, read by one machine." } },
  chapters: {
    split: { about: "…", enter: { sofar: "You can count words with a loop and a dictionary.", now: "Cut the text into pieces.",
                                  done: "Every word sits in exactly one piece.", picture: true } },
    "split@skew": { about: "…" },                       // this scenario's own version
  },
  steps: {
    "split.cut": { key: true, plain: "The master cuts the text into {M} pieces of about {per} words.",
                   why: "Each piece can be read without the others, so all {M} machines start at once.",
                   look: ["{splitIds}"], picture: "split",
                   deeper: { how: "…", real: "…", source: "Dean & Ghemawat, OSDI 2004, https://research.google/pubs/pub62/" } },
    "map.read": { plain: "{map} writes a slip for each of its {count:count|word}.", look: ["{mapId}"],
                  first: { why: "That is the whole of map: nobody waits for anybody.", picture: "slip" } },
    "map.combine": { when: (v) => v.dups > 0, plain: "…" },   // only when the run makes this line true
  },
  asks: {
    "shuffle.where": { options: [
      { misconception: "m-even", feedback: "Even spreading would split {w}'s slips, and neither counter could give its full count." },
      { feedback: "Right. {w} always hashes to the same number, so every copy lands on {firstRed}." },
      { misconception: "m-central", feedback: "Then one machine would add up every slip, the very work we shared out." } ] },
  },
};
```

- **Templates** print the figure's vars by kind: `{n}` (a number as `1 234`, a string as text, `{ key }` as a chip,
  `{ ref, text }` as an entity chip, `{ code }` as code, a list as "a, b and c", `{ path }` as "a → b"),
  `{count:n|item}` ("3 items"; `{count:n|child|children}`), `{be:n}` ("is"/"are"). In `look`, `"{id}"` prints the
  raw id, and a list var expands to one id per item. Caption markup (`{term:…}`, `{key:…}`, `` `code` ``) passes
  through. Exact rules: `CONTRACTS.md` section 10.
- **`first`** replaces fields for the first step with that id (the first of a repeat carries the why); **`when`**
  skips an entry whose line is false at some knob values; **`x@story`** replaces `x` (a whole entry or one field) in
  that scenario.
- **Ids**: steps `chapter.verb-noun` (`map.read`, `insert.save-next`), shared by every repeat of a step; chapters
  and asks short and stable. Chapter titles stay in `s.phase(name)`: scenarios and forks find chapters by name.
- **Planned ids** (the curriculum skeleton, before the run exists) are empty entries, `"map.read": {}`: they fall
  back to the caption until the words are written, and verify notes any the run never reaches.

### 5.2 Writing the layers

| Layer | Holds | Rules |
|---|---|---|
| `plain` | what just happened | Every step. At most 14 words and 2 sentences, present tense, the real values. No O(·) at `intro`. |
| `why` | why it matters for the goal | Mostly per chapter: the entry card carries the chunk's purpose, so a step adds a `why` only where its purpose differs or defies intuition: the first time a move happens, the aha step, a misconception or failure step, the first of a repeat. Never on repeats. One sentence, at most 18 words, and it must not restate `plain`. |
| `look` | the entity ids to watch | One cue per step; every id exists at the end of the step. The world lights them, and on a key step the camera takes a detail shot of them. |
| `deeper` | the precise version, structured | `{ cost, how, code, edge, real, source }`, all optional, in that order: Basics shows the first present field as a one-line peek. `cost`: the complexity and the run's real count. `how`: the exact mechanism. `code`: the line, in a real language. `edge`: the case that breaks the simple story. `real`: where a real system does this. `source`: a URL, required when `real` makes a claim. At least one `cost` in the lesson, and one nuance a ten-year practitioner would not know. |
| `picture` | the picture row this step uses | Only on steps that use the analogy. There is no persistent analogy table under the steps: the full map appears once, on the parts chapter's entry card, with its "where it stops matching" line; after that a flagged step gets one inline line at New, and the map stays in the Words drawer. |
| `key` | `true` on the steps that carry the idea | Needs `why` (verify warns) and `deeper`. New holds after it; the camera frames its `look`. |

Chapters: `about` (1–2 sentences, at most 40 words, true in every scenario) and an `enter` card: **So far** (what the
last chapter showed, carrying its "but"), **Now** (the one new move), **You'll know it worked when** (what the reader
will see in the world).

Asks: right before the step that disproves a misconception, and only where the naive answer is wrong. Every option
gets its own feedback: a wrong option names the belief it holds (`misconception`), says what the run shows with the
run's values, and the right one gets a line on why. Every misconception is named by some option (verify warns). At
most one interaction per chapter, never two within 4 steps.

### 5.3 Words: term load and readability

- **At most 1 new term per step**, all levels. Per chapter at most 2 (`intro`), 3 (`core`), 4 (`deep`), except the
  one chapter that introduces the parts (the one whose entry card shows the picture map), which may hold 4 / 5 / 6
  if every term names an entity lit on that step.
- **Use it or lose it.** Each defined term reappears in at least 2 later steps, the first within 3 steps; otherwise
  do not introduce it.
- A label shown in the world counts as introduced at the step it appears: name it there.
- No forward references in any layer, `deeper` included (a Basics peek may not use a term defined only later).
- `lead` is the plain word the reader meets first ("an arrow"), `def` the definition (under 20 words, only words the
  reader has). Beginner words first, the real name second.
- **Readability.** Hard per-line limits above (`plain` 14 words, `why` 18, no sentence over 18). Pooled over the
  lesson, `plain` and `why` read at grade 7 or less (`intro`), 9 (`core`), 11 (`deep`). For New text, at least 95 %
  of content words are common words, the prerequisites or terms already defined.
- Never show the same words twice: `why` against `plain`, an entry card against its first step.
- `deeper` is about this step's mechanism; trivia is a seductive detail, so cut it.

verify enforces part of this (section 9: caption length, terms used before they are defined, jargon, the reading
grade, key steps without a why, misconceptions no option names). The rest is on the writer and the blind readers.

### 5.4 Levels

The reader picks a level in the panel header or on the start card; the default comes from `meta.level` (`intro`
opens at New, `core` and `deep` at Basics), and the choice is remembered. A level changes what is shown, never the
facts (`engine/hud/level.mjs`, `DESIGN.md` section 9):

| | New to this | I know the basics | Expert |
|---|---|---|---|
| Entry card | So far, Now, You'll know it worked when | the Now line | off |
| `about` | full | full | first sentence, then More |
| `why` | every step that has one | key steps; a Why toggle elsewhere | behind the Why toggle |
| `look` | a chip that pulses with the world | a chip | none (the world still lights) |
| `picture` | inline line on flagged steps | off | off |
| `deeper` | closed (Go deeper) | the first field as a peek, then More | every field open |
| Pace | 1.2× reading time; holds after each key step | 1× | 1× |
| Predict | a card | a card | "Think first": Predict or Skip |

So write every layer for its level: what a beginner must know goes in `plain` or `why`, the precise version in
`deeper`, and nothing true only in one layer contradicts another.

`s.ask`'s `why` (or the lesson's) is one sentence on *why* the right answer is right, from the run ("The list is in
order, so every number right of 28 is bigger than 28, and cannot be 19"). Write wrong options that a beginner would
really pick: the misconception, the naive guess.

### 5.5 Your turn

Watching is not doing. Two interactions let the reader act on the run (`engine/hud/turn.mjs`, `check.mjs`):

- **A pick in the world** (`s.choose`): at the decision the run pauses and the reader picks the *thing*, not a card
  option ("Click the counting machine that should get this `fox`"). A wrong pick plays its branch for real at 1×,
  narrated by the branch's own steps, and holds on the consequence. The card names the belief behind the pick (the
  option's `misconception`: "If you thought…") and what the run shows (its `feedback`); the transport's one way on
  rewinds the same branch to the pick. "Show me" appears after two wrong tries; a right first pick offers "See what
  the other pick does". The run never ends on the broken state. Make the wrong options the ones a misconception picks,
  and make the branch's last step say the consequence plainly, with its numbers.
- **The end check** (`s.check`): 1–3 questions when the main run ends, each answered from the run's own rules,
  ideally at other knob values (a transfer, not a recall of captions). Each answer shows its why; a miss offers
  "Replay <chapter>". It ends on "You can now…", the lesson's `objectives`, never a score: write objectives as
  things the reader can now do ("Explain why every copy of a word must reach the same counter").

**Caps** (verify warns past them; the HUD asks only the first): one question (`s.ask` or `s.choose`) per chapter, at
most 3 per story. The HUD keeps 3 at New, 2 at Basics, 1 at Expert, picks before predictions. Expert gets no
highlighted candidates (the list folds behind "Or pick from a list"). **Level nudges**: two right first tries at New
offer "I know the basics", a wrong pick at Expert offers the step-by-step version; one dismissible line, never an
automatic switch.

Every in-world pick has a keyboard and list equivalent: Tab or the arrow keys move through the candidates (each lights
its thing), Enter picks, and 1–9 pick by number. Phones get 44 px targets.

## 6. Worked example: a linked list

The full plan, as it would sit at the top of `figure.mjs`. `examples/linked-list/` is the reference intro figure built
from this standard; open it next to this plan.

```
Reader      knows Python lists / JS arrays, loops; has never seen a pointer or a memory address.
Level       intro
Hook        "Adding to the front of this list takes two changes. Why does reaching the 5th item take five steps?"
Picture     a treasure hunt. Clue card = node ("box"); the prize on it = value; "next clue is under the bench" =
            pointer ("arrow"); the clue you are handed = head; "this is the last clue" = null.
            Where it stops matching: the boxes live at real addresses scattered in memory, not in a row.
Problem     an array keeps values side by side, so putting 7 at the front shifts all 6 values one place right.
Ladder      1 Boxes and arrows    each box holds a value and an arrow to the next box; we hold only the head.
            2 Walking             to reach the 4th box, follow 3 arrows from the head. (the cost: no jumping)
            3 Add to the front    new box, point it at the old head, move the head: 2 changes, any length.
                                  (the payoff, against the array's 6 shifts)
            4 Insert in the middle  walk to the box before, copy its arrow into the new box, then re-point it.
            5 What breaks         re-point first and the rest of the list is lost: nothing points to it now.
Misconception "it is an array with arrows, so I can jump to item 5". Predict before chapter 2's walk:
            "How many arrows to reach the 4th box?" [0: jump straight there | 3 ✓ | 4]
            why: "Each arrow moves you one box along; from the 1st box, 3 arrows reach the 4th."
Aha         chapter 3: the head moves and a list of any length has its new first item. Predict:
            "The list has 6 boxes. How many values move when we add one at the front?" [6 | 1 | 0 ✓]
            why: "Nothing slides along: only the new box's arrow and the head change."
Stories     "Add to the front" (happy) · "Find the 5th box" (the cost) · "Arrows in the wrong order" (the bug,
            whatIf: "I change the arrows in the wrong order")
Words       node "one box of the list: a value and an arrow to the next box" · pointer "an arrow that says where
            the next box lives" · head "the arrow to the first box: the only box we can reach directly" ·
            null "an arrow to nothing: this box is the last"
Numbers     arrows followed (primary) · values moved (primary in the array contrast)
Knobs       list length (3–8). Nothing else.
Recap       1 Each box holds a value and an arrow to the next box.
            2 Reaching a box means following every arrow before it.
            3 Adding at the front changes two arrows, however long the list.
Takeaway    "A linked list trades instant changes at the front for slow trips to the middle."
```

The first chapter's about then reads: "Think of a treasure hunt: each card holds a prize and tells you where the
next card is. Each box here holds a value and an arrow to the next box, called a {term:pointer}."

## 7. Before and after: MapReduce

The existing MapReduce figure runs perfectly and is written for a CS student. The same run, narrated for a beginner
(the analogy: counting votes, where each polling station counts its own ballots and one counter per candidate adds
up the tallies).

**Hook**
- Before: "No machine ever sees the whole text. How does the cluster still count every word exactly?"
- After: "Five machines each see only part of the text. How do they still count every word exactly?"

**Chapter abouts**

| Chapter | Before | After |
|---|---|---|
| Split | The text is too big for one machine, so the master cuts it into splits, one per map task. Each split can then be read on its own, all at the same time. | One machine would read the text alone, word by word. Like ballots shared out between polling stations, the text is cut into pieces so several machines read at once. |
| Map | Each mapper reads its split and emits one `(word, 1)` record per word. Mappers share nothing, so they all work in parallel. | Each reading machine, a {term:mapper}, writes a slip for every word it sees: `(fox, 1)`. Nobody waits for anybody. |
| Shuffle | Each record goes to the reducer picked by `hash(word) % R`, where R is the number of reducers. Every copy of a word lands on the same reducer, so its counts end up together. | Every slip for one word must reach the same counting machine. A {term:hash} turns the word into a number, and that number picks the machine, so every `fox` lands in one place. |
| Reduce | Each reducer sorts its records so equal words sit side by side, then adds up each run of equals into a single total. | Each counting machine, a {term:reducer}, sorts its slips so equal words sit together, then adds each group into one total. |

**Captions**

| Before | After |
|---|---|
| A word-count job: 3 map tasks, 2 reduce tasks, 11 words of input | 11 words to count. Alone, one machine reads all 11; here 3 machines share them. |
| map 0 emits `(word, 1)` for each of its 4 words, keyed by the word | {ref:m0\|map 0} writes a slip for each of its 4 words, like `(fox, 1)`. |
| {key:the} goes to reduce 0 because `hash(the) % 2 = 0` (7 bytes) | {key:the} goes to {ref:r0\|reduce 0}: its hash number leaves remainder 0 (`hash(the) % 2 = 0`). |
| map 1 crashes after 2 of 4 words; what it emitted is lost with it | {ref:m1\|map 1} {tone:fail\|crashes} halfway: its 2 slips are lost with it. |
| The master re-runs split 1 on map 0; the input is still there, so nothing is lost but time | The text is still on disk, so {ref:m0\|map 0} reads piece 1 again: only time is lost. |
| Done: 8 distinct words, 11 counted, 85 bytes shuffled | Done: all 11 words counted, 8 different ones, and no machine read the whole text. |

**Stories**

| Before (`label` / `whatIf`) | After |
|---|---|
| Normal run / nothing goes wrong | Everything works / nothing goes wrong |
| Worker dies / a worker dies | A machine crashes / a machine crashes halfway through |
| Straggler / one machine is slow | One slow machine / one machine is much slower than the rest |
| Skewed keys / one key is everywhere | One word everywhere / one word is far more common than the rest |

**Recap** (new)
1. The text is cut into pieces, and each machine reads one.
2. A hash sends every copy of a word to the same counting machine.
3. Each counting machine adds up its words; together they hold every count.

**Takeaway** (kept, minus jargon): "No machine saw the whole text, yet every count is exact: every copy of a word
was sent to the same counter."

## 8. The cold-read rubric

Run this before delivery. Read `node scripts/lesson.mjs figure.mjs` top to bottom, once, **as the reader in section
1**, pretending you have never heard of the concept. Stop at the first line you would not understand from what came
before it, and fix it. Then check:

- [ ] The hook is a question I want answered, and the run answers it.
- [ ] The first chapter gives me a picture from everyday life and says which part is which.
- [ ] I see the naive way, and why it hurts, before the idea that fixes it.
- [ ] Each chapter has one new idea, and its about says what and why in two sentences.
- [ ] Every word I did not know was explained the first time I met it (beginner words first, then the name).
- [ ] No caption needs a second read; each says what happened and why, in 18 words or fewer.
- [ ] The first time the main move happens, I see every part of it, slowly.
- [ ] At least one question made me guess before I saw, right before the surprising step, and it said why.
- [ ] The misconception I would have brought is named and disproved by the run.
- [ ] The failure story is one I would ask about, and its name is in my words.
- [ ] The numbers in the dock are few and I know what each one means.
- [ ] Nothing on screen is there that the lesson does not use (knobs, numbers, code panel).
- [ ] The recap says back what I saw, in order; the takeaway is one sentence I could repeat tomorrow.
- [ ] Whatever option I picked, its feedback spoke to what I believed, with the run's values.
- [ ] Read at Expert (`node scripts/review-packet.mjs figure.mjs --out <dir>/review/packet --no-images` writes the
      New and Expert views as files), each key step's `deeper` says something precise and true, with a source.
- [ ] `verify` shows no teaching errors, and every remaining lesson and teaching warning has a reason.

## 9. What verify checks

verify loads `lesson.mjs` with the figure, so every run it makes (each scenario at its defaults, on a phone, and at
every knob extreme) also checks the lesson. These are **errors** in that run (kind `lesson`): a template var the
figure does not pass, a `look` id that does not exist at the end of its step, an unknown `picture` row, `deeper`
field or misconception id, and an ask whose option count differs from the figure's. Then a **lesson** section looks
across all the runs and warns about step ids with no `plain`, steps or chapters without an id, `key` steps without a
`why`, and misconceptions no ask option names; it notes (without counting) lesson ids no run reaches, which is fine
for a line only an untried knob value reaches (a very short input), and otherwise a typo.

`node scripts/verify.mjs figure.mjs` ends with a **teaching** section (skip it with `--no-teach`). It reads the same
lesson that `lesson.mjs` prints, at default params, every story from its fork. Then it checks the words the run shows
only at other settings (each knob at its extremes, and the phone layout: the runs verify makes anyway) for the same
defects: long captions and abouts, undefined `{term:}`s, flagged jargon, filler, malformed questions and jargon in
chapter names. Those findings start "at other settings", group captions by their shape, and never repeat a word the
default lesson's findings already name. `node scripts/lesson.mjs` prints the lesson and then the default findings.
With a lesson file, the captions it checks are the lesson's `plain` lines, the abouts and asks are the lesson's, and
the defined words are `meta.terms` merged with `lesson.terms`. It does not read the other layers (`why`, `deeper`,
entry cards): section 5's limits on those are for the writer, `lesson.mjs`'s printout and the blind readers.

**Errors** (clear defects; verify fails):

| rule | when |
|---|---|
| `terms` | a `{term:x}` with no `meta.terms.x`; a definition that is empty or not a string; `meta.terms` not an object |
| `ask` | a predict question with fewer than 2 options, or an answer index that is not one of them |
| `level` | `meta.level` is not `"intro"`, `"core"` or `"deep"` |
| `recap` | `meta.recap` (or a scenario's) is not a list of strings |

**Warnings** (advice; justify any you keep):

| rule | when |
|---|---|
| `level` | no `meta.level` (checked as core) |
| `hook` | no hook; not a question; over 25 words; markup in it |
| `analogy` | no everyday picture ("like", "think of", "imagine", "picture", …) in the hook, the first about or the first caption |
| `recap` | no recap; fewer than 2 or more than 4 lines; a line over 16 words |
| `takeaway` | none; over 30 words |
| `about` | a named chapter without an about; an about over 40 words |
| `caption` | captions over 18 words (22 for deep), reported once with the longest |
| `ask` | a question without `why`; no question at all (intro and core); too many in one story |
| `size` | chapters, knobs, dock numbers or stories over the level's limits (section 4); a knob marked `hidden: true` is not in the settings drawer, so it does not count |
| `terms` | a defined word used before its first `{term:}`; a defined word never marked; a definition over 20 words, circular, or using flagged words |
| `jargon` | a flagged word (section 3) used in a caption, about or question without a definition or an inline gloss |
| `labels` | a flagged word in the hook, a story's label, what-if or description, or a chapter name (the scrubber shows every name from the start); a label over 5 words |
| `tone` | obviously, clearly, simply, trivially, of course, note that, as we can see |
| `sentences` | sentences over 25 words in abouts, the hook, why, recap or takeaway |
| `grade` | the explaining prose (abouts, hook, why, recap, takeaway, descriptions) reads above grade 8 (intro), 10 (core) or 12 (deep), Flesch-Kincaid; a rough guide |

The lint is a floor, not the bar: a lesson can pass it and still not teach. The rubric (section 8) is the bar.

## 10. Why these rules

Each rule is a practical form of a well-tested finding about how people learn from words and pictures.

- **Pre-training** (Mayer): learners follow a process better once they know the names and roles of its parts. Hence
  chapter 1 "what it is", and terms defined before they are needed.
- **Segmenting**: a process learned in learner-paced pieces beats one continuous stream. Hence one idea per chapter,
  one event per step, chapter pauses, and full-length first occurrences.
- **Signaling**: cues that point at what matters (the lit tile, the underlined term, the why) reduce search.
- **Coherence**: extra material, however interesting, hurts learning. Hence few knobs and numbers for simple ideas.
- **Worked examples** and **concreteness fading**: a real, concrete instance first (11 actual words, 6 actual
  boxes), the general rule after (the about, the recap, the takeaway).
- **Misconception-first teaching** and **predict-observe-explain**: a learner who commits to a prediction and sees it
  fail revises their model; one who is told the answer often keeps the old one. Hence the question before the
  surprise, wrong options that are real misconceptions, and the `why` after.
- **Plain language** (the Feynman test): if it cannot be said in everyday words, it is not understood yet. Hence
  beginner words first, the real name second.
