import sys

p = sys.argv[1]
s = open(p).read()


def rep(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:80], s.count(old))
    s = s.replace(old, new)


rep("""import { APP_TAB_LABELS } from '#app/utils/labels.ts'
import { readMostTrainedDiscipline } from '#app/utils/most-trained-discipline.server.ts'
import { getDisciplineLabel } from '#app/utils/training.ts'
import { buildBlocksInput, FormSchema } from '#app/utils/workout-authoring.ts'
import {
	DISCIPLINES,
	WORKOUT_INTENTS,
	INTENT_LABELS,
	WorkoutAuthoringSchema,
} from '#app/utils/workout-schema.ts'
""", """import {
	APP_TAB_LABELS,
	NB_INTENT_LABELS,
	NEW_SESSION_LABELS,
	WORKOUT_DETAIL_LABELS,
	nbDisciplineLabel,
} from '#app/utils/labels.ts'
import { readMostTrainedDiscipline } from '#app/utils/most-trained-discipline.server.ts'
import { buildBlocksInput, FormSchema } from '#app/utils/workout-authoring.ts'
import {
	DISCIPLINES,
	WORKOUT_INTENTS,
	WorkoutAuthoringSchema,
} from '#app/utils/workout-schema.ts'
""")
rep("""export const meta: Route.MetaFunction = () => [
	{ title: 'New Workout Session | Trainm8' },
]
""", """const L = NEW_SESSION_LABELS

/**
 * The full editor page, in Norwegian on the design system (#505 round 2). It
 * is the no-JS and deep-link way in — the composer's full snap point is the
 * quick one (owner decision 1) — and the page a strength day's "Mer" opens.
 * The route and its query (`?date=`, `?discipline=`) stay as they are: the
 * composer and I dag link here.
 */
export const meta: Route.MetaFunction = () => [{ title: L.metaTitle }]
""")
rep("""						scheduledAtDate: ['Invalid date and time combination'],""", """						scheduledAtDate: [WORKOUT_DETAIL_LABELS.errors.badDateTime],""")
rep("""			<PageHeader
				title="New Workout Session"
				back={{ to: '/', label: APP_TAB_LABELS.today }}
				className="mb-6"
			/>""", """			<PageHeader
				title={L.title}
				back={{ to: '/', label: APP_TAB_LABELS.today }}
				className="mb-6"
			/>""")
rep("""							<Field
								labelProps={{ children: 'Title' }}
								inputProps={{
									...getInputProps(fields.title, { type: 'text' }),
									placeholder: 'e.g. Tuesday Tempo Run',
									autoFocus: true,
								}}
								errors={fields.title.errors as string[] | undefined}
							/>""", """							<Field
								labelProps={{ children: L.name }}
								inputProps={{
									...getInputProps(fields.title, { type: 'text' }),
									placeholder: L.namePlaceholder,
									autoFocus: true,
									enterKeyHint: 'next',
								}}
								errors={fields.title.errors as string[] | undefined}
							/>""")
rep("""								labelProps={{
									children: 'Discipline',
									className: 'text-body-xs text-muted-foreground font-medium',
								}}
								items={DISCIPLINES.map((type) => ({
									value: type,
									label: getDisciplineLabel(type),
								}))}
								// Shown when nothing is prefilled, which is what an athlete
								// with no history to derive one from gets (ADR 0065 §5).
								placeholder="Pick a discipline\"""", """								labelProps={{ children: L.sport }}
								items={DISCIPLINES.map((type) => ({
									value: type,
									label: nbDisciplineLabel(type),
								}))}
								// Shown when nothing is prefilled, which is what an athlete
								// with no history to derive one from gets (ADR 0065 §5).
								placeholder={L.sportPlaceholder}""")
rep("""								labelProps={{
									children: 'Intent',
									className: 'text-body-xs text-muted-foreground font-medium',
								}}
								items={WORKOUT_INTENTS.map((value) => ({
									value,
									label: INTENT_LABELS[value],
								}))}""", """								labelProps={{ children: L.intent }}
								items={WORKOUT_INTENTS.map((value) => ({
									value,
									label: NB_INTENT_LABELS[value],
								}))}""")
rep("""									labelProps={{ children: 'Date' }}""", """									labelProps={{ children: L.date }}""")
rep("""									labelProps={{ children: 'Time' }}""", """									labelProps={{ children: L.time }}""")
rep("""							{/* One action row; dismissal lives in the header's back
							    button (#279, #282). */}
							<div className="flex">
								<Button type="submit" className="w-full sm:w-auto">
									Create Session
								</Button>
							</div>""", """							{/* One action row; dismissal lives in the header's back
							    button (#279, #282). It sits clear of the fixed tab bar
							    at 390px: the page pads its foot for the bar. */}
							<div className="flex">
								<Button type="submit" className="w-full sm:w-auto">
									{L.create}
								</Button>
							</div>""")
open(p, 'w').write(s)
