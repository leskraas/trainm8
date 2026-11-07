# Probe: MET Norway Locationforecast 2.0 (2026-11-07)

    curl -A "trainm8-explore/0.1 github.com/leskraas/trainm8" \
      "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=59.91&lon=10.75"

- HTTP 200, no API key, JSON 37 KB, `expires` and `last-modified` headers set
  (cache and send If-Modified-Since, as MET's terms ask; a User-Agent is required).
- 87 timeseries entries, 2026-11-07T10:00Z .. 2026-11-17T06:00Z: hourly first,
  then 6-hourly; about 10 days ahead, which covers I dag's current week.
- Each entry: air_temperature, wind_speed, wind_from_direction, humidity, cloud,
  plus next_1/6/12_hours symbol_code and precipitation_amount.
