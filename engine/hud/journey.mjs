// The reader's journey through a figure, across visits: what the start card promises before the first step, which
// stories this viewer has finished, and where they stopped, so a returning reader is offered to pick up there.
// Per viewer and per figure, in the HUD's localStorage wrapper (every read and write is safe; without storage the page
// simply forgets). Nothing here moves the run on its own: a resume is an offer on the start card, the reader decides.
// Capture (shoot, record: a frozen page) neither writes it nor shows it, so a frame stays the same for the same t.

const DAY = 24 * 3600 * 1000;
export const RESUME_DAYS = 30;     // an older place to pick up is forgotten
const MIN_TIME = 2;                // s: a run stopped before this has nothing to pick up

/** The figure's chapters, questions and length as one short line for the start card: "5 chapters · about 3 min · 4 questions · then 3 what-ifs"
 *  (the questions: those this level asks on the way and at the end). */
export function promiseOf({ duration = 0, pace = 1, chapters = 0, questions = 0, stories = 0 } = {}) {
  const parts = [];
  if (chapters > 1) parts.push(`${chapters} chapters`);
  if (duration > 0) parts.push(`about ${Math.max(1, Math.ceil(duration / pace / 60))} min`);
  if (questions > 0) parts.push(`${questions} ${questions === 1 ? "question" : "questions"}`);
  if (stories > 1) parts.push(`then ${stories - 1} what-${stories - 1 === 1 ? "if" : "ifs"}`);
  const line = parts.join(" · ");
  return line ? line[0].toUpperCase() + line.slice(1) : "";
}

/** The story after `id` in order (no wrap), or null at the last one. */
export function nextStory(scenarios = [], id) {
  const i = scenarios.findIndex((s) => s.id === id);
  return i >= 0 && i + 1 < scenarios.length ? scenarios[i + 1] : null;
}

/** store: the HUD's { get, set }; key: the figure's key. */
export function createJourney({ store, key }) {
  const read = (k) => { try { const v = store.get(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const list = read(`done:${key}`);
  const done = new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  return {
    /** The stories this viewer has played to their end. */
    get done() { return done; },
    /** A story played to its end; true when it is newly finished. */
    finish(id) {
      if (!id || done.has(id)) return false;
      done.add(id);
      store.set(`done:${key}`, JSON.stringify([...done]));
      return true;
    },
    /** Where the reader is: { scenario, time, step, steps, chapter, chapters, phase, params, end }. */
    save(state) { store.set(`resume:${key}`, JSON.stringify({ ...state, at: Date.now() })); },
    forget() { store.set(`resume:${key}`, ""); },
    /** The place to pick up, or null (none, too old, or too near the start to be worth offering). */
    saved(scenarios = []) {
      const r = read(`resume:${key}`);
      if (!r || typeof r !== "object" || !Number.isFinite(r.time)) return null;
      if (scenarios.length && !scenarios.some((s) => s.id === r.scenario)) return null;
      if (Number.isFinite(r.at) && Date.now() - r.at > RESUME_DAYS * DAY) return null;
      if (!r.end && r.time < MIN_TIME) return null;
      return r;
    },
  };
}
