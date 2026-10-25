/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test } from 'vitest'

import { STATUS_BUTTON_LABELS } from '#app/utils/labels.ts'
import {
	CheckboxField,
	ErrorList,
	Field,
	RadioGroupField,
	ReserveErrorLines,
	TextareaField,
	ToggleGroupField,
} from './forms.tsx'
import { StatusButton } from './ui/status-button.tsx'

describe('forms field wrappers', () => {
	test('applies invalid state to input fields and ties aria-describedby', () => {
		render(
			<Field
				labelProps={{ children: 'Email' }}
				inputProps={{ name: 'email' }}
				errors={['Email is required']}
			/>,
		)

		const input = screen.getByRole('textbox', { name: 'Email' })
		const wrapper = input.closest('[data-slot="field"]')
		const describedBy = input.getAttribute('aria-describedby')
		const description = describedBy
			? document.getElementById(describedBy)
			: null

		expect(wrapper).toHaveAttribute('data-invalid', 'true')
		expect(input).toHaveAttribute('aria-invalid', 'true')
		expect(description).toHaveTextContent('Email is required')
	})

	test('applies disabled state to textarea wrappers and controls', () => {
		render(
			<TextareaField
				labelProps={{ children: 'Notes' }}
				textareaProps={{ name: 'notes', disabled: true }}
			/>,
		)

		const textarea = screen.getByRole('textbox', { name: 'Notes' })
		const wrapper = textarea.closest('[data-slot="field"]')

		expect(wrapper).toHaveAttribute('data-disabled', 'true')
		expect(textarea).toBeDisabled()
	})

	test('applies invalid and disabled attributes for checkbox fields', () => {
		render(
			<form id="test-form">
				<CheckboxField
					labelProps={{ children: 'Agree to terms' }}
					buttonProps={{
						name: 'terms',
						form: 'test-form',
						disabled: true,
					}}
					errors={['You must accept the terms']}
				/>
			</form>,
		)

		const checkbox = screen.getByRole('checkbox', { name: 'Agree to terms' })
		const wrapper = checkbox.closest('[data-slot="field"]')

		expect(wrapper).toHaveAttribute('data-invalid', 'true')
		expect(wrapper).toHaveAttribute('data-disabled', 'true')
		expect(checkbox).toHaveAttribute('aria-invalid', 'true')
		expect(checkbox).toHaveAttribute('aria-describedby')
	})

	// Round 2 (audit D7): field errors were 10px. They read at the footnote
	// step in the red made for text.
	test('an error reads at the footnote step in the text red, not 10px', () => {
		render(
			<>
				<Field
					labelProps={{ children: 'Email' }}
					inputProps={{ name: 'email' }}
					errors={['Email is required']}
				/>
				<ErrorList id="form-errors" errors={['Something went wrong']} />
			</>,
		)
		for (const text of ['Email is required', 'Something went wrong']) {
			const error = screen.getByText(text)
			expect(error).toHaveClass('text-footnote', 'text-foreground-destructive')
			expect(error.className).not.toMatch(/text-\[10px\]/)
		}
	})

	// An auth form keeps one error line's height with no error, so an error
	// that comes or goes mid-typing moves nothing (tests/e2e/auth-form-layout).
	// Every other form keeps its height to its errors.
	test('only a field that reserves the error line keeps it without an error', () => {
		const { container, rerender } = render(
			<>
				<Field labelProps={{ children: 'Email' }} inputProps={{}} />
				<ErrorList errors={[]} />
			</>,
		)
		expect(container.querySelector('[class*="min-h-"]')).toBeNull()
		expect(
			container.querySelector('[data-slot="field-content"]')?.children,
		).toHaveLength(1)

		rerender(
			<Field
				labelProps={{ children: 'Email' }}
				inputProps={{}}
				reserveErrorLine
			/>,
		)
		expect(container.querySelectorAll('[class*="min-h-"]')).toHaveLength(1)
	})

	// A form that revalidates as the athlete types says so once, around its
	// fields, and every field in it keeps its line; one that can't be wrong
	// (Remember me) opts out.
	test('every field inside ReserveErrorLines keeps its line unless it opts out', () => {
		const { container } = render(
			<form id="auth-form">
				<ReserveErrorLines>
					<Field labelProps={{ children: 'Username' }} inputProps={{}} />
					<CheckboxField
						labelProps={{ children: 'Agree to the terms' }}
						buttonProps={{ name: 'terms', form: 'auth-form' }}
					/>
					<CheckboxField
						labelProps={{ children: 'Remember me' }}
						buttonProps={{ name: 'remember', form: 'auth-form' }}
						reserveErrorLine={false}
					/>
				</ReserveErrorLines>
				<Field labelProps={{ children: 'Elsewhere' }} inputProps={{}} />
			</form>,
		)
		const lines = container.querySelectorAll('[aria-live="polite"]')
		expect(lines).toHaveLength(2)
		expect(lines[0]?.closest('[data-slot="field"]')).toContainElement(
			screen.getByRole('textbox', { name: 'Username' }),
		)
		expect(lines[1]?.closest('[data-slot="field"]')).toContainElement(
			screen.getByRole('checkbox', { name: 'Agree to the terms' }),
		)
	})

	// The reserved line is the field's spacing, not added to it: one footnote
	// line and no padding of its own, so the gap to the next field stays near
	// the 16px it was before any line was reserved.
	test('a reserved line is one footnote line and no padding', () => {
		const { container } = render(
			<Field
				labelProps={{ children: 'Email' }}
				inputProps={{}}
				reserveErrorLine
			/>,
		)
		const line = container.querySelector('[aria-live="polite"]')
		expect(line).toHaveClass('min-h-(--text-footnote--line-height)')
		expect(line?.className).not.toMatch(/\bp[tb]?-/)
	})

	// A reserved line holds one error, so a second one (`a.` is too short and
	// has a dot) can't grow it; the next shows once the first is fixed. A
	// field that reserves nothing still lists every error.
	test('a reserved line shows only the first error', () => {
		const errors = ['Username is too short', 'Use only letters, numbers']
		const { rerender } = render(
			<Field
				labelProps={{ children: 'Username' }}
				inputProps={{}}
				errors={errors}
				reserveErrorLine
			/>,
		)
		const input = screen.getByRole('textbox', { name: 'Username' })
		expect(screen.getByText('Username is too short')).toHaveAttribute(
			'id',
			input.getAttribute('aria-describedby'),
		)
		expect(screen.queryByText('Use only letters, numbers')).toBeNull()

		rerender(
			<Field
				labelProps={{ children: 'Username' }}
				inputProps={{}}
				errors={errors}
			/>,
		)
		expect(screen.getByText('Use only letters, numbers')).toBeInTheDocument()
	})

	// A return key that says "next" must go to the next field: left alone, a
	// form submits on Enter from any field, half filled, and every field
	// after this one turns red. "go" keeps the submit.
	test('return on a "next" field moves to the next control, not submit', async () => {
		const user = userEvent.setup()
		let submitted = 0
		render(
			<form
				onSubmit={(event) => {
					event.preventDefault()
					submitted += 1
				}}
			>
				<input tabIndex={-1} aria-hidden name="honeypot" />
				<Field
					labelProps={{ children: 'Username' }}
					inputProps={{ enterKeyHint: 'next' }}
				/>
				<input type="hidden" name="redirectTo" />
				<Field
					labelProps={{ children: 'Password' }}
					inputProps={{ enterKeyHint: 'go' }}
				/>
				<button type="submit">Log in</button>
			</form>,
		)
		const username = screen.getByRole('textbox', { name: 'Username' })
		const password = screen.getByRole('textbox', { name: 'Password' })

		await user.click(username)
		await user.keyboard('kody{Enter}')
		expect(password).toHaveFocus()
		expect(submitted).toBe(0)

		await user.keyboard('secret{Enter}')
		expect(submitted).toBe(1)
	})

	// A form's own error (the server's answer) is never there while a field
	// has one, so the last field's line holds it: no second empty line above
	// the button. It is the form's error, not the field's, so the field is not
	// marked invalid by it.
	test("a field's line holds the form's error while it has none of its own", () => {
		const { rerender } = render(
			<Field
				labelProps={{ children: 'Password' }}
				inputProps={{ type: 'text' }}
				reserveErrorLine
				formErrors={['Invalid username or password']}
				formErrorId="form-error"
			/>,
		)
		const input = screen.getByRole('textbox', { name: 'Password' })
		expect(screen.getByText('Invalid username or password')).toHaveAttribute(
			'id',
			'form-error',
		)
		expect(input).not.toHaveAttribute('aria-invalid')
		expect(input.closest('[data-slot="field"]')).not.toHaveAttribute(
			'data-invalid',
		)

		rerender(
			<Field
				labelProps={{ children: 'Password' }}
				inputProps={{ type: 'text' }}
				reserveErrorLine
				errors={['Password is too short']}
				formErrors={['Invalid username or password']}
				formErrorId="form-error"
			/>,
		)
		expect(screen.queryByText('Invalid username or password')).toBeNull()
		expect(screen.getByText('Password is too short')).toBeInTheDocument()
		expect(input).toHaveAttribute('aria-invalid', 'true')
	})
})

describe('choice fields on the ui primitives', () => {
	test('a radio group field posts the chosen card, and renders no native radio', async () => {
		const user = userEvent.setup()
		render(
			<form data-testid="form">
				<RadioGroupField
					name="goal"
					legend="Hva trener du mot?"
					defaultValue="active"
					options={[
						{ value: 'active', label: 'Hold meg aktiv' },
						{ value: 'event', label: 'Et løp', description: 'Med dato' },
					]}
				/>
			</form>,
		)
		const form = screen.getByTestId('form') as HTMLFormElement
		expect(new FormData(form).get('goal')).toBe('active')

		await user.click(screen.getByText('Et løp'))
		expect(screen.getByRole('radio', { name: /Et løp/ })).toBeChecked()
		expect(new FormData(form).get('goal')).toBe('event')
		// Base UI's radio: the visible control is a role=radio element, and the
		// only native input is the hidden one that carries the value.
		for (const input of form.querySelectorAll('input[type="radio"]')) {
			expect(input).toHaveAttribute('aria-hidden', 'true')
		}
	})

	test('a toggle group field posts each pressed pill under its name, in order', async () => {
		const user = userEvent.setup()
		render(
			<form data-testid="form">
				<ToggleGroupField
					name="days"
					legend="Dager"
					defaultValue={['1', '3']}
					options={[
						{ value: '0', label: 'ma', ariaLabel: 'mandag' },
						{ value: '1', label: 'ti', ariaLabel: 'tirsdag' },
						{ value: '3', label: 'to', ariaLabel: 'torsdag' },
					]}
				/>
			</form>,
		)
		const form = screen.getByTestId('form') as HTMLFormElement
		expect(new FormData(form).getAll('days')).toEqual(['1', '3'])

		await user.click(screen.getByRole('button', { name: 'mandag' }))
		await user.click(screen.getByRole('button', { name: 'torsdag' }))
		expect(new FormData(form).getAll('days')).toEqual(['0', '1'])
		expect(screen.getByRole('button', { name: 'mandag' })).toHaveAttribute(
			'aria-pressed',
			'true',
		)
		expect(form.querySelector('input[type="checkbox"]')).toBeNull()
	})
})

describe('StatusButton', () => {
	test('an error puts nothing in the button; the field says it', () => {
		render(<StatusButton status="error">Koble til</StatusButton>)
		const button = screen.getByRole('button', { name: 'Koble til' })
		expect(button.querySelector('[role="status"]')).toBeNull()
	})

	test('done is titled in Norwegian', () => {
		render(<StatusButton status="success">Koble til</StatusButton>)
		expect(screen.getByRole('status')).toHaveTextContent(
			STATUS_BUTTON_LABELS.success,
		)
	})
})
