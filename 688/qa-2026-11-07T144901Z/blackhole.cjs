// QA harness: make MET Norway and Kartverket unreachable for this process only.
// BLACKHOLE_MODE=refuse -> 127.0.0.1 (nothing listens on 443: connection refused, an error)
// BLACKHOLE_MODE=hang   -> 10.255.255.1 (no answer: the request hangs until the caller's timeout)
const dns = require('dns')
const HOSTS = new Set(['api.met.no', 'ws.geonorge.no'])
const ip = process.env.BLACKHOLE_MODE === 'hang' ? '127.0.0.3' : '127.0.0.1'
const orig = dns.lookup
dns.lookup = function (host, opts, cb) {
  if (HOSTS.has(host)) {
    if (typeof opts === 'function') { cb = opts; opts = {} }
    if (opts && opts.all) return process.nextTick(cb, null, [{ address: ip, family: 4 }])
    return process.nextTick(cb, null, ip, 4)
  }
  return orig.apply(this, arguments)
}
