# Consistent hashing: records clear of the seats

> Draft, for review only. Don't merge yet.

At step 12 of "Add a server", the record `order:551` stood right in front of seat 2 and hid it. The ring already
spaces records and seats apart along the circle, but by only 5 units for a seat. Under the camera's tilt, a record's
height covers whatever sits just behind it.

The fix gives a seat 14 units of clearance. Records keep 6 units between each other, and the rule that nothing moves
more than about 9° from its hash still holds, so the ring grows a little where it has to.

| | before | after |
|---|---|---|
| Add a server, step 12 | [before-step12.png](before-step12.png): seat 2 hidden behind `order:551` | [after-step12.png](after-step12.png): seat 2 clear |
| Many seats, step 8 | [before-many-seats.png](before-many-seats.png) | [after-many-seats.png](after-many-seats.png): the same framing, a slightly larger ring |

Checks on 28960b3: unit tests 387 / 387; `verify.mjs` consistent hashing 23 runs, 0 failing, 0 warnings.
