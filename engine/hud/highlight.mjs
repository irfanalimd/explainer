// A light syntax highlighter for the code panel: python, js, go, c, sql, pseudo.
// highlight(source, lang) -> lines: [[{ t: "kw"|"str"|"num"|"com"|"fn"|"type"|"op"|"", v: text }]]
// One regex pass over the whole source (so block comments and multi-line strings work), then split at newlines.

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

const LANGS = {
  python: {
    kw: words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case"),
    type: words("True False None self int str float bool list dict set tuple len range print enumerate zip map sorted min max sum hash"),
    com: "#[^\\n]*",
    str: `"""[\\s\\S]*?"""|'''[\\s\\S]*?'''|[rbf]?"(?:[^"\\\\\\n]|\\\\.)*"|[rbf]?'(?:[^'\\\\\\n]|\\\\.)*'`,
  },
  js: {
    kw: words("async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield"),
    type: words("true false null undefined NaN Infinity Math Array Object Map Set Promise String Number console"),
    com: "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
    str: "`(?:[^`\\\\]|\\\\.)*`|\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'",
  },
  go: {
    kw: words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var"),
    type: words("true false nil iota int int8 int16 int32 int64 uint uint8 uint16 uint32 uint64 uintptr float32 float64 string bool byte rune error any len cap make new append copy delete panic recover"),
    com: "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
    str: "`[^`]*`|\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'",
  },
  c: {
    kw: words("auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while #include #define #ifdef #ifndef #endif #if #else"),
    type: words("void char short int long float double signed unsigned bool size_t uint8_t uint16_t uint32_t uint64_t int32_t int64_t NULL true false"),
    com: "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
    str: "\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'",
  },
  sql: {
    kw: words("select from where and or not in is null as join inner left right outer full on group by order having limit offset insert into values update set delete create table index primary key foreign references begin commit rollback transaction distinct union all case when then else end exists between like asc desc"),
    type: words("int integer bigint text varchar char boolean timestamp date float real numeric count sum avg min max coalesce now true false"),
    com: "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
    str: "'(?:[^']|'')*'|\"[^\"\\n]*\"",
    ci: true,
  },
  pseudo: {
    kw: words("for each in if then else elif while do return function procedure end to from let and or not repeat until break continue emit yield with send receive wait on upon when"),
    type: words("true false nil null none"),
    com: "\\/\\/[^\\n]*|#[^\\n]*|--[^\\n]*",
    str: "\"(?:[^\"\\\\\\n]|\\\\.)*\"|'(?:[^'\\\\\\n]|\\\\.)*'",
  },
};
const ALIAS = { javascript: "js", ts: "js", typescript: "js", mjs: "js", py: "python", golang: "go", cpp: "c", "c++": "c", h: "c", text: "pseudo", plain: "pseudo" };
const cache = new Map();

function lexer(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const L = LANGS[lang];
  const ident = lang === "c" ? "#?[A-Za-z_][A-Za-z0-9_]*" : "[A-Za-z_][A-Za-z0-9_]*";
  const re = new RegExp(`(${L.com})|(${L.str})|(0x[0-9a-fA-F_]+|\\d[\\d_]*(?:\\.\\d+)?(?:e[+-]?\\d+)?)|(${ident})|(\\s+)|([^\\sA-Za-z0-9_])`, "gy");
  const lx = { re, L };
  cache.set(lang, lx);
  return lx;
}

export function highlight(source, lang = "pseudo") {
  const name = LANGS[lang] ? lang : ALIAS[String(lang).toLowerCase()] ?? "pseudo";
  const { re, L } = lexer(name);
  const src = String(source ?? "").replace(/\t/g, "    ").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const toks = [];
  re.lastIndex = 0;
  let m;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    if (!(m = re.exec(src))) { toks.push({ t: "", v: src.slice(at) }); break; }
    const v = m[0];
    let t = "";
    if (m[1]) t = "com";
    else if (m[2]) t = "str";
    else if (m[3]) t = "num";
    else if (m[4]) {
      const w = L.ci ? v.toLowerCase() : v;
      if (L.kw.has(w)) t = "kw";
      else if (/^\s*\(/.test(src.slice(re.lastIndex, re.lastIndex + 8))) t = "fn";
      else if (L.type.has(w)) t = "type";
    } else if (m[6]) t = "op";
    const prev = toks[toks.length - 1];
    if (prev && prev.t === t && (t === "" || t === "op")) prev.v += v; else toks.push({ t, v });
  }
  // split tokens at newlines into lines
  const lines = [[]];
  for (const tok of toks) {
    const parts = tok.v.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) lines.push([]);
      if (p) lines[lines.length - 1].push({ t: tok.t, v: p });
    });
  }
  return lines;
}
