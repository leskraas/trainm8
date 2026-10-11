import { type FieldMetadata, useInputControl } from '@conform-to/react'
import { REGEXP_ONLY_DIGITS_AND_CHARS, type OTPInputProps } from 'input-otp'
import React, { useId, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import { Checkbox, type CheckboxProps } from './ui/checkbox.tsx'
import {
	Field as FormField,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
	FieldTitle,
} from './ui/field.tsx'
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from './ui/input-otp.tsx'
import { Input } from './ui/input.tsx'
import { RadioGroup, RadioGroupItem } from './ui/radio-group.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select.tsx'
import { Textarea } from './ui/textarea.tsx'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group.tsx'

export type ListOfErrors = Array<string | null | undefined> | null | undefined

/**
 * A field's error as the athlete reads it: the footnote step (13px), in
 * `foreground-destructive` — the red made for text, 6.3:1 on the card in light
 * and 4.8:1 in dark (AA). `destructive` is the fill red and measures 4.4:1 on
 * the light page, so it is not used for words. Was 10px, below anything
 * readable (round-2 audit D7).
 */
const ERROR_TEXT = 'text-footnote text-foreground-destructive'

function getErrorsToRender(errors?: ListOfErrors) {
	return errors?.filter(Boolean) ?? []
}

function InlineFieldErrors({
	errorId,
	errors,
}: {
	errorId?: string
	errors: string[]
}) {
	if (!errors.length) return null

	return (
		<div className="pt-1">
			{errors.map((error, index) => (
				<FieldDescription
					key={`${error}-${index}`}
					id={index === 0 ? errorId : undefined}
					className={ERROR_TEXT}
				>
					{error}
				</FieldDescription>
			))}
		</div>
	)
}

export function ErrorList({
	id,
	errors,
}: {
	errors?: ListOfErrors
	id?: string
}) {
	const errorsToRender = getErrorsToRender(errors)
	if (!errorsToRender?.length) return null
	return (
		<ul id={id} className="flex flex-col gap-1">
			{errorsToRender.map((e) => (
				<li key={e} className={ERROR_TEXT}>
					{e}
				</li>
			))}
		</ul>
	)
}

export function Field({
	labelProps,
	inputProps,
	errors,
	className,
}: {
	labelProps: React.LabelHTMLAttributes<HTMLLabelElement>
	inputProps: React.InputHTMLAttributes<HTMLInputElement>
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = inputProps.id ?? fallbackId
	const errorsToRender = getErrorsToRender(errors)
	const errorId = errorsToRender.length ? `${id}-error` : undefined
	return (
		<FieldGroup className={className}>
			<FormField
				data-invalid={errorsToRender.length ? true : undefined}
				data-disabled={inputProps.disabled ? true : undefined}
			>
				<FieldLabel htmlFor={id} {...labelProps} />
				<FieldContent>
					<Input
						id={id}
						aria-invalid={errorId ? true : undefined}
						aria-describedby={errorId}
						{...inputProps}
					/>
					<InlineFieldErrors errorId={errorId} errors={errorsToRender} />
				</FieldContent>
			</FormField>
		</FieldGroup>
	)
}

export function SelectField({
	meta,
	labelProps,
	items,
	placeholder,
	size = 'default',
	triggerClassName,
	className,
	errors,
}: {
	meta: FieldMetadata<string>
	labelProps: { children: React.ReactNode; className?: string }
	items: Array<{ value: string; label: React.ReactNode }>
	placeholder?: string
	size?: 'sm' | 'default'
	triggerClassName?: string
	className?: string
	errors?: ListOfErrors
}) {
	const control = useInputControl({
		key: meta.key,
		name: meta.name,
		formId: meta.formId,
		initialValue: meta.initialValue,
	})
	const fallbackId = useId()
	const id = meta.id ?? fallbackId
	const fieldErrors = errors ?? (meta.errors as ListOfErrors)
	const errorsToRender = getErrorsToRender(fieldErrors)
	const errorId = errorsToRender.length ? `${id}-error` : undefined

	return (
		<div className={cn('space-y-2', className)}>
			<label htmlFor={id} className={labelProps.className}>
				{labelProps.children}
			</label>
			<Select
				value={control.value ?? ''}
				onValueChange={(value) => control.change((value as string) ?? '')}
			>
				<SelectTrigger
					id={id}
					size={size}
					className={cn('w-full', triggerClassName)}
					aria-invalid={errorId ? true : undefined}
					aria-describedby={errorId}
					onFocus={() => control.focus()}
					onBlur={() => control.blur()}
				>
					<SelectValue placeholder={placeholder}>
						{(value) => {
							const selected = items.find((item) => item.value === value)
							return selected ? selected.label : placeholder
						}}
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
			<ErrorList id={errorId} errors={errorsToRender} />
		</div>
	)
}

export function OTPField({
	labelProps,
	inputProps,
	errors,
	className,
}: {
	labelProps: React.LabelHTMLAttributes<HTMLLabelElement>
	inputProps: Partial<OTPInputProps & { render: never }>
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = inputProps.id ?? fallbackId
	const errorsToRender = getErrorsToRender(errors)
	const errorId = errorsToRender.length ? `${id}-error` : undefined
	return (
		<FieldGroup className={className}>
			<FormField
				data-invalid={errorsToRender.length ? true : undefined}
				data-disabled={inputProps.disabled ? true : undefined}
			>
				<FieldLabel htmlFor={id} {...labelProps} />
				<FieldContent>
					<InputOTP
						pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
						maxLength={6}
						id={id}
						aria-invalid={errorId ? true : undefined}
						aria-describedby={errorId}
						{...inputProps}
					>
						<InputOTPGroup>
							<InputOTPSlot index={0} />
							<InputOTPSlot index={1} />
							<InputOTPSlot index={2} />
						</InputOTPGroup>
						<InputOTPSeparator />
						<InputOTPGroup>
							<InputOTPSlot index={3} />
							<InputOTPSlot index={4} />
							<InputOTPSlot index={5} />
						</InputOTPGroup>
					</InputOTP>
					<InlineFieldErrors errorId={errorId} errors={errorsToRender} />
				</FieldContent>
			</FormField>
		</FieldGroup>
	)
}

export function TextareaField({
	labelProps,
	textareaProps,
	errors,
	className,
}: {
	labelProps: React.LabelHTMLAttributes<HTMLLabelElement>
	textareaProps: React.TextareaHTMLAttributes<HTMLTextAreaElement>
	errors?: ListOfErrors
	className?: string
}) {
	const fallbackId = useId()
	const id = textareaProps.id ?? textareaProps.name ?? fallbackId
	const errorsToRender = getErrorsToRender(errors)
	const errorId = errorsToRender.length ? `${id}-error` : undefined
	return (
		<FieldGroup className={className}>
			<FormField
				data-invalid={errorsToRender.length ? true : undefined}
				data-disabled={textareaProps.disabled ? true : undefined}
			>
				<FieldLabel htmlFor={id} {...labelProps} />
				<FieldContent>
					<Textarea
						id={id}
						aria-invalid={errorId ? true : undefined}
						aria-describedby={errorId}
						{...textareaProps}
					/>
					<InlineFieldErrors errorId={errorId} errors={errorsToRender} />
				</FieldContent>
			</FormField>
		</FieldGroup>
	)
}

export function CheckboxField({
	labelProps,
	buttonProps,
	errors,
	className,
}: {
	labelProps: React.ComponentProps<'label'>
	buttonProps: CheckboxProps & {
		name: string
		form: string
		value?: string
	}
	errors?: ListOfErrors
	className?: string
}) {
	const { key, defaultChecked, ...checkboxProps } = buttonProps
	const fallbackId = useId()
	const checkedValue = buttonProps.value ?? 'on'
	const input = useInputControl({
		key,
		name: buttonProps.name,
		formId: buttonProps.form,
		initialValue: defaultChecked ? checkedValue : undefined,
	})
	const id = buttonProps.id ?? fallbackId
	const errorsToRender = getErrorsToRender(errors)
	const errorId = errorsToRender.length ? `${id}-error` : undefined

	return (
		<FieldGroup className={className}>
			<FormField
				orientation="horizontal"
				data-invalid={errorsToRender.length ? true : undefined}
				data-disabled={buttonProps.disabled ? true : undefined}
			>
				<Checkbox
					{...checkboxProps}
					id={id}
					aria-invalid={errorId ? true : undefined}
					aria-describedby={errorId}
					checked={input.value === checkedValue}
					onCheckedChange={(state, event) => {
						input.change(state.valueOf() ? checkedValue : '')
						buttonProps.onCheckedChange?.(state, event)
					}}
					onFocus={(event) => {
						input.focus()
						buttonProps.onFocus?.(event)
					}}
					onBlur={(event) => {
						input.blur()
						buttonProps.onBlur?.(event)
					}}
				/>
				<FieldContent>
					<FieldLabel
						htmlFor={id}
						{...labelProps}
						className="text-muted-foreground text-sm"
					/>
					<InlineFieldErrors errorId={errorId} errors={errorsToRender} />
				</FieldContent>
			</FormField>
		</FieldGroup>
	)
}

/** One answer of a {@link RadioGroupField}: its value, its words, a line under them. */
export type ChoiceOption = {
	value: string
	label: React.ReactNode
	description?: React.ReactNode
	/** Not offered now (it is the current choice, say), but still read. */
	disabled?: boolean
}

/**
 * One of a few answers, as choice cards: the `ui/radio-group` item inside a
 * luma `FieldLabel` card (`rounded-2xl`, the whole card the target, at least
 * 44px tall). The radio is Base UI's, so the choice posts with the form under
 * `name` as a native radio would, and it is never Chromium's blue one.
 */
export function RadioGroupField({
	name,
	legend,
	legendClassName,
	options,
	defaultValue,
	value,
	onValueChange,
	errorId,
	errors,
	className,
	children,
}: {
	name: string
	legend: React.ReactNode
	legendClassName?: string
	options: readonly ChoiceOption[]
	defaultValue?: string
	value?: string
	onValueChange?: (value: string) => void
	errorId?: string
	errors?: ListOfErrors
	className?: string
	/** What follows the cards inside the same fieldset (a field the choice opens). */
	children?: React.ReactNode
}) {
	const id = useId()
	const errorsToRender = getErrorsToRender(errors)
	return (
		<FieldSet className={cn('gap-3', className)}>
			<FieldLegend className={cn('mb-0', legendClassName)}>
				{legend}
			</FieldLegend>
			<RadioGroup
				name={name}
				defaultValue={defaultValue}
				value={value}
				onValueChange={(next) => onValueChange?.(String(next))}
				aria-invalid={errorsToRender.length ? true : undefined}
				aria-describedby={errorsToRender.length ? errorId : undefined}
				className="gap-2"
			>
				{options.map((option) => (
					<FieldLabel
						key={option.value}
						htmlFor={`${id}-${option.value}`}
						className="has-data-checked:border-primary has-data-checked:bg-primary/5 dark:has-data-checked:bg-primary/10 duration-press transition-colors ease-out"
					>
						<FormField orientation="horizontal" className="min-h-11 py-3!">
							<RadioGroupItem
								id={`${id}-${option.value}`}
								value={option.value}
								disabled={option.disabled}
								className="mt-0.5"
							/>
							<FieldContent>
								<FieldTitle className="text-callout">{option.label}</FieldTitle>
								{option.description ? (
									<FieldDescription className="text-footnote">
										{option.description}
									</FieldDescription>
								) : null}
							</FieldContent>
						</FormField>
					</FieldLabel>
				))}
			</RadioGroup>
			{children}
			<ErrorList id={errorId} errors={errorsToRender} />
		</FieldSet>
	)
}

/**
 * Several of a short row of answers (the days of a week), as `ui/toggle-group`
 * pills: 44px tall, pressed in the primary green. A toggle group posts nothing
 * on its own, so each pressed value is a hidden input under `name`, in the
 * options' order, which is what a column of native checkboxes sent.
 */
export function ToggleGroupField({
	name,
	legend,
	legendClassName,
	note,
	options,
	defaultValue,
	errorId,
	errors,
	className,
}: {
	name: string
	legend: React.ReactNode
	legendClassName?: string
	note?: React.ReactNode
	options: ReadonlyArray<{ value: string; label: string; ariaLabel?: string }>
	defaultValue: readonly string[]
	errorId?: string
	errors?: ListOfErrors
	className?: string
}) {
	const [pressed, setPressed] = useState<string[]>([...defaultValue])
	const errorsToRender = getErrorsToRender(errors)
	return (
		<FieldSet className={cn('gap-2', className)}>
			<FieldLegend className={cn('mb-0', legendClassName)}>
				{legend}
			</FieldLegend>
			{note ? (
				<FieldDescription className="text-footnote">{note}</FieldDescription>
			) : null}
			<ToggleGroup
				multiple
				variant="outline"
				spacing={1}
				value={pressed}
				onValueChange={(next) => setPressed(next as string[])}
				aria-invalid={errorsToRender.length ? true : undefined}
				aria-describedby={errorsToRender.length ? errorId : undefined}
				className="w-full"
			>
				{options.map((option) => (
					<ToggleGroupItem
						key={option.value}
						value={option.value}
						aria-label={option.ariaLabel}
						className="aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground text-callout h-11 min-w-0 flex-1 rounded-full px-0"
					>
						{option.label}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
			{options
				.filter((option) => pressed.includes(option.value))
				.map((option) => (
					<input
						key={option.value}
						type="hidden"
						name={name}
						value={option.value}
					/>
				))}
			<ErrorList id={errorId} errors={errorsToRender} />
		</FieldSet>
	)
}
