/**
 * The Lab Engine's **reads** (ADR 0125): everything a Lab App reads, as
 * named capabilities. Each is backed by the domain's own derivations (the
 * typed actions, the week model, the coach's call, the strength log) and
 * returns plain JSON whose types live in `reads.types.ts`. The contract is
 * `docs/lab/capabilities/reads.md`.
 *
 * Reads that make sense for the demo athlete take `demo: true` and then
 * answer with `source: 'demo'`; without it they answer with the athlete's own
 * data, however little there is. Nothing falls back to demo data by itself.
 */
import { z } from 'zod/v4'
import { daysBetween } from '#app/utils/athlete-calendar.ts'
import { getActivePlan } from '#app/utils/training.server.ts'
import { type Capability, defineCapability, fail, ok } from './define.ts'
import { readAthlete } from './reads/athlete.server.ts'
import {
	demoAthlete,
	demoPlan,
	demoProgress,
	demoProposals,
	demoSession,
	demoSessions,
	demoToday,
	demoWeek,
} from './reads/demo.server.ts'
import { readExercise, readExercises } from './reads/exercises.server.ts'
import { readPlan } from './reads/plan.server.ts'
import { readProgress } from './reads/progress.server.ts'
import { readProposals } from './reads/proposals.server.ts'
import { readRecordings } from './reads/recordings.server.ts'
import { readSession } from './reads/session.server.ts'
import { decodeCursor, readSessions } from './reads/sessions.server.ts'
import { readToday } from './reads/today.server.ts'
import { readWeek } from './reads/week.server.ts'
import { readZones } from './reads/zones.server.ts'
import {
	type AthleteOutput,
	type ExerciseOutput,
	type ExercisesOutput,
	type PlanOutput,
	type ProgressOutput,
	type ProposalsOutput,
	type RecordingsOutput,
	type SessionOutput,
	type SessionsOutput,
	type TodayOutput,
	type WeekOutput,
	type ZonesOutput,
} from './reads.types.ts'

/** `YYYY-MM-DD`, a real calendar day. */
const DayKey = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.refine((day) => {
		const instant = new Date(`${day}T00:00:00Z`)
		return (
			!Number.isNaN(instant.getTime()) &&
			instant.toISOString().slice(0, 10) === day
		)
	})

/** Ask for the made-up demo athlete instead of the athlete's own data. */
const Demo = z.boolean().optional()

/** The widest range one `sessions` call reads. */
export const SESSIONS_MAX_DAYS = 366

const NOT_FOUND_SESSION = 'Fant ikke økta. Den kan være slettet.'

export const READ_CAPABILITIES = {
	athlete: defineCapability({
		name: 'athlete',
		kind: 'read',
		description:
			'Hvem utøveren er og hvor langt hen har kommet i å komme i gang: idretter, nivå, tilgjengelighet, koblede tjenester, mål og plan. Bryteren mellom «første gang» og «vanlig dag».',
		input: z.object({ demo: Demo }),
		async run(ctx, { demo }) {
			if (demo) return ok<AthleteOutput>(demoAthlete(ctx.now, ctx.timezone))
			return ok<AthleteOutput>(await readAthlete(ctx))
		},
	}),

	today: defineCapability({
		name: 'today',
		kind: 'read',
		description:
			'Dagens økter med full status, eller at det er hviledag; form, slitenhet og formtopp; dagens råd fra treneren; uka så langt per idrett; ventende forslag og været.',
		input: z.object({ demo: Demo }),
		async run(ctx, { demo }) {
			if (demo) return ok<TodayOutput>(demoToday(ctx.now, ctx.timezone))
			return ok<TodayOutput>(await readToday(ctx))
		},
	}),

	week: defineCapability({
		name: 'week',
		kind: 'read',
		description:
			'Én treningsuke (mandag–søndag), hvilken som helst: dagene og øktene, hver idrett mot ukemålet, ukas belastning, fasen og forslagene som ville endre uka.',
		input: z.object({
			/** Any day in the week; this week when left out. */
			date: DayKey.optional(),
			demo: Demo,
		}),
		async run(ctx, { date, demo }) {
			if (demo) return ok<WeekOutput>(demoWeek(ctx.now, ctx.timezone, date))
			return ok<WeekOutput>(await readWeek(ctx, date))
		},
	}),

	plan: defineCapability({
		name: 'plan',
		kind: 'read',
		description:
			'Hele sesongen: målet, fasene, hver uke med mål, planlagt og gjort per idrett, og hvor i planen i dag er. `plan` er null når utøveren ikke har en plan.',
		input: z.object({ demo: Demo }),
		async run(ctx, { demo }) {
			if (demo) return ok<PlanOutput>(demoPlan(ctx.now, ctx.timezone))
			return ok<PlanOutput>(await readPlan(ctx))
		},
	}),

	sessions: defineCapability({
		name: 'sessions',
		kind: 'read',
		description:
			'Øktene mellom to dager, eldste først, en side om gangen: planlagte, gjorte, ikke gjorte og registrerte.',
		input: z
			.object({
				from: DayKey,
				to: DayKey,
				sport: z.enum(['run', 'bike', 'swim', 'strength', 'other']).optional(),
				cursor: z.string().min(1).optional(),
				limit: z.number().int().min(1).max(100).default(50),
				demo: Demo,
			})
			.refine(({ from, to }) => {
				const days = daysBetween(from, to) + 1
				return days >= 1 && days <= SESSIONS_MAX_DAYS
			})
			.refine(({ cursor }) => cursor == null || decodeCursor(cursor) != null),
		async run(ctx, { from, to, sport, cursor, limit, demo }) {
			if (demo) {
				return ok<SessionsOutput>(demoSessions(ctx.now, ctx.timezone, from, to))
			}
			return ok<SessionsOutput>(
				await readSessions(ctx, {
					from,
					to,
					sport,
					limit,
					cursor: cursor ? decodeCursor(cursor) : null,
				}),
			)
		},
	}),

	session: defineCapability({
		name: 'session',
		kind: 'read',
		description:
			'Én økt i sin helhet: oppbygging med mål i utøverens egne soner, plan mot gjennomført og dommen, hvordan den kjentes, styrkesett foreskrevet og logget, opptaket, og hva som kan gjøres med den nå.',
		input: z.object({ sessionId: z.string().min(1), demo: Demo }),
		async run(ctx, { sessionId, demo }) {
			const session = demo
				? demoSession(ctx.now, ctx.timezone, sessionId)
				: await readSession(ctx, sessionId)
			return session
				? ok<SessionOutput>(session)
				: fail('not-found', NOT_FOUND_SESSION)
		},
	}),

	progress: defineCapability({
		name: 'progress',
		kind: 'read',
		description:
			'Fremgang over tid: form, slitenhet og formtopp per dag (opptil 26 uker), ukas belastning mot planen, mengde per idrett, og hvor langt det er igjen til målet.',
		input: z.object({
			weeks: z.number().int().min(1).max(26).default(12),
			demo: Demo,
		}),
		async run(ctx, { weeks, demo }) {
			if (demo) {
				return ok<ProgressOutput>(demoProgress(ctx.now, ctx.timezone, weeks))
			}
			return ok<ProgressOutput>(await readProgress(ctx, weeks))
		},
	}),

	proposals: defineCapability({
		name: 'proposals',
		kind: 'read',
		description:
			'Endringene planen foreslår etter at forrige uke ble lukket, med hva de ville endre og hvorfor, og hva planen endret av seg selv (som kan angres).',
		input: z.object({ demo: Demo }),
		async run(ctx, { demo }) {
			if (demo) return ok<ProposalsOutput>(demoProposals(ctx.now, ctx.timezone))
			const plan = await getActivePlan(ctx.userId, ctx.now)
			return ok<ProposalsOutput>(await readProposals(ctx, plan))
		},
	}),

	zones: defineCapability({
		name: 'zones',
		kind: 'read',
		description:
			'Tersklene per idrett, sonemodellen hver idrett bruker og hver sone regnet ut i utøverens egne tall, terskelhistorikken og løpsresultatene.',
		input: z.object({}),
		async run(ctx) {
			return ok<ZonesOutput>(await readZones(ctx))
		},
	}),

	exercises: defineCapability({
		name: 'exercises',
		kind: 'read',
		description:
			'Øvelsesbiblioteket for styrke, søkbart på alle navn en øvelse har (også norske), med hvor ofte utøveren har logget hver.',
		input: z.object({
			query: z.string().max(100).default(''),
			cursor: z.string().regex(/^\d+$/).optional(),
			limit: z.number().int().min(1).max(200).default(50),
		}),
		async run(ctx, { query, cursor, limit }) {
			return ok<ExercisesOutput>(
				await readExercises(ctx, {
					query,
					offset: cursor ? Number(cursor) : 0,
					limit,
				}),
			)
		},
	}),

	exercise: defineCapability({
		name: 'exercise',
		kind: 'read',
		description:
			'Én styrkeøvelse: utøverens historikk på den, rekorder, anslått 1RM og lagrede maksverdier.',
		input: z.object({ exerciseId: z.string().min(1) }),
		async run(ctx, { exerciseId }) {
			const exercise = await readExercise(ctx, exerciseId)
			return exercise
				? ok<ExerciseOutput>(exercise)
				: fail('not-found', 'Fant ikke øvelsen.')
		},
	}),

	recordings: defineCapability({
		name: 'recordings',
		kind: 'read',
		description:
			'Det klokka og opplastinger har hentet inn, nyeste først, med økta hvert opptak havnet på, og om en historikkimport fortsatt pågår.',
		input: z.object({
			cursor: z.iso.datetime().optional(),
			limit: z.number().int().min(1).max(100).default(30),
		}),
		async run(ctx, { cursor, limit }) {
			return ok<RecordingsOutput>(
				await readRecordings(ctx, { cursor: cursor ?? null, limit }),
			)
		},
	}),
} satisfies Record<string, Capability<any, any>>
