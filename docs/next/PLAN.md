# Explainer Next: the plan

Status: draft for discussion. Branch `next` (local only). **Nothing on this branch is committed or pushed** until the user says so.

This plan covers three things the user asked for:

1. **A teacher, not a narrator.** The explain panel on the right should teach like the best teacher you ever had. A first-timer should get it, and someone who has worked with the idea for ten years should still learn something.
2. **A rendering leap.** WebGPU, and the cinematic techniques it makes affordable, at the level of a product a $100M company would ship.
3. **Product polish for students everywhere.** That means accessibility, other languages, classrooms and embedding.

It ends with a research phase run by 3–4 subagents (Opus, medium effort), milestones, acceptance bars, risks and open questions.

---

## Build now (2026-10-16)

The user started implementation after the research (`docs/next/research/`). How it runs:
- **One branch, `next`.** No commits, no merges into main, no extra branches. Agents share the working tree and own disjoint files.
- **No tests** are written or run. Agents build and screenshot to judge the design.
- **Design is the first priority.** The HUD takes a crisp, restrained, typography-led direction in the spirit of ElevenLabs: lots of whitespace, a monochrome UI, hairline rules, pill controls, and colour only for data.
- **Subagents run on Opus at medium effort.**

What changes from the research:
- **Teaching** (`teaching.md`): the analogy map at the bottom of the panel is dropped; "why" is mostly per chapter; `deeper` gets fixed fields; and the lint thresholds are replaced.
- **Audit** (`audit.md`): a truth pass fixes the P0s now, and the cheap accessibility fixes move into M1.
- **Pipeline** (`pipeline.md`): the plugin layout serves both install paths, and the reviewer agents, review packet and hook move into M1.

| Agent | Owns (only these files) | Work |
|---|---|---|
| HUD design + teacher panel | `engine/hud/*`, `engine/runtime.mjs`, `engine/tokens.mjs` (HUD parts), the HUD section of `DESIGN.md` | the new design language across the whole HUD; the layered explain panel; level switch; progress map; chapter cards; accessibility fixes |
| Lesson data | `engine/scene/*`, `scripts/lib/lesson*`, `scripts/lesson.mjs`, `scripts/build.mjs`, `scripts/lib/modules.mjs`, `examples/linked-list/*`, the Lesson section of `CONTRACTS.md` | the `lesson.mjs` format, merged by step id, with templates; the linked list as the reference lesson; the linked list's P0 fixes |
| WebGPU | `engine/gfx/*`, `docs/next/research/rendering.md` | backend split, WebGPU backend at parity, select and fallback, then the first Prism 2 passes |
| Truth pass | `examples/*/figure.mjs` except the linked list | fix the audit's P0s (and cheap P1s) in the other 7 examples |
| Plugin | `.claude-plugin/`, `agents/`, `skills/teacher/`, `hooks/`, `SKILL.md`, `README.md` | the plugin packaging and agent files from `pipeline.md` |

---

## 0. Ground rules (unchanged from today, and non-negotiable)

- **Run it, don't draw it.** Every number and event on screen comes from a real, deterministic simulation. Fancier graphics never fake data.
- **One self-contained file.** A page works offline from `file://`. No CDN, no npm install, no server. WebGPU and WebGL2 code both ship inside the page.
- **Graceful fallback.** WebGPU where available, the current WebGL2 renderer everywhere else, and the DOM HUD and captions even with no GPU at all. No visitor ever sees a blank page.
- **Determinism.** `renderAt(t)` produces the same frame for the same `t`, on both backends (within a perceptual tolerance), so screenshots, video and tests stay exact.
- **The figure owns the truth, the engine owns the look.** The teacher layer adds a third owner: the **lesson**, which owns the words. Each part stays independently editable and testable.
- **Git hygiene.** When this work is eventually committed, it lands as one change per commit, authored as irfanalimd, with no AI credit anywhere.

---

## 1. Where we are: an honest audit

### 1.1 What is already strong

- **Real simulations, all tested.** 8 examples run real simulations and pass verify, which checks invariants on every step of every story at every knob extreme, plus a phone layout.
- **A distinctive look.** A zero-dependency WebGL2 renderer draws machined slabs, recessed wells, SDF text, soft shadows, bloom, an auto-directing camera and frosted-glass controls.
- **Teaching infrastructure now exists:**
  - a teaching standard (`references/teaching.md`) and a teaching lint inside verify
  - `scripts/lesson.mjs` (prints the lesson as text)
  - glossary terms, predictions with a why, a recap, and `meta.level`

### 1.2 What is still weak: the right-hand panel narrates, it does not teach

Read the linked list's lesson (`node scripts/lesson.mjs examples/linked-list/figure.mjs`). It is accurate and short, and it still fails both ends of the audience.

**For a first-timer**, it moves too fast and leaves gaps:
- **Chapter 2 introduces five new words in five steps** (node, address, pointer, head, null). That is a working-memory overload: the pre-training principle says to introduce the parts before the process, a few at a time.
- **Steps state what happens, rarely why it matters.**
  - "We want 42 right after 12." Why would anyone want that? There is no real-world reason: a playlist, an undo history, a text editor's lines.
  - "Start at the end: 23 slides one slot to the right." Why the end? Starting at the front overwrites the next value. That is the interesting part, and it's missing.
- **No orientation.** The panel shows the current chapter and step but never "here is where we are on the way to the answer". A newcomer can't see the shape of the lesson.
- **No "look here".** Captions name things, but nothing ties the words to the spot in the world the reader should look at, beyond the lit tiles.
- **Passive.** Predictions are multiple choice, at most 2–3 per figure. The reader never *does* the operation themselves.

**For an expert**, it has nothing to offer:
- No cost model (O(n) to find, O(1) to splice once you're there).
- No real-world nuance: linked lists lose to arrays in practice because of cache misses and pointer chasing; doubly linked lists; intrusive lists in the Linux kernel; free lists in allocators.
- No code beyond a small panel, no links to the canonical source, no edge cases (empty list, insert at head, insert at the tail without a tail pointer).

The same layer of text cannot serve both readers. Simplifying it further bores the expert, and adding depth to it overloads the novice. This is the **expertise reversal effect**: guidance that helps a novice hurts an expert, and the reverse. The fix is **layered content with progressive disclosure**, not a compromise text.

### 1.3 What is still weak: rendering

- **WebGL2 limits.**
  - No compute shaders, so many-particle effects, GPU layout and large-scale "zoom out to real size" shots are expensive or impossible.
  - Post effects are bounded by fill-rate tricks.
  - No refraction on glass (already listed in `references/roadmap.md`).
- **Scenes are small on purpose**, which is good for teaching. But the leap from 3 mappers to a 3,000-node cluster is only stated in words, never shown.
- **Motion is good but flat.** Packets glide; there is no motion blur, no light trails, and no "camera move with intent" between chapters (establishing shot, push in, reveal).

---

## 2. Track A: the Teacher

### 2.1 The idea in one paragraph

Every step gets a **layered explanation**, written by a dedicated teacher pass against the real run:
- **a plain line**: what just happened
- **a "why it matters" line**: how it moves us toward the goal
- **a "look at" pointer**: which thing in the world to watch, linked so hovering it lights the thing
- **a depth layer**: the precise version, with cost, real numbers, the code line, edge cases and sources

The reader chooses how deep to go: New to this, I know the basics, or Expert. The same lesson re-weights itself. Chapters open with orientation and close with a check. The reader *does* key operations, not just watches them. A team of teacher subagents writes the words and reviews them through two personas, a first-timer and an expert, before anything ships.

### 2.2 The new explain panel (design target)

```
┌ Insert ─────────────────────── 4 of 5 ┐
│ ● ● ● ◉ ○   Goal: insert without      │  ← progress map + the lesson's goal, always visible
│             moving anything            │
├────────────────────────────────────────┤
│ STEP 13                                │
│ 42 now points at 48.                   │  ← plain line (what happened)
│ That keeps the rest of the list        │  ← why it matters (toward the goal)
│ reachable before we touch 12.          │
│                                        │
│ ◎ Look at the arrow leaving 42.        │  ← hover lights it in the world
│                                        │
│ ▸ Go deeper                            │  ← expert layer (open by default at "Expert")
│   O(1): two pointer writes, whatever   │
│   the list's length. Order matters:    │
│   new.next = prev.next must come       │
│   first. In C: n->next = p->next;      │
│   p->next = n;  (code line 4 lit)      │
├────────────────────────────────────────┤
│ The picture: a clue (node) says where  │  ← analogy map; the row in play is lit
│ the next clue is (next).               │
└────────────────────────────────────────┘
```

**Panel parts, top to bottom:**

1. **Progress map and goal.**
   - The chapters as dots, with the current one ringed.
   - One line restating the lesson's goal (from `meta.hook`).
   - Clicking a dot jumps to that chapter.
   - On a phone it collapses to "Chapter 4 of 5 · Insert".
2. **The step, in layers.**
   - The plain line is always shown.
   - "Why it matters" is shown at New and Basics levels.
   - "Look at" is a pointer chip that lights the referenced entities on hover or tap. It reuses `{ref:}` plumbing, but as a first-class field, not inline markup.
   - "Go deeper" is collapsed for New, peeked (first sentence) for Basics, and open for Expert.
3. **Analogy map.**
   - A two-column table, "the picture" next to "the real thing" (clue ↔ node, where the next clue is ↔ `next`, the first clue you're handed ↔ head).
   - It sits at the bottom, and the row the current step uses is lit. It ties the everyday picture to the mechanism on every step, not just the first.
4. **Chapter cards.**
   - On entering a chapter: "So far: … Now: … You'll know it worked when: …" (3 short lines).
   - On leaving: a one-question check, or a "say it back" prompt with a model answer.
5. **Calm rules stay.** While a question is open, only the question shows (the rule shipped in `46b6d61`).

**The reader's level:**
- **The switch:** a three-way control (New to this · I know the basics · Expert) on the start card and in settings. Its default comes from `meta.level`, and it is remembered per viewer in localStorage.
- **What the level changes:**
  - which layers open by default
  - the reading pace (New reads at 1.2×)
  - the number of chapter checks
  - whether terms show plain words first or the real name first

  It never changes the facts.

### 2.3 Active learning: "your turn"

Watching is not doing. Add **interactive steps** where the reader performs the operation and the simulation checks it:
- **Choose-the-action.** At a decision point the run pauses and the reader picks in the world itself, not in a multiple-choice card. For example: "click the arrow you would change first".
  - Every option is a precomputed branch of the deterministic run (the scenario-fork machinery already exists), so a wrong choice *plays out for real*: the list gets lost, then rewinds.
  - This turns the "wrong order" story from something you watch into something you discover.
- **Fill-in steps (faded worked examples).**
  - The first insert is shown in full.
  - The second asks the reader to do one of the two writes.
  - The third asks for both.

  This is "concreteness fading" and the worked-example effect, done properly.
- **Predict-the-number.** "How many arrows to reach the 5th item?" with a numeric answer and a why.
- **Misconception-specific feedback.** Each wrong option carries its own explanation ("If you thought both orders work, here is what you'd lose…"), not one shared why.
- **Mastery check at the end.**
  - 3 questions drawn from the chapters, with feedback and a "replay that chapter" link for each one missed.
  - A short "you can now…" list of outcomes.

**Engine work for this:**
- `s.choose(id, options)`: a new pick UI anchored in the world. Hit-testing on 3D entities builds on the existing `pick` path in the renderer.
- Branch bookkeeping.
- `s.check(...)` for the end quiz.
- Verify must exercise every branch.

### 2.4 Lesson content as data: separate the words from the simulation

Today the words live inside `build()` as caption strings. To let a teacher pass rewrite them without touching the simulation, and to translate them later, introduce a **lesson file** beside the figure:

```
examples/linked-list/
  figure.mjs      // the simulation and the world (owns the truth)
  lesson.mjs      // the words (owns the teaching), keyed by stable step ids
  README.md
```

```js
// lesson.mjs (sketch)
export const lesson = {
  goal: "Insert into the middle of a list without moving anything.",
  objectives: [
    "Explain why inserting into an array moves items and inserting into a linked list does not.",
    "Perform an insert in the right order and say why the order matters.",
    "Say when an array is the better choice anyway.",
  ],
  prerequisites: ["variables", "arrays and indices"],
  misconceptions: [
    { id: "order", wrong: "Either order of the two writes works.", fix: "The first write must save the only copy of the next address." },
    { id: "fast", wrong: "Linked lists are faster than arrays.", fix: "Splicing is O(1), but finding the spot is O(n), and pointer chasing misses the cache." },
  ],
  picture: [
    { picture: "a clue", real: "a node", term: "node" },
    { picture: "where the next clue is hidden", real: "next, an address", term: "pointer" },
    { picture: "the first clue you're handed", real: "head", term: "head" },
  ],
  steps: {
    "insert.save-next": {
      plain: "42 now points at 48.",
      why: "That keeps the rest of the list reachable before we touch 12.",
      look: ["arrow:n42->n48"],
      deeper: "O(1): two pointer writes whatever the length. new.next = prev.next must come first. In C: `n->next = p->next; p->next = n;`",
      picture: "node",           // which analogy row to light
    },
  },
};
```

- **Figures name their steps:** `s.step(fallbackCaption, { id: "insert.save-next" })`. The engine merges the lesson by id and falls back to the inline caption, so the 8 existing figures keep working unchanged.
- **Templated, not frozen.** Lesson text can reference run values (`{n}`, `{addr:n48}`) so it stays true at every knob setting. The lint checks every template resolves.
- **Translation-ready.** `lesson.<lang>.mjs` files (see §4.2).

### 2.5 The teacher as part of the skill: a multi-agent lesson pipeline

The user asked for "skills within the project". The proposal is to ship the repo as a **Claude Code plugin** that bundles the `explainer` skill, a `teacher` skill, and agent definitions. The research phase confirms the exact plugin format and how agents ship with it (open question Q3).

**The pipeline `/explainer` runs:**

| Stage | Who | Output | Gate |
|---|---|---|---|
| 1. Curriculum | `curriculum-designer` agent | `lesson.mjs` skeleton: goal, objectives, prerequisites, misconceptions (researched from the canonical source and common student errors), the picture map, the chapter ladder | the objectives are testable; every misconception has a planned step |
| 2. Simulation | the builder (today's skill) | `figure.mjs` with stable step ids | verify: 0 failing |
| 3. Words | `teacher` agent | every step's `plain`, `why`, `look` and `deeper`; chapter cards; checks; feedback per wrong option | lesson lint clean |
| 4. Cold read, first-timer | `novice-reader` agent (persona: knows basic Python, never heard of the topic) | `review/novice.md`: every place they got lost, quoted, and a 1–5 score per chapter | no chapter below 4 |
| 5. Cold read, expert | `expert-reader` agent (persona: senior engineer or PhD in the area) | `review/expert.md`: every imprecision, oversimplification that becomes false, missing nuance, wrong number | no factual issue left open |
| 6. Revise | `teacher` | the updated lesson | personas re-run until both pass |
| 7. Look | today's shoot, audit and `--teach` | screenshots read by the lead | the visual checklist |

**Reviewer personas get only what a reader gets:**
- the lesson printed by `lesson.mjs`
- the key frames as images

They never see the source, so they judge the experience, not the intent.

**New quality gates in the lesson lint:**
- **Objective coverage.** Every objective is taught by at least one step and checked by at least one question.
- **Misconception coverage.** Every misconception has a step that confronts it, plus feedback on the wrong option that names it.
- **Term load.** At most 2 new terms per chapter at `intro`, and 3 at `core`.
- **Layers present.** Every step has `plain`. Key steps (those flagged `keep`, or the ones the asks sit on) have `why` and `deeper`.
- **Reading grade per layer.** The `plain` and `why` layers stay at or below grade 6. `deeper` may be technical, but its terms must be defined.
- **No forward references.** No layer uses a term before it is defined.
- **Every `look` id resolves** to a real entity at that step.
- **Templates resolve** at every knob extreme verify runs.

**A teaching benchmark, so "better" is measured, not asserted:**
- Twelve concepts across levels:
  - intro: linked list, stack, binary search, hash table
  - core: TCP handshake, B+ tree, CPU cache, DNS resolution
  - deep: Raft, garbage collection, virtual memory, transformer attention
- For each concept, a pre and post quiz of 5 questions.
- Simulated-learner agents take the quiz before and after reading the lesson transcript, and we track the gain. Simulated learners are a proxy: the real check is §4.5 user testing with students.

---

## 3. Track B: rendering ("Prism 2")

### 3.1 Why WebGPU, and what it actually buys

WebGPU now ships in Chromium browsers on desktop and Android, in Safari 26 (macOS and iOS), and in Firefox on Windows. The research phase must pin the exact current support matrix and the gaps: Linux, older iOS, Firefox on Mac and Android.

What it buys for this product specifically:

| Capability | Why it matters here |
|---|---|
| **Compute shaders** | Thousands of particles along traces (bandwidth you can *see*: a 4 KB message versus a 4 MB shuffle), GPU-side layout for big scenes, GPU sorting of transparent glass |
| **Storage buffers and instancing at scale** | "Powers of ten" shots: the 5-node example zooms out to a 5,000-node cluster or a 1M-key ring in one continuous move, rendered for real, so scale is shown, not just stated |
| **Better post-processing** | Temporal anti-aliasing for razor edges at any DPR, screen-space reflections on the glossy floor, ground-truth-style ambient occlusion, physically based bloom, filmic motion blur on fast packets |
| **Timestamp queries** | A real frame-time budget per pass, so the engine can drop effects to hold 60 fps |
| **Multisampled render targets and modern formats** | Crisper MSDF text, HDR all the way to tone mapping |

### 3.2 Architecture

The renderer already consumes a backend-neutral **DrawList** (`engine/gfx/skin.mjs` → `renderer.mjs`). Keep that contract and add a backend:

```
engine/gfx/
  skin.mjs              // poses → DrawList (unchanged contract)
  backends/
    webgl2/             // today's renderer.mjs + shaders.mjs, moved here
    webgpu/             // new: device, pipelines, WGSL, frame graph
  select.mjs            // feature detection, a user override (?gfx=webgl2), and loss/recovery
```

- **One frame graph** describes the passes (shadow, depth pre-pass, G-buffer or forward+, SSAO, SSR, transparency, bloom, TAA, tone map, grain). Each backend implements the passes it can. WebGL2 implements today's subset, so the look degrades gracefully.
- **WGSL shaders** are inlined as strings at build time, keeping the single-file build. A bundle-size budget keeps both backends together under about 2 MB.
- **Determinism in capture mode.** TAA jitter, particles and motion blur are seeded from `t`. `freeze(true)` gives the same frame twice. Golden-image tests per backend use a perceptual diff (SSIM threshold), run in headless Chrome with `--enable-unsafe-webgpu` where needed.
- **Performance tiers** chosen at runtime from a short timestamp-query benchmark:
  - Ultra: desktop discrete GPU
  - High: Apple M-series
  - Medium: mid-range phones
  - Lite: WebGL2

  Each tier has a written budget: about 8 ms of GPU time at 1440p for High.

### 3.3 Visual and motion upgrades (the "keynote" layer)

**Material:**
- glass with real refraction and thickness (queues and zones)
- subsurface-ish ceramic tiles
- anisotropic brushed-metal housings
- emissive LED diffusers
- a floor with sharp reflections

**Light:**
- area lights with soft contact shadows
- a slow, subtle studio light sweep between chapters
- per-chapter lighting moods: failure stories cool and dim, recovery warms

**Data in motion:**
- packets leave light trails sized to their bytes
- many small messages become a particle stream
- dropped messages shatter into particles that fade
- every effect is driven by the run's real events

**Camera direction:**
- a shot vocabulary per chapter (establishing → push-in → detail → pull-back), chosen by the director from chapter boundaries and step focus
- a "powers of ten" reveal at the end of chapters that the lesson marks `scale: true`

**Scale shots:**
- `s.scale({ from: "cluster", to: 5000, label: "a real cluster" })` runs a cheap aggregate model, not the full simulation, and says so on screen ("shown at scale, simplified")
- truthfulness rule: a scale shot never shows numbers the run didn't compute

**Sound (optional, off by default):**
- subtle, designed UI and event sounds (a soft click as a packet lands, a low tone on a crash)
- muted autoplay only; the viewer opts in

### 3.4 Not chosen, and why

| Option | Why not |
|---|---|
| three.js or Babylon.js | dependencies and bundle size; their look and API would fight the engine's own design language; the custom renderer is already ahead on the parts that matter |
| Ray tracing or path tracing | no hardware RT in WebGPU; a compute path tracer is too slow for a real-time teaching tool (fine later as an offline "render the video" mode) |
| Gaussian splats or NeRFs | nothing to capture; scenes are generated |

---

## 4. Track C: product polish for students everywhere

### 4.1 Accessibility

The bar is WCAG 2.2 AA for the HUD.
- **An "audio description" track:** every step's plain and why lines, read by the screen reader in order as the run plays. The `aria-live` plumbing exists; this makes it complete and designed.
- **A full keyboard path through the world:** tab to entities, read their state from the inspector, and make "your turn" choices by keyboard.
- **Reduced motion:** camera moves become cuts and particles become static arrows. Some of this exists today; the plan is to audit it against the new effects.
- **Colour:** identity colours are always paired with labels and shapes, and checked in deuteranopia and protanopia simulations.

### 4.2 Languages

Lesson files make translation a data task: `lesson.es.mjs`, `lesson.hi.mjs`, `lesson.zh.mjs` and so on.
- A `translator` agent writes them.
- A native-speaker review sign-off is the gate.
- The lint checks every step id is present in every language.
- The HUD chrome gets a small i18n table, with RTL layout support for Arabic and Hebrew.
- MSDF text atlases cover CJK and Devanagari through a per-language atlas built at build time.

### 4.3 Classrooms and courses

- **Presenter mode:** big type, a clicker (arrow keys or space), and the explain panel on a second window.
- **Embed mode:** a clean iframe build with a postMessage API for LMS integration (play, seek, events, quiz results), plus `#step-12` deep links.
- **Handouts:** a printable one-page summary per figure on the site: the picture, the steps, the recap, the quiz. Generated, not hand-made.

### 4.4 The gallery as a product

A proper site for the collection:
- topic maps ("prerequisites → this → what's next")
- difficulty badges
- per-figure "how this was verified" pages that show the invariants, citations and reviewer sign-offs

That last item is the trust signal PhD students will look for.

### 4.5 Real-user validation

- Five students per level (intro, core, deep) and two domain experts per deep topic.
- Think-aloud sessions on 3 figures, plus pre and post quizzes.
- Findings feed straight into the lesson lint rules and the persona prompts.

---

## 5. Research phase: 3–4 subagents (Opus, medium effort)

Before any build work, run four research agents in parallel. Each writes one report into `docs/next/research/` on this branch and changes no code.

**Setting the model and effort:**
- The Agent tool takes `model: "opus"`.
- Effort comes from the agent definition's frontmatter. Create `~/.claude/agents/explainer-researcher.md` with `effort: medium`, or reuse `internals-builder`, which is already medium.

| Agent | Brief | Deliverable |
|---|---|---|
| **R1 · Rendering** | Current WebGPU support matrix and known driver issues; which of §3's techniques fit the budget on M-series and mid-range Android; frame-graph design; determinism with TAA and particles; headless WebGPU in CI; bundle-size impact. Build a tiny benchmark page to measure, not guess. | `research/rendering.md` with a recommended pass list per tier, measured numbers and a prototype plan |
| **R2 · Learning science and teaching UX** | Expertise reversal, pre-training, segmenting, signalling, worked-example fading, retrieval practice, misconception-based instruction. Study best-in-class explainers (Ciechanowski, 3Blue1Brown, Brilliant, distill.pub, VisuAlgo, Seeing Theory, Khan Academy) for patterns that fit a run-it-don't-draw-it engine. | `research/teaching.md`: the layered-step schema, the panel design (with mocks), level-switch behaviour, and the "your turn" interaction patterns |
| **R3 · Teacher pipeline in Claude Code** | How skills, plugins and agents ship together; how a skill invokes subagents; persona-reviewer prompt design; how to stop reviewers from rubber-stamping (blind scoring, quoting evidence); the simulated-learner benchmark design and its limits. | `research/pipeline.md`: the plugin layout, agent definitions (drafts), the pipeline orchestration and the benchmark harness spec |
| **R4 · Audit and product** | Run all 8 current examples through a first-timer persona and an expert persona and list concrete failures per figure, with screenshots and transcript quotes. Separately, scope accessibility, i18n, embed and classroom features against what leading education products ship. | `research/audit.md`: the problem list per figure (prioritised) and a product feature list with effort estimates |

The lead (this session) reads all four reports and revises this plan. The user then picks what goes into milestone 1.

---

## 6. Milestones

Each milestone ends with a review by the user before the next one in its track starts. The tracks run in parallel (decision 1 in §9): after M0, Teacher (M1 → M2 → M3) and Rendering (M4 → M5) proceed side by side, and M6 waits for both. Commits are made only when the user asks, one change per commit.

| # | Milestone | Contents | Done when |
|---|---|---|---|
| M0 | Research | §5 agents, plan revised | the four reports have been read and the plan updated, user sign-off |
| M1 | Teacher core | `lesson.mjs` format and merge by step id; layered panel (plain, why, look, deeper); level switch; progress map; analogy map; chapter cards; lint gates; the linked list rewritten as the reference | linked list passes both personas at ≥4/5 per chapter; lint clean; a screenshot review of the panel at 1440, 1280 and 390 |
| M2 | Teacher pipeline | plugin packaging; curriculum, teacher, novice-reader and expert-reader agents; `/explainer` runs the pipeline end to end | a fresh `/explainer binary search` produces a figure whose lesson passes both personas without hand edits |
| M3 | Active learning | `s.choose` in-world picks with real branches; faded worked examples; per-option feedback; end mastery check | linked list "your turn" works by mouse, touch and keyboard; verify exercises every branch |
| M4 | WebGPU backend | backend split; WebGPU frame graph at parity with WebGL2; tiers; golden-image tests | every example renders on both backends within the SSIM bar; 60 fps on the High tier |
| M5 | Prism 2 look | materials, light, data-in-motion, camera shot vocabulary, powers-of-ten scale shots | side-by-side reel versus today, reviewed by the user |
| M6 | Rollout | all 8 examples migrated to lesson files and the new panel, accessibility pass, first two translations, gallery site refresh | benchmark gain recorded per figure; WCAG AA audit clean |

---

## 7. Acceptance bars

These are the "$100M" bar, written so we can check it.

- **First-timer:** a novice persona (and later a real student) can explain the core idea back in their own words after one run, and scores at least 4 of 5 on the post quiz.
- **Expert:** the expert persona finds no factual errors and learns at least one real nuance per figure in the depth layer.
- **Look:** every frame could be a keynote slide. There are no clipped labels, no overlaps and no text under the HUD, across 1440×900, 1280×720 and 390×844 in both themes, on both backends.
- **Performance:**
  - 60 fps on an M1 MacBook Air and 30 fps on a mid-range Android phone
  - first frame under 1.5 s from `file://`
  - page at most 2.5 MB
- **Trust:** every number is from the run; every scale shot is labelled; every figure cites its source and lists the invariants it proves.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Two renderers double the maintenance | one DrawList and one frame-graph description; WebGL2 frozen at its current feature set plus bug fixes |
| WebGPU driver bugs on some devices | runtime self-test at startup, with automatic fallback to WebGL2 and a manual override |
| Lesson layers drift from the simulation | templated text from run values; lint resolves every template at every knob extreme; stable step ids enforced by verify |
| Persona reviewers rubber-stamp | blind scoring, required quotes as evidence, a separate scorer agent, and real-student testing as ground truth |
| More panel content makes it busy again | strict calm rules, level-based defaults, every layer except `plain` collapsible; screenshot review at every milestone |
| Scope | milestones are independently shippable; the Teacher track ships value even if WebGPU slips |

---

## 9. Decisions and open questions

**Decided (2026-10-16):**

1. **Priority: both tracks in parallel.** The WebGPU backend (M4) starts alongside Teacher core (M1). The two tracks touch disjoint files: `engine/gfx/*` versus `engine/hud/*`, `engine/scene/*` and the lesson files. Each milestone is still reviewed on its own.
2. **Level switch default: `meta.level` decides.** Intro figures open at New, core and deep figures at Basics. The viewer's choice is remembered after that.
3. **Plugin packaging: yes.** The repo becomes a Claude Code plugin (explainer skill, teacher skill, agents). The README documents both install paths, and the old `npx skills add` line keeps working if R3 finds a way.
4. **Publishing: stay local.** Nothing from `next` is published until the user approves a milestone.

**Still open (not needed until M5–M6):**

5. **Languages.** Which first two translations matter most for the students you have in mind?
6. **Sound.** Do you want sound design at all, off by default?

---

## Appendix A: a before/after of one step (linked list, step 13)

**Today** (one layer, 18 words):
> First, copy 12's `next` into 42's. Now 42 points at 48 too.

**Proposed** (layered):

| Layer | Text |
|---|---|
| plain | 42 now points at 48. |
| why | That keeps the rest of the list reachable before we touch 12. |
| look | the arrow leaving 42 (hover lights it) |
| deeper | Two pointer writes, O(1) whatever the list's length. `new.next = prev.next` must run first: until then, 12's `next` is the only place 48's address exists. In C: `n->next = p->next; p->next = n;`. Doubly linked lists need four writes, and the same rule applies to each direction. |
| picture | "where the next clue is hidden" ↔ `next` |

## Appendix B: files this plan would add or change (estimate)

- **New**
  - `engine/gfx/backends/webgpu/*`
  - `engine/gfx/select.mjs`
  - `engine/hud/lesson-panel.mjs`
  - `engine/scene/lesson.mjs` (merge by step id)
  - `engine/scene/choose.mjs`
  - `scripts/lib/lesson-lint.mjs`
  - `scripts/bench-teach.mjs`
  - `agents/*.md`
  - `skills/teacher/SKILL.md`
  - `examples/*/lesson.mjs`
  - `docs/next/research/*.md`
- **Changed**
  - `engine/gfx/renderer.mjs`: moved under `backends/webgl2`
  - `engine/hud/explain.mjs`: becomes the layered panel
  - `engine/scene/builder.mjs`: step ids, `s.choose`, `s.check`, `s.scale`
  - `scripts/verify.mjs`: branches, lesson merge, templates
  - `SKILL.md`: the pipeline
  - `references/teaching.md`: layers, levels, active learning
