// Lesson templates (CONTRACTS.md 10.2): fill "{name}", "{count:name|noun}" and "{be:name}" from the vars a figure
// passes with s.step(caption, { id, vars }). The lesson never computes: a var's kind fixes how it prints.
//   number -> fmt.num          string -> literal text          [a, b] -> "a and b"
//   { key: v } -> a key chip   { code: s } -> inline code       { path: [a, b] } -> "a → b"
//   { ref: id, text } -> an entity chip                          { markup: m } -> caption markup as is (composite items)
// Caption markup ({key:…}, {term:…}, `code`) is left alone: its marks always carry a "kind:" prefix this does not use.
import { num, plural, and } from "../../sim/fmt.mjs";
import { escape, key, code, ref } from "./narrate.mjs";

const SLOT = /(?<!\\)\{(?:(count|be):)?([A-Za-z_]\w*)((?:\|[^{}|]*)*)\}/g;
// a string var that is caption markup (fmt.key(...) and the like): it prints escaped, as the marks' own letters
const MARKED = /(?<!\\)\{(?:key|ref|term|tone):/;

const isList = (v) => Array.isArray(v) || Array.isArray(v?.path);
const items = (v) => (Array.isArray(v) ? v : v.path);
const amount = (v) => (isList(v) ? items(v).length : Number(v));

/** One var as caption markup. */
export function show(v) {
  if (typeof v === "number") return num(v);
  // a run's string is literal text: its brackets never read as a citation ("[1, 2]" stays as it is)
  if (typeof v === "string") return escape(v).replace(/\[/g, "\\[");
  if (Array.isArray(v)) return and(v.map(show));
  if (v && typeof v === "object") {
    if ("key" in v) return key(String(v.key));
    if ("code" in v) return code(v.code);
    if ("ref" in v) return ref(String(v.ref), v.text === undefined ? undefined : String(v.text));
    if ("markup" in v) return String(v.markup);
    if (Array.isArray(v.path)) return v.path.map(show).join(" → ");
  }
  return escape(String(v));
}

/** One var as a raw id fragment (for look): strings and numbers as they are, a ref chip as its entity id. */
const raw = (v) => (v && typeof v === "object" ? String("ref" in v ? v.ref : "key" in v ? v.key : v) : String(v));

/**
 * Fill a template. Returns { text, missing: [var names not in vars], marked: [string vars that hold caption markup] }.
 * opts.raw prints vars as plain id fragments (for look ids) instead of markup.
 */
export function fill(template, vars = {}, { raw: asRaw = false } = {}) {
  const missing = [], marked = [];
  const text = String(template).replace(SLOT, (whole, fn, name, rest) => {
    if (!vars || !(name in vars)) { missing.push(name); return whole; }
    const v = vars[name];
    if (fn === "be") return amount(v) === 1 ? "is" : "are";
    if (fn === "count") {
      const [one, many] = rest.slice(1).split("|");
      return plural(amount(v), one ?? "", many);
    }
    if (!asRaw && (isList(v) ? items(v) : [v]).some((x) => typeof x === "string" && MARKED.test(x)) && !marked.includes(name)) marked.push(name);
    return asRaw ? raw(v) : show(v);
  });
  return { text, missing, marked };
}

/** Look ids: each entry filled raw; an entry that is exactly "{name}" with a list var expands to one id per item. */
export function fillIds(list, vars = {}) {
  const ids = [], missing = [];
  for (const entry of list ?? []) {
    const whole = /^\{([A-Za-z_]\w*)\}$/.exec(entry);
    if (whole && vars && isList(vars[whole[1]])) { ids.push(...items(vars[whole[1]]).map(raw)); continue; }
    const r = fill(entry, vars, { raw: true });
    ids.push(r.text);
    missing.push(...r.missing);
  }
  return { ids, missing };
}
