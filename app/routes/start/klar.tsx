import { Link, redirect } from 'react-router'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { readPlanReady } from '#app/utils/first-run/plan-ready.server.ts'
import { formatNbVolumeFigure } from '#app/utils/format.ts'
import { PLAN_READY_LABELS } from '#app/utils/labels.ts'
import { MORPH, type MorphState } from '#app/utils/view-morph.ts'
import { type Route } from './+types/klar.ts'
import {
	DISCLOSURE_CHEVRON,
	DISCLOSURE_TRIGGER,
	PRIMARY_ACTION,
} from './__first-run-frame.tsx'
import { PlanReadyBars } from './__plan-ready-bars.tsx'

/**
 * _Planen er klar_ (#558 stories 46–51, #570): where _Velg denne_ lands. The
 * plan by its plain name with the family's small, the day it begins, twelve
 * weeks of hours as bars (the round as laid solid, then a lighter step as the
 * plan would go on if every week were done to plan, #584), one sentence on
 * how the plan moves each Sunday, a closed _Under panseret_ with everything
 * that was made, and _Til I dag_.
 *
 * It reads the plan that exists, never the answers: a reload shows the same
 * screen and makes nothing, and with no plan the start is where to go.
 *
 * Motion (#582): the chosen card morphs into the curve card on the way here,
 * and _Til I dag_ morphs the curve card into I dag's week (`view-morph.ts`);
 * back from I dag plays it in reverse.
 */

export const meta: Route.MetaFunction = () => [
	{ title: `${PLAN_READY_LABELS.metaTitle} | Trainm8` },
]

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const ready = await readPlanReady(userId)
	if (!ready) throw redirect('/start/niva')
	return ready
}

/** A week's hours as the bars say them; a function does not cross the wire. */
function hoursFigure(value: number): string {
	return formatNbVolumeFigure(value, 'hours')
}

export default function PlanReady({ loaderData }: Route.ComponentProps) {
	const { curve, hood } = loaderData

	return (
		<main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-6">
			<p className="text-overline text-muted-foreground uppercase">
				{loaderData.overline}
			</p>
			<h1 className="text-title mt-1 text-balance break-words">
				{loaderData.name}
			</h1>
			{loaderData.familyName ? (
				<p className="text-footnote text-muted-foreground mt-1">
					{loaderData.familyName}
				</p>
			) : null}
			<p className="text-body text-muted-foreground mt-2" data-plan-starts>
				{loaderData.startsOn}
			</p>

			<div className="mt-6 flex-1 space-y-4 pb-6">
				<section
					aria-labelledby="plan-ready-curve"
					className="bg-card space-y-3 rounded-4xl p-4 shadow-xs"
					style={{ viewTransitionName: MORPH.plan }}
					data-plan-ready-curve
				>
					<h2 id="plan-ready-curve" className="text-callout font-semibold">
						{curve.title}
					</h2>
					<PlanReadyBars curve={curve} figure={hoursFigure} />
					{curve.note ? (
						<p className="text-footnote text-muted-foreground">{curve.note}</p>
					) : null}
				</section>

				<p
					className="text-footnote text-muted-foreground flex gap-3 px-1"
					data-plan-ready-sunday
				>
					<Icon
						name="update"
						size="md"
						className="text-foreground/70 mt-px shrink-0 self-start"
					/>
					<span>{loaderData.sunday}</span>
				</p>

				<Collapsible
					className="bg-card rounded-4xl shadow-xs"
					data-plan-ready-hood
				>
					<CollapsibleTrigger className={DISCLOSURE_TRIGGER}>
						{hood.title}
						<Icon
							name="chevron-down"
							size="md"
							className={DISCLOSURE_CHEVRON}
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="space-y-5 px-4 pt-1 pb-4">
							<p className="text-footnote text-muted-foreground">
								{hood.intro}
							</p>
							<dl className="text-footnote grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] gap-x-3 gap-y-2">
								{hood.facts.map((fact) => (
									<div key={fact.term} className="contents">
										<dt className="text-muted-foreground">{fact.term}</dt>
										<dd className="min-w-0 break-words">
											{fact.details.map((detail) => (
												<span key={detail} className="block">
													{detail}
												</span>
											))}
										</dd>
									</div>
								))}
							</dl>

							<section className="space-y-2">
								<h3 className="text-overline text-muted-foreground uppercase">
									{hood.patternTitle}
								</h3>
								<ul className="text-footnote divide-border/60 divide-y">
									{hood.pattern.map((day) => (
										<li
											key={day.weekday}
											className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] gap-x-3 py-1.5"
										>
											<span className="text-muted-foreground first-letter:uppercase">
												{day.weekday}
											</span>
											<span className="min-w-0 break-words">
												{day.sessions.length === 0 ? (
													<span className="text-muted-foreground">
														{hood.free}
													</span>
												) : (
													day.sessions.map((session, at) => (
														<span key={at} className="block">
															{session}
														</span>
													))
												)}
											</span>
										</li>
									))}
								</ul>
							</section>

							<section className="space-y-2">
								<h3 className="text-overline text-muted-foreground uppercase">
									{hood.weeksTitle}
								</h3>
								<ol className="text-footnote tabular-nums">
									{hood.weeks.map((week) => (
										<li
											key={week.key}
											className="grid grid-cols-[minmax(0,6.5rem)_4rem_minmax(0,1fr)] gap-x-3 py-0.5"
										>
											<span className="text-muted-foreground">{week.week}</span>
											<span className="text-right">{week.hours}</span>
											<span className="text-muted-foreground min-w-0">
												{week.easy ? hood.easy : null}
											</span>
										</li>
									))}
								</ol>
							</section>
						</div>
					</CollapsibleContent>
				</Collapsible>
			</div>

			{/* In the thumb's reach, as every start screen's way forward is. */}
			<div className="bg-background sticky bottom-0 -mx-4 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
				<Link
					to={loaderData.toToday}
					viewTransition
					state={{ morph: MORPH.plan } satisfies MorphState}
					className={PRIMARY_ACTION}
				>
					{PLAN_READY_LABELS.toToday}
				</Link>
			</div>
		</main>
	)
}
