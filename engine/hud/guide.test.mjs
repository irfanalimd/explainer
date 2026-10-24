// node --test engine/hud/guide.test.mjs   (the next thing to do: which control the ring is on, and how it calls)
import { test } from "node:test";
import assert from "node:assert/strict";
import { cueOf, createGuide, CALLS, RECALL_MS } from "./guide.mjs";

const base = { on: true, step: 0, phase: 0 };
const id = (s) => cueOf({ ...base, ...s })?.id ?? null;

test("one cue for each moment the reader must act", () => {
  assert.equal(id({ atStart: true }), "play");
  assert.equal(id({ held: { kind: "chapter" } }), "continue");
  assert.equal(id({ held: { kind: "key" } }), "continue");
  assert.equal(id({ held: { kind: "turn" } }), "rewind");
  assert.equal(id({ held: { kind: "end" }, after: true }), "next-story");
  assert.equal(id({ asking: true }), "answer");
  assert.equal(id({ held: { kind: "end" }, checking: true, after: true }), "check");
  assert.equal(id({ stepMode: true }), "next");
});

test("no cue while the run plays, after the last story, or when the reader paused on their own", () => {
  assert.equal(id({ playing: true }), null);
  assert.equal(id({ playing: true, stepMode: true }), null);
  assert.equal(id({ held: { kind: "end" }, after: false }), null);
  assert.equal(id({}), null);   // paused mid-run: the reader chose to stop
});

test("nothing else on screen competes: off, capture, presenting, the start card, an overlay, a scrub", () => {
  const moment = { atStart: true, held: { kind: "chapter" }, asking: true };
  for (const k of ["capture", "presenting", "intro", "overlay", "scrubbing"]) assert.equal(id({ ...moment, [k]: true }), null, k);
  assert.equal(cueOf({ ...moment, on: false }), null);
});

test("the end check's question wins over the pill after it, and a question over step mode", () => {
  assert.equal(id({ held: { kind: "end" }, after: true, checking: true }), "check");
  assert.equal(id({ asking: true, stepMode: true }), "answer");
});

test("the key changes when the same control is the way on again", () => {
  const a = cueOf({ ...base, held: { kind: "chapter" }, phase: 0, step: 4 }), b = cueOf({ ...base, held: { kind: "chapter" }, phase: 1, step: 9 });
  assert.notEqual(a.key, b.key);
  assert.notEqual(cueOf({ ...base, stepMode: true, step: 1 }).key, cueOf({ ...base, stepMode: true, step: 2 }).key);
  assert.equal(cueOf({ ...base, atStart: true }).key, cueOf({ ...base, atStart: true, step: 3 }).key);
});

// a fake element and window: classes and timers, no DOM
const el = () => {
  const c = new Set();
  return { isConnected: true, offsetWidth: 1, classList: { add: (...k) => k.forEach((x) => c.add(x)), remove: (...k) => k.forEach((x) => c.delete(x)), has: (k) => c.has(k) }, c };
};
const clock = () => {
  const T = new Map(); let n = 0;
  return { setTimeout: (fn, ms) => (T.set(++n, { fn, ms }), n), clearTimeout: (i) => T.delete(i), run: () => { const t = [...T.values()]; T.clear(); t.forEach((x) => x.fn()); }, T };
};

test("the ring goes on the cue's control, calls on the first few cues of a kind, then only rests", () => {
  const play = el(), next = el(), win = clock();
  const g = createGuide({ win, reduced: () => false, target: (k) => (k === "next" ? next : play) });
  g.set(cueOf({ ...base, atStart: true }));
  assert.ok(play.c.has("ix-cue") && play.c.has("ix-cue-call"));
  g.set(cueOf({ ...base, playing: true }));
  assert.equal(play.c.size, 0, "acting clears it");
  for (let i = 1; i <= CALLS + 1; i++) {
    g.set(cueOf({ ...base, stepMode: true, step: i }));
    assert.ok(next.c.has("ix-cue"));
    assert.equal(next.c.has("ix-cue-call"), i <= CALLS, `step ${i}`);
  }
  assert.ok(!play.c.has("ix-cue"), "one control at a time");
});

test("a cue still waiting calls once more; reduced motion only rests", () => {
  const play = el(), win = clock();
  const g = createGuide({ win, reduced: () => false, target: () => play });
  g.set(cueOf({ ...base, stepMode: true, step: 1 }));
  assert.equal([...win.T.values()][0].ms, RECALL_MS);
  play.classList.remove("ix-cue-call");
  win.run();
  assert.ok(play.c.has("ix-cue-call"));
  const calm = el(), g2 = createGuide({ win: clock(), reduced: () => true, target: () => calm });
  g2.set(cueOf({ ...base, atStart: true }));
  assert.ok(calm.c.has("ix-cue") && !calm.c.has("ix-cue-call"));
});

test("the same cue set again is left alone; a rebuilt control takes the ring without calling again", () => {
  let opts = el();
  const win = clock(), g = createGuide({ win, reduced: () => false, target: () => opts });
  const ask = cueOf({ ...base, asking: true, step: "18:How many?" });
  g.set(ask);
  opts.classList.remove("ix-cue-call");
  g.set(ask);
  assert.ok(opts.c.has("ix-cue") && !opts.c.has("ix-cue-call"));
  const old = opts; opts = el();
  g.set(ask);
  assert.ok(!old.c.has("ix-cue") && opts.c.has("ix-cue") && !opts.c.has("ix-cue-call"));
});
