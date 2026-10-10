import { invariant } from '@epic-web/invariant'
import * as E from '@react-email/components'
import { data } from 'react-router'
import {
	requireRecentVerification,
	type VerifyFunctionArgs,
} from '#app/routes/_auth/verify.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { MEG_EMAIL_LABELS } from '#app/utils/labels.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { verifySessionStorage } from '#app/utils/verification.server.ts'
import { newEmailAddressSessionKey } from './change-email'

export async function handleVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	await requireRecentVerification(request)
	invariant(
		submission.status === 'success',
		'Submission should be successful by now',
	)

	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const newEmail = verifySession.get(newEmailAddressSessionKey)
	if (!newEmail) {
		return data(
			{
				result: submission.reply({
					formErrors: [MEG_EMAIL_LABELS.sameDevice],
				}),
			},
			{ status: 400 },
		)
	}
	const preUpdateUser = await prisma.user.findFirstOrThrow({
		select: { email: true },
		where: { id: submission.value.target },
	})
	const user = await prisma.user.update({
		where: { id: submission.value.target },
		select: { id: true, email: true, username: true },
		data: { email: newEmail },
	})

	void sendEmail({
		to: preUpdateUser.email,
		subject: MEG_EMAIL_LABELS.noticeSubject,
		react: <EmailChangeNoticeEmail userId={user.id} />,
	})

	return redirectWithToast(
		'/settings/profile',
		{
			title: MEG_EMAIL_LABELS.changedTitle,
			type: 'success',
			description: MEG_EMAIL_LABELS.changedBody(user.email),
		},
		{
			headers: {
				'set-cookie': await verifySessionStorage.destroySession(verifySession),
			},
		},
	)
}

export function EmailChangeEmail({
	verifyUrl,
	otp,
}: {
	verifyUrl: string
	otp: string
}) {
	return (
		<E.Html lang="nb" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>{MEG_EMAIL_LABELS.codeHeading}</E.Text>
				</h1>
				<p>
					<E.Text>
						{MEG_EMAIL_LABELS.codeLine} <strong>{otp}</strong>
					</E.Text>
				</p>
				<p>
					<E.Text>{MEG_EMAIL_LABELS.codeLink}</E.Text>
				</p>
				<E.Link href={verifyUrl}>{verifyUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

function EmailChangeNoticeEmail({ userId }: { userId: string }) {
	return (
		<E.Html lang="nb" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>{MEG_EMAIL_LABELS.noticeHeading}</E.Text>
				</h1>
				<p>
					<E.Text>{MEG_EMAIL_LABELS.noticeBody}</E.Text>
				</p>
				<p>
					<E.Text>{MEG_EMAIL_LABELS.noticeIgnore}</E.Text>
				</p>
				<p>
					<E.Text>{MEG_EMAIL_LABELS.noticeAccount(userId)}</E.Text>
				</p>
			</E.Container>
		</E.Html>
	)
}
