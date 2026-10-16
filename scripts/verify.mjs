#!/usr/bin/env node
// Headless verification of a figure, in Node: export shapes, then for every scenario and every param at its
// extremes: compile, determinism (two compiles, same tl.hash and same steps), tl.problems, a caption on every
// step, invariants on every snapshot, counters declared, step count and phase length sanity, and a sampler pass
// (no throw, finite poses, focus inside the world, exact backward scrub). Exit 1 on any error.
// Compiles run in a worker thread so an infinite loop in build() is reported instead of hanging.
import { Worker, isMainThread, workerData, parentPort } from "node:worker_threads";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, isMain, showPath } from "./lib/args.mjs";
import { tokenize } from "./lib/modules.mjs";
import { foldPlan, foldedDuration } from "../engine/playback.mjs";
import { rng as simRng } from "../sim/rng.mjs";   // the page (engine/runtime.mjs) seeds s.rng with this too

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");
const DEFAULT_COMPILER = join(skillRoot, "engine", "scene", "index.mjs");

const USAGE = `
usage: node scripts/verify.mjs <figure.mjs> [options]
  --compiler <file>   module exporting compile() (default engine/scene/index.mjs)
  --quick             defaults of each scenario only (no param extremes)
  --no-sample         skip the sampler pass
  --timeout <s>       give up on a run after this long (default 20)
  --json              machine-readable output
`;
const PARAM_TYPES = ["int", "float", "bool", "text", "select"];
const FORMATS = ["int", "bytes", "ms", "pct", "x"];
const MAX_STEPS = 400, MIN_STEPS = 4, MAX_PHASE_S = 150;   // chapters pause for the reader (guided mode), so long ones are fine

const plain = (m = "") => String(m).replace(/\{(?:key|ref|tone):([^}|]+)(?:\|([^}]+))?\}/g, (_, a, b) => b ?? a).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
const clip = (s, n = 64) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const fmtVal = (v) => (typeof v === "string" ? JSON.stringify(clip(v, 20)) : String(v));

// ------------------------------------------------------------------ worker: does the work

function staticChecks(fig, file) {
  const errors = [], warnings = [];
  const E = (m) => errors.push({ kind: "exports", message: m }), W = (m) => warnings.push({ kind: "exports", message: m });
  const meta = fig.meta;
  if (!meta || typeof meta !== "object") E("export const meta = { title, subtitle, kicker, fig, cite, theme } is missing");
  else {
    if (!meta.title) E("meta.title is missing");
    if (!meta.subtitle) W("meta.subtitle is missing (it becomes the page description)");
    if (!meta.kicker) W("meta.kicker is missing (shown as KICKER · FIG n)");
    if (meta.theme && !["dark", "light"].includes(meta.theme)) E(`meta.theme must be "dark" or "light", got ${fmtVal(meta.theme)}`);
  }
  if (typeof fig.build !== "function") E("export function build(s, params, scenario) is missing");
  const params = fig.params ?? {};
  for (const [k, d] of Object.entries(params)) {
    const at = `params.${k}`;
    if (!d || typeof d !== "object") { E(`${at} must be an object { label, type, value }`); continue; }
    if (!PARAM_TYPES.includes(d.type)) { E(`${at}.type must be one of ${PARAM_TYPES.join(", ")}, got ${fmtVal(d.type)}`); continue; }
    if (!d.label) W(`${at}.label is missing (the settings drawer shows it)`);
    const err = paramError(d, d.value);
    if (err) E(`${at}.value ${err}`);
    if ((d.type === "int" || d.type === "float") && d.min != null && d.max != null && d.min > d.max) E(`${at}: min ${d.min} > max ${d.max}`);
    if ((d.type === "int" || d.type === "float") && k !== "seed" && (d.min == null || d.max == null)) W(`${at} has no min/max, so verify cannot test its extremes`);
  }
  const scen = fig.scenarios;
  if (scen !== undefined && !Array.isArray(scen)) E("scenarios must be an array of { id, label, params }");
  else if (scen) {
    const seen = new Set();
    scen.forEach((s, i) => {
      if (!s?.id) { E(`scenarios[${i}] has no id`); return; }
      if (seen.has(s.id)) E(`scenario id "${s.id}" is used twice`);
      seen.add(s.id);
      if (!s.label) W(`scenario "${s.id}" has no label (the story picker shows it)`);
      if (scen.length > 1 && !s.description) W(`scenario "${s.id}" has no description: one line on what happens in this story (the story picker shows it)`);
      for (const [k, v] of Object.entries(s.params ?? {})) {
        // scenario-only settings (not knobs) are fine; a near-miss of a declared name is probably a typo
        if (!(k in params)) { const near = Object.keys(params).find((q) => q !== k && editDistance(q.toLowerCase(), k.toLowerCase()) <= Math.max(1, Math.floor(q.length / 4))); if (near) W(`scenario "${s.id}" sets params.${k}: did you mean params.${near}?`); }
        else { const err = paramError(params[k], v); if (err) E(`scenario "${s.id}": params.${k} ${err}`); }
      }
    });
  }
  for (const [k, c] of Object.entries(fig.counters ?? {})) {
    if (!c?.label) W(`counters.${k}.label is missing`);
    if (c?.format && !FORMATS.includes(c.format)) E(`counters.${k}.format must be one of ${FORMATS.join(", ")}, got ${fmtVal(c.format)}`);
    if (c?.decimals != null && !(Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= 6)) E(`counters.${k}.decimals must be an integer 0..6, got ${fmtVal(c.decimals)}`);
    if (c?.unit != null && typeof c.unit !== "string") E(`counters.${k}.unit must be a string, got ${fmtVal(c.unit)}`);
    if (c && !c.hint) W(`counters.${k} has no hint: one plain line on what the number means (the readout and its tooltip show it)`);
    if (c?.primary != null && c.primary !== true && c.primary !== false && !(Array.isArray(c.primary) && c.primary.every((id) => (scen ?? []).some((x) => x?.id === id))))
      E(`counters.${k}.primary must be true or a list of scenario ids, got ${fmtVal(c.primary)}`);
  }
  // the dock shows a story's primary numbers: 1 to 3 of them read at a glance
  const prim = (c, id) => c?.primary === true || (Array.isArray(c?.primary) && c.primary.includes(id));
  const cs = Object.values(fig.counters ?? {});
  if (cs.some((c) => c?.primary)) for (const id of (scen?.length ? scen.map((x) => x?.id) : [undefined])) {
    // grouped counters with one label share a dock slot
    const n = new Set(Object.entries(fig.counters).filter(([, c]) => prim(c, id)).map(([k, c]) => (c.group != null ? `label:${c.label}` : k))).size;
    if (n > 3) W(`${n} counters are primary${id ? ` in scenario "${id}"` : ""}: the dock reads best with 1 to 3`);
  }
  for (const [k, f] of Object.entries(fig.invariants ?? {})) if (typeof f !== "function") E(`invariants["${k}"] must be a function (snap) => true | "message"`);
  if (!Object.keys(fig.invariants ?? {}).length) W("no invariants: add at least one property of the run that must always hold");
  if (fig.code && typeof fig.code.source !== "string") E("code.source must be a string");
  // determinism smells in the figure source
  try {
    const t = tokenize(readFileSync(file, "utf8"));
    const src = readFileSync(file, "utf8");
    const line = (pos) => src.slice(0, pos).split("\n").length;
    for (let i = 0; i + 2 < t.length; i++) {
      const a = t[i].value, b = t[i + 1].value, c = t[i + 2].value;
      if (b === "." && ((a === "Math" && c === "random") || (a === "Date" && c === "now") || (a === "performance" && c === "now")))
        W(`line ${line(t[i].start)}: ${a}.${c}() makes the run nondeterministic; use s.rng (seeded from params.seed)`);
      if (a === "new" && b === "Date" && c === "(") W(`line ${line(t[i].start)}: new Date() makes the run nondeterministic`);
    }
  } catch {}
  return { errors, warnings, declared: Object.keys(fig.counters ?? {}) };
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function paramError(d, v) {
  if (d.type === "int") { if (!Number.isInteger(v)) return `must be an integer, got ${fmtVal(v)}`; }
  else if (d.type === "float") { if (typeof v !== "number" || !Number.isFinite(v)) return `must be a number, got ${fmtVal(v)}`; }
  else if (d.type === "bool") { if (typeof v !== "boolean" && v !== 0 && v !== 1) return `must be true/false, got ${fmtVal(v)}`; return null; }
  else if (d.type === "text") { if (typeof v !== "string") return `must be a string, got ${fmtVal(v)}`; return null; }
  else if (d.type === "select") {
    const opts = (d.options ?? []).map((o) => (o && typeof o === "object" ? o.value : o));
    if (!opts.length) return "select needs options: [{ value, label }]";
    if (!opts.includes(v)) return `${fmtVal(v)} is not one of the options (${opts.map(fmtVal).join(", ")})`;
    return null;
  }
  if (d.min != null && v < d.min) return `${v} is below min ${d.min}`;
  if (d.max != null && v > d.max) return `${v} is above max ${d.max}`;
  return null;
}

const PHONE_ENV = Object.freeze({ width: 390, height: 844, aspect: 390 / 844, portrait: true, phone: true });

function planRuns(fig, quick) {
  const params = fig.params ?? {};
  const defaults = Object.fromEntries(Object.entries(params).map(([k, d]) => [k, d?.value]));
  const scen = Array.isArray(fig.scenarios) && fig.scenarios.length ? fig.scenarios : [{ id: undefined, label: "default" }];
  const runs = [], ids = new Set();
  for (const s of scen) {
    if (ids.has(s.id)) continue;      // duplicate ids are an export error already
    ids.add(s.id);
    const base = { ...defaults, ...(s.params ?? {}) };
    runs.push({ label: s.id ?? "default", scenario: s.id, params: base, changed: {} });
    // the same story on a portrait phone: figures may lay themselves out differently there (build's 4th argument)
    runs.push({ label: `${s.id ?? "default"} · phone`, scenario: s.id, params: base, changed: {}, env: PHONE_ENV });
    if (quick) continue;
    for (const [k, d] of Object.entries(params)) {
      if (!d || (s.params && k in s.params)) continue;      // the scenario pins it
      let values = [];
      if ((d.type === "int" || d.type === "float") && d.min != null && d.max != null) values = [d.min, d.max];
      else if (d.type === "bool") values = [!d.value];
      else if (d.type === "select") { const o = (d.options ?? []).map((x) => (x && typeof x === "object" ? x.value : x)); values = [o[0], o[o.length - 1]]; }
      for (const v of new Set(values)) if (v !== base[k] && v !== undefined) runs.push({ label: `${s.id ?? "default"} · ${k}=${fmtVal(v)}`, scenario: s.id, params: { ...base, [k]: v }, changed: { [k]: v } });
    }
  }
  return runs;
}

const counterKeys = (c) => (c instanceof Map ? [...c.keys()] : Object.keys(c ?? {}));
const counterGet = (c, k) => (c instanceof Map ? c.get(k) : c?.[k]);

function fingerprint(tl) {
  return JSON.stringify([tl.duration, (tl.steps ?? []).map((s) => [s.caption, s.dur, s.phase, s.kinds]), (tl.phases ?? []).map((p) => [p.name, p.step]),
    counterKeys(tl.final?.counters).map((k) => [k, counterGet(tl.final.counters, k)])]);
}

const POSE_NUMS = ["x", "y", "z", "w", "d", "h", "yaw", "pitch", "roll", "scale", "opacity", "lit", "flash", "dim", "roll", "meter", "grow"];

function verifyRun(fig, compile, run, sample) {
  const errors = [], warnings = [];
  const E = (kind, message, step, extra) => errors.push({ kind, message, step, ...extra });
  const W = (kind, message, step) => warnings.push({ kind, message, step });
  const t0 = performance.now();
  let tl, tl2;
  try { tl = compile(fig, { params: run.params, scenario: run.scenario, rng: simRng, ...(run.env ? { env: run.env } : {}) }); }
  catch (e) { E("compile", `threw ${firstLines(e)}`); return { errors, warnings, ms: performance.now() - t0 }; }
  const ms = performance.now() - t0;
  try { tl2 = compile(fig, { params: run.params, scenario: run.scenario, rng: simRng, ...(run.env ? { env: run.env } : {}) }); }
  catch (e) { E("determinism", `the second compile threw ${firstLines(e)}`); }
  const steps = tl.steps ?? [];
  const cap = (i) => clip(plain(steps[i]?.caption ?? ""));
  const after = (i) => (i <= 0 ? "in the opening state" : `after step ${i - 1} "${cap(i - 1)}"`);
  if (tl2) {
    if (tl.hash === undefined) W("determinism", "the timeline has no hash; compared steps and counters only");
    const hashDiff = tl.hash !== undefined && tl.hash !== tl2.hash, stepDiff = fingerprint(tl) !== fingerprint(tl2);
    if (hashDiff || stepDiff) {
      const s2 = tl2.steps ?? [];
      const i = steps.findIndex((s, k) => !s2[k] || s.caption !== s2[k].caption || s.dur !== s2[k].dur);
      E("determinism", `two compiles differ${hashDiff ? ` (hash ${tl.hash} vs ${tl2.hash})` : ""}${i >= 0 ? `, first at step ${i}: "${cap(i)}" vs "${clip(plain(s2[i]?.caption ?? "(none)"))}"` : stepDiff ? " (counters differ)" : " (the script differs although the steps match)"}; something depends on Math.random, Date or iteration order`);
    }
  }
  // steps, captions, timing
  if (steps.length > MAX_STEPS) W("steps", `${steps.length} steps (> ${MAX_STEPS}): consider fewer, bigger beats or a smaller input`);
  if (steps.length < MIN_STEPS) W("steps", `only ${steps.length} step(s) (< ${MIN_STEPS})`);
  const noCaption = [];
  let prevT1 = 0;
  for (const [i, s] of steps.entries()) {
    if (!String(s.caption ?? "").trim()) noCaption.push(i);
    if (!(s.dur > 0) || !Number.isFinite(s.dur)) E("timing", `step ${i} "${cap(i)}" has duration ${s.dur}`, i);
    if (Math.abs(s.t0 - prevT1) > 1e-6) E("timing", `step ${i} starts at ${s.t0} s but step ${i - 1} ends at ${prevT1} s`, i);
    prevT1 = s.t1;
  }
  if (noCaption.length) E("caption", `${noCaption.length} step(s) without a caption: ${listSteps(noCaption)}${noCaption.length ? ` (first after "${cap(noCaption[0] - 1)}")` : ""}`, noCaption[0]);
  if (Math.abs((tl.duration ?? 0) - prevT1) > 1e-6) E("timing", `tl.duration ${tl.duration} s != end of last step ${prevT1} s`);
  // what a viewer sits through: runs of repeated steps play faster ("speed through repeats", engine/playback.mjs)
  let folds = null;
  try { folds = foldPlan(steps); } catch { /* malformed steps are reported above */ }
  for (const p of tl.phases ?? []) {
    const t1 = p.t1 ?? tl.duration, len = t1 - p.t0;
    if (len <= MAX_PHASE_S) continue;
    const wall = folds ? foldedDuration(folds, t1, p.t0) : len;
    if (wall > MAX_PHASE_S) W("pacing", `phase "${p.name}" lasts ${wall.toFixed(0)} s at 1x${wall < len - 0.5 ? ` with repeats sped up (${len.toFixed(0)} s unfolded)` : ""} (> ${MAX_PHASE_S} s; advisory): readers may lose the thread; consider trimming or splitting it`, p.step);
  }
  // scenarios[i].start names the chapter a scenario switch starts at (engine/playback.mjs forkOf)
  const scDef = (fig.scenarios ?? []).find((x) => x?.id === run.scenario);
  if (scDef?.start != null && !(tl.phases ?? []).some((p) => p.name === scDef.start)) W("scenario", `scenario "${scDef.id}" starts at chapter "${scDef.start}", but it has no such chapter (${(tl.phases ?? []).map((p) => `"${p.name}"`).join(", ")}); it will start at the automatic fork`);
  // build-time problems from the compiler; more than 3 of one kind collapse into one line
  const byKind = new Map();
  for (const p of tl.problems ?? []) {
    const msg = typeof p === "string" ? p : p.message ?? JSON.stringify(p);
    const kind = (typeof p === "object" && p.kind) || "problem";
    if (kind === "no-caption" && noCaption.length) continue;
    const step = typeof p === "object" ? p.step : undefined;
    const warn = typeof p === "object" && /^warn/.test(p.level ?? p.severity ?? "");
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push({ msg, step, warn });
  }
  for (const [kind, ps] of byKind) {
    const where = (st) => (st != null && steps[st] ? ` at step ${st} "${cap(st)}"` : "");
    const shown = ps.length > 3 ? ps.slice(0, 2) : ps;
    for (const p of shown) (p.warn ? W : E)(kind, `${p.msg}${where(p.step)}`, p.step);
    if (ps.length > 3) {
      const rest = ps.slice(2), stepsOf = [...new Set(rest.map((p) => p.step).filter((x) => x != null))];
      (rest.every((p) => p.warn) ? W : E)(kind, `${rest.length} more like these${stepsOf.length ? ` (steps ${listSteps(stepsOf)})` : ""}, e.g. ${rest[0].msg}`, rest[0].step);
    }
  }
  // invariants on every snapshot (snapshot(i) = state at the start of step i), and the final state
  const invs = Object.entries(fig.invariants ?? {}).filter(([, f]) => typeof f === "function");
  const fails = new Map();
  const used = new Set(), changed = new Set();
  for (let i = 0; i <= steps.length; i++) {
    let snap;
    try { snap = i < steps.length ? tl.snapshot(i) : tl.final; }
    catch (e) { E("snapshot", `tl.snapshot(${i}) threw ${firstLines(e)}`, i); break; }
    if (!snap) continue;
    for (const k of counterKeys(snap.counters)) { used.add(k); const v = counterGet(snap.counters, k); if (v !== 0 && v != null) changed.add(k); }
    for (const [name, f] of invs) {
      let r;
      try { r = f(snap, { step: i, final: i === steps.length, params: run.params, scenario: run.scenario, timeline: tl }); }
      catch (e) { r = `threw ${firstLines(e)}`; }
      if (r === true) continue;
      const msg = r === false ? "returned false" : r === undefined ? "returned undefined (return true when it holds, or a message)" : String(r);
      const f0 = fails.get(name);
      if (f0) f0.more++; else fails.set(name, { i, msg, more: 0 });
    }
  }
  for (const [name, { i, msg, more }] of fails) {
    const where = i === steps.length ? `at the end (after step ${i - 1} "${cap(i - 1)}")` : after(i);
    E("invariant", `"${name}" fails ${where}: ${msg}${more ? `  (+${more} more snapshot${more > 1 ? "s" : ""})` : ""}`, Math.max(0, i - 1));
  }
  const declared = Object.keys(fig.counters ?? {});
  const undeclared = [...used].filter((k) => !declared.includes(k));
  if (undeclared.length) E("counters", `counter(s) ${undeclared.map((k) => `"${k}"`).join(", ")} used by s.count/s.gauge but not declared in export const counters`);
  // sampler
  if (sample && typeof tl.sample === "function" && steps.length) {
    const view = { pxPerUnit: 1, hover: null, selected: null, reducedMotion: false };
    const bad = new Map();
    const note = (kind, i, msg) => { if (!bad.has(kind)) bad.set(kind, { i, msg, n: 0 }); bad.get(kind).n++; };
    for (const [i, s] of steps.entries()) {
      let f;
      try { f = tl.sample(s.t0 + s.dur / 2, view); } catch (e) { note("sample-throws", i, `sample() threw ${firstLines(e)}`); continue; }
      if (!f) { note("sample-empty", i, "sample() returned nothing"); continue; }
      for (const p of f.poses ?? []) {
        const k = POSE_NUMS.find((n) => p[n] !== undefined && p[n] !== null && !Number.isFinite(p[n]));
        if (k) { note("pose-nan", i, `pose "${p.id}" (${p.kind}) has ${k} = ${p[k]}`); break; }
        if (p.points?.some?.((q) => !Number.isFinite(q[0]) || !Number.isFinite(q[1]))) { note("pose-nan", i, `pose "${p.id}" (${p.kind}) has a non-finite point`); break; }
      }
      const fb = f.focus, wb = f.world;
      const ok = (b) => b && ["minX", "minY", "maxX", "maxY"].every((k) => Number.isFinite(b[k])) && b.maxX >= b.minX && b.maxY >= b.minY;
      if (!ok(fb)) note("focus", i, `frame.focus is ${fb ? "malformed " + JSON.stringify(fb) : "missing"} (the camera falls back to the world)`);
      else if (ok(wb) && (fb.minX < wb.minX - 1 || fb.maxX > wb.maxX + 1 || fb.minY < wb.minY - 1 || fb.maxY > wb.maxY + 1)) note("focus-outside-world", i, "frame.focus reaches outside frame.world (an engine matter: the world box should hold everything visible)");
      if (!ok(wb)) note("world", i, "frame.world is missing or malformed");
      for (const tg of f.tags ?? []) if (!tg.at || tg.at.some((v) => !Number.isFinite(v))) { note("tag-nan", i, `tag "${tg.text}" has a non-finite anchor`); break; }
    }
    for (const [kind, { i, msg, n }] of bad) {
      const text = `${msg} at step ${i} "${cap(i)}"${n > 1 ? `  (${n} steps)` : ""}`;
      (kind === "focus" || kind === "focus-outside-world" ? W : E)(kind, text, i);
    }
    // exact backward scrub: sample(a), sample(b > a), sample(a) again must agree
    try {
      const ser = (f) => JSON.stringify({ poses: f.poses, caption: f.caption, focus: f.focus, counters: f.counters, tags: f.tags });
      const d = tl.duration;
      for (const [a, b] of [[d * 0.3, d * 0.8], [d * 0.55, d * 0.95], [0, d]]) {
        const x = ser(tl.sample(a, view)); tl.sample(b, view); const y = ser(tl.sample(a, view));
        if (x !== y) { E("scrub", `sample(${a.toFixed(2)}) differs after sampling ${b.toFixed(2)} (backward scrub is not exact)`); break; }
      }
    } catch (e) { E("sample-throws", `scrub check threw ${firstLines(e)}`); }
  }
  return {
    errors, warnings, ms, steps: steps.length, duration: tl.duration, phases: (tl.phases ?? []).length, hash: tl.hash,
    counters: { used: [...used], changed: [...changed] },
  };
}

function firstLines(e) {
  const msg = `${e?.name ?? "Error"}: ${e?.message ?? e}`;
  const frame = String(e?.stack ?? "").split("\n").slice(1).find((l) => !/node:internal|verify\.mjs/.test(l));
  return frame ? `${msg} (${frame.trim().replace(/^at /, "").replace(/file:\/\//, "")})` : msg;
}
const listSteps = (xs) => (xs.length > 8 ? xs.slice(0, 8).join(", ") + ` … (${xs.length})` : xs.join(", "));

async function workerMain({ figure, compiler, quick, sample }) {
  const post = (m) => parentPort.postMessage(m);
  let fig, compile;
  await import("./lib/node-hooks.mjs");       // "@internals/<path>" imports resolve in Node too
  try { fig = await import(pathToFileURL(figure).href); }
  catch (e) { post({ type: "fatal", message: `the figure failed to import: ${firstLines(e)}` }); return; }
  try { ({ compile } = await import(pathToFileURL(compiler).href)); if (typeof compile !== "function") throw new Error("it does not export compile()"); }
  catch (e) { post({ type: "fatal", message: `the compiler ${showPath(compiler)} failed to load: ${firstLines(e)}` }); return; }
  post({ type: "static", result: staticChecks(fig, figure) });
  if (typeof fig.build !== "function") { post({ type: "done" }); return; }
  for (const run of planRuns(fig, quick)) {
    post({ type: "start", label: run.label });
    const r = verifyRun(fig, compile, run, sample);
    post({ type: "run", run: { label: run.label, scenario: run.scenario, changed: run.changed }, result: r });
  }
  post({ type: "done" });
}

if (!isMainThread && workerData?.verify) await workerMain(workerData);

// ------------------------------------------------------------------ main: runs the worker, prints the report

export function verify(figure, { compiler, quick = false, sample = true, timeout = 20, onEvent } = {}) {
  const file = resolve(figure);
  compiler = resolve(compiler ?? DEFAULT_COMPILER);
  return new Promise((ok) => {
    const out = { figure: file, compiler, static: null, runs: [], fatal: null, timedOut: null, timeout, ms: 0 };
    if (!existsSync(file)) { out.fatal = `figure not found: ${figure}`; return ok(out); }
    if (!existsSync(compiler)) { out.fatal = compiler === DEFAULT_COMPILER ? "engine/scene/index.mjs does not exist yet; pass --compiler <file>" : `compiler not found: ${compiler}`; return ok(out); }
    const t0 = performance.now();
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { verify: true, figure: file, compiler, quick, sample } });
    let current = "loading the figure", timer;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { out.timedOut = current; w.terminate(); }, timeout * 1000); };
    arm();
    w.on("message", (m) => {
      arm();
      if (m.type === "static") out.static = m.result;
      else if (m.type === "start") current = m.label;
      else if (m.type === "run") out.runs.push({ ...m.run, ...m.result });
      else if (m.type === "fatal") out.fatal = m.message;
      onEvent?.(m);
      if (m.type === "done" || m.type === "fatal") w.terminate();
    });
    w.on("error", (e) => { out.fatal = `verify crashed: ${firstLines(e)}`; });
    w.on("exit", () => { clearTimeout(timer); out.ms = performance.now() - t0; ok(out); });
  });
}

export function report(r) {
  const lines = [`verify ${showPath(r.figure)}  (compiler ${showPath(r.compiler)})`];
  if (r.fatal) { lines.push(`  FAIL  ${r.fatal}`); return { text: lines.join("\n"), errors: 1, warnings: 0 }; }
  let errors = 0, warnings = 0;
  if (r.static) {
    const { errors: e, warnings: w } = r.static;
    errors += e.length; warnings += w.length;
    lines.push(`  ${e.length ? "FAIL" : w.length ? "WARN" : "ok  "}  exports${e.length + w.length ? "" : "  meta, params, scenarios, counters, invariants, build"}`);
    for (const x of e) lines.push(`        error  ${x.message}`);
    for (const x of w) lines.push(`        warn   ${x.message}`);
  }
  const width = Math.min(34, Math.max(12, ...r.runs.map((x) => x.label.length)));
  const shown = new Set();     // an identical finding in a later run is counted, not repeated
  for (const run of r.runs) {
    errors += run.errors.length; warnings += run.warnings.length;
    const status = run.errors.length ? "FAIL" : run.warnings.length ? "WARN" : "ok  ";
    const facts = run.steps != null ? `${String(run.steps).padStart(4)} steps ${run.duration.toFixed(1).padStart(6)} s ${String(run.phases).padStart(2)} phases ${run.ms.toFixed(0).padStart(4)} ms` : "";
    const fresh = [...run.errors.map((x) => ["error", x]), ...run.warnings.map((x) => ["warn ", x])].filter(([, x]) => !shown.has(x.kind + x.message));
    const repeats = run.errors.length + run.warnings.length - fresh.length;
    lines.push(`  ${status}  ${run.label.padEnd(width)}  ${facts}${repeats ? `  (+${repeats} as above)` : ""}`);
    for (const [level, x] of fresh) { shown.add(x.kind + x.message); lines.push(`        ${level}  ${x.kind}: ${x.message}`); }
  }
  // counters declared but never moved in any run
  const changed = new Set(r.runs.flatMap((x) => x.counters?.changed ?? []));
  if (r.runs.length) for (const k of r.static?.declared ?? []) if (!changed.has(k)) { warnings++; lines.push(`  WARN  counter "${k}" is declared but never changes in any run`); }
  if (r.timedOut) { errors++; lines.push(`  FAIL  ${r.timedOut.padEnd(width)}  no result within ${r.timeout} s: an infinite loop in build() (or in the compiler)? Later runs were not checked.`); }
  lines.push(`summary  ${r.runs.length} run(s), ${r.runs.filter((x) => x.errors.length).length} failing, ${errors} error(s), ${warnings} warning(s)  ${(r.ms / 1000).toFixed(1)} s`);
  return { text: lines.join("\n"), errors, warnings };
}

if (isMainThread && isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { compiler: "string", quick: "boolean", sample: "boolean", timeout: "number", json: "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  const r = await verify(a._[0], { compiler: a.compiler, quick: a.quick, sample: a.sample !== false, timeout: a.timeout ?? 20 });
  const rep = report(r);
  console.log(a.json ? JSON.stringify({ ...r, errors: rep.errors, warnings: rep.warnings }, null, 2) : rep.text);
  process.exit(rep.errors ? 1 : 0);
}
