import { useRef, useState } from 'react'
import { Link, useRevalidator } from 'react-router'
import { uploadToCapability } from '#app/lab/engine/client.ts'
import {
	type RecordingItem,
	type RecordingsOutput,
} from '#app/lab/engine/reads.types.ts'
import { runCapability } from '#app/lab/engine/registry.server.ts'
import {
	type LinkOptionsOutput,
	type LinkRecordingOutput,
	type UnlinkRecordingOutput,
} from '#app/lab/engine/sessions.types.ts'
import {
	type ConnectionsOutput,
	type DisconnectOutput,
	type ImportStatusOutput,
	type Source,
	type SyncOutput,
	type UploadOutput,
} from '#app/lab/engine/setup.types.ts'
import {
	BASE,
	DAY_NAME,
	cap,
	dateText,
	dayTimeOf,
	known,
	minText,
	monthYear,
	mondayOf,
	n1,
	weekdayOf,
} from '../__lib.ts'
import { addPs } from '../__ps.ts'
import { IcuSheet } from '../__sheets.tsx'
import { ErrorLine, N, SportMark, Stamp, useWrite } from '../__ui.tsx'
import { type Route } from './+types/koblinger.ts'

export async function loader({ request }: Route.LoaderArgs) {
	const [connections, status, recordings, athlete] = await Promise.all([
		runCapability(request, 'connections', {}),
		runCapability(request, 'import_status', {}),
		runCapability(request, 'recordings', { limit: 12 }),
		runCapability(request, 'athlete', {}),
	])
	return {
		connections: connections.ok
			? (connections.value as ConnectionsOutput)
			: null,
		status: status.ok ? (status.value as ImportStatusOutput) : null,
		recordings: recordings.ok ? (recordings.value as RecordingsOutput) : null,
		tz: athlete.ok ? athlete.value.timezone : undefined,
		error: connections.ok ? null : connections.message,
	}
}

export const meta = () => [{ title: 'Brev · koblinger' }]

const STATE: Record<string, string> = {
	'not-connected': 'ikke koblet til',
	connected: 'koblet til',
	'importing-history': 'leser historikken',
	'needs-reconnect': 'må kobles til på nytt',
}

export default function Koblinger({ loaderData }: Route.ComponentProps) {
	const { connections, status, recordings, tz, error } = loaderData
	const [icu, setIcu] = useState(false)
	const fileRef = useRef<HTMLInputElement>(null)
	const [uploading, setUploading] = useState(false)
	const [upload, setUpload] = useState<UploadOutput | null>(null)
	const [uploadError, setUploadError] = useState<string | null>(null)
	const revalidator = useRevalidator()
	const total = status?.recordings.total ?? 0

	return (
		<main className="b-col">
			<Link to={`${BASE}/arkiv`} className="b-back">
				← Arkivet
			</Link>
			<h1 className="b-h" style={{ margin: '4px 4px 18px' }}>
				Koblinger
			</h1>
			<section className="b-sheet">
				<p className="b-p">
					{total > 0 ? (
						<>
							Jeg har <N>{total}</N> {total === 1 ? 'økt' : 'økter'}
							{status?.recordings.earliest
								? ` fra ${monthYear(status.recordings.earliest)}`
								: ''}
							{status?.recordings.latest
								? ` til ${dateText(status.recordings.latest)}`
								: ''}
							.
						</>
					) : (
						'Jeg har ingen økter fra klokka ennå.'
					)}
					{status?.importing ? ' Jeg leser fortsatt historikken din.' : ''}
				</p>
				{connections?.duplicateRisk ? (
					<p className="b-margin">{connections.duplicateRisk}</p>
				) : null}
				<ul className="b-menu">
					{(connections?.sources ?? []).map((s) => (
						<SourceRow
							key={s.id}
							s={s}
							onConnect={() => setIcu(true)}
							onUpload={() => fileRef.current?.click()}
							uploading={uploading}
						/>
					))}
				</ul>
				<input
					ref={fileRef}
					type="file"
					multiple
					accept=".fit,.gz,.tcx,.gpx,.zip"
					className="b-sr"
					tabIndex={-1}
					aria-hidden
					onChange={async (e) => {
						const files = e.target.files
						if (!files?.length) return
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
							} else setUploadError(r.message)
						} catch {
							setUploadError('Fikk ikke kontakt. Prøv igjen.')
						} finally {
							setUploading(false)
							if (fileRef.current) fileRef.current.value = ''
						}
					}}
				/>
				{upload ? (
					<div className="b-fade-in" style={{ marginTop: 10 }}>
						<Stamp fresh>
							Mottatt: {upload.imported}{' '}
							{upload.imported === 1 ? 'økt' : 'økter'}
							{upload.duplicates
								? `, ${upload.duplicates} hadde jeg fra før`
								: ''}
						</Stamp>
						{upload.failed.map((f) => (
							<p
								key={f.file}
								className="b-small"
								style={{ overflowWrap: 'anywhere', margin: '6px 0 0' }}
							>
								{f.file}: {f.reason}
							</p>
						))}
					</div>
				) : null}
				<ErrorLine message={uploadError ?? error} />
			</section>

			<section className="b-sheet" aria-labelledby="rec-h">
				<h2 id="rec-h" className="b-h2" style={{ marginTop: 0 }}>
					Det siste som kom inn
				</h2>
				{recordings?.recordings.length ? (
					<ul className="b-ps">
						{recordings.recordings.map((r) => (
							<RecordingRow key={r.id} r={r} tz={tz} />
						))}
					</ul>
				) : (
					<p className="b-p">Ingenting ennå.</p>
				)}
			</section>
			<IcuSheet
				open={icu}
				onClose={() => setIcu(false)}
				description={
					connections?.sources.find((s) => s.id === 'intervalsicu')
						?.description ?? null
				}
				onConnected={() => setIcu(false)}
			/>
		</main>
	)
}

function SourceRow({
	s,
	onConnect,
	onUpload,
	uploading,
}: {
	s: Source
	onConnect: () => void
	onUpload: () => void
	uploading: boolean
}) {
	const sync = useWrite<{ source?: 'intervalsicu' | 'strava' }, SyncOutput>(
		'sync_sources',
	)
	const disconnect = useWrite<
		{ source: 'intervalsicu' | 'strava' },
		DisconnectOutput
	>('disconnect_source')
	const [sure, setSure] = useState(false)
	const res = sync.result?.ok ? sync.result.value : null
	const id = s.id === 'intervalsicu' || s.id === 'strava' ? s.id : null
	return (
		<li style={{ padding: '12px 0' }}>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					gap: 12,
					alignItems: 'baseline',
				}}
			>
				<strong style={{ fontWeight: 600 }}>{s.name}</strong>
				<span className="b-small" style={{ textAlign: 'right' }}>
					{s.id === 'file'
						? 'alltid åpen'
						: s.availability === 'coming-soon'
							? 'kommer'
							: s.availability === 'not-available'
								? 'ikke herfra'
								: STATE[s.state]}
				</span>
			</div>
			<p
				className="b-small"
				style={{ margin: '4px 0 8px', overflowWrap: 'anywhere' }}
			>
				{s.why ?? s.description}
				{s.lastCheckedAt ? ` Sist spurt ${dayTimeOf(s.lastCheckedAt)}.` : ''}
			</p>
			<div className="b-row">
				{s.id === 'file' ? (
					<button
						type="button"
						className="b-btn b-btn-ghost"
						onClick={onUpload}
						disabled={uploading}
					>
						{uploading ? 'Leser filene …' : 'Send en fil'}
					</button>
				) : null}
				{s.id === 'intervalsicu' &&
				(s.state === 'not-connected' || s.state === 'needs-reconnect') ? (
					<button type="button" className="b-btn" onClick={onConnect}>
						{s.state === 'needs-reconnect' ? 'Koble til på nytt' : 'Koble til'}
					</button>
				) : null}
				{s.canSync && id ? (
					<button
						type="button"
						className="b-btn b-btn-ghost"
						disabled={sync.pending}
						onClick={() => void sync.call({ source: id })}
					>
						{sync.pending ? 'Spør …' : 'Hent nå'}
					</button>
				) : null}
				{s.canDisconnect && id ? (
					sure ? (
						<>
							<button
								type="button"
								className="b-btn b-btn-red"
								disabled={disconnect.pending}
								onClick={() => void disconnect.call({ source: id })}
							>
								Koble fra
							</button>
							<button
								type="button"
								className="b-word"
								onClick={() => setSure(false)}
							>
								Avbryt
							</button>
						</>
					) : (
						<button
							type="button"
							className="b-word"
							style={{ fontSize: 16 }}
							onClick={() => setSure(true)}
						>
							Koble fra …
						</button>
					)
				) : null}
			</div>
			{sure ? (
				<p className="b-small">
					Øktene jeg har hentet, blir liggende. Du kan koble til igjen senere.
				</p>
			) : null}
			{res ? (
				<p className="b-small b-fade-in">
					{res.imported ? `Hentet ${res.imported} nye.` : 'Ingenting nytt.'}
					{res.failed.map((f) => ` ${f.message}`).join('')}
					{res.retryAt ? ` Prøv igjen etter ${dayTimeOf(res.retryAt)}.` : ''}
				</p>
			) : null}
			<ErrorLine message={sync.error ?? disconnect.error} />
		</li>
	)
}

function RecordingRow({ r, tz }: { r: RecordingItem; tz?: string }) {
	const [open, setOpen] = useState(false)
	const options = useWrite<{ recordingId: string }, LinkOptionsOutput>(
		'link_options',
	)
	const link = useWrite<
		{ recordingId: string; sessionId: string },
		LinkRecordingOutput
	>('link_recording')
	const unlink = useWrite<{ recordingId: string }, UnlinkRecordingOutput>(
		'unlink_recording',
	)
	const opts = options.result?.ok ? options.result.value.options : null
	return (
		<li style={{ marginBottom: 14 }}>
			<SportMark sport={r.sport} />
			<Link to={`${BASE}/dag/${r.date}`} style={{ textDecoration: 'none' }}>
				{cap(DAY_NAME[weekdayOf(r.date)])} {dateText(r.date)}
			</Link>
			: {r.sportName.toLowerCase()}
			{known(r.durationS) ? (
				<>
					, <N>{minText(r.durationS.value / 60)}</N>
				</>
			) : null}
			{known(r.distanceM) ? (
				<>
					, <N>{n1(r.distanceM.value / 1000)} km</N>
				</>
			) : null}
			.{' '}
			<span className="b-small">
				{r.linkedToPlan ? 'Koblet til planen.' : 'Uten plan.'} Fra {r.from}
				{r.alsoFrom.length ? ` (også ${r.alsoFrom.join(', ')})` : ''}.
			</span>{' '}
			<button
				type="button"
				className="b-word"
				style={{ fontSize: 15, color: 'var(--ink-2)' }}
				aria-expanded={open}
				onClick={() => {
					setOpen((o) => !o)
					if (!opts)
						void options.call({ recordingId: r.id }, { revalidate: false })
				}}
			>
				{r.linkedToPlan ? 'Feil økt?' : 'Hører den til en planlagt økt?'}
			</button>
			{open ? (
				<div className="b-margin b-fade-in" style={{ fontStyle: 'normal' }}>
					{options.pending ? <p className="b-small">Ser etter …</p> : null}
					{opts && opts.length ? (
						<div className="b-row">
							{opts.map((o) => (
								<button
									key={o.id}
									type="button"
									className="b-btn b-btn-ghost"
									disabled={link.pending}
									onClick={async () => {
										const res = await link.call({
											recordingId: r.id,
											sessionId: o.id,
										})
										if (res.ok) {
											addPs({
												weekKey: mondayOf(r.date),
												text: `Opptaket ${DAY_NAME[weekdayOf(r.date)]} koblet til ${o.title ?? 'økta'}.`,
												token: res.value.undo,
												noUndoBecause: res.value.noUndoBecause,
											})
											setOpen(false)
										}
									}}
								>
									Koble til {o.title ?? 'økta'}
								</button>
							))}
						</div>
					) : opts ? (
						<p className="b-small">
							Ingen planlagte økter samme dag og idrett å koble den til.
						</p>
					) : null}
					{r.linkedToPlan ? (
						<button
							type="button"
							className="b-word"
							disabled={unlink.pending}
							onClick={async () => {
								const res = await unlink.call({ recordingId: r.id })
								if (res.ok) {
									addPs({
										weekKey: mondayOf(r.date),
										text: `Opptaket ${DAY_NAME[weekdayOf(r.date)]} står nå for seg selv.`,
										token: res.value.undo,
										noUndoBecause: res.value.noUndoBecause,
									})
									setOpen(false)
								}
							}}
						>
							Løs den fra økta
						</button>
					) : null}
					<ErrorLine message={options.error ?? link.error ?? unlink.error} />
				</div>
			) : null}
			<span hidden>{tz}</span>
		</li>
	)
}
