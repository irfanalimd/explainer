// Narration helpers (CONTRACTS.md 4.4): build caption markup safely, flatten it to plain text, and list the
// keys and entity refs it mentions (compile checks that every {ref:id} names a real entity).
//   {key:fox} {key:fox|the word fox}  {ref:m2} {ref:m2|mapper 2}  {tone:fail|crashed}  `code`  **bold**

const SPECIAL = /[{}`*\\|]/g;
export const escape = (text) => String(text ?? "").replace(SPECIAL, (c) => "\\" + c);

export const key = (name, text) => (text === undefined ? `{key:${escape(name)}}` : `{key:${escape(name)}|${escape(text)}}`);
export const ref = (id, text) => (text === undefined ? `{ref:${escape(id)}}` : `{ref:${escape(id)}|${escape(text)}}`);
export const tone = (t, text) => `{tone:${t}|${escape(text)}}`;
export const code = (text) => "`" + String(text ?? "").replace(/`/g, "\\`") + "`";
export const bold = (markup) => `**${markup}**`;

const MARK = /^\{(key|ref|tone):((?:\\.|[^{}|\\])*)(?:\|((?:\\.|[^{}\\])*))?\}/;
const unescape = (s) => s.replace(/\\(.)/g, "$1");

/** Tokens: {type: "text"|"key"|"ref"|"tone"|"code"|"bold", ...}. Malformed marks stay literal. */
export function tokens(src) {
  const s = String(src ?? "");
  const out = [];
  let buf = "";
  const flush = () => { if (buf) { out.push({ type: "text", text: buf }); buf = ""; } };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length) { buf += s[i + 1]; i += 2; continue; }
    if (c === "`") {
      let j = i + 1;
      while (j < s.length && s[j] !== "`") j += s[j] === "\\" ? 2 : 1;
      if (j < s.length && j > i + 1) { flush(); out.push({ type: "code", text: unescape(s.slice(i + 1, j)) }); i = j + 1; continue; }
    }
    if (c === "*" && s[i + 1] === "*") {
      const j = s.indexOf("**", i + 2);
      if (j > i + 2) { flush(); out.push({ type: "bold", children: tokens(s.slice(i + 2, j)) }); i = j + 2; continue; }
    }
    if (c === "{") {
      const m = MARK.exec(s.slice(i));
      if (m && m[2].trim()) {
        flush();
        const name = unescape(m[2].trim());
        const text = m[3] === undefined ? null : unescape(m[3]);
        if (m[1] === "key") out.push({ type: "key", name, text: text ?? name });
        else if (m[1] === "ref") out.push({ type: "ref", id: name, text });
        else out.push({ type: "tone", tone: name, text: text ?? name });
        i += m[0].length;
        continue;
      }
    }
    buf += c; i++;
  }
  flush();
  return out;
}

/** Plain text of a caption; `titles(id)` supplies the text of {ref:id} chips without custom text. */
export function plain(src, titles = (id) => id) {
  const walk = (list) => list.map((t) =>
    t.type === "bold" ? walk(t.children) : t.type === "ref" ? (t.text ?? titles(t.id) ?? t.id) : t.text).join("");
  return walk(tokens(src)).replace(/\s+/g, " ").trim();
}

/** Keys and entity ids a caption mentions. */
export function mentions(src) {
  const keys = [], refs = [];
  const walk = (list) => { for (const t of list) { if (t.type === "key") keys.push(t.name); else if (t.type === "ref") refs.push(t.id); else if (t.type === "bold") walk(t.children); } };
  walk(tokens(src));
  return { keys, refs };
}
