// Accepts TCP on 127.0.0.3:443 and never answers (a forecast service that does not respond).
const net = require('net'); const socks = []
net.createServer((s) => { socks.push(s); s.on('error', () => {}) }).listen(443, '127.0.0.3', () => console.log('hang server on 127.0.0.3:443'))
