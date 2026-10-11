import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { redirect, Link, useFetcher } from 'react-router'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { MEG_TWO_FACTOR_LABELS } from '#app/utils/labels.ts'
import { generateTOTP } from '#app/utils/totp.server.ts'
import { type Route } from './+types/index.ts'
import { twoFAVerificationType } from './_layout.tsx'
import { twoFAVerifyVerificationType } from './verify.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: { target_type: { type: twoFAVerificationType, target: userId } },
		select: { id: true },
	})
	return { is2FAEnabled: Boolean(verification) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const { otp: _otp, ...config } = await generateTOTP()
	const verificationData = {
		...config,
		type: twoFAVerifyVerificationType,
		target: userId,
	}
	await prisma.verification.upsert({
		where: {
			target_type: { target: userId, type: twoFAVerifyVerificationType },
		},
		create: verificationData,
		update: verificationData,
	})
	return redirect('/settings/profile/two-factor/verify')
}

export default function TwoFactorRoute({ loaderData }: Route.ComponentProps) {
	const enable2FAFetcher = useFetcher<typeof action>()
	const L = MEG_TWO_FACTOR_LABELS
	const on = loaderData.is2FAEnabled

	return (
		<Card size="sm" className="mx-auto max-w-md">
			<CardContent className="flex flex-col gap-4">
				<p className="text-callout flex items-center gap-2 font-semibold">
					<Icon
						name={on ? 'circle-check' : 'lock-open-1'}
						size="md"
						className={on ? 'text-primary' : 'text-muted-foreground'}
						aria-hidden="true"
					/>
					{on ? L.on : L.off}
				</p>
				<p className="text-footnote text-muted-foreground">{L.explain}</p>
				{on ? (
					<Link
						to="disable"
						className={buttonVariants({
							variant: 'outline',
							className: 'w-full sm:w-auto sm:self-start',
						})}
					>
						<Icon name="lock-open-1" data-icon="inline-start" />
						{L.disable}
					</Link>
				) : (
					<enable2FAFetcher.Form method="POST">
						<StatusButton
							type="submit"
							name="intent"
							value="enable"
							status={enable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
							className="w-full sm:w-auto"
						>
							{L.enable}
						</StatusButton>
					</enable2FAFetcher.Form>
				)}
			</CardContent>
		</Card>
	)
}
