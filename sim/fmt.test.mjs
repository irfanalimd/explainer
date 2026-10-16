import { test } from "node:test";
import assert from "node:assert/strict";
import * as fmt from "./fmt.mjs";

const A = (s) => fmt.ascii(s);

test("bytes: decimal by default, binary on request, unit never wraps", () => {
  const cases = [[0, "0 B"], [512, "512 B"], [999, "999 B"], [999.6, "1 KB"], [1000, "1 KB"], [1400, "1.4 KB"], [14500, "14.5 KB"],
    [145000, "145 KB"], [999999, "1 MB"], [2.5e9, "2.5 GB"], [-1400, "-1.4 KB"]];
  for (const [n, want] of cases) assert.equal(A(fmt.bytes(n)), want, `bytes(${n})`);
  assert.equal(A(fmt.bytes(4096, { binary: true })), "4 KiB");
  assert.equal(A(fmt.bytes(1536, { binary: true })), "1.5 KiB");
  assert.equal(A(fmt.bytes(2 ** 21, { binary: true })), "2 MiB");
  assert.equal(fmt.bytes(1400), "1.4 KB");
});

test("ms: ns, µs, ms and s", () => {
  const cases = [[4.1, "4.1 ms"], [4, "4 ms"], [12.34, "12.3 ms"], [150, "150 ms"], [999.7, "1 s"], [1500, "1.5 s"], [0.42, "420 µs"],
    [0.9999, "1 ms"], [0.0005, "500 ns"], [0.000001, "1 ns"], [0, "0 ms"], [125000, "125 s"]];
  for (const [n, want] of cases) assert.equal(A(fmt.ms(n)), want, `ms(${n})`);
});

test("pct, ratio, num and int", () => {
  assert.equal(fmt.pct(0.42), "42%");
  assert.equal(fmt.pct(0.4231, 1), "42.3%");
  assert.equal(fmt.pct(0.042), "4.2%");
  assert.equal(fmt.pct(1), "100%");
  assert.equal(fmt.ratio(2.34), "2.3×");
  assert.equal(fmt.ratio(12.6), "13×");
  assert.equal(A(fmt.num(1234567)), "1 234 567");
  assert.equal(fmt.num(1234567), "1 234 567");
  assert.equal(A(fmt.num(1234.5678)), "1 234.57");
  assert.equal(A(fmt.num(-42)), "-42");
  assert.equal(fmt.num(-42), "−42");
  assert.equal(fmt.num(3.10), "3.1");
  assert.equal(fmt.num(2, 2), "2.00");
  assert.equal(A(fmt.num(12345678901234567890n)), "12 345 678 901 234 567 890");
  assert.equal(fmt.num(Infinity), "∞");
  assert.equal(A(fmt.int(9999.6)), "10 000");
});

test("hex and bin: width, grouping, BigInt, sign", () => {
  assert.equal(fmt.hex(0x7f3a, 4), "0x7f3a");
  assert.equal(fmt.hex(0x7f3a2c10, 8), "0x7f3a_2c10");
  assert.equal(fmt.hex(0x7f3a2c10), "0x7f3a_2c10");
  assert.equal(fmt.hex(0x7f3a2), "0x7f3a2");
  assert.equal(fmt.hex(0x2c10, 8), "0x0000_2c10");
  assert.equal(fmt.hex(0x7f3a2c10, { group: false }), "0x7f3a2c10");
  assert.equal(fmt.hex(0xab, 4, { upper: true }), "0x00AB");
  assert.equal(fmt.hex(0xff, { prefix: false }), "ff");
  assert.equal(fmt.hex(0x7f3a2c108000), "0x7f3a_2c10_8000");
  assert.equal(fmt.hex(0xffff800000000000n), "0xffff_8000_0000_0000");
  assert.equal(A(fmt.hex(-16)), "-0x10");
  assert.equal(fmt.hex(0x12345, 8, { group: 2 }), "0x00_01_23_45");
  assert.throws(() => fmt.hex(1.5), /integer/);
  assert.equal(fmt.bin(0b1011, 8), "0b00001011");
  assert.equal(fmt.bin(0x3ff), "0b11_1111_1111");
});

test("plural, pluralize and and()", () => {
  assert.equal(A(fmt.plural(3, "comparison")), "3 comparisons");
  assert.equal(A(fmt.plural(1, "entry")), "1 entry");
  assert.equal(A(fmt.plural(2, "entry")), "2 entries");
  assert.equal(A(fmt.plural(0, "box")), "0 boxes");
  assert.equal(A(fmt.plural(2, "key")), "2 keys");
  assert.equal(A(fmt.plural(2, "child")), "2 children");
  assert.equal(A(fmt.plural(1234, "byte")), "1 234 bytes");
  assert.equal(A(fmt.plural(2, "ox", "oxen")), "2 oxen");
  assert.equal(fmt.and([]), "");
  assert.equal(fmt.and(["a"]), "a");
  assert.equal(fmt.and(["a", "b"]), "a and b");
  assert.equal(fmt.and(["a", "b", "c"]), "a, b and c");
  assert.equal(fmt.and(["a", "b"], "or"), "a or b");
});

test("caption markup helpers", () => {
  assert.equal(fmt.key("fox"), "{key:fox}");
  assert.equal(fmt.key("fox", "the word fox"), "{key:fox|the word fox}");
  assert.equal(fmt.ref("m2"), "{ref:m2}");
  assert.equal(fmt.ref({ id: "m2" }, "mapper 2"), "{ref:m2|mapper 2}");
  assert.equal(fmt.tone("fail", "crashed"), "{tone:fail|crashed}");
  assert.equal(fmt.code("hash(k) % R"), "`hash(k) % R`");
  assert.equal(fmt.code("a`b"), "`a\\`b`");
  assert.equal(fmt.bold("x"), "**x**");
  assert.equal(fmt.term("pointer"), "{term:pointer}");
  assert.equal(fmt.term("pointer", "pointers"), "{term:pointer|pointers}");
  assert.equal(fmt.plain(`follow the ${fmt.term("pointer", "pointers")}`), "follow the pointers");
  assert.equal(fmt.escape("a*b {c}"), "a\\*b \\{c\\}");
  assert.throws(() => fmt.key("a|b"), /markup character/);
  assert.throws(() => fmt.ref(""), /empty/);
  assert.throws(() => fmt.tone("shiny", "x"), /unknown tone/);
  assert.throws(() => fmt.key("k", "a}b"), /cannot appear inside a mark/);
  assert.equal(fmt.plain(`Compare ${fmt.ref("t3", "a[2]")} = 9 with {key:fox} — ${fmt.tone("ok", "fine")} ${fmt.code("x")} **b**`), "Compare a[2] = 9 with fox — fine x b");
  assert.equal(fmt.sentence("hello"), "Hello");
  assert.equal(fmt.sentence("{ref:a|a[1]} moves"), "{ref:a|a[1]} moves");
});
