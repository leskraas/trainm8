import { expect, test } from 'vitest'
import { loader } from './index.tsx'

test('/settings redirects to Meg, where settings live (ADR 0083)', () => {
	const response = loader()
	expect(response.status).toBe(302)
	expect(response.headers.get('location')).toBe('/me')
})
