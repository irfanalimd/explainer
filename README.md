<h1 align="center">Explainer</h1>

<p align="center"><b>Understand a computer-science concept by watching it run.</b><br>
A Claude Code skill: <code>/explainer &lt;concept&gt;</code> writes a real simulation of the idea and hands you one HTML page you can play, rewind and break.</p>

<p align="center">
  <a href="https://sites.irfanali.me/p/random/raft-consensus.html">Live demo</a> ·
  <a href="#install">Install</a> ·
  <a href="#gallery">Gallery</a> ·
  <a href="#how-it-works">How it works</a>
</p>

<p align="center"><img src=".github/assets/btree.jpg" width="880" alt="A B+ tree explainer: an insert tray at the top, a new root page p8, two inner pages and five leaf pages holding coloured keys. A glowing packet travels down from p3 toward leaf p2 as key 57 is inserted. A panel on the right explains the root-split chapter; a compact control bar sits at the bottom."></p>

---

Most diagrams of distributed systems, operating systems or algorithms are pictures. Explainer builds the thing instead, at small scale: MapReduce really counts the words, Raft really elects a leader, the MMU really walks four levels of page tables. Every step of that run becomes a step on screen, and every number you see comes from the run.

## Install

```sh
npx skills add irfanalimd/explainer -g -a claude-code
```

Or clone it into your skills folder:

```sh
git clone https://github.com/irfanalimd/explainer.git ~/.claude/skills/explainer
```

Then, in Claude Code:

```text
/explainer how Raft elects a leader, and what happens when the leader crashes
```

You need Node.js 20.10+ for the checks and the build, and Chrome or Chromium for screenshots and video. There is nothing to `npm install`.

## Gallery

Every image is a frame of an example in [`examples/`](examples). Click one to open it live.

<table>
  <tr>
    <td width="50%"><a href="https://sites.irfanali.me/p/random/raft-consensus.html"><img src=".github/assets/hero.jpg" alt="Raft: five servers in a ring. The leader S1 has crashed and its accent glows red; the panel explains that nothing committed is lost because a majority already holds it."></a></td>
    <td width="50%"><a href="https://sites.irfanali.me/p/random/mapreduce-cluster.html"><img src=".github/assets/mapreduce.jpg" alt="MapReduce: three mappers holding coloured word records, two reducers receiving them through the shuffle, and an output store."></a></td>
  </tr>
  <tr>
    <td><b>Raft</b>: election, replication, a crashed leader, a network partition.</td>
    <td><b>MapReduce</b>: split, map, shuffle by <code>hash(word) % R</code>, reduce; a worker dies, a straggler, a hot key.</td>
  </tr>
  <tr>
    <td><a href="https://sites.irfanali.me/p/random/virtual-memory-page-walk.html"><img src=".github/assets/virtual-memory.jpg" alt="Virtual memory: a 48-bit address split into four coloured 9-bit indices, above a TLB and the four page-table levels being walked."></a></td>
    <td><a href="https://sites.irfanali.me/p/random/javascript-event-loop.html"><img src=".github/assets/event-loop.jpg" alt="The JavaScript event loop in the light theme: Web APIs, a task queue, a microtask queue, the call stack and a console."></a></td>
  </tr>
  <tr>
    <td><b>Virtual memory</b>: a TLB miss, a four-level page walk, a page fault.</td>
    <td><b>Event loop</b>: why a promise beats <code>setTimeout(0)</code>, and how microtasks can starve rendering.</td>
  </tr>
  <tr>
    <td><a href="https://sites.irfanali.me/p/random/consistent-hashing-ring.html"><img src=".github/assets/consistent-hashing.jpg" alt="Consistent hashing: keys on a hash ring coloured by the server that owns them; three keys move to a new server."></a></td>
    <td><a href="https://sites.irfanali.me/p/random/quicksort-partitioning.html"><img src=".github/assets/quicksort.jpg" alt="Quicksort in the light theme: nine tiles on a tray, the pivot highlighted, pointers i and j beneath."></a></td>
  </tr>
  <tr>
    <td><b>Consistent hashing</b>: add a server and 3 keys move; with <code>hash % N</code>, 14 of 16 would.</td>
    <td><b>Quicksort</b>: Lomuto partitioning, one comparison at a time, including the worst case.</td>
  </tr>
</table>

<p align="center"><img src=".github/assets/phone.jpg" width="280" alt="MapReduce on a phone: the stages stacked top to bottom above a compact control bar."><br><sub>Every page has a phone layout of its own.</sub></p>

## What a page gives you

- **Stories.** The normal run, then what breaks: a crash, a partition, a skewed key, the worst case. Switching jumps to where the stories split.
- **Chapters that wait for you.** The run pauses at the end of each chapter until you press *Continue*. A panel says, in plain words, what the chapter is doing.
- **Predictions.** At the interesting moments it asks what you think happens next, then shows you.
- **Rewind.** Drag the timeline anywhere, forwards or back. It is exact, not a replay.
- **Knobs.** Change the number of servers, the latency, the input. The simulation reruns instantly.
- **One file.** About 1 MB, offline, no server. Light and dark themes, phone and desktop. Video export (WebM) if you want it.

## How it works

```mermaid
flowchart LR
  A["/explainer prompt"] --> B["Claude writes figure.mjs:<br/>a small, real simulation<br/>narrated step by step"]
  B --> C["verify: every story,<br/>every knob extreme,<br/>invariants on every step"]
  C --> D["build: one HTML file<br/>(engine, fonts, styles inlined)"]
  D --> E["shoot: screenshots in both<br/>themes, desktop and phone,<br/>reviewed before delivery"]
```

A figure is a JavaScript module that runs the concept and narrates it through a small builder:

```js
s.spawn("rec7", { from: "m0", in: "m0", of: "record", text: "fox · 1", key: "fox" });
s.step("{ref:m0|map 0} emits `(fox, 1)`");
```

The figure owns the truth: the rules, the numbers and the invariants that must hold on every step. The engine owns everything else: layout, light, motion, camera and controls. That split is why every page shares one look, whatever you ask for, and why a figure can be tested like code.

| Folder | What's in it |
|---|---|
| [`sim/`](sim) | Seeded randomness, instrumented arrays and queues, a message-passing network with crashes and partitions, caches and page tables. |
| [`engine/`](engine) | The scene compiler and timeline, a WebGL 2 renderer (no libraries), the camera, and the controls. |
| [`scripts/`](scripts) | `new`, `verify`, `build`, `shoot`, `audit`, `record`. Node built-ins and headless Chrome only. |
| [`examples/`](examples) | Seven complete figures, including a B+ tree. Each has a README with its sources. |

The process Claude follows is in [`SKILL.md`](SKILL.md). The visual rules are in [`DESIGN.md`](DESIGN.md), and the builder API is in [`references/builder.md`](references/builder.md).

## Limits

- It is for computing concepts that have a mechanism to run, not for charts or for other sciences.
- Scenes are small on purpose: a handful of servers, a dozen keys. Scale is stated in words, not drawn.
- A good figure takes a real session (about 30–60 minutes), because it is checked and reviewed before you get it.
- Viewing a page needs a browser with WebGL 2.

## License

[MIT](LICENSE) © 2026 Irfan Ali. The bundled Geist fonts are under the [SIL Open Font License](assets/fonts/OFL.txt).
