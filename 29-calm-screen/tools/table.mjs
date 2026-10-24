import { readFileSync, existsSync } from "node:fs";
const G = "/home/ubuntu/tmp/explainer-perf/guide/calm-shots";
const rows = ["| Page | Size | Moment | Controls | Text in full ink | Words |", "|---|---|---|---|---|---|"];
for (const theme of ["light", "dark"]) for (const e of ["mapreduce", "raft", "event-loop"]) for (const s of ["1440x900", "390x844"]) {
  const f = (v) => `${G}/${v}/${e}-${s}-${theme}.json`;
  if (!existsSync(f("base")) || !existsSync(f("after"))) continue;
  const B = JSON.parse(readFileSync(f("base"))), A = JSON.parse(readFileSync(f("after")));
  for (const m of ["open", "mid", "playing", "end"]) {
    if (!B[m] || !A[m]) continue;
    const c = (k) => (B[m][k] === A[m][k] ? `${A[m][k]}` : `${B[m][k]} → **${A[m][k]}**`);
    rows.push(`| ${e}${theme === "dark" ? " (dark)" : ""} | ${s} | ${m} | ${c("controls")} | ${c("loud")} | ${c("words")} |`);
  }
}
console.log(rows.join("\n"));
