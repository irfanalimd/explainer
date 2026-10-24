// The progress map at the top of the explain panel: one dot per chapter, joined by a hairline, the current one ringed,
// the ones behind it filled. Each dot is a button that jumps to its chapter. On a phone the map collapses to a line of
// words ("Chapter 4 of 5 · Insert").

// While a wrong pick's branch plays (turn.mjs detourOf) the map keeps the main run's chapters and marks the current one
// as a detour: its ring turns dashed and the position reads "Detour · Chapter 3 of 5".

/** ctx: { h, onJump(phaseIndex) }. Returns { el, set(phases, current, { goal, compact, detour }) }. */
export function createProgress({ h, onJump }) {
  const dots = h("ol", { class: "ix-map", "aria-label": "Chapters" });
  const pos = h("span", { class: "ix-map-pos" });
  const words = h("span", { class: "ix-map-words" });
  const el = h("div", { class: "ix-progress" }, dots, pos, words);
  let sig = "";

  function set(phases, current, { goal = "", compact = false, detour = false } = {}) {
    const n = phases.length;
    const name = (k) => phases[k]?.name || (k === 0 ? "Overview" : `Chapter ${k + 1}`);
    el.classList.toggle("ix-progress-compact", compact);
    el.hidden = n < 2;
    el.classList.toggle("ix-progress-detour", detour);
    words.textContent = n > 1 ? `Chapter ${current + 1} of ${n} · ${name(current)}${detour ? " · detour" : ""}` : "";
    pos.textContent = n > 1 ? `${detour ? "Detour · " : ""}Chapter ${current + 1} of ${n}` : "";
    const next = `${phases.map((p) => p.name).join("\u0000")}|${current}|${goal}|${detour}`;
    if (next === sig) return;
    sig = next;
    dots.replaceChildren(...phases.map((p, k) => {
      const state = k < current ? "done" : k === current ? "current" : "ahead";
      const label = `Chapter ${k + 1} of ${n}: ${name(k)}${detour && k === current ? ", on a detour" : ""}`;
      // on a detour the chapters ahead belong to the main run: the way there is back through the pick
      const ahead = detour && k > current;
      return h("li", { class: `ix-map-item ix-map-${state}` }, h("button", {
        class: "ix-map-dot", type: "button", "aria-label": label, "aria-current": k === current ? "step" : null, disabled: ahead || null,
        "data-tip": k === current && goal ? goal : name(k), "data-tip-head": k === current && goal ? name(k) : null,
        onclick: () => onJump?.(k),
      }));
    }));
  }
  return { el, set };
}
