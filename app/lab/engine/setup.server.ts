import { z } from 'zod/v4'
import { deleteAccount } from '#app/utils/account-deletion.server.ts'
import { localDate } from '#app/utils/athlete-calendar.ts'
import { recipeBelongsToDiscipline } from '#app/utils/athlete-schema.ts'
import {
	ensureAthleteProfile,
	setDisciplineThresholds,
	updateAthleteProfile,
} from '#app/utils/athlete.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { readFirstRunFindings } from '#app/utils/first-run/findings.server.ts'
import { startPrefill } from '#app/utils/first-run/first-run.ts'
import {
	HomePlaceInputSchema,
	removeHomePlace,
	setHomePlace,
} from '#app/utils/home-place.server.ts'
import { nbPlannedDisciplineLabel } from '#app/utils/labels.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import {
	PLACE_SEARCH_MAX_LENGTH,
	searchPlaces,
} from '#app/utils/place-search/search.server.ts'
import { dropUnavailablePinnedDays } from '#app/utils/plan-outline/pinned-days.server.ts'
import { findActiveOutline } from '#app/utils/training.server.ts'
import { exportUserData } from '#app/utils/user-data-export.server.ts'
import { getRecipe } from '#app/utils/zones/index.ts'
import {
	type Capability,
	type CapabilityCtx,
	defineCapability,
	fail,
	ok,
} from './define.ts'
import {
	weekdayOfPattern,
	calendarOfWeekdays,
	otherWeekdays,
	parseClock,
} from './setup/common.ts'
import {
	CONNECT_REFUSALS,
	disconnect,
	linkIntervalsIcu,
	readRecordings,
	readSource,
	readSources,
	syncSources,
	uploadFiles,
} from './setup/connections.server.ts'
import {
	applyGoalUndo,
	ATTACH_REFUSAL_MESSAGES,
	attachGoal,
	cancelEvent,
	createGoal,
	deleteEvent,
	fieldsOf,
	findGoal,
	type GoalFields,
	goalOf,
	goalUndoToken,
	readGoal,
	readGoalUndo,
	updateGoalFields,
} from './setup/goal.server.ts'
import {
	createPlanFrom,
	pickOption,
	planPreviewOf,
	readSetupState,
	resolveStart,
	startOptionsOf,
} from './setup/onboarding.server.ts'
import { readThresholds, SPORT_FIELDS } from './setup/settings.server.ts'
import {
	type AcceptPlanOutput,
	type ApplyGoalToPlanOutput,
	type ConnectionsOutput,
	type ConnectOutput,
	type DeleteAccountOutput,
	type DisconnectOutput,
	EXPERIENCE_LEVELS,
	type ExportDataOutput,
	type GoalOutput,
	type GoalWriteOutput,
	type ImportStatusOutput,
	OTHER_ACTIVITIES,
	type PlanPreviewOutput,
	type PlanStyle,
	type RemoveGoalOutput,
	type SearchPlacesOutput,
	SESSION_PREFERENCES,
	type SetAvailabilityOutput,
	type SetThresholdsOutput,
	type SetupState,
	SPORTS,
	type StartOptionsOutput,
	type SyncOutput,
	type ThresholdsOutput,
	type UploadOutput,
	WEEKDAYS,
} from './setup.types.ts'

// ── Input schemas ────────────────────────────────────────────────────────────

const Sport = z
	.enum(SPORTS as [string, ...string[]])
	.transform((value) => value as (typeof SPORTS)[number])
const Weekday = z
	.enum(WEEKDAYS as [string, ...string[]])
	.transform((value) => value as (typeof WEEKDAYS)[number])
const Weekdays = z
	.array(Weekday)
	.transform((days) => WEEKDAYS.filter((day) => days.includes(day)))
const PlanStyleSchema = z.enum([
	'polarized',
	'threshold',
	'classic',
	'big-base',
])
const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Preferences = z
	.array(z.enum(SESSION_PREFERENCES as [string, ...string[]]))
	.transform((picked) =>
		SESSION_PREFERENCES.filter((preference) => picked.includes(preference)),
	)
const TargetTime = z.union([
	z.string().min(1).max(12),
	z.number().int().positive(),
])
const GoalName = z.string().trim().min(1).max(120)
const DistanceKm = z.number().positive().max(1000)

const empty = z.object({}).default({})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function setupOf(ctx: CapabilityCtx): Promise<SetupState> {
	return readSetupState(ctx.userId, ctx.now)
}

function isTimezone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en', { timeZone: value })
		return true
	} catch {
		return false
	}
}

// ── Getting started ──────────────────────────────────────────────────────────

const get_setup = defineCapability({
	name: 'get_setup',
	kind: 'read',
	description:
		'Hva utøveren har svart om seg selv, hva som mangler før planer kan vises, og hva historikken og nivået foreslår.',
	input: empty,
	run: async (ctx) => ok(await setupOf(ctx)),
})

const set_sports = defineCapability({
	name: 'set_sports',
	kind: 'write',
	description:
		'Hvilke idretter utøveren trener (den første er hovedidretten), og andre aktiviteter som langrenn eller fjellturer.',
	input: z.object({
		sports: z.array(Sport).max(3),
		mainSport: Sport.optional(),
		otherActivities: z
			.array(z.enum(OTHER_ACTIVITIES as [string, ...string[]]))
			.optional(),
	}),
	run: async (ctx, input) => {
		const sports = [...new Set(input.sports)]
		if (input.mainSport) {
			if (!sports.includes(input.mainSport)) {
				return fail('invalid-input', 'Hovedidretten må være en av idrettene.')
			}
			sports.splice(sports.indexOf(input.mainSport), 1)
			sports.unshift(input.mainSport)
		}
		const activities = input.otherActivities
			? [...new Set(input.otherActivities)]
			: undefined
		if (sports.length === 0 && (activities ?? []).length === 0) {
			return fail('invalid-input', 'Velg minst én idrett eller aktivitet.')
		}
		await ensureAthleteProfile(ctx.userId)
		await prisma.athleteProfile.update({
			where: { userId: ctx.userId },
			data: {
				sports: JSON.stringify(sports),
				...(activities ? { simpleActivities: JSON.stringify(activities) } : {}),
			},
		})
		return ok(await setupOf(ctx))
	},
})

const set_experience_level = defineCapability({
	name: 'set_experience_level',
	kind: 'write',
	description:
		'Hvor erfaren utøveren er. Nivået velger hvilke måter å trene på som tilbys og foreslår timer og dager.',
	input: z.object({
		level: z.enum(EXPERIENCE_LEVELS as [string, ...string[]]),
	}),
	run: async (ctx, input) => {
		await updateAthleteProfile(ctx.userId, {
			trainingLevel: input.level as (typeof EXPERIENCE_LEVELS)[number],
		})
		return ok(await setupOf(ctx))
	},
})

const set_current_volume = defineCapability({
	name: 'set_current_volume',
	kind: 'write',
	description:
		'Hvor mange timer i uka utøveren trener nå (1–20, i halvtimer). Planen starter der og bygger seg opp.',
	input: z.object({ hoursPerWeek: z.number() }),
	run: async (ctx, input) => {
		const hours = input.hoursPerWeek
		if (hours < 1 || hours > 20 || !Number.isInteger(hours * 2)) {
			return fail(
				'invalid-input',
				'Oppgi mellom 1 og 20 timer i uka, i hele eller halve timer.',
			)
		}
		await ensureAthleteProfile(ctx.userId)
		await prisma.athleteProfile.update({
			where: { userId: ctx.userId },
			data: { currentWeeklyHours: hours },
		})
		return ok(await setupOf(ctx))
	},
})

const set_availability = defineCapability({
	name: 'set_availability',
	kind: 'write',
	description:
		'Hvilke dager utøveren kan trene (eller hvilke som ikke går), og hvor mange timer i uka hen har plass til. Fjerner en dag fra planens faste dager der planen hadde lagt noe.',
	input: z.object({
		days: Weekdays.optional(),
		blockedDays: Weekdays.optional(),
		hoursPerWeek: z.number().positive().max(168).nullable().optional(),
	}),
	run: async (ctx, input) => {
		if (input.days && input.blockedDays) {
			return fail(
				'invalid-input',
				'Send enten dagene som går, eller dagene som ikke går.',
			)
		}
		const days =
			input.days ??
			(input.blockedDays ? otherWeekdays(input.blockedDays) : undefined)
		if (days && days.length === 0) {
			return fail('invalid-input', 'Velg minst én dag du kan trene.')
		}
		if (!days && input.hoursPerWeek === undefined) {
			return fail('invalid-input', 'Send dager eller timer.')
		}
		await updateAthleteProfile(ctx.userId, {
			...(days ? { trainableWeekdays: calendarOfWeekdays(days) } : {}),
			...(input.hoursPerWeek !== undefined
				? { weeklyCapacityHours: input.hoursPerWeek }
				: {}),
		})
		const dropped = days
			? await dropUnavailablePinnedDays(ctx.userId, ctx.now)
			: []
		const planEffect = dropped.map((entry) => ({
			what: entry.title ?? nbPlannedDisciplineLabel(entry.discipline),
			lostDays: entry.lost.map(weekdayOfPattern),
			keptDays: entry.kept ? entry.kept.map(weekdayOfPattern) : null,
		}))
		const hasPlan = Boolean(await findActiveOutline(ctx.userId, ctx.now))
		return ok<SetAvailabilityOutput>({
			setup: await setupOf(ctx),
			planEffect,
			note: !hasPlan
				? 'Lagret. Planen lages ut fra dette.'
				: planEffect.length > 0
					? 'Lagret. Planen bruker ikke lenger dagene du tok bort. Uker som alt er lagt, ligger som før til de legges på nytt.'
					: 'Lagret. Planen bruker dette fra neste uke som legges.',
		})
	},
})

const set_strength = defineCapability({
	name: 'set_strength',
	kind: 'write',
	description:
		'Om og hvor ofte utøveren vil løfte: 0 (ingen styrke), 1, 2 eller 3 styrkeøkter i uka.',
	input: z.object({ perWeek: z.number().int().min(0).max(3) }),
	run: async (ctx, input) => {
		await ensureAthleteProfile(ctx.userId)
		await prisma.athleteProfile.update({
			where: { userId: ctx.userId },
			data: { strengthPerWeek: input.perWeek === 0 ? null : input.perWeek },
		})
		return ok(await setupOf(ctx))
	},
})

const set_session_preferences = defineCapability({
	name: 'set_session_preferences',
	kind: 'write',
	description:
		'Hva slags økter utøveren liker (flere eller ingen). Rangerer måtene å trene på; «short» holder hverdagsøktene korte.',
	input: z.object({ preferences: Preferences }),
	run: async (ctx, input) => {
		await updateAthleteProfile(ctx.userId, {
			sessionPreferences: input.preferences,
		})
		return ok(await setupOf(ctx))
	},
})

const set_timezone = defineCapability({
	name: 'set_timezone',
	kind: 'write',
	description:
		'Utøverens tidssone (IANA, f.eks. Europe/Oslo). Dager og uker regnes i den.',
	input: z.object({ timezone: z.string().min(1).max(100) }),
	run: async (ctx, input) => {
		if (!isTimezone(input.timezone)) {
			return fail('invalid-input', 'Ukjent tidssone.')
		}
		await updateAthleteProfile(ctx.userId, { timezone: input.timezone })
		return ok(await setupOf(ctx))
	},
})

const search_places = defineCapability({
	name: 'search_places',
	kind: 'read',
	description:
		'Søk etter et sted i Norge (Kartverkets stedsnavn), for å velge hjemsted. Bruk POST, så søketeksten ikke havner i en adresse.',
	input: z.object({ text: z.string().max(200) }),
	run: async (_ctx, input) => {
		const text = input.text.trim().slice(0, PLACE_SEARCH_MAX_LENGTH)
		if (!text) return ok<SearchPlacesOutput>({ status: 'found', places: [] })
		const result = await searchPlaces(text)
		return ok<SearchPlacesOutput>(
			result.status === 'found'
				? result
				: { status: 'unavailable', why: 'Stedssøket svarer ikke akkurat nå.' },
		)
	},
})

const set_home_place = defineCapability({
	name: 'set_home_place',
	kind: 'write',
	description:
		'Velg hjemsted (et treff fra search_places, sendt tilbake som det er). Brukes bare til været.',
	input: HomePlaceInputSchema,
	run: async (ctx, input) => {
		const saved = await setHomePlace(ctx.userId, input)
		if (!saved.ok) {
			return fail(
				'outside-area',
				'Det stedet er utenfor området vi har vær for.',
			)
		}
		return ok(await setupOf(ctx))
	},
})

const remove_home_place = defineCapability({
	name: 'remove_home_place',
	kind: 'write',
	description: 'Fjern hjemstedet. Uten hjemsted vises ikke vær.',
	input: empty,
	run: async (ctx) => {
		await removeHomePlace(ctx.userId)
		return ok(await setupOf(ctx))
	},
})

// ── The plan before it exists ────────────────────────────────────────────────

const start_options = defineCapability({
	name: 'start_options',
	kind: 'read',
	description:
		'Måtene utøveren kan trene på ut fra svarene, hver med en ekte første uke dag for dag, rangert. Før en plan finnes.',
	input: empty,
	run: async (ctx) => {
		const resolved = await resolveStart(ctx.userId, ctx.now)
		if (!resolved.ok) {
			return fail(resolved.refusal.code, resolved.refusal.message)
		}
		return ok<StartOptionsOutput>(startOptionsOf(resolved.value))
	},
})

async function goalTargetOf(ctx: CapabilityCtx) {
	const found = await findGoal(ctx.userId, ctx.now, ctx.timezone)
	if (!found || found.planRunsTowardIt) return null
	const date = localDate(found.event.startDate, 'UTC')
	const monday = new Date(`${date}T00:00:00Z`)
	const offset = (monday.getUTCDay() + 6) % 7
	monday.setUTCDate(monday.getUTCDate() - offset)
	return {
		name: found.event.name,
		dayKey: date,
		weekKey: monday.toISOString().slice(0, 10),
	}
}

const plan_preview = defineCapability({
	name: 'plan_preview',
	kind: 'read',
	description:
		'Planen én måte å trene på gir, før utøveren sier ja: de første ukene dag for dag, blokka uke for uke, og hvordan den går mot målet hvis et mål er satt.',
	input: z.object({ style: PlanStyleSchema.optional() }).default({}),
	run: async (ctx, input) => {
		const resolved = await resolveStart(ctx.userId, ctx.now)
		if (!resolved.ok) {
			return fail(resolved.refusal.code, resolved.refusal.message)
		}
		const option = pickOption(resolved.value, input.style)
		if (!option) {
			return fail(
				'style-unavailable',
				'Den måten å trene på finnes ikke for disse svarene. Velg en av dem start_options viser.',
			)
		}
		return ok<PlanPreviewOutput>(
			planPreviewOf(
				resolved.value,
				option,
				await goalTargetOf(ctx),
				ctx.now,
				ctx.timezone,
			),
		)
	},
})

const accept_plan = defineCapability({
	name: 'accept_plan',
	kind: 'write',
	description:
		'Si ja til en plan: lager planen den valgte måten viste (eller den første), legger de første ukene i kalenderen, og retter den mot målet hvis et mål er satt. Fullfører kom-i-gang.',
	input: z.object({ style: PlanStyleSchema.optional() }).default({}),
	run: async (ctx, input) => {
		const resolved = await resolveStart(ctx.userId, ctx.now)
		if (!resolved.ok) {
			return fail(resolved.refusal.code, resolved.refusal.message)
		}
		const option = pickOption(
			resolved.value,
			input.style as PlanStyle | undefined,
		)
		if (!option) {
			return fail(
				'style-unavailable',
				'Den måten å trene på finnes ikke for disse svarene. Velg en av dem start_options viser.',
			)
		}
		const created = await createPlanFrom(
			ctx.userId,
			resolved.value,
			option.family as PlanStyle,
			ctx.now,
		)
		if (!created.ok) {
			return created.reason === 'plan-already-active'
				? fail('has-plan', 'Du har allerede en plan.')
				: created.reason === 'option-unavailable'
					? fail(
							'style-unavailable',
							'Den måten å trene på finnes ikke for disse svarene.',
						)
					: fail(
							'nothing-to-lay',
							'Med disse svarene ble det ingen økter å legge.',
						)
		}
		// A goal set before the plan existed: the plan runs toward it now, as
		// adding a race to an open-ended plan does.
		const found = await findGoal(ctx.userId, ctx.now, ctx.timezone)
		let goalApplied = false
		let goalProblem: string | null = null
		if (found && !found.planRunsTowardIt) {
			const attached = await attachGoal(
				ctx.userId,
				found.event.id,
				undefined,
				ctx.now,
			)
			if (attached.ok) goalApplied = true
			else goalProblem = ATTACH_REFUSAL_MESSAGES[attached.reason]
		}
		return ok<AcceptPlanOutput>({
			planId: created.outlineId,
			style: option.family as PlanStyle,
			startsOn: resolved.value.startWeekKey,
			sessionsLaid: created.laid,
			goalApplied,
			goalProblem,
			undo: null,
		})
	},
})

// ── Goal ─────────────────────────────────────────────────────────────────────

const goal = defineCapability({
	name: 'goal',
	kind: 'read',
	description:
		'Målet (et løp eller ritt), eller ingen («bli i bedre form»), og forslaget om å rette planen mot det når det venter på et ja.',
	input: empty,
	run: async (ctx) =>
		ok<GoalOutput>(await readGoal(ctx.userId, ctx.now, ctx.timezone)),
})

function targetSecondsOf(value: string | number | null | undefined) {
	if (value == null) return { ok: true as const, seconds: null }
	const seconds = parseClock(value)
	return seconds == null
		? { ok: false as const }
		: { ok: true as const, seconds }
}

async function withUndo(
	ctx: CapabilityCtx,
	undo: string | null,
): Promise<GoalWriteOutput> {
	return { ...(await readGoal(ctx.userId, ctx.now, ctx.timezone)), undo }
}

const set_goal = defineCapability({
	name: 'set_goal',
	kind: 'write',
	description:
		'Sett et mål: et løp eller ritt (navn, dato, idrett, gjerne distanse og måltid), eller «open-ended» for ingen dato. Har utøveren en plan uten løp, kommer et forslag til ny plan tilbake; det brukes først med apply_goal_to_plan.',
	input: z.discriminatedUnion('kind', [
		z.object({
			kind: z.literal('event'),
			name: GoalName,
			date: DayKey,
			sport: Sport,
			distanceKm: DistanceKm.optional(),
			targetTime: TargetTime.optional(),
		}),
		z.object({ kind: z.literal('open-ended') }),
	]),
	run: async (ctx, input) => {
		const found = await findGoal(ctx.userId, ctx.now, ctx.timezone)
		if (input.kind === 'open-ended') {
			if (!found) return ok(await withUndo(ctx, null))
			if (found.planRunsTowardIt) {
				return fail(
					'goal-has-plan',
					'Planen din er bygd mot dette målet. Fjern målet med remove_goal (stopPlan) for å begynne på nytt.',
				)
			}
			const fields = fieldsOf(found.event)
			await deleteEvent(ctx.userId, found.event.id)
			return ok(
				await withUndo(
					ctx,
					goalUndoToken(ctx.userId, {
						kind: 'recreate',
						id: found.event.id,
						fields,
					}),
				),
			)
		}
		if (found) {
			return fail(
				'goal-exists',
				'Du har allerede et mål. Endre det med update_goal, eller fjern det først.',
			)
		}
		const today = localDate(ctx.now, ctx.timezone)
		if (input.date <= today) {
			return fail('date-past', 'Datoen for målet må være etter i dag.')
		}
		const target = targetSecondsOf(input.targetTime)
		if (!target.ok) {
			return fail(
				'invalid-input',
				'Skriv måltiden som t:mm:ss, for eksempel 1:45:00.',
			)
		}
		const event = await createGoal(ctx.userId, {
			name: input.name,
			date: input.date,
			sport: input.sport,
			distanceKm: input.distanceKm ?? null,
			targetSeconds: target.seconds,
		})
		return ok(
			await withUndo(
				ctx,
				goalUndoToken(ctx.userId, {
					kind: 'delete',
					id: event.id,
					after: fieldsOf(event),
				}),
			),
		)
	},
})

const update_goal = defineCapability({
	name: 'update_goal',
	kind: 'write',
	description:
		'Endre målet: navn, dato, idrett, distanse eller måltid (null fjerner distanse eller måltid). Fasene i en plan mot målet flyttes ikke av en ny dato.',
	input: z.object({
		name: GoalName.optional(),
		date: DayKey.optional(),
		sport: Sport.optional(),
		distanceKm: DistanceKm.nullable().optional(),
		targetTime: TargetTime.nullable().optional(),
	}),
	run: async (ctx, input) => {
		const found = await findGoal(ctx.userId, ctx.now, ctx.timezone)
		if (!found) return fail('no-goal', 'Du har ikke noe mål å endre.')
		const before = fieldsOf(found.event)
		if (
			input.date !== undefined &&
			input.date <= localDate(ctx.now, ctx.timezone)
		) {
			return fail('date-past', 'Datoen for målet må være etter i dag.')
		}
		const target =
			input.targetTime === undefined
				? { ok: true as const, seconds: before.targetSeconds }
				: targetSecondsOf(input.targetTime)
		if (!target.ok) {
			return fail(
				'invalid-input',
				'Skriv måltiden som t:mm:ss, for eksempel 1:45:00.',
			)
		}
		const fields: GoalFields = {
			name: input.name ?? before.name,
			date: input.date ?? before.date,
			sport: input.sport ?? before.sport,
			disciplines: input.sport ? [input.sport] : before.disciplines,
			distanceKm:
				input.distanceKm === undefined ? before.distanceKm : input.distanceKm,
			targetSeconds: target.seconds,
		}
		const updated = await updateGoalFields(ctx.userId, found.event, fields)
		return ok(
			await withUndo(
				ctx,
				updated
					? goalUndoToken(ctx.userId, {
							kind: 'restore',
							id: found.event.id,
							fields: before,
							after: fieldsOf(updated),
						})
					: null,
			),
		)
	},
})

const remove_goal = defineCapability({
	name: 'remove_goal',
	kind: 'write',
	description:
		'Fjern målet. Går planen mot målet, må stopPlan være true: da stopper planen også, og kom-i-gang kan lage en ny. Kan angres med undo_goal_change.',
	input: z.object({ stopPlan: z.boolean().optional() }).default({}),
	run: async (ctx, input) => {
		const found = await findGoal(ctx.userId, ctx.now, ctx.timezone)
		if (!found) {
			return ok<RemoveGoalOutput>({
				removed: 'nothing',
				planStopped: false,
				undo: null,
			})
		}
		if (found.planRunsTowardIt) {
			if (!input.stopPlan) {
				return fail(
					'goal-has-plan',
					'Planen din er bygd mot dette målet. Fjerner du målet, stopper planen også. Send stopPlan: true for å gjøre det.',
				)
			}
			await cancelEvent(ctx.userId, found.event.id)
			return ok<RemoveGoalOutput>({
				removed: 'cancelled',
				planStopped: true,
				undo: goalUndoToken(ctx.userId, {
					kind: 'uncancel',
					id: found.event.id,
				}),
			})
		}
		const fields = fieldsOf(found.event)
		await deleteEvent(ctx.userId, found.event.id)
		return ok<RemoveGoalOutput>({
			removed: 'deleted',
			planStopped: false,
			undo: goalUndoToken(ctx.userId, {
				kind: 'recreate',
				id: found.event.id,
				fields,
			}),
		})
	},
})

const undo_goal_change = defineCapability({
	name: 'undo_goal_change',
	kind: 'write',
	description:
		'Angre set_goal, update_goal eller remove_goal med tokenet de ga.',
	input: z.object({ undo: z.string().min(1).max(4000) }),
	run: async (ctx, input) => {
		const undo = readGoalUndo(ctx.userId, input.undo)
		if (!undo) return fail('invalid-undo', 'Det kan ikke angres.')
		const applied = await applyGoalUndo(ctx.userId, undo, ctx.now)
		if (!applied.ok) return fail(applied.code, applied.message)
		return ok(await withUndo(ctx, null))
	},
})

const apply_goal_to_plan = defineCapability({
	name: 'apply_goal_to_plan',
	kind: 'write',
	description:
		'Si ja til forslaget fra goal/set_goal: blokka utøveren er i slutter etter denne uka, og fasene mot målet legges fra neste uke. Utøverens egne økter blir liggende.',
	input: z.object({ goalId: z.string().min(1), digest: z.string().min(1) }),
	run: async (ctx, input) => {
		const event = await prisma.event.findFirst({
			where: { id: input.goalId, athleteId: ctx.userId },
			select: { id: true },
		})
		if (!event) return fail('not-found', 'Fant ikke målet.')
		const result = await attachGoal(
			ctx.userId,
			input.goalId,
			input.digest,
			ctx.now,
		)
		if (!result.ok) {
			return fail(result.reason, ATTACH_REFUSAL_MESSAGES[result.reason])
		}
		const found = await findGoal(ctx.userId, ctx.now, ctx.timezone)
		return ok<ApplyGoalToPlanOutput>({
			goal: goalOf(found!.event, {
				planRunsTowardIt: true,
				today: localDate(ctx.now, ctx.timezone),
			}),
			endedBlock: result.ended,
			phases: result.phases,
			undo: null,
		})
	},
})

// ── Connections ──────────────────────────────────────────────────────────────

const connections = defineCapability({
	name: 'connections',
	kind: 'read',
	description:
		'Kildene øktene kan komme fra (intervals.icu, Polar, filopplasting …), hva som kan kobles til, og tilstanden til hver.',
	input: empty,
	run: async (ctx) =>
		ok<ConnectionsOutput>(await readSources(ctx.userId, ctx.now)),
})

const connect_intervals_icu = defineCapability({
	name: 'connect_intervals_icu',
	kind: 'write',
	description:
		'Koble til intervals.icu med utøverens personlige API-nøkkel. Nøkkelen sjekkes mot intervals.icu (som også gir utøver-id-en), og historikken hentes i bakgrunnen.',
	input: z.object({ apiKey: z.string().max(400) }),
	run: async (ctx, input) => {
		const linked = await linkIntervalsIcu(ctx.userId, input.apiKey)
		if (!linked.ok) return fail(linked.reason, CONNECT_REFUSALS[linked.reason])
		return ok<ConnectOutput>({
			source: await readSource(ctx.userId, 'intervalsicu', ctx.now),
		})
	},
})

const disconnect_source = defineCapability({
	name: 'disconnect_source',
	kind: 'write',
	description:
		'Koble fra en kilde. Øktene som alt er hentet, blir liggende. Kan ikke angres; koble til på nytt i stedet.',
	input: z.object({ source: z.enum(['intervalsicu', 'strava']) }),
	run: async (ctx, input) => {
		await disconnect(ctx.userId, input.source)
		return ok<DisconnectOutput>({
			source: await readSource(ctx.userId, input.source, ctx.now),
		})
	},
})

const sync_sources = defineCapability({
	name: 'sync_sources',
	kind: 'write',
	description:
		'Hent nye økter nå fra alle tilkoblede kilder (eller én). Kildene sjekkes også av seg selv hver dag.',
	input: z
		.object({ source: z.enum(['intervalsicu', 'strava']).optional() })
		.default({}),
	run: async (ctx, input) => {
		const result = await syncSources(ctx.userId, input.source)
		if (!result) {
			return fail('not-connected', 'Koble til en kilde først.')
		}
		return ok<SyncOutput>(result)
	},
})

const upload_activity_files = defineCapability({
	name: 'upload_activity_files',
	kind: 'write',
	description:
		'Last opp økter som filer (.fit, .fit.gz, .tcx, .gpx, .zip, .gz): multipart med ett eller flere «file»-felt, og valgfritt «sport» for én fil.',
	input: z.unknown(),
	run: async (ctx) => {
		const uploaded = await uploadFiles(ctx.userId, ctx.request, ctx.timezone)
		if (!uploaded.ok)
			return fail(uploaded.refusal.code, uploaded.refusal.message)
		return ok<UploadOutput>(uploaded.value)
	},
})

const import_status = defineCapability({
	name: 'import_status',
	kind: 'read',
	description:
		'Hvor langt importen har kommet: om historikk fortsatt hentes, hvor mange økter som er hentet fra hver kilde, og hva de fire siste ukene sier.',
	input: empty,
	run: async (ctx) => {
		const [sources, recordings, reading] = await Promise.all([
			readSources(ctx.userId, ctx.now),
			readRecordings(ctx.userId),
			readFirstRunFindings(ctx.userId, ctx.now),
		])
		const connected = sources.sources.filter(
			(source) => source.id !== 'file' && source.state !== 'not-connected',
		)
		const prefill = startPrefill(reading.findings)
		const volume = reading.findings.volume
		return ok<ImportStatusOutput>({
			importing: connected.some(
				(source) => source.state === 'importing-history',
			),
			sources: connected.map((source) => ({
				id: source.id,
				state: source.state,
				lastCheckedAt: source.lastCheckedAt,
			})),
			recordings,
			history: {
				weeksWithTraining: reading.findings.weeksTrained ?? 0,
				hoursPerWeek: volume.measured
					? { value: prefill.hours }
					: {
							value: null,
							why:
								volume.reason === 'importing'
									? 'Historikken hentes fortsatt.'
									: volume.reason === 'not-connected'
										? 'Ingen økter ennå. Koble til klokka eller last opp filer.'
										: volume.reason === 'no-sessions'
											? 'Ingen økter de siste fire ukene.'
											: volume.reason === 'no-duration'
												? 'Øktene har ingen tid registrert.'
												: 'Bare styrkeøkter de siste fire ukene.',
						},
			},
		})
	},
})

// ── Settings ─────────────────────────────────────────────────────────────────

const thresholds = defineCapability({
	name: 'thresholds',
	kind: 'read',
	description:
		'Terskler og soner per idrett: det som er lagret, sonesystemet, hver sone som et spenn (eller hvorfor den mangler), og historikken.',
	input: empty,
	run: async (ctx) =>
		ok<ThresholdsOutput>({
			sports: await readThresholds(ctx.userId, ctx.timezone),
		}),
})

const set_thresholds = defineCapability({
	name: 'set_thresholds',
	kind: 'write',
	description:
		'Sett terskler for én idrett (makspuls, terskelpuls, FTP, terskelwatt, terskelfart, CSS) og/eller sonesystem. Planlagte økters mål regnes om.',
	input: z.object({
		sport: Sport,
		maxHr: z.number().int().min(80).max(220).optional(),
		lthr: z.number().int().min(80).max(220).optional(),
		ftp: z.number().int().min(50).max(600).optional(),
		runPower: z.number().int().min(50).max(600).optional(),
		thresholdPacePerKm: z.number().int().min(150).max(600).optional(),
		cssPer100m: z.number().int().min(60).max(250).optional(),
		zoneSystem: z.string().min(1).optional(),
	}),
	run: async (ctx, input) => {
		const { sport, zoneSystem, ...values } = input
		const allowed = SPORT_FIELDS[sport]
		const wrong = Object.keys(values).filter(
			(key) => !(allowed as readonly string[]).includes(key),
		)
		if (wrong.length > 0) {
			return fail(
				'invalid-input',
				'Den terskelen finnes ikke for denne idretten.',
			)
		}
		if (
			zoneSystem &&
			(!getRecipe(zoneSystem) || !recipeBelongsToDiscipline(zoneSystem, sport))
		) {
			return fail(
				'invalid-input',
				'Det sonesystemet finnes ikke for denne idretten.',
			)
		}
		if (Object.keys(values).length === 0 && !zoneSystem) {
			return fail('invalid-input', 'Send minst én terskel eller et sonesystem.')
		}
		await setDisciplineThresholds(ctx.userId, sport, {
			...(values.maxHr != null ? { maxHr: values.maxHr } : {}),
			...(values.lthr != null ? { lthr: values.lthr } : {}),
			...(values.ftp != null ? { ftp: values.ftp } : {}),
			...(values.runPower != null
				? { runPowerThresholdW: values.runPower }
				: {}),
			...(values.thresholdPacePerKm != null
				? { thresholdPaceSecPerKm: values.thresholdPacePerKm }
				: {}),
			...(values.cssPer100m != null
				? { cssSecPer100m: values.cssPer100m }
				: {}),
			...(zoneSystem ? { zoneSystem } : {}),
		})
		const all = await readThresholds(ctx.userId, ctx.timezone)
		return ok<SetThresholdsOutput>(all.find((entry) => entry.sport === sport)!)
	},
})

const set_display_name = defineCapability({
	name: 'set_display_name',
	kind: 'write',
	description: 'Navnet appen kaller utøveren (null fjerner det).',
	input: z.object({ name: z.string().trim().min(1).max(40).nullable() }),
	run: async (ctx, input) => {
		await prisma.user.update({
			where: { id: ctx.userId },
			data: { name: input.name },
		})
		return ok(await setupOf(ctx))
	},
})

const set_preferences = defineCapability({
	name: 'set_preferences',
	kind: 'write',
	description:
		'Innstillinger: om planen justerer seg selv ved ukeslutt eller spør først, klokkeslettet øktene legges på, og hva slags økter utøveren liker.',
	input: z.object({
		adjustAutomatically: z.boolean().optional(),
		defaultTrainingTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
			.nullable()
			.optional(),
		sessionPreferences: Preferences.optional(),
	}),
	run: async (ctx, input) => {
		await updateAthleteProfile(ctx.userId, {
			...(input.defaultTrainingTime !== undefined
				? { defaultTrainingTime: input.defaultTrainingTime }
				: {}),
			...(input.sessionPreferences
				? { sessionPreferences: input.sessionPreferences }
				: {}),
		})
		if (input.adjustAutomatically !== undefined) {
			await prisma.athleteProfile.update({
				where: { userId: ctx.userId },
				data: {
					autopilot: input.adjustAutomatically,
					autopilotIntroPending: false,
				},
			})
		}
		return ok(await setupOf(ctx))
	},
})

const export_data = defineCapability({
	name: 'export_data',
	kind: 'read',
	description: 'Alt utøveren eier, som JSON, for å lagre en kopi.',
	input: empty,
	run: async (ctx) =>
		ok<ExportDataOutput>({
			fileName: 'my-trainm8-data.json',
			data: await exportUserData({
				userId: ctx.userId,
				domain: getDomainUrl(ctx.request),
			}),
		}),
})

const delete_account = defineCapability({
	name: 'delete_account',
	kind: 'write',
	description:
		'Slett kontoen og alle dataene for godt. Krever confirm: "SLETT", skrevet av utøveren. Kan ikke angres.',
	input: z.object({ confirm: z.string() }),
	run: async (ctx, input) => {
		if (input.confirm !== 'SLETT') {
			return fail(
				'confirm-required',
				'Skriv SLETT for å bekrefte at kontoen og alle dataene skal slettes.',
			)
		}
		try {
			// What the athlete thinks of as their training: every session on
			// their calendar (planned, done, or brought in from a file or a
			// watch) and every recording. Counted first, since they go with the
			// account; `workoutsErased` counts only written plans, so an athlete
			// who only uploaded has none.
			const [sessionsErased, recordingsErased] = await Promise.all([
				prisma.workoutSession.count({ where: { userId: ctx.userId } }),
				prisma.activityImport.count({ where: { athleteId: ctx.userId } }),
			])
			const erased = await deleteAccount(ctx.userId)
			return ok<DeleteAccountOutput>({
				deleted: true,
				sessionsErased,
				recordingsErased,
				workoutsErased: erased.erased,
			})
		} catch (error) {
			console.error(error)
			return fail(
				'delete-failed',
				'Kontoen kunne ikke slettes. Ingenting ble slettet. Prøv igjen.',
			)
		}
	},
})

/** Getting started, goal, plan, connections and settings capabilities. */
export const SETUP_CAPABILITIES = {
	get_setup,
	set_sports,
	set_experience_level,
	set_current_volume,
	set_availability,
	set_strength,
	set_session_preferences,
	set_timezone,
	search_places,
	set_home_place,
	remove_home_place,
	start_options,
	plan_preview,
	accept_plan,
	goal,
	set_goal,
	update_goal,
	remove_goal,
	undo_goal_change,
	apply_goal_to_plan,
	connections,
	connect_intervals_icu,
	disconnect_source,
	sync_sources,
	upload_activity_files,
	import_status,
	thresholds,
	set_thresholds,
	set_display_name,
	set_preferences,
	export_data,
	delete_account,
} satisfies Record<string, Capability<any, any>>
