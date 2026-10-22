// One step, in layers (teaching.md §3, §4): the plain line, why it matters, a look chip that lights the step's
// entities in the world, the picture line, and the deeper fields. The level's policy (level.mjs) decides what shows;
// the reader can always open what is folded away (Why, Go deeper, More). The same builder serves the explain panel
// ("panel") and the caption on narrow screens ("caption"), which keeps to the plain line, the why and the chips.
import { deeperOf, pictureRow, sourceLink } from "./lesson.mjs";
import { citesIn } from "../scene/sources.mjs";

const SVG = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  look: SVG('<circle cx="8" cy="8" r="5.25"/><circle cx="8" cy="8" r="1.75"/>'),
  chevron: SVG('<path d="M4.75 6.5 8 9.75l3.25-3.25"/>'),
  out: SVG('<path d="M6 3.75h6.25V10M12.25 3.75 4 12"/>'),
};

/**
 * ctx: { h, markup(src) -> fragment, refTitle(id) -> title, onLook(ids | null), onChange() (re-render: the reader
 *        opened a layer), onMore() (the caption's Deeper: open the explain card) }.
 * Returns build(stepIndex, layers, { policy, lesson, veiled, plain (an override: a folded repeat's short line), where,
 * plainClass, compact (a phone caption) }).
 * The reader's choices on a step (why open, deeper open, look pinned) last while the playhead stays on it.
 */
export function createLayers(ctx) {
  const { h, markup } = ctx;
  let open = { step: -1, why: false, deeper: false };
  let pinned = null;   // the look chip a tap keeps lit (re-renders hand it to the new chip)

  function build(step, layers, o) {
    if (open.step !== step) { open = { step, why: false, deeper: false }; unpin(); }
    const P = o.policy, panel = o.where === "panel";
    const out = h("div", { class: `ix-layers ix-layers-${o.where}` });
    if (o.veiled) {
      out.append(h("p", { class: "ix-l-plain ix-l-veiled", "aria-label": "Hidden until your prediction is revealed", text: "…" }));
      return out;
    }
    out.append(h("p", { class: `ix-l-plain ${o.plainClass ?? ""}`.trim() }, markup(o.plain ?? layers.plain)));
    if (o.plain) return out;   // a repeat played at speed: its short line alone

    const why = layers.why;
    // a phone caption keeps to about five lines: a long why waits behind its chip there
    const roomy = !o.compact || String(why ?? "").length <= 110;
    const whyShown = !!why && ((roomy && (P.why === "all" || (P.why === "key" && layers.key))) || open.why);
    if (whyShown) out.append(h("p", { class: "ix-l-why" }, markup(why)));
    const row = picture(layers, o, panel && P.picture);
    if (row) out.append(row);

    const chips = [];
    const look = (layers.look ?? []).filter(Boolean);
    if (look.length && P.look !== "off") chips.push(lookChip(look, P.look === "pulse"));
    if (why && !whyShown) chips.push(h("button", { class: "ix-l-chip ix-l-whybtn", type: "button", "aria-expanded": "false",
      onclick: () => { open.why = true; ctx.onChange?.(); } }, "Why?"));
    const fields = deeperOf(layers);
    // the caption's way into the deeper layer: the peek's own More where the peek shows, else this chip (never both)
    if (!panel && fields.length && P.deeper !== "closed" && P.deeper !== "peek") {
      chips.push(h("button", { class: "ix-l-chip", type: "button", onclick: () => ctx.onMore?.() }, "Deeper", h("span", { class: "ix-l-chev", html: ICON.chevron })));
    }
    if (chips.length) out.append(h("div", { class: "ix-l-chips" }, chips));
    if (panel && fields.length) out.append(deeper(fields, P.deeper));
    else if (!panel && fields.length && P.deeper === "peek") out.append(peek(fields[0], () => ctx.onMore?.()));
    return out;
  }

  // the inline picture line, on a step that names a row of the lesson's picture
  function picture(layers, o, show) {
    const r = show ? pictureRow(o.lesson, layers.picture) : null;
    if (!r) return null;
    return h("p", { class: "ix-l-picture" }, h("span", { class: "ix-l-label", text: "Picture" }),
      h("span", null, markup(r.picture), h("span", { class: "ix-l-arrow", "aria-hidden": "true", text: " → " }), markup(r.real)));
  }

  // "Look": hover or focus lights the step's entities in the world; a tap or click keeps them lit
  function lookChip(ids, pulse) {
    const names = ids.map((id) => ctx.refTitle?.(id) ?? id).join(", ");
    const b = h("button", { class: `ix-l-chip ix-look${pulse ? " ix-look-pulse" : ""}`, type: "button", "aria-pressed": "false",
      "aria-label": `Look: light up ${names} in the world`, html: ICON.look });
    b.append(h("span", { text: "Look" }));
    if (pinned) { pinned = b; b.setAttribute("aria-pressed", "true"); }
    const on = () => ctx.onLook?.(ids), off = () => { if (pinned !== b) ctx.onLook?.(null); };
    b.addEventListener("pointerenter", (e) => { if (e.pointerType !== "touch") on(); });
    b.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") off(); });
    b.addEventListener("focus", on);
    b.addEventListener("blur", off);
    b.addEventListener("click", () => {
      if (pinned === b) { unpin(); return; }
      unpin();
      pinned = b; b.setAttribute("aria-pressed", "true"); on();
    });
    return b;
  }
  function unpin() {
    if (!pinned) return;
    pinned.setAttribute("aria-pressed", "false");
    pinned = null;
    ctx.onLook?.(null);
  }

  // Go deeper: closed (a disclosure), a one-line peek with More, or every field open
  function deeper(fields, mode) {
    const isOpen = mode === "open" || open.deeper;
    const box = h("div", { class: "ix-deeper" });
    if (mode === "peek" && !isOpen) {
      box.append(peek(fields[0], () => { open.deeper = true; ctx.onChange?.(); }));
      return box;
    }
    const list = h("dl", { class: "ix-deeper-list" }, fields.map((f) => h("div", { class: `ix-deeper-row ix-deeper-${f.name}` },
      h("dt", { text: f.label }), h("dd", null, value(f)))));
    if (mode === "open") { box.append(list); box.classList.add("ix-deeper-open"); return box; }
    const btn = h("button", { class: "ix-deeper-btn", type: "button", "aria-expanded": String(isOpen),
      onclick: () => { open.deeper = !open.deeper; ctx.onChange?.(); } }, h("span", { text: "Go deeper" }), h("span", { class: "ix-l-chev", html: ICON.chevron }));
    box.append(btn);
    if (isOpen) { box.append(list); box.classList.add("ix-deeper-open"); }
    return box;
  }
  function peek(f, more) {
    return h("div", { class: "ix-peek" }, h("span", { class: "ix-l-label", text: f.label }),
      h("span", { class: "ix-peek-text" }, f.name === "source" && !citesIn(f.text).length ? sourceLink(f.text)?.label ?? f.text : markup(f.text)),
      h("button", { class: "ix-peek-more", type: "button", onclick: more }, "More"));
  }
  function value(f) {
    // a source written as a citation ("[dean2004] §3.6") is a linked short reference, with the outward arrow
    if (f.name === "source" && citesIn(f.text).length) {
      const frag = markup(f.text);
      for (const a of frag.querySelectorAll?.("a.ix-cite") ?? []) a.append(h("span", { class: "ix-source-icon", "aria-hidden": "true", html: ICON.out }));
      return frag;
    }
    if (f.name === "source") {
      const s = sourceLink(f.text);
      if (s) return h("a", { class: "ix-source", href: s.url, target: "_blank", rel: "noopener" }, s.label, h("span", { class: "ix-source-icon", html: ICON.out }));
    }
    if (f.name === "code") return h("span", { class: "ix-deeper-code" }, markup(f.text));
    return markup(f.text);
  }

  return { build, unpin };
}
