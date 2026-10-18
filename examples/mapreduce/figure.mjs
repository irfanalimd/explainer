// MapReduce word count: the flagship Explainer figure (CONTRACTS.md section 9).
// A real run: the input really is split, the mappers really emit (word, 1), the shuffle really partitions by
// hash(word) % R, the reducers really sort and sum. Scenarios: a worker dies and its task is re-run; a straggler
// is beaten by a backup task (Dean & Ghemawat, section 3.6); a skewed key overloads one reducer.
//
// The lesson (references/teaching.md), for a reader who knows loops and dictionaries but not MapReduce:
//   Level        core
//   Hook         each machine reads only part of the text; how is every word still counted exactly?
//   Picture      counting the words of a library with a team. A shelf = a split; the coordinator = the master;
//                a helper tallying their shelf = a mapper; a tally slip "fox: 1" = a record (fox, 1); "all slips
//                for one word go to one person" = the hash rule; the person adding them up = a reducer; the
//                noticeboard = the output. Where it stops matching: machines pick the counter with a hash, not by
//                choosing.
//   Problem      one machine alone reads every word, one after another (the opening caption and the split's tag).
//   Ladder       Split (the parts, the naive way) · Map (the basic move) · Shuffle (the payoff) · Reduce · Output.
//   Misconception "the pieces are counted apart and one machine adds it all up at the end": the predict question
//                at the first word that comes back a second time, in the shuffle (the aha step).
//   Stories      Everything works · One machine crashes · One machine is slow · One word is very common.
//   Scale        Everything works ends on a scale shot (s.scale): the run pulls back into the paper's 2,000-machine
//                cluster, a simplified picture whose every printed number is the paper's, labelled as such.
// The words live in lesson.mjs, keyed by the step ids below; every step passes the run values its words need (vars)
// and keeps a plain caption as the fallback.

export const meta = {
  title: "MapReduce",
  subtitle: "Counting words with a team of machines",
  kicker: "Distributed systems",
  fig: 1,
  level: "core",
  cite: { text: "Dean & Ghemawat, OSDI 2004", url: "https://research.google/pubs/pub62/" },
  theme: "light",
  hook: "Each machine reads only part of the text. How do they still count every word exactly, none missed or counted twice?",
  terms: {
    master: "The coordinator: it hands each machine a piece of the work and notices when one fails.",
    split: "One piece of the text, read by one machine, like one shelf of a library.",
    mapper: "A reading machine: it reads one piece and writes a slip like (fox, 1) for every word.",
    hash: "A function that turns a word into a big number. The same word always gives the same number.",
    shuffle: "The step where every slip travels to the machine that adds up its word.",
    reducer: "A counting machine: it adds up all the slips for its share of the words.",
    straggler: "A machine that is much slower than the rest, so everyone ends up waiting for it.",
  },
  recap: [
    "The text was cut into pieces, and each machine read one.",
    "Each reader wrote a slip for every word, like (fox, 1).",
    "A hash sent every copy of a word to the same counting machine.",
    "Each counter added up its words; together they hold every count.",
  ],
  takeaway: "Every count is exact because every copy of a word met on one counter. The what-ifs test it with a crash, a slow disk and one very common word.",
};

export const params = {
  mappers: { label: "Reading machines", type: "int", min: 1, max: 6, value: 3 },
  reducers: { label: "Counting machines", type: "int", min: 1, max: 4, value: 2 },
  combiner: { label: "Add up repeats first", type: "bool", value: false },
  input: { label: "Text to count", type: "text", value: "the quick brown fox jumps over the lazy dog the fox" },
  seed: { label: "Seed", type: "int", value: 7 },
};

export const scenarios = [
  { id: "happy", label: "Everything works", whatIf: "nothing goes wrong",
    description: "Every machine stays healthy: the whole job, from cutting up the text to the final counts." },
  { id: "crash", label: "One machine crashes", params: { crash: 1 }, whatIf: "a machine crashes halfway through",
    description: "One reading machine crashes halfway through its piece, and the master has that piece read again.",
    takeaway: "A machine died mid-task and the answer did not change: its piece was still in the shared input, so the master had it read again.",
    recap: [
      "A reading machine crashed halfway, and its slips were lost with it.",
      "The text was still in the shared input, so the master had that piece read again.",
      "Reading the same piece again gives the same slips: the counts are still exact.",
    ] },
  { id: "straggler", label: "One machine is slow", params: { straggler: 1 }, whatIf: "one machine is much slower than the rest",
    description: "One reading machine has a failing disk, so the master races a backup copy of its piece on a free machine.",
    takeaway: "One slow disk could have held up the whole job. A backup copy of its piece finished first, and the answer is the same.",
    recap: [
      "One reading machine had a failing disk and fell far behind.",
      "With a machine free, the master started a backup copy of its piece.",
      "The first copy to finish wins and the other is stopped: same answer, less waiting.",
    ] },
  { id: "skew", label: "One word is very common", params: { input: "200 200 404 200 200 301 200 200 500 200 200 200 304 200", reducers: 3 },
    whatIf: "one word is far more common than the rest",
    description: "A web log where almost every line is the status code 200, so one counting machine gets most of the work.",
    takeaway: "Every copy of a word goes to one counter: counts stay exact, but a very common word loads that machine. Adding up repeats on each reader first shrinks the load.",
    recap: [
      "Almost every line of the log was the code 200.",
      "The hash sent every 200 to the same counting machine.",
      "So one machine did most of the adding while the others sat idle.",
    ] },
];

// the dock shows the primary numbers; every number, with its hint, is one click away
export const counters = {
  records: { label: "words read", format: "int", primary: true,
    hint: "Each word a reading machine reads becomes one (word, 1) slip. Words read again after a failure count again." },
  bytes: { label: "sent between machines", short: "sent", format: "bytes", primary: true,
    hint: "Data moved from the reading machines to the counting machines: each slip's word plus a 4-byte count." },
  skew: { label: "busiest counter's load", short: "busiest counter", format: "x", primary: ["skew"],
    hint: "Slips at the busiest counting machine, divided by the average per counting machine. 1× is perfectly even." },
  tasks: { label: "tasks finished", format: "int",
    hint: "Pieces read and counting jobs done so far, including any that had to run again." },
};

export const code = {
  lang: "python",
  source: [
    "def map(split):                   # a reading machine",
    "    for word in split.split():",
    "        emit(word, 1)              # one slip per word",
    "",
    "def combine(word, counts):        # optional: add up repeats first",
    "    emit(word, sum(counts))",
    "",
    "def partition(word, R):           # which counting machine",
    "    return hash(word) % R",
    "",
    "def reduce(word, counts):         # a counting machine",
    "    emit(word, sum(counts))",
  ].join("\n"),
};

const isRecord = (r) => r.kind === "tile" && r.state && typeof r.state.word === "string";

export const invariants = {
  // every count anywhere in the world is one the mappers emitted: nothing invented, nothing double counted
  // (discarded output stays in the world, dimmed, so it is still accounted for)
  "counts conserved": (snap) => {
    let sum = 0;
    for (const r of snap.entities.values()) if (isRecord(r)) sum += r.state.count;
    const emitted = snap.counters.records ?? 0;
    return sum === emitted || `records in the world sum to ${sum}, but ${emitted} were emitted`;
  },
  // the job's answer: the output holds every word of the input exactly once
  // (a branch of the run, where the reader's wrong pick plays out, ends on the broken count it shows: s.choose)
  "every word counted once": (snap, { timeline } = {}) => {
    if (!snap.final || timeline?.branch) return true;
    const words = snap.entities.get("input").state.words;
    const out = snap.entities.get("output");
    let sum = 0;
    for (const id of out.children) sum += snap.entities.get(id).state.count;
    return sum === words || `output sums to ${sum}, input has ${words} words`;
  },
  // a key is reduced in one place only: no word appears twice in the output
  "one output record per key": (snap) => {
    const out = snap.entities.get("output");
    const seen = new Set();
    for (const id of out.children) { const w = snap.entities.get(id).state.word; if (seen.has(w)) return `"${w}" appears twice in the output`; seen.add(w); }
    return true;
  },
};

// FNV-1a: a real, stable string hash for partitioning
export function hash(word) {
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) { h ^= word.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const rec = (word, count) => `${word} · ${count}`;
const ip = (base, k) => `192.0.2.${base + k}`;
const pinned = (v) => v !== undefined && v !== null && v !== false;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// lesson var kinds (CONTRACTS.md 10.1): a word prints as a key chip, a machine as an entity chip
const K = (w) => ({ key: w });
const REF = (id, text) => ({ ref: id, text });
const CODE = (c) => ({ code: c });
const mapRef = (k) => REF(`m${k}`, `map ${k}`), redRef = (r) => REF(`r${r}`, `reduce ${r}`);

export function build(s, p, scenario, env = {}) {
  const M = Math.max(1, Math.min(6, p.mappers | 0));
  const R = Math.max(1, Math.min(4, p.reducers | 0));
  const words = String(p.input ?? "").toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const victim = scenario === "crash" || (scenario !== "happy" && pinned(p.crash)) ? Math.min(M - 1, Math.max(0, (p.crash ?? 1) | 0)) : -1;
  const slow = victim < 0 && (scenario === "straggler" || (scenario !== "happy" && pinned(p.straggler))) ? Math.min(M - 1, Math.max(0, (p.straggler ?? 1) | 0)) : -1;
  const skewed = scenario === "skew";
  const unit = skewed ? "lines" : "words";
  const thing = skewed ? "code" : "word";            // what one slip counts
  const slip = (w) => `\`(${w}, 1)\``;

  // splits: contiguous runs of words, as even as possible
  const splits = [];
  for (let k = 0, at = 0; k < M; k++) {
    const n = Math.floor(words.length / M) + (k < words.length % M ? 1 : 0);
    splits.push(words.slice(at, at + n));
    at += n;
  }
  const biggest = Math.max(0, ...splits.map((x) => x.length));

  // ---- the run values the lesson's words use; a step adds its own (its machine, its word, its counts) ----
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  const top = [...freq.entries()].reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
  const full = words.join(" ");
  const V = {
    n: words.length, M, R, per: Math.round(words.length / Math.max(1, M)), biggest, distinct: freq.size,
    text: full.length > 64 ? `${full.slice(0, 61).replace(/\s+\S*$/, "")} …` : full,
    top: K(top[0]), topN: top[1], combiner: !!p.combiner,
    splitIds: splits.map((_, k) => `split${k}`), mapIds: splits.map((_, k) => `m${k}`),
  };
  const step = (id, caption, vars = {}, o = {}) => s.step(caption, { ...o, id, vars: { ...V, ...vars } });

  // ---- the world ----
  // landscape: the job flows left to right in five columns; portrait (a phone): top to bottom, with the mappers and
  // reducers in rows, the shuffle bus in a horizontal gutter, and one-column trays so the rows stay narrow
  const portrait = !!env.portrait;
  const stage = portrait ? s.row : s.column, flow = portrait ? s.column : s.row;
  const sides = portrait ? { fromSide: "bottom", toSide: "top" } : {};
  const cols = portrait ? 1 : 2;
  flow("job", { gap: portrait ? 46 : 44 });   // landscape: narrow enough to fit beside the explain panel at 1440 px, at a readable size
  s.housing("input", { in: "job", variant: "store", title: "input", sub: `${words.length} ${skewed ? "requests" : "words"}`, tray: { cols: 1, of: "page" }, state: { words: words.length, text: words.join(" ") } });
  stage("map", { in: "job", title: "map", gap: 18, align: portrait ? "start" : "center" });
  // each machine's header says what it holds right now, from the run (its address stays in the inspector); in the
  // skew story each counter also carries a meter: its share of all the slips sent
  for (let k = 0; k < M; k++) s.housing(`m${k}`, { in: "map", title: `map ${k}`, sub: "waiting", tray: { cols, of: "record" }, led: "idle", state: { host: ip(10, k), task: null } });
  s.spacer("shuffle", { in: "job" });
  stage("reduce", { in: "job", title: "reduce", gap: 18, align: portrait ? "start" : "center" });
  for (let r = 0; r < R; r++) s.housing(`r${r}`, { in: "reduce", title: `reduce ${r}`, sub: "waiting", tray: { cols, of: "record" }, led: "idle", ...(skewed ? { meter: 0 } : {}), state: { host: ip(20, r), partition: r } });
  s.housing("output", { in: "job", variant: "store", title: "output", sub: "empty", tray: { cols: 2, of: "record" } });
  // the job flows one way, input to mappers and reducers to output: those traces end in arrows
  for (let k = 0; k < M; k++) s.trace(`in-m${k}`, "input", `m${k}`, { ...sides, arrow: true });
  s.bus("shuffle-bus", { from: Array.from({ length: M }, (_, k) => `m${k}`), to: Array.from({ length: R }, (_, r) => `r${r}`), via: "shuffle" });
  for (let r = 0; r < R; r++) s.trace(`r${r}-out`, `r${r}`, "output", { ...sides, arrow: true });

  // ---- Split: the parts, and the slow way first ----
  s.phase("Split", { id: "split", about: skewed
    ? "Think of counting the status codes in a huge web log (200 means OK, 404 not found) with a team. One machine would take ages, so the {term:master} gives each machine one {term:split}: a piece of the log."
    : "Think of counting every word in a library with a team. One person would take ages, so a coordinator, the {term:master}, gives each helper one shelf: a {term:split}, one piece of the text." });
  step(M > 1 ? "split.problem" : "split.alone", skewed
    ? `A web log of ${words.length} requests: count each status code. One machine alone would read every line.`
    : M > 1
      ? `${words.length} words to count. One machine alone would read all ${words.length}; here ${M} machines share them.`
      : `${words.length} words to count, and one machine to read every one of them.`);

  // each piece's words, for the lesson to name (a long piece is cut short)
  const pieces = splits.map((list, k) => ({ markup: `{ref:split${k}|split ${k}} ${list.length ? `“${list.length > 6 ? `${list.slice(0, 5).join(" ")} …` : list.join(" ")}”` : "(empty)"}` }));
  for (let k = 0; k < M; k++) s.tile(`split${k}`, { in: "input", of: "page", text: `split ${k}`, sub: `${splits[k].length} ${unit}`, state: { words: splits[k] } });
  s.tag("input", M > 1 ? `alone: ${words.length} reads · shared: ${biggest} each` : `${words.length} reads, one by one`);
  s.line(1);
  step(M > 1 ? "split.cut" : "split.one", M > 1
    ? `The master cuts the ${skewed ? "log" : "text"} into ${M} pieces of about ${Math.round(words.length / M)} ${unit}, one per machine.`
    : `With one machine there is one piece: all ${words.length} ${unit}.`, { pieces }, { keep: true });

  // ---- Map ----
  s.phase("Map", { id: "map", about: victim >= 0
    ? `Each reading machine, a {term:mapper}, writes slips like ${slip(thing)} to its own disk. If it crashes, those slips die with it, so the master has its piece read again, even a finished one.`
    : slow >= 0
      ? (M > 1
        ? `Each reading machine, a {term:mapper}, writes a slip for every ${thing}. One has a failing disk, a {term:straggler}, so the master races a backup copy of its piece.`
        : `The only reading machine, a {term:mapper}, writes a slip for every ${thing}. Its disk is failing, a {term:straggler}, and with no machine free to help, the job waits.`)
      : `${skewed ? "Like helpers each tallying their own page" : "Each helper tallies their own shelf"}: each reading machine, a {term:mapper}, writes a slip like ${slip(thing)} for every ${thing}. Nobody waits for anybody.` +
        (p.combiner ? " Each then adds up its repeats into one slip, so less data travels." : "") });
  const tray = Array.from({ length: M }, () => []);       // live record ids per mapper, in tray order
  for (let k = 0; k < M; k++) {
    s.spawn(`m${k}.split${k}`, { from: `split${k}`, in: `m${k}`, of: "page", text: `split ${k}`, sub: `${splits[k].length} ${unit}` });
    s.set(`m${k}`, { led: "busy", sub: "reading", state: { host: ip(10, k), task: `map ${k}` } });
  }
  step(M > 1 ? "map.handout": "map.handout-one", M > 1 ? `The master hands each machine its piece; all ${M} pieces travel at once.` : "The master hands the machine its piece.");

  // emit words [from, to) of a split from a split copy into mapper k, one beat per word
  const emit = (k, split, list, src, from = 0, to = list.length, suffix = "") => {
    for (let i = from; i < to; i++) {
      const w = list[i], id = `m${k}.s${split}.w${i}${suffix}`;
      if (i > from) s.beat();
      s.spawn(id, { from: src, in: `m${k}`, of: "record", text: rec(w, 1), key: w, state: { word: w, count: 1 } });
      s.count("records");
      tray[k].push(id);
      if (k !== slow) s.set(`m${k}`, { sub: plural(tray[k].length, "slip") });   // a straggler's header says why it lags
    }
  };
  const finish = (k, src) => {
    s.beat();
    s.remove(src, { style: "sink" });
    s.set(`m${k}`, { led: "ok", sub: plural(tray[k].length, "slip"), state: { host: ip(10, k), task: null } });
    s.count("tasks");
  };
  const combine = (k) => {
    const groups = new Map();
    for (const id of tray[k]) { const w = s.get(id).state.word; if (!groups.has(w)) groups.set(w, []); groups.get(w).push(id); }
    const dup = [...groups.entries()].filter(([, ids]) => ids.length > 1);
    if (!dup.length) return;
    let first = true;
    for (const [w, ids] of dup) {
      if (!first) s.beat();
      first = false;
      const [keep, ...rest] = ids;
      const total = ids.reduce((a, id) => a + s.get(id).state.count, 0);
      for (const id of rest) s.remove(id, { to: keep });
      s.beat();
      s.set(keep, { text: rec(w, total), state: { word: w, count: total } });
      tray[k] = tray[k].filter((x) => !rest.includes(x));
    }
    s.set(`m${k}`, { sub: plural(tray[k].length, "slip") });
    s.line(5, 6);
    const before = dup.reduce((a, [, ids]) => a + ids.length, 0);
    step("map.combine", `{ref:m${k}|map ${k}} adds up its repeats first: ${dup.map(([w, ids]) => `{key:${w}} × ${ids.length}`).join(", ")} leave as one slip each.`,
      { map: mapRef(k), mapId: `m${k}`, dups: dup.map(([w]) => K(w)), before, after: dup.length, sends: tray[k].length });
  };
  // a task's output is discarded: it stays where it is, an empty grey slip, and is never shuffled. A crashed machine's
  // slips read "lost"; a stopped copy's keep their words
  const discard = (k, src, lost = false) => {
    for (const id of tray[k]) s.set(id, { dim: true, tone: "ghost", ...(lost ? { text: "lost" } : {}) });
    tray[k] = [];
    if (s.has(src)) s.set(src, { dim: true, tone: "ghost" });
  };
  const healthy = (k) => {
    emit(k, k, splits[k], `m${k}.split${k}`);
    finish(k, `m${k}.split${k}`);
    s.line(2, 3);
    step(splits[k].length ? "map.read" : "map.empty", splits[k].length
      ? `{ref:m${k}|map ${k}} writes a slip for each of its ${plural(splits[k].length, thing)}, like ${slip(splits[k][0])}.`
      : `{ref:m${k}|map ${k}} has an empty piece and finishes at once.`,
      { map: mapRef(k), mapId: `m${k}`, count: splits[k].length, slip: CODE(`(${splits[k][0] ?? ""}, 1)`) });
    if (p.combiner) combine(k);
  };
  const helper = (bad) => { for (let k = 0; k < M; k++) if (k !== bad) return k; return bad; };

  for (let k = 0; k < M; k++) {
    if (k === victim) {
      // Worker dies: half way through its split the mapper stops answering the master's pings
      const list = splits[k], upto = Math.min(list.length, Math.max(1, Math.floor(list.length / 2)));
      emit(k, k, list, `m${k}.split${k}`, 0, upto);
      s.line(2, 3);
      step("crash.start", `{ref:m${k}|map ${k}} starts on its piece, writing a slip for each ${thing}.`, { map: mapRef(k), mapId: `m${k}` });
      s.set(`m${k}`, { led: "fail", dim: true, sub: "down", state: { host: ip(10, k), task: `map ${k}`, status: "down" } });
      s.tag(`m${k}`, "stopped answering", { tone: "fail" });
      discard(k, `m${k}.split${k}`, true);
      step("crash.down", `{ref:m${k}|map ${k}} {tone:fail|crashes} after ${upto} of ${list.length} ${unit}; ${upto === 1 ? "its slip is" : `its ${upto} slips are`} lost with it.`,
        { map: mapRef(k), mapId: `m${k}`, upto, total: list.length }, { keep: true });
      continue;
    }
    if (k === slow) {
      // Straggler: a failing disk makes this mapper read at a fraction of the others' rate
      const list = splits[k], done = Math.min(1, list.length);
      emit(k, k, list, `m${k}.split${k}`, 0, done);
      s.set(`m${k}`, { led: "warn", sub: "disk failing" });
      s.tag(`m${k}`, "slow disk", { tone: "warn" });
      s.line(2, 3);
      step("slow.disk", `{ref:m${k}|map ${k}}'s disk is failing, so it reads slowly: it has written ${done} of ${list.length} slips.`,
        { map: mapRef(k), mapId: `m${k}`, done, total: list.length }, { keep: true });
      continue;
    }
    healthy(k);
  }

  if (victim >= 0) {
    const j = helper(victim);
    const copy = j === victim ? `m${j}.split${victim}.retry` : `m${j}.split${victim}`;
    const lost = Math.min(splits[victim].length, Math.max(1, Math.floor(splits[victim].length / 2)));
    const cv = { map: mapRef(victim), mapId: `m${victim}`, mapName: `map ${victim}`, helper: mapRef(j), helperId: `m${j}`,
      split: `split ${victim}`, splitId: `split${victim}`, lost, total: splits[victim].length };
    if (j === victim) {
      // nobody else can take the task: the master restarts the worker; its lost output stays dead in the tray
      s.set(`m${j}`, { led: "ok", dim: false, sub: "restarted", state: { host: ip(10, j), task: null, status: "restarted" } });
      step("crash.restart", `No other machine is free, so the master restarts {ref:m${j}|map ${j}}.`, cv);
    }
    s.ask(`map ${victim} crashed after ${lost} of its ${splits[victim].length} ${unit}. What happens to its piece?`,
      [`The count comes out ${plural(lost, thing)} short`, "The master has the piece read again", "The whole job starts over"], 1,
      { id: "crash.what", why: "The text is still in the shared input, and reading it again gives the same slips, so redoing just that piece is safe." });
    s.spawn(copy, { from: `split${victim}`, in: `m${j}`, of: "page", text: `split ${victim}`, sub: `${splits[victim].length} ${unit}` });
    s.set(`m${j}`, { led: "busy" });
    s.tag(`split${victim}`, `read again on map ${j}`, { tone: "warn" });
    step("crash.rerun", `The master re-runs split ${victim} on {ref:m${j}|map ${j}}: the text is still safe in the input.`, cv, { keep: true });
    emit(j, victim, splits[victim], copy, 0, splits[victim].length, j === victim ? "r" : "");
    finish(j, copy);
    s.line(2, 3);
    step("crash.reread", `{ref:m${j}|map ${j}} reads split ${victim} again and writes the same ${plural(splits[victim].length, "slip")}.`, cv);
    if (p.combiner) combine(j);
  }

  if (slow >= 0) {
    const list = splits[slow];
    const sv = { map: mapRef(slow), mapId: `m${slow}`, mapName: `map ${slow}`, split: `split ${slow}`, splitId: `split${slow}`, total: list.length };
    if (M === 1) {
      // nowhere to run a backup: the whole job waits for the slow worker
      emit(slow, slow, list, `m${slow}.split${slow}`, Math.min(1, list.length), list.length);
      finish(slow, `m${slow}.split${slow}`);
      step("slow.wait", `With no other machine, there is no backup: the job waits for all ${plural(list.length, thing)}.`, sv);
      if (p.combiner) combine(slow);
    } else {
      // near the end of the map phase the master schedules a backup copy of the slow task on an idle worker
      const j = helper(slow), backup = `m${j}.split${slow}.backup`;
      const had = tray[slow].length;
      Object.assign(sv, { helper: mapRef(j), helperId: `m${j}`, had });
      s.ask(`map ${slow} has written ${had} of its ${list.length} slips, and the other machines are done. What does the master do?`,
        ["Wait: the job cannot finish without its piece", "Start a copy of its piece on a free machine", "Skip its words to finish on time"], 1,
        { id: "slow.what", why: "Reading a piece twice gives the same slips, so a backup copy is safe, and the master keeps whichever finishes first." });
      s.spawn(backup, { from: `split${slow}`, in: `m${j}`, of: "page", text: `split ${slow}`, sub: "backup" });
      s.set(`m${j}`, { led: "busy" });
      s.tag(`split${slow}`, `backup on map ${j}`, { tone: "busy" });
      step("slow.backup", `{ref:m${j}|map ${j}} is free, so the master starts a {tone:busy|backup} copy of split ${slow} on it.`, sv, { keep: true });
      // the race: the backup emits every word while the straggler manages one more
      const before = tray[slow].length;
      emit(j, slow, list, backup, 0, list.length, "b");
      if (before < list.length) { emit(slow, slow, list, `m${slow}.split${slow}`, before, before + 1); }
      const straggled = tray[slow].length;
      s.line(2, 3);
      step("slow.race", `Both copies run: the backup writes all ${list.length} slips while {ref:m${slow}|map ${slow}} manages ${straggled - before} more.`,
        { ...sv, more: straggled - before });
      // whichever finishes first wins; the other is killed and its output thrown away
      s.remove(backup, { style: "sink" });
      s.set(`m${j}`, { led: "ok" });
      s.count("tasks");
      s.beat();
      discard(slow, `m${slow}.split${slow}`);
      s.set(`m${slow}`, { led: "idle", sub: list.length - straggled ? "stopped" : "unused" });
      // a short piece: the slow copy finishes too, so nothing is stopped; the master still keeps one copy's slips
      const short = list.length - straggled;
      s.tag(`m${slow}`, short ? "stopped" : "copy unused", { tone: "warn" });
      step(short ? "slow.win" : "slow.tie", short
        ? `The backup finishes first, so the master keeps its slips and stops {ref:m${slow}|map ${slow}}, ${plural(short, thing)} short.`
        : `Both copies finish; the master keeps the backup's slips and throws away {ref:m${slow}|map ${slow}}'s.`,
        { ...sv, short });
      if (p.combiner) combine(j);
    }
  }

  // ---- Shuffle ----
  s.phase("Shuffle", { id: "shuffle", about: skewed
    ? "In {term:shuffle|the shuffle}, each slip goes to the counting machine its {term:hash} picks. One code fills most of the log, so one machine receives most of the slips."
    : "In {term:shuffle|the shuffle}, every slip for one word must reach the same counting machine. A {term:hash} turns the word into a number; its remainder after dividing by the number of counters picks the machine." });
  const inbox = Array.from({ length: R }, () => []);
  const load = new Array(R).fill(0);
  const sentTo = new Map();   // word -> [reducer, from mapper] of its first copy
  let bytes = 0, moved = 0, noted = false, first = true;
  const slips = tray.flat().map((id) => s.get(id).state.word);
  V.shuffleBytes = slips.reduce((a, w) => a + w.length + 4, 0);   // each slip's word plus a 4-byte count
  // the aha is asked once, in the first story (and in the skew story, where the common word makes it new). The first
  // story asks it in the world: the reader picks the counter, and a wrong pick plays out for real (s.choose)
  const asks = scenario === "happy" || skewed;
  const queue = tray.flatMap((ids, k) => ids.map((id) => ({ k, id })));
  const left = tray.map((ids) => ids.length);                 // slips each reading machine still has to send
  // a slip leaves its reading machine and lands on its counter: both headers count it
  const arrive = (k, r) => {
    left[k]--;
    s.set(`m${k}`, { sub: left[k] ? plural(left[k], "slip") : "all sent" });
    s.set(`r${r}`, { sub: plural(load[r], "slip"), ...(skewed ? { meter: load[r] / Math.max(1, queue.length) } : {}) });
  };
  for (let qi = 0; qi < queue.length; qi++) {
    const { k, id } = queue[qi];
    const { word, count } = s.get(id).state;
    const r = hash(word) % R;
    // the aha: the first word that comes back a second time goes where its first copy went
    const again = sentTo.get(word);
    const meets = !!again && !noted && R > 1;   // the first word that comes back a second time
    if (meets) noted = true;
    let pick = null;
    if (meets && asks && !skewed) {
      pick = s.choose("shuffle.which", {
        prompt: `The first "${word}" went to reduce ${again[0]}. Click the counting machine that should get this one.`,
        options: Array.from({ length: R }, (_, q) => ({ pick: `r${q}`, right: q === r })),
        why: `hash(${word}) is the same number every time, so every "${word}" meets on reduce ${r}.`,
      });
    } else if (meets && asks) {
      s.ask(`The first "${word}" went to reduce ${again[0]}. Where does this "${word}", from map ${k}, go?`,
        [`Reduce ${(again[0] + 1) % R}: spread the slips evenly`, `Reduce ${again[0]}, to join the first "${word}"`, "Nowhere yet: one machine counts everything at the end"], 1,
        { id: "shuffle.where", why: `hash(${word}) is the same number every time, so its remainder is ${r} every time: every "${word}" meets on reduce ${r}.` });
    }
    if (pick && !pick.right) {
      // the reader's pick, played for real: this copy goes to the other counter, and the word's count splits in two
      splitCount({ id, word, k, r, to: +pick.pick.slice(1), again, rest: queue.slice(qi + 1).map((x) => x.id) });
      return;
    }
    if (!sentTo.has(word)) sentTo.set(word, [r, k]);
    s.move(id, `r${r}`, { via: "shuffle-bus" });
    s.tag(id, `hash(${word}) % ${R} = ${r}`);
    const b = word.length + 4;
    bytes += b; moved++; load[r]++;
    arrive(k, r);
    s.count("bytes", b);
    s.gauge("skew", Math.round((Math.max(...load) / (moved / R)) * 100) / 100);
    s.line(8, 9);
    inbox[r].push(id);
    const chip = `{key:${word}}${count > 1 ? ` · ${count}` : ""}`;
    const tally = skewed ? `: it has ${load[r]} of ${moved} slips so far` : "";
    const sh = { w: K(word), count, red: redRef(r), redId: `r${r}`, slipId: id, rem: r, h: hash(word), eq: CODE(`hash(${word}) % ${R} = ${r}`),
      from: mapRef(k), load: load[r], moved, slips: slips.length,
      ...(again ? { firstRed: `reduce ${again[0]}`, otherRed: `reduce ${(again[0] + 1) % R}` } : {}) };
    const shuffleStep = (id, caption, o) => step(id, caption, sh, o);
    if (first) shuffleStep("shuffle.first", `${chip} goes to {ref:r${r}|reduce ${r}}: its hash, divided by ${plural(R, "counter")}, leaves remainder ${r} (\`hash(${word}) % ${R} = ${r}\`).`, { keep: true });
    else if (meets) shuffleStep("shuffle.again", `${chip} goes to {ref:r${r}|reduce ${r}} too: the same ${thing} always gives the same hash.`, { keep: true });
    else shuffleStep("shuffle.send", `${chip} goes to {ref:r${r}|reduce ${r}} because \`hash(${word}) % ${R} = ${r}\`${tally}.`);
    first = false;
  }

  // a wrong pick in the world: the slip goes where the reader sent it, the rest go where their hash sends them, and each
  // counter adds up only what it holds. The run ends on that split count; the HUD rewinds to the pick
  function splitCount({ id, word, k, r, to, again, rest }) {
    const sh = { w: K(word), count: 1, red: redRef(r), redId: `r${r}`, slipId: id, rem: r, h: hash(word), eq: CODE(`hash(${word}) % ${R} = ${r}`),
      from: mapRef(k), load: load[r], moved, slips: slips.length, firstRed: `reduce ${again[0]}`, otherRed: `reduce ${to}`,
      picked: redRef(to), pickedId: `r${to}` };
    s.move(id, `r${to}`, { via: "shuffle-bus" });
    s.tag(id, `sent to reduce ${to}`);
    s.count("bytes", word.length + 4);
    load[to]++;
    arrive(k, to);
    s.line(8, 9);
    step("choose.sent", `{key:${word}} goes to {ref:r${to}|reduce ${to}}, the counter you picked.`, sh, { keep: true });
    for (const x of rest) {
      const w = s.get(x).state.word, q = hash(w) % R;
      s.move(x, `r${q}`, { via: "shuffle-bus" }); s.count("bytes", w.length + 4);
      load[q]++;
      arrive(queue.find((e) => e.id === x).k, q);
    }
    if (rest.length) step("choose.rest", `The other ${plural(rest.length, "slip")} go where their hash sends them.`, { ...sh, rest: rest.length });
    // each counter adds up its own copies of the word: two totals for one word
    const totals = [r, to].map((q) => {
      const ids = s.get(`r${q}`).children.filter((x) => s.get(x).state.word === word);
      const n = ids.reduce((a, x) => a + s.get(x).state.count, 0), [keep, ...more] = ids;
      for (const x of more) s.remove(x, { to: keep });
      return { q, keep, n };
    });
    s.beat();
    for (const t of totals) {
      s.set(t.keep, { text: rec(word, t.n), tone: "fail", state: { word, count: t.n } });
      s.tag(`r${t.q}`, `${word} = ${t.n}`, { tone: "fail" });
    }
    s.focus(`r${r}`, `r${to}`);
    s.line(11, 12);
    const [a, b] = totals;
    step("choose.split", `{ref:r${r}|reduce ${r}} counts {key:${word}} = ${a.n} and {ref:r${to}|reduce ${to}} counts {key:${word}} = ${b.n}: two totals, and the text has ${a.n + b.n}.`,
      { ...sh, here: a.n, there: b.n, total: a.n + b.n }, { keep: true });
  }

  // ---- Reduce ----
  s.phase("Reduce", { id: "reduce", about: `Each counting machine, a {term:reducer}, sorts its slips so equal ${thing}s sit together, then adds up each group into one total.` });
  const results = Array.from({ length: R }, () => []);
  for (let r = 0; r < R; r++) {
    const ids = inbox[r];
    if (!ids.length) {
      s.set(`r${r}`, { led: "ok", sub: "no slips" });
      s.count("tasks");
      step("reduce.empty", `{ref:r${r}|reduce ${r}} got no slips and finishes empty.`, { red: redRef(r), redId: `r${r}` });
      continue;
    }
    s.set(`r${r}`, { led: "busy", sub: "sorting" });
    // selection sort by swaps: each beat two records trade places, nothing else moves
    const order = ids.slice();
    const word = (id) => s.get(id).state.word;
    let swaps = 0;
    for (let j = 0; j < order.length; j++) {
      let m = j;
      for (let q = j + 1; q < order.length; q++) if (word(order[q]) < word(order[m])) m = q;
      if (m === j) continue;
      if (swaps++) s.beat();
      s.swap(order[j], order[m]);
      [order[j], order[m]] = [order[m], order[j]];
    }
    if (!swaps) s.lit(`r${r}`);
    s.line(11);
    const rv = { red: redRef(r), redId: `r${r}`, got: ids.length };
    step(swaps ? "reduce.sort" : "reduce.sorted", swaps
      ? `{ref:r${r}|reduce ${r}} sorts its ${plural(ids.length, "slip")} so equal ${thing}s sit together.`
      : `{ref:r${r}|reduce ${r}}'s ${plural(ids.length, "slip")} already arrive in order.`, rv);
    // merge runs of equal keys
    const runs = [];
    for (const id of order) {
      const w = s.get(id).state.word;
      if (runs.length && runs[runs.length - 1].word === w) runs[runs.length - 1].ids.push(id); else runs.push({ word: w, ids: [id] });
    }
    let first = true;
    const merged = runs.filter((x) => x.ids.length > 1);
    for (const run of merged) {
      if (!first) s.beat();
      first = false;
      const [keep, ...rest] = run.ids;
      run.total = run.ids.reduce((a, id) => a + s.get(id).state.count, 0);
      for (const id of rest) s.remove(id, { to: keep });
      s.beat();
      s.set(keep, { text: rec(run.word, run.total), state: { word: run.word, count: run.total } });
    }
    if (!merged.length) s.lit(`r${r}`);
    s.set(`r${r}`, { led: "ok", sub: plural(runs.length, "total") });
    s.count("tasks");
    s.line(11, 12);
    results[r] = runs.map((x) => x.ids[0]);
    const ones = runs.filter((x) => x.ids.length === 1);
    step(!merged.length ? "reduce.single" : ones.length ? "reduce.sum" : "reduce.sum-all", merged.length
      ? `{ref:r${r}|reduce ${r}} adds up each group: ${merged.map((x) => `{key:${x.word}} = ${x.total}`).join(", ")}.`
      : `{ref:r${r}|reduce ${r}} has no repeated ${thing}s, so each count stays as it is.`,
      { ...rv, sums: merged.map((x) => ({ markup: `{key:${x.word}} = ${x.total}` })), totals: runs.length, sumIds: merged.map((x) => x.ids[0]),
        all: runs.map((x) => ({ markup: `{key:${x.word}} = ${s.get(x.ids[0]).state.count}` })), ones: ones.map((x) => K(x.word)) });
  }

  // ---- Output ----
  s.phase("Output", { id: "output", about: `Each counter posts its totals to the shared output, like a list on a noticeboard. Together they hold exactly one count for every different ${skewed ? "status code" : "word"}.` });
  let posted = 0;
  for (let r = 0; r < R; r++) {
    if (!results[r].length) continue;
    results[r].forEach((id, j) => { if (j) s.beat(); s.move(id, "output", { via: `r${r}-out` }); s.set("output", { sub: plural(++posted, "total") }); });
    s.set(`r${r}`, { sub: "posted" });
    step("output.write", `{ref:r${r}|reduce ${r}} writes its ${plural(results[r].length, "total")} to the output.`, { red: redRef(r), redId: `r${r}`, totals: results[r].length, part: `part-r-0000${r}` });
  }
  const distinct = new Set(words).size;
  s.lit("output");
  s.focus("output");   // the payoff: the camera frames the answer large
  if (skewed && moved) {
    const hot = load.indexOf(Math.max(...load));
    const hv = { hot: redRef(hot), hotId: `r${hot}`, load: load[hot], moved, share: Math.round((load[hot] / (moved / R)) * 10) / 10 };
    step("skew.done", `Done. {ref:r${hot}|reduce ${hot}} got ${load[hot]} of ${moved} slips, ${(load[hot] / (moved / R)).toFixed(1)}× its fair share: one common code overloads it.`, hv, { keep: true });
    if (!p.combiner) {
      // the remedy, from the same run: if each reader added up its repeats first, it would send one slip per code
      const sent = splits.flatMap((list) => [...new Set(list)]);
      const hotC = sent.filter((w) => hash(w) % R === hot).length;
      step("skew.combine", `If each reader added up its repeats first, ${plural(sent.length, "slip")} would travel, ${hotC} of them to {ref:r${hot}|reduce ${hot}}.`,
        { ...hv, sent: sent.length, hotC });
    }
  } else step(biggest < words.length ? "output.done" : "output.done-alone", biggest < words.length
    ? `Done: all ${words.length} words counted, ${distinct} different ones, and no machine read the whole text.`
    : `Done: all ${words.length} words counted, ${distinct} different ones.`, {}, { keep: true });

  // ---- The end check: questions the run's own rules answer, mostly at other knob values (s.check) ----
  if (words.length) {
    // numeric options: the answer and its likely confusions, distinct and in order
    const nums = (answer, ...others) => { const o = [...new Set([answer, ...others])].sort((a, b) => a - b); return { options: o.map(String), answer: o.indexOf(answer) }; };
    const R2 = R === 3 ? 4 : 3, w2 = top[0], rem2 = hash(w2) % R2;
    s.check("check.hash", { chapter: "shuffle", transfer: true,
      question: `With ${R2} counting machines, which one gets every "${w2}" slip?`,
      options: Array.from({ length: R2 }, (_, q) => `reduce ${q}`), answer: rem2,
      vars: { R, M, R2, w: K(w2), rem2, red2: `reduce ${rem2}` } });
    const M2 = M === 4 ? 5 : 4, big2 = Math.ceil(words.length / M2);
    const split = nums(big2, words.length, Math.floor(words.length / M2) === big2 ? M2 : Math.floor(words.length / M2));
    if (split.options.length > 1) s.check("check.split", { chapter: "split", ...split,
      question: `With ${M2} reading machines, how many ${unit} does the busiest one read?`,
      vars: { R, M, M2, n: words.length, big2 } });
    const totals = nums(freq.size, freq.size + 1, words.length + 1);
    if (totals.options.length > 1) s.check("check.totals", { chapter: "output", ...totals,
      question: `Add one more "${w2}" to the ${skewed ? "log" : "text"}. How many totals would the output hold?`,
      vars: { R, M, w: K(w2), distinct: freq.size } });
  }

  // ---- At scale: the same job on the paper's cluster (a simplified picture: every number is the paper's) ----
  if (scenario === "happy") {
    s.scale({
      count: PAPER_JOB.machines, run: [...V.mapIds, ...Array.from({ length: R }, (_, r) => `r${r}`)], from: "output",
      title: `${fmt(PAPER_JOB.machines)} machines`,
      lines: [`The paper's typical job: M = ${fmt(PAPER_JOB.M)} map tasks, R = ${fmt(PAPER_JOB.R)} reduce tasks`, "Dean & Ghemawat, OSDI 2004, §3.5"],
    });
    step("scale.cluster", `The same job at the paper's scale: ${fmt(PAPER_JOB.M)} map tasks, ${fmt(PAPER_JOB.R)} reduce tasks, ${fmt(PAPER_JOB.machines)} machines. Shown simplified.`,
      { machines: fmt(PAPER_JOB.machines), paperM: fmt(PAPER_JOB.M), paperR: fmt(PAPER_JOB.R), runMachines: M + R }, { keep: true });
  }
}

// Dean & Ghemawat, OSDI 2004, §3.5: "We often perform MapReduce computations with M = 200,000 and R = 5,000, using
// 2,000 worker machines." The scale shot prints only these, labelled as the paper's.
const PAPER_JOB = Object.freeze({ M: 200000, R: 5000, machines: 2000 });
const fmt = (n) => n.toLocaleString("en-US");
