import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type DeleteAccountInput,
	type DeleteAccountOutput,
	type ExportDataOutput,
} from '#app/lab/engine/setup.types.ts'
import {
	BASE,
	EmptyTrail,
	ErrorLine,
	Sheet,
	Spinner,
	plural,
	useReducedMotion,
} from '../__ui.tsx'
import { type Route } from './+types/slett.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const me = await runCapability(request, 'athlete', {})
	return { me: me.ok ? me.value : null, error: me.ok ? null : me.message }
}

export const meta = () => [{ title: 'Sti · Visk ut stien' }]

const HOLD_MS = 2000

export default function Slett({ loaderData }: Route.ComponentProps) {
	const { me, error } = loaderData
	const del = useCapability<DeleteAccountInput, DeleteAccountOutput>(
		'delete_account',
	)
	const exp = useCapability<Record<string, never>, ExportDataOutput>(
		'export_data',
	)
	const reduce = useReducedMotion()
	const [typed, setTyped] = useState('')
	const [holding, setHolding] = useState(false)
	const [err, setErr] = useState<string | null>(null)
	const [gone, setGone] = useState<DeleteAccountOutput | null>(null)
	const timer = useRef(0)
	useEffect(() => () => window.clearTimeout(timer.current), [])
	const armed = typed.trim() === 'SLETT'

	if (gone) {
		return (
			<main
				style={{
					minHeight: '100dvh',
					display: 'grid',
					placeItems: 'center',
					padding: 24,
					textAlign: 'center',
				}}
			>
				<div style={{ display: 'grid', gap: 18 }}>
					<EmptyTrail height={180} />
					<p style={{ fontSize: 20, fontWeight: 650 }}>Stien er visket ut.</p>
					<p className="soft">
						{gone.workoutsErased
							? `${plural(gone.workoutsErased, 'økt', 'økter')} er borte. `
							: ''}
						Takk for turen.
					</p>
					<a href="/" className="sti-btn">
						Til start
					</a>
				</div>
			</main>
		)
	}

	async function fire() {
		setHolding(false)
		setErr(null)
		const r = await del.call({ confirm: 'SLETT' }, { revalidate: false })
		if (!r.ok) return setErr(r.message)
		setGone(r.value)
	}

	const connected = me?.sources.filter((s) => s.status !== 'disconnected') ?? []
	return (
		<Sheet kicker="Konto" title="Visk ut stien" back={`${BASE}/sekk/konto`}>
			<ErrorLine message={error} />
			<p style={{ fontSize: 16, lineHeight: 1.5 }}>
				Alt forsvinner, for godt. Det kan ikke angres.
			</p>
			<ul style={{ margin: '12px 0', paddingLeft: 20, lineHeight: 1.7 }}>
				<li className="num">
					{me
						? plural(me.recordings.count, 'økt fra klokka', 'økter fra klokka')
						: 'Alle øktene dine'}
					, og alle steg du har gått
				</li>
				<li>
					{me?.plan.exists ? 'Stien (planen) og flagget' : 'Svarene i sekken'}
				</li>
				<li>
					{connected.length
						? `Koblingene: ${connected.map((s) => s.name).join(', ')}`
						: 'Alle koblinger'}
				</li>
				<li>Kontoen din. Du blir logget ut.</li>
			</ul>
			<button
				type="button"
				className="sti-btn quiet small"
				disabled={exp.pending}
				onClick={async () => {
					const r = await exp.call({}, { revalidate: false })
					if (!r.ok) return setErr(r.message)
					const url = URL.createObjectURL(
						new Blob([JSON.stringify(r.value.data, null, 2)], {
							type: 'application/json',
						}),
					)
					const a = document.createElement('a')
					a.href = url
					a.download = r.value.fileName
					a.click()
					window.setTimeout(() => URL.revokeObjectURL(url), 2000)
				}}
			>
				{exp.pending ? <Spinner /> : null}
				Ta med en kopi først
			</button>
			<label style={{ display: 'grid', gap: 6, marginTop: 20 }}>
				<span style={{ fontWeight: 600 }}>Skriv SLETT for å låse opp</span>
				<input
					className="sti-field"
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					autoCapitalize="characters"
					autoCorrect="off"
					autoComplete="off"
					spellCheck={false}
				/>
			</label>
			<svg
				viewBox="0 0 120 120"
				width="120"
				height="120"
				aria-hidden
				style={{ display: 'block', margin: '20px auto 8px' }}
			>
				<path
					d="M60 112 C 30 90, 92 64, 56 36 S 70 10, 62 6"
					fill="none"
					stroke="var(--ink)"
					strokeWidth="4"
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray="1 1"
					style={{
						strokeDashoffset: holding ? (reduce ? 0 : 1) : 0,
						opacity: holding && reduce ? 0.2 : 1,
						transition: holding
							? `stroke-dashoffset ${HOLD_MS}ms linear, opacity ${HOLD_MS}ms linear`
							: 'stroke-dashoffset 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms ease',
					}}
				/>
				<circle cx="60" cy="112" r="6" fill="var(--dot)" />
			</svg>
			<button
				type="button"
				className="sti-btn danger wide"
				disabled={!armed || del.pending}
				aria-describedby="sti-hold-hint"
				onPointerDown={(e) => {
					if (!armed) return
					e.currentTarget.setPointerCapture(e.pointerId)
					setHolding(true)
					timer.current = window.setTimeout(fire, HOLD_MS)
				}}
				onPointerUp={() => {
					window.clearTimeout(timer.current)
					setHolding(false)
				}}
				onPointerCancel={() => {
					window.clearTimeout(timer.current)
					setHolding(false)
				}}
				onKeyDown={(e) => {
					if ((e.key === 'Enter' || e.key === ' ') && armed && !e.repeat) {
						e.preventDefault()
						setHolding(true)
						timer.current = window.setTimeout(fire, HOLD_MS)
					}
				}}
				onKeyUp={() => {
					window.clearTimeout(timer.current)
					setHolding(false)
				}}
				style={{ position: 'relative', overflow: 'hidden' }}
			>
				<span
					aria-hidden
					style={{
						position: 'absolute',
						inset: 0,
						background: 'rgba(0,0,0,.25)',
						clipPath: holding ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)',
						transition: holding
							? `clip-path ${HOLD_MS}ms linear`
							: 'clip-path 200ms cubic-bezier(0.23, 1, 0.32, 1)',
					}}
				/>
				<span style={{ position: 'relative' }}>
					{del.pending ? (
						<Spinner />
					) : holding ? (
						'Hold …'
					) : (
						'Hold for å viske ut'
					)}
				</span>
			</button>
			<p
				id="sti-hold-hint"
				className="soft"
				style={{ fontSize: 13, marginTop: 8, textAlign: 'center' }}
			>
				Hold i to sekunder. Slipper du før, skjer ingenting.
			</p>
			<ErrorLine message={err} />
			<Link
				to={`${BASE}/sekk/konto`}
				className="sti-link"
				style={{ marginTop: 12 }}
			>
				Nei, behold stien
			</Link>
		</Sheet>
	)
}
