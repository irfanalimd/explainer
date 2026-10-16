// Stress figure for the sampler budget (CONTRACTS.md: <= 2 ms per sample at 300 entities).
// 10 housings x 24 tiles, an array, traces, a bus, sends and moves every step
export const meta = { title: "Stress", subtitle: "~300 entities, moves and sends every step", kicker: "Engine test" };

export function build(s) {
  s.row("top", { gap: 90 });
  s.column("left", { in: "top", title: "left" });
  s.spacer("mid", { in: "top" });
  s.column("right", { in: "top", title: "right" });
  for (let h = 0; h < 10; h++) {
    s.housing(`h${h}`, { in: h < 5 ? "left" : "right", tray: { cols: 6, rows: 4 }, led: "ok" });
    for (let k = 0; k < 24; k++) s.tile(`h${h}.${k}`, { in: `h${h}`, text: String(k), key: `k${k % 8}` });
  }
  s.array("arr", Array.from({ length: 30 }, (_, i) => i), { in: "top" });
  s.bus("bus", { from: ["h0", "h1", "h2", "h3", "h4"], to: ["h5", "h6", "h7", "h8", "h9"], via: "mid" });
  for (let h = 0; h < 4; h++) s.trace(`t${h}`, `h${h}`, `h${h + 1}`);
  s.step("start");
  for (let i = 0; i < 40; i++) {
    const a = i % 5, b = 5 + ((i * 3) % 5);
    const tile = `h${a}.${i % 24}`;
    if (s.get(tile)?.parent === `h${a}`) s.move(tile, `h${b}`, { via: "bus" });
    s.send(`m${i}`, `h${b}`, `h${a}`, { via: "bus", key: "k1" });
    s.set(`arr[${i % 30}]`, { text: String(i * 7) });
    s.swap(`arr[${(i * 7) % 30}]`, `arr[${(i * 11 + 1) % 30}]`);
    s.count("ops");
    s.step(`step ${i}`);
  }
}
