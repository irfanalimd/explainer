#!/usr/bin/env node
// Static dev server for the skill folder, with live reload.
//   node scripts/serve.mjs [--port 5173] [--root <dir>] [--allow <dir>]... [--no-live]
// ES modules do not load from file://, so every browser test page is opened through this.
//   /__live          server-sent events: one message per changed file (pages built with build.mjs --dev listen)
//   /@fs/<abs path>  files outside the root, inside an --allow directory (figures living in a user's project)
// Modules that import by absolute path, file:// URL or "@internals/<path>" get those specifiers rewritten to
// URLs this server serves, so every module has exactly one URL (one instance) in the page.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { extname, join, normalize, resolve, dirname, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { scanImports, rewriteImports, resolveSpecifier } from "./lib/modules.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");

const TYPES = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".webp": "image/webp",
  ".webm": "video/webm", ".mp4": "video/mp4", ".gif": "image/gif", ".jpg": "image/jpeg", ".wasm": "application/wasm",
};
const WATCHED = new Set([".mjs", ".js", ".css", ".html", ".json", ".woff2", ".svg"]);
const IGNORED = /(^|[\\/])(\.[^\\/]*|node_modules|shots|frames)([\\/]|$)/;

const within = (root, file) => { const r = relative(root, file); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

export function startServer({ dir, listen = 5173, allow = [], live = true, quiet = true } = {}) {
  dir = resolve(dir ?? skillRoot);
  const roots = [dir, skillRoot, ...allow.map((a) => resolve(a))];
  const clients = new Set();
  const serverId = Math.random().toString(36).slice(2);   // a restarted server makes pages reload on reconnect
  const urlOf = (file) => within(dir, file) ? "/" + relative(dir, file).split(sep).join("/") : "/@fs" + file.split(sep).join("/");

  async function moduleSource(file, viaFs) {
    const src = await readFile(file, "utf8");
    if (!viaFs && !/@internals\/|file:\/\/|(from|import)\s*\(?\s*["']\//.test(src)) return src;
    const { imports } = scanImports(src);
    return rewriteImports(src, imports, (imp) => {
      const relativeSpec = imp.spec.startsWith("./") || imp.spec.startsWith("../");
      if (relativeSpec && !viaFs) return null;
      try {
        const target = resolveSpecifier(imp.spec, file, { skillRoot });
        if (relativeSpec && !within(dir, target)) return null;        // stays beside its importer under /@fs
        return urlOf(target);
      } catch { return null; }                                        // let the browser report it
    });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname === "/__live") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(`retry: 500\nevent: hello\ndata: ${JSON.stringify({ id: serverId })}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
      const viaFs = url.pathname.startsWith("/@fs/");
      let path = viaFs ? normalize(decodeURIComponent(url.pathname.slice(4))) : normalize(join(dir, decodeURIComponent(url.pathname)));
      if (viaFs ? !roots.some((r) => within(r, path)) : !within(dir, path)) {
        res.writeHead(403, { "content-type": "text/plain" }).end(viaFs ? `outside the allowed roots; start serve.mjs with --allow ${dirname(path)}` : "forbidden");
        return;
      }
      const info = await stat(path).catch(() => null);
      if (info?.isDirectory()) path = join(path, "index.html");
      const ext = extname(path);
      const body = ext === ".mjs" || ext === ".js" ? await moduleSource(path, viaFs) : await readFile(path);
      res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream", "cache-control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });

  const watchers = [];
  if (live) {
    let pending = new Set(), timer = null;
    const flush = () => {
      for (const path of pending) for (const c of clients) c.write(`data: ${JSON.stringify({ path })}\n\n`);
      if (!quiet && pending.size) console.log(`changed ${[...pending].join(", ")} -> ${clients.size} page(s)`);
      pending = new Set();
    };
    for (const root of new Set(roots)) {
      try {
        watchers.push(watch(root, { recursive: true }, (_, name) => {
          if (!name || IGNORED.test(name) || !WATCHED.has(extname(name))) return;
          pending.add(urlOf(join(root, name)));
          clearTimeout(timer); timer = setTimeout(flush, 60);
        }));
      } catch {}
    }
    const ping = setInterval(() => { for (const c of clients) c.write(": ping\n\n"); }, 15000);
    ping.unref();
    server.on("close", () => { clearInterval(ping); for (const w of watchers) w.close(); });
  }
  const close = server.close.bind(server);
  server.close = (cb) => { for (const c of clients) c.end(); clients.clear(); for (const w of watchers) w.close(); return close(cb); };
  return new Promise((ok, fail) => { server.once("error", fail); server.listen(listen, "127.0.0.1", () => ok(server)); });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
  const allow = args.flatMap((a, i) => (a === "--allow" ? [args[i + 1]] : []));
  const root = resolve(opt("--root", skillRoot));
  const server = await startServer({ dir: root, listen: Number(opt("--port", 5173)), allow, live: !args.includes("--no-live"), quiet: false });
  console.log(`serving ${root} at http://127.0.0.1:${server.address().port}/` + (allow.length ? `  (also /@fs/ for ${allow.join(", ")})` : ""));
}
