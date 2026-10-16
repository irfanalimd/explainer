// Small WebGL2 helpers: programs with readable errors, textures, framebuffers. Browser-only.

export function compileProgram(gl, name, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const log = gl.getShaderInfoLog(s) || "";
      const lines = src.split("\n");
      const m = log.match(/ERROR: \d+:(\d+)/);
      const at = m ? Number(m[1]) : 0;
      const ctx = at ? lines.slice(Math.max(0, at - 4), at + 2).map((l, i) => `${Math.max(1, at - 3) + i}: ${l}`).join("\n") : "";
      throw new Error(`[gfx] ${name} ${type === gl.VERTEX_SHADER ? "vertex" : "fragment"} shader:\n${log}\n${ctx}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`[gfx] ${name} link: ${gl.getProgramInfoLog(p)}`);
  const uniforms = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const base = info.name.replace(/\[0\]$/, "");
    uniforms[base] = gl.getUniformLocation(p, info.name);
  }
  return { program: p, u: uniforms, name };
}

export function texture2D(gl, w, h, internal, { filter = gl.LINEAR, wrap = gl.CLAMP_TO_EDGE } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  t.w = w; t.h = h;
  return t;
}

/** Framebuffer from textures (or renderbuffers) per attachment; checks completeness. */
export function framebuffer(gl, colors, depth) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  colors.forEach((c, i) => {
    if (c instanceof WebGLRenderbuffer) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, c);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, c, 0);
  });
  if (depth) {
    if (depth instanceof WebGLRenderbuffer) gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    else gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  }
  gl.drawBuffers(colors.length ? colors.map((_, i) => gl.COLOR_ATTACHMENT0 + i) : [gl.NONE]);
  if (!colors.length) gl.readBuffer(gl.NONE);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new Error(`[gfx] framebuffer incomplete 0x${status.toString(16)}`);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

export function renderbuffer(gl, w, h, internal, samples) {
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internal, w, h);
  else gl.renderbufferStorage(gl.RENDERBUFFER, internal, w, h);
  return rb;
}

/** A growable dynamic vertex buffer uploaded with bufferSubData. */
export class DynBuffer {
  constructor(gl, target = gl.ARRAY_BUFFER) { this.gl = gl; this.target = target; this.buf = gl.createBuffer(); this.cap = 0; }
  upload(data, count = data.length) {
    const gl = this.gl;
    gl.bindBuffer(this.target, this.buf);
    const bytes = count * data.BYTES_PER_ELEMENT;
    if (bytes > this.cap) {
      this.cap = Math.max(bytes, Math.ceil(this.cap * 1.5), 4096);
      gl.bufferData(this.target, this.cap, gl.DYNAMIC_DRAW);
    }
    if (bytes) gl.bufferSubData(this.target, 0, data, 0, count);
  }
}

/** Growable Float32Array pool: reused every frame, grows geometrically. */
export class FloatPool {
  constructor(n = 1024) { this.a = new Float32Array(n); this.n = 0; }
  reset() { this.n = 0; }
  reserve(k) {
    if (this.n + k > this.a.length) {
      const b = new Float32Array(Math.max(this.n + k, this.a.length * 2));
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
    const o = this.n; this.n += k; return o;
  }
}
