// node heapsum.mjs <sampling heap profile> <frames>: bytes allocated per frame by function (self), top 25
import { readFileSync } from "node:fs";
const p = JSON.parse(readFileSync(process.argv[2], "utf8")), frames = Number(process.argv[3] || 1);
const by = new Map();
const mod = (url) => { const m = /export (?:function|class|const) (\w+)/.exec(url.slice(0, 6000).replace(/%0A/g, "\n").replace(/%20/g, " ")); return m ? m[1] : url.slice(0, 30); };
(function walk(n) {
  const k = `${n.callFrame.functionName || "(anon)"} [${mod(n.callFrame.url)}:${n.callFrame.lineNumber}]`;
  by.set(k, (by.get(k) || 0) + n.selfSize);
  for (const c of n.children || []) walk(c);
})(p.head);
const tot = [...by.values()].reduce((a, b) => a + b, 0);
console.log("sampled total KB", (tot / 1024).toFixed(0), "per frame KB", (tot / 1024 / frames).toFixed(1));
for (const [k, v] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log((v / 1024 / frames).toFixed(2).padStart(9), "KB/frame", k);
