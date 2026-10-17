// Adaptive resolution for big screens. While frames run long, the scene passes draw at a lower internal scale (the
// composite still fills the canvas at full size): it steps down when, for a second of continuous frames, the GPU
// span stays over budget and frames miss their vsync; it steps back up only when the span at the higher scale would
// sit well inside the budget, and never sooner than `hold` after the last change, so it never flickers. Captured
// frames always draw at full scale (the renderer asks for it). Pure: fed timings, it answers the scale.

export const ADAPT = {
  steps: [1, 0.92, 0.84, 0.75],    // internal scale of the device pixel ratio; never below 0.75
  budget: 14,                       // ms of GPU span a 60 Hz frame can afford
  raise: 10,                        // ms the span at the next scale up must be predicted under to go back up
  late: 18,                         // ms: a median frame interval over this missed a 60 Hz vsync
  window: 1000,                     // ms of continuous frames a decision looks at
  minFrames: 30,
  gap: 100,                         // ms between frames that breaks a run (paused, hidden): the window starts over
  hold: 2000,                       // ms after a change before stepping back up
};

export class Governor {
  constructor() { this.level = 0; this.samples = []; this.last = -Infinity; this.changed = -Infinity; }
  get scale() { return ADAPT.steps[this.level]; }

  /** Start over at full scale (capture, a new size). */
  reset() { this.level = 0; this.samples.length = 0; this.last = -Infinity; }

  /**
   * One frame drawn at `now` (ms) whose GPU span is `gpuMs` (0: unknown). Returns true when the scale changed.
   */
  frame(now, gpuMs) {
    const dt = now - this.last;
    this.last = now;
    const S = this.samples;
    if (!(dt < ADAPT.gap) || !(gpuMs > 0)) { S.length = 0; return false; }
    S.push([now, gpuMs, dt]);
    while (S.length && S[0][0] < now - ADAPT.window) S.shift();
    if (S.length < ADAPT.minFrames || now - this.changed < ADAPT.window) return false;
    const q = (k, f) => { const v = S.map((s) => s[k]).sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(v.length * f))]; };
    const gpu = q(1, 0.5), late = q(2, 0.5) > ADAPT.late;
    const st = ADAPT.steps;
    let next = this.level;
    if (gpu > ADAPT.budget && late && this.level < st.length - 1) next++;
    else if (this.level > 0 && now - this.changed >= ADAPT.hold && gpu * (st[this.level - 1] / st[this.level]) ** 2 < ADAPT.raise) next--;
    if (next === this.level) return false;
    this.level = next; this.changed = now; S.length = 0;
    return true;
  }
}
