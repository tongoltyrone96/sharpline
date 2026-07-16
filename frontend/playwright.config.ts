import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],

  // Start Vite dev server before running tests
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --port 5173 --host 0.0.0.0',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
