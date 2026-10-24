// node edtbench.mjs <edt.mjs path>: ms per sdfFromAlpha on string-sized coverage images
const { sdfFromAlpha } = await import(process.argv[2]);
function img(w, h, seed) {   // anti-aliased blobs and strokes, like glyphs
  const a = new Uint8Array(w * h); let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const shapes = Array.from({ length: 14 }, () => [10 + rnd() * (w - 20), 10 + rnd() * (h - 20), 3 + rnd() * 14]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0; for (const [cx, cy, r] of shapes) { const d = Math.hypot(x - cx, y - cy) - r; c = Math.max(c, Math.min(1, Math.max(0, 0.5 - d))); }
    a[y * w + x] = Math.round(c * 255);
  }
  return a;
}
const sizes = [[280, 92], [180, 92], [520, 92], [96, 92]];
const imgs = sizes.map(([w, h], i) => ({ w, h, a: img(w, h, i + 1) }));
for (const { w, h, a } of imgs) for (let k = 0; k < 20; k++) sdfFromAlpha(a, w, h, 8);   // warm
const out = {};
for (const { w, h, a } of imgs) {
  const t0 = performance.now(); const N = 60; let x = 0;
  for (let k = 0; k < N; k++) x += sdfFromAlpha(a, w, h, 8)[5];
  out[`${w}x${h}`] = +((performance.now() - t0) / N).toFixed(3);
}
// a checksum of the outputs, to prove two implementations give the same bytes
let hsum = 0; for (const { w, h, a } of imgs) { const o = sdfFromAlpha(a, w, h, 8); for (let i = 0; i < o.length; i++) hsum = (hsum * 31 + o[i]) >>> 0; }
console.log(JSON.stringify({ msPerString: out, checksum: hsum }));
