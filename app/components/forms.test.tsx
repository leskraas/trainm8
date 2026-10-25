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
	test('only a form that reserves the error line keeps it without an error', () => {
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
			<>
				<Field
					labelProps={{ children: 'Email' }}
					inputProps={{}}
					reserveErrorLine
				/>
				<ErrorList errors={[]} reserveErrorLine />
			</>,
		)
		expect(container.querySelectorAll('[class*="min-h-"]')).toHaveLength(2)
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
