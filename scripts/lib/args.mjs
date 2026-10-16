// Tiny argv parser shared by the scripts. Unknown flags fail loudly with the usage text.
//   const a = parseArgs(process.argv.slice(2), { usage, flags: { out: "string", dev: "boolean", allow: "list" } });
//   a._ (positionals), a.out, a.dev ...  --x value | --x=value | --no-x (booleans) | lists repeat or use commas
import { realpathSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export function parseArgs(argv, { usage = "", flags = {}, defaults = {} } = {}) {
  const out = { _: [], ...defaults };
  const fail = (msg) => { console.error(`${msg}\n\n${usage.trim()}`); process.exit(2); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { console.log(usage.trim()); process.exit(0); }
    if (!a.startsWith("--") || a === "--") { out._.push(a); continue; }
    let [name, value] = a.slice(2).split(/=(.*)/s);
    let neg = false;
    if (!(name in flags) && name.startsWith("no-") && flags[name.slice(3)] === "boolean") { name = name.slice(3); neg = true; }
    const type = flags[name];
    if (!type) fail(`unknown option --${name}`);
    const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (type === "boolean") { out[key] = neg ? false : value === undefined ? true : !/^(0|false|no)$/i.test(value); continue; }
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined || (value.startsWith("--") && value.length > 2)) fail(`--${name} needs a value`);
    }
    if (type === "number") { const n = Number(value); if (!Number.isFinite(n)) fail(`--${name} must be a number, got "${value}"`); out[key] = n; }
    else if (type === "list") out[key] = [...(out[key] && out[key] !== defaults[key] ? out[key] : []), ...value.split(",").map((s) => s.trim()).filter(Boolean)];
    else out[key] = value;
  }
  return out;
}

/** "1440x900" -> { width, height }; also accepts the record presets. */
export function parseSize(s) {
  const presets = { landscape: "1920x1080", "1080p": "1920x1080", "720p": "1280x720", vertical: "1080x1920", portrait: "1080x1920", square: "1080x1080", desktop: "1440x900", phone: "390x844" };
  const m = /^(\d+)x(\d+)$/.exec(presets[s] ?? s);
  if (!m) throw new Error(`bad size "${s}" (use WxH, e.g. 1440x900, or ${Object.keys(presets).join(", ")})`);
  return { width: Number(m[1]), height: Number(m[2]) };
}

export const fmtBytes = (n) => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
/** A path for messages: relative to the working directory unless that climbs out of it, then absolute. */
export function showPath(p) {
  const r = relative(process.cwd(), p);
  return !r ? "." : r.startsWith("../") || r === ".." || isAbsolute(r) ? p : r;
}

/** True when the module is the script node was started with (not imported). */
export function isMain(meta) {
  if (!process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(meta.url)); } catch { return false; }
}
