// ES module graph tools for the single-file build and the dev server.
// A small JavaScript lexer finds import/export specifiers without being fooled by strings, template
// literals, comments or regular expressions (a figure's `code` export may well contain the word import).
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ID_START = /[\p{ID_Start}$_\\]/u, ID_PART = /[\p{ID_Continue}$‌‍\\]/u;
const REGEX_AFTER_WORD = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await", "extends"]);

/** Tokenize just enough of JavaScript: names, strings (with value), punctuators. Comments, regexes and template text are skipped. */
export function tokenize(src) {
  const toks = [];
  const braces = [];             // "{" for code blocks, "`" for template substitutions
  let i = 0, n = src.length;
  if (src.startsWith("#!")) i = src.indexOf("\n") === -1 ? n : src.indexOf("\n");
  const last = () => toks[toks.length - 1];
  const regexAllowed = () => {
    const t = last();
    if (!t) return true;
    if (t.type === "name") return REGEX_AFTER_WORD.has(t.value);
    if (t.type === "string" || t.type === "number" || t.type === "template" || t.type === "regex") return false;
    // after ")" or "]" a slash divides; after "}" assume a statement starts (a misread there costs at most one line)
    return !(t.value === ")" || t.value === "]");
  };
  // scan template text from i (just after ` or }), returns when it hits ` (end) or ${ (substitution)
  const templateText = (start) => {
    let j = start, text = "";
    while (j < n) {
      const c = src[j];
      if (c === "\\") { text += src[j + 1]; j += 2; continue; }
      if (c === "`") return { end: j + 1, done: true, text };
      if (c === "$" && src[j + 1] === "{") return { end: j + 2, done: false, text };
      text += c; j++;
    }
    return { end: n, done: true, text };
  };
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v" || c === " " || c === "﻿" || c === " " || c === " ") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); i = e === -1 ? n : e; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, v = "";
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") { v += unescape1(src, j); j += escLen(src, j); continue; }
        if (src[j] === "\n") break;
        v += src[j++];
      }
      toks.push({ type: "string", value: v, start: i, end: j + 1, quote: c });
      i = j + 1; continue;
    }
    if (c === "`") {
      const t = templateText(i + 1);
      toks.push({ type: "template", value: t.done ? t.text : null, start: i, end: t.end });
      if (!t.done) braces.push("`");
      i = t.end; continue;
    }
    if (c === "}" && braces[braces.length - 1] === "`") {
      braces.pop();
      const t = templateText(i + 1);
      toks.push({ type: "template", value: null, start: i, end: t.end });
      if (!t.done) braces.push("`");
      i = t.end; continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1, cls = false;
      while (j < n) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "\n") break;
        if (cls) { if (d === "]") cls = false; }
        else if (d === "[") cls = true;
        else if (d === "/") break;
        j++;
      }
      j++;
      while (j < n && /[a-z]/i.test(src[j])) j++;
      toks.push({ type: "regex", value: src.slice(i, j), start: i, end: j });
      i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1]))) {
      let j = i + 1;
      while (j < n && /[0-9a-zA-Z_.]/.test(src[j])) { if ((src[j] === "e" || src[j] === "E") && (src[j + 1] === "+" || src[j + 1] === "-")) j++; j++; }
      toks.push({ type: "number", value: src.slice(i, j), start: i, end: j });
      i = j; continue;
    }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < n && ID_PART.test(src[j])) j++;
      toks.push({ type: "name", value: src.slice(i, j), start: i, end: j });
      i = j; continue;
    }
    if (c === "." && src[i + 1] === "." && src[i + 2] === ".") { toks.push({ type: "punct", value: "...", start: i, end: i + 3 }); i += 3; continue; }
    if (c === "?" && src[i + 1] === "." && !/[0-9]/.test(src[i + 2])) { toks.push({ type: "punct", value: "?.", start: i, end: i + 2 }); i += 2; continue; }
    if (c === "{") braces.push("{");
    else if (c === "}") braces.pop();
    toks.push({ type: "punct", value: c, start: i, end: i + 1 });
    i++;
  }
  return toks;
}

function escLen(s, j) {
  const c = s[j + 1];
  if (c === "u" && s[j + 2] === "{") return s.indexOf("}", j) - j + 1;
  if (c === "u") return 6;
  if (c === "x") return 4;
  if (c === "\r" && s[j + 2] === "\n") return 3;
  return 2;
}
function unescape1(s, j) {
  const c = s[j + 1];
  const map = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0", "\n": "", "\r": "" };
  if (c in map) return map[c];
  if (c === "u" && s[j + 2] === "{") return String.fromCodePoint(parseInt(s.slice(j + 3, s.indexOf("}", j)), 16));
  if (c === "u") return String.fromCharCode(parseInt(s.slice(j + 2, j + 6), 16));
  if (c === "x") return String.fromCharCode(parseInt(s.slice(j + 2, j + 4), 16));
  return c;
}

const lineOf = (src, pos) => { let l = 1; for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) l++; return l; };

/**
 * Find every module specifier in a source file.
 * @returns {{ imports: {kind:"static"|"side"|"export"|"dynamic", spec:string, start:number, end:number, quote:string, line:number}[],
 *             dynamic: {line:number}[], importMeta: {line:number}[], tokens: object[] }}
 *          `dynamic` lists import() calls whose argument is not a plain string (cannot be bundled).
 */
export function scanImports(src) {
  const t = tokenize(src);
  const imports = [], dynamic = [], importMeta = [];
  const is = (k, type, value) => t[k] && t[k].type === type && (value === undefined || t[k].value === value);
  const literal = (k) => t[k] && (t[k].type === "string" || (t[k].type === "template" && t[k].value !== null));
  const add = (kind, k) => imports.push({ kind, spec: t[k].value, start: t[k].start, end: t[k].end, quote: t[k].quote ?? "`", line: lineOf(src, t[k].start) });
  for (let k = 0; k < t.length; k++) {
    const tok = t[k];
    if (tok.type !== "name" || (tok.value !== "import" && tok.value !== "export")) continue;
    const prev = t[k - 1];
    if (prev && prev.type === "punct" && (prev.value === "." || prev.value === "?.")) continue;   // obj.import
    if (tok.value === "import") {
      if (is(k + 1, "punct", "(")) {
        if (literal(k + 2) && (is(k + 3, "punct", ")") || is(k + 3, "punct", ","))) add("dynamic", k + 2);
        else dynamic.push({ line: lineOf(src, tok.start) });
        continue;
      }
      if (is(k + 1, "punct", ".")) { importMeta.push({ line: lineOf(src, tok.start) }); continue; }
      if (is(k + 1, "string")) { add("side", k + 1); continue; }
      // import a, { b as c, "d" as e }, * as f from "x"
      for (let j = k + 1; j < t.length && j < k + 400; j++) {
        const u = t[j];
        if (u.type === "name" && u.value === "from" && is(j + 1, "string")) { add("static", j + 1); k = j + 1; break; }
        if (u.type === "punct" && !["{", "}", ",", "*"].includes(u.value)) break;
        if (u.type !== "punct" && u.type !== "name" && u.type !== "string") break;
      }
    } else {
      // export * from "x" | export * as ns from "x" | export { a, b as c } from "x"
      let j = k + 1;
      if (is(j, "punct", "*")) { j++; if (is(j, "name", "as")) j += 2; }
      else if (is(j, "punct", "{")) { while (j < t.length && !is(j, "punct", "}")) j++; j++; }
      else continue;
      if (is(j, "name", "from") && is(j + 1, "string")) add("export", j + 1);
    }
  }
  return { imports, dynamic, importMeta, tokens: t };
}

/** Rewrite specifiers: map(imp) returns the new specifier string, or null to keep it. */
export function rewriteImports(src, imports, map) {
  let out = "", at = 0;
  for (const imp of [...imports].sort((a, b) => a.start - b.start)) {
    const next = map(imp);
    if (next == null || next === imp.spec) continue;
    out += src.slice(at, imp.start) + JSON.stringify(next);
    at = imp.end;
  }
  return out + src.slice(at);
}

const toPosix = (p) => p.split(sep).join("/");
const inside = (root, file) => { const r = relative(root, file); return !!r && !r.startsWith("..") && !isAbsolute(r); };

/** Resolve a specifier written in `fromFile` to an absolute file path. Throws with a precise message. */
export function resolveSpecifier(spec, fromFile, { skillRoot, figure } = {}) {
  let file;
  if (spec.startsWith("./") || spec.startsWith("../")) file = resolve(dirname(fromFile), spec);
  else if (spec.startsWith("file://")) file = fileURLToPath(spec);
  else if (spec.startsWith("/")) file = spec;
  else if (spec === "@internals/figure" && figure) file = figure;
  else if (spec.startsWith("@internals/")) file = resolve(skillRoot, spec.slice("@internals/".length));
  else throw new Error(`bare specifier "${spec}" is not supported; import skill modules with a relative path, an absolute path or "@internals/<path>"`);
  if (!existsSync(file) || !statSync(file).isFile()) {
    const hint = existsSync(file + ".mjs") ? ` (did you mean "${spec}.mjs"? imports need the extension)` : existsSync(file + ".js") ? ` (did you mean "${spec}.js"?)` : "";
    throw new Error(`cannot find "${spec}"${hint}`);
  }
  return file;
}

/** The bare specifier a file gets in the page: @internals/figure, @internals/<path in the skill>, or @internals/local/<path from the figure>. */
export function specifierFor(file, { skillRoot, figure }) {
  if (figure && resolve(file) === resolve(figure)) return "@internals/figure";
  if (inside(skillRoot, file)) return "@internals/" + toPosix(relative(skillRoot, file));
  const base = figure ? dirname(figure) : skillRoot;
  return "@internals/local/" + toPosix(relative(base, file)).split("/").map((s) => (s === ".." ? "_up" : s)).join("/");
}

/**
 * Collect the module graph reachable from the entry files.
 * @returns {{ modules: Map<string, {file, spec, source, imports, warnings}>, order: string[], warnings: string[] }}
 */
export function collectGraph(entries, { skillRoot, figure, read = (f) => readFileSync(f, "utf8") }) {
  const modules = new Map(), order = [], warnings = [];
  const queue = entries.map((f) => ({ file: resolve(f), from: null }));
  while (queue.length) {
    const { file, from } = queue.shift();
    if (modules.has(file)) continue;
    let source;
    try { source = read(file); } catch (e) { throw new Error(`cannot read ${from ? `${display(file, skillRoot)} (imported from ${from})` : display(file, skillRoot)}: ${e.message}`); }
    const scan = scanImports(source);
    const rel = display(file, skillRoot);
    const imports = scan.imports.map((imp) => {
      let resolved;
      try { resolved = resolveSpecifier(imp.spec, file, { skillRoot, figure }); }
      catch (e) { throw new Error(`${rel}:${imp.line}: ${e.message}`); }
      queue.push({ file: resolved, from: `${rel}:${imp.line}` });
      return { ...imp, file: resolved };
    });
    const mw = [];
    for (const d of scan.dynamic) mw.push(`${rel}:${d.line}: import() with a computed specifier cannot be bundled; use a string literal`);
    // engine modules guard their import.meta fallbacks; an author's own module probably means to fetch an asset
    if (!inside(skillRoot, file) || file === figure) for (const m of scan.importMeta) mw.push(`${rel}:${m.line}: uses import.meta; in the single-file page modules are data: URLs, so import.meta.url cannot locate assets (inline the data instead)`);
    warnings.push(...mw);
    modules.set(file, { file, spec: specifierFor(file, { skillRoot, figure }), source, imports, warnings: mw });
    order.push(file);
  }
  return { modules, order, warnings };
}

export function display(file, skillRoot) {
  const r = relative(process.cwd(), file);
  const s = relative(skillRoot, file);
  if (!s.startsWith("..") && !isAbsolute(s)) return toPosix(s);
  return r.startsWith("..") ? file : toPosix(r);
}

export { toPosix, inside, posix };
