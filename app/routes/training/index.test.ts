import { expect, test } from 'vitest'
import { loader } from './index.tsx'

test('the bare /training prefix redirects to the training hub on Home rather than 404ing', () => {
	const response = loader()
	expect(response.status).toBe(302)
	expect(response.headers.get('location')).toBe('/')
})
