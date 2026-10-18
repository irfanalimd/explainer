// HUD for an Explainer figure (CONTRACTS.md section 5, DESIGN.md sections 7, 9, 10).
// DOM chrome over the canvas: title block, scenario control, settings drawer, captions, transport with a chapter
// scrubber, meters, legend, inspector, code panel, predict card, help, notices and world tags. Words live in one place:
// the explain panel on wide screens, the caption otherwise; nothing floats over the world at a chapter pause (the
// transport's primary button turns into "Continue to <chapter>"), and nothing gives a prediction away before its
// reveal (the veil: held-back caption, about lines, tags and legend). It also owns all stage
// input (pointer, wheel, touch, keyboard), deep links, reduced motion and fullscreen. update() is diffed: it touches
// the DOM only when something it shows has changed.
import { MOTION } from "../tokens.mjs";
import { applyTheme, UI_MS } from "./theme.mjs";
import { parse, toDOM, toText } from "./markup.mjs";
import { formatCounter } from "./format.mjs";
import { highlight } from "./highlight.mjs";
import { parseHash, formatHash, paramOverrides } from "./link.mjs";
import { createExplain, VEIL } from "./explain.mjs";
import { createFold } from "./fold.mjs";
import { createLevel, LEVELS, compiledPace } from "./level.mjs";
import { createJourney, promiseOf, nextStory } from "./journey.mjs";
import { createLayers } from "./layers.mjs";
import { lessonOf, layersOf, enterOf, termOf, feedbackOf } from "./lesson.mjs";
import { createTurn, liveTurns, detourOf } from "./turn.mjs";
import { createCheck, checksFor } from "./check.mjs";
import { createNudge, beliefBlock } from "./nudge.mjs";
import { createPresenter, presentQuery } from "./presenter.mjs";

export { applyTheme, parseHash, formatHash };

const SVG = (body, filled) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" ${filled ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;
const ICON = {
  play: SVG('<path d="M5.2 3.6v8.8c0 .6.7 1 1.2.7l6.6-4.4c.5-.3.5-1 0-1.3L6.4 2.9c-.5-.3-1.2.1-1.2.7z"/>', true),
  pause: SVG('<rect x="4" y="3" width="2.75" height="10" rx="1"/><rect x="9.25" y="3" width="2.75" height="10" rx="1"/>', true),
  back: SVG('<rect x="3" y="3.75" width="1.75" height="8.5" rx=".85"/><path d="M12.75 4.35v7.3c0 .55-.62.87-1.07.55L6.6 8.55a.68.68 0 0 1 0-1.1l5.08-3.65c.45-.32 1.07 0 1.07.55z"/>', true),
  fwd: SVG('<rect x="11.25" y="3.75" width="1.75" height="8.5" rx=".85"/><path d="M3.25 4.35v7.3c0 .55.62.87 1.07.55L9.4 8.55a.68.68 0 0 0 0-1.1L4.32 3.8c-.45-.32-1.07 0-1.07.55z"/>', true),
  tune: SVG('<path d="M2.5 4.75h3.25M9.75 4.75h3.75M2.5 11.25h6.75M13.25 11.25h.25"/><circle cx="7.75" cy="4.75" r="1.9"/><circle cx="11.25" cy="11.25" r="1.9"/>'),
  code: SVG('<path d="M5.25 4.5 1.75 8l3.5 3.5M10.75 4.5 14.25 8l-3.5 3.5M9.1 2.75 6.9 13.25"/>'),
  // the theme button shows where it goes: a moon in light mode (to dark), a sun in dark mode (to light)
  sun: SVG('<circle cx="8" cy="8" r="2.75"/><path d="M8 1.75v1.25M8 13v1.25M1.75 8H3M13 8h1.25M3.6 3.6l.9.9M11.5 11.5l.9.9M3.6 12.4l.9-.9M11.5 4.5l.9-.9"/>'),
  moon: SVG('<path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85z"/>'),
  full: SVG('<path d="M2.75 6V3.75a1 1 0 0 1 1-1H6M10 2.75h2.25a1 1 0 0 1 1 1V6M13.25 10v2.25a1 1 0 0 1-1 1H10M6 13.25H3.75a1 1 0 0 1-1-1V10"/>'),
  unfull: SVG('<path d="M6 2.75V5a1 1 0 0 1-1 1H2.75M13.25 6H11a1 1 0 0 1-1-1V2.75M10 13.25V11a1 1 0 0 1 1-1h2.25M2.75 10H5a1 1 0 0 1 1 1v2.25"/>'),
  help: SVG('<circle cx="8" cy="8" r="6"/><path d="M6.35 6.25a1.75 1.75 0 0 1 3.4.55c0 1.15-1.75 1.45-1.75 2.6"/><path d="M8 11.4v.1" stroke-width="1.75"/>'),
  close: SVG('<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'),
  dice: SVG('<rect x="2.5" y="2.5" width="11" height="11" rx="2.75"/><circle cx="5.6" cy="5.6" r=".55" fill="currentColor"/><circle cx="8" cy="8" r=".55" fill="currentColor"/><circle cx="10.4" cy="10.4" r=".55" fill="currentColor"/>'),
  chevron: SVG('<path d="M4.75 6.5 8 9.75l3.25-3.25"/>'),
  check: SVG('<path d="M3.5 8.4 6.5 11.25 12.5 4.75"/>'),
  cross: SVG('<path d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"/>'),
  arrow: '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3h5v5M9 3 3 9"/></svg>',
  info: SVG('<circle cx="8" cy="8" r="6"/><path d="M8 7.25v4M8 4.75v.1"/>'),
  up: SVG('<path d="M4.75 9.75 8 6.5l3.25 3.25"/>'),
  replay: SVG('<path d="M3.1 8a4.9 4.9 0 1 0 1.45-3.48"/><path d="M4.4 2.4v2.4h2.4"/>'),
  next: SVG('<path d="M3.5 8h9M9 4.5 12.5 8 9 11.5"/>'),
  timeline: SVG('<path d="M2 8h3.2M6.8 8h2.4M10.8 8H14"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>'),
  cursor: SVG('<path d="M4 2.75 12.25 7.6l-3.6.95-1.6 3.55z"/>'),
  caption: SVG('<rect x="2" y="4" width="12" height="8" rx="2.25"/><path d="M4.75 8h3.5"/><circle cx="10.75" cy="8" r=".9" fill="currentColor" stroke="none"/>'),
  branch: SVG('<circle cx="4.5" cy="3.75" r="1.5"/><circle cx="4.5" cy="12.25" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M4.5 5.25v5.5M11.5 7c0 2.5-3 2.5-7 3.75"/>'),
  meter: SVG('<path d="M2.75 13.25h10.5"/><path d="M4.5 10.5V8M8 10.5V4.75M11.5 10.5V6.5"/>'),
  // presenter mode: a projector screen; the presenter view: a second window beside it
  present: SVG('<rect x="1.75" y="2.75" width="12.5" height="8" rx="1.5"/><path d="M8 10.75v2.5M5.5 13.25h5"/>'),
  windows: SVG('<rect x="1.75" y="4.25" width="8.5" height="7.5" rx="1.5"/><path d="M6 4.25V3.5a1.25 1.25 0 0 1 1.25-1.25h5.75a1.25 1.25 0 0 1 1.25 1.25v5.25A1.25 1.25 0 0 1 13 10h-2.75"/>'),
};

const KEYMAP = [
  ["Playback", [[["Space"], "Play or pause"], [["Enter"], "Continue to the next chapter"], [["←", "→"], "Back, next step"],
    [["Shift", "←", "→"], "Previous, next chapter"], [["Home", "End"], "Start, end"], [["[", "]"], "Slower, faster"], [["R"], "Restart"]]],
  ["View", [[["1", "–", "9"], "Scenarios"], [["S"], "Parameters and settings"], [["C"], "Code"], [["T"], "Light or dark"], [["F"], "Fit the camera"],
    [["I"], "Pin the inspector"], [["E"], "Explain panel"], [["L"], "Your level"], [["P"], "Presenter mode"], [["?"], "Help"], [["Esc"], "Close"]]],
  // the keyboard path into the world (engine/a11y/scene.mjs)
  ["The world", [[["Tab"], "Go into the world"], [["←", "↑", "↓", "→"], "Move between things"], [["Enter"], "Show its details"], [["Esc"], "Leave the world"]]],
];
// keys that are a single character: a viewer can turn these off in Settings (WCAG 2.1.4); Space, Enter, the arrows,
// Home, End and Esc always work
const isCharKey = (k) => k.length === 1 && k !== " ";
// the help overlay's plain-words guide to the interface
const GUIDE = [
  ["play", "Play and pause", "Runs the simulation. It stops at the end of each chapter so you can catch up."],
  ["fwd", "Back and Next", "Move one step at a time. Every step is one real event from the run."],
  ["timeline", "The timeline", "Each segment is a chapter. Drag anywhere on it to rewind or skip ahead; every step is replayable."],
  ["cursor", "The world", "Hover anything to see its state, click to pin it. Drag to turn the camera, scroll to zoom, double-click to focus. With a keyboard, Tab into it and use the arrows."],
  ["caption", "The caption", "Narrates the current step. Words with a dot are things in the world: hover one to find it, click to inspect it."],
  ["branch", "Scenarios", "The same system again with a twist, like a worker crashing halfway. Pick one from the scenarios at the top, or press its number."],
  ["meter", "Numbers and parameters", "The numbers count what the run has done so far; point at one, or tap them, to see what it means. Parameters change the inputs and re-run it instantly."],
  ["present", "Presenter mode", "For teaching from a projector: big type, high contrast, and a clicker that steps through it. Press P, or turn it on in Settings."],
];
// the same guide in touch words, for screens without a mouse: tap, pinch, drag (and no keys)
const GUIDE_TOUCH = {
  cursor: "Tap anything to see its state. Drag to turn the camera, pinch to zoom, double-tap to focus.",
  caption: "Narrates the current step. Words with a dot are things in the world: tap one to find it and see its state.",
  branch: "The same system again with a twist, like a worker crashing halfway. Pick one from the scenarios at the top.",
  meter: "The numbers count what the run has done so far; tap them to see what each one means. Parameters change the inputs and re-run it instantly.",
  present: null,
};
const SPEED_NAMES = { 0.5: "Slow", 1: "Normal", 2: "Fast", 4: "Fastest" };

const SIZE_PHONE = 640, SIZE_COMPACT = 1000;
const TONE_OF_KIND = [
  [/fail|crash|error|drop|kill|dead|down|partition|lost|abort/i, "fail"],
  [/warn|timeout|retry|recover|slow|stale|evict|miss|conflict/i, "warn"],
  [/ok|commit|elect|done|hit|ack|leader|success|finish/i, "ok"],
];
const toneOfKind = (k) => { for (const [re, t] of TONE_OF_KIND) if (re.test(k)) return t; return ""; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isTyping = (el) => !!el && (el.isContentEditable || /^(TEXTAREA|SELECT)$/.test(el.tagName) || (el.tagName === "INPUT"));
const sameJSON = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };

// cubic-bezier easing from tokens (x1, y1, x2, y2)
function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t, fy = (t) => ((ay * t + by) * t + cy) * t, dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= (fx(t) - x) / d; }
    return fy(clamp(t, 0, 1));
  };
}
const ease = bezier(MOTION.ease);

function maker(doc) {
  const h = (tag, props, ...kids) => {
    const e = doc.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat(4)) if (c != null && c !== false) e.append(c);
    return e;
  };
  const s = (tag, attrs = {}) => {
    const e = doc.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) e.setAttribute(k, String(attrs[k]));
    return e;
  };
  // replaceChildren() would print null and false as text; this skips them
  const put = (el, ...kids) => { el.replaceChildren(...kids.flat(4).filter((k) => k != null && k !== false)); return el; };
  return { h, s, put };
}

const defaultsOf = (params = {}) => Object.fromEntries(Object.entries(params).map(([k, d]) => [k, d?.value]));

/**
 * Create the HUD inside the figure root (its first child is the renderer's canvas).
 * opts: { meta, params, values, scenarios, scenario, counters, code, theme, reducedMotion?, hash? (default true) }
 * cb:   the callbacks of CONTRACTS.md section 5, plus optional onUnpin() and onReducedMotion(bool).
 */
export function createHud(root, opts = {}, cb = {}) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const { h, s: svg, put } = maker(doc);
  const now = () => win.performance.now();
  const raf = (fn) => win.requestAnimationFrame(fn);
  const fire = (name, ...args) => {
    const f = cb[name];
    if (typeof f !== "function") return undefined;
    try { return f(...args); } catch (err) { console.error(`[hud] ${name}:`, err); }
  };
  const uidBase = `ix${Math.random().toString(36).slice(2, 7)}`;
  const uid = (k) => `${uidBase}-${String(k).replace(/[^\w-]/g, "_")}`;

  const S = {
    meta: opts.meta ?? {}, params: opts.params ?? {}, scenarios: opts.scenarios ?? [], counters: opts.counters ?? {},
    code: opts.code ?? null, theme: opts.theme ?? opts.meta?.theme ?? "light",
    values: { ...defaultsOf(opts.params), ...(opts.values ?? {}) },
    scenario: opts.scenario ?? opts.scenarios?.[0]?.id ?? null,
    tl: null, steps: [], phases: [], duration: 0, keyIndex: new Map(), keyNames: new Map(),
    time: 0, playing: false, speed: 1, step: -1, phase: -1, caption: null, captionDirty: false,
    lineKey: "", varsKey: "", entities: null, W: 0, H: 0, size: "", frameNo: 0, stepMode: false, held: null, capKey: "",
  };
  let destroyed = false;
  const listeners = [];
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); listeners.push(() => target.removeEventListener(type, fn, o)); };
  const timers = new Set();
  const later = (fn, ms) => { const id = win.setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const cancel = (id) => { if (id) { win.clearTimeout(id); timers.delete(id); } };

  // ---------- root, theme, reduced motion ----------
  const canvas = root.querySelector(":scope > canvas") ?? root.querySelector("canvas");
  root.classList.add("ix");
  if (!root.hasAttribute("tabindex")) root.tabIndex = -1;
  // the figure is the page's main content, unless the page already names one
  const landmark = !doc.querySelector("main, [role=main]");
  if (landmark) root.setAttribute("role", "main");
  S.theme = applyTheme(root, S.theme);
  const mq = win.matchMedia ? win.matchMedia("(prefers-reduced-motion: reduce)") : null;
  let reduced = opts.reducedMotion ?? !!mq?.matches;
  root.classList.toggle("ix-reduced", reduced);
  if (mq?.addEventListener) on(mq, "change", (e) => {
    if (opts.reducedMotion != null) return;
    reduced = e.matches; root.classList.toggle("ix-reduced", reduced); fire("onReducedMotion", reduced);
  });
  // a touch screen (no hover, a coarse pointer): help and hints speak of taps and pinches, and the keys step aside
  const touchMq = win.matchMedia ? win.matchMedia("(hover: none) and (pointer: coarse)") : null;
  let touch = !!touchMq?.matches;
  root.classList.toggle("ix-touch", touch);
  if (touchMq?.addEventListener) on(touchMq, "change", (e) => { touch = e.matches; root.classList.toggle("ix-touch", touch); renderGuide(); });
  // capture (record/shoot) and reduced motion both mean: no tweens, no smoothing, swap instantly
  const capturing = () => root.classList.contains("ix-capture") || doc.documentElement.classList.contains("ix-capture");
  const still = () => reduced || capturing();
  const figureLabel = () => {
    const m = S.meta;
    return [m.title, m.subtitle].filter(Boolean).join(": ") + ". An interactive simulation; the current step is narrated below.";
  };
  if (canvas) {
    canvas.classList.add("ix-canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", figureLabel());
  }
  ensureCss();

  // one-time things (the start card, coach hints) and preferences, remembered in localStorage when it is there
  const store = {
    get(k) { if (opts.storage === false) return null; try { return win.localStorage.getItem(`ix:${k}`); } catch { return null; } },
    set(k, v) { if (opts.storage === false) return; try { win.localStorage.setItem(`ix:${k}`, v); } catch { /* private mode */ } },
  };
  const figKey = () => String(S.meta.id ?? S.meta.title ?? win.location.pathname).toLowerCase().replace(/[^\w-]+/g, "-").slice(0, 64);
  let guided = store.get("guided") !== "0";
  let folding = store.get("fold") !== "0";   // "Speed through repeats" (fold.mjs, engine/playback.mjs)
  let charKeys = store.get("keys") !== "0";  // single-character shortcuts (WCAG 2.1.4: a viewer can turn them off)
  // the reader's level (level.mjs): what the explain panel, the caption and the predict card show
  const level = createLevel({ store, key: figKey(), meta: S.meta, onChange: (v) => {
    explain.refresh(true);
    S.captionDirty = true;
    if (S.step >= 0) setCaption(S.caption, S.step);
    if (introOpen) renderIntro();
    fire("onLevel", v);
  } });
  // the stories this viewer has finished and where they stopped (journey.mjs): offered back on the start card
  const journey = createJourney({ store, key: figKey() });

  // ---------- small builders ----------
  const iconBtn = (icon, label, kbd, onclick, cls = "") => h("button", {
    class: `ix-btn ${cls}`.trim(), type: "button", "aria-label": label, "data-tip": label, "data-kbd": kbd, html: ICON[icon], onclick,
  });
  const panelHead = (title, extra, onClose) => h("header", { class: "ix-panel-head" },
    h("span", { class: "ix-panel-title", text: title }), extra,
    iconBtn("close", `Close ${title.toLowerCase()}`, "Esc", onClose, "ix-btn-sm ix-close"));

  // ---------- layers ----------
  const stage = h("div", { class: "ix-stage", "aria-hidden": "true" });
  const scrimTop = h("div", { class: "ix-scrim ix-scrim-top", "aria-hidden": "true" });
  const scrimBottom = h("div", { class: "ix-scrim ix-scrim-bottom", "aria-hidden": "true" });
  const tagLayer = h("div", { class: "ix-tags", "aria-hidden": "true" });
  const hud = h("div", { class: "ix-hud" });

  // ---------- title block ----------
  const kickerText = () => {
    const m = S.meta;
    return [m.kicker, m.fig != null ? `Fig ${m.fig}` : null].filter(Boolean).join(" · ");
  };
  const titleEl = h("h1", { class: "ix-heading" });
  // the header is the title alone (the subtitle lives on the start card); phones show it on one line, and the
  // subtitle and a link to the paper open from it in a small card
  const aboutBtn = h("button", { class: "ix-about-btn", type: "button", "aria-label": "About this figure", "aria-expanded": "false", html: ICON.chevron, onclick: () => toggleAbout() });
  const headRow = h("div", { class: "ix-head-row" }, titleEl, aboutBtn);
  // the stories (scenarios) sit at the top centre of the stage, over the world they retell: a segmented strip with every
  // story in view (Normal run | Worker dies | Straggler), the current one on a sliding thumb. Where the labels do not fit
  // between the title and the toolbar it collapses to one "Story · Worker dies ⌄" pill with a menu; on a phone the pill
  // takes a short second row. A story's description shows in its tooltip, and once, briefly, under the strip after a switch.
  const storyThumb = h("span", { class: "ix-stories-thumb", "aria-hidden": "true" });
  const storySegK = h("span", { class: "ix-stories-k", "aria-hidden": "true", text: "Scenarios" });
  const storySeg = h("div", { class: "ix-stories-strip ix-glass", role: "radiogroup", "aria-label": "Scenarios" }, storySegK, storyThumb);
  const storyName = h("span", { class: "ix-story-name" });
  const storyBtn = h("button", { class: "ix-story ix-glass", type: "button", "aria-haspopup": "menu", "aria-expanded": "false",
    onclick: () => toggleStoryMenu() },
  h("span", { class: "ix-story-k", "aria-hidden": "true", text: "Scenario" }), storyName, h("span", { class: "ix-story-chev", html: ICON.chevron }));
  const storyNote = h("p", { class: "ix-story-note", role: "status", "aria-live": "polite", "aria-atomic": "true" });
  const storyBar = h("div", { class: "ix-stories", hidden: true }, storySeg, storyBtn, storyNote);   // shown once there are 2+ stories
  const titleBlock = h("div", { class: "ix-title" }, headRow);
  const aboutSub = h("p", { class: "ix-about-sub" });
  const aboutCite = h("a", { class: "ix-about-link", target: "_blank", rel: "noopener" });
  // phones have no help circle: help opens from here, under the subtitle (the card opens from the title)
  const aboutHelp = h("button", { class: "ix-about-help", type: "button", onclick: () => { toggleAbout(false); aboutBtn.focus({ preventScroll: true }); toggleHelp(true); } },
    h("span", { class: "ix-about-help-mark", "aria-hidden": "true", text: "?" }), "How to use this figure");
  const about = h("section", { class: "ix-about ix-glass", role: "dialog", "aria-label": "About this figure", inert: true }, aboutSub, aboutCite, aboutHelp);
  on(headRow, "click", (e) => { if (S.size === "phone" && e.target !== aboutBtn && !aboutBtn.contains(e.target)) toggleAbout(); });
  function renderTitle() {
    const m = S.meta;
    const cite = typeof m.cite === "string" ? { text: m.cite } : m.cite;
    // with a paper url the title itself is the link; the citation lives in its tooltip and accessible name
    if (cite?.url) {
      const label = `${m.title ?? ""} — read the paper${cite.text ? `: ${cite.text}` : ""}`;
      put(titleEl, h("a", { class: "ix-title-link", href: cite.url, target: "_blank", rel: "noopener", title: label, "aria-label": label },
        h("span", { text: m.title ?? "" }), h("span", { class: "ix-title-arrow", "aria-hidden": "true", html: ICON.arrow })));
      put(aboutCite, h("span", { text: "Read the paper" }), h("span", { class: "ix-title-arrow", "aria-hidden": "true", html: ICON.arrow }));
      aboutCite.href = cite.url;
      aboutCite.title = label;
      aboutCite.setAttribute("aria-label", label);
    } else {
      titleEl.textContent = m.title ?? "";
    }
    aboutCite.hidden = !cite?.url;
    aboutSub.textContent = m.subtitle ?? "";
    aboutSub.hidden = !m.subtitle;
    aboutBtn.hidden = false;   // the card always carries help
    if (canvas) canvas.setAttribute("aria-label", figureLabel());
  }

  // ---------- stories: the scenarios, a strip at the top centre (or a pill and its menu where the strip does not fit) ----------
  // Each is a story of the same system with its one-line description; digits 1-9 pick one from anywhere.
  const storyMenu = h("div", { class: "ix-menu ix-story-menu ix-glass", role: "menu", "aria-label": "Scenarios", id: uid("stories") });
  storyBtn.setAttribute("aria-controls", storyMenu.id);
  let storyItems = [], storyTabs = [], storyOpen = false, storyMode = "strip";
  function buildScenarios() {
    const n = S.scenarios.length;
    storyTabs = S.scenarios.map((sc, i) => h("button", {
      class: "ix-stories-tab", type: "button", role: "radio", "aria-checked": "false", tabindex: "-1", "data-id": sc.id,
      "aria-label": `Scenario ${i + 1} of ${n}: ${sc.label ?? sc.id}`, "aria-description": sc.description ?? null,
      "data-tip": sc.description ?? null, "data-tip-head": sc.description ? sc.label ?? sc.id : null, "data-kbd": i < 9 ? String(i + 1) : null,
      onclick: () => chooseScenario(sc.id),
    }, h("span", { class: "ix-story-mark", "aria-hidden": "true", html: ICON.check }), sc.label ?? sc.id));
    put(storySeg, storySegK, storyThumb, storyTabs);
    storyItems = S.scenarios.map((sc, i) => h("button", {
      class: "ix-story-item", type: "button", role: "menuitemradio", "aria-checked": "false", tabindex: "-1", "data-id": sc.id,
      onclick: () => { toggleStoryMenu(false); storyBtn.focus({ preventScroll: true }); chooseScenario(sc.id); },
    }, h("span", { class: "ix-story-num", "aria-hidden": "true", text: i < 9 ? String(i + 1) : "" }),
    h("span", { class: "ix-story-body" }, h("span", { class: "ix-story-label" }, sc.label ?? sc.id, h("span", { class: "ix-story-fin", text: "Finished" })),
      sc.description ? h("span", { class: "ix-story-text", text: sc.description }) : null),
    h("span", { class: "ix-menu-check", html: ICON.check })));
    put(storyMenu, h("div", { class: "ix-story-head", "aria-hidden": "true", text: "Same system, different scenarios" }), storyItems);
    const many = S.scenarios.length > 1;
    storyBar.hidden = !many;
    if (!many) toggleStoryMenu(false);
    root.classList.toggle("ix-has-scenarios", many);
    storyMode = "";   // re-measure: the labels changed
    renderStoryMarks();
    renderScenario();
    if (S.W) updateInsets();
  }
  // a small check on the stories this viewer has finished (journey.mjs), in the strip and the menu; capture never shows
  // them (hud.css), so a frame does not depend on what the browser remembers
  function renderStoryMarks() {
    const n = S.scenarios.length;
    S.scenarios.forEach((sc, i) => {
      const done = journey.done.has(sc.id), name = `Scenario ${i + 1} of ${n}: ${sc.label ?? sc.id}${done ? ", finished" : ""}`;
      const tab = storyTabs[i], item = storyItems[i];
      if (tab) { tab.classList.toggle("ix-story-done", done); tab.setAttribute("aria-label", name); }
      if (item) item.classList.toggle("ix-story-done", done);
    });
    if (storyMode === "strip" && S.W) { storyMode = ""; updateInsets(); }   // the strip's width changed
  }
  function renderScenario() {
    const n = S.scenarios.length, i = Math.max(0, S.scenarios.findIndex((x) => x.id === S.scenario)), sc = S.scenarios[i];
    const label = sc?.label ?? sc?.id ?? "";
    storyName.textContent = label;
    storyBtn.setAttribute("aria-label", `Scenario ${i + 1} of ${n}: ${label}. Choose another scenario`);
    storyItems.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.id === S.scenario)));
    // the strip is one radio group with a roving tab stop on the current story
    storyTabs.forEach((b) => { const on = b.dataset.id === S.scenario; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
    placeThumb();
    if (storyMode !== "strip" && S.W) updateInsets();   // the pill's width follows its label
    renderChips();
    applyPrimary();
  }
  // the thumb slides under the current story (layout boxes, so a transform on the bar never skews it)
  let thumbSet = false;
  function placeThumb() {
    const b = storyTabs.find((x) => x.dataset.id === S.scenario);
    if (!b || !b.offsetWidth) return;
    if (!thumbSet) storyThumb.style.transition = "none";
    storyThumb.style.width = `${b.offsetWidth}px`;
    storyThumb.style.transform = `translateX(${b.offsetLeft}px)`;
    if (!thumbSet) { void storyThumb.offsetWidth; storyThumb.style.transition = ""; thumbSet = true; }
  }
  // Centre the stories on the free stage (between the code panel and the explain panel, so they sit over the world they
  // retell), in the header row between the title and the toolbar: the full strip where it fits, else the pill, else
  // (phones) the pill on a short row of its own. Called from updateInsets, before the header is measured.
  function placeStories(rr) {
    if (storyBar.hidden) return;
    // a capture without chrome names its story as plain text: the pill's form, never the strip
    const capture = root.classList.contains("ix-capture") && !root.classList.contains("ix-keep-chrome");
    const tr = top.getBoundingClientRect(), ttl = titleBlock.getBoundingClientRect(), tb = toolbar.getBoundingClientRect();
    const gap = S.size === "phone" ? 12 : 24;
    const L = Math.round(ttl.right - tr.left) + gap;
    const R = (tb.width > 0 ? Math.round(tb.left - tr.left) : Math.round(tr.width)) - gap;
    const cx = (insets.left + (rr.width - insets.right)) / 2 - (tr.left - rr.left);
    // measure both forms at their natural width (a forced layout, only when the layout changes)
    storyBar.style.width = "";
    storyBar.classList.remove("ix-stories-pill", "ix-stories-row");
    const segW = Math.ceil(storySeg.getBoundingClientRect().width);   // sub-pixel widths round up, or a label ellipsizes
    storyBar.classList.add("ix-stories-pill");
    const pillW = Math.ceil(storyBtn.getBoundingClientRect().width);
    const mode = !capture && segW <= R - L ? "strip" : pillW <= R - L ? "pill" : "row";
    const w = mode === "strip" ? segW : Math.min(pillW, Math.floor(tr.width));
    const x = mode === "row" ? clamp(cx - w / 2, 0, Math.max(0, tr.width - w)) : clamp(cx - w / 2, L, R - w);
    storyBar.classList.toggle("ix-stories-pill", mode !== "strip");
    storyBar.classList.toggle("ix-stories-row", mode === "row");
    root.dataset.stories = mode;
    const snap = mode !== storyMode || still();
    if (snap) storyBar.style.transition = "none";
    storyBar.style.width = `${w}px`;
    storyBar.style.transform = `translateX(${Math.round(x)}px)`;
    if (snap) { void storyBar.offsetWidth; storyBar.style.transition = ""; }
    if (mode !== storyMode) { if (mode === "strip") toggleStoryMenu(false); storyMode = mode; }
    if (storyOpen) placeStoryMenu();
    placeThumb();
  }
  // after a switch, the new story's description shows once under the stories, centred, out of the layout flow (the
  // world never moves), and fades after a few seconds; the status role reads it aloud
  let noteTimer = 0;
  function showStoryNote() {
    cancel(noteTimer);
    hideTip();
    const text = scenarioDef()?.description ?? "";
    storyNote.textContent = text;
    storyNote.classList.toggle("ix-show", !!text);
    noteTimer = text ? later(hideStoryNote, 4000) : 0;
    obstaclesDirty = true;
  }
  function hideStoryNote() {
    cancel(noteTimer); noteTimer = 0;
    if (storyNote.classList.contains("ix-show")) { storyNote.classList.remove("ix-show"); obstaclesDirty = true; }
  }
  // the menu drops from the pill, centred under it and kept inside the root
  function placeStoryMenu() {
    const rr = root.getBoundingClientRect(), br = storyBtn.getBoundingClientRect(), mw = storyMenu.offsetWidth;
    storyMenu.style.top = `${Math.round(br.bottom - rr.top + 8)}px`;
    storyMenu.style.left = `${Math.round(clamp(br.left - rr.left + br.width / 2 - mw / 2, 8, Math.max(8, rr.width - mw - 8)))}px`;
  }
  function toggleStoryMenu(open = !storyOpen) {
    if (open && S.scenarios.length < 2) open = false;
    // with the whole strip in view there is no menu: "open the stories" puts focus on the current one
    if (open && storyMode === "strip") { (storyTabs.find((b) => b.tabIndex === 0) ?? storyTabs[0])?.focus({ preventScroll: true }); open = false; }
    if (open === storyOpen) return;
    if (open) hideStoryNote();
    storyOpen = open;
    if (open) placeStoryMenu();
    storyMenu.classList.toggle("ix-open", open);
    storyBtn.setAttribute("aria-expanded", String(open));
    if (open) (storyItems.find((b) => b.getAttribute("aria-checked") === "true") ?? storyItems[0])?.focus({ preventScroll: true });
    else if (storyMenu.contains(doc.activeElement)) storyBtn.focus({ preventScroll: true });
    obstaclesDirty = true;
  }
  // menu-button keys: ArrowDown / ArrowUp on the picker open the menu
  on(storyBtn, "keydown", (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); toggleStoryMenu(true); } });
  on(storyMenu, "keydown", (e) => {
    const i = storyItems.indexOf(doc.activeElement), last = storyItems.length - 1;
    const j = e.key === "ArrowDown" ? Math.min(last, i + 1) : e.key === "ArrowUp" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (j != null) { e.preventDefault(); e.stopPropagation(); storyItems[j]?.focus(); }
    else if (e.key === "Tab") toggleStoryMenu(false);
  });
  // the strip is a radio group: arrows move to the next story and pick it (wrapping), Home / End the first and last
  on(storySeg, "keydown", (e) => {
    const i = storyTabs.indexOf(doc.activeElement), last = storyTabs.length - 1;
    if (i < 0 || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key, fwd = k === "ArrowRight" || k === "ArrowDown", back = k === "ArrowLeft" || k === "ArrowUp";
    const j = fwd ? (i + 1) % (last + 1) : back ? (i + last) % (last + 1) : k === "Home" ? 0 : k === "End" ? last : null;
    if (j == null) return;
    e.preventDefault(); e.stopPropagation();
    storyTabs[j].focus({ preventScroll: true });
    chooseScenario(storyTabs[j].dataset.id);
  });
  // pointing at the strip clears the note: the tooltip under it carries the same line
  on(storySeg, "pointerover", () => hideStoryNote());
  // scenario chips on the finished card ("What if…"): one radio set, kept in step with the story picker
  const chipSets = [];
  function scenarioChips(exclude) {
    const set = h("div", { class: "ix-chips", role: "radiogroup", "aria-label": "Scenario" });
    set._exclude = exclude;
    chipSets.push(set);
    on(set, "keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault(); e.stopPropagation();
      const bs = [...set.children], i = bs.indexOf(doc.activeElement);
      const j = clamp((i < 0 ? 0 : i) + (e.key === "ArrowRight" ? 1 : -1), 0, bs.length - 1);
      bs[j]?.focus();
    });
    fillChips(set);
    return set;
  }
  function fillChips(set) {
    // at the end, the story after this one (in order, wrapping) is the suggested next one
    const cur = S.scenarios.findIndex((x) => x.id === S.scenario);
    const nextId = S.scenarios.length > 1 ? S.scenarios[(cur + 1) % S.scenarios.length]?.id : null;
    put(set, S.scenarios.filter((sc) => !(set._exclude && sc.id === S.scenario)).map((sc) => {
      const next = !!set._exclude && sc.id === nextId;
      return h("button", {
        class: `ix-chip-btn${next ? " ix-chip-next" : ""}`, type: "button", role: "radio", "data-id": sc.id, title: sc.description ?? null,
        "aria-description": next ? "Next scenario" : null,
        onclick: () => { if (sc.id === S.scenario) fire("onRestart"); else chooseScenario(sc.id); },
      }, (set._exclude && sc.whatIf) || sc.label || sc.id, next ? h("span", { html: ICON.next, "aria-hidden": "true" }) : null);
    }));
    renderChipSet(set);
  }
  function renderChipSet(set) {
    for (const b of set.children) {
      const sel = !set._exclude && b.dataset.id === S.scenario;
      b.setAttribute("aria-checked", String(sel));
      b.tabIndex = set._exclude ? 0 : sel ? 0 : -1;
    }
  }
  function renderChips() {
    for (const set of chipSets) if (set._exclude) fillChips(set); else renderChipSet(set);
  }
  function chooseScenario(id) {
    if (id == null || id === S.scenario || !S.scenarios.some((s) => s.id === id)) return;
    S.scenario = id;
    toggleStoryMenu(false);
    renderScenario();
    showStoryNote();
    fire("onScenario", id);
    scheduleHash(true);
  }

  // the toolbar names what matters in words ("Code", "Parameters"); the theme and full screen keep their own
  // well-known icons, each with a tooltip. Help is not here: it waits in the bottom-left corner.
  const toolBtn = (icon, word, kbd, onclick) => {
    const w = h("span", { class: "ix-tool-label", text: word });
    const b = h("button", { class: "ix-tool", type: "button", "data-tip": word, "data-kbd": kbd, onclick }, h("span", { class: "ix-tool-icon", html: ICON[icon] }), w);
    b._word = w;
    return b;
  };
  const codeBtn = toolBtn("code", "Code", "C", () => toggleCode());
  codeBtn.classList.add("ix-code-tool");
  // presenting: the toolbar's first word opens the presenter view (the panel on the laptop), a circle ends presenting
  const viewBtn = toolBtn("windows", "Presenter view", null, () => presenter.toggleView());
  viewBtn.classList.add("ix-present-btn");
  viewBtn.dataset.tip = "The explain panel on this screen, the world on the projector";
  viewBtn.setAttribute("aria-label", "Presenter view");
  const endBtn = iconBtn("close", "End presenting", "P", () => presenter.set(false), "ix-present-end");
  const tuneBtn = toolBtn("tune", "Settings", "S", () => toggleDrawer());
  const themeBtn = iconBtn("moon", "Dark mode", "T", () => toggleTheme());
  const fullBtn = iconBtn("full", "Full screen", null, () => toggleFullscreen(), "ix-only-desk ix-full-btn");
  const tools = h("div", { class: "ix-tools ix-glass", role: "toolbar", "aria-label": "Figure controls" }, viewBtn, codeBtn, tuneBtn,
    h("span", { class: "ix-tools-sep", "aria-hidden": "true" }), themeBtn, fullBtn, endBtn);
  const helpBtn = h("button", { class: "ix-help-fab ix-glass", type: "button", "aria-label": "Help", "data-tip": "How to use this figure", "data-kbd": "?",
    onclick: () => toggleHelp() }, h("span", { "aria-hidden": "true", text: "?" }));
  const toolbar = h("div", { class: "ix-toolbar" }, tools);
  const top = h("div", { class: "ix-top" }, titleBlock, storyBar, toolbar);
  const fsEnabled = !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  fullBtn.hidden = !fsEnabled;

  // ---------- settings drawer ----------
  const resetBtn = h("button", { class: "ix-textbtn", type: "button", text: "Reset", onclick: () => resetParams() });
  const knobBody = h("div", { class: "ix-panel-body ix-knobs" });
  // a viewer preference, not a figure parameter: never sent through onParams
  const guidedSw = h("button", { class: "ix-switch", id: uid("guided"), type: "button", role: "switch", "aria-checked": String(guided),
    "aria-describedby": uid("guided-help"), onclick: () => setGuided(!guided) });
  const prefs = h("div", { class: "ix-prefs" },
    h("div", { class: "ix-prefs-title", text: "Playback" }),
    h("div", { class: "ix-knob ix-knob-bool" }, h("div", { class: "ix-knob-head" },
      h("label", { class: "ix-knob-label", for: guidedSw.id, text: "Pause between chapters" }), guidedSw)),
    h("p", { class: "ix-knob-help", id: uid("guided-help"), text: "Stop at the end of each chapter with a short recap." }));
  const foldSw = h("button", { class: "ix-switch", id: uid("fold"), type: "button", role: "switch", "aria-checked": String(folding),
    "aria-describedby": uid("fold-help"), onclick: () => setFolding(!folding) });
  const keysSw = h("button", { class: "ix-switch", id: uid("keys"), type: "button", role: "switch", "aria-checked": String(charKeys),
    "aria-describedby": uid("keys-help"), onclick: () => setCharKeys(!charKeys) });
  prefs.append(
    h("div", { class: "ix-knob ix-knob-bool" }, h("div", { class: "ix-knob-head" },
      h("label", { class: "ix-knob-label", for: foldSw.id, text: "Speed through repeats" }), foldSw)),
    h("p", { class: "ix-knob-help", id: uid("fold-help"), text: "Once a step has played twice, its repeats play faster." }),
    h("div", { class: "ix-knob ix-knob-bool" }, h("div", { class: "ix-knob-head" },
      h("label", { class: "ix-knob-label", for: keysSw.id, text: "Letter and number shortcuts" }), keysSw)),
    h("p", { class: "ix-knob-help", id: uid("keys-help"), text: "Keys like T, S and 1–9. Turn them off if you use speech input. Space, Enter and the arrows always work." }));
  // presenting: a projector mode for classrooms (presenter.mjs); not offered on phones
  const presentSw = h("button", { class: "ix-switch", id: uid("present"), type: "button", role: "switch", "aria-checked": "false",
    "aria-describedby": uid("present-help"), onclick: () => presenter.set(!presenter.on) });
  const presentView = h("button", { class: "ix-ghost-btn ix-present-open", type: "button", onclick: () => presenter.openView() },
    h("span", { html: ICON.windows }), "Open presenter view");
  const presentPrefs = h("div", { class: "ix-prefs ix-prefs-present" },
    h("div", { class: "ix-prefs-title", text: "Presenting" }),
    h("div", { class: "ix-knob ix-knob-bool" }, h("div", { class: "ix-knob-head" },
      h("label", { class: "ix-knob-label", for: presentSw.id, text: "Presenter mode" }), presentSw)),
    h("p", { class: "ix-knob-help", id: uid("present-help"), text: "Big type and high contrast for a projector. A clicker steps through it: → or Page Down goes on, ← or Page Up goes back. P turns it on and off." }),
    presentView);
  function setCharKeys(on) {
    charKeys = !!on;
    keysSw.setAttribute("aria-checked", String(charKeys));
    store.set("keys", charKeys ? "1" : "0");
  }
  function setFolding(on) {
    folding = !!on;
    foldSw.setAttribute("aria-checked", String(folding));
    store.set("fold", folding ? "1" : "0");
    fire("onFolding", folding);
  }
  const knobFoot = h("footer", { class: "ix-panel-foot", text: "Changes re-run the simulation instantly." });
  const drawerHead = panelHead("Settings", resetBtn, () => toggleDrawer(false));
  const drawer = h("section", { class: "ix-panel ix-drawer ix-glass", role: "dialog", "aria-label": "Settings", tabindex: "-1", inert: true },
    drawerHead, knobBody, knobFoot, prefs, presentPrefs);

  // ---------- parameters: the figure's inputs, always in view where there is room ----------
  // Wide screens (where the explain panel docks): a card of its own at the foot of the right column, each knob a row
  // with its name, its control and its value; its header folds it (remembered). A figure with a lesson starts it folded
  // to its title: a first-time reader needs the panel's room for the chapter card and the step, and the run's end
  // invites them to open it ("Try it yourself"). Without a lesson it starts open, folded only on a short screen. Narrower screens:
  // the same knobs lead the drawer, which the toolbar's "Parameters" opens (a bottom sheet on phones). Docked, the
  // drawer keeps only the playback preferences and the toolbar calls it "Settings".
  const PARAMS_TALL = 800;   // px of root height from which the card starts open
  let paramsPref = store.get("params"), paramsOpen = null, paramsDocked = null;
  const paramsToggle = h("button", { class: "ix-params-toggle", type: "button", "aria-controls": uid("params-body"),
    onclick: () => { paramsPref = paramsOpen ? "0" : "1"; store.set("params", paramsPref); syncParamsOpen(); } }, h("span", { class: "ix-params-title", text: "Parameters" }), h("span", { class: "ix-params-chev", html: ICON.chevron }));
  const paramsReset = h("button", { class: "ix-textbtn ix-params-reset", type: "button", text: "Reset", "data-tip": "Back to this scenario's values", onclick: () => resetParams() });
  const paramsBody = h("div", { class: "ix-params-body", id: uid("params-body") });
  const paramsCard = h("section", { class: "ix-params ix-glass", "aria-label": "Parameters", hidden: true },
    h("header", { class: "ix-params-head" }, paramsToggle, paramsReset), paramsBody);
  const hasKnobs = () => Object.keys(knobs).length > 0;
  function syncParamsOpen() {
    const open = paramsPref ? paramsPref === "1" : !S.lesson && S.H >= PARAMS_TALL;
    if (open === paramsOpen) return;
    paramsOpen = open;
    paramsToggle.setAttribute("aria-expanded", String(open));
    paramsCard.classList.toggle("ix-params-folded", !open);
    sizeParams();
  }
  // the knobs live in the card (docked) or lead the drawer; the toolbar's button is named for what it opens
  function placeParams() {
    const dock = explain.mode === "docked" && hasKnobs() && !presenter.on;
    if (dock !== paramsDocked) {
      paramsDocked = dock;
      if (dock) paramsBody.append(knobBody); else drawer.insertBefore(knobBody, knobFoot);
      paramsCard.hidden = !dock;
      knobFoot.hidden = resetBtn.hidden = dock || !hasKnobs();
      const name = !dock && hasKnobs() ? "Parameters" : "Settings";
      drawerHead.querySelector(".ix-panel-title").textContent = name;
      drawer.setAttribute("aria-label", name);
      tuneBtn._word.textContent = name;
      tuneBtn.dataset.tip = dock ? "Playback settings" : name;
      tuneBtn.setAttribute("aria-label", tuneBtn.dataset.tip);
      for (const k in knobs) knobs[k].fit?.();
    }
    syncParamsOpen();
    knobBody.classList.toggle("ix-knobs-rows", !!paramsDocked || S.size === "phone");
    sizeParams();
  }
  // the explain panel above it ends where the card begins
  function sizeParams() {
    const hgt = paramsDocked && !paramsCard.hidden ? paramsCard.offsetHeight : 0, v = hgt ? `${hgt + 12}px` : "0px";
    if (root.style.getPropertyValue("--ix-params-space") === v) return;
    root.style.setProperty("--ix-params-space", v);
    // the explain panel above just grew or shrank: what it had to drop to fit may fit again (or no longer)
    explain.fit();
  }
  /** Width of the root the parameters card covers, from the right edge, for hud.insets.right. */
  const paramsInset = () => (paramsDocked && paramsCard.offsetWidth && !capturing() ? Math.max(0, Math.round(root.clientWidth - paramsCard.offsetLeft)) : 0);
  // Reset shows only once a value differs from the scenario's own
  function syncReset() {
    const base = { ...defaultsOf(S.params), ...(scenarioDef()?.params ?? {}) };
    const changed = Object.keys(knobs).some((k) => k in base && !sameJSON(base[k], S.values[k]));
    paramsReset.hidden = !changed;
  }
  function setGuided(on) {
    guided = !!on;
    guidedSw.setAttribute("aria-checked", String(guided));
    store.set("guided", guided ? "1" : "0");
    fire("onGuided", guided);
  }
  let knobs = {};
  let sentJSON = "";
  let sendTimer = 0, sendLast = 0;
  const sendParams = (final) => {
    const t = now();
    const go = () => {
      sendTimer = 0; sendLast = now();
      const j = JSON.stringify(S.values);
      if (j === sentJSON) return;
      sentJSON = j;
      syncReset();
      fire("onParams", { ...S.values });
      scheduleHash(true);
    };
    if (final) { cancel(sendTimer); go(); return; }
    if (sendTimer) return;
    const wait = Math.max(0, 100 - (t - sendLast));
    if (wait === 0) go(); else sendTimer = later(go, wait);
  };
  const commit = (key, v, final) => { S.values = { ...S.values, [key]: v }; sendParams(final); };

  const scrollFades = (el) => {
    const upd = () => {
      el.classList.toggle("ix-fade-top", el.scrollTop > 2);
      el.classList.toggle("ix-fade-bottom", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    };
    el.addEventListener("scroll", upd, { passive: true });
    return upd;
  };
  const knobFades = scrollFades(knobBody);
  function buildKnobs() {
    knobBody.replaceChildren();
    knobs = {};
    const entries = Object.entries(S.params).filter(([, d]) => d && !d.hidden);
    knobBody.hidden = knobFoot.hidden = resetBtn.hidden = entries.length === 0;
    for (const [key, def] of entries) {
      const k = makeKnob(key, def);
      knobs[key] = k;
      knobBody.append(k.el);
      k.set(S.values[key]);
    }
    sentJSON = JSON.stringify(S.values);
    paramsDocked = null;
    if (S.size) { placeParams(); updateInsets(); }
    syncReset();
  }

  function makeKnob(key, def) {
    const id = uid(key);
    const label = def.label ?? key;
    const isSeed = key === "seed" || /\bseed\b/i.test(label);
    const head = (control) => h("div", { class: "ix-knob-head" }, h("label", { class: "ix-knob-label", for: id, text: label }), control);
    const type = def.type ?? (typeof def.value === "boolean" ? "bool" : typeof def.value === "number" ? "float" : "text");

    if ((type === "int" || type === "float") && !isSeed && def.min != null && def.max != null) {
      const step = def.step ?? (type === "int" ? 1 : +((def.max - def.min) / 100).toPrecision(1));
      const dec = type === "int" ? 0 : Math.max(0, (String(step).split(".")[1] ?? "").length);
      const out = h("output", { class: "ix-knob-val", for: id });
      const input = h("input", { class: "ix-range", id, type: "range", min: def.min, max: def.max, step });
      const span = def.max - def.min;
      const ticks = type === "int" && span > 0 && span <= 12
        ? h("div", { class: "ix-range-ticks", "aria-hidden": "true" }, Array.from({ length: span + 1 }, () => h("span")))
        : null;
      const show = (v) => {
        out.textContent = (+v).toFixed(dec) + (def.unit ? ` ${def.unit}` : "");
        input.style.setProperty("--p", String(span > 0 ? (v - def.min) / span : 0));
      };
      const read = () => (type === "int" ? Math.round(+input.value) : +(+input.value).toFixed(dec + 2));
      input.addEventListener("input", () => { const v = read(); show(v); commit(key, v, false); });
      input.addEventListener("change", () => commit(key, read(), true));
      return { el: h("div", { class: "ix-knob ix-knob-range" }, head(out), input, ticks), set: (v) => { if (v == null) return; input.value = v; show(+v); }, input };
    }
    if (type === "int" || type === "float") {
      const input = h("input", { class: "ix-input ix-input-num", id, type: "text", inputmode: type === "int" ? "numeric" : "decimal", spellcheck: "false", autocomplete: "off" });
      const parseV = () => {
        let v = Number(input.value);
        if (!Number.isFinite(v)) return null;
        if (type === "int") v = Math.round(v);
        if (def.min != null) v = Math.max(def.min, v);
        if (def.max != null) v = Math.min(def.max, v);
        return v;
      };
      let deb = 0;
      input.addEventListener("input", () => { cancel(deb); deb = later(() => { const v = parseV(); if (v != null) commit(key, v, true); }, 450); });
      const flush = () => { cancel(deb); const v = parseV(); if (v == null) input.value = S.values[key]; else { input.value = v; commit(key, v, true); } };
      input.addEventListener("change", flush);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { flush(); input.blur(); }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const v = (parseV() ?? 0) + (e.key === "ArrowUp" ? 1 : -1) * (def.step ?? 1);
          input.value = v; flush();
        }
      });
      const row = h("div", { class: "ix-knob-row" }, input,
        isSeed ? iconBtn("dice", "New seed", null, () => {
          const v = 1 + Math.floor(Math.random() * 9999);
          input.value = v; commit(key, v, true);
        }, "ix-btn-field") : null);
      return { el: h("div", { class: "ix-knob ix-knob-num" }, head(null), row), set: (v) => { if (v != null && doc.activeElement !== input) input.value = v; }, input };
    }
    if (type === "bool") {
      const sw = h("button", { class: "ix-switch", id, type: "button", role: "switch", "aria-checked": "false" });
      sw.addEventListener("click", () => { const v = sw.getAttribute("aria-checked") !== "true"; sw.setAttribute("aria-checked", String(v)); commit(key, v, true); });
      return { el: h("div", { class: "ix-knob ix-knob-bool" }, head(sw)), set: (v) => sw.setAttribute("aria-checked", v ? "true" : "false") };
    }
    if (type === "select") {
      const sel = h("select", { class: "ix-input ix-input-select", id },
        (def.options ?? []).map((o) => h("option", { value: String(o.value ?? o), text: o.label ?? String(o.value ?? o) })));
      const opts2 = def.options ?? [];
      sel.addEventListener("change", () => {
        const o = opts2.find((x) => String(x.value ?? x) === sel.value);
        commit(key, o === undefined ? sel.value : (o.value ?? o), true);
      });
      return {
        el: h("div", { class: "ix-knob ix-knob-select" }, head(null), h("div", { class: "ix-field" }, sel, h("span", { class: "ix-select-chev", html: ICON.chevron }))),
        set: (v) => { if (v != null) sel.value = String(v); },
      };
    }
    // text: a textarea that grows to three lines; Enter commits (the value never holds newlines)
    const input = h("textarea", { class: "ix-input ix-textarea", id, rows: "1", spellcheck: "false", autocomplete: "off" });
    const fit = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight + 2, 76)}px`; };
    const clean = (v) => v.replace(/\s*\n\s*/g, " ");
    let deb = 0;
    input.addEventListener("input", () => { fit(); cancel(deb); deb = later(() => commit(key, clean(input.value), true), 500); });
    const flush = () => { cancel(deb); input.value = clean(input.value); commit(key, input.value, true); };
    input.addEventListener("change", flush);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); flush(); input.blur(); } });
    return { el: h("div", { class: "ix-knob ix-knob-text" }, head(null), input), set: (v) => { if (v != null && doc.activeElement !== input) { input.value = v; raf(fit); } }, input, fit };
  }
  function scenarioDef(id = S.scenario) { return S.scenarios.find((s) => s.id === id) ?? null; }
  function resetParams() {
    const base = { ...defaultsOf(S.params), ...(scenarioDef()?.params ?? {}) };
    for (const k in S.params) if (k in base) S.values[k] = base[k];
    for (const k in knobs) knobs[k].set(S.values[k]);
    sendParams(true);
  }

  // ---------- code panel ----------
  const codeLang = h("span", { class: "ix-panel-sub" });
  const codeBody = h("div", { class: "ix-panel-body ix-code-body", tabindex: "0", "aria-label": "Source code" });
  const codePanel = h("section", { class: "ix-panel ix-code ix-glass", role: "region", "aria-label": "Code", inert: true },
    panelHead("Code", codeLang, () => toggleCode(false)), codeBody);
  let codeRows = [], codeOn = [], codeVarsEl = null;
  function buildCode() {
    const src = S.code?.source;
    codeBtn.hidden = !src;
    codeRows = []; codeOn = []; S.lineKey = "";
    codeBody.replaceChildren();
    if (!src) return;
    const lang = S.code.lang ?? "pseudo";
    codeLang.textContent = lang === "pseudo" ? "pseudocode" : lang;
    const lines = highlight(src, lang);
    const pre = h("div", { class: "ix-code-lines" });
    lines.forEach((toks, i) => {
      const row = h("div", { class: "ix-line" },
        h("span", { class: "ix-ln", text: String(i + 1) }),
        h("span", { class: "ix-lc" }, toks.length ? toks.map((t) => (t.t ? h("span", { class: `ix-t-${t.t}`, text: t.v }) : t.v)) : " "),
        h("span", { class: "ix-lv" }));
      codeRows.push(row);
      pre.append(row);
    });
    codeBody.append(pre);
    root.classList.add("ix-has-code");
  }
  function setLines(line, vars) {
    const a = Array.isArray(line) ? line[0] : typeof line === "number" ? line : 0;
    const b = Array.isArray(line) ? (line[1] ?? line[0]) : a;
    const key = `${a}:${b}`;
    if (key !== S.lineKey) {
      S.lineKey = key;
      for (const i of codeOn) codeRows[i]?.classList.remove("ix-on");
      codeOn = [];
      for (let i = a; i <= b && i > 0; i++) if (codeRows[i - 1]) { codeRows[i - 1].classList.add("ix-on"); codeOn.push(i - 1); }
      codePanel.classList.toggle("ix-has-active", codeOn.length > 0);
      if (codeOpen) scrollCode(false);
      S.varsKey = "\u0000";
    }
    const vk = vars ? JSON.stringify(vars) : "";
    if (vk !== S.varsKey) {
      S.varsKey = vk;
      if (codeVarsEl) codeVarsEl.textContent = "";
      codeVarsEl = codeOn.length ? codeRows[codeOn[codeOn.length - 1]].lastChild : null;
      if (codeVarsEl && vars) codeVarsEl.textContent = Object.entries(vars).map(([k, v]) => `${k} = ${fmtValue(v)}`).join("   ");
    }
  }
  function scrollCode(instant) {
    if (!codeOn.length) return;
    const first = codeRows[codeOn[0]], last = codeRows[codeOn[codeOn.length - 1]];
    const top = first.offsetTop, bottom = last.offsetTop + last.offsetHeight;
    const view = codeBody.clientHeight, cur = codeBody.scrollTop;
    const margin = 28;
    if (top >= cur + margin && bottom <= cur + view - margin) return;
    const target = clamp((top + bottom) / 2 - view / 2, 0, codeBody.scrollHeight - view);
    codeBody.scrollTo({ top: target, behavior: instant || still() ? "auto" : "smooth" });
  }

  // ---------- bottom: predict and caption over one dock (transport, readout strip, legend chip) ----------
  // The full readout (sparklines, compare table) and the legend are popovers over the dock: opening them never moves
  // the world, because hud.insets only counts the dock.
  const legend = h("div", { class: "ix-legend ix-pop ix-glass", role: "list", "aria-label": "Keys", id: uid("legend") });
  const predict = h("section", { class: "ix-predict ix-glass", role: "dialog", "aria-label": "Predict", "aria-live": "polite", inert: true });
  const capStage = h("div", { class: "ix-cap-stage" });
  const caption = h("div", { class: "ix-caption" }, capStage);
  const live = h("div", { class: "ix-sr", "aria-live": "polite", "aria-atomic": "true" });
  const center = h("div", { class: "ix-center" }, predict, caption);
  const meterList = h("div", { class: "ix-meters-body" });
  const meterClose = iconBtn("close", "Close readout", "Esc", () => toggleReadout(false), "ix-btn-sm ix-close");
  const meterBox = h("section", { class: "ix-meters ix-pop ix-glass", role: "group", "aria-label": "Numbers from this run", id: uid("readout") },
    h("header", { class: "ix-meters-head" }, h("span", { class: "ix-meters-title", text: "Numbers from this run" }), meterClose), meterList);
  const statsList = h("span", { class: "ix-stats-list" });
  const statsMore = h("span", { class: "ix-stat-more", hidden: true });
  // the dock shows only the figure's primary numbers; a click (or tap) opens every number with what it means
  const stats = h("button", { class: "ix-stats", type: "button", "aria-expanded": "false", "aria-controls": meterBox.id,
    "aria-describedby": uid("stats-more"), onclick: () => toggleReadout(readoutOpen !== "pinned" ? "pinned" : false) },
    h("span", { class: "ix-sr", text: "Numbers: " }), statsList, statsMore,
    h("span", { class: "ix-stats-chev", id: uid("stats-more"), "aria-label": "Show every number and what it means", html: ICON.help }));
  const legendDots = h("span", { class: "ix-legend-dots", "aria-hidden": "true" });
  const legendCount = h("span", { class: "ix-legend-count" });
  const legendBtn = h("button", { class: "ix-legend-btn", type: "button", "aria-expanded": "false", "aria-controls": legend.id,
    onclick: () => toggleLegend(legendOpen !== "pinned" ? "pinned" : false) }, legendDots, legendCount);

  // transport buttons carry a visible word on desktop; the accessible name always starts with that word
  const tpBtn = (icon, word, name, kbd, onclick, cls) => {
    const ic = h("span", { class: "ix-tp-icon", html: ICON[icon] }), w = h("span", { class: "ix-tp-label", "aria-hidden": "true", text: word });
    const b = h("button", { class: `ix-tp-btn ${cls}`, type: "button", "aria-label": name, "data-tip": name, "data-kbd": kbd, onclick }, ic, w);
    b._icon = ic; b._word = w;
    return b;
  };
  // at a chapter pause the primary button reads "Continue to Shuffle" (Enter), at the end "Replay"; Next steps aside
  const playBtn = tpBtn("play", "Play", "Play", "Space", () => (S.held && !S.playing ? heldAction() : askingNow && !S.playing ? pointToAnswer() : togglePlay()), "ix-play");
  const backBtn = tpBtn("back", "Back", "Back one step", "←", () => fire("onStep", -1), "ix-step ix-back");
  const fwdBtn = tpBtn("fwd", "Next", "Next step", "→", () => { hideCoach("step"); fire("onStep", 1); }, "ix-step ix-next");
  const againBtn = h("button", { class: "ix-again", type: "button", hidden: true, "aria-label": "Replay this chapter", "data-tip": "Replay this chapter",
    onclick: () => replayChapter() }, h("span", { class: "ix-tp-icon", html: ICON.replay }), h("span", { class: "ix-tp-label", "aria-hidden": "true", text: "Replay" }));
  const btns = h("div", { class: "ix-tp-btns" }, backBtn, playBtn, againBtn, fwdBtn);

  const labels = h("div", { class: "ix-scrub-labels", "aria-hidden": "true" });
  const segBase = h("div", { class: "ix-segs" });
  const segFill = h("div", { class: "ix-segs ix-segs-fill" });
  const ticks = h("div", { class: "ix-ticks", "aria-hidden": "true" });
  const playhead = h("div", { class: "ix-playhead-rail", "aria-hidden": "true" }, h("div", { class: "ix-playhead" }));
  const hoverLine = h("div", { class: "ix-hoverline", "aria-hidden": "true" });
  // a wrong pick's branch (turn.mjs detourOf): drawn off the pick over the main run's track, which waits behind it
  const detourFill = h("div", { class: "ix-detour-fill" });
  const detourBand = h("div", { class: "ix-detour", hidden: true }, detourFill);
  const track = h("div", { class: "ix-track" }, segBase, segFill, detourBand);
  const previewMeta = h("div", { class: "ix-preview-meta" });
  const previewText = h("div", { class: "ix-preview-text" });
  const preview = h("div", { class: "ix-preview ix-glass", "aria-hidden": "true" }, previewMeta, previewText);
  const scrub = h("div", { class: "ix-scrub", role: "slider", tabindex: "0", "aria-label": "Timeline", "aria-valuemin": "0" },
    labels, track, ticks, hoverLine, playhead);
  const scrubWrap = h("div", { class: "ix-scrub-wrap" }, scrub);
  const countCur = h("span", { class: "ix-count-cur", text: "0" });
  const countTot = h("span", { class: "ix-count-tot", text: "0" });
  const countTag = h("span", { class: "ix-count-tag", text: "Detour", hidden: true });
  const counter = h("div", { class: "ix-count", "aria-hidden": "true" }, countTag, countCur, h("span", { class: "ix-count-sep", text: "/" }), countTot);
  // the speed is always visible, with its name; the menu says what each value means
  const speedVal = h("span", { class: "ix-speed-val", text: "1×" });
  const speedBtn = h("button", { class: "ix-speed", type: "button", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": "Speed, 1×",
    "data-tip": "Playback speed", "data-kbd": "[ ]", onclick: () => toggleSpeedMenu() },
  h("span", { class: "ix-speed-label", "aria-hidden": "true", text: "Speed" }), speedVal, h("span", { class: "ix-speed-chev", html: ICON.chevron }));
  const speedMenu = h("div", { class: "ix-menu ix-glass", role: "menu", "aria-label": "Playback speed" },
    h("div", { class: "ix-menu-head", "aria-hidden": "true", text: "Playback speed" }));
  const speedItems = MOTION.speeds.map((x) => h("button", {
    class: "ix-menu-item", type: "button", role: "menuitemradio", "aria-checked": "false", tabindex: "-1", "data-x": x,
    onclick: () => { setSpeed(x); toggleSpeedMenu(false); speedBtn.focus({ preventScroll: true }); },
  }, h("span", { class: "ix-menu-val", text: `${x}×` }), h("span", { class: "ix-menu-name", text: SPEED_NAMES[x] ?? "" }), h("span", { class: "ix-menu-check", html: ICON.check })));
  speedMenu.append(...speedItems);
  const speedWrap = h("div", { class: "ix-speed-wrap" }, speedBtn);
  // speed leads the dock, on the far left with its name, so it is never lost among the other controls
  const transport = h("div", { class: "ix-transport", role: "group", "aria-label": "Playback" }, speedWrap, btns, scrubWrap, counter);
  const bar = h("div", { class: "ix-bar ix-glass" }, transport, stats, legendBtn);
  const dock = h("div", { class: "ix-dock" }, center);
  const bottom = h("div", { class: "ix-bottom" }, dock, bar);

  // ---------- floating cards ----------
  const mkCard = (pinned) => {
    const el = h("div", { class: `ix-inspector ix-glass${pinned ? " ix-pinned" : ""}`, role: pinned ? "dialog" : "tooltip", "aria-label": "Inspector" });
    return { el, sig: "", id: null, shown: false, x: 0, y: 0, w: 0, h: 0, pinned };
  };
  const hoverCard = mkCard(false), pinCard = mkCard(true);
  const helpScrim = h("div", { class: "ix-help-scrim", onclick: () => toggleHelp(false) });
  const help = h("section", { class: "ix-help ix-glass", role: "dialog", "aria-modal": "true", "aria-labelledby": uid("help-title"), tabindex: "-1", inert: true });
  const sheetScrim = h("div", { class: "ix-sheet-scrim", onclick: () => closeTop() });
  const toast = h("div", { class: "ix-toast ix-glass", role: "status", "aria-live": "polite" });
  const tip = h("div", { class: "ix-tip ix-glass", role: "tooltip", "aria-hidden": "true" });
  // start card and coach hints: root level too, and outside hud.insets, so they never move the world
  const introScrim = h("div", { class: "ix-intro-scrim", "aria-hidden": "true", onclick: () => closeIntro("dismiss") });
  const intro = h("section", { class: "ix-intro ix-glass", role: "dialog", "aria-modal": "true", "aria-labelledby": uid("intro-title"),
    "aria-describedby": uid("intro-sub"), tabindex: "-1", inert: true });
  const coach = h("div", { class: "ix-coach ix-glass", role: "status", "aria-live": "polite", inert: true });

  hud.append(top, bottom, sheetScrim, codePanel, drawer, about, paramsCard, helpBtn);
  const after = canvas && canvas.parentNode === root ? canvas.nextSibling : root.firstChild;
  const frag = doc.createDocumentFragment();
  // popovers live at root level: a backdrop-filter parent would stop their own blur from seeing the world
  frag.append(stage, scrimTop, scrimBottom, tagLayer, hud, meterBox, legend, preview, speedMenu, storyMenu, hoverCard.el, pinCard.el, coach,
    helpScrim, help, introScrim, intro, toast, tip, live);
  root.insertBefore(frag, after);

  // ---------- help: what each part of the interface is for, in plain words, then the keys ----------
  const guideList = h("ul", { class: "ix-guide-list" });
  // touch screens read "tap", "pinch to zoom" and "drag to turn" (and no keys); the rest point, scroll and press
  function renderGuide() {
    put(guideList, GUIDE.filter(([icon]) => !(touch && GUIDE_TOUCH[icon] === null)).map(([icon, name, text]) => h("li", { class: "ix-guide-item" },
      h("span", { class: "ix-guide-icon", html: ICON[icon] }),
      h("span", { class: "ix-guide-body" }, h("span", { class: "ix-guide-name", text: name }), h("span", { class: "ix-guide-text", text: (touch && GUIDE_TOUCH[icon]) || text })))));
  }
  (function buildHelp() {
    const kb = (k) => (k === "–" ? h("span", { class: "ix-kbd-sep", text: "–" }) : h("kbd", { class: "ix-kbd", text: k }));
    help.append(
      h("header", { class: "ix-help-head" }, h("h2", { class: "ix-help-title", id: uid("help-title"), text: "How to use this figure" }),
        iconBtn("close", "Close help", "Esc", () => toggleHelp(false), "ix-btn-sm ix-close")),
      h("div", { class: "ix-help-grid" },
        h("div", { class: "ix-help-group ix-guide" }, h("div", { class: "ix-help-kicker", text: "The interface" }), guideList),
        h("div", { class: "ix-help-keys-col" }, KEYMAP.map(([group, rows]) => h("div", { class: "ix-help-group" },
          h("div", { class: "ix-help-kicker", text: group }),
          rows.map(([keys, what]) => h("div", { class: "ix-help-row" }, h("span", { class: "ix-help-what", text: what }), h("span", { class: "ix-help-keys" }, keys.map(kb)))))))),
      h("footer", { class: "ix-help-foot" },
        h("button", { class: "ix-ghost-btn", type: "button", onclick: () => { toggleHelp(false); openIntro(true); } }, h("span", { html: ICON.replay }), "Replay intro"),
        h("span", { class: "ix-help-note", text: "Chapter pauses and the letter shortcuts can be turned off in Settings." })));
    renderGuide();
  })();

  // ---------- state for overlays ----------
  let drawerOpen = false, codeOpen = false, helpOpen = false, menuOpen = false, aboutOpen = false;
  let readoutOpen = false, legendOpen = false;   // false | "hover" | "pinned"
  let lastFocus = null;
  function setOpen(el, open) {
    el.classList.toggle("ix-open", open);
    if (open) el.removeAttribute("inert"); else el.setAttribute("inert", "");
  }
  function syncSheets() {
    obstaclesDirty = true;
    const sheet = S.size === "phone" && (drawerOpen || codeOpen || pinCard.shown || !!readoutOpen);
    sheetScrim.classList.toggle("ix-open", sheet);
    root.classList.toggle("ix-sheet-open", sheet);
  }
  function toggleDrawer(open = !drawerOpen) {
    if (open === drawerOpen) return;
    drawerOpen = open;
    if (open && S.size === "phone" && codeOpen) toggleCode(false);
    setOpen(drawer, open);
    tuneBtn.setAttribute("aria-pressed", String(open));
    tuneBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      lastFocus = doc.activeElement;
      drawer.focus({ preventScroll: true });
      for (const k in knobs) knobs[k].fit?.();
      raf(knobFades);
    }
    else if (drawer.contains(doc.activeElement)) (lastFocus?.isConnected ? lastFocus : tuneBtn).focus({ preventScroll: true });
    syncSheets();
  }
  function toggleCode(open = !codeOpen) {
    if (open === codeOpen || (open && !S.code?.source)) return;
    codeOpen = open;
    if (open && S.size === "phone" && drawerOpen) toggleDrawer(false);
    setOpen(codePanel, open);
    codeBtn.setAttribute("aria-pressed", String(open));
    root.classList.toggle("ix-code-open", open);
    if (open) raf(() => scrollCode(true));
    else if (codePanel.contains(doc.activeElement)) codeBtn.focus({ preventScroll: true });
    syncSheets();
    updateInsets();
  }
  function toggleHelp(open = !helpOpen) {
    if (open === helpOpen) return;
    helpOpen = open;
    setOpen(help, open);
    helpScrim.classList.toggle("ix-open", open);
    helpBtn.setAttribute("aria-pressed", String(open));
    if (open) { hideCoach(); lastFocus = doc.activeElement; help.focus({ preventScroll: true }); }   // a coach hint would float over it
    else (lastFocus?.isConnected ? lastFocus : root).focus({ preventScroll: true });
  }
  function toggleSpeedMenu(open = !menuOpen) {
    if (open === menuOpen) return;
    menuOpen = open;
    if (open) {
      const rr = root.getBoundingClientRect(), br = speedBtn.getBoundingClientRect(), tr = bar.getBoundingClientRect();
      speedMenu.style.right = "auto";
      speedMenu.style.left = `${Math.round(Math.max(8, br.left - rr.left - 4))}px`;
      speedMenu.style.bottom = `${Math.round(rr.bottom - tr.top + 8)}px`;
    }
    speedMenu.classList.toggle("ix-open", open);
    speedBtn.setAttribute("aria-expanded", String(open));
    if (open) (speedItems.find((b) => b.getAttribute("aria-checked") === "true") ?? speedItems[0]).focus({ preventScroll: true });
  }
  on(speedMenu, "keydown", (e) => {
    const i = speedItems.indexOf(doc.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      speedItems[clamp(i + (e.key === "ArrowDown" ? 1 : -1), 0, speedItems.length - 1)].focus();
    } else if (e.key === "Tab") toggleSpeedMenu(false);
  });
  // popovers over the dock: hover opens them for a glance, a click pins them open
  const dockRect = () => {
    const rr = root.getBoundingClientRect(), br = bar.getBoundingClientRect();
    return { rr, br, bottom: Math.round(rr.bottom - br.top + 8) };
  };
  function placePop(pop, anchor) {
    const { rr, bottom } = dockRect();
    const ar = anchor.getBoundingClientRect();
    pop.style.bottom = `${bottom}px`;
    if (S.size === "phone") { pop.style.left = ""; pop.style.transform = ""; if (pop === meterBox) pop.style.bottom = ""; return; }
    const w = pop.offsetWidth, W = rr.width;
    const x = clamp(ar.right - rr.left - w, 8, Math.max(8, W - w - 8));
    pop.style.left = "0px";
    pop.style.transform = `translate3d(${Math.round(x)}px,0,0)`;
  }
  let popTimer = 0;
  function toggleReadout(mode = readoutOpen ? false : "pinned") {
    if (mode && meters.length === 0) mode = false;
    if (mode === readoutOpen) return;
    const was = readoutOpen;
    readoutOpen = mode;
    if (mode && legendOpen) toggleLegend(false);
    if (mode) { renderSparks(true); placePop(meterBox, stats); }
    meterBox.classList.toggle("ix-open", !!mode);
    meterBox.classList.toggle("ix-pinned", mode === "pinned");
    stats.setAttribute("aria-expanded", String(!!mode));
    if (!mode && was === "pinned" && meterBox.contains(doc.activeElement)) stats.focus({ preventScroll: true });
    syncSheets();
  }
  function toggleLegend(mode = legendOpen ? false : "pinned") {
    if (mode && !legend.childElementCount) mode = false;
    if (mode === legendOpen) return;
    legendOpen = mode;
    if (mode && readoutOpen) toggleReadout(false);
    if (mode) placePop(legend, legendBtn);
    legend.classList.toggle("ix-open", !!mode);
    legendBtn.setAttribute("aria-expanded", String(!!mode));
    obstaclesDirty = true;
  }
  const hoverPop = (trigger, pop, toggle, isOpen) => {
    const enter = (e) => {
      if (e.pointerType === "touch") return;
      cancel(popTimer);
      if (!isOpen()) popTimer = later(() => toggle("hover"), 140);
    };
    const leave = (e) => {
      if (e.pointerType === "touch") return;
      cancel(popTimer);
      if (isOpen() === "hover") popTimer = later(() => { if (isOpen() === "hover") toggle(false); }, 220);
    };
    on(trigger, "pointerenter", enter); on(trigger, "pointerleave", leave);
    on(pop, "pointerenter", (e) => { if (e.pointerType !== "touch") cancel(popTimer); }); on(pop, "pointerleave", leave);
  };
  hoverPop(legendBtn, legend, (m) => toggleLegend(m), () => legendOpen);
  function toggleAbout(open = !aboutOpen) {
    if (open === aboutOpen) return;
    aboutOpen = open;
    setOpen(about, open);
    aboutBtn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("ix-about-open", open);
  }
  /** Close the topmost overlay; returns true if something closed. */
  function closeTop() {
    if (introOpen) { closeIntro("dismiss"); return true; }
    if (helpOpen) { toggleHelp(false); return true; }
    if (coachName) { hideCoach(); return true; }
    if (menuOpen) { toggleSpeedMenu(false); speedBtn.focus({ preventScroll: true }); return true; }
    if (storyOpen) { toggleStoryMenu(false); return true; }
    if (aboutOpen) { toggleAbout(false); aboutBtn.focus({ preventScroll: true }); return true; }
    if (readoutOpen) { toggleReadout(false); return true; }
    if (legendOpen) { toggleLegend(false); return true; }
    if (drawerOpen) { toggleDrawer(false); return true; }
    if (pinCard.shown) { hideCard(pinCard); fire("onUnpin"); return true; }
    if (Q.q && Q.revealed) { hidePredict(); return true; }
    if (explain.closeSheet()) return true;
    if (codeOpen) { toggleCode(false); return true; }
    return false;
  }
  on(doc, "pointerdown", (e) => {
    if (menuOpen && !speedWrap.contains(e.target) && !speedMenu.contains(e.target)) toggleSpeedMenu(false);
    if (storyOpen && !storyBtn.contains(e.target) && !storyMenu.contains(e.target)) toggleStoryMenu(false);
    if (aboutOpen && !about.contains(e.target) && !headRow.contains(e.target)) toggleAbout(false);
    if (readoutOpen === "pinned" && S.size !== "phone" && !stats.contains(e.target) && !meterBox.contains(e.target)) toggleReadout(false);
    if (legendOpen && !legendBtn.contains(e.target) && !legend.contains(e.target)) toggleLegend(false);
  }, true);

  // keep Tab inside a modal card
  const trap = (el, e) => {
    if (e.key !== "Tab") return;
    const f = [...el.querySelectorAll("button, [href], input, select, textarea, [tabindex]")]
      .filter((x) => x.tabIndex >= 0 && !x.disabled && x.getClientRects().length > 0);
    if (!f.length) { e.preventDefault(); return; }
    const i = f.indexOf(doc.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
  };
  on(help, "keydown", (e) => trap(help, e));
  on(intro, "keydown", (e) => trap(intro, e));

  // ---------- start card: what this is and how to begin, over the dimmed world ----------
  let introOpen = false;
  const introTitle = h("h2", { class: "ix-intro-title", id: uid("intro-title") });
  const introSub = h("p", { class: "ix-intro-sub", id: uid("intro-sub") });
  const introPlayWord = h("span", { text: "Play" });
  const introPlay = h("button", { class: "ix-cta", type: "button", onclick: () => closeIntro(introBack ? "resume" : "play") }, h("span", { class: "ix-cta-icon", html: ICON.play }), introPlayWord);
  const introStep = h("button", { class: "ix-cta-2", type: "button", onclick: () => closeIntro(introBack ? "restart" : "step") }, "Step through it yourself");
  const introPath = h("p", { class: "ix-intro-path", "aria-label": "Chapters" });
  // a returning reader: "Welcome back" over the title, and where they stopped under it (journey.mjs)
  const introKicker = h("p", { class: "ix-intro-kicker", hidden: true });
  const introWhere = h("p", { class: "ix-intro-where", hidden: true });
  // what the reader is signing up for, from the run: "5 chapters · about 3 min · 4 questions · then 3 what-ifs"
  const introPromise = h("p", { class: "ix-intro-promise", hidden: true });
  // the level, asked once up front (built when the figure turns out to have a lesson), and what the chosen one changes
  const introLevel = h("div", { class: "ix-intro-level", hidden: true });
  const introNote = h("p", { class: "ix-intro-level-note", "aria-live": "polite" });
  const kbs = (...ks) => ks.map((k) => h("kbd", { class: "ix-kbd ix-kbd-sm", text: k }));
  intro.append(
    h("div", { class: "ix-intro-head" }, introKicker, introTitle, introSub, introWhere, introPromise, introPath),
    introLevel,
    h("div", { class: "ix-intro-actions" }, introPlay, introStep),
    h("p", { class: "ix-intro-keys" }, kbs("Space"), " play", h("span", { class: "ix-dotsep", text: "·" }), kbs("←", "→"), " step"));
  // the place a returning reader is offered back: null on a first visit, under a deep link (the link says where to
  // start), or when there is nothing worth picking up. A story finished last time offers the next one.
  let introBack = null;
  function resumeOffer() {
    if (!S.steps.length || link.time != null || link.scenario != null || Object.keys(link.params).length
      || link.rest.some((p) => /^(step|scenario|level)-/.test(p))) return null;
    const r = journey.saved(S.scenarios);
    if (!r) return null;
    const story = S.scenarios.find((x) => x.id === r.scenario) ?? null;
    if (!r.end) return { ...r, story, go: { scenario: r.scenario, time: r.time, params: r.params ?? {} } };
    const after = S.scenarios.slice(S.scenarios.indexOf(story) + 1).find((x) => !journey.done.has(x.id))
      ?? S.scenarios.find((x) => !journey.done.has(x.id));
    return after ? { ...r, story, next: after, go: { scenario: after.id, fork: true } } : null;
  }
  const quote = (s) => `“${s}”`;
  // the start card asks the figure's question (meta.hook), falling back to the subtitle (the header shows only the title), and
  // names the chapters ahead when they read as ideas (not code-like ranges such as a[0..8])
  function renderIntro() {
    const m = S.meta;
    introBack = resumeOffer();
    const back = introBack, many = S.scenarios.length > 1;
    const hook = m.hook ?? m.subtitle ?? "";
    introTitle.textContent = m.title ?? "";
    introKicker.textContent = back ? "Welcome back" : "";
    introKicker.hidden = !back;
    // welcome back: where they stopped takes the hook's place (they have read the question)
    introSub.textContent = hook;
    introSub.hidden = !hook || !!back;
    introSub.classList.toggle("ix-intro-hook", !!m.hook);
    const label = back?.story ? back.story.label ?? back.story.id : "";
    const at = back && !back.end ? [back.chapter ? `You stopped in ${back.chapter}` : "You stopped", `step ${back.step + 1} of ${back.steps}`].join(", ") : "";
    introWhere.textContent = !back ? "" : back.end ? `You finished ${many ? quote(label) : "it"}. Next: ${quote(back.next.label ?? back.next.id)}.`
      : `${at}${many && label ? `, in ${quote(label)}` : ""}.`;
    introWhere.hidden = !back;
    // the promise, or for a returning reader how far through the stories they are
    const done = S.scenarios.filter((x) => journey.done.has(x.id)).length;
    introPromise.textContent = back ? (many && done ? `${done} of ${S.scenarios.length} stories finished` : "") : promise();
    introPromise.hidden = !introPromise.textContent;
    introPlayWord.textContent = !back ? "Play" : back.end ? `Start ${back.next.label ?? back.next.id}` : "Pick up where you left off";
    introStep.textContent = back ? "Start from the beginning" : "Step through it yourself";
    // the client asked for no chapter preview on the start card: newcomers don't know the terms yet
    put(introPath, []);
    introPath.hidden = true;
    if (S.lesson && !introLevel.firstChild) introLevel.append(h("p", { class: "ix-intro-level-k", text: "How well do you know this?" }), level.control(h, { cls: "ix-intro-levels" }), introNote);
    introNote.textContent = LEVELS.find((l) => l.id === level.value)?.note ?? "";
    introLevel.hidden = !S.lesson;
  }
  // the run's own size, at this level: its chapters, its length at 1× and the reading pace, the questions this level
  // asks on the way and at the end, and the stories after it
  function promise() {
    if (!S.tl || !S.steps.length) return "";
    const pace = compiledPace(S.meta) / (level.policy?.pace ?? compiledPace(S.meta));
    const questions = liveTurns(S.steps, level.value).size + checksFor(S.tl.checks, level.value).length;
    return promiseOf({ duration: S.duration, pace, chapters: S.phases.filter((p) => p.name).length, questions, stories: S.scenarios.length });
  }
  function openIntro(open = true) {
    if (open === introOpen || (open && capturing())) return;
    introOpen = open;
    if (open) {
      toggleHelp(false); toggleDrawer(false); toggleSpeedMenu(false); toggleStoryMenu(false); toggleReadout(false); toggleLegend(false); toggleAbout(false);
      hideCoach(); hideTip(); hidePreview();
      renderIntro();
    }
    setOpen(intro, open);
    introScrim.classList.toggle("ix-open", open);
    root.classList.toggle("ix-intro-open", open);
    if (open) hud.setAttribute("inert", ""); else hud.removeAttribute("inert");
    if (open) raf(() => { if (introOpen) intro.focus({ preventScroll: true }); });
    obstaclesDirty = true;
    fire("onIntro", open);
  }
  /**
   * Close the start card the way the viewer chose: "play", "step" (one step per Next) or "dismiss"; a returning reader
   * "resume" (with where: { scenario, time, params } or { scenario, fork: true } for the next story) or "restart".
   */
  function closeIntro(mode) {
    if (!introOpen) return;
    store.set(`intro:${figKey()}`, "1");
    const where = mode === "resume" ? introBack?.go ?? null : null;
    if (mode === "resume" && where?.scenario && where.scenario !== S.scenario) { S.scenario = where.scenario; renderScenario(); }
    if (mode === "restart" && S.scenarios[0] && S.scenarios[0].id !== S.scenario) { S.scenario = S.scenarios[0].id; renderScenario(); }
    openIntro(false);
    root.focus({ preventScroll: true });
    fire("onStart", mode, where);
  }

  // ---------- pauses: a chapter's end, or the run's end ----------
  // No card floats over the world. The transport's primary button says what comes next ("Continue to Shuffle", or
  // "Replay" at the end), and the words go where the words live: the explain panel's recap on wide screens, the
  // caption otherwise. At the end both carry the payoff: the takeaway, and the other scenarios as "What if…".
  const endChipsPanel = scenarioChips(true), endChipsCap = scenarioChips(true);
  const cont = () => { if (typeof cb.onContinue === "function") fire("onContinue"); else fire("onPlay"); };
  const takeaway = () => scenarioDef()?.takeaway ?? S.meta.takeaway ?? "";
  const nextChapter = () => {
    const k = S.held?.phase ?? 0;
    return S.phases[k + 1]?.name || `chapter ${k + 2}`;
  };
  function heldAction() {
    if (!S.held) return;
    if (S.held.kind === "turn") turn.primary();
    else if (S.held.kind === "end") { const after = storyAfter(); if (after) chooseScenario(after.id); else fire("onRestart"); }
    else cont();
  }
  function replayChapter() {
    if (S.held?.kind === "end") { fire("onRestart"); return; }   // at a story's end: the story again
    const ph = S.phases[S.held?.phase ?? 0];
    fire("onSeek", ph?.t0 ?? 0, { scrubbing: false });
    fire("onPlay");
  }
  // the payoff block: one sentence worth remembering, then quiet invitations to break it another way
  // meta.recap (or a scenario's own recap): 2–4 short lines on what the run showed, above the takeaway
  const recapLines = () => {
    const r = scenarioDef()?.recap ?? S.meta.recap;
    return (Array.isArray(r) ? r : r ? [r] : []).map((x) => String(x ?? "").trim()).filter(Boolean);
  };
  function recapNode() {
    const lines = recapLines();
    if (!lines.length) return null;
    return h("div", { class: "ix-recap" }, h("span", { class: "ix-recap-label", text: "What you saw" }),
      h("ol", { class: "ix-recap-list" }, lines.map((x) => h("li", null, toDOM(parse(x), doc, markupOpts)))));
  }
  function payoffNode(chips, cls, withTakeaway = true) {
    fillChips(chips);
    const t = withTakeaway ? takeaway() : "", others = chips.childElementCount > 0;
    const recap = withTakeaway && !check.done ? recapNode() : null;   // after the end check, "You can now…" stands for it
    const after = withTakeaway ? afterNode() : null;
    if (!t && !others && !recap && !after) return null;
    return h("div", { class: `ix-payoff ${cls}` }, recap,
      t ? h("p", { class: "ix-takeaway" }, toDOM(parse(t), doc, markupOpts)) : null,
      others ? h("div", { class: "ix-whatif" }, h("span", { class: "ix-whatif-label", text: "What if…" }), chips) : null,
      after);
  }
  // after the run: try it with other inputs (the knobs re-run it at once), and after the last story the lessons that
  // follow this one (lesson.next)
  function afterNode() {
    const knobsHere = Object.keys(S.params).length > 0 && !S.tl?.branch;
    const next = !storyAfter() ? (S.lesson?.next ?? []) : [];
    if (!knobsHere && !next.length) return null;
    const tryIt = knobsHere ? h("div", { class: "ix-after-row" }, h("span", { class: "ix-whatif-label", text: "Try it yourself" }),
      h("p", { class: "ix-after-text" }, "Change any input and the whole run is computed again. ",
        h("button", { class: "ix-textbtn ix-after-go", type: "button", text: "Open the parameters", onclick: () => openParams() }))) : null;
    const keep = next.length ? h("div", { class: "ix-after-row" }, h("span", { class: "ix-whatif-label", text: "Keep going" }),
      h("ul", { class: "ix-next-list" }, next.map((n) => h("li", null,
        h("a", { class: "ix-next-link", href: n.href, rel: "noopener" }, h("span", { text: n.title }), h("span", { class: "ix-next-arrow", html: ICON.arrow })),
        n.why ? h("span", { class: "ix-next-why" }, md(n.why)) : null)))) : null;
    return h("div", { class: "ix-after" }, tryIt, keep);
  }
  // the knobs: the card under the explain panel unfolds (remembered), or the drawer opens where they live in it
  function openParams() {
    if (paramsDocked) { paramsPref = "1"; store.set("params", "1"); syncParamsOpen(); paramsCard.querySelector("input, button.ix-switch")?.focus({ preventScroll: true }); }
    else toggleDrawer(true);
  }
  // a pause: { kind: "chapter" | "end", phase }, or { kind: "key", phase } when New holds after a key step to let it land
  function setHeld(v) {
    const ok = v && !capturing() && !introOpen && S.steps.length;
    const kind = v?.kind === "end" || v?.kind === "key" || v?.kind === "turn" ? v.kind : "chapter";
    const next = ok ? { kind, phase: clamp(v.phase ?? 0, 0, Math.max(0, S.phases.length - 1)) } : null;
    const a = S.held ? `${S.held.kind}:${S.held.phase}` : "", b = next ? `${next.kind}:${next.phase}` : "";
    if (a === b) return;
    S.held = next;
    root.classList.toggle("ix-held-open", !!next);
    // a story played to its end on the main run is finished for this viewer (journey.mjs): its mark in the stories
    if (kind === "end" && next && !S.tl?.branch && journey.finish(S.scenario)) renderStoryMarks();
    renderPlay();
    explain.setHeld(kind === "key" || kind === "turn" ? null : next);
    S.captionDirty = true;
    obstaclesDirty = true;
    if (!next) return;
    hideCoach();
    // say it once for screen readers, then put the keyboard on the button that continues
    const name = S.phases[next.phase]?.name;
    cancel(liveTimer);
    if (kind === "key") live.textContent = "Paused on this step. Press Enter to go on.";
    else if (kind === "turn") live.textContent = "That pick played out. Press Enter to rewind and try again.";
    else {
      const done = kind === "end" ? "Run complete" : `${name || `Chapter ${next.phase + 1}`} complete`;
      const t = kind === "end" ? takeaway() : "";
      live.textContent = `${done}. ${t ? `${toText(parse(t), markupOpts.refTitle)} ` : ""}${kind === "end" ? (storyAfter() ? `Press Enter for the next story, ${storyAfter().label ?? storyAfter().id}.` : "Press Enter to replay.") : `Press Enter to continue with ${nextChapter()}.`}`;
    }
    if (keyboardMode) raf(() => { if (S.held) playBtn.focus({ preventScroll: true }); });
  }

  // where the reader is, for a later visit (journey.mjs): once per step on the main run, never in capture, never in a
  // detour, and not in the first seconds (a reader who closes a "Welcome back" card keeps the place it offered)
  let savedKey = "";
  function saveProgress() {
    if (capturing() || introOpen || destroyed || !S.steps.length || S.tl?.branch || S.detour || S.step < 0) return;
    const end = S.held?.kind === "end";
    if (!end && S.time < 2) return;
    const params = paramOverrides(S.values, S.params, scenarioDef());
    const key = `${S.scenario}|${S.step}|${end ? 1 : 0}|${JSON.stringify(params)}`;
    if (key === savedKey) return;
    savedKey = key;
    const k = phaseAt(S.step);
    journey.save({ scenario: S.scenario, time: S.time, step: S.step, steps: S.steps.length, chapter: S.phases[k]?.name ?? "", phase: k, params, end });
  }

  // ---------- coach hints: small one-time pointers, each shown once and remembered ----------
  let coachName = null, coachTimer = 0;
  function hint(name, text, at, o = {}) {
    if (coachName || introOpen || helpOpen || S.held || Q.q || capturing() || destroyed || store.get(`hint:${name}`)) return false;
    const pt = typeof at === "function" ? at() : at;
    if (!pt) return false;
    store.set(`hint:${name}`, "1");
    coachName = name;
    put(coach, h("span", { class: "ix-coach-dot", "aria-hidden": "true" }),
      h("span", { class: "ix-coach-text" }, h("span", { class: "ix-coach-main", text }), o.sub ? h("span", { class: "ix-coach-sub", text: o.sub }) : null),
      h("button", { class: "ix-coach-ok", type: "button", text: "Got it", onclick: () => hideCoach() }));
    const W = S.W || root.clientWidth;
    const w = coach.offsetWidth, ch = coach.offsetHeight;
    const left = clamp(pt.x - w / 2, 12, Math.max(12, W - w - 12));
    // never over the caption: lift clear of its text and reach down to the anchor with a thin stem
    let bottom = pt.y - 10;
    const capEl = capCur?.querySelector(".ix-cap-text");
    if (capEl && !o.free) {
      const rr = root.getBoundingClientRect();
      textRange.selectNodeContents(capEl);
      const cr = textRange.getBoundingClientRect();
      const ct = cr.top - rr.top, cl = cr.left - rr.left, crt = cr.right - rr.left;
      if (cr.width && left < crt + 8 && left + w > cl - 8 && bottom > ct - 10 && pt.y > ct) bottom = ct - 14;
    }
    const topY = Math.max(12, bottom - ch);
    coach.style.transform = `translate3d(${Math.round(left)}px,${Math.round(topY)}px,0)`;
    coach.style.setProperty("--cx", `${Math.round(clamp(pt.x - left, 18, w - 18))}px`);
    coach.style.setProperty("--stem", `${Math.max(0, Math.round(pt.y - (topY + ch) - 10))}px`);
    coach.dataset.hint = name;
    setOpen(coach, true);
    cancel(coachTimer);
    coachTimer = later(() => hideCoach(), o.duration ?? 9000);
    return true;
  }
  function hideCoach(name) {
    if (!coachName || (name && name !== coachName)) return;
    coachName = null;
    cancel(coachTimer);
    if (coach.contains(doc.activeElement)) root.focus({ preventScroll: true });
    setOpen(coach, false);
  }
  const barTop = () => bar.getBoundingClientRect().top - root.getBoundingClientRect().top - 2;
  const scrubAnchor = () => {
    const rr = root.getBoundingClientRect(), sr = scrub.getBoundingClientRect();
    if (!sr.width) return null;
    const p = S.span ? clamp(S.time / S.span, 0, 1) : 0;
    return { x: sr.left - rr.left + p * sr.width, y: barTop() };
  };
  const nextAnchor = () => {
    const rr = root.getBoundingClientRect(), b = fwdBtn.getBoundingClientRect();
    return b.width ? { x: b.left - rr.left + b.width / 2, y: barTop() } : null;
  };

  // ---------- theme, fullscreen, play, speed ----------
  function setTheme(t) {
    S.theme = applyTheme(root, t);
    presenter.restyle();
    // the icon and the name say where the button goes, not where the page is
    const label = S.theme === "dark" ? "Light mode" : "Dark mode";
    themeBtn.innerHTML = S.theme === "dark" ? ICON.sun : ICON.moon;
    themeBtn.setAttribute("aria-label", label);
    themeBtn.dataset.tip = label;
  }
  function toggleTheme() {
    const next = S.theme === "dark" ? "light" : "dark";
    setTheme(next);
    fire("onTheme", next);
  }
  const isFull = () => (doc.fullscreenElement ?? doc.webkitFullscreenElement) === root;
  function toggleFullscreen() {
    try {
      if (isFull()) (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
      else (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root)?.catch?.(() => {});
    } catch { /* not allowed here */ }
  }
  const onFsChange = () => {
    const f = isFull();
    fullBtn.innerHTML = f ? ICON.unfull : ICON.full;
    fullBtn.setAttribute("aria-label", f ? "Exit full screen" : "Full screen");
    fullBtn.dataset.tip = f ? "Exit full screen" : "Full screen";
    fullBtn.setAttribute("aria-pressed", String(f));
    root.classList.toggle("ix-fullscreen", f);
    fire("onFullscreen", f);
  };
  on(doc, "fullscreenchange", onFsChange);
  on(doc, "webkitfullscreenchange", onFsChange);

  // the story after this one, the way on from a story's end (none after the last: Replay, and the lesson's next steps)
  const storyAfter = () => (S.tl?.branch ? null : nextStory(S.scenarios, S.scenario));
  // an open question is the one way on: the transport says so rather than offer a Play that would only stop again
  // (syncAsk keeps this in step with the predict card and the pick)
  let askingNow = false, checkingNow = false;
  function renderPlay() {
    const hv = S.playing ? null : S.held;
    const after = hv?.kind === "end" ? storyAfter() : null, ask = !hv && !S.playing && askingNow;
    const icon = hv ? (after ? ICON.next : hv.kind === "end" || hv.kind === "turn" ? ICON.replay : ICON.next) : S.playing ? ICON.pause : ICON.play;
    const word = hv ? (hv.kind === "end" ? "Replay" : hv.kind === "key" ? "Continue" : hv.kind === "turn" ? "Rewind and try again" : `Continue to ${nextChapter()}`)
      : ask ? "Answer to go on" : S.playing ? "Pause" : "Play";
    const name = after ? `Next story: ${after.label ?? after.id}` : hv ? (hv.kind === "end" ? "Replay from the start" : word) : word;
    if (playBtn._iconKey !== icon) { playBtn._iconKey = icon; playBtn._icon.innerHTML = icon; }
    // "Continue to Shuffle  Enter": the chapter it goes to, then the key; a phone keeps the verb alone
    if (after) put(playBtn._word, h("span", { class: "ix-tp-verb", text: "Next story" }), h("span", { class: "ix-tp-more ix-tp-story", text: `: ${after.label ?? after.id}` }), h("kbd", { class: "ix-tp-kbd", text: "Enter" }));
    else if (hv && hv.kind !== "end") put(playBtn._word, h("span", { class: "ix-tp-verb", text: hv.kind === "turn" ? "Rewind" : "Continue" }),
      hv.kind === "turn" ? h("span", { class: "ix-tp-more", text: "and try again" }) : null,
      hv.kind === "chapter" ? h("span", { class: "ix-tp-more", text: `to ${nextChapter()}` }) : null, h("kbd", { class: "ix-tp-kbd", text: "Enter" }));
    else playBtn._word.textContent = word;
    playBtn.setAttribute("aria-label", name);
    playBtn.dataset.tip = name;
    if (ask) delete playBtn.dataset.kbd; else playBtn.dataset.kbd = hv ? "Enter" : "Space";
    playBtn.classList.toggle("ix-continue", !!hv && (hv.kind !== "end" || !!after));
    playBtn.classList.toggle("ix-held-btn", !!hv);
    playBtn.classList.toggle("ix-asking-btn", ask);
    // the end check is the way on while it asks: the pill after it waits, quiet, and turns solid once it is done
    playBtn.classList.toggle("ix-quiet-held", hv?.kind === "end" && checkingNow);
    // at a chapter's pause, Replay is this chapter; at a story's end with a next story, it is this story again
    againBtn.hidden = !(hv && (hv.kind === "chapter" || after));
    againBtn.classList.toggle("ix-again-end", !!after);
    againBtn.setAttribute("aria-label", after ? "Replay this story" : "Replay this chapter");
    againBtn.dataset.tip = after ? "Replay this story" : "Replay this chapter";
    // a pause has one way on: Continue (or Replay at the end), so Next steps aside rather than say it twice
    fwdBtn.hidden = !!hv || ask;
    root.classList.toggle("ix-playing", S.playing);
  }
  function togglePlay() {
    if (S.held?.kind === "turn" && !S.playing) { heldAction(); return; }
    if (typeof cb.onToggle === "function") fire("onToggle");
    else fire(S.playing ? "onPause" : "onPlay");
    S.playing = !S.playing;
    renderPlay();
  }
  function renderSpeed() {
    speedVal.textContent = `${S.speed}×`;
    speedBtn.setAttribute("aria-label", `Speed, ${S.speed}×`);
    speedItems.forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.x === S.speed)));
  }
  function setSpeed(x) {
    if (!(x > 0)) return;
    S.speed = x;
    renderSpeed();
    fire("onSpeed", x);
  }
  function nudgeSpeed(dir) {
    const sp = MOTION.speeds;
    let i = sp.findIndex((x) => x >= S.speed - 1e-9);
    if (i < 0) i = sp.length - 1;
    if (dir < 0 && sp[i] > S.speed + 1e-9) i--;
    setSpeed(sp[clamp(i + dir, 0, sp.length - 1)]);
  }

  // ---------- timeline / scrubber ----------
  let segFills = [], labelEls = [], tickSig = "";
  function setTimeline(tl) {
    S.tl = tl;
    S.lesson = lessonOf(tl);
    syncParamsOpen();   // a lesson starts the knobs folded
    S.steps = tl?.steps ?? [];
    S.duration = tl?.duration ?? (S.steps.length ? S.steps[S.steps.length - 1].t1 : 0);
    S.phases = tl?.phases?.length ? tl.phases : [{ name: "", step: 0, t0: 0, t1: S.duration }];
    // a branch reads as a detour from the main run: the scrubber keeps its chapters and length (S.span)
    if (!tl?.branch) S.main = tl;
    S.detour = detourOf(tl, S.main);
    S.span = S.detour?.span ?? S.duration;
    S.keyIndex = new Map((tl?.keys ?? []).map((k) => [String(k.name), k.index]));
    S.keyNames = new Map((tl?.keys ?? []).map((k) => [k.index, String(k.name)]));
    if (tl?.counters) S.counters = tl.counters;
    buildScrubber();
    buildMeters();
    legendSig = "\u0000";
    S.step = clamp(S.step, -1, S.steps.length - 1);
    S.captionDirty = true;
    S.phase = -1;
    revealedAsks.clear();
    if (!tl?.branch) check.set(checksFor(tl?.checks, level.value));
    explain.setTimeline(tl);
    renderCount();
    scrub.setAttribute("aria-valuemax", String(+S.duration.toFixed(2)));
    precomputeHistory(tl);
    if (S.step >= 0) onStep(S.step);
    if (introOpen) renderIntro();
  }
  function buildScrubber() {
    const D = S.span || 1;
    const phases = S.detour?.main.phases ?? S.phases;
    const segs = phases.map((p, i) => {
      const t1 = i + 1 < phases.length ? phases[i + 1].t0 : D;
      return { name: p.name ?? "", t0: p.t0 ?? 0, t1: p.t1 ?? t1, last: i === phases.length - 1 };
    });
    const pos = (sg) => ({ left: `${(sg.t0 / D) * 100}%`, width: `calc(${((sg.t1 - sg.t0) / D) * 100}% - ${sg.last ? 0 : 3}px)` });
    const mk = () => segs.map((sg) => { const e = h("div", { class: "ix-seg" }); Object.assign(e.style, pos(sg)); return e; });
    segBase.replaceChildren(...mk());
    segFills = mk();
    segFill.replaceChildren(...segFills);
    labelEls = segs.map((sg) => {
      const e = h("div", { class: "ix-seg-label", text: sg.name });
      Object.assign(e.style, pos(sg));
      e._seg = sg;
      return e;
    });
    labels.replaceChildren(...labelEls);
    scrub.classList.toggle("ix-has-labels", segs.some((sg) => sg.name));
    scrub.classList.toggle("ix-on-detour", !!S.detour);
    detourBand.hidden = !S.detour;
    if (S.detour) Object.assign(detourBand.style, { left: `${(S.detour.t0 / D) * 100}%`, width: `${((S.detour.t1 - S.detour.t0) / D) * 100}%` });
    if (S.detour) markLabels(S.detour.phase);
    fitLabels();
    // event ticks, one per step and tone; ask steps get a marker of their own
    const seen = new Set();
    const tk = [];
    for (const ev of S.tl?.events ?? []) {
      const tone = toneOfKind(String(ev.kind ?? ""));
      const k = `${ev.step}|${tone}`;
      if (seen.has(k) || tk.length > 400) continue;
      seen.add(k);
      tk.push([ev.t, tone]);
    }
    S.steps.forEach((st) => { if (st.ask || st.choose) tk.push([st.t0, "ask"]); });
    const sig = tk.map((x) => x.join()).join(";") + D;
    if (sig !== tickSig) {
      tickSig = sig;
      ticks.replaceChildren(...tk.map(([t, tone]) => {
        const e = h("i", { class: `ix-tick${tone ? ` ix-tick-${tone}` : ""}` });
        e.style.left = `${clamp(t / D, 0, 1) * 100}%`;
        return e;
      }));
    }
    lastP = -1;
    renderPlayhead(S.time);
  }
  function fitLabels() {
    const W = scrub.clientWidth;
    if (!W) return;
    const D = S.span || 1;
    const fs = presenter.on ? 12.5 : S.size === "phone" ? 9.5 : 10;   // the projector's labels are a size up
    const need = (sg) => sg.name.length * (fs * 0.6 + fs * 0.1) + 4;
    const fits = labelEls.map((e) => !e._seg.name || ((e._seg.t1 - e._seg.t0) / D) * W - 3 >= need(e._seg));
    // every name fits over its segment: show them all. Otherwise a lone name (the first chapter's, say) would read as
    // the current chapter, so show only the playhead's chapter (S.phase), free to overhang its segment
    const all = fits.every(Boolean), cur = S.detour ? S.detour.phase : Math.max(0, S.phase);
    labelEls.forEach((e, i) => {
      const sg = e._seg;
      if (all || i !== cur) {
        e.classList.remove("ix-solo");
        e.style.left = `${(sg.t0 / D) * 100}%`; e.style.width = `calc(${((sg.t1 - sg.t0) / D) * 100}% - ${sg.last ? 0 : 3}px)`;
        e.classList.toggle("ix-hide", !all);   // a cut-off name reads worse than none
        return;
      }
      const w = Math.min(W, need(sg));
      e.classList.add("ix-solo");
      e.classList.remove("ix-hide");
      e.style.width = `${w}px`;
      e.style.left = `${clamp((sg.t0 / D) * W, 0, Math.max(0, W - w))}px`;
    });
  }
  let lastP = -1;
  function renderPlayhead(t) {
    const p = S.span > 0 ? clamp(t / S.span, 0, 1) : 0;
    if (Math.abs(p - lastP) < 0.00015) return;
    lastP = p;
    playhead.style.transform = `translate3d(${(p * 100).toFixed(3)}%,0,0)`;
    // on a detour the main run's fill stops at the pick and the detour's own fill runs on from it
    const d = S.detour, main = d ? Math.min(p, d.t0 / S.span) : p;
    segFill.style.clipPath = `inset(0 ${((1 - main) * 100).toFixed(3)}% 0 0)`;
    if (d) detourFill.style.clipPath = `inset(0 ${((1 - clamp((t - d.t0) / Math.max(1e-6, d.t1 - d.t0), 0, 1)) * 100).toFixed(3)}% 0 0)`;
  }
  /** The chapter labels' current one (on a detour: the pick's chapter of the main run, whatever the branch calls it). */
  function markLabels(ph) {
    labelEls.forEach((e, i) => { e.classList.toggle("ix-cur", i === ph); e.classList.toggle("ix-past", i < ph); });
  }
  function stepAt(t) {
    const st = S.steps;
    let lo = 0, hi = st.length - 1, ans = 0;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (st[m].t0 <= t + 1e-9) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans;
  }
  function phaseAt(step) {
    let idx = 0;
    for (let i = 0; i < S.phases.length; i++) if ((S.phases[i].step ?? 0) <= step) idx = i;
    return idx;
  }
  function renderCount() {
    // on a detour the count is the detour's own steps, from the pick, under its name
    const k = S.detour?.step ?? 0, n = S.steps.length - k;
    const digits = String(Math.max(1, n)).length;
    countCur.style.minWidth = `${digits}ch`;
    countTot.textContent = String(n);
    countTag.hidden = !S.detour;
    countCur.textContent = String(clamp(S.step - k, 0, n - 1) + 1);
  }

  // scrubbing with the pointer
  let scrubbing = false, scrubRect = null, scrubT = 0, seekRaf = 0, hoverStep = -1;
  const timeAtX = (clientX) => {
    const r = scrubRect ?? scrub.getBoundingClientRect();
    return clamp((clientX - r.left) / Math.max(1, r.width), 0, 1) * S.span;
  };
  const emitSeek = () => { seekRaf = 0; fire("onSeek", scrubT, { scrubbing: true }); };
  on(scrub, "pointerdown", (e) => {
    if (e.button !== 0 || !S.duration) return;
    e.preventDefault();
    hideCoach("scrub");
    scrub.focus({ preventScroll: true });
    scrub.setPointerCapture?.(e.pointerId);
    scrubRect = scrub.getBoundingClientRect();
    scrubbing = true;
    root.classList.add("ix-scrubbing");
    scrubT = timeAtX(e.clientX);
    renderPlayhead(scrubT);
    showPreview(e.clientX);
    fire("onSeek", scrubT, { scrubbing: true });
  });
  on(scrub, "pointermove", (e) => {
    if (scrubbing) {
      scrubT = timeAtX(e.clientX);
      renderPlayhead(scrubT);
      if (!seekRaf) seekRaf = raf(emitSeek);
    }
    if (e.pointerType !== "touch" || scrubbing) showPreview(e.clientX);
  });
  const endScrub = (e) => {
    if (!scrubbing) return;
    scrubbing = false;
    root.classList.remove("ix-scrubbing");
    if (seekRaf) { win.cancelAnimationFrame(seekRaf); seekRaf = 0; }
    scrubT = timeAtX(e.clientX);
    scrubRect = null;
    fire("onSeek", scrubT, { scrubbing: false });
    S.time = scrubT;
    if (e.pointerType === "touch") hidePreview();
    scheduleHash(true);
    announce();
  };
  on(scrub, "pointerup", endScrub);
  on(scrub, "pointercancel", endScrub);
  on(scrub, "pointerleave", () => { if (!scrubbing) hidePreview(); });
  on(scrub, "keydown", (e) => {
    const k = e.key;
    if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault(); e.stopPropagation();
      const d = k === "ArrowRight" || k === "ArrowUp" ? 1 : -1;
      if (e.shiftKey) fire("onPhase", d); else fire("onStep", d);
    } else if (k === "PageUp" || k === "PageDown") {
      e.preventDefault(); e.stopPropagation(); fire("onPhase", k === "PageDown" ? 1 : -1);
    }
  });
  function showPreview(clientX) {
    if (!S.steps.length) return;
    const r = scrubRect ?? scrub.getBoundingClientRect();
    const x = clamp(clientX - r.left, 0, r.width);
    const t = (x / Math.max(1, r.width)) * S.span;
    const i = stepAt(t);
    if (i !== hoverStep) {
      hoverStep = i;
      const st = S.steps[i];
      const ph = S.phases[phaseAt(i)]?.name;
      previewMeta.textContent = S.detour && i >= S.detour.step ? `Detour · Step ${i - S.detour.step + 1} of ${S.steps.length - S.detour.step}`
        : `${ph ? `${ph} · ` : ""}Step ${i + 1} of ${S.steps.length}`;
      previewText.replaceChildren(toDOM(parse(st.caption ?? ""), doc, markupOpts));
      preview._w = 0;
    }
    if (!preview._w) {
      preview._w = preview.offsetWidth || 300;
      const rr = root.getBoundingClientRect(), tr = bar.getBoundingClientRect();
      preview._x0 = r.left - rr.left;
      preview._minX = tr.left - rr.left;
      preview._maxX = tr.right - rr.left - preview._w;
      preview.style.bottom = `${Math.round(rr.bottom - tr.top + 8)}px`;
    }
    const left = clamp(preview._x0 + x - preview._w / 2, preview._minX, preview._maxX);
    preview.style.transform = `translate3d(${left.toFixed(1)}px,0,0)`;
    preview.classList.add("ix-show");
    hoverLine.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    scrub.classList.add("ix-hovering");
  }
  function hidePreview() {
    preview.classList.remove("ix-show");
    preview._w = 0;
    scrub.classList.remove("ix-hovering");
    hoverStep = -1;
  }

  // ---------- captions ----------
  const markupOpts = {
    keyIndex: (name) => S.keyIndex.get(String(name)) ?? null,
    refTitle: (id) => S.entities?.get?.(id)?.title ?? null,
    // {term:name}: the plain definition from meta.terms (the tooltip and the explain panel's first-use note show it)
    term: (name) => termOf(S.lesson, S.meta, name)?.def ?? null,
  };
  const md = (src) => toDOM(parse(src ?? ""), doc, markupOpts);
  // the caption on narrow screens tells the step in layers too (layers.mjs), keeping to the plain line, the why and its chips
  const capLayers = createLayers({ h, markup: md, refTitle: markupOpts.refTitle, onLook: (ids) => fire("onLook", ids),
    onChange: () => { S.captionDirty = true; setCaption(S.caption, S.step); }, onMore: () => explain.toggle(true) });
  let capCur = null, liveTimer = 0;
  function setCaption(markup, step) {
    // while a prediction is open its step's words are held back; at the end the takeaway replaces the last line
    const veiled = step >= 0 && step === veilStep();
    const end = S.held?.kind === "end", t = end ? takeaway() : "";
    const chapterDone = S.held && S.held.kind !== "key" && S.held.kind !== "turn";
    const nodes = parse(veiled ? VEIL : t || (markup ?? ""));
    const note = chapterDone ? h("div", { class: "ix-cap-note" }, h("span", { class: "ix-cap-check", html: ICON.check }),
      h("span", { text: end ? "Done" : `${S.phases[S.held.phase]?.name || `Chapter ${S.held.phase + 1}`} complete` })) : null;
    // narrow screens tell the step in layers; a wide screen's caption (the panel tucked away) is the sentence alone
    const layered = explain.mode === "sheet" && !chapterDone && !veiled && step >= 0 && !!S.steps[step];
    const el = layered ? layeredCaption(markup, step)
      : h("div", { class: `ix-cap${end && t ? " ix-cap-takeaway" : ""}` }, note, h("p", { class: "ix-cap-text" }, toDOM(nodes, doc, markupOpts)),
        end ? payoffNode(endChipsCap, "ix-payoff-cap", false) ?? null : null);
    const instant = scrubbing || !capCur || S.captionDirty || capturing();
    S.captionDirty = false;
    // fast playback shortens the crossfade so captions never pile up
    const quick = S.playing && S.speed >= 2;
    if (quick) el.style.transitionDuration = `${UI_MS.fast}ms`;
    const old = capCur;
    capCur = el;
    if (old) {
      // an instant swap also clears captions still fading out
      if (instant) capStage.replaceChildren();
      else {
        if (quick) old.style.transitionDuration = `${UI_MS.fast}ms`;
        old.classList.add("ix-leave");
        later(() => old.remove(), (quick ? UI_MS.fast : UI_MS.caption) + 40);
      }
    }
    if (!instant) el.classList.add("ix-enter");
    capStage.append(el);
    // start the enter transition next frame instead of forcing a reflow now
    if (!instant) raf(() => el.classList.remove("ix-enter"));
    obstaclesDirty = true;
    S.capText = veiled ? "" : toText(nodes, markupOpts.refTitle);
    if (!S.held) announce();
  }
  // the step in layers, under a line that places it ("Shuffle · step 2 of 11"); the chapter's first step leads with its Now
  function layeredCaption(markup, step) {
    const L = layersOf(S.steps[step]), P = level.policy;
    const k = phaseAt(step), ph = S.phases[k] ?? { name: "", step: 0 };
    const first = ph.step ?? 0, end = k + 1 < S.phases.length ? S.phases[k + 1].step : S.steps.length;
    const enter = step === first && P.entry !== "off" ? enterOf(ph) : null;
    const where = [ph.name, `step ${step - first + 1} of ${end - first}`].filter(Boolean).join(" · ");
    const block = capLayers.build(step, L, { policy: P, lesson: S.lesson, plain: markup && markup !== L.plain ? markup : null,
      where: "caption", plainClass: "ix-cap-text", compact: S.size === "phone" });
    return h("div", { class: "ix-cap ix-cap-layered" }, h("div", { class: "ix-cap-meta", text: where }),
      enter ? h("p", { class: "ix-cap-now" }, h("span", { class: "ix-l-label", text: "Now" }), h("span", null, md(enter.now))) : null, block);
  }
  function announce() {
    cancel(liveTimer);
    if (scrubbing) return;
    liveTimer = later(() => { if (live.textContent !== S.capText) live.textContent = S.capText ?? ""; }, S.playing ? 700 : 250);
  }
  // ref chips in the caption, the hover preview and tags light their entity in the world
  let refHovered = null;
  const refOver = (e) => {
    const r = e.target.closest?.(".ix-ref");
    const id = r?.dataset.ref ?? null;
    if (id !== refHovered) { refHovered = id; fire("onRefHover", id); }
  };
  on(caption, "pointerover", refOver);
  on(caption, "pointerleave", () => { if (refHovered) { refHovered = null; fire("onRefHover", null); } });
  on(caption, "focusin", refOver);
  // clicking an entity chip (or Enter on it) pins the inspector on that entity
  const refPick = (r) => {
    const rr = root.getBoundingClientRect(), b = r.getBoundingClientRect();
    fire("onRefSelect", r.dataset.ref, { x: b.left - rr.left + b.width / 2, y: b.top - rr.top });
  };
  on(caption, "click", (e) => { const r = e.target.closest?.(".ix-ref"); if (r) refPick(r); });
  on(caption, "keydown", (e) => {
    const r = e.target.closest?.(".ix-ref");
    if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); refPick(r); }
  });
  on(caption, "focusout", () => { if (refHovered) { refHovered = null; fire("onRefHover", null); } });

  // ---------- explain panel (explain.mjs): what is happening and why, beside the world or in a card ----------
  const explain = createExplain({ root, doc, h, parent: hud, caption, bar, store, markupOpts, markup: md, level,
    term: (name) => termOf(S.lesson, S.meta, name),
    onLook: (ids) => fire("onLook", ids),
    instant: () => still() || scrubbing,
    veil: () => ({ step: veilStep(), about: aboutWithheld }),
    revealed: () => !!(Q.q && Q.revealed),
    payoff: () => payoffNode(endChipsPanel, "ix-payoff-panel"),
    // narrow screens: the end's card (it hides the caption while open) carries the recap and the takeaway
    recap: () => {
      const r = recapNode(), t = takeaway(), a = afterNode();
      return r || t || a ? h("div", { class: "ix-payoff ix-payoff-sheet" }, r, t ? h("p", { class: "ix-takeaway" }, toDOM(parse(t), doc, markupOpts)) : null, a) : null;
    },
    onDock: () => hostPredict(),
    onJump: (i) => { const st = S.steps[i]; if (st) { fire("onPause"); fire("onSeek", st.t0, { scrubbing: false }); } },
    onLayout: () => { obstaclesDirty = true; updateInsets(); } });
  const fold = createFold({ root, doc, h, caption, panel: explain.panel, scrub, docked: () => explain.mode === "docked" && explain.open,
    onRewind: () => fire("onSeek", 0, { scrubbing: false }) });
  on(explain.panel, "pointerover", refOver);
  on(explain.panel, "pointerleave", () => { if (refHovered) { refHovered = null; fire("onRefHover", null); } });
  on(explain.panel, "click", (e) => { const r = e.target.closest?.(".ix-ref"); if (r) refPick(r); });

  // ---------- meters ----------
  let meters = [], meterSig = "", countRaf = 0;
  // A label never truncates: it wraps, and a definition's optional `short` replaces it where space is tight. Its
  // optional `hint` (one plain line on what the number means) sits under it in the readout.
  const meterLabel = (def, name) => h("span", { class: `ix-meter-label${def.short ? " ix-has-short" : ""}` },
    h("span", { class: "ix-ml-full", text: def.label ?? name }), def.short ? h("span", { class: "ix-ml-short", text: def.short }) : null,
    def.hint ? h("span", { class: "ix-meter-hint", text: def.hint }) : null);
  const meterCell = (name, def) => ({
    name, def, num: h("span", { class: "ix-meter-num" }), unit: h("span", { class: "ix-meter-unit" }),
    sNum: h("span", { class: "ix-stat-num" }), sUnit: h("span", { class: "ix-stat-unit" }),
    target: null, shown: 0, from: 0, t0: 0, n: null, u: null, hist: [], max: 0, min: 0, sparkKey: "", row: null,
  });
  // the dock's compact strip: one stat per counter (or per compare row), label over value, like the chapter bar
  const statLabel = (def, name) => h("span", { class: "ix-stat-label" }, h("span", { class: "ix-ml-full", text: def.label ?? name }),
    def.short ? h("span", { class: "ix-ml-short", text: def.short }) : null);
  // pointing at a stat explains it (a two-line tooltip: its name, then its hint)
  const statTip = (el, def, name) => { if (def.hint) { el.dataset.tip = def.hint; el.dataset.tipHead = def.label ?? name; } return el; };
  const statVal = (m) => h("span", { class: "ix-stat-val" }, m.sNum, m.sUnit);
  let statEls = [];
  // Compare mode: counters with a `group` and the same `label` share a row, one column per group (CONTRACTS 4.1).
  let cmpRows = [];
  function buildMeters() {
    const defs = S.counters ?? {};
    const sig = JSON.stringify(defs);
    if (sig === meterSig) {
      for (const m of meters) { m.hist = []; m.max = 0; m.min = 0; m.sparkKey = ""; }
      return;
    }
    meterSig = sig;
    meterList.replaceChildren();
    statsList.replaceChildren();
    statEls = [];
    meters = []; cmpRows = [];
    const entries = Object.entries(defs).filter(([, d]) => d && !d.hidden);
    for (const [name, def] of entries.filter(([, d]) => d.group == null)) {
      const m = meterCell(name, def);
      m.area = svg("path", { class: "ix-spark-area" }); m.line = svg("path", { class: "ix-spark-line" });
      m.dot = svg("circle", { class: "ix-spark-dot", r: "1.75", cx: "-9", cy: "-9" });
      const spark = svg("svg", { class: "ix-spark", viewBox: "0 0 52 18", width: "52", height: "18", "aria-hidden": "true" });
      spark.append(svg("path", { class: "ix-spark-base", d: "M1 17.25H51" }), m.area, m.line, m.dot);
      m.el = h("div", { class: "ix-meter" }, meterLabel(def, name), spark, h("span", { class: "ix-meter-val" }, m.num, m.unit));
      meterList.append(m.el);
      const st = statTip(h("span", { class: "ix-stat" }, statLabel(def, name), h("span", { class: "ix-sr", text: ": " }), statVal(m), h("span", { class: "ix-sr", text: ". " })), def, name);
      st._defs = [def];
      statsList.append(st); statEls.push(st);
      meters.push(m);
      renderMeterValue(m, 0);
    }
    const grouped = entries.filter(([, d]) => d.group != null);
    if (grouped.length) {
      const groups = [...new Set(grouped.map(([, d]) => String(d.group)))];
      const byLabel = new Map();
      for (const [name, def] of grouped) {
        const key = def.label ?? name;
        if (!byLabel.has(key)) byLabel.set(key, { label: key, def, better: def.better, cells: new Array(groups.length).fill(null) });
        const row = byLabel.get(key);
        if (!row.better && def.better) row.better = def.better;
        row.cells[groups.indexOf(String(def.group))] = meterCell(name, def);
      }
      const table = h("div", { class: "ix-cmp", role: "table", "aria-label": "Comparison" });
      table.style.setProperty("--n", String(groups.length));
      table.append(h("div", { class: "ix-cmp-row ix-cmp-head", role: "row" }, h("span", { class: "ix-cmp-corner", role: "columnheader" }),
        groups.map((g) => h("span", { class: "ix-cmp-group", role: "columnheader", text: g }))));
      for (const row of byLabel.values()) {
        const cellsEl = row.cells.map((c) => {
          if (!c) return h("span", { class: "ix-cmp-cell ix-cmp-empty", role: "cell", text: "—" });
          c.row = row;
          c.fill = h("i");
          c.el = h("span", { class: "ix-cmp-cell", role: "cell" }, h("span", { class: "ix-meter-val" }, c.num, c.unit), h("i", { class: "ix-cmp-bar", "aria-hidden": "true" }, c.fill));
          meters.push(c);
          renderMeterValue(c, 0);
          return c.el;
        });
        table.append(h("div", { class: "ix-cmp-row", role: "row" }, h("span", { class: "ix-cmp-label", role: "rowheader" }, meterLabel(row.def, row.label)), cellsEl));
        cmpRows.push(row);
        const vals = [];
        row.cells.forEach((c, i) => {
          if (i) vals.push(h("span", { class: "ix-stat-sep", text: "/" }));
          if (!c) { vals.push(h("span", { class: "ix-stat-val ix-stat-empty", text: "—" })); return; }
          c.stat = statVal(c);
          vals.push(c.stat);
        });
        const st = statTip(h("span", { class: "ix-stat ix-stat-cmp" }, statLabel(row.def, row.label), h("span", { class: "ix-sr", text: ": " }),
          h("span", { class: "ix-stat-vals" }, vals), h("span", { class: "ix-sr", text: ". " })), row.def, row.label);
        if (!row.def.hint) st.title = groups.join(" / ");
        st._defs = row.cells.filter(Boolean).map((c) => c.def);
        statsList.append(st); statEls.push(st);
      }
      meterList.append(table);
    }
    meterBox.classList.toggle("ix-has-cmp", cmpRows.length > 0);
    meterBox.classList.toggle("ix-only-cmp", cmpRows.length > 0 && meters.every((m) => m.row));
    stats.hidden = meters.length === 0;
    if (!meters.length) toggleReadout(false);
    root.classList.toggle("ix-has-meters", meters.length > 0);
    applyPrimary();
  }
  // Which stats the dock shows: counters with `primary: true`, or `primary: ["skew"]` for those scenarios only.
  // A figure that marks none shows its first three. Everything stays in the readout.
  const isPrimary = (def) => def?.primary === true || (Array.isArray(def?.primary) && def.primary.includes(S.scenario));
  function applyPrimary() {
    if (!statEls.length) return;
    const marked = statEls.some((e) => e._defs.some((d) => d?.primary));
    let on = statEls.map((e, i) => (marked ? e._defs.some(isPrimary) : i < 3));
    if (!on.some(Boolean)) on = statEls.map((_, i) => i === 0);
    if (S.dockRow) { const first = on.indexOf(true); on = on.map((_, i) => i === first); }   // the one-row dock keeps one number
    statEls.forEach((e, i) => { e.hidden = !on[i]; });
    fitSoon();
  }
  // Stats that do not fit the strip fold into "+n" (the full readout opens from it); nothing is ever cut mid-word.
  let fitRaf = 0;
  const fitSoon = () => { if (!fitRaf && !destroyed) fitRaf = raf(() => { fitRaf = 0; fitStats(); }); };
  function fitStats() {
    const shownEls = statEls.filter((e) => !e.hidden);
    if (!shownEls.length || !stats.offsetParent) return;
    for (const e of shownEls) e.classList.remove("ix-off");
    statsMore.hidden = true;
    if (statsList.scrollWidth <= statsList.clientWidth + 1) return;
    const avail = statsList.getBoundingClientRect().width;
    const ws = shownEls.map((e) => e.getBoundingClientRect().width);
    const gap = parseFloat(win.getComputedStyle(statsList).columnGap) || 0;
    statsMore.hidden = false;
    statsMore.textContent = `+${ws.length}`;
    const room = avail - statsMore.getBoundingClientRect().width - gap + 1;
    let used = 0, shown = 0;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i] + (shown ? gap : 0);
      if (used + w <= room) { used += w; shown++; } else break;
    }
    shownEls.forEach((e, i) => e.classList.toggle("ix-off", i >= shown));
    statsMore.textContent = `+${ws.length - shown}`;
  }
  // reserve each stat's widest value (known from the run's history) so the strip never jitters as numbers grow
  function reserveStats() {
    for (const m of meters) {
      const fmt = m.def.format ?? "int";
      const peak = Math.max(Math.abs(m.max), Math.abs(m.min));
      const [n] = formatCounter(m.min < 0 ? -peak : peak, fmt, m.def);
      m.sNum.style.minWidth = `${Math.max(1, String(n).length)}ch`;
    }
    fitSoon();
  }
  function renderMeterValue(m, v) {
    const fmt = m.def.format ?? "int";
    // mid count-up an int counter shows whole numbers (or its declared decimals)
    const dec = Number.isInteger(m.def.decimals) ? m.def.decimals : 0, q = 10 ** dec;
    const val = m.t0 && (fmt === "int" || fmt === "bytes") ? Math.round(v * q) / q : v;
    const [n, u] = formatCounter(val, fmt, m.def);
    if (n !== m.n) {
      if (m.n != null && String(m.n).length !== String(n).length) fitSoon();
      m.num.textContent = n; m.sNum.textContent = n; m.n = n;
    }
    if (u !== m.u) { m.unit.textContent = u; m.sUnit.textContent = u; m.u = u; m.unit.hidden = !u; m.sUnit.hidden = !u; }
    if (m.row) m.row.barsDirty = true;
  }
  // who leads each compare row (by target, so emphasis does not flicker during count-up), and the racing bars
  function renderRows(lead) {
    for (const row of cmpRows) {
      if (lead && row.leadDirty) {
        row.leadDirty = false;
        const live = row.cells.filter((c) => c && typeof c.target === "number");
        let best = null;
        if (row.better === "lower" || row.better === "higher") {
          const vals = live.map((c) => c.target);
          const b = row.better === "lower" ? Math.min(...vals) : Math.max(...vals);
          if (live.length > 1 && vals.some((v) => v !== b)) best = b;
        }
        for (const c of live) {
          const isLead = best !== null && c.target === best;
          c.el.classList.toggle("ix-lead", isLead);
          c.el.classList.toggle("ix-trail", best !== null && !isLead);
          c.stat?.classList.toggle("ix-lead", isLead);
          c.stat?.classList.toggle("ix-trail", best !== null && !isLead);
        }
      }
      if (!row.barsDirty) continue;
      row.barsDirty = false;
      let max = 0;
      for (const c of row.cells) if (c) max = Math.max(max, Math.abs(c.shown));
      for (const c of row.cells) if (c) c.fill.style.transform = `scaleX(${max > 0 ? (Math.abs(c.shown) / max).toFixed(4) : 0})`;
    }
  }
  let sparksDirty = false, rowsDirty = false;
  function setMeters(values, step) {
    for (const m of meters) {
      const raw = values[m.name];
      const v = typeof raw === "number" ? raw : Array.isArray(raw) ? raw[0] : 0;
      if (step >= 0) {
        if (m.hist[step] !== v) { m.hist[step] = v; if (v > m.max) m.max = v; if (v < m.min) m.min = v; sparksDirty = true; }
      }
      if (v === m.target) continue;
      const first = m.target === null;
      m.target = v;
      if (m.row) { m.row.leadDirty = true; rowsDirty = true; }
      if (first || scrubbing || still() || Math.abs(v - m.shown) < 1e-9) { m.t0 = 0; m.shown = v; renderMeterValue(m, v); continue; }
      m.from = m.shown; m.t0 = now();
      if (!countRaf) countRaf = raf(countLoop);
    }
  }
  function countLoop() {
    countRaf = 0;
    const t = now();
    let active = false;
    for (const m of meters) {
      if (!m.t0) continue;
      const u = Math.min(1, (t - m.t0) / UI_MS.count);
      m.shown = m.from + (m.target - m.from) * ease(u);
      if (u >= 1) { m.shown = m.target; m.t0 = 0; } else active = true;
      renderMeterValue(m, m.shown);
    }
    if (cmpRows.length) renderRows(false);
    if (active) countRaf = raf(countLoop);
  }
  function renderSparks() {
    const N = S.steps.length;
    if (N < 2) return;
    const cur = clamp(S.step, 0, N - 1);
    for (const m of meters) {
      if (!m.line) continue;
      const key = `${cur}|${m.max}|${m.min}|${m.hist[cur]}|${m.hist.length}`;
      if (key === m.sparkKey) continue;
      m.sparkKey = key;
      const lo = Math.min(0, m.min), span = (m.max - lo) || 1;
      const stride = Math.max(1, Math.ceil(N / 50));
      let d = "", last, lx = 0, ly = 0, fx = null;
      for (let i = 0; i <= cur; i++) {
        let v = m.hist[i];
        if (v === undefined) v = last;
        if (v === undefined) continue;
        last = v;
        if (i % stride && i !== cur) continue;
        lx = 1 + (i / (N - 1)) * 50;
        ly = 16.25 - ((v - lo) / span) * 14;
        if (fx === null) fx = lx;
        d += `${d ? "L" : "M"}${lx.toFixed(2)} ${ly.toFixed(2)}`;
      }
      m.line.setAttribute("d", d || "M0 0");
      m.area.setAttribute("d", d ? `${d}L${lx.toFixed(2)} 17.25L${fx.toFixed(2)} 17.25Z` : "M0 0");
      m.dot.setAttribute("cx", d ? lx.toFixed(2) : "-9");
      m.dot.setAttribute("cy", d ? ly.toFixed(2) : "-9");
    }
  }
  // fill counter history for the whole run from timeline snapshots, in idle slices, so sparklines know their scale
  let histGen = 0;
  function precomputeHistory(tl) {
    const gen = ++histGen;
    if (!tl || typeof tl.snapshot !== "function" || !meters.length) return;
    const N = S.steps.length;
    let i = 0;
    const slice = () => {
      if (gen !== histGen) return;
      const t0 = now();
      try {
        while (i < N && now() - t0 < 4) {
          const snap = i + 1 < N ? tl.snapshot(i + 1) : tl.final;
          const c = snap?.counters ?? {};
          for (const m of meters) {
            const v = typeof c[m.name] === "number" ? c[m.name] : undefined;
            if (v === undefined) continue;
            m.hist[i] = v;
            if (v > m.max) m.max = v;
            if (v < m.min) m.min = v;
          }
          i++;
        }
      } catch { return; }
      if (i < N) later(slice, 16); else { renderSparks(); reserveStats(); }
    };
    later(slice, 60);
  }

  // ---------- legend ----------
  let legendSig = "", legendScratch = new Set();
  function updateLegend(frame) {
    let present = legendScratch;
    present.clear();
    const poses = frame?.poses;
    if (Array.isArray(poses) && poses.length) {
      for (let i = 0; i < poses.length; i++) {
        const p = poses[i];
        if (p.key != null && (p.opacity ?? 1) > 0.05) present.add(p.key);
      }
    } else for (const k of S.keyNames.keys()) present.add(k);
    let sig = "";
    const ids = [...present].sort((a, b) => a - b);
    for (const k of ids) sig += k + ",";
    if (sig === legendSig) return;
    legendSig = sig;
    const items = ids.filter((k) => S.keyNames.has(k)).slice(0, 16).map((k) => {
      const c = ((k % 8) + 8) % 8;
      const sw = h("span", { class: "ix-swatch", "aria-hidden": "true" });
      sw.style.setProperty("--k", `var(--ix-key-${c})`);
      return h("span", { class: "ix-legend-item", role: "listitem" }, sw, h("span", { text: S.keyNames.get(k) }));
    });
    legend.replaceChildren(...items);
    const dots = ids.filter((k) => S.keyNames.has(k)).slice(0, 4).map((k) => {
      const d = h("i", { class: "ix-legend-dot" });
      d.style.setProperty("--k", `var(--ix-key-${((k % 8) + 8) % 8})`);
      return d;
    });
    legendDots.replaceChildren(...dots);
    legendCount.textContent = `${items.length} ${items.length === 1 ? "key" : "keys"}`;
    legendBtn.setAttribute("aria-label", `${items.length} ${items.length === 1 ? "key" : "keys"} in view`);
    obstaclesDirty = true;
    legendBtn.hidden = items.length === 0;
    if (!items.length) toggleLegend(false);
    else if (legendOpen) placePop(legend, legendBtn);
    root.classList.toggle("ix-has-legend", items.length > 0);
  }

  // ---------- predict ----------
  const Q = { q: null, sig: "", step: -1, answered: null, revealed: false, revealAt: 0, opts: [] };
  function syncAsk() {
    const on = !!Q.q && Q.answered == null && !Q.revealed && (!Q.q.kind || Q.q.kind === "choose");
    if (on !== askingNow) { askingNow = on; renderPlay(); }
  }
  // the end check open on a question (not yet "You can now…"): the transport steps back (renderPlay)
  function syncChecking() {
    const on = S.held?.kind === "end" && check.open && !check.done && predict.classList.contains("ix-open");
    if (on !== checkingNow) { checkingNow = on; renderPlay(); }
  }
  // the transport pressed while a question waits: say where the way on is, and put the keyboard there
  function pointToAnswer() {
    notice(Q.q?.kind === "choose" ? "Pick one to go on: here, or click it in the world." : "Pick an answer to go on.", { duration: 2200 });
    const first = predict.querySelector(".ix-opt:not([aria-disabled]), .ix-turn-pick:not([disabled]), .ix-predict-ponder .ix-pill");
    first?.focus({ preventScroll: true });
  }
  // The veil: until a prediction is revealed, nothing on screen may answer it. Its step's caption, tags and new legend
  // keys are held back while the card is open, and a chapter's `about` line waits until every prediction in the
  // chapter up to the playhead has been revealed (an about often states the very answer).
  const revealedAsks = new Set();
  const veilStep = () => (Q.q && !Q.revealed ? Q.step : -1);
  function aboutWithheld(k) {
    const ph = S.phases[k];
    if (!ph) return false;
    const first = ph.step ?? 0, end = k + 1 < S.phases.length ? S.phases[k + 1].step : S.steps.length;
    for (let i = first; i < end; i++) {
      if (!S.steps[i]?.ask || revealedAsks.has(i)) continue;
      if (S.step < i || (S.step === i && i === veilStep())) return true;
    }
    return false;
  }
  // wide screens: the card sits in the explain panel in the current step's place, so it never covers the world and
  // the world never shrinks for it; otherwise it rises above the caption as before
  function hostPredict() {
    if (!Q.q) { explain.hostAsk(null); if (predict.parentNode !== center) center.prepend(predict); return; }
    const docked = explain.hostAsk(predict);
    if (!docked && predict.parentNode !== center) center.prepend(predict);
    root.classList.toggle("ix-ask-docked", docked);
    obstaclesDirty = true;
    updateInsets();
  }
  let keyboardMode = false;
  on(win, "keydown", () => { keyboardMode = true; }, true);
  on(win, "pointerdown", () => { keyboardMode = false; }, true);

  // ---------- your turn: an in-world pick (turn.mjs), the end check (check.mjs), level nudges (nudge.mjs) ----------
  // They use the predict card and its place (the explain panel, or above the caption), so the calm rules hold for them.
  const nudge = createNudge({ h, level, store, key: figKey(), icon: ICON.close });
  const belief = (m, feedback) => beliefBlock(h, md, S.lesson, m, feedback);
  // open the card on what turn.mjs or check.mjs has put in it; revealed: the step's words may show under it
  function showTurn(q, o = {}) {
    Q.q = q; Q.sig = `${q.kind}:${q.id}`; Q.step = o.step ?? -1; Q.opts = o.opts ?? [];
    Q.answered = o.revealed ? 0 : null; Q.revealed = !!o.revealed; Q.revealAt = now(); Q.hold = o.hold ?? 4200;
    predict.classList.toggle("ix-revealed", !!o.revealed);
    hideCoach();
    setOpen(predict, true);
    obstaclesDirty = true;
    root.classList.toggle("ix-asking", o.asking ?? !o.revealed);
    hostPredict();
    S.captionDirty = true;
    explain.refresh();
    syncAsk();
  }
  const turnCtx = { h, md, card: predict, level, nudge, belief, icon: { check: ICON.check, cross: ICON.cross, close: ICON.close },
    keyboard: () => keyboardMode, reduced: () => still(), entities: () => S.entities, steps: () => S.steps, lesson: () => S.lesson,
    phases: () => S.phases, docked: () => explain.docked, show: showTurn, hide: () => hidePredict(), fire };
  const turn = createTurn(turnCtx);
  const check = createCheck(turnCtx);
  // the questions a story asks at this level (turn.mjs liveTurns); the rest play through
  let liveSig = null, live$ = null;
  const isLive = (step) => {
    const sig = `${S.steps.length}|${S.tl?.hash}|${level.value}`;
    if (sig !== liveSig) { liveSig = sig; live$ = liveTurns(S.steps, level.value); }
    return step < 0 || live$.has(step);
  };

  function ask(q) {
    if (!q) {
      turn.reset();
      // an answered question finishes its reveal first, then hides itself
      if (Q.q && Q.answered != null) return;
      hidePredict();
      return;
    }
    if (q.kind === "choose") {
      const k = S.steps.findIndex((st) => st.choose === q);
      if (!isLive(k)) { fire("onAnswer", q.answer); return; }
      turn.open(q, k);
      return;
    }
    if (!isLive(q.step ?? findAskStep(q))) { revealedAsks.add(q.step ?? findAskStep(q)); fire("onAnswer", -1); return; }
    const sig = `${q.question}\u0000${(q.options ?? []).join("\u0000")}`;
    if (sig === Q.sig && Q.q) return;
    Q.q = q; Q.sig = sig; Q.answered = null; Q.revealed = false;
    Q.step = q.step ?? findAskStep(q);
    const status = h("span", { class: "ix-predict-status" });
    Q.status = status;
    Q.close = iconBtn("close", "Dismiss", "Esc", () => hidePredict(), "ix-btn-sm ix-close");
    Q.close.hidden = true;
    Q.opts = (q.options ?? []).map((o, i) => h("button", {
      class: "ix-opt", type: "button", onclick: () => answer(i),
    }, h("span", { class: "ix-opt-key", text: String.fromCharCode(65 + i) }), h("span", { class: "ix-opt-text" }, md(String(o))),
    h("span", { class: "ix-opt-mark" })));
    Q.foot = h("div", { class: "ix-predict-foot", text: "Pick one, then watch." });
    const opts = h("div", { class: "ix-opts" }, Q.opts);
    // Expert: pause and ponder; the options wait behind Predict, and the question can be skipped
    const ponder = level.policy.predict === "ponder";
    const choices = ponder ? h("div", { class: "ix-predict-ponder" },
      h("button", { class: "ix-pill", type: "button", onclick: () => { choices.remove(); opts.hidden = Q.foot.hidden = false; if (keyboardMode) Q.opts[0]?.focus({ preventScroll: true }); } }, "Predict"),
      h("button", { class: "ix-pill ix-pill-quiet", type: "button", onclick: () => skipPredict() }, "Skip")) : null;
    opts.hidden = Q.foot.hidden = ponder;
    put(predict,
      h("div", { class: "ix-predict-head" }, h("span", { class: "ix-badge" }, h("i", { class: "ix-badge-dot" }), ponder ? "Think first" : "Predict"), status, Q.close),
      h("p", { class: "ix-predict-q" }, md(q.question ?? "")),
      choices, opts, Q.foot);
    predict.classList.remove("ix-revealed");
    hideCoach();
    setOpen(predict, true);
    obstaclesDirty = true;
    root.classList.add("ix-asking");
    hostPredict();
    S.captionDirty = true;
    syncAsk();
    if (keyboardMode) raf(() => (ponder ? choices.firstChild : Q.opts[0])?.focus({ preventScroll: true }));
  }
  // Expert skips a question: the run plays on, and the step's words come back with it
  function skipPredict() {
    revealedAsks.add(Q.step);
    hidePredict();
    fire("onAnswer", -1);
  }
  function findAskStep(q) {
    let best = -1;
    S.steps.forEach((st, i) => {
      const a = st.ask;
      if (a && (a === q || a.question === q.question) && (best < 0 || Math.abs(i - S.step) < Math.abs(best - S.step))) best = i;
    });
    return best >= 0 ? best : S.step + 1;
  }
  function answer(i) {
    if (Q.q?.kind === "choose") { turn.pick(i); return; }
    if (Q.q?.kind === "check") { check.answer(i); return; }
    if (!Q.q || Q.answered != null) return;
    Q.answered = i;
    Q.opts.forEach((b, j) => { b.classList.toggle("ix-chosen", j === i); b.setAttribute("aria-disabled", "true"); });
    predict.classList.add("ix-locked");
    Q.status.textContent = "Your guess";
    Q.foot.textContent = "Watch the next step.";
    fire("onAnswer", i);
    syncAsk();
  }
  function maybeReveal() {
    if (!Q.q || Q.q.kind || Q.answered == null || Q.revealed) return;
    const st = S.steps[Q.step];
    const due = st ? S.step > Q.step || (S.step === Q.step && S.time >= st.t0 + (st.dur ?? st.t1 - st.t0) * 0.7) : S.step > Q.step;
    if (!due) return;
    Q.revealed = true;
    const right = Q.q.answer;
    const ok = Q.answered === right;
    Q.opts.forEach((b, j) => {
      b.classList.toggle("ix-correct", j === right);
      b.classList.toggle("ix-wrong", j === Q.answered && !ok);
      b.lastChild.innerHTML = j === right ? ICON.check : j === Q.answered && !ok ? ICON.cross : "";
    });
    predict.classList.add("ix-revealed", ok ? "ix-right" : "ix-missed");
    root.classList.remove("ix-asking");
    Q.status.textContent = ok ? "Correct" : "Not quite";
    Q.status.className = `ix-predict-status ix-tone-${ok ? "ok" : "fail"}`;
    Q.foot.textContent = ok ? "Your prediction matches the run." : `The run shows ${String.fromCharCode(65 + right)}.`;
    // the reader's own pick answers back (each wrong option has its feedback), then the reason the answer is right
    // replaces the foot; the card stays long enough to read both
    Q.hold = 4200;
    // a wrong pick names the belief behind it ("If you thought…", lesson.misconceptions), then what the run shows
    const fb = !ok ? Q.q.feedback?.[Q.answered] : null;
    const said = [!ok && (fb?.misconception || feedbackOf(Q.q, Q.answered)) ? belief(fb?.misconception ?? null, feedbackOf(Q.q, Q.answered)) : null,
      Q.q.why ? h("p", { class: "ix-predict-why" }, h("span", { class: "ix-predict-why-label", text: "Why" }), h("span", { class: "ix-predict-why-text" }, md(String(Q.q.why)))) : null].filter(Boolean);
    nudge.note(ok, true);
    const offer = nudge.line();
    if (said.length || offer) {
      Q.foot.replaceWith(Q.foot = h("div", { class: "ix-predict-said" }, said, offer));
      Q.hold += 300 * said.reduce((n, el) => n + (el.textContent ?? "").split(/\s+/).filter(Boolean).length, 0);
    }
    Q.close.hidden = false;
    Q.revealAt = now();
    if (Q.step >= 0) revealedAsks.add(Q.step);
    S.captionDirty = true;
    legendSig = "\u0000";
    explain.refresh();
  }
  // a revealed answer stays while the figure is paused, and leaves a few seconds after playback moves on
  function predictTick() {
    if (!Q.q || !Q.revealed) return;
    const t = now();
    if (!S.playing || scrubbing) Q.revealAt = Math.max(Q.revealAt, t - 2400);
    else if (t - Q.revealAt > (Q.hold ?? 4200)) hidePredict();
  }
  function hidePredict() {
    if (!Q.q) return;
    const hadFocus = predict.contains(doc.activeElement);
    Q.q = null; Q.sig = "";
    setOpen(predict, false);
    obstaclesDirty = true;
    predict.classList.remove("ix-locked", "ix-revealed", "ix-right", "ix-missed");
    root.classList.remove("ix-asking", "ix-ask-docked");
    hostPredict();
    S.captionDirty = true;
    updateInsets();
    if (hadFocus) root.focus({ preventScroll: true });
    syncAsk();
  }

  // ---------- inspector ----------
  const fmtValue = (v, depth = 0) => {
    if (v == null) return "—";
    if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
    if (typeof v === "string") return v;
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) {
      const items = v.slice(0, 8).map((x) => fmtValue(x, depth + 1));
      return `[${items.join(", ")}${v.length > 8 ? `, … +${v.length - 8}` : ""}]`;
    }
    if (v instanceof Map) return fmtValue(Object.fromEntries(v), depth);
    if (typeof v === "object") {
      if (depth > 1) return "{…}";
      const e = Object.entries(v);
      return `{${e.slice(0, 6).map(([k, x]) => `${k}: ${fmtValue(x, depth + 1)}`).join(", ")}${e.length > 6 ? ", …" : ""}}`;
    }
    return String(v);
  };
  function renderCard(card, info) {
    const sig = JSON.stringify([info.id, info.kind, info.title, info.tone, info.state], (k, v) => (v instanceof Map ? Object.fromEntries(v) : v));
    if (sig === card.sig) return false;
    const idChanged = card.id !== info.id;
    card.sig = sig; card.id = info.id;
    const rows = [];
    const st = info.state && typeof info.state === "object" ? info.state : null;
    if (st) for (const [k, v] of Object.entries(st instanceof Map ? Object.fromEntries(st) : st)) {
      const text = fmtValue(v);
      const tone = typeof v === "string" && /^(ok|busy|warn|fail|idle)$/.test(v) ? v : null;
      rows.push(h("dt", { text: k }), h("dd", null, tone ? h("i", { class: `ix-dot ix-tone-${tone}` }) : null, text));
    }
    const tone = info.tone && /^(ok|busy|warn|fail|idle)$/.test(info.tone) ? info.tone : null;
    put(card.el, 
      h("div", { class: "ix-insp-head" },
        h("span", { class: "ix-insp-kind", text: info.kind ?? "entity" }),
        h("span", { class: "ix-insp-id", text: info.id ?? "" }),
        card.pinned ? iconBtn("close", "Unpin", "Esc", () => { hideCard(pinCard); fire("onUnpin"); }, "ix-btn-sm ix-close") : null),
      info.title && info.title !== info.id ? h("div", { class: "ix-insp-title" }, tone ? h("i", { class: `ix-dot ix-tone-${tone}` }) : null, info.title) : null,
      rows.length ? h("dl", { class: "ix-kv" }, rows) : null);
    card.w = card.el.offsetWidth; card.h = card.el.offsetHeight;
    return idChanged;
  }
  function placeCard(card, x, y) {
    const W = S.W || root.clientWidth, H = S.H || root.clientHeight;
    const m = 12, off = 16;
    if (S.size === "phone" && card.pinned) { card.el.style.transform = ""; return; }
    let left = x + off, topY = y + off;
    if (left + card.w > W - m) left = x - off - card.w;
    const floor = H - (insets.bottom || 0) - 20;
    if (topY + card.h > floor) topY = y - off - card.h;
    left = clamp(left, m, Math.max(m, W - card.w - m));
    topY = clamp(topY, m, Math.max(m, H - card.h - m));
    card.x = left; card.y = topY;
    card.el.style.transform = `translate3d(${Math.round(left)}px,${Math.round(topY)}px,0)`;
    if (card.pinned) obstaclesDirty = true;
  }
  function showCard(card) {
    if (card.shown) return;
    card.shown = true;
    card.el.classList.add("ix-show");
    if (card.pinned) syncSheets();
  }
  function hideCard(card) {
    if (!card.shown) return;
    card.shown = false;
    card.el.classList.remove("ix-show");
    card.sig = ""; card.id = null;
    if (card.pinned) syncSheets();
  }
  let lastHover = null;
  function inspect(info, o = {}) {
    const pinned = o.pinned === true;
    const card = pinned ? pinCard : hoverCard;
    if (!info) { hideCard(card); return; }
    if (!pinned && pinCard.shown && pinCard.id === info.id) { hideCard(hoverCard); return; }
    renderCard(card, info);
    const x = o.x ?? lastHover?.x ?? (S.W / 2), y = o.y ?? lastHover?.y ?? (S.H / 2);
    placeCard(card, x, y);
    showCard(card);
    if (pinned && hoverCard.id === info.id) hideCard(hoverCard);
  }

  // ---------- notices and tooltips ----------
  let toastTimer = 0;
  function notice(text, o = {}) {
    cancel(toastTimer);
    if (!text) { toast.classList.remove("ix-show"); return; }
    const sticky = o.duration === 0;
    put(toast, h("span", { class: "ix-toast-icon", html: ICON.info }), h("span", { class: "ix-toast-text", text: String(text) }),
      sticky ? iconBtn("close", "Dismiss", null, () => notice(null), "ix-btn-sm ix-close") : null);
    toast.classList.add("ix-show");
    if (!sticky) toastTimer = later(() => toast.classList.remove("ix-show"), o.duration ?? Math.min(9000, 2600 + String(text).length * 45));
  }
  let tipTimer = 0, tipFor = null;
  function showTip(el, delay, force = false) {
    cancel(tipTimer);
    if (!el?.dataset.tip || (S.size === "phone" && !force)) return;
    tipTimer = later(() => {
      if (!el.isConnected || el.closest("[inert]")) return;
      tipFor = el;
      const rich = !!el.dataset.tipHead;
      tip.classList.toggle("ix-tip-rich", rich);
      if (rich) put(tip, h("span", { class: "ix-tip-head" }, el.dataset.tipHead, el.dataset.kbd ? h("kbd", { class: "ix-kbd ix-kbd-sm", text: el.dataset.kbd }) : null),
        h("span", { class: "ix-tip-body", text: el.dataset.tip }));
      else put(tip, h("span", { text: el.dataset.tip }), el.dataset.kbd ? h("kbd", { class: "ix-kbd ix-kbd-sm", text: el.dataset.kbd }) : null);
      const rr = root.getBoundingClientRect(), br = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const below = br.top - rr.top < rr.height / 2;
      const x = clamp(br.left - rr.left + br.width / 2 - tw / 2, 8, rr.width - tw - 8);
      const y = below ? br.bottom - rr.top + 8 : br.top - rr.top - th - 8;
      tip.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
      tip.classList.add("ix-show");
      // the words under a tip can be re-rendered away (a new step in the explain panel): the tip leaves with them
      const watch = () => { if (tipFor !== el) return; if (!el.isConnected) hideTip(); else tipTimer = later(watch, 400); };
      tipTimer = later(watch, 400);
    }, delay);
  }
  function hideTip() { cancel(tipTimer); tipFor = null; tip.classList.remove("ix-show"); }
  on(hud, "pointerover", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (el === tipFor) return;
    if (!el) { hideTip(); return; }
    hideTip();
    if (e.pointerType !== "touch") showTip(el, tip.classList.contains("ix-show") ? 0 : UI_MS.tip);
  });
  on(hud, "pointerleave", hideTip);
  on(hud, "pointerdown", hideTip);
  on(hud, "focusin", (e) => { const el = e.target.closest?.("[data-tip]"); if (el && el.matches(":focus-visible")) showTip(el, 0); });
  on(hud, "focusout", hideTip);
  // a glossary word ({term:…}) also answers a tap or a click, on every screen size (touch has no hover)
  on(hud, "click", (e) => {
    const el = e.target.closest?.(".ix-term[data-tip]");
    if (!el || el.closest("button")) return;
    if (tipFor === el) { hideTip(); return; }
    showTip(el, 0, true);
  });

  // ---------- world tags ----------
  const tagPool = new Map();
  const tagOrder = [];
  let tagFrame = 0;
  // panels a tag must not sit under, in root coordinates; re-read only when layout or an overlay changes
  let obstacles = [], obstaclesDirty = true;
  const textRange = doc.createRange();
  function readObstacles() {
    obstaclesDirty = false;
    obstacles = [];
    const rr = root.getBoundingClientRect();
    const add = (r, pad = 4) => { if (r && r.width > 0 && r.height > 0) obstacles.push({ l: r.left - rr.left - pad, t: r.top - rr.top - pad, r: r.right - rr.left + pad, b: r.bottom - rr.top + pad }); };
    const rect = (el) => (el && el.isConnected && !el.hidden ? el.getBoundingClientRect() : null);
    add(rect(titleBlock)); add(rect(toolbar)); add(rect(bar));
    if (!storyBar.hidden) { add(rect(storyBar)); if (storyNote.classList.contains("ix-show")) add(rect(storyNote)); }
    if (readoutOpen) add(rect(meterBox));
    if (legendOpen) add(rect(legend));
    if (aboutOpen) add(rect(about));
    if (storyOpen) add(rect(storyMenu));
    // the caption by its text, not its column, so tags may sit beside a short line
    for (const sel of [".ix-cap-text"]) {
      const el = capCur?.querySelector(sel);
      if (el) { textRange.selectNodeContents(el); add(textRange.getBoundingClientRect(), 6); }
    }
    if (Q.q) add(rect(predict));
    if (codeOpen) add(rect(codePanel));
    add(explain.rect());
    if (drawerOpen) add(rect(drawer));
    if (pinCard.shown) add(rect(pinCard.el));
  }
  function placeTags(list) {
    tagFrame++;
    const veiledNow = S.step >= 0 && S.step === veilStep();   // a held-back step's tags (hash(fox) % 2 = 0) wait too
    const W = S.W || root.clientWidth, H = S.H || root.clientHeight;
    let measure = false;
    tagOrder.length = 0;
    for (const tg of list ?? []) {
      if (!tg || tg.id == null) continue;
      let p = tagPool.get(tg.id);
      if (!p) {
        const el = h("div", { class: "ix-tag" });
        tagLayer.append(el);
        p = { el, text: null, tone: undefined, w: 0, h: 0, x: 0, y: 0, ny: 0, fade: 1, op: -1, tx: NaN, ty: NaN, cx: NaN, seen: 0, fresh: true };
        tagPool.set(tg.id, p);
      }
      p.seen = tagFrame;
      const text = String(tg.text ?? "");
      if (p.text !== text) { p.text = text; p.el.replaceChildren(toDOM(parse(text), doc, markupOpts)); p.w = -1; measure = true; }
      const tone = tg.tone && /^(ok|busy|warn|fail|idle)$/.test(tg.tone) ? tg.tone : null;
      if (p.tone !== tone) { p.tone = tone; p.el.className = tone ? `ix-tag ix-tag-${tone}` : "ix-tag"; }
      const onScreen = tg.x > -40 && tg.x < W + 40 && tg.y > 0 && tg.y < H + 20;
      p.x = tg.x; p.y = tg.y;
      p.want = onScreen && !veiledNow ? clamp(tg.opacity ?? 1, 0, 1) : 0;
      tagOrder.push(p);
    }
    if (measure) for (const p of tagOrder) if (p.w < 0) { p.w = p.el.offsetWidth; p.h = p.el.offsetHeight; }
    if (obstaclesDirty) readObstacles();
    // stack collisions upward: lower anchors keep their place, higher ones move up out of the way
    tagOrder.sort((a, b) => b.y - a.y);
    const gap = 4, caret = 6, m = 8;
    const hit = (p, o) => p.left < o.r && p.left + p.w > o.l && p.top < o.b && p.top + p.h + caret > o.t;
    for (let i = 0; i < tagOrder.length; i++) {
      const p = tagOrder[i];
      p.left = clamp(p.x - p.w / 2, m, Math.max(m, W - p.w - m));
      p.top = p.y - caret - p.h;
      if (p.want <= 0.02) continue;
      // a tag just above a panel lifts clear of it; one that would need to travel further fades instead (below)
      for (const o of obstacles) {
        if (!hit(p, o)) continue;
        const need = p.top + p.h + caret - o.t + 2;
        if (need > 0 && need <= 40 && p.y > o.t - 8) p.top -= need;
      }
      for (let pass = 0; pass < tagOrder.length; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const q = tagOrder[j];
          if (q.want <= 0.02) continue;
          if (p.left < q.left + q.w + gap && p.left + p.w + gap > q.left && p.top < q.top + q.h + gap && p.top + p.h + gap > q.top) {
            p.top = q.top - gap - p.h; moved = true;
          }
        }
        if (!moved) break;
      }
    }
    const instant = still();
    for (const p of tagOrder) {
      const blocked = p.want > 0.02 && obstacles.some((o) => hit(p, o));
      p.fade = p.fresh || instant ? (blocked ? 0 : 1) : p.fade + ((blocked ? 0 : 1) - p.fade) * 0.25;
      if (Math.abs(p.fade - (blocked ? 0 : 1)) < 0.02) p.fade = blocked ? 0 : 1;
      const base = p.y - caret - p.h;
      const nudge = p.top - base;
      p.ny = p.fresh || instant ? nudge : p.ny + (nudge - p.ny) * 0.3;
      if (Math.abs(p.ny - nudge) < 0.1) p.ny = nudge;
      p.fresh = false;
      const tx = Math.round(p.left * 2) / 2, ty = Math.round((base + p.ny) * 2) / 2;
      if (tx !== p.tx || ty !== p.ty) { p.tx = tx; p.ty = ty; p.el.style.transform = `translate3d(${tx}px,${ty}px,0)`; }
      const cx = Math.round(clamp(p.x - p.left, 10, p.w - 10));
      if (cx !== p.cx) { p.cx = cx; p.el.style.setProperty("--cx", `${cx}px`); }
      const lifted = Math.abs(p.ny) > 3;
      if (lifted !== p.lifted) { p.lifted = lifted; p.el.classList.toggle("ix-lifted", lifted); }
      const op = Math.round(p.want * p.fade * 100) / 100;
      if (op !== p.op) { p.op = op; p.el.style.opacity = String(op); p.el.style.visibility = op <= 0 ? "hidden" : ""; }
    }
    for (const [id, p] of tagPool) {
      if (p.seen === tagFrame) continue;
      if (p.op !== 0) { p.op = 0; p.el.style.opacity = "0"; p.el.style.visibility = "hidden"; p.fresh = true; }
      if (tagFrame - p.seen > 240) { p.el.remove(); tagPool.delete(id); }
    }
  }

  // ---------- stage input ----------
  const ptrs = new Map();
  let hoverHinted = false;
  let drag = null, pinch = null, gest = null, gestRaf = 0, hoverRaf = 0, hoverPt = null, lastClick = null;
  const local = (e) => { const r = root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const queueGesture = (type, d) => {
    if (!gest || gest.type !== type) { flushGesture(); gest = { type, dx: 0, dy: 0, scale: 1, x: d.x, y: d.y }; }
    gest.dx += d.dx ?? 0; gest.dy += d.dy ?? 0; gest.scale *= d.scale ?? 1; gest.x = d.x; gest.y = d.y;
    if (!gestRaf) gestRaf = raf(flushGesture);
  };
  function flushGesture() {
    if (gestRaf) { win.cancelAnimationFrame(gestRaf); gestRaf = 0; }
    if (!gest) return;
    const g = gest; gest = null;
    fire("onGesture", g);
  }
  const queueHover = (pt) => {
    hoverPt = pt;
    if (!hoverRaf) hoverRaf = raf(() => { hoverRaf = 0; if (hoverPt) fire("onHover", hoverPt.x, hoverPt.y); else fire("onHover", null); });
  };
  on(stage, "pointerdown", (e) => {
    root.focus({ preventScroll: true });
    if (menuOpen) toggleSpeedMenu(false);
    hideCoach("inspect");
    stage.setPointerCapture?.(e.pointerId);
    const pt = local(e);
    ptrs.set(e.pointerId, pt);
    if (ptrs.size === 1) {
      drag = { x0: pt.x, y0: pt.y, lx: pt.x, ly: pt.y, moved: false, t0: now(), button: e.button, type: e.pointerType,
        mode: e.button === 2 || e.shiftKey || e.button === 1 ? "pan" : "orbit" };
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (drag) drag.moved = true;
    }
    e.preventDefault();
  });
  on(stage, "pointermove", (e) => {
    const pt = local(e);
    if (!ptrs.has(e.pointerId)) {
      if (e.pointerType !== "touch") {
        lastHover = pt; queueHover(pt);
        if (!hoverHinted) {
          hoverHinted = true;
          later(() => {
            if (lastHover && !drag && !hint("inspect", "Click anything to inspect it", { x: lastHover.x, y: lastHover.y - 12 },
              { sub: "Drag to turn the camera, scroll to zoom.", duration: 7000 }) && !store.get("hint:inspect")) hoverHinted = false;
          }, 650);
        }
      }
      return;
    }
    ptrs.set(e.pointerId, pt);
    if (ptrs.size >= 2 && pinch) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      queueGesture("zoom", { scale: d / pinch.d, x: mx, y: my });
      queueGesture("pan", { dx: mx - pinch.mx, dy: my - pinch.my, x: mx, y: my });
      pinch.d = d; pinch.mx = mx; pinch.my = my;
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(pt.x - drag.x0, pt.y - drag.y0) > (drag.type === "touch" ? 8 : 4)) {
      drag.moved = true;
      root.classList.add("ix-dragging");
      hoverPt = null; queueHover(null);
    }
    if (drag.moved) {
      queueGesture(drag.mode, { dx: pt.x - drag.lx, dy: pt.y - drag.ly, x: pt.x, y: pt.y });
      drag.lx = pt.x; drag.ly = pt.y;
    }
  });
  const endPointer = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size > 0) { const [p] = [...ptrs.values()]; if (drag) { drag.lx = p.x; drag.ly = p.y; } return; }
    flushGesture();
    root.classList.remove("ix-dragging");
    const d = drag; drag = null;
    if (!d || d.moved || e.type === "pointercancel") return;
    const pt = local(e);
    if (d.button === 0 && now() - d.t0 < 600) {
      const t = now();
      if (lastClick && t - lastClick.t < 320 && Math.hypot(pt.x - lastClick.x, pt.y - lastClick.y) < 8) {
        lastClick = null;
        fire("onGesture", { type: "focus", x: pt.x, y: pt.y, dx: 0, dy: 0, scale: 1 });
      } else {
        lastClick = { t, x: pt.x, y: pt.y };
        fire("onSelect", pt.x, pt.y);
      }
    }
  };
  on(stage, "pointerup", endPointer);
  on(stage, "pointercancel", endPointer);
  on(stage, "pointerleave", (e) => { if (!ptrs.size && e.pointerType !== "touch") { lastHover = null; queueHover(null); } });
  on(stage, "contextmenu", (e) => e.preventDefault());
  let wheelHinted = 0;
  const ownsWheel = (e) => {
    if (e.ctrlKey || e.metaKey || isFull()) return true;
    const r = root.getBoundingClientRect();
    return r.width >= win.innerWidth - 2 && r.height >= win.innerHeight - 2;
  };
  on(stage, "wheel", (e) => {
    if (!ownsWheel(e)) {
      if (now() - wheelHinted > 8000) { wheelHinted = now(); notice(`Hold ${/Mac|iP/.test(win.navigator.platform) ? "⌘" : "Ctrl"} and scroll to zoom`, { duration: 1800 }); }
      return;
    }
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? (S.H || 800) : 1;
    const dy = e.deltaY * unit;
    const k = e.ctrlKey ? 0.01 : 0.0018;
    const pt = local(e);
    queueGesture("zoom", { scale: Math.exp(-dy * k), x: pt.x, y: pt.y });
  }, { passive: false });
  let gscale = 1;
  on(stage, "gesturestart", (e) => { e.preventDefault(); gscale = 1; });
  on(stage, "gesturechange", (e) => {
    e.preventDefault();
    const pt = local(e);
    queueGesture("zoom", { scale: e.scale / gscale, x: pt.x, y: pt.y });
    gscale = e.scale;
  });

  // ---------- keyboard ----------
  on(win, "keydown", (e) => {
    if (e.defaultPrevented || e.isComposing) return;
    const t = e.target;
    const inside = root.contains(t);
    const onBody = !t || t === doc.body || t === doc.documentElement;
    if (!inside && !onBody) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const activates = t?.closest?.("button, a[href], [role=switch], [role=radio], [role=menuitemradio]");
    // presenting, the clicker's keys go on and back (presenter.mjs); everything else falls through
    if (!isTyping(t) && k !== "Escape" && presenter.key(e, { charKeys, activates })) return;
    // the start card takes the keyboard: Space or Enter plays, Esc dismisses, digits pick a scenario
    if (introOpen) {
      if (k === "Escape") { e.preventDefault(); closeIntro("dismiss"); }
      else if ((k === " " || k === "Spacebar" || k === "Enter") && !activates) { e.preventDefault(); closeIntro("play"); }
      else if (charKeys && /^[1-9]$/.test(k) && S.scenarios[+k - 1]) { e.preventDefault(); chooseScenario(S.scenarios[+k - 1].id); }
      return;
    }
    if (e.key === "Escape") {
      if (closeTop()) { e.preventDefault(); if (isTyping(t)) t.blur?.(); }
      return;
    }
    if (isTyping(t)) return;
    if (!charKeys && isCharKey(k)) return;
    let used = true;
    if (k === " " || k === "Spacebar") { if (activates) return; if (askingNow && !S.playing) pointToAnswer(); else togglePlay(); }
    else if (k === "Enter") { if (activates) return; if (S.held && !S.playing) heldAction(); else used = false; }
    else if (k === "s" || k === "S") toggleDrawer();
    else if (k === "ArrowLeft" || k === "ArrowRight") { const d = k === "ArrowRight" ? 1 : -1; if (e.shiftKey) fire("onPhase", d); else fire("onStep", d); }
    else if (k === "Home") fire("onSeek", 0, { scrubbing: false });
    else if (k === "End") fire("onSeek", S.duration, { scrubbing: false });
    else if (k === "[") nudgeSpeed(-1);
    else if (k === "]") nudgeSpeed(1);
    else if (/^[1-9]$/.test(k)) {
      const n = +k - 1;
      if (Q.q && Q.answered == null && n < Q.opts.length) answer(n);
      else if (S.scenarios[n]) chooseScenario(S.scenarios[n].id);
      else used = false;
    }
    else if (k === "t" || k === "T") toggleTheme();
    else if (k === "f" || k === "F") fire("onFit");
    else if (k === "c" || k === "C") { if (S.code?.source) toggleCode(); else used = false; }
    else if (k === "i" || k === "I") {
      if (pinCard.shown) { hideCard(pinCard); fire("onUnpin"); }
      else if (hoverCard.shown && lastHover) fire("onSelect", lastHover.x, lastHover.y);
      else used = false;
    }
    else if (k === "r" || k === "R") { if (typeof cb.onRestart === "function") fire("onRestart"); else fire("onSeek", 0, { scrubbing: false }); }
    else if (k === "?" || (k === "/" && e.shiftKey)) toggleHelp();
    else if (k === "e" || k === "E") explain.toggle();
    else if (k === "p" || k === "P") { if (S.size !== "phone") presenter.set(!presenter.on); else used = false; }
    else if (k === "l" || k === "L") { if (S.lesson) cycleLevel(); else used = false; }
    else used = false;
    if (used) e.preventDefault();
  });

  // ---------- presenter mode (presenter.mjs, presenter-view.mjs): a projector, a clicker, a second window ----------
  // The clicker goes on: into the first step from the start card, through a pause by its Continue, else one step played
  // to its end. Like a slide build, a click while a step still moves completes it at once, so no click is lost. An open
  // question waits for its answer (the room answers on screen, or the presenter view does).
  function advance() {
    if (introOpen) { closeIntro("step"); return; }
    if (S.held && !S.playing) { heldAction(); return; }
    if (Q.q && !Q.q.kind && Q.answered == null) { notice("Pick an answer first: click it, or press its number."); return; }
    hideCoach("step");
    const st = S.steps[S.step];
    if (S.playing && st && S.time < st.t1 - 0.05) { fire("onPause"); fire("onSeek", st.t1 - 1e-3, { scrubbing: false }); return; }
    fire("onStep", 1);
  }
  function cycleLevel() {
    if (!S.lesson) return;
    const order = ["new", "basics", "expert"], next = order[(order.indexOf(level.value) + 1) % order.length];
    level.set(next);
    notice(`Level: ${{ new: "New to this", basics: "I know the basics", expert: "Expert" }[next]}`, { duration: 1600 });
  }
  // what the presenter view shows: this step in full, the next one, the open question and its answer
  function viewState() {
    if (!S.steps.length) return null;
    const i = clamp(S.step, 0, S.steps.length - 1), nx = S.steps[i + 1] ?? null, k = phaseAt(i), nk = nx ? phaseAt(i + 1) : k;
    const hv = S.playing ? null : S.held;
    const after = hv?.kind === "end" ? storyAfter() : null;
    const primary = hv ? (hv.kind === "end" ? (after ? `Next story: ${after.label ?? after.id}` : "Replay") : hv.kind === "chapter" ? `Continue to ${nextChapter()}` : hv.kind === "turn" ? "Rewind and try again" : "Continue")
      : S.playing ? "Pause" : "Play";
    const done = hv?.kind === "end" ? "Run complete" : hv?.kind === "chapter" ? `${S.phases[hv.phase]?.name || `Chapter ${hv.phase + 1}`} complete` : null;
    const q = Q.q && (!Q.q.kind || Q.q.kind === "choose") ? Q.q : null;
    const ask = q ? { kind: q.kind ?? "predict", question: q.question ?? q.prompt ?? "", options: q.kind ? [] : q.options ?? [], answer: q.kind ? null : q.answer,
      chosen: q.kind ? null : Q.answered, revealed: Q.revealed } : null;
    return {
      steps: S.steps.length, step: i, chapters: S.phases.map((p) => p.name ?? ""), chapter: k, cur: S.steps[i], next: nx,
      nextChapter: nx && nk !== k ? S.phases[nk]?.name ?? `Chapter ${nk + 1}` : null, held: hv ? { kind: hv.kind, done } : null, primary,
      playing: S.playing, progress: S.span ? S.time / S.span : 0, ask, about: S.phases[k]?.about ?? null,
      scenario: S.scenarios.length > 1 ? scenarioDef()?.label ?? S.scenario : null,
      sig: [i, S.tl?.hash ?? "", S.steps.length, primary, ask ? `${ask.question}|${ask.chosen}|${ask.revealed}` : "", level.value, S.scenario].join("|"),
    };
  }
  let splitWas = null;
  const presenter = createPresenter({
    root, win, theme: () => S.theme, notice,
    on: (v) => {
      presentSw.setAttribute("aria-checked", String(v));
      if (v) { toggleHelp(false); toggleSpeedMenu(false); toggleReadout(false); toggleLegend(false); if (codeOpen) toggleCode(false); }
      paramsDocked = null;   // presenting, the knobs lead the drawer (S) rather than a card under the panel
      onResize();
      applyPrimary();
    },
    // the presenter view holds the words: on the projector the panel steps aside and the caption takes its place
    split: (open) => {
      root.classList.toggle("ix-present-split", open);
      viewBtn.setAttribute("aria-pressed", String(open));
      if (open) { splitWas = explain.open; explain.toggle(false); }
      else if (splitWas != null) { explain.toggle(splitWas); splitWas = null; }
      S.captionDirty = true;
    },
    advance, cycleLevel, back: () => { if (!introOpen) fire("onStep", -1); }, heldAction: () => { if (S.held && !S.playing) heldAction(); },
    view: {
      doc, get level() { return S.lesson ? level : null; }, title: () => S.meta.title ?? "Figure", theme: () => S.theme, state: viewState,
      makeH: (d) => maker(d).h, markup: (src, d) => toDOM(parse(src), d, markupOpts),
      icons: { back: ICON.back, fwd: ICON.fwd, play: ICON.play, pause: ICON.pause, next: ICON.next, replay: ICON.replay, check: ICON.check },
      key: (e) => presenter.key(e, { charKeys }),
      actions: { back: () => fire("onStep", -1), advance, primary: () => (S.held && !S.playing ? heldAction() : togglePlay()), answer: (i) => answer(i) },
    },
  });

  // ---------- deep links ----------
  const hashOn = opts.hash !== false;
  const link = parseHash(hashOn ? win.location.hash : "", S.params, S.scenarios.length ? S.scenarios : null);
  let hashTimer = 0, hashLast = 0;
  function writeHash() {
    hashTimer = 0; hashLast = now();
    if (!hashOn) return;
    const first = S.scenarios[0]?.id;
    const cur = parseHash(win.location.hash);
    const str = formatHash({
      scenario: S.scenario && S.scenario !== first ? S.scenario : undefined,
      time: S.time,
      params: paramOverrides(S.values, S.params, scenarioDef()),
      rest: cur.rest,
    });
    if (str === win.location.hash.replace(/^#/, "")) return;
    try { win.history.replaceState(win.history.state, "", str ? `#${str}` : win.location.pathname + win.location.search); } catch { /* sandboxed */ }
  }
  function scheduleHash(soon) {
    if (!hashOn || !S.tl || hashTimer) return;
    const wait = Math.max(soon ? 120 : 0, 500 - (now() - hashLast));
    hashTimer = later(writeHash, wait);
  }

  // ---------- layout observation ----------
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  // how much of the root the chrome covers, so the camera can frame the world in the free area
  // The header is the title row plus, on phones, the stories' own row under it: insets.top is the lower of the two.
  function updateInsets() {
    const rr = root.getBoundingClientRect();
    insets.left = codeOpen && S.size !== "phone" ? Math.round(codePanel.offsetLeft + codePanel.offsetWidth) : 0;
    insets.right = Math.max(explain.inset(), paramsInset());
    placeStories(rr);   // centred on the free stage the side insets leave
    const tr = top.getBoundingClientRect(), br = bottom.getBoundingClientRect();
    const sb = storyBar.hidden ? null : storyBar.getBoundingClientRect();
    const headBottom = Math.max(tr.bottom, sb && sb.height > 0 ? sb.bottom : -Infinity);
    root.style.setProperty("--ix-top-h", `${Math.round(headBottom - tr.top)}px`);
    root.style.setProperty("--ix-bottom-h", `${bottom.offsetHeight}px`);
    insets.top = Math.max(0, Math.round(headBottom - rr.top));
    insets.bottom = Math.max(0, Math.round(rr.bottom - br.top));
  }
  function onResize() {
    const W = root.clientWidth, H = root.clientHeight;
    S.W = W; S.H = H;
    const size = W < SIZE_PHONE ? "phone" : W < SIZE_COMPACT ? "compact" : "desktop";
    if (size !== S.size) { S.size = size; root.dataset.size = size; syncSheets(); hideTip(); }
    root.classList.toggle("ix-short", H < 560);
    // Embedded, or short: the dock is one row (play, the timeline, the count, one number), so the world keeps its height.
    // Otherwise one row on wide screens, and below that the readout strip sits on its own row above the transport.
    S.embedded = root.classList.contains("ix-embed");
    const row = (S.embedded || H < 600) && size !== "phone" && !presenter.on;
    if (row !== S.dockRow) { S.dockRow = row; root.classList.toggle("ix-dock-row", row); applyPrimary(); }
    root.classList.toggle("ix-tiered", !row && (size !== "desktop" || W < 1200));
    root.style.setProperty("--ix-stats-max", `${Math.round(Math.min(W - 48, 1320) * 0.42)}px`);
    if (size !== "phone" && aboutOpen) toggleAbout(false);
    fitSoon();
    if (readoutOpen) placePop(meterBox, stats);
    if (legendOpen) placePop(legend, legendBtn);
    fitLabels();
    preview._w = 0;
    explain.resize(size, W);
    placeParams();
    updateInsets();
    if (pinCard.shown) placeCard(pinCard, pinCard.x, pinCard.y);
    hideCoach();
    obstaclesDirty = true;
  }
  const ro = new win.ResizeObserver(() => onResize());
  ro.observe(root); ro.observe(top); ro.observe(bottom); ro.observe(scrub); ro.observe(paramsCard);
  onResize();
  doc.fonts?.ready?.then(() => { if (!destroyed) { preview._w = 0; fitStats(); updateInsets(); } });

  function ensureCss() {
    try {
      if (win.getComputedStyle(root).getPropertyValue("--ix-css").trim()) return;
      if (doc.querySelector("link[data-ix-css]")) return;
      const href = new URL("./hud.css", import.meta.url);
      if (!/^(https?|file):$/.test(href.protocol)) return;
      doc.head.append(Object.assign(doc.createElement("link"), { rel: "stylesheet", href: href.href }));
      doc.head.lastChild.dataset.ixCss = "";
    } catch { /* inlined build: the page carries hud.css */ }
  }

  // ---------- per-frame update ----------
  function onStep(step) {
    const prevStep = S.step;
    S.step = step;
    renderCount();
    const ph = phaseAt(step);
    if (ph !== S.phase) {
      // after the first chapter, one pointer at the timeline: it can be dragged back
      if (S.phase === 0 && ph === 1 && S.playing && !scrubbing && step === prevStep + 1) {
        later(() => { if (S.phase === 1 && S.playing && !scrubbing) hint("scrub", "Drag to rewind", scrubAnchor, { sub: "Every step is replayable." }); }, 900);
      }
      S.phase = ph;
      markLabels(S.detour ? S.detour.phase : ph);
      fitLabels();
    }
    const st = S.steps[step];
    scrub.setAttribute("aria-valuenow", String(+(st?.t0 ?? S.time).toFixed(2)));
    scrub.setAttribute("aria-valuetext", S.detour && step >= S.detour.step ? `Detour, step ${step - S.detour.step + 1} of ${S.steps.length - S.detour.step}`
      : `Step ${step + 1} of ${S.steps.length}${S.phases[ph]?.name ? `, ${S.phases[ph].name}` : ""}`);
    sparksDirty = true;
  }
  let legendTick = 0;
  function update(frame, info = {}) {
    if (!frame || destroyed) return;
    S.frameNo++;
    const t = info.time ?? frame.time ?? 0;
    S.entities = frame.entities ?? S.entities;
    const playing = !!info.playing;
    if (playing !== S.playing) { S.playing = playing; renderPlay(); }
    if (info.speed != null && info.speed !== S.speed) { S.speed = info.speed; renderSpeed(); }
    if (!scrubbing) renderPlayhead(t);
    const moved = t !== S.time;
    S.time = t;
    const step = Number.isInteger(frame.step) ? frame.step : S.steps.length ? stepAt(t) : 0;
    if (step !== S.step) onStep(step);
    explain.step(step, info.fold?.caption);
    const held = turn.held(info.held ?? null, S.tl);   // a branch's end is the turn's hold (turn.mjs)
    setHeld(playing ? null : held);   // before the caption: a pause changes what the caption says
    turn.update({ tl: S.tl, step, time: t, held: info.held ?? null });
    check.update({ held: playing ? null : held, branch: !!S.tl?.branch });
    const cap = frame.caption ?? "";
    const capKey = `${S.held ? `${S.held.kind}${S.held.phase}` : ""}|${veilStep() === step ? 1 : 0}|${explain.mode}`;
    if (cap !== S.caption || S.captionDirty || capKey !== S.capKey) { S.caption = cap; S.capKey = capKey; setCaption(cap, step); }
    if (frame.counters) setMeters(frame.counters, step);
    if (rowsDirty) { rowsDirty = false; renderRows(true); }
    if (sparksDirty) { sparksDirty = false; renderSparks(); }
    if (codeRows.length) setLines(frame.line, frame.vars);
    // the legend would name keys a held-back step introduces: it waits for the reveal like the caption
    if ((++legendTick >= 6 || legendSig === "\u0000" || capturing()) && veilStep() !== step) { legendTick = 0; updateLegend(frame); }   // captures render one update per shot
    if (Q.q) { maybeReveal(); predictTick(); }
    syncAsk();
    syncChecking();
    saveProgress();
    const sm = !!info.stepMode;
    if (sm !== S.stepMode) {
      S.stepMode = sm;
      root.classList.toggle("ix-stepmode", sm);
      if (sm) later(() => { if (S.stepMode) hint("step", "Press Next for each step", nextAnchor, { sub: "Or the → key. Play runs it on its own." }); }, 350);
      else hideCoach("step");
    }
    fold.update({ fold: info.fold ?? null, skipped: info.skipped ?? null, duration: S.detour ? S.span : info.duration ?? S.duration });
    if (moved && (playing || scrubbing)) scheduleHash(false);
    presenter.update();
    // embedding marks the root after the HUD exists (engine/embed): the dock takes its one-row form then
    if (root.classList.contains("ix-embed") !== S.embedded) onResize();
  }

  // ---------- initial render ----------
  renderTitle();
  buildScenarios();
  buildKnobs();
  buildCode();
  buildMeters();
  renderPlay();
  renderSpeed();
  setTheme(S.theme);
  updateLegend(null);
  if (presentQuery(win.location.search)) presenter.set(true);

  const api = {
    root,
    setTimeline,
    update,
    placeTags,
    inspect,
    ask,
    /** A click in the world while an in-world pick is open: true when the pick took it (turn.mjs). */
    pick: (id) => turn.pickId(id),
    notice,
    setTheme: (t) => setTheme(t),
    setValues(values) {
      S.values = { ...S.values, ...(values ?? {}) };
      sentJSON = JSON.stringify(S.values);
      for (const k in knobs) knobs[k].set(S.values[k]);
      syncReset();
    },
    setScenario(id) { if (id != null && id !== S.scenario) { S.scenario = id; renderScenario(); } },
    setMeta(meta) { S.meta = meta ?? {}; renderTitle(); },
    initialState: () => ({ scenario: link.scenario, time: link.time, params: { ...link.params } }),
    /** Show or hide the start card. Hiding it this way is silent: it is not remembered and fires no onStart. */
    intro(show = true) { openIntro(!!show); },
    /** True once this viewer has dismissed this figure's start card (localStorage). */
    get introSeen() { return store.get(`intro:${figKey()}`) === "1"; },
    get introOpen() { return introOpen; },
    /** True when this viewer has a place to pick up (journey.mjs) and no deep link says where to start instead. */
    get resumable() { return !!resumeOffer(); },
    /** The stories this viewer has finished (journey.mjs). */
    get finished() { return [...journey.done]; },
    /** "Pause between chapters" (a viewer preference, default on). */
    get guided() { return guided; },
    /** "Speed through repeats" (a viewer preference, default on). */
    get folding() { return folding; },
    /** The reader's level ("new" | "basics" | "expert") and what it shows (level.mjs POLICY). */
    get level() { return level.value; },
    get policy() { return level.policy; },
    setLevel: (v) => level.set(v),
    hint: (name, text, at, o) => hint(name, text, at, o),
    get reducedMotion() { return reduced; },
    get insets() { return { ...insets }; },
    get scrubbing() { return scrubbing; },
    /** Capture mode for record/shoot: chrome hidden (unless chrome: true), no transitions, instant captions and counters. */
    setCapture(on = true, o = {}) {
      root.classList.toggle("ix-capture", !!on);
      root.classList.toggle("ix-keep-chrome", !!on && !!o.chrome);
      if (on) { openIntro(false); setHeld(null); hideCoach(); hideTip(); hidePreview(); toggleSpeedMenu(false); toggleStoryMenu(false); hideCard(hoverCard); toggleAbout(false); if (readoutOpen === "hover") toggleReadout(false); if (legendOpen === "hover") toggleLegend(false); }
      explain.sync();
      obstaclesDirty = true;
      updateInsets();
    },
    /** Presenter mode (projector type, high contrast, clicker keys), and its second window. */
    get presenting() { return presenter.on; },
    present: (on = true) => presenter.set(on),
    presenterView: (open = true) => (open ? presenter.openView() : presenter.closeView()),
    open(what, on = true) {
      if (what === "settings") toggleDrawer(on);
      else if (what === "code") toggleCode(on);
      else if (what === "help") toggleHelp(on);
      else if (what === "speed") toggleSpeedMenu(on);
      else if (what === "stories") toggleStoryMenu(on);
      else if (what === "readout") toggleReadout(on ? "pinned" : false);
      else if (what === "legend") toggleLegend(on ? "pinned" : false);
      else if (what === "about") toggleAbout(on);
      else if (what === "intro") openIntro(on);
      else if (what === "explain") explain.toggle(on);
    },
    destroy() {
      destroyed = true;
      ro.disconnect();
      explain.destroy();
      fold.destroy();
      presenter.destroy();
      listeners.forEach((off) => off());
      timers.forEach((id) => win.clearTimeout(id));
      if (countRaf) win.cancelAnimationFrame(countRaf);
      if (fitRaf) win.cancelAnimationFrame(fitRaf);
      for (const el of [stage, scrimTop, scrimBottom, tagLayer, hud, meterBox, legend, preview, speedMenu, storyMenu, hoverCard.el, pinCard.el, coach, helpScrim, help, introScrim, intro, toast, tip, live]) el.remove();
      if (landmark) root.removeAttribute("role");
      root.classList.remove("ix-reduced", "ix-playing", "ix-has-code", "ix-has-meters", "ix-has-legend", "ix-has-scenarios", "ix-stepmode", "ix-intro-open", "ix-held-open");
    },
  };
  return api;
}
