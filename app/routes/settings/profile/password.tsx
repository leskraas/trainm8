import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, redirect, Form, Link } from 'react-router'
import { z } from 'zod/v3'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	checkIsCommonPassword,
	getPasswordHash,
	requireUserId,
	verifyUserPassword,
} from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	MEG_COMMON_LABELS,
	MEG_PAGE_TITLES,
	MEG_PASSWORD_LABELS,
} from '#app/utils/labels.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { PasswordSchema } from '#app/utils/user-validation.ts'
import { megZodErrorMap } from '../__meg-text.ts'
import { MegField, MegFormErrors } from '../__meg-ui.tsx'
import { type Route } from './+types/password.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.password,
	getSitemapEntries: () => null,
}

const ChangePasswordForm = z
	.object({
		currentPassword: PasswordSchema,
		newPassword: PasswordSchema,
		confirmNewPassword: PasswordSchema,
	})
	.superRefine(({ confirmNewPassword, newPassword }, ctx) => {
		if (confirmNewPassword !== newPassword) {
			ctx.addIssue({
				path: ['confirmNewPassword'],
				code: z.ZodIssueCode.custom,
				message: MEG_PASSWORD_LABELS.mustMatch,
			})
		}
	})

async function requirePassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (!password) {
		throw redirect('/settings/profile/password/create')
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	await requirePassword(userId)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		async: true,
		errorMap: megZodErrorMap,
		schema: ChangePasswordForm.superRefine(
			async ({ currentPassword, newPassword }, ctx) => {
				if (currentPassword && newPassword) {
					const user = await verifyUserPassword({ id: userId }, currentPassword)
					if (!user) {
						ctx.addIssue({
							path: ['currentPassword'],
							code: z.ZodIssueCode.custom,
							message: MEG_PASSWORD_LABELS.incorrect,
						})
					}
					const isCommonPassword = await checkIsCommonPassword(newPassword)
					if (isCommonPassword) {
						ctx.addIssue({
							path: ['newPassword'],
							code: 'custom',
							message: MEG_PASSWORD_LABELS.tooCommon,
						})
					}
				}
			},
		),
	})
	if (submission.status !== 'success') {
		return data(
			{
				result: submission.reply({
					hideFields: ['currentPassword', 'newPassword', 'confirmNewPassword'],
				}),
			},
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { newPassword } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			password: {
				update: {
					hash: await getPasswordHash(newPassword),
				},
			},
		},
	})

	return redirectWithToast(
		`/settings/profile`,
		{
			type: 'success',
			title: MEG_PASSWORD_LABELS.changedTitle,
			description: MEG_PASSWORD_LABELS.changedBody,
		},
		{ status: 302 },
	)
}

export default function ChangePasswordRoute({
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()

	const [form, fields] = useForm({
		id: 'password-change-form',
		constraint: getZodConstraint(ChangePasswordForm),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: ChangePasswordForm,
				errorMap: megZodErrorMap,
			})
		},
		shouldRevalidate: 'onBlur',
	})
	const L = MEG_PASSWORD_LABELS

	return (
		<Form
			method="POST"
			{...getFormProps(form)}
			className="mx-auto flex max-w-md flex-col gap-4"
		>
			<MegField
				label={L.current}
				inputProps={{
					...getInputProps(fields.currentPassword, { type: 'password' }),
					autoComplete: 'current-password',
					enterKeyHint: 'next',
				}}
				errors={fields.currentPassword.errors}
			/>
			<MegField
				label={L.next}
				inputProps={{
					...getInputProps(fields.newPassword, { type: 'password' }),
					autoComplete: 'new-password',
					enterKeyHint: 'next',
				}}
				errors={fields.newPassword.errors}
			/>
			<MegField
				label={L.confirm}
				inputProps={{
					...getInputProps(fields.confirmNewPassword, {
						type: 'password',
					}),
					autoComplete: 'new-password',
					enterKeyHint: 'done',
				}}
				errors={fields.confirmNewPassword.errors}
			/>
			<MegFormErrors id={form.errorId} errors={form.errors} />
			<div className="grid w-full grid-cols-2 gap-3 pt-2">
				<Link className={buttonVariants({ variant: 'outline' })} to="..">
					{MEG_COMMON_LABELS.cancel}
				</Link>
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
				>
					{L.change}
				</StatusButton>
			</div>
		</Form>
	)
}
