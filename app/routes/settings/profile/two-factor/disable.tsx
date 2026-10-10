import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useFetcher } from 'react-router'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireRecentVerification } from '#app/routes/_auth/verify.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	MEG_COMMON_LABELS,
	MEG_PAGE_TITLES,
	MEG_TWO_FACTOR_LABELS,
} from '#app/utils/labels.ts'
import { useDoubleCheck } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/disable.ts'
import { twoFAVerificationType } from './_layout.tsx'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.twoFactorDisable,
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	await requireRecentVerification(request)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	await requireRecentVerification(request)
	const userId = await requireUserId(request)
	await prisma.verification.delete({
		where: { target_type: { target: userId, type: twoFAVerificationType } },
	})
	return redirectWithToast('/settings/profile/two-factor', {
		title: MEG_TWO_FACTOR_LABELS.disabledTitle,
		description: MEG_TWO_FACTOR_LABELS.disabledBody,
	})
}

export default function TwoFactorDisableRoute() {
	const disable2FAFetcher = useFetcher<typeof action>()
	const dc = useDoubleCheck()

	return (
		<Card size="sm" className="mx-auto max-w-md">
			<CardContent>
				<disable2FAFetcher.Form method="POST" className="flex flex-col gap-4">
					<p className="text-body">{MEG_TWO_FACTOR_LABELS.disableWarning}</p>
					<StatusButton
						variant="destructive"
						status={disable2FAFetcher.state === 'loading' ? 'pending' : 'idle'}
						{...dc.getButtonProps({
							className: 'w-full sm:w-auto sm:self-start',
							name: 'intent',
							value: 'disable',
							type: 'submit',
						})}
					>
						{dc.doubleCheck
							? MEG_COMMON_LABELS.areYouSure
							: MEG_TWO_FACTOR_LABELS.disable}
					</StatusButton>
				</disable2FAFetcher.Form>
			</CardContent>
		</Card>
	)
}
