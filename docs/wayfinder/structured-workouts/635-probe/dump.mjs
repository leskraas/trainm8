import { Decoder, Stream } from '@garmin/fitsdk'
import fs from 'node:fs'
const f = process.argv[2]
const d = new Decoder(Stream.fromBuffer(fs.readFileSync(f)))
const { messages, errors } = d.read({ convertTypesToStrings: true, expandComponents: true, mergeHeartRates: false, includeUnknownData: false })
const out = {}
for (const [k, v] of Object.entries(messages)) out[k] = v
fs.writeFileSync(process.argv[3], JSON.stringify({ errors: errors.map(String), counts: Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v.length])), messages: out }, (k, v) => typeof v === 'bigint' ? Number(v) : v))
console.log(f.split('/').pop(), JSON.stringify(Object.fromEntries(Object.entries(messages).map(([k, v]) => [k, v.length]))), errors.length)
