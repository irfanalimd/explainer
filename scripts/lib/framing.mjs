// Framing over time, in Node: the director's shot plan for a compiled run, sampled every 0.1 s of every step, with
// each step's focus box projected through the planned camera. The page's audit sees the same thing at two instants a
// step; this sees the moves between them (a step that starts while the camera is still on the last one).
//   outside: a focus corner (at z = 0) more than 2 px outside the viewport, the audit's focus-outside test
//   under:   inside the viewport, but more than 2 px into a HUD overlay (viewport.insets), the audit's focus-under-hud
import { planShots, cameraAt } from "../../engine/director/shots.mjs";
import { framer, projectPoint, ndcToCss } from "../../engine/director/director.mjs";

// The HUD's overlays at the two sizes verify and check use (css px), as the page reports them on MapReduce and Raft
// with the explain panel docked at 1440x900 and the caption over the phone's dock (DESIGN.md 9.3). The real page's
// insets move with the caption; audit measures those, this checks the shot plan against typical ones.
export const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 900, insets: Object.freeze({ top: 64, right: 384, bottom: 90, left: 0 }) }),
  phone: Object.freeze({ width: 390, height: 844, insets: Object.freeze({ top: 92, right: 0, bottom: 274, left: 0 }) }),
});

const STEP = 0.1, SLACK = 2;
// how long a step's focus must stay under the HUD to count: shorter is a camera move passing over the edge
export const UNDER_HUD = 0.5;

/**
 * Sweep a run's shot plan. Returns { steps: [{ index, outside, under }] } for the steps whose focus leaves the frame
 * or goes under the HUD at some sample (seconds of each), skipping the steps a scale shot frames (it frames its reveal,
 * not the step's focus), and { sampled } steps in all.
 */
export function frameSweep(tl, viewport) {
  const W = viewport.width, H = viewport.height, ins = viewport.insets ?? {}, aspect = W / H;
  const plan = planShots(tl, viewport, framer(viewport, tl.world));
  const scales = new Set((tl.scales ?? []).map((x) => x.step));
  const byStep = tl._?.focusByStep;
  const out = [], cam = { target: [0, 0, 0] }, p = [0, 0, 0];
  let sampled = 0;
  for (const st of tl.steps ?? []) {
    if (scales.has(st.index)) continue;
    const f = byStep ? byStep[st.index] ?? tl.world : tl.sample(st.t0, {}).focus;
    if (!f) continue;
    sampled++;
    const corners = [[f.minX, f.minY, 0], [f.maxX, f.minY, 0], [f.minX, f.maxY, 0], [f.maxX, f.maxY, 0]];
    let outside = 0, under = 0;
    for (let t = st.t0; t < st.t1; t += STEP) {
      cameraAt(plan, t, false, cam);
      let o = false, u = false;
      for (const c of corners) {
        const [x, y] = ndcToCss(projectPoint(cam, c, aspect, p), viewport);
        if (x < -SLACK || y < -SLACK || x > W + SLACK || y > H + SLACK) o = true;
        else if (x < (ins.left ?? 0) - SLACK || y < (ins.top ?? 0) - SLACK || x > W - (ins.right ?? 0) + SLACK || y > H - (ins.bottom ?? 0) + SLACK) u = true;
      }
      if (o) outside += STEP; else if (u) under += STEP;
    }
    if (outside || under) out.push({ index: st.index, outside: +outside.toFixed(1), under: +under.toFixed(1) });
  }
  return { steps: out, sampled };
}
