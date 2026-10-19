// Tests for the helpers that point a message at its line and its likely fix, for Chrome discovery, and for the
// scaffold's README commands.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, chmodSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { editDistance, nearest, keyLine, excerpt, frameIn, importFailure } from "./where.mjs";
import { findChrome } from "./cdp.mjs";
import { relocateCommands } from "../new.mjs";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("a typo is one edit, a swap of two letters included", () => {
  assert.equal(editDistance("read", "read"), 0);
  assert.equal(editDistance("raed", "read"), 1);
  assert.equal(editDistance("mapp", "map"), 1);
  assert.equal(nearest("map.raed", ["map.read", "map.empty", "shuffle.send"]), "map.read");
  assert.equal(nearest("mapp", ["map", "count", "slip"]), "map");
  assert.equal(nearest("mm0", ["m0", "m1", "r0"]), "m0");
  // too far to be a typo: no guess
  assert.equal(nearest("mapper0", ["m0", "m1"]), null);
  assert.equal(nearest("x", []), null);
});

test("keyLine, excerpt and frameIn name the line", () => {
  const d = mkdtempSync(join(tmpdir(), "where-"));
  try {
    const f = join(d, "lesson.mjs");
    writeFileSync(f, `export const lesson = {\n  steps: {\n    "map.read": {\n      plain: "{map} reads.",\n    },\n  },\n  mappers: 3,\n};\n`);
    assert.equal(keyLine(f, "map.read"), 3);
    assert.equal(keyLine(f, "mappers"), 7);
    assert.equal(keyLine(f, "nope"), null);
    assert.equal(excerpt(f, 4, 14), `    4 |       plain: "{map} reads.",\n      |              ^`);
    assert.equal(excerpt(f, 99), "");
    assert.deepEqual(frameIn(`Error: x\n    at build (file://${f}:4:9)\n    at other (node:internal/x:1:1)`, f), { line: 4, col: 9 });
    assert.equal(frameIn("Error: x\n    at node:internal/x:1:1", f), null);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("a syntax error in an imported file is reported with its line and a caret", async () => {
  const d = mkdtempSync(join(tmpdir(), "where-"));
  try {
    const f = join(d, "lesson.mjs");
    writeFileSync(f, `export const lesson = {\n  steps: {{\n  },\n};\n`);
    const e = await import(`file://${f}`).then(() => null, (x) => x);
    assert.ok(e, "the import should fail");
    assert.match(importFailure(e, f), /^lesson\.mjs:2: SyntaxError: Unexpected token '\{'\n\s+2 \|   steps: \{\{/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("findChrome honours CHROME_PATH, says when it is wrong, and searches PATH", () => {
  const d = mkdtempSync(join(tmpdir(), "where-"));
  try {
    assert.deepEqual(findChrome({ CHROME_PATH: join(d, "nope") }).bad, join(d, "nope"));
    assert.equal(findChrome({ CHROME_PATH: join(d, "nope") }).path, null);
    const bin = join(d, "bin"), chrome = join(bin, process.platform === "win32" ? "chrome.exe" : "chromium");
    mkdirSync(bin); writeFileSync(chrome, ""); chmodSync(chrome, 0o755);
    assert.deepEqual(findChrome({ CHROME_PATH: chrome }), { path: chrome, how: "CHROME_PATH" });
    // on PATH, when no installed Chrome comes first
    const r = findChrome({ PATH: bin });
    assert.ok(r.path, "found something");
    if (r.how === "PATH") assert.equal(r.path, chrome);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("a copied README's commands are rewritten to run from the new folder", () => {
  const md = "```sh\nnode ../../scripts/verify.mjs figure.mjs   # 26 runs\nnode ../../scripts/shoot.mjs page.html\nnode ../vendor/scripts/x.mjs\n```\n";
  const from = join(skillRoot, "examples", "mapreduce");
  const out = relocateCommands(md, from, join(tmpdir(), "elsewhere", "mr"));
  assert.ok(out.includes(`node ${join(skillRoot, "scripts")}/verify.mjs figure.mjs   # 26 runs`), out);
  assert.ok(out.includes(`node ${join(skillRoot, "scripts")}/shoot.mjs page.html`), out);
  assert.ok(out.includes("node ../vendor/scripts/x.mjs"), "a path that is not the skill's scripts is left alone");
  // inside the skill: relative, like the imports
  assert.ok(relocateCommands(md, from, join(skillRoot, "figs", "mr")).includes("node ../../scripts/verify.mjs"));
  assert.ok(relocateCommands(md, from, join(skillRoot, "figs", "a", "mr")).includes("node ../../../scripts/verify.mjs"));
});
