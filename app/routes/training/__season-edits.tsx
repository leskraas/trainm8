/**
 * _Endre sesongen_ on the plan page (#505 stories 72–77, #673): a track's
 * Season Anchor (_Endre startnivået_, ADR 0121), a week's target (or back to
 * the plan's own), a phase's name, length and rhythm, and which week of a
 * block is the easy one — each behind a _Forhåndsvisning_ that shows the
 * weeks that change, warns where a target would rise more than 10 % over the
 * hard week before it, and says which numbers stay. (The fourth Sesong edit,
 * the philosophy, is `__philosophy-switch.tsx`, built the same way.)
 *
 * This is the **only** place those numbers are edited: the Blocks and Weeks
 * readings show them and link here with {@link SeasonEditLink}, which opens
 * the matching edit pre-filled through the URL (`?edit=…`).
 *
 * Split out of `plan.tsx` like the other editors: the route owns the loader
 * and the action (`preview-season-edit`, `apply-season-edit`), this module
 * owns the controls. Each edit is two steps on purpose: the first posts the
 * edit for a preview and writes nothing; only the confirm under that preview
 * applies, carrying the preview's digest, and the server recomputes the very
 * preview it showed rather than trusting it back from the form. A preview
 * whose form has changed since is hidden, so the confirm under it can never
 * apply something other than what the fields say.
 */
import {
	getFormProps,
	getInputProps,
	useForm,
	type SubmissionResult,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { useEffect, useRef, useState } from 'react'
import {
	Form,
	Link,
	useLocation,
	useNavigation,
	useSearchParams,
} from 'react-router'
import { type z } from 'zod/v3'
import {
	ErrorList,
	Field,
	RadioGroupField,
	SelectField,
} from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { formatNbDayMonth, formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	nbTrackName,
	NB_RHYTHM_CHOICE_LABELS,
	NB_VOLUME_UNITS,
	NB_WEEK_ROLE_LABELS,
	nbPhaseName,
	nbWeeks,
	SEASON_ANCHOR_EDIT_LABELS,
	SEASON_EDIT_LABELS,
	SEASON_EDIT_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import {
	RHYTHMS,
	roundToCurrency,
	type Rhythm,
	type VolumeCurrency,
	type WeekRole,
} from '#app/utils/plan-outline/derive.ts'
import {
	type TargetView,
	type WeekView,
} from '#app/utils/plan-outline/outline-preview.ts'
import { anchorInForceAt } from '#app/utils/plan-outline/season-anchors.ts'
import {
	EasyWeekEditFormSchema,
	PhaseEditFormSchema,
	SEASON_EDIT_FORM_SCHEMAS,
	SeasonAnchorEditFormSchema,
	WeekTargetEditFormSchema,
} from '#app/utils/plan-outline/season-edit-schema.ts'
import { type ApplySeasonEditRefusal } from '#app/utils/plan-outline/season-edit.server.ts'
import {
	SEASON_EDIT_KINDS,
	type SeasonAnchorChoice,
	type SeasonAnchorEdit,
	type SeasonEdit,
	type SeasonEditKind,
	type SeasonEditPreview,
} from '#app/utils/plan-outline/season-edit.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import {
	COLLAPSIBLE_CHEVRON,
	CollapsibleSection,
	ROW_PRESS,
} from './__plan-chrome.tsx'

/** The preview as the page shows it: the diff, worded, and its digest. */
export type SeasonEditPreviewView = Pick<
	SeasonEditPreview,
	'kind' | 'weeks' | 'digest'
> & {
	/** What the edit does and what stays, as one sentence (story 77). */
	message: string
	/** One sentence per loading week rising more than 10 % (story 76). */
	warnings: string[]
	/** The edit as posted, so the confirm posts the same one. */
	edit: SeasonEdit
	/** A Season Anchor edit's rows and held weeks, worded (ADR 0121 §1). */
	anchor?: SeasonAnchorPreviewView
}

/** A Season Anchor preview as the page shows it, already worded. */
export type SeasonAnchorPreviewView = {
	unit: string
	/** `29 uker får nytt mål`, on the sticky confirm. */
	changedWeeks: string
	/** Each week of the edited track whose target changes. */
	rows: Array<{
		weekKey: string
		weekNumber: number
		/** `lett uke · Base` */
		where: string
		before: string
		after: string
		/** Hand-set (`Satt selv`) rather than derived (`regnet ut`). */
		authored: boolean
		/** How a derived after-value was worked out, one tap away. */
		how: string | null
	}>
	/** Week Volume Overrides the edit leaves as they are. */
	held: Array<{ weekKey: string; weekNumber: number; figure: string }>
}

/** What the action answers a Sesong edit with. */
export type SeasonEditReply = {
	edit: SeasonEditKind
	result?: SubmissionResult<string[]>
	confirmResult?: SubmissionResult<string[]>
	preview?: SeasonEditPreviewView
	/** Why the preview was refused, when it was. */
	refusal?: ApplySeasonEditRefusal
	/** The edit the domain offers instead of a refused one (`segment-lived`). */
	offer?: SeasonAnchorEdit
	/** The preview was asked for from a refusal's offer: re-fill the form. */
	fromOffer?: boolean
	/** The confirm was refused as stale; the preview shown is no longer true. */
	stale?: boolean
}

type SeasonWeek = {
	weekKey: string
	phaseIndex: number
	role: WeekRole
	/** `overridden`: the athlete set this week's target themselves (ADR 0044 §5). */
	targets: Array<Omit<TargetView, 'overridden'> & { overridden?: boolean }>
}

type SeasonPhase = {
	id: string
	name: string
	weeks: number
	rhythm: Rhythm
	tapers: boolean
	fromWeekKey: string
}

type SeasonTrack = {
	trackId: string
	discipline: Discipline
	currency: VolumeCurrency
}

/** The fields the URL may pre-fill an edit with (`SeasonEditLink`). */
const LINK_FIELDS = ['weekKey', 'trackId', 'phaseId'] as const
const ANCHOR = 'season-edits'

/**
 * Where a link into an edit lands: the card, or — for the Season Anchor edit,
 * which the lead opens directly (#673) — the edit itself.
 */
export function seasonEditAnchor(edit: SeasonEditKind): string {
	return edit === 'season-anchor' ? SEASON_ANCHOR_EDIT_ID : ANCHOR
}
const SEASON_ANCHOR_EDIT_ID = 'season-edit-season-anchor'

/** A week key's calendar day, as a date with no zone to shift it. */
const dayOf = (weekKey: string) => new Date(`${weekKey}T12:00:00Z`)

function weekLabel(weekKey: string): string {
	return `Uke ${isoWeekNumber(weekKey)} · ${formatNbDayMonth(dayOf(weekKey), 'UTC')}`
}

/**
 * Each track's target, in its own unit — named by its sport when the plan has
 * more than one, so `44 km · 12 sett` never leaves the reader guessing.
 */
function targetsLabel(
	targets: Array<Pick<TargetView, 'discipline' | 'currency' | 'value'>>,
): string {
	const named = targets.length > 1
	return targets
		.map((target) => {
			const figure =
				target.value == null
					? '–'
					: `${formatNbVolumeFigure(target.value, target.currency)} ${NB_VOLUME_UNITS[target.currency]}`
			return named ? `${nbTrackName(target.discipline)} ${figure}` : figure
		})
		.join(' · ')
}

/**
 * A text link into an edit is a line of text (20 px: the footnote step's own
 * 18 px line is lifted to `leading-5`) and the only way into its edit, so it
 * carries an invisible `after:` box 12 px above and below: 44 px of
 * target with no change to the reading's rhythm (ADR 0028 §2). `my-2.5` is what keeps two of
 * them stacked in a flex column (a phase card's pair) from reaching into each
 * other's text: 24 px between lines is exactly the two extensions. On a link in
 * running text the margin does nothing.
 */
const SEASON_EDIT_LINK_CLASS =
	'relative my-2.5 w-fit text-footnote leading-5 underline touch-manipulation after:absolute after:inset-x-0 after:-inset-y-3'

/**
 * A link from a read-only reading (Blocks, Weeks) to the edit that changes
 * what it shows, pre-filled: the page's own query kept, the edit and its
 * fields added, and the card scrolled to.
 */
export function SeasonEditLink({
	edit,
	fields,
	children,
	className,
	'aria-label': ariaLabel,
}: {
	edit: SeasonEditKind
	fields: Partial<Record<(typeof LINK_FIELDS)[number], string>>
	children: React.ReactNode
	className?: string
	'aria-label'?: string
}) {
	const location = useLocation()
	const params = new URLSearchParams(location.search)
	params.set('edit', edit)
	for (const name of LINK_FIELDS) {
		const value = fields[name]
		if (value) params.set(name, value)
		else params.delete(name)
	}
	return (
		<Link
			to={{ search: `?${params.toString()}`, hash: seasonEditAnchor(edit) }}
			className={className ?? SEASON_EDIT_LINK_CLASS}
			aria-label={ariaLabel}
			data-season-edit-link={edit}
		>
			{children}
		</Link>
	)
}

/** The edit the URL asks for, with the fields it pre-fills, if any. */
function useRequestedEdit() {
	const [params] = useSearchParams()
	const edit = SEASON_EDIT_KINDS.find((kind) => kind === params.get('edit'))
	if (!edit) return null
	const fields: Record<string, string> = {}
	for (const name of LINK_FIELDS) {
		const value = params.get(name)
		if (value) fields[name] = value
	}
	return { edit, fields }
}

export function SeasonEditsCard({
	outlineId,
	weeks,
	phases,
	tracks,
	anchorChoices = [],
	firstUnbegunWeekKey,
	reply,
}: {
	outlineId: string
	weeks: SeasonWeek[]
	phases: SeasonPhase[]
	tracks: SeasonTrack[]
	/** The tracks _Endre startnivået_ takes (ADR 0121 §1). */
	anchorChoices?: SeasonAnchorChoice[]
	firstUnbegunWeekKey: string
	reply: SeasonEditReply | null
}) {
	const requested = useRequestedEdit()
	// Weeks already begun are history: no edit is offered on them.
	const open = weeks.filter((week) => week.weekKey >= firstUnbegunWeekKey)
	// Only a phase whose rhythm has an easy week can have it moved.
	const easyChoices = open.filter((week) => {
		const phase = phases[week.phaseIndex]
		return phase != null && phase.rhythm !== 'none' && !phase.tapers
	})
	const replyFor = (kind: SeasonEditKind) =>
		reply?.edit === kind ? reply : null
	// The URL's request opens its edit, unless the action has answered another.
	const requestFor = (kind: SeasonEditKind) =>
		reply == null && requested?.edit === kind ? requested.fields : null
	const requestKey = (kind: SeasonEditKind) =>
		`${kind}:${JSON.stringify(requested?.edit === kind ? requested.fields : null)}`

	return (
		<div className="space-y-3" data-season-edits>
			<p className="text-muted-foreground text-footnote">
				{SEASON_EDIT_LABELS.intro}
			</p>
			{/* The anchor first: it is the formula's first term (ADR 0040 §3), and
			    the lead's Endre volumet lands here (#673). */}
			{anchorChoices.some((track) => track.weeks.length > 0) ? (
				<SeasonAnchorEdit
					// A link from the lead re-fills the form, so it remounts on one.
					key={requestKey('season-anchor')}
					outlineId={outlineId}
					tracks={anchorChoices.filter((track) => track.weeks.length > 0)}
					firstUnbegunWeekKey={firstUnbegunWeekKey}
					reply={replyFor('season-anchor')}
					requested={requestFor('season-anchor')}
				/>
			) : null}
			{tracks.length > 0 && open.length > 0 ? (
				<WeekTargetEdit
					// A link from a reading re-fills the form, so it remounts on one.
					key={requestKey('week-target')}
					outlineId={outlineId}
					weeks={open}
					tracks={tracks}
					reply={replyFor('week-target')}
					requested={requestFor('week-target')}
				/>
			) : null}
			{phases.length > 0 ? (
				<PhaseEdit
					// A link from a reading re-fills the form, so it remounts on one.
					key={requestKey('phase')}
					outlineId={outlineId}
					phases={phases}
					reply={replyFor('phase')}
					requested={requestFor('phase')}
				/>
			) : null}
			{easyChoices.length > 0 ? (
				<EasyWeekEdit
					// A link from a reading re-fills the form, so it remounts on one.
					key={requestKey('easy-week')}
					outlineId={outlineId}
					weeks={easyChoices}
					phases={phases}
					reply={replyFor('easy-week')}
					requested={requestFor('easy-week')}
				/>
			) : null}
		</div>
	)
}

type EditProps = {
	outlineId: string
	reply: SeasonEditReply | null
	requested: Record<string, string> | null
}

function WeekTargetEdit({
	outlineId,
	weeks,
	tracks,
	reply,
	requested,
}: EditProps & { weeks: SeasonWeek[]; tracks: SeasonTrack[] }) {
	const [form, fields] = useForm<
		z.input<typeof WeekTargetEditFormSchema>,
		z.output<typeof WeekTargetEditFormSchema>
	>({
		id: 'season-edit-week-target',
		constraint: getZodConstraint(WeekTargetEditFormSchema),
		lastResult: reply?.result,
		defaultValue: defaultsOf(reply, requested),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: WeekTargetEditFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const onlyTrack = tracks.length === 1 ? tracks[0]! : null
	const chosen = weeks.find((week) => week.weekKey === form.value?.weekKey)
	const chosenTrackId = onlyTrack?.trackId ?? form.value?.trackId
	// The way back is offered only where there is something to go back from: a
	// target the athlete set on this week and this track (audit B10). Elsewhere
	// it would preview "nothing changes".
	const handSet =
		chosen?.targets.find((target) => target.trackId === chosenTrackId)
			?.overridden === true
	const hintId = 'season-edit-week-target-revert-hint'
	return (
		<EditShell
			kind="week-target"
			summary={SEASON_EDIT_LABELS.weekTargetOpen}
			outlineId={outlineId}
			reply={reply}
			open={requested != null}
			formValue={form.value}
			formProps={getFormProps(form)}
			formErrors={form.errors}
			formErrorId={form.errorId}
			extraActions={
				handSet ? (
					<>
						<Button
							type="submit"
							name="revert"
							value="on"
							variant="ghost"
							className="w-full"
							aria-describedby={hintId}
						>
							{SEASON_EDIT_LABELS.revert}
						</Button>
						<p
							id={hintId}
							className="text-muted-foreground text-caption font-normal"
						>
							{SEASON_EDIT_LABELS.revertHint}
						</p>
					</>
				) : null
			}
		>
			<SelectField
				meta={fields.weekKey}
				labelProps={{
					children: SEASON_EDIT_LABELS.week,
					className: 'text-callout',
				}}
				items={weeks.map((week) => ({
					value: week.weekKey,
					label: weekLabel(week.weekKey),
				}))}
			/>
			{chosen ? (
				<p
					className="text-muted-foreground text-footnote"
					data-season-edit-current
				>
					{SEASON_EDIT_LABELS.now}: {targetsLabel(chosen.targets)}
				</p>
			) : null}
			{onlyTrack ? (
				<input
					type="hidden"
					name={fields.trackId.name}
					value={onlyTrack.trackId}
				/>
			) : (
				<SelectField
					meta={fields.trackId}
					labelProps={{
						children: SEASON_EDIT_LABELS.track,
						className: 'text-callout',
					}}
					items={tracks.map((track) => ({
						value: track.trackId,
						label: `${nbTrackName(track.discipline)} (${NB_VOLUME_UNITS[track.currency]})`,
					}))}
				/>
			)}
			<Field
				labelProps={{
					children: onlyTrack
						? `${SEASON_EDIT_LABELS.newTarget} (${NB_VOLUME_UNITS[onlyTrack.currency]})`
						: SEASON_EDIT_LABELS.newTarget,
				}}
				inputProps={{
					...getInputProps(fields.value, { type: 'text' }),
					inputMode: 'decimal',
					autoComplete: 'off',
					className: 'text-body',
				}}
				errors={fields.value.errors}
			/>
		</EditShell>
	)
}

function PhaseEdit({
	outlineId,
	phases,
	reply,
	requested,
}: EditProps & { phases: SeasonPhase[] }) {
	const [form, fields] = useForm<
		z.input<typeof PhaseEditFormSchema>,
		z.output<typeof PhaseEditFormSchema>
	>({
		id: 'season-edit-phase',
		constraint: getZodConstraint(PhaseEditFormSchema),
		lastResult: reply?.result,
		defaultValue: defaultsOf(reply, requested),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: PhaseEditFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const keep = { value: '', label: SEASON_EDIT_LABELS.keep }
	return (
		<EditShell
			kind="phase"
			summary={SEASON_EDIT_LABELS.phaseOpen}
			outlineId={outlineId}
			reply={reply}
			open={requested != null}
			formValue={form.value}
			formProps={getFormProps(form)}
			formErrors={form.errors}
			formErrorId={form.errorId}
		>
			<SelectField
				meta={fields.phaseId}
				labelProps={{
					children: SEASON_EDIT_LABELS.phase,
					className: 'text-callout',
				}}
				items={phases.map((phase) => ({
					value: phase.id,
					label: `${nbPhaseName(phase.name)} · ${nbWeeks(phase.weeks)} · fra ${formatNbDayMonth(dayOf(phase.fromWeekKey), 'UTC')}`,
				}))}
			/>
			<p className="text-muted-foreground text-caption font-normal">
				{SEASON_EDIT_LABELS.phaseHint}
			</p>
			<Field
				labelProps={{ children: SEASON_EDIT_LABELS.phaseName }}
				inputProps={{
					...getInputProps(fields.name, { type: 'text' }),
					autoComplete: 'off',
					className: 'text-body',
				}}
				errors={fields.name.errors}
			/>
			<Field
				labelProps={{ children: SEASON_EDIT_LABELS.phaseWeeks }}
				inputProps={{
					...getInputProps(fields.weeks, { type: 'text' }),
					inputMode: 'numeric',
					autoComplete: 'off',
					className: 'text-body',
				}}
				errors={fields.weeks.errors}
			/>
			<SelectField
				meta={fields.rhythm}
				labelProps={{
					children: SEASON_EDIT_LABELS.phaseRhythm,
					className: 'text-callout',
				}}
				placeholder={SEASON_EDIT_LABELS.keep}
				items={[
					keep,
					...RHYTHMS.map((rhythm) => ({
						value: rhythm,
						label: NB_RHYTHM_CHOICE_LABELS[rhythm],
					})),
				]}
			/>
			<SelectField
				meta={fields.tapers}
				labelProps={{
					children: SEASON_EDIT_LABELS.phaseTapers,
					className: 'text-callout',
				}}
				placeholder={SEASON_EDIT_LABELS.keep}
				items={[
					keep,
					{ value: 'yes', label: SEASON_EDIT_LABELS.yes },
					{ value: 'no', label: SEASON_EDIT_LABELS.no },
				]}
			/>
		</EditShell>
	)
}

function EasyWeekEdit({
	outlineId,
	weeks,
	phases,
	reply,
	requested,
}: EditProps & { weeks: SeasonWeek[]; phases: SeasonPhase[] }) {
	const [form, fields] = useForm<
		z.input<typeof EasyWeekEditFormSchema>,
		z.output<typeof EasyWeekEditFormSchema>
	>({
		id: 'season-edit-easy-week',
		constraint: getZodConstraint(EasyWeekEditFormSchema),
		lastResult: reply?.result,
		defaultValue: defaultsOf(reply, requested),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EasyWeekEditFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const chosen = weeks.find((week) => week.weekKey === form.value?.weekKey)
	return (
		<EditShell
			kind="easy-week"
			summary={SEASON_EDIT_LABELS.easyWeekOpen}
			outlineId={outlineId}
			reply={reply}
			open={requested != null}
			formValue={form.value}
			formProps={getFormProps(form)}
			formErrors={form.errors}
			formErrorId={form.errorId}
		>
			{/* Short enough for a phone's trigger: the week and its role. Which
			    phase it sits in is said under the field once a week is chosen. */}
			<SelectField
				meta={fields.weekKey}
				labelProps={{
					children: SEASON_EDIT_LABELS.easyWeek,
					className: 'text-callout',
				}}
				items={weeks.map((week) => ({
					value: week.weekKey,
					label: `Uke ${isoWeekNumber(week.weekKey)} · ${NB_WEEK_ROLE_LABELS[week.role]}`,
				}))}
			/>
			{chosen ? (
				<p
					className="text-muted-foreground text-footnote"
					data-season-edit-current
				>
					{weekLabel(chosen.weekKey)} ·{' '}
					{nbPhaseName(phases[chosen.phaseIndex]?.name ?? '')}
				</p>
			) : null}
			<p className="text-muted-foreground text-caption font-normal">
				{SEASON_EDIT_LABELS.easyWeekHint}
			</p>
		</EditShell>
	)
}

/**
 * What the edit's form starts with: the edit a preview is showing, else what
 * the URL asked for (`SeasonEditLink`), else nothing.
 */
function defaultsOf(
	reply: SeasonEditReply | null,
	requested: Record<string, string> | null,
) {
	if (reply?.preview) return formValues(reply.preview.edit)
	return requested ?? undefined
}

/**
 * Whether the form still says what the preview was made from. Any field
 * changed since — a week, a number, a phase — and the preview is someone
 * else's: it is hidden rather than confirmed.
 */
function previewStillShown(
	formValue: Record<string, unknown> | undefined,
	edit: SeasonEdit,
): boolean {
	const shown = formValues(edit)
	return Object.entries(shown).every(([name, value]) => {
		// The revert is a button, not a field; the value it leaves blank is not
		// the form's to keep.
		if (name === 'revert' || (shown.revert && name === 'value')) return true
		const current = formValue?.[name]
		const typed = typeof current === 'string' ? current : ''
		if (typed === value) return true
		// A figure is the number it says, not how it was typed: `45.5`, `45,50`
		// and ` 45,5` are the `45,5` the preview was made from, as the schema
		// reads them.
		return /value$/i.test(name) && sameTypedNumber(typed, value)
	})
}

function sameTypedNumber(typed: string, shown: string): boolean {
	const read = (raw: string) =>
		raw.trim() === '' ? NaN : Number(raw.trim().replace(',', '.'))
	const a = read(typed)
	return Number.isFinite(a) && a === read(shown)
}

/**
 * One edit: a disclosure holding its form, and — once the action answered
 * with one, and while the form still says what it was made from — the preview
 * and its confirm.
 */
function EditShell({
	kind,
	summary,
	detail,
	outlineId,
	reply,
	open,
	formValue,
	formProps,
	formErrors,
	formErrorId,
	extraActions,
	afterForm,
	children,
}: {
	kind: SeasonEditKind
	summary: string
	/** One line under the closed row's name. */
	detail?: string
	outlineId: string
	reply: SeasonEditReply | null
	/** Opened by the URL (`SeasonEditLink`) as well as by an answer. */
	open: boolean
	formValue: Record<string, unknown> | undefined
	formProps: ReturnType<typeof getFormProps>
	formErrors: string[] | undefined
	formErrorId: string
	extraActions?: React.ReactNode
	/** Below the form, above the preview: a refusal's own form (its offer). */
	afterForm?: React.ReactNode
	children: React.ReactNode
}) {
	// A stale confirm answers with no preview: the one the athlete confirmed
	// stays in view, marked as no longer true (#673's design), so it is kept.
	const [kept, setKept] = useState(reply?.preview ?? null)
	useEffect(() => {
		if (reply?.preview) setKept(reply.preview)
		else if (!reply?.stale) setKept(null)
	}, [reply])
	const preview = reply?.stale ? kept : (reply?.preview ?? null)
	const shown =
		preview != null && previewStillShown(formValue, preview.edit)
			? preview
			: null
	// Opened by a link from a reading or by the action's answer, and the
	// athlete's to close after that: an answer — a preview, a refusal — cannot
	// sit behind a closed row, or the edit looks lost.
	const answered = reply != null || open
	const [isOpen, setOpen] = useState(answered)
	useEffect(() => {
		if (answered) setOpen(true)
	}, [answered, reply])
	return (
		<div
			data-season-edit={kind}
			id={kind === 'season-anchor' ? SEASON_ANCHOR_EDIT_ID : undefined}
			className="scroll-mt-4"
		>
			<CollapsibleSection
				summary={summary}
				detail={detail}
				open={isOpen}
				onOpenChange={setOpen}
				contentClassName="pt-2"
			>
				<Form
					method="POST"
					className="space-y-4 pt-2 pb-2"
					aria-label={summary}
					{...formProps}
					aria-describedby={formErrors ? formErrorId : undefined}
				>
					<input type="hidden" name="intent" value="preview-season-edit" />
					<input type="hidden" name="edit" value={kind} />
					<input type="hidden" name="outlineId" value={outlineId} />
					{children}
					{formErrors ? (
						<div role="alert">
							<ErrorList id={formErrorId} errors={formErrors} />
						</div>
					) : null}
					<Button type="submit" variant="outline" className="w-full">
						{SEASON_EDIT_LABELS.showPreview}
					</Button>
					{extraActions}
				</Form>
				{afterForm}
				{shown && kind === 'season-anchor' && shown.anchor ? (
					<SeasonAnchorPreviewPanel
						key={shown.digest}
						outlineId={outlineId}
						preview={shown}
						anchor={shown.anchor}
						stale={reply?.stale === true}
						lastResult={reply?.confirmResult}
					/>
				) : shown ? (
					<SeasonEditPreviewPanel
						key={shown.digest}
						kind={kind}
						outlineId={outlineId}
						preview={shown}
						lastResult={reply?.confirmResult}
					/>
				) : null}
			</CollapsibleSection>
		</div>
	)
}

/** The edit's fields as the form posts them; null is blank, "keep it". */
function formValues(edit: SeasonEdit): Record<string, string> {
	switch (edit.kind) {
		case 'week-target':
			return edit.value == null
				? {
						weekKey: edit.weekKey,
						trackId: edit.trackId,
						value: '',
						revert: 'on',
					}
				: {
						weekKey: edit.weekKey,
						trackId: edit.trackId,
						value: String(edit.value).replace('.', ','),
					}
		case 'phase':
			return {
				phaseId: edit.phaseId,
				name: edit.name ?? '',
				weeks: edit.weeks == null ? '' : String(edit.weeks),
				rhythm: edit.rhythm ?? '',
				tapers: edit.tapers == null ? '' : edit.tapers ? 'yes' : 'no',
			}
		case 'easy-week':
			return { weekKey: edit.weekKey }
		case 'season-anchor':
			return edit.action === 'remove'
				? {
						trackId: edit.trackId,
						action: 'remove',
						removeWeekKey: edit.fromWeekKey,
					}
				: {
						trackId: edit.trackId,
						action: edit.action,
						[`${edit.action}WeekKey`]: edit.fromWeekKey,
						[`${edit.action}Value`]: String(edit.value).replace('.', ','),
					}
	}
}

function SeasonEditPreviewPanel({
	kind,
	outlineId,
	preview,
	lastResult,
}: {
	kind: SeasonEditKind
	outlineId: string
	preview: SeasonEditPreviewView
	lastResult: SubmissionResult<string[]> | undefined
}) {
	const schema = SEASON_EDIT_FORM_SCHEMAS[kind]
	// The confirm is a form of its own: it posts the preview's digest, so the
	// edit that lands is the one shown, and a refusal is said under it.
	const [form] = useForm({
		id: `season-edit-${kind}-confirm`,
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
	})
	const titleId = `season-edit-${kind}-preview-title`
	const messageId = `season-edit-${kind}-preview-message`
	return (
		<section
			aria-labelledby={titleId}
			className="border-border/70 space-y-4 border-t pt-4 pb-2"
			data-season-edit-preview
		>
			<h3 id={titleId} className="text-callout font-semibold">
				{SEASON_EDIT_LABELS.preview}
			</h3>
			<p id={messageId} className="text-footnote" data-season-edit-message>
				{preview.message}
			</p>
			<RiseWarningNotice warnings={preview.warnings} />
			{preview.weeks.length > 0 ? (
				<table className="text-footnote w-full text-left tabular-nums">
					<caption className="text-muted-foreground text-caption pb-1 text-left font-normal">
						{SEASON_EDIT_LABELS.weeks}
					</caption>
					<thead>
						<tr className="text-muted-foreground text-caption font-normal">
							<th scope="col" className="py-1 pr-2 font-medium">
								{SEASON_EDIT_LABELS.weekColumn}
							</th>
							<th scope="col" className="py-1 font-medium">
								{SEASON_EDIT_LABELS.before}
							</th>
							<th scope="col" className="py-1 font-medium">
								{SEASON_EDIT_LABELS.after}
							</th>
						</tr>
					</thead>
					<tbody>
						{preview.weeks.map((week) => (
							<tr key={week.weekKey} className="border-border/50 border-t">
								<th scope="row" className="py-1 pr-2 font-normal">
									{week.weekNumber}
								</th>
								<td className="py-1 pr-2">{weekCell(week.before)}</td>
								<td className="py-1" data-after>
									{weekCell(week.after)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			) : null}
			<p className="text-muted-foreground text-caption font-normal">
				{SEASON_EDIT_LABELS.aroundYours}
			</p>
			<Form
				method="POST"
				className="space-y-2"
				{...getFormProps(form)}
				aria-describedby={form.errors ? form.errorId : messageId}
			>
				<input type="hidden" name="intent" value="apply-season-edit" />
				<input type="hidden" name="edit" value={kind} />
				<input type="hidden" name="outlineId" value={outlineId} />
				<input type="hidden" name="digest" value={preview.digest} />
				{Object.entries(formValues(preview.edit)).map(([name, value]) => (
					<input key={name} type="hidden" name={name} value={value} />
				))}
				{form.errors ? (
					<div role="alert">
						<ErrorList id={form.errorId} errors={form.errors} />
					</div>
				) : null}
				<Button type="submit" className="w-full sm:w-auto">
					{SEASON_EDIT_LABELS.apply}
				</Button>
			</Form>
		</section>
	)
}

/** One side of one week: its phase, its role and each track's target. */
function weekCell(week: WeekView | null): string {
	if (!week) return SEASON_EDIT_LABELS.ended
	return `${nbPhaseName(week.phaseName)} · ${targetsLabel(week.targets)} · ${NB_WEEK_ROLE_LABELS[week.role]}`
}

/**
 * The rise warnings of a preview (story 76, ADR 0084 §3), worded: shared by
 * the Sesong edits and the philosophy switch, so both warn in one voice. It
 * warns and never blocks — the confirm stays offered under it.
 */
export function RiseWarningNotice({ warnings }: { warnings: string[] }) {
	if (warnings.length === 0) return null
	return (
		<div
			role="status"
			// The design system's `status-under` (amber), as a tint and a hairline:
			// the word "Raskt opp" carries the warning, the colour only marks it.
			className="bg-status-under/10 ring-status-under/35 text-footnote rounded-3xl px-3.5 py-2.5 ring-1"
			data-season-edit-warning
		>
			<p className="text-status-under font-semibold">
				{SEASON_EDIT_LABELS.warningTitle}
			</p>
			<ul className="mt-1 space-y-1 tabular-nums">
				{warnings.map((warning) => (
					<li key={warning}>{warning}</li>
				))}
			</ul>
			<p className="text-muted-foreground text-caption mt-1 font-normal">
				{SEASON_EDIT_LABELS.warningNote}
			</p>
		</div>
	)
}

/** A figure as the field takes it: the currency's precision, a decimal comma. */
function fieldFigure(value: number | null, currency: VolumeCurrency): string {
	return value == null
		? ''
		: String(roundToCurrency(value, currency)).replace('.', ',')
}

/**
 * The ramp's level as a fresh start's pre-fill (ADR 0121 §2): to three
 * decimals, not to the currency's precision — the weeks after it climb from
 * this number, and a level cut to a tenth would move a later week's figure
 * across a rounding edge, so an untouched pre-fill would no longer leave them
 * as they are.
 */
function levelFigure(value: number | null): string {
	return value == null
		? ''
		: String(Math.round(value * 1000) / 1000).replace('.', ',')
}

/** `40 km`, or a dash for an Unavailable week. */
function figureOf(value: number | null, currency: VolumeCurrency): string {
	return value == null
		? '–'
		: `${formatNbVolumeFigure(value, currency)} ${NB_VOLUME_UNITS[currency]}`
}

/** The Monday a week before `weekKey`. */
function weekBefore(weekKey: string): string {
	const day = dayOf(weekKey)
	day.setUTCDate(day.getUTCDate() - 7)
	return day.toISOString().slice(0, 10)
}

/**
 * One label for a week in every picker of the edit (#673's design):
 * `Fra uke 7 · 15. feb · 128,5 km`, with the year when the plan crosses New Year,
 * so `uke 7` after `uke 53` never needs a second look.
 */
function weekPickLabel(
	weekKey: string,
	figure: string,
	withYear: boolean,
): string {
	const day = formatNbDayMonth(dayOf(weekKey), 'UTC')
	const year = withYear ? ` ${weekKey.slice(0, 4)}` : ''
	return `${SEASON_ANCHOR_EDIT_LABELS.fromWeek} ${isoWeekNumber(weekKey)} · ${day}${year} · ${figure}`
}

/** The segments a remove may take, as the domain marks them. */
function removableSegments(track: SeasonAnchorChoice) {
	return track.anchors.filter((anchor) => anchor.removable)
}

/**
 * What the edit opens on for a track (#673's design): a fresh start from the
 * first unbegun week, pre-filled with the ramp's level there, when the segment
 * in force began before it — a value change there would be refused — and
 * otherwise a value change on that segment.
 */
function anchorDefaults(
	track: SeasonAnchorChoice,
	firstUnbegunWeekKey: string,
): Record<string, string> {
	const first = track.weeks[0]!
	const inForce = anchorInForceAt(track.anchors, first.weekKey)
	const settable = track.anchors.filter((anchor) => anchor.inPlan)
	const setOn =
		inForce && inForce.fromWeekKey >= first.weekKey
			? inForce
			: (settable.find((a) => a.fromWeekKey >= firstUnbegunWeekKey) ??
				inForce ??
				settable[0])
	const action = inForce && inForce.fromWeekKey < first.weekKey ? 'add' : 'set'
	return {
		trackId: track.trackId,
		action,
		addWeekKey: first.weekKey,
		addValue: levelFigure(first.level),
		setWeekKey: setOn?.fromWeekKey ?? '',
		setValue: setOn ? fieldFigure(setOn.value, track.currency) : '',
		removeWeekKey: removableSegments(track)[0]?.fromWeekKey ?? '',
	}
}

/**
 * _Endre startnivået_ (#673, ADR 0121): a track's Season Anchor, in one form
 * with three acts — a fresh start from a week, a segment's value, or a
 * re-anchor taken back — and one preview. Reached from the lead's _Endre
 * volumet_ (`?edit=season-anchor&trackId=…`), opened on the act that will not
 * be refused.
 */
function SeasonAnchorEdit({
	outlineId,
	tracks,
	firstUnbegunWeekKey,
	reply,
	requested,
}: EditProps & { tracks: SeasonAnchorChoice[]; firstUnbegunWeekKey: string }) {
	const shownEdit =
		reply?.preview?.edit.kind === 'season-anchor' ? reply.preview.edit : null
	const initial =
		tracks.find(
			(track) => track.trackId === (shownEdit?.trackId ?? requested?.trackId),
		) ?? tracks[0]!
	const defaults = {
		...anchorDefaults(initial, firstUnbegunWeekKey),
		...(shownEdit ? formValues(shownEdit) : {}),
	}
	const [form, fields] = useForm<
		z.input<typeof SeasonAnchorEditFormSchema>,
		z.output<typeof SeasonAnchorEditFormSchema>
	>({
		id: 'season-anchor-edit',
		constraint: getZodConstraint(SeasonAnchorEditFormSchema),
		lastResult: reply?.result,
		defaultValue: defaults,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SeasonAnchorEditFormSchema })
		},
		shouldRevalidate: 'onBlur',
	})
	const [action, setAction] = useState(defaults.action!)
	const track =
		tracks.find((candidate) => candidate.trackId === form.value?.trackId) ??
		initial
	const unit = NB_VOLUME_UNITS[track.currency]
	// The pre-fills follow the picked week until the athlete types a number.
	const typed = useRef({ add: shownEdit != null, set: shownEdit != null })

	// Another track: every field starts again from that track's own defaults.
	const shownTrack = useRef(track.trackId)
	useEffect(() => {
		if (shownTrack.current === track.trackId) return
		shownTrack.current = track.trackId
		const next = anchorDefaults(track, firstUnbegunWeekKey)
		typed.current = { add: false, set: false }
		setAction(next.action!)
		form.update({ value: next })
		// Only another track starts the form again.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [track])

	// A preview asked for from a refusal's offer re-fills the form with it.
	useEffect(() => {
		if (!reply?.fromOffer || !shownEdit) return
		typed.current = { add: true, set: true }
		setAction(shownEdit.action)
		form.update({
			value: {
				...anchorDefaults(track, firstUnbegunWeekKey),
				...formValues(shownEdit),
			},
		})
		// Only a new answer re-fills it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [reply])

	// Each runs when its week changes, never on its own update: the value it
	// writes is compared first, so a re-render cannot write it again.
	const addWeekKey = form.value?.addWeekKey
	const addValue = form.value?.addValue
	useEffect(() => {
		if (typed.current.add) return
		const week = track.weeks.find((w) => w.weekKey === addWeekKey)
		if (!week) return
		const value = levelFigure(week.level)
		if (value === addValue) return
		form.update({ name: fields.addValue.name, value })
		// Only a new week re-fills it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [addWeekKey, track])

	const setWeekKey = form.value?.setWeekKey
	const setValue = form.value?.setValue
	useEffect(() => {
		if (typed.current.set) return
		const segment = track.anchors.find((a) => a.fromWeekKey === setWeekKey)
		if (!segment) return
		const value = fieldFigure(segment.value, track.currency)
		if (value === setValue) return
		form.update({ name: fields.setValue.name, value })
		// Only a new segment re-fills it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [setWeekKey, track])

	const withYear =
		new Set(
			[
				...track.weeks.map((w) => w.weekKey),
				...track.anchors.map((a) => a.fromWeekKey),
			].map((weekKey) => weekKey.slice(0, 4)),
		).size > 1
	const segmentLabel = (anchor: SeasonAnchorChoice['anchors'][number]) =>
		anchor.inPlan
			? weekPickLabel(
					anchor.fromWeekKey,
					figureOf(anchor.value, track.currency),
					withYear,
				)
			: `${SEASON_EDIT_LABELS.ended} · ${figureOf(anchor.value, track.currency)}`
	const removable = removableSegments(track)
	const earliest = track.anchors.find((anchor) => anchor.earliest)
	const atWeek = track.anchors.find((a) => a.fromWeekKey === addWeekKey)
	const pickedWeek = track.weeks.find((w) => w.weekKey === addWeekKey)

	const lived = reply?.refusal === 'segment-lived'
	const offer = lived && reply?.offer?.action !== 'remove' ? reply?.offer : null
	const livedFrom = form.value?.setWeekKey ?? shownEdit?.fromWeekKey
	// The lived weeks the segment covers: up to the week before the first
	// unbegun one, or before the next segment when that one took over first.
	const nextSegment = track.anchors.find(
		(anchor) => livedFrom != null && anchor.fromWeekKey > livedFrom,
	)
	const livedTo = weekBefore(
		nextSegment && nextSegment.fromWeekKey < firstUnbegunWeekKey
			? nextSegment.fromWeekKey
			: firstUnbegunWeekKey,
	)

	const act = (name: 'add' | 'set' | 'remove') =>
		action === name ? undefined : true
	return (
		<EditShell
			kind="season-anchor"
			summary={SEASON_ANCHOR_EDIT_LABELS.open}
			detail={SEASON_ANCHOR_EDIT_LABELS.openDetail}
			outlineId={outlineId}
			reply={reply}
			open={requested != null}
			formValue={{ ...form.value, action }}
			formProps={getFormProps(form)}
			formErrors={lived ? undefined : form.errors}
			formErrorId={form.errorId}
			afterForm={
				lived ? (
					<div
						role="alert"
						className="bg-destructive/5 ring-destructive/25 space-y-2 rounded-3xl px-3.5 py-3 ring-1"
						data-season-anchor-lived
					>
						<p className="text-callout font-semibold">
							{SEASON_ANCHOR_EDIT_LABELS.livedTitle}
						</p>
						<p className="text-footnote">
							{livedFrom
								? SEASON_ANCHOR_EDIT_LABELS.lived(
										isoWeekNumber(livedFrom),
										isoWeekNumber(livedTo),
									)
								: SEASON_EDIT_REFUSAL_LABELS['segment-lived']}
						</p>
						{offer ? (
							<Form method="POST" data-season-anchor-offer>
								<input
									type="hidden"
									name="intent"
									value="preview-season-edit"
								/>
								<input type="hidden" name="edit" value="season-anchor" />
								<input type="hidden" name="outlineId" value={outlineId} />
								<input type="hidden" name="fromOffer" value="on" />
								{Object.entries(formValues(offer)).map(([name, value]) => (
									<input key={name} type="hidden" name={name} value={value} />
								))}
								<Button
									type="submit"
									variant="secondary"
									className="h-auto min-h-11 w-full py-2 whitespace-normal"
								>
									{SEASON_ANCHOR_EDIT_LABELS.offer(
										isoWeekNumber(offer.fromWeekKey),
										figureOf(offer.value, track.currency),
									)}
								</Button>
							</Form>
						) : null}
					</div>
				) : null
			}
		>
			{tracks.length > 1 ? (
				<SelectField
					meta={fields.trackId}
					labelProps={{
						children: SEASON_ANCHOR_EDIT_LABELS.track,
						className: 'text-callout',
					}}
					items={tracks.map((choice) => ({
						value: choice.trackId,
						label: `${nbTrackName(choice.discipline)} (${NB_VOLUME_UNITS[choice.currency]})`,
					}))}
				/>
			) : (
				<input type="hidden" name={fields.trackId.name} value={track.trackId} />
			)}
			<RadioGroupField
				name={fields.action.name}
				legend={SEASON_ANCHOR_EDIT_LABELS.actLegend}
				legendClassName="text-callout"
				value={action}
				onValueChange={(next) => setAction(next as 'add' | 'set' | 'remove')}
				options={[
					{
						value: 'add',
						label: SEASON_ANCHOR_EDIT_LABELS.add,
						description: SEASON_ANCHOR_EDIT_LABELS.addDetail,
					},
					{
						value: 'set',
						label: SEASON_ANCHOR_EDIT_LABELS.set,
						description: SEASON_ANCHOR_EDIT_LABELS.setDetail,
					},
					// Only a later segment can go, never the season's first.
					...(removable.length > 0
						? [
								{
									value: 'remove',
									label: SEASON_ANCHOR_EDIT_LABELS.remove,
									description: SEASON_ANCHOR_EDIT_LABELS.removeDetail,
								},
							]
						: []),
				]}
			/>
			{/* Each act keeps its own fields, all posted; the act read decides. */}
			<div
				hidden={act('add')}
				className="space-y-4"
				data-season-anchor-act="add"
			>
				<SelectField
					meta={fields.addWeekKey}
					labelProps={{
						children: SEASON_ANCHOR_EDIT_LABELS.fromWeek,
						className: 'text-callout',
					}}
					items={track.weeks.map((week) => ({
						value: week.weekKey,
						label: `${weekPickLabel(week.weekKey, figureOf(week.target, track.currency), withYear)}${
							track.anchors.some((a) => a.fromWeekKey === week.weekKey)
								? ` · ${SEASON_ANCHOR_EDIT_LABELS.hasSegment}`
								: ''
						}`,
					}))}
				/>
				{atWeek ? (
					<p className="text-muted-foreground text-footnote tabular-nums">
						{SEASON_ANCHOR_EDIT_LABELS.mergesInto(
							figureOf(atWeek.value, track.currency),
						)}
					</p>
				) : pickedWeek ? (
					<p className="text-muted-foreground text-footnote tabular-nums">
						{SEASON_ANCHOR_EDIT_LABELS.nowAt(
							figureOf(pickedWeek.target, track.currency),
							NB_WEEK_ROLE_LABELS[pickedWeek.role],
						)}
					</p>
				) : null}
				<Field
					labelProps={{
						children: SEASON_ANCHOR_EDIT_LABELS.startsAt(unit),
						className: 'text-callout',
					}}
					inputProps={{
						...getInputProps(fields.addValue, { type: 'text' }),
						inputMode: 'decimal',
						autoComplete: 'off',
						className: 'text-body tabular-nums',
						onInput: () => {
							typed.current.add = true
						},
					}}
					errors={fields.addValue.errors}
				/>
				<p className="text-muted-foreground text-footnote">
					{SEASON_ANCHOR_EDIT_LABELS.addHint}
				</p>
			</div>
			<div
				hidden={act('set')}
				className="space-y-4"
				data-season-anchor-act="set"
			>
				<SelectField
					meta={fields.setWeekKey}
					labelProps={{
						children: SEASON_ANCHOR_EDIT_LABELS.segment,
						className: 'text-callout',
					}}
					items={track.anchors.map((anchor) => ({
						value: anchor.fromWeekKey,
						label: `${segmentLabel(anchor)}${
							anchor.earliest
								? ` · ${SEASON_ANCHOR_EDIT_LABELS.seasonStart}`
								: ''
						}`,
					}))}
				/>
				<Field
					labelProps={{
						children: SEASON_ANCHOR_EDIT_LABELS.newValue(unit),
						className: 'text-callout',
					}}
					inputProps={{
						...getInputProps(fields.setValue, { type: 'text' }),
						inputMode: 'decimal',
						autoComplete: 'off',
						className: 'text-body tabular-nums',
						onInput: () => {
							typed.current.set = true
						},
					}}
					errors={fields.setValue.errors}
				/>
				<p className="text-muted-foreground text-footnote">
					{SEASON_ANCHOR_EDIT_LABELS.setHint}
				</p>
			</div>
			{removable.length > 0 ? (
				<div
					hidden={act('remove')}
					className="space-y-2"
					data-season-anchor-act="remove"
				>
					<SelectField
						meta={fields.removeWeekKey}
						labelProps={{
							children: SEASON_ANCHOR_EDIT_LABELS.segment,
							className: 'text-callout',
						}}
						items={removable.map((anchor) => ({
							value: anchor.fromWeekKey,
							label: segmentLabel(anchor),
						}))}
					/>
					{earliest ? (
						<p className="text-muted-foreground text-footnote">
							{SEASON_ANCHOR_EDIT_LABELS.removeHint(segmentLabel(earliest))}
						</p>
					) : null}
				</div>
			) : null}
		</EditShell>
	)
}

/**
 * A Season Anchor preview (#673's design): the headline and what held, the
 * rise warnings, every changed week as a 44 px row — before → after, a quiet
 * _regnet ut_, and a tap that opens how the number was worked out — the
 * hand-set weeks held, and the confirm in a sticky footer with the count, so
 * a preview as long as the season keeps its confirm in reach. After a stale
 * confirm the rows are dimmed to the secondary text colour (never by opacity,
 * which takes muted text under AA) and the confirm gives way to a fresh preview.
 */
function SeasonAnchorPreviewPanel({
	outlineId,
	preview,
	anchor,
	stale,
	lastResult,
}: {
	outlineId: string
	preview: SeasonEditPreviewView
	anchor: SeasonAnchorPreviewView
	stale: boolean
	lastResult: SubmissionResult<string[]> | undefined
}) {
	const [form] = useForm({
		id: 'season-anchor-edit-confirm',
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: SeasonAnchorEditFormSchema })
		},
	})
	const titleId = 'season-anchor-preview-title'
	const messageId = 'season-anchor-preview-message'
	const heading = useRef<HTMLHeadingElement>(null)
	// Asked for, so read: focus moves to the preview (it is keyed by digest,
	// so this runs once per preview shown).
	useEffect(() => {
		heading.current?.focus()
	}, [])
	// A stale confirm takes away the button that had focus: focus goes to what
	// the athlete can do now, a fresh preview, not back to the page's top.
	const refresh = useRef<HTMLButtonElement>(null)
	useEffect(() => {
		if (stale) refresh.current?.focus()
	}, [stale])
	const posted = Object.entries(formValues(preview.edit))
	// The apply lays every changed week again before it answers, so it can
	// take a while: the confirm says so and takes no second tap, which would
	// land on the plan the first one already changed and say nothing changed.
	const navigation = useNavigation()
	const applying =
		navigation.state !== 'idle' &&
		navigation.formData?.get('intent') === 'apply-season-edit' &&
		navigation.formData.get('edit') === 'season-anchor'
	return (
		<section
			aria-labelledby={titleId}
			className="border-border/70 space-y-4 border-t pt-4"
			data-season-edit-preview
			data-stale={stale ? '' : undefined}
		>
			<h3
				id={titleId}
				ref={heading}
				aria-describedby={messageId}
				tabIndex={-1}
				className="text-callout font-semibold outline-none"
			>
				{SEASON_EDIT_LABELS.preview}
			</h3>
			<p
				id={messageId}
				className={cn('text-footnote', stale && 'text-muted-foreground')}
				aria-live="polite"
				data-season-edit-message
			>
				{preview.message}
			</p>
			<div className={cn('space-y-4', stale && 'text-muted-foreground')}>
				<RiseWarningNotice warnings={preview.warnings} />
				{anchor.rows.length > 0 ? (
					<div>
						<h4
							id="season-anchor-preview-weeks"
							className="text-muted-foreground text-caption"
						>
							{SEASON_ANCHOR_EDIT_LABELS.weeks}
						</h4>
						<p className="text-muted-foreground text-caption">
							{SEASON_ANCHOR_EDIT_LABELS.weeksHint}
						</p>
						<ul
							aria-labelledby="season-anchor-preview-weeks"
							className="mt-1 tabular-nums"
						>
							{anchor.rows.map((row) => (
								<SeasonAnchorPreviewRow
									key={row.weekKey}
									row={row}
									unit={anchor.unit}
								/>
							))}
						</ul>
					</div>
				) : null}
				{anchor.held.length > 0 ? (
					<div>
						<h4
							id="season-anchor-preview-held"
							className="text-muted-foreground text-caption"
						>
							{SEASON_ANCHOR_EDIT_LABELS.held}
						</h4>
						<ul
							aria-labelledby="season-anchor-preview-held"
							className="mt-1 tabular-nums"
							data-season-anchor-held
						>
							{anchor.held.map((week) => (
								<li
									key={week.weekKey}
									className="border-border/50 flex min-h-11 items-center gap-3 border-t py-2"
								>
									<span className="min-w-0 flex-1">
										<span className="text-callout block">
											{SEASON_ANCHOR_EDIT_LABELS.week} {week.weekNumber} ·{' '}
											{week.figure}
										</span>
										<span className="text-muted-foreground text-caption block">
											{SEASON_ANCHOR_EDIT_LABELS.handSetDetail}
										</span>
									</span>
									<span className="bg-muted text-caption shrink-0 rounded-full px-2 py-0.5 font-medium">
										{SEASON_ANCHOR_EDIT_LABELS.handSet}
									</span>
								</li>
							))}
						</ul>
					</div>
				) : null}
				<p className="text-muted-foreground text-caption">
					{SEASON_EDIT_LABELS.aroundYours}
				</p>
			</div>
			{stale ? (
				<div
					role="alert"
					className="bg-destructive/5 ring-destructive/25 space-y-2 rounded-3xl px-3.5 py-3 ring-1"
					data-season-anchor-stale
				>
					<p className="text-footnote">{SEASON_ANCHOR_EDIT_LABELS.stale}</p>
					<Form method="POST">
						<input type="hidden" name="intent" value="preview-season-edit" />
						<input type="hidden" name="edit" value="season-anchor" />
						<input type="hidden" name="outlineId" value={outlineId} />
						{posted.map(([name, value]) => (
							<input key={name} type="hidden" name={name} value={value} />
						))}
						<Button
							ref={refresh}
							type="submit"
							variant="secondary"
							className="w-full"
						>
							{SEASON_ANCHOR_EDIT_LABELS.refresh}
						</Button>
					</Form>
				</div>
			) : (
				// The confirm stays in reach however long the list: a footer that
				// sticks above the tab bar while the preview is on screen.
				<Form
					method="POST"
					className="bg-card border-border/60 sticky bottom-(--tab-bar-space) z-10 -mx-1 space-y-2 border-t px-1 pt-3 pb-3"
					{...getFormProps(form)}
					aria-describedby={form.errors ? form.errorId : messageId}
				>
					<input type="hidden" name="intent" value="apply-season-edit" />
					<input type="hidden" name="edit" value="season-anchor" />
					<input type="hidden" name="outlineId" value={outlineId} />
					<input type="hidden" name="digest" value={preview.digest} />
					{posted.map(([name, value]) => (
						<input key={name} type="hidden" name={name} value={value} />
					))}
					{form.errors ? (
						<div role="alert">
							<ErrorList id={form.errorId} errors={form.errors} />
						</div>
					) : null}
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<p className="text-footnote text-muted-foreground min-w-0 flex-1 tabular-nums">
							{anchor.changedWeeks}
						</p>
						<StatusButton
							type="submit"
							className="w-full sm:w-auto"
							status={applying ? 'pending' : 'idle'}
							disabled={applying}
						>
							{SEASON_EDIT_LABELS.apply}
						</StatusButton>
					</div>
				</Form>
			)}
		</section>
	)
}

/** One changed week: before → after, its marker, and how it was worked out. */
function SeasonAnchorPreviewRow({
	row,
	unit,
}: {
	row: SeasonAnchorPreviewView['rows'][number]
	/** The track's Volume Currency, said once after the new figure. */
	unit: string
}) {
	const figures = (
		<span className="shrink-0 text-right">
			<span className="text-callout block whitespace-nowrap">
				<span className="text-muted-foreground">{row.before}</span>
				<span aria-hidden="true"> → </span>
				<span className="sr-only"> {SEASON_ANCHOR_EDIT_LABELS.becomes} </span>
				<span className="font-semibold" data-after>
					{row.after}
				</span>{' '}
				<span className="text-muted-foreground">{unit}</span>
			</span>
			<span className="text-muted-foreground text-caption block">
				{row.authored
					? SEASON_ANCHOR_EDIT_LABELS.handSet
					: SEASON_ANCHOR_EDIT_LABELS.derived}
			</span>
		</span>
	)
	const week = (
		<span className="min-w-0 flex-1">
			<span className="text-callout block">
				{SEASON_ANCHOR_EDIT_LABELS.week} {row.weekNumber}
			</span>
			<span className="text-muted-foreground text-caption block [overflow-wrap:anywhere]">
				{row.where}
			</span>
		</span>
	)
	if (!row.how) {
		return (
			<li
				className="border-border/50 flex min-h-11 items-center gap-3 border-t py-2"
				data-season-anchor-row={row.weekKey}
			>
				{week}
				{figures}
			</li>
		)
	}
	return (
		<li
			className="border-border/50 border-t"
			data-season-anchor-row={row.weekKey}
		>
			<Collapsible>
				<CollapsibleTrigger
					className={cn(
						'-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-2xl px-2 py-2 text-left select-none',
						ROW_PRESS,
					)}
				>
					{week}
					{figures}
					<Icon name="chevron-down" size="sm" className={COLLAPSIBLE_CHEVRON} />
				</CollapsibleTrigger>
				<CollapsibleContent>
					<p className="text-footnote text-muted-foreground pb-2 [overflow-wrap:anywhere]">
						{row.how}
					</p>
				</CollapsibleContent>
			</Collapsible>
		</li>
	)
}
