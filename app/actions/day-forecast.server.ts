/**
 * A **Day Forecast** as it crosses to a model (ADR 0115 §5): one Reading of
 * the whole forecast step, since its symbol, temperature and precipitation
 * come from one step and stand or fall together. `symbol` is trainm8's own
 * enum and `label` the word the today card shows, never MET's `symbol_code`.
 *
 * Built from the same read as the card (`readAthleteForecast`), so an
 * Assistant sees the weather the athlete sees. An available forecast owes
 * MET Norway its credit; its binding set is empty (a forecast is no import).
 */
import { z } from 'zod/v4'
import { WEATHER_LABELS } from '#app/utils/labels.ts'
import { type AthleteForecast } from '#app/utils/weather/athlete-forecast.server.ts'
import { WEATHER_SYMBOLS } from '#app/utils/weather/symbol.ts'
import {
	reading,
	readingSchema,
	type ReadingContext,
	unavailable,
} from './reading.ts'

export const DayForecastReadingSchema = () =>
	readingSchema(
		z.object({
			/** The Forecast Hour, an ISO instant in UTC. */
			at: z.string(),
			symbol: z.enum(WEATHER_SYMBOLS),
			/** The athlete's word for the symbol (`labels.ts`). */
			label: z.string(),
			temperatureC: z.number(),
			/** Per hour at the Forecast Hour (a six-hour step's amount spread over its hours). */
			precipitationMm: z.number(),
		}),
	)

export function dayForecastReading(
	forecast: AthleteForecast | null,
	dayKey: string,
	ctx: ReadingContext,
) {
	const day = forecast?.get(dayKey)
	if (!forecast) return reading(unavailable('no-home-place'), [], ctx)
	if (!day) return reading(unavailable('forecast-unavailable'), [], ctx)
	if ('reason' in day) return reading(unavailable(day.reason), [], ctx)
	ctx.credit({ platform: 'met-norway', text: WEATHER_LABELS.credit })
	return reading(
		{
			at: day.at,
			symbol: day.symbol,
			label: WEATHER_LABELS.symbol[day.symbol],
			temperatureC: day.temperatureC,
			precipitationMm: day.precipitationMm,
		},
		[],
		ctx,
	)
}
