# The event loop

Four small programs run on a model of the HTML Living Standard's event loop processing model (§8.1.7.3) and
ECMAScript promise jobs. Each callback is one tile from the moment it is registered until it returns. Its identity
colour moves with it: Web API → queue → call stack → console. The reader should come away knowing four things:

- A task runs to completion. Then the microtask queue is drained completely, including jobs queued during the drain.
  Only then does the loop take one more task.
- `await` is `PerformPromiseThen(PromiseResolve(v), rest)`. The rest of an async function is a microtask, even for
  `await null`.
- Microtasks that keep queueing microtasks starve everything else, rendering included. Rendering is itself a task,
  queued at a rendering opportunity.
- `setTimeout(f, 0)` lets the loop render and run other tasks between chunks. Past timer nesting level 5 the spec
  clamps the delay to 4 ms.

## The lesson (`meta.level: "core"`, plan per `references/teaching.md`)

- **Hook:** "JavaScript does one thing at a time, yet timers and clicks keep coming. Why doesn't the page freeze?
  Why doesn't setTimeout(fn, 0) run now?"
- **Picture:** one cook (the thread) with an order rail (the task queue). Notes saying "do this before the next
  order" go in the microtask queue, checked after every dish; what is cooking is the call stack; kitchen timers and
  delivery drivers are the Web APIs; the cook's rule (one order, then every note, repeat) is the event loop.
- **Ladder** (the main story): The script → Before the next task → The timer → The network. The other stories add Code after
  await, Promises that never stop (Before the next task → Tasks at last) and Taking turns with setTimeout (Taking turns →
  Timer limit).
- **Misconception, predicted first:** "`setTimeout(fn, 0)` runs immediately": once before `setTimeout` returns
  ("Does `timeout` print now?") and once, the aha, before `then 1` runs ("Which callback runs next?"). The await and
  starvation stories each ask one more. Every question has a `why`.
- **Words** (`meta.terms`, marked at first use): task, microtask, event loop, call stack, callback, promise,
  Web APIs (at the network chapter, to keep the first chapter lighter), repaint, await (in the await story). The
  queue plates read "next out →": the oldest record leaves on the right, toward the stack. "Microtask checkpoint", "nesting level", "fulfil" and "rendering opportunity" are no longer
  used in the narration (the code comments and this README keep the spec's words).

## The model

- **Source:** HTML Living Standard §8.1.7 (event loop processing model, perform a microtask checkpoint, timer
  initialization steps, rendering opportunities). ECMAScript §27.2 (PerformPromiseThen, HostEnqueuePromiseJob) and
  §27.7 (Await).
- **What is real:**
  - Promise reactions are queued at once on a settled promise and parked on a pending one.
  - A handler's return fulfils its derived promise, and that queues the waiting reactions.
  - Timers use the spec's nesting level. It is 0 inside microtasks, because the currently running task is then the
    microtask.
  - The network answers after the latency knob.
  - At each rendering opportunity (60 or 120 Hz), a render task is queued if the page changed and none is queued yet.
  - The loop picks the oldest runnable task across all task queues. The spec leaves this choice to the
    implementation.
- **Simplifications:** ordinary statements take no simulated time. Only `processBatch()` costs CPU (the knob).
  Rendering takes 0 ms. Native calls (`console.log`, `setTimeout`) push no frame of their own.
- **Cross-checked in real Chrome 155 (headless).** The model's output order matches all four programs: `script,
  done, then 1, micro, then 2, timeout, fetched`, and `script, load 1, done, load 2, then, load 3`. Starvation: the
  timeout runs after chunk 8, and the first frame shows 8/8. Yielding: chunk 1, then timeout, then chunks 2…8.
  A bare `setTimeout(f, 0)` chain is first delayed at its 8th call, exactly where the spec's "nesting level > 5"
  puts it. Chrome also pads timers after long tasks by about 4 ms, which the spec allows ("optionally, wait a
  further implementation-defined length of time"). This model does not add that padding.

## Scenarios

| story | program | what it teaches |
|---|---|---|
| Which runs first? | `console.log`, `setTimeout(0)`, `Promise.resolve().then().then()`, `queueMicrotask`, `fetch().then()`. | Output `script, done, then 1, micro, then 2, timeout, fetched`. `then 2` is added during the microtask round and still runs before the timer that was queued first. The `fetch` callback is a microtask that runs after the reply task. Two predict questions: does `timeout` print at once, and what runs after the script? |
| Code after await | `async function load()` with `await null`, then `await fetch()`. | `load()` returns at its first `await`. `done` prints before `load 2`. The paused function leaves the stack and waits in a queue or on its promise. Predict: what prints after `load 1`? |
| Promises that never stop | 8 chunks of 4 ms, each re-queued with `queueMicrotask`. | The 16.7 ms rendering opportunity queues a render task that waits until 32 ms. The 0 ms timer runs at 32 ms. The page goes 0/8 → 8/8 in a single repaint. Predict: does the browser repaint at 16.7 ms? |
| Taking turns with setTimeout | The same chunks, re-queued with `setTimeout(chunk, 0)`. | `timeout` runs at 4 ms. Repaints show 5/8 and 8/8 in between. Chunk 7 runs at timer nesting level 6, so its timer is clamped to 4 ms and the thread idles (the "Timer limit" chapter). |

Knobs: network delay (5–120 ms), chunks (3–10), work per chunk (1–8 ms), screen refresh (60/120 Hz).

## Invariants (verify checks every step of every run)

- **Console matches the reference model.** The console in the world is always a prefix of what `reference()`
  prints, timestamps included, and all of it at the end. `reference()` is an independent implementation: plain
  closures over a minimal promise (with the thenable job), generator-based async functions, timers, a network and
  vsync.
- The stack is empty whenever a task or a microtask checkpoint begins.
- No task starts while microtasks are queued.
- The frames drawn on the stack are the model's call stack, bottom to top.
- The task, microtask and frame counts equal the reference's.

## Commands

```sh
node ../../scripts/verify.mjs figure.mjs                 # 44 runs, 0 failing
node ../../scripts/build.mjs figure.mjs                  # the-event-loop.html
node ../../scripts/shoot.mjs the-event-loop.html --scenario all
node ../../scripts/audit.mjs the-event-loop.html --scenario all
```
