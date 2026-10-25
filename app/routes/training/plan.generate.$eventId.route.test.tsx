/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import { NB_PROVENANCE_LABELS } from '#app/utils/labels.ts'
import { type SeasonPreview } from '#app/utils/plan-generation/generate.server.ts'
import { type SessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import {
	type GeneratedSession,
	type GeneratedWeek,
} from '#app/utils/plan-generation/season.ts'
import { PERIODIZATION_PRESETS } from '#app/utils/plan-outline/presets.ts'
import { nbPresetName } from './__preset-gallery.tsx'
import GenerateSeasonRoute from './plan.generate.$eventId.tsx'

function week(overrides: Partial<GeneratedWeek> = {}): GeneratedWeek {
	return {
		weekIndex: 0,
		weekKey: '2026-01-05',
		phaseIndex: 0,
		role: 'loading',
		isFinalWeek: false,
		targets: [{ discipline: 'run', currency: 'km', value: 40 }],
		...overrides,
	}
}

function session(overrides: Partial<GeneratedSession> = {}): GeneratedSession {
	return {
		weekIndex: 0,
		weekKey: '2026-01-05',
		weekday: 1,
		discipline: 'run',
		archetype: 'threshold',
		slot: 'quality',
		zone: 4,
		entryId: 'stockentry_run-C1',
		workoutId: 'stock_run-C1',
		title: '5 × 1 km @ T',
		provenance: {
			kind: 'corpus',
			citation: {
				author: 'Daniels',
				work: "Daniels' Running Formula",
				year: 2013,
				locator: null,
			},
		},
		...overrides,
	}
}

function preview(overrides: Partial<SeasonPreview['season']> = {}) {
	const value: SeasonPreview = {
		event: {
			id: 'event-1',
			name: 'Spring 10k',
			startDate: new Date('2026-04-04T09:00:00Z'),
			disciplines: ['run'],
		},
		season: {
			generatorId: 'deterministic-v1',
			presetKey: 'masters-2-1-short',
			startWeekKey: '2026-01-05',
			eventWeekKey: '2026-03-30',
			phases: [
				{
					name: 'Base',
					weeks: 4,
					rhythm: '2:1',
					tapers: false,
					cataloguePhase: 'base',
				},
			],
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
			weeks: [week()],
			sessions: [session()],
			unfilled: [],
			unavailable: [],
			weekdaySource: 'default',
			levelFloor: 'intermediate',
			goalEvent: '10k',
			capacity: { kind: 'unset' },
			...overrides,
		},
		choice: {
			presetKey: 'masters-2-1-short',
			startWeekKey: '2026-01-05',
			intent: 'deliberately-building',
			tracks: [{ discipline: 'run', currency: 'km', anchorValue: 40 }],
		},
		currentWeekKey: '2026-01-05',
		eventWeekKey: '2026-03-30',
		timezone: 'UTC',
		proposals: [],
		weeklyCapacityHours: null,
	}
	return value
}

function renderScreen(season: Partial<SeasonPreview['season']> = {}) {
	const approved = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/plan/generate/:eventId',
			Component: (props: Record<string, unknown>) => (
				<GenerateSeasonRoute {...(props as any)} />
			),
			loader: () => ({
				preview: preview(season),
				refusal: null,
				nearestFit: true,
			}),
			action: async ({ request }) => {
				approved(new URL(request.url).search)
				return { refusal: null }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/plan/generate/event-1']} />)
	return { approved }
}

test('the season is already there — the screen opens on a plan, not a blank form', async () => {
	renderScreen()
	expect(
		await screen.findByRole('heading', {
			name: /sesongen din, klar til å se over/i,
		}),
	).toBeInTheDocument()
	expect(screen.getByText('5 × 1 km @ T')).toBeInTheDocument()
	expect(screen.getByText(/1 økt over 1 uke/i)).toBeInTheDocument()
})

test('nothing reaches the calendar until the athlete says so', async () => {
	renderScreen()
	expect(
		await screen.findByRole('button', {
			name: /legg denne økta i kalenderen/i,
		}),
	).toBeInTheDocument()
})

test('a corpus session shows its Citation in the provenance slot', async () => {
	renderScreen()
	const slot = await screen.findByText(
		/Kilde: Daniels — Daniels' Running Formula \(2013\)/,
	)
	expect(slot).toBeInTheDocument()
	expect(
		screen.queryByText(NB_PROVENANCE_LABELS.nonVouch),
	).not.toBeInTheDocument()
})

test('the two uncited stock kinds say so, each in its own words', async () => {
	renderScreen({
		sessions: [
			session({ provenance: { kind: 'convention' }, title: 'Easy 60' }),
			session({
				weekday: 3,
				provenance: { kind: 'hand-written' },
				title: 'Shakeout',
			}),
		],
	})
	expect(
		await screen.findByText(
			/Vanlig trenerpraksis — trainm8 viser ikke til noen publisert/i,
		),
	).toBeInTheDocument()
	expect(
		screen.getByText(/Skrevet av trainm8 — ingen publisert kilde/i),
	).toBeInTheDocument()
})

test('a community session reads the slot without a Citation, and carries the non-vouch', async () => {
	// Generation places no community row today, but the slot reads provenance
	// rather than assuming a Citation — so a forked or adopted session still
	// renders honestly.
	const attributed: SessionProvenance = {
		kind: 'community',
		attribution: { displayName: 'Jo Kraas', publishedAt: new Date(0) },
	}
	renderScreen({
		sessions: [
			session({ provenance: attributed }),
			session({
				weekday: 3,
				provenance: { kind: 'community', attribution: null },
				title: 'Unattributed',
			}),
		],
	})
	expect(await screen.findByText('Publisert av Jo Kraas')).toBeInTheDocument()
	expect(
		screen.getByText('Publisert av en utøver — trainm8 kan ikke si hvem.'),
	).toBeInTheDocument()
	expect(screen.getAllByText(NB_PROVENANCE_LABELS.nonVouch)).toHaveLength(2)
})

test('the strength Unavailable is stated before the season, not hidden inside it', async () => {
	renderScreen({
		unavailable: [{ reading: 'strength-track', discipline: 'strength' }],
	})
	const notice = await screen.findByRole('region', {
		name: /dette er ikke med i sesongen/i,
	})
	expect(within(notice).getByText(/ingen spor for styrke/i)).toBeInTheDocument()
	expect(
		within(notice).getByText(/i stedet for å finne på dem/i),
	).toBeInTheDocument()
})

test('an empty day is named rather than backfilled', async () => {
	renderScreen({
		sessions: [],
		unfilled: [
			{
				weekIndex: 0,
				weekKey: '2026-01-05',
				weekday: 2,
				discipline: 'run',
				slot: 'quality',
				zone: 4,
				archetypes: ['threshold', 'sub-threshold'],
				cataloguePhase: 'base',
			},
		],
	})
	expect(await screen.findByText(/1 treningsdag er tom/i)).toBeInTheDocument()
	expect(
		screen.getByText(
			/ingenting å legge inn – terskel eller under terskel i grunntrening/i,
		),
	).toBeInTheDocument()
})

test('a week with no Season Anchor reads “—” rather than a number nobody typed', async () => {
	renderScreen({
		weeks: [
			week({ targets: [{ discipline: 'run', currency: 'km', value: null }] }),
		],
	})
	expect(await screen.findByText(/Løping —/)).toBeInTheDocument()
})

test('the one question and the pre-selected shape read in Norwegian, as Sesong names them', async () => {
	renderScreen()
	// The asked input: the loader's answer is the checked card.
	expect(
		await screen.findByRole('radio', {
			name: 'Jeg trener jevnt og bygger videre',
		}),
	).toBeChecked()
	// The shape by Sesong's name for it, never the preset's English `name`.
	expect(
		screen.getAllByText(nbPresetName('masters-2-1-short')).length,
	).toBeGreaterThan(0)
	const preset = PERIODIZATION_PRESETS.find(
		({ key }) => key === 'masters-2-1-short',
	)!
	expect(screen.queryByText(preset.name)).not.toBeInTheDocument()
	expect(
		screen.queryByText(preset.provenance, { exact: false }),
	).not.toBeInTheDocument()
	// Pre-selected by fit, and the closed row says so.
	expect(
		screen.getByText(/valgt fordi den lander nærmest løpet/),
	).toBeInTheDocument()
	// An anchor no history proposed is the athlete's own, and says so.
	expect(screen.getByText(/Ditt eget tall/)).toBeInTheDocument()
	// The phase line reads the stored English name in Norwegian.
	expect(screen.getByText(/Grunntrening 4 uker/)).toBeInTheDocument()
})

// The Weekly Capacity reading (ADR 0110 §2): where generation lowered the
// anchors, or could not make the season fit, the preview says so; where it
// fits or the check did not run, it says nothing.

/** A paragraph's text with no-break spaces read as spaces. */
function paragraph(expected: string) {
	return screen.findByText((_, element) =>
		element?.tagName === 'P'
			? element.textContent?.replaceAll('\u00a0', ' ') === expected
			: false,
	)
}

test('a lowered season says it was scaled to the athlete’s hours, before and after', async () => {
	renderScreen({
		capacity: {
			kind: 'lowered',
			fromPeakHours: 7.84,
			peakHours: 5.94,
			weeklyCapacityHours: 6,
			estimated: true,
			anchors: [{ discipline: 'run', currency: 'km', from: 50, to: 38 }],
		},
	})
	expect(
		await paragraph(
			'Skalert ned til kapasiteten din på 6 t/uke: den tyngste uka er nå ≈ 5,9 t/uke, ned fra ≈ 7,8 t/uke.',
		),
	).toBeInTheDocument()
})

test('hours the athlete authored in hours carry no ≈', async () => {
	renderScreen({
		capacity: {
			kind: 'lowered',
			fromPeakHours: 7.84,
			peakHours: 5.94,
			weeklyCapacityHours: 6,
			estimated: false,
			anchors: [{ discipline: 'run', currency: 'hours', from: 6, to: 4.5 }],
		},
	})
	expect(
		await paragraph(
			'Skalert ned til kapasiteten din på 6 t/uke: den tyngste uka er nå 5,9 t/uke, ned fra 7,8 t/uke.',
		),
	).toBeInTheDocument()
})

test('a season that still does not fit says so, where, and why', async () => {
	renderScreen({
		capacity: {
			kind: 'over',
			weeklyCapacityHours: 6,
			estimated: true,
			warnings: [
				{
					fromWeekIndex: 2,
					toWeekIndex: 4,
					peakHours: 9.6,
					weeklyCapacityHours: 6,
				},
				{
					fromWeekIndex: 7,
					toWeekIndex: 7,
					peakHours: 8.1,
					weeklyCapacityHours: 6,
				},
			],
		},
	})
	// The season starts in ISO week 2, so plan weeks 3–5 and 8 are ISO 4–6 and 9.
	expect(
		await paragraph(
			'Sesongen passer fortsatt ikke timene dine. Uke 4–6 og uke 9 ber om opptil ≈ 9,6 t/uke utholdenhetstrening, og kapasiteten din er 6 t/uke. Kvalitetsøktene alene krever mer enn det, så et lavere startvolum hjelper ikke – startvolumet står som det er.',
		),
	).toBeInTheDocument()
})

test('a breach in every week is said as the whole season, not as a span', async () => {
	renderScreen({
		weeks: [week(), week({ weekIndex: 1, weekKey: '2026-01-12' })],
		capacity: {
			kind: 'over',
			weeklyCapacityHours: 0.5,
			estimated: false,
			warnings: [
				{
					fromWeekIndex: 0,
					toWeekIndex: 1,
					peakHours: 2.25,
					weeklyCapacityHours: 0.5,
				},
			],
		},
	})
	expect(
		await paragraph(
			'Sesongen passer fortsatt ikke timene dine. Hver uke i sesongen ber om opptil 2,3 t/uke utholdenhetstrening, og kapasiteten din er 0,5 t/uke. Kvalitetsøktene alene krever mer enn det, så et lavere startvolum hjelper ikke – startvolumet står som det er.',
		),
	).toBeInTheDocument()
})

test.each([
	{ kind: 'unset' as const },
	{ kind: 'unpriced' as const, weeklyCapacityHours: 6 },
	{ kind: 'fits' as const, peakHours: 5, weeklyCapacityHours: 6 },
])('a $kind reading adds nothing to the preview', async (capacity) => {
	renderScreen({ capacity })
	await screen.findByRole('heading', { name: /sesongen din, klar/i })
	expect(screen.queryByText(/kapasitet/i)).not.toBeInTheDocument()
	expect(screen.queryByText(/skalert ned/i)).not.toBeInTheDocument()
})
