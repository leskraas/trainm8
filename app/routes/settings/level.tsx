/**
 * **Nivå og økter** — what the start asked, in _Meg_ (#558 story 12 and 124,
 * #571, #587): the activities the plan lays, the **Training Level** and the
 * **Session Preferences**.
 *
 * - The activities are the plan's Training Tracks, retired ones left out.
 *   Editing them re-lays the plan's tracks and days from the first week not
 *   yet begun, previewed first (_Vis ny uke_) and laid on _Bekreft_ (ADR
 *   0109, `__activities-edit.tsx`). A plan the edit cannot lay keeps them
 *   read-only, with why and the way to Plan.
 * - The level and the preferences are the athlete's answers and change here
 *   without rewriting the weeks laid: they are read the next time the Start
 *   Options are (_Bytt treningsform_, ADR 0102).
 */
import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod/v3'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, Form, useNavigation } from 'react-router'
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
import { readPlanStartAnswers } from '#app/utils/first-run/plan-start-options.server.ts'
import {
	SESSION_PREFERENCES,
	TRAINING_LEVELS,
} from '#app/utils/first-run/start-draft.ts'
import {
	LevelSchema,
	PreferencesSchema,
} from '#app/utils/first-run/start-schema.ts'
import {
	ACTIVITIES_EDIT_LABELS,
	APP_TAB_LABELS,
	SESSION_PREFERENCE_LABELS,
	SIMPLE_START_LABELS,
} from '#app/utils/labels.ts'
import { readFirstUnbegunWeekKey } from '#app/utils/load/week-begun.server.ts'
import { getActiveSeason } from '#app/utils/training.server.ts'
import { type Route } from './+types/level.ts'
import {
	activitiesAction,
	activitiesViewOf,
	noPlanActivities,
} from './__activities-edit.server.ts'
import { ActivitiesSection } from './__activities-edit.tsx'
import { MegNote, MegResult } from './__meg-ui.tsx'

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
	const now = new Date()
	const [answers, season] = await Promise.all([
		readStartAnswersOf(userId),
		getActiveSeason(userId, now),
	])
	// The plan's activities from the first week not yet begun: where an edit
	// would begin, and what it would change (ADR 0109). With no plan there is
	// no such week, and nothing to read.
	if (!season) return { ...answers, activities: noPlanActivities() }
	const from = await readFirstUnbegunWeekKey(userId, now, season.timezone)
	const reading = await readPlanStartAnswers(userId, season, from, now, {
		offerStrength: true,
	})
	return { ...answers, activities: activitiesViewOf(season, reading, from) }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	if (intent === 'preview-activities' || intent === 'confirm-activities') {
		return activitiesAction(userId, formData)
	}
	const submission = parseWithZod(formData, {
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
	// The activities answer through their own fetcher; this is the level's.
	const answered = actionData && 'result' in actionData ? actionData : null
	const saved = answered?.saved
	const [form, fields] = useForm({
		id: 'meg-start-answers',
		lastResult: answered?.result,
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
				<ActivitiesSection view={loaderData.activities} />

				<section
					aria-labelledby="meg-answers"
					className="space-y-8"
					data-meg-answers
				>
					<div className="space-y-1">
						<h2 id="meg-answers" className="text-heading">
							{ACTIVITIES_EDIT_LABELS.answersTitle}
						</h2>
						<MegNote>{ACTIVITIES_EDIT_LABELS.answersIntro}</MegNote>
					</div>
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
								description:
									SESSION_PREFERENCE_LABELS.options[value].description,
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
							<MegResult result={saved} />
						</div>
					</Form>
				</section>
			</main>
		</div>
	)
}
