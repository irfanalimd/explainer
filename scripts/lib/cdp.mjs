// Headless Chrome over the DevTools protocol, with Node's built-in WebSocket. No dependencies.
//   const browser = await launch();
//   const page = await openPage(browser, url, { width, height, dpr, onConsole });
//   await page.evaluate("1 + 1"); await page.shot("x.png"); await page.close(); browser.close();
// Page errors (console.error, uncaught exceptions, failed loads) are collected in page.errors.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve, relative, dirname, isAbsolute, delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const skillRoot = resolve(here, "..", "..");

/**
 * Find a Chrome or Chromium to drive: CHROME_PATH, then the usual install places on macOS, Linux and Windows, then
 * the names on PATH, then the browsers Playwright and Puppeteer download into their caches.
 * Returns { path, how } or { path: null, tried: [...] }. scripts/doctor.mjs prints what it tried and how to fix it.
 */
export function findChrome(env = process.env) {
  const tried = [];
  const ok = (p, how) => { tried.push(p); try { return existsSync(p) && statSync(p).isFile() ? { path: p, how } : null; } catch { return null; } };
  if (env.CHROME_PATH) return ok(env.CHROME_PATH, "CHROME_PATH") ?? { path: null, tried, bad: env.CHROME_PATH };
  const home = homedir(), pf = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
  const fixed = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/snap/bin/chromium", "/opt/google/chrome/chrome",
    ...pf.flatMap((d) => [join(d, "Google/Chrome/Application/chrome.exe"), join(d, "Chromium/Application/chrome.exe")]),
  ];
  for (const p of fixed) { const r = ok(p, "installed"); if (r) return r; }
  const names = process.platform === "win32" ? ["chrome.exe"] : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
  for (const dir of String(env.PATH ?? "").split(delimiter).filter(Boolean)) for (const n of names) { const r = ok(join(dir, n), "PATH"); if (r) return r; }
  // browsers downloaded by test tools (npx playwright install chromium, npx puppeteer browsers install chrome)
  const caches = [
    [join(env.PLAYWRIGHT_BROWSERS_PATH || (process.platform === "darwin" ? join(home, "Library/Caches/ms-playwright") : join(home, ".cache/ms-playwright"))), /^chromium-\d+$/,
      ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium", "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium", "chrome-win/chrome.exe"]],
    [join(home, ".cache/puppeteer/chrome"), /./,
      ["chrome-linux64/chrome", "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing", "chrome-win64/chrome.exe"]],
  ];
  for (const [dir, re, subs] of caches) {
    let builds = [];
    try { builds = readdirSync(dir).filter((d) => re.test(d)).sort().reverse(); } catch {}
    for (const b of builds) for (const sub of subs) { const r = ok(join(dir, b, sub), "cache"); if (r) return r; }
  }
  return { path: null, tried };
}

const found = findChrome();
export const CHROME = found.path;
const CHROME_HINT = "Run node " + join(skillRoot, "scripts", "doctor.mjs") + " to see what is missing on this machine and how to fix it.";

// every Chrome this process started, until its profile is gone: killed and cleaned on exit, Ctrl-C included
const live = new Set();
process.on("exit", () => { for (const b of [...live]) b.kill(); });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(sig, () => { for (const b of [...live]) b.kill(); process.exit(128 + (sig === "SIGINT" ? 2 : sig === "SIGTERM" ? 15 : 1)); });

export async function launch({ args = [], timeout = 20000 } = {}) {
  if (!CHROME) throw new Error(found.bad ? `CHROME_PATH is set to ${found.bad}, which does not exist.\n${CHROME_HINT}` : `Chrome not found (needed for screenshots, audit, video and the review packet). Install Google Chrome or Chromium, or set CHROME_PATH to one.\n${CHROME_HINT}`);
  const profile = mkdtempSync(join(tmpdir(), "explainer-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars", "--allow-file-access-from-files", "--mute-audio",
    "--ignore-gpu-blocklist", "--enable-gpu", "--enable-unsafe-swiftshader", "--use-angle=metal",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    ...(process.platform === "linux" ? ["--no-sandbox"] : []), ...args, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  const removeProfile = () => { try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch {} };
  const started = new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("Chrome did not start within " + timeout + " ms:\n" + stderr.slice(-2000))), timeout);
    chrome.on("error", (e) => { clearTimeout(timer); fail(new Error(`could not run ${CHROME}: ${e.message}`)); });
    chrome.on("exit", (code) => { clearTimeout(timer); fail(new Error(`Chrome exited (${code}) before DevTools was ready:\n${stderr.slice(-2000)}`)); });
    chrome.stderr.on("data", (d) => {
      stderr += d;
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); ok(m[1]); }
    });
  });
  // a Chrome that never came up leaves nothing behind either
  const wsUrl = await started.catch((e) => { try { chrome.kill("SIGKILL"); } catch {} removeProfile(); throw new Error(`${e.message}\n${CHROME_HINT}`); });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", () => fail(new Error("DevTools socket failed")), { once: true }); });
  let id = 0, closed = false, closing = false;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString());
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail, method } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? fail(new Error(`${method}: ${msg.error.message}${msg.error.data ? " (" + msg.error.data + ")" : ""}`)) : ok(msg.result);
    } else for (const fn of [...listeners]) fn(msg);
  });
  ws.addEventListener("close", () => {
    closed = true;
    for (const { fail, method } of pending.values()) fail(new Error(`${method}: Chrome connection closed`));
    pending.clear();
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    if (closed) return fail(new Error(`${method}: Chrome connection closed`));
    const mid = ++id;
    pending.set(mid, { ok, fail, method });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const browser = {
    send,
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    // The profile (about 150 MB once a page has drawn) must go even when the script exits right after: an unref'd timer
    // never fires then, and /tmp is often RAM. So remove it as soon as Chrome has exited, and on the way out of the
    // process kill Chrome outright and remove it synchronously.
    close: () => {
      if (closing) return;
      closing = true;
      try { ws.close(); } catch {}
      const gone = () => { removeProfile(); live.delete(browser); };
      if (chrome.exitCode !== null || chrome.signalCode !== null) gone();
      else { chrome.once("exit", gone); chrome.kill(); }
    },
    kill: () => {
      closing = true;
      live.delete(browser);
      try { ws.close(); } catch {}
      try { chrome.kill("SIGKILL"); } catch {}
      removeProfile();
    },
    get stderr() { return stderr; },
  };
  live.add(browser);
  return browser;
}

/**
 * Open a tab, size it, navigate, wait for the load event.
 * onConsole(type, text) sees every console message, exception and failed load ("exception", "network").
 */
export async function openPage(browser, url, { width = 1440, height = 900, dpr = 2, mobile, onConsole, timeout = 30000 } = {}) {
  // each page gets its own window: a background tab stops requestAnimationFrame, which capture waits on
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => browser.send(m, p, sessionId);
  const errors = [];
  const report = (type, text) => {
    if (type === "error" || type === "exception" || type === "network") errors.push({ type, text });
    onConsole?.(type, text);
  };
  let loaded = null;
  const off = browser.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    const p = msg.params;
    if (msg.method === "Runtime.consoleAPICalled") report(p.type, p.args.map((a) => a.value ?? a.description ?? a.unserializableValue ?? "").join(" "));
    else if (msg.method === "Runtime.exceptionThrown") {
      const d = p.exceptionDetails;
      report("exception", (d.exception?.description ?? d.text) + (d.url ? ` (${shortUrl(d.url)}:${d.lineNumber + 1})` : ""));
    } else if (msg.method === "Log.entryAdded" && p.entry.level === "error") report("network", p.entry.text + (p.entry.url ? " " + shortUrl(p.entry.url) : ""));
    else if (msg.method === "Page.loadEventFired") loaded?.();
  });
  await s("Runtime.enable");
  await s("Page.enable");
  await s("Log.enable");
  await s("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  const setViewport = (w, h, d = dpr) => s("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: d, mobile: mobile ?? w < 600 });
  await setViewport(width, height, dpr);
  const loadedP = new Promise((ok) => { loaded = ok; });
  const nav = await s("Page.navigate", { url });
  if (nav.errorText) throw new Error(`could not open ${url}: ${nav.errorText}`);
  await Promise.race([loadedP, new Promise((ok) => setTimeout(ok, timeout))]);

  const evaluate = async (expression, { timeout: ms = 0 } = {}) => {
    const run = s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    const r = ms ? await Promise.race([run, new Promise((_, fail) => setTimeout(() => fail(new Error(`timed out after ${ms} ms: ${expression.slice(0, 80)}`)), ms))]) : await run;
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const png = async ({ clip, format = "png", quality, beyond = false, fast = false } = {}) => {
    const r = await s("Page.captureScreenshot", { format, ...(quality ? { quality } : {}), captureBeyondViewport: beyond, ...(clip ? { clip: { scale: 1, ...clip } } : {}), optimizeForSpeed: fast });
    return Buffer.from(r.data, "base64");
  };
  const shot = async (out, clip, opts = {}) => { writeFileSync(out, await png({ clip, ...opts })); return out; };
  const waitFor = async (expression, { timeout: ms = 15000, every = 50 } = {}) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await evaluate(expression).catch(() => undefined);
      if (v) return v;
      if (Date.now() > end) return undefined;
      await new Promise((r) => setTimeout(r, every));
    }
  };
  return {
    send: s, evaluate, shot, png, waitFor, setViewport, errors, sessionId, targetId,
    close: async () => { off(); await browser.send("Target.closeTarget", { targetId }).catch(() => {}); },
  };
}

function shortUrl(u) {
  if (u.startsWith("data:")) return u.slice(0, 40) + "…";
  return u.length > 120 ? "…" + u.slice(-110) : u;
}

/** A URL for a path or URL. Paths inside the skill folder are served over http (ES modules need http); others use file://. */
export async function urlFor(target) {
  if (/^(https?|file|data|about):/.test(target)) return { url: target, stop: () => {} };
  const abs = resolve(target);
  const rel = relative(skillRoot, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) return { url: pathToFileURL(abs).href, stop: () => {} };
  const { startServer } = await import("../serve.mjs");
  const server = await startServer({ dir: skillRoot, listen: 0, quiet: true });
  return { url: `http://127.0.0.1:${server.address().port}/${rel.split("\\").join("/")}`, stop: () => server.close() };
}
