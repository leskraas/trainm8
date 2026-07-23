import { useMemo, useState } from 'react'
import { cn } from '#app/utils/misc.tsx'
import {
	FALLBACK_PLAN,
	PHASE_COLORS,
	deriveWeeks,
	formatEventDate,
	projectCtl,
	protoId,
	type PhaseKind,
	type ProtoPlanInput,
	type Rhythm,
} from './__proto-x-model.ts'

// PROTOTYPE variant D — "Negotiation". Authoring the Plan Outline as a
// negotiation with the plan itself. It opens with "what are you building
// toward?", every decision becomes a pinned, renegotiable commitment chip,
// the outline strip at the top redraws live, and the plan pushes back with
// counter-proposals grounded in the science (taper length, recovery cadence).
// Deliberately NOT a wizard: nothing is forward-only — tap any chip to
// reopen that question without losing the rest.

type StepId = 'anchor' | 'shape' | 'rhythm' | 'volume' | 'taper' | 'strength'

type Answers = Partial<Record<StepId, string>>

const STEP_ORDER: StepId[] = [
	'anchor',
	'shape',
	'rhythm',
	'volume',
	'taper',
	'strength',
]

const CHIP_LABEL: Record<StepId, string> = {
	anchor: 'Goal',
	shape: 'Phases',
	rhythm: 'Rhythm',
	volume: 'Volume',
	taper: 'Taper',
	strength: 'Strength',
}

export function NegotiationVariant({ plan }: { plan: ProtoPlanInput }) {
	const source = plan ?? FALLBACK_PLAN
	const [answers, setAnswers] = useState<Answers>({})
	const [reopened, setReopened] = useState<StepId | null>(null)

	const firstUnanswered = STEP_ORDER.find((s) => answers[s] == null) ?? null
	const openStep = reopened ?? firstUnanswered

	// ── Derive the outline from the current commitments ──────────────────
	const outline = useMemo(() => {
		const shape = answers.shape ?? 'Deal — 4·3·2·1'
		let spans: Array<[PhaseKind, number]> = shape.includes('More base')
			? [
					['base', 5],
					['build', 2],
					['peak', 2],
					['taper', 1],
				]
			: shape.includes('Punchier')
				? [
						['base', 3],
						['build', 4],
						['peak', 2],
						['taper', 1],
					]
				: [
						['base', 4],
						['build', 3],
						['peak', 2],
						['taper', 1],
					]
		if (answers.taper?.startsWith('Extend')) {
			spans = spans.map(([k, w]): [PhaseKind, number] =>
				k === 'peak' ? [k, w - 1] : k === 'taper' ? [k, w + 1] : [k, w],
			)
		}
		const baseHours = Number(answers.volume?.match(/\d+/)?.[0] ?? 7)
		const hoursFor: Record<PhaseKind, number> = {
			base: baseHours,
			build: baseHours + 1,
			peak: baseHours,
			taper: Math.round(baseHours * 0.55),
		}
		const rhythm: Rhythm = answers.rhythm?.includes('●●○') ? '2:1' : '3:1'
		const phases = spans.map(([kind, weeks]) => ({
			id: protoId(),
			kind,
			name: kind[0]!.toUpperCase() + kind.slice(1),
			weeks,
			weeklyLoadHours: hoursFor[kind],
			focus: '',
		}))
		return { phases, rhythm, baseHours }
	}, [answers])

	const weeks = useMemo(
		() => deriveWeeks(outline.phases, outline.rhythm),
		[outline],
	)
	const ctl = useMemo(() => projectCtl(weeks), [weeks])
	const maxHours = Math.max(...weeks.map((w) => w.hours), 1)

	// ── The script: each question the plan asks, with quick replies ──────
	const questions: Record<
		StepId,
		{ prompt: React.ReactNode; options: string[] }
	> = {
		anchor: {
			prompt: <>What are you building toward?</>,
			options: [
				`🏁 ${source.eventName} · ${formatEventDate(source.eventDate)}`,
				'✨ No race — set a fitness goal (I’ll create a fitness-goal Event)',
			],
		},
		shape: {
			prompt: (
				<>
					Working <em>backward</em> from {formatEventDate(source.eventDate)} I
					can fit <strong>10 weeks</strong>. My opening offer: 4 Base · 3 Build
					· 2 Peak · 1 Taper. Deal?
				</>
			),
			options: ['Deal — 4·3·2·1', 'More base — 5·2·2·1', 'Punchier — 3·4·2·1'],
		},
		rhythm: {
			prompt: (
				<>
					How do you breathe? Three weeks on, one easy — or two on, one easy if
					recovery comes slower these days. The easy week is cut −30%,
					automatically.
				</>
			),
			options: ['●●●○ 3:1 — classic', '●●○ 2:1 — I recover slower'],
		},
		volume: {
			prompt: (
				<>
					Let's talk volume. Where should Base sit? I'll build the other phases
					around it (Build runs one hour higher, the taper sheds volume but
					never intensity).
				</>
			),
			options: ['6 h/week', '7 h/week', '8 h/week'],
		},
		taper: {
			prompt: (
				<>
					<strong>Counter-proposal.</strong> You gave me a 1-week taper. The
					meta-analysis says ~2 weeks of exponential volume cut beats one for a
					race like this. I'd steal that week from Peak. Take it?
				</>
			),
			options: ['Extend the taper to 2 weeks', 'Keep 1 week — I sharpen late'],
		},
		strength: {
			prompt: (
				<>
					Last thing — strength work. I'll say this straight:{' '}
					<strong>strength sessions carry no TSS</strong> and will never count
					toward your weekly load targets. They still matter. Keep them in the
					pattern?
				</>
			),
			options: ['Twice a week (Mon + Thu)', 'Once a week', 'Skip strength'],
		},
	}

	const done = firstUnanswered == null && reopened == null

	function answer(step: StepId, option: string) {
		setAnswers((a) => ({ ...a, [step]: option }))
		setReopened(null)
	}

	const answeredSteps = STEP_ORDER.filter((s) => answers[s] != null)

	return (
		<main className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-xl flex-col px-4">
			{/* Pinned: the live outline strip + the commitment chips */}
			<div className="bg-background/95 sticky top-0 z-30 -mx-4 border-b px-4 pt-3 pb-2 backdrop-blur">
				<div className="flex h-14 items-end gap-0.5">
					{answers.anchor ? (
						weeks.map((w) => (
							<div
								key={w.index}
								className={cn(
									'flex-1 rounded-t-sm',
									PHASE_COLORS[w.phaseKind].solid,
									w.isRecovery && 'opacity-40',
								)}
								style={{ height: `${20 + (w.hours / maxHours) * 80}%` }}
								title={`Week ${w.index + 1} · ${w.hours} h`}
							/>
						))
					) : (
						<div className="text-muted-foreground w-full pb-3 text-center text-xs italic">
							the outline draws itself here as you commit
						</div>
					)}
					{answers.anchor && <div className="pb-0.5 pl-1 text-sm">🏁</div>}
				</div>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{STEP_ORDER.map((s) => (
						<button
							key={s}
							type="button"
							disabled={answers[s] == null}
							onClick={() => setReopened(s)}
							className={cn(
								'rounded-full border px-2.5 py-1 text-xs font-semibold',
								answers[s] != null
									? 'bg-foreground text-background hover:opacity-80'
									: 'text-muted-foreground/50 border-dashed',
								openStep === s && 'ring-primary ring-2',
							)}
							title={answers[s] ?? 'not committed yet'}
						>
							{CHIP_LABEL[s]}
							{answers[s] != null ? ' ↺' : ''}
						</button>
					))}
				</div>
			</div>

			{/* The conversation */}
			<div className="flex-1 space-y-3 py-4">
				{answeredSteps.map((s) => (
					<div key={s}>
						<PlanBubble>{questions[s].prompt}</PlanBubble>
						<div className="mt-1.5 flex justify-end">
							<div className="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-3.5 py-2 text-sm font-medium">
								{answers[s]}
							</div>
						</div>
					</div>
				))}

				{openStep && (
					<div>
						<PlanBubble highlight>
							{questions[openStep].prompt}
							{reopened && (
								<div className="text-muted-foreground mt-1 text-xs italic">
									(renegotiating — your other commitments stand)
								</div>
							)}
						</PlanBubble>
						<div className="mt-2 flex flex-wrap justify-end gap-2">
							{questions[openStep].options.map((o) => (
								<button
									key={o}
									type="button"
									onClick={() => answer(openStep, o)}
									className={cn(
										'border-primary/40 hover:bg-primary hover:text-primary-foreground rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors',
										answers[openStep] === o && 'bg-primary/10',
									)}
								>
									{o}
								</button>
							))}
						</div>
					</div>
				)}

				{done && (
					<div>
						<PlanBubble highlight>
							<strong>Shake on it.</strong> {weeks.length} weeks to{' '}
							{source.eventName}:{' '}
							{outline.phases.map((p) => `${p.weeks}wk ${p.name}`).join(' → ')},{' '}
							{outline.rhythm} rhythm, Base at {outline.baseHours} h/week.
							Projected fitness on race day: CTL ≈ {ctl[ctl.length - 1]}. Any
							chip above reopens its clause.
						</PlanBubble>
						<button
							type="button"
							disabled
							className="bg-foreground text-background mt-3 w-full rounded-xl py-3 text-sm font-bold opacity-60"
						>
							Sign the Plan Outline (prototype — not wired)
						</button>
					</div>
				)}
			</div>
		</main>
	)
}

function PlanBubble({
	children,
	highlight,
}: {
	children: React.ReactNode
	highlight?: boolean
}) {
	return (
		<div className="flex items-start gap-2">
			<div className="bg-muted grid size-7 shrink-0 place-items-center rounded-full text-sm">
				🗺️
			</div>
			<div
				className={cn(
					'bg-muted max-w-[85%] rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm',
					highlight && 'ring-primary/30 ring-2',
				)}
			>
				{children}
			</div>
		</div>
	)
}
