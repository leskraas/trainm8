/**
 * The profile behind Meg (spec #505 story 59): the account, the athlete
 * profile, sign-in and security, the training settings and the athlete's own
 * data. Norwegian and on the design system since round 2 (ADR 0081/0085); the
 * loader and actions are unchanged — only words and look moved.
 *
 * Grouped the way the hub groups: two forms on cards, then lists of rows. One
 * filled button per form; the actions on the athlete's data are quiet rows,
 * and the destructive one turns red only as its confirmation.
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type FieldMetadata,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Img } from 'openimg/react'
import { data, Form, Link, useFetcher } from 'react-router'
import { z } from 'zod/v3'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Card, CardContent } from '#app/components/ui/card.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	AthleteProfileUpdateSchema,
	parseTrainableWeekdays,
} from '#app/utils/athlete-schema.ts'
import {
	getOrCreateAthleteProfile,
	updateAthleteProfile,
} from '#app/utils/athlete.server.ts'
import { requireUserId, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	formatNbVolumeFigure,
	formatWeeklyVolumeField,
} from '#app/utils/format.ts'
import {
	MEG_COMMON_LABELS,
	MEG_DROPPED_DAYS_LABELS,
	MEG_PROFILE_LABELS,
	MEG_UNIT_LABELS,
	MEG_WEEKDAY_LABELS,
	MEG_WEEKDAY_SHORT_LABELS,
	nbPlannedDisciplineLabel,
} from '#app/utils/labels.ts'
import { cn, getUserImgSrc, useDoubleCheck } from '#app/utils/misc.tsx'
import { readAnchorContext } from '#app/utils/plan-outline/history.server.ts'
import {
	dropUnavailablePinnedDays,
	type DroppedPinnedDays,
} from '#app/utils/plan-outline/pinned-days.server.ts'
import { weeklyCapacityFor } from '#app/utils/plan-outline/proposal.ts'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { megZodErrorMap } from '../__meg-text.ts'
import {
	MegButtonRow,
	MegField,
	MegFormErrors,
	MegRow,
	MegRows,
	MegSection,
	MegSelectField,
} from '../__meg-ui.tsx'
import { type Route } from './+types/index.ts'
import { twoFAVerificationType } from './two-factor/_layout.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const ProfileFormSchema = z.object({
	name: NameSchema.nullable().default(null),
	username: UsernameSchema,
})

// Training Availability weekday chips, ordered from Monday per ADR 0005's
// week-starts-on-Monday default. Values are the 0=Sun…6=Sat weekday numbers,
// which also index the Norwegian names.
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0] as const

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			email: true,
			image: {
				select: { objectKey: true },
			},
			_count: {
				select: {
					sessions: {
						where: {
							expirationDate: { gt: new Date() },
						},
					},
				},
			},
		},
	})

	const twoFactorVerification = await prisma.verification.findUnique({
		select: { id: true },
		where: { target_type: { type: twoFAVerificationType, target: userId } },
	})

	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})

	const athleteProfile = await getOrCreateAthleteProfile(userId)

	return {
		user,
		athleteProfile,
		/**
		 * What the athlete's own recent endurance training proposes for their
		 * **Weekly Capacity**, with the derivation to show beside it (ADR 0050 §2).
		 *
		 * **Read only while the field is unset.** A capacity is derived *once*, at
		 * authoring time, and then authored: an athlete who has answered is never
		 * shown a fresh reading of their history beside their own number, because
		 * that is the live re-derivation ADR 0040 §6 refuses — history says what they
		 * did, the capacity says what they could. Skipping the read also means the
		 * ordinary settings load costs no history scan at all.
		 *
		 * `null` where there is nothing to read, which is an **Unavailable** pre-fill
		 * and not a default: the surface then asks outright, and says why.
		 */
		capacityPrefill:
			athleteProfile.weeklyCapacityHours == null
				? weeklyCapacityFor((await readAnchorContext(userId)).endurance)
				: null,
		hasPassword: Boolean(password),
		isTwoFactorEnabled: Boolean(twoFactorVerification),
	}
}

type ProfileActionArgs = {
	request: Request
	userId: string
	formData: FormData
}
const profileUpdateActionIntent = 'update-profile'
const athleteProfileUpdateActionIntent = 'update-athlete-profile'
const signOutOfSessionsActionIntent = 'sign-out-of-sessions'
const deleteDataActionIntent = 'delete-data'

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case profileUpdateActionIntent: {
			return profileUpdateAction({ request, userId, formData })
		}
		case athleteProfileUpdateActionIntent: {
			return athleteProfileUpdateAction({ request, userId, formData })
		}
		case signOutOfSessionsActionIntent: {
			return signOutOfSessionsAction({ request, userId, formData })
		}
		case deleteDataActionIntent: {
			return deleteDataAction({ request, userId, formData })
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

export default function EditUserProfile({ loaderData }: Route.ComponentProps) {
	const { user, isTwoFactorEnabled, hasPassword } = loaderData
	const L = MEG_PROFILE_LABELS
	return (
		<div className="flex flex-col gap-8">
			{/* The photo, with its change button on its corner — inside the photo's
			    own box, so it can never drift beside the next field (it did). */}
			<div className="flex justify-center">
				<div className="relative size-28">
					<Img
						src={getUserImgSrc(user.image?.objectKey)}
						alt={user.name ?? user.username}
						className="bg-muted size-full rounded-full object-cover"
						width={448}
						height={448}
						isAboveFold
					/>
					<Link
						className={cn(
							buttonVariants({ variant: 'outline', size: 'icon' }),
							'bg-card dark:bg-card absolute -right-1 -bottom-1 size-11 rounded-full shadow-sm',
						)}
						preventScrollReset
						to="photo"
						aria-label={L.changePhoto}
					>
						<Icon name="camera" size="sm" />
					</Link>
				</div>
			</div>

			<MegSection id="profile-account" title={L.account}>
				<Card size="sm">
					<CardContent>
						<UpdateProfile loaderData={loaderData} />
					</CardContent>
				</Card>
			</MegSection>

			<MegSection id="profile-athlete" title={L.athlete}>
				<Card size="sm">
					<CardContent>
						<UpdateAthleteProfile loaderData={loaderData} />
					</CardContent>
				</Card>
			</MegSection>

			<MegSection id="profile-security" title={L.security}>
				<MegRows>
					<MegRow
						to="change-email"
						icon="envelope-closed"
						title={L.email}
						detail={user.email}
					/>
					<MegRow
						to={hasPassword ? 'password' : 'password/create'}
						icon="lock-closed"
						title={L.password}
						detail={hasPassword ? L.passwordSet : L.passwordMissing}
					/>
					<MegRow
						to="two-factor"
						icon={isTwoFactorEnabled ? 'lock-closed' : 'lock-open-1'}
						title={L.twoFactor}
						detail={isTwoFactorEnabled ? L.twoFactorOn : L.twoFactorOff}
					/>
					<MegRow
						to="passkeys"
						icon="passkey"
						title={L.passkeys}
						detail={L.passkeysDetail}
					/>
					<MegRow
						to="connections"
						icon="link-2"
						title={L.connections}
						detail={L.connectionsDetail}
					/>
				</MegRows>
			</MegSection>

			<MegSection id="profile-training" title={L.training}>
				<MegRows>
					<MegRow
						to="/settings/training"
						icon="settings"
						title={L.trainingSettings}
						detail={L.trainingSettingsDetail}
					/>
					{/* A link, not a copy: the activity sources and the upload are the
					    integrations page's to show. */}
					<MegRow
						to="/settings/integrations"
						icon="download"
						title={L.integrations}
						detail={L.integrationsDetail}
					/>
				</MegRows>
			</MegSection>

			<MegSection id="profile-data" title={L.data}>
				<MegRows>
					<MegRow
						reloadDocument
						download="my-trainm8-data.json"
						to="/resources/download-user-data"
						icon="download"
						title={L.download}
						detail={L.downloadDetail}
						trailing={<span aria-hidden="true" />}
					/>
					<SignOutOfSessions loaderData={loaderData} />
					{/* With the pill nav's avatar dropdown gone (#178), logout lives
					    on the profile as well as on Meg. */}
					<li>
						<Form action="/logout" method="POST">
							<MegButtonRow type="submit" icon="exit" title={L.logout} />
						</Form>
					</li>
					<DeleteData />
				</MegRows>
			</MegSection>
		</div>
	)
}

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
	const submission = await parseWithZod(formData, {
		async: true,
		errorMap: megZodErrorMap,
		schema: ProfileFormSchema.superRefine(async ({ username }, ctx) => {
			const existingUsername = await prisma.user.findUnique({
				where: { username },
				select: { id: true },
			})
			if (existingUsername && existingUsername.id !== userId) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: MEG_PROFILE_LABELS.usernameTaken,
				})
			}
		}),
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { username, name } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			name: name,
			username: username,
		},
	})

	return {
		result: submission.reply(),
	}
}

async function athleteProfileUpdateAction({
	userId,
	formData,
}: ProfileActionArgs) {
	const submission = parseWithZod(formData, {
		schema: AthleteProfileUpdateSchema,
		errorMap: megZodErrorMap,
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}
	await updateAthleteProfile(userId, submission.value)
	// A day taken out of Training Availability leaves every track that pinned
	// it (#598, spec #588 story 19), and the athlete is told which.
	const droppedDays =
		submission.value.trainableWeekdays !== undefined
			? await dropUnavailablePinnedDays(userId)
			: []
	return { result: submission.reply(), droppedDays }
}

function UpdateAthleteProfile({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const fetcher = useFetcher<typeof athleteProfileUpdateAction>()
	const { athleteProfile, capacityPrefill } = loaderData
	const savedWeekdays = parseTrainableWeekdays(athleteProfile.trainableWeekdays)
	const L = MEG_PROFILE_LABELS

	const [form, fields] = useForm({
		id: 'edit-athlete-profile',
		constraint: getZodConstraint(AthleteProfileUpdateSchema),
		lastResult: fetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: AthleteProfileUpdateSchema,
				errorMap: megZodErrorMap,
			})
		},
		defaultValue: {
			timezone: athleteProfile.timezone,
			weekStartsOn: athleteProfile.weekStartsOn,
			preferredUnits: athleteProfile.preferredUnits,
			birthdate: athleteProfile.birthdate
				? new Date(athleteProfile.birthdate).toISOString().slice(0, 10)
				: '',
			weightKg: athleteProfile.weightKg ?? '',
			defaultTrainingTime: athleteProfile.defaultTrainingTime ?? '',
			// The athlete's own number where they have one, and otherwise the
			// **pre-fill** sitting in the box for them to accept or overwrite — the
			// same idiom as the first **Season Anchor** (ADR 0050 §2). Rendered
			// through `formatWeeklyVolumeField`, the inverse-of-the-parse the planning
			// surface's volume boxes already use: the digits at the hours currency's
			// own precision, no unit, and `''` for a value nobody has authored — where
			// the derivation line below asks outright rather than leaving an empty box
			// looking like an oversight.
			weeklyCapacityHours: formatWeeklyVolumeField(
				athleteProfile.weeklyCapacityHours ?? capacityPrefill?.hours ?? null,
				'hours',
			),
		},
	})

	const capacityNote =
		athleteProfile.weeklyCapacityHours != null
			? L.capacityAuthored
			: capacityDerivationSentence(capacityPrefill?.derivation ?? null) +
				(capacityPrefill ? L.capacityChange : '')

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			{/* gap-x only + per-field pb-4: a space-y/gap-y wrapper around conform
			    fields silently breaks the form's second submit after a validation
			    error under client-side nav (map #277 Notes / auth #290). */}
			<div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
				<MegField
					className="pb-4"
					label={L.timezone}
					inputProps={{
						...getInputProps(fields.timezone, { type: 'text' }),
						autoComplete: 'off',
						autoCapitalize: 'none',
						autoCorrect: 'off',
						spellCheck: false,
						enterKeyHint: 'next',
					}}
					errors={fields.timezone.errors}
				/>
				<MegSelectField
					className="pb-4"
					meta={fields.weekStartsOn as unknown as FieldMetadata<string>}
					label={L.weekStartsOn}
					items={[
						{ value: '1', label: MEG_WEEKDAY_LABELS[1] },
						{ value: '0', label: MEG_WEEKDAY_LABELS[0] },
						{ value: '6', label: MEG_WEEKDAY_LABELS[6] },
					]}
					errors={fields.weekStartsOn.errors}
				/>
				<MegSelectField
					className="pb-4"
					meta={fields.preferredUnits}
					label={L.units}
					items={[
						{ value: 'metric', label: MEG_UNIT_LABELS.metric },
						{ value: 'imperial', label: MEG_UNIT_LABELS.imperial },
					]}
					errors={fields.preferredUnits.errors}
				/>
				<MegField
					className="pb-4"
					label={L.birthdate}
					inputProps={{
						...getInputProps(fields.birthdate, { type: 'date' }),
						autoComplete: 'bday',
					}}
					errors={fields.birthdate.errors}
				/>
				<MegField
					className="pb-4"
					label={L.weightKg}
					inputProps={{
						...getInputProps(fields.weightKg, { type: 'number' }),
						// Any precision: 72.5 kg is a weight, and the browser's default
						// step of 1 would refuse it without a word.
						step: 'any',
						inputMode: 'decimal',
						enterKeyHint: 'next',
					}}
					errors={fields.weightKg.errors}
				/>
			</div>

			<fieldset className="flex flex-col gap-2 pb-4">
				<legend className="text-footnote mb-1.5 font-medium">
					{L.trainableDays}
				</legend>
				{/* Sentinel keeps the field present so unchecking every day clears it */}
				<input type="hidden" name={fields.trainableWeekdays.name} value="" />
				<div className="flex flex-wrap gap-2">
					{WEEKDAY_OPTIONS.map((value) => {
						const id = `${fields.trainableWeekdays.id}-${value}`
						return (
							// A chip per day: a real checkbox under a 44px pill, so the
							// form posts without JavaScript, and the focus ring follows
							// the hidden box.
							<label
								key={value}
								htmlFor={id}
								className="border-border bg-background text-callout has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 pressable flex h-11 min-w-12 cursor-pointer items-center justify-center rounded-full border px-3 select-none has-[:focus-visible]:ring-3 dark:bg-transparent"
							>
								<input
									type="checkbox"
									id={id}
									name={fields.trainableWeekdays.name}
									value={value}
									defaultChecked={savedWeekdays.includes(value)}
									className="sr-only"
								/>
								{MEG_WEEKDAY_SHORT_LABELS[value]}
							</label>
						)
					})}
				</div>
				<MegFormErrors
					id={fields.trainableWeekdays.errorId}
					errors={fields.trainableWeekdays.errors}
				/>
			</fieldset>

			<div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
				<MegField
					className="pb-4"
					label={L.defaultTrainingTime}
					inputProps={getInputProps(fields.defaultTrainingTime, {
						type: 'time',
					})}
					errors={fields.defaultTrainingTime.errors}
				/>
				{/* The **Weekly Capacity** (ADR 0050): hours a week, never hours a day —
				    splitting it evenly across the trainable days would assert that a
				    Tuesday and a Saturday hold the same amount of training, which is
				    exactly what they do not. How the hours distribute across the week is
				    the **Week Pattern**'s to say. */}
				<MegField
					className="pb-4 sm:col-span-2"
					label={L.weeklyCapacity}
					inputProps={{
						...getInputProps(fields.weeklyCapacityHours, { type: 'number' }),
						step: 'any',
						min: 0,
						inputMode: 'decimal',
						enterKeyHint: 'done',
					}}
					errors={fields.weeklyCapacityHours.errors}
					hint={capacityNote}
				/>
			</div>

			<MegFormErrors id={form.errorId} errors={form.errors} />

			<DroppedDaysNote
				dropped={
					// The last save's answer stands while the next one is on its way,
					// so the note and the save button below it hold still.
					fetcher.data && 'droppedDays' in fetcher.data
						? fetcher.data.droppedDays
						: []
				}
			/>

			<div className="pt-2">
				<StatusButton
					className="w-full sm:w-auto"
					type="submit"
					name="intent"
					value={athleteProfileUpdateActionIntent}
					status={
						fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
					}
				>
					{L.saveAthlete}
				</StatusButton>
			</div>
		</fetcher.Form>
	)
}

/**
 * The tracks that lost a day the athlete just took out of their Training
 * Availability (#598): one line each, said where the save is.
 */
function DroppedDaysNote({ dropped }: { dropped: DroppedPinnedDays[] }) {
	if (dropped.length === 0) return null
	const D = MEG_DROPPED_DAYS_LABELS
	return (
		<div
			role="status"
			className={cn(
				'bg-muted/50 mb-2 rounded-2xl p-3',
				// It rises 4px and fades in as it mounts (`@starting-style`, 200ms
				// ease-out), as the day choices' preview does; reduced motion keeps
				// the fade.
				'duration-collapse [transition-property:opacity,translate] ease-out',
				'starting:translate-y-1 starting:opacity-0 motion-reduce:starting:translate-y-0',
			)}
		>
			<p className="text-callout font-semibold">{D.heading}</p>
			<ul className="mt-1 flex flex-col gap-1">
				{dropped.map((track) => (
					<li
						key={track.key}
						className="text-footnote [overflow-wrap:anywhere]"
					>
						{D.line(
							track.title ?? nbPlannedDisciplineLabel(track.discipline),
							track.lost,
							track.kept,
							track.activity,
						)}
					</li>
				))}
			</ul>
		</div>
	)
}

/**
 * Where a pre-filled Weekly Capacity came from, in Norwegian — or that it came
 * from nowhere, in which case the sentence asks (ADR 0050 §2). The Norwegian
 * twin of `formatWeeklyCapacityDerivation`, with decimal commas.
 */
function capacityDerivationSentence(
	derivation: {
		windowWeeks: number
		weeksTrained: number
		total: number
	} | null,
): string {
	if (!derivation) return MEG_PROFILE_LABELS.capacityNoHistory
	const { windowWeeks, weeksTrained, total } = derivation
	return MEG_PROFILE_LABELS.capacityDerived(
		windowWeeks,
		weeksTrained,
		formatNbVolumeFigure(total / windowWeeks, 'hours'),
		formatNbVolumeFigure(total, 'hours'),
	)
}

function UpdateProfile({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const fetcher = useFetcher<typeof profileUpdateAction>()
	const L = MEG_PROFILE_LABELS

	const [form, fields] = useForm({
		id: 'edit-profile',
		constraint: getZodConstraint(ProfileFormSchema),
		lastResult: fetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: ProfileFormSchema,
				errorMap: megZodErrorMap,
			})
		},
		defaultValue: {
			username: loaderData.user.username,
			name: loaderData.user.name,
		},
	})

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			{/* Single column on phones (§1.5); gap-x only + per-field pb-4 keeps the
			    conform second-submit fix (see athlete form above). */}
			<div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
				<MegField
					className="pb-4"
					label={L.username}
					inputProps={{
						...getInputProps(fields.username, { type: 'text' }),
						autoComplete: 'username',
						autoCapitalize: 'none',
						autoCorrect: 'off',
						spellCheck: false,
						enterKeyHint: 'next',
					}}
					errors={fields.username.errors}
				/>
				<MegField
					className="pb-4"
					label={L.name}
					inputProps={{
						...getInputProps(fields.name, { type: 'text' }),
						autoComplete: 'name',
						enterKeyHint: 'done',
					}}
					errors={fields.name.errors}
				/>
			</div>

			<MegFormErrors id={form.errorId} errors={form.errors} />

			<div className="pt-2">
				<StatusButton
					className="w-full sm:w-auto"
					type="submit"
					name="intent"
					value={profileUpdateActionIntent}
					status={
						fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
					}
				>
					{L.saveAccount}
				</StatusButton>
			</div>
		</fetcher.Form>
	)
}

async function signOutOfSessionsAction({ request, userId }: ProfileActionArgs) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	invariantResponse(
		sessionId,
		'You must be authenticated to sign out of other sessions',
	)
	await prisma.session.deleteMany({
		where: {
			userId,
			id: { not: sessionId },
		},
	})
	return { status: 'success' } as const
}

function SignOutOfSessions({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const dc = useDoubleCheck()
	const L = MEG_PROFILE_LABELS

	const fetcher = useFetcher<typeof signOutOfSessionsAction>()
	const otherSessionsCount = loaderData.user._count.sessions - 1
	if (fetcher.data?.status === 'success') {
		return (
			<li className="text-footnote text-muted-foreground flex min-h-11 items-center gap-3 py-3">
				<Icon name="check" size="md" aria-hidden="true" />
				<span role="status">{L.signedOut}</span>
			</li>
		)
	}
	return (
		<li>
			{otherSessionsCount > 0 ? (
				<fetcher.Form method="POST">
					<MegButtonRow
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: signOutOfSessionsActionIntent,
						})}
						disabled={fetcher.state !== 'idle'}
						icon="avatar"
						tone={dc.doubleCheck ? 'destructive' : undefined}
						title={
							dc.doubleCheck
								? MEG_COMMON_LABELS.areYouSure
								: L.otherSessions(otherSessionsCount)
						}
					/>
				</fetcher.Form>
			) : (
				<p className="text-footnote text-muted-foreground flex min-h-11 items-center gap-3 py-3">
					<Icon name="avatar" size="md" aria-hidden="true" />
					{L.onlySession}
				</p>
			)}
		</li>
	)
}

async function deleteDataAction({ userId }: ProfileActionArgs) {
	await prisma.user.delete({ where: { id: userId } })
	return redirectWithToast('/', {
		type: 'success',
		title: MEG_PROFILE_LABELS.deletedTitle,
		description: MEG_PROFILE_LABELS.deletedBody,
	})
}

function DeleteData() {
	const dc = useDoubleCheck()
	const L = MEG_PROFILE_LABELS

	const fetcher = useFetcher<typeof deleteDataAction>()
	return (
		<li>
			<fetcher.Form method="POST">
				<MegButtonRow
					{...dc.getButtonProps({
						type: 'submit',
						name: 'intent',
						value: deleteDataActionIntent,
					})}
					disabled={fetcher.state !== 'idle'}
					icon="trash"
					tone="destructive"
					title={dc.doubleCheck ? MEG_COMMON_LABELS.areYouSure : L.deleteData}
					detail={L.deleteDataDetail}
				/>
			</fetcher.Form>
		</li>
	)
}
