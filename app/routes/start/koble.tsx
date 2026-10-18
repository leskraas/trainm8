import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v3'
import { data, Form, Link, redirect } from 'react-router'
import { z } from 'zod/v3'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	linkIntervalsIcu,
	type LinkIntervalsIcuRefusal,
} from '#app/integrations/intervalsicu/link.server.ts'
import { INTERVALSICU_PROVIDER } from '#app/integrations/intervalsicu/types.ts'
import { getAccountConnection } from '#app/utils/account-connection.server.ts'
import { requireSimpleStartAthlete } from '#app/utils/first-run/plan.server.ts'
import { FIRST_RUN_LABELS } from '#app/utils/labels.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { type Route } from './+types/koble.ts'
import {
	FirstRunFrame,
	PRIMARY_ACTION,
	SECONDARY_ACTION,
} from './__first-run-frame.tsx'

/**
 * Connect intervals.icu from the start (#578): the quiet link on the level
 * screen leads here, never a step of its own. Linked, the athlete goes back
 * to the level screen, where the history pre-fills the hours and days once it
 * is in. The link is the Integration Hub's own (`linkIntervalsIcu`), Backfill
 * Window included.
 */

/** Where the athlete goes back to, linked or not: the start's first screen. */
const LEVEL_SCREEN = '/start/niva'

const L = FIRST_RUN_LABELS.connect

const ConnectSchema = z.object({
	apiKey: z.string({ required_error: L.emptyKey }).trim().min(1, L.emptyKey),
})

const REFUSALS: Record<LinkIntervalsIcuRefusal, string> = {
	'empty-key': L.emptyKey,
	'key-rejected': L.rejected,
	unreachable: L.unreachable,
}

export const meta: Route.MetaFunction = () => [
	{ title: `${L.title} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const link = await getAccountConnection(userId, INTERVALSICU_PROVIDER)
	return { connected: link?.status === 'active' }
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireSimpleStartAthlete(request)
	const formData = await request.formData()
	const submission = parseWithZod(formData, { schema: ConnectSchema })
	if (submission.status !== 'success') {
		return data({ result: submission.reply() }, { status: 400 })
	}
	const linked = await linkIntervalsIcu(userId, submission.value.apiKey)
	if (!linked.ok) {
		return data(
			{
				result: submission.reply({
					fieldErrors: { apiKey: [REFUSALS[linked.reason]] },
				}),
			},
			{ status: linked.reason === 'unreachable' ? 502 : 400 },
		)
	}
	throw redirect(LEVEL_SCREEN)
}

export default function ConnectStep({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'first-run-connect',
		constraint: getZodConstraint(ConnectSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ConnectSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<FirstRunFrame
			title={L.title}
			intro={L.intro}
			back={{ to: LEVEL_SCREEN, label: L.back }}
		>
			{loaderData.connected ? (
				<div className="space-y-4">
					<p className="text-callout">{L.connected}</p>
					<Link to={LEVEL_SCREEN} className={PRIMARY_ACTION}>
						{L.next}
					</Link>
				</div>
			) : (
				<>
					<Form method="POST" className="space-y-3" {...getFormProps(form)}>
						<Field
							labelProps={{ children: L.keyLabel }}
							inputProps={{
								...getInputProps(fields.apiKey, { type: 'password' }),
								autoComplete: 'off',
								// A pasted key is taken as it is: no capital, no "fix".
								autoCapitalize: 'none',
								autoCorrect: 'off',
								spellCheck: false,
								enterKeyHint: 'go',
							}}
							errors={fields.apiKey.errors}
						/>
						<p className="text-footnote text-muted-foreground">{L.keyHelp}</p>
						<ErrorList errors={form.errors} id={form.errorId} />
						<StatusButton
							type="submit"
							className="text-callout w-full"
							status={isPending ? 'pending' : (form.status ?? 'idle')}
							disabled={isPending}
						>
							{L.submit}
						</StatusButton>
					</Form>
					<section
						aria-labelledby="first-run-skip"
						className="border-border space-y-3 border-t pt-6"
					>
						<p
							id="first-run-skip"
							className="text-footnote text-muted-foreground"
						>
							{L.skipConsequence}
						</p>
						<Link to={LEVEL_SCREEN} className={SECONDARY_ACTION}>
							{L.skip}
						</Link>
					</section>
				</>
			)}
		</FirstRunFrame>
	)
}
