// Pure helpers of the page scripts: shot times, finding groups, caption plain text, argument parsing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { shotTimes, groupFindings, findingLine, plainCaption } from "./figure-page.mjs";
import { parseArgs, parseSize } from "./args.mjs";

const info = {
  duration: 4.5,
  steps: [0, 1, 2, 3, 4].map((i) => ({ index: i, t0: i * 0.9, t1: (i + 1) * 0.9, dur: 0.9, caption: `s${i}`, phase: i < 2 ? "A" : "B" })),
  phases: [{ name: "A", step: 0, t0: 0, t1: 1.8 }, { name: "B", step: 2, t0: 1.8, t1: 4.5 }],
};

test("shot times: phases, all, explicit steps, times and end", () => {
  const ph = shotTimes(info, "phases");
  assert.deepEqual(ph.map((s) => [s.tag, s.step, s.phase]), [["mid", 1, "A"], ["end", 1, "A"], ["mid", 3, "B"], ["end", 4, "B"]]);
  assert.ok(Math.abs(ph[1].t - 1.799) < 1e-9, "end-of-phase stays inside the phase");
  assert.equal(shotTimes(info, "all").length, 10);
  const list = shotTimes(info, "2,3.1s,end");
  assert.deepEqual(list.map((s) => [s.step, s.tag]), [[2, "mid"], [2, "end"], [3, "t3.10s"], [4, "end"]]);
  assert.throws(() => shotTimes(info, "9"), /step 9 does not exist \(the timeline has 5 steps, 0-4\)/);
  assert.throws(() => shotTimes(info, "soon"), /bad --at item "soon"/);
});

test("findings repeating over steps and shots collapse into one line", () => {
  const items = [3, 4, 5, 4].map((step, i) => ({ kind: "label-overflow", message: '"split 0" is 35.7 u wide', step, where: i % 2 ? "phone" : "desktop", caption: "The {key:fox|input} is cut" }));
  const g = groupFindings(items);
  assert.equal(g.length, 1);
  assert.equal(findingLine(g[0]), '  label-overflow at steps 3, 4, 5: "split 0" is 35.7 u wide (first: "The input is cut")  [desktop, phone]');
});

test("caption markup becomes plain text", () => {
  assert.equal(plainCaption("{ref:m2|mapper 2} emits {key:fox} **now**, {tone:fail|crashed}"), "mapper 2 emits fox now, crashed");
});

test("argument parsing: values, =, lists, booleans, sizes", () => {
  const a = parseArgs(["page.html", "--sizes", "1440x900,390x844", "--sizes=phone", "--dpr=2", "--no-sheet", "--clean"], { flags: { sizes: "list", dpr: "number", sheet: "boolean", clean: "boolean" } });
  assert.deepEqual(a, { _: ["page.html"], sizes: ["1440x900", "390x844", "phone"], dpr: 2, sheet: false, clean: true });
  assert.deepEqual(parseSize("vertical"), { width: 1080, height: 1920 });
  assert.throws(() => parseSize("big"), /bad size "big"/);
});
