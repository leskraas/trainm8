/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { createRoutesStub, type LoaderFunctionArgs } from 'react-router'
import { expect, test } from 'vitest'
import  { type Route } from './+types/load.ts'
import LoadRoute from './load.tsx'

type LoaderData = {
	current: { ctl: number; atl: number; tsb: number } | null
	snapshots: Array<{ date: string; ctl: number; atl: number; tsb: number }>
}

function makeLoader(overrides: Partial<LoaderData> = {}) {
	return async (_args: LoaderFunctionArgs) => ({
		current: { ctl: 45, atl: 38, tsb: 7 },
		snapshots: [],
		...overrides,
	})
}

function renderRoute(loader: (args: LoaderFunctionArgs) => Promise<unknown>) {
	const RouteComponent = (props: Record<string, unknown>) => (
		<LoadRoute {...(props as unknown as Route.ComponentProps)} />
	)
	const App = createRoutesStub([
		{
			path: '/training/load',
			Component: RouteComponent,
			loader,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<App initialEntries={['/training/load']} />)
}

test('renders shadcn Card components for header, metrics, and sparkline', async () => {
	renderRoute(makeLoader())

	await screen.findByText('Training Load')

	const cards = document.querySelectorAll('[data-slot="card"]')
	// header card + 3 metric cards + sparkline card = 5 total
	expect(cards).toHaveLength(5)
})

test('renders all three load metric labels', async () => {
	renderRoute(makeLoader())

	await screen.findByText('Fitness (CTL)')
	expect(screen.getByText('Fatigue (ATL)')).toBeInTheDocument()
	expect(screen.getByText('Form (TSB)')).toBeInTheDocument()
})

test('renders metric values', async () => {
	renderRoute(makeLoader({ current: { ctl: 45, atl: 38, tsb: 7 } }))

	await screen.findByText('45')
	expect(screen.getByText('38')).toBeInTheDocument()
	expect(screen.getByText('7')).toBeInTheDocument()
})

test('renders em-dash when current load is null', async () => {
	renderRoute(makeLoader({ current: null }))

	await screen.findByText('Training Load')
	const dashes = screen.getAllByText('—')
	expect(dashes).toHaveLength(3)
})

test('renders 90-Day Trend section', async () => {
	renderRoute(makeLoader())

	await screen.findByText('90-Day Trend')
})
