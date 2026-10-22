# Writing standard

Every sentence a figure shows should read as if a careful teacher wrote it for one reader: plain, concrete, specific
and true to the run. This file is the standard for the words themselves, wherever they appear: the hook, chapter
abouts and entry cards, every layer of a step (`plain`, `why`, `deeper`, `picture`), questions, options and their
feedback, the end check, the recap and takeaway, the definitions, the teacher's notes, story names and the labels
printed in the world. `references/teaching.md` says what to teach and where each part goes; this says how to word it.

verify checks it (section 4) and `node scripts/lesson.mjs figure.mjs --style` lists every hit with its file, line and
a rewrite. The lint is a floor: a lesson can pass it and still say nothing. Read your words aloud.

## 1. The rules

1. **Say what happens, with the run's own numbers.** "map 1 writes 4 slips, one per word" teaches; "the mapper
   processes its data" does not. A claim without a number, a name or a reason is a claim the reader cannot check.
2. **One claim per sentence, subject first.** The thing that acts, then what it does, then why. Split a sentence that
   needs a second comma-clause to be understood.
3. **Cut words that inflate.** No word in the reader's text should be there to sound important. The list is in
   section 2; each entry has its replacement.
4. **Cut stock phrases.** "It's worth noting", "plays a key role", "at its core", "under the hood" (once per figure
   at most): each one delays the sentence that matters. Say the thing.
5. **No softeners or intensifiers.** basically, essentially, actually, really, quite, literally, an intensifying
   "very". "The very same address" is fine: it names one thing exactly. The teaching lint already flags the words
   that tell a beginner it should be easy (obviously, clearly, simply, trivially, of course, note that).
6. **A claim about real systems carries a number or a source.** "Many databases", "often", "in practice",
   "typically", "most systems" say nothing a reader can check. Name the system and give the figure: "PostgreSQL
   leaves the left page 90% full (the leaf fillfactor)". The `deeper` layers are where these claims live, and
   `deeper.source` says where the number comes from.
7. **Explain with statements.** A question belongs where the reader is asked: the hook, a prediction and its
   options, an in-world pick, the end check, and the teacher's prompt to the room. In a caption, an about or a
   deeper layer, a question makes the reader wait for an answer the next sentence gives anyway: give it.
8. **No rhetorical frames.** "Not just X, but Y", three praise words in a row ("fast, reliable and scalable"), and
   words that give the algorithm a personality (cleverly, elegantly, gracefully, magically). Make the one specific
   claim the run shows.
9. **Punctuation stays quiet.** Full stops, commas, colons and parentheses. No em dashes (the house style uses
   none: a comma, a colon or parentheses does the job), no exclamation marks, no emoji. An en dash joins a range:
   "150–300 ms", "bits 38–12".
10. **Say it once.** A `why` gives the reason; it never restates the `plain` line with other words. A sentence the
    reader has already met (in another step's layers, a recap, a takeaway) is a sentence they skip. Citations
    (`deeper.source`, `deeper.code`) may repeat at each step they back, and entry cards repeat what came before on
    purpose.
11. **Use the example the field uses.** When a concept has a canonical example (word count for MapReduce, the
    script, promise and timeout ordering for the event loop, a 5-server Raft cluster), use it, so the reader meets
    it again in the paper, the textbook and the talk; cite where it comes from.

## 2. Words to cut or replace

| Word | Write instead |
|---|---|
| delve, dive into, a deep dive | look at; or just start with the step |
| tapestry, landscape, realm, journey (figurative) | name the field, or say where it goes ("the slip travels from map 0 to reduce 1") |
| testament to, showcase, underscore | shows |
| unlock, unleash, harness, leverage, empower, elevate | use, let, raise (and say by how much) |
| seamless, seamlessly | drop it; if nothing pauses, say what keeps going |
| robust | say what it survives: "keeps working when one machine crashes" |
| crucial, pivotal, vital, paramount | drop it, or say what breaks without it |
| intricate, nuanced, multifaceted | say how many parts, or the distinction itself |
| myriad, plethora | the number |
| meticulous, holistic, synergy, transformative, groundbreaking, unparalleled, cutting-edge, game-changer, revolutionize, ever-evolving | drop it, or say what changed, with a number or a year |
| foster, bolster, streamline, supercharge, embark | helps, strengthens, simplifies, speeds up (by how much), starts |

Stock phrases: it's important to note, it's worth noting, in essence, at its core, in today's world, plays a key
(crucial, vital) role, a wide range of, navigate the complexities, let's dive in, here's the thing, the magic happens,
comes into play, that's where X comes in, the beauty of, at the end of the day, boils down to, in the world of, when
it comes to, needless to say. Sentence openers that add nothing: Moreover, Furthermore, Additionally, Notably,
Importantly, Ultimately, Interestingly, Crucially, Indeed, In conclusion, In summary, Overall. The full list, with
each rewrite, is `WORDS` and `PHRASES` in `scripts/lib/style.mjs`.

## 3. Before and after, from the examples

Each "before" is the examples' text when this standard was written; each "after" keeps every fact the run shows.

| Before | After | Rule |
|---|---|---|
| MapReduce story label: "One word is very common" | "One word is everywhere" | 5 |
| MapReduce takeaway: "The what-ifs test it with a crash, a slow disk and one very common word." | "The what-ifs test it with a crash, a slow disk and one word that fills most of the text." | 5 |
| MapReduce, skew takeaway: "counts stay exact, but a very common word loads that machine." | "counts stay exact, but a word that fills most of the text loads that one machine." | 5 |
| Consistent hashing, why: "Which keys now meet {extra} first on their clockwise walk?" | "The keys whose clockwise walk now meets {extra} first are the ones that move." | 7 |
| Consistent hashing, edge: "with millions of keys it lands very close." | "with millions of keys it lands close to it." | 5 |
| Linked list, plain: "{n} numbers side by side from {arr}. Where is the {findth} item?" | "{n} numbers side by side from {arr}; we look for the {findth} item." | 7 |
| Linked list, real: "Need fast inserts and fast lookups? Skip lists add express lanes over a linked list…" | "For fast inserts and fast lookups, a skip list adds express lanes over a linked list…" | 7 |
| Linked list, how: "For short arrays this is fast in practice: the bytes sit side by side, so the CPU streams them." | "For short arrays this is fast: the bytes sit side by side, so the CPU reads them in one stream." | 6 |
| Linked list, real: "so a 16-byte node really takes 32." | "so a 16-byte node takes 32." | 5 |
| Linked list, edge: "Measured, arrays often win anyway, even for inserts in the middle…" | "In Stroustrup's measurements (GoingNative 2012) an array beat a linked list for inserts in the middle at every size he tried…" | 6 |
| Raft, edge: "Why the blank `nop`? A new leader learns which older entries are final only once an entry of its own term is stored on a majority." | "The blank `nop` is there because a new leader learns which older entries are final only once an entry of its own term is stored on a majority." | 7 |
| Raft, how, in two steps: "Every update carries the leader's commit index." | Keep it at the first step; at the second say what is new there: "The follower applies every entry up to the commit index this update carries." | 10 |
| Virtual memory, edge: "…so a walk to a nearby page often reads only the last table." | "…in small paging-structure caches (Intel SDM Vol. 3A, §4.10.3), so a walk to a nearby page can read only the last table." | 6 |
| Virtual memory, edge: "that is how programs share library code and shared memory, often marked read-only." | "that is how programs share library code (mapped read-only) and shared memory." | 6 |
| Event loop, caption: "An `async` function, `load()`, called from a script. Where does await send the rest of it?" | "An `async` function, `load()`, called from a script. Watch where await sends the rest of it." | 7 |

And the patterns the list exists for, as they appear in machine-written explanations:

| Before | After |
|---|---|
| "Hashing plays a crucial role in seamlessly distributing keys." | "`hash(word) % 3` picks the server, so every copy of fox goes to the same one." |
| "Raft is a robust, reliable and elegant consensus algorithm." | "Raft keeps one log on five servers and still answers when two of them crash." |
| "Let's dive into how the event loop works under the hood!" | "The script runs to its last line before any callback starts." |
| "It's worth noting that B+ trees are often used in many databases." | "PostgreSQL's default index is a B-tree of Lehman and Yao's design: keys in the leaves, each leaf linked to the next." |

## 4. What verify checks

The writing lint (`scripts/lib/style.mjs`) reads every prose string in `figure.mjs` and `lesson.mjs` (not comments,
ids, keys, imports or the program listing in `export const code`), so it sees every layer, the teacher's notes, the
definitions and the labels the world prints. Chips, inline code and template slots are not read as words. Then it
reads the compiled lesson for repeats. Every finding is a **warning** for now, one per rule in verify's teaching
section, with the first locations and rewrites; `node scripts/lesson.mjs figure.mjs --style` prints all of them.

| rule | what | in |
|---|---|---|
| `words` | the words of section 2 | every prose string |
| `phrases` | the stock phrases of section 2; "under the hood" past its first use in a file | every prose string |
| `openers` | a sentence that opens with Moreover, Furthermore, Additionally, Notably, Importantly, Ultimately, … | every prose string |
| `hedges` | basically, essentially, actually, really, quite, literally, an intensifying "very", "just need" | every prose string |
| `contrast` | "not just X, but Y", "not only X but also Y" | every prose string |
| `tricolon` | three praise words in a row | every prose string |
| `fluff` | cleverly, elegantly, gracefully, beautifully, magically, effortlessly, brilliantly, ingeniously, smartly, neatly | every prose string |
| `punctuation` | an em dash, an exclamation mark, an emoji | every prose string |
| `questions` | a sentence ending in "?" | captions, `plain`, `why`, abouts, entry cards, `deeper`, feedback, recap, takeaway, definitions, descriptions |
| `vague` | many, often, typically, in practice, most systems, … with no number and no named source in the sentence | `deeper.real`, `edge`, `cost`, `how`, `source` |
| `repeats` | a `why` that adds at most one word to its `plain`; a sentence of 7 words or more said in two places | the compiled lesson |

Once the examples are rewritten to it, the `words`, `phrases`, `punctuation` and `repeats` rules are meant to become
errors.
