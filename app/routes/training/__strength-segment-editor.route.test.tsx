/**
 * @vitest-environment jsdom
 *
 * The lifting block's **Block Boundary Step** field (#409, ADR 0040 §5).
 *
 * One thing is under test. `derivedStrengthWeekTarget` skips the step of the block
 * the **Season Anchor** in force restarted in — the anchor already says what that
 * block opens at, so stepping on top would discount the number the athlete typed —
 * and a field offered there is a control they can change that changes nothing
 * (ADR 0044 §8). The rule is `strengthBoundaryStepInForce`'s and is read from it,
 * so these tests pin the *surface*: which blocks show the field, what the others
 * say instead, and that a step with no field still survives a save.
 *
 * The rest of the section is covered where it is used, in `plan.route.test.tsx`.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	StrengthBlocksSection,
	type EditableStrengthSegment,
	type EditableStrengthTrack,
	type StrengthWeekOption,
} from './__strength-segment-editor.tsx'

/** A twelve-week plan opening Monday 2030-01-07. */
const WEEKS: StrengthWeekOption[] = Array.from({ length: 12 }, (_, index) => {
	const startsAt = new Date('2030-01-07T00:00:00.000Z')
	startsAt.setUTCDate(startsAt.getUTCDate() + index * 7)
	const weekKey = startsAt.toISOString().slice(0, 10)
	return { weekKey, weekInPlan: index + 1, startsAt }
})

/** A four-week hypertrophy block authoring a −20% step at its opening. */
function block(
	overrides: Partial<EditableStrengthSegment> = {},
): EditableStrengthSegment {
	return {
		segmentId: 'block-1',
		startWeekKey: WEEKS[0]!.weekKey,
		startWeekInPlan: 1,
		weeks: 4,
		ramp: 0.1,
		boundaryStep: -0.2,
		goal: 'hypertrophy',
		sessionsPerWeek: 3,
		deloadCut: null,
		deloadWeeks: null,
		...overrides,
	}
}

function track(
	overrides: Partial<EditableStrengthTrack> = {},
): EditableStrengthTrack {
	return {
		trackId: 'track-1',
		discipline: 'strength',
		currency: 'sets',
		segments: [block()],
		anchors: [{ fromWeekIndex: 0 }],
		...overrides,
	}
}

function renderSection(tracks: EditableStrengthTrack[]) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<StrengthBlocksSection
					tracks={tracks}
					weeks={WEEKS}
					timezone="UTC"
					actionData={undefined}
				/>
			),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan']} />)
}

async function blockCards() {
	return within(
		await screen.findByRole('list', { name: 'Lifting blocks' }),
	).getAllByRole('listitem')
}

test('a block the anchor opens in offers no boundary step, and says why', async () => {
	// The anchor takes effect on week 1, which is the week this block opens.
	renderSection([track({ anchors: [{ fromWeekIndex: 0 }] })])

	const [card] = await blockCards()
	expect(
		within(card!).queryByLabelText(/Boundary step/),
	).not.toBeInTheDocument()
	expect(
		within(card!).getByText(
			/Your anchor takes effect on the week this block opens/,
		),
	).toBeInTheDocument()
})

test('a block opening after the anchor authors its step as usual', async () => {
	renderSection([
		track({
			anchors: [{ fromWeekIndex: 0 }],
			segments: [
				block(),
				block({
					segmentId: 'block-2',
					startWeekKey: WEEKS[4]!.weekKey,
					startWeekInPlan: 5,
				}),
			],
		}),
	])

	const [, second] = await blockCards()
	expect(within(second!).getByLabelText(/Boundary step/)).toHaveValue(-20)
	expect(
		within(second!).getByText(/−20% once, at the opening/),
	).toBeInTheDocument()
})

test('a re-anchor onto a later block’s opening takes that block’s step away', async () => {
	renderSection([
		track({
			anchors: [{ fromWeekIndex: 0 }, { fromWeekIndex: 4 }],
			segments: [
				block(),
				block({
					segmentId: 'block-2',
					startWeekKey: WEEKS[4]!.weekKey,
					startWeekInPlan: 5,
				}),
				block({
					segmentId: 'block-3',
					startWeekKey: WEEKS[8]!.weekKey,
					startWeekInPlan: 9,
				}),
			],
		}),
	])

	const [, second, third] = await blockCards()
	// The re-anchor lands on the second block's opening, and on that block only:
	// the third still crosses a boundary the anchor did not restart at.
	expect(
		within(second!).queryByLabelText(/Boundary step/),
	).not.toBeInTheDocument()
	expect(within(third!).getByLabelText(/Boundary step/)).toBeInTheDocument()
})

test('a step with no field still travels, so saving cannot clear it', async () => {
	let posted: Record<string, string> = {}
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<StrengthBlocksSection
					tracks={[track({ anchors: [{ fromWeekIndex: 0 }] })]}
					weeks={WEEKS}
					timezone="UTC"
					actionData={undefined}
				/>
			),
			action: (async ({ request }: { request: Request }) => {
				posted = Object.fromEntries(await request.formData()) as Record<
					string,
					string
				>
				return null
			}) as never,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan']} />)

	await userEvent.click(
		await screen.findByRole('button', { name: 'Save block' }),
	)

	// `StrengthSegmentSetSchema` rewrites every column, and a missing box reads as
	// blank — so a −20% the athlete authored before re-anchoring must come back out
	// of the save intact, ready for the day they move the anchor off this week.
	expect(posted.boundaryStep).toBe('-20')
})

test('the add form offers the step: a block with no window yet cannot be judged', async () => {
	renderSection([track({ anchors: [{ fromWeekIndex: 0 }], segments: [] })])

	expect(await screen.findByLabelText(/Boundary step/)).toBeInTheDocument()
})

test('a track with no anchor yet offers no step: there is no level to step from', async () => {
	// An empty list is a positive statement, not a caller with nothing to say. With
	// no anchor in force no week has a target at all, so a step has nothing to move.
	renderSection([track({ anchors: [] })])

	const [card] = await blockCards()
	expect(
		within(card!).queryByLabelText(/Boundary step/),
	).not.toBeInTheDocument()
	// And the *reason* is this block's own, not the re-anchor sentence: the week grid
	// beside it prices these weeks Unavailable, so telling the athlete their anchor
	// takes effect on the opening week would name an anchor that does not exist.
	expect(
		within(card!).getByText(/No Season Anchor covers this block yet/),
	).toBeInTheDocument()
	expect(
		within(card!).queryByText(/Your anchor takes effect/),
	).not.toBeInTheDocument()
})

test('a block the anchor has not reached yet reads Unavailable, not re-anchored', async () => {
	// The repro the two reasons exist for: the only anchor takes effect on week 6,
	// and this block opens on week 1 — the rule says "no step" for the opposite
	// reason from the block an anchor opens in, and the two must not read alike.
	renderSection([track({ anchors: [{ fromWeekIndex: 5 }] })])

	const [card] = await blockCards()
	expect(
		within(card!).queryByLabelText(/Boundary step/),
	).not.toBeInTheDocument()
	const reason = within(card!).getByText(
		/No Season Anchor covers this block yet/,
	)
	// Says which reading it is about and what would change it, rather than only that
	// something is missing (Unavailable Metric: the reason is the point).
	expect(reason).toHaveTextContent(/its opening reads Unavailable/)
	expect(reason).toHaveTextContent(/no level for a step to move/)
	expect(
		within(card!).queryByText(/Your anchor takes effect/),
	).not.toBeInTheDocument()
})

test('a block outside the plan’s weeks keeps the field live, and says it is outside', async () => {
	renderSection([
		track({
			anchors: [{ fromWeekIndex: 0 }],
			segments: [block({ startWeekInPlan: null })],
		}),
	])

	const [card] = await blockCards()
	expect(card).toHaveTextContent('Outside your plan’s weeks')
	// The derivation prices this block nowhere at all, so there is no "the step is
	// dead" to state — the card already says what is wrong and how to fix it.
	expect(within(card!).getByLabelText(/Boundary step/)).toBeInTheDocument()
})
