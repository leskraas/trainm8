/**
 * The parts every page behind Meg is built from (round 2, ADR 0081/0085), so
 * the profile, the security pages and "Trening og terskler" read as one place
 * with the Meg hub they open from:
 *
 * - **`MegSection` / `MegRows` / `MegRow`** — the hub's own section heading
 *   and list row, a row of a list pressing as a tint (a whole-width row that
 *   scales reads as the page moving), at least 44px tall.
 * - **`MegField` / `MegSelectField`** — a label, a 16px input on every pointer
 *   (the coarse-pointer floor already holds on phones; the desktop's 14px is
 *   lifted too so the field reads the same as the words around it), and the
 *   field's errors **as words at the field**, in Norwegian (`nbErrors`), at the
 *   footnote step rather than the old 10px.
 * - **`MegFormErrors`** — the form's own errors, said once under the fields.
 * - **`MegNote`** — the muted sentence under a heading or a field.
 */
import { type FieldMetadata, useInputControl } from '@conform-to/react'
import { useId } from 'react'
import { Link } from 'react-router'
import { Icon, type IconName } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { cn } from '#app/utils/misc.tsx'
import { MeSectionHeading } from '../__me-form-records.tsx'
import { nbErrors } from './__meg-text.ts'

export function MegSection({
	id,
	title,
	children,
	className,
}: {
	id: string
	title: string
	children: React.ReactNode
	className?: string
}) {
	return (
		<section aria-labelledby={id} className={className}>
			<MeSectionHeading id={id}>{title}</MeSectionHeading>
			{children}
		</section>
	)
}

/** A list of rows on the card surface, hairlines between them. */
export function MegRows({
	children,
	label,
}: {
	children: React.ReactNode
	/** The list's accessible name, where no heading names it. */
	label?: string
}) {
	return (
		<ul
			aria-label={label}
			className="bg-card ring-foreground/5 dark:ring-foreground/10 divide-border/70 divide-y rounded-4xl px-4 shadow-xs ring-1"
		>
			{children}
		</ul>
	)
}

const ROW_CLASS =
	'active:bg-muted/60 duration-press -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-3 text-left transition-colors ease-out'

function RowBody({
	icon,
	title,
	detail,
	tone,
	trailing,
}: {
	icon: IconName
	title: React.ReactNode
	detail?: React.ReactNode
	tone?: 'destructive'
	trailing?: React.ReactNode
}) {
	return (
		<>
			<Icon
				name={icon}
				size="md"
				className={cn(
					'shrink-0',
					tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
				)}
				aria-hidden="true"
			/>
			<span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
				<span
					className={cn(
						'text-callout block',
						tone === 'destructive' && 'text-destructive',
					)}
				>
					{title}
				</span>
				{detail ? (
					<span className="text-muted-foreground text-footnote block">
						{detail}
					</span>
				) : null}
			</span>
			{trailing ?? (
				<Icon
					name="chevron-right"
					size="sm"
					className="text-muted-foreground shrink-0"
					aria-hidden="true"
				/>
			)}
		</>
	)
}

/** A row that opens a page (or, with `reloadDocument`, a download). */
export function MegRow({
	to,
	icon,
	title,
	detail,
	reloadDocument,
	download,
	trailing,
}: {
	to: string
	icon: IconName
	title: React.ReactNode
	detail?: React.ReactNode
	reloadDocument?: boolean
	download?: string
	trailing?: React.ReactNode
}) {
	return (
		<li>
			<Link
				to={to}
				prefetch={reloadDocument ? undefined : 'intent'}
				reloadDocument={reloadDocument}
				download={download}
				className={ROW_CLASS}
			>
				<RowBody
					icon={icon}
					title={title}
					detail={detail}
					trailing={trailing}
				/>
			</Link>
		</li>
	)
}

/** A row that is a submit button, for an action that stays on the page. */
export function MegButtonRow({
	icon,
	title,
	detail,
	tone,
	...props
}: Omit<React.ComponentProps<'button'>, 'title'> & {
	icon: IconName
	title: React.ReactNode
	detail?: React.ReactNode
	tone?: 'destructive'
}) {
	return (
		<button {...props} className={ROW_CLASS}>
			<RowBody
				icon={icon}
				title={title}
				detail={detail}
				tone={tone}
				trailing={<span aria-hidden="true" />}
			/>
		</button>
	)
}

/** A muted sentence: under a heading, under a field, at the foot of a page. */
export function MegNote({
	children,
	className,
	id,
}: {
	children: React.ReactNode
	className?: string
	id?: string
}) {
	return (
		<p id={id} className={cn('text-footnote text-muted-foreground', className)}>
			{children}
		</p>
	)
}

/** A field's errors, as words beside it. */
function FieldErrors({ id, errors }: { id: string; errors: string[] }) {
	if (errors.length === 0) return null
	return (
		<div
			id={id}
			className="text-footnote text-destructive flex flex-col gap-0.5"
		>
			{errors.map((error) => (
				<p key={error}>{error}</p>
			))}
		</div>
	)
}

export function MegField({
	label,
	inputProps,
	errors,
	hint,
	className,
}: {
	label: React.ReactNode
	inputProps: React.ComponentProps<'input'>
	errors?: ReadonlyArray<string | null | undefined> | null
	hint?: React.ReactNode
	className?: string
}) {
	const fallbackId = useId()
	const id = inputProps.id ?? fallbackId
	const words = nbErrors(errors)
	const errorId = `${id}-error`
	const hintId = `${id}-hint`
	const describedBy =
		[words.length ? errorId : null, hint ? hintId : null]
			.filter(Boolean)
			.join(' ') || undefined
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<Label htmlFor={id} className="text-footnote font-medium">
				{label}
			</Label>
			<Input
				{...inputProps}
				id={id}
				aria-invalid={words.length ? true : undefined}
				aria-describedby={describedBy}
				className={cn('md:text-base', inputProps.className)}
			/>
			<FieldErrors id={errorId} errors={words} />
			{hint ? <MegNote id={hintId}>{hint}</MegNote> : null}
		</div>
	)
}

export function MegSelectField({
	meta,
	label,
	items,
	errors,
	className,
}: {
	meta: FieldMetadata<string>
	label: React.ReactNode
	items: Array<{ value: string; label: string }>
	errors?: ReadonlyArray<string | null | undefined> | null
	className?: string
}) {
	const control = useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue: meta.initialValue,
	})
	const fallbackId = useId()
	const id = meta.id ?? fallbackId
	const words = nbErrors(errors ?? meta.errors)
	const errorId = `${id}-error`
	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<Label htmlFor={id} className="text-footnote font-medium">
				{label}
			</Label>
			<Select
				items={items}
				value={control.value ?? ''}
				onValueChange={(value) => control.change((value as string) ?? '')}
			>
				<SelectTrigger
					id={id}
					className="w-full md:text-base"
					aria-invalid={words.length ? true : undefined}
					aria-describedby={words.length ? errorId : undefined}
					onFocus={() => control.focus()}
					onBlur={() => control.blur()}
				>
					<SelectValue>
						{(value) => items.find((item) => item.value === value)?.label}
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					{items.map((item) => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<FieldErrors id={errorId} errors={words} />
		</div>
	)
}

/** The form's own errors (not a field's), said once under the fields. */
export function MegFormErrors({
	id,
	errors,
}: {
	id?: string
	errors?: ReadonlyArray<string | null | undefined> | null
}) {
	const words = nbErrors(errors)
	if (words.length === 0) return null
	return (
		<div id={id} role="alert" className="text-footnote text-destructive">
			{words.map((error) => (
				<p key={error}>{error}</p>
			))}
		</div>
	)
}

/** A one-line result under a form: `role=status` for a save, `alert` for a refusal. */
export function MegResult({
	result,
}: {
	result:
		| { ok: true; message: string }
		| { ok: false; error: string }
		| null
		| undefined
}) {
	if (!result) return null
	return result.ok ? (
		<p role="status" className="text-footnote">
			{result.message}
		</p>
	) : (
		<p role="alert" className="text-footnote text-destructive">
			{result.error}
		</p>
	)
}
