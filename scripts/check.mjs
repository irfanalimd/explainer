#!/usr/bin/env node
// The golden path in one command: is this figure ready to ship? Verify (every scenario, knob extreme, branch and the
// lesson), the teaching lint, build the page, shoot it (audit included) and write a report: a scorecard the owner can
// glance at, beside the figure, in HTML and Markdown.
//   node scripts/check.mjs <figure.mjs> [--full] [--out dir] [--no-shots] [--json]
// Tiers:
//   quick (default, the authoring loop): verify, build, then every chapter of every scenario in the page's own theme
//     at 1440x900 and 390x844, with the runtime's audit on each shot and a contact sheet.
//   --full (before shipping): the same plus both themes, every teaching card (shoot --teach: predictions, picks, the
//     end check and the end card) and audit.mjs over every step at both sizes.
// Writes <figure dir>/check/: report.html, report.md, check.json, shots/ (with contact.png). The page itself goes where
// build.mjs puts it (<figure dir>/<title-slug>.html). Progress lines go to stderr. Exit 1 when anything fails.
import "./lib/websocket.mjs";                // Node 20/21: re-run with --experimental-websocket
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, isMain, showPath, fmtBytes } from "./lib/args.mjs";
import { renderReport, renderMarkdown } from "./lib/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");
const USAGE = `
usage: node scripts/check.mjs <figure.mjs> [options]
  --full        ship tier: both themes, every teaching card (shoot --teach) and audit over every step
                (default: quick, the page's theme at 1440x900 and 390x844, one frame per chapter half)
  --out <dir>   where the report goes (default: <figure dir>/check)
  --no-shots    verify and build only (no Chrome)
  --json        print check.json instead of the summary
Writes report.html, report.md, check.json and shots/ (contact.png included). Exit 1 when anything fails.
`;

export async function check(figure, o = {}) {
  const file = resolve(figure);
  if (!existsSync(file)) throw new Error(`figure not found: ${figure}`);
  const tier = o.full ? "full" : "quick";
  const out = resolve(o.out ?? join(dirname(file), "check"));
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  const say = (m) => o.progress?.(m, Date.now() - t0);
  const steps = [];   // what ran, how long it took
  const timed = async (name, fn) => { const s = Date.now(); try { return await fn(); } finally { steps.push({ name, ms: Date.now() - s }); } };
  const res = { figure: file, tier, out, when: new Date().toISOString(), steps };

  // 1. verify: the truth, the lesson file and the teaching lint
  say("verify   every scenario, knob extreme and branch, the lesson and its words");
  const { verify, report: verifyReport } = await import("./verify.mjs");
  const v = await timed("verify", () => verify(file, {}));
  const vr = verifyReport(v);
  res.verify = summarizeVerify(v, vr);
  say(`verify   ${res.verify.runs} runs, ${res.verify.failing} failing, ${vr.errors} error(s), ${vr.warnings} warning(s)`);

  // 2. the stories as a viewer sits through them (pacing), straight from the compiled runs
  if (!v.fatal) res.stories = await timed("stories", () => storiesOf(file)).catch((e) => ({ error: e.message }));

  // 3. build the shippable page
  if (!v.fatal) {
    say("build    one self-contained page");
    const { buildPage } = await import("./build.mjs");
    try {
      const b = await timed("build", () => buildPage(file, {}));
      res.build = { out: b.out, theme: b.theme, ...b.stats, warnings: b.warnings, title: b.meta?.title ?? "", subtitle: b.meta?.subtitle ?? "" };
      say(`build    ${showPath(b.out)}  ${fmtBytes(b.stats.bytes)}`);
    } catch (e) { res.build = { error: e.message }; say(`build    FAIL ${e.message.split("\n")[0]}`); }
  }

  // 4. shots (the runtime's audit runs on each), and on --full every teaching card and audit over every step
  if (o.shots !== false && res.build?.out) {
    const { CHROME } = await import("./lib/cdp.mjs");
    if (!CHROME) res.shoot = { skipped: "Chrome not found: run node scripts/doctor.mjs" };
    else {
      const { shoot } = await import("./shoot.mjs");
      const theme = res.build.theme ?? (await themeOf(file));
      const themes = tier === "full" ? ["dark", "light"] : [theme];
      say(`shoot    ${tier === "full" ? "every chapter and teaching card, both themes" : `every chapter, ${theme} theme`}, 1440x900 and 390x844${tier === "full" ? " (long: minutes)" : ""}`);
      const shotsDir = join(out, "shots");
      try {
        const r = await timed("shoot", () => shoot(res.build.out, { out: shotsDir, clean: true, themes, teach: tier === "full",
          progress: (m) => say(`shoot    ${m}`) }));
        res.shoot = { dir: shotsDir, shots: r.shots, sheets: r.sheets, problems: r.problems, errors: r.errors, themes };
        const distinct = new Set(r.problems.filter((p) => p.level !== "warn").map((p) => p.kind + p.message)).size;
        say(`shoot    ${r.shots.length} shots, ${distinct} audit finding(s)${r.problems.length ? ` (in ${new Set(r.problems.map((p) => p.shot)).size} shots)` : ""}, ${r.errors.length} page error(s)`);
      } catch (e) { res.shoot = { error: e.message }; say(`shoot    FAIL ${e.message.split("\n")[0]}`); }
      if (tier === "full") {
        say("audit    every step, mid and end, at 1440x900 and 390x844");
        const { audit } = await import("./audit.mjs");
        try { res.audit = await timed("audit", () => audit(res.build.out, {})); say(`audit    ${res.audit.problems.length} finding(s), ${res.audit.errors.length} page error(s)`); }
        catch (e) { res.audit = { error: e.message }; }
      }
    }
  }

  // 5. the blind reviews, when the teacher pipeline has run (review/round-N/scores.json)
  res.review = reviewsOf(dirname(file));

  res.verdict = verdictOf(res);
  res.ms = Date.now() - t0;
  writeFileSync(join(out, "check.json"), JSON.stringify(res, (k, x) => (x instanceof Set ? [...x] : x), 2) + "\n");
  writeFileSync(join(out, "report.md"), renderMarkdown(res, { relTo: out }));
  writeFileSync(join(out, "report.html"), await renderReport(res, { relTo: out }));
  say(`report   ${showPath(join(out, "report.html"))}`);
  return res;
}

function summarizeVerify(v, vr) {
  const runs = v.runs ?? [];
  const list = (xs) => xs.map((x) => ({ kind: x.kind, message: x.message }));
  const group = (pick) => {
    const m = new Map();
    for (const run of runs) for (const x of pick(run)) { const k = `${x.kind}|${x.message}`; if (!m.has(k)) m.set(k, { kind: x.kind, message: x.message, runs: [] }); m.get(k).runs.push(run.label); }
    return [...m.values()];
  };
  return {
    fatal: v.fatal ?? null, timedOut: v.timedOut ?? null, runs: runs.length,
    failing: runs.filter((x) => x.errors.length).length + (v.teaching?.errors.length ? 1 : 0) + (v.static?.errors.length ? 1 : 0) + (v.timedOut ? 1 : 0),
    errors: vr.errors, warnings: vr.warnings, ms: v.ms,
    branches: runs.reduce((a, x) => a + (x.branches ?? 0), 0),
    exports: v.static ? { errors: list(v.static.errors), warnings: list(v.static.warnings) } : null,
    runErrors: group((r) => r.errors), runWarnings: group((r) => r.warnings),
    lesson: v.lesson ? { info: v.lesson.info, warnings: list(v.lesson.warnings), notes: list(v.lesson.notes) } : null,
    teaching: v.teaching ? { info: v.teaching.info, errors: v.teaching.errors.map((x) => ({ rule: x.rule, message: x.message })), warnings: v.teaching.warnings.map((x) => ({ rule: x.rule, message: x.message })) } : null,
    text: vr.text,
  };
}

/** Each scenario as a viewer meets it: steps, chapters and their length at 1x with repeats sped up, questions, picks. */
async function storiesOf(file) {
  const { loadFigure } = await import("./lib/lesson-load.mjs");
  const { compile } = await import(pathToFileURL(join(skillRoot, "engine", "scene", "index.mjs")).href);
  const { foldPlan, foldedDuration, forkOf } = await import("../engine/playback.mjs");
  const { rng } = await import("../sim/rng.mjs");
  const fig = await loadFigure(file);
  const scen = fig.scenarios?.length ? fig.scenarios : [{ id: undefined, label: "default" }];
  let base = null;
  return scen.map((s, k) => {
    const tl = compile(fig, { scenario: s.id, rng });
    if (!k) base = tl;
    const plan = foldPlan(tl.steps ?? []);
    const chapters = (tl.phases ?? []).map((p, i) => {
      const t1 = p.t1 ?? tl.phases[i + 1]?.t0 ?? tl.duration;
      const next = tl.phases[i + 1]?.step ?? tl.steps.length;
      return { name: p.name, steps: next - p.step, run: t1 - p.t0, watch: foldedDuration(plan, t1, p.t0) };
    });
    let fork = null;
    if (k) try { fork = forkOf(base, tl, { start: s.start }); } catch {}
    return {
      id: s.id ?? "default", label: s.label ?? s.id ?? "default", steps: tl.steps.length, run: tl.duration,
      watch: foldedDuration(plan, tl.duration, 0), chapters,
      asks: tl.steps.filter((x) => x.ask).length, picks: tl.steps.filter((x) => x.choose).length, checks: (tl.checks ?? []).length,
      key: tl.steps.filter((x) => x.layers?.key).length, fork: fork ? { step: fork.step, watch: foldedDuration(plan, tl.duration, fork.t) } : null,
    };
  });
}

async function themeOf(file) {
  try { const m = await import(pathToFileURL(file).href); return m.meta?.theme === "dark" ? "dark" : "light"; } catch { return "light"; }
}

/** The latest blind-review round beside the figure: scores per chapter, the gate, open findings. */
function reviewsOf(dir) {
  const rdir = join(dir, "review");
  if (!existsSync(rdir)) return null;
  const rounds = readdirSync(rdir).map((d) => /^round-(\d+)$/.exec(d)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  const read = (f) => { try { const t = readFileSync(f, "utf8"); const m = /```json\s*([\s\S]*?)```/.exec(t); return JSON.parse(m ? m[1] : t); } catch { return null; } };
  const state = read(join(rdir, "state.json"));
  const history = rounds.map((n) => {
    const s = read(join(rdir, `round-${n}`, "scores.json"));
    if (!s) return { round: n, scores: null };
    const novice = (s.novice ?? []).map((p) => ({ persona: p.persona, chapters: (p.chapters ?? []).map((c) => ({ chapter: c.chapter, score: c.score, why: c.why })) }));
    const all = novice.flatMap((p) => p.chapters.map((c) => c.score)).filter(Number.isFinite);
    return { round: n, novice, min: all.length ? Math.min(...all) : null, open: s.expert?.open ?? [], nuance: !!s.expert?.nuance, pass: !!s.gate?.pass, reasons: s.gate?.reasons ?? [] };
  });
  return { mode: state?.mode ?? null, stage: state?.stage ?? null, rounds: history, last: history.filter((h) => h.scores !== null).at(-1) ?? null };
}

export function verdictOf(r) {
  const problems = [];
  if (r.verify.fatal) problems.push(`verify could not run: ${r.verify.fatal}`);
  if (r.verify.timedOut) problems.push(`verify timed out in ${r.verify.timedOut}`);
  if (r.verify.failing) problems.push(`verify: ${r.verify.failing} failing`);
  if (r.build?.error) problems.push(`build: ${r.build.error.split("\n")[0]}`);
  if (r.shoot?.error) problems.push(`shoot: ${r.shoot.error.split("\n")[0]}`);
  const hard = (ps) => (ps ?? []).filter((p) => p.level !== "warn");
  // each distinct audit finding once, with the steps and sizes it was seen at
  const audit = (ps, where) => {
    const by = new Map();
    for (const p of hard(ps)) {
      const k = `${p.kind}: ${p.message}`;
      if (!by.has(k)) by.set(k, { steps: new Set(), sizes: new Set() });
      if (p.step != null) by.get(k).steps.add(p.step);
      const sz = /(\d+x\d+)/.exec(p.shot ?? p.where ?? "")?.[1]; if (sz) by.get(k).sizes.add(sz);
    }
    for (const [k, x] of by) problems.push(`audit${where}: ${k}${x.steps.size ? ` (step${x.steps.size > 1 ? "s" : ""} ${[...x.steps].sort((a, b) => a - b).join(", ")}` : " ("}${x.sizes.size ? `${x.steps.size ? ", " : ""}at ${[...x.sizes].join(" and ")}` : ""})`.replace(" ()", ""));
  };
  audit(r.shoot?.problems, "");
  if (r.shoot?.errors?.length) problems.push(`page errors: ${r.shoot.errors.length}, first: ${String(r.shoot.errors[0].text).split("\n")[0]}`);
  audit(r.audit?.problems, " over every step");
  if (r.audit?.errors?.length) problems.push(`audit page errors: ${r.audit.errors.length}, first: ${String(r.audit.errors[0].text).split("\n")[0]}`);
  if (r.review?.last && !r.review.last.pass) problems.push(`review: round ${r.review.last.round} did not pass the gate`);
  const ok = !problems.length;
  const label = !ok ? "Needs work" : r.tier === "full" ? (r.review?.last ? "Ready to ship" : "Ready for review") : "Passes the quick check";
  const next = !ok ? "Fix the first problem below, then run check again."
    : r.tier !== "full" ? "Run check --full before you ship: both themes, every teaching card and audit over every step."
    : !r.review?.last ? "Run the blind review (SKILL.md, Teacher pipeline) for scores, then check --full again." : "Ship the page.";
  return { ok, label, problems, next };
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { full: "boolean", out: "string", shots: "boolean", json: "boolean", quick: "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  const clock = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
  try {
    const r = await check(a._[0], { full: a.full && !a.quick, out: a.out, shots: a.shots, progress: (m, ms) => console.error(`[${clock(ms)}] ${m}`) });
    if (a.json) console.log(JSON.stringify(r, null, 2));
    else {
      if (r.verify.failing || r.verify.fatal) console.log(r.verify.text);
      console.log(`check   ${r.verdict.label}  (${r.tier}, ${clock(r.ms)})`);
      for (const p of r.verdict.problems) console.log(`  FAIL  ${p}`);
      console.log(`  next  ${r.verdict.next}`);
      console.log(`report  ${showPath(join(r.out, "report.html"))}  (and report.md)`);
    }
    process.exit(r.verdict.ok ? 0 : 1);
  } catch (e) {
    console.error(`error  ${e.message}`);
    process.exit(1);
  }
}
