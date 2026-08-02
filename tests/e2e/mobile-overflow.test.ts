import { faker } from '@faker-js/faker'
import { type Page } from '@playwright/test'
import * as setCookieParser from 'set-cookie-parser'
import { weekMonday } from '#app/utils/athlete-calendar.ts'
import { getAthleteTimezone } from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	createFitnessGoalEvent,
	createPlanOutline,
} from '#app/utils/plan-outline/authoring.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { expect, test } from '#tests/playwright-utils.ts'

// Mirrors `onboardingEmailSessionKey` in
// `app/routes/_auth/onboarding/index.tsx`. Inlined rather than imported: that
// route module transitively pulls the icon sprite (a Vite-plugin asset) which
// Playwright's transform can't load.
const onboardingEmailSessionKey = 'onboardingEmail'

/**
 * Mobile UI regression guard (map #277, decided in #296).
 *
 * The written standard's primary litmus test is: drive a screen at 390×844 and
 * see no horizontal overflow (docs/design/ui-conventions.md §5). This spec is
 * the automated form of that gate for the worst-offender screens the audit
 * flagged — onboarding (was +240px), settings/profile (breadcrumb overflow),
 * event detail (was +24px action row), and the imports inbox — so those layouts
 * can't silently drift back off the standard.
 *
 * The season plan joins them for a different reason: it is the widest thing the
 * app draws (story 102, ADR 0028). A layered SVG chart, a row of toggles and a
 * week-by-week derivation reading are three separate ways to push a page
 * sideways, and both of its readings are guarded here.
 *
 * The Dashboard's overflow is already guarded, richly, by
 * `mobile-dashboard.test.ts` (both tabs, data-rich), so it is not duplicated
 * here. A screenshot-comparison guard was considered and rejected as too
 * flaky/high-maintenance for this app; the overflow assertion is the durable,
 * low-noise check.
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 }

test.use({ viewport: MOBILE_VIEWPORT })

/** The standard's litmus test: no zone extends past the 390px viewport. */
async function expectNoHorizontalOverflow(page: Page) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
	)
	expect(
		overflow,
		'a screen extends past the 390px viewport (docs/design/ui-conventions.md §2.5/§5)',
	).toBeLessThanOrEqual(0)
}

test('settings/profile does not overflow at 390px', async ({
	page,
	navigate,
	login,
}) => {
	// First navigation pays the dev server's cold Vite transform cost.
	test.setTimeout(120_000)
	await login()
	await navigate('/settings/profile')
	await expect(
		page.getByRole('heading', { name: /edit profile/i }),
	).toBeVisible()
	await expectNoHorizontalOverflow(page)
})

test('event detail does not overflow at 390px', async ({ page, login }) => {
	test.setTimeout(120_000)
	const user = await login()
	const eventName = `Race ${faker.string.alphanumeric(8)}`
	const event = await prisma.event.create({
		data: {
			athleteId: user.id,
			name: eventName,
			kind: 'race',
			priority: 'A',
			startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			disciplines: JSON.stringify(['run']),
		},
	})
	// The +24px action row (Back · Edit · Cancel · Delete) was the worst offender
	// here; assert the detail screen (management actions and all) stays in bounds.
	await page.goto(`/training/events/${event.id}`)
	await expect(page.getByText(eventName).first()).toBeVisible()
	await expectNoHorizontalOverflow(page)
})

test('imports inbox does not overflow at 390px', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	// A pending import so the inbox renders its cards (the layout that carried
	// the tall gap + floating "Upload activity"), not just the empty state.
	await prisma.activityImport.create({
		data: {
			athleteId: user.id,
			externalProvider: 'intervalsicu',
			externalId: faker.string.uuid(),
			startedAt: new Date(Date.now() - 60 * 60 * 1000),
			endedAt: new Date(),
			durationSec: 3600,
			discipline: 'run',
			rawJson: '{}',
		},
	})
	await navigate('/imports')
	await expect(
		page.getByRole('heading', { name: /activity inbox/i }),
	).toBeVisible()
	await expectNoHorizontalOverflow(page)
})

test('the season plan does not overflow at 390px', async ({
	page,
	navigate,
	login,
}) => {
	test.setTimeout(120_000)
	const user = await login()
	// A real authored season, through the same service the authoring flow calls,
	// so the surface renders its chart and its 18 weeks of derived targets rather
	// than the "no plan yet" empty state. A preset because that is the plan an
	// athlete actually gets: phases, ramps and quality mixes all present, which is
	// what fills the chart's layers and the week rows underneath it.
	const goal = await createFitnessGoalEvent(user.id, {
		name: `Race ${faker.string.alphanumeric(8)}`,
		startDate: new Date(Date.now() + 140 * 24 * 60 * 60 * 1000),
		disciplines: ['run'],
	})
	const timezone = await getAthleteTimezone(user.id)
	const created = await createPlanOutline(user.id, {
		eventId: goal.id,
		// The Plan Start Week is a Monday in the Athlete Timezone (ADR 0044 §3).
		startWeekKey: weekMonday(new Date(), timezone),
		structure: { presetKey: 'classic-linear' },
		tracks: [{ discipline: 'run', currency: 'km', anchorValue: 55 }],
	})
	expect(created.ok, 'the plan fixture failed to author').toBe(true)

	// Blocks is the default reading: the chart, the toggles above it and the phase
	// cards under it.
	await navigate('/training/plan')
	await expect(page.getByRole('heading', { name: 'Your season' })).toBeVisible()
	await expectNoHorizontalOverflow(page)

	// Weeks is the other half of the same route and a different layout — the
	// dense per-week reading the surface exists to be audited through — so it
	// gets the gate too rather than riding on the Blocks pass.
	await page.goto('/training/plan?tab=weeks')
	await expect(
		page.getByRole('heading', { name: 'Week by week' }),
	).toBeVisible()
	await expectNoHorizontalOverflow(page)
})

test('onboarding does not overflow at 390px', async ({ page, navigate }) => {
	test.setTimeout(120_000)
	// Onboarding is gated by a verify-session cookie carrying the email being
	// onboarded; set it directly (same technique the `login` fixture uses for the
	// auth cookie) rather than driving the whole signup→verify flow. This screen
	// was the worst offender pre-standard: a 240px overflow from the email in an
	// h1 plus a desktop-width form.
	const verifySession = await verifySessionStorage.getSession()
	verifySession.set(onboardingEmailSessionKey, faker.internet.email())
	const cookieConfig = setCookieParser.parseString(
		await verifySessionStorage.commitSession(verifySession),
	)
	await page.context().addCookies([
		{
			...cookieConfig,
			domain: 'localhost',
			expires: cookieConfig.expires?.getTime(),
			sameSite: cookieConfig.sameSite as 'Strict' | 'Lax' | 'None',
		},
	])
	await navigate('/onboarding')
	await expect(
		page.getByRole('button', { name: /create an account/i }),
	).toBeVisible()
	await expectNoHorizontalOverflow(page)
})
