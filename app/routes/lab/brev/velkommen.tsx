import { useEffect, useRef, useState } from 'react'
import { Link, redirect, useRevalidator } from 'react-router'
import { uploadToCapability } from '#app/lab/engine/client.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type ConnectionsOutput,
	type ExperienceLevel,
	type GoalOutput,
	type GoalWriteOutput,
	type ImportStatusOutput,
	type SetupState,
	type UploadOutput,
} from '#app/lab/engine/setup.types.ts'
import { type Route } from './+types/velkommen.ts'
import {
	BASE,
	DAY_NAME,
	WEEKDAY_ORDER,
	cap,
	dateText,
	hoursText,
	listText,
	monthYear,
	n1,
	PREF_SHORT,
	LEVEL_SHORT,
} from './__lib.ts'
import {
	DaysSheet,
	GoalSheet,
	HoleBtn,
	HoursSheet,
	IcuSheet,
	NameSheet,
	PrefsSheet,
	SportsSheet,
} from './__sheets.tsx'
import { ErrorLine, N, Sheet, Signature, Stamp, useWrite } from './__ui.tsx'

export async function loader({ request }: Route.LoaderArgs) {
	const [setup, athlete, connections, status, goal] = await Promise.all([
		runCapability(request, 'get_setup', {}),
		runCapability(request, 'athlete', {}),
		runCapability(request, 'connections', {}),
		runCapability(request, 'import_status', {}),
		runCapability(request, 'goal', {}),
	])
	if (athlete.ok && athlete.value.setup.complete) throw redirect(BASE)
	if (!setup.ok) throw new Response(setup.message, { status: 500 })
	return {
		setup: setup.value,
		today: athlete.ok
			? athlete.value.today
			: new Date().toISOString().slice(0, 10),
		hasSource: athlete.ok ? athlete.value.setup.hasSessionSource : false,
		connections: connections.ok ? connections.value : null,
		status: status.ok ? status.value : null,
		goal: goal.ok ? goal.value : null,
	}
}

type Hole =
	| 'sports'
	| 'level'
	| 'hours'
	| 'days'
	| 'strength'
	| 'prefs'
	| 'name'
	| 'icu'
	| 'polar'
	| 'goal'
	| null

const SKIP_KEY = 'brev-no-watch'

export default function Velkommen({ loaderData }: Route.ComponentProps) {
	const { setup, connections, goal, today } = loaderData
	const a = setup.answers
	const [hole, setHole] = useState<Hole>(null)
	const close = () => setHole(null)

	const sportsWrite = useWrite('set_sports')
	const levelWrite = useWrite('set_experience_level')
	const hoursWrite = useWrite('set_current_volume')
	const daysWrite = useWrite('set_availability')
	const strengthWrite = useWrite('set_strength')
	const prefsWrite = useWrite('set_session_preferences')
	const nameWrite = useWrite('set_display_name')

	const suggested = setup.suggested
	const hours = a.currentHoursPerWeek ?? setup.fromHistory.hoursPerWeek.value
	const hoursIsSuggestion = a.currentHoursPerWeek === null
	const hoursShown = hours ?? suggested?.currentHoursPerWeek ?? null
	const days =
		a.availability.days ?? setup.fromHistory.days ?? suggested?.days ?? null
	const daysIsSuggestion = a.availability.days === null
	const strength =
		a.strengthPerWeek ?? (a.level ? (suggested?.strengthPerWeek ?? null) : null)
	const strengthIsSuggestion = a.strengthPerWeek === null && a.level !== null

	const basicsAnswered =
		!!a.sports?.length || !!a.otherActivities?.length ? a.level !== null : false
	const introStored =
		basicsAnswered &&
		a.currentHoursPerWeek !== null &&
		a.availability.days !== null
	const [signedIntro, setSignedIntro] = useState(introStored)
	const [signing, setSigning] = useState(false)
	const [signError, setSignError] = useState<string | null>(null)
	const [noWatch, setNoWatch] = useState(false)
	useEffect(() => {
		try {
			setNoWatch(window.localStorage.getItem(SKIP_KEY) === '1')
		} catch {
			// storage blocked: ask again
		}
	}, [])

	const [watchDone, setWatchDone] = useState(loaderData.hasSource)
	const watchSectionDone = watchDone || noWatch || loaderData.hasSource
	const [goalChoice, setGoalChoice] = useState<'event' | 'open' | null>(
		goal?.goal ? 'event' : null,
	)

	const clockRef = useRef<HTMLElement>(null)
	const goalRef = useRef<HTMLElement>(null)
	const endRef = useRef<HTMLDivElement>(null)
	function reveal(ref: React.RefObject<HTMLElement | null>) {
		window.setTimeout(() => {
			const reduce = window.matchMedia(
				'(prefers-reduced-motion: reduce)',
			).matches
			ref.current?.scrollIntoView({
				behavior: reduce ? 'auto' : 'smooth',
				block: 'start',
			})
		}, 120)
	}

	const name = a.displayName?.trim() || ''
	const sportWords = [
		...(a.sports ?? []).map(
			(s) =>
				setup.choices.sports.find((c) => c.id === s)?.label.toLowerCase() ?? s,
		),
		...(a.otherActivities ?? []).map(
			(s) =>
				setup.choices.otherActivities
					.find((c) => c.id === s)
					?.label.toLowerCase() ?? s,
		),
	]
	const blocked = days ? WEEKDAY_ORDER.filter((d) => !days.includes(d)) : null

	async function sign() {
		setSignError(null)
		if (!a.sports?.length && !a.otherActivities?.length) {
			setSignError('Fyll inn hva du driver med først.')
			return
		}
		if (!a.level) {
			setSignError('Fyll inn hvor lenge du har trent først.')
			return
		}
		setSigning(true)
		// The suggestions shown in pencil become the athlete's answers.
		const writes: Promise<{ ok: boolean; message?: string }>[] = []
		if (a.currentHoursPerWeek === null && hoursShown !== null)
			writes.push(
				hoursWrite.call({ hoursPerWeek: hoursShown }, { revalidate: false }),
			)
		if (a.availability.days === null && days)
			writes.push(daysWrite.call({ days }, { revalidate: false }))
		if (a.strengthPerWeek === null && strength !== null)
			writes.push(
				strengthWrite.call(
					{ perWeek: strength as 0 | 1 | 2 | 3 },
					{ revalidate: false },
				),
			)
		if (a.sessionPreferences === null)
			writes.push(prefsWrite.call({ preferences: [] }, { revalidate: false }))
		try {
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
			if (tz && tz !== a.timezone)
				writes.push(
					fetch(`/lab/api/set_timezone`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ timezone: tz }),
					})
						// The zone is a nicety: a refusal never blocks the signature.
						.then(() => ({ ok: true }))
						.catch(() => ({ ok: true })),
				)
		} catch {
			// keep the stored zone
		}
		const results = await Promise.all(writes)
		setSigning(false)
		const failed = results.find((r) => !r.ok)
		if (failed) {
			setSignError(failed.message ?? 'Noe gikk galt. Prøv igjen.')
			return
		}
		setSignedIntro(true)
		void revalidator.revalidate()
		reveal(clockRef)
	}
	const revalidator = useRevalidator()

	return (
		<main className="b-col">
			<article className="b-sheet b-new-letter" aria-labelledby="intro-h">
				<p
					id="intro-h"
					className="b-h"
					style={{ fontWeight: 400, fontStyle: 'italic', marginBottom: 28 }}
				>
					Før jeg kan skrive til deg, må jeg vite litt om deg.
				</p>

				<section id="om-deg" aria-label="Om deg">
					<p className="b-p">Hei,</p>
					<p className="b-p">
						jeg driver med{' '}
						<HoleBtn
							empty={sportWords.length === 0}
							onClick={() => setHole('sports')}
							label="Hva du driver med"
						>
							{sportWords.length ? listText(sportWords) : 'velg idrett'}
						</HoleBtn>
						. Jeg er{' '}
						<HoleBtn
							empty={!a.level}
							onClick={() => setHole('level')}
							label="Nivå"
						>
							{a.level ? LEVEL_SHORT[a.level] : 'hvor erfaren'}
						</HoleBtn>
						.
					</p>
					{a.level ? (
						<p className="b-p b-fade-in">
							Nå trener jeg rundt{' '}
							<HoleBtn
								suggest={hoursIsSuggestion}
								empty={hoursShown === null}
								onClick={() => setHole('hours')}
								label="Timer i uka"
							>
								{hoursShown !== null ? <N>{n1(hoursShown)}</N> : 'hvor mange'}
							</HoleBtn>{' '}
							timer i uka.{' '}
							{blocked && blocked.length > 0 ? (
								<>
									<HoleBtn
										suggest={daysIsSuggestion}
										onClick={() => setHole('days')}
										label="Dager som ikke går"
									>
										{cap(listText(blocked.map((d) => DAY_NAME[d])))}
									</HoleBtn>{' '}
									går ikke.
								</>
							) : (
								<>
									<HoleBtn
										suggest={daysIsSuggestion}
										empty={!days}
										onClick={() => setHole('days')}
										label="Dager som ikke går"
									>
										{days ? 'Alle dager' : 'Hvilke dager'}
									</HoleBtn>{' '}
									{days ? 'går.' : 'går ikke?'}
								</>
							)}{' '}
							Jeg vil løfte{' '}
							<HoleBtn
								suggest={strengthIsSuggestion}
								onClick={() => setHole('strength')}
								label="Styrke"
							>
								{strength === null || strength === 0
									? 'ikke'
									: strength === 1
										? 'én gang i uka'
										: `${strength} ganger i uka`}
							</HoleBtn>
							.
						</p>
					) : null}
					{a.level ? (
						<p className="b-p b-fade-in">
							Helst vil jeg ha{' '}
							<HoleBtn
								empty={!a.sessionPreferences?.length}
								onClick={() => setHole('prefs')}
								label="Hva du liker"
							>
								{a.sessionPreferences?.length
									? listText(
											a.sessionPreferences.map((p) => PREF_SHORT[p] ?? p),
										)
									: 'det du synes passer'}
							</HoleBtn>
							.
						</p>
					) : null}
					<Aside
						setup={setup}
						hoursShown={hoursShown}
						suggestedShown={
							hoursIsSuggestion || daysIsSuggestion || strengthIsSuggestion
						}
					/>
					{a.level ? (
						<div style={{ marginTop: 24 }}>
							<p className="b-p">
								Hilsen{' '}
								<HoleBtn
									empty={!name}
									onClick={() => setHole('name')}
									label="Navnet ditt"
								>
									{name || 'navnet ditt'}
								</HoleBtn>
							</p>
							<Signature
								name={name || a.username}
								label="Signer, så skriver jeg tilbake"
								signed={signedIntro}
								pending={signing}
								onSign={() => void sign()}
							/>
							<ErrorLine message={signError} />
						</div>
					) : null}
				</section>

				{signedIntro ? (
					<section
						id="klokke"
						ref={clockRef}
						className="b-fade-in"
						style={{ scrollMarginTop: 72 }}
					>
						<hr className="b-rule" />
						<Clock
							connections={connections}
							initialStatus={loaderData.status}
							onDone={() => {
								setWatchDone(true)
								reveal(goalRef)
							}}
							onSkip={() => {
								setNoWatch(true)
								try {
									window.localStorage.setItem(SKIP_KEY, '1')
								} catch {
									// fine
								}
								reveal(goalRef)
							}}
							onOpenIcu={() => setHole('icu')}
							onOpenPolar={() => setHole('polar')}
							noWatch={noWatch}
							hasSource={loaderData.hasSource}
						/>
					</section>
				) : null}

				{signedIntro && watchSectionDone ? (
					<section
						id="maal"
						ref={goalRef}
						className="b-fade-in"
						style={{ scrollMarginTop: 72 }}
					>
						<hr className="b-rule" />
						<GoalPart
							goal={goal}
							today={today}
							hasHistory={loaderData.hasSource}
							choice={goalChoice}
							setChoice={(c) => {
								setGoalChoice(c)
								if (c === 'open') reveal(endRef)
							}}
							openSheet={() => setHole('goal')}
						/>
					</section>
				) : null}

				{signedIntro && watchSectionDone && goalChoice ? (
					<div ref={endRef} className="b-fade-in" style={{ marginTop: 28 }}>
						<p className="b-p">
							Takk. Nå har jeg det jeg trenger for å skrive sesongbrevet ditt.
						</p>
						<Link to={`${BASE}/sesong`} className="b-btn" prefetch="intent">
							Les sesongbrevet
						</Link>
					</div>
				) : null}
			</article>

			<p className="b-small" style={{ textAlign: 'center', marginTop: 24 }}>
				<Link
					to={`${BASE}/arkiv/konto`}
					className="b-word"
					style={{ fontSize: 15 }}
				>
					Konto og sletting
				</Link>
			</p>

			{/* ── Sheets ── */}
			<SportsSheet
				open={hole === 'sports'}
				onClose={close}
				setup={setup}
				write={sportsWrite}
			/>
			<Sheet
				open={hole === 'level'}
				onClose={close}
				title="Hvor lenge har du trent?"
			>
				<ul className="b-menu">
					{setup.choices.levels.map((l) => {
						const [title, rest] = l.label.split(':')
						return (
							<li key={l.id}>
								<button
									type="button"
									className="b-choice"
									aria-pressed={a.level === l.id}
									disabled={levelWrite.pending}
									onClick={async () => {
										const r = await levelWrite.call({
											level: l.id as ExperienceLevel,
										})
										if (r.ok) close()
									}}
								>
									<span>
										<strong style={{ fontWeight: 600 }}>{title}</strong>
										<span className="b-small" style={{ display: 'block' }}>
											{rest?.trim()}
										</span>
									</span>
									<span className="b-check">✓</span>
								</button>
							</li>
						)
					})}
				</ul>
				<ErrorLine message={levelWrite.error} />
			</Sheet>
			<HoursSheet
				open={hole === 'hours'}
				onClose={close}
				initial={hoursShown ?? 4}
				range={setup.choices.hoursPerWeek}
				write={hoursWrite}
				historyNote={setup.fromHistory.note}
			/>
			<DaysSheet
				open={hole === 'days'}
				onClose={close}
				initial={days ?? [...WEEKDAY_ORDER]}
				write={daysWrite}
			/>
			<Sheet
				open={hole === 'strength'}
				onClose={close}
				title="Hvor ofte vil du løfte?"
			>
				<ul className="b-menu">
					{setup.choices.strengthPerWeek.map((n) => (
						<li key={n}>
							<button
								type="button"
								className="b-choice"
								aria-pressed={
									(a.strengthPerWeek ?? 0) === n && !strengthIsSuggestion
								}
								disabled={strengthWrite.pending}
								onClick={async () => {
									const r = await strengthWrite.call({
										perWeek: n as 0 | 1 | 2 | 3,
									})
									if (r.ok) close()
								}}
							>
								<span>
									{n === 0
										? 'Ikke i planen'
										: n === 1
											? 'Én gang i uka'
											: `${n} ganger i uka`}
								</span>
								<span className="b-check">✓</span>
							</button>
						</li>
					))}
				</ul>
				<p className="b-small">
					Styrke legges unna de harde dagene. Er det ikke plass, legger jeg
					færre og sier fra.
				</p>
				<ErrorLine message={strengthWrite.error} />
			</Sheet>
			<PrefsSheet
				open={hole === 'prefs'}
				onClose={close}
				setup={setup}
				write={prefsWrite}
			/>
			<NameSheet
				open={hole === 'name'}
				onClose={close}
				initial={name}
				write={nameWrite}
			/>
			<IcuSheet
				open={hole === 'icu'}
				onClose={close}
				description={
					connections?.sources.find((s) => s.id === 'intervalsicu')
						?.description ?? null
				}
				onConnected={() => {
					close()
					setWatchDone(false)
				}}
			/>
			<Sheet open={hole === 'polar'} onClose={close} title="Polar">
				<p className="b-p">
					{connections?.sources.find((s) => s.id === 'polar')?.why ??
						'Polar kan ikke kobles til herfra ennå.'}
				</p>
				<div className="b-row">
					<button
						type="button"
						className="b-btn"
						onClick={() => setHole('icu')}
					>
						Bruk intervals.icu
					</button>
					<button type="button" className="b-btn b-btn-ghost" onClick={close}>
						Jeg sender en fil
					</button>
				</div>
			</Sheet>
			<GoalSheet
				open={hole === 'goal'}
				onClose={close}
				goal={goal}
				today={today}
				onSaved={() => {
					close()
					setGoalChoice('event')
					reveal(endRef)
				}}
			/>
		</main>
	)
}

/** What the letter writes back while the athlete fills in the holes. */
function Aside({
	setup,
	hoursShown,
	suggestedShown,
}: {
	setup: SetupState
	hoursShown: number | null
	suggestedShown: boolean
}) {
	const a = setup.answers
	const lines: string[] = []
	if (setup.fromHistory.note)
		lines.push(`Klokka di sier: ${setup.fromHistory.note}.`)
	if (setup.fromHistory.importing)
		lines.push('Jeg leser fortsatt historikken din.')
	if (a.level && suggestedShown)
		lines.push(
			'Det som står i blyant er mitt forslag ut fra nivået ditt. Trykk på det for å endre; det blir ditt når du signerer.',
		)
	if (
		hoursShown !== null &&
		setup.suggested &&
		a.currentHoursPerWeek !== null
	) {
		const s = setup.suggested.currentHoursPerWeek
		if (hoursShown >= s + 2)
			lines.push(
				`${hoursText(hoursShown)} er mer enn de fleste på ditt nivå. Jeg bygger forsiktig derfra.`,
			)
		else if (hoursShown <= s - 2)
			lines.push(
				`${hoursText(hoursShown)} er lite, men det holder. Jeg starter der du er.`,
			)
	}
	if (lines.length === 0) return null
	return (
		<div className="b-margin b-fade-in" aria-live="polite">
			{lines.map((l) => (
				<p
					key={l}
					style={{ margin: '0 0 6px', fontSize: 16, lineHeight: '24px' }}
				>
					{l}
				</p>
			))}
		</div>
	)
}

// ── Klokka ───────────────────────────────────────────────────────────────

function Clock({
	connections,
	initialStatus,
	onDone,
	onSkip,
	onOpenIcu,
	onOpenPolar,
	noWatch,
	hasSource,
}: {
	connections: ConnectionsOutput | null
	initialStatus: ImportStatusOutput | null
	onDone: () => void
	onSkip: () => void
	onOpenIcu: () => void
	onOpenPolar: () => void
	noWatch: boolean
	hasSource: boolean
}) {
	const status = useImportStatus(initialStatus)
	const fileRef = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)
	const [upload, setUpload] = useState<UploadOutput | null>(null)
	const [uploadError, setUploadError] = useState<string | null>(null)
	const revalidator = useRevalidator()
	const icu = connections?.sources.find((s) => s.id === 'intervalsicu')
	const total = status?.recordings.total ?? 0
	const importing = status?.importing ?? false
	const wasImporting = useRef(importing)
	useEffect(() => {
		if (wasImporting.current && !importing) {
			void revalidator.revalidate()
			onDone()
		}
		wasImporting.current = importing
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [importing])

	async function onFiles(files: FileList | null) {
		if (!files || files.length === 0) return
		setUploading(true)
		setUploadError(null)
		const form = new FormData()
		for (const f of Array.from(files)) form.append('file', f)
		try {
			const r = await uploadToCapability<UploadOutput>(
				'upload_activity_files',
				form,
			)
			if (r.ok) {
				setUpload(r.value)
				void revalidator.revalidate()
				if (r.value.imported > 0 || r.value.duplicates > 0) onDone()
			} else setUploadError(r.message)
		} catch {
			setUploadError('Fikk ikke kontakt. Prøv igjen.')
		} finally {
			setUploading(false)
			if (fileRef.current) fileRef.current.value = ''
		}
	}

	return (
		<>
			<p className="b-p">
				Har du en klokke som synker et sted?{' '}
				<button type="button" className="b-word" onClick={onOpenIcu}>
					Intervals.icu
				</button>
				{', '}
				<button type="button" className="b-word" onClick={onOpenPolar}>
					Polar
				</button>
				, eller{' '}
				<button
					type="button"
					className="b-word"
					onClick={() => fileRef.current?.click()}
					disabled={uploading}
				>
					send meg en fil
				</button>
				.
			</p>
			<input
				ref={fileRef}
				type="file"
				multiple
				accept=".fit,.gz,.tcx,.gpx,.zip"
				className="b-sr"
				tabIndex={-1}
				aria-hidden
				onChange={(e) => void onFiles(e.target.files)}
			/>
			{icu && icu.state !== 'not-connected' ? (
				<p className="b-small">
					intervals.icu er{' '}
					{icu.state === 'needs-reconnect'
						? 'koblet fra og må kobles på igjen'
						: 'koblet til'}
					.
				</p>
			) : null}
			{importing ? (
				<p className="b-p b-fade-in" aria-live="polite">
					Leser historikken din … <N>{total}</N> {total === 1 ? 'økt' : 'økter'}
				</p>
			) : null}
			{uploading ? <p className="b-p">Leser filene …</p> : null}
			{upload ? (
				<div className="b-fade-in" style={{ margin: '6px 0 12px' }}>
					<Stamp fresh>
						Mottatt: {upload.imported} {upload.imported === 1 ? 'økt' : 'økter'}
						{upload.duplicates
							? `, ${upload.duplicates} hadde jeg fra før`
							: ''}
					</Stamp>
					{upload.failed.length ? (
						<ul
							className="b-small"
							style={{ margin: '8px 0 0', paddingLeft: 18 }}
						>
							{upload.failed.map((f) => (
								<li key={f.file} style={{ overflowWrap: 'anywhere' }}>
									{f.file}: {f.reason}
								</li>
							))}
						</ul>
					) : null}
				</div>
			) : null}
			<ErrorLine message={uploadError} />
			{!importing && total > 0 ? (
				<p className="b-p b-fade-in">
					<Stamp fresh>Mottatt</Stamp> Jeg fikk <N>{total}</N>{' '}
					{total === 1 ? 'økt' : 'økter'}
					{status?.recordings.earliest
						? ` fra ${monthYear(status.recordings.earliest)} til i dag`
						: ''}
					.
					{status?.history.hoursPerWeek.value != null
						? ` De siste fire ukene trente du rundt ${hoursText(status.history.hoursPerWeek.value)} i uka.`
						: ''}
				</p>
			) : null}
			{!hasSource && total === 0 && !importing ? (
				noWatch ? (
					<p className="b-p b-fade-in">
						Da skriver vi uten. Du kan koble på senere i Arkivet.
					</p>
				) : (
					<p className="b-p">
						<button type="button" className="b-word" onClick={onSkip}>
							Jeg har ingen klokke
						</button>
					</p>
				)
			) : null}
		</>
	)
}

function useImportStatus(initial: ImportStatusOutput | null) {
	const [status, setStatus] = useState(initial)
	useEffect(() => setStatus(initial), [initial])
	useEffect(() => {
		if (!status?.importing) return
		let stop = false
		const t = window.setInterval(async () => {
			try {
				const res = await fetch(
					`/lab/api/import_status?input=${encodeURIComponent('{}')}`,
				)
				const json = (await res.json()) as {
					ok: boolean
					value?: ImportStatusOutput
				}
				if (!stop && json.ok && json.value) setStatus(json.value)
			} catch {
				// try again next round
			}
		}, 2500)
		return () => {
			stop = true
			window.clearInterval(t)
		}
	}, [status?.importing])
	return status
}

// ── Målet ────────────────────────────────────────────────────────────────

function GoalPart({
	goal,
	today,
	hasHistory,
	choice,
	setChoice,
	openSheet,
}: {
	goal: GoalOutput | null
	today: string
	hasHistory: boolean
	choice: 'event' | 'open' | null
	setChoice: (c: 'event' | 'open') => void
	openSheet: () => void
}) {
	const openEnded = useWrite<{ kind: 'open-ended' }, GoalWriteOutput>(
		'set_goal',
	)
	const remove = useWrite<{ stopPlan?: boolean }, unknown>('remove_goal')
	const g = goal?.goal
	return (
		<>
			<p className="b-p">Hva sikter vi mot?</p>
			{g ? (
				<p className="b-p b-fade-in">
					Du sikter mot <strong style={{ fontWeight: 600 }}>{g.name}</strong>,{' '}
					{dateText(g.date, Number(today.slice(0, 4)))}
					{g.distanceKm ? (
						<>
							, <N>{n1(g.distanceKm)} km</N>
						</>
					) : null}
					{g.targetTime ? (
						<>
							, helst på <N>{g.targetTime.text}</N>
						</>
					) : null}
					.{' '}
					<span className="b-small">
						Det er <N>{g.daysLeft}</N> dager til.
					</span>{' '}
					<button type="button" className="b-word" onClick={openSheet}>
						Endre
					</button>{' '}
					<button
						type="button"
						className="b-word"
						disabled={remove.pending}
						onClick={async () => {
							await remove.call({})
						}}
					>
						Fjern
					</button>
				</p>
			) : (
				<ul className="b-ps" style={{ margin: '0 0 8px' }}>
					<li>
						<button type="button" className="b-word" onClick={openSheet}>
							Et løp: navn, dato, distanse, helst på en tid
						</button>
					</li>
					<li>
						<button
							type="button"
							className="b-word"
							aria-pressed={choice === 'open'}
							disabled={openEnded.pending}
							onClick={async () => {
								const r = await openEnded.call({ kind: 'open-ended' })
								if (r.ok) setChoice('open')
							}}
						>
							Bare bli i bedre form
						</button>
					</li>
				</ul>
			)}
			{g?.targetTime ? (
				<p
					className="b-margin b-fade-in"
					style={{ fontSize: 16, lineHeight: '24px' }}
				>
					{hasHistory
						? `Med historikken din har jeg ikke grunnlag for å si om ${g.targetTime.text} er realistisk. Jeg sier fra etter 6 uker.`
						: `Jeg har ikke grunnlag ennå for å si om ${g.targetTime.text} er realistisk. Jeg sier fra etter 6 uker.`}
				</p>
			) : null}
			{choice === 'open' && !g ? (
				<p className="b-p b-fade-in">
					Da bygger jeg deg opp blokk for blokk, uten sluttdato. Du kan legge
					til et løp når som helst.
				</p>
			) : null}
			<ErrorLine message={openEnded.error ?? remove.error} />
			<span hidden>{today}</span>
		</>
	)
}
