// Point at the line: helpers that turn an error, a key or a stack into "figure.mjs:184" plus the source line and a
// caret, and suggest the name that was probably meant. Used by verify and the loaders so a message names the file,
// the line and the fix.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const read = (file) => { try { return readFileSync(file, "utf8"); } catch { return null; } };

/** "    184 |   const biggest = …\n        |            ^" for a 1-based line (and column), or "" when unreadable. */
export function excerpt(file, line, col = 0) {
  const src = read(file);
  if (!src || !line) return "";
  const text = src.split("\n")[line - 1];
  if (text == null) return "";
  const n = String(line).padStart(5);
  const shown = text.length > 140 ? text.slice(0, 137) + "…" : text;
  return `${n} | ${shown.replace(/\t/g, " ")}` + (col > 0 && col <= shown.length + 1 ? `\n${" ".repeat(5)} | ${" ".repeat(col - 1)}^` : "");
}

/** The 1-based line where an object key is written (`"map.read": {`, `mappers: {`), searching after `after` if given. */
export function keyLine(file, key, { after } = {}) {
  const src = read(file);
  if (!src) return null;
  let from = 0;
  if (after) { const i = src.indexOf(after); if (i >= 0) from = i; }
  const q = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[\\s{,])(?:"${q}"|'${q}'|${/^[A-Za-z_$][\w$]*$/.test(key) ? q : `"${q}"`})\\s*:`, "m");
  const m = re.exec(src.slice(from));
  return m ? src.slice(0, from + m.index + m[1].length).split("\n").length : null;
}

/** The first stack frame inside `file`: { line, col } (1-based), or null. */
export function frameIn(stack, file) {
  for (const l of String(stack ?? "").split("\n")) {
    const m = /\(?((?:file:\/\/)?[^\s()]+):(\d+):(\d+)\)?\s*$/.exec(l);
    if (!m) continue;
    let p = m[1];
    try { if (p.startsWith("file:")) p = fileURLToPath(p); } catch {}
    if (p === file) return { line: Number(m[2]), col: Number(m[3]) };
  }
  return null;
}

/**
 * An import that failed, as "lesson.mjs:145: SyntaxError: Unexpected token '{'" plus the line and a caret. Node puts a
 * syntax error's place on the first line of its stack ("file:///…/lesson.mjs:145"), not in the message.
 */
export function importFailure(e, file) {
  const stack = String(e?.stack ?? "");
  const name = basename(file);
  const head = /^(file:\/\/\S+|\/\S+):(\d+)\s*$/m.exec(stack.split("\n")[0] ?? "");
  let where = null;
  if (head) { let p = head[1]; try { if (p.startsWith("file:")) p = fileURLToPath(p); } catch {} where = { file: p, line: Number(head[2]), col: caretCol(stack) }; }
  else { const f = frameIn(stack, file); if (f) where = { file, ...f }; }
  // a dynamic import's syntax error carries no place at all (Node 22): ask node --check, which prints it
  if (!where && e?.name === "SyntaxError") {
    const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", timeout: 10000 });
    const m = /^(.+):(\d+)\s*$/m.exec(r.stderr ?? "");
    if (m && r.status) where = { file, line: Number(m[2]), col: caretCol(r.stderr) };
  }
  const msg = `${e?.name ?? "Error"}: ${String(e?.message ?? e).replace(/^lesson\.mjs failed to import: /, "")}`;
  if (!where) return `${name}: ${msg}`;
  const ex = excerpt(where.file, where.line, where.col);
  return `${basename(where.file)}:${where.line}: ${msg}${ex ? `\n${ex}` : ""}`;
}
// the caret line Node prints under a syntax error: "    ^^^" -> its column
function caretCol(stack) {
  const lines = stack.split("\n");
  const k = lines.findIndex((l) => /^\s*\^+\s*$/.test(l));
  return k > 0 ? lines[k].indexOf("^") + 1 : 0;
}

/** Edit distance, a swap of two neighbouring letters counting as one edit (raed, read). */
export function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);   // two letters swapped
  }
  return d[a.length][b.length];
}

/** The candidate closest to `word` when it is close enough to be a typo (about one edit in four letters), else null. */
export function nearest(word, candidates) {
  let best = null, bd = Infinity;
  for (const c of new Set(candidates)) {
    if (c === word) continue;
    const d = editDistance(word.toLowerCase(), c.toLowerCase());
    if (d < bd) { bd = d; best = c; }
  }
  return best != null && bd <= Math.max(1, Math.floor(Math.max(word.length, best.length) / 4)) ? best : null;
}
