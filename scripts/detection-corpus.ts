import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { invariant } from '@epic-web/invariant'
import {
	type ActivityStream,
	isNum,
	parseStoredStream,
} from '#app/utils/activity-stream.ts'
import {
	type FitFile,
	oneSecondStream,
	readFitFile,
} from '#app/utils/structure-detection/eval/fit.ts'
import {
	fitTemplate,
	lapSets,
	parseTitleScheme,
	type TitleScheme,
	windowMeans,
} from '#app/utils/structure-detection/eval/label.ts'
import {
	labelEdges,
	matchEdges,
} from '#app/utils/structure-detection/eval/score.ts'
import {
	type CorpusActivity,
	type CorpusProfile,
	type DetectionCorpus,
	type DetectionLabel,
	type FitCorpusActivity,
	type FitSummary,
	type StructuredLabel,
} from '#app/utils/structure-detection/eval/types.ts'
import { median } from '#app/utils/structure-detection/signal.ts'
import {
	isDetectionDiscipline,
	type Lap,
} from '#app/utils/structure-detection/types.ts'
import { type DisciplineProfileForResolver } from '#app/utils/zones/resolve.ts'
import { FIT_DIR, fitPath } from './detection/fit-dir.ts'

/**
 * Freeze the detection scoreboard's corpus (map #600, tickets #605, #625) into
 * `tests/fixtures/detection/corpus.json`:
 *
 * - kody's real Strava runs as the engine reads them (5–6 s, no laps), each
 *   with its label from `tests/fixtures/detection/labels.json`. A structured
 *   label's scheme comes from the athlete's title and is placed on the stream
 *   by template fit.
 * - the owner's real FIT files in the private repo (`fit-dir.ts`; 1 s
 *   records, the file's own laps). A structured label comes from the laps
 *   (`lapSets`), so its edges are independent of the power channel the engine
 *   reads; the title and any Strava label of the same session are checked
 *   against it and every disagreement is printed. The file stays the frozen
 *   stream; the corpus keeps its path, laps and label.
 *
 * Re-run after editing a label:
 *
 *   npm run detection:corpus
 */

const SOURCE = 'prisma/seed-data/kody-strava-history.json'
const LABELS = 'tests/fixtures/detection/labels.json'
const OUT = 'tests/fixtures/detection/corpus.json'
/** Titles and devices of the FIT sessions, as Intervals.icu lists them. */
const ICU = 'prisma/seed-data/intervals-real-history.json'

/** kody's run profile exactly as `prisma/seed.ts` writes it. */
const SEED_RUN: DisciplineProfileForResolver = {
	maxHr: 190,
	lthr: 168,
	ftp: null,
	runPowerThresholdW: null,
	thresholdPaceSecPerKm: 240,
	cssSecPer100m: null,
	zoneSystem: 'daniels-pace-5',
	zoneOverrides: null,
}

type SeedActivity = {
	externalId: string
	startedAt: string
	discipline: string
	rawJson: string
	stream: Parameters<typeof parseStoredStream>[0]
}

type FitHandLabel =
	| Exclude<DetectionLabel, StructuredLabel>
	| { kind: 'structured'; reps: number; note: string }

type HandLabel =
	/** `scheme` is the athlete's own word for an untitled session, read like a title. */
	| { kind: 'structured'; scheme?: string; note?: string }
	| Exclude<DetectionLabel, StructuredLabel>

const seed = JSON.parse(readFileSync(SOURCE, 'utf8')) as {
	activities: SeedActivity[]
}
const { labels, fit: fitLabels = {} } = JSON.parse(
	readFileSync(LABELS, 'utf8'),
) as {
	labels: Record<string, HandLabel>
	/**
	 * Hand corrections for FIT sessions, keyed by Intervals.icu id: a label
	 * that replaces whatever the laps say, or, for a structured session, the
	 * rep count when the laps miss reps the stream shows.
	 */
	fit?: Record<string, FitHandLabel>
}

const activities: CorpusActivity[] = []
for (const a of seed.activities) {
	if (!isDetectionDiscipline(a.discipline)) continue
	const stream = parseStoredStream(a.stream)
	if (!stream) continue
	const raw = JSON.parse(a.rawJson) as { name: string; device_name?: string }
	const hand = labels[a.externalId]
	invariant(hand, `No label for ${a.externalId} "${raw.name}"`)
	let label: DetectionLabel
	if (hand.kind === 'structured') {
		const scheme = parseTitleScheme(hand.scheme ?? raw.name)
		invariant(scheme, `Cannot read a scheme from "${hand.scheme ?? raw.name}"`)
		const fit = fitTemplate(stream, scheme)
		invariant(fit, `Cannot place "${raw.name}" on its stream`)
		label = {
			kind: 'structured',
			source: hand.scheme ? 'athlete' : 'title',
			title: hand.scheme ?? raw.name,
			reps: scheme.reps,
			workSec: scheme.workSec,
			recoverySec: fit.recoverySec,
			work: fit.work,
			workValue: round(windowMeans(stream, fit.work)),
			contrast: Math.round(fit.contrast * 100) / 100,
		}
	} else {
		label = hand
	}
	activities.push({
		id: a.externalId,
		source: 'strava',
		device: raw.device_name ?? null,
		discipline: a.discipline,
		title: raw.name,
		startedAt: a.startedAt,
		stream,
		// The Strava snapshot keeps no laps (0 of 53 carry any; findings #604).
		laps: null,
		label,
	})
}

// Thresholds read off the labels: the median work power and pace of the i3
// reps of three minutes or more (10x3, 5x6), the sessions closest to
// threshold. The seed's 240 s/km is a placeholder, not kody's.
const longI3 = activities
	.map((a) => a.label)
	.filter(
		(l): l is StructuredLabel =>
			l.kind === 'structured' && /\bi3\b/.test(l.title) && l.workSec >= 180,
	)
const cp = Math.round(median(longI3.map((l) => l.workValue.power!)))
const pace = Math.round(median(longI3.map((l) => l.workValue.pace!)))
const fromLabels = `median work of ${longI3.map((l) => `"${l.title}"`).join(' and ')}`

const profiles: CorpusProfile[] = [
	{
		name: 'seed',
		provenance:
			'kody run profile as prisma/seed.ts writes it (threshold pace 240 s/km)',
		profile: SEED_RUN,
	},
	{
		name: 'label-pace',
		provenance: `threshold pace ${pace} s/km = ${fromLabels}`,
		profile: { ...SEED_RUN, thresholdPaceSecPerKm: pace },
	},
	{
		name: 'label-power',
		provenance: `critical power ${cp} W = ${fromLabels}`,
		profile: {
			...SEED_RUN,
			thresholdPaceSecPerKm: pace,
			runPowerThresholdW: cp,
		},
	},
	{
		name: 'hr',
		provenance:
			'seed LTHR 168, no pace or power threshold, so the HR rung classifies',
		profile: { ...SEED_RUN, thresholdPaceSecPerKm: null },
	},
]

const { fit, summary: fitSummary } = freezeFit()

const corpus: DetectionCorpus = {
	frozenAt: new Date().toISOString().slice(0, 10),
	from: SOURCE,
	profiles,
	activities,
	fit,
	fitSummary,
}
writeFileSync(OUT, JSON.stringify(corpus) + '\n')

const count = (k: DetectionLabel['kind']) =>
	activities.filter((a) => a.label.kind === k).length
console.log(
	`Froze ${activities.length} activities (${count('structured')} structured, ${count('unstructured')} unstructured, ${count('unlabelled')} unlabelled) to ${OUT}`,
)
for (const l of activities.map((a) => a.label)) {
	if (l.kind !== 'structured') continue
	console.log(
		`  ${l.title.padEnd(24)} ${l.reps}×${l.workSec}/${l.recoverySec} from ${l.work[0]!.startSec}s, work/recovery power ${l.contrast}`,
	)
}
for (const p of profiles) console.log(`  profile ${p.name}: ${p.provenance}`)
const fitCount = (k: DetectionLabel['kind']) =>
	fit.filter((a) => a.label.kind === k).length
const excludedCount = Object.values(fitSummary.excluded).reduce(
	(a, b) => a + b,
	0,
)
console.log(
	`Froze ${fit.length} labelled FIT sessions (${fitCount('structured')} structured, ${fitCount('unstructured')} unstructured) of ${fitSummary.files} files; ${fitSummary.unlabelled} run/bike sessions unlabelled and ${excludedCount} of other sports, neither kept`,
)

/**
 * The FIT half of the corpus. Prints what the files say about the device,
 * every label and how it was reached, and every disagreement between the laps,
 * the title and the Strava label of the same session.
 */
function freezeFit(): { fit: FitCorpusActivity[]; summary: FitSummary } {
	// A checkout without the private FIT repository still rebuilds the Strava
	// half: the FIT half stays as frozen.
	if (!existsSync(FIT_DIR)) {
		const frozen = existsSync(OUT)
			? (JSON.parse(readFileSync(OUT, 'utf8')) as Partial<DetectionCorpus>)
			: null
		console.log(
			`No FIT directory at ${FIT_DIR} (clone leskraas/trainm8-private next to this repo, or set DETECTION_FIT_DIR): kept the ${frozen?.fit?.length ?? 0} frozen FIT sessions and their summary`,
		)
		return {
			fit: frozen?.fit ?? [],
			summary: frozen?.fitSummary ?? { files: 0, unlabelled: 0, excluded: {} },
		}
	}
	const icu = new Map(
		(
			JSON.parse(readFileSync(ICU, 'utf8')) as {
				activities: Array<{
					externalId: string
					name: string
					raw: { device_name?: string }
				}>
			}
		).activities.map((a) => [a.externalId, a]),
	)
	const strava = new Map(
		activities.map((a) => [new Date(a.startedAt).getTime(), a]),
	)
	const out: FitCorpusActivity[] = []
	let unlabelled = 0
	const excluded: Record<string, number> = {}
	const skipped: string[] = []
	const flags: string[] = []
	const facts = {
		files: 0,
		writers: new Map<string, number>(),
		laps: 0,
		withStepIndex: 0,
		withTrigger: 0,
		intensities: new Map<string, number>(),
		workoutSteps: 0,
		lengths: 0,
		sports: new Map<string, number>(),
		recordSec: [] as number[],
	}
	const bump = (m: Map<string, number>, k: string) =>
		m.set(k, (m.get(k) ?? 0) + 1)

	for (const name of readdirSync(FIT_DIR)
		.filter((f) => f.endsWith('.fit'))
		.sort()) {
		const icuId = name.split('_')[0]!
		const meta = icu.get(icuId)
		const title =
			meta?.name ??
			name
				.slice(icuId.length + 1, -4)
				.replace(/_+/g, ' ')
				// A file name drops "/" and "(": "30x4515p" was "30x45/15p".
				.replace(/(\d+)x(\d{2})(\d{2})p?\b/, '$1x$2/$3')
				// …and ".": "10x25min" was "10x2.5 min" (over 100 min of reps is no session).
				.replace(/(\d+)x(\d)(\d)\s*min/, (m, reps, a, b) =>
					Number(reps) * Number(a + b) > 100 ? `${reps}x${a}.${b} min` : m,
				)
				.trim()
		let decoded: FitFile
		try {
			decoded = readFitFile(new Uint8Array(readFileSync(fitPath(name))))
		} catch (e) {
			skipped.push(`${name}: ${(e as Error).message}`)
			continue
		}
		facts.files++
		const w = decoded.writer
		const writer = `${w.manufacturer}/${w.productName ?? w.product ?? '-'}`
		bump(facts.writers, writer)
		facts.workoutSteps += decoded.workoutSteps.length
		facts.lengths += decoded.lengthCount
		decoded.sessions.forEach((session, si) => {
			bump(facts.sports, `${session.sport}/${session.subSport}`)
			for (const l of session.laps) {
				facts.laps++
				if (l.wktStepIndex != null) facts.withStepIndex++
				if (l.lapTrigger != null) facts.withTrigger++
				bump(facts.intensities, l.intensity ?? 'none')
			}
			if (session.recordIntervalSec != null)
				facts.recordSec.push(session.recordIntervalSec)
			const id = decoded.sessions.length > 1 ? `${icuId}#${si}` : icuId
			// The existing convention: only what Structure Detection runs for
			// (run, bike) enters the corpus.
			if (!isDetectionDiscipline(session.discipline)) {
				const sport = `${session.sport}/${session.subSport}`
				excluded[sport] = (excluded[sport] ?? 0) + 1
				skipped.push(
					`${id} "${title}": ${session.sport}/${session.subSport} → ${session.discipline}, not a detection discipline`,
				)
				return
			}
			const stream = session.raw && oneSecondStream(session.raw)
			if (!stream) {
				skipped.push(`${id} "${title}": no plottable records`)
				return
			}
			const twin = strava.get(new Date(session.startedAt).getTime()) ?? null
			const resolved = labelFitSession(
				id,
				title,
				stream,
				session.laps,
				twin,
				flags,
			)
			if (resolved.label.kind === 'unlabelled') {
				unlabelled++
				return
			}
			out.push({
				id,
				file: name,
				writer,
				device: meta?.raw.device_name ?? null,
				discipline: session.discipline,
				title,
				startedAt: session.startedAt,
				sameAs: twin?.id ?? null,
				laps: session.laps,
				labelFrom: resolved.from,
				label: resolved.label,
			})
		})
	}

	const list = (m: Map<string, number>) =>
		[...m].map(([k, n]) => `${k} ×${n}`).join(', ')
	const rec = facts.recordSec
	console.log(
		[
			`FIT device facts (${facts.files} files):`,
			`  file_id writer: ${list(facts.writers)}`,
			`  sports: ${list(facts.sports)}`,
			`  record interval (median per session): ${rec.filter((x) => x === 1).length} at 1 s, ${rec.filter((x) => x !== 1).length} coarser`,
			`  laps: ${facts.laps}; with wkt_step_index ${facts.withStepIndex}; with lap_trigger ${facts.withTrigger}; intensity ${list(facts.intensities)}`,
			`  workout_step messages: ${facts.workoutSteps}; length messages (pool swims): ${facts.lengths}`,
		].join('\n'),
	)
	for (const a of out) {
		const l = a.label
		const what =
			l.kind === 'structured'
				? `${l.reps}×${l.workSec}/${l.recoverySec}${l.sets ? ` sets ${l.sets.join('+')}` : ''}, contrast ${l.contrast}`
				: l.kind
		console.log(
			`  ${a.id} ${a.startedAt.slice(0, 10)} ${a.title.slice(0, 34).padEnd(34)} ${what.padEnd(36)} ← ${a.labelFrom}${a.sameAs ? ` (Strava ${a.sameAs})` : ''}`,
		)
	}
	console.log(`Skipped ${skipped.length}:`)
	for (const s of skipped) console.log(`  ${s}`)
	console.log(`Disagreements to check (${flags.length}):`)
	for (const f of flags) console.log(`  ${f}`)

	// Only labelled sessions keep their FIT file in the private repo; the owner keeps the
	// full export. A labelled session whose file is not on disk (a checkout
	// without the owner's export) keeps its frozen entry, and the summary of
	// the build that saw every file.
	let summary: FitSummary = { files: facts.files, unlabelled, excluded }
	const previous = existsSync(OUT)
		? (JSON.parse(readFileSync(OUT, 'utf8')) as Partial<DetectionCorpus>)
		: null
	const missing = (previous?.fit ?? []).filter(
		(a) => !existsSync(fitPath(a.file)) && !out.some((b) => b.id === a.id),
	)
	if (missing.length) {
		console.log(
			`Kept ${missing.length} frozen FIT sessions whose file is not on disk`,
		)
		out.push(...missing)
	}
	// A checkout holds only the labelled files: keep the counts of the build
	// that saw the owner's whole export.
	if (previous?.fitSummary && previous.fitSummary.files > facts.files) {
		console.log(
			`Saw ${facts.files} files, fewer than the ${previous.fitSummary.files} of the last full build: kept its summary`,
		)
		summary = previous.fitSummary
	}
	out.sort((a, b) => a.file.localeCompare(b.file))
	const kept = [...new Set(out.map((a) => a.file))]
	writeFileSync(
		`${FIT_DIR}/.gitignore`,
		[
			'# Generated by npm run detection:corpus. Only the FIT files of labelled',
			'# sessions are kept in git; the rest of the export stays with the owner.',
			'*.fit',
			...kept.map((f) => `!${f}`),
			'',
		].join('\n'),
	)
	return { fit: out, summary }
}

function labelFitSession(
	id: string,
	title: string,
	stream: ActivityStream,
	laps: FitCorpusActivity['laps'],
	twin: CorpusActivity | null,
	flags: string[],
): { label: DetectionLabel; from: string } {
	const override = fitLabels[id]
	const sets = lapSets(laps, (l) => windowHardness(stream, l))
	const scheme = parseTitleScheme(title)
	if (sets.length) {
		const main = [...sets].sort((a, b) => b.work.length - a.work.length)[0]!
		const work = sets.flatMap((s) => s.work)
		const recovery = sets.flatMap((s) => s.recovery)
		const workSec = Math.round(median(main.work.map(span)))
		const recoverySec = main.recovery.length
			? Math.round(median(main.recovery.map(span)))
			: 0
		const workPower = windowHardness(stream, ...work)
		const recoveryPower = windowHardness(stream, ...recovery)
		const label: StructuredLabel = {
			kind: 'structured',
			source: main.kind === 'step' ? 'step-laps' : 'manual-laps',
			title,
			reps: main.work.length,
			...(sets.length > 1 ? { sets: sets.map((s) => s.work.length) } : {}),
			workSec,
			recoverySec,
			work,
			// The main set's reps, the set `readPrediction` reads the work from.
			workValue: round(windowMeans(stream, main.work)),
			contrast:
				workPower && recoveryPower
					? Math.round((workPower / recoveryPower) * 100) / 100
					: 0,
		}
		checkScheme(id, `title "${title}"`, scheme, label, flags)
		if (twin?.label.kind === 'structured') {
			const t = twin.label
			checkScheme(
				id,
				`Strava "${twin.title}"${t.source === 'athlete' ? ` (athlete: ${t.title})` : ''}`,
				{ reps: t.reps, workSec: t.workSec, recoverySec: t.recoverySec },
				label,
				flags,
			)
			const err = matchEdges(labelEdges(label), labelEdges(t), 60)
			flags.push(
				`${id}: the Strava power-fit truth (contrast ${t.contrast}) sits ${err.length ? Math.round(median(err)) : '–'} s median / ${err.length ? Math.max(...err) : '–'} s max from the lap edges, ${err.length}/${labelEdges(label).length} edges within 60 s`,
			)
		} else if (twin) {
			flags.push(
				`${id} "${title}": the laps hold ${label.reps}×${workSec}/${recoverySec} but Strava ${twin.id} "${twin.title}" is labelled ${twin.label.kind}`,
			)
		}
		const from = sets.map((s) => `${s.kind} laps ${s.work.length}×`).join(' + ')
		if (override?.kind === 'structured') {
			flags.push(
				`${id} "${title}": hand label sets ${override.reps} reps where the laps hold ${label.reps}: ${override.note}`,
			)
			return {
				label: { ...label, reps: override.reps },
				from: `${from}, reps by hand`,
			}
		}
		if (override) {
			flags.push(
				`${id} "${title}": hand label ${override.kind} replaces the laps' ${label.reps}×${workSec}/${recoverySec}: ${override.note}`,
			)
			return { label: override, from: 'hand label over laps' }
		}
		return { label, from }
	}
	if (override?.kind === 'structured') {
		flags.push(`${id}: a structured hand label needs a lap set; ignored`)
	} else if (override) {
		return { label: override, from: 'hand label' }
	}
	if (twin?.label.kind === 'structured') {
		flags.push(
			`${id} "${title}": Strava labels it structured (${twin.label.title}) but its laps hold no set; unlabelled`,
		)
		return {
			label: { kind: 'unlabelled', note: 'Strava says structured; no lap set' },
			from: 'conflict',
		}
	}
	if (twin) return { label: twin.label, from: 'Strava hand label' }
	if (scheme) {
		const fit = fitTemplate(stream, scheme)
		invariant(fit, `Cannot place "${title}" on its stream`)
		flags.push(
			`${id} "${title}": no lap set, placed from the title by power fit`,
		)
		return {
			label: {
				kind: 'structured',
				source: 'title',
				title,
				reps: scheme.reps,
				workSec: scheme.workSec,
				recoverySec: fit.recoverySec,
				work: fit.work,
				workValue: round(windowMeans(stream, fit.work)),
				contrast: Math.round(fit.contrast * 100) / 100,
			},
			from: 'title, power fit',
		}
	}
	// Intervals.icu names a session from the planned workout or the sport.
	// "Basis" (base) and "Restitusjon" (recovery) are easy runs by name.
	if (/\b(Basis|Restitusjon)\b/i.test(title)) {
		return {
			label: {
				kind: 'unstructured',
				reason: 'steady',
				note: `Easy run by its planned title "${title}"; its laps hold no set.`,
			},
			from: 'title (easy run)',
		}
	}
	return {
		label: {
			kind: 'unlabelled',
			note: 'No lap set and a title that says nothing about structure.',
		},
		from: 'nothing to read',
	}
}

/** Flag where a title's (or a Strava label's) scheme disagrees with the laps. */
function checkScheme(
	id: string,
	what: string,
	scheme: TitleScheme | null,
	label: StructuredLabel,
	flags: string[],
) {
	if (!scheme) return
	const sets = label.sets ?? [label.reps]
	const total = sets.reduce((a, b) => a + b, 0)
	const issues: string[] = []
	if (scheme.reps !== label.reps)
		issues.push(
			`reps ${scheme.reps} vs ${sets.join('+')}${scheme.reps === total ? ' (the sum)' : ''}`,
		)
	if (Math.abs(scheme.workSec - label.workSec) > 0.1 * scheme.workSec)
		issues.push(`work ${scheme.workSec} s vs ${label.workSec} s`)
	if (
		scheme.recoverySec != null &&
		Math.abs(scheme.recoverySec - label.recoverySec) > 10
	)
		issues.push(`recovery ${scheme.recoverySec} s vs ${label.recoverySec} s`)
	if (issues.length)
		flags.push(`${id}: ${what} disagrees with the laps: ${issues.join('; ')}`)
}

function span(l: Lap) {
	return l.endSec - l.startSec
}

/** How hard the given windows were: mean power, or speed when there is no power; null when neither. */
function windowHardness(
	stream: ActivityStream,
	...windows: Lap[]
): number | null {
	const vals =
		stream.power ??
		stream.pace?.map((p) => (isNum(p) && p > 0 ? 1000 / p : null))
	if (!vals) return null
	let sum = 0
	let n = 0
	stream.timeSec.forEach((t, i) => {
		const v = vals[i]
		if (isNum(v) && windows.some((w) => t >= w.startSec && t < w.endSec)) {
			sum += v
			n++
		}
	})
	return n ? sum / n : null
}

function round<T extends Record<string, number | undefined>>(o: T): T {
	return Object.fromEntries(
		Object.entries(o)
			.filter(([, v]) => v != null)
			.map(([k, v]) => [k, Math.round(v! * 10) / 10]),
	) as T
}
