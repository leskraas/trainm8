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
 *
 * **Form and Rekorder** moved here from the home hero when the hero went (#505,
 * the owner's decision of 2026-10-10): they were the only place either reading
 * was shown. They sit between the profile card and the settings. Meg is the
 * athlete's own page, and what their training has built is the part of it that
 * changes and is worth opening the tab for; settings, connections and logging
 * out are visited rarely, so they go below, out of the way (story 59). The
 * profile card stays on top because it names whose page this is.
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
import {
	getAthleteTimezone,
	readStartAnswersOf,
} from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	APP_TAB_LABELS,
	CONNECTION_HUB_STATUS_LABELS,
	ME_LABELS,
	MEG_STRENGTH_LABELS,
	providerLabel,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import {
	getCurrentLoad,
	getLoadSnapshots,
	getTsbTrust,
} from '#app/utils/load/snapshot.server.ts'
import { getUserImgSrc } from '#app/utils/misc.tsx'
import { getPersonalRecords } from '#app/utils/personal-records.server.ts'
import { derivedAttributionLines } from '#app/utils/source-attribution.ts'
import { readRecordedBindingSet } from '#app/utils/source-terms.server.ts'
import { type Route } from './+types/me.ts'
import { AutopilotSetting } from './__me-autopilot.tsx'
import {
	buildFormReading,
	buildRecordLines,
} from './__me-form-records-presenter.ts'
import {
	FormSection,
	MeSectionHeading,
	RecordsSection,
} from './__me-form-records.tsx'

export const meta: Route.MetaFunction = () => [
	{ title: `${APP_TAB_LABELS.me} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [
		user,
		connection,
		currentLoad,
		snapshots,
		tsbTrust,
		personalRecords,
		timezone,
		bindingSet,
		startAnswers,
		profile,
	] = await Promise.all([
		prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: {
				name: true,
				username: true,
				image: { select: { objectKey: true } },
			},
		}),
		getAccountConnection(userId, INTERVALSICU_PROVIDER),
		// The four reads the home hero's Form and Records panes were built from,
		// unchanged, so the numbers are the ones the hero showed: the latest Load
		// Snapshot, 90 days of them for the trend, the cold-start gate, and the
		// derived Personal Records.
		getCurrentLoad(userId),
		getLoadSnapshots(userId, 90),
		getTsbTrust(userId),
		getPersonalRecords(userId),
		getAthleteTimezone(userId),
		// The Origin Platforms behind the load and the records (ADR 0098 §1),
		// for the derived-data line Garmin's terms ask of both.
		readRecordedBindingSet(userId),
		// The level and Session Preferences the start asked (#571).
		readStartAnswersOf(userId),
		// The Autopilot switch (#576, ADR 0100 §6).
		prisma.athleteProfile.findUnique({
			where: { userId },
			select: { autopilot: true },
		}),
	])
	// The same reading the integrations page makes (`connectionHubStatus`).
	const intervalsicu = connectionHubStatus(connection)
	// Built here rather than in the component: the strings are the payload, and
	// a record's `achievedAt` is then read in the athlete's zone once, on the
	// server, instead of after a Date has been serialized.
	const form = buildFormReading({
		current: currentLoad,
		trust: tsbTrust,
		snapshots: snapshots.map((s) => ({ date: s.date, ctl: s.ctl })),
		timezone,
	})
	const records = buildRecordLines(personalRecords, timezone)
	const credits = derivedAttributionLines(bindingSet)
	// The athlete's own Strength Frequency answer (#574), changed below.
	const strengthPerWeek =
		(
			await prisma.athleteProfile.findUnique({
				where: { userId },
				select: { strengthPerWeek: true },
			})
		)?.strengthPerWeek ?? null
	const startAnswersDetail = SESSION_PREFERENCE_LABELS.meg.row(
		startAnswers.level
			? SIMPLE_START_LABELS.levels[startAnswers.level].name
			: null,
		SESSION_PREFERENCE_LABELS.list(
			startAnswers.preferences.map(
				(preference) => SESSION_PREFERENCE_LABELS.options[preference].name,
			),
		),
	)
	return {
		user,
		intervalsicu,
		form,
		records,
		credits,
		strengthPerWeek,
		startAnswersDetail,
		autopilot: profile?.autopilot ?? false,
	}
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
				// A row of a list, so the press is a tint rather than a scale (a
				// whole-width row shrinking reads as the page moving), on the
				// app's press curve.
				className="active:bg-muted/60 duration-press -mx-2 flex min-h-11 items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors ease-out hover:underline"
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
						<span className="text-muted-foreground text-footnote block">
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
			<MeSectionHeading id={id}>{title}</MeSectionHeading>
			<ul className="divide-border/70 divide-y">{children}</ul>
		</section>
	)
}

export default function MeRoute({ loaderData }: Route.ComponentProps) {
	const {
		user,
		intervalsicu,
		form,
		records,
		credits,
		strengthPerWeek,
		startAnswersDetail,
		autopilot,
	} = loaderData
	return (
		<main className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader title={APP_TAB_LABELS.me} className="mb-6" />

			<Link
				to="/settings/profile"
				// The press is the app's (`pressable`: scale 0.97 on the press curve,
				// colours on the same curve), not the built-in `transition-colors`.
				className="border-border/70 bg-card hover:bg-muted/50 active:bg-muted/50 pressable flex items-center gap-4 rounded-4xl border p-4 shadow-xs"
			>
				<Img
					className="bg-muted size-14 flex-none rounded-full object-cover"
					alt=""
					src={getUserImgSrc(user.image?.objectKey)}
					width={256}
					height={256}
					aria-hidden="true"
				/>
				{/* Whose page this is, whole: a long name or username wraps (and
				    breaks anywhere if it has no space), never `Aleksandra Wiś…`. */}
				<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
					<span className="text-callout block font-semibold">
						{user.name ?? user.username}
					</span>
					<span className="text-muted-foreground text-footnote block">
						@{user.username}
					</span>
					<span className="text-muted-foreground text-footnote mt-0.5 block">
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

			<FormSection reading={form} credits={credits} />
			<RecordsSection records={records} credits={credits} />

			<AutopilotSetting autopilot={autopilot} />

			<MeSection id="me-settings" title={ME_LABELS.settings}>
				<MeLink
					to="/settings/level"
					icon="bar-chart"
					title={SESSION_PREFERENCE_LABELS.meg.title}
					detail={startAnswersDetail}
				/>
				<MeLink
					to="/settings/training"
					icon="settings"
					title={ME_LABELS.training}
				/>
				<MeLink
					to="/settings/training/styrke"
					icon="barbell"
					title={MEG_STRENGTH_LABELS.title}
					detail={MEG_STRENGTH_LABELS.detail(strengthPerWeek)}
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
