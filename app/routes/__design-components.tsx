/**
 * The component half of the `/design` sheet (ADR 0085): every primitive in
 * `app/components/ui`, live, in its states. One block per component — what
 * it is for in a line, then the states side by side — the shape coss's and
 * shadcn's docs use, minus the code tabs (the source is one click away).
 *
 * Specimen copy only: these strings show the components, they are not the
 * product's wording, which lives in `app/utils/labels.ts`.
 */
import { useState } from 'react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogContent,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '#app/components/ui/alert-dialog.tsx'
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from '#app/components/ui/alert.tsx'
import { Badge } from '#app/components/ui/badge.tsx'
import { Button } from '#app/components/ui/button.tsx'
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '#app/components/ui/card.tsx'
import { Checkbox } from '#app/components/ui/checkbox.tsx'
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '#app/components/ui/collapsible.tsx'
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from '#app/components/ui/drawer.tsx'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '#app/components/ui/dropdown-menu.tsx'
import {
	Field,
	FieldDescription,
	FieldLabel,
} from '#app/components/ui/field.tsx'
import { Icon } from '#app/components/ui/icon.tsx'
import { Input } from '#app/components/ui/input.tsx'
import {
	Meter,
	MeterIndicator,
	MeterLabel,
	MeterTrack,
	MeterValue,
	type MeterTone,
} from '#app/components/ui/meter.tsx'
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
} from '#app/components/ui/popover.tsx'
import {
	Progress,
	ProgressLabel,
	ProgressValue,
} from '#app/components/ui/progress.tsx'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '#app/components/ui/select.tsx'
import { Separator } from '#app/components/ui/separator.tsx'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '#app/components/ui/table.tsx'
import {
	Tabs,
	TabsList,
	TabsContent,
	TabsTrigger,
} from '#app/components/ui/tabs.tsx'
import { Textarea } from '#app/components/ui/textarea.tsx'
import {
	SegmentedControl,
	ToggleGroup,
	ToggleGroupItem,
} from '#app/components/ui/toggle-group.tsx'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '#app/components/ui/tooltip.tsx'
import { Section } from './__design-tokens.tsx'

function Specimen({
	name,
	file,
	use,
	children,
}: {
	name: string
	file: string
	use: string
	children: React.ReactNode
}) {
	return (
		<article
			aria-label={name}
			className="bg-card min-w-0 space-y-4 rounded-4xl p-4 shadow-md"
		>
			<header className="flex flex-wrap items-baseline justify-between gap-x-3">
				<h3 className="text-heading">{name}</h3>
				<code className="text-caption text-muted-foreground">ui/{file}</code>
				<p className="text-footnote text-muted-foreground w-full">{use}</p>
			</header>
			{children}
		</article>
	)
}

function StateRow({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="space-y-2">
			<p className="text-overline text-muted-foreground uppercase">{label}</p>
			<div className="flex flex-wrap items-center gap-3">{children}</div>
		</div>
	)
}

// Base UI labels the closed trigger from `items`; without it the trigger
// shows the raw value (`SelectField` passes it for the same reason).
const TRACKS = [
	{ value: 'run', label: 'Løping' },
	{ value: 'bike', label: 'Sykling' },
	{ value: 'swim', label: 'Svømming' },
	{ value: 'strength', label: 'Styrke' },
]

const BUTTON_VARIANTS = [
	'default',
	'secondary',
	'outline',
	'ghost',
	'destructive',
	'link',
] as const

const METERS: Array<{ tone: MeterTone; label: string; value: number }> = [
	{ tone: 'on', label: 'i rute', value: 44 },
	{ tone: 'under', label: 'under', value: 31 },
	{ tone: 'over', label: 'over', value: 46 },
	{ tone: 'missed', label: 'ikke gjort', value: 6 },
]

export function ComponentsSection() {
	const [view, setView] = useState<'uke' | 'sesong' | 'aar'>('uke')
	const [unit, setUnit] = useState<'km' | 'tid'>('km')
	return (
		<Section
			id="komponenter"
			title="Komponenter"
			lede="Alt i app/components/ui, levende. Trykk, åpne og lukk: bevegelsen er en del av komponenten."
		>
			<TooltipProvider>
				<div className="grid gap-4 lg:grid-cols-2">
					<Specimen
						name="Button"
						file="button.tsx"
						use="Én primærhandling per skjerm. 44 px høy; mindre størrelser får et usynlig trykkområde."
					>
						<StateRow label="Varianter">
							{BUTTON_VARIANTS.map((variant) => (
								<Button key={variant} variant={variant}>
									{variant}
								</Button>
							))}
						</StateRow>
						<StateRow label="Størrelser og form">
							<Button size="lg">lg</Button>
							<Button size="sm">sm</Button>
							<Button size="xs">xs</Button>
							<Button size="icon" variant="outline" aria-label="Legg til">
								<Icon name="plus" />
							</Button>
							<Button variant="secondary" className="rounded-full">
								I dag
							</Button>
						</StateRow>
						<StateRow label="Tilstander">
							<Button disabled>Deaktivert</Button>
							<Button variant="outline" aria-invalid>
								Ugyldig
							</Button>
							<Button>
								<Icon name="check" data-icon="inline-start" />
								Med ikon
							</Button>
						</StateRow>
					</Specimen>

					<Specimen
						name="Badge"
						file="badge.tsx"
						use="En kort merkelapp. Helt rund, tabellsifre."
					>
						<StateRow label="Varianter">
							<Badge>Ny</Badge>
							<Badge variant="secondary">12 uker</Badge>
							<Badge variant="outline">Oppbygging</Badge>
							<Badge variant="destructive">Ikke gjort</Badge>
						</StateRow>
					</Specimen>

					<Specimen
						name="Input, Textarea, Field"
						file="input.tsx · textarea.tsx · field.tsx"
						use="16 px på berøringsskjerm, så iOS aldri zoomer inn."
					>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="ds-distance">Distanse</FieldLabel>
								<Input
									id="ds-distance"
									inputMode="decimal"
									placeholder="12,4"
								/>
								<FieldDescription>I kilometer.</FieldDescription>
							</Field>
							<Field data-invalid="true">
								<FieldLabel htmlFor="ds-invalid">Ugyldig</FieldLabel>
								<Input id="ds-invalid" aria-invalid defaultValue="abc" />
							</Field>
							<Field data-disabled="true">
								<FieldLabel htmlFor="ds-disabled">Deaktivert</FieldLabel>
								<Input id="ds-disabled" disabled defaultValue="1 t 10 min" />
							</Field>
							<Field>
								<FieldLabel htmlFor="ds-note">Notat</FieldLabel>
								<Textarea id="ds-note" placeholder="Hvordan gikk det?" />
							</Field>
						</div>
					</Specimen>

					<Specimen
						name="Select, Checkbox"
						file="select.tsx · checkbox.tsx"
						use="Lista kommer ut av feltet; over feltet tones den bare inn."
					>
						<StateRow label="Select">
							<Select defaultValue="run" items={TRACKS}>
								<SelectTrigger aria-label="Spor" className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent alignItemWithTrigger={false}>
									<SelectItem value="run">Løping</SelectItem>
									<SelectItem value="bike">Sykling</SelectItem>
									<SelectItem value="swim">Svømming</SelectItem>
									<SelectItem value="strength">Styrke</SelectItem>
								</SelectContent>
							</Select>
							<Select defaultValue="run" items={TRACKS} disabled>
								<SelectTrigger aria-label="Spor, deaktivert" className="w-44">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="run">Løping</SelectItem>
								</SelectContent>
							</Select>
						</StateRow>
						<StateRow label="Checkbox">
							<label className="text-callout flex items-center gap-2">
								<Checkbox /> Av
							</label>
							<label className="text-callout flex items-center gap-2">
								<Checkbox defaultChecked /> På
							</label>
							<label className="text-callout text-muted-foreground flex items-center gap-2">
								<Checkbox disabled /> Deaktivert
							</label>
						</StateRow>
					</Specimen>

					<Specimen
						name="SegmentedControl, ToggleGroup"
						file="toggle-group.tsx"
						use="Segmentert: én av noen få visninger, alltid én valgt. Outline: uavhengige filtre."
					>
						<StateRow label="Segmentert">
							<SegmentedControl
								value={view}
								onValueChange={setView}
								aria-label="Visning"
							>
								<ToggleGroupItem value="uke">Uke</ToggleGroupItem>
								<ToggleGroupItem value="sesong">Sesong</ToggleGroupItem>
								<ToggleGroupItem value="aar">År</ToggleGroupItem>
							</SegmentedControl>
							<SegmentedControl
								value={unit}
								onValueChange={setUnit}
								aria-label="Enhet"
							>
								<ToggleGroupItem value="km">km</ToggleGroupItem>
								<ToggleGroupItem value="tid">tid</ToggleGroupItem>
							</SegmentedControl>
						</StateRow>
						<StateRow label="Outline, flervalg">
							<ToggleGroup
								variant="outline"
								multiple
								defaultValue={['run']}
								aria-label="Spor"
							>
								<ToggleGroupItem value="run">Løping</ToggleGroupItem>
								<ToggleGroupItem value="bike">Sykling</ToggleGroupItem>
								<ToggleGroupItem value="strength" disabled>
									Styrke
								</ToggleGroupItem>
							</ToggleGroup>
						</StateRow>
					</Specimen>

					<Specimen
						name="Tabs"
						file="tabs.tsx"
						use="Paneler på samme sted. Den aktive fanen er løftet ut av sporet."
					>
						<Tabs defaultValue="plan">
							<TabsList>
								<TabsTrigger value="plan">Plan</TabsTrigger>
								<TabsTrigger value="gjort">Gjort</TabsTrigger>
								<TabsTrigger value="notat">Notat</TabsTrigger>
							</TabsList>
							<TabsContent
								value="plan"
								className="text-footnote text-muted-foreground"
							>
								Planlagt: 46 km over 5 økter.
							</TabsContent>
							<TabsContent
								value="gjort"
								className="text-footnote text-muted-foreground"
							>
								Gjort: 34 km.
							</TabsContent>
							<TabsContent
								value="notat"
								className="text-footnote text-muted-foreground"
							>
								Ingen notater.
							</TabsContent>
						</Tabs>
					</Specimen>

					<Specimen
						name="Meter"
						file="meter.tsx"
						use="En målt verdi mot et mål. Fargen følger status, ordet står ved siden av."
					>
						<div className="space-y-4">
							{METERS.map((m) => (
								<Meter
									key={m.label}
									value={m.value}
									max={46}
									tone={m.tone}
									aria-label={m.label}
								>
									<MeterLabel>{m.label}</MeterLabel>
									<MeterValue>{() => `${m.value} av 46 km`}</MeterValue>
									<MeterTrack>
										<MeterIndicator tone={m.tone} />
									</MeterTrack>
								</Meter>
							))}
						</div>
					</Specimen>

					<Specimen
						name="Progress"
						file="progress.tsx"
						use="En oppgave som blir ferdig. Stolpen glir ikke: den viser hvor oppgaven er."
					>
						<div className="space-y-4">
							<Progress value={62}>
								<ProgressLabel>Importerer økter</ProgressLabel>
								<ProgressValue />
							</Progress>
							<Progress value={18}>
								<ProgressLabel>Synkroniserer</ProgressLabel>
								<ProgressValue />
							</Progress>
						</div>
					</Specimen>

					<Specimen
						name="Collapsible"
						file="collapsible.tsx"
						use="En brettet seksjon. Høyden er den ene layout-egenskapen som animeres."
					>
						<Collapsible className="bg-muted rounded-3xl px-3">
							<CollapsibleTrigger className="group/trigger flex min-h-11 w-full items-center gap-2 text-left">
								<span className="text-callout">Uke 38</span>
								<span className="text-footnote text-muted-foreground tabular-nums">
									42,0 km · i rute
								</span>
								<Icon
									name="chevron-down"
									aria-hidden="true"
									className="text-muted-foreground ml-auto size-4 group-data-panel-open/trigger:rotate-180"
								/>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<ul className="text-footnote text-foreground space-y-1 pb-3">
									<li>Man · Rolig 8 km</li>
									<li>Ons · Terskel 4 × 8 min</li>
									<li>Lør · Langtur 18 km</li>
								</ul>
							</CollapsibleContent>
						</Collapsible>
					</Specimen>

					<Specimen
						name="Tooltip, Popover, DropdownMenu"
						file="tooltip.tsx · popover.tsx · dropdown-menu.tsx"
						use="Skalerer ut fra utløseren. Neste tooltip åpnes straks, uten animasjon."
					>
						<StateRow label="Utløsere">
							<Tooltip>
								<TooltipTrigger
									render={
										<Button variant="outline" size="icon" aria-label="Låst" />
									}
								>
									<Icon name="lock-closed" />
								</TooltipTrigger>
								<TooltipContent>Du eier denne økta</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button variant="outline" size="icon" aria-label="Info" />
									}
								>
									<Icon name="info-circle" />
								</TooltipTrigger>
								<TooltipContent>Hensikt, ikke en måling</TooltipContent>
							</Tooltip>
							<Popover>
								<PopoverTrigger render={<Button variant="outline" />}>
									Popover
								</PopoverTrigger>
								<PopoverContent>
									<PopoverHeader>
										<PopoverTitle>Låst økt</PopoverTitle>
										<PopoverDescription>
											Gi økta tilbake til appen, så den kan justere den igjen.
										</PopoverDescription>
									</PopoverHeader>
									<Button size="sm" variant="secondary">
										Lås opp
									</Button>
								</PopoverContent>
							</Popover>
							<DropdownMenu>
								<DropdownMenuTrigger render={<Button variant="outline" />}>
									Meny
									<Icon name="chevron-down" data-icon="inline-end" />
								</DropdownMenuTrigger>
								<DropdownMenuContent>
									<DropdownMenuGroup>
										<DropdownMenuLabel>Økta</DropdownMenuLabel>
										<DropdownMenuItem>
											<Icon name="pencil-1" /> Endre
										</DropdownMenuItem>
										<DropdownMenuItem>
											<Icon name="calendar" /> Flytt
										</DropdownMenuItem>
									</DropdownMenuGroup>
									<DropdownMenuSeparator />
									<DropdownMenuItem variant="destructive">
										<Icon name="trash" /> Slett
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</StateRow>
					</Specimen>

					<Specimen
						name="Drawer, AlertDialog"
						file="drawer.tsx · alert-dialog.tsx"
						use="Arket glir opp på drawer-kurven og kan dras ned; et raskt kast holder. Dialogen står i midten."
					>
						<StateRow label="Åpne">
							<Drawer showSwipeHandle>
								<DrawerTrigger render={<Button />}>Se økta</DrawerTrigger>
								<DrawerContent>
									<DrawerHeader>
										<DrawerTitle>Terskel 4 × 8 min</DrawerTitle>
										<DrawerDescription>
											Tirsdag · 1 t 10 min · 12,4 km
										</DrawerDescription>
									</DrawerHeader>
									<div className="overflow-y-auto overscroll-contain px-4 py-4">
										<ol className="text-body text-foreground space-y-3">
											<li>15 min rolig oppvarming</li>
											<li>4 × 8 min på terskel, 2 min rolig mellom</li>
											<li>10 min rolig nedjogg</li>
										</ol>
									</div>
									<DrawerFooter>
										<DrawerClose
											render={<Button className="w-full sm:w-auto" />}
										>
											Ferdig
										</DrawerClose>
									</DrawerFooter>
								</DrawerContent>
							</Drawer>
							<AlertDialog>
								<AlertDialogTrigger render={<Button variant="destructive" />}>
									Slett økt
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Slette økta?</AlertDialogTitle>
										<AlertDialogDescription>
											Terskel 4 × 8 min forsvinner fra planen.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>Avbryt</AlertDialogCancel>
										<AlertDialogAction variant="destructive">
											Slett
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</StateRow>
					</Specimen>

					<Specimen
						name="Card, Alert, Separator"
						file="card.tsx · alert.tsx · separator.tsx"
						use="Kort skilles med tone og skygge, ikke strek."
					>
						<Card size="sm" className="bg-background shadow-none">
							<CardHeader>
								<CardTitle>Uke 41</CardTitle>
								<CardDescription>Oppbygging · hard uke</CardDescription>
							</CardHeader>
							<CardContent className="text-footnote text-foreground tabular-nums">
								34,0 av 46,0 km
							</CardContent>
						</Card>
						<Alert>
							<Icon name="info-circle" />
							<AlertTitle>Planen er åpen</AlertTitle>
							<AlertDescription>Blokk 3 av ∞.</AlertDescription>
						</Alert>
						<Alert variant="destructive">
							<Icon name="alert-triangle" />
							<AlertTitle>Fikk ikke lagret</AlertTitle>
							<AlertDescription>Prøv igjen om litt.</AlertDescription>
						</Alert>
						<Separator />
					</Specimen>

					<Specimen
						name="Table"
						file="table.tsx"
						use="Tall i kolonner står med tabellsifre."
					>
						<Table className="figures">
							<TableHeader>
								<TableRow>
									<TableHead>Uke</TableHead>
									<TableHead className="text-right">Plan</TableHead>
									<TableHead className="text-right">Gjort</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell>39</TableCell>
									<TableCell className="text-right">41,0</TableCell>
									<TableCell className="text-right">43,2</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>40</TableCell>
									<TableCell className="text-right">44,0</TableCell>
									<TableCell className="text-right">38,9</TableCell>
								</TableRow>
								<TableRow>
									<TableCell>41</TableCell>
									<TableCell className="text-right">46,0</TableCell>
									<TableCell className="text-right">11,1</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</Specimen>
				</div>
			</TooltipProvider>
		</Section>
	)
}
