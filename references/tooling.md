# Tooling: scripts and the camera director

Everything here is Node built-ins plus headless Chrome over CDP: no installs, no network. Paths below are relative
to the skill root; every script also takes absolute paths and works from any working directory.

## The authoring loop

```sh
node scripts/doctor.mjs                                # can this machine make figures? one fix line per problem
node scripts/new.mjs ~/figs/raft                       # figure.mjs + lesson.mjs (commented templates) + README.md
node scripts/verify.mjs ~/figs/raft/figure.mjs         # headless checks, the lesson file included; fix until it exits 0
node scripts/lesson.mjs ~/figs/raft/figure.mjs         # the lesson as text: read it as a beginner would
node scripts/build.mjs ~/figs/raft/figure.mjs --serve  # live-reloading dev page, URL printed
node scripts/check.mjs ~/figs/raft/figure.mjs          # verify + build + shots + audit, then ~/figs/raft/check/report.html
node scripts/check.mjs ~/figs/raft/figure.mjs --full   # before shipping: both themes, every teaching card, audit on every step
node scripts/build.mjs ~/figs/raft/figure.mjs          # the shippable single file: ~/figs/raft/raft.html
node scripts/shoot.mjs ~/figs/raft/raft.html           # PNGs of every phase, both themes, desktop + phone, contact sheet
node scripts/audit.mjs ~/figs/raft/raft.html           # every step, both sizes: overflow, tags, focus, frame time
node scripts/record.mjs ~/figs/raft/raft.html --out raft.webm --captions
node scripts/review-packet.mjs ~/figs/raft/figure.mjs --out ~/figs/raft/review/packet --round 1   # the blind readers' packet
node scripts/review-check.mjs ~/figs/raft/review --round 1                                        # check their reports
```

Every script that runs a figure in Node (verify, lesson, review-packet) loads it with `loadFigure()` from
`scripts/lib/lesson-load.mjs`, which adds the `lesson.mjs` beside it (`{ ...figure, lesson }`). The page scripts
(shoot, audit, record) drive a built page, and `build.mjs` bundles the lesson into it; given a `figure.mjs` they
build it first. So the lesson is in every run, everywhere.

On Node 20 and 21, where the built-in WebSocket is behind a flag, the browser scripts (snap, shoot, audit, record)
re-run themselves with `--experimental-websocket` (`scripts/lib/websocket.mjs`); Node 22.4+ needs nothing.

`check` is the loop: it runs verify, build, shoot and (with `--full`) audit in one process and writes one report.
The scripts below are its parts, for when you want one of them alone.

All page scripts (shoot, audit, record) also accept a figure module directly (they build it to a temp page first)
or a URL. They exit 1 on page errors; audit and verify also exit 1 on any problem. Look at every PNG shoot makes,
starting with `contact.png`.

## doctor.mjs

`node scripts/doctor.mjs [figure dir] [--quick] [--json]`

Preflight, before any figure is written. One line per check, `ok`, `info`, `WARN` or `FAIL`, and under each problem
a `fix:` line for this OS (macOS, Linux, Windows):

- **node**: 20.10 or newer (module hooks and the built-in WebSocket; 22.4+ needs no flag). Written so an older Node
  can run it and say so.
- **skill**: the engine, the scripts and the Geist fonts the build inlines are where they should be; a second copy
  in `~/.claude/skills/explainer` beside the plugin is flagged.
- **temp**: the temp folder is writable and has room (a Chrome profile is about 150 MB while it runs). With a figure
  dir, that folder is writable too.
- **fence**: `node` is on the PATH the plugin's hooks see. Without it the reader fence cannot run, and it then blocks
  the fenced agents' tools (hooks/hooks.json) rather than letting them read unfenced.
- **ffmpeg**: optional; `.webm` needs nothing, `.mp4` and `.gif` need it.
- **machine**: cores, memory, load (a busy machine makes every estimate below longer).
- **chrome**: found (`CHROME_PATH`, the usual install places on all three OSes, the names on `PATH`, then the
  Playwright and Puppeteer browser caches), its version, and how it was found. Then, unless `--quick`, it starts
  headless the way the scripts do and reports **webgpu** and **webgl2** (software rendering such as SwiftShader is
  flagged: fine for checks, slow for screenshots) and **speed**: one settled 1440×900 render of MapReduce, the cost of
  a screenshot, with what that means for `shoot` and `shoot --teach`.

Exit 1 when something required fails; warnings and info do not fail. About 20 s with Chrome, under 1 s with
`--quick`. `--json` prints `{ ok, os, results: [{ status, name, detail, fix }] }`.

## check.mjs

`node scripts/check.mjs <figure.mjs> [--full] [--out dir] [--page file] [--no-shots] [--json]`

The golden path in one command: is this figure ready? Progress goes to stderr, one line per stage with the elapsed
time (`[0:11] verify   26 runs, 0 failing, …`), so a long run shows it is alive. Two tiers:

- **quick** (default, the authoring loop): verify (every scenario, knob extreme, branch, the lesson and the teaching
  lint), the stories' pacing straight from the compiled runs, `build` (the page lands where `build.mjs` puts it), then
  `shoot` of every chapter of every scenario in the page's own theme at 1440×900 and 390×844, with the runtime's audit
  on each shot and a contact sheet.
- **`--full`** (before shipping): the same in both themes, plus every teaching card (`shoot --teach`: predictions,
  picks, the end check and the end card) and `audit.mjs` over every step at both sizes.

It writes `<figure dir>/check/` (or `--out`): `report.html`, `report.md`, `check.json` and `shots/` with
`contact.png`. The page goes where `build.mjs` puts it, or to `--page` (to check a figure in a folder you cannot
write, such as a shipped example). The report is one self-contained page (fonts and JPEG thumbnails inlined, light and dark, no
network) in the HUD's own tokens:

- a **verdict**: "Needs work" with every problem, "Passes the quick check", "Ready for review" (`--full` passed, no
  blind review yet) or "Ready to ship" (`--full` passed and the latest review round passed its gate), and the next
  thing to do;
- a **scorecard**: Correct (verify), Teaches (the lint and the reading grade against the level's ceiling), Looks
  right (audit findings and page errors over every shot), Pacing (the first story's time to watch at 1x, the longest
  chapter), One file (size against the 2.5 MB budget) and Reviewed (the lowest novice chapter score and open findings
  from `review/round-N/scores.json`, when the teacher pipeline has run);
- **stories**: steps, time to watch (and from where a story splits off the first), a bar of each chapter's share,
  questions and picks;
- **findings**, grouped by source (verify, the lesson file, teaching, audit, page errors), each once, with where it
  was seen; and every **shot**, grouped as the contact sheet groups them, each linked to its full-size PNG.

`--no-shots` skips Chrome (verify, pacing and build only). Exit 1 when anything fails. Measured on a 4-core machine
with no GPU (SwiftShader) and other jobs running, on MapReduce: quick 5 min 17 s (80 shots), `--full` 75 min 22 s
(240 shots and teaching cards in 62 min, then the audit over every step in 13 min); with no other Chrome running,
quick takes about 3 min (shots 2 min 48 s). `doctor`'s speed line estimates
the shots for the machine at hand.

## verify.mjs

`node scripts/verify.mjs <figure.mjs> [--compiler file] [--quick] [--no-sample] [--no-teach] [--timeout 20] [--json]`

Runs in Node, the compile inside a worker thread, so an infinite loop in `build()` is reported (with the run that
hung) instead of hanging the caller. Checks, in order:

- **exports**: meta (title required; subtitle, kicker recommended; theme dark|light), params (type, label, value of
  the right type inside min..max, select options), scenarios (unique ids; a param name that is a near miss of a
  declared one is flagged as a likely typo; scenario-only settings are allowed), counters (formats), invariants are
  functions, `build` exists, and determinism smells in the source (`Math.random`, `Date.now`, `performance.now`,
  `new Date`).
- **runs**: every scenario at its defaults, the same on a portrait phone (`env` = 390×844, so a figure's phone layout is
  checked too), then every param at its extremes under every scenario (int/float min and
  max, bool flipped, select first and last; params a scenario pins are left alone), then the extremes combined on the
  phone: every param at its low end at once (bools off, selects first) and at its high end at once (bools on, selects
  last), where knobs that only misbehave together show up (Event loop's repaint count did). `--quick` runs defaults
  only.
- per run: compile; **determinism** (a second compile must give the same `tl.hash` and the same steps and final
  counters; the first differing step is named); **timing** (positive durations, contiguous steps, duration matches);
  **captions** on every step; `tl.problems` from the compiler (more than 3 of one kind collapse into one line);
  **invariants** on `tl.snapshot(i)` for every step and on `tl.final` (`snapshot(i)` is the state *after step i-1*,
  so a failure is reported as `fails after step 40 "<caption>"`, or `in the opening state`, plus how many other
  snapshots fail); **counters** used but not declared (error) and declared but never moving in any run (warning);
  **pacing** (warn above 400 or below 4 steps, or, as advice, a phase that takes longer than 150 s to watch at 1x with repeats sped up); a **sampler pass** (mid-step
  `tl.sample` must not throw, pose numbers and points finite, focus and world well formed, focus inside the world,
  tag anchors finite) and an **exact backward scrub** check.
- **the lesson in every run**: the figure is loaded with its `lesson.mjs`, so each run above merges it, and a
  template var the step does not pass, a `look` id that does not exist at the end of its step, an unknown picture
  row, `deeper` field or misconception id, or an ask whose option count differs is a `lesson` error in that run, at
  that knob value.
- **branches** (`s.choose`, CONTRACTS.md 10.5): in every run above, each wrong option of each pick is compiled at the
  same settings with `choices: { [id]: option }`, so every branch is checked at every knob extreme and on the phone.
  A branch gets the run's checks (determinism, timing, captions, `tl.problems`, invariants, the sampler and scrub
  pass) plus two of its own: `tl.branch` names the option it plays, and its steps before the pick read and start the
  same as the main run's (the HUD swaps it in there). Invariants run on branches too and decide for themselves:
  one that a wrong pick is meant to break excuses it with `({ timeline }) => timeline.branch` (MapReduce's "every
  word counted once"). Findings fold into the run's line, prefixed `in the branch where the reader picks "reduce 1"
  at shuffle.which:`, and the line counts them (`+ 1 branch`). A branch's steps count for the lesson's coverage, and
  its words get the teaching checks once per run ("at other settings", labelled `· branch id=option`).
- Identical findings in later runs are counted (`(+3 as above)`), not repeated, and so are findings that differ only in
  their numbers, the same mistake at other knob values (`(+1 alike)`).
- **Messages point at the line.** A param problem names its line (`params.mappers.value 9 is above max 6
  (figure.mjs:52)`); a determinism smell names the file (`figure.mjs:176: Math.random() …`); a syntax error in
  `figure.mjs` or `lesson.mjs` prints the line with a caret; a lesson problem repeated at every step folds into one
  line per step id with its `lesson.mjs` line and, for a template var the figure does not pass, the var it probably
  meant (`map.read at steps 3, 4, 5: plain uses {mapp}, which the figure does not pass; did you mean {map}?
  (lesson.mjs:156)`); a lesson id one typo from an id the run makes says so instead of two unrelated findings
  (`lesson.mjs:144: lesson.steps["map.raed"] names no step the figure makes: did you mean "map.read"?`); a caption chip
  naming an entity that does not exist folds per step id and suggests the id it probably meant. When `build()` throws,
  the error is reported once per run with its `figure.mjs` line, the source line and, for an undefined name, the one
  probably meant, and what follows from it (no steps, no captions, invariants on a world never built, the lesson and
  teaching sections) is left out until it runs to the end. A run that does not finish within `--timeout` is paused
  through the inspector and the line it is stuck on printed (`still running build() at figure.mjs:175, an endless
  loop?`).
- The summary's `failing` counts each run with an error, plus the exports, the teaching lint and a run that never
  finished, once each, so a param error or a hang never ends `0 failing`.
- **lesson** (its own section, when there is a `lesson.mjs`): across every run, warnings for step ids with no `plain`
  (they show the figure's caption), steps or chapters with no id, `key` steps without a `why`, and misconceptions no
  ask option names; and a `note`, not counted, for lesson ids no run reaches (a typo, a step the figure no longer
  makes, or one only an untried knob value reaches), including `lesson.choices` and `lesson.checks` ids no pick or end
  check uses. The header counts what the runs and branches reach: step ids, chapters, asks, picks and checks.
- **teaching** (its own section, last; `--no-teach` skips it): the lesson a beginner reads, extracted from every
  scenario at its defaults (`scripts/lib/lesson.mjs`) and checked by `scripts/lib/teach.mjs` against
  `references/teaching.md`. Errors only for clear defects (a `{term:x}` without `meta.terms.x`, a predict answer that
  is not one of its options, a malformed `meta.level`, `meta.terms` or `meta.recap`); everything else is advice:
  level, hook, analogy, recap, takeaway, abouts, caption length, predict questions and their `why`, size for the
  level, terms used before they are defined, flagged jargon, jargon in story labels and chapter names, filler words,
  long sentences and a rough reading grade. The words that appear only at other settings (the extreme and phone runs
  above, kept from their first compile, so no extra compile) get the same checks, reported once as "at other
  settings". A teaching error counts as one failing entry in the summary. The full rule table is
  `references/teaching.md` section 9.

An invariant receives `(snap, { step, final, params, scenario, timeline })` and must return `true` or a message;
`false` and `undefined` are reported as such (a forgotten `return` is the usual cause).

## lesson.mjs

`node scripts/lesson.mjs <figure.mjs> [--scenario id] [--params n=7,at=4] [--all] [--full] [--no-lint] [--json] [--width 100]`

Prints the lesson as plain text, story by story, so it can be read like a script: the hook, the defined words, the
numbers (`*` for the dock), then for each story its what-if and description, each chapter's name and about, every
caption (markup flattened; a term's definition in `[brackets]` where the run first uses it, as the explain panel
does), each predict question with its options, the answer (`✓`) and its why, then the recap and the takeaway. Then
the teaching checks (the same findings verify reports).

With a `lesson.mjs` it also prints the goal, the objectives, the picture map and the misconceptions (BELIEFS) up
top; each chapter's entry card (so far, now, done when); each step's id (`‹map.read›`), a `★` on key steps, and its
layers (why, look, picture, deeper fields); and each ask option's feedback with the misconception it names. Each
in-world pick (`s.choose`) prints as YOUR TURN with its options, and every wrong option is compiled as the real branch
of the run it is, so its line shows what it `plays:` (the step it ends on) and its feedback. Each story ends with its
END CHECK (every `s.check` question, its options, answer, feedback, why and the chapter a miss replays) and the
objectives its "You can now…" lists.

- `--params n=7,at=4` sets knob values for every story (numbers, `true`/`false`, strings), so a template can be read
  at a knob's extremes, as verify runs it.

- A run of steps with one caption shape shows two, then "… 6 more like this (steps 14–19)"; `--all` shows every step.
- Later stories start where they leave story 1 (as the page does on a switch); `--full` prints them from step 0.
- `--json` prints `{ figure, lesson, findings }`; with `--all --no-lint` it is the run a lesson writer works from (every
  step id, its caption and its layers). Exit 1 when the teaching checks find an error.

## build.mjs

`node scripts/build.mjs <figure.mjs> [--out page.html] [--theme dark|light] [--runtime file] [--dev] [--serve] [--port 5173] [--quiet]`

- Collects the module graph from the figure and `engine/runtime.mjs` (or `--runtime`) by following static
  `import … from`, side-effect `import "…"`, `export … from` and literal `import("…")`. A small JavaScript lexer
  does the scanning, so imports inside strings, template literals (a figure's `code` export), comments and regexes
  are never touched. Unresolvable imports fail with `file:line` and a hint (a missing `.mjs` extension, a bare
  package name).
- Specifiers become bare names in an import map of plain-text `data:text/javascript,` URLs (only `%`, `#` and control
  characters percent-escaped, a quarter smaller than base64; the `@internals/` prefix is an internal
  name kept from before the skill was called Explainer): skill files are `@internals/<path in the
  skill>`, the figure is `@internals/figure`, files outside the skill (a figure's own helpers) are
  `@internals/local/<path from the figure>` (no absolute paths leak into the page). One file has one specifier, so
  one module instance, however it was imported (relative, absolute path, `file://` or `@internals/<path>`).
- Every module goes in without its comments and indentation (`minify` in `scripts/lib/modules.mjs`: the same lexer
  keeps every token byte for byte, a figure's `code` template included, and every line break that ends a statement),
  and `hud.css` without its comments and runs of whitespace (`minifyCss`). The dev page serves the sources as they are.
- Figures can live anywhere. They may import the skill by relative path, absolute path, or `@internals/<path>`
  (Node resolves that too in verify and build, through `scripts/lib/node-hooks.mjs`).
- Inlines Geist and Geist Mono as base64 `@font-face` (variable, weights 100–900) and `engine/hud/hud.css` (its
  relative `url()`s inlined too). Root markup `<div id="ix" class="ix" data-theme>` + `<canvas class="ix-canvas">`
  fills the viewport; `<title>` from meta.title, description from meta.subtitle, theme-color and color-scheme from
  the theme, viewport `width=device-width, initial-scale=1, viewport-fit=cover`. The boot module is
  `window.__ready = mount(document.getElementById("ix"), figure, { theme })`. Output is byte-deterministic. Works
  from `file://`.
- Default output: `<figure dir>/<title-slug>.html`. Prints the size split into modules, fonts and CSS.
- Warns about `import.meta` in the figure or its own modules (data: URLs cannot locate assets); engine modules guard
  their fallbacks and are not flagged.
- `--dev` writes `<slug>.dev.html` that references source files over http (served by serve.mjs, live reload
  client included). `--serve` does that, starts the server with the figure's folder allowed, rebuilds the page
  when the figure changes, and prints the URL.

## Embedding and deep links (`engine/embed/`)

A built page is also an embed. `?embed=1` gives the iframe chrome (no full screen, a smaller title; designed for
800×500 and up). Framed pages speak a postMessage API, shaped for an LMS:

```js
// host → figure (validated; a message with an id is answered { type, version, event: "ack", id, ok, error? })
frame.contentWindow.postMessage({ type: "explainer", version: 1, command: "seek", value: 12.5, id: 1 }, figureOrigin);
//   play | pause | seek (seconds) | step (1-based) | scenario (id) | level ("new" | "basics" | "expert") | theme ("light" | "dark")
// figure → host: { type: "explainer", version: 1, event, statement }
//   ready (initialized) · step (progressed, cmi5 progress %) · chapter (experienced) · ask-answered (answered:
//   success, response; picks report every try, the first try scores) · complete (completed: score over the questions asked)
//   statement = an xAPI statement without an actor (the host adds it): { verb, object: { id: "urn:explainer:<id>#step-12" }, result, context, timestamp }
```

- Origins: `?origin=https://lms.example,https://other.example` or `meta.embed.origins` (`"*"` allows any). With
  neither, only the parent window may drive it (a console warning says so once) and events go to the parent's origin.
- The figure's IRI is `meta.embed.id`, else `urn:explainer:<meta.id or title slug>`.
- Deep links, embedded or not: `#step-12`, `#scenario-crash`, `#level-expert`, `#p=reducers:4`, joinable
  (`#scenario-crash&step-4&p=reducers:4`), and the HUD's own `#s=crash&t=12.4&p=…`. The runtime opens the moment
  (`deeplink.mjs`: `parseMoment` → `resolveMoment` against the figure → `resolveStep` in the compiled run): the story,
  knobs and level before the first compile, then the step, which lands on the step's start, like Back. Anything the
  page cannot use (an unknown story, knob or level, a value out of range or of the wrong type, a step past the end) is
  dropped or clamped and said in a note on the start card. The hash is then rewritten in the HUD's spelling so a
  reload opens the same moment. Later hashes (hashchange, or a host setting the frame's hash) go through
  `__internals.openMoment(hash)`. The share panel writes links with `formatMoment`. LTI 1.3 needs a server, so it is out of scope for the file; a SCORM zip is the later
  static route to gradebooks.

## serve.mjs

`node scripts/serve.mjs [--port 5173] [--root dir] [--allow dir]... [--no-live]`

Static server for the skill. `/__live` is a server-sent-event stream: one message per changed file
(`fs.watch` recursive, debounced; dotfiles, `node_modules`, `shots/`, `frames/` and non-source files ignored).
Dev pages reload on module changes, hot-swap stylesheets on CSS changes, and reload when the server restarts.
`/@fs/<absolute path>` serves files outside the root inside an `--allow` folder. Modules that import by absolute
path, `file://` URL or `@internals/<path>` are served with those specifiers rewritten to this server's URLs (so
there is one instance per module); everything else is served byte for byte.

## shoot.mjs

`node scripts/shoot.mjs <page | figure.mjs | url> [--at phases|all|steps|none|<list>] [--teach] [--themes dark,light] [--sizes 1440x900,390x844] [--scenario id|all] [--out dir] [--dpr 1] [--camera settled|auto] [--clean] [--no-sheet]`

- `--at phases` (default): mid-phase and end-of-phase for every phase. `all`: mid and end of every step. `steps`:
  end of every step. A list mixes step indices (mid and end), times (`12.5s`) and `end`: `--at 0,7,12.5s,end`.
- Deterministic: `freeze(true)`, CSS transitions and animations jump to their end, then `renderAt(t, { camera:
  "settled" })` for each shot. Files: `<scenario>-<theme>-<w>x<h>-<step>-<mid|end|tN.NNs>.png` in `--out`
  (default `shots/` beside the page), plus `contact.png` (grouped by scenario, theme and size, each thumbnail
  captioned with step, time, phase and caption; split into `contact-2.png`… past 14000 px). PNGs use Chrome's fast
  encoding: the same pixels as its default one, about a third larger, and 0.4 s less a 1440×900 shot.
- Runs `__internals.audit()` after each shot and reports page errors (console errors, exceptions, failed loads)
  and audit problems grouped by finding, with the steps and shots where each occurs.
- Size presets: `desktop` (1440x900), `phone` (390x844), `1080p`, `720p`, `vertical`, `square`. Use `--dpr 2` to
  judge text crispness.
- Progress on stderr, one line per group with its time (`[3:12] shot 1440x900 crash dark: 10 frames (41 s)`);
  `--quiet` turns it off. stdout keeps the report.
- `--teach` adds the teaching cards, which frozen capture never shows (it drops pauses and predictions). After the
  phase shots it plays the page live, on its own tab, in every theme, size and scenario:
  - each predict question, asked (`<scenario>-<theme>-<w>x<h>-<step>-ask.png`), then answered with the first wrong
    option and revealed with its why (`…-<step>-why.png`). A question in the shared opening of several stories is shot
    once per theme and size.
  - each pick (`s.choose`): played to, then the first wrong option picked; its branch plays (at 4×) to its
    consequence and is shot as the detour with its feedback card (`…-<step>-wrong.png`); the transport's Rewind takes
    it back to the pick, the right option is picked and shot with its why (`…-<step>-right.png`). A pick that never
    opens, never holds, or never comes back is reported and the page is scrubbed back out of the branch (a branch
    never reaches the end card), so the run never stalls.
  - the end check, its first question answered with a wrong option on purpose and shot with its feedback
    (`…-<last step>-end-check.png`), then every question answered through to "You can now…" (`…-end-cannow.png`);
  - the end card, scrolled to the recap, takeaway and what-ifs (`…-<last step>-end-card.png`). On a narrow screen,
    where the caption carries the takeaway, `…-end-caption.png` first, then the Explain card opened from it.
  Live play runs at 16× between cards (the questions, picks and pauses still stop it at their own step) and every wait
  is four times its nominal length: the runtime caps a frame's step at 1/20 s, so with slow frames (software rendering
  on a loaded machine) 1× play would crawl and time out.
  The shots join the contact sheet; a question or pick that never opens or reveals is reported as a page error, and
  a page that stops answering ends that story's live play with an error instead of hanging the run. Progress goes to
  stderr, one line per group (`--quiet` turns it off). Live play takes a few seconds a card on a machine with a GPU;
  times on a machine without one are in the Known gaps. `--at none --teach` shoots the cards alone.

## audit.mjs

`node scripts/audit.mjs <page | figure.mjs | url> [--sizes 1440x900,390x844] [--themes …] [--scenario all|id] [--at all|steps|phases|<list>] [--budget 16] [--a11y] [--json]`

Renders mid and end of every step of every scenario at each size (settled camera) and collects
`__internals.audit()` (label overflow, tags off-screen, focus outside the frame, whatever the runtime checks) plus
page errors and a frame-time warning from `__internals.stats().ms`. One line per distinct finding with the steps,
the first step's caption and where it was seen. Problems with `level: "warn"` do not fail. Exit 1 on problems or
page errors.

`--a11y` also measures the interface against WCAG 2.2 AA in every frame (`scripts/lib/a11y.mjs`), one line per
component with the worst value seen:
- `a11y-contrast`: each line of HUD text against the pixels actually behind it (the frame is shot again with the
  HUD's glyphs transparent, so plates, halos and the world stay), 4.5:1 or 3:1 for large text, with the two colours.
  Text clipped out of view or in a scroll edge's fade is judged once it is scrolled in. The ink is read from the
  computed colour in any form Chrome gives it (`rgb()`, and `oklab()`, `oklch()` or `color(srgb …)` for a
  `color-mix()`); a colour it cannot read is left unjudged, never taken as black. Text and controls under an open
  panel or sheet are not what the reader is shown, so they are not judged until it closes.
- `a11y-target`: controls under 24 × 24 px that crowd another control (inline chips in a sentence are exempt).
- `a11y-name`: buttons, links, inputs and widgets with no accessible name.
- `a11y-focus`: controls that show nothing when focused from the keyboard.

The probe is injected, so it measures any built page, an older build included. `--at phases --themes light,dark` is
a quick pass (about 160 frames).

## record.mjs

`node scripts/record.mjs <page | figure.mjs | url> --out <x.webm | x.mp4 | x.gif | dir/> [--fps 60] [--size 1920x1080] [--from s] [--to s] [--speed 1] [--tail s] [--scenario id] [--theme t] [--captions] [--chrome] [--bitrate Mbps] [--keyint 2] [--workers n] [--lossless] [--poster x.png] [--no-check] [--allow-download]`

- Frame by frame: `freeze`, then for each frame `renderAt(t)` and a screenshot. The first frame uses the settled
  camera, later frames `"auto"` so camera moves are the real springs.
- **.webm** needs nothing: frames go to a WebCodecs `VideoEncoder` (VP9, VBR, ~0.1 bit per pixel per frame,
  keyframe every 2 s) in another headless tab through a local HTTP server, and `scripts/lib/webm.mjs` muxes the
  chunks into a seekable WebM (Info with Duration, Cues, colour metadata from the encoder). Afterwards the file
  is loaded back into a `<video>` in Chrome: duration, size, playback and a seek are checked (`--poster` saves the
  decoded middle frame). `--no-check` skips that.
- **Parallel**: `--workers` (default min(4, cores/2), at least 2 s of video per worker) split the range into
  chunks, each captured by its own page after an 8 s render-only pre-roll, so the camera springs reach the chunk
  with the same state as a sequential pass (measured: pixel-identical frames at every chunk boundary). Each chunk is
  its own VP9 stream starting on a keyframe; the muxer concatenates them. About 33 frames/s at 1080p with 4
  workers on an M5 (screenshots are the cost; 1 worker is about 15).
- **.mp4 / .gif** use ffmpeg from PATH (frames are written to a temp folder, then encoded: H.264 CRF 16 yuv420p
  BT.709 with faststart, or a two-pass palette GIF, 30 fps by default). Without ffmpeg it stops and says how to
  get it; it downloads `ffmpeg-static` with npm (into `~/.cache/explainer/ffmpeg`) only with `--allow-download`.
- **dir/** writes PNG frames and prints the ffmpeg command.
- Capture mode: `__internals.setCapture?.(true)`, the `ix-capture` class, and injected CSS hiding the transport,
  drawers and settings plus the rest of the interactive chrome (toolbar, tabs, help, inspector, toasts, menus,
  tips, scrub preview). The caption is hidden too unless `--captions`; `--chrome` keeps the controls.
- Sizes: `1920x1080` (default), `1080x1920` (`vertical`), `1080x1080` (`square`), any even WxH.

## new.mjs

`node scripts/new.mjs <dir> [--from <example | folder>] [--title text] [--force]`

Writes `figure.mjs` from `scripts/templates/figure.mjs` (binary search, written to show each export: meta,
params, scenarios, counters, invariants, code, and a `build` with phases, focus, lit, tags, gauges, truthful
captions, and an id and vars on every step, chapter and question), `lesson.mjs` from `scripts/templates/lesson.mjs`
(the words for those ids: goal, objectives, misconceptions, picture map, terms, chapter cards, layered steps and
ask feedback) and a README with the exact commands. `--from` copies `examples/<name>/` (or any folder with a
`figure.mjs`), skipping built pages, shots and videos, and relocates imports into the skill: relative if the new
folder is inside the skill, absolute otherwise. The copied README's commands (`node ../../scripts/verify.mjs …`) are
rewritten the same way, so they run from the new folder. It prints the next two commands: verify, then check.

## review-packet.mjs

`node scripts/review-packet.mjs <figure.mjs> --out <dir>/review/packet [--round N] [--levels new,expert] [--no-images]`

The blind readers' packet for the teacher pipeline (`SKILL.md`, stage 3.5): only what a reader meets, in reading
order, rebuilt from scratch each round. One folder per level (`new/`, `expert/`, and `basics/` if asked), each with
`index.md` (the reading order, images included), `00-start.md` (title, hook, level, the scenarios, the chapters),
`NN-<chapter>.md` for each chapter of the first scenario, `sK-<scenario>.md` for each other scenario from where it
differs, and `end.md` (recap, takeaway). Steps print their layers as that level shows them (`engine/hud/level.mjs`):
New gets the full entry card, every why and the picture lines; Expert the first sentence of each about and every
`deeper` field. A term's definition follows its first use in `[brackets]`. A prediction ends its chunk with the
question and options; the next chunk (`NN-<chapter>-2.md`) opens with "Revealed: … because …" and the feedback for
the other options. An in-world pick does the same as "Your turn": the next chunk reveals the right pick and, for each
wrong one, what the run plays when you pick it (its real branch). Each story ends with its end check at the folder's
level (New 3, Basics 2, Expert the transfer question), the questions in one chunk and the answers, the feedback and
"You can now…" in the next. No ids, file paths, lint output or source.

`img/` holds one key frame per chapter of the first scenario (its last step), every ask and why card, and each
scenario's end card, all 1440×900 in the dark theme (`shoot.mjs --teach` underneath; Chrome required, about a
minute). `--no-images` writes the transcript alone. Exit 1 when an image is missing.

`--round N` seeds one canary per reader and records it in `<out>/../round-N/canary.json`, outside the packet: for the
New folder, a sentence with a flagged word the lesson never defines ("This is the shuffle at work."), appended to a
step mid-lesson; for the Expert folder, one count in a step changed (5 becomes 7). Each round picks a different
place and word. Never show `canary.json` to an agent.

## review-check.mjs

`node scripts/review-check.mjs <dir>/review --round N`

Checks the readers' reports in `review/round-N/` (`novice-*.json`, `expert*.json`: each reader's final message as
the lead saved it, a fenced ```json block or bare JSON) against the packet and writes `round-N/findings.json`:

- the schema of `agents/novice-reader.md` or `agents/expert-reader.md` (chapters with a say-it-back, three weakest
  moments; findings, three least precise sentences, a source on every `wrong` or `misleading` finding);
- every quote is verified: at least 3 words and in the packet, after normalising whitespace, `**` and curly quotes;
  the rest are dropped and counted;
- the canary: a report must quote it (the word, or the sentence with the wrong number); its findings are stripped;
- at least 3 verified quotes per report.

`findings.json` holds `readers` (anonymous: `novice-1`, `novice-2`, `expert`; each novice's persona, say-it-backs,
guesses and outcome; the expert's verified nuances) and `findings`, each with an id (`F1`…), its reader, kind
(`lost`, `prior_knowledge`, `image`, `weakest`, `expert`, `least_precise`, `nuance`), chapter, step and quote. It
prints one line per report and exits 1 when any report is void: rerun that reader once, then escalate.

## snap.mjs

`node scripts/snap.mjs <url-or-path> --out shot.png [--size 1440x900] [--dpr 2] [--wait ms] [--eval js] [--theme light]`.
Unchanged CLI; it now re-exports `launch`, `openPage`, `urlFor`, `CHROME` from `scripts/lib/cdp.mjs`.

## Rendering backends

The renderer (`engine/gfx/renderer.mjs`, CONTRACTS.md 3.1) draws with WebGPU where the browser has it and passes a
startup self-test, and with WebGL2 otherwise; if WebGPU fails to start or its device is lost later, the page swaps to
WebGL2 and redraws the last frame. Add `?gfx=webgl2` or `?gfx=webgpu` to a page URL to force one (a forced WebGPU
that fails logs an error and still falls back). `__internals.stats().backend` says which one is drawing, and
`__internals.profile()` resolves to the WebGPU tier's per-pass GPU timings (null on WebGL2). The scripts' headless
Chrome exposes WebGPU, so shots and videos use whichever tier starts there (a fallback logs a `[gfx]` warning). To
check the WebGL2 tier, which drops some WebGPU-only looks such as glass zones, give a script the page as a URL with
the flag: `node scripts/shoot.mjs "file:///…/page.html?gfx=webgl2"`.

Without a GPU (SwiftShader, llvmpipe: `__internals.stats().draft` says when a frame was one) frames in motion are
drafts (CONTRACTS.md 3.1): three quarters of the pixel ratio, the low preset's maps, no MSAA or tilt-shift, and the frame the camera
comes to rest on is drawn again in full. Captured frames (shoot, audit, record, the handout's pictures, Save image)
never draft, so they are the same with or without a GPU; `__gfx.debug.draft = false` turns drafts off.

On a machine with no GPU the scripts' Chrome gets no WebGPU adapter and draws with WebGL2. Chrome started with
`--enable-unsafe-webgpu --enable-features=Vulkan,WebGPUService --use-angle=swiftshader --use-webgpu-adapter=swiftshader
--disable-vulkan-surface` does start the WebGPU tier on SwiftShader (`?gfx=webgpu`, the self-test passes), but its canvas
comes out blank in screenshots, so the WebGPU look still needs a machine with a GPU to check.

## Director (`engine/director/director.mjs`, `engine/director/shots.mjs`)

```js
const dir = createDirector({ reducedMotion, timeline });
dir.update(frame, { width, height, insets }, dt, { settled })  // -> Camera (one reused object; copy to keep it)
dir.gesture({ type: "orbit" | "zoom" | "pan" | "focus", dx, dy, scale, x, y, bounds })
dir.fit(bounds, { instant, hold = true }); dir.resume(); dir.setTimeline(tl); dir.setReducedMotion(on); dir.reset()
dir.keep(bounds | null)           // hold a box in the free area (an open pick's candidates) until null
dir.auto; dir.camera; dir.state   // state: { shot: "establish" | "focus" | "manual" | "keep" | <plan kind>, goal, auto, resumeIn, viewport, plan }
```

- **Exact framing** (`frameBounds`): the eight corners of the bounds box (z 0..30 when the box has none) are taken
  into camera space for the shot's yaw, pitch and fov; the fit is a linear program in the eye position (largest eye
  depth whose frustum holds every corner inside the margin), solved in closed form per axis; the eye is then
  centred so the projected extent sits exactly in the middle of the framing region. Checked in tests against an
  independent lookAt projection over 400 random boxes, yaws, pitches and aspect ratios, and in Chrome against
  `renderer.project` (agreement to 0.0001 px).
- **Region**: margin = `CAMERA.margin` of the shorter side. Where the HUD covers a side (`viewport.insets`, from
  `hud.insets`), the edge sits `margin / 3` inside the overlay instead, so the framed world sits in the free
  rectangle and its projected centre moves with it. Inset changes under 24 px are ignored, bigger ones reframe on
  the springs; a change of width or height cuts.
- **The shot plan** (with a timeline, `shots.mjs`): `planShots(tl, viewport, framing)` writes a list of keyframes,
  each a shot the camera moves to from time `at` over `move` seconds, and `cameraAt(plan, time)` gives the camera at
  any playhead time, so playing, scrubbing, stepping and capture agree. Per chapter: **establish** (the whole world
  at the chapter's first step, from the chapter's own yaw, alternating sides, held while the entry card reads),
  **push** (the chapter's stage: the union of its steps' focus and `look` boxes), **detail** (a `key` step's `look`
  ids, close, from where they start to where they land, so a move's source and target share the frame), **pull** (the chapter's last step, back to the world; phones: the stage); then **payoff** (the run's
  last step before any scale shot, close and large) and **scale** (a tracking shot that follows `s.scale`'s reveal
  box, craning up as it widens). Every shot also holds the step's focus and tags in the free area (`holdShot`, on
  every screen size), so a detail shot pushes in only as far as keeps a focused ring or cluster whole. When the shot on
  screen as a step starts does not hold that step's focus, a **bridge** keyframe sets the camera off up to
  `SHOTS.bridge` (0.7 s) early, through a shot of both steps' focus (no closer than either end), so it is in frame
  from the step's first frame. Moves are eased, 1.1–2.4 s, longer for bigger zooms; a shot closer than
  `SHOTS.rest` to the current one is not taken. `dir.state.plan` lists the keyframes (`{ at, kind, move }`).
- **Keep** (`dir.keep(bounds)`): while the reader must click something (an `s.choose` pick, which the runtime passes
  through `onPickArea`), the planned shot stands when it already holds the box inside the free area at half the
  margin; otherwise the camera springs to a shot of the box at the plan's angle (`state.shot === "keep"`, no closer
  than 1.25× the plan's zoom), and `keep(null)` eases back into the plan. The HUD counts an open pick card on a phone
  in `insets.bottom`, so there the candidates frame above the card. `__internals.director` and `__internals.insets`
  show both from a script.
- **Without a timeline** (the gallery, tests): the establishing shot of `frame.world` holds for `2 x MOTION.step`
  (1.8 s) from each phase change, then the focus shot (focus padded by `SIZE.zone.pad`, never closer than 1.6 px/u
  at the target, never wider than the world shot), kept until the focus centre leaves the central
  `MOTION.camera.deadZone` of the free stage, a focus corner gets within half a margin of the edge, or the zoom
  would change by more than `zoomHysteresis` (22 %).
- **Motion**: exact critically damped springs (omega `MOTION.camera.omega`), frame-rate independent, on target,
  log distance, yaw and pitch. Idle drift is ±`CAMERA.drift` of yaw from two slow incommensurate sines of the
  playhead time (it freezes when paused and is exact in capture).
- **Gestures**: orbit (yaw within ±`yawRange`, pitch within min/maxPitch) and pan apply directly; zoom springs fast
  and keeps the floor point under the pointer still; focus frames given bounds; all hold the camera until 4 s after
  the last one, then auto direction eases back into the plan. Reduced motion: cuts instead of flights, no drift.
- **Settled** (`{ settled: true }`, alias `settle`): jump straight to this frame's shot with no hysteresis and no
  history, for capture. Without a timeline, a settled frame only establishes during the first 1.8 s.
- Conventions (shared with the renderer): eye = target + d·(sin yaw cos pitch, cos yaw cos pitch, sin pitch);
  screen right = (cos yaw, −sin yaw, 0). Exported helpers: `cameraBasis`, `eyeOf`, `projectPoint`,
  `unprojectPoint`, `ndcToCss`, `pxPerUnitAt`, `frameBounds`, `frameRegion`, `projectBounds`, `drift`, `DIRECTOR`
  (tuning constants).

## Libraries (`scripts/lib/`)

`cdp.mjs` (find Chrome with `findChrome()`, launch it, pages in their own windows, error collection including failed
loads, screenshots; every Chrome it starts is killed and its profile removed on exit, Ctrl-C included),
`where.mjs` (point a message at its line: `keyLine`, `excerpt` with a caret, `frameIn` a stack, `importFailure`, and
`nearest` for "did you mean"), `report.mjs` (check's report as HTML and Markdown),
`modules.mjs` (lexer, import scan, specifier resolution and mapping, rewrite, graph), `webm.mjs` (EBML writer,
muxer, reader), `figure-page.mjs` (open a page through `__internals`, shot times, capture CSS, finding groups),
`args.mjs`, `node-hooks.mjs`, `lesson-load.mjs` (`loadFigure()`: a figure with the `lesson.mjs` beside it),
`lesson.mjs` (extract and format the lesson a figure teaches) and `teach.mjs` (the teaching lint, its jargon list and
size limits, readability helpers).

## Tests

```sh
node --test "engine/**/*.test.mjs" "sim/**/*.test.mjs" "scripts/**/*.test.mjs"   # unit tests (Node 21+; on 20 list the files)
node scripts/snap.mjs engine/hud/test.html --out /tmp/hud.png \
  --eval "window.__results.then(r=>JSON.stringify({pass:r.pass,fail:r.fail.length}))"   # HUD tests in Chrome
node scripts/test/e2e.mjs [--real]       # headless end to end; --real adds the real engine (MapReduce)
```

The e2e harness builds `scripts/test/fake-figure.mjs` with `scripts/test/fake-runtime.mjs` (a Canvas 2D stand-in
for the runtime that frames the world with the real director and exposes a 20-step `__internals`), then runs snap
(file://), shoot, audit (clean and with planted problems), record (3 s 1280x720 WebM, played back in Chrome), the
ffmpeg refusal, verify, new (template and `--from` relocation) and the dev server's live reload.
`scripts/test/fake-scene.mjs` is a permissive stand-in compiler; `scripts/test/bad-figure.mjs` plants one of each
mistake verify must catch. Scratch output goes to `scripts/test/out/` (ignored by git, safe to delete).

The real engine has been run end to end the same way: verify (12 runs of MapReduce), build (about 720 KB, 33
modules), shoot (40 shots), audit (it finds real label overflows) and record (1280x720 and 1080x1920 WebM, played
back).

## Known gaps

- Live play is bound by frame time. On a 4-core machine with no GPU and other jobs running, `shoot --scenario all
  --teach` over MapReduce took 57 to 63 min (160 phase shots in about 10 min, the 104 teaching cards in the rest).
  Most of the cards' time is the first story ("Everything works", 35 of those 63 min): its cards follow steps that
  light tiles, and a lit tile's ping (0.7 s) and a trace's afterglow (1.1 s) fade on the runtime's clock, which steps
  at most 1/20 s a frame, so the page keeps drawing for 14 to 22 frames after the run stops: 20 s and more at a second
  a frame, and the card is shot mid-fade (live cards differ a little from run to run for this reason and for the
  shimmer, which follows the wall clock). More tabs in one Chrome do not help: software rendering runs in Chrome's
  one GPU process, and 2 to 4 tabs drew 1.2x the frozen frames of one on an idle machine and no more on a loaded one.
  On a page that draws at 20 fps or better the pass keeps its old speeds and waits. Changing the speed only when the
  run starts or stops would save two frames a card, but the camera moves only when a frame is drawn, so a card shot
  right after another (the end check, You can now, the caption, the end card; a pick's wrong branch) was framed
  differently: the pass keeps them. Drafts (Rendering backends) raised live MapReduce on that machine (SwiftShader,
  WebGL2) from 0.9 to 2.2 frames a second at 1440x900 and from 2.2 to 7.0 at 390x844 (half the pixel ratio gave 4.2
  and 11.3, but the world's names could not be read while it played); a full frame still takes about 1.5 s at
  1440x900, and the closing scale shot (6008 slabs) about 10 s.
- `.mp4` and `.gif` paths were exercised only with a stub ffmpeg (no ffmpeg on the test machine); the `--allow-download`
  path is untested by design (no downloads were made).
- A wide world in a 9:16 frame gives a small establishing shot (the camera fits by width, then pushes in after the
  1.8 s hold). A portrait-aware layout is a scene matter.
- Capture is screenshot-bound (~50 ms a frame at 1080p); workers hide most of it. CSS transitions are snapped
  during capture, so captions cut rather than fade in video.
