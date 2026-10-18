#!/usr/bin/env node
// Preflight: can this machine make figures? Checks what every later step needs and prints one fix per problem, for
// this OS, before any figure is written: Node, the skill's own files and fonts, a writable temp folder with room for
// Chrome, Chrome itself (found, started, and what it draws with: WebGPU, WebGL 2 or neither), the node the plugin's
// reader fence runs, ffmpeg for .mp4/.gif, and how fast this machine renders a figure (so a long shoot is no surprise).
//   node scripts/doctor.mjs [figure dir] [--quick] [--json]
// Exit 1 when something required is missing (warnings do not fail). Written for old Node too, so it can say so.
import * as fs from "node:fs";
const { existsSync, mkdtempSync, rmSync, writeFileSync, accessSync, constants } = fs;
import { tmpdir, cpus, totalmem, freemem, loadavg, platform, homedir } from "node:os";
import { join, resolve, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const skillRoot = resolve(here, "..");
const OS = platform() === "darwin" ? "mac" : platform() === "win32" ? "windows" : "linux";
const USAGE = `
usage: node scripts/doctor.mjs [figure dir] [options]
  --quick   skip starting Chrome (no WebGPU, WebGL 2 or speed check)
  --json    machine-readable output
Checks Node, the skill's files, a writable temp folder, Chrome, the GPU tiers, the fence hook's node, ffmpeg and speed.
`;

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) { console.log(USAGE.trim()); process.exit(0); }
const unknown = args.find((a) => a.startsWith("--") && !["--quick", "--json"].includes(a));
if (unknown) { console.error(`unknown option ${unknown}\n\n${USAGE.trim()}`); process.exit(2); }
const quick = args.includes("--quick"), json = args.includes("--json");
const figDir = args.find((a) => !a.startsWith("--"));

const results = [];
const add = (status, name, detail, fix) => results.push({ status, name, detail, fix: fix ?? null });
const FIX = {
  node: {
    mac: "brew install node@22   (or the installer from https://nodejs.org)",
    linux: "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs   (or nvm: nvm install 22)",
    windows: "winget install OpenJS.NodeJS.LTS   (or the installer from https://nodejs.org)",
  },
  chrome: {
    mac: "brew install --cask google-chrome   (or set CHROME_PATH to a Chrome or Chromium binary)",
    linux: "wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo apt-get install -y ./google-chrome-stable_current_amd64.deb   (Fedora: sudo dnf install chromium; or npx playwright install chromium, which this finds; or set CHROME_PATH)",
    windows: "winget install Google.Chrome   (or set CHROME_PATH to chrome.exe)",
  },
  ffmpeg: { mac: "brew install ffmpeg", linux: "sudo apt-get install -y ffmpeg", windows: "winget install Gyan.FFmpeg" },
};

// ---- Node
const [maj, min] = process.versions.node.split(".").map(Number);
const nodeOk = maj > 20 || (maj === 20 && min >= 10);
if (!nodeOk) add("fail", "node", `v${process.versions.node}; the scripts need 20.10 or newer (module hooks, the built-in WebSocket)`, FIX.node[OS]);
else add("ok", "node", `v${process.versions.node}${maj > 22 || (maj === 22 && min >= 4) ? "" : " (the browser scripts re-run themselves with --experimental-websocket)"}`);

// ---- the skill's own files
const need = ["SKILL.md", "engine/runtime.mjs", "engine/scene/index.mjs", "engine/hud/hud.css", "scripts/build.mjs", "assets/fonts/Geist-latin.woff2", "assets/fonts/GeistMono-latin.woff2"];
const missing = need.filter((f) => !existsSync(join(skillRoot, f)));
if (missing.length) add("fail", "skill", `missing ${missing.join(", ")} in ${skillRoot}`, "reinstall the skill (claude plugin update explainer, or git pull in the skill folder)");
else add("ok", "skill", `${skillRoot} (engine, scripts and the Geist fonts the build inlines)`);
// installed twice: Claude Code loads the plugin copy and reports the other as not loaded (README, Install)
const loose = join(homedir(), ".claude", "skills", "explainer", "SKILL.md");
if (process.env.CLAUDE_PLUGIN_ROOT && existsSync(loose) && resolve(dirname(loose)) !== skillRoot)
  add("warn", "install", `installed both as a plugin and in ${dirname(loose)}`, `remove one: rm -rf ${dirname(loose)}   (or /plugin uninstall explainer)`);

// ---- writable folders, and room for Chrome (a profile is about 150 MB while it runs; shots about 1 MB each)
const tmp = tmpdir();
try {
  const d = mkdtempSync(join(tmp, "explainer-doctor-"));
  writeFileSync(join(d, "x"), "x");
  rmSync(d, { recursive: true, force: true });
  let free = null;
  try { const s = fs.statfsSync(tmp); free = s.bavail * s.bsize; } catch {}   // Node 18.15+
  const gb = free == null ? "" : `, ${(free / 2 ** 30).toFixed(1)} GB free`;
  if (free != null && free < 1 * 2 ** 30) add("warn", "temp", `${tmp}${gb}: Chrome needs about 150 MB a run, a full shoot several hundred MB more`, `free some space, or point TMPDIR at a bigger disk: TMPDIR=~/tmp node scripts/shoot.mjs …`);
  else add("ok", "temp", `${tmp} is writable${gb}`);
} catch (e) { add("fail", "temp", `${tmp} is not writable: ${e.message}`, "set TMPDIR to a folder you can write, e.g. export TMPDIR=~/tmp && mkdir -p ~/tmp"); }
if (figDir) {
  const d = resolve(figDir);
  const probe = existsSync(d) ? d : dirname(d);
  try { accessSync(probe, constants.W_OK); add("ok", "folder", `${d} is writable (the page, shots and report go here)`); }
  catch { add("fail", "folder", `${d} is not writable`, `pick a folder you own, e.g. node scripts/new.mjs ~/figs/<name>`); }
}

// ---- the plugin's reader fence runs `node` from the hook shell's PATH; if it cannot, the readers are not blind
const onPath = which(OS === "windows" ? "node.exe" : "node");
if (!onPath) add("warn", "fence", "no node on PATH: the plugin's reader fence (hooks/hooks.json) runs `node`, so it would block the review agents' tools", `put node on PATH (it is at ${process.execPath})`);
else add("ok", "fence", `the reader fence's node: ${onPath}`);

// ---- ffmpeg (optional: .mp4 and .gif video; .webm and everything else need nothing)
const ff = which(OS === "windows" ? "ffmpeg.exe" : "ffmpeg");
add(ff ? "ok" : "info", "ffmpeg", ff ? ff : "not found: record.mjs makes .webm without it; .mp4 and .gif need it", ff ? null : FIX.ffmpeg[OS]);

// ---- the machine
const cores = cpus().length, load = loadavg()[0];
const busy = OS !== "windows" && load > cores;
add(busy ? "warn" : "ok", "machine", `${cores} cores, ${(totalmem() / 2 ** 30).toFixed(0)} GB (${(freemem() / 2 ** 30).toFixed(1)} GB free)${OS !== "windows" ? `, load ${load.toFixed(1)}` : ""}`,
  busy ? "other jobs are using the CPU: screenshots and audits will run slower than the estimate below" : null);

// ---- Chrome: found, started, and what it draws with
let chromeInfo = null;
if (nodeOk) {
  const { findChrome } = await import("./lib/cdp.mjs");
  const found = findChrome();
  if (!found.path) {
    add("fail", "chrome", found.bad ? `CHROME_PATH=${found.bad} does not exist` : `not found (looked in the usual places, on PATH and in the Playwright and Puppeteer caches)`,
      found.bad ? "fix CHROME_PATH, or unset it to let the scripts look for Chrome" : FIX.chrome[OS]);
  } else {
    const v = spawnSync(found.path, ["--version"], { encoding: "utf8", timeout: 15000 });
    const version = (v.stdout || "").trim() || "version unknown";
    add("ok", "chrome", `${found.path} (${version}; found ${found.how === "CHROME_PATH" ? "through CHROME_PATH" : found.how === "PATH" ? "on PATH" : found.how === "cache" ? "in a test-browser cache" : "installed"})`);
    if (!quick) chromeInfo = await probeChrome(found.path);
  }
}
if (chromeInfo?.error) add("fail", "headless", `Chrome did not start headless: ${chromeInfo.error.split("\n")[0]}`,
  OS === "linux" ? "missing system libraries are the usual cause: npx playwright install-deps chromium   (or sudo apt-get install -y libnss3 libatk-bridge2.0-0 libgbm1 libxkbcommon0 libasound2)" : "start Chrome once by hand to finish its setup, then run this again");
else if (chromeInfo) {
  const { webgpu, webgl2, software } = chromeInfo;
  if (webgpu) add("ok", "webgpu", `headless Chrome draws with WebGPU (${webgpu})`);
  else add("info", "webgpu", `not in headless Chrome here: pages and shots use the WebGL 2 tier, which leaves out some looks (glass, reflections)`);
  if (webgl2) add(software ? "warn" : "ok", "webgl2", `${webgl2}${software ? ": software rendering, no GPU" : ""}`, software ? "fine for checks; screenshots are slow (see speed). A machine with a GPU makes them several times faster" : null);
  else if (!webgpu) add("fail", "gpu", "neither WebGPU nor WebGL 2 in headless Chrome: pages show only their captions and controls, and shots are empty", "update Chrome, or run on a machine with a GPU");
  if (chromeInfo.frameMs != null) {
    const ms = chromeInfo.frameMs, perShot = Math.max(0.4, ms * 3 / 1000 + 0.25);
    // MapReduce as the yardstick: 160 frozen shots; --teach plays about 40 cards live, each a few seconds of the run
    const shoot = 160 * perShot, teach = 40 * (6 * Math.max(1, ms / 50) / 1 + 3);
    const mins = (s) => s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`;
    add(ms > 120 ? "warn" : "ok", "speed", `a settled 1440×900 render of MapReduce (about one screenshot) takes ${ms.toFixed(0)} ms: shoot (both themes and sizes) about ${mins(shoot)}, with --teach about ${mins(shoot + teach)}`,
      ms > 120 ? "use node scripts/check.mjs (the quick tier) while you work, and run check --full and shoot --teach in the background" : null);
  }
}

// ---- report
const order = { fail: 0, warn: 1, info: 2, ok: 3 };
const fails = results.filter((r) => r.status === "fail").length, warns = results.filter((r) => r.status === "warn").length;
if (json) console.log(JSON.stringify({ ok: !fails, os: OS, results }, null, 2));
else {
  const tagOf = { ok: "ok  ", warn: "WARN", fail: "FAIL", info: "info" };
  console.log(`doctor  ${skillRoot}`);
  for (const r of results) {
    console.log(`  ${tagOf[r.status]}  ${r.name.padEnd(9)} ${r.detail}`);
    if (r.fix) console.log(`        ${"".padEnd(9)} fix: ${r.fix}`);
  }
  console.log(`summary ${fails ? `${fails} problem(s)` : "ready to make figures"}${warns ? `, ${warns} warning(s)` : ""}${quick ? " (--quick: Chrome was not started)" : ""}`);
}
process.exit(fails ? 1 : 0);

function which(name) {
  for (const d of String(process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    const p = join(d, name);
    try { accessSync(p, constants.X_OK); return p; } catch {}
  }
  return null;
}

/** Start headless Chrome the way the scripts do; ask for WebGPU and WebGL 2; time a frame of MapReduce. */
async function probeChrome() {
  await import("./lib/websocket.mjs");
  const { launch, openPage } = await import("./lib/cdp.mjs");
  let browser;
  try { browser = await launch({ timeout: 20000 }); }
  catch (e) { return { error: e.message }; }
  try {
    const page = await openPage(browser, "about:blank", { width: 400, height: 300, dpr: 1 });
    const gpu = await page.evaluate(`(async () => {
      let webgpu = null, webgl2 = null;
      try { const a = navigator.gpu && await navigator.gpu.requestAdapter(); if (a) { const i = a.info ?? (a.requestAdapterInfo ? await a.requestAdapterInfo() : {}); webgpu = [i.vendor, i.architecture, i.description].filter(Boolean).join(" ") || "an adapter"; } } catch {}
      try { const g = document.createElement("canvas").getContext("webgl2"); if (g) { const x = g.getExtension("WEBGL_debug_renderer_info"); webgl2 = x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); } } catch {}
      return { webgpu, webgl2 };
    })()`, { timeout: 20000 });
    await page.close();
    const software = /swiftshader|llvmpipe|software|basic render/i.test(`${gpu.webgl2 ?? ""} ${gpu.webgpu ?? ""}`);
    let frameMs = null;
    try { frameMs = await frameTime(browser); } catch {}
    return { ...gpu, software, frameMs };
  } catch (e) { return { error: e.message }; }
  finally { browser.close(); }
}

// build MapReduce to a temp page and time settled renders: the cost of one screenshot, near enough
async function frameTime(browser) {
  const { buildPage } = await import("./build.mjs");
  const { openFigure } = await import("./lib/figure-page.mjs");
  const dir = mkdtempSync(join(tmpdir(), "explainer-doctor-"));
  try {
    const r = await buildPage(join(skillRoot, "examples", "mapreduce", "figure.mjs"), { out: join(dir, "page.html"), quiet: true });
    const fp = await openFigure(browser, "file://" + r.out, { width: 1440, height: 900, dpr: 1 });
    await fp.freeze(); await fp.renderAt(1, "settled");
    const t0 = performance.now();
    for (const t of [20, 40, 60]) await fp.renderAt(t, "settled");
    const ms = (performance.now() - t0) / 3;
    await fp.close();
    return ms;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
