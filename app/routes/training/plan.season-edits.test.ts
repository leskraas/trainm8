import { type AppLoadContext } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getSessionExpirationDate } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import {
	SEASON_EDIT_LABELS,
	SEASON_EDIT_REFUSAL_LABELS,
} from '#app/utils/labels.ts'
import { createOpenEndedPlan } from '#app/utils/plan-outline/authoring.server.ts'
import { weekKeyAt } from '#app/utils/plan-outline/week-keys.ts'
import { createPassword, createUser } from '#tests/db-utils.ts'
import { BASE_URL, getSessionCookieHeader } from '#tests/utils.ts'
import { action } from './plan.tsx'

// The Sesong edits through the plan page's action (#505 stories 72–77): for
// each edit the preview answers with what would change and writes nothing,
// the confirm applies it, a stale confirm is refused under a fresh preview,
// and each message says which numbers did not move.
//
// The clock is pinned to Thursday 8 October 2026 (Oslo), so the plan — an
// open-ended one made that day: one four-week block on 3:1 at a flat 4 hours —
// opens Monday 5 October (week 41), which is begun, and its third week (43) is
// the second one not yet begun.

const THURSDAY = new Date('2026-10-08T10:00:00Z')

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] })
	vi.setSystemTime(THURSDAY)
})

afterEach(() => {
	vi.useRealTimers()
})

const ROUTE_PATH = '/training/plan'
const ARGS = {
	params: {},
	context: {} as AppLoadContext,
	unstable_pattern: ROUTE_PATH,
}

type FormReply = {
	status?: string
	error?: Record<string, string[] | null>
} | null

type Reply = {
	data: {
		seasonEdit?: {
			edit: string
			result?: FormReply
			confirmResult?: FormReply
			preview?: {
				message: string
				warnings: string[]
				digest: string
				weeks: Array<{ weekKey: string }>
			}
		}
	}
	init: { status: number } | null
}

async function setUp() {
	const userData = createUser()
	const session = await prisma.session.create({
		data: {
			expirationDate: getSessionExpirationDate(),
			user: {
				create: {
					...userData,
					password: { create: createPassword(userData.username) },
				},
			},
		},
		select: { id: true, userId: true },
	})
	const plan = await createOpenEndedPlan(session.userId, {
		discipline: 'run',
		weeklyHours: 4,
	})
	if (!plan.ok) throw new Error(plan.reason)
	const outline = await prisma.planOutline.findUniqueOrThrow({
		where: { id: plan.outlineId },
		select: {
			startWeekKey: true,
			phases: { select: { id: true } },
			tracks: { select: { id: true } },
		},
	})
	return {
		outlineId: plan.outlineId,
		phaseId: outline.phases[0]!.id,
		trackId: outline.tracks[0]!.id,
		thirdWeek: weekKeyAt(outline.startWeekKey, 2),
		cookie: await getSessionCookieHeader(session),
	}
}

function post(entries: Array<[string, string]>, cookie: string) {
	return new Request(new URL(ROUTE_PATH, BASE_URL).toString(), {
		method: 'POST',
		headers: {
			cookie,
			'content-type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams(entries).toString(),
	})
}

/** The action's reply: plain data, or the `data()` wrapper of a refusal. */
function replyOf(value: unknown): Reply {
	return value && typeof value === 'object' && 'init' in value
		? (value as Reply)
		: { data: value as Reply['data'], init: null }
}

async function send(entries: Array<[string, string]>, cookie: string) {
	return action({ request: post(entries, cookie), ...ARGS }).catch(
		(thrown: unknown) => thrown,
	)
}

const overridesOf = (trackId: string) =>
	prisma.weekVolumeOverride.findMany({
		where: { trackId },
		select: { weekKey: true, value: true },
	})

const phaseOf = (id: string) =>
	prisma.planOutlinePhase.findUniqueOrThrow({
		where: { id },
		select: { name: true, weeks: true, recoveryWeekIndex: true },
	})

test('a week target: the preview warns on a rise over 10 %, says what stays, and writes nothing; the confirm applies it', async () => {
	const { outlineId, trackId, thirdWeek, cookie } = await setUp()
	const fields: Array<[string, string]> = [
		['edit', 'week-target'],
		['outlineId', outlineId],
		['trackId', trackId],
		['weekKey', thirdWeek],
		['value', '5'],
	]

	expect(thirdWeek).toBe('2026-10-19')
	const preview = replyOf(
		await send([['intent', 'preview-season-edit'], ...fields], cookie),
	)
	expect(preview.init).toBeNull()
	expect(preview.data.seasonEdit?.result?.status).toBe('success')
	expect(preview.data.seasonEdit?.preview?.message).toBe(
		`Uke 43: mål 4 → 5 t. Fasen og de andre ukene står som før.`,
	)
	expect(preview.data.seasonEdit?.preview?.warnings).toEqual([
		`Uke 43: 4 → 5 t, +25 % over forrige harde uke.`,
	])
	expect(await overridesOf(trackId)).toEqual([])

	const applied = await send(
		[
			['intent', 'apply-season-edit'],
			...fields,
			['digest', preview.data.seasonEdit!.preview!.digest],
		],
		cookie,
	)
	expect(applied).toBeInstanceOf(Response)
	expect((applied as Response).headers.get('location')).toBe(ROUTE_PATH)
	expect(await overridesOf(trackId)).toEqual([{ weekKey: thirdWeek, value: 5 }])
})

test('a confirm that no longer matches its preview is refused under a fresh preview, and writes nothing', async () => {
	const { outlineId, trackId, thirdWeek, cookie } = await setUp()

	const reply = replyOf(
		await send(
			[
				['intent', 'apply-season-edit'],
				['edit', 'week-target'],
				['outlineId', outlineId],
				['trackId', trackId],
				['weekKey', thirdWeek],
				['value', '5'],
				['digest', 'not-what-was-shown'],
			],
			cookie,
		),
	)

	expect(reply.init?.status).toBe(400)
	expect(reply.data.seasonEdit?.confirmResult?.error?.['']).toEqual([
		SEASON_EDIT_REFUSAL_LABELS['preview-stale'],
	])
	expect(reply.data.seasonEdit?.preview?.digest).toMatch(/^[0-9a-f]{8}$/)
	expect(await overridesOf(trackId)).toEqual([])
})

test('a confirm with no preview behind it is refused', async () => {
	const { outlineId, trackId, thirdWeek, cookie } = await setUp()

	const reply = replyOf(
		await send(
			[
				['intent', 'apply-season-edit'],
				['edit', 'week-target'],
				['outlineId', outlineId],
				['trackId', trackId],
				['weekKey', thirdWeek],
				['value', '5'],
			],
			cookie,
		),
	)

	expect(reply.init?.status).toBe(400)
	expect(reply.data.seasonEdit?.confirmResult?.error?.['']).toEqual([
		SEASON_EDIT_LABELS.previewFirst,
	])
	expect(await overridesOf(trackId)).toEqual([])
})

test('a blank week target is refused on the field', async () => {
	const { outlineId, trackId, thirdWeek, cookie } = await setUp()

	const reply = replyOf(
		await send(
			[
				['intent', 'preview-season-edit'],
				['edit', 'week-target'],
				['outlineId', outlineId],
				['trackId', trackId],
				['weekKey', thirdWeek],
				['value', ''],
			],
			cookie,
		),
	)

	expect(reply.init?.status).toBe(400)
	expect(reply.data.seasonEdit?.result?.error?.value).toEqual([
		SEASON_EDIT_LABELS.targetRequired,
	])
})

test('a phase: renamed and lengthened behind a preview, with what stays named', async () => {
	const { outlineId, phaseId, cookie } = await setUp()
	const fields: Array<[string, string]> = [
		['edit', 'phase'],
		['outlineId', outlineId],
		['phaseId', phaseId],
		['name', 'Grunnlag'],
		['weeks', '6'],
	]

	const preview = replyOf(
		await send([['intent', 'preview-season-edit'], ...fields], cookie),
	)
	expect(preview.data.seasonEdit?.preview?.message).toBe(
		'«Blokk 1» heter nå «Grunnlag» og varer 6 uker (var 4). Starten på planen og de andre fasene står som før.',
	)
	expect(await phaseOf(phaseId)).toMatchObject({ name: 'Blokk 1', weeks: 4 })

	const applied = await send(
		[
			['intent', 'apply-season-edit'],
			...fields,
			['digest', preview.data.seasonEdit!.preview!.digest],
		],
		cookie,
	)
	expect(applied).toBeInstanceOf(Response)
	expect(await phaseOf(phaseId)).toMatchObject({ name: 'Grunnlag', weeks: 6 })
})

test('the easy week: moved within its block behind a preview', async () => {
	const { outlineId, phaseId, thirdWeek, cookie } = await setUp()
	const fields: Array<[string, string]> = [
		['edit', 'easy-week'],
		['outlineId', outlineId],
		['weekKey', thirdWeek],
	]

	const preview = replyOf(
		await send([['intent', 'preview-season-edit'], ...fields], cookie),
	)
	expect(preview.data.seasonEdit?.preview?.message).toMatch(
		new RegExp(
			`^Blokk 1: den lette uka flyttes fra uke 44 til uke 43\\. Lengden på fasen og de andre ukene står som før\\.$`,
		),
	)
	expect(preview.data.seasonEdit?.preview?.weeks).toHaveLength(2)
	expect((await phaseOf(phaseId)).recoveryWeekIndex).toBeNull()

	const applied = await send(
		[
			['intent', 'apply-season-edit'],
			...fields,
			['digest', preview.data.seasonEdit!.preview!.digest],
		],
		cookie,
	)
	expect(applied).toBeInstanceOf(Response)
	expect((await phaseOf(phaseId)).recoveryWeekIndex).toBe(2)
})

test('an easy week the plan already has is refused in the form', async () => {
	const { outlineId, cookie } = await setUp()
	const start = (
		await prisma.planOutline.findUniqueOrThrow({
			where: { id: outlineId },
			select: { startWeekKey: true },
		})
	).startWeekKey

	const reply = replyOf(
		await send(
			[
				['intent', 'preview-season-edit'],
				['edit', 'easy-week'],
				['outlineId', outlineId],
				['weekKey', weekKeyAt(start, 3)],
			],
			cookie,
		),
	)
	expect(reply.init?.status).toBe(400)
	expect(reply.data.seasonEdit?.result?.error?.['']).toEqual([
		SEASON_EDIT_REFUSAL_LABELS['no-change'],
	])
})

test('back to the plan’s target: previewed, then applied, and the week follows the plan again', async () => {
	const { outlineId, trackId, thirdWeek, cookie } = await setUp()
	await prisma.weekVolumeOverride.create({
		data: { trackId, weekKey: thirdWeek, value: 5 },
	})
	const fields: Array<[string, string]> = [
		['edit', 'week-target'],
		['outlineId', outlineId],
		['trackId', trackId],
		['weekKey', thirdWeek],
		['value', ''],
		['revert', 'on'],
	]

	const preview = replyOf(
		await send([['intent', 'preview-season-edit'], ...fields], cookie),
	)
	expect(preview.data.seasonEdit?.preview?.message).toBe(
		'Uke 43: tilbake til planens mål, 5 → 4 t. Fasen og de andre ukene står som før.',
	)
	expect(await overridesOf(trackId)).toHaveLength(1)

	const applied = await send(
		[
			['intent', 'apply-season-edit'],
			...fields,
			['digest', preview.data.seasonEdit!.preview!.digest],
		],
		cookie,
	)
	expect(applied).toBeInstanceOf(Response)
	expect(await overridesOf(trackId)).toEqual([])
})

test('back to the plan’s target on a week that already follows it is refused in the form', async () => {
	const { outlineId, trackId, thirdWeek, cookie } = await setUp()

	const reply = replyOf(
		await send(
			[
				['intent', 'preview-season-edit'],
				['edit', 'week-target'],
				['outlineId', outlineId],
				['trackId', trackId],
				['weekKey', thirdWeek],
				['revert', 'on'],
			],
			cookie,
		),
	)
	expect(reply.init?.status).toBe(400)
	expect(reply.data.seasonEdit?.result?.error?.['']).toEqual([
		SEASON_EDIT_REFUSAL_LABELS['not-hand-set'],
	])
})

test('a phase’s rhythm changes behind its preview', async () => {
	const { outlineId, phaseId, cookie } = await setUp()
	const fields: Array<[string, string]> = [
		['edit', 'phase'],
		['outlineId', outlineId],
		['phaseId', phaseId],
		['rhythm', '2:1'],
	]

	const preview = replyOf(
		await send([['intent', 'preview-season-edit'], ...fields], cookie),
	)
	expect(preview.data.seasonEdit?.preview?.message).toBe(
		'«Blokk 1» går nå 2:1 (var 3:1). Navnet og lengden på fasen står som før.',
	)
	expect(await phaseOf(phaseId)).toMatchObject({ weeks: 4 })

	const applied = await send(
		[
			['intent', 'apply-season-edit'],
			...fields,
			['digest', preview.data.seasonEdit!.preview!.digest],
		],
		cookie,
	)
	expect(applied).toBeInstanceOf(Response)
	expect(
		await prisma.planOutlinePhase.findUniqueOrThrow({
			where: { id: phaseId },
			select: { rhythm: true },
		}),
	).toEqual({ rhythm: '2:1' })
})
