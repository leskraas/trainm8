/**
 * **Løpsresultater** — the athlete's own race and time-trial results (#464,
 * ADR 0007 as amended), the data a `racePace` step resolves against. Typed
 * here, so every row says it was typed and none is `verified`; the list is
 * newest first because the newest result at a distance is the one a target
 * reads (a prescription is about now).
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { useState } from 'react'
import { data, useFetcher } from 'react-router'
import { z } from 'zod/v3'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { Input } from '#app/components/ui/input.tsx'
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
	formatNbDate,
	formatPace,
} from '#app/utils/format.ts'
import {
	INTENSITY_DISPLAY_WORDS,
	MEG_RESULTS_LABELS,
} from '#app/utils/labels.ts'
import {
	addPerformanceResult,
	deletePerformanceResult,
	listPerformanceResults,
	parseFinishTime,
	PERFORMANCE_SOURCES,
	type PerformanceSource,
} from '#app/utils/performance-result-writer.server.ts'
import { RACE_ANCHORS } from '#app/utils/workout-schema.ts'
import { MegFormErrors, MegNote } from '../__meg-ui.tsx'
import { type Route } from './+types/resultater.ts'

const L = MEG_RESULTS_LABELS
// The component cannot import the writer's value (a .server module); the
// `satisfies` keeps this list and the writer's in step.
const SOURCE_CHOICES = [
	'race',
	'timeTrial',
] as const satisfies readonly PerformanceSource[]
const anchorName = (anchor: string) =>
	INTENSITY_DISPLAY_WORDS.race[anchor] ?? anchor

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: L.title,
	getSitemapEntries: () => null,
}

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const rows = await listPerformanceResults(userId)
	return {
		results: rows.map((row) => ({
			id: row.id,
			distance: row.anchor
				? anchorName(row.anchor)
				: `${(row.distanceM / 1000).toFixed(1).replace('.', ',')} km`,
			time: formatClockDuration(row.timeSec),
			pace: formatPace(Math.round(row.timeSec / (row.distanceM / 1000))),
			date: formatNbDate(row.occurredAt, 'UTC'),
			source: L.sources[row.source] ?? row.source,
			typed: !row.verified,
		})),
		today: new Date().toISOString().slice(0, 10),
	}
}

const AddSchema = z.object({
	anchor: z.enum(RACE_ANCHORS),
	time: z.string().max(12),
	date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	source: z.enum(PERFORMANCE_SOURCES),
})

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()

	if (formData.get('intent') === 'delete') {
		const id = String(formData.get('id') ?? '')
		const deleted = id ? await deletePerformanceResult(userId, id) : false
		return deleted
			? { ok: true as const, error: null }
			: data({ ok: false as const, error: L.invalid }, { status: 404 })
	}

	const parsed = AddSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) {
		return data({ ok: false as const, error: L.invalid }, { status: 400 })
	}
	const timeSec = parseFinishTime(parsed.data.time)
	if (timeSec == null) {
		return data({ ok: false as const, error: L.badTime }, { status: 400 })
	}
	// Day-anchored, as an Event date is: UTC midnight of the named day.
	const occurredAt = new Date(`${parsed.data.date}T00:00:00Z`)
	if (Number.isNaN(occurredAt.getTime())) {
		return data({ ok: false as const, error: L.invalid }, { status: 400 })
	}
	const added = await addPerformanceResult(userId, {
		anchor: parsed.data.anchor,
		timeSec,
		occurredAt,
		source: parsed.data.source,
	})
	if (!added.ok) {
		return data(
			{
				ok: false as const,
				error: added.reason === 'future' ? L.future : L.noProfile,
			},
			{ status: 400 },
		)
	}
	return { ok: true as const, error: null }
}

export default function RaceResultsSettings({
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
	// Optimistic: the row leaves on the tap, and returns if the delete fails.
	if (fetcher.state !== 'idle') return null
	return (
		<li
			data-testid="race-result"
			className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3"
		>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="text-callout tabular-nums">
					{result.distance} · {result.time}
				</span>
				<span className="text-footnote text-muted-foreground tabular-nums">
					{result.pace} · {result.source} · {result.date}
				</span>
				{result.typed ? (
					<span className="text-caption text-muted-foreground">
						{L.typedNote}
					</span>
				) : null}
			</span>
			<fetcher.Form method="POST">
				<input type="hidden" name="intent" value="delete" />
				<input type="hidden" name="id" value={result.id} />
				<Button
					type="submit"
					variant="ghost"
					size="sm"
					aria-label={L.deleteLabel(`${result.distance} ${result.time}`)}
				>
					{L.delete}
				</Button>
			</fetcher.Form>
		</li>
	)
}

function AddResultForm({ today }: { today: string }) {
	const fetcher = useFetcher<typeof action>()
	const [anchor, setAnchor] = useState<string>('5k')
	const [source, setSource] = useState<string>('race')
	const reply = fetcher.data ?? null
	const busy = fetcher.state !== 'idle'
	const items = RACE_ANCHORS.map((value) => ({
		value,
		label: anchorName(value),
	}))
	return (
		<fetcher.Form method="POST" className="flex flex-col gap-4">
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
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="result-time" className="text-footnote font-medium">
					{L.time}
				</Label>
				<Input
					id="result-time"
					name="time"
					required
					placeholder="41:30"
					autoComplete="off"
					autoCorrect="off"
					spellCheck={false}
					enterKeyHint="next"
					aria-describedby="result-time-hint"
					className="tabular-nums md:text-base"
				/>
				<MegNote id="result-time-hint">{L.timeHint}</MegNote>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="result-date" className="text-footnote font-medium">
					{L.date}
				</Label>
				<Input
					id="result-date"
					name="date"
					type="date"
					required
					max={today}
					defaultValue={today}
					className="md:text-base"
				/>
			</div>
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
					{SOURCE_CHOICES.map((value) => (
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
				errors={reply && !reply.ok && reply.error ? [reply.error] : undefined}
			/>
			<StatusButton
				type="submit"
				className="text-callout w-full sm:w-auto sm:self-start"
				status={busy ? 'pending' : reply?.ok ? 'success' : 'idle'}
			>
				{L.save}
			</StatusButton>
		</fetcher.Form>
	)
}
