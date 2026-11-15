import { useEffect, useState } from 'react'
import { useLoaderData, useRevalidator } from 'react-router'
import { type ProposalsOutput } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/endringer.ts'
import { cap } from './__api.ts'
import { athleteOrStart } from './__load.server.ts'
import { BackDown } from './__nav.tsx'
import { ArrowBack } from './__ui.tsx'
import {
	readChanges,
	undoChange,
	updateChange,
	type Change,
} from './__undo.tsx'

export const meta = () => [{ title: 'Siste endringer · Tommel' }]

export async function loader({ request }: Route.LoaderArgs) {
	await athleteOrStart(request)
	const p = await runCapability(request, 'proposals', {})
	return {
		proposals: p.ok ? (p.value as ProposalsOutput) : null,
		error: p.ok ? null : p.message,
	}
}

function when(iso: string) {
	return new Date(iso).toLocaleString('nb-NO', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	})
}

type Row = {
	id: string
	text: string
	sub: string
	state: 'open' | 'done' | 'closed'
	msg?: string
	run?: () => Promise<{ ok: boolean; message?: string }>
}

export default function Endringer() {
	const { proposals, error } = useLoaderData<typeof loader>()
	const revalidator = useRevalidator()
	const [local, setLocal] = useState<Change[] | null>(null)
	const [busy, setBusy] = useState<string | null>(null)
	const [msgs, setMsgs] = useState<Record<string, string>>({})
	useEffect(() => setLocal(readChanges()), [])

	const rows: Row[] = []
	for (const c of local ?? [])
		rows.push({
			id: `l-${c.id}`,
			text: c.text,
			sub: `Du sa ja · ${when(c.at)}`,
			state: c.undone ? 'done' : 'open',
			msg: c.failed,
			run: async () => {
				const r = await undoChange(c)
				if (r.ok) updateChange(c.id, { undone: true })
				else updateChange(c.id, { failed: r.message })
				setLocal(readChanges())
				return r.ok ? { ok: true } : { ok: false, message: r.message }
			},
		})
	const cm = proposals?.changesMade
	for (const c of cm?.changes ?? [])
		if (c.kind === 'changed')
			rows.push({
				id: `a-${c.proposalId}`,
				text: c.text,
				sub: `Planen gjorde det selv · ${cm!.heading}`,
				state:
					c.undo === 'offered'
						? 'open'
						: c.undo === 'undone'
							? 'done'
							: 'closed',
				run: async () => {
					const r = await cap('undo_change', { proposalId: c.proposalId })
					return r.ok ? { ok: true } : { ok: false, message: r.message }
				},
			})
	for (const p of proposals?.proposals ?? [])
		if (
			(p.state === 'accepted' || p.state === 'applied-silently') &&
			p.kind !== 'keep' &&
			!rows.some((r) => r.id === `a-${p.id}`)
		)
			rows.push({
				id: `p-${p.id}`,
				text: p.headline,
				sub:
					p.stateLabel ??
					(p.state === 'accepted' ? 'Du sa ja' : 'Gjort stille'),
				state: 'open',
				run: async () => {
					const r = await cap('undo_change', { proposalId: p.id })
					return r.ok ? { ok: true } : { ok: false, message: r.message }
				},
			})

	async function undo(r: Row) {
		if (!r.run) return
		setBusy(r.id)
		const res = await r.run()
		setBusy(null)
		setMsgs((m) => ({
			...m,
			[r.id]: res.ok ? 'Angret.' : (res.message ?? 'Kunne ikke angres.'),
		}))
		if (res.ok) void revalidator.revalidate()
	}

	return (
		<main
			className="tm-deck"
			aria-label="Siste endringer"
			style={{ gridTemplateRows: 'auto minmax(0,1fr)' }}
		>
			<div style={{ padding: '0 4px' }}>
				<BackDown />
			</div>
			<div className="tm-cardzone" style={{ paddingBottom: 8 }}>
				<div className="tm-rise" style={{ width: '100%' }}>
					<div className="tm-card" style={{ width: '100%' }}>
						<div className="tm-topic">Endring</div>
						<h1 className="tm-q">Siste endringer</h1>
						<p className="tm-reason">
							Alt du har sagt ja til, og det planen gjorde selv. Angre så lenge
							det går.
						</p>
						<div className="tm-card-scroll" style={{ marginTop: 14 }}>
							{error ? <p className="tm-err">{error}</p> : null}
							{local === null ? (
								<p className="tm-wait">
									<span className="tm-dots">Henter</span>
								</p>
							) : rows.length === 0 ? (
								<p className="tm-reason">
									Ingen endringer ennå. Når du sier ja til et kort som endrer
									planen, havner det her.
								</p>
							) : (
								<div className="tm-rows">
									{rows.map((r) => {
										const msg = msgs[r.id] ?? r.msg
										return (
											<div
												key={r.id}
												className="tm-row"
												style={{
													gridTemplateColumns: 'minmax(0,1fr) auto',
													alignItems: 'center',
												}}
											>
												<div style={{ color: 'var(--ink)' }}>
													<div style={{ overflowWrap: 'anywhere' }}>
														{r.text}
													</div>
													<div style={{ fontSize: 13, color: 'var(--ink2)' }}>
														{r.sub}
													</div>
													{msg ? (
														<div
															style={{
																fontSize: 13,
																color:
																	msgs[r.id] === 'Angret.'
																		? 'var(--yes)'
																		: 'var(--over)',
															}}
														>
															{msg}
														</div>
													) : null}
												</div>
												<div>
													{r.state === 'open' && msgs[r.id] !== 'Angret.' ? (
														<button
															type="button"
															className="tm-chip"
															disabled={busy === r.id}
															onClick={() => void undo(r)}
															style={{
																display: 'inline-flex',
																alignItems: 'center',
																gap: 6,
															}}
														>
															<ArrowBack size={16} />
															{busy === r.id ? '…' : 'Angre'}
														</button>
													) : (
														<span
															style={{ fontSize: 13, color: 'var(--ink2)' }}
														>
															{r.state === 'done' || msgs[r.id] === 'Angret.'
																? 'Angret'
																: 'For sent'}
														</span>
													)}
												</div>
											</div>
										)
									})}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</main>
	)
}
