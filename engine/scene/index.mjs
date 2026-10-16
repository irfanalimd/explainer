// The scene engine: compile(figure, { params, scenario }) -> Timeline (CONTRACTS.md 4.3).
// DOM-free; runs in Node (verify, tests) and in the browser (runtime, preview).
import { createBuilder, ROOT } from "./builder.mjs";
import { buildTimeline } from "./timeline.mjs";

/** Resolve knob values: definitions' defaults, then the scenario's overrides, then explicit values. */
export function resolveParams(figure, params, scenario) {
  const out = {};
  for (const [k, def] of Object.entries(figure.params ?? {})) out[k] = def?.value;
  const sc = (figure.scenarios ?? []).find((x) => x.id === scenario);
  if (sc?.params) Object.assign(out, sc.params);
  if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) out[k] = v;
  return out;
}

// The viewer's frame, passed to build() as its 4th argument so a figure can choose a layout for it.
// Node (verify, tests) uses the desktop default; the runtime recompiles when the orientation flips.
export const DEFAULT_ENV = Object.freeze({ width: 1440, height: 900, aspect: 1.6, portrait: false, phone: false });
export function envOf(width, height) {
  const aspect = width / Math.max(1, height);
  return Object.freeze({ width, height, aspect, portrait: aspect < 0.95, phone: Math.min(width, height) < 600 });
}

/** Run a figure's build() against a fresh builder and return the recorded Script. */
export function record(figure, { params, scenario, rng, env = DEFAULT_ENV } = {}) {
  const scenarios = figure.scenarios ?? [];
  const id = scenario ?? scenarios[0]?.id ?? null;
  const values = resolveParams(figure, params, id);
  const { s, finish } = createBuilder({ params: values, scenario: id, rng, seed: values.seed });
  let error = null;
  try {
    if (typeof figure.build !== "function") throw new Error("figure has no build(s, params, scenario) export");
    figure.build(s, values, id, env);
  } catch (e) {
    error = e;
  }
  const script = finish();
  if (error) script.problems.unshift({ kind: "build-error", message: String(error?.stack ?? error), step: script.steps.length, id: null });
  return { script, values, scenario: id, error };
}

/**
 * Compile a figure module for one scenario and set of parameter values.
 * @param {object} figure  module namespace: { meta, params, scenarios, counters, code, invariants, build }
 * @param {{params?: object, scenario?: string, rng?: (seed) => object}} [opts]
 */
export function compile(figure, opts = {}) {
  const { script, values, scenario, error } = record(figure, opts);
  const tl = buildTimeline(script, { figure, values, scenario });
  tl.error = error;
  tl.script = script;
  return tl;
}

/**
 * Run the figure's invariants on every snapshot: [{ name, step, message }] for each failure.
 * An invariant is (snap, { step, final, params, scenario, timeline }) => true | "message" (as verify calls it).
 */
export function checkInvariants(figure, tl) {
  const fails = [];
  for (const [name, fn] of Object.entries(figure.invariants ?? {})) {
    for (let i = 0; i <= tl.steps.length; i++) {
      let r;
      try { r = fn(tl.snapshot(i), { step: i, final: i === tl.steps.length, params: tl.values, scenario: tl.scenario, timeline: tl }); } catch (e) { r = String(e?.message ?? e); }
      if (r !== true && r !== undefined) { fails.push({ name, step: i, message: r === false ? "failed" : String(r) }); break; }
    }
  }
  return fails;
}

export { createBuilder, ROOT, buildTimeline };
export * as narrate from "./narrate.mjs";
