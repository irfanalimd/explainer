// SDF text atlas. Whole strings are rasterised once at PX px with the real Geist faces (so kerning and
// tracking are exact), turned into a signed distance field by an exact EDT, and packed into one R8 atlas
// (shelf packer, LRU eviction for strings that come and go, like counters). The renderer samples it with
// screen-space AA, so labels stay crisp at every zoom.
//
// Browser-only for rasterising (2D canvas); the packing logic is plain JS.
import { TYPE } from "../tokens.mjs";
import { sdfFromAlpha } from "./edt.mjs";

export const ATLAS = { size: 2048, px: 64, spread: 8 };
const FACES = [
  [TYPE.sans, [400, 500, 600]],
  [TYPE.mono, [400, 500, 600]],
];

/** A shelf allocator whose rows can free and reuse gaps. */
export class Shelves {
  constructor(w, h) { this.w = w; this.h = h; this.shelves = []; this.next = 0; }
  alloc(w, h) {
    if (w > this.w) return null;
    for (const s of this.shelves) {
      if (s.h < h || s.h > h * 1.4 + 8) continue;
      let x = 0;
      for (let i = 0; i <= s.items.length; i++) {
        const end = i < s.items.length ? s.items[i].x : this.w;
        if (end - x >= w) {
          const item = { x, w, shelf: s };
          s.items.splice(i, 0, item);
          return { x, y: s.y, item };
        }
        if (i < s.items.length) x = s.items[i].x + s.items[i].w;
      }
    }
    // an emptied shelf of any height can be reclaimed for this height if it is tall enough
    for (const s of this.shelves) if (!s.items.length && s.h >= h) {
      const item = { x: 0, w, shelf: s };
      s.items.push(item);
      return { x: 0, y: s.y, item };
    }
    if (this.next + h > this.h) return null;
    const s = { y: this.next, h, items: [] };
    this.next += h;
    this.shelves.push(s);
    const item = { x: 0, w, shelf: s };
    s.items.push(item);
    return { x: 0, y: s.y, item };
  }
  free(item) {
    const s = item.shelf, i = s.items.indexOf(item);
    if (i >= 0) s.items.splice(i, 1);
  }
  clear() { this.shelves = []; this.next = 0; }
}

const familyOf = (font) => (font === "sans" ? TYPE.sans : TYPE.mono);
const cssFont = (family, weight, px) => `${weight} ${px}px "${family}"`;

export class TextAtlas {
  constructor({ size = ATLAS.size, px = ATLAS.px, spread = ATLAS.spread } = {}) {
    this.size = size; this.px = px; this.spread = spread;
    this.pad = spread + 2;
    this.entries = new Map();
    this.shelves = new Shelves(size, size);
    this.frame = 0;
    this.metrics = new Map();
    this.fontsOk = false;          // the real faces are loaded
    this.generation = 0;           // bumps when faces arrive late: everything re-rasterises
    this.gl = null; this.tex = null;
    this.budgetMs = Infinity;      // set a finite budget (ms per frame) to spread rasterising over frames
    this.warm = 3;                 // the first frames rasterise everything they need
    this.unbounded = false;
    this.missed = 0;
    this.ready = this.loadFonts();
  }

  async loadFonts() {
    if (typeof document === "undefined" || !document.fonts) { this.fontsOk = true; return; }
    const specs = [];
    for (const [fam, ws] of FACES) for (const w of ws) specs.push(cssFont(fam, w, this.px));
    const load = () => Promise.all(specs.map((s) => document.fonts.load(s).catch(() => [])));
    let got = await load();
    if (got.some((faces) => !faces.length)) {
      // the page did not declare the faces: register them from the skill's assets as a fallback
      try {
        const base = new URL("../../assets/fonts/", import.meta.url);
        if (/^(https?|file):/.test(base.protocol)) {
          for (const [fam, file] of [[TYPE.sans, "Geist-latin.woff2"], [TYPE.mono, "GeistMono-latin.woff2"]]) {
            const ff = new FontFace(fam, `url(${new URL(file, base)})`, { weight: "100 900" });
            document.fonts.add(ff);
            await ff.load().catch(() => {});
          }
          got = await load();
        }
      } catch { /* keep going with whatever is available */ }
    }
    await document.fonts.ready;
    this.fontsOk = specs.every((s) => document.fonts.check(s));
    if (!this.fontsOk) {
      // never keep fallback rasters: when the faces turn up later, start over
      document.fonts.addEventListener?.("loadingdone", () => {
        if (specs.every((s) => document.fonts.check(s)) && !this.fontsOk) { this.fontsOk = true; this.invalidate(); }
      });
      this.fallback = true;
    }
  }

  attach(gl) {
    this.gl = gl;
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, this.size, this.size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.invalidate();
  }

  invalidate() { this.entries.clear(); this.shelves.clear(); this.metrics.clear(); this.generation++; }

  beginFrame() { if (this.fontsOk || this.fallback) this.warm--; this.frame++; this.spent = 0; this.t0 = (typeof performance !== "undefined" ? performance : Date).now(); this.missed = 0; }

  canvas(w, h) {
    if (!this._cv) {
      this._cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
      this._cx = this._cv.getContext("2d", { willReadFrequently: true });
    }
    if (this._cv.width < w || this._cv.height < h) {
      this._cv.width = Math.max(this._cv.width, w); this._cv.height = Math.max(this._cv.height, h);
    }
    return this._cx;
  }

  fontMetrics(family, weight) {
    const k = family + "|" + weight;
    let m = this.metrics.get(k);
    if (m) return m;
    const ctx = this.canvas(16, 16);
    ctx.font = cssFont(family, weight, this.px);
    ctx.letterSpacing = "0px";
    const H = ctx.measureText("H"), x = ctx.measureText("x"), g = ctx.measureText("Hgjp|");
    m = {
      cap: H.actualBoundingBoxAscent,
      xh: x.actualBoundingBoxAscent,
      ascent: Math.ceil(Math.max(g.fontBoundingBoxAscent ?? this.px * 0.95, g.actualBoundingBoxAscent)),
      descent: Math.ceil(Math.max(g.fontBoundingBoxDescent ?? this.px * 0.3, g.actualBoundingBoxDescent)),
    };
    this.metrics.set(k, m);
    return m;
  }

  /**
   * The atlas entry for a string, rasterising it if needed (within the per-frame time budget).
   * Returns null while fonts load or when the budget is spent (the label simply appears next frame).
   */
  get(text, font = "mono", weight = 500, tracking = 0) {
    if (!this.gl || !this.fontsOk && !this.fallbackOk()) return null;
    text = String(text);
    if (!text.length) return null;
    const key = font + "|" + weight + "|" + tracking + "|" + text;
    let e = this.entries.get(key);
    if (e) { e.used = this.frame; return e; }
    const now = (typeof performance !== "undefined" ? performance : Date).now();
    if (!this.unbounded && this.warm <= 0 && now - this.t0 > this.budgetMs) { this.missed++; return null; }
    e = this.rasterise(key, text, familyOf(font), weight, tracking);
    if (e) this.entries.set(key, e);
    return e;
  }

  // after fonts.ready, a page without the faces still gets text (in the fallback), never silently none
  fallbackOk() { return this.fallback === true; }

  rasterise(key, text, family, weight, tracking) {
    const px = this.px, pad = this.pad;
    const m = this.fontMetrics(family, weight);
    let ctx = this.canvas(16, 16);
    const font = cssFont(family, weight, px) + (this.fontsOk ? "" : `, ${family === TYPE.sans ? TYPE.fallbackSans : TYPE.fallbackMono}`);
    ctx.font = font;
    ctx.letterSpacing = `${tracking * px}px`;
    const mt = ctx.measureText(text);
    const trail = tracking * px;               // canvas adds spacing after the last glyph too
    const advance = Math.max(1, mt.width - trail);
    const left = Math.max(0, Math.ceil(mt.actualBoundingBoxLeft));
    const inkRight = Math.ceil(Math.max(mt.actualBoundingBoxRight, advance));
    const w = Math.min(this.size, left + inkRight + pad * 2);
    const h = m.ascent + m.descent + pad * 2;
    const slot = this.allocate(w, h);
    if (!slot) return null;
    ctx = this.canvas(w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = font;
    ctx.letterSpacing = `${tracking * px}px`;
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const ox = pad + left, oy = pad + m.ascent;
    ctx.fillText(text, ox, oy);
    const img = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = img[i * 4 + 3];
    const sdf = sdfFromAlpha(alpha, w, h, this.spread);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, slot.x, slot.y, w, h, gl.RED, gl.UNSIGNED_BYTE, sdf);
    const S = this.size;
    return {
      key, item: slot.item, x: slot.x, y: slot.y, w, h, used: this.frame,
      u0: slot.x / S, v0: slot.y / S, u1: (slot.x + w) / S, v1: (slot.y + h) / S,
      originX: ox, baseline: oy, advance, cap: m.cap, px,
    };
  }

  allocate(w, h) {
    let slot = this.shelves.alloc(w, h);
    if (slot) return slot;
    // LRU: evict strings not used this frame, oldest first, until it fits
    const old = [...this.entries.values()].filter((e) => e.used < this.frame).sort((a, b) => a.used - b.used);
    for (const e of old) {
      this.shelves.free(e.item);
      this.entries.delete(e.key);
      slot = this.shelves.alloc(w, h);
      if (slot) return slot;
    }
    return null;
  }

  stats() { return { strings: this.entries.size, shelves: this.shelves.shelves.length, fontsOk: this.fontsOk }; }
}
