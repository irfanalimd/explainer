// The JavaScript event loop, run for real: a small model of the HTML Living Standard's event loop processing model
// (§8.1.7.3) and the ECMAScript job queue, executing four tiny programs statement by statement.
//
// The rules the model follows, in the spec's words where it matters:
// - One task at a time: "let oldestTask be the first runnable task in taskQueue", run it to completion, then
//   "perform a microtask checkpoint": "while the event loop's microtask queue is not empty", dequeue and run the
//   oldest microtask. Microtasks queued by microtasks run in the same checkpoint.
// - Promise reactions are jobs (ECMAScript HostEnqueuePromiseJob), which the HTML host puts on the microtask queue.
//   `.then` on a settled promise queues its job at once; on a pending promise the reaction waits until it settles.
// - `await v` is PerformPromiseThen(PromiseResolve(v), continuation): the rest of the async function is a reaction
//   job, even when v is not a promise.
// - Timers: "If nestingLevel is greater than 5, and timeout is less than 4, then set timeout to 4." The nesting level
//   is the running task's timer nesting level (0 outside timer tasks, including inside microtasks).
// - Rendering is itself a task: at a rendering opportunity the browser "queue[s] a global task on the rendering task
//   source ... to update the rendering". This model queues it only when the page has changed and none is queued yet
//   (both allowed by the spec), and picks the oldest runnable task across all task queues (implementation-defined).
//
// The world: Web APIs (timers, network) and pending promise reactions on the left, the two queues in the middle,
// the call stack (frames pile up in z), the console and the page on the right. A callback is one tile from the moment
// it is registered to the moment it returns, so its identity colour travels: Web API -> queue -> stack -> console.
//
// The lesson (references/teaching.md; the full plan is in the README):
//   Reader    knows functions, console.log, roughly what .then and await do; never heard "task" or "microtask".
//   Picture   one cook (the thread) with an order rail (the task queue). Notes saying "do this before the next
//             order" go in the microtask queue, checked after every dish; what is cooking is the call stack.
//   Problem   one thread, but timers and clicks keep arriving: why doesn't setTimeout(fn, 0) run at once?
//   Wrong     "setTimeout(fn, 0) runs immediately": predicted before setTimeout returns, and before then 1 runs.
//
// `reference()` is a second, independent implementation (closures over a minimal promise + event loop runtime, the
// programs written again as plain JS). The invariants check, on every step, that the console the world shows is a
// prefix of what the reference prints (with the same timestamps), and at the end that it is all of it.

import * as fmt from "../../sim/fmt.mjs";

export const meta = {
  title: "The event loop",
  subtitle: "One thread, a task queue and a microtask queue: why a promise callback beats setTimeout(0)",
  kicker: "Web platform",
  fig: 5,
  cite: { text: "HTML Living Standard, §8.1.7 Event loops; ECMAScript 2025, §9.5 Jobs", url: "https://html.spec.whatwg.org/multipage/webappapis.html#event-loops" },
  theme: "dark",
  level: "core",
  hook: "JavaScript does one thing at a time, yet timers and clicks keep coming. Why doesn't the page freeze? Why doesn't setTimeout(fn, 0) run now?",
  terms: {
    task: "One job waiting its turn on the main to-do line: the script, a timer's callback, a network reply.",
    microtask: "A small job that must run as soon as the current code ends, before any new task.",
    "event loop": "The rule the thread follows forever: run one task, then every waiting microtask, then repeat.",
    "call stack": "The functions running right now, piled up. The loop can start new work only when it is empty.",
    callback: "A function you hand over, to be called later when something happens.",
    "Web APIs": "The browser's own helpers, like timers and the network, which work in the background.",
    promise: "An object standing for a result that is not ready yet. Code can wait for it.",
    repaint: "The browser redrawing the screen so it shows the page's latest changes.",
  },
  recap: [
    "The script runs to the end first; setTimeout only hands its callback to a timer.",
    "Then the loop runs every microtask, even ones added along the way.",
    "Only then does it take one task, like the 0 ms timer.",
    "A network reply arrives as a task; its promise callback runs right after.",
  ],
  takeaway: "Plain code runs first, then every waiting microtask, then one task at a time: a 0 ms timer waits behind every promise callback already queued.",
};

export const params = {
  latency: { label: "Network delay (ms)", type: "int", min: 5, max: 120, value: 40 },
  chunks: { label: "Chunks of work", type: "int", min: 3, max: 10, value: 8 },
  work: { label: "Work per chunk (ms)", type: "int", min: 1, max: 8, value: 4 },
  hz: { label: "Screen refresh", type: "select", value: 60, options: [{ value: 60, label: "60 Hz" }, { value: 120, label: "120 Hz" }] },
};

export const scenarios = [
  { id: "order", label: "Which runs first?", whatIf: "a promise and a timer both wait",
    description: "A log, a 0 ms timer, promises and a network request: watch the order their callbacks print in." },
  { id: "await", label: "Code after await", whatIf: "a function uses await",
    description: "An async function pauses at each await, and the code after it runs later, once the script has finished.",
    takeaway: "Code after an `await` never runs on the spot: it resumes later as a microtask, after the code that called it has finished.",
    recap: [
      "`load()` ran at once, like any function, up to its first `await`.",
      "The rest of it waited as a microtask until the script finished.",
      "After the network reply, it resumed again as a microtask.",
    ] },
  { id: "starve", label: "Promises that never stop", whatIf: "promise jobs keep adding more",
    description: "Long work where each piece queues the next as a promise job: the timer and every repaint wait until it all ends.",
    takeaway: "Microtasks run until their queue is empty, so a chain of them holds back timers and repaints: the user sees no progress until it ends.",
    recap: [
      "Each chunk added the next chunk to the microtask queue.",
      "The loop never left that queue, so the timer and the repaint waited.",
      "The screen jumped straight from nothing to done.",
    ] },
  { id: "yield", label: "Taking turns with setTimeout", whatIf: "the work takes turns with setTimeout",
    description: "The same work, but each piece goes back in the task queue, so the screen can repaint in between.",
    takeaway: "Putting each chunk back in the task queue lets timers and repaints run in between, at the cost of the timers' minimum delay.",
    recap: [
      "Each chunk went back to the task queue with a 0 ms timer.",
      "Between chunks, the loop was free to run other tasks: the timer and repaints.",
      "So the page never froze for the whole job.",
    ] },
];

export const counters = {
  tasks: { label: "tasks run", format: "int", primary: true,
    hint: "Jobs taken from the task queue, one at a time and each to the end: the script, timers, network replies, repaints." },
  microtasks: { label: "microtasks run", format: "int", primary: true,
    hint: "Promise callbacks and code resuming after await. After each task, the loop runs every one that is waiting." },
  frames: { label: "screen repaints", short: "repaints", format: "int", primary: ["starve", "yield"],
    hint: "Times the browser redrew the screen. A repaint is a task too, so it can only happen between tasks." },
  now: { label: "simulated time", short: "time", format: "ms",
    hint: "The clock inside the simulation, from the moment the script starts." },
};

// ---- the code panel: the four programs, one section each; s.line() lights the statement that is running ----------
const SRC = [];
const LN = {};
const L = (label, text) => { SRC.push(text); if (label) LN[label] = SRC.length; };
L(null, "// 1 · Which runs first?");
L("o.log1", 'console.log("script");');
L("o.timeout", 'setTimeout(() => console.log("timeout"), 0);');
L("o.p", "Promise.resolve()");
L("o.then1", '  .then(() => console.log("then 1"))');
L("o.then2", '  .then(() => console.log("then 2"));');
L("o.micro", 'queueMicrotask(() => console.log("micro"));');
L("o.fetch", 'fetch("/api/user")');
L("o.fetched", '  .then(() => console.log("fetched"));');
L("o.done", 'console.log("done");');
L(null, "");
L(null, "// 2 · Code after await");
L("a.fn", "async function load() {");
L("a.log1", '  console.log("load 1");');
L("a.await1", "  await null;            // still yields");
L("a.log2", '  console.log("load 2");');
L("a.await2", '  await fetch("/api/user");');
L("a.log3", '  console.log("load 3");');
L("a.end", "}");
L("a.script", 'console.log("script");');
L("a.call", "load();");
L("a.then", 'Promise.resolve().then(() => console.log("then"));');
L("a.done", 'console.log("done");');
L(null, "");
L(null, "// 3 · Promises that never stop (STARVE = true), 4 · Taking turns (false)");
L("c.timeout", 'setTimeout(() => console.log("timeout"), 0);');
L("c.let", "let done = 0;");
L("c.fn", "function chunk() {");
L("c.work", "  processBatch();          // WORK ms of CPU");
L("c.dom", "  bar.value = ++done;      // the page must repaint");
L("c.log", '  console.log("chunk " + done);');
L("c.ret", "  if (done === CHUNKS) return;");
L("c.qm", "  if (STARVE) queueMicrotask(chunk);");
L("c.st", "  else setTimeout(chunk, 0);");
L("c.end", "}");
L("c.call", "chunk();");
export const code = { lang: "js", source: SRC.join("\n") };

// ---- the reference: an independent implementation of the processing model -------------------------------------------
// Real closures, a minimal promise (with the thenable-resolution job), generator-based async functions, timers with
// the nesting-level clamp, a network with a fixed latency, and rendering opportunities every 1000 / hz ms.
export function reference(scenario, p) {
  const cfg = settings(p);
  const out = [];
  let now = 0, seq = 0, tasksRun = 0, microRun = 0, frames = 0;
  const macro = [];            // runnable tasks, oldest first
  const micro = [];            // jobs
  const waiting = [];          // in-parallel work: { at, seq, fire }
  let running = null;          // the currently running task or microtask
  let dirty = false, renderQueued = false, vsync = cfg.frame;
  const later = (at, fire) => waiting.push({ at, seq: seq++, fire });
  const queueTask = (run, extra = {}) => macro.push({ run, ...extra });
  function due() {             // everything in parallel whose time has come queues its task, oldest first
    for (;;) {
      waiting.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const vs = dirty && !renderQueued ? vsync : Infinity;
      const w = waiting[0];
      if (w && w.at <= now && w.at <= vs) { waiting.shift(); w.fire(); continue; }
      if (vs <= now) { renderQueued = true; queueTask(() => { frames++; dirty = false; renderQueued = false; }); vsync = nextVsync(vs); continue; }
      while (!dirty && vsync <= now) vsync = nextVsync(vsync);
      return;
    }
  }
  const nextVsync = (v) => Math.round((v + cfg.frame) * 1000) / 1000;
  class P {
    constructor() { this.state = "pending"; this.value = undefined; this.reactions = []; }
    then(f) { const d = new P(); const r = { f, d }; if (this.state === "pending") this.reactions.push(r); else job(this, r); return d; }
  }
  const job = (pr, r) => micro.push(() => resolve(r.d, r.f ? r.f(pr.value) : pr.value));
  function resolve(pr, v) {
    if (pr.state !== "pending") return;
    if (v instanceof P) { micro.push(() => v.then((x) => resolve(pr, x))); return; }   // NewPromiseResolveThenableJob
    pr.state = "fulfilled"; pr.value = v;
    for (const r of pr.reactions) job(pr, r);
    pr.reactions = [];
  }
  const rt = {
    log: (text) => out.push({ text, t: round(now) }),
    resolved: (v) => { const pr = new P(); resolve(pr, v); return pr; },
    queueMicrotask: (f) => micro.push(f),
    setTimeout(f, ms) {
      const level = running && running.timerLevel !== undefined ? running.timerLevel : 0;
      let t = Math.max(0, ms);
      if (level > 5 && t < 4) t = 4;
      later(now + t, () => queueTask(f, { timerLevel: level + 1 }));
    },
    fetch() { const pr = new P(); later(now + cfg.latency, () => queueTask(() => resolve(pr, { ok: true }))); return pr; },
    async(gen) {
      return () => {
        const pr = new P(), it = gen();
        const go = (v) => { const r = it.next(v); if (r.done) resolve(pr, r.value); else (r.value instanceof P ? r.value : rt.resolved(r.value)).then(go); };
        go();
        return pr;
      };
    },
    work(ms) { now = round(now + ms); due(); },
    paint() { dirty = true; },
  };
  const programs = {
    order() {
      rt.log("script");
      rt.setTimeout(() => rt.log("timeout"), 0);
      rt.resolved().then(() => rt.log("then 1")).then(() => rt.log("then 2"));
      rt.queueMicrotask(() => rt.log("micro"));
      rt.fetch("/api/user").then(() => rt.log("fetched"));
      rt.log("done");
    },
    await() {
      const load = rt.async(function* () { rt.log("load 1"); yield null; rt.log("load 2"); yield rt.fetch("/api/user"); rt.log("load 3"); });
      rt.log("script");
      load();
      rt.resolved().then(() => rt.log("then"));
      rt.log("done");
    },
    chunks(starve) {
      rt.setTimeout(() => rt.log("timeout"), 0);
      let done = 0;
      const chunk = () => {
        rt.work(cfg.work);
        done++; rt.paint();
        rt.log("chunk " + done);
        if (done === cfg.chunks) return;
        if (starve) rt.queueMicrotask(chunk); else rt.setTimeout(chunk, 0);
      };
      chunk();
    },
  };
  const program = scenario === "await" ? programs.await : scenario === "starve" ? () => programs.chunks(true) : scenario === "yield" ? () => programs.chunks(false) : programs.order;
  queueTask(program);
  for (let guard = 0; guard < 10000; guard++) {
    if (macro.length) {
      const task = macro.shift();
      running = task; tasksRun++; task.run(); running = null;
      while (micro.length) { const m = micro.shift(); running = { microtask: true }; microRun++; m(); running = null; }
      due();
      continue;
    }
    const vs = dirty && !renderQueued ? vsync : Infinity;
    const next = Math.min(vs, ...waiting.map((w) => w.at));
    if (next === Infinity) break;
    now = Math.max(now, next);
    due();
  }
  return { out, tasks: tasksRun, microtasks: microRun, frames, end: now };
}

const round = (x) => Math.round(x * 1000) / 1000;
const clampInt = (v, a, b, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
function settings(p = {}) {
  const hz = Number(p.hz) === 120 ? 120 : 60;
  return {
    latency: clampInt(p.latency, 5, 120, 40),
    chunks: clampInt(p.chunks, 3, 10, 8),
    work: clampInt(p.work, 1, 8, 4),
    hz,
    frame: round(1000 / hz),
  };
}

// ---- invariants -------------------------------------------------------------------------------------------------
const consoleLines = (snap) => {
  const c = snap.entities.get("console");
  return c ? c.children.map((id) => snap.entities.get(id)?.state).filter(Boolean) : [];
};
const refCache = new Map();
function refFor(scenario, params) {
  const k = scenario + JSON.stringify(settings(params));
  if (!refCache.has(k)) refCache.set(k, reference(scenario, params));
  return refCache.get(k);
}
const show = (xs) => xs.map((x) => `${x.text}@${x.t}`).join(", ");

export const invariants = {
  // the world's console is always a prefix of the independent reference, timestamps included, and all of it at the end
  "console matches the reference model": (snap, { params, scenario }) => {
    const ref = refFor(scenario, params).out;
    const got = consoleLines(snap);
    if (got.length > ref.length) return `the console has ${got.length} lines, the reference only ${ref.length}`;
    for (let i = 0; i < got.length; i++) if (got[i].text !== ref[i].text || got[i].t !== ref[i].t) return `line ${i + 1} is ${got[i].text}@${got[i].t} ms, the reference says ${ref[i].text}@${ref[i].t} ms (reference: ${show(ref)})`;
    if (snap.final && got.length !== ref.length) return `the run ends with ${got.length} of the reference's ${ref.length} lines (${show(ref)})`;
    return true;
  },
  // the processing model: a task, and a microtask checkpoint, only ever begin on an empty stack (the model's stack
  // when it began; the next invariant ties that stack to the frames drawn in the world on every step)
  "the stack is empty when a task or checkpoint begins": (snap) => {
    const b = snap.entities.get("stack")?.state?.began;
    return !b || b.depth === 0 || `${b.what} began with ${b.depth} frame${b.depth > 1 ? "s" : ""} on the stack`;
  },
  // ... and a task never starts while microtasks are waiting: the checkpoint always drains the queue first
  "no task starts before the microtask queue is drained": (snap) => {
    const b = snap.entities.get("stack")?.state?.began;
    return !b || b.what !== "a task" || b.micro === 0 || `a task began with ${b.micro} microtask${b.micro > 1 ? "s" : ""} still queued`;
  },
  // the world mirrors the model: the frames on the stack are the model's call stack, bottom to top
  "the drawn stack is the model's call stack": (snap) => {
    const rec = snap.entities.get("stack");
    if (!rec?.state) return true;
    const drawn = rec.children.map((id) => snap.entities.get(id)?.text).join(" > ");
    const model = (rec.state.frames ?? []).join(" > ");
    return drawn === model || `the stack shows [${drawn}] but the model has [${model}]`;
  },
  "task and microtask counts match the reference": (snap, { params, scenario }) => {
    if (!snap.final) return true;
    const ref = refFor(scenario, params), c = snap.counters;
    for (const k of ["tasks", "microtasks", "frames"]) if ((c[k] ?? 0) !== ref[k]) return `${k}: the run counted ${c[k] ?? 0}, the reference ${ref[k]}`;
    return true;
  },
};

// ---- the figure -------------------------------------------------------------------------------------------------
const K = (k) => fmt.key(k);
const C = (x) => fmt.code(x);
const ms = (x) => fmt.ms(round(x));

export function build(s, p, scenario, env) {
  const sc = ["order", "await", "starve", "yield"].includes(scenario) ? scenario : "order";
  const cfg = settings(p);
  const portrait = !!env?.portrait;
  const chunky = sc === "starve" || sc === "yield";
  // the lesson is things moving between the boxes, so every step frames the whole runtime, on every screen
  const vm = machine(s, cfg, sc, { whole: "rt" });

  // ---- the world ----
  if (portrait) {
    // a portrait phone: everything in one tall column, the queues one above the other
    s.column("rt", { gap: 34, align: "center" });
    s.row("host", { in: "rt", gap: 24 });
    s.column("queues", { in: "rt", gap: 28 });
    s.row("engine", { in: "rt", gap: 30 });
  } else {
    s.row("rt", { gap: 72, align: "center" });
    s.column("host", { in: "rt", gap: 36 });
    s.column("queues", { in: "rt", gap: 36 });
    s.column("engine", { in: "rt", gap: 36 });
  }
  // a phone's top row holds both host housings side by side: without their sub-labels it is no wider than the
  // queues under it, so the camera never cuts "waiting on a promise" at the screen edge
  const phone = !!env?.phone && portrait;
  s.housing("webapis", { in: "host", title: "Web APIs", sub: phone ? undefined : sc === "order" ? "timers · network" : sc === "await" ? "network" : "timers", tray: { cols: 1, of: "record" }, led: "idle" });
  if (!chunky) s.housing("pending", { in: "host", title: "waiting on a promise", sub: phone ? undefined : "not ready", tray: { cols: 1, of: "record" } });
  s.housing("tasks", { in: "queues", variant: "queue", title: "task queue", sub: chunky ? "timer · render" : "timer · network", tray: portrait ? { cols: 2, of: "record" } : { cols: 3, rows: 1, of: "record" } });
  s.housing("micro", { in: "queues", variant: "queue", title: "microtask queue", sub: "promise jobs", tray: portrait ? { cols: 2, of: "record" } : { cols: 3, rows: 1, of: "record" } });
  s.housing("stack", { in: "engine", title: "call stack", sub: "idle", led: "idle", tray: { cols: 1, of: "record", order: "stack" }, state: { frames: [], begin: null } });
  const out = portrait ? "rt" : "engine";
  if (chunky) {
    // the progress bar as the user sees it: one segment per chunk, lit only when a frame paints it
    s.housing("page", { in: "engine", index: portrait ? undefined : 0, title: "page", sub: `painted 0/${cfg.chunks}`, led: "idle", tray: { cols: cfg.chunks, of: "bit" }, state: { painted: 0, dom: 0 } });
    for (let i = 0; i < cfg.chunks; i++) s.tile(`px${i}`, { in: "page", of: "bit", text: "", tone: "ghost" });
  }
  s.housing("console", { in: out, title: "console", sub: "0 lines", tray: { cols: portrait ? (chunky ? 3 : 2) : vm.consoleCols, of: "record", order: "row" } });

  // work flows one way: into the queues, from the queues onto the stack, from the stack to the console
  const one = { arrow: true };
  s.trace("t-api-tasks", "webapis", "tasks", one);
  if (!chunky) s.trace("t-pending-micro", "pending", "micro", one);
  s.trace("t-tasks-stack", "tasks", "stack", one);
  s.trace("t-micro-stack", "micro", "stack", one);
  s.trace("t-stack-console", "stack", "console", one);
  if (chunky) s.trace("t-stack-page", "stack", "page", one);

  vm.start();
}


// The event loop machine. It owns the model (queues, stack, timers, promises) and narrates every change through `s`.
// A callback is one tile for its whole life: registered (spawned from the caller's frame into Web APIs, promise
// reactions or the microtask queue), queued, run (it becomes the frame on the stack), returned (it sinks).
function machine(s, cfg, sc, view = {}) {
  const chunky = sc === "starve" || sc === "yield";
  const starve = sc === "starve";
  let now = 0, uid = 0, nlines = 0;
  const tasks = [], micro = [], stack = [], waiting = [];
  let running = null;                 // the task or microtask being run (its timer nesting level matters)
  let dirty = false, renderQueued = null, vsync = cfg.frame, dom = 0, painted = 0;
  let began = null;                   // { what, depth, micro }: recorded when a task or checkpoint begins
  const output = [];                  // { text, key, t }
  const paints = [];                  // painted values, frame by frame
  let timeoutAt = null, clampIdle = 0, askedRender = false;
  const id = (base) => `${base.replace(/\s+/g, "-")}#${++uid}`;
  const seen = new Set();
  // one plain-English line per chapter, for the explain panel
  const about = (name) => ({
    "Before the next task": starve
      ? "When the stack empties, the loop runs every microtask, even new ones added along the way. Here each chunk adds the next, so timers and repaints must wait."
      : "When the stack empties, the loop runs every waiting microtask: promise callbacks and code after `await`. Microtasks added along the way run too, before any new task.",
    "The timer": "A timer's callback waits in the task queue. The loop takes one task at a time, only once the microtasks are done, so even a 0 ms timer waits its turn.",
    "Tasks at last": "The microtasks are finally done, so the loop can take tasks again: the long-waiting timer, then the render task that repaints the page at last.",
    "Taking turns": "Each chunk is now its own task. Between chunks, the loop can run other tasks, like the waiting timer and the render task that repaints the page.",
    "The network": "The `fetch` finishes in the background, and its reply arrives as a task. Running it makes the promise ready, which queues the code waiting on it as microtasks.",
    "Timer limit": "Browsers slow down long chains of timers: once timers have set timers more than five deep, a 0 ms delay becomes 4 ms. The thread idles meanwhile.",
  })[name];
  const tasksPhase = () => (sc === "order" ? "The timer" : starve ? "Tasks at last" : "Taking turns");
  const phase = (name) => { if (!seen.has(name)) { seen.add(name); s.phase(name, { about: about(name) }); } };

  // ---------- narration ----------
  // every step frames the whole runtime (view.whole), unless a step names its own focus (the payoff: the console)
  let focused = false;
  const focus = (...ids) => { focused = true; s.focus(...ids); };
  let shown = { sub: "idle", led: "idle" };
  function loop(sub = shown.sub) {
    const led = stack.length ? "busy" : "idle";
    if (sub !== shown.sub || led !== shown.led) { s.set("stack", { sub, led }); shown = { sub, led }; }
  }
  function step(caption) {
    if (view.whole && !focused) s.focus(view.whole);
    focused = false;
    s.gauge("now", round(now));
    s.set("stack", { state: { frames: stack.map((f) => f.label), began } });
    s.step(caption, { t: now });
    began = null;
  }
  const line = (a, b = a) => s.line(LN[a], LN[b]);
  const join = (a, b) => (a ? `${a}; ${b.charAt(0) === "`" || b.charAt(0) === "{" ? b : b.charAt(0).toLowerCase() + b.slice(1)}` : b);

  function log(fr, text) {
    const tid = `log${++nlines}`;
    s.spawn(tid, { from: fr.tile, in: "console", of: "record", text, key: fr.key, state: { text, t: round(now) } });
    s.set("console", { sub: `${nlines} ${nlines === 1 ? "line" : "lines"}` });
    output.push({ text, key: fr.key, t: round(now) });
  }

  // ---------- promises ----------
  const promise = (name, state = "pending") => ({ name, state, reactions: [] });
  // PerformPromiseThen: on a settled promise the reaction job is queued at once; on a pending one it waits
  function then(fr, pr, fn, extra = {}) {
    const derived = promise(`${fn.label}'`);
    const tile = extra.tile ?? id(fn.label);
    const job = { kind: "reaction", fn, label: fn.label, key: fn.key, tile, derived, ...extra };
    const where = pr.state === "pending" ? "pending" : "micro";
    if (extra.tile) s.move(tile, where, { index: 0 });
    else s.spawn(tile, { from: fr.tile, in: where, of: "record", text: fn.label, key: fn.key, index: 0 });
    if (pr.state === "pending") pr.reactions.push(job); else micro.push(job);
    return derived;
  }
  // fulfil a promise: each waiting reaction becomes a microtask, in registration order
  function fulfil(pr) {
    if (!pr || pr.state !== "pending") return [];
    pr.state = "fulfilled";
    const moved = pr.reactions.splice(0);
    for (const job of moved) { s.move(job.tile, "micro", { via: "t-pending-micro", index: 0 }); micro.push(job); }
    return moved;
  }

  // ---------- timers, the network and rendering opportunities: the browser, in parallel ----------
  function setTimer(fr, fn, delay) {
    // timer initialization steps: the nesting level of the running task, if a timer created it, else 0
    const level = running && running.timerLevel !== undefined ? running.timerLevel : 0;
    let t = Math.max(0, delay);
    const clamped = level > 5 && t < 4;
    if (clamped) t = 4;
    const tile = id(fn.label);
    s.spawn(tile, { from: fr.tile, in: "webapis", of: "record", text: fn.label, key: fn.key });
    const timer = { kind: "timer", at: round(now + t), seq: uid, tile, fn, label: fn.label, key: fn.key, level, delay: t, clamped };
    if (clamped) s.tag(tile, `nested ${level} deep: 4 ms`, { tone: "warn" });
    waiting.push(timer);
    return timer;
  }
  function fetchReq(fr, url) {
    const tile = id("req");
    const pr = promise("fetch");
    s.spawn(tile, { from: fr.tile, in: "webapis", of: "record", text: url });
    s.tag(tile, `GET · ${cfg.latency} ms`);
    waiting.push({ kind: "network", at: round(now + cfg.latency), seq: uid, tile, label: url, promise: pr });
    return pr;
  }
  // the next thing that happens in parallel: a timer or a response, or a rendering opportunity once the page changed
  function nextEvent() {
    waiting.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const w = waiting[0];
    const vs = dirty && !renderQueued ? { kind: "vsync", at: vsync } : null;
    return w && (!vs || w.at <= vs.at) ? w : vs;
  }
  // queue a task in the order it was queued in parallel (its `at`), not the order this narration reaches it; the
  // tray shows the newest on the left, so the head (oldest) sits next to the trace to the stack
  function enqueue(task) {
    let pos = tasks.length;
    while (pos > 0 && tasks[pos - 1].at > task.at) pos--;
    tasks.splice(pos, 0, task);
    return tasks.length - 1 - pos;
  }
  function fire(e) {
    if (e.kind === "vsync") {
      const tile = id("render");
      renderQueued = { kind: "render", tile, label: "render", at: e.at };
      s.spawn(tile, { from: "page", in: "tasks", of: "record", text: "render", index: enqueue(renderQueued) });
      s.tag(tile, `repaint due ${ms(e.at)}`, { tone: "busy" });
      vsync = round(vsync + cfg.frame);
      return { what: "render", at: e.at };
    }
    waiting.splice(waiting.indexOf(e), 1);
    if (e.kind === "timer") {
      const index = enqueue({ kind: "timer", tile: e.tile, fn: e.fn, label: e.label, key: e.key, timerLevel: e.level + 1, at: e.at });
      s.move(e.tile, "tasks", { via: "t-api-tasks", index });
      return { what: "timer", at: e.at, e };
    }
    s.set(e.tile, { text: "response" });
    const index = enqueue({ kind: "network", tile: e.tile, label: e.label, promise: e.promise, at: e.at });
    s.move(e.tile, "tasks", { via: "t-api-tasks", index });
    return { what: "network", at: e.at, e };
  }
  function arrivalText(f, idleFrom) {
    const at = ms(f.at), busy = stack.length || micro.length;
    const idle = idleFrom !== null;
    if (f.what === "render") {
      return idle
        ? `Nothing to do until ${at}, time to {term:repaint}: a {tone:busy|render} task is queued`
        : `${at}: time to {term:repaint}. A {tone:busy|render} task joins the task queue${busy ? `, but must wait for the ${stack.length ? "running code" : "microtasks"}` : ""}`;
    }
    if (f.what === "timer") {
      const e = f.e;
      if (idle) return `Nothing to do for ${ms(f.at - idleFrom)}. At ${at} the timer puts ${K(e.key)} in the task queue`;
      return stack.length && e.delay === 0 && f.at === round(now)
        ? `No wait needed: the timer puts ${K(e.key)} in the task queue at once. ${stack[0].script ? "The script" : "JavaScript"} keeps running`
        : `${at}: the ${ms(e.delay)} timer puts ${K(e.key)} in the task queue`;
    }
    return idle ? `The thread idles until ${at}. Then the network reply arrives, queued as a task` : `${at}: the network reply arrives, queued as a task`;
  }
  function arrivals(o = {}) {
    for (;;) {
      const e = nextEvent();
      if (!e || e.at > now) break;
      const f = fire(e);
      if (f.what === "render" && starve && !askedRender) {
        askedRender = true;
        s.ask(`${ms(f.at)}: time for a new frame, and the page has changed. Does the browser repaint now?`,
          ["Yes: repainting interrupts JavaScript", "No: the render task waits until the microtask queue is empty", "Yes, between two microtasks"], 1,
          { why: "A repaint is a task, and no task starts while microtasks wait. Each chunk keeps adding another microtask." });
      }
      s.line(null);
      step(arrivalText(f, null));
    }
    while (!dirty && vsync <= now) vsync = round(vsync + cfg.frame);
  }
  function idle() {
    const e = nextEvent();
    if (!e) return false;
    const from = now;
    if (e.kind === "network") phase("The network");
    now = Math.max(now, e.at);
    if (e.kind === "timer" && e.clamped) clampIdle = round(clampIdle + (now - from));
    loop("idle");
    const f = fire(e);
    s.line(null);
    step(arrivalText(f, from));
    arrivals();
    return true;
  }

  // ---------- frames ----------
  const quiet = (fr) => !fr.script && !(fr.derived?.reactions.length || fr.promise?.reactions.length);
  function pop(fr) {
    stack.pop();
    s.remove(fr.tile, { style: "sink" });
    loop();
  }
  // run a frame's statements, one step each; `lead` (entering the frame) joins the first statement's caption
  function runFrame(fr, lead) {
    if (fr.fn.compact && fr.pc === 0) {
      if (fr.fn.calls++ > 0) return compact(fr, lead);
      fr.fn.body = fr.fn.fresh();
    }
    while (fr.pc < fr.fn.body.length) {
      const st = fr.fn.body[fr.pc++];
      if (st.line) line(...st.line);
      if (st.call) {
        const fn = st.call;
        const callee = { tile: id(fn.label), fn, pc: 0, label: fn.label, key: fn.key, promise: fn.async ? promise(fn.label) : null };
        s.spawn(callee.tile, { from: fr.tile, in: "stack", of: "record", text: fn.label, key: fn.key });
        stack.push(callee);
        loop();
        s.beat();
        runFrame(callee, join(lead, st.say()));
        lead = null;
        continue;
      }
      if (st.await) {
        const v = st.await(fr);
        const pr = v && v.reactions ? v : promise("resolved", "fulfilled");   // PromiseResolve(%Promise%, v)
        if (pr.state === "pending") s.beat();
        stack.pop();
        then(fr, pr, fr.fn, { kind: "resume", frame: fr, tile: fr.tile });
        loop();
        if (st.ask) st.ask();
        step(join(lead, st.say({ settled: pr.state !== "pending" })));
        arrivals();
        return { suspended: true };
      }
      if (st.ask) st.ask();
      const text = st.run(fr);
      if (fr.pc >= fr.fn.body.length && quiet(fr)) {
        s.beat();
        pop(fr);
        step(join(lead, text) + (st.tail ? st.tail() : ""));
        arrivals();
        return { returned: true };
      }
      step(join(lead, text));
      lead = null;
      arrivals();
    }
    return ret(fr, lead);
  }
  function compact(fr, lead) {
    const text = fr.fn.compact(fr, lead);
    fr.pc = fr.fn.body.length;
    if (quiet(fr)) { s.beat(); pop(fr); step(text); arrivals(); return { returned: true }; }
    step(text);
    arrivals();
    return ret(fr, null);
  }
  // a return that someone is waiting on (a promise reaction to queue), or the end of the script
  function ret(fr, lead) {
    pop(fr);
    const settled = fr.derived ?? fr.promise;
    if (fr.script) { s.line(null); return { returned: true, script: true }; }
    s.beat();
    const moved = fulfil(settled);
    const names = fmt.and(moved.map((j) => K(j.key)));
    step(`${lead ? lead + "; " : ""}${K(fr.key)} finishes, so ${names} ${moved.length > 1 ? "are" : "is"} ready: ${moved.length > 1 ? "they join" : "it joins"} the microtask queue`);
    arrivals();
    return { returned: true };
  }

  // ---------- one task, then a microtask checkpoint ----------
  function runTask(task) {
    began = { what: "a task", depth: stack.length, micro: micro.length };
    running = task;
    s.count("tasks");
    if (task.kind === "network") {
      s.remove(task.tile, { to: "stack" });
      loop("task");
      s.beat();
      const moved = fulfil(task.promise);
      s.line(null);
      step(`The loop runs the reply task: the ${C("fetch")} promise is ready, so ${fmt.and(moved.map((j) => K(j.key)))} ${moved.length > 1 ? "become microtasks" : "becomes a microtask"}`);
      arrivals();
    } else if (task.kind === "render") {
      phase(tasksPhase());
      s.remove(task.tile, { to: "stack" });
      loop("render");
      s.beat();
      painted = dom; dirty = false; renderQueued = null;
      paints.push(painted);
      s.set("page", { sub: `painted ${painted}/${cfg.chunks}`, led: "ok", state: { painted, dom } });
      for (let i = paints.length > 1 ? paints[paints.length - 2] : 0; i < painted; i++) s.set(`px${i}`, { tone: null, key: "chunk" });
      s.count("frames");
      s.line(null);
      const late = round(now - task.at);
      step(`The render task repaints: the screen shows ${C(`${painted}/${cfg.chunks}`)}` +
        (late >= 0.1 ? `, ${ms(late)} after it was due` : ""));
      arrivals();
    } else {
      if (task.kind === "timer") phase(tasksPhase());
      s.move(task.tile, "stack", { via: "t-tasks-stack" });
      const fr = { tile: task.tile, fn: task.fn, pc: 0, label: task.label, key: task.key, script: task.kind === "script", derived: null };
      stack.push(fr);
      loop("task");
      let lead = null;
      if (task.kind === "script") {
        s.line(null);
        step(`The {term:event loop|loop} takes the script and runs it. It sits on the {term:call stack}: what's cooking now`, { keep: true });
      } else {
        s.beat();
        const late = round(now - task.at);
        if (task.fn.label === "timeout") timeoutAt = now;
        lead = task.fn.lead ? task.fn.lead() : fr.fn.compact ? `The loop takes ${K(task.key)}` : `The loop takes one task: ${K(task.key)}${late >= 0.1 ? `, queued ${ms(late)} ago` : ""}`;
      }
      const r = runFrame(fr, lead);
      if (r.script) {
        // clean up after running script: the stack is empty, so a microtask checkpoint is performed
        loop(micro.length ? "microtasks" : "idle");
        if (askAfterScript) askAfterScript();
        step(micro.length
          ? "The script ends and leaves the stack. The thread is free: what runs next?"
          : "The script ends and leaves the stack. No microtask waits, so the loop takes a task");
        arrivals();
      }
    }
    running = null;
    checkpoint();
  }
  let askAfterScript = null, jobsRun = 0;
  function checkpoint() {
    if (micro.length) { phase("Before the next task"); began = { what: "a microtask checkpoint", depth: stack.length, micro: micro.length }; }
    while (micro.length) runJob(micro.shift());
    loop(stack.length ? shown.sub : "idle");
  }
  function runJob(job) {
    running = { microtask: true };
    s.count("microtasks");
    jobsRun++;
    s.move(job.tile, "stack", { via: "t-micro-stack" });
    loop("microtasks");
    s.beat();
    if (job.kind === "resume") {
      stack.push(job.frame);
      runFrame(job.frame, `${K(job.key)} resumes where its ${C("await")} left off`);
    } else {
      const fr = { tile: job.tile, fn: job.fn, pc: 0, label: job.label, key: job.key, derived: job.derived };
      stack.push(fr);
      if (job.fn.ask) job.fn.ask();
      runFrame(fr, job.fn.lead ? job.fn.lead() : jobsRun === 1 ? `Microtasks first: ${K(job.key)} runs` : `The loop runs ${K(job.key)}`);
    }
    running = null;
  }

  // ---------- the four programs ----------
  const fn = (label, body, o = {}) => ({ label, key: o.key ?? label, body, calls: 0, ...o });
  const logs = (label, lineKey) => fn(label, [{ line: [lineKey], run: (fr) => { log(fr, label); return `It prints ${C(label)}`; } }]);

  function programOrder() {
    const timeout = logs("timeout", "o.timeout");
    let timeoutQueued = 0;
    timeout.lead = () => `Only now does the loop take a task: ${K("timeout")}, waiting since ${ms(timeoutQueued)}`;
    const then1 = logs("then 1", "o.then1"), then2 = logs("then 2", "o.then2");
    const mt = logs("micro", "o.micro"), fetched = logs("fetched", "o.fetched");
    then1.lead = () => `Microtasks first: ${K("then 1")} runs before any task`;
    then2.lead = () => `${K("then 2")} was added mid-round, and the queue must empty before any task`;
    mt.lead = () => `First in, first out: ${K("micro")} runs next`;
    fetched.lead = () => `After that task, the loop runs the microtasks: ${K("fetched")}`;
    then1.ask = () => s.ask("The script is done and the stack is empty. Which callback runs next?",
      ["timeout: it was queued first, at 0 ms", "then 1: microtasks go before tasks", "fetched: its request started earlier"], 1,
      { why: "After every task the loop runs all waiting microtasks first. timeout is a task, so it waits; fetched has no reply yet." });
    return fn("script", [
      { line: ["o.log1"], run: (fr) => { log(fr, "script"); return `${C('console.log("script")')} prints right away: plain code runs line by line`; } },
      { line: ["o.timeout"],
        ask: () => s.ask(`${C("setTimeout")} asks to run its {term:callback} after 0 ms. Does \`timeout\` print now?`,
          ["Yes: 0 ms means right away", "No: it waits until the script is done"], 1,
          { why: "setTimeout only hands the callback to the browser's timer. Then it must wait its turn in the task queue." }),
        run: (fr) => { timeoutQueued = setTimer(fr, timeout, 0).at; return `${C("setTimeout")} hands ${K("timeout")} to the browser's timer, one of the {term:Web APIs}, and returns. Nothing prints`; } },
      { line: ["o.p", "o.then2"], run: (fr) => {
        const p1 = then(fr, promise("p0", "fulfilled"), then1);
        s.beat();
        then(fr, p1, then2);
        return `${C("Promise.resolve()")} is a ready {term:promise}: ${K("then 1")} joins the {term:microtask} queue, ${K("then 2")} waits for ${K("then 1")}`;
      } },
      { line: ["o.micro"], run: (fr) => { then(fr, promise("q", "fulfilled"), mt); return `${C("queueMicrotask")} puts ${K("micro")} straight into the microtask queue, behind ${K("then 1")}`; } },
      { line: ["o.fetch", "o.fetched"], run: (fr) => {
        const pr = fetchReq(fr, "/api/user");
        s.beat();
        then(fr, pr, fetched);
        return `${C("fetch")} asks the network in the background. ${K("fetched")} waits on its promise`;
      } },
      { line: ["o.done"], run: (fr) => { log(fr, "done"); return `${C('console.log("done")')}, the last line, prints. Every callback is still waiting`; } },
    ], { key: "script" });
  }

  function programAwait() {
    const thenFn = logs("then", "a.then");
    thenFn.lead = () => `${K("then")} was next in line, so it runs now`;
    const load = fn("load", [
      { line: ["a.log1"], run: (fr) => { log(fr, "load 1"); return `It runs at once and prints ${C("load 1")}`; } },
      { line: ["a.await1"], await: () => null, say: () => `${C("await null")} pauses ${K("load")}: it leaves the stack, and the rest of it becomes a microtask` },
      { line: ["a.log2"], run: (fr) => { log(fr, "load 2"); return `It prints ${C("load 2")}`; } },
      { line: ["a.await2"], await: (fr) => fetchReq(fr, "/api/user"), say: () => `${C("fetch")} starts a request, and ${C("await")} parks ${K("load")} until its promise is ready` },
      { line: ["a.log3"], run: (fr) => { log(fr, "load 3"); return `It prints ${C("load 3")}`; }, tail: () => " and finishes" },
    ], { async: true, key: "load" });
    return fn("script", [
      { line: ["a.script"], run: (fr) => { log(fr, "script"); return `${C('console.log("script")')} prints right away`; } },
      { line: ["a.call"], call: load, say: () => `${C("load()")} goes on top of the script on the stack` },
      { line: ["a.then"], run: (fr) => { then(fr, promise("p0", "fulfilled"), thenFn); return `${C("load()")} has returned an unfinished promise. ${K("then")} queues behind the rest of ${K("load")}`; } },
      { line: ["a.done"], ask: () => s.ask("load() hit `await null` and the script went on. What prints next?", ["load 2: the awaited value is ready", "done: the rest of load() is a microtask", "then: it is in the microtask queue"], 1,
        { why: "Code after await runs as a microtask, and microtasks wait until the script has finished. done is the script's next line." }),
        run: (fr) => { log(fr, "done"); return `${C('console.log("done")')} prints before anything after the first ${C("await")}`; } },
    ], { key: "script" });
  }

  function programChunks() {
    let done = 0;
    const timeout = logs("timeout", "c.timeout");
    timeout.lead = () => (now >= 1 ? `${starve ? "At last a task" : "The oldest task"}: ${K("timeout")}, due at 0 ms, runs at ${ms(now)}` : `The loop takes ${K("timeout")}`);
    const chunk = fn("chunk", [], { compact: null, fresh: null });
    const requeueLine = () => (done >= cfg.chunks ? "c.ret" : starve ? "c.qm" : "c.st");
    function requeue(fr) {
      if (done >= cfg.chunks) return { text: `${C(`done === ${cfg.chunks}`)}, so this was the last chunk` };
      if (starve) { then(fr, promise("q", "fulfilled"), chunk); return { text: `${C("queueMicrotask(chunk)")} queues the next chunk as a microtask` }; }
      const tm = setTimer(fr, chunk, 0);
      if (tm.clamped) phase("Timer limit");
      return { tm, text: tm.clamped
        ? `${C("setTimeout(chunk, 0)")} again, but this timer is ${tm.level} deep: {tone:warn|forced to 4 ms}`
        : `${C("setTimeout(chunk, 0)")} puts the next chunk back as a new task, 0 ms from now` };
    }
    function work(fr) {
      const t0 = now;
      now = round(now + cfg.work);
      done++; dom = done; dirty = true;
      s.set("page", { state: { painted, dom } });
      return t0;
    }
    // the first call, statement by statement
    chunk.fresh = () => [
      { line: ["c.work", "c.dom"], run: (fr) => { work(fr); return `${C("processBatch()")} keeps the thread busy ${ms(cfg.work)}, then ${C(`bar.value = ${done}`)} changes the page`; } },
      { line: ["c.log"], run: (fr) => { log(fr, `chunk ${done}`); return `It prints ${C(`chunk ${done}`)}. The bar changed, but the screen can't {term:repaint} while JavaScript runs`; } },
      { line: [requeueLine()], run: (fr) => requeue(fr).text },
    ];
    // later calls: one step each
    chunk.compact = (fr, lead) => {
      line("c.work", "c.log");
      const t0 = work(fr);
      log(fr, `chunk ${done}`);
      s.beat();
      line("c.work", requeueLine());
      const r = requeue(fr);
      const tail = done >= cfg.chunks ? ": the last one" : starve ? ", and queues another" : r.tm.clamped ? `; its next timer is {tone:warn|forced to 4 ms}` : ", and sets a 0 ms timer";
      // a 0 ms timer expires as soon as it is set: queue it in this step instead of narrating it again
      if (r.tm && r.tm.at <= now) { s.beat(); fire(r.tm); }
      return `${lead}: ${fmt.num(round(t0))} → ${ms(now)}, prints ${C(`chunk ${done}`)}${tail}`;
    };
    chunk.lead = () => (starve ? `The next ${K("chunk")} microtask` : `The next ${K("chunk")} task`);
    return fn("script", [
      { line: ["c.timeout"], run: (fr) => { setTimer(fr, timeout, 0); return `${C("setTimeout")} asks for ${K("timeout")} in 0 ms`; } },
      { line: ["c.call"], call: chunk, say: () => `${C("chunk()")} starts` },
    ], { key: "script" });
  }

  // ---------- the run ----------
  const consoleMax = { order: 7, await: 6, starve: cfg.chunks + 1, yield: cfg.chunks + 1 }[sc];
  function finale() {
    const order = output.map((o) => fmt.key(o.key, o.text)).join(", ");
    if (sc === "order") return `Printed: ${order}. Script, then microtasks, then tasks`;
    if (sc === "await") return `Printed: ${order}. Code after ${C("await")} ran later, as microtasks`;
    if (sc === "starve") return paints.length === 1
      ? `The 0 ms timer ran at ${ms(timeoutAt)}. The screen jumped from 0/${cfg.chunks} to ${cfg.chunks}/${cfg.chunks}: no progress`
      : `The 0 ms timer ran at ${ms(timeoutAt)}, and the screen updated only ${fmt.plural(paints.length, "time")}`;
    // a long run of repaints names only the first and the last, so the caption stays short
    const shown = paints.length > 3 ? `${paints.length} repaints showed progress, ${paints[0]}/${cfg.chunks} to ${paints[paints.length - 1]}/${cfg.chunks}`
      : paints.length > 1 ? `${fmt.plural(paints.length, "repaint")} showed progress: ${paints.map((x) => `${x}/${cfg.chunks}`).join(", ")}` : "the work ended before the first repaint";
    return `${C("timeout")} ran at ${ms(timeoutAt)}, and ${shown}` + (clampIdle > 0 ? `. Timer limit: ${ms(clampIdle)} idle` : "");
  }
  return {
    consoleCols: chunky ? 3 : 1,
    start() {
      const script = sc === "order" ? programOrder() : sc === "await" ? programAwait() : programChunks();
      s.tile("script-task", { in: "tasks", of: "record", text: "script", key: "script" });
      tasks.push({ kind: "script", tile: "script-task", fn: script, label: "script", key: "script", at: 0 });
      s.phase("The script", { about: "Think of one cook with an order rail. Orders wait their turn on the rail, the {term:task} queue. Notes marked “before the next order” go in the {term:microtask} queue, checked after every dish." });
      s.line(null);
      s.gauge("now", 0);
      s.set("stack", { state: { frames: [], began: null } });
      s.step(sc === "order"
        ? `The page's ${C("<script>")} is the first order on the rail. One thread, the cook, will run it`
        : sc === "await"
          ? `An async function, ${C("load()")}, called from a script. Where does ${C("await")} send the rest of it?`
          : starve
            ? `A long job cut into ${cfg.chunks} chunks of ${ms(cfg.work)}. Each chunk queues the next with ${C("queueMicrotask")}`
            : `The same ${cfg.chunks} chunks of ${ms(cfg.work)}, but each queues the next with ${C("setTimeout(chunk, 0)")}`, { t: 0 });
      for (let guard = 0; guard < 600; guard++) {
        if (tasks.length) { runTask(tasks.shift()); continue; }
        if (!idle()) break;
      }
      focus(...(chunky ? ["console", "page"] : ["console"]));   // the payoff: what the program printed (and painted)
      s.line(null);
      step(finale());
    },
  };
}
