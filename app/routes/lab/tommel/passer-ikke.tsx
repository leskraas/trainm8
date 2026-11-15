import { useCallback, useMemo, useState } from 'react'
import { useLoaderData, useNavigate, useRevalidator } from 'react-router'
import {
	type SessionCard,
	type TodayOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type EaseSessionOutput,
	type EaseWeekOutput,
	type MoveSessionOutput,
	type ShortenSessionOutput,
	type SkipSessionOutput,
	type SwapSessionsOutput,
} from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/passer-ikke.ts'
import { BASE, must } from './__api.ts'
import { Deck, type Card, type Next } from './__deck.tsx'
import { type Offer } from './__flows.tsx'
import {
	addDays,
	dur,
	lowerFirst,
	plural,
	relDay,
	unitText,
} from './__format.ts'
import { athleteOrStart } from './__load.server.ts'
import { bigName, pickMain } from './__session.tsx'
import { BeforeAfter } from './__ui.tsx'
import { useUndo } from './__undo.tsx'

export const meta = () => [{ title: 'Det passer ikke · Tommel' }]

export async function loader({ request }: Route.LoaderArgs) {
	await athleteOrStart(request)
	const today = await runCapability(request, 'today', {})
	if (!today.ok) throw new Response(today.message, { status: 500 })
	const t = today.value as TodayOutput
	const [w1, w2] = await Promise.all([
		runCapability(request, 'week', {}),
		runCapability(request, 'week', { date: addDays(t.weekKey, 7) }),
	])
	const days = [w1, w2].flatMap((w) =>
		w.ok ? (w.value as WeekOutput).days : [],
	)
	return { today: t, days }
}

type Ctx = {
	today: string
	offer: (o: Offer) => void
	done: () => null
	upcoming: SessionCard[]
	byDay: (d: string) => SessionCard[]
}

const info = (
	key: string,
	question: string,
	reason?: string,
	extra?: React.ReactNode,
): Card => ({ key, topic: 'Endring', question, reason, extra, kind: 'ok' })

function mins(s: SessionCard) {
	return s.planned.durationS.value
		? Math.round(s.planned.durationS.value / 60)
		: null
}

function line(s: SessionCard, date = s.date, today: string) {
	return `${relDay(date, today)}: ${bigName(s)}${s.planned.durationS.value ? ` ${dur(s.planned.durationS.value)}` : ''}`
}

/** Today's session, one binary question after another. */
function todayFlow(c: Ctx, s: SessionCard): Card {
	const name = lowerFirst(bigName(s))
	const m = mins(s)
	const tomorrow = addDays(c.today, 1)
	const next = c.upcoming.find((x) => x.id !== s.id && x.date > c.today)

	const shorten = (): Card => {
		const after = m === null ? null : m <= 30 ? 20 : 30
		return {
			key: 'shorten',
			topic: 'Endring',
			question:
				m === null
					? 'Gjøre den kortere?'
					: after! >= m
						? 'Den er alt kort.'
						: `${after} min i stedet for ${m}?`,
			reason: 'Samme hensikt, bare kortere.',
			extra:
				after !== null && after < m! ? (
					<BeforeAfter
						before={`${bigName(s)} ${m} min`}
						after={`${bigName(s)} ${after} min`}
					/>
				) : undefined,
			why: (
				<p>
					Regel: dagens økt blir 30 minutter, eller 20 hvis den alt var 30 eller
					kortere. Hensikten beholdes.
				</p>
			),
			yes: async () => {
				const r = await must<ShortenSessionOutput>('shorten_session', {
					sessionId: s.id,
				})
				c.offer({
					text: `Kortet ned til ${r.minutesAfter ?? 'ukjent'} min.`,
					token: r.undo,
				})
				return info(
					'shortened',
					`${r.minutesAfter ?? 'Ukjent antall'} min.`,
					'Ferdig. Kortet ligger på hovedskjermen.',
					undefined,
				)
			},
			no: tired,
		}
	}
	const tired = (): Card => ({
		key: 'tired',
		topic: 'Endring',
		question: 'Er du sliten?',
		yes: () => {
			const after = m === null ? null : Math.max(20, Math.round(m * 0.6))
			return {
				key: 'ease',
				topic: 'Endring',
				question: after
					? `Rolig i stedet, rundt ${after} min. Ok?`
					: 'Gjøre den rolig og kortere?',
				extra: after ? (
					<BeforeAfter
						before={`${bigName(s)} ${m} min`}
						after={`Rolig ${after} min`}
					/>
				) : undefined,
				why: (
					<p>
						Regel: når du er sliten, blir dagens økt rolig og rundt 60 % så
						lang, aldri under 20 minutter. En styrkeøkt får færre sett.
					</p>
				),
				yes: async () => {
					const r = await must<EaseSessionOutput>('ease_session', {
						sessionId: s.id,
					})
					c.offer({ text: 'Dagens økt er gjort rolig.', token: r.undo })
					return info(
						'eased',
						'Rolig i dag.',
						r.minutesAfter ? `${r.minutesAfter} min.` : undefined,
					)
				},
				no: week,
			}
		},
		no: week,
	})
	const week = (): Card => weekFlow(c, true)

	const later = (): Card => ({
		key: 'later',
		topic: 'Endring',
		question: 'Senere i uka?',
		reason: 'Jeg finner neste ledige dag som passer.',
		why: (
			<p>
				Regel: neste ledige dag denne uka som ikke bryter med harde dager. Er
				ingen dag ledig, bytter den plass med neste økt.
			</p>
		),
		yes: async () => {
			const r = await must<MoveSessionOutput>('move_session', {
				sessionId: s.id,
			})
			c.offer({ text: `${bigName(s)} er flyttet.`, token: r.undo })
			return moved(r)
		},
		no: swap,
	})
	const swap = (): Card =>
		next
			? {
					key: 'swap',
					topic: 'Endring',
					question: `Bytte med ${lowerFirst(bigName(next))} ${relDay(next.date, c.today)}?`,
					extra: (
						<BeforeAfter
							before={`${line(s, s.date, c.today)} · ${line(next, next.date, c.today)}`}
							after={`${line(next, s.date, c.today)} · ${line(s, next.date, c.today)}`}
						/>
					),
					yes: async () => {
						const r = await must<SwapSessionsOutput>('swap_sessions', {
							sessionId: s.id,
							otherSessionId: next.id,
						})
						c.offer({ text: 'Byttet.', token: r.undo })
						return info(
							'swapped',
							'Byttet.',
							`${bigName(next)} i dag, ${name} ${relDay(next.date, c.today)}.`,
						)
					},
					no: skip,
				}
			: skip()
	const skip = (): Card => ({
		key: 'skip',
		topic: 'Endring',
		question: 'Hoppe over den?',
		extra: (
			<BeforeAfter
				before={`${bigName(s)}: planlagt`}
				after={`${bigName(s)}: ikke gjort`}
			/>
		),
		why: (
			<p>
				Bommer du på en nøkkeløkt, kan jeg gjøre neste økt lettere med en gang.
				Det sier jeg fra om.
			</p>
		),
		yes: async () => {
			const r = await must<SkipSessionOutput>('skip_session', {
				sessionId: s.id,
			})
			c.offer({ text: `${bigName(s)} er hoppet over.`, token: r.undo })
			return info(
				'skipped',
				'Hoppet over.',
				r.noUndoBecause ?? 'Ingen fare. Neste kort kommer når det trengs.',
			)
		},
		no: () =>
			info(
				'stands',
				'Da står den.',
				'Trykk «Det passer ikke» igjen hvis noe endrer seg.',
			),
	})
	const tomorrowCard = (): Card => {
		const there = c
			.byDay(tomorrow)
			.filter((x) => x.id !== s.id && x.status === 'planned')
		return {
			key: 'tomorrow',
			topic: 'Endring',
			question: 'I morgen?',
			yes: () => ({
				key: 'move-tomorrow',
				topic: 'Endring',
				question: `Flytter ${name} til i morgen. Ok?`,
				reason: there.length
					? `Da ligger den sammen med ${there.map((x) => lowerFirst(bigName(x))).join(' og ')}.`
					: 'I morgen er ledig.',
				extra: (
					<BeforeAfter
						before={line(s, c.today, c.today)}
						after={line(s, tomorrow, c.today)}
					/>
				),
				yes: async () => {
					const r = await must<MoveSessionOutput>('move_session', {
						sessionId: s.id,
						date: tomorrow,
					})
					c.offer({
						text: `${bigName(s)} er flyttet til i morgen.`,
						token: r.undo,
					})
					return moved(r)
				},
				no: later,
			}),
			no: later,
		}
	}
	return {
		key: 'start',
		topic: 'Det passer ikke',
		question: 'Kan du trene i dag i det hele tatt?',
		reason: `${bigName(s)}${m ? `, ${m} min` : ''}.`,
		yes: shorten,
		no: tomorrowCard,
	}

	function moved(r: MoveSessionOutput): Next {
		const lines = r.moves.map(
			(mv) => `${relDay(mv.fromDate, c.today)} → ${relDay(mv.toDate, c.today)}`,
		)
		return info(
			'moved',
			r.moves.length > 1
				? 'Byttet plass.'
				: `Flyttet til ${relDay(r.moves[0]?.toDate ?? tomorrow, c.today)}.`,
			r.clashes.length
				? `Obs: ${r.clashes.map((x) => x.text).join(', ')}.`
				: r.leftItsWeek
					? 'Den gikk over i neste uke.'
					: undefined,
			<p className="tm-note num">{lines.join(' · ')}</p>,
		)
	}
}

function weekFlow(c: Ctx, fromToday: boolean): Card {
	return {
		key: 'week',
		topic: 'Endring',
		question: 'Er det hele uka som er tung?',
		yes: () => ({
			key: 'ease-week',
			topic: 'Endring',
			question: 'Lettere uke: 15 % mindre. Ok?',
			reason: 'Alle økter som står igjen i uka som kommer, blir kortere.',
			why: (
				<p>
					Regel: én lettere uke kan tas én gang per uke. Den gjelder uka som
					kommer: etter søndag kveld er det neste uke, ellers denne.
				</p>
			),
			yes: async () => {
				const r = await must<EaseWeekOutput>('ease_week', {})
				c.offer({ text: 'Uka er gjort lettere.', token: r.undo })
				const fmt = (
					v: number | null,
					unit: EaseWeekOutput['volume'][number]['unit'],
				) => (v === null ? 'ukjent' : unitText(unit, v))
				return info(
					'eased-week',
					`${plural(r.sessionsChanged, 'økt', 'økter')} er lettere.`,
					undefined,
					<BeforeAfter
						before={
							r.volume.map((v) => fmt(v.before, v.unit)).join(' · ') ||
							'Uka som planlagt'
						}
						after={
							r.volume.map((v) => fmt(v.after, v.unit)).join(' · ') ||
							'15 % mindre'
						}
					/>,
				)
			},
			no: () => otherDay(c),
		}),
		no: () => (fromToday ? otherDay(c) : otherDay(c)),
	}
}

function otherDay(c: Ctx): Card {
	const list = c.upcoming.filter((x) => x.date > c.today).slice(0, 6)
	if (list.length === 0)
		return info(
			'nothing',
			'Ingen flere økter å endre de neste dagene.',
			'Da står alt som det er.',
		)
	const ask = (i: number): Card => {
		if (i >= list.length)
			return info(
				'none-picked',
				'Da står alt som det er.',
				'Trykk «Det passer ikke» igjen når noe endrer seg.',
			)
		const s = list[i]!
		return {
			key: `pick-${s.id}`,
			topic: 'Endring',
			topicRight: `${i + 1} av ${list.length}`,
			question: `${relDay(s.date, c.today).replace(/^./, (x) => x.toUpperCase())}: ${lowerFirst(bigName(s))}. Er det den?`,
			reason: s.title !== bigName(s) ? s.title : undefined,
			yes: () => otherSessionFlow(c, s),
			no: () => ask(i + 1),
		}
	}
	return {
		key: 'other-day',
		topic: 'Endring',
		question: 'Er det en annen dag som ikke passer?',
		yes: () => ask(0),
		no: () =>
			info(
				'stands',
				'Da står alt.',
				'Trykk «Det passer ikke» igjen hvis noe endrer seg.',
			),
	}
}

function otherSessionFlow(c: Ctx, s: SessionCard): Card {
	const dayAfter = addDays(s.date, 1)
	const next = c.upcoming.find((x) => x.id !== s.id && x.date > s.date)
	const skip = (): Card => ({
		key: `o-skip-${s.id}`,
		topic: 'Endring',
		question: 'Hoppe over den?',
		extra: (
			<BeforeAfter
				before={line(s, s.date, c.today)}
				after={`${relDay(s.date, c.today)}: ingenting`}
			/>
		),
		yes: async () => {
			const r = await must<SkipSessionOutput>('skip_session', {
				sessionId: s.id,
			})
			c.offer({ text: `${bigName(s)} er hoppet over.`, token: r.undo })
			return info('o-skipped', 'Hoppet over.')
		},
		no: () => info('o-stands', 'Da står den.'),
	})
	const swap = (): Card =>
		next
			? {
					key: `o-swap-${s.id}`,
					topic: 'Endring',
					question: `Bytte med ${lowerFirst(bigName(next))} ${relDay(next.date, c.today)}?`,
					extra: (
						<BeforeAfter
							before={`${line(s, s.date, c.today)} · ${line(next, next.date, c.today)}`}
							after={`${line(next, s.date, c.today)} · ${line(s, next.date, c.today)}`}
						/>
					),
					yes: async () => {
						const r = await must<SwapSessionsOutput>('swap_sessions', {
							sessionId: s.id,
							otherSessionId: next.id,
						})
						c.offer({ text: 'Byttet.', token: r.undo })
						return info('o-swapped', 'Byttet.')
					},
					no: skip,
				}
			: skip()
	return {
		key: `o-move-${s.id}`,
		topic: 'Endring',
		question: `Flytte den til ${relDay(dayAfter, c.today)}?`,
		reason: c.byDay(dayAfter).filter((x) => x.status === 'planned').length
			? `Da ligger den sammen med ${c
					.byDay(dayAfter)
					.filter((x) => x.status === 'planned')
					.map((x) => lowerFirst(bigName(x)))
					.join(' og ')}.`
			: undefined,
		extra: (
			<BeforeAfter
				before={line(s, s.date, c.today)}
				after={line(s, dayAfter, c.today)}
			/>
		),
		yes: async () => {
			const r = await must<MoveSessionOutput>('move_session', {
				sessionId: s.id,
				date: dayAfter,
			})
			c.offer({
				text: `${bigName(s)} er flyttet til ${relDay(dayAfter, c.today)}.`,
				token: r.undo,
			})
			return info(
				'o-moved',
				`Flyttet til ${relDay(dayAfter, c.today)}.`,
				r.clashes.length
					? `Obs: ${r.clashes.map((x) => x.text).join(', ')}.`
					: undefined,
			)
		},
		no: swap,
	}
}

export default function PasserIkke() {
	const { today, days } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const revalidator = useRevalidator()
	const { offer } = useUndo()
	const onEnd = useCallback(() => {
		void revalidator.revalidate()
		void navigate(BASE)
	}, [navigate, revalidator])

	const ctx = useMemo<Ctx>(() => {
		const all = days.flatMap((d) => d.sessions)
		const upcoming = all
			.filter((s) => s.status === 'planned' && s.date >= today.date)
			.sort((a, b) =>
				(a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')),
			)
		return {
			today: today.date,
			offer,
			done: () => null,
			upcoming,
			byDay: (d) => days.find((x) => x.date === d)?.sessions ?? [],
		}
	}, [days, today.date, offer])

	const [start] = useState<Card[]>(() => {
		const main = pickMain(today.sessions.filter((s) => s.status === 'planned'))
		if (main) return [todayFlow(ctx, main)]
		return [
			{
				key: 'rest',
				topic: 'Det passer ikke',
				question: today.restDay
					? 'I dag er hviledag. Er det resten av uka?'
					: 'Dagens økt er gjort. Er det resten av uka?',
				yes: () => weekFlow(ctx, false),
				no: () => otherDay(ctx),
			},
		]
	})

	return (
		<main aria-label="Det passer ikke">
			<Deck
				start={start}
				onEnd={onEnd}
				topLeft={
					<button
						type="button"
						className="tm-iconbtn"
						onClick={() => void navigate(BASE)}
					>
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
						<span style={{ fontSize: 14 }}>Avbryt</span>
					</button>
				}
			/>
		</main>
	)
}
