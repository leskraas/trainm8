# Secrets

Managing secrets in the Epic Stack is done using environment variables and the
`fly secrets` command.

> **Warning**: It is very important that you do NOT hard code any secrets in the
> source code. Even if your app source is not public, there are a lot of reasons
> this is dangerous and in the epic stack we default to creating source maps
> which will reveal your hard coded secrets to the public. Read more about this
> in [the source map decision document](./decisions/016-source-maps.md).

## Local development

When you need to create a new secret, it's best to add a line to your
`.env.example` file so folks know that secret is necessary. The value you put in
here should be not real because this file is committed to the repository.

To keep everything in line with the [guiding principle](./guiding-principles.md)
of "Offline Development," you should also strive make it so whatever service
you're interacting with can be mocked out using MSW in the `test/mocks`
directory.

You can also put the real value of the secret in `.env` which is `.gitignore`d
so you can interact with the real service if you need to during development.

## Production secrets

To publish a secret to your production and staging applications, you can use the
`fly secrets set` command. For example, if you were integrating with the `tito`
API, to set the `TITO_API_SECRET` secret, you would run the following command:

```sh
fly secrets set TITO_API_SECRET=some_secret_value
fly secrets set TITO_API_SECRET=some_secret_value --app [YOUR_STAGING_APP_NAME]
```

This will redeploy your app with that environment variable set.

## Required production secrets in this app

Beyond the Epic Stack's own (`SESSION_SECRET`, `HONEYPOT_SECRET`, see
[deployment](./deployment.md)):

### `CREDENTIALS_ENCRYPTION_KEY`

Encrypts the provider credentials trainm8 stores
(`AccountConnection.accessToken` and `refreshToken`: Strava OAuth tokens and
Intervals.icu API keys) with AES-256-GCM (#548,
`app/utils/credential-crypto.server.ts`). Any later stored secret (Better Auth's
OAuth tables, Polar tokens) uses the same key.

- **Format:** one or more base64-encoded 32-byte keys, comma-separated. The
  first key encrypts; every key is tried when decrypting.
- **Generate and set it once, before deploying the release that introduced it:**

  ```sh
  fly secrets set CREDENTIALS_ENCRYPTION_KEY="$(openssl rand -base64 32)" --app trainm8-085d
  ```

  Keep a copy in the password manager. **Losing the key loses every stored
  connection**: athletes would have to reconnect Strava and re-enter their
  Intervals.icu key.

- **If it is missing, or is the development key from `.env.example`:** the
  release refuses to boot (`app/utils/env.server.ts`). The new machines fail
  their health check, Fly keeps the previous release serving, and no row is
  touched.
- **New writes are encrypted from the first boot.** Every connect, reconnect and
  Strava token refresh on the new release stores ciphertext at once; only the
  rows that are not written again wait for the backfill.
- **Existing rows:** a one-shot job (`app/utils/credential-backfill.server.ts`)
  encrypts the tokens stored before #548. It is enqueued on the first boot and
  runs 30 minutes later. Until then, plaintext rows read through unchanged. The
  delay only keeps the untouched rows readable to older code; it does not make a
  rollback safe.
- **Do not roll back past that release once it has served traffic.** Older code
  would send the ciphertext of every connection written since (a new connect, a
  refreshed Strava token, and after the backfill every row) to Strava and
  Intervals.icu, and those syncs would fail until the athlete reconnects. Fix
  forward instead.
- **A row no key can read** (a key dropped too early, a tampered value) reads as
  needing a reconnect: the hub asks the athlete to reconnect and the row's
  status becomes `error`. The other connections are unaffected.
- **Rotation:** prepend a new key and redeploy
  (`fly secrets set CREDENTIALS_ENCRYPTION_KEY="<new>,<old>"`). Rows written
  from then on use the new key; old rows still decrypt with the old one. Do not
  drop the old key while any row may still be under it (a token is re-encrypted
  only when it is written again, which an Intervals.icu key never is).

### `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, `POLAR_REDIRECT_URI`, `POLAR_WEBHOOK_SECRET`

Polar AccessLink (#555, ADR 0108). **Optional:** until all three client values
are set, nothing about Polar is offered, and the webhook route answers 503 until
`POLAR_WEBHOOK_SECRET` is set.

1. Register a client under the company's Polar Flow account at
   https://admin.polaraccesslink.com (self-serve). Redirect URL:
   `https://<host>/integrations/polar/callback`.
2. `fly secrets set POLAR_CLIENT_ID=... POLAR_CLIENT_SECRET=... POLAR_REDIRECT_URI=https://<host>/integrations/polar/callback --app trainm8-085d`
3. Create the one webhook for the client (Basic auth with the client id and
   secret; Polar pings the URL, which must answer 200):

   ```sh
   curl -u "$POLAR_CLIENT_ID:$POLAR_CLIENT_SECRET" -H 'content-type: application/json' \
     -d '{"events":["EXERCISE"],"url":"https://<host>/webhook/polar"}' \
     https://www.polaraccesslink.com/v3/webhooks
   ```

   Save `data.signature_secret_key` from the answer at once: Polar never shows
   it again. `fly secrets set POLAR_WEBHOOK_SECRET=<it>`.

Locally, tests always mock Polar (`tests/mocks/polar.ts`); in `npm run dev` with
`MOCKS=true`, set `MOCK_POLAR=true` to mock it too.
