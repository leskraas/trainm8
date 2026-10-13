/**
 * What an import's row on I dag offers (#505 stories 80–82): the "hva var
 * dette?" question when the app was unsure, _Angre kobling_ / _Koble igjen_,
 * and _Gjort_ by hand. Siblings of the row's link, under it, as quiet as the
 * row's other actions (`AnnetAction`, `ReleaseAction`), each a conform form
 * posting to its owner-scoped resource route. The home loader revalidates
 * after each, so the row itself is the confirmation: the ekstra goes, the
 * plan's session turns done, the question disappears.
 *
 * _Gjort_ and a link answer also land as the composer's writes do (ADR 0088,
 * amended): a toast saying what changed, the row tinted, and _Angre_ on both
 * for as long as the toast stays — posting the token the write's reply
 * carried back to its own route (`useLandingWatch`). A reply with no token (the
 * write folded something an undo cannot unwind) lands without _Angre_.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { useState } from 'react'
import { useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { buttonVariants } from '#app/components/ui/button.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type action as importLinkAction } from '#app/routes/resources/import-link.tsx'
import { type action as sessionDoneAction } from '#app/routes/resources/session-done.tsx'
import {
	IMPORT_LINK_ACTION,
	ImportLinkActionSchema,
	SESSION_DONE_ACTION,
	SessionDoneSchema,
} from '#app/utils/import-link-schema.ts'
import {
	ANGRE_REST_LABELS,
	IMPORT_LINK_LABELS,
	MARK_DONE_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { type LandedWrite, useLandingWatch } from './composer-context.tsx'
import { type TimelineImportLink } from './presenter.ts'
import { TITLE_INSET, TITLE_INSET_BOX } from './row-inset.ts'

const ACTION_TEXT =
	'text-muted-foreground text-caption pressable flex min-h-11 flex-none items-center gap-1 underline decoration-dotted underline-offset-[3px]'

/** The one import offer a row carries, by kind. */
export function ImportLinkAction({
	link,
	inline = false,
}: {
	link: TimelineImportLink
	/** Inside the row's glyph popover (ADR 0086), not under the row. */
	inline?: boolean
}) {
	if (link.kind === 'ask') return <ImportQuestion ask={link} />
	return (
		<div
			className={
				inline
					? 'flex flex-wrap items-center gap-x-2'
					: cn('-mt-1 flex flex-wrap items-center gap-x-2 pr-4', TITLE_INSET)
			}
		>
			<ImportLinkButton
				intent={link.kind === 'undo' ? 'undo' : 'relink'}
				importId={link.importId}
				label={link.actionLabel}
				ariaLabel={link.label}
				icon={link.kind === 'undo' ? 'reset' : 'link-2'}
				className={ACTION_TEXT}
			/>
			<span className="text-caption text-muted-foreground min-w-0 flex-1 font-normal">
				{link.note}
			</span>
		</div>
	)
}

/**
 * "Hva var dette?" — asked only when the app was unsure (#505 story 80). Each
 * planned session that fits is an answer, then _En ekstra økt_, then Annet
 * where it would change a number. One tap answers; nothing is asked twice.
 */
function ImportQuestion({
	ask,
}: {
	ask: Extract<TimelineImportLink, { kind: 'ask' }>
}) {
	const headingId = `import-question-${ask.importId}`
	return (
		<section
			role="group"
			aria-labelledby={headingId}
			data-import-question={ask.importId}
			className={cn(
				'bg-muted/60 mr-4 mb-3 rounded-3xl px-3.5 py-3',
				TITLE_INSET_BOX,
			)}
		>
			<p id={headingId} className="text-callout text-foreground font-semibold">
				{ask.question}
			</p>
			<p className="text-footnote text-muted-foreground mt-0.5 [text-wrap:pretty]">
				{ask.note}
			</p>
			{/* Real buttons, not loose text (audit D11): the plan's sessions as
			    the answers that matter, the other two quieter. */}
			<div className="mt-2.5 flex flex-wrap items-start gap-2">
				{ask.options.map((option) => (
					<ImportLinkButton
						key={option.sessionId}
						intent="link"
						importId={ask.importId}
						sessionId={option.sessionId}
						title={option.title}
						label={option.label}
						className={cn(
							buttonVariants({ variant: 'outline', size: 'sm' }),
							'h-auto min-h-9 rounded-full py-1.5 text-left [overflow-wrap:anywhere] whitespace-normal',
						)}
					/>
				))}
				<ImportLinkButton
					intent="keep"
					importId={ask.importId}
					label={ask.keepLabel}
					className={cn(
						buttonVariants({ variant: 'ghost', size: 'sm' }),
						'min-h-9 rounded-full',
					)}
				/>
				{ask.annetLabel ? (
					<ImportLinkButton
						intent="annet"
						importId={ask.importId}
						label={ask.annetLabel}
						className={cn(
							buttonVariants({ variant: 'ghost', size: 'sm' }),
							'min-h-9 rounded-full',
						)}
					/>
				) : null}
			</div>
		</section>
	)
}

/**
 * One post to the import route: its own fetcher and conform form, so each
 * button says "Lagrer …" for itself and shows the server's refusal under it.
 */
function ImportLinkButton({
	intent,
	importId,
	sessionId,
	title,
	label,
	ariaLabel,
	icon,
	className,
}: {
	intent: 'link' | 'keep' | 'annet' | 'undo' | 'relink'
	importId: string
	sessionId?: string
	/** The planned session's title, which a link's toast quotes. */
	title?: string
	label: string
	ariaLabel?: string
	icon?: 'reset' | 'link-2'
	className: string
}) {
	const fetcherKey = useLandingKey()
	const watch = useLandingWatch()
	const fetcher = useFetcher<typeof importLinkAction>({ key: fetcherKey })
	const [form, fields] = useForm({
		id: `import-${intent}-${importId}${sessionId ? `-${sessionId}` : ''}`,
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ImportLinkActionSchema })
		},
		defaultValue: { intent, importId, sessionId },
	})
	const formProps = getFormProps(form)
	// Said while in flight and kept once the server agreed, until the
	// revalidated row replaces this one; a refusal puts the button back.
	const sent = fetcher.state !== 'idle' || fetcher.data?.result?.ok === true
	return (
		<fetcher.Form
			method="post"
			action={IMPORT_LINK_ACTION}
			{...formProps}
			onSubmit={(event) => {
				formProps.onSubmit(event)
				// A link lands as every write on I dag does (ADR 0088, amended).
				if (event.defaultPrevented || intent !== 'link' || !watch) return
				watch({
					fetcherKey,
					toWrite: (reply) => linkLanding(reply as ImportLinkReply, title),
				})
			}}
			className="flex flex-col"
		>
			<input {...getInputProps(fields.intent, { type: 'hidden' })} />
			<input {...getInputProps(fields.importId, { type: 'hidden' })} />
			{sessionId ? (
				<input {...getInputProps(fields.sessionId, { type: 'hidden' })} />
			) : null}
			{sent ? (
				<span
					aria-live="polite"
					className="text-caption text-muted-foreground flex min-h-9 items-center"
				>
					{IMPORT_LINK_LABELS.saving}
				</span>
			) : (
				<button type="submit" aria-label={ariaLabel} className={className}>
					{icon ? <Icon name={icon} size="xs" /> : null}
					{label}
				</button>
			)}
			<ErrorList id={form.errorId} errors={form.errors} />
		</fetcher.Form>
	)
}

/**
 * _Gjort_ by hand (#505 story 82): the athlete did it, and the numbers will
 * come from the import. On the row's action line, beside _Lås opp_.
 */
export function MarkDoneAction({
	sessionId,
	title,
	label,
	ariaLabel,
}: {
	sessionId: string
	/** The session's title, which the toast quotes. */
	title: string
	label: string
	ariaLabel: string
}) {
	const fetcherKey = useLandingKey()
	const watch = useLandingWatch()
	const fetcher = useFetcher<typeof sessionDoneAction>({ key: fetcherKey })
	const [form, fields] = useForm({
		id: `done-${sessionId}`,
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SessionDoneSchema })
		},
		defaultValue: { sessionId },
	})
	const formProps = getFormProps(form)
	const sent = fetcher.state !== 'idle' || fetcher.data?.result?.ok === true
	return (
		<fetcher.Form
			method="post"
			action={SESSION_DONE_ACTION}
			{...formProps}
			onSubmit={(event) => {
				formProps.onSubmit(event)
				if (event.defaultPrevented || !watch) return
				watch({
					fetcherKey,
					toWrite: (reply) =>
						markDoneLanding(reply as MarkDoneReply, sessionId, title),
				})
			}}
			className="flex flex-col"
		>
			<input {...getInputProps(fields.sessionId, { type: 'hidden' })} />
			{sent ? (
				<span
					aria-live="polite"
					className="text-muted-foreground flex min-h-11 items-center text-[11px]/[1.35]"
				>
					{MARK_DONE_LABELS.saving}
				</span>
			) : (
				<button type="submit" aria-label={ariaLabel} className={ACTION_TEXT}>
					<Icon name="check" size="xs" />
					{label}
				</button>
			)}
			<ErrorList id={form.errorId} errors={form.errors} />
		</fetcher.Form>
	)
}

type ImportLinkReply = ReturnType<
	typeof useFetcher<typeof importLinkAction>
>['data']
type MarkDoneReply = ReturnType<
	typeof useFetcher<typeof sessionDoneAction>
>['data']

/**
 * One fetcher key per mounted button, so the reply can be read where the
 * landing lives (`ComposerProvider`) after the button has gone, and a button
 * mounted again (a _Gjort_ taken back) starts with no reply of its own.
 */
function useLandingKey(): string {
	const [key] = useState(
		() => `row-write-${Math.random().toString(36).slice(2)}`,
	)
	return key
}

/** A link answer's reply as its landing: the planned session it is on now. */
function linkLanding(
	reply: ImportLinkReply,
	title: string | undefined,
): LandedWrite | null {
	const result = reply?.result
	if (!result?.ok) return null
	return {
		sessionId: result.sessionId,
		line: ANGRE_REST_LABELS.linked,
		title,
		undo: result.undo
			? {
					action: IMPORT_LINK_ACTION,
					post: { intent: 'undo-answer', ...result.undo },
				}
			: null,
	}
}

/** _Gjort_'s reply as its landing: the session it marked. */
function markDoneLanding(
	reply: MarkDoneReply,
	sessionId: string,
	title: string,
): LandedWrite | null {
	const result = reply?.result
	if (!result?.ok) return null
	const token = result.undo
	return {
		sessionId,
		line: ANGRE_REST_LABELS.markedDone,
		title,
		undo: token
			? {
					action: SESSION_DONE_ACTION,
					post: {
						intent: 'undo',
						sessionId: token.sessionId,
						markedAt: token.markedAt,
						status: token.status,
						markedDoneAt: token.markedDoneAt ?? '',
					},
				}
			: null,
	}
}
