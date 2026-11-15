import {
	type AthleteOutput,
	type ProposalsOutput,
	type RecordingItem,
	type SessionCard,
	type SessionOutput,
	type TodayOutput,
	type WeekOutput,
} from '#app/lab/engine/reads.types.ts'
import { type LinkOptionsOutput } from '#app/lab/engine/sessions.types.ts'
import {
	type ConnectionsOutput,
	type GoalOutput,
	type ImportStatusOutput,
	type PlanPreviewOutput,
	type SetupState,
	type StartOptionsOutput,
} from '#app/lab/engine/setup.types.ts'

export type Flags = {
	u: string
	hoursSkipped?: boolean
	strengthAnswered?: boolean
	connectSkipped?: boolean
	goalOpen?: boolean
}

export type OnboardingData = {
	mode: 'onboarding'
	athlete: AthleteOutput
	hour: number
	setup: SetupState | null
	setupError: string | null
	connections: ConnectionsOutput | null
	importStatus: ImportStatusOutput | null
	goal: GoalOutput | null
	options: StartOptionsOutput | null
	optionsError: { code: string; message: string } | null
	preview: PlanPreviewOutput | null
	previewError: string | null
	flags: Flags
}

export type RaceEve = {
	name: string
	daysToGo: number
	done: number | null
	planned: number | null
	todaySession: string | null
	/** Seconds per km to open with, and where it came from; null with why. */
	pace: { secPerKm: number; from: string } | null
	paceWhy: string | null
	distanceKm: number | null
}

export type ThreadData = {
	mode: 'thread'
	athlete: AthleteOutput
	hour: number
	today: TodayOutput | null
	todayError: string | null
	todayDetails: SessionOutput[]
	week: WeekOutput | null
	nextWeek: WeekOutput | null
	lastWeek: WeekOutput | null
	proposals: ProposalsOutput | null
	recent: SessionCard[]
	recordings: RecordingItem[]
	linkOptions: Record<string, LinkOptionsOutput>
	importing: boolean
	raceEve: RaceEve | null
}

export type ErrorData = { mode: 'error'; message: string }

export type LayoutData = OnboardingData | ThreadData | ErrorData

/** A session as the flows need it: enough to name it and act on it. */
export type Ref = {
	id: string
	title: string
	date: string
	sport: string | null
	seconds: number | null
	status: string
}
