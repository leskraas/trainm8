import { expect, test } from 'vitest'
import { VerifySchema } from './verify.tsx'

test('an emailed code typed in lowercase reads as the uppercase code it is', () => {
	const parsed = VerifySchema.parse({
		code: 'k7mq2p',
		type: 'onboarding',
		target: 'athlete@example.com',
	})
	expect(parsed.code).toBe('K7MQ2P')
})
