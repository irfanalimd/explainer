// Your turn in the world (teaching.md §5; CONTRACTS.md 10.5): at a step with s.choose the run pauses and the reader
// picks a thing in the world (click or tap it, or Tab and the arrow keys through the candidates, which light up; Enter
// picks). Every option is a branch of the same deterministic run:
//   right   a ring, a short beat, then the run goes on; the card says why (and offers to show what the other pick does)
//   wrong   the branch compiled with that pick plays at 1×, narrated by its own steps, and holds on the consequence; the
//           card names the belief behind the pick and what the run shows; the transport's one way on rewinds the same
//           branch quickly back to the pick, and the reader tries again. "Show me" appears after two wrong tries.
// The run never ends on the broken state: every way out of a branch goes back to the main run.
// A branch is a detour, not another lesson (detourOf): the progress map keeps the main run's chapters with the reader
// still in the pick's chapter, and the scrubber keeps the main run's length with the branch drawn off the pick.
// The card is the HUD's predict card (hosted in the explain panel when it docks), so the calm rules hold.
// Caps (teaching.md §5): one interaction per chapter, at most 3 / 2 / 1 per story at New / Basics / Expert; Expert gets
// no highlighted candidates.

const CAP = { new: 3, basics: 2, expert: 1 };
const COMMIT = 400;       // ms: the picked thing rings before its branch plays
const REWIND = 1.4;       // s: the longest a rewind takes

/** The step indices whose question (s.ask or s.choose) is asked at a level: one per chapter, picks before predictions. */
export function liveTurns(steps = [], level = "basics") {
  const chapter = new Map();
  steps.forEach((st, i) => {
    if (!st.ask && !st.choose) return;
    const k = st.phase ?? "", had = chapter.get(k);
    if (had === undefined || (st.choose && !steps[had].choose)) chapter.set(k, i);
  });
  const all = [...chapter.values()].sort((a, b) => a - b);
  const cap = CAP[level] ?? CAP.basics;
  const keep = [...all.filter((i) => steps[i].choose), ...all.filter((i) => !steps[i].choose)].slice(0, cap);
  return new Set(keep);
}

/**
 * A branch seen as a detour from the main run it left, for the progress map and the scrubber: the pick's step and time,
 * the main run's chapter the pick sits in, and the scale both runs share (they are the same run up to the pick). null
 * for the main run, or before the HUD has seen it.
 * → { main, step, t0 (the pick), t1 (the branch's end), phase (main chapter index), span (scrubber scale) } | null
 */
export function detourOf(tl, main) {
  if (!tl?.branch || !main || main.branch) return null;
  const step = tl.steps.findIndex((st) => st.choose && st.choose.id in tl.branch);
  if (step < 0) return null;
  let phase = 0;
  main.phases.forEach((p, i) => { if ((p.step ?? 0) <= step) phase = i; });
  return { main, step, t0: tl.steps[step].t0, t1: tl.duration, phase, span: Math.max(main.duration, tl.duration) };
}

/**
 * ctx: { h, md, card (the predict card element), level, nudge, belief(misconception, feedback) -> Node, icon: { check,
 *        cross, replay }, keyboard() -> bool, reduced() -> bool, entities() -> Map, steps() -> tl.steps,
 *        show(q, { step, revealed, opts }), hide(), fire(name, ...args) }
 * fire: onAnswer(index) (the run goes on), onBranch({ step, choices }) (play a branch; choices null comes back),
 *       onCandidates(ids | null) (light them), onPickArea(ids | null) (keep them in view, at every level),
 *       onRefHover(id | null) (ring one), onSeek(t) (the rewind)
 */
export function createTurn(ctx) {
  const { h, md, card, level, fire } = ctx;
  let T = null;               // { q, step, tries, tried, phase, then, opts, foot, timer, raf }

  const expert = () => level.value === "expert";
  const options = () => T.q.options ?? [];
  const optionOf = (id) => {
    // a click on a slip inside a counter picks the counter: walk up the parents to a candidate
    const map = ctx.entities?.();
    for (let cur = id, n = 0; cur && n < 8; n++) {
      const j = options().findIndex((o) => o.pick === cur);
      if (j >= 0) return j;
      cur = map?.get?.(cur)?.parent ?? null;
    }
    return -1;
  };
  const light = (on) => {
    fire("onCandidates", on && !expert() ? options().filter((_, j) => !T.tried.has(j)).map((o) => o.pick) : null);
    fire("onPickArea", on ? options().map((o) => o.pick) : null);   // the camera keeps every choice in view
  };
  const ring = (id) => fire("onRefHover", id ?? null);
  const stop = () => { clearTimeout(T?.timer); cancelAnimationFrame(T?.raf ?? 0); };

  /** The run paused before a step with s.choose: open (or reopen, after a rewind) the pick. */
  function open(q, step) {
    if (!T || T.q.id !== q.id || T.step !== step) { stop(); T = { q, step, tries: 0, tried: new Set(), phase: "pick", then: null }; }
    T.q = q;
    T.phase = "pick";
    if (T.then) { const then = T.then; T.then = null; commit(q.answer, then); return; }
    renderPick();
    ctx.show(q, { step, revealed: false, opts: T.opts });
    light(true);
    if (ctx.keyboard()) requestAnimationFrame(() => T?.opts.find((b) => !b.disabled)?.focus({ preventScroll: true }));
  }

  const head = (status, tone, pulse = true) => h("div", { class: "ix-predict-head" },
    h("span", { class: "ix-badge" }, pulse ? h("i", { class: "ix-badge-dot" }) : null, "Your turn"),
    status ? h("span", { class: `ix-predict-status${tone ? ` ix-tone-${tone}` : ""}`, text: status }) : null);

  function renderPick() {
    const tried = T.tries > 0;
    T.opts = options().map((o, j) => {
      const done = T.tried.has(j);
      const b = h("button", { class: `ix-turn-pick${done ? " ix-turn-tried" : ""}`, type: "button", "data-pick": o.pick,
        "aria-disabled": done ? "true" : null, "aria-label": done ? `${o.text}, already tried` : o.text,
        onclick: () => pick(j), onfocus: () => ring(o.pick), onblur: () => ring(null),
        onpointerenter: (e) => { if (e.pointerType !== "touch") ring(o.pick); }, onpointerleave: () => ring(null) },
      h("span", { class: "ix-turn-pick-text" }, md(o.text)), done ? h("span", { class: "ix-turn-pick-mark", html: ctx.icon.cross }) : null);
      if (done) b.disabled = true;
      return b;
    });
    // the candidates are a list too (keyboard, screen readers, small screens); Expert keeps it folded
    const list = h("div", { class: "ix-turn-picks", role: "group", "aria-label": "The choices" }, T.opts);
    list.addEventListener("keydown", (e) => {
      const live = T.opts.filter((b) => !b.disabled), i = live.indexOf(e.target);
      if (i < 0) return;
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); e.stopPropagation();
      live[(i + d + live.length) % live.length].focus();
    });
    const fold = expert() ? h("button", { class: "ix-turn-more", type: "button", "aria-expanded": "false", text: "Or pick from a list",
      onclick: () => { fold.remove(); list.hidden = false; T.opts.find((b) => !b.disabled)?.focus({ preventScroll: true }); } }) : null;
    if (fold) list.hidden = true;
    T.foot = h("p", { class: "ix-predict-foot", text: expert() ? "Click it in the world." : tried ? "Pick another one." : "Pick one here, or click it in the world." });
    const show = T.tries >= 2 ? h("button", { class: "ix-turn-more", type: "button", text: "Show me", onclick: () => showMe() }) : null;
    put(head(tried ? "Try again" : null), h("p", { class: "ix-predict-q" }, md(T.q.prompt)), list, fold,
      h("div", { class: "ix-turn-foot" }, T.foot, show));
  }
  const put = (...kids) => card.replaceChildren(...kids.filter(Boolean));

  /** A pick, by option index (the list, the 1–9 keys) or by the entity clicked in the world. */
  function pick(j) {
    if (T?.phase !== "pick" || j < 0 || j >= options().length || T.tried.has(j)) return;
    commit(j);
  }
  /** A click in the world while a pick is open: true when the pick took it (so the inspector does not). */
  function pickId(id) {
    if (T?.phase !== "pick") return false;
    const j = id ? optionOf(id) : -1;
    if (j >= 0 && !T.tried.has(j)) commit(j);
    else if (id && T.foot) T.foot.textContent = j >= 0 ? "You've seen that one play out. Pick another." : "That isn't one of the choices.";
    return true;
  }

  // commit: the picked thing rings for a beat, then the run plays the branch that pick makes
  function commit(j, then = null) {
    const o = options()[j], right = j === T.q.answer;
    T.phase = "commit";
    T.opts?.forEach((b, k) => b.classList.toggle("ix-chosen", k === j));
    card.classList.add("ix-locked");
    ring(o.pick);
    T.timer = setTimeout(() => {
      ring(null);
      light(false);
      if (right) return reveal(j, then);
      T.tries++;
      T.tried.add(j);
      T.wrong = j;
      T.curious = false;
      ctx.nudge.note(false, T.tries === 1);
      T.phase = "playing";
      ctx.hide();
      fire("onBranch", { step: T.step, choices: { [T.q.id]: j } });
    }, then || ctx.reduced() ? 0 : COMMIT);
  }

  // the right pick: one line on why, and (on a first try) the other pick, shown for curiosity rather than as an error
  function reveal(j, then) {
    const first = T.tries === 0 && !then;
    if (!then) ctx.nudge.note(true, first);
    T.phase = "right";
    const other = options().findIndex((_, k) => k !== T.q.answer);
    T.opts = options().map((o, k) => h("span", { class: `ix-turn-pick ix-turn-static${k === j ? " ix-turn-right" : T.tried.has(k) ? " ix-turn-tried" : ""}` },
      h("span", { class: "ix-turn-pick-text" }, md(o.text)), k === j ? h("span", { class: "ix-turn-pick-mark", html: ctx.icon.check }) : null));
    const curious = first && other >= 0 ? h("button", { class: "ix-turn-more", type: "button", text: "See what the other pick does",
      onclick: () => { T.wrong = other; T.curious = true; T.phase = "playing"; ctx.hide(); fire("onBranch", { step: T.step, choices: { [T.q.id]: other } }); } }) : null;
    put(head(then === "show" ? "Here's the way" : "Right", then === "show" ? null : "ok", false),
      h("p", { class: "ix-predict-q" }, md(T.q.prompt)),
      h("div", { class: "ix-turn-picks" }, T.opts),
      T.q.why ? h("div", { class: "ix-predict-said" }, h("p", { class: "ix-predict-why" }, h("span", { class: "ix-predict-why-label", text: "Why" }), h("span", { class: "ix-predict-why-text" }, md(T.q.why)))) : null,
      curious ? h("div", { class: "ix-turn-foot" }, curious) : null,
      ctx.nudge.line());
    card.classList.remove("ix-locked");
    ctx.show(T.q, { step: T.step, revealed: true, hold: 5200 });
    fire("onAnswer", j);
  }

  // the branch holds on its consequence: name the belief, say what the run shows; the transport rewinds
  function feedback() {
    T.phase = "feedback";
    const o = options()[T.wrong] ?? {};
    const steps = ctx.steps(), last = steps[steps.length - 1];
    // the consequence in the run's own words leads; the card stands in for the step, so the panel says it once
    const happened = last ? (last.layers?.plain ?? last.caption) : "Here's what happened.";
    const said = ctx.belief(T.curious ? null : o.misconception, o.feedback ?? null);
    const show = T.tries >= 2 ? h("button", { class: "ix-turn-more", type: "button", text: "Show me", onclick: () => showMe() }) : null;
    put(head(T.curious ? `If it went to ${plainText(o.text)}` : "Not quite", T.curious ? null : "fail", false),
      ctx.docked?.() ? h("p", { class: "ix-predict-q" }, md(happened)) : null,   // narrow screens: the caption under it says it
      said ? h("div", { class: "ix-predict-said" }, said) : null,
      show ? h("div", { class: "ix-turn-foot" }, show) : null,
      T.curious ? null : ctx.nudge.line());
    ctx.show(T.q, { step: T.step, revealed: false, asking: false });
  }
  const plainText = (src) => md(src).textContent ?? String(src);

  // "Show me": back to the pick, then the right one plays with its why
  function showMe() {
    if (T.phase === "feedback") return rewind("show");
    if (T.phase === "pick") commit(T.q.answer, "show");
  }

  // the same branch, played backwards quickly to the pick, so the way back is honest; then the main run takes over
  function rewind(then = null) {
    if (T?.phase !== "feedback") return false;
    T.phase = "rewind";
    T.then = then ?? (T.curious ? "resume" : null);
    ctx.hide();
    const steps = ctx.steps(), to = steps[T.step]?.t0 ?? 0, from = T.time ?? to;
    const back = () => fire("onBranch", { step: T.step, choices: null });
    if (ctx.reduced() || from <= to) { back(); return true; }
    const dur = Math.min(REWIND, 0.35 + (from - to) * 0.08) * 1000, t0 = performance.now();
    const frame = (now) => {
      const u = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - u, 3);
      fire("onSeek", from + (to - from) * e, { scrubbing: false });
      if (u < 1) T.raf = requestAnimationFrame(frame); else back();
    };
    T.raf = requestAnimationFrame(frame);
    return true;
  }

  return {
    open,
    pick,
    pickId,
    /** The runtime's pause, as the HUD shows it: a branch's end is the turn's hold ("Rewind and try again"). */
    held(held, tl) { return held?.kind === "end" && tl?.branch && T ? { kind: "turn", phase: held.phase } : held; },
    /**
     * Every frame: a branch that reached its end shows the feedback; scrubbing back before the pick leaves the branch;
     * the main run moving off an open pick (a seek, a chapter jump, an embed's step, the run's end) puts the pick away
     * (the run asks it again when it plays up to it).
     */
    update({ tl, step, time, held }) {
      if (!T) return;
      T.time = time;
      if (!tl?.branch) {
        if (T.phase === "pick" && (held?.kind === "end" || step > T.step || step < T.step - 1)) { stop(); light(false); ring(null); ctx.hide(); T = null; }
        return;
      }
      if (T.phase === "playing" && held?.kind === "end") feedback();
      else if ((T.phase === "playing" || T.phase === "feedback") && step < T.step) { T.phase = "rewind"; ctx.hide(); fire("onBranch", { step: T.step, choices: null }); }
    },
    /** The transport's way on while the turn holds (Enter, Space, the primary pill): rewind. */
    primary: () => rewind(),
    /** Params or the scenario changed: the run was compiled anew. */
    reset() { if (T) { stop(); light(false); ring(null); } T = null; },
    get active() { return !!T && T.phase !== "right"; },
  };
}
