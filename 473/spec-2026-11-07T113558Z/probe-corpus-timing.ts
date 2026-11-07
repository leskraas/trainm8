import { CATALOGUE_CORPUS } from '/home/user/trainm8/app/utils/catalogue-corpus.all.ts'
import { prescribedDuration } from '/home/user/trainm8/app/utils/dashboard.ts'
const empty = { thresholds: {} as any }
const withPace = { thresholds: { run: { lthr: 170, maxHr: 190, ftp: 250, runPowerThresholdW: null, zoneSystem: null, zoneOverrides: null, thresholdPaceSecPerKm: 240, cssSecPer100m: null }, bike: { lthr: 170, maxHr: 190, ftp: 250, runPowerThresholdW: null, zoneSystem: null, zoneOverrides: null, thresholdPaceSecPerKm: null, cssSecPer100m: null }, swim: { lthr: 170, maxHr: 190, ftp: 250, runPowerThresholdW: null, zoneSystem: null, zoneOverrides: null, thresholdPaceSecPerKm: null, cssSecPer100m: 100 } } as any }
const rows: Record<string, { n: number; noThresh: number; withThresh: number }> = {}
for (const s0 of CATALOGUE_CORPUS as any[]) {
  const s = { ...s0, blocks: s0.blocks.map((b: any) => ({ ...b, steps: b.steps.map((st: any) => ({ ...st, intensity: st.intensity != null ? JSON.stringify(st.intensity) : null })) })) }
  const d = s.discipline
  if (d === 'strength') continue
  const r = (rows[d] ??= { n: 0, noThresh: 0, withThresh: 0 })
  r.n++
  if (prescribedDuration(s.blocks, { ...empty, discipline: d })?.complete) r.noThresh++
  if (prescribedDuration(s.blocks, { ...withPace, discipline: d })?.complete) r.withThresh++
}
console.log(JSON.stringify(rows, null, 1))
