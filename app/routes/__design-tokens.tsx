/**
 * The token half of the `/design` sheet (ADR 0085): colour roles in both
 * themes, the type scale, radii, elevation, the spacing rhythm and the motion
 * tokens with a demo per curve. Every value is read off the stylesheet's own
 * classes and variables — nothing here restates a colour or a curve, so the
 * sheet cannot drift from `app/styles/tailwind.css`.
 */
import { useState } from 'react'
import { Button } from '#app/components/ui/button.tsx'
import { cn } from '#app/utils/misc.tsx'

export function Section({
	id,
	title,
	lede,
	children,
}: {
	id: string
	title: string
	lede?: string
	children: React.ReactNode
}) {
	return (
		<section id={id} aria-labelledby={`${id}-title`} className="space-y-4">
			<header className="space-y-1">
				<h2 id={`${id}-title`} className="text-title">
					{title}
				</h2>
				{lede ? (
					<p className="text-footnote text-muted-foreground max-w-prose">
						{lede}
					</p>
				) : null}
			</header>
			{children}
		</section>
	)
}

/* ── Colour ──────────────────────────────────────────────────────────────── */

type Swatch = { name: string; token: string; note?: string; ink?: boolean }

const COLOUR_GROUPS: Array<{ title: string; swatches: Swatch[] }> = [
	{
		title: 'Flater (shadcn)',
		swatches: [
			{ name: 'background', token: 'background', note: 'siden, toppen' },
			{ name: 'card', token: 'card', note: 'kort' },
			{ name: 'popover', token: 'popover', note: 'meny, ark' },
			{ name: 'muted', token: 'muted', note: 'brønner, spor' },
		],
	},
	{
		title: 'Tekst (shadcn)',
		swatches: [
			{
				name: 'foreground',
				token: 'foreground',
				ink: true,
				note: 'titler, tall',
			},
			{
				name: 'muted-foreground',
				token: 'muted-foreground',
				ink: true,
				note: 'sekundært',
			},
			{ name: 'primary', token: 'primary', ink: true, note: 'lenker, valgt' },
			{ name: 'destructive', token: 'destructive', ink: true, note: 'feil' },
		],
	},
	{
		title: 'Roller (shadcn)',
		swatches: [
			{ name: 'primary', token: 'primary' },
			{ name: 'secondary', token: 'secondary' },
			{ name: 'accent', token: 'accent' },
			{ name: 'border', token: 'border', note: 'sparsomt' },
			{ name: 'input', token: 'input' },
			{ name: 'ring', token: 'ring', note: 'fokus' },
		],
	},
	{
		title: 'Status (app)',
		swatches: [
			{ name: 'status-on', token: 'status-on', note: 'i rute' },
			{ name: 'status-under', token: 'status-under', note: 'under' },
			{ name: 'status-over', token: 'status-over', note: 'over' },
			{ name: 'status-missed', token: 'status-missed', note: 'ikke gjort' },
		],
	},
	{
		title: 'Treningsspor (app)',
		swatches: [
			{ name: 'track-run', token: 'track-run', note: 'løping' },
			{ name: 'track-bike', token: 'track-bike', note: 'sykling' },
			{ name: 'track-swim', token: 'track-swim', note: 'svømming' },
			{ name: 'track-strength', token: 'track-strength', note: 'styrke' },
		],
	},
	{
		title: 'Treningsspor, tekst (app)',
		swatches: [
			{ name: 'track-run-ink', token: 'track-run-ink', note: 'løping' },
			{ name: 'track-bike-ink', token: 'track-bike-ink', note: 'sykling' },
			{ name: 'track-swim-ink', token: 'track-swim-ink', note: 'svømming' },
			{
				name: 'track-strength-ink',
				token: 'track-strength-ink',
				note: 'styrke',
			},
		],
	},
	{
		title: 'Faser (app)',
		swatches: [
			{ name: 'phase-base', token: 'phase-base', note: 'Grunntrening' },
			{ name: 'phase-build', token: 'phase-build', note: 'Oppbygging' },
			{ name: 'phase-peak', token: 'phase-peak', note: 'Spissing' },
			{ name: 'phase-taper', token: 'phase-taper', note: 'Nedtrapping' },
		],
	},
]

function SwatchChip({ swatch }: { swatch: Swatch }) {
	return (
		<li className="flex min-w-0 items-center gap-3">
			{swatch.ink ? (
				<span
					aria-hidden="true"
					className="bg-card flex size-10 shrink-0 items-center justify-center rounded-3xl text-lg font-semibold shadow-md"
					style={{ color: `var(--${swatch.token})` }}
				>
					Aa
				</span>
			) : (
				<span
					aria-hidden="true"
					className="ring-foreground/10 size-10 shrink-0 rounded-3xl ring-1 ring-inset"
					style={{ background: `var(--${swatch.token})` }}
				/>
			)}
			<span className="min-w-0">
				<span className="text-footnote block truncate font-medium">
					{swatch.name}
				</span>
				{swatch.note ? (
					<span className="text-caption text-muted-foreground block truncate">
						{swatch.note}
					</span>
				) : null}
			</span>
		</li>
	)
}

function ThemePanel({ theme }: { theme: 'light' | 'dark' }) {
	return (
		<div
			// `.light` / `.dark` re-scope every token to that theme, whatever the
			// page's own theme is — so both columns are the real values.
			className={cn(
				theme,
				'bg-background text-foreground space-y-5 rounded-4xl p-4',
			)}
			style={{ colorScheme: theme }}
		>
			<p className="text-overline text-muted-foreground uppercase">
				{theme === 'light' ? 'Lys' : 'Mørk'}
			</p>
			{COLOUR_GROUPS.map((group) => (
				<div key={group.title} className="space-y-2">
					<h3 className="text-caption text-muted-foreground">{group.title}</h3>
					<ul className="grid grid-cols-2 gap-3">
						{group.swatches.map((swatch) => (
							<SwatchChip key={swatch.token} swatch={swatch} />
						))}
					</ul>
				</div>
			))}
		</div>
	)
}

export function ColourSection() {
	return (
		<Section
			id="farger"
			title="Farger"
			lede="Roller, ikke fargenavn. Flater skilles med tone og skygge; hårlinjer bare der to ting deler en flate. Status har alltid ordet ved siden av."
		>
			<div className="ring-foreground/10 grid gap-3 rounded-4xl p-1 ring-1 md:grid-cols-2">
				<ThemePanel theme="light" />
				<ThemePanel theme="dark" />
			</div>
		</Section>
	)
}

/* ── Type ────────────────────────────────────────────────────────────────── */

const TYPE_STEPS = [
	{
		cls: 'text-display',
		spec: '32/38 · 700 · −0,025em',
		sample: 'Halvmaraton om 12 uker',
	},
	{ cls: 'text-title', spec: '24/30 · 650 · −0,02em', sample: 'I dag' },
	{
		cls: 'text-heading',
		spec: '18/24 · 600 · −0,012em',
		sample: 'Uke 41 · Oppbygging',
	},
	{
		cls: 'text-body',
		spec: '16/24 · 400 · −0,004em',
		sample: 'Rolig langtur, hold pulsen nede i bakkene.',
	},
	{
		cls: 'text-callout',
		spec: '15/21 · 500 · −0,004em',
		sample: 'Terskel 4 × 8 min',
	},
	{
		cls: 'text-footnote',
		spec: '13/18 · 400 · +0,002em',
		sample: 'Tirsdag · 1 t 10 min · 12,4 km',
	},
	{
		cls: 'text-caption',
		spec: '12/16 · 500 · +0,01em',
		sample: 'planlagt 46 km',
	},
	{
		cls: 'text-overline uppercase',
		spec: '11/16 · 600 · +0,06em',
		sample: 'Oktober',
	},
] as const

export function TypeSection() {
	return (
		<Section
			id="typografi"
			title="Typografi"
			lede="Public Sans. Hvert trinn er et sett — størrelse, linjehøyde, vekt og sporing sammen. Sporingen strammes når teksten vokser."
		>
			<ul className="bg-card divide-border/60 divide-y rounded-4xl shadow-md">
				{TYPE_STEPS.map((step) => (
					<li
						key={step.cls}
						className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4"
					>
						<span className="text-caption text-muted-foreground w-28 shrink-0 font-mono">
							{step.cls.split(' ')[0]}
						</span>
						<span className={cn(step.cls, 'min-w-0 flex-1')}>
							{step.sample}
						</span>
						<span className="text-caption text-muted-foreground shrink-0 tabular-nums">
							{step.spec}
						</span>
					</li>
				))}
			</ul>
			<div className="bg-card grid gap-4 rounded-4xl p-4 shadow-md sm:grid-cols-2">
				<div className="space-y-1">
					<p className="text-caption text-muted-foreground">
						Proporsjonale tall
					</p>
					<p className="text-heading">
						11,1 km
						<br />
						48,8 km
					</p>
				</div>
				<div className="space-y-1">
					<p className="text-caption text-muted-foreground">
						<code>tabular-nums</code> — tabellsifre
					</p>
					<p className="text-heading tabular-nums">
						11,1 km
						<br />
						48,8 km
					</p>
				</div>
			</div>
		</Section>
	)
}

/* ── Shape, elevation, spacing ───────────────────────────────────────────── */

// shadcn's scale, derived from `--radius` (6px). The luma components use the
// top three; `full` is the pill.
const RADII = [
	{ cls: 'rounded-lg', px: '6', use: 'små merker' },
	{ cls: 'rounded-xl', px: '8', use: 'tooltip' },
	{ cls: 'rounded-2xl', px: '11', use: 'menyvalg' },
	{ cls: 'rounded-3xl', px: '13', use: 'felt, menyer' },
	{ cls: 'rounded-4xl', px: '16', use: 'knapper, kort' },
	{ cls: 'rounded-full', px: '∞', use: 'piller' },
] as const

// Tailwind's shadow scale, as the luma components use it.
const ELEVATION = [
	{ cls: 'shadow-sm', use: 'aktiv fane, segment' },
	{ cls: 'shadow-md', use: 'kort' },
	{ cls: 'shadow-lg', use: 'popover, meny' },
	{ cls: 'shadow-xl', use: 'ark og dialoger' },
] as const

// Tailwind's 4px grid, with the role each step plays (ui-conventions §1.4).
const SPACING = [
	{ cls: 'w-1.5', name: 'gap-1.5', px: '6', use: 'etikett → felt' },
	{ cls: 'w-2', name: 'gap-2', px: '8', use: 'ikon ↔ tekst' },
	{ cls: 'w-4', name: 'p-4', px: '16', use: 'kort, sidekant' },
	{ cls: 'w-8', name: 'space-y-8', px: '32', use: 'mellom seksjoner' },
] as const

export function ShapeSection() {
	return (
		<>
			<Section
				id="radius"
				title="Radius"
				lede="shadcn-skalaen, utledet fra --radius (6 px). Luma-komponentene bruker de tre øverste."
			>
				<ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
					{RADII.map((r) => (
						<li key={r.cls} className="space-y-2">
							<div
								className={cn(
									r.cls,
									'bg-primary/10 border-primary/40 h-16 border',
								)}
							/>
							<p className="text-caption">
								<span className="font-mono">{r.cls}</span>{' '}
								<span className="text-muted-foreground tabular-nums">
									{r.px}
								</span>
							</p>
							<p className="text-caption text-muted-foreground">{r.use}</p>
						</li>
					))}
				</ul>
			</Section>
			<Section
				id="hoyde"
				title="Høyde"
				lede="Tailwinds skyggeskala, slik luma-komponentene bruker den. Flater skilles med tone først."
			>
				<ul className="bg-muted grid gap-4 rounded-4xl p-4 sm:grid-cols-4">
					{ELEVATION.map((e) => (
						<li
							key={e.cls}
							className={cn(e.cls, 'bg-card space-y-1 rounded-4xl p-4')}
						>
							<p className="text-callout font-mono">{e.cls}</p>
							<p className="text-caption text-muted-foreground">{e.use}</p>
						</li>
					))}
				</ul>
			</Section>
			<Section
				id="avstand"
				title="Avstand"
				lede="Tailwinds 4px-rutenett; hvert trinn har én rolle."
			>
				<ul className="bg-card space-y-3 rounded-4xl p-4 shadow-md">
					{SPACING.map((s) => (
						<li key={s.name} className="flex items-center gap-3">
							<span className="text-caption w-24 shrink-0 font-mono">
								{s.name}
							</span>
							<span
								className={cn(s.cls, 'bg-primary h-3 shrink-0 rounded-sm')}
							/>
							<span className="text-caption text-muted-foreground tabular-nums">
								{s.px} px · {s.use}
							</span>
						</li>
					))}
				</ul>
			</Section>
		</>
	)
}

/* ── Motion ──────────────────────────────────────────────────────────────── */

const CURVES = [
	{
		token: '--ease-out',
		value: 'cubic-bezier(0.23, 1, 0.32, 1)',
		use: 'inn og ut: popover, meny, trykk',
		duration: '--transition-duration-dropdown',
	},
	{
		token: '--ease-in-out',
		value: 'cubic-bezier(0.77, 0, 0.175, 1)',
		use: 'noe som flytter seg på skjermen',
		duration: '--transition-duration-modal',
	},
	{
		token: '--ease-drawer',
		value: 'cubic-bezier(0.32, 0.72, 0, 1)',
		use: 'arket som glir opp',
		duration: '--transition-duration-drawer',
	},
] as const

const DURATIONS = [
	['press', '160'],
	['tooltip', '150 / 100'],
	['dropdown', '200 / 150'],
	['collapse', '200 / 150'],
	['modal', '250 / 200'],
	['drawer', '450 / ≤400'],
] as const

function CurveDemo({ curve }: { curve: (typeof CURVES)[number] }) {
	const [moved, setMoved] = useState(false)
	return (
		<li className="bg-card space-y-3 rounded-4xl p-4 shadow-md">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-callout font-mono">{curve.token}</p>
					<p className="text-caption text-muted-foreground">{curve.use}</p>
				</div>
				<Button
					size="sm"
					variant="secondary"
					onClick={() => setMoved((m) => !m)}
					aria-pressed={moved}
				>
					Spill av
				</Button>
			</div>
			<div className="bg-muted h-8 overflow-hidden rounded-full p-1">
				{/*
					The demo practises what it shows: the dot travels on
					`transform`, never `left`, on the token's own curve and
					duration. Reduced motion jumps.
				*/}
				<div
					className="flex h-full w-full justify-end [transition:transform_var(--demo-duration)_var(--demo-ease)] motion-reduce:transition-none"
					style={
						{
							transform: moved
								? 'translateX(0)'
								: 'translateX(calc(-100% + 1.5rem))',
							'--demo-duration': `var(${curve.duration})`,
							'--demo-ease': `var(${curve.token})`,
						} as React.CSSProperties
					}
				>
					<span className="bg-primary block size-6 rounded-full" />
				</div>
			</div>
			<p className="text-caption text-muted-foreground font-mono break-all">
				{curve.value}
			</p>
		</li>
	)
}

export function MotionSection() {
	return (
		<Section
			id="bevegelse"
			title="Bevegelse"
			lede="Tre kurver, aldri ease-in. Ut går raskere enn inn. Redusert bevegelse beholder tonen og fjerner flyttingen."
		>
			<ul className="grid gap-4 md:grid-cols-3">
				{CURVES.map((curve) => (
					<CurveDemo key={curve.token} curve={curve} />
				))}
			</ul>
			<div className="bg-card grid gap-4 rounded-4xl p-4 shadow-md sm:grid-cols-[1fr_auto]">
				<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
					{DURATIONS.map(([name, ms]) => (
						<div key={name} className="contents">
							<dt className="text-footnote font-mono">duration-{name}</dt>
							<dd className="text-footnote text-muted-foreground tabular-nums">
								{ms} ms
							</dd>
						</div>
					))}
				</dl>
				<div className="flex flex-col items-start gap-2">
					<p className="text-caption text-muted-foreground">
						Trykk: <code>scale(0.97)</code>, 160 ms
					</p>
					<Button>Hold inne</Button>
				</div>
			</div>
		</Section>
	)
}
