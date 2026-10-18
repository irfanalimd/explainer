// The check report (scripts/check.mjs): one figure's scorecard, as a self-contained HTML page (fonts and thumbnails
// inlined, light and dark, no network) and as Markdown beside it. Monochrome, typography-led, colour only for status,
// in the HUD's own tokens (engine/tokens.mjs UI and PALETTE), so it reads as part of the same product.
import { readFileSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { UI, PALETTE } from "../../engine/tokens.mjs";
import { GRADE } from "./teach.mjs";
import { showPath } from "./args.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUDGET = 2.5 * 1024 * 1024;   // docs/next/PLAN.md §7: a page is at most 2.5 MB
const MAX_PHASE_S = 150;            // verify's pacing advice: a chapter longer than this to watch at 1x
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const plain = (m = "") => String(m).replace(/\{(?:key|ref|tone|term|count):([^}|]+)(?:\|([^}]+))?\}/g, (_, a, b) => b ?? a).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
const secs = (s) => (s == null ? "—" : s < 90 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`);
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const plural = (n, w, ws = w + "s") => `${n} ${n === 1 ? w : ws}`;

/** The scorecard rows both formats share: { key, label, status, value, detail[] }. */
export function scorecard(r) {
  const V = r.verify, T = V.teaching, S = r.shoot, A = r.audit, R = r.review?.last;
  const cards = [];
  // correct: the run, every knob extreme and branch, invariants on every step
  cards.push({
    key: "correct", label: "Correct", status: V.fatal || V.timedOut || V.failing ? "fail" : V.warnings ? "warn" : "ok",
    value: V.fatal ? "could not run" : `${V.failing} failing`,
    detail: [`${plural(V.runs, "run")} and ${plural(V.branches, "branch run")} checked: invariants on every step, determinism, timing, captions`,
      `${plural(V.errors, "error")}, ${plural(V.warnings, "warning")}`],
  });
  // teaches: the lint, the reading grade against the level's ceiling
  if (T) {
    const lim = GRADE[T.info.level] ?? GRADE.core;
    cards.push({
      key: "teaches", label: "Teaches", status: T.errors.length ? "fail" : T.warnings.length ? "warn" : "ok",
      value: T.info.grade != null ? `grade ${T.info.grade}` : "—",
      detail: [`reading grade ${T.info.grade ?? "?"} (at most ${lim} for a ${T.info.level ?? "core"} lesson)`,
        `${plural(T.info.chapters ?? 0, "chapter")}, ${plural(T.info.asks ?? 0, "question")}, ${plural(T.info.terms ?? 0, "defined word")}, ${(T.info.words ?? 0).toLocaleString("en-US")} words`,
        T.errors.length + T.warnings.length ? `${plural(T.errors.length, "error")}, ${plural(T.warnings.length, "piece")} of advice` : "no teaching advice"],
    });
  }
  // looks right: the runtime's audit on every shot, page errors, and on --full audit.mjs over every step
  if (S && !S.skipped && !S.error) {
    const hard = (ps) => (ps ?? []).filter((p) => p.level !== "warn");
    const distinct = new Set([...hard(S.problems), ...hard(A?.problems)].map((p) => p.kind + p.message)).size;
    const errs = S.errors.length + (A?.errors?.length ?? 0);
    const cards2 = S.shots.filter((s) => !["mid", "end"].includes(s.tag)).length;
    cards.push({
      key: "looks", label: "Looks right", status: distinct || errs ? "fail" : "ok", value: `${plural(distinct, "finding")}`,
      detail: [`${plural(S.shots.length, "shot")} (${S.themes.join(" and ")}, 1440×900 and 390×844)${cards2 ? `, ${plural(cards2, "teaching card")}` : ""}`,
        A ? `audit over every step: ${plural(A.runs?.reduce((a, x) => a + x.frames, 0) ?? 0, "frame")}` : "audit on each shot (check --full audits every step)",
        `${plural(errs, "page error")}`],
    });
  } else cards.push({ key: "looks", label: "Looks right", status: "skip", value: "not shot", detail: [S?.skipped ?? S?.error ?? "no shots (--no-shots)"] });
  // pacing: what a viewer sits through
  if (Array.isArray(r.stories) && r.stories.length) {
    const first = r.stories[0], longest = r.stories.flatMap((s) => s.chapters.map((c) => ({ ...c, story: s.label }))).sort((a, b) => b.watch - a.watch)[0];
    cards.push({
      key: "pacing", label: "Pacing", status: longest && longest.watch > MAX_PHASE_S ? "warn" : "ok", value: secs(first.watch),
      detail: [`"${first.label}" takes ${secs(first.watch)} to watch at 1x (repeats sped up), ${plural(first.steps, "step")}`,
        longest ? `longest chapter: ${longest.name} in "${longest.story}", ${secs(longest.watch)} (advice above ${MAX_PHASE_S} s)` : ""].filter(Boolean),
    });
  }
  // ships: one file, under the budget
  if (r.build && !r.build.error) cards.push({
    key: "size", label: "One file", status: r.build.bytes > BUDGET ? "warn" : "ok", value: mb(r.build.bytes),
    detail: [`${Math.round((r.build.bytes / BUDGET) * 100)}% of the 2.5 MB budget: ${plural(r.build.modules, "module")}, fonts and CSS inlined`, "works offline, from file://"],
  });
  // reviewed: the blind readers' scores
  cards.push(R ? {
    key: "review", label: "Reviewed", status: R.pass ? "ok" : "fail", value: R.min != null ? `${R.min} / 5` : "—",
    detail: [`round ${R.round}: lowest novice chapter score ${R.min ?? "?"}, ${plural(R.open.length, "open wrong or misleading finding")}`,
      `${R.pass ? "passes the gate" : `gate not passed${R.reasons.length ? `: ${R.reasons[0]}` : ""}`}${r.review.mode ? ` · ${r.review.mode}` : ""}`],
  } : { key: "review", label: "Reviewed", status: "skip", value: "not yet", detail: ["no review/round-N/scores.json beside the figure", "the teacher pipeline in SKILL.md writes it"] });
  return cards;
}

/** Every finding, grouped by where it comes from: { title, items: [{ level, text, where }] }. */
export function findings(r) {
  const V = r.verify, out = [];
  const g = (title, items) => { if (items.length) out.push({ title, items }); };
  g("Verify", [
    ...(V.fatal ? [{ level: "fail", text: V.fatal }] : []),
    ...(V.timedOut ? [{ level: "fail", text: `no result in ${V.timedOut}: an infinite loop in build()?` }] : []),
    ...(V.exports?.errors ?? []).map((x) => ({ level: "fail", text: x.message, where: "exports" })),
    ...(V.exports?.warnings ?? []).map((x) => ({ level: "warn", text: x.message, where: "exports" })),
    ...V.runErrors.map((x) => ({ level: "fail", text: `${x.kind}: ${x.message}`, where: runsWhere(x.runs) })),
    ...V.runWarnings.map((x) => ({ level: "warn", text: `${x.kind}: ${x.message}`, where: runsWhere(x.runs) })),
  ]);
  g("Lesson file", [
    ...(V.lesson?.warnings ?? []).map((x) => ({ level: "warn", text: x.message })),
    ...(V.lesson?.notes ?? []).map((x) => ({ level: "note", text: x.message })),
  ]);
  g("Teaching", [
    ...(V.teaching?.errors ?? []).map((x) => ({ level: "fail", text: x.message, where: x.rule })),
    ...(V.teaching?.warnings ?? []).map((x) => ({ level: "warn", text: x.message, where: x.rule })),
  ]);
  const audit = [...(r.shoot?.problems ?? []), ...(r.audit?.problems ?? [])];
  const by = new Map();
  for (const p of audit) { const k = `${p.kind}|${p.message}`; if (!by.has(k)) by.set(k, { ...p, steps: new Set(), where: new Set() }); const x = by.get(k); if (p.step != null) x.steps.add(p.step); x.where.add(p.shot ?? p.where); }
  g("Audit", [...by.values()].map((x) => ({ level: x.level === "warn" ? "warn" : "fail", text: `${x.kind}: ${x.message}${x.steps.size ? ` (steps ${[...x.steps].sort((a, b) => a - b).join(", ")})` : ""}`, where: [...x.where].slice(0, 3).join(", ") + (x.where.size > 3 ? ` +${x.where.size - 3}` : "") })));
  const errs = [...(r.shoot?.errors ?? []), ...(r.audit?.errors ?? [])];
  const be = new Map();
  for (const e of errs) { const k = e.type + e.text; if (!be.has(k)) be.set(k, { ...e, n: 0 }); be.get(k).n++; }
  g("Page errors", [...be.values()].map((e) => ({ level: "fail", text: `[${e.type}] ${String(e.text).split("\n")[0]}`, where: `${e.n}×, first at ${e.shot ?? e.where}` })));
  return out;
}
const runsWhere = (runs) => (runs.length > 3 ? `${runs.slice(0, 2).join(", ")} +${runs.length - 2} runs` : runs.join(", "));

// ------------------------------------------------------------------ Markdown

export function renderMarkdown(r, { relTo }) {
  const L = [];
  const title = r.build?.title || "Figure";
  L.push(`# ${title}: check report`, "");
  L.push(`**${r.verdict.label}.** ${r.verdict.next}`, "");
  for (const p of r.verdict.problems) L.push(`- ${p}`);
  if (r.verdict.problems.length) L.push("");
  L.push(`\`${relative(relTo, r.figure)}\` · ${r.tier} check · ${r.when.slice(0, 16).replace("T", " ")} UTC · ${secs(r.ms / 1000)}`, "");
  L.push("| | | |", "|---|---|---|");
  for (const c of scorecard(r)) L.push(`| ${mark(c.status)} **${c.label}** | ${c.value} | ${c.detail.join("; ")} |`);
  L.push("");
  if (Array.isArray(r.stories)) {
    L.push("## Stories", "", "| Story | Steps | To watch | Chapters (time to watch each) | Questions | Picks |", "|---|---|---|---|---|---|");
    for (const s of r.stories) L.push(`| ${s.label} | ${s.steps} | ${secs(s.watch)}${s.fork ? ` (${secs(s.fork.watch)} from where it splits off)` : ""} | ${s.chapters.map((c) => `${c.name} ${secs(c.watch)}`).join(" · ")} | ${s.asks} | ${s.picks} |`);
    L.push("");
  }
  const sheets = r.shoot?.sheets ?? [];
  if (sheets.length) { L.push("## Contact sheet", ""); for (const s of sheets) L.push(`![](${relative(relTo, s)})`); L.push(""); }
  for (const f of findings(r)) {
    L.push(`## ${f.title}`, "");
    for (const x of f.items) L.push(`- ${mark(x.level)} ${x.text}${x.where ? ` _(${x.where})_` : ""}`);
    L.push("");
  }
  if (r.review?.rounds?.length) {
    L.push("## Reviews", "");
    for (const h of r.review.rounds) L.push(`- round ${h.round}: ${h.scores === null ? "no scores" : `lowest ${h.min}, ${h.open.length} open, ${h.pass ? "passed" : "not passed"}`}`);
    L.push("");
  }
  L.push("## Steps", "", ...r.steps.map((s) => `- ${s.name}: ${secs(s.ms / 1000)}`), "");
  L.push("Re-run: `node scripts/check.mjs " + showPath(r.figure) + (r.tier === "full" ? " --full" : "") + "`", "");
  return L.join("\n");
}
const mark = (s) => ({ ok: "✓", warn: "!", fail: "✗", skip: "–", note: "·" })[s] ?? "·";

// ------------------------------------------------------------------ HTML

/** The report page. Thumbnails of the shots are inlined as JPEG (made in headless Chrome when it is there). */
export async function renderReport(r, { relTo, thumbs = true } = {}) {
  const cards = scorecard(r), groups = findings(r);
  const shots = r.shoot?.shots ?? [];
  const pics = thumbs && shots.length ? await thumbnails(shots.map((s) => join(r.shoot.dir, s.file))) : new Map();
  const title = r.build?.title || "Figure";
  const font = (f) => existsSync(f) ? `url(data:font/woff2;base64,${readFileSync(f).toString("base64")}) format("woff2")` : "local(sans-serif)";
  const css = themeCss();
  const status = (s) => `<span class="dot s-${s}" aria-hidden="true"></span>`;
  const word = (s) => ({ ok: "Pass", warn: "Advice", fail: "Fails", skip: "Not run" })[s] ?? s;

  const storyRows = Array.isArray(r.stories) ? r.stories.map((s) => {
    const total = s.chapters.reduce((a, c) => a + c.watch, 0) || 1;
    const bar = s.chapters.map((c, i) => `<span class="seg${c.watch > MAX_PHASE_S ? " long" : ""}" style="flex:${(c.watch / total).toFixed(4)}" title="${esc(c.name)}: ${secs(c.watch)} to watch, ${plural(c.steps, "step")}"><b>${esc(c.name)}</b><i>${secs(c.watch)}</i></span>`).join("");
    return `<tr><th scope="row">${esc(s.label)}<small>${esc(s.id)}</small></th><td class="num">${s.steps}</td><td class="num">${secs(s.watch)}${s.fork ? `<small>${secs(s.fork.watch)} from the split</small>` : ""}</td><td class="bar"><div class="segs">${bar}</div></td><td class="num">${s.asks}${s.picks ? ` + ${s.picks}` : ""}</td></tr>`;
  }).join("") : "";

  // shots, grouped as the contact sheet groups them
  const byGroup = new Map();
  for (const s of shots) { const k = `${s.scenario} · ${s.theme} · ${s.size.width}×${s.size.height}`; if (!byGroup.has(k)) byGroup.set(k, []); byGroup.get(k).push(s); }
  const shotHtml = [...byGroup].map(([k, list]) => `<section class="shots"><h3>${esc(k)}</h3><div class="grid${list[0].size.width < list[0].size.height ? " tall" : ""}">${list.map((s) => {
    const src = pics.get(join(r.shoot.dir, s.file));
    const href = esc(relative(relTo, join(r.shoot.dir, s.file)));
    return `<figure><a href="${href}">${src ? `<img src="${src}" alt="${esc(`${s.scenario}, step ${s.step} ${s.tag}: ${plain(s.caption)}`)}" loading="lazy">` : `<span class="noimg">${esc(s.file)}</span>`}</a><figcaption><b>${String(s.step).padStart(3, "0")} ${esc(s.tag)}</b> ${esc(plain(s.caption)).slice(0, 90)}</figcaption></figure>`;
  }).join("")}</div></section>`).join("");

  const findingHtml = groups.length ? groups.map((g) => `<section class="finds"><h3>${esc(g.title)} <span class="count">${g.items.length}</span></h3><ul>${g.items.map((x) => `<li class="f-${x.level}">${status(x.level === "note" ? "skip" : x.level)}<span>${esc(x.text)}${x.where ? `<small>${esc(x.where)}</small>` : ""}</span></li>`).join("")}</ul></section>`).join("")
    : `<p class="quiet">Nothing to report: no errors, warnings, audit findings or page errors.</p>`;

  const rev = r.review?.last;
  const reviewHtml = rev ? `<table class="rev"><thead><tr><th>Reader</th>${(rev.novice[0]?.chapters ?? []).map((c) => `<th class="num">Ch ${esc(c.chapter)}</th>`).join("")}</tr></thead><tbody>${rev.novice.map((p) => `<tr><th scope="row">${esc(p.persona)}</th>${p.chapters.map((c) => `<td class="num${c.score < 4 ? " low" : ""}" title="${esc(c.why ?? "")}">${esc(c.score)}</td>`).join("")}</tr>`).join("")}</tbody></table><p class="quiet">Round ${rev.round}${r.review.mode ? `, ${esc(r.review.mode)}` : ""}. Expert: ${plural(rev.open.length, "open finding")}${rev.nuance ? ", at least one nuance learned" : ""}. ${rev.pass ? "Passes the gate." : "Does not pass the gate."}</p>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · check</title>
<style>
@font-face{font-family:"Geist";src:${font(join(skillRoot, "assets/fonts/Geist-latin.woff2"))};font-weight:100 900}
@font-face{font-family:"Geist Mono";src:${font(join(skillRoot, "assets/fonts/GeistMono-latin.woff2"))};font-weight:100 900}
${css}
</style></head>
<body><main>
<header>
  <p class="kicker">Explainer · check report</p>
  <h1>${esc(title)}</h1>
  ${r.build?.subtitle ? `<p class="sub">${esc(r.build.subtitle)}</p>` : ""}
  <p class="meta"><code>${esc(relative(dirname(relTo), r.figure))}</code><span>${esc(r.tier)} check</span><span>${esc(r.when.slice(0, 16).replace("T", " "))} UTC</span><span>${secs(r.ms / 1000)}</span></p>
</header>
<section class="verdict v-${r.verdict.ok ? "ok" : "fail"}">
  ${status(r.verdict.ok ? "ok" : "fail")}<div><h2>${esc(r.verdict.label)}</h2><p>${esc(r.verdict.next)}</p>${r.verdict.problems.length ? `<ul>${r.verdict.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}</div>
</section>
<section class="cards">${cards.map((c) => `<article class="card c-${c.status}"><header>${status(c.status)}<h3>${esc(c.label)}</h3><span class="word">${word(c.status)}</span></header><p class="big">${esc(c.value)}</p>${c.detail.map((d) => `<p class="d">${esc(d)}</p>`).join("")}</article>`).join("")}</section>
${storyRows ? `<section><h2>Stories</h2><p class="quiet">Time to watch each at 1x, with repeated steps sped up as the page plays them. Questions + picks the reader answers.</p>
<table class="stories"><thead><tr><th>Story</th><th class="num">Steps</th><th class="num">To watch</th><th>Chapters</th><th class="num">Asks + picks</th></tr></thead><tbody>${storyRows}</tbody></table></section>` : ""}
${reviewHtml ? `<section><h2>Blind review</h2>${reviewHtml}</section>` : ""}
<section><h2>Findings</h2>${findingHtml}</section>
${shotHtml ? `<section><h2>Shots</h2><p class="quiet">Every shot this check took. Click one for the full size.</p>${shotHtml}</section>` : ""}
<footer><p>${r.steps.map((s) => `${esc(s.name)} ${secs(s.ms / 1000)}`).join(" · ")}</p><p>Re-run: <code>node scripts/check.mjs ${esc(showPath(r.figure))}${r.tier === "full" ? " --full" : ""}</code></p></footer>
</main></body></html>
`;
}

function themeCss() {
  const rgba = (c) => (Array.isArray(c) ? `rgb(${c.slice(0, 3).map((x) => Math.round(x * 255)).join(" ")} / ${c[3] ?? 1})` : c);
  const vars = (t) => {
    const U = UI[t], P = PALETTE[t];
    return `--bg:${t === "light" ? "#FAFAFA" : "#0B0B0C"};--surface:${rgba(U.surface)};--raised:${U.raised};--ink:${U.ink};--ink2:${U.ink2};--ink3:${U.ink3};--ink4:${U.ink4};--line:${rgba(U.line)};--line2:${rgba(U.lineStrong)};--ok:${P.ok};--warn:${P.warn};--fail:${P.fail};--shadow:${U.shadowSm}`;
  };
  return `:root{${vars("light")};color-scheme:light dark}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${vars("dark")}}}
:root[data-theme="dark"]{${vars("dark")}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Geist",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1120px;margin:0 auto;padding:56px 32px 64px}
code,th small,td small,.kicker,figcaption b{font-family:"Geist Mono",ui-monospace,monospace}
header .kicker{margin:0 0 10px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
h1{font-size:40px;line-height:1.1;letter-spacing:-.025em;font-weight:600;margin:0}
.sub{font-size:17px;color:var(--ink2);margin:10px 0 0;max-width:720px}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin:18px 0 0;color:var(--ink3);font-size:12.5px}
.meta code{color:var(--ink2)}
h2{font-size:20px;letter-spacing:-.012em;font-weight:600;margin:48px 0 6px}
h3{font-size:13px;font-weight:600;margin:0}
.quiet{color:var(--ink3);margin:0 0 16px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;background:var(--ink4)}
.s-ok{background:var(--ok)}.s-warn{background:var(--warn)}.s-fail{background:var(--fail)}.s-skip{background:transparent;box-shadow:inset 0 0 0 1.5px var(--ink4)}
.verdict{display:flex;gap:14px;align-items:flex-start;margin:32px 0 0;padding:20px 22px;border:1px solid var(--line2);border-radius:16px;background:var(--surface)}
.verdict .dot{width:12px;height:12px;margin-top:8px}
.verdict h2{margin:0;font-size:22px}
.verdict p{margin:2px 0 0;color:var(--ink2)}
.verdict ul{margin:10px 0 0;padding-left:18px;color:var(--ink2)}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0 0}
.card{border:1px solid var(--line);border-radius:16px;padding:16px 18px 18px;background:var(--surface);box-shadow:var(--shadow)}
.card header{display:flex;align-items:center;gap:8px}
.card .word{margin-left:auto;font-size:11.5px;color:var(--ink3)}
.card .big{font-size:28px;font-weight:600;letter-spacing:-.02em;margin:10px 0 6px;font-variant-numeric:tabular-nums}
.card .d{margin:2px 0 0;font-size:12.5px;color:var(--ink2)}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:10px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
thead th{font-size:11.5px;font-weight:500;color:var(--ink3);border-bottom:1px solid var(--line2)}
th[scope=row]{font-weight:600;white-space:nowrap}
th small,td small{display:block;font-size:11px;font-weight:400;color:var(--ink3)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.bar{width:58%}
.segs{display:flex;gap:2px;height:34px}
.seg{min-width:0;display:flex;flex-direction:column;justify-content:center;padding:0 7px;background:var(--raised);border-radius:6px;overflow:hidden;white-space:nowrap}
.seg b{font-size:11.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis}
.seg i{font-style:normal;font-size:10.5px;color:var(--ink3);font-family:"Geist Mono",monospace}
.seg.long{box-shadow:inset 0 -2px 0 var(--warn)}
.rev td.low{color:var(--fail);font-weight:600}
.finds{margin:0 0 18px}
.finds h3{display:flex;gap:8px;align-items:center;margin:0 0 6px}
.count{font:500 11px "Geist Mono",monospace;color:var(--ink3)}
.finds ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}
.finds li{display:flex;gap:10px;align-items:baseline;padding:8px 2px;border-bottom:1px solid var(--line);font-size:13px}
.finds li .dot{transform:translateY(-1px)}
.finds li small{display:block;color:var(--ink3);font-size:11px;margin-top:2px}
.shots{margin:0 0 26px}
.shots h3{font:500 11.5px "Geist Mono",monospace;letter-spacing:.04em;color:var(--ink2);margin:0 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.grid.tall{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}
figure{margin:0}
figure img,.noimg{display:block;width:100%;border-radius:8px;box-shadow:0 0 0 1px var(--line2)}
.noimg{padding:20px 8px;font-size:11px;color:var(--ink3)}
figcaption{font-size:11px;line-height:1.35;color:var(--ink3);margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
figcaption b{color:var(--ink2);font-weight:500;margin-right:4px}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--line);color:var(--ink3);font-size:12px}
footer p{margin:4px 0}
@media (max-width:900px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:700px){main{padding:32px 16px 48px}.cards{grid-template-columns:1fr}h1{font-size:30px}td.bar{width:auto}.stories thead th:nth-child(4),.stories td.bar{display:none}}`;
}

/** PNG files -> Map(path -> JPEG data URL, 480 px wide), in one headless Chrome. Empty without Chrome. */
async function thumbnails(files) {
  const out = new Map();
  const { CHROME, launch, openPage } = await import("./cdp.mjs");
  if (!CHROME) return out;
  let browser;
  try {
    browser = await launch();
    const page = await openPage(browser, "about:blank", { width: 400, height: 300, dpr: 1 });
    for (const f of files) {
      if (!existsSync(f)) continue;
      const url = await page.evaluate(`(async () => {
        const i = new Image(); i.src = "data:image/png;base64,${readFileSync(f).toString("base64")}"; await i.decode();
        const w = Math.min(480, i.width), h = Math.round(i.height * w / i.width);
        const c = new OffscreenCanvas(w, h), g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(i, 0, 0, w, h);
        const b = await c.convertToBlob({ type: "image/jpeg", quality: 0.82 });
        return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
      })()`, { timeout: 30000 });
      out.set(f, url);
    }
  } catch { /* a report without thumbnails still reads */ }
  finally { browser?.close(); }
  return out;
}
