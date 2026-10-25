import { createHmac } from 'node:crypto'
import { expect, test } from 'vitest'
import { parsePolarWebhook } from './webhook.server.ts'

const SECRET = 'polar-signature-secret'
const sign = (body: string, secret = SECRET) =>
	createHmac('sha256', secret).update(body).digest('hex')

const exercise = JSON.stringify({
	event: 'EXERCISE',
	user_id: 475,
	entity_id: 'aQlC83',
	timestamp: '2018-05-15T14:22:24Z',
	url: 'https://www.polaraccesslink.com/v3/exercises/aQlC83',
})

test('a signed EXERCISE event names the Polar user and the exercise', () => {
	expect(parsePolarWebhook(exercise, sign(exercise), SECRET)).toEqual({
		kind: 'exercise',
		polarUserId: '475',
		exerciseId: 'aQlC83',
	})
})

test('a missing, wrong or truncated signature is refused before the body is read', () => {
	expect(parsePolarWebhook(exercise, null, SECRET).kind).toBe('bad-signature')
	expect(
		parsePolarWebhook(exercise, sign(exercise, 'other'), SECRET).kind,
	).toBe('bad-signature')
	expect(
		parsePolarWebhook(exercise, sign(exercise).slice(0, 32), SECRET).kind,
	).toBe('bad-signature')
	const tampered = exercise.replace('aQlC83', 'zzzzzz')
	expect(parsePolarWebhook(tampered, sign(exercise), SECRET).kind).toBe(
		'bad-signature',
	)
	expect(parsePolarWebhook(exercise, sign(exercise), '').kind).toBe(
		'bad-signature',
	)
})

test('a signed PING is answered, and other signed events are ignored', () => {
	const ping = JSON.stringify({
		event: 'PING',
		timestamp: '2018-05-15T14:22:24Z',
	})
	expect(parsePolarWebhook(ping, sign(ping), SECRET)).toEqual({ kind: 'ping' })
	const sleep = JSON.stringify({ event: 'SLEEP', user_id: 475, entity_id: 'x' })
	expect(parsePolarWebhook(sleep, sign(sleep), SECRET)).toEqual({
		kind: 'ignored',
	})
	expect(parsePolarWebhook('not json', sign('not json'), SECRET)).toEqual({
		kind: 'ignored',
	})
})
