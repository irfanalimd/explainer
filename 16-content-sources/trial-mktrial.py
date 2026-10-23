import sys, os, shutil, re
src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for f in ("figure.mjs", "lesson.mjs"):
    shutil.copy(os.path.join(src, f), os.path.join(dst, f))
lp = os.path.join(dst, "lesson.mjs"); s = open(lp).read()
s = s.replace("export const lesson = {", '''export const lesson = {
  sources: [
    { id: "dean2004", title: "MapReduce: Simplified Data Processing on Large Clusters", by: ["Jeffrey Dean", "Sanjay Ghemawat"],
      year: 2004, where: "OSDI", url: "https://www.usenix.org/legacy/event/osdi04/tech/full_papers/dean/dean.pdf",
      supports: ["the word-count example (§2.1)", "re-executing a dead worker's tasks (§3.3)", "backup tasks for stragglers (§3.6)", "the 2,000-machine job (§3.5)"] },
    { id: "hadoop-tutorial", title: "MapReduce Tutorial", by: "The Apache Software Foundation", short: "Hadoop docs", year: "n.d.",
      where: "Apache Hadoop", url: "https://hadoop.apache.org/docs/stable/hadoop-mapreduce-client/hadoop-mapreduce-client-core/MapReduceTutorial.html",
      supports: ["WordCount, the program Hadoop teaches first"] },
  ],''', 1)
n = 0
def sub(m):
    global n
    n += 1
    return 'source: "[dean2004] §3.%d"' % (1 + (n % 5))
s = re.sub(r"source: PAPER", sub, s)
open(lp, "w").write(s)
fp = os.path.join(dst, "figure.mjs"); f = open(fp).read()
f = f.replace('cite: { text: "Dean & Ghemawat, OSDI 2004", url: "https://research.google/pubs/pub62/" },', 'cite: "[dean2004]",')
f = f.replace('"Dean & Ghemawat, OSDI 2004, §3.5"', '"[dean2004] §3.5"')
open(fp, "w").write(f)
print("sources replaced:", n)
