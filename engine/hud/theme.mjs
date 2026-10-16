// HUD theme: CSS custom properties generated from engine/tokens.mjs, applied on the figure root.
// hud.css only ever reads these variables; it never names a colour, font or easing itself.
import { PALETTE, TYPE, MOTION, THEMES, hex } from "../tokens.mjs";

// HUD constants from DESIGN.md section 9 that tokens.mjs does not carry yet.
export const GLASS = { blur: 18, saturate: 1.4, radius: 14, shadow: { dark: 0.35, light: 0.08 } };
export const UI_MS = { fast: 150, base: 180, slow: 220, caption: 420, count: 520, tip: 420 };

const ch = (v) => Math.round(v * 255);
const rgbTriplet = (c) => hex(c).slice(0, 3).map(ch).join(" ");
const rgba = (c) => {
  const [r, g, b, a = 1] = hex(c);
  return `rgb(${ch(r)} ${ch(g)} ${ch(b)} / ${+a.toFixed(3)})`;
};
const bezier = (e) => `cubic-bezier(${e.join(", ")})`;
const font = (name, fallback) => `"${name}", ${fallback}`;

/** The full variable set for one theme, as { "--ix-name": "value" }. Pure; runs in Node. */
export function cssVars(theme = "dark") {
  const P = PALETTE[THEMES.includes(theme) ? theme : "dark"];
  const v = {};
  for (const k of ["stage", "stageLift", "stageEdge", "housing", "tile", "ink", "inkMuted", "inkFaint", "ok", "busy", "warn", "fail",
    "idle", "off", "keyInk", "lit", "select"]) {
    const name = k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    v[`--ix-${name}`] = P[k];
    v[`--ix-${name}-rgb`] = rgbTriplet(P[k]);
  }
  P.keys.forEach((c, i) => { v[`--ix-key-${i}`] = c; });
  v["--ix-glass"] = rgba(P.glass);
  v["--ix-glass-border"] = rgba(P.glassBorder);
  v["--ix-glass-highlight"] = rgba(P.glassHighlight);
  v["--ix-scrim"] = rgba(P.scrim);
  v["--ix-scrim-rgb"] = rgbTriplet(P.scrim);
  v["--ix-scrim-a"] = String(P.scrim[3]);

  // controls: slider thumbs and "on" states are monochrome (ink), never an identity colour
  v["--ix-thumb"] = theme === "light" ? P.tile : P.ink;
  v["--ix-shade-rgb"] = "0 0 0"; // shadows are black at the DESIGN.md 9 strengths
  // the one HUD accent, for the call to action that must not be missed (Continue at a chapter pause): the `busy`
  // blue ("go on"), with ink that keeps 4.5:1 on it in each theme. Never used for decoration or identity.
  v["--ix-accent"] = P.busy;
  v["--ix-accent-rgb"] = rgbTriplet(P.busy);
  v["--ix-accent-ink"] = theme === "light" ? P.tile : P.keyInk;

  const sa = GLASS.shadow[theme === "light" ? "light" : "dark"];
  v["--ix-shadow"] = `0 10px 40px rgb(0 0 0 / ${sa})`;
  v["--ix-shadow-sm"] = `0 4px 16px rgb(0 0 0 / ${+(sa * 0.7).toFixed(3)})`;
  v["--ix-blur"] = `${GLASS.blur}px`;
  v["--ix-saturate"] = String(GLASS.saturate);
  v["--ix-radius"] = `${GLASS.radius}px`;
  // legibility halo for text that sits directly on the world (title, captions)
  v["--ix-halo"] = theme === "light"
    ? `0 0 18px rgb(${rgbTriplet(P.stageLift)} / 0.95), 0 0 2px rgb(${rgbTriplet(P.stageLift)} / 0.8)`
    : `0 1px 18px rgb(${rgbTriplet(P.stage)} / 0.9), 0 0 3px rgb(${rgbTriplet(P.stage)} / 0.7)`;

  v["--ix-font-sans"] = font(TYPE.sans, TYPE.fallbackSans);
  v["--ix-font-mono"] = font(TYPE.mono, TYPE.fallbackMono);
  for (const k of ["kicker", "title", "subtitle", "caption", "ui", "small", "code"]) v[`--ix-fs-${k}`] = `${TYPE[k]}px`;

  v["--ix-ease"] = bezier(MOTION.ease);
  v["--ix-ease-io"] = bezier(MOTION.easeInOut);
  for (const k of ["fast", "base", "slow", "caption"]) v[`--ix-dur-${k}`] = `${UI_MS[k]}ms`;
  return v;
}

/** Set the theme's variables on the root and mark it with data-theme. Returns the theme applied. */
export function applyTheme(root, theme) {
  const t = THEMES.includes(theme) ? theme : "dark";
  const vars = cssVars(t);
  for (const k in vars) root.style.setProperty(k, vars[k]);
  root.dataset.theme = t;
  root.style.colorScheme = t;
  return t;
}
