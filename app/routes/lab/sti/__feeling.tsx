import { useRef, useState } from 'react'
import { useCapability } from '#app/lab/engine/client.ts'
import {
	type NoteSessionInput,
	type NoteSessionOutput,
	type RateSessionInput,
	type RateSessionOutput,
} from '#app/lab/engine/sessions.types.ts'
import { ErrorLine, Spinner, markChange, rpeColor } from './__ui.tsx'

const RPE_WORDS: Record<number, string> = {
	1: 'Svært lett',
	2: 'Lett',
	3: 'Lett',
	4: 'Rolig, men merkbart',
	5: 'Middels',
	6: 'Ganske tungt',
	7: 'Tungt',
	8: 'Veldig tungt',
	9: 'Nesten alt',
	10: 'Alt jeg hadde',
}

/**
 * «Hvor tungt var steget?» A small slope you drag along, 1 to 10, and a note.
 * The weight colours the slab's edge on the path behind you.
 */
export function Feeling({
	sessionId,
	rpe: initialRpe,
	note: initialNote,
	allowed = true,
	why,
	onSaved,
}: {
	sessionId: string
	rpe: number | null
	note: string | null
	allowed?: boolean
	why?: string | null
	onSaved?: () => void
}) {
	const rate = useCapability<RateSessionInput, RateSessionOutput>(
		'rate_session',
	)
	const noteCap = useCapability<NoteSessionInput, NoteSessionOutput>(
		'note_session',
	)
	const [rpe, setRpe] = useState<number | null>(initialRpe)
	const [note, setNote] = useState(initialNote ?? '')
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState(false)
	const slope = useRef<SVGSVGElement>(null)
	const dragging = useRef(false)

	if (!allowed) {
		return (
			<div className="sti-fog">
				{why ?? 'Tyngden kan settes når dagen er kommet.'}
			</div>
		)
	}

	function pick(clientX: number) {
		const el = slope.current
		if (!el) return
		const r = el.getBoundingClientRect()
		const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
		setRpe(Math.max(1, Math.min(10, Math.round(t * 9) + 1)))
		setSaved(false)
	}

	async function save() {
		setError(null)
		const tasks: Promise<void>[] = []
		if (rpe !== initialRpe) {
			tasks.push(
				rate.call({ sessionId, rpe }).then((r) => {
					if (!r.ok) throw new Error(r.message)
					markChange(
						rpe ? `Tyngde ${rpe} av 10.` : 'Tyngden er fjernet.',
						r.value,
						[sessionId],
					)
				}),
			)
		}
		if ((initialNote ?? '') !== note) {
			tasks.push(
				noteCap.call({ sessionId, note }).then((r) => {
					if (!r.ok) throw new Error(r.message)
					if (rpe === initialRpe)
						markChange('Notatet er lagret.', r.value, [sessionId])
				}),
			)
		}
		try {
			await Promise.all(tasks)
			setSaved(true)
			onSaved?.()
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Fikk ikke lagret.')
		}
	}

	const W = 300
	const H = 84
	const dirty = rpe !== initialRpe || (initialNote ?? '') !== note
	return (
		<div style={{ display: 'grid', gap: 12 }}>
			<div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
				<strong style={{ fontSize: 17 }}>Hvor tungt var steget?</strong>
				<span className="num soft" style={{ marginLeft: 'auto', fontSize: 15 }}>
					{rpe ? `${rpe} · ${RPE_WORDS[rpe]}` : 'ikke satt'}
				</span>
			</div>
			<svg
				ref={slope}
				role="slider"
				tabIndex={0}
				aria-label="Tyngde fra 1 til 10"
				aria-valuemin={1}
				aria-valuemax={10}
				aria-valuenow={rpe ?? undefined}
				aria-valuetext={rpe ? `${rpe}, ${RPE_WORDS[rpe]}` : 'ikke satt'}
				viewBox={`0 0 ${W} ${H}`}
				style={{
					width: '100%',
					height: H,
					touchAction: 'none',
					cursor: 'pointer',
					outline: 'none',
				}}
				onPointerDown={(e) => {
					dragging.current = true
					;(e.currentTarget as Element).setPointerCapture(e.pointerId)
					pick(e.clientX)
				}}
				onPointerMove={(e) => dragging.current && pick(e.clientX)}
				onPointerUp={() => (dragging.current = false)}
				onPointerCancel={() => (dragging.current = false)}
				onKeyDown={(e) => {
					if (e.key === 'ArrowRight' || e.key === 'ArrowUp')
						setRpe((r) => Math.min(10, (r ?? 0) + 1))
					if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
						setRpe((r) => Math.max(1, (r ?? 2) - 1))
				}}
			>
				{Array.from({ length: 10 }, (_, i) => {
					const x = (i / 10) * W
					const w = W / 10 - 3
					const h = 12 + (i / 9) * (H - 20)
					const on = rpe !== null && i < rpe
					return (
						<rect
							key={i}
							x={x + 1.5}
							y={H - h}
							width={w}
							height={h}
							rx="3"
							fill={on ? rpeColor(i + 1) : 'var(--fog)'}
							style={{ transition: 'fill 120ms ease' }}
						/>
					)
				})}
				{rpe ? (
					<circle
						cx={((rpe - 0.5) / 10) * W}
						cy={H - (12 + ((rpe - 1) / 9) * (H - 20)) - 9}
						r="6"
						fill="var(--dot)"
					/>
				) : null}
			</svg>
			<div
				className="soft num"
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					fontSize: 12,
					marginTop: -6,
				}}
			>
				<span>1 lett</span>
				<span>10 alt</span>
			</div>
			<label style={{ display: 'grid', gap: 6 }}>
				<span style={{ fontSize: 14, fontWeight: 600 }}>Notat</span>
				<textarea
					className="sti-field"
					rows={3}
					maxLength={2000}
					value={note}
					onChange={(e) => {
						setNote(e.target.value)
						setSaved(false)
					}}
					placeholder="Hvordan gikk det? Vind, bein, humør i beina …"
					style={{ resize: 'vertical' }}
				/>
			</label>
			<ErrorLine message={error} />
			<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
				<button
					type="button"
					className="sti-btn"
					disabled={!dirty || rate.pending || noteCap.pending}
					onClick={save}
				>
					{rate.pending || noteCap.pending ? <Spinner /> : null}
					Lagre
				</button>
				{rpe !== null ? (
					<button
						type="button"
						className="sti-btn ghost small"
						onClick={() => setRpe(null)}
					>
						Fjern tyngde
					</button>
				) : null}
				{saved && !dirty ? (
					<span role="status" className="soft" style={{ fontSize: 14 }}>
						Lagret.
					</span>
				) : null}
			</div>
		</div>
	)
}
