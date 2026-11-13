/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test, vi } from 'vitest'
import {
	DRIFT_MARK_LABEL,
	NB_PROVENANCE_LABELS,
	PLAN_GENERATE_LABELS,
} from '#app/utils/labels.ts'
import { type SeasonPreview } from '#app/utils/plan-generation/generate.server.ts'
import { previewWeekVolumes } from '#app/utils/plan-generation/planned-volume.ts'
import { type SessionProvenance } from '#app/utils/plan-generation/provenance.ts'
import {
	type GeneratedSession,
	type GeneratedWeek,
} from '#app/utils/plan-generation/season.ts'
import { PERIODIZATION_PRESETS } from '#app/utils/plan-outline/presets.ts'
import {
	type CurrencyFigures,
	type VolumeSession,
} from '#app/utils/plan-outline/week-volumes.ts'
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
		prescribed: null,
		...overrides,
	}
}

/** What a placed session prescribes, as the preview's server read hands it in. */
type Prescribed = Partial<CurrencyFigures>

/**
 * A session the week model reads, on `dayKey`: placed by the generator, or one
 * the athlete already had (`existing`).
 */
function volume(
	dayKey: string,
	prescribed: Prescribed,
	overrides: Partial<VolumeSession> = {},
): VolumeSession {
	return {
		dayKey,
		status: 'planned',
		discipline: 'run',
		easy: false,
		prescribed: { km: null, hours: null, tss: null, sets: null, ...prescribed },
		recorded: null,
		plannedZones: [],
		doneZones: [],
		countsInNoTrack: false,
		...overrides,
	}
}

/**
 * The preview the loader returns, its week figures read through the same pure
 * model the server reads them with. By default each placed session prescribes
 * `km` 8; `prescribed` says otherwise, one entry per session in order.
 */
function preview(
	overrides: Partial<SeasonPreview['season']> = {},
	{
		prescribed,
		existing = [],
	}: { prescribed?: Prescribed[]; existing?: VolumeSession[] } = {},
) {
	const season: SeasonPreview['season'] = {
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
		placed: { kind: 'unset' },
		...overrides,
	}
	const placed = season.sessions.map((placedSession, index) =>
		volume(
			// The day the session is placed on: its weekday in its week.
			new Date(
				Date.parse(`${placedSession.weekKey}T00:00:00Z`) +
					placedSession.weekday * 86_400_000,
			)
				.toISOString()
				.slice(0, 10),
			prescribed?.[index] ?? { km: 8 },
			{ discipline: placedSession.discipline },
		),
	)
	const value: SeasonPreview = {
		event: {
			id: 'event-1',
			name: 'Spring 10k',
			startDate: new Date('2026-04-04T09:00:00Z'),
			disciplines: ['run'],
		},
		season,
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
		weekVolumes: previewWeekVolumes({
			season,
			placed,
			existing,
			todayKey: '2026-01-05',
		}),
	}
	return value
}

function renderScreen(
	season: Partial<SeasonPreview['season']> = {},
	figures: Parameters<typeof preview>[1] = {},
) {
	const approved = vi.fn()
	const App = createRoutesStub([
		{
			path: '/training/plan/generate/:eventId',
			Component: (props: Record<string, unknown>) => (
				<GenerateSeasonRoute {...(props as any)} />
			),
			loader: () => ({
				preview: preview(season, figures),
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

// The week's two numbers (#472): its Week Target and the Planned Volume of the
// sessions it will hold, per track, worded as Sesong words them.

/** Each track row of the first week card, as text, no-break spaces as spaces. */
async function trackRows() {
	const [list] = await screen.findAllByRole('list', {
		name: PLAN_GENERATE_LABELS.weekFiguresLabel,
	})
	return within(list!)
		.getAllByRole('listitem')
		.map((item) => item.textContent?.replaceAll(/[\u00a0\u2009]/g, ' '))
}

test('a week card shows each track’s target and planned figure, labelled, with units', async () => {
	renderScreen(
		{ sessions: [session(), session({ weekday: 3 })] },
		{ prescribed: [{ km: 20 }, { km: 18 }] },
	)
	expect(await trackRows()).toEqual(['Løpingmål 40 km · planlagt 38 km'])
	expect(screen.queryByRole('img', { name: DRIFT_MARK_LABEL })).toBeNull()
})

test('a week with no Season Anchor reads “—” for its target and still shows what is planned', async () => {
	renderScreen({
		weeks: [
			week({ targets: [{ discipline: 'run', currency: 'km', value: null }] }),
		],
	})
	expect(await trackRows()).toEqual(['Løpingmål — · planlagt 8 km'])
})

test('a session with no number in the unit is counted apart, never as zero, and keeps a short week unmarked', async () => {
	renderScreen(
		{ sessions: [session(), session({ weekday: 3 })] },
		{ prescribed: [{ km: 20 }, { km: null }] },
	)
	expect(await trackRows()).toEqual([
		'Løpingmål 40 km · planlagt 20 km +1 uten km',
	])
	expect(screen.queryByRole('img', { name: DRIFT_MARK_LABEL })).toBeNull()
})

test('a week whose sessions all lack a number says so instead of 0 km', async () => {
	renderScreen(
		{ sessions: [session(), session({ weekday: 3 })] },
		{ prescribed: [{ km: null }, { km: null }] },
	)
	expect(await trackRows()).toEqual([
		'Løpingmål 40 km · planlagt 2 økter uten km',
	])
})

test('a week with nothing placed plans 0, carries no mark, and keeps its unfilled lines', async () => {
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
				archetypes: ['threshold'],
				cataloguePhase: 'base',
			},
		],
	})
	expect(await trackRows()).toEqual(['Løpingmål 40 km · planlagt 0 km'])
	expect(
		screen.getByText(/ingenting å legge inn – terskel/i),
	).toBeInTheDocument()
})

test('≠ marks a week planned more than 10 % off, per week as on Sesong, and says what it means', async () => {
	// Run has nothing placed while bike has a session: the week has sessions, so
	// run's 0 against 40 is marked, as Sesong marks it after approval.
	renderScreen(
		{
			tracks: [
				{ discipline: 'run', currency: 'km', anchorValue: 40 },
				{ discipline: 'bike', currency: 'hours', anchorValue: 4 },
			],
			weeks: [
				week({
					targets: [
						{ discipline: 'run', currency: 'km', value: 40 },
						{ discipline: 'bike', currency: 'hours', value: 4 },
					],
				}),
			],
			sessions: [session({ discipline: 'bike' })],
		},
		{ prescribed: [{ hours: 4.2 }] },
	)
	expect(await trackRows()).toEqual([
		'Løpingmål 40 km · planlagt 0 km ≠',
		'Syklingmål 4 t · planlagt 4,2 t',
	])
	expect(screen.getByRole('img', { name: DRIFT_MARK_LABEL })).toHaveTextContent(
		'≠',
	)
})

test('an hours track counts a session it cannot time apart, in the existing words', async () => {
	renderScreen(
		{
			tracks: [{ discipline: 'bike', currency: 'hours', anchorValue: 4 }],
			weeks: [
				week({
					targets: [{ discipline: 'bike', currency: 'hours', value: 4 }],
				}),
			],
			sessions: [
				session({ discipline: 'bike' }),
				session({ discipline: 'bike', weekday: 3 }),
			],
		},
		{ prescribed: [{ hours: 3 }, { hours: null }] },
	)
	expect(await trackRows()).toEqual([
		'Syklingmål 4 t · planlagt 3 t +1 uten timer',
	])
})

test('a session the athlete already has in the week is counted, and the card says so', async () => {
	renderScreen(
		{},
		{
			prescribed: [{ km: 20 }],
			existing: [volume('2026-01-10', { km: 16 })],
		},
	)
	expect(await trackRows()).toEqual(['Løpingmål 40 km · planlagt 36 km'])
	expect(
		screen.getByText(PLAN_GENERATE_LABELS.alreadyInWeek(1)),
	).toBeInTheDocument()
})

test('the page says once, above the weeks, that sessions are placed as published', async () => {
	renderScreen({
		weeks: [week(), week({ weekIndex: 1, weekKey: '2026-01-12' })],
	})
	// `findByText` throws on a second match, so this is "said once".
	const sentence = await screen.findByText((_, element) =>
		element?.tagName === 'P'
			? element.textContent === PLAN_GENERATE_LABELS.placedAsPublished
			: false,
	)
	expect(sentence).toHaveTextContent(/≠ betyr at planlagt er mer enn 10 %/)
	expect(
		screen.getAllByRole('list', {
			name: PLAN_GENERATE_LABELS.weekFiguresLabel,
		}),
	).toHaveLength(2)
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

// --- Placed Hours over the Weekly Capacity (#473, ADR 0110 §4, ADR 0116) ---

/** Weeks `count` long from 2026-01-05 (ISO week 2), all loading weeks. */
function weeksOf(count: number): GeneratedWeek[] {
	return Array.from({ length: count }, (_, weekIndex) =>
		week({
			weekIndex,
			weekKey: new Date(Date.UTC(2026, 0, 5 + 7 * weekIndex))
				.toISOString()
				.slice(0, 10),
		}),
	)
}

type PlacedRead = Extract<SeasonPreview['season']['placed'], { kind: 'read' }>

function placedRead(
	hours: Array<number | null>,
	breaches: Array<[number, number]>,
	shape: { exact?: boolean; estimated?: boolean } = {},
): PlacedRead {
	return {
		kind: 'read',
		weeklyCapacityHours: 6,
		weeks: hours.map((h) =>
			h == null
				? null
				: {
						hours: h,
						exact: shape.exact ?? false,
						estimated: shape.estimated ?? true,
					},
		),
		breaches: breaches.map(([fromWeekIndex, toWeekIndex]) => ({
			fromWeekIndex,
			toWeekIndex,
			peakHours: 7.5,
			weeklyCapacityHours: 6,
		})),
	}
}

test('a week whose placed sessions outrun the capacity says so on its card, as a floor read through a pace', async () => {
	renderScreen({ placed: placedRead([7.46], [[0, 0]]) })
	const line = await paragraph(
		'Øktene alene tar minst ≈ 7,5 t, kapasiteten din er 6 t/uke.',
	)
	expect(line).toHaveAttribute('data-placed', 'over')
	// In the foreground, on the card itself: never muted, never behind a tap.
	expect(line.className).not.toMatch(/muted/)
	expect(
		within(screen.getByRole('article', { name: /uke 2/i })).getByText(
			/Øktene alene tar/,
		),
	).toBeInTheDocument()
	// The figure is held together with no-break spaces, and `minst` may wrap.
	expect(line.textContent).toContain('minst ≈\u00a07,5\u00a0t')
})

test('a week timed end to end reads a plain figure, with no minst and no ≈', async () => {
	renderScreen({
		placed: placedRead([7.5], [[0, 0]], { exact: true, estimated: false }),
	})
	expect(
		await paragraph('Øktene alene tar 7,5 t, kapasiteten din er 6 t/uke.'),
	).toBeInTheDocument()
})

test('the season line names the breaching weeks beside the over line, and neither replaces the other', async () => {
	renderScreen({
		weeks: weeksOf(10),
		capacity: {
			kind: 'over',
			weeklyCapacityHours: 6,
			estimated: true,
			warnings: [
				{
					fromWeekIndex: 7,
					toWeekIndex: 7,
					peakHours: 8.1,
					weeklyCapacityHours: 6,
				},
			],
		},
		placed: placedRead(
			[7, 7, 7, 5, 5, 5, 5, 5, 7, 5],
			[
				[0, 2],
				[8, 8],
			],
		),
	})
	expect(
		await paragraph(
			'Øktene alene tar mer tid enn du har. Uke 2–4 og uke 10 har økter som til sammen tar lengre tid enn kapasiteten din på 6 t/uke. Ingen økt er kortet ned eller byttet ut – hver av ukene viser hvor mye.',
		),
	).toHaveAttribute('data-placed', 'season')
	expect(document.querySelector('[data-capacity="over"]')).not.toBeNull()
})

test('one breaching week is told as that week', async () => {
	renderScreen({ weeks: weeksOf(3), placed: placedRead([5, 7, 5], [[1, 1]]) })
	expect(
		await paragraph(
			'Øktene alene tar mer tid enn du har. Uke 3 har økter som til sammen tar lengre tid enn kapasiteten din på 6 t/uke. Ingen økt er kortet ned eller byttet ut – uka viser hvor mye.',
		),
	).toBeInTheDocument()
})

test('breaching weeks behind «N uker til» are named on its row, in the foreground, with the section closed', async () => {
	renderScreen({
		weeks: weeksOf(8),
		placed: placedRead(
			[7, 5, 5, 5, 5, 7, 7, 5],
			[
				[0, 0],
				[5, 6],
			],
		),
	})
	const trigger = await screen.findByRole('button', { name: /4 uker til/i })
	expect(trigger).toHaveAttribute('aria-expanded', 'false')
	const breach = within(trigger).getByText(
		'Uke 7–8 ligger her, og øktene der tar mer tid enn du har.',
	)
	expect(breach).toHaveClass('text-foreground')
	expect(breach).toHaveAttribute('data-placed', 'remaining')
})

test('past three hidden spans the row counts the weeks instead of listing them', async () => {
	renderScreen({
		weeks: weeksOf(12),
		placed: placedRead(
			[5, 5, 5, 5, 7, 5, 7, 5, 7, 5, 7, 7],
			[
				[4, 4],
				[6, 6],
				[8, 8],
				[10, 11],
			],
		),
	})
	const trigger = await screen.findByRole('button', { name: /8 uker til/i })
	expect(
		within(trigger).getByText('5 av ukene her tar mer tid enn du har'),
	).toBeInTheDocument()
})

test('a breach in every week leaves the row to the season line', async () => {
	renderScreen({
		weeks: weeksOf(6),
		placed: placedRead([7, 7, 7, 7, 7, 7], [[0, 5]]),
	})
	const trigger = await screen.findByRole('button', { name: /2 uker til/i })
	expect(within(trigger).queryByText(/ligger her/)).not.toBeInTheDocument()
	expect(
		await screen.findByText(/Hver uke i sesongen har økter/),
	).toBeInTheDocument()
})

test.each([
	{ name: 'no capacity', placed: { kind: 'unset' as const } },
	{ name: 'weeks that fit', placed: placedRead([5.9], []) },
	{ name: 'a week with nothing timed', placed: placedRead([null], []) },
])('$name adds nothing about the placed sessions', async ({ placed }) => {
	renderScreen({ placed })
	await screen.findByRole('heading', { name: /sesongen din, klar/i })
	expect(screen.queryByText(/Øktene alene/)).not.toBeInTheDocument()
	expect(document.querySelector('[data-placed]')).toBeNull()
})
