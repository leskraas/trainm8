/**
 * Ukebrevet: the week as prose. «Det du gjorde», «Det som kommer», «Hvor du
 * står», the proposals waiting for a yes, and the PS lines.
 */
import { useRef, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import {
	type PlanOutput,
	type ProgressOutput,
	type ProposalItem,
	type SessionCard,
	type SportVolume,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { type AnswerProposalOutput } from '#app/lab/engine/sessions.types.ts'
import { termFor } from './__lapp.tsx'
import {
	BASE,
	DAY_NAME,
	cap,
	countWord,
	dateText,
	daysBetween,
	known,
	minText,
	n0,
	n1,
	phaseName,
	pick,
	roleWord,
	volumeText,
	weekSpan,
	verdictTone,
	addDays,
} from './__lib.ts'
import { addPs } from './__ps.ts'
import {
	ErrorLine,
	N,
	PlanArrow,
	PsLines,
	Unknown,
	cx,
	useWrite,
} from './__ui.tsx'

export function SessionSentence({ s }: { s: SessionCard }) {
	const plannedMin = known(s.planned.durationS)
		? s.planned.durationS.value / 60
		: null
	const actualMin = known(s.actual.durationS)
		? s.actual.durationS.value / 60
		: null
	const dist = known(s.actual.distanceM)
		? s.actual.distanceM.value / 1000
		: null
	if (s.status === 'recording-only') {
		return (
			<>
				{s.title === s.sportName
					? s.sportName
					: `${s.title} (${s.sportName.toLowerCase()})`}
				{actualMin !== null ? (
					<>
						, <N>{minText(actualMin)}</N>
					</>
				) : null}
				{dist !== null ? (
					<>
						, <N>{n1(dist)} km</N>
					</>
				) : null}
				, uten plan.
			</>
		)
	}
	if (s.status === 'missed') {
		return (
			<>
				{s.title}
				{plannedMin !== null ? (
					<>
						, <N>{minText(plannedMin)}</N>
					</>
				) : null}
				. <span className="b-off">Ble ikke gjort.</span>
			</>
		)
	}
	if (s.status === 'done') {
		const tone = verdictTone(s.verdict)
		const words =
			s.verdict.call === 'on-target'
				? pick(['Traff.', 'Som planlagt.', 'Akkurat passe.'], s.id)
				: s.verdict.call === 'under'
					? pick(
							['Lettere enn planlagt.', 'Litt under.', 'Roligere enn planen.'],
							s.id,
						)
					: s.verdict.call === 'over'
						? 'Hardere enn planlagt. Det er over, og det koster neste uke.'
						: null
		return (
			<>
				{s.title},{' '}
				{s.sport === 'strength' && s.strengthSetsLogged !== null ? (
					<>
						<N>{s.strengthSetsLogged} sett</N> logget.
					</>
				) : (
					<>
						<PlanArrow
							planned={plannedMin}
							actual={actualMin}
							fmt={minText}
							tone={tone}
						/>
						{dist !== null ? (
							<>
								{' '}
								(<N>{n1(dist)} km</N>)
							</>
						) : null}
						.
					</>
				)}{' '}
				{words ? (
					<span
						className={tone === 'hit' ? 'b-hit' : tone === 'off' ? 'b-off' : ''}
					>
						{words}
					</span>
				) : s.verdict.why && !s.markedDone ? (
					<Unknown why={s.verdict.why}>kan ikke si om den traff</Unknown>
				) : s.markedDone ? (
					<span>Sagt gjort for hånd.</span>
				) : null}{' '}
				{s.rpe !== null ? (
					<span>
						Tyngde <N>{s.rpe}/10</N>.
					</span>
				) : (
					<span className="b-unk">tyngde: ikke oppgitt</span>
				)}
			</>
		)
	}
	return (
		<>
			{s.title}
			{plannedMin !== null ? (
				<>
					, <N>{minText(plannedMin)}</N>
				</>
			) : null}
			{s.purpose ? (
				<span style={{ color: 'var(--ink-2)' }}>
					{' '}
					· {s.purpose.toLowerCase()}
				</span>
			) : null}
			.
		</>
	)
}

/** A sentence about a day: tap reads the day, hold opens the margin (PS). */
function DayLine({
	date,
	children,
	today,
}: {
	date: string
	children: ReactNode
	today: string
}) {
	const navigate = useNavigate()
	const timer = useRef<number | null>(null)
	const fired = useRef(false)
	const start = useRef<{ x: number; y: number } | null>(null)
	return (
		<li style={{ margin: '0 0 12px' }}>
			<Link
				to={`${BASE}/dag/${date}`}
				prefetch="intent"
				style={{ textDecoration: 'none', display: 'block' }}
				onPointerDown={(e) => {
					fired.current = false
					start.current = { x: e.clientX, y: e.clientY }
					timer.current = window.setTimeout(() => {
						fired.current = true
						void navigate(`${BASE}/dag/${date}?ps=1`)
					}, 550)
				}}
				onPointerMove={(e) => {
					if (
						start.current &&
						Math.hypot(
							e.clientX - start.current.x,
							e.clientY - start.current.y,
						) > 10
					) {
						if (timer.current) window.clearTimeout(timer.current)
					}
				}}
				onPointerUp={() => timer.current && window.clearTimeout(timer.current)}
				onPointerCancel={() =>
					timer.current && window.clearTimeout(timer.current)
				}
				onClick={(e) => {
					if (fired.current) e.preventDefault()
				}}
				onContextMenu={(e) => e.preventDefault()}
			>
				<strong style={{ fontWeight: 600 }}>
					{date === today ? 'I dag' : cap(DAY_NAME[weekdayFromDate(date)])}:
				</strong>{' '}
				<span style={{ userSelect: 'text' }}>{children}</span>
			</Link>
		</li>
	)
}

function weekdayFromDate(d: string) {
	const idx = (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7
	return (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const)[idx]!
}

export function WeekLetter({
	week,
	name,
	today,
	timeZone,
	progress,
	plan,
	nextWeek,
	isNew,
	headingTag = 'h1',
}: {
	week: WeekOutput
	name: string
	today: string
	timeZone?: string
	progress?: ProgressOutput | null
	plan?: PlanOutput | null
	nextWeek?: WeekOutput | null
	isNew?: boolean
	headingTag?: 'h1' | 'h2'
}) {
	const H = headingTag
	const all = week.days.flatMap((d) => d.sessions)
	const past = week.days.filter((d) => d.isPast || d.isToday)
	const pastSessions = past.flatMap((d) =>
		d.sessions.filter((s) => s.status !== 'planned' || d.isPast),
	)
	const coming = week.days.filter((d) => !d.isPast)
	const comingSessions = coming.flatMap((d) =>
		d.sessions.filter((s) => s.status === 'planned'),
	)
	const isSunday = week.when === 'current' && week.days[6]?.isToday
	const missedWeek =
		week.when !== 'future' &&
		week.counts.planned > 0 &&
		week.counts.done === 0 &&
		week.when === 'past'
	const purposes = Array.from(
		new Set(all.map((s) => s.purpose).filter(Boolean)),
	) as string[]
	const terms = Array.from(
		new Set(purposes.map(termFor).filter(Boolean)),
	).slice(0, 2) as string[]

	const opening =
		week.when === 'past'
			? missedWeek
				? 'Denne uka ble det ingenting. Det skjer.'
				: `Uke ${week.isoWeek} er over. Her er hva som skjedde.`
			: week.when === 'future'
				? 'Dette er uka som kommer. Den kan fortsatt endre seg når denne uka lukkes.'
				: isSunday
					? 'Det er søndag. Uka er nesten over, så her er hvordan den gikk, og hva som kommer.'
					: pick(
							[
								'Her er uka di så langt.',
								'Dette er brevet for uka du er i. Jeg skriver det om etter hvert som økter kommer inn.',
							],
							week.weekKey,
						)

	return (
		<article
			className={cx('b-sheet', isNew && 'b-new-letter')}
			aria-labelledby={`wk-${week.weekKey}`}
		>
			<header style={{ marginBottom: 18 }}>
				<H
					id={`wk-${week.weekKey}`}
					className="b-h"
					style={{ marginBottom: 2 }}
				>
					Uke {week.isoWeek}
				</H>
				<p className="b-small" style={{ margin: 0 }}>
					{weekSpan(week.weekKey)}
					{week.phase
						? ` · ${phaseName(week.phase.name)}, uke ${week.phase.phaseWeek} av ${week.phase.phaseWeeks}`
						: ''}
					{week.eased ? ' · gjort lettere' : ''}
				</p>
			</header>
			<p className="b-p">Kjære {name},</p>
			<p className="b-p">{opening}</p>
			{week.phase ? (
				<p className="b-p">
					Du er i fasen {phaseName(week.phase.name).toLowerCase()}
					{week.phase.name !== phaseName(week.phase.name)
						? ` (${week.phase.name})`
						: ''}
					, uke {week.phase.planWeek} av {week.phase.planWeeks} i planen
					{roleWord(week.phase.role) ? `, en ${roleWord(week.phase.role)}` : ''}
					.
					{week.phase.role === 'recovery'
						? ' Den er lettere med vilje: det er da formen kommer.'
						: week.phase.role === 'taper'
							? ' Mindre mengde, litt fart, så du står uthvilt på start.'
							: ''}
				</p>
			) : week.when !== 'past' ? (
				<p className="b-p">Denne uka ligger utenfor planen.</p>
			) : null}
			{terms.length ? (
				<p className="b-margin" style={{ fontSize: 16, lineHeight: '24px' }}>
					{terms.join(' ')}
				</p>
			) : null}

			{week.when !== 'future' ? (
				<>
					<h3 className="b-h2">Det du gjorde</h3>
					{pastSessions.length ? (
						<ul className="b-ps">
							{past.map((d) =>
								d.sessions
									.filter((s) => s.status !== 'planned' || d.isPast)
									.map((s) => (
										<DayLine key={s.id} date={d.date} today={today}>
											{s.status === 'planned' && d.isPast ? (
												<>
													{s.title}:{' '}
													<span className="b-unk">
														ingen har sagt om den ble gjort
													</span>
													.
												</>
											) : (
												<SessionSentence s={s} />
											)}
										</DayLine>
									)),
							)}
						</ul>
					) : (
						<p className="b-p">
							{week.when === 'past'
								? 'Ingen økter denne uka.'
								: 'Ingenting ennå denne uka. Det er helt i orden.'}
						</p>
					)}
					<WeekSum week={week} />
				</>
			) : null}

			{comingSessions.length ? (
				<>
					<h3 className="b-h2">
						{week.when === 'future' ? 'Uka' : 'Det som kommer'}
					</h3>
					<ul className="b-ps">
						{coming.map((d) =>
							d.sessions
								.filter((s) => s.status === 'planned')
								.map((s) => (
									<DayLine key={s.id} date={d.date} today={today}>
										<SessionSentence s={s} />
									</DayLine>
								)),
						)}
					</ul>
					<p className="b-small">
						{restDaysLine(week)} Trykk på en dag for å lese den. Hold for å
						skrive en PS.
					</p>
				</>
			) : week.when === 'current' && !isSunday ? (
				<>
					<h3 className="b-h2">Det som kommer</h3>
					<p className="b-p">Resten av uka er hvile.</p>
				</>
			) : null}

			<Proposals items={week.proposals.filter((p) => p.state === 'waiting')} />

			{nextWeek ? (
				<>
					<h3 className="b-h2">Neste uke</h3>
					<NextWeek week={nextWeek} today={today} />
				</>
			) : null}

			{progress ? (
				<WhereYouStand
					progress={progress}
					plan={plan ?? null}
					week={week}
					today={today}
				/>
			) : null}

			<div style={{ marginTop: 28 }}>
				<PsLines
					weekKey={week.weekKey}
					timeZone={timeZone}
					extra={all
						.filter((s) => s.adjustedBecause)
						.map((s) => (
							<li key={`adj-${s.id}`}>
								<strong style={{ fontWeight: 600 }}>PS:</strong>{' '}
								{cap(DAY_NAME[weekdayFromDate(s.date)])}: {s.adjustedBecause}
							</li>
						))}
				/>
			</div>

			<p className="b-p" style={{ marginTop: 24, marginBottom: 0 }}>
				Hilsen
				<br />
				<span className="b-sign-name">treningspartneren din</span>
			</p>
		</article>
	)
}

function restDaysLine(week: WeekOutput) {
	const rest = week.days
		.filter((d) => !d.isPast && d.restDay)
		.map((d) => DAY_NAME[d.weekday])
	if (!rest.length) return ''
	return `${cap(rest.length === 1 ? rest[0]! : `${rest.slice(0, -1).join(', ')} og ${rest[rest.length - 1]}`)} er ${rest.length === 1 ? 'hviledag' : 'hviledager'}.`
}

function WeekSum({ week }: { week: WeekOutput }) {
	const c = week.counts
	const lines: ReactNode[] = []
	const total = c.planned + c.done + c.missed
	if (total > 0) {
		lines.push(
			<span key="c">
				Av {countWord(c.done + c.missed + c.planned)} planlagte økter er{' '}
				{countWord(c.done)} gjort
				{c.missed ? `, ${countWord(c.missed)} ble ikke noe av` : ''}
				{c.planned && week.when !== 'past'
					? `, og ${countWord(c.planned)} står igjen`
					: ''}
				.
				{c.recordingOnly
					? ` I tillegg ${countWord(c.recordingOnly)} uten plan.`
					: ''}
			</span>,
		)
	} else if (c.recordingOnly) {
		lines.push(
			<span key="c">
				{cap(countWord(c.recordingOnly))}{' '}
				{c.recordingOnly === 1 ? 'økt' : 'økter'} kom inn fra klokka, uten plan.
			</span>,
		)
	}
	const v = week.load.verdict
	if (v.call && known(week.load.planned) && known(week.load.actual)) {
		lines.push(
			<span key="v">
				{' '}
				Målt mot planen, i de øktene som hadde en plan:{' '}
				{v.call === 'on-target'
					? 'det er der det skulle være.'
					: v.call === 'under'
						? 'litt lettere enn planlagt.'
						: 'hardere enn planlagt, og det er ikke bra.'}
			</span>,
		)
	}
	if (!lines.length) return null
	return <p className="b-p">{lines}</p>
}

function NextWeek({ week, today }: { week: WeekOutput; today: string }) {
	const sessions = week.days.flatMap((d) =>
		d.sessions.filter((s) => s.status === 'planned'),
	)
	if (!sessions.length)
		return (
			<p className="b-p">
				Neste uke er ikke lagt ennå. Den legges når denne uka lukkes, søndag
				kveld.
			</p>
		)
	return (
		<>
			<p className="b-p">
				{week.phase
					? `${phaseName(week.phase.name)}${week.phase.phaseWeeks > 1 ? `, uke ${week.phase.phaseWeek} av ${week.phase.phaseWeeks}` : ''}.`
					: ''}{' '}
				{sessions.length} {sessions.length === 1 ? 'økt' : 'økter'}:
			</p>
			<ul className="b-ps">
				{week.days.map((d) =>
					d.sessions
						.filter((s) => s.status === 'planned')
						.map((s) => (
							<DayLine key={s.id} date={d.date} today={today}>
								<SessionSentence s={s} />
							</DayLine>
						)),
				)}
			</ul>
			<Proposals items={week.proposals.filter((p) => p.state === 'waiting')} />
		</>
	)
}

// ── Proposals as underlined text ─────────────────────────────────────────

export function Proposals({ items }: { items: ProposalItem[] }) {
	if (!items.length) return null
	return (
		<>
			<h3 className="b-h2">Forslag som venter på deg</h3>
			<ul className="b-ps">
				{items.map((p) => (
					<ProposalLine key={p.id} p={p} />
				))}
			</ul>
		</>
	)
}

export function ProposalLine({ p }: { p: ProposalItem }) {
	const answer = useWrite<
		{
			proposalId: string
			answer: 'yes' | 'no'
			scope?: 'this-week' | 'from-now-on'
		},
		AnswerProposalOutput
	>('answer_proposal')
	async function say(a: 'yes' | 'no', scope?: 'this-week' | 'from-now-on') {
		const r = await answer.call({
			proposalId: p.id,
			answer: a,
			...(scope ? { scope } : {}),
		})
		if (r.ok && a === 'yes')
			addPs({
				weekKey: p.weekKey,
				text: `Du sa ja: ${p.headline}.`,
				token: r.value.undo,
				noUndoBecause: r.value.noUndoBecause,
			})
	}
	return (
		<li style={{ marginBottom: 16 }}>
			<span className="b-suggest">{p.headline}.</span>{' '}
			<span style={{ color: 'var(--ink-2)' }}>{p.reason}</span>
			{p.addsLoad ? (
				<span
					className="b-small"
					style={{ display: 'block', fontStyle: 'italic' }}
				>
					Dette legger mer trening på deg, så jeg gjør det ikke uten et ja.
				</span>
			) : null}
			{p.touchesOwnSession ? (
				<span
					className="b-small"
					style={{ display: 'block', fontStyle: 'italic' }}
				>
					Det gjelder en av dine egne økter.
				</span>
			) : null}
			<span className="b-row" style={{ marginTop: 8, display: 'flex' }}>
				{p.asksScope ? (
					<>
						<button
							type="button"
							className="b-btn"
							disabled={answer.pending}
							onClick={() => void say('yes', 'this-week')}
						>
							Ja, denne uka
						</button>
						<button
							type="button"
							className="b-btn b-btn-ghost"
							disabled={answer.pending}
							onClick={() => void say('yes', 'from-now-on')}
						>
							Ja, fra nå av
						</button>
					</>
				) : (
					<button
						type="button"
						className="b-btn"
						disabled={answer.pending}
						onClick={() => void say('yes')}
					>
						Ja
					</button>
				)}
				<button
					type="button"
					className="b-btn b-btn-ghost"
					disabled={answer.pending}
					onClick={() => void say('no')}
				>
					Nei
				</button>
			</span>
			<ErrorLine message={answer.error} />
		</li>
	)
}

// ── Hvor du står: three small figures in the text ────────────────────────

export function WhereYouStand({
	progress,
	plan,
	week,
	today,
}: {
	progress: ProgressOutput
	plan: PlanOutput | null
	week: WeekOutput
	today: string
}) {
	return (
		<section aria-labelledby="hvor-h">
			<h3 id="hvor-h" className="b-h2">
				Hvor du står
			</h3>
			<FormFigure progress={progress} />
			<SportBars sports={week.sports} />
			<Road progress={progress} plan={plan} today={today} />
		</section>
	)
}

function formWord(f: number) {
	if (f > 15) return 'veldig uthvilt, kanskje for lenge siden du trente hardt'
	if (f > 5) return 'uthvilt'
	if (f >= -10) return 'i balanse'
	if (f >= -30) return 'sliten etter tunge uker, som ventet når du bygger'
	return 'veldig sliten'
}

export function FormFigure({ progress }: { progress: ProgressOutput }) {
	const t = progress.formTrust
	if (!t.trusted) {
		const weeksHave =
			t.daysOfHistory !== null ? Math.floor(t.daysOfHistory / 7) : 0
		const need = Math.ceil(t.requiredDays / 7)
		return (
			<figure className="b-fig">
				<div className="b-dashed">
					Formkurven tegner jeg når jeg har {need} uker med data.{' '}
					{weeksHave > 0 ? (
						<>
							Nå har jeg <N>{weeksHave}</N>.{' '}
							<N>
								{weeksHave} av {need}
							</N>
							.
						</>
					) : (
						<>Nå har jeg ingen.</>
					)}
				</div>
			</figure>
		)
	}
	const days = progress.days
	const W = 320
	const H = 90
	const vals = days
		.flatMap((d) => [d.fitness.value, d.fatigue.value])
		.filter((v): v is number => v !== null)
	const max = Math.max(1, ...vals)
	const x = (i: number) => (i / Math.max(1, days.length - 1)) * W
	const y = (v: number) => H - 6 - (v / max) * (H - 14)
	function line(key: 'fitness' | 'fatigue') {
		let d = ''
		let pen = false
		days.forEach((p, i) => {
			const v = p[key].value
			if (v === null) {
				pen = false
				return
			}
			d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
			pen = true
		})
		return d
	}
	const f = progress.current.form.value
	const fit = progress.current.fitness.value
	const fat = progress.current.fatigue.value
	return (
		<figure className="b-fig">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				width="100%"
				height={H}
				role="img"
				aria-label="Formlinje over 12 uker"
				preserveAspectRatio="none"
			>
				<line x1="0" x2={W} y1={H - 6} y2={H - 6} stroke="var(--rule)" />
				<path
					d={line('fatigue')}
					fill="none"
					stroke="var(--red)"
					strokeWidth="1.2"
					strokeDasharray="3 3"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					d={line('fitness')}
					fill="none"
					stroke="var(--ink)"
					strokeWidth="2"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
			<figcaption>
				Streken er formen du bygger (nå <N>{fit !== null ? n0(fit) : '–'}</N>),
				den stiplede røde er slitenheten (nå{' '}
				<N>{fat !== null ? n0(fat) : '–'}</N>), de siste {progress.weeks} ukene.{' '}
				{f !== null ? (
					<>
						Forskjellen, <N>{n0(f)}</N>, sier at du er {formWord(f)}.
					</>
				) : (
					<Unknown why={progress.current.form.why} />
				)}
				{progress.trend
					? ` Du har ligget ${progress.trend.direction === 'under' ? 'under' : 'over'} planen ${progress.trend.weeks} uker på rad.`
					: ''}
			</figcaption>
		</figure>
	)
}

function SportBars({ sports }: { sports: SportVolume[] }) {
	if (!sports.length) return null
	if (sports.every((s) => !known(s.target)))
		return <p className="b-p">Denne uka har ingen mål per idrett å måle mot.</p>
	return (
		<figure className="b-fig">
			<div style={{ display: 'grid', gap: 10 }}>
				{sports.map((s) => {
					const target = known(s.target) ? s.target.value : null
					const actual = known(s.actual) ? s.actual.value : null
					const max = Math.max(target ?? 0, actual ?? 0, 0.0001)
					return (
						<div key={s.sport}>
							<div
								style={{
									display: 'flex',
									justifyContent: 'space-between',
									gap: 12,
									fontSize: 16,
								}}
							>
								<span>{s.sportName}</span>
								<span>
									{actual !== null ? (
										<N>{volumeText(actual, s.unit)}</N>
									) : (
										<Unknown why={s.actual.why} />
									)}
									<span className="b-small"> av </span>
									{target !== null ? (
										<N>{volumeText(target, s.unit)}</N>
									) : (
										<Unknown why={s.target.why}>ingen mål</Unknown>
									)}
								</span>
							</div>
							<div
								aria-hidden
								style={{ position: 'relative', height: 8, marginTop: 4 }}
							>
								{target !== null ? (
									<span
										style={{
											position: 'absolute',
											left: 0,
											top: 0,
											bottom: 0,
											width: `${(target / max) * 100}%`,
											border: '1px solid var(--ink-2)',
											borderRadius: 1,
										}}
									/>
								) : (
									<span
										style={{
											position: 'absolute',
											inset: 0,
											border: '1px dashed var(--pencil)',
											borderRadius: 1,
										}}
									/>
								)}
								{actual !== null ? (
									<span
										style={{
											position: 'absolute',
											left: 0,
											top: 2,
											bottom: 2,
											width: `${(actual / max) * 100}%`,
											background:
												target !== null && actual > target * 1.1
													? 'var(--red)'
													: 'var(--ink)',
											borderRadius: 1,
										}}
									/>
								) : null}
							</div>
						</div>
					)
				})}
			</div>
			<figcaption>Ukas mengde mot planen, per idrett.</figcaption>
		</figure>
	)
}

function Road({
	progress,
	plan,
	today,
}: {
	progress: ProgressOutput
	plan: PlanOutput | null
	today: string
}) {
	const p = plan?.plan
	const goal = progress.goal
	if (!p) return null
	const end = goal?.goal.date ?? addDays(p.lastWeek, 6)
	const start = p.firstWeek
	const span = Math.max(1, daysBetween(start, end))
	const pos = Math.min(1, Math.max(0, daysBetween(start, today) / span))
	const W = 320
	return (
		<figure className="b-fig">
			<svg
				viewBox={`0 0 ${W} 40`}
				width="100%"
				height="40"
				role="img"
				aria-label="Veien fra start til løpsdagen"
			>
				<line
					x1="6"
					x2={W - 6}
					y1="20"
					y2="20"
					stroke="var(--ink-2)"
					strokeWidth="1.5"
					strokeDasharray={goal?.goal.date ? undefined : '4 4'}
				/>
				{p.phases.map((ph) => {
					const px = 6 + (daysBetween(start, ph.firstWeek) / span) * (W - 12)
					return (
						<line
							key={ph.firstWeek}
							x1={px}
							x2={px}
							y1="14"
							y2="26"
							stroke="var(--ink-2)"
						/>
					)
				})}
				<line
					x1={W - 6}
					x2={W - 6}
					y1="10"
					y2="30"
					stroke="var(--ink)"
					strokeWidth="2"
				/>
				<circle cx={6 + pos * (W - 12)} cy="20" r="6" fill="var(--red)" />
			</svg>
			<div
				className="b-small"
				style={{ display: 'flex', justifyContent: 'space-between' }}
				aria-hidden
			>
				<span>{dateText(start)}</span>
				<span>
					{goal?.goal.date ? dateText(goal.goal.date) : 'ingen sluttdato'}
				</span>
			</div>
			<figcaption>
				{goal?.goal.date && goal.goal.daysToGo !== null ? (
					<>
						<N>{goal.goal.daysToGo}</N> dager til {goal.goal.name}
						{goal.goal.aim ? ` (${goal.goal.aim.toLowerCase()})` : ''}.{' '}
					</>
				) : (
					<>
						Ingen løpsdato, så veien går blokk for blokk
						{p.block ? `, nå blokk ${p.block}` : ''}.{' '}
					</>
				)}
				{p.currentWeek
					? `Uke ${p.currentWeek} av ${p.totalWeeks}${goal?.phase ? `, ${phaseName(goal.phase).toLowerCase()}` : ''}. `
					: p.firstWeek > today
						? `Planen starter ${dateText(p.firstWeek)}. `
						: ''}
				{known(goal?.fitnessToday) && known(goal?.projectedFitnessOnGoalDay) ? (
					<>
						Formtallet ditt regner jeg fra <N>{n0(goal.fitnessToday.value)}</N>{' '}
						i dag til <N>{n0(goal.projectedFitnessOnGoalDay.value)}</N> på
						løpsdagen, hvis du følger planen.
					</>
				) : goal?.projectedFitnessOnGoalDay?.why ? (
					<>
						Formen på løpsdagen:{' '}
						<Unknown why={goal.projectedFitnessOnGoalDay.why} />.
					</>
				) : null}
			</figcaption>
		</figure>
	)
}

/** The stack of older letters under the current one. */
export function Bunke({
	weeks,
}: {
	weeks: {
		weekKey: string
		isoWeek: number
		phase: string | null
		role: string | null
	}[]
}) {
	if (!weeks.length) return null
	return (
		<nav aria-label="Eldre brev" style={{ marginTop: 18 }}>
			<ul className="b-stack">
				{weeks.map((w) => (
					<li key={w.weekKey}>
						<Link to={`${BASE}/uke/${w.weekKey}`} prefetch="intent">
							<span>Uke {w.isoWeek}</span>
							<span className="b-small" style={{ textAlign: 'right' }}>
								{weekSpan(w.weekKey)}
								{w.phase ? ` · ${phaseName(w.phase)}` : ''}
								{roleWord(w.role) ? ` · ${roleWord(w.role)}` : ''}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</nav>
	)
}
