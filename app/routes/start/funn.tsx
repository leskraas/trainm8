import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { type CSSProperties, useEffect, useState } from 'react'
import { data, Form, Link, redirect, useRevalidator } from 'react-router'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { readFirstRunFindings } from '#app/utils/first-run/findings.server.ts'
import { FindingCorrectionSchema } from '#app/utils/first-run/first-run-schema.ts'
import {
	questionPrefill,
	type Finding,
} from '#app/utils/first-run/first-run.ts'
import { requireFirstRunAthlete } from '#app/utils/first-run/plan.server.ts'
import {
	FINDING_ABSENCE_LABELS,
	FIRST_RUN_LABELS,
	hoursEstimateLabel,
	NB_DISCIPLINE_LABELS,
	nbWeekdayList,
} from '#app/utils/labels.ts'
import { cn } from '#app/utils/misc.tsx'
import { derivedAttributionLines } from '#app/utils/source-attribution.ts'
import { type Route } from './+types/funn.ts'
import { DaysField, DisciplineField } from './__first-run-fields.tsx'
import {
	DISCLOSURE_CHEVRON,
	DISCLOSURE_TRIGGER,
	FirstRunFrame,
	PRIMARY_ACTION,
} from './__first-run-frame.tsx'

/**
 * The first run, step 2 (#505 stories 62, 63 and 71): "Dette fant vi" — what
 * the last four weeks say, each finding with its number or the reason it has
 * none — and "Noe er feil", which sets the pre-fill right before the
 * questions are asked.
 */

const L = FIRST_RUN_LABELS.findings

/** How often the screen looks again while the history is still arriving. */
const IMPORT_POLL_MS = 3000

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireFirstRunAthlete(request)
	const { findings, connection, bindingSet } =
		await readFirstRunFindings(userId)
	return {
		importing: connection === 'importing',
		// What the findings owe the data they were read from (ADR 0098 §3):
		// Garmin's derived-data line when the history came from a Garmin.
		credits: derivedAttributionLines(bindingSet),
		rows: [
			{
				key: 'discipline',
				label: L.discipline,
				...word(findings.discipline, (found) =>
					L.disciplineValue(
						NB_DISCIPLINE_LABELS[found.discipline],
						found.sessions,
						found.weeksTrained,
					),
				),
			},
			{
				key: 'volume',
				label: L.volume,
				...word(findings.volume, hoursEstimateLabel),
			},
			{
				key: 'days',
				label: L.days,
				...word(findings.days, nbWeekdayList),
			},
			{
				key: 'strength',
				label: L.strength,
				...word(findings.strength, (found) =>
					L.strengthValue(found.sessionsPerWeek),
				),
			},
		],
		prefill: questionPrefill(findings, {}),
	}
}

/**
 * A finding as one row's words: its value, or why it has none (story 71) —
 * or, while the import has yet to bring it, that it is coming (`pending`).
 */
function word<T>(finding: Finding<T>, value: (found: T) => string) {
	return finding.measured
		? { value: value(finding.value), absence: null, pending: false }
		: {
				value: null,
				absence: FINDING_ABSENCE_LABELS[finding.reason],
				pending: finding.reason === 'importing',
			}
}

export async function action({ request }: Route.ActionArgs) {
	await requireFirstRunAthlete(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, {
		schema: FindingCorrectionSchema,
	})
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	const corrected = new URLSearchParams({
		discipline: submission.value.discipline,
		hours: String(submission.value.hours),
		days: submission.value.days.join(','),
	})
	throw redirect(`/start/sporsmal?${corrected}`)
}

export default function FindingsStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const { importing, rows, prefill, credits } = loaderData
	const revalidator = useRevalidator()
	useEffect(() => {
		if (!importing) return
		const timer = window.setInterval(() => {
			if (revalidator.state === 'idle') void revalidator.revalidate()
		}, IMPORT_POLL_MS)
		return () => window.clearInterval(timer)
	}, [importing, revalidator])
	// Whether the screen opened while the history was still arriving: then the
	// import's line keeps its place once the history is in (CLS, below).
	const [openedImporting] = useState(importing)

	const [form, fields] = useForm({
		id: 'first-run-correct',
		constraint: getZodConstraint(FindingCorrectionSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: FindingCorrectionSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FirstRunFrame
			step={2}
			title={L.title}
			back={{ to: '/start', label: FIRST_RUN_LABELS.backTo.funn }}
			intro={
				openedImporting ? (
					// The import's line and the line that replaces it share one grid
					// cell, so the cell is as tall as the taller of the two from the
					// first paint and nothing below moves when the history lands (the
					// banner's going was most of the measured CLS 0.132).
					<div role="status" className="grid">
						<p
							className={cn(
								'[grid-area:1/1]',
								importing ? 'invisible' : undefined,
							)}
						>
							{L.intro} {L.imported}
						</p>
						<p
							className={cn(
								'[grid-area:1/1]',
								importing ? undefined : 'invisible',
							)}
						>
							{L.importing}
						</p>
					</div>
				) : (
					L.intro
				)
			}
		>
			<dl className="bg-card divide-border/60 divide-y rounded-4xl px-4 shadow-xs">
				{rows.map((row, index) => (
					<div
						key={row.key}
						className="space-y-0.5 py-3"
						data-finding={row.key}
					>
						<dt className="text-footnote text-muted-foreground">{row.label}</dt>
						<dd className="text-callout">
							{row.pending ? (
								// One line in the place of the value, so the row is the height
								// it will be when the value comes (the reason a row has no
								// number can be two lines; "Hentes …" never is).
								<span className="text-muted-foreground font-normal">
									{L.pending}
								</span>
							) : (
								<span
									// Keyed by the words, so a value arriving is a new element
									// and `motion-reveal` plays for it once.
									key={row.value ?? row.absence}
									className="motion-reveal block"
									style={{ '--reveal-index': index } as CSSProperties}
								>
									{row.value ?? (
										<span className="text-muted-foreground font-normal">
											{row.absence}
										</span>
									)}
								</span>
							)}
						</dd>
					</div>
				))}
			</dl>
			{/* Under the findings it speaks for, in view: never a tooltip or the
			    "Noe er feil" fold. No motion — it is a credit, not a finding. */}
			{credits.map((credit) => (
				<p
					key={credit}
					data-source-credit
					className="text-caption text-muted-foreground -mt-2 px-4 font-normal [text-wrap:pretty]"
				>
					{credit}
				</p>
			))}
			<Link to="/start/sporsmal" className={PRIMARY_ACTION}>
				{L.correct}
			</Link>
			<Collapsible
				defaultOpen={actionData?.result.status === 'error'}
				className="bg-card rounded-4xl shadow-xs"
			>
				<CollapsibleTrigger className={DISCLOSURE_TRIGGER}>
					{L.wrong}
					<Icon name="chevron-down" size="md" className={DISCLOSURE_CHEVRON} />
				</CollapsibleTrigger>
				<CollapsibleContent>
					<Form
						method="POST"
						className="space-y-6 px-4 pt-1 pb-4"
						{...getFormProps(form)}
					>
						<p className="text-footnote text-muted-foreground">
							{L.wrongIntro}
						</p>
						<DisciplineField
							meta={fields.discipline}
							legend={L.discipline}
							defaultDiscipline={prefill.discipline}
						/>
						<Field
							labelProps={{ children: L.volume, className: 'text-callout' }}
							inputProps={{
								...getInputProps(fields.hours, { type: 'number' }),
								step: '0.5',
								min: '0.5',
								inputMode: 'decimal',
								enterKeyHint: 'next',
								defaultValue: prefill.hours ?? '',
							}}
							errors={fields.hours.errors}
						/>
						<DaysField
							meta={fields.days}
							legend={L.days}
							defaultDays={prefill.days}
						/>
						<ErrorList errors={form.errors} id={form.errorId} />
						<Button
							type="submit"
							variant="secondary"
							className="text-callout w-full"
						>
							{L.saveCorrection}
						</Button>
					</Form>
				</CollapsibleContent>
			</Collapsible>
		</FirstRunFrame>
	)
}
