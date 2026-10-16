// Caption markup (CONTRACTS.md 4.4) -> a small node list -> DOM nodes or plain text.
//   {key:fox} {key:fox|the word fox}   identity chip        {ref:m2} {ref:m2|mapper 2}   entity chip
//   {tone:fail|crashed}                status-toned word    `code`                       inline code
//   {term:pointer} {term:pointer|pointers}  a glossary word: underlined; its plain definition (meta.terms) shows on
//                                      hover, focus or tap
//   **bold** (may contain the marks above)                  \{ \` \* \\                   literal characters
// Anything malformed stays literal text, so a caption never loses words.

export const TONES = ["ok", "busy", "warn", "fail", "idle"];
const MARK = /^\{(key|ref|tone|term):([^{}|]*)(?:\|([^{}]*))?\}/;

/** Parse markup into nodes: {type:"text"|"key"|"ref"|"tone"|"term"|"code"|"bold", ...}. Pure. */
export function parse(src, inBold = false) {
  const out = [];
  const s = String(src ?? "").replace(/\s*\n\s*/g, " ");
  let buf = "";
  const flush = () => { if (buf) { out.push({ type: "text", text: buf }); buf = ""; } };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && "{}`*\\|".includes(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (c === "`") {
      const j = findUnescaped(s, "`", i + 1);
      if (j > i + 1) { flush(); out.push({ type: "code", text: unescape(s.slice(i + 1, j)) }); i = j + 1; continue; }
    }
    if (!inBold && c === "*" && s[i + 1] === "*") {
      const j = findClosingBold(s, i + 2);
      if (j > i + 2) { flush(); out.push({ type: "bold", children: parse(s.slice(i + 2, j), true) }); i = j + 2; continue; }
    }
    if (c === "{") {
      const m = MARK.exec(s.slice(i));
      if (m && m[2].trim()) {
        flush();
        const [all, kind, a, b] = m;
        const name = a.trim();
        const text = b === undefined ? null : b;
        if (kind === "key") out.push({ type: "key", name, text: text ?? name });
        else if (kind === "ref") out.push({ type: "ref", id: name, text });
        else if (kind === "term") out.push({ type: "term", name, text: text ?? name });
        else out.push({ type: "tone", tone: TONES.includes(name) ? name : null, text: text ?? name });
        i += all.length;
        continue;
      }
    }
    buf += c; i++;
  }
  flush();
  return out;
}

function findUnescaped(s, ch, from) {
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === ch) return j;
  }
  return -1;
}

// closing ** that is not inside inline code
function findClosingBold(s, from) {
  for (let j = from; j < s.length - 1; j++) {
    if (s[j] === "\\") { j++; continue; }
    if (s[j] === "`") { const k = findUnescaped(s, "`", j + 1); if (k > 0) { j = k; continue; } }
    if (s[j] === "*" && s[j + 1] === "*") return j;
  }
  return -1;
}

const unescape = (t) => t.replace(/\\([`\\])/g, "$1");

/** Plain text of a node list (for aria-live, titles, search). `refTitle(id)` names entity chips. */
export function toText(nodes, refTitle = () => null) {
  if (typeof nodes === "string") nodes = parse(nodes);
  let s = "";
  for (const n of nodes) {
    if (n.type === "bold") s += toText(n.children, refTitle);
    else if (n.type === "ref") s += n.text ?? refTitle(n.id) ?? n.id;
    else s += n.text;
  }
  return s;
}

/**
 * Build DOM nodes for a node list into a DocumentFragment.
 * opts.keyIndex(name) -> identity index or null; opts.refTitle(id) -> entity title or null;
 * opts.term(name) -> the term's plain definition or null (meta.terms).
 * Key chips colour themselves from --ix-key-N, so a theme switch needs no re-render.
 */
export function toDOM(nodes, doc, opts = {}) {
  if (typeof nodes === "string") nodes = parse(nodes);
  const frag = doc.createDocumentFragment();
  appendAll(frag, nodes, doc, opts);
  return frag;
}

// A chip is an atomic inline, so a line may break between it and the punctuation after it ("reducer 1" / ":").
// Glue that punctuation to the chip with a no-wrap span.
const PUNCT = /^[.,;:!?)\]…»”’%]+/;
const isChip = (n) => n && (n.type === "key" || n.type === "ref" || n.type === "code" || n.type === "term");
function appendAll(parent, nodes, doc, opts) {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], next = nodes[i + 1];
    const m = isChip(n) && next?.type === "text" ? PUNCT.exec(next.text) : null;
    if (!m) { parent.appendChild(node(n, doc, opts)); continue; }
    const glue = doc.createElement("span");
    glue.className = "ix-nowrap";
    glue.appendChild(node(n, doc, opts));
    glue.appendChild(doc.createTextNode(m[0]));
    parent.appendChild(glue);
    const rest = next.text.slice(m[0].length);
    if (rest) parent.appendChild(doc.createTextNode(rest));
    i++;
  }
}

function node(n, doc, opts) {
  const span = (cls, text) => { const e = doc.createElement("span"); e.className = cls; if (text != null) e.textContent = text; return e; };
  switch (n.type) {
    case "text": return doc.createTextNode(n.text);
    case "code": { const e = doc.createElement("code"); e.className = "ix-code-inline"; e.textContent = n.text; return e; }
    case "bold": {
      const e = doc.createElement("strong"); e.className = "ix-bold";
      appendAll(e, n.children, doc, opts);
      return e;
    }
    case "tone": return span(n.tone ? `ix-tone ix-tone-${n.tone}` : "ix-tone", n.text);
    case "term": {
      // a glossary word: the HUD's tooltip shows data-tip-head / data-tip on hover, focus or tap. Without a
      // definition it is plain text (verify's teaching lint reports the missing entry).
      const def = opts.term?.(n.name);
      if (!def) return doc.createTextNode(n.text);
      const e = span("ix-term", n.text);
      e.dataset.term = n.name;
      e.dataset.tipHead = n.name;
      e.dataset.tip = String(def);
      e.tabIndex = 0;
      e.setAttribute?.("aria-description", `${n.name}: ${def}`);
      return e;
    }
    case "key": {
      const idx = opts.keyIndex?.(n.name);
      const e = span(idx == null ? "ix-chip ix-key ix-key-unknown" : "ix-chip ix-key", n.text);
      if (idx != null) {
        const k = ((idx % 8) + 8) % 8;
        e.dataset.key = String(k);
        e.style.setProperty("--k", `var(--ix-key-${k})`);
      }
      return e;
    }
    case "ref": {
      const e = span("ix-chip ix-ref", n.text ?? opts.refTitle?.(n.id) ?? n.id);
      e.dataset.ref = n.id;
      e.tabIndex = 0;
      e.setAttribute?.("role", "button");
      return e;
    }
    default: return doc.createTextNode("");
  }
}
