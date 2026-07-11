import { Fragment, type ReactNode } from 'react'
import { cn } from '#app/utils/misc.tsx'
import { type TrainingZone } from '#app/utils/session-profile.ts'
import {
	NOTATION_SEPARATORS,
	tokenText,
	type BlockNotation,
	type NotationToken,
	type SentenceSegment,
	type StepNotation,
	type WorkoutNotation,
} from '#app/utils/workout-notation.ts'

/** A token segment of the stanza — what the interaction hook receives. */
export type StanzaTokenSegment = Extract<SentenceSegment, { kind: 'token' }>

export type ScoreStanzaProps = {
	/** The derived token model (`deriveWorkoutNotation`); never free text. */
	notation: WorkoutNotation
	className?: string
	/**
	 * The seam for the editor slice: wrap a token's default rendering (e.g. in
	 * a popover trigger). Omitted → the stanza is inert, plain text in real
	 * elements — the immutable detail view passes nothing here, and no ⠿
	 * chrome renders (the absence of marks IS the immutability signal, §1).
	 */
	renderToken?: (segment: StanzaTokenSegment, children: ReactNode) => ReactNode
	/**
	 * Editing-surface extras appended to the end of a block's line — the
	 * editor's add-step / remove-block affordances ride here so they live on
	 * the block row they act on.
	 */
	lineExtras?: (blockIndex: number) => ReactNode
}

/**
 * The **Score stanza** (workout-editor spec §2, #251): the Token Sentence in
 * the locked Score direction — one block per line at every width, a left
 * gutter carrying the block's grip mark and repeat badge like bar numbers,
 * hairline rules between blocks. Values are weight-and-ink typography with
 * tabular numerals; the intensity chip is the line's only chip-shaped
 * element (§7.2); notes are italic, quoted, ellipsized. Repeat parentheses
 * never render — `( … rest )` stays reserved for rest steps — and block
 * names never render on the line (G2).
 */
export function ScoreStanza({
	notation,
	className,
	renderToken,
	lineExtras,
}: ScoreStanzaProps) {
	const blocks = notation.blocks.filter(
		(block) =>
			block.steps.some((step) => step.tokens.length > 0) || lineExtras != null,
	)
	if (blocks.length === 0) return null
	return (
		<div data-score-stanza className={className}>
			{blocks.map((block) => (
				<StanzaLine
					key={block.blockIndex}
					block={block}
					renderToken={renderToken}
					extras={lineExtras?.(block.blockIndex)}
				/>
			))}
		</div>
	)
}

function StanzaLine({
	block,
	renderToken,
	extras,
}: {
	block: BlockNotation
	renderToken?: ScoreStanzaProps['renderToken']
	extras?: ReactNode
}) {
	const steps = block.steps.filter((step) => step.tokens.length > 0)
	return (
		<div
			data-stanza-line
			className="border-border/70 grid grid-cols-[3rem_1fr] items-baseline gap-x-2.5 border-b py-2.5 last:border-b-0 min-[520px]:grid-cols-[4rem_1fr]"
		>
			<div
				data-stanza-gutter
				className="flex items-baseline justify-end gap-1.5"
			>
				{block.repeat ? (
					<Wrapped token={block.repeat} renderToken={renderToken}>
						<span
							data-token-type="repeat"
							className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums"
						>
							{block.repeat.count}
							{NOTATION_SEPARATORS.repeat}
						</span>
					</Wrapped>
				) : null}
				{/* The block's grip mark — inert this slice (interaction rebuild is a
				    later ticket) and only on editing surfaces: an immutable stanza
				    shows no chrome at all (§1). */}
				{renderToken ? (
					<span
						aria-hidden
						className="text-muted-foreground/50 select-none"
						data-stanza-grip
					>
						⠿
					</span>
				) : null}
			</div>
			<div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 leading-relaxed">
				{steps.map((step, index) => (
					<Fragment key={step.stepIndex}>
						{index > 0 && step.kind !== 'rest' ? (
							<span aria-hidden className="text-muted-foreground/60">
								{NOTATION_SEPARATORS.step}
							</span>
						) : null}
						<StepUnit step={step} renderToken={renderToken} />
					</Fragment>
				))}
				{extras}
			</div>
		</div>
	)
}

/**
 * One step as an unbreakable unit (§2.2, B2): the step's tokens never orphan
 * a mark onto its own line — under 640 px the unit may wrap, but only at
 * token boundaries (each token keeps `whitespace-nowrap` on its own text).
 */
function StepUnit({
	step,
	renderToken,
}: {
	step: StepNotation
	renderToken?: ScoreStanzaProps['renderToken']
}) {
	const parenthesized = step.kind === 'rest'
	return (
		<span
			data-stanza-step
			data-step-kind={step.kind}
			className="inline-flex items-baseline gap-x-1 whitespace-nowrap max-sm:flex-wrap max-sm:whitespace-normal"
		>
			{parenthesized ? <Paren>(</Paren> : null}
			{step.tokens.map((positioned, index) => {
				const { token } = positioned
				const rendered = <Token token={token} />
				return (
					<Fragment key={index}>
						{/* Rest-between-sets folds into the set notation with a mid-dot,
						    never parentheses (§5.1) — `( … rest )` is the rest step's. */}
						{token.type === 'rest' &&
						token.address.field === 'restBetweenSetsSec' ? (
							<span aria-hidden className="text-muted-foreground/60">
								{NOTATION_SEPARATORS.facet}
							</span>
						) : null}
						<Wrapped token={token} renderToken={renderToken}>
							{rendered}
						</Wrapped>
					</Fragment>
				)
			})}
			{parenthesized ? <Paren>)</Paren> : null}
		</span>
	)
}

function Paren({ children }: { children: ReactNode }) {
	return (
		<span aria-hidden className="text-muted-foreground/60">
			{children}
		</span>
	)
}

function Wrapped({
	token,
	renderToken,
	children,
}: {
	token: NotationToken
	renderToken?: ScoreStanzaProps['renderToken']
	children: ReactNode
}) {
	if (!renderToken) return <>{children}</>
	return (
		<>{renderToken({ kind: 'token', text: tokenText(token), token }, children)}</>
	)
}

/**
 * The chip tint: the zone hue mixed ~22–26 % toward the card surface (§7.2),
 * so the same hues carry both themes. Static class strings for the Tailwind
 * compiler.
 */
const ZONE_CHIP_TINT: Record<TrainingZone, string> = {
	1: 'bg-[color-mix(in_srgb,var(--zone-1)_22%,var(--card))]',
	2: 'bg-[color-mix(in_srgb,var(--zone-2)_22%,var(--card))]',
	3: 'bg-[color-mix(in_srgb,var(--zone-3)_26%,var(--card))]',
	4: 'bg-[color-mix(in_srgb,var(--zone-4)_24%,var(--card))]',
	5: 'bg-[color-mix(in_srgb,var(--zone-5)_22%,var(--card))]',
}

const CHIP_BASE =
	'inline-flex items-baseline whitespace-nowrap rounded-md px-2 py-px text-[0.8em] font-semibold tabular-nums [font-variant-caps:small-caps]'

/**
 * The intensity chip — the line's ONLY chip-shaped element: authored value as
 * content, zone-equivalent tint; unresolvable renders the same chip dashed on
 * transparent, never an asterisk (§7.2, B3).
 */
function IntensityChip({
	token,
}: {
	token: Extract<NotationToken, { type: 'intensity' }>
}) {
	const chip = token.chip
	const step = chip?.step ?? null
	return (
		<span
			data-token-type="intensity"
			data-zone-step={step ?? undefined}
			data-unresolved={step == null ? true : undefined}
			className={cn(
				CHIP_BASE,
				step != null
					? cn('text-foreground', ZONE_CHIP_TINT[step])
					: 'text-muted-foreground border-muted-foreground/50 border border-dashed bg-transparent',
			)}
		>
			{chip?.text ?? token.text}
		</span>
	)
}

/** A rest token split into its value and word inks: `1 min` weighs, `rest` recedes. */
function restParts(text: string): { value: string | null; word: string } {
	const match = /^(.*)\s+rest$/.exec(text)
	return match ? { value: match[1]!, word: 'rest' } : { value: null, word: text }
}

function Token({ token }: { token: NotationToken }) {
	switch (token.type) {
		case 'intensity':
			return <IntensityChip token={token} />
		case 'notes':
			return (
				<span
					data-token-type="notes"
					className="text-muted-foreground inline-block max-w-[22ch] truncate align-bottom italic max-sm:max-w-[11ch]"
				>
					“{token.note}”
				</span>
			)
		case 'rest': {
			const { value, word } = restParts(token.text)
			return (
				<span data-token-type="rest" className="text-muted-foreground">
					{value ? (
						<>
							<span className="text-foreground font-semibold tabular-nums">
								{value}
							</span>{' '}
						</>
					) : null}
					{word}
				</span>
			)
		}
		case 'quantity':
		case 'sets':
			return (
				<span
					data-token-type={token.type}
					className="text-foreground font-semibold tabular-nums"
				>
					{token.text}
				</span>
			)
		case 'exercise':
			return (
				<span data-token-type="exercise" className="text-foreground font-semibold">
					{token.text}
				</span>
			)
		// Repeat renders only as the gutter badge; block names never render on
		// the line (G2) — neither reaches this switch from a step, but keep the
		// union total and honest.
		case 'repeat':
		case 'label':
			return null
	}
}
