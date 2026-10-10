/**
 * PROTOTYPE — four structurally different ways to compose a session on a
 * phone. Same week, same real parse, same week sum, same undo; only the
 * composing differs.
 *
 * - **A · Skriv** — the line in the tapped row; type, and the tokens appear as
 *   they become sure. Strength and Annet in the same line. "Gjør grundigere"
 *   opens the Drawer.
 * - **B · Bygg** — a compact Drawer of token slots; each slot opens a popover
 *   of presets and steppers. No keyboard unless you want one.
 * - **C · Forslag først** — the four fill sources (Arket's FILL_SOURCES) in the
 *   row; a picked suggestion becomes tokens you adjust in place.
 * - **D · Rask → Drawer** — one Drawer with two snap points: the quick line
 *   with a day strip at the first, the deep editor at the top. Tapping a
 *   session opens the same Drawer full, as its detail.
 *
 * THROWAWAY — do not ship.
 */
import { useMemo, useState } from 'react'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from '#app/components/ui/drawer.tsx'
import {
	SegmentedControl,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import { cn } from '#app/utils/misc.tsx'
import {
	Actions,
	type Draft,
	draftFromText,
	draftText,
	emptyDraft,
	FillGrid,
	type Picked,
	SourceList,
	SportChips,
	TokenBuilder,
	useLine,
	WritingLine,
} from './__prototype-compose-parts.tsx'
import {
	DeepDrawer,
	DeepEditor,
	dayName,
	Meter,
	type Placed,
	type ProtoDay,
	readSentence,
	type Source,
	SOURCE_GLYPH,
	SOURCE_LABEL,
	type Sport,
	Understood,
	useMeter,
	useStore,
	useSumLine,
	WeekList,
} from './__prototype-compose-shared.tsx'

/** Shared by every variant: a session's full detail, in the Drawer. */
function DetailDrawer({
	session,
	onClose,
}: {
	session: Placed | null
	onClose: () => void
}) {
	const { catalogue, remove, days } = useStore()
	const reading = useMemo(
		() => (session ? readSentence(session.text, session.sport, catalogue) : null),
		[session, catalogue],
	)
	const day = days.find((d) => d.key === session?.dayKey)
	return (
		<DeepDrawer
			open={session != null}
			onOpenChange={(o) => (o ? null : onClose())}
			title={session?.text ?? ''}
			description={day ? dayName(day) : undefined}
		>
			{session && reading ? (
				<>
					<Understood reading={reading} />
					<dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
						<dt className="text-muted-foreground">Eier</dt>
						<dd>
							{SOURCE_GLYPH[session.source]} {SOURCE_LABEL[session.source]} — appen endrer den ikke uten å spørre
						</dd>
						<dt className="text-muted-foreground">Teller i</dt>
						<dd>{session.sport === 'annet' ? 'Annet (ingen ukesum)' : 'sporet sitt'}</dd>
					</dl>
					<DeepEditor reading={reading} notes={session.notes ?? ''} onNotes={() => {}} />
					<div className="flex flex-wrap gap-2">
						<Button variant="outline" className="rounded-full">Lås opp</Button>
						<Button variant="outline" className="rounded-full">Flytt dag</Button>
						<Button
							variant="ghost"
							className="text-destructive"
							onClick={() => {
								remove(session.id)
								onClose()
							}}
						>
							Slett økta
						</Button>
					</div>
				</>
			) : null}
		</DeepDrawer>
	)
}

function useComposer() {
	const store = useStore()
	const [openKey, setOpenKey] = useState<string | null>(null)
	const [detail, setDetail] = useState<Placed | null>(null)
	const meter = useMeter(openKey != null)
	return { ...store, openKey, setOpenKey, detail, setDetail, meter }
}

// ——— A · Skriv ——————————————————————————————————————————————————————————

function LineInRow({
	day,
	onDone,
	onDeeper,
}: {
	day: ProtoDay
	onDone: () => void
	onDeeper: (text: string, sport: Sport) => void
}) {
	const { add } = useStore()
	const [sport, setSport] = useState<Sport>('run')
	const [text, setText] = useState('')
	const { reading, sum } = useLine(day.key, sport, text)
	const write = () => {
		add({ dayKey: day.key, sport, text: text.trim(), source: 'skrevet' }, sum)
		onDone()
	}
	return (
		<div className="flex flex-col gap-2.5 py-1" data-proto-composer>
			<SportChips value={sport} onChange={setSport} />
			<WritingLine sport={sport} text={text} onText={setText} reading={reading} sum={sum} onSubmit={write} />
			<Actions ok={reading.ok} onAdd={write} onDeeper={() => onDeeper(text, sport)} onCancel={onDone} />
		</div>
	)
}

export function VariantA() {
	const c = useComposer()
	const [deep, setDeep] = useState<{ day: ProtoDay; text: string; sport: Sport } | null>(null)
	return (
		<>
			<WeekList
				openKey={c.openKey}
				onOpen={c.setOpenKey}
				onSession={c.setDetail}
				renderOpen={(day) => (
					<LineInRow
						day={day}
						onDone={() => c.setOpenKey(null)}
						onDeeper={(text, sport) => {
							setDeep({ day, text, sport })
							c.setOpenKey(null)
						}}
					/>
				)}
			/>
			<Meter meter={c.meter} />
			{deep ? <DeepCompose {...deep} onClose={() => setDeep(null)} /> : null}
			<DetailDrawer session={c.detail} onClose={() => c.setDetail(null)} />
		</>
	)
}

/** "Gjør grundigere": the line carried into the Drawer, with the deep editor under it. */
function DeepCompose({
	day,
	text: initial,
	sport: initialSport,
	onClose,
}: {
	day: ProtoDay
	text: string
	sport: Sport
	onClose: () => void
}) {
	const { add } = useStore()
	const [open, setOpen] = useState(true)
	const [sport, setSport] = useState(initialSport)
	const [text, setText] = useState(initial)
	const [notes, setNotes] = useState('')
	const { reading, sum } = useLine(day.key, sport, text)
	const close = () => {
		setOpen(false)
		setTimeout(onClose, 400)
	}
	return (
		<DeepDrawer open={open} onOpenChange={(o) => (o ? null : close())} title={`Ny økt ${dayName(day)}`}>
			<SportChips value={sport} onChange={setSport} />
			<WritingLine sport={sport} text={text} onText={setText} reading={reading} sum={sum} onSubmit={() => {}} autoFocus={false} />
			<DeepEditor reading={reading.ok ? reading : null} notes={notes} onNotes={setNotes} />
			<Actions
				ok={reading.ok}
				onAdd={() => {
					add({ dayKey: day.key, sport, text: text.trim(), source: 'skrevet', notes }, sum)
					close()
				}}
				onCancel={close}
			/>
		</DeepDrawer>
	)
}

// ——— B · Bygg ——————————————————————————————————————————————————————————

function Builder({
	day,
	draft,
	onDraft,
	onDone,
	source = 'skrevet',
}: {
	day: ProtoDay
	draft: Draft
	onDraft: (d: Draft) => void
	onDone: () => void
	source?: Source
}) {
	const { add, catalogue } = useStore()
	const text = draftText(draft)
	const reading = useMemo(() => readSentence(text, draft.sport, catalogue), [text, draft.sport, catalogue])
	const sum = useSumLine(day.key, text ? reading : null)
	return (
		<div className="flex flex-col gap-3" data-proto-composer>
			<SportChips value={draft.sport} onChange={(s) => onDraft(emptyDraft(s))} />
			<TokenBuilder draft={draft} onDraft={onDraft} />
			{text ? (
				<div className="flex flex-col gap-1">
					<p className="text-footnote text-muted-foreground">
						Leses som <span className="text-foreground font-semibold">«{text}»</span>
					</p>
					{reading.ok ? <Understood reading={reading} /> : null}
					{sum ? <p data-proto-sum className="text-footnote font-semibold tabular-nums">{sum}</p> : null}
				</div>
			) : null}
			<Actions
				ok={reading.ok}
				onAdd={() => {
					add({ dayKey: day.key, sport: draft.sport, text, source }, sum)
					onDone()
				}}
				onCancel={onDone}
			/>
		</div>
	)
}

export function VariantB() {
	const c = useComposer()
	const day = c.days.find((d) => d.key === c.openKey) ?? null
	const [draft, setDraft] = useState<Draft>(emptyDraft('run'))
	const open = (key: string) => {
		setDraft(emptyDraft('run'))
		c.setOpenKey(key)
	}
	return (
		<>
			<WeekList openKey={c.openKey} onOpen={open} onSession={c.setDetail} />
			<Meter meter={c.meter} />
			<Drawer open={day != null} onOpenChange={(o) => (o ? null : c.setOpenKey(null))} showSwipeHandle>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>{day ? `Ny økt ${dayName(day)}` : ''}</DrawerTitle>
					</DrawerHeader>
					<div className="px-4 pb-6">
						{day ? <Builder day={day} draft={draft} onDraft={setDraft} onDone={() => c.setOpenKey(null)} /> : null}
					</div>
				</DrawerContent>
			</Drawer>
			<DetailDrawer session={c.detail} onClose={() => c.setDetail(null)} />
		</>
	)
}

// ——— C · Forslag først ——————————————————————————————————————————————

function SuggestInRow({ day, onDone }: { day: ProtoDay; onDone: () => void }) {
	const [source, setSource] = useState<Source | null>(null)
	const [draft, setDraft] = useState<Draft | null>(null)
	const [picked, setPicked] = useState<Source>('skrevet')
	if (draft) {
		return <Builder day={day} draft={draft} onDraft={setDraft} onDone={onDone} source={picked} />
	}
	if (source === 'skrevet') return <LineInRow day={day} onDone={onDone} onDeeper={() => {}} />
	if (source) {
		return (
			<div className="flex flex-col gap-2 py-1" data-proto-composer>
				<SourceList
					source={source}
					sport={null}
					onPick={(p: Picked) => {
						setPicked(p.source)
						setDraft(draftFromText(p.text, p.sport))
					}}
				/>
				<Button variant="ghost" className="self-start" onClick={() => setSource(null)}>
					Tilbake
				</Button>
			</div>
		)
	}
	return (
		<div className="flex flex-col gap-2 py-1" data-proto-composer>
			<FillGrid onPick={setSource} />
			<Button variant="ghost" className="self-start" onClick={onDone}>
				Avbryt
			</Button>
		</div>
	)
}

export function VariantC() {
	const c = useComposer()
	return (
		<>
			<WeekList
				openKey={c.openKey}
				onOpen={c.setOpenKey}
				onSession={c.setDetail}
				renderOpen={(day) => <SuggestInRow day={day} onDone={() => c.setOpenKey(null)} />}
			/>
			<Meter meter={c.meter} />
			<DetailDrawer session={c.detail} onClose={() => c.setDetail(null)} />
		</>
	)
}

// ——— D · Rask → Drawer ——————————————————————————————————————————————

const QUICK = '30rem'

function QuickToDeep({ dayKey, onDone }: { dayKey: string; onDone: () => void }) {
	const { days, add } = useStore()
	const [key, setKey] = useState(dayKey)
	const [sport, setSport] = useState<Sport>('run')
	const [text, setText] = useState('')
	const [notes, setNotes] = useState('')
	const [tab, setTab] = useState<Source>('skrevet')
	const [snap, setSnap] = useState<number | string | null>(QUICK)
	const [source, setSource] = useState<Source>('skrevet')
	const { reading, sum } = useLine(key, sport, text)
	const deep = snap === 1
	return (
		<Drawer
			open
			onOpenChange={(o) => (o ? null : onDone())}
			showSwipeHandle
			snapPoints={[QUICK, 1]}
			snapPoint={snap}
			onSnapPointChange={setSnap}
		>
			<DrawerContent>
				<DrawerHeader className="pb-2">
					<DrawerTitle>Ny økt</DrawerTitle>
				</DrawerHeader>
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6" data-proto-composer>
					{/* The same day picker for every way in. */}
					<div role="radiogroup" aria-label="Dag" className="-mx-1 flex gap-1 overflow-x-auto px-1">
						{days.map((d) => (
							<button
								key={d.key}
								type="button"
								role="radio"
								aria-checked={d.key === key}
								onClick={() => setKey(d.key)}
								className={cn(
									'pressable flex h-14 w-12 flex-none flex-col items-center justify-center rounded-2xl text-[11px] font-bold',
									d.key === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
								)}
							>
								{d.weekday}
								<span className="text-[16px] font-semibold tabular-nums">{d.date.split('.')[0]}</span>
							</button>
						))}
					</div>
					<SegmentedControl value={tab} onValueChange={setTab} aria-label="Kilde">
						<ToggleGroupItem value="skrevet">Skriv</ToggleGroupItem>
						<ToggleGroupItem value="bibliotek">Bibliotek</ToggleGroupItem>
						<ToggleGroupItem value="kopi">Kopier</ToggleGroupItem>
						<ToggleGroupItem value="appen">Appen</ToggleGroupItem>
					</SegmentedControl>
					{tab === 'skrevet' ? (
						<>
							<SportChips value={sport} onChange={setSport} />
							<WritingLine
								sport={sport}
								text={text}
								onText={setText}
								reading={reading}
								sum={sum}
								autoFocus={false}
								onSubmit={() => {
									add({ dayKey: key, sport, text: text.trim(), source, notes }, sum)
									onDone()
								}}
							/>
						</>
					) : (
						<SourceList
							source={tab}
							sport={null}
							onPick={(p) => {
								setSport(p.sport)
								setText(p.text)
								setSource(p.source)
								setTab('skrevet')
							}}
						/>
					)}
					<Actions
						ok={reading.ok}
						onAdd={() => {
							add({ dayKey: key, sport, text: text.trim(), source, notes }, sum)
							onDone()
						}}
						onDeeper={deep ? undefined : () => setSnap(1)}
						onCancel={onDone}
					/>
					{source !== 'skrevet' ? (
						<Badge variant="outline" className="self-start">
							{SOURCE_GLYPH[source]} {SOURCE_LABEL[source]} — blir din når du endrer den
						</Badge>
					) : null}
					{deep ? <DeepEditor reading={reading.ok ? reading : null} notes={notes} onNotes={setNotes} /> : null}
				</div>
			</DrawerContent>
		</Drawer>
	)
}

export function VariantD() {
	const c = useComposer()
	return (
		<>
			<WeekList openKey={null} onOpen={c.setOpenKey} onSession={c.setDetail} />
			<Meter meter={c.meter} />
			{c.openKey ? <QuickToDeep dayKey={c.openKey} onDone={() => c.setOpenKey(null)} /> : null}
			<DetailDrawer session={c.detail} onClose={() => c.setDetail(null)} />
		</>
	)
}
