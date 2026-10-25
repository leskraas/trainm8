/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { isStillToDo, moveToNextControl } from './return-key.ts'

/** A sign-up shaped form: two fields that say "next", a box, a button. */
function renderForm({
	box = <input type="checkbox" required aria-label="Terms" />,
	name = {},
}: {
	box?: React.ReactNode
	name?: React.InputHTMLAttributes<HTMLInputElement>
} = {}) {
	render(
		<form>
			<input
				aria-label="Username"
				enterKeyHint="next"
				onKeyDown={moveToNextControl}
			/>
			<input
				aria-label="Name"
				enterKeyHint="next"
				onKeyDown={moveToNextControl}
				{...name}
			/>
			{box}
			<button type="submit">Create</button>
		</form>,
	)
	return {
		username: screen.getByRole('textbox', { name: 'Username' }),
		name: screen.getByRole('textbox', { name: 'Name' }),
	}
}

/** Press return; true when the browser's own action (submit) was let through. */
function pressEnter(target: HTMLElement, init: KeyboardEventInit = {}) {
	target.focus()
	return fireEvent.keyDown(target, { key: 'Enter', ...init })
}

describe('moveToNextControl', () => {
	test('return on a "next" field moves to the next control', () => {
		const { username, name } = renderForm()
		expect(pressEnter(username)).toBe(false)
		expect(name).toHaveFocus()
	})

	test('it skips a disabled or hidden control', () => {
		render(
			<form>
				<input
					aria-label="Username"
					enterKeyHint="next"
					onKeyDown={moveToNextControl}
				/>
				<input aria-label="Locked" disabled />
				<div aria-hidden="true">
					<input aria-label="Hidden" />
				</div>
				<input type="hidden" name="redirectTo" />
				<input aria-label="Password" />
			</form>,
		)
		pressEnter(screen.getByRole('textbox', { name: 'Username' }))
		expect(screen.getByLabelText('Password')).toHaveFocus()
	})

	test('it submits once nothing after the field is still to do', () => {
		const { name } = renderForm({
			box: <input type="checkbox" required defaultChecked aria-label="T" />,
		})
		expect(pressEnter(name)).toBe(true)
		expect(name).toHaveFocus()
	})

	test('a field whose key says anything else keeps the submit', () => {
		const { name } = renderForm({ name: { enterKeyHint: 'go' } })
		expect(pressEnter(name)).toBe(true)
	})

	test('another key, or a field outside a form, does nothing', () => {
		const { username } = renderForm()
		expect(fireEvent.keyDown(username, { key: 'Tab' })).toBe(true)
		expect(username).not.toHaveFocus()

		render(
			<input
				aria-label="Loose"
				enterKeyHint="next"
				onKeyDown={moveToNextControl}
			/>,
		)
		expect(pressEnter(screen.getByLabelText('Loose'))).toBe(true)
	})

	// The return that ends an IME composition (kana, pinyin) confirms the
	// word; it is not the athlete asking for the next field.
	test('a return that ends a composition stays put', () => {
		const { username } = renderForm()
		expect(pressEnter(username, { isComposing: true })).toBe(true)
		expect(username).toHaveFocus()
		// Safari: isComposing is already false, keyCode still 229.
		expect(pressEnter(username, { keyCode: 229 })).toBe(true)
		expect(username).toHaveFocus()
	})
})

describe('isStillToDo', () => {
	function control(html: string) {
		const host = document.createElement('div')
		host.innerHTML = html
		return host.firstElementChild as HTMLElement
	}

	test('an empty field is to do, a filled one is not', () => {
		expect(isStillToDo(control('<input>'))).toBe(true)
		expect(isStillToDo(control('<input value="kody">'))).toBe(false)
		expect(isStillToDo(control('<textarea></textarea>'))).toBe(true)
		expect(
			isStillToDo(control('<select><option value="">-</option></select>')),
		).toBe(true)
	})

	test('only a required box left unticked is to do', () => {
		expect(isStillToDo(control('<input type="checkbox" required>'))).toBe(true)
		expect(
			isStillToDo(control('<input type="checkbox" required checked>')),
		).toBe(false)
		expect(isStillToDo(control('<input type="checkbox">'))).toBe(false)
		expect(isStillToDo(control('<input type="radio" required>'))).toBe(true)
	})

	test("Base UI's checkbox reads its aria state", () => {
		expect(
			isStillToDo(
				control('<span role="checkbox" aria-required="true"></span>'),
			),
		).toBe(true)
		expect(
			isStillToDo(
				control(
					'<span role="checkbox" aria-required="true" aria-checked="true"></span>',
				),
			),
		).toBe(false)
		expect(isStillToDo(control('<span role="checkbox"></span>'))).toBe(false)
	})

	test('a button is never to do', () => {
		expect(isStillToDo(control('<input type="submit">'))).toBe(false)
		expect(isStillToDo(control('<input type="button">'))).toBe(false)
		expect(isStillToDo(control('<button>Go</button>'))).toBe(false)
	})
})
