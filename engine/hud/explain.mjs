// The explain panel: the one place the words live on a wide screen.
//   Wide screens (>= 1200 px): a stationary card on the right, under the toolbar and above the dock. Its top line names
//   the chapter once ("Shuffle  3 of 5"); under it the chapter's `about` line (s.phase(name, { about })), then the
//   current step's caption with its markup, then the chapter's earlier steps, newest first, each a way back to it.
//   At a chapter pause the current step becomes the chapter's recap (a check mark and "Map complete"); at the end of
//   the run it carries the payoff: the takeaway and invitations to the other scenarios. A predict question sits here
//   too, in the current step's place, so nothing floats over the world. It collapses to a small "Explain" tab
//   (remembered); while open the camera frames the world beside it (inset()) and the bottom caption steps aside.
//   Narrower screens: no side panel; the caption carries the current step, and a small button in it opens this card
//   above the dock with the chapter and its earlier steps only (never the current step a second time).
// Spoilers: the HUD tells it (ctx.veil()) which step's words to hold back while a prediction is open and which
// chapters' about lines to withhold until their predictions are revealed.
// It renders only on a step, chapter or state change, and only while it can be seen.
import { parse, toDOM, toText } from "./markup.mjs";

const SVG = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  panel: SVG('<rect x="2.25" y="2.75" width="11.5" height="10.5" rx="2.25"/><path d="M9.75 2.75v10.5"/>'),
  info: SVG('<circle cx="8" cy="8" r="6"/><path d="M8 7.25v4M8 4.75v.1"/>'),
  close: SVG('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
  up: SVG('<path d="M4.75 9.75 8 6.5l3.25 3.25"/>'),
  check: SVG('<path d="M3.5 8.4 6.5 11.25 12.5 4.75"/>'),
};
export const EXPLAIN_MIN_W = 1200;   // the side panel docks at this root width and up
const EARLIER = 5;                    // earlier steps listed before "Start of chapter"
export const VEIL = "…";              // what a held-back caption shows until its prediction is revealed
export const WITHHELD = "Explained once you have made your prediction.";

/**
 * ctx: { root, doc, h, parent, caption, bar, store, markupOpts, instant(): bool, onJump(stepIndex), onLayout(),
 *        veil(): { step, about(phaseIndex) -> bool (withhold) }, payoff(): Node | null, revealed(): bool }
 */
export function createExplain(ctx) {
  const { root, doc, h, parent, caption, bar, store, markupOpts } = ctx;
  const S = { tl: null, steps: [], phases: [], step: -1, ph: -1, shown: { step: -2, ph: -2, tl: null, sig: "" },
    mode: "", open: store.get("explain") !== "0", sheet: false, held: null, askEl: null, capOverride: null };

  const titleEl = h("h2", { class: "ix-ex-title" });
  const posEl = h("span", { class: "ix-ex-pos" });
  const headBtn = h("button", { class: "ix-btn ix-btn-sm ix-ex-hide", type: "button", onclick: () => toggle() });
  const head = h("div", { class: "ix-ex-head" });
  const nowN = h("span", { class: "ix-ex-n" });
  const nowBody = h("div", { class: "ix-ex-now-body" });
  const now = h("div", { class: "ix-ex-now" }, nowN, nowBody);
  const askSlot = h("div", { class: "ix-ex-ask" });
  const list = h("ol", { class: "ix-ex-list" });
  const earlier = h("div", { class: "ix-ex-earlier" }, h("div", { class: "ix-ex-label", text: "Earlier" }), list);
  const body = h("div", { class: "ix-ex-body" }, head, askSlot, now, earlier);
  const panel = h("aside", { class: "ix-explain ix-glass", "aria-label": "What is happening" },
    h("header", { class: "ix-ex-top" }, h("div", { class: "ix-ex-heading" }, titleEl, posEl), headBtn), body);
  const tab = h("button", { class: "ix-explain-tab ix-glass", type: "button", "aria-label": "Show the explanation", "data-kbd": "E",
    onclick: () => toggle(true) }, h("span", { html: ICON.panel }), h("span", { text: "Explain" }));
  const capBtn = h("button", { class: "ix-ex-capbtn", type: "button", "aria-label": "Explain this chapter", "aria-expanded": "false",
    onclick: () => toggle() }, h("span", { html: ICON.info }), h("span", { class: "ix-ex-capbtn-label", text: "Explain" }));
  parent.append(panel, tab);
  caption.append(capBtn);

  const hiddenByCapture = () => root.classList.contains("ix-capture") && !root.classList.contains("ix-keep-chrome");
  const visible = () => !hiddenByCapture() && (S.mode === "docked" ? S.open : S.sheet);
  /** True while the docked side panel is on screen (it then holds the step text and any prediction). */
  const docked = () => S.mode === "docked" && S.open && !hiddenByCapture();

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
  }

  // root size class from the HUD ("phone" | "compact" | "desktop") and the root size in css px
  function resize(size, W) {
    const mode = size === "desktop" && W >= EXPLAIN_MIN_W ? "docked" : "sheet";
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
    S.tl = tl; S.steps = tl?.steps ?? []; S.phases = tl?.phases ?? [];
    S.step = -1; S.ph = -1;
    S.shown.tl = null;
  }
  const phaseOf = (i) => {
    let k = 0;
    for (let j = 0; j < S.phases.length; j++) if ((S.phases[j].step ?? 0) <= i) k = j;
    return k;
  };
  /**
   * The playhead's step (called every frame, and after a recompile). Cheap when nothing changed. `caption` replaces
   * the step's own caption while it plays (a folded repeat shows its short leading clause; engine/playback.mjs).
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

  // markup with chips; inside a button (the earlier list) the entity chips are quiet, not buttons of their own
  const markup = (src) => toDOM(parse(src ?? ""), doc, markupOpts);
  const quiet = (src) => {
    const f = markup(src);
    for (const r of f.querySelectorAll?.(".ix-ref") ?? []) { r.removeAttribute("role"); r.removeAttribute("tabindex"); }
    return f;
  };
  // a soft refresh, not a show: new words fade up from 25 % in one short beat (a new node starts its animation)
  const fresh = (cls, instant) => (instant ? cls : `${cls} ix-ex-fresh`);

  // everything that decides what the panel shows besides the step: a pause, a prediction, the spoiler veil
  function stateSig() {
    const v = ctx.veil?.() ?? {};
    return `${S.held ? `${S.held.kind}:${S.held.phase}` : ""}|${S.askEl ? 1 : 0}${ctx.revealed?.() ? 1 : 0}|${v.step ?? -1}|${v.about?.(S.ph) ? 1 : 0}|${S.mode}|${S.capOverride ?? ""}`;
  }

  function render(force, animate = false) {
    if (!S.steps.length) return;
    if (S.step < 0) { S.step = 0; S.ph = phaseOf(0); }
    const tlChanged = S.shown.tl !== S.tl;
    const sig = stateSig();
    if (!force && !tlChanged && S.shown.step === S.step && S.shown.ph === S.ph && S.shown.sig === sig) return;
    const instant = (force && !animate) || tlChanged || !!ctx.instant?.();
    const ph = S.phases[S.ph] ?? { name: "", step: 0 };
    const first = ph.step ?? 0;
    const end = S.ph + 1 < S.phases.length ? S.phases[S.ph + 1].step : S.steps.length;
    const veil = ctx.veil?.() ?? {};
    const withhold = !!veil.about?.(S.ph);
    // an unnamed opening chapter (a figure's first, scene-setting step) still gets a heading
    const name = ph.name || (S.ph === 0 && S.phases.length > 1 ? "Overview" : "What is happening");
    if (tlChanged || force || S.shown.ph !== S.ph || S.shown.sig !== sig) {
      // the chapter, once: its name and where it sits ("3 of 5"); no kicker, no second copy elsewhere
      titleEl.textContent = name;
      posEl.textContent = S.phases.length > 1 ? `${S.ph + 1} of ${S.phases.length}` : "";
      posEl.hidden = S.phases.length < 2;
      const about = ph.about ? (withhold ? h("p", { class: "ix-ex-about ix-ex-withheld", text: WITHHELD }) : h("p", { class: "ix-ex-about" }, markup(ph.about))) : null;
      head.replaceChildren(...(about ? [h("div", { class: fresh("ix-ex-headin", instant) }, about)] : []));
    }
    const st = S.steps[S.step];
    const held = S.held, n = S.step - first + 1;
    const veiled = veil.step === S.step && S.step >= 0;
    now.classList.toggle("ix-ex-recap", !!held);
    if (held) {
      // a pause: the step that ended the chapter becomes its recap, with a check mark
      nowN.innerHTML = ICON.check;
      nowN.setAttribute("aria-label", held.kind === "end" ? "Run complete" : `${name} complete`);
      const label = held.kind === "end" ? (S.phases.length > 1 ? "All chapters done" : "Done") : `${name} complete`;
      nowBody.replaceChildren(h("div", { class: fresh("ix-ex-recapin", instant) },
        h("div", { class: "ix-ex-done", text: label }),
        h("p", { class: "ix-ex-text" }, markup(st?.caption ?? "")),
        held.kind === "end" ? ctx.payoff?.() : null));
    } else {
      nowN.textContent = String(n);
      nowN.setAttribute("aria-label", `Step ${n} of ${end - first} in this chapter`);
      nowBody.replaceChildren(veiled
        ? h("p", { class: "ix-ex-text ix-ex-veiled", "aria-label": "Hidden until your prediction is revealed", text: VEIL })
        : h("p", { class: fresh("ix-ex-text", instant) }, markup(S.capOverride ?? st?.caption ?? "")));
    }
    // a prediction takes the current step's place; once revealed the step's words come back under it
    now.hidden = S.mode !== "docked" || (!!S.askEl && !ctx.revealed?.());
    // earlier steps of this chapter, newest first: quiet, but with their chips, each a way back
    const items = [];
    for (let k = S.step - 1; k >= first && items.length < EARLIER; k--) {
      const m = k - first + 1;
      items.push(h("li", null, h("button", { class: "ix-ex-item", type: "button", title: `Go back to step ${m}`,
        "aria-label": `Step ${m}: ${toText(parse(S.steps[k].caption ?? ""), markupOpts.refTitle)}`, onclick: () => ctx.onJump?.(k) },
      h("span", { class: "ix-ex-n", text: String(m) }), h("span", { class: "ix-ex-t" }, quiet(S.steps[k].caption)))));
    }
    const more = S.step - first - items.length;
    if (more > 0) {
      items.push(h("li", null, h("button", { class: "ix-ex-item ix-ex-more", type: "button", title: `${more} more`, onclick: () => ctx.onJump?.(first) },
        h("span", { class: "ix-ex-n", html: ICON.up }), h("span", { class: "ix-ex-t", text: "Start of chapter" }))));
    }
    list.replaceChildren(...items);
    earlier.hidden = !items.length;
    S.shown = { step: S.step, ph: S.ph, tl: S.tl, sig };
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
    /** Re-check the veil and the prediction state (after an answer is revealed, say). */
    refresh() { if (visible()) render(false, true); },
    /** The panel's rect for tag avoidance, or null when it is not on screen. */
    rect: () => (visible() ? panel.getBoundingClientRect() : null),
    get open() { return visible(); },
    get docked() { return docked(); },
    get mode() { return S.mode; },
    /** Capture toggled: the panel follows the chrome rules, so re-render if it just appeared. */
    sync() { ctx.onDock?.(); if (visible()) render(true); },
    destroy() {
      panel.remove(); tab.remove(); capBtn.remove();
      root.classList.remove("ix-ex-docked", "ix-ex-tabbed", "ix-ex-sheet", "ix-ex-sheet-open");
    },
  };
}
