export type TssResult = {
	tss: number
	formula: 'coggan' | 'hrTSS' | 'rTSS' | 'sTSS' | 'sRPE'
	confidence: 'high' | 'medium' | 'low'
}

/**
 * Coggan TSS for cycling with power.
 * TSS = (durationSec × NP × IF) / (FTP × 3600) × 100
 * IF = NP / FTP
 */
export function coggan(ride: {
	durationSec: number
	np: number // normalized power (watts)
	ftp: number // functional threshold power (watts)
}): TssResult {
	const { durationSec, np, ftp } = ride
	const ifValue = np / ftp
	const tss = (durationSec * np * ifValue) / (ftp * 3600) * 100
	return { tss, formula: 'coggan', confidence: 'high' }
}

/**
 * Heart-rate TSS for bike/run.
 * hrTSS = durationHr × (hrAvg / lthr)² × 100
 * When only maxHr is available, LTHR is inferred as 0.85 × maxHr (Friel).
 */
export function hrTSS(opts: {
	durationSec: number
	hrAvg: number
	lthr?: number
	maxHr?: number
}): TssResult {
	const { durationSec, hrAvg } = opts
	let lthr: number
	let confidence: TssResult['confidence']

	if (opts.lthr != null) {
		lthr = opts.lthr
		confidence = 'medium'
	} else if (opts.maxHr != null) {
		lthr = opts.maxHr * 0.85
		confidence = 'low'
	} else {
		throw new Error('hrTSS requires lthr or maxHr')
	}

	const durationHr = durationSec / 3600
	const tss = durationHr * Math.pow(hrAvg / lthr, 2) * 100
	return { tss, formula: 'hrTSS', confidence }
}

/**
 * Running TSS (Daniels/Coggan).
 * rTSS = durationHr × (thresholdPace / paceAvg)² × 100
 * Pace in sec/km — lower = faster, so IF = thresholdPace / paceAvg.
 */
export function rTSS(opts: {
	durationSec: number
	paceAvgSecPerKm: number
	thresholdPaceSecPerKm: number
}): TssResult {
	const { durationSec, paceAvgSecPerKm, thresholdPaceSecPerKm } = opts
	const durationHr = durationSec / 3600
	const ifValue = thresholdPaceSecPerKm / paceAvgSecPerKm
	const tss = durationHr * Math.pow(ifValue, 2) * 100
	return { tss, formula: 'rTSS', confidence: 'high' }
}

/**
 * Swim TSS using Critical Swim Speed.
 * sTSS = durationHr × (css / paceAvg)² × 100
 * Pace in sec/100m — lower = faster, so IF = css / paceAvg.
 */
export function sTSS(opts: {
	durationSec: number
	paceAvgSecPer100m: number
	cssSecPer100m: number
}): TssResult {
	const { durationSec, paceAvgSecPer100m, cssSecPer100m } = opts
	const durationHr = durationSec / 3600
	const ifValue = cssSecPer100m / paceAvgSecPer100m
	const tss = durationHr * Math.pow(ifValue, 2) * 100
	return { tss, formula: 'sTSS', confidence: 'high' }
}

/**
 * Session RPE-based TSS (Foster 1998).
 * sRPE_tss = (durationSec / 3600) × rpe × 15
 * Calibrated so 1h at RPE 7 (threshold) ≈ 105 TSS.
 */
export function sRPE(opts: { durationSec: number; rpe: number }): TssResult {
	const { durationSec, rpe } = opts
	const tss = (durationSec / 3600) * rpe * 15
	return { tss, formula: 'sRPE', confidence: 'low' }
}
