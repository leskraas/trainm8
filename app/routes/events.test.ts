import { expect, test } from 'vitest'
import { loader } from './events.tsx'

test('/events redirects to the real Events surface', () => {
	const response = loader()
	expect(response.status).toBe(302)
	expect(response.headers.get('location')).toBe('/training/events')
})
