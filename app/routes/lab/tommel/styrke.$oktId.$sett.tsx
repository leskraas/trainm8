import { useCallback, useEffect, useState } from 'react'
import { useLoaderData, useNavigate, useRevalidator } from 'react-router'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type FinishStrengthSessionOutput,
	type LogStrengthSetOutput,
	type StrengthExercise,
	type StrengthLoad,
	type StrengthSessionOutput,
	type StrengthSet,
} from '#app/lab/engine/sessions.types.ts'
import { type Route } from './+types/styrke.$oktId.$sett.ts'
import { BASE, cap, FlowError } from './__api.ts'
import { Deck, type Card, type Next } from './__deck.tsx'
import { num, plural } from './__format.ts'
import { NumberForm } from './__forms.tsx'
import { athleteOrStart } from './__load.server.ts'
import { feelingCards } from './__session.tsx'
import { range, Rows } from './__ui.tsx'
import { useUndo } from './__undo.tsx'

export const meta = () => [{ title: 'Styrke · Tommel' }]

export async function loader({ request, params }: Route.LoaderArgs) {
	await athleteOrStart(request)
	const r = await runCapability(request, 'strength_session', {
		sessionId: params.oktId,
	})
	if (!r.ok)
		throw new Response(r.message, {
			status: r.code === 'not-found' ? 404 : 400,
		})
	return {
		st: r.value as StrengthSessionOutput,
		sett: Math.max(0, Number(params.sett) || 0),
	}
}

type Item = { ex: StrengthExercise; set: StrengthSet; no: number }

function flatten(st: StrengthSessionOutput): Item[] {
	return st.exercises.flatMap((ex) => {
		let n = 0
		return ex.sets.map((set) => ({ ex, set, no: set.warmup ? 0 : ++n }))
	})
}

function loadText(l: StrengthLoad | null): string | null {
	if (!l) return null
	if (l.kind === 'kg') return `${num(l.kg, 1)} kg`
	if (l.kind === 'kg-per-hand') return `${num(l.kg, 1)} kg per hånd`
	if (l.kind === 'bodyweight') return 'kroppsvekt'
	if (l.kind === 'bodyweight-plus') return `kroppsvekt + ${num(l.kg, 1)} kg`
	if (l.kind === 'assisted') return `${num(l.kg, 1)} kg hjelp`
	if (l.kind === 'machine-level') return `nivå ${l.level}`
	if (l.kind === 'band') return `strikk ${l.band}`
	return null
}

function prescribedLoad(it: Item): { text: string | null; known: boolean } {
	const p = it.set.prescribed
	if (p.kg !== null) return { text: `${num(p.kg, 1)} kg`, known: true }
	if (p.load?.kind === 'bodyweight')
		return {
			text: p.load.addedKg
				? `kroppsvekt + ${num(p.load.addedKg, 1)} kg`
				: 'kroppsvekt',
			known: true,
		}
	if (it.ex.defaultLoad)
		return { text: loadText(it.ex.defaultLoad), known: true }
	if (p.load?.kind === 'reference' || p.load?.kind === 'other')
		return { text: p.load.text, known: false }
	return { text: null, known: false }
}

function amountText(it: Item) {
	const p = it.set.prescribed
	return p.reps !== null
		? `${p.reps}`
		: p.seconds !== null
			? `${p.seconds} s`
			: '?'
}

function loggedText(it: Item) {
	const l = it.set.logged
	if (!l) return null
	if (!l.done) return 'hoppet over'
	const a =
		l.reps !== null ? `${l.reps}` : l.seconds !== null ? `${l.seconds} s` : '?'
	const w = loadText(l.load)
	return w ? `${a} × ${w}` : a
}

const RESULT: Record<string, string> = {
	'goes-up': 'går opp',
	stays: 'står',
	'goes-down': 'går ned',
	'lifted-lighter': 'du løftet lettere',
	'not-readable': 'kunne ikke leses',
	skipped: 'ikke gjort',
}

export default function Styrke() {
	const { st: initial, sett } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const revalidator = useRevalidator()
	const { offer } = useUndo()
	const [st, setSt] = useState(initial)

	// Open the session to train it now: a program's working weights are taken at this moment.
	useEffect(() => {
		if (initial.loggedWorkingSets > 0 || initial.session.state !== 'planned')
			return
		void cap<StrengthSessionOutput>('start_strength_session', {
			sessionId: initial.session.id,
		}).then((r) => {
			if (r.ok) setSt(r.value)
		})
	}, [initial])

	const sid = st.session.id
	const title = st.session.title ?? 'Styrke'

	const [start] = useState<Card[]>(() => {
		const items = flatten(initial)
		if (items.length === 0)
			return [
				{
					key: 'empty',
					topic: 'Styrke',
					question: 'Økta har ingen øvelser.',
					reason: 'Det er ingenting å logge.',
					kind: 'ok',
				},
			]
		const firstOpen = items.findIndex((x) => !x.set.logged)
		const at =
			sett > 0
				? Math.min(sett, items.length)
				: Math.max(0, firstOpen === -1 ? items.length : firstOpen)
		return [makeCard(items, at)]
	})

	function makeCard(items: Item[], i: number): Card {
		if (i >= items.length) return finishCard(items)
		const it = items[i]!
		const next = () => makeCard(items, i + 1)
		const p = it.set.prescribed
		// An unknown weight carries the one just lifted in this lift, never a guess.
		const carried = items
			.slice(0, i)
			.reverse()
			.find(
				(x) =>
					x.ex.stepId === it.ex.stepId &&
					x.set.logged?.done &&
					x.set.logged.load,
			)?.set.logged?.load
		const own = prescribedLoad(it)
		const load =
			!own.known && carried
				? { text: `${loadText(carried)} (som sist)`, known: true }
				: own
		const label = it.set.warmup ? 'oppvarming' : `sett ${it.no}`
		const log = async (extra: Record<string, unknown>): Promise<Next> => {
			const withLoad =
				!own.known && carried && !('load' in extra) && extra.done !== false
					? { ...extra, load: carried }
					: extra
			const r = await cap<LogStrengthSetOutput>('log_strength_set', {
				sessionId: sid,
				stepId: it.ex.stepId,
				setIndex: it.set.setIndex,
				...withLoad,
			})
			if (!r.ok) {
				if (r.code === 'needs-load')
					return [weightCard(items, i, r.message, extra)]
				throw new FlowError(r.message, r.code)
			}
			items[i] = { ...it, set: r.value.set }
			if (r.value.records.length)
				return [
					{
						key: `rec-${i}`,
						topic: `Styrke · ${it.ex.name}`,
						question: 'Ny rekord.',
						reason: r.value.records
							.map(
								(x) =>
									`${x.kind === 'estimated-1rm' ? 'Beregnet 1RM' : x.kind === 'rep-max' ? `${x.reps} reps` : 'Tyngste'}: ${num(x.value, 1)} ${x.unit === 'kg' ? 'kg' : 'nivå'}${x.previous ? ` (før ${num(x.previous, 1)})` : ''}`,
							)
							.join(' · '),
						kind: 'ok',
					},
					next(),
				]
			return next()
		}
		const amountWheel = (): Card => {
			const bySeconds = p.reps === null && p.seconds !== null
			const top = bySeconds
				? Math.max(120, (p.seconds ?? 0) + 30)
				: Math.max(30, (p.reps ?? 0) + 10)
			const init = bySeconds
				? Math.max(0, (p.seconds ?? 30) - 5)
				: Math.max(0, (p.reps ?? 8) - 1)
			return {
				key: `amount-${i}`,
				topic: `Styrke · ${it.ex.name}`,
				question: bySeconds ? 'Hvor mange sekunder?' : 'Hvor mange reps?',
				kind: 'custom',
				render: (c) => (
					<NumberForm
						c={c}
						columns={[
							{
								items: range(0, top, bySeconds ? 5 : 1),
								label: bySeconds ? 'Sekunder' : 'Reps',
								unit: bySeconds ? 's' : 'reps',
								minWidth: 90,
							},
						]}
						initial={[bySeconds ? Math.round(init / 5) * 5 : init]}
						label="Lagre settet"
						onDone={([v]) =>
							() =>
								log(bySeconds ? { seconds: v } : { reps: v })
							}
					/>
				),
			}
		}
		const no = (): Card => ({
			key: `fewer-${i}`,
			topic: `Styrke · ${it.ex.name}`,
			question:
				p.reps === null && p.seconds !== null ? 'Kortere tid?' : 'Færre reps?',
			yes: amountWheel,
			no: () => ({
				key: `lighter-${i}`,
				topic: `Styrke · ${it.ex.name}`,
				question: load.known ? 'Annen vekt?' : 'Vil du skrive inn vekten?',
				yes: () => weightCard(items, i),
				no: () => ({
					key: `skip-${i}`,
					topic: `Styrke · ${it.ex.name}`,
					question: 'Hoppet du over settet?',
					yes: () => log({ done: false }),
					no: () => makeCard(items, i),
				}),
			}),
		})
		return {
			key: `set-${i}-${it.set.logged ? 'l' : 'o'}`,
			topic: 'Styrke',
			topicRight: `${i + 1} av ${items.length}`,
			question: (
				<>
					{it.ex.name}, {label}: <span className="num">{amountText(it)}</span> ×{' '}
					{load.text ? (
						<span className="num">{load.text}</span>
					) : (
						<span className="tm-unknown">vekt ukjent</span>
					)}
					. Gjort?
				</>
			),
			reason: it.set.logged
				? `Logget: ${loggedText(it)}. Ja logger det på nytt.`
				: it.set.plates
					? `Skiver per side: ${it.set.plates.perSide.map((x) => num(x, 1)).join(' + ') || 'ingen'} (stang ${num(it.set.plates.barKg, 1)} kg).`
					: it.set.lastTime
						? `Forrige gang: ${it.set.lastTime.reps ?? it.set.lastTime.seconds ?? '?'} × ${loadText(it.set.lastTime.load) ?? '?'}.`
						: undefined,
			why: (
				<>
					{p.kgUnknownBecause ? <p>Vekt: {p.kgUnknownBecause}</p> : null}
					{p.kgFix ? <p>{p.kgFix}</p> : null}
					{it.ex.defaultLoadUnknownBecause && !load.known ? (
						<p>
							Et trykk på ja kan ikke logge en vekt:{' '}
							{it.ex.defaultLoadUnknownBecause}.
						</p>
					) : null}
					{!it.set.plates && it.set.platesUnknownBecause ? (
						<p>Skiver: {it.set.platesUnknownBecause}</p>
					) : null}
					{it.ex.restSeconds ? (
						<p>Pause mellom settene: {it.ex.restSeconds} s.</p>
					) : null}
					{it.ex.noWarmupBecause ? <p>{it.ex.noWarmupBecause}</p> : null}
					{st.program ? (
						<p>
							Del av programmet {st.program.name}. Vekten neste gang bestemmes
							av det du logger.
						</p>
					) : null}
				</>
			),
			yes: () =>
				own.known
					? log({})
					: carried
						? log({ load: carried })
						: weightCard(items, i),
			no,
		}
	}

	function weightCard(
		items: Item[],
		i: number,
		because?: string,
		extra: Record<string, unknown> = {},
	): Card {
		const it = items[i]!
		const p = it.set.prescribed
		const prev = items
			.slice(0, i)
			.reverse()
			.find(
				(x) =>
					x.ex.stepId === it.ex.stepId && x.set.logged?.load?.kind === 'kg',
			)?.set.logged?.load
		const start =
			p.kg ??
			(prev?.kind === 'kg'
				? prev.kg
				: it.set.lastTime?.load.kind === 'kg'
					? it.set.lastTime.load.kg
					: 20)
		return {
			key: `kg-${i}`,
			topic: `Styrke · ${it.ex.name}`,
			question: 'Hvilken vekt?',
			reason: because
				? 'Jeg vet ikke vekten for dette settet. Si den, så logger jeg den.'
				: 'Vekten du løftet, i kilo.',
			kind: 'custom',
			render: (c) => (
				<NumberForm
					c={c}
					columns={[
						{
							items: range(0, 300, 2.5, (n) => num(n, 1)),
							label: 'Kilo',
							unit: 'kg',
							minWidth: 100,
						},
					]}
					initial={[Math.round(start / 2.5) * 2.5]}
					label="Lagre settet"
					onDone={([kg]) =>
						async () => {
							const r = await cap<LogStrengthSetOutput>('log_strength_set', {
								sessionId: sid,
								stepId: it.ex.stepId,
								setIndex: it.set.setIndex,
								...extra,
								load: { kind: 'kg', kg },
								...(it.set.logged ? { changeLoadKind: true } : {}),
							})
							if (!r.ok) throw new FlowError(r.message, r.code)
							items[i] = { ...it, set: r.value.set }
							return makeCard(items, i + 1)
						}}
				/>
			),
		}
	}

	function finishCard(items: Item[]): Card {
		const finish = async (unlogged?: 'not-done'): Promise<Next> => {
			const r = await cap<FinishStrengthSessionOutput>(
				'finish_strength_session',
				{ sessionId: sid, ...(unlogged ? { unloggedSets: unlogged } : {}) },
			)
			if (!r.ok) {
				if (r.code === 'unlogged-sets') {
					const first = items.findIndex((x) => !x.set.logged && !x.set.warmup)
					return {
						key: 'unlogged',
						topic: 'Styrke',
						question: `${r.message} Regn dem som ikke gjort?`,
						reason: 'Nei tar deg til det første.',
						yes: () => finish('not-done'),
						no: () => makeCard(items, Math.max(0, first)),
					}
				}
				throw new FlowError(r.message, r.code)
			}
			offer({ text: 'Styrkeøkta er avsluttet.', token: r.value.undo })
			const lifts = r.value.lifts
			return [
				{
					key: 'finished',
					topic: 'Styrke',
					question: 'Ferdig.',
					reason: lifts.length
						? `Neste gang${r.value.programName ? ` i ${r.value.programName}` : ''}:`
						: (r.value.noUndoBecause ?? 'Økta er logget.'),
					extra: lifts.length ? (
						<Rows
							rows={lifts.map((l) => [
								l.name,
								<span key="l">{`${num(l.nextKg, 1)} kg, ${RESULT[l.result] ?? l.result}. ${l.reason}`}</span>,
							])}
						/>
					) : undefined,
					kind: 'ok',
					checkpoint: true,
				},
				feelingCards({ id: sid, title }, offer),
			]
		}
		const logged = items.filter((x) => x.set.logged && !x.set.warmup).length
		const working = items.filter((x) => !x.set.warmup).length
		return {
			key: 'finish',
			topic: 'Styrke',
			question: 'Avslutte økta?',
			reason: `${plural(logged, 'sett', 'sett')} av ${working} er logget.`,
			yes: () => finish(),
			no: () =>
				makeCard(
					items,
					Math.max(
						0,
						items.findIndex((x) => !x.set.logged),
					),
				),
		}
	}

	const onEnd = useCallback(() => {
		void revalidator.revalidate()
		void navigate(BASE)
	}, [navigate, revalidator])

	return (
		<main aria-label="Styrke">
			<Deck
				start={start}
				onEnd={onEnd}
				lockAfterWrite={false}
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
						<span style={{ fontSize: 14 }}>Pause</span>
					</button>
				}
			/>
		</main>
	)
}
