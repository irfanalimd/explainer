// node --test engine/gfx/skin.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { skin, SKIN_KINDS, toneColors, bezier, inkOn, chevron } from "./skin.mjs";
import { DrawList } from "../contracts.mjs";
import { PALETTE, SIZE, MOTION, ACCENT, GLOW, WORLD_TYPE, keyColor, worldCase } from "../tokens.mjs";
import { galleryScene } from "./gallery-scene.mjs";
import { srgba } from "./color.mjs";

const run = (poses, o = {}) => skin(poses, new DrawList(), { theme: "dark", time: 0, ...o });
const P = PALETTE.dark;

test("every pose kind in CONTRACTS 4.6 has a look", () => {
  for (const k of ["housing", "container", "tile", "record", "bit", "page", "packet", "pointer", "trace", "bus", "lane", "mark", "zone", "text", "bracket", "playhead"]) {
    assert.ok(SKIN_KINDS.includes(k), k);
  }
});

test("housing: body slab with a real well from the tray, sans title in bright ink, LED puck, meter", () => {
  const tray = { x: 0, y: 8, w: 120, d: 60 };
  const dl = run([{ id: "m0", kind: "housing", variant: "node", x: 10, y: 20, w: 140, d: 100, title: "map w0", sub: "task 3/5", led: "ok", meter: 0.5, tray }]);
  const body = dl.slabs.find((s) => s.id === "m0" && s.well);
  const v = SIZE.variant.node;
  assert.equal(body.h, v.h); assert.equal(body.r, v.r); assert.equal(body.bevel, v.bevel);
  assert.equal(body.color, P.housing);
  assert.deepEqual([body.well.x, body.well.y, body.well.w, body.well.d], [0, 8, 120, 60]);
  assert.equal(body.well.depth, SIZE.well.depth);
  assert.equal(body.well.r, SIZE.well.r);
  assert.ok(!body.label.engrave && !body.label.upper && body.label.align === "left" && body.label.weight === WORLD_TYPE.title.weight && body.label.font === "sans");
  assert.equal(body.label.color, P.ink);
  assert.equal(body.label.size, WORLD_TYPE.title.size);
  assert.equal(body.label2.text, "task 3/5"); assert.equal(body.label2.align, "right");
  assert.ok(body.meter && body.meter.value === 0.5);
  const led = dl.slabs.find((s) => s.id === "m0" && !s.well);
  assert.equal(led.color, P.ok); assert.ok(led.emissive > 1 && led.light > 0);
  assert.ok(led.z >= body.h - 1, "LED sits on the housing top");
});

test("fail LED blinks at 1.6 Hz from time", () => {
  const p = { id: "n", kind: "housing", x: 0, y: 0, w: 140, d: 100, led: "fail", tray: { x: 0, y: 8, w: 120, d: 60 } };
  const at = (t) => run([p], { time: t }).slabs.find((s) => !s.well).emissive;
  const on = at(0), off = at(0.5 / 1.6);
  assert.ok(on > 1.5 && off < 0.3, `on ${on} off ${off}`);
  assert.equal(at(1 / 1.6).toFixed(4), on.toFixed(4), "period 1/1.6 s");
});

test("variants change the silhouette: store is a puck with a round well, chip has printed pins", () => {
  const store = run([{ id: "s", kind: "housing", variant: "store", x: 0, y: 0, w: 140, d: 130, title: "input" }]).slabs[0];
  assert.equal(store.w, store.d); assert.equal(store.r, store.w / 2);
  assert.equal(store.well.r, Math.min(store.well.w, store.well.d) / 2);
  assert.equal(store.color, P.housingAlt);
  const chip = run([{ id: "c", kind: "housing", variant: "chip", x: 0, y: 0, w: 120, d: 100 }]);
  assert.equal(chip.ticks.length, 4);
  assert.equal(chip.slabs[0].h, SIZE.variant.chip.h);
  const queue = run([{ id: "q", kind: "housing", variant: "queue", x: 0, y: 0, w: 200, d: 60 }]).slabs[0];
  assert.equal(queue.h, SIZE.variant.queue.h);
});

test("tiles: keyed body with key ink, neutral, ghost; lit rises and rims; flash emits; dim desaturates", () => {
  const [k] = run([{ id: "t", kind: "tile", x: 0, y: 0, z: 13.6, text: "7", key: 2, tone: "key" }]).slabs;
  assert.equal(k.color, keyColor("dark", 2)); assert.equal(k.label.color, P.keyInk);
  assert.equal(k.material, "ceramic");
  assert.deepEqual([k.w, k.d, k.h, k.r, k.bevel], [SIZE.tile.w, SIZE.tile.d, SIZE.tile.h, SIZE.tile.r, SIZE.tile.bevel]);
  const [n] = run([{ id: "t", kind: "tile", x: 0, y: 0, text: "7" }]).slabs;
  assert.equal(n.color, P.tile); assert.equal(n.label.color, P.tileInk);
  const [g] = run([{ id: "t", kind: "tile", x: 0, y: 0, text: "", tone: "ghost" }]).slabs;
  assert.equal(g.color, P.ghost);
  const [l] = run([{ id: "t", kind: "tile", x: 0, y: 0, z: 2, text: "7", lit: 1 }]).slabs;
  assert.equal(l.z, 2 + MOTION.litRise); assert.equal(l.rim, 1); assert.ok(l.emissive > 0);
  const [f] = run([{ id: "t", kind: "tile", x: 0, y: 0, text: "7", flash: 1 }]).slabs;
  assert.ok(f.emissive > 0.5);
  const [d] = run([{ id: "t", kind: "tile", x: 0, y: 0, text: "7", dim: 1 }]).slabs;
  assert.ok(d.desaturate > 0.5);
  const [s] = run([{ id: "t", kind: "tile", x: 0, y: 0, text: "7", selected: true }]).slabs;
  assert.equal(s.outline, 1);
  assert.equal(toneColors("light", { tone: "fail" }).body, PALETTE.light.fail);
});

test("record: key left in key ink, value right lighter; a value roll yields two clipped labels", () => {
  const [r] = run([{ id: "r", kind: "record", x: 0, y: 0, text: "fox", sub: "1", key: 3, tone: "key" }]).slabs;
  assert.equal(r.label.text, "fox"); assert.equal(r.label.align, "left");
  assert.equal(r.label2.text, "1"); assert.equal(r.label2.align, "right"); assert.ok(r.label2.weight < r.label.weight);
  const [s] = run([{ id: "r", kind: "record", x: 0, y: 0, text: "fox · 2" }]).slabs;
  assert.equal(s.label.text, "fox"); assert.equal(s.label2.text, "2");
  const [m] = run([{ id: "r", kind: "record", x: 0, y: 0, text: "fox", sub: "2", textOut: "1", roll: 0.3, key: 3 }]).slabs;
  assert.equal(m.label2.text, "2"); assert.equal(m.label3.text, "1");
  assert.ok(m.label2.dy > 0 && m.label3.dy < 0, "new rises from below, old slides up");
  assert.ok(m.label2.clip && m.label3.clip);
  const [done] = run([{ id: "r", kind: "record", x: 0, y: 0, text: "fox", sub: "2", textOut: "1", roll: 1, key: 3 }]).slabs;
  assert.equal(done.label3, undefined);
});

test("packet: an emissive key-coloured pill that is a point light", () => {
  const [p] = run([{ id: "p", kind: "packet", x: 5, y: 6, z: 9, key: 1, yaw: 30 }]).slabs;
  assert.equal(p.color, keyColor("dark", 1)); assert.equal(p.emissiveColor, p.color);
  assert.equal(p.emissive, 2.2); assert.equal(p.light, SIZE.packet.light);
  assert.equal(p.r, p.d / 2); assert.equal(p.w, SIZE.packet.w); assert.equal(p.yaw, 30);
});

test("trace and bus: grooves with pulses coloured by key; bus accepts several polylines", () => {
  const dl = run([
    { id: "t", kind: "trace", points: [[0, 0], [100, 0]], pulses: [{ s0: 10, s1: 70, key: 2, intensity: 1.5 }], grow: 0.5 },
    { id: "b", kind: "bus", points: [[[0, 10], [100, 10]], [[50, 0], [50, 10]]] },
  ]);
  const t = dl.grooves[0];
  assert.equal(t.width, SIZE.trace.w); assert.equal(t.style, "groove"); assert.equal(t.grow, 0.5);
  assert.equal(t.pulses[0].color, keyColor("dark", 2)); assert.ok(t.glow > 0 && t.glow <= GLOW.trace, "a carrying trace is a light tube");
  assert.equal(dl.grooves.filter((g) => g.id === "b").length, 2);
  assert.equal(dl.grooves[1].width, SIZE.trace.bus);
});

test("keyed trace: an idle trace with a key keeps a faint glow in that key's colour; none without", () => {
  const dl = run([
    { id: "k", kind: "trace", points: [[0, 0], [100, 0]], key: 3, tone: "neutral" },
    { id: "n", kind: "trace", points: [[0, 20], [100, 20]], tone: "neutral" },
  ]);
  const k = dl.grooves.find((g) => g.id === "k"), n = dl.grooves.find((g) => g.id === "n");
  assert.equal(k.glowColor, keyColor("dark", 3));
  assert.ok(k.glow > 0 && k.glow < GLOW.trace, "a faint identity tint, not a light tube");
  assert.equal(n.glow, 0);
});

test("lane: rail + ruler + printed name in sentence case + time labels; mark is a puck on the rail; playhead is a lit print line", () => {
  const dl = run([
    { id: "l", kind: "lane", points: [[0, 0], [200, 0]], title: "n1", scale: 1 },
    { id: "m", kind: "mark", x: 50, y: 0, tone: "ok" },
    { id: "ph", kind: "playhead", points: [[80, -20], [80, 20]] },
  ]);
  assert.equal(dl.grooves[0].style, "rail"); assert.equal(dl.grooves[0].width, SIZE.lane.w);
  assert.equal(dl.ticks[0].every, SIZE.lane.tickMinor);
  assert.ok(dl.texts.some((t) => t.text === worldCase("n1", WORLD_TYPE.lane) && !t.engrave && !t.upper));
  assert.ok(dl.texts.some((t) => t.text === "0 ms") && dl.texts.some((t) => t.text === "50"));
  const mark = dl.slabs[0];
  assert.equal(mark.color, P.ok); assert.equal(mark.r, mark.w / 2); assert.ok(mark.z > 0);
  const ph = dl.grooves.find((g) => g.id === "ph");
  assert.equal(ph.style, "print"); assert.ok(ph.glow > 0);
});

test("zone, text, bracket, pointer, container", () => {
  const dl = run([
    { id: "z", kind: "zone", x: 0, y: 0, w: 200, d: 100, title: "partition b", dashed: true },
    { id: "x", kind: "text", x: 0, y: 0, text: "0x7f3a", size: 6 },
    { id: "br", kind: "bracket", points: [[0, 30], [60, 30]], text: "vpn", key: 3 },
    { id: "pt", kind: "pointer", x: 10, y: 50, text: "i" },
    { id: "c", kind: "container", x: 0, y: 0, w: 220, d: 40 },
  ]);
  assert.equal(dl.zones[0].borderStyle, "dashed"); assert.equal(dl.zones[0].title, "partition b"); assert.equal(dl.zones[0].r, SIZE.zone.r);
  assert.ok(dl.texts.some((t) => t.text === "0x7f3a" && t.size === 6));
  assert.ok(dl.grooves.some((g) => g.id === "br" && g.style === "print" && g.color === keyColor("dark", 3)));
  assert.ok(dl.texts.some((t) => t.text === worldCase("vpn", WORLD_TYPE.bracket)));
  const ptr = dl.slabs.filter((s) => s.id === "pt");
  assert.equal(ptr.length, 3);
  const rod = ptr.find((s) => s.h === SIZE.pointer.h);
  assert.equal(rod.material, "metal");
  assert.ok(ptr.some((s) => s.label?.text === "i" && s.z > 20), "flag tile carries the name at the top of the rod");
  const plate = dl.slabs.find((s) => s.id === "c");
  assert.equal(plate.h, SIZE.plate.h); assert.equal(plate.r, SIZE.plate.r);
});

test("light theme picks light tokens", () => {
  const [t] = skin([{ id: "t", kind: "tile", x: 0, y: 0, text: "1" }], new DrawList(), { theme: "light" }).slabs;
  assert.equal(t.color, PALETTE.light.tile); assert.equal(t.label.color, PALETTE.light.tileInk);
});

test("pure: deterministic, DOM-free, never mutates poses", () => {
  const scene = galleryScene(2.4);
  const before = JSON.stringify(scene.poses);
  const a = JSON.stringify(run(scene.poses, { time: 2.4 }));
  const b = JSON.stringify(run(scene.poses, { time: 2.4 }));
  assert.equal(a, b);
  assert.equal(JSON.stringify(scene.poses), before);
  assert.equal(typeof globalThis.document, "undefined");
});

test("the gallery scene skins without unknown kinds and stays inside its bounds", () => {
  for (const layout of ["wide", "tall"]) {
    const sc = galleryScene(1.7, { layout });
    for (const p of sc.poses) assert.ok(SKIN_KINDS.includes(p.kind), p.kind);
    const dl = run(sc.poses);
    assert.ok(dl.slabs.length > 50 && dl.grooves.length > 8);
    for (const s of dl.slabs) assert.ok(s.x >= sc.bounds.minX - 40 && s.x <= sc.bounds.maxX + 40 && s.y >= sc.bounds.minY - 40 && s.y <= sc.bounds.maxY + 40, s.id);
  }
});

test("ease matches the token curve endpoints and is monotonic", () => {
  const e = bezier(MOTION.ease);
  assert.equal(e(0), 0); assert.equal(e(1), 1);
  let prev = 0;
  for (let x = 0.05; x < 1; x += 0.05) { const y = e(x); assert.ok(y >= prev); prev = y; }
});

// --- the scene's real pose format (CONTRACTS.md section 4.6) ------------------------------------
import { compile } from "../scene/index.mjs";

test("real format: traces ignore w:0, bus draws branches and tee fillets, pulses keep a0/a1 and direction", () => {
  const dl = run([
    { id: "t", kind: "trace", w: 0, points: [[0, 0], [100, 0]], glow: 1, key: 2, pulses: [{ s0: 80, s1: 20, key: 2, intensity: 1, a0: 0.2, a1: 1 }] },
    { id: "bus", kind: "bus", w: 0, key: 3, glow: 0.45, points: [[0, -50], [0, 50]], tees: [{ x: 0, y: 10 }],
      branches: [{ of: "m0", kind: "from", points: [[-80, 10], [0, 10]], pulses: [] }, { of: "r0", kind: "to", points: [[0, 40], [60, 40]], pulses: [] }] },
  ]);
  const t = dl.grooves.find((g) => g.id === "t");
  assert.equal(t.width, SIZE.trace.w);
  assert.deepEqual([t.pulses[0].s0, t.pulses[0].s1, t.pulses[0].a0, t.pulses[0].a1], [80, 20, 0.2, 1]);
  assert.ok(t.glow > 0 && t.glowColor === keyColor("dark", 2));
  const bus = dl.grooves.filter((g) => g.id === "bus");
  assert.equal(bus[0].width, SIZE.trace.bus);
  assert.equal(bus.filter((g) => g.width === SIZE.trace.w).length, 2, "two branches");
  assert.equal(bus.length, 1 + 2 + 2, "trunk, branches, two fillets at the tee");
  const fillets = bus.slice(3);
  // fillets sit on the branch side: never past the trunk's far wall
  for (const f of fillets) for (const [x] of f.points) assert.ok(x < SIZE.trace.bus / 2, "fillets sit on the branch side of the trunk");
});

test("real format: hop tilt is bank (roll is the value-roll progress), LED crossfade, store tray.round", () => {
  const [tile] = run([{ id: "a", kind: "tile", x: 0, y: 0, text: "4", pitch: 3, bank: -5, roll: 0.4 }]).slabs;
  assert.equal(tile.roll, -5); assert.equal(tile.pitch, 3);
  const at = (mix) => run([{ id: "h", kind: "housing", x: 0, y: 0, w: 140, d: 100, led: "fail", ledPrev: "ok", ledMix: mix, tray: { x: 0, y: 8, w: 120, d: 60 } }], { time: 0 }).slabs.find((s) => !s.well).color;
  assert.equal(at(0), P.ok); assert.equal(at(1), P.fail);
  assert.notEqual(at(0.5), P.ok);
  const [store] = run([{ id: "s", kind: "housing", variant: "store", x: 0, y: 0, w: 170, d: 170, r: 85, tray: { x: 0, y: 0, w: 130, d: 130, round: true } }]).slabs;
  assert.equal(store.r, 85); assert.equal(store.well.r, 65);
});

test("real format: lanes put the ruler and time labels where the scene says; messages and prints", () => {
  const dl = run([
    { id: "l0", kind: "lane", points: [[-300, 0], [300, 0]], label: "leader", labelAt: [-350, 0], ticks: { minor: 10, major: 50 }, ruler: false },
    { id: "l1", kind: "lane", points: [[-300, 56], [300, 56]], label: "follower", labelAt: [-350, 56], ruler: true, labels: [{ x: -300, y: 70, text: "0 ms" }, { x: -250, y: 70, text: "5 ms" }] },
    { id: "m", kind: "trace", variant: "message", points: [[-200, 0], [-150, 56]], grow: 0.5, dim: 0.6 },
    { id: "pr", kind: "trace", variant: "print", points: [[0, -100], [80, -100]], key: 1 },
    { id: "pk", kind: "packet", variant: "lane", x: 0, y: 0, z: 2, key: 0 },
  ]);
  assert.ok(dl.texts.some((t) => t.text === worldCase("leader", WORLD_TYPE.lane) && t.x === -350 && t.align === "left"));
  assert.ok(dl.texts.some((t) => t.text === "5 ms" && t.x === -250));
  assert.equal(dl.texts.filter((t) => /ms$/.test(t.text)).length, 2, "only the scene's labels");
  const msg = dl.grooves.find((g) => g.id === "m");
  assert.equal(msg.grow, 0.5); assert.ok(msg.opacity < 1 && msg.width < SIZE.trace.w + 0.01);
  const pr = dl.grooves.find((g) => g.id === "pr");
  assert.equal(pr.style, "print"); assert.equal(pr.color, keyColor("dark", 1));
  const pk = dl.slabs.find((s) => s.id === "pk");
  assert.ok(pk.w < SIZE.packet.w && pk.z === 2);
});

test("real format: text variants label / index / floor, raised text keeps its z", () => {
  const dl = run([
    { id: "a", kind: "text", variant: "label", x: 0, y: 0, text: "a" },
    { id: "i", kind: "text", variant: "index", x: 0, y: 0, z: 2.5, text: "0", tone: "faint" },
  ]);
  assert.equal(dl.texts[0].align, "left");
  assert.equal(dl.texts[1].z, 2.5); assert.equal(dl.texts[1].color, P.inkFaint);
});

test("real compiled frames: every trace, branch and label becomes visible geometry", async () => {
  for (const name of ["mapreduce", "heartbeat", "stress"]) {
    await import(`../scene/fixtures/${name}.mjs`).then((fig) => {
      const tl = compile(fig, {});
      for (const t of [0.5, tl.duration * 0.3, tl.duration * 0.6, tl.duration - 0.1]) {
        const fr = tl.sample(t, { pxPerUnit: 1 });
        const dl = run(fr.poses, { time: t });
        for (const g of dl.grooves) assert.ok(g.width > 0.5 && g.points.length >= 2, `${name} ${g.id} visible`);
        const traces = fr.poses.filter((p) => p.kind === "trace" || p.kind === "bus");
        const branches = traces.reduce((n, p) => n + (p.branches?.length ?? 0), 0);
        assert.ok(dl.grooves.length >= traces.length + branches, `${name} t=${t.toFixed(1)}`);
        for (const p of fr.poses.filter((q) => q.kind === "record" && q.text)) {
          const s = dl.slabs.find((x) => x.id === p.id);
          assert.ok(s.label && s.label.text.length > 0, `${p.id} keeps its key label`);
        }
      }
    });
  }
});

// --- Prism: state, light and data looks -----------------------------------------------------------------
test("status accent: a strip under the header from led, idle barely there, crossfades with ledPrev", () => {
  const tray = { x: 0, y: 8, w: 120, d: 60 };
  const h = (o) => run([{ id: "h", kind: "housing", x: 0, y: 0, w: 140, d: 100, title: "w", tray, ...o }], { time: 0 });
  const ok = h({ led: "ok" }).slabs.find((s) => s.well);
  assert.equal(ok.accent.color, P.ok); assert.equal(ok.accent.mode, "line");
  const trayTop = tray.y - tray.d / 2;
  assert.ok(ok.accent.y < trayTop && ok.accent.y > -50, "strip sits on the header's bottom edge, above the tray");
  assert.ok(ok.accent.len > 40 && ok.accent.rim > 0);
  const idle = h({ led: "idle" }).slabs.find((s) => s.well);
  assert.ok(idle.accent.level < 0.25 * ok.accent.level, "idle is barely there");
  const busy = h({ tone: "busy" }).slabs.find((s) => s.well);
  assert.equal(busy.accent.color, P.busy, "a status tone drives it when there is no led");
  const mid = h({ led: "fail", ledPrev: "ok", ledMix: 0.5 }).slabs.find((s) => s.well);
  assert.notEqual(mid.accent.color, P.ok); assert.notEqual(mid.accent.color, P.fail);
  assert.equal(h({}).slabs.find((s) => s.well).accent, undefined, "no state, no accent");
  const store = run([{ id: "s", kind: "housing", variant: "store", x: 0, y: 0, w: 140, d: 140, led: "ok" }]).slabs[0];
  assert.equal(store.accent.mode, "ring");
});

test("a crashed housing darkens and desaturates, its accent glows red and breathes; a lit one pools light", () => {
  const tray = { x: 0, y: 8, w: 120, d: 60 };
  const f = (t) => run([{ id: "h", kind: "housing", x: 0, y: 0, w: 140, d: 100, led: "fail", tray }], { time: t }).slabs.find((s) => s.well);
  const a = f(0), b = f(0.5 / ACCENT.failHz);
  assert.equal(a.accent.color, P.fail);
  assert.ok(a.desaturate >= ACCENT.crash.desaturate - 1e-9 && a.darken > 0.2);
  assert.ok(a.accent.level > b.accent.level * 1.3, "slow pulse");
  const lit = run([{ id: "h", kind: "housing", x: 0, y: 0, w: 140, d: 100, led: "ok", lit: 1, tray }]);
  assert.equal(lit.lights.length, 1); assert.equal(lit.lights[0].color, P.ok);
  assert.ok(lit.slabs.find((s) => s.well).accent.level > ACCENT.level.ok * 1.5);
});

test("bus: only the parts that carry data glow; tiles that flash or light carry a ping", () => {
  const dl = run([{ id: "bus", kind: "bus", glow: 0.45, key: 1, points: [[0, -50], [0, 50]],
    branches: [{ points: [[-80, 10], [0, 10]], pulses: [{ s0: 10, s1: 60, key: 1, intensity: 1 }] }, { points: [[0, 40], [60, 40]], pulses: [] }] }]);
  const [trunk, carrying, idle] = dl.grooves;
  assert.ok(trunk.glow > 0 && carrying.glow > 0); assert.equal(idle.glow, 0);
  const [t] = run([{ id: "t", kind: "tile", x: 0, y: 0, z: 9.5, text: "a", key: 2, flash: 0.6 }]).slabs;
  assert.ok(t.ping && t.ping.flash === 0.6 && t.ping.color === keyColor("dark", 2));
  assert.equal(run([{ id: "t", kind: "tile", x: 0, y: 0, text: "a" }]).slabs[0].ping, undefined);
});

test("ink on identity colours: whichever of near-black and white contrasts more (WCAG), so every key takes dark ink", () => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = (h) => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  for (const theme of ["dark", "light"]) {
    const T = PALETTE[theme];
    for (const [i, c] of T.keys.entries()) {
      const ink = inkOn(c, T);
      assert.ok(cr(c, ink) >= cr(c, ink === "#FFFFFF" ? T.keyInk : "#FFFFFF"), `${theme} key ${i}: ${ink} on ${c} is not the stronger ink`);
      assert.ok(cr(c, ink) >= 4.5, `${theme} key ${i}: ${ink} on ${c} is only ${cr(c, ink).toFixed(2)}:1`);
      const [t] = skin([{ id: "t", kind: "tile", x: 0, y: 0, text: "12", key: i }], new DrawList(), { theme }).slabs;
      assert.equal(t.label.color, ink);
    }
  }
  // a deep body still takes white
  assert.equal(inkOn("#1B2340", P), "#FFFFFF");
});

test("tile sub-labels print at a readable size and strength; a ghost that says something uses muted ink", () => {
  const [t] = run([{ id: "t", kind: "tile", x: 0, y: 0, w: 76, text: "12", sub: "value", key: 1 }]).slabs;
  assert.equal(t.label2.text, "value");
  assert.ok(t.label2.size > SIZE.tile.sub && t.label2.opacity >= 0.85 && t.label2.weight >= 500);
  const [g] = run([{ id: "t", kind: "tile", x: 0, y: 0, w: 76, text: "null", sub: "next", tone: "ghost" }]).slabs;
  assert.equal(g.label.color, P.inkMuted);
  const [b] = run([{ id: "b", kind: "bit", x: 0, y: 0, text: "0" }]).slabs;
  assert.equal(b.label.color, P.inkFaint);
});

test("trace arrows: an inlaid chevron at the receiving port, in the trace's own groove and light", () => {
  const pts = [[0, 0], [100, 0]];
  const base = { id: "p", kind: "trace", points: pts, key: 2, tone: "key" };
  assert.equal(run([base]).grooves.length, 1, "no arrow unless asked");
  const dl = run([{ ...base, arrow: "end" }]);
  assert.equal(dl.grooves.length, 2);
  const [line, ch] = dl.grooves;
  assert.equal(ch.points.length, 3);
  assert.equal(ch.style, line.style); assert.equal(ch.width, line.width); assert.equal(ch.glowColor, line.glowColor);
  const [a1, tip, a2] = ch.points;
  assert.ok(tip[0] < 100 && tip[0] > 96 && Math.abs(tip[1]) < 1e-9, "the tip stands just off the port");
  assert.ok(a1[0] < tip[0] && a2[0] < tip[0] && a1[1] * a2[1] < 0, "the arms sweep back on both sides");
  assert.ok(ch.glow >= line.glow);
  // both ends, and the chevron grows in only as the trace finishes growing
  assert.equal(run([{ ...base, arrow: "both" }]).grooves.length, 3);
  const start = chevron(pts, 0);
  assert.ok(start.tip[0] > 0 && start.tip[0] < 4 && start.dir[0] < 0);
  assert.equal(run([{ ...base, arrow: "end", grow: 0.5 }]).grooves.length, 1);
  // a packet landing lights it; a short stub has none; it reads at small scales (min px size)
  const landing = run([{ ...base, arrow: "end", pulses: [{ s0: 40, s1: 98, key: 2, intensity: 1 }] }]).grooves[1];
  assert.ok(landing.glow > ch.glow);
  assert.equal(chevron([[0, 0], [6, 0]], 1), null);
  const far = chevron(pts, 1, 0.5), near = chevron(pts, 1, 2);
  assert.ok(Math.hypot(far.points[0][0] - far.tip[0], far.points[0][1] - far.tip[1]) > Math.hypot(near.points[0][0] - near.tip[0], near.points[0][1] - near.tip[1]));
  // direction follows the last stretch of a rounded path
  const up = chevron([[0, 100], [0, 20], [2, 6], [8, 1], [20, 0], [60, 0]], 1);
  assert.ok(up.dir[0] > 0.99);
});

test("spotlight: a receded thing moves toward the stage and fades its ink; kept, hovered or lit ones keep their look", () => {
  const tile = (o) => ({ id: "w", kind: "tile", x: 0, y: 0, w: 30, d: 14, text: "the", key: 0, tone: "key", ...o });
  const slab = (dl) => dl.slabs.find((s) => s.id === "w");
  const plainLook = run([tile({})]);
  assert.deepEqual(run([tile({ recede: 0 })]), plainLook);
  assert.deepEqual(run([tile({ recede: 1, hover: true })]), run([tile({ hover: true })]));
  assert.deepEqual(run([tile({ recede: 1 })], { spot: 0 }), plainLook);
  const back = slab(run([tile({ recede: 1 })]));
  const was = srgba(slab(plainLook).color), now = srgba(back.color), stage = srgba(P.stage);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert.ok(dist(now, stage) < dist(was, stage), "closer to the stage");
  assert.ok(back.desaturate > 0);
  assert.ok(back.label.opacity < 1);
  // a lit thing (the one to watch) keeps its look however far it would recede
  const lit = run([tile({ lit: 1, recede: 1 })]);
  assert.deepEqual(lit, run([tile({ lit: 1 })]));
});
