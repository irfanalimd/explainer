// node --test engine/embed/deeplink.test.mjs   (moment links: parse, check against a figure, place in a run, write;
// the share panel's link and embed helpers; the handout's pure parts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoment, resolveMoment, resolveStep, formatMoment, momentRest, linkParam } from "./deeplink.mjs";
import { shareBase, momentLink, embedSnippet } from "../hud/share.mjs";
import { playTime, questionsOf } from "../hud/handout.mjs";
import { stillName } from "../hud/still.mjs";

const FIG = {
  scenarios: [{ id: "basic", label: "Everything works" }, { id: "skew", label: "One word is very common" }],
  params: {
    reducers: { type: "int", label: "Counting machines", min: 1, max: 4, value: 3 },
    fast: { type: "bool", label: "Fast", value: false },
    mode: { type: "select", label: "Mode", options: [{ value: "a" }, { value: "b" }], value: "a" },
    text: { type: "text", label: "Text", value: "x", maxLength: 5 },
  },
};

test("parseMoment reads the readable spelling and the HUD's", () => {
  const a = parseMoment("#scenario-skew&step-14&level-expert&p=reducers:4,fast:1");
  assert.deepEqual({ ...a, bad: a.bad }, { scenario: "skew", step: 14, time: undefined, level: "expert", params: { reducers: "4", fast: "1" }, bad: [], found: true });
  const b = parseMoment("#s=skew&t=60.3&p=reducers:2");
  assert.equal(b.scenario, "skew"); assert.equal(b.time, 60.3); assert.deepEqual(b.params, { reducers: "2" }); assert.ok(b.found);
  assert.equal(parseMoment("").found, false);
  assert.equal(parseMoment("#intro&foo=1").found, false);    // another script's hash is not a moment
  assert.deepEqual(parseMoment("#step-0&t=-3&p=junk").bad, [{ kind: "step", raw: "0" }, { kind: "time", raw: "-3" }, { kind: "param", raw: "junk" }]);
  assert.equal(parseMoment("#scenario-a%20b").scenario, "a b");
  assert.equal(parseMoment("#scenario-%E0%A4").scenario, "%E0%A4");   // a broken escape is kept as written, not thrown
});

test("linkParam keeps only what the figure can use, and says why", () => {
  assert.deepEqual(linkParam("reducers", "2", FIG.params.reducers), { value: 2 });
  assert.equal(linkParam("reducers", "99", FIG.params.reducers).value, 4);
  assert.match(linkParam("reducers", "99", FIG.params.reducers).note, /goes up to 4/);
  assert.equal(linkParam("reducers", "0", FIG.params.reducers).value, 1);
  assert.equal(linkParam("reducers", "2.6", FIG.params.reducers).value, 3);
  assert.ok(!("value" in linkParam("reducers", "lots", FIG.params.reducers)));
  assert.ok(!("value" in linkParam("nope", "3", undefined)));          // an unknown knob never reaches the run
  assert.equal(linkParam("fast", "on", FIG.params.fast).value, true);
  assert.equal(linkParam("fast", "0", FIG.params.fast).value, false);
  assert.ok(!("value" in linkParam("fast", "maybe", FIG.params.fast)));
  assert.equal(linkParam("mode", "b", FIG.params.mode).value, "b");
  assert.ok(!("value" in linkParam("mode", "z", FIG.params.mode)));
  assert.equal(linkParam("text", "abcdefgh", FIG.params.text).value, "abcde");
});

test("resolveMoment checks a moment against the figure", () => {
  const r = resolveMoment(parseMoment("#scenario-skew&step-5&level-expert&p=reducers:4"), FIG);
  assert.deepEqual(r, { scenario: "skew", params: { reducers: 4 }, level: "expert", step: 5, time: undefined, notes: [] });
  const bad = resolveMoment(parseMoment("#scenario-nope&level-wizard&p=nope:3,reducers:99&step-x"), FIG);
  assert.equal(bad.scenario, undefined);
  assert.equal(bad.level, undefined);
  assert.deepEqual(bad.params, { reducers: 4 });
  assert.equal(bad.notes.length, 5);
  assert.match(bad.notes[0], /no story called “nope”, so it opens “Everything works”/);
  assert.deepEqual(resolveMoment(null, FIG).notes, []);
});

test("resolveStep places a moment in a compiled run", () => {
  const steps = [{ t0: 0 }, { t0: 2 }, { t0: 5 }, { t0: 9 }];
  assert.deepEqual(resolveStep({ step: 2 }, steps, 12), { index: 1, time: 2 });
  const past = resolveStep({ step: 30 }, steps, 12, "“Story”");
  assert.equal(past.index, 3); assert.match(past.note, /has 4 steps/);
  assert.deepEqual(resolveStep({ time: 6 }, steps, 12), { index: 2, time: 6 });
  assert.equal(resolveStep({ time: 40 }, steps, 12).time, 12);
  assert.equal(resolveStep({}, steps, 12), null);
  assert.equal(resolveStep({ time: 0 }, steps, 12), null);           // the start is the start card's own
  assert.equal(resolveStep({ step: 2 }, [], 0), null);
});

test("formatMoment round-trips through parseMoment", () => {
  const m = { scenario: "skew", step: 14, level: "basics", params: { reducers: 4, fast: true, text: "a b,c:d" } };
  const hash = formatMoment(m);
  assert.equal(hash, "scenario-skew&step-14&level-basics&p=reducers:4,fast:1,text:a%20b%2Cc%3Ad");
  const r = resolveMoment(parseMoment(`#${hash}`), FIG);
  assert.deepEqual(r.params, { reducers: 4, fast: true, text: "a b,c" });   // text cut to its maxLength (5)
  assert.equal(r.scenario, "skew"); assert.equal(r.step, 14); assert.equal(r.level, "basics");
  assert.equal(formatMoment({}), "");
  assert.equal(formatMoment({ level: "wizard", step: 0 }), "");
  assert.equal(momentRest("#scenario-x&step-2&s=a&t=1&p=k:1&mine=1&other"), "mine=1&other");
});

test("share links drop this visit's switches and say nothing they don't need", () => {
  assert.equal(shareBase("https://sites.example/mr.html?embed=1&present=1&lang=fr#s=skew&t=4"), "https://sites.example/mr.html?lang=fr");
  assert.equal(shareBase("file:///Users/a/mapreduce.html#step-3"), "file:///Users/a/mapreduce.html");
  assert.equal(shareBase("about:srcdoc"), null);
  assert.equal(shareBase("not a url"), null);
  const base = "https://sites.example/mr.html";
  assert.equal(momentLink(base, { scenario: "skew", step: 13, level: null, params: {} }), `${base}#scenario-skew&step-14`);
  assert.equal(momentLink(base, { scenario: null, step: null, params: {} }), base);
  const snip = embedSnippet(base, { scenario: "skew", step: 3, params: { reducers: 2 } }, `Map"Reduce <1>`);
  assert.match(snip, /src="https:\/\/sites\.example\/mr\.html\?embed=1#scenario-skew&amp;step-4&amp;p=reducers:2"/);
  assert.match(snip, /title="Map&quot;Reduce &lt;1>"/);
  assert.doesNotMatch(snip, /level-/);
});

test("handout helpers", () => {
  assert.equal(playTime(3), "5 s");
  assert.equal(playTime(44), "45 s");
  assert.equal(playTime(140), "2 min 20 s");
  assert.equal(playTime(120), "2 min");
  const tl = { steps: [
    { caption: "a" },
    { caption: "b", ask: { id: "q1", question: "Where?", options: ["x", { text: "y" }], answer: 1, why: "because", feedback: [{ text: "no", misconception: "m1" }] } },
    { caption: "c", choose: { id: "c1", prompt: "Pick", options: [{ pick: "r0", text: "reduce 0" }, { pick: "r1", feedback: "split", misconception: "m2" }], answer: 0 } },
  ] };
  const qs = questionsOf(tl);
  assert.equal(qs.length, 2);
  assert.deepEqual(qs[0].options, ["x", "y"]);
  assert.equal(qs[0].kind, "predict"); assert.equal(qs[0].step, 1); assert.equal(qs[0].feedback[0].misconception, "m1");
  assert.deepEqual(qs[1].options, ["reduce 0", "r1"]);
  assert.deepEqual(qs[1].feedback[1], { text: "split", misconception: "m2" });
  assert.equal(questionsOf(tl, 2).length, 1);
  assert.match(stillName("MapReduce: count words", "skew", 13), /^mapreduce-count-words.*skew.*14.*\.png$/);
});
