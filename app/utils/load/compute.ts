import { coggan, hrTSS, rTSS, sTSS, sRPE, type TssResult } from './formulas.ts'
import { normalizedPower } from './normalized-power.ts'

type DisciplineProfile = {
	discipline: string
	lthr: number | null
	maxHr: number | null
	ftp: number | null
	thresholdPaceSecPerKm: number | null
	cssSecPer100m: number | null
	preferCogganTss: boolean
	preferRTSS: boolean
}

type AthleteProfileArg = {
	disciplineProfiles: DisciplineProfile[]
}

type SessionArg = {
	discipline: string
	durationSec: number
	rpe: number | null
}

/** The stored Activity Stream power channel (ADR 0020), parsed for NP (#174). */
type PowerStreamArg = {
	resolutionSec: number
	power: Array<number | null>
}

type RecordingArg = {
	hrAvg: number | null
	powerAvg: number | null
	paceAvgSecPerKm: number | null
	/** Per-sample power when the Recording carries one; absent/null otherwise. */
	powerStream?: PowerStreamArg | null
}

/**
 * The disciplines whose TSS is an input to the **Training Load** triad —
 * CTL / ATL / TSB (ADR 0008). One closed list, so a new discipline has to opt
 * in deliberately rather than arrive in the triad by falling through.
 *
 * `strength` is absent on purpose (ADR 0046 §2) and `other` is absent per
 * ADR 0015.
 */
const TRIAD_DISCIPLINES = ['bike', 'run', 'swim'] as const

/**
 * Picks the right TSS formula per the fallback chain (ADR 0008), for the
 * endurance disciplines whose load the **Training Load** triad may read.
 * Returns null when no formula can produce a result (Unavailable Metric).
 *
 * Fallback order by discipline:
 *   bike: Coggan (opt-in + FTP; true NP from the power stream at high
 *         confidence, else average power at medium, #174) → hrTSS
 *         (HR + LTHR/maxHr) → sRPE → null
 *   run:  rTSS (opt-in + pace + threshold) → hrTSS (HR + LTHR/maxHr) → sRPE → null
 *   swim: sTSS (CSS + pace) → sRPE → null
 *
 * **Strength is not in this chain** (ADR 0046 §2, superseding ADR 0008's
 * strength clause). Its display-only figure comes from
 * `computeSessionContribution`, never from here.
 */
export function computeSessionTss(
	session: SessionArg,
	recording: RecordingArg,
	athleteProfile: AthleteProfileArg,
): TssResult | null {
	const { discipline, durationSec, rpe } = session
	const { hrAvg, powerAvg, paceAvgSecPerKm } = recording

	// Anything outside the triad's disciplines has no endurance TSS: 'other' is
	// an import-only discipline (ADR 0015) and 'strength' is priced in a currency
	// that has no exchange rate with TSS (ADR 0046 §2). Neither may be replaced
	// with invented data — their metric here is Unavailable.
	if (!TRIAD_DISCIPLINES.some((d) => d === discipline)) return null

	const dp = athleteProfile.disciplineProfiles.find(
		(p) => p.discipline === discipline,
	)

	if (discipline === 'bike') {
		if (dp?.preferCogganTss && dp.ftp != null) {
			// True NP from the power stream (#174): the honest Coggan input.
			const stream = recording.powerStream
			const np = stream
				? normalizedPower(stream.power, stream.resolutionSec)
				: null
			if (np != null) {
				return coggan({ durationSec, np, ftp: dp.ftp })
			}
			// No usable power stream: average power stands in for NP. Same math,
			// but it under-costs variable rides → medium confidence, never high.
			if (powerAvg != null) {
				return coggan({
					durationSec,
					np: powerAvg,
					ftp: dp.ftp,
					powerBasis: 'average',
				})
			}
		}
		if (hrAvg != null && (dp?.lthr != null || dp?.maxHr != null)) {
			return hrTSS({
				durationSec,
				hrAvg,
				lthr: dp?.lthr ?? undefined,
				maxHr: dp?.maxHr ?? undefined,
			})
		}
		if (rpe != null) return sRPE({ durationSec, rpe })
		return null
	}

	if (discipline === 'run') {
		if (
			dp?.preferRTSS &&
			dp.thresholdPaceSecPerKm != null &&
			paceAvgSecPerKm != null
		) {
			return rTSS({
				durationSec,
				paceAvgSecPerKm,
				thresholdPaceSecPerKm: dp.thresholdPaceSecPerKm,
			})
		}
		if (hrAvg != null && (dp?.lthr != null || dp?.maxHr != null)) {
			return hrTSS({
				durationSec,
				hrAvg,
				lthr: dp?.lthr ?? undefined,
				maxHr: dp?.maxHr ?? undefined,
			})
		}
		if (rpe != null) return sRPE({ durationSec, rpe })
		return null
	}

	if (discipline === 'swim') {
		if (dp?.cssSecPer100m != null && paceAvgSecPerKm != null) {
			// paceAvgSecPerKm → paceAvgSecPer100m (1km = 10×100m)
			const paceAvgSecPer100m = paceAvgSecPerKm / 10
			return sTSS({
				durationSec,
				paceAvgSecPer100m,
				cssSecPer100m: dp.cssSecPer100m,
			})
		}
		if (rpe != null) return sRPE({ durationSec, rpe })
		return null
	}

	return null
}

/**
 * What one session contributes to a day's load, and whether the **Training
 * Load** triad is allowed to read it.
 *
 * Two roads out of here, and the split is the whole point (ADR 0046 §2):
 *
 * - **Endurance** (`bike` / `run` / `swim`) runs the ADR 0008 fallback chain and
 *   counts toward CTL / ATL / TSB.
 * - **Strength** gets Foster's `sRPE` for display only — the day's discipline
 *   split and the session's own Load row — and never reaches the triad.
 *   `(hours × rpe × 15)` is `hours × assumed intensity`, the conversion ADR 0041
 *   rejected on evidentiary grounds and ADR 0045 §6/§7 closed. It is kept as a
 *   figure an athlete reads, not one the app acts on.
 *
 * Callers that sum contributions must respect `countsTowardTriad`; see the
 * deliberately broken invariant named at `snapshot.server.ts`.
 */
export type SessionContribution = TssResult & { countsTowardTriad: boolean }

export function computeSessionContribution(
	session: SessionArg,
	recording: RecordingArg,
	athleteProfile: AthleteProfileArg,
): SessionContribution | null {
	if (session.discipline === 'strength') {
		const { durationSec, rpe } = session
		if (rpe == null) return null
		return { ...sRPE({ durationSec, rpe }), countsTowardTriad: false }
	}

	const result = computeSessionTss(session, recording, athleteProfile)
	return result ? { ...result, countsTowardTriad: true } : null
}
