import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { invariantResponse } from '@epic-web/invariant'
import { parseFormData } from '@mjackson/form-data-parser'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useState } from 'react'
import { data, redirect, Form, useNavigation } from 'react-router'
import { z } from 'zod/v3'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Button, buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	MEG_COMMON_LABELS,
	MEG_PAGE_TITLES,
	MEG_PHOTO_LABELS,
} from '#app/utils/labels.ts'
import {
	cn,
	getUserImgSrc,
	useDoubleCheck,
	useIsPending,
} from '#app/utils/misc.tsx'
import { uploadProfileImage } from '#app/utils/storage.server.ts'
import { MegFormErrors } from '../__meg-ui.tsx'
import { type Route } from './+types/photo.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: MEG_PAGE_TITLES.photo,
	getSitemapEntries: () => null,
}

const MAX_SIZE = 1024 * 1024 * 3 // 3MB

const DeleteImageSchema = z.object({
	intent: z.literal('delete'),
})

const NewImageSchema = z.object({
	intent: z.literal('submit'),
	photoFile: z
		.instanceof(File)
		.refine((file) => file.size > 0, MEG_PHOTO_LABELS.required)
		.refine((file) => file.size <= MAX_SIZE, MEG_PHOTO_LABELS.tooLarge),
})

const PhotoFormSchema = z.discriminatedUnion('intent', [
	DeleteImageSchema,
	NewImageSchema,
])

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			image: { select: { objectKey: true } },
		},
	})
	invariantResponse(user, 'User not found', { status: 404 })
	return { user }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)

	const formData = await parseFormData(request, { maxFileSize: MAX_SIZE })
	const submission = await parseWithZod(formData, {
		schema: PhotoFormSchema.transform(async (data) => {
			if (data.intent === 'delete') return { intent: 'delete' }
			if (data.photoFile.size <= 0) return z.NEVER
			return {
				intent: data.intent,
				image: {
					objectKey: await uploadProfileImage(userId, data.photoFile),
				},
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

	const { image, intent } = submission.value

	if (intent === 'delete') {
		await prisma.userImage.deleteMany({ where: { userId } })
		return redirect('/settings/profile')
	}

	await prisma.$transaction(async ($prisma) => {
		await $prisma.userImage.deleteMany({ where: { userId } })
		await $prisma.user.update({
			where: { id: userId },
			data: { image: { create: image } },
		})
	})

	return redirect('/settings/profile')
}

export default function PhotoRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const doubleCheckDeleteImage = useDoubleCheck()

	const navigation = useNavigation()

	const [form, fields] = useForm({
		id: 'profile-photo',
		constraint: getZodConstraint(PhotoFormSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PhotoFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	const isPending = useIsPending()
	const pendingIntent = isPending ? navigation.formData?.get('intent') : null
	const lastSubmissionIntent = fields.intent.value

	const [newImageSrc, setNewImageSrc] = useState<string | null>(null)

	return (
		<div>
			<Form
				method="POST"
				encType="multipart/form-data"
				className="flex flex-col items-center justify-center gap-8"
				onReset={() => setNewImageSrc(null)}
				{...getFormProps(form)}
			>
				<img
					src={
						newImageSrc ??
						(loaderData.user
							? getUserImgSrc(loaderData.user.image?.objectKey)
							: '')
					}
					className="bg-muted size-40 rounded-full object-cover"
					alt={loaderData.user?.name ?? loaderData.user?.username}
				/>
				<MegFormErrors
					errors={fields.photoFile.errors}
					id={fields.photoFile.errorId}
				/>
				<div className="flex flex-wrap justify-center gap-3">
					{/*
						We're doing some kinda odd things to make it so this works well
						without JavaScript. Basically, we're using CSS to ensure the right
						buttons show up based on the input's "valid" state (whether or not
						an image has been selected). Progressive enhancement FTW!
					*/}
					<input
						{...getInputProps(fields.photoFile, { type: 'file' })}
						accept="image/*"
						className="peer sr-only"
						required
						tabIndex={newImageSrc ? -1 : 0}
						onChange={(e) => {
							const file = e.currentTarget.files?.[0]
							if (file) {
								const reader = new FileReader()
								reader.onload = (event) => {
									setNewImageSrc(event.target?.result?.toString() ?? null)
								}
								reader.readAsDataURL(file)
							}
						}}
					/>
					<label
						className={cn(
							buttonVariants({ variant: 'default' }),
							'cursor-pointer peer-valid:hidden peer-focus-visible:ring-3',
						)}
						htmlFor={fields.photoFile.id}
					>
						<Icon name="pencil-1" data-icon="inline-start" />
						{MEG_PHOTO_LABELS.choose}
					</label>
					<StatusButton
						name="intent"
						value="submit"
						type="submit"
						className="peer-invalid:hidden"
						status={
							pendingIntent === 'submit'
								? 'pending'
								: lastSubmissionIntent === 'submit'
									? (form.status ?? 'idle')
									: 'idle'
						}
					>
						{MEG_PHOTO_LABELS.save}
					</StatusButton>
					<Button
						variant="outline"
						className="peer-invalid:hidden"
						{...form.reset.getButtonProps()}
					>
						<Icon name="reset" data-icon="inline-start" />
						{MEG_PHOTO_LABELS.reset}
					</Button>
					{loaderData.user.image ? (
						<StatusButton
							className="peer-valid:hidden"
							variant="destructive"
							{...doubleCheckDeleteImage.getButtonProps({
								type: 'submit',
								name: 'intent',
								value: 'delete',
							})}
							status={
								pendingIntent === 'delete'
									? 'pending'
									: lastSubmissionIntent === 'delete'
										? (form.status ?? 'idle')
										: 'idle'
							}
						>
							<Icon name="trash" data-icon="inline-start" />
							{doubleCheckDeleteImage.doubleCheck
								? MEG_COMMON_LABELS.areYouSure
								: MEG_PHOTO_LABELS.delete}
						</StatusButton>
					) : null}
				</div>
				<MegFormErrors errors={form.errors} />
			</Form>
		</div>
	)
}
