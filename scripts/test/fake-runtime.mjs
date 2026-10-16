// A stand-in for engine/runtime.mjs, for testing build/shoot/audit/record end to end before the real
// runtime, renderer and HUD exist. It compiles with scripts/test/fake-scene.mjs, frames the world with the
// real director (engine/director/director.mjs) and draws it with Canvas 2D through the director's own
// projection, so screenshots also show the camera at work. The HUD is a rough DOM mock with the real class
// names the capture CSS hides (.ix-transport, .ix-drawer, .ix-settings) and exposes window.__internals (7.3).
import { compile } from "./fake-scene.mjs";
import { createDirector, projectPoint, ndcToCss, eyeOf, pxPerUnitAt } from "../../engine/director/director.mjs";
import { PALETTE, TYPE, keyColor } from "../../engine/tokens.mjs";

const nextFrame = () => new Promise((ok) => requestAnimationFrame(() => ok()));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const plain = (m) => String(m).replace(/\{(?:key|ref|tone):([^}|]+)(?:\|([^}]+))?\}/g, (_, a, b) => b ?? a).replace(/\*\*/g, "");

const CSS = `
.ix{font-family:${TYPE.sans},${TYPE.fallbackSans};color:var(--ink)}
.ix[data-theme=dark]{--ink:${PALETTE.dark.ink};--muted:${PALETTE.dark.inkMuted};--glass:rgba(18,19,23,.62);--border:rgba(255,255,255,.08)}
.ix[data-theme=light]{--ink:${PALETTE.light.ink};--muted:${PALETTE.light.inkMuted};--glass:rgba(255,255,255,.72);--border:rgba(0,0,0,.07)}
.ix-title{position:absolute;left:28px;top:24px;pointer-events:none}
.ix-title .k{font:500 11px/1 ${TYPE.mono},monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.ix-title .t{font-weight:600;font-size:26px;letter-spacing:-.02em;margin-top:8px}
.ix-title .s{font-size:14px;color:var(--muted);margin-top:4px}
.ix-caption{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);max-width:64ch;width:calc(100% - 48px);text-align:center;font-size:17px;line-height:26px}
.ix-caption::before{content:none}
.ix-glass{background:var(--glass);border:1px solid var(--border);border-radius:14px;backdrop-filter:blur(18px) saturate(1.4);box-shadow:0 10px 40px rgba(0,0,0,.25)}
.ix-transport{position:absolute;left:24px;right:24px;bottom:20px;height:52px;display:flex;align-items:center;gap:14px;padding:0 16px;font:500 12px ${TYPE.mono},monospace;color:var(--muted)}
.ix-transport .bar{flex:1;display:flex;gap:4px;height:4px}
.ix-transport .seg{flex:1;background:var(--border);border-radius:2px;position:relative}
.ix-transport .seg i{position:absolute;inset:0;background:var(--ink);opacity:.7;border-radius:2px;transform-origin:left}
.ix-drawer{position:absolute;right:24px;top:24px;width:220px;padding:14px 16px;font-size:13px}
.ix-drawer div{display:flex;justify-content:space-between;color:var(--muted);margin:4px 0}
.ix-meters{position:absolute;right:24px;bottom:92px;padding:10px 14px;font:500 12px/20px ${TYPE.mono},monospace;min-width:150px}
.ix-meters div{display:flex;justify-content:space-between;gap:16px}
.ix-tag{position:absolute;transform:translate(-50%,-100%);padding:3px 8px;font:500 11px ${TYPE.mono},monospace;white-space:nowrap;border-radius:8px}
`;

export async function mount(root, figure, options = {}) {
  const canvas = root.querySelector("canvas.ix-canvas");
  const ctx = canvas.getContext("2d");
  const style = document.head.appendChild(document.createElement("style"));
  style.textContent = CSS;
  let theme = options.theme ?? figure.meta?.theme ?? "dark";
  let scenario = (figure.scenarios ?? [])[0]?.id;
  let values = {};
  let tl, time = 0, playing = true, speed = 1, frozen = false, last = 0, raf = 0, frame = null, cam = null;
  let viewport = { width: 1, height: 1 };
  const director = createDirector({ reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches });
  const msPerFrame = [];

  const el = (cls, html = "") => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; root.appendChild(d); return d; };
  const m = figure.meta ?? {};
  el("ix-title", `<div class="k">${m.kicker ?? ""} · FIG ${m.fig ?? 1}</div><div class="t">${m.title ?? ""}</div><div class="s">${m.subtitle ?? ""}</div>`);
  const caption = el("ix-caption");
  const meters = el("ix-meters ix-glass");
  const transport = el("ix-transport ix-glass");
  const drawer = el("ix-drawer ix-glass ix-settings");
  const tagLayer = el("ix-tags");

  function recompile() {
    tl = compile(figure, { params: values, scenario });
    director.setTimeline(tl);
    transport.innerHTML = `<span>▶</span><div class="bar">${tl.phases.map((p) => `<div class="seg" style="flex:${p.t1 - p.t0}"><i></i></div>`).join("")}</div><span class="n"></span>`;
    drawer.innerHTML = `<b>Settings</b>` + Object.entries(figure.params ?? {}).map(([k, d]) => `<div><span>${d.label}</span><span>${values[k] ?? d.value}</span></div>`).join("");
    time = clamp(time, 0, tl.duration);
  }

  function draw() {
    const t0 = performance.now();
    const W = viewport.width, H = viewport.height, P = PALETTE[theme], aspect = W / H;
    const css = (p) => ndcToCss(projectPoint(cam, p, aspect), viewport);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    const c = css([(frame.world.minX + frame.world.maxX) / 2, 0, 0]);
    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], Math.max(W, H) * 0.75);
    g.addColorStop(0, P.stageLift); g.addColorStop(0.55, P.stage); g.addColorStop(1, P.stageEdge);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // dot grid
    const w = frame.world, step = 32;
    ctx.fillStyle = theme === "dark" ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.10)";
    for (let x = Math.floor((w.minX - 600) / step) * step; x <= w.maxX + 600; x += step)
      for (let y = Math.floor((w.minY - 500) / step) * step; y <= w.maxY + 500; y += step) {
        const p = projectPoint(cam, [x, y, 0], aspect);
        if (p[2] <= 0 || Math.abs(p[0]) > 1.05 || Math.abs(p[1]) > 1.05) continue;
        const q = ndcToCss(p, viewport);
        ctx.fillRect(q[0] - 0.8, q[1] - 0.8, 1.6, 1.6);
      }
    // solids, far to near
    const eye = eyeOf(cam);
    const solids = frame.poses.filter((p) => p.kind === "housing" || p.kind === "packet")
      .map((p) => ({ p, d: Math.hypot(p.x - eye[0], p.y - eye[1], (p.z ?? 0) - eye[2]) })).sort((a, b) => b.d - a.d);
    const ppu = pxPerUnitAt(cam.distance, H);
    for (const { p } of solids) {
      if (p.kind === "packet") {
        const q = css([p.x, p.y, p.z]);
        const col = keyColor(theme, p.key ? 1 : 0);
        ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 22; ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(q[0], q[1], 7 * ppu, 4.5 * ppu, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        continue;
      }
      const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, y0 = p.y - p.d / 2, y1 = p.y + p.d / 2, h = p.h;
      const faces = [
        { n: [0, 1, 0], pts: [[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]], shade: 0.72 },
        { n: [0, -1, 0], pts: [[x0, y0, 0], [x1, y0, 0], [x1, y0, h], [x0, y0, h]], shade: 0.6 },
        { n: [1, 0, 0], pts: [[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], shade: 0.82 },
        { n: [-1, 0, 0], pts: [[x0, y0, 0], [x0, y1, 0], [x0, y1, h], [x0, y0, h]], shade: 0.62 },
      ];
      const base = p.dim ? P.ghost : P.housing;
      for (const f of faces) {
        const cx = f.pts.reduce((s, q) => s + q[0], 0) / 4, cy = f.pts.reduce((s, q) => s + q[1], 0) / 4;
        if (f.n[0] * (eye[0] - cx) + f.n[1] * (eye[1] - cy) <= 0) continue;
        poly(f.pts.map(css), shade(base, f.shade));
      }
      poly([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]].map(css), p.lit ? shade(base, theme === "dark" ? 1.5 : 0.97) : base, P.grooveRim);
      const tc = css([x0 + 10, y0 + 14, h]);
      ctx.fillStyle = P.engrave; ctx.font = `600 ${Math.max(6, 8.5 * ppu)}px ${TYPE.mono}, monospace`; ctx.textBaseline = "middle";
      ctx.fillText(String(p.title).toUpperCase(), tc[0], tc[1]);
      const sc = css([x0 + 10, y0 + 30, h]);
      ctx.fillStyle = P.inkMuted; ctx.font = `500 ${Math.max(5, 7 * ppu)}px ${TYPE.mono}, monospace`;
      ctx.fillText(p.sub ?? "", sc[0], sc[1]);
      const lc = css([x1 - 10, y0 + 12, h]);
      ctx.fillStyle = P[p.led] ?? P.idle; ctx.beginPath(); ctx.arc(lc[0], lc[1], Math.max(1.5, 2.8 * ppu), 0, Math.PI * 2); ctx.fill();
    }
    msPerFrame.push(performance.now() - t0);
    if (msPerFrame.length > 120) msPerFrame.shift();
  }
  function poly(pts, fill, stroke) {
    ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1; }
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = (v) => clamp(Math.round(v * k), 0, 255);
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function renderFrame(dt, settled) {
    frame = tl.sample(time, {});
    cam = director.update(frame, viewport, dt, { settled });
    draw();
    caption.textContent = plain(frame.caption);
    meters.innerHTML = Object.entries(tl.counters).map(([k, d]) => `<div><span>${d.label}</span><b>${frame.counters[k] ?? 0}</b></div>`).join("");
    transport.querySelector(".n").textContent = `${frame.step + 1}/${tl.steps.length}`;
    transport.querySelectorAll(".seg i").forEach((s, i) => { const p = tl.phases[i]; s.style.transform = `scaleX(${clamp((time - p.t0) / (p.t1 - p.t0), 0, 1)})`; });
    tagLayer.innerHTML = "";
    for (const tg of frame.tags) {
      const q = ndcToCss(projectPoint(cam, tg.at, viewport.width / viewport.height), viewport);
      const d = document.createElement("div");
      d.className = "ix-tag ix-glass"; d.textContent = tg.text; d.style.left = q[0] + "px"; d.style.top = q[1] + "px"; d.style.opacity = tg.opacity;
      tagLayer.appendChild(d);
    }
    if (scenario === "glitch" && frame.step === 9) console.error("fake runtime: planted error at step 9");
  }

  function tick(now) {
    raf = 0;
    if (frozen) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (playing) { time += dt * speed; if (time >= tl.duration) { time = tl.duration; playing = false; } }
    renderFrame(dt, false);
    if (!raf) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf && !frozen) raf = requestAnimationFrame(tick); };

  const resize = () => {
    const r = root.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    viewport = { width: Math.max(1, r.width), height: Math.max(1, r.height) };
    canvas.width = Math.round(viewport.width * dpr); canvas.height = Math.round(viewport.height * dpr);
    if (frozen && tl) renderFrame(0, true); else kick();
  };
  new ResizeObserver(resize).observe(root);
  resize();
  recompile();
  await document.fonts.ready;

  const internals = {
    get timeline() { return tl; },
    seek: (t) => { time = clamp(t, 0, tl.duration); kick(); },
    play: () => { playing = true; kick(); }, pause: () => { playing = false; },
    setSpeed: (x) => { speed = x; },
    setTheme: (t) => { theme = t; root.dataset.theme = t; kick(); },
    setScenario: (id) => { scenario = id; values = {}; recompile(); kick(); },
    setParams: (v) => { values = { ...values, ...v }; recompile(); kick(); },
    setCapture: (on) => root.classList.toggle("ix-capture", !!on),
    freeze: (on) => { frozen = !!on; if (frozen && raf) { cancelAnimationFrame(raf); raf = 0; } if (!frozen) { last = 0; kick(); } },
    async renderAt(t, { camera = "settled" } = {}) {
      frozen = true;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const dt = Math.max(0, t - time) || 1 / 60;
      time = clamp(t, 0, tl.duration);
      renderFrame(dt, camera === "settled");
      await nextFrame();
      return { step: frame.step, u: frame.u, phase: frame.phase, caption: frame.caption };
    },
    audit() {
      const out = [], aspect = viewport.width / viewport.height;
      for (const tg of frame.tags) {
        const p = projectPoint(cam, tg.at, aspect);
        if (p[2] <= 0 || Math.abs(p[0]) > 1 || Math.abs(p[1]) > 1) out.push({ kind: "tag-offscreen", step: frame.step, message: `tag "${tg.text}" is outside the frame` });
      }
      const f = frame.focus;
      for (const c of [[f.minX, f.minY, 0], [f.maxX, f.minY, 0], [f.minX, f.maxY, 0], [f.maxX, f.maxY, 0]]) {
        const p = projectPoint(cam, c, aspect);
        if (Math.abs(p[0]) > 1.01 || Math.abs(p[1]) > 1.01) { out.push({ kind: "focus-outside", step: frame.step, message: "part of the step's focus is outside the frame" }); break; }
      }
      if (caption.scrollWidth > caption.clientWidth + 1) out.push({ kind: "caption-overflow", step: frame.step, message: "caption overflows its box" });
      return out;
    },
    stats: () => ({ ms: msPerFrame.reduce((a, b) => a + b, 0) / Math.max(1, msPerFrame.length), steps: tl.steps.length, duration: tl.duration, poses: frame?.poses.length }),
  };
  window.__internals = internals;
  internals.ready = (async () => { kick(); await nextFrame(); await nextFrame(); return true; })();
  await internals.ready;
  return internals;
}
