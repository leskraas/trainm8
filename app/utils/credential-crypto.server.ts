import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Application-level encryption for stored provider credentials (GDPR Art. 32;
 * `docs/research/ai-product-privacy-cost.md` §3.9 row 14). Today that is
 * `AccountConnection.accessToken` / `refreshToken` — an OAuth token or an
 * Intervals.icu API key. Any new stored secret (Better Auth's OAuth tables,
 * Polar tokens) goes through this module too, with the same key.
 *
 * **The key.** `CREDENTIALS_ENCRYPTION_KEY`: one or more base64-encoded
 * 32-byte keys, comma-separated. The first key encrypts; every key is tried on
 * decrypt, so a rotation is "prepend the new key, redeploy". Generate one with
 * `openssl rand -base64 32`; see `docs/secrets.md` for the Fly secret.
 *
 * **The format.** `enc:v1:<iv>.<tag>.<ciphertext>`, each part base64url:
 * AES-256-GCM with a random 96-bit IV per value, and the column name as
 * additional authenticated data, so a ciphertext copied into another column
 * fails to decrypt. A tampered value or the wrong key throws; it never decrypts
 * to garbage that would be sent to a provider.
 *
 * **Legacy rows.** A value without the `enc:v1:` prefix is a pre-encryption row
 * and reads through unchanged until the one-shot backfill
 * (`credential-backfill.server.ts`) encrypts it.
 */

const PREFIX = 'enc:v1:'
const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12

/**
 * The published, non-secret key that development and test fall back to, the
 * way `.env.example` ships `SESSION_SECRET="super-duper-s3cret"`. Production
 * refuses it.
 */
export const DEV_CREDENTIALS_ENCRYPTION_KEY =
	'NcampeOitQuKuYH7y0V8F4bLVzoJHCw3NT999aMG3H8='

export type CredentialKeys = readonly Buffer[]

/**
 * Parse `CREDENTIALS_ENCRYPTION_KEY`. Production fails closed: a missing key or
 * the published development key throws, so the release refuses to boot instead
 * of storing a credential readably.
 */
export function parseCredentialKeys(
	raw: string | undefined,
	mode: string | undefined = process.env.NODE_ENV,
): CredentialKeys {
	if (raw == null || raw.trim() === '') {
		if (mode === 'production') {
			throw new Error(
				'CREDENTIALS_ENCRYPTION_KEY must be set in production (generate one with `openssl rand -base64 32`)',
			)
		}
		raw = DEV_CREDENTIALS_ENCRYPTION_KEY
	}
	const parts = raw.split(',').map((part) => part.trim())
	if (mode === 'production' && parts.includes(DEV_CREDENTIALS_ENCRYPTION_KEY)) {
		throw new Error(
			'CREDENTIALS_ENCRYPTION_KEY is the published development key; set a real key in production',
		)
	}
	return parts.map((part, index) => {
		const key = Buffer.from(part, 'base64')
		if (key.length !== KEY_BYTES) {
			throw new Error(
				`CREDENTIALS_ENCRYPTION_KEY entry ${index + 1} must be 32 bytes of base64 (\`openssl rand -base64 32\`)`,
			)
		}
		return key
	})
}

let cachedKeys: { raw: string | undefined; keys: CredentialKeys } | undefined

/** The keys from the environment, parsed once per distinct value. */
export function getCredentialKeys(): CredentialKeys {
	const raw = process.env.CREDENTIALS_ENCRYPTION_KEY
	if (!cachedKeys || cachedKeys.raw !== raw) {
		cachedKeys = { raw, keys: parseCredentialKeys(raw) }
	}
	return cachedKeys.keys
}

/** Whether a stored value is already in the encrypted format. */
export function isEncryptedCredential(stored: string): boolean {
	return stored.startsWith(PREFIX)
}

/**
 * Encrypt a credential for storage. `context` names the column (for example
 * `AccountConnection.accessToken`) and is bound into the authentication tag.
 */
export function encryptCredential(
	plaintext: string,
	context: string,
	keys: CredentialKeys = getCredentialKeys(),
): string {
	const key = keys[0]
	if (!key) throw new Error('No credential encryption key configured')
	const iv = randomBytes(IV_BYTES)
	const cipher = createCipheriv(ALGORITHM, key, iv)
	cipher.setAAD(Buffer.from(context, 'utf8'))
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, 'utf8'),
		cipher.final(),
	])
	const tag = cipher.getAuthTag()
	return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

/**
 * Decrypt a stored credential. A value without the encrypted prefix is a
 * legacy plaintext row and is returned as-is. Throws when no configured key
 * authenticates the value.
 */
export function decryptCredential(
	stored: string,
	context: string,
	keys: CredentialKeys = getCredentialKeys(),
): string {
	if (!isEncryptedCredential(stored)) return stored
	const [ivPart, tagPart, dataPart, ...rest] = stored
		.slice(PREFIX.length)
		.split('.')
	if (ivPart == null || tagPart == null || dataPart == null || rest.length) {
		throw new CredentialDecryptionError(context)
	}
	const iv = Buffer.from(ivPart, 'base64url')
	const tag = Buffer.from(tagPart, 'base64url')
	const data = Buffer.from(dataPart, 'base64url')
	for (const key of keys) {
		try {
			const decipher = createDecipheriv(ALGORITHM, key, iv)
			decipher.setAAD(Buffer.from(context, 'utf8'))
			decipher.setAuthTag(tag)
			return Buffer.concat([decipher.update(data), decipher.final()]).toString(
				'utf8',
			)
		} catch {
			// try the next key (rotation)
		}
	}
	throw new CredentialDecryptionError(context)
}

/** No configured key could authenticate a stored credential. */
export class CredentialDecryptionError extends Error {
	constructor(context: string) {
		super(
			`Could not decrypt ${context}: the value is tampered or CREDENTIALS_ENCRYPTION_KEY does not hold the key it was encrypted with`,
		)
		this.name = 'CredentialDecryptionError'
	}
}
