// Read step snapshots (tl.snapshot(i), stub snapshots) from figure invariants without depending on the
// exact record layout: entities may be a Map or a plain object, a record's inspector state lives in `.state`.

export function recordOf(snap, id) {
  const ents = snap?.entities;
  if (!ents) return null;
  return (ents instanceof Map ? ents.get(id) : ents[id]) ?? null;
}

/** The inspector state an entity was given with s.set(id, { state }) (or at declaration), or null. */
export function stateOf(snap, id) {
  const r = recordOf(snap, id);
  if (!r) return null;
  return r.state ?? null;
}

export function counterOf(snap, name) {
  const c = snap?.counters;
  if (!c) return 0;
  const v = c instanceof Map ? c.get(name) : c[name];
  return typeof v === "object" && v !== null ? v.value ?? 0 : v ?? 0;
}

/** All entity ids in a snapshot. */
export function idsOf(snap) {
  const ents = snap?.entities;
  if (!ents) return [];
  return ents instanceof Map ? [...ents.keys()] : Object.keys(ents);
}
