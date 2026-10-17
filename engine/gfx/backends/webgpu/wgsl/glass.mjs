// WGSL for glass (PRISM2.glass): a plinth of clear glass seen over the resolved opaque world. The world behind is
// refracted exactly for the floor it stands on (the bent ray meets z = 0 elsewhere than the straight one), softened
// by a fine frost and tinted by absorption along the path inside; on top go a Fresnel reflection of the studio and
// of the world (the floor's mirror image, raised to the glass top), a soft lit edge, contact shadows from what
// stands on it and its etched title. glassDepthFS lays down the opaque world's depth first, so solids in front win.
export const GLASS = /* wgsl */ `
@fragment fn glassDepthFS(v: SlabVary) -> @location(0) vec4f {
  if (inst(v.id, 5u).y < 0.5) { discard; }     // a fading solid does not hide the glass behind it
  return vec4f(0.0);
}

fn uvOf(w: vec3f) -> vec2f { let c = F.viewProj * vec4f(w, 1.0); return vec2f(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5); }

// the world behind, through a fine frost: a small rotated disc of taps round the refracted point
fn frosted(uv: vec2f, frag: vec2f, radiusPx: f32) -> vec3f {
  var c = textureSampleLevel(behindT, linS, uv, 0.0).rgb * 2.0;
  let ang = ign(frag) * 6.2831853;
  let rot = mat2x2f(cos(ang), sin(ang), -sin(ang), cos(ang));
  for (var i = 0; i < 8; i++) { c += textureSampleLevel(behindT, linS, uv + rot * PD[i] * radiusPx * F.viewport.zw, 0.0).rgb; }
  return c / 10.0;
}

// coverage of the slab's printed labels at a point on its top face (as slabFS prints them)
fn etchAt(id: u32, lp: vec2f, uPerPx: f32) -> f32 {
  let nl = u32(inst(id, 10u).w + 0.5);
  var a = 0.0;
  for (var k = 0u; k < 3u; k++) {
    if (k >= nl) { break; }
    let qd = inst(id, 12u + 4u * k);
    let rel = (lp - (qd.xy - qd.zw)) / (2.0 * qd.zw);
    if (rel.x < 0.0 || rel.y < 0.0 || rel.x > 1.0 || rel.y > 1.0) { continue; }
    let uvr = inst(id, 13u + 4u * k);
    let uv = mix(uvr.xy, uvr.zw, rel);
    let sdPx = (uvr.z - uvr.x) / (2.0 * qd.z) * F.lit.w * uPerPx / (2.0 * F.stage.w);
    let aa = clamp(sdPx * 0.85, 0.003, 0.2);
    a = max(a, smoothstep(0.5 - aa, 0.5 + aa, textureSampleLevel(atlasT, linS, uv, 0.0).r) * inst(id, 14u + 4u * k).a);
  }
  return a;
}

@fragment fn glassFS(v: SlabVary, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let id = v.id;
  let t1 = inst(id, 1u);
  let h = t1.z;
  var N = normalize(v.normal);
  if (!front) { N = -N; }
  let V = normalize(F.eye.xyz - v.world);
  let I = -V;
  let NdV = max(dot(N, V), 1e-3);
  let G = F.glass; let look = F.glassLook;
  let light = isLight();
  let top = v.localN.z > 0.999;

  // refraction: the bent ray meets the floor at p1, the straight one at p0; the world behind is read at p1
  let Rr = refract(I, N, 1.0 / G.x);
  let depth = max(v.world.z, 0.0);
  let p0 = v.world + I * (depth / max(-I.z, 0.05));
  let p1 = v.world + Rr * (depth / max(-Rr.z, 0.05));
  let uv0 = v.pos.xy * F.viewport.zw;
  let uv = clamp(uv0 + uvOf(p1) - uvOf(p0), vec2f(0.001), vec2f(0.999));
  var behind = frosted(uv, v.pos.xy, G.y);

  // absorption along the path inside; the edges look through the glass lengthwise, so they hold more of its tint
  let edge = 1.0 - smoothstep(0.0, 0.9, abs(v.localN.z));
  let path = depth / max(-Rr.z, 0.05) + edge * h * 6.0;
  let absorb = 1.0 - exp(-F.glassTint.w * path);
  behind *= mix(vec3f(1.0), F.glassTint.rgb, absorb);

  // Fresnel: the studio (catch-lights on the bevel) and the world's mirror image on the top
  let F0 = 0.04;
  let Fr = F0 + (1.0 - F0) * pow(1.0 - NdV, 5.0);
  let R = reflect(I, N);
  // the broad top stays clear: only a whisper of the studio in dark, none on white (it would grey the paper);
  // the bevel and the sides take the full reflection
  var refl = studioEnv(R, 0.05) * select(1.0, select(0.1, 0.0, light), top);
  if (top && F.reflect.w > 0.5) {
    // the floor's mirror image, raised by twice the glass top's height (the scene mirrored about z = h)
    let m = textureSampleLevel(reflBlurT, linS, uvOf(v.world - vec3f(0.0, 0.0, 2.0 * v.world.z)), 0.0);
    refl = refl + m.rgb * select(2.0, 1.0, light);
  }
  var col = behind * (1.0 - Fr) + refl * Fr * look.y;

  // the edge, where glass reads as glass: a crisp catch-light along the top of the bevel, the side seen
  // lengthwise through the glass (deeper tint, light caught inside)
  let bev = inst(id, 2u).x;
  let onBevel = v.local.z > h - bev - 0.02 && !top;
  let catchL = select(0.0, smoothstep(0.55, 0.8, v.localN.z) * (1.0 - smoothstep(0.88, 0.985, v.localN.z)), onBevel);
  let side = select(0.0, 1.0 - smoothstep(0.05, 0.3, abs(v.localN.z)), !top);
  let facing = 0.6 + 0.4 * clamp(dot(normalize(v.normal.xy + 1e-5), F.keyPlan.xy * -1.0), -1.0, 1.0);
  if (!light) {
    col += F.envTint.rgb * catchL * look.x * 0.55 * facing;
    col += F.glassTint.rgb * side * look.x * 0.035 + F.envTint.rgb * pow(1.0 - NdV, 3.0) * look.x * 0.08;
  } else {
    col = mix(col, vec3f(1.0), catchL * look.x * 0.9 * facing);
    col = mix(col, col * F.glassTint.rgb * 0.9, side * look.x * 0.55);
  }
  if (top) {
    // what stands on the glass shades it where it touches
    let cs = contactAt(v.world.xy);
    let k = raisedContact(cs, v.world.z);
    if (k > 0.0) { col *= tintShade(1.0 - k * 0.6); }
    // the etched title: frosted deeper, so it scatters light (lighter in dark, a grey print on white ceramic)
    let lp = v.local.xy;
    let uPerPx = length(fwidth(v.local)) * 0.7071 + 1e-5;
    let a = etchAt(id, lp, uPerPx) * look.z;
    let ink = inst(id, 14u).rgb;
    col = toLin(mix(toSrgb(col), toSrgb(select(mix(col, ink, 0.5) + 0.02, ink, light)), a * select(1.0, 0.62, light)));
  }
  return vec4f(col, 1.0);
}
`;
