import { type AppLoadContext } from 'react-router'
import { expect, test } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { loader } from './download-user-data.tsx'

function download(headers: HeadersInit = {}) {
	return loader({
		request: new Request(
			new URL('/resources/download-user-data', BASE_URL).toString(),
			{ headers },
		),
		params: {},
		context: {} as AppLoadContext,
		unstable_pattern: '/resources/download-user-data',
	})
}

test('the download is the whole export, never cached', async () => {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
					athleteProfile: { create: { timezone: 'UTC' } },
				},
			},
		},
		select: { id: true, userId: true },
	})

	const response = await download({
		cookie: await getSessionCookieHeader(session),
	})

	expect(response.headers.get('Cache-Control')).toBe('no-store')
	const body = await response.json()
	expect(body.tables.User[0].id).toBe(session.userId)
	expect(body.tables.AthleteProfile).toHaveLength(1)
})

test('an anonymous request is sent to login', async () => {
	await expect(download()).rejects.toMatchObject({ status: 302 })
})
