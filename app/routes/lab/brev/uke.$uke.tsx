import { Link } from 'react-router'
import { type WeekOutput } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import { type Route } from './+types/uke.$uke.ts'
import { WeekLetter } from './__letter.tsx'
import { BASE, addDays, greetingName, mondayOf } from './__lib.ts'
import { ErrorLine } from './__ui.tsx'

export async function loader({ request, params }: Route.LoaderArgs) {
	const key = /^\d{4}-\d{2}-\d{2}$/.test(params.uke)
		? mondayOf(params.uke)
		: null
	const athlete = await runCapability(request, 'athlete', {})
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	if (!key)
		return { me: athlete.value, week: null, error: 'Den uka finner jeg ikke.' }
	const week = await runCapability(request, 'week', { date: key })
	return {
		me: athlete.value,
		week: week.ok ? (week.value as WeekOutput) : null,
		error: week.ok ? null : week.message,
	}
}

export const meta = ({ data }: Route.MetaArgs) => [
	{ title: data?.week ? `Brev · uke ${data.week.isoWeek}` : 'Brev' },
]

export default function Uke({ loaderData }: Route.ComponentProps) {
	const { me, week, error } = loaderData
	const name = greetingName(me.name, me.username)
	return (
		<main className="b-col">
			<nav
				style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}
			>
				<Link to={BASE} className="b-back">
					← Denne ukas brev
				</Link>
				{week ? (
					<span style={{ display: 'flex', gap: 4 }}>
						<Link
							to={`${BASE}/uke/${addDays(week.weekKey, -7)}`}
							className="b-back"
							style={{ padding: '0 10px' }}
							aria-label="Eldre brev"
						>
							‹ eldre
						</Link>
						<Link
							to={`${BASE}/uke/${addDays(week.weekKey, 7)}`}
							className="b-back"
							style={{ padding: '0 10px' }}
							aria-label="Nyere brev"
						>
							nyere ›
						</Link>
					</span>
				) : null}
			</nav>
			{week ? (
				<WeekLetter
					week={week}
					name={name}
					today={me.today}
					timeZone={me.timezone}
				/>
			) : (
				<div className="b-sheet">
					<ErrorLine message={error} />
				</div>
			)}
		</main>
	)
}
