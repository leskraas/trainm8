import { runVariant } from './run.ts'
import { V3 } from './final.ts'

type Cell = { pf: number; rm: number; fm: number; res: Array<{ id: string; kind: string; high: boolean; exact: boolean; title: string }> }
const cells: Cell[] = []
for (const pf of [0.25, 0.5, 1, 2, 4])
	for (const rm of [0.05, 0.1, 0.15, 0.2, 0.3])
		for (const fm of [0, 0.04, 0.08, 0.15]) {
			const rows = runVariant({ name: '', profile: 'label-power', laps: 'none', opts: { ...V3, penaltyFactor: pf, repMargin: rm, flankMargin: fm } })
			cells.push({
				pf, rm, fm,
				res: rows.map((r) => ({ id: r.a.id, title: r.a.title, kind: r.a.label.kind, high: r.s.prediction.structured && r.s.prediction.grade === 'high', exact: !!r.s.reps && r.s.reps.predicted === r.s.reps.truth })),
			})
		}
const utility = (c: Cell, keep: (x: Cell['res'][0]) => boolean) => {
	const xs = c.res.filter(keep)
	const tp = xs.filter((x) => x.kind === 'structured' && x.high).length
	const fp = xs.filter((x) => x.kind === 'unstructured' && x.high).length
	const ex = xs.filter((x) => x.kind === 'structured' && x.exact).length
	return tp - 3 * fp + 0.1 * ex
}
// conservative tie-break: larger penalty, larger margins
const pick = (keep: (x: Cell['res'][0]) => boolean) =>
	[...cells].sort((a, b) => utility(b, keep) - utility(a, keep) || b.pf - a.pf || b.rm - a.rm || b.fm - a.fm)[0]!

const ids = cells[0]!.res.filter((x) => x.kind !== 'unlabelled')
let tp = 0, fp = 0, ex = 0
const chosen: string[] = []
for (const held of ids) {
	const c = pick((x) => x.id !== held.id && x.kind !== 'unlabelled')
	const r = c.res.find((x) => x.id === held.id)!
	if (held.kind === 'structured') {
		if (r.high) tp++
		if (r.exact) ex++
		chosen.push(`${held.title}: pf=${c.pf} rm=${c.rm} fm=${c.fm} → ${r.high ? 'high' : 'miss'}${r.exact ? ' exact' : ''}`)
	} else if (r.high) {
		fp++
		chosen.push(`NEG ${held.id}: claimed at pf=${c.pf} rm=${c.rm} fm=${c.fm}`)
	}
}
console.log(`LOO over ${cells.length} settings: high recall ${tp}/9, false claims at high ${fp}/35, reps exact ${ex}/9`)
console.log(chosen.join('\n'))

const is4515 = (t: string) => /45\s*\/\s*15/.test(t)
const c = pick((x) => x.kind !== 'unlabelled' && !(x.kind === 'structured' && is4515(x.title)))
const ho = c.res.filter((x) => x.kind === 'structured' && is4515(x.title))
console.log(`\nHoldout: tuned on 10x3 + 5x6 + 35 negatives → pf=${c.pf} rm=${c.rm} fm=${c.fm}; on the 7 held-out 45/15: high ${ho.filter((x) => x.high).length}/7, exact ${ho.filter((x) => x.exact).length}/7; FP at high ${c.res.filter((x) => x.kind === 'unstructured' && x.high).length}/35`)
// how many settings tie at the top on that tuning set
const top = utility(c, (x) => x.kind !== 'unlabelled' && !(x.kind === 'structured' && is4515(x.title)))
const ties = cells.filter((k) => utility(k, (x) => x.kind !== 'unlabelled' && !(x.kind === 'structured' && is4515(x.title))) === top)
console.log(`${ties.length} settings tie on the tuning set; on 45/15 they give high: ${ties.map((k) => k.res.filter((x) => x.kind === 'structured' && is4515(x.title) && x.high).length).join(',')}`)
// plateau: fraction of all settings with 0 FP at high and ≥8/9
const good = cells.filter((k) => k.res.filter((x) => x.kind === 'unstructured' && x.high).length === 0 && k.res.filter((x) => x.kind === 'structured' && x.high).length >= 8)
console.log(`\nPlateau: ${good.length}/${cells.length} settings give 0 false claims at high and ≥8/9 recall:`)
const by = (f: (k: Cell) => number) => [...new Set(cells.map(f))].map((v) => `${v}:${good.filter((k) => f(k) === v).length}/${cells.filter((k) => f(k) === v).length}`).join(' ')
console.log('pf', by((k) => k.pf))
console.log('rm', by((k) => k.rm))
console.log('fm', by((k) => k.fm))
