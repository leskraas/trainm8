/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { CheckboxField, Field, TextareaField } from './forms.tsx'

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
})
