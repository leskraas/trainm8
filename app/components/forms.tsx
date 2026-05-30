import { type FieldMetadata, useInputControl } from '@conform-to/react'
import { REGEXP_ONLY_DIGITS_AND_CHARS, type OTPInputProps } from 'input-otp'
import React, { useId } from 'react'
import { cn } from '#app/utils/misc.tsx'
import { Checkbox, type CheckboxProps } from './ui/checkbox.tsx'
import {
	Field as FormField,
	FieldContent,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from './ui/field.tsx'
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from './ui/input-otp.tsx'
import { Input } from './ui/input.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select.tsx'
import { Textarea } from './ui/textarea.tsx'

export type ListOfErrors = Array<string | null | undefined> | null | undefined

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
		<div className="min-h-[32px] px-4 pt-1 pb-3">
			{errors.map((error, index) => (
				<FieldDescription
					key={`${error}-${index}`}
					id={index === 0 ? errorId : undefined}
					className="text-foreground-destructive text-[10px]"
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
				<li key={e} className="text-foreground-destructive text-[10px]">
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
					<SelectValue placeholder={placeholder} />
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
						className="text-body-xs text-muted-foreground self-center"
					/>
					<InlineFieldErrors errorId={errorId} errors={errorsToRender} />
				</FieldContent>
			</FormField>
		</FieldGroup>
	)
}
