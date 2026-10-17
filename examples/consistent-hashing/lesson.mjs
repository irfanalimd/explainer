// The words the consistent hashing figure teaches (CONTRACTS.md 10), keyed by the step ids in figure.mjs. The figure
// owns every fact and passes it as a var; nothing here computes. Every line stays true at every knob value (4–6
// servers, 6–24 keys, 1–8 seats per server, any seed): where a sentence holds only for some runs it carries a `when`,
// and claims about "most" are stated as averages, which hold whatever one run's luck.
//   every step:    K (keys), N (servers at the start)
//   simple:        rule, boxIds; per, servers, example, exampleId, eq
//   more.move:     extra, extraId, n1, moved, stayed, rule, fair (the ask more.moved reads these too)
//   ring:          again, ringIds; seats, total, order, biggest, biggestId, share, tokenIds
//   keys:          key, keyId, hash, angle; server, serverId, tokenId, seat, hops; share, count, arcs, keys, keyIds;
//                  rest; loads, servers, hot, hotId, hotKeys
//   add:           extra, extraId, tokenId, hash, seats, pred, predId, predTokenId, predKeys;
//                  moved, stayed, from, fromIds, keys, keyIds (the ask add.which reads these)
//   leave:         victim, victimId, count, share, seats, tokenIds, keys, keyIds; dests, destIds (ask leave.where)
//   vnodes.more:   seats, was, changed, keyIds, before, after, total
//   result:        moved, n1, fair, modm, keyIds · seats, top, topId, share, ratio · heavy, heavyId, share, left,
//                  modm, dests, rule · spread, alone, heavy, heavyId, ratio, big64, big256, left, dests
const KARGER = "D. Karger, E. Lehman, T. Leighton, R. Panigrahy, M. Levine, D. Lewin, Consistent Hashing and Random Trees, STOC 1997, https://doi.org/10.1145/258533.258660";
const DYNAMO = "G. DeCandia et al., Dynamo: Amazon's Highly Available Key-value Store, SOSP 2007, https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf";
const CASSANDRA = "Apache Cassandra, Production recommendations (num_tokens), https://cassandra.apache.org/doc/latest/getting-started/production.html";
const JUMP = "J. Lamping and E. Veach, A Fast, Minimal Memory, Consistent Hash Algorithm, 2014, https://arxiv.org/abs/1406.2294";
const WHITE = "T. White, Consistent Hashing (2007), https://tom-e-white.com/2007/11/consistent-hashing.html";

export const lesson = {
  goal: "Share keys among servers so that a server joining or leaving moves only the keys it must.",

  objectives: [
    { id: "o-mod", text: "Compute roughly how many keys the remainder way moves when one more server joins." },
    { id: "o-owner", text: "Perform a lookup on the ring: find the server that stores a key, wrapping past the top." },
    { id: "o-add", text: "Predict which keys move when a server joins the ring, and which server they come from." },
    { id: "o-leave", text: "Explain where a leaving server's keys go, with one seat per server and with many." },
    { id: "o-even", text: "Explain why one seat per server shares the ring unevenly, and how more seats even it out." },
  ],

  misconceptions: [
    { id: "m-fair", wrong: "Adding a server only moves its fair share of the keys, whatever rule places them.",
      fix: "With the remainder way, dividing by a new number changes almost every remainder, so most keys move." },
    { id: "m-reshuffle", wrong: "Any change in the servers reshuffles keys everywhere, on the ring too.",
      fix: "On the ring, only the keys in the arc that changes hands move; every other key keeps its server." },
    { id: "m-even", wrong: "When a server leaves, its keys spread evenly over the servers that are left.",
      fix: "Each key walks on clockwise, so with one seat per server they all land on the next server." },
  ],

  picture: {
    name: "guests around a round table",
    rows: [
      { id: "table", picture: "a round table whose seats are numbered all the way round", real: "the hash ring: every number from 0 to 2^32 − 1", term: "ring" },
      { id: "seat", picture: "the seat a host's name points to", real: "a server's position, the hash of its name", term: "hash" },
      { id: "guest", picture: "a guest who walks clockwise and sits with the first host", real: "a key, stored on the first server clockwise" },
      { id: "stretch", picture: "the stretch of table a host looks after", real: "a server's arc, from the seat before it to its own", term: "arc" },
      { id: "chair", picture: "a newcomer pulling up a chair in one stretch", real: "a server joining: it takes the keys just before its seat" },
      { id: "chairs", picture: "one host keeping several chairs around the table", real: "virtual nodes: many seats for one server", term: "virtual node" },
    ],
    breaks: "Real guests pick a free seat. Here nobody chooses: a hash fixes every seat, so seats can bunch up and one host can get a huge stretch.",
  },

  terms: {
    hash: { lead: "a name's fixed number", def: "A scrambling recipe that turns a name into a big number, the same number every time." },
    ring: { lead: "the circle of numbers", def: "Every possible number from 0 to about 4.3 billion, bent into a circle that wraps back to 0." },
    arc: { lead: "a server's stretch", def: "The stretch of the circle from one server's seat back to the seat before it." },
    "virtual node": { lead: "an extra seat", def: "One of several seats a single server takes on the circle." },
  },

  chapters: {
    simple: {
      about: "Like counting off into {N} teams. Each key's name becomes a number with a {term:hash}; divide it by {N}, and the remainder picks the server.",
      enter: { sofar: "You can look a value up by its key in a dictionary.", now: "Spread the keys over several servers with one sum anyone can do.", done: "Every key sits in the box its remainder names." },
    },
    more: {
      about: "Now there are {n1} servers, so every key's number is divided by {n1} instead of {N}. The remainders change, and each key follows its new remainder.",
      enter: { sofar: "Each key sits on server `hash % {N}`.", now: "Add one server, so every key divides by one more.", done: "The “moved, remainder” counter shows how many keys changed box." },
    },
    ring: {
      about: "Think of a round table whose seats are every {term:hash} number, bent into a {term:ring}. Each server sits where its name hashes to.",
      enter: { sofar: "The remainder way re-sorted every key, but a key stayed only if both remainders matched.", now: "Bend every hash number into a circle and seat each server at its name's hash.", done: "Each server has its seats, and the seats split the circle into arcs of different sizes.", picture: true },
      "enter@remove": { sofar: "You can look a value up by its key; here the keys live on several servers.", now: "Bend every hash number into a circle and seat each server at its name's hash.", done: "Each server has a seat, and the seats split the circle into arcs of different sizes.", picture: true },
      "enter@vnodes": { sofar: "You can look a value up by its key; here the keys live on several servers.", now: "Bend every hash number into a circle and seat each server at its name's hash.", done: "Each server has a seat, and the seats split the circle into arcs of different sizes.", picture: true },
    },
    keys: {
      about: "Each key's name is hashed to a spot on the ring too. Like a guest finding a host, the key walks clockwise and sits with the first server it meets.",
      enter: { sofar: "Every server has a seat on the ring.", now: "Hash each key onto the ring too, and walk clockwise to its server.", done: "Every key takes the colour of the first server seat after it." },
    },
    add: {
      about: "A new server pulls up a chair inside an arc. It takes only the keys between the seat before its own and its own; every other key stays put.",
      enter: { sofar: "Each key sits with the next server clockwise.", now: "Seat one more server, {extra}, on the ring.", done: "Only keys just before {extra}'s new seat change colour." },
    },
    leave: {
      about: "A server leaves the table. The keys it held walk on clockwise to the next seat still there; no other key moves.",
      enter: { sofar: "Each key sits with the next server clockwise.", now: "Take a server with the most keys, {victim}, off the ring.", done: "Only {victim}'s keys change colour; every other key keeps its own." },
      "enter@vnodes": { sofar: "Each server now owns {seats} small arcs around the ring.", now: "Take a server with the most keys, {victim}, off the ring.", done: "Only {victim}'s keys change colour; every other key keeps its own." },
    },
    vnodes: {
      about: "Each server takes more seats around the table, called {term:virtual node|virtual nodes}, so it owns many small arcs. Each new seat splits an arc, so a few keys move; real servers start with all their seats.",
      enter: { sofar: "With one seat each, the arcs come out uneven, so one server can carry far more than the rest.", now: "Give every server more seats, doubling the count each time.", done: "The “busiest server” meter shows the biggest share against the average; 1× is perfectly even." },
    },
    result: {
      about: "On the ring, only the keys in the split arc moved: on average one key in {n1}. The remainder way moves on average {N} keys in {n1}, and every moved key is data copied over the network.",
      enter: { sofar: "The new server took keys only from the arc it split; every other key stayed.", now: "Compare the keys each way moved, and check how evenly the ring is shared.", done: "The two moved counters sit side by side: the ring's and the remainder way's." },
      "about@remove": "The ring moved the leaver's keys and nothing else. The remainder way would divide every key by a new number instead, and move keys on every server.",
      "enter@remove": { sofar: "Only the leaver's keys moved, each to the next seat clockwise.", now: "See who carries the load now, and what the remainder way would have moved.", done: "The busiest server's share sits beside the remainder way's moved count." },
      "about@vnodes": "With many seats per server, each server owns many small arcs. A leaver's keys can spread out, and on average the shares stay closer to even than with one seat each.",
      "enter@vnodes": { sofar: "Only the leaver's keys moved, each to the next seat clockwise.", now: "See how evenly the servers that are left share the ring.", done: "The busiest-server meter shows the share against the average." },
    },
  },

  steps: {
    // ---- The simple way (add) ----
    "simple.intro": {
      plain: "{N} servers share {K} keys. Each key goes to server {rule}.",
      why: "Any machine can work out a key's server by itself, with no table to look up.",
      look: ["{boxIds}"],
      deeper: {
        how: "The servers are numbered from 0: remainder 0 is db01, 1 is db02, and so on.",
        code: "Python: `servers[hash(key) % len(servers)]` (line 19).",
      },
    },
    "simple.place": {
      plain: "Each key goes to the box its remainder names. {example}: {eq}.",
      look: ["{exampleId}"],
      deeper: {
        how: "The boxes hold {per} keys. A good hash makes every remainder equally likely, so on average the boxes fill evenly; with only {K} keys they wobble.",
      },
    },

    // ---- One more server (add) ----
    "more.move": {
      key: true,
      plain: "{extra} joins, so every key now uses {rule}: {moved} of {K} change server.",
      why: "Changing the divisor changes most remainders, so the keys are dealt out again almost from scratch.",
      look: ["{extraId}"],
      deeper: {
        cost: "On average {N} keys in every {n1} move, the fraction N/(N + 1); one in {n1} is all that must. Here {moved} of {K} moved.",
        how: "A key keeps its server only if hash % {N} equals hash % {n1}. That holds for 1 number in {n1}, so the bigger the cluster, the worse it gets.",
        edge: "With only {K} keys, luck swings the count above or below the average; with millions of keys it lands very close.",
        real: "Early web caches spread keys this way. Tom White's widely linked 2007 write-up uses this reshuffle to motivate the ring.",
        source: WHITE,
      },
    },

    // ---- The ring (parts) ----
    "ring.intro": {
      plain: "Now the ring way, with the same {N} servers. 0 is at the top; numbers rise clockwise.",
      "plain@remove": "{N} database servers, and a ring of every hash number. 0 is at the top.",
      "plain@vnodes": "{N} database servers, and a ring of every hash number. 0 is at the top.",
      why: "After the largest number comes 0 again, so the ring has no end and no last server.",
      look: ["{ringIds}"], picture: "table",
      deeper: {
        how: "This ring is every 32-bit number, 0 to 4,294,967,295. The labels round it are hash values in hex.",
        real: "This run hashes with 32-bit MurmurHash3. Dynamo used 128-bit MD5 (§4.2); Cassandra's default uses 64-bit numbers from MurmurHash3.",
        source: DYNAMO,
      },
    },
    "ring.seats": {
      first: {
        when: (v) => v.seats === 1,
        plain: "Each server sits at its name's hash. The gaps differ: {biggest}'s {term:arc} is {share}.",
        why: "Nobody picks the seats; the hash does, so some gaps come out far wider than others.",
        deeper: {
          how: "A server's arc runs from the seat before it up to its own seat, and it stores every key that lands there.",
          edge: "With one random seat each, the biggest arc is not 1/N of the ring: on average it is about (ln N + 0.58)/N, roughly 52% for 4 servers.",
          real: "Karger et al. give each server about log N seats to fix this: then every share is within a constant factor of fair.",
          source: KARGER,
        },
      },
      key: true,
      plain: "Each server takes {seats} seats, its name and variants: {total} seats, {total} {term:arc|arcs}.",
      why: "Each server's share is now many small arcs added up, not one lucky or unlucky gap.",
      look: ["{tokenIds}"], picture: "seat",
      deeper: {
        how: "Seat i of db01 is the hash of the name db01#i, so every machine works out the same seats.",
        source: KARGER,
      },
    },

    // ---- Keys ----
    "keys.hash": {
      plain: "{key} is hashed the same way: it lands at {hash}, {angle} round the ring.",
      why: "Keys and servers now live on one number circle, so we can compare their places.",
      look: ["{keyId}"],
      deeper: {
        how: "The angle is the hash as a fraction of the whole ring: {hash} out of 2^32.",
        edge: "Tiles are nudged a few degrees apart so they don't overlap; the tag shows the exact hash.",
      },
    },
    "keys.walk": {
      key: true,
      plain: "Walk clockwise from {key}: the first seat is {server}'s, so {server} stores it.",
      why: "{key} sits in {server}'s arc. Every machine can do this same walk, so they all agree.",
      look: ["{tokenId}", "{keyId}"], picture: "guest",
      deeper: {
        cost: "One binary search over the sorted seats: O(log S) for S seats, with no message to anyone.",
        how: "Find the first seat at or after the key's hash. Past the top, wrap round to the first seat.",
        code: "`i = bisect_left(ring, (h, \"\"))` then `ring[i % len(ring)]` (lines 15–16).",
        edge: "A key whose hash equals a seat's exactly belongs to that seat: bisect_left finds it, so each arc includes its own end.",
      },
    },
    "keys.arc": {
      first: {
        why: "An arc ends at its server's seat, so every key inside it walks to that server.",
        picture: "stretch",
      },
      plain: "{server}'s {count:arcs|arc}: {share} of the ring, {count:count|key}.",
      look: ["{tokenId}", "{keyIds}"],
    },
    "keys.rest": {
      plain: "The other {rest} keys do the same, each in the colour of its arc's server.",
      look: ["{keyIds}"],
    },
    "keys.loads": {
      plain: "Keys per server: {loads}. {hot} owns the most ring: {share}.",
      why: "A bigger arc catches more keys on average, so where the seats fall sets the load.",
      look: ["{hotId}"],
      deeper: {
        how: "Each key's hash is like a random point, so a server's expected keys are K times its share of the ring. With only {K} keys, counts wobble around that.",
      },
    },

    // ---- Add a server ----
    "add.join": {
      first: {
        when: (v) => v.seats === 1,
        plain: "{extra} joins at {hash}, inside {pred}'s arc. It waits, empty.",
        why: "Which keys now meet {extra} first on their clockwise walk?",
        look: ["{tokenId}", "{predTokenId}"],
      },
      plain: "{extra} joins with {seats} seats, landing in {seats} arcs. It waits, empty.",
      why: "Which keys now meet one of {extra}'s seats first on their clockwise walk?",
      look: ["{tokenId}"], picture: "chair",
      deeper: {
        how: "A real server copies its keys first and starts answering for them after, so nothing is lost while they move.",
        real: "In Dynamo the existing nodes hand over the key ranges a new node now owns (§4.9).",
        source: DYNAMO,
      },
    },
    "add.move": {
      first: {
        when: (v) => v.moved > 0,
        plain: "{extra} takes {count:moved|key} from {from}; the other {stayed} stay put.",
        why: "Every other key's clockwise walk still ends at the same seat, so nothing else changes.",
        look: ["{extraId}", "{keyIds}"],
        deeper: {
          cost: "On average K/(N + 1) keys move, the least any rule can: here {moved} of {K}.",
          how: "Karger et al. call this smoothness: a new server takes keys only from the arcs its seats split.",
          real: "Dynamo adds a node the same way; only the nodes that owned its new ranges send data (§4.9).",
          source: KARGER,
        },
      },
      key: true,
      plain: "None of the {K} keys sit just before any of {extra}'s seats, so nothing moves.",
      why: "Every key's clockwise walk still ends at the same seat as before.",
      look: ["{extraId}"],
      deeper: {
        cost: "On average K/(N + 1) keys move; with only {K} keys, an arc can be empty.",
        source: KARGER,
      },
    },

    // ---- A server leaves ----
    "leave.drain": {
      plain: "{victim} is leaving. It holds {count:count|key}, {share} of the ring.",
      why: "No server holds more keys, so this leave moves as much data as any could.",
      look: ["{victimId}", "{keyIds}"],
      deeper: {
        how: "Its seats dim while it drains. They leave the ring only as its keys move, so every key always has a server.",
      },
    },
    "leave.move": {
      first: {
        when: (v) => v.dests.length === 1,
        plain: "Each key walks on clockwise, so all {count} land on {dests}. No one else changes.",
        why: "Every one of those keys reaches the same next seat, so one server takes the whole load.",
      },
      key: true,
      plain: "Each key walks on clockwise from its spot: {count} keys spread over {dests}.",
      why: "{victim}'s seats sat in different arcs, so its keys reach different next seats.",
      look: ["{destIds}", "{keyIds}"], picture: "guest",
      deeper: {
        how: "No key that {victim} did not hold moves: their walks never passed its seats.",
        edge: "Real stores keep copies: Dynamo writes each key to the next few distinct servers clockwise, so the next server already has a copy when one leaves (§4.3).",
        real: "Dynamo's paper gives this spread as the reason for many seats: a failed node's load is shared by the rest (§4.2).",
        source: DYNAMO,
      },
    },

    // ---- Many seats each ----
    "vnodes.more": {
      first: {
        key: true,
        why: "A server's share is now a sum of many small arcs, and sums of many pieces vary less.",
        picture: "chairs",
        deeper: {
          how: "Each new seat splits one arc, so only the keys just before it change server.",
          edge: "The spread shrinks slowly, about as 1/√seats: 4 times the seats only halves the unevenness, so one doubling can even make it worse.",
          real: "Karger et al. show about log N seats per server keep every share within a constant factor of fair.",
          source: KARGER,
        },
      },
      plain: "Now {seats} seats each: {count:changed|key} moved. Busiest share {before} → {after}.",
      look: ["{keyIds}"],
    },

    // ---- Result ----
    "result.moved": {
      key: true,
      plain: "Ring: {moved} of {K} moved; one in {n1} is {fair}. Remainder way: {modm}.",
      why: "On average the ring moves 1 key in {n1}; the remainder way moves {N} in {n1}.",
      look: ["{keyIds}"],
      deeper: {
        cost: "Ring: about K/(N + 1) keys on average ({fair} here). Remainder way: about K × N/(N + 1).",
        edge: "With few keys, luck can flip a single run, so compare the averages, not one count.",
        real: "Jump consistent hash (Google, 2014) also moves just 1 key in N + 1 and needs no ring in memory, but servers can only join or leave at the end of the list.",
        source: JUMP,
      },
    },
    "result.uneven": {
      first: {
        when: (v) => v.seats === 1,
        plain: "But one seat each shares the ring unevenly: {top} now owns {share} of it.",
        why: "{top} owns {ratio} the average share, so it stores and serves that much more.",
      },
      plain: "With {seats} seats each, the busiest server owns {share} of the ring, {ratio} the average.",
      look: ["{topId}"],
      deeper: {
        how: "The meter is the biggest share divided by the average share, so 1× would be perfectly even.",
      },
    },
    "result.leave": {
      key: true,
      plain: "{heavy} is now the busiest, with {share} of the ring. The remainder way would move {modm}.",
      why: "Each moved key moved once, and only because its own server left.",
      first: {
        when: (v) => v.dests === 1 && v.left > 1,
        why: "No key moved without cause, but the whole extra load landed on one server.",
      },
      look: ["{heavyId}"],
      deeper: {
        how: "The remainder way would switch to {rule} and re-divide every key; the ring moved only the leaver's keys.",
        edge: "A server that takes a leaver's whole arc can be overloaded in turn and fail too: one reason real stores give each server many seats.",
        source: DYNAMO,
      },
    },
    "result.vnodes": {
      first: {
        when: (v) => !v.alone,
        key: true,
        plain: "{heavy} is now the busiest, at {ratio} the average share. With 256 seats each: {big256}.",
        why: "More seats even out the shares, but each seat is one more arc to track and copy.",
        deeper: {
          cost: "Worked out for the servers left: {big64} with 64 seats each, {big256} with 256. Past a few dozen seats, more buys little.",
          edge: "Random seats even out slowly. Dynamo moved to equal-size slices of the ring handed out evenly, its best-balanced strategy (§6.2).",
          real: "Cassandra cut its default from 256 random seats per node to 16 placed by an allocator in 4.0: fewer seats meant fewer neighbours to stream from and to repair.",
          source: CASSANDRA,
        },
      },
      plain: "Only {heavy} is left, so it holds every key and the whole ring.",
      look: ["{heavyId}"],
    },
  },

  asks: {
    "more.moved": {
      options: [
        { text: "About {fair}, one in {n1}: the new server's fair share", misconception: "m-fair",
          feedback: "A fair share is what the ring moves, not the remainder way. A key stays only if its remainders by {N} and {n1} match, so on average {N} in {n1} move. Here {moved} of {K} did." },
        { text: "About half of them",
          feedback: "A key stays only if its remainders by {N} and {n1} match: on average 1 key in {n1}, so about {N} in {n1} move. With only {K} keys luck swings the count; here {moved} of {K} did." },
        { text: "Most of them: about {N} in every {n1}",
          feedback: "On average, yes: a key stays only if its remainders by {N} and {n1} match, 1 key in {n1}. With only {K} keys luck swings the count; here {moved} of {K} did." },
      ],
      why: "A key keeps its server only when its remainders by {N} and by {n1} agree: on average 1 key in {n1}.",
    },
    "add.which": {
      options: [
        { feedback: "Right. A key moves only if a seat of {extra}'s is now first on its clockwise walk: here {moved} of {K}." },
        { text: "Keys from all around the ring, like the remainder way", misconception: "m-reshuffle",
          feedback: "If you thought any change reshuffles everything: on the ring a key moves only if {extra} is now first on its walk. Here {moved} of {K} moved; {stayed} stayed put." },
        { feedback: "Only keys that now meet one of {extra}'s seats first move, so it depends on where those seats land. Here {moved} of {K} moved." },
      ],
    },
    "leave.where": {
      options: [
        { feedback: "Right. Each key walks on to the first seat still there: here {count} keys went to {dests}." },
        { misconception: "m-even",
          feedback: "Nobody shares the keys out: each key walks on clockwise to the next seat still there. Here {victim}'s {count} keys went to {dests}." },
        { misconception: "m-reshuffle",
          feedback: "If you thought a leave reshuffles everything: only {victim}'s keys move, since no other key's walk passed its seats. The rest keep their server." },
      ],
    },
  },
};
