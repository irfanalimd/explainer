#!/usr/bin/env node
// Scaffold a figure folder: figure.mjs (from the commented template, or copied from an example) and a README.
//   node scripts/new.mjs <dir> [--from <example name | path>] [--title "Raft"] [--force]
// Imports that point into the skill are rewritten for the new location: relative when the folder is inside
// the skill, absolute otherwise (both work in Node and in the build).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { resolve, join, dirname, relative, basename, extname, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { scanImports, rewriteImports, resolveSpecifier } from "./lib/modules.mjs";
import { parseArgs, isMain, showPath } from "./lib/args.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");
const SKIP = /(^|\/)(shots|frames|node_modules|\.[^/]*)(\/|$)|\.(html|png|webm|mp4|gif)$/;

const USAGE = `
usage: node scripts/new.mjs <dir> [options]
  --from <example>   copy examples/<example>/ (or any figure folder) instead of the template
  --title <text>     the figure's title (default: from the folder name)
  --force            write into a non-empty folder (existing files are overwritten)
`;

const inside = (root, f) => { const r = relative(root, f); return !!r && !r.startsWith("..") && !isAbsolute(r); };
const titleOf = (dir) => basename(dir).replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Rewrite specifiers that leave `fromDir` (into the skill) so they resolve from `toDir`. */
export function relocate(src, file, fromDir, toDir) {
  const { imports } = scanImports(src);
  return rewriteImports(src, imports, (imp) => {
    if (!imp.spec.startsWith(".")) return null;
    let target;
    try { target = resolveSpecifier(imp.spec, file, { skillRoot }); } catch { return null; }
    if (inside(fromDir, target)) return null;                    // moves along with the folder
    if (!inside(skillRoot, toDir)) return target;                // outside the skill: absolute path
    const r = relative(toDir, target).split(sep).join("/");
    return r.startsWith(".") ? r : "./" + r;
  });
}

export function scaffold(dir, { from, title, force } = {}) {
  dir = resolve(dir);
  if (existsSync(dir) && readdirSync(dir).length && !force) throw new Error(`${dir} is not empty (use --force to write into it)`);
  mkdirSync(dir, { recursive: true });
  title ||= titleOf(dir);
  const scripts = inside(skillRoot, dir) ? relative(dir, here).split(sep).join("/") : here;
  const written = [];
  if (from) {
    const src = existsSync(resolve(from)) && statSync(resolve(from)).isDirectory() ? resolve(from) : join(skillRoot, "examples", from);
    if (!existsSync(src)) {
      const have = existsSync(join(skillRoot, "examples")) ? readdirSync(join(skillRoot, "examples")).filter((d) => statSync(join(skillRoot, "examples", d)).isDirectory()) : [];
      throw new Error(`no example "${from}"${have.length ? `; examples: ${have.join(", ")}` : " (examples/ is empty)"}`);
    }
    const walk = (d) => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : [f]; });
    for (const f of walk(src)) {
      const rel = relative(src, f).split(sep).join("/");
      if (SKIP.test(rel)) continue;
      const to = join(dir, rel);
      mkdirSync(dirname(to), { recursive: true });
      if (extname(f) === ".mjs" || extname(f) === ".js") writeFileSync(to, relocate(readFileSync(f, "utf8"), f, src, dirname(to)));
      else copyFileSync(f, to);
      written.push(to);
    }
    if (!existsSync(join(dir, "figure.mjs"))) throw new Error(`${src} has no figure.mjs`);
  } else {
    const t = readFileSync(join(here, "templates", "figure.mjs"), "utf8").replaceAll("__TITLE__", title).replaceAll("__SCRIPTS__", scripts);
    writeFileSync(join(dir, "figure.mjs"), t);
    written.push(join(dir, "figure.mjs"));
  }
  const readme = join(dir, "README.md");
  if (!existsSync(readme) || (force && !from)) {
    writeFileSync(readme, `# ${title}

One or two sentences: what this figure shows and what the reader should leave knowing.

- **Source:** the paper, book or docs it follows (also in \`meta.cite\`).
- **Scenarios:** what each tab demonstrates.
- **Invariants:** the properties verify checks on every step.

## Commands

\`\`\`sh
node ${scripts}/verify.mjs figure.mjs                 # headless checks: determinism, invariants, captions, param extremes
node ${scripts}/build.mjs figure.mjs                  # one self-contained page next to this file
node ${scripts}/build.mjs figure.mjs --serve          # live-reloading dev page
node ${scripts}/shoot.mjs <page>.html                 # screenshots of every phase, both themes, desktop + phone
node ${scripts}/audit.mjs <page>.html                 # label overflow, tags off-screen, focus outside the frame
node ${scripts}/record.mjs <page>.html --out figure.webm --captions
\`\`\`
`);
    written.push(readme);
  }
  return { dir, written, title };
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { from: "string", title: "string", force: "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  try {
    const r = scaffold(a._[0], a);
    for (const f of r.written) console.log(`wrote ${showPath(f)}`);
    // absolute paths: the command works from any directory (the figure folder, the skill, the project root)
    console.log(`next: node ${join(here, "verify.mjs")} ${resolve(r.dir, "figure.mjs")}`);
  } catch (e) {
    console.error(`error  ${e.message}`);
    process.exit(1);
  }
}
