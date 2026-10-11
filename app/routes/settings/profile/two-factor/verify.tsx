import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import * as QRCode from 'qrcode'
import { data, redirect, Form, useNavigation } from 'react-router'
import { z } from 'zod'
import { OTPField } from '#app/components/forms.tsx'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { isCodeValid } from '#app/routes/_auth/verify.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	MEG_COMMON_LABELS,
	MEG_PAGE_TITLES,
	MEG_TWO_FACTOR_LABELS,
} from '#app/utils/labels.ts'
import { getDomainUrl, useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { getTOTPAuthUri } from '#app/utils/totp.server.ts'
import { megZodErrorMap, nbErrors } from '../../__meg-text.ts'
import { MegFormErrors, MegNote } from '../../__meg-ui.tsx'
import { type Route } from './+types/verify.ts'
import { twoFAVerificationType } from './_layout.tsx'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.twoFactorVerify,
	getSitemapEntries: () => null,
}

const CancelSchema = z.object({ intent: z.literal('cancel') })
const VerifySchema = z.object({
	intent: z.literal('verify'),
	code: z
		.string()
		.min(6, MEG_TWO_FACTOR_LABELS.codeLength)
		.max(6, MEG_TWO_FACTOR_LABELS.codeLength),
})

const ActionSchema = z.discriminatedUnion('intent', [
	CancelSchema,
	VerifySchema,
])

export const twoFAVerifyVerificationType = '2fa-verify'

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const verification = await prisma.verification.findUnique({
		where: {
			target_type: { type: twoFAVerifyVerificationType, target: userId },
		},
		select: {
			id: true,
			algorithm: true,
			secret: true,
			period: true,
			digits: true,
		},
	})
	if (!verification) {
		return redirect('/settings/profile/two-factor')
	}
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: { email: true },
	})
	const issuer = new URL(getDomainUrl(request)).host
	const otpUri = getTOTPAuthUri({
		...verification,
		accountName: user.email,
		issuer,
	})
	const qrCode = await QRCode.toDataURL(otpUri)
	return { otpUri, qrCode }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	const submission = await parseWithZod(formData, {
		schema: () =>
			ActionSchema.superRefine(async (data, ctx) => {
				if (data.intent === 'cancel') return null
				const codeIsValid = await isCodeValid({
					code: data.code,
					type: twoFAVerifyVerificationType,
					target: userId,
				})
				if (!codeIsValid) {
					ctx.addIssue({
						path: ['code'],
						code: z.ZodIssueCode.custom,
						message: MEG_TWO_FACTOR_LABELS.invalidCode,
					})
					return z.NEVER
				}
			}),
		async: true,
		errorMap: megZodErrorMap,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	switch (submission.value.intent) {
		case 'cancel': {
			await prisma.verification.deleteMany({
				where: { type: twoFAVerifyVerificationType, target: userId },
			})
			return redirect('/settings/profile/two-factor')
		}
		case 'verify': {
			await prisma.verification.update({
				where: {
					target_type: { type: twoFAVerifyVerificationType, target: userId },
				},
				data: { type: twoFAVerificationType },
			})
			return redirectWithToast('/settings/profile/two-factor', {
				type: 'success',
				title: MEG_TWO_FACTOR_LABELS.enabledTitle,
				description: MEG_TWO_FACTOR_LABELS.enabledBody,
			})
		}
	}
}

export default function TwoFactorRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const navigation = useNavigation()

	const isPending = useIsPending()
	const pendingIntent = isPending ? navigation.formData?.get('intent') : null

	const [form, fields] = useForm({
		id: 'verify-form',
		constraint: getZodConstraint(ActionSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: ActionSchema,
				errorMap: megZodErrorMap,
			})
		},
	})
	const lastSubmissionIntent = fields.intent.value
	const L = MEG_TWO_FACTOR_LABELS
	const codeErrors = nbErrors(fields.code.errors)
	const codeErrorId = `${fields.code.id}-error`

	return (
		<div className="mx-auto flex max-w-md flex-col gap-6">
			<div className="bg-card ring-foreground/5 dark:ring-foreground/10 flex flex-col items-center gap-4 rounded-4xl p-4 shadow-md ring-1">
				{/* The QR code stays black on white in both themes: that is what an
				    authenticator's camera reads. */}
				<img
					alt={L.qrAlt}
					src={loaderData.qrCode}
					className="size-52 rounded-2xl bg-white p-2"
				/>
				<p className="text-callout text-center">{L.scan}</p>
				<MegNote className="text-center">{L.manual}</MegNote>
				<pre
					className="text-footnote bg-muted w-full rounded-2xl p-3 break-all whitespace-pre-wrap select-all"
					aria-label={L.uriLabel}
				>
					{loaderData.otpUri}
				</pre>
			</div>
			<MegNote>{L.enterCode}</MegNote>
			<div className="flex w-full flex-col justify-center gap-4">
				<Form method="POST" {...getFormProps(form)} className="flex-1">
					<div className="flex flex-col items-center gap-1.5">
						<OTPField
							labelProps={{
								htmlFor: fields.code.id,
								children: L.code,
							}}
							inputProps={{
								...getInputProps(fields.code, { type: 'text' }),
								autoFocus: true,
								autoComplete: 'one-time-code',
								inputMode: 'numeric',
								enterKeyHint: 'done',
								'aria-describedby': codeErrors.length ? codeErrorId : undefined,
							}}
						/>
						{/* The code's errors, as words under the boxes. */}
						<MegFormErrors id={codeErrorId} errors={codeErrors} />
					</div>

					<div className="min-h-8 pt-1 pb-3">
						<MegFormErrors id={form.errorId} errors={form.errors} />
					</div>

					<div className="flex justify-between gap-3">
						<StatusButton
							className="w-full"
							status={
								pendingIntent === 'verify'
									? 'pending'
									: lastSubmissionIntent === 'verify'
										? (form.status ?? 'idle')
										: 'idle'
							}
							type="submit"
							name="intent"
							value="verify"
						>
							{L.verify}
						</StatusButton>
						<StatusButton
							className="w-full"
							variant="secondary"
							status={
								pendingIntent === 'cancel'
									? 'pending'
									: lastSubmissionIntent === 'cancel'
										? (form.status ?? 'idle')
										: 'idle'
							}
							type="submit"
							name="intent"
							value="cancel"
							disabled={isPending}
						>
							{MEG_COMMON_LABELS.cancel}
						</StatusButton>
					</div>
				</Form>
			</div>
		</div>
	)
}
