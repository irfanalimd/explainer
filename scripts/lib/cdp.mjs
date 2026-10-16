// Headless Chrome over the DevTools protocol, with Node's built-in WebSocket. No dependencies.
//   const browser = await launch();
//   const page = await openPage(browser, url, { width, height, dpr, onConsole });
//   await page.evaluate("1 + 1"); await page.shot("x.png"); await page.close(); browser.close();
// Page errors (console.error, uncaught exceptions, failed loads) are collected in page.errors.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, relative, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const skillRoot = resolve(here, "..", "..");

export const CHROME = process.env.CHROME_PATH || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find((p) => existsSync(p));

const live = new Set();
process.on("exit", () => { for (const b of live) b.close(); });

export async function launch({ args = [], timeout = 20000 } = {}) {
  if (!CHROME) throw new Error("Chrome not found. Install Google Chrome or set CHROME_PATH to a Chrome/Chromium binary.");
  const profile = mkdtempSync(join(tmpdir(), "explainer-chrome-"));
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars", "--allow-file-access-from-files", "--mute-audio",
    "--ignore-gpu-blocklist", "--enable-gpu", "--enable-unsafe-swiftshader", "--use-angle=metal",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    ...(process.platform === "linux" ? ["--no-sandbox"] : []), ...args, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  const wsUrl = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("Chrome did not start within " + timeout + " ms:\n" + stderr.slice(-2000))), timeout);
    chrome.on("exit", (code) => { clearTimeout(timer); fail(new Error(`Chrome exited (${code}) before DevTools was ready:\n${stderr.slice(-2000)}`)); });
    chrome.stderr.on("data", (d) => {
      stderr += d;
      const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); ok(m[1]); }
    });
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.addEventListener("open", ok, { once: true }); ws.addEventListener("error", () => fail(new Error("DevTools socket failed")), { once: true }); });
  let id = 0, closed = false;
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
    close: () => {
      if (!live.has(browser)) return;
      live.delete(browser);
      try { ws.close(); } catch {}
      chrome.kill();
      setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300).unref?.();
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
