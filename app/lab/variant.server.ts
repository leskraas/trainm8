import { createCookie } from 'react-router'
import {
	DEFAULT_VARIANT,
	isLabVariantKey,
	type LabVariantKey,
} from './variants.ts'

/**
 * The app the owner chose in the App Lab (ADR 0125). A plain preference
 * cookie, not a secret: it only decides which app `/` opens.
 */
const variantCookie = createCookie('trainm8_app', {
	path: '/',
	sameSite: 'lax',
	httpOnly: true,
	secure: process.env.NODE_ENV === 'production',
	maxAge: 60 * 60 * 24 * 365,
})

export async function getChosenVariant(
	request: Request,
): Promise<LabVariantKey> {
	const value: unknown = await variantCookie.parse(
		request.headers.get('cookie'),
	)
	return isLabVariantKey(value) ? value : DEFAULT_VARIANT
}

export async function serializeChosenVariant(key: LabVariantKey) {
	return variantCookie.serialize(key)
}
