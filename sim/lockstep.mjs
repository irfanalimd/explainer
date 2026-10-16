// Run several generator-based variants of an algorithm in lockstep: each round advances every unfinished variant
// to its next `yield`, and the round becomes one shared builder step, so two algorithms can race side by side on
// the same input.
//
//   race(s, {
//     insertion: function* (v) { const a = tracked.array(v, v.id("a"), input, { auto: "none" }); …; yield a.caption(); },
//     merge:     function* (v) { … },
//   }, { labels: { insertion: "Insertion sort", merge: "Merge sort" } });
//
// Each variant receives a scoped builder `v`: everything passes through to `s`, except
//   v.count(name, d) / v.gauge(name, x)  are prefixed: "insertion.comparisons" (declare those in the figure's counters)
//   v.say(markup)                        joins this variant's part of the round caption
//   v.step / v.hold                      throw: a variant yields instead
//   v.id(x)                              "insertion.x", for entity ids that must not collide across variants
//   v.variant, v.label, v.rng            the variant id, its label and its own RNG stream (s.rng.fork("race:<id>"))
// A yielded string is this variant's caption for the round (with v.say text appended); yielding nothing uses the
// v.say text alone, or "<label> works" if there is none.

import * as fmt from "./fmt.mjs";

/**
 * @param {Object} s
 * @param {Object<string, function(Object): Iterator>} variants  generator functions, in display order
 * @param {Object} [opts]  labels, sep (counter/id separator, default "."), join (caption separator, default " · "),
 *                         dur, phase (a chapter name for the race), maxRounds (default 10000),
 *                         finish (id, label, value, round) => markup for the round a variant completes
 * @returns {{ rounds: number, results: Object, finishedAt: Object }}
 */
export function race(s, variants, opts = {}) {
  const sep = opts.sep ?? ".";
  const join = opts.join ?? " · ";
  const maxRounds = opts.maxRounds ?? 10000;
  const ids = Object.keys(variants);
  if (!ids.length) throw new Error("race: no variants");
  let active = null;

  const runs = ids.map((id) => {
    const label = opts.labels?.[id] ?? id;
    const run = { id, label, says: [], done: false, value: undefined, finishedAt: null, it: null };
    const vrng = typeof s.rng?.fork === "function" ? s.rng.fork(`race:${id}`) : s.rng;
    // an empty target: the builder's own non-configurable properties (s.rng) must not pin the proxy's answers
    const target = s;
    const scoped = new Proxy({}, {
      has: (_, prop) => prop in target,
      get(_, prop) {
        switch (prop) {
          case "count": return (name, d = 1) => target.count(id + sep + name, d);
          case "gauge": return (name, x) => target.gauge(id + sep + name, x);
          case "say": return (markup) => { (active ?? run).says.push(markup); };
          case "step": case "hold": return () => { throw new Error(`race: variant "${id}" called s.${String(prop)}(); yield instead (and use auto: "none" for tracked structures)`); };
          case "id": return (x) => id + sep + x;
          case "variant": return id;
          case "label": return label;
          case "rng": return vrng;
          default: {
            const v = Reflect.get(target, prop, target);
            return typeof v === "function" ? v.bind(target) : v;
          }
        }
      },
    });
    const gen = variants[id](scoped);
    if (!gen || typeof gen.next !== "function") throw new TypeError(`race: variant "${id}" must be a generator function`);
    run.it = gen;
    return run;
  });

  if (opts.phase) s.phase(opts.phase);
  let round = 0;
  while (runs.some((r) => !r.done)) {
    if (round >= maxRounds) throw new Error(`race: still running after ${maxRounds} rounds`);
    const parts = [];
    for (const r of runs) {
      if (r.done) continue;
      r.says = [];
      active = r;
      let res;
      try { res = r.it.next(); } finally { active = null; }
      const said = r.says.join(" ");
      let text;
      if (res.done) {
        r.done = true; r.value = res.value; r.finishedAt = round;
        text = opts.finish ? opts.finish(r.id, r.label, res.value, round) : [said, `${fmt.escape(r.label)} {tone:ok|finishes}`].filter(Boolean).join("; ");
      } else {
        text = [typeof res.value === "string" ? res.value : "", said].filter(Boolean).join(" ") || `${fmt.escape(r.label)} works`;
      }
      parts.push(ids.length > 1 ? `${fmt.bold(fmt.escape(r.label))}: ${text}` : text);
    }
    const o = {};
    if (opts.dur !== undefined) o.dur = opts.dur;
    s.step(parts.join(join), o);
    round++;
  }
  return {
    rounds: round,
    results: Object.fromEntries(runs.map((r) => [r.id, r.value])),
    finishedAt: Object.fromEntries(runs.map((r) => [r.id, r.finishedAt])),
  };
}

export default race;
