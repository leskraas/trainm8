/**
 * @vitest-environment jsdom
 *
 * The stamp controls (#412): the week chooser, the confirmation a re-stamp has to
 * pass, and the soft mix-disagreement notice. All three are copy the athlete acts
 * on, so all three are tested as copy.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	StampSection,
	type PendingStamp,
	type StampMixNotice,
	type StampablePattern,
	type StampableWeek,
} from './__stamp-pattern.tsx'

const PATTERN: StampablePattern = {
	id: 'pattern-1',
	name: 'Weekday base',
	days: [{}, {}],
}

/** A three-week plan opening Monday 2030-01-07, so week N opens on the 7Nth. */
const WEEKS: StampableWeek[] = [1, 2, 3].map((weekInPlan) => {
	const day = String(weekInPlan * 7).padStart(2, '0')
	return {
		weekKey: `2030-01-${day}`,
		weekInPlan,
		startsAt: new Date(`2030-01-${day}T00:00:00.000Z`),
	}
})

function renderSection({
	patterns = [PATTERN],
	pending = null as PendingStamp | null,
	mixNotices = [] as StampMixNotice[],
	action,
}: {
	patterns?: StampablePattern[]
	pending?: PendingStamp | null
	mixNotices?: StampMixNotice[]
	action?: (args: { request: Request }) => unknown
} = {}) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<StampSection
					patterns={patterns}
					weeks={WEEKS}
					timezone="UTC"
					pending={pending}
					mixNotices={mixNotices}
				/>
			),
			action: action as never,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan']} />)
}

test('every week of the plan is offered and none is ticked for the athlete', async () => {
	renderSection()

	const boxes = await screen.findAllByRole('checkbox')
	expect(boxes).toHaveLength(3)
	expect(boxes.every((box) => !(box as HTMLInputElement).checked)).toBe(true)
	// Nothing anywhere suggests how far ahead to fill in.
	expect(
		screen.getByText(/Stamp as few or as many weeks as you like/),
	).toBeInTheDocument()
})

test('the ticked weeks travel together in one submit', async () => {
	let posted: Array<[string, string]> = []
	renderSection({
		action: async ({ request }) => {
			posted = [...(await request.formData()).entries()] as Array<
				[string, string]
			>
			return null
		},
	})

	const boxes = await screen.findAllByRole('checkbox')
	await userEvent.click(boxes[0]!)
	await userEvent.click(boxes[2]!)
	await userEvent.click(
		screen.getByRole('button', { name: 'Stamp these weeks' }),
	)

	expect(posted).toContainEqual(['intent', 'stamp-week-pattern'])
	expect(posted).toContainEqual(['patternId', 'pattern-1'])
	expect(posted.filter(([name]) => name === 'weekKeys')).toEqual([
		['weekKeys', WEEKS[0]!.weekKey],
		['weekKeys', WEEKS[2]!.weekKey],
	])
})

test('a pattern with no days offers no stamp at all', async () => {
	renderSection({ patterns: [{ ...PATTERN, days: [] }] })

	expect(
		await screen.findByText(/Add days to a pattern above/),
	).toBeInTheDocument()
	expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
})

test('a re-stamp states what it would replace, and what it would keep, before it does it', async () => {
	renderSection({
		pending: {
			patternId: 'pattern-1',
			weekKeys: [WEEKS[0]!.weekKey, WEEKS[1]!.weekKey],
			conflicts: [
				{
					weekKey: WEEKS[0]!.weekKey,
					weekInPlan: 1,
					replacing: 3,
					keeping: 1,
				},
			],
		},
	})

	expect(
		await screen.findByText('Some of those weeks already have sessions'),
	).toBeInTheDocument()
	expect(screen.getByText('Nothing has been written yet.')).toBeInTheDocument()
	expect(
		screen.getByText(/3 sessions would be replaced, 1 session kept/),
	).toBeInTheDocument()
	expect(
		screen.getByText(/Any edits you made to them go with them/),
	).toBeInTheDocument()
	// A trained session is named as untouchable rather than as merely spared.
	expect(screen.getByText(/stamping never touches them/)).toBeInTheDocument()
})

test('the confirmation replays the same request plus the yes', async () => {
	let posted: Array<[string, string]> = []
	renderSection({
		pending: {
			patternId: 'pattern-1',
			weekKeys: [WEEKS[0]!.weekKey, WEEKS[1]!.weekKey],
			conflicts: [
				{ weekKey: WEEKS[0]!.weekKey, weekInPlan: 1, replacing: 1, keeping: 0 },
			],
		},
		action: async ({ request }) => {
			posted = [...(await request.formData()).entries()] as Array<
				[string, string]
			>
			return null
		},
	})

	await userEvent.click(
		await screen.findByRole('button', { name: 'Replace and stamp' }),
	)

	expect(posted).toEqual([
		['intent', 'stamp-week-pattern'],
		['patternId', 'pattern-1'],
		['weekKeys', WEEKS[0]!.weekKey],
		['weekKeys', WEEKS[1]!.weekKey],
		['replace', 'on'],
	])
})

test('a week disagreeing with its mix is said softly, with both figures and no fix', async () => {
	renderSection({
		mixNotices: [
			{
				weekKey: WEEKS[1]!.weekKey,
				weekInPlan: 2,
				discipline: 'run',
				disagreements: [{ zone: 5, authored: 1, stamped: 0 }],
			},
		],
	})

	expect(
		await screen.findByText(
			/your mix asks for 1 vo₂ max session, the week holds 0/i,
		),
	).toBeInTheDocument()
	expect(
		screen.getByText(/Swapping a hard session for an easy one in a tired week/),
	).toBeInTheDocument()
	// Nothing offers to correct it.
	expect(
		screen.queryByRole('button', { name: /fix|correct|match/i }),
	).not.toBeInTheDocument()
})
