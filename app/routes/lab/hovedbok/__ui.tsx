import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useRevalidator } from 'react-router'
import { type CapabilityResult } from '#app/lab/engine/define.ts'

export const BASE = '/lab/hovedbok'

/** Class names joined with spaces, falsy ones dropped. */
export function cx(...names: Array<string | false | null | undefined>) {
	return names.filter(Boolean).join(' ')
}

// ── styles ───────────────────────────────────────────────────────────────────

export const CSS = String.raw`
.hb{
 --bg:#FFFFFF;--grid:#E6E8EB;--ink:#16191D;--mute:#6A7280;--week:#F5F6F8;--phase:#EAEDF2;
 --today:#16191D;--hit:#2B8A3E;--under:#1C7ED6;--over:#E8590C;--unk:#868E96;--draft:#FFF9DB;
 --warn:#FFEC99;--warnink:#5C4400;--danger:#C92A2A;--raise:#FFFFFF;--shadow:0 6px 24px rgba(22,25,29,.18);
 --mono:ui-monospace,"SF Mono","Cascadia Mono",Menlo,Consolas,monospace;
 --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
 --ease:cubic-bezier(0.23,1,0.32,1);
 position:fixed;inset:0;display:flex;flex-direction:column;height:100dvh;
 background:var(--bg);color:var(--ink);font:15px/1.4 var(--sans);
 -webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;
}
@media (prefers-color-scheme:dark){.hb{
 --bg:#0F1114;--grid:#24282E;--ink:#E9ECEF;--mute:#98A1AC;--week:#171A1E;--phase:#1F242B;
 --today:#E9ECEF;--hit:#51CF66;--under:#4DABF7;--over:#FF922B;--unk:#8D959E;--draft:#2B2A1A;
 --warn:#3D3415;--warnink:#FFE066;--danger:#FF6B6B;--raise:#1A1E23;--shadow:0 6px 24px rgba(0,0,0,.6);
}}
.hb *{box-sizing:border-box}
.hb button,.hb a,.hb [role=button],.hb label,.hb summary{touch-action:manipulation}
.hb button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;user-select:none;-webkit-user-select:none}
.hb a{color:inherit}
.hb input,.hb select,.hb textarea{font:16px var(--mono);color:var(--ink);background:transparent}
.hb :focus-visible{outline:2px solid var(--under);outline-offset:-2px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.mute{color:var(--mute)}
.hb-head{flex:none;padding:calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 64px) 0 calc(env(safe-area-inset-left) + 12px);border-bottom:1px solid var(--grid);background:var(--bg)}
.hb-title{display:flex;align-items:baseline;gap:8px;min-height:28px;font-weight:650;font-size:15px;letter-spacing:-.01em}
.hb-title small{font-weight:400;color:var(--mute);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hb-top{font:13px/1.35 var(--mono);font-variant-numeric:tabular-nums;padding:2px 0 8px;display:grid;gap:2px}
.hb-top div{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hb-top .wrap{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.hb-t th.num button{text-align:right;padding:0 6px 0 2px}
.hb-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:8px 12px;font-size:14px;border-bottom:1px solid var(--grid)}
.hb-bar.draft{background:var(--draft)}
.hb-bar.warn{background:var(--warn);color:var(--warnink)}
.hb-bar.err{color:var(--danger)}
.hb-bar b{font-weight:650}
.hb-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;position:relative}
.hb-page{padding:12px 12px 32px;max-width:860px}
.hb .btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:0 12px;border-radius:4px;border:1px solid var(--grid);font:14px var(--sans);font-weight:550;transition:transform 120ms var(--ease),background-color 120ms;text-decoration:none;white-space:nowrap}
.hb .btn:active{transform:scale(.97);background:var(--week)}
.hb .btn.pri{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.hb .btn.pri:active{opacity:.85}
.hb .btn.dng{color:var(--danger);border-color:currentColor}
.hb .btn.sm{min-height:36px;padding:0 10px;font-size:13px}
.hb .btn[disabled],.btn[aria-disabled=true]{opacity:.4;pointer-events:none}
.hb .btn.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.lnk{min-height:44px;display:inline-flex;align-items:center;font-weight:600;text-decoration:underline;text-underline-offset:3px}
@media (hover:hover) and (pointer:fine){.hb .btn:hover{background:var(--week)}.hb .btn.pri:hover,.hb .btn.on:hover{background:var(--ink);opacity:.9}.hb-t tbody tr.r:hover td{background-image:linear-gradient(rgba(127,127,127,.06),rgba(127,127,127,.06))}}
.hb-tools{flex:none;display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid var(--grid);background:var(--bg);padding:0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.hb .hb-tools > *{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-height:52px;font:11px var(--sans);color:var(--mute);text-decoration:none;transition:transform 120ms var(--ease)}
.hb .hb-tools > *:active{transform:scale(.95)}
.hb-tools .g{font:600 15px var(--mono);color:var(--ink)}
.hb-tools [aria-current=page] .g,.hb-tools [aria-pressed=true] .g{text-decoration:underline;text-underline-offset:4px}
.hb-tools [aria-disabled=true]{opacity:.35}
/* the table */
.hb-t{border-collapse:separate;border-spacing:0;table-layout:fixed;font:14px/1.2 var(--mono);font-variant-numeric:tabular-nums}
.hb-t th,.hb-t td{height:36px;padding:0 8px;border-bottom:1px solid var(--grid);border-right:1px solid var(--grid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;vertical-align:middle;background:var(--bg)}
.hb-t th{position:sticky;top:0;z-index:2;font:600 12px var(--sans);color:var(--mute);height:32px;padding:0}
.hb-t th button{width:100%;height:32px;padding:0 4px 0 8px;text-align:inherit;font:inherit;color:inherit;display:block;overflow:hidden;text-overflow:ellipsis}
.hb-t .lk{position:sticky;left:0;z-index:1}
.hb-t th.lk{z-index:3}
.hb-t .num{text-align:right}
.hb-t td.c{padding:0}
.hb-t td.c > button,.hb-t td.c > a{display:block;width:100%;height:35px;padding:0 8px;text-align:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}
.hb-t td.c > button:active{background:var(--week)}
.hb-t tr.wk td{background:var(--week);font-weight:600}
.hb-t tr.ph td{background:var(--phase);font:600 13px var(--sans);height:32px}
.hb-t tr.goal td{background:var(--phase);font-weight:650}
.hb-t tr.draft td:not(.lk){background:var(--draft);font-style:italic}
.hb-t tr.td-first td{border-top:2px solid var(--today)}
.hb-t tr.td-last td{border-bottom:2px solid var(--today)}
.hb-t tr.td td.lk{font-weight:700}
.hb-float{position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top) + 50px);z-index:35;border:1px solid var(--grid);border-radius:4px;box-shadow:var(--shadow);max-width:520px;margin:0 auto;animation:hbup 200ms var(--ease) both}
@keyframes hbup{from{opacity:0;transform:translateY(-8px)}}
.hb-t tr.lifted td{z-index:4;background:var(--raise);box-shadow:0 12px 18px -10px rgba(0,0,0,.45),inset 0 0 0 9999px rgba(127,127,127,.08);transition:none}
.hb-t tr.drop td{box-shadow:inset 0 2px 0 var(--under),inset 0 -2px 0 var(--under)}
.hb-t tr.placing td{cursor:copy}
.hb-t tr.r td{transition:transform 150ms var(--ease)}
.hb-t td.lk .d{display:block}
.hb-t .empty{color:var(--mute)}
.dash{border:1px dashed var(--grid);border-radius:2px}
.dev{font-weight:700;text-align:center}
.t-hit{color:var(--hit)}.t-under{color:var(--under)}.t-over{color:var(--over)}.t-unknown{color:var(--unk)}
.q{color:var(--unk);text-decoration:underline dotted;text-underline-offset:3px;cursor:help}
.strike{text-decoration:line-through;color:var(--mute)}
.prop{background:var(--draft);font-style:italic}
.amb{background:var(--warn)!important;color:var(--warnink)}
.mark{font:600 10px var(--sans);color:var(--mute);margin-left:4px}
.hb-t td.x{padding:0;height:auto;white-space:normal;background:var(--bg)}
.hb-x{position:sticky;left:0;width:var(--sw,100vw);padding:10px 12px 14px;font:14px/1.45 var(--sans);animation:hbin 180ms var(--ease) both}
@keyframes hbin{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.sub{width:100%;border-collapse:collapse;font:13px/1.3 var(--mono);font-variant-numeric:tabular-nums;margin:6px 0}
.sub td,.sub th{border-bottom:1px solid var(--grid);padding:7px 6px;text-align:left;vertical-align:top;white-space:normal}
.sub th{font:600 11px var(--sans);color:var(--mute)}
.sub .num{text-align:right}
.sub.prose td{font-family:var(--sans);font-size:14px}
.acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.why{font-size:13px;color:var(--mute);overflow-wrap:anywhere}
.say{font-size:14px;margin:4px 0;overflow-wrap:anywhere}
/* flash: the recomputed cell */
.hb-t td,.fl{position:relative}
.hb-t td.lk{position:sticky}
.fl-on::after{content:"";position:absolute;inset:0;background:var(--draft);pointer-events:none;mix-blend-mode:multiply;animation:hbflash 300ms var(--ease) forwards}
@media (prefers-color-scheme:dark){.fl-on::after{mix-blend-mode:screen;background:#5C5520}}
@keyframes hbflash{from{opacity:1}to{opacity:0}}
/* rpe picker */
.rpe{display:grid;grid-template-columns:repeat(10,1fr);gap:0;border:1px solid var(--grid);border-radius:4px;overflow:hidden}
.rpe button{min-height:44px;font:600 15px var(--mono);border-right:1px solid var(--grid)}
.rpe button:last-child{border-right:0}
.rpe button[aria-pressed=true]{background:var(--ink);color:var(--bg)}
.rpe button:active{background:var(--week)}
/* sheet (number pad, confirm) */
.hb-veil{position:fixed;inset:0;background:rgba(0,0,0,.28);z-index:40;animation:hbfade 160ms var(--ease) both}
@keyframes hbfade{from{opacity:0}}
.hb-sheet{position:fixed;left:0;right:0;bottom:0;z-index:41;background:var(--raise);border-top:1px solid var(--grid);box-shadow:var(--shadow);padding:12px 12px calc(env(safe-area-inset-bottom) + 12px);animation:hbsheet 240ms cubic-bezier(0.32,0.72,0,1) both;max-width:520px;margin:0 auto}
@keyframes hbsheet{from{transform:translateY(100%)}}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.pad button{min-height:52px;border:1px solid var(--grid);border-radius:4px;font:600 20px var(--mono)}
.pad button:active{background:var(--week);transform:scale(.97)}
.padv{font:600 28px var(--mono);text-align:right;padding:6px 8px;border-bottom:2px solid var(--ink);min-height:48px}
/* toast */
.hb-toast{position:absolute;left:8px;right:8px;bottom:8px;z-index:30;display:flex;align-items:center;gap:8px;min-height:48px;padding:4px 4px 4px 12px;background:var(--ink);color:var(--bg);border-radius:4px;font-size:14px;box-shadow:var(--shadow);transition:opacity 200ms var(--ease),transform 200ms var(--ease)}
.hb-toast[data-off=true]{opacity:0;transform:translateY(8px);pointer-events:none}
.hb-toast span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.hb-toast button{min-height:40px;padding:0 12px;font-weight:650;text-decoration:underline;text-underline-offset:3px}
.hb-toast.err{background:var(--danger);color:#fff}
/* forms in table cells */
.cell-in{width:100%;height:35px;border:0;padding:0 8px;outline:none}
.cell-in::placeholder{color:var(--mute);opacity:.8}
.seg{display:flex;flex-wrap:wrap;gap:4px;padding:4px 0}
.seg button,.seg a{min-height:36px;min-width:40px;padding:0 9px;border:1px dashed var(--grid);border-radius:4px;font:13px var(--mono);display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.seg button[aria-pressed=true],.seg a[aria-current=true]{border:1px solid var(--ink);background:var(--ink);color:var(--bg)}
.sheet-t{width:100%;border-collapse:separate;border-spacing:0;font:14px var(--mono);table-layout:fixed}
.sheet-t th{width:32%;text-align:left;font:500 13px var(--sans);color:var(--ink);padding:6px 8px 6px 0;border-bottom:1px solid var(--grid);vertical-align:top;white-space:normal}
.sheet-t td{border-bottom:1px solid var(--grid);padding:2px 0;vertical-align:middle;white-space:normal}
.sheet-t td.filled{}
.sheet-t .unf .cell-in,.sheet-t .unf select{outline:1px dashed var(--grid);outline-offset:-3px}
.sheet-t th .why{display:block;font-weight:400}
.sec{font:650 13px var(--sans);text-transform:none;margin:22px 0 4px;padding:6px 8px;background:var(--phase)}
.sec:first-child{margin-top:0}
.legend{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:13px;margin-top:6px}
.legend dt{font:700 14px var(--mono);text-align:center}
.spark{display:block}
@media (prefers-reduced-motion:reduce){
 .hb-x{animation:hbfadein 120ms linear both}
 @keyframes hbfadein{from{opacity:0}}
 .fl-on::after{animation:none;opacity:.9}
 .hb-sheet{animation:hbfade 120ms linear both}
 .hb-toast{transition:opacity 120ms linear}
 .hb-toast[data-off=true]{transform:none}
 .hb .btn:active,.hb-tools > *:active,.pad button:active{transform:none}
 .hb-t tr.r td{transition:none}
}
@media (min-width:900px){.hb-page{padding:20px 24px 40px}}
`

// ── capability calls from the browser ───────────────────────────────────────

export async function callCap<O>(
	name: string,
	input: unknown,
	method: 'GET' | 'POST' = 'POST',
): Promise<CapabilityResult<O>> {
	try {
		const res =
			method === 'GET'
				? await fetch(
						`/lab/api/${name}?input=${encodeURIComponent(JSON.stringify(input ?? {}))}`,
					)
				: await fetch(`/lab/api/${name}`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(input ?? {}),
					})
		return (await res.json()) as CapabilityResult<O>
	} catch {
		return {
			ok: false,
			code: 'network',
			message: 'Fikk ikke kontakt. Prøv igjen.',
		}
	}
}

/** A read fetched on demand (an expanded row): `null` while loading. */
export function useRead<O>(name: string, input: unknown, enabled = true) {
	const key = JSON.stringify(input)
	const [state, setState] = useState<CapabilityResult<O> | null>(null)
	const [n, setN] = useState(0)
	useEffect(() => {
		if (!enabled) return
		let live = true
		setState(null)
		void callCap<O>(name, JSON.parse(key), 'GET').then((r) => {
			if (live) setState(r)
		})
		return () => {
			live = false
		}
	}, [name, key, enabled, n])
	const reload = useCallback(() => setN((x) => x + 1), [])
	return { state, reload, setState }
}

// ── the change log (endringslogg) and undo ───────────────────────────────────

export type LogEntry = {
	id: string
	at: string
	what: string
	before?: string | null
	after?: string | null
	token?: string | null
	noUndo?: string | null
	undone?: boolean
	undoFailed?: string | null
}

type Toast = { id: number; text: string; entryId?: string; error?: boolean }

type Prefs = {
	level: 'enkel' | 'full'
	cols: { key: string; on: boolean }[]
	top: boolean
}
export const FULL_COLS = [
	{ key: 'tidp', label: 'Plan ′', long: 'Planlagt tid, minutter' },
	{ key: 'tidf', label: 'Faktisk ′', long: 'Faktisk tid, minutter' },
	{ key: 'km', label: 'km', long: 'Distanse, km' },
	{ key: 'tss', label: 'Belastn.', long: 'Belastning (TSS) for dagen' },
	{ key: 'grunn', label: 'Grunnform', long: 'Grunnform (CTL)' },
	{ key: 'slit', label: 'Slitenhet', long: 'Slitenhet (ATL)' },
	{ key: 'form', label: 'Form', long: 'Form (TSB) = grunnform − slitenhet' },
] as const
const DEFAULT_PREFS: Prefs = {
	level: 'enkel',
	cols: FULL_COLS.map((c) => ({ key: c.key, on: true })),
	top: true,
}

type Ctx = {
	log: LogEntry[]
	push: (e: Omit<LogEntry, 'id' | 'at'>) => string
	mark: (id: string, patch: Partial<LogEntry>) => void
	toast: (text: string, opts?: { entryId?: string; error?: boolean }) => void
	act: <O extends object>(
		name: string,
		input: unknown,
		describe: (v: O) => {
			what: string
			before?: string | null
			after?: string | null
			goal?: boolean
		} | null,
	) => Promise<CapabilityResult<O>>
	undoEntry: (id: string) => Promise<void>
	prefs: Prefs
	setPrefs: (p: Partial<Prefs>) => void
	busy: boolean
}
const HbCtx = createContext<Ctx | null>(null)
export function useHb() {
	const c = useContext(HbCtx)
	if (!c) throw new Error('Hovedbok context missing')
	return c
}

const LOG_KEY = 'hovedbok.logg.v1'
const PREF_KEY = 'hovedbok.visning.v1'
function readLS<T>(key: string, fallback: T): T {
	try {
		const raw = window.localStorage.getItem(key)
		return raw ? (JSON.parse(raw) as T) : fallback
	} catch {
		return fallback
	}
}
function writeLS(key: string, v: unknown) {
	try {
		window.localStorage.setItem(key, JSON.stringify(v))
	} catch {
		/* private mode: the log lives only in memory */
	}
}

export function HbProvider({ children }: { children: ReactNode }) {
	const [log, setLog] = useState<LogEntry[]>([])
	const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS)
	const [toastState, setToast] = useState<Toast | null>(null)
	const [toastOn, setToastOn] = useState(false)
	const [busy, setBusy] = useState(false)
	const revalidator = useRevalidator()
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		setLog(readLS<LogEntry[]>(LOG_KEY, []))
		const p = readLS<Prefs>(PREF_KEY, DEFAULT_PREFS)
		const known = new Set(p.cols?.map((c) => c.key) ?? [])
		const cols = [
			...(p.cols ?? []).filter((c) => FULL_COLS.some((f) => f.key === c.key)),
			...FULL_COLS.filter((f) => !known.has(f.key)).map((f) => ({
				key: f.key,
				on: true,
			})),
		]
		setPrefsState({ ...DEFAULT_PREFS, ...p, cols })
	}, [])

	const save = useCallback((next: LogEntry[]) => {
		writeLS(LOG_KEY, next.slice(0, 300))
		return next
	}, [])

	const push = useCallback(
		(e: Omit<LogEntry, 'id' | 'at'>) => {
			const id = Math.random().toString(36).slice(2)
			setLog((l) => save([{ ...e, id, at: new Date().toISOString() }, ...l]))
			return id
		},
		[save],
	)
	const mark = useCallback(
		(id: string, patch: Partial<LogEntry>) =>
			setLog((l) => save(l.map((x) => (x.id === id ? { ...x, ...patch } : x)))),
		[save],
	)

	const toast = useCallback(
		(text: string, opts: { entryId?: string; error?: boolean } = {}) => {
			if (timer.current) clearTimeout(timer.current)
			setToast({ id: Date.now(), text, ...opts })
			setToastOn(true)
			timer.current = setTimeout(
				() => setToastOn(false),
				opts.error ? 7000 : 5000,
			)
		},
		[],
	)

	const act = useCallback(
		async <O extends object>(
			name: string,
			input: unknown,
			describe: (v: O) => {
				what: string
				before?: string | null
				after?: string | null
				goal?: boolean
			} | null,
		) => {
			setBusy(true)
			const r = await callCap<O>(name, input)
			setBusy(false)
			if (!r.ok) {
				toast(r.message, { error: true })
				return r
			}
			const d = describe(r.value)
			const v = r.value as {
				undo?: string | null
				noUndoBecause?: string | null
			}
			if (d) {
				const { goal, ...rest } = d
				const id = push({
					...rest,
					token: v.undo ? (goal ? `goal:${v.undo}` : v.undo) : null,
					noUndo: v.noUndoBecause ?? null,
				})
				toast(
					v.undo
						? d.what
						: `${d.what}${v.noUndoBecause ? `. ${v.noUndoBecause}` : ''}`,
					v.undo ? { entryId: id } : {},
				)
			}
			void revalidator.revalidate()
			return r
		},
		[push, toast, revalidator],
	)

	const undoEntry = useCallback(
		async (id: string) => {
			const e = log.find((x) => x.id === id)
			if (!e?.token || e.undone) return
			setBusy(true)
			const isGoal = e.token.startsWith('goal:')
			const r = isGoal
				? await callCap('undo_goal_change', { undo: e.token.slice(5) })
				: await callCap('undo', { token: e.token })
			setBusy(false)
			if (!r.ok) {
				mark(id, { undoFailed: r.message })
				toast(r.message, { error: true })
				return
			}
			mark(id, { undone: true })
			toast(`Angret: ${e.what}`)
			void revalidator.revalidate()
		},
		[log, mark, toast, revalidator],
	)

	const setPrefs = useCallback((p: Partial<Prefs>) => {
		setPrefsState((old) => {
			const next = { ...old, ...p }
			writeLS(PREF_KEY, next)
			return next
		})
	}, [])

	// Reduced motion: a recomputed cell stays marked until the next tap.
	useEffect(() => {
		function clear() {
			document
				.querySelectorAll('.fl-on')
				.forEach((el) => el.classList.remove('fl-on'))
		}
		window.addEventListener('pointerdown', clear, { capture: true })
		return () =>
			window.removeEventListener('pointerdown', clear, { capture: true })
	}, [])

	const value = useMemo(
		() => ({
			log,
			push,
			mark,
			toast,
			act,
			undoEntry,
			prefs,
			setPrefs,
			busy,
		}),
		[log, push, mark, toast, act, undoEntry, prefs, setPrefs, busy],
	)

	return (
		<HbCtx.Provider value={value}>
			{children}
			<div
				className={cx('hb-toast', toastState?.error && 'err')}
				data-off={!toastOn}
				role="status"
				aria-live="polite"
				style={{
					position: 'fixed',
					bottom: 'calc(env(safe-area-inset-bottom) + 60px)',
					maxWidth: 520,
					margin: '0 auto',
				}}
			>
				<span>{toastState?.text}</span>
				{toastState?.entryId ? (
					<button
						type="button"
						onClick={() => {
							setToastOn(false)
							void undoEntry(toastState.entryId!)
						}}
					>
						Angre
					</button>
				) : null}
				<button
					type="button"
					aria-label="Lukk"
					onClick={() => setToastOn(false)}
				>
					×
				</button>
			</div>
		</HbCtx.Provider>
	)
}

/** The cell flashes when its value changes after a recalculation. */
export function useFlash<T extends HTMLElement>(value: unknown) {
	const ref = useRef<T>(null)
	const prev = useRef<string | null>(null)
	const key = JSON.stringify(value ?? null)
	useEffect(() => {
		if (prev.current !== null && prev.current !== key && ref.current) {
			const el = ref.current
			el.classList.remove('fl-on')
			void el.offsetWidth
			el.classList.add('fl-on')
		}
		prev.current = key
	}, [key])
	return ref
}

// ── the frame: header, scroller, toolbar ─────────────────────────────────────

export function Shell({
	title,
	sub,
	top,
	bars,
	children,
	scrollRef,
	tools = true,
}: {
	title: ReactNode
	sub?: ReactNode
	top?: ReactNode
	bars?: ReactNode
	children: ReactNode
	scrollRef?: React.Ref<HTMLDivElement>
	tools?: boolean
}) {
	const [online, setOnline] = useState(true)
	useEffect(() => {
		const on = () => setOnline(true)
		const off = () => setOnline(false)
		setOnline(navigator.onLine)
		window.addEventListener('online', on)
		window.addEventListener('offline', off)
		return () => {
			window.removeEventListener('online', on)
			window.removeEventListener('offline', off)
		}
	}, [])
	return (
		<>
			<header className="hb-head">
				<div className="hb-title">
					<span>{title}</span>
					{sub ? <small>{sub}</small> : null}
				</div>
				{top}
			</header>
			{!online ? (
				<div className="hb-bar warn" role="status">
					Frakoblet. Endringer kan ikke lagres før du er på nett igjen.
				</div>
			) : null}
			{bars}
			<main className="hb-scroll" ref={scrollRef} id="hb-scroll">
				{children}
			</main>
			{tools ? <Toolbar /> : null}
		</>
	)
}

export function Toolbar() {
	const { prefs, setPrefs, log, undoEntry, busy } = useHb()
	const loc = useLocation()
	const navigate = useNavigate()
	const last = log.find((e) => e.token && !e.undone && !e.undoFailed)
	const at = (p: string) => loc.pathname.startsWith(`${BASE}${p}`)
	const onBook = loc.pathname === BASE || loc.pathname === `${BASE}/`
	return (
		<nav className="hb-tools" aria-label="Verktøylinje">
			<button
				type="button"
				onClick={() => {
					if (onBook && !loc.search.includes('dato=')) {
						window.dispatchEvent(new Event('hb:today'))
					} else void navigate(BASE)
				}}
			>
				<span className="g">◉</span>I dag
			</button>
			<button
				type="button"
				aria-pressed={prefs.level === 'full'}
				onClick={() =>
					setPrefs({ level: prefs.level === 'full' ? 'enkel' : 'full' })
				}
			>
				<span className="g">{prefs.level === 'full' ? 'Full' : 'Enkel'}</span>
				Nivå
			</button>
			<Link
				to={`${BASE}/graf/form`}
				aria-current={at('/graf') ? 'page' : undefined}
			>
				<span className="g">⌇</span>Graf
			</Link>
			<Link to={`${BASE}/logg`} aria-current={at('/logg') ? 'page' : undefined}>
				<span className="g">≡</span>Logg
			</Link>
			<button
				type="button"
				aria-disabled={!last || busy}
				aria-label={last ? `Angre: ${last.what}` : 'Ingenting å angre'}
				onClick={() => last && !busy && void undoEntry(last.id)}
			>
				<span className="g">↶</span>Angre
			</button>
			<Link
				to={`${BASE}/innstillinger/tilgjengelighet`}
				aria-current={at('/innstillinger') ? 'page' : undefined}
			>
				<span className="g">⚙</span>Innstill.
			</Link>
		</nav>
	)
}

// ── small parts ──────────────────────────────────────────────────────────────

/** `?` in grey with a dotted underline; the why is on tap and for readers. */
export function Q({
	why,
	children = '?',
}: {
	why: string
	children?: ReactNode
}) {
	const { toast } = useHb()
	return (
		<button
			type="button"
			className="q"
			title={why}
			aria-label={`Ukjent: ${why}`}
			onClick={(e) => {
				e.stopPropagation()
				toast(`? = ${why}`)
			}}
		>
			{children}
		</button>
	)
}

/** Sheets render at the app root, above sticky rows and the toolbar. */
export function Layer({ children }: { children: ReactNode }) {
	const [el, setEl] = useState<HTMLElement | null>(null)
	useEffect(() => setEl(document.getElementById('hb-root')), [])
	return el ? createPortal(children, el) : null
}

/** A sheet from the bottom: number pad. */
export function NumPad({
	label,
	initial,
	decimals = true,
	onDone,
	onCancel,
}: {
	label: string
	initial: string
	decimals?: boolean
	onDone: (v: number | null) => void
	onCancel: () => void
}) {
	const [v, setVRaw] = useState(initial)
	const fresh = useRef(true)
	const setV = (f: (x: string) => string) =>
		setVRaw((x) => {
			const base = fresh.current ? '' : x
			fresh.current = false
			return f(base)
		})
	const keys = [
		'1',
		'2',
		'3',
		'4',
		'5',
		'6',
		'7',
		'8',
		'9',
		decimals ? ',' : '',
		'0',
		'⌫',
	]
	useEffect(() => {
		function k(e: KeyboardEvent) {
			if (/^[0-9]$/.test(e.key)) setV((x) => (x + e.key).slice(0, 6))
			else if (e.key === 'Backspace') setV((x) => x.slice(0, -1))
			else if ((e.key === ',' || e.key === '.') && decimals)
				setV((x) => (x.includes(',') ? x : `${x},`))
			else if (e.key === 'Enter')
				onDone(v === '' ? null : Number(v.replace(',', '.')))
			else if (e.key === 'Escape') onCancel()
		}
		window.addEventListener('keydown', k)
		return () => window.removeEventListener('keydown', k)
	}, [v, decimals, onDone, onCancel])
	return (
		<Layer>
			<div className="hb-veil" onClick={onCancel} />
			<div
				className="hb-sheet"
				role="dialog"
				aria-modal="true"
				aria-label={label}
			>
				<div style={{ display: 'flex', justifyContent: 'space-between' }}>
					<span style={{ fontWeight: 600 }}>{label}</span>
					<button type="button" className="btn sm" onClick={onCancel}>
						Avbryt
					</button>
				</div>
				<div className="padv" aria-live="polite">
					{v || <span className="mute">tom</span>}
				</div>
				<div className="pad">
					{keys.map((k, i) =>
						k ? (
							<button
								key={i}
								type="button"
								aria-label={k === '⌫' ? 'Slett siste' : k}
								onClick={() =>
									setV((x) =>
										k === '⌫'
											? x.slice(0, -1)
											: k === ','
												? x.includes(',')
													? x
													: `${x || '0'},`
												: (x + k).slice(0, 6),
									)
								}
							>
								{k}
							</button>
						) : (
							<span key={i} />
						),
					)}
				</div>
				<button
					type="button"
					className="btn pri"
					style={{ width: '100%', marginTop: 8 }}
					onClick={() => onDone(v === '' ? null : Number(v.replace(',', '.')))}
				>
					Ferdig
				</button>
			</div>
		</Layer>
	)
}

export function Confirm({
	title,
	children,
	yes,
	danger,
	onYes,
	onNo,
}: {
	title: string
	children?: ReactNode
	yes: string
	danger?: boolean
	onYes: () => void
	onNo: () => void
}) {
	return (
		<Layer>
			<div className="hb-veil" onClick={onNo} />
			<div
				className="hb-sheet"
				role="alertdialog"
				aria-modal="true"
				aria-label={title}
			>
				<p style={{ fontWeight: 650, margin: '4px 0 6px' }}>{title}</p>
				<div className="why" style={{ fontSize: 14 }}>
					{children}
				</div>
				<div className="acts">
					<button
						type="button"
						className={`btn ${danger ? 'dng' : 'pri'}`}
						onClick={onYes}
					>
						{yes}
					</button>
					<button type="button" className="btn" onClick={onNo}>
						Avbryt
					</button>
				</div>
			</div>
		</Layer>
	)
}

export function ErrorBar({ message }: { message: string }) {
	return (
		<div className="hb-bar err" role="alert">
			{message}
		</div>
	)
}

export function Sparkline({
	values,
	width = 64,
	height = 18,
}: {
	values: (number | null)[]
	width?: number
	height?: number
}) {
	const known = values.filter((v): v is number => v != null)
	if (known.length < 2) return null
	const min = Math.min(...known)
	const max = Math.max(...known)
	const span = max - min || 1
	const step = width / Math.max(1, values.length - 1)
	let d = ''
	let pen = false
	values.forEach((v, i) => {
		if (v == null) {
			pen = false
			return
		}
		const x = i * step
		const y = height - 2 - ((v - min) / span) * (height - 4)
		d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
		pen = true
	})
	return (
		<svg
			className="spark"
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			aria-hidden
		>
			<path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
		</svg>
	)
}
