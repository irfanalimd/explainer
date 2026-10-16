// __TITLE__: an Explainer figure. Start here: replace the binary search with your concept.
//
// A figure is a real, deterministic simulation. build() runs the algorithm for real and narrates it step by
// step through the builder `s`; the engine turns those steps into the lit world, the captions, the scrubber
// and the meters. Nothing here chooses a colour, a size or a position: layout, look and motion come from the
// engine. Every number a caption prints must come from the run.
//
// Check it:   node __SCRIPTS__/verify.mjs figure.mjs
// Build it:   node __SCRIPTS__/build.mjs figure.mjs            (one self-contained .html next to this file)
// Look at it: node __SCRIPTS__/shoot.mjs <page>.html           (screenshots + contact sheet)

// Title block and page metadata. `kicker` is shown as "ALGORITHMS · FIG 1"; `cite` links the source.
export const meta = {
  title: "__TITLE__",
  subtitle: "Halving a sorted array until one key is left",
  kicker: "Algorithms",
  fig: 1,
  cite: { text: "Knuth, The Art of Computer Programming, Vol. 3, §6.2.1", url: "https://www-cs-faculty.stanford.edu/~knuth/taocp.html" },
  theme: "dark",
  hook: "A sorted array of keys. How few looks does it take to find one, or to prove it is not there?",   // the start card's question
  takeaway: "Each comparison throws away half of what is left, so even a missing key costs only ⌈log2(n+1)⌉ looks.", // shown with the result
};

// Knobs in the settings drawer. Changing one re-runs build() instantly. verify.mjs runs every int/float at its
// min and max, every bool both ways and every select at its first and last option, so give ranges you mean.
export const params = {
  n:    { label: "Keys",  type: "int",  min: 4, max: 12, value: 10 },
  seed: { label: "Seed",  type: "int",  value: 7 },          // all randomness comes from s.rng, seeded from this
  // also: { type: "float", min, max, step }, { type: "bool" }, { type: "text" }, { type: "select", options: [{ value, label }] }
};

// Stories (the story picker). Each may override params; build() also receives the id to stage different stories.
export const scenarios = [
  { id: "found",   label: "Key present", whatIf: "the key is in the array",
    description: "The key is in the array, so the window closes on it in a few halvings." },
  { id: "missing", label: "Key absent", whatIf: "the key is missing",
    description: "The key is not in the array, so the window halves until it is empty." },
];

// The readout meters, in display order. format: "int" | "bytes" | "ms" | "pct" | "x".
export const counters = {
  compares: { label: "comparisons", format: "int", primary: true,
              hint: "How many times the key was compared with an element; never more than ⌈log2(n+1)⌉." },
  window:   { label: "candidates",  format: "int",
              hint: "How many elements could still be the key: the window between lo and hi." },
};

// Properties that must hold on every step's snapshot; verify.mjs checks them for every scenario and param
// extreme. Return true, or a message saying what went wrong. snap.counters holds the meter values.
export const invariants = {
  "at most ⌈log2(n+1)⌉ comparisons": (snap, { params: p }) => {
    const bound = Math.ceil(Math.log2(p.n + 1));
    return (snap.counters.compares ?? 0) <= bound || `${snap.counters.compares} comparisons, bound ${bound} for n = ${p.n}`;
  },
  "the window never grows": (snap, { params: p }) => (snap.counters.window ?? p.n) <= p.n || `window ${snap.counters.window} > n = ${p.n}`,
};

// Optional: the code panel (C key). s.line(from, to) lights lines as the run goes.
export const code = {
  lang: "python",
  source: [
    "def search(a, key):",
    "    lo, hi = 0, len(a) - 1",
    "    while lo <= hi:",
    "        mid = (lo + hi) // 2",
    "        if a[mid] == key: return mid",
    "        if a[mid] < key: lo = mid + 1",
    "        else: hi = mid - 1",
    "    return None",
  ].join("\n"),
};

// The simulation. Calls before the first s.step() set up the opening picture (no animation); every s.step()
// after that commits one animated step with its caption. s.phase(name, { about }) starts a chapter on the scrubber;
// `about` is 1-2 plain sentences on what the chapter does and why (the explain panel shows it).
export function build(s, p, scenario) {
  // Real data: sorted keys from the seeded RNG (never Math.random, which would break determinism).
  const keys = [];
  for (let i = 0, v = s.rng.int(3, 9); i < p.n; i++, v += s.rng.int(3, 11)) keys.push(v);
  const key = scenario === "missing" ? keys[Math.floor(p.n / 3)] + 1 : keys[s.rng.int(0, p.n - 1)];

  const a = s.array("a", keys, { label: "a" });               // -> { id, cells: [tile ids], cell(i) }
  s.pointer("lo", { at: a.cell(0), text: "lo" });
  s.pointer("hi", { at: a.cell(p.n - 1), text: "hi" });
  s.gauge("window", p.n);
  s.phase("Setup", { about: "Binary search needs a sorted array. It keeps a window of places the key could still be, from `lo` to `hi`." });
  s.line(1, 2);
  s.step(`A sorted array of ${p.n} keys. We look for \`${key}\`.`);

  s.phase("Search", { about: "Each step compares the key with the middle of the window and throws away the half that cannot hold it, so the window halves every time." });
  let lo = 0, hi = p.n - 1, at = -1, compares = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (!s.has("mid")) s.pointer("mid", { at: a.cell(mid), text: "mid" });
    else s.point("mid", a.cell(mid));
    s.count("compares"); compares++;
    s.lit(a.cell(mid));                                         // the one thing to watch this step
    s.tag(a.cell(mid), `a[${mid}] = ${keys[mid]}`);             // a floating chip for this step only
    s.line(4, 5);
    if (keys[mid] === key) {
      s.set(a.cell(mid), { tone: "ok" });
      s.step(`\`a[${mid}] = ${keys[mid]}\`: {tone:ok|found} after ${compares} comparison${compares > 1 ? "s" : ""}.`);
      at = mid;
      break;
    }
    const right = keys[mid] < key;
    for (let i = right ? lo : mid; i <= (right ? mid : hi); i++) s.set(a.cell(i), { dim: true });   // ruled out
    if (right) lo = mid + 1; else hi = mid - 1;
    if (lo <= hi) { s.point("lo", a.cell(lo)); s.point("hi", a.cell(hi)); }
    s.gauge("window", Math.max(0, hi - lo + 1));
    s.line(right ? 6 : 7);
    s.step(`\`${keys[mid]}\` is ${right ? "less" : "greater"} than \`${key}\`, so the key can only be to the ${right ? "right" : "left"}: ${Math.max(0, hi - lo + 1)} candidates left.`);
  }

  s.phase("Result", { about: at >= 0 ? "The key was found. Halving the window means about log2(n) comparisons, even for a large array." : "The window is empty, so the key is not in the array. Even proving that took only about log2(n) comparisons." });
  s.focus(a.id);                                                // frame the whole array for the closing shot
  s.line(at >= 0 ? 5 : 8);
  s.step(at >= 0 ? `Found at index ${at}. A linear scan would have needed ${at + 1} comparisons.`
                 : `The window is empty: \`${key}\` is {tone:fail|not in the array}.`);
}
