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
const PAPER = "J. Dean and S. Ghemawat, MapReduce: Simplified Data Processing on Large Clusters, OSDI 2004, https://research.google/pubs/pub62/";

export const lesson = {
  goal: "Count every word of a text exactly, with machines that each read only part of it.",
  // `stories`: the stories that teach an objective; the end card's "You can now…" lists only those (all when absent)
  objectives: [
    { id: "o-split", text: "Say why the text is cut into pieces and read in parallel, and what that buys.", stories: ["happy", "skew"] },
    { id: "o-hash", text: "Explain why every copy of a word must reach the same counter, and how a hash does it without asking anyone." },
    { id: "o-reduce", text: "Say what a counting machine writes: one total for each different word it holds.", stories: ["happy"] },
    { id: "o-crash", text: "Say why a crashed reading task can simply run again, even one that had finished.", stories: ["crash"] },
    { id: "o-slow", text: "Say why a backup copy of a slow piece is safe, and why only one copy's slips may count.", stories: ["straggler"] },
    { id: "o-skew", text: "Explain why one very common word overloads one counter, and why adding up repeats early helps where more machines or a backup don't.", stories: ["skew"] },
  ],

  misconceptions: [
    { id: "m-central", wrong: "Each machine counts its piece, and one machine adds it all up at the end.", fix: "Then one machine would add up every slip. Instead each word's slips meet on one counter, so the adding is shared too." },
    { id: "m-even", wrong: "Spreading the slips evenly over the counters is best.", fix: "Copies of one word would land on different counters, and none could give its full count." },
    { id: "m-one", wrong: "A counting machine adds all its slips into one number.", fix: "It adds each word's slips apart from the rest: one total for each different word it holds." },
    { id: "m-lost", wrong: "A crashed machine's words are lost, so the count comes out short.", fix: "Its piece is still in the input. Reading it again gives the same slips." },
    { id: "m-restart", wrong: "One failure restarts the whole job.", fix: "Only the failed machine's tasks run again." },
    { id: "m-done", wrong: "A reading task that had finished is safe when its machine dies later.", fix: "Its slips were on that machine's own disk, so they die with it, and the piece is read again." },
    { id: "m-wait", wrong: "The job has to wait for its slowest machine.", fix: "A backup copy of the slow piece on a free machine gives the same slips. The first copy to finish wins." },
    { id: "m-skip", wrong: "Skipping a slow piece is a fair price for finishing on time.", fix: "Its words would never be counted. MapReduce never trades a correct count for speed." },
    { id: "m-both", wrong: "Keeping both copies' slips is harmless: the extra copy is only a spare.", fix: "Both copies wrote slips for the same words, so keeping both counts those words twice." },
    { id: "m-more", wrong: "More counting machines would spread out one very common word.", fix: "The hash sends every copy of a word to one counter, however many there are. More machines only move other words." },
    { id: "m-backup", wrong: "A backup copy shares out a busy machine's work.", fix: "A backup does the same work again from the same input. It beats a slow machine, not a big pile of work." },
    { id: "m-readers", wrong: "More reading machines would share out a common word's slips.", fix: "The counter is picked from the word alone, so every copy still goes to the same counter however many machines read." },
    { id: "m-combine", wrong: "Adding up repeats early changes the counts.", fix: "Each early slip carries its count, and the counter adds those counts, so the total is the same." },
  ],

  picture: {
    name: "a library counted by a team",
    rows: [
      { id: "master", picture: "the coordinator handing out shelves", real: "the master", term: "master" },
      { id: "split", picture: "one shelf of books", real: "one piece of the text (a split)", term: "split" },
      { id: "mapper", picture: "a helper tallying their shelf", real: "a reading machine (a mapper)", term: "mapper" },
      { id: "slip", picture: "a tally slip “fox: 1”", real: "a record `(fox, 1)`: the word, and the number 1" },
      { id: "hash", picture: "“all slips for one word go to one person”", real: "a fixed rule on the word's letters (a hash) that picks one counting machine", term: "hash" },
      { id: "reducer", picture: "the person adding them up", real: "a counting machine (a reducer)", term: "reducer" },
      { id: "output", picture: "the noticeboard", real: "the output: a folder with one file per counting machine" },
    ],
    breaks: "Helpers would talk to agree who counts which word. Machines never talk about it: each one runs the same rule on the word and gets the same answer.",
  },

  // after the last story: the lessons this one leads into (the gallery's published pages)
  next: [
    { title: "Consistent hashing", href: "https://sites.irfanali.me/p/learning/consistent-hashing-ring.html",
      why: "Here `hash % R` picked each word's counter. Add one more counter and most words would move. A hash ring moves only a few." },
    { title: "Raft", href: "https://sites.irfanali.me/p/learning/raft-consensus.html",
      why: "The master here has no backup: if it dies, the whole job is stopped and must run again. Raft lets a group of machines agree, so losing one is not fatal." },
  ],

  terms: {
    master: { lead: "the coordinator", def: "The machine that hands out pieces of work, keeps track of them, and notices when a machine fails." },
    split: { lead: "one piece of the text", def: "One piece of the input, read by one machine, like one shelf of a library." },
    mapper: { lead: "a reading machine", def: "A machine running map: it reads one piece and writes a slip like (fox, 1) for every word." },
    combiner: { lead: "adding up early", def: "Code that adds up repeats on the reading machine itself, before any slip is sent." },
    hash: { lead: "a word's fixed number", def: "A function that turns a word into a big number. The same word always gives the same number." },
    shuffle: { lead: "sending each slip to its counter", def: "The step where every slip travels to the machine that adds up its word." },
    reducer: { lead: "a counting machine", def: "A machine running reduce: it adds up all the slips for its share of the words." },
    straggler: { lead: "a slow machine", def: "A machine much slower than the rest, so everyone ends up waiting for it." },
  },

  chapters: {
    split: {
      about: "Think of counting every word in a library with a team. One person would take ages, so a coordinator, the {term:master}, gives each helper one shelf: a {term:split}, one piece of the text.",
      "about@skew": "The same counting job on a web log. Each line is one website request, and its status code is a number saying how it went (200 OK, 404 not found). The {term:master} gives each machine one {term:split} of the log.",
      enter: { sofar: "On one machine, a loop and a dictionary count words: each word maps to its count so far.", now: "Cut the text into pieces, one per machine. The table names the parts; each comes back when its step plays.", done: "Every word sits in exactly one piece.", picture: true },
      "enter@skew": { sofar: "On one machine, a loop and a dictionary count things: each code maps to its count so far.", now: "Cut the log into pieces, one per machine.", done: "Every line sits in exactly one piece.", picture: true },
    },
    map: {
      about: "Each helper tallies their own shelf: each reading machine, a {term:mapper}, writes a slip like `(word, 1)`, meaning “this word, seen once”, for every word. Nobody waits for anybody.",
      "about@skew": "Each reading machine, a {term:mapper}, writes a slip like `(code, 1)` for every line of its piece. Nobody waits for anybody.",
      "about@crash": "Each reading machine, a {term:mapper}, writes slips like `(word, 1)` to its own disk, and the counters fetch them from there later. In this story one machine dies partway through its piece.",
      "about@straggler": "Each reading machine, a {term:mapper}, writes a slip for every word. One has a failing disk, a {term:straggler}, and falls far behind the others.",
      enter: { sofar: "The text is in {count:M|piece}, one per machine.", now: "Each machine turns its piece into slips, one per word.", done: "Every word of the text is a `(word, 1)` slip on some machine." },
      "enter@skew": { sofar: "The log is in {count:M|piece}, one per machine.", now: "Each machine turns its piece into slips, one per line.", done: "Every line of the log is a `(code, 1)` slip on some machine." },
      "enter@crash": { sofar: "The text is in {count:M|piece}, one per machine.", now: "Each machine turns its piece into slips, and one of them crashes.", done: "Every word still ends up as exactly one slip that counts." },
      "enter@straggler": { sofar: "The text is in {count:M|piece}, one per machine.", now: "Each machine turns its piece into slips, but one has a failing disk.", done: "Every word has exactly one slip that counts, even the slow piece's." },
    },
    shuffle: {
      about: "In {term:shuffle|the shuffle}, each slip travels to one counting machine. A {term:hash} turns the word into a number. Divide it by the number of counters: the remainder (with 2 counters, 0 or 1) names the counter.",
      "about@skew": "In {term:shuffle|the shuffle}, each slip goes to the counting machine its {term:hash} picks. {top} fills {topN} of the {n} lines, so where its slips go decides how busy each counter is.",
      enter: { sofar: "Every word is a `(word, 1)` slip, spread over the reading machines.", now: "Send each slip to one of the {count:R|counting machine}.", done: "Every slip sits on a counting machine, and you can say why it went there." },
      "enter@skew": { sofar: "Every line is a `(code, 1)` slip, spread over the reading machines.", now: "Send each slip to one of the {count:R|counting machine}.", done: "Every slip sits on a counting machine, and you can say why it went there." },
    },
    reduce: {
      about: "Each counting machine, a {term:reducer}, sorts its slips so equal words sit together, then adds up each group into one total.",
      "about@skew": "Each counting machine, a {term:reducer}, sorts its slips so equal codes sit together, then adds up each group into one total.",
      enter: { sofar: "All the slips for any one word sit on the same counting machine.", now: "Each counter adds up its own words.", done: "Each counter holds one total per word it was sent." },
      "enter@skew": { sofar: "All the slips for any one code sit on the same counting machine.", now: "Each counter adds up its own codes.", done: "Each counter holds one total per code it was sent." },
    },
    output: {
      about: "Each counter posts its totals to the shared output, like a list on a noticeboard. Together they hold exactly one count for every different word.",
      "about@skew": "Each counter posts its totals to the shared output, like a list on a noticeboard. Together they hold exactly one count for every different status code.",
      enter: { sofar: "Each counter holds one total per word it was sent.", now: "Post every total to the shared output.", done: "The output holds one count for each of the {distinct} different words." },
      "enter@skew": { sofar: "Each counter holds one total per code it was sent.", now: "Post every total to the shared output.", done: "The output holds one count for each of the {distinct} different codes." },
    },
  },

  steps: {
    // ---- Split ----
    "split.problem": {
      key: true,
      plain: "Count the words in “{text}”: {n} in all.",
      "plain@skew": "Count each status code in a web log of {n} requests.",
      why: "One machine alone would read all {n}, one after another. Shared by {M} machines, none reads more than {biggest}.",
      "why@skew": "It is the same job as counting words, with codes for words: shared by {M} machines, none reads more than {biggest}.",
      look: ["input"],
      deeper: {
        cost: "Alone: {n} reads, one after another. Shared {M} ways, the reading takes as long as the biggest piece: {biggest} reads.",
        real: "The paper cuts real input into pieces of 16 to 64 MB, and it often ran jobs of M = 200,000 map tasks on 2,000 machines, so each machine reads many pieces (§3.1, §3.5).",
        source: PAPER,
      },
    },
    "split.alone": {
      plain: "{n} words to count, and one machine reads every one of them.",
      "plain@skew": "Count each status code in a web log of {n} requests.",
      why: "With one machine there is nothing to share yet. Turn up “Reading machines” to split the work.",
      look: ["input"],
    },
    "split.cut": {
      key: true,
      plain: "The master hands out the text in {M} pieces of about {per} words, one per machine.",
      "plain@skew": "The master hands out the log in {M} pieces of about {per} lines, one per machine.",
      why: "The pieces are {pieces}. Each can be read without the others, so all {M} machines start at once.",
      look: ["{splitIds}"], picture: "split",
      deeper: {
        how: "Each record (here, a word or a line) belongs to exactly one piece; a piece may be read twice (a re-run or a backup), but only one reading counts. The paper's text reader cuts only at line boundaries (§4.4); Hadoop cuts by bytes: every reader but the first throws away everything up to its first line break, and each reads on past its end to finish the last line it started, so every line belongs to one reader. The master prefers to run each piece on a machine that already stores a copy of it, so most input is read from local disk, not over the network (§3.4).",
        source: PAPER,
      },
    },
    "split.one": {
      plain: "With one machine there is one piece: all {n} words.",
      "plain@skew": "With one machine there is one piece: all {n} lines.",
      look: ["{splitIds}"], picture: "split",
    },

    // ---- Map ----
    "map.handout": {
      plain: "Each machine gets its piece from the shared input; all {M} start at once.",
      look: ["{mapIds}"],
    },
    "map.handout-one": {
      plain: "The master hands the machine its piece.",
      look: ["{mapIds}"],
    },
    "map.read": {
      first: {
        key: true,
        why: "That is all map does: label each word with a 1. Adding must wait until a word's slips meet.",
        "why@skew": "Map labels each line with a 1, even repeats: every {slip} is a slip of its own.",
        picture: "slip",
        deeper: {
          how: "A real mapper buffers its slips, then writes them to its own local disk, divided into R regions, one per reduce task ({R} here, one per counting machine; Hadoop keeps them as parts of one indexed file). It tells the master where they are (§3.1).",
          code: "`emit(word, 1)` (lines 1–3)",
          source: PAPER,
        },
      },
      plain: "{map} writes a slip for each of its {count:count|word}, like {slip}.",
      "plain@skew": "{map} writes a slip for each of its {count:count|line}, like {slip}.",
      look: ["{mapId}"],
    },
    "map.empty": {
      plain: "{map} has an empty piece and finishes at once.",
      why: "There are more machines than words to share.",
      "why@skew": "There are more machines than lines to share.",
      look: ["{mapId}"],
    },
    "map.combine": {
      first: {
        key: true,
        why: "Fewer slips cross the network, and the counts don't change: adding gives the same total wherever it happens.",
        deeper: {
          how: "The paper calls this a combiner: usually the same code as reduce, run on each mapper's own slips. It is meant for a reduce that is commutative and associative (order and grouping don't change the result), as a sum is; an average, say, cannot be combined this simply (§4.3).",
          code: "`emit(word, sum(counts))` (lines 5–6)",
          source: PAPER,
        },
      },
      plain: "{map} runs a {term:combiner} first: its {count:before|slip} for {dups} become {after}.",
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
      plain: "{map} {tone:fail|crashes} after {upto} of {total} words; its {count:upto|slip} {be:upto} lost with it.",
      "plain@skew": "{map} {tone:fail|crashes} after {upto} of {total} lines; its {count:upto|slip} {be:upto} lost with it.",
      why: "Its slips were on its own disk, so they died with it: the grey slips marked “lost” no longer count.",
      look: ["{mapId}"],
      deeper: {
        how: "The master pings every worker. One that stops answering is marked failed (§3.3). In Hadoop a finished map can also be re-run while its machine is still up: when counters keep failing to fetch its slips, they report it and the master runs the map again.",
        edge: "Even finished map tasks on a dead machine run again, because their slips were on its local disk. Finished reduce tasks don't: their output is already in the shared file system (§3.3). Hadoop re-runs finished maps only while some reduce still needs their slips, and Spark with its external shuffle service keeps a dead worker's map output, so only a lost host forces a re-run.",
        real: "The master itself has no such cover: in the paper, if the master dies the job is aborted, and the client can notice and retry it if it wants; the paper notes that checkpoints of the master would be easy to add (§3.3). Hadoop on YARN restarts a job's master (its ApplicationMaster, mapreduce.am.max-attempts) and can recover the tasks already done.",
        source: PAPER,
      },
    },
    "crash.restart": {
      plain: "No other machine is free, so the master restarts {map}.",
      why: "A task can run on any machine, even the one that failed, once it is back.",
      look: ["{mapId}"],
    },
    "crash.rerun": {
      key: true,
      plain: "{helper} is free, so the master hands it {split}: the text is still in the input.",
      why: "The input is kept in several copies on different machines, so a crash loses work, not text.",
      look: ["{splitId}", "{helperId}"],
      deeper: {
        how: "The failed machine's tasks are handed out again. Counters that haven't yet fetched its slips are told to fetch from the re-run instead (§3.3).",
        real: "Real input lives in GFS, which keeps several copies of every 64 MB block (usually 3) on different machines. The master likes to run a map next to one of them, so the dead machine often held a copy too; the others survive (§3.4).",
        source: PAPER,
      },
    },
    "crash.reread": {
      plain: "{helper} reads {split} again and writes the same {count:total|slip}.",
      why: "Map uses nothing but the text, so the same piece gives the same slips: the counts stay exact.",
      look: ["{helperId}"],
      deeper: {
        edge: "This needs a deterministic map. If map used randomness or the clock, a re-run could write different slips, and the paper then promises only weaker guarantees (§3.3).",
        how: "A map task's slips count only once its machine reports “done” to the master with the names of its files. The crashed copy never reports, so its half-written slips are never handed to a counter. If two copies both report, the master ignores the second (§3.3).",
        source: PAPER,
      },
    },

    // ---- a machine is slow ----
    "slow.disk": {
      key: true,
      plain: "{map}'s failing disk keeps retrying reads: it has written {done} of {total} slips.",
      why: "Counting can't finish until every piece has been read, so one slow machine holds up the whole job.",
      look: ["{mapId}"],
      deeper: {
        real: "The paper's example: a bad disk with frequent correctable errors slows reads from 30 MB/s to 1 MB/s (§3.6).",
        source: PAPER,
      },
    },
    "slow.wait": {
      plain: "With no other machine, there is no backup: the job waits for all {count:total|word}.",
      why: "A backup needs a second machine. With one, the slowest disk sets the pace.",
      look: ["{mapId}"],
    },
    "slow.backup": {
      key: true,
      plain: "{helper} is free, so the master starts a {tone:busy|backup} copy of {split} on it.",
      why: "Two copies of one piece write the same slips, so whichever finishes first can be kept.",
      look: ["{helperId}", "{splitId}"],
      deeper: {
        how: "The master starts backups only when the job is close to done, for the tasks still running. That costs only a few percent more machine time (§3.6).",
        cost: "In the paper's sort benchmark, turning backups off made the job take 44% longer (§3.6, §5.3).",
        real: "Hadoop calls this speculative execution and turns it on by default for both map and reduce tasks (mapreduce.map.speculative, mapreduce.reduce.speculative); Spark has it off by default (spark.speculation).",
        source: `${PAPER}; Apache Hadoop, mapred-default.xml, https://hadoop.apache.org/docs/stable/hadoop-mapreduce-client/hadoop-mapreduce-client-core/mapred-default.xml; Apache Spark, Configuration, https://spark.apache.org/docs/latest/configuration.html`,
      },
    },
    "slow.race": {
      plain: "Both copies run: the backup writes its {count:total|slip} while {map} manages {more} more.",
      look: ["{helperId}", "{mapId}"],
    },
    "slow.tie": {
      plain: "Both copies finish: the master keeps the backup's slips and throws away {map}'s.",
      why: "If both copies counted, every word of {split} would be counted twice, so only one copy's slips are kept.",
      look: ["{mapId}"],
    },
    "slow.win": {
      plain: "The backup finishes first, so the master stops {map} with {short} of {total} words left unread.",
      why: "If both copies counted, every word of {split} would be counted twice, so the slow copy's slips are thrown away.",
      look: ["{mapId}"],
      deeper: {
        edge: "The paper only says the task is marked done when either copy finishes; stopping the slower copy, as here, is what Hadoop does. The paper also starts backups when the whole job is nearly done, where this run starts one once the other map tasks are done. Hadoop can start backups at any point in the job, for map and reduce tasks separately: for the attempts it estimates will finish latest, up to a cap (by default 10% of running tasks; mapred-default.xml, mapreduce.job.speculative.speculative-cap-running-tasks).",
        source: PAPER,
      },
    },

    // ---- Shuffle ----
    "shuffle.first": {
      key: true,
      plain: "{w} goes to {red}: its hash, {h}, divided by {R} leaves remainder {rem}.",
      why: "Dealt out in turn, a word's slips would land on several counters, and counters never compare notes.",
      "why@skew": "Dealt out in turn, a code's slips would land on several counters, and counters never compare notes.",
      look: ["{slipId}", "{redId}"], picture: "hash",
      deeper: {
        how: "Each mapper has already divided its slips into {R} regions, one per reduce task, and each counter fetches its region from every mapper. The fetching starts early: the master passes on each finished map's file locations as they come (§3.2). Only the final sort and the adding wait for the last map, which might still hold a slip they need (Hadoop sorts each map's slips on the map side and merges the sorted runs as they arrive).",
        cost: "In this model {shuffleBytes} bytes cross the network: each slip's word plus a 4-byte count (real formats add length headers, and a reader on the counter's own machine sends nothing). In the paper's clusters, network bandwidth was the scarce resource (§3.4).",
        edge: "Python's own hash() of a string changes from process to process (hash randomization) unless PYTHONHASHSEED is fixed, and can differ between Python versions, so two machines could disagree. Real jobs use a specified hash; this run uses FNV-1a.",
        real: "`hash(key) mod R` is only the paper's default partitioning function. A job can supply its own: `hash(Hostname(urlkey)) mod R` puts every page of one website in the same output file (§4.1). Within one counter, keys are handed to reduce in increasing order, which is why each output file comes out sorted (§4.2).",
        code: "`hash(word) % R` (lines 8–9)",
        source: PAPER,
      },
    },
    "shuffle.again": {
      key: true,
      plain: "{w} from {from} goes to {red} too: the same word always gives the same hash.",
      "plain@skew": "{w} from {from} goes to {red} too: the same code always gives the same hash.",
      why: "The hash looks only at the word's letters, so every copy meets on one counter, whichever reader sent it.",
      "why@skew": "The hash looks only at the code's characters, so every copy meets on one counter, whichever reader sent it.",
      look: ["{slipId}", "{redId}"],
    },
    "shuffle.send": {
      first: {
        why: "One counter takes many different words; it keeps each word's count apart.",
        "why@skew": "One counter takes many different codes; it keeps each code's count apart.",
      },
      plain: "{w} from {from} goes to {red} because {eq}.",
      "plain@skew": "{w} goes to {red} ({eq}): {count:load|slip} there so far, {rest} elsewhere.",
      look: ["{slipId}", "{redId}"],
    },

    // ---- your turn: a wrong pick in the shuffle, played out (s.choose "shuffle.which") ----
    "choose.sent": {
      plain: "{w} goes to {picked}, the counter you picked.",
      look: ["{slipId}", "{pickedId}"],
    },
    "choose.rest": {
      plain: "The other {count:rest|slip} go where their hash sends them.",
      look: ["{redId}"],
    },
    "choose.split": {
      key: true,
      plain: "{red} counts {w} = {here}, {picked} counts {w} = {there}. The text has {total}.",
      "plain@skew": "{red} counts {w} = {here}, {picked} counts {w} = {there}. The log has {total}.",
      why: "Each counter adds up only the slips it holds, so neither total is the full count.",
      look: ["{redId}", "{pickedId}"],
    },

    // ---- Reduce ----
    "reduce.sort": {
      first: {
        key: true,
        why: "Sorted, each word's slips sit together, so one pass adds them up, even when they don't fit in memory.",
        "why@skew": "Sorted, each code's slips sit together, so one pass adds them up, even when they don't fit in memory.",
        picture: "reducer",
        deeper: {
          how: "A dictionary of counts works while every different word fits in memory. The paper's reducer sorts by key instead, with a sort on disk when the data doesn't fit, then adds in one pass (§3.1); that also makes each output file come out sorted (§4.2). Hadoop does most of that sorting on the map side, and its reducer merges the sorted runs; for reduceByKey, Spark adds up in a hash table that spills sorted runs to disk instead. Here each beat swaps two slips.",
          code: "`reduce(word, counts)` (lines 11–12)",
          source: PAPER,
        },
      },
      plain: "{red} sorts its {count:got|slip} so equal words sit together.",
      "plain@skew": "{red} sorts its {count:got|slip} so equal codes sit together.",
      look: ["{redId}"],
    },
    "reduce.sorted": {
      plain: "{red}'s {count:got|slip} already arrive in order.",
      look: ["{redId}"],
    },
    "reduce.empty": {
      plain: "{red} got no slips, so its output file stays empty.",
      why: "No word in this text hashes to it.",
      "why@skew": "No code in this log hashes to it.",
      look: ["{redId}"],
    },
    "reduce.sum": {
      first: {
        key: true,
        why: "The hash sent every copy of these words here and nowhere else, so each total is the full count. The rest stay at 1: {ones}.",
        "why@skew": "The hash sent every copy of these codes here and nowhere else, so each total is the full count. The rest stay at 1: {ones}.",
      },
      plain: "{red} adds up each group: {sums}.",
      why: "The rest, seen only once, stay at 1: {ones}.",
      look: ["{sumIds}"],
    },
    "reduce.sum-all": {
      first: {
        key: true,
        why: "The hash sent every copy of these words here and nowhere else, so each total is the full count.",
        "why@skew": "The hash sent every copy of these codes here and nowhere else, so each total is the full count.",
      },
      plain: "{red} adds up each group: {all}.",
      look: ["{sumIds}"],
    },
    "reduce.single": {
      plain: "{red} has no repeated words, so each slip's count is already its total.",
      "plain@skew": "{red} has no repeated codes, so each slip's count is already its total.",
      look: ["{redId}"],
    },

    // ---- Output ----
    "output.write": {
      first: {
        why: "The output is a folder with one file per reduce task (here, per counter); this is {part}.",
        picture: "output",
        deeper: {
          how: "Reduce output goes to the shared file system, so a finished reduce never runs again, even if its machine dies later. If one reduce task does run twice (a backup or a re-run), each copy writes a private temporary file, then atomically renames it to the final name: exactly one copy's file survives (§3.3). That needs a file system whose rename is atomic: Hadoop lets only one attempt of each task commit, through an output committer (atomic with the v1 algorithm on HDFS; v2 trades that for speed), and on object stores without an atomic rename, like S3, it needs special committers.",
          edge: "The name part-r-00000 is Hadoop's convention. In the paper the user names the files: its word-count program writes /gfs/test/freq-00000-of-00100 and so on (§3.1, Appendix A).",
          source: `${PAPER}; Apache Hadoop, S3A committers, https://hadoop.apache.org/docs/stable/hadoop-aws/tools/hadoop-aws/committers.html`,
        },
      },
      plain: "{red} writes its {count:totals|total} to the output.",
      look: ["output"],
    },
    "output.done": {
      key: true,
      plain: "Done: all {n} words counted, {distinct} different ones, and no machine read the whole text.",
      why: "Every count is exact because every copy of a word met on one counter; the what-ifs test that with a crash, a slow disk and a common word.",
      look: ["output"],
      deeper: {
        cost: "The reading took as long as the biggest piece ({count:biggest|word}), not all {n}. The price: every slip crossed the network once, {shuffleBytes} bytes here.",
        real: "Google often ran jobs as large as M = 200,000 map tasks and R = 5,000 reduce tasks on 2,000 machines (§3.5); the average job in August 2004 used 157 machines, 3,351 map tasks and 55 reduce tasks (Table 1).",
        source: PAPER,
      },
    },
    "output.done@crash": {
      key: true,
      plain: "Done: all {n} words counted exactly once, despite the crash.",
      why: "The lost piece was read again from the input, and the dead copy's slips never reached a counter.",
      look: ["output"],
      first: {
        when: (v) => v.own > 0,
        deeper: {
          cost: "Redoing the lost piece cost time: {twiceMap} read {count:twice|word} back to back (its own {own}, then the lost piece), where the biggest piece alone is {biggest}. In all {reads} words were read, not {n}: the dead machine's {wasted} were wasted.",
          source: PAPER,
        },
      },
      deeper: {
        cost: "Redoing the lost piece cost time: one machine read two pieces back to back, up to twice the biggest piece ({count:biggest|word}). Words the dead machine read before it crashed are read again, so “words read” can end above {n}.",
        source: PAPER,
      },
    },
    "output.done@straggler": {
      key: true,
      plain: "Done: all {n} words counted exactly once, despite the slow disk.",
      why: "The backup's slips counted and the slow copy's were thrown away, so no word was counted twice.",
      look: ["output"],
      first: {
        when: (v) => v.own > 0,
        deeper: {
          cost: "The backup cost {twiceMap} a second piece: {count:twice|word} back to back (its own {own}, then the slow piece), but that beat waiting for the failing disk. In all {reads} words were read, not {n}: the slow copy's {wasted} were thrown away.",
          source: PAPER,
        },
      },
      deeper: {
        cost: "The backup cost one machine a second piece: up to twice the biggest piece ({count:biggest|word}) back to back, and the slow copy's reads are thrown away, so “words read” can end above {n}. That still beats waiting for the failing disk.",
        source: PAPER,
      },
    },
    "scale.cluster": {
      key: true,
      plain: "The same job at the paper's scale: {paperM} map tasks, {paperR} reduce tasks, {machines} machines. Shown simplified.",
      why: "A task is one piece of reading or counting work. Each machine runs many in turn; every word still meets one counter.",
      look: ["output"],
      deeper: {
        real: "The paper often ran jobs with M = 200,000 and R = 5,000 on 2,000 worker machines (§3.5). With far more tasks than machines, each machine runs many small tasks: that balances the load, and when a machine dies its finished map tasks spread over all the others (§3.5).",
        how: "This view is a simplified picture, not a simulation: the field has the paper's machine count, built from silhouettes of this run's {runMachines} machines, and each light only shows a machine as busy or between tasks. The counts above come from the run on this page.",
        source: PAPER,
      },
    },
    "output.done-alone": {
      key: true,
      plain: "Done: all {n} words counted, {distinct} different ones.",
      why: "One machine read every word. Turn up “Reading machines” to share the reading.",
      look: ["output"],
    },

    // ---- a very common word ----
    "skew.done": {
      key: true,
      plain: "Done. {hot} got {load} of {moved} slips, {share}× an even share ({moved} ÷ {R} ≈ {even}).",
      why: "{top} fills {topN} of the {n} lines, and every raw {top} slip must meet on one counter; other codes can hash there too.",
      look: ["{hotId}"],
      deeper: {
        real: "Real data is like this: word frequencies follow Zipf's law, so a few keys, like “the”, carry much of the data (§4.3).",
        edge: "With few different keys, the hash alone can lump several on one counter and leave another idle, so part of the overload is chance, not frequency: here {hot} got {count:codes|different code} of the {distinct}.",
        cost: "The job ends when its last counter ends, so the busy counter sets the pace, like the slow disk in “One machine is slow”. A backup copy cannot help here: it would get the same {load} slips (§3.6).",
        source: PAPER,
      },
    },
    "skew.more": {
      key: true,
      plain: "With {R2} counters, every {top} would still go to one: {load2} of {slips} slips, {topN} of them {top}.",
      why: "More counters spread out different codes, never the copies of one code: those must meet to be counted.",
      look: ["{hotId}"],
      deeper: {
        cost: "This line runs the run's own hash with one more counter: {eq2}. A counter's share of a key is all of it or none of it, so the busiest counter gets at least {topN} of the {slips} slips whatever the count of counters.",
        edge: "The partitioning function sees only the key (§4.1), so every value of a key goes to one reduce task, which gets them in one call (§2). The fix has to shrink the key's data before the shuffle, or rename the key.",
        source: PAPER,
      },
    },
    "skew.combine": {
      key: true,
      plain: "If each reader ran a {term:combiner} first, {count:sent|slip} would travel, {hotC} to {hot}.",
      why: "{exMap}'s {count:exN|slip} for {top} would travel as one slip, {exSlip}: fewer slips to add, the same total.",
      look: ["{hotId}"],
      deeper: {
        cost: "After combining, {hot} still gets one slip per reader for each code it owns: {hotC} here, not 1. The gain is how often a code repeats inside one piece; at the paper's M = 200,000 map tasks, one hot key can still bring about one slip per map task, some 200,000, to one counter (§3.5); in Hadoop more, when a map's spills are not all combined.",
        how: "Turn on “Add up repeats first” to watch each reader do it. The paper suggests a combiner where reduce is commutative and associative, as a sum is: order and grouping don't change the result (§4.3). Its output must be the same kind of (word, count) slip that reduce takes. An average, say, must travel as (sum, count) pairs: an average of averages is wrong.",
        edge: "Hadoop treats the combiner as an optimisation it may run zero, one or many times on a map's output, so it must never change the answer. And a combiner helps only when partial results merge: a reduce that needs every value at once (a median, a sorted list) still sends the hot key's whole list to one machine. “Salting” adds a suffix to the hot key so its slips spread over several counters, and a second job merges the parts. That works when the parts merge (sums, counts, sorted runs); a true median needs another second step, such as a histogram or range partitioning on the value. The suffix must be deterministic, so a re-run task sends each line where the first run did.",
        real: "Spark's reduceByKey adds up on each reader first, like a combiner; groupByKey ships every value, and Spark's guide warns to prefer reduceByKey or aggregateByKey for sums and averages.",
        source: `${PAPER}; T. White, Hadoop: The Definitive Guide, 4th ed., O'Reilly 2015, ch. 2, “Combiner Functions”; Apache Spark, RDD Programming Guide, https://spark.apache.org/docs/latest/rdd-programming-guide.html`,
      },
    },
  },

  // the reader's pick in the world, by choose id: the figure decides which option is right; `wrong` words every other one
  choices: {
    "shuffle.which": {
      prompt: "The first {w} went to {firstRed}. Click the counting machine that should get this one, from {from}.",
      why: "{w} always hashes to the same number, so every copy of it meets on {firstRed}.",
      wrong: { misconception: "m-even",
        feedback: "Now the slips for {w} sit on two counters. Each adds up only what it holds, so neither can give the full count." },
    },
  },

  // the end check, by check id: answers come from the figure's own rules at other knob values; the lesson says why
  checks: {
    "check.hash": {
      question: "Suppose a new job with {R2} counting machines instead of {R}. Where do the {count:topN|slip} for {w} go?",
      why: "hash({w}) is the same on every machine, so every copy goes to one counter. Divided by {R2}, it leaves remainder {rem2}: all go to {red2}.",
      options: [
        { misconception: "m-even", feedback: "Spread out, the slips for {w} would sit on several counters, and none could give its full count." },
        {},
        { misconception: "m-even", feedback: "Counters never compare notes, so copies sent wherever there is room could never be added together." },
      ],
    },
    "check.crash-done": {
      question: "Suppose {other} had finished all its slips, and then its machine died. What happens to its piece?",
      why: "Its slips sat on its own disk, which died with it. The piece is still in the input, so the master has it read again.",
      options: [
        { misconception: "m-done", feedback: "Finished isn't safe: its slips lived on that machine's own disk, and the counters still need them." },
        {},
        { misconception: "m-restart", feedback: "The other machines still hold their slips. Only the dead machine's pieces run again." },
      ],
    },
    "check.both": {
      question: "Suppose the master kept the slips of both copies of {split}. What would the output say for {w}?",
      why: "The backup wrote a slip for every word of {split}. The slow copy had already written {count:wrote|slip}, one of them for {w}. Kept together, {w} counts {kept}, but the text has {real}.",
      // the figure's options are always [the true count, the answer, one more], in that order
      options: [
        { misconception: "m-both", feedback: "Both copies read {w}, so keeping both copies' slips counts it twice: {kept}, not {real}." },
        {},
        { feedback: "Only the words both copies read count twice, and the slow copy stopped after {count:wrote|slip}." },
      ],
    },
    "check.one": {
      question: "Same failing disk, but the job has only 1 reading machine. What does the master do?",
      why: "A backup needs a second machine to run on. With one, the job waits for the slow disk.",
      options: [
        { feedback: "There is no other machine to run it on: a backup needs a free second machine." },
        {},
        { misconception: "m-skip", feedback: "Its words would never be counted. The master never trades a correct count for speed." },
      ],
    },
    "check.combine": {
      question: "Suppose “Add up repeats first” were on. What would the output say for {w}?",
      why: "Each of the {count:readers|reader} that saw {w} sends one slip carrying its own count ({parts}). The counter adds the counts: {topN}, as before.",
      // the figure's options are always [one per reader, the answer, the two added], in that order
      options: [
        { misconception: "m-combine", feedback: "That counts the slips, one per reader. The counter adds the numbers on the slips, so the total stays {topN}." },
        {},
        { misconception: "m-combine", feedback: "Nothing is counted twice: each early slip replaces the 1s it adds up. The total stays {topN}." },
      ],
    },
    "check.backup": {
      question: "Would a backup copy of {hot}, on a free machine, finish its adding sooner?",
      why: "A backup does the same work again from the same input: it helps a slow machine, not a big job. {hot} has {load} slips either way.",
      options: [
        { misconception: "m-backup", feedback: "A backup is a second copy of the same task, not half of it: it gets all {load} slips too." },
        {},
        { misconception: "m-backup", feedback: "First to finish wins only when one copy is slowed down. Both copies have {load} slips to add, so neither finishes sooner." },
      ],
    },
    "check.readers": {
      question: "Suppose {M2} reading machines instead of {M}, nothing else changed. How many of the {moved} slips would {hot} get?",
      why: "The counter is picked from the code alone, so every slip goes where it went before: {hot} still gets {load}.",
      wrong: { misconception: "m-readers", feedback: "Who reads a line doesn't change where its slip goes: the hash looks only at the code, so {hot} still gets {load}." },
    },
    "check.split": {
      question: "Suppose a new job with {M2} reading machines instead of {M}. How many words does the busiest one read?",
      "question@skew": "Suppose a new job with {M2} reading machines instead of {M}. How many lines does the busiest one read?",
      why: "{n} words shared by {M2} machines: the biggest piece has {big2}.",
      "why@skew": "{n} lines shared by {M2} machines: the biggest piece has {big2}.",
    },
    "check.new-word": {
      question: "Add the word {w}, which the text does not have yet. How many totals would the output hold?",
      why: "The output holds one total per different word. {w} is a new one, so it gets a total of its own: {distinct} becomes {distinct2}.",
      options: [
        { feedback: "A total belongs to one word. {w} matches none of the {distinct}, so it can't join one of their totals." },
        {},
        { misconception: "m-one", feedback: "That counts every word read. Repeats share one total, so the output holds one per different word: {distinct2}." },
      ],
    },
    "check.totals": {
      question: "Same {count:M|reading machine} and {count:R|counting machine}: add one more {w} to the text. How many totals would the output hold?",
      "question@skew": "Same {count:M|reading machine} and {count:R|counting machine}: add one more {w} to the log. How many totals would the output hold?",
      why: "The output holds one total per different word. One more {w} changes its count, not how many totals there are: {distinct}.",
      "why@skew": "The output holds one total per different code. One more {w} changes its count, not how many totals there are: {distinct}.",
      wrong: { feedback: "{w} already has a total, so one more only raises that total by 1. New totals come only from new words." },
      "wrong@skew": { feedback: "{w} already has a total, so one more only raises that total by 1. New totals come only from new codes." },
    },
  },

  // the figure's predictions, by ask id: options pair with the figure's by index, and the figure decides which is right
  asks: {
    "crash.what": {
      options: [
        { misconception: "m-lost",
          feedback: "Only if nobody read the piece again. Its text is still in the shared input, so the master hands it out once more." },
        { feedback: "Right. Reading the same piece again gives the same slips, so redoing just that one piece is safe." },
        { misconception: "m-restart",
          feedback: "Nothing else was lost: the other machines still hold their slips. Only the dead machine's piece runs again." },
      ],
    },
    "slow.what": {
      options: [
        { misconception: "m-wait",
          feedback: "Waiting works, but then the whole job takes as long as the slowest disk. A free machine could read the same piece." },
        { feedback: "Right. Reading a piece twice gives the same slips, so a backup is safe, and the first copy to finish wins." },
        { misconception: "m-skip",
          feedback: "Then those words would never be counted, and the answer would be wrong. Speed never buys a wrong count here." },
      ],
    },
    "skew.where": {
      options: [
        { misconception: "m-even",
          feedback: "Spreading would split the slips for {w} between counters that never compare notes, so no counter could give its full count." },
        { feedback: "Right. {w} always hashes to the same number, so every copy of it lands on {firstRed}, however busy it gets." },
        { misconception: "m-central",
          feedback: "Then one machine would add up every slip, the very work we shared out. Here each counter adds up only its own share." },
      ],
    },
    "reduce.how-many": {
      options: [
        { misconception: "m-one",
          feedback: "One number would mix the words together. The output needs a count for each word, so a counter adds each word's slips apart." },
        { feedback: "Right. Sorted, equal words sit side by side, and each group becomes one total." },
        { misconception: "m-one",
          feedback: "That would leave the repeats unadded. Slips for the same word are added into one total, so fewer totals than slips come out." },
      ],
    },
    "skew.fix": {
      options: [
        { misconception: "m-more",
          feedback: "With {R2} counters every code is dealt again, but all of {top}'s slips still land together: {load2} of {slips} on one counter." },
        { misconception: "m-even",
          feedback: "Then {top}'s slips would sit on two counters, and neither total would be right on its own, unless a second job adds the parts." },
        { feedback: "Right. Each reader sends one {top} slip carrying its count, so the busy counter has far fewer slips to add." },
      ],
    },
  },
};
