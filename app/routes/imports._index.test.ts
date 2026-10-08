import { expect, test } from 'vitest'
import { loader } from './imports._index.tsx'

test('/imports, the retired inbox, redirects to Meg (ADR 0083)', () => {
	const response = loader()
	expect(response.status).toBe(302)
	expect(response.headers.get('location')).toBe('/me')
})
