// The words the event loop figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure owns
// every fact and passes it as a var; nothing here computes. Every line stays true at every knob value (network delay
// 5–120 ms, 3–10 chunks, 1–8 ms per chunk, 60 or 120 Hz). The plan is in review/curriculum.md.
//   every step:   now, at, tasksQueued, microQueued, depth, chunks, work, latency, hz
//   a statement:  fn, entry, lead (when entered), returns; fnId only while the frame stays on screen (returns false)
//   script:       story (intro); taskId (take); printed, lineId (log, done); callback, callbackId, delay (set-timeout);
//                 first, second, firstId, secondId (promise); callback, callbackId, behind (queue-micro, queue-then);
//                 url, requestId, callback, callbackId, reply (fetch); waiting, waitingIds, queued (end)
//   callbacks:    printed, lines, lineId (micro.*, task.timeout, load.log-*); settled (load.await-*)
//   settle.ready: ready, readyIds          task.reply: ready, readyIds, url
//   arrivals:     what, tileId, idle, idleFor, due, busy, running; a timer adds callback, delay, atOnce
//                 (arrive.timer-late: a timer that arrives after the thread idled)
//   task.render:  painted, shown, late, wasLate, repaints, pageId
//   chunks:       done, cost, pageId (work); done, printed, lineId, painted (log); done, how, level?, delay? (requeue);
//                 done, from, to, printed, lineId, how, level?, delay? (run, and clamped: a chunk whose next timer
//                 is forced to 4 ms)
//   end.*:        printed, lines, lineIds; starve and yield add timeoutAt, repaints, paints, firstPaint, lastPaint,
//                 clampIdle, clamped
// The figure's `lead` words are not used: each entry says how its frame was entered in its own words.
const HTML_LOOP = "HTML Living Standard, §8.1.7 Event loops, https://html.spec.whatwg.org/multipage/webappapis.html#event-loops";
const HTML_TIMERS = "HTML Living Standard, timer initialisation steps, https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timer-initialisation-steps";
const ES_PROMISE = "ECMAScript, PerformPromiseThen and NewPromiseResolveThenableJob, https://tc39.es/ecma262/#sec-newpromiseresolvethenablejob";
const ES_AWAIT = "ECMAScript, Await, https://tc39.es/ecma262/#await";
const ARCHIBALD = "J. Archibald, Tasks, microtasks, queues and schedules (2015), https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/";
const V8_ASYNC = "V8 blog, Faster async functions and promises (2018), https://v8.dev/blog/fast-async";
const FETCH = "Fetch Standard, the fetch() method, https://fetch.spec.whatwg.org/#fetch-method";
const NODE_LOOP = "Node.js, The Node.js Event Loop, https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick";
const MDN_YIELD = "MDN, Scheduler: yield() method, https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield";

export const lesson = {
  goal: "Predict the order in which a page's code, promise callbacks, timers and repaints run on one thread.",

  objectives: [
    { id: "o-order", text: "Predict the print order of a script that mixes plain code, a 0 ms timer and promise callbacks." },
    { id: "o-drain", text: "Explain why every waiting microtask, even one added along the way, runs before the next task." },
    { id: "o-await", text: "Predict where the code after an await runs, even when the awaited value is already there." },
    { id: "o-paint", text: "Explain why a chain of microtasks freezes the screen, and choose setTimeout to let it repaint." },
  ],

  misconceptions: [
    { id: "m-now", wrong: "A callback that is ready, like a 0 ms timer, runs right away, in the middle of my script.",
      fix: "Running code is never interrupted: a callback waits until the script ends and the stack is empty." },
    { id: "m-order", wrong: "Callbacks run in the order they were set up, so the timer queued first goes first.",
      fix: "After each task the loop empties the microtask queue first; a timer is a task, so it waits behind them all." },
    { id: "m-await", wrong: "If the awaited value is already there, the function just carries on with the next line.",
      fix: "The rest of an async function always becomes a microtask, so the caller's code finishes first." },
    { id: "m-paint", wrong: "The browser repaints whenever a new frame is due, between any two pieces of work.",
      fix: "A repaint is a task, and no task starts while microtasks wait, so a chain of microtasks holds it back." },
    { id: "m-chain", wrong: "A chain of callbacks holds back the screen until the whole job ends, however each link is queued.",
      fix: "Only the microtask queue runs until it is empty. A chain of tasks gives the loop a turn between links, for a repaint or a click." },
  ],

  picture: {
    name: "one cook with an order rail",
    rows: [
      { id: "cook", picture: "the one cook in the kitchen", real: "the one thread that runs JavaScript" },
      { id: "rail", picture: "the order rail, one ticket at a time", real: "the task queue: the script, timers, network replies, repaints", term: "task" },
      { id: "notes", picture: "sticky notes marked “before the next order”", real: "the microtask queue: promise callbacks, code after await", term: "microtask" },
      { id: "pan", picture: "the dish in the cook's hands", real: "the call stack: the code running now", term: "call stack" },
      { id: "rule", picture: "the rule: finish a dish, read every note, then take the next ticket", real: "the event loop", term: "event loop" },
      { id: "helpers", picture: "kitchen timers and delivery drivers", real: "the browser's timers and network, working in the background", term: "Web APIs" },
    ],
    breaks: "A real cook might glance at a new ticket mid-dish. This one never does: each dish is finished, and every note read, even notes that add more notes, before the next ticket.",
  },

  terms: {
    task: { lead: "a ticket on the order rail", def: "One job waiting its turn on the main to-do line: the script, a timer's callback, a network reply." },
    microtask: { lead: "a “before the next order” note", def: "A small job that must run as soon as the current code ends, before any new task." },
    "event loop": { lead: "the cook's rule", def: "The rule the thread follows forever: run one task, then every waiting microtask, then repeat." },
    "call stack": { lead: "what is cooking now", def: "The functions running right now, piled up. New work can start only when it is empty." },
    callback: { lead: "a function for later", def: "A function you hand over, to be called later when something happens." },
    "Web APIs": { lead: "the browser's helpers", def: "The browser's own helpers, like timers and the network, which work in the background." },
    promise: { lead: "a result not ready yet", def: "An object standing for a result that is not ready yet. Code can wait for it." },
    repaint: { lead: "redrawing the screen", def: "The browser redrawing the screen so it shows the page's latest changes." },
    await: { lead: "pause here until ready", def: "Inside an async function, it pauses the function until a promise is ready; the rest runs later." },
  },

  chapters: {
    script: {
      about: "Think of one cook with an order rail. Each order waits its turn on the rail, and sticky notes marked “before the next order” are read after every dish.",
      enter: { sofar: "You can call functions and print with `console.log`.", now: "Run the script, the first job, from top to bottom.",
        done: "Every line runs in order, and each function handed over for later waits in a box.", picture: true },
      "enter@await": { sofar: "You can call functions and print with `console.log`.", now: "Run a script that calls an `async` function.",
        done: "The console shows which line prints right after the `await`.", picture: true },
      "enter@starve": { sofar: "You can call functions and print with `console.log`.", now: "Run a script that starts a long job, one chunk at a time.",
        done: "Chunk 1 prints, and the next chunk waits in a queue.", picture: true },
      "enter@yield": { sofar: "You can call functions and print with `console.log`.", now: "Run the same long job, chunk by chunk, with timers.",
        done: "Chunk 1 prints, and the next chunk waits in the task queue.", picture: true },
    },
    micro: {
      about: "When the stack is empty, the loop runs every waiting microtask. Microtasks added along the way run too, before any new task.",
      "about@await": "When the stack is empty, the loop runs every waiting microtask, like the code after an `await`. Microtasks added along the way run too, before any new task.",
      "about@starve": "When the stack is empty, the loop runs every microtask, even new ones added along the way. Here each chunk adds the next, so the timer and repaints must wait.",
      enter: { sofar: "The script ran to its end, but nothing it handed over has run yet.", now: "Run every waiting microtask, even ones added along the way.",
        done: "The microtask queue is empty before one task leaves the task queue." },
      "enter@await": { sofar: "The script finished, but the rest of `load()` still waits.", now: "Run the waiting microtasks, the rest of `load()` first.",
        done: "`load()` prints again, then parks at its `fetch`." },
      "enter@starve": { sofar: "Chunk 1 ran inside the script, and it queued chunk 2 as a microtask.", now: "Run the microtasks, while each chunk queues the next.",
        done: "No task runs, not even the 0 ms timer, until the last chunk is done." },
    },
    timer: {
      about: "A timer's callback waits in the task queue. The loop takes one task at a time, and only once the microtasks are done, so even a 0 ms timer waits.",
      enter: { sofar: "Every microtask has run, even `then 2`, added along the way.", now: "Take one task: the 0 ms timer, waiting since the start.",
        done: "`timeout` prints after every promise callback." },
    },
    network: {
      about: "The request runs in the background, outside JavaScript. Its reply arrives as a task; running it makes the promise ready, and the code waiting on it is queued as microtasks.",
      enter: { sofar: "Both queues are empty, but `fetch` has no reply yet.", now: "The reply arrives as a task, and the code waiting on it follows.",
        done: "`fetched` prints right after the reply task." },
      "enter@await": { sofar: "Both queues are empty, but `load()` waits on its `fetch`.", now: "The reply arrives as a task, and `load()` resumes as a microtask.",
        done: "`load 3` prints, and `load()` finishes." },
    },
    tasks: {
      about: "The microtasks are finally done, so the loop takes tasks again: the long-waiting timer, then the render task. This model takes the oldest task first; real browsers often let a repaint go ahead.",
      enter: { sofar: "The last chunk is done, but the 0 ms timer waited the whole time.", now: "Take tasks again: the timer, then the repaint.",
        done: "The screen jumps from nothing to done in one repaint." },
    },
    turns: {
      about: "Each chunk is now its own task. Between chunks, the loop can run other tasks, like the waiting timer and the render task that repaints the page.",
      enter: { sofar: "The script ended, and the next chunk waits in the task queue.", now: "Let other tasks run between chunks.",
        done: "`timeout` prints right after chunk 1, and repaints can slot in between chunks." },
    },
    clamp: {
      about: "Browsers slow down long chains of timers: once timers have set timers more than five deep, a 0 ms delay becomes 4 ms. The thread idles meanwhile.",
      enter: { sofar: "Each chunk set a 0 ms timer, and the next chunk was queued at once.", now: "Past five timers deep, a 0 ms timer must wait 4 ms.",
        done: "The thread sits idle before each later chunk." },
    },
  },

  steps: {
    // ---- The script: the parts (every story) ----
    "script.intro": {
      plain: "The script is the first {term:task}: one order on the rail, for one cook.",
      why: "One thread runs everything, so every job waits its turn like this one.",
      "plain@await": "The script, the first {term:task}, calls an async function, `load()`.",
      "why@await": "An async function reads like plain code, so it is tempting to read it top to bottom.",
      "plain@starve": "The script, the first {term:task}, starts a long job: {chunks} chunks of {work} ms.",
      "why@starve": "Each chunk queues the next with `queueMicrotask`; watch whether the page's progress bar moves.",
      "plain@yield": "The script, the first {term:task}, starts the same job: {chunks} chunks of {work} ms.",
      "why@yield": "This time each chunk queues the next with `setTimeout(chunk, 0)`; watch the progress bar.",
      look: ["script-task"], picture: "rail",
    },
    "script.take": {
      key: true,
      plain: "The cook's rule, the {term:event loop}, takes the oldest task: the script.",
      why: "One thread can do one thing at a time, so something must pick what runs next.",
      look: ["{taskId}"], picture: "rule",
      deeper: {
        how: "The standard's processing model: take the oldest runnable task from a task queue, run it to the end, then perform a microtask checkpoint. Repeat forever.",
        real: "A browser keeps several task queues (input, timers, networking) and may choose which queue to serve next. Only the order inside one queue is fixed.",
        source: HTML_LOOP,
      },
    },
    "script.log": {
      plain: "The script is what's cooking now, on the {term:call stack}. It prints {printed}.",
      why: "Plain code runs line by line, and nothing can cut in while it does.",
      look: ["{fnId}", "{lineId}"], picture: "pan",
    },
    "script.set-timeout": {
      key: true,
      plain: "`setTimeout` hands {callback} to the browser's timer and returns. Nothing prints.",
      why: "0 ms is only the earliest it may run; the script keeps the thread until its last line.",
      look: ["{callbackId}"],
      deeper: {
        how: "setTimeout starts a timer outside JavaScript and returns at once. When the timer is up, the browser queues a task that calls the function.",
        edge: "The standard adds no delay to a 0 ms timer. Only timers that set timers more than five deep get at least 4 ms.",
        source: HTML_TIMERS,
      },
    },
    "script.set-timeout@starve": {
      plain: "The script, now on the {term:call stack}, sets a 0 ms timer for {callback}.",
      look: ["{callbackId}"], picture: "pan",
    },
    "script.set-timeout@yield": {
      plain: "The script, now on the {term:call stack}, sets a 0 ms timer for {callback}.",
      look: ["{callbackId}"], picture: "pan",
    },
    "arrive.timer": {
      first: {
        why: "The timer is done, but the script still holds the thread, so {callback} waits in line.",
        deeper: {
          how: "A due timer never interrupts: the browser only queues a task, and the loop picks tasks only between other tasks.",
          source: HTML_TIMERS,
        },
      },
      plain: "The {delay} timer is up: {callback} joins the task queue at {due}.",
      "plain@order": "The timer, one of the browser's {term:Web APIs}, is up: {callback} joins the task queue.",
      "picture@order": "helpers",
      look: ["{tileId}"],
    },
    "arrive.timer-late": {
      first: {
        why: "Nothing else was queued, so the thread sat idle, waiting only for the timer limit.",
      },
      plain: "The thread idles {idleFor}. At {due} the {delay} timer puts {callback} in the task queue.",
      look: ["{tileId}"],
    },
    "script.promise": {
      plain: "`Promise.resolve()` is ready at once: {first} joins the {term:microtask} queue; {second} waits for it.",
      look: ["{firstId}", "{secondId}"], picture: "notes",
    },
    "script.queue-micro": {
      plain: "`queueMicrotask` puts {callback} straight into the microtask queue, behind {behind}.",
      look: ["{callbackId}"],
    },
    "script.fetch": {
      plain: "`fetch` asks the network, another of the Web APIs, for {url}. {callback} waits for the reply.",
      look: ["{requestId}", "{callbackId}"],
    },
    "script.done": {
      plain: "The last line prints {printed}. Nothing handed over has run yet.",
      look: ["{lineId}"],
    },
    "script.done@await": {
      key: true,
      plain: "The script's last line prints {printed}, before anything after the first await.",
      why: "The rest of `load()` waits in the microtask queue, and microtasks wait for the script to end.",
      look: ["{lineId}"],
      deeper: {
        how: "An async function runs at once, like any call, up to its first `await`; there it returns a promise to its caller, which carries on.",
        edge: "An async function with no `await` at all runs to its end on the spot. Only the `.then` callbacks on the promise it returns wait.",
        source: ES_AWAIT,
      },
    },
    "script.end": {
      key: true,
      plain: "The script ends, so the stack is empty. {waiting} {be:waiting} in the microtask queue.",
      why: "Nothing could cut in while the script ran; the empty stack is the loop's turn to choose.",
      look: ["micro"],
      deeper: {
        how: "The standard calls this “clean up after running script”: once the stack is empty, a microtask checkpoint runs before the loop returns to its task queues.",
        source: HTML_LOOP,
      },
    },
    "script.end@yield": {
      key: true,
      plain: "The script ends. No {term:microtask} waits, so the loop takes the oldest task.",
      why: "The next chunk went to the task queue, so it takes its turn like any other task.",
      look: ["tasks"],
      deeper: {
        how: "The standard calls this “clean up after running script”: once the stack is empty, a microtask checkpoint runs. Here it finds nothing, so the loop goes back to its task queues.",
        source: HTML_LOOP,
      },
    },

    // ---- Before the next task (order) ----
    "micro.then-1": {
      key: true,
      plain: "{fn}, a function for later (a {term:callback}), runs first and prints {printed}.",
      why: "After every task, the loop runs all waiting microtasks before it takes another task.",
      look: ["{fnId}", "{lineId}"], picture: "rule",
      deeper: {
        how: "This is the microtask checkpoint: while the microtask queue is not empty, take the oldest microtask and run it.",
        real: "A checkpoint runs whenever the stack empties, not only after a task. So a real click runs each listener's microtasks before the next listener, but `button.click()` from a script does not: the script is still on the stack.",
        source: ARCHIBALD,
      },
    },
    "settle.ready": {
      plain: "{fn} returns, so its {term:promise} is ready: {ready} joins the microtask queue.",
      why: "A `.then` callback waits for the one before it, so {ready} is new to the queue.",
      look: ["{readyIds}"],
      deeper: {
        how: "Each `.then` returns a new promise. When the handler returns, that promise is settled, which queues the next handler as a job.",
        edge: "If a handler returns a promise instead of a value, the next `.then` waits two extra microtask turns (a NewPromiseResolveThenableJob, then its own `.then`).",
        source: ES_PROMISE,
      },
    },
    "micro.micro": {
      plain: "First in, first out: {fn} runs next and prints {printed}.",
      look: ["{lineId}"],
    },
    "micro.then-2": {
      key: true,
      plain: "{fn} runs too, though its promise was ready only mid-round. It prints {printed}.",
      why: "Microtasks added during the round still run before the timer that waited all along.",
      look: ["{lineId}"],
      deeper: {
        how: "The standard's checkpoint loops “while the event loop's microtask queue is not empty”, so it checks the queue again after every microtask.",
        edge: "So a microtask that always queues another never lets the loop reach a task: no timer, no click, no repaint.",
        source: HTML_LOOP,
      },
    },
    "micro.then": {
      plain: "{fn} was next in line: it runs and prints {printed}.",
      look: ["{lineId}"],
    },

    // ---- The timer (order); the first task after the script (starve, yield) ----
    "task.timeout": {
      key: true,
      plain: "Only now does the loop take a task: {fn}. It prints {printed}.",
      why: "{fn} was set up before every promise callback, but a task waits for the microtasks.",
      look: ["{lineId}"],
      deeper: {
        real: "Browsers did not always agree. In 2015 Edge, Firefox 40 and Safari 8 printed `timeout` before the promise callbacks; today every engine runs promise callbacks as microtasks.",
        source: ARCHIBALD,
      },
    },
    "task.timeout@starve": {
      plain: "At last a task: {fn}, due at 0 ms, runs at {at}.",
      why: "The chain of chunk microtasks held it back for {at}.",
      look: ["{lineId}"],
    },
    "task.timeout@yield": {
      plain: "The oldest task goes first: {fn}, due at 0 ms, runs at {at}.",
      why: "The next chunk is a task too, queued after {fn}, so {fn} gets its turn first.",
      look: ["{lineId}"],
    },

    // ---- The network (order, await) ----
    "arrive.network": {
      plain: "The thread idles until {due}; then the network reply is queued as a task.",
      why: "The request ran in the Web APIs the whole time; the thread never waited on it.",
      "plain@await": "At {due} the browser's network, one of its {term:Web APIs}, queues the reply task.",
      "why@await": "The request ran in the background; the thread had nothing to do meanwhile.",
      look: ["{tileId}"], "picture@order": "cook",
    },
    "task.reply": {
      plain: "The reply task makes the `fetch` promise ready, so {ready} joins the microtask queue.",
      why: "A task can queue microtasks, and they run as soon as that task ends.",
      look: ["{readyIds}"],
      deeper: {
        how: "When the response arrives, the browser queues a task to resolve the promise `fetch` returned. Resolving it queues every waiting reaction as a microtask, in the order they were added.",
        source: FETCH,
      },
    },
    "micro.fetched": {
      plain: "Right after that task, the microtask runs: {fn} prints {printed}.",
      look: ["{lineId}"],
    },
    "end.order": {
      key: true,
      plain: "Printed: {printed}. Script first, then microtasks, then tasks.",
      why: "The order follows the queues, not the order the lines were written in.",
      look: ["console"],
      deeper: {
        cost: "The run takes {at} of simulated time, all of it the network delay: the thread itself never waits.",
        real: "Node prints the same order here, but its loop has phases, and it runs `process.nextTick` callbacks before promise jobs, so `setImmediate` against `setTimeout(0)` can differ from a browser.",
        source: NODE_LOOP,
      },
    },

    // ---- Code after await ----
    "load.log-1": {
      plain: "`load()` goes on the stack, on top of the script, and prints {printed}.",
      why: "An async function starts like any other: at once, line by line.",
      look: ["{fnId}", "{lineId}"],
    },
    "load.await-null": {
      key: true,
      plain: "{term:await} pauses {fn}: it leaves the stack, and the rest of it waits in line.",
      why: "Even `await null`, with nothing to wait for, sends the rest of {fn} to the queue.",
      look: ["{fnId}"],
      deeper: {
        how: "`await v` is PerformPromiseThen(PromiseResolve(v), rest): v is wrapped in a ready promise, and the rest of the function becomes a reaction job, a microtask.",
        code: "`await null;` behaves like `return Promise.resolve(null).then(rest)`",
        edge: "Awaiting a native promise costs one microtask turn since a 2018 spec change (V8 7.2); before, it cost three, so this same code printed in a different order in older engines.",
        source: V8_ASYNC,
      },
    },
    "script.queue-then": {
      plain: "Back in the script, {callback} joins the {term:microtask} queue, behind the rest of {behind}.",
      look: ["{callbackId}"],
    },
    "load.log-2": {
      key: true,
      plain: "{fn} resumes where its await left off and prints {printed}.",
      why: "Its rest was the oldest microtask, so it runs first, once the script is done.",
      look: ["{fnId}", "{lineId}"],
      deeper: {
        how: "The engine saved {fn}'s local variables and its place when it paused. Resuming restores them in a fresh frame, with no caller under it.",
        source: ES_AWAIT,
      },
    },
    "load.await-fetch": {
      plain: "`fetch` returns a {term:promise}, a result not ready yet; `await` parks {fn} on it.",
      why: "This time the value is not ready, so {fn} waits for the network, not the queue.",
      look: ["{fnId}"],
    },
    "load.log-3": {
      plain: "{fn} resumes after its second await, prints {printed} and finishes.",
      look: ["{lineId}"],
    },
    "end.await": {
      key: true,
      plain: "Printed: {printed}. Code after await ran later.",
      why: "`load()` ran at once up to its first await; its caller finished before the rest.",
      look: ["console"],
      deeper: {
        edge: "A loop that awaits values that are already ready queues one microtask per pass, so it never lets a task, or a repaint, run in between.",
        source: ES_AWAIT,
      },
    },

    // ---- Chunks of work (starve, yield) ----
    "chunk.work": {
      plain: "`chunk()` goes on the stack: `processBatch()` keeps the thread busy {cost}, then the bar reads {done}.",
      look: ["{fnId}", "{pageId}"],
    },
    "chunk.log": {
      plain: "It prints {printed}. The screen can't redraw, a {term:repaint}, while JavaScript runs.",
      why: "Redrawing waits for its turn, like every other job on this thread.",
      look: ["{lineId}", "page"],
    },
    "chunk.requeue": {
      plain: "`queueMicrotask(chunk)` puts the next chunk in the {term:microtask} queue.",
      why: "A microtask runs before any task, repaints included, so the next chunk jumps the line.",
      look: ["micro"],
      "plain@yield": "`setTimeout(chunk, 0)` sets a timer for the next chunk instead.",
      "why@yield": "The timer's function comes back as a task, so other tasks, like a repaint, can run first.",
      "look@yield": ["webapis"],
    },
    "chunk.run": {
      first: {
        "why@starve": "It queues one more before it ends, so the microtask queue is never empty.",
        "why@yield": "It came through the task queue, not the microtask queue, so the timer went first.",
      },
      plain: "The next {fn} runs {from} → {to} and prints {printed}.",
      "plain@starve": "The next {fn} microtask runs {from} → {to} and prints {printed}.",
      "plain@yield": "The next {fn} task runs {from} → {to} and prints {printed}.",
      look: ["{lineId}"],
    },
    "chunk.clamped": {
      first: {
        key: true,
        why: "Timers that set timers more than five deep get at least 4 ms, so a 0 ms chain can't spin the thread flat out.",
        deeper: {
          how: "The standard's timer initialisation steps: “If nestingLevel is greater than 5, and timeout is less than 4, then set timeout to 4.” Each timer task runs one level deeper than the one that set it.",
          cost: "From here on, each chunk waits up to {delay} with the thread idle, on top of its {work} ms of work.",
          real: "Browsers throttle timers much harder in a background tab, often to once a second.",
          source: HTML_TIMERS,
        },
      },
      plain: "{fn} prints {printed}, then sets a timer {level} deep: 0 ms becomes {delay}.",
      look: ["{lineId}"],
    },
    "arrive.render": {
      plain: "A repaint is due at {due}: a render task joins the task queue.",
      look: ["{tileId}"],
      "key@starve": true,
      "why@starve": "Like any task, it can start only once the microtask queue is empty.",
      "deeper@starve": {
        how: "At each rendering opportunity the standard queues a task to update the rendering. It is a task like the timer, so it waits for the microtask checkpoint.",
        real: "This model takes the oldest task first; real browsers may serve a waiting repaint ahead of other tasks. None runs it between two microtasks: the checkpoint always runs to empty.",
        source: HTML_LOOP,
      },
    },
    "task.render": {
      plain: "The render task repaints: the screen shows {shown}.",
      "why@starve": "A repaint is a task, so it could run only once no microtask was left.",
      look: ["{pageId}"],
      "first@yield": {
        key: true,
        why: "A repaint is a task, so all it needs is a gap between two other tasks.",
        deeper: {
          how: "`requestAnimationFrame` callbacks run inside this same rendering step, just before the paint, so they see the page as the user will.",
          source: HTML_LOOP,
        },
      },
    },
    "end.starve": {
      key: true,
      plain: "The 0 ms timer ran at {timeoutAt}. The screen jumped from nothing to {paints}.",
      why: "While microtasks kept coming, no task could start: not the timer, not a repaint.",
      look: ["page", "console"],
      deeper: {
        cost: "{chunks} chunks of {work} ms ran back to back, so the 0 ms timer waited {timeoutAt}.",
        edge: "A user's click is a task too, so for those {timeoutAt} the page also ignored every click and key.",
        source: HTML_LOOP,
      },
    },
    "end.yield": {
      key: true,
      plain: "`timeout` ran at {timeoutAt}, and the screen updated {count:repaints|time}.",
      why: "Tasks, not microtasks, leave gaps between chunks where the timer and repaints can run.",
      look: ["page", "console"],
      deeper: {
        cost: "In this run the timer limit left the thread idle for {clampIdle}.",
        real: "`scheduler.yield()` gives the thread back without the 4 ms limit, and the rest of the work resumes ahead of other ordinary tasks.",
        source: MDN_YIELD,
      },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "script.zero": {
      question: "`setTimeout` asks to run {callback} after 0 ms. Does it print now?",
      why: "setTimeout only hands the function to the browser's timer; then it waits its turn in the task queue.",
      options: [
        { misconception: "m-now",
          feedback: "If you thought 0 ms means right away: the timer is up at once, yet {callback} only joins the task queue. Running code is never cut into, so it waits for the script to end." },
        { feedback: "Right. `setTimeout` only hands {callback} to the browser's timer; the script keeps the thread until its last line." },
      ],
    },
    "micro.next": {
      question: "The script is done and the stack is empty. Which function runs next?",
      options: [
        { misconception: "m-order",
          feedback: "If you thought callbacks run in the order they were set up: `timeout` is a task, and the loop empties the microtask queue before it takes any task. {fn} goes first." },
        { feedback: "Right. The stack is empty, so the loop runs every waiting microtask, oldest first: {fn}." },
        { misconception: "m-order",
          feedback: "If you thought the work that started first finishes first: `fetched` has no reply yet, so it waits on its request, in no queue at all. {fn} goes first." },
      ],
    },
    "script.after-await": {
      options: [
        { misconception: "m-await",
          feedback: "If you thought a ready value lets `load()` carry on: even `await null` sends the rest of `load()` to the microtask queue, so the script's next line, {printed}, prints first." },
        { feedback: "Right. The rest of `load()` is a microtask, and microtasks wait until the script ends: {printed} prints first." },
        { misconception: "m-now",
          feedback: "If you thought a queued callback runs as soon as it can: `then` is queued, but nothing cuts into running code. The script prints {printed} first." },
      ],
    },
    "micro.repaint": {
      options: [
        { misconception: "m-paint",
          feedback: "If you thought the screen redraws whenever a frame is due: a repaint is a task, and it can't cut into running code." },
        { feedback: "Right. A repaint is a task, so it waits until no microtask is left." },
        { misconception: "m-paint",
          feedback: "If you thought a repaint can slip in between microtasks: the loop runs the microtask queue until it is empty, and each chunk added one more." },
      ],
    },
    "turns.repaint": {
      options: [
        { misconception: "m-now",
          feedback: "If you thought a due frame cuts into running code: nothing pauses a chunk partway. The render task waits for the chunk to end, then takes its turn." },
        { misconception: "m-chain",
          feedback: "If you thought this chain holds the screen back like the microtask one: each chunk here is a task, so the loop can take other tasks, like this repaint, in between." },
        { feedback: "Right. The render task is next in the task queue, so the screen shows {shown} before the next chunk runs." },
      ],
    },
  },
};
