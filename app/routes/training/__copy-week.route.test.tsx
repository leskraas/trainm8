/**
 * @vitest-environment jsdom
 *
 * The copy-a-week controls (#415). Two things are copy the athlete acts on and both
 * are tested as copy: that a copy is *not* scaled to the week it lands on, and that
 * copying onto a filled week says what it would do before it does it.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	CopyWeekSection,
	type CopyableWeek,
	type PendingCopy,
} from './__copy-week.tsx'

/**
 * A three-week plan opening Monday 2030-01-07, so week N opens on the 7Nth —
 * ISO weeks 2, 3 and 4, which is how Sesong names them (`Uke 2`).
 */
const WEEKS: CopyableWeek[] = [1, 2, 3].map((weekInPlan) => {
	const day = String(weekInPlan * 7).padStart(2, '0')
	return {
		weekKey: `2030-01-${day}`,
		weekInPlan,
		startsAt: new Date(`2030-01-${day}T00:00:00.000Z`),
	}
})

function renderSection({
	weeks = WEEKS,
	pending = null as PendingCopy | null,
	action,
}: {
	weeks?: CopyableWeek[]
	pending?: PendingCopy | null
	action?: (args: { request: Request }) => unknown
} = {}) {
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<CopyWeekSection
					outlineId="outline-1"
					weeks={weeks}
					timezone="UTC"
					pending={pending}
				/>
			),
			action: action as never,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan']} />)
}

test('the section says a copy is independent and is not scaled', async () => {
	renderSection()

	expect(await screen.findByText(/får sin egen økt/)).toBeInTheDocument()
	expect(
		screen.getByText(/endre den ene, så står den andre/),
	).toBeInTheDocument()
	expect(
		screen.getByText(/strekkes ikke for å møte målet i uka den havner i/),
	).toBeInTheDocument()
})

test('both weeks travel in one submit, defaulting to the first two', async () => {
	let posted: Array<[string, string]> = []
	renderSection({
		action: async ({ request }) => {
			posted = [...(await request.formData()).entries()] as Array<
				[string, string]
			>
			return null
		},
	})

	await userEvent.click(
		await screen.findByRole('button', { name: 'Kopier uka' }),
	)

	expect(posted).toEqual([
		['intent', 'copy-week'],
		['outlineId', 'outline-1'],
		['sourceWeekKey', WEEKS[0]!.weekKey],
		['targetWeekKey', WEEKS[1]!.weekKey],
	])
})

test('the target week can be changed and the choice is what posts', async () => {
	let posted: Array<[string, string]> = []
	renderSection({
		action: async ({ request }) => {
			posted = [...(await request.formData()).entries()] as Array<
				[string, string]
			>
			return null
		},
	})

	await userEvent.click(
		await screen.findByRole('combobox', { name: 'Til denne uka' }),
	)
	await userEvent.click(await screen.findByRole('option', { name: /Uke 4/ }))
	await userEvent.click(screen.getByRole('button', { name: 'Kopier uka' }))

	expect(posted).toContainEqual(['targetWeekKey', WEEKS[2]!.weekKey])
})

test('a one-week plan has nowhere to copy to, and says so', async () => {
	renderSection({ weeks: [WEEKS[0]!] })

	expect(
		await screen.findByText(/ingen annen uke å kopiere til/),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('button', { name: 'Kopier uka' }),
	).not.toBeInTheDocument()
})

test('copying onto a filled week states what it would do, and what it keeps', async () => {
	renderSection({
		pending: {
			sourceWeekKey: WEEKS[0]!.weekKey,
			targetWeekKey: WEEKS[1]!.weekKey,
			conflict: {
				weekKey: WEEKS[1]!.weekKey,
				weekInPlan: 2,
				replacing: 3,
				keeping: 1,
			},
		},
	})

	expect(
		await screen.findByText('Uke 3 har allerede økter'),
	).toBeInTheDocument()
	expect(screen.getByText('Ingenting er skrevet ennå.')).toBeInTheDocument()
	expect(
		screen.getByText(/3 økter blir slettet og skrevet på nytt fra uke 2/),
	).toBeInTheDocument()
	// A trained session is named as untouchable rather than as merely spared.
	expect(screen.getByText(/en kopi rører dem aldri/)).toBeInTheDocument()
	// The form the athlete came from is gone until they answer.
	expect(
		screen.queryByRole('button', { name: 'Kopier uka' }),
	).not.toBeInTheDocument()
})

test('the confirmation replays the same request plus the yes', async () => {
	let posted: Array<[string, string]> = []
	renderSection({
		pending: {
			sourceWeekKey: WEEKS[0]!.weekKey,
			targetWeekKey: WEEKS[1]!.weekKey,
			conflict: {
				weekKey: WEEKS[1]!.weekKey,
				weekInPlan: 2,
				replacing: 1,
				keeping: 0,
			},
		},
		action: async ({ request }) => {
			posted = [...(await request.formData()).entries()] as Array<
				[string, string]
			>
			return null
		},
	})

	await userEvent.click(
		await screen.findByRole('button', { name: 'Erstatt og kopier' }),
	)

	expect(posted).toEqual([
		['intent', 'copy-week'],
		['outlineId', 'outline-1'],
		['sourceWeekKey', WEEKS[0]!.weekKey],
		['targetWeekKey', WEEKS[1]!.weekKey],
		['replace', 'on'],
	])
})
