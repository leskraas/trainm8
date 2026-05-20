import { coggan, hrTSS, rTSS, sTSS, sRPE, type TssResult } from './formulas.ts'

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

type RecordingArg = {
	hrAvg: number | null
	powerAvg: number | null
	paceAvgSecPerKm: number | null
}

/**
 * Picks the right TSS formula per the fallback chain (ADR 0008).
 * Returns null when no formula can produce a result (Unavailable Metric).
 *
 * Fallback order by discipline:
 *   bike: Coggan (opt-in + power + FTP) → hrTSS (HR + LTHR/maxHr) → sRPE → null
 *   run:  rTSS (opt-in + pace + threshold) → hrTSS (HR + LTHR/maxHr) → sRPE → null
 *   swim: sTSS (CSS + pace) → sRPE → null
 *   strength: sRPE → null
 */
export function computeSessionTss(
	session: SessionArg,
	recording: RecordingArg,
	athleteProfile: AthleteProfileArg,
): TssResult | null {
	const { discipline, durationSec, rpe } = session
	const { hrAvg, powerAvg, paceAvgSecPerKm } = recording

	const dp = athleteProfile.disciplineProfiles.find(
		(p) => p.discipline === discipline,
	)

	if (discipline === 'bike') {
		if (dp?.preferCogganTss && dp.ftp != null && powerAvg != null) {
			return coggan({ durationSec, np: powerAvg, ftp: dp.ftp })
		}
		if (hrAvg != null && (dp?.lthr != null || dp?.maxHr != null)) {
			return hrTSS({ durationSec, hrAvg, lthr: dp?.lthr ?? undefined, maxHr: dp?.maxHr ?? undefined })
		}
		if (rpe != null) return sRPE({ durationSec, rpe })
		return null
	}

	if (discipline === 'run') {
		if (dp?.preferRTSS && dp.thresholdPaceSecPerKm != null && paceAvgSecPerKm != null) {
			return rTSS({ durationSec, paceAvgSecPerKm, thresholdPaceSecPerKm: dp.thresholdPaceSecPerKm })
		}
		if (hrAvg != null && (dp?.lthr != null || dp?.maxHr != null)) {
			return hrTSS({ durationSec, hrAvg, lthr: dp?.lthr ?? undefined, maxHr: dp?.maxHr ?? undefined })
		}
		if (rpe != null) return sRPE({ durationSec, rpe })
		return null
	}

	if (discipline === 'swim') {
		if (dp?.cssSecPer100m != null && paceAvgSecPerKm != null) {
			// paceAvgSecPerKm → paceAvgSecPer100m (1km = 10×100m)
			const paceAvgSecPer100m = paceAvgSecPerKm / 10
			return sTSS({ durationSec, paceAvgSecPer100m, cssSecPer100m: dp.cssSecPer100m })
		}
		if (rpe != null) return sRPE({ durationSec, rpe })
		return null
	}

	// strength (and any unknown discipline): sRPE only
	if (rpe != null) return sRPE({ durationSec, rpe })
	return null
}
