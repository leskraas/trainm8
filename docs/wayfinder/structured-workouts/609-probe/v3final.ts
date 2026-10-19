import { V2_OPTS, type Opts } from './v3.ts'
import { T } from './run.ts'
export const V3: Opts = { ...V2_OPTS, ...T, penaltyFactor: 0.5, medianWindow: 1, gate: 'contrast', minK: 3, requireFlanks: true, sustained: false, emit: 'every' }
