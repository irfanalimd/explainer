import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { frameSweep, VIEWPORTS, UNDER_HUD } from "./framing.mjs";
import { loadFigure } from "./lesson-load.mjs";
import { compile, envOf } from "../../engine/scene/index.mjs";
import { compile as fakeCompile } from "../test/fake-scene.mjs";
import * as fake from "../test/fake-figure.mjs";
import { rng } from "../../sim/rng.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = async (ex, scenario, vp) => compile(await loadFigure(join(root, "examples", ex, "figure.mjs")), { scenario, rng, env: envOf(vp.width, vp.height) });

test("the shot plan keeps every step's focus in frame, at both sizes", async () => {
  for (const vp of [VIEWPORTS.desktop, VIEWPORTS.phone]) {
    const r = frameSweep(await run("mapreduce", "happy", vp), vp);
    assert.ok(r.sampled > 20);
    assert.deepEqual(r.steps.filter((x) => x.outside), [], `${vp.width}x${vp.height}`);
  }
});

test("a move that passes over the HUD's edge is measured, and is shorter than what counts", async () => {
  const r = frameSweep(await run("mapreduce", "crash", VIEWPORTS.phone), VIEWPORTS.phone);
  const s = r.steps.find((x) => x.index === 24);
  assert.ok(s && s.outside === 0 && s.under > 0 && s.under < UNDER_HUD, JSON.stringify(r.steps));
});

test("a step whose shot loses its focus is found (the fake figure's planted far tag)", () => {
  const tl = fakeCompile(fake, { scenario: "glitch" });
  const r = frameSweep(tl, VIEWPORTS.desktop);
  assert.ok(r.steps.some((x) => x.index === 9 && x.outside > 0), JSON.stringify(r.steps));
  assert.deepEqual(frameSweep(fakeCompile(fake, { scenario: "ring" }), VIEWPORTS.desktop).steps.filter((x) => x.outside), []);
});
