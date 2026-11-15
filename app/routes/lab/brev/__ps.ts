/**
 * The PS lines: every mid-week change the athlete makes is written down as a
 * dated PS with its undo token. The engine hands out undo tokens only to the
 * write that made them, and has no read of the athlete's own decisions, so
 * the list lives in this browser (it survives reloads on this device).
 */
import { useCallback, useEffect, useState } from 'react'

export type PsLine = {
	id: string
	/** ISO instant when it was written. */
	at: string
	/** The Monday of the week whose letter it belongs to. */
	weekKey: string
	text: string
	token: string | null
	noUndoBecause: string | null
	undone: boolean
}

const KEY = 'brev-ps-v1'
const EVENT = 'brev-ps-change'

function read(): PsLine[] {
	try {
		const raw = window.localStorage.getItem(KEY)
		const list = raw ? (JSON.parse(raw) as PsLine[]) : []
		return Array.isArray(list) ? list : []
	} catch {
		return []
	}
}

function write(list: PsLine[]) {
	try {
		window.localStorage.setItem(KEY, JSON.stringify(list.slice(-200)))
	} catch {
		// Private window or blocked storage: the PS still shows until reload.
	}
	window.dispatchEvent(new Event(EVENT))
}

let memory: PsLine[] | null = null

export function addPs(line: Omit<PsLine, 'id' | 'at' | 'undone'>) {
	const list = memory ?? read()
	const next: PsLine = {
		...line,
		id: Math.random().toString(36).slice(2),
		at: new Date().toISOString(),
		undone: false,
	}
	memory = [...list, next]
	write(memory)
	return next
}

export function markUndone(id: string) {
	const list = memory ?? read()
	memory = list.map((l) => (l.id === id ? { ...l, undone: true } : l))
	write(memory)
}

export function clearPs() {
	memory = []
	try {
		window.localStorage.removeItem(KEY)
	} catch {
		// ignore
	}
	window.dispatchEvent(new Event(EVENT))
}

export function usePsLines(weekKey?: string) {
	const [lines, setLines] = useState<PsLine[]>([])
	const refresh = useCallback(() => {
		memory = read()
		setLines(weekKey ? memory.filter((l) => l.weekKey === weekKey) : memory)
	}, [weekKey])
	useEffect(() => {
		refresh()
		window.addEventListener(EVENT, refresh)
		window.addEventListener('storage', refresh)
		return () => {
			window.removeEventListener(EVENT, refresh)
			window.removeEventListener('storage', refresh)
		}
	}, [refresh])
	return lines
}
