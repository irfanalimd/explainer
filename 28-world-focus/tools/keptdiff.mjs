// node keptdiff.mjs <base dir> <new dir>: for each new shot with a .kept.json, compare base and new inside every kept
// solid's screen box (inset 4 px): pixels that differ at all, by > 8 and by > 24 (of 255), and the largest difference
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { decode, diff } from "./pnglib.mjs";
const [A, B, only] = process.argv.slice(2);   // only: "leaf" keeps tiles, records, bits, pages (no housing holds a receded one)
let tot = 0, any = 0, gt8 = 0, gt24 = 0, max = 0;
for (const f of readdirSync(B).filter((x) => x.endsWith(".kept.json")).sort()) {
  const png = f.replace(".kept.json", ".png");
  if (!existsSync(join(A, png))) continue;
  const a = decode(readFileSync(join(A, png))), b = decode(readFileSync(join(B, png)));
  let n = 0, d = 0, d8 = 0, d24 = 0, m = 0;
  for (const { kind, box: [x0, y0, x1, y1] } of JSON.parse(readFileSync(join(B, f), "utf8"))) {
    if (only === "leaf" && (kind === "housing" || kind === "container")) continue;
    const X0 = Math.max(0, x0 + 4), Y0 = Math.max(0, y0 + 4), X1 = Math.min(a.w, x1 - 4), Y1 = Math.min(a.h, y1 - 4);
    if (X1 <= X0 || Y1 <= Y0) continue;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const i = (y * a.w + x) * 4; let v = 0; for (let k = 0; k < 3; k++) v = Math.max(v, Math.abs(a.data[i + k] - b.data[i + k]));
      n++; if (v) d++; if (v > 8) d8++; if (v > 24) d24++; if (v > m) m = v;
    }
  }
  tot += n; any += d; gt8 += d8; gt24 += d24; max = Math.max(max, m);
  console.log(`${png.padEnd(26)} kept px ${String(n).padStart(8)}  differ ${(100 * d / n).toFixed(2)}%  >8 ${(100 * d8 / n).toFixed(3)}%  >24 ${(100 * d24 / n).toFixed(3)}%  max ${m}`);
}
console.log(`all: kept px ${tot}, differ ${(100 * any / tot).toFixed(2)}%, >8 ${(100 * gt8 / tot).toFixed(3)}%, >24 ${(100 * gt24 / tot).toFixed(3)}%, max ${max}`);
