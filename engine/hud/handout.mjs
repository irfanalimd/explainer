// The handout (PLAN §4.3): a printable document generated from the lesson and the real runs of every story, never
// written by hand. Two versions from the same data:
//   Student worksheet   the question, the goal, the picture, the words; each chapter's key steps with a picture
//                       drawn from the run; every prediction, pick and end-check question with room to answer; the
//                       recap; the answers on a page of their own, so a teacher can keep it back
//   Teacher guide       the same, plus the plan (each story's play time at normal speed, measured from its run, and
//                       the lesson's talk minutes), how to run it in a room, the wrong ideas the lesson confronts, each
//                       chapter's prompt for the room (lesson chapters[id].teach), and every answer with what each
//                       wrong option means
// It opens over the page as a preview with a Print button; Ctrl+P anywhere prints it too (the page's print
// stylesheet shows only the handout). Everything comes from the data the runtime hands over (runtime handoutData()).
import { layersOf, citeOf } from "./lesson.mjs";
import { applyTheme } from "./theme.mjs";

const letter = (i) => String.fromCharCode(65 + i);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "2 min 20 s", "45 s": a play time, rounded to 5 s (it is an estimate of a viewer's pace). */
export function playTime(sec) {
  const s = Math.max(5, Math.round(sec / 5) * 5);
  const m = Math.floor(s / 60), r = s % 60;
  return m ? `${m} min${r ? ` ${r} s` : ""}` : `${r} s`;
}

/** The questions of a story in step order: predictions (s.ask) and picks (s.choose), from `from` on. */
export function questionsOf(tl, from = 0) {
  const out = [];
  tl.steps.forEach((st, i) => {
    if (i < from) return;
    if (st.ask) out.push({ kind: "predict", id: st.ask.id ?? `ask-${i}`, step: i, question: st.ask.question, options: st.ask.options.map((o) => String(o?.text ?? o)),
      answer: st.ask.answer, why: st.ask.why ?? null, feedback: (st.ask.feedback ?? []).map((f) => f ?? null) });
    if (st.choose) out.push({ kind: "pick", id: st.choose.id ?? `pick-${i}`, step: i, question: st.choose.prompt, options: st.choose.options.map((o) => String(o.text ?? o.pick)),
      answer: st.choose.answer, why: st.choose.why ?? null, feedback: st.choose.options.map((o) => (o.feedback ? { text: o.feedback, misconception: o.misconception ?? null } : null)) });
  });
  return out;
}

/**
 * ctx: { h(doc-bound), doc, md(markup, keyIndex) -> Node, icons: { print, close, check }, segmented(h, o) (level.mjs),
 *        data({ images }) -> runtime handoutData, pictures(data, onEach(i, n)) -> Promise<boolean> (draws them one per
 *        task into data.stories[].pictures), result() -> { right, total, levelName } | null (this visit's end check),
 *        address() -> { url | null, file | null }, onClose() }
 * Returns { el, open(variant), close(), get isOpen, print(), beforePrint(), afterPrint() }.
 */
export function createHandout(ctx) {
  const { h, doc } = ctx;
  const win = doc.defaultView;
  // data: the stories, compiled once (the handout uses the figure's own settings, so it never goes stale); pictured:
  // its pictures are drawn; drawing: they are being drawn now (one per task)
  let variant = "student", data = null, pictured = false, drawing = false, isOpen = false, printing = false;

  const docEl = h("article", { class: "ix-ho-doc" });
  applyTheme(docEl, "light");   // paper: the light theme's inks and keys, whatever the page shows
  const status = h("p", { class: "ix-ho-status", role: "status" });
  const seg = ctx.segmented(h, { items: [{ id: "student", label: "Student worksheet" }, { id: "teacher", label: "Teacher guide" }], value: variant, label: "Version",
    cls: "ix-ho-seg", onChange: (v) => { variant = v; render(); } });
  const printBtn = h("button", { class: "ix-cta ix-ho-print", type: "button", onclick: () => print() }, h("span", { class: "ix-cta-icon", html: ctx.icons.print }), "Print");
  const closeBtn = h("button", { class: "ix-btn ix-close", type: "button", "aria-label": "Close handout", "data-tip": "Close handout", "data-kbd": "Esc", html: ctx.icons.close, onclick: () => close() });
  const bar = h("header", { class: "ix-ho-bar" },
    h("div", { class: "ix-ho-bar-title" }, h("h2", { class: "ix-ho-bar-name", text: "Handout" }), status),
    seg.el, h("div", { class: "ix-ho-bar-end" }, printBtn, closeBtn));
  const scroll = h("div", { class: "ix-ho-scroll", tabindex: "-1" }, docEl);
  const el = h("section", { class: "ix-handout", role: "dialog", "aria-modal": "true", "aria-label": "Handout", inert: true }, bar, scroll);

  function load(images) {
    if (data && (pictured || !images)) return data;
    try { data = ctx.data({ images }); pictured = images; } catch (err) { console.error(err); data = null; }
    return data;
  }
  function render() {
    const top = scroll.scrollTop;
    docEl.replaceChildren(...(data ? build(data, variant === "teacher") : [h("p", { class: "ix-ho-p", text: "This figure's lesson could not be read." })]));
    scroll.scrollTop = top;
    if (!drawing) status.textContent = data ? (variant === "teacher" ? "The plan, the notes for the room and every answer" : "The answers come on a page of their own") : "";
  }

  // the words first (compiling every story is quick), then a picture of each chapter, drawn one at a time from the
  // runs (a moment each without a fast GPU), the document filling in as they land; Print waits for them
  function open(v) {
    if (v) { variant = v; seg.set(v); }
    isOpen = true;
    el.classList.add("ix-open");
    el.removeAttribute("inert");
    scroll.scrollTop = 0;
    load(false);
    render();
    printBtn.focus({ preventScroll: true });
    if (pictured || drawing || !data) return;
    drawing = true;
    printBtn.disabled = true;
    el.classList.add("ix-ho-busy");
    const done = (ok) => {
      drawing = false;
      pictured = ok;
      printBtn.disabled = false;
      el.classList.remove("ix-ho-busy");
      if (isOpen) render();
    };
    for (const s of data.stories) s.pictures = [];
    Promise.resolve(ctx.pictures(data, (i, n) => { status.textContent = `Drawing picture ${i + 1} of ${n} from the run…`; }))
      .then((ok) => done(!!ok), (err) => { console.error(err); done(false); });
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove("ix-open");
    el.setAttribute("inert", "");
    ctx.onClose?.();
  }
  function print() { if (data && !drawing) win.print(); }
  // Ctrl+P with the preview shut: the student worksheet, drawn now (the pictures too: the dialog waits for this)
  function beforePrint() {
    if (isOpen || drawing) return;
    printing = true;
    load(true);
    variant = "student"; seg.set("student");
    render();
    el.classList.add("ix-ho-printing");
  }
  function afterPrint() {
    if (!printing) return;
    printing = false;
    el.classList.remove("ix-ho-printing");
    docEl.replaceChildren();
  }

  // ---------- the document ----------
  function build(D, teacher) {
    const { meta, lesson, stories } = D;
    const main = stories[0];
    if (!main) return [];
    const keysOf = (tl) => { const m = new Map((tl.keys ?? []).map((k) => [String(k.name), k.index])); return (n) => m.get(String(n)) ?? null; };
    const md = (src, tl = main.tl) => ctx.md(src ?? "", keysOf(tl));
    const p = (cls, src, tl) => (src ? h("p", { class: cls }, md(src, tl)) : null);
    const label = (text) => h("div", { class: "ix-ho-label", text });
    const out = [];
    const answers = [];
    let qn = 0;
    const askedIds = new Set();
    const misById = new Map((lesson?.misconceptions ?? []).map((m) => [m.id, m]));

    // ---- head ----
    const addr = ctx.address();
    out.push(h("header", { class: "ix-ho-head" },
      h("div", { class: "ix-ho-kicker" }, h("span", { text: teacher ? "Teacher guide" : "Student worksheet" }),
        teacher ? null : h("span", { class: "ix-ho-name" }, h("span", { text: "Name" }), h("i"), h("span", { text: "Date" }), h("i"))),
      h("h1", { class: "ix-ho-title", text: meta.title ?? "" }),
      meta.subtitle ? h("p", { class: "ix-ho-sub", text: meta.subtitle }) : null,
      meta.hook ? h("p", { class: "ix-ho-hook", text: meta.hook }) : null));

    // ---- at a glance: the goal and objectives, and how to open it ----
    const total = stories.reduce((a, s) => a + s.seconds, 0);
    out.push(h("section", { class: "ix-ho-glance" },
      h("div", null, label(lesson?.objectives?.length ? "By the end you can" : "The goal"),
        lesson?.goal ? p("ix-ho-goal", lesson.goal) : null,
        lesson?.objectives?.length ? h("ul", { class: `ix-ho-objectives${teacher ? "" : " ix-ho-boxes"}` }, lesson.objectives.map((o) => h("li", null, md(o.text)))) : null),
      h("div", null, label("Open it"),
        h("p", { class: "ix-ho-p" }, addr.url ? h("span", { class: "ix-ho-url", text: addr.url }) : addr.file ? `The file ${addr.file}, in any browser, offline.` : "The page this was printed from."),
        h("p", { class: "ix-ho-small", text: `${plural(stories.length, "story", "stories")}, about ${playTime(total)} of play at normal speed. Each question below names its story and step; the timeline and the share link go straight there.` }))));

    // ---- teacher: the plan, how to run it, the wrong ideas ----
    if (teacher) {
      const rows = stories.map((s, i) => {
        const qs = questionsOf(s.tl, s.fork?.step ?? 0).filter((q) => i === 0 || !questionsOf(main.tl).some((m) => m.id === q.id));
        // the talk a story adds: its chapters from where it starts whose prompt is its own (not the first story's)
        const talk = s.tl.phases.reduce((a, ph, k) => {
          const end = s.tl.phases[k + 1]?.step ?? s.tl.steps.length;
          if (i > 0 && end <= (s.fork?.step ?? 0)) return a;
          const same = i > 0 && JSON.stringify(main.tl.phases.find((x) => x.id === ph.id)?.teach ?? null) === JSON.stringify(ph.teach ?? null);
          return a + (!same && ph.teach?.minutes ? ph.teach.minutes : 0);
        }, 0);
        return { s, i, qs: qs.length, talk };
      });
      const talkAll = rows.reduce((a, r) => a + r.talk, 0);
      out.push(h("section", { class: "ix-ho-sec ix-ho-plan" },
        h("h2", { class: "ix-ho-h2", text: "The plan" }),
        h("table", { class: "ix-ho-table" },
          h("thead", null, h("tr", null, ["Story", "Opens at", "Play", "Questions", "Talk"].map((t) => h("th", { text: t })))),
          h("tbody", null, rows.map(({ s, i, qs, talk }) => h("tr", null,
            h("td", null, h("strong", { text: s.label }), s.whatIf && i > 0 ? h("span", { class: "ix-ho-muted", text: ` · what if ${s.whatIf}` }) : null),
            h("td", { text: s.fork ? `step ${s.fork.step + 1} · ${s.tl.phases.find((ph, k) => ph.step <= s.fork.step && (s.tl.phases[k + 1]?.step ?? Infinity) > s.fork.step)?.name ?? ""}` : "the start" }),
            h("td", { class: "ix-ho-num", text: playTime(s.seconds) }),
            h("td", { class: "ix-ho-num", text: String(qs) }),
            h("td", { class: "ix-ho-num", text: talk ? `${talk} min` : "–" })))),
          h("tfoot", null, h("tr", null, h("td", { text: "In all" }), h("td"), h("td", { class: "ix-ho-num", text: playTime(total) }),
            h("td", { class: "ix-ho-num", text: String(rows.reduce((a, r) => a + r.qs, 0)) }), h("td", { class: "ix-ho-num", text: talkAll ? `${talkAll} min` : "–" })))),
        h("p", { class: "ix-ho-small", text: "Play times are measured from each story's run at normal speed, with repeated steps sped through as the page plays them; a story that starts where it leaves the first counts from there. Talk times are the lesson's suggestion for each chapter's prompt. Pauses for questions come on top." }),
        h("h3", { class: "ix-ho-h3", text: "Running it in a room" }),
        h("ul", { class: "ix-ho-list" },
          h("li", { text: "Press P for presenter mode: big type and high contrast for a projector. A clicker steps through it: → or Page Down goes on, ← or Page Up goes back." }),
          h("li", { text: "Presenter view (in the toolbar while presenting) opens the words on your laptop: what is on screen, what comes next, a warning before each question, the answer, what each wrong answer means, and the prompt for each chapter." }),
          h("li", { text: "Switch story from the presenter view or the scenarios strip. Each story starts where it leaves the first, so the shared setup is not replayed." }),
          h("li", { text: "To open a story or step straight away, use Share → Link to this moment, or add #scenario-<id>&step-<n> to the address." }))));
      if (lesson?.misconceptions?.length) {
        out.push(h("section", { class: "ix-ho-sec" },
          h("h2", { class: "ix-ho-h2", text: "Wrong ideas to listen for" }),
          h("dl", { class: "ix-ho-beliefs" }, lesson.misconceptions.flatMap((m) => [h("dt", null, md(`“${m.wrong}”`)), h("dd", null, md(m.fix))]))));
      }
    }

    // ---- the picture and the words ----
    const pic = lesson?.picture;
    const terms = Object.entries(lesson?.terms ?? {}).filter(([, t]) => t?.def);
    if (pic?.rows?.length || terms.length) {
      out.push(h("section", { class: "ix-ho-sec ix-ho-two" },
        pic?.rows?.length ? h("div", null, h("h2", { class: "ix-ho-h2", text: `The picture: ${pic.name}` }),
          h("table", { class: "ix-ho-table ix-ho-map" }, h("tbody", null, pic.rows.map((r) => h("tr", null, h("td", null, md(r.picture)), h("td", { class: "ix-ho-arrow", text: "→" }), h("td", null, md(r.real)))))),
          pic.breaks ? p("ix-ho-small", `Where the picture breaks: ${pic.breaks}`) : null) : null,
        terms.length ? h("div", null, h("h2", { class: "ix-ho-h2", text: "Words" }),
          h("dl", { class: "ix-ho-terms" }, terms.flatMap(([name, t]) => [h("dt", null, name, t.lead ? h("span", { class: "ix-ho-muted", text: ` · ${t.lead}` }) : null), h("dd", { text: t.def })]))) : null));
    }

    // ---- a question: with room to answer, or (teacher) with its answer and what each wrong option means ----
    function question(q, story) {
      if (askedIds.has(q.id)) return null;
      askedIds.add(q.id);
      const n = ++qn;
      const where = `${story.label} · ${q.kind === "check" ? "after the run" : `${q.kind === "pick" ? "at" : "before"} step ${q.step + 1}`}`;
      answers.push({ n, q, where, story });
      const kind = q.kind === "pick" ? "Your turn" : q.kind === "check" ? "Check yourself" : "Predict";
      return h("div", { class: "ix-ho-q" },
        h("div", { class: "ix-ho-q-head" }, h("span", { class: "ix-ho-q-n", text: `Q${n}` }), h("span", { class: "ix-ho-q-kind", text: kind }), h("span", { class: "ix-ho-muted", text: where })),
        p("ix-ho-q-text", q.question, story.tl),
        q.kind === "pick" ? h("p", { class: "ix-ho-small", text: "On the page you click your answer in the world; here, tick it." }) : null,
        h("ol", { class: "ix-ho-opts" }, q.options.map((o, i) => h("li", { class: teacher && i === q.answer ? "ix-ho-right" : "" },
          h("span", { class: "ix-ho-box", "aria-hidden": "true", html: teacher && i === q.answer ? ctx.icons.check : "" }),
          h("span", { class: "ix-ho-opt-k", text: letter(i) }),
          h("span", { class: "ix-ho-opt-t" }, md(o, story.tl),
            teacher && i !== q.answer && q.feedback?.[i]?.text ? h("span", { class: "ix-ho-fb" }, md(q.feedback[i].text, story.tl),
              misById.get(q.feedback[i].misconception) ? h("span", { class: "ix-ho-muted" }, " Wrong idea: ", md(`“${misById.get(q.feedback[i].misconception).wrong}”`)) : null) : null)))),
        teacher ? (q.why ? h("p", { class: "ix-ho-why" }, h("span", { class: "ix-ho-label-in", text: "Why " }), md(q.why, story.tl)) : null)
          : h("div", { class: "ix-ho-lines" }, h("span", { text: "Why do you think so?" }), h("i"), h("i")));
    }

    // ---- a chapter: its about, the teacher's prompt, its key steps, its picture, its questions ----
    function chapter(story, k, { from = 0, only = null } = {}) {
      const tl = story.tl, ph = tl.phases[k];
      const end = tl.phases[k + 1]?.step ?? tl.steps.length;
      const steps = [];
      for (let i = Math.max(ph.step, from); i < end; i++) {
        const st = tl.steps[i];
        if (st.ask || st.choose) steps.push({ q: questionsOf(tl, i).find((q) => q.step === i) });
        const L = layersOf(st);
        if ((L.key || i === end - 1 && !steps.some((x) => x.i != null)) && (!only || only(st))) steps.push({ i, L });
      }
      if (!steps.length && from > ph.step) return null;
      const picture = story.pictures.find((x) => x.chapter === k);
      const teach = teacher && ph.teach?.prompt ? h("div", { class: "ix-ho-teach" },
        h("div", { class: "ix-ho-label", text: `Ask the room${ph.teach.minutes ? ` · ${ph.teach.minutes} min` : ""}` }), p("ix-ho-teach-q", ph.teach.prompt, tl),
        ph.teach.listen ? h("p", { class: "ix-ho-small" }, h("span", { class: "ix-ho-label-in", text: "Listen for " }), md(ph.teach.listen, tl)) : null) : null;
      // the picture comes first in the document: on paper it floats beside the words, so a long chapter can run
      // onto the next page; on screen the grid puts it in the right column
      const fig = picture ? figureOf(picture, tl, `${picture.step === end - 1 ? "End of" : "In"} ${ph.name} · step ${picture.step + 1}`) : waiting(story === main && from === 0);
      return h("section", { class: "ix-ho-chapter" }, fig,
        h("div", { class: "ix-ho-ch-text" },
          h("h3", { class: "ix-ho-h3" }, h("span", { class: "ix-ho-ch-n", text: `${k + 1}` }), ph.name,
            teacher && story.chapterSeconds?.[k] ? h("span", { class: "ix-ho-muted ix-ho-h3-time", text: `· ${playTime(story.chapterSeconds[k])} of play` }) : null),
          from <= ph.step ? p("ix-ho-about", ph.about, tl) : null,
          teach,
          h("ol", { class: "ix-ho-steps" }, steps.map((x) => (x.q ? h("li", { class: "ix-ho-steps-q" }, question(x.q, story))
            : h("li", null, h("span", { class: "ix-ho-step-n", text: `Step ${x.i + 1}` }), h("span", null, md(x.L.plain, tl), x.L.why ? h("span", { class: "ix-ho-step-why" }, " ", md(x.L.why, tl)) : null)))))));
    }
    // where a picture will land while it is being drawn
    const waiting = (yes) => (yes && drawing ? h("figure", { class: "ix-ho-fig ix-ho-fig-wait", "aria-hidden": "true" }, h("div", { class: "ix-ho-fig-frame" }), h("figcaption", { text: "Drawing…" })) : null);
    function figureOf(pc, tl, cap) {
      return h("figure", { class: "ix-ho-fig" },
        h("div", { class: "ix-ho-fig-frame", style: `aspect-ratio: ${pc.width} / ${pc.height}` },
          h("img", { src: pc.url, alt: `The world at step ${pc.step + 1}`, width: String(Math.round(pc.width)), height: String(Math.round(pc.height)) }),
          // a tag slides along its own width as its anchor nears an edge (-x% of itself at x% across), so it never
          // runs off the picture, which is trimmed to the world
          pc.tags.map((t) => { const x = Math.min(100, Math.max(0, (t.x / pc.width) * 100));
            return h("span", { class: "ix-ho-tag", style: `left: ${x}%; top: ${(t.y / pc.height) * 100}%; --ix-ho-tag-x: -${x}%`, text: t.text }); })),
        h("figcaption", { text: cap }));
    }

    // ---- the first story, chapter by chapter ----
    out.push(h("section", { class: "ix-ho-part" },
      h("h2", { class: "ix-ho-h2 ix-ho-part-h" }, h("span", { class: "ix-ho-muted", text: "Story 1 · " }), main.label),
      main.description ? p("ix-ho-p", main.description) : null,
      main.tl.phases.map((_, k) => chapter(main, k))));

    // ---- the other stories: what is new in each ----
    const seen = new Set(main.tl.steps.map((st) => st.caption));
    stories.slice(1).forEach((s, j) => {
      const from = s.fork?.step ?? 0;
      const pic1 = s.pictures[0];
      const parts = s.tl.phases.map((ph, k) => {
        const end = s.tl.phases[k + 1]?.step ?? s.tl.steps.length;
        if (end <= from) return null;
        const fresh = s.tl.steps.slice(Math.max(ph.step, from), end).some((st) => !seen.has(st.caption) && (layersOf(st).key || st.ask || st.choose));
        return fresh ? chapter({ ...s, pictures: [] }, k, { from, only: (st) => !seen.has(st.caption) }) : null;
      }).filter(Boolean);
      out.push(h("section", { class: "ix-ho-part ix-ho-story" },
        h("h2", { class: "ix-ho-h2 ix-ho-part-h" }, h("span", { class: "ix-ho-muted", text: `Story ${j + 2} · ` }), s.label),
        h("div", { class: "ix-ho-story-head" },
          h("div", null, s.whatIf ? h("p", { class: "ix-ho-whatif", text: `What if ${s.whatIf}?` }) : null, p("ix-ho-p", s.description, s.tl),
            h("p", { class: "ix-ho-small", text: s.fork ? `It starts where it leaves the first story: step ${from + 1} of ${s.tl.steps.length}.` : `${s.tl.steps.length} steps.` }),
            teacher && s.takeaway ? h("p", { class: "ix-ho-why" }, h("span", { class: "ix-ho-label-in", text: "Takeaway " }), md(s.takeaway, s.tl)) : null),
          pic1 ? figureOf(pic1, s.tl, `${s.tl.phases[pic1.chapter]?.name ?? ""} · step ${pic1.step + 1}`) : waiting(true)),
        parts));
    });

    // ---- the end check, then the recap ----
    // every story's own end check, each under its story (an id can come back in a later story at new numbers)
    const checks = (D.checks ?? []).map((c) => ({ kind: "check", id: `${c.story ?? ""}:${c.id}`, step: null, question: c.question, options: c.options.map(String), answer: c.answer, why: c.why ?? null, feedback: c.feedback ?? [], story: stories.find((s) => s.id === c.story) ?? main }));
    if (checks.length) out.push(h("section", { class: "ix-ho-sec ix-ho-checks" }, h("h2", { class: "ix-ho-h2", text: "Check yourself" }),
      h("p", { class: "ix-ho-small", text: "New questions, at other settings than the page's: the rules decide, not memory." }), checks.map((c) => question(c, c.story))));
    const recap = Array.isArray(main.recap) ? main.recap : main.recap ? [main.recap] : [];
    if (recap.length || main.takeaway) out.push(h("section", { class: "ix-ho-sec" }, h("h2", { class: "ix-ho-h2", text: "What you saw" }),
      recap.length ? h("ol", { class: "ix-ho-list ix-ho-recap" }, recap.map((r) => h("li", null, md(r)))) : null, p("ix-ho-takeaway", main.takeaway)));

    // ---- the sources the words cite (lesson.sources), with their addresses written out: paper cannot follow a link ----
    const sources = lesson?.sources ?? [];
    if (sources.length) out.push(h("section", { class: "ix-ho-sec ix-ho-sources" }, h("h2", { class: "ix-ho-h2", text: "Sources" }),
      h("p", { class: "ix-ho-small", text: "The run is a simplified model; these are where its examples and its facts about real systems come from." }),
      h("ol", { class: "ix-ho-list ix-ho-refs" }, sources.map((s) => h("li", null,
        h("strong", { text: `${s.short}. ` }), s.full,
        s.url ? h("span", { class: "ix-ho-url" }, " ", h("a", { href: s.url, target: "_blank", rel: "noopener", text: s.url })) : null,
        teacher && s.supports?.length ? h("span", { class: "ix-ho-muted ix-ho-supports", text: ` Used for: ${s.supports.join("; ")}.` }) : null)))));

    // ---- the answers, on a page of their own ----
    const res = ctx.result();
    out.push(h("section", { class: "ix-ho-answers" },
      h("h2", { class: "ix-ho-h2", text: "Answers" }),
      h("p", { class: "ix-ho-small", text: teacher ? "The same answers as above, for a quick check of a stack of worksheets." : "On a page of its own, so it can be kept back." }),
      h("ol", { class: "ix-ho-key" }, answers.map(({ n, q, where, story }) => h("li", null,
        h("span", { class: "ix-ho-q-n", text: `Q${n}` }),
        h("span", null, h("strong", null, `${letter(q.answer)} `, md(q.options[q.answer], story.tl)), h("span", { class: "ix-ho-muted", text: ` · ${where}` }),
          q.why ? h("span", { class: "ix-ho-key-why" }, md(q.why, story.tl)) : null)))),
      !teacher ? h("div", { class: "ix-ho-takeaways" }, stories.slice(1).filter((s) => s.takeaway).map((s) => h("p", { class: "ix-ho-small" }, h("strong", { text: `${s.label}: ` }), md(s.takeaway, s.tl)))) : null,
      res ? h("p", { class: "ix-ho-result" }, `Check on the page, this visit: ${res.right} of ${res.total} right on the first try, at the “${res.levelName}” level, ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}. `,
        h("span", { class: "ix-ho-muted", text: "Self-reported: the page keeps no record and sends nothing." })) : null,
      h("p", { class: "ix-ho-foot", text: `Made by the page from its own run: every number above comes from the simulation${citeOf(meta, lesson)?.text ? `. Source: ${(citeOf(meta, lesson).short ?? citeOf(meta, lesson).text).replace(/\.$/, "")}` : ""}.` })));
    return out;
  }

  return {
    el, open, close, print, beforePrint, afterPrint,
    get isOpen() { return isOpen; },
  };
}
