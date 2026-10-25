// What "Slett kontoen din" promises (ADR 0081, #641 review UI-1). The copy may
// promise only what `deleteAccount` deletes: the account, and with it the
// athlete's Workouts, Workout Sessions and Plan Outlines. Some things outlive
// it, and the copy must not claim them:
//
// - the profile image object in Tigris (only the `UserImage` row cascades, #639 H32);
// - Custom Exercises, whose creator is set to null (H27);
// - reports the athlete filed, whose reporter is set to null (moderation evidence, H24).
//
// So no blanket "alle dataene" / "alt annet", and no word for what survives.

import { expect, test } from 'vitest'
import { MEG_PROFILE_LABELS } from './labels.ts'

const L = MEG_PROFILE_LABELS
const deleteCopy = [
	L.deleteData,
	L.deleteDataDetail,
	L.deleting,
	L.deletedTitle,
	L.deletedBody,
]

test('the delete copy names the account and the training it deletes', () => {
	expect(L.deleteData).toBe('Slett kontoen din')
	expect(L.deleteDataDetail).toBe(
		'Kontoen, øktene og planene dine slettes for godt. Det kan ikke angres.',
	)
	expect(L.deletedTitle).toBe('Kontoen er slettet')
	expect(L.deletedBody).toBe('Kontoen, øktene og planene dine er slettet.')
})

test('the delete copy promises nothing that survives the erasure', () => {
	for (const line of deleteCopy) {
		// A blanket promise covers the image, the exercises and the reports.
		expect(line).not.toMatch(/(^|\s)(alt|alle|dataene)(\s|$|[.,])/i)
		// Nor may it name one of them.
		expect(line).not.toMatch(/bilde|øvelse|rapport/i)
	}
})
