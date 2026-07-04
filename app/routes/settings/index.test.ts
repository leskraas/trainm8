import { expect, test } from 'vitest'
import { loader } from './index.tsx'

test('/settings redirects to the profile settings page', () => {
	const response = loader()
	expect(response.status).toBe(302)
	expect(response.headers.get('location')).toBe('/settings/profile')
})
