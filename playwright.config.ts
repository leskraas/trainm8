import { existsSync } from 'node:fs'
import { defineConfig, devices, webkit } from '@playwright/test'
import 'dotenv/config'

const PORT = process.env.PORT || '3000'
export default defineConfig({
	testDir: './tests/e2e',
	timeout: 15 * 1000,
	expect: {
		timeout: 5 * 1000,
	},
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	// Two vCPUs on a hosted runner; the tests are written to run in parallel.
	workers: process.env.CI ? 2 : undefined,
	// A broken build fails everything; stop paying for retries of each test.
	maxFailures: process.env.CI ? 8 : undefined,
	reporter: 'html',
	use: {
		baseURL: `http://localhost:${PORT}/`,
		trace: 'on-first-retry',
	},

	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
		},
		// Safari has no scroll anchoring, so the reading position is held by
		// the app there (`ReadingHold`, ADR 0086 §4). Only the file that pins
		// it runs in WebKit as well (#503, ADR 0122): the rest of the suite
		// would double CI for no criterion. CI installs WebKit and always runs
		// it, so a missing browser fails there instead of skipping criterion 7's
		// WebKit half unseen; locally it runs wherever WebKit is installed
		// (`npm run test:e2e:install`).
		...(process.env.CI || existsSync(webkit.executablePath())
			? [
					{
						name: 'webkit',
						testMatch: 'home-reading-position.test.ts',
						use: {
							...devices['Desktop Safari'],
						},
					},
				]
			: []),
	],

	webServer: {
		command: process.env.CI ? 'npm run start:mocks' : 'npm run dev',
		port: Number(PORT),
		timeout: 60 * 1000,
		reuseExistingServer: true,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			PORT,
			NODE_ENV: 'test',
			// The first run connects Intervals.icu with the mock's key
			// (tests/e2e/first-run.test.ts); `dev` and `start:mocks` set NODE_ENV
			// themselves, so the mock is opted into by name.
			MOCK_INTERVALSICU: 'true',
		},
	},
})
