// Readable deep links: #step-12, #scenario-crash, #level-expert, alone or joined with "&" (#scenario-crash&step-4).
// They sit beside the HUD's own state hash (#s=…&t=…&p=…, engine/hud/link.mjs), which ignores them. DOM-free.
//   parseLinks("#scenario-crash&step-4") -> { scenario: "crash", step: 4, level: undefined, found: true }
//   stripLinks("#t=3.2&step-4")          -> "t=3.2"   (the hash without them, once they are applied)
//
// A moment is everything a link can say about where to open: the story, the step (or the HUD's time), the reader's
// level and the knobs. The share dialog writes one (formatMoment) and the runtime opens one (parseMoment, then
// resolveMoment against the figure, then the step once the run is compiled: resolveStep). Both spellings are read,
// the readable one and the HUD's, so old links keep working:
//   #scenario-skew&step-14&level-expert&p=reducers:4      (what the share dialog writes)
//   #s=skew&t=60.3&p=reducers:4                           (the HUD's live hash)
// Whatever a link asks for that the page cannot do is dropped, never guessed, and said in a note for the reader.

const LEVELS = new Set(["new", "basics", "expert"]);
const LEVEL_NAMES = { new: "New to this", basics: "I know the basics", expert: "Expert" };
const RE = /^(step|scenario|level)-(.+)$/;
const decode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function parseLinks(hash) {
  const out = { step: undefined, scenario: undefined, level: undefined, found: false };
  for (const part of String(hash ?? "").replace(/^#/, "").split("&")) {
    const m = RE.exec(part);
    if (!m) continue;
    let v = m[2];
    try { v = decodeURIComponent(v); } catch { /* keep it raw */ }
    if (m[1] === "step" && /^\d+$/.test(v) && +v >= 1) out.step = +v;
    else if (m[1] === "scenario" && /^[\w.-]{1,64}$/.test(v)) out.scenario = v;
    else if (m[1] === "level" && LEVELS.has(v)) out.level = v;
    else continue;
    out.found = true;
  }
  return out;
}

export const stripLinks = (hash) => String(hash ?? "").replace(/^#/, "").split("&").filter((p) => p && !RE.test(p)).join("&");

/**
 * Every part of a hash a moment can carry, as written (strings), plus what was malformed.
 * -> { scenario?, step?, time?, level?, params: { key: raw }, bad: [{ kind, raw }], found }
 * found: the hash names a moment at all (so the runtime should open it and tidy the address bar).
 */
export function parseMoment(hash) {
  const out = { scenario: undefined, step: undefined, time: undefined, level: undefined, params: {}, bad: [], found: false };
  for (const part of String(hash ?? "").replace(/^#/, "").split("&")) {
    if (!part) continue;
    const m = RE.exec(part);
    const eq = part.indexOf("=");
    const k = m ? m[1] : eq < 0 ? part : part.slice(0, eq);
    const v = decode(m ? m[2] : eq < 0 ? "" : part.slice(eq + 1));
    if (k === "scenario" || k === "s") out.scenario = v;
    else if (k === "level") out.level = v;
    else if (k === "step") {
      if (/^\d+$/.test(v) && +v >= 1) out.step = +v;
      else out.bad.push({ kind: "step", raw: v });
    } else if (k === "t" && !m) {
      const t = Number(v);
      if (v !== "" && Number.isFinite(t) && t >= 0) out.time = t;
      else out.bad.push({ kind: "time", raw: v });
    } else if (k === "p" && !m) {
      for (const kv of part.slice(eq + 1).split(",")) {
        const c = kv.indexOf(":");
        if (c <= 0) { if (kv) out.bad.push({ kind: "param", raw: decode(kv) }); continue; }
        out.params[decode(kv.slice(0, c))] = decode(kv.slice(c + 1));
      }
    } else continue;
    out.found = true;
  }
  return out;
}

const quote = (s) => `“${String(s).slice(0, 40)}”`;
const nameOf = (key, def) => def?.label ?? key;

/** One knob's value from a link: { value } when it can be used (clamped into range, with a note), else { note }. */
export function linkParam(key, raw, def) {
  const name = nameOf(key, def);
  if (!def) return { note: `This page has no setting called ${quote(key)}, so the link's value for it is left out.` };
  switch (def.type) {
    case "int": case "float": {
      let n = raw === "" ? NaN : Number(raw);
      if (!Number.isFinite(n)) return { note: `${quote(raw)} isn't a number, so ${name} keeps its own value.` };
      if (def.type === "int" && !Number.isInteger(n)) n = Math.round(n);
      if (def.min != null && n < def.min) return { value: def.min, note: `${name} starts at ${def.min}, so the link's ${raw} became ${def.min}.` };
      if (def.max != null && n > def.max) return { value: def.max, note: `${name} goes up to ${def.max}, so the link's ${raw} became ${def.max}.` };
      return { value: n };
    }
    case "bool":
      if (/^(1|true|on|yes)$/i.test(raw)) return { value: true };
      if (/^(0|false|off|no)$/i.test(raw)) return { value: false };
      return { note: `${quote(raw)} isn't on or off, so ${name} keeps its own value.` };
    case "select": {
      const o = (def.options ?? []).find((x) => String(x?.value ?? x) === raw);
      return o === undefined ? { note: `${quote(raw)} isn't one of the choices for ${name}, so it keeps its own value.` } : { value: o?.value ?? o };
    }
    default: {
      const s = String(raw);
      const max = def.maxLength ?? 2000;
      return s.length > max ? { value: s.slice(0, max), note: `${name} was cut to its first ${max} characters.` } : { value: s };
    }
  }
}

/**
 * Check a parsed moment against the figure, before anything is compiled.
 * figure: { scenarios: [{ id, label }], params: { key: def } }
 * -> { scenario (id) | undefined, params: { key: value }, level | undefined, step | undefined, time | undefined, notes: [text] }
 */
export function resolveMoment(m, { scenarios = [], params = {} } = {}) {
  const out = { scenario: undefined, params: {}, level: undefined, step: m?.step, time: m?.time, notes: [] };
  if (!m?.found) return out;
  if (m.scenario != null) {
    const s = scenarios.find((x) => x.id === m.scenario);
    if (s) out.scenario = s.id;
    else if (scenarios.length) out.notes.push(`This page has no story called ${quote(m.scenario)}, so it opens “${scenarios[0].label ?? scenarios[0].id}”.`);
  }
  if (m.level != null) {
    if (LEVELS.has(m.level)) out.level = m.level;
    else out.notes.push(`${quote(m.level)} isn't a reader level (New to this, I know the basics or Expert), so your own level is kept.`);
  }
  for (const [k, raw] of Object.entries(m.params ?? {})) {
    const r = linkParam(k, raw, params[k]);
    if ("value" in r) out.params[k] = r.value;
    if (r.note) out.notes.push(r.note);
  }
  for (const b of m.bad ?? []) {
    if (b.kind === "step") out.notes.push(`${quote(b.raw)} isn't a step number, so the link opens at the start.`);
    else if (b.kind === "time") out.notes.push(`${quote(b.raw)} isn't a time, so the link opens at the start.`);
  }
  return out;
}

/**
 * Where a resolved moment opens in a compiled run (steps: [{ t0 }], duration): { index, time, note? }, or null for the
 * start. A step wins over a time; a step past the end opens the last one, and says so.
 */
export function resolveStep(r, steps = [], duration = 0, storyName = "This story") {
  if (!steps.length) return null;
  if (r?.step != null) {
    const n = steps.length;
    const i = Math.min(r.step, n) - 1;
    return { index: i, time: steps[i].t0, ...(r.step > n ? { note: `${storyName} has ${n} steps, so the link's step ${r.step} opens the last one.` } : {}) };
  }
  if (r?.time != null && r.time > 0.05) {
    const t = Math.min(r.time, duration);
    let i = 0;
    while (i + 1 < steps.length && steps[i + 1].t0 <= t + 1e-9) i++;
    return { index: i, time: t, ...(r.time > duration + 0.05 ? { note: `${storyName} is over before ${Math.round(r.time)} s, so the link opens its end.` } : {}) };
  }
  return null;
}

/** The readable hash for a moment (without "#"): scenario-x&step-n&level-y&p=k:v,… Only what is given is written. */
export function formatMoment({ scenario, step, level, params = {} } = {}) {
  const enc = (v) => encodeURIComponent(typeof v === "boolean" ? (v ? 1 : 0) : v);
  const parts = [];
  if (scenario) parts.push(`scenario-${enc(scenario)}`);
  if (step != null && step >= 1) parts.push(`step-${step}`);
  if (level && LEVELS.has(level)) parts.push(`level-${level}`);
  const p = Object.keys(params).map((k) => `${enc(k)}:${enc(params[k])}`);
  if (p.length) parts.push(`p=${p.join(",")}`);
  return parts.join("&");
}

/** The parts of a hash a moment does not use (another script's), kept when the moment is tidied away. */
export const momentRest = (hash) => String(hash ?? "").replace(/^#/, "").split("&")
  .filter((p) => p && !RE.test(p) && !/^(s|t|p)=/.test(p)).join("&");

export const levelName = (id) => LEVEL_NAMES[id] ?? id;
