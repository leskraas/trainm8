import { HEADER, row, runVariant, summarize } from './run.ts'
import { V3 } from './v3final.ts'
console.log(HEADER)
for (const res of [0, 10, 15])
	for (const laps of ['none', 'untyped', 'typed'] as const) for (const lapsBoth of [false, true]) {
		if (lapsBoth && laps !== 'untyped') continue
		const v = { name: `v3 at ${res} s, laps=${laps}${lapsBoth ? ' + stream, best' : ''}`, profile: 'label-power', laps, opts: { ...V3, typedLaps: true, lapsBoth }, res: res || undefined }
		console.log(row(v.name, summarize(runVariant(v))))
	}
