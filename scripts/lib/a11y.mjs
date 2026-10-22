// The interface's accessibility, measured in the real page (audit.mjs --a11y). WCAG 2.2 AA, the checks a browser can
// make objectively:
//   contrast  1.4.3   every piece of HUD text that is on screen, against the pixels actually behind it: the page is
//                     shot once with the HUD's glyphs made transparent (surfaces, plates, halos and the world stay),
//                     and each line of text is compared with what lies under it (90 % of the pixels must pass:
//                     4.5:1, or 3:1 for large text). Over the world this is the honest number, not the token's.
//   target    2.5.8   controls under 24 x 24 CSS px whose 24 px square around their centre reaches another control
//                     (the spacing exception); inline chips inside a sentence are exempt, as WCAG allows
//   name      4.1.2   buttons, links, inputs and widgets with no accessible name
//   focus     2.4.7   focusable controls that show nothing when focused from the keyboard
// It runs against any built page (the probe is injected), so a baseline page can be measured the same way.
import { inflateSync } from "node:zlib";

/** Decode a PNG (8-bit RGB or RGBA, not interlaced, as Chrome's screenshots are) to { width, height, data: RGBA }. */
export function decodePng(buf) {
  let p = 8, width = 0, height = 0, type = 0, depth = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString("ascii", p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; if (body[12]) throw new Error("interlaced PNG"); }
    else if (kind === "IDAT") idat.push(body);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type})`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8ClampedArray(width * height * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4, q = x * bpp;
      out[o] = cur[q]; out[o + 1] = cur[q + 1]; out[o + 2] = cur[q + 2]; out[o + 3] = bpp === 4 ? cur[q + 3] : 255;
    }
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const luminance = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/**
 * A computed CSS colour as [r, g, b, a] (sRGB 0-255, alpha 0-1), or null if it is in a form this does not read.
 * Chrome computes rgb()/rgba(), and keeps color-mix() results in their own space (oklab(), oklch(), color(srgb …)).
 * Self-contained: it also runs in the page (the probe below is built from its source).
 */
export function parseColor(c) {
  const m = /^(rgba?|color|oklab|oklch)\(([^)]*)\)$/.exec(String(c).trim());
  if (!m) return null;
  let parts = m[2].trim().split(/\s*\/\s*|\s*,\s*|\s+/);
  const num = (v, scale = 1) => (v === "none" ? 0 : v.endsWith("%") ? (parseFloat(v) / 100) * scale : parseFloat(v));
  const gamma = (v) => { v = Math.min(1, Math.max(0, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055); };
  const fn = m[1];
  if (fn === "color") { if (parts[0] !== "srgb" && parts[0] !== "srgb-linear") return null; const lin = parts.shift() === "srgb-linear"; const [r, g, b] = parts.slice(0, 3).map((v) => num(v)); const a = parts[3] === undefined ? 1 : num(parts[3]); return lin ? [gamma(r), gamma(g), gamma(b), a] : [r * 255, g * 255, b * 255, a]; }
  if (fn === "rgb" || fn === "rgba") { const [r, g, b] = parts.slice(0, 3).map((v) => num(v, 255)); return [r, g, b, parts[3] === undefined ? 1 : num(parts[3])]; }
  let L = num(parts[0]), A, B;
  if (fn === "oklab") { A = num(parts[1], 0.4); B = num(parts[2], 0.4); }
  else { const C = num(parts[1], 0.4), h = (num(parts[2]) * Math.PI) / 180; A = C * Math.cos(h); B = C * Math.sin(h); }
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [gamma(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s), gamma(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s), parts[3] === undefined ? 1 : num(parts[3])];
}

// In the page: what is on screen, as plain data. No side effects except the focus pass, which restores focus.
const PROBE = String.raw`(() => {
  const root = document.querySelector(".ix") ?? document.body;
  const W = innerWidth, H = innerHeight;
  const cls = (el) => { for (let e = el; e && e !== root; e = e.parentElement) { const c = [...e.classList].find((x) => x.startsWith("ix-")); if (c) return "." + c; } return el.tagName.toLowerCase(); };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); o *= +cs.opacity; if (cs.visibility === "hidden" || cs.display === "none") return 0; } return o; };
  const hiddenSr = (el) => !!el.closest(".ix-sr, .ix-scene-doc");
  const inactive = (el) => !!el.closest("[inert], button:disabled, [aria-disabled=true]");
  // a colour this cannot read is left unjudged (null), never taken as black
  const parse = ${parseColor.toString()};
  // what of a box is actually on screen: clipped by every scrolling or clipping ancestor (a list scrolled out of
  // view, a line-clamped third line), and not in a masked fade at a scroll edge (an affordance, read by scrolling)
  const clipOf = (el) => {
    let c = { l: 0, t: 0, r: W, b: H };
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const clips = cs.overflowX !== "visible" || cs.overflowY !== "visible", mask = cs.maskImage && cs.maskImage !== "none" || cs.webkitMaskImage && cs.webkitMaskImage !== "none";
      if (!clips && !mask) continue;
      const b = e.getBoundingClientRect(), edge = mask ? 32 : 0;
      c = { l: Math.max(c.l, b.left), t: Math.max(c.t, b.top + (mask && e.scrollTop > 0 ? 24 : 0)), r: Math.min(c.r, b.right), b: Math.min(c.b, b.bottom - edge) };
    }
    return c;
  };
  // what lies over a point: is the element painted there, or does an open panel (any opaque or frosted layer that is
  // not the element, inside it or around it) cover it? Hit-tested with pointer events forced on, so a layer that only
  // lets clicks through still counts; a faded-out or see-through layer does not. An element absent from the point
  // (clipped by its scroller) is not on screen there either.
  const seen = document.createElement("style");
  seen.textContent = ".ix *, .ix *::before, .ix *::after { pointer-events: auto !important; }";
  document.head.append(seen);
  const covers = (e) => { const cs = getComputedStyle(e); const bg = parse(cs.backgroundColor);
    return opacityOf(e) >= 0.5 && ((bg && bg[3] >= 0.3) || (cs.backdropFilter && cs.backdropFilter !== "none") || /^(CANVAS|IMG|VIDEO)$/.test(e.tagName)); };
  const shownAt = (el, x, y) => {
    for (const e of document.elementsFromPoint(Math.min(W - 1, Math.max(0, x)), Math.min(H - 1, Math.max(0, y)))) {
      if (e === el || el.contains(e) || e.contains(el)) return true;
      if (covers(e)) return false;
    }
    return false;
  };
  // text: one entry per element and line of text
  const texts = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || hiddenSr(el) || inactive(el) || el.closest("svg, style, script, textarea")) continue;
    const op = opacityOf(el);
    if (op < 0.5) continue;   // fading in or out: judged once it has arrived
    const cs = getComputedStyle(el);
    range.selectNodeContents(n);
    const clip = clipOf(el);
    for (const r0 of range.getClientRects()) {
      const l = Math.max(r0.left, clip.l), t = Math.max(r0.top, clip.t), rt = Math.min(r0.right, clip.r), b = Math.min(r0.bottom, clip.b);
      // most of the line hidden: judged once it is scrolled into view
      if (rt - l < 2 || (b - t) < Math.max(4, r0.height * 0.75)) continue;
      const r = { left: l, top: t, width: rt - l, height: b - t };
      // under an open sheet or panel: not what the reader is shown
      if (!shownAt(el, l + (rt - l) / 2, t + (b - t) / 2)) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
      texts.push({ text: n.nodeValue.trim().slice(0, 40), cls: cls(el), x: r.left, y: r.top, w: r.width, h: r.height,
        fg: [fg[0], fg[1], fg[2], fg[3] * op], large: size >= 24 || (size >= 18.66 && weight >= 700), size });
    }
  }
  // controls
  const SEL = "button, a[href], input, select, textarea, [role=slider], [role=switch], [role=radio], [role=tab], [role=menuitemradio], [tabindex]:not([tabindex='-1'])";
  const nameOf = (el) => {
    const l = el.getAttribute("aria-label"); if (l && l.trim()) return l.trim();
    const by = el.getAttribute("aria-labelledby"); if (by) { const t = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim(); if (t) return t; }
    if (el.id) { const lab = document.querySelector('label[for="' + el.id + '"]'); if (lab?.textContent.trim()) return lab.textContent.trim(); }
    const c = el.cloneNode(true); c.querySelectorAll("[aria-hidden=true]").forEach((x) => x.remove());
    return (c.textContent || el.getAttribute("title") || "").trim();
  };
  const controls = [];
  for (const el of root.querySelectorAll(SEL)) {
    if (hiddenSr(el) || el.closest("[inert]") || el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > W || r.top > H || opacityOf(el) < 0.5) continue;
    if (getComputedStyle(el).pointerEvents === "none" && !el.closest(".ix-hud, .ix-pop, .ix-intro")) continue;
    // inline in a sentence (an entity chip, a defined word): WCAG's inline exception
    const inline = !!el.closest(".ix-cap-text, .ix-l-plain, .ix-l-why, .ix-ex-about, .ix-predict-q, .ix-opt-text, p") && getComputedStyle(el).display.startsWith("inline");
    // a control under an open panel, or clipped out of its scroller, is not a target a pointer can reach
    const reach = shownAt(el, r.left + r.width / 2, r.top + r.height / 2);
    controls.push({ el, cls: cls(el), name: nameOf(el), x: r.left, y: r.top, w: r.width, h: r.height, inline, tab: el.tabIndex >= 0, reach });
  }
  seen.remove();
  // focus: does a keyboard focus show anything? (outline, or a box-shadow / background that changes)
  const before = document.activeElement;
  const look = (el) => { const cs = getComputedStyle(el); return [cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? "o" : "", cs.boxShadow, cs.backgroundColor, cs.color].join("|"); };
  for (const c of controls) {
    if (!c.tab) continue;
    const el = c.el, a = look(el);
    try { el.focus({ preventScroll: true, focusVisible: true }); } catch { continue; }
    if (document.activeElement !== el) continue;
    // a range shows its ring on the thumb
    c.focus = el.matches(":focus-visible") && (look(el) !== a || el.type === "range");
  }
  before?.focus?.({ preventScroll: true }); if (document.activeElement && document.activeElement !== before) document.activeElement.blur();
  return { texts, controls: controls.map(({ el, ...c }) => c), W, H };
})()`;

const GLYPHS_OFF = `.ix *, .ix *::before, .ix *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; }`;

/**
 * Measure the page as it is now. page: an openPage() page at dpr 1. Returns findings
 * [{ kind: "a11y-contrast" | "a11y-target" | "a11y-name" | "a11y-focus", cls, text, value?, need?, message }].
 */
export async function a11yCheck(page) {
  const probe = await page.evaluate(PROBE);
  await page.evaluate(`(() => { const s = document.createElement("style"); s.id = "ix-a11y-glyphs"; s.textContent = ${JSON.stringify(GLYPHS_OFF)}; document.head.append(s); return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))); })()`);
  let img;
  try { img = decodePng(await page.png()); }
  finally { await page.evaluate(`document.getElementById("ix-a11y-glyphs")?.remove(), true`); }
  const sx = img.width / probe.W, sy = img.height / probe.H;
  const out = [];
  for (const t of probe.texts) {
    const [fr, fg, fb, fa] = t.fg;
    const x0 = Math.max(0, Math.floor(t.x * sx)), x1 = Math.min(img.width, Math.ceil((t.x + t.w) * sx));
    const y0 = Math.max(0, Math.floor(t.y * sy)), y1 = Math.min(img.height, Math.ceil((t.y + t.h) * sy));
    const rs = [];
    const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 400)));
    for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
      const o = (y * img.width + x) * 4, br = img.data[o], bg = img.data[o + 1], bb = img.data[o + 2];
      // the glyph's colour as it lands on this pixel (translucent ink blends with what is under it)
      const lf = luminance(fr * fa + br * (1 - fa), fg * fa + bg * (1 - fa), fb * fa + bb * (1 - fa));
      rs.push({ r: ratio(lf, luminance(br, bg, bb)), bg: [br, bg, bb] });
    }
    if (!rs.length) continue;
    rs.sort((a, b) => a.r - b.r);
    const at = rs[Math.floor(rs.length * 0.1)], value = at.r, need = t.large ? 3 : 4.5;
    if (value < need) out.push({ kind: "a11y-contrast", cls: t.cls, text: t.text, value, need, fg: hex(t.fg), bg: hex(at.bg) });
  }
  const ctl = probe.controls;
  for (const c of ctl) {
    if (!c.name) out.push({ kind: "a11y-name", cls: c.cls, text: "" });
    if (c.tab && c.focus === false) out.push({ kind: "a11y-focus", cls: c.cls, text: c.name });
    if ((c.w < 24 || c.h < 24) && !c.inline && c.reach !== false) {
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      const sq = { l: cx - 12, t: cy - 12, r: cx + 12, b: cy + 12 };
      const near = ctl.some((d) => d !== c && d.reach !== false && !(d.x >= c.x && d.y >= c.y && d.x + d.w <= c.x + c.w && d.y + d.h <= c.y + c.h)
        && !(c.x >= d.x && c.y >= d.y && c.x + c.w <= d.x + d.w && c.y + c.h <= d.y + d.h)
        && d.x < sq.r && d.x + d.w > sq.l && d.y < sq.b && d.y + d.h > sq.t);
      if (near) out.push({ kind: "a11y-target", cls: c.cls, text: c.name, value: Math.min(c.w, c.h) });
    }
  }
  return out;
}

/** Fold raw findings from many frames into one line each, by kind and component, with the worst value seen. */
export function foldA11y(found) {
  const by = new Map();
  for (const f of found) {
    const k = `${f.kind}|${f.cls}`;
    const g = by.get(k) ?? { kind: f.kind, cls: f.cls, worst: f, steps: new Set(), where: new Set(), n: 0 };
    g.n++;
    if (f.step != null) g.steps.add(f.step);
    if (f.where) g.where.add(f.where);
    if (f.value != null && (g.worst.value == null || f.value < g.worst.value)) g.worst = f;
    by.set(k, g);
  }
  return [...by.values()].map((g) => {
    const w = g.worst, eg = w.text ? ` (e.g. "${w.text}")` : "";
    const message = g.kind === "a11y-contrast" ? `${g.cls} text at ${w.value.toFixed(2)}:1, under ${w.need}:1 (${w.fg} on ${w.bg})${eg}`
      : g.kind === "a11y-target" ? `${g.cls} is ${Math.round(w.value)} px, under 24 px, and crowds another control${eg}`
      : g.kind === "a11y-name" ? `${g.cls} has no accessible name`
      : `${g.cls} shows no focus ring${eg}`;
    return { kind: g.kind, message, steps: g.steps, where: g.where, n: g.n };
  });
}
