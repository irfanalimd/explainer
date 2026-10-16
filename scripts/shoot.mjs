#!/usr/bin/env node
// Deterministic screenshots of a figure page through window.__internals (freeze + renderAt, settled camera),
// across themes, sizes and scenarios, plus a contact sheet. Reports page errors and audit problems per shot.
import "./lib/websocket.mjs";                // Node 20/21: re-run with --experimental-websocket
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { launch } from "./lib/cdp.mjs";
import { resolveTarget, openFigure, shotTimes, plainCaption, clip, groupFindings, findingLine } from "./lib/figure-page.mjs";
import { parseArgs, parseSize, isMain, showPath } from "./lib/args.mjs";

const USAGE = `
usage: node scripts/shoot.mjs <page.html | figure.mjs | url> [options]
  --at <what>          phases (default): mid and end of every phase
                       all: mid and end of every step;  steps: end of every step
                       a list: step indices (mid + end), times like 4.5s, or end   e.g. --at 0,7,12.5s,end
  --themes <list>      dark,light (default both)
  --sizes <list>       1440x900,390x844 (default); presets: desktop, phone, 1080p, vertical, square
  --scenario <id|all>  scenario to shoot (default: all)
  --out <dir>          output directory (default: shots/ next to the page)
  --dpr <n>            device pixel ratio (default 1; use 2 to judge text crispness)
  --camera <mode>      settled (default) | auto
  --runtime <file>     runtime for a figure-module target (default engine/runtime.mjs)
  --clean              delete existing PNGs in the output directory first
  --no-sheet           skip the contact sheet
Files: <scenario>-<theme>-<w>x<h>-<step>-<mid|end|tN.NNs>.png, contact.png (contact-2.png… when long).
`;

export async function shoot(target, o = {}) {
  const sizes = (o.sizes ?? ["1440x900", "390x844"]).map(parseSize);
  const themes = o.themes ?? ["dark", "light"];
  const t = await resolveTarget(target, { runtime: o.runtime });
  const outDir = resolve(o.out ?? (t.built ? "shots" : join(dirname(resolve(target)), "shots")));
  mkdirSync(outDir, { recursive: true });
  if (o.clean) for (const f of readdirSync(outDir)) if (f.endsWith(".png")) rmSync(join(outDir, f));
  const browser = await launch();
  const shots = [], problems = [], errors = [];
  let title = "";
  try {
    for (const size of sizes) {
      const fp = await openFigure(browser, t.url, { ...size, dpr: o.dpr ?? 1 });
      const list = (await fp.scenarios()) ?? [];
      title ||= await fp.page.evaluate("document.title").catch(() => "");
      let ids = !o.scenario || o.scenario === "all" ? (list.length ? list.map((s) => s.id) : ["default"]) : [o.scenario];
      if (o.scenario && o.scenario !== "all" && list.length && !list.some((s) => s.id === o.scenario)) throw new Error(`no scenario "${o.scenario}"; the figure has: ${list.map((s) => s.id).join(", ")}`);
      if (!ids.length) ids = ["default"];
      for (const id of ids) {
        if (o.scenario || list.length > 1) if (id !== "default") await fp.setScenario(id);
        const info = await fp.info();
        const times = shotTimes(info, o.at ?? "phases");
        for (const theme of themes) {
          await fp.setTheme(theme);
          await fp.freeze();
          await fp.still();
          for (const s of times) {
            const errBefore = fp.errors.length;
            const r = await fp.renderAt(s.t, o.camera ?? "settled");
            const name = `${id}-${theme}-${size.width}x${size.height}-${String(s.step).padStart(3, "0")}-${s.tag}.png`;
            await fp.page.shot(join(outDir, name));
            const audit = await fp.audit().catch((e) => [{ kind: "audit-error", message: e.message }]);
            const caption = r?.caption ?? info.steps[s.step]?.caption ?? "";
            shots.push({ file: name, scenario: id, theme, size, step: s.step, tag: s.tag, t: s.t, phase: s.phase, caption });
            for (const p of audit) problems.push({ ...p, shot: name, step: p.step ?? s.step, caption });
            for (const e of fp.errors.slice(errBefore)) errors.push({ ...e, shot: name, step: s.step });
          }
        }
      }
      for (const e of fp.errors) if (!errors.some((x) => x.text === e.text)) errors.push({ ...e, shot: `boot ${size.width}x${size.height}` });
      await fp.close();
    }
    let sheets = [];
    if (o.sheet !== false && shots.length) sheets = await contactSheet(browser, outDir, shots, title || t.name);
    return { outDir, shots, sheets, problems, errors };
  } finally {
    browser.close();
    t.stop();
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Lay the PNGs out in an HTML grid page (grouped by scenario, theme, size) and screenshot it, in pages under 14000 px.
async function contactSheet(browser, outDir, shots, title) {
  const groups = [];
  for (const s of shots) {
    const key = `${s.scenario} · ${s.theme} · ${s.size.width}×${s.size.height}`;
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, size: s.size, theme: s.theme, items: [] }));
    g.items.push(s);
  }
  const W = 1600, gap = 14, pad = 28;
  const thumb = (sz) => (sz.width >= sz.height ? { w: 360, h: Math.round((360 * sz.height) / sz.width) } : { h: 300, w: Math.round((300 * sz.width) / sz.height) });
  const pages = [[]];
  let y = 80;
  for (const g of groups) {
    const th = thumb(g.size), perRow = Math.max(1, Math.floor((W - 2 * pad + gap) / (th.w + gap))), rowH = th.h + 58;
    const rows = [];
    for (let i = 0; i < g.items.length; i += perRow) rows.push(g.items.slice(i, i + perRow));
    let part = { ...g, th, rows: [] };
    y += 44;
    for (const row of rows) {
      if (y + rowH > 14000 && (part.rows.length || pages[pages.length - 1].length)) {
        if (part.rows.length) pages[pages.length - 1].push(part);
        pages.push([]); part = { ...g, th, rows: [], cont: true }; y = 80 + 44;
      }
      part.rows.push(row); y += rowH;
    }
    if (part.rows.length) pages[pages.length - 1].push(part);
  }
  const files = [];
  for (const [n, parts] of pages.entries()) {
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#141518;color:#e6e7ea;font:13px/1.35 -apple-system,system-ui,sans-serif;padding:${pad}px;width:${W - 2 * pad}px}
      h1{font-size:18px;font-weight:600;margin:0 0 4px} .sub{color:#8d929b;font-size:12px;margin-bottom:14px}
      h2{font:600 12px ui-monospace,Menlo,monospace;letter-spacing:.06em;color:#b9bcc3;margin:22px 0 10px;text-transform:uppercase}
      .row{display:flex;gap:${gap}px;margin-bottom:12px} figure{margin:0}
      img{display:block;border-radius:6px;box-shadow:0 0 0 1px rgba(255,255,255,.08)} .light img{box-shadow:0 0 0 1px rgba(0,0,0,.2)}
      figcaption{margin-top:6px;font-size:11px;color:#9a9ea6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
      figcaption b{font:600 11px ui-monospace,Menlo,monospace;color:#e6e7ea;margin-right:6px}
    </style><body><h1>${esc(title)}</h1><div class="sub">${shots.length} shots${pages.length > 1 ? ` · sheet ${n + 1} of ${pages.length}` : ""}</div>
    ${parts.map((p) => `<h2>${esc(p.key)}${p.cont ? " (cont.)" : ""}</h2>${p.rows.map((row) => `<div class="row ${p.theme}">${row.map((s) => `<figure style="width:${p.th.w}px">
      <img src="${esc(s.file)}" width="${p.th.w}" height="${p.th.h}"><figcaption><b>${String(s.step).padStart(3, "0")} ${esc(s.tag)} · ${s.t.toFixed(2)}s${s.phase ? " · " + esc(s.phase) : ""}</b>${esc(clip(plainCaption(s.caption), 110))}</figcaption></figure>`).join("")}</div>`).join("")}`).join("")}`;
    const name = n ? `contact-${n + 1}` : "contact";
    writeFileSync(join(outDir, `${name}.html`), html);
    const { openPage } = await import("./lib/cdp.mjs");
    const page = await openPage(browser, "file://" + join(outDir, `${name}.html`), { width: W, height: 800, dpr: 1 });
    await page.evaluate("Promise.all([...document.images].map((i) => i.decode().catch(() => null))).then(() => true)");
    const h = await page.evaluate("Math.ceil(document.documentElement.scrollHeight)");
    await page.setViewport(W, Math.min(16000, h), 1);
    await page.shot(join(outDir, `${name}.png`));
    await page.close();
    rmSync(join(outDir, `${name}.html`));
    files.push(join(outDir, `${name}.png`));
  }
  return files;
}

export function report(r, { cwd = process.cwd() } = {}) {
  const rel = (p) => showPath(p);
  const lines = [`shot ${r.shots.length} PNGs -> ${rel(r.outDir)}/`];
  for (const s of r.sheets) lines.push(`sheet ${rel(s)}`);
  if (r.errors.length) {
    lines.push(`page errors (${r.errors.length}):`);
    const seen = new Map();
    for (const e of r.errors) { const k = e.type + e.text; seen.set(k, [...(seen.get(k) ?? []), e]); }
    for (const [, es] of seen) lines.push(`  [${es[0].type}] ${es[0].text.split("\n")[0]}  (${es.length}x, first at ${es[0].shot})`);
  }
  if (r.problems.length) {
    const groups = groupFindings(r.problems, (p) => p.shot.replace(/\.png$/, ""));
    lines.push(`audit problems (${groups.length} distinct, in ${new Set(r.problems.map((p) => p.shot)).size} of ${r.shots.length} shots; run audit.mjs for every step):`);
    for (const g of groups.slice(0, 40)) lines.push(findingLine(g));
    if (groups.length > 40) lines.push(`  … ${groups.length - 40} more`);
  }
  if (!r.errors.length && !r.problems.length) lines.push("no page errors, no audit problems");
  return lines.join("\n");
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { at: "string", themes: "list", sizes: "list", scenario: "string", out: "string", dpr: "number", camera: "string", runtime: "string", clean: "boolean", sheet: "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  try {
    const r = await shoot(a._[0], a);
    console.log(report(r));
    process.exit(r.errors.length ? 1 : 0);
  } catch (e) {
    console.error(`error  ${e.message}`);
    process.exit(1);
  }
}
