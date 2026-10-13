/**
 * What Intervals.icu's activity list returns for an activity it got from
 * Strava. The API "cannot supply Strava activities", so the row is a stub: no
 * type, no duration and no distance, only an id, the athlete, a local start
 * time, `source: "STRAVA"` and a `_note`.
 *
 * Provenance: this shape comes from Intervals.icu forum posts and the
 * developer's own replies (docs/research/watch-data-trainm8-ingest.md §6.2,
 * [ICU-STUB], [ICU-NOSTRAVA]). It has NOT been captured from a live key: no
 * Intervals.icu key was available when this fixture was written (#544).
 * Replace it with a captured body when one is.
 */
export const intervalsIcuStravaStub = {
	id: 'i77001',
	icu_athlete_id: 'i9876543',
	start_date_local: '2026-05-21T07:30:00',
	source: 'STRAVA',
	_note: 'STRAVA activities are not available via the API',
}
