// The chapter entry card (teaching.md §4, §7.4): on a chapter's first step, three short lines say where the reader
// stands (So far), what this chapter does (Now) and how they will know it worked. New shows all three, Basics the Now
// line, Expert none. The parts chapter's card also carries the lesson's picture once: everyday picture beside the real
// thing, and where the picture stops matching. Where the panel is short, its rows fold under their heading (a
// disclosure the reader can open) rather than vanish, so a card that says "the table names the parts" still shows
// where the table is (explain.mjs fit()).

const ROWS = [["sofar", "So far"], ["now", "Now"], ["done", "You'll know it worked when"]];

/**
 * h, markup(src) -> fragment; enter { sofar?, now, done }; mode "full" | "now"; picture: the lesson's picture or null;
 * fold: { onToggle() } makes the picture's heading a disclosure.
 */
export function chapterCard(h, markup, enter, mode, picture, fold = null) {
  const rows = ROWS.filter(([k]) => enter[k] && (mode === "full" || k === "now"));
  const card = h("section", { class: `ix-entry ix-entry-${mode}`, "aria-label": "This chapter" },
    h("dl", { class: "ix-entry-rows" }, rows.map(([k, label]) => h("div", { class: `ix-entry-row ix-entry-${k}` },
      h("dt", { text: label }), h("dd", null, markup(enter[k]))))));
  if (picture?.rows?.length) card.append(pictureMap(h, markup, picture, fold));
  return card;
}

const CHEVRON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.75 6.5 8 9.75l3.25-3.25"/></svg>';

/** The lesson's picture as a two-column map: the everyday picture beside the real thing. */
export function pictureMap(h, markup, p, fold = null) {
  const parts = [h("span", { class: "ix-picture-k", text: "The picture" }), h("span", { class: "ix-picture-name" }, markup(p.name ?? ""))];
  const head = fold
    ? h("button", { class: "ix-picture-head ix-picture-toggle", type: "button", "aria-expanded": "true", onclick: () => fold.onToggle?.() },
      parts, h("span", { class: "ix-picture-chev", html: CHEVRON }))
    : h("div", { class: "ix-picture-head" }, parts);
  return h("div", { class: "ix-picture" }, head,
    h("dl", { class: "ix-picture-rows" }, p.rows.map((r) => h("div", { class: "ix-picture-row" },
      h("dt", null, markup(r.picture)), h("dd", null, markup(r.real))))),
    p.breaks ? h("p", { class: "ix-picture-breaks" }, h("span", { class: "ix-picture-k", text: "Where it stops matching" }), h("span", null, markup(p.breaks))) : null);
}
