import { test } from "node:test";
import assert from "node:assert/strict";
import { MapKey } from "./mapkey.mjs";

test("a map key keeps the inputs it saw and says whether the next frame's are the same", () => {
  const k = new MapKey(), slabs = new Float32Array([1, 2, 3, 4, 5, 6]);
  assert.equal(k.begin().push(2048, -10, 10).range(slabs, 0, 6).same(), false);   // nothing kept yet
  assert.equal(k.begin().push(2048, -10, 10).range(slabs, 0, 6).same(), true);
  slabs[5] = 6.5;
  assert.equal(k.begin().push(2048, -10, 10).range(slabs, 0, 6).same(), false);   // one slab moved
  assert.equal(k.begin().push(2048, -10, 10).range(slabs, 0, 6).same(), true);
  assert.equal(k.begin().push(2048, -10, 10).range(slabs, 0, 5).same(), false);   // one input fewer
});

test("bounds that differ below float precision are different keys", () => {
  const k = new MapKey();
  k.begin().push(0.1 + 0.2).same();
  assert.equal(k.begin().push(0.3).same(), false);
});

test("a key longer than its buffer grows and still compares", () => {
  const k = new MapKey(), big = Float32Array.from({ length: 5000 }, (_, i) => i);
  assert.equal(k.begin().range(big, 0, 5000).same(), false);
  assert.equal(k.begin().range(big, 0, 5000).same(), true);
  big[4999] = -1;
  assert.equal(k.begin().range(big, 0, 5000).same(), false);
});
