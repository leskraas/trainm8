import { CATALOGUE_CORPUS } from '/home/user/trainm8/app/utils/catalogue-corpus.all.ts'
import { stepDurationSec } from '/home/user/trainm8/app/utils/dashboard.ts'
const base = { lthr: 170, maxHr: 190, ftp: 250, runPowerThresholdW: null, zoneSystem: null, zoneOverrides: null }
const thresholds: any = { run: { ...base, thresholdPaceSecPerKm: 240, cssSecPer100m: null }, swim: { ...base, thresholdPaceSecPerKm: null, cssSecPer100m: 100 } }
const kinds: Record<string, number> = {}
for (const s of CATALOGUE_CORPUS as any[]) {
  if (s.discipline !== 'run' && s.discipline !== 'swim') continue
  for (const b of s.blocks) for (const st0 of b.steps) {
    const st = { ...st0, intensity: st0.intensity != null ? JSON.stringify(st0.intensity) : null }
    if (stepDurationSec(st, { thresholds, discipline: s.discipline }) == null) {
      const k = `${s.discipline} kind=${st.kind} dur=${st.durationSec != null} dist=${st.distanceM != null} int=${st0.intensity ? Object.keys(st0.intensity).join('/')+':'+(st0.intensity.kind ?? st0.intensity.type ?? '') : 'none'}`
      kinds[k] = (kinds[k] ?? 0) + 1
    }
  }
}
console.log(kinds)
