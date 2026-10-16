// A small figure for testing the tooling: a token passed around a ring of nodes. 20 steps by default
// (2 boot, 15 passes, 3 settle). Scenario "drop" takes a node down; "glitch" plants problems on purpose
// (a tag far outside the frame and a console error at step 9) so audit and shoot have something to find.
export const meta = {
  title: "Token ring",
  subtitle: "A token passed around five nodes",
  kicker: "Tooling test",
  fig: 0,
  cite: { text: "IEEE 802.5", url: "https://standards.ieee.org/" },
  theme: "dark",
};

export const params = {
  nodes:  { label: "Nodes",  type: "int", min: 3, max: 8, value: 5 },
  rounds: { label: "Rounds", type: "int", min: 1, max: 4, value: 3 },
  drop:   { label: "Drop a node", type: "bool", value: false },
  glitch: { label: "Glitch", type: "bool", value: false },
  seed:   { label: "Seed", type: "int", value: 7 },
};

export const scenarios = [
  { id: "ring", label: "Ring" },
  { id: "drop", label: "Node drops", params: { drop: true } },
  { id: "glitch", label: "Audit glitch", params: { glitch: true } },
];

export const counters = {
  passes: { label: "passes", format: "int" },
  bytes: { label: "sent", format: "bytes" },
};

export const invariants = {
  "one token": (snap) => [...snap.entities.values()].filter((e) => e.state?.token).length <= 1 || "more than one node holds the token",
  "passes bounded": (snap, { params: p }) => (snap.counters.passes ?? 0) <= p.nodes * p.rounds || `passes ${snap.counters.passes} > ${p.nodes * p.rounds}`,
};

const IPS = ["192.0.2.10", "192.0.2.11", "192.0.2.12", "192.0.2.13", "192.0.2.14", "192.0.2.15", "192.0.2.16", "192.0.2.17"];

export function build(s, p) {
  const n = p.nodes, ids = IPS.slice(0, n).map((_, i) => `n${i}`);
  ids.forEach((id, i) => s.housing(id, { title: `node ${i}`, sub: IPS[i], led: "idle", state: { token: false } }));
  s.phase("Boot");
  s.step("Five nodes on a ring, each with an address from the documentation range.");
  for (const id of ids) s.set(id, { led: "ok" });
  s.set("n0", { state: { token: true } });
  s.focus("n0");
  s.step("Every node reports {tone:ok|ready}; {ref:n0} starts with the token.");
  s.phase("Pass");
  let holder = 0, passes = 0;
  const down = p.drop ? 2 : -1;
  for (let r = 0; r < p.rounds; r++) {
    for (let k = 0; k < n; k++) {
      let next = (holder + 1) % n;
      if (next === down) next = (next + 1) % n;
      s.send(`tok${passes}`, ids[holder], ids[next], { text: "TKN", key: "token" });
      s.set(ids[holder], { state: { token: false } });
      s.set(ids[next], { state: { token: true } });
      s.count("passes");
      s.count("bytes", 24);
      s.focus(ids[holder], ids[next]);
      if (p.glitch && passes === 7) s.tag(ids[next], "far away", { at: [9000, 9000, 0] });
      else if (passes % 4 === 1) s.tag(ids[next], `pass ${passes + 1}`);
      if (down >= 0 && r === 0 && k === 1) s.set(ids[down], { led: "fail", dim: true });
      s.step(`{ref:${ids[holder]}} hands the token to {ref:${ids[next]}} (pass ${passes + 1}).`);
      holder = next; passes++;
    }
  }
  s.phase("Settle");
  s.focus(...ids);
  s.step(`After ${passes} passes the token rests at {ref:${ids[holder]}}.`);
  for (const id of ids) if (id !== ids[down]) s.set(id, { led: "idle" });
  s.step("The ring goes quiet.");
  s.hold(1.2, "Every pass moved exactly one token.");
}
