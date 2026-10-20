// verify.mjs end to end (in Node) on the tooling fixtures: a clean figure passes; a broken one is reported
// precisely (exports, captions, invariants with step and caption, determinism, undeclared counters, a hang).
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verify, report } from "./verify.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const compiler = join(root, "scripts", "test", "fake-scene.mjs");

test("a clean figure passes every run (scenarios x param extremes)", async () => {
  const r = await verify(join(root, "scripts", "test", "fake-figure.mjs"), { compiler });
  const rep = report(r);
  assert.equal(rep.errors, 0, rep.text);
  assert.equal(r.runs.length, 22);   // 19 + one portrait-phone run per scenario
  assert.ok(r.runs.every((x) => x.steps >= 10));
  // the teaching lint reads the lesson too: its own section, advice only for this figure
  assert.ok(r.teaching && r.teaching.errors.length === 0 && /teaching {2}the lesson a beginner reads/.test(rep.text), rep.text);
});

test("a broken figure gets precise, actionable findings", async () => {
  const r = await verify(join(root, "scripts", "test", "bad-figure.mjs"), { compiler, timeout: 1.5 });
  const { text, errors } = report(r);
  assert.ok(errors > 10);
  for (const needle of [
    'meta.theme must be "dark" or "light", got "dusk"',
    "params.speed.value 3 is above max 2",
    'scenario id "base" is used twice',
    "did you mean params.speed?",
    "Math.random() makes the run nondeterministic",
    "1 step(s) without a caption: 3",
    '"at most 8 items" fails after step 9 "Item 9 goes in.": items = 9',
    '"forgot to return" fails in the opening state: returned undefined',
    'counter(s) "extra" used by s.count/s.gauge but not declared',
    "two compiles differ",
    'counter "idle" is declared but never changes',
    'counters.idle.scenarios must be a list of scenario ids, got nope',
    'counter(s) "items" change in scenario "base", which their `scenarios` leave out, so the page hides them here',
    "hang",
    "still running build() at bad-figure.mjs:21, an endless loop?",   // the hung line, found through the inspector
    "bad-figure.mjs:30: Math.random()",
  ]) assert.ok(text.includes(needle), `missing: ${needle}\n${text}`);
  assert.ok(r.timedOut === "hang");
});
