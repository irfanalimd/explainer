#!/usr/bin/env node
// Deterministic video of a figure: freeze the page, then for every frame renderAt(t) and screenshot it.
//   .webm  encoded in headless Chrome with WebCodecs (VP9) and muxed here (scripts/lib/webm.mjs): no dependencies
//   .mp4 / .gif  piped to ffmpeg when it is on PATH (or fetched with --allow-download, never otherwise)
//   dir/   PNG frames, plus the ffmpeg command to encode them
// The first frame uses the settled camera; later frames step the director ("auto") so camera moves are smooth.
import "./lib/websocket.mjs";                // Node 20/21: re-run with --experimental-websocket
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, extname, dirname, join, relative } from "node:path";
import { homedir, tmpdir } from "node:os";
import { launch, openPage } from "./lib/cdp.mjs";
import { resolveTarget, openFigure } from "./lib/figure-page.mjs";
import { muxWebM } from "./lib/webm.mjs";
import { parseArgs, parseSize, fmtBytes, isMain, showPath } from "./lib/args.mjs";

const USAGE = `
usage: node scripts/record.mjs <page.html | figure.mjs | url> --out <file.webm | file.mp4 | file.gif | dir/> [options]
  --fps <n>            frames per second (default 60; 30 for .gif)
  --size <WxH>         1920x1080 (default) | 1080x1920 | 1080x1080, or presets landscape, vertical, square, 720p
  --from <s> --to <s>  playhead range in seconds at 1x (default: the whole timeline)
  --speed <x>          playback speed (default 1)
  --tail <s>           hold the last frame this long (default 0)
  --scenario <id>      scenario (default: the first)
  --theme dark|light   theme (default: the page's)
  --captions           keep the HUD caption burned in (default: hidden, like the transport and drawers)
  --chrome             keep the interactive HUD (transport, tabs, toolbar) too
  --bitrate <Mbps>     VP9 target bitrate (default ~0.1 bit per pixel per frame)
  --keyint <s>         keyframe interval (default 2)
  --workers <n>        parallel capture pages (default min(4, cores/2); chunks are at least 2 s)
  --lossless           capture PNG instead of JPEG q95 before encoding (slower; frames/ is always PNG)
  --runtime <file>     runtime for a figure-module target
  --poster <file.png>  after a .webm, save the decoded middle frame (proves it plays)
  --no-check           skip loading the .webm back into Chrome
  --allow-download     permit fetching ffmpeg-static with npm when .mp4/.gif is asked for and ffmpeg is missing
`;

const ENCODER_PAGE = `<!doctype html><meta charset="utf-8"><title>encoder</title><script>
let enc = null, out = [], meta = null, failure = null;
window.init = async (cfg) => {
  if (!("VideoEncoder" in window)) throw new Error("WebCodecs VideoEncoder is not available in this Chrome");
  const sup = await VideoEncoder.isConfigSupported(cfg);
  if (!sup.supported) throw new Error("encoder config not supported: " + JSON.stringify(cfg));
  enc = new VideoEncoder({
    output: (chunk, md) => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); out.push({ key: chunk.type === "key", ts: chunk.timestamp, data }); if (md && md.decoderConfig) meta = md.decoderConfig; },
    error: (e) => { failure = e; },
  });
  enc.configure(cfg);
  return sup.config;
};
window.push = async (n, ts, dur, key) => {
  if (failure) throw failure;
  const r = await fetch("/frame/" + n);
  if (!r.ok) throw new Error("frame " + n + " missing");
  const bmp = await createImageBitmap(await r.blob());
  const frame = new VideoFrame(bmp, { timestamp: ts, duration: dur });
  bmp.close();
  enc.encode(frame, { keyFrame: key });
  frame.close();
  while (enc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 1));
  return true;
};
window.drain = async () => {
  const take = out; out = [];
  const b64 = take.length ? await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result.slice(r.result.indexOf(",") + 1)); r.readAsDataURL(new Blob(take.map((c) => c.data))); }) : "";
  return { b64, chunks: take.map((c) => ({ key: c.key, ts: c.ts, len: c.data.byteLength })), meta: meta && { codec: meta.codec, colorSpace: meta.colorSpace ? JSON.parse(JSON.stringify(meta.colorSpace)) : null } };
};
window.finish = async () => { await enc.flush(); if (failure) throw failure; enc.close(); return drain(); };
</script>`;

const CHECK_PAGE = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}video{display:block;width:100vw;height:100vh;object-fit:contain}</style>
<video id="v" muted playsinline preload="auto" src="/video"></video><script>
window.check = async () => {
  const v = document.getElementById("v");
  const wait = (ev) => new Promise((ok, fail) => { v.addEventListener(ev, ok, { once: true }); v.addEventListener("error", () => fail(new Error("video error " + (v.error && v.error.code) + ": " + (v.error && v.error.message))), { once: true }); });
  if (v.readyState < 1) await wait("loadedmetadata");
  const res = { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
  await v.play(); await new Promise((r) => setTimeout(r, 600)); v.pause();
  res.played = v.currentTime;
  const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
  res.decodedFrames = q ? q.totalVideoFrames : null;
  v.currentTime = v.duration / 2; await wait("seeked");
  await new Promise((r) => { setTimeout(r, 250); v.requestVideoFrameCallback?.(() => r()); });   // rVFC may never fire for a paused seek in headless
  res.seekedTo = v.currentTime;
  return res;
};
</script>`;

function findFfmpeg(allowDownload) {
  const onPath = spawnSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore" });
  if (onPath.status === 0) return "ffmpeg";
  const cache = join(homedir(), ".cache", "explainer", "ffmpeg");
  const cached = join(cache, "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (existsSync(cached)) return cached;
  if (!allowDownload) return null;
  console.log(`downloading ffmpeg-static into ${cache} (--allow-download)…`);
  mkdirSync(cache, { recursive: true });
  const r = spawnSync("npm", ["install", "--no-save", "--no-audit", "--no-fund", "--prefix", cache, "ffmpeg-static"], { stdio: "inherit" });
  return r.status === 0 && existsSync(cached) ? cached : null;
}

function startLocalServer(state) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/enc.html" || url.pathname === "/check.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(url.pathname === "/enc.html" ? ENCODER_PAGE : CHECK_PAGE);
      return;
    }
    const m = /^\/frame\/(\d+)$/.exec(url.pathname);
    if (m && state.frames.has(Number(m[1]))) {
      const buf = state.frames.get(Number(m[1]));
      state.frames.delete(Number(m[1]));
      res.writeHead(200, { "content-type": "image/png", "content-length": buf.length }).end(buf);
      return;
    }
    if (url.pathname === "/video" && state.video) {     // Range support, so the <video> can seek
      const size = statSync(state.video).size, range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      const data = readFileSync(state.video);
      if (range) {
        const a = range[1] ? Number(range[1]) : 0, b = range[2] ? Number(range[2]) : size - 1;
        res.writeHead(206, { "content-type": "video/webm", "content-range": `bytes ${a}-${b}/${size}`, "accept-ranges": "bytes", "content-length": b - a + 1 }).end(data.subarray(a, b + 1));
      } else res.writeHead(200, { "content-type": "video/webm", "accept-ranges": "bytes", "content-length": size }).end(data);
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// One worker: its own figure page, rendering frames [pre, end) in order and capturing [start, end).
// Frames before `start` are a render-only pre-roll so the camera springs (and anything else with history)
// arrive at `start` as they would in one sequential pass; frame `pre` uses the settled camera.
async function captureChunk(browser, url, o, chunk, onFrame) {
  const fp = await openFigure(browser, url, { ...o.size, dpr: 1 });
  try {
    if (o.scenario) await fp.setScenario(o.scenario);
    if (o.theme) await fp.setTheme(o.theme);
    await fp.capture({ captions: !!o.captions, chrome: !!o.chrome });
    await fp.still();
    await fp.freeze();
    for (let j = chunk.pre; j < chunk.end; j++) {
      await fp.renderAt(o.timeOf(j), j === chunk.pre ? "settled" : "auto");
      if (j >= chunk.start) await onFrame(j, await fp.page.png(o.lossless ? { fast: true } : { format: "jpeg", quality: 95, fast: true }));
    }
    return fp.errors;
  } finally { await fp.close(); }
}

// A VP9 encoder in its own page; frames reach it over the local server, encoded chunks come back in batches.
async function openEncoder(browser, base, state, cfg) {
  const enc = await openPage(browser, `${base}/enc.html`, { width: 200, height: 100, dpr: 1 });
  await enc.evaluate(`init(${JSON.stringify(cfg)})`);
  const chunks = [];
  let meta = null, pending = Promise.resolve(), n = 0;
  const take = (r) => {
    const all = Buffer.from(r.b64, "base64");
    let at = 0;
    for (const c of r.chunks) { chunks.push({ key: c.key, timestamp: c.ts, data: all.subarray(at, at + c.len) }); at += c.len; }
    meta = r.meta ?? meta;
  };
  return {
    async push(j, img, ts, dur, key) {
      state.frames.set(j, img);
      await pending;                                   // one frame in the encoder while the next one renders
      pending = enc.evaluate(`push(${j}, ${ts}, ${dur}, ${key})`);
      if (++n % 60 === 0) { await pending; take(await enc.evaluate("drain()")); }
    },
    async finish() { await pending; take(await enc.evaluate("finish()")); await enc.close(); return { chunks, meta }; },
  };
}

export async function record(target, o = {}) {
  if (!o.out) throw new Error("--out is required (file.webm, file.mp4, file.gif or a directory/)");
  const out = resolve(o.out);
  const ext = extname(out).toLowerCase();
  const kind = o.out.endsWith("/") || !ext || (existsSync(out) && statSync(out).isDirectory()) ? "frames" : ext.slice(1);
  if (!["webm", "mp4", "gif", "frames"].includes(kind)) throw new Error(`unsupported output "${ext}" (use .webm, .mp4, .gif or a directory/)`);
  const size = parseSize(o.size ?? "1920x1080");
  if (size.width % 2 || size.height % 2) throw new Error(`video sizes must be even, got ${size.width}x${size.height}`);
  const fps = o.fps ?? (kind === "gif" ? 30 : 60), speed = o.speed ?? 1;
  let ffmpeg = null;
  if (kind === "mp4" || kind === "gif") {
    ffmpeg = findFfmpeg(o.allowDownload);
    if (!ffmpeg) throw new Error(`.${kind} needs ffmpeg, which is not on PATH. Options: record .webm instead (no dependencies), install ffmpeg (brew install ffmpeg), or pass --allow-download to fetch ffmpeg-static with npm.`);
  }
  const t = await resolveTarget(target, { runtime: o.runtime, theme: o.theme });
  const state = { frames: new Map(), video: null };
  const server = await startLocalServer(state);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launch();
  const started = performance.now();
  let tmp = null;
  try {
    // the timeline, from a probe page
    const probe = await openFigure(browser, t.url, { ...size, dpr: 1 });
    if (o.scenario) await probe.setScenario(o.scenario);
    const info = await probe.info();
    await probe.close();
    const from = Math.max(0, o.from ?? 0), to = Math.min(info.duration, o.to ?? info.duration);
    if (!(to > from)) throw new Error(`empty range: --from ${from} --to ${to} (timeline is ${info.duration.toFixed(2)} s)`);
    const moving = Math.max(1, Math.round(((to - from) * fps) / speed));
    const total = moving + Math.round((o.tail ?? 0) * fps);
    const timeOf = (j) => Math.min(to, from + (Math.min(j, moving - 1) * speed) / fps);
    // chunks of at least 2 s each, one per worker, each after an 8 s render-only pre-roll: critically damped
    // springs (omega 3) are then within ~1e-9 of the sequential state, so chunk seams are invisible
    const cores = Math.max(1, (await import("node:os")).availableParallelism?.() ?? 4);
    const workers = Math.max(1, Math.min(o.workers ?? Math.min(4, Math.floor(cores / 2)), Math.floor(total / (2 * fps)) || 1));
    const preroll = Math.ceil(8 * fps);
    const chunks = Array.from({ length: workers }, (_, k) => {
      const start = Math.round((k * total) / workers), end = Math.round(((k + 1) * total) / workers);
      return { start, end, pre: Math.max(0, start - preroll) };
    });
    const opts = { size, scenario: o.scenario, theme: o.theme, captions: o.captions, chrome: o.chrome, lossless: o.lossless || kind === "frames", timeOf };

    let done = 0, lastReport = 0;
    const progress = () => {
      done++;
      const pct = Math.floor((done / total) * 10);
      if (pct > lastReport || done === total) {
        lastReport = pct;
        console.log(`frame ${done}/${total}  ${(done / ((performance.now() - started) / 1000)).toFixed(1)} frames/s  (${workers} worker${workers > 1 ? "s" : ""})`);
      }
    };
    const res = { out, kind, frames: total, fps, size, from, to, seconds: total / fps, workers, errors: [] };
    const frameName = (j, e) => `frame-${String(j).padStart(6, "0")}.${e}`;

    if (kind === "webm") {
      const bitrate = Math.round(o.bitrate ? o.bitrate * 1e6 : size.width * size.height * fps * 0.1);
      const level = size.width * size.height > 2228224 ? "51" : "41";
      const cfg = { codec: `vp09.00.${level}.08`, width: size.width, height: size.height, bitrate, framerate: fps, latencyMode: "quality", bitrateMode: "variable" };
      const keyEvery = Math.max(1, Math.round((o.keyint ?? 2) * fps));
      const parts = await Promise.all(chunks.map(async (c) => {
        const enc = await openEncoder(browser, base, state, cfg);
        const errors = await captureChunk(browser, t.url, opts, c, async (j, img) => {
          await enc.push(j, img, Math.round((j * 1e6) / fps), Math.round(1e6 / fps), j === c.start || j % keyEvery === 0);
          progress();
        });
        return { errors, ...(await enc.finish()) };
      }));
      const all = parts.flatMap((p) => p.chunks).sort((a, b) => a.timestamp - b.timestamp);
      if (!all[0]?.key) throw new Error("the encoder did not start with a keyframe");
      if (all.length !== total) throw new Error(`the encoder returned ${all.length} frames for ${total}`);
      mkdirSync(dirname(out), { recursive: true });
      const meta = parts.find((p) => p.meta)?.meta;
      writeFileSync(out, muxWebM({ width: size.width, height: size.height, fps, frames: all, colorSpace: meta?.colorSpace }));
      Object.assign(res, { codec: meta?.codec, bitrate, errors: parts.flatMap((p) => p.errors) });
    } else {
      const dir = kind === "frames" ? out : (tmp = mkdtempSync(join(tmpdir(), "explainer-frames-")));
      mkdirSync(dir, { recursive: true });
      const e = opts.lossless ? "png" : "jpg";
      const errs = await Promise.all(chunks.map((c) => captureChunk(browser, t.url, opts, c, async (j, img) => { writeFileSync(join(dir, frameName(j, e)), img); progress(); })));
      res.errors = errs.flat();
      if (kind === "frames") res.hint = `ffmpeg -framerate ${fps} -i ${showPath(out)}/frame-%06d.png -c:v libx264 -pix_fmt yuv420p -crf 16 -movflags +faststart out.mp4`;
      else {
        const args = ["-hide_banner", "-loglevel", "error", "-y", "-framerate", String(fps), "-i", join(dir, `frame-%06d.${e}`)];
        if (kind === "mp4") args.push("-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-vf", "scale=out_color_matrix=bt709:out_range=tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", out);
        else args.push("-vf", "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle", "-loop", "0", out);
        mkdirSync(dirname(out), { recursive: true });
        const r = spawnSync(ffmpeg, args, { encoding: "utf8" });
        if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}):\n${(r.stderr || "").slice(-1500)}`);
      }
    }
    res.ms = performance.now() - started;

    if (kind === "webm" && o.check !== false) {
      state.video = out;
      const w = Math.min(size.width, 1280);
      const cp = await openPage(browser, `${base}/check.html`, { width: w, height: Math.round((w * size.height) / size.width), dpr: 1 });
      try { res.check = await cp.evaluate("check()", { timeout: 20000 }); }
      catch (e) { res.check = { error: e.message.split("\n")[0] }; }
      if (!res.check.error && Math.abs(res.check.duration - total / fps) > 1.5 / fps) res.check.error = `duration ${res.check.duration.toFixed(3)} s, expected ${(total / fps).toFixed(3)} s`;
      if (!res.check.error && (res.check.width !== size.width || res.check.height !== size.height)) res.check.error = `decoded ${res.check.width}x${res.check.height}, expected ${size.width}x${size.height}`;
      if (o.poster && !res.check.error) await cp.shot(resolve(o.poster));
      await cp.close();
    }
    return res;
  } finally {
    browser.close();
    server.close();
    t.stop();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

if (isMain(import.meta)) {
  const a = parseArgs(process.argv.slice(2), { usage: USAGE, flags: { chrome: "boolean", workers: "number", lossless: "boolean", out: "string", fps: "number", size: "string", from: "number", to: "number", speed: "number", tail: "number", scenario: "string", theme: "string", captions: "boolean", bitrate: "number", keyint: "number", runtime: "string", poster: "string", check: "boolean", allowDownload: "boolean", "allow-download": "boolean" } });
  if (a._.length !== 1) { console.error(USAGE.trim()); process.exit(2); }
  try {
    const r = await record(a._[0], a);
    const rel = showPath(r.out);
    const sizeOf = r.kind === "frames" ? "" : `  ${fmtBytes(statSync(r.out).size)}`;
    console.log(`${rel}${sizeOf}  ${r.frames} frames  ${r.seconds.toFixed(2)} s  ${r.size.width}x${r.size.height} @ ${r.fps} fps` +
      (r.kind === "webm" ? `  ${r.codec ?? "vp9"} ~${(r.bitrate / 1e6).toFixed(1)} Mbps` : "") + `  (${(r.ms / 1000).toFixed(1)} s, ${r.workers} worker${r.workers > 1 ? "s" : ""})`);
    if (r.check) console.log(r.check.error ? `check FAILED: ${r.check.error}` :
      `check ok: Chrome plays it (duration ${r.check.duration.toFixed(2)} s, ${r.check.width}x${r.check.height}, played to ${r.check.played.toFixed(2)} s, seeked to ${r.check.seekedTo.toFixed(2)} s)`);
    if (r.hint) console.log(`encode with: ${r.hint}`);
    for (const e of r.errors) console.log(`page [${e.type}] ${e.text.split("\n")[0]}`);
    process.exit(r.errors.length || r.check?.error ? 1 : 0);
  } catch (e) {
    console.error(`error  ${e.message}`);
    process.exit(1);
  }
}
