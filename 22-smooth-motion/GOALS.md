# Smooth motion: goals

The owner wants the world's motion smooth and good, like the original pages or better. After #20 every frame is drawn
in full again, as in the original build (`9c8b16d`), so this pass must not change how any frame looks: not a settled
frame, not a live one. Resolution, antialiasing, maps, colours, sizes and camera paths all stay. An idea that would
change pixels is written up as a proposal instead.

## What smooth means here

Steady frame pacing at the display's rate while a story plays, the reader scrubs, the camera eases or the pointer
hovers. No hitches when a step changes, a panel opens, new text appears or the HUD updates. No frames skipped or
doubled.

## How it is measured

This machine has no GPU (Chrome draws WebGL2 on SwiftShader, about a second or more per full frame), so it can measure
the main thread's work and the scheduling, not GPU time.

| What | How |
|---|---|
| Every frame's work outside the world's draw | Live play at 1×, the page made to believe it runs on an Apple GPU, the world's draw stubbed so frames come at 60 per second; each rAF callback timed; long animation frames; layout and style counts (`probe.mjs`) |
| The renderer's own JavaScript | The same with the real draw, in a small window so frames come faster |
| A step change | The draw stubbed, the run moved from step to step under the CPU profiler and a devtools trace: script, forced style and layout, and who forced them (`stepprof.mjs`, `steptrace.mjs`) |
| Allocation | A sampling heap profile that keeps collected objects (`heapsum.mjs`) |
| The hover pick | Live play with the pointer resting over the world; each pick and render timed (`pickstall.mjs`) |
| Frames unchanged | Frozen captures paired with #20's build (MapReduce, every story, both sizes and themes; Raft's first story); a live-camera sequence at fixed timestamps with the pointer over the world; prepick answers compared with the synchronous pick, point by point |
