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
import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useEffect, useState } from 'react'
import { Form } from 'react-router'
import { ErrorList, RadioGroupField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import {
	formatNbDate,
	formatNbDayMonth,
	formatNbVolumeTotal,
} from '#app/utils/format.ts'
import {
	nbPhaseName,
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
import { type WeekView } from '#app/utils/plan-outline/outline-preview.ts'
import {
	PhilosophySwitchFormSchema,
	StrengthOfferFormSchema,
} from '#app/utils/plan-outline/philosophy-schema.ts'
import {
	type PhaseView,
	type PhilosophySwitchPreview,
} from '#app/utils/plan-outline/philosophy.ts'
import {
	PRESET_FAMILIES,
	type PresetFamily,
} from '#app/utils/plan-outline/presets.ts'
import { type StrengthTrackOffer } from '#app/utils/plan-outline/proposal.ts'
import { seasonEditWarningMessage } from '#app/utils/plan-outline/season-edit-words.ts'
import { CollapsibleSection } from './__plan-chrome.tsx'
import { RiseWarningNotice } from './__season-edits.tsx'

/** The preview as the page shows it: the diff and its digest, not the rows. */
export type PhilosophyPreviewView = Omit<
	PhilosophySwitchPreview,
	'rows' | 'edit' | 'ok'
>

/** A week key's calendar day, as a date with no zone to shift it. */
const dayOf = (weekKey: string) => new Date(`${weekKey}T12:00:00Z`)

type LastResult = Parameters<typeof useForm>[0]['lastResult']

export function PhilosophyCard({
	outlineId,
	family,
	preview,
	lastResult,
	confirmResult,
}: {
	outlineId: string
	family: PresetFamily | null
	preview: PhilosophyPreviewView | null
	lastResult: LastResult
	confirmResult: LastResult
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
	// Opened by an answer — a preview to read, a refusal — and the athlete's to
	// close after that.
	const answered = lastResult != null || preview != null
	const [open, setOpen] = useState(answered)
	useEffect(() => {
		if (answered) setOpen(true)
	}, [answered, preview, lastResult])

	return (
		<div className="space-y-3" data-philosophy>
			{family ? (
				<div>
					<p className="text-callout">
						{PHILOSOPHY_SWITCH_LABELS.follows}{' '}
						<strong data-current-philosophy className="font-semibold">
							{PHILOSOPHY_LABELS[family]}
						</strong>
					</p>
					<p className="text-muted-foreground text-footnote">
						{PHILOSOPHY_DESCRIPTIONS[family]}
					</p>
				</div>
			) : (
				// Said, not left blank: a plan that follows none reads as such, and the
				// switch below is how to pick one (audit B4).
				<div data-no-philosophy>
					<p className="text-callout font-semibold">
						{PHILOSOPHY_SWITCH_LABELS.none}
					</p>
					<p className="text-muted-foreground text-footnote">
						{PHILOSOPHY_SWITCH_LABELS.noneHint}
					</p>
				</div>
			)}
			<CollapsibleSection
				summary={PHILOSOPHY_SWITCH_LABELS.open}
				open={open}
				onOpenChange={setOpen}
				contentClassName="pt-2"
			>
				<Form
					method="POST"
					className="space-y-4 pt-2 pb-2"
					aria-label={PHILOSOPHY_SWITCH_LABELS.open}
					{...getFormProps(form)}
					aria-describedby={form.errors ? formErrorId : undefined}
				>
					<input type="hidden" name="intent" value="preview-philosophy" />
					<input type="hidden" name="outlineId" value={outlineId} />
					<p className="text-muted-foreground text-footnote">
						{PHILOSOPHY_SWITCH_LABELS.intro}
					</p>
					{/* `ui/radio-group` choice cards (round 2): the radio is Base UI's, so
					    the family posts under its name as a native radio would, and it is
					    never Chromium's blue one. Each card carries the plain sentence the
					    choice is made on (ADR 0079 S7, a deliberate exception to "one
					    select per enum"). The current philosophy is shown and not
					    offered. */}
					<RadioGroupField
						key={preview?.to ?? 'none'}
						name={fields.family.name}
						legend={PHILOSOPHY_SWITCH_LABELS.choose}
						legendClassName="text-callout font-semibold"
						defaultValue={preview?.to}
						options={PRESET_FAMILIES.map((option) => ({
							value: option,
							label: PHILOSOPHY_LABELS[option],
							description: PHILOSOPHY_DESCRIPTIONS[option],
							disabled: option === family,
						}))}
						errorId={familyErrorId}
						errors={fields.family.errors as string[] | undefined}
					/>
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
					<PhilosophyPreview
						outlineId={outlineId}
						preview={preview}
						lastResult={confirmResult}
					/>
				) : null}
			</CollapsibleSection>
		</div>
	)
}

function PhilosophyPreview({
	outlineId,
	preview,
	lastResult,
}: {
	outlineId: string
	preview: PhilosophyPreviewView
	lastResult: LastResult
}) {
	// The confirm is a form of its own: it posts the preview's digest, so the
	// switch that lands is the one shown, and a refusal is said under it.
	const [form] = useForm({
		id: 'philosophy-confirm',
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PhilosophySwitchFormSchema })
		},
	})
	return (
		<section
			aria-labelledby="philosophy-preview-title"
			className="border-border/70 space-y-4 border-t pt-4 pb-2"
			data-philosophy-preview
		>
			<h3 id="philosophy-preview-title" className="text-callout font-semibold">
				{PHILOSOPHY_SWITCH_LABELS.preview}
			</h3>
			<p className="text-footnote">
				{philosophyPreviewSentence(
					preview.from,
					preview.to,
					formatNbDate(dayOf(preview.fromWeekKey), 'UTC'),
				)}
			</p>
			<RiseWarningNotice
				warnings={preview.warnings.map(seasonEditWarningMessage)}
			/>
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
			<table className="text-footnote w-full text-left tabular-nums">
				<caption className="text-muted-foreground text-caption pb-1 text-left">
					{PHILOSOPHY_SWITCH_LABELS.weeks}
				</caption>
				<thead>
					<tr className="text-muted-foreground text-caption">
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
								{/* The ISO week, as every Sesong surface numbers it, with its
								    Monday beside it. */}
								<span className="block">Uke {isoWeekNumber(week.weekKey)}</span>
								<span className="text-muted-foreground text-caption block">
									{formatNbDayMonth(dayOf(week.weekKey), 'UTC')}
								</span>
							</th>
							<td className="py-1 pr-2">{weekCell(week.before)}</td>
							<td className="py-1" data-after>
								{weekCell(week.after)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="text-muted-foreground text-caption">
				{PHILOSOPHY_SWITCH_LABELS.aroundYours}
			</p>
			<Form
				method="POST"
				className="space-y-2"
				{...getFormProps(form)}
				aria-describedby={form.errors ? form.errorId : undefined}
			>
				<input type="hidden" name="intent" value="switch-philosophy" />
				<input type="hidden" name="outlineId" value={outlineId} />
				<input type="hidden" name="family" value={preview.to} />
				<input type="hidden" name="digest" value={preview.digest} />
				{form.errors ? (
					<div role="alert">
						<ErrorList
							id={form.errorId}
							errors={form.errors as string[] | undefined}
						/>
					</div>
				) : null}
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
			<h4 className="text-muted-foreground text-caption font-medium">
				{title}
			</h4>
			<ul className="text-footnote mt-1 space-y-1">
				{phases.map((phase) => (
					<li key={`${phase.name}-${phase.fromWeekKey}`}>
						<span className="font-medium">{nbPhaseName(phase.name)}</span> ·{' '}
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
				: formatNbVolumeTotal(target.value, target.currency),
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
	lastResult,
}: {
	outlineId: string
	offer: StrengthTrackOffer
	lastResult: LastResult
}) {
	const [form] = useForm({
		id: 'strength-offer',
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: StrengthOfferFormSchema })
		},
	})
	return (
		<Form
			method="POST"
			className="bg-muted/50 space-y-2 rounded-3xl px-4 py-3"
			data-strength-offer
			{...getFormProps(form)}
			aria-describedby={form.errors ? form.errorId : undefined}
		>
			<input type="hidden" name="intent" value="add-strength-track" />
			<input type="hidden" name="outlineId" value={outlineId} />
			<p className="text-callout font-semibold">
				{strengthOfferSentence(offer.sessionsPerWeek)}
			</p>
			<p className="text-muted-foreground text-footnote">
				{strengthOfferDetail(
					offer.anchor.value,
					offer.anchor.derivation.windowWeeks,
				)}
			</p>
			{form.errors ? (
				<div role="alert">
					<ErrorList
						id={form.errorId}
						errors={form.errors as string[] | undefined}
					/>
				</div>
			) : null}
			<Button type="submit" variant="outline" className="w-full sm:w-auto">
				{STRENGTH_OFFER_LABELS.accept}
			</Button>
		</Form>
	)
}
