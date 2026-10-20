// Tests for the import scanner, specifier mapping, rewrite, graph collection and the page's minifiers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { scanImports, rewriteImports, specifierFor, collectGraph, resolveSpecifier, minify, minifyCss, moduleUrl, tokenize } from "./modules.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const specs = (src) => scanImports(src).imports.map((i) => `${i.kind}:${i.spec}`);

test("finds static, side-effect, re-export and literal dynamic imports", () => {
  const src = `
    import a from "./a.mjs";
    import { b, c as d } from './b.mjs';
    import * as ns from "../ns.mjs";
    import e, { f } from "./e.mjs";
    import "./side.mjs";
    export * from "./all.mjs";
    export * as grp from "./grp.mjs";
    export { g, h as i } from "./g.mjs";
    export { local };
    export const x = 1;
    const later = await import("./dyn.mjs");
    const tpl = import(\`./tpl.mjs\`);
    import { "string name" as sn } from "./str.mjs";
  `;
  assert.deepEqual(specs(src), [
    "static:./a.mjs", "static:./b.mjs", "static:../ns.mjs", "static:./e.mjs", "side:./side.mjs",
    "export:./all.mjs", "export:./grp.mjs", "export:./g.mjs", "dynamic:./dyn.mjs", "dynamic:./tpl.mjs", "static:./str.mjs",
  ]);
});

test("ignores imports inside strings, templates, comments and regexes", () => {
  const src = `
    // import x from "./comment.mjs";
    /* import y from "./block.mjs"; */
    const s = 'import z from "./single.mjs"';
    const d = "export * from './double.mjs'";
    export const code = { source: \`import { emit } from "./template.mjs";
    \${ "nested" + \`import q from "./nested.mjs"\` } and more import("./t2.mjs") \` };
    const re = /import a from "\\.\\/re.mjs"/g;
    const re2 = x.replace(/['"]/g, "");
    const div = a / b / c; import real from "./real.mjs";
    obj.import("./member.mjs");
    const o = { import: 1, export: 2 };
  `;
  assert.deepEqual(specs(src), ["static:./real.mjs"]);
});

test("template substitutions keep lexing code (an import inside one is found)", () => {
  const src = "const t = `a ${ (await import(\"./inner.mjs\")).x } b`;\nimport y from \"./after.mjs\";";
  assert.deepEqual(specs(src), ["dynamic:./inner.mjs", "static:./after.mjs"]);
});

test("reports computed dynamic imports and import.meta", () => {
  const r = scanImports(`const m = await import(name);\nconst u = new URL("x", import.meta.url);\nimport(\`./\${n}.mjs\`);`);
  assert.equal(r.imports.length, 0);
  assert.deepEqual(r.dynamic.map((d) => d.line), [1, 3]);
  assert.deepEqual(r.importMeta.map((d) => d.line), [2]);
});

test("rewrite replaces only the specifier tokens", () => {
  const src = `import a from './a.mjs';\nexport { b } from "./b.mjs";\nconst t = "./a.mjs";\nimport("./a.mjs");`;
  const r = scanImports(src);
  const out = rewriteImports(src, r.imports, (i) => "@internals/" + i.spec.slice(2));
  assert.equal(out, `import a from "@internals/a.mjs";\nexport { b } from "@internals/b.mjs";\nconst t = "./a.mjs";\nimport("@internals/a.mjs");`);
});

test("specifiers: skill files by path, the figure as @internals/figure, outside files under local/", () => {
  const skillRoot = "/s/explainer", figure = "/u/proj/figs/figure.mjs";
  assert.equal(specifierFor("/s/explainer/engine/runtime.mjs", { skillRoot, figure }), "@internals/engine/runtime.mjs");
  assert.equal(specifierFor(figure, { skillRoot, figure }), "@internals/figure");
  assert.equal(specifierFor("/u/proj/figs/helpers.mjs", { skillRoot, figure }), "@internals/local/helpers.mjs");
  assert.equal(specifierFor("/u/proj/shared/x.mjs", { skillRoot, figure }), "@internals/local/_up/shared/x.mjs");
});

test("graph: figure outside the skill importing it by relative, absolute and @internals paths", () => {
  const root = mkdtempSync(join(tmpdir(), "ix-graph-"));
  try {
    const skill = join(root, "skill"), proj = join(root, "proj");
    for (const d of [join(skill, "engine"), join(skill, "sim"), proj]) mkdirSync(d, { recursive: true });
    writeFileSync(join(skill, "engine", "runtime.mjs"), `import { T } from "./tokens.mjs";\nexport function mount() { return import("./lazy.mjs"); }`);
    writeFileSync(join(skill, "engine", "tokens.mjs"), `export const T = 1;`);
    writeFileSync(join(skill, "engine", "lazy.mjs"), `export * from "../sim/rng.mjs";`);
    writeFileSync(join(skill, "sim", "rng.mjs"), `export const rng = 1;`);
    writeFileSync(join(skill, "sim", "actors.mjs"), `import { rng } from "./rng.mjs"; export const net = rng;`);
    writeFileSync(join(proj, "helpers.mjs"), `export const h = 1;`);
    writeFileSync(join(proj, "figure.mjs"), [
      `import { net } from "${join(skill, "sim", "actors.mjs")}";`,
      `import { T } from "@internals/engine/tokens.mjs";`,
      `import { h } from "./helpers.mjs";`,
      `import { rng } from "../skill/sim/rng.mjs";`,
      `export const meta = { title: "x" };`,
    ].join("\n"));
    const figure = join(proj, "figure.mjs");
    const g = collectGraph([figure, join(skill, "engine", "runtime.mjs")], { skillRoot: skill, figure });
    const names = [...g.modules.values()].map((m) => m.spec).sort();
    assert.deepEqual(names, [
      "@internals/engine/lazy.mjs", "@internals/engine/runtime.mjs", "@internals/engine/tokens.mjs", "@internals/figure",
      "@internals/local/helpers.mjs", "@internals/sim/actors.mjs", "@internals/sim/rng.mjs",
    ]);
    const fig = g.modules.get(figure);
    assert.deepEqual(fig.imports.map((i) => g.modules.get(i.file).spec), ["@internals/sim/actors.mjs", "@internals/engine/tokens.mjs", "@internals/local/helpers.mjs", "@internals/sim/rng.mjs"]);
    writeFileSync(join(proj, "broken.mjs"), `import x from "./missing";`);
    writeFileSync(join(proj, "missing.mjs"), ``);
    assert.throws(() => collectGraph([join(proj, "broken.mjs")], { skillRoot: skill }), /broken\.mjs:1: cannot find "\.\/missing" \(did you mean "\.\/missing\.mjs"/);
    assert.throws(() => resolveSpecifier("lodash", figure, { skillRoot: skill }), /bare specifier "lodash"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("minify drops comments and indentation and keeps every token, line break and template byte for byte", () => {
  const src = [
    "// a comment",
    "import { a } from \"./a.mjs\";   /* block */",
    "export const code = `function f() {",
    "    // kept: it is the figure's code",
    "    return  1;",
    "}`;",
    "const x = a",
    "  /* breaks the line */ (1)",
    "const re = /\\/\\/ not a comment/g, s = '/* nor this */';",
    "if (x) {",
    "    return x + +y - -z;",
    "}",
  ].join("\n");
  const out = minify(src);
  assert.equal(out, [
    "import{a}from\"./a.mjs\";",
    "export const code =`function f() {\n    // kept: it is the figure's code\n    return  1;\n}`;",
    "const x = a",
    "(1)",
    "const re = /\\/\\/ not a comment/g,s ='/* nor this */';",
    "if(x){",
    "return x + +y - -z;",
    "}",
  ].join("\n"));
  const toks = (s) => tokenize(s).map((t) => s.slice(t.start, t.end));
  assert.deepEqual(toks(out), toks(src));
});

test("every module in the skill still parses after minify", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/^(\.|node_modules$|out$)/.test(f)) walk(p); } else if (f.endsWith(".mjs")) files.push(p); } };
  for (const d of ["engine", "sim", "examples", "scripts"]) walk(join(root, d));
  const dir = mkdtempSync(join(tmpdir(), "explainer-minify-"));
  try {
    const list = files.map((f, i) => { const out = join(dir, `${i}.mjs`); writeFileSync(out, minify(readFileSync(f, "utf8"))); return [f, out]; });
    // vm.SourceTextModule parses a module without running it (one child process for the lot)
    const bad = execFileSync(process.execPath, ["--experimental-vm-modules", "--no-warnings", "--input-type=module", "-e", `
      import vm from "node:vm"; import { readFileSync } from "node:fs";
      const bad = [];
      for (const [src, out] of ${JSON.stringify(list)}) try { new vm.SourceTextModule(readFileSync(out, "utf8")); } catch (e) { bad.push(src + ": " + e.message); }
      process.stdout.write(JSON.stringify(bad));`], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(bad), []);
    assert.ok(list.length > 150);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("minifyCss keeps strings, url()s and descendant spaces", () => {
  const css = `/* the stage */\n.ix  .ix-tag:hover ,\n.b > .c {\n  color : red ;\n  background: url("data:image/svg+xml,%3Csvg /* x */%3E") , url(a.png);\n  content: "  /* kept */  ";\n}\n@media (max-width: 600px) {\n  .a { margin: calc(1px + 2px) }\n}\n`;
  assert.equal(minifyCss(css), `.ix .ix-tag:hover,.b > .c{color : red;background: url("data:image/svg+xml,%3Csvg /* x */%3E"),url(a.png);content: "  /* kept */  ";}@media (max-width: 600px){.a{margin: calc(1px + 2px)}}`);
});

test("moduleUrl escapes what a URL parser would drop or cut, and decodes back to the source", () => {
  const code = "const a = '100%';\n\tlet b = \"#x\" + `é ${a}`;\r\n";
  const url = moduleUrl(code);
  assert.match(url, /^data:text\/javascript,/);
  assert.doesNotMatch(url, /[\n\r\t#]/);
  assert.equal(decodeURIComponent(new URL(url).href.slice("data:text/javascript,".length)), code);
});
