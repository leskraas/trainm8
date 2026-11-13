import { type Prisma } from '@prisma/client'

/**
 * Deletes every `AuthVerification` row that names a user, inside account
 * erasure's transaction (ADR 0114 §6, ADR 0105). The table has no foreign key
 * to `User`, so the cascade that clears the other auth tables misses it. A row
 * names its user in one of three ways in Better Auth 1.7.12:
 *
 * - **`value` is the user id, or JSON holding it**: a password reset
 *   (`reset-password:<token>`), the two-factor cookie's row (`2fa-<key>`), a
 *   trusted device, a passkey challenge, an OAuth state.
 * - **`identifier` holds the email**: an email code is
 *   `<type>-otp-<email>`, and a change of email is
 *   `change-email-otp-<email>-<new email>`. Their `value` is only the hashed
 *   code.
 * - **Keyed off a two-factor row**: `2fa-otp-<key>` and `2fa-attempts-<key>`,
 *   where `<key>` is the identifier of a row whose `value` is the user id.
 *
 * `erase.server.test.ts` drives each flow through `auth.api`, so an upgrade
 * that changes a format fails there rather than leaving rows behind.
 */
export async function eraseAuthVerifications(
	tx: Prisma.TransactionClient,
	{ userId, email }: { userId: string; email: string },
) {
	const normalisedEmail = email.toLowerCase()
	const quotedId = JSON.stringify(userId)
	const emailCode = `-otp-${normalisedEmail}`
	const changeOfEmail = `change-email-otp-${normalisedEmail}-`
	// SQL `LIKE` (Prisma's `contains`, `startsWith`, `endsWith` on SQLite) reads
	// `_` and `%` in an email as wildcards and ignores case, so it only narrows
	// the candidates; the exact rule below decides.
	const candidates = await tx.authVerification.findMany({
		where: {
			OR: [
				{ value: userId },
				{ value: { contains: quotedId } },
				{ identifier: { endsWith: emailCode } },
				{ identifier: { startsWith: changeOfEmail } },
				{ identifier: { startsWith: '2fa-' } },
			],
		},
		select: { id: true, identifier: true, value: true },
	})
	const namesUser = ({
		identifier,
		value,
	}: {
		identifier: string
		value: string
	}) =>
		value === userId ||
		value.includes(quotedId) ||
		identifier.endsWith(emailCode) ||
		identifier.startsWith(changeOfEmail)
	const named = candidates.filter(namesUser)
	const keyedOffTwoFactor = new Set(
		named.flatMap(({ identifier }) => [
			`2fa-otp-${identifier}`,
			`2fa-attempts-${identifier}`,
		]),
	)
	const ids = candidates
		.filter((row) => namesUser(row) || keyedOffTwoFactor.has(row.identifier))
		.map((row) => row.id)
	const { count } = await tx.authVerification.deleteMany({
		where: { id: { in: ids } },
	})
	return count
}
