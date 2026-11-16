import { useRef } from 'react'
import { Link } from 'react-router'
import {
	type AthleteOutput,
	type SessionCard,
} from '#app/lab/engine/reads.types.ts'
import {
	type ConnectionsOutput,
	type GoalOutput,
	type ImportStatusOutput,
	type SetupState,
} from '#app/lab/engine/setup.types.ts'
import { Book, type BookData } from './__book.tsx'
import { addDays } from './__format.ts'
import {
	GoalRows,
	LevelRow,
	LikesRow,
	SourceRows,
	SportsRow,
	VolumeRows,
} from './__setup.tsx'
import { BASE, ErrorBar, Shell } from './__ui.tsx'

export type SetupData = {
	athlete: AthleteOutput
	setup: SetupState | null
	conns: ConnectionsOutput | null
	imp: ImportStatusOutput | null
	goal: GoalOutput | null
	history: SessionCard[]
	from: string
	errors: string[]
	notes: string[]
}

const MISSING: Record<string, string> = { sports: 'idrett', level: 'erfaring' }

/** The setup sheet: the first rows of an empty book. */
export function SetupSheet({ d }: { d: SetupData }) {
	const scrollRef = useRef<HTMLDivElement>(null)
	const s = d.setup
	const today = d.athlete.today
	const data: BookData = {
		today,
		from: d.from,
		to: today,
		sessions: d.history,
		plan: null,
		progressDays: [],
		progressWeekly: [],
		formTrust: null,
		proposals: [],
		eased: {},
		goal: null,
		thresholdPace: null,
		canLoadOlder:
			!!d.athlete.recordings.first && d.athlete.recordings.first < d.from,
	}
	return (
		<Shell
			title="Hovedbok"
			sub="oppsett"
			top={
				<div className="hb-top">
					<div className="wrap">Fyll inn det du vet. Tomt er lov.</div>
				</div>
			}
			bars={
				<>
					{d.errors.map((m, i) => (
						<ErrorBar key={i} message={m} />
					))}
					{d.notes.map((m, i) => (
						<div key={i} className="hb-bar" role="status">
							<span>{m}</span>
						</div>
					))}
				</>
			}
			scrollRef={scrollRef}
		>
			<div className="hb-page" style={{ paddingBottom: 8 }}>
				{s ? (
					<table className="sheet-t" aria-label="Oppsett">
						<tbody>
							<tr>
								<td colSpan={2} className="sec">
									Deg
								</td>
							</tr>
							<SportsRow setup={s} log={false} />
							<LevelRow setup={s} log={false} />
							<VolumeRows setup={s} log={false} />
							<LikesRow setup={s} log={false} />
							<tr>
								<td colSpan={2} className="sec">
									Kilde
								</td>
							</tr>
							{d.conns && d.imp ? (
								<SourceRows conns={d.conns} imp={d.imp} log={false} />
							) : null}
							<tr>
								<td colSpan={2} className="sec">
									Mål
								</td>
							</tr>
							{d.goal ? (
								<GoalRows
									goal={d.goal}
									sports={s.answers.sports ?? ['run']}
									log={false}
									today={today}
								/>
							) : null}
						</tbody>
					</table>
				) : null}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						marginTop: 16,
						flexWrap: 'wrap',
					}}
				>
					{s?.readyForPlans ? (
						<Link className="btn pri" to={`${BASE}/utkast`}>
							Ferdig: lag plan →
						</Link>
					) : (
						<>
							<button type="button" className="btn pri" disabled>
								Ferdig: lag plan →
							</button>
							<span className="why">
								Mangler{' '}
								{(s?.missing ?? ['sports', 'level'])
									.map((m) => MISSING[m] ?? m)
									.join(' og ')}
								.
							</span>
						</>
					)}
				</div>
			</div>
			{d.history.length ? (
				<>
					<div className="sec" style={{ margin: '12px 0 0' }}>
						Historikk · bare faktisk
					</div>
					<Book
						data={data}
						anchor=""
						scrollEl={scrollRef}
						olderHref={
							data.canLoadOlder ? `?fra=${addDays(d.from, -84)}` : null
						}
					/>
				</>
			) : (
				<p className="why" style={{ padding: '0 12px 32px' }}>
					Ingen økter ennå. Koble en kilde eller last opp en fil.
				</p>
			)}
		</Shell>
	)
}
