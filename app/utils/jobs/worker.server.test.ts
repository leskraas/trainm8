import { execFileSync } from 'node:child_process'
import { expect, test } from 'vitest'

// The production server loads the job worker with Node's own module loader,
// which evaluates an import cycle in a different order from Vitest. A cycle
// that reaches a module before its constants are initialised crashes the
// server at boot (`Cannot access 'EFFORT_WORDS' before initialization`, #638)
// while every unit test still passes, so load it the way the server does.
test('the job worker loads under plain Node, as the server loads it', () => {
	const output = execFileSync(
		process.execPath,
		[
			'--no-warnings',
			'--input-type=module',
			'-e',
			"await import('./app/utils/jobs/worker.server.ts'); console.log('loaded')",
		],
		{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 },
	)
	expect(output.trim()).toBe('loaded')
}, 90_000)
