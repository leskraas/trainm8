/**
 * @vitest-environment jsdom
 *
 * The threshold form posted exactly as the browser posts it (#631): the route
 * renders, the athlete types one number, and every field the form carries —
 * the recipe picker's own hidden input included — goes to the real action.
 * `index.test.ts` hand-builds its bodies, so it cannot see what the page sends.
 */
import { render, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createRoutesStub, type AppLoadContext } from 'react-router'
import { expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import TrainingSettingsIndex, { action, loader } from './index.tsx'

// The same fire-and-forget recomputes `index.test.ts` mocks, for the same reason.
vi.mock('#app/utils/workout.server.ts', () => ({
	recomputeIntensityRanges: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('#app/utils/load/planned-tss.server.ts', () => ({
	recomputePlannedTssForUser: vi.fn().mockResolvedValue(undefined),
}))

window.HTMLElement.prototype.scrollIntoView = () => {}
window.ResizeObserver ??= class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

const ROUTE_PATH = '/settings/training'
const ARGS_BASE = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

async function setupUser() {
	const userData = createUser()
	return prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
				},
			},
		},
		select: { id: true, userId: true },
	})
}

function authedRequest(cookie: string, body?: URLSearchParams) {
	const headers = new Headers({ cookie })
	if (!body) return new Request(new URL(ROUTE_PATH, BASE_URL), { headers })
	headers.set('content-type', 'application/x-www-form-urlencoded')
	return new Request(new URL(ROUTE_PATH, BASE_URL), {
		method: 'POST',
		headers,
		body,
	})
}

test('saving only an FTP from the page leaves a defaulted recipe "Valgt for deg"', async () => {
	const session = await setupUser()
	const cookie = await getSessionCookieHeader(session)
	// The real loader, so the bike profile is the one the app stamps: a
	// default recipe the athlete never chose.
	const loaderData = await loader({
		request: authedRequest(cookie),
		...ARGS_BASE,
	})
	const before = loaderData.athleteProfile.disciplineProfiles.find(
		(p) => p.discipline === 'bike',
	)!
	expect(before.zoneSystemSource).toBe('default')

	let posted: Array<[string, string]> | null = null
	const Stub = createRoutesStub([
		{
			path: ROUTE_PATH,
			Component: (props: Record<string, unknown>) => (
				<TrainingSettingsIndex {...(props as any)} />
			),
			loader: () => loaderData,
			action: async ({ request }) => {
				posted = [...(await request.formData()).entries()].map(
					([key, value]) => [key, String(value)],
				)
				return { result: { status: 'success' } }
			},
			HydrateFallback: () => <div>Loading...</div>,
		},
	])
	render(<Stub initialEntries={[ROUTE_PATH]} />)

	const user = userEvent.setup()
	const form = await waitFor(() => {
		const found = document.getElementById('thresholds-bike')
		expect(found).not.toBeNull()
		return found as HTMLFormElement
	})
	const ftp = form.querySelector<HTMLInputElement>('input[name="ftp"]')!
	await user.type(ftp, '250')
	await user.click(form.querySelector('button[type="submit"]')!)
	await waitFor(() => expect(posted).not.toBeNull())

	// What the page sent: the recipe rides along although nobody touched it.
	const body = new URLSearchParams(posted!)
	expect(body.get('ftp')).toBe('250')
	expect(body.get('zoneSystem')).toBe(before.zoneSystem)

	await action({ request: authedRequest(cookie, body), ...ARGS_BASE })

	const after = await prisma.disciplineProfile.findFirstOrThrow({
		where: { athleteProfile: { userId: session.userId }, discipline: 'bike' },
	})
	expect(after.ftp).toBe(250)
	expect(after.zoneSystem).toBe(before.zoneSystem)
	expect(after.zoneSystemSource).toBe('default')
})
