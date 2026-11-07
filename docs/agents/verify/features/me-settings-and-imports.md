# Meg: profile, settings, integrations and imports

The _Meg_ tab: the athlete's profile and levels, account settings, connections
to Strava and Intervals.icu, and file imports. Specs to copy from:
`tests/e2e/settings-profile.test.ts`, `tests/e2e/imports.test.ts`,
`tests/e2e/onboarding.test.ts`, `tests/e2e/2fa.test.ts`,
`tests/e2e/passkey.test.ts`.

## Sub-features

- `/me`: the athlete's page, with links into settings.
- Account at `/settings/profile`: name and username (_Lagre kontoen_), password
  (_Passord_, then _Bytt passord_), profile photo (_Bytt profilbilde_), 2FA and
  passkeys.
- Training settings and level: `/settings/training`, `/settings/level`.
- _Løpsresultater_ at `/settings/training/resultater`: typed results (with
  _Slett_) and Events' results (_Målt av klokka_, the platform's credit, the
  Event's name as a link, no _Slett_); _I bruk_ where a typed and an Event's
  result share a distance and a day (#670).
- Integrations at `/settings/integrations`: connect Strava or Intervals.icu
  (mocked under `MOCKS=true`) and sync.
- File import at `/imports/upload` (FIT, TCX; fixtures in `tests/fixtures/fit`,
  `tests/fixtures/tcx`, `tests/fixtures/upload`), and the question an import
  asks on the timeline (_Hva var dette?_).

## How to get to it

Log in, then the _Meg_ link in `navigation` _Hovedmeny_ (`/me`). Pages under
`/settings/…` and `/imports/upload` keep _Meg_ current in the tab bar.

## Driving it with Playwright

```js
await page.goto(`${BASE}/settings/profile`)
const name = page.getByRole('textbox', { name: /^navn/i })
await hydrated(name)
await name.fill('Kody Verify')
await page.getByRole('button', { name: /^lagre kontoen/i }).click()
// import a file:
await page.goto(`${BASE}/imports/upload`)
await page
	.locator('input[type="file"]')
	.setInputFiles('/path/to/trainm8/tests/fixtures/fit/<file>.fit')
```

## Gotchas

- Changing kody's username or password breaks the next login with
  `kody`/`kodylovesyou`. Do it last, or on a user you signed up through
  `/signup`, then re-seed.
- Sign-up and password reset send email through Resend, which is mocked: the
  code is printed in `$VERIFY_DIR/server.log`, not delivered.
- Intervals.icu connects with the mock's key only when the server runs with
  `MOCK_INTERVALSICU=true` (the Playwright config sets it; `npm run dev` alone
  does not).
- Strava is visible only while `STRAVA_CLIENT_ID` is set (it is, as a `MOCK_`
  value, in `.env.example`).
