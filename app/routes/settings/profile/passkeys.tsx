import { startRegistration } from '@simplewebauthn/browser'
import { useState } from 'react'
import { useRevalidator } from 'react-router'
import { z } from 'zod'
import { PasskeyItem } from '#app/components/passkey-item.tsx'
import { Alert, AlertDescription } from '#app/components/ui/alert.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { type Route } from './+types/passkeys.ts'

export const handle = {
	breadcrumb: <Icon name="passkey">Passkeys</Icon>,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const passkeys = await prisma.passkey.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			deviceType: true,
			createdAt: true,
		},
	})
	return { passkeys }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'delete') {
		const passkeyId = formData.get('passkeyId')
		if (typeof passkeyId !== 'string') {
			return Response.json(
				{ status: 'error', error: 'Invalid passkey ID' },
				{ status: 400 },
			)
		}

		await prisma.passkey.delete({
			where: {
				id: passkeyId,
				userId, // Ensure the passkey belongs to the user
			},
		})
		return Response.json({ status: 'success' })
	}

	return Response.json(
		{ status: 'error', error: 'Invalid intent' },
		{ status: 400 },
	)
}

const RegistrationOptionsSchema = z.object({
	options: z.object({
		rp: z.object({
			id: z.string(),
			name: z.string(),
		}),
		user: z.object({
			id: z.string(),
			name: z.string(),
			displayName: z.string(),
		}),
		challenge: z.string(),
		pubKeyCredParams: z.array(
			z.object({
				type: z.literal('public-key'),
				alg: z.number(),
			}),
		),
		authenticatorSelection: z
			.object({
				authenticatorAttachment: z
					.enum(['platform', 'cross-platform'])
					.optional(),
				residentKey: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				userVerification: z
					.enum(['required', 'preferred', 'discouraged'])
					.optional(),
				requireResidentKey: z.boolean().optional(),
			})
			.optional(),
	}),
}) satisfies z.ZodType<{ options: PublicKeyCredentialCreationOptionsJSON }>

export default function Passkeys({ loaderData }: Route.ComponentProps) {
	const revalidator = useRevalidator()
	const [error, setError] = useState<string | null>(null)

	async function handlePasskeyRegistration() {
		try {
			setError(null)
			const resp = await fetch('/webauthn/registration')
			const jsonResult = await resp.json()
			const parsedResult = RegistrationOptionsSchema.parse(jsonResult)

			const regResult = await startRegistration({
				optionsJSON: parsedResult.options,
			})

			const verificationResp = await fetch('/webauthn/registration', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(regResult),
			})

			if (!verificationResp.ok) {
				throw new Error('Failed to verify registration')
			}

			void revalidator.revalidate()
		} catch (err) {
			console.error('Failed to create passkey:', err)
			setError('Failed to create passkey. Please try again.')
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex justify-between gap-4">
				<h1 className="text-h1">Passkeys</h1>
				<form action={handlePasskeyRegistration}>
					<Button type="submit" variant="secondary">
						<Icon name="plus" data-icon="inline-start" />
						Register new passkey
					</Button>
				</form>
			</div>

			{error ? (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{loaderData.passkeys.length ? (
				<ul className="flex flex-col gap-4" title="passkeys">
					{loaderData.passkeys.map((passkey) => (
						<PasskeyItem key={passkey.id} passkey={passkey} />
					))}
				</ul>
			) : (
				<Card>
					<CardContent className="text-muted-foreground text-center">
						No passkeys registered yet
					</CardContent>
				</Card>
			)}
		</div>
	)
}
