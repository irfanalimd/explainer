// Number formatting and caption-markup helpers for generated narration (CONTRACTS.md 4.4).
// Typography: a no-break space joins a number to its unit ("1.4 KB" never wraps), a narrow no-break
// space groups thousands ("12 345"), and negative numbers use a true minus sign (−). ascii() undoes all three.

export const NBSP = " ";   // number–unit joiner
export const THIN = " ";   // thousands separator (narrow no-break space)
export const MINUS = "−";
export const TONES = ["ok", "busy", "warn", "fail", "idle"];

const trimZeros = (s) => (s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s);

function group(intDigits) {
  let out = "";
  for (let i = 0; i < intDigits.length; i++) {
    if (i > 0 && (intDigits.length - i) % 3 === 0) out += THIN;
    out += intDigits[i];
  }
  return out;
}

// "1234.5" -> "1 234.5" with a true minus
function dress(str) {
  let neg = false;
  if (str.startsWith("-")) { neg = true; str = str.slice(1); }
  const [i, f] = str.split(".");
  const body = group(i) + (f ? "." + f : "");
  return (neg && /[1-9]/.test(body) ? MINUS : "") + body;
}

/** A plain number: thousands grouped, up to `digits` decimals (default: integers as is, else up to 2, trailing zeros trimmed). */
export function num(n, digits) {
  if (typeof n === "bigint") return dress(n.toString());
  if (typeof n !== "number" || Number.isNaN(n)) return "NaN";
  if (!Number.isFinite(n)) return n > 0 ? "∞" : MINUS + "∞";
  if (digits === undefined) return dress(Number.isInteger(n) ? String(n) : trimZeros(n.toFixed(2)));
  return dress(n.toFixed(digits));
}

/** Integer, rounded, grouped. */
export const int = (n) => num(Math.round(n));

// significant formatting used by unit formatters: < 100 one decimal (trimmed), otherwise an integer
function sig(v) {
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 1) return dress(trimZeros(v.toFixed(2)));
  if (a < 100) return dress(trimZeros(v.toFixed(1)));
  return dress(String(Math.round(v)));
}
const sigRounded = (v) => { const a = Math.abs(v); return a < 1 ? Math.round(v * 100) / 100 : a < 100 ? Math.round(v * 10) / 10 : Math.round(v); };

/** bytes(1400) "1.4 KB"; decimal units by default, { binary: true } for KiB, MiB (page and block sizes). */
export function bytes(n, opts = {}) {
  const base = opts.binary ? 1024 : 1000;
  const units = opts.binary ? ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] : ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = n, i = 0;
  if (Math.abs(Math.round(v)) < base) return dress(String(Math.round(v))) + NBSP + "B";
  while (i < units.length - 1 && Math.abs(sigRounded(v)) >= base) { v /= base; i++; }
  return sig(v) + NBSP + units[i];
}

/** ms(4.1) "4.1 ms"; sub-millisecond values become µs or ns, 1000 ms and up become s. */
export function ms(x) {
  const a = Math.abs(x);
  if (a === 0) return "0" + NBSP + "ms";
  if (a < 0.001 && Math.abs(sigRounded(x * 1e6)) < 1000) return sig(x * 1e6) + NBSP + "ns";
  if (a < 1 && Math.abs(sigRounded(x * 1000)) < 1000) return sig(x * 1000) + NBSP + "µs";
  if (Math.abs(sigRounded(x)) < 1000) return sig(x) + NBSP + "ms";
  return sig(x / 1000) + NBSP + "s";
}

/** pct(0.42) "42%". Input is a fraction; `digits` defaults to 1 below 10 % (trimmed), else 0. */
export function pct(fraction, digits) {
  const p = fraction * 100;
  if (digits !== undefined) return dress(p.toFixed(digits)) + "%";
  return (Math.abs(p) < 10 ? dress(trimZeros(p.toFixed(1))) : dress(String(Math.round(p)))) + "%";
}

/** ratio(2.34) "2.3×" */
export function ratio(x, digits) {
  if (digits !== undefined) return dress(x.toFixed(digits)) + "×";
  return (Math.abs(x) < 10 ? dress(trimZeros(x.toFixed(1))) : dress(String(Math.round(x)))) + "×";
}

function bigOf(value, who) {
  if (typeof value === "bigint") return value;
  if (typeof value !== "number" || !Number.isInteger(value)) throw new TypeError(`fmt.${who}: expected an integer or BigInt, got ${value}`);
  return BigInt(value);
}

function radix(value, base, width, opts, prefix, who) {
  if (width !== null && typeof width === "object") { opts = width; width = opts.width; }
  opts = opts ?? {};
  let v = bigOf(value, who);
  const neg = v < 0n;
  if (neg) v = -v;
  let digits = v.toString(base);
  if (width) digits = digits.padStart(width, "0");
  const g = opts.group === true ? 4 : opts.group === false ? 0 : opts.group ?? (base === 16 ? (digits.length >= 8 ? 4 : 0) : (digits.length > 8 ? 4 : 0));
  if (opts.upper) digits = digits.toUpperCase();
  if (g > 0) {
    let out = "";
    for (let i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % g === 0) out += "_";
      out += digits[i];
    }
    digits = out;
  }
  return (neg ? MINUS : "") + (opts.prefix === false ? "" : prefix) + digits;
}

/**
 * hex(0x7f3a, 4) "0x7f3a"; hex(0x7f3a2c10, 8) "0x7f3a_2c10".
 * width pads with zeros; opts.group = digits per "_" group (default 4 once there are 8 or more digits, false to disable),
 * opts.upper, opts.prefix = false. Accepts BigInt for 64-bit values.
 */
export const hex = (value, width, opts) => radix(value, 16, width ?? null, opts, "0x", "hex");

/** bin(0b1011, 8) "0b00001011"; groups of 4 once there are more than 8 digits. */
export const bin = (value, width, opts) => radix(value, 2, width ?? null, opts, "0b", "bin");

const IRREGULAR = { entry: "entries", index: "indices", child: "children", datum: "data", leaf: "leaves", vertex: "vertices", matrix: "matrices" };
export function pluralize(word) {
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (/(s|x|z|ch|sh)$/.test(word)) return word + "es";
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
}

/** plural(3, "comparison") "3 comparisons"; plural(1, "entry") "1 entry"; a third argument overrides the plural. */
export function plural(n, one, many) {
  return num(n) + NBSP + (n === 1 ? one : many ?? pluralize(one));
}

/** and(["a", "b", "c"]) "a, b and c" */
export function and(list, conj = "and") {
  const a = Array.from(list);
  if (a.length <= 1) return a.join("");
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(", ")} ${conj} ${a[a.length - 1]}`;
}

/** Replace the typographic spaces and minus with ASCII (logs, tests, plain-text exports). */
export const ascii = (s) => String(s).replaceAll(NBSP, " ").replaceAll(THIN, " ").replaceAll(MINUS, "-");

// ---- caption markup ----------------------------------------------------------------------------

const SPECIAL = /[{}`*\\|]/g;
/** Escape text so it reads literally inside a caption (backslash escapes, CONTRACTS.md 4.4). */
export const escape = (text) => String(text ?? "").replace(SPECIAL, (c) => "\\" + c);

const idOf = (x) => (x !== null && typeof x === "object" && "id" in x ? x.id : x);

function markName(name, who) {
  const s = String(idOf(name));
  if (!s.trim()) throw new TypeError(`fmt.${who}: empty name`);
  if (/[{}|`\\]/.test(s)) throw new TypeError(`fmt.${who}: "${s}" contains a markup character ({ } | \` \\), which cannot appear in a ${who} name`);
  return s;
}
// mark text is taken literally by the caption parsers; braces and backslashes cannot be expressed inside a mark
function markText(text, who) {
  const s = String(text);
  if (/[{}\\]/.test(s)) throw new TypeError(`fmt.${who}: text "${s}" contains { } or \\, which cannot appear inside a mark`);
  return s;
}

/** key("fox") "{key:fox}" — a chip in fox's identity colour; key("fox", "the word fox") with custom text. */
export const key = (name, text) => (text === undefined ? `{key:${markName(name, "key")}}` : `{key:${markName(name, "key")}|${markText(text, "key")}}`);

/** ref("m2") "{ref:m2}" — an entity chip (hover lights it); accepts a handle. */
export const ref = (id, text) => (text === undefined ? `{ref:${markName(id, "ref")}}` : `{ref:${markName(id, "ref")}|${markText(text, "ref")}}`);

/** tone("fail", "crashed") "{tone:fail|crashed}" */
export function tone(t, text) {
  if (!TONES.includes(t)) throw new TypeError(`fmt.tone: unknown tone "${t}" (use ${TONES.join(", ")})`);
  return `{tone:${t}|${markText(text, "tone")}}`;
}

/** term("pointer") "{term:pointer}" — a glossary word (its plain definition lives in meta.terms); term("pointer", "pointers"). */
export const term = (name, text) => (text === undefined ? `{term:${markName(name, "term")}}` : `{term:${markName(name, "term")}|${markText(text, "term")}}`);

/** code("hash(k) % R") "`hash(k) % R`" */
export const code = (text) => "`" + String(text).replace(/[`\\]/g, (c) => "\\" + c) + "`";

/** bold("text") "**text**" (markup inside is kept) */
export const bold = (markup) => `**${markup}**`;

/** Strip markup to plain text (chips become their text; refs without text become their id). */
export function plain(markup) {
  return String(markup)
    .replace(/\{(?:key|ref|tone|term):([^{}|]*)(?:\|((?:\\.|[^{}])*))?\}/g, (_, a, b) => (b === undefined ? a : b))
    .replace(/\*\*/g, "")
    .replace(/(^|[^\\])`/g, "$1")
    .replace(/\\(.)/g, "$1");
}

/** Capitalise the first letter of plain text that follows any leading mark. */
export function sentence(markup) {
  const s = String(markup);
  const m = /^((?:\{[^}]*\}|\s)*)([a-z])/.exec(s);
  if (!m || m[1]) return s; // starts with a chip: leave it
  return s.slice(0, m[1].length) + m[2].toUpperCase() + s.slice(m[1].length + 1);
}
