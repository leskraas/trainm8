import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
	type SessionOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type AddSessionOutput } from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/dag.$dato.ts'
import { PsSheet } from './__lapp.tsx'
import {
	BASE,
	DAY_NAME,
	addDays,
	cap,
	dateText,
	known,
	minText,
	mondayOf,
	n0,
	n1,
	paceText,
	weekdayOf,
} from './__lib.ts'
import { addPs } from './__ps.ts'
import { DayNotes } from './__today.tsx'
import { ErrorLine, N, PsLines, Unknown, useWrite } from './__ui.tsx'

export async function loader({ request, params }: Route.LoaderArgs) {
	const date = /^\d{4}-\d{2}-\d{2}$/.test(params.dato) ? params.dato : null
	const athlete = await runCapability(request, 'athlete', {})
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	if (!date)
		return {
			date: null,
			me: athlete.value,
			week: null,
			details: {},
			error: 'Den datoen forstår jeg ikke.',
		}
	const week = await runCapability(request, 'week', { date })
	if (!week.ok)
		return {
			date,
			me: athlete.value,
			week: null,
			details: {},
			error: week.message,
		}
	const sessions = week.value.days.find((d) => d.date === date)?.sessions ?? []
	const details = await Promise.all(
		sessions.map((s) => runCapability(request, 'session', { sessionId: s.id })),
	)
	const map: Record<string, SessionOutput | null> = {}
	sessions.forEach((s, i) => {
		const d = details[i]
		map[s.id] = d && d.ok ? (d.value as SessionOutput) : null
	})
	return {
		date,
		me: athlete.value,
		week: week.value as WeekOutput,
		details: map,
		error: null,
	}
}

export const meta = ({ data }: Route.MetaArgs) => [
	{ title: data?.date ? `Brev · ${dateText(data.date)}` : 'Brev' },
]

export default function Dag({ loaderData }: Route.ComponentProps) {
	const { date, me, week, details, error } = loaderData
	const [search, setSearch] = useSearchParams()
	const day = week?.days.find((d) => d.date === date)
	const sessions = day?.sessions ?? []
	const first = sessions.find((s) => s.status === 'planned')
	const [ps, setPs] = useState(false)
	useEffect(() => {
		if (search.get('ps') && first) {
			setPs(true)
			setSearch({}, { replace: true, preventScrollReset: true })
		}
	}, [search, first, setSearch])

	if (!date || !week) {
		return (
			<main className="b-col">
				<Link to={BASE} className="b-back">
					← Ukas brev
				</Link>
				<div className="b-sheet">
					<ErrorLine message={error} />
				</div>
			</main>
		)
	}
	const isToday = date === me.today
	const prev = addDays(date, -1)
	const next = addDays(date, 1)
	return (
		<main className="b-col">
			<nav
				style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
			>
				<Link to={BASE} className="b-back">
					← Ukas brev
				</Link>
				<span style={{ display: 'flex', gap: 4 }}>
					<Link
						to={`${BASE}/dag/${prev}`}
						className="b-back"
						aria-label={`Forrige dag, ${DAY_NAME[weekdayOf(prev)]}`}
						style={{ padding: '0 10px' }}
					>
						‹
					</Link>
					<Link
						to={`${BASE}/dag/${next}`}
						className="b-back"
						aria-label={`Neste dag, ${DAY_NAME[weekdayOf(next)]}`}
						style={{ padding: '0 10px' }}
					>
						›
					</Link>
				</span>
			</nav>
			<h1 className="b-h" style={{ margin: '4px 4px 22px' }}>
				{isToday ? 'I dag' : cap(DAY_NAME[weekdayOf(date)])}{' '}
				<span className="b-small" style={{ fontWeight: 400 }}>
					{dateText(date, Number(me.today.slice(0, 4)))}
				</span>
			</h1>
			<DayNotes
				date={date}
				today={me.today}
				sessions={sessions}
				details={details}
				week={week}
				timeZone={me.timezone}
				openFirst
				label={isToday ? 'I dag' : cap(DAY_NAME[weekdayOf(date)])}
			/>

			{sessions
				.filter((s) => s.status === 'done' || s.status === 'recording-only')
				.map((s) => {
					const d = details[s.id]
					return d ? <HowItWent key={s.id} d={d} /> : null
				})}

			<AddSession date={date} today={me.today} />

			<div style={{ marginTop: 24 }}>
				<PsLines weekKey={mondayOf(date)} timeZone={me.timezone} />
			</div>
			{first ? (
				<PsSheet
					open={ps}
					onClose={() => setPs(false)}
					card={first}
					detail={details[first.id] ?? null}
					week={week}
					today={me.today}
				/>
			) : null}
		</main>
	)
}

/** Planned against actual, number by number, in prose. */
function HowItWent({ d }: { d: SessionOutput }) {
	const c = d.comparison
	const r = d.recording
	const pm = known(c.durationS.planned) ? c.durationS.planned.value / 60 : null
	const am = known(c.durationS.actual) ? c.durationS.actual.value / 60 : null
	const pd = known(c.distanceM.planned)
		? c.distanceM.planned.value / 1000
		: null
	const ad = known(c.distanceM.actual) ? c.distanceM.actual.value / 1000 : null
	const tone = (v: string | null) =>
		v === 'on-target' ? 'b-hit' : v ? 'b-off' : ''
	return (
		<section
			className="b-sheet"
			style={{ marginTop: 22 }}
			aria-label={`Hvordan ${d.title} gikk`}
		>
			<h2 className="b-h2" style={{ marginTop: 0 }}>
				Hvordan det gikk: {d.title}
			</h2>
			<table className="b-table">
				<thead>
					<tr>
						<th scope="col"> </th>
						<th scope="col">Planlagt</th>
						<th scope="col">Faktisk</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Tid</td>
						<td>
							{pm !== null ? (
								<N>{minText(pm)}</N>
							) : (
								<Unknown why={c.durationS.planned.why} />
							)}
						</td>
						<td>
							{am !== null ? (
								<N>{minText(am)}</N>
							) : (
								<Unknown why={c.durationS.actual.why} />
							)}
						</td>
					</tr>
					<tr>
						<td>Distanse</td>
						<td>
							{pd !== null ? (
								<N>{n1(pd)} km</N>
							) : (
								<Unknown why={c.distanceM.planned.why} />
							)}
						</td>
						<td>
							{ad !== null ? (
								<N>{n1(ad)} km</N>
							) : (
								<Unknown why={c.distanceM.actual.why} />
							)}
						</td>
					</tr>
					<tr>
						<td>Belastning</td>
						<td>
							{known(c.load.planned) ? (
								<N>{n0(c.load.planned.value)}</N>
							) : (
								<Unknown why={c.load.planned.why} />
							)}
						</td>
						<td>
							{known(c.load.actual) ? (
								<N>{n0(c.load.actual.value)}</N>
							) : (
								<Unknown why={c.load.actual.why} />
							)}
						</td>
					</tr>
				</tbody>
			</table>
			<p className="b-p" style={{ marginTop: 14 }}>
				{c.verdict.call ? (
					<span className={tone(c.verdict.call)}>
						{c.verdict.call === 'on-target'
							? 'Den traff planen.'
							: c.verdict.call === 'under'
								? 'Den ble lettere enn planlagt.'
								: 'Den ble hardere enn planlagt. Det er over, og det koster neste uke.'}
					</span>
				) : (
					<Unknown why={c.verdict.why}>Jeg kan ikke si om den traff</Unknown>
				)}{' '}
				{c.structure.call === 'as-planned' ? (
					'Oppbyggingen fulgte planen.'
				) : c.structure.call === 'diverged' ? (
					'Oppbyggingen ble en annen enn planlagt.'
				) : c.structure.why ? (
					<>
						Oppbyggingen:{' '}
						<Unknown why={c.structure.why}>kan ikke bekreftes</Unknown>.
					</>
				) : null}
			</p>
			{r ? (
				<p className="b-p">
					Fra klokka:{' '}
					{known(r.avgHeartRate) ? (
						<>
							snittpuls <N>{n0(r.avgHeartRate.value)}</N>
							{known(r.maxHeartRate) ? (
								<>
									, maks <N>{n0(r.maxHeartRate.value)}</N>
								</>
							) : null}
						</>
					) : (
						<>
							<Unknown why={r.avgHeartRate.why}>ingen puls i fila</Unknown>, så
							jeg vet ikke hvor hardt det var
						</>
					)}
					{known(r.avgPace) ? (
						<>
							, snittfart <N>{paceText(r.avgPace.value)}</N>
						</>
					) : null}
					{known(r.avgPower) ? (
						<>
							, snitt <N>{n0(r.avgPower.value)} W</N>
						</>
					) : null}
					{known(r.climbM) && r.climbM.value > 0 ? (
						<>
							, <N>{n0(r.climbM.value)} m</N> stigning
						</>
					) : null}
					.
				</p>
			) : null}
			{c.sinceLast && known(c.sinceLast.durationS) ? (
				<p className="b-small">
					Sist du gjorde en lignende økt ({dateText(c.sinceLast.date)}):{' '}
					<N>{minText(c.sinceLast.durationS.value / 60)}</N>.
				</p>
			) : null}
		</section>
	)
}

function AddSession({ date, today }: { date: string; today: string }) {
	const [open, setOpen] = useState(false)
	const [text, setText] = useState('')
	const [done, setDone] = useState(false)
	const [counts, setCounts] = useState(true)
	const add = useWrite<
		{
			date: string
			sentence: string
			alreadyDone?: boolean
			countsTowardPlan?: boolean
		},
		AddSessionOutput
	>('add_session')
	const begun = date <= today
	if (!open)
		return (
			<p style={{ margin: '18px 4px 0' }}>
				<button
					type="button"
					className="b-word"
					style={{ fontSize: 16, color: 'var(--ink-2)' }}
					onClick={() => setOpen(true)}
				>
					Legg til en økt denne dagen
				</button>
			</p>
		)
	return (
		<form
			className="b-sheet b-fade-in"
			style={{ marginTop: 22 }}
			onSubmit={async (e) => {
				e.preventDefault()
				const r = await add.call({
					date,
					sentence: text.trim(),
					...(begun && done ? { alreadyDone: true } : {}),
					...(counts ? {} : { countsTowardPlan: false }),
				})
				if (r.ok) {
					addPs({
						weekKey: mondayOf(date),
						text: `Du la til «${text.trim()}» ${DAY_NAME[weekdayOf(date)]}.${r.value.notDoneBecause ? ` ${r.value.notDoneBecause}` : ''}`,
						token: r.value.undo,
						noUndoBecause: r.value.noUndoBecause,
					})
					setText('')
					setOpen(false)
				}
			}}
		>
			<label className="b-label" htmlFor="add-s" style={{ marginTop: 0 }}>
				Skriv økta med dine egne ord
			</label>
			<input
				id="add-s"
				className="b-input"
				value={text}
				onChange={(e) => setText(e.target.value)}
				placeholder="45 min rolig, 4x8 min terskel, 3x10 knebøy 60 kg"
				autoComplete="off"
				enterKeyHint="done"
			/>
			{begun ? (
				<label
					style={{
						display: 'flex',
						gap: 10,
						alignItems: 'center',
						minHeight: 44,
						marginTop: 6,
						fontSize: 16,
					}}
				>
					<input
						type="checkbox"
						checked={done}
						onChange={(e) => setDone(e.target.checked)}
						style={{ width: 20, height: 20 }}
					/>
					Den er allerede gjort
				</label>
			) : null}
			<label
				style={{
					display: 'flex',
					gap: 10,
					alignItems: 'center',
					minHeight: 44,
					fontSize: 16,
				}}
			>
				<input
					type="checkbox"
					checked={!counts}
					onChange={(e) => setCounts(!e.target.checked)}
					style={{ width: 20, height: 20 }}
				/>
				Ikke tell den i planen (f.eks. sykkel til jobb)
			</label>
			<ErrorLine message={add.error} />
			<div className="b-row" style={{ marginTop: 10 }}>
				<button
					type="submit"
					className="b-btn"
					disabled={add.pending || !text.trim()}
				>
					{add.pending ? 'Skriver …' : 'Legg til'}
				</button>
				<button type="button" className="b-word" onClick={() => setOpen(false)}>
					Avbryt
				</button>
			</div>
		</form>
	)
}
