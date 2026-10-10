/**
 * What an import's row on I dag offers (#505 stories 80–82): the "hva var
 * dette?" question when the app was unsure, _Angre kobling_ / _Koble igjen_,
 * and _Gjort_ by hand. Siblings of the row's link, under it, as quiet as the
 * row's other actions (`AnnetAction`, `ReleaseAction`), each a conform form
 * posting to its owner-scoped resource route. The home loader revalidates
 * after each, so the row itself is the confirmation: the ekstra goes, the
 * plan's session turns done, the question disappears.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useFetcher } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { type action as importLinkAction } from '#app/routes/resources/import-link.tsx'
import { type action as sessionDoneAction } from '#app/routes/resources/session-done.tsx'
import {
	IMPORT_LINK_ACTION,
	ImportLinkActionSchema,
	SESSION_DONE_ACTION,
	SessionDoneSchema,
} from '#app/utils/import-link-schema.ts'
import { IMPORT_LINK_LABELS, MARK_DONE_LABELS } from '#app/utils/labels.ts'
import { type TimelineImportLink } from './presenter.ts'

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
					: '-mt-1 flex flex-wrap items-center gap-x-2 pr-4 pl-[103px]'
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
			<span className="text-muted-foreground min-w-0 flex-1 text-[11px]/[1.35]">
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
			className="border-border/70 mr-4 mb-3 ml-[103px] rounded-2xl border px-3 py-2.5"
		>
			<p
				id={headingId}
				className="text-foreground text-[12.5px]/[1.3] font-bold"
			>
				{ask.question}
			</p>
			<p className="text-muted-foreground mt-0.5 text-[11px]/[1.4] [text-wrap:pretty]">
				{ask.note}
			</p>
			<div className="mt-1.5 flex flex-col items-start">
				{ask.options.map((option) => (
					<ImportLinkButton
						key={option.sessionId}
						intent="link"
						importId={ask.importId}
						sessionId={option.sessionId}
						label={option.label}
						className="text-primary flex min-h-11 items-center text-left text-[12px]/[1.3] font-semibold"
					/>
				))}
				<ImportLinkButton
					intent="keep"
					importId={ask.importId}
					label={ask.keepLabel}
					className="text-muted-foreground flex min-h-11 items-center text-[12px]/[1.3] font-semibold"
				/>
				{ask.annetLabel ? (
					<ImportLinkButton
						intent="annet"
						importId={ask.importId}
						label={ask.annetLabel}
						className="text-muted-foreground flex min-h-11 items-center text-[12px]/[1.3] font-semibold"
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
	label,
	ariaLabel,
	icon,
	className,
}: {
	intent: 'link' | 'keep' | 'annet' | 'undo' | 'relink'
	importId: string
	sessionId?: string
	label: string
	ariaLabel?: string
	icon?: 'reset' | 'link-2'
	className: string
}) {
	const fetcher = useFetcher<typeof importLinkAction>()
	const [form, fields] = useForm({
		id: `import-${intent}-${importId}${sessionId ? `-${sessionId}` : ''}`,
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ImportLinkActionSchema })
		},
		defaultValue: { intent, importId, sessionId },
	})
	// Said while in flight and kept once the server agreed, until the
	// revalidated row replaces this one; a refusal puts the button back.
	const sent = fetcher.state !== 'idle' || fetcher.data?.result?.ok === true
	return (
		<fetcher.Form
			method="post"
			action={IMPORT_LINK_ACTION}
			{...getFormProps(form)}
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
					className="text-muted-foreground flex min-h-11 items-center text-[11px]/[1.35]"
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
	label,
	ariaLabel,
}: {
	sessionId: string
	label: string
	ariaLabel: string
}) {
	const fetcher = useFetcher<typeof sessionDoneAction>()
	const [form, fields] = useForm({
		id: `done-${sessionId}`,
		lastResult: fetcher.data?.submission,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SessionDoneSchema })
		},
		defaultValue: { sessionId },
	})
	const sent = fetcher.state !== 'idle' || fetcher.data?.result?.ok === true
	return (
		<fetcher.Form
			method="post"
			action={SESSION_DONE_ACTION}
			{...getFormProps(form)}
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
