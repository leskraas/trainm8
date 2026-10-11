// The philosophy switch's preview, pure (#505 S7): which family a plan follows
// is read the way the Filosofi card reads it (`outlineFamily` over the phases),
// so a plan whose last phase is a taper still names its family.
import { expect, test } from 'vitest'
import {
	previewPhilosophySwitch,
	type PhilosophyOutline,
} from './philosophy.ts'

/** A race plan that records no family: 3:1 blocks, then a taper. */
function racePlan(): PhilosophyOutline {
	return {
		startWeekKey: '2026-08-10',
		family: null,
		eventWeekKey: '2026-10-19',
		phases: [
			{
				id: 'base',
				orderIndex: 0,
				name: 'Base',
				weeks: 4,
				rhythm: '3:1',
				tapers: false,
			},
			{
				id: 'build',
				orderIndex: 1,
				name: 'Build',
				weeks: 4,
				rhythm: '3:1',
				tapers: false,
			},
			{
				id: 'taper',
				orderIndex: 2,
				name: 'Taper',
				weeks: 2,
				rhythm: 'none',
				tapers: true,
			},
		],
		tracks: [],
	}
}

test('a plan whose last phase is a taper follows the family its blocks read as', () => {
	// Klassisk 3:1, read off the first phase that is not a taper — so switching
	// to it changes nothing and is refused, as the Filosofi card would say.
	expect(previewPhilosophySwitch(racePlan(), 'classic', '2026-08-10')).toEqual({
		ok: false,
		reason: 'same-family',
	})
})

test('the preview names the family it switches from, not none', () => {
	const preview = previewPhilosophySwitch(racePlan(), 'masters', '2026-08-10')
	expect(preview.ok).toBe(true)
	if (preview.ok) expect(preview.from).toBe('classic')
})
