// Getting a WebGPU device we can trust: an adapter and device within a time limit, then a startup self-test
// that draws a known colour off screen and reads it back. Any failure rejects, and select.mjs falls back to
// WebGL2. Browser-only.
const TIMEOUT_MS = 3000;

const within = (p, what) => Promise.race([p, new Promise((_, fail) => setTimeout(() => fail(new Error(`${what} timed out`)), TIMEOUT_MS))]);

/** Resolves to { device, timestamps } or rejects with the reason WebGPU should not be used here. */
export async function openDevice() {
  if (!globalThis.navigator?.gpu) throw new Error("navigator.gpu is missing");
  const adapter = await within(navigator.gpu.requestAdapter({ powerPreference: "high-performance" }), "requestAdapter");
  if (!adapter) throw new Error("no WebGPU adapter");
  const timestamps = adapter.features.has("timestamp-query");
  const device = await within(adapter.requestDevice({ requiredFeatures: timestamps ? ["timestamp-query"] : [] }), "requestDevice");
  device.addEventListener?.("uncapturederror", (e) => console.error("[gfx] WebGPU:", e.error?.message ?? e));
  try {
    await within(selfTest(device), "self-test");
  } catch (err) {
    device.destroy();
    throw err;
  }
  return { device, timestamps };
}

const PROBE = [0.25, 0.5, 0.75, 1];

// one triangle covering a 4x4 target in a known colour, copied out and compared
async function selfTest(device) {
  device.pushErrorScope("validation");
  const module = device.createShaderModule({ code: `
    @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
      return vec4f(f32(i & 1u) * 4.0 - 1.0, f32(i >> 1u) * 4.0 - 1.0, 0.0, 1.0);
    }
    @fragment fn fs() -> @location(0) vec4f { return vec4f(${PROBE.join(", ")}); }` });
  const pipeline = await device.createRenderPipelineAsync({
    layout: "auto", vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] },
  });
  const target = device.createTexture({ size: [4, 4], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
  const out = device.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
  pass.setPipeline(pipeline); pass.draw(3); pass.end();
  enc.copyTextureToBuffer({ texture: target }, { buffer: out, bytesPerRow: 256 }, [4, 4]);
  device.queue.submit([enc.finish()]);
  await out.mapAsync(GPUMapMode.READ);
  const px = new Uint8Array(out.getMappedRange()).slice(3 * 256 + 12, 3 * 256 + 16);
  out.unmap(); out.destroy(); target.destroy();
  const err = await device.popErrorScope();
  if (err) throw new Error(`self-test: ${err.message}`);
  if (PROBE.some((v, i) => Math.abs(px[i] - v * 255) > 2)) throw new Error(`self-test read back ${[...px]}`);
}
