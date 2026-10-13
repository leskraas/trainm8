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

Encrypts the provider credentials trainm8 stores (`AccountConnection.accessToken`
and `refreshToken`: Strava OAuth tokens and Intervals.icu API keys) with
AES-256-GCM (#548, `app/utils/credential-crypto.server.ts`). Any later stored
secret (Better Auth's OAuth tables, Polar tokens) uses the same key.

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
- **Existing rows:** a one-shot job (`app/utils/credential-backfill.server.ts`)
  encrypts the tokens stored before #548. It is enqueued on the first boot and
  runs 30 minutes later, so an automatic rollback of a failed deploy never meets
  ciphertext. Until then, plaintext rows read through unchanged.
- **Do not roll back past that release once the job has run.** Older code would
  send ciphertext to Strava and Intervals.icu and every sync would fail. Fix
  forward instead.
- **Rotation:** prepend a new key and redeploy
  (`fly secrets set CREDENTIALS_ENCRYPTION_KEY="<new>,<old>"`). Rows written
  from then on use the new key; old rows still decrypt with the old one. Do not
  drop the old key while any row may still be under it (a token is re-encrypted
  only when it is written again, which an Intervals.icu key never is).
