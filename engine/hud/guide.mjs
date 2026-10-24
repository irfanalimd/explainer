// The next thing to do: one cue at a time on the control that moves the reader on, so nobody has to search the
// screen for it. cueOf() decides which control from the HUD's state (pure, tested); createGuide() puts the cue on
// it: an ink ring that calls (ripples out) on the control until the reader acts (reduced motion: the resting ring
// alone). Chrome is never coloured (DESIGN.md), so the ring is the ink's. Two looks (STYLES): "clear", the default, a
// strong ring with a soft halo that keeps calling, the control swelling a little each time, for as long as the cue
// waits (Settings → Hints stops it); "quiet", a faint ring that calls three times, only on the first few cues of a
// kind, then once more after RECALL_MS.
// Nothing here is announced: each moment already says its way on to screen readers (the pause's line, the card).
// Capture, presenting and the start card show no cue, so a frame never depends on it.

export const STYLES = ["clear", "quiet"];
export const CALLS = { clear: Infinity, quiet: 3 };   // how many cues of a kind call; after that the ring only rests
export const LOOPS = { clear: true, quiet: false };   // a call that repeats until the cue moves on (hud.css), or one burst
export const RECALL_MS = 12000;  // a quiet cue still waiting after this long calls once more

/**
 * The one cue for this moment, or null.
 * s: { on, capture, presenting, intro, overlay, scrubbing, playing, held: { kind } | null, after (a next story),
 *      asking, ponder (the question's way on is a reveal, not a pick), turn (an in-world pick), checking,
 *      stepMode, atStart, step, phase }
 * Returns { id, key }: id names the control ("play" | "continue" | "next-story" | "rewind" | "answer" | "check" |
 * "next"), key changes each time the same control is the way on again (a new chapter, a new step).
 */
export function cueOf(s = {}) {
  if (!s.on || s.capture || s.presenting || s.intro || s.overlay || s.scrubbing) return null;
  // the end check asks while the run is held at its end: its question is the way on, not the quiet pill
  if (s.checking) return { id: "check", key: `check:${s.step}` };
  if (s.held && !s.playing) {
    const k = s.held.kind;
    if (k === "end") return s.after ? { id: "next-story", key: "next-story" } : null;   // after the last story: done
    if (k === "turn") return { id: "rewind", key: `rewind:${s.step}` };
    return { id: "continue", key: `continue:${k}:${s.phase}:${s.step}` };
  }
  if (s.asking && !s.playing) return { id: "answer", key: `answer:${s.step}` };
  if (s.playing) return null;
  if (s.stepMode) return { id: "next", key: `next:${s.step}` };
  // paused at the very top, before anything has played: Play. A reader who paused later chose to stop; no cue
  if (s.atStart) return { id: "play", key: "play" };
  return null;
}

/** The look a page asks for (?cue=quiet, or the figure's option), else the default. */
export function cueStyle(search, option) {
  let v = option;
  try { v = new URLSearchParams(search ?? "").get("cue") ?? option; } catch { /* none */ }
  return STYLES.includes(v) ? v : STYLES[0];
}

/**
 * ctx: { win, target(id) -> Element | Element[] | null, reduced() -> bool, style: "clear" | "quiet" }.
 * set(cue) moves the ring to cue's control (or clears it on null); call it whenever the HUD's state may have changed.
 */
export function createGuide({ win, target, reduced, style = STYLES[0] }) {
  const calls = CALLS[style] ?? CALLS.clear, loops = LOOPS[style] ?? LOOPS.clear;
  const seen = new Map();   // id -> how many cues of that kind have called
  let key = "", els = [], timer = 0;
  const clear = () => {
    if (timer) { win.clearTimeout(timer); timer = 0; }
    for (const el of els) el.classList.remove("ix-cue", "ix-cue-call");
    els = [];
  };
  const call = () => {
    for (const el of els) { el.classList.remove("ix-cue-call"); void el.offsetWidth; el.classList.add("ix-cue-call"); }
  };
  return {
    get key() { return key; },
    get els() { return els; },
    set(cue) {
      const next = cue ? cue.key : "";
      const want = cue ? [target(cue.id)].flat().filter(Boolean) : [];
      // the same cue on the same controls: nothing to do (the HUD may rebuild a card; a new element takes the ring)
      if (next === key && want.length === els.length && want.every((el, i) => el === els[i] && el.isConnected)) return;
      const fresh = next !== key;
      clear();
      key = next;
      if (!cue || !want.length) return;
      els = want;
      for (const el of els) el.classList.add("ix-cue");
      if (reduced()) return;
      // a call that repeats goes on until the cue moves on, on a rebuilt control too: the reader still has to act
      if (loops) { call(); return; }
      if (!fresh) return;
      const n = (seen.get(cue.id) ?? 0) + 1;
      seen.set(cue.id, n);
      if (n <= calls) call();
      // still waiting a while later: one more call, the reader may have lost the thread
      timer = win.setTimeout(() => { timer = 0; if (key === next && !reduced()) call(); }, RECALL_MS);
    },
    clear() { clear(); key = ""; },
  };
}
