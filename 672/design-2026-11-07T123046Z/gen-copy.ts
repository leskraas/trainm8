// Renders the notices' real Norwegian copy with the repo's own labels and formatters.
import { SESONG_NOTICE_LABELS as L, nbPhaseName, nbTrackName, NB_STRENGTH_GOAL_SENTENCE_LABELS as G, PLAN_LEAD_LABELS, SESONG_PAGE_LABELS } from '#app/utils/labels.ts'
import { formatNbSignedPercent as sp, formatNbPct1RMBand, formatNbPct1RMs, formatNbWeeklyVolume } from '#app/utils/format.ts'
import { RAMP_GUARD_MAX } from '#app/utils/plan-outline/ramp-guard.ts'
import { weekSpan } from '#app/routes/training/__plan-season.ts'
const start = '2026-W45' 
const out: any = {}
const ws = (a: number, b: number) => { try { return weekSpan('2026-11-02', a, b) } catch (e) { return `Uke ${45 + a}–${45 + b}` } }
out.weekSpanSample = [ws(3, 5), ws(7, 7)]
out.ramp = {
  lines: [
    { phase: nbPhaseName('Build'), rate: L.rampRate(sp(0.14)) },
    { phase: nbPhaseName('Peak'), rate: L.stepRate(sp(0.12)) },
  ],
  lifting: [nbTrackName('strength'), L.rampLifting('', L.rampRate(sp(0.15)), nbPhaseName('Base')).trim()],
  note: L.rampNote(sp(RAMP_GUARD_MAX)),
  liftingNote: L.rampLiftingNote,
  name: L.rampName, dismiss: L.dismiss(L.rampName),
}
out.avail = {
  days: L.daysAsk(ws(3, 6), false, L.sessionCounts(3, 2), 4),
  hours: L.hoursAsk(ws(8, 10), false, formatNbWeeklyVolume(9.5, 'hours'), formatNbWeeklyVolume(7, 'hours')),
  both: L.bothChecks + L.fitNote,
  daysOnly: L.daysCheck + L.fitNote,
  clash: L.dayClashLine(L.weekSpans([ws(3, 5), ws(9, 9)]), L.dayClash('lifting-on-hard-day', 1), false),
  clash2: L.dayClashLine(ws(12, 14), L.dayClash('hard-days-in-a-row', 2), true),
  clashNote: L.dayClashCheck + L.dayClashNote,
  noCap: [L.noCapacity, L.noCapacityLink, L.noCapacityEnd],
  name: L.availabilityName, dismiss: L.dismiss(L.availabilityName),
}
out.band = {
  line: L.bandLine(formatNbPct1RMs([62.5, 65]), formatNbPct1RMBand({ minPct1RM: 67, maxPct1RM: 85 } as any), G['hypertrophy']),
  line2: L.bandLine(formatNbPct1RMs([92.5]), formatNbPct1RMBand({ minPct1RM: 70, maxPct1RM: 85 } as any), G['hypertrophy']),
  note: L.bandNote, name: L.bandName, dismiss: L.dismiss(L.bandName),
}
out.dismissed = L.dismissed(L.rampName)
out.lead = { plain: PLAN_LEAD_LABELS.plainName, family: PLAN_LEAD_LABELS.familyName?.('Polarisert'), toward: PLAN_LEAD_LABELS.toward, thisWeekEasy: PLAN_LEAD_LABELS.thisWeekEasy, next: PLAN_LEAD_LABELS.nextEasyWeek?.(48, '23. nov 2026'), heroChange: SESONG_PAGE_LABELS.heroChange, heroMeta: SESONG_PAGE_LABELS.heroMeta('6. jun 2027', 31, '2. nov 2026'), advanced: PLAN_LEAD_LABELS.advanced, advancedDetail: PLAN_LEAD_LABELS.advancedDetail, resting: SESONG_PAGE_LABELS.resting, restingLink: SESONG_PAGE_LABELS.restingLink }
console.log(JSON.stringify(out, null, 1))
