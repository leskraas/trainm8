import { useState } from 'react'
import { Link } from 'react-router'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ExportDataOutput,
	type SetDisplayNameInput,
	type SetupState,
} from '#app/lab/engine/setup.types.ts'
import { BASE, ErrorLine, Sheet, Spinner } from '../__ui.tsx'
import { type Route } from './+types/konto.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const me = await runCapability(request, 'athlete', {})
	return { me: me.ok ? me.value : null, error: me.ok ? null : me.message }
}

export const meta = () => [{ title: 'Sti · Konto' }]

export default function Konto({ loaderData }: Route.ComponentProps) {
	const { me, error } = loaderData
	const setName = useCapability<SetDisplayNameInput, SetupState>(
		'set_display_name',
	)
	const exp = useCapability<Record<string, never>, ExportDataOutput>(
		'export_data',
	)
	const [name, setNameV] = useState(me?.name ?? '')
	const [err, setErr] = useState<string | null>(null)
	const [ok, setOk] = useState<string | null>(null)
	return (
		<Sheet kicker="Sekken" title="Konto" back={`${BASE}/sekk`}>
			<ErrorLine message={error} />
			{me ? (
				<div style={{ display: 'grid', gap: 16 }}>
					<form
						className="sti-card"
						style={{ display: 'grid', gap: 10 }}
						onSubmit={async (e) => {
							e.preventDefault()
							setErr(null)
							setOk(null)
							const r = await setName.call({ name: name.trim() || null })
							if (!r.ok) return setErr(r.message)
							setOk('Navnet er lagret.')
						}}
					>
						<label style={{ display: 'grid', gap: 6 }}>
							<span style={{ fontWeight: 600 }}>Navn</span>
							<input
								className="sti-field"
								value={name}
								maxLength={40}
								onChange={(e) => setNameV(e.target.value)}
								placeholder={me.username}
								autoComplete="name"
							/>
						</label>
						<p
							className="soft"
							style={{ fontSize: 14, overflowWrap: 'anywhere' }}
						>
							Brukernavn {me.username}
							{me.email ? ` · ${me.email}` : ''}
						</p>
						<button
							className="sti-btn small"
							type="submit"
							disabled={setName.pending || name === (me.name ?? '')}
							style={{ justifySelf: 'start' }}
						>
							{setName.pending ? <Spinner /> : null}
							Lagre
						</button>
					</form>
					<section className="sti-card" style={{ display: 'grid', gap: 10 }}>
						<strong>Ta med deg alt</strong>
						<p className="soft" style={{ fontSize: 14 }}>
							Alt du eier her, som en JSON-fil.
						</p>
						<button
							type="button"
							className="sti-btn quiet small"
							style={{ justifySelf: 'start' }}
							disabled={exp.pending}
							onClick={async () => {
								setErr(null)
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
								setOk('Fila er lastet ned.')
							}}
						>
							{exp.pending ? <Spinner /> : null}
							Last ned dataene mine
						</button>
					</section>
					<ErrorLine message={err} />
					{ok ? <p role="status">{ok}</p> : null}
					<Link
						to={`${BASE}/sekk/slett`}
						className="sti-btn ghost"
						style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}
					>
						Visk ut stien …
					</Link>
				</div>
			) : null}
		</Sheet>
	)
}
