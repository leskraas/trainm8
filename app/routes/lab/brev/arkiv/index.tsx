import { Link } from 'react-router'
import { type PlanOutput } from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	BASE,
	LEVEL_SHORT,
	addDays,
	dateText,
	isoWeek,
	mondayOf,
	phaseName,
	weekSpan,
} from '../__lib.ts'
import { PsLines } from '../__ui.tsx'
import { type Route } from './+types/index.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [athlete, plan] = await Promise.all([
		runCapability(request, 'athlete', {}),
		runCapability(request, 'plan', {}),
	])
	if (!athlete.ok) throw new Response(athlete.message, { status: 500 })
	return {
		me: athlete.value,
		plan: plan.ok ? (plan.value as PlanOutput) : null,
	}
}

export const meta = () => [{ title: 'Brev · arkivet' }]

export default function Arkiv({ loaderData }: Route.ComponentProps) {
	const { me, plan } = loaderData
	const thisWeek = mondayOf(me.today)
	const first = [
		plan?.plan?.firstWeek,
		me.recordings.first ? mondayOf(me.recordings.first) : null,
	]
		.filter((x): x is string => !!x)
		.sort()[0]
	const weeks: string[] = []
	if (first && me.setup.complete) {
		for (let k = thisWeek; k >= first && weeks.length < 60; k = addDays(k, -7))
			weeks.push(k)
	}
	const phaseOf = (k: string) => plan?.plan?.weeks.find((w) => w.weekKey === k)
	const connected = me.sources.filter(
		(s) => s.status === 'connected' || s.status === 'importing-history',
	)
	const g = me.goal
	const sections: { to: string; title: string; line: string }[] = [
		{
			to: 'om-meg',
			title: 'Om meg',
			line: me.level
				? `${LEVEL_SHORT[me.level] ?? me.levelName}, ${me.availability.days?.length ?? 'ukjent antall'} dager i uka. Introduksjonsbrevet, som kan skrives om.`
				: 'Introduksjonsbrevet, som kan skrives om.',
		},
		{
			to: 'soner',
			title: 'Soner og terskler',
			line: 'Pulsen, farten og wattene øktene regnes ut fra.',
		},
		{
			to: 'maal',
			title: 'Mål',
			line: g
				? `${g.name}${g.date ? `, ${dateText(g.date)}` : ''}${g.aim ? ` (${g.aim.toLowerCase()})` : ''}.`
				: 'Ingen løp. Bare bli i bedre form.',
		},
		{
			to: 'koblinger',
			title: 'Koblinger',
			line: connected.length
				? `${connected.map((s) => s.name).join(', ')}. ${me.recordings.count} økter mottatt.`
				: me.recordings.count
					? `Ingen klokke koblet til. ${me.recordings.count} økter mottatt fra filer.`
					: 'Ingen klokke koblet til ennå.',
		},
		{
			to: 'konto',
			title: 'Konto',
			line: 'Navn, hvordan planen justeres, eksport og sletting.',
		},
	]
	return (
		<main className="b-col">
			<Link to={BASE} className="b-back">
				← Ukas brev
			</Link>
			<h1 className="b-h" style={{ margin: '4px 4px 18px' }}>
				Arkivet
			</h1>
			<nav
				aria-label="Innstillinger"
				className="b-sheet"
				style={{ padding: '8px 18px' }}
			>
				<ul className="b-menu">
					{sections.map((s) => (
						<li key={s.to}>
							<Link
								to={s.to}
								className="b-choice"
								style={{ textDecoration: 'none' }}
								prefetch="intent"
							>
								<span style={{ minWidth: 0 }}>
									{s.title}
									<span
										className="b-small"
										style={{ display: 'block', overflowWrap: 'anywhere' }}
									>
										{s.line}
									</span>
								</span>
								<span aria-hidden style={{ color: 'var(--pencil)' }}>
									→
								</span>
							</Link>
						</li>
					))}
				</ul>
			</nav>

			<section className="b-sheet" aria-labelledby="brevene">
				<h2 id="brevene" className="b-h2" style={{ marginTop: 0 }}>
					Brevene
				</h2>
				{me.setup.complete ? (
					<p className="b-p">
						<Link to={`${BASE}/sesong`} className="b-word">
							Sesongbrevet
						</Link>
						{plan?.plan ? (
							<span className="b-small">
								{' '}
								· {plan.plan.totalWeeks} uker fra{' '}
								{dateText(plan.plan.firstWeek)}
							</span>
						) : null}
					</p>
				) : (
					<p className="b-p">
						Ingen brev ennå. Det første kommer når du har signert planen.{' '}
						<Link to={`${BASE}/velkommen`} className="b-word">
							Fortsett introduksjonsbrevet
						</Link>
					</p>
				)}
				{weeks.length ? (
					<ul className="b-menu">
						{weeks.map((k) => {
							const w = phaseOf(k)
							return (
								<li key={k}>
									<Link
										to={k === thisWeek ? BASE : `${BASE}/uke/${k}`}
										className="b-choice"
										style={{ textDecoration: 'none', minHeight: 48 }}
									>
										<span>
											Uke {isoWeek(k)}
											{k === thisWeek ? (
												<span className="b-small"> · denne uka</span>
											) : null}
										</span>
										<span className="b-small" style={{ textAlign: 'right' }}>
											{weekSpan(k)}
											{w?.phase ? ` · ${phaseName(w.phase)}` : ''}
										</span>
									</Link>
								</li>
							)
						})}
					</ul>
				) : null}
			</section>

			<section className="b-sheet" aria-labelledby="ps-h">
				<h2 id="ps-h" className="b-h2" style={{ marginTop: 0 }}>
					Avgjørelsene dine
				</h2>
				<p className="b-small">
					Alt du har endret midt i en uke, som PS. Det som fortsatt kan angres,
					har «Angre».
				</p>
				<PsLines
					timeZone={me.timezone}
					empty={<p className="b-p">Ingen PS ennå.</p>}
				/>
			</section>
		</main>
	)
}
