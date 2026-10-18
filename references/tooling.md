# Tooling: scripts and the camera director

Everything here is Node built-ins plus headless Chrome over CDP: no installs, no network. Paths below are relative
to the skill root; every script also takes absolute paths and works from any working directory.

## The authoring loop

```sh
node scripts/new.mjs ~/figs/raft                       # figure.mjs + lesson.mjs (commented templates) + README.md
node scripts/verify.mjs ~/figs/raft/figure.mjs         # headless checks, the lesson file included; fix until it exits 0
node scripts/lesson.mjs ~/figs/raft/figure.mjs         # the lesson as text: read it as a beginner would
node scripts/build.mjs ~/figs/raft/figure.mjs --serve  # live-reloading dev page, URL printed
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

All page scripts (shoot, audit, record) also accept a figure module directly (they build it to a temp page first)
or a URL. They exit 1 on page errors; audit and verify also exit 1 on any problem. Look at every PNG shoot makes,
starting with `contact.png`.

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
  max, bool flipped, select first and last; params a scenario pins are left alone). `--quick` runs defaults only.
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
- Identical findings in later runs are counted (`(+3 as above)`), not repeated.
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
layers (why, look, picture, deeper fields); and each ask option's feedback with the misconception it names.

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
- Specifiers become bare names in an import map of base64 `data:` URLs (the `@internals/` prefix is an internal
  name kept from before the skill was called Explainer): skill files are `@internals/<path in the
  skill>`, the figure is `@internals/figure`, files outside the skill (a figure's own helpers) are
  `@internals/local/<path from the figure>` (no absolute paths leak into the page). One file has one specifier, so
  one module instance, however it was imported (relative, absolute path, `file://` or `@internals/<path>`).
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
- Deep links, embedded or not: `#step-12`, `#scenario-crash`, `#level-expert`, joinable (`#scenario-crash&step-4`),
  applied on load and on hashchange, then removed from the hash (the HUD's `#s=…&t=…` takes over). `step` lands on
  the step's start, like Back. LTI 1.3 needs a server, so it is out of scope for the file; a SCORM zip is the later
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
  captioned with step, time, phase and caption; split into `contact-2.png`… past 14000 px).
- Runs `__internals.audit()` after each shot and reports page errors (console errors, exceptions, failed loads)
  and audit problems grouped by finding, with the steps and shots where each occurs.
- Size presets: `desktop` (1440x900), `phone` (390x844), `1080p`, `720p`, `vertical`, `square`. Use `--dpr 2` to
  judge text crispness.
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
  - the end card, scrolled to the recap, takeaway and what-ifs (`…-<last step>-end-card.png`). On a narrow screen,
    where the caption carries the takeaway, `…-end-caption.png` first, then the Explain card opened from it.
  The shots join the contact sheet; a question or pick that never opens or reveals is reported as a page error. Live play
  takes a few seconds a card (MapReduce, 4 stories × 2 themes × 2 sizes: about 3 minutes). `--at none --teach`
  shoots the cards alone.

## audit.mjs

`node scripts/audit.mjs <page | figure.mjs | url> [--sizes 1440x900,390x844] [--themes …] [--scenario all|id] [--at all|steps|phases|<list>] [--budget 16] [--json]`

Renders mid and end of every step of every scenario at each size (settled camera) and collects
`__internals.audit()` (label overflow, tags off-screen, focus outside the frame, whatever the runtime checks) plus
page errors and a frame-time warning from `__internals.stats().ms`. One line per distinct finding with the steps,
the first step's caption and where it was seen. Problems with `level: "warn"` do not fail. Exit 1 on problems or
page errors.

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
folder is inside the skill, absolute otherwise.

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
the other options. No ids, file paths, lint output or source.

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
  box, craning up as it widens). Moves are eased, 1.1–2.4 s, longer for bigger zooms; a shot closer than
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

`cdp.mjs` (launch Chrome, pages in their own windows, error collection including failed loads, screenshots),
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

- `.mp4` and `.gif` paths were exercised only with a stub ffmpeg (no ffmpeg on the test machine); the `--allow-download`
  path is untested by design (no downloads were made).
- A wide world in a 9:16 frame gives a small establishing shot (the camera fits by width, then pushes in after the
  1.8 s hold). A portrait-aware layout is a scene matter.
- Capture is screenshot-bound (~50 ms a frame at 1080p); workers hide most of it. CSS transitions are snapped
  during capture, so captions cut rather than fade in video.
