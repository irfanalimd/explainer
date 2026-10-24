# Full frames, faster: goals

#20 removed the draft tier, because drafts (three quarters of the resolution, no MSAA, the low preset's maps) made the
tiles look worse on machines without a working GPU. Every frame is the full one again, and live play there is back to
about 0.9 frames a second at 1440×900. This branch makes those full frames cheaper without changing what they look
like.

## The rule

Only work that produces the same pixels may change. Nothing lowers resolution, MSAA, map sizes, filters or any part of
the look. Each change has two proofs:

1. **Measured:** frozen screenshots (MapReduce's four stories at both sizes and themes, Raft's first story) and a live
   sequence (`renderAt` at fixed moments, the camera's springs and the fades stepping between them) compared with
   #20's own build, pixel for pixel, with #20 against itself for the machine's own noise.
2. **Argued for a real GPU:** why the change gives the same result on any conforming GL implementation, not just on
   SwiftShader, where the measurements run.

A change that only has the first proof is dropped.

## Candidates

| Change | Where the time goes | Kept? |
|---|---|---|
| Draw the floor after the opaque slabs (round 4's 4c76959) | the floor is a full-screen 4× MSAA pass, the largest part of a frame | yes, if both proofs hold |
| Draw only the slab template's solid prefix for slabs without a well (round 3's 905284f) | the closing scale shot (6008 slabs) | yes, if both proofs hold |
| Keep the shadow, contact and bounce maps while their inputs are unchanged (round 4's a31b6ca) | about 5 % of a frame | no: it was built around the draft tier's two sets of maps, and its invalidation (context loss, resize, quality) is extra risk for a small gain |
| Sort opaque slabs front to back for more early depth rejection | overdraw among slabs | no: with LESS a depth tie goes to the first drawn, so reordering can change a tied pixel |
| Cache the floor ink layer across frames | the floor layer pass | no: depends on the camera every frame the camera moves; same risk as the map cache |

## Measured

Live frames a second (MapReduce, Raft; 1440×900 and 390×844), a full frame's time, the closing scale shot and the
handout's pictures, #20 and the branch alternating with no other Chrome running, medians of three.
