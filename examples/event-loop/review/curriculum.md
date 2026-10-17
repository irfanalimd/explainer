# The event loop: curriculum

Level `core`. Planned against the figure as it stands. At the time of writing `figure.mjs` passes no step, phase or
ask ids (another pass is adding them), so steps below are named by their captions and chapters by their names.

## Sources

- Canonical: HTML Living Standard, §8.1.7 Event loops (processing model: take the oldest runnable task, run it,
  perform a microtask checkpoint, which loops "while the event loop's microtask queue is not empty"; rendering is
  queued as a task on the rendering task source at a rendering opportunity).
  https://html.spec.whatwg.org/multipage/webappapis.html#event-loops
- HTML Living Standard, timer initialization steps: nesting level is the running timer task's level, else 0; "If
  nestingLevel is greater than 5, and timeout is less than 4, then set timeout to 4"; then increment.
  https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timer-initialisation-steps
- ECMAScript, §9.5 Jobs (HostEnqueuePromiseJob), §27.2 PerformPromiseThen, §27.7 Await.
  https://tc39.es/ecma262/#sec-jobs and https://tc39.es/ecma262/#await
- J. Archibald, "Tasks, microtasks, queues and schedules" (2015), the standard explainer and its quiz; also the
  source of the click() vs user-click nuance. https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/
- V8, "Faster async functions and promises" (2018): `await` on a native promise takes one tick, not three (the spec
  change behind the run's order). https://v8.dev/blog/fast-async
- Misconception evidence: practitioner write-ups listing the same errors ("setTimeout 0 runs immediately", "async
  code can interrupt sync code", "promises and setTimeout have the same priority"):
  https://namastedev.com/topics/ep-15-asynchronous-javascript-event-loop-from-scratch-/common-event-loop-misconceptions-in-javascript
  and https://certificates.dev/blog/the-javascript-event-loop-the-skill-that-separates-juniors-from-seniors ; the
  output-order puzzle is the most duplicated event-loop question on Stack Overflow.

## Prerequisites

Functions and calling them; `console.log`; roughly what `.then` and `await` look like in code; that a browser draws a
page on screen. Not assumed: threads, queues, tasks, microtasks, the spec.

## Exact rules and numbers (from the run)

- One task at a time, run to completion; then the microtask queue is drained, including jobs queued during the drain;
  only then the next task (the oldest across queues, in this model).
- `.then` on a settled promise queues its job at once; on a pending one it waits. A handler's return settles its
  derived promise, which queues the next `.then`.
- `await v` = PerformPromiseThen(PromiseResolve(v), rest): the rest is a microtask even for `await null`.
- Timers: a 0 ms timer is queued at once (no padding); past nesting level 5 a delay under 4 ms becomes 4 ms. In the
  "Taking turns" story chunk 7 runs at level 6, so the timer for chunk 8 is clamped (needs chunks ≥ 8).
- Rendering opportunities every 1000/hz ms (16.667 at 60 Hz); a render task is queued only if the page changed and
  none is queued.
- Outputs (default knobs; cross-checked in Chrome per the README): "Which runs first?" prints `script, done, then 1,
  micro, then 2, timeout, fetched` (fetched at 40 ms). "Code after await": `script, load 1, done, load 2, then,
  load 3`. "Promises that never stop": 8 chunks × 4 ms; the render due at 16.7 ms waits to 32 ms; timeout runs at
  32 ms; one repaint, 0/8 → 8/8. "Taking turns": timeout at 4 ms; repaints show 5/8 then 8/8; 4 ms idle at the clamp.
- Knobs: network delay 5–120 ms (40), chunks 3–10 (8), work per chunk 1–8 ms (4), 60/120 Hz.

## Objectives and their quiz stems

| Objective | Quiz stem |
|---|---|
| o-order | "`log(A); setTimeout(() => log(B), 0); Promise.resolve().then(() => log(C)); log(D);` What prints, in order?" (A D C B) |
| o-drain | "A `.then` callback queues another `.then` while it runs. Does the new one run before a timer that was already waiting?" |
| o-await | "`async function f() { log(1); await null; log(2) }  f(); log(3);` What prints, in order?" (1 3 2) |
| o-paint | "A long job queues each piece with `queueMicrotask`. What does the user see on screen while it runs, and what one change lets the page repaint?" |

## Chapters (by their current names)

The parts chapter, whose entry card shows the picture map: **The script** (the first chapter of every story; its about
carries the cook and the rail). Its term load is the risk: in "Which runs first?" it introduces task and microtask (the
about), event loop and call stack (the first step), callback (the setTimeout question) and promise (the
`Promise.resolve()` step): 6 terms against the parts-chapter cap of 5 for `core`. Moving callback's first use into
the lesson's `plain` for that step as an inline gloss, or deferring promise to "Before the next task", fits it.

| Chapter | Stories | So far | Now | You'll know it worked when |
|---|---|---|---|---|
| The script (parts, `picture: true`) | all | You can call functions and print with `console.log`. | Run the script, the first task, from top to bottom. | Every line runs in order, and each callback waits in a box instead of running. |
| Before the next task | order, await, starve | The script ran to its end; callbacks wait in the queues. | Run every waiting microtask, even ones added along the way. | The microtask queue is empty before a single task leaves the task queue. |
| The timer | order | Every microtask has run. | Take one task: the 0 ms timer, waiting since the start. | `timeout` prints after every promise callback. |
| The network | order, await | The thread has nothing to do. | The network reply arrives as a task, and its promise callbacks follow. | The reply task runs, and the code waiting on it runs right after as microtasks. |
| Tasks at last | starve | Each chunk queued the next as a microtask, so nothing else could run. | The microtasks are done: take the waiting timer and the render task. | The screen jumps from nothing to done in one repaint. |
| Taking turns | yield | Each chunk now goes back to the task queue with a 0 ms timer. | Let other tasks run between chunks. | The timer and repaints slot in between chunks; the bar fills in steps. |
| Timer limit | yield (chunks ≥ 8) | Each chunk set a 0 ms timer for the next. | Timers nested more than five deep wait at least 4 ms. | The thread sits idle for 4 ms before the next chunk. |

Story overrides worth writing: `enter@await` for The script ("Run the script, which calls an async function"), and
`enter@starve` for Before the next task ("Each chunk adds the next chunk to the microtask queue").

## Key steps (by caption)

- "The loop takes the script and runs it. It sits on the call stack" (the parts at work; the figure already asks
  `keep: true` here, see below).
- "`setTimeout` hands `timeout` to the browser's timer and returns. Nothing prints" (m-now disproved).
- "The script ends and leaves the stack. The thread is free: what runs next?"
- "Microtasks first: `then 1` runs before any task" (the aha).
- "`then 2` was added mid-round, and the queue must empty before any task" (the drain rule).
- "Only now does the loop take a task: `timeout`, waiting since 0 ms".
- await story: "`await null` pauses `load`: it leaves the stack, and the rest of it becomes a microtask"; and
  "`load` resumes where its `await` left off".
- starve story: the render arrival ("time to repaint. A render task joins the task queue, but must wait …") and the
  finale ("The screen jumped from 0/8 to 8/8: no progress").
- yield story: the first render task's repaint; the clamped timer ("forced to 4 ms").
- Every story's finale ("Printed: …").

Repeats with no `why`: later "The loop runs X" microtask steps, compact chunk steps, later arrivals.

## Asks and the misconceptions they confront

| Ask (chapter, story) | Option → misconception |
|---|---|
| "Does `timeout` print now?" (The script, order) | 0 "Yes: 0 ms means right away" → m-now · 1 right |
| "Which callback runs next?" (Before the next task, order) | 0 "timeout: it was queued first" → m-order · 1 right · 2 "fetched: its request started earlier" → m-order |
| "What prints next?" after `await null` (The script, await) | 0 "load 2: the awaited value is ready" → m-await · 1 right · 2 "then: it is in the microtask queue" → m-now |
| "Does the browser repaint now?" (Before the next task, starve) | 0 "Yes: repainting interrupts JavaScript" → m-paint · 1 right · 2 "Yes, between two microtasks" → m-paint |

"Taking turns with setTimeout" has no ask. For a `core` story verify warns; a natural one sits before the first
repaint: "The bar changed after chunk 4. Can the screen show it before chunk 5 runs?" (yes: chunk 5 is a task, and the
render task is older).

## Expert nuances for `deeper`

- Microtasks-first step real (the ten-year nuance): a checkpoint runs whenever the stack empties, not only after a
  task, so a user's click runs each listener's microtasks between listeners, but `el.click()` from script does not
  (the script is still on the stack). Source: Archibald 2015.
- `then 2` step how: a handler's return settles the derived promise, which queues the next reaction; returning a
  promise from a handler costs two extra ticks (NewPromiseResolveThenableJob). Source: ECMAScript §27.2.
- `await null` step edge: since ES2019 an `await` on a native promise takes one tick (V8 7.2); before, three, and the
  printed order differed. Source: v8.dev/blog/fast-async.
- render task step real: in the spec rendering is a task, but browsers prioritise it; Chromium lets a frame go ahead
  after it has waited long enough, so "oldest task first" is this model's choice (the about already says so). Source:
  HTML §8.1.7.3.
- clamp step real: Chrome removed its old 1 ms minimum for `setTimeout(f, 0)` (2022) but keeps the nested 4 ms clamp;
  background tabs throttle timers to once a second or less. Source: HTML timers section.
- yield finale real: `scheduler.yield()` and `scheduler.postTask` are the modern way to give the loop back without the
  4 ms clamp. Source: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield
- Node edge: Node runs `process.nextTick` callbacks before promise jobs, and its loop has phases (timers, poll, check),
  so `setImmediate` vs `setTimeout(0)` order differs from the browser.

## Why this ladder

The script runs first and alone, so the reader sees callbacks registered but not run (the setTimeout question) before
anything is drained. The drain gets its own chapter because it holds the aha (`then 2` beats a timer queued earlier).
The timer chapter then pays off m-order; the network chapter shows a task causing microtasks. The await, starvation and
yield stories each answer one "what if" and reuse the same two chapters.

## Unsure, and what looks wrong in the run

- The first step's `{ keep: true }` is dropped: `runTask` calls the machine's `step(caption)` with a second argument
  that `step` never forwards to `s.step` (figure.mjs line 677 vs 420).
- That step introduces two terms at once (event loop and call stack); the rule is one new term per step.
- "Taking turns with setTimeout" has no predict question (see above).
- The rendering-as-a-task wording follows the current HTML standard (the figure quotes it); I could not re-fetch the
  exact paragraph (the page is too large for the fetcher), so the quote is the figure's, not re-verified here.
- No peer-reviewed concept inventory for the event loop was found; the misconceptions rest on practitioner write-ups
  and the shape of the most common interview and Stack Overflow questions.
