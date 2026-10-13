import { Prisma } from '@prisma/client/index.js'
import {
	CredentialDecryptionError,
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
 *
 * A row no configured key can read (a key dropped from the rotation, a
 * tampered value) never fails the whole read: that row comes back with no
 * credentials (`accessToken: ''`, `refreshToken: null`) and `status: 'error'`,
 * which the hub shows as "reconnect", and the stored status is set to `error`
 * so the sync sweeps stop picking it. Only the row's id is logged.
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

/** What an undecryptable credential reads as, per column. */
const UNREADABLE_VALUE: Record<string, string | null> = {
	accessToken: '',
	refreshToken: null,
}

function decryptResult(
	model: EncryptedModel,
	result: unknown,
	unreadable: Set<string>,
): unknown {
	if (Array.isArray(result)) {
		return result.map((r) => decryptResult(model, r, unreadable))
	}
	if (!result || typeof result !== 'object') return result
	const row = result as Record<string, unknown>
	const fields = ENCRYPTED_CREDENTIAL_FIELDS[model]
	try {
		const decrypted = fields.map((field) => {
			const value = row[field]
			return typeof value === 'string'
				? decryptCredential(value, context(model, field))
				: value
		})
		fields.forEach((field, i) => {
			if (field in row) row[field] = decrypted[i]
		})
	} catch (err) {
		if (!(err instanceof CredentialDecryptionError)) throw err
		for (const field of fields) {
			if (field in row) row[field] = UNREADABLE_VALUE[field] ?? null
		}
		row.status = 'error'
		if (typeof row.id === 'string') unreadable.add(row.id)
		console.error(
			`${model} ${typeof row.id === 'string' ? row.id : '(id not selected)'}: stored credentials could not be decrypted; marked for reconnect`,
		)
	}
	return row
}

/**
 * The Prisma client extension that applies {@link ENCRYPTED_CREDENTIAL_FIELDS}.
 * Applied once in `db.server.ts`; transactions inherit it.
 */
export const credentialEncryption = Prisma.defineExtension((client) =>
	client.$extends({
		name: 'credential-encryption',
		query: {
			accountConnection: {
				async $allOperations({ args, query }) {
					const model: EncryptedModel = 'AccountConnection'
					const nextArgs = { ...(args as Record<string, unknown>) }
					for (const key of WRITE_KEYS) {
						if (key in nextArgs) {
							nextArgs[key] = encryptData(model, nextArgs[key])
						}
					}
					const result = await query(nextArgs as typeof args)
					const unreadable = new Set<string>()
					const decrypted = decryptResult(model, result, unreadable)
					if (unreadable.size > 0) {
						// Not awaited: the read may run inside a transaction that holds
						// the only connection; the mark lands once it is free. The base
						// client is used, so the write does not come back through here.
						void client.accountConnection
							.updateMany({
								where: { id: { in: [...unreadable] } },
								data: { status: 'error' },
							})
							.catch(() => {})
					}
					return decrypted as typeof result
				},
			},
		},
	}),
)
