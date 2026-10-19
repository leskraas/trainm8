import { readFileSync } from 'node:fs'
import { buildSegments } from '#app/utils/structure-detection/segments.ts'
import { resolveClassifier } from '#app/utils/structure-detection/classify.ts'
const corpus = JSON.parse(readFileSync('tests/fixtures/detection/corpus.json', 'utf8'))
const id = process.argv[2]
const a = corpus.activities.find((x: any) => x.id === id)
const p = corpus.profiles.find((x: any) => x.name === 'label-power').profile
const cl = resolveClassifier('run', p, a.stream)!
const seg = buildSegments(a.stream, 'run', cl, undefined)!
console.log(a.title, JSON.stringify(a.label.work?.slice(0, 4)))
console.log(seg.segments.map((s) => `${s.startSec}-${s.endSec}(${s.durationSec}) ${Math.round(s.value)}`).join('\n'))
const w0 = a.label.work?.[0]?.startSec ?? 0
const i0 = a.stream.timeSec.findIndex((t: number) => t >= w0 - 30)
console.log(a.stream.timeSec.slice(i0, i0 + 40).map((t: number, j: number) => `${t}:${a.stream.power[i0 + j]}/${a.stream.pace[i0 + j]}`).join(' '))
