/**
 * The start's one list of activities (#584): the modelled endurance sports,
 * the Simple Activities and _Styrke_, each with its mark, and the main-sport
 * line under it (_Hovedidrett_, #573). Shared by the start's _Hva liker du å
 * trene?_ (`trening.tsx`) and _Meg_'s activities editor (`settings/level.tsx`,
 * ADR 0109), so the athlete picks what they train with the same chips in
 * both places.
 */
import { Button } from '#app/components/ui/button.tsx'
import {
	ToggleGroup,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import {
	NB_DISCIPLINE_LABELS,
	SIMPLE_ACTIVITY_LABELS,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import { type StrengthPerWeek } from '#app/utils/first-run/start-draft.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	ACTIVITY_KINDS,
	type ActivityKind,
} from '#app/utils/simple-activity.ts'
import {
	CARDIO_DISCIPLINES,
	type CardioDiscipline,
} from '#app/utils/workout-schema.ts'

const L = SIMPLE_START_LABELS

/** The list's value for _Styrke_, beside the sports and Activity Kinds. */
export const STRENGTH_CHOICE = 'strength'

/** A sport's mark is its track hue (design-system: hues are for marks). */
const SPORT_MARK: Record<CardioDiscipline, string> = {
	run: 'bg-track-run',
	swim: 'bg-track-swim',
	bike: 'bg-track-bike',
}

/** A Simple Activity has no track hue: the neutral mark, as in _Uka di_. */
const SIMPLE_ACTIVITY_MARK = 'bg-muted-foreground'

/** What is pressed, in the order each kind was picked. */
export type ActivityPicks = {
	/** Every sport picked, in the order picked: the first is the main sport. */
	sports: CardioDiscipline[]
	activities: ActivityKind[]
	/** The **Strength Frequency** pressed, or null for no strength. */
	strength: StrengthPerWeek | null
}

/**
 * The picks after a press: a sport keeps the order picked (the first is the
 * main sport), an activity likewise, and _Styrke_ starts on its preset.
 */
export function pressActivities(
	before: ActivityPicks,
	next: readonly string[],
	strengthPreset: StrengthPerWeek | null,
): ActivityPicks {
	const wantsStrength = next.includes(STRENGTH_CHOICE)
	return {
		sports: [
			...before.sports.filter((sport) => next.includes(sport)),
			...CARDIO_DISCIPLINES.filter(
				(sport) => next.includes(sport) && !before.sports.includes(sport),
			),
		],
		activities: [
			...before.activities.filter((kind) => next.includes(kind)),
			...ACTIVITY_KINDS.filter(
				(kind) => next.includes(kind) && !before.activities.includes(kind),
			),
		],
		strength: wantsStrength ? (before.strength ?? strengthPreset) : null,
	}
}

/** The chips' values pressed for these picks. */
export function pressedOf(picks: ActivityPicks): string[] {
	return [
		...picks.sports,
		...picks.activities,
		...(picks.strength != null ? [STRENGTH_CHOICE] : []),
	]
}

export function ActivityChips({
	pressed,
	onPressedChange,
	withStrength,
	invalid,
	label,
}: {
	/** The group's name, where no legend around it names it. */
	label?: string
	pressed: string[]
	onPressedChange: (next: string[]) => void
	/** _Styrke_ is offered where there is a session for a lifting day to copy. */
	withStrength: boolean
	invalid?: boolean
}) {
	const choices = [
		...CARDIO_DISCIPLINES.map((sport) => ({
			value: sport as string,
			label: NB_DISCIPLINE_LABELS[sport],
			mark: SPORT_MARK[sport],
		})),
		...ACTIVITY_KINDS.map((kind) => ({
			value: kind as string,
			label: SIMPLE_ACTIVITY_LABELS.kind[kind],
			mark: SIMPLE_ACTIVITY_MARK,
		})),
		...(withStrength
			? [
					{
						value: STRENGTH_CHOICE,
						label: L.strength.chip,
						mark: 'bg-track-strength',
					},
				]
			: []),
	]
	return (
		<ToggleGroup
			multiple
			variant="outline"
			spacing={2}
			value={pressed}
			onValueChange={(next) => onPressedChange(next as string[])}
			aria-invalid={invalid ? true : undefined}
			aria-label={label}
			className="w-full flex-wrap"
		>
			{choices.map((choice) => (
				<ToggleGroupItem
					key={choice.value}
					value={choice.value}
					className="group aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground text-callout h-11 max-w-full gap-2 rounded-full px-4"
				>
					<span
						aria-hidden
						className={cn(
							'size-2.5 shrink-0 rounded-full',
							// On the pressed fill the dot keeps its hue inside a ring
							// of the pill's text colour, so it never sits hue on hue.
							'group-aria-pressed:ring-primary-foreground group-aria-pressed:ring-2',
							choice.mark,
						)}
					/>
					<span className="min-w-0 truncate">{choice.label}</span>
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	)
}

/**
 * _Hovedidrett_: the first sport picked, which a tap hands to the next one
 * picked where there are two or more.
 */
export function MainSportLine({
	sports,
	onSwitch,
}: {
	sports: readonly CardioDiscipline[]
	onSwitch: () => void
}) {
	const main = sports[0]
	return (
		<div aria-live="polite" className="min-h-11" data-start-main-sport>
			{main && sports.length > 1 ? (
				<Button
					type="button"
					variant="ghost"
					aria-label={L.activities.switchMainSport(
						NB_DISCIPLINE_LABELS[main],
						NB_DISCIPLINE_LABELS[sports[1]!],
					)}
					onClick={onSwitch}
					className="text-footnote -mx-3 max-w-full gap-2"
				>
					<span className="text-muted-foreground truncate">
						{L.activities.mainSportLead}{' '}
						<span className="text-foreground font-semibold">
							{NB_DISCIPLINE_LABELS[main]}
						</span>
					</span>
					<span className="text-primary">{L.activities.switchHint}</span>
				</Button>
			) : main ? (
				<p className="text-footnote text-muted-foreground flex min-h-11 items-center">
					<span>
						{L.activities.mainSportLead}{' '}
						<span className="text-foreground font-semibold">
							{NB_DISCIPLINE_LABELS[main]}
						</span>
					</span>
				</p>
			) : null}
		</div>
	)
}
