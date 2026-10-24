#!/usr/bin/env bash
# shoot-set.sh <pages dir> <out dir>: open/mid/end for the three site pages, desktop + phone, light (+ dark for MapReduce)
P=$1; O=$2; G=/home/ubuntu/tmp/explainer-perf/guide
export TMPDIR=$G/calm-screen-tmp; mkdir -p "$TMPDIR" "$O"
for e in mapreduce raft event-loop; do
  for s in 1440x900 390x844; do
    [ -f "$O/$e-$s-light.json" ] || timeout 2400 $G/../chrome-slot.sh node $G/calm-tools/moments.mjs "$P/$e.html" "$O" "$e" "$s" light
  done
done
for s in 1440x900 390x844; do [ -f "$O/mapreduce-$s-dark.json" ] || timeout 2400 $G/../chrome-slot.sh node $G/calm-tools/moments.mjs "$P/mapreduce.html" "$O" mapreduce "$s" dark; done
echo DONE > "$O/done"
