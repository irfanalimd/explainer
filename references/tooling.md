# Tooling: scripts and the camera director

Everything here is Node built-ins plus headless Chrome over CDP: no installs, no network. Paths below are relative
to the skill root; every script also takes absolute paths and works from any working directory.

## The authoring loop

```sh
node scripts/new.mjs ~/figs/raft                       # figure.mjs (commented template) + README.md
node scripts/verify.mjs ~/figs/raft/figure.mjs         # headless checks; fix until it exits 0
node scripts/lesson.mjs ~/figs/raft/figure.mjs         # the lesson as text: read it as a beginner would
node scripts/build.mjs ~/figs/raft/figure.mjs --serve  # live-reloading dev page, URL printed
node scripts/build.mjs ~/figs/raft/figure.mjs          # the shippable single file: ~/figs/raft/raft.html
node scripts/shoot.mjs ~/figs/raft/raft.html           # PNGs of every phase, both themes, desktop + phone, contact sheet
node scripts/audit.mjs ~/figs/raft/raft.html           # every step, both sizes: overflow, tags, focus, frame time
node scripts/record.mjs ~/figs/raft/raft.html --out raft.webm --captions
```

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
- Identical findings in later runs are counted (`(+3 as above)`), not repeated.
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

`node scripts/lesson.mjs <figure.mjs> [--scenario id] [--all] [--full] [--no-lint] [--json] [--width 100]`

Prints the lesson as plain text, story by story, so it can be read like a script: the hook, the defined words, the
numbers (`*` for the dock), then for each story its what-if and description, each chapter's name and about, every
caption (markup flattened; a term's definition in `[brackets]` where the run first uses it, as the explain panel
does), each predict question with its options, the answer (`✓`) and its why, then the recap and the takeaway. Then
the teaching checks (the same findings verify reports).

- A run of steps with one caption shape shows two, then "… 6 more like this (steps 14–19)"; `--all` shows every step.
- Later stories start where they leave story 1 (as the page does on a switch); `--full` prints them from step 0.
- `--json` prints `{ figure, lesson, findings }`. Exit 1 when the teaching checks find an error.

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

## serve.mjs

`node scripts/serve.mjs [--port 5173] [--root dir] [--allow dir]... [--no-live]`

Static server for the skill. `/__live` is a server-sent-event stream: one message per changed file
(`fs.watch` recursive, debounced; dotfiles, `node_modules`, `shots/`, `frames/` and non-source files ignored).
Dev pages reload on module changes, hot-swap stylesheets on CSS changes, and reload when the server restarts.
`/@fs/<absolute path>` serves files outside the root inside an `--allow` folder. Modules that import by absolute
path, `file://` URL or `@internals/<path>` are served with those specifiers rewritten to this server's URLs (so
there is one instance per module); everything else is served byte for byte.

## shoot.mjs

`node scripts/shoot.mjs <page | figure.mjs | url> [--at phases|all|steps|<list>] [--themes dark,light] [--sizes 1440x900,390x844] [--scenario id|all] [--out dir] [--dpr 1] [--camera settled|auto] [--clean] [--no-sheet]`

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
params, scenarios, counters, invariants, code, and a `build` with phases, focus, lit, tags, gauges and truthful
captions) and a README with the exact commands. `--from` copies `examples/<name>/` (or any folder with a
`figure.mjs`), skipping built pages, shots and videos, and relocates imports into the skill: relative if the new
folder is inside the skill, absolute otherwise.

## snap.mjs

`node scripts/snap.mjs <url-or-path> --out shot.png [--size 1440x900] [--dpr 2] [--wait ms] [--eval js] [--theme light]`.
Unchanged CLI; it now re-exports `launch`, `openPage`, `urlFor`, `CHROME` from `scripts/lib/cdp.mjs`.

## Director (`engine/director/director.mjs`)

```js
const dir = createDirector({ reducedMotion, timeline });
dir.update(frame, { width, height, insets }, dt, { settled })  // -> Camera (one reused object; copy to keep it)
dir.gesture({ type: "orbit" | "zoom" | "pan" | "focus", dx, dy, scale, x, y, bounds })
dir.fit(bounds, { instant, hold = true }); dir.resume(); dir.setTimeline(tl); dir.setReducedMotion(on); dir.reset()
dir.auto; dir.camera; dir.state   // state: { shot: "establish" | "focus" | "manual", goal, auto, resumeIn, viewport }
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
- **Shots**: the establishing shot of `frame.world` holds for `2 x MOTION.step` (1.8 s) from the start of every
  phase (from `tl.phases` when `setTimeline` was called, else from seeing `frame.phase` change), then the focus
  shot (focus padded by `SIZE.zone.pad`, never closer than 1.6 px/u at the target, never wider than the world shot).
- **Hysteresis**: the shot is kept until the focus centre leaves the central `MOTION.camera.deadZone` of the free
  stage, a focus corner gets within half a margin of the edge, or the zoom would change by more than
  `zoomHysteresis` (22 %).
- **Motion**: exact critically damped springs (omega `MOTION.camera.omega`), frame-rate independent, on target,
  log distance, yaw and pitch. Idle drift is ±`CAMERA.drift` of yaw from two slow incommensurate sines of the
  playhead time (it freezes when paused and is exact in capture).
- **Gestures**: orbit (yaw within ±`yawRange`, pitch within min/maxPitch) and pan apply directly; zoom springs fast
  and keeps the floor point under the pointer still; focus frames given bounds; all hold the camera until 4 s after
  the last one, then auto direction flies back. Reduced motion: cuts instead of flights, no drift.
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
`args.mjs`, `node-hooks.mjs`, `lesson.mjs` (extract and format the lesson a figure teaches) and `teach.mjs` (the
teaching lint, its jargon list and size limits, readability helpers).

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
