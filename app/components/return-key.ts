/**
 * The return key on a form's fields: on a field whose key reads "next" it
 * moves to the next control still to do, instead of submitting the form half
 * filled. `Field` (`forms.tsx`) hangs it on every input it renders.
 */
import type React from 'react'

/** What a return key can reach in a form: tabbable, enabled, not hidden. */
const FORM_CONTROLS =
	'input:not([type=hidden]), select, textarea, button, [role=checkbox], [tabindex]'

/**
 * A control still to do: an empty field, or a required box left unticked.
 * An optional box (Remember me) is never to do.
 */
export function isStillToDo(control: HTMLElement) {
	if (control instanceof HTMLInputElement) {
		if (control.type === 'checkbox' || control.type === 'radio') {
			return control.required && !control.checked
		}
		return control.type !== 'submit' && control.type !== 'button'
			? control.value === ''
			: false
	}
	if (
		control instanceof HTMLTextAreaElement ||
		control instanceof HTMLSelectElement
	) {
		return control.value === ''
	}
	// Base UI's checkbox is a span with the role; its input is hidden.
	return (
		control.getAttribute('role') === 'checkbox' &&
		control.getAttribute('aria-required') === 'true' &&
		control.getAttribute('aria-checked') !== 'true'
	)
}

/**
 * Return on a field whose key reads "next" (`enterKeyHint: 'next'`) moves to
 * the form's next control, as the key says, instead of submitting the form
 * half filled. Once nothing after the field is still to do (a password
 * manager filled the password before the username was typed), return
 * submits, as it always did. Any other hint keeps the browser's submit.
 */
export function moveToNextControl(
	event: React.KeyboardEvent<HTMLInputElement>,
) {
	const input = event.currentTarget
	if (
		event.key !== 'Enter' ||
		event.nativeEvent.isComposing ||
		// Safari ends a composition with Enter as keyCode 229 after isComposing clears.
		event.keyCode === 229 ||
		input.getAttribute('enterkeyhint') !== 'next' ||
		!input.form
	) {
		return
	}
	const controls = Array.from(
		input.form.querySelectorAll<HTMLElement>(FORM_CONTROLS),
	).filter(
		(control) =>
			control.tabIndex >= 0 &&
			!control.matches(':disabled') &&
			!control.closest('[aria-hidden="true"]'),
	)
	const later = controls.slice(controls.indexOf(input) + 1)
	const next = later[0]
	if (!next || !later.some(isStillToDo)) return
	event.preventDefault()
	next.focus()
}
