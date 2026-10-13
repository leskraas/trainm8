/**
 * @vitest-environment jsdom
 */
/**
 * Meg (ADR 0083 §7) with the Form and Rekorder sections the home hero handed
 * over (#505): both render, in the page's reading order, with their empty and
 * "ikke målt" states saying why.
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRoutesStub } from 'react-router'
import { expect, test } from 'vitest'
import { type TsbTrust } from '#app/utils/load/trustworthiness.ts'
import { type PersonalRecord } from '#app/utils/personal-records.ts'
import {
	buildFormReading,
	buildRecordLines,
} from './__me-form-records-presenter.ts'
import MeRoute from './me.tsx'

const TRUSTED: TsbTrust = {
	trustworthy: true,
	daysOfHistory: 60,
	requiredDays: 42,
}

const RECORD: PersonalRecord = {
	discipline: 'run',
	kind: 'farthest',
	value: 21_100,
	sessionId: 'session-1',
	achievedAt: new Date('2030-02-10T09:00:00Z'),
	previousValue: 10_000,
	delta: 11_100,
}

function renderMe({
	current = { ctl: 62, atl: 58, tsb: 4, date: '2030-02-20' },
	trust = TRUSTED,
	snapshots = [
		{ date: '2030-01-04', ctl: 51 },
		{ date: '2030-02-20', ctl: 62 },
	],
	records = [RECORD],
	credits = [],
}: {
	current?: Parameters<typeof buildFormReading>[0]['current']
	trust?: TsbTrust
	snapshots?: Array<{ date: string; ctl: number }>
	records?: PersonalRecord[]
	credits?: string[]
} = {}) {
	const loaderData = {
		user: { name: 'Kody', username: 'kody', image: null },
		intervalsicu: 'connected' as const,
		form: buildFormReading({ current, trust, snapshots }),
		records: buildRecordLines(records),
		credits,
	}
	const App = createRoutesStub([
		{
			path: '/me',
			Component: (props: Record<string, unknown>) => (
				<MeRoute {...(props as any)} />
			),
			loader: () => loaderData,
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	return render(<App initialEntries={['/me']} />)
}

test('Form and Rekorder sit between the profile and the account sections', async () => {
	renderMe()

	await screen.findByRole('heading', { name: 'Meg', level: 1 })
	const sections = screen
		.getAllByRole('heading', { level: 2 })
		.map((heading) => heading.textContent)
	expect(sections).toEqual(['Form', 'Rekorder', 'Innstillinger', 'Koblinger'])
})

test('the Form section shows the triad as legend triggers, with its trust and trend', async () => {
	renderMe()

	const section = await screen.findByRole('region', { name: 'Form' })
	for (const term of ['Kondisjon (CTL)', 'Tretthet (ATL)', 'Form (TSB)']) {
		expect(
			within(section).getByRole('button', { name: term }),
		).toBeInTheDocument()
	}
	expect(screen.getByTestId('me-form-fitness')).toHaveTextContent('62')
	expect(screen.getByTestId('me-form-fatigue')).toHaveTextContent('58')
	expect(screen.getByTestId('me-form-form')).toHaveTextContent('+4')
	expect(section).toHaveTextContent('i balanse')
	expect(section).toHaveTextContent(
		'Bygger på 60 dager med belastning · regnet ut 20. feb',
	)
	expect(section).toHaveTextContent('Kondisjon 51 → 62 siden 4. jan')
	expect(within(section).queryByText('ikke målt')).not.toBeInTheDocument()
	expect(within(section).queryByRole('progressbar')).not.toBeInTheDocument()
})

test('each term is written whole and opens its definition on a tap, not only on hover', async () => {
	const user = userEvent.setup()
	renderMe()

	const section = await screen.findByRole('region', { name: 'Form' })
	// Plain words under the figures, never `Kond` / `Tretth` (#505 story 70).
	expect(screen.getByTestId('me-form-fitness')).toHaveTextContent('Kondisjon')
	expect(screen.getByTestId('me-form-fatigue')).toHaveTextContent('Tretthet')
	await user.click(
		within(section).getByRole('button', { name: 'Kondisjon (CTL)' }),
	)
	expect(
		await screen.findByText(
			/snittet av treningsbelastningen \(TSS\) de siste 42 dagene/,
		),
	).toBeInTheDocument()
})

test('on a cold start Form reads "ikke målt", says why, and shows the gate filling', async () => {
	renderMe({
		trust: { trustworthy: false, daysOfHistory: 12, requiredDays: 42 },
	})

	const section = await screen.findByRole('region', { name: 'Form' })
	expect(screen.getByTestId('me-form-fitness')).toHaveTextContent('62')
	expect(screen.getByTestId('me-form-form')).toHaveTextContent('ikke målt')
	expect(screen.getByTestId('me-form-unmeasured')).toHaveTextContent(
		'den trenger 42 dager med belastning, og du har 12',
	)
	const gate = within(section).getByRole('progressbar', {
		name: 'Bygger grunnlag',
	})
	expect(gate).toHaveAttribute('aria-valuenow', '12')
	expect(gate).toHaveAttribute('aria-valuemax', '42')
	expect(gate).toHaveAttribute('aria-valuetext', 'dag 12 av 42')
	// No state word read off the number the section refuses to print.
	expect(section).not.toHaveTextContent('i balanse')
})

test('with no load at all every figure is "ikke målt", with one reason', async () => {
	renderMe({ current: null, snapshots: [] })

	await screen.findByRole('region', { name: 'Form' })
	for (const key of ['fitness', 'fatigue', 'form']) {
		expect(screen.getByTestId(`me-form-${key}`)).toHaveTextContent('ikke målt')
	}
	expect(screen.getByTestId('me-form-unmeasured')).toHaveTextContent(
		'ingen treningsbelastning er regnet ut',
	)
})

test('the Rekorder section lists each record with its gain and its day', async () => {
	renderMe()

	const section = await screen.findByRole('region', { name: 'Rekorder' })
	const rows = within(section).getAllByRole('listitem')
	expect(rows).toHaveLength(1)
	expect(rows[0]).toHaveTextContent('Lengste løpetur')
	expect(rows[0]).toHaveTextContent('21,1 km')
	expect(rows[0]).toHaveTextContent('+11,1 km over forrige beste')
	expect(rows[0]).toHaveTextContent('satt 10. feb 2030')
})

test('with no records the section says what will make one, never a zero', async () => {
	renderMe({ records: [] })

	const section = await screen.findByRole('region', { name: 'Rekorder' })
	expect(section).toHaveTextContent('Ingen personlige rekorder ennå')
	expect(within(section).queryByRole('listitem')).not.toBeInTheDocument()
})

const GARMIN_DERIVED =
	'Insights derived in part from Garmin device-sourced data.'

test("Form and Rekorder built on Garmin data each carry Garmin's derived-data line, in view (ADR 0098)", async () => {
	renderMe({ credits: [GARMIN_DERIVED] })

	const form = await screen.findByRole('region', { name: 'Form' })
	expect(within(form).getByText(GARMIN_DERIVED)).toBeVisible()
	const records = screen.getByRole('region', { name: 'Rekorder' })
	expect(within(records).getByText(GARMIN_DERIVED)).toBeVisible()
})

test('with no records, Rekorder has nothing derived to credit', async () => {
	renderMe({ records: [], credits: [GARMIN_DERIVED] })

	const records = await screen.findByRole('region', { name: 'Rekorder' })
	expect(within(records).queryByText(GARMIN_DERIVED)).not.toBeInTheDocument()
})

test('without Garmin data behind them, neither section mentions Garmin', async () => {
	renderMe()

	await screen.findByRole('region', { name: 'Form' })
	expect(screen.queryByText(/garmin/i)).not.toBeInTheDocument()
})
