import { test } from "node:test";
import assert from "node:assert/strict";
import { plain } from "./embed.mjs";
import { sourcesOf } from "../scene/sources.mjs";

const SOURCES = sourcesOf({ sources: [{ id: "dean2004", title: "MapReduce", by: ["Jeffrey Dean", "Sanjay Ghemawat"], year: 2004 }] });

test("the text sent to a learning record store writes citations out and drops caption markup", () => {
  assert.equal(plain("{key:fox} goes to `reduce 0`, as in [dean2004] §3.1.", SOURCES), "fox goes to reduce 0, as in Dean & Ghemawat 2004, §3.1.");
  assert.equal(plain("{ref:m2|mapper 2} reads [dean2004].", SOURCES), "mapper 2 reads Dean & Ghemawat 2004.");
  assert.equal(plain("an unknown [nope] stays", SOURCES), "an unknown [nope] stays");
  assert.equal(plain("no sources at all [dean2004]"), "no sources at all [dean2004]");
});
