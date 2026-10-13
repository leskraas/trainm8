import { randomBytes } from 'node:crypto'
import { describe, expect, test } from 'vitest'
import {
	DEV_CREDENTIALS_ENCRYPTION_KEY,
	decryptCredential,
	encryptCredential,
	isEncryptedCredential,
	parseCredentialKeys,
} from './credential-crypto.server.ts'

const keyA = randomBytes(32).toString('base64')
const keyB = randomBytes(32).toString('base64')

describe('encryptCredential / decryptCredential', () => {
	test('round-trips a provider token without storing it readably', () => {
		const keys = parseCredentialKeys(keyA)
		const stored = encryptCredential('intervals-api-key-123', 'ctx', keys)

		expect(stored).not.toContain('intervals-api-key-123')
		expect(isEncryptedCredential(stored)).toBe(true)
		expect(decryptCredential(stored, 'ctx', keys)).toBe('intervals-api-key-123')
	})

	test('encrypting the same token twice gives different ciphertexts', () => {
		const keys = parseCredentialKeys(keyA)
		expect(encryptCredential('t', 'ctx', keys)).not.toBe(
			encryptCredential('t', 'ctx', keys),
		)
	})

	test('a tampered ciphertext is refused rather than decrypted to garbage', () => {
		const keys = parseCredentialKeys(keyA)
		const stored = encryptCredential('secret', 'ctx', keys)
		const tampered = stored.slice(0, -2) + (stored.endsWith('A') ? 'BA' : 'AA')
		expect(() => decryptCredential(tampered, 'ctx', keys)).toThrow()
	})

	test('a ciphertext moved to another column is refused', () => {
		const keys = parseCredentialKeys(keyA)
		const stored = encryptCredential(
			'secret',
			'AccountConnection.refreshToken',
			keys,
		)
		expect(() =>
			decryptCredential(stored, 'AccountConnection.accessToken', keys),
		).toThrow()
	})

	test('the wrong key cannot read it', () => {
		const stored = encryptCredential('secret', 'ctx', parseCredentialKeys(keyA))
		expect(() =>
			decryptCredential(stored, 'ctx', parseCredentialKeys(keyB)),
		).toThrow()
	})

	test('rotation: a new first key encrypts, an old trailing key still decrypts', () => {
		const old = encryptCredential('secret', 'ctx', parseCredentialKeys(keyA))
		const rotated = parseCredentialKeys(`${keyB},${keyA}`)

		expect(decryptCredential(old, 'ctx', rotated)).toBe('secret')
		const fresh = encryptCredential('secret', 'ctx', rotated)
		expect(decryptCredential(fresh, 'ctx', parseCredentialKeys(keyB))).toBe(
			'secret',
		)
	})

	test('a legacy plaintext value reads through unchanged until the backfill encrypts it', () => {
		const keys = parseCredentialKeys(keyA)
		expect(isEncryptedCredential('plain-legacy-token')).toBe(false)
		expect(decryptCredential('plain-legacy-token', 'ctx', keys)).toBe(
			'plain-legacy-token',
		)
	})
})

describe('parseCredentialKeys', () => {
	test('refuses a key that is not 32 bytes of base64', () => {
		expect(() => parseCredentialKeys('too-short')).toThrow(/32 bytes/)
		expect(() => parseCredentialKeys('a,too-short')).toThrow(/entry 1/)
	})

	test('production refuses a missing key', () => {
		expect(() => parseCredentialKeys(undefined, 'production')).toThrow(
			/CREDENTIALS_ENCRYPTION_KEY/,
		)
	})

	test('production refuses the published development key', () => {
		expect(() =>
			parseCredentialKeys(DEV_CREDENTIALS_ENCRYPTION_KEY, 'production'),
		).toThrow(/development key/)
	})

	test('development and test fall back to the published development key', () => {
		const dev = parseCredentialKeys(undefined, 'development')
		expect(parseCredentialKeys('', 'test')).toEqual(dev)
		const stored = encryptCredential('secret', 'ctx', dev)
		expect(
			decryptCredential(
				stored,
				'ctx',
				parseCredentialKeys(DEV_CREDENTIALS_ENCRYPTION_KEY),
			),
		).toBe('secret')
	})
})
