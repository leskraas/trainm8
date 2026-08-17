/**
 * **What your sets say about your max** — a 1RM read off a set the athlete
 * already logged, with the derivation shown, which they may accept or ignore.
 *
 * Every word on this screen is a *proposal*. Loading it writes nothing: it is
 * ADR 0050's derived-then-authored rule and ADR 0054's proposal shape, applied
 * to the number a whole strength prescription hangs off. What the app asserts on
 * its own is that it **read** something; what it never asserts is that this is
 * the athlete's number.
 *
 * Three things it refuses to soften.
 *
 * **A refusal is a first-class answer**, shown in place with its own sentence —
 * *"we did not look"* and *"we looked and there is nothing"* are different
 * statements, and a screen that collapses them into a shrug is the failure the
 * four-member vocabulary exists to prevent.
 *
 * **The band is never dropped.** A point estimate alone claims a precision no
 * equation has: ±9–11 % is the honest width even inside the ten-rep gate, and it
 * sits beside the number rather than behind the tap.
 *
 * **Accepting re-derives.** The form posts which reading is being accepted and
 * the value it was shown, and the server re-runs the estimator; a number the
 * engine would not produce is refused and nothing is written.
 */
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Link, data, useFetcher } from 'react-router'
import { z } from 'zod'
import { type PageHeaderHandle } from '#app/components/page-header.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { formatDate } from '#app/utils/format.ts'
import { oneRmRefusalText } from '#app/utils/strength/one-rm.ts'
import {
	type AnchorProposal,
	acceptProposedExerciseOneRm,
	proposeExerciseOneRm,
} from '#app/utils/strength-anchors.server.ts'
import { ESTIMATOR_NAMES } from '#app/utils/strength-log.ts'
import { type Route } from './+types/lifts.$exerciseId_.propose.ts'

export const handle: PageHeaderHandle & SEOHandle = {
	pageHeader: 'What your sets say',
	getSitemapEntries: () => null,
}

export async function loader({ request, params }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	// **A read, and only a read.** No branch of this loader writes: the athlete
	// arrives at a proposal, not at a number that has already been taken.
	const proposal = await proposeExerciseOneRm(userId, params.exerciseId, {
		now: new Date(),
	})
	if (!proposal) throw new Response('Not found', { status: 404 })
	const profile = await prisma.athleteProfile.findUnique({
		where: { userId },
		select: { timezone: true },
	})
	return { proposal, timezone: profile?.timezone ?? 'UTC' }
}

const AcceptSchema = z.object({
	/** The value on screen, checked against a fresh derivation and never trusted
	 * as the thing to store. */
	valueKg: z.coerce.number().finite(),
	estimator: z.enum(ESTIMATOR_NAMES).optional(),
})

export type AcceptResult =
	| { ok: true; message: string }
	| { ok: false; error: string }

const ACCEPT_ERRORS = {
	'not-found': 'That lift no longer exists.',
	'no-profile':
		'Your athlete profile is missing, so there is nothing to attach this to.',
	refused: 'There is no reading to accept any more.',
	// The one worth spelling out: the history moved under the screen, so the
	// number shown is not the number the engine produces now. Storing it anyway
	// would store a figure no derivation supports.
	stale:
		'Your logged sets have changed since this was read. Reload and take another look.',
	duplicate: 'You already saved that number a moment ago.',
} as const

export async function action({ request, params }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = String(formData.get('intent') ?? '')
	if (intent !== 'accept-estimate') {
		return data<AcceptResult>({ ok: false, error: 'Unknown action.' }, 400)
	}
	const parsed = AcceptSchema.safeParse(Object.fromEntries(formData))
	if (!parsed.success) {
		return data<AcceptResult>(
			{ ok: false, error: 'That reading did not make sense.' },
			400,
		)
	}

	const result = await acceptProposedExerciseOneRm({
		userId,
		exerciseId: params.exerciseId,
		postedValueKg: parsed.data.valueKg,
		...(parsed.data.estimator ? { estimator: parsed.data.estimator } : {}),
		now: new Date(),
	})
	if (!result.ok) {
		return data<AcceptResult>(
			{ ok: false, error: ACCEPT_ERRORS[result.reason] },
			result.reason === 'not-found' ? 404 : 400,
		)
	}
	return {
		ok: true as const,
		message: `Saved as your ${trim(result.valueKg)} kg 1RM. It is yours now, and nothing re-reads your history to move it.`,
	}
}

function trim(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default function ProposeAnchorRoute({
	loaderData,
}: Route.ComponentProps) {
	const { proposal, timezone } = loaderData

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="text-lg font-semibold">{proposal.exerciseName}</h2>
				<p className="text-body-sm text-muted-foreground mt-1">
					Read from the sets you have already logged for this lift. Nothing is
					saved until you accept it.
				</p>
			</div>

			<Reading proposal={proposal} timezone={timezone} />

			<p className="text-muted-foreground text-body-xs">
				Accepted numbers are yours to see and replace on{' '}
				<Link
					to={`/settings/training/lifts/${proposal.exerciseId}`}
					className="underline"
				>
					this lift's numbers
				</Link>
				, and they never change on their own.
			</p>
		</div>
	)
}

function Reading({
	proposal,
	timezone,
}: {
	proposal: AnchorProposal
	timezone: string
}) {
	const fetcher = useFetcher<AcceptResult>()
	const result = fetcher.data
	const { reading } = proposal

	if (reading.kind === 'refusal') {
		// Stated in place, never behind a disclosure and never as a low grade: a
		// grade communicates uncertainty *within* a valid fit (ADR 0054).
		return (
			<div className="bg-background rounded-lg px-4 py-3">
				<div className="flex flex-wrap items-baseline justify-between gap-x-3">
					<span className="text-body-sm font-medium">Estimated 1RM</span>
					<span className="text-muted-foreground text-body-sm">
						Unavailable
					</span>
				</div>
				<p className="text-muted-foreground text-body-xs mt-1">
					{oneRmRefusalText(reading.refusal)}
				</p>
			</div>
		)
	}

	const source = reading.basis.source
	const tested = reading.construct === 'oneRm'

	return (
		<div className="bg-background rounded-lg px-4 py-3">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
				<span className="text-body-sm font-medium">
					{tested ? 'Tested 1RM' : 'Estimated 1RM'}
				</span>
				<span className="font-mono text-base">
					{trim(reading.valueKg)}{' '}
					<span className="text-muted-foreground text-xs">kg</span>
				</span>
			</div>

			{/* The band, in place. A point estimate on its own claims a precision no
			    equation here has. */}
			<p className="text-body-xs text-muted-foreground mt-1">
				Somewhere between {trim(reading.band.lowKg)} and{' '}
				{trim(reading.band.highKg)} kg — ±{reading.band.sdPct} %, which is this
				equation's own spread across the people it was fitted to.
			</p>

			<div className="mt-2 flex flex-wrap items-center gap-2">
				<Badge
					variant={reading.confidence === 'high' ? 'default' : 'secondary'}
				>
					{reading.confidence} confidence
				</Badge>
				{reading.basis.stale ? (
					<span className="text-muted-foreground text-body-xs">
						read from an old set — flagged, not adjusted, because nobody can
						tell which way an untested lifter has moved
					</span>
				) : null}
			</div>

			<details className="mt-2">
				<summary className="text-body-xs text-muted-foreground cursor-pointer">
					How we got this
				</summary>
				<dl className="text-body-xs text-muted-foreground mt-2 space-y-1">
					<Fact term="Sets read" detail={`${reading.basis.setsRead}`} />
					{source ? (
						<Fact
							term="Set used"
							detail={`${trim(source.loadKg)} kg × ${source.reps} on ${formatDate(source.performedAtISO, timezone)}${
								source.toFailure
									? ', taken to failure'
									: source.rir != null
										? `, ${source.rir} reps in reserve`
										: ''
							}`}
						/>
					) : null}
					<Fact term="Equation" detail={reading.basis.equationText} />
					{reading.band.meanBiasPct !== 0 ? (
						<Fact
							term="Known bias"
							detail={`${reading.band.meanBiasPct > 0 ? '+' : ''}${reading.band.meanBiasPct} % on average — reported, not corrected for, because a population correction is a claim about you that nobody measured`}
						/>
					) : null}
					{source?.rir != null && !source.toFailure ? (
						<Fact
							term="Note"
							detail="Reps in reserve are under-reported on average, which biases an estimate downwards. Surfaced, never corrected."
						/>
					) : null}
				</dl>
			</details>

			{result && !result.ok ? (
				<p className="text-destructive text-body-sm mt-3" role="alert">
					{result.error}
				</p>
			) : null}
			{result?.ok ? (
				<p className="text-body-sm mt-3" role="status">
					{result.message}
				</p>
			) : null}

			<fetcher.Form method="POST" className="mt-3 flex flex-wrap gap-2">
				<input type="hidden" name="intent" value="accept-estimate" />
				<input type="hidden" name="valueKg" value={reading.valueKg} />
				{proposal.estimator ? (
					<input type="hidden" name="estimator" value={proposal.estimator} />
				) : null}
				<Button type="submit" variant="outline" size="sm">
					{proposal.currentAnchors.length === 0
						? 'Use this'
						: 'Replace what I have'}
				</Button>
				<Link
					to={`/settings/training/lifts/${proposal.exerciseId}`}
					className="text-body-sm text-muted-foreground self-center underline"
				>
					No thanks
				</Link>
			</fetcher.Form>
		</div>
	)
}

function Fact({ term, detail }: { term: string; detail: string }) {
	return (
		<div className="flex flex-wrap gap-x-2">
			<dt className="font-medium">{term}:</dt>
			<dd className="min-w-0 flex-1">{detail}</dd>
		</div>
	)
}
