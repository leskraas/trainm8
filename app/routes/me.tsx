/**
 * Meg: the account tab (spec #505 story 59, ADR 0083). The profile, the
 * training settings, the integrations and the file upload were each reached
 * from a different corner — the avatar, a row on the profile page, a link on
 * the integrations page — and now sit under one tab. Their pages keep their
 * URLs; this is the page that names them.
 *
 * Imports have no page of their own (spec #505, Navigation): an intervals.icu
 * import lands on its day by itself, so what is left to offer is the
 * connection and the upload of a file from a watch.
 */
import { Img } from 'openimg/react'
import { Form, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import {
	connectionHubStatus,
	getAccountConnection,
} from '#app/utils/account-connection.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	APP_TAB_LABELS,
	CONNECTION_HUB_STATUS_LABELS,
	ME_LABELS,
	providerLabel,
} from '#app/utils/labels.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { type Route } from './+types/me.ts'

export const meta: Route.MetaFunction = () => [
	{ title: `${APP_TAB_LABELS.me} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [user, connection] = await Promise.all([
		prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: {
				name: true,
				username: true,
				image: { select: { objectKey: true } },
			},
		}),
		getAccountConnection(userId, INTERVALSICU_PROVIDER),
	])
	// The same reading the integrations page makes (`connectionHubStatus`).
	const intervalsicu = connectionHubStatus(connection)
	return { user, intervalsicu }
}

function MeLink({
	to,
	icon,
	title,
	detail,
}: {
	to: string
	icon: IconName
	title: string
	detail?: string
}) {
	return (
		<li>
			<Link
				to={to}
				prefetch="intent"
				className="flex min-h-11 items-center gap-3 py-2.5 hover:underline"
			>
				<Icon
					name={icon}
					size="md"
					className="text-muted-foreground"
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1">
					<span className="block">{title}</span>
					{detail ? (
						<span className="text-muted-foreground block text-sm">
							{detail}
						</span>
					) : null}
				</span>
				<Icon
					name="chevron-right"
					size="sm"
					className="text-muted-foreground"
					aria-hidden="true"
				/>
			</Link>
		</li>
	)
}

function MeSection({
	id,
	title,
	children,
}: {
	id: string
	title: string
	children: React.ReactNode
}) {
	return (
		<section aria-labelledby={id} className="mt-8">
			<h2
				id={id}
				className="text-body-xs text-muted-foreground mb-1 font-semibold tracking-[0.12em] uppercase"
			>
				{title}
			</h2>
			<ul className="divide-border/70 divide-y">{children}</ul>
		</section>
	)
}

export default function MeRoute({ loaderData }: Route.ComponentProps) {
	const { user, intervalsicu } = loaderData
	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader title={APP_TAB_LABELS.me} className="mb-6" />

			<Link
				to="/settings/profile"
				className="border-border/70 bg-card hover:bg-muted/50 flex items-center gap-4 rounded-3xl border p-4 shadow-xs transition-colors"
			>
				<Img
					className="bg-muted size-14 flex-none rounded-full object-cover"
					alt=""
					src={getUserImgSrc(user.image?.objectKey)}
					width={256}
					height={256}
					aria-hidden="true"
				/>
				<span className="min-w-0 flex-1">
					<span className="block truncate font-semibold">
						{user.name ?? user.username}
					</span>
					<span className="text-muted-foreground block truncate text-sm">
						@{user.username}
					</span>
					<span className="text-muted-foreground block text-sm">
						{ME_LABELS.profileDetail}
					</span>
				</span>
				<Icon
					name="chevron-right"
					size="md"
					className="text-muted-foreground"
					aria-hidden="true"
				/>
			</Link>

			<MeSection id="me-settings" title={ME_LABELS.settings}>
				<MeLink
					to="/settings/training"
					icon="settings"
					title={ME_LABELS.training}
				/>
			</MeSection>

			<MeSection id="me-integrations" title={ME_LABELS.integrations}>
				<MeLink
					to="/settings/integrations"
					icon="link-2"
					title={providerLabel(INTERVALSICU_PROVIDER)}
					detail={CONNECTION_HUB_STATUS_LABELS[intervalsicu]}
				/>
				<MeLink
					to="/imports/upload"
					icon="download"
					title={ME_LABELS.upload}
					detail={ME_LABELS.uploadDetail}
				/>
			</MeSection>

			<Form action="/logout" method="POST" className="mt-8">
				<button
					type="submit"
					className="text-muted-foreground hover:text-foreground flex min-h-11 items-center"
				>
					<Icon name="exit">{ME_LABELS.logout}</Icon>
				</button>
			</Form>
		</main>
	)
}

export { GeneralErrorBoundary as ErrorBoundary }
