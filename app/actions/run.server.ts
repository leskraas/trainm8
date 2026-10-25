/**
 * `runAction` (ADR 0092 §1): the one entry every reader calls — the routes as
 * `web`, the MCP server as `mcp`, a later in-app agent as `agent`.
 *
 * In order, and the same for every reader:
 *
 * 1. **Caller.** An action runs only for the callers it lists. A model that
 *    reaches one of the athlete's own yeses is refused `needs-athlete-yes`,
 *    with the link to where the athlete answers (ADR 0093 §3); any other
 *    caller outside the list is `not-allowed`.
 * 2. **Scope.** A credential that carries scopes must carry the kind's
 *    (`needs-scope`). The MCP reader answers `403 insufficient_scope` before
 *    it gets here; this is the same rule for every other reader.
 * 3. **Input,** validated once against the action's `zod/v4` schema
 *    (`invalid-input`). Readers do not validate it again.
 * 4. **Run,** with the provenance gate's credit sink. A refusal is returned,
 *    never thrown. Anything thrown is `not-run` for a read (nothing was
 *    written) and `unknown` for a write (it may have committed: read first).
 *
 * It never throws, except for a name no action has, which is a programming
 * error rather than an outcome.
 */

import * as Sentry from '@sentry/react-router'
import { ATTRIBUTIONS } from '#app/utils/source-terms.ts'
import { type ActionCtx, type AnyActionResult, type RunCtx } from './define.ts'
import { type Credit } from './reading.ts'
import { ATHLETE_YES_PATH } from './paths.ts'
import { Refusal, nextOf, refuse } from './refusals.ts'
import { type ActionName, getAction, type ResultOf } from './registry.server.ts'
import { isModelCaller, SCOPE_OF_KIND } from './vocabulary.ts'

export async function runAction<N extends ActionName>(
	ctx: ActionCtx,
	name: N,
	rawInput: unknown,
): Promise<ResultOf<N>> {
	return (await run(ctx, name, rawInput)) as ResultOf<N>
}

async function run(
	ctx: ActionCtx,
	name: ActionName,
	rawInput: unknown,
): Promise<AnyActionResult> {
	const action = getAction(name)
	const link = (path: string) => new URL(path, ctx.origin).toString()

	if (!action.callers.includes(ctx.caller)) {
		const answersForTheAthlete =
			isModelCaller(ctx.caller) && action.callers.includes('web')
		return refused(
			answersForTheAthlete
				? refuse('needs-athlete-yes', { link: link(ATHLETE_YES_PATH) })
				: refuse('not-allowed'),
		)
	}
	if (ctx.scopes && !ctx.scopes.includes(SCOPE_OF_KIND[action.kind])) {
		return refused(refuse('needs-scope'))
	}

	const parsed = action.input.safeParse(rawInput ?? {})
	if (!parsed.success) return refused(refuse('invalid-input'))

	// One of each line, however many values owe it.
	const owed = new Map<string, Credit>()
	const runCtx: RunCtx = {
		...ctx,
		credit: (credit) => owed.set(`${credit.platform}\0${credit.text}`, credit),
		link,
	}
	try {
		const value: unknown = await action.run(runCtx, parsed.data)
		if (value instanceof Refusal) return refused(value)
		return {
			outcome: 'done',
			value,
			// In the platforms' fixed order, and each platform's lines in the
			// order the action first owed them, so a result reads the same each time.
			credits: [...owed.values()].sort(
				(a, b) =>
					ATTRIBUTIONS.indexOf(a.platform) - ATTRIBUTIONS.indexOf(b.platform),
			),
		}
	} catch (error) {
		console.error(`[actions] ${name} failed`, error)
		// The envelope says only `not-run` or `unknown`, so the error itself
		// reaches Sentry here or nowhere.
		Sentry.captureException(error)
		return action.kind === 'read'
			? { outcome: 'not-run', reason: 'internal' }
			: {
					outcome: 'unknown',
					message:
						'The action failed after it started and may have changed something. Read before retrying.',
				}
	}
}

function refused(refusal: Refusal): AnyActionResult {
	return {
		outcome: 'refused',
		code: refusal.code,
		next: nextOf(refusal.code),
		message: refusal.message,
		...(refusal.link ? { link: refusal.link } : {}),
	}
}
