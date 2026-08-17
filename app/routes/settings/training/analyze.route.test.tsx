/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	EMPTY_BASIS,
	type ThresholdEstimate,
} from '#app/utils/profile-analysis/types.ts'
import AnalyzeProfileRoute from './analyze.tsx'

// ── What your history says ───────────────────────────────────────────────────
// Every row is a proposal. The screen's contract: a number carries its caveat in
// place, a derivation waits behind a tap, and a refusal is never hidden.

const STORED = {
	run: {
		maxHr: null,
		lthr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
	},
	bike: {
		maxHr: null,
		lthr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
	},
	swim: {
		maxHr: null,
		lthr: null,
		ftp: null,
		runPowerThresholdW: null,
		thresholdPaceSecPerKm: null,
		cssSecPer100m: null,
	},
}

function cpEstimate(overrides: Partial<ThresholdEstimate> = {}) {
	return {
		kind: 'estimate' as const,
		discipline: 'bike' as const,
		construct: 'cp' as const,
		protocol: 'cp-fit' as const,
		value: 254,
		confidence: 'medium' as const,
		basis: {
			...EMPTY_BASIS,
			activityCount: 12,
			contributingCount: 4,
			durationsUsedSec: [120, 300, 600, 1200],
			durationsRefusedSec: [5, 15, 30, 60],
			rSquared: 0.97,
		},
		companion: { label: 'W′', value: 20_100 },
		...overrides,
	} as ThresholdEstimate
}

function renderRoute(
	estimates: ThresholdEstimate[],
	overrides: Record<string, unknown> = {},
) {
	const Stub = createRoutesStub([
		{
			path: '/settings/training/analyze',
			Component: (props: Record<string, unknown>) => (
				<AnalyzeProfileRoute {...(props as any)} />
			),
			loader: () => ({
				analysis: {
					estimates,
					stored: STORED,
					activitiesRead: 12,
					windowDays: 90,
					hasBirthdate: true,
					...overrides,
				},
			}),
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={['/settings/training/analyze']} />)
}

test('a critical power says it is a critical power, on the number', async () => {
	renderRoute([cpEstimate()])
	expect(await screen.findByText('254')).toBeInTheDocument()
	// The caveat that keeps a CP from silently reading as an FTP. It sits in
	// place, not behind the disclosure.
	expect(
		screen.getByText(/critical power — usually a little above FTP/i),
	).toBeInTheDocument()
})

test('the derivation waits behind a tap, and names what it could not read', async () => {
	renderRoute([cpEstimate()])
	const summary = await screen.findByText('How we got this')
	// A `<details>` is closed by default: the reasoning is available, not asserted.
	const details = summary.closest('details')
	expect(details).not.toBeNull()
	expect(details).not.toHaveAttribute('open')
	// The durations the storage was too coarse for are named rather than dropped.
	expect(screen.getByText(/Too coarse to read/i)).toBeInTheDocument()
})

test('W′ is shown in the derivation and is not something you can accept', async () => {
	renderRoute([cpEstimate()])
	expect(await screen.findByText(/W′/)).toBeInTheDocument()
	// One estimate, one accept control.
	expect(screen.getAllByRole('button', { name: /Use this/i })).toHaveLength(1)
})

test('a refusal is visible in place, never behind a disclosure', async () => {
	renderRoute([
		{
			kind: 'refusal',
			discipline: 'swim',
			construct: 'css',
			protocol: 'race-equivalence',
			refusal: 'unbuilt',
			basis: EMPTY_BASIS,
		},
	])
	expect(await screen.findByText('Unavailable')).toBeInTheDocument()
	expect(
		screen.getByText(/Not something we can read from your data yet/i),
	).toBeInTheDocument()
	// An absence offers nothing to accept.
	expect(screen.queryByRole('button', { name: /Use this/i })).toBeNull()
})

test('a coarse-storage refusal explains itself in one sentence', async () => {
	renderRoute([
		{
			kind: 'refusal',
			discipline: 'bike',
			construct: 'cp',
			protocol: 'cp-fit',
			refusal: 'resolution',
			basis: EMPTY_BASIS,
		},
	])
	expect(
		await screen.findByText(/too coarse a resolution to read short efforts/i),
	).toBeInTheDocument()
})

test('an age-formula reading is marked low confidence and says why', async () => {
	renderRoute([
		{
			kind: 'estimate',
			discipline: 'run',
			construct: 'maxHr',
			protocol: 'tanaka',
			value: 180,
			confidence: 'low',
			basis: EMPTY_BASIS,
			companion: null,
		},
	])
	expect(await screen.findByText('low confidence')).toBeInTheDocument()
	expect(screen.getByText(/estimated from your age/i)).toBeInTheDocument()
	expect(
		screen.getByText(/An age formula describes a population, not you/i),
	).toBeInTheDocument()
})

test('an existing value is stated, and the control says it would replace it', async () => {
	renderRoute([cpEstimate()], {
		stored: { ...STORED, bike: { ...STORED.bike, ftp: 240 } },
	})
	expect(await screen.findByText(/You have 240 W saved/i)).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /Replace what I have/i }),
	).toBeInTheDocument()
})

test('nothing imported yet points at the thing that would fix it', async () => {
	renderRoute([], { activitiesRead: 0 })
	expect(
		await screen.findByText(/No imported activities yet/i),
	).toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: /Connect an account/i }),
	).toBeInTheDocument()
})

test('the screen states that nothing is saved until it is accepted', async () => {
	renderRoute([cpEstimate()])
	expect(
		await screen.findByText(/Nothing is saved until you accept it/i),
	).toBeInTheDocument()
})
