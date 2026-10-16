// A figure with planted mistakes, to check that verify.mjs reports each one precisely. Not a real figure.
export const meta = { title: "Broken on purpose", theme: "dusk" };
export const params = {
  n: { label: "Items", type: "int", min: 2, max: 9, value: 4 },
  speed: { type: "float", min: 0.5, max: 2, value: 3 },
  mode: { label: "Mode", type: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], value: "a" },
  seed: { label: "Seed", type: "int", value: 1 },
};
export const scenarios = [
  { id: "base", label: "Base" },
  { id: "base", label: "Duplicate id" },
  { id: "chaos", label: "Chaos", params: { n: 5, wobble: 2, sped: 1 } },
  { id: "hang", label: "Hangs", params: { n: 3 } },
];
export const counters = { items: { label: "items", format: "count" }, idle: { label: "never used", format: "int" } };
export const invariants = {
  "at most 8 items": (snap) => (snap.counters.items ?? 0) <= 8 || `items = ${snap.counters.items}`,
  "forgot to return": () => {},
};
export function build(s, p, scenario) {
  if (scenario === "hang") for (;;) {}
  s.housing("h0", { title: "box" });
  s.phase("Fill");
  s.step("An empty box.");
  for (let i = 0; i < p.n; i++) {
    s.count("items");
    if (p.mode === "b") s.count("extra");
    s.step(i === 2 ? "" : `Item ${i + 1} goes in.`);
  }
  if (scenario === "chaos") s.step(`Chaos at ${Math.random()}`);
  s.set("ghost", { led: "ok" });
  s.step("Done.");
}
