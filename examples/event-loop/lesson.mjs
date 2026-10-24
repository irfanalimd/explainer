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
// Every real-world claim names its source as [id] (lesson.sources below), with a locator where it helps.
const HTML_LOOP = "[whatwg-loop] §8.1.7.3 Processing model";
const HTML_TIMERS = "[whatwg-timers] the timer initialisation steps";
const ES_PROMISE = "[ecma-promise] NewPromiseResolveThenableJob";
const ES_AWAIT = "[ecma-await] the Await abstract operation";
const ARCHIBALD = "[archibald2015]";
const V8_ASYNC = "[v8-async2018]";
const FETCH = "[whatwg-fetch] the fetch() method";
const NODE_LOOP = "[node-loop] Phases overview; [node-process] queueMicrotask() vs. process.nextTick()";
const MDN_YIELD = "[mdn-yield]";

export const lesson = {
  sources: [
    { id: "whatwg-loop", short: "HTML standard, event loops", title: "HTML Living Standard, §8.1.7 Event loops", by: "WHATWG", year: 2026, where: "html.spec.whatwg.org",
      url: "https://html.spec.whatwg.org/multipage/webappapis.html#event-loops",
      supports: "tasks and task queues, the microtask checkpoint that runs until the queue is empty, rendering queued as a task on the rendering task source" },
    { id: "whatwg-render-task", short: "WHATWG html #10007", title: "Refactor event-loop processing model to perform rendering as a task (pull request #10007)", by: "WHATWG", year: 2024, where: "github.com/whatwg/html",
      url: "https://github.com/whatwg/html/pull/10007",
      supports: "since January 2024 the standard updates the rendering in a task; before, it was a step of the loop between tasks" },
    { id: "whatwg-timers", short: "HTML standard, timers", title: "HTML Living Standard, §8.6 Timers: the timer initialisation steps", by: "WHATWG", year: 2026, where: "html.spec.whatwg.org",
      url: "https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timer-initialisation-steps",
      supports: "a due timer queues a task; past a nesting level of 5, a timeout under 4 ms becomes 4 ms" },
    { id: "ecma-promise", short: "ECMAScript, promise jobs", title: "ECMAScript Language Specification, promise jobs", by: "Ecma TC39", year: 2026, where: "tc39.es/ecma262",
      url: "https://tc39.es/ecma262/#sec-newpromiseresolvethenablejob",
      supports: "a handler that returns a promise costs extra jobs before the next handler runs" },
    { id: "ecma-await", short: "ECMAScript, Await", title: "ECMAScript Language Specification, Await", by: "Ecma TC39", year: 2026, where: "tc39.es/ecma262",
      url: "https://tc39.es/ecma262/#await",
      supports: "the rest of an async function after await runs as a promise reaction job" },
    { id: "archibald2015", title: "Tasks, microtasks, queues and schedules", by: "Jake Archibald", year: 2015, where: "jakearchibald.com",
      url: "https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/",
      supports: "the script start / setTimeout / promise1 / promise2 / script end test and its answer; Edge, Firefox 40 and Safari 8.0.8 logging setTimeout first in 2015; a real click's listeners against element.click()" },
    { id: "roberts2014", title: "What the heck is the event loop anyway?", by: "Philip Roberts", year: 2014, where: "JSConf EU (talk)",
      url: "https://www.youtube.com/watch?v=8aGhZQkoFbQ",
      supports: "the call stack, the Web APIs and the callback queue drawn as separate boxes: the parts this figure's world shows" },
    { id: "v8-async2018", title: "Faster async functions and promises", by: "Maya Armyanova and Benedikt Meurer", year: 2018, where: "v8.dev blog",
      url: "https://v8.dev/blog/fast-async",
      supports: "awaiting a native promise went from three microtask ticks to one (V8 7.2, after a spec change)" },
    { id: "whatwg-fetch", short: "Fetch standard", title: "Fetch Living Standard, the fetch() method", by: "WHATWG", year: 2026, where: "fetch.spec.whatwg.org",
      url: "https://fetch.spec.whatwg.org/#fetch-method",
      supports: "the response resolves fetch's promise from a queued task" },
    { id: "node-loop", short: "Node.js event loop guide", title: "The Node.js Event Loop", by: "Node.js", year: 2026, where: "nodejs.org/en/learn",
      url: "https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick",
      supports: "Node's loop runs in phases (timers, poll, check); setTimeout(0) against setImmediate in the main module runs in no fixed order" },
    { id: "node-process", short: "Node.js process docs", title: "Node.js API, process: when to use queueMicrotask() vs. process.nextTick()", by: "Node.js", year: 2026, where: "nodejs.org/api",
      url: "https://nodejs.org/api/process.html#when-to-use-queuemicrotask-vs-processnexttick",
      supports: "the next-tick queue drains before the promise microtask queue; process.nextTick is marked legacy in favour of queueMicrotask" },
    { id: "mdn-yield", title: "Scheduler: yield() method", by: "MDN", year: 2026, where: "developer.mozilla.org",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield",
      supports: "yield() hands the thread back and continues as a prioritized task; not yet in every major browser" },
    { id: "chrome88-timers", short: "Archibald 2021", title: "Heavy throttling of chained JS timers beginning in Chrome 88", by: "Jake Archibald, Chrome for Developers", year: 2021, where: "developer.chrome.com",
      url: "https://developer.chrome.com/blog/timer-throttling-in-chrome-88",
      supports: "a hidden tab checks timers once per second, and chained timers once per minute after 5 minutes hidden" },
  ],

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
    { id: "m-await", wrong: "If the awaited value is already there, the function carries on with the next line.",
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
      { id: "notes", picture: "sticky notes marked “before the next order”", real: "the microtask queue: code waiting on a promise, code after await", term: "microtask" },
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
      teach: { prompt: "Before it runs: read the script on screen and write down the order you think its lines print.", listen: "Expect `timeout` early, right after `script`, because it was set up first with 0 ms. Keep every guess on the board: the run settles them. This is Jake Archibald's well-known test, with two calls added.", minutes: 3 },
      "teach@await": { prompt: "Read `load()`. Does `load 2` print before or after the script's last line, `done`?", listen: "Expect “before”: `await null` waits for nothing, so it looks free. The run shows the rest of `load()` waits until the script has finished.", minutes: 3 },
      "teach@starve": { prompt: "The job is cut into chunks so the page stays usable. Will the progress bar move while it runs?", listen: "Expect “yes, the chunks leave gaps”. Each chunk queues the next as a microtask, and the loop runs microtasks until none is left, so no gap opens.", minutes: 3 },
      "teach@yield": { prompt: "Same job, but each chunk queues the next with `setTimeout(chunk, 0)`. What changes for the progress bar, and what might it cost?", listen: "The bar moves between chunks. The cost shows up later: past five nested timers, 0 ms becomes 4 ms, and the thread sits idle.", minutes: 3 },
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
      teach: { prompt: "The script is done. What runs first: the timer set at the top, or the promise callbacks?", listen: "Expect the order the lines were written in. The loop runs every waiting microtask before any task, even `then 2`, which joins the queue mid-round.", minutes: 4 },
      "teach@await": { prompt: "Two microtasks wait: the rest of `load()` and `then`. Which goes first, and why?", listen: "The rest of `load()` was queued first, at the `await`, so it runs first. Both waited for the script to end.", minutes: 3 },
      "teach@starve": { prompt: "Chunk 2 is a microtask that queues chunk 3. When does the 0 ms timer get its turn?", listen: "Only when the chain ends. The checkpoint checks the queue again after every microtask, so a chain that keeps adding one never lets a task in.", minutes: 4 },
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
      teach: { prompt: "The timer was due at 0 ms, before every promise callback was even queued. Why does it print after them?", listen: "Its callback is a task, and the loop takes a task only once the microtask queue is empty. “Due” means “allowed to queue”, not “runs now”.", minutes: 2 },
      about: "A timer's callback waits in the task queue. The loop takes one task at a time, and only once the microtasks are done, so even a 0 ms timer waits.",
      enter: { sofar: "Every microtask has run, even `then 2`, added along the way.", now: "Take one task: the 0 ms timer, waiting since the start.",
        done: "`timeout` prints after every promise callback." },
    },
    network: {
      teach: { prompt: "Nothing happens on the thread for a while. Where is the request meanwhile, and who is waiting for it?", listen: "In the browser's network code, outside JavaScript; the thread idles. The reply comes back as a task, and the code waiting on it follows as microtasks.", minutes: 3 },
      about: "The request runs in the background, outside JavaScript. Its reply arrives as a task; running it makes the promise ready, and the code waiting on it is queued as microtasks.",
      enter: { sofar: "Both queues are empty, but `fetch` has no reply yet.", now: "The reply arrives as a task, and the code waiting on it follows.",
        done: "`fetched` prints right after the reply task." },
      "enter@await": { sofar: "Both queues are empty, but `load()` waits on its `fetch`.", now: "The reply arrives as a task, and `load()` resumes as a microtask.",
        done: "`load 3` prints, and `load()` finishes." },
    },
    tasks: {
      teach: { prompt: "The timer waited for the whole chain. What else was waiting with it?", listen: "The repaint, and any click or key press: all of them are tasks. So the screen jumped from nothing to done in one repaint, and no click got an answer until then.", minutes: 3 },
      about: "The microtasks are done at last, so the loop takes tasks again: the timer, then the render task. This model takes the oldest task first; a real browser may serve the repaint's queue sooner.",
      enter: { sofar: "The last chunk is done, but the 0 ms timer waited the whole time.", now: "Take tasks again: the timer, then the repaint.",
        done: "The screen jumps from nothing to done in one repaint." },
    },
    turns: {
      teach: { prompt: "Each chunk is now its own task. What can run between two chunks?", listen: "Any other task: the waiting timer, a repaint, a click. That gap is what keeps a long job from freezing the page.", minutes: 3 },
      about: "Each chunk is now its own task. Between chunks, the loop can run other tasks, like the waiting timer and the render task that repaints the page.",
      enter: { sofar: "The script ended, and the next chunk waits in the task queue.", now: "Let other tasks run between chunks.",
        done: "`timeout` prints right after chunk 1, and repaints can slot in between chunks." },
    },
    clamp: {
      teach: { prompt: "Why would the standard slow down a chain of 0 ms timers on purpose?", listen: "So a page can't keep the thread busy flat out with timers alone. Past five nested timers, a 0 ms delay becomes 4 ms; a hidden tab is throttled much harder still.", minutes: 2 },
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
      plain: "`setTimeout` hands {callback}, a function for later (a {term:callback}), to the browser's timer and returns. Nothing prints.",
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
          real: "This figure's boxes, the call stack, the Web APIs and the queue, follow Philip Roberts' JSConf EU 2014 talk on the event loop.",
          source: "[whatwg-timers]; [roberts2014]",
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
      plain: "{fn} runs first and prints {printed}.",
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
        edge: "This is Jake Archibald's 2015 test with `queueMicrotask` and `fetch` added. His answer holds: the script, then the promise callbacks, then the timer.",
        real: "Node prints the same order here. Its loop runs in phases (timers, poll, check), and it empties its `process.nextTick` queue before the promise jobs, so Node-only code can order differently.",
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
      plain: "It prints {printed}. While JavaScript runs, the screen can't be redrawn: no {term:repaint}.",
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
          real: "A hidden tab is slower still: Chrome checks its timers once a second, and a chain of timers once a minute after 5 minutes hidden.",
          source: "[whatwg-timers]; [chrome88-timers]",
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
        how: "At each rendering opportunity the standard queues a task on the rendering task source to update the rendering. It is a task like the timer, so it waits for the microtask checkpoint.",
        edge: "This is recent: until January 2024 the standard updated the rendering as a step of the loop between tasks. Either way, it never ran between two microtasks.",
        real: "This model takes the oldest task first; a browser may serve a waiting repaint ahead of other tasks.",
        source: "[whatwg-loop] §8.1.7.3 Processing model; [whatwg-render-task]",
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
          how: "`requestAnimationFrame` callbacks run inside this same rendering step, right before the paint, so they see the page as the user will.",
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
        edge: "A user's click is a task too, so for those {timeoutAt} every click and key press waited in its queue: the page looked frozen.",
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
        real: "`scheduler.yield()` hands the thread back with no 4 ms limit, and the rest of the work returns as a prioritized task. It is not yet in every major browser.",
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
          feedback: "If you thought a queued function runs as soon as it can: `then` is queued, but nothing cuts into running code. The script prints {printed} first." },
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
