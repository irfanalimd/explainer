// The Prism design language (DESIGN.md) as data. Every module reads its look from here:
// the renderer (colours, materials, light), the scene (sizes, motion), the HUD (CSS variables).
// Change a value here and every figure changes with it. Nothing else may hard-code a colour or a size.

export const THEMES = ["dark", "light"];

// sRGB hex. The renderer converts to linear. Alpha colours are [r, g, b, a] in 0..1 sRGB.
export const PALETTE = {
  dark: {
    // the stage: a deep ink-blue studio sweep that falls off into darkness
    stage: "#0D111C",
    stageLift: "#222A47",          // centre of the radial key light on the floor
    stageEdge: "#06080E",          // far falloff
    // atmosphere: behind the world the floor rises into a soft two-hue horizon glow (an aurora, never a rainbow)
    horizon: "#28308C",            // indigo, left of centre
    horizonAlt: "#135673",         // deep teal, right of centre
    shadow: "#4A4FB0",             // hue of shadowed light: shadows lean cool blue-violet, never neutral grey
    grid: [0.72, 0.8, 1, 0.07],
    gridMajor: [0.72, 0.8, 1, 0.12],

    // solids
    housing: "#262C3D",            // anodised graphite
    housingAlt: "#2D3448",         // second housing tone (stores, clients)
    well: "#1E2333",               // recessed tray floor
    tile: "#353D52",               // neutral ceramic tile
    tileInk: "#F3F5FA",
    ghost: "#1E2333",              // placeholder / empty slot
    metal: "#8E939C",              // pins, pointers, rods

    // inks (DOM and engraved text)
    ink: "#F1F3F8",
    inkMuted: "#9AA3B8",
    inkFaint: "#5E6780",
    engrave: "#C9D0DF",            // engraved titles on housings

    // inlays
    groove: "#0A0D17",
    grooveRim: "#56628A",
    zoneFill: [1, 1, 1, 0.025],
    zoneBorder: [1, 1, 1, 0.10],

    // status (LEDs, tones)
    ok: "#3DDC97",
    busy: "#6E9BFF",
    warn: "#FFB224",
    fail: "#FF4D4F",
    idle: "#4C5570",
    off: "#23262C",

    // identity: one hue per key, partition, thread or node. Same order in every figure.
    keys: ["#4F8CFF", "#FF7A5C", "#2FD3A0", "#A47BFF", "#FFC34D", "#FF5FA2", "#38C8F2", "#9BE15D"],
    keyInk: "#0B0C0F",             // label ink on a keyed tile

    // attention
    lit: "#FFFFFF",                // warm white emission of the one thing to watch
    select: "#FFFFFF",             // selection ring

    // HUD glass
    glass: [0.07, 0.075, 0.09, 0.62],
    glassBorder: [1, 1, 1, 0.08],
    glassHighlight: [1, 1, 1, 0.06],
    scrim: [0.03, 0.035, 0.045, 0.85],
  },
  light: {
    // the stage: warm porcelain paper under a soft softbox
    stage: "#ECEFF5",
    stageLift: "#FFFFFF",
    stageEdge: "#DFE4EC",
    horizon: "#DDE5FA",            // cool white sweep with a breath of blue
    horizonAlt: "#E8E2F8",         // and of lilac
    shadow: "#6F84B4",             // soft blue-grey shadows
    grid: [0, 0, 0, 0.06],
    gridMajor: [0, 0, 0, 0.10],

    housing: "#FFFFFF",            // white ceramic
    housingAlt: "#F5F7FB",
    well: "#EEF1F7",
    tile: "#FFFFFF",
    tileInk: "#17181C",
    ghost: "#E9E8E3",
    metal: "#8A8F98",

    ink: "#141519",
    inkMuted: "#626B7E",
    inkFaint: "#A3A6AC",
    engrave: "#4A5366",

    groove: "#D3D9E4",
    grooveRim: "#FFFFFF",
    zoneFill: [0, 0, 0, 0.025],
    zoneBorder: [0, 0, 0, 0.12],

    ok: "#13A86B",
    busy: "#3D6FE8",
    warn: "#D98A00",
    fail: "#E5383B",
    idle: "#BEC1C7",
    off: "#DCDBD6",

    keys: ["#3B7BF7", "#FF6A4A", "#14B98A", "#8F63F5", "#F2AE1F", "#F04B92", "#1DB2E0", "#7CC63C"],
    keyInk: "#0B0C0F",

    lit: "#17181C",                // in light, attention is ink plus elevation, not white light
    select: "#141519",

    glass: [1, 1, 1, 0.72],
    glassBorder: [0, 0, 0, 0.07],
    glassHighlight: [1, 1, 1, 0.9],
    scrim: [0.96, 0.955, 0.94, 0.88],
  },
};

// World units ("u"). One u is one CSS pixel at the reference zoom. x right, y toward the viewer, z up.
export const SIZE = {
  grid: 16,
  gridMajor: 128,

  tile:    { w: 26, d: 26, h: 5,   r: 5,   bevel: 1.3, gap: 5, label: 9.5, sub: 6 },
  record:  { w: 64, d: 24, h: 5,   r: 5,   bevel: 1.3, gap: 5, label: 9,   sub: 6.5 }, // key/value records
  bit:     { w: 12, d: 18, h: 3.5, r: 2.5, bevel: 0.9, gap: 2, label: 8 },
  page:    { w: 50, d: 30, h: 4,   r: 4,   bevel: 1.1, gap: 5, label: 8.5 },

  housing: { h: 11, r: 10, bevel: 1.8, pad: 10, header: 28, title: 12.5, sub: 7.5, led: 3, minW: 120, minD: 80 },
  // silhouette per housing variant; r: "round" means a disc/puck (w = d, r = w / 2)
  variant: {
    node:   { h: 11, r: 10, bevel: 1.8 },
    client: { h: 9,  r: 16, bevel: 2.0 },
    store:  { h: 12, r: "round", bevel: 2.0 },
    queue:  { h: 8,  r: 8,  bevel: 1.6 },
    chip:   { h: 9,  r: 6,  bevel: 1.3 },
  },
  // the tray is a real recess in the housing top; tiles in a housing sit on its floor at z = variant.h - well.depth
  well:    { inset: 7, r: 7, depth: 1.5, lip: 0.7 },
  // a thin base plate under free-standing containers (arrays, queues on the floor); their tiles sit at z = plate.h
  plate:   { h: 2.5, pad: 7, r: 8 },

  trace:   { w: 2.2, bus: 3.6, corner: 16, portGap: 6 },
  packet:  { w: 13, d: 7.5, h: 4.5, lift: 9, light: 34 },
  lane:    { w: 4, tickMinor: 10, tickMajor: 50, label: 7, gap: 56 },
  zone:    { r: 20, pad: 28, title: 10 },
  pointer: { h: 26, rod: 1.4, flag: 11, label: 8 },
  meter:   { h: 4, r: 2 },

  gutter: 84,    // default gap between columns / boards
};

export const MATERIAL = {
  matte:   { rough: 0.85, spec: 0.08, rim: 0.10 },   // stage, housings
  ceramic: { rough: 0.45, spec: 0.35, rim: 0.18 },   // tiles, records
  glass:   { rough: 0.10, spec: 0.90, rim: 0.60, alpha: 0.35 },
  metal:   { rough: 0.30, spec: 0.75, rim: 0.30 },
};

// Prism finish: how state, data and attention light the world (renderer + skin read these)
export const ACCENT = {
  strip: 1.0,                   // u, thickness of the status light strip along the header's bottom edge
  gap: 3.2,                     // u, from the strip to the tray's top edge
  level: { ok: 1.0, busy: 1.05, warn: 1.1, fail: 1.45, idle: 0.16, off: 0 },
  ring: 0.6,                    // a round well's accent ring is long: it burns at this share of the level
  emissive: { dark: 1.25, light: 0.85 },
  halo: 0.32,                   // light the strip throws onto the housing top around it
  rim: 0.045,                   // the matching faint rim on the bevel (x level)
  failHz: 0.45,                 // a crashed node's accent breathes slowly (its LED still blinks at 1.6 Hz)
  lit: 1.7,                     // a lit (leader-like) housing: brighter accent and a floor light pool
  pool: { radius: 0.62, intensity: 0.75 },   // radius x the housing's larger side
  crash: { desaturate: 0.8, darken: { dark: 0.32, light: 0.12 } },  // a failed housing goes dark and grey; its accent glows red
};

export const GLOW = {
  trace: 0.5,                   // channel-core emission per unit pose.glow while data flows (light tube)
  pulse: 1.7,                   // scene pulse intensity (0..1) -> HDR emission of the travelling trail
  afterglow: 1.1,               // s, a recently used trace keeps a faint glow that fades over this long
  afterLevel: 0.5,              // afterglow start, x the trace's last glow
  satin: 0.16,                  // keyed tiles: satin top gradient (inner luminance), x saturation
  tileLift: { dark: 0.035, light: 0 },       // keyed tiles' faint self-luminance (they are the brightest things)
  ping: { radius: 15, width: 1.3, time: 0.7, alpha: 0.95 },   // floor ping ring for lit / arriving tiles
  bounce: { dark: 1.0, light: 0.5, sigma: 10 },              // colour bounce from data onto nearby surfaces
};

export const LIGHT = {
  // directions point TOWARD the light, in world (x right, y toward viewer, z up)
  key: { dir: [-0.42, -0.38, 0.82], dark: 1.0, light: 0.92 },
  fill: { dir: [0.6, 0.3, 0.55], dark: 0.22, light: 0.35 },
  ambient: { dark: 0.30, light: 0.62 },
  shadowSoftness: 2.2,
  shadowTint: { dark: 0.42, light: 0.34 },   // how far shadows lean toward PALETTE.*.shadow
  maxPointLights: 16,
};

export const POST = {
  dark:  { bloom: 0.85, bloomRadius: 0.75, grain: 0.022, vignette: 0.32, exposure: 1.0, horizon: 1.0 },
  light: { bloom: 0.40, bloomRadius: 0.60, grain: 0.012, vignette: 0.10, exposure: 1.0, horizon: 1.0 },
  // tilt-shift depth of field (quality high only, off with reduced motion): the focus band (around the camera
  // target and the world's rows) stays crisp; beyond it the far rows soften up to `far` CSS px, near ones `near`
  dof: { far: 1.8, near: 0.9, band: 0.3, ramp: 0.26 },
};

export const CAMERA = {
  fov: 20,          // long lens: product-shot perspective, little distortion
  pitch: 57,        // degrees above the horizon
  yaw: 0,           // 0 keeps columns square to the screen
  minPitch: 28, maxPitch: 84,
  yawRange: 40,     // user orbit limit, degrees either side
  drift: 2.5,       // idle cinematic drift, degrees of yaw
  margin: 0.06,     // frame margin, fraction of the shorter side
};

export const MOTION = {
  step: 1.2,                    // seconds per step at 1x
  ease: [0.2, 0.0, 0.0, 1.0],   // emphasised decelerate (cubic-bezier)
  easeInOut: [0.65, 0.0, 0.35, 1.0],
  hop: { k: 0.32, min: 12, max: 72 },  // arc height = clamp(k * distance)
  lift: 8,                      // how high a tile rises before travelling
  stagger: 0.045,               // seconds between siblings in a beat
  enter: 0.45, exit: 0.40, flash: 0.55, roll: 0.28,
  litRise: 3.5,                 // the lit object lifts this many u
  camera: { omega: 3.0, deadZone: 0.70, zoomHysteresis: 0.22 },
  speeds: [0.5, 1, 1.5, 2, 4],
  // a step lasts at least as long as its caption takes to read at 1x; motion stretches at most 1.35x, the rest is a hold
  read: { base: 1.0, perWord: 0.3, max: 6.5, stretch: 1.6 },
  // meta.level "intro" (a first encounter with the idea) reads a little slower: reading time and its cap scale by this
  readIntro: 1.2,
};

export const TYPE = {
  sans: "Geist",
  mono: "Geist Mono",
  fallbackSans: "ui-sans-serif, -apple-system, 'Segoe UI', system-ui, sans-serif",
  fallbackMono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  // HUD scale, CSS px
  kicker: 11, title: 26, subtitle: 14, caption: 17, ui: 13, small: 11.5, code: 12.5,
};

// Turn a hex colour into sRGB floats.
export function hex(c) {
  if (Array.isArray(c)) return c;
  const s = c.replace("#", "");
  const n = parseInt(s.length === 3 ? s.split("").map((x) => x + x).join("") : s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const keyColor = (theme, index) => PALETTE[theme].keys[((index % 8) + 8) % 8];
