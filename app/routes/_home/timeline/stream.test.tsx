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
 * directly, and which composer a tapped cell opens. What the composer says
 * and writes is `composer.test.tsx`'s.
 *
 * `restPrescribed` has **no producer** (ADR 0065 §4 and its consequences).
 * Nothing in the model prescribes recovery per day — `PlanOutlinePhase.rhythm`
 * is week-granular and `trainableWeekdays` is availability — so no ledger, plan
 * or profile fixture can make the presenter emit `true`, and faking one from
 * either source is exactly what the ADR forbids. The branch is therefore driven
 * from the row model directly, so that whoever teaches the Plan Outline to say
 * "this day is recovery" finds the row already drawn and tested.
 */
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	buildWeekVolumes,
	type VolumeSession,
} from '#app/utils/plan-outline/week-volumes.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { ComposerProvider } from './composer-context.tsx'
import { ComposerDrawer } from './composer-drawer.tsx'
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
		/** Home's own action, as the composer's fetcher posts to it. */
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
			Component: () => {
				const shown = week(rows, { shape, ...weekOverrides })
				// Every cell in the stream is a write target, so the stream only
				// renders inside the provider — see `composer-context.tsx`.
				return (
					<ComposerProvider
						prefill={prefill}
						thresholds={{}}
						todayKey={anchorDayKey}
						minDayKey="2029-08-01"
						container="drawer"
					>
						<WeekBlock week={shown} anchorDayKey={anchorDayKey} />
						<ComposerDrawer weeks={[shown]} today={null} />
					</ComposerProvider>
				)
			},
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
	// The composer opens on that day, and offers to write it as done.
	const composer = await screen.findByRole('dialog')
	expect(composer.querySelector('[data-composer-day]')).toHaveAttribute(
		'data-composer-day',
		'2030-02-11',
	)
	expect(
		within(composer).getByRole('switch', { name: 'Allerede gjort' }),
	).toBeChecked()
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
