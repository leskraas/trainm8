/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import {
	EMPTY_BASIS,
	type ThresholdEstimate,
} from '#app/utils/profile-analysis/types.ts'
import AnalyzeProfileRoute from './analyze.tsx'

// ── Det historikken din sier ───────────────────────────────────────────────────
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
		screen.getByText(/kritisk watt, vanligvis litt over FTP/i),
	).toBeInTheDocument()
})

test('the derivation waits behind a tap, and names what it could not read', async () => {
	renderRoute([cpEstimate()])
	const trigger = await screen.findByRole('button', {
		name: /Slik kom vi fram til det/i,
	})
	// Closed by default: the reasoning is available, not asserted.
	expect(trigger).toHaveAttribute('aria-expanded', 'false')
	await userEvent.click(trigger)
	expect(trigger).toHaveAttribute('aria-expanded', 'true')
	// The durations the storage was too coarse for are named rather than dropped.
	expect(await screen.findByText(/For grovt lagret/i)).toBeInTheDocument()
})

test('W′ is shown in the derivation and is not something you can accept', async () => {
	renderRoute([cpEstimate()])
	await userEvent.click(
		await screen.findByRole('button', { name: /Slik kom vi fram til det/i }),
	)
	expect(await screen.findByText(/W′/)).toBeInTheDocument()
	// One estimate, one accept control.
	expect(screen.getAllByRole('button', { name: /Bruk dette/i })).toHaveLength(1)
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
	expect(await screen.findByText('Ikke tilgjengelig')).toBeInTheDocument()
	expect(
		screen.getByText(/Dette kan vi ikke lese fra dataene dine ennå/i),
	).toBeInTheDocument()
	// An absence offers nothing to accept.
	expect(screen.queryByRole('button', { name: /Bruk dette/i })).toBeNull()
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
		await screen.findByText(/for lav oppløsning til å lese korte innsatser/i),
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
	expect(await screen.findByText('lav sikkerhet')).toBeInTheDocument()
	expect(screen.getByText(/anslått ut fra alderen din/i)).toBeInTheDocument()
	await userEvent.click(
		screen.getByRole('button', { name: /Slik kom vi fram til det/i }),
	)
	expect(
		await screen.findByText(
			/En aldersformel beskriver en befolkning, ikke deg/i,
		),
	).toBeInTheDocument()
})

test('an existing value is stated, and the control says it would replace it', async () => {
	renderRoute([cpEstimate()], {
		stored: { ...STORED, bike: { ...STORED.bike, ftp: 240 } },
	})
	expect(await screen.findByText(/Du har 240 W lagret/i)).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: /Erstatt det jeg har/i }),
	).toBeInTheDocument()
})

test('nothing imported yet points at the thing that would fix it', async () => {
	renderRoute([], { activitiesRead: 0 })
	expect(
		await screen.findByText(/Ingen importerte aktiviteter ennå/i),
	).toBeInTheDocument()
	expect(
		screen.getByRole('link', { name: /Koble til en konto/i }),
	).toBeInTheDocument()
})

test('the screen states that nothing is saved until it is accepted', async () => {
	renderRoute([cpEstimate()])
	expect(
		await screen.findByText(/Ingenting lagres før du godtar det/i),
	).toBeInTheDocument()
})
