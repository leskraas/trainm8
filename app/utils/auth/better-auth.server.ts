import { betterAuth } from 'better-auth'
import { authOptions } from './options.server.ts'

/**
 * The Better Auth instance (ADR 0094 §1). Constructing it is what production
 * must never do before the cutover (ADR 0114 §1), so only the `/api/auth`
 * route, by dynamic `import()` after its production gate, and tests import
 * this file. `npx auth generate --config` reads it too.
 */
export const auth = betterAuth(authOptions)
