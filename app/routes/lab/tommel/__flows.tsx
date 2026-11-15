import {
	type AcceptPlanOutput,
	type ApplyGoalToPlanOutput,
	type ConnectionsOutput,
	type ConnectOutput,
	type DeleteAccountOutput,
	type ExperienceLevel,
	type ExportDataOutput,
	type GoalOutput,
	type GoalWriteOutput,
	type ImportStatusOutput,
	type PlanPreviewOutput,
	type PlanStyle,
	type RemoveGoalOutput,
	type SetAvailabilityOutput,
	type SetupState,
	type SportThresholds,
	type StartOptionsOutput,
	type SyncOutput,
	type ThresholdsOutput,
	type ThresholdValues,
	type Zone,
} from '#app/lab/engine/setup.types.ts'
import { BASE, cap, FlowError, markSeen, must } from './__api.ts'
import { type Card, type Next } from './__deck.tsx'
import {
	DAY_NAME,
	DAYS,
	cap1,
	clock,
	dur,
	hours,
	longDate,
	num,
	pace,
	plural,
	type Day,
} from './__format.ts'
import {
	FileForm,
	ImportCounter,
	NumberForm,
	RaceForm,
	splitTime,
	TextForm,
	timeColumns,
	uploadSummary,
	type Race,
} from './__forms.tsx'
import { BeforeAfter, range, Rows, Unknown } from './__ui.tsx'

export type Offer = {
	text: string
	token: string | null
	kind?: 'undo' | 'goal'
}
export type FlowCtx = {
	today: string
	nav: (to: string) => void
	offer: (o: Offer) => void
	openSheet: (p: PlanPreviewOutput) => Promise<void>
}
type EndSport = 'run' | 'bike' | 'swim'
type Then = () => Next | Promise<Next>

const SPORT_Q: Record<EndSport, string> = {
	run: 'Løper du?',
	bike: 'Sykler du?',
	swim: 'Svømmer du?',
}
const SPORT_NAME: Record<EndSport, string> = {
	run: 'løping',
	bike: 'sykling',
	swim: 'svømming',
}
const ORDER: EndSport[] = ['run', 'bike', 'swim']

function info(
	key: string,
	topic: string,
	question: string,
	reason?: string,
	ok?: Then,
	why?: string,
): Card {
	return { key, topic, question, reason, why, kind: 'ok', ok }
}

// ── 1. who you are ────────────────────────────────────────────────────

export function introCard(ctx: FlowCtx): Card {
	return {
		key: 'intro',
		topic: 'Om deg',
		question: 'Skal jeg legge treningen din?',
		reason:
			'Du svarer ja eller nei. Jeg gjør resten. Rundt 20 kort, ett minutt.',
		why: (
			<>
				<p>
					Jeg spør bare om det jeg trenger for å lage en plan: idrett, erfaring,
					tid og dager.
				</p>
				<p>
					Alt kan endres senere. Hold fingeren på hovedskjermen, så spør jeg hva
					du vil endre.
				</p>
			</>
		),
		yes: async () => {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
			if (tz) await cap('set_timezone', { timezone: tz })
			return sportCard(ctx, 0, [])
		},
		no: () =>
			info(
				'intro-wait',
				'Om deg',
				'Da venter jeg.',
				'Si ja når du vil. Jeg gjør ingenting før det.',
				() => introCard(ctx),
			),
	}
}

function sportCard(ctx: FlowCtx, i: number, picked: EndSport[]): Card {
	const s = ORDER[i]!
	const go = (p: EndSport[]) =>
		i + 1 < ORDER.length ? sportCard(ctx, i + 1, p) : afterSports(ctx, p)
	return {
		key: `sport-${s}`,
		topic: 'Om deg',
		topicRight: `${i + 1} av 3`,
		question: SPORT_Q[s],
		reason: i === 0 ? 'Planen bygges rundt det du svarer ja på.' : undefined,
		yes: () => go([...picked, s]),
		no: () => go(picked),
	}
}

function afterSports(ctx: FlowCtx, picked: EndSport[]): Next | Promise<Next> {
	if (picked.length === 0)
		return info(
			'sport-none',
			'Om deg',
			'Da har jeg ingenting å bygge på.',
			'Planen trenger minst én av løping, sykling eller svømming. Vi tar dem en gang til.',
			() => sportCard(ctx, 0, []),
		)
	if (picked.length === 1) return saveSports(ctx, picked, picked[0]!)
	return mainCard(ctx, picked, 0)
}

function mainCard(ctx: FlowCtx, picked: EndSport[], i: number): Card {
	const s = picked[i]!
	const last = i === picked.length - 1
	return {
		key: `main-${s}`,
		topic: 'Om deg',
		question: `Er ${SPORT_NAME[s]} det viktigste?`,
		reason: 'Planen bygges rundt én idrett. De andre kommer i tillegg.',
		yes: () => saveSports(ctx, picked, s),
		no: () =>
			last ? saveSports(ctx, picked, picked[0]!) : mainCard(ctx, picked, i + 1),
	}
}

async function saveSports(
	ctx: FlowCtx,
	sports: EndSport[],
	main: EndSport,
): Promise<Next> {
	await must<SetupState>('set_sports', { sports, mainSport: main })
	return levelCard(ctx)
}

export function levelCard(ctx: FlowCtx, then?: Then): Card {
	const set = (level: ExperienceLevel) => async () => {
		await must<SetupState>('set_experience_level', { level })
		return then ? then() : hoursCard(ctx, 4)
	}
	const why = (
		<p>
			Erfaring bestemmer hvor forsiktig planen starter, og hvilke typer plan du
			får tilbud om. Fire nivåer: nybegynner, mosjonist, erfaren og konkurranse.
		</p>
	)
	return {
		key: 'level-1',
		topic: 'Om deg',
		question: 'Har du trent jevnt i mer enn ett år?',
		why,
		yes: () => ({
			key: 'level-5',
			topic: 'Om deg',
			question: 'Mer enn fem år?',
			why,
			no: set('recreational'),
			yes: () => ({
				key: 'level-comp',
				topic: 'Om deg',
				question: 'Konkurrerer du for å hevde deg, ikke bare fullføre?',
				why,
				yes: set('competitive'),
				no: set('experienced'),
			}),
		}),
		no: set('beginner'),
	}
}

/** A binary search over hours a week. Stores the floor of the interval. */
const HOURS_TREE: Record<
	number,
	{ yes: number | [number, number]; no: number | [number, number] }
> = {
	4: { yes: 6, no: 2 },
	2: { yes: [2, 4], no: [1, 2] },
	6: { yes: 9, no: [4, 6] },
	9: { yes: 12, no: [6, 9] },
	12: { yes: [12, 20], no: [9, 12] },
}

export function hoursCard(ctx: FlowCtx, at: number, then?: Then): Card {
	const node = HOURS_TREE[at]!
	const step = (n: number | [number, number]) => () =>
		typeof n === 'number' ? hoursCard(ctx, n, then) : saveHours(ctx, n, then)
	return {
		key: `hours-${at}`,
		topic: 'Om deg',
		question: `Trener du mer enn ${at} timer i uka nå?`,
		reason: at === 4 ? 'Omtrent er godt nok. Jeg spør meg fram.' : undefined,
		why: (
			<>
				<p>Jeg spør i intervaller i stedet for å be deg gjette et tall.</p>
				<p>
					Planen starter i bunnen av intervallet ditt og bygger derfra. Kobler
					du klokka, bytter jeg det ut med det du faktisk har trent.
				</p>
			</>
		),
		yes: step(node.yes),
		no: step(node.no),
	}
}

async function saveHours(
	ctx: FlowCtx,
	[lo, hi]: [number, number],
	then?: Then,
): Promise<Next> {
	await must<SetupState>('set_current_volume', { hoursPerWeek: lo })
	const next = then ? await then() : dayCard(ctx, 0, [])
	return [
		info(
			`hours-saved-${lo}`,
			'Om deg',
			hi >= 20
				? `Over ${lo} timer i uka.`
				: `Mellom ${lo} og ${hi} timer i uka.`,
			`Jeg starter planen på ${lo} timer og bygger derfra.`,
		),
		...(Array.isArray(next) ? next : next ? [next] : []),
	]
}

export function dayCard(
	ctx: FlowCtx,
	i: number,
	picked: Day[],
	then?: (days: Day[]) => Next | Promise<Next>,
): Card {
	const d = DAYS[i]!
	const go = (p: Day[]) => () =>
		i + 1 < 7 ? dayCard(ctx, i + 1, p, then) : saveDays(ctx, p, then)
	return {
		key: `day-${d}`,
		topic: 'Dager',
		topicRight: `${i + 1} av 7`,
		question: `Kan du trene ${DAY_NAME[d]}?`,
		reason: i === 0 ? 'Ett kort per dag. Sveip, sveip.' : undefined,
		yes: go([...picked, d]),
		no: go(picked),
	}
}

async function saveDays(
	ctx: FlowCtx,
	days: Day[],
	then?: (days: Day[]) => Next | Promise<Next>,
): Promise<Next> {
	if (days.length === 0)
		return info(
			'days-none',
			'Dager',
			'Ingen dager går.',
			'Da har jeg ingenting å legge økter på. Vi tar dagene en gang til.',
			() => dayCard(ctx, 0, [], then),
		)
	const r = await must<SetAvailabilityOutput>('set_availability', { days })
	if (then) {
		const next = await then(days)
		return [
			info(
				'days-saved',
				'Dager',
				`${cap1(days.map((d) => DAY_NAME[d].slice(0, 3)).join(', '))}.`,
				r.note,
			),
			...(Array.isArray(next) ? next : next ? [next] : []),
		]
	}
	return strengthCard(ctx)
}

export function strengthCard(ctx: FlowCtx, then?: Then): Card {
	const set = (perWeek: 0 | 1 | 2 | 3) => async () => {
		await must<SetupState>('set_strength', { perWeek })
		markSeen('strength-asked')
		return then ? then() : connectStart(ctx, () => goalStart(ctx))
	}
	return {
		key: 'strength',
		topic: 'Om deg',
		question: 'Vil du løfte vekter?',
		reason: 'Styrke holder deg hel. Jeg legger det unna de harde dagene.',
		yes: () => ({
			key: 'strength-2',
			topic: 'Om deg',
			question: 'To ganger i uka?',
			yes: set(2),
			no: () => ({
				key: 'strength-3',
				topic: 'Om deg',
				question: 'Mer enn to?',
				yes: set(3),
				no: set(1),
			}),
		}),
		no: set(0),
	}
}

// ── 2. the watch ──────────────────────────────────────────────────────

export function connectStart(ctx: FlowCtx, after: Then): Card {
	return {
		key: 'conn-icu',
		topic: 'Klokka',
		question: 'Synker klokka di til Intervals.icu?',
		reason: 'Da henter jeg øktene dine selv, også de gamle.',
		yes: () => keyCard(ctx, after),
		no: () => ({
			key: 'conn-polar',
			topic: 'Klokka',
			question: 'Polar?',
			yes: async () => {
				const c = await cap<ConnectionsOutput>('connections', {})
				const why = c.ok
					? c.value.sources.find((s) => s.id === 'polar')?.why
					: null
				return [
					info(
						'conn-polar-no',
						'Klokka',
						'Polar kan jeg ikke koble direkte ennå.',
						why ?? 'Koble Polar til Intervals.icu, eller last opp filer.',
					),
					fileQuestion(ctx, after),
				]
			},
			no: () => fileQuestion(ctx, after),
		}),
	}
}

function fileQuestion(ctx: FlowCtx, after: Then): Card {
	return {
		key: 'conn-file',
		topic: 'Klokka',
		question: 'Vil du laste opp en fil?',
		reason: 'En økt fra klokka, eller en hel eksport.',
		yes: () => fileCard(ctx, after),
		no: () => {
			markSeen('connect-asked')
			return info(
				'conn-none',
				'Klokka',
				'Da kjører vi uten.',
				'Jeg spør igjen om en uke. Du kan si «gjort» på hver økt i mellomtiden.',
				after,
			)
		},
	}
}

export function keyCard(ctx: FlowCtx, after: Then): Card {
	return {
		key: 'conn-key',
		topic: 'Klokka',
		question: 'Lim inn nøkkelen fra Intervals.icu.',
		reason: 'Du finner den under Settings → Developer Settings → API key.',
		kind: 'custom',
		render: (c) => (
			<TextForm
				c={c}
				label="API-nøkkel"
				secret
				button="Koble til"
				placeholder="Lim inn her"
				run={async (v) => {
					const r = await cap<ConnectOutput>('connect_intervals_icu', {
						apiKey: v.trim(),
					})
					if (!r.ok) return r.message
					return () => importCard(ctx, after)
				}}
			/>
		),
	}
}

function importCard(ctx: FlowCtx, after: Then): Card {
	return {
		key: 'conn-import',
		topic: 'Klokka',
		question: 'Henter …',
		reason: 'Øktene dine kommer inn fra klokka.',
		kind: 'custom',
		checkpoint: true,
		render: (c) => (
			<ImportCounter
				c={c}
				then={(s) => () => foundCard(ctx, s, after)}
				skip={after}
			/>
		),
	}
}

export function foundCard(
	ctx: FlowCtx,
	s: ImportStatusOutput,
	after: Then,
): Card {
	const h = s.history.hoursPerWeek
	if (h.value === null)
		return info(
			'conn-found',
			'Klokka',
			`Jeg fant ${plural(s.recordings.total, 'økt', 'økter')}.`,
			`Snitt i uka: ukjent. ${h.why ?? ''}`.trim(),
			after,
		)
	const rounded = Math.min(20, Math.max(1, Math.round(h.value * 2) / 2))
	return {
		key: 'conn-found',
		topic: 'Klokka',
		question: (
			<>
				Jeg fant <span className="num">{num(s.recordings.total)}</span> økter.
				Snitt <span className="num">{hours(h.value)}</span> i uka de siste fire
				ukene. Stemmer det omtrent?
			</>
		),
		why: (
			<p>
				Regnet fra {plural(s.history.weeksWithTraining, 'uke', 'uker')} med
				trening av de siste fire. Sier du ja, starter planen på {hours(rounded)}{' '}
				i stedet for intervallet du svarte.
			</p>
		),
		yes: async () => {
			await must<SetupState>('set_current_volume', { hoursPerWeek: rounded })
			return after()
		},
		no: () => ({
			key: 'conn-missing',
			topic: 'Klokka',
			question: 'Mangler noe? Vil du laste opp filer også?',
			yes: () => fileCard(ctx, after),
			no: after,
		}),
	}
}

export function fileCard(ctx: FlowCtx, after: Then): Card {
	return {
		key: 'conn-upload',
		topic: 'Klokka',
		question: 'Velg filene fra klokka.',
		kind: 'custom',
		render: (c) => (
			<FileForm
				c={c}
				then={(r) => () =>
					info(
						'conn-uploaded',
						'Klokka',
						r.imported > 0 ? 'Lastet opp.' : 'Ingen nye økter.',
						uploadSummary(r),
						after,
					)
				}
			/>
		),
	}
}

// ── 3. the goal ───────────────────────────────────────────────────────

export function goalStart(
	ctx: FlowCtx,
	opts: { sports?: EndSport[]; after?: Then } = {},
): Card {
	const after = opts.after ?? (() => planStart(ctx))
	return {
		key: 'goal-1',
		topic: 'Mål',
		question: 'Har du et løp du sikter mot?',
		reason: 'Et løp, et ritt eller et stevne med dato.',
		yes: async () => raceCard(ctx, opts.sports ?? (await sportsNow()), after),
		no: () => ({
			key: 'goal-open',
			topic: 'Mål',
			question: 'Da trener vi for bedre form. Greit?',
			reason: 'Planen går i blokker uten sluttdato.',
			yes: () => {
				markSeen('goal-open')
				return after()
			},
			no: () => goalStart(ctx, opts),
		}),
	}
}

async function sportsNow(): Promise<EndSport[]> {
	const r = await cap<SetupState>('get_setup', {})
	return r.ok && r.value.answers.sports?.length
		? r.value.answers.sports
		: ['run']
}

function raceCard(
	ctx: FlowCtx,
	sports: EndSport[],
	after: Then,
	initial?: Partial<Race>,
): Card {
	return {
		key: 'goal-race',
		topic: 'Mål',
		question: 'Hvilket løp?',
		kind: 'custom',
		render: (c) => (
			<RaceForm
				c={c}
				today={ctx.today}
				sports={sports}
				initial={initial}
				onDone={(r) => () => targetQuestion(ctx, r, after)}
			/>
		),
	}
}

function targetQuestion(ctx: FlowCtx, race: Race, after: Then): Card {
	return {
		key: 'goal-target',
		topic: 'Mål',
		question: 'Har du en måltid?',
		reason: race.name,
		yes: () => timeCard(ctx, race, after),
		no: () => saveGoal(ctx, race, null, after),
	}
}

function defaultTime(km: number | null): number {
	if (!km) return 3600
	if (km <= 5) return 25 * 60
	if (km <= 10) return 50 * 60
	if (km <= 22) return 110 * 60
	if (km <= 43) return 240 * 60
	return Math.round(km * 150)
}

function timeCard(ctx: FlowCtx, race: Race, after: Then): Card {
	return {
		key: 'goal-time',
		topic: 'Mål',
		question: 'Hvilken tid?',
		reason: race.name,
		kind: 'custom',
		render: (c) => (
			<NumberForm
				c={c}
				columns={timeColumns(race.distanceKm && race.distanceKm > 50 ? 24 : 12)}
				initial={splitTime(defaultTime(race.distanceKm))}
				label="Lagre tiden"
				onDone={([h, m, s]) =>
					() =>
						saveGoal(ctx, race, h! * 3600 + m! * 60 + s!, after)
					}
			/>
		),
	}
}

async function saveGoal(
	ctx: FlowCtx,
	race: Race,
	target: number | null,
	after: Then,
): Promise<Next> {
	if (target === 0) target = null
	const input = {
		kind: 'event' as const,
		name: race.name,
		date: race.date,
		sport: race.sport,
		...(race.distanceKm ? { distanceKm: race.distanceKm } : {}),
		...(target ? { targetTime: target } : {}),
	}
	let r = await cap<GoalWriteOutput>('set_goal', input)
	if (!r.ok && r.code === 'goal-exists') {
		r = await cap<GoalWriteOutput>('update_goal', {
			name: race.name,
			date: race.date,
			sport: race.sport,
			distanceKm: race.distanceKm,
			targetTime: target,
		})
	}
	if (!r.ok) throw new FlowError(r.message, r.code)
	const out = r.value
	ctx.offer({
		text: `Målet er ${race.name}, ${longDate(race.date)}.`,
		token: out.undo,
		kind: 'goal',
	})
	const cards: Card[] = []
	if (target)
		cards.push(
			info(
				'goal-honest',
				'Mål',
				`Om ${clock(target)} er mulig, vet jeg ikke ennå.`,
				'Jeg trenger seks uker med data før jeg kan si noe ærlig. Jeg spør deg igjen da.',
			),
		)
	if (out.proposal) cards.push(applyGoalCard(ctx, out, after))
	else if (out.problem)
		cards.push(
			info(
				'goal-problem',
				'Mål',
				'Planen kan ikke legges mot løpet.',
				out.problem,
			),
		)
	const next = out.proposal ? null : await after()
	return [...cards, ...(Array.isArray(next) ? next : next ? [next] : [])]
}

function applyGoalCard(ctx: FlowCtx, out: GoalOutput, after: Then): Card {
	const p = out.proposal!
	const goal = out.goal!
	return {
		key: 'goal-apply',
		topic: 'Plan',
		question: `Bygge planen mot ${goal.name}?`,
		reason: `Blokken du er i slutter etter denne uka. Så legges ${p.phases.map((ph) => ph.name.toLowerCase()).join(', ')} fram mot løpet.`,
		extra: (
			<BeforeAfter
				before={`${p.endsCurrentBlock.name}: ${plural(p.endsCurrentBlock.weeksHad, 'uke', 'uker')}`}
				after={`${p.endsCurrentBlock.name}: ${plural(p.endsCurrentBlock.weeksKept, 'uke', 'uker')}, så ${plural(
					p.outlook.length,
					'uke',
					'uker',
				)} mot løpet`}
			/>
		),
		why: (
			<>
				<p>
					Dine egne økter blir stående (
					{plural(p.ownSessionsKept, 'økt', 'økter')}).
				</p>
				{p.steepWeeks.length ? (
					<p>
						Advarsel: {plural(p.steepWeeks.length, 'uke', 'uker')} øker mer enn
						10 % fra uka før, for eksempel {hours(p.steepWeeks[0]!.fromHours)} →{' '}
						{hours(p.steepWeeks[0]!.toHours)}.
					</p>
				) : null}
				<p>Dette kan ikke angres. Fjerner du målet senere, stopper planen.</p>
			</>
		),
		yes: async () => {
			const r = await must<ApplyGoalToPlanOutput>('apply_goal_to_plan', {
				goalId: p.goalId,
				digest: p.digest,
			})
			return [
				info(
					'goal-applied',
					'Plan',
					'Planen går nå mot løpet.',
					`${r.phases.map((ph) => `${ph.name} ${plural(ph.weeks, 'uke', 'uker')}`).join(' · ')}.`,
				),
				...[await after()].flat().filter((x): x is Card => !!x),
			]
		},
		no: after,
	}
}

// ── 4. the plan ───────────────────────────────────────────────────────

type PlanState = { style?: PlanStyle }

function weeksOf(p: PlanPreviewOutput) {
	return p.towardGoal && !p.towardGoal.problem
		? p.towardGoal.outlook.length
		: p.outlook.length
}

export async function planStart(
	ctx: FlowCtx,
	st: PlanState = {},
): Promise<Next> {
	const opts = await must<StartOptionsOutput>('start_options', {})
	const style =
		st.style && opts.options.some((o) => o.style === st.style)
			? st.style
			: opts.options[0]?.style
	const option = opts.options.find((o) => o.style === style)
	if (!option)
		return info(
			'plan-none',
			'Plan',
			'Jeg fant ingen plan som passer.',
			opts.notes.join(' '),
		)
	const preview = await must<PlanPreviewOutput>('plan_preview', { style })
	const n = weeksOf(preview)
	const fw = option.firstWeek.totals
	return {
		key: `plan-see-${style}-${fw.minutes}`,
		topic: 'Plan',
		question: `Jeg har laget en plan på ${plural(n, 'uke', 'uker')}. Vil du se den?`,
		reason: `${option.name}. Første uke: ${plural(fw.sessions, 'økt', 'økter')}, ${dur(fw.minutes * 60)}.`,
		why: (
			<>
				<p>
					<b>{option.styleName}.</b> {option.why}
				</p>
				{opts.assumed.map((a, i) => (
					<p key={i}>
						{a.question === 'days'
							? `Dager: ${(a.value as Day[]).map((d) => DAY_NAME[d]).join(', ')}`
							: `Timer i uka nå: ${hours(a.value as number)}`}
						{a.from === 'history'
							? ', fra klokka.'
							: ', foreslått for nivået ditt.'}
					</p>
				))}
				{[...opts.notes, ...preview.notes].map((t, i) => (
					<p key={`n${i}`}>{t}</p>
				))}
				{preview.towardGoal?.problem ? (
					<p>{preview.towardGoal.problem}</p>
				) : null}
			</>
		),
		yes: async () => {
			await ctx.openSheet(preview)
			return startCard(ctx, style!, preview)
		},
		no: () => startCard(ctx, style!, preview),
	}
}

function startCard(
	ctx: FlowCtx,
	style: PlanStyle,
	preview: PlanPreviewOutput,
): Card {
	return {
		key: `plan-start-${style}`,
		topic: 'Plan',
		question: 'Starter vi?',
		reason: `Planen begynner ${longDate(preview.startsOn)}.`,
		why: (
			<>
				<p>
					Å lage en plan kan ikke angres. Etterpå endrer den seg bare gjennom
					kort du sier ja til, og hver endring kan angres.
				</p>
				<p>Sier du nei, spør jeg hva som er feil, ett kort om gangen.</p>
			</>
		),
		yes: async () => {
			const r = await must<AcceptPlanOutput>('accept_plan', { style })
			return {
				key: 'plan-done',
				topic: 'Plan',
				question: 'Planen er lagt.',
				reason: `${plural(r.sessionsLaid, 'økt står', 'økter står')} i kalenderen.${r.goalProblem ? ` ${r.goalProblem}` : ''}`,
				kind: 'ok',
				checkpoint: true,
				ok: () => {
					ctx.nav(BASE)
					return null
				},
			}
		},
		no: () => whatsWrong(ctx, style),
	}
}

async function currentHours(): Promise<number> {
	const s = await must<SetupState>('get_setup', {})
	return (
		s.answers.currentHoursPerWeek ??
		s.fromHistory.hoursPerWeek.value ??
		s.suggested?.currentHoursPerWeek ??
		4
	)
}

function whatsWrong(ctx: FlowCtx, style: PlanStyle): Card {
	const again =
		(st: PlanState = { style }) =>
		() =>
			planStart(ctx, st)
	const otherStyle = async (
		pick: (o: StartOptionsOutput) => PlanStyle | undefined,
		none: string,
	): Promise<Next> => {
		const opts = await must<StartOptionsOutput>('start_options', {})
		const s = pick(opts)
		if (!s)
			return [
				info('plan-same', 'Plan', none, 'Vi går videre med den samme.'),
				...[await planStart(ctx, { style })]
					.flat()
					.filter((x): x is Card => !!x),
			]
		return planStart(ctx, { style: s })
	}
	const q = (
		key: string,
		question: string,
		yes: () => Promise<Next> | Next,
		no: () => Card,
	): Card => ({
		key,
		topic: 'Plan',
		question,
		yes,
		no,
	})
	return q(
		'wrong-much',
		'For mye?',
		async () => {
			const h = await currentHours()
			await must<SetupState>('set_current_volume', {
				hoursPerWeek: Math.max(1, h - 1),
			})
			return again()()
		},
		() =>
			q(
				'wrong-little',
				'For lite?',
				async () => {
					const h = await currentHours()
					await must<SetupState>('set_current_volume', {
						hoursPerWeek: Math.min(20, h + 1),
					})
					return again()()
				},
				() =>
					q(
						'wrong-days',
						'Feil dager?',
						() => dayCard(ctx, 0, [], () => planStart(ctx, { style })),
						() =>
							q(
								'wrong-hard',
								'For mye hardt?',
								() =>
									otherStyle((o) => {
										const cur =
											o.options.find((x) => x.style === style)?.firstWeek.totals
												.hardSessions ?? 99
										return [...o.options]
											.filter((x) => x.firstWeek.totals.hardSessions < cur)
											.sort(
												(a, b) =>
													a.firstWeek.totals.hardSessions -
													b.firstWeek.totals.hardSessions,
											)[0]?.style
									}, 'Dette er den roligste planen jeg har.'),
								() =>
									q(
										'wrong-style',
										'Vil du se en annen type plan?',
										() =>
											otherStyle((o) => {
												const i = o.options.findIndex((x) => x.style === style)
												return o.options.length > 1
													? o.options[(i + 1) % o.options.length]!.style
													: undefined
											}, 'Jeg har bare denne ene typen for deg.'),
										() => startCard2(ctx, style),
									),
							),
					),
			),
	)
}

function startCard2(ctx: FlowCtx, style: PlanStyle): Card {
	return {
		key: 'plan-same-again',
		topic: 'Plan',
		question: 'Da lager jeg den samme. Starter vi?',
		yes: async () => {
			const preview = await must<PlanPreviewOutput>('plan_preview', { style })
			return startCard(ctx, style, preview).yes!()
		},
		no: () => whatsWrong(ctx, style),
	}
}

// ── 11. change something about you ────────────────────────────────────

type EndreData = {
	setup: SetupState
	goal: GoalOutput
	connections: ConnectionsOutput
	recordingsCount: number
	adjustAuto: boolean
}

const TOPICS = [
	'days',
	'goal',
	'watch',
	'zones',
	'strength',
	'plan',
	'account',
] as const
type Topic = (typeof TOPICS)[number]
const TOPIC_Q: Record<Topic, string> = {
	days: 'Dagene?',
	goal: 'Målet?',
	watch: 'Klokka?',
	zones: 'Soner?',
	strength: 'Styrke?',
	plan: 'Planen?',
	account: 'Kontoen?',
}

export function endreStart(ctx: FlowCtx, d: EndreData, startAt?: Topic): Card {
	if (startAt) return topicCard(ctx, d, TOPICS.indexOf(startAt))
	return {
		key: 'endre',
		topic: 'Om deg',
		question: 'Vil du endre noe om deg?',
		reason: 'Jeg spør om én ting om gangen. Si ja når jeg treffer.',
		yes: () => topicCard(ctx, d, 0),
		no: () => {
			ctx.nav(BASE)
			return null
		},
	}
}

function moreCard(ctx: FlowCtx, d: EndreData, from: number): Card {
	if (from >= TOPICS.length)
		return info(
			'endre-end',
			'Om deg',
			'Det var alt jeg kan endre.',
			undefined,
			() => {
				ctx.nav(BASE)
				return null
			},
		)
	return {
		key: `endre-more-${from}`,
		topic: 'Om deg',
		question: 'Noe mer?',
		checkpoint: true,
		yes: () => topicCard(ctx, d, from),
		no: () => {
			ctx.nav(BASE)
			return null
		},
	}
}

function topicCard(ctx: FlowCtx, d: EndreData, i: number): Card {
	if (i >= TOPICS.length)
		return info(
			'endre-none',
			'Om deg',
			'Da endrer vi ingenting.',
			undefined,
			() => {
				ctx.nav(BASE)
				return null
			},
		)
	const t = TOPICS[i]!
	const back = () => moreCard(ctx, d, i + 1)
	return {
		key: `endre-${t}`,
		topic: 'Om deg',
		topicRight: `${i + 1} av ${TOPICS.length}`,
		question: TOPIC_Q[t],
		reason: topicNow(t, d),
		yes: () => topicFlow(ctx, d, t, back),
		no: () => topicCard(ctx, d, i + 1),
	}
}

function topicNow(t: Topic, d: EndreData): string | undefined {
	const a = d.setup.answers
	if (t === 'days')
		return a.availability.days
			? `Nå: ${a.availability.days.map((x) => DAY_NAME[x].slice(0, 3)).join(', ')}.`
			: 'Nå: ikke sagt.'
	if (t === 'goal')
		return d.goal.goal
			? `Nå: ${d.goal.goal.name}, ${longDate(d.goal.goal.date)}.`
			: 'Nå: bedre form, uten dato.'
	if (t === 'watch') {
		const icu = d.connections.sources.find((s) => s.id === 'intervalsicu')
		return icu?.state === 'connected' || icu?.state === 'importing-history'
			? 'Nå: Intervals.icu er koblet til.'
			: icu?.state === 'needs-reconnect'
				? 'Intervals.icu svarer ikke lenger.'
				: 'Nå: ingen klokke koblet til.'
	}
	if (t === 'zones') return 'Terskler og soner per idrett.'
	if (t === 'strength')
		return a.strengthPerWeek
			? `Nå: ${plural(a.strengthPerWeek, 'gang', 'ganger')} i uka.`
			: 'Nå: ingen styrke i planen.'
	if (t === 'plan')
		return d.adjustAuto
			? 'Nå: planen justerer seg selv hver søndag.'
			: 'Nå: planen spør deg før den endrer noe.'
	if (t === 'account')
		return `${a.displayName ?? a.username}. Navn, dataene dine, sletting.`
	return undefined
}

async function topicFlow(
	ctx: FlowCtx,
	d: EndreData,
	t: Topic,
	back: () => Card,
): Promise<Next> {
	if (t === 'days') return dayCard(ctx, 0, [], () => back())
	if (t === 'strength')
		return strengthCard(ctx, () => [
			info(
				'strength-saved',
				'Styrke',
				'Lagret.',
				'Gjelder de neste ukene som legges. Uker som alt ligger i kalenderen står.',
			),
			back(),
		])
	if (t === 'goal') return goalEdit(ctx, d, back)
	if (t === 'watch') return watchEdit(ctx, d, back)
	if (t === 'zones') return zonesEdit(ctx, back)
	if (t === 'plan') return planEdit(ctx, d, back)
	return accountEdit(ctx, d, back)
}

function goalEdit(ctx: FlowCtx, d: EndreData, back: () => Card): Card {
	const g = d.goal.goal
	const sports = (d.setup.answers.sports ?? ['run']) as EndSport[]
	if (!g) return goalStart(ctx, { sports, after: back })
	return {
		key: 'goal-change',
		topic: 'Mål',
		question: 'Vil du bytte målet?',
		reason: `${g.name}, ${longDate(g.date)}${g.targetTime ? `, på ${g.targetTime.text}` : ''}.`,
		yes: () =>
			raceCard(ctx, sports, back, {
				name: g.name,
				date: g.date,
				distanceKm: g.distanceKm,
				sport: (g.sports.find((s) => s !== 'strength') ?? 'run') as EndSport,
			}),
		no: () => ({
			key: 'goal-remove',
			topic: 'Mål',
			question: 'Fjerne målet?',
			reason: g.planRunsTowardIt
				? 'Planen er bygd for dette løpet.'
				: undefined,
			yes: () =>
				g.planRunsTowardIt
					? {
							key: 'goal-remove-sure',
							topic: 'Mål',
							question: 'Planen stopper med målet. Sikker?',
							reason:
								'Etterpå lager vi en ny plan sammen. Du kan angre så lenge du ikke har laget en ny.',
							yes: () => removeGoal(ctx, true, back),
							no: back,
						}
					: removeGoal(ctx, false, back),
			no: back,
		}),
	}
}

async function removeGoal(
	ctx: FlowCtx,
	stopPlan: boolean,
	back: () => Card,
): Promise<Next> {
	const r = await must<RemoveGoalOutput>(
		'remove_goal',
		stopPlan ? { stopPlan: true } : {},
	)
	ctx.offer({ text: 'Målet er fjernet.', token: r.undo, kind: 'goal' })
	if (r.planStopped)
		return info(
			'goal-stopped',
			'Mål',
			'Målet og planen er borte.',
			'Nå lager vi en ny plan.',
			() => {
				ctx.nav(`${BASE}/oppstart`)
				return null
			},
		)
	return [info('goal-removed', 'Mål', 'Målet er fjernet.'), back()]
}

async function watchEdit(
	ctx: FlowCtx,
	d: EndreData,
	back: () => Card,
): Promise<Next> {
	const icu = d.connections.sources.find((s) => s.id === 'intervalsicu')
	const on = icu?.state === 'connected' || icu?.state === 'importing-history'
	const uploadQ = (): Card => ({
		key: 'watch-file',
		topic: 'Klokka',
		question: 'Laste opp en fil?',
		yes: () => fileCard(ctx, back),
		no: back,
	})
	if (icu?.state === 'needs-reconnect')
		return {
			key: 'watch-reconnect',
			topic: 'Klokka',
			question: 'Koble til Intervals.icu på nytt?',
			reason: icu.why ?? 'Tjenesten sluttet å godta koblingen.',
			yes: () => keyCard(ctx, back),
			no: uploadQ,
		}
	if (!on) return connectStart(ctx, back)
	return {
		key: 'watch-sync',
		topic: 'Klokka',
		question: 'Hente nye økter nå?',
		reason: icu?.lastCheckedAt
			? `Sist spurt ${new Date(icu.lastCheckedAt).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' })}.`
			: undefined,
		yes: async () => {
			const r = await must<SyncOutput>('sync_sources', {})
			return [
				info(
					'watch-synced',
					'Klokka',
					r.imported
						? `${plural(r.imported, 'ny økt', 'nye økter')}.`
						: 'Ingen nye økter.',
					r.failed.map((f) => f.message).join(' ') || undefined,
				),
				disconnectQ(),
			]
		},
		no: disconnectQ,
	}
	function disconnectQ(): Card {
		return {
			key: 'watch-off',
			topic: 'Klokka',
			question: 'Koble fra Intervals.icu?',
			reason: 'Øktene du har fått blir liggende.',
			yes: () => ({
				key: 'watch-off-sure',
				topic: 'Klokka',
				question: 'Sikker?',
				reason: 'Det kan ikke angres, men du kan koble til igjen med nøkkelen.',
				yes: async () => {
					await must('disconnect_source', { source: 'intervalsicu' })
					return [info('watch-off-done', 'Klokka', 'Koblet fra.'), uploadQ()]
				},
				no: uploadQ,
			}),
			no: uploadQ,
		}
	}
}

// zones: the third exception — wheels for thresholds, zones derived

type Metric = {
	key: keyof ThresholdValues
	name: string
	unit: string
	fmt: (n: number) => string
}
const METRICS: Record<EndSport, Metric[]> = {
	run: [
		{
			key: 'thresholdPacePerKm',
			name: 'terskelfart',
			unit: '/km',
			fmt: (n) => `${pace(n)} /km`,
		},
		{
			key: 'lthr',
			name: 'terskelpuls',
			unit: 'slag/min',
			fmt: (n) => `${n} slag/min`,
		},
	],
	bike: [
		{ key: 'ftp', name: 'FTP', unit: 'W', fmt: (n) => `${n} W` },
		{
			key: 'lthr',
			name: 'terskelpuls',
			unit: 'slag/min',
			fmt: (n) => `${n} slag/min`,
		},
	],
	swim: [
		{
			key: 'cssPer100m',
			name: 'CSS',
			unit: '/100 m',
			fmt: (n) => `${pace(n)} /100 m`,
		},
	],
}
const SPORT_TITLE: Record<EndSport, string> = {
	run: 'Løping',
	bike: 'Sykling',
	swim: 'Svømming',
}

function zoneText(z: Zone): string | null {
	if (!z.range) return null
	const { min, max, unit } = z.range
	const f = (n: number) =>
		unit === 'sec-per-km' || unit === 'sec-per-100m' ? pace(n) : num(n)
	const u =
		unit === 'bpm'
			? 'slag/min'
			: unit === 'watt'
				? 'W'
				: unit === 'sec-per-km'
					? '/km'
					: '/100 m'
	return max === null ? `${f(min)}+ ${u}` : `${f(min)}–${f(max)} ${u}`
}

export function ZoneList({ zones }: { zones: Zone[] }) {
	return (
		<Rows
			rows={zones.map((z) => [
				`${z.label}${z.description ? ` ${z.description}` : ''}`,
				zoneText(z) ?? <Unknown why={z.why} />,
			])}
		/>
	)
}

async function zonesEdit(ctx: FlowCtx, back: () => Card): Promise<Next> {
	const t = await must<ThresholdsOutput>('thresholds', {})
	const list = t.sports.filter((s) => s.sport in METRICS)
	if (list.length === 0)
		return [
			info('zones-none', 'Soner', 'Ingen idretter å sette soner for.'),
			back(),
		]
	const steps: Array<[SportThresholds, Metric]> = list.flatMap((s) =>
		METRICS[s.sport].map((m) => [s, m] as [SportThresholds, Metric]),
	)
	return metricCard(ctx, steps, 0, back)
}

function metricColumns(m: Metric) {
	if (m.key === 'thresholdPacePerKm')
		return {
			cols: [
				{ items: range(2, 9), label: 'Minutter', unit: '' },
				{
					items: range(0, 59, 1, (n) => String(n).padStart(2, '0')),
					label: 'Sekunder',
					sep: ':',
					unit: '/km',
				},
			],
			init: (v: number) => [Math.floor(v / 60), v % 60],
			val: ([a, b]: number[]) => Math.min(600, Math.max(150, a! * 60 + b!)),
			def: 300,
		}
	if (m.key === 'cssPer100m')
		return {
			cols: [
				{ items: range(1, 4), label: 'Minutter' },
				{
					items: range(0, 59, 1, (n) => String(n).padStart(2, '0')),
					label: 'Sekunder',
					sep: ':',
					unit: '/100 m',
				},
			],
			init: (v: number) => [Math.floor(v / 60), v % 60],
			val: ([a, b]: number[]) => Math.min(250, Math.max(60, a! * 60 + b!)),
			def: 120,
		}
	if (m.key === 'ftp')
		return {
			cols: [
				{ items: range(50, 600, 5), label: 'Watt', unit: 'W', minWidth: 90 },
			],
			init: (v: number) => [Math.round(v / 5) * 5],
			val: ([a]: number[]) => a!,
			def: 200,
		}
	return {
		cols: [
			{
				items: range(80, 220),
				label: 'Slag i minuttet',
				unit: 'slag/min',
				minWidth: 90,
			},
		],
		init: (v: number) => [v],
		val: ([a]: number[]) => a!,
		def: 165,
	}
}

function metricCard(
	ctx: FlowCtx,
	steps: Array<[SportThresholds, Metric]>,
	i: number,
	back: () => Card,
): Card {
	if (i >= steps.length) return back()
	const [s, m] = steps[i]!
	const v = s.values[m.key]
	const next = () => metricCard(ctx, steps, i + 1, back)
	const wheel = (): Card => {
		const w = metricColumns(m)
		return {
			key: `zone-wheel-${s.sport}-${m.key}`,
			topic: `Soner · ${SPORT_TITLE[s.sport as EndSport]}`,
			question: `Hva er ${m.name}en din?`,
			reason: 'Sonene regnes ut fra den. De kan ikke tastes selv.',
			kind: 'custom',
			render: (c) => (
				<NumberForm
					c={c}
					columns={w.cols}
					initial={w.init(v ?? w.def)}
					label="Lagre"
					onDone={(vals) => async () => {
						const r = await must<SportThresholds>('set_thresholds', {
							sport: s.sport,
							[m.key]: w.val(vals),
						})
						return [
							{
								key: `zone-done-${s.sport}-${m.key}`,
								topic: `Soner · ${SPORT_TITLE[s.sport as EndSport]}`,
								question: `${cap1(m.name)}: ${m.fmt(w.val(vals))}.`,
								reason: `Sonene${r.zoneSystem ? ` (${r.zoneSystem.name})` : ''} er regnet ut på nytt, og planlagte økter har fått nye mål.`,
								extra: <ZoneList zones={r.zones} />,
								kind: 'ok',
								checkpoint: true,
							} satisfies Card,
							next(),
						]
					}}
				/>
			),
		}
	}
	return {
		key: `zone-${s.sport}-${m.key}`,
		topic: `Soner · ${SPORT_TITLE[s.sport as EndSport]}`,
		question:
			v === null ? (
				<>
					{cap1(m.name)}: <Unknown />. Vil du sette den?
				</>
			) : (
				<>
					{cap1(m.name)}: <span className="num">{m.fmt(v)}</span>. Stemmer det?
				</>
			),
		extra: s.zones.length ? <ZoneList zones={s.zones} /> : undefined,
		why: s.history.length ? (
			<>
				{s.history.slice(0, 5).map((h, k) => (
					<p key={k}>
						{h.date}: {String(h.what)} {h.value}
					</p>
				))}
			</>
		) : (
			<p>Sonene avledes fra terskelen. Mangler terskelen, er sonene ukjente.</p>
		),
		yes: v === null ? wheel : next,
		no: v === null ? next : wheel,
	}
}

function planEdit(ctx: FlowCtx, d: EndreData, back: () => Card): Card {
	return {
		key: 'plan-see',
		topic: 'Plan',
		question: 'Vil du se hele planen?',
		yes: () => {
			ctx.nav(`${BASE}/plan`)
			return null
		},
		no: () => ({
			key: 'plan-mode',
			topic: 'Plan',
			question: d.adjustAuto
				? 'Vil du heller at jeg spør før jeg endrer uka?'
				: 'Vil du at jeg justerer uka selv, uten å spørre?',
			reason: d.adjustAuto
				? 'Nå justerer jeg hver søndag og forteller hva jeg gjorde. Alt kan angres.'
				: 'Nå kommer hver endring som et kort du svarer på.',
			yes: async () => {
				await must<SetupState>('set_preferences', {
					adjustAutomatically: !d.adjustAuto,
				})
				return [
					info(
						'plan-mode-done',
						'Plan',
						d.adjustAuto ? 'Da spør jeg først.' : 'Da justerer jeg selv.',
					),
					back(),
				]
			},
			no: back,
		}),
	}
}

function accountEdit(ctx: FlowCtx, d: EndreData, back: () => Card): Card {
	const deleteQ = (): Card => ({
		key: 'acct-delete',
		topic: 'Kontoen',
		question: 'Slette alt du har lagt inn?',
		yes: () => ({
			key: 'acct-export',
			topic: 'Kontoen',
			question: 'Vil du laste ned dataene dine først?',
			reason: 'Én fil med alt du eier.',
			yes: async () => {
				const r = await must<ExportDataOutput>('export_data', {})
				download(r.fileName, r.data)
				return [
					info('acct-exported', 'Kontoen', 'Lastet ned.', r.fileName),
					sureCard(),
				]
			},
			no: sureCard,
		}),
		no: back,
	})
	const sureCard = (): Card => ({
		key: 'acct-sure',
		topic: 'Kontoen',
		question:
			d.recordingsCount > 0 ? (
				<>
					<span className="num">{num(d.recordingsCount)}</span>{' '}
					{d.recordingsCount === 1 ? 'økt' : 'økter'} fra klokka, planen og
					koblingene forsvinner. Det kan ikke angres. Sikker?
				</>
			) : (
				'Planen, målet og alt du har svart forsvinner. Det kan ikke angres. Sikker?'
			),
		yes: () => ({
			key: 'acct-swipe',
			topic: 'Kontoen',
			question: 'Helt sikker? Sveip opp for å slette.',
			reason: 'Eller hold knappen inne i to sekunder.',
			kind: 'swipe-up',
			yes: async () => {
				const r = await must<DeleteAccountOutput>('delete_account', {
					confirm: 'SLETT',
				})
				return info(
					'acct-gone',
					'Kontoen',
					'Alt er slettet.',
					`${plural(r.workoutsErased, 'økt', 'økter')} er borte. Du er logget ut.`,
					() => {
						window.location.href = '/'
						return null
					},
				)
			},
			no: back,
		}),
		no: back,
	})
	return {
		key: 'acct-name',
		topic: 'Kontoen',
		question: 'Endre navnet ditt?',
		reason: d.setup.answers.displayName
			? `Nå: ${d.setup.answers.displayName}.`
			: 'Nå: ikke satt.',
		yes: () => ({
			key: 'acct-name-form',
			topic: 'Kontoen',
			question: 'Hva skal jeg kalle deg?',
			kind: 'custom',
			render: (c) => (
				<TextForm
					c={c}
					label="Navn"
					initial={d.setup.answers.displayName ?? ''}
					maxLength={40}
					button="Lagre"
					run={async (v) => {
						const r = await cap<SetupState>('set_display_name', {
							name: v.trim() || null,
						})
						if (!r.ok) return r.message
						return () => [
							info('acct-name-done', 'Kontoen', 'Lagret.'),
							deleteQ(),
						]
					}}
				/>
			),
		}),
		no: deleteQ,
	}
}

function download(fileName: string, data: unknown) {
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: 'application/json',
	})
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = fileName
	document.body.appendChild(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export type { EndreData, Topic }
