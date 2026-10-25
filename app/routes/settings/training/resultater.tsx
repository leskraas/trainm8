/**
 * **Løpsresultater** — the athlete's own race and time-trial results (#464,
 * ADR 0007 as amended), the data a `racePace` step resolves against. Typed
 * here, so every row says it was typed and none is `verified`; the list is
 * newest first because the newest result at a distance is the one a target
 * reads (a prescription is about now). The rules a typed result is held to —
 * a plausible time for the distance, a real day no later than the athlete's
 * own today, one result per distance and day — live in the writer.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useEffect, useRef, useState } from 'react'
import { data, useFetcher } from 'react-router'
import { z } from 'zod/v3'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Label } from '#app/components/ui/label.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	formatClockDuration,
	formatDistance,
	formatNbDate,
	formatPace,
} from '#app/utils/format.ts'
import {
	INTENSITY_DISPLAY_WORDS,
	MEG_COMMON_LABELS,
	MEG_RESULTS_LABELS,
} from '#app/utils/labels.ts'
import { useDoubleCheck } from '#app/utils/misc.tsx'
import {
	paceSecPerKm,
	parseFinishTime,
	PERFORMANCE_SOURCES,
} from '#app/utils/performance-result-entry.ts'
import {
	addPerformanceResult,
	deletePerformanceResult,
	listPerformanceResults,
	performanceResultToday,
	type PerformanceResultRefusal,
} from '#app/utils/performance-result-writer.server.ts'
import { RACE_ANCHORS } from '#app/utils/workout-schema.ts'
import { MegField, MegFormErrors, MegNote, MegResult } from '../__meg-ui.tsx'
import { type Route } from './+types/resultater.ts'

const L = MEG_RESULTS_LABELS
const anchorName = (anchor: string) =>
	INTENSITY_DISPLAY_WORDS.race[anchor] ?? anchor
const sourceName = (source: string) =>
	source in L.sources ? L.sources[source as keyof typeof L.sources] : source

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: L.title,
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [rows, today] = await Promise.all([
		listPerformanceResults(userId),
		performanceResultToday(userId),
	])
	return {
		results: rows.map((row) => {
			const pace = paceSecPerKm(row.timeSec, row.distanceM)
			return {
				id: row.id,
				distance: row.anchor
					? anchorName(row.anchor)
					: formatDistance(row.distanceM).replace('.', ','),
				time: formatClockDuration(row.timeSec),
				pace: pace == null ? null : formatPace(pace),
				date: formatNbDate(row.occurredAt, 'UTC'),
				source: sourceName(row.source),
				typed: !row.verified,
			}
		}),
		today,
	}
}

const AddSchema = z.object({
	anchor: z.enum(RACE_ANCHORS),
	time: z.string().max(12),
	date: z.string().max(10),
	source: z.enum(PERFORMANCE_SOURCES),
})

type Field = 'time' | 'date' | null

const REFUSALS: Record<
	PerformanceResultRefusal,
	{ error: string; field: Field }
> = {
	'bad-date': { error: L.badDate, field: 'date' },
	future: { error: L.future, field: 'date' },
	implausible: { error: L.implausible, field: 'time' },
	'no-profile': { error: L.noProfile, field: null },
}

const refuse = (error: string, field: Field, status = 400) =>
	data({ ok: false as const, error, field, replaced: false }, { status })

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	if (formData.get('intent') === 'delete') {
		const id = String(formData.get('id') ?? '')
		const deleted = id ? await deletePerformanceResult(userId, id) : false
		return deleted
			? { ok: true as const, error: null, field: null, replaced: false }
			: refuse(L.notDeleted, null, 404)
	}

	const parsed = AddSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) return refuse(L.invalid, null)
	const timeSec = parseFinishTime(parsed.data.time)
	if (timeSec == null) return refuse(L.badTime, 'time')
	const added = await addPerformanceResult(userId, {
		anchor: parsed.data.anchor,
		timeSec,
		date: parsed.data.date,
		source: parsed.data.source,
	})
	if (!added.ok) {
		const { error, field } = REFUSALS[added.reason]
		return refuse(error, field)
	}
	return {
		ok: true as const,
		error: null,
		field: null,
		replaced: added.replaced,
	}
}

export default function PerformanceResultsSettings({
	loaderData,
}: Route.ComponentProps) {
	const { results, today } = loaderData
	return (
		<div className="flex flex-col gap-10">
			<div className="flex flex-col gap-2">
				<p className="text-body">{L.intro}</p>
			</div>
			<AddResultForm today={today} />
			<section
				aria-labelledby="meg-results-list"
				className="flex flex-col gap-2"
			>
				<h2 id="meg-results-list" className="text-heading">
					{L.title}
				</h2>
				{results.length === 0 ? (
					<MegNote>{L.none}</MegNote>
				) : (
					<ul className="divide-border/60 flex flex-col divide-y">
						{results.map((result) => (
							<ResultRow key={result.id} result={result} />
						))}
					</ul>
				)}
			</section>
		</div>
	)
}

type ResultView = Route.ComponentProps['loaderData']['results'][number]

function ResultRow({ result }: { result: ResultView }) {
	const fetcher = useFetcher<typeof action>()
	// Delete is a second tap: one result drives every step at its distance.
	const confirm = useDoubleCheck()
	// Optimistic: the row leaves on the tap, and returns, saying why, if the
	// delete fails.
	if (fetcher.state !== 'idle') return null
	const failed = fetcher.data && !fetcher.data.ok ? fetcher.data.error : null
	return (
		<li data-testid="performance-result" className="flex flex-col gap-1 py-3">
			<div className="flex items-center gap-3">
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="text-callout tabular-nums">
						{result.distance} · {result.time}
					</span>
					<span className="text-footnote text-muted-foreground tabular-nums">
						{[result.pace, result.source, result.date]
							.filter(Boolean)
							.join(' · ')}
					</span>
					{result.typed ? (
						<span className="text-caption text-muted-foreground">
							{L.typedNote}
						</span>
					) : null}
				</span>
				<fetcher.Form method="POST" className="shrink-0">
					<input type="hidden" name="intent" value="delete" />
					<input type="hidden" name="id" value={result.id} />
					<Button
						variant={confirm.doubleCheck ? 'destructive' : 'ghost'}
						size="sm"
						aria-label={
							confirm.doubleCheck
								? undefined
								: L.deleteLabel(`${result.distance} ${result.time}`)
						}
						{...confirm.getButtonProps({ type: 'submit' })}
					>
						{confirm.doubleCheck ? MEG_COMMON_LABELS.areYouSure : L.delete}
					</Button>
				</fetcher.Form>
			</div>
			<MegFormErrors errors={failed ? [failed] : null} />
		</li>
	)
}

function AddResultForm({ today }: { today: string }) {
	const fetcher = useFetcher<typeof action>()
	const formRef = useRef<HTMLFormElement>(null)
	const [anchor, setAnchor] = useState<string>('5k')
	const [source, setSource] = useState<string>('race')
	const reply = fetcher.data ?? null
	const busy = fetcher.state !== 'idle'
	// A saved result empties the time, so a second tap cannot save it twice.
	useEffect(() => {
		if (fetcher.state === 'idle' && fetcher.data?.ok) formRef.current?.reset()
	}, [fetcher.state, fetcher.data])
	const refusal = reply && !reply.ok ? reply : null
	const fieldError = (field: Field) =>
		refusal?.field === field ? [refusal.error] : null
	const items = RACE_ANCHORS.map((value) => ({
		value,
		label: anchorName(value),
	}))
	return (
		<fetcher.Form ref={formRef} method="POST" className="flex flex-col gap-4">
			<h2 className="text-heading">{L.add}</h2>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="result-anchor" className="text-footnote font-medium">
					{L.distance}
				</Label>
				<Select
					name="anchor"
					value={anchor}
					onValueChange={(value) => setAnchor((value as string) ?? '5k')}
					items={items}
				>
					<SelectTrigger id="result-anchor" className="w-full md:text-base">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{items.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								{item.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<MegField
				label={L.time}
				hint={L.timeHint}
				errors={fieldError('time')}
				inputProps={{
					id: 'result-time',
					name: 'time',
					required: true,
					placeholder: '41:30',
					// The decimal pad has digits and a separator, which the parser
					// reads as `:`; the letter keyboard hides `:` a layer down.
					inputMode: 'decimal',
					autoComplete: 'off',
					autoCorrect: 'off',
					spellCheck: false,
					enterKeyHint: 'done',
					className: 'tabular-nums',
				}}
			/>
			<MegField
				label={L.date}
				errors={fieldError('date')}
				inputProps={{
					id: 'result-date',
					name: 'date',
					type: 'date',
					required: true,
					max: today,
					defaultValue: today,
				}}
			/>
			<div className="flex flex-col gap-1.5">
				<p id="result-source" className="text-footnote font-medium">
					{L.source}
				</p>
				<SegmentedControl
					value={source}
					onValueChange={(next) => {
						if (next) setSource(next)
					}}
					aria-labelledby="result-source"
					className="w-full"
				>
					{PERFORMANCE_SOURCES.map((value) => (
						<ToggleGroupItem
							key={value}
							value={value}
							className="text-callout h-11 flex-1"
						>
							{L.sources[value]}
						</ToggleGroupItem>
					))}
				</SegmentedControl>
				<input type="hidden" name="source" value={source} />
			</div>
			<MegFormErrors
				errors={refusal && refusal.field == null ? [refusal.error] : null}
			/>
			<MegResult
				result={
					reply?.ok
						? { ok: true, message: reply.replaced ? L.replaced : L.saved }
						: null
				}
			/>
			<StatusButton
				type="submit"
				className="text-callout w-full sm:w-auto sm:self-start"
				status={busy ? 'pending' : 'idle'}
			>
				{L.save}
			</StatusButton>
		</fetcher.Form>
	)
}
