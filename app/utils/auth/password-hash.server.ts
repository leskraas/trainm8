import bcrypt from 'bcryptjs'

/**
 * The one password hash for both logins (ADR 0094 §2). Epic's `Password.hash`
 * and Better Auth's credential `AuthAccount.password` are both bcrypt at cost
 * 10, so a hash copied from one verifies unchanged in the other, and a rollback
 * can copy a new hash back.
 */
export const PASSWORD_HASH_COST = 10

export async function hashPassword(password: string) {
	return bcrypt.hash(password, PASSWORD_HASH_COST)
}

export async function verifyPassword({
	hash,
	password,
}: {
	hash: string
	password: string
}) {
	return bcrypt.compare(password, hash)
}
