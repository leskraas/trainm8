import { useState } from 'react'
import { useCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type SetThresholdsInput,
	type SetThresholdsOutput,
	type SportThresholds,
	type ThresholdValues,
	type Zone,
} from '#app/lab/engine/setup.types.ts'
import {
	BASE,
	ErrorLine,
	Sheet,
	Spinner,
	fmtDay,
	fmtPace,
	sportWord,
} from '../__ui.tsx'
import { type Route } from './+types/kart.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const t = await runCapability(request, 'thresholds', {})
	return { data: t.ok ? t.value : null, error: t.ok ? null : t.message }
}

export const meta = () => [{ title: 'Sti · Kart' }]

type Key = keyof ThresholdValues
const FIELDS: Record<
	string,
	{ key: Key; label: string; unit: 'bpm' | 'W' | 'pace' | 'pace100' }[]
> = {
	run: [
		{ key: 'thresholdPacePerKm', label: 'Terskelfart', unit: 'pace' },
		{ key: 'lthr', label: 'Terskelpuls', unit: 'bpm' },
		{ key: 'maxHr', label: 'Makspuls', unit: 'bpm' },
		{ key: 'runPower', label: 'Terskelwatt (løp)', unit: 'W' },
	],
	bike: [
		{ key: 'ftp', label: 'FTP', unit: 'W' },
		{ key: 'lthr', label: 'Terskelpuls', unit: 'bpm' },
		{ key: 'maxHr', label: 'Makspuls', unit: 'bpm' },
	],
	swim: [
		{ key: 'cssPer100m', label: 'CSS', unit: 'pace100' },
		{ key: 'maxHr', label: 'Makspuls', unit: 'bpm' },
	],
}

function show(v: number, unit: string) {
	if (unit === 'pace') return fmtPace(v)
	if (unit === 'pace100') return fmtPace(v, '100m')
	return `${Math.round(v)}${unit === 'bpm' ? '' : ' W'}`
}
function parse(text: string, unit: string) {
	const t = text.trim()
	if (!t) return null
	if (unit === 'pace' || unit === 'pace100') {
		const m = /^(\d{1,2})[:.,](\d{2})$/.exec(t)
		if (m) return Number(m[1]) * 60 + Number(m[2])
		return Number.isFinite(Number(t)) ? Number(t) : NaN
	}
	return Number(t.replace(',', '.'))
}

export default function Kart({ loaderData }: Route.ComponentProps) {
	const { data, error } = loaderData
	return (
		<Sheet
			kicker="Sekken"
			title="Kart: terskler og soner"
			back={`${BASE}/sekk`}
		>
			<ErrorLine message={error} />
			<p
				className="soft"
				style={{ fontSize: 14, marginBottom: 14, lineHeight: 1.45 }}
			>
				Tersklene er kartet stien leses med. Endrer du dem, regnes målene i de
				planlagte stegene om.
			</p>
			<div style={{ display: 'grid', gap: 14 }}>
				{data?.sports.map((s) => (
					<SportMap key={s.sport} s={s} />
				))}
			</div>
		</Sheet>
	)
}

function SportMap({ s }: { s: SportThresholds }) {
	const set = useCapability<SetThresholdsInput, SetThresholdsOutput>(
		'set_thresholds',
	)
	const fields = FIELDS[s.sport] ?? []
	const [vals, setVals] = useState<Record<string, string>>(() =>
		Object.fromEntries(
			fields.map((f) => [
				f.key,
				s.values[f.key] !== null
					? show(s.values[f.key]!, f.unit)
							.replace(/ \/(km|100 m)$/, '')
							.replace(' W', '')
					: '',
			]),
		),
	)
	const [err, setErr] = useState<string | null>(null)
	const [ok, setOk] = useState(false)
	async function save() {
		setErr(null)
		setOk(false)
		const input: SetThresholdsInput = { sport: s.sport }
		for (const f of fields) {
			const v = parse(vals[f.key] ?? '', f.unit)
			if (v === null) continue
			if (Number.isNaN(v))
				return setErr(
					`${f.label}: skriv et tall${f.unit.startsWith('pace') ? ' som 4:10' : ''}.`,
				)
			if (v !== s.values[f.key]) (input as Record<string, unknown>)[f.key] = v
		}
		if (Object.keys(input).length === 1) return setErr('Ingenting er endret.')
		const r = await set.call(input)
		if (!r.ok) return setErr(r.message)
		setOk(true)
	}
	return (
		<section className="sti-card" style={{ display: 'grid', gap: 12 }}>
			<h2 style={{ fontSize: 17, fontWeight: 700 }}>{sportWord(s.sport)}</h2>
			<div style={{ display: 'grid', gap: 8 }}>
				{fields.map((f) => (
					<label
						key={f.key}
						style={{ display: 'flex', alignItems: 'center', gap: 10 }}
					>
						<span style={{ flex: 1 }}>{f.label}</span>
						<input
							className="sti-field num"
							inputMode={f.unit.startsWith('pace') ? 'text' : 'numeric'}
							value={vals[f.key] ?? ''}
							placeholder={f.unit.startsWith('pace') ? 'm:ss' : 'ikke satt'}
							onChange={(e) =>
								setVals((v) => ({ ...v, [f.key]: e.target.value }))
							}
							style={{ width: 110, textAlign: 'right' }}
						/>
						<span className="soft" style={{ width: 54, fontSize: 13 }}>
							{f.unit === 'pace'
								? '/km'
								: f.unit === 'pace100'
									? '/100 m'
									: f.unit === 'bpm'
										? 'slag'
										: 'W'}
						</span>
					</label>
				))}
			</div>
			{s.zoneSystems.length > 1 ? (
				<div
					role="radiogroup"
					aria-label="Sonesystem"
					style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
				>
					{s.zoneSystems.map((z) => (
						<button
							key={z.id}
							type="button"
							role="radio"
							aria-checked={s.zoneSystem?.id === z.id}
							className="sti-chip"
							disabled={set.pending}
							onClick={async () => {
								const r = await set.call({ sport: s.sport, zoneSystem: z.id })
								setErr(r.ok ? null : r.message)
							}}
						>
							{z.name}
						</button>
					))}
				</div>
			) : null}
			{s.zoneSystem?.chosenBy === 'app' ? (
				<p className="soft" style={{ fontSize: 13 }}>
					Sonesystemet er valgt av appen.
				</p>
			) : null}
			<ErrorLine message={err} />
			<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
				<button
					type="button"
					className="sti-btn small"
					onClick={save}
					disabled={set.pending}
				>
					{set.pending ? <Spinner /> : null}
					Lagre
				</button>
				{ok ? (
					<span role="status" style={{ fontSize: 14 }}>
						Lagret. Målene er regnet om.
					</span>
				) : null}
			</div>
			<Zones zones={s.zones} />
			{s.history.length ? (
				<details>
					<summary
						style={{
							cursor: 'pointer',
							minHeight: 44,
							display: 'flex',
							alignItems: 'center',
						}}
					>
						Endringer ({s.history.length})
					</summary>
					{s.history.slice(0, 20).map((h, i) => (
						<p key={i} className="soft num" style={{ fontSize: 13 }}>
							{fmtDay(h.date)}:{' '}
							{fields.find((f) => f.key === h.what)?.label ?? h.what}{' '}
							{show(
								h.value,
								fields.find((f) => f.key === h.what)?.unit ?? 'bpm',
							)}
						</p>
					))}
				</details>
			) : null}
		</section>
	)
}

function Zones({ zones }: { zones: Zone[] }) {
	if (!zones.length) return null
	return (
		<div style={{ display: 'grid', gap: 4 }}>
			{zones.map((z, i) => (
				<div
					key={z.label}
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						fontSize: 14,
					}}
				>
					<span
						style={{
							width: 8 + i * 6,
							height: 14,
							borderRadius: 3,
							background: `color-mix(in oklab, var(--t1) ${Math.round((i / Math.max(1, zones.length - 1)) * 100)}%, var(--t0))`,
							flexShrink: 0,
						}}
					/>
					<strong style={{ width: 40 }}>{z.label}</strong>
					<span style={{ flex: 1, minWidth: 0 }} className="soft">
						{z.description}
					</span>
					<span className="num" style={{ whiteSpace: 'nowrap' }}>
						{z.range ? (
							z.range.unit === 'sec-per-km' ||
							z.range.unit === 'sec-per-100m' ? (
								`${fmtPace(z.range.min, z.range.unit === 'sec-per-km' ? 'km' : '100m').split(' ')[0]}${z.range.max !== null ? `–${fmtPace(z.range.max).split(' ')[0]}` : '+'}`
							) : (
								`${Math.round(z.range.min)}${z.range.max !== null ? `–${Math.round(z.range.max)}` : '+'} ${z.range.unit === 'bpm' ? 'slag' : 'W'}`
							)
						) : (
							<i className="soft" title={z.why}>
								ukjent
							</i>
						)}
					</span>
				</div>
			))}
			{zones.some((z) => !z.range && z.why) ? (
				<p className="soft" style={{ fontSize: 13 }}>
					{zones.find((z) => !z.range && z.why)?.why}
				</p>
			) : null}
		</div>
	)
}
