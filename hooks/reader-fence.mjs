#!/usr/bin/env node
// PreToolUse fence for the explainer review agents (docs/next/research/pipeline.md §4.4).
// The readers and the scorer judge what a reader gets, so they may read only the review packet.
// The authors (curriculum-designer, teacher) may not read the packet, the canaries or the benchmark.
// Every other agent, and the main session, passes through untouched.

import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

const FENCED = /^explainer:(novice-reader|expert-reader|scorer)$/;
const AUTHOR = /^explainer:(curriculum-designer|teacher)$/;
// Built pages and the repo embed the lesson's source; the expert may not fetch them.
const OWN_SOURCE = /(^|\/\/|\.)(github\.com\/irfanalimd|raw\.githubusercontent\.com\/irfanalimd|sites\.irfanali\.me)/i;

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // not hook input we understand; never block a normal session
}

const agent = input.agent_type ?? "";
const tool = input.tool_name;
const args = input.tool_input ?? {};

function real(p) {
  const abs = resolve(input.cwd ?? process.cwd(), p);
  try { return realpathSync(abs); } catch { return abs; }
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }));
  process.exit(0);
}

if (AUTHOR.test(agent)) {
  const p = args.file_path ?? args.path;
  if (["Read", "Grep", "Glob"].includes(tool) && typeof p === "string" && p) {
    const path = real(p);
    if (/[\\/](bench|review[\\/]packet)([\\/]|$)|canary\.json$/.test(path)) {
      deny("Authors don't read the review packet, the canaries or the benchmark. Work from lesson.mjs, the run and the findings the lead gives you.");
    }
  }
  process.exit(0);
}
if (!FENCED.test(agent)) process.exit(0);

const role = agent.slice("explainer:".length);

function readAllowed(p) {
  if (typeof p !== "string" || !p) return false;
  const path = real(p);
  if (path.includes(`${sep}review${sep}packet${sep}`)) return true;
  if (role === "scorer") {
    if (/[\\/]review[\\/]round-\d+[\\/]findings\.json$/.test(path)) return true;
    const root = process.env.CLAUDE_PLUGIN_ROOT;
    if (root && path.startsWith(real(resolve(root, "bench", "calibration")) + sep)) return true;
  }
  return false;
}

let ok = false;
if (tool === "Read") ok = readAllowed(args.file_path);
else if (role === "expert-reader" && tool === "WebFetch") ok = !OWN_SOURCE.test(String(args.url ?? ""));
else if (role === "expert-reader" && tool === "WebSearch") ok = !/irfanalimd|irfanali\.me/i.test(String(args.query ?? ""));

if (ok) process.exit(0);

deny(
  "Readers see only the review packet. Read the files listed in review/packet/index.md, in order." +
  (role === "expert-reader" ? " Check facts against primary sources on the web, not the lesson's own pages or repo." : ""),
);
