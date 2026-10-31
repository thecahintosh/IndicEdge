import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:8788', browserName: 'chromium',
    ...(process.env.PLAYWRIGHT_WS_ENDPOINT ? { connectOptions: { wsEndpoint: process.env.PLAYWRIGHT_WS_ENDPOINT } } : { channel: 'chromium' }),
    viewport: { width: 1440, height: 1050 }, reducedMotion: 'reduce' },
  reporter: 'list',
  webServer: { command: 'node server.js', url: 'http://127.0.0.1:8788/api/health', reuseExistingServer: false,
    env: { LOCAL_MODE: 'true', HOST: '127.0.0.1', PORT: '8788', DATA_DIR: '.data/browser-test', FRONTEND_ORIGINS: 'http://127.0.0.1:8788' } }
});
