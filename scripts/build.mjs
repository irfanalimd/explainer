#!/usr/bin/env node
// Build one self-contained HTML page from a figure module (works from file://, no network).
//   node scripts/build.mjs <figure.mjs> [--out page.html] [--theme dark|light] [--runtime path] [--dev] [--serve] [--port 5173]
// Every module reachable from the figure and the runtime is inlined as a base64 data: URL in an import map;
// relative imports are rewritten to bare "@internals/<path>" specifiers (the figure is "@internals/figure").
// Fonts (Geist, Geist Mono) and engine/hud/hud.css are inlined. --dev references the source files over
// http instead (served by scripts/serve.mjs with live reload); --serve also starts that server.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, watch } from "node:fs";
import { dirname, resolve, join, basename, extname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectGraph, rewriteImports, tokenize, display, inside, toPosix, lessonBeside } from "./lib/modules.mjs";
import { parseArgs, fmtBytes, isMain } from "./lib/args.mjs";
import { PALETTE, THEMES } from "../engine/tokens.mjs";
import "./lib/node-hooks.mjs";               // "@internals/<path>" imports resolve when the figure is imported for its meta

const here = dirname(fileURLToPath(import.meta.url));
export const skillRoot = resolve(here, "..");
const DEFAULT_RUNTIME = join(skillRoot, "engine", "runtime.mjs");
const HUD_CSS = join(skillRoot, "engine", "hud", "hud.css");
const FONTS = [
  { family: "Geist", file: join(skillRoot, "assets", "fonts", "Geist-latin.woff2") },
  { family: "Geist Mono", file: join(skillRoot, "assets", "fonts", "GeistMono-latin.woff2") },
];

const USAGE = `
usage: node scripts/build.mjs <figure.mjs> [options]
  --out <file>        output page (default: next to the figure, <title-slug>.html; --dev: <title-slug>.dev.html)
  --theme dark|light  page theme (default: meta.theme, else light)
  --runtime <file>    runtime module exporting mount() (default: engine/runtime.mjs)
  --dev               reference source files over http instead of inlining (for scripts/serve.mjs live reload)
  --serve             --dev, then serve the skill with live reload and print the URL (--port, default 5173)
  --quiet             print only the output path
`;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const slug = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60);
const b64 = (buf) => Buffer.from(buf).toString("base64");
const scriptSafe = (s) => s.replace(/<\/(script)/gi, "<\\/$1").replace(/<!--/g, "<\\!--");

/** Read a figure's meta: import it in Node; if that fails (a dependency missing), evaluate the meta object literal from source. */
export async function loadMeta(figure) {
  try {
    const mod = await import(pathToFileURL(figure).href + "?meta=" + statSync(figure).mtimeMs);
    return { meta: mod.meta || {}, module: mod };
  } catch (err) {
    const src = readFileSync(figure, "utf8");
    const toks = tokenize(src);
    for (let k = 0; k < toks.length - 4; k++) {
      if (toks[k].value === "export" && toks[k + 2]?.value === "meta" && toks[k + 3]?.value === "=" && toks[k + 4]?.value === "{") {
        let depth = 0, end = -1;
        for (let j = k + 4; j < toks.length; j++) {
          if (toks[j].value === "{" && toks[j].type === "punct") depth++;
          if (toks[j].value === "}" && toks[j].type === "punct" && --depth === 0) { end = toks[j].end; break; }
        }
        try { return { meta: new Function(`return (${src.slice(toks[k + 4].start, end)})`)(), importError: err }; } catch {}
      }
    }
    return { meta: {}, importError: err };
  }
}

function fontFaces(urlFor) {
  return FONTS.map((f) => `@font-face{font-family:"${f.family}";src:url(${urlFor(f)}) format("woff2");font-weight:100 900;font-style:normal;font-display:block}`).join("\n");
}

// Inline relative url(...) references in a stylesheet as data: URLs.
function inlineCssUrls(css, cssFile, warnings) {
  const types = { ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp" };
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    if (/^(data:|https?:|#)/.test(u)) return m;
    const file = resolve(dirname(cssFile), u);
    if (!existsSync(file)) { warnings.push(`${display(cssFile, skillRoot)}: url(${u}) not found`); return m; }
    return `url(data:${types[extname(file)] ?? "application/octet-stream"};base64,${b64(readFileSync(file))})`;
  });
}

/** Dev URL of a file for scripts/serve.mjs rooted at the skill: /<path> inside the skill, /@fs/<absolute path> outside. */
export const devUrl = (file) => inside(skillRoot, file) ? "/" + toPosix(relative(skillRoot, file)) : "/@fs" + toPosix(resolve(file));

export const LIVE_CLIENT = `(() => {
  let id; const es = new EventSource("/__live");
  es.addEventListener("hello", (e) => { const v = JSON.parse(e.data).id; if (id && id !== v) location.reload(); id = v; });
  es.onmessage = (e) => {
    const { path } = JSON.parse(e.data);
    if (/\\.css$/.test(path)) for (const l of document.querySelectorAll('link[rel="stylesheet"]')) { const u = new URL(l.href); u.searchParams.set("v", Date.now()); l.href = u.href; }
    else location.reload();
  };
})();`;

/**
 * Build the page. Returns { html, out, theme, meta, stats, warnings } and writes `out` unless write === false.
 */
export async function buildPage(figurePath, { out, theme, runtime, dev = false, write = true } = {}) {
  const figure = resolve(figurePath);
  if (!existsSync(figure)) throw new Error(`figure not found: ${figurePath}`);
  const runtimeFile = resolve(runtime || DEFAULT_RUNTIME);
  if (!existsSync(runtimeFile)) throw new Error(runtime ? `runtime not found: ${runtime}` : `engine/runtime.mjs does not exist yet; pass --runtime <file> to build against another runtime`);
  const warnings = [];
  const { meta, importError } = await loadMeta(figure);
  if (importError) warnings.push(`figure did not import in Node (${importError.message.split("\n")[0]}); meta was read from the source`);
  if (!meta.title) warnings.push("meta.title is missing; the page title falls back to the file name");
  theme = theme || meta.theme || "light";
  if (!THEMES.includes(theme)) throw new Error(`theme must be one of ${THEMES.join(", ")}, got "${theme}"`);
  const title = meta.title || basename(figure, extname(figure));
  const name = slug(meta.title) || slug(basename(dirname(figure))) || "figure";
  out = resolve(out || join(dirname(figure), `${name}${dev ? ".dev" : ""}.html`));

  // the lesson beside the figure (CONTRACTS.md 10) rides along and is mounted as figure.lesson
  const lessonFile = lessonBeside(figure);
  const graph = collectGraph([figure, runtimeFile, ...(lessonFile ? [lessonFile] : [])], { skillRoot, figure });
  warnings.push(...graph.warnings);
  const runtimeSpec = graph.modules.get(runtimeFile).spec;
  const imports = {};
  let moduleBytes = 0, fontBytes = 0, cssBytes = 0;
  for (const m of [...graph.modules.values()].sort((a, b) => (a.spec < b.spec ? -1 : 1))) {
    if (dev) { imports[m.spec] = devUrl(m.file); continue; }
    const code = rewriteImports(m.source, m.imports, (imp) => graph.modules.get(imp.file).spec);
    imports[m.spec] = "data:text/javascript;base64," + b64(code);
    moduleBytes += imports[m.spec].length;
  }

  let fonts, hudCss = "";
  if (dev) fonts = fontFaces((f) => JSON.stringify(devUrl(f.file)));
  else fonts = fontFaces((f) => { const u = "data:font/woff2;base64," + b64(readFileSync(f.file)); fontBytes += u.length; return u; });
  const hasHud = existsSync(HUD_CSS);
  if (!hasHud) warnings.push("engine/hud/hud.css not found; the page ships without HUD styles");
  else if (!dev) { hudCss = inlineCssUrls(readFileSync(HUD_CSS, "utf8"), HUD_CSS, warnings); cssBytes = hudCss.length; }

  const P = PALETTE;
  const base = `:root{background:${P.dark.stage};color-scheme:dark}
html:has(#ix[data-theme="light"]){background:${P.light.stage};color-scheme:light}
html,body{margin:0;height:100%;overflow:hidden}
body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
#ix{position:fixed;inset:0;overflow:hidden}
#ix>.ix-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}`;

  const boot = `import { mount } from ${JSON.stringify(runtimeSpec)};
import * as figure from "@internals/figure";
${lessonFile ? `import { lesson } from ${JSON.stringify(graph.modules.get(lessonFile).spec)};\n` : ""}window.__ready = mount(document.getElementById("ix"), ${lessonFile ? "{ ...figure, lesson }" : "figure"}, { theme: ${JSON.stringify(theme)} });`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
${meta.subtitle ? `<meta name="description" content="${esc(meta.subtitle)}">\n` : ""}<meta name="theme-color" content="${P[theme].stage}">
<meta name="color-scheme" content="${theme}">
<meta name="generator" content="explainer build.mjs${dev ? " (dev)" : ""}">
<style>
${fonts}
${base}
</style>
${dev ? (hasHud ? `<link rel="stylesheet" href="${devUrl(HUD_CSS)}">` : "") : `<style>\n${hudCss.replace(/<\/style/gi, "<\\/style")}\n</style>`}
<script type="importmap">
${scriptSafe(JSON.stringify({ imports }, null, dev ? 2 : 0))}
</script>
</head>
<body>
<div id="ix" class="ix" data-theme="${theme}"><canvas class="ix-canvas"></canvas></div>
<noscript><p style="font:15px/1.5 system-ui;color:#8d929b;text-align:center;margin-top:40vh">This figure is interactive and needs JavaScript.</p></noscript>
<script type="module">
${boot}
</script>
${dev ? `<script type="module">\n${LIVE_CLIENT}\n</script>\n` : ""}</body>
</html>
`;
  if (write) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, html); }
  const stats = { bytes: Buffer.byteLength(html), modules: graph.modules.size, moduleBytes, fontBytes, cssBytes };
  return { html, out, theme, meta, stats, warnings, figure, runtime: runtimeFile, files: [...graph.modules.keys()] };
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { out: "string", theme: "string", runtime: "string", dev: "boolean", serve: "boolean", port: "number", quiet: "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  const dev = a.dev || a.serve;
  const run = async () => {
    const r = await buildPage(a._[0], { out: a.out, theme: a.theme, runtime: a.runtime, dev });
    if (!a.quiet) for (const w of r.warnings) console.log(`warn  ${w}`);
    const s = r.stats;
    console.log(a.quiet ? r.out : `${display(r.out, skillRoot)}  ${fmtBytes(s.bytes)}` + (dev ? `  (dev, ${s.modules} modules over http)` :
      `  (${s.modules} modules ${fmtBytes(s.moduleBytes)}, fonts ${fmtBytes(s.fontBytes)}, css ${fmtBytes(s.cssBytes)})`));
    return r;
  };
  try {
    const r = await run();
    if (a.serve) {
      const { startServer } = await import("./serve.mjs");
      const port = a.port ?? 5173;
      const server = await startServer({ dir: skillRoot, listen: port, allow: [dirname(r.figure), dirname(r.out)], live: true });
      console.log(`serving with live reload: http://127.0.0.1:${server.address().port}${devUrl(r.out)}`);
      let timer;   // the page itself only depends on the figure's meta: rebuild it when the figure changes
      watch(r.figure, () => { clearTimeout(timer); timer = setTimeout(() => run().catch((e) => console.error("error " + e.message)), 80); });
    }
  } catch (e) {
    console.error(`error  ${e.message}`);
    process.exit(1);
  }
}
