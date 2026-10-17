# Rendering: WebGPU tier (Prism 2), first cut

## What the bench shows, and what it can't

`bench/` (stopped run, Apple M-series, 2560×1440, 300 slabs, MSAA 4) says WebGPU's base frame is cheap. Wall time per frame is 3.0 ms on WebGPU and 5.0 ms on WebGL2. Instancing scales to 5k slabs at 9.8 ms, and 100k compute particles cost 0.07 ms.

**The per-pass numbers in `results.json` are not trustworthy.** With AO, the passes add up to 17.2 ms against a 5.8 ms wall time. There are three reasons:
1. **The spans overlap.** On a tile-based GPU (Apple), a pass's begin/end stamps bracket its vertex start and fragment end. The GPU overlaps one pass's fragment work with the next pass's vertex work, so each span also counts the wait for its neighbours.
2. **Chrome quantizes timestamps** to 100 µs unless `--enable-webgpu-developer-features` is on. That is why the values cluster at 0.066, 0.197 and 0.328.
3. **Some query slots were never written.** One "ssr" span is 2.2·10⁹ ms, which is garbage.

The WebGL2 per-pass numbers (one `EXT_disjoint_timer_query` per pass, through ANGLE on Metal) overlap the same way.

What the bench can't show: the cost of *our* shaders. Its scene is a stand-in.

**The method used now** (`backends/webgpu/timing.mjs`):
- **Frame span:** the first pass's begin to the last pass's end in a normal frame. This is reliable.
- **Per pass:** each pass is re-encoded alone in its own submit, and the CPU waits for the GPU in between, so nothing overlaps it. The sum of these is an upper bound on the frame.

## Support (October 2026)

| Browser | WebGPU |
|---|---|
| Chrome / Edge | Windows, macOS, ChromeOS since 113. Android 12+ since 121. Linux still in progress |
| Safari | macOS, iOS and iPadOS 26 |
| Firefox | Windows since 141. Apple-silicon macOS since 145. Linux, Android and Intel Macs in progress |

Everything else, including older iOS and Linux, gets WebGL2. A file:// page has `isSecureContext` true and `navigator.gpu` present (from the bench's probe).

Sources: [web.dev: WebGPU supported in major browsers](https://web.dev/blog/webgpu-supported-major-browsers), [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).

## Passes per tier (`backends/webgpu/graph.mjs`)

| Pass | WebGL2 (Lite) | WebGPU (High) |
|---|---|---|
| shadow map + min-depth | ✓ | ✓ |
| plan maps (contact, colour bounce) | ✓ | ✓ |
| floor layer (ink, grooves) | ✓ | ✓ |
| floor reflection (mirrored slabs, half res, blurred) | — | ✓ |
| main (MSAA 4: floor, slabs, raised ink, glass) | ✓ | ✓ |
| supersample accumulate (capture only, 8 jittered samples, Gaussian-weighted) | — | ✓ |
| bloom | dual filter | 13-tap down + tent up (Jimenez 2014; optional Karis) |
| tilt-shift DOF, composite | ✓ | ✓ |

## What is built

- **One renderer API.** `engine/gfx/select.mjs` returns it at once. It uses WebGPU after a self-test (draw a known colour, read it back) and falls back to WebGL2 otherwise. `?gfx=webgl2|webgpu` forces a tier.
- **Device loss** swaps in a fresh canvas and redraws the last frame on WebGL2. This was tested by destroying the device mid-run.
- **Both tiers consume the same DrawList and the same packer.** The WGSL is a line-for-line port of the GLSL.
- **Capture stays deterministic:** jitter is a fixed Halton sequence, and the grain is seeded from `t`. `renderAt` gives byte-identical PNGs.

## Measured (mapreduce, 2560×1440, Chrome headless, developer timestamps)

| | Measurement |
|---|---|
| Live frame span | 6.0–7.1 ms (budget 8) |
| Isolated passes | shadow 0.54 · plan 0.41–0.86 · floor layer 0.44–0.60 · reflection 0.29–0.40 · main 3.2–4.1 · bloom 0.76–1.04 · dof 0.22–0.29 · composite 0.74–0.87 |
| Accumulate | 0.23–0.28 ms per captured sample |

The ranges cover runs in both themes and show how much the GPU clock varies. The main pass dominates, mostly from the full-screen floor shader (PCSS and 16 point lights per pixel).

## Next

- **Live TAA:** built (`backends/webgpu/temporal.mjs`): live frames cycle the capture offsets with camera and per-tile reprojection and a 3×3 history clamp; a paused frame settles to capture quality in 8 frames.
- **Glass refraction** for queues and zones.
- **Performance:** a cheaper floor (shadow early-out per tile, light culling), and timestamp-driven tiers.
