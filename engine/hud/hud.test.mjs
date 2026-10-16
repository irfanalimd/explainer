// node --test engine/hud/hud.test.mjs   (the pure parts of the HUD: formats, deep links, highlighter, theme)
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCounter, formatText } from "./format.mjs";
import { parseHash, formatHash, paramOverrides } from "./link.mjs";
import { highlight } from "./highlight.mjs";
import { cssVars } from "./theme.mjs";
import { PALETTE } from "../tokens.mjs";

test("counter formats", () => {
  assert.deepEqual(formatCounter(1234, "int"), ["1,234", ""]);
  assert.deepEqual(formatCounter(7.6, "int"), ["8", ""]);
  assert.deepEqual(formatCounter(85, "bytes"), ["85", "B"]);
  assert.deepEqual(formatCounter(1400, "bytes"), ["1.4", "KB"]);
  assert.deepEqual(formatCounter(4096, "bytes"), ["4", "KB"]);
  assert.deepEqual(formatCounter(30 * 1024 * 1024, "bytes"), ["30", "MB"]);
  assert.deepEqual(formatCounter(4.1, "ms"), ["4.1", "ms"]);
  assert.deepEqual(formatCounter(0, "ms"), ["0", "ms"]);
  assert.deepEqual(formatCounter(0.25, "ms"), ["0.25", "ms"]);
  assert.deepEqual(formatCounter(412.4, "ms"), ["412", "ms"]);
  assert.deepEqual(formatCounter(1240, "ms"), ["1.24", "s"]);
  assert.deepEqual(formatCounter(0.42, "pct"), ["42", "%"]);
  assert.deepEqual(formatCounter(87, "pct"), ["87", "%"]);
  assert.deepEqual(formatCounter(0.055, "pct"), ["5.5", "%"]);
  assert.deepEqual(formatCounter(2.4, "x"), ["2.4", "×"]);
  assert.deepEqual(formatCounter(NaN, "int"), ["0", ""]);
  assert.equal(formatText(1400, "bytes"), "1.4 KB");
  assert.equal(formatText(0.5, "pct"), "50%");
});

test("counter decimals and unit (int and x)", () => {
  assert.deepEqual(formatCounter(9.25, "int", { decimals: 2, unit: "MSS" }), ["9.25", "MSS"]);
  assert.deepEqual(formatCounter(9.125, "int", { decimals: 1 }), ["9.1", ""]);
  assert.deepEqual(formatCounter(1234.5, "int", { decimals: 1 }), ["1,234.5", ""]);
  assert.deepEqual(formatCounter(10, "int", { unit: "MSS" }), ["10", "MSS"]);
  assert.deepEqual(formatCounter(2.456, "x", { decimals: 2 }), ["2.46", "×"]);
  assert.deepEqual(formatCounter(4.1, "ms", { decimals: 3, unit: "x" }), ["4.1", "ms"]);   // other formats keep their own
  assert.equal(formatText(9.5, "int", { decimals: 1, unit: "MSS" }), "9.5 MSS");
});

const defs = {
  mappers: { type: "int", min: 1, max: 6, value: 3 },
  ratio: { type: "float", min: 0, max: 1, value: 0.5 },
  combiner: { type: "bool", value: false },
  input: { type: "text", value: "the fox" },
  mode: { type: "select", value: "hash", options: [{ value: "hash" }, { value: "range" }] },
  seed: { type: "int", value: 7 },
};
const scen = [{ id: "happy" }, { id: "crash", params: { crash: 1, mappers: 4 } }];

test("deep links parse and coerce by definition", () => {
  const s = parseHash("#s=crash&t=12.4&p=mappers:9,ratio:0.25,combiner:1,input:a%2Cb%3Ac,mode:range,seed:42,extra:x", defs, scen);
  assert.equal(s.scenario, "crash");
  assert.equal(s.time, 12.4);
  assert.deepEqual(s.params, { mappers: 6, ratio: 0.25, combiner: true, input: "a,b:c", mode: "range", seed: 42, extra: "x" });
});

test("deep links ignore bad parts and keep foreign hash keys", () => {
  const s = parseHash("#s=nope&t=-3&p=mappers:abc,mode:zzz,combiner:maybe&section=intro", defs, scen);
  assert.equal(s.scenario, undefined);
  assert.equal(s.time, undefined);
  assert.deepEqual(s.params, {});
  assert.deepEqual(s.rest, ["section=intro"]);
  assert.deepEqual(parseHash("", defs).params, {});
});

test("deep links round-trip", () => {
  const params = { mappers: 5, combiner: true, input: "the quick, brown: fox" };
  const str = formatHash({ scenario: "crash", time: 12.43, params, rest: ["section=intro"] });
  assert.equal(str, "s=crash&t=12.4&p=mappers:5,combiner:1,input:the%20quick%2C%20brown%3A%20fox&section=intro");
  const back = parseHash("#" + str, defs, scen);
  assert.equal(back.scenario, "crash");
  assert.equal(back.time, 12.4);
  assert.deepEqual(back.params, params);
  assert.equal(formatHash({ time: 0 }), "");
});

test("only params that differ from the scenario's resolved values go in the link", () => {
  const values = { mappers: 4, ratio: 0.5, combiner: true, input: "the fox", mode: "hash", seed: 7 };
  assert.deepEqual(paramOverrides(values, defs, scen[1]), { combiner: true });
  assert.deepEqual(paramOverrides(values, defs, scen[0]), { mappers: 4, combiner: true });
});

test("highlighter classifies tokens per language", () => {
  const py = highlight('def map(doc):\n    for w in doc.split():  # words\n        emit(w, 1)\n', "python");
  assert.equal(py.length, 3);
  const kinds = (line) => line.filter((t) => t.t).map((t) => `${t.t}:${t.v}`);
  assert.deepEqual(kinds(py[0]), ["kw:def", "fn:map", "op:(", "op:):"]);
  assert.ok(kinds(py[1]).includes("com:# words"));
  assert.ok(kinds(py[2]).includes("fn:emit") && kinds(py[2]).includes("num:1"));
  const js = highlight("const s = `a\nb`; /* c\nd */ return 0x1f;", "js");
  assert.equal(js.length, 3);
  assert.equal(js[0].find((t) => t.t === "str").v, "`a");
  assert.equal(js[1][0].t, "str");
  assert.ok(js[2].some((t) => t.t === "kw" && t.v === "return") && js[2].some((t) => t.t === "num" && t.v === "0x1f"));
  const sql = highlight("SELECT word, count(*) FROM t -- all", "sql");
  assert.equal(sql[0][0].t, "kw");
  assert.ok(sql[0].some((t) => t.t === "com"));
  const go = highlight("func main() { x := 1 }", "go");
  assert.equal(go[0][0].t, "kw");
  const c = highlight('#include <stdio.h>\nint main(void) { return 0; }', "c");
  assert.equal(c[0][0].t, "kw");
  assert.equal(c[1][0].t, "type");
  const pseudo = highlight("for each key in keys do\n  emit key", "whatever");
  assert.equal(pseudo[0][0].t, "kw");
  assert.equal(highlight("", "python").length, 1);
});

test("highlighter reproduces the source exactly", () => {
  const src = "def f(x):\n\treturn x * 2  # double\n\nprint(f(3))";
  const lines = highlight(src, "python");
  assert.equal(lines.map((l) => l.map((t) => t.v).join("")).join("\n"), src.replace(/\t/g, "    "));
});

test("theme variables come from tokens", () => {
  for (const th of ["dark", "light"]) {
    const v = cssVars(th);
    assert.equal(v["--ix-stage"], PALETTE[th].stage);
    assert.equal(v["--ix-ink"], PALETTE[th].ink);
    assert.equal(v["--ix-key-0"], PALETTE[th].keys[0]);
    assert.match(v["--ix-glass"], /^rgb\(\d+ \d+ \d+ \/ [\d.]+\)$/);
    assert.match(v["--ix-ease"], /^cubic-bezier\(/);
    assert.equal(v["--ix-blur"], "18px");
    assert.equal(v["--ix-radius"], "14px");
  }
  assert.match(cssVars("dark")["--ix-shadow"], /0\.35\)$/);
  assert.match(cssVars("light")["--ix-shadow"], /0\.08\)$/);
});
