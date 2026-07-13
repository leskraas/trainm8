import {
	type FieldMetadata,
	getFormProps,
	getInputProps,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Img } from 'openimg/react'
import { data, Form, Link, useFetcher } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
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
import { UNIT_LABELS, WEEKDAY_LABELS } from '#app/utils/labels.ts'
import { cn, getUserImgSrc, useDoubleCheck } from '#app/utils/misc.tsx'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts'
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
// week-starts-on-Monday default. Values are the 0=Sun…6=Sat weekday numbers.
const WEEKDAY_OPTIONS = [
	{ value: 1, label: 'Mon' },
	{ value: 2, label: 'Tue' },
	{ value: 3, label: 'Wed' },
	{ value: 4, label: 'Thu' },
	{ value: 5, label: 'Fri' },
	{ value: 6, label: 'Sat' },
	{ value: 0, label: 'Sun' },
] as const

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
	// One 44px-tall row for the settings navigation links so each is a full
	// touch target (§2.2), replacing the old 19–24px bare text links.
	const linkRow =
		'flex min-h-11 items-center gap-2 text-sm hover:text-foreground/80'
	return (
		<div className="space-y-8">
			<div className="flex justify-center">
				<div className="relative size-52">
					<Img
						src={getUserImgSrc(loaderData.user.image?.objectKey)}
						alt={loaderData.user.name ?? loaderData.user.username}
						className="h-full w-full rounded-full object-cover"
						width={832}
						height={832}
						isAboveFold
					/>

					<Link
						className={cn(
							'absolute top-3 -right-3 flex size-10 items-center justify-center rounded-full p-0',
							buttonVariants({ variant: 'outline', size: 'icon' }),
						)}
						preventScrollReset
						to="photo"
						title="Change profile photo"
						aria-label="Change profile photo"
					>
						<Icon name="camera" className="size-4" />
					</Link>
				</div>
			</div>

			<UpdateProfile loaderData={loaderData} />

			<UpdateAthleteProfile loaderData={loaderData} />

			<div className="flex flex-col gap-1">
				<Link to="change-email" className={linkRow}>
					<Icon name="envelope-closed">
						Change email from {loaderData.user.email}
					</Icon>
				</Link>
				<Link to="two-factor" className={linkRow}>
					{loaderData.isTwoFactorEnabled ? (
						<Icon name="lock-closed">2FA is enabled</Icon>
					) : (
						<Icon name="lock-open-1">Enable 2FA</Icon>
					)}
				</Link>
				<Link
					to={loaderData.hasPassword ? 'password' : 'password/create'}
					className={linkRow}
				>
					<Icon name="dots-horizontal">
						{loaderData.hasPassword ? 'Change Password' : 'Create a Password'}
					</Icon>
				</Link>
				<Link to="/settings/training" className={linkRow}>
					<Icon name="settings">Training settings &amp; thresholds</Icon>
				</Link>
				<Link to="connections" className={linkRow}>
					<Icon name="link-2">Manage connections</Icon>
				</Link>
				<Link to="/settings/integrations" className={linkRow}>
					<Icon name="download">Integrations &amp; activity sources</Icon>
				</Link>
				<Link to="passkeys" className={linkRow}>
					<Icon name="passkey">Manage passkeys</Icon>
				</Link>
				<Link
					reloadDocument
					download="my-trainm8-data.json"
					to="/resources/download-user-data"
					className={linkRow}
				>
					<Icon name="download">Download your data</Icon>
				</Link>
				<SignOutOfSessions loaderData={loaderData} />
				{/*
					With the pill nav's avatar dropdown gone (#178) the avatar links
					straight here, so logout lives on the Settings surface itself.
				*/}
				<Form action="/logout" method="POST">
					<button type="submit" className={linkRow}>
						<Icon name="exit">Log out</Icon>
					</button>
				</Form>
				<DeleteData />
			</div>
		</div>
	)
}

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
	const submission = await parseWithZod(formData, {
		async: true,
		schema: ProfileFormSchema.superRefine(async ({ username }, ctx) => {
			const existingUsername = await prisma.user.findUnique({
				where: { username },
				select: { id: true },
			})
			if (existingUsername && existingUsername.id !== userId) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: 'A user already exists with this username',
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
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}
	await updateAthleteProfile(userId, submission.value)
	return { result: submission.reply() }
}

function UpdateAthleteProfile({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const fetcher = useFetcher<typeof athleteProfileUpdateAction>()
	const { athleteProfile } = loaderData
	const savedWeekdays = parseTrainableWeekdays(athleteProfile.trainableWeekdays)

	const [form, fields] = useForm({
		id: 'edit-athlete-profile',
		constraint: getZodConstraint(AthleteProfileUpdateSchema),
		lastResult: fetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: AthleteProfileUpdateSchema })
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
		},
	})

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<h2 className="text-lg font-semibold">Athlete Profile</h2>
			<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					labelProps={{ htmlFor: fields.timezone.id, children: 'Timezone' }}
					inputProps={getInputProps(fields.timezone, { type: 'text' })}
					errors={fields.timezone.errors}
				/>
				<SelectField
					// weekStartsOn is stored as a weekday number; conform serializes it
					// to a string on the wire and coerces it back, so it drives the
					// string-valued SelectField directly.
					meta={fields.weekStartsOn as unknown as FieldMetadata<string>}
					labelProps={{
						children: 'Week starts on',
						className: 'text-sm font-medium',
					}}
					items={([1, 0, 6] as const).map((d) => ({
						value: String(d),
						label: WEEKDAY_LABELS[d],
					}))}
					errors={fields.weekStartsOn.errors}
				/>
				<SelectField
					meta={fields.preferredUnits}
					labelProps={{ children: 'Units', className: 'text-sm font-medium' }}
					items={(['metric', 'imperial'] as const).map((u) => ({
						value: u,
						label: UNIT_LABELS[u],
					}))}
					errors={fields.preferredUnits.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.birthdate.id, children: 'Birthdate' }}
					inputProps={getInputProps(fields.birthdate, { type: 'date' })}
					errors={fields.birthdate.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.weightKg.id, children: 'Weight (kg)' }}
					inputProps={getInputProps(fields.weightKg, { type: 'number' })}
					errors={fields.weightKg.errors}
				/>
			</div>

			<fieldset className="mt-4">
				<legend className="sr-only">Training availability</legend>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div className="flex flex-col gap-1.5 sm:col-span-2">
						<span className="text-sm font-medium">Trainable days</span>
						{/* Sentinel keeps the field present so unchecking every day clears it */}
						<input
							type="hidden"
							name={fields.trainableWeekdays.name}
							value=""
						/>
						<div className="flex flex-wrap gap-3">
							{WEEKDAY_OPTIONS.map((day) => {
								const id = `${fields.trainableWeekdays.id}-${day.value}`
								return (
									<label
										key={day.value}
										htmlFor={id}
										className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm select-none"
									>
										<input
											type="checkbox"
											id={id}
											name={fields.trainableWeekdays.name}
											value={day.value}
											defaultChecked={savedWeekdays.includes(day.value)}
											className="sr-only"
										/>
										{day.label}
									</label>
								)
							})}
						</div>
						<ErrorList
							errors={fields.trainableWeekdays.errors}
							id={fields.trainableWeekdays.errorId}
						/>
					</div>
					<Field
						labelProps={{
							htmlFor: fields.defaultTrainingTime.id,
							children: 'Default training time',
						}}
						inputProps={getInputProps(fields.defaultTrainingTime, {
							type: 'time',
						})}
						errors={fields.defaultTrainingTime.errors}
					/>
				</div>
			</fieldset>

			<ErrorList errors={form.errors} id={form.errorId} />

			<div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
				<StatusButton
					type="submit"
					size="default"
					name="intent"
					value={athleteProfileUpdateActionIntent}
					status={
						fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
					}
					className="w-full sm:w-auto"
				>
					Save athlete profile
				</StatusButton>
			</div>
		</fetcher.Form>
	)
}

function UpdateProfile({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const fetcher = useFetcher<typeof profileUpdateAction>()

	const [form, fields] = useForm({
		id: 'edit-profile',
		constraint: getZodConstraint(ProfileFormSchema),
		lastResult: fetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ProfileFormSchema })
		},
		defaultValue: {
			username: loaderData.user.username,
			name: loaderData.user.name,
		},
	})

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field
					labelProps={{
						htmlFor: fields.username.id,
						children: 'Username',
					}}
					inputProps={getInputProps(fields.username, { type: 'text' })}
					errors={fields.username.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
					inputProps={getInputProps(fields.name, { type: 'text' })}
					errors={fields.name.errors}
				/>
			</div>

			<ErrorList errors={form.errors} id={form.errorId} />

			<div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
				<StatusButton
					type="submit"
					size="default"
					name="intent"
					value={profileUpdateActionIntent}
					status={
						fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
					}
					className="w-full sm:w-auto"
				>
					Save changes
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

	const fetcher = useFetcher<typeof signOutOfSessionsAction>()
	const otherSessionsCount = loaderData.user._count.sessions - 1
	return (
		<div>
			{otherSessionsCount ? (
				<fetcher.Form method="POST">
					<StatusButton
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: signOutOfSessionsActionIntent,
						})}
						variant={dc.doubleCheck ? 'destructive' : 'default'}
						status={
							fetcher.state !== 'idle'
								? 'pending'
								: (fetcher.data?.status ?? 'idle')
						}
					>
						<Icon name="avatar">
							{dc.doubleCheck
								? `Are you sure?`
								: `Sign out of ${otherSessionsCount} other sessions`}
						</Icon>
					</StatusButton>
				</fetcher.Form>
			) : (
				<Icon name="avatar">This is your only session</Icon>
			)}
		</div>
	)
}

async function deleteDataAction({ userId }: ProfileActionArgs) {
	await prisma.user.delete({ where: { id: userId } })
	return redirectWithToast('/', {
		type: 'success',
		title: 'Data Deleted',
		description: 'All of your data has been deleted',
	})
}

function DeleteData() {
	const dc = useDoubleCheck()

	const fetcher = useFetcher<typeof deleteDataAction>()
	return (
		<div>
			<fetcher.Form method="POST">
				<StatusButton
					{...dc.getButtonProps({
						type: 'submit',
						name: 'intent',
						value: deleteDataActionIntent,
					})}
					variant={dc.doubleCheck ? 'destructive' : 'default'}
					status={fetcher.state !== 'idle' ? 'pending' : 'idle'}
				>
					<Icon name="trash">
						{dc.doubleCheck ? `Are you sure?` : `Delete all your data`}
					</Icon>
				</StatusButton>
			</fetcher.Form>
		</div>
	)
}
