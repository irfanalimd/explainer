// World state as copy-on-write entity maps. A state is a Map(id -> frozen record); unchanged records are
// shared between states (structural sharing), so a snapshot is O(1) to hand out and exact to scrub back to.
// applyOp(draft, op) is the single transition function: applying the ops of step i to S_i gives S_{i+1}.

export const CONTAINERS = new Set(["housing", "container"]);
export const PARENTS = new Set(["housing", "container", "group"]);
export const LAYOUT_MEMBERS = new Set(["housing", "container", "group", "spacer", "lanes", "text", "tile"]);

/** A mutable view over a base state that copies the map on first write. */
export class Draft {
  constructor(base = new Map()) { this.base = base; this.map = null; }
  get(id) { return (this.map ?? this.base).get(id); }
  has(id) { return (this.map ?? this.base).has(id); }
  set(id, rec) { if (!this.map) this.map = new Map(this.base); this.map.set(id, Object.freeze(rec)); return rec; }
  delete(id) { if (!this.has(id)) return; if (!this.map) this.map = new Map(this.base); this.map.delete(id); }
  /** Freeze the current contents as a state; the draft continues from it. */
  commit() { if (this.map) { this.base = this.map; this.map = null; } return this.base; }
  get state() { return this.map ?? this.base; }
}

export const isContainer = (rec) => !!rec && (rec.kind === "container" || (rec.kind === "housing" && !!rec.tray));
export const isParent = (rec) => !!rec && (rec.kind === "group" || isContainer(rec));
export const isTileKind = (rec) => !!rec && rec.kind === "tile";

function withChildren(rec, children) { return { ...rec, children: Object.freeze(children) }; }

function attach(draft, parentId, id, index) {
  const p = draft.get(parentId);
  if (!p) return;
  const kids = p.children.filter((c) => c !== id);
  const i = index === undefined || index === null ? kids.length : Math.max(0, Math.min(kids.length, index | 0));
  kids.splice(i, 0, id);
  draft.set(parentId, withChildren(p, kids));
}

function detach(draft, parentId, id) {
  const p = draft.get(parentId);
  if (!p || !p.children.includes(id)) return -1;
  const i = p.children.indexOf(id);
  draft.set(parentId, withChildren(p, p.children.filter((c) => c !== id)));
  return i;
}

/** Remove an entity and everything inside it. Returns the removed ids (outermost first). */
function removeTree(draft, id, out = []) {
  const rec = draft.get(id);
  if (!rec) return out;
  out.push(id);
  if (rec.children) for (const c of rec.children) removeTree(draft, c, out);
  if (rec.parent) detach(draft, rec.parent, id);
  draft.delete(id);
  return out;
}

export const indexIn = (state, id) => {
  const rec = state.get(id);
  if (!rec?.parent) return -1;
  const p = state.get(rec.parent);
  return p?.children ? p.children.indexOf(id) : -1;
};

/**
 * Apply one recorded op to a draft. Ops are fully specified (records already built by the builder), so this
 * is deterministic and needs no context. Returns a small info object the choreographer can use.
 */
export function applyOp(draft, op) {
  switch (op.op) {
    case "create": {
      const rec = op.rec;
      draft.set(rec.id, rec);
      if (rec.parent) attach(draft, rec.parent, rec.id, op.index);
      return {};
    }
    case "spawn": {
      draft.set(op.rec.id, op.rec);
      attach(draft, op.rec.parent, op.rec.id, op.index);
      return {};
    }
    case "move": {
      const rec = draft.get(op.id);
      if (!rec) return {};
      const fromParent = rec.parent, fromIndex = fromParent ? detach(draft, fromParent, op.id) : -1;
      draft.set(op.id, { ...rec, parent: op.to });
      attach(draft, op.to, op.id, op.index);
      return { fromParent, fromIndex };
    }
    case "swap": {
      const a = draft.get(op.a), b = draft.get(op.b);
      if (!a || !b) return {};
      if (a.parent === b.parent) {
        const p = draft.get(a.parent);
        const kids = p.children.slice();
        const ia = kids.indexOf(op.a), ib = kids.indexOf(op.b);
        kids[ia] = op.b; kids[ib] = op.a;
        draft.set(p.id, withChildren(p, kids));
      } else {
        const pa = draft.get(a.parent), pb = draft.get(b.parent);
        const ka = pa.children.slice(), kb = pb.children.slice();
        ka[ka.indexOf(op.a)] = op.b; kb[kb.indexOf(op.b)] = op.a;
        draft.set(pa.id, withChildren(pa, ka));
        draft.set(pb.id, withChildren(pb, kb));
        draft.set(op.a, { ...a, parent: b.parent });
        draft.set(op.b, { ...draft.get(op.b), parent: a.parent });
      }
      return {};
    }
    case "remove": {
      return { removed: removeTree(draft, op.id) };
    }
    case "set": {
      const rec = draft.get(op.id);
      if (!rec) return {};
      draft.set(op.id, { ...rec, ...op.props });
      return {};
    }
    case "send": {
      if (op.hold) draft.set(op.id, op.rec);
      return {};
    }
    case "deliver": {
      const rec = draft.get(op.id);
      if (!rec) return {};
      if (op.into) {
        draft.set(op.id, op.rec);
        attach(draft, op.into, op.id, op.index);
      } else draft.delete(op.id);
      return {};
    }
    case "point": {
      const rec = draft.get(op.id);
      if (rec) draft.set(op.id, { ...rec, target: op.target, slot: op.slot });
      return {};
    }
    default:
      return {};
  }
}

/** Ops that change what is in the world (as opposed to annotations: lit, tag, count, focus, line, say). */
export const WORLD_OPS = new Set(["create", "spawn", "move", "swap", "remove", "set", "send", "deliver", "point"]);
