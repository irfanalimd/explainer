// Deep links: #s=<scenario>&t=<seconds>&p=<key>:<value>,<key>:<value>
// Values are URI-encoded (so text params may contain commas and colons); unknown hash keys are preserved.

const OURS = new Set(["s", "t", "p"]);

function coerce(raw, def) {
  if (!def) return raw;
  switch (def.type) {
    case "int": case "float": {
      let n = Number(raw);
      if (!Number.isFinite(n)) return undefined;
      if (def.type === "int") n = Math.round(n);
      if (def.min != null) n = Math.max(def.min, n);
      if (def.max != null) n = Math.min(def.max, n);
      return n;
    }
    case "bool": return /^(1|true|on|yes)$/i.test(raw) ? true : /^(0|false|off|no)$/i.test(raw) ? false : undefined;
    case "select": {
      const o = (def.options ?? []).find((o) => String(o.value ?? o) === raw);
      return o === undefined ? undefined : (o.value ?? o);
    }
    default: return raw;
  }
}

/** Parse a location hash into { scenario, time, params, rest }. Missing parts are undefined; params only has what the link sets. */
export function parseHash(hash, paramDefs = {}, scenarios = null) {
  const out = { scenario: undefined, time: undefined, params: {}, rest: [] };
  const h = String(hash ?? "").replace(/^#/, "");
  if (!h) return out;
  for (const part of h.split("&")) {
    const eq = part.indexOf("=");
    const k = eq < 0 ? part : part.slice(0, eq);
    const val = eq < 0 ? "" : part.slice(eq + 1);
    if (!OURS.has(k)) { if (part) out.rest.push(part); continue; }
    if (k === "s") {
      const id = safeDecode(val);
      if (id && (!scenarios || scenarios.some((s) => s.id === id))) out.scenario = id;
    } else if (k === "t") {
      const t = Number(val);
      if (Number.isFinite(t) && t >= 0) out.time = t;
    } else if (k === "p") {
      for (const kv of val.split(",")) {
        const c = kv.indexOf(":");
        if (c <= 0) continue;
        const key = safeDecode(kv.slice(0, c));
        const v = coerce(safeDecode(kv.slice(c + 1)), paramDefs[key]);
        if (v !== undefined) out.params[key] = v;
      }
    }
  }
  return out;
}

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const enc = (v) => encodeURIComponent(typeof v === "boolean" ? (v ? 1 : 0) : v);

/** The params that differ from what the scenario resolves to (definitions' defaults + the scenario's overrides). */
export function paramOverrides(values = {}, paramDefs = {}, scenario = null) {
  const base = {};
  for (const k in paramDefs) base[k] = paramDefs[k].value;
  Object.assign(base, scenario?.params ?? {});
  const out = {};
  for (const k in values) if (values[k] !== base[k] && k in paramDefs) out[k] = values[k];
  return out;
}

/** Format { scenario, time, params, rest } as a hash string (without "#"). */
export function formatHash({ scenario, time, params = {}, rest = [] } = {}) {
  const parts = [];
  if (scenario) parts.push("s=" + enc(scenario));
  if (time != null && time > 0.05) parts.push("t=" + (Math.round(time * 10) / 10));
  const p = Object.keys(params).map((k) => enc(k) + ":" + enc(params[k]));
  if (p.length) parts.push("p=" + p.join(","));
  return [...parts, ...rest].join("&");
}
