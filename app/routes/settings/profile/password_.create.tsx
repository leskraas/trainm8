import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, redirect, Form, Link } from 'react-router'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	checkIsCommonPassword,
	getPasswordHash,
	requireUserId,
} from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	MEG_COMMON_LABELS,
	MEG_PAGE_TITLES,
	MEG_PASSWORD_LABELS,
} from '#app/utils/labels.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { PasswordAndConfirmPasswordSchema } from '#app/utils/user-validation.ts'
import { megZodErrorMap } from '../__meg-text.ts'
import { MegField, MegFormErrors, MegNote } from '../__meg-ui.tsx'
import { type Route } from './+types/password_.create.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.createPassword,
	getSitemapEntries: () => null,
}

const CreatePasswordForm = PasswordAndConfirmPasswordSchema

async function requireNoPassword(userId: string) {
	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})
	if (password) {
		throw redirect('/settings/profile/password')
	}
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	return {}
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	await requireNoPassword(userId)
	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		async: true,
		errorMap: megZodErrorMap,
		schema: CreatePasswordForm.superRefine(async ({ password }, ctx) => {
			const isCommonPassword = await checkIsCommonPassword(password)
			if (isCommonPassword) {
				ctx.addIssue({
					path: ['password'],
					code: 'custom',
					message: MEG_PASSWORD_LABELS.tooCommon,
				})
			}
		}),
	})
	if (submission.status !== 'success') {
		return data(
			{
				result: submission.reply({
					hideFields: ['password', 'confirmPassword'],
				}),
			},
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { password } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			password: {
				create: {
					hash: await getPasswordHash(password),
				},
			},
		},
	})

	return redirect(`/settings/profile`, { status: 302 })
}

export default function CreatePasswordRoute({
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const L = MEG_PASSWORD_LABELS

	const [form, fields] = useForm({
		id: 'password-create-form',
		constraint: getZodConstraint(CreatePasswordForm),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, {
				schema: CreatePasswordForm,
				errorMap: megZodErrorMap,
			})
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<Form
			method="POST"
			{...getFormProps(form)}
			className="mx-auto flex max-w-md flex-col gap-4"
		>
			<MegNote>{L.createIntro}</MegNote>
			<MegField
				label={L.next}
				inputProps={{
					...getInputProps(fields.password, { type: 'password' }),
					autoComplete: 'new-password',
					enterKeyHint: 'next',
				}}
				errors={fields.password.errors}
			/>
			<MegField
				label={L.confirm}
				inputProps={{
					...getInputProps(fields.confirmPassword, {
						type: 'password',
					}),
					autoComplete: 'new-password',
					enterKeyHint: 'done',
				}}
				errors={fields.confirmPassword.errors}
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
					{L.create}
				</StatusButton>
			</div>
		</Form>
	)
}
