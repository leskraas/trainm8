-- Every import records its origin platform (ADR 0096 §1, #546).
--
-- `originPlatform` is the platform whose terms govern the activity (ADR 0098),
-- not the transport in `externalProvider`; `deviceName` is display text for
-- "Garmin [device model]"; `fitFileKey` stays null for history until the
-- original FITs are harvested (#547).
ALTER TABLE "ActivityImport" ADD COLUMN "originPlatform" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "ActivityImport" ADD COLUMN "deviceName" TEXT;
ALTER TABLE "ActivityImport" ADD COLUMN "fitFileKey" TEXT;

-- backfill
--
-- From what each row already holds, with no API calls. The same rules as
-- `app/integrations/shared/origin-platform.ts`; the backfill test runs the
-- statements below this marker against rows of each kind and holds the two to
-- each other. Every statement may run again without changing its answer.
--
-- A transport that is the whole story: Strava is Strava's, a file the athlete
-- gave trainm8 is an upload whatever wrote it, a direct Garmin import Garmin's.
UPDATE "ActivityImport" SET "originPlatform" = 'strava' WHERE "externalProvider" = 'strava';
UPDATE "ActivityImport" SET "originPlatform" = 'upload' WHERE "externalProvider" = 'manual';
UPDATE "ActivityImport" SET "originPlatform" = 'garmin' WHERE "externalProvider" = 'garmin';

-- Intervals.icu is a bridge: its stored payload (`.passthrough()`, so verbatim)
-- names the device and the source. The nested CASE keeps `json_extract` off a
-- payload that is not JSON, which would otherwise fail the whole migration.
UPDATE "ActivityImport"
SET "deviceName" = CASE
	WHEN json_valid("rawJson") THEN CASE
		WHEN json_type("rawJson", '$.device_name') = 'text'
			THEN NULLIF(TRIM(json_extract("rawJson", '$.device_name')), '')
		ELSE NULL
	END
	ELSE NULL
END
WHERE "externalProvider" = 'intervalsicu';

-- `source` maps to its vendor, Intervals.icu's own values to `intervalsicu`,
-- anything else to `unknown` — then a device name containing "garmin" (LIKE
-- ignores ASCII case) makes it Garmin whatever the source said.
UPDATE "ActivityImport"
SET "originPlatform" = CASE
	WHEN "deviceName" LIKE '%garmin%' THEN 'garmin'
	WHEN json_valid("rawJson") THEN CASE
		WHEN json_type("rawJson", '$.source') = 'text' THEN CASE UPPER(TRIM(json_extract("rawJson", '$.source')))
			WHEN 'GARMIN_CONNECT' THEN 'garmin'
			WHEN 'POLAR' THEN 'polar'
			WHEN 'SUUNTO' THEN 'suunto'
			WHEN 'COROS' THEN 'coros'
			WHEN 'WAHOO' THEN 'wahoo'
			WHEN 'ZWIFT' THEN 'zwift'
			WHEN 'STRAVA' THEN 'strava'
			WHEN 'UPLOAD' THEN 'intervalsicu'
			WHEN 'MANUAL' THEN 'intervalsicu'
			ELSE 'unknown'
		END
		ELSE 'unknown'
	END
	ELSE 'unknown'
END
WHERE "externalProvider" = 'intervalsicu';
