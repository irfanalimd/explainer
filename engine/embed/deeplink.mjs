// Readable deep links: #step-12, #scenario-crash, #level-expert, alone or joined with "&" (#scenario-crash&step-4).
// They sit beside the HUD's own state hash (#s=…&t=…&p=…, engine/hud/link.mjs), which ignores them. DOM-free.
//   parseLinks("#scenario-crash&step-4") -> { scenario: "crash", step: 4, level: undefined, found: true }
//   stripLinks("#t=3.2&step-4")          -> "t=3.2"   (the hash without them, once they are applied)

const LEVELS = new Set(["new", "basics", "expert"]);
const RE = /^(step|scenario|level)-(.+)$/;

export function parseLinks(hash) {
  const out = { step: undefined, scenario: undefined, level: undefined, found: false };
  for (const part of String(hash ?? "").replace(/^#/, "").split("&")) {
    const m = RE.exec(part);
    if (!m) continue;
    let v = m[2];
    try { v = decodeURIComponent(v); } catch { /* keep it raw */ }
    if (m[1] === "step" && /^\d+$/.test(v) && +v >= 1) out.step = +v;
    else if (m[1] === "scenario" && /^[\w.-]{1,64}$/.test(v)) out.scenario = v;
    else if (m[1] === "level" && LEVELS.has(v)) out.level = v;
    else continue;
    out.found = true;
  }
  return out;
}

export const stripLinks = (hash) => String(hash ?? "").replace(/^#/, "").split("&").filter((p) => p && !RE.test(p)).join("&");
