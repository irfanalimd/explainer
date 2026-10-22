#!/usr/bin/env node
// End-to-end check of the tooling in headless Chrome:  node scripts/test/e2e.mjs [--real]
// Builds the fake figure with the fake runtime, then exercises snap, shoot, audit, record (WebM + playback
// check), the dev server with live reload, and new.mjs. --real also runs verify/build/shoot/record on the
// real engine with engine/scene/fixtures/mapreduce.mjs. Outputs land in scripts/test/out/e2e/.
import "../lib/websocket.mjs";                // Node 20/21: re-run with --experimental-websocket
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = join(here, "out", "e2e");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const tmp = join(tmpdir(), "explainer-e2e");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

let failed = 0;
const run = (args, opts = {}) => spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", timeout: 300000, ...opts });
async function check(name, fn) {
  const t0 = performance.now();
  try { await fn(); console.log(`ok    ${name}  (${((performance.now() - t0) / 1000).toFixed(1)} s)`); }
  catch (e) { failed++; console.log(`FAIL  ${name}: ${e.message}`); }
}
const expect = (r, code, ...needles) => {
  const text = (r.stdout || "") + (r.stderr || "");
  if (r.status !== code) throw new Error(`exit ${r.status}, expected ${code}\n${text.slice(-1500)}`);
  for (const n of needles) if (!(n instanceof RegExp ? n.test(text) : text.includes(n))) throw new Error(`output lacks ${n}\n${text.slice(-1500)}`);
  return text;
};
const page = join(out, "fake.html");

await check("build fake figure (fake runtime)", () => expect(run(["scripts/build.mjs", "scripts/test/fake-figure.mjs", "--runtime", "scripts/test/fake-runtime.mjs", "--out", page]), 0, "fake.html", "modules"));
await check("snap from file://", () => expect(run(["scripts/snap.mjs", "file://" + page, "--out", join(out, "snap.png"), "--size", "1280x720", "--dpr", "1"]), 0, "snap.png"));
await check("shoot: phases x themes x sizes + contact sheet", () => {
  expect(run(["scripts/shoot.mjs", page, "--scenario", "ring", "--out", join(out, "shots")]), 0, "shot 24 PNGs", "contact.png", "no page errors");
  if (readdirSync(join(out, "shots")).filter((f) => f.endsWith(".png")).length !== 25) throw new Error("expected 24 shots + contact.png");
});
await check("audit: clean scenario passes", () => expect(run(["scripts/audit.mjs", page, "--scenario", "ring"]), 0, "ok: no problems"));
await check("audit: planted problems are found", () => expect(run(["scripts/audit.mjs", page, "--scenario", "glitch", "--sizes", "1440x900"]), 1, 'tag-offscreen at step 9: tag "far away"', "planted error at step 9"));
await check("record: 3 s 1280x720 WebM plays back", () => expect(run(["scripts/record.mjs", page, "--out", join(out, "fake.webm"), "--size", "1280x720", "--from", "6", "--to", "9", "--captions", "--poster", join(out, "poster.png")]), 0, "180 frames", "check ok: Chrome plays it (duration 3.00 s, 1280x720"));
await check("record: .mp4 without ffmpeg refuses to download", () => {
  const r = run(["scripts/record.mjs", page, "--out", join(out, "x.mp4")], { env: { ...process.env, PATH: "/usr/bin:/bin" } });
  expect(r, 1, "needs ffmpeg", "--allow-download");
});
// "glitch" plants a tag far away; the shot plan follows it off the step's focus, and verify's framing check says so
await check("verify: fake figure, all runs, the planted framing problem found", () => expect(run(["scripts/verify.mjs", "scripts/test/fake-figure.mjs", "--compiler", "scripts/test/fake-scene.mjs"]), 1, "28 run(s), 2 failing", "framing: the step's focus leaves the frame in the shot plan at 1440x900: steps 9"));
await check("new: template outside the skill verifies", () => {
  expect(run(["scripts/new.mjs", join(tmp, "binary-search")]), 0, "figure.mjs", "README.md");
  expect(run(["scripts/verify.mjs", join(tmp, "binary-search", "figure.mjs"), "--compiler", "scripts/test/fake-scene.mjs"]), 0, "0 failing");
});
await check("new --from: imports into the skill are relocated", () => {
  const src = join(tmp, "src-example");
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, "helpers.mjs"), "export const h = 1;\n");
  writeFileSync(join(src, "figure.mjs"), `import { MOTION } from "${join(root, "engine", "tokens.mjs")}";\nimport { h } from "./helpers.mjs";\nexport const meta = { title: "x" };\n`);
  expect(run(["scripts/new.mjs", join(tmp, "copy"), "--from", src]), 0, "figure.mjs");
  const copied = readFileSync(join(tmp, "copy", "figure.mjs"), "utf8");
  if (!copied.includes(`"./helpers.mjs"`) || !copied.includes(join(root, "engine", "tokens.mjs"))) throw new Error(copied);
});
await check("dev page: serve.mjs live reload", async () => {
  const dev = join(out, "fake.dev.html");
  expect(run(["scripts/build.mjs", "scripts/test/fake-figure.mjs", "--runtime", "scripts/test/fake-runtime.mjs", "--dev", "--out", dev]), 0, "dev");
  const srv = spawn(process.execPath, ["scripts/serve.mjs", "--port", "5291"], { cwd: root, stdio: "ignore" });
  const { launch, openPage } = await import("../../scripts/lib/cdp.mjs");
  const b = await launch();
  try {
    await new Promise((r) => setTimeout(r, 400));
    const p = await openPage(b, "http://127.0.0.1:5291/scripts/test/out/e2e/fake.dev.html", { width: 800, height: 500, dpr: 1 });
    if (!(await p.waitFor("window.__internals && window.__internals.timeline.steps.length"))) throw new Error("dev page did not boot " + JSON.stringify(p.errors));
    await p.evaluate("window.__marker = 1");
    const f = join(root, "scripts", "test", "fake-figure.mjs"), orig = readFileSync(f, "utf8");
    writeFileSync(f, orig + "\n");
    const ok = await p.waitFor("window.__marker === undefined && !!window.__internals", { timeout: 5000 });
    writeFileSync(f, orig);
    if (!ok) throw new Error("no reload after a change");
  } finally { b.close(); srv.kill(); }
});
if (process.argv.includes("--real") && existsSync(join(root, "engine", "runtime.mjs"))) {
  const fig = "engine/scene/fixtures/mapreduce.mjs", real = join(out, "mapreduce.html");
  await check("real: verify mapreduce", () => expect(run(["scripts/verify.mjs", fig]), 0, "0 failing"));
  await check("real: build mapreduce", () => expect(run(["scripts/build.mjs", fig, "--out", real]), 0, "mapreduce.html"));
  await check("real: shoot phases", () => expect(run(["scripts/shoot.mjs", real, "--out", join(out, "real-shots"), "--themes", "dark", "--sizes", "1440x900"]), 0, "contact.png"));
  await check("real: record 2 s WebM", () => expect(run(["scripts/record.mjs", real, "--out", join(out, "mapreduce.webm"), "--size", "1280x720", "--from", "20", "--to", "22", "--captions"]), 0, "check ok"));
}
rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
