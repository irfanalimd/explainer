// The share panel: everything a reader passes on, in one place under the toolbar's "Share".
//   Link    this moment (story, step, the reader's level if they want, the knobs they changed), readable and
//           checked on the way back in (engine/embed/deeplink.mjs); the phone's own share sheet where there is one
//   Image   this frame as a PNG for a slide (still.mjs)
//   Embed   an iframe that opens at this story and step in the compact embed layout (?embed=1)
//   Teach   the printable handout (handout.mjs) and presenter mode
// Nothing leaves the page: the link is built from the address the page already has, copying uses the clipboard (or
// a selected field), and the image is made here. A page opened from file:// or inside a sandboxed frame says what
// that means for its link instead of offering one that will not open elsewhere.
import { formatMoment } from "../embed/deeplink.mjs";

let uid = 0;   // ids for the switches' names, unique across figures on one page
const SESSION = ["embed", "origin", "present", "autoplay", "gfx"];   // query keys that belong to this visit, not the link

/** The page's address without its hash and this visit's own switches; null when the page has no address to give. */
export function shareBase(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (!/^(https?|file):$/.test(u.protocol)) return null;
  for (const k of SESSION) u.searchParams.delete(k);
  u.hash = "";
  return u.href.replace(/#$/, "");
}

/** The link to a moment: base + readable hash. m: { scenario, step (0-based) | null, level | null, params } */
export function momentLink(base, m) {
  const hash = formatMoment({ scenario: m.scenario, step: m.step != null ? m.step + 1 : undefined, level: m.level ?? undefined, params: m.params ?? {} });
  return hash ? `${base}#${hash}` : base;
}

/** An iframe snippet for the moment, sized for the compact embed layout. */
export function embedSnippet(base, m, title) {
  const link = momentLink(`${base}${base.includes("?") ? "&" : "?"}embed=1`, { ...m, level: null });
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<iframe src="${esc(link)}" title="${esc(title)}" width="960" height="600" style="width:100%;max-width:960px;aspect-ratio:8/5;height:auto;border:0;border-radius:16px" loading="lazy" allow="fullscreen"></iframe>`;
}

/**
 * ctx: { h, doc, win, icons: { close, copy, image, link, code, print, present, share, check }, close(),
 *        state() -> { title, scenario, scenarioLabel, step, steps, chapter, level, levelName, params, paramText: [text], embedded },
 *        saveImage() -> Promise<string | null> (the file name saved, null when the frame could not be drawn),
 *        handout(), present(), notice(text), native: boolean (the phone's share sheet is the better first choice) }
 * Returns { el, refresh() }.
 */
export function createShare(ctx) {
  const { h, doc, win } = ctx;
  const I = ctx.icons;
  let atStep = true, withLevel = false;

  const field = (cls, rows) => (rows
    ? h("textarea", { class: `ix-share-field ${cls}`, readonly: "", rows: String(rows), spellcheck: "false", "aria-label": "Embed code", onfocus: (e) => e.target.select() })
    : h("input", { class: `ix-share-field ${cls}`, type: "text", readonly: "", spellcheck: "false", "aria-label": "Link to this moment", onfocus: (e) => e.target.select() }));
  const linkField = field("ix-share-link");
  const embedField = field("ix-share-embed", 3);
  const copyBtn = (target, word) => {
    const label = h("span", { text: word });
    const b = h("button", { class: "ix-pill ix-share-copy", type: "button", onclick: () => copy(target, b, label, word) }, h("span", { class: "ix-share-icon", html: I.copy }), label);
    return b;
  };
  const copyLink = copyBtn(linkField, "Copy");
  const copyEmbed = copyBtn(embedField, "Copy code");
  const nativeBtn = h("button", { class: "ix-pill ix-share-native", type: "button", hidden: true, onclick: () => nativeShare() }, h("span", { class: "ix-share-icon", html: I.share }), "Share…");

  const toggle = (label, get, set) => {
    // the switch is named by its line (aria-labelledby), not only by the label around it, so every reader hears it
    const id = `ix-share-opt-${++uid}`;
    const sw = h("button", { class: "ix-switch", type: "button", role: "switch", "aria-checked": String(get()), "aria-labelledby": id, onclick: () => { set(!get()); sw.setAttribute("aria-checked", String(get())); refresh(); } });
    const text = h("span", { class: "ix-share-opt-label", id });
    const row = h("label", { class: "ix-share-opt" }, text, sw);   // the label's click is the switch's
    return { row, text, sw };
  };
  const stepOpt = toggle("", () => atStep, (v) => { atStep = v; });
  const levelOpt = toggle("", () => withLevel, (v) => { withLevel = v; });
  const linkNote = h("p", { class: "ix-share-note" });
  const paramsNote = h("p", { class: "ix-share-note" });

  const imgBtn = h("button", { class: "ix-pill ix-share-save", type: "button", onclick: () => saveImage() }, h("span", { class: "ix-share-icon", html: I.image }), "Save image");
  const imgNote = h("p", { class: "ix-share-note", text: "This frame and its step's words, as a PNG for a slide." });
  const embedNote = h("p", { class: "ix-share-note" });

  const handoutBtn = h("button", { class: "ix-pill", type: "button", onclick: () => ctx.handout() }, h("span", { class: "ix-share-icon", html: I.print }), "Handout");
  const presentBtn = h("button", { class: "ix-pill ix-pill-quiet", type: "button", onclick: () => ctx.present() }, h("span", { class: "ix-share-icon", html: I.present }), "Presenter mode");
  const teachNote = h("p", { class: "ix-share-note", text: "A worksheet or a teacher guide to print, answers on their own page." });

  const section = (title, ...kids) => h("section", { class: "ix-share-sec", "aria-label": title }, h("h3", { class: "ix-share-title", text: title }), ...kids);
  const linkSec = section("Link to this moment",
    h("div", { class: "ix-share-row" }, linkField, copyLink),
    nativeBtn,
    stepOpt.row, levelOpt.row, paramsNote, linkNote);
  const imageSec = section("Image", h("div", { class: "ix-share-actions" }, imgBtn), imgNote);
  const embedSec = section("Embed on a site", embedField, h("div", { class: "ix-share-actions" }, copyEmbed), embedNote);
  const teachSec = section("Teach with it", h("div", { class: "ix-share-actions" }, handoutBtn, presentBtn), teachNote);
  const body = h("div", { class: "ix-panel-body ix-share-body" }, linkSec, imageSec, embedSec, teachSec);
  const foot = h("footer", { class: "ix-panel-foot ix-share-foot" }, h("span", { class: "ix-share-icon", html: I.lock }),
    h("span", { text: "Nothing leaves this page. Links carry only these settings, and the image is made here." }));
  const head = h("header", { class: "ix-panel-head" }, h("h2", { class: "ix-panel-title", text: "Share" }),
    h("button", { class: "ix-btn ix-btn-sm ix-close", type: "button", "aria-label": "Close share", "data-tip": "Close share", "data-kbd": "Esc", html: I.close, onclick: () => ctx.close() }));
  const el = h("section", { class: "ix-panel ix-drawer ix-share ix-glass", role: "dialog", "aria-label": "Share", tabindex: "-1", inert: true }, head, body, foot);

  let link = "";
  function refresh() {
    const s = ctx.state();
    const base = shareBase(win.location.href);
    const local = base?.startsWith("file:");
    const m = { scenario: s.scenario, step: atStep ? s.step : null, level: withLevel ? s.level : null, params: s.params };
    link = base ? momentLink(base, m) : "";
    linkField.value = link || `#${momentLink("", m).replace(/^#/, "")}`;
    stepOpt.text.textContent = s.step != null ? `Open at step ${s.step + 1} of ${s.steps}${s.chapter ? ` · ${s.chapter}` : ""}` : "Open at this step";
    levelOpt.text.textContent = `Use my level: ${s.levelName}`;
    levelOpt.row.hidden = !s.level;
    paramsNote.textContent = s.paramText.length ? `With your settings: ${s.paramText.join(", ")}.` : "";
    paramsNote.hidden = !s.paramText.length;
    linkNote.textContent = !base ? "This page has no address of its own here, so only the part after # can open this moment: add it to the page's address."
      : local ? "This page is a file on this computer, so the link opens only here. Send the file too: the part after # opens the same moment in any copy." : "";
    linkNote.hidden = !linkNote.textContent;
    nativeBtn.hidden = !(ctx.native && base && !local && typeof win.navigator?.share === "function");
    embedField.value = base && !local ? embedSnippet(base, { scenario: s.scenario, step: atStep ? s.step : null, params: s.params }, s.title) : "";
    embedSec.hidden = !base || local;
    embedNote.textContent = "Opens at this story and step, in the compact layout.";
  }

  async function copy(target, btn, label, word) {
    const text = target.value;
    let ok = false;
    try { await win.navigator.clipboard.writeText(text); ok = true; } catch { /* blocked: fall back to a selection */ }
    if (!ok) { try { target.focus(); target.select(); ok = doc.execCommand("copy"); } catch { ok = false; } }
    if (!ok) { target.focus(); target.select(); }
    label.textContent = ok ? "Copied" : /Mac|iP/.test(win.navigator.platform ?? "") ? "Press ⌘C" : "Press Ctrl+C";
    btn.classList.toggle("ix-done", ok);
    btn.querySelector(".ix-share-icon").innerHTML = ok ? I.check : I.copy;
    win.clearTimeout(btn._t);
    btn._t = win.setTimeout(() => { label.textContent = word; btn.classList.remove("ix-done"); btn.querySelector(".ix-share-icon").innerHTML = I.copy; }, 1800);
  }
  async function nativeShare() {
    const s = ctx.state();
    try { await win.navigator.share({ title: s.title, text: s.step != null ? `${s.title} · ${s.scenarioLabel} · step ${s.step + 1}` : s.title, url: link }); } catch { /* dismissed */ }
  }
  async function saveImage() {
    imgBtn.disabled = true;
    imgNote.textContent = "Drawing this frame…";
    // let the note paint before the frame is drawn again (it can take a moment without a fast GPU)
    await new Promise((ok) => win.requestAnimationFrame(() => win.setTimeout(ok, 0)));
    const name = await ctx.saveImage().catch(() => null);
    imgBtn.disabled = false;
    imgNote.textContent = name ? `Saved ${name}.` : "This browser couldn't draw the frame to an image.";
  }

  return { el, refresh, resetNotes() { imgNote.textContent = "This frame and its step's words, as a PNG for a slide."; } };
}
