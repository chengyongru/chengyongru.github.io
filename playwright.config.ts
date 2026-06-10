import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4321);
const explicitBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = explicitBaseURL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: explicitBaseURL ? undefined : {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
