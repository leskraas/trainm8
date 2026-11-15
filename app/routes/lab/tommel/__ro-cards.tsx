import {
	type AthleteOutput,
	type ProposalItem,
	type ProposalsOutput,
	type RecordingItem,
	type SessionCard,
	type SessionOutput,
	type TodayOutput,
	type WeekOutput,
	type ZonesOutput,
} from '#app/lab/engine/reads.types.ts'
import {
	type AnswerProposalOutput,
	type EaseWeekOutput,
	type LinkRecordingOutput,
	type LogStrengthAsPlannedOutput,
	type MarkDoneOutput,
	type SessionSnapshot,
	type SetCountsTowardPlanOutput,
	type SkipSessionOutput,
	type StrengthSessionOutput,
	type UndoOutput,
} from '#app/lab/engine/sessions.types.ts'
import { type GoalOutput } from '#app/lab/engine/setup.types.ts'
import { BASE, markSeen, must, seenAt, wasSeen } from './__api.ts'
import { type Card, type Next } from './__deck.tsx'
import { type Offer } from './__flows.tsx'
import {
	addDays,
	clock,
	daysBetween,
	dur,
	num,
	pace,
	plural,
	relDay,
	unitText,
} from './__format.ts'
import { bigName, feelingCards, resultCard } from './__session.tsx'
import { BeforeAfter, Unknown } from './__ui.tsx'

export type RoData = {
	athlete: AthleteOutput
	today: TodayOutput
	proposals: ProposalsOutput | null
	recent: SessionCard[]
	details: SessionOutput[]
	links: Array<{ rec: RecordingItem; options: SessionSnapshot[] }>
	week: WeekOutput | null
	lastWeek: WeekOutput | null
	goal: GoalOutput | null
	zones: ZonesOutput | null
	strength: StrengthSessionOutput | null
}

export type RoCtx = {
	nav: (to: string) => void
	offer: (o: Offer) => void
	now: Date
}

const MAX = 5

function info(
	key: string,
	topic: string,
	question: string,
	reason?: string,
): Card {
	return { key, topic, question, reason, kind: 'ok' }
}

const ACTIVITY: Record<string, string> = {
	run: 'løpeturen',
	bike: 'sykkelturen',
	swim: 'svømmeøkta',
	strength: 'styrkeøkta',
	other: 'aktiviteten',
}

function hhmm(iso: string) {
	return new Date(iso).toLocaleTimeString('nb-NO', {
		hour: '2-digit',
		minute: '2-digit',
	})
}

// ── proposals: the plan wants to change something ─────────────────────

function sessionLabel(s: ProposalItem['session'], today: string) {
	if (!s) return null
	return `${relDay(s.date, today)}: ${s.title ?? 'økt'}`
}

function proposalBA(p: ProposalItem, today: string) {
	const c = p.change
	const s = p.session
	if (c.kind === 'move' && s)
		return {
			before: `${relDay(c.fromDate, today)}: ${s.title ?? 'økt'}`,
			after: `${relDay(c.toDate, today)}: ${s.title ?? 'økt'}${c.makeUp ? ' (tas igjen)' : ''}`,
		}
	if (c.kind === 'swap' && s && p.otherSession)
		return {
			before: `${sessionLabel(s, today)} · ${sessionLabel(p.otherSession, today)}`,
			after: `${relDay(p.otherSession.date, today)}: ${s.title ?? 'økt'} · ${relDay(s.date, today)}: ${p.otherSession.title ?? 'økt'}`,
		}
	if (c.kind === 'add')
		return {
			before: `${relDay(c.date, today)}: ingenting`,
			after: `${relDay(c.date, today)} kl. ${c.time}: ${s?.title ?? 'ny økt'}`,
		}
	if (c.kind === 'scale')
		return {
			before: c.wholeWeek
				? 'Uka som planlagt'
				: `${s?.title ?? 'Økta'} som planlagt`,
			after: `${num(c.factor * 100)} % av det${c.wholeWeek ? ', hele uka' : ''}`,
		}
	if (c.kind === 'add-phase')
		return {
			before: 'Blokken slutter',
			after: `${c.name}: ${plural(c.weeks, 'uke', 'uker')}, ${num(c.factor * 100)} % mengde`,
		}
	return null
}

export function proposalCard(
	p: ProposalItem,
	today: string,
	summary: string | null,
	ctx: Pick<RoCtx, 'offer'>,
): Card {
	const ba = proposalBA(p, today)
	const answer = async (
		answer: 'yes' | 'no',
		scope?: 'this-week' | 'from-now-on',
	): Promise<Next> => {
		const r = await must<AnswerProposalOutput>('answer_proposal', {
			proposalId: p.id,
			answer,
			...(scope ? { scope } : {}),
		})
		if (answer === 'yes') {
			ctx.offer({ text: `${p.headline}. Gjort.`, token: r.undo })
			if (!r.applied)
				return info(
					`p-noop-${p.id}`,
					'Endring',
					'Det var ingenting igjen å endre.',
					'Svaret er lagret.',
				)
		}
		return undefined
	}
	const yes = (): Next | Promise<Next> => {
		if (p.asksScope)
			return {
				key: `p-scope-${p.id}`,
				topic: 'Endring',
				question: 'Bare denne uka?',
				reason: 'Nei betyr fra nå av, hver uke.',
				yes: () => answer('yes', 'this-week'),
				no: () => answer('yes', 'from-now-on'),
			}
		if (p.block) {
			const b = p.block
			const at = (f: number) =>
				Math.min(b.max, Math.max(b.min, Math.round(f / b.step) * b.step))
			const round = async (factor: number): Promise<Next> => {
				const r = await must<AnswerProposalOutput>('accept_round', {
					proposalId: p.id,
					factor,
				})
				ctx.offer({
					text: `Neste blokk på ${num(factor * 100)} %.`,
					token: r.undo,
				})
				return undefined
			}
			return {
				key: `p-level-${p.id}`,
				topic: 'Endring',
				question: `Samme mengde som foreslått, ${num(b.factor * 100)} %?`,
				yes: () => answer('yes'),
				no: () => ({
					key: `p-less-${p.id}`,
					topic: 'Endring',
					question: `Litt mindre, ${num(at(b.factor - 2 * b.step) * 100)} %?`,
					yes: () => round(at(b.factor - 2 * b.step)),
					no: () => ({
						key: `p-more-${p.id}`,
						topic: 'Endring',
						question: `Litt mer, ${num(at(b.factor + 2 * b.step) * 100)} %?`,
						yes: () => round(at(b.factor + 2 * b.step)),
						no: () => answer('no'),
					}),
				}),
			}
		}
		return answer('yes')
	}
	return {
		key: `p-${p.id}`,
		topic: 'Endring',
		question: `${p.headline}?`,
		reason: `Fordi ${p.reason.charAt(0).toLowerCase()}${p.reason.slice(1)}`,
		extra: ba ? <BeforeAfter before={ba.before} after={ba.after} /> : undefined,
		why: (
			<>
				<p>
					<b>Regel:</b> når en uke lukkes søndag kveld, holder jeg det du gjorde
					opp mot planen og foreslår endringer for uka som kommer.
				</p>
				{summary ? <p>{summary}</p> : null}
				<p>{p.reason}</p>
				{p.addsLoad ? (
					<p>Dette legger på trening. Det skjer aldri uten ja.</p>
				) : (
					<p>
						Svarer du ikke, gjøres en lettelse stille neste morgen. Den kan
						angres.
					</p>
				)}
				{p.touchesOwnSession ? <p>Dette er en økt du la inn selv.</p> : null}
			</>
		),
		yes,
		no: () => answer('no'),
	}
}

// ── what the plan did by itself ───────────────────────────────────────

function autoChangeCards(d: RoData): Card[] {
	const cm = d.proposals?.changesMade
	if (!cm) return []
	return cm.changes
		.filter(
			(c) =>
				c.kind === 'changed' &&
				c.undo === 'offered' &&
				!wasSeen(`auto-${c.proposalId}`),
		)
		.map((c) => ({
			key: `auto-${c.proposalId}`,
			topic: 'Endring',
			question: `${c.text} Greit?`,
			reason: c.about ?? cm.heading,
			yesLabel: 'Greit',
			noLabel: 'Angre',
			why: (
				<p>
					Regel: planen justerer seg selv hver søndag kveld og sier fra. Hver
					endring kan angres til uka den gjelder begynner.
				</p>
			),
			yes: () => {
				markSeen(`auto-${c.proposalId}`)
				return undefined
			},
			no: async () => {
				await must<UndoOutput>('undo_change', { proposalId: c.proposalId })
				markSeen(`auto-${c.proposalId}`)
				return info(
					`auto-undone-${c.proposalId}`,
					'Endring',
					'Angret.',
					'Det står som før.',
				)
			},
		}))
}

// ── a recording that did not find its session ─────────────────────────

function linkCard(l: RoData['links'][number], d: RoData, ctx: RoCtx): Card {
	const o = l.options[0]!
	const done = () => markSeen(`link-${l.rec.id}`)
	return {
		key: `link-${l.rec.id}`,
		topic: 'I dag',
		question: `Var ${ACTIVITY[l.rec.sport] ?? 'økta'} ${hhmm(l.rec.startedAt)} ${relDay(o.date, d.today.date) === 'i dag' ? 'dagens' : relDay(o.date, d.today.date)} «${o.title ?? 'økt'}»?`,
		reason: `Klokka sendte ${l.rec.durationS.value ? dur(l.rec.durationS.value) : 'en økt'}${l.rec.distanceM.value ? `, ${num(l.rec.distanceM.value / 1000, 1)} km` : ''}.`,
		why: (
			<p>
				Regel: en økt fra klokka kobles til den planlagte økta samme dag med
				samme idrett. Denne fant ikke plassen sin selv.
			</p>
		),
		yes: async () => {
			done()
			const r = await must<LinkRecordingOutput>('link_recording', {
				recordingId: l.rec.id,
				sessionId: o.id,
			})
			ctx.offer({ text: `Koblet til «${o.title ?? 'økta'}».`, token: r.undo })
			return feelingCards({ id: o.id, title: o.title ?? 'Økta' }, ctx.offer)
		},
		no: () => ({
			key: `link-extra-${l.rec.id}`,
			topic: 'I dag',
			question: 'Var det en ekstra økt?',
			yes: () => {
				done()
				return info(
					`link-kept-${l.rec.id}`,
					'I dag',
					'Da står den som en ekstra økt.',
				)
			},
			no: () => ({
				key: `link-out-${l.rec.id}`,
				topic: 'I dag',
				question: 'Skal den holdes utenfor planen?',
				reason: 'For eksempel sykling til jobben. Belastningen telles uansett.',
				yes: async () => {
					done()
					if (!l.rec.sessionId) return undefined
					const r = await must<SetCountsTowardPlanOutput>(
						'set_counts_toward_plan',
						{ sessionId: l.rec.sessionId, countsTowardPlan: false },
					)
					ctx.offer({ text: 'Holdes utenfor planen.', token: r.undo })
					return undefined
				},
				no: () => {
					done()
					return undefined
				},
			}),
		}),
	}
}

// ── done or not ───────────────────────────────────────────────────────

async function markDone(s: SessionCard, ctx: RoCtx): Promise<Next> {
	if (s.sport === 'strength') {
		const r = await must<LogStrengthAsPlannedOutput>(
			'log_strength_as_planned',
			{ sessionId: s.id },
		)
		ctx.offer({ text: `«${s.title}» er logget som planlagt.`, token: r.undo })
	} else {
		const r = await must<MarkDoneOutput>('mark_done', { sessionId: s.id })
		ctx.offer({ text: `«${s.title}» er gjort.`, token: r.undo })
		if (r.noUndoBecause)
			return [
				info(`done-note-${s.id}`, 'I dag', 'Registrert.', r.noUndoBecause),
				feelingCards(s, ctx.offer),
			]
	}
	return feelingCards(s, ctx.offer)
}

function doneTodayCard(s: SessionCard, ctx: RoCtx): Card {
	return {
		key: `done-${s.id}`,
		topic: 'I dag',
		question: 'Gjorde du dagens økt?',
		reason: `${bigName(s)}${s.planned.durationS.value ? `, ${dur(s.planned.durationS.value)}` : ''}.`,
		why: (
			<p>
				Klokka har ikke sendt noe for økta ennå. Sier du ja, kobles en økt som
				kommer senere til den av seg selv.
			</p>
		),
		yes: () => markDone(s, ctx),
		no: () => ({
			key: `later-${s.id}`,
			topic: 'I dag',
			question: 'Gjør du den senere i dag?',
			yes: () => {
				markSeen(`done-${s.id}`)
				return undefined
			},
			no: () => ({
				key: `skip-${s.id}`,
				topic: 'I dag',
				question: 'Hoppe over den?',
				extra: (
					<BeforeAfter
						before={`${bigName(s)}: planlagt`}
						after={`${bigName(s)}: ikke gjort`}
					/>
				),
				yes: async () => {
					markSeen(`done-${s.id}`)
					const r = await must<SkipSessionOutput>('skip_session', {
						sessionId: s.id,
					})
					ctx.offer({ text: `«${s.title}» er hoppet over.`, token: r.undo })
					return undefined
				},
				no: () => {
					markSeen(`done-${s.id}`)
					return undefined
				},
			}),
		}),
	}
}

function yesterdayCard(s: SessionCard, ctx: RoCtx): Card {
	return {
		key: `yday-${s.id}`,
		topic: 'I går',
		question: `Gjorde du «${s.title}» i går?`,
		reason: 'Klokka har ikke sendt noe for den.',
		yes: () => {
			markSeen(`yday-${s.id}`)
			return markDone(s, ctx)
		},
		no: () => {
			markSeen(`yday-${s.id}`)
			return info(
				`yday-no-${s.id}`,
				'I går',
				'Den står som ikke gjort.',
				'Bommer du flere, foreslår jeg endringer.',
			)
		},
	}
}

function strengthTodayCard(st: StrengthSessionOutput, ctx: RoCtx): Card {
	const s = st.session
	const first = st.exercises[0]?.name
	return {
		key: `str-${s.id}`,
		topic: 'Styrke',
		question: first ? `Klar for styrke? ${first} først.` : 'Klar for styrke?',
		reason: `${plural(st.exercises.length, 'øvelse', 'øvelser')}. Ett kort per sett.`,
		yes: () => {
			ctx.nav(`${BASE}/styrke/${s.id}/0`)
			return null
		},
		no: () => ({
			key: `str-all-${s.id}`,
			topic: 'Styrke',
			question: 'Gjorde du hele økta som planlagt?',
			yes: async () => {
				markSeen(`str-${s.id}`)
				const r = await must<LogStrengthAsPlannedOutput>(
					'log_strength_as_planned',
					{ sessionId: s.id },
				)
				ctx.offer({
					text: `${plural(r.loggedSets, 'sett', 'sett')} logget.`,
					token: r.undo,
				})
				return feelingCards({ id: s.id, title: s.title ?? 'Styrke' }, ctx.offer)
			},
			no: () => {
				markSeen(`str-${s.id}`)
				return info(
					`str-later-${s.id}`,
					'Styrke',
					'Da tar vi den senere.',
					'Kortet kommer tilbake i morgen hvis den fortsatt står.',
				)
			},
		}),
	}
}

// ── the race tomorrow ─────────────────────────────────────────────────

function raceEveCard(d: RoData): Card | null {
	const g = d.athlete.goal
	if (!g || g.kind !== 'event' || g.daysToGo !== 1 || !g.sports.includes('run'))
		return null
	const sg = d.goal?.goal
	const key = `eve-${g.date}`
	if (wasSeen(key)) return null
	const thr =
		d.zones?.sports.find((s) => s.sport === 'run')?.thresholds.thresholdPace
			.value ?? null
	let answer: Card
	if (sg?.targetTime && sg.distanceKm) {
		const p = sg.targetTime.seconds / sg.distanceKm
		answer = {
			key: `${key}-a`,
			topic: 'Løpet',
			question: `${pace(p)} /km de første 5 km.`,
			reason: 'Det er målfarten din. Ikke raskere.',
			kind: 'ok',
			why: (
				<p>
					Regel: {clock(sg.targetTime.seconds)} over {num(sg.distanceKm, 1)} km
					gir {pace(p)} /km. Den som åpner raskere enn målfarten, betaler for
					det på slutten.
				</p>
			),
		}
	} else if (thr !== null) {
		answer = info(
			`${key}-a`,
			'Løpet',
			'Jeg har ingen måltid for deg.',
			`Terskelfarten din er ${pace(thr)} /km. Hold deg tydelig roligere enn den de første 5 km.`,
		)
	} else
		answer = info(
			`${key}-a`,
			'Løpet',
			'Jeg har ingen terskel eller måltid for deg.',
			'Åpningsfart: ukjent. Start rolig og øk når pusten har satt seg.',
		)
	return {
		key,
		topic: 'Løpet',
		question: 'Vil du ha åpningsfart for løpet?',
		reason: `I morgen: ${g.name}.`,
		yes: () => {
			markSeen(key)
			return answer
		},
		no: () => {
			markSeen(key)
			return undefined
		},
	}
}

// ── the week ──────────────────────────────────────────────────────────

function sundayCard(d: RoData): Card | null {
	const w = d.week
	if (!w || d.today.weekday !== 'sun' || wasSeen(`week-${w.weekKey}`))
		return null
	const all = w.days
		.flatMap((x) => x.sessions)
		.filter((s) => s.status !== 'recording-only')
	if (all.length === 0) return null
	const done = all.filter((s) => s.status === 'done')
	const hit = done.filter((s) => s.verdict.call === 'on-target').length
	const judged = done.filter((s) => s.verdict.call).length
	const verdict =
		done.length === 0
			? ''
			: judged === 0
				? ', ingen med dom'
				: hit === judged
					? ', alle traff'
					: `, ${hit} traff`
	return {
		key: `week-${w.weekKey}`,
		topic: 'Uka',
		question: `Uka: ${done.length} av ${plural(all.length, 'økt', 'økter')}${verdict}.`,
		reason: w.phase
			? `Uke ${w.phase.planWeek} av ${w.phase.planWeeks}, ${w.phase.name}.`
			: undefined,
		kind: 'ok',
		extra: w.sports.length ? (
			<div className="tm-pairs" style={{ marginTop: 0 }}>
				{w.sports.map((s) => (
					<div className="tm-pair" key={s.sport}>
						<span>{s.sportName}</span>
						<span className="num">
							{s.target.value === null ? (
								<Unknown why={s.target.why} />
							) : (
								unitText(s.unit, s.target.value)
							)}
						</span>
						<span className="arrow">→</span>
						<span className="num">
							{s.actual.value === null ? (
								<Unknown why={s.actual.why} />
							) : (
								unitText(s.unit, s.actual.value)
							)}
						</span>
					</div>
				))}
			</div>
		) : undefined,
		why: (
			<p>
				Søndag kl. 20 lukker jeg uka og ser på neste.{' '}
				{d.athlete.adjustMode === 'autopilot'
					? 'Endringer gjør jeg selv og sier fra; alt kan angres.'
					: 'Endringer kommer som kort du svarer på.'}
			</p>
		),
		ok: () => {
			markSeen(`week-${w.weekKey}`)
			return undefined
		},
	}
}

function missedWeekCards(d: RoData, ctx: RoCtx): Card | null {
	const lw = d.lastWeek
	if (!lw || lw.counts.done > 0 || lw.counts.missed < 2) return null
	if (!['mon', 'tue', 'wed'].includes(d.today.weekday)) return null
	const key = `missed-${lw.weekKey}`
	if (wasSeen(key)) return null
	const ease = async (): Promise<Next> => {
		markSeen(key)
		const r = await must<EaseWeekOutput>('ease_week', {})
		ctx.offer({ text: 'Uka er gjort lettere.', token: r.undo })
		return {
			key: `${key}-eased`,
			topic: 'Uka',
			question: `${plural(r.sessionsChanged, 'økt', 'økter')} er gjort lettere.`,
			kind: 'ok',
			extra: (
				<BeforeAfter
					before={
						r.volume
							.map((v) =>
								v.before === null
									? `${v.sport}: ukjent`
									: `${v.sport}: ${unitText(v.unit, v.before)}`,
							)
							.join(' · ') || 'Uka som planlagt'
					}
					after={
						r.volume
							.map((v) =>
								v.after === null
									? `${v.sport}: ukjent`
									: `${v.sport}: ${unitText(v.unit, v.after)}`,
							)
							.join(' · ') || '15 % mindre'
					}
				/>
			),
		}
	}
	return {
		key,
		topic: 'Uka',
		question: 'En uke uten trening. Er du skadet eller syk?',
		reason: `${plural(lw.counts.missed, 'økt', 'økter')} ble ikke gjort forrige uke.`,
		yes: () => ({
			key: `${key}-careful`,
			topic: 'Uka',
			question: 'Start forsiktig: gjør denne uka 15 % lettere?',
			reason: 'Målet står fast.',
			yes: ease,
			no: () => {
				markSeen(key)
				return undefined
			},
		}),
		no: () => ({
			key: `${key}-back`,
			topic: 'Uka',
			question:
				'Skal jeg gjøre denne uka litt lettere, så du kommer inn igjen?',
			yes: ease,
			no: () => {
				markSeen(key)
				return info(
					`${key}-stand`,
					'Uka',
					'Da står planen.',
					'Målet står fast.',
				)
			},
		}),
	}
}

function connectAgainCard(d: RoData, ctx: RoCtx): Card | null {
	if (d.athlete.setup.hasSessionSource) return null
	const at = seenAt('connect-asked')
	if (at && Date.now() - new Date(at).getTime() < 7 * 864e5) return null
	return {
		key: 'connect-again',
		topic: 'Klokka',
		question: 'Vil du koble klokka nå?',
		reason: 'Da slipper du å si «gjort» på hver økt.',
		yes: () => {
			markSeen('connect-asked')
			ctx.nav(`${BASE}/endre?tema=watch`)
			return null
		},
		no: () => {
			markSeen('connect-asked')
			return info('connect-later', 'Klokka', 'Jeg spør igjen om en uke.')
		},
	}
}

// ── the stack, in order, at most five a day ───────────────────────────

export function buildRoCards(d: RoData, ctx: RoCtx): Card[] {
	const today = d.today.date
	const out: Card[] = []
	const push = (c: Card | null | undefined) => {
		if (c && !out.some((x) => x.key === c.key)) out.push(c)
	}
	push(raceEveCard(d))
	for (const p of d.proposals?.proposals ?? [])
		if (p.state === 'waiting')
			push(proposalCard(p, today, d.proposals?.summary ?? null, ctx))
	autoChangeCards(d).forEach(push)
	for (const l of d.links)
		if (l.options.length && !wasSeen(`link-${l.rec.id}`))
			push(linkCard(l, d, ctx))
	const yday = addDays(today, -1)
	for (const s of d.recent)
		if (
			s.date === yday &&
			s.status === 'missed' &&
			!s.markedDone &&
			s.sport !== 'other' &&
			!wasSeen(`yday-${s.id}`)
		)
			push(yesterdayCard(s, ctx))
	if (
		d.strength &&
		d.strength.session.state === 'planned' &&
		!wasSeen(`str-${d.strength.session.id}`)
	)
		push(strengthTodayCard(d.strength, ctx))
	const nowHM = `${String(ctx.now.getHours()).padStart(2, '0')}:${String(ctx.now.getMinutes()).padStart(2, '0')}`
	for (const s of d.today.sessions)
		if (
			s.status === 'planned' &&
			s.sport !== 'strength' &&
			!s.hasRecording &&
			(s.time ?? '12:00') <= nowHM &&
			!wasSeen(`done-${s.id}`)
		)
			push(doneTodayCard(s, ctx))
	for (const det of d.details) {
		if (daysBetween(det.date, today) > 1) continue
		if (
			det.status === 'done' &&
			det.feeling.rpe === null &&
			!wasSeen(`rpe-${det.id}`)
		)
			push(feelingCards(det, ctx.offer))
		else if (det.status === 'done' && !wasSeen(`result-${det.id}`))
			push(resultCard(det))
	}
	push(sundayCard(d))
	push(missedWeekCards(d, ctx))
	push(connectAgainCard(d, ctx))
	return out.slice(0, MAX)
}
