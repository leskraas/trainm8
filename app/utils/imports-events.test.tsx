/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react'
import { useEventSource } from 'remix-utils/sse/react'
import { expect, test, vi, beforeEach } from 'vitest'
import { useRevalidateOnImportEvent } from './imports-events.ts'

const revalidate = vi.fn()

vi.mock('react-router', () => ({
	useRevalidator: () => ({ revalidate }),
}))

vi.mock('remix-utils/sse/react', () => ({
	useEventSource: vi.fn(),
}))

const mockUseEventSource = vi.mocked(useEventSource)

beforeEach(() => {
	revalidate.mockClear()
})

test('does not revalidate before any event arrives', () => {
	mockUseEventSource.mockReturnValue(null)

	renderHook(() => useRevalidateOnImportEvent())

	expect(revalidate).not.toHaveBeenCalled()
})

test('revalidates when a new import event arrives', () => {
	mockUseEventSource.mockReturnValue(null)
	const { rerender } = renderHook(() => useRevalidateOnImportEvent())
	expect(revalidate).not.toHaveBeenCalled()

	// A push advances the EventSource state to a fresh payload.
	mockUseEventSource.mockReturnValue('1716187200000')
	rerender()

	expect(revalidate).toHaveBeenCalledTimes(1)
})

test('revalidates again on each subsequent event', () => {
	mockUseEventSource.mockReturnValue('1716187200000')
	const { rerender } = renderHook(() => useRevalidateOnImportEvent())
	expect(revalidate).toHaveBeenCalledTimes(1)

	mockUseEventSource.mockReturnValue('1716187260000')
	rerender()

	expect(revalidate).toHaveBeenCalledTimes(2)
})
