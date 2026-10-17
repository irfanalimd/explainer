// Presenter mode (DESIGN.md 9.6): teaching from a projector. `?present=1`, the P key, or Settings turn it on.
//   - big type: the HUD's five type sizes step up, so the caption and the explain panel read from the back of the room
//   - high contrast: darker inks, stronger hairlines and opaque surfaces over the theme's own tokens (light by default)
//   - a clicker works: → Page Down and Space go on (the next step, or Continue at a pause); ← and Page Up go back
//   - minimal chrome: no speed, legend, code or help circle; the parameters lead the drawer (S) and L cycles the level
//   - the presenter view (presenter-view.mjs): the explain panel and the next step's words on the laptop, in a second
//     window this page writes into, while the projector keeps the world and a large caption
// The HUD owns the state and the actions; this module owns the look, the keys and the second window's lifecycle.
import { openPresenterView } from "./presenter-view.mjs";

/** Whether the page asks for presenter mode (?present=1; "0", "false" and "no" leave it off). */
export function presentQuery(search) {
  let v = null;
  try { v = new URLSearchParams(search ?? "").get("present"); } catch { /* none */ }
  return v != null && !/^(0|false|no)$/i.test(v);
}

// size / line in px: one step up the scale for each token (the projector's xs is the screen's sm, and so on)
const TYPE = { xs: [15, 20], sm: [17, 26], md: [22, 32], lg: [30, 38], xl: [40, 48] };
// the theme's inks, hairlines and surfaces pushed toward full contrast (CSS custom properties, as theme.mjs names them)
const CONTRAST = {
  light: { ink: "0 0 0", "ink-muted": "34 36 41", "ink-faint": "66 69 76", "ink-4": "138 141 148", surface: "255 255 255 / 0.985",
    line: "0 0 0 / 0.16", "line-strong": "0 0 0 / 0.3", primary: "0 0 0" },
  dark: { ink: "255 255 255", "ink-muted": "222 224 228", "ink-faint": "184 187 194", "ink-4": "112 115 122", surface: "12 12 14 / 0.97",
    line: "255 255 255 / 0.18", "line-strong": "255 255 255 / 0.32", primary: "255 255 255" },
};

/** The CSS custom properties presenter mode lays over a theme's: { "--ix-name": value }. Pure. */
export function presenterVars(theme) {
  const v = {};
  for (const [k, [size, line]] of Object.entries(TYPE)) { v[`--ix-fs-${k}`] = `${size}px`; v[`--ix-lh-${k}`] = `${line}px`; }
  for (const [k, c] of Object.entries(CONTRAST[theme === "dark" ? "dark" : "light"])) {
    v[`--ix-${k}`] = `rgb(${c})`;
    if (!c.includes("/")) v[`--ix-${k}-rgb`] = c;
  }
  v["--ix-ring"] = `3px solid rgb(${CONTRAST[theme === "dark" ? "dark" : "light"].ink})`;
  return v;
}

const CLICK_ON = new Set(["ArrowRight", "PageDown", " ", "Spacebar"]);
const CLICK_BACK = new Set(["ArrowLeft", "PageUp"]);

/**
 * ctx: { root, win, store, theme(), on(boolean) (the HUD re-lays itself out), advance(), back(), cycleLevel(),
 *        heldAction(), view: what openPresenterView needs (state, actions, makeH, markup, level), notice(text),
 *        split(open) (the projector's half of the presenter view: the panel steps aside for the caption) }
 */
export function createPresenter(ctx) {
  const { root, win } = ctx;
  let on = false, view = null, applied = [];

  function restyle() {
    for (const k of applied) root.style.removeProperty(k);
    applied = [];
    if (!on) return;
    const vars = presenterVars(ctx.theme());
    for (const k in vars) root.style.setProperty(k, vars[k]);
    applied = Object.keys(vars);
  }
  function set(next) {
    next = !!next;
    if (next === on) return;
    on = next;
    if (!on) closeView();
    root.classList.toggle("ix-present", on);
    restyle();
    ctx.on(on);
  }

  function openView() {
    if (view) { view.focus(); return true; }
    set(true);
    view = openPresenterView(ctx.view, {
      onClose: () => { view = null; ctx.split(false); },
    });
    if (!view) { ctx.notice("Allow pop-ups for this page to open the presenter view."); return false; }
    ctx.split(true);
    return true;
  }
  function closeView() { view?.close(); }
  // the projector page going away takes its second window with it
  const bye = () => closeView();
  win.addEventListener("pagehide", bye);

  /** A key on the projector or in the presenter view; true when presenter mode used it. */
  function key(e, { charKeys = true, activates = null } = {}) {
    if (!on || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    const k = e.key;
    // a focused control inside a card (a predict option, a switch) keeps Space; the dock's own buttons do not
    if ((k === " " || k === "Spacebar") && activates && !activates.closest(".ix-bar, .ix-tools, .ix-pv-dock")) return false;
    if (CLICK_ON.has(k)) ctx.advance();
    else if (CLICK_BACK.has(k)) ctx.back();
    else if (k === "Enter" && !activates) ctx.heldAction();
    else if (charKeys && (k === "l" || k === "L")) ctx.cycleLevel();
    else return false;
    e.preventDefault();
    return true;
  }

  return {
    get on() { return on; },
    get viewOpen() { return !!view; },
    set, restyle, key, openView, closeView,
    toggleView() { if (view) closeView(); else openView(); },
    /** Every HUD update: the presenter view follows the figure (it diffs, so this is cheap). */
    update() { if (view && !view.render()) view = null; },
    destroy() { closeView(); win.removeEventListener("pagehide", bye); for (const k of applied) root.style.removeProperty(k); root.classList.remove("ix-present"); },
  };
}
