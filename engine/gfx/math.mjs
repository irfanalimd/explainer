// Camera and matrix math for the renderer. Pure, DOM-free (tested in Node).
// World: x right, y toward the viewer, z up. Camera yaw 0 looks from +y toward -y; positive yaw swings the
// eye toward +x. Pitch is degrees above the horizon. Matrices are column-major Float32Array(16) (GL layout).
//
// The world as seen (x right, y toward the viewer, z up) is a mirror image of a right-handed GL eye space,
// so the view matrix has determinant -1 and screen winding flips: outward CCW triangles appear clockwise.

export const DEG = Math.PI / 180;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Orthonormal camera frame: eye position, screen-right R, screen-up U, back B (points from target to eye). */
export function cameraFrame(cam) {
  const yaw = (cam.yaw ?? 0) * DEG, pitch = (cam.pitch ?? 54) * DEG;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const B = [sy * cp, cy * cp, sp];
  const R = [cy, -sy, 0];
  const U = [-sy * sp, -cy * sp, cp];
  const t = cam.target ?? [0, 0, 0];
  const d = cam.distance ?? 1000;
  const eye = [t[0] + B[0] * d, t[1] + B[1] * d, t[2] + B[2] * d];
  return { eye, R, U, B, F: [-B[0], -B[1], -B[2]] };
}

export function viewMatrix(frame, out = new Float32Array(16)) {
  const { eye, R, U, B } = frame;
  out[0] = R[0]; out[4] = R[1]; out[8] = R[2];  out[12] = -dot3(R, eye);
  out[1] = U[0]; out[5] = U[1]; out[9] = U[2];  out[13] = -dot3(U, eye);
  out[2] = B[0]; out[6] = B[1]; out[10] = B[2]; out[14] = -dot3(B, eye);
  out[3] = 0; out[7] = 0; out[11] = 0; out[15] = 1;
  return out;
}

export function perspective(fovY, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan((fovY * DEG) / 2);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far); out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function ortho(l, r, b, t, n, f, out = new Float32Array(16)) {
  out.fill(0);
  out[0] = 2 / (r - l); out[5] = 2 / (t - b); out[10] = -2 / (f - n);
  out[12] = -(r + l) / (r - l); out[13] = -(t + b) / (t - b); out[14] = -(f + n) / (f - n); out[15] = 1;
  return out;
}

export function mul4(a, b, out = new Float32Array(16)) {
  const o = out === a || out === b ? new Float32Array(16) : out;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  if (o !== out) out.set(o);
  return out;
}

export function apply4(m, p) {
  const x = p[0], y = p[1], z = p[2], w = p[3] ?? 1;
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}

/** Near/far planes for a camera: generous, constant ratio, so 24-bit depth stays precise. */
export function clipPlanes(cam) {
  const d = cam.distance ?? 1000;
  return [Math.max(0.5, d * 0.04), d * 24];
}

/**
 * Everything the renderer and its callers need from a Camera at a viewport size (CSS px).
 * project / unproject / pxPerUnit are exact for the matrices the GPU uses.
 */
export function cameraState(cam, cssW, cssH) {
  const frame = cameraFrame(cam);
  const aspect = cssW / Math.max(1, cssH);
  const fov = cam.fov ?? 28;
  const [near, far] = clipPlanes(cam);
  const view = viewMatrix(frame);
  const proj = perspective(fov, aspect, near, far);
  const viewProj = mul4(proj, view);
  const tanHalf = Math.tan((fov * DEG) / 2);
  const focalPx = cssH / 2 / tanHalf;
  const project = (p) => {
    const c = apply4(viewProj, [p[0], p[1], p[2] ?? 0, 1]);
    const w = c[3];
    if (w <= 1e-6) return [NaN, NaN, w, false];
    const nx = c[0] / w, ny = c[1] / w;
    return [(nx * 0.5 + 0.5) * cssW, (0.5 - ny * 0.5) * cssH, w, w > near && nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1];
  };
  const ray = (cssX, cssY) => {
    const nx = (cssX / cssW) * 2 - 1, ny = 1 - (cssY / cssH) * 2;
    const { R, U, F } = frame;
    const a = nx * tanHalf * aspect, b = ny * tanHalf;
    return norm3([F[0] + R[0] * a + U[0] * b, F[1] + R[1] * a + U[1] * b, F[2] + R[2] * a + U[2] * b]);
  };
  const unproject = (cssX, cssY, z = 0) => {
    const d = ray(cssX, cssY), e = frame.eye;
    if (Math.abs(d[2]) < 1e-9) return [NaN, NaN];
    const t = (z - e[2]) / d[2];
    if (t <= 0) return [NaN, NaN];
    return [e[0] + d[0] * t, e[1] + d[1] * t];
  };
  const depthOf = (p) => dot3([p[0] - frame.eye[0], p[1] - frame.eye[1], (p[2] ?? 0) - frame.eye[2]], frame.F);
  const pxPerUnit = (at = cam.target ?? [0, 0, 0]) => focalPx / Math.max(1e-6, depthOf(at));
  return { frame, view, proj, viewProj, near, far, fov, aspect, cssW, cssH, focalPx, project, unproject, ray, pxPerUnit, depthOf };
}

/**
 * Directional light view for the shadow map: an orthographic box along -dir that tightly contains
 * the axis-aligned box [min, max], snapped to texels so it does not shimmer while things move.
 */
export function lightState(dir, min, max, size) {
  const L = norm3(dir);
  const f = [-L[0], -L[1], -L[2]];
  const up = Math.abs(f[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
  const r = norm3(cross3(f, up));
  const u = cross3(r, f);
  const view = new Float32Array(16);
  view[0] = r[0]; view[4] = r[1]; view[8] = r[2];
  view[1] = u[0]; view[5] = u[1]; view[9] = u[2];
  view[2] = -f[0]; view[6] = -f[1]; view[10] = -f[2];
  view[15] = 1;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    const x = dot3(r, p), y = dot3(u, p), z = dot3(L, p);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  // square, texel-snapped extent
  const ext = Math.max(x1 - x0, y1 - y0) * 1.04 + 8;
  const texel = ext / size;
  const cx = Math.round((x0 + x1) / 2 / texel) * texel, cy = Math.round((y0 + y1) / 2 / texel) * texel;
  // view z = dot(L, p); the light looks along -z, so GL near/far are -zmax and -zmin (with slack)
  const zNear = -(z1 + 20), zFar = -(z0 - 20);
  const proj = ortho(cx - ext / 2, cx + ext / 2, cy - ext / 2, cy + ext / 2, zNear, zFar);
  const viewProj = mul4(proj, view);
  return { viewProj, extent: ext, depthRange: zFar - zNear, texel, dir: L };
}

/** Distance that fits an axis-aligned box inside the frame for a camera orientation (used by the gallery). */
export function fitDistance(cam, box, cssW, cssH, margin = 0.1) {
  const test = (d) => {
    const s = cameraState({ ...cam, distance: d }, cssW, cssH);
    for (let i = 0; i < 8; i++) {
      const p = [i & 1 ? box.maxX : box.minX, i & 2 ? box.maxY : box.minY, i & 4 ? box.maxZ ?? 0 : box.minZ ?? 0];
      const [x, y, w] = s.project(p);
      if (!(w > 0)) return false;
      const m = margin * Math.min(cssW, cssH);
      if (x < m || x > cssW - m || y < m || y > cssH - m) return false;
    }
    return true;
  };
  let lo = 10, hi = 200000;
  for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (test(mid)) hi = mid; else lo = mid; }
  return hi;
}
