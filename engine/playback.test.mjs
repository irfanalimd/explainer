import { test } from "node:test";
import assert from "node:assert/strict";
import { captionTemplate, captionHead, foldPlan, rateAt, foldedDuration, forkOf, FOLD } from "./playback.mjs";
import { compile, envOf } from "./scene/index.mjs";
import { rng } from "../sim/rng.mjs";

// steps laid end to end, 5 s each
const mk = (rows) => rows.map((r, i) => ({ index: i, t0: i * 5, t1: i * 5 + 5, dur: 5, ...(typeof r === "string" ? { caption: r, phase: "A" } : r) }));
const shuffle = (w, r, h) => `{key:${w}} goes to {ref:r${r}|reduce ${r}} because \`hash(${w}) % 2 = ${h}\` (${w.length + 4} bytes)`;

test("captionTemplate: chips, code, numbers and comparisons become placeholders", () => {
  assert.equal(captionTemplate(shuffle("fox", 0, 0)), captionTemplate(shuffle("quick", 1, 1)));
  assert.equal(captionTemplate(shuffle("fox", 0, 0)), "{key} goes to {ref} because `#` (# bytes)");
  assert.equal(captionTemplate("Compare {ref:a4} = 15 with pivot {ref:a8} = 87 — 15 < 87, so i → 4."),
    captionTemplate("Compare {ref:a2} = 3 with pivot {ref:a8} = 3 — 3 = 3, so i → 2."));
  assert.notEqual(captionTemplate("{ref:s2} acks"), captionTemplate("{ref:s2} {tone:ok|commits}"));
  assert.equal(captionTemplate("entry 0x7f3a_2c10 is **valid**"), captionTemplate("entry 0x0001_beef is valid"));
});

test("captionHead: the leading clause, never cut inside a chip or code", () => {
  assert.equal(captionHead(shuffle("fox", 0, 0)), "{key:fox} goes to {ref:r0|reduce 0}");
  assert.equal(captionHead("{key:fox|a: b} goes to {ref:r1} — far"), "{key:fox|a: b} goes to {ref:r1}");
  assert.equal(captionHead("Run `a; b` then stop: done"), "Run `a; b` then stop");
  // too short a head keeps the sentence
  assert.equal(captionHead("Done: 8 words"), "Done: 8 words");
  assert.equal(captionHead("No separators here at all"), "No separators here at all");
});

test("foldPlan: a run folds after its pattern has played twice", () => {
  const words = ["the", "quick", "brown", "fox", "jumps"];
  const steps = mk(["Intro step for the job", ...words.map((w, i) => shuffle(w, i % 2, i % 2)), "Reduce sorts its records"]);
  const plan = foldPlan(steps);
  assert.equal(plan.steps[0], null);
  assert.deepEqual(plan.steps.slice(1, 6).map((x) => [x.index, x.count, x.folded]),
    [[1, 5, false], [2, 5, false], [3, 5, true], [4, 5, true], [5, 5, true]]);
  assert.equal(plan.steps[6], null);
  assert.deepEqual(plan.regions, [{ t0: 15, t1: 30, first: 3, last: 5 }]);
});

test("foldPlan: two in a row is not a pattern yet; chapters, asks and keep break runs", () => {
  assert.ok(foldPlan(mk([shuffle("a", 0, 0), shuffle("b", 0, 0)])).steps.every((x) => !x?.folded));
  const chap = mk([shuffle("a", 0, 0), shuffle("b", 0, 0), { caption: shuffle("c", 0, 0), phase: "B" }, { caption: shuffle("d", 0, 0), phase: "B" }]);
  assert.equal(foldPlan(chap).regions.length, 0);
  const asked = mk([shuffle("a", 0, 0), shuffle("b", 0, 0), { caption: shuffle("c", 0, 0), phase: "A", ask: { q: "?" } }, shuffle("d", 0, 0)]);
  assert.equal(foldPlan(asked).regions.length, 0);
  const kept = mk([shuffle("a", 0, 0), shuffle("b", 0, 0), { caption: shuffle("c", 0, 0), phase: "A", keep: true }]);
  assert.equal(foldPlan(kept).regions.length, 0);
});

test("foldPlan: a short cycle (heartbeat, ack) folds after two full cycles", () => {
  const hb = (i) => `{ref:s1} sends heartbeat ${i} to {ref:s2}`, ack = (i) => `{ref:s2} acks: its log matches up to index ${i}`;
  const plan = foldPlan(mk([hb(1), ack(1), hb(2), ack(2), hb(3), ack(3), "The network heals"]));
  assert.deepEqual(plan.steps.map((x) => x?.folded ?? null), [false, false, false, false, true, true, null]);
  assert.equal(plan.steps[4].period, 2);
  assert.equal(plan.steps[5].index, 6);
});

test("rateAt: 1 outside, eases up to the fold rate and back to 1 at the region's end", () => {
  const plan = { regions: [{ t0: 10, t1: 40, first: 2, last: 7 }] };
  assert.equal(rateAt(plan, 5), 1);
  assert.equal(rateAt(plan, 10), 1);
  assert.equal(rateAt(plan, 25), FOLD.rate);
  assert.ok(rateAt(plan, 10.5) > 1 && rateAt(plan, 10.5) < FOLD.rate);
  assert.ok(rateAt(plan, 39.9) < 1.1);
  assert.equal(rateAt(plan, 40), 1);
  // smooth: no jump between neighbouring samples
  for (let t = 9; t < 41; t += 0.01) assert.ok(Math.abs(rateAt(plan, t + 0.01) - rateAt(plan, t)) < 0.05);
  // wall time shrinks, but never below duration / rate
  const wall = foldedDuration(plan, 50);
  assert.ok(wall < 50 && wall > 20 + 30 / FOLD.rate, String(wall));
  assert.equal(foldedDuration({ regions: [] }, 50).toFixed(6), "50.000000");
});

test("forkOf: start at the first different step, backed off for context", () => {
  const base = { steps: mk(["Boot five servers", "s1 times out", "s1 wins term 1", "client sends x", "s2 appends x", "x commits"]), phases: [{ name: "A", step: 0, t0: 0 }] };
  const other = { steps: mk(["Boot five servers", "s1 times out", "s1 wins term 1", "client sends x", "s1 crashes", "s3 times out"]), phases: [{ name: "A", step: 0, t0: 0 }] };
  assert.deepEqual(forkOf(base, other), { step: 3, t: 15, diverge: 4, skipped: 3 });
  // the start of the chapter when it is close
  other.phases.push({ name: "Crash", step: 3, t0: 15 });
  other.steps[3].phase = other.steps[4].phase = other.steps[5].phase = "Crash";
  assert.equal(forkOf(base, other).diverge, 3);
  assert.equal(forkOf(base, other).step, 3);
  // nothing shared, or too little: no skip
  assert.equal(forkOf(base, { steps: mk(["Other start", "b", "c"]), phases: [] }), null);
  // a figure can name the chapter
  assert.deepEqual(forkOf(base, other, { start: "Crash" }), { step: 3, t: 15, diverge: 3, skipped: 3 });
  assert.equal(forkOf(base, other, { start: "Nope" }), null);
});

test("forkOf on the real figures: Raft crash starts at the crash, MapReduce crash at Map", async () => {
  const run = async (name, ids) => {
    const fig = await import(`../examples/${name}/figure.mjs`);
    const defaults = Object.fromEntries(Object.entries(fig.params ?? {}).map(([k, d]) => [k, d.value]));
    return ids.map((id) => {
      const sc = fig.scenarios.find((s) => s.id === id);
      return compile(fig, { params: { ...defaults, ...(sc.params ?? {}) }, scenario: id, rng, env: envOf(1440, 900) });
    });
  };
  const [rh, rc] = await run("raft", ["happy", "crash"]);
  const f = forkOf(rh, rc);
  assert.ok(f && /crash/.test(rc.steps[f.step].caption), rc.steps[f?.step]?.caption);
  const [mh, mc] = await run("mapreduce", ["happy", "crash"]);
  const g = forkOf(mh, mc);
  assert.ok(g && mc.steps[g.step].phase === "Map", JSON.stringify(g));
  // folding speeds through the shuffle's repeats. A beginner lesson plays every pattern's first two occurrences, its
  // `keep` steps, its question and the step after it at full length, and most of its chapters (Split, Reduce, Output)
  // never repeat, so the gain is measured on the chapter that does: the shuffle plays in well under 90 % of its
  // length (the whole run still gets shorter)
  const plan = foldPlan(mh.steps);
  const k = mh.phases.findIndex((p) => p.name === "Shuffle");
  const t0 = mh.phases[k].t0, t1 = mh.phases[k + 1]?.t0 ?? mh.duration;
  assert.ok(plan.regions.some((r) => mh.steps[r.first].phase === "Shuffle"), "the shuffle has a folded run");
  assert.ok(foldedDuration(plan, t1, t0) < 0.85 * (t1 - t0), `the shuffle folds to ${(foldedDuration(plan, t1, t0) / (t1 - t0)).toFixed(3)} of its length`);
  assert.ok(foldedDuration(plan, mh.duration) < 0.95 * mh.duration);
});
