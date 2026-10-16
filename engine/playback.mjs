// Playback shaping the runtime applies on top of a compiled timeline, without changing it (DOM-free, tested in Node):
//   fold: once a step pattern is clear, speed through it. A step's caption *template* is its caption with chips,
//         numbers and inline code replaced by placeholders. Inside one chapter, after a pattern (one template, or a
//         short cycle of 2–3 templates) has played twice, the further steps that repeat it play faster: playback
//         warps time (rateAt), so steps, times, deep links and verify stay exactly as compiled.
//   fork: where a scenario diverges from the first one, so switching scenario can skip the shared setup.

export const FOLD = {
  rate: 3,        // peak playback rate on folded steps
  ramp: 1.4,      // timeline seconds to ease into and out of the fast rate (at most a third of the folded span)
  maxPeriod: 3,   // longest cycle of templates that counts as one pattern
};

// a caption's shape: what stays when the data changes
export function captionTemplate(caption = "") {
  return String(caption)
    .replace(/\\[{}|`*]/g, "")
    .replace(/\{(key|ref):[^}]*\}/g, "{$1}")
    .replace(/`[^`]*`/g, "`#`")
    .replace(/\*\*/g, "")
    .replace(/0x[0-9a-f_]+/gi, "#")
    .replace(/\d+(?:[.,]\d+)*/g, "#")
    // a comparison between two values is data too: "15 < 87" and "15 = 15" have one shape
    .replace(/# ?(?:[<>=≤≥≠]|==|!=) ?#/g, "# ~ #")
    .replace(/\s+/g, " ")
    .trim();
}

// the leading clause of a caption, for a folded step: "{key:fox} goes to {ref:r0} because …" → "{key:fox} goes to {ref:r0}"
const CLAUSE = [" because ", " — ", " – ", ": ", "; ", ", so ", " (", ", and ", ", but "];
export function captionHead(caption = "") {
  const c = String(caption);
  let depth = 0, code = false, cut = -1;
  for (let i = 0; i < c.length && cut < 0; i++) {
    const ch = c[i];
    if (ch === "\\") { i++; continue; }
    if (ch === "`") code = !code;
    else if (!code && ch === "{") depth++;
    else if (!code && ch === "}") depth = Math.max(0, depth - 1);
    else if (!code && !depth) for (const sep of CLAUSE) if (c.startsWith(sep, i)) { cut = i; break; }
  }
  const head = (cut > 0 ? c.slice(0, cut) : c).replace(/[\s.,;:—–-]+$/, "");
  // a head of one or two words says nothing; keep the sentence
  if (cut > 0 && captionTemplate(head).split(" ").length < 3) return c;
  return head;
}

/**
 * Plan the folds of a timeline: steps [{ caption, phase, ask, keep, t0, t1 }].
 * -> { steps: [null | { start, end, index, count, period, folded }], regions: [{ t0, t1, first, last }] }
 * A step is folded when it continues a pattern that has already played twice in a row in its chapter.
 * An ask step, the step that answers it, and a step built with { keep: true } never fold and break a pattern.
 */
export function foldPlan(steps = [], o = {}) {
  const maxP = o.maxPeriod ?? FOLD.maxPeriod;
  const n = steps.length;
  const tpl = steps.map((s) => captionTemplate(s.caption));
  const fixed = steps.map((s, i) => !!(s.ask || s.keep || (i > 0 && steps[i - 1].ask)));
  const out = new Array(n).fill(null);
  const same = (a, b) => !fixed[a] && !fixed[b] && tpl[a] === tpl[b] && (steps[a].phase ?? "") === (steps[b].phase ?? "") && tpl[a] !== "";
  let i = 0;
  while (i < n) {
    // the shortest period whose pattern repeats from i at least twice over and one step more
    let found = null;
    for (let p = 1; p <= maxP && !found; p++) {
      let j = i + p;
      while (j < n && same(j, j - p)) j++;
      const end = j - 1;   // the periodic run is [i, end]
      // a cycle of distinct-enough steps: a period-p run that is really period 1 belongs to p = 1
      if (p > 1 && new Set(tpl.slice(i, i + p)).size < p) continue;
      if (end - i + 1 > 2 * p) found = { p, end };
    }
    if (!found) { i++; continue; }
    const { p, end } = found;
    const count = end - i + 1;
    for (let k = i; k <= end; k++) out[k] = { start: i, end, index: k - i + 1, count, period: p, folded: k >= i + 2 * p };
    i = end + 1;
  }
  const regions = [];
  for (let k = 0; k < n; k++) {
    if (!out[k]?.folded) continue;
    const last = regions[regions.length - 1];
    if (last && last.last === k - 1) { last.last = k; last.t1 = steps[k].t1; }
    else regions.push({ t0: steps[k].t0, t1: steps[k].t1, first: k, last: k });
  }
  return { steps: out, regions };
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** Playback-rate multiplier at timeline time t: 1 outside folds, easing up to FOLD.rate and back down inside one. */
export function rateAt(plan, t, o = {}) {
  const R = o.rate ?? FOLD.rate, ramp = o.ramp ?? FOLD.ramp;
  const regions = plan?.regions;
  if (!regions?.length) return 1;
  let lo = 0, hi = regions.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (regions[mid].t0 <= t) lo = mid; else hi = mid - 1; }
  const g = regions[lo];
  if (!(t >= g.t0 && t < g.t1)) return 1;
  const r = Math.min(ramp, (g.t1 - g.t0) / 3);
  return 1 + (R - 1) * Math.min(smooth((t - g.t0) / r), smooth((g.t1 - t) / r));
}

/** Wall-clock seconds to play [t0, t1] at 1x with folding (numerical integral of 1 / rate). */
export function foldedDuration(plan, t1, t0 = 0, o = {}) {
  let wall = 0;
  const h = 1 / 240;
  for (let t = t0; t < t1; t += h) wall += Math.min(h, t1 - t) / rateAt(plan, t + h / 2, o);
  return wall;
}

/**
 * Where scenario `tl` stops repeating the first scenario `base`: the first step whose chapter or caption template differs
 * (a caption that only adds a sentence to the other still counts as the same step),
 * backed off one step for context, or to the start of its chapter when that is at most two steps earlier.
 * A figure may name the chapter to start at with `start` (scenarios[i].start). Returns { step, t, diverge, skipped }
 * or null when there is nothing worth skipping (the scenarios differ from the first steps, or the shared part is short).
 */
export function forkOf(base, tl, o = {}) {
  const steps = tl?.steps ?? [], phases = tl?.phases ?? [];
  if (!steps.length) return null;
  if (o.start) {
    const ph = phases.find((p) => p.name === o.start);
    return ph && ph.step > 0 ? { step: ph.step, t: ph.t0, diverge: ph.step, skipped: ph.step } : null;
  }
  const a = base?.steps ?? [];
  const m = Math.min(a.length, steps.length);
  let d = 0;
  // the same step: same chapter and same caption shape, or one caption is the other plus a sentence
  const alike = (x, y) => { const p = captionTemplate(x.caption), q = captionTemplate(y.caption); return p === q || (p.length > 12 && q.length > 12 && (p.startsWith(q) || q.startsWith(p))); };
  while (d < m && (a[d].phase ?? "") === (steps[d].phase ?? "") && alike(a[d], steps[d])) d++;
  if (d >= steps.length) d = steps.length - 1;
  let k = 0;
  for (let j = 0; j < phases.length; j++) if ((phases[j].step ?? 0) <= d) k = j;
  const chapter = phases[k]?.step ?? 0;
  const at = chapter > 0 && d - chapter <= 2 ? chapter : d - 1;
  if (at < 2 || steps[at].t0 < (o.minSkip ?? 8)) return null;
  return { step: at, t: steps[at].t0, diverge: d, skipped: at };
}
