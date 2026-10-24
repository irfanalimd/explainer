import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { floorFS, slabFS } from "./shaders.mjs";

// The main pass draws the opaque slabs first and the floor after them (LEQUAL), so a covered pixel skips the floor's
// shading. That gives the same samples as the floor first (and slabs LESS) on any conforming GL, not just on the
// software renderer the shots are compared on, only while these hold: each sample then keeps the fragment that wins
// "slab < floor" in either order, its colour comes from a shader that does not read the framebuffer, and the depth
// left behind is the smaller of the two.
test("the floor after the slabs gives the same samples: opaque, no discard, no written depth, no blending", () => {
  assert.doesNotMatch(floorFS, /\bdiscard\b/, "a discarded floor fragment would let a tied slab through");
  assert.doesNotMatch(floorFS, /gl_FragDepth/, "a written depth breaks the order argument");
  assert.doesNotMatch(slabFS, /gl_FragDepth/, "a written depth breaks the order argument");
  const src = readFileSync(new URL("./renderer.mjs", import.meta.url), "utf8");
  const a = src.indexOf("opaque slabs first, then the floor"), b = src.indexOf("raised ink and transparent slabs");
  assert.ok(a > 0 && b > a, "the opaque slabs, then the floor, then the raised ink and transparent slabs");
  const opaqueAndFloor = src.slice(a, b);
  assert.doesNotMatch(opaqueAndFloor, /gl\.enable\(gl\.BLEND\)/, "both are drawn without blending");
  assert.doesNotMatch(opaqueAndFloor, /depthMask\(false\)/, "both write depth");
  assert.match(opaqueAndFloor, /depthFunc\(gl\.LEQUAL\)[\s\S]*drawArrays[\s\S]*depthFunc\(gl\.LESS\)/, "the floor passes ties, then LESS again");
});
