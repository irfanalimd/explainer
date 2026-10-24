// The writing lint (references/writing.md): the words and habits that make an explanation read as filler, as
// salesmanship or as machine-written, found in the source of a figure's words with the line and a rewrite.
//   lintSource(src, file)              -> [{ rule, file, line, match, field, sentence, fix }]: every prose string in a
//                                         figure.mjs or lesson.mjs (comments, ids and the program listing are skipped)
//   lintRepeats(lesson, { lessonFile }) -> the same kind of hits, from the compiled lesson: a why that only restates
//                                         its step, and one sentence said in two places
//   styleFindings({ figureFile, lessonFile, lesson }) -> { warnings: [{ kind, rule, message }], hits }: both, grouped
//                                         one warning per rule, as verify and scripts/lesson.mjs report them
// Every rule is a warning for now. Heuristics are tuned for few false positives: when unsure, it stays quiet.
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { tokenize } from "./modules.mjs";
import { tokens } from "../../engine/scene/narrate.mjs";
import { keyLine } from "./where.mjs";

// ---------------------------------------------------------------- the rules

/** Words to cut or replace: [word or pattern, the rewrite]. Matched as whole words, case-insensitive. */
export const WORDS = [
  [/\bdelv(?:e|es|ed|ing)\b/, "look at, or say what the step shows"],
  [/\btapestry\b/, "say what is connected to what"],
  [/\b(?:a )?testament to\b/, "shows"],
  [/\brealms?\b/, "drop it, or name the field"],
  [/\blandscapes?\b(?! (?:phone|mode|orientation|screen))/, "drop it, or name the field"],
  [/\bjourneys?\b/, "say where it goes: \"the slip travels from map 0 to reduce 1\""],
  [/\bunlock(?:s|ed|ing)? (?:the |its |new |a )?(?:power|potential|secrets?|insights?|value|possibilit(?:y|ies)|door)\b/, "lets, or makes possible"],
  [/\bunleash(?:es|ed|ing)?\b/, "lets, or starts"],
  [/(?<!test )\bharness(?:es|ed|ing)? (?:the |its )?(?:power|potential)\b/, "use"],
  [/\bleverag(?:e|es|ed|ing)\b/, "use"],
  [/\belevat(?:e|es|ed|ing)\b/, "raise, or improve (and say by how much)"],
  [/\bempower(?:s|ed|ing)?\b/, "lets"],
  [/\bseamless(?:ly)?\b/, "drop it; if nothing pauses, say what keeps going"],
  [/\brobust(?:ly|ness)?\b/, "say what it survives: \"keeps working when one machine crashes\""],
  [/\bcutting[- ]edge\b/, "drop it, or give the year"],
  [/\bgame[- ]chang(?:er|ers|ing)\b/, "say what changed, with a number"],
  [/\brevolutioni[sz](?:e|es|ed|ing)\b/, "changed, and say how"],
  [/\bever[- ](?:evolving|changing)\b/, "drop it"],
  [/\bcrucial(?:ly)?\b/, "drop it, or say what breaks without it"],
  [/\bpivotal\b/, "drop it, or say what depends on it"],
  [/\bvital(?:ly)?\b/, "drop it, or say what breaks without it"],
  [/\bparamount\b/, "drop it, or say what breaks without it"],
  [/\bmeticulous(?:ly)?\b/, "drop it"],
  [/\bintricate(?:ly)?\b/, "say how many parts, or which part is hard"],
  [/\bnuanced?\b/, "say the distinction itself"],
  [/\bmyriad\b/, "give the number"],
  [/\bplethora\b/, "give the number"],
  [/\bshowcas(?:e|es|ed|ing)\b/, "shows"],
  [/\bfoster(?:s|ed|ing)?\b/, "helps, or causes"],
  [/\bbolster(?:s|ed|ing)?\b/, "strengthens, and say how"],
  [/\bunderscor(?:es|ed|ing)\b(?= (?:the|how|why|that|its|a)\b)/, "shows"],
  [/\bembark(?:s|ed|ing)?\b/, "starts"],
  [/\bholistic(?:ally)?\b/, "drop it, or say what is included"],
  [/\bsynerg(?:y|ies|istic)\b/, "say what each part gives the other"],
  [/\bmultifaceted\b/, "say the parts"],
  [/\bgroundbreaking\b/, "drop it, or give the year and what came before"],
  [/\btransformative\b/, "say what changed"],
  [/\bunparalleled\b/, "drop it, or compare with a number"],
  [/\bstreamlin(?:e|es|ed|ing)\b/, "simplifies, and say what is left out"],
  [/\bsupercharg(?:e|es|ed|ing)\b/, "speeds up, by how much"],
].map(([re, fix]) => ({ rule: "words", re: new RegExp(re.source, "gi"), fix }));

/** Stock phrases. */
export const PHRASES = [
  [/\bit(?:'|’)?s (?:important|worth|crucial) (?:to note|noting|remembering)\b|\bit is (?:important|worth|crucial) (?:to note|noting)\b|\bworth noting\b/, "drop it and say the thing"],
  [/\bin essence\b/, "drop it"],
  [/\bat (?:its|their|the) (?:core|heart)\b/, "drop it, or say which part"],
  [/\bin today(?:'|’)s (?:world|age|landscape)\b/, "drop it, or give the year"],
  [/\bplays? (?:a |an )?(?:key|crucial|vital|pivotal|central|major|significant|important|critical) role\b/, "say what it does"],
  [/\ba (?:wide|broad) (?:range|variety|array) of\b/, "name them, or give the number"],
  [/\bnavigat(?:e|es|ing) the (?:complexit(?:y|ies)|intricacies|challenges)\b/, "say what is hard"],
  [/\blet(?:'|’)?s dive in\b|\b(?:dive|dives|diving) (?:deep )?into\b|\ba deep dive\b/, "look at, or start with the step"],
  [/\bhere(?:'|’)?s the thing\b/, "drop it"],
  [/\b(?:the|where the) magic happens\b/, "say what happens"],
  [/\bcomes? into play\b/, "matters, and say when"],
  [/\bthat(?:'|’)?s where\b[^.?!]{1,40}\bcomes? in\b/, "say what it does"],
  [/\bthe beauty of\b/, "say what it buys"],
  [/\bat the end of the day\b/, "drop it"],
  [/\bboils? down to\b/, "is"],
  [/\bin the world of\b/, "in"],
  [/\bwhen it comes to\b/, "for"],
  [/\bneedless to say\b|\bit goes without saying\b/, "drop it"],
  [/\b(?:simply|to put it simply|put simply),/, "drop it"],
].map(([re, fix]) => ({ rule: "phrases", re: new RegExp(re.source, "gi"), fix }));

/** "Under the hood" is fine once in a figure; past that it is a tic. Counted across figure.mjs and lesson.mjs. */
const HOOD = /\bunder the hood\b/gi;

/** "Not just X, but Y": a rhetorical frame that adds nothing a plain sentence does not say. */
const CONTRAST = /\bnot (?:just|only|merely)\b[^.?!]{1,80}?,?\s*\bbut(?: also)?\b/gi;

/** Transitions that open a sentence and add no meaning. */
const OPENERS = /^(?:Moreover|Furthermore|Additionally|Notably|Importantly|Ultimately|Interestingly|Crucially|Indeed|In conclusion|In summary|To summari[sz]e|Overall)\b,?/;

/** Softeners and intensifiers that make a sentence weaker. ("simply", "clearly", "obviously" are the tone check's.) */
// "very" only as an intensifier: "the very same", "the very next" name one thing exactly and stay
const HEDGES = /\b(?:essentially|basically|actually|really|literally|quite)\b|(?<!\bthe )\bvery\b|\bjust (?:need|needs|have to|has to|works|a matter of)\b/gi;

/** Words that credit the algorithm with a personality. */
const FLUFF = /\b(?:cleverly|elegantly|gracefully|beautifully|magically|magical|effortlessly|brilliantly|ingeniously|smartly|neatly)\b/gi;

/** Three praise words in a row ("fast, reliable and scalable"): padding where one specific claim would do. */
const PRAISE = "(?:fast|faster|quick|quickly|efficient|efficiently|scalable|reliable|reliably|robust|flexible|powerful|simple|simpler|elegant|seamless|secure|resilient|performant|intuitive|easy|easier|clean|cleaner|consistent|durable|safe|safer|smooth|smoothly|lightweight|cheap|cheaper)";
const TRICOLON = new RegExp(`\\b${PRAISE},\\s+${PRAISE},?\\s+(?:and|or)\\s+${PRAISE}\\b`, "gi");

/** A vague amount in a claim about the real world, with no number and no source in the sentence. */
// ("however many", "how many", "many-core" count nothing; "most servers" in a quorum is exact, so it is not listed)
const VAGUE = /(?<!\b(?:however|how|too|as|so) )\bmany\b(?!-)|\b(?:numerous|significant(?:ly)?|a lot(?: of)?|lots of|often|typically|commonly|widely|countless|the vast majority|in practice|in the real world|most (?:systems|databases|programs|languages|computers|apps|applications|people|developers|engineers|companies|CPUs|processors|operating systems|implementations|libraries))\b/gi;
const SOURCED = /\d|\b(?:two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|hundreds?|thousands?|millions?|billions?|once|twice|half|a third|a quarter)\b|§|\bRFC\b|\bet al\b|\bpaper\b|\bspec(?:ification)?\b|https?:|\b(?:Linux|Windows|macOS|x86|ARM|Intel|AMD|Chrome|Firefox|V8|Node|Postgre(?:SQL|s)|MySQL|InnoDB|SQLite|Cassandra|Dynamo(?:DB)?|Hadoop|Spark|etcd|Kubernetes|Redis|Kafka|ZooKeeper|Akamai|Google|Amazon)\b/;

const EM_DASH = /—/g;
const EXCLAIM = /[\p{L}\p{N})"'”’]!(?=\s|$|["”’')])/gu;
const EMOJI = /\p{Extended_Pictographic}/gu;

// what a field holds, by its key in lesson.mjs or its call in figure.mjs (s.step's first argument is a caption)
const EXPLAINING = new Set(["plain", "why", "about", "cost", "how", "edge", "real", "source", "sofar", "now", "done", "takeaway", "recap", "def", "lead", "feedback", "text", "description", "step#0", "phase#1"]);
// a claim about real systems: a step's deeper layers (the picture map has a "real" side too, which is not one)
const REAL_WORLD = new Set(["real", "edge", "cost", "how", "source"]);

// ---------------------------------------------------------------- source scanning

const lineAt = (src, pos) => { let l = 1; for (let i = 0; i < pos && i < src.length; i++) if (src.charCodeAt(i) === 10) l++; return l; };

/**
 * The prose string literals of a figure or lesson file: { value, start, field } for each string or template
 * segment that reads as words (two words or more), with the key it is the value of (`why`, `plain`, `recap`…) or
 * the call it is an argument of (`step#0`: s.step's caption). Object keys, import specifiers and a figure's program
 * listing (`export const code`) are skipped.
 */
export function proseStrings(src) {
  const t = tokenize(src), out = [];
  const stack = [];      // { open, key, callee, arg }
  let skipCodeUntil = -1;
  for (let k = 0; k < t.length; k++) {
    const x = t[k];
    if (x.start < skipCodeUntil) continue;
    // export const code = { … }: the program the page shows, not the lesson's words
    if (x.type === "name" && x.value === "code" && t[k - 1]?.value === "const" && t[k + 1]?.value === "=") {
      let depth = 0, j = k + 2;
      for (; j < t.length; j++) {
        const v = t[j].value;
        if (t[j].type === "punct" && (v === "{" || v === "[" || v === "(")) depth++;
        else if (t[j].type === "punct" && (v === "}" || v === "]" || v === ")")) { depth--; if (depth <= 0) break; }
        else if (depth === 0 && t[j].type === "punct" && v === ";") break;
      }
      skipCodeUntil = t[j]?.end ?? src.length;
      continue;
    }
    if (x.type === "punct") {
      if (x.value === "{" || x.value === "[" || x.value === "(") {
        const key = t[k - 1]?.value === ":" ? t[k - 2]?.value : null;
        const callee = x.value === "(" && t[k - 1]?.type === "name" ? t[k - 1].value : null;
        // a list without a key of its own belongs to what holds it: s.ask(q, [options]) gives its items "ask#1"
        const top = stack[stack.length - 1];
        const held = top ? (top.callee ? `${top.callee}#${top.arg}` : top.key) : null;
        stack.push({ open: x.value, key: key ?? (x.value === "{" ? null : held ?? null), callee, arg: 0 });
      } else if (x.value === "}" || x.value === "]" || x.value === ")") stack.pop();
      else if (x.value === "," && stack.length) stack[stack.length - 1].arg++;
      continue;
    }
    if (x.type !== "string" && x.type !== "template") continue;
    if (t[k + 1]?.type === "punct" && t[k + 1].value === ":" && x.type === "string") continue;   // an object key
    if (t[k - 1]?.type === "name" && (t[k - 1].value === "from" || t[k - 1].value === "import")) continue;
    const value = x.type === "string" ? x.value : x.value ?? src.slice(x.start + 1, x.end).replace(/(?:\$\{|`)$/, "");
    if (!value || !/\p{L}\S*\s+\S*\p{L}/u.test(value)) continue;
    const own = t[k - 1]?.value === ":" ? t[k - 2]?.value : null;
    const top = stack[stack.length - 1];
    const field = own ?? (top?.callee ? `${top.callee}#${top.arg}` : top?.key ?? null);
    out.push({ value, start: x.start, field, parent: own ? top?.key ?? null : null });
  }
  return out;
}

// the reader's own words of one markup string: term text kept; chips (data names), inline code and template slots
// replaced, so a key called "vital" or a function called crucial() is not read as a word
function readerText(markup) {
  const walk = (list) => list.map((t) => (t.type === "bold" ? walk(t.children) : t.type === "code" ? "CODE" : t.type === "ref" ? "REF" : t.type === "key" ? "KEY" : t.text)).join("");
  let s;
  try { s = walk(tokens(markup)); } catch { s = String(markup); }
  return s.replace(/\{[^{}]*\}/g, "X");
}

// sentences, as the teaching lint splits them
const sentencesOf = (text) => String(text).split(/(?<=[.!?…])["”’)]?\s+(?=["“(`*]?[\p{Lu}\p{N}])/u).map((s) => s.trim()).filter(Boolean);
const clip = (s, n = 90) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** Every writing hit in one file's prose. */
export function lintSource(src, file = "figure.mjs") {
  const hits = [];
  const name = basename(file);
  let hood = 0;
  for (const s of proseStrings(src)) {
    const text = readerText(s.value);
    const line0 = lineAt(src, s.start);
    const at = (index) => line0 + (s.value.slice(0, Math.max(0, index)).match(/\n/g)?.length ?? 0);
    const own = sentencesOf(text), found = [];
    const hit = (rule, m, fix, sentence) => found.push({ rule, file: name, line: at(s.value.indexOf(m) >= 0 ? s.value.indexOf(m) : 0), match: m, field: s.field, pos: text.indexOf(m),
      sentence: clip(sentence ?? own.find((x) => (/\w/.test(m) ? new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(x) : x.includes(m))) ?? text), fix });
    for (const r of [...WORDS, ...PHRASES]) { r.re.lastIndex = 0; let m; while ((m = r.re.exec(text))) hit(r.rule, m[0], r.fix); }
    HOOD.lastIndex = 0;
    for (const m of text.matchAll(HOOD)) if (++hood > 1) hit("phrases", m[0], "once per figure at most: say which part works how");
    for (const m of text.matchAll(CONTRAST)) hit("contrast", m[0], "say the second part as its own plain claim");
    for (const m of text.matchAll(HEDGES)) hit("hedges", m[0], m[0].toLowerCase() === "actually" ? "drop it; for a surprise, say what the reader expected instead" : "drop it");
    for (const m of text.matchAll(FLUFF)) hit("fluff", m[0], "drop it; say what it does");
    for (const m of text.matchAll(TRICOLON)) hit("tricolon", m[0], "keep the one claim the run shows, with its number");
    for (const m of text.matchAll(EXCLAIM)) hit("punctuation", "!", "a full stop");
    for (const m of text.matchAll(EMOJI)) hit("punctuation", m[0], "words");
    for (const sentence of sentencesOf(text)) {
      const o = OPENERS.exec(sentence);
      if (o) hit("openers", o[0].replace(/,$/, ""), "drop it; start with the subject", sentence);
      const dashes = sentence.match(EM_DASH)?.length ?? 0;
      if (dashes) hit("punctuation", "—", dashes > 1 ? "split the sentence: the house style uses no em dashes" : "a comma, a full stop or parentheses (the house style uses no em dashes)", sentence);
      if (/\?\s*["”’)]?$/.test(sentence) && EXPLAINING.has(s.field)) hit("questions", "?", "say the answer as a statement; questions belong in a prediction, the hook or the teacher's prompt", sentence);
      if (REAL_WORLD.has(s.field) && s.parent === "deeper" && !SOURCED.test(sentence)) for (const m of sentence.matchAll(VAGUE)) hit("vague", m[0], "give the number, or name the system and its source", sentence);
    }
    // in reading order within the string
    hits.push(...found.sort((a, b) => a.pos - b.pos).map(({ pos, ...h }) => h));
  }
  return hits;
}

// ---------------------------------------------------------------- repeats, from the compiled lesson

const STOP = new Set("a an the and or but so of to in on at by for with from into onto as is are was were be been being it its it's this that these those there here than then which who whom what when where why how not no yes do does did done has have had can could will would should may might must one each every all any some both its their his her our your my we you they he she them us i if else also only just more most less least very same other another such up down out over under again".split(" "));
const stem = (w) => w.replace(/(?:ing|ed|es|s)$/, "");
const contentWords = (text) => new Set(String(text).toLowerCase().replace(/[`*{}]/g, " ").split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w)).map(stem));

/**
 * Hits the source scan cannot see, because they need the run's own words: a step's why that only restates its plain
 * line, and a sentence of 7 words or more said word for word in two places (two steps' deeper layers, a recap and a
 * caption…). Citations (deeper.source, deeper.code) and entry cards may repeat.
 */
export function lintRepeats(L, { lessonFile } = {}) {
  const hits = [];
  const where = (id) => { const l = lessonFile && id ? keyLine(lessonFile, id) : null; return l ? { file: "lesson.mjs", line: l } : { file: "lesson", line: null }; };
  const said = new Map();   // normalized sentence -> [{ place, id }]
  const note = (text, place, id) => {
    for (const s of sentencesOf(text)) {
      if (s.split(/\s+/).length < 7) continue;
      const k = s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, "").replace(/\s+/g, " ").trim();
      const list = said.get(k) ?? [];
      if (!list.some((x) => x.place === place)) list.push({ place, id, s });
      said.set(k, list);
    }
  };
  const restated = new Set();
  for (const st of L.stories ?? []) for (const ch of st.chapters ?? []) {
    if (ch.aboutText) note(ch.aboutText, `chapter ${ch.id ?? ch.name} about`, ch.id);
    for (const s of ch.steps ?? []) {
      const ly = s.layers;
      if (!ly) continue;
      const key = s.id ?? `step ${s.index}`;
      note(ly.plain, `${key} plain`, s.id);
      if (ly.why) {
        note(ly.why, `${key} why`, s.id);
        const p = contentWords(ly.plain), w = contentWords(ly.why);
        const fresh = [...w].filter((x) => !p.has(x));
        if (w.size >= 3 && fresh.length <= 1 && !restated.has(key)) {
          restated.add(key);
          hits.push({ rule: "repeats", ...where(s.id), match: "why", field: "why", sentence: clip(ly.why), fix: `the why restates the step ("${clip(ly.plain, 60)}"): say the reason, or drop the why` });
        }
      }
      // a source or a code line is cited again at every step it backs; entry cards repeat what came before on purpose
      for (const [k, v] of Object.entries(ly.deeper ?? {})) if (k !== "source" && k !== "code") note(v, `${key} deeper.${k}`, s.id);
    }
  }
  for (const st of L.stories ?? []) {
    for (const r of st.recap ?? []) note(r, `${st.id ?? "story"} recap`, null);
    if (st.takeaway) note(st.takeaway, `${st.id ?? "story"} takeaway`, null);
  }
  for (const r of L.recap ?? []) note(r, "meta.recap", null);
  for (const list of said.values()) {
    if (list.length < 2) continue;
    hits.push({ rule: "repeats", ...where(list[1].id ?? list[0].id), match: "same sentence", field: null, sentence: clip(list[0].s), fix: `said in ${list.length} places (${list.slice(0, 3).map((x) => x.place).join("; ")}): say it once, where it first matters` });
  }
  return hits;
}

/**
 * A sentence that opens on a chip whose text starts in lowercase ("the goes to reduce 0", "map 0 is free…"): the
 * reader takes the chip's word for an article or a fragment. Read from the compiled lesson, since chips are built in
 * code. Only chips that print their own text count (a key, or a ref with text): a bare {ref:id} prints its entity's
 * title, which this cannot see; nor do ids such as p1, db05 or user:9, which read as names. One hit per step or chapter.
 */
export function lintChipStarts(L, { lessonFile } = {}) {
  const hits = [], seen = new Set();
  const where = (id) => { const l = lessonFile && id ? keyLine(lessonFile, id) : null; return l ? { file: "lesson.mjs", line: l } : { file: "lesson", line: null }; };
  const check = (markup, place, id, field) => {
    if (!markup || seen.has(place)) return;
    let list;
    try { list = tokens(String(markup)); } catch { return; }
    let start = true;
    for (const t of list) {
      if (t.type === "text") { if (t.text.trim()) start = /[.!?…]["”’)]?\s+$/.test(t.text); continue; }
      const text = t.type === "key" ? t.text : t.type === "ref" ? t.text : null;
      // a word the reader can mistake for prose ("the", "map 0", "then 1"); ids like p1, db05 or user:9 read as names
      if (start && text && /^\p{Ll}[\p{Ll}'-]*(?:\s|$)/u.test(text)) {
        seen.add(place);
        hits.push({ rule: "chipstart", ...where(id), match: text, field, sentence: clip(narrateText(list)), fix: "start the sentence with a word of your own (\"The word the goes…\"), or move the chip inside it" });
        return;
      }
      start = false;
    }
  };
  for (const st of L.stories ?? []) for (const ch of st.chapters ?? []) {
    check(ch.raw?.about ?? ch.about, `chapter ${ch.id ?? ch.name}`, ch.id, "about");
    for (const s of ch.steps ?? []) {
      const key = s.id ?? `step ${s.index}`;
      check(s.raw?.layers?.plain ?? s.caption, `${key} plain`, s.id, "plain");
      check(s.raw?.layers?.why, `${key} why`, s.id, "why");
    }
  }
  return hits;
}
const narrateText = (list) => list.map((t) => (t.type === "bold" ? narrateText(t.children) : t.type === "ref" ? (t.text ?? t.id) : t.text)).join("");

// ---------------------------------------------------------------- report

const RULE_NAMES = {
  words: "words to cut or replace", phrases: "stock phrases", contrast: "\"not just X, but Y\" frames", openers: "empty sentence openers",
  hedges: "softeners", fluff: "words that credit the algorithm with a personality", tricolon: "three praise words in a row",
  punctuation: "punctuation the house style avoids", questions: "rhetorical questions in an explanation", vague: "vague amounts in a real-world claim",
  repeats: "repeated words", chipstart: "sentences that open on a lowercase chip",
};

/** One line per hit: `lesson.mjs:144  words  "crucial" → drop it, or say what breaks without it  (why: "…")`. */
export const formatHit = (h) => `${h.file}${h.line ? `:${h.line}` : ""}  ${h.rule}  "${h.match}" → ${h.fix}${h.sentence ? `  (${h.field ? `${h.field}: ` : ""}${JSON.stringify(h.sentence)})` : ""}`;

/** Both scans of a figure, as warnings grouped by rule (verify, scripts/lesson.mjs) and the full list of hits. */
export function styleFindings({ figureFile, lessonFile, lesson } = {}) {
  const hits = [];
  for (const f of [figureFile, lessonFile]) if (f && existsSync(f)) hits.push(...lintSource(readFileSync(f, "utf8"), f));
  if (lesson) hits.push(...lintRepeats(lesson, { lessonFile }), ...lintChipStarts(lesson, { lessonFile }));
  const by = new Map();
  for (const h of hits) by.set(h.rule, [...(by.get(h.rule) ?? []), h]);
  const warnings = [...by].map(([rule, list]) => ({
    kind: "teaching", rule: `writing`,
    message: `${list.length} ${RULE_NAMES[rule] ?? rule} (references/writing.md): ${list.slice(0, 4).map((h) => `${h.file}${h.line ? `:${h.line}` : ""} "${h.match}" → ${h.fix}`).join("; ")}${list.length > 4 ? `; and ${list.length - 4} more (node scripts/lesson.mjs <figure> --style lists them all)` : ""}`,
  }));
  return { warnings, hits };
}
