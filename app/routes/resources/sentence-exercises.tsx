import { requireUserId } from '#app/utils/auth.server.ts'
import { readSentenceExercises } from '#app/utils/writing-line.server.ts'
import { type Route } from './+types/sentence-exercises.ts'

/**
 * The exercise database the writing line names lifts against (ADR 0089), read
 * once when a line opens rather than in home's loader: most visits to I dag
 * write nothing, and none of them should carry eight hundred names for it.
 *
 * Like `resources/week-sum`, a failure answers as data and not a throw (ADR
 * 0082 §11): without the list a lift waits on the line (`exercisesNeeded`),
 * a run reads as it always did, and the server reads the sentence again on
 * save with its own copy.
 */
export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	try {
		return { exercises: await readSentenceExercises(userId) }
	} catch (error) {
		console.error('[sentence-exercises] the catalogue could not be read', error)
		return { exercises: null }
	}
}
