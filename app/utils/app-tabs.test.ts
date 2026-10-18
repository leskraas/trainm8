import { expect, test } from 'vitest'
import {
	APP_TAB_HREFS,
	APP_TABS,
	appTabPlace,
	LIBRARY_SECTION_HREF,
	showsTabBar,
} from './app-tabs.ts'

/**
 * Three tabs (ADR 0101 §1, amending ADR 0083 §1): I dag, Plan and Meg. Sesong
 * became Plan, and Bibliotek is a section of Plan, so every address either of
 * them was home to now lights Plan.
 */
test('there are three tabs, and each lands on its own page', () => {
	expect(APP_TABS).toEqual(['today', 'plan', 'me'])
	expect(APP_TAB_HREFS).toEqual({
		today: '/',
		plan: '/training/plan',
		me: '/me',
	})
})

test('every old Sesong address lands in Plan', () => {
	// The plan, plan creation and its steps, and the Events it builds toward.
	expect(appTabPlace('/training/plan')).toEqual({ tab: 'plan', landing: true })
	expect(appTabPlace('/training/plan/')).toEqual({ tab: 'plan', landing: true })
	// With no plan, plan creation is where Plan lands.
	expect(appTabPlace('/training/plan/new')).toEqual({
		tab: 'plan',
		landing: true,
	})
	for (const path of [
		'/training/plan/new/event-1',
		'/training/plan/generate/event-1',
		'/training/events',
		'/training/events/new',
		'/training/events/event-1',
	]) {
		expect({ path, place: appTabPlace(path) }).toEqual({
			path,
			place: { tab: 'plan', landing: false },
		})
	}
})

test('every old Bibliotek address lands in Plan, inside it', () => {
	for (const path of [
		'/library',
		'/library/exercises',
		'/training/catalogue',
		'/training/catalogue/place/workout-1',
		'/training/catalogue/publish/workout-1',
		'/training/programs',
		'/training/programs/run/instance-1',
		'/training/exercises/exercise-1',
	]) {
		expect({ path, place: appTabPlace(path) }).toEqual({
			path,
			place: { tab: 'plan', landing: false },
		})
	}
})

test('Bibliotek has its own place on Plan to back out to', () => {
	expect(LIBRARY_SECTION_HREF).toBe('/library')
})

test('Meg and I dag keep their addresses', () => {
	expect(appTabPlace('/')).toEqual({ tab: 'today', landing: true })
	expect(appTabPlace('/me')).toEqual({ tab: 'me', landing: true })
	for (const path of [
		'/settings/profile',
		'/settings/integrations',
		'/integrations/intervalsicu/connect',
		'/imports/upload',
	]) {
		expect({ path, place: appTabPlace(path) }).toEqual({
			path,
			place: { tab: 'me', landing: false },
		})
	}
})

test('a page in no tab marks none, and a prefix matches whole segments only', () => {
	expect(appTabPlace('/training/sessions/session-1')).toBeNull()
	expect(appTabPlace('/training/planner')).toBeNull()
	expect(appTabPlace('/libraryx')).toBeNull()
})

test('the first run carries no bar', () => {
	expect(showsTabBar('/start')).toBe(false)
	expect(showsTabBar('/start/niva')).toBe(false)
	expect(showsTabBar('/training/plan')).toBe(true)
})
