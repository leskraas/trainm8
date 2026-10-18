/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { draftStart } from '#app/utils/first-run/start-draft.ts'
import { START_OPTION_LABELS, TRENINGSFORM_LABELS } from '#app/utils/labels.ts'
import { treningsformViewOf } from './__treningsform-view.ts'
import { TreningsformOffer, type TreningsformReply } from './__treningsform.tsx'

// _Bytt treningsform_ in the lead (#581): the options marked and offered,
// and the preview opening under the card that asked.

const answers = {
	level: 'experienced' as const,
	discipline: 'run' as const,
	hours: 6,
	days: [0, 2, 4, 6] as Array<0 | 2 | 4 | 6>,
	preferences: ['intervals' as const],
	startWeekKey: '2030-01-14',
}
const view = treningsformViewOf({
	answers,
	start: draftStart(answers)!,
	current: 'threshold',
	levelSaid: true,
})

const PREVIEW: TreningsformReply['preview'] = {
	from: 'threshold',
	to: 'polarized',
	fromWeekKey: '2030-01-14',
	digest: 'digest-1',
	warnings: [],
	phases: { before: [], after: [] },
	weeks: [],
}

function renderOffer(reply: TreningsformReply | null) {
	let posted: FormData | null = null
	const App = createRoutesStub([
		{
			path: '/training/plan',
			Component: () => (
				<TreningsformOffer outlineId="outline-1" view={view} reply={reply} />
			),
			action: async ({ request }) => {
				posted = await request.formData()
				return null
			},
		},
	])
	render(<App initialEntries={['/training/plan']} />)
	return { posted: () => posted }
}

test('the options are closed until asked for, then each is a real week with the current one marked', async () => {
	const user = userEvent.setup()
	const { posted } = renderOffer(null)

	await user.click(
		await screen.findByRole('button', { name: /Bytt treningsform/ }),
	)
	const options = screen.getByRole('list', { name: START_OPTION_LABELS.rail })
	// The ways, in the start's order: each a card named by its plain name.
	const cards = within(options)
		.getAllByRole('listitem')
		.filter((item) => item.parentElement === options)
	expect(
		cards.map((card) => within(card).getByRole('heading').textContent),
	).toEqual([
		START_OPTION_LABELS.plain.polarized.name,
		START_OPTION_LABELS.plain.threshold.name,
		START_OPTION_LABELS.plain.classic.name,
	])

	// The family followed now is marked and not offered.
	const current = cards[1]!
	expect(within(current).getByText(TRENINGSFORM_LABELS.current)).toBeVisible()
	expect(
		within(current).getByText(TRENINGSFORM_LABELS.currentNote),
	).toBeVisible()
	expect(
		within(current).queryByRole('button', { name: /Velg denne/ }),
	).not.toBeInTheDocument()
	// Every day of the week is there, free or not.
	expect(within(current).getAllByText(START_OPTION_LABELS.free)).toHaveLength(3)

	// Velg denne asks for the preview, from the lead.
	await user.click(
		within(cards[0]!).getByRole('button', {
			name: START_OPTION_LABELS.chooseLabel(
				START_OPTION_LABELS.plain.polarized.name,
			),
		}),
	)
	await expect.poll(() => posted()).not.toBeNull()
	expect(Object.fromEntries(posted()!)).toMatchObject({
		intent: 'preview-philosophy',
		outlineId: 'outline-1',
		family: 'polarized',
		surface: 'treningsform',
	})
})

test('a preview opens the section under the card that asked, with the plain name on its confirm', async () => {
	renderOffer({ result: null, confirmResult: null, preview: PREVIEW })

	const asked = await screen.findByRole('listitem', {
		name: START_OPTION_LABELS.plain.polarized.name,
	})
	const confirm = within(asked).getByRole('button', {
		name: TRENINGSFORM_LABELS.switchTo(
			START_OPTION_LABELS.plain.polarized.name,
		),
	})
	const form = confirm.closest('form')!
	expect(Object.fromEntries(new FormData(form))).toMatchObject({
		intent: 'switch-philosophy',
		family: 'polarized',
		digest: 'digest-1',
		surface: 'treningsform',
	})
	expect(
		within(
			screen.getByRole('listitem', {
				name: START_OPTION_LABELS.plain.classic.name,
			}),
		).queryByRole('button', { name: /Bytt til/ }),
	).not.toBeInTheDocument()
})
