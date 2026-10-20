// The presenter view (DESIGN.md 9.6): a second window on the teacher's laptop while the projector shows the world and
// a large caption. It carries what the room does not see: the step's words in full (plain, why, every deeper field),
// the next step's words, a warning one step before a question (so the room can be asked first), the answer to an
// open question and what each wrong answer means, the chapter's prompt for the room (lesson chapters[id].teach), a
// clock, and the controls a teacher reaches for: the transport, the chapters (each dot goes there), the story and the
// level.
//
// The projector page opens an about:blank window and writes this view into it. That window shares the page's origin
// (file:// included), so the page renders into it directly and its buttons and keys call the HUD: there is no second
// page to load and no message protocol to keep in step. Pop-ups blocked: open() returns null and the HUD says so.
import { applyTheme } from "./theme.mjs";
import { layersOf, deeperOf } from "./lesson.mjs";

const NAME = "ix-presenter";
const SIZE = "popup,width=1280,height=800";

// the page's styles (hud.css and the embedded fonts), as text for the second window
function pageCss(doc) {
  let css = "";
  for (const sheet of doc.styleSheets) {
    try { for (const r of sheet.cssRules) css += `${r.cssText}\n`; } catch { if (sheet.href) css += `@import url(${JSON.stringify(sheet.href)});\n`; }
  }
  return css;
}
const clock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * ctx: { doc (the projector page's document), title(), theme(), state(), makeH(doc), markup(src, doc), level,
 *        icons: { back, fwd, play, pause, next, replay, check, close }, key(e),
 *        actions: { back, advance, primary, answer(i), chapter(k), story(id) } }
 * state(): { steps, step, chapters: [names], chapter, held, primary, playing, progress, ask, upcoming, teach, scenario,
 *            stories: [{ id, label }] | null, story, sig }
 *   ask / upcoming: { kind, question, options, answer, why, feedback: [{ text, wrong } | null], chosen, revealed }
 * Returns { render() (false once the window is gone), focus(), close() }, or null when the window could not open.
 */
export function openPresenterView(ctx, { onClose } = {}) {
  const opener = ctx.doc.defaultView;
  let w = null;
  try { w = opener.open("", NAME, SIZE); } catch { w = null; }
  if (!w) return null;
  let d;
  try {
    d = w.document;
    d.open();
    d.write(`<!doctype html><html lang="${ctx.doc.documentElement.lang || "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title></title></head><body></body></html>`);
    d.close();
  } catch {
    try { w.close(); } catch { /* gone */ }
    return null;
  }
  d.title = `${ctx.title()} · Presenter view`;
  d.head.append(Object.assign(d.createElement("style"), { textContent: `${pageCss(ctx.doc)}\nhtml, body { height: 100%; margin: 0; }` }));
  const h = ctx.makeH(d);
  const I = ctx.icons;
  const btn = (cls, icon, word, label, onclick) => h("button", { class: `ix-pv-btn ${cls}`, type: "button", "aria-label": label, onclick },
    h("span", { class: "ix-pv-btn-icon", html: icon }), word ? h("span", { text: word }) : null);

  // ---- the frame: head, where we are, now and next, the dock ----
  const timeEl = h("span", { class: "ix-pv-clock", "aria-label": "Time presenting" });
  const endBtn = h("button", { class: "ix-pv-end", type: "button", onclick: () => close() }, "End presenter view");
  const mapEl = h("ol", { class: "ix-pv-map", "aria-label": "Chapters" });
  const whereEl = h("span", { class: "ix-pv-chapter" });
  const countEl = h("span", { class: "ix-pv-count" });
  const fill = h("i", { class: "ix-pv-fill" });
  const nowEl = h("div", { class: "ix-pv-now-body", "aria-live": "polite" });
  const nextHead = h("div", { class: "ix-pv-label" });
  const nextEl = h("div", { class: "ix-pv-next-body" });
  const backBtn = btn("ix-pv-back", I.back, "Back", "Back one step", () => ctx.actions.back());
  const mainBtn = btn("ix-pv-main-btn", I.play, "Play", "Play", () => ctx.actions.primary());
  const fwdBtn = btn("ix-pv-fwd", I.fwd, "Next", "Next step", () => ctx.actions.advance());
  // the story: a plain select, so a teacher can switch to the next what-if without walking to the projector
  const scenarioEl = h("label", { class: "ix-pv-scenario" }, h("span", { class: "ix-pv-scenario-k", text: "Scenario" }),
    h("select", { class: "ix-pv-select", onchange: (e) => ctx.actions.story(e.target.value) }));
  const levelEl = ctx.level ? ctx.level.control(h, { cls: "ix-pv-levels" }) : null;
  const root = h("div", { class: "ix ix-pv", role: "main", tabindex: "-1" },
    h("header", { class: "ix-pv-head" },
      h("div", { class: "ix-pv-title" }, h("span", { class: "ix-pv-name", text: ctx.title() }), h("span", { class: "ix-pv-kind", text: "Presenter view" })),
      h("div", { class: "ix-pv-head-end" }, timeEl, endBtn)),
    h("div", { class: "ix-pv-where" }, mapEl, whereEl, countEl, h("div", { class: "ix-pv-track", "aria-hidden": "true" }, fill)),
    h("main", { class: "ix-pv-body" },
      h("section", { class: "ix-pv-now", "aria-label": "On screen now" }, h("div", { class: "ix-pv-label", text: "On screen now" }), nowEl),
      h("section", { class: "ix-pv-next", "aria-label": "Next" }, nextEl)),
    h("footer", { class: "ix-pv-dock" },
      h("div", { class: "ix-pv-transport" }, backBtn, mainBtn, fwdBtn),
      h("div", { class: "ix-pv-dock-end" }, scenarioEl, levelEl)));
  d.body.append(root);
  applyTheme(root, ctx.theme());

  const md = (src) => ctx.markup(src ?? "", d);
  const para = (cls, src) => (src ? h("p", { class: cls }, md(src)) : null);
  function words(st, { deeper }) {
    const L = layersOf(st);
    const fields = deeper ? deeperOf(L) : [];
    return [para("ix-pv-plain", L.plain || st?.caption), para("ix-pv-why", L.why),
      fields.length ? h("dl", { class: "ix-pv-deeper" }, fields.map((f) => [h("dt", { text: f.label }), h("dd", null, md(f.text))])) : null];
  }
  const letter = (i) => String.fromCharCode(65 + i);
  // under a wrong option, what it means: the lesson's feedback for it, and the wrong idea it comes from
  const meaning = (f) => (f?.text || f?.wrong ? h("span", { class: "ix-pv-opt-fb" }, f.text ? md(f.text) : null,
    f.wrong ? h("span", { class: "ix-pv-opt-belief" }, f.text ? " " : null, "Wrong idea: ", md(`“${f.wrong}”`)) : null) : null);
  function askBlock(q) {
    // a pick happens in the world (the room clicks a machine), so its options here are for reading, not for clicking
    const inWorld = q.kind === "choose";
    return h("div", { class: "ix-pv-ask" },
      h("div", { class: "ix-pv-ask-head" }, h("span", { class: "ix-pv-label", text: inWorld ? "Their turn: a pick in the world" : "Question on screen" }),
        q.answer != null ? h("span", { class: "ix-pv-answer", text: `Answer ${letter(q.answer)}` }) : null),
      para("ix-pv-q", q.question),
      q.options?.length ? h("ol", { class: "ix-pv-opts" }, q.options.map((o, i) => h("li", null, h("button", {
        class: `ix-pv-opt${i === q.answer ? " ix-pv-right" : ""}${i === q.chosen ? " ix-pv-chosen" : ""}`, type: "button",
        disabled: inWorld || q.chosen != null || q.revealed, onclick: () => ctx.actions.answer(i),
      }, h("span", { class: "ix-pv-opt-key", text: letter(i) }), h("span", { class: "ix-pv-opt-text" }, md(String(o?.text ?? o)), i !== q.answer ? meaning(q.feedback?.[i]) : null),
      i === q.answer ? h("span", { class: "ix-pv-opt-mark", html: I.check }) : null)))) : null,
      q.why && (q.revealed || q.chosen != null) ? para("ix-pv-ask-why", q.why) : null);
  }
  // one step before a question: what it will ask and its answer, so the presenter can put it to the room first
  function headsUp(q) {
    return h("div", { class: "ix-pv-heads" },
      h("div", { class: "ix-pv-ask-head" }, h("span", { class: "ix-pv-heads-k", text: q.kind === "choose" ? "Next, their turn: ask the room first" : "Next, a question: ask the room first" }),
        q.answer != null ? h("span", { class: "ix-pv-answer", text: `Answer ${letter(q.answer)}` }) : null),
      para("ix-pv-heads-q", q.question),
      q.options?.length ? h("ol", { class: "ix-pv-heads-opts" }, q.options.map((o, i) => h("li", { class: i === q.answer ? "ix-pv-right" : "" },
        h("span", { class: "ix-pv-heads-key", text: letter(i) }), h("span", null, md(String(o?.text ?? o)))))) : null);
  }
  // the chapter's notes for the room (lesson chapters[id].teach): a prompt, what to listen for, the minutes to give it
  function teachBlock(t) {
    if (!t?.prompt) return null;
    return h("div", { class: "ix-pv-teach" },
      h("div", { class: "ix-pv-label", text: `Ask the room${t.minutes ? ` · ${t.minutes} min` : ""}` }),
      para("ix-pv-teach-q", t.prompt),
      t.listen ? h("p", { class: "ix-pv-teach-listen" }, h("span", { class: "ix-pv-teach-k", text: "Listen for " }), md(t.listen)) : null);
  }

  let sig = "";
  function paint(s) {
    put(mapEl, s.chapters.map((name, i) => h("li", { class: i < s.chapter ? "ix-pv-past" : i === s.chapter ? "ix-pv-cur" : "" },
      h("button", { class: "ix-pv-map-btn", type: "button", title: name || `Chapter ${i + 1}`, "aria-label": `Go to chapter ${i + 1}: ${name}`,
        "aria-current": i === s.chapter ? "step" : null, onclick: () => ctx.actions.chapter(i) }))));
    whereEl.textContent = s.chapters.length > 1 ? `Chapter ${s.chapter + 1} of ${s.chapters.length} · ${s.chapters[s.chapter] ?? ""}` : s.chapters[0] ?? "";
    countEl.textContent = s.steps ? `Step ${s.step + 1} of ${s.steps}` : "";
    const sel = scenarioEl.lastChild;
    if (s.stories?.length > 1) put(sel, s.stories.map((o) => h("option", { value: o.id, text: o.label, selected: o.id === s.story ? "" : null })));
    sel.value = s.story ?? "";
    scenarioEl.hidden = !(s.stories?.length > 1);
    put(nowEl, s.ask && !s.ask.revealed ? null : s.held?.done ? h("p", { class: "ix-pv-done", text: s.held.done }) : null, words(s.cur, { deeper: true }), s.ask ? askBlock(s.ask) : null);
    nextHead.textContent = s.next ? (s.upcoming ? "Then, once it is answered" : s.nextChapter ? `Next chapter · ${s.nextChapter}` : "Next step") : "Next";
    put(nextEl, s.upcoming ? headsUp(s.upcoming) : null, nextHead,
      s.next ? words(s.next, { deeper: false }) : h("p", { class: "ix-pv-why", text: "That is the end of the run. Replay starts it again." }),
      teachBlock(s.teach),
      s.about ? h("div", { class: "ix-pv-about" }, h("div", { class: "ix-pv-label", text: "This chapter" }), para("ix-pv-about-text", s.about)) : null);
    mainBtn.querySelector(".ix-pv-btn-icon").innerHTML = s.held ? (s.held.kind === "end" ? I.replay : I.next) : s.playing ? I.pause : I.play;
    mainBtn.lastChild.textContent = s.primary;
    mainBtn.setAttribute("aria-label", s.primary);
    mainBtn.classList.toggle("ix-pv-held", !!s.held);
    fwdBtn.hidden = !!s.held;
  }
  const put = (el, ...kids) => { el.replaceChildren(...kids.flat(3).filter((k) => k != null && k !== false)); return el; };

  // ---- keys: the clicker lands on whichever window has focus ----
  w.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return;
    ctx.key(e);
  });
  const t0 = Date.now();
  const tick = () => { timeEl.textContent = clock(Date.now() - t0); };
  tick();
  const timer = w.setInterval(tick, 1000);
  let closed = false;
  function finish() {
    if (closed) return;
    closed = true;
    try { w.clearInterval(timer); } catch { /* gone */ }
    onClose?.();
  }
  w.addEventListener("pagehide", finish);
  function close() { try { w.close(); } catch { /* gone */ } finish(); }

  function render() {
    if (closed) return false;
    if (w.closed) { finish(); return false; }
    const s = ctx.state();
    if (!s) return true;
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, s.progress)).toFixed(4)})`;
    const theme = ctx.theme();
    const next = `${s.sig}|${theme}`;
    if (next === sig) return true;
    if (!sig || root.dataset.theme !== theme) applyTheme(root, theme);
    sig = next;
    paint(s);
    return true;
  }
  render();
  w.focus();
  return { render, close, focus: () => w.focus() };
}
