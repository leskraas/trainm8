import { type Capability } from './define.ts'

/** Read capabilities (owned by the reads engine work). */
export const READ_CAPABILITIES = {} satisfies Record<string, Capability<any, any>>
