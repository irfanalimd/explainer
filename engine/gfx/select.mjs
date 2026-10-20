// Backend selection behind the one renderer API (CONTRACTS.md 3.1). createRenderer returns at once; `ready`
// resolves when a backend is drawing. WebGPU is used when it is there and passes a startup self-test,
// WebGL2 otherwise. ?gfx=webgl2|webgpu (or opts.gfx) forces one. If WebGPU fails to start, or its device is
// lost later, the canvas is swapped for a fresh one and the WebGL2 tier redraws the last frame, so the
// visitor never sees a blank page.
import { createRenderer as createWebGL2 } from "./backends/webgl2/renderer.mjs";
import { createWebGPURenderer } from "./backends/webgpu/renderer.mjs";
import { openDevice } from "./backends/webgpu/device.mjs";

function requested(opts) {
  if (opts.gfx) return opts.gfx;
  try { return new URLSearchParams(location.search).get("gfx") ?? "auto"; } catch { return "auto"; }
}

export function createRenderer(canvas, opts = {}) {
  let impl = null, last = null, theme = opts.theme, size = null, quality = null;
  const lostFns = [];
  const debug = {};

  const api = {
    debug,
    timing: !!opts.timing,
    ready: null,
    get lost() { return !impl || impl.lost; },
    get backend() { return impl?.stats().backend ?? null; },
    get theme() { return impl?.theme ?? theme; },
    get busy() { return !!impl?.busy; },
    get drafted() { return !!impl?.drafted; },
    get size() { return impl?.size; },
    get atlas() { return impl?.atlas; },
    resize(w, h, dpr) { size = [w, h, dpr]; impl?.resize(w, h, dpr); },
    setTheme(t) { theme = t; impl?.setTheme(t); },
    setQuality(q) { quality = q; impl?.setQuality(q); },
    render(dl, camera, o) { last = [dl, camera, o]; impl?.render(dl, camera, o); },
    pick: (x, y) => impl?.pick(x, y) ?? null,
    project: (p) => impl?.project(p) ?? [NaN, NaN, 0, false],
    unproject: (x, y, z) => impl?.unproject(x, y, z) ?? [NaN, NaN],
    pxPerUnit: (at) => impl?.pxPerUnit(at) ?? 1,
    stats: () => impl?.stats() ?? {},
    profile: (o) => impl?.profile?.(o) ?? Promise.resolve(null),
    bench: (o) => impl?.bench?.(o) ?? Promise.resolve(null),
    onLost: (fn) => { lostFns.push(fn); },
    dispose: () => { impl?.dispose(); impl = null; },
  };

  // a canvas that once held a WebGPU context can never give a WebGL2 one: replace it, keeping its attributes
  function freshCanvas() {
    const c = canvas.cloneNode(false);
    canvas.replaceWith?.(c);
    canvas = c;
    return c;
  }

  function adopt(r) {
    Object.assign(r.debug, debug);
    r.debug = debug;
    r.timing = api.timing;
    if (theme) r.setTheme(theme);
    if (quality) r.setQuality(quality);
    if (size) r.resize(...size);
    impl = r;
  }

  async function startWebGL2() {
    const r = createWebGL2(canvas, opts);
    adopt(r);
    await r.ready;
  }

  async function startWebGPU() {
    const gpu = await openDevice();
    const r = await createWebGPURenderer(canvas, gpu, { ...opts, theme: theme ?? opts.theme });
    await r.ready;
    adopt(r);
    r.onLost((lost) => { if (lost) fallBack(new Error("device lost")); });
  }

  async function fallBack(err) {
    console.warn(`[gfx] WebGPU unavailable (${err.message}); drawing with WebGL2`);
    impl?.dispose?.();
    impl = null;
    freshCanvas();
    await startWebGL2();
    if (last) impl.render(...last);
    for (const fn of lostFns) { try { fn(false); } catch {} }
  }

  async function start() {
    const want = requested(opts);
    try {
      if (want === "webgl2" || !globalThis.navigator?.gpu) return await startWebGL2();
      try {
        await startWebGPU();
      } catch (err) {
        if (want === "webgpu") console.error("[gfx] ?gfx=webgpu requested but it failed:", err);
        await fallBack(err);
      }
    } catch (err) {
      // no GPU at all: `lost` stays true and the HUD and captions carry on without the world
      console.error(err);
    }
  }

  api.ready = start().then(() => api);
  globalThis.__gfx = api;      // for tooling: backend, stats(), profile()
  return api;
}
