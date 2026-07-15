import { GRADE_HIGH_CUT, GRADE_MEDIUM_CUT } from './constants.ts'
import { type DetectionGrade } from './types.ts'

/**
 * Turn the internal 0–1 hypothesis score into a **Detection Confidence** grade,
 * then apply the signal-trust ceiling (ADR 0033): `confidence = min(pattern
 * quality, signal-trust ceiling)`. HR-classified intensity never exceeds
 * `medium` — HR lag and cardiac drift make the label shaky, the same ADR 0024
 * reasoning that caps average-power Coggan below true-NP Coggan. The raw score is
 * never stored; only this label (or `null`, decided upstream) surfaces.
 */

const RANK: Record<DetectionGrade, number> = { low: 0, medium: 1, high: 2 }

function scoreToGrade(score: number): DetectionGrade {
	if (score >= GRADE_HIGH_CUT) return 'high'
	if (score >= GRADE_MEDIUM_CUT) return 'medium'
	return 'low'
}

/** Cap a grade at the signal-trust ceiling — `medium` when classified on HR. */
function capGrade(grade: DetectionGrade, hrCapped: boolean): DetectionGrade {
	if (!hrCapped) return grade
	return RANK[grade] > RANK.medium ? 'medium' : grade
}

export function gradeConfidence(
	score: number,
	hrCapped: boolean,
): DetectionGrade {
	return capGrade(scoreToGrade(score), hrCapped)
}
