// node cost.mjs <example>: sample + skin time per frame over the whole run, spotlight off and on (Node, median of 5)
import { loadFigure } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/scripts/lib/lesson-load.mjs";
import { compile } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/engine/scene/index.mjs";
import { skin } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/engine/gfx/skin.mjs";
import { DrawList } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/engine/contracts.mjs";
import { rng } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/sim/rng.mjs";
const fig = await loadFigure(`/home/ubuntu/tmp/explainer-perf/guide/world-focus/examples/${process.argv[2]}/figure.mjs`);
const tl = compile(fig, { rng });
const N = 1500, dl = new DrawList();
const run = (spot) => { let f = null; const t0 = performance.now();
  for (let k = 0; k < N; k++) { f = tl.sample(tl.duration * k / N, { pxPerUnit: 2, spot: spot > 0 }, f); dl.clear(); skin(f.poses, dl, { theme: "light", time: 0, pxPerUnit: 2, spot }); }
  return (performance.now() - t0) / N; };
for (let w = 0; w < 3; w++) { run(0); run(0.5); }
const A = [], B = [];
for (let r = 0; r < 9; r++) { A.push(run(0)); B.push(run(0.5)); }
const mid = (xs) => xs.sort((a, b) => a - b)[4];
const off = mid(A), on = mid(B);
console.log(`${process.argv[2]}: off ${off.toFixed(3)} ms/frame, on ${on.toFixed(3)} ms/frame (+${(on - off).toFixed(3)} ms)`);
