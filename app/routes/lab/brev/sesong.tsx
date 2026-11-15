import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { type PlanOutput } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type AcceptPlanOutput,
	type OutlookWeek,
	type PlanPhase,
	type PlanPreviewOutput,
	type PlanStyle,
	type PreviewWeek,
	type SessionPreference,
	type SetupState,
	type StartOptionsOutput,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/sesong.ts'
import {
	BASE,
	DAY_NAME,
	DAY_SHORT,
	addDays,
	dateText,
	greetingName,
	hoursText,
	known,
	listText,
	minText,
	n1,
	phaseName,
	volumeText,
	weekSpan,
	weekdayOf,
	daysBetween,
} from './__lib.ts'
import {
	ErrorLine,
	N,
	Sheet,
	Signature,
	Unknown,
	WeekLine,
	useWrite,
} from './__ui.tsx'

const STYLES: PlanStyle[] = ['polarized', 'threshold', 'classic', 'big-base']

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url)
	const stil = url.searchParams.get('stil')
	const style = STYLES.includes(stil as PlanStyle)
		? (stil as PlanStyle)
		: undefined
	const athlete = await runCapability(request, 'athlete', {})
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	const me = athlete.value
	if (me.setup.complete) {
		const plan = await runCapability(request, 'plan', {})
		return {
			mode: 'plan' as const,
			me,
			plan: plan.ok ? (plan.value as PlanOutput) : null,
			error: plan.ok ? null : plan.message,
		}
	}
	const [setup, options, preview] = await Promise.all([
		runCapability(request, 'get_setup', {}),
		runCapability(request, 'start_options', {}),
		runCapability(request, 'plan_preview', style ? { style } : {}),
	])
	return {
		mode: 'preview' as const,
		me,
		setup: setup.ok ? (setup.value as SetupState) : null,
		options: options.ok ? (options.value as StartOptionsOutput) : null,
		preview: preview.ok ? (preview.value as PlanPreviewOutput) : null,
		error: !options.ok ? options.message : !preview.ok ? preview.message : null,
		errorCode: !options.ok ? options.code : !preview.ok ? preview.code : null,
	}
}

export const meta = () => [{ title: 'Brev · sesongbrevet' }]

export default function Sesong({ loaderData }: Route.ComponentProps) {
	if (loaderData.mode === 'plan') return <CurrentPlan data={loaderData} />
	return <Preview data={loaderData} />
}

// ── Before the plan: the season letter to sign ───────────────────────────

type PreviewData = Extract<
	Route.ComponentProps['loaderData'],
	{ mode: 'preview' }
>

function previewLine(w: PreviewWeek) {
	return w.days.map((d) => ({
		weekday: DAY_SHORT[d.weekday],
		items: [
			...d.sessions.map((s) => ({
				sport: s.sport,
				minutes: s.minutes,
				hard: s.effort === 'hard',
			})),
			...d.strength.map(() => ({ sport: 'strength', minutes: null })),
		],
	}))
}

function weekLabel(w: PreviewWeek) {
	return w.days
		.map((d) => {
			const parts = [
				...d.sessions.map((s) => `${s.title} ${s.minutes} min`),
				...d.strength.map((s) => s.title),
			]
			return `${DAY_NAME[d.weekday]}: ${parts.length ? parts.join(', ') : 'hvile'}`
		})
		.join('; ')
}

function describePhase(weeks: OutlookWeek[]) {
	const hours = weeks.map((w) => w.hours).filter((h): h is number => h !== null)
	const easy = weeks.filter((w) => w.role === 'recovery').length
	const taper = weeks.some((w) => w.role === 'taper')
	const parts: string[] = []
	if (taper)
		parts.push('Mindre mengde og litt fart, så du er uthvilt når det gjelder.')
	else if (hours.length) {
		const lo = Math.min(...hours)
		const hi = Math.max(...hours)
		parts.push(
			Math.abs(hi - lo) < 0.3
				? `Rundt ${hoursText(lo)} i uka.`
				: `Fra ${hoursText(hours[0]!)} til ${hoursText(Math.max(...hours))} i uka på det meste.`,
		)
	}
	if (easy)
		parts.push(
			easy === 1
				? 'Én av ukene er lett, med vilje.'
				: `${easy} av ukene er lette, med vilje.`,
		)
	return parts.join(' ')
}

function HoursLine({ weeks, max }: { weeks: OutlookWeek[]; max: number }) {
	return (
		<div
			role="img"
			aria-label={weeks
				.map(
					(w, i) =>
						`Uke ${i + 1}: ${w.hours !== null ? hoursText(w.hours) : 'ukjent'}, ${w.roleLabel}`,
				)
				.join('; ')}
			style={{
				display: 'flex',
				alignItems: 'flex-end',
				gap: 3,
				height: 40,
				margin: '8px 0 4px',
			}}
		>
			{weeks.map((w) => (
				<span
					key={w.weekStart}
					title={w.why}
					style={{
						flex: 1,
						height:
							w.hours !== null
								? `${Math.max(8, (w.hours / max) * 100)}%`
								: '100%',
						background:
							w.hours === null
								? 'transparent'
								: w.role === 'recovery'
									? 'var(--rule)'
									: w.role === 'taper'
										? 'var(--ink-2)'
										: 'var(--ink)',
						border: w.hours === null ? '1px dashed var(--pencil)' : 'none',
						borderRadius: 1,
					}}
				/>
			))}
		</div>
	)
}

type Change = 'style' | 'hours' | 'strength' | 'long' | 'short'

function Preview({ data }: { data: PreviewData }) {
	const { me, setup, options, preview, error } = data
	const [search] = useSearchParams()
	const navigate = useNavigate()
	const [mode, setMode] = useState<'read' | 'sign'>('read')
	const [margin, setMargin] = useState(false)
	const [changed, setChanged] = useState<Set<Change>>(new Set())
	const accept = useWrite<{ style?: PlanStyle }, AcceptPlanOutput>(
		'accept_plan',
	)
	const volume = useWrite('set_current_volume')
	const strength = useWrite('set_strength')
	const prefs = useWrite('set_session_preferences')
	const name = greetingName(me.name, me.username)

	if (!preview || !options || !setup) {
		return (
			<main className="b-col">
				<div className="b-sheet">
					<p className="b-p">Jeg kan ikke skrive sesongbrevet ennå.</p>
					<ErrorLine message={error} />
					<Link
						to={`${BASE}/velkommen`}
						className="b-btn"
						style={{ marginTop: 12 }}
					>
						Tilbake til introduksjonsbrevet
					</Link>
				</div>
			</main>
		)
	}

	const option =
		options.options.find((o) => o.style === preview.style) ?? options.options[0]
	const phases: PlanPhase[] =
		preview.towardGoal && !preview.towardGoal.problem
			? preview.towardGoal.phases
			: preview.phases
	const outlook: OutlookWeek[] =
		preview.towardGoal && !preview.towardGoal.problem
			? preview.towardGoal.outlook
			: preview.outlook
	const a = setup.answers
	const hoursNow =
		a.currentHoursPerWeek ??
		(options.assumed.find((x) => x.question === 'currentHoursPerWeek')
			?.value as number | undefined) ??
		null
	const mark = (c: Change) => setChanged((s) => new Set(s).add(c))
	const u = (c: Change | Change[]) =>
		(Array.isArray(c) ? c : [c]).some((x) => changed.has(x)) ? 'b-under' : ''
	const likes = a.sessionPreferences ?? []
	const togglePref = async (p: SessionPreference, c: Change) => {
		const next = likes.includes(p)
			? likes.filter((x) => x !== p)
			: [...likes, p]
		const r = await prefs.call({ preferences: next })
		if (r.ok) {
			mark(c)
			setMode('read')
		}
	}
	let weekNo = 0

	return (
		<main className="b-col">
			<article className="b-sheet b-new-letter" aria-labelledby="sesong-h">
				<p
					className="b-small"
					style={{
						margin: 0,
						letterSpacing: '.06em',
						textTransform: 'uppercase',
					}}
				>
					Sesongbrevet
				</p>
				<h1 id="sesong-h" className="b-h" style={{ marginTop: 6 }}>
					Kjære {name},
				</h1>
				<p className="b-p">
					her er sesongen jeg foreslår. Den starter mandag{' '}
					{dateText(preview.startsOn)}
					{preview.towardGoal && !preview.towardGoal.problem
						? ` og går mot ${preview.towardGoal.goal.name} ${dateText(preview.towardGoal.goal.date)}`
						: ', og bygger deg opp blokk for blokk'}
					.
				</p>
				<p className={`b-p ${u('style')}`}>
					Måten vi trener på:{' '}
					<strong style={{ fontWeight: 600 }}>
						{preview.name.toLowerCase()}
					</strong>
					. {preview.why} <span className="b-small">({option?.styleName})</span>
				</p>
				{preview.towardGoal?.problem ? (
					<p className="b-margin">{preview.towardGoal.problem}</p>
				) : null}
				{options.assumed.length ? (
					<p className="b-margin" style={{ fontSize: 16, lineHeight: '24px' }}>
						{options.assumed
							.map((x) =>
								x.question === 'currentHoursPerWeek'
									? `Du sa ikke hvor mye du trener, så jeg har brukt ${hoursText(x.value as number)} i uka ${x.from === 'history' ? 'fra klokka di' : 'fra nivået ditt'}.`
									: `Du sa ikke hvilke dager som går, så jeg har brukt ${listText((x.value as string[]).map((d) => DAY_NAME[d as keyof typeof DAY_NAME]))} ${x.from === 'history' ? 'fra klokka di' : 'fra nivået ditt'}.`,
							)
							.join(' ')}{' '}
						Si fra under «Jeg vil endre noe».
					</p>
				) : null}
				{Array.from(new Set([...preview.notes, ...options.notes])).map((n) => (
					<p key={n} className="b-small">
						{n}
					</p>
				))}

				{phases.map((ph, i) => {
					const first = weekNo + 1
					weekNo += ph.weeks
					const weeks = outlook.filter(
						(w) =>
							w.weekStart >= ph.from &&
							w.weekStart < addDays(ph.from, ph.weeks * 7),
					)
					const previewWeeks = preview.weeks.filter(
						(w) =>
							w.weekStart >= ph.from &&
							w.weekStart < addDays(ph.from, ph.weeks * 7),
					)
					return (
						<section key={ph.from + i} style={{ marginTop: 26 }}>
							<h2 className="b-h2" style={{ marginTop: 0 }}>
								Uke {first}
								{ph.weeks > 1 ? `–${weekNo}` : ''}: {phaseName(ph.name)}
							</h2>
							<p className={`b-p ${u(['hours', 'strength', 'long', 'short'])}`}>
								{describePhase(weeks) ||
									`${ph.weeks} ${ph.weeks === 1 ? 'uke' : 'uker'}.`}
							</p>
							{previewWeeks.map((w, j) => (
								<div key={w.weekStart}>
									<p className="b-small" style={{ margin: '6px 0 0' }}>
										Uke {first + j}, {weekSpan(w.weekStart)}:{' '}
										<span
											className={u([
												'hours',
												'strength',
												'long',
												'short',
												'style',
											])}
										>
											<N>{minText(w.totals.minutes)}</N>, {w.totals.sessions}{' '}
											økter
											{w.totals.hardSessions
												? `, ${w.totals.hardSessions} harde`
												: ''}
											{w.totals.strengthSessions
												? `, ${w.totals.strengthSessions} styrke`
												: ''}
										</span>
									</p>
									<WeekLine days={previewLine(w)} label={weekLabel(w)} />
								</div>
							))}
							{weeks.length > previewWeeks.length ? (
								<HoursLine
									weeks={weeks}
									max={Math.max(1, ...outlook.map((w) => w.hours ?? 0))}
								/>
							) : null}
							{weeks.some((w) => w.hours === null) ? (
								<p className="b-small">
									<Unknown why={weeks.find((w) => w.hours === null)?.why}>
										Noen uker kan jeg ikke tidfeste ennå
									</Unknown>
								</p>
							) : null}
						</section>
					)
				})}

				{option?.shortOfHours ? (
					<p className="b-margin">{option.shortOfHours.note}</p>
				) : null}
				{option?.notFitted ? (
					<p className="b-margin">{option.notFitted}</p>
				) : null}
				{option?.strengthNotes.map((n) => (
					<p key={n} className="b-margin">
						{n}
					</p>
				))}

				<hr className="b-rule" />
				<p className="b-p">Skal vi gjøre det sånn?</p>
				{mode === 'read' ? (
					<div className="b-row">
						<button
							type="button"
							className="b-btn"
							onClick={() => setMode('sign')}
						>
							Ja, sett i gang
						</button>
						<button
							type="button"
							className="b-btn b-btn-ghost"
							onClick={() => setMargin(true)}
						>
							Jeg vil endre noe
						</button>
					</div>
				) : (
					<div className="b-fade-in">
						<p className="b-small">
							Planen kan ikke «av-lages» når den er signert, men alt i den kan
							endres etterpå, uke for uke.
						</p>
						<Signature
							key={[...changed].join()}
							name={name}
							label="Signer sesongbrevet"
							signed={false}
							pending={accept.pending}
							onSign={async () => {
								const r = await accept.call(
									{ style: preview.style },
									{ revalidate: false },
								)
								if (r.ok) void navigate(BASE, { replace: true })
							}}
						/>
						<ErrorLine message={accept.error} />
						<button
							type="button"
							className="b-word"
							style={{ fontSize: 16 }}
							onClick={() => setMode('read')}
						>
							Ikke ennå
						</button>
					</div>
				)}
			</article>

			<Sheet open={margin} onClose={() => setMargin(false)} title="I margen">
				<p className="b-small" style={{ margin: '0 0 6px' }}>
					Velg en merknad. Jeg skriver brevet om og streker under det som endret
					seg.
				</p>
				<ul className="b-menu">
					{options.options.length > 1
						? options.options
								.filter((o) => o.style !== preview.style)
								.map((o) => (
									<li key={o.style}>
										<button
											type="button"
											className="b-choice"
											onClick={() => {
												const p = new URLSearchParams(search)
												p.set('stil', o.style)
												mark('style')
												setMargin(false)
												setMode('read')
												void navigate(`?${p}`, {
													replace: true,
													preventScrollReset: true,
												})
											}}
										>
											<span>
												«Heller {o.name.toLowerCase()}»
												<span className="b-small" style={{ display: 'block' }}>
													{o.why} <N>{minText(o.firstWeek.totals.minutes)}</N>{' '}
													første uke.
												</span>
											</span>
										</button>
									</li>
								))
						: null}
					<li>
						<button
							type="button"
							className="b-choice"
							disabled={volume.pending || hoursNow === null || hoursNow <= 1}
							onClick={async () => {
								const r = await volume.call({
									hoursPerWeek: Math.max(1, (hoursNow ?? 2) - 1),
								})
								if (r.ok) {
									mark('hours')
									setMargin(false)
									setMode('read')
								}
							}}
						>
							<span>
								«Færre timer»
								{hoursNow !== null ? (
									<span className="b-small" style={{ display: 'block' }}>
										{n1(hoursNow)} → {n1(Math.max(1, hoursNow - 1))} t i uka
									</span>
								) : null}
							</span>
						</button>
					</li>
					<li>
						<button
							type="button"
							className="b-choice"
							disabled={volume.pending || hoursNow === null || hoursNow >= 20}
							onClick={async () => {
								const r = await volume.call({
									hoursPerWeek: Math.min(20, (hoursNow ?? 4) + 1),
								})
								if (r.ok) {
									mark('hours')
									setMargin(false)
									setMode('read')
								}
							}}
						>
							<span>
								«Flere timer»
								{hoursNow !== null ? (
									<span className="b-small" style={{ display: 'block' }}>
										{n1(hoursNow)} → {n1(Math.min(20, hoursNow + 1))} t i uka
									</span>
								) : null}
							</span>
						</button>
					</li>
					<li>
						<button
							type="button"
							className="b-choice"
							aria-pressed={likes.includes('long')}
							disabled={prefs.pending}
							onClick={() =>
								void togglePref('long', 'long').then(() => setMargin(false))
							}
						>
							<span>
								{likes.includes('long')
									? '«Ikke så mye langtur»'
									: '«Lengre langtur»'}
							</span>
						</button>
					</li>
					<li>
						<button
							type="button"
							className="b-choice"
							aria-pressed={likes.includes('short')}
							disabled={prefs.pending}
							onClick={() =>
								void togglePref('short', 'short').then(() => setMargin(false))
							}
						>
							<span>
								{likes.includes('short')
									? '«Lengre økter i hverdagen går fint»'
									: '«Korte økter i hverdagen»'}
								<span className="b-small" style={{ display: 'block' }}>
									Hverdagsøkter på høyst 45 minutter
								</span>
							</span>
						</button>
					</li>
					{[0, 1, 2, 3]
						.filter((n) => n !== (a.strengthPerWeek ?? 0))
						.map((n) => (
							<li key={n}>
								<button
									type="button"
									className="b-choice"
									disabled={strength.pending}
									onClick={async () => {
										const r = await strength.call({
											perWeek: n as 0 | 1 | 2 | 3,
										})
										if (r.ok) {
											mark('strength')
											setMargin(false)
											setMode('read')
										}
									}}
								>
									<span>
										{n === 0
											? '«Ingen styrke»'
											: n === 1
												? '«Styrke én gang i uka»'
												: `«Styrke ${n} ganger i uka»`}
									</span>
								</button>
							</li>
						))}
					<li>
						<Link
							to={`${BASE}/velkommen`}
							className="b-choice"
							style={{ textDecoration: 'none' }}
						>
							<span>«Andre dager», «nytt mål», noe annet om meg</span>
							<span aria-hidden style={{ color: 'var(--pencil)' }}>
								→
							</span>
						</Link>
					</li>
				</ul>
				<ErrorLine message={volume.error ?? strength.error ?? prefs.error} />
			</Sheet>
		</main>
	)
}

// ── With a plan: the season as it stands ─────────────────────────────────

type PlanData = Extract<Route.ComponentProps['loaderData'], { mode: 'plan' }>

function CurrentPlan({ data }: { data: PlanData }) {
	const { me, plan, error } = data
	const p = plan?.plan
	const name = greetingName(me.name, me.username)
	return (
		<main className="b-col">
			<Link to={`${BASE}/arkiv`} className="b-back">
				← Arkivet
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
					Sesongbrevet
				</p>
				<h1 className="b-h" style={{ marginTop: 6 }}>
					Kjære {name},
				</h1>
				{!p ? (
					<>
						<p className="b-p">Du har ingen plan som løper nå.</p>
						<ErrorLine message={error} />
					</>
				) : (
					<>
						<p className="b-p">
							dette er sesongen du signerte: {p.totalWeeks} uker fra{' '}
							{dateText(p.firstWeek)}
							{p.goal.kind === 'event' && p.goal.date
								? ` mot ${p.goal.name} ${dateText(p.goal.date)}`
								: ', blokk for blokk'}
							.{p.currentWeek ? ` Nå er du i uke ${p.currentWeek}.` : ''}
						</p>
						{p.philosophy ? (
							<p className="b-p">
								<strong style={{ fontWeight: 600 }}>
									{p.philosophy.name}.
								</strong>{' '}
								{p.philosophy.description}
							</p>
						) : null}
						{p.phases.map((ph) => {
							const weeks = p.weeks.filter(
								(w) => w.weekKey >= ph.firstWeek && w.weekKey <= ph.lastWeek,
							)
							return (
								<section key={ph.firstWeek} style={{ marginTop: 22 }}>
									<h2 className="b-h2" style={{ marginTop: 0 }}>
										Uke {weeks[0]?.number ?? ''}
										{weeks.length > 1
											? `–${weeks[weeks.length - 1]!.number}`
											: ''}
										: {phaseName(ph.name)}
										{ph.isCurrent ? ' · nå' : ''}
									</h2>
									<ul className="b-ps">
										{weeks.map((w) => (
											<li key={w.weekKey} style={{ marginBottom: 6 }}>
												<Link
													to={`${BASE}/uke/${w.weekKey}`}
													style={{ textDecoration: 'none' }}
												>
													<span
														style={{
															fontWeight: w.when === 'current' ? 600 : 400,
														}}
													>
														Uke {w.number}
													</span>{' '}
													<span className="b-small">
														{weekSpan(w.weekKey)}
														{w.role === 'recovery'
															? ' · lett'
															: w.role === 'taper'
																? ' · nedtrapping'
																: ''}
													</span>{' '}
													<span className="b-small">
														{w.sports
															.filter(
																(s) => known(s.target) && s.target.value > 0,
															)
															.map(
																(s) =>
																	`${s.sportName.toLowerCase()} ${volumeText(s.target.value!, s.unit)}`,
															)
															.join(', ')}
													</span>
												</Link>
											</li>
										))}
									</ul>
								</section>
							)
						})}
						{p.goal.kind === 'event' && p.goal.date ? (
							<p className="b-small" style={{ marginTop: 16 }}>
								{daysBetween(me.today, p.goal.date) >= 0
									? `${daysBetween(me.today, p.goal.date)} dager igjen til ${p.goal.name}, ${DAY_NAME[weekdayOf(p.goal.date)]}.`
									: `${p.goal.name} var ${dateText(p.goal.date)}.`}
							</p>
						) : null}
					</>
				)}
			</article>
		</main>
	)
}
