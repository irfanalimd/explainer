// Merge a lesson (examples/<name>/lesson.mjs) into a recorded Script by step id (CONTRACTS.md 10). The figure owns
// the truth and passes the values (s.step(caption, { id, vars })); the lesson owns the words and only formats them.
// Every step gets `layers` ({ plain: caption } without a lesson entry); chapters get the lesson's about and entry
// card; asks, in-world picks (s.choose) and the end check (s.check) get the lesson's text plus per-option feedback.
// Problems go to script.problems with kind "lesson".
import { fill, fillIds } from "./template.mjs";

const DEEPER = ["cost", "how", "code", "edge", "real", "source"];
const ENTER = ["sofar", "now", "done"];

/** `x@story` keys replace `x` for that story; other stories' overrides are dropped. Shallow. */
export function forStory(obj, story) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj) || typeof obj === "function") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (!k.includes("@")) out[k] = v;
  for (const [k, v] of Object.entries(obj)) {
    const at = k.lastIndexOf("@");
    if (at > 0 && k.slice(at + 1) === story) out[k.slice(0, at)] = v;
  }
  return out;
}


/** The lesson's header as the HUD reads it: meta.terms (plain strings) merged with the lesson's { lead, def }. */
function headerOf(lesson, meta) {
  const terms = {};
  for (const [name, def] of Object.entries(meta?.terms ?? {})) terms[name] = { lead: null, def: String(def) };
  for (const [name, t] of Object.entries(lesson.terms ?? {})) terms[name] = { lead: t.lead ?? null, def: t.def ?? terms[name]?.def ?? "" };
  return {
    goal: lesson.goal ?? "",
    objectives: (lesson.objectives ?? []).map(({ id, text }) => ({ id, text })),
    picture: lesson.picture ? { name: lesson.picture.name, rows: lesson.picture.rows.map((r) => ({ ...r })), breaks: lesson.picture.breaks ?? "" } : null,
    terms,
    misconceptions: (lesson.misconceptions ?? []).map(({ id, wrong, fix }) => ({ id, wrong, fix })),
  };
}

/**
 * Merge `lesson` (or null) into `script` in place: script.lesson, and per step id, layers, caption, about, enter, ask.
 * opts: { scenario, meta }
 */
export function mergeLesson(script, lesson, { scenario = null, meta = {} } = {}) {
  script.lesson = lesson ? headerOf(lesson, meta) : null;
  if (!lesson) {
    for (const st of script.steps) st.layers = { plain: st.caption };
    return script;
  }
  const story = scenario ?? "";
  const rows = new Set((script.lesson.picture?.rows ?? []).map((r) => r.id));
  const beliefs = new Set(script.lesson.misconceptions.map((m) => m.id));
  const seen = new Map();   // step id -> times met so far
  // a whole entry "id@story" replaces "id"; inside an entry, a field "x@story" replaces "x"
  const [steps, chapters, asks, choices, checks] = [lesson.steps, lesson.chapters, lesson.asks, lesson.choices, lesson.checks].map((m) => forStory(m ?? {}, story));
  const entryOf = (m, id) => {
    if (!id || !m[id]) return null;
    const e = forStory(m[id], story);
    return e.first ? { ...e, first: forStory(e.first, story) } : e;
  };

  for (const st of script.steps) {
    const problem = (message) => script.problems.push({ kind: "lesson", message: `step ${st.index}${st.id ? ` (${st.id})` : ""}: ${message}`, step: st.index, id: st.id });
    const vars = st.vars ?? {};
    const text = (tpl, where) => {
      const r = fill(tpl, vars);
      for (const name of r.missing) problem(`${where} uses {${name}}, which the figure does not pass`);
      return r.text;
    };
    const end = st.beats[st.beats.length - 1].state;

    st.layers = layersOf(st, entryOf(steps, st.id), { vars, text, problem, end, rows, seen });
    st.caption = st.layers.plain;

    if (st.phaseId) {
      const ch = entryOf(chapters, st.phaseId);
      if (ch?.about) st.about = text(ch.about, `chapter "${st.phaseId}" about`);
      if (ch?.enter) st.enter = enterOf(ch.enter, (tpl, k) => text(tpl, `chapter "${st.phaseId}" enter.${k}`));
    }
    if (st.ask?.id) {
      const a = entryOf(asks, st.ask.id);
      if (a) st.ask = askOf(st.ask, a, { text, problem, beliefs });
    }
    if (st.choose) {
      const c = entryOf(choices, st.choose.id);
      if (c) st.choose = chooseOf(st.choose, c, { text, problem, beliefs });
    }
  }
  // the end check's questions take their words from lesson.checks, filled from each check's own vars
  script.checks = (script.checks ?? []).map((c) => {
    const e = entryOf(checks, c.id);
    if (!e) return c;
    const problem = (message) => script.problems.push({ kind: "lesson", message: `check "${c.id}": ${message}`, step: null, id: c.id });
    const text = (tpl, where) => {
      const r = fill(tpl, c.vars ?? {});
      for (const name of r.missing) problem(`${where} uses {${name}}, which the figure does not pass`);
      return r.text;
    };
    return askOf(c, e, { text, problem, beliefs });
  });
  return script;
}

function layersOf(st, entry, { vars, text, problem, end, rows, seen }) {
  const n = st.id ? (seen.get(st.id) ?? 0) : 0;
  if (st.id) seen.set(st.id, n + 1);
  const passes = (e) => e && (typeof e.when !== "function" || e.when(vars));
  const base = passes(entry) ? entry : null;
  const first = n === 0 && base && passes(base.first) ? base.first : null;
  const e = first ? { ...base, ...first } : base;
  if (!e?.plain) return { plain: st.caption };

  const out = { plain: text(e.plain, "plain") };
  if (e.why) out.why = text(e.why, "why");
  if (e.look?.length) {
    const r = fillIds(e.look, vars);
    for (const name of r.missing) problem(`look uses {${name}}, which the figure does not pass`);
    for (const id of r.ids) if (!end.has(id)) problem(`look names "${id}", which does not exist at the end of the step`);
    out.look = r.ids.filter((id) => end.has(id));
  }
  if (e.deeper) {
    const d = {};
    for (const [k, v] of Object.entries(e.deeper)) {
      if (!DEEPER.includes(k)) { problem(`deeper has an unknown field "${k}" (use ${DEEPER.join(", ")})`); continue; }
      d[k] = text(v, `deeper.${k}`);
    }
    out.deeper = d;
  }
  if (e.picture) {
    if (rows.has(e.picture)) out.picture = e.picture;
    else problem(`picture names "${e.picture}", which is not a row of lesson.picture`);
  }
  if (e.key) out.key = true;
  return out;
}

function enterOf(enter, text) {
  const out = {};
  for (const k of ENTER) if (enter[k]) out[k] = text(enter[k], k);
  if (enter.picture) out.picture = true;
  return out;
}

// an in-world pick: the lesson words the prompt and, per option, what the run shows and the belief behind a wrong pick
function chooseOf(choose, c, { text, problem, beliefs }) {
  const out = { ...choose, prompt: c.prompt ? text(c.prompt, "choose prompt") : choose.prompt };
  if (c.why) out.why = text(c.why, "choose why");
  // per option by index, or `wrong`: one entry for every wrong option (when the figure's option count varies with a knob)
  if (c.options || c.wrong) {
    if (c.options && c.options.length !== choose.options.length) problem(`choose "${choose.id}" has ${c.options.length} options in the lesson and ${choose.options.length} in the figure`);
    out.options = Object.freeze(choose.options.map((o, j) => {
      const opt = c.options?.[j] ?? (j !== choose.answer ? c.wrong : null) ?? {};
      if (opt.misconception && !beliefs.has(opt.misconception)) problem(`choose "${choose.id}" option ${j + 1} names an unknown misconception "${opt.misconception}"`);
      return Object.freeze({ ...o,
        ...(opt.text ? { text: text(opt.text, `choose option ${j + 1}`) } : {}),
        ...(opt.feedback ? { feedback: text(opt.feedback, `choose option ${j + 1} feedback`) } : {}),
        ...(opt.misconception ? { misconception: opt.misconception } : {}) });
    }));
  }
  return Object.freeze(out);
}

function askOf(ask, a, { text, problem, beliefs }) {
  const out = { ...ask, question: a.question ? text(a.question, "ask question") : ask.question };
  if (a.why) out.why = text(a.why, "ask why");
  if (a.options) {
    if (a.options.length !== ask.options.length) problem(`ask "${ask.id}" has ${a.options.length} options in the lesson and ${ask.options.length} in the figure`);
    out.options = ask.options.map((o, j) => (a.options[j]?.text ? text(a.options[j].text, `ask option ${j + 1}`) : o));
    const feedback = ask.options.map((_, j) => {
      const opt = a.options[j] ?? {};
      if (opt.misconception && !beliefs.has(opt.misconception)) problem(`ask "${ask.id}" option ${j + 1} names an unknown misconception "${opt.misconception}"`);
      return {
        ...(opt.feedback ? { text: text(opt.feedback, `ask option ${j + 1} feedback`) } : {}),
        ...(opt.misconception ? { misconception: opt.misconception } : {}),
      };
    });
    if (feedback.some((f) => f.text || f.misconception)) out.feedback = feedback;
  }
  return Object.freeze(out);
}
