/**
 * _Filosofi_ on the plan page (#505 stories 10–15): which philosophy the plan
 * follows and what it means, _Bytt filosofi_ behind a preview, and a strength
 * track offered from the athlete's own lifting.
 *
 * Split out of `plan.tsx` like the other editors: the route owns the loader
 * and the action (`preview-philosophy`, `switch-philosophy`,
 * `add-strength-track`), this module owns the controls. The switch is two
 * steps on purpose: the first posts the chosen family for a
 * _Forhåndsvisning_ and writes nothing; only the confirm under that preview
 * switches, and the server recomputes the very preview it showed rather than
 * trusting it back from the form.
 */
import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Form } from 'react-router'
import { ErrorList } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	formatDate,
	formatDayMonth,
	formatVolumeTotal,
} from '#app/utils/format.ts'
import {
	nbWeeks,
	PHILOSOPHY_DESCRIPTIONS,
	PHILOSOPHY_LABELS,
	PHILOSOPHY_SWITCH_LABELS,
	philosophyPreviewSentence,
	plainMixSentence,
	STRENGTH_OFFER_LABELS,
	strengthOfferDetail,
	strengthOfferSentence,
	switchToLabel,
	NB_WEEK_ROLE_LABELS,
} from '#app/utils/labels.ts'
import { PhilosophySwitchFormSchema } from '#app/utils/plan-outline/philosophy-schema.ts'
import {
	type PhaseView,
	type PhilosophySwitchPreview,
	type WeekView,
} from '#app/utils/plan-outline/philosophy.ts'
import {
	PRESET_FAMILIES,
	type PresetFamily,
} from '#app/utils/plan-outline/presets.ts'
import { type StrengthTrackOffer } from '#app/utils/plan-outline/proposal.ts'

/** The preview as the page shows it: the diff, without the rows behind it. */
export type PhilosophyPreviewView = Omit<
	PhilosophySwitchPreview,
	'rows' | 'edit' | 'ok'
>

/** A week key's calendar day, as a date with no zone to shift it. */
const dayOf = (weekKey: string) => new Date(`${weekKey}T12:00:00Z`)

export function PhilosophyCard({
	outlineId,
	family,
	preview,
	lastResult,
}: {
	outlineId: string
	family: PresetFamily | null
	preview: PhilosophyPreviewView | null
	lastResult: Parameters<typeof useForm>[0]['lastResult']
}) {
	const [form, fields] = useForm({
		id: 'philosophy-switch',
		constraint: getZodConstraint(PhilosophySwitchFormSchema),
		lastResult,
		defaultValue: { family: preview?.to },
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PhilosophySwitchFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const familyErrorId = `${fields.family.id}-error`
	const formErrorId = form.errorId

	return (
		<div className="space-y-3" data-philosophy>
			{family ? (
				<div>
					<p className="text-sm">
						{PHILOSOPHY_SWITCH_LABELS.follows}{' '}
						<strong data-current-philosophy>{PHILOSOPHY_LABELS[family]}</strong>
					</p>
					<p className="text-muted-foreground text-sm">
						{PHILOSOPHY_DESCRIPTIONS[family]}
					</p>
				</div>
			) : null}
			<details
				className="border-border/70 rounded-xl border px-4 py-2"
				open={lastResult != null || preview != null}
			>
				<summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
					{PHILOSOPHY_SWITCH_LABELS.open}
				</summary>
				<Form
					method="POST"
					className="space-y-4 pt-2 pb-2"
					aria-label={PHILOSOPHY_SWITCH_LABELS.open}
					{...getFormProps(form)}
					aria-describedby={form.errors ? formErrorId : undefined}
				>
					<input type="hidden" name="intent" value="preview-philosophy" />
					<input type="hidden" name="outlineId" value={outlineId} />
					<p className="text-muted-foreground text-sm">
						{PHILOSOPHY_SWITCH_LABELS.intro}
					</p>
					<fieldset
						className="space-y-2"
						aria-invalid={fields.family.errors ? true : undefined}
						aria-describedby={fields.family.errors ? familyErrorId : undefined}
					>
						<legend className="text-sm font-medium">
							{PHILOSOPHY_SWITCH_LABELS.choose}
						</legend>
						{PRESET_FAMILIES.map((option) => {
							const descriptionId = `philosophy-${option}-description`
							return (
								<label
									key={option}
									className="flex min-h-11 cursor-pointer items-start gap-3 py-1"
								>
									<input
										{...getInputProps(fields.family, {
											type: 'radio',
											value: option,
										})}
										aria-describedby={descriptionId}
										disabled={option === family}
										className="mt-1 size-4"
									/>
									<span>
										<span className="block text-sm font-medium">
											{PHILOSOPHY_LABELS[option]}
										</span>
										<span
											id={descriptionId}
											className="text-muted-foreground block text-sm"
										>
											{PHILOSOPHY_DESCRIPTIONS[option]}
										</span>
									</span>
								</label>
							)
						})}
						<ErrorList
							id={familyErrorId}
							errors={fields.family.errors as string[] | undefined}
						/>
					</fieldset>
					{form.errors ? (
						<div role="alert">
							<ErrorList
								id={formErrorId}
								errors={form.errors as string[] | undefined}
							/>
						</div>
					) : null}
					<Button type="submit" variant="outline" className="w-full">
						{PHILOSOPHY_SWITCH_LABELS.showPreview}
					</Button>
				</Form>
				{preview ? (
					<PhilosophyPreview outlineId={outlineId} preview={preview} />
				) : null}
			</details>
		</div>
	)
}

function PhilosophyPreview({
	outlineId,
	preview,
}: {
	outlineId: string
	preview: PhilosophyPreviewView
}) {
	return (
		<section
			aria-labelledby="philosophy-preview-title"
			className="border-border/70 space-y-4 border-t pt-4 pb-2"
			data-philosophy-preview
		>
			<h3 id="philosophy-preview-title" className="text-sm font-semibold">
				{PHILOSOPHY_SWITCH_LABELS.preview}
			</h3>
			<p className="text-sm">
				{philosophyPreviewSentence(
					preview.from,
					preview.to,
					formatDate(dayOf(preview.fromWeekKey), 'UTC'),
				)}
			</p>
			<div className="grid gap-3 sm:grid-cols-2">
				<PhaseList
					title={PHILOSOPHY_SWITCH_LABELS.before}
					phases={preview.phases.before}
				/>
				<PhaseList
					title={PHILOSOPHY_SWITCH_LABELS.after}
					phases={preview.phases.after}
				/>
			</div>
			<table className="w-full text-left text-sm tabular-nums">
				<caption className="text-muted-foreground pb-1 text-left text-xs">
					{PHILOSOPHY_SWITCH_LABELS.weeks}
				</caption>
				<thead>
					<tr className="text-muted-foreground text-xs">
						<th scope="col" className="py-1 font-medium">
							{PHILOSOPHY_SWITCH_LABELS.weekColumn}
						</th>
						<th scope="col" className="py-1 font-medium">
							{PHILOSOPHY_SWITCH_LABELS.before}
						</th>
						<th scope="col" className="py-1 font-medium">
							{PHILOSOPHY_SWITCH_LABELS.after}
						</th>
					</tr>
				</thead>
				<tbody>
					{preview.weeks.map((week) => (
						<tr key={week.weekKey} className="border-border/50 border-t">
							<th scope="row" className="py-1 pr-2 font-normal">
								{formatDayMonth(dayOf(week.weekKey), 'UTC')}
							</th>
							<td className="py-1 pr-2">{weekCell(week.before)}</td>
							<td className="py-1" data-after>
								{weekCell(week.after)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<Form method="POST" className="flex flex-col gap-2 sm:flex-row">
				<input type="hidden" name="intent" value="switch-philosophy" />
				<input type="hidden" name="outlineId" value={outlineId} />
				<input type="hidden" name="family" value={preview.to} />
				<Button type="submit" className="w-full sm:w-auto">
					{switchToLabel(preview.to)}
				</Button>
			</Form>
		</section>
	)
}

function PhaseList({ title, phases }: { title: string; phases: PhaseView[] }) {
	return (
		<div>
			<h4 className="text-muted-foreground text-xs font-medium">{title}</h4>
			<ul className="mt-1 space-y-1 text-sm">
				{phases.map((phase) => (
					<li key={`${phase.name}-${phase.fromWeekKey}`}>
						<span className="font-medium">{phase.name}</span> ·{' '}
						{nbWeeks(phase.weeks)} · {plainMixSentence(phase.mix)}
					</li>
				))}
			</ul>
		</div>
	)
}

/** One side of one week: its role and each track's target. */
function weekCell(week: WeekView | null): string {
	if (!week) return PHILOSOPHY_SWITCH_LABELS.ended
	const targets = week.targets
		.map((target) =>
			target.value == null
				? '–'
				: formatVolumeTotal(target.value, target.currency),
		)
		.join(' · ')
	return `${targets} · ${NB_WEEK_ROLE_LABELS[week.role]}`
}

/**
 * A strength track offered from the athlete's own lifting (#505 story 15):
 * one sentence and one button. Shown only when there is an offer — no lifting,
 * no line.
 */
export function StrengthTrackOfferCard({
	outlineId,
	offer,
}: {
	outlineId: string
	offer: StrengthTrackOffer
}) {
	return (
		<Form
			method="POST"
			className="border-border/70 space-y-2 rounded-xl border px-4 py-3"
			data-strength-offer
		>
			<input type="hidden" name="intent" value="add-strength-track" />
			<input type="hidden" name="outlineId" value={outlineId} />
			<p className="text-sm font-medium">
				{strengthOfferSentence(offer.sessionsPerWeek)}
			</p>
			<p className="text-muted-foreground text-sm">
				{strengthOfferDetail(
					offer.anchor.value,
					offer.anchor.derivation.windowWeeks,
				)}
			</p>
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				{STRENGTH_OFFER_LABELS.accept}
			</Button>
		</Form>
	)
}
