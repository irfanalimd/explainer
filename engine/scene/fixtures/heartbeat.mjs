// Test figure for the sim-runtime path: a tiny discrete-event network (written inline, the way sim/actors.mjs
// drives the builder) with held sends delivered steps later, many messages in flight at once, lane diagonals,
// marks and a crash. A leader broadcasts heartbeats; followers ack; one follower dies and stops acking.

export const meta = { title: "Heartbeats", subtitle: "A leader and its followers on a space-time board", kicker: "Distributed systems", fig: 2 };
export const params = {
  followers: { label: "Followers", type: "int", min: 1, max: 4, value: 3 },
  rounds: { label: "Rounds", type: "int", min: 1, max: 6, value: 3 },
  seed: { label: "Seed", type: "int", value: 3 },
};
export const scenarios = [{ id: "steady", label: "Steady" }, { id: "crash", label: "Follower dies", params: { crashAt: 34 } }];
export const counters = { sent: { label: "messages", format: "int" }, acks: { label: "acks", format: "int" } };
export const invariants = {
  "acks never exceed heartbeats": (snap) => (snap.counters.acks ?? 0) <= (snap.counters.sent ?? 0) || "more acks than messages",
};

export function build(s, p, scenario) {
  const F = p.followers | 0, nodes = ["n0", ...Array.from({ length: F }, (_, k) => `n${k + 1}`)];
  s.row("cluster", { gap: 60 });
  nodes.forEach((n, k) => s.housing(n, { in: "cluster", title: k ? `follower ${k}` : "leader", sub: `192.0.2.${10 + k}`, led: k ? "idle" : "busy" }));
  s.lanes("time", { for: nodes, length: 640, unit: "ms" });
  s.phase("Heartbeats");
  s.pace({ ms: 6 });
  s.step(`${F} followers and a leader; time runs left to right on the board`, { t: 0 });

  // event queue: [t, seq, fn]
  const q = [];
  let seq = 0, msgN = 0;
  const at = (t, fn) => { q.push([t, seq++, fn]); q.sort((a, b) => a[0] - b[0] || a[1] - b[1]); };
  const dead = new Set();
  const crashAt = scenario === "crash" ? p.crashAt ?? 34 : Infinity;
  const latency = (a, b) => 3 + ((a.charCodeAt(1) * 7 + b.charCodeAt(1) * 13 + msgN * 5) % 7);

  const send = (from, to, kind, t) => {
    const id = `${kind}${++msgN}`;
    s.send(id, from, to, { deliver: "hold", lane: true, key: kind === "hb" ? "heartbeat" : "ack", text: kind });
    s.count("sent");
    at(t + latency(from, to), (tt) => {
      if (dead.has(to)) { s.remove(id); s.mark(to, { t: tt, text: "lost", tone: "fail" }); return `${id} reaches {ref:${to}} but it is down: the message is lost`; }
      s.deliver(id);
      s.mark(to, { t: tt, text: kind });
      if (kind === "hb") { s.set(to, { led: "ok" }); send(to, from, "ack", tt); return `{ref:${to}} gets the heartbeat at ${tt} ms and acks`; }
      s.count("acks");
      return `the leader hears {ref:${from}}'s ack at ${tt} ms`;
    });
    return id;
  };
  for (let r = 0; r < (p.rounds | 0); r++) {
    at(r * 20 + 2, (tt) => { s.mark("n0", { t: tt, text: `hb ${r + 1}` }); for (const n of nodes.slice(1)) send("n0", n, "hb", tt); return `the leader broadcasts heartbeat ${r + 1} at ${tt} ms`; });
  }
  if (crashAt < Infinity) at(crashAt, (tt) => { dead.add("n2"); s.set("n2", { led: "fail", dim: true }); s.mark("n2", { t: tt, text: "crash", tone: "fail" }); return `{ref:n2} {tone:fail|crashes} at ${tt} ms`; });

  let guard = 0;
  while (q.length && guard++ < 200) {
    const [t, , fn] = q.shift();
    const caption = fn(t);
    s.step(caption, { t });
  }
  s.hold(1.2, "Every diagonal on the board is one message: where it starts is when it was sent, where it ends is when it arrived");
}
