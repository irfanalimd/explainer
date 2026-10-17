// The per-frame uniform block every scene pass reads, described once: the WGSL struct is generated from the
// same field list the JS writer uses, so the two can never drift. Every field is 16-byte aligned.
const FIELDS = [
  ["viewProj", "mat4x4f"], ["lightVP", "mat4x4f"],
  ["vpNow", "mat4x4f"], ["vpPrev", "mat4x4f"],   // un-jittered view-projection now and at the last frame drawn (motion)
  ["eye", "vec4f"],          // xyz, theme (0 dark, 1 light)
  ["keyDir", "vec4f"],       // xyz, key intensity
  ["fillDir", "vec4f"],      // xyz, fill intensity
  ["light", "vec4f"],        // ambient, ground, norm, point-light count
  ["shadowP", "vec4f"],      // 1/size, extent u, depth range u, enabled
  ["shade", "vec4f"],        // light size, solid pool, pool gain, time
  ["contactRect", "vec4f"],  // x0, y0, 1/w, 1/h
  ["envGain", "vec4f"],      // ambient env, strip, key box, back gain
  ["envTint", "vec4f"],      // rgb, contact k
  ["scene", "vec4f"],        // centre xy, half extents xy of the scene on the floor
  ["shadowMix", "vec4f"],    // rgb, horizon k
  ["bounceSatin", "vec4f"],  // bounce dark, bounce light, satin, tile lift
  ["accent", "vec4f"],       // accent emissive gain, halo
  ["lit", "vec4f"],          // attention colour (linear), atlas size
  ["stage", "vec4f"],        // rgb (linear), atlas spread px
  ["stageLift", "vec4f"], ["stageEdge", "vec4f"], ["horizon", "vec4f"], ["horizonAlt", "vec4f"],
  ["grid", "vec4f"], ["gridMajor", "vec4f"],   // sRGB rgba
  ["quad", "vec4f"],         // floor quad centre xy, half size
  ["viewport", "vec4f"],     // W, H, 1/W, 1/H (device px)
  ["keyPlan", "vec4f"],      // key light direction on the floor xy, world units per device px, sample index
  ["grooveRim", "vec4f"],    // sRGB catch-light colour
  ["reflect", "vec4f"],      // floor reflection: strength, F0, blur height u, enabled
  ["glass", "vec4f"],        // glass: ior, frost px, plinth height u, enabled
  ["glassTint", "vec4f"],    // linear rgb, absorption per u
  ["glassLook", "vec4f"],    // edge, reflection, etch, 0
  ["mat", "array<vec4f, 4>"],  // per material: rough, spec, rim, metal
  ["lp", "array<vec4f, 16>"],  // point lights: xyz, radius
  ["lc", "array<vec4f, 16>"],  // linear rgb * intensity
];
const FLOATS = { mat4x4f: 16, vec4f: 4 };
const sizeOf = (type) => FLOATS[type] ?? 4 * Number(/(\d+)>$/.exec(type)[1]);

const OFFSET = {};
let total = 0;
for (const [name, type] of FIELDS) { OFFSET[name] = total; total += sizeOf(type); }

export const FRAME_WGSL = `struct Frame {\n${FIELDS.map(([n, t]) => `  ${n}: ${t},`).join("\n")}\n}`;
export const FRAME_BYTES = total * 4;

/** CPU mirror of the Frame block: set fields by name, then upload `data`. */
export class FrameBlock {
  constructor() { this.data = new Float32Array(total); }
  set(name, values, at = 0) { this.data.set(values, OFFSET[name] + at); return this; }
  get(name, n = 4) { return this.data.subarray(OFFSET[name], OFFSET[name] + n); }
}
