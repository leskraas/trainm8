import { Prisma } from '@prisma/client/index.js'
import {
	decryptCredential,
	encryptCredential,
} from './credential-crypto.server.ts'

/**
 * The columns that hold a provider credential, per model. Every write through
 * the Prisma client encrypts them and every read decrypts them, so the rest of
 * the app keeps handling plaintext tokens and cannot forget to encrypt one.
 *
 * Limits, by design and checked at the time of writing (#548):
 *  - Only top-level operations on the model are intercepted. A nested write
 *    (`user.update({ data: { accountConnections: { create } } })`) or a read
 *    through another model's `include` would bypass this; no code path does
 *    either, and a nested read only ever yields ciphertext, never plaintext.
 *  - Raw SQL sees the stored ciphertext.
 *  - A `where` on a credential column cannot match (the IV is random).
 */
export const ENCRYPTED_CREDENTIAL_FIELDS = {
	AccountConnection: ['accessToken', 'refreshToken'],
} as const

type EncryptedModel = keyof typeof ENCRYPTED_CREDENTIAL_FIELDS

const WRITE_KEYS = ['data', 'create', 'update'] as const

function context(model: EncryptedModel, field: string) {
	return `${model}.${field}`
}

function encryptValue(
	model: EncryptedModel,
	field: string,
	value: unknown,
): unknown {
	// Always encrypt, even a value that already looks encrypted: an athlete
	// types the Intervals.icu key, so the input is never trusted to be stored
	// as-is.
	if (typeof value === 'string') {
		return encryptCredential(value, context(model, field))
	}
	// `{ set: 'token' }` is Prisma's explicit form of a scalar update.
	if (
		value &&
		typeof value === 'object' &&
		'set' in value &&
		typeof value.set === 'string'
	) {
		return { ...value, set: encryptValue(model, field, value.set) }
	}
	return value
}

function encryptData(model: EncryptedModel, data: unknown): unknown {
	if (Array.isArray(data)) return data.map((row) => encryptData(model, row))
	if (!data || typeof data !== 'object') return data
	const row = { ...(data as Record<string, unknown>) }
	for (const field of ENCRYPTED_CREDENTIAL_FIELDS[model]) {
		if (field in row) row[field] = encryptValue(model, field, row[field])
	}
	return row
}

function decryptResult(model: EncryptedModel, result: unknown): unknown {
	if (Array.isArray(result)) return result.map((r) => decryptResult(model, r))
	if (!result || typeof result !== 'object') return result
	const row = result as Record<string, unknown>
	for (const field of ENCRYPTED_CREDENTIAL_FIELDS[model]) {
		const value = row[field]
		if (typeof value === 'string') {
			row[field] = decryptCredential(value, context(model, field))
		}
	}
	return row
}

/**
 * The Prisma client extension that applies {@link ENCRYPTED_CREDENTIAL_FIELDS}.
 * Applied once in `db.server.ts`; transactions inherit it.
 */
export const credentialEncryption = Prisma.defineExtension({
	name: 'credential-encryption',
	query: {
		accountConnection: {
			async $allOperations({ args, query }) {
				const model: EncryptedModel = 'AccountConnection'
				const nextArgs = { ...(args as Record<string, unknown>) }
				for (const key of WRITE_KEYS) {
					if (key in nextArgs) nextArgs[key] = encryptData(model, nextArgs[key])
				}
				const result = await query(nextArgs as typeof args)
				return decryptResult(model, result) as typeof result
			},
		},
	},
})
