import { useEffect, useRef } from 'react'
import {
	type PlanOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import {
	type PlanPreviewOutput,
	type PreviewWeek,
} from '#app/lab/engine/setup.types.ts'
import {
	DAY_NAME,
	dur,
	hours,
	longDate,
	plural,
	unitText,
	weekdayOf,
} from './__format.ts'
import { cx, Unknown } from './__ui.tsx'

/**
 * Planarket: a readable, not editable, summary. Phases as bands, a typical
 * week, hours a week as plain bars. It can only be closed.
 */

function Bands({
	phases,
	current,
}: {
	phases: Array<{ name: string; weeks: number; isCurrent?: boolean }>
	current?: number | null
}) {
	const total = phases.reduce((n, p) => n + p.weeks, 0) || 1
	return (
		<>
			<div
				className="tm-bands"
				role="img"
				aria-label={phases.map((p) => `${p.name} ${p.weeks} uker`).join(', ')}
			>
				{phases.map((p, i) => (
					<div
						key={i}
						className={cx('tm-band', p.isCurrent && 'current')}
						style={{ flex: p.weeks }}
						title={`${p.name}: ${p.weeks} uker`}
					>
						{p.weeks / total >= 0.3 ? p.name : ''}
					</div>
				))}
			</div>
			<div className="tm-band-legend">
				<span>
					{phases
						.map((p) => `${p.name}: ${plural(p.weeks, 'uke', 'uker')}`)
						.join(' · ')}
				</span>
				{current ? <span className="num">Uke {current}</span> : null}
			</div>
		</>
	)
}

function HourBars({
	weeks,
}: {
	weeks: Array<{
		key: string
		hours: number | null
		role: string
		why?: string
	}>
}) {
	const max = Math.max(1, ...weeks.map((w) => w.hours ?? 0))
	return (
		<div className="tm-weekbars" role="img" aria-label="Timer per uke">
			{weeks.map((w) =>
				w.hours === null ? (
					<div
						key={w.key}
						className="tm-weekbar unknown"
						title={w.why ?? 'Ukjent'}
					/>
				) : (
					<div
						key={w.key}
						className={cx('tm-weekbar', `phase-${w.role}`)}
						title={`${hours(w.hours)}`}
					>
						<span
							style={{ height: `${Math.max(4, (w.hours / max) * 100)}%` }}
						/>
					</div>
				),
			)}
		</div>
	)
}

function PreviewWeekRows({ week }: { week: PreviewWeek }) {
	return (
		<div className="tm-list" style={{ borderTop: 'none' }}>
			{week.days.map((d) => (
				<div key={d.date} className="tm-sheet-day">
					<div>{DAY_NAME[d.weekday].slice(0, 3)}</div>
					<div>
						{d.sessions.length === 0 && d.strength.length === 0 ? (
							<div className="tm-effort">Hvil</div>
						) : null}
						{d.sessions.map((s, i) => (
							<div key={i}>
								{s.title} · {dur(s.minutes * 60)}{' '}
								<span
									className={cx('tm-effort', s.effort === 'hard' && 'hard')}
								>
									{s.effort === 'hard'
										? 'hardt'
										: s.effort === 'moderate'
											? 'middels'
											: 'rolig'}
								</span>
							</div>
						))}
						{d.strength.map((s, i) => (
							<div key={`s${i}`}>
								{s.title}: {s.lifts.join(', ')}
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	)
}

export function PreviewSheet({
	p,
	onClose,
}: {
	p: PlanPreviewOutput
	onClose: () => void
}) {
	const ref = useRef<HTMLDivElement>(null)
	const close = useRef(onClose)
	useEffect(() => {
		close.current = onClose
	}, [onClose])
	// Focus moves in when the sheet opens and back when it closes; Escape
	// closes it like the button does.
	useEffect(() => {
		const prev = document.activeElement as HTMLElement | null
		const t = window.setTimeout(() => {
			ref.current
				?.querySelector<HTMLElement>('button, input, textarea, select, a[href]')
				?.focus({ preventScroll: true })
		}, 30)
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') close.current()
		}
		window.addEventListener('keydown', onKey)
		return () => {
			window.clearTimeout(t)
			window.removeEventListener('keydown', onKey)
			if (prev?.isConnected) prev.focus({ preventScroll: true })
		}
	}, [])
	const toward = p.towardGoal && !p.towardGoal.problem ? p.towardGoal : null
	const phases = toward ? toward.phases : p.phases
	const outlook = toward ? toward.outlook : p.outlook
	const w1 = p.weeks[0]
	return (
		<div
			ref={ref}
			className="tm tm-sheet"
			role="dialog"
			aria-modal="true"
			aria-label="Planarket"
		>
			<div
				className="tm-page"
				style={{ paddingBottom: 'calc(var(--safe-b) + 110px)' }}
			>
				<div style={{ height: 48 }} />
				<p className="tm-lead">Planarket · kan ikke redigeres</p>
				<h1>{p.name}</h1>
				<p className="tm-lead">
					{plural(outlook.length, 'uke', 'uker')} fra {longDate(p.startsOn)}
					{toward
						? ` mot ${toward.goal.name}, ${longDate(toward.goal.date)}`
						: ', i blokker uten sluttdato'}
					.
				</p>
				<h2>Fasene</h2>
				<Bands phases={phases} />
				<h2>Timer per uke</h2>
				<HourBars
					weeks={outlook.map((w) => ({
						key: w.weekStart,
						hours: w.hours,
						role: w.role,
						why: w.why,
					}))}
				/>
				{(() => {
					const known = outlook
						.filter((w) => w.hours !== null)
						.map((w) => w.hours!)
					return known.length ? (
						<p className="tm-lead num" style={{ marginTop: 8, fontSize: 14 }}>
							Første uke {hours(known[0]!)}, mest {hours(Math.max(...known))}.
						</p>
					) : null
				})()}
				<div className="tm-legend">
					<span>
						<i /> bygger
					</span>
					<span>
						<i style={{ background: 'var(--muted)' }} /> lettere uke /
						nedtrapping
					</span>
					{outlook.some((w) => w.hours === null) ? (
						<span>
							<Unknown /> kan ikke prises
						</span>
					) : null}
				</div>
				{w1 ? (
					<>
						<h2>En typisk uke i {phases[0]?.name ?? 'starten'}</h2>
						<p className="tm-lead" style={{ marginBottom: 8 }}>
							{plural(w1.totals.sessions, 'økt', 'økter')} ·{' '}
							{dur(w1.totals.minutes * 60)} ·{' '}
							{plural(w1.totals.hardSessions, 'hard', 'harde')}
							{w1.totals.strengthSessions
								? ` · ${plural(w1.totals.strengthSessions, 'styrkeøkt', 'styrkeøkter')}`
								: ''}
						</p>
						<PreviewWeekRows week={w1} />
						<p className="tm-lead" style={{ marginTop: 12, fontSize: 14 }}>
							Ukene i de neste fasene legges to om gangen, når de nærmer seg.
						</p>
					</>
				) : null}
				{p.notes.length ? (
					<>
						<h2>Verdt å vite</h2>
						{p.notes.map((n, i) => (
							<p key={i} className="tm-lead" style={{ marginBottom: 8 }}>
								{n}
							</p>
						))}
					</>
				) : null}
			</div>
			<div
				style={{
					position: 'fixed',
					left: 0,
					right: 0,
					bottom: 0,
					padding: '12px 16px calc(var(--safe-b) + 14px)',
					background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
				}}
			>
				<div style={{ maxWidth: 420, margin: '0 auto' }}>
					<button
						type="button"
						className="tm-wide"
						style={{ background: 'var(--card)', color: 'var(--ink)' }}
						onClick={onClose}
					>
						Lukk
					</button>
				</div>
			</div>
		</div>
	)
}

/** The plan that exists: phases, the main sport's week targets, this week. */
export function PlanSheet({
	plan,
	week,
}: {
	plan: NonNullable<PlanOutput['plan']>
	week: WeekOutput | null
}) {
	const main = plan.sports[0]
	const weeks = plan.weeks.map((w) => {
		const v = w.sports.find((s) => s.sport === main?.sport)?.target
		return {
			key: w.weekKey,
			value: v?.value ?? null,
			why: v?.why ?? null,
			role: w.role ?? 'loading',
			now: w.when === 'current',
			number: w.number,
		}
	})
	const max = Math.max(1, ...weeks.map((w) => w.value ?? 0))
	return (
		<>
			<p className="tm-lead">Planarket · kan ikke redigeres</p>
			<h1>{plan.goal.kind === 'event' ? plan.goal.name : 'Bedre form'}</h1>
			<p className="tm-lead">
				{plural(plan.totalWeeks, 'uke', 'uker')}, {longDate(plan.firstWeek)} til{' '}
				{longDate(plan.lastWeek)}
				{plan.currentWeek ? `. Du er i uke ${plan.currentWeek}.` : '.'}
			</p>
			{plan.philosophy ? (
				<p className="tm-lead" style={{ marginTop: 10 }}>
					<b style={{ color: 'var(--fg)' }}>{plan.philosophy.name}.</b>{' '}
					{plan.philosophy.description}
				</p>
			) : null}
			<h2>Fasene</h2>
			<Bands phases={plan.phases} current={plan.currentWeek} />
			{main ? (
				<>
					<h2>{main.sportName} per uke, mål</h2>
					<div
						className="tm-weekbars"
						role="img"
						aria-label={`${main.sportName} per uke`}
					>
						{weeks.map((w) =>
							w.value === null ? (
								<div
									key={w.key}
									className="tm-weekbar unknown"
									title={w.why ?? 'Ukjent'}
								/>
							) : (
								<div
									key={w.key}
									className={cx(
										'tm-weekbar',
										`phase-${w.role}`,
										w.now && 'now',
									)}
									title={`Uke ${w.number}: ${unitText(main.unit, w.value)}`}
								>
									<span
										style={{ height: `${Math.max(4, (w.value / max) * 100)}%` }}
									/>
								</div>
							),
						)}
					</div>
					{weeks.some((w) => w.value !== null) ? (
						<p className="tm-lead num" style={{ marginTop: 8, fontSize: 14 }}>
							Mest: {unitText(main.unit, max)}.
							{weeks.find((w) => w.now)?.value != null
								? ` Denne uka: ${unitText(main.unit, weeks.find((w) => w.now)!.value!)}.`
								: ''}
						</p>
					) : null}
					<div className="tm-legend">
						<span>
							<i style={{ background: 'var(--yes)' }} /> denne uka
						</span>
						<span>
							<i style={{ background: 'var(--muted)' }} /> lettere uke /
							nedtrapping
						</span>
					</div>
				</>
			) : null}
			{week ? (
				<>
					<h2>Denne uka</h2>
					<div className="tm-list" style={{ borderTop: 'none' }}>
						{week.days.map((d) => (
							<div key={d.date} className="tm-sheet-day">
								<div>{DAY_NAME[weekdayOf(d.date)].slice(0, 3)}</div>
								<div>
									{d.sessions.length === 0 ? (
										<div className="tm-effort">Hvil</div>
									) : null}
									{d.sessions.map((s) => (
										<div key={s.id}>
											{s.title}
											{s.planned.durationS.value
												? ` · ${dur(s.planned.durationS.value)}`
												: ''}
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</>
			) : null}
			<h2>Kan planen endres?</h2>
			<p className="tm-lead">
				Ikke her. Den endrer seg bare gjennom kort du sier ja eller nei til.
				Trykk «Det passer ikke» på hovedskjermen når livet skjer.
			</p>
		</>
	)
}
