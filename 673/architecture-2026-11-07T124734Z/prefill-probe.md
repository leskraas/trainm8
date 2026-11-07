# Probe: what a fresh start's pre-fill does to the weeks after it (#673)

`derivedWeekTargets` (app/utils/plan-outline/derive.ts, main 6ec5b58): two 3:1 phases of 8 and 6 weeks, +5 % ramp, +10 % boundary step on phase 2, anchor 40 km at week 0, then one re-anchor added at week N.

```
roles   loading,loading,loading,recovery,loading,loading,loading,recovery,loading,loading,loading,recovery,loading,loading
old     40,42,44.1,30.9,46.3,48.6,51.1,35.7,59,61.9,65,45.5,68.3,71.7
N=2 loading  target÷factor V=44.1 -> 40,42,44.1,30.9,46.3,48.6,51.1,35.7,59,61.9,65,45.5,68.3,71.7   (identical)
N=3 recovery target÷factor V=44.1 -> 40,42,44.1,30.9,44.1,46.3,48.6,34,56.2,59,61.9,43.3,65,68.3     (every later week -1 ramp step)
N=3 recovery ramp level    V=46.3 -> 40,42,44.1,32.4,46.3,48.6,51.1,35.7,59,61.9,65,45.5,68.3,71.7   (only week 3 moves, +1 step)
N=7 recovery target÷factor V=51.1 -> 40,42,44.1,30.9,46.3,48.6,51.1,35.7,56.2,59,61.9,43.3,65,68.3
N=7 recovery ramp level    V=53.6 -> 40,42,44.1,30.9,46.3,48.6,51.1,37.5,59,61.9,65,45.5,68.3,71.7
N=9 loading  target÷factor V=61.9 -> identical
```

Run as a throwaway vitest file in the worktree, deleted after.
