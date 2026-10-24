// Count every global message number in the file, independent of the SDK's named messages.
import fs from 'node:fs'
const b = fs.readFileSync(process.argv[2]); const hs = b[0]; const dsz = b.readUInt32LE(4)
let p = hs; const end = hs + dsz; const defs = {}; const cnt = {}
while (p < end) {
  const h = b[p++]
  if (h & 0x80) { const l = (h >> 5) & 3; const d = defs[l]; cnt[d.g] = (cnt[d.g]||0)+1; p += d.size; continue }
  const local = h & 0xf
  if (h & 0x40) { const dev = h & 0x20; p++; const arch = b[p++]; const g = arch ? b.readUInt16BE(p) : b.readUInt16LE(p); p += 2; const n = b[p++]; let size = 0
    for (let i = 0; i < n; i++) { size += b[p+1]; p += 3 }
    if (dev) { const nd = b[p++]; for (let i = 0; i < nd; i++) { size += b[p+1]; p += 3 } }
    defs[local] = { g, size } } else { const d = defs[local]; cnt[d.g] = (cnt[d.g]||0)+1; p += d.size }
}
console.log(process.argv[2].split('/').pop(), JSON.stringify(cnt))
