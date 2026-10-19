# 05 · Share and teach: goals

Focus: the people who **teach with the page and pass it around**. A page that helps one person is a tool; a page
people project in a lecture, assign as homework, link to a classmate and embed in a course site is a product.

Branch `product/05-share-teach`. Baseline: main at `9c8b16d`.

## 1. Who, the job, and what success looks like

| Person | The job they hire the page for | Success, observable |
|---|---|---|
| **TA running a 50-minute section** | Project it, step with a clicker, stop on the prediction and ask the room, then switch to "One machine crashes". | From the laptop alone (presenter view) they can see what is on screen, what comes next, **that a question is coming before it appears**, the answer and what each wrong answer means, a prompt to put to the room, how long each part takes, and they can **switch story or chapter without walking to the projector**. They walk in with a printed plan. |
| **Student sharing a moment** ("look at step 14 in the hot-key scenario") | Send a link a classmate can open to that exact moment, with its story, step, level and parameters. | One visible control gives a link; opening it lands on step 14 of *One word is very common* with the same knobs, and the page **says so** ("This link opens at step 14…") instead of a generic start card hiding it. A bad or old link never breaks the page and says what it changed. |
| **Teacher assigning homework** | Hand out something to fill in, keep the answers apart, and have students show they did it. | A handout generated from the lesson: the goal, the picture, the words, every chapter's key steps with a frame of the run, every question with space to answer, the end check, **answers on their own page**. A teacher version adds the plan, talk prompts, wrong ideas and per-option feedback. Ctrl+P on the page prints that document, not a screenshot of the HUD. |
| **Blogger or course site** | Embed it, starting where their text is. | A copyable iframe snippet that starts at the current story and step, in the compact embed layout. |
| **Anyone making slides** | Grab this frame. | "Save image": a PNG of the world as it stands, with its tags, and the step's own words under it, named after the moment. |

Constraints that shape every choice: one offline file, works from `file://` and when hosted
(sites.irfanali.me), no server, **no network and no tracking** (nothing leaves the page; links carry only settings),
every number from the run, the lesson owns the words.

## 2. What "complete" means here

- **Discoverable**: sharing is one labelled control in the toolbar, not a hash format in the README. Teaching tools
  (presenter mode, presenter view, handout) are one click from it.
- **Round trip**: what the share link encodes is exactly what opening it restores (story, step, level, knobs), and the
  arrival says where you are and offers "from the beginning".
- **Edges**: unknown story, step past the end, a knob out of range or of the wrong type, an unknown knob, an unknown
  level, an old `#s=…&t=…` link, a `file://` page (the link only works on this computer: say so), a sandboxed or
  `about:srcdoc` frame (no URL to give), clipboard blocked (select the text instead). No new windows are needed for
  sharing or the handout, so pop-up blockers don't matter.
- **The moment after**: after copying, a clear "Copied"; after printing, the page is back exactly as it was; after
  the end check, the student has something to show.
- **Privacy**: nothing is sent. Copy and download use local APIs only; the dialog says so in one line.

## 3. Audit of the baseline (evidence)

| # | Gap | Evidence |
|---|---|---|
| A1 | **No share control anywhere.** Links exist only as a documented hash format (README "Deep links", `references/tooling.md`). A student cannot discover them. | Toolbar in every baseline shot: `Code · Settings · ☾ · ⛶` (e.g. the baseline shot `skew-light-1440x900-013-mid.png`). `engine/hud/hud.mjs:510`. |
| A2 | **A shared moment is hidden behind the generic start card.** `#s=skew&t=60` opens at step 11, but a classmate sees "Play / Step through it yourself" over a dimmed world, with nothing saying the link meant step 11. | `shots/extra/baseline-shared-link-start-card.png`; `engine/runtime.mjs:535` opens the intro whenever it hasn't been seen. |
| A3 | **Readable story + knobs loses the knobs.** `#scenario-skew&step-5&p=reducers:4` opens with 3 counting machines: the embed's `applyLinks` calls `setScenario`, which resets the values after the HUD already applied `p=`. | Probe: `{"s":"skew","v":3}` for `reducers:4`. `engine/embed/embed.mjs:173`, `engine/runtime.mjs:271`. |
| A4 | **Unknown knobs leak into the simulation.** `#p=nope:3` puts `nope: "3"` (a string) into the run's values. | Probe: `values: {…, "nope": "3"}`. `engine/hud/link.mjs:5`: `coerce()` returns the raw string when there is no definition. |
| A5 | **Bad links are silent.** `#scenario-nope&step-999` opens *Everything works* at its last step with no word; `reducers:99` is clamped silently; `#level-wizard` stays in the address bar, ignored. | `shots/extra/baseline-bad-link-silent.png`, probe output. |
| A6 | **The level is never in a link the reader can get.** The live hash (`#s=&t=&p=`) has no level, and it is rewritten only while playing or scrubbing. | `engine/hud/hud.mjs:2724-2736`, `:2861`. |
| A7 | **Printing prints the screen.** Ctrl+P gives the HUD and the start card; there is no print stylesheet. The plan promised generated handouts (`docs/next/PLAN.md` §4.3; `research/audit.md`: "Handouts / teacher guide … M6"). | `shots/extra/baseline-print-a4.png`. `hud.css` has no `@media print`. |
| A8 | **The presenter view doesn't warn of a question.** On the step before the prediction, "Next step" shows the *answer's* step ("map 0 is free, so the master hands it split 1") and nothing says "a question comes first: ask the room". | `shots/extra/baseline-presenter-view.png` (step 7 of 27; the ask is on step 8). |
| A9 | **No wrong-answer guidance for the presenter.** An open question shows the options and "Answer B", not what each wrong option means, though the lesson has per-option feedback with misconception ids. | `engine/hud/presenter-view.mjs:94-108`. |
| A10 | **The TA can't switch story or chapter from the laptop.** The presenter view shows the scenario name as text, and the chapter dots are not buttons. | `presenter-view.mjs:66,135`; `shots/extra/baseline-presenter-view.png`. |
| A11 | **No teacher notes, discussion prompts or timing.** Nothing for the TA to say between steps, and no "how long does this take": `lesson.mjs` prints `25 steps, 140 s at 1x` per story, but the page never tells a presenter. | the baseline `lesson.txt` story headers; the presenter view has a clock only. |
| A12 | **No image export for readers.** `shoot.mjs` and `record.mjs` are author tools; a reader making slides has only OS screenshots, which include the HUD. | `references/tooling.md` "record.mjs"; no export in `hud.mjs`. |
| A13 | **No embed snippet.** `?embed=1` and the postMessage API exist, but a blogger has to read `tooling.md` to write the iframe. | README "Embedding". |
| A14 | **No end-check record a student can show.** The check ends on "You can now…" (deliberately not a score), and nothing can be saved or printed. | `engine/hud/check.mjs:96-108`. |
| A15 | The embed at 800×500 opens on the full start card: fine, but a deep link into an embed would say nothing about the step (the same as A2). | `shots/extra/baseline-embed-800x500.png`. |

What already works and should be kept: presenter mode's projector type and contrast
(`shots/extra/baseline-presenter-projector.png`), the second window written from `about:blank` (it works from
`file://`), the clicker keys, the readable `#step-N` parser, and the postMessage/xAPI bridge.

## 4. Ideas, ranked (impact on the user against cost and risk)

| Rank | Idea | Impact | Cost / risk | Why it ranks here |
|---|---|---|---|---|
| 1 | **Share dialog** in the toolbar: a link to this moment (story, step, the level if wanted, the changed knobs), Copy, an honest `file://` note, a privacy line; phones get the native share sheet. | Very high: the student's job is impossible until they find it. | M; HUD only. | The most visible missing product surface (A1, A6). |
| 2 | **Moment links that round-trip and validate**: one parser for `#scenario-x&step-n&level-y&p=…` and the old `#s=&t=`, applied before the first compile; unknown or out-of-range parts dropped with a reason. | Very high: fixes two real bugs (A3, A4) and every edge (A5). | M; runtime + `deeplink.mjs` (DOM-free, unit tested). | A link that silently lies is worse than no link. |
| 3 | **Arrival card**: the start card says "This link opens at step 14 of 29", names the story and chapter, quotes the step, offers *Play from step 14* and *Start from the beginning*, and says what the link asked for that this page couldn't do. | High: closes the share loop (A2, A5, A15). | S–M; the start card. | Without it, 1 and 2 still land on a generic card. |
| 4 | **Handout and teacher guide**, generated from the lesson and the real runs of every story (no hand-written copy): a key frame per chapter rendered from the run, the questions with blanks, the end check, the answers on their own page; the teacher version adds the timing plan (true play times), the wrong ideas, per-option feedback and talk prompts. Previewed in the page; Ctrl+P prints it. | Very high for teachers (A7, A11, A14). Planned in PLAN §4.3. | L; a new module, print CSS, frame capture. | What teachers look for first in PhET-style guides (`research/audit.md`). |
| 5 | **The presenter view for a room**: "A question comes next: ask the room first" on the step before an ask; each option's feedback under an open question; clickable chapter dots; a story switcher; the chapter's talk prompt and play time. | High for the TA (A8–A11). | M; the presenter view only. | Presenter mode is the advertised teacher feature; this is its missing half. |
| 6 | **Talk prompts in the lesson** (`chapters[id].teach: { prompt, listen, minutes }`), merged like `about`, shown in the presenter view and the teacher guide. | Medium-high: the words a TA says, owned by the lesson. | S; `engine/scene/lesson.mjs`, `timeline.mjs`, the MapReduce lesson. | The engine must not invent words. |
| 7 | **Save image**: a PNG of this frame (the world cropped to its free area, the world tags, the step's words, a footer naming the story and step). | Medium-high for slides (A12). | M; needs a same-task canvas readback. | The reader's version of `shoot.mjs`, true to the run. |
| 8 | **Embed snippet** in the share dialog (an iframe at the current story and step, `?embed=1`, sized for the compact layout). | Medium (A13). | S. | Cheap once 1 and 2 exist. |
| 9 | **Check record**: after the end check, the handout's answer page can carry "Check: 2 of 3 right first time · basics · 18 Oct 2026", labelled self-reported. | Medium (A14). | S, but honesty matters: a static file can't prove anything. | Useful for honour-system homework; must not pretend to be proof. |
| 10 | A short clip export for readers (MediaRecorder on the canvas, one chapter). | Medium. | M–H: real-time capture, no captions, codec variance; `record.mjs` already serves authors. | Lower value per cost than a PNG. |
| 11 | A QR code on the handout or projector for the hosted link. | Medium in a room. | M: an in-file QR encoder for a minority case. | Deferred; a printed URL does most of it. |
| 12 | The live hash carries step and level all the time (address-bar sharing). | Medium. | S, but it changes reload behaviour for every reader and every other change in flight. | The share dialog covers it without surprising reloads. |
| 13 | SCORM zip or LMS gradebook export. | Medium for some courses. | H; out of scope for one file (`tooling.md` says so). | Not without a packaging step. |
| 14 | "Pause class" or multi-device sync for a room. | Low–medium. | Needs a server or WebRTC signalling. | Breaks "no server". |

## 5. The chosen set

Ideas 1–8, plus the cheap, honest part of 9 (the check result on the handout, labelled self-reported). Together they
make each persona's journey whole:

- **Student**: Share → Copy → the classmate opens it → arrival card at step 14 → Play from step 14.
- **TA**: print the teacher guide (plan, prompts, answers) → P → the presenter view warns of the question, shows the
  wrong-idea feedback, switches story → clicker.
- **Teacher (homework)**: Share → Handout → Student worksheet or Teacher guide → Print. Ctrl+P works too.
- **Blogger**: Share → Embed → Copy the snippet (it starts at this step).
- **Slides**: Share → Save image.

## 6. Deliberately not doing

- **Clip export, QR codes, SCORM, room sync** (ranks 10, 11, 13, 14): cost or a server outweighs the value now;
  listed under "Next" in CHANGES.
- **No analytics, no URL shortener, no upload** of any kind: privacy and offline are product features here.
- **Not changing the live `#s=&t=` hash writer** (rank 12): existing links and other work in flight rely on it; the share link
  is explicit and readable instead.
- **Not restyling presenter mode on the projector**: it is good (baseline shot); the work is on the laptop.
- **Not writing lesson words in the engine**: talk prompts come from `lesson.mjs`; the engine only lays out what the
  lesson and the run provide (play times are measured from the timelines).

## 7. What changed in my thinking (at the end)

- **Paper is a layout of its own, not the screen printed.** I first kept each chapter whole on paper. On A4 that
  pushed any chapter that didn't fit to the next page, left half pages empty and stranded story headings. On paper a
  chapter now flows, with its picture floating beside its words, and only its parts (a step, a question, a prompt, a
  picture) are kept whole. That gives 9 and 12 pages instead of 9 and 13, without the gaps. I judged it from the PDF
  pages, not the preview: the preview looked right throughout.
- **The arrival is the share feature's real product.** The panel is only half of the loop. What makes a link worth
  sending is that the person who opens it is told where they are, and that a broken link never strands them. Most
  of the edge-case work went there.
- **The presenter needs the question one step early, more than they need the answer.** On the baseline the answer was
  on screen. What was missing was the cue to stop and ask the room before the page asks. That cue, plus the wrong
  ideas behind each option, is what makes the view usable for teaching rather than just following along.
- **The share link should not carry the level by default.** A link carrying the sender's level would quietly change
  the classmate's level, which is a property of the reader, not of the moment. It is opt-in ("Use my level").
- **The native share sheet stays secondary.** It is offered only where it exists, on a hosted page. Copy works
  everywhere, including `file://`, which is how many teachers pass the file around.
- Still deliberately not done: clip export, QR codes, SCORM, room sync (section 6). They are ranked under "Next" in
  `CHANGES.md`.
