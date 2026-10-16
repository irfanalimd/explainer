// node --test engine/hud/markup.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, toText, toDOM } from "./markup.mjs";

test("plain text stays one text node", () => {
  assert.deepEqual(parse("Mapper w2 emits a record."), [{ type: "text", text: "Mapper w2 emits a record." }]);
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse(null), []);
});

test("key chips, with and without custom text", () => {
  assert.deepEqual(parse("{key:fox}"), [{ type: "key", name: "fox", text: "fox" }]);
  assert.deepEqual(parse("emits {key:fox|fox · 1} now"), [
    { type: "text", text: "emits " }, { type: "key", name: "fox", text: "fox · 1" }, { type: "text", text: " now" },
  ]);
  assert.deepEqual(parse("{key:3}"), [{ type: "key", name: "3", text: "3" }]);
});

test("ref chips keep a null text so the HUD can use the entity title", () => {
  assert.deepEqual(parse("{ref:m2}"), [{ type: "ref", id: "m2", text: null }]);
  assert.deepEqual(parse("{ref:m2|mapper 2}"), [{ type: "ref", id: "m2", text: "mapper 2" }]);
});

test("tone words; unknown tones keep their text but no tone", () => {
  assert.deepEqual(parse("{tone:fail|crashed}"), [{ type: "tone", tone: "fail", text: "crashed" }]);
  assert.deepEqual(parse("{tone:ok}"), [{ type: "tone", tone: "ok", text: "ok" }]);
  assert.deepEqual(parse("{tone:purple|x}"), [{ type: "tone", tone: null, text: "x" }]);
});

test("inline code is literal, braces and stars inside it included", () => {
  assert.deepEqual(parse("partition `hash(k) % R` = 1"), [
    { type: "text", text: "partition " }, { type: "code", text: "hash(k) % R" }, { type: "text", text: " = 1" },
  ]);
  assert.deepEqual(parse("`{key:fox} **x**`"), [{ type: "code", text: "{key:fox} **x**" }]);
});

test("bold can contain marks, and ** inside code does not close it", () => {
  const n = parse("**{key:the} wins** after");
  assert.equal(n[0].type, "bold");
  assert.deepEqual(n[0].children, [{ type: "key", name: "the", text: "the" }, { type: "text", text: " wins" }]);
  assert.deepEqual(n[1], { type: "text", text: " after" });
  const m = parse("**a `**` b**");
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].children, [{ type: "text", text: "a " }, { type: "code", text: "**" }, { type: "text", text: " b" }]);
});

test("malformed marks stay literal text", () => {
  assert.equal(toText(parse("{key:}")), "{key:}");
  assert.equal(toText(parse("{nope:x}")), "{nope:x}");
  assert.equal(toText(parse("an {unclosed mark")), "an {unclosed mark");
  assert.equal(toText(parse("**half bold")), "**half bold");
  assert.equal(toText(parse("a ` lone tick")), "a ` lone tick");
  assert.equal(toText(parse("set {a, b}")), "set {a, b}");
});

test("escapes produce literal characters", () => {
  assert.deepEqual(parse("\\{key:fox\\} and \\*\\*"), [{ type: "text", text: "{key:fox} and **" }]);
  assert.deepEqual(parse("`a\\`b`"), [{ type: "code", text: "a`b" }]);
});

test("newlines collapse to spaces", () => {
  assert.equal(toText(parse("one\n  two")), "one two");
});

test("toText resolves refs through refTitle", () => {
  const t = toText(parse("{ref:m2} sends {key:fox|fox · 1} to {ref:r1|reducer 1}"), (id) => (id === "m2" ? "Mapper 2" : null));
  assert.equal(t, "Mapper 2 sends fox · 1 to reducer 1");
  assert.equal(toText("{ref:zz}"), "zz");
});

// a tiny DOM stand-in, enough for toDOM
function fakeDoc() {
  const el = (tag) => ({
    tag, className: "", children: [], dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, tabIndex: -1,
    set textContent(v) { this.children = [{ text: String(v) }]; }, get textContent() { return this.children.map((c) => c.text ?? c.textContent).join(""); },
    appendChild(c) { this.children.push(c); return c; },
  });
  return { createElement: el, createTextNode: (text) => ({ text, textContent: text }), createDocumentFragment: () => el("#frag") };
}

test("toDOM builds chips with identity colour variables and data attributes", () => {
  const doc = fakeDoc();
  const frag = toDOM(parse("**{key:fox}** to {ref:r1} via `bus`, {tone:warn|slow}"), doc, {
    keyIndex: (n) => (n === "fox" ? 11 : null), refTitle: (id) => (id === "r1" ? "Reducer 1" : null),
  });
  const [bold, , ref, , glued, , tone] = frag.children;
  const code = glued.children[0];
  assert.equal(glued.className, "ix-nowrap");
  assert.equal(bold.tag, "strong");
  const chip = bold.children[0];
  assert.equal(chip.className, "ix-chip ix-key");
  assert.equal(chip.dataset.key, "3"); // 11 % 8
  assert.equal(chip.style.props["--k"], "var(--ix-key-3)");
  assert.equal(chip.textContent, "fox");
  assert.equal(ref.className, "ix-chip ix-ref");
  assert.equal(ref.dataset.ref, "r1");
  assert.equal(ref.textContent, "Reducer 1");
  assert.equal(ref.tabIndex, 0);
  assert.equal(code.tag, "code");
  assert.equal(code.textContent, "bus");
  assert.equal(tone.className, "ix-tone ix-tone-warn");
});

test("toDOM marks keys it cannot resolve as unknown", () => {
  const frag = toDOM("{key:owl}", fakeDoc(), { keyIndex: () => null });
  assert.equal(frag.children[0].className, "ix-chip ix-key ix-key-unknown");
});

test("punctuation after a chip is glued to it so a line never starts with it", () => {
  const frag = toDOM("lands on {ref:r1|reducer 1}: next, then `x`. done", fakeDoc(), {});
  const [t0, glue, t1, glue2, t2] = frag.children;
  assert.equal(t0.text, "lands on ");
  assert.equal(glue.className, "ix-nowrap");
  assert.equal(glue.children[0].className, "ix-chip ix-ref");
  assert.equal(glue.children[1].text, ":");
  assert.equal(t1.text, " next, then ");
  assert.equal(glue2.children[0].tag, "code");
  assert.equal(glue2.children[1].text, ".");
  assert.equal(t2.text, " done");
});
