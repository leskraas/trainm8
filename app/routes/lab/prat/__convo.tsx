import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react'
import { useRevalidator } from 'react-router'
import { type CapabilityResult } from '#app/lab/engine/define.ts'
import { type UndoOutput } from '#app/lab/engine/sessions.types.ts'

// ── calling the engine from the browser ─────────────────────────────────────

/** One function for any capability: `call(name, input)`. Writes revalidate. */
export function useCall() {
	const revalidator = useRevalidator()
	return useCallback(
		async <O,>(
			name: string,
			input: unknown,
			opts: { revalidate?: boolean } = {},
		): Promise<CapabilityResult<O>> => {
			try {
				const res = await fetch(`/lab/api/${name}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(input ?? {}),
				})
				const json = (await res.json()) as CapabilityResult<O>
				if (json.ok && opts.revalidate !== false) void revalidator.revalidate()
				return json
			} catch {
				return {
					ok: false,
					code: 'network',
					message: navigatorOffline()
						? 'Du er ikke på nett. Det sendes ikke før du er tilbake; prøv igjen da.'
						: 'Fikk ikke kontakt. Prøv igjen.',
				}
			}
		},
		[revalidator],
	)
}

function navigatorOffline() {
	return typeof navigator !== 'undefined' && navigator.onLine === false
}

// ── the change log: every change, with «Angre» for 7 days ──────────────────

export type ChangeEntry = {
	id: string
	at: string
	/** The athlete's day it was made. */
	day: string
	text: string
	detail?: string | null
	token: string | null
	noUndo?: string | null
	undone?: boolean
	/** Made during this visit: shown where it happened, not again in the history. */
	fresh?: boolean
}

const WEEK_MS = 7 * 86_400_000

function loadChanges(key: string): ChangeEntry[] {
	try {
		const raw = window.localStorage.getItem(key)
		if (!raw) return []
		const list = JSON.parse(raw) as ChangeEntry[]
		const now = Date.now()
		return list.filter((c) => now - new Date(c.at).getTime() < WEEK_MS)
	} catch {
		return []
	}
}

function saveChanges(key: string, list: ChangeEntry[]) {
	try {
		window.localStorage.setItem(
			key,
			JSON.stringify(list.map(({ fresh: _fresh, ...c }) => c).slice(-60)),
		)
	} catch {
		// Private window or storage blocked: changes still show for this visit.
	}
}

// ── live conversation ───────────────────────────────────────────────────────

export type Live = { id: string; node: React.ReactNode; typing?: boolean }

type Convo = {
	live: Live[]
	push: (node: React.ReactNode) => string
	typing: () => () => void
	reset: () => void
	changes: ChangeEntry[]
	addChange: (c: Omit<ChangeEntry, 'id' | 'at' | 'fresh' | 'day'>) => string
	undoChange: (id: string) => Promise<CapabilityResult<UndoOutput> | null>
	undoBusy: string | null
	today: string
	username: string
}

const Ctx = createContext<Convo | null>(null)

let seq = 0
export function uid(prefix = 'm') {
	seq += 1
	return `${prefix}${Date.now().toString(36)}${seq}`
}

export function ConvoProvider({
	children,
	today,
	username,
}: {
	children: React.ReactNode
	today: string
	username: string
}) {
	const [live, setLive] = useState<Live[]>([])
	const [changes, setChanges] = useState<ChangeEntry[]>([])
	const [undoBusy, setUndoBusy] = useState<string | null>(null)
	const key = `prat:changes:${username}`
	const call = useCall()
	const changesRef = useRef(changes)
	changesRef.current = changes

	useEffect(() => {
		setChanges(loadChanges(key))
	}, [key])

	const push = useCallback((node: React.ReactNode) => {
		const id = uid()
		setLive((l) => [...l.filter((x) => !x.typing), { id, node }])
		return id
	}, [])

	const typing = useCallback(() => {
		const id = uid('t')
		setLive((l) => [...l, { id, node: null, typing: true }])
		return () => setLive((l) => l.filter((x) => x.id !== id))
	}, [])

	const reset = useCallback(() => setLive([]), [])

	const addChange = useCallback(
		(c: Omit<ChangeEntry, 'id' | 'at' | 'fresh' | 'day'>) => {
			const entry: ChangeEntry = {
				...c,
				id: uid('c'),
				at: new Date().toISOString(),
				day: today,
				fresh: true,
			}
			setChanges((list) => {
				const next = [...list, entry]
				saveChanges(key, next)
				return next
			})
			return entry.id
		},
		[key, today],
	)

	const undoChange = useCallback(
		async (id: string) => {
			const entry = changesRef.current.find((c) => c.id === id)
			if (!entry?.token) return null
			setUndoBusy(id)
			const r = await call<UndoOutput>('undo', { token: entry.token })
			setUndoBusy(null)
			if (r.ok) {
				setChanges((list) => {
					const next = list.map((c) =>
						c.id === id ? { ...c, undone: true } : c,
					)
					saveChanges(key, next)
					return next
				})
			}
			return r
		},
		[call, key],
	)

	const value = useMemo(
		() => ({
			live,
			push,
			typing,
			reset,
			changes,
			addChange,
			undoChange,
			undoBusy,
			today,
			username,
		}),
		[
			live,
			push,
			typing,
			reset,
			changes,
			addChange,
			undoChange,
			undoBusy,
			today,
			username,
		],
	)
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useConvo() {
	const c = useContext(Ctx)
	if (!c) throw new Error('useConvo outside ConvoProvider')
	return c
}

/**
 * Runs a write the partner is answering: shows «skriver …» while the engine
 * works (a real wait, never an added one), then hands back the result.
 */
export function useAsk() {
	const call = useCall()
	const { typing } = useConvo()
	return useCallback(
		async <O,>(
			name: string,
			input: unknown,
			opts: { revalidate?: boolean } = {},
		) => {
			const stop = typing()
			try {
				return await call<O>(name, input, opts)
			} finally {
				stop()
			}
		},
		[call, typing],
	)
}

/** Runs `fn` once after the first mount (safe under StrictMode's re-run). */
export function useOnce(fn: () => void) {
	const done = useRef(false)
	useEffect(() => {
		if (done.current) return
		done.current = true
		fn()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])
}
