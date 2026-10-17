// Two quiet playback notes, beside the words wherever they live (the explain panel when it is docked, else the caption):
//   fold: "» 4 of 11 · speeding through" while a run of repeated steps plays fast (runtime: engine/playback.mjs)
//   skip: "Skipped the setup you've already seen · Watch from the start" when a scenario starts at its fork,
//         with the skipped part of the scrubber de-emphasised until the viewer rewinds into it.
// Self-contained: it brings its own few CSS rules and only appends to elements the HUD already has.

const CSS = `
.ix-fold-line { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 20px;
  font: 500 var(--ix-fs-xs, 12px)/16px var(--ix-font-sans); color: var(--ix-ink-faint);
  font-variant-numeric: tabular-nums; pointer-events: none; white-space: nowrap;
  opacity: 0; transition: opacity var(--ix-dur-slow, 220ms) var(--ix-ease, ease); }
.ix-fold-line.ix-show { opacity: 1; }
.ix-fold-line[hidden] { display: none; }
.ix-fold-line .ix-fold-icon { display: inline-flex; color: var(--ix-ink-muted); }
.ix-fold-line .ix-fold-n { color: var(--ix-ink-muted); }
.ix-fold-line .ix-skip-text { font: 400 var(--ix-fs-xs, 12px)/16px var(--ix-font-sans); color: var(--ix-ink-muted); }
.ix[data-size="phone"] .ix-fold-line .ix-skip-long { display: none; }
.ix-fold-line .ix-skip-btn { pointer-events: auto; border: 0; padding: 0 12px; height: 24px; border-radius: 999px; cursor: pointer;
  font: 500 var(--ix-fs-xs, 12px)/24px var(--ix-font-sans); color: var(--ix-ink); background: none;
  box-shadow: inset 0 0 0 1px var(--ix-line-strong); }
.ix-fold-line .ix-skip-btn:hover { background: var(--ix-hover); }
.ix-fold-line .ix-skip-btn:focus-visible { outline: var(--ix-ring); outline-offset: 2px; }
.ix-caption > .ix-fold-line { position: absolute; left: 50%; bottom: 100%; transform: translateX(-50%); }
.ix-explain .ix-fold-line { grid-column: 2; justify-content: flex-start; margin-top: 6px; flex-wrap: wrap; row-gap: 4px; }
.ix-scrub.ix-has-skip .ix-segs, .ix-scrub.ix-has-skip .ix-ticks, .ix-scrub.ix-has-skip .ix-scrub-labels {
  -webkit-mask-image: linear-gradient(90deg, rgb(0 0 0 / 0.3) var(--ix-skip), #000 var(--ix-skip));
  mask-image: linear-gradient(90deg, rgb(0 0 0 / 0.3) var(--ix-skip), #000 var(--ix-skip)); }
.ix.ix-capture:not(.ix-keep-chrome) .ix-fold-line { display: none; }
.ix.ix-reduced .ix-fold-line { transition: none; }
`;
const FF = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5 6.5 8 3 11.5M8.5 4.5 12 8l-3.5 3.5"/></svg>';
const NOTE_MS = 9000;   // the skip note stays this long after arrival

/**
 * ctx: { root, doc, h, caption (.ix-caption), panel (.ix-explain), scrub (.ix-scrub), onRewind(), docked(): bool }
 */
export function createFold(ctx) {
  const { root, doc, h } = ctx;
  if (!doc.querySelector("style[data-ix-fold]")) {
    const st = doc.createElement("style");
    st.dataset.ixFold = "";
    st.textContent = CSS;
    doc.head.append(st);
  }
  const line = h("div", { class: "ix-fold-line", hidden: true });
  const S = { kind: "", sig: "", skipped: null, noteUntil: 0 };

  function home() {
    const now = ctx.panel?.querySelector?.(".ix-ex-now") ?? ctx.panel;
    return ctx.docked?.() && now ? now : ctx.caption;
  }
  function show(kind, sig, build) {
    const at = home();
    if (at && line.parentNode !== at) { at.append(line); line.style.left = line.style.bottom = ""; line._at = ""; }
    if (S.kind !== kind || S.sig !== sig) {
      S.kind = kind; S.sig = sig;
      line.replaceChildren(...build());
    }
    line.hidden = false;
    if (at === ctx.caption) placeOverCaption();
    // fade in next frame so the line does not pop
    if (!line.classList.contains("ix-show")) requestAnimationFrame(() => line.classList.add("ix-show"));
  }
  // over the caption's current line of text (the caption box is taller than one line and may hold the Explain button)
  function placeOverCaption() {
    const text = ctx.caption.querySelector(".ix-cap:not(.ix-leave) .ix-cap-text");
    if (!text) return;
    const cr = ctx.caption.getBoundingClientRect(), tr = text.getBoundingClientRect();
    if (!tr.width) return;
    // the text box spans the column; centre on the column, sit 6 px above the first line
    const left = Math.round((tr.left + tr.right) / 2 - cr.left), bottom = Math.round(cr.bottom - tr.top + 6);
    if (line._at !== `${left},${bottom}`) { line._at = `${left},${bottom}`; line.style.left = `${left}px`; line.style.bottom = `${bottom}px`; }
  }
  function hide() {
    if (line.hidden) return;
    S.kind = ""; S.sig = "";
    line.classList.remove("ix-show");
    line.hidden = true;
  }

  function setSkip(skipped, duration) {
    const scrub = ctx.scrub;
    if (skipped === S.skipped) return;
    const fresh = skipped && (!S.skipped || skipped.t !== S.skipped.t);
    S.skipped = skipped;
    if (fresh) S.noteUntil = performance.now() + NOTE_MS;
    if (!skipped) S.noteUntil = 0;
    if (scrub) {
      scrub.classList.toggle("ix-has-skip", !!skipped);
      if (skipped) scrub.style.setProperty("--ix-skip", `${((skipped.t / Math.max(1e-6, duration)) * 100).toFixed(2)}%`);
    }
  }

  /** Every frame: info = { fold: { index, count } | null, skipped: { t, steps } | null, duration }. Cheap when nothing changed. */
  function update(info = {}) {
    setSkip(info.skipped ?? null, info.duration ?? 1);
    if (S.skipped && performance.now() < S.noteUntil) {
      const n = S.skipped.steps;
      show("skip", String(S.skipped.t), () => [
        h("span", { class: "ix-skip-text" }, `Skipped ${n} step${n === 1 ? "" : "s"}`, h("span", { class: "ix-skip-long", text: " you've already seen" })),
        h("button", { class: "ix-skip-btn", type: "button", text: "Watch from the start", onclick: () => { S.noteUntil = 0; hide(); ctx.onRewind?.(); } }),
      ]);
      return;
    }
    const f = info.fold;
    if (f) {
      show("fold", "", () => [h("span", { class: "ix-fold-icon", html: FF }), h("span", { class: "ix-fold-n" }), h("span", { text: "speeding through repeats" })]);
      const n = line.querySelector(".ix-fold-n");
      const text = `${f.index} of ${f.count}`;
      if (n && n.textContent !== text) n.textContent = text;
      return;
    }
    hide();
  }

  return {
    el: line,
    update,
    destroy() { line.remove(); ctx.scrub?.classList.remove("ix-has-skip"); },
  };
}
