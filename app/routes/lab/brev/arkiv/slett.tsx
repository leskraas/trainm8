import { useState } from 'react'
import { Link } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type DeleteAccountOutput,
	type ExportDataOutput,
} from '#app/lab/engine/setup.types.ts'
import { BASE, isoWeek, daysBetween } from '../__lib.ts'
import { clearPs } from '../__ps.ts'
import { ErrorLine, N, useWrite } from '../__ui.tsx'
import { type Route } from './+types/slett.ts'
import { downloadExport } from './konto.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const athlete = await runCapability(request, 'athlete', {})
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	const me = athlete.value
	const letters =
		me.plan.firstWeek && me.setup.complete && me.plan.firstWeek <= me.today
			? Math.max(
					1,
					Math.floor(daysBetween(me.plan.firstWeek, me.today) / 7) + 1,
				)
			: 0
	return {
		username: me.username,
		recordings: me.recordings.count,
		letters,
		sources: me.sources
			.filter((s) => s.status !== 'disconnected')
			.map((s) => s.name),
		hasGoal: me.setup.hasGoal,
		hasPlan: me.setup.hasPlan,
		week: isoWeek(me.today),
	}
}

export const meta = () => [{ title: 'Brev · brenn alle brevene' }]

export default function Slett({ loaderData }: Route.ComponentProps) {
	const d = loaderData
	const [word, setWord] = useState('')
	const [gone, setGone] = useState<DeleteAccountOutput | null>(null)
	const del = useWrite<{ confirm: string }, DeleteAccountOutput>(
		'delete_account',
	)
	const exp = useWrite<Record<string, never>, ExportDataOutput>('export_data')
	const ok = word.trim().toLowerCase() === 'slett'

	if (gone) {
		return (
			<main
				className="b-col"
				style={{ display: 'flex', alignItems: 'center', minHeight: '100dvh' }}
			>
				<article
					className="b-sheet b-new-letter"
					style={{
						width: '100%',
						minHeight: '60dvh',
						display: 'flex',
						flexDirection: 'column',
						justifyContent: 'center',
					}}
				>
					<p
						className="b-h"
						style={{
							fontWeight: 400,
							fontStyle: 'italic',
							textAlign: 'center',
						}}
					>
						Alt er borte. Takk for følget.
					</p>
					<p style={{ textAlign: 'center', marginTop: 24 }}>
						<a
							href="/"
							className="b-word"
							style={{ fontSize: 16, color: 'var(--ink-2)' }}
						>
							Til forsiden
						</a>
					</p>
				</article>
			</main>
		)
	}

	return (
		<main className="b-col">
			<Link to={`${BASE}/arkiv/konto`} className="b-back">
				← Konto
			</Link>
			<article className="b-sheet">
				<h1 className="b-h">Brenn alle brevene</h1>
				<p className="b-p">
					Dette sletter kontoen din og alt i den, med en gang og for godt:
				</p>
				<ul style={{ margin: '0 0 14px', paddingLeft: 20 }}>
					<li>
						<N>{d.recordings}</N> {d.recordings === 1 ? 'økt' : 'økter'} fra
						klokka og filer
					</li>
					<li>
						{d.letters ? (
							<>
								brevene for <N>{d.letters}</N>{' '}
								{d.letters === 1 ? 'uke' : 'uker'}, og planen
							</>
						) : d.hasPlan ? (
							'planen og introduksjonsbrevet'
						) : (
							'introduksjonsbrevet (du har ingen plan ennå)'
						)}
					</li>
					<li>
						{d.sources.length
							? `koblingen${d.sources.length > 1 ? 'e' : ''} til ${d.sources.join(' og ')}`
							: 'ingen koblinger'}
					</li>
					{d.hasGoal ? <li>målet ditt</li> : null}
					<li>svarene dine, sonene og alt du har skrevet i margen</li>
				</ul>
				<p className="b-p">
					Det kan ikke angres. Vil du ha med deg noe, last det ned først.
				</p>
				<button
					type="button"
					className="b-btn b-btn-ghost"
					disabled={exp.pending}
					onClick={() =>
						void downloadExport(() => exp.call({}, { revalidate: false }))
					}
				>
					{exp.pending ? 'Pakker …' : 'Last ned alt først'}
				</button>
				<ErrorLine message={exp.error} />
				<form
					style={{ marginTop: 24 }}
					onSubmit={async (e) => {
						e.preventDefault()
						if (!ok) return
						const r = await del.call(
							{ confirm: 'SLETT' },
							{ revalidate: false },
						)
						if (r.ok) {
							clearPs()
							try {
								window.localStorage.removeItem('brev-no-watch')
								window.localStorage.removeItem('brev-not-instead')
							} catch {
								// gone anyway
							}
							setGone(r.value)
						}
					}}
				>
					<label className="b-label" htmlFor="slett-ord">
						Skriv ordet «slett» for å bekrefte
					</label>
					<input
						id="slett-ord"
						className="b-input"
						value={word}
						onChange={(e) => setWord(e.target.value)}
						autoComplete="off"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						enterKeyHint="done"
					/>
					<ErrorLine message={del.error} />
					<button
						type="submit"
						className="b-btn b-btn-red"
						style={{ width: '100%', marginTop: 12 }}
						disabled={!ok || del.pending}
					>
						{del.pending ? 'Brenner …' : 'Brenn alt'}
					</button>
				</form>
			</article>
		</main>
	)
}
