// Colour conversion for the renderer. Pure, DOM-free.
// Tokens are sRGB ("#rrggbb" or [r, g, b(, a)] floats); the GPU works in linear light.
import { hex } from "../tokens.mjs";

export const toLinear1 = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const toSrgb1 = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/** Any token colour to sRGB floats [r, g, b, a]. */
export function srgba(c, fallback = [1, 0, 1, 1]) {
  if (c == null) return fallback.slice();
  if (typeof c === "string") { const [r, g, b] = hex(c); return [r, g, b, 1]; }
  return [c[0], c[1], c[2], c[3] ?? 1];
}

/** Any token colour to linear [r, g, b, a] (alpha untouched). */
export function linear(c, fallback) {
  const s = srgba(c, fallback);
  return [toLinear1(s[0]), toLinear1(s[1]), toLinear1(s[2]), s[3]];
}

export const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Linear colour written into a typed array at offset (rgb only). */
export function putLinear(arr, o, c, fallback) {
  const l = linear(c, fallback);
  arr[o] = l[0]; arr[o + 1] = l[1]; arr[o + 2] = l[2];
  return l[3];
}
