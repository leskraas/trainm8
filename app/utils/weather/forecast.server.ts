/**
 * **Day Forecast** from MET Norway's Locationforecast 2.0 (`compact`), ADR
 * 0112 §1 and §3. One function, {@link readDayForecasts}: a point and the
 * days' **Forecast Hours** in, per day a Day Forecast or the reason there is
 * none out. One adapter behind it (MET) and no provider interface: swapping
 * the source means rewriting the inside of this file (ADR 0014's rule).
 *
 * - **Server only.** Called with an identifying `User-Agent` (MET's terms
 *   require one), so the browser's CSP is unchanged and no athlete's IP
 *   address, name or account reaches MET: only the rounded point does.
 * - **Cached by the point alone** (`toFixed(2)`, no user), fresh until MET's
 *   `Expires`, refreshed with `If-Modified-Since`, and served stale while it
 *   refreshes, for at most 24 hours past `Expires`.
 * - **Never a wait, never an error.** A fetch is cut at 2 seconds; when MET
 *   errors or is slow the caller gets a stale forecast or the reason
 *   `forecast-unavailable`, never a throw. Weather is an aid on I dag, never
 *   why the page is slow or broken.
 * - **One step per day.** A day's symbol, temperature and precipitation come
 *   from the one forecast step that covers its hour (hourly for about 60
 *   hours, then 6-hourly), so its figures never mix steps.
 */
import {
	cachified,
	type CacheEntry,
	type CachifiedOptions,
} from '@epic-web/cachified'
import { z } from 'zod/v4'
import { cache } from '#app/utils/cache.server.ts'
import { type GeoPoint, roundedPoint } from '#app/utils/home-place.ts'
import { OUTBOUND_USER_AGENT } from '#app/utils/outbound-user-agent.ts'
import { readMetSymbol, type WeatherSymbol } from './symbol.ts'

export const MET_FORECAST_URL =
	'https://api.met.no/weatherapi/locationforecast/2.0/compact'

/** How long I dag waits for MET when nothing usable is cached. */
export const FORECAST_TIMEOUT_MS = 2_000
/** How long past `Expires` a forecast is still served while it refreshes. */
export const FORECAST_STALE_MS = 24 * 60 * 60 * 1000
/** When MET sends no usable `Expires`: its documented typical half hour. */
const DEFAULT_FRESH_MS = 30 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/** One day's forecast at its Forecast Hour, from one forecast step. */
export type DayForecast = {
	/** The Forecast Hour, an ISO instant in UTC. */
	at: string
	symbol: WeatherSymbol
	/** Night or polar twilight at that step: the glyph is a moon. */
	night: boolean
	temperatureC: number
	/** Over the step's own period (one hour, or six further out). */
	precipitationMm: number
}

/** Why a day has no forecast, from this module's side. */
export type NoForecast = 'beyond-forecast' | 'forecast-unavailable'

export type DayForecastResult = DayForecast | { reason: NoForecast }

/**
 * The forecast for each day's Forecast Hour at `point`. Never throws: a MET
 * that errors, is slow or answers nonsense gives `forecast-unavailable` for
 * every day (or a stale forecast where one is cached).
 */
export async function readDayForecasts(
	point: GeoPoint,
	hours: ReadonlyMap<string, Date>,
): Promise<Map<string, DayForecastResult>> {
	const results = new Map<string, DayForecastResult>()
	if (hours.size === 0) return results
	const forecast = await readForecast(roundedPoint(point)).catch(() => null)
	for (const [dayKey, hour] of hours) {
		results.set(
			dayKey,
			forecast
				? stepAt(forecast.steps, hour)
				: { reason: 'forecast-unavailable' },
		)
	}
	return results
}

// ── the cached forecast ───────────────────────────────────────────────────

/** What is cached per point: MET's steps, trimmed to what a Day Forecast reads. */
const StoredStepSchema = z.object({
	/** The step's start, ISO UTC. */
	time: z.string(),
	temperatureC: z.number(),
	/** The step's period in hours: 1 or 6 (12 carries no precipitation). */
	hours: z.number(),
	symbolCode: z.string(),
	precipitationMm: z.number(),
})
type StoredStep = z.infer<typeof StoredStepSchema>

const StoredForecastSchema = z.object({
	steps: z.array(StoredStepSchema),
	/** MET's `Last-Modified`, sent back as `If-Modified-Since`. */
	lastModified: z.string().nullable(),
})
type StoredForecast = z.infer<typeof StoredForecastSchema>

export function forecastCacheKey(point: GeoPoint): string {
	const { latitude, longitude } = roundedPoint(point)
	return `met-forecast:${latitude.toFixed(2)},${longitude.toFixed(2)}`
}

async function readForecast(point: GeoPoint): Promise<StoredForecast> {
	const key = forecastCacheKey(point)
	const options: CachifiedOptions<StoredForecast> = {
		key,
		cache,
		// Overwritten from MET's `Expires` on every fetch below.
		ttl: DEFAULT_FRESH_MS,
		staleWhileRevalidate: FORECAST_STALE_MS,
		checkValue: StoredForecastSchema,
		async getFreshValue(context) {
			const previous = await cachedForecast(key)
			const response = await fetch(metUrl(point), {
				headers: {
					'User-Agent': OUTBOUND_USER_AGENT,
					Accept: 'application/json',
					...(previous?.lastModified
						? { 'If-Modified-Since': previous.lastModified }
						: {}),
				},
				signal: AbortSignal.timeout(FORECAST_TIMEOUT_MS),
			})
			context.metadata.ttl = freshFor(response.headers.get('expires'))
			if (response.status === 304 && previous) return previous
			if (!response.ok) {
				throw new Error(`MET Locationforecast answered ${response.status}`)
			}
			return {
				steps: readSteps(await response.json()),
				lastModified: response.headers.get('last-modified'),
			}
		},
	}
	return cachified(options)
}

async function cachedForecast(key: string): Promise<StoredForecast | null> {
	const entry = (await cache.get(key)) as CacheEntry<unknown> | null
	const parsed = StoredForecastSchema.safeParse(entry?.value)
	return parsed.success ? parsed.data : null
}

function metUrl({ latitude, longitude }: GeoPoint): string {
	const url = new URL(MET_FORECAST_URL)
	url.searchParams.set('lat', latitude.toFixed(2))
	url.searchParams.set('lon', longitude.toFixed(2))
	return url.toString()
}

/** Milliseconds until MET's `Expires`, never negative. */
function freshFor(expires: string | null): number {
	const at = expires ? Date.parse(expires) : Number.NaN
	if (Number.isNaN(at)) return DEFAULT_FRESH_MS
	return Math.max(0, at - Date.now())
}

// ── MET's response, read once ─────────────────────────────────────────────

const PeriodSchema = z
	.object({
		summary: z.object({ symbol_code: z.string() }).optional(),
		details: z
			.object({ precipitation_amount: z.number().optional() })
			.optional(),
	})
	.optional()

const MetResponseSchema = z.object({
	properties: z.object({
		timeseries: z.array(
			z.object({
				time: z.string(),
				data: z.object({
					instant: z.object({
						details: z.object({ air_temperature: z.number().optional() }),
					}),
					next_1_hours: PeriodSchema,
					next_6_hours: PeriodSchema,
				}),
			}),
		),
	}),
})

/**
 * MET's timeseries as the steps a Day Forecast can come from: a step needs a
 * temperature, a symbol and a precipitation over a period it states. The
 * hourly period wins where both are given; a step with only a 12-hour period
 * (the far end) states no precipitation, so it is not a step here.
 */
function readSteps(json: unknown): StoredStep[] {
	const parsed = MetResponseSchema.parse(json)
	const steps: StoredStep[] = []
	for (const entry of parsed.properties.timeseries) {
		const temperatureC = entry.data.instant.details.air_temperature
		if (temperatureC == null) continue
		for (const [hours, period] of [
			[1, entry.data.next_1_hours],
			[6, entry.data.next_6_hours],
		] as const) {
			const symbolCode = period?.summary?.symbol_code
			const precipitationMm = period?.details?.precipitation_amount
			if (symbolCode && precipitationMm != null) {
				steps.push({
					time: entry.time,
					temperatureC,
					hours,
					symbolCode,
					precipitationMm,
				})
				break
			}
		}
	}
	return steps
}

/**
 * The one step covering `hour`: the latest step that starts at or before it,
 * if its period reaches it. Past the last step's period is beyond the
 * forecast; a gap (or an hour before the first step) is a forecast that says
 * nothing about it.
 */
function stepAt(steps: readonly StoredStep[], hour: Date): DayForecastResult {
	const at = hour.getTime()
	let covering: StoredStep | null = null
	for (const step of steps) {
		if (Date.parse(step.time) <= at) covering = step
		else break
	}
	const last = steps.at(-1)
	if (!covering || !last) return { reason: 'forecast-unavailable' }
	if (at >= Date.parse(covering.time) + covering.hours * HOUR_MS) {
		return {
			reason: covering === last ? 'beyond-forecast' : 'forecast-unavailable',
		}
	}
	const read = readMetSymbol(covering.symbolCode)
	if (!read) return { reason: 'forecast-unavailable' }
	return {
		at: hour.toISOString(),
		symbol: read.symbol,
		night: read.night,
		temperatureC: covering.temperatureC,
		precipitationMm: covering.precipitationMm,
	}
}
