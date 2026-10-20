import { test } from "node:test";
import assert from "node:assert/strict";
import { fill } from "./template.mjs";
import { key } from "./narrate.mjs";

test("a var passed as a key prints a chip; the same chip as a bare string prints its letters, and fill says so", () => {
  assert.deepEqual(fill("{cb} waits", { cb: { key: "timeout" } }), { text: "{key:timeout} waits", missing: [], marked: [] });
  const bare = fill("{cb} waits", { cb: key("timeout") });
  assert.equal(bare.text, "\\{key:timeout\\} waits");
  assert.deepEqual(bare.marked, ["cb"]);
  assert.deepEqual(fill("{cb} waits", { cb: { markup: key("timeout") } }).marked, []);
});

test("a list var is checked item by item, and plain words are never flagged", () => {
  assert.deepEqual(fill("{fns} are queued", { fns: [key("then 1"), key("micro")] }).marked, ["fns"]);
  assert.deepEqual(fill("{fns} are queued", { fns: [{ key: "then 1" }, { key: "micro" }] }).marked, []);
  assert.deepEqual(fill("{who} and {n}", { who: "the {master}", n: 3 }).marked, []);
  assert.deepEqual(fill("{id}", { id: key("m0") }, { raw: true }).marked, []);
});
