import { useState } from 'react'
import { Link } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ExportDataOutput,
	type SetupState,
} from '#app/lab/engine/setup.types.ts'
import { BASE } from '../__lib.ts'
import { NameSheet } from '../__sheets.tsx'
import { ErrorLine, cx, useWrite } from '../__ui.tsx'
import { type Route } from './+types/konto.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [setup, athlete] = await Promise.all([
		runCapability(request, 'get_setup', {}),
		runCapability(request, 'athlete', {}),
	])
	if (!setup.ok || !athlete.ok)
		throw new Response('Fikk ikke lest kontoen.', { status: 500 })
	return { setup: setup.value as SetupState, me: athlete.value }
}

export const meta = () => [{ title: 'Brev · konto' }]

export async function downloadExport(
	call: () => Promise<{ ok: boolean; value?: ExportDataOutput }>,
) {
	const r = await call()
	if (!r.ok || !r.value) return false
	const blob = new Blob([JSON.stringify(r.value.data, null, 2)], {
		type: 'application/json',
	})
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = r.value.fileName
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 2000)
	return true
}

export default function Konto({ loaderData }: Route.ComponentProps) {
	const { setup, me } = loaderData
	const a = setup.answers
	const [nameOpen, setNameOpen] = useState(false)
	const nameW = useWrite('set_display_name')
	const prefs = useWrite<{ adjustAutomatically: boolean }, SetupState>(
		'set_preferences',
	)
	const exp = useWrite<Record<string, never>, ExportDataOutput>('export_data')
	const [exported, setExported] = useState(false)
	return (
		<main className="b-col">
			<Link
				to={me.setup.complete ? `${BASE}/arkiv` : `${BASE}/velkommen`}
				className="b-back"
			>
				← {me.setup.complete ? 'Arkivet' : 'Introduksjonsbrevet'}
			</Link>
			<article className="b-sheet">
				<p
					className="b-small"
					style={{
						margin: 0,
						letterSpacing: '.06em',
						textTransform: 'uppercase',
					}}
				>
					Konto
				</p>
				<h1 className="b-h" style={{ marginTop: 6, overflowWrap: 'anywhere' }}>
					{a.displayName || me.username}
				</h1>
				<p className="b-p" style={{ overflowWrap: 'anywhere' }}>
					Brukernavn <span className="b-num">{me.username}</span>
					{me.email ? (
						<>
							, e-post <span className="b-num">{me.email}</span>
						</>
					) : null}
					.{' '}
					<button
						type="button"
						className="b-word"
						onClick={() => setNameOpen(true)}
					>
						Endre navnet i brevene
					</button>
				</p>

				<h2 className="b-h2">Når uka lukkes</h2>
				<p className="b-p">
					{a.adjustAutomatically
						? 'Søndag kveld justerer jeg neste uke selv ut fra det du gjorde, og skriver hva jeg endret. Alt kan angres til uka begynner.'
						: 'Søndag kveld foreslår jeg endringer for neste uke og venter på et ja. Det som bare letter, gjør jeg morgenen etter om du ikke svarer.'}
				</p>
				<div className="b-row">
					<button
						type="button"
						className={cx('b-btn', !a.adjustAutomatically && 'b-btn-ghost')}
						aria-pressed={a.adjustAutomatically}
						disabled={prefs.pending}
						onClick={() => void prefs.call({ adjustAutomatically: true })}
					>
						Juster selv
					</button>
					<button
						type="button"
						className={cx('b-btn', a.adjustAutomatically && 'b-btn-ghost')}
						aria-pressed={!a.adjustAutomatically}
						disabled={prefs.pending}
						onClick={() => void prefs.call({ adjustAutomatically: false })}
					>
						Spør meg først
					</button>
				</div>
				<ErrorLine message={prefs.error} />

				<h2 className="b-h2">Dataene dine</h2>
				<p className="b-p">
					Alt jeg har om deg, som én JSON-fil: svarene dine, planen, øktene og
					brevene.
				</p>
				<button
					type="button"
					className="b-btn b-btn-ghost"
					disabled={exp.pending}
					onClick={async () =>
						setExported(
							await downloadExport(() => exp.call({}, { revalidate: false })),
						)
					}
				>
					{exp.pending ? 'Pakker …' : 'Last ned alt'}
				</button>
				{exported ? (
					<p className="b-small b-ok b-fade-in">Lastet ned.</p>
				) : null}
				<ErrorLine message={exp.error} />

				<hr className="b-rule" />
				<p className="b-p" style={{ marginBottom: 0 }}>
					<Link
						to={`${BASE}/arkiv/slett`}
						className="b-word"
						style={{ color: 'var(--red)' }}
					>
						Brenn alle brevene
					</Link>
				</p>
				<p className="b-small">
					Sletter kontoen og alt i den. Kan ikke angres.
				</p>
			</article>
			<NameSheet
				open={nameOpen}
				onClose={() => setNameOpen(false)}
				initial={a.displayName ?? ''}
				write={nameW}
			/>
		</main>
	)
}
