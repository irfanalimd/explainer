// The lesson as the HUD reads it from a compiled timeline (CONTRACTS.md, "Lesson"):
//   tl.lesson               null | { goal, objectives, picture: { name, rows: [{ id, picture, real, term }], breaks }, terms }
//   tl.steps[i].layers      { plain, why?, look?: [entityId], deeper?: { cost, how, code, edge, real, source }, picture?, key? }
//   tl.phases[j].enter      undefined | { sofar?, now, done, picture? } (picture: this card carries the lesson's picture)
//   step.ask.feedback[k]    { text?, misconception? } per option, when the lesson gives any
// Every text field is markup (markup.mjs). A figure without a lesson file still reads well: a step's plain layer is
// its caption, and everything else is simply absent.

/** The deeper fields in reading order (Basics peeks at the first one present), with their labels. */
export const DEEPER = [["cost", "Cost"], ["how", "How"], ["code", "Code"], ["edge", "Edge case"], ["real", "In real systems"], ["source", "Source"]];

export const lessonOf = (tl) => tl?.lesson ?? null;

/** A step's layers; without a lesson the caption is the plain layer. */
export function layersOf(step) {
  const l = step?.layers;
  return l && l.plain ? l : { plain: step?.caption ?? "" };
}

/** The deeper fields a step has, in order: [{ name, label, text }]. */
export function deeperOf(layers) {
  const d = layers?.deeper;
  if (!d) return [];
  return DEEPER.filter(([k]) => typeof d[k] === "string" && d[k].trim()).map(([name, label]) => ({ name, label, text: d[name] }));
}

/** A chapter's entry card, or null. */
export const enterOf = (phase) => (phase?.enter && phase.enter.now ? phase.enter : null);

/** A row of the lesson's picture by id, or null. */
export const pictureRow = (lesson, id) => lesson?.picture?.rows?.find((r) => r.id === id) ?? null;

/** A glossary term from the lesson ({ lead, def }) or the figure's meta.terms (a plain definition). */
export function termOf(lesson, meta, name) {
  const t = lesson?.terms?.[name];
  if (t?.def) return { lead: t.lead ?? null, def: String(t.def).trim() };
  const d = meta?.terms?.[name];
  return typeof d === "string" && d.trim() ? { lead: null, def: d.trim() } : null;
}

/** What a predict option says back when the reader picks it, or null. */
export const feedbackOf = (ask, k) => ask?.feedback?.[k]?.text ?? null;

/** The first URL in a source line, and the words around it ("Drepper (2007)"), for a link. */
export function sourceLink(text) {
  const m = /https?:\/\/[^\s)]+/.exec(String(text ?? ""));
  if (!m) return null;
  const url = m[0].replace(/[.,;]+$/, "");
  const label = String(text).replace(m[0], "").replace(/[\s,;:–-]+$/, "").trim();
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* not a URL after all */ }
  return { url, label: label || host, host };
}
