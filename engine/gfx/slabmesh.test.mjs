import { test } from "node:test";
import assert from "node:assert/strict";
import { slabTemplate, RING } from "./slabmesh.mjs";

// The well rings as SLAB_VERTEX places them (shaders.mjs), in float32, for a slab without a well: pack.mjs writes
// its well centre, half size, radius, depth and lip as 0 (hasWell false), so every term the ring adds is 0 * finite.
const f = Math.fround;
function wellRing(kind, sx, sy, th, phi, h) {
  const hc = [0, 0], hh = [0, 0], hr = 0, dep = 0, lip = 0;
  const rr = (off) => {
    const n = [f(sx * f(Math.cos(th))), f(sy * f(Math.sin(th)))];
    const m = f(Math.max(f(hr + off), 0));
    return [f(f(sx * Math.max(hh[0] - hr, 0)) + f(n[0] * m)), f(f(sy * Math.max(hh[1] - hr, 0)) + f(n[1] * m))];
  };
  let xy, z;
  if (kind === RING.LIP) { xy = rr(f(lip * f(1 - f(Math.sin(phi))))); z = f(h - f(lip * f(1 - f(Math.cos(phi))))); }
  else if (kind === RING.WALL || kind === RING.FLOOR_E) { xy = rr(0); z = f(h - dep); }
  else { xy = [0, 0]; z = f(h - dep); }
  return [f(hc[0] + xy[0]), f(hc[1] + xy[1]), z];
}

for (const opts of [{ corner: 7, bevel: 6, lip: 3 }, { corner: 18, bevel: 9, lip: 4 }, {}]) {
  test(`without a well, every triangle past the solid prefix is a point (template ${JSON.stringify(opts)})`, () => {
    const t = slabTemplate(opts);
    assert.ok(t.solidCount > 0 && t.solidCount < t.indices.length);
    const at = (v) => {
      const kind = t.prof[v * 2];
      assert.ok(kind >= RING.LIP, `vertex ${v} past the prefix is a well ring (kind ${kind})`);
      return wellRing(kind, t.plan[v * 3], t.plan[v * 3 + 1], t.plan[v * 3 + 2], t.prof[v * 2 + 1], 4.5).join(",");
    };
    for (let i = t.solidCount; i < t.indices.length; i += 3) {
      const a = at(t.indices[i]), b = at(t.indices[i + 1]), c = at(t.indices[i + 2]);
      assert.ok(a === b && b === c, `triangle ${i / 3} has three vertices at one point`);
    }
  });
}
