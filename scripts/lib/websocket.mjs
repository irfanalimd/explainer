// Node 20 and 21 keep the built-in WebSocket behind --experimental-websocket (Node 22.4+ has it on by default).
// The browser scripts talk to Chrome over it, so they import this first: without a WebSocket it re-runs the same
// command with the flag and exits with the child's status. Import it before anything with side effects.
import { spawnSync } from "node:child_process";

if (typeof globalThis.WebSocket === "undefined" && !process.execArgv.includes("--experimental-websocket")) {
  const r = spawnSync(process.execPath, ["--experimental-websocket", "--no-warnings", ...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
