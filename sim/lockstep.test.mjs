import { test } from "node:test";
import assert from "node:assert/strict";
import { stubScene } from "./stub.mjs";
import { race } from "./lockstep.mjs";
import { tracked } from "./tracked.mjs";
import * as fmt from "./fmt.mjs";

const plain = (c) => fmt.ascii(fmt.plain(c));

test("variants advance in lockstep, one shared step per round", () => {
  const s = stubScene();
  const log = [];
  const res = race(s, {
    short: function* (v) { log.push("s1"); yield "one"; log.push("s2"); return 2; },
    long: function* (v) { for (let i = 1; i <= 3; i++) { log.push(`l${i}`); v.say(`said ${i}`); yield `step ${i}`; } return "done"; },
  }, { labels: { short: "Short", long: "Long" } });
  assert.deepEqual(log, ["s1", "l1", "s2", "l2", "l3"]);
  assert.equal(res.rounds, 4);
  assert.deepEqual(res.results, { short: 2, long: "done" });
  assert.deepEqual(res.finishedAt, { short: 1, long: 3 });
  assert.deepEqual(s.$.captions().map(plain), [
    "Short: one · Long: step 1 said 1",
    "Short: Short finishes · Long: step 2 said 2",
    "Long: step 3 said 3",
    "Long: Long finishes",
  ]);
  assert.deepEqual(s.$.finish(), []);
});

test("the scoped builder prefixes counters and ids and forbids stepping", () => {
  const s = stubScene({ seed: 2 }, { counters: { "a.comparisons": {}, "b.comparisons": {} } });
  race(s, {
    a: function* (v) { v.count("comparisons", 2); assert.equal(v.id("x"), "a.x"); assert.equal(v.variant, "a"); v.housing(v.id("box"), {}); yield; },
    b: function* (v) { v.count("comparisons"); assert.throws(() => v.step("no"), /yield instead/); assert.notEqual(v.rng, s.rng); yield; },
  });
  assert.deepEqual(s.$.counters, { "a.comparisons": 2, "b.comparisons": 1 });
  assert.ok(s.has("a.box"));
  assert.equal(plain(s.$.captions()[0]), "a: a works · b: b works");
  assert.deepEqual(s.$.finish(), []);
  assert.throws(() => race(stubScene(), { x: () => 3 }), /generator/);
  assert.throws(() => race(stubScene(), { x: function* () { for (;;) yield; } }, { maxRounds: 5 }), /5 rounds/);
});

test("bubble sort vs insertion sort on the same input, with honest per-variant counters", () => {
  const input = [7, 3, 9, 1, 6, 2, 8];
  const naive = { bubble: 0, insertion: 0 };
  { const a = input.slice(); for (let n = a.length; n > 1; n--) for (let i = 0; i + 1 < n; i++) { naive.bubble++; if (a[i] > a[i + 1]) [a[i], a[i + 1]] = [a[i + 1], a[i]]; } }
  { const a = input.slice(); for (let i = 1; i < a.length; i++) for (let j = i; j > 0; j--) { naive.insertion++; if (a[j - 1] > a[j]) [a[j - 1], a[j]] = [a[j], a[j - 1]]; else break; } }
  const s = stubScene();
  s.row("lanes", {});
  const out = {};
  const res = race(s, {
    bubble: function* (v) {
      const a = tracked.array(v, v.id("a"), input, { in: "lanes", name: "a", auto: "none", counters: { reads: false, writes: false } });
      for (let n = a.length; n > 1; n--) for (let i = 0; i + 1 < n; i++) { if (a.cmp(i, i + 1) > 0) a.swap(i, i + 1); yield a.caption(); }
      out.bubble = a.values();
      return a.stats.comparisons;
    },
    insertion: function* (v) {
      const a = tracked.array(v, v.id("a"), input, { in: "lanes", name: "a", auto: "none", counters: { reads: false, writes: false } });
      for (let i = 1; i < a.length; i++) for (let j = i; j > 0; j--) { const swap = a.cmp(j - 1, j) > 0; if (swap) a.swap(j - 1, j); yield a.caption(); if (!swap) break; }
      out.insertion = a.values();
      return a.stats.comparisons;
    },
  }, { labels: { bubble: "Bubble sort", insertion: "Insertion sort" } });
  assert.deepEqual(out.bubble, [1, 2, 3, 6, 7, 8, 9]);
  assert.deepEqual(out.insertion, [1, 2, 3, 6, 7, 8, 9]);
  assert.deepEqual(res.results, naive);
  assert.equal(s.$.counters["bubble.comparisons"], naive.bubble);
  assert.equal(s.$.counters["insertion.comparisons"], naive.insertion);
  assert.equal(res.rounds, Math.max(naive.bubble, naive.insertion) + 1);
  assert.match(plain(s.$.captions()[0]), /^Bubble sort: Compare a\[0\] = 7 with a\[1\] = 3 — 7 > 3, so swap\. · Insertion sort: Compare a\[0\] = 7 with a\[1\] = 3 — 7 > 3, so swap\.$/);
  assert.deepEqual(s.$.finish(), []);
});
