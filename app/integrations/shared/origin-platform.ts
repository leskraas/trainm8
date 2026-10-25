/**
 * The **Origin Platform** (ADR 0096 §1): the platform an activity was recorded
 * into or first synced to, whose terms govern the data (ADR 0098). Not the
 * transport (`externalProvider`): a Garmin run that came down the
 * Intervals.icu pipe is `garmin`, and stays `garmin` the day the pipe closes.
 *
 * A lowercase string, not a Prisma enum (ADR 0014). `unknown` is the default
 * and the honest answer when a source does not say.
 *
 * The backfill in `prisma/migrations/*_every_import_records_its_origin_platform`
 * applies the same rules in SQL; `origin-platform-backfill.server.test.ts`
 * holds the two to each other.
 */
export const ORIGIN_PLATFORMS = [
	'garmin',
	'polar',
	'suunto',
	'coros',
	'wahoo',
	'strava',
	'zwift',
	'apple-health',
	'health-connect',
	'intervalsicu',
	'upload',
	'unknown',
] as const

export type OriginPlatform = (typeof ORIGIN_PLATFORMS)[number]

export function isOriginPlatform(value: string): value is OriginPlatform {
	return (ORIGIN_PLATFORMS as readonly string[]).includes(value)
}

/**
 * A stored `originPlatform` (a plain string column) as an Origin Platform: a
 * value this code does not know reads as `unknown`, which has no rule.
 */
export function originPlatformOf(value: string): OriginPlatform {
	return isOriginPlatform(value) ? value : 'unknown'
}

/**
 * Intervals.icu's `source` values that name a vendor, and its own (an
 * activity uploaded or entered on Intervals.icu itself). Anything else —
 * `OAUTH_CLIENT`, `DROPBOX`, a value added after this was written — is
 * `unknown` rather than a guess.
 */
const INTERVALSICU_SOURCES: Record<string, OriginPlatform> = {
	GARMIN_CONNECT: 'garmin',
	POLAR: 'polar',
	SUUNTO: 'suunto',
	COROS: 'coros',
	WAHOO: 'wahoo',
	ZWIFT: 'zwift',
	STRAVA: 'strava',
	UPLOAD: 'intervalsicu',
	MANUAL: 'intervalsicu',
}

/**
 * The device name as display text: trimmed, and null when there is none. It
 * is never a key and never what the gate reads (ADR 0096 §1).
 */
export function normalizeDeviceName(
	deviceName: string | null | undefined,
): string | null {
	const trimmed = deviceName?.trim()
	return trimmed ? trimmed : null
}

/**
 * Whether a device name says Garmin. Intervals.icu's developer gave this as
 * the test for its §1.1 attribution duty: `device_name` "will contain
 * (ignoring case) 'garmin'". Over-attributing a hand-uploaded Garmin file is
 * harmless; under-attributing is a terms breach.
 */
export function isGarminDevice(deviceName: string | null | undefined) {
	return /garmin/i.test(deviceName ?? '')
}

/** An Intervals.icu activity's Origin Platform: `source`, then the override. */
export function intervalsIcuOriginPlatform({
	source,
	deviceName,
}: {
	source: string | null | undefined
	deviceName: string | null | undefined
}): OriginPlatform {
	if (isGarminDevice(deviceName)) return 'garmin'
	return INTERVALSICU_SOURCES[source?.trim().toUpperCase() ?? ''] ?? 'unknown'
}

/**
 * The Origin Platform a transport implies when the transport is the whole
 * story: Strava data is Strava's, a file the athlete gave trainm8 is an
 * `upload` whatever device wrote it, a direct Garmin import is Garmin's.
 * Intervals.icu is a bridge and says nothing on its own (`unknown`); its
 * ingest reads the activity (`intervalsIcuOriginPlatform`).
 */
export function originPlatformForTransport(
	externalProvider: string,
): OriginPlatform {
	switch (externalProvider) {
		case 'strava':
			return 'strava'
		case 'manual':
			return 'upload'
		case 'garmin':
			return 'garmin'
		// A direct vendor's data is that vendor's (ADR 0096 §1, #555).
		case 'polar':
			return 'polar'
		default:
			return 'unknown'
	}
}
