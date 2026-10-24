// node spots.mjs <example> [scenario]: per step, what the spotlight keeps (and how much of the world that is)
import { loadFigure } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/scripts/lib/lesson-load.mjs";
import { compile } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/engine/scene/index.mjs";
import { rng } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/sim/rng.mjs";
import { plain } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/engine/scene/narrate.mjs";
import { SPOT_STRUCTURE } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/engine/scene/sampler.mjs";
const [ex, scen] = process.argv.slice(2);
const fig = await loadFigure(`/home/ubuntu/tmp/explainer-perf/guide/world-focus/examples/${ex}/figure.mjs`);
const tl = compile(fig, { scenario: scen, rng });
const X = tl._;
let off = 0;
tl.steps.forEach((s, i) => {
  const keep = X.spotByStep[i];
  const N = X.beatStates[i].at(-1);
  const things = [...N].filter(([, r]) => !SPOT_STRUCTURE.has(r.kind)).map(([id]) => id);
  if (!keep) off++;
  const kept = keep ? things.filter((id) => keep.has(id)) : [];
  console.log(`${String(i).padStart(2)} ${keep ? `${kept.length}/${things.length}` : `off(${things.length})`.padEnd(5)}  ${plain(s.caption).slice(0, 70).padEnd(70)} | ${keep ? things.filter((id) => !keep.has(id)).join(" ").slice(0, 80) : ""}`);
});
console.log(`${tl.steps.length} steps, ${off} without a spotlight`);
