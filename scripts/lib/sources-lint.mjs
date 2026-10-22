// The sources check (CONTRACTS.md 10.6): lesson.sources is well formed, every [id] a text cites is one of them, every
// source is cited somewhere, and the layers that state a fact about real systems (deeper.real, deeper.source,
// meta.cite) name their source. Node only; verify runs it once per figure, over the lesson file and every run.
//   lintSources(lesson, meta, seen) -> { errors, warnings, info: { sources, cites, uncited } }
//   seen: [{ where, text }] texts from the compiled runs (captions, layers, the scale shot's lines)
import { ID } from "../../engine/scene/sources.mjs";
import { tokens } from "../../engine/scene/narrate.mjs";

/** The citations in caption markup, as the page reads them: not inside inline code, not escaped. */
export function citesOf(markup) {
  const out = [];
  const walk = (list) => { for (const t of list) { if (t.type === "cite") out.push(t); else if (t.type === "bold") walk(t.children); } };
  walk(tokens(String(markup ?? "")));
  return out;
}

const isStr = (x) => typeof x === "string" && x.trim() !== "";
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const listOf = (xs, n = 6) => (xs.length > n ? `${xs.slice(0, n).join(", ")} and ${xs.length - n} more` : xs.join(", "));

/** Every string in a lesson value, with its path ("steps[\"map.write\"].deeper.source"); `sources` itself is skipped. */
function* strings(v, path) {
  if (typeof v === "string") { yield { where: path, text: v }; return; }
  if (typeof v === "function" || v == null || typeof v !== "object") return;
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) yield* strings(v[i], `${path}[${i}]`); return; }
  for (const [k, x] of Object.entries(v)) yield* strings(x, /^[A-Za-z_$][\w$]*$/.test(k) ? `${path}.${k}` : `${path}[${JSON.stringify(k)}]`);
}

export function lintSources(lesson, meta = {}, seen = []) {
  const errors = [], warnings = [];
  const E = (rule, message) => errors.push({ kind: "sources", rule, message });
  const W = (rule, message) => warnings.push({ kind: "sources", rule, message });
  const raw = lesson?.sources;
  const ids = new Set();

  // ---- the list itself
  if (raw !== undefined && !Array.isArray(raw)) E("shape", "lesson.sources must be a list: [{ id, title, by, year, where, url, supports }]");
  const list = Array.isArray(raw) ? raw : [];
  list.forEach((s, i) => {
    const at = `lesson.sources[${i}]`;
    if (!s || typeof s !== "object" || Array.isArray(s)) { E("shape", `${at} must be { id, title, by, year, where, url, supports }`); return; }
    const name = isStr(s.id) ? `"${s.id}"` : at;
    if (!isStr(s.id)) E("id", `${at} has no id: a short slug the text cites as [id], like dean2004`);
    else if (!ID.test(s.id)) E("id", `${at}: id "${s.id}" must be a lowercase slug (letters, digits, dashes; a letter first), like dean2004`);
    else if (ids.has(s.id)) E("id", `two sources have the id "${s.id}"`);
    else ids.add(s.id);
    for (const f of ["title", "by"]) if (!isStr(s[f]) && !(f === "by" && Array.isArray(s.by) && s.by.length)) E("fields", `source ${name} has no ${f}`);
    if (s.year === undefined || s.year === null || String(s.year).trim() === "") E("fields", `source ${name} has no year (the year it was published, or "n.d." for a living document)`);
    if (s.url !== undefined && s.url !== "" && !/^https?:\/\/\S+$/.test(String(s.url))) E("fields", `source ${name}: url must be an http(s) address, got ${JSON.stringify(s.url)}`);
    if (!isStr(s.where)) W("fields", `source ${name} has no where (the venue or publisher: "OSDI", "MIT Press", "WHATWG")`);
    const sup = Array.isArray(s.supports) ? s.supports.filter(isStr) : isStr(s.supports) ? [s.supports] : [];
    if (!sup.length) W("fields", `source ${name} says nothing it supports: supports: ["its example", "a number", "a claim"] tells the expert reader what to check against it`);
  });

  // ---- every citation, in the lesson file, the figure's meta and the runs
  const cites = [];   // { id, where }
  const scan = (where, text) => { for (const c of citesOf(text)) cites.push({ id: c.id, where }); };
  if (lesson && typeof lesson === "object") for (const [k, v] of Object.entries(lesson)) if (k !== "sources") for (const x of strings(v, `lesson.${k}`)) scan(x.where, x.text);
  const metaCite = typeof meta?.cite === "string" ? meta.cite : meta?.cite?.text;
  for (const k of ["hook", "takeaway", "subtitle"]) if (isStr(meta?.[k])) scan(`meta.${k}`, meta[k]);
  for (const x of strings(meta?.recap ?? [], "meta.recap")) scan(x.where, x.text);
  if (isStr(metaCite)) scan("meta.cite", metaCite);
  for (const x of seen) scan(x.where, x.text);
  const unknown = new Map();
  for (const c of cites) if (!ids.has(c.id)) { if (!unknown.has(c.id)) unknown.set(c.id, []); unknown.get(c.id).push(c.where); }
  for (const [id, where] of unknown) {
    const near = [...ids].find((x) => x.startsWith(id.slice(0, 4)) || id.startsWith(x.slice(0, 4)));
    E("cite", `[${id}] names no source in lesson.sources (${listOf([...new Set(where)], 3)})${near ? `: did you mean [${near}]?` : ""}`);
  }
  const cited = new Set(cites.map((c) => c.id));
  const uncited = [...ids].filter((id) => !cited.has(id));
  if (uncited.length) W("uncited", `${plural(uncited.length, "source")} no text cites: ${listOf(uncited.map((x) => `[${x}]`))} (cite each where the figure uses it, or drop it)`);

  // ---- the layers that state facts about real systems
  const bare = [];
  if (lesson?.steps && typeof lesson.steps === "object") {
    for (const [id, e] of Object.entries(lesson.steps)) {
      const entries = [["", e], ["first.", e?.first]];
      for (const [pre, x] of entries) {
        if (!x || typeof x !== "object") continue;
        for (const [dk, d] of Object.entries(x)) {
          if (!dk.startsWith("deeper") || !d || typeof d !== "object") continue;
          // a real-world layer is cited by its own [id] or by the Source line beside it (the same story's, or the base one)
          const sourced = (fk) => [`source${fk.slice(4)}`, "source"].some((k) => isStr(d[k]) && citesOf(d[k]).length);
          for (const [fk, text] of Object.entries(d)) {
            const field = fk.split("@")[0];
            if (!isStr(text) || citesOf(text).length) continue;
            if (field === "source" || (field === "real" && !sourced(fk))) bare.push(`steps["${id}"].${pre}${dk}.${fk}`);
          }
        }
      }
    }
  }
  const metaBare = isStr(metaCite) && !citesOf(metaCite).length;
  if (lesson && !list.length) {
    const n = bare.length + (metaBare ? 1 : 0);
    W("none", `no lesson.sources: the facts this figure states about real systems name no source the reader can check${n ? ` (${plural(n, "layer")} of In real systems, Source or meta.cite)` : ""}. List them as lesson.sources and cite each as [id] (references/teaching.md 5.6)`);
  } else if (list.length) {
    if (bare.length) W("claim", `${plural(bare.length, "real-world layer")} name no source: ${listOf(bare, 4)} (end each with [id] and a locator, e.g. "[dean2004] §3.6")`);
    if (metaBare) W("claim", `meta.cite is plain text: write it as the source it names, "[id]", so the title links to it and the handout lists it`);
  }
  return { errors, warnings, info: { sources: list.length, cites: cites.length, uncited: uncited.length } };
}
