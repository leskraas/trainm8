import {
	type SessionBlock,
	type SessionCard,
	type SessionOutput,
	type Verdict,
} from '#app/lab/engine/reads.types.ts'
import {
	type NoteSessionOutput,
	type RateSessionOutput,
} from '#app/lab/engine/sessions.types.ts'
import { cap, FlowError, markSeen } from './__api.ts'
import { type Card, type Next } from './__deck.tsx'
import { dur, km, num, pace, plural } from './__format.ts'
import { TextForm } from './__forms.tsx'
import { Scale, Unknown } from './__ui.tsx'

export const ENDURANCE = ['run', 'bike', 'swim'] as const

/** The one session the calm screen shows: the plan's sports first, then time. */
export function pickMain(sessions: SessionCard[]): SessionCard | null {
	const real = sessions.filter((s) => s.status !== 'recording-only')
	const rank = (s: SessionCard) =>
		(s.status === 'planned' ? 0 : 10) + (s.sport === 'other' ? 1 : 0)
	return (
		[...real].sort(
			(a, b) => rank(a) - rank(b) || (a.time ?? '').localeCompare(b.time ?? ''),
		)[0] ?? null
	)
}

export function bigName(s: Pick<SessionCard, 'purpose' | 'title'>) {
	return s.purpose ?? s.title
}

function stepTarget(step: SessionBlock['steps'][number]) {
	const t = step.target
	if (!t) return null
	const text =
		t.resolvedText ?? (t.pace || t.power || t.heartRate ? null : t.label)
	if (t.why && !t.resolvedText)
		return (
			<>
				{t.label}: <Unknown why={t.why} />
			</>
		)
	return text ? `${t.approximate ? '≈ ' : ''}${text}` : t.label
}

function stepLine(step: SessionBlock['steps'][number]) {
	const amount =
		step.kind === 'strength'
			? `${step.sets ? `${step.sets} sett` : ''}`
			: step.durationS
				? dur(step.durationS)
				: step.distanceM
					? step.distanceM >= 1000
						? km(step.distanceM)
						: `${num(step.distanceM)} m`
					: null
	const name = step.exercise?.name ?? (step.kind === 'rest' ? 'pause' : null)
	const target = stepTarget(step)
	return (
		<>
			{[name, amount].filter(Boolean).join(' ')}
			{target ? <> · {target}</> : null}
		</>
	)
}

/** The structure as rows: «Oppvarming · 10 min rolig», «5 × (4 min · …)». */
export function blockRows(structure: SessionBlock[] | null) {
	if (!structure?.length) return []
	return structure.map((b) => {
		const reps =
			b.series > 1
				? `${b.series} × ${b.repeat} ×`
				: b.repeat > 1
					? `${b.repeat} ×`
					: null
		const steps = b.steps.map((st, i) => (
			<span key={i}>
				{i > 0 ? ' · ' : ''}
				{stepLine(st)}
			</span>
		))
		return [
			b.name ?? (reps ? reps.replace(/ ×$/, ' ×') : null),
			<span key="b">
				{b.name && reps ? `${reps} ` : ''}
				{steps}
			</span>,
		] as [string | null, React.ReactNode]
	})
}

export function strengthRows(s: SessionOutput) {
	return (s.strength?.exercises ?? []).map((e) => {
		const working = e.sets.filter((x) => x.role !== 'warmup')
		const first = working[0]?.prescribed
		const amount = first?.reps
			? `${first.reps} reps`
			: first?.durationS
				? `${first.durationS} s`
				: null
		const kg = first?.kg.value ?? null
		return [
			e.name,
			<span key="s">
				{plural(working.length, 'sett', 'sett')}
				{amount ? ` × ${amount}` : ''} ·{' '}
				{kg !== null ? (
					`${num(kg, 1)} kg`
				) : first?.loadText ? (
					first.loadText
				) : (
					<Unknown why={first?.kg.why} word="vekt ukjent" />
				)}
			</span>,
		] as [string, React.ReactNode]
	})
}

// ── how it went ───────────────────────────────────────────────────────

const WORD = { under: 'Under', 'on-target': 'Traff', over: 'Over' } as const
const LINE = {
	under: 'Lettere enn planlagt.',
	'on-target': 'Som planlagt.',
	over: 'Hardere enn planlagt.',
} as const

export function verdictWord(v: Verdict) {
	return v.call ? WORD[v.call] : 'Ukjent'
}

function Pair({
	label,
	p,
	a,
	fmt,
}: {
	label: string
	p: { value: number | null; why: string | null }
	a: { value: number | null; why: string | null }
	fmt: (n: number) => string
}) {
	if (p.value === null && a.value === null) return null
	return (
		<div className="tm-pair">
			<span>{label}</span>
			<span className="num">
				{p.value === null ? <Unknown why={p.why} /> : fmt(p.value)}
			</span>
			<span className="arrow" aria-label="til">
				→
			</span>
			<span className="num">
				{a.value === null ? <Unknown why={a.why} /> : fmt(a.value)}
			</span>
		</div>
	)
}

export function ResultView({ s }: { s: SessionOutput }) {
	const c = s.comparison
	const call = c.verdict.call
	return (
		<div>
			<div className={`tm-big ${call ?? 'none'}`}>{verdictWord(c.verdict)}</div>
			{call ? null : (
				<p className="tm-reason">{c.verdict.why ?? 'Ingen dom.'}</p>
			)}
			<div className="tm-pairs">
				<div
					className="tm-pair"
					style={{
						fontSize: 12,
						letterSpacing: '0.06em',
						textTransform: 'uppercase',
						color: 'var(--ink2)',
					}}
				>
					<span />
					<span>Planlagt</span>
					<span />
					<span>Faktisk</span>
				</div>
				<Pair
					label="Tid"
					p={c.durationS.planned}
					a={c.durationS.actual}
					fmt={dur}
				/>
				<Pair
					label="Distanse"
					p={c.distanceM.planned}
					a={c.distanceM.actual}
					fmt={km}
				/>
				<Pair
					label="Belastning"
					p={c.load.planned}
					a={c.load.actual}
					fmt={(n) => num(n)}
				/>
				{s.strength ? (
					<div className="tm-pair">
						<span>Sett</span>
						<span className="num">{s.strength.prescribedSets}</span>
						<span className="arrow">→</span>
						<span className="num">{s.strength.loggedSets}</span>
					</div>
				) : null}
			</div>
			{s.recording ? (
				<p className="tm-note">
					{s.recording.avgPace.value !== null && s.sport === 'run'
						? `Snittfart ${pace(s.recording.avgPace.value)} /km. `
						: ''}
					{s.recording.avgHeartRate.value !== null
						? `Snittpuls ${num(s.recording.avgHeartRate.value)}. `
						: ''}
					{s.recording.avgPower.value !== null
						? `Snittwatt ${num(s.recording.avgPower.value)}. `
						: ''}
				</p>
			) : null}
			{s.structure?.some((b) => b.repeat > 1 || b.steps.length > 1) ? (
				<p className="tm-note">
					{c.structure.label
						? `Dragene: ${c.structure.label.toLowerCase()}.`
						: `Ingen rundetider.${c.structure.why ? ` ${c.structure.why}` : ''}`}
				</p>
			) : null}
		</div>
	)
}

export function resultCard(s: SessionOutput): Card {
	return {
		key: `result-${s.id}`,
		topic: 'Resultat',
		reason: s.title,
		question: s.comparison.verdict.call
			? LINE[s.comparison.verdict.call]
			: 'Ingen dom.',
		kind: 'ok',
		ok: () => {
			markSeen(`result-${s.id}`)
			return undefined
		},
		extra: <ResultView s={s} />,
		why: (
			<>
				<p>
					Regel: planlagt belastning holdes mot faktisk. Innenfor rammen er det
					traff, under er lettere, over er hardere.
				</p>
				{s.comparison.verdict.sentence ? (
					<p>{s.comparison.verdict.sentence}.</p>
				) : null}
				{s.feeling.rpe ? (
					<p>Du sa den var {s.feeling.rpe} av 10.</p>
				) : (
					<p>Tyngde: ikke oppgitt.</p>
				)}
				{s.feeling.note ? <p>Notat: «{s.feeling.note}»</p> : null}
			</>
		),
	}
}

export async function resultFor(sessionId: string): Promise<Next> {
	const r = await cap<SessionOutput>('session', { sessionId })
	if (!r.ok) return undefined
	return resultCard(r.value)
}

// ── how it felt: the scale card, then the note ────────────────────────

export function feelingCards(
	s: { id: string; title: string },
	offer: (o: { text: string; token: string | null }) => void,
	opts: { withResult?: boolean } = {},
): Card {
	const after = async (): Promise<Next> =>
		opts.withResult === false ? undefined : resultFor(s.id)
	const noteQ = (): Card => ({
		key: `note-q-${s.id}`,
		topic: `Følelse · ${s.title}`,
		question: 'Vil du skrive et notat?',
		yes: () => ({
			key: `note-${s.id}`,
			topic: `Følelse · ${s.title}`,
			question: 'Notat',
			kind: 'custom',
			render: (c) => (
				<TextForm
					c={c}
					label="Notat"
					multiline
					maxLength={2000}
					placeholder="Tunge bein, god flyt på slutten …"
					button="Lagre notat"
					run={async (v) => {
						if (!v.trim()) return 'Skriv noe, eller gå tilbake.'
						const r = await cap<NoteSessionOutput>('note_session', {
							sessionId: s.id,
							note: v.trim(),
						})
						if (!r.ok) return r.message
						offer({ text: 'Notatet er lagret.', token: r.value.undo })
						return after
					}}
				/>
			),
		}),
		no: () => {
			markSeen(`note-${s.id}`)
			return after()
		},
	})
	return {
		key: `rpe-${s.id}`,
		topic: `Følelse · ${s.title}`,
		question: 'Hvor tung var den?',
		kind: 'custom',
		why: (
			<p>
				Tyngden lagres som du sier den. Uten klokke er det den belastningen
				regnes ut fra. Svarer du ikke, står det «ikke oppgitt».
			</p>
		),
		render: (c) => (
			<div>
				<Scale
					value={null}
					disabled={c.busy}
					onPick={(n) =>
						c.submit(async () => {
							const res = await cap<RateSessionOutput>('rate_session', {
								sessionId: s.id,
								rpe: n,
							})
							if (!res.ok && res.code === 'not-yet') {
								markSeen(`rpe-${s.id}`)
								return {
									key: `rpe-later-${s.id}`,
									topic: `Følelse · ${s.title}`,
									question: 'Det kan du si på dagen.',
									reason: res.message,
									kind: 'ok',
								}
							}
							if (!res.ok) throw new FlowError(res.message, res.code)
							const r = res.value
							markSeen(`rpe-${s.id}`)
							offer({ text: `Tyngde ${n} av 10 er lagret.`, token: r.undo })
							return noteQ()
						})
					}
				/>
				<button
					type="button"
					className="tm-wide ghost"
					style={{ marginTop: 14 }}
					disabled={c.busy}
					onClick={() =>
						c.submit(() => {
							markSeen(`rpe-${s.id}`)
							return noteQ()
						}, 'left')
					}
				>
					Ikke nå
				</button>
			</div>
		),
	}
}
