#!/usr/bin/env node
// Drive bench.html in headless Chrome (the same launcher scripts/snap.mjs uses) and print a table.
//   node docs/next/research/bench/run.mjs [--quick] [--devfeat] [--out results.json]
// --devfeat adds --enable-webgpu-developer-features (unquantized WebGPU timestamps).
// Also measures the current product renderer (engine/gfx/gallery.html __bench, WebGL2) at the same size,
// and probes navigator.gpu / isSecureContext from a file:// URL.
import "../../../../scripts/lib/websocket.mjs";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, openPage, urlFor } from "../../../../scripts/lib/cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const outFile = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : resolve(here, "results.json");
const chromeArgs = has("--devfeat") ? ["--enable-webgpu-developer-features"] : [];

const base = { w: 2560, h: 1440 };
const configs = [];
for (const backend of ["webgpu", "webgl2"]) {
  configs.push({ backend, n: 300 });
  for (const e of ["ao", "ssr", "taa", "mb"]) configs.push({ backend, n: 300, extras: [e] });
  configs.push({ backend, n: 300, extras: ["ao", "ssr", "taa", "mb"] }, { backend, n: 300, msaa: 1 }, { backend, n: 300, msaa: 1, extras: ["taa"] });
  if (!has("--quick")) {
    configs.push({ backend, n: 5000 }, { backend, n: 20000, msaa: 1 }, { backend, n: 300, particles: 100000 }, { backend, n: 300, particles: 1000000 },
      { backend, n: 300, w: 1280, h: 720 });
  }
}

const browser = await launch({ args: chromeArgs });
const { url, stop } = await urlFor(resolve(here, "bench.html"));
const results = [];
try {
  // file:// probe: does WebGPU exist on a page opened from disk?
  const fp = await openPage(browser, pathToFileURL(resolve(here, "bench.html")).href, { width: 400, height: 300, dpr: 1 });
  const fileProbe = await fp.evaluate(`({ isSecureContext, gpu: !!navigator.gpu })`);
  await fp.close();
  console.log("file:// probe", JSON.stringify(fileProbe));
  results.push({ probe: "file://", ...fileProbe });

  const page = await openPage(browser, url, { width: 1280, height: 720, dpr: 1 });
  // trials are interleaved (every config once per trial) so background load on a shared machine hits all alike
  const trials = Number(args.includes("--trials") ? args[args.indexOf("--trials") + 1] : 3);
  const runs = configs.map(() => []);
  for (let tr = 0; tr < trials; tr++) {
    for (const [ci, c] of configs.entries()) {
      const o = { ...base, ...c };
      try { runs[ci].push(await page.evaluate(`window.__bench(${JSON.stringify(o)})`, { timeout: 180000 })); }
      catch (e) { console.log("FAILED", JSON.stringify(o), e.message.slice(0, 300)); runs[ci].push({ ...o, failed: e.message.slice(0, 300) }); }
    }
    console.log(`trial ${tr + 1}/${trials} done`);
  }
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  for (const [ci, rs] of runs.entries()) {
    const ok = rs.filter((x) => !x.failed);
    if (!ok.length) { results.push(rs[0]); continue; }
    const r = { ...ok[0], wallRuns: ok.map((x) => x.wallPerFrame), wallPerFrame: med(ok.map((x) => x.wallPerFrame)), wallMin: Math.min(...ok.map((x) => x.wallPerFrame)),
      passes: Object.fromEntries(Object.keys(ok[0].passes).map((k) => [k, med(ok.map((x) => x.passes[k]))])) };
    results.push(r);
    console.log(`${r.backend.padEnd(6)} n=${String(r.n).padEnd(5)} p=${String(r.particles).padEnd(7)} ${r.size} msaa${r.msaa} ${r.extras.padEnd(14)} wall med=${String(r.wallPerFrame).padEnd(7)} min=${String(r.wallMin).padEnd(7)} runs=${JSON.stringify(r.wallRuns)}  ts=${JSON.stringify(r.passes)} ${r.errors.length ? "ERR " + r.errors.join("; ") : ""}`);
  }
  await page.close();

  // the product's current WebGL2 renderer on its beauty scene, same pixel count (1280x720 css at dpr 2)
  const { url: gurl, stop: gstop } = await urlFor(resolve(here, "../../../../engine/gfx/gallery.html"));
  const gp = await openPage(browser, gurl + "?stats=1&still=1", { width: 1280, height: 720, dpr: 2 });
  await gp.evaluate("window.__ready");
  const reps = [];
  for (let k = 0; k < 3; k++) reps.push(await gp.evaluate("window.__throughput(120)", { timeout: 120000 }));
  const g = { ...reps[0], msPerFrameRuns: reps.map((x) => x.msPerFrame), msPerFrame: reps.map((x) => x.msPerFrame).sort((a, b) => a - b)[1] };
  g.timerQueryGpuMs = (await gp.evaluate("window.__bench(150)", { timeout: 120000 })).gpuMs;
  console.log("current renderer (gallery, WebGL2, 2560x1440)", JSON.stringify(g));
  results.push({ current: "gallery.html", size: "2560x1440", ...g });
  await gp.close(); gstop();
} finally {
  browser.close(); stop();
}
writeFileSync(outFile, JSON.stringify({ when: new Date().toISOString(), chromeArgs, results }, null, 1));
console.log(outFile);
process.exit(0);
