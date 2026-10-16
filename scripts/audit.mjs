#!/usr/bin/env node
// Browser audit: renders every step (mid and end) at each size and runs window.__internals.audit() there:
// label overflow, tags off-screen or overlapping, focus outside the frame, frame time... (whatever the runtime
// checks). Page errors count as problems. Exit 1 when anything is found.
import "./lib/websocket.mjs";                // Node 20/21: re-run with --experimental-websocket
import { relative } from "node:path";
import { launch } from "./lib/cdp.mjs";
import { resolveTarget, openFigure, shotTimes, groupFindings, findingLine } from "./lib/figure-page.mjs";
import { parseArgs, parseSize, isMain } from "./lib/args.mjs";

const USAGE = `
usage: node scripts/audit.mjs <page.html | figure.mjs | url> [options]
  --sizes <list>       1440x900,390x844 (default)
  --themes <list>      themes to audit (default: the page's own theme)
  --scenario <id|all>  all (default) or one scenario id
  --at <what>          all (default: mid + end of every step) | steps | phases | list like 0,7,12.5s
  --runtime <file>     runtime for a figure-module target
  --budget <ms>        warn when the runtime's average frame time exceeds this (default 16)
  --json               machine-readable output
`;

export async function audit(target, o = {}) {
  const sizes = (o.sizes ?? ["1440x900", "390x844"]).map(parseSize);
  const t = await resolveTarget(target, { runtime: o.runtime });
  const browser = await launch();
  const found = [], errors = [], runs = [];
  try {
    for (const size of sizes) {
      const fp = await openFigure(browser, t.url, { ...size, dpr: 1 });
      const list = (await fp.scenarios()) ?? [];
      const ids = !o.scenario || o.scenario === "all" ? (list.length ? list.map((s) => s.id) : [null]) : [o.scenario];
      if (o.scenario && o.scenario !== "all" && list.length && !list.some((s) => s.id === o.scenario)) throw new Error(`no scenario "${o.scenario}"; the figure has: ${list.map((s) => s.id).join(", ")}`);
      for (const id of ids) {
        if (id && (ids.length > 1 || o.scenario)) await fp.setScenario(id);
        const info = await fp.info();
        for (const theme of o.themes ?? [null]) {
          if (theme) await fp.setTheme(theme);
          await fp.freeze();
          await fp.still();
          const where = `${id ?? "default"}${theme ? "/" + theme : ""}/${size.width}x${size.height}`;
          let n = 0;
          for (const s of shotTimes(info, o.at ?? "all")) {
            const e0 = fp.errors.length;
            await fp.renderAt(s.t, "settled");
            const probs = await fp.audit().catch((e) => [{ kind: "audit-error", message: e.message.split("\n")[0] }]);
            for (const p of probs) found.push({ ...p, step: p.step ?? s.step, where, t: s.t, caption: info.steps[p.step ?? s.step]?.caption ?? "" });
            for (const e of fp.errors.slice(e0)) errors.push({ ...e, where, step: s.step, caption: info.steps[s.step]?.caption ?? "" });
            n++;
          }
          const stats = await fp.stats().catch(() => ({}));
          runs.push({ where, frames: n, steps: info.steps.length, ms: stats.ms });
          if (Number.isFinite(stats.ms) && stats.ms > (o.budget ?? 16)) found.push({ kind: "frame-time", level: "warn", step: null, where, message: `average frame ${stats.ms.toFixed(1)} ms > ${o.budget ?? 16} ms budget` });
        }
      }
      await fp.close();
    }
    return { problems: found, errors, runs, target: t.name };
  } finally {
    browser.close();
    t.stop();
  }
}

export function report(r) {
  const lines = [`audit ${r.target}: ${r.runs.map((x) => `${x.where} ${x.frames} frames`).join(", ")}`];
  const fails = r.problems.filter((p) => p.level !== "warn"), warns = r.problems.filter((p) => p.level === "warn");
  const group = (items, label) => {
    if (!items.length) return;
    const groups = groupFindings(items);
    lines.push(`${label} (${groups.length} distinct, ${items.length} occurrences):`);
    for (const g of groups.slice(0, 60)) lines.push(findingLine(g));
    if (groups.length > 60) lines.push(`  … ${groups.length - 60} more`);
  };
  group(fails, "problems");
  group(warns, "warnings");
  if (r.errors.length) {
    const by = new Map();
    for (const e of r.errors) by.set(e.text, [...(by.get(e.text) ?? []), e]);
    lines.push(`page errors (${by.size} distinct):`);
    for (const [, es] of by) lines.push(`  [${es[0].type}] ${es[0].text.split("\n")[0]}  (first at step ${es[0].step}, ${es[0].where}${es.length > 1 ? `, ${es.length}x` : ""})`);
  }
  if (!fails.length && !r.errors.length) lines.push(`ok: no problems${warns.length ? `, ${warns.length} warning(s)` : ""}`);
  return lines.join("\n");
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { sizes: "list", themes: "list", scenario: "string", at: "string", runtime: "string", budget: "number", json: "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  try {
    const r = await audit(a._[0], a);
    console.log(a.json ? JSON.stringify(r, null, 2) : report(r));
    process.exit(r.problems.some((p) => p.level !== "warn") || r.errors.length ? 1 : 0);
  } catch (e) {
    console.error(`error  ${e.message}`);
    process.exit(1);
  }
}
