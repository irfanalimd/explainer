// Level nudges (teaching.md §4): the reader's answers suggest a level, the reader decides. Two right first tries at New
// offer "I know the basics"; a wrong pick at Expert offers the step-by-step version. Never an automatic switch: one
// dismissible line, offered once per figure (a dismissal is remembered).
// Also the one way a wrong answer names the belief behind it (asks, in-world picks and the end check share it).

const NEXT = {
  new: { to: "basics", text: "You're getting these right. Switch to I know the basics?", act: "Switch" },
  expert: { to: "new", text: "Want the step-by-step version?", act: "Show it" },
};

/** ctx: { h, level (level.mjs), store ({ get, set }), key: the figure's key, icon: close svg }. */
export function createNudge({ h, level, store, key, icon }) {
  const gone = () => store.get(`nudge:${key}`) === "1";
  let rightFirst = 0, offer = null;
  const forget = () => { offer = null; store.set(`nudge:${key}`, "1"); };
  return {
    /** One answer: right or not, and whether it was the reader's first try at that question. */
    note(right, first) {
      if (offer || gone()) return;
      if (level.value === "new" && right && first && ++rightFirst >= 2) offer = "new";
      else if (level.value === "expert" && !right) offer = "expert";
    },
    /** The offer as one line (null when there is none, or the level has moved on since). */
    line() {
      if (!offer || gone() || level.value !== offer) return null;
      const n = NEXT[offer];
      const el = h("p", { class: "ix-nudge", role: "status" },
        h("span", { class: "ix-nudge-text", text: n.text }),
        h("button", { class: "ix-textbtn ix-nudge-go", type: "button", text: n.act, onclick: () => { forget(); el.remove(); level.set(n.to); } }),
        h("button", { class: "ix-btn ix-btn-sm ix-nudge-x", type: "button", "aria-label": "No thanks", "data-tip": "No thanks", html: icon,
          onclick: () => { forget(); el.remove(); } }));
      return el;
    },
  };
}

/**
 * What a wrong answer says back: the belief that picks it ("If you thought…", from lesson.misconceptions), then what
 * the run shows (the option's feedback). Either may be missing; null when both are.
 */
export function beliefBlock(h, md, lesson, misconception, feedback) {
  const m = misconception ? lesson?.misconceptions?.find((x) => x.id === misconception) : null;
  if (!m && !feedback) return null;
  const said = feedback ?? m.fix;
  return h("div", { class: "ix-predict-fb ix-belief" },
    m ? h("span", { class: "ix-predict-why-label", text: "If you thought" }) : null,
    m ? h("span", { class: "ix-belief-wrong" }, md(m.wrong)) : null,
    said ? h("span", { class: "ix-belief-said" }, md(said)) : null);
}
