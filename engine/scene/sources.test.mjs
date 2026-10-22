// node --test engine/scene/sources.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { citesIn, shortOf, fullOf, sourcesOf, resolveCites, authorsOf } from "./sources.mjs";
import { fill } from "./template.mjs";

const DEAN = { id: "dean2004", title: "MapReduce: Simplified Data Processing on Large Clusters", by: ["Jeffrey Dean", "Sanjay Ghemawat"], year: 2004, where: "OSDI", url: "https://www.usenix.org/legacy/event/osdi04/tech/full_papers/dean/dean.pdf" };

test("a citation is [id] where a word may start, with its locator when one follows", () => {
  assert.deepEqual(citesIn("as in [dean2004] §3.6, and [clrs2009] p. 171").map(({ id, at }) => ({ id, at })),
    [{ id: "dean2004", at: "§3.6" }, { id: "clrs2009", at: "p. 171" }]);
  assert.deepEqual(citesIn("[ongaro2014]").map((c) => c.at), [""]);
  assert.deepEqual(citesIn("(see [html-spec] §8.1.7.3)").map((c) => [c.id, c.at]), [["html-spec", "§8.1.7.3"]]);
  assert.equal(citesIn("a[i] and arr[sep]").length, 0, "inside a word it is an index, not a citation");
  assert.equal(citesIn("\\[dean2004]").length, 0, "an escaped bracket is literal");
  assert.equal(citesIn("[1, 2, 3] and [Dean]").length, 0, "only lowercase slugs are ids");
  const [c] = citesIn("x [dean2004] §3.6 y");
  assert.equal("x [dean2004] §3.6 y".slice(c.index, c.index + c.length), "[dean2004] §3.6");
});

test("the short form names one or two authors, else the first et al., then the year; `short` overrides", () => {
  assert.equal(shortOf(DEAN), "Dean & Ghemawat 2004");
  assert.equal(shortOf({ by: "Diego Ongaro", year: 2014 }), "Ongaro 2014");
  assert.equal(shortOf({ by: "D. Karger, E. Lehman, T. Leighton", year: 1997 }), "Karger et al. 1997");
  assert.equal(shortOf({ by: "G. DeCandia et al.", year: 2007 }), "DeCandia et al. 2007");
  assert.equal(shortOf({ by: "J. Lamping and E. Veach", year: 2014 }), "Lamping & Veach 2014");
  assert.equal(shortOf({ by: "WHATWG", short: "HTML Standard", year: "n.d." }), "HTML Standard");
  assert.deepEqual(authorsOf("A. B; C. D & E. F"), ["A. B", "C. D", "E. F"]);
});

test("the full reference reads authors, title, venue and year", () => {
  assert.equal(fullOf(DEAN), "Jeffrey Dean, Sanjay Ghemawat. MapReduce: Simplified Data Processing on Large Clusters. OSDI, 2004.");
  const [s] = sourcesOf({ sources: [DEAN, null, { title: "no id" }] });
  assert.equal(s.short, "Dean & Ghemawat 2004");
  assert.deepEqual(s.supports, []);
  assert.equal(sourcesOf({}).length, 0);
});

test("resolveCites writes known citations out for text drawn in the world, and leaves unknown ones", () => {
  const src = sourcesOf({ sources: [DEAN] });
  assert.equal(resolveCites("2,000 machines, [dean2004] §5", src), "2,000 machines, Dean & Ghemawat 2004, §5");
  assert.equal(resolveCites("see [nobody1999]", src), "see [nobody1999]");
});

test("a run's string var never reads as a citation", () => {
  assert.equal(fill("the list {xs}", { xs: "[dean2004]" }).text, "the list \\[dean2004]");
  assert.equal(citesIn(fill("the list {xs}", { xs: "[dean2004]" }).text).length, 0);
});
