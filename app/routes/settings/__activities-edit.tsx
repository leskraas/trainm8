/**
 * _Meg_ → _Nivå og økter_'s activities (#587, ADR 0109, the design's "In
 * place"): the start's chips pressed with the plan's activities, _Vis ny
 * uke_ for the server's preview of the first week the edit lays, and
 * _Bekreft_ under it. Or, for a plan the edit cannot lay, the activities
 * read-only with why and the way to Plan.
 *
 * No motion of its own: the preview answers a press that went to the
 * server, so it is there when the answer is, focused and brought into view
 * at once. Press feedback only (`pressable`, the buttons' own).
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useFetcher } from 'react-router'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	type ActivitiesChoice,
	choiceRefusal,
} from '#app/utils/first-run/activities-edit.ts'
import {
	ACTIVITIES_EDIT_LABELS,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import {
	ActivityChips,
	MainSportLine,
	pressActivities,
	pressedOf,
} from '../start/__activity-chips.tsx'
import { StartOptionWeekView } from '../start/__start-option-card.tsx'
import { StrengthField } from '../start/__strength-field.tsx'
import {
	type ActivitiesPreviewView,
	type ActivitiesReply,
	type ActivitiesView,
} from './__activities-edit.server.ts'
import { MegNote, MegSection } from './__meg-ui.tsx'

const W = ACTIVITIES_EDIT_LABELS
const M = SESSION_PREFERENCE_LABELS.meg

/** Whether two choices are the same activities, the main sport included. */
function sameChoice(a: ActivitiesChoice, b: ActivitiesChoice) {
	return choiceRefusal(a, b) === 'same'
}

export function ActivitiesSection({ view }: { view: ActivitiesView }) {
	if (view.kind === 'none') {
		return (
			<MegSection id="meg-activities" title={M.activities}>
				<p className="text-callout" data-meg-activities>
					{view.text}
				</p>
			</MegSection>
		)
	}
	if (view.kind === 'read-only') {
		return (
			<MegSection id="meg-activities" title={M.activities}>
				<div className="space-y-2" data-meg-activities>
					<p className="text-callout [overflow-wrap:anywhere]">
						{view.names.join(', ')}
					</p>
					<MegNote>
						<span className="[overflow-wrap:anywhere]">{view.why}</span>
					</MegNote>
					<Link
						to="/training/plan"
						prefetch="intent"
						className="text-callout text-primary flex min-h-11 items-center underline-offset-4 hover:underline"
					>
						{M.activitiesLink}
					</Link>
				</div>
			</MegSection>
		)
	}
	return <ActivitiesEditor view={view} />
}

function ChoiceFields({ choice }: { choice: ActivitiesChoice }) {
	return (
		<>
			{choice.sports.map((sport) => (
				<input key={sport} type="hidden" name="sports" value={sport} />
			))}
			{choice.activities.map((kind) => (
				<input key={kind} type="hidden" name="activities" value={kind} />
			))}
			{choice.strength != null ? (
				<input type="hidden" name="strength" value={choice.strength} />
			) : null}
		</>
	)
}

function ActivitiesEditor({
	view,
}: {
	view: Extract<ActivitiesView, { kind: 'editable' }>
}) {
	const fetcher = useFetcher<{ activities?: ActivitiesReply }>({
		key: 'meg-activities',
	})
	const [picks, setPicks] = useState<ActivitiesChoice>(view.current)
	const reply = fetcher.data?.activities ?? null
	const busy = fetcher.state !== 'idle'
	const asking = busy ? fetcher.formData?.get('intent') : null

	// A preview stands only under the choices it was laid for: change a chip
	// and it goes, with one line saying to ask again.
	const preview =
		reply?.kind === 'preview' && sameChoice(reply.preview.choice, picks)
			? reply
			: null
	const changedSince = reply?.kind === 'preview' && !preview
	const done = reply?.kind === 'done' && sameChoice(view.current, picks)
	const note = changedSince
		? W.changedSince
		: reply?.kind === 'refused'
			? reply.message
			: ''

	const previewRef = useRef<HTMLElement>(null)
	const staleRef = useRef<HTMLParagraphElement>(null)
	const doneRef = useRef<HTMLParagraphElement>(null)
	const digest = preview?.preview.digest
	const stale = preview?.stale ?? false
	useEffect(() => {
		if (!digest) return
		// A stale refusal is said where the thumb is: the new preview's top in
		// view, its one line focused. A fresh preview is brought just into view.
		if (stale) {
			previewRef.current?.scrollIntoView?.({ block: 'start' })
			staleRef.current?.focus({ preventScroll: true })
		} else {
			previewRef.current?.focus({ preventScroll: true })
			previewRef.current?.scrollIntoView?.({ block: 'nearest' })
		}
	}, [digest, stale])
	useEffect(() => {
		// Bekreft is gone with the preview: focus moves to the done line.
		if (done) doneRef.current?.focus({ preventScroll: true })
	}, [done])

	return (
		<MegSection id="meg-activities" title={M.activities}>
			<div className="space-y-4" data-meg-activities>
				<MegNote>{W.note}</MegNote>
				<fieldset className="space-y-2" data-activities-editor>
					<legend className="sr-only">
						{SIMPLE_START_LABELS.activities.list}
					</legend>
					<ActivityChips
						pressed={pressedOf(picks)}
						onPressedChange={(next) =>
							setPicks((before) =>
								pressActivities(before, next, view.lifting?.preset ?? null),
							)
						}
						withStrength={view.lifting != null}
					/>
					<MainSportLine
						sports={picks.sports}
						onSwitch={() =>
							setPicks((before) => ({
								...before,
								sports: [...before.sports.slice(1), before.sports[0]!],
							}))
						}
					/>
				</fieldset>
				{view.lifting ? (
					<div className="space-y-1">
						<StrengthField
							name="strength-tap"
							value={picks.strength}
							fromHistory={view.lifting.fromHistory}
							onValueChange={(next) =>
								setPicks((before) => ({ ...before, strength: next }))
							}
						/>
						{picks.strength != null && view.lifting.answered != null ? (
							<p className="text-footnote text-muted-foreground">
								{W.strengthAnswer(view.lifting.answered)}
							</p>
						) : null}
					</div>
				) : null}
				<p className="text-footnote text-muted-foreground tabular-nums">
					{view.stands}
				</p>

				<fetcher.Form method="POST" className="space-y-2">
					<input type="hidden" name="intent" value="preview-activities" />
					<ChoiceFields choice={picks} />
					<StatusButton
						type="submit"
						variant="outline"
						className="text-callout w-full sm:w-auto"
						status={asking === 'preview-activities' ? 'pending' : 'idle'}
						disabled={busy}
					>
						{W.show}
					</StatusButton>
					<p
						role="status"
						className="text-footnote text-muted-foreground"
						data-activities-note
					>
						{note}
					</p>
				</fetcher.Form>

				{preview ? (
					<ActivitiesPreview
						preview={preview.preview}
						stale={preview.stale}
						busy={busy}
						confirming={asking === 'confirm-activities'}
						previewRef={previewRef}
						staleRef={staleRef}
						Form={fetcher.Form}
					/>
				) : null}

				{done ? (
					<p
						ref={doneRef}
						tabIndex={-1}
						role="status"
						className="focus:ring-ring text-footnote rounded-md outline-none focus:ring-2"
						data-activities-done
					>
						{reply?.kind === 'done' ? reply.message : null}{' '}
						<Link
							to="/training/plan"
							prefetch="intent"
							className="text-primary inline-flex min-h-11 items-center underline-offset-4 hover:underline"
						>
							{W.doneLink}
						</Link>
					</p>
				) : null}
			</div>
		</MegSection>
	)
}

function ActivitiesPreview({
	preview,
	stale,
	busy,
	confirming,
	previewRef,
	staleRef,
	Form,
}: {
	preview: ActivitiesPreviewView
	stale: boolean
	busy: boolean
	confirming: boolean
	previewRef: React.RefObject<HTMLElement | null>
	staleRef: React.RefObject<HTMLParagraphElement | null>
	Form: ReturnType<typeof useFetcher>['Form']
}) {
	const also = [
		preview.kept
			? { title: W.keptTitle, lines: [preview.kept], key: 'kept' }
			: null,
		preview.pinned.length > 0
			? { title: W.pinnedTitle, lines: preview.pinned, key: 'pinned' }
			: null,
		preview.overrides.length > 0
			? { title: W.overridesTitle, lines: preview.overrides, key: 'overrides' }
			: null,
		preview.anchors.length > 0
			? { title: W.anchorsTitle, lines: preview.anchors, key: 'anchors' }
			: null,
	].filter((item) => item != null)
	return (
		<section
			ref={previewRef}
			tabIndex={-1}
			aria-labelledby="activities-preview-title"
			className="bg-card ring-foreground/5 dark:ring-foreground/10 scroll-mt-4 space-y-4 rounded-4xl p-4 shadow-xs ring-1 outline-none"
			data-activities-preview
		>
			{stale ? (
				<p
					ref={staleRef}
					tabIndex={-1}
					role="alert"
					className="focus:ring-ring text-footnote text-destructive rounded-md outline-none focus:ring-2"
					data-activities-stale
				>
					{W.stale}
				</p>
			) : null}
			<div className="space-y-1">
				<p className="text-overline text-muted-foreground uppercase tabular-nums">
					{preview.overline}
				</p>
				<h3 id="activities-preview-title" className="text-heading">
					{preview.title}
				</h3>
				<p className="text-footnote">{preview.lead}</p>
			</div>
			<StartOptionWeekView card={preview.card} />
			{preview.notes.map((line) => (
				<p key={line} className="text-footnote text-muted-foreground">
					{line}
				</p>
			))}
			{preview.yoursNote ? (
				<p className="text-footnote text-muted-foreground">
					{preview.yoursNote}
				</p>
			) : null}
			{also.length > 0 ? (
				<div className="space-y-3">
					<h4 className="text-overline text-muted-foreground uppercase">
						{W.alsoTitle}
					</h4>
					<ul className="space-y-3">
						{also.map((item) => (
							<li
								key={item.key}
								className="space-y-1"
								data-activities-also={item.key}
							>
								<p className="text-callout">{item.title}</p>
								<ul className="text-footnote text-muted-foreground space-y-0.5 [overflow-wrap:anywhere] tabular-nums">
									{item.lines.map((line) => (
										<li key={line}>{line}</li>
									))}
								</ul>
							</li>
						))}
					</ul>
				</div>
			) : null}
			<Form method="POST" className="space-y-2">
				<input type="hidden" name="intent" value="confirm-activities" />
				<input type="hidden" name="digest" value={preview.digest} />
				<ChoiceFields choice={preview.choice} />
				<StatusButton
					type="submit"
					className="text-callout w-full sm:w-auto"
					status={confirming ? 'pending' : 'idle'}
					disabled={busy}
				>
					{W.confirm}
				</StatusButton>
				<p className="text-footnote text-muted-foreground">{W.confirmNote}</p>
			</Form>
		</section>
	)
}
