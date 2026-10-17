// Scale shots ("powers of ten", s.scale): the run's small world pulls back into a field of the real system's size.
// A cheap aggregate picture, not a simulation. Every machine in the field is a silhouette of one of the run's own,
// lit as busy; nothing in it is computed. The field's count and every printed line come from the figure (from the
// run or from a cited source, labelled as such), and the field always prints its note ("shown at scale, simplified").
//
// One shared schedule drives both sides: the reveal box grows from the `from` entities to the whole field, in log
// size (each second of the pull-back multiplies the view by the same factor), the director frames that box, and each
// machine rises out of the floor as the box reaches it, so the field is built at the edge of the frame.
import { SIZE } from "../tokens.mjs";
import { easeInOut } from "./transitions.mjs";
import { clamp01 } from "./util.mjs";

// the pull-back's curve: near-constant speed in log size (powers of ten), with soft ends
const glide = (x) => (1 - Math.cos(Math.PI * x)) / 2;

export const SCALE = {
  dur: 12.5,         // s: the whole shot at 1x (a longer caption reading time wins)
  hold: 0.6,         // s on the run before the pull-back starts
  pull: 7.6,         // s of pull-back
  rise: 0.75,        // s a machine takes to rise out of the floor
  lead: 0.06,        // a machine starts rising this far (in reveal progress) before the box reaches it
  gap: 28,           // u between neighbouring machines
  aisle: 84,         // u: a cross aisle every `bay` machines, and a walkway between row pairs
  bay: 8,
  clear: 150,        // u of bare floor kept round the run
  aspect: [0.78, 1.55],   // the field's plan aspect follows the world's, within these
  note: "shown at scale, simplified",
  perLine: 52,       // characters per printed line at most (long lines wrap)
  text: { landscape: { title: 0.04, line: 0.0145 }, portrait: { title: 0.082, line: 0.031 } },   // sizes, × field width
  textIn: [0.72, 0.92],   // reveal progress over which the printed lines fade in
  task: { min: 4.2, max: 8.5, done: 0.16, fade: 0.35 },   // s per simplified task cycle, the share of it shown done, LED fade s
  // the work wave: once the field is up, the master hands every machine a piece of input (a page in its tray), in a
  // wave out from the run; each finished task flashes it. Starts this long before the pull-back ends, and sweeps
  work: { lead: 1.4, sweep: 2.6, drop: 0.55, lift: 24, size: 1.3, flash: 0.5 },
};

// a field machine's state row (emitScale) and the LED states it names, by index
export const FIELD_ROW = 6;
export const FIELD_LEDS = ["idle", "busy", "ok"];
const LED = { idle: 0, busy: 1, ok: 2 };

const growBox = (b, x0, y0, x1, y1) => {
  b.minX = Math.min(b.minX, x0); b.minY = Math.min(b.minY, y0); b.maxX = Math.max(b.maxX, x1); b.maxY = Math.max(b.maxY, y1);
};
const emptyBox = () => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
// a stable 0..1 from an index (no Math.random: the field is the same on every run)
const unit = (i, salt) => {
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

/** Reveal progress (0..1, eased) at `local` seconds into the scale step. Reduced motion cuts. */
export function revealAt(local, reduced = false) {
  const x = (local - SCALE.hold) / SCALE.pull;
  return reduced ? (x > 0 ? 1 : 0) : glide(clamp01(x));
}

/** The box the reveal has reached at progress q: centre lerps, half sizes grow geometrically. */
export function revealBox(plan, q, out = {}) {
  const a = plan.box0, b = plan.box1;
  const ax = (a.maxX - a.minX) / 2, ay = (a.maxY - a.minY) / 2, bx = (b.maxX - b.minX) / 2, by = (b.maxY - b.minY) / 2;
  const cx = (a.minX + a.maxX) / 2 + ((b.minX + b.maxX) / 2 - (a.minX + a.maxX) / 2) * q;
  const cy = (a.minY + a.maxY) / 2 + ((b.minY + b.maxY) / 2 - (a.minY + a.maxY) / 2) * q;
  const hx = ax * Math.pow(bx / ax, q), hy = ay * Math.pow(by / ay, q);
  out.minX = cx - hx; out.maxX = cx + hx; out.minY = cy - hy; out.maxY = cy + hy;
  out.minZ = 0; out.maxZ = q < 0.5 ? a.maxZ ?? 0 : 0;
  return out;
}

// lattice coordinate k (centred, may be a half integer) -> u, with an aisle after every `bay` cells
const lattice = (k, pitch, bay, aisle) => k * pitch + Math.round(k / bay) * aisle;

// word wrap to at most `max` characters per line, never breaking an equation like "R = 5,000"
function wrap(text, max) {
  const out = [];
  let line = "";
  for (const w of String(text).split(/(?<!=)\s+(?!=)/)) {
    if (line && line.length + 1 + w.length > max) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}

/**
 * Lay out a scale field (once, at compile).
 * @param {{count:number, run:string[], title?:string, lines?:string[], note?:string}} spec  as s.scale recorded it
 * @param {{world:object, from:object, like:{w:number, d:number, h:number, variant:string}}} geo
 *        world: the run's bounds; from: where the pull-back starts; like: the silhouette every field machine copies
 */
export function planScale(spec, { world, from, like }) {
  const n = Math.max(0, Math.round(spec.count) - spec.run.length);
  const px = like.w + SCALE.gap, py = like.d + SCALE.gap;
  const ww = world.maxX - world.minX, wd = world.maxY - world.minY;
  const wcx = (world.minX + world.maxX) / 2, wcy = (world.minY + world.maxY) / 2;
  const aspect = Math.min(SCALE.aspect[1], Math.max(SCALE.aspect[0], ww / Math.max(1, wd)));
  const clear = { minX: world.minX - SCALE.clear, maxX: world.maxX + SCALE.clear, minY: world.minY - SCALE.clear, maxY: world.maxY + SCALE.clear };
  const blocked = (x, y) => x + like.w / 2 > clear.minX && x - like.w / 2 < clear.maxX && y + like.d / 2 > clear.minY && y - like.d / 2 < clear.maxY;

  // the smallest cols x rows of the right plan aspect that holds n machines round the cleared middle
  const cellsOf = (cols, rows) => {
    const out = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = wcx + lattice(i - (cols - 1) / 2, px, SCALE.bay, SCALE.aisle), y = wcy + lattice(j - (rows - 1) / 2, py, 2, SCALE.aisle);
      if (!blocked(x, y)) out.push({ x, y, j });
    }
    return out;
  };
  let cells = [];
  for (let rows = 1; cells.length < n; rows++) cells = cellsOf(Math.max(1, Math.round((aspect * rows * py) / px)), rows);
  // fill from the front row back; the last (far) row takes what is left, centred
  cells.sort((a, b) => b.j - a.j || a.x - b.x);
  let picked = cells.slice(0, n);
  const spare = cells.length - n;
  if (spare > 0 && n > 0) {
    const lastJ = picked[picked.length - 1].j;
    const row = cells.filter((c) => c.j === lastJ), keep = row.length - spare;
    if (keep > 0 && keep < row.length) {
      const skip = Math.floor((row.length - keep) / 2);
      picked = cells.filter((c) => c.j !== lastJ).slice(0, n - keep).concat(row.slice(skip, skip + keep));
    }
  }

  const field = emptyBox();
  growBox(field, world.minX, world.minY, world.maxX, world.maxY);
  for (const c of picked) growBox(field, c.x - like.w / 2, c.y - like.d / 2, c.x + like.w / 2, c.y + like.d / 2);
  const fw = field.maxX - field.minX;

  // the printed lines, in front of the field: a title, the figure's lines, the note. Portrait fields print larger.
  const portrait = aspect < 1;
  const sz = SCALE.text[portrait ? "portrait" : "landscape"];
  const title = sz.title * fw, line = sz.line * fw, perLine = Math.max(16, Math.min(SCALE.perLine, Math.floor((0.94 * fw) / (0.6 * line))));
  const texts = [];
  let y = field.maxY + SCALE.aisle + title * 0.75;
  const cx = (field.minX + field.maxX) / 2;
  if (spec.title) { texts.push({ text: spec.title, x: cx, y, size: title, font: "sans", weight: 600, tone: null }); y += title * 0.95; }
  for (const l of spec.lines ?? []) for (const w of wrap(l, perLine)) { texts.push({ text: w, x: cx, y, size: line, font: "sans", weight: 500, tone: null }); y += line * 1.5; }
  for (const w of wrap(spec.note ?? SCALE.note, perLine)) { texts.push({ text: w, x: cx, y: y + line * 0.3, size: line, font: "sans", weight: 600, tone: null }); y += line * 1.5; }
  growBox(field, cx - fw / 2, field.minY, cx + fw / 2, y);

  const box0 = { ...from };
  const plan = {
    count: Math.round(spec.count), run: spec.run.slice(), n: picked.length, like: { ...like },
    xy: new Float32Array(picked.length * 2), tIn /* s into the step a machine starts rising */: new Float32Array(picked.length),
    tWork /* s into the step its first piece of input lands */: new Float32Array(picked.length),
    period: new Float32Array(picked.length), phase: new Float32Array(picked.length),
    texts, box0, box1: { ...field, minZ: 0, maxZ: like.h }, field,
  };
  // when each machine enters the reveal box: the first progress q at which its centre is inside (bisection)
  const box = {};
  const far = Math.max(1, ...picked.map((c) => Math.hypot(c.x - wcx, c.y - wcy)));
  const W = SCALE.work, start = SCALE.hold + SCALE.pull - W.lead;
  picked.forEach((c, k) => {
    plan.tWork[k] = start + (Math.hypot(c.x - wcx, c.y - wcy) / far) * W.sweep;
    plan.xy[2 * k] = c.x; plan.xy[2 * k + 1] = c.y;
    const inside = (q) => { revealBox(plan, q, box); return c.x >= box.minX && c.x <= box.maxX && c.y >= box.minY && c.y <= box.maxY; };
    let lo = 0, hi = 1;
    if (inside(0)) hi = 0;
    else for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (inside(m)) hi = m; else lo = m; }
    plan.tIn[k] = timeOfQ(Math.max(0, hi - SCALE.lead));
    plan.period[k] = SCALE.task.min + (SCALE.task.max - SCALE.task.min) * unit(k, 1);
    plan.phase[k] = unit(k, 2);
  });
  return plan;
}

// A simplified task cycle, once a machine has work: busy, then briefly done between tasks, its LED crossfading and
// its piece of input flashing as each task finishes. No count is implied. Before its work lands a machine idles.
// Writes [led, ledPrev, ledMix] (FIELD_LEDS indices; -1: none) into row at o and returns the time since the last
// task finished (Infinity while busy, NaN before any work)
function task(plan, k, local, row, o) {
  if (local < plan.tWork[k]) { row[o] = LED.idle; row[o + 1] = -1; row[o + 2] = -1; return NaN; }
  const P = plan.period[k], doneT = SCALE.task.done * P, f = SCALE.task.fade;
  const tc = (((local / P + plan.phase[k]) % 1) + 1) % 1 * P;
  const done = tc < doneT;
  row[o] = done ? LED.ok : LED.busy; row[o + 1] = done ? LED.busy : LED.ok;
  row[o + 2] = clamp01(done ? tc / f : (tc - doneT) / f);
  return done ? tc : Infinity;
}

// the machine's piece of input, in its tray: dropped in by the work wave, flashing when a task finishes.
// Writes [page z, flash] into row at o (NaN z: no page yet)
function work(plan, k, local, reduced, done, row, o) {
  const W = SCALE.work, since = local - plan.tWork[k];
  if (since < 0 && !reduced) { row[o] = NaN; row[o + 1] = 0; return; }
  const land = reduced ? 1 : easeInOut(clamp01(since / W.drop));
  row[o] = plan.like.h - SIZE.well.depth + W.lift * (1 - land);
  row[o + 1] = reduced ? 0 : Math.max(clamp01(1 - (since - W.drop) / W.flash) * (since >= W.drop ? 1 : 0), clamp01(1 - done / W.flash));
}
const TRAY_Y = (SIZE.housing.header - SIZE.well.inset) / 2;   // the skin's default tray sits under the header

// reveal progress q -> seconds into the step (the inverse of revealAt, by bisection)
function timeOfQ(q) {
  if (q <= 0) return SCALE.hold;
  let lo = 0, hi = 1;
  for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; if (glide(m) < q) lo = m; else hi = m; }
  return SCALE.hold + hi * SCALE.pull;
}

/**
 * The field at `local` seconds into the scale step, pushed onto `poses`: one "field" pose for all the machines (the
 * skin dresses each as a housing of the run's silhouette with its piece of input in the tray) and the printed lines.
 * Its `state` holds a row of FIELD_ROW numbers per machine: [z, led, ledPrev, ledMix, page z, page flash], with
 * z NaN for a machine not risen yet. Pure in (plan, local, reduced).
 * Returns the reveal progress and box for the frame (frame.scale).
 */
export function emitScale(plan, local, poses, reduced = false) {
  const q = revealAt(local, reduced);
  const { w, d, h, variant } = plan.like;
  const state = new Float64Array(plan.n * FIELD_ROW);
  for (let k = 0, o = 0; k < plan.n; k++, o += FIELD_ROW) {
    const r = reduced ? (q > 0 ? 1 : 0) : clamp01((local - plan.tIn[k]) / SCALE.rise);
    if (r <= 0) { state[o] = NaN; continue; }
    state[o] = -h * (1 - easeInOut(r));
    const done = task(plan, k, local, state, o + 1);
    work(plan, k, local, reduced, done, state, o + 4);
  }
  const W = SCALE.work;
  poses.push({
    id: null, kind: "field", n: plan.n, xy: plan.xy, state, leds: FIELD_LEDS, like: { w, d, h, variant },
    page: { dy: TRAY_Y, w: SIZE.page.w * W.size, d: SIZE.page.d * W.size, h: SIZE.page.h }, opacity: 1,
  });
  const fade = reduced ? (q > 0 ? 1 : 0) : clamp01((q - SCALE.textIn[0]) / (SCALE.textIn[1] - SCALE.textIn[0]));
  if (fade > 0) for (const t of plan.texts) {
    poses.push({ id: null, kind: "text", x: t.x, y: t.y, z: 0, text: t.text, size: t.size, font: t.font, weight: t.weight,
        tone: t.tone, variant: "floor", align: "center", opacity: fade, h: 0 });
  }
  return { q, box: revealBox(plan, q) };
}

