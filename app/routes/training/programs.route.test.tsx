/**
 * @vitest-environment jsdom
 *
 * Reachability, not presentation: the program list is the app's one way into
 * the strength module, so what this file pins is that each card leads somewhere
 * and that an empty corpus is a dead end said out loud rather than a blank page.
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { NB_PROGRAM_PROVENANCE_NOTES } from '#app/utils/labels.ts'
import { strongLifts5x5Basic } from '#app/utils/strength/program.constants.ts'
import { type ProgramSummary } from '#app/utils/strength-program.server.ts'
import ProgramsRoute from './programs.tsx'

/** The shipped StrongLifts definition, so the fixture quotes the program the app
 * really publishes rather than a sentence written for this file. */
const strongLifts = strongLifts5x5Basic({
	squat: 'ex_bb_back_squat',
	deadlift: 'ex_bb_deadlift',
})

type Instance = {
	id: string
	programId: string
	status: string
	startedOn: Date
	program: { name: string }
}

function program(overrides: Partial<ProgramSummary> = {}): ProgramSummary {
	return {
		id: 'prog_stronglifts_5x5_basic',
		key: 'stronglifts-5x5',
		variantId: 'basic',
		name: 'StrongLifts 5×5',
		dayIds: ['A', 'B'],
		provenanceNote: strongLifts.provenanceNote,
		citation: {
			author: 'Mehdi Hadim',
			work: 'stronglifts.com',
			year: null,
			locator: null,
		},
		lifts: [
			{
				exerciseId: 'ex_bb_back_squat',
				equipment: null,
				name: 'Back Squat',
				dayIds: ['A', 'B'],
				setCount: 5,
				repsPerSet: 5,
				defaultStartKg: 20,
				startSeedRepMaxReps: null,
				increment: { kind: 'absolute', deltaKg: 2.5 },
				stallResponse: { kind: 'stallCut', pct: 10 },
				stallsBeforeResponse: 3,
			},
			{
				exerciseId: 'ex_bb_deadlift',
				equipment: null,
				name: 'Deadlift',
				dayIds: ['B'],
				setCount: 1,
				repsPerSet: 5,
				defaultStartKg: 30,
				startSeedRepMaxReps: null,
				increment: { kind: 'absolute', deltaKg: 5 },
				stallResponse: { kind: 'stallCut', pct: 10 },
				stallsBeforeResponse: 3,
			},
		],
		...overrides,
	}
}

function renderPrograms({
	programs = [program()],
	instances = [] as Instance[],
} = {}) {
	const App = createRoutesStub([
		{
			path: '/training/programs',
			Component: (props: Record<string, unknown>) => (
				<ProgramsRoute {...(props as any)} />
			),
			loader: () => ({ programs, instances }),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/programs']} />)
}

test('a program an athlete has not started leads to the screen that asks for starting weights', async () => {
	renderPrograms()

	expect(
		await screen.findByRole('link', { name: /start stronglifts 5×5/i }),
	).toHaveAttribute(
		'href',
		'/training/programs/prog_stronglifts_5x5_basic/start',
	)
})

test('a program already running is never offered the start form again', async () => {
	renderPrograms({
		instances: [
			{
				id: 'inst-1',
				programId: 'prog_stronglifts_5x5_basic',
				status: 'active',
				startedOn: new Date('2026-08-01T00:00:00Z'),
				program: { name: 'StrongLifts 5×5' },
			},
		],
	})

	expect(
		await screen.findByRole('button', { name: /åpne dagens økt/i }),
	).toBeInTheDocument()
	expect(screen.queryByRole('link', { name: /^start /i })).toBeNull()
})

test('with no programs published the screen says so is nobody’s fault and points at a way to train that is open', async () => {
	renderPrograms({ programs: [] })

	expect(
		await screen.findByText(/ingen programmer er lagt inn ennå/i),
	).toBeInTheDocument()
	expect(screen.getByRole('link', { name: /katalogen/i })).toHaveAttribute(
		'href',
		'/training/catalogue',
	)
	expect(screen.getByRole('link', { name: /skrive en selv/i })).toHaveAttribute(
		'href',
		'/training/sessions/new',
	)
})

test('the back link leaves for Plan, whose Bibliotek section programs live in (ADR 0101)', async () => {
	renderPrograms()

	expect(
		await screen.findByRole('link', { name: /tilbake til plan/i }),
	).toHaveAttribute('href', '/library')
})

const runningInstance: Instance = {
	id: 'inst-1',
	programId: 'prog_stronglifts_5x5_basic',
	status: 'active',
	startedOn: new Date('2026-08-01T00:00:00Z'),
	program: { name: 'StrongLifts 5×5' },
}

test('a card says what the program is: its day shapes and one row per lift, in the program’s own numbers', async () => {
	renderPrograms()

	expect(
		await screen.findByText('2 dagsoppsett · Økt A / Økt B'),
	).toBeInTheDocument()
	// Whole rows, read the way the card reads them: name, scheme, then the rules
	// that move the weight. Asserted on the row so a lift cannot lose a part and
	// stay green, and compared with the whitespace squeezed out of both sides:
	// the two tiers of the row are held apart by a flex gap and not by a space
	// in the text, so which of the three pieces sits in which element — and
	// whether a space falls between them — is presentation and moves. The
	// separators that carry meaning (·, −, %) are not whitespace and are still
	// asserted, in order.
	const squeezed = (text: string) => text.replace(/\s+/g, '')
	for (const row of [
		'Back Squat 5×5 +2,5 kg · −10 % etter 3 stopp',
		'Deadlift 1×5 +5 kg · −10 % etter 3 stopp',
	]) {
		expect(
			screen.getByText(
				(_, node) =>
					node?.tagName === 'LI' &&
					squeezed(node.textContent ?? '') === squeezed(row),
			),
		).toBeInTheDocument()
	}
})

test('the scheme and the rules that move it are separate elements, so the row can set them at two weights', async () => {
	renderPrograms()

	// The point of the split. `Back Squat 5×5` is tonight and is the loudest
	// thing in the card body; `+2,5 kg · −10 % etter 3 stopp` is week six and is
	// a step quieter. One run-on string cannot be styled in two tiers, so the
	// separation is asserted here rather than left to the stylesheet.
	const scheme = await screen.findByText('5×5')
	const rules = screen.getByText('+2,5 kg · −10 % etter 3 stopp')
	expect(scheme).not.toBe(rules)
	expect(scheme.closest('li')).toBe(rules.closest('li'))
})

test('the provenance note is on the card, because twelve weeks of a rule is a thing to consent to', async () => {
	renderPrograms()

	// The **shipped** note, said in Norwegian on the card (ADR 0081): the stored
	// English stays the record, and `program-rules.test.ts` holds it there. The
	// card reads the Norwegian by the program's key, so it is asserted here
	// against the table rather than a fixture that could drift on its own.
	expect(
		await screen.findByText(
			NB_PROGRAM_PROVENANCE_NOTES['stronglifts-5x5:basic']!,
		),
	).toBeInTheDocument()
	expect(strongLifts.provenanceNote).toBe(
		'Increments and the three-session −10 % Stall Cut are StrongLifts’ own published defaults. The percentage is program convention, supported by no trial. The 5×5 → 3×5 → 1×5 ladder is not StrongLifts’ rule and is not implemented.',
	)
})

test('the citation is on the card behind a disclosure: reachable in one tap, and not competing with the lifts', async () => {
	renderPrograms()

	// Quiet, not gone. The panel is `hiddenUntilFound`, so the citation is in
	// the DOM while closed (find-in-page reaches it), and one tap opens it.
	const trigger = await screen.findByRole('button', { name: 'Kilde' })
	expect(trigger).toHaveAttribute('aria-expanded', 'false')
	expect(
		screen.getByText('Mehdi Hadim — stronglifts.com', { exact: false }),
	).toBeInTheDocument()
	await userEvent.click(trigger)
	expect(trigger).toHaveAttribute('aria-expanded', 'true')
	expect(screen.getByText(/Mehdi Hadim — stronglifts\.com/)).toBeVisible()
})

test('a running program is badged, so an athlete can tell their program from the others', async () => {
	renderPrograms({ instances: [runningInstance] })

	const badge = await screen.findByText('I gang')
	expect(badge).toBeInTheDocument()
	// Beside the program name, which is where the approved capture puts it — and
	// pinned because `CardHeader` is a **grid**: a `flex-row` on it styles
	// nothing, and the badge silently drops to its own line under the day shapes.
	// Only a child in the `card-action` slot gets the header's second column.
	expect(badge.closest('[data-slot="card-action"]')).not.toBeNull()
})

test('a program that is not running is not badged', async () => {
	renderPrograms()

	expect(screen.queryByText('I gang')).toBeNull()
})

test('the primary button on a running program opens today’s session directly, through the open-session intent', async () => {
	renderPrograms({ instances: [runningInstance] })

	const button = await screen.findByRole('button', { name: /åpne dagens økt/i })
	const form = button.closest('form')
	expect(form).not.toBeNull()
	expect(form).toHaveAttribute('method', 'post')
	expect(form?.getAttribute('action')).toBe('/training/programs/run/inst-1')
	expect(form?.querySelector('input[name="intent"]')).toHaveAttribute(
		'value',
		'open-session',
	)
})

test('a running card keeps a secondary link to the overview, where a working weight is corrected and a program ended', async () => {
	renderPrograms({ instances: [runningInstance] })

	expect(
		await screen.findByRole('link', {
			name: /rett en vekt eller avslutt programmet/i,
		}),
	).toHaveAttribute('href', '/training/programs/run/inst-1')
})
