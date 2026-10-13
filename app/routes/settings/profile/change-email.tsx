import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, redirect, Form } from 'react-router'
import { z } from 'zod/v3'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	prepareVerification,
	requireRecentVerification,
} from '#app/routes/_auth/verify.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { MEG_EMAIL_LABELS, MEG_PAGE_TITLES } from '#app/utils/labels.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { EmailSchema } from '#app/utils/user-validation.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { megZodErrorMap } from '../__meg-text.ts'
import { MegField, MegFormErrors, MegNote } from '../__meg-ui.tsx'
import { type Route } from './+types/change-email.ts'
import { EmailChangeEmail } from './change-email.server.tsx'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.changeEmail,
	getSitemapEntries: () => null,
}

export const newEmailAddressSessionKey = 'new-email-address'

const ChangeEmailSchema = z.object({
	email: EmailSchema,
})

export async function loader({ request }: Route.LoaderArgs) {
	await requireRecentVerification(request)
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	})
	if (!user) {
		const params = new URLSearchParams({ redirectTo: request.url })
		throw redirect(`/login?${params}`)
	}
	return { user }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		errorMap: megZodErrorMap,
		schema: ChangeEmailSchema.superRefine(async (data, ctx) => {
			const existingUser = await prisma.user.findUnique({
				where: { email: data.email },
			})
			if (existingUser) {
				ctx.addIssue({
					path: ['email'],
					code: z.ZodIssueCode.custom,
					message: MEG_EMAIL_LABELS.inUse,
				})
			}
		}),
		async: true,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}
	const { otp, redirectTo, verifyUrl } = await prepareVerification({
		period: 10 * 60,
		request,
		target: userId,
		type: 'change-email',
	})

	const response = await sendEmail({
		to: submission.value.email,
		subject: MEG_EMAIL_LABELS.codeSubject,
		react: <EmailChangeEmail verifyUrl={verifyUrl.toString()} otp={otp} />,
	})

	if (response.status === 'success') {
		const verifySession = await verifySessionStorage.getSession()
		verifySession.set(newEmailAddressSessionKey, submission.value.email)
		return redirect(redirectTo.toString(), {
			headers: {
				'set-cookie': await verifySessionStorage.commitSession(verifySession),
			},
		})
	} else {
		return data(
			{ result: submission.reply({ formErrors: [response.error.message] }) },
			{ status: 500 },
		)
	}
}

export default function ChangeEmailIndex({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const [form, fields] = useForm({
		id: 'change-email-form',
		constraint: getZodConstraint(ChangeEmailSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: ChangeEmailSchema,
				errorMap: megZodErrorMap,
			})
		},
	})

	const isPending = useIsPending()
	const L = MEG_EMAIL_LABELS
	return (
		<div className="mx-auto flex max-w-md flex-col gap-6">
			<div className="flex flex-col gap-2">
				<p className="text-body">{L.intro}</p>
				<MegNote className="[overflow-wrap:anywhere]">
					{L.notice(loaderData.user.email)}
				</MegNote>
			</div>
			<Form
				method="POST"
				{...getFormProps(form)}
				className="flex flex-col gap-4"
			>
				<MegField
					label={L.newEmail}
					inputProps={{
						...getInputProps(fields.email, { type: 'email' }),
						autoComplete: 'email',
						inputMode: 'email',
						autoCapitalize: 'none',
						autoCorrect: 'off',
						spellCheck: false,
						enterKeyHint: 'send',
					}}
					errors={fields.email.errors}
				/>
				<MegFormErrors id={form.errorId} errors={form.errors} />
				<StatusButton
					type="submit"
					className="w-full sm:w-auto sm:self-start"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
				>
					{L.send}
				</StatusButton>
			</Form>
		</div>
	)
}
