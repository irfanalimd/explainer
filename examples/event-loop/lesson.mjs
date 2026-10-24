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

  goal: "Predict the order in which a page's code, its promise callbacks, its timers and the screen's repaints take turns on one thread.",

  objectives: [
    { id: "o-order", text: "Predict the order in which a script prints when it mixes plain code, a 0 ms timer and promise callbacks." },
    { id: "o-drain", text: "Explain why every waiting microtask runs before the next task, including ones added while the queue is being emptied." },
    { id: "o-await", text: "Predict when the code after an await runs, even when the value it waits for is already there." },
    { id: "o-paint", text: "Explain why a long chain of microtasks freezes the screen, and how handing each piece to setTimeout lets it repaint." },
  ],

  misconceptions: [
    { id: "m-now", wrong: "A callback that is ready, like a 0 ms timer, runs right away, in the middle of my script.",
      fix: "Nothing ever interrupts running code. A ready callback waits until the script has finished and the call stack is empty." },
    { id: "m-order", wrong: "Callbacks run in the order they were set up, so the timer queued first goes first.",
      fix: "After each task the loop empties the microtask queue before it looks at the task queue again. A timer's callback is a task, so it waits behind every microtask, however early it was set." },
    { id: "m-await", wrong: "If the awaited value is already there, the function carries on with the next line.",
      fix: "The rest of an async function always goes to the microtask queue, even when there is nothing to wait for, so the code that called it finishes first." },
    { id: "m-paint", wrong: "The browser repaints whenever a new frame is due, between any two pieces of work.",
      fix: "A repaint is a task like any other, and no task can start while microtasks are waiting. A chain of microtasks holds the screen back until the chain ends." },
    { id: "m-chain", wrong: "A chain of callbacks holds back the screen until the whole job ends, however each link is queued.",
      fix: "Only the microtask queue is emptied in one go. When each link of the chain is a task, the loop gets a turn between links and can fit in a repaint or a click." },
  ],

  picture: {
    name: "one cook with an order rail",
    rows: [
      { id: "cook", picture: "the one cook in the kitchen", real: "the one thread that runs JavaScript" },
      { id: "rail", picture: "the order rail, one ticket at a time", real: "the task queue, which holds the script, timers, network replies and repaints", term: "task" },
      { id: "notes", picture: "sticky notes marked “before the next order”", real: "the microtask queue, which holds code waiting on a promise and code after an await", term: "microtask" },
      { id: "pan", picture: "the dish in the cook's hands", real: "the call stack, the code running right now", term: "call stack" },
      { id: "rule", picture: "the cook's rule: finish the dish, read every note, then take the next ticket", real: "the event loop", term: "event loop" },
      { id: "helpers", picture: "kitchen timers and delivery drivers", real: "the browser's timers and network, which work in the background", term: "Web APIs" },
    ],
    breaks: "A real cook might glance at a new ticket in the middle of a dish. This cook never does. Every dish is finished and every note is read, including notes that add more notes, before the next ticket comes off the rail.",
  },

  terms: {
    task: { lead: "a ticket on the order rail", def: "A job waiting its turn in line, such as the script itself, a timer's callback or a network reply." },
    microtask: { lead: "a “before the next order” note", def: "A small job that runs as soon as the current code finishes, before anything else gets a turn." },
    "event loop": { lead: "the cook's rule", def: "The rule the thread follows forever. It runs one task, then every waiting microtask, and repeats." },
    "call stack": { lead: "what is cooking now", def: "The functions running right now, each on top of its caller. New work waits until it's empty." },
    callback: { lead: "a function for later", def: "A function you hand to someone else, such as a timer, to be called later when something happens." },
    "Web APIs": { lead: "the browser's helpers", def: "Helpers built into the browser, like timers and the network, that work in the background while JavaScript runs." },
    promise: { lead: "a result not ready yet", def: "An object standing for a result that isn't ready yet. Code can wait for it." },
    repaint: { lead: "redrawing the screen", def: "The browser redrawing the screen so that it shows the page's latest changes." },
    await: { lead: "pause here until ready", def: "Inside an async function, it pauses the function until a promise is ready. The rest of the function runs later." },
  },

  chapters: {
    script: {
      teach: { prompt: "Before it runs, read the script on screen and write down the order you think its lines will print.", listen: "Most people expect `timeout` early, right after `script`, because it was set up first and asks for 0 ms. Keep every guess on the board and let the run settle them. This is Jake Archibald's well-known test with two calls added.", minutes: 3 },
      "teach@await": { prompt: "Read `load()`. Does `load 2` print before or after the script's last line, `done`?", listen: "Most will say before, because `await null` has nothing to wait for and looks free. The run shows that the rest of `load()` waits until the script has finished.", minutes: 3 },
      "teach@starve": { prompt: "The job is cut into chunks so the page stays usable. Will the progress bar move while it runs?", listen: "Expect “yes, the chunks leave gaps”. But each chunk queues the next as a microtask, and the loop keeps running microtasks until none is left, so a gap never opens.", minutes: 3 },
      "teach@yield": { prompt: "Same job, but each chunk queues the next with `setTimeout(chunk, 0)`. What changes for the progress bar, and what might it cost?", listen: "This time the bar moves between chunks. The cost shows up later, once the timers are nested more than five deep and each 0 ms delay becomes 4 ms while the thread sits idle.", minutes: 3 },
      about: "Picture a kitchen with one cook. Orders wait their turn on a rail, and the cook takes them one at a time. After each dish, the cook also reads every sticky note marked “before the next order”.",
      "about@await": "This is the same kitchen, with one cook, an order rail and the “before the next order” notes. This time the script calls an async function, which stops partway through and finishes later.",
      "about@starve": "This is the same kitchen, with one cook, an order rail and the “before the next order” notes. This time the script starts a long job cut into chunks, and each chunk leaves a note for the next one.",
      "about@yield": "This is the same kitchen and the same long job in chunks. This time each chunk puts the next one back on the order rail as a new ticket, instead of leaving a note.",
      enter: { sofar: "You can call functions and print with `console.log`.", now: "The script runs first, from top to bottom.",
        done: "Every line has run in order, and each function handed over for later is waiting in one of the boxes.", picture: true },
      "enter@await": { sofar: "You can call functions and print with `console.log`.", now: "This script calls an `async` function.",
        done: "You can see which line prints right after the `await`.", picture: true },
      "enter@starve": { sofar: "You can call functions and print with `console.log`.", now: "The script starts a long job and does it one chunk at a time.",
        done: "Chunk 1 has printed, and the next chunk is waiting in a queue.", picture: true },
      "enter@yield": { sofar: "You can call functions and print with `console.log`.", now: "The script runs the same long job chunk by chunk, but with timers this time.",
        done: "Chunk 1 has printed, and the next chunk is waiting in the task queue.", picture: true },
    },
    micro: {
      teach: { prompt: "The script is done. What runs first: the timer set at the top, or the promise callbacks?", listen: "Expect the order the lines were written in. In fact the loop runs every waiting microtask before any task, even `then 2`, which only joins the queue partway through.", minutes: 4 },
      "teach@await": { prompt: "Two microtasks wait: the rest of `load()` and `then`. Which goes first, and why?", listen: "The rest of `load()` was queued first, at the `await`, so it runs first. Both had to wait for the script to end.", minutes: 3 },
      "teach@starve": { prompt: "Chunk 2 is a microtask that queues chunk 3. When does the 0 ms timer get its turn?", listen: "Only when the chain ends. The loop checks the microtask queue again after every microtask, so a chain that keeps adding one never lets a task in.", minutes: 4 },
      about: "Once the call stack is empty, the loop runs every microtask that is waiting. If one of them adds another microtask, that one runs too, and only after that can a new task begin.",
      "about@await": "Once the call stack is empty, the loop runs every waiting microtask, and the rest of `load()` is one of them. Anything added along the way also runs before the next task.",
      "about@starve": "Once the call stack is empty, the loop runs every microtask, including new ones added along the way. Here each chunk adds the next one, so the timer and the repaints have to keep waiting.",
      enter: { sofar: "The script has run to its end, but nothing it handed over has run yet.", now: "The loop works through every waiting microtask, including any added along the way.",
        done: "The microtask queue is empty before a single task leaves the task queue." },
      "enter@await": { sofar: "The script has finished, but the rest of `load()` is still waiting.", now: "The loop runs the waiting microtasks, starting with the rest of `load()`.",
        done: "`load()` has printed again and is now waiting on its `fetch`." },
      "enter@starve": { sofar: "Chunk 1 ran inside the script and queued chunk 2 as a microtask.", now: "The loop runs the microtasks while each chunk queues the next.",
        done: "No task has run, not even the 0 ms timer, until the last chunk is done." },
    },
    timer: {
      teach: { prompt: "The timer was due at 0 ms, before every promise callback was even queued. Why does it print after them?", listen: "Its callback is a task, and the loop takes a task only once the microtask queue is empty. A timer being due only means its callback may join the queue.", minutes: 2 },
      about: "A timer's callback waits in the task queue. The loop takes tasks one at a time, and only once the microtasks are done. That's why even a 0 ms timer has to wait.",
      enter: { sofar: "Every microtask has run, including `then 2`, which was added along the way.", now: "The loop takes one task, the 0 ms timer that has been waiting since the start.",
        done: "`timeout` has printed after every promise callback." },
    },
    network: {
      teach: { prompt: "Nothing happens on the thread for a while. Where is the request meanwhile, and who is waiting for it?", listen: "It is in the browser's network code, outside JavaScript, while the thread sits idle. The reply comes back as a task, and the code waiting on it follows as microtasks.", minutes: 3 },
      about: "The request runs in the background, outside JavaScript. The reply comes back as a task. Running that task makes the promise ready, and that puts the code waiting on it into the microtask queue.",
      enter: { sofar: "Both queues are empty, but `fetch` hasn't had its reply yet.", now: "The reply arrives as a task, and the code waiting on it follows straight after.",
        done: "`fetched` has printed, right after the reply task." },
      "enter@await": { sofar: "Both queues are empty, but `load()` is still waiting on its `fetch`.", now: "The reply arrives as a task, and `load()` resumes as a microtask.",
        done: "`load 3` has printed, and `load()` has finished." },
    },
    tasks: {
      teach: { prompt: "The timer waited for the whole chain. What else was waiting with it?", listen: "The repaint, and any click or key press, since all of them are tasks. So the screen jumped from nothing to done in one repaint, and no click got an answer until then.", minutes: 3 },
      about: "The microtasks are finally done, so the loop goes back to taking tasks, first the timer and then the render task. This model takes the oldest task first, though a real browser may serve the repaint's queue sooner.",
      enter: { sofar: "The last chunk is done, and the 0 ms timer has been waiting the whole time.", now: "The loop takes tasks again, the timer first and then the repaint.",
        done: "The screen jumps from nothing to done in a single repaint." },
    },
    turns: {
      teach: { prompt: "Each chunk is now its own task. What can run between two chunks?", listen: "Any other task, such as the waiting timer, a repaint or a click. That gap is what keeps a long job from freezing the page.", minutes: 3 },
      about: "Each chunk is now a task of its own, so the loop can run other tasks between two chunks. The timer that has been waiting gets its turn, and so does the render task that repaints the page.",
      enter: { sofar: "The script has ended, and the next chunk is waiting in the task queue.", now: "Other tasks get their turn between chunks.",
        done: "`timeout` has printed right after chunk 1, and repaints can fit in between chunks." },
    },
    clamp: {
      teach: { prompt: "Why would the standard slow down a chain of 0 ms timers on purpose?", listen: "So that a page can't keep the thread busy flat out with timers alone. Once timers are nested more than five deep, a 0 ms delay becomes 4 ms, and a hidden tab is throttled far harder.", minutes: 2 },
      about: "Browsers slow down long chains of timers on purpose. Once timers have set timers more than five deep, a 0 ms delay becomes 4 ms, and the thread sits idle while it waits.",
      enter: { sofar: "Each chunk set a 0 ms timer, and the next chunk joined the queue straight away.", now: "Past five nested timers, a 0 ms timer has to wait 4 ms.",
        done: "The thread sits idle for a moment before each of the later chunks." },
    },
  },

  steps: {
    // ---- The script: the parts (every story) ----
    "script.intro": {
      plain: "The script itself is the first {term:task}, the first order on the rail for our one cook.",
      why: "Everything runs on this one thread, so every job, this one included, has to wait its turn.",
      "plain@await": "The script, the first {term:task}, calls an async function named `load()`.",
      "why@await": "An async function reads like plain code, so it's tempting to read it from top to bottom. Watch where it stops.",
      "plain@starve": "The script, the first {term:task}, starts a long job made of {chunks} chunks of {work} ms each.",
      "why@starve": "Each chunk queues the next one with `queueMicrotask`. Keep an eye on the page's progress bar and see whether it moves.",
      "plain@yield": "The script, the first {term:task}, starts the same job, {chunks} chunks of {work} ms each.",
      "why@yield": "This time each chunk queues the next with `setTimeout(chunk, 0)`. Watch the progress bar again.",
      look: ["script-task"], picture: "rail",
    },
    "script.take": {
      key: true,
      plain: "The cook's rule, called the {term:event loop}, takes the oldest task, which is the script.",
      why: "One thread can only do one thing at a time, so something has to decide what runs next. That decision is what the event loop is for.",
      "why@await": "As in the first story, the loop picks the oldest task, and so far the script is the only one.",
      "why@starve": "As in the first story, the loop picks the oldest task, and so far the script is the only one.",
      "why@yield": "As in the first story, the loop picks the oldest task, and so far the script is the only one.",
      look: ["{taskId}"], picture: "rule",
      deeper: {
        how: "In the standard's processing model, the loop takes the oldest runnable task from a task queue and runs it to the end. Then it performs a microtask checkpoint, and it repeats this forever.",
        real: "A browser keeps several task queues, for example for input, timers and networking, and it may choose which queue to serve next. Only the order within one queue is fixed.",
        source: HTML_LOOP,
      },
    },
    "script.log": {
      plain: "The script is what's cooking now, so it sits on the {term:call stack}. It prints {printed}.",
      why: "Plain code runs line by line, and nothing can cut in while it does.",
      look: ["{fnId}", "{lineId}"], picture: "pan",
    },
    "script.set-timeout": {
      key: true,
      plain: "`setTimeout` hands {callback}, a {term:callback} for later, to the browser's timer and returns. Nothing prints yet.",
      why: "The 0 ms is only the earliest it's allowed to run. The script still holds the thread, and it keeps it until its last line.",
      look: ["{callbackId}"],
      deeper: {
        how: "setTimeout starts a timer outside JavaScript and returns at once. When the timer is up, the browser queues a task that calls the function.",
        edge: "The standard adds no delay to a 0 ms timer. Only timers set by timers more than five levels deep get at least 4 ms.",
        source: HTML_TIMERS,
      },
    },
    "script.set-timeout@starve": {
      plain: "The script is on the {term:call stack} now, and it sets a 0 ms timer for {callback}.",
      look: ["{callbackId}"], picture: "pan",
    },
    "script.set-timeout@yield": {
      plain: "The script is on the {term:call stack} now, and it sets a 0 ms timer for {callback}.",
      look: ["{callbackId}"], picture: "pan",
    },
    "arrive.timer": {
      first: {
        why: "The timer has finished, but the script still holds the thread, so {callback} has to wait in line.",
        deeper: {
          how: "A timer that comes due never interrupts anything. The browser only adds a task to the queue, and the loop picks up tasks only between other tasks.",
          real: "The boxes in this picture, the call stack, the Web APIs and the queue, follow Philip Roberts' 2014 JSConf EU talk on the event loop.",
          source: "[whatwg-timers]; [roberts2014]",
        },
      },
      plain: "The {delay} timer is up, and {callback} joins the task queue at {due}.",
      "plain@order": "The timer, one of the browser's {term:Web APIs}, is up, so {callback} joins the task queue.",
      "picture@order": "helpers",
      look: ["{tileId}"],
    },
    "arrive.timer-late": {
      first: {
        why: "Nothing else was in the queue, so the thread sat idle with nothing to do but wait out the timer limit.",
      },
      plain: "After {idleFor} idle, the {delay} timer puts {callback} in the task queue at {due}.",
      look: ["{tileId}"],
    },
    "script.promise": {
      plain: "`Promise.resolve()` is ready at once, so {first} joins the {term:microtask} queue, while {second} waits.",
      look: ["{firstId}", "{secondId}"], picture: "notes",
    },
    "script.queue-micro": {
      plain: "`queueMicrotask` puts {callback} straight into the microtask queue, behind {behind}.",
      look: ["{callbackId}"],
    },
    "script.fetch": {
      plain: "`fetch` asks the network, another of the Web APIs, for {url}, and {callback} waits for the reply.",
      look: ["{requestId}", "{callbackId}"],
    },
    "script.done": {
      plain: "The last line prints {printed}. None of the functions handed over has run yet.",
      look: ["{lineId}"],
    },
    "script.done@await": {
      key: true,
      plain: "The script's last line prints {printed}, before anything that comes after the first await.",
      why: "The rest of `load()` is waiting in the microtask queue, and microtasks don't run until the script has ended.",
      look: ["{lineId}"],
      deeper: {
        how: "An async function runs at once, like any call, up to its first `await`. At that point it returns a promise to its caller, and the caller carries on.",
        edge: "An async function with no `await` at all runs to its end on the spot. Only the `.then` callbacks on the promise it returns have to wait.",
        source: ES_AWAIT,
      },
    },
    "script.end": {
      key: true,
      plain: "The script ends, leaving the stack empty and {waiting} in the microtask queue.",
      why: "While the script ran, nothing could cut in. Now that the stack is empty, it's the loop's turn to choose what runs next.",
      "why@await": "As before, the loop gets its turn once the stack is empty, and it looks at the microtask queue first.",
      "why@starve": "The loop gets its turn once the stack is empty, and it always looks at the microtask queue first. That's where the next chunk is waiting.",
      look: ["micro"],
      deeper: {
        how: "The standard calls this “clean up after running script”. Once the stack is empty, a microtask checkpoint runs before the loop goes back to its task queues.",
        source: HTML_LOOP,
      },
    },
    "script.end@yield": {
      key: true,
      plain: "The script ends. No {term:microtask} is waiting, so the loop takes the oldest task.",
      why: "The next chunk went to the task queue this time, so it takes its turn like any other task.",
      look: ["tasks"],
      deeper: {
        how: "The standard calls this “clean up after running script”. Once the stack is empty, a microtask checkpoint runs. Here it finds nothing, so the loop goes straight back to its task queues.",
        source: HTML_LOOP,
      },
    },

    // ---- Before the next task (order) ----
    "micro.then-1": {
      key: true,
      plain: "First comes {fn}, which prints {printed}.",
      why: "The script was a task, and after every task the loop runs all the waiting microtasks before it takes another one. That is how a promise callback gets ahead of the timer.",
      look: ["{fnId}", "{lineId}"], picture: "rule",
      deeper: {
        how: "This is the microtask checkpoint. As long as the microtask queue isn't empty, the loop takes the oldest microtask and runs it.",
        real: "A checkpoint runs whenever the stack empties, and that can happen in the middle of a task. With a real click, each listener's microtasks run before the next listener starts. A `button.click()` called from a script behaves differently, because the script is still on the stack.",
        source: ARCHIBALD,
      },
    },
    "settle.ready": {
      plain: "When {fn} returns, its {term:promise} is ready, and {ready} joins the microtask queue.",
      why: "A `.then` callback waits for the one before it, so {ready} is only joining the queue now.",
      look: ["{readyIds}"],
      deeper: {
        how: "Each `.then` returns a new promise. When the handler returns, that promise is settled, and settling it queues the next handler as a job.",
        edge: "If a handler returns a promise instead of a plain value, the next `.then` waits two extra microtask turns, one for a NewPromiseResolveThenableJob and one for its own `.then`.",
        source: ES_PROMISE,
      },
    },
    "micro.micro": {
      plain: "The queue is first in, first out, so {fn} runs next and prints {printed}.",
      look: ["{lineId}"],
    },
    "micro.then-2": {
      key: true,
      plain: "Next, {fn} runs too, even though its promise only became ready partway through. It prints {printed}.",
      why: "A microtask added while the queue is being emptied still runs before the timer, which has been waiting the whole time.",
      look: ["{lineId}"],
      deeper: {
        how: "The standard's checkpoint loops “while the event loop's microtask queue is not empty”, so it looks at the queue again after every microtask.",
        edge: "That means a microtask that always queues another one never lets the loop reach a task. No timer, click or repaint ever gets a turn.",
        source: HTML_LOOP,
      },
    },
    "micro.then": {
      plain: "Next in line is {fn}, which runs and prints {printed}.",
      look: ["{lineId}"],
    },

    // ---- The timer (order); the first task after the script (starve, yield) ----
    "task.timeout": {
      key: true,
      plain: "Only now does the loop take a task. It runs {fn}, which prints {printed}.",
      why: "The timer was set up before any promise callback, but its callback is a task, and tasks wait for the microtasks.",
      look: ["{lineId}"],
      deeper: {
        real: "Browsers didn't always agree on this. In 2015, Edge, Firefox 40 and Safari 8 printed `timeout` before the promise callbacks. Today every engine runs promise callbacks as microtasks.",
        source: ARCHIBALD,
      },
    },
    "task.timeout@starve": {
      plain: "At last a task gets its turn, and {fn}, due at 0 ms, runs at {at}.",
      why: "For {at} the chain of chunk microtasks kept it out.",
      look: ["{lineId}"],
    },
    "task.timeout@yield": {
      plain: "The oldest task goes first, so {fn}, due at 0 ms, runs at {at}.",
      why: "The next chunk is a task too, but it joined the queue after {fn}, so {fn} gets its turn first.",
      look: ["{lineId}"],
    },

    // ---- The network (order, await) ----
    "arrive.network": {
      plain: "The thread sits idle until {due}, when the network reply is queued as a task.",
      why: "The browser's Web APIs handled the request the whole time, so the thread never had to wait for it.",
      "plain@await": "At {due} the browser's network, one of its {term:Web APIs}, queues the reply as a task.",
      "why@await": "The request ran in the background, and the thread had nothing to do in the meantime.",
      look: ["{tileId}"], "picture@order": "cook",
    },
    "task.reply": {
      plain: "Running the reply task makes the `fetch` promise ready, so {ready} joins the microtask queue.",
      why: "A task can queue microtasks, and those run as soon as the task ends.",
      look: ["{readyIds}"],
      deeper: {
        how: "When the response arrives, the browser queues a task to resolve the promise that `fetch` returned. Resolving it queues every waiting reaction as a microtask, in the order they were added.",
        source: FETCH,
      },
    },
    "micro.fetched": {
      plain: "Right after that task the microtask runs, and {fn} prints {printed}.",
      look: ["{lineId}"],
    },
    "end.order": {
      key: true,
      plain: "The console now shows {printed}.",
      why: "The script came first, then the microtasks, then the tasks. The queues decide the order, so the line written first doesn't necessarily print first.",
      look: ["console"],
      deeper: {
        cost: "The run takes {at} of simulated time, and all of it is the network delay. The thread itself never waits.",
        edge: "This is Jake Archibald's 2015 test with `queueMicrotask` and `fetch` added. His answer still holds: the script, then the promise callbacks, then the timer.",
        real: "Node prints the same order here. Its loop runs in phases (timers, poll, check), and it empties its `process.nextTick` queue before the promise jobs, so code that uses Node-only features can come out in a different order.",
        source: NODE_LOOP,
      },
    },

    // ---- Code after await ----
    "load.log-1": {
      plain: "`load()` goes on the stack, on top of the script, and prints {printed}.",
      why: "An async function starts like any other function, straight away and line by line.",
      look: ["{fnId}", "{lineId}"],
    },
    "load.await-null": {
      key: true,
      plain: "The {term:await} pauses {fn}, which leaves the stack while the rest of it waits in line.",
      why: "Even `await null`, which has nothing to wait for, sends the rest of {fn} to the queue.",
      look: ["{fnId}"],
      deeper: {
        how: "`await v` is PerformPromiseThen(PromiseResolve(v), rest). The value v is wrapped in a ready promise, and the rest of the function becomes a reaction job, which is a microtask.",
        code: "`await null;` behaves like `return Promise.resolve(null).then(rest)`",
        edge: "Since a 2018 spec change (V8 7.2), awaiting a native promise costs one microtask turn. Before that it cost three, so this same code printed in a different order in older engines.",
        source: V8_ASYNC,
      },
    },
    "script.queue-then": {
      plain: "Back in the script, {callback} joins the {term:microtask} queue, behind the rest of {behind}.",
      look: ["{callbackId}"],
    },
    "load.log-2": {
      key: true,
      plain: "The function {fn} picks up where its await left off and prints {printed}.",
      why: "The rest of it was the oldest microtask, so it runs first once the script is done.",
      look: ["{fnId}", "{lineId}"],
      deeper: {
        how: "When {fn} paused, the engine saved its local variables and its place. Resuming restores them in a fresh frame with no caller underneath.",
        source: ES_AWAIT,
      },
    },
    "load.await-fetch": {
      plain: "`fetch` returns a {term:promise}, a result that isn't ready yet, and `await` parks {fn} on it.",
      why: "This time the value isn't ready yet, so {fn} is waiting for the network instead of the queue.",
      look: ["{fnId}"],
    },
    "load.log-3": {
      plain: "When {fn} resumes after its second await, it prints {printed} and finishes.",
      look: ["{lineId}"],
    },
    "end.await": {
      key: true,
      plain: "The console now shows {printed}.",
      why: "The code after each await ran later. `load()` ran straight away up to its first await, and its caller finished before the rest of it.",
      look: ["console"],
      deeper: {
        edge: "A loop that awaits values that are already ready queues one microtask per pass, so it never lets a task, or a repaint, run in between.",
        source: ES_AWAIT,
      },
    },

    // ---- Chunks of work (starve, yield) ----
    "chunk.work": {
      plain: "`chunk()` runs, and `processBatch()` keeps the thread busy for {cost}. Then the bar reads {done}.",
      look: ["{fnId}", "{pageId}"],
    },
    "chunk.log": {
      plain: "It prints {printed}. The screen can't be redrawn while JavaScript runs, so there's no {term:repaint} yet.",
      why: "Redrawing the screen has to wait its turn like every other job on this thread.",
      look: ["{lineId}", "page"],
    },
    "chunk.requeue": {
      plain: "`queueMicrotask(chunk)` puts the next chunk in the {term:microtask} queue.",
      why: "A microtask runs before any task, and repaints are tasks, so the next chunk jumps the line.",
      look: ["micro"],
      "plain@yield": "This time `setTimeout(chunk, 0)` sets a timer for the next chunk.",
      "why@yield": "The timer's function will come back as a task, so other tasks, like a repaint, can run first.",
      "look@yield": ["webapis"],
    },
    "chunk.run": {
      first: {
        "why@starve": "Before it ends, it queues one more chunk, so the microtask queue is never empty.",
        "why@yield": "It came back through the task queue, so the timer that was waiting got its turn first.",
      },
      plain: "The next {fn} runs {from} → {to} and prints {printed}.",
      "plain@starve": "The next {fn} microtask runs {from} → {to} and prints {printed}.",
      "plain@yield": "The next {fn} task runs {from} → {to} and prints {printed}.",
      look: ["{lineId}"],
    },
    "chunk.clamped": {
      first: {
        key: true,
        why: "Once timers have set timers more than five deep, each one gets at least 4 ms. That stops a chain of 0 ms timers from keeping the thread busy flat out.",
        deeper: {
          how: "The standard's timer initialisation steps say “If nestingLevel is greater than 5, and timeout is less than 4, then set timeout to 4.” Each timer task runs one level deeper than the one that set it.",
          cost: "From here on, each chunk waits up to {delay} with the thread idle, on top of its {work} ms of work.",
          real: "A hidden tab is slowed down much more. Chrome checks its timers once a second, and after 5 minutes hidden it runs a chain of timers only once a minute.",
          source: "[whatwg-timers]; [chrome88-timers]",
        },
      },
      plain: "This chunk prints {printed}, then sets a timer {level} deep, so 0 ms becomes {delay}.",
      look: ["{lineId}"],
    },
    "arrive.render": {
      plain: "A repaint is due at {due}, so a render task joins the task queue.",
      look: ["{tileId}"],
      "key@starve": true,
      "why@starve": "Like any task, it can only start once the microtask queue is empty.",
      "deeper@starve": {
        how: "At each rendering opportunity the standard queues a task on the rendering task source to update the rendering. It's a task like the timer, so it waits for the microtask checkpoint.",
        edge: "This is a recent change. Until January 2024 the standard updated the rendering as a step of the loop between tasks, and either way it never ran between two microtasks.",
        real: "This model takes the oldest task first, while a real browser may serve a waiting repaint ahead of other tasks.",
        source: "[whatwg-loop] §8.1.7.3 Processing model; [whatwg-render-task]",
      },
    },
    "task.render": {
      plain: "The render task repaints, and the screen shows {shown}.",
      "why@starve": "A repaint is a task, so it couldn't run until no microtask was left.",
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
      plain: "The 0 ms timer ran at {timeoutAt}, and the screen jumped straight from nothing to {paints}.",
      why: "As long as microtasks kept coming, no task could start, and the timer and the repaint are both tasks.",
      look: ["page", "console"],
      deeper: {
        cost: "{chunks} chunks of {work} ms ran back to back, so the 0 ms timer waited {timeoutAt}.",
        edge: "A user's click is a task too, so for those {timeoutAt} every click and key press waited in its queue, and the page looked frozen.",
        source: HTML_LOOP,
      },
    },
    "end.yield": {
      key: true,
      plain: "The timer ran at {timeoutAt}, and the screen updated {count:repaints|time}.",
      why: "Because each chunk was a task, there was a gap between chunks where the timer and the repaints could run.",
      look: ["page", "console"],
      deeper: {
        cost: "In this run the timer limit left the thread idle for {clampIdle}.",
        real: "`scheduler.yield()` hands the thread back without the 4 ms limit, and the rest of the work comes back as a prioritized task. It isn't in every major browser yet.",
        source: MDN_YIELD,
      },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "script.zero": {
      question: "`setTimeout` asks to run {callback} after 0 ms. Will it print right now?",
      why: "setTimeout only hands the function to the browser's timer, and after that the function waits its turn in the task queue.",
      options: [
        { misconception: "m-now",
          feedback: "The timer is up at once, but that only puts {callback} in the task queue. Running code is never cut into, so it waits until the script ends." },
        { feedback: "Right. `setTimeout` only hands {callback} to the browser's timer, and the script keeps the thread until its last line." },
      ],
    },
    "micro.next": {
      question: "The script is done, and the stack is empty. Which callback runs next?",
      options: [
        { misconception: "m-order",
          feedback: "The callback `timeout` is a task, and the loop empties the microtask queue before it takes any task. That's why {fn} goes first." },
        { feedback: "Right. With the stack empty, the loop runs every waiting microtask, oldest first, and that's {fn}." },
        { misconception: "m-order",
          feedback: "The request did start earlier, but `fetched` has no reply yet. It's waiting on the request and isn't in any queue, so {fn} goes first." },
      ],
    },
    "script.after-await": {
      options: [
        { misconception: "m-await",
          feedback: "The value is ready, but even `await null` sends the rest of `load()` to the microtask queue. The script carries on, and its next line, {printed}, prints first." },
        { feedback: "Right. The rest of `load()` is a microtask, and microtasks wait until the script ends, so {printed} prints first." },
        { misconception: "m-now",
          feedback: "The callback `then` is queued, but nothing cuts into running code, and the script still has a line to go. It prints {printed} first." },
      ],
    },
    "micro.repaint": {
      options: [
        { misconception: "m-paint",
          feedback: "A frame being due doesn't stop JavaScript. The repaint is a task, and it can't cut into running code." },
        { feedback: "Right. A repaint is a task, so it waits until no microtask is left." },
        { misconception: "m-paint",
          feedback: "There's no gap between two microtasks. The loop keeps running the microtask queue until it's empty, and each chunk added one more." },
      ],
    },
    "turns.repaint": {
      options: [
        { misconception: "m-now",
          feedback: "Nothing pauses a chunk partway through. The render task waits for the chunk to end and then takes its turn." },
        { misconception: "m-chain",
          feedback: "That's what happened with microtasks, but each chunk here is a task. Between two tasks the loop can take another one, like this repaint." },
        { feedback: "Right. The render task is next in the task queue, so the screen shows {shown} before the next chunk runs." },
      ],
    },
  },
};
