// node --test engine/hud/journey.test.mjs   (the reader's journey across visits: the promise, the next story, progress)
import { test } from "node:test";
import assert from "node:assert/strict";
import { promiseOf, nextStory, createJourney, RESUME_DAYS } from "./journey.mjs";

const memory = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), m }; };
// a store holding garbage (another page's keys, a half-written value): the HUD's wrapper never throws, and
// journey.mjs must not trust what it reads either
const broken = () => ({ get: () => "{not json", set: () => {} });
const stories = [{ id: "happy" }, { id: "crash" }, { id: "skew" }];

test("the promise counts the run: chapters, minutes at the reading pace, questions, what-ifs", () => {
  assert.equal(promiseOf({ duration: 140, pace: 1, chapters: 5, questions: 3, stories: 4 }), "5 chapters · about 3 min · 3 questions · then 3 what-ifs");
  // New reads at 1.2x the time: 140 s becomes 168 s, still about 3 min; one story, one question, no chapters
  assert.equal(promiseOf({ duration: 140, pace: 1 / 1.2, chapters: 1, questions: 1, stories: 1 }), "About 3 min · 1 question");
  assert.equal(promiseOf({ duration: 20, chapters: 2, stories: 2 }), "2 chapters · about 1 min · then 1 what-if");
  assert.equal(promiseOf({}), "");
});

test("the next story is the one after this, and none after the last", () => {
  assert.equal(nextStory(stories, "happy").id, "crash");
  assert.equal(nextStory(stories, "skew"), null);
  assert.equal(nextStory(stories, "nope"), null);
});

test("finished stories and the place to pick up are remembered, and only worth-it places are offered", () => {
  const store = memory();
  const j = createJourney({ store, key: "mr" });
  assert.equal(j.saved(stories), null);
  assert.equal(j.finish("happy"), true);
  assert.equal(j.finish("happy"), false);
  j.save({ scenario: "crash", time: 41.5, step: 9, steps: 27, chapter: "Map" });
  const again = createJourney({ store, key: "mr" });
  assert.deepEqual([...again.done], ["happy"]);
  assert.equal(again.saved(stories).step, 9);
  // too near the start, an unknown story, too old: nothing to offer
  again.save({ scenario: "crash", time: 1 });
  assert.equal(again.saved(stories), null);
  again.save({ scenario: "gone", time: 30 });
  assert.equal(again.saved(stories), null);
  store.set("resume:mr", JSON.stringify({ scenario: "crash", time: 30, at: Date.now() - (RESUME_DAYS + 1) * 864e5 }));
  assert.equal(again.saved(stories), null);
  // a story's end is offered (as the next story) even though its time is the end
  again.save({ scenario: "happy", time: 140, end: true });
  assert.equal(again.saved(stories).end, true);
  again.forget();
  assert.equal(again.saved(stories), null);
});

test("garbage in storage is ignored, never thrown", () => {
  const j = createJourney({ store: broken(), key: "mr" });
  assert.equal(j.saved(stories), null);
  assert.equal(j.done.size, 0);
  assert.equal(j.finish("happy"), true);
});
