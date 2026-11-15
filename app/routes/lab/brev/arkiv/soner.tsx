import { useState } from 'react'
import { Link } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type SetThresholdsInput,
	type SportThresholds,
	type ThresholdValues,
	type ThresholdsOutput,
	type Zone,
} from '#app/lab/engine/setup.types.ts'
import { BASE, dateText, n0, paceText } from '../__lib.ts'
import { ErrorLine, N, Unknown, useWrite } from '../__ui.tsx'
import { type Route } from './+types/soner.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const t = await runCapability(request, 'thresholds', {})
	return {
		t: t.ok ? (t.value as ThresholdsOutput) : null,
		error: t.ok ? null : t.message,
	}
}

export const meta = () => [{ title: 'Brev · soner og terskler' }]

type Key = keyof ThresholdValues
const FIELDS: Record<
	string,
	{ key: Key; label: string; kind: 'bpm' | 'watt' | 'pace' | 'css' }[]
> = {
	run: [
		{ key: 'thresholdPacePerKm', label: 'Terskelfart', kind: 'pace' },
		{ key: 'lthr', label: 'Terskelpuls', kind: 'bpm' },
		{ key: 'maxHr', label: 'Makspuls', kind: 'bpm' },
		{ key: 'runPower', label: 'Terskelwatt (løp)', kind: 'watt' },
	],
	bike: [
		{ key: 'ftp', label: 'FTP', kind: 'watt' },
		{ key: 'lthr', label: 'Terskelpuls', kind: 'bpm' },
		{ key: 'maxHr', label: 'Makspuls', kind: 'bpm' },
	],
	swim: [{ key: 'cssPer100m', label: 'CSS', kind: 'css' }],
}
const SPORT_TITLE: Record<string, string> = {
	run: 'Løping',
	bike: 'Sykkel',
	swim: 'Svømming',
}
const WHAT: Record<string, string> = {
	maxHr: 'makspuls',
	lthr: 'terskelpuls',
	ftp: 'FTP',
	runPower: 'terskelwatt',
	thresholdPacePerKm: 'terskelfart',
	cssPer100m: 'CSS',
}

function show(kind: string, v: number) {
	if (kind === 'pace') return paceText(v)
	if (kind === 'css') return paceText(v, '100m')
	if (kind === 'watt') return `${n0(v)} W`
	return `${n0(v)} slag/min`
}

function parseTime(s: string) {
	const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
	if (m) return Number(m[1]) * 60 + Number(m[2])
	const n = Number(s.replace(',', '.'))
	return Number.isFinite(n) ? n : NaN
}

function zoneRange(z: Zone) {
	const r = z.range
	if (!r) return null
	const f = (v: number) =>
		r.unit === 'sec-per-km'
			? paceText(v).replace(' /km', '')
			: r.unit === 'sec-per-100m'
				? paceText(v, '100m').replace(' /100 m', '')
				: n0(v)
	const unit =
		r.unit === 'bpm'
			? 'slag/min'
			: r.unit === 'watt'
				? 'W'
				: r.unit === 'sec-per-km'
					? '/km'
					: '/100 m'
	return `${f(r.min)}${r.max !== null ? `–${f(r.max)}` : '+'} ${unit}`
}

export default function Soner({ loaderData }: Route.ComponentProps) {
	const { t, error } = loaderData
	return (
		<main className="b-col">
			<Link to={`${BASE}/arkiv`} className="b-back">
				← Arkivet
			</Link>
			<h1 className="b-h" style={{ margin: '4px 4px 6px' }}>
				Soner og terskler
			</h1>
			<p className="b-small" style={{ margin: '0 4px 18px' }}>
				Det eneste rene skjemaet i appen. Når du endrer en terskel, regner jeg
				målene i de planlagte øktene om.
			</p>
			{t ? (
				t.sports.map((s) => <SportForm key={s.sport} s={s} />)
			) : (
				<ErrorLine message={error} />
			)}
		</main>
	)
}

function SportForm({ s }: { s: SportThresholds }) {
	const fields = FIELDS[s.sport] ?? []
	const [vals, setVals] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			fields.map((f) => {
				const v = s.values[f.key]
				return [
					f.key,
					v === null
						? ''
						: f.kind === 'pace' || f.kind === 'css'
							? paceText(v).replace(/ \/.*/, '')
							: String(v),
				]
			}),
		),
	)
	const [saved, setSaved] = useState(false)
	const write = useWrite<SetThresholdsInput, SportThresholds>('set_thresholds')
	const zoneW = useWrite<SetThresholdsInput, SportThresholds>('set_thresholds')
	const [localError, setLocalError] = useState<string | null>(null)
	return (
		<section className="b-sheet" aria-labelledby={`s-${s.sport}`}>
			<h2 id={`s-${s.sport}`} className="b-h2" style={{ marginTop: 0 }}>
				{SPORT_TITLE[s.sport] ?? s.sport}
			</h2>
			<form
				onSubmit={async (e) => {
					e.preventDefault()
					setSaved(false)
					setLocalError(null)
					const input: SetThresholdsInput = { sport: s.sport }
					for (const f of fields) {
						const raw = vals[f.key]?.trim() ?? ''
						if (!raw) continue
						const v =
							f.kind === 'pace' || f.kind === 'css'
								? parseTime(raw)
								: Number(raw)
						if (!Number.isFinite(v)) {
							setLocalError(
								`${f.label}: skriv ${f.kind === 'pace' ? 'mm:ss per km' : f.kind === 'css' ? 'm:ss per 100 m' : 'et tall'}.`,
							)
							return
						}
						if (v !== s.values[f.key])
							(input as Record<string, unknown>)[f.key] = v
					}
					if (Object.keys(input).length === 1) {
						setLocalError('Ingenting er endret.')
						return
					}
					const r = await write.call(input)
					if (r.ok) setSaved(true)
				}}
			>
				<table className="b-table">
					<tbody>
						{fields.map((f) => (
							<tr key={f.key}>
								<td style={{ width: '45%' }}>
									<label htmlFor={`${s.sport}-${f.key}`}>{f.label}</label>
									<span className="b-small" style={{ display: 'block' }}>
										{s.values[f.key] !== null ? (
											<N>{show(f.kind, s.values[f.key]!)}</N>
										) : (
											<Unknown>ikke satt</Unknown>
										)}
									</span>
								</td>
								<td>
									<input
										id={`${s.sport}-${f.key}`}
										className="b-input"
										inputMode={
											f.kind === 'pace' || f.kind === 'css' ? 'text' : 'numeric'
										}
										value={vals[f.key] ?? ''}
										onChange={(e) =>
											setVals((v) => ({ ...v, [f.key]: e.target.value }))
										}
										placeholder={
											f.kind === 'pace'
												? '4:30'
												: f.kind === 'css'
													? '1:45'
													: f.kind === 'watt'
														? '250'
														: '170'
										}
										autoComplete="off"
										style={{ fontFamily: 'var(--mono)' }}
									/>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<div className="b-row" style={{ marginTop: 12 }}>
					<button type="submit" className="b-btn" disabled={write.pending}>
						{write.pending ? 'Lagrer …' : 'Lagre'}
					</button>
					{saved ? (
						<span className="b-ok b-fade-in">Lagret. Øktene er regnet om.</span>
					) : null}
				</div>
				<ErrorLine message={localError ?? write.error} />
			</form>

			{s.zoneSystems.length ? (
				<div style={{ marginTop: 18 }}>
					<p className="b-label">
						Sonesystem{' '}
						{s.zoneSystem?.chosenBy === 'app' ? '(valgt av meg)' : ''}
					</p>
					<div
						id={`zs-${s.sport}`}
						role="radiogroup"
						aria-label="Sonesystem"
						className="b-menu"
					>
						{s.zoneSystems.map((z) => (
							<button
								key={z.id}
								type="button"
								role="radio"
								aria-checked={s.zoneSystem?.id === z.id}
								className="b-choice"
								disabled={zoneW.pending}
								onClick={() =>
									void zoneW.call({ sport: s.sport, zoneSystem: z.id })
								}
							>
								<span>{z.name}</span>
								<span className="b-check">✓</span>
							</button>
						))}
					</div>
					<ErrorLine message={zoneW.error} />
				</div>
			) : null}

			<table className="b-table" style={{ marginTop: 14 }}>
				<thead>
					<tr>
						<th scope="col">Sone</th>
						<th scope="col">Område</th>
					</tr>
				</thead>
				<tbody>
					{s.zones.map((z) => (
						<tr key={z.label}>
							<td>
								<N>{z.label}</N>
								{z.description ? (
									<span className="b-small" style={{ display: 'block' }}>
										{z.description}
									</span>
								) : null}
							</td>
							<td>
								{zoneRange(z) ? (
									<N>{zoneRange(z)}</N>
								) : (
									<Unknown why={z.why}>ukjent</Unknown>
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			{s.history.length ? (
				<p className="b-small" style={{ marginTop: 12 }}>
					Endret før:{' '}
					{s.history
						.slice(-4)
						.map((h) => `${WHAT[h.what] ?? h.what} ${dateText(h.date)}`)
						.join(', ')}
					.
				</p>
			) : null}
		</section>
	)
}
