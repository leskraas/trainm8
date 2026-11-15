import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { parse, suggest, type Suggestion } from './__commands.ts'
import { ConvoProvider, useConvo } from './__convo.tsx'
import { ThreadCtx, openRefs, useFlows } from './__flows.tsx'
import { mondayOf } from './__fmt.ts'
import { IconBook, IconGear, IconMenu, IconSend } from './__icons.tsx'
import { Onboarding } from './__onboarding.tsx'
import { ThreadView } from './__thread.tsx'
import { type LayoutData, type ThreadData } from './__types.ts'
import { Bubble, Mine, Turn, Typing } from './__ui.tsx'

export function Shell({ data }: { data: LayoutData }) {
	if (data.mode === 'error') {
		return (
			<main className="prat-thread">
				<Turn who="partner">
					<Bubble>
						Noe gikk galt da jeg skulle hente tråden. {data.message}
					</Bubble>
				</Turn>
			</main>
		)
	}
	return (
		<ConvoProvider today={data.athlete.today} username={data.athlete.username}>
			<ThreadCtx.Provider value={data.mode === 'thread' ? data : null}>
				<Frame data={data} />
			</ThreadCtx.Provider>
		</ConvoProvider>
	)
}

function Frame({ data }: { data: Exclude<LayoutData, { mode: 'error' }> }) {
	const { live } = useConvo()
	const location = useLocation()
	const endRef = useRef<HTMLDivElement>(null)
	const first = useRef(true)
	const thread = data.mode === 'thread' ? data : null

	// Open at the newest message, or at a linked one (#melding-…).
	useLayoutEffect(() => {
		if (!first.current) return
		first.current = false
		const hash = location.hash.slice(1)
		const target = hash ? document.getElementById(hash) : null
		if (target) target.scrollIntoView({ block: 'center' })
		else window.scrollTo(0, document.documentElement.scrollHeight)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Each new turn: bring it into view.
	const count = live.length
	useEffect(() => {
		if (!count) return
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
		const go = () =>
			window.scrollTo({
				top: document.documentElement.scrollHeight,
				behavior: reduce ? 'auto' : 'smooth',
			})
		requestAnimationFrame(go)
		const t = window.setTimeout(go, 350)
		return () => window.clearTimeout(t)
	}, [count])

	const sub =
		data.mode === 'onboarding'
			? 'legger planen din'
			: thread?.athlete.goal
				? thread.athlete.goal.daysToGo !== null &&
					thread.athlete.goal.daysToGo >= 0
					? `${thread.athlete.goal.name} om ${thread.athlete.goal.daysToGo} ${thread.athlete.goal.daysToGo === 1 ? 'dag' : 'dager'}`
					: thread.athlete.goal.name
				: 'treningspartneren din'

	return (
		<div className="prat-shell">
			<div className="prat-main">
				<TopBar
					sub={sub}
					today={data.athlete.today}
					showMenu={data.mode === 'thread'}
				/>
				<main className="prat-thread" aria-live="polite">
					{data.mode === 'onboarding' ? (
						<Onboarding data={data} />
					) : (
						<ThreadView data={data} />
					)}
					{live.map((l) =>
						l.typing ? (
							<Typing key={l.id} />
						) : (
							<div key={l.id} style={{ display: 'contents' }}>
								{l.node}
							</div>
						),
					)}
					<div
						ref={endRef}
						style={{
							height: 1,
							scrollMarginBottom: 'calc(140px + env(safe-area-inset-bottom))',
						}}
					/>
				</main>
				{thread ? <Composer data={thread} /> : null}
			</div>
			{thread ? <Aside data={thread} /> : null}
			<Outlet context={{ today: data.athlete.today }} />
		</div>
	)
}

function TopBar({
	sub,
	today,
	showMenu,
}: {
	sub: string
	today: string
	showMenu: boolean
}) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!open) return
		const onDown = (e: PointerEvent) => {
			if (!ref.current?.contains(e.target as Node)) setOpen(false)
		}
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
		window.addEventListener('pointerdown', onDown)
		window.addEventListener('keydown', onKey)
		return () => {
			window.removeEventListener('pointerdown', onDown)
			window.removeEventListener('keydown', onKey)
		}
	}, [open])
	const week = mondayOf(today)
	return (
		<header className="prat-top">
			<div ref={ref}>
				{showMenu ? (
					<button
						type="button"
						className="prat-iconbtn"
						aria-label="Snarveier"
						aria-expanded={open}
						onClick={() => setOpen((v) => !v)}
					>
						<IconMenu />
					</button>
				) : (
					<span style={{ width: 8, display: 'inline-block' }} />
				)}
				{open ? (
					<nav className="prat-menu" onClick={() => setOpen(false)}>
						<small>Oppslag</small>
						<Link to="/lab/prat/oppslag/plan" preventScrollReset>
							<IconBook size={20} /> Planen samlet
						</Link>
						<Link to={`/lab/prat/oppslag/uke/${week}`} preventScrollReset>
							<IconBook size={20} /> Denne uka
						</Link>
						<Link to="/lab/prat/oppslag/okter" preventScrollReset>
							<IconBook size={20} /> Økter og historikk
						</Link>
						<Link to="/lab/prat/oppslag/form" preventScrollReset>
							<IconBook size={20} /> Form og fremgang
						</Link>
						<hr />
						<small>Endre</small>
						{[
							['soner', 'Soner og terskler'],
							['tilgjengelighet', 'Tilgjengelighet'],
							['mal', 'Mål'],
							['koblinger', 'Koblinger og filer'],
							['konto', 'Konto og eksport'],
						].map(([k, label]) => (
							<Link
								key={k}
								to={`/lab/prat/innstillinger/${k}`}
								preventScrollReset
							>
								<IconGear size={20} /> {label}
							</Link>
						))}
					</nav>
				) : null}
			</div>
			<div className="prat-who">
				<span className="prat-avatar" aria-hidden="true">
					P
				</span>
				<div style={{ minWidth: 0 }}>
					<div className="prat-who-name">Prat</div>
					<div className="prat-who-sub">{sub}</div>
				</div>
			</div>
		</header>
	)
}

function Composer({ data }: { data: ThreadData }) {
	const [text, setText] = useState('')
	const [active, setActive] = useState(0)
	const [online, setOnline] = useState(true)
	const flows = useFlows()
	const navigate = useNavigate()
	const { push } = useConvo()
	const today = data.athlete.today
	const open = useMemo(() => openRefs(data), [data])
	const ctx = useMemo(() => ({ today, open }), [today, open])
	const list: Suggestion[] = useMemo(() => suggest(text, ctx), [text, ctx])
	const todayOpen = (data.today?.sessions ?? []).some(
		(s) => s.status === 'planned',
	)

	useEffect(() => {
		const on = () => setOnline(navigator.onLine)
		on()
		window.addEventListener('online', on)
		window.addEventListener('offline', on)
		return () => {
			window.removeEventListener('online', on)
			window.removeEventListener('offline', on)
		}
	}, [])

	const runText = (input: string) => {
		const cmd = parse(input, ctx)
		setText('')
		setActive(0)
		if (cmd.kind === 'flow') {
			flows.start(cmd.flow, cmd.ref ?? null, cmd.said)
			return
		}
		push(<Mine fly>{cmd.said}</Mine>)
		if (cmd.kind === 'go') {
			push(
				<Turn who="partner" enter>
					<Bubble>{cmd.reply}</Bubble>
				</Turn>,
			)
			void navigate(cmd.to, { preventScrollReset: true })
			return
		}
		try {
			const n = Number(window.localStorage.getItem('prat:ukjent') ?? '0') + 1
			window.localStorage.setItem('prat:ukjent', String(n))
		} catch {
			// Counting what isn't understood is only a convenience.
		}
		push(
			<Turn who="partner" enter>
				<Bubble>
					Det forstår jeg ikke ennå. Jeg kan: flytt, bytt, hopp over, kortere,
					lettere, lettere uke, gjort, legg til, i dag, plan, uke, økter, form,
					soner, tilgjengelighet, mål, koblinger, konto og angre.
				</Bubble>
			</Turn>,
		)
	}

	const quick: { label: string; run: () => void }[] = [
		{ label: 'Hvordan går det?', run: () => flows.start('form') },
		...(todayOpen ? [{ label: 'Gjort', run: () => flows.start('gjort') }] : []),
		{ label: 'Flytt', run: () => flows.start('flytt') },
		{
			label: 'Oppslag',
			run: () =>
				void navigate('/lab/prat/oppslag/plan', { preventScrollReset: true }),
		},
		{ label: 'Lettere uke', run: () => flows.start('lettere-uke') },
		{ label: 'Legg til', run: () => flows.start('legg-til') },
		{ label: 'Angre', run: () => flows.start('angre') },
	]

	return (
		<div className="prat-composer">
			<div className="prat-composer-in">
				{!online ? (
					<div className="prat-offline">
						Du er ikke på nett. Det du gjør sendes ikke før du er tilbake.
					</div>
				) : null}
				{text && list.length ? (
					<div className="prat-autolist" role="listbox" aria-label="Forslag">
						{list.map((s, i) => (
							<button
								key={s.text}
								type="button"
								role="option"
								aria-selected={i === active}
								data-active={i === active}
								onClick={() => runText(s.text)}
							>
								<b>{s.text}</b>
								<small>{s.hint}</small>
							</button>
						))}
					</div>
				) : (
					<div className="prat-suggest" aria-label="Snarveier">
						{quick.map((q) => (
							<button
								key={q.label}
								type="button"
								className={`prat-chip${q.label === 'Hvordan går det?' ? 'primary' : 'quiet'}`}
								onClick={q.run}
							>
								<span>{q.label}</span>
							</button>
						))}
					</div>
				)}
				<form
					className="prat-cmdrow"
					onSubmit={(e) => {
						e.preventDefault()
						const pick = list[active]
						if (!text.trim()) return
						runText(
							pick && pick.text.startsWith(text.trim().toLowerCase())
								? pick.text
								: text,
						)
					}}
				>
					<input
						className="prat-cmd"
						value={text}
						onChange={(e) => {
							setText(e.target.value)
							setActive(0)
						}}
						onKeyDown={(e) => {
							if (e.key === 'ArrowDown') {
								e.preventDefault()
								setActive((a) => Math.min(list.length - 1, a + 1))
							} else if (e.key === 'ArrowUp') {
								e.preventDefault()
								setActive((a) => Math.max(0, a - 1))
							} else if (e.key === 'Escape') setText('')
						}}
						placeholder="Skriv «flytt», «form», «soner» …"
						aria-label="Kommando"
						enterKeyHint="send"
						autoComplete="off"
						autoCapitalize="off"
					/>
					<button
						type="submit"
						className="prat-send"
						aria-label="Send"
						disabled={!text.trim()}
					>
						<IconSend />
					</button>
				</form>
			</div>
		</div>
	)
}

function Aside({ data }: { data: ThreadData }) {
	const week = mondayOf(data.athlete.today)
	const w = data.week
	return (
		<aside className="prat-aside" aria-label="Oppslag">
			<div className="prat-sheet-body" style={{ paddingTop: 72 }}>
				<h2 className="prat-h2">Oppslag</h2>
				<p className="prat-note" style={{ margin: 0 }}>
					Det samme som i tråden, samlet for å skumme.
				</p>
				<div className="prat-list">
					<Link
						className="prat-row"
						to="/lab/prat/oppslag/plan"
						preventScrollReset
					>
						<span className="prat-row-main">
							<span className="prat-row-title">Planen</span>
							<span className="prat-row-sub">Faser og uker</span>
						</span>
					</Link>
					<Link
						className="prat-row"
						to={`/lab/prat/oppslag/uke/${week}`}
						preventScrollReset
					>
						<span className="prat-row-main">
							<span className="prat-row-title">Denne uka</span>
							<span className="prat-row-sub">
								{w
									? `${w.counts.done} gjort, ${w.counts.planned} igjen`
									: 'Dag for dag'}
							</span>
						</span>
					</Link>
					<Link
						className="prat-row"
						to="/lab/prat/oppslag/okter"
						preventScrollReset
					>
						<span className="prat-row-main">
							<span className="prat-row-title">Økter</span>
							<span className="prat-row-sub">Planlagt mot gjort</span>
						</span>
					</Link>
					<Link
						className="prat-row"
						to="/lab/prat/oppslag/form"
						preventScrollReset
					>
						<span className="prat-row-main">
							<span className="prat-row-title">Form</span>
							<span className="prat-row-sub">Fremgang over tid</span>
						</span>
					</Link>
				</div>
			</div>
		</aside>
	)
}
