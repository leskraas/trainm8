import { z } from 'zod'

/**
 * Intervals.icu-native API types and parse schemas. Private to the
 * Intervals.icu integration folder (ADR 0014) — nothing outside
 * `app/integrations/intervalsicu/` should import these; the rest of the app
 * speaks `ActivityImportInput` and the shared `AccountConnection` model.
 */

export const INTERVALSICU_PROVIDER = 'intervalsicu' as const

export const INTERVALSICU_API_BASE = 'https://intervals.icu/api/v1'

/**
 * The athlete-self endpoint: `athlete/0` resolves to whoever owns the API key,
 * which both validates the key and yields the external athlete id (ADR 0026).
 */
export const INTERVALSICU_ATHLETE_SELF_PATH = '/athlete/0'

/**
 * The athlete object returned by `GET /athlete/{id}`. Intervals.icu athlete
 * ids look like `i12345`; tolerate a bare number just in case.
 */
export const IntervalsIcuAthleteSchema = z.object({
	id: z.union([z.number(), z.string()]).transform((id) => String(id)),
	name: z.string().nullish(),
})
export type IntervalsIcuAthlete = z.infer<typeof IntervalsIcuAthleteSchema>
