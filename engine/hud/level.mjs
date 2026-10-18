// The reader's level (teaching.md §4): New to this, I know the basics, Expert. It changes what is shown, never the
// facts. The default comes from meta.level (intro → New, core and deep → Basics); the viewer's choice is remembered
// per figure, and the last choice on any figure is the default for the next one the viewer opens (a reader moving on
// to the next lesson keeps their level). Every control that sets it (the explain panel's header, the start card) is a
// segmented radio group. Each level has one plain line on what it changes (the start card shows it under the switch).

export const LEVELS = [
  { id: "new", label: "New to this", note: "Every step in plain words, with a pause after each key one." },
  { id: "basics", label: "I know the basics", note: "The key steps explained. The precise version is a click away." },
  { id: "expert", label: "Expert", note: "The run with every detail open: cost, edge cases and sources." },
];

/**
 * What each level shows (teaching.md §4's table).
 *   goal     the progress map's goal line (Expert: dots only, the goal in their tooltip)
 *   entry    the chapter entry card: "full" (So far, Now, Done), "now" (the Now line), "off"
 *   about    "full", or "first" (the first sentence, with More)
 *   why      "all" (every step that has one), "key" (key steps; a Why toggle elsewhere), "toggle" (always behind it)
 *   look     "pulse" (the chip pulses with the world's highlight), "chip", "off" (the world still lights)
 *   picture  the inline picture line on flagged steps
 *   deeper   "closed" (Go deeper), "peek" (the first field, one line, then More), "open" (every field)
 *   pace     reading time scale (runtime)
 *   holdKey  playback holds after each key step until Continue
 *   predict  "card", or "ponder" (the options wait behind Predict, and the question can be skipped)
 */
export const POLICY = {
  new: { goal: true, entry: "full", about: "full", why: "all", look: "pulse", picture: true, deeper: "closed", pace: 1.2, holdKey: true, predict: "card" },
  basics: { goal: true, entry: "now", about: "full", why: "key", look: "chip", picture: false, deeper: "peek", pace: 1, holdKey: false, predict: "card" },
  expert: { goal: false, entry: "off", about: "first", why: "toggle", look: "off", picture: false, deeper: "open", pace: 1, holdKey: false, predict: "ponder" },
};

const valid = (v) => LEVELS.some((l) => l.id === v);
export const defaultLevel = (meta) => (meta?.level === "intro" ? "new" : "basics");

/** The reading pace a figure's timeline was compiled for (engine/scene/timeline.mjs reads intro figures slower). */
export const compiledPace = (meta) => (meta?.level === "intro" ? POLICY.new.pace : 1);

/**
 * The viewer's level: store is the HUD's localStorage wrapper ({ get, set }, both safe), key the figure's key.
 * onChange(level) runs on every change, after every control has been updated.
 */
export function createLevel({ store, key, meta, onChange }) {
  const saved = store.get(`level:${key}`), last = store.get("level");
  let value = valid(saved) ? saved : valid(last) ? last : defaultLevel(meta);
  const controls = new Set();
  return {
    get value() { return value; },
    get policy() { return POLICY[value]; },
    set(v) {
      if (!valid(v) || v === value) return;
      value = v;
      store.set(`level:${key}`, v);
      store.set("level", v);
      for (const c of controls) c.set(v);
      onChange?.(v);
    },
    /** A segmented control bound to this level. */
    control(h, o = {}) {
      const c = segmented(h, { ...o, items: LEVELS, value, label: "Your level", onChange: (v) => this.set(v) });
      controls.add(c);
      return c.el;
    },
  };
}

/**
 * A segmented control: one radio group with a roving tab stop, arrows move and pick, the current item on a thumb.
 * items: [{ id, label }]; returns { el, set(id) }.
 */
export function segmented(h, { items, value, label, onChange, cls = "" }) {
  const thumb = h("span", { class: "ix-seg-thumb", "aria-hidden": "true" });
  const buttons = items.map((it) => h("button", {
    class: "ix-seg-opt", type: "button", role: "radio", "data-id": it.id, text: it.label,
    onclick: () => { pick(it.id); onChange?.(it.id); },
  }));
  const el = h("div", { class: `ix-segmented ${cls}`.trim(), role: "radiogroup", "aria-label": label }, thumb, buttons);
  el.addEventListener("keydown", (e) => {
    const i = buttons.indexOf(e.target), n = buttons.length;
    if (i < 0) return;
    const j = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i + n - 1) % n
      : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); e.stopPropagation();
    buttons[j].focus();
    pick(buttons[j].dataset.id);
    onChange?.(buttons[j].dataset.id);
  });
  // the thumb follows layout boxes, so it is placed again whenever the control is laid out anew
  const place = () => {
    const b = buttons.find((x) => x.dataset.id === value);
    if (!b || !b.offsetWidth) return;
    thumb.style.width = `${b.offsetWidth}px`;
    thumb.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  function pick(id) {
    value = id;
    for (const b of buttons) {
      const on = b.dataset.id === id;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    place();
  }
  new el.ownerDocument.defaultView.ResizeObserver(place).observe(el);
  pick(value);
  return { el, set: pick };
}
