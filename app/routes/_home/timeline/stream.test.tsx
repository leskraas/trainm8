/**
 * @vitest-environment jsdom
 *
 * The stream's **empty cell** — the row a day with nothing on it gets — and the
 * **band** that stands in for a run of them behind today (#500).
 *
 * `index.dashboard.test.tsx` drives the whole screen through the loader, which
 * is where the grid as a whole is asserted. This file exists for the two things
 * that cannot be reached that way: `Rest day`, the band's own interaction, and
 * what a tapped cell says **before** it writes anything. Which runs *become*
 * bands is the presenter's rule and is asserted there; what a band does when it
 * is tapped is here.
 *
 * `restPrescribed` has **no producer** (ADR 0065 §4 and its consequences).
 * Nothing in the model prescribes recovery per day — `PlanOutlinePhase.rhythm`
 * is week-granular and `trainableWeekdays` is availability — so no ledger, plan
 * or profile fixture can make the presenter emit `true`, and faking one from
 * either source is exactly what the ADR forbids. The branch is therefore driven
 * from the row model directly, so that whoever teaches the Plan Outline to say
 * "this day is recovery" finds the row already drawn and tested.
 *
 * The draft is the other one. Which Discipline it opens on is a fact about the
 * athlete's history that the row model does not carry, and "an athlete with no
 * history is asked" is a state no fixture can reach through the loader without
 * emptying the whole screen — so the prefill is handed to the provider directly
 * and the four states are driven from there.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	buildWeekVolumes,
	type VolumeSession,
} from '#app/utils/plan-outline/week-volumes.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { DayStampProvider } from './day-stamp-context.tsx'
import {
	type TimelineBand,
	type TimelineDay,
	type TimelineEndCap,
	type TimelineWeek,
} from './presenter.ts'
import { EndCap, TrackLine, WeekBlock } from './stream.tsx'
import { wordTrackWeek } from './week-words.ts'

function day(overrides: Partial<TimelineDay> = {}): TimelineDay {
	return {
		key: '2030-02-22',
		dayLabel: 'Fri',
		dateLabel: '22',
		isToday: false,
		restPrescribed: false,
		sessions: [],
		...overrides,
	}
}

function week(rows: TimelineDay[], bands: TimelineBand[] = []): TimelineWeek {
	return {
		key: '2030-02-18',
		rangeLabel: '18–24 February',
		plannedTss: null,
		doneTss: null,
		imported: false,
		planStart: false,
		isNow: true,
		rows,
		bands,
		tracks: [],
		otherTrack: null,
		relativeName: 'Denne uka',
		phaseName: 'Build',
		role: 'loading',
		roleLabel: 'hard uke',
		kindLabel: 'Build · hard uke',
		shape: 'open',
		foldLabel: null,
		shownDayKeys: rows.map((d) => d.key),
		loadLine: '0 av 0 gjort',
	}
}

function renderWeek(
	rows: TimelineDay[],
	{
		bands = [],
		anchorDayKey = '2030-02-20',
		prefill = null,
		action,
	}: {
		bands?: TimelineBand[]
		anchorDayKey?: string
		prefill?: Discipline | null
		/** Home's own action, as the draft's fetcher posts to it. */
		action?: () => unknown
	} = {},
) {
	const App = createRoutesStub([
		{
			// The writing line reads the day's week as it opens; an empty plan
			// keeps the line's own preview out of these tests.
			path: '/resources/week-sum',
			loader: ({ request }) => ({
				day: new URL(request.url).searchParams.get('day'),
				week: {
					weekName: 'Denne uka',
					volumes: { weekKey: '2030-02-18', tracks: [], other: null },
				},
			}),
		},
		{
			path: '/',
			action,
			Component: () => (
				// Every cell in the stream is a write target, so the stream only
				// renders inside the provider — see `day-stamp-context.tsx`.
				<DayStampProvider prefill={prefill} thresholds={{}} ledger={[]}>
					<WeekBlock week={week(rows, bands)} anchorDayKey={anchorDayKey} />
				</DayStampProvider>
			),
		},
	])
	render(<App initialEntries={['/']} />)
}

/** Monday to Wednesday, empty, behind a today of Thursday the 21st. */
function pastRun() {
	const days = [
		day({ key: '2030-02-18', dayLabel: 'Mon', dateLabel: '18 Feb' }),
		day({ key: '2030-02-19', dayLabel: 'Tue', dateLabel: '19 Feb' }),
		day({ key: '2030-02-20', dayLabel: 'Wed', dateLabel: '20 Feb' }),
	]
	const band: TimelineBand = {
		key: '2030-02-18',
		kind: 'past',
		dayKeys: days.map((d) => d.key),
		daysLabel: '18–20',
		monthLabel: 'Feb',
		summaryLabel: '3 dager · ingenting logget',
		rangeLabel: '18–20 February',
		controlLabel: '3 dager uten noe logget, 18–20 February',
	}
	return { days, band }
}

test('a day the plan prescribes recovery on says Rest day, and says what it means', () => {
	renderWeek([day({ restPrescribed: true })])

	const cell = screen.getByRole('button', { name: 'Hviledag — Fri 22' })
	expect(cell).toHaveTextContent('Hviledag')
	expect(cell).toHaveTextContent('Planen ber ikke om noe i dag.')
	// The affordance is not offered where the plan has spoken: the day is not
	// blank, it is prescribed.
	expect(cell).not.toHaveTextContent('Legg inn en økt')
})

test('every other empty day reads only "fri", and is the control that writes one', () => {
	// The app does not name a day it knows nothing about (ADR 0065 §4): `fri` is
	// variant P's word for a day with nothing written in it, not a rest day.
	renderWeek([day()])

	const cell = screen.getByRole('button', { name: 'Legg inn en økt Fri 22' })
	expect(cell).toHaveTextContent('fri')
	expect(cell).not.toHaveTextContent(/hviledag/i)
})

test('an empty cell is a real button at the control floor, not a clickable box', () => {
	// ADR 0028's second pillar: the actual control, not a hit area painted around
	// something inert. `min-h-11` and not `h-11` — 44px is a floor, and a rest
	// day is allowed to be taller (ADR 0065 §7). The rendered height is asserted
	// in the 390×844 spec; jsdom reports every box as zero.
	renderWeek([day()])

	const cell = screen.getByRole('button', { name: /legg inn en økt/i })
	expect(cell.tagName).toBe('BUTTON')
	expect(cell).toHaveAttribute('type', 'button')
	expect(cell).toHaveClass('min-h-11')
})

test('an empty cell states its own date, in the gutter every row aligns to', () => {
	renderWeek([day({ dayLabel: 'Sat', dateLabel: '23 Feb', key: '2030-02-23' })])

	const cell = screen.getByRole('button', { name: /legg inn en økt/i })
	expect(within(cell).getByText('Sat')).toBeInTheDocument()
	expect(within(cell).getByText('23 Feb')).toBeInTheDocument()
})

test('an empty today is still the landing anchor', () => {
	// The row exists because the day does, so the node the stream lands on is
	// there on a rest day too — which is the whole of the fix (ADR 0065 §1).
	renderWeek([
		day({ key: '2030-02-20', dayLabel: 'Wed', dateLabel: '20', isToday: true }),
	])

	const cell = screen.getByRole('button', { name: 'Legg inn en økt Wed 20' })
	expect(cell.closest('[data-timeline-today]')).not.toBeNull()
})

// ── the band a run of empty days behind today collapses into (#500) ────────

test('a run of empty days behind today is one row stating the count and the dates', () => {
	const { days, band } = pastRun()
	renderWeek(days, { bands: [band] })

	// The fact the blank rows only imply, said once (ADR 0065 §3).
	const control = screen.getByRole('button', {
		name: '3 dager uten noe logget, 18–20 February',
	})
	expect(control).toHaveTextContent('3 dager · ingenting logget')
	expect(control).toHaveTextContent('18–20')
	expect(control).toHaveTextContent('Feb')
	// And the days it speaks for are not rows while it is closed.
	expect(
		screen.queryByRole('button', { name: /legg inn en økt tue 19/i }),
	).not.toBeInTheDocument()
})

test('the band is a real control with an expanded state, and tapping it opens the days', async () => {
	const { days, band } = pastRun()
	renderWeek(days, { bands: [band] })

	const control = screen.getByRole('button', { name: /3 dager uten noe/i })
	expect(control.tagName).toBe('BUTTON')
	expect(control).toHaveAttribute('aria-expanded', 'false')

	await userEvent.click(control)

	expect(control).toHaveAttribute('aria-expanded', 'true')
	// Every day of the run is now a row, and each one takes the same gesture a
	// day forward of today takes — the same component on the same model.
	for (const name of [
		'Legg inn en økt Mon 18 Feb',
		'Legg inn en økt Tue 19 Feb',
		'Legg inn en økt Wed 20 Feb',
	]) {
		expect(screen.getByRole('button', { name })).toHaveClass('min-h-11')
	}
	// The control stays: a disclosure that vanishes on open has no way back.
	expect(screen.getByRole('button', { name: /3 dager uten noe/i })).toBe(
		control,
	)

	await userEvent.click(control)
	expect(control).toHaveAttribute('aria-expanded', 'false')
	expect(
		screen.queryByRole('button', { name: /legg inn en økt tue 19/i }),
	).not.toBeInTheDocument()
})

test('a day the presenter left out of a band is an ordinary row, band or no band', () => {
	// A single empty day behind today is a day, not a one-day band — the rule is
	// the presenter's, and this is the stream keeping its half of it: a day that
	// is not named by a band renders exactly as it always did.
	const { days, band } = pastRun()
	const monday = days[0]!
	renderWeek(days, {
		bands: [
			{ ...band, key: days[1]!.key, dayKeys: [days[1]!.key, days[2]!.key] },
		],
	})

	expect(
		screen.getByRole('button', {
			name: `Legg inn en økt Mon ${monday.dateLabel}`,
		}),
	).toBeInTheDocument()
})

// ——— The draft: what a tapped cell says before anything is written ————————

test('tapping an empty cell opens the draft on the athlete’s most-trained discipline', async () => {
	// Derived, and shown **before** it commits (ADR 0065 §5). Nothing has been
	// written at this point: the chip is what the stamp would be stamped for.
	const user = userEvent.setup()
	renderWeek([day({ dayLabel: 'Sat', dateLabel: '23 Feb' })], {
		prefill: 'bike',
	})

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))

	// The sport, named the way the full authoring route's own Discipline select
	// names it — the chip and the select are the same choice.
	expect(screen.getByRole('radio', { name: 'Sykling' })).toBeChecked()
	expect(
		screen.getByText('Det du trener mest — trykk på en annen for å bytte.'),
	).toBeInTheDocument()
	// The sentence the stamp is about to write, in the notation's own words.
	expect(
		screen.getByRole('button', { name: 'Legg til 45 min Z2' }),
	).toBeInTheDocument()
})

test('the prefilled discipline is one tap to change', async () => {
	const user = userEvent.setup()
	renderWeek([day()], { prefill: 'bike' })

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))
	await user.click(screen.getByRole('radio', { name: 'Svømming' }))

	expect(screen.getByRole('radio', { name: 'Svømming' })).toBeChecked()
	expect(screen.getByRole('radio', { name: 'Sykling' })).not.toBeChecked()
})

test('an athlete with no history is asked, never assigned a discipline', async () => {
	// A default that is a guess dressed as a derivation is the failure mode this
	// repo keeps naming, so with nothing to read the cell asks the question and
	// offers no confirm until it has an answer (ADR 0065 §5).
	const user = userEvent.setup()
	renderWeek([day()], { prefill: null })

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))

	for (const name of ['Løping', 'Sykling', 'Svømming', 'Styrke']) {
		expect(screen.getByRole('radio', { name })).not.toBeChecked()
	}
	expect(
		screen.getByText('Ingenting å lese det av ennå, så: hvilken?'),
	).toBeInTheDocument()
	// And nothing to confirm: there is no session to offer until they answer.
	expect(screen.queryByRole('button', { name: /^Legg til / })).toBeNull()
	expect(screen.queryByRole('link', { name: /navngi løftene/i })).toBeNull()
})

test('the draft carries the More escape, and it names the day it was opened on', async () => {
	const user = userEvent.setup()
	renderWeek(
		[day({ key: '2030-02-23', dayLabel: 'Sat', dateLabel: '23 Feb' })],
		{
			prefill: 'run',
		},
	)

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))

	// The full route now accepts both — the day the athlete tapped, and the chip
	// they were looking at when they tapped it.
	expect(screen.getByRole('link', { name: 'Mer' })).toHaveAttribute(
		'href',
		'/training/sessions/new?date=2030-02-23&discipline=run',
	)
})

test('strength takes the full route rather than stamping a session with no lift', async () => {
	// A strength step is required to name a lift, and no lift can be read off a
	// tap on a Thursday — so the line says so and hands over, which is what the
	// More escape is for.
	const user = userEvent.setup()
	renderWeek([day({ key: '2030-02-23' })], { prefill: 'strength' })

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))

	expect(screen.queryByRole('button', { name: /^Legg til / })).toBeNull()
	expect(screen.getByRole('link', { name: 'Navngi løftene' })).toHaveAttribute(
		'href',
		'/training/sessions/new?date=2030-02-23&discipline=strength',
	)
	expect(
		screen.getByText(
			'En styrkeøkt sier hvilke løft — mer enn linja har plass til.',
		),
	).toBeInTheDocument()
})

test('a stamp that writes nothing gives the row back, and says so', async () => {
	// #501 AC 8: a mistake is recoverable. Any ending other than "here is the
	// session I wrote" — a dropped connection, a refusal, a 500 out of
	// `createWorkoutSession` — returns the fetcher to idle carrying no id, and
	// the draft used to sit `disabled` on `Adding…` forever with Cancel as the
	// only exit and nothing on the row saying why.
	const user = userEvent.setup()
	renderWeek([day()], { prefill: 'run', action: () => ({ oops: true }) })

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))
	await user.click(screen.getByRole('button', { name: 'Legg til 45 min Z2' }))

	// The button is offering the stamp again rather than reporting one in
	// flight, and the row states what happened to the last one.
	const retry = await screen.findByRole('button', {
		name: 'Legg til 45 min Z2',
	})
	expect(retry).toBeEnabled()
	expect(
		screen.getByText(
			'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
		),
	).toBeInTheDocument()
	// And the draft is still the athlete's own draft: the chip they chose is
	// where they left it, so retrying is one tap and not a re-answered question.
	expect(screen.getByRole('radio', { name: 'Løping' })).toBeChecked()
})

test('retrying a failed stamp clears the last failure off the row', async () => {
	const user = userEvent.setup()
	let attempts = 0
	renderWeek([day()], {
		prefill: 'run',
		action: () => {
			attempts += 1
			return attempts > 1 ? { stampedSessionId: 'session-1' } : { oops: true }
		},
	})

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))
	await user.click(screen.getByRole('button', { name: 'Legg til 45 min Z2' }))
	await screen.findByText(
		'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
	)
	await user.click(screen.getByRole('button', { name: 'Legg til 45 min Z2' }))

	// The draft is gone: the second post wrote a session, and the row moves on to
	// the sentence for it (which needs the ledger to carry it — see the provider).
	await waitFor(() => {
		expect(
			screen.queryByText(
				'Det ble ikke lagret. Ingenting ble skrevet — prøv igjen.',
			),
		).toBeNull()
	})
	expect(attempts).toBe(2)
})

test('the draft closes without writing anything', async () => {
	const user = userEvent.setup()
	renderWeek([day()], { prefill: 'run' })

	await user.click(screen.getByRole('button', { name: /legg inn en økt/i }))
	await user.click(screen.getByRole('button', { name: 'Avbryt' }))

	expect(
		screen.getByRole('button', { name: /legg inn en økt/i }),
	).toBeInTheDocument()
})

// ---------------------------------------------------------------------------
// The far end (ADR 0079, #505 S9 review S1)
// ---------------------------------------------------------------------------

function renderEndCap(cap: Partial<TimelineEndCap>) {
	const App = createRoutesStub([
		{
			path: '/',
			Component: () => (
				<EndCap
					cap={{
						plan: 'event',
						writtenThroughLabel: '20. feb',
						unwrittenWeeks: 0,
						eventName: null,
						eventDateLabel: null,
						planEndLabel: null,
						...cap,
					}}
				/>
			),
		},
	])
	render(<App initialEntries={['/']} />)
}

test('an open-ended plan is a plan at the far end, never "no season plan"', async () => {
	renderEndCap({
		plan: 'open-ended',
		unwrittenWeeks: 3,
		planEndLabel: '14. apr',
	})
	expect(
		await screen.findByText(
			'Resten av blokka er skissert, ikke skrevet — 3 uker uten økter ennå, til og med 14. apr. Planen har ingen sluttdato: neste blokk foreslås i Ukeskiftet før denne er ferdig.',
		),
	).toBeInTheDocument()
	expect(screen.queryByText(/ingen sesongplan/)).not.toBeInTheDocument()
	expect(
		screen.queryByRole('link', { name: 'Planlegg en sesong' }),
	).not.toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Sesongplan' })).toHaveAttribute(
		'href',
		'/training/plan',
	)
	expect(
		screen.getByRole('link', { name: 'Skriv de siste 3 ukene' }),
	).toBeInTheDocument()
})

test('an open-ended plan written to its round’s end says the plan has no end date', async () => {
	renderEndCap({
		plan: 'open-ended',
		unwrittenWeeks: 0,
		planEndLabel: '14. apr',
	})
	expect(
		await screen.findByText(/^Det er hele blokka, til og med 14\. apr\./),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('link', { name: /Skriv de siste/ }),
	).not.toBeInTheDocument()
})

test('a plan toward a race counts its unwritten weeks to race day', async () => {
	renderEndCap({
		plan: 'event',
		unwrittenWeeks: 1,
		eventName: 'Birken',
		eventDateLabel: '21. mar',
	})
	expect(
		await screen.findByText(/frem til Birken 21\. mar/),
	).toBeInTheDocument()
})

test('with no plan the far end offers to plan a season', async () => {
	renderEndCap({ plan: 'none' })
	expect(await screen.findByText(/ingen sesongplan ennå/)).toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: 'Planlegg en sesong' }),
	).toHaveAttribute('href', '/start')
})

// ---------------------------------------------------------------------------
// A track line says one true thing (#505 S9 review D7, S6)
// ---------------------------------------------------------------------------

test('a skier’s line says what stands where no sum is, and the zone split done and planned on lines of their own', () => {
	const ride = (
		dayKey: string,
		status: VolumeSession['status'],
		bars: VolumeSession['plannedZones'],
	): VolumeSession => ({
		dayKey,
		status,
		discipline: 'bike',
		easy: false,
		// Prescribed with no hours a week can sum: a structure with gaps.
		prescribed: { km: null, hours: null, tss: null, sets: null },
		recorded:
			status === 'completed'
				? { km: 30, hours: 1.5, tss: 80, sets: null }
				: null,
		plannedZones: bars,
		doneZones:
			status === 'completed'
				? [
						{ id: 'd1', zone: 1, durationSec: 4212 },
						{ id: 'd3', zone: 3, durationSec: 648 },
						{ id: 'd5', zone: 5, durationSec: 540 },
					]
				: [],
		countsInNoTrack: false,
	})
	const volumes = buildWeekVolumes({
		weekKey: '2030-02-18',
		todayKey: '2030-02-20',
		planStartWeekKey: '2030-02-18',
		tracks: [
			{
				trackId: 'track-ski',
				discipline: 'bike',
				currency: 'hours',
				targets: [8],
				overridden: [false],
				sessionTargets: null,
			},
		],
		sessions: [
			ride('2030-02-18', 'completed', [
				{ id: 'p1', zone: 2, durationSec: 5400 },
			]),
			ride('2030-02-22', 'planned', [{ id: 'p2', zone: 2, durationSec: 3600 }]),
		],
	})
	render(
		<TrackLine
			track={wordTrackWeek(volumes.tracks[0]!, {
				ahead: false,
				hasSessions: true,
			})}
		/>,
	)
	// Two sessions planned with no hours: never `planlagt –`.
	expect(screen.getByText('2 økter uten timer')).toBeInTheDocument()
	expect(screen.getByText('1,5')).toBeInTheDocument()
	// toHaveTextContent folds the no-break space before % into a space.
	expect(document.querySelector('[data-zone-split="done"]')).toHaveTextContent(
		'gjort Z1 78 % · Z3 12 % · Z5 10 %',
	)
	expect(
		document.querySelector('[data-zone-split="planned"]'),
	).toHaveTextContent('plan Z2 100 % · hensikt, ikke en måling')
})
