// The described scene and the keyboard path into the world (PhET's parallel DOM): a visually hidden, structured copy
// of the world for screen readers, kept in step with the run, and one Tab stop that walks the things in it.
//   - "Scene" heading, a summary line (step, chapter, the run's numbers), then a heading per titled group with a list
//     of its things ("map 1, busy, 4 records"; a tray's tiles nest under it), and the step's "Look at: …"
//   - a polite live region that says what this step changed (describe.mjs), after the caption's own announcement and
//     never while scrubbing or at fast playback
//   - the list items are the keyboard path: Tab enters on one (roving tabindex), the arrows move to the nearest thing
//     in that direction on screen, Home/End jump to the first/last, Enter pins the inspector on it, Esc leaves.
//     Things the camera has left out count too, where they would be on screen: the runtime keeps the focused thing in
//     view (the director's keep()), so moving to one brings the camera to it.
//     The focused thing lights in the world (the runtime's hover path), a ring is drawn over its projected bounds and
//     a small inverted tag names it. Only non-character keys are used, so the shortcuts setting is untouched.
// The runtime feeds it: createScene(root, { project, onFocus, onOpen }), then update(frame, { tl, time, playing, speed, scrubbing })
// for every frame it draws.
import { outline, describe, stepChanges, lookLine, speak } from "./describe.mjs";
import { formatText } from "../hud/format.mjs";

const SPEAK_AFTER = { paused: 900, playing: 1700 };   // ms after a step lands: the caption's announcement goes first
const RING_PAD = 6;                                   // px between a thing's projected bounds and its ring
const VISIBLE = 0.05;                                 // a pose fainter than this is not a place to go

export function createScene(root, { project, onFocus, onOpen } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const el = (tag, attrs = {}, ...kids) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) k === "text" ? (e.textContent = v) : k === "class" ? (e.className = v) : e.setAttribute(k, v);
    e.append(...kids.filter(Boolean));
    return e;
  };
  // listeners, owned so destroy() can drop them
  const offs = [];
  const on = (t, type, fn, o) => { t.addEventListener(type, fn, o); offs.push(() => t.removeEventListener(type, fn, o)); };
  const uid = `ix-scene-${Math.random().toString(36).slice(2, 7)}`;

  // ---- the parallel document ----
  const help = el("p", { id: `${uid}-help`, text: "Arrow keys move between the things in the world. Enter shows a thing's details. Escape leaves the world." });
  const summary = el("p");
  const body = el("div", { class: "ix-scene-body", role: "group", "aria-label": "The world", "aria-describedby": help.id });
  const look = el("p");
  const live = el("div", { "aria-live": "polite", "aria-atomic": "true" });
  const doc_ = el("section", { class: "ix-scene-doc", "aria-labelledby": `${uid}-h` },
    el("h2", { id: `${uid}-h`, text: "Scene" }), summary, help, body, look, live);
  // reading order: after the header and the right column (the explain panel and the parameters), before the dock
  const anchor = root.querySelector(".ix-hud > .ix-params") ?? root.querySelector(".ix-explain-tab") ?? root.querySelector(".ix-top");
  if (anchor?.parentNode) anchor.after(doc_); else root.append(doc_);

  // ---- the ring and tag over the world ----
  const tag = el("div", { class: "ix-scene-tag", "aria-hidden": "true" });
  const ring = el("div", { class: "ix-scene-ring", "aria-hidden": "true" });
  const tags = root.querySelector(".ix-tags");
  (tags?.parentNode ?? root).insertBefore(ring, tags?.nextSibling ?? null);
  ring.after(tag);

  let tl = null, frame = null, step = -1, ents = null, focusId = null, tabId = null;
  let speakTimer = 0, builtFor = null, lastBuild = 0;
  const items = new Map();   // id -> <li>
  const sections = new Map();   // section id -> { wrap, h, ul }

  // ---- building the document (keyed, so focus survives every rebuild) ----
  function build() {
    builtFor = ents;
    lastBuild = win.performance.now();
    const want = outline(ents);
    const keepSec = new Set(), keepItem = new Set();
    let prevSec = null;
    for (const s of want) {
      const key = s.id ?? "@scene";
      keepSec.add(key);
      let sec = sections.get(key);
      if (!sec) {
        const hd = s.title ? el("h3", { text: s.title }) : null;
        const ul = el("ul", { "aria-label": s.title ?? "In the world" });
        sec = { wrap: el("div", { class: "ix-scene-sec" }, hd, ul), h: hd, ul };
        sections.set(key, sec);
      } else if (sec.h && sec.h.textContent !== s.title) sec.h.textContent = s.title;
      if (prevSec ? prevSec.wrap.nextSibling !== sec.wrap : body.firstChild !== sec.wrap) (prevSec ? prevSec.wrap.after(sec.wrap) : body.prepend(sec.wrap));
      prevSec = sec;
      let prev = null;
      for (const it of s.items) {
        keepItem.add(it.id);
        let li = items.get(it.id);
        if (!li) {
          li = el("li", { tabindex: "-1", "data-id": it.id });
          items.set(it.id, li);
        }
        if (li.textContent !== it.text) li.textContent = it.text;
        li.dataset.depth = String(it.depth);
        if (li.parentNode !== sec.ul || (prev ? prev.nextSibling !== li : sec.ul.firstChild !== li)) (prev ? prev.after(li) : sec.ul.prepend(li));
        prev = li;
      }
    }
    for (const [k, sec] of sections) if (!keepSec.has(k)) { sec.wrap.remove(); sections.delete(k); }
    for (const [id, li] of items) if (!keepItem.has(id)) {
      if (doc.activeElement === li) moveFrom(id);
      li.remove(); items.delete(id);
    }
    if (!items.has(tabId)) tabId = firstId();
    for (const [id, li] of items) li.tabIndex = id === tabId ? 0 : -1;
  }
  // where Tab lands: the first top-level thing in view (a machine before the records in its tray)
  const entry = () => { const o = order(true); return o.find((id) => items.get(id)?.dataset.depth === "0") ?? o[0] ?? null; };
  const firstId = () => entry() ?? items.keys().next().value ?? null;

  function renderSummary() {
    if (!tl || step < 0) return;
    const s = tl.steps[step];
    let ph = null;
    for (const p of tl.phases) if (p.t0 <= (s?.t0 ?? 0) + 1e-9) ph = p;   // the chapter this step plays in
    const nums = Object.entries(frame?.counters ?? {}).map(([k, v]) => {
      const d = tl.counters?.[k];
      if (!d || d.hidden || typeof v !== "number") return null;
      return `${speak(d.label ?? k)} ${formatText(v, d.format, d)}`;
    }).filter(Boolean);
    const numbers = nums.length ? `${nums.join(", ")}.` : "";
    const text = [`Step ${step + 1} of ${tl.steps.length}${ph?.name ? `, ${speak(ph.name)}` : ""}.`, numbers.charAt(0).toUpperCase() + numbers.slice(1)].join(" ").trim();
    if (summary.textContent !== text) summary.textContent = text;
    const l = lookLine(s?.layers?.look, ents);
    if (look.textContent !== l) look.textContent = l;
  }

  // ---- what changed: said once per step, after the caption ----
  function scheduleSpeak(info) {
    win.clearTimeout(speakTimer);
    if (info.scrubbing || (info.playing && (info.speed ?? 1) >= 2) || !tl) return;
    const at = step;
    speakTimer = win.setTimeout(() => {
      if (at !== step || !tl) return;
      const cap = speak(frame?.caption ?? "").toLowerCase();
      const said = stepChanges(tl, at).filter((x) => !cap.includes(x.replace(/\.$/, "").toLowerCase()));
      const l = lookLine(tl.steps[at]?.layers?.look, tl.snapshot(at + 1).entities);
      const text = [...said, l].filter(Boolean).join(" ");
      live.textContent = text;
    }, info.playing ? SPEAK_AFTER.playing : SPEAK_AFTER.paused);
  }

  // ---- geometry: where each thing is on screen now ----
  const poseOf = (id) => frame?.poses?.find((p) => p.id === id) ?? null;
  function boxOf(id) {
    const p = poseOf(id);
    if (!p || (p.opacity ?? 1) < VISIBLE || !project) return null;
    const w = (p.w ?? 12) / 2, d = (p.d ?? 12) / 2, z0 = p.z ?? 0, z1 = z0 + (p.h ?? 4);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, on = false;
    for (const [dx, dy, z] of [[-w, -d, z0], [w, -d, z0], [-w, d, z0], [w, d, z0], [-w, -d, z1], [w, -d, z1], [-w, d, z1], [w, d, z1]]) {
      const q = project([p.x + dx, p.y + dy, z]);
      if (!q || !Number.isFinite(q[0])) continue;
      on = on || !!q[3];
      x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // any thing in front of the camera is a place to go; one the reader can see now (its middle inside the figure) is seen
    const seen = on && cx >= 0 && cy >= 0 && cx <= root.clientWidth && cy <= root.clientHeight;
    return x1 > x0 ? { x0, y0, x1, y1, cx, cy, seen } : null;
  }
  // reading order on screen: rows top to bottom, left to right within a row (only the things in view: seen)
  function order(seen = false) {
    const pts = [...items.keys()].map((id) => ({ id, b: boxOf(id) })).filter((x) => x.b && (x.b.seen || !seen));
    const band = 24;
    return pts.sort((a, b) => Math.round(a.b.cy / band) - Math.round(b.b.cy / band) || a.b.cx - b.b.cx).map((x) => x.id);
  }
  // the nearest thing in a direction: mostly along it, a little across it
  function nearest(fromId, dir) {
    const a = boxOf(fromId);
    if (!a) return firstId();
    let best = null, score = Infinity;
    for (const id of items.keys()) {
      if (id === fromId) continue;
      const b = boxOf(id);
      if (!b) continue;
      const dx = b.cx - a.cx, dy = b.cy - a.cy;
      const along = dir === "ArrowRight" ? dx : dir === "ArrowLeft" ? -dx : dir === "ArrowDown" ? dy : -dy;
      const across = dir === "ArrowRight" || dir === "ArrowLeft" ? Math.abs(dy) : Math.abs(dx);
      if (along <= 2 || across > along * 2.5) continue;   // a cone of about 68 degrees each side
      const s = along + across * 2;
      if (s < score) { score = s; best = id; }
    }
    return best;
  }

  // ---- focus ----
  function go(id) {
    const li = items.get(id);
    if (!li) return;
    if (tabId && items.get(tabId)) items.get(tabId).tabIndex = -1;
    tabId = id; li.tabIndex = 0;
    li.focus({ preventScroll: true });
  }
  function moveFrom(id) {
    const o = order(), k = o.indexOf(id);
    tabId = o[k + 1] ?? o[k - 1] ?? null;
    if (tabId) go(tabId); else leave();
  }
  function setFocus(id) {
    if (id === focusId) return;
    focusId = id;
    root.classList.toggle("ix-scene-focus", !!id);
    onFocus?.(id);
    place();
  }
  function leave() {
    setFocus(null);
    root.focus({ preventScroll: true });
  }
  on(body, "focusin", (e) => {
    const id = e.target?.dataset?.id;
    if (!id) return;
    // Tab came in on a thing the camera has left: start from the first one in view instead
    if (!focusId && !boxOf(id)?.seen) { const first = entry(); if (first && first !== id) { go(first); return; } }
    tabId = id; setFocus(id);
  });
  on(body, "focusout", (e) => { if (!body.contains(e.relatedTarget)) setFocus(null); });
  on(body, "keydown", (e) => {
    const id = e.target?.dataset?.id;
    if (!id || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k.startsWith("Arrow")) {
      e.preventDefault();   // the HUD's step keys stand down (it skips handled events)
      if (e.shiftKey) return;
      const next = nearest(id, k);
      if (next) go(next);
    } else if (k === "Home" || k === "End") {
      e.preventDefault();
      const o = order();
      if (o.length) go(k === "Home" ? o[0] : o[o.length - 1]);
    } else if (k === "Enter") {
      e.preventDefault();
      const b = boxOf(id), rr = root.getBoundingClientRect();
      // the card opens beside the thing, not over it
      onOpen?.(id, b?.seen ? { x: b.x1 + RING_PAD, y: b.y0 } : { x: rr.width / 2, y: rr.height / 2 });
    }
  });
  // Esc: the HUD closes what is open first (the pinned inspector); with nothing left to close it leaves the world
  on(win, "keydown", (e) => {
    if (e.key !== "Escape" || !body.contains(e.target)) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    leave();
  });

  function place() {
    const b = focusId ? boxOf(focusId) : null;
    const show = !!b?.seen;   // while the camera brings a thing into view, its ring waits for it
    ring.classList.toggle("ix-show", show);
    tag.classList.toggle("ix-show", show);
    if (!show) return;
    const W = root.clientWidth;
    ring.style.transform = `translate3d(${Math.round(b.x0 - RING_PAD)}px,${Math.round(b.y0 - RING_PAD)}px,0)`;
    ring.style.width = `${Math.round(b.x1 - b.x0 + 2 * RING_PAD)}px`;
    ring.style.height = `${Math.round(b.y1 - b.y0 + 2 * RING_PAD)}px`;
    const text = describe(focusId, ents);
    if (tag.dataset.text !== text) {
      tag.dataset.text = text;
      tag.replaceChildren(el("span", { class: "ix-scene-tag-text", text }), el("kbd", { class: "ix-scene-tag-kbd", text: "Enter" }));
    }
    const tw = tag.offsetWidth, th = tag.offsetHeight;
    const x = Math.min(Math.max(8, b.cx - tw / 2), W - tw - 8);
    const above = b.y0 - RING_PAD - 8 - th;
    const y = above > 8 ? above : b.y1 + RING_PAD + 8;
    tag.style.transform = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
  }

  return {
    /** Every frame drawn, with the Timeline it came from. Cheap unless the step or the world's state changed. */
    update(f, info = {}) {
      if (info.tl && info.tl !== tl) { tl = info.tl; step = -1; builtFor = null; win.clearTimeout(speakTimer); }   // a recompile or a branch
      if (!f || !tl) return;
      frame = f;
      const stepNow = Number.isInteger(f.step) ? f.step : tl.stepAt(info.time ?? 0);
      const changedStep = stepNow !== step;
      step = stepNow;
      if (f.entities && f.entities !== ents) ents = f.entities;
      // while playing, rebuild on step changes and at most four times a second; at rest, on any change
      const due = builtFor !== ents && (changedStep || !info.playing || win.performance.now() - lastBuild > 250);
      if (due || changedStep) { if (due) build(); renderSummary(); }
      if (changedStep) scheduleSpeak(info);
      if (focusId) place();
    },
    /** The thing the keyboard is on, or null. */
    get focused() { return focusId; },
    destroy() {
      win.clearTimeout(speakTimer);
      offs.forEach((off) => off());
      for (const x of [doc_, ring, tag]) x.remove();
      root.classList.remove("ix-scene-focus");
    },
  };
}
