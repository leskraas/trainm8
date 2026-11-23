import { useEffect, useState } from 'react'
import { Link, redirect, useRevalidator } from 'react-router'
import {
	type PlanOutput,
	type ProgressOutput,
	type ProposalsOutput,
	type SessionOutput,
	type SessionsOutput,
	type TodayOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/index.ts'
import { Bunke, WeekLetter } from './__letter.tsx'
import {
	BASE,
	addDays,
	dateText,
	greetingName,
	isoWeek,
	known,
	minText,
	DAY_NAME,
	weekdayOf,
} from './__lib.ts'
import { DayNotes } from './__today.tsx'
import { ErrorLine, N } from './__ui.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const athlete = await runCapability(request, 'athlete', {})
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	const me = athlete.value
	if (!me.setup.complete) throw redirect(`${BASE}/velkommen`)

	const [today, week, progress, plan, proposals] = await Promise.all([
		runCapability(request, 'today', {}),
		runCapability(request, 'week', {}),
		runCapability(request, 'progress', { weeks: 12 }),
		runCapability(request, 'plan', {}),
		runCapability(request, 'proposals', {}),
	])
	const t = today.ok ? today.value : null
	const isSunday = t?.weekday === 'sun'
	const [nextWeek, ...details] = await Promise.all([
		isSunday && t
			? runCapability(request, 'week', { date: addDays(t.date, 1) })
			: Promise.resolve(null),
		...(t?.sessions ?? []).map((s) =>
			runCapability(request, 'session', { sessionId: s.id }),
		),
	])
	const detailMap: Record<string, SessionOutput | null> = {}
	t?.sessions.forEach((s, i) => {
		const d = details[i]
		detailMap[s.id] = d && d.ok ? (d.value as SessionOutput) : null
	})

	// The last letter before the race: how much of the plan was done.
	let raceShare: { done: number; of: number } | null = null
	const g = me.goal
	if (
		g?.kind === 'event' &&
		g.daysToGo !== null &&
		g.daysToGo >= 0 &&
		g.daysToGo <= 2 &&
		me.plan.firstWeek
	) {
		let done = 0
		let of = 0
		let cursor: string | undefined
		const from = me.plan.firstWeek
		for (let page = 0; page < 10; page++) {
			const r = await runCapability(request, 'sessions', {
				from,
				to: me.today,
				limit: 100,
				...(cursor ? { cursor } : {}),
			})
			if (!r.ok) break
			const v = r.value as SessionsOutput
			for (const s of v.sessions) {
				if (s.status === 'recording-only' || s.date >= me.today) continue
				of++
				if (s.status === 'done') done++
			}
			if (!v.nextCursor) break
			cursor = v.nextCursor
		}
		raceShare = of > 0 ? { done, of } : null
	}

	return {
		me,
		today: t,
		todayError: today.ok ? null : today.message,
		week: week.ok ? (week.value as WeekOutput) : null,
		weekError: week.ok ? null : week.message,
		progress: progress.ok ? (progress.value as ProgressOutput) : null,
		plan: plan.ok ? (plan.value as PlanOutput) : null,
		proposals: proposals.ok ? (proposals.value as ProposalsOutput) : null,
		nextWeek: nextWeek && nextWeek.ok ? (nextWeek.value as WeekOutput) : null,
		details: detailMap,
		raceShare,
	}
}

const SEEN = 'brev-seen-week'
const CAUGHT_UP = 'brev-caught-up'

export default function BrevHome({ loaderData }: Route.ComponentProps) {
	const { me, today, week, progress, plan, proposals, details, nextWeek } =
		loaderData
	const name = greetingName(me.name, me.username)
	const revalidator = useRevalidator()
	const [isNew, setIsNew] = useState(false)

	useEffect(() => {
		if (!week) return
		try {
			const seen = window.localStorage.getItem(SEEN)
			if (seen !== week.weekKey) {
				setIsNew(seen !== null || true)
				window.localStorage.setItem(SEEN, week.weekKey)
			}
		} catch {
			// no memory: no slide
		}
	}, [week])

	// Let the plan catch up (close a finished week, write its proposals) once
	// per visit; only re-read when it actually did something.
	useEffect(() => {
		try {
			if (window.sessionStorage.getItem(CAUGHT_UP)) return
			window.sessionStorage.setItem(CAUGHT_UP, '1')
		} catch {
			// fine: ask anyway
		}
		void fetch('/lab/api/refresh_adaptation', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		})
			.then((r) => r.json() as Promise<unknown>)
			.then((raw) => {
				const j = raw as {
					ok: boolean
					value?: { newProposals: boolean; appliedIds: string[] }
				}
				if (j.ok && (j.value?.newProposals || j.value?.appliedIds.length))
					void revalidator.revalidate()
			})
			.catch(() => {})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const extra =
		(today?.proposalsWaiting.value ?? 0) > 0 ||
		(proposals?.changesMade?.undoable ?? 0) > 0 ||
		today?.readiness.call === 'drifting' ||
		today?.readiness.call === 'overreaching'

	const olderWeeks = (plan?.plan?.weeks ?? [])
		.filter((w) => w.when === 'past')
		.reverse()
		.slice(0, 6)
		.map((w) => ({
			weekKey: w.weekKey,
			isoWeek: isoWeek(w.weekKey),
			phase: w.phase,
			role: w.role,
		}))
	const fallbackOlder =
		olderWeeks.length || !week || me.recordings.count === 0
			? olderWeeks
			: [1, 2, 3].map((i) => {
					const k = addDays(week.weekKey, -7 * i)
					return { weekKey: k, isoWeek: isoWeek(k), phase: null, role: null }
				})

	const goal = me.goal
	const raceSoon =
		goal?.kind === 'event' &&
		goal.daysToGo !== null &&
		goal.daysToGo >= 0 &&
		goal.daysToGo <= 2

	return (
		<main className="b-col">
			<h1 className="b-sr">Brev til {name}</h1>
			{raceSoon && goal ? (
				<RaceLetter
					name={name}
					goalName={goal.name}
					daysToGo={goal.daysToGo!}
					aim={goal.aim}
					today={today}
					share={loaderData.raceShare}
				/>
			) : null}

			{extra ? (
				<Link
					to={`${BASE}/ekstra`}
					className="b-envelope b-fade-in"
					style={{ marginBottom: 22 }}
					prefetch="intent"
				>
					<span
						className="b-small"
						style={{
							display: 'block',
							letterSpacing: '.06em',
							textTransform: 'uppercase',
						}}
					>
						Ekstrabrev
					</span>
					<span>
						{(today?.proposalsWaiting.value ?? 0) > 0
							? `${today!.proposalsWaiting.value === 1 ? 'Ett forslag venter' : `${today!.proposalsWaiting.value} forslag venter`} på svar fra deg.`
							: (proposals?.changesMade?.undoable ?? 0) > 0
								? 'Jeg har justert planen. Les hva jeg gjorde, og angre om du vil.'
								: today?.readiness.sentence}
					</span>
				</Link>
			) : null}

			{today ? (
				<section aria-label="Lappen" style={{ marginBottom: 26, marginTop: 8 }}>
					<DayNotes
						date={today.date}
						today={today.date}
						sessions={today.sessions}
						details={details}
						week={week}
						next={today.next}
						timeZone={me.timezone}
						planStarts={me.plan.firstWeek}
					/>
					{today.readiness.nextSession.sentence ? (
						<p className="b-small" style={{ margin: '12px 4px 0' }}>
							{today.readiness.nextSession.sentence}
						</p>
					) : null}
				</section>
			) : (
				<div className="b-lapp">
					<ErrorLine
						message={loaderData.todayError ?? 'Fikk ikke lest dagen i dag.'}
					/>
				</div>
			)}

			{week ? (
				<WeekLetter
					week={week}
					name={name}
					today={me.today}
					timeZone={me.timezone}
					progress={progress}
					plan={plan}
					nextWeek={nextWeek}
					isNew={isNew}
					headingTag="h2"
				/>
			) : (
				<div className="b-sheet">
					<p className="b-p">
						Ingen brev ennå. Det første kommer når du har signert planen.
					</p>
					<ErrorLine message={loaderData.weekError} />
				</div>
			)}

			<Bunke weeks={fallbackOlder} />
			{fallbackOlder.length ? (
				<p className="b-small" style={{ textAlign: 'center', marginTop: 14 }}>
					<Link
						to={`${BASE}/arkiv`}
						className="b-word"
						style={{ fontSize: 15 }}
					>
						Alle brevene ligger i Arkivet
					</Link>
				</p>
			) : null}
		</main>
	)
}

function RaceLetter({
	name,
	goalName,
	daysToGo,
	aim,
	today,
	share,
}: {
	name: string
	goalName: string
	daysToGo: number
	aim: string | null
	today: TodayOutput | null
	share: { done: number; of: number } | null
}) {
	const s = today?.sessions.find((x) => x.status === 'planned')
	return (
		<article className="b-sheet b-new-letter" style={{ marginBottom: 22 }}>
			<p
				className="b-small"
				style={{
					margin: 0,
					letterSpacing: '.06em',
					textTransform: 'uppercase',
				}}
			>
				Siste brev før {goalName}
			</p>
			<p className="b-p" style={{ marginTop: 10 }}>
				Kjære {name},
			</p>
			<p className="b-p">
				{daysToGo === 0
					? 'I dag.'
					: daysToGo === 1
						? 'I morgen.'
						: `Om ${daysToGo} dager.`}{' '}
				{s ? (
					<>
						{daysToGo === 0 ? 'Dagens økt er løpet:' : 'I dag:'}{' '}
						{s.title.toLowerCase()}
						{known(s.planned.durationS) ? (
							<>
								, <N>{minText(s.planned.durationS.value / 60)}</N>
							</>
						) : null}
						.
					</>
				) : daysToGo > 0 ? (
					'I dag: ingenting. Hvil.'
				) : null}{' '}
				{share ? (
					<>
						Du har gjort <N>{Math.round((share.done / share.of) * 100)} %</N> av
						øktene ({share.done} av {share.of}).
					</>
				) : null}{' '}
				{aim ? `Målet er ${aim.toLowerCase()}. ` : ''}Start forsiktig. Det er
				lettere å ta igjen tid på slutten enn å få den tilbake.
			</p>
			{today?.weather ? (
				<p className="b-small">
					Været {DAY_NAME[weekdayOf(today.date)]} {dateText(today.date)}:{' '}
					{today.weather.label.toLowerCase()},{' '}
					<N>{Math.round(today.weather.temperatureC)} °C</N>.{' '}
					{today.weather.credit}
				</p>
			) : null}
			<p className="b-p" style={{ marginBottom: 0 }}>
				Lykke til.
			</p>
		</article>
	)
}
