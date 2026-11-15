import { type Capability } from './define.ts'

/** Session, logging, adaptation and undo capabilities. */
export const SESSION_CAPABILITIES = {} satisfies Record<string, Capability<any, any>>
