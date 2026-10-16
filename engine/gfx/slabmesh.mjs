// The slab template: one closed ring-stack mesh whose vertices carry *where they are in the profile*, not
// positions. The vertex shader places them from per-instance w, d, h, r, bevel and well, so radii never
// distort under non-uniform size. Pure, DOM-free.
//
// Per vertex: aPlan = (sx, sy, theta)  corner signs and the angle within that corner's arc (0..pi/2)
//             aProf = (kind, phi)      which ring of the profile and the arc angle for bevel / lip rings
// Ring kinds, bottom to top and into the well:
//   0 bottom centre   1 bottom edge (normal down)   2 side foot (normal out)
//   3 bevel (phi 0 = vertical side .. pi/2 = top)   4 well lip (phi 0 = top face .. pi/2 = vertical wall)
//   5 well wall foot (normal in)   6 well floor edge (normal up)   7 well floor centre
// Without a well the hole collapses to a point at the top face, all well rings become degenerate.
// Triangles are CCW seen from outside (right-handed world maths).

export const RING = { BOTTOM_C: 0, BOTTOM_E: 1, FOOT: 2, BEVEL: 3, LIP: 4, WALL: 5, FLOOR_E: 6, FLOOR_C: 7 };

export function slabTemplate({ corner = 8, bevel = 6, lip = 3 } = {}) {
  const rings = [];
  rings.push([RING.BOTTOM_C, 0], [RING.BOTTOM_E, 0], [RING.FOOT, 0]);
  for (let i = 0; i <= bevel; i++) rings.push([RING.BEVEL, (i / bevel) * Math.PI / 2]);
  for (let i = 0; i <= lip; i++) rings.push([RING.LIP, (i / lip) * Math.PI / 2]);
  rings.push([RING.WALL, 0], [RING.FLOOR_E, 0], [RING.FLOOR_C, 0]);

  // one loop around the rounded rectangle, CCW (x right, y "up" in maths): (+,+) -> (-,+) -> (-,-) -> (+,-)
  const loop = [];
  const corners = [[1, 1, false], [-1, 1, true], [-1, -1, false], [1, -1, true]];
  for (const [sx, sy, rev] of corners) {
    for (let k = 0; k <= corner; k++) {
      const t = ((rev ? corner - k : k) / corner) * Math.PI / 2;
      loop.push([sx, sy, t]);
    }
  }
  const M = loop.length;
  const plan = new Float32Array(rings.length * M * 3);
  const prof = new Float32Array(rings.length * M * 2);
  let o = 0;
  for (let r = 0; r < rings.length; r++) {
    for (let i = 0; i < M; i++) {
      plan[o * 3] = loop[i][0]; plan[o * 3 + 1] = loop[i][1]; plan[o * 3 + 2] = loop[i][2];
      prof[o * 2] = rings[r][0]; prof[o * 2 + 1] = rings[r][1];
      o++;
    }
  }
  const idx = [];
  for (let r = 0; r + 1 < rings.length; r++) {
    const a = rings[r][0], b = rings[r + 1][0];
    // coincident rings (hard edges) have no area between them
    if ((a === RING.BOTTOM_E && b === RING.FOOT) || (a === RING.WALL && b === RING.FLOOR_E)) continue;
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      const ai = r * M + i, aj = r * M + j, bi = (r + 1) * M + i, bj = (r + 1) * M + j;
      if (a === RING.BOTTOM_C) idx.push(ai, bj, bi);              // fan to the centre, facing down
      else if (b === RING.FLOOR_C) idx.push(ai, aj, bj);          // fan to the well centre, facing up
      else idx.push(ai, aj, bj, ai, bj, bi);
    }
  }
  const indices = rings.length * M > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  return { plan, prof, indices, vertexCount: rings.length * M, ringSize: M, rings: rings.length };
}
