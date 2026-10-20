> **Draft, for review only. Don't merge yet.** Screenshots load from the [`review` branch](https://github.com/irfanalimd/explainer/tree/review/09-page-speed), which also has the planning notes ([GOALS.md](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/GOALS.md)) and the raw measurements. The code diff is under **Files changed**.

## TL;DR

- **Live play without a GPU is 2.6× faster at 1440×900 and 3.7× faster on a phone.**
  - MapReduce goes from 0.89 to 2.28 frames a second at 1440×900, and from 2.04 to 7.46 on a 390×844 phone.
  - Without a GPU, a frame in motion is now a *draft*: drawn at three quarters of the pixel ratio, with smaller
    shadow maps and no antialiasing or tilt-shift.
  - The frame the picture comes to rest on is always drawn in full. Screenshots, the handout, Save image and
    recordings never use drafts, and a machine with a GPU never does.
- **The page is 38 % smaller.** MapReduce goes from 1.83 MB to 1.13 MB (Raft 1.89 → 1.16 MB). Comments and
  indentation are stripped from the modules and the stylesheet, and the modules are inlined as plain text, not
  base64. It is still one file that works offline from `file://`, and the build is still byte-deterministic.
- **The handout's pictures take 21.6 s, not 26.6 s.** The JPEGs are byte-identical to `main`'s.
- **Time to first frame** improved only through the size: 3.78 → 3.73 s at 1440×900, 2.79 → 2.48 s on the phone.
- Branch **`perf/page-speed`**, 8 commits on `8ccff12`. Unit tests 321 → 325.

## Before and after

Measured on this machine (4 cores, no GPU, Chrome drawing WebGL2 on SwiftShader), with nothing else using Chrome and
`main` and this branch alternating. Medians of three unless noted.

| | `main` (8ccff12) | this branch |
|---|---|---|
| **Live play, MapReduce, 1440×900** (frames drawn per second, story playing at 0.5×) | 0.89 fps | **2.28 fps** |
| **Live play, MapReduce, 390×844** | 2.04 fps | **7.46 fps** |
| Live play, Raft, 1440×900 / 390×844 (one run each) | 0.96 / 1.92 fps | 2.51 / 7.09 fps |
| A full frame, 1440×900, mid-run (render to pixels on screen) | 1.56 s | 1.63 s (unchanged: full frames are not drafts) |
| The closing scale shot (6008 slabs), two runs | 12.5 / 22.8 s | 9.8 / 12.2 s |
| Triangles per pass in the scale shot | 10.0 M | 7.7 M |
| **MapReduce page** | 1.83 MB (modules 1.60 MB, fonts 68.3 KB, CSS 162.2 KB) | **1.13 MB** (modules 935.7 KB, fonts 68.3 KB, CSS 135.0 KB) |
| Raft page | 1.89 MB | 1.16 MB |
| Time to first frame, 1440×900 / 390×844 (`file://`, navigation to first drawn frame) | 3.78 s / 2.79 s | 3.73 s / 2.48 s |
| DOMContentLoaded, 1440×900 / 390×844 | 788 / 763 ms | 693 / 531 ms |
| **Handout pictures**, MapReduce (8 pictures, Share → Handout until ready) | 26.6 s | **21.6 s** |
| `audit` frame time, 1440×900 / 390×844 (one run each) | 156.7 / 14.1 ms | 182.7 / 10.6 ms (see below) |
| Frozen screenshots (`shoot`), MapReduce, all 4 stories, both themes and sizes | | 157 / 160 pixel-identical; `main` against itself: 159 / 160 |
| Unit tests / verify on all 8 | 321 / 0 failing | 325 / 0 failing |

**About the audit's frame time.** The brief's target was audit's "166–185 ms" frame-time warning. That number is
the CPU time of the *last* frame audit draws, which is the scale shot's packing, and it leaves out the GPU's time. So
it does not measure what makes play slow here, and the 157 vs 183 ms gap is noise between runs: a CPU profile of that
frame gives 17–69 ms on `main` and 21–29 ms here. On a machine without a GPU, the real cost is fill, which the
live-play and full-frame rows measure.

---

## 1. Drafts: frames in motion when there is no GPU

`57a6135`, `1ca3420`. Files: `engine/runtime.mjs`, `engine/gfx/look.mjs`, `engine/gfx/select.mjs`, both renderers,
`engine/gfx/backends/webgpu/device.mjs`, CONTRACTS.md 3.1, `references/tooling.md`.

**The problem.** Without a GPU a full frame takes about 1.5 s at 1440×900, so live play ran at under one frame a
second. Compositing and the HUD are not the cause: with the WebGL draw removed the page runs at 60 fps, and turning
off backdrop blur changed nothing. Geometry is not the cause either. It is fill: full resolution with 4× MSAA,
2048 px shadow and contact maps, 6 bloom levels and tilt-shift.

**What changed.**
- While playing, and while the camera or the HUD's insets still move, the runtime passes `draft: true` for a frame
  the next one replaces at once.
- On a software rasterizer (`look.mjs` `SOFTWARE`, read from WebGL's unmasked renderer or the WebGPU adapter's info),
  WebGL2 draws a draft at three quarters of the pixel ratio, with the low preset's maps and no MSAA or tilt-shift
  (`look.mjs` `DRAFT`). It resizes the canvas's backing store, so picking and projection stay consistent. WebGPU
  mirrors it at three quarters of its scene scale.
- When the camera comes to rest on a draft (`renderer.drafted`), the runtime draws that frame again in full.
- Captured frames, snapshots and the handout never draft, and a GPU never does. `__gfx.debug.draft = false` turns
  drafts off.

**Why three quarters, not half.** Half the pixel ratio was faster (4.2 fps at 1440×900, 11.3 on the phone, same
session), but the world's names (map 0, reduce 1, input) could not be read while it played, and on a teaching page
that matters more than frame rate. At three quarters they can:

| `main`, playing | Draft at 0.5, playing | Draft at 0.75 (this branch), playing |
|---|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/shots/main-1440-playing.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/shots/draft-0.5-1440-playing.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/shots/draft-0.75-1440-playing.png?raw=true) |

On the phone, in the wide shot:

| `main`, playing | Draft at 0.5, playing | Draft at 0.75 (this branch), playing |
|---|---|---|
| ![](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/shots/main-390-playing.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/shots/draft-0.5-390-playing.png?raw=true) | ![](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/shots/draft-0.75-390-playing.png?raw=true) |

Paused, the frame is the full one again:

![](https://github.com/irfanalimd/explainer/blob/review/09-page-speed/shots/draft-0.75-1440-at-rest.png?raw=true)

Against `main`, the resting frame differs only by film grain (at most 4/255), the same as two runs of `main` differ
from each other.

## 2. A smaller page

**Strip comments and indentation** (`25e39c8`, `scripts/build.mjs`, `scripts/lib/modules.mjs`). 1.25 MB of module
source and 166 KB of `hud.css` shipped, much of it comments and indentation. `minify()` reuses the build's existing
lexer and keeps every token byte for byte, so template literals (a figure's `code` export) are untouched. A gap
between tokens becomes a newline if it held one, so automatic semicolons don't move; nothing next to brackets,
commas, semicolons and quotes; otherwise one space. `minifyCss()` drops comments and collapses whitespace, keeping
strings and `url()`s. A test minifies every `.mjs` in the skill (179 files) and parses it with `vm.SourceTextModule`.
MapReduce 1.83 → 1.37 MB; 40 / 40 frozen screenshots pixel-identical to `main`.

**Plain-text data URLs** (`8d9f04e`). `moduleUrl()` builds `data:text/javascript,` URLs, escaping only `%`, `#` and
control characters (which the URL parser would drop or cut at); non-ASCII goes through as UTF-8. 1.37 → 1.13 MB.

Not done: subsetting the Geist fonts (68 KB; no font tool offline here), and dropping CSS (none could be proven
unused).

## 3. Less work per frame on WebGL2

`905284f`, `engine/gfx/backends/webgl2/renderer.mjs`. The WebGPU tier already draws only the solid part of the slab
template for slabs without a well; WebGL2 drew every index, including the well's empty triangles, in the shadow,
main and pick passes. It now splits the packer's classes the same way; tiny slabs still use the small template, so
the pixels are the same. The closing scale shot: 10.0 M → 7.7 M triangles a pass, 12.5–22.8 s → 9.8–12.2 s a frame.
Mid-run frames are fill-bound, so they did not get measurably faster.

## 4. The handout's pictures

`6e8401a`, `engine/runtime.mjs`. Each picture read the WebGL canvas back twice (once to trim, once to crop), and
after the last picture the page's frame was redrawn although the handout still covered it. Now the free area is
copied out once and trimmed and cropped from that copy, and the covered redraw is skipped (closing the handout
redraws anyway). 26.6 → 21.6 s, with every JPEG byte-identical to `main`'s.

## 5. Docs

`f054ccc`, `6881491`: the known gaps say how fast live play runs without a GPU now, and how to start Chrome's WebGPU
on SwiftShader, and why that still cannot check the WebGPU tier.

## Checks

- Frozen screenshots unchanged: happy 40 / 40 pixel-identical at every commit; all 4 MapReduce stories 157 / 160
  (the 3 that differ change 2–23 px; a second run of `main` against its first gives 1 / 160 with 43 px, the
  machine's own first-frame flakiness); Raft 24 / 24.
- Handout JPEGs byte-identical; builds byte-deterministic; pages work from `file://`.
- `verify.mjs` on all 8 examples: 0 failing ([log](verify-after.txt)). Unit tests 325 / 325 ([log](tests-after.txt)).
- Every screenshot here was read.
- **Not verified:**
  - **A real GPU.** Nothing should change there (no drafts), but it is untested.
  - **WebGPU look and parity.** With `--enable-unsafe-webgpu --enable-features=Vulkan,WebGPUService
    --use-angle=swiftshader --use-webgpu-adapter=swiftshader --disable-vulkan-surface` Chrome starts the WebGPU
    tier (its self-test passes), but its canvas is blank in screenshots, on `main` too. So WebGPU and WebGL2 frames
    could not be compared, and the draft mirror's numbers under those flags are not trustworthy.
- **Risks:**
  - The minifier relies on the lexer telling a regex from a division. A regex the lexer took for division and that
    contains `//` would be mangled. Every module in the repo parses after minifying, but an author's unusual code
    could hit it.
  - Going from draft to full reallocates the WebGL2 render targets once at each play/rest change.
  - Line numbers in errors from the built page no longer match the source.

## Next

1. **Check the WebGPU tier and its draft mirror** on a real GPU and on a software adapter that actually presents.
   Also check the tiny template and solid prefix match between the two tiers.
2. A draft scale that adapts to frame time, as WebGPU's governor does, instead of a fixed 0.75.
3. Draft the frames where only an afterglow is fading, too. They are full frames now, which is slow without a GPU;
   it needs a way to tell them from the WebGPU tier's temporal convergence (both report `busy`).
4. Cache the shadow, contact and bounce maps while the slabs and bounds are unchanged (camera orbits, hover
   redraws): the same pixels, minus fixed-size passes.
5. The runtime's 1/20 s cap per frame still makes live play crawl at a few fps. Separating the playhead's step from
   the frame cap would change behaviour, so it needs a decision.
6. The scale shot's CPU packing (20–70 ms) is what audit reports as frame time.
7. The tiny template on WebGL2, as on WebGPU: it changes pixels slightly, so it needs a decision.
8. Subset Geist (68 KB): needs a font tool.
