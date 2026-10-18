// The lesson a figure teaches, as data and as plain text: what a reader meets, in order. Used by scripts/lesson.mjs
// (read the lesson like a script) and by verify's teaching lint (scripts/lib/teach.mjs). DOM-free, Node only.
//   extractLesson(fig, compile, opts) -> { title, hook, level, terms, takeaway, recap, header, stories: [{ chapters: [{ steps }] }] }
//   formatLesson(lesson, opts)        -> text
// Captions keep their structure as markup nodes (so the lint can tell a chip from a word); `text` is the flat version.
// A figure with a lesson (CONTRACTS.md 10) adds `header` (goal, objectives, picture, terms), each step's `layers`,
// each chapter's `enter` card and each ask's per-option feedback, all flattened to reading text.
import { tokens } from "../../engine/scene/narrate.mjs";
import { captionTemplate, forkOf } from "../../engine/playback.mjs";

export const LEVELS = ["intro", "core", "deep"];

/** Markup -> plain reading text. refTitle(id) names entity chips; inline code keeps its backticks. */
export function flat(markup, refTitle = () => null, { code = true } = {}) {
  const walk = (list) => list.map((t) => {
    if (t.type === "bold") return walk(t.children);
    if (t.type === "ref") return t.text ?? refTitle(t.id) ?? t.id;
    if (t.type === "code") return code ? "`" + t.text + "`" : t.text;
    return t.text;
  }).join("");
  return walk(tokens(markup ?? "")).replace(/\s+/g, " ").trim();
}

/** The meta.recap or a scenario's recap as a list of lines ([] when absent or malformed). */
export const recapOf = (r) => (Array.isArray(r) ? r : typeof r === "string" && r.trim() ? [r] : []).filter((x) => typeof x === "string" && x.trim());

const titleFinder = (tl) => {
  const cache = new Map();
  return (i) => (id) => {
    const k = `${i}:${id}`;
    if (cache.has(k)) return cache.get(k);
    let title = null;
    for (const j of [i, i + 1, i - 1, tl.steps.length]) {
      try { const r = tl.snapshot?.(Math.max(0, j))?.entities?.get?.(id); if (r) { title = r.title ?? r.label ?? r.text ?? null; break; } } catch { /* fake timelines */ }
    }
    cache.set(k, title);
    return title;
  };
};

// a lesson's layers, entry card and ask feedback as reading text
const flatLayers = (L, title) => {
  const out = { plain: flat(L.plain, title) };
  if (L.why) out.why = flat(L.why, title);
  if (L.look) out.look = L.look;
  if (L.picture) out.picture = L.picture;
  if (L.key) out.key = true;
  if (L.deeper) out.deeper = Object.fromEntries(Object.entries(L.deeper).map(([k, v]) => [k, flat(v, title)]));
  return out;
};
const flatFields = (o, title) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? flat(v, title) : v]));

// markup as compiled (raw) and the step's entity-title lookup (refTitle), for readers that keep the markup
// (scripts/review-packet.mjs); not enumerable, so --json output stays as it was
const hidden = (obj, props) => Object.defineProperties(obj, Object.fromEntries(Object.entries(props).map(([k, value]) => [k, { value }])));

// the definitions a reader meets: meta.terms, with a lesson's { lead, def } over them (as engine/scene/lesson.mjs merges)
function termsOf(meta, lesson) {
  const base = meta.terms && typeof meta.terms === "object" && !Array.isArray(meta.terms) ? meta.terms : {};
  if (!lesson?.terms || typeof lesson.terms !== "object") return base;
  const out = { ...base };
  for (const [name, t] of Object.entries(lesson.terms)) out[name] = t?.def ?? base[name] ?? "";
  return out;
}

/**
 * Compile every scenario at its default params (desktop env) and collect what the reader meets.
 * opts: { rng, scenario (only this one), env, params (override every story's knobs) }
 */
export function extractLesson(fig, compile, opts = {}) {
  const meta = fig.meta ?? {};
  const params = fig.params ?? {};
  const defaults = Object.fromEntries(Object.entries(params).map(([k, d]) => [k, d?.value]));
  const all = Array.isArray(fig.scenarios) && fig.scenarios.length ? fig.scenarios : [{ id: undefined, label: "Default" }];
  const list = opts.scenario ? all.filter((s) => s.id === opts.scenario) : all;
  if (opts.scenario && !list.length) throw new Error(`no scenario "${opts.scenario}" (have ${all.map((s) => s.id).join(", ")})`);
  const knobs = Object.entries(params).filter(([k, d]) => k !== "seed" && d && typeof d === "object").map(([k, d]) => ({ id: k, label: d.label ?? k, type: d.type, hidden: !!d.hidden }));
  const counters = Object.entries(fig.counters ?? {}).map(([k, c]) => ({ id: k, label: c?.label ?? k, hint: c?.hint ?? "", primary: c?.primary ?? false }));
  const lesson = {
    title: meta.title ?? "", subtitle: meta.subtitle ?? "", hook: meta.hook ?? "", takeaway: meta.takeaway ?? "",
    level: LEVELS.includes(meta.level) ? meta.level : null, levelRaw: meta.level, recap: recapOf(meta.recap), recapRaw: meta.recap,
    terms: termsOf(meta, fig.lesson), termsRaw: meta.terms,
    knobs, counters, scenarioCount: all.length, header: null, stories: [],
  };
  let base = null;
  for (const sc of list) {
    const story = {
      id: sc.id, label: sc.label ?? sc.id ?? "Default", description: sc.description ?? "", whatIf: sc.whatIf ?? "",
      takeaway: sc.takeaway ?? "", recap: sc.recap === undefined ? null : recapOf(sc.recap), recapRaw: sc.recap,
      index: all.indexOf(sc), chapters: [], steps: 0, duration: 0, fork: null, error: null,
    };
    lesson.stories.push(story);
    let tl;
    try {
      tl = compile(fig, { params: { ...defaults, ...(sc.params ?? {}), ...(opts.params ?? {}) }, scenario: sc.id, ...(opts.rng ? { rng: opts.rng } : {}), ...(opts.env ? { env: opts.env } : {}) });
    } catch (e) { story.error = String(e?.message ?? e); continue; }
    const steps = tl.steps ?? [], phases = tl.phases ?? [];
    story.steps = steps.length;
    lesson.header ??= tl.lesson ?? null;
    story.duration = tl.duration ?? 0;
    if (story.index === 0) base = tl;
    else if (base) { try { story.fork = forkOf(base, tl, sc.start ? { start: sc.start } : {}); } catch { story.fork = null; } }
    const title = titleFinder(tl);
    const starts = phases.length ? phases : [{ name: "", step: 0, about: null }];
    starts.forEach((ph, k) => {
      const from = ph.step ?? 0, to = k + 1 < starts.length ? starts[k + 1].step : steps.length;
      const chapter = { name: ph.name ?? "", id: ph.id ?? null, about: ph.about ?? "", aboutText: ph.about ? flat(ph.about, title(from)) : "", step: from, steps: [],
        ...(ph.enter ? { enter: flatFields(ph.enter, title(from)) } : {}) };
      for (let i = from; i < to; i++) {
        const st = steps[i];
        const ask = st.ask ? {
          question: String(st.ask.question ?? ""), options: (st.ask.options ?? []).map(String), answer: st.ask.answer,
          why: st.ask.why ?? "", questionText: flat(st.ask.question, title(i)), optionsText: (st.ask.options ?? []).map((o) => flat(o, title(i))),
          whyText: st.ask.why ? flat(st.ask.why, title(i)) : "",
          ...(st.ask.feedback ? { feedback: st.ask.feedback.map((f) => ({ ...(f.text ? { text: flat(f.text, title(i)) } : {}), ...(f.misconception ? { misconception: f.misconception } : {}) })) } : {}),
        } : null;
        chapter.steps.push(hidden({ index: i, id: st.id ?? null, caption: st.caption ?? "", text: flat(st.caption, title(i)), template: captionTemplate(st.caption ?? ""), ask,
          ...(tl.lesson && st.layers ? { layers: flatLayers(st.layers, title(i)) } : {}) }, { raw: { layers: st.layers ?? null, ask: st.ask ?? null }, refTitle: title(i) }));
      }
      story.chapters.push(hidden(chapter, { raw: { about: ph.about ?? null, enter: ph.enter ?? null }, refTitle: title(from) }));
    });
  }
  return lesson;
}

// ---------------------------------------------------------------- text

const wrap = (text, width, indent) => {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > width) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  return lines.map((l, i) => (i ? indent : "") + l).join("\n");
};

/**
 * The lesson as a script. opts: { all (no folding of repeats), full (stories from step 0, not from their fork),
 * width (default 100) }. A term's plain definition is printed in [brackets] where the run first uses it, as the
 * explain panel does. With a lesson file, each step also prints its layers (why, look, picture, deeper), each
 * chapter its entry card, and each ask option its feedback.
 */
export function formatLesson(L, opts = {}) {
  const W = opts.width ?? 100;
  const out = [];
  const seen = new Set();
  const H = L.header;
  const defOf = (name) => (H ? H.terms[name]?.def : L.terms[name]);
  const defineFirst = (markup, text) => {
    let extra = "";
    for (const t of tokens(markup ?? "")) {
      const walk = (n) => { if (n.type === "term" && !seen.has(n.name)) { seen.add(n.name); const d = defOf(n.name); extra += `  [${n.name}: ${d ?? "NO DEFINITION in meta.terms"}]`; } else if (n.type === "bold") n.children.forEach(walk); };
      walk(t);
    }
    return text + extra;
  };
  const field = (label, value, ind = "") => { if (value) out.push(`${ind}${label.padEnd(10)}${wrap(value, W - 10 - ind.length, ind + " ".repeat(10))}`); };
  const shownKnobs = L.knobs.filter((k) => !k.hidden);   // hidden: true keeps a param out of the settings drawer
  out.push(`${L.title}${L.subtitle ? `: ${L.subtitle}` : ""}`);
  out.push(`level ${L.level ?? `core (not declared${L.levelRaw !== undefined ? `; "${L.levelRaw}" is not intro | core | deep` : ""})`} · ${L.stories.length} ${L.stories.length === 1 ? "story" : "stories"} · ${shownKnobs.length} ${shownKnobs.length === 1 ? "knob" : "knobs"}${shownKnobs.length ? ` (${shownKnobs.map((k) => k.label).join(", ")})` : ""}`);
  out.push("");
  field("HOOK", L.hook || "(none: the start card shows the subtitle)");
  if (H) formatHeader(H, out, field, W);
  const names = Object.keys(H ? H.terms : L.terms);
  const termLine = (n) => (H ? `${H.terms[n].lead ? `(${H.terms[n].lead}) ` : ""}${H.terms[n].def}` : L.terms[n]);
  if (names.length) { out.push("WORDS"); for (const n of names) out.push(`  ${n}: ${wrap(termLine(n), W - n.length - 4, " ".repeat(n.length + 4))}`); }
  const prim = L.counters.filter((c) => c.primary);
  if (L.counters.length) out.push(`NUMBERS   ${L.counters.map((c) => `${c.label}${c.primary ? " *" : ""}`).join(" · ")}${prim.length ? "   (* in the dock)" : ""}`);
  for (const story of L.stories) {
    out.push("");
    out.push(`━━ Story ${story.index + 1} of ${L.scenarioCount} · ${story.label}${story.id ? `  (${story.id})` : ""}  ${story.steps} steps, ${story.duration.toFixed(0)} s at 1x`);
    if (story.whatIf) field("what if", `What if… ${story.whatIf}`, "   ");
    if (story.description) field("story", story.description, "   ");
    if (story.error) { out.push(`   COMPILE FAILED: ${story.error}`); continue; }
    const from = !opts.full && story.fork ? story.fork.step : 0;
    if (from) out.push(`   (steps 0–${from - 1} repeat story 1 and are skipped here; --full shows them)`);
    story.chapters.forEach((ch, k) => {
      const last = ch.steps.length ? ch.steps[ch.steps.length - 1].index : ch.step;
      if (last < from) return;
      out.push("");
      out.push(`   ▸ Chapter ${k + 1} of ${story.chapters.length} · ${ch.name || "(unnamed)"}`);
      field("about", ch.about ? defineFirst(ch.about, ch.aboutText) : "(none)", "     ");
      if (ch.enter) {
        for (const k of ["sofar", "now", "done"]) if (ch.enter[k]) field({ sofar: "so far", now: "now", done: "done when" }[k], ch.enter[k], "     ");
        if (ch.enter.picture && H?.picture) field("card", `shows the picture map (${H.picture.name})`, "     ");
      }
      let run = null;   // a run of steps with one caption shape: show two, then count the rest
      const flush = () => {
        if (run && run.hidden.length) out.push(`       … ${run.hidden.length} more like this (steps ${run.hidden[0]}–${run.hidden[run.hidden.length - 1]})`);
        run = null;
      };
      for (const st of ch.steps) {
        if (st.index < from) continue;
        if (st.ask) {
          flush();
          out.push(`     PREDICT  ${wrap(defineFirst(st.ask.question, st.ask.questionText), W - 14, " ".repeat(14))}`);
          st.ask.optionsText.forEach((o, j) => {
            out.push(`              ${String.fromCharCode(65 + j)}) ${o}${j === st.ask.answer ? "   ✓" : ""}`);
            const f = st.ask.feedback?.[j];
            if (f?.text || f?.misconception) out.push(`                 ${wrap(`→ ${f.text ?? ""}${f.misconception ? ` [${f.misconception}]` : ""}`, W - 17, " ".repeat(19))}`);
          });
          out.push(`              why: ${st.ask.whyText ? wrap(st.ask.whyText, W - 19, " ".repeat(19)) : "(none: add { why } so the reveal explains itself)"}`);
        }
        if (!opts.all && !st.ask && run && run.template === st.template) {
          if (run.shown < 2) { run.shown++; } else { run.hidden.push(st.index); continue; }
        } else if (!st.ask) { flush(); run = { template: st.template, shown: 1, hidden: [] }; }
        const n = String(st.index).padStart(4);
        out.push(`${n}  ${st.layers?.key ? "★ " : ""}${wrap(defineFirst(st.caption, st.text), W - 8, "      ")}${st.id ? `   ‹${st.id}›` : ""}`);
        if (st.layers) formatLayers(st.layers, H, field);
      }
      flush();
    });
    const take = story.takeaway || L.takeaway;
    const recap = story.recap ?? L.recap;
    out.push("");
    if (recap.length) { out.push("   RECAP"); recap.forEach((r, j) => out.push(`     ${j + 1}. ${wrap(flat(r), W - 8, "        ")}`)); }
    field("TAKEAWAY", take || "(none)", "   ");
  }
  // after the last story, the end card names the lessons that follow (lesson.next)
  if (H?.next?.length) {
    out.push("", "KEEP GOING  (after the last story)");
    for (const n of H.next) { out.push(`  ${n.title}  ${n.href}`); field("why", flat(n.why), "    "); }
  }
  return out.join("\n");
}

// the lesson's goal, objectives and picture map
function formatHeader(H, out, field, W) {
  field("GOAL", H.goal);
  if (H.objectives.length) { out.push("OBJECTIVES"); for (const o of H.objectives) out.push(`  ${o.id}: ${wrap(o.text, W - o.id.length - 4, " ".repeat(o.id.length + 4))}`); }
  if (H.picture) {
    out.push(`PICTURE   ${H.picture.name}`);
    for (const r of H.picture.rows) out.push(`  ${r.id.padEnd(8)}${r.picture}  =  ${r.real}${r.term ? `  (${r.term})` : ""}`);
    field("  breaks", H.picture.breaks);
  }
  if (H.misconceptions.length) { out.push("BELIEFS"); for (const m of H.misconceptions) out.push(`  ${m.id}: ${wrap(`“${m.wrong}” ${m.fix}`, W - m.id.length - 4, " ".repeat(m.id.length + 4))}`); }
}

// a step's layers beyond plain, one labelled line each
function formatLayers(Ly, H, field) {
  const ind = "        ";
  if (Ly.why) field("why", Ly.why, ind);
  if (Ly.look?.length) field("look", Ly.look.join(", "), ind);
  if (Ly.picture) { const r = H?.picture?.rows.find((x) => x.id === Ly.picture); field("picture", r ? `${r.picture} = ${r.real}` : Ly.picture, ind); }
  for (const [k, v] of Object.entries(Ly.deeper ?? {})) field(`· ${k}`, v, ind);
}
