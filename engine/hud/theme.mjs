// HUD theme: CSS custom properties generated from engine/tokens.mjs, applied on the figure root.
// hud.css only ever reads these variables; it never names a colour, font, size or easing itself.
import { PALETTE, UI, TYPE, MOTION, THEMES, hex } from "../tokens.mjs";

// UI timings in ms: motion stays within 150–250 ms; `count` is a number counting up (data, not chrome), `tip` a delay
export const UI_MS = { fast: UI.motion.fast, base: UI.motion.base, slow: UI.motion.slow, caption: UI.motion.slow, count: 520, tip: 420 };

const ch = (v) => Math.round(v * 255);
const rgbTriplet = (c) => hex(c).slice(0, 3).map(ch).join(" ");
const rgba = (c) => {
  const [r, g, b, a = 1] = hex(c);
  return `rgb(${ch(r)} ${ch(g)} ${ch(b)} / ${+a.toFixed(3)})`;
};
const bezier = (e) => `cubic-bezier(${e.join(", ")})`;
const font = (name, fallback) => `"${name}", ${fallback}`;
const kebab = (k) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

/** The full variable set for one theme, as { "--ix-name": "value" }. Pure; runs in Node. */
export function cssVars(theme = "dark") {
  const t = THEMES.includes(theme) ? theme : "dark";
  const P = PALETTE[t], U = UI[t];
  const v = {};
  const color = (name, c) => { v[`--ix-${name}`] = Array.isArray(c) ? rgba(c) : c; v[`--ix-${name}-rgb`] = rgbTriplet(c); };

  // the world's colours the HUD names: the stage behind it, identity keys and status tones (colour only for data)
  for (const k of ["stage", "stageLift", "tile", "ok", "busy", "warn", "fail", "idle", "keyInk", "lit"]) color(kebab(k), P[k]);
  P.keys.forEach((c, i) => { v[`--ix-key-${i}`] = c; });
  // the tones as words and marks ("crashes", "Done", a right answer's tick): on light paper the world's tones are too
  // pale for text, so a third of the way to the ink (4.5:1 on paper and surfaces); on dark they already are
  for (const k of ["ok", "busy", "warn", "fail"]) v[`--ix-${k}-text`] = t === "light" ? `color-mix(in oklab, var(--ix-${k}) 66%, var(--ix-ink))` : `var(--ix-${k})`;

  // the monochrome chrome: four inks (ink-muted and ink-faint are the 2nd and 3rd), surfaces, hairlines
  color("ink", U.ink); color("ink-muted", U.ink2); color("ink-faint", U.ink3); color("ink-4", U.ink4);
  color("surface", U.surface); color("raised", U.raised);
  color("primary", U.primary); color("on-primary", U.onPrimary); color("thumb", U.thumb);
  v["--ix-line"] = rgba(U.line); v["--ix-line-strong"] = rgba(U.lineStrong);
  v["--ix-hover"] = rgba(U.hover); v["--ix-press"] = rgba(U.press);
  v["--ix-scrim"] = rgba(U.scrim); v["--ix-scrim-rgb"] = rgbTriplet(U.scrim); v["--ix-scrim-a"] = String(U.scrim[3]);
  v["--ix-shadow"] = U.shadow; v["--ix-shadow-sm"] = U.shadowSm;
  v["--ix-blur"] = `${UI.blur}px`;
  // legibility halo for text that sits directly on the world (title, captions)
  v["--ix-halo"] = t === "light"
    ? `0 0 16px rgb(${rgbTriplet(P.stageLift)} / 0.95), 0 0 2px rgb(${rgbTriplet(P.stageLift)} / 0.8)`
    : `0 1px 16px rgb(${rgbTriplet(P.stage)} / 0.9), 0 0 3px rgb(${rgbTriplet(P.stage)} / 0.7)`;

  v["--ix-font-sans"] = font(TYPE.sans, TYPE.fallbackSans);
  v["--ix-font-mono"] = font(TYPE.mono, TYPE.fallbackMono);
  for (const [k, s] of Object.entries(TYPE.scale)) {
    v[`--ix-fs-${k}`] = `${s.size}px`; v[`--ix-lh-${k}`] = `${s.line}px`; v[`--ix-tr-${k}`] = `${s.track}em`;
  }
  v["--ix-fs-code"] = `${TYPE.code}px`;
  for (const [k, r] of Object.entries(UI.radius)) v[`--ix-r-${k}`] = `${r}px`;
  v["--ix-ring"] = `${UI.focus}px solid ${U.ink}`;

  v["--ix-ease"] = bezier(UI.motion.ease);
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
