// The teaching lint: checks the lesson a figure teaches (scripts/lib/lesson.mjs) against references/teaching.md.
// Advisory warnings for what reads badly to a beginner; errors only for clear defects (a {term:…} with no
// definition, a predict answer that is not one of its options, a malformed meta.level, recap or terms).
//   lintLesson(lesson, fig) -> { errors: [{ rule, message }], warnings: [...], info: { grade, words, ... } }
//   lintVariants(lesson, variants, fig, findings) -> { errors, warnings }: the words a run shows only at other knob
//     values (verify's extremes), checked for the same defects and not reported twice
//   wordsShown(tl) -> { steps, phases }: what lintVariants needs from a compiled timeline
// Heuristics are tuned for few false positives: when unsure, it stays quiet.
import { tokens } from "../../engine/scene/narrate.mjs";
import { flat, LEVELS } from "./lesson.mjs";
import { captionTemplate } from "../../engine/playback.mjs";

/** Size of a lesson by meta.level (references/teaching.md, "Sizing by concept"). Undeclared counts as core. */
export const LIMITS = {
  intro: { chapters: 5, knobs: 2, primary: 2, stories: 3, caption: 18, asks: 3 },
  core: { chapters: 6, knobs: 5, primary: 3, stories: 4, caption: 18, asks: 3 },
  deep: { chapters: 8, knobs: 8, primary: 3, stories: 6, caption: 22, asks: 4 },
};
/** Reading grade (Flesch-Kincaid) above which the lint suggests plainer words, by level. */
export const GRADE = { intro: 8, core: 10, deep: 12 };
const ABOUT_WORDS = 40, HOOK_WORDS = 25, TAKEAWAY_WORDS = 30, RECAP_WORDS = 16, DEF_WORDS = 20, SENTENCE_WORDS = 25, LABEL_WORDS = 5;

/**
 * Words a beginner (who knows basic programming, not the concept) will not know, with the plain words to use
 * first. Used without a definition, they are flagged: in a hook or story label always, in an about or caption
 * unless the run defines them (a {term:…} with meta.terms, or an inline gloss: "the pivot, the value everyone is
 * compared with"). Matching is on whole words, case-insensitive, outside chips and inline code.
 */
export const JARGON = [
  ["pointer", "an arrow to where the next item lives"],
  ["node", "a box in the structure (or: a machine in the cluster)"],
  ["hash", "a scrambling function that turns a key into a number", /\bhash(?:es|ed|ing)?\b/],
  ["partition", "a share of the data / to split around a value", /\bpartition(?:s|ed|ing)?\b/],
  // the noun (MapReduce's phase), not the everyday verb ("the input is shuffled")
  ["shuffle", "the step where every record travels to the machine that owns its key", /\b(?:the|a) shuffle\b|\bshuffle (?:phase|step|stage)\b/],
  ["mapper", "a machine that reads one piece of the input", /\bmappers?\b/],
  ["reducer", "a machine that adds up one share of the keys", /\breducers?\b/],
  ["combiner", "a mini adder that runs on the mapper first", /\bcombiners?\b/],
  ["straggler", "a machine that is much slower than the rest", /\bstragglers?\b/],
  ["skew", "uneven: one share is much bigger than the others", /\bskew(?:ed)?\b/],
  ["hot key", "one key that shows up far more than the rest", /\bhot ?(?:key|spot)s?\b/],
  ["quorum", "a majority of the machines", /\bquorums?\b/],
  ["consensus", "agreeing on one answer"],
  ["replica", "a copy kept on another machine", /\breplica(?:s|tion|ted|te)?\b/],
  ["shard", "one slice of the data, kept on one machine", /\bshard(?:s|ed|ing)?\b/],
  ["commit", "made permanent", /\bcommit(?:s|ted|ting)?\b/],
  ["RPC", "a message that asks another machine to do something", /\bRPCs?\b/],
  ["heartbeat", "a regular \"I'm alive\" message", /\bheartbeats?\b/],
  ["latency", "delay"],
  ["throughput", "work done per second"],
  ["idempotent", "safe to do twice"],
  ["invariant", "a rule that is always true", /\binvariants?\b/],
  ["deterministic", "same input, same result", /\b(?:non-?)?deterministic\b/],
  ["amortized", "on average over many operations", /\bamorti[sz]ed\b/],
  ["asymptotic", "as the input grows very large", /\basymptotic(?:ally)?\b/],
  ["logarithmic", "grows by one each time the input doubles", /\blogarithmic(?:ally)?\b/],
  ["big-O", "how the work grows with the input", /\b[Oo]\((?:n|log|1|n\^?2|n log n)[^)]*\)/],
  ["recursion", "the same steps again on a smaller piece", /\brecursi(?:on|ve|vely)\b|\brecurs(?:e|es|ed|ing)\b/],
  ["pivot", "the value everything else is compared with", /\bpivots?\b/],
  ["in place", "without a second copy of the data", /\bin[- ]place\b/],
  ["permutation", "the same values in another order", /\bpermutations?\b/],
  ["TLB", "a tiny cache of recent address translations", /\bTLBs?\b/],
  ["MMU", "the chip part that translates addresses", /\bMMUs?\b/],
  ["page table", "the map from program addresses to memory", /\bpage[- ]tables?\b/],
  ["page fault", "the page is not in memory yet", /\bpage[- ]faults?\b/],
  ["virtual address", "the address the program uses", /\bvirtual address(?:es)?\b/],
  ["physical address", "the real place in memory", /\bphysical address(?:es)?\b/],
  ["cache line", "the chunk of memory a cache moves at once", /\bcache[- ]lines?\b/],
  ["evict", "throw out to make room", /\bevict(?:s|ed|ing|ion)?\b/],
  ["LRU", "throw out whatever was used longest ago", /\bLRU\b/],
  ["microtask", "a small job that runs as soon as the current code finishes", /\bmicro-?tasks?\b/],
  ["macrotask", "a job that waits its turn in the task queue", /\bmacro-?tasks?\b/],
  ["call stack", "the pile of functions that are running", /\bcall[- ]stacks?\b/],
  ["fan-out", "how many children one box can have", /\bfan-?outs?\b/],
  ["separator", "a key that says which way to go", /\bseparators?\b/],
  ["virtual node", "one of several spots a server takes on the ring", /\bvirtual nodes?\b|\bvnodes?\b/],
  ["modulo", "the remainder after dividing", /\bmod(?:ulo)?\b/],
  ["serialize", "turn into bytes to send", /\b(?:de)?seriali[sz](?:e|es|ed|ation)\b/],
  ["mutex", "a lock only one thread can hold", /\bmutex(?:es)?\b/],
  ["race condition", "two threads touching the same thing at once", /\brace conditions?\b/],
  ["deadlock", "everyone waiting on everyone, forever", /\bdeadlock(?:s|ed)?\b/],
  ["semaphore", "a counter of how many may enter", /\bsemaphores?\b/],
  ["dereference", "follow the arrow to what it points at", /\bdereferenc(?:e|es|ed|ing)\b/],
  ["heap", "the memory a program asks for while it runs", /\bheaps?\b/],
  ["metadata", "facts about the data"],
  ["payload", "the data a message carries", /\bpayloads?\b/],
  ["checksum", "a short number that changes if the data changes", /\bchecksums?\b/],
  ["linearizable", "behaves as if there were one copy", /\blineari[sz]abl(?:e|ity)\b/],
].map(([word, plain, re]) => ({ word, plain, re: new RegExp((re ?? new RegExp(`\\b${word}s?\\b`)).source, /[A-Z]{2}/.test(word) ? "g" : "gi") }));

const FILLER = /\b(?:obviously|clearly|simply|trivially|of course|it is easy to see|as we can see|note that)\b/i;
const ANALOGY = /\b(like|imagine|think of|picture|as if|as though|similar to|just as|resembles?|the way an?)\b/i;
// an inline gloss right after a word ("the pivot, the value …", "the TLB (a tiny cache …)", "the shuffle — …")
const GLOSS_AFTER = /^\s*(?:,\s*(?:a|an|the|which|that|meaning|i\.e\.|or|one)\b|\(|—|–|:|\s-\s|\s+(?:is|means|are)\s+(?:a|an|the|just|how|what|where|when)\b)/i;
const GLOSS_BEFORE = /\b(?:called|named|known as|a\.k\.a\.|aka)\s+(?:an?\s+|the\s+)?$/i;

// ---------------------------------------------------------------- text helpers

export const words = (text) => String(text ?? "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
/** Sentences of plain text (decimals and abbreviations survive). */
export function sentences(text) {
  return String(text ?? "").split(/(?<=[.!?…])["”’)]?\s+(?=["“(`*]?[\p{Lu}\p{N}])/u).map((s) => s.trim()).filter((s) => words(s).length);
}
export function syllables(word) {
  let w = String(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}
/**
 * Flesch-Kincaid grade (rough: a guide, not a judge). Takes plain text or a list of texts; each item of a list ends
 * a sentence of its own (a caption without a full stop is still one sentence).
 */
export function grade(text) {
  const ss = (Array.isArray(text) ? text : [text]).flatMap((t) => sentences(t));
  const ws = ss.flatMap(words).filter((w) => /\p{L}/u.test(w));
  if (ws.length < 30) return null;
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  return Math.round((0.39 * (ws.length / ss.length) + 11.8 * (syl / ws.length) - 15.59) * 10) / 10;
}
// prose of markup for readability: words and term text kept, chips kept as names, inline code dropped
const prose = (markup) => {
  const walk = (list) => list.map((t) => (t.type === "bold" ? walk(t.children) : t.type === "code" ? "" : t.type === "ref" ? (t.text ?? "") : t.text)).join("");
  return walk(tokens(markup ?? "")).replace(/\s+/g, " ").trim();
};
// the reader's own words of markup: text, tone and bold, but not chips or code; terms reported separately
function wordsOf(markup) {
  const parts = [], terms = [];
  const walk = (list) => {
    for (const t of list) {
      if (t.type === "text" || t.type === "tone") parts.push(t.text);
      else if (t.type === "bold") walk(t.children);
      else if (t.type === "term") { terms.push(t.name); parts.push(` ${"⁣".repeat(Math.max(1, t.text.length))} `); }   // a placeholder, not matched as jargon
      else parts.push(" ⁣ ");
    }
  };
  walk(tokens(markup ?? ""));
  return { text: parts.join(""), terms };
}
const clip = (s, n = 70) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const q = (s) => `"${clip(String(s))}"`;
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const listOf = (xs, n = 6) => (xs.length > n ? `${xs.slice(0, n).join(", ")} and ${xs.length - n} more` : xs.join(", "));

/**
 * The reading stream: every piece of text a reader meets, in order (hook, then each story's chapters with their
 * abouts, captions and questions, then its recap and takeaway; the story labels last). Later stories start at
 * their fork, so a shared setup is read once.
 */
export function stream(L) {
  const out = [];
  const add = (where, markup, kind) => { if (markup) out.push({ where, markup: String(markup), kind }); };
  add("the hook", L.hook, "hook");
  L.stories.forEach((st, si) => {
    const tag = L.stories.length > 1 ? `story "${st.id ?? st.label}" ` : "";
    const from = st.fork?.step ?? 0;
    for (const ch of st.chapters) {
      const last = ch.steps.length ? ch.steps[ch.steps.length - 1].index : ch.step;
      if (si > 0 && last < from) continue;
      add(`${tag}chapter "${ch.name || "(unnamed)"}" about`, ch.about, "about");
      for (const s of ch.steps) {
        if (si > 0 && s.index < from) continue;
        if (s.ask) {
          add(`${tag}step ${s.index} question`, s.ask.question, "ask");
          s.ask.options.forEach((o) => add(`${tag}step ${s.index} option`, o, "ask"));
        }
        add(`${tag}step ${s.index}`, s.caption, "caption");
        if (s.ask?.why) add(`${tag}step ${s.index} why`, s.ask.why, "why");
      }
    }
    (st.recap ?? []).forEach((r) => add(`${tag}recap`, r, "recap"));
    add(`${tag}takeaway`, st.takeaway, "takeaway");
  });
  L.recap.forEach((r) => add("meta.recap", r, "recap"));
  add("meta.takeaway", L.takeaway, "takeaway");
  return out;
}

// ---------------------------------------------------------------- the lint

export function lintLesson(L, fig = {}) {
  const errors = [], warnings = [], info = {};
  const E = (rule, message) => errors.push({ kind: "teaching", rule, message });
  const W = (rule, message) => warnings.push({ kind: "teaching", rule, message });
  const meta = fig.meta ?? {};
  const level = L.level ?? "core", lim = LIMITS[level], aLevel = `${level === "intro" ? "an" : "a"} ${level}`;
  const stories = L.stories.filter((s) => !s.error);
  const first = stories[0];

  // ---- the declared shape: level, terms, recap
  if (L.levelRaw === undefined) W("level", `no meta.level: declare "intro" (a first encounter: linked list, stack, binary search), "core" or "deep" (Raft, page walks) so pacing and these checks fit the concept (checked as core)`);
  else if (!LEVELS.includes(L.levelRaw)) E("level", `meta.level must be "intro", "core" or "deep", got ${JSON.stringify(L.levelRaw)}`);
  const termsRaw = L.termsRaw;
  if (termsRaw !== undefined && (termsRaw === null || typeof termsRaw !== "object" || Array.isArray(termsRaw))) E("terms", "meta.terms must be an object { word: \"plain definition\" }");
  for (const [name, def] of Object.entries(L.terms)) {
    if (typeof def !== "string" || !def.trim()) { E("terms", `meta.terms["${name}"] must be a non-empty plain definition`); continue; }
    const n = words(def).length;
    if (n > DEF_WORDS) W("terms", `meta.terms["${name}"] is ${n} words: a definition reads best under ${DEF_WORDS} ("an arrow that says where the next box lives")`);
    const stem = name.toLowerCase().replace(/s$/, "");
    if (stem.length > 2 && new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(def)) W("terms", `meta.terms["${name}"] uses the word it defines; explain it with everyday words instead`);
    const jar = JARGON.filter((j) => j.word.toLowerCase() !== stem && !(j.word.toLowerCase() in lowerKeys(L.terms)) && (j.re.lastIndex = 0, j.re.test(def))).map((j) => j.word);
    if (jar.length) W("terms", `meta.terms["${name}"] explains with jargon (${jar.join(", ")}); a definition may only use words the reader already has`);
  }
  if (L.recapRaw !== undefined && !(typeof L.recapRaw === "string" || (Array.isArray(L.recapRaw) && L.recapRaw.every((x) => typeof x === "string")))) E("recap", "meta.recap must be a list of 2–4 short lines (strings)");
  for (const st of L.stories) if (st.recapRaw !== undefined && !(typeof st.recapRaw === "string" || (Array.isArray(st.recapRaw) && st.recapRaw.every((x) => typeof x === "string")))) E("recap", `scenario "${st.id}" recap must be a list of 2–4 short lines (strings)`);

  // ---- the opening: hook and the everyday picture
  if (!L.hook) W("hook", "no meta.hook: open with the one question the run answers, in the reader's words (\"You can add to the front of a list in one step. Why does reaching the 5th item take five?\")");
  else {
    const hookText = flat(L.hook);
    if (!/\?\s*$/.test(hookText)) W("hook", `the hook should end in the question the run answers: ${q(hookText)}`);
    if (words(hookText).length > HOOK_WORDS) W("hook", `the hook is ${words(hookText).length} words; keep it under ${HOOK_WORDS}`);
    if (/[{}`*]/.test(L.hook)) W("hook", "the hook is shown as plain text on the start card: drop the markup");
  }
  const openers = [L.hook, first?.chapters[0]?.about, first?.chapters[0]?.steps[0]?.caption, first?.chapters[1]?.about].filter(Boolean).map((m) => flat(m)).join(" ");
  if (first && !ANALOGY.test(openers)) W("analogy", "no everyday picture in the opening (hook, first chapter's about, first caption): give the reader an analogy and map it to the parts (\"Think of it as a treasure hunt: each box holds a clue and directions to the next box\")");

  // ---- the close: recap and takeaway
  const anyRecap = L.recap.length || L.stories.some((s) => s.recap?.length);
  if (!anyRecap) W("recap", "no meta.recap: end with 2–4 short lines on what the run showed, in order (the explain panel shows them above the takeaway)");
  for (const [where, lines] of [["meta.recap", L.recap], ...L.stories.filter((s) => s.recap).map((s) => [`scenario "${s.id}" recap`, s.recap])]) {
    if (!lines.length) continue;
    if (lines.length < 2 || lines.length > 4) W("recap", `${where} has ${plural(lines.length, "line")}; 2–4 read best`);
    const long = lines.filter((x) => words(flat(x)).length > RECAP_WORDS);
    if (long.length) W("recap", `${where}: keep each line under ${RECAP_WORDS} words (${q(flat(long[0]))})`);
  }
  if (!L.takeaway && !L.stories.every((s) => s.takeaway)) W("takeaway", "no meta.takeaway: the one sentence worth remembering, shown at the end");
  for (const t of [L.takeaway, ...L.stories.map((s) => s.takeaway)].filter(Boolean)) {
    const n = words(flat(t)).length;
    if (n > TAKEAWAY_WORDS) { W("takeaway", `a takeaway of ${n} words; one sentence under ${TAKEAWAY_WORDS} is remembered: ${q(flat(t))}`); break; }
  }

  // ---- chapters and captions
  const noAbout = new Set(), longAbout = new Map(), longCaps = new Map();
  let maxChapters = 0;
  for (const st of stories) {
    const named = st.chapters.filter((c) => c.name);
    maxChapters = Math.max(maxChapters, named.length);
    for (const ch of named) {
      if (!ch.about) noAbout.add(ch.name);
      else { const n = words(ch.aboutText).length; if (n > ABOUT_WORDS && !longAbout.has(ch.name)) longAbout.set(ch.name, n); }
      for (const s of ch.steps) { const n = words(s.text).length; if (n > lim.caption && !longCaps.has(s.text)) longCaps.set(s.text, { n, at: `${st.id ? `"${st.id}" ` : ""}step ${s.index}` }); }
    }
  }
  if (noAbout.size) W("about", `${plural(noAbout.size, "chapter")} without an about (${listOf([...noAbout].map((x) => `"${x}"`))}): say what the chapter does and why, in 1–2 plain sentences`);
  if (longAbout.size) W("about", `${plural(longAbout.size, "about")} over ${ABOUT_WORDS} words (${listOf([...longAbout].map(([k, n]) => `"${k}" ${n}`))})`);
  if (longCaps.size) {
    const worst = [...longCaps.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    W("caption", `${plural(longCaps.size, "caption")} over ${lim.caption} words (longest ${worst[1].n}, ${worst[1].at}: ${q(worst[0])}): one event and its reason; move the rest to the chapter's about`);
  }

  // ---- predict questions
  let asks = 0, noWhy = 0, maxAsks = 0;
  for (const st of stories) {
    let n = 0;
    for (const ch of st.chapters) for (const s of ch.steps) {
      if (!s.ask) continue;
      n++; asks++;
      const a = s.ask;
      if (a.options.length < 2) E("ask", `the question at step ${s.index} has ${plural(a.options.length, "option")}; give at least two`);
      else if (!(Number.isInteger(a.answer) && a.answer >= 0 && a.answer < a.options.length)) E("ask", `the question at step ${s.index} names answer ${JSON.stringify(a.answer)}, but it has options 0–${a.options.length - 1}`);
      if (!a.why) noWhy++;
    }
    maxAsks = Math.max(maxAsks, n);
  }
  if (noWhy) W("ask", `${plural(noWhy, "predict question")} without a why: s.ask(q, options, answer, { why: "…" }) says why the answer is right once it is revealed`);
  if (!asks && first && level !== "deep") W("ask", "no predict question: ask one just before the aha moment, where a beginner would guess wrong (s.ask)");
  if (maxAsks > lim.asks) W("ask", `${maxAsks} predict questions in one story; ${lim.asks} at most keeps each one special`);

  // ---- size for the level
  const knobs = L.knobs.filter((k) => !k.hidden).length;   // hidden: true keeps a param out of the drawer
  const primary = Math.max(0, ...(L.stories.length ? L.stories : [{ id: undefined }]).map((st) => L.counters.filter((c) => c.primary === true || (Array.isArray(c.primary) && c.primary.includes(st.id))).length));
  if (maxChapters > lim.chapters) W("size", `${maxChapters} chapters for ${aLevel} lesson (${lim.chapters} at most): one new idea per chapter; merge or cut`);
  if (knobs > lim.knobs) W("size", `${knobs} knobs for ${aLevel} lesson (${lim.knobs} at most): keep the ones that change the lesson`);
  if (primary > lim.primary) W("size", `${primary} numbers in the dock for ${aLevel} lesson (${lim.primary} at most)`);
  if (L.scenarioCount > lim.stories) W("size", `${L.scenarioCount} stories for ${aLevel} lesson (${lim.stories} at most)`);

  // ---- words: terms, jargon, labels
  const S = stream(L);
  const termNames = new Set(Object.keys(L.terms));
  const termLower = lowerKeys(L.terms);
  const firstMark = new Map(), firstPlain = new Map(), undefinedTerms = new Map();
  const jargonFirst = new Map();
  S.forEach((seg, i) => {
    const { text, terms } = wordsOf(seg.markup);
    for (const t of terms) {
      if (!firstMark.has(t)) firstMark.set(t, i);
      if (!termNames.has(t) && !undefinedTerms.has(t)) undefinedTerms.set(t, seg.where);
    }
    // a defined term's word in plain text, before the run has marked it
    for (const name of termNames) {
      if (firstPlain.has(name)) continue;
      const re = new RegExp(`\\b${escapeRe(name)}(?:s|es)?\\b`, "i");
      if (re.test(text)) firstPlain.set(name, { i, where: seg.where });
    }
    // flagged jargon the run never defines
    for (const j of JARGON) {
      if (jargonFirst.has(j.word)) continue;
      j.re.lastIndex = 0;
      const m = j.re.exec(text);
      if (!m) continue;
      const defined = termLower[j.word.toLowerCase()] || termLower[m[0].toLowerCase()] || termLower[m[0].toLowerCase().replace(/e?s$/, "")]
        || GLOSS_AFTER.test(text.slice(m.index + m[0].length)) || GLOSS_BEFORE.test(text.slice(0, m.index));
      jargonFirst.set(j.word, { defined: !!defined, where: seg.where, kind: seg.kind, plain: j.plain, seen: m[0] });
    }
  });
  for (const [t, where] of undefinedTerms) E("terms", `{term:${t}} (${where}) has no definition: add meta.terms["${t}"] = "plain words"`);
  for (const name of termNames) {
    if (!firstMark.has(name)) { W("terms", `meta.terms["${name}"] is never used: mark its first use with {term:${name}}`); continue; }
    const p = firstPlain.get(name);
    if (p && p.i < firstMark.get(name)) W("terms", `"${name}" is used (${p.where}) before it is defined: mark that first use {term:${name}}`);
  }
  const undef = [...jargonFirst.entries()].filter(([, v]) => !v.defined && v.kind !== "hook");
  info.jargon = undef.map(([w]) => w);
  if (undef.length) W("jargon", `${plural(undef.length, "flagged word")} used without a plain definition: ${listOf(undef.map(([w, v]) => `${w} (${v.where})`), 8)}. Say it in beginner words first, then name it: {term:…} with meta.terms, or a gloss ("the ${undef[0][0]}, ${undef[0][1].plain}")`);
  // the hook and the story picker are read before anything is explained: no jargon there at all
  // chapter names too: the scrubber shows every one of them from the first frame
  const chapterNames = [...new Set(L.stories.flatMap((s) => s.chapters.map((c) => c.name)).filter(Boolean))];
  const front = [["the hook", L.hook], ...L.stories.flatMap((s) => [[`story "${s.id ?? s.label}" label`, s.label], [`story "${s.id ?? s.label}" what-if`, s.whatIf], [`story "${s.id ?? s.label}" description`, s.description]]),
    ...chapterNames.map((n) => [`chapter name`, n])];
  const hits = [];
  for (const [where, m] of front) {
    if (!m) continue;
    const { text } = wordsOf(m);
    const found = JARGON.filter((j) => (j.re.lastIndex = 0, j.re.test(text))).map((j) => j.word);
    if (found.length) hits.push(`${where} ${q(flat(m))} (${found.join(", ")})`);
  }
  if (hits.length) W("labels", `jargon where nothing is explained yet: ${listOf(hits, 4)}. Name stories and chapters in learner words ("One word is everywhere", "A machine crashes", "Sort the slips") and ask the what-if as a learner would`);
  const longLabels = L.stories.filter((s) => s.label && words(s.label).length > LABEL_WORDS).map((s) => q(s.label));
  if (longLabels.length) W("labels", `story labels read best in ${LABEL_WORDS} words or fewer: ${listOf(longLabels)}`);

  // ---- tone: words that tell a beginner they should already know
  const filler = new Map();
  for (const seg of S) {
    const m = FILLER.exec(wordsOf(seg.markup).text);
    if (m && !filler.has(m[0].toLowerCase())) filler.set(m[0].toLowerCase(), seg.where);
  }
  info.filler = [...filler.keys()];
  if (filler.size) W("tone", `${listOf([...filler].map(([w, where]) => `"${w}" (${where})`))}: these tell a beginner it should be easy; cut them and show the reason instead`);

  // ---- readability
  const longSentences = [];
  for (const seg of S) {
    if (!["about", "hook", "takeaway", "recap", "why"].includes(seg.kind)) continue;
    for (const s of sentences(prose(seg.markup))) if (words(s).length > SENTENCE_WORDS) longSentences.push({ where: seg.where, s, n: words(s).length });
  }
  if (longSentences.length) {
    const w = longSentences.sort((a, b) => b.n - a.n)[0];
    W("sentences", `${plural(longSentences.length, "sentence")} over ${SENTENCE_WORDS} words (longest ${w.n}, ${w.where}: ${q(w.s)}): split them`);
  }
  // the grade is measured on the explaining prose (abouts, hook, why, recap, takeaway, story descriptions): captions
  // are short event lines whose numbers and chips would make any lesson look easy
  const all = S.filter((x) => x.kind !== "ask").map((x) => prose(x.markup));
  const explaining = [...S.filter((x) => ["about", "hook", "why", "recap", "takeaway"].includes(x.kind)).map((x) => prose(x.markup)), ...L.stories.map((x) => x.description).filter(Boolean)];
  info.words = all.reduce((a, t) => a + words(t).length, 0);
  info.grade = grade(explaining);
  info.level = level;
  info.chapters = maxChapters;
  info.asks = asks;
  info.terms = termNames.size;
  if (info.grade != null && info.grade > GRADE[level]) W("grade", `reading grade ≈ ${info.grade} (Flesch-Kincaid) for ${aLevel} lesson; aim at ${GRADE[level]} or below: shorter sentences, everyday words`);
  return { errors, warnings, info };
}

// ---------------------------------------------------------------- other knob values

/** The words a compiled timeline shows, in a small serializable form (verify collects one per run). */
export function wordsShown(tl) {
  return {
    steps: (tl?.steps ?? []).map((st, i) => ({ index: st.index ?? i, caption: st.caption ?? "",
      ask: st.ask ? { question: String(st.ask.question ?? ""), options: (st.ask.options ?? []).map(String), answer: st.ask.answer, why: st.ask.why ?? "" } : null })),
    phases: (tl?.phases ?? []).map((p) => ({ name: p.name ?? "", about: p.about ?? "", step: p.step ?? 0 })),
  };
}

/**
 * The words a figure shows only at other settings (verify's runs at each knob's extremes, and on a phone), checked
 * like the default lesson: long captions and abouts, undefined {term:…}, flagged jargon, filler, malformed questions,
 * jargon in chapter names. A caption, about or question the default lesson already shows is skipped, captions are
 * grouped by their shape, and a word the default findings already name is not reported again.
 * variants: [{ label, words: wordsShown(tl) }]; findings: lintLesson's result for the defaults.
 */
export function lintVariants(L, variants, fig = {}, findings = {}) {
  const errors = [], warnings = [];
  const E = (rule, message) => errors.push({ kind: "teaching", rule, message });
  const W = (rule, message) => warnings.push({ kind: "teaching", rule, message });
  const level = L.level ?? "core", lim = LIMITS[level];
  const seen = new Set();
  for (const st of L.stories) for (const ch of st.chapters) {
    seen.add(`n:${ch.name}`); if (ch.about) seen.add(`a:${ch.about}`);
    for (const x of ch.steps) { seen.add(`c:${x.caption}`); if (x.ask) seen.add(`q:${x.ask.question}`); }
  }
  const termLower = lowerKeys(L.terms), termNames = new Set(Object.keys(L.terms));
  const knownJargon = new Set(findings.info?.jargon ?? []), knownFiller = new Set(findings.info?.filler ?? []);
  const knownErrors = new Set((findings.errors ?? []).map((e) => e.message));
  const longCaps = new Map(), longAbouts = new Map(), jargon = new Map(), filler = new Map(), names = new Map(), undefTerms = new Map(), badAsks = new Map();
  const jargonOf = (markup, where) => {
    const { text, terms } = wordsOf(markup);
    for (const t of terms) if (!termNames.has(t) && !undefTerms.has(t)) undefTerms.set(t, where);
    for (const j of JARGON) {
      if (knownJargon.has(j.word) || jargon.has(j.word)) continue;
      j.re.lastIndex = 0;
      const m = j.re.exec(text);
      if (!m) continue;
      const defined = termLower[j.word.toLowerCase()] || termLower[m[0].toLowerCase()] || termLower[m[0].toLowerCase().replace(/e?s$/, "")]
        || GLOSS_AFTER.test(text.slice(m.index + m[0].length)) || GLOSS_BEFORE.test(text.slice(0, m.index));
      if (!defined) jargon.set(j.word, where);
    }
    const f = FILLER.exec(text);
    if (f && !knownFiller.has(f[0].toLowerCase()) && !filler.has(f[0].toLowerCase())) filler.set(f[0].toLowerCase(), where);
  };
  for (const v of variants ?? []) {
    const ws = v.words ?? { steps: [], phases: [] };
    for (const ph of ws.phases) {
      if (ph.name && !seen.has(`n:${ph.name}`)) {
        seen.add(`n:${ph.name}`);
        const found = JARGON.filter((j) => (j.re.lastIndex = 0, j.re.test(wordsOf(ph.name).text))).map((j) => j.word);
        if (found.length && !names.has(ph.name)) names.set(ph.name, { where: v.label, found });
      }
      if (ph.about && !seen.has(`a:${ph.about}`)) {
        seen.add(`a:${ph.about}`);
        const where = `${v.label}, chapter "${ph.name || "(unnamed)"}" about`;
        const n = words(flat(ph.about)).length;
        if (n > ABOUT_WORDS && !longAbouts.has(ph.name)) longAbouts.set(ph.name, { n, where });
        jargonOf(ph.about, where);
      }
    }
    for (const st of ws.steps) {
      const where = `${v.label}, step ${st.index}`;
      if (st.ask && !seen.has(`q:${st.ask.question}`)) {
        seen.add(`q:${st.ask.question}`);
        const a = st.ask;
        if (a.options.length < 2) badAsks.set(where, `the question at ${where} has ${plural(a.options.length, "option")}; give at least two`);
        else if (!(Number.isInteger(a.answer) && a.answer >= 0 && a.answer < a.options.length)) badAsks.set(where, `the question at ${where} names answer ${JSON.stringify(a.answer)}, but it has options 0–${a.options.length - 1}`);
        for (const m of [a.question, ...a.options, a.why]) if (m) jargonOf(m, `${where} question`);
      }
      if (seen.has(`c:${st.caption}`)) continue;
      seen.add(`c:${st.caption}`);
      const text = flat(st.caption), n = words(text).length, shape = captionTemplate(st.caption);
      if (n > lim.caption) { const prev = longCaps.get(shape); if (!prev || n > prev.n) longCaps.set(shape, { n, where, text }); }
      jargonOf(st.caption, where);
    }
  }
  for (const [t, where] of undefTerms) {
    const msg = `{term:${t}} (${where}) has no definition: add meta.terms["${t}"] = "plain words"`;
    if (!knownErrors.has(msg)) E("terms", msg);
  }
  for (const [, msg] of badAsks) E("ask", msg);
  const at = "at other settings";
  if (longCaps.size) {
    const worst = [...longCaps.values()].sort((a, b) => b.n - a.n)[0];
    W("caption", `${at}: ${plural(longCaps.size, "caption")} over ${lim.caption} words (longest ${worst.n}, ${worst.where}: ${q(worst.text)})`);
  }
  if (longAbouts.size) W("about", `${at}: ${plural(longAbouts.size, "about")} over ${ABOUT_WORDS} words (${listOf([...longAbouts].map(([k, v]) => `"${k}" ${v.n}, ${v.where}`))})`);
  if (jargon.size) W("jargon", `${at}: ${plural(jargon.size, "flagged word")} used without a plain definition: ${listOf([...jargon].map(([w, where]) => `${w} (${where})`), 8)}`);
  if (filler.size) W("tone", `${at}: ${listOf([...filler].map(([w, where]) => `"${w}" (${where})`))}: cut them and show the reason instead`);
  if (names.size) W("labels", `${at}: jargon in chapter names: ${listOf([...names].map(([n, v]) => `"${n}" (${v.found.join(", ")}; ${v.where})`), 4)}`);
  return { errors, warnings };
}

function lowerKeys(o) { const r = Object.create(null); for (const k of Object.keys(o ?? {})) r[k.toLowerCase()] = true; return r; }
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/** Findings as report lines. */
export function formatFindings(f, indent = "        ") {
  const lines = [];
  for (const x of f.errors) lines.push(`${indent}error  ${x.rule}: ${x.message}`);
  for (const x of f.warnings) lines.push(`${indent}warn   ${x.rule}: ${x.message}`);
  const i = f.info ?? {};
  lines.push(`${indent}info   level ${i.level}, ${plural(i.chapters ?? 0, "chapter")}, ${plural(i.asks ?? 0, "question")}, ${plural(i.terms ?? 0, "defined word")}, ${i.words ?? 0} words, reading grade ${i.grade ?? "n/a"}`);
  return lines.join("\n");
}
