// A lesson's sources (CONTRACTS.md 10.6): lesson.sources = [{ id, title, by, year, where, url, supports, short? }].
// A text layer cites one as `[id]`, optionally with a locator: "[dean2004] §3.6", "[clrs2009] p. 171". The page shows
// it as a short citation ("Dean & Ghemawat 2004, §3.6"), linked when the source has a url; never the brackets.
// Pure: verify's lint, the HUD, the handout and the lesson printer all read it.

/** A source id: a lowercase slug, like dean2004 or html-spec. */
export const ID = /^[a-z][a-z0-9-]*$/;
// where a locator may follow the id: a section, page(s), chapter, figure, table or line
const LOCATOR = /^ ?(?:§ ?[\w.–-]*\w|pp?\. ?[\d–-]*\d|ch\. ?\d+|fig\. ?\d+|table \d+|line \d+)/i;
// `[id]` at the start, after a space, or after an opening bracket or quote: never inside a word ("a[i]")
const OPEN = /[\s(“"'‘]/;

/**
 * Every citation in a piece of text, in order: [{ id, at, index, length }]. `at` is the locator ("§3.6") or "".
 * A backslash before the bracket ("\[x]") is a literal bracket, as in caption markup.
 */
export function citesIn(text) {
  const s = String(text ?? ""), out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "[" || (i > 0 && (s[i - 1] === "\\" || !OPEN.test(s[i - 1])))) continue;
    const j = s.indexOf("]", i + 1);
    if (j < 0) break;
    const id = s.slice(i + 1, j);
    if (!ID.test(id)) continue;
    const loc = LOCATOR.exec(s.slice(j + 1));
    const at = loc ? loc[0].trim() : "";
    out.push({ id, at, index: i, length: j + 1 - i + (loc ? loc[0].length : 0) });
    i = j;
  }
  return out;
}

const surname = (name) => {
  const n = String(name).trim().replace(/\s+et al\.?$/i, "");
  const parts = n.split(/\s+/);
  return parts[parts.length - 1];
};

/** The authors of `by` as a list: an array as it is, or a string split at commas, semicolons, "and" and "&". */
export function authorsOf(by) {
  if (Array.isArray(by)) return by.map(String).map((x) => x.trim()).filter(Boolean);
  const s = String(by ?? "").trim();
  if (!s) return [];
  const many = /\set al\.?$/i.test(s);
  const list = s.replace(/\s+et al\.?$/i, "").split(/\s*(?:;|,|\band\b|&)\s*/).filter(Boolean);
  return many ? [...list, "et al."] : list;
}

/** The short form a citation shows: "Dean & Ghemawat 2004", "Ongaro et al. 2014", or the source's own `short`. */
export function shortOf(src) {
  if (!src) return "";
  if (typeof src.short === "string" && src.short.trim()) return src.short.trim();
  const a = authorsOf(src.by);
  const etal = a[a.length - 1] === "et al.";
  const names = (etal ? a.slice(0, -1) : a).map(surname);
  const who = !names.length ? (src.where ?? src.title ?? src.id ?? "")
    : names.length === 1 && !etal ? names[0]
      : names.length === 2 && !etal ? `${names[0]} & ${names[1]}`
        : `${names[0]} et al.`;
  return src.year != null && src.year !== "" ? `${who} ${src.year}` : String(who);
}

/** The full reference, one line: "Jeffrey Dean, Sanjay Ghemawat. MapReduce: …. OSDI, 2004." */
export function fullOf(src) {
  if (!src) return "";
  const a = authorsOf(src.by).join(", ");
  const tail = [src.where, src.year].filter((x) => x != null && x !== "").join(", ");
  return [a, src.title, tail].filter(Boolean).map((x) => String(x).replace(/[.\s]+$/, "")).join(". ") + ".";
}

/** lesson.sources as a list of plain records with their short and full forms; entries without an id are dropped. */
export function sourcesOf(lesson) {
  const list = Array.isArray(lesson?.sources) ? lesson.sources : [];
  return list.filter((x) => x && typeof x === "object" && typeof x.id === "string").map((x) => ({
    id: x.id, title: x.title ?? "", by: x.by ?? "", year: x.year ?? "", where: x.where ?? "", url: x.url ?? "",
    supports: Array.isArray(x.supports) ? x.supports.map(String) : x.supports ? [String(x.supports)] : [],
    short: shortOf(x), full: fullOf(x),
  }));
}

/** One citation as the page shows it: "Dean & Ghemawat 2004, §3.6". */
export const citeLabel = (src, at = "") => (at ? `${shortOf(src)}, ${at}` : shortOf(src));

/**
 * Text with each known citation written out as the page shows it ("as in [dean2004] §3.6" -> "as in Dean & Ghemawat
 * 2004, §3.6"); unknown ids stay as they are. For text drawn where no link can live (the scale shot's printed lines).
 */
export function resolveCites(text, sources) {
  const byId = new Map((sources ?? []).map((x) => [x.id, x]));
  const s = String(text ?? "");
  let out = "", from = 0;
  for (const c of citesIn(s)) {
    const src = byId.get(c.id);
    if (!src) continue;
    out += s.slice(from, c.index) + citeLabel(src, c.at);
    from = c.index + c.length;
  }
  return out + s.slice(from);
}
