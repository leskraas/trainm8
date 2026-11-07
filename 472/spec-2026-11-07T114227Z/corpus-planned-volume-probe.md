# Probe: how much of the shipped corpus has a Planned Volume figure

fixedDayVolume (the Week Pattern / Planned Volume reading) over CATALOGUE_CORPUS, cardio rows only.
Intensity stripped and no thresholds, so 'hours' counts only rows timed end to end: a lower bound (with an athlete's thresholds a distance rep is timed through its pace).

```
import { CATALOGUE_CORPUS } from '/home/user/trainm8/app/utils/catalogue-corpus.all.ts'
import { fixedDayVolume } from '/home/user/trainm8/app/utils/plan-outline/week-pattern.ts'
const out: Record<string, any> = {}
for (const r of CATALOGUE_CORPUS as any[]) {
  const d = r.discipline
  if (d === 'strength') continue
  const blocks = r.blocks.map((b: any) => ({ ...b, steps: b.steps.map((s: any) => { const { intensity, ...rest } = s; return rest }) }))
  const o = (out[d] ??= {n:0, km:0, hoursTimedOnly:0, either:0})
  o.n++
  const k = fixedDayVolume(blocks, 'km', { thresholds: {} as any, discipline: d })
  const h = fixedDayVolume(blocks, 'hours', { thresholds: {} as any, discipline: d })
  if (k != null) o.km++
  if (h != null) o.hoursTimedOnly++
  if (k != null || h != null) o.either++
}
console.log(CATALOGUE_CORPUS.length, JSON.stringify(out))
```

Output (rows total, then per discipline):

```
151 {"run":{"n":50,"km":14,"hoursTimedOnly":13,"either":27},"bike":{"n":41,"km":0,"hoursTimedOnly":38,"either":38},"swim":{"n":36,"km":33,"hoursTimedOnly":0,"either":33}}
```
