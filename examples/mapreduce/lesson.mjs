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
// The reader's words: "reading machine" and "counting machine" (mapper and reducer are named once, in `terms`); the
// expert layers use the paper's "map task" and "reduce task". A sentence never opens on a chip ("map 0", "the").

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
    { id: "o-hash", text: "Explain why every copy of a word has to reach the same counting machine, and how a hash arranges it without the machines asking each other." },
    { id: "o-reduce", text: "Say what a counting machine writes at the end, which is one total for each different word it was sent.", stories: ["happy"] },
    { id: "o-crash", text: "Explain why a reading task can safely run again after a crash, even one that had already finished.", stories: ["crash"] },
    { id: "o-slow", text: "Explain why a backup copy of a slow piece is safe, and why the master keeps the slips of only one copy.", stories: ["straggler"] },
    { id: "o-skew", text: "Explain why a word on most lines overloads one counting machine, and why adding up repeats early helps where more machines or a backup would not.", stories: ["skew"] },
  ],

  misconceptions: [
    { id: "m-central", wrong: "Each machine counts its own piece, and one machine adds everything up at the end.", fix: "That one machine would have to add up every slip in the job. MapReduce shares out the adding as well. All the slips for a word meet on one counting machine, and different words go to different ones." },
    { id: "m-even", wrong: "It's best to spread the slips evenly over the counting machines.", fix: "Copies of the same word would end up on different counting machines, and none of them would have that word's full count." },
    { id: "m-one", wrong: "A counting machine adds all its slips into one number.", fix: "It keeps each word separate and adds up that word's slips, so it ends with one total for each different word it holds." },
    { id: "m-lost", wrong: "A crashed machine's words are lost, so the count comes out short.", fix: "Its piece of the text is still in the input, and reading it again produces the same slips." },
    { id: "m-restart", wrong: "One failure restarts the whole job.", fix: "Only the tasks that were on the failed machine run again. Every other machine keeps its work." },
    { id: "m-done", wrong: "Once a reading task has finished, its work is safe even if the machine dies later.", fix: "Its slips were stored on that machine's own disk, so they die with it, and the piece has to be read again." },
    { id: "m-wait", wrong: "The job has no choice but to wait for its slowest machine.", fix: "The master can start a backup copy of the slow piece on a free machine. Both copies write the same slips, and whichever finishes first is kept." },
    { id: "m-skip", wrong: "Skipping a slow piece is a fair price for finishing on time.", fix: "The words in that piece would never be counted, so the totals would come out wrong." },
    { id: "m-both", wrong: "Keeping both copies' slips does no harm, because the extra copy is only a spare.", fix: "Both copies wrote slips for the same words, so keeping both would count those words twice." },
    { id: "m-more", wrong: "More counting machines would spread out the copies of one common word.", fix: "The hash sends every copy of a word to the same counting machine however many there are. Adding machines only moves the other words around." },
    { id: "m-backup", wrong: "A backup copy splits a busy machine's work in half.", fix: "A backup does the whole task again from the same input. That helps when a machine is slow, but a big pile of work is just as big the second time." },
    { id: "m-readers", wrong: "More reading machines would share out a common word's slips.", fix: "The counting machine is chosen from the word alone, so every copy still goes to the same one however many machines do the reading." },
    { id: "m-combine", wrong: "Adding up repeats early changes the counts.", fix: "An early slip carries the number it stands for, and the counting machine adds those numbers, so the total comes out the same." },
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
      why: "Here `hash % R` chose each word's counting machine. Add one more machine and most words would move to a different one. A hash ring moves only a few of them." },
    { title: "Raft", href: "https://sites.irfanali.me/p/learning/raft-consensus.html",
      why: "The master here has no backup. If it dies, the whole job stops and has to run again. Raft lets a group of machines agree with each other, so losing one of them doesn't stop the work." },
  ],

  terms: {
    master: { lead: "the coordinator", def: "The machine that hands out pieces of work, keeps track of who has what, and notices when a machine fails." },
    split: { lead: "one piece of the text", def: "One piece of the input. One machine reads it, the way one helper takes one shelf of a library." },
    mapper: { lead: "a reading machine", def: "The formal name for a reading machine, which writes a slip such as (fox, 1) for each word." },
    combiner: { lead: "adding up early", def: "Code on a reading machine that adds up repeated words before any of its slips are sent." },
    hash: { lead: "a word's fixed number", def: "A calculation that turns a word into a large number. The same word always gives the same number." },
    shuffle: { lead: "sending each slip to its counting machine", def: "The stage where every slip travels to the machine that adds up its word." },
    reducer: { lead: "a counting machine", def: "The formal name for a counting machine. It adds up all the slips for the words it was given." },
    straggler: { lead: "a slow machine", def: "A machine so much slower than the rest that everyone ends up waiting for it." },
  },

  chapters: {
    split: {
      teach: { prompt: "Before it runs: if three people split the counting of one library between them, what could go wrong with the total?", listen: "A word could be counted twice, or missed, where two pieces meet. Here every word sits in exactly one piece, so neither can happen.", minutes: 3 },
      about: "One person counting every word in a library would take ages, so a coordinator, the {term:master}, gives each helper one shelf. In MapReduce a shelf is a {term:split}, one piece of the text.",
      "about@skew": "This story runs the same job on a web log. Each line is one request, and its status code says how it went (200 is OK, 404 is not found). The {term:master} hands each machine one {term:split} of the log.",
      enter: { sofar: "On one machine this is easy. A loop reads each word and adds 1 to its count in a dictionary.", now: "The text is cut into pieces, one for each machine. “The picture” below shows which part of the library stands for which part of the system.", done: "Every word is in exactly one piece.", picture: true },
      "enter@skew": { sofar: "On one machine this is easy. A loop reads each line and adds 1 to that code's count in a dictionary.", now: "The log is cut into pieces, one for each machine.", done: "Every line is in exactly one piece.", picture: true },
    },
    map: {
      teach: { prompt: "Why can every reading machine start at once, without waiting for the others?", listen: "Each map task needs only its own piece, and nothing is added up yet. Listen for “one machine adds it all up at the end”, because the shuffle answers that idea next.", minutes: 3 },
      "teach@crash": { prompt: "A machine has crashed. Before anyone answers the question on screen, ask the room whether its part of the count is gone for good.", listen: "Its text is still in the shared input, so the master hands the piece out again. Listen for “the count comes out short” and “the whole job starts over”.", minutes: 4 },
      "teach@straggler": { prompt: "One machine is far behind. Should the job wait for it, skip it, or do something else?", listen: "A backup copy of the slow piece runs on a free machine, and whichever copy finishes first wins. Skipping it would leave its words uncounted.", minutes: 4 },
      about: "Next, each reading machine, a {term:mapper}, goes through its own piece and writes a slip like `(word, 1)` for every word, meaning “I saw this word once.” The machines work at the same time, and none waits for another.",
      "about@skew": "Next, each reading machine, a {term:mapper}, goes through its piece of the log and writes a slip like `(code, 1)` for every line. The machines work at the same time, and none waits for another.",
      "about@crash": "As before, each reading machine writes its slips, such as `(word, 1)`. They go to the machine's own local disk, and the counting machines fetch them from there later. This time one machine dies partway through its piece.",
      "about@straggler": "As before, each reading machine writes a slip for every word. This time one of them has a failing disk and falls far behind the others. A machine like that is called a {term:straggler}.",
      enter: { sofar: "The text is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, one slip per word.", done: "Every word in the text has become a `(word, 1)` slip on one of the machines." },
      "enter@skew": { sofar: "The log is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, one slip per line.", done: "Every line of the log has become a `(code, 1)` slip on one of the machines." },
      "enter@crash": { sofar: "The text is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, and partway through, one of them crashes.", done: "Even so, every word ends up as exactly one slip that counts." },
      "enter@straggler": { sofar: "The text is now in {count:M|piece}, one for each machine.", now: "Each machine turns its piece into slips, but one of them has a failing disk.", done: "Every word ends up with exactly one slip that counts, including the words in the slow piece." },
    },
    shuffle: {
      teach: { prompt: "Why not deal the slips out evenly, so every counting machine gets the same amount?", listen: "Copies of one word would land on different machines, and no machine could give that word's full count. The hash sends every copy to the same counting machine without any machine having to ask another.", minutes: 5 },
      "teach@skew": { prompt: "Almost every line has the same code. Where will all those slips go, and what does that do to one machine?", listen: "Every copy goes to the one counting machine its hash picks. The count stays exact, but that machine does most of the work. Adding up repeats first makes its pile smaller.", minutes: 5 },
      about: "In {term:shuffle|the shuffle}, every slip travels to one counting machine. A {term:hash} turns the word into a number. Divide that by the number of counting machines, here {R}, and the remainder tells you which one gets the slip.",
      "about@skew": "In {term:shuffle|the shuffle}, each slip goes to the counting machine its {term:hash} picks. The code {top} fills {topN} of the {n} lines, so where its slips go decides how busy each machine will be.",
      "about@crash": "The shuffle runs as before, with each slip going where its hash points. The slips from the re-read piece travel like everyone else's, and the crashed copy's lost slips never leave.",
      "about@straggler": "The shuffle runs as before, with each slip going where its hash points. Only one copy's slips travel for the slow piece, so none of its words is sent twice.",
      enter: { sofar: "Every word is now a `(word, 1)` slip, sitting on one of the reading machines.", now: "Each slip is sent to one of the {count:R|counting machine}.", done: "Every slip has reached a counting machine, and you can say why it went to that one." },
      "enter@skew": { sofar: "Every line is now a `(code, 1)` slip, sitting on one of the reading machines.", now: "Each slip is sent to one of the {count:R|counting machine}.", done: "Every slip has reached a counting machine, and you can say why it went to that one." },
      "enter@crash": { sofar: "Every word is a `(word, 1)` slip again, including the re-read piece.", now: "As before, each slip goes to the counting machine its hash picks.", done: "Every slip that counts has reached a counting machine." },
      "enter@straggler": { sofar: "Every word is a `(word, 1)` slip, and the slow piece's words are there exactly once.", now: "As before, each slip goes to the counting machine its hash picks.", done: "Every slip that counts has reached a counting machine." },
    },
    reduce: {
      teach: { prompt: "Why sort the slips before adding them up, when a dictionary would do?", listen: "Once they're sorted, equal words sit next to each other, so a single pass can add them up, even when the slips don't fit in memory.", minutes: 2 },
      about: "Each counting machine, a {term:reducer}, first sorts its slips so that copies of the same word end up side by side. Then it goes down the list and adds up each group into one total.",
      "about@skew": "Each counting machine, a {term:reducer}, first sorts its slips so that copies of the same code end up side by side. Then it goes down the list and adds up each group into one total.",
      "about@crash": "Counting works exactly as in the first story. Nothing on the counting machines shows that a reading machine ever crashed.",
      "about@straggler": "Counting works exactly as in the first story. Each word of the slow piece arrives once, from whichever copy was kept.",
      enter: { sofar: "All the slips for any one word are now on the same counting machine.", now: "Each counting machine adds up the words it was sent.", done: "Each counting machine has one total for every different word it was sent." },
      "enter@skew": { sofar: "All the slips for any one code are now on the same counting machine.", now: "Each counting machine adds up the codes it was sent.", done: "Each counting machine has one total for every different code it was sent." },
      "enter@crash": { now: "As before, each counting machine sorts its slips and adds them up." },
      "enter@straggler": { now: "As before, each counting machine sorts its slips and adds them up." },
    },
    output: {
      teach: { prompt: "Point at any total in the output. How do we know no other counting machine holds part of it?", listen: "The hash sent every copy of that word to one counting machine, so its total is the full count. Every what-if story tests exactly this.", minutes: 3 },
      about: "Each counting machine writes its totals to the shared output, like pinning a list to a noticeboard. Between them, the lists hold exactly one count for every different word in the text.",
      "about@skew": "Each counting machine writes its totals to the shared output, like pinning a list to a noticeboard. Between them, the lists hold exactly one count for every status code in the log.",
      "about@crash": "The totals go into the output as before. They match the first story's exactly, crash or no crash.",
      "about@straggler": "The totals go into the output as before. They match the first story's exactly, slow disk or not.",
      enter: { sofar: "Each counting machine has one total for every word it was sent.", now: "Every counting machine writes its totals to the shared output.", done: "The output holds one count for each of the {distinct} different words." },
      "enter@skew": { sofar: "Each counting machine has one total for every code it was sent.", now: "Every counting machine writes its totals to the shared output.", done: "The output holds one count for each of the {distinct} different codes." },
    },
  },

  steps: {
    // ---- Split ----
    "split.problem": {
      key: true,
      plain: "We'll count the {n} words in “{text}”.",
      "plain@skew": "We'll count each status code in a web log of {n} requests.",
      why: "One computer could count these with a loop in a moment. The point is to do it with several machines that each see only part of the text, as you would for a text far too big for one machine.",
      "why@skew": "It's the same job as counting words, with status codes in place of words. The log is short, so you can follow every line, but a huge log goes through the same steps.",
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
      why: "You can see the pieces in the input: {pieces}. No piece needs any other to be read, so all {M} machines can start together.",
      look: ["{splitIds}"], picture: "split",
      deeper: {
        how: "Every record, here a word or a line, belongs to exactly one piece. A piece may be read twice, by a re-run or a backup, but only one reading counts. The paper's text reader cuts only at line boundaries (§4.4). Hadoop cuts by bytes instead. Each of its readers except the first skips ahead to its first line break, and each reads past its end to finish the last line it started. So every line still belongs to exactly one reader. The master also prefers to run a piece on a machine that already stores a copy of it, so most input is read from local disk rather than over the network (§3.4).",
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
      why: "On screen each machine is named after the step it runs. The reading machines are map 0, map 1 and so on, and the counting machines are numbered the same way, starting at reduce 0.",
      look: ["{mapIds}"],
    },
    "map.handout-one": {
      plain: "The master hands the machine its piece.",
      look: ["{mapIds}"],
    },
    "map.read": {
      first: {
        key: true,
        why: "You might expect each machine to count its own words here. It doesn't. It only tags each word with a 1, because the adding has to wait until all the slips for a word are in one place.",
        "why@skew": "A repeated code still gets a slip every time it appears, so each {slip} is a slip of its own.",
        picture: "slip",
        deeper: {
          how: "A real map task collects its slips in memory and then writes them to its machine's local disk. It divides them into R regions, one for each reduce task, which here means {R}. When it is done, it tells the master where the files are (§3.1). Hadoop keeps the regions as parts of one indexed file.",
          code: "`emit(word, 1)` (lines 1–3)",
          source: "[dean2004] §3.1; [white2015] ch. 7",
        },
      },
      plain: "On {map}, each of its {count:count|word} becomes a slip, starting with {slip}.",
      "plain@skew": "On {map}, each of its {count:count|line} becomes a slip, starting with {slip}.",
      look: ["{mapId}"],
    },
    // only with your own input shorter than the mappers (e.g. "a b" on 6); verify's knob runs keep the default text
    "map.empty": {
      plain: "The piece for {map} is empty, so it finishes straight away.",
      why: "There are more machines than words to share.",
      "why@skew": "There are more machines than lines to share.",
      look: ["{mapId}"],
    },
    "map.combine": {
      first: {
        key: true,
        why: "Fewer slips now have to cross the network. The totals come out the same, because it doesn't matter where the adding happens.",
        deeper: {
          how: "The paper calls this a combiner. It is usually the same code as reduce, run on one map task's own slips (§4.3). It suits a reduce that is commutative and associative, where order and grouping don't change the result, as with a sum. An average can't be combined this way, because the average of two averages is wrong unless each part carries its count.",
          code: "`emit(word, sum(counts))` (lines 5–6)",
          source: "[dean2004] §4.3",
        },
      },
      plain: "Before sending anything, {map} runs a {term:combiner}, so its {count:before|slip} for {dups} become {after}.",
      look: ["{mapId}"],
    },

    // ---- a machine crashes ----
    "crash.start": {
      plain: "Next, {map} starts on its piece, writing a slip for each word.",
      "plain@skew": "Next, {map} starts on its piece, writing a slip for each line.",
      look: ["{mapId}"],
    },
    "crash.down": {
      key: true,
      plain: "Partway through, {map} {tone:fail|crashes} after {upto} of {total} words. Its {count:upto|slip} {be:upto} lost with it.",
      "plain@skew": "Partway through, {map} {tone:fail|crashes} after {upto} of {total} lines. Its {count:upto|slip} {be:upto} lost with it.",
      why: "The grey slips marked “lost” are the ones it had written. They were stored on the machine's own disk, which went down with it.",
      look: ["{mapId}"],
      deeper: {
        how: "The master pings every worker regularly and marks one that stops answering as failed (§3.3). Hadoop can also re-run a finished map while its machine is still up. That happens when reduce tasks keep failing to fetch its slips and report it.",
        edge: "Even finished map tasks on a dead machine run again, because their slips were on its local disk. Finished reduce tasks don't, because their output is already in the shared file system (§3.3). Hadoop re-runs a finished map only while some reduce task still needs its slips. Spark's external shuffle service keeps a dead worker's map output, so there only losing the whole host forces a re-run.",
        real: "The master itself has no such protection. In the paper, a dead master aborts the job, and the client can notice and retry it if it wants. The paper notes that master checkpoints would be easy to add (§3.3). Hadoop on YARN does restart a job's master, its ApplicationMaster, and can recover the tasks that were already done. The setting is mapreduce.am.max-attempts.",
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
      plain: "The master hands {split} to {helper}, which is free. Its text is still in the input.",
      why: "The input is stored in several copies on different machines, so a crash loses work but never the text itself.",
      look: ["{splitId}", "{helperId}"],
      deeper: {
        how: "The failed machine's tasks are handed out again. Any reduce task that hasn't fetched their slips yet is told to fetch them from the re-run instead (§3.3).",
        real: "Real input lives in GFS, which keeps several copies of every 64 MB block, usually 3, on different machines. The master likes to run a map next to one of those copies, so the dead machine often held one too, but the others survive (§3.4).",
        source: "[dean2004] §3.3, §3.4",
      },
    },
    "crash.reread": {
      plain: "Now {helper} reads {split} again and writes the same {count:total|slip}.",
      why: "Map looks at nothing but its piece of the text. Give it the same piece and it writes exactly the same slips, so redoing the work can't change the count.",
      look: ["{helperId}"],
      deeper: {
        edge: "This only works because map is deterministic. If map used randomness or the clock, a re-run could write different slips, and the paper then promises only weaker guarantees (§3.3).",
        how: "A map task's slips count only after its machine reports “done” to the master, with the names of its files. The crashed copy never reports, so its half-written slips are never handed on. If two copies both report, the master ignores the second one (§3.3).",
        source: "[dean2004] §3.3",
      },
    },

    // ---- a machine is slow ----
    "slow.disk": {
      key: true,
      plain: "On {map} the disk is failing. It keeps retrying reads and has written {done} of {total} slips.",
      why: "Nothing can be counted until every piece is read. So this one bad disk can hold up every other machine in the job.",
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
      plain: "The master starts a {tone:busy|backup} copy of {split} on {helper}, which is free.",
      why: "This is safe because both copies read the same piece and write the same slips. The master will keep whichever one finishes first.",
      look: ["{helperId}", "{splitId}"],
      deeper: {
        how: "The master starts backups only when the job is close to done, and only for the tasks still running. That costs only a few percent more machine time (§3.6).",
        cost: "In the paper's sort benchmark, turning backups off made the job take 44% longer (§3.6, §5.3).",
        real: "Hadoop calls this speculative execution. It is on by default for both map and reduce tasks (mapreduce.map.speculative and mapreduce.reduce.speculative). Spark has it off by default (spark.speculation).",
        source: "[dean2004] §3.6, §5.3; [hadoop-mapred]; [spark-config]",
      },
    },
    "slow.race": {
      plain: "Both copies run at once. The backup writes its {count:total|slip} while {map} manages only {more} more.",
      look: ["{helperId}", "{mapId}"],
    },
    "slow.tie": {
      plain: "Both copies finish, so the master keeps the backup's slips and throws away the ones from {map}.",
      why: "Keeping both would count every word in {split} twice, so only one copy's slips are kept.",
      look: ["{mapId}"],
    },
    "slow.win": {
      plain: "The backup finishes first, so the master stops {map} with {short} of its {total} words still unread.",
      why: "Had the master kept both copies' slips, the words the slow copy had already read would be counted twice. So its slips are thrown away.",
      look: ["{mapId}"],
      deeper: {
        edge: "The paper only says the task is marked done when either copy finishes. Stopping the slower copy, as this run does, is what Hadoop does. The paper also starts backups when the whole job is nearly done, while this run starts one once the other map tasks are done. Hadoop can start backups at any point, separately for map and reduce tasks. It picks the attempts it expects to finish latest, up to a cap that is 10% of running tasks by default (mapreduce.job.speculative.speculative-cap-running-tasks in mapred-default.xml).",
        source: "[dean2004] §3.6; [hadoop-mapred]",
      },
    },

    // ---- Shuffle ----
    "shuffle.first": {
      key: true,
      plain: "The word {w} goes to {red}. Its hash, {h}, divided by {R} leaves {rem}.",
      "plain@skew": "The code {w} goes to {red}. Its hash, {h}, divided by {R} leaves {rem}.",
      why: "If the slips were dealt out in turn like cards, copies of the same word would land on several counting machines. The machines never compare notes, so none of them could give that word's total.",
      "why@skew": "If the slips were dealt out in turn like cards, copies of the same code would land on several counting machines. The machines never compare notes, so none of them could give that code's total.",
      look: ["{slipId}", "{redId}"], picture: "hash",
      deeper: {
        how: "Each map task has already divided its slips into {R} regions, one per reduce task. Each reduce task fetches its own region from every map task. The fetching starts early, because the master passes on each finished map's file locations as they come in (§3.2). Only the final sort and the adding wait for the last map, since it might still hold a slip they need. Hadoop sorts each map's slips on the map side and merges the sorted runs as they arrive.",
        cost: "In this model {shuffleBytes} bytes cross the network, counting each slip's word plus a 4-byte count. Real formats add length headers, and a slip whose counting machine is on the same computer never crosses the network at all. In the paper's clusters, network bandwidth was the scarce resource (§3.4).",
        edge: "Python's built-in hash() of a string changes from one process to the next (hash randomization) unless PYTHONHASHSEED is fixed, and it can differ between Python versions, so two machines could disagree about a word. Real jobs use a hash with a fixed definition, and this run uses FNV-1a.",
        real: "`hash(key) mod R` is only the paper's default partitioning function, and a job can supply its own. For example, `hash(Hostname(urlkey)) mod R` puts every page of one website in the same output file (§4.1). Within one reduce task, keys are handed to reduce in increasing order, which is why each output file comes out sorted (§4.2).",
        code: "`hash(word) % R` (lines 8–9)",
        source: "[dean2004] §3.2, §3.4, §4.1, §4.2; [python-hashseed]",
      },
    },
    "shuffle.again": {
      key: true,
      plain: "Another {w}, from {from}, also goes to {red}, since the same word always hashes the same.",
      "plain@skew": "Another {w}, from {from}, also goes to {red}, since the same code always hashes the same.",
      why: "Look at {red}, where every copy of {w} so far has landed. The hash looks only at the letters of the word, never at which machine read it.",
      "why@skew": "Look at {red}, where every copy of {w} so far has landed. The hash looks only at the characters of the code, never at which machine read it.",
      look: ["{slipId}", "{redId}"],
    },
    "shuffle.send": {
      first: {
        why: "The `%` in the caption means “the remainder after dividing by”. A counting machine takes many different words like this one, and it keeps a separate tally for each.",
        "why@skew": "The `%` in the caption means “the remainder after dividing by”. A counting machine takes many different codes, and it keeps a separate tally for each.",
      },
      plain: "From {from}, {w} goes to {red} because {eq}.",
      "plain@skew": "The code {w} goes to {red} ({eq}), bringing it to {count:load|slip}, with {rest} elsewhere.",
      look: ["{slipId}", "{redId}"],
    },

    // ---- your turn: a wrong pick in the shuffle, played out (s.choose "shuffle.which") ----
    "choose.sent": {
      plain: "Your pick sends {w} to {picked}.",
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
      why: "Each counting machine can only add up the slips it holds, so neither of them has the full count.",
      look: ["{redId}", "{pickedId}"],
    },

    // ---- Reduce ----
    "reduce.sort": {
      first: {
        key: true,
        why: "With only {count:got|slip} you could keep the tally in your head. Sorting matters when there are far too many to hold in memory, because then a single pass down the sorted list adds up each group.",
        "why@skew": "With only {count:got|slip} you could keep the tally in your head. Sorting matters when there are far too many to hold in memory, because then a single pass down the sorted list adds up each group.",
        picture: "reducer",
        deeper: {
          how: "In the animation, each beat swaps two slips. A dictionary of counts works as long as every different word fits in memory. The paper's reduce task sorts by key instead, using a sort on disk when the data doesn't fit, and then adds in one pass (§3.1). That also makes each output file come out sorted (§4.2). Hadoop does most of this sorting on the map side, and its reduce task merges the sorted runs. Spark's reduceByKey adds up in a hash table instead, and spills sorted runs to disk when the table grows too large.",
          code: "`reduce(word, counts)` (lines 11–12)",
          source: "[dean2004] §3.1, §4.2; [white2015] ch. 7; [spark-rdd]",
        },
      },
      plain: "{count:got|slip} reach {red}, and it sorts them so that copies of the same word sit together.",
      "plain@skew": "{count:got|slip} reach {red}, and it sorts them so that copies of the same code sit together.",
      look: ["{redId}"],
    },
    "reduce.sorted": {
      plain: "The {count:got|slip} on {red} arrive already in order.",
      look: ["{redId}"],
    },
    "reduce.empty": {
      plain: "No slips reached {red}, so its output file stays empty.",
      why: "None of the words in this text hash to it.",
      "why@skew": "None of the codes in this log hash to it.",
      look: ["{redId}"],
    },
    "reduce.sum": {
      first: {
        key: true,
        why: "The hash sent every copy of these words here and nowhere else, so each total is the word's full count. Words that appear only once, like {ones}, keep their 1.",
        "why@skew": "The hash sent every copy of these codes here and nowhere else, so each total is the code's full count. Codes that appear only once, like {ones}, keep their 1.",
      },
      plain: "Adding up each group, {red} gets {sums}.",
      why: "Words that appear only once, like {ones}, keep their 1.",
      "why@skew": "Codes that appear only once, like {ones}, keep their 1.",
      look: ["{sumIds}"],
    },
    // only when every word on a reducer repeats (your own input, e.g. "fox fox dog dog the the")
    "reduce.sum-all": {
      first: {
        key: true,
        why: "The hash sent every copy of these words here and nowhere else, so each total is the word's full count.",
        "why@skew": "The hash sent every copy of these codes here and nowhere else, so each total is the code's full count.",
      },
      plain: "Adding up each group, {red} gets {all}.",
      look: ["{sumIds}"],
    },
    "reduce.single": {
      plain: "None of the words on {red} repeat, so each slip's 1 is already that word's total.",
      "plain@skew": "None of the codes on {red} repeat, so each slip's 1 is already that code's total.",
      look: ["{redId}"],
    },

    // ---- Output ----
    "output.write": {
      first: {
        why: "The output is a folder with one file for each counting machine. This one is {part}.",
        picture: "output",
        deeper: {
          how: "Reduce output goes to the shared file system, so a finished reduce task never runs again, even if its machine dies later. A reduce task can still run twice, as a backup or a re-run. Each copy then writes a private temporary file and renames it to the final name at the end. The rename is atomic, so exactly one copy's file survives (§3.3). Hadoop builds the same guarantee with an output committer, which lets only one attempt of each task commit. On HDFS its v1 algorithm is atomic, and v2 gives that up for speed. Object stores such as S3 have no atomic rename, so they need special committers.",
          edge: "The name part-r-00000 is Hadoop's convention. In the paper the user names the files, and its word-count program writes /gfs/test/freq-00000-of-00100 and so on (§3.1, Appendix A).",
          source: "[dean2004] §3.3, Appendix A; [hadoop-committers]",
        },
      },
      plain: "The {count:totals|total} from {red} go into the output.",
      look: ["output"],
    },
    "output.done": {
      key: true,
      plain: "All {n} words are counted, {distinct} different ones, and no machine ever read the whole text.",
      why: "Check any total against the text and it matches, because no other counting machine holds part of it. The next stories try to break this with a crash, a slow disk and a lopsided log.",
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
      why: "The lost piece was read again from the input, and the dead copy's slips never reached a counting machine.",
      look: ["output"],
      first: {
        when: (v) => v.own > 0,
        deeper: {
          cost: "Redoing the lost piece cost time. One machine, {twiceMap}, read {count:twice|word} back to back, its own {own} and then the lost piece, where no machine would otherwise read more than {biggest}. In all, {reads} words were read instead of {n}, and the {wasted} the dead machine had read were wasted.",
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
          cost: "The backup cost one machine, {twiceMap}, a second piece. It read {count:twice|word} back to back, its own {own} and then the slow piece, where no machine would otherwise read more than {biggest}. That was still quicker than waiting for the failing disk. In all, {reads} words were read instead of {n}, because the slow copy's {wasted} were thrown away.",
          source: "[dean2004] §3.6",
        },
      },
      deeper: {
        cost: "The backup cost one machine a second piece, up to twice the biggest piece ({count:biggest|word}) back to back. The slow copy's reads are thrown away, so “words read” can end above {n}. That is still quicker than waiting for the failing disk.",
        source: "[dean2004] §3.6",
      },
    },
    "scale.cluster": {
      key: true,
      plain: "At Google, a large job ran {paperM} map tasks and {paperR} reduce tasks on {machines} machines.",
      why: "A task is one piece of reading or counting work, and each machine works through many of them in turn. The picture is a simplified sketch of such a cluster, and every word still meets a single counting machine.",
      look: ["output"],
      deeper: {
        real: "Google often ran jobs with M = 200,000 and R = 5,000 on 2,000 worker machines (§3.5). With far more tasks than machines, each machine runs many small tasks, which balances the load (§3.5). When a machine dies, its finished map tasks can be spread over all the others (§3.5).",
        how: "The field is not simulated. It shows the paper's machine count, built from silhouettes of this run's {runMachines} machines, and each light only shows whether a machine is busy or between tasks. The counts above come from the run on this page.",
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
      plain: "Of the {moved} slips, {hot} received {load}, which is {share} times an even share ({moved} ÷ {R} ≈ {even}).",
      why: "The code {top} fills {topN} of the {n} lines, and every one of those slips has to meet on the same counting machine. Any other code on {hot} is there by chance, because its hash happened to leave the same remainder.",
      look: ["{hotId}"],
      deeper: {
        real: "Real text is lopsided in the same way. The paper notes that word frequencies tend to follow a Zipf distribution, so each map task writes hundreds or thousands of `(the, 1)` slips, all bound for one reduce task (§4.3).",
        edge: "With only a few different keys, the hash alone can put several of them on one reduce task and leave another idle. So part of the overload is chance rather than frequency. Here {hot} got {count:codes|different code} of the {distinct}.",
        cost: "The job ends when its last reduce task ends, so the busy one sets the pace, much like the slow disk in “One machine is slow”. A backup copy can't help here, because it would get the same {load} slips (§3.6).",
        source: "[dean2004] §3.6, §4.3",
      },
    },
    "skew.more": {
      key: true,
      plain: "With {R2} counting machines, every {top} would still meet on one: {load2} of {slips} slips.",
      why: "Adding machines spreads the different codes around. It can't spread the copies of one code, because those have to meet to be counted.",
      look: ["{hotId}"],
      deeper: {
        cost: "These numbers come from running the run's own hash with one more counting machine, which gives {eq2}. A reduce task gets either all of a key or none of it, so the busiest one gets at least {topN} of the {slips} slips however many there are.",
        edge: "The partitioning function sees only the key (§4.1). So every value of a key goes to one reduce task, which receives them all in one call (§2). Any fix has to shrink the key's data before the shuffle, or rename the key.",
        source: "[dean2004] §2, §4.1",
      },
    },
    "skew.combine": {
      key: true,
      plain: "If each reading machine ran a {term:combiner} first, {count:sent|slip} would travel, {hotC} of them to {hot}.",
      why: "On {exMap}, for example, the {count:exN|slip} for {top} would travel as a single slip, {exSlip}. The total stays the same, and the busy machine has far fewer slips to add.",
      look: ["{hotId}"],
      deeper: {
        cost: "After combining, {hot} still gets one slip from each reading machine for every code it owns, {hotC} here rather than 1. The saving depends on how many times a code repeats inside one piece. A hot key is a key far more common than the rest. At the paper's M = 200,000 map tasks, one hot key can still bring about one slip per map task, some 200,000, to a single reduce task (§3.5). In Hadoop it can be more, when a map's spills are not all combined.",
        how: "Turn on “Add up repeats first” to watch each reading machine do it. The paper suggests a combiner where reduce is commutative and associative, as a sum is, so that order and grouping don't change the result (§4.3). Its output has to be the same kind of (word, count) slip that reduce takes. An average, for example, has to travel as (sum, count) pairs, because an average of averages is wrong.",
        edge: "Hadoop may run the combiner zero, one or many times on a map's output, so it must never change the answer. A combiner also helps only when partial results can be merged. A reduce that needs every value at once, such as a median or a sorted list, still sends the hot key's whole list to one machine. “Salting” adds a suffix to the hot key so its slips spread over several reduce tasks, and a second job merges the parts. That works when the parts can be merged, as sums, counts and sorted runs can. A true median needs a different second step, such as a histogram or range partitioning on the value. The suffix has to be deterministic, so that a re-run task sends each line where the first run did.",
        real: "Spark's reduceByKey adds up on each machine first, like a combiner, while groupByKey ships every value. Spark's guide recommends reduceByKey or aggregateByKey over groupByKey for sums and averages.",
        source: "[dean2004] §3.5, §4.3; [white2015] ch. 2; [spark-rdd]",
      },
    },
  },

  // the reader's pick in the world, by choose id: the figure decides which option is right; `wrong` words every other one
  choices: {
    "shuffle.which": {
      prompt: "The first {w} went to {firstRed}. Now {from} has another {w}. Click the counting machine that should get it.",
      why: "The word {w} always hashes to the same number, so every copy of it meets on {firstRed}.",
      wrong: { misconception: "m-even",
        feedback: "Now the slips for {w} are split across two counting machines. Each adds up only what it holds, so neither can give the full count." },
    },
  },

  // the end check, by check id: answers come from the figure's own rules at other knob values; the lesson says why
  // (where the figure's numeric options move with the knobs, one `wrong` text answers each likely mistake in turn)
  checks: {
    "check.hash": {
      question: "Imagine a new job with {R2} counting machines instead of {R}. Where do the {count:topN|slip} for {w} go?",
      why: "The hash of {w} is the same on every machine, so every copy goes to one counting machine. Divided by {R2}, it leaves a remainder of {rem2}, so they all go to {red2}.",
      options: [
        { misconception: "m-even", feedback: "If the slips for {w} were spread out, they would sit on several counting machines, and none of them could give the full count." },
        {},
        { misconception: "m-even", feedback: "The machines never compare notes, so copies sent wherever there is room could never be added together." },
      ],
    },
    "check.crash-done": {
      question: "Imagine {other} had finished writing all its slips, and then its machine died. What happens to its piece?",
      why: "Its slips were on its own disk, which died with it. The piece is still in the input, so the master has it read again.",
      options: [
        { misconception: "m-done", feedback: "Finished doesn't mean safe. Its slips lived on that machine's own disk, and the counting machines still need them." },
        {},
        { misconception: "m-restart", feedback: "The other machines still have their slips, so only the dead machine's pieces run again." },
      ],
    },
    "check.both": {
      question: "Imagine the master kept the slips from both copies of {split}. What would the output say for {w}?",
      why: "The backup wrote a slip for every word in {split}, and the slow copy had already written {count:wrote|slip}, one of them for {w}. Kept together, they would give {w} a count of {kept}, but the text has {real}.",
      // the figure's options are always [the true count, the answer, one more], in that order
      options: [
        { misconception: "m-both", feedback: "That's the true count, but both copies read {w}. Keeping both copies' slips counts it twice, giving {kept}." },
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
        { misconception: "m-skip", feedback: "Skipping the piece would leave its words out of the totals. The master waits instead." },
      ],
    },
    "check.combine": {
      question: "Imagine “Add up repeats first” were switched on. What would the output say for {w}?",
      why: "Each of the {count:readers|reading machine} that saw {w} sends one slip carrying its own count ({parts}). The counting machine adds those counts and gets {topN}, the same as before.",
      // the figure's options are always [one per reading machine, the answer, the two added], in that order
      options: [
        { misconception: "m-combine", feedback: "That counts the slips, one per reading machine. The counting machine adds the numbers written on the slips, so the total stays {topN}." },
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
      why: "The counting machine is chosen from the code alone, so every slip goes where it went before, and {hot} still gets {load}.",
      wrong: { misconception: "m-readers", feedback: "More reading machines change who reads each line, but not where its slip goes. The hash looks only at the code, so the slips don't spread out evenly, and {hot}'s share doesn't shrink either. It still gets {load}." },
    },
    "check.split": {
      question: "Imagine a new job with {M2} reading machines instead of {M}. How many words does the busiest one read?",
      "question@skew": "Imagine a new job with {M2} reading machines instead of {M}. How many lines does the busiest one read?",
      why: "Cut {n} words into {M2} pieces as evenly as possible, and the biggest piece has {big2}.",
      "why@skew": "Cut {n} lines into {M2} pieces as evenly as possible, and the biggest piece has {big2}.",
      wrong: { feedback: "Each machine reads only its own piece, so none of them reads all {n}. The busiest piece holds {n} ÷ {M2} words, rounded up, which is {big2}." },
      "wrong@skew": { feedback: "Each machine reads only its own piece, so none of them reads all {n}. The busiest piece holds {n} ÷ {M2} lines, rounded up, which is {big2}." },
    },
    "check.new-word": {
      question: "Add the word {w}, which isn't in the text yet. How many totals would the output hold?",
      why: "The output holds one total for each different word. The word {w} is new, so it gets a total of its own, and {distinct} becomes {distinct2}.",
      options: [
        { feedback: "A total belongs to one word. The word {w} doesn't match any of the {distinct}, so it can't join one of their totals." },
        {},
        { misconception: "m-one", feedback: "That's the number of words read. Repeats share a total, so the output holds one per different word, which makes {distinct2}." },
      ],
    },
    "check.totals": {
      question: "Keep the {count:M|reading machine} and {count:R|counting machine}, and add one more {w} to the text. How many totals would the output hold?",
      "question@skew": "Keep the {count:M|reading machine} and {count:R|counting machine}, and add one more {w} to the log. How many totals would the output hold?",
      why: "The output holds one total for each different word. One more {w} raises its count, but the number of totals stays at {distinct}.",
      "why@skew": "The output holds one total for each different code. One more {w} raises its count, but the number of totals stays at {distinct}.",
      wrong: { feedback: "The word {w} already has a total, so another copy only raises that total by 1 and adds no new one. And the output counts different words, not words read, so it stays at {distinct}." },
      "wrong@skew": { feedback: "The code {w} already has a total, so another copy only raises that total by 1 and adds no new one. And the output counts different codes, not lines read, so it stays at {distinct}." },
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
          feedback: "Waiting works, but the whole job would take as long as the slowest disk, while a free machine could be reading the same piece." },
        { feedback: "Right. Reading a piece twice gives the same slips, so a backup is safe, and whichever copy finishes first wins." },
        { misconception: "m-skip",
          feedback: "Skipping would leave those words uncounted, and the answer would be wrong. MapReduce never trades a correct count for speed." },
      ],
    },
    "skew.where": {
      options: [
        { misconception: "m-even",
          feedback: "Spreading them out would split the slips for {w} between machines that never compare notes, so none could give the full count." },
        { feedback: "Right. The code {w} always hashes to the same number, so every copy lands on {firstRed}, however busy it gets." },
        { misconception: "m-central",
          feedback: "If one machine added everything at the end, it would be doing all the adding we set out to share. Each counting machine adds up only its own share." },
      ],
    },
    "reduce.how-many": {
      options: [
        { misconception: "m-one",
          feedback: "One number would mix all the words together. The output needs a count for each word, so the machine adds up each word's slips separately." },
        { feedback: "Right. Once the slips are sorted, equal words sit side by side, and each group becomes one total." },
        { misconception: "m-one",
          feedback: "That would leave the repeats unadded. Slips for the same word are added into one total, so fewer totals than slips come out." },
      ],
    },
    "skew.fix": {
      options: [
        { misconception: "m-more",
          feedback: "A new machine would take some of the other codes, but every {top} slip has the same hash, so all {topN} of them would still meet on one machine." },
        { misconception: "m-even",
          feedback: "Splitting the {top} slips across two machines leaves each with part of the count, so neither total is right unless a second job adds the parts together." },
        { feedback: "Right. Each reading machine sends one {top} slip carrying its count, so the busy machine has far fewer slips to add." },
      ],
    },
  },
};
