import { DRIFT_MARK } from '#app/utils/labels.ts'

/**
 * A track's name in its own colour: the `-ink` step of the hue, ≥ 5:1 on the
 * card and the page in both themes (ADR 0085, #505 round 2). The `track-*`
 * fills are marks and stay the hue; text that names a track takes this. One map
 * for Sesong, its season pane and the generate preview. Literal classes, for
 * Tailwind.
 */
export const TRACK_INK: Record<string, string> = {
	run: 'text-track-run-ink',
	bike: 'text-track-bike-ink',
	swim: 'text-track-swim-ink',
	strength: 'text-track-strength-ink',
}

/**
 * The `≠` mark beside a planned figure more than `DRIFT_TOLERANCE` off its
 * Week Target, named for a screen reader by `label` (`DRIFT_MARK_LABEL`, as
 * `wordTrackWeek` sets `driftLabel`).
 */
export function DriftMark({ label }: { label: string }) {
	return (
		<span
			role="img"
			aria-label={label}
			title={label}
			className="text-status-under font-bold"
		>
			{DRIFT_MARK}
		</span>
	)
}
