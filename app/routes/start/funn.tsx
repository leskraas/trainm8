import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { useEffect } from 'react'
import { data, Form, Link, redirect, useRevalidator } from 'react-router'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { Button } from '#app/components/ui/button.tsx'
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
import { type Route } from './+types/funn.ts'
import { DaysField, DisciplineField } from './__first-run-fields.tsx'
import { FirstRunFrame, PRIMARY_ACTION } from './__first-run-frame.tsx'

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
	const { findings, connection } = await readFirstRunFindings(userId)
	return {
		importing: connection === 'importing',
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

/** A finding as one row's words: its value, or why it has none (story 71). */
function word<T>(finding: Finding<T>, value: (found: T) => string) {
	return finding.measured
		? { value: value(finding.value), absence: null }
		: { value: null, absence: FINDING_ABSENCE_LABELS[finding.reason] }
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
	const { importing, rows, prefill } = loaderData
	const revalidator = useRevalidator()
	useEffect(() => {
		if (!importing) return
		const timer = window.setInterval(() => {
			if (revalidator.state === 'idle') void revalidator.revalidate()
		}, IMPORT_POLL_MS)
		return () => window.clearInterval(timer)
	}, [importing, revalidator])

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
		<FirstRunFrame step={2} title={L.title} intro={L.intro}>
			{importing ? (
				<p role="status" className="bg-muted rounded-xl p-3 text-sm">
					{L.importing}
				</p>
			) : null}
			<dl className="divide-border divide-y">
				{rows.map((row) => (
					<div
						key={row.key}
						className="space-y-0.5 py-3"
						data-finding={row.key}
					>
						<dt className="text-muted-foreground text-[13px] font-medium">
							{row.label}
						</dt>
						<dd className="text-[15px]">
							{row.value ?? (
								<span className="text-muted-foreground">{row.absence}</span>
							)}
						</dd>
					</div>
				))}
			</dl>
			<Link to="/start/sporsmal" className={PRIMARY_ACTION}>
				{L.correct}
			</Link>
			<details
				className="border-border rounded-xl border p-4"
				open={actionData?.result.status === 'error' ? true : undefined}
			>
				<summary className="min-h-11 cursor-pointer content-center text-[15px] font-medium">
					{L.wrong}
				</summary>
				<Form method="POST" className="mt-3 space-y-4" {...getFormProps(form)}>
					<p className="text-muted-foreground text-sm">{L.wrongIntro}</p>
					<DisciplineField
						meta={fields.discipline}
						legend={L.discipline}
						defaultDiscipline={prefill.discipline}
					/>
					<Field
						labelProps={{ children: L.volume }}
						inputProps={{
							...getInputProps(fields.hours, { type: 'number' }),
							step: '0.5',
							min: '0.5',
							inputMode: 'decimal',
							defaultValue: prefill.hours ?? '',
							className: 'text-base',
						}}
						errors={fields.hours.errors}
					/>
					<DaysField
						meta={fields.days}
						legend={L.days}
						defaultDays={prefill.days}
					/>
					<ErrorList errors={form.errors} id={form.errorId} />
					<Button type="submit" className="min-h-11 w-full">
						{L.saveCorrection}
					</Button>
				</Form>
			</details>
		</FirstRunFrame>
	)
}
