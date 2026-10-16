#!/usr/bin/env node
// Decode a screenshot PNG (8-bit RGB/RGBA, non-interlaced) and report pixels against a token colour.
//   node engine/gfx/pngcheck.mjs shot.png --token dark.stage [--at x,y ...] [--grid]
// --grid scans a coarse grid and reports how many samples sit within 3/255 of the token (open floor).
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PALETTE, hex } from "../tokens.mjs";

export function readPng(buf) {
  let o = 8, w = 0, h = 0, ct = 0, idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString("ascii", o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12]) throw new Error("only 8-bit non-interlaced"); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : (() => { throw new Error("colour type " + ct); })();
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, px = new Uint8Array(w * h * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, at: (x, y) => { const i = (y * w + x) * bpp; return [px[i], px[i + 1], px[i + 2]]; } };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const args = process.argv.slice(2);
  const file = args[0];
  const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const [theme, key] = (opt("--token") ?? "dark.stage").split(".");
  const want = hex(PALETTE[theme][key]).map((v) => Math.round(v * 255));
  const img = readPng(readFileSync(file));
  console.log(`${file}: ${img.w}x${img.h}, token ${theme}.${key} = ${want.join(",")}`);
  const pts = args.flatMap((a, i) => (args[i - 1] === "--at" ? [a.split(",").map(Number)] : []));
  for (const [x, y] of pts) {
    // average a 5x5 patch (grain is zero-mean) and report the worst single pixel too
    let s = [0, 0, 0], worst = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const p = img.at(x + dx, y + dy); s = s.map((v, k) => v + p[k]);
      worst = Math.max(worst, ...p.map((v, k) => Math.abs(v - want[k])));
    }
    const m = s.map((v) => v / 25);
    console.log(`  (${x},${y}) mean ${m.map((v) => v.toFixed(1)).join(",")}  diff ${m.map((v, k) => (v - want[k]).toFixed(1)).join(",")}  worst px ${worst}`);
  }
  if (args.includes("--grid")) {
    let n = 0, ok = 0;
    for (let y = Math.floor(img.h * 0.1); y < img.h * 0.9; y += 7) for (let x = Math.floor(img.w * 0.1); x < img.w * 0.9; x += 7) {
      const p = img.at(x, y); n++;
      if (p.every((v, k) => Math.abs(v - want[k]) <= 3)) ok++;
    }
    console.log(`  grid: ${ok}/${n} samples within 3/255 of the token (${(100 * ok / n).toFixed(1)}%)`);
  }
}
