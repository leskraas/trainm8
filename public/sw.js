// Minimal service worker: its presence (plus the web manifest) is what makes
// Trainm8 installable as a mobile PWA, which in turn activates the
// `share_target` declared in site.webmanifest. Shared files POST directly to
// /imports/share-target — no fetch interception is needed, so this worker
// deliberately registers no fetch handler (network behavior is unchanged).
self.addEventListener('install', () => {
	self.skipWaiting()
})

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim())
})
