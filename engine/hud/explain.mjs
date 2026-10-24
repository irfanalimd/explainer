// The explain panel: the teacher, and the one place the words live on a wide screen.
//   Wide screens (>= 1200 px): a stationary card on the right, under the toolbar and above the dock. Its header holds
//   the progress map (a dot per chapter, the current one ringed, each a way to jump), the chapter's name, the lesson's
//   goal and the level switch (level.mjs). Under it: the chapter's about line, the chapter entry card on its first step
//   (chapter-card.mjs), the current step in layers (layers.mjs), then the chapter's earlier steps, newest first, each a
//   way back, folded to one line ("Earlier: 4 steps") so the current step is the one thing to read (the reader's
//   choice to open them is remembered). At a chapter pause the current step becomes the chapter's recap; at the end of the run it carries the
//   payoff. A predict question sits here too, in the current step's place. It collapses to a small "Explain" tab
//   (remembered); while open the camera frames the world beside it (inset()) and the bottom caption steps aside.
//   Narrower screens: no side panel; the caption carries the current step, and its Explain button opens this card above
//   the dock with the chapter, what the caption leaves out (new words, the deeper layer, the picture) and the earlier
//   steps, always open there (never the step a second time).
// The level decides what shows (level.mjs POLICY); it never changes the facts.
// Spoilers: the HUD tells it (ctx.veil()) which step's words to hold back while a prediction is open and which
// chapters' about lines to withhold until their predictions are revealed.
// Glossary: the first time the run uses a {term:…}, the panel prints its definition under those words while the
// playhead is on that step; later uses keep only the tooltip. At New the plain word leads ("a box, called a node").
// Calm: while a question is open only the question speaks (a one-line about, no definitions, no entry card, no
// Earlier, no current step until the reveal). If the card still does not fit, fit() drops what is left in order so the
// question, its options and its why never need scrolling (last of all the header's goal and level switch step aside); without a question it drops the picture line, the entry
// card's outer lines, then the why, before the current step would need scrolling.
// It renders only on a step, chapter, level or state change, and only while it can be seen.
import { parse, toText } from "./markup.mjs";
import { layersOf, lessonOf, enterOf, deeperOf } from "./lesson.mjs";
import { createLayers } from "./layers.mjs";
import { createProgress } from "./progress.mjs";
import { detourOf } from "./turn.mjs";
import { chapterCard, pictureMap } from "./chapter-card.mjs";

const SVG = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  panel: SVG('<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2.25"/><path d="M9.75 2.75v10.5"/>'),
  info: SVG('<circle cx="8" cy="8" r="6"/><path d="M8 7.25v4M8 4.75v.1"/>'),
  close: SVG('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
  up: SVG('<path d="M4.75 9.75 8 6.5l3.25 3.25"/>'),
  check: SVG('<path d="M3.5 8.4 6.5 11.25 12.5 4.75"/>'),
  chevron: SVG('<path d="M4.75 6.5 8 9.75l3.25-3.25"/>'),
};
export const EXPLAIN_MIN_W = 1200;   // the side panel docks at this root width and up
const EARLIER = 5;                    // earlier steps listed before "Start of chapter"
let uid = 0;
export const VEIL = "…";              // what a held-back caption shows until its prediction is revealed
// the chapter's about, withheld until its prediction is revealed: before the question opens it says one is coming (the
// reader has not been asked anything yet); while it is open, where the summary will be
export const WITHHELD = "A question about this chapter is coming up. Its summary appears once you have answered, so it can't give the answer away.";
export const WITHHELD_ASK = "This chapter's summary appears once you have answered.";

/** The glossary terms a piece of markup uses, in order, without repeats. */
export function termsIn(src) {
  const out = [];
  const walk = (nodes) => { for (const n of nodes) { if (n.type === "term" && !out.includes(n.name)) out.push(n.name); else if (n.type === "bold") walk(n.children); } };
  walk(parse(src ?? ""));
  return out;
}
/** The words a step says at once: its plain layer and its why (the caption without a lesson). */
export const stepText = (st) => { const l = layersOf(st); return l.why ? `${l.plain} ${l.why}` : l.plain; };
/**
 * Where each term is first used, in reading order (a chapter's about, then its steps): name -> { step, about }.
 * steps: [{ caption, layers? }], phases: [{ step, about }].
 */
export function firstUses(steps = [], phases = []) {
  const first = new Map();
  for (let i = 0; i < steps.length; i++) {
    for (const ph of phases) if ((ph.step ?? 0) === i && ph.about) for (const t of termsIn(ph.about)) if (!first.has(t)) first.set(t, { step: i, about: true });
    for (const t of termsIn(stepText(steps[i]))) if (!first.has(t)) first.set(t, { step: i, about: false });
  }
  return first;
}
/** The first sentence of a piece of markup (Expert reads the about this short), or null when it is one sentence. */
export function firstSentence(src) {
  const parts = String(src ?? "").split(/(?<=[.!?])\s+(?=[A-Z{`])/);
  return parts.length > 1 ? parts[0] : null;
}

/**
 * ctx: { root, doc, h, parent, caption, bar, store, markupOpts, markup(src) -> fragment, level (level.mjs),
 *        term(name) -> { lead, def } | null, instant(): bool, onJump(stepIndex), onLook(ids | null), onLayout(), onDock(),
 *        veil(): { step, about(phaseIndex) -> bool (withhold) }, payoff(): Node | null, recap(): Node | null, revealed(): bool }
 */
export function createExplain(ctx) {
  const { root, doc, h, parent, caption, bar, store, markupOpts, markup } = ctx;
  const S = { tl: null, main: null, detour: null, lesson: null, steps: [], phases: [], first: new Map(), step: -1, ph: -1,
    shown: { step: -2, ph: -2, tl: null, sig: "" }, mode: "", size: "", open: store.get("explain") !== "0", sheet: false,
    earlierOpen: store.get("earlier") === "1",
    held: null, askEl: null, capOverride: null, aboutDefs: null, aboutFirst: -1, aboutOpen: false, pictureOpen: false,
    mapOpen: null };   // the entry card's picture: null lets fit() fold it, true / false is the reader's choice

  // on a detour (a wrong pick's branch) the map is the main run's: its chapters, the reader still in the pick's
  const mapPhases = () => S.detour?.main.phases ?? S.phases;
  const progress = createProgress({ h, onJump: (k) => ctx.onJump?.(mapPhases()[k]?.step ?? 0) });
  const layers = createLayers({ h, markup, refTitle: markupOpts.refTitle, onLook: (ids) => ctx.onLook?.(ids),
    onChange: () => { if (visible()) render(true); } });

  const titleEl = h("h2", { class: "ix-ex-title" });
  const goalEl = h("p", { class: "ix-ex-goal" });
  const levelEl = h("div", { class: "ix-ex-level" });
  const headBtn = h("button", { class: "ix-btn ix-ex-hide", type: "button", onclick: () => toggle() });
  const head = h("div", { class: "ix-ex-head" });
  const entry = h("div", { class: "ix-ex-entry" });
  const nowN = h("span", { class: "ix-ex-n" });
  const nowBody = h("div", { class: "ix-ex-now-body" });
  const now = h("div", { class: "ix-ex-now" }, nowN, nowBody);
  const askSlot = h("div", { class: "ix-ex-ask" });
  // narrow screens: the card never repeats the current step, but carries what the caption leaves out
  const extra = h("div", { class: "ix-ex-extra" });
  const list = h("ol", { class: "ix-ex-list", id: `ix-ex-list-${++uid}` });
  // docked, the earlier steps fold to this one line; the sheet keeps its plain label (the reader opened it to see them)
  const earlierCount = h("span", { class: "ix-ex-earlier-count" });
  const earlierBtn = h("button", { class: "ix-ex-earlier-btn", type: "button", "aria-expanded": "false", "aria-controls": list.id,
    onclick: () => { S.earlierOpen = !S.earlierOpen; store.set("earlier", S.earlierOpen ? "1" : "0"); syncEarlier(); fit(); } },
  h("span", { class: "ix-ex-label", text: "Earlier" }), earlierCount, h("span", { class: "ix-ex-earlier-chev", html: ICON.chevron }));
  const earlier = h("div", { class: "ix-ex-earlier" }, h("div", { class: "ix-ex-label ix-ex-earlier-k", text: "Earlier" }), earlierBtn, list);
  const body = h("div", { class: "ix-ex-body" }, head, entry, askSlot, now, extra, earlier);
  const panel = h("aside", { class: "ix-explain ix-glass", "aria-label": "What is happening" },
    h("header", { class: "ix-ex-top" }, h("div", { class: "ix-ex-bar" }, progress.el, headBtn), titleEl, goalEl, levelEl),
    body);
  const tab = h("button", { class: "ix-explain-tab ix-glass", type: "button", "aria-label": "Show the explanation", "data-kbd": "E",
    onclick: () => toggle(true) }, h("span", { html: ICON.panel }), h("span", { text: "Explain" }));
  const capBtn = h("button", { class: "ix-ex-capbtn", type: "button", "aria-label": "Explain this chapter", "aria-expanded": "false",
    onclick: () => toggle() }, h("span", { html: ICON.info }), h("span", { class: "ix-ex-capbtn-label", text: "Explain" }));
  // reading and Tab order: the teacher comes right after the header (title, scenarios, toolbar), before the
  // parameters, the world and the dock, as the eye meets it beside the world
  const head0 = parent.querySelector(":scope > .ix-top");
  if (head0) head0.after(panel, tab); else parent.append(panel, tab);
  caption.append(capBtn);

  const hiddenByCapture = () => root.classList.contains("ix-capture") && !root.classList.contains("ix-keep-chrome");
  const visible = () => !hiddenByCapture() && (S.mode === "docked" ? S.open : S.sheet);
  /** True while the docked side panel is on screen (it then holds the step text and any prediction). */
  const docked = () => S.mode === "docked" && S.open && !hiddenByCapture();
  const policy = () => ctx.level.policy;

  function syncClasses() {
    const dk = S.mode === "docked";
    root.classList.toggle("ix-ex-docked", dk && S.open);
    root.classList.toggle("ix-ex-tabbed", dk && !S.open);
    root.classList.toggle("ix-ex-sheet", !dk);
    root.classList.toggle("ix-ex-sheet-open", !dk && S.sheet);
    capBtn.setAttribute("aria-expanded", String(!dk && S.sheet));
    headBtn.innerHTML = dk ? ICON.panel : ICON.close;
    headBtn.setAttribute("aria-label", dk ? "Hide the explanation" : "Close the explanation");
    headBtn.dataset.tip = dk ? "Hide" : "Close";
    headBtn.dataset.kbd = dk ? "E" : "Esc";
    syncEarlier();
  }

  // root size class from the HUD ("phone" | "compact" | "desktop") and the root size in css px
  function resize(size, W) {
    const mode = size === "desktop" && W >= EXPLAIN_MIN_W ? "docked" : "sheet";
    S.size = size;
    if (mode !== S.mode) { S.mode = mode; S.sheet = false; syncClasses(); ctx.onDock?.(); }
    if (bar && bar.isConnected) {
      const rr = root.getBoundingClientRect(), br = bar.getBoundingClientRect();
      if (br.height > 0) root.style.setProperty("--ix-ex-bottom", `${Math.round(rr.bottom - br.top + 12)}px`);
    }
    if (visible()) render(true);
  }

  /** Toggle the docked panel (remembered) or the sheet. Returns the new open state. */
  function toggle(open) {
    if (S.mode === "docked") {
      const next = open ?? !S.open;
      if (next === S.open) return next;
      S.open = next;
      store.set("explain", next ? "1" : "0");
    } else {
      const next = open ?? !S.sheet;
      if (next === S.sheet) return next;
      S.sheet = next;
    }
    syncClasses();
    if (S.mode === "docked") ctx.onDock?.();
    if (visible()) render(true);
    else layers.unpin();
    ctx.onLayout?.();
    // keep the keyboard where the reader is: into the card when it opens from its control, back when it closes
    const active = doc.activeElement;
    if (!visible() && panel.contains(active)) (S.mode === "docked" ? tab : capBtn).focus({ preventScroll: true });
    else if (visible() && (active === tab)) headBtn.focus({ preventScroll: true });
    return S.mode === "docked" ? S.open : S.sheet;
  }
  /** Esc: close the sheet if it is open. The docked panel is not an overlay, so Esc leaves it alone. */
  function closeSheet() {
    if (S.mode === "docked" || !S.sheet) return false;
    toggle(false);
    capBtn.focus({ preventScroll: true });
    return true;
  }

  function setTimeline(tl) {
    if (!tl?.branch) S.main = tl;
    S.detour = detourOf(tl, S.main);
    S.tl = tl; S.steps = tl?.steps ?? []; S.phases = tl?.phases ?? [];
    S.lesson = lessonOf(tl);
    S.first = firstUses(S.steps, S.phases);
    S.step = -1; S.ph = -1;
    S.shown.tl = null;
    if (S.lesson && !levelEl.firstChild) levelEl.append(ctx.level.control(h, { cls: "ix-ex-levels" }));
    levelEl.hidden = !S.lesson;
  }
  const phaseOf = (i) => {
    let k = 0;
    for (let j = 0; j < S.phases.length; j++) if ((S.phases[j].step ?? 0) <= i) k = j;
    return k;
  };
  /**
   * The playhead's step (called every frame, and after a recompile). Cheap when nothing changed. `caption` replaces
   * the step's plain line while it plays (a folded repeat shows its short leading clause; engine/playback.mjs).
   */
  function step(i, caption = null) {
    if (!S.steps.length) return;
    i = Math.max(0, Math.min(S.steps.length - 1, i | 0));
    const cap = caption ?? null;
    if (i === S.step && S.shown.tl === S.tl && cap === S.capOverride) return;
    S.capOverride = cap;
    S.step = i;
    S.ph = phaseOf(i);
    if (visible()) render(false);
  }

  // inside a button (the earlier list) the chips are quiet, not buttons of their own
  const quiet = (src) => {
    const f = markup(src);
    for (const r of f.querySelectorAll?.(".ix-ref, .ix-term") ?? []) { r.removeAttribute("role"); r.removeAttribute("tabindex"); }
    return f;
  };
  // the definitions of the terms these words use for the first time in the run (where = { step, about })
  const defs = (src, where) => {
    const items = [];
    const lead = policy().why === "all";   // New: the plain word first ("a box, called a node")
    for (const name of termsIn(src)) {
      const f = S.first.get(name), t = ctx.term?.(name);
      if (!t || !f || f.step !== where.step || f.about !== where.about) continue;
      items.push(h("div", { class: "ix-ex-def" }, h("dt", { text: lead && t.lead ? `${t.lead}, called ${name}` : name }), h("dd", { text: t.def })));
    }
    return items.length ? h("dl", { class: "ix-ex-defs", "aria-label": "New words" }, items) : null;
  };
  // a soft refresh, not a show: new words fade up in one short beat
  const fresh = (cls, instant) => (instant ? cls : `${cls} ix-ex-fresh`);

  // everything that decides what the panel shows besides the step: a pause, a prediction, the veil, the level
  function stateSig() {
    const v = ctx.veil?.() ?? {};
    return `${S.held ? `${S.held.kind}:${S.held.phase}` : ""}|${S.askEl ? 1 : 0}${ctx.revealed?.() ? 1 : 0}|${v.step ?? -1}|${v.about?.(S.ph) ? 1 : 0}|${S.mode}|${S.size}|${S.capOverride ?? ""}|${ctx.level.value}`;
  }

  const chapterName = (k) => S.phases[k]?.name || (k === 0 && S.phases.length > 1 ? "Overview" : "What is happening");

  function renderHeader(withhold, instant) {
    const P = policy(), ph = S.phases[S.ph] ?? { name: "", step: 0 }, first = ph.step ?? 0;
    const goal = S.lesson?.goal ?? "";
    titleEl.textContent = chapterName(S.ph);
    progress.set(mapPhases(), S.detour?.phase ?? S.ph, { goal: P.goal ? "" : toText(parse(goal)), compact: S.size === "phone", detour: !!S.detour });
    goalEl.replaceChildren(...(goal && P.goal ? [h("span", { class: "ix-ex-goal-k", text: "Goal" }), markup(goal)] : []));
    goalEl.hidden = !(goal && P.goal);
    // the about: the chapter in a sentence or two; Expert reads the first sentence, with More
    const short = P.about === "first" ? firstSentence(ph.about) : null;
    const clamp = !!S.askEl && !!ph.about && !withhold;
    const text = short && !S.aboutOpen && !clamp ? short : ph.about;
    const about = ph.about ? (withhold ? h("p", { class: "ix-ex-about ix-ex-withheld", text: S.askEl ? WITHHELD_ASK : WITHHELD }) : h("p", { class: "ix-ex-about" }, markup(text))) : null;
    const aboutDefs = ph.about && !withhold ? defs(ph.about, { step: first, about: true }) : null;
    if (S.askEl && withhold) about?.classList.add("ix-ex-oneline");
    const expand = !!short && !clamp && !withhold;
    const more = clamp || expand ? h("button", { class: "ix-ex-aboutbtn", type: "button", "aria-expanded": String(S.aboutOpen),
      text: S.aboutOpen ? "Less" : "More", onclick: () => { S.aboutOpen = !S.aboutOpen; if (expand) render(true); else { syncAbout(); fit(); } } }) : null;
    head.replaceChildren(...(about ? [h("div", { class: fresh(clamp ? "ix-ex-headin ix-ex-clamp" : "ix-ex-headin", instant) },
      more ? h("div", { class: "ix-ex-aboutrow" }, about, more) : about, aboutDefs)] : []));
    S.aboutDefs = aboutDefs; S.aboutFirst = first; S.aboutMore = clamp ? more : null;
    syncAbout();
  }

  function render(force, animate = false) {
    if (!S.steps.length) return;
    if (S.step < 0) { S.step = 0; S.ph = phaseOf(0); }
    const tlChanged = S.shown.tl !== S.tl;
    const sig = stateSig();
    if (!force && !tlChanged && S.shown.step === S.step && S.shown.ph === S.ph && S.shown.sig === sig) return;
    if (S.shown.ph !== S.ph) { S.aboutOpen = false; S.mapOpen = null; }
    const instant = (force && !animate) || tlChanged || !!ctx.instant?.();
    const P = policy();
    const ph = S.phases[S.ph] ?? { name: "", step: 0 };
    const first = ph.step ?? 0;
    const end = S.ph + 1 < S.phases.length ? S.phases[S.ph + 1].step : S.steps.length;
    const veil = ctx.veil?.() ?? {};
    const withhold = !!veil.about?.(S.ph);
    const sheet = S.mode !== "docked";
    if (tlChanged || force || S.shown.ph !== S.ph || S.shown.sig !== sig) renderHeader(withhold, instant);
    // the about's new words are defined on the chapter's first step only, and never beside an open question
    if (S.aboutDefs) S.aboutDefs.hidden = S.step !== S.aboutFirst || !!S.askEl;

    // the chapter entry card: on its first step, never beside a question or at a pause (the sheet shows it in full)
    const enter = enterOf(ph);
    const entryMode = P.entry === "off" ? null : sheet ? "full" : P.entry;
    const showEntry = !!enter && !!entryMode && S.step === first && !S.askEl && !S.held;
    const fold = sheet ? null : { onToggle: () => { S.mapOpen = panel.classList.contains("ix-ex-fit-picmap"); fit(); } };
    entry.replaceChildren(...(showEntry ? [chapterCard(h, markup, enter, entryMode, enter.picture ? S.lesson?.picture : null, fold)] : []));
    // New: the card speaks for the chapter on its first step, so the about waits a step
    head.classList.toggle("ix-ex-quiet", showEntry && P.entry === "full" && !sheet);

    const st = S.steps[S.step];
    const held = S.held, n = S.step - first + 1;
    const veiled = veil.step === S.step && S.step >= 0;
    now.classList.toggle("ix-ex-recap", !!held);
    // narrow screens: the caption carries the end's takeaway, so the card adds only the recap (never the step again)
    const sheetRecap = held?.kind === "end" && sheet ? ctx.recap?.() ?? null : null;
    extra.replaceChildren();
    if (sheetRecap) {
      nowN.innerHTML = ICON.check;
      nowN.setAttribute("aria-label", "Run complete");
      nowBody.replaceChildren(h("div", { class: fresh("ix-ex-recapin", instant) },
        h("div", { class: "ix-ex-done", text: S.phases.length > 1 ? "All chapters done" : "Done" }), sheetRecap));
    } else if (held) {
      // a pause: the step that ended the chapter becomes its recap, with a check mark
      nowN.innerHTML = ICON.check;
      nowN.setAttribute("aria-label", held.kind === "end" ? "Run complete" : `${chapterName(S.ph)} complete`);
      const label = held.kind === "end" ? (S.phases.length > 1 ? "All chapters done" : "Done") : `${chapterName(S.ph)} complete`;
      nowBody.replaceChildren(h("div", { class: fresh("ix-ex-recapin", instant) },
        h("div", { class: "ix-ex-done", text: label }),
        h("p", { class: "ix-l-plain" }, markup(layersOf(st).plain)),
        held.kind === "end" ? ctx.payoff?.() : null));
    } else {
      nowN.textContent = String(n);
      nowN.setAttribute("aria-label", `Step ${n} of ${end - first} in this chapter`);
      const L = layersOf(st);
      // a step under an open question keeps its new words in their tooltips: no block under the card
      const stepDefs = veiled || S.askEl ? null : defs(stepText(st), { step: S.step, about: false });
      if (sheet) extra.append(...sheetExtras(L, stepDefs));
      else {
        const block = layers.build(S.step, L, { policy: P, lesson: S.lesson, veiled, plain: S.capOverride, where: "panel" });
        if (!instant) block.classList.add("ix-ex-fresh");
        nowBody.replaceChildren(block, ...(stepDefs ? [stepDefs] : []));
      }
    }
    // a prediction takes the current step's place; once revealed the step's words come back under it
    now.hidden = (sheet && !sheetRecap) || (!!S.askEl && !ctx.revealed?.());
    // earlier steps of this chapter, newest first: quiet, but with their chips, each a way back
    const items = [];
    for (let k = S.step - 1; k >= first && items.length < EARLIER; k--) {
      const m = k - first + 1, plain = layersOf(S.steps[k]).plain;
      items.push(h("li", null, h("button", { class: "ix-ex-item", type: "button", title: `Go back to step ${m}`,
        "aria-label": `Step ${m}: ${toText(parse(plain), markupOpts)}`, onclick: () => ctx.onJump?.(k) },
      h("span", { class: "ix-ex-n", text: String(m) }), h("span", { class: "ix-ex-t" }, quiet(plain)))));
    }
    const more = S.step - first - items.length;
    if (more > 0) {
      items.push(h("li", null, h("button", { class: "ix-ex-item ix-ex-more", type: "button", title: `${more} more`, onclick: () => ctx.onJump?.(first) },
        h("span", { class: "ix-ex-n", html: ICON.up }), h("span", { class: "ix-ex-t", text: "Start of chapter" }))));
    }
    list.replaceChildren(...items);
    const before = S.step - first;
    earlierCount.textContent = `${before} ${before === 1 ? "step" : "steps"}`;
    earlierBtn.setAttribute("aria-label", `Earlier in this chapter: ${before} ${before === 1 ? "step" : "steps"}`);
    syncEarlier();
    // an open question hides the way back: nothing below the card but the step it asks about
    earlier.hidden = !items.length || !!S.askEl;
    S.shown = { step: S.step, ph: S.ph, tl: S.tl, sig };
    fit();
  }

  // narrow screens: what the caption leaves out for this step: its new words, its deeper layer, the picture
  function sheetExtras(L, stepDefs) {
    if (S.held || S.askEl) return [];
    const out = [];
    if (stepDefs) out.push(stepDefs);
    const fields = deeperOf(L);
    if (fields.length) {
      const block = layers.build(S.step, { plain: "", deeper: L.deeper }, { policy: { ...policy(), picture: false }, lesson: S.lesson, where: "panel" });
      block.querySelector(".ix-l-plain")?.remove();
      out.push(block);
    }
    const pic = S.lesson?.picture;
    if (pic?.rows?.length) {
      const btn = h("button", { class: "ix-deeper-btn", type: "button", "aria-expanded": String(S.pictureOpen),
        onclick: () => { S.pictureOpen = !S.pictureOpen; render(true); } }, h("span", { text: "The picture" }), h("span", { class: "ix-l-chev", html: ICON.chevron }));
      out.push(h("div", { class: `ix-deeper ix-ex-picture${S.pictureOpen ? " ix-deeper-open" : ""}` }, btn, S.pictureOpen ? pictureMap(h, markup, pic) : null));
    }
    return out;
  }

  // folded (docked, until the reader opens it) the list leaves the layout; the sheet always shows it
  function syncEarlier() {
    const open = S.earlierOpen || S.mode !== "docked";
    list.hidden = !open;
    earlier.classList.toggle("ix-ex-earlier-open", open);
    earlierBtn.setAttribute("aria-expanded", String(open));
  }
  // the clamped about: "More" only when the line is cut, "Less" once it is open
  function syncAbout() {
    const btn = S.aboutMore, row = btn?.parentNode;
    if (!btn || !row?.isConnected) return;
    row.parentNode.classList.toggle("ix-ex-expanded", S.aboutOpen);
    btn.textContent = S.aboutOpen ? "Less" : "More";
    btn.setAttribute("aria-expanded", String(S.aboutOpen));
    btn.setAttribute("aria-label", S.aboutOpen ? "Show less of the chapter's introduction" : "Show the chapter's whole introduction");
    const p = row.firstChild;
    btn.hidden = !S.aboutOpen && p.scrollWidth <= p.clientWidth + 1;
  }
  // The backstop. While a question is open in the panel, the card (question, options, why) must fit without scrolling:
  // drop, in order, definitions, the about, Earlier, a tighter card, then the header's goal and level switch (the end
  // check's "You can now…" lists every objective, so it can need the whole panel). Otherwise the current step must fit: drop
  // definitions, the picture line, the entry card's So far and Done lines (Now stays), then the why.
  const FIT_ASK = ["ix-ex-fit-defs", "ix-ex-fit-about", "ix-ex-fit-earlier", "ix-ex-fit-tight", "ix-ex-fit-top"];
  // (the entry card's picture folds to its heading before the card's outer lines go, so it is never lost from view)
  const FIT_STEP = ["ix-ex-fit-defs", "ix-ex-fit-picture", "ix-ex-fit-picmap", "ix-ex-fit-entry", "ix-ex-fit-why"];
  function fit() {
    panel.classList.remove(...FIT_ASK, ...FIT_STEP);
    if (S.mapOpen === false) panel.classList.add("ix-ex-fit-picmap");
    syncMap();
    if (!docked() || !body.clientHeight) return;
    const target = S.askEl ? askSlot : now;
    if (!target.isConnected || target.hidden) return;
    body.scrollTop = 0;
    // layout boxes (offsets), not rects: the card's rise animation must not count
    const over = () => target.offsetTop - body.offsetTop + target.offsetHeight > body.clientHeight + 0.5;
    for (const cls of S.askEl ? FIT_ASK : FIT_STEP) {
      if (!over()) break;
      // the reader asked for the whole about ("More"): keep it, and let the panel scroll for once
      if (cls === "ix-ex-fit-about" && S.aboutOpen) continue;
      if (cls === "ix-ex-fit-picmap" && S.mapOpen === true) continue;   // the reader opened it: keep it, and scroll
      panel.classList.add(cls);
    }
    syncMap();
  }
  // the picture's disclosure says whether its rows are showing
  function syncMap() {
    const open = !panel.classList.contains("ix-ex-fit-picmap");
    for (const b of entry.querySelectorAll(".ix-picture-toggle")) {
      b.setAttribute("aria-expanded", String(open));
      b.setAttribute("aria-label", `The picture: ${b.querySelector(".ix-picture-name")?.textContent ?? ""}. ${open ? "Hide" : "Show"} the table`);
    }
  }

  /** A pause ({ kind: "chapter" | "end", phase }) or null; the panel shows the recap or the payoff. */
  function setHeld(v) {
    const a = S.held ? `${S.held.kind}:${S.held.phase}` : "", b = v ? `${v.kind}:${v.phase}` : "";
    if (a === b) return;
    S.held = v ? { kind: v.kind, phase: v.phase } : null;
    if (visible()) render(false, true);
  }
  /** Host the predict card in the current step's place (docked only), or give it back (null). */
  function hostAsk(el) {
    if (el && docked()) {
      if (S.askEl !== el || el.parentNode !== askSlot) { S.askEl = el; askSlot.replaceChildren(el); body.scrollTop = 0; }
    } else if (S.askEl) {
      S.askEl = null;
      askSlot.replaceChildren();
    }
    if (visible()) render(false, true);
    fit();   // the card's content may have changed with nothing else (the end check's questions, then "You can now…")
    return !!S.askEl;
  }

  /** Width of the root the docked panel covers, from the right edge, for hud.insets.right. */
  function inset() {
    if (S.mode !== "docked" || !S.open || hiddenByCapture() || !panel.isConnected) return 0;
    // layout boxes, not the transformed rect: the opening slide must not nudge the camera
    if (!panel.offsetWidth) return 0;
    return Math.max(0, Math.round(root.clientWidth - panel.offsetLeft));
  }

  syncClasses();
  return {
    panel, tab, capBtn,
    setTimeline, step, resize, toggle, closeSheet, inset, setHeld, hostAsk,
    /** Its room changed (the parameters card under it folded or opened): fit again. */
    fit: () => fit(),
    /** Re-render: after an answer is revealed, or (force) a level change. */
    refresh(force = false) { if (visible()) render(force, true); },
    /** The panel's rect for tag avoidance, or null when it is not on screen. */
    rect: () => (visible() ? panel.getBoundingClientRect() : null),
    get open() { return visible(); },
    get docked() { return docked(); },
    get mode() { return S.mode; },
    /** Capture toggled: the panel follows the chrome rules, so re-render if it just appeared. */
    sync() { ctx.onDock?.(); if (visible()) render(true); },
    destroy() {
      layers.unpin();
      panel.remove(); tab.remove(); capBtn.remove();
      root.classList.remove("ix-ex-docked", "ix-ex-tabbed", "ix-ex-sheet", "ix-ex-sheet-open");
    },
  };
}
