import { test } from "node:test";
import assert from "node:assert/strict";
import { scorecard } from "./report.mjs";
import { verdictOf } from "../check.mjs";

const run = (problems) => ({
  verify: { runs: 2, branches: 0, errors: 0, warnings: 0, failing: 0 },
  shoot: { shots: [{ tag: "mid" }], themes: ["light"], problems, errors: [] },
  audit: { problems: [], errors: [], runs: [{ frames: 4 }] },
});
const looks = (r) => scorecard(r).find((c) => c.key === "looks");

test("the Looks right card gives advice for warn-level findings and fails only on real ones", () => {
  assert.equal(looks(run([])).status, "ok");
  const advice = run([{ kind: "frame-time", level: "warn", message: "average frame 80 ms > 16 ms budget" }]);
  assert.equal(looks(advice).status, "warn");
  assert.equal(looks(advice).value, "0 findings");
  assert.match(looks(advice).detail.at(-1), /1 piece of advice/);
  assert.deepEqual([verdictOf(advice).ok, verdictOf(advice).label], [true, "Passes the quick check"]);
  assert.equal(looks(run([{ kind: "focus-outside", step: 4, message: "part of the step's focus is outside the frame" }])).status, "fail");
});
