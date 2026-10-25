import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.FRONTEND_URL || 'http://127.0.0.1:5173',
    headless: true,
    browserName: 'chromium'
  }
});
