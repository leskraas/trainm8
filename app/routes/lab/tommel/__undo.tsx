import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { useRevalidator } from 'react-router'
import { useOptionalUser } from '#app/utils/user.ts'
import { cap } from './__api.ts'
import { ArrowBack, cx } from './__ui.tsx'

/**
 * Every change the athlete says yes to can be taken back: right away from
 * the stripe at the bottom (10 s), and later from «Siste endringer». The
 * engine hands out undo tokens but keeps no list of them, so this device
 * remembers the latest ones.
 */
export type ChangeKind = 'undo' | 'goal'
export type Change = {
	id: string
	text: string
	at: string
	token: string
	kind: ChangeKind
	undone?: boolean
	failed?: string
}

/**
 * Whose changes these are. Kept per account, so a second account on this
 * browser never sees the first's. Set by the UndoProvider.
 */
let owner: string | null = null
const logKey = () => (owner ? `tommel:changes:${owner}` : null)

export function readChanges(): Change[] {
	const key = logKey()
	if (!key) return []
	try {
		return JSON.parse(localStorage.getItem(key) ?? '[]') as Change[]
	} catch {
		return []
	}
}

function writeChanges(list: Change[]) {
	const key = logKey()
	if (!key) return
	try {
		localStorage.setItem(key, JSON.stringify(list.slice(0, 40)))
	} catch {
		// Private mode: the stripe still works; the list will not remember.
	}
}

export function updateChange(id: string, patch: Partial<Change>) {
	writeChanges(readChanges().map((c) => (c.id === id ? { ...c, ...patch } : c)))
}

export async function undoChange(c: Pick<Change, 'token' | 'kind'>) {
	return c.kind === 'goal'
		? cap('undo_goal_change', { undo: c.token })
		: cap('undo', { token: c.token })
}

type Offer = { text: string; token: string | null; kind?: ChangeKind }
const UndoCtx = createContext<{ offer: (o: Offer) => void }>({
	offer: () => {},
})

export function useUndo() {
	return useContext(UndoCtx)
}

export function UndoProvider({ children }: { children: ReactNode }) {
	// Before any child reads the list: it is this account's.
	owner = useOptionalUser()?.id ?? null
	const [stripe, setStripe] = useState<
		(Change & { state: 'open' | 'done' | 'error'; msg?: string }) | null
	>(null)
	const [leaving, setLeaving] = useState(false)
	const timer = useRef<number | undefined>(undefined)
	const revalidator = useRevalidator()

	const close = useCallback(() => {
		setLeaving(true)
		window.setTimeout(() => {
			setStripe(null)
			setLeaving(false)
		}, 160)
	}, [])

	const arm = useCallback(
		(ms: number) => {
			window.clearTimeout(timer.current)
			timer.current = window.setTimeout(close, ms)
		},
		[close],
	)

	const offer = useCallback(
		(o: Offer) => {
			if (!o.token) return
			const c: Change = {
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				text: o.text,
				at: new Date().toISOString(),
				token: o.token,
				kind: o.kind ?? 'undo',
			}
			writeChanges([c, ...readChanges()])
			setLeaving(false)
			setStripe({ ...c, state: 'open' })
			arm(10_000)
		},
		[arm],
	)

	useEffect(() => () => window.clearTimeout(timer.current), [])

	async function doUndo() {
		if (!stripe || stripe.state !== 'open') return
		const r = await undoChange(stripe)
		if (r.ok) {
			updateChange(stripe.id, { undone: true })
			setStripe({ ...stripe, state: 'done' })
			void revalidator.revalidate()
			arm(1800)
		} else {
			updateChange(stripe.id, { failed: r.message })
			setStripe({ ...stripe, state: 'error', msg: r.message })
			arm(5000)
		}
	}

	return (
		<UndoCtx.Provider value={{ offer }}>
			{children}
			{stripe ? (
				<div
					className={cx('tm-undo', leaving && 'is-leaving')}
					role="status"
					aria-live="polite"
				>
					<p>
						{stripe.state === 'done'
							? 'Angret. Alt er som før.'
							: stripe.state === 'error'
								? stripe.msg
								: stripe.text}
					</p>
					{stripe.state === 'open' ? (
						<button type="button" onClick={doUndo}>
							<ArrowBack size={18} />
							Angre
						</button>
					) : null}
				</div>
			) : null}
		</UndoCtx.Provider>
	)
}
