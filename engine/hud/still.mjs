// "Save image" (share.mjs): the frame on screen as a PNG a reader can put on a slide. The runtime hands over the
// world, drawn again in capture quality and cropped to the free area the HUD leaves (runtime snapshot()); this module
// lays the world's tags where the HUD placed them, and under the world a band with the step's own words and where it
// is (figure · story · chapter · step). Everything in it comes from the run and the lesson; nothing is redrawn by hand.
// It draws with Canvas 2D in the page's own fonts and theme, so it works offline and from file://.
import { parse } from "./markup.mjs";

const PAD = 28, META = 13, TEXT = 22, LINE = 32, GAP = 10, TAG = 12;
// a chip's padding around its text (css px): 6 each side; an entity chip adds its dot and the gap after it
const chipPad = (a) => (a.kind === "ref" ? 25 : 12);

/**
 * shot: { canvas, scale, crop: { left, top, width, height } } (css px; canvas is in device px, scale = device / css)
 * o: { root (for the theme's variables and the tag layer), title, where (the meta line), caption (markup or null),
 *      keyIndex(name) -> identity index | null, refTitle(id) -> name | null }
 * Returns a Promise of a PNG Blob (null when the browser can't make one).
 */
export async function composeStill(shot, o) {
  const doc = o.root.ownerDocument, win = doc.defaultView;
  const css = win.getComputedStyle(o.root);
  const v = (name, fb) => css.getPropertyValue(`--ix-${name}`).trim() || fb;
  const sans = v("font-sans", "sans-serif"), mono = v("font-mono", "monospace");
  try { await Promise.all([doc.fonts?.load(`400 ${TEXT}px ${sans}`), doc.fonts?.load(`500 ${TEXT}px ${mono}`), doc.fonts?.load(`500 ${META}px ${sans}`)]); } catch { /* the fallbacks draw */ }
  const k = shot.scale, W = shot.canvas.width, Hw = shot.canvas.height;
  const c = doc.createElement("canvas");
  const g = c.getContext("2d");
  const maxW = W - 2 * PAD * k;

  // ---- the band's words, laid out first so the canvas can be sized ----
  const runs = o.caption ? atoms(parse(o.caption), o) : [];
  const font = (a) => `${a.kind === "text" || a.kind === "tone" ? (a.bold ? 600 : 400) : 500} ${(a.kind === "text" || a.kind === "tone" ? TEXT : TEXT * 0.82) * k}px ${a.kind === "text" || a.kind === "tone" ? sans : mono}`;
  const width = (a) => { g.font = font(a); return g.measureText(a.text).width + (a.kind === "text" || a.kind === "tone" ? 0 : chipPad(a) * k + 2 * k) + (a.after ? (g.font = font({ kind: "text" }), g.measureText(a.after).width) : 0); };
  const lines = [[]];
  let x = 0;
  for (const a of runs) {
    const w = width(a);
    if (x + w > maxW && lines[lines.length - 1].length && !(a.kind === "text" && /^\s+$/.test(a.text))) { lines.push([]); x = 0; }
    if (!lines[lines.length - 1].length && a.kind === "text" && /^\s+$/.test(a.text)) continue;   // no space at a line's start
    lines[lines.length - 1].push({ ...a, w });
    x += w;
  }
  const textLines = runs.length ? lines.length : 0;
  const band = Math.round((PAD * 2 + META * 1.4 + (textLines ? GAP + textLines * LINE : 0)) * k);
  c.width = W; c.height = Hw + band;

  // ---- the world, then its tags where the HUD put them ----
  g.drawImage(shot.canvas, 0, 0);
  for (const t of o.root.querySelectorAll(".ix-tags .ix-tag")) {
    const op = Number(win.getComputedStyle(t).opacity);
    if (!(op > 0.05)) continue;
    const r = t.getBoundingClientRect(), rr = o.root.getBoundingClientRect();
    const tx = (r.left - rr.left - shot.crop.left) * k, ty = (r.top - rr.top - shot.crop.top) * k;
    if (tx + r.width * k < 0 || ty + r.height * k < 0 || tx > W || ty > Hw) continue;
    g.globalAlpha = op;
    roundRect(g, tx, ty, r.width * k, r.height * k, 8 * k);
    g.fillStyle = v("surface", "#fff"); g.fill();
    g.lineWidth = k; g.strokeStyle = v("line", "rgba(0,0,0,.1)"); g.stroke();
    const tone = [...t.classList].map((cl) => /^ix-tag-(ok|busy|warn|fail|idle)$/.exec(cl)?.[1]).find(Boolean);
    let lx = tx + 8 * k;
    if (tone) { g.fillStyle = v(tone, "#888"); g.beginPath(); g.arc(lx + 3 * k, ty + r.height * k / 2, 3 * k, 0, Math.PI * 2); g.fill(); lx += 12 * k; }
    g.fillStyle = v("ink", "#000"); g.font = `500 ${TAG * k}px ${mono}`; g.textBaseline = "middle";
    g.fillText(t.textContent.trim(), lx, ty + r.height * k / 2 + 0.5 * k);
    g.globalAlpha = 1;
  }

  // ---- the band: where we are, then the step's words with their chips ----
  g.fillStyle = v("surface", "#fff");
  g.fillRect(0, Hw, W, band);
  g.globalAlpha = 1;
  g.fillStyle = v("line", "rgba(0,0,0,.1)");
  g.fillRect(0, Hw, W, Math.max(1, k));
  g.textBaseline = "alphabetic";
  g.fillStyle = v("ink-faint", "#666");
  g.font = `500 ${META * k}px ${sans}`;
  g.fillText(o.where, PAD * k, Hw + (PAD + META) * k);
  let y = Hw + (PAD + META * 1.4 + GAP) * k;
  for (const line of textLines ? lines : []) {
    let lx = PAD * k;
    const base = y + LINE * 0.72 * k;
    for (const a of line) {
      g.font = font(a);
      if (a.kind === "text" || a.kind === "tone") {
        g.fillStyle = a.kind === "tone" && a.tone ? v(a.tone, v("ink", "#000")) : v("ink", "#000");
        g.fillText(a.text, lx, base);
        lx += a.w;
        continue;
      }
      const tw = g.measureText(a.text).width;
      const ch = TEXT * 1.3 * k, cy = base - TEXT * 0.98 * k, cw = tw + chipPad(a) * k;
      roundRect(g, lx + 1 * k, cy, cw, ch, 6 * k);
      if (a.kind === "key" && a.color) { g.fillStyle = a.color; g.fill(); }
      else if (a.kind === "code") { g.fillStyle = v("hover", "rgba(0,0,0,.05)"); g.fill(); g.lineWidth = k; g.strokeStyle = v("line", "rgba(0,0,0,.1)"); g.stroke(); }
      else { g.lineWidth = k; g.strokeStyle = v("line-strong", "rgba(0,0,0,.2)"); g.stroke(); }
      let ix = lx + 1 * k + 6 * k;
      if (a.kind === "ref") { g.fillStyle = v("ink-faint", "#666"); g.beginPath(); g.arc(ix + 4.5 * k, cy + ch / 2, 2.5 * k, 0, Math.PI * 2); g.fill(); ix += 13 * k; }
      g.fillStyle = a.kind === "key" && a.color ? v("key-ink", "#111") : v("ink", "#000");
      g.fillText(a.text, ix, base);
      lx += cw + 2 * k;
      if (a.after) { g.font = font({ kind: "text" }); g.fillStyle = v("ink", "#000"); g.fillText(a.after, lx, base); lx += g.measureText(a.after).width; }
    }
    y += LINE * k;
  }
  return new Promise((ok) => { try { c.toBlob((b) => ok(b), "image/png"); } catch { ok(null); } });

  // a node list as words and chips (a chip keeps the punctuation right after it, as the caption does)
  function atoms(nodes, opts, bold = false) {
    const out = [];
    for (let i = 0; i < nodes.length; i++) {
      let n = nodes[i];
      if (n.type === "bold") { out.push(...atoms(n.children, opts, true)); continue; }
      if (n.type === "cite") {   // a citation prints as the page shows it: "Dean & Ghemawat 2004, §3.6"
        const c = opts.cite?.(n.id);
        n = { type: "text", text: c ? (n.at ? `${c.label}, ${n.at}` : c.label) : n.raw };
      }
      if (n.type === "text" || n.type === "term" || n.type === "tone") {
        for (const part of String(n.text).split(/(\s+)/)) if (part) out.push({ kind: n.type === "tone" ? "tone" : "text", tone: n.tone, text: part, bold });
        continue;
      }
      const text = n.type === "ref" ? n.text ?? opts.refTitle?.(n.id) ?? n.id : n.text;
      const idx = n.type === "key" ? opts.keyIndex?.(n.name) : null;
      const a = { kind: n.type, text, color: idx != null ? v(`key-${((idx % 8) + 8) % 8}`, null) : null };
      const next = nodes[i + 1];
      const m = next?.type === "text" ? /^[.,;:!?)\]…»”’%]+/.exec(next.text) : null;
      if (m) { a.after = m[0]; nodes = [...nodes.slice(0, i + 1), { ...next, text: next.text.slice(m[0].length) }, ...nodes.slice(i + 2)]; }
      out.push(a);
    }
    return out;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, r); return; }
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** A file name for the moment: "mapreduce-skew-step-14.png". */
export function stillName(title, scenario, step) {
  const slug = (s) => String(s ?? "").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return [slug(title) || "figure", slug(scenario), step != null ? `step-${step + 1}` : ""].filter(Boolean).join("-") + ".png";
}
