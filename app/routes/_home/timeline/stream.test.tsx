/**
 * @vitest-environment jsdom
 *
 * The stream's **empty cell** — the row a day with nothing on it gets, every
 * day, behind today and ahead of it (ADR 0086) — the horizon's divider, and a
 * week header's track line at its edges.
 *
 * `index.dashboard.test.tsx` drives the whole screen through the loader, which
 * is where the grid as a whole is asserted. This file exists for the things
 * that cannot be reached that way: `Rest day`, a week's shape handed in
 * directly, and what a tapped cell says **before** it writes anything.
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
	type TimelineDay,
	type TimelineEndCap,
	type TimelineWeek,
	type WeekShape,
} from './presenter.ts'
import { EndCap, TrackLine, WeekBlock } from './stream.tsx'
import { wordTrackWeek } from './week-words.ts'

function day(overrides: Partial<TimelineDay> = {}): TimelineDay {
	const dateLabel = overrides.dateLabel ?? '22'
	return {
		key: '2030-02-22',
		dayLabel: 'Fri',
		dateLabel,
		dayOfMonth: dateLabel.split(/[. ]/)[0]!,
		isToday: false,
		restPrescribed: false,
		sessions: [],
		...overrides,
	}
}

function week(
	rows: TimelineDay[],
	overrides: Partial<TimelineWeek> = {},
): TimelineWeek {
	return {
		key: '2030-02-18',
		rangeLabel: '18–24 February',
		plannedTss: null,
		doneTss: null,
		imported: false,
		planStart: false,
		isNow: true,
		rows,
		tracks: [],
		otherTrack: null,
		relativeName: 'Denne uka',
		phaseName: 'Build',
		role: 'loading',
		roleLabel: 'hard uke',
		kindLabel: 'Build · hard uke',
		shape: 'open',
		opensHorizon: false,
		summary: null,
		loadLine: '0 av 0 gjort',
		...overrides,
	}
}

function renderWeek(
	rows: TimelineDay[],
	{
		shape = 'open',
		weekOverrides = {},
		anchorDayKey = '2030-02-20',
		prefill = null,
		action,
	}: {
		shape?: WeekShape
		weekOverrides?: Partial<TimelineWeek>
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
					<WeekBlock
						week={week(rows, { shape, ...weekOverrides })}
						anchorDayKey={anchorDayKey}
					/>
				</DayStampProvider>
			),
		},
	])
	render(<App initialEntries={['/']} />)
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

	// The gutter prints the weekday over the date alone; the week header says
	// the month, and the control's name says it in full.
	const cell = screen.getByRole('button', {
		name: 'Legg inn en økt Sat 23 Feb',
	})
	expect(within(cell).getByText('Sat')).toBeInTheDocument()
	expect(within(cell).getByText('23')).toBeInTheDocument()
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

// ── a calendar: every day a row, the past quieter, the horizon stated ──────

test('every empty day of a week is its own row, none folded into another (ADR 0086)', () => {
	renderWeek([
		day({ key: '2030-02-18', dayLabel: 'Mon', dateLabel: '18' }),
		day({ key: '2030-02-19', dayLabel: 'Tue', dateLabel: '19' }),
		day({ key: '2030-02-20', dayLabel: 'Wed', dateLabel: '20' }),
	])

	for (const name of [
		'Legg inn en økt Mon 18',
		'Legg inn en økt Tue 19',
		'Legg inn en økt Wed 20',
	]) {
		expect(screen.getByRole('button', { name })).toHaveTextContent('fri')
	}
	expect(screen.queryByRole('button', { expanded: false })).toBeNull()
})

test('a past free day is quieter, and can still be written into (ADR 0065 §6)', async () => {
	const user = userEvent.setup()
	renderWeek([day({ key: '2030-02-11', dayLabel: 'Mon', dateLabel: '11' })], {
		shape: 'past',
		prefill: 'run',
	})

	const cell = screen.getByRole('button', { name: 'Legg inn en økt Mon 11' })
	expect(cell).toHaveTextContent('fri')
	// Quieter by its date and its plus, both muted — never by text so light it
	// falls under 4.5:1 (#505 polish).
	expect(within(cell).getByText('fri')).toHaveClass('text-muted-foreground')
	expect(cell.querySelector('[data-gutter-date]')).toHaveClass(
		'text-muted-foreground',
	)
	expect(cell.querySelector('span[aria-hidden]')).not.toHaveClass(
		'text-primary',
	)
	await user.click(cell)
	expect(
		await screen.findByRole('radio', { name: /løping/i }),
	).toBeInTheDocument()
})

test('the first week past the horizon stands under the divider, its days empty rows to write in', () => {
	renderWeek(
		[
			day({ key: '2030-03-11', dayLabel: 'Mon', dateLabel: '11. mar' }),
			day({ key: '2030-03-12', dayLabel: 'Tue', dateLabel: '12. mar' }),
		],
		{
			shape: 'beyond',
			weekOverrides: {
				opensHorizon: true,
				summary: 'fylles søndag kveld i uke 9',
			},
		},
	)

	const divider = screen.getByRole('separator', { name: /^Horisont: / })
	expect(divider).toHaveTextContent(
		/^Horisont\s*·\s*herfra bare mål, ingen økter ennå$/,
	)
	expect(screen.getByText('fylles søndag kveld i uke 9')).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: 'Legg inn en økt Tue 12. mar' }),
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

function skierTrack() {
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
	return wordTrackWeek(volumes.tracks[0]!, {
		ahead: false,
		hasSessions: true,
	})
}

test('a skier’s line says what stands where no sum is, and the zone split done and planned on lines of their own', () => {
	render(<TrackLine track={skierTrack()} />)
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

test('a week header keeps three lines and a summary; the qualifying notes sit behind it, and in the accessible text', async () => {
	const user = userEvent.setup()
	renderWeek([day({ key: '2030-02-19', dayLabel: 'Tue', dateLabel: '19' })], {
		weekOverrides: {
			tracks: [skierTrack()],
			summary: '1 av 2 gjort · 80 TSS',
		},
	})

	// The two unmeasured sessions stand in the planned figure's place, on the
	// track's own line — visible, never `planlagt –`.
	const line = document.querySelector('[data-week-track]')!
	expect(line).toHaveTextContent('2 økter uten timer')
	// The zone split is no longer a line under the header…
	expect(document.querySelector('[data-zone-split]')).toBeNull()
	expect(document.querySelector('[data-week-notes]')).toBeNull()
	// …but a screen reader still reads it, in place.
	const text = document.querySelector('[data-week-details-text]')!
	expect(text).toHaveClass('sr-only')
	expect(text).toHaveTextContent('plan Z2 100 % · hensikt, ikke en måling')

	// The summary is the disclosure: one tap shows the details.
	const trigger = screen.getByRole('button', { name: /1 av 2 gjort · 80 TSS/ })
	expect(trigger).toHaveAccessibleName(/mer om uka/)
	await user.click(trigger)
	const popover = await screen.findByRole('dialog')
	expect(popover).toHaveTextContent('Denne uka · 18–24 February')
	expect(popover).toHaveTextContent('gjort Z1 78 % · Z3 12 % · Z5 10 %')
	expect(popover).toHaveTextContent('hensikt, ikke en måling')
})
