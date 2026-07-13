import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import * as E from '@react-email/components'
import { data, redirect, Link, useFetcher } from 'react-router'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { AuthLayout } from '#app/components/auth-layout.tsx'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { checkHoneypot } from '#app/utils/honeypot.server.ts'
import { EmailSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/forgot-password.ts'
import { prepareVerification } from './verify.server.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const ForgotPasswordSchema = z.object({
	usernameOrEmail: z.union([EmailSchema, UsernameSchema]),
})

export async function action({ request }: Route.ActionArgs) {
	const formData = await request.formData()
	await checkHoneypot(formData)
	const submission = await parseWithZod(formData, {
		schema: ForgotPasswordSchema.superRefine(async (data, ctx) => {
			const user = await prisma.user.findFirst({
				where: {
					OR: [
						{ email: data.usernameOrEmail },
						{ username: data.usernameOrEmail },
					],
				},
				select: { id: true },
			})
			if (!user) {
				ctx.addIssue({
					path: ['usernameOrEmail'],
					code: z.ZodIssueCode.custom,
					message: 'No user exists with this username or email',
				})
				return
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
	const { usernameOrEmail } = submission.value

	const user = await prisma.user.findFirstOrThrow({
		where: { OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }] },
		select: { email: true, username: true },
	})

	const { verifyUrl, redirectTo, otp } = await prepareVerification({
		period: 10 * 60,
		request,
		type: 'reset-password',
		target: usernameOrEmail,
	})

	const response = await sendEmail({
		to: user.email,
		subject: `Trainm8 Password Reset`,
		react: (
			<ForgotPasswordEmail onboardingUrl={verifyUrl.toString()} otp={otp} />
		),
	})

	if (response.status === 'success') {
		return redirect(redirectTo.toString())
	} else {
		return data(
			{ result: submission.reply({ formErrors: [response.error.message] }) },
			{ status: 500 },
		)
	}
}

function ForgotPasswordEmail({
	onboardingUrl,
	otp,
}: {
	onboardingUrl: string
	otp: string
}) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Trainm8 Password Reset</E.Text>
				</h1>
				<p>
					<E.Text>
						Here's your verification code: <strong>{otp}</strong>
					</E.Text>
				</p>
				<p>
					<E.Text>Or click the link:</E.Text>
				</p>
				<E.Link href={onboardingUrl}>{onboardingUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

export const meta: Route.MetaFunction = () => {
	return [{ title: 'Password Recovery | Trainm8' }]
}

export default function ForgotPasswordRoute() {
	const forgotPassword = useFetcher<typeof action>()

	const [form, fields] = useForm({
		id: 'forgot-password-form',
		constraint: getZodConstraint(ForgotPasswordSchema),
		lastResult: forgotPassword.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ForgotPasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<AuthLayout
			title="Forgot Password"
			subtitle="No worries, we'll send you reset instructions."
		>
			<forgotPassword.Form
				method="POST"
				className="space-y-4"
				{...getFormProps(form)}
			>
				<HoneypotInputs />
				<Field
					labelProps={{
						htmlFor: fields.usernameOrEmail.id,
						children: 'Username or Email',
					}}
					inputProps={{
						autoFocus: true,
						...getInputProps(fields.usernameOrEmail, { type: 'text' }),
					}}
					errors={fields.usernameOrEmail.errors}
				/>
				<ErrorList errors={form.errors} id={form.errorId} />

				<StatusButton
					className="w-full"
					status={
						forgotPassword.state === 'submitting'
							? 'pending'
							: (form.status ?? 'idle')
					}
					type="submit"
					disabled={forgotPassword.state !== 'idle'}
				>
					Recover password
				</StatusButton>
			</forgotPassword.Form>
			<div className="text-center">
				<Link
					to="/login"
					className={buttonVariants({ variant: 'link', size: 'sm' })}
				>
					Back to Login
				</Link>
			</div>
		</AuthLayout>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
