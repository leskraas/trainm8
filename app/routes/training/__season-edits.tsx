/**
 * _Endre sesongen_ on the plan page (#505 stories 72–77): a week's target (or
 * back to the plan's own), a phase's name, length and rhythm, and which week of
 * a block is the easy one — each behind a _Forhåndsvisning_ that shows the
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
import { useEffect, useState } from 'react'
import { Form, Link, useLocation, useSearchParams } from 'react-router'
import { type z } from 'zod/v3'
import { ErrorList, Field, SelectField } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { isoWeekNumber } from '#app/utils/athlete-calendar.ts'
import { formatNbDayMonth, formatNbVolumeFigure } from '#app/utils/format.ts'
import {
	nbTrackName,
	NB_RHYTHM_CHOICE_LABELS,
	NB_VOLUME_UNITS,
	NB_WEEK_ROLE_LABELS,
	nbPhaseName,
	nbWeeks,
	SEASON_EDIT_LABELS,
} from '#app/utils/labels.ts'
import {
	RHYTHMS,
	type Rhythm,
	type VolumeCurrency,
	type WeekRole,
} from '#app/utils/plan-outline/derive.ts'
import {
	type TargetView,
	type WeekView,
} from '#app/utils/plan-outline/outline-preview.ts'
import {
	EasyWeekEditFormSchema,
	PhaseEditFormSchema,
	SEASON_EDIT_FORM_SCHEMAS,
	WeekTargetEditFormSchema,
} from '#app/utils/plan-outline/season-edit-schema.ts'
import {
	SEASON_EDIT_KINDS,
	type SeasonEdit,
	type SeasonEditKind,
	type SeasonEditPreview,
} from '#app/utils/plan-outline/season-edit.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { CollapsibleSection } from './__plan-chrome.tsx'

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
}

/** What the action answers a Sesong edit with. */
export type SeasonEditReply = {
	edit: SeasonEditKind
	result?: SubmissionResult<string[]>
	confirmResult?: SubmissionResult<string[]>
	preview?: SeasonEditPreviewView
}

type SeasonWeek = {
	weekKey: string
	phaseIndex: number
	role: WeekRole
	/** `overridden`: the athlete set this week's target themselves (ADR 0044 §5). */
	targets: Array<TargetView & { overridden?: boolean }>
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

/** A week key's calendar day, as a date with no zone to shift it. */
const dayOf = (weekKey: string) => new Date(`${weekKey}T12:00:00Z`)

function weekLabel(weekKey: string): string {
	return `Uke ${isoWeekNumber(weekKey)} · ${formatNbDayMonth(dayOf(weekKey), 'UTC')}`
}

/**
 * Each track's target, in its own unit — named by its sport when the plan has
 * more than one, so `44 km · 12 sett` never leaves the reader guessing.
 */
function targetsLabel(targets: TargetView[]): string {
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
 * A text link into an edit is a line of text (20 px) and the only way into its
 * edit, so it carries an invisible `after:` box 12 px above and below: 44 px of
 * target with no change to the reading's rhythm (ADR 0028 §2). `my-2.5` is what keeps two of
 * them stacked in a flex column (a phase card's pair) from reaching into each
 * other's text: 24 px between lines is exactly the two extensions. On a link in
 * running text the margin does nothing.
 */
const SEASON_EDIT_LINK_CLASS =
	'relative my-2.5 w-fit text-sm underline touch-manipulation after:absolute after:inset-x-0 after:-inset-y-3'

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
			to={{ search: `?${params.toString()}`, hash: ANCHOR }}
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
	firstUnbegunWeekKey,
	reply,
}: {
	outlineId: string
	weeks: SeasonWeek[]
	phases: SeasonPhase[]
	tracks: SeasonTrack[]
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
						<p id={hintId} className="text-muted-foreground text-caption">
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
					className: 'text-sm font-medium',
				}}
				items={weeks.map((week) => ({
					value: week.weekKey,
					label: weekLabel(week.weekKey),
				}))}
			/>
			{chosen ? (
				<p className="text-muted-foreground text-sm" data-season-edit-current>
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
						className: 'text-sm font-medium',
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
					className: 'text-base',
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
					className: 'text-sm font-medium',
				}}
				items={phases.map((phase) => ({
					value: phase.id,
					label: `${nbPhaseName(phase.name)} · ${nbWeeks(phase.weeks)} · fra ${formatNbDayMonth(dayOf(phase.fromWeekKey), 'UTC')}`,
				}))}
			/>
			<p className="text-muted-foreground text-caption">
				{SEASON_EDIT_LABELS.phaseHint}
			</p>
			<Field
				labelProps={{ children: SEASON_EDIT_LABELS.phaseName }}
				inputProps={{
					...getInputProps(fields.name, { type: 'text' }),
					autoComplete: 'off',
					className: 'text-base',
				}}
				errors={fields.name.errors}
			/>
			<Field
				labelProps={{ children: SEASON_EDIT_LABELS.phaseWeeks }}
				inputProps={{
					...getInputProps(fields.weeks, { type: 'text' }),
					inputMode: 'numeric',
					autoComplete: 'off',
					className: 'text-base',
				}}
				errors={fields.weeks.errors}
			/>
			<SelectField
				meta={fields.rhythm}
				labelProps={{
					children: SEASON_EDIT_LABELS.phaseRhythm,
					className: 'text-sm font-medium',
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
					className: 'text-sm font-medium',
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
					className: 'text-sm font-medium',
				}}
				items={weeks.map((week) => ({
					value: week.weekKey,
					label: `Uke ${isoWeekNumber(week.weekKey)} · ${NB_WEEK_ROLE_LABELS[week.role]}`,
				}))}
			/>
			{chosen ? (
				<p className="text-muted-foreground text-sm" data-season-edit-current>
					{weekLabel(chosen.weekKey)} ·{' '}
					{nbPhaseName(phases[chosen.phaseIndex]?.name ?? '')}
				</p>
			) : null}
			<p className="text-muted-foreground text-caption">
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
		return (typeof current === 'string' ? current : '') === value
	})
}

/**
 * One edit: a disclosure holding its form, and — once the action answered
 * with one, and while the form still says what it was made from — the preview
 * and its confirm.
 */
function EditShell({
	kind,
	summary,
	outlineId,
	reply,
	open,
	formValue,
	formProps,
	formErrors,
	formErrorId,
	extraActions,
	children,
}: {
	kind: SeasonEditKind
	summary: string
	outlineId: string
	reply: SeasonEditReply | null
	/** Opened by the URL (`SeasonEditLink`) as well as by an answer. */
	open: boolean
	formValue: Record<string, unknown> | undefined
	formProps: ReturnType<typeof getFormProps>
	formErrors: string[] | undefined
	formErrorId: string
	extraActions?: React.ReactNode
	children: React.ReactNode
}) {
	const preview = reply?.preview ?? null
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
		<div data-season-edit={kind}>
			<CollapsibleSection
				summary={summary}
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
				{shown ? (
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
					<caption className="text-muted-foreground text-caption pb-1 text-left">
						{SEASON_EDIT_LABELS.weeks}
					</caption>
					<thead>
						<tr className="text-muted-foreground text-caption">
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
			<p className="text-muted-foreground text-caption">
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
			<p className="text-muted-foreground text-caption mt-1">
				{SEASON_EDIT_LABELS.warningNote}
			</p>
		</div>
	)
}
