// Usage: node inspect-trace.mjs <trace.json> [n]
// Lists the event names (with self-ish durations) inside the n longest
// main-thread tasks of a trace, plus style-recalc element counts.
import fs from 'node:fs'

const events = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const n = Number(process.argv[3] ?? 2)
const tasks = events.filter((e) => e.name === 'RunTask' && e.ph === 'X')
const byTid = new Map()
for (const t of tasks) byTid.set(t.tid, (byTid.get(t.tid) ?? 0) + t.dur)
const main = [...byTid].sort((a, b) => b[1] - a[1])[0][0]
const long = tasks
	.filter((t) => t.tid === main)
	.sort((a, b) => b.dur - a.dur)
	.slice(0, n)
for (const task of long) {
	const inside = events.filter(
		(e) =>
			e.tid === main &&
			e.ph === 'X' &&
			e !== task &&
			e.ts >= task.ts &&
			e.ts + (e.dur ?? 0) <= task.ts + task.dur,
	)
	const agg = new Map()
	for (const e of inside) agg.set(e.name, (agg.get(e.name) ?? 0) + (e.dur ?? 0))
	console.log(`task ${Math.round(task.dur / 1000)} ms at ${Math.round((task.ts - long[0].ts) / 1000)}`)
	for (const [k, v] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 14))
		console.log(`  ${(v / 1000).toFixed(1).padStart(7)}  ${k}`)
	for (const e of inside.filter((e) => e.name === 'UpdateLayoutTree'))
		console.log(
			'   style',
			Math.round(e.dur / 1000),
			'ms elements',
			e.args?.elementCount ?? e.args?.data?.elementCount ?? '?',
		)
	for (const e of inside.filter((e) => e.name === 'FunctionCall' || e.name === 'EventDispatch' || e.name === 'TimerFire'))
		if (e.dur > 5000)
			console.log('   ', e.name, Math.round(e.dur / 1000), JSON.stringify(e.args?.data ?? {}).slice(0, 160))
}
