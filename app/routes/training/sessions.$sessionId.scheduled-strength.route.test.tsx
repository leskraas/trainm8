/**
 * @vitest-environment jsdom
 *
 * A **scheduled** strength session's prescription, which is the editable Token
 * Sentence rather than the inert one (ADR 0027 R7). Three things a browser
 * drive-through found it getting wrong, all of them specific to the editable
 * branch — the completed branch was already right:
 *
 * 1. the lift was never named, because the exercise token IS the catalogue
 *    combobox and the detail route handed it no catalogue;
 * 2. an authored `@ 85 % 1RM` rendered as that bare string for an athlete with
 *    a 1RM on file, instead of resolving to their kilos;
 * 3. and the same bare string for an athlete *without* one — a percentage with
 *    no basis and no stated absence.
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import { type ResolveContext } from '#app/utils/strength/anchors.ts'
import { type SessionDetail } from '#app/utils/training.server.ts'
import SessionDetailRoute from './sessions.$sessionId.tsx'

// The Token Sentence editor mounts popovers; jsdom implements neither of these,
// which some popover internals reach for.
window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

const SESSION_DAY = '2030-01-02T08:00:00.000Z'

/** S6 as the Catalogue places it: back squat, four working sets of four at
 * 85 % 1RM, carrying the Load Target union *and* its legacy projection exactly
 * as the placement writes them. */
function scheduledSquats(): SessionDetail {
	return {
		id: 'session-1',
		scheduledAt: new Date(SESSION_DAY),
		status: 'scheduled',
		source: 'authored',
		adoptedAt: null,
		tssValue: null,
		plannedTssValue: null,
		plannedTssConfidence: null,
		replanReason: null,
		workout: {
			id: 'workout-1',
			title: 'Maximal strength A — squat',
			description: null,
			discipline: 'strength',
			intent: 'strength',
			archetype: null,
			blocks: [
				{
					id: 'block-1',
					name: null,
					orderIndex: 0,
					repeatCount: 1,
					seriesRepeatCount: 1,
					betweenSeriesRestSec: null,
					sendOff: null,
					steps: [
						{
							id: 'step-1',
							kind: 'strength',
							notes: null,
							discipline: null,
							intensity: null,
							orderIndex: 0,
							durationSec: null,
							distanceM: null,
							verticalM: null,
							gradePct: null,
							cadenceRpmMin: null,
							cadenceRpmMax: null,
							rest: null,
							exerciseId: 'ex_bb_back_squat',
							restBetweenSetsSec: 240,
							intensityHrMin: null,
							intensityHrMax: null,
							intensityPowerMin: null,
							intensityPowerMax: null,
							intensityPaceMin: null,
							intensityPaceMax: null,
							exercise: {
								id: 'ex_bb_back_squat',
								name: 'Back Squat',
								primaryMuscle: 'quads',
								equipment: 'barbell',
							},
							sets: Array.from({ length: 4 }, (_, i) => ({
								id: `set-${i}`,
								kind: 'reps' as const,
								orderIndex: i,
								load: JSON.stringify({ kind: 'pct1RM', minPct: 85 }),
								weightKg: null,
								pct1RM: 85,
								effortCap: null,
								tempo: null,
								reps: 4,
								durationSec: null,
								terminationRir: null,
								velocityLossPct: null,
							})),
						},
					],
				},
			],
		},
		sessionLog: null,
		recording: null,
	}
}

/** A 120 kg tested 1RM on file for the squat, as of the session's own day. */
function withOneRm(kg: number): Record<string, ResolveContext> {
	return {
		ex_bb_back_squat: {
			anchors: [
				{
					construct: 'oneRm',
					valueKg: kg,
					reps: null,
					protocol: 'tested',
					confidence: null,
					effectiveAtISO: '2029-12-01T00:00:00.000Z',
				},
			],
			bodyweightKg: 82,
			asOfISO: SESSION_DAY,
		},
	}
}

/** A lift the athlete has never anchored: a real context with nothing in it,
 * which is what makes the absence statable. */
function withNoAnchor(): Record<string, ResolveContext> {
	return {
		ex_bb_back_squat: {
			anchors: [],
			bodyweightKg: 82,
			asOfISO: SESSION_DAY,
		},
	}
}

function renderRoute(loadContexts: Record<string, ResolveContext>) {
	const loader = async (_args: LoaderFunctionArgs) => ({
		session: scheduledSquats(),
		thresholds: {},
		loadContexts,
		// The two lists the editable sentence's exercise token needs, exactly as
		// the real loader reads them for a scheduled session.
		exercises: [
			{
				id: 'ex_bb_back_squat',
				name: 'Back Squat',
				primaryMuscle: 'quads',
				equipment: 'barbell',
			},
		],
		recentExerciseIds: ['ex_bb_back_squat'],
		lastSimilar: null,
		relinkTargets: [],
		archetype: null,
		loggedSetCount: 0,
	})
	const App = createRoutesStub([
		{
			path: '/training/sessions/:sessionId',
			Component: (props: Record<string, unknown>) => (
				<SessionDetailRoute {...(props as any)} />
			),
			loader,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/sessions/session-1']} />)
}

test('a scheduled session names the lift it prescribes, never an empty exercise picker', async () => {
	renderRoute(withOneRm(120))

	await screen.findByText('Maximal strength A — squat')
	expect(
		await screen.findByRole('button', { name: /Back Squat/ }),
	).toBeInTheDocument()
	expect(screen.queryByText(/Select exercise/)).not.toBeInTheDocument()
})

test('a scheduled session whose lift has a 1RM on file resolves the authored percentage into this athlete’s kilos', async () => {
	renderRoute(withOneRm(120))

	await screen.findByText('Maximal strength A — squat')
	// 85 % of 120 kg — the authored form leads, the athlete's number follows it
	// after the facet dot.
	expect(await screen.findByText(/85% 1RM · 102 kg/)).toBeInTheDocument()
})

test('a scheduled session whose lift has no anchor renders the authored percentage with its stated absence, never a number', async () => {
	renderRoute(withNoAnchor())

	await screen.findByText('Maximal strength A — squat')
	expect(
		await screen.findByText(/85% 1RM · no 1RM on file/),
	).toBeInTheDocument()
	// The absence is the whole point: a kilo here would be invented.
	expect(screen.queryByText(/\d+(\.\d+)? kg/)).not.toBeInTheDocument()
})
