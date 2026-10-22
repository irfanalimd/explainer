import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, luminance, ratio } from "./a11y.mjs";

const near = (got, want, eps = 1) => {
  assert.ok(got, `no colour for ${want}`);
  got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) <= (i === 3 ? 0.01 : eps), `channel ${i}: ${v} vs ${want[i]}`));
};

test("parseColor reads rgb() in both syntaxes, with and without alpha", () => {
  near(parseColor("rgb(72, 75, 82)"), [72, 75, 82, 1]);
  near(parseColor("rgba(255, 255, 255, 0.1)"), [255, 255, 255, 0.1]);
  near(parseColor("rgb(0 128 255 / 50%)"), [0, 128, 255, 0.5]);
});

test("parseColor reads the spaces Chrome keeps color-mix() results in", () => {
  // CSS red, white and black in oklab and oklch; an sRGB color()
  near(parseColor("oklab(62.8% 0.225 0.126)"), [255, 0, 0, 1], 2);
  near(parseColor("oklab(1 0 0)"), [255, 255, 255, 1]);
  near(parseColor("oklch(0 0 0)"), [0, 0, 0, 1]);
  near(parseColor("oklch(0.628 0.2577 29.23)"), [255, 0, 0, 1], 2);
  near(parseColor("color(srgb 0.5 0.25 1 / 0.5)"), [127.5, 63.75, 255, 0.5]);
});

test("a colour it cannot read is null, never black", () => {
  assert.equal(parseColor("color(display-p3 1 0 0)"), null);
  assert.equal(parseColor("currentcolor"), null);
  // the code panel's keyword ink in dark (color-mix of busy and ink): light on dark, not 1.05:1
  const kw = parseColor("oklab(0.863163 -0.00571093 -0.062468)");
  assert.ok(ratio(luminance(...kw.slice(0, 3)), luminance(15, 15, 17)) > 10);
});
