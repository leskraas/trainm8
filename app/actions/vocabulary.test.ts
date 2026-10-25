import { expectTypeOf, test } from 'vitest'
import { type UnavailableReason as VolumeUnavailableReason } from '#app/utils/plan-outline/volume-conversion.ts'
import { type VOLUME_CONVERSION_REASONS } from './vocabulary.ts'

// `VOLUME_CONVERSION_REASONS` restates the volume conversion's reasons as a
// list (ADR 0092 §6: the local vocabularies are subsets of the one
// `UnavailableReason`). A reason added on either side fails `typecheck` here.

test('the volume conversion’s reasons and the registry’s list are the same set', () => {
	expectTypeOf<
		(typeof VOLUME_CONVERSION_REASONS)[number]
	>().toEqualTypeOf<VolumeUnavailableReason>()
})
