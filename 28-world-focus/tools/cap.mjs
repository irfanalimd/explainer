// node cap.mjs <page> <out dir> <prefix> <steps,comma> [w h dpr theme where]: settled frozen frames, one browser
// where: "end" (just before the step's end) or "mid" (60% into the step)
import { launch, openPage } from "/home/ubuntu/tmp/explainer-perf/guide/world-focus/scripts/lib/cdp.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const [page, out, prefix, stepsArg, w = "1440", h = "900", dpr = "2", theme = "light", where = "end"] = process.argv.slice(2);
const browser = await launch();
try {
  const p = await openPage(browser, pathToFileURL(resolve(page)).href, { width: Number(w), height: Number(h), dpr: Number(dpr) });
  await p.waitFor("!!window.__internals", { timeout: 120000 });
  await p.evaluate("window.__ready.then(() => document.fonts.ready).then(() => true)");
  await p.evaluate(`(() => { const I = __internals; I.intro && I.intro(false); I.setTheme("${theme}"); if (${JSON.stringify(process.env.SPOT ?? "")} !== "") I.spotlight = Number(${JSON.stringify(process.env.SPOT ?? "")}); I.freeze(true); return true; })()`);
  const steps = stepsArg === "all" ? [...Array(await p.evaluate("__internals.timeline.steps.length")).keys()] : stepsArg.split(",").map(Number);
  for (const s of steps) {
    const info = await p.evaluate(`(async () => { const I = __internals; const st = I.timeline.steps[${s}];
      const end = st.t1 ?? (I.timeline.steps[${s} + 1]?.t0 ?? I.timeline.duration);
      const t = "${where}" === "mid" ? st.t0 + 0.6 * (end - st.t0) : "${where}" === "start" ? st.t0 + Math.min(0.8, 0.4 * (end - st.t0)) : end - 0.05;
      await I.renderAt(t, { camera: "settled" }); await new Promise(r => setTimeout(r, 900)); await I.renderAt(t, { camera: "settled" });
      return { backend: I.stats().backend, step: I.frame?.step, t }; })()`);
    await new Promise(r => setTimeout(r, 500));
    const f = resolve(out, `${prefix}-s${String(s).padStart(2, "0")}.png`);
    await p.shot(f);
    // screen boxes (device px) of the solids the spotlight keeps, for the pixel check (none on a build without it)
    const boxes = await p.evaluate(`(() => { const I = __internals, G = __gfx, dpr = devicePixelRatio, out = [];
      for (const q of I.frame.poses) {
        if (q.recede !== 0 || !["housing", "tile", "record", "bit", "page", "container"].includes(q.kind) || q.id.includes("#")) continue;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, on = true;
        for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const z of [q.z ?? 0, (q.z ?? 0) + (q.h ?? 0)]) {
          const r = G.project([q.x + dx * q.w / 2, q.y + dy * q.d / 2, z]); if (!r[3]) on = false;
          x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]); x1 = Math.max(x1, r[0]); y1 = Math.max(y1, r[1]); }
        if (on) out.push({ id: q.id, kind: q.kind, box: [x0 * dpr, y0 * dpr, x1 * dpr, y1 * dpr].map(Math.round) }); }
      return out; })()`);
    if (boxes.length) (await import("node:fs")).writeFileSync(f.replace(/\.png$/, ".kept.json"), JSON.stringify(boxes));
    console.log(JSON.stringify({ f, ...info }));
  }
} finally { browser.close(); }
