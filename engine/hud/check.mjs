// The end check (teaching.md §5; CONTRACTS.md 10.5): when the main run ends, 1–3 questions (New 3, Basics 2, Expert 1,
// the transfer question) whose answers come from the run's own rules, mostly at other knob values (s.check). Each answer
// says why; a miss names the belief behind it and offers "Replay that chapter". It ends on "You can now…", the lesson's
// objectives, never on a score. The card is the HUD's predict card (in the explain panel when it docks), so the run's
// payoff (the takeaway, the what-ifs) waits under it until the check is done.

const COUNT = { new: 3, basics: 2, expert: 1 };

/** The questions a level gets, in the figure's order; Expert gets the one marked transfer (or the first). */
export function checksFor(checks = [], level = "basics") {
  if (level === "expert") { const t = checks.find((c) => c.transfer) ?? checks[0]; return t ? [t] : []; }
  return checks.slice(0, COUNT[level] ?? COUNT.basics);
}

/**
 * ctx: { h, md, card (the predict card), level, nudge, belief(misconception, feedback) -> Node, lesson() -> tl.lesson,
 *        phases() -> tl.phases, icon: { check, cross, close }, keyboard() -> bool, show(q, { revealed, opts }), hide(), fire }
 * fire: onSeek(t), onPlay() ("Replay that chapter")
 */
export function createCheck(ctx) {
  const { h, md, card, level, fire } = ctx;
  let C = null;     // { list, at, picked: [index | null], open, done }
  const put = (...kids) => card.replaceChildren(...kids.filter(Boolean));
  const head = (badge, status, pulse) => h("div", { class: "ix-predict-head" },
    h("span", { class: "ix-badge" }, pulse ? h("i", { class: "ix-badge-dot" }) : null, badge),
    status ? h("span", { class: "ix-predict-status", text: status }) : null);
  const letter = (i) => String.fromCharCode(65 + i);
  const q = () => C.list[C.at];

  function open() {
    C.open = true;
    if (C.at >= C.list.length) return renderDone();
    renderQuestion();
  }

  function renderQuestion() {
    const c = q(), n = C.list.length, answered = C.picked[C.at];
    const opts = c.options.map((o, i) => h("button", { class: "ix-opt", type: "button", onclick: () => answer(i) },
      h("span", { class: "ix-opt-key", text: letter(i) }), h("span", { class: "ix-opt-text" }, md(o)), h("span", { class: "ix-opt-mark" })));
    put(head("Check yourself", n > 1 ? `${C.at + 1} of ${n}` : null, answered == null),
      h("p", { class: "ix-predict-q" }, md(c.question)),
      h("div", { class: "ix-opts" }, opts));
    card.classList.remove("ix-locked", "ix-revealed");
    C.opts = opts;
    ctx.show({ kind: "check", id: c.id }, { revealed: false, opts });
    if (ctx.keyboard()) requestAnimationFrame(() => opts[0]?.focus({ preventScroll: true }));
  }

  /** An answer, by option index (a click or the 1–9 keys). */
  function answer(i) {
    if (!C?.open || C.at >= C.list.length || C.picked[C.at] != null) return;
    const c = q(), ok = i === c.answer;
    C.picked[C.at] = i;
    ctx.nudge.note(ok, true);
    C.opts.forEach((b, j) => {
      b.setAttribute("aria-disabled", "true");
      b.classList.toggle("ix-correct", j === c.answer);
      b.classList.toggle("ix-wrong", j === i && !ok);
      b.lastChild.innerHTML = j === c.answer ? ctx.icon.check : j === i && !ok ? ctx.icon.cross : "";
      b.hidden = j !== c.answer && j !== i;   // the rows that say nothing more step aside for the why
    });
    card.classList.add("ix-locked", "ix-revealed", ok ? "ix-right" : "ix-missed");
    const status = card.querySelector(".ix-predict-status") ?? card.querySelector(".ix-predict-head").appendChild(h("span", { class: "ix-predict-status" }));
    status.textContent = ok ? "Right" : "Not quite";
    status.className = `ix-predict-status ix-tone-${ok ? "ok" : "fail"}`;
    card.querySelector(".ix-badge-dot")?.remove();
    const fb = !ok ? c.feedback?.[i] : null;
    const belief = !ok ? ctx.belief(fb?.misconception ?? null, fb?.text ?? null) : null;
    const said = [belief, c.why ? h("p", { class: "ix-predict-why" }, h("span", { class: "ix-predict-why-label", text: "Why" }), h("span", { class: "ix-predict-why-text" }, md(c.why))) : null].filter(Boolean);
    const chapter = !ok ? (ctx.phases() ?? []).find((p) => p.id === c.chapter) : null;
    const last = C.at + 1 >= C.list.length;
    card.querySelector(".ix-predict-foot")?.remove();
    card.append(...[
      said.length ? h("div", { class: "ix-predict-said" }, said) : null,
      h("div", { class: "ix-check-actions" },
        h("button", { class: "ix-pill", type: "button", text: last ? "Finish" : "Next question", onclick: () => { C.at++; open(); } }),
        chapter ? h("button", { class: "ix-pill ix-pill-quiet ix-check-replay", type: "button", onclick: () => { C.open = false; ctx.hide(); fire("onSeek", chapter.t0, { scrubbing: false }); fire("onPlay"); } },
          `Replay ${chapter.name}`) : null),
      ctx.nudge.line(),
    ].filter(Boolean));
    requestAnimationFrame(() => {
      const next = card.querySelector(".ix-check-actions .ix-pill");
      next?.scrollIntoView({ block: "nearest" });
      if (ctx.keyboard()) next?.focus({ preventScroll: true });
    });
  }

  // what the reader can now do: the lesson's objectives, as outcomes, not a score
  function renderDone() {
    C.done = true;
    const goals = (ctx.lesson()?.objectives ?? []).map((o) => o.text).filter(Boolean);
    card.classList.remove("ix-locked", "ix-right", "ix-missed");
    card.classList.add("ix-revealed");
    const close = h("button", { class: "ix-btn ix-btn-sm ix-close", type: "button", "aria-label": "Close", "data-tip": "Close", html: ctx.icon.close, onclick: () => ctx.hide() });
    put(h("div", { class: "ix-predict-head" }, h("span", { class: "ix-badge", text: "Check yourself" }), close),
      h("p", { class: "ix-predict-q", text: "You can now…" }),
      goals.length ? h("ul", { class: "ix-can" }, goals.map((t) => h("li", null, h("span", { class: "ix-can-mark", html: ctx.icon.check }), h("span", null, md(lower(t)))))) : null,
      ctx.nudge.line());
    ctx.show({ kind: "check", id: "done" }, { revealed: true });
  }
  // "Say why…" reads on from "You can now…" as "say why…"
  const lower = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t);

  return {
    /** A new main run: its questions for this level (progress resets). */
    set(checks) {
      const sig = (checks ?? []).map((c) => `${c.id}:${c.question}`).join("|");
      if (C && C.sig === sig) return;   // the same questions (back from a branch of the run): keep the progress
      C = checks?.length ? { list: checks, sig, at: 0, picked: [], open: false, done: false } : null;
    },
    /** Every frame: the main run's end opens the check; leaving the end puts it away (progress kept). */
    update({ held, branch }) {
      if (!C) return;
      const atEnd = held?.kind === "end" && !branch;
      if (atEnd && !C.open) open();
      else if (!atEnd && C.open) { C.open = false; ctx.hide(); }
    },
    answer,
    get done() { return !!C?.done; },
    get open() { return !!C?.open; },
  };
}
