import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { rng, xoshiro128ss, hash128 } from "./rng.mjs";

const draws = (r, n, f = (x) => x.next()) => Array.from({ length: n }, () => f(r));

// an independent BigInt reference of xoshiro128** (Blackman & Vigna)
function reference(a, b, c, d, n) {
  const M = 0xffffffffn;
  let s = [BigInt(a), BigInt(b), BigInt(c), BigInt(d)];
  const rotl = (x, k) => ((x << BigInt(k)) | (x >> BigInt(32 - k))) & M;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(Number((rotl((s[1] * 5n) & M, 7) * 9n) & M));
    const t = (s[1] << 9n) & M;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3]; s[2] ^= t; s[3] = rotl(s[3], 11);
  }
  return out;
}

test("xoshiro128** matches an independent reference", () => {
  for (const seed of [[1, 2, 3, 4], [0xdeadbeef, 0x12345678, 0x9abcdef0, 0x0badf00d]]) {
    const g = xoshiro128ss(...seed);
    assert.deepEqual(Array.from({ length: 64 }, () => g()), reference(...seed, 64));
  }
  const g = xoshiro128ss(1, 2, 3, 4);
  assert.equal(g(), 11520); // rotl(2 * 5, 7) * 9
});

test("same seed, same stream; different seeds differ; numbers and strings agree", () => {
  assert.deepEqual(draws(rng(7), 500), draws(rng(7), 500));
  assert.deepEqual(draws(rng(7), 50), draws(rng("7"), 50));
  assert.notDeepEqual(draws(rng(7), 50), draws(rng(8), 50));
  assert.equal(rng().seed, "1");
  assert.throws(() => rng(NaN), /finite/);
  assert.equal(hash128("abc").length, 4);
});

test("fork is pure in (seed path, label) and independent of the parent's position", () => {
  const a = rng(7);
  draws(a, 123);
  assert.deepEqual(draws(a.fork("net"), 50), draws(rng(7).fork("net"), 50));
  assert.deepEqual(draws(rng(7).fork("net"), 20), draws(rng("7/net"), 20));
  assert.notDeepEqual(draws(rng(7).fork("net"), 20), draws(rng(7).fork("disk"), 20));
  assert.notDeepEqual(draws(rng(7).fork("net"), 20), draws(rng(7), 20));
  assert.equal(rng(7).fork("a").fork("b").seed, "7/a/b");
  // forking does not move the parent
  const p = rng(3), q = rng(3);
  p.fork("x"); p.fork("y");
  assert.deepEqual(draws(p, 10), draws(q, 10));
});

test("clone continues from the same position", () => {
  const r = rng(11);
  draws(r, 37);
  const c = r.clone();
  assert.deepEqual(draws(r, 40), draws(c, 40));
});

test("int is inclusive, unbiased enough and validated", () => {
  const r = rng(5);
  const counts = new Array(6).fill(0);
  const N = 60000;
  for (let i = 0; i < N; i++) { const x = r.int(1, 6); assert.ok(x >= 1 && x <= 6); counts[x - 1]++; }
  const chi = counts.reduce((a, c) => a + (c - N / 6) ** 2 / (N / 6), 0);
  assert.ok(chi < 25, `chi-square ${chi}`); // 5 dof, p ≈ 1e-4
  assert.equal(r.int(4, 4), 4);
  assert.ok(draws(r, 200, (x) => x.int(-3, 3)).every((x) => x >= -3 && x <= 3));
  const wide = draws(r, 200, (x) => x.int(0, 2 ** 40));
  assert.ok(wide.every((x) => Number.isInteger(x) && x >= 0 && x <= 2 ** 40));
  assert.ok(Math.max(...wide) > 2 ** 38);
  assert.ok(draws(r, 100, (x) => x.int(1.5, 3.9)).every((x) => x === 2 || x === 3), "non-integer bounds: the integers between them");
  assert.throws(() => r.int(3), /finite/);
  assert.throws(() => r.int(5, 1), /no integer/);
  assert.throws(() => r.int(1.2, 1.8), /no integer/);
});

test("float, chance, bool, exp and normal have the right shape", () => {
  const r = rng(9);
  const f = draws(r, 5000, (x) => x.float(2, 5));
  assert.ok(f.every((x) => x >= 2 && x < 5));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean(f) - 3.5) < 0.05);
  assert.ok(Math.abs(mean(draws(r, 20000, (x) => (x.chance(0.3) ? 1 : 0))) - 0.3) < 0.02);
  assert.ok(Math.abs(mean(draws(r, 20000, (x) => (x.bool() ? 1 : 0))) - 0.5) < 0.02);
  assert.ok(Math.abs(mean(draws(r, 20000, (x) => x.exp(40))) - 40) < 1.5);
  const g = draws(r, 20000, (x) => x.normal(10, 2));
  const m = mean(g), sd = Math.sqrt(mean(g.map((x) => (x - m) ** 2)));
  assert.ok(Math.abs(m - 10) < 0.06 && Math.abs(sd - 2) < 0.06, `${m} ${sd}`);
});

test("shuffle, sample, pick and weighted", () => {
  const r = rng(13);
  const input = [1, 2, 3, 4, 5, 6, 7];
  const out = r.shuffle(input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7], "input untouched");
  assert.deepEqual(out.slice().sort(), input);
  const perms = new Map();
  for (let i = 0; i < 6000; i++) { const k = r.shuffle(["a", "b", "c"]).join(""); perms.set(k, (perms.get(k) ?? 0) + 1); }
  assert.equal(perms.size, 6);
  for (const c of perms.values()) assert.ok(Math.abs(c - 1000) < 150, `perm count ${c}`);
  const smp = r.sample(input, 4);
  assert.equal(new Set(smp).size, 4);
  assert.ok(smp.every((x) => input.includes(x)));
  assert.throws(() => r.sample(input, 8), /k = 8/);
  assert.equal(r.pick([]), undefined);
  assert.ok(input.includes(r.pick(input)));
  const w = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 20000; i++) w[r.weighted(["a", "b", "c"], [1, 2, 7])]++;
  assert.ok(Math.abs(w.c / 20000 - 0.7) < 0.02 && Math.abs(w.a / 20000 - 0.1) < 0.015);
  assert.throws(() => r.weighted(["a"], [0]), /total weight/);
});

test("no simulation module uses Math.random or Date.now", () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".mjs") && !f.endsWith(".test.mjs")) files.push(p); } };
  walk(root);
  assert.ok(files.length >= 8);
  for (const f of files) {
    const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "");
    assert.ok(!/Math\.random|Date\.now|performance\.now|new Date\(/.test(src), `${f} uses a nondeterministic source`);
  }
});
