/**
 * **Nivå og økter** — what the start asked, in _Meg_ (#558 story 12 and 124,
 * #571): the **Training Level**, the activities the plan has tracks for, and
 * the **Session Preferences**. The level and the preferences are the
 * athlete's answers and change here; the activities are the plan's Training
 * Tracks, read from the plan and changed where tracks are (Plan → Avansert).
 * Changing an answer never rewrites the weeks already laid: it is read the
 * next time the Start Options are (_Bytt treningsform_, ADR 0102).
 */
import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, Form, Link, useNavigation } from 'react-router'
import { z } from 'zod/v3'
import {
	CheckboxCardsField,
	ErrorList,
	RadioGroupField,
} from '#app/components/forms.tsx'
import { PageHeader } from '#app/components/page-header.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	readStartAnswersOf,
	updateAthleteProfile,
} from '#app/utils/athlete.server.ts'
import { requireUserId } from '#app/utils/auth.server.ts'
import {
	SESSION_PREFERENCES,
	TRAINING_LEVELS,
} from '#app/utils/first-run/start-draft.ts'
import {
	LevelSchema,
	PreferencesSchema,
} from '#app/utils/first-run/start-schema.ts'
import {
	APP_TAB_LABELS,
	NB_DISCIPLINE_LABELS,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { type Discipline } from '#app/utils/workout-schema.ts'
import { type Route } from './+types/level.ts'
import { MegNote, MegResult, MegSection } from './__meg-ui.tsx'

export const handle: SEOHandle = { getSitemapEntries: () => null }

const L = SESSION_PREFERENCE_LABELS.meg

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

const StartAnswersSchema = z.object({
	level: LevelSchema,
	preferences: PreferencesSchema.optional(),
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const [answers, active] = await Promise.all([
		readStartAnswersOf(userId),
		findActiveOutline(userId, new Date()),
	])
	// One activity per Training Track, in the plan's order, each once.
	const activities = [
		...new Set(
			(active?.outline.tracks ?? []).map(
				(track) => NB_DISCIPLINE_LABELS[track.discipline as Discipline],
			),
		),
	]
	return { ...answers, activities }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const submission = parseWithZod(await request.formData(), {
		schema: StartAnswersSchema,
	})
	if (submission.status !== 'success') {
		return data({ result: submission.reply(), saved: null }, { status: 400 })
	}
	const { level, preferences } = submission.value
	await updateAthleteProfile(userId, {
		trainingLevel: level,
		sessionPreferences: preferences ?? [],
	})
	return {
		result: submission.reply(),
		saved: { ok: true as const, message: L.saved },
	}
}

export default function StartAnswersRoute({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const navigation = useNavigation()
	const saving = navigation.state !== 'idle' && navigation.formMethod === 'POST'
	const [form, fields] = useForm({
		id: 'meg-start-answers',
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: StartAnswersSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="container mx-auto max-w-2xl py-6 md:py-8">
			<PageHeader
				title={L.title}
				back={{ to: '/me', label: APP_TAB_LABELS.me }}
			/>
			<main className="mt-6 space-y-8">
				<MegNote>{L.intro}</MegNote>

				<MegSection id="meg-activities" title={L.activities}>
					<div className="space-y-2" data-meg-activities>
						<p className="text-callout [overflow-wrap:anywhere]">
							{loaderData.activities.length > 0
								? loaderData.activities.join(', ')
								: L.activitiesNone}
						</p>
						{loaderData.activities.length > 0 ? (
							<>
								<MegNote>{L.activitiesNote}</MegNote>
								<Link
									to="/training/plan"
									prefetch="intent"
									className="text-callout text-primary flex min-h-11 items-center underline-offset-4 hover:underline"
								>
									{L.activitiesLink}
								</Link>
							</>
						) : null}
					</div>
				</MegSection>

				<Form method="POST" className="space-y-8" {...getFormProps(form)}>
					<RadioGroupField
						name={fields.level.name}
						legend={L.level}
						legendClassName="text-heading"
						defaultValue={loaderData.level ?? undefined}
						options={TRAINING_LEVELS.map((value) => ({
							value,
							label: SIMPLE_START_LABELS.levels[value].name,
							description: SIMPLE_START_LABELS.levels[value].description,
						}))}
						errorId={fields.level.errorId}
						errors={fields.level.errors}
					/>

					<CheckboxCardsField
						name={fields.preferences.name}
						legend={SESSION_PREFERENCE_LABELS.legend}
						legendClassName="text-heading"
						defaultValue={loaderData.preferences}
						options={SESSION_PREFERENCES.map((value) => ({
							value,
							label: SESSION_PREFERENCE_LABELS.options[value].name,
							description: SESSION_PREFERENCE_LABELS.options[value].description,
						}))}
					/>

					<ErrorList errors={form.errors} id={form.errorId} />
					<div className="space-y-2">
						<StatusButton
							type="submit"
							className="text-callout w-full sm:w-auto"
							status={saving ? 'pending' : 'idle'}
							disabled={saving}
						>
							{L.save}
						</StatusButton>
						<MegResult result={actionData?.saved} />
					</div>
				</Form>
			</main>
		</div>
	)
}
