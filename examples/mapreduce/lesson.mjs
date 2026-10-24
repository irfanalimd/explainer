// The words the MapReduce figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure owns
// every fact and passes it as a var; nothing here computes. Every line stays true at every knob value (1–6 readers,
// 1–4 counters, the combiner on or off, any input text). Paper references are to Dean & Ghemawat, OSDI 2004.
//   run-wide vars: n, M, R, per, biggest, distinct, text, top, topN, combiner, splitIds, mapIds, shuffleBytes (from the shuffle on)
//   split:         pieces (each piece's words, as split chips)
//   map steps:     map, mapId, count, slip (a read); dups, before, after, sends (a combine)
//   crash:         map, mapId, upto, total; helper, helperId, split, splitId, lost
//   straggler:     map, mapId, done, total, split, splitId; helper, helperId, had, more, short (0: slow.tie)
//   shuffle:       w, count, red, redId, slipId, rem, h (the word's hash), eq, from, load, moved, slips; firstRed, otherRed (a repeat)
//   a wrong pick:  the shuffle's vars plus picked, pickedId; rest (choose.rest); here, there, total (choose.split)
//   end check:     R, M (this run's) and R2, w, rem2, red2 (check.hash); M2, n, big2 (check.split); w, distinct (check.totals)
//   reduce:        red, redId, got, sums, sumIds, totals, all (every total), ones (words seen once);  output: red, redId, totals, part
//   skew end:      hot, hotId, load, moved, share, sent, hotC
//   scale shot:    machines, paperM, paperR (the paper's figures, §3.5), runMachines (this run's M + R)
// A layer that states a fact about real systems names its source in `deeper.source` as [id] plus a locator; the ids are
// `lesson.sources`. Quotes and figures were checked against the paper's USENIX HTML edition.

export const lesson = {
  sources: [
    { id: "dean2004", title: "MapReduce: Simplified Data Processing on Large Clusters", by: "J. Dean, S. Ghemawat", year: 2004,
      where: "OSDI 2004", url: "https://research.google/pubs/pub62/",
      supports: "word count (§2.1, Appendix A), URL access counts (§2.3), splits of 16–64 MB (§3.1), the master and re-execution (§3.3), GFS's 3 copies and locality (§3.4), M = 200,000, R = 5,000 on 2,000 machines (§3.5), backup tasks and the 30 → 1 MB/s disk (§3.6), partitioning and ordering (§4.1, §4.2), combiners and Zipf (§4.3), the 44% sort result (§5.3), Table 1" },
    { id: "hadoop-mapred", short: "Hadoop mapred-default.xml", title: "mapred-default.xml", by: "Apache Hadoop", year: 2024, where: "Hadoop MapReduce documentation",
      url: "https://hadoop.apache.org/docs/stable/hadoop-mapreduce-client/hadoop-mapreduce-client-core/mapred-default.xml",
      supports: "speculative execution on by default and its 10% cap; mapreduce.am.max-attempts" },
    { id: "hadoop-committers", short: "Hadoop S3A committers", title: "Committing work to S3 with the S3A committers", by: "Apache Hadoop", year: 2024, where: "Hadoop-AWS documentation",
      url: "https://hadoop.apache.org/docs/stable/hadoop-aws/tools/hadoop-aws/committers.html",
      supports: "output committers, the v1 and v2 algorithms, and why object stores need their own" },
    { id: "spark-config", short: "Spark configuration", title: "Spark Configuration", by: "Apache Spark", year: 2024, where: "Spark documentation",
      url: "https://spark.apache.org/docs/latest/configuration.html",
      supports: "spark.speculation off by default; the external shuffle service" },
    { id: "spark-rdd", short: "Spark RDD guide", title: "RDD Programming Guide", by: "Apache Spark", year: 2024, where: "Spark documentation",
      url: "https://spark.apache.org/docs/latest/rdd-programming-guide.html",
      supports: "reduceByKey combines on the map side and spills its tables to disk; prefer it to groupByKey" },
    { id: "white2015", title: "Hadoop: The Definitive Guide, 4th edition", by: "T. White", year: 2015, where: "O'Reilly",
      url: "https://www.oreilly.com/library/view/hadoop-the-definitive/9781491901687/",
      supports: "combiner functions (ch. 2), the shuffle and sort, with each map's output in one partitioned file (ch. 7), input splits and records across blocks (ch. 8)" },
    { id: "python-hashseed", short: "Python docs, PYTHONHASHSEED", title: "Command line and environment: PYTHONHASHSEED", by: "Python Software Foundation", year: 2024, where: "Python documentation",
      url: "https://docs.python.org/3/using/cmdline.html#envvar-PYTHONHASHSEED",
      supports: "str hashes are salted per process unless PYTHONHASHSEED is set" },
  ],

  goal: "Count every word in a text exactly, using machines that each read only part of it.",
  // `stories`: the stories that teach an objective; the end card's "You can now…" lists only those (all when absent)
  objectives: [
    { id: "o-split", text: "Explain why the text is cut into pieces that machines read at the same time, and what that saves.", stories: ["happy", "skew"] },
    { id: "o-hash", text: "Explain why every copy of a word has to reach the same counter, and how a hash makes that happen without the machines asking each other." },
    { id: "o-reduce", text: "Say what a counting machine writes at the end, which is one total for each different word it was sent.", stories: ["happy"] },
    { id: "o-crash", text: "Explain why a reading task can safely run again after a crash, even one that had already finished.", stories: ["crash"] },
    { id: "o-slow", text: "Explain why a backup copy of a slow piece is safe, and why the slips of only one copy may count.", stories: ["straggler"] },
    { id: "o-skew", text: "Explain why a word on most lines overloads one counter, and why adding up repeats early helps where more machines or a backup would not.", stories: ["skew"] },
  ],

  misconceptions: [
    { id: "m-central", wrong: "Each machine counts its own piece, and one machine adds everything up at the end.", fix: "Then that one machine would have to add up every slip in the job. MapReduce shares out the adding as well. All the slips for a word meet on one counter, and different words go to different counters." },
    { id: "m-even", wrong: "It's best to spread the slips evenly over the counters.", fix: "Then copies of the same word would end up on different counters, and no counter would have that word's full count." },
    { id: "m-one", wrong: "A counting machine adds all its slips into one number.", fix: "It keeps each word separate and adds up that word's slips, so it ends with one total for each different word it holds." },
    { id: "m-lost", wrong: "A crashed machine's words are lost, so the count comes out short.", fix: "Its piece of the text is still in the input, and reading it again produces the same slips." },
    { id: "m-restart", wrong: "One failure restarts the whole job.", fix: "Only the tasks that were on the failed machine run again. Every other machine keeps its work." },
    { id: "m-done", wrong: "Once a reading task has finished, its work is safe even if the machine dies later.", fix: "Its slips were stored on that machine's own disk, so they die with it, and the piece has to be read again." },
    { id: "m-wait", wrong: "The job has no choice but to wait for its slowest machine.", fix: "The master can start a backup copy of the slow piece on a free machine. Both copies write the same slips, and whichever finishes first is kept." },
    { id: "m-skip", wrong: "Skipping a slow piece is a fair price for finishing on time.", fix: "Then the words in that piece would never be counted. MapReduce won't give up a correct count to save time." },
    { id: "m-both", wrong: "Keeping both copies' slips does no harm, because the extra copy is only a spare.", fix: "Both copies wrote slips for the same words, so keeping both would count those words twice." },
    { id: "m-more", wrong: "More counting machines would spread out the copies of one common word.", fix: "The hash sends every copy of a word to the same counter however many counters there are. Adding counters only moves the other words around." },
    { id: "m-backup", wrong: "A backup copy splits a busy machine's work in half.", fix: "A backup does the whole task again from the same input. That helps when a machine is slow, but a big pile of work is just as big the second time." },
    { id: "m-readers", wrong: "More reading machines would share out a common word's slips.", fix: "The counter is chosen from the word alone, so every copy still goes to the same counter however many machines do the reading." },
    { id: "m-combine", wrong: "Adding up repeats early changes the counts.", fix: "An early slip carries the number it stands for, and the counter adds those numbers, so the total comes out the same." },
  ],

  picture: {
    name: "a library counted by a team",
    rows: [
      { id: "master", picture: "the coordinator who hands out the shelves", real: "the master", term: "master" },
      { id: "split", picture: "one shelf of books", real: "one piece of the text, called a split", term: "split" },
      { id: "mapper", picture: "a helper tallying the words on their shelf", real: "a reading machine, called a mapper", term: "mapper" },
      { id: "slip", picture: "a tally slip that says “fox: 1”", real: "a record `(fox, 1)`, which holds the word and the number 1" },
      { id: "hash", picture: "the rule that all slips for one word go to the same person", real: "a fixed calculation on the word's letters, called a hash, that picks one counting machine", term: "hash" },
      { id: "reducer", picture: "the person who adds up the slips", real: "a counting machine, called a reducer", term: "reducer" },
      { id: "output", picture: "the noticeboard where the totals go up", real: "the output, a folder with one file per counting machine" },
    ],
    breaks: "In a real library the helpers would talk to each other to agree on who counts which word. The machines never do. Each one runs the same calculation on the word and gets the same answer, so they agree without asking.",
  },

  // after the last story: the lessons this one leads into (the gallery's published pages)
  next: [
    { title: "Consistent hashing", href: "https://sites.irfanali.me/p/learning/consistent-hashing-ring.html",
      why: "Here `hash % R` chose each word's counter. If you added one more counter, most words would move to a different one. A hash ring moves only a few of them." },
    { title: "Raft", href: "https://sites.irfanali.me/p/learning/raft-consensus.html",
      why: "The master here has no backup. If it dies, the whole job stops and has to run again. Raft lets a group of machines agree with each other, so losing one of them doesn't stop the work." },
  ],

  terms: {
    master: { lead: "the coordinator", def: "The machine that hands out pieces of work, keeps track of who has what, and notices when a machine fails." },
    split: { lead: "one piece of the text", def: "One piece of the input. One machine reads it, the way one helper takes one shelf of a library." },
    mapper: { lead: "a reading machine", def: "A machine running map. It reads its piece and writes a slip such as (fox, 1) for every word." },
    combiner: { lead: "adding up early", def: "Code on a reading machine that adds up repeated words before any of its slips are sent." },
    hash: { lead: "a word's fixed number", def: "A calculation that turns a word into a large number. The same word always gives the same number." },
    shuffle: { lead: "sending each slip to its counter", def: "The stage where every slip travels to the machine that adds up its word." },
    reducer: { lead: "a counting machine", def: "A machine running reduce. It adds up all the slips for the words it was given." },
    straggler: { lead: "a slow machine", def: "A machine so much slower than the rest that everyone ends up waiting for it." },
  },

  chapters: {
    split: {
      teach: { prompt: "Before it runs: if three people split the counting of one library between them, what could go wrong with the total?", listen: "A word could be counted twice, or missed, where two pieces meet. Here every word sits in exactly one piece, so neither can happen.", minutes: 3 },
      about: "One person counting every word in a library would take ages, so a coordinator, the {term:master}, gives each helper one shelf. In MapReduce a shelf is a {term:split}, one piece of the text.",
      "about@skew": "This story runs the same job on a web log. Each line is one request, and its status code says how it went (200 is OK, 404 is not found). The {term:master} hands each machine one {term:split} of the log.",
      enter: { sofar: "On one machine this is easy. A loop reads each word and adds 1 to its count in a dictionary.", now: "Now the text is cut into pieces, one for each machine. “The picture” below shows which part of the library stands for which part of the system.", done: "Every word is in exactly one piece.", picture: true },
      "enter@skew": { sofar: "On one machine this is easy. A loop reads each line and adds 1 to that code's count in a dictionary.", now: "Now the log is cut into pieces, one for each machine.", done: "Every line is in exactly one piece.", picture: true },
    },
    map: {
      teach: { prompt: "Why can every reading machine start at once, without waiting for the others?", listen: "Each map task needs only its own piece, and nothing is added up yet. Listen for “one machine adds it all up at the end”, because the shuffle answers that idea next.", minutes: 3 },
      "teach@crash": { prompt: "A machine has crashed. Before anyone answers the question on screen, ask the room whether its part of the count is gone for good.", listen: "Its text is still in the shared input, so the master hands the piece out again. Listen for “the count comes out short” and “the whole job starts over”.", minutes: 4 },
      "teach@straggler": { prompt: "One machine is far behind. Should the job wait for it, skip it, or do something else?", listen: "A backup copy of the slow piece runs on a free machine, and whichever copy finishes first wins. Skipping it would leave its words uncounted.", minutes: 4 },
      about: "Next, each reading machine, a {term:mapper}, goes through its own piece and writes a slip like `(word, 1)` for every word, meaning “I saw this word once.” The machines work at the same time, and none waits for another.",
      "about@skew": "Next, each reading machine, a {term:mapper}, goes through its piece of the log and writes a slip like `(code, 1)` for every line. The machines work at the same time, and none of them waits for another.",
      "about@crash": "Each reading machine, a {term:mapper}, writes its slips, such as `(word, 1)`, to its own local disk, and the counting machines fetch them from there later. In this story one machine dies partway through its piece.",
      "about@straggler": "Each reading machine, a {term:mapper}, writes a slip for every word. In this story one of them has a failing disk and falls far behind the others. A machine like that is called a {term:straggler}.",
      enter: { sofar: "The text is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, one slip per word.", done: "Every word in the text has become a `(word, 1)` slip on one of the machines." },
      "enter@skew": { sofar: "The log is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, one slip per line.", done: "Every line of the log has become a `(code, 1)` slip on one of the machines." },
      "enter@crash": { sofar: "The text is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, and partway through, one of them crashes.", done: "Even so, every word ends up as exactly one slip that counts." },
      "enter@straggler": { sofar: "The text is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, but one of them has a failing disk.", done: "Every word ends up with exactly one slip that counts, including the words in the slow piece." },
    },
    shuffle: {
      teach: { prompt: "Why not deal the slips out evenly, like cards, so every counter gets the same amount?", listen: "Copies of one word would land on different counters, and no counter could give that word's full count. The hash sends every copy to the same counter without any machine having to ask another.", minutes: 5 },
      "teach@skew": { prompt: "Almost every line has the same code. Where will all those slips go, and what does that do to one machine?", listen: "Every copy goes to the one counter its hash picks. The count stays exact, but that counter does most of the work. Adding up repeats first makes its pile smaller.", minutes: 5 },
      about: "In {term:shuffle|the shuffle}, every slip travels to one counting machine. A {term:hash} turns the word into a number. Divide that by the number of counters, here {R}, and the remainder is the number of the counter the slip goes to.",
      "about@skew": "In {term:shuffle|the shuffle}, each slip goes to the counting machine its {term:hash} picks. {top} fills {topN} of the {n} lines, so where its slips go decides how busy each counter will be.",
      enter: { sofar: "Every word is now a `(word, 1)` slip, sitting on one of the reading machines.", now: "Each slip is sent to one of the {count:R|counting machine}.", done: "Every slip has reached a counting machine, and you can say why it went to that one." },
      "enter@skew": { sofar: "Every line is now a `(code, 1)` slip, sitting on one of the reading machines.", now: "Each slip is sent to one of the {count:R|counting machine}.", done: "Every slip has reached a counting machine, and you can say why it went to that one." },
    },
    reduce: {
      teach: { prompt: "Why sort the slips before adding them up, when a dictionary would do?", listen: "Once they're sorted, equal words sit next to each other, so a single pass can add them up, even when the slips don't fit in memory.", minutes: 2 },
      about: "Each counting machine, a {term:reducer}, first sorts its slips so that copies of the same word end up side by side. Then it goes down the list and adds up each group into one total.",
      "about@skew": "Each counting machine, a {term:reducer}, first sorts its slips so that copies of the same code end up side by side. Then it goes down the list and adds up each group into one total.",
      enter: { sofar: "All the slips for any one word are now on the same counting machine.", now: "Each counter adds up the words it was sent.", done: "Each counter has one total for every different word it was sent." },
      "enter@skew": { sofar: "All the slips for any one code are now on the same counting machine.", now: "Each counter adds up the codes it was sent.", done: "Each counter has one total for every different code it was sent." },
    },
    output: {
      teach: { prompt: "Point at any total in the output. How do we know no other counter holds part of it?", listen: "The hash sent every copy of that word to one counter, so its total is the full count. Every what-if story tests exactly this.", minutes: 3 },
      about: "Each counter writes its totals to the shared output, like pinning a list to a noticeboard. Between them, the lists hold exactly one count for every different word in the text.",
      "about@skew": "Each counter writes its totals to the shared output, like pinning a list to a noticeboard. Between them, the lists hold exactly one count for every status code in the log.",
      enter: { sofar: "Each counter has one total for every word it was sent.", now: "Every counter writes its totals to the shared output.", done: "The output holds one count for each of the {distinct} different words." },
      "enter@skew": { sofar: "Each counter has one total for every code it was sent.", now: "Every counter writes its totals to the shared output.", done: "The output holds one count for each of the {distinct} different codes." },
    },
  },

  steps: {
    // ---- Split ----
    "split.problem": {
      key: true,
      plain: "We'll count the {n} words in “{text}”.",
      "plain@skew": "We'll count each status code in a web log of {n} requests.",
      why: "One machine on its own would read all {n} words, one after another. With {M} machines sharing them, no machine reads more than {biggest}.",
      "why@skew": "It's the same job as counting words, with status codes in place of words. With {M} machines sharing the log, no machine reads more than {biggest} lines.",
      look: ["input"],
      deeper: {
        cost: "On one machine that is {n} reads, one after another. Shared among {M} machines, the reading takes only as long as the biggest piece, which is {biggest} reads.",
        real: "Word count is the paper's own first example (§2.1), and the full program is in its Appendix A. Real input is cut into pieces of 16 to 64 MB (§3.1). Google often ran jobs with M = 200,000 map tasks on 2,000 machines, so each machine read many pieces in turn (§3.5).",
        source: "[dean2004] §2.1, §3.1, §3.5",
      },
      "deeper@skew": {
        cost: "On one machine that is {n} reads, one after another. Shared among {M} machines, the reading takes only as long as the biggest piece, which is {biggest} reads.",
        real: "The paper's second example is this same job. Map reads a log of web page requests and writes `(URL, 1)`, and reduce adds up the 1s for each URL (§2.3). This story counts status codes instead of URLs.",
        source: "[dean2004] §2.3",
      },
    },
    "split.alone": {
      plain: "There are {n} words to count, and a single machine reads every one of them.",
      "plain@skew": "We'll count each status code in a web log of {n} requests.",
      why: "With only one machine there is nothing to share yet. Turn up “Reading machines” to split the work.",
      look: ["input"],
    },
    "split.cut": {
      key: true,
      plain: "The master cuts the text into {M} pieces of about {per} words and gives one to each machine.",
      "plain@skew": "The master cuts the log into {M} pieces of about {per} lines and gives one to each machine.",
      why: "The pieces are {pieces}. Each piece can be read without looking at the others, so all {M} machines can start at the same moment.",
      look: ["{splitIds}"], picture: "split",
      deeper: {
        how: "Every record, here a word or a line, belongs to exactly one piece. A piece may be read twice, by a re-run or a backup, but only one reading counts. The paper's text reader cuts only at line boundaries (§4.4). Hadoop cuts by bytes instead, so every reader except the first skips everything up to its first line break, and each reads past its end to finish the last line it started. That way every line belongs to exactly one reader. The master also prefers to run each piece on a machine that already stores a copy of it, so most input is read from local disk rather than over the network (§3.4).",
        source: "[dean2004] §3.4, §4.4; [white2015] ch. 8",
      },
    },
    "split.one": {
      plain: "With one machine there is only one piece, holding all {n} words.",
      "plain@skew": "With one machine there is only one piece, holding all {n} lines.",
      look: ["{splitIds}"], picture: "split",
    },

    // ---- Map ----
    "map.handout": {
      plain: "Each machine collects its piece from the shared input, and all {M} start at once.",
      look: ["{mapIds}"],
    },
    "map.handout-one": {
      plain: "The master hands the machine its piece.",
      look: ["{mapIds}"],
    },
    "map.read": {
      first: {
        key: true,
        why: "Map doesn't add anything up yet. It only tags each word with a 1, because the adding has to wait until all the slips for a word are in one place.",
        "why@skew": "Map tags each line with a 1, even when the code repeats, so every {slip} is a slip of its own.",
        picture: "slip",
        deeper: {
          how: "A real mapper collects its slips in memory, then writes them to its own local disk, divided into R regions, one for each reduce task ({R} here, one per counting machine; Hadoop keeps them as parts of one indexed file). It then tells the master where the files are (§3.1).",
          code: "`emit(word, 1)` (lines 1–3)",
          source: "[dean2004] §3.1; [white2015] ch. 7",
        },
      },
      plain: "{map} writes one slip for each of its {count:count|word}, such as {slip}.",
      "plain@skew": "{map} writes one slip for each of its {count:count|line}, such as {slip}.",
      look: ["{mapId}"],
    },
    // only with your own input shorter than the mappers (e.g. "a b" on 6); verify's knob runs keep the default text
    "map.empty": {
      plain: "{map} was given an empty piece, so it finishes straight away.",
      why: "There are more machines than words to share.",
      "why@skew": "There are more machines than lines to share.",
      look: ["{mapId}"],
    },
    "map.combine": {
      first: {
        key: true,
        why: "This means fewer slips cross the network, and the counts don't change, because adding gives the same total wherever it happens.",
        deeper: {
          how: "The paper calls this a combiner. It is usually the same code as reduce, run on each mapper's own slips, and it is meant for a reduce that is commutative and associative, which means order and grouping don't change the result, as with a sum (§4.3). An average can't be combined this way, because the average of two averages is wrong unless each part carries its count.",
          code: "`emit(word, sum(counts))` (lines 5–6)",
          source: "[dean2004] §4.3",
        },
      },
      plain: "{map} runs a {term:combiner} first, so its {count:before|slip} for {dups} become {after}.",
      look: ["{mapId}"],
    },

    // ---- a machine crashes ----
    "crash.start": {
      plain: "{map} starts on its piece, writing a slip for each word.",
      "plain@skew": "{map} starts on its piece, writing a slip for each line.",
      look: ["{mapId}"],
    },
    "crash.down": {
      key: true,
      plain: "{map} {tone:fail|crashes} after {upto} of {total} words, and its {count:upto|slip} {be:upto} lost with it.",
      "plain@skew": "{map} {tone:fail|crashes} after {upto} of {total} lines, and its {count:upto|slip} {be:upto} lost with it.",
      why: "Those slips were stored on its own disk, so they died with the machine. The grey slips marked “lost” no longer count.",
      look: ["{mapId}"],
      deeper: {
        how: "The master pings every worker regularly, and a worker that stops answering is marked as failed (§3.3). In Hadoop a finished map can also be re-run while its machine is still up. If counters keep failing to fetch its slips, they report it, and the master runs the map again.",
        edge: "Even finished map tasks on a dead machine run again, because their slips were on its local disk. Finished reduce tasks don't, because their output is already in the shared file system (§3.3). Hadoop re-runs finished maps only while some reduce still needs their slips. Spark with its external shuffle service keeps a dead worker's map output, so only losing the whole host forces a re-run.",
        real: "The master itself has no such protection. In the paper, if the master dies the job is aborted, and the client can notice and retry it if it wants. The paper notes that master checkpoints would be easy to add (§3.3). Hadoop on YARN restarts a job's master, its ApplicationMaster (mapreduce.am.max-attempts), and can recover the tasks that were already done.",
        source: "[dean2004] §3.3; [hadoop-mapred]; [spark-config]",
      },
    },
    "crash.restart": {
      plain: "No other machine is free, so the master restarts {map}.",
      why: "A task can run on any machine, including the one that failed, once it is back up.",
      look: ["{mapId}"],
    },
    "crash.rerun": {
      key: true,
      plain: "{helper} is free, so the master gives it {split}, whose text is still in the input.",
      why: "The input is stored in several copies on different machines, so a crash loses work but never the text itself.",
      look: ["{splitId}", "{helperId}"],
      deeper: {
        how: "The failed machine's tasks are handed out again, and any counter that hasn't fetched its slips yet is told to fetch them from the re-run instead (§3.3).",
        real: "Real input lives in GFS, which keeps several copies of every 64 MB block, usually 3, on different machines. The master likes to run a map next to one of those copies, so the dead machine often held a copy too, but the others survive (§3.4).",
        source: "[dean2004] §3.3, §3.4",
      },
    },
    "crash.reread": {
      plain: "{helper} reads {split} again and writes the same {count:total|slip}.",
      why: "Map looks at nothing but the text, so the same piece always gives the same slips, and the counts stay exact.",
      look: ["{helperId}"],
      deeper: {
        edge: "This only works because map is deterministic. If map used randomness or the clock, a re-run could write different slips, and the paper then promises only weaker guarantees (§3.3).",
        how: "A map task's slips count only after its machine reports “done” to the master, along with the names of its files. The crashed copy never reports, so its half-written slips are never handed to a counter. If two copies both report, the master ignores the second one (§3.3).",
        source: "[dean2004] §3.3",
      },
    },

    // ---- a machine is slow ----
    "slow.disk": {
      key: true,
      plain: "{map}'s failing disk keeps retrying its reads, and so far it has written {done} of {total} slips.",
      why: "The counting can't finish until every piece has been read, so this one slow machine is holding up the whole job.",
      look: ["{mapId}"],
      deeper: {
        real: "The paper's own example is a disk with frequent correctable errors, which slows its reads from 30 MB/s to 1 MB/s (§3.6).",
        source: "[dean2004] §3.6",
      },
    },
    "slow.wait": {
      plain: "With no other machine to run a backup, the job has to wait for all {count:total|word}.",
      why: "A backup needs a second machine. With only one, the slowest disk sets the pace.",
      look: ["{mapId}"],
    },
    "slow.backup": {
      key: true,
      plain: "{helper} is free, so the master starts a {tone:busy|backup} copy of {split} on it.",
      why: "Both copies read the same piece and write the same slips, so the master can keep whichever one finishes first.",
      look: ["{helperId}", "{splitId}"],
      deeper: {
        how: "The master starts backups only when the job is close to done, and only for the tasks still running. That costs only a few percent more machine time (§3.6).",
        cost: "In the paper's sort benchmark, turning backups off made the job take 44% longer (§3.6, §5.3).",
        real: "Hadoop calls this speculative execution and turns it on by default for both map and reduce tasks (mapreduce.map.speculative, mapreduce.reduce.speculative). Spark has it off by default (spark.speculation).",
        source: "[dean2004] §3.6, §5.3; [hadoop-mapred]; [spark-config]",
      },
    },
    "slow.race": {
      plain: "Both copies run at once. The backup writes its {count:total|slip} while {map} manages only {more} more.",
      look: ["{helperId}", "{mapId}"],
    },
    "slow.tie": {
      plain: "Both copies finish, so the master keeps the backup's slips and throws away {map}'s.",
      why: "If both copies counted, every word in {split} would be counted twice, so only one copy's slips are kept.",
      look: ["{mapId}"],
    },
    "slow.win": {
      plain: "The backup finishes first, so the master stops {map} with {short} of its {total} words still unread.",
      why: "If both copies counted, every word in {split} would be counted twice, so the slow copy's slips are thrown away.",
      look: ["{mapId}"],
      deeper: {
        edge: "The paper only says the task is marked done when either copy finishes. Stopping the slower copy, as this run does, is what Hadoop does. The paper also starts backups when the whole job is nearly done, while this run starts one once the other map tasks are done. Hadoop can start backups at any point in the job, separately for map and reduce tasks, for the attempts it estimates will finish latest, up to a cap (by default 10% of running tasks; mapred-default.xml, mapreduce.job.speculative.speculative-cap-running-tasks).",
        source: "[dean2004] §3.6; [hadoop-mapred]",
      },
    },

    // ---- Shuffle ----
    "shuffle.first": {
      key: true,
      plain: "{w} goes to {red}. Its hash is {h}, and dividing by {R} leaves {rem}.",
      why: "If the slips were dealt out in turn like cards, copies of the same word would land on several counters. The counters never compare notes, so none of them could give that word's total.",
      "why@skew": "If the slips were dealt out in turn like cards, copies of the same code would land on several counters. The counters never compare notes, so none of them could give that code's total.",
      look: ["{slipId}", "{redId}"], picture: "hash",
      deeper: {
        how: "Each mapper has already divided its slips into {R} regions, one per reduce task, and each counter fetches its own region from every mapper. The fetching starts early, because the master passes on each finished map's file locations as they come in (§3.2). Only the final sort and the adding wait for the last map, since it might still hold a slip they need. Hadoop sorts each map's slips on the map side and merges the sorted runs as they arrive.",
        cost: "In this model {shuffleBytes} bytes cross the network, counting each slip's word plus a 4-byte count. Real formats add length headers, and a reader on the counter's own machine sends nothing over the network. In the paper's clusters, network bandwidth was the scarce resource (§3.4).",
        edge: "Python's built-in hash() of a string changes from one process to the next (hash randomization) unless PYTHONHASHSEED is fixed, and it can differ between Python versions, so two machines could disagree about a word. Real jobs use a hash with a fixed definition, and this run uses FNV-1a.",
        real: "`hash(key) mod R` is only the paper's default partitioning function, and a job can supply its own. For example, `hash(Hostname(urlkey)) mod R` puts every page of one website in the same output file (§4.1). Within one counter, keys are handed to reduce in increasing order, which is why each output file comes out sorted (§4.2).",
        code: "`hash(word) % R` (lines 8–9)",
        source: "[dean2004] §3.2, §3.4, §4.1, §4.2; [python-hashseed]",
      },
    },
    "shuffle.again": {
      key: true,
      plain: "{w} from {from} goes to {red} too, because the same word always has the same hash.",
      "plain@skew": "{w} from {from} goes to {red} too, because the same code always has the same hash.",
      why: "The hash looks only at the letters of the word, so every copy ends up on the same counter, no matter which machine read it.",
      "why@skew": "The hash looks only at the characters of the code, so every copy ends up on the same counter, no matter which machine read it.",
      look: ["{slipId}", "{redId}"],
    },
    "shuffle.send": {
      first: {
        why: "A counter receives many different words, and it keeps a separate count for each one.",
        "why@skew": "A counter receives many different codes, and it keeps a separate count for each one.",
      },
      plain: "{w} from {from} goes to {red} because {eq}.",
      "plain@skew": "{w} goes to {red} ({eq}), which now holds {count:load|slip} to the others' {rest}.",
      look: ["{slipId}", "{redId}"],
    },

    // ---- your turn: a wrong pick in the shuffle, played out (s.choose "shuffle.which") ----
    "choose.sent": {
      plain: "{w} goes to {picked}, the counter you chose.",
      look: ["{slipId}", "{pickedId}"],
    },
    "choose.rest": {
      plain: "The other {count:rest|slip} go wherever their hash sends them.",
      look: ["{redId}"],
    },
    "choose.split": {
      key: true,
      plain: "Now {red} counts {w} = {here} and {picked} counts {w} = {there}, but the text has {total}.",
      "plain@skew": "Now {red} counts {w} = {here} and {picked} counts {w} = {there}, but the log has {total}.",
      why: "Each counter can only add up the slips it holds, so neither of them has the full count.",
      look: ["{redId}", "{pickedId}"],
    },

    // ---- Reduce ----
    "reduce.sort": {
      first: {
        key: true,
        why: "Once the copies are side by side, one pass down the list can add up each group, even when there are too many slips to fit in memory.",
        "why@skew": "Once the copies are side by side, one pass down the list can add up each group, even when there are too many slips to fit in memory.",
        picture: "reducer",
        deeper: {
          how: "A dictionary of counts works as long as every different word fits in memory. The paper's reducer sorts by key instead, using a sort on disk when the data doesn't fit, and then adds in one pass (§3.1). That also makes each output file come out sorted (§4.2). Hadoop does most of the sorting on the map side, and its reducer merges the sorted runs. For reduceByKey, Spark instead adds up in a hash table that spills sorted runs to disk. In this animation each beat swaps two slips.",
          code: "`reduce(word, counts)` (lines 11–12)",
          source: "[dean2004] §3.1, §4.2; [white2015] ch. 7; [spark-rdd]",
        },
      },
      plain: "{red} sorts its {count:got|slip} so that copies of the same word sit together.",
      "plain@skew": "{red} sorts its {count:got|slip} so that copies of the same code sit together.",
      look: ["{redId}"],
    },
    "reduce.sorted": {
      plain: "{red}'s {count:got|slip} arrive already in order.",
      look: ["{redId}"],
    },
    "reduce.empty": {
      plain: "{red} received no slips, so its output file stays empty.",
      why: "None of the words in this text hash to it.",
      "why@skew": "None of the codes in this log hash to it.",
      look: ["{redId}"],
    },
    "reduce.sum": {
      first: {
        key: true,
        why: "The hash sent every copy of these words here and nowhere else, so each total is the word's full count. The words seen only once keep their 1: {ones}.",
        "why@skew": "The hash sent every copy of these codes here and nowhere else, so each total is the code's full count. The codes seen only once keep their 1: {ones}.",
      },
      plain: "{red} adds up each group and gets {sums}.",
      why: "The words seen only once keep their 1: {ones}.",
      look: ["{sumIds}"],
    },
    // only when every word on a reducer repeats (your own input, e.g. "fox fox dog dog the the")
    "reduce.sum-all": {
      first: {
        key: true,
        why: "The hash sent every copy of these words here and nowhere else, so each total is the word's full count.",
        "why@skew": "The hash sent every copy of these codes here and nowhere else, so each total is the code's full count.",
      },
      plain: "{red} adds up each group and gets {all}.",
      look: ["{sumIds}"],
    },
    "reduce.single": {
      plain: "{red} has no repeated words, so each slip's 1 is already that word's total.",
      "plain@skew": "{red} has no repeated codes, so each slip's 1 is already that code's total.",
      look: ["{redId}"],
    },

    // ---- Output ----
    "output.write": {
      first: {
        why: "The output is a folder with one file per reduce task, which here means one per counter. This one is {part}.",
        picture: "output",
        deeper: {
          how: "Reduce output goes to the shared file system, so a finished reduce never runs again, even if its machine dies later. If a reduce task does run twice, as a backup or a re-run, each copy writes a private temporary file and then atomically renames it to the final name, so exactly one copy's file survives (§3.3). That needs a file system whose rename is atomic. Hadoop lets only one attempt of each task commit, through an output committer (atomic with the v1 algorithm on HDFS; v2 gives that up for speed), and on object stores without an atomic rename, such as S3, it needs special committers.",
          edge: "The name part-r-00000 is Hadoop's convention. In the paper the user names the files, and its word-count program writes /gfs/test/freq-00000-of-00100 and so on (§3.1, Appendix A).",
          source: "[dean2004] §3.3, Appendix A; [hadoop-committers]",
        },
      },
      plain: "{red} writes its {count:totals|total} to the output.",
      look: ["output"],
    },
    "output.done": {
      key: true,
      plain: "All {n} words are counted, {distinct} different ones, and no machine ever read the whole text.",
      why: "Each total is right because all the copies of a word met on the same counter, whichever machine read them. The other stories try to break that with a crash, a slow disk and a word on most lines.",
      look: ["output"],
      deeper: {
        cost: "The reading took only as long as the biggest piece, {count:biggest|word}, instead of all {n}. The price is that every slip crossed the network once, {shuffleBytes} bytes here.",
        real: "At Google in August 2004, the average job ran 3,351 map tasks and 55 reduce tasks on 157 machines (Table 1), so each machine ran about 21 map tasks in turn.",
        source: "[dean2004] §3.5, Table 1",
      },
    },
    "output.done@crash": {
      key: true,
      plain: "All {n} words are counted exactly once, even with the crash.",
      why: "The lost piece was read again from the input, and the dead copy's slips never reached a counter.",
      look: ["output"],
      first: {
        when: (v) => v.own > 0,
        deeper: {
          cost: "Redoing the lost piece cost time. {twiceMap} read {count:twice|word} back to back, its own {own} and then the lost piece, while the biggest piece alone is {biggest}. In all, {reads} words were read instead of {n}, and the {wasted} the dead machine had read were wasted.",
          source: "[dean2004] §3.3",
        },
      },
      deeper: {
        cost: "Redoing the lost piece cost time, because one machine read two pieces back to back, up to twice the biggest piece ({count:biggest|word}). The words the dead machine read before it crashed are read again, so “words read” can end above {n}.",
        source: "[dean2004] §3.3",
      },
    },
    "output.done@straggler": {
      key: true,
      plain: "All {n} words are counted exactly once, even with the slow disk.",
      why: "The backup's slips counted and the slow copy's were thrown away, so no word was counted twice.",
      look: ["output"],
      first: {
        when: (v) => v.own > 0,
        deeper: {
          cost: "The backup cost {twiceMap} a second piece, {count:twice|word} back to back (its own {own}, then the slow piece), but that was still quicker than waiting for the failing disk. In all, {reads} words were read instead of {n}, because the slow copy's {wasted} were thrown away.",
          source: "[dean2004] §3.6",
        },
      },
      deeper: {
        cost: "The backup cost one machine a second piece, up to twice the biggest piece ({count:biggest|word}) back to back, and the slow copy's reads are thrown away, so “words read” can end above {n}. That is still quicker than waiting for the failing disk.",
        source: "[dean2004] §3.6",
      },
    },
    "scale.cluster": {
      key: true,
      plain: "At the paper's scale, the same job has {paperM} map tasks and {paperR} reduce tasks on {machines} machines.",
      why: "This picture is simplified. A task is one piece of reading or counting work, and each machine runs many tasks one after another, but every word still meets a single counter.",
      look: ["output"],
      deeper: {
        real: "Google often ran jobs with M = 200,000 and R = 5,000 on 2,000 worker machines (§3.5). With far more tasks than machines, each machine runs many small tasks, which balances the load (§3.5). When a machine dies, its finished map tasks can be spread over all the others (§3.5).",
        how: "This view is a simplified picture rather than a simulation. The field shows the paper's machine count, built from silhouettes of this run's {runMachines} machines, and each light only shows whether a machine is busy or between tasks. The counts above come from the run on this page.",
        source: "[dean2004] §3.5",
      },
    },
    "output.done-alone": {
      key: true,
      plain: "All {n} words are counted, {distinct} different ones.",
      why: "One machine read every word. Turn up “Reading machines” to share the reading.",
      look: ["output"],
    },

    // ---- one word fills most of the input ----
    "skew.done": {
      key: true,
      plain: "{hot} received {load} of the {moved} slips, {share} times an even share ({moved} ÷ {R} ≈ {even}).",
      why: "{top} fills {topN} of the {n} lines, and every single {top} slip has to meet on one counter. Other codes can hash to that counter too.",
      look: ["{hotId}"],
      deeper: {
        real: "Real text is lopsided in the same way. The paper notes that word frequencies tend to follow a Zipf distribution, so each map task writes hundreds or thousands of `(the, 1)` slips, all bound for one reduce task (§4.3).",
        edge: "With only a few different keys, the hash alone can put several of them on one counter and leave another idle, so part of the overload is chance rather than frequency. Here {hot} got {count:codes|different code} of the {distinct}.",
        cost: "The job ends when its last counter ends, so the busy counter sets the pace, much like the slow disk in “One machine is slow”. A backup copy can't help here, because it would get the same {load} slips (§3.6).",
        source: "[dean2004] §3.6, §4.3",
      },
    },
    "skew.more": {
      key: true,
      plain: "With {R2} counters, every {top} would still go to one: {load2} of {slips} slips, {topN} of them {top}.",
      why: "More counters spread the different codes around, but never the copies of one code, because those have to meet to be counted.",
      look: ["{hotId}"],
      deeper: {
        cost: "This line runs the run's own hash with one more counter: {eq2}. A counter gets either all of a key or none of it, so the busiest counter gets at least {topN} of the {slips} slips however many counters there are.",
        edge: "The partitioning function sees only the key (§4.1), so every value of a key goes to one reduce task, which receives them all in one call (§2). Any fix has to shrink the key's data before the shuffle, or rename the key.",
        source: "[dean2004] §2, §4.1",
      },
    },
    "skew.combine": {
      key: true,
      plain: "If each reader ran a {term:combiner} first, only {count:sent|slip} would travel, {hotC} of them to {hot}.",
      why: "{exMap}'s {count:exN|slip} for {top} would travel as a single slip, {exSlip}. The counter would have fewer slips to add and still get the same total.",
      look: ["{hotId}"],
      deeper: {
        cost: "After combining, {hot} still gets one slip from each reader for every code it owns, {hotC} here rather than 1. The saving depends on how many times a code repeats inside one piece. At the paper's M = 200,000 map tasks, one hot key can still bring about one slip per map task, some 200,000, to a single counter (§3.5), and in Hadoop more, when a map's spills are not all combined.",
        how: "Turn on “Add up repeats first” to watch each reader do it. The paper suggests a combiner where reduce is commutative and associative, as a sum is, so that order and grouping don't change the result (§4.3). Its output has to be the same kind of (word, count) slip that reduce takes. An average, for example, has to travel as (sum, count) pairs, because an average of averages is wrong.",
        edge: "Hadoop treats the combiner as an optimisation it may run zero, one or many times on a map's output, so it must never change the answer. A combiner also helps only when partial results can be merged. A reduce that needs every value at once, such as a median or a sorted list, still sends the hot key's whole list to one machine. “Salting” adds a suffix to the hot key so its slips spread over several counters, and a second job merges the parts. That works when the parts can be merged (sums, counts, sorted runs), but a true median needs a different second step, such as a histogram or range partitioning on the value. The suffix has to be deterministic, so that a re-run task sends each line where the first run did.",
        real: "Spark's reduceByKey adds up on each reader first, like a combiner, while groupByKey ships every value. Spark's guide recommends reduceByKey or aggregateByKey over groupByKey for sums and averages.",
        source: "[dean2004] §3.5, §4.3; [white2015] ch. 2; [spark-rdd]",
      },
    },
  },

  // the reader's pick in the world, by choose id: the figure decides which option is right; `wrong` words every other one
  choices: {
    "shuffle.which": {
      prompt: "The first {w} went to {firstRed}. Now {from} has another {w}. Click the counting machine that should get it.",
      why: "{w} always hashes to the same number, so every copy of it meets on {firstRed}.",
      wrong: { misconception: "m-even",
        feedback: "Now the slips for {w} are split across two counters. Each counter adds up only what it holds, so neither can give the full count." },
    },
  },

  // the end check, by check id: answers come from the figure's own rules at other knob values; the lesson says why
  checks: {
    "check.hash": {
      question: "Imagine a new job with {R2} counting machines instead of {R}. Where do the {count:topN|slip} for {w} go?",
      why: "hash({w}) is the same on every machine, so every copy goes to one counter. Divided by {R2}, it leaves a remainder of {rem2}, so they all go to {red2}.",
      options: [
        { misconception: "m-even", feedback: "If the slips for {w} were spread out, they would sit on several counters, and none of them could give the full count." },
        {},
        { misconception: "m-even", feedback: "Counters never compare notes, so copies sent wherever there is room could never be added together." },
      ],
    },
    "check.crash-done": {
      question: "Imagine {other} had finished writing all its slips, and then its machine died. What happens to its piece?",
      why: "Its slips were on its own disk, which died with it. The piece is still in the input, so the master has it read again.",
      options: [
        { misconception: "m-done", feedback: "Finished doesn't mean safe. Its slips lived on that machine's own disk, and the counters still need them." },
        {},
        { misconception: "m-restart", feedback: "The other machines still have their slips, so only the dead machine's pieces run again." },
      ],
    },
    "check.both": {
      question: "Imagine the master kept the slips from both copies of {split}. What would the output say for {w}?",
      why: "The backup wrote a slip for every word in {split}, and the slow copy had already written {count:wrote|slip}, one of them for {w}. Kept together, they would give {w} a count of {kept}, but the text has {real}.",
      // the figure's options are always [the true count, the answer, one more], in that order
      options: [
        { misconception: "m-both", feedback: "Both copies read {w}, so keeping both copies' slips counts it twice, giving {kept} instead of {real}." },
        {},
        { feedback: "Only the words that both copies read are counted twice, and the slow copy stopped after {count:wrote|slip}." },
      ],
    },
    "check.one": {
      question: "Same failing disk, but this time the job has only 1 reading machine. What does the master do?",
      why: "A backup needs a second machine to run on, so with only one, the job waits for the slow disk.",
      options: [
        { feedback: "There's no other machine to run it on, and a backup needs a free second machine." },
        {},
        { misconception: "m-skip", feedback: "Then its words would never be counted. The master won't give up a correct count to save time." },
      ],
    },
    "check.combine": {
      question: "Imagine “Add up repeats first” were switched on. What would the output say for {w}?",
      why: "Each of the {count:readers|reader} that saw {w} sends one slip carrying its own count ({parts}). The counter adds those counts and gets {topN}, the same as before.",
      // the figure's options are always [one per reader, the answer, the two added], in that order
      options: [
        { misconception: "m-combine", feedback: "That counts the slips, one per reader. The counter adds the numbers written on the slips, so the total stays {topN}." },
        {},
        { misconception: "m-combine", feedback: "Nothing gets counted twice, because each early slip replaces the 1s it adds up. The total stays {topN}." },
      ],
    },
    "check.backup": {
      question: "Would a backup copy of {hot}, on a free machine, finish its adding sooner?",
      why: "A backup repeats the same work from the same input. That helps a slow machine, but here the work itself is large, and {hot} has {load} slips to add either way.",
      options: [
        { misconception: "m-backup", feedback: "A backup is a second copy of the whole task, so it gets all {load} slips too." },
        {},
        { misconception: "m-backup", feedback: "The first copy to finish wins only when one copy has been slowed down. Here both copies have {load} slips to add, so neither finishes sooner." },
      ],
    },
    "check.readers": {
      question: "Imagine {M2} reading machines instead of {M}, with nothing else changed. How many of the {moved} slips would {hot} get?",
      why: "The counter is chosen from the code alone, so every slip goes where it went before, and {hot} still gets {load}.",
      wrong: { misconception: "m-readers", feedback: "Who reads a line doesn't change where its slip goes. The hash looks only at the code, so {hot} still gets {load}." },
    },
    "check.split": {
      question: "Imagine a new job with {M2} reading machines instead of {M}. How many words does the busiest one read?",
      "question@skew": "Imagine a new job with {M2} reading machines instead of {M}. How many lines does the busiest one read?",
      why: "{n} words shared among {M2} machines means the biggest piece has {big2}.",
      "why@skew": "{n} lines shared among {M2} machines means the biggest piece has {big2}.",
      wrong: { feedback: "The master cuts the {n} words into {M2} pieces of nearly equal size, one per machine, so no machine reads them all, and the biggest piece has {big2}." },
      "wrong@skew": { feedback: "The master cuts the {n} lines into {M2} pieces of nearly equal size, one per machine, so no machine reads them all, and the biggest piece has {big2}." },
    },
    "check.new-word": {
      question: "Add the word {w}, which isn't in the text yet. How many totals would the output hold?",
      why: "The output holds one total for each different word. {w} is new, so it gets a total of its own, and {distinct} becomes {distinct2}.",
      options: [
        { feedback: "A total belongs to one word. {w} doesn't match any of the {distinct}, so it can't join one of their totals." },
        {},
        { misconception: "m-one", feedback: "That's the number of words read. Repeats share a total, so the output holds one per different word, which makes {distinct2}." },
      ],
    },
    "check.totals": {
      question: "Keep the {count:M|reading machine} and {count:R|counting machine}, and add one more {w} to the text. How many totals would the output hold?",
      "question@skew": "Keep the {count:M|reading machine} and {count:R|counting machine}, and add one more {w} to the log. How many totals would the output hold?",
      why: "The output holds one total for each different word. One more {w} raises its count, but the number of totals stays at {distinct}.",
      "why@skew": "The output holds one total for each different code. One more {w} raises its count, but the number of totals stays at {distinct}.",
      wrong: { feedback: "{w} already has a total, so one more copy raises that total by 1 and adds no new one. The output has one total per different word, so it stays at {distinct}." },
      "wrong@skew": { feedback: "{w} already has a total, so one more copy raises that total by 1 and adds no new one. The output has one total per different code, so it stays at {distinct}." },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "crash.what": {
      options: [
        { misconception: "m-lost",
          feedback: "Only if nobody read the piece again. Its text is still in the shared input, so the master hands it out once more." },
        { feedback: "Right. Reading the same piece again gives the same slips, so redoing just that piece is safe." },
        { misconception: "m-restart",
          feedback: "Nothing else was lost, because the other machines still have their slips. Only the dead machine's piece runs again." },
      ],
    },
    "slow.what": {
      options: [
        { misconception: "m-wait",
          feedback: "Waiting works, but then the whole job takes as long as the slowest disk, while a free machine could be reading the same piece." },
        { feedback: "Right. Reading a piece twice gives the same slips, so a backup is safe, and whichever copy finishes first wins." },
        { misconception: "m-skip",
          feedback: "Then those words would never be counted, and the answer would be wrong. MapReduce doesn't buy speed with a wrong count." },
      ],
    },
    "skew.where": {
      options: [
        { misconception: "m-even",
          feedback: "Spreading them out would split the slips for {w} between counters that never compare notes, so no counter could give the full count." },
        { feedback: "Right. {w} always hashes to the same number, so every copy lands on {firstRed}, however busy it gets." },
        { misconception: "m-central",
          feedback: "Then one machine would add up every slip, which is exactly the work we shared out. Here each counter adds up only its own share." },
      ],
    },
    "reduce.how-many": {
      options: [
        { misconception: "m-one",
          feedback: "One number would mix all the words together. The output needs a count for each word, so a counter adds up each word's slips separately." },
        { feedback: "Right. Once the slips are sorted, equal words sit side by side, and each group becomes one total." },
        { misconception: "m-one",
          feedback: "That would leave the repeats unadded. Slips for the same word are added into one total, so fewer totals than slips come out." },
      ],
    },
    "skew.fix": {
      options: [
        { misconception: "m-more",
          feedback: "With {R2} counters every code is dealt out again, but all of {top}'s slips still land together, {load2} of {slips} on one counter." },
        { misconception: "m-even",
          feedback: "Then {top}'s slips would sit on two counters, and neither total would be right on its own unless a second job added the parts together." },
        { feedback: "Right. Each reader sends one {top} slip carrying its count, so the busy counter has far fewer slips to add." },
      ],
    },
  },
};
