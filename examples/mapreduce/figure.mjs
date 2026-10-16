// MapReduce word count: the flagship Explainer figure (CONTRACTS.md section 9).
// A real run: the input really is split, the mappers really emit (word, 1), the shuffle really partitions by
// hash(word) % R, the reducers really sort and sum. Scenarios: a worker dies and its task is re-run; a straggler
// is beaten by a backup task (Dean & Ghemawat, section 3.6); a skewed key overloads one reducer.

export const meta = {
  title: "MapReduce",
  subtitle: "Counting words across a cluster",
  kicker: "Distributed systems",
  fig: 1,
  cite: { text: "Dean & Ghemawat, OSDI 2004", url: "https://research.google/pubs/pub62/" },
  theme: "dark",
  hook: "No machine ever sees the whole text. How does the cluster still count every word exactly?",
  takeaway: "No machine saw the whole input, yet every count is exact: hashing sends every copy of a word to the same reducer.",
};

export const params = {
  mappers: { label: "Mappers", type: "int", min: 1, max: 6, value: 3 },
  reducers: { label: "Reducers", type: "int", min: 1, max: 4, value: 2 },
  combiner: { label: "Combiner", type: "bool", value: false },
  input: { label: "Input", type: "text", value: "the quick brown fox jumps over the lazy dog the fox" },
  seed: { label: "Seed", type: "int", value: 7 },
};

export const scenarios = [
  { id: "happy", label: "Normal run", whatIf: "nothing goes wrong",
    description: "Every machine stays healthy: the whole job, from splitting the text to the final counts." },
  { id: "crash", label: "Worker dies", params: { crash: 1 }, whatIf: "a worker dies",
    description: "A mapper crashes halfway through its split, and the master runs that split again on another machine.",
    takeaway: "A worker died mid-task and the answer did not change: its split was still in the input, so the master just ran it again elsewhere." },
  { id: "straggler", label: "Straggler", params: { straggler: 1 }, whatIf: "one machine is slow",
    description: "One mapper's disk is slow, so the master races a backup copy of its task on an idle machine.",
    takeaway: "One slow disk could have held up the whole job. A backup copy of its task finished first, and the answer is the same." },
  { id: "skew", label: "Skewed keys", params: { input: "200 200 404 200 200 301 200 200 500 200 200 200 304 200", reducers: 3 }, whatIf: "one key is everywhere",
    description: "A log of HTTP status codes where 200 is almost every line, so one reducer gets most of the work.",
    takeaway: "Hashing sends every copy of a key to the same reducer, so one hot key piles its whole load onto one machine." },
];

// the dock shows the primary numbers; every number, with its hint, is one click away
export const counters = {
  records: { label: "words mapped", format: "int", primary: true,
    hint: "Each word a mapper reads becomes one (word, 1) record. Words read again after a failure count again." },
  bytes: { label: "sent between machines", short: "sent", format: "bytes", primary: true,
    hint: "Data the shuffle moves from mappers to reducers: each record's word plus a 4-byte count." },
  skew: { label: "busiest reducer's load", short: "busiest reducer", format: "x", primary: ["skew"],
    hint: "Records at the busiest reducer divided by the average per reducer. 1× is perfectly even." },
  tasks: { label: "tasks finished", format: "int",
    hint: "Map and reduce tasks completed so far, counting any task that had to run again." },
};

export const code = {
  lang: "python",
  source: [
    "def map(split):",
    "    for word in split.split():",
    "        emit(word, 1)",
    "",
    "def combine(word, counts):        # optional, on the mapper",
    "    emit(word, sum(counts))",
    "",
    "def partition(word, R):",
    "    return hash(word) % R",
    "",
    "def reduce(word, counts):",
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
  "every word counted once": (snap) => {
    if (!snap.final) return true;
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

export function build(s, p, scenario, env = {}) {
  const M = Math.max(1, Math.min(6, p.mappers | 0));
  const R = Math.max(1, Math.min(4, p.reducers | 0));
  const words = String(p.input ?? "").toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);
  const victim = scenario === "crash" || (scenario !== "happy" && pinned(p.crash)) ? Math.min(M - 1, Math.max(0, (p.crash ?? 1) | 0)) : -1;
  const slow = victim < 0 && (scenario === "straggler" || (scenario !== "happy" && pinned(p.straggler))) ? Math.min(M - 1, Math.max(0, (p.straggler ?? 1) | 0)) : -1;
  const skewed = scenario === "skew";
  const unit = skewed ? "lines" : "words";

  // splits: contiguous runs of words, as even as possible
  const splits = [];
  for (let k = 0, at = 0; k < M; k++) {
    const n = Math.floor(words.length / M) + (k < words.length % M ? 1 : 0);
    splits.push(words.slice(at, at + n));
    at += n;
  }

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
  for (let k = 0; k < M; k++) s.housing(`m${k}`, { in: "map", title: `map ${k}`, sub: ip(10, k), tray: { cols, of: "record" }, led: "idle", state: { host: ip(10, k), task: null } });
  s.spacer("shuffle", { in: "job" });
  stage("reduce", { in: "job", title: "reduce", gap: 18, align: portrait ? "start" : "center" });
  for (let r = 0; r < R; r++) s.housing(`r${r}`, { in: "reduce", title: `reduce ${r}`, sub: ip(20, r), tray: { cols, of: "record" }, led: "idle", state: { host: ip(20, r), partition: r } });
  s.housing("output", { in: "job", variant: "store", title: "output", sub: "part-r-0000*", tray: { cols: 2, of: "record" } });
  for (let k = 0; k < M; k++) s.trace(`in-m${k}`, "input", `m${k}`, sides);
  s.bus("shuffle-bus", { from: Array.from({ length: M }, (_, k) => `m${k}`), to: Array.from({ length: R }, (_, r) => `r${r}`), via: "shuffle" });
  for (let r = 0; r < R; r++) s.trace(`r${r}-out`, `r${r}`, "output", sides);

  s.phase("Split", { about: skewed
    ? "The log is too big for one machine, so the master cuts it into splits, one per map task. Each split can then be read on its own, all at the same time."
    : "The text is too big for one machine, so the master cuts it into splits, one per map task. Each split can then be read on its own, all at the same time." });
  s.step(skewed
    ? `Counting status codes in an access log: ${words.length} requests, ${M} map ${M === 1 ? "task" : "tasks"}, ${R} reduce ${R === 1 ? "task" : "tasks"}`
    : `A word-count job: ${M} map ${M === 1 ? "task" : "tasks"}, ${R} reduce ${R === 1 ? "task" : "tasks"}, ${words.length} words of input`);

  // ---- Split ----
  for (let k = 0; k < M; k++) s.tile(`split${k}`, { in: "input", of: "page", text: `split ${k}`, sub: `${splits[k].length} ${unit}`, state: { words: splits[k] } });
  s.line(1);
  s.step(`The input is cut into ${M} ${M === 1 ? "split" : "splits"} of about ${Math.round(words.length / M)} ${unit}`);

  // ---- Map ----
  const unitOne = skewed ? "`(code, 1)`" : "`(word, 1)`";
  s.phase("Map", { about: victim >= 0
    ? `Each mapper turns its split into ${unitOne} records. When one crashes, everything it emitted is lost with it, so the master simply runs that split again on another worker.`
    : slow >= 0
      ? (M > 1
        ? `Each mapper turns its split into ${unitOne} records. One machine has a slow disk, so near the end the master starts a backup copy of its task and keeps whichever finishes first.`
        : `Each mapper turns its split into ${unitOne} records. This one has a slow disk, and with no other mapper free to run a backup, the whole job must wait for it.`)
      : `Each mapper reads its split and emits one ${unitOne} record per ${skewed ? "request" : "word"}. Mappers share nothing, so they all work in parallel.` +
        (p.combiner ? " A combiner then merges repeats on the mapper, so less data crosses the network." : "") });
  const tray = Array.from({ length: M }, () => []);       // live record ids per mapper, in tray order
  for (let k = 0; k < M; k++) {
    s.spawn(`m${k}.split${k}`, { from: `split${k}`, in: `m${k}`, of: "page", text: `split ${k}`, sub: `${splits[k].length} ${unit}` });
    s.set(`m${k}`, { led: "busy", state: { host: ip(10, k), task: `map ${k}` } });
  }
  s.step(`The master hands each mapper one split; the splits travel to ${M === 1 ? "it" : "them"} in parallel`);

  // emit words [from, to) of a split from a split copy into mapper k, one beat per word
  const emit = (k, split, list, src, from = 0, to = list.length, suffix = "") => {
    for (let i = from; i < to; i++) {
      const w = list[i], id = `m${k}.s${split}.w${i}${suffix}`;
      if (i > from) s.beat();
      s.spawn(id, { from: src, in: `m${k}`, of: "record", text: rec(w, 1), key: w, state: { word: w, count: 1 } });
      s.count("records");
      tray[k].push(id);
    }
  };
  const finish = (k, src) => {
    s.beat();
    s.remove(src, { style: "sink" });
    s.set(`m${k}`, { led: "ok", state: { host: ip(10, k), task: null } });
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
    s.line(5, 6);
    s.step(`The combiner on {ref:m${k}|map ${k}} folds repeated keys: ${dup.map(([w, ids]) => `{key:${w}} × ${ids.length}`).join(", ")} leave as one record each`);
  };
  // a task's output is discarded: it stays where it is, dimmed, and is never shuffled
  const discard = (k, src) => {
    for (const id of tray[k]) s.set(id, { dim: true });
    tray[k] = [];
    if (s.has(src)) s.set(src, { dim: true });
  };
  const healthy = (k) => {
    emit(k, k, splits[k], `m${k}.split${k}`);
    finish(k, `m${k}.split${k}`);
    s.line(2, 3);
    s.step(splits[k].length
      ? `{ref:m${k}|map ${k}} emits \`(word, 1)\` for each of its ${splits[k].length} words, keyed by the word`
      : `{ref:m${k}|map ${k}} has an empty split and finishes at once`);
    if (p.combiner) combine(k);
  };
  const helper = (bad) => { for (let k = 0; k < M; k++) if (k !== bad) return k; return bad; };

  for (let k = 0; k < M; k++) {
    if (k === victim) {
      // Worker dies: half way through its split the mapper stops answering the master's pings
      const list = splits[k], upto = Math.min(list.length, Math.max(1, Math.floor(list.length / 2)));
      emit(k, k, list, `m${k}.split${k}`, 0, upto);
      s.line(2, 3);
      s.step(`{ref:m${k}|map ${k}} starts emitting \`(word, 1)\` for split ${k}`);
      s.set(`m${k}`, { led: "fail", dim: true, state: { host: ip(10, k), task: `map ${k}`, status: "down" } });
      s.tag(`m${k}`, "missed heartbeat", { tone: "fail" });
      discard(k, `m${k}.split${k}`);
      s.step(`{ref:m${k}|map ${k}} {tone:fail|crashes} after ${upto} of ${list.length} words; what it emitted is lost with it`);
      continue;
    }
    if (k === slow) {
      // Straggler: a failing disk makes this mapper read at a fraction of the others' rate
      const list = splits[k], done = Math.min(1, list.length);
      emit(k, k, list, `m${k}.split${k}`, 0, done);
      s.set(`m${k}`, { led: "warn", sub: "disk 11 MB/s" });
      s.tag(`m${k}`, "slow disk", { tone: "warn" });
      s.line(2, 3);
      s.step(`{ref:m${k}|map ${k}} is a {tone:warn|straggler}: its disk reads at 11 MB/s, and it has emitted ${done} of ${list.length} words`);
      continue;
    }
    healthy(k);
  }

  if (victim >= 0) {
    const j = helper(victim);
    const copy = j === victim ? `m${j}.split${victim}.retry` : `m${j}.split${victim}`;
    if (j === victim) {
      // nobody else can take the task: the master restarts the worker; its lost output stays dead in the tray
      s.set(`m${j}`, { led: "ok", dim: false, state: { host: ip(10, j), task: null, status: "restarted" } });
      s.step(`No other mapper is free, so the master restarts {ref:m${j}|map ${j}}`);
    }
    s.spawn(copy, { from: `split${victim}`, in: `m${j}`, of: "page", text: `split ${victim}`, sub: `${splits[victim].length} words` });
    s.set(`m${j}`, { led: "busy" });
    s.tag(`split${victim}`, `re-run on map ${j}`, { tone: "warn" });
    s.step(`The master re-runs split ${victim} on {ref:m${j}|map ${j}}; the input is still there, so nothing is lost but time`);
    emit(j, victim, splits[victim], copy, 0, splits[victim].length, j === victim ? "r" : "");
    finish(j, copy);
    s.line(2, 3);
    s.step(`{ref:m${j}|map ${j}} emits the ${splits[victim].length} words of split ${victim} again`);
    if (p.combiner) combine(j);
  }

  if (slow >= 0) {
    const list = splits[slow];
    if (M === 1) {
      // nowhere to run a backup: the whole job waits for the slow worker
      emit(slow, slow, list, `m${slow}.split${slow}`, Math.min(1, list.length), list.length);
      finish(slow, `m${slow}.split${slow}`);
      s.step(`With a single mapper there is nowhere to run a backup: the job waits for the straggler to finish its ${list.length} words`);
      if (p.combiner) combine(slow);
    } else {
      // near the end of the map phase the master schedules a backup copy of the slow task on an idle worker
      const j = helper(slow), backup = `m${j}.split${slow}.backup`;
      s.spawn(backup, { from: `split${slow}`, in: `m${j}`, of: "page", text: `split ${slow}`, sub: "backup" });
      s.set(`m${j}`, { led: "busy" });
      s.tag(`split${slow}`, `backup on map ${j}`, { tone: "busy" });
      s.step(`The map phase is almost done but split ${slow} is not, so the master starts a {tone:busy|backup} of it on idle {ref:m${j}|map ${j}}`);
      // the race: the backup emits every word while the straggler manages one more
      const before = tray[slow].length;
      emit(j, slow, list, backup, 0, list.length, "b");
      if (before < list.length) { emit(slow, slow, list, `m${slow}.split${slow}`, before, before + 1); }
      const straggled = tray[slow].length;
      s.line(2, 3);
      s.step(`Both copies run: the backup on {ref:m${j}|map ${j}} emits all ${list.length} words while {ref:m${slow}|map ${slow}} manages ${straggled - before} more`);
      // whichever finishes first wins; the other is killed and its output thrown away
      s.remove(backup, { style: "sink" });
      s.set(`m${j}`, { led: "ok" });
      s.count("tasks");
      s.beat();
      discard(slow, `m${slow}.split${slow}`);
      s.set(`m${slow}`, { led: "idle", sub: ip(10, slow) });
      s.tag(`m${slow}`, "killed", { tone: "warn" });
      s.step(`The backup finishes first, so the master keeps its output and kills the straggler, which had ${list.length - straggled} ${list.length - straggled === 1 ? "word" : "words"} to go`);
      if (p.combiner) combine(j);
    }
  }

  // ---- Shuffle ----
  s.phase("Shuffle", { about: skewed
    ? "Each record goes to the reducer picked by `hash(key) % R`, where R is the number of reducers. One status code dominates the log, so one reducer receives most of the records."
    : "Each record goes to the reducer picked by `hash(word) % R`, where R is the number of reducers. Every copy of a word lands on the same reducer, so its counts end up together." });
  const inbox = Array.from({ length: R }, () => []);
  const load = new Array(R).fill(0);
  let bytes = 0, moved = 0;
  for (let k = 0; k < M; k++) {
    for (const id of tray[k]) {
      const { word, count } = s.get(id).state;
      const r = hash(word) % R;
      s.move(id, `r${r}`, { via: "shuffle-bus" });
      s.tag(id, `hash(${word}) % ${R} = ${r}`);
      const b = word.length + 4;
      bytes += b; moved++; load[r]++;
      s.count("bytes", b);
      s.gauge("skew", Math.round((Math.max(...load) / (moved / R)) * 100) / 100);
      s.line(8, 9);
      inbox[r].push(id);
      s.step(`{key:${word}}${count > 1 ? ` · ${count}` : ""} goes to {ref:r${r}|reduce ${r}} because \`hash(${word}) % ${R} = ${r}\` (${b} bytes)` +
        (skewed ? `; it now holds ${load[r]} of ${moved}` : ""));
    }
  }

  // ---- Reduce ----
  s.phase("Reduce", { about: `Each reducer sorts its records so equal ${skewed ? "codes" : "words"} sit side by side, then adds up each run of equals into a single total.` });
  const results = Array.from({ length: R }, () => []);
  for (let r = 0; r < R; r++) {
    const ids = inbox[r];
    if (!ids.length) {
      s.set(`r${r}`, { led: "ok" });
      s.count("tasks");
      s.step(`{ref:r${r}|reduce ${r}} received no keys and finishes empty`);
      continue;
    }
    s.set(`r${r}`, { led: "busy" });
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
    s.step(swaps
      ? `{ref:r${r}|reduce ${r}} sorts its ${ids.length} records by key (${swaps} ${swaps === 1 ? "swap" : "swaps"}), so equal words sit side by side`
      : `{ref:r${r}|reduce ${r}}'s ${ids.length} records already arrive in key order`);
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
    s.set(`r${r}`, { led: "ok" });
    s.count("tasks");
    s.line(11, 12);
    results[r] = runs.map((x) => x.ids[0]);
    s.step(merged.length
      ? `{ref:r${r}|reduce ${r}} sums each run: ${merged.map((x) => `{key:${x.word}} = ${x.total}`).join(", ")}`
      : `{ref:r${r}|reduce ${r}} has no repeated keys; every count stays as it is`);
  }

  // ---- Output ----
  s.phase("Output", { about: `Each reducer writes its totals to the shared output. Together they hold exactly one count for every distinct ${skewed ? "status code" : "word"} in the input.` });
  for (let r = 0; r < R; r++) {
    if (!results[r].length) continue;
    results[r].forEach((id, j) => { if (j) s.beat(); s.move(id, "output", { via: `r${r}-out` }); });
    s.step(`{ref:r${r}|reduce ${r}} writes its ${results[r].length} ${results[r].length === 1 ? "result" : "results"} to the output`);
  }
  const distinct = new Set(words).size;
  s.lit("output");
  s.focus("output");   // the payoff: the camera frames the answer large
  if (skewed && moved) {
    const hot = load.indexOf(Math.max(...load));
    s.step(`Done. {ref:r${hot}|reduce ${hot}} handled ${load[hot]} of ${moved} records, ${(load[hot] / (moved / R)).toFixed(1)}× its fair share: one hot key loads one reducer`);
  } else s.step(`Done: ${distinct} distinct words, ${words.length} counted, ${bytes} bytes shuffled`);
}
