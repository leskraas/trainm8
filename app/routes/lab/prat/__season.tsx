import {
	type PlanPreviewOutput,
	type PreviewWeek,
	type StartOption,
} from '#app/lab/engine/setup.types.ts'
import {
	WEEKDAY_SHORT,
	hoursText,
	joinList,
	minutesText,
	plural,
	shortDate,
} from './__fmt.ts'

const PHASE_COLORS = [
	'var(--seg-easy)',
	'var(--seg-mid)',
	'var(--seg-hard)',
	'var(--hit)',
]

export function PhaseStrip({
	phases,
	current,
}: {
	phases: { name: string; weeks: number }[]
	current?: string | null
}) {
	const total = phases.reduce((s, p) => s + p.weeks, 0) || 1
	return (
		<div
			className="prat-phases"
			role="img"
			aria-label={phases.map((p) => `${p.name} ${p.weeks} uker`).join(', ')}
		>
			{phases.map((p, i) => (
				<div
					key={`${p.name}-${i}`}
					className={`prat-phase${current === p.name ? 'now' : ''}`}
					style={{ flexGrow: p.weeks / total, flexBasis: 0 }}
				>
					<i style={{ background: PHASE_COLORS[i % PHASE_COLORS.length] }} />
					<span>
						{p.name} <span className="num">{p.weeks}</span>
					</span>
				</div>
			))}
		</div>
	)
}

export function WeekSquares({
	week,
	compareTo,
	blocked,
}: {
	week: PreviewWeek
	compareTo?: PreviewWeek | null
	blocked?: string[]
}) {
	return (
		<div className="prat-week7">
			{week.days.map((d, i) => {
				const before = compareTo?.days[i]
				const mins = d.sessions.reduce((s, x) => s + x.minutes, 0)
				const minsBefore = before?.sessions.reduce((s, x) => s + x.minutes, 0)
				const changed =
					compareTo &&
					before &&
					(mins !== minsBefore || d.strength.length !== before.strength.length)
				const empty = !d.sessions.length && !d.strength.length
				return (
					<div
						key={d.date}
						className={`prat-day7${empty && blocked?.includes(d.weekday) ? 'off' : ''}${changed ? 'changed' : ''}`}
						title={changed ? 'Endret' : undefined}
					>
						<b>{WEEKDAY_SHORT[d.weekday]}</b>
						{d.sessions.map((s, j) => (
							<span
								key={j}
								className={`s${s.effort === 'hard' ? 'hard' : ''}`}
								title={`${s.title}, ${minutesText(s.minutes)}`}
							>
								<span className="num">{s.minutes}</span>′ {s.title}
							</span>
						))}
						{d.strength.map((s, j) => (
							<span
								key={`st${j}`}
								className="s str"
								title={`${s.title}: ${s.lifts.join(', ')}`}
							>
								{s.title}
							</span>
						))}
						{empty ? (
							<span
								style={{
									fontSize: 11,
									color: 'var(--muted)',
									textAlign: 'center',
								}}
							>
								hvile
							</span>
						) : null}
					</div>
				)
			})}
		</div>
	)
}

/** The season as one card: phases, the weeks' volume, and week 1 day by day. */
export function SeasonCard({
	preview,
	option,
	compareTo,
	showWeeks,
}: {
	preview: PlanPreviewOutput
	option: StartOption | null
	compareTo?: PlanPreviewOutput | null
	showWeeks?: boolean
}) {
	const toward =
		preview.towardGoal && !preview.towardGoal.problem
			? preview.towardGoal
			: null
	const phases = toward?.phases ?? preview.phases
	const outlook = toward?.outlook ?? preview.outlook
	const totalWeeks = phases.reduce((s, p) => s + p.weeks, 0)
	const maxH = Math.max(1, ...outlook.map((w) => w.hours ?? 0))
	const week1 = preview.weeks[0]
	return (
		<div className="prat-card">
			<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
				<span className="prat-card-title">{preview.name}</span>
				<span className="prat-card-sub">
					{option?.styleName ? `${option.styleName} · ` : ''}
					<span className="num">{totalWeeks}</span> uker fra{' '}
					{shortDate(preview.startsOn)}
					{toward ? ` til ${toward.goal.name}` : ''}
				</span>
			</div>
			{option?.badge ? (
				<span className="prat-tag mine" style={{ alignSelf: 'flex-start' }}>
					{option.badge}
				</span>
			) : null}
			<PhaseStrip phases={phases} />
			{outlook.length ? (
				<div>
					<div className="prat-bars" aria-label="Timer per uke">
						{outlook.map((w) =>
							w.hours === null ? (
								<i
									key={w.weekStart}
									className="unknown"
									title={w.why ?? 'ukjent'}
								/>
							) : (
								<i
									key={w.weekStart}
									className={w.role}
									style={{ height: `${Math.max(4, (w.hours / maxH) * 100)}%` }}
									title={`${shortDate(w.weekStart)}: ${hoursText(w.hours)} (${w.roleLabel})`}
								/>
							),
						)}
					</div>
					<span className="prat-note">
						Timer per uke. Lyse uker er lettere.
					</span>
				</div>
			) : null}
			{week1 ? (
				<>
					<span className="prat-card-label">Uke 1</span>
					<WeekSquares week={week1} compareTo={compareTo?.weeks[0] ?? null} />
					<span className="prat-note">
						{plural(week1.totals.sessions, 'økt', 'økter')} ·{' '}
						<span className="num">{minutesText(week1.totals.minutes)}</span>
						{week1.totals.hardSessions
							? ` · ${plural(week1.totals.hardSessions, 'hard', 'harde')}`
							: ''}
						{week1.totals.strengthSessions
							? ` · ${plural(week1.totals.strengthSessions, 'styrkeøkt', 'styrkeøkter')}`
							: ''}
					</span>
				</>
			) : null}
			{showWeeks ? (
				<div className="prat-list">
					{outlook.map((w, i) => (
						<div
							key={w.weekStart}
							className="prat-row"
							style={{ minHeight: 44 }}
						>
							<span
								className="num"
								style={{ width: 52, color: 'var(--muted)', fontSize: 14 }}
							>
								Uke {i + 1}
							</span>
							<span className="prat-row-main">
								<span className="prat-row-title" style={{ fontSize: 15 }}>
									{w.phase} · {w.roleLabel}
								</span>
								<span className="prat-row-sub">
									fra {shortDate(w.weekStart)}
								</span>
							</span>
							{w.hours === null ? (
								<span className="prat-unknown">{w.why ?? 'ukjent'}</span>
							) : (
								<b className="num" style={{ fontSize: 15 }}>
									{hoursText(w.hours)}
								</b>
							)}
						</div>
					))}
				</div>
			) : null}
		</div>
	)
}

/** The partner's three short explanations of a proposed plan. */
export function planExplain(
	preview: PlanPreviewOutput,
	option: StartOption | null,
) {
	const toward =
		preview.towardGoal && !preview.towardGoal.problem
			? preview.towardGoal
			: null
	const phases = toward?.phases ?? preview.phases
	const lines: string[] = []
	if (phases.length) {
		lines.push(
			`Fasene: ${joinList(phases.map((p) => `${p.name.toLowerCase()} i ${p.weeks} ${p.weeks === 1 ? 'uke' : 'uker'}`))}. Hver bygger på den forrige${toward ? `, og den siste fører deg inn mot ${toward.goal.name} ${shortDate(toward.goal.date)}` : ', og når blokka er ferdig legger jeg den neste ut fra hvordan det gikk'}.`,
		)
	}
	if (preview.why || option?.why) lines.push(option?.why ?? preview.why)
	const w = preview.weeks[0]
	if (w) {
		const parts = [
			`En vanlig uke i starten: ${plural(w.totals.sessions, 'økt', 'økter')} på til sammen ${minutesText(w.totals.minutes)}`,
		]
		if (w.totals.hardSessions)
			parts.push(`${w.totals.hardSessions} av dem harde, resten rolige`)
		else parts.push('alle rolige')
		let line = `${parts.join(', ')}.`
		if (w.totals.strengthSessions)
			line += ` Pluss ${plural(w.totals.strengthSessions, 'styrkeøkt', 'styrkeøkter')}.`
		lines.push(line)
	}
	if (option?.shortOfHours) lines.push(option.shortOfHours.note)
	if (option?.notFitted) lines.push(option.notFitted)
	for (const n of option?.strengthNotes ?? []) lines.push(n)
	if (preview.towardGoal?.problem) lines.push(preview.towardGoal.problem)
	return lines
}
