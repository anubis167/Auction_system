import { defineConfig } from '@playwright/test';

const E2E_DB = 'postgresql://auction:auction@localhost:5436/auction_e2e';

export default defineConfig({
  testDir: './e2e',
  // sch-1.1: e2e/unit and e2e/integration hold vitest *.test.ts files; Playwright runs only specs
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx tsx be/src/server.ts',
      url: 'http://localhost:4100/api/health',
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: E2E_DB,
        PORT: '4100',
        APP_URL: 'http://localhost:5180',
        JWT_SECRET: 'e2e-secret',
        NODE_ENV: 'e2e',
        AUCTION_JOB_INTERVAL_MS: '1000',
        UPLOAD_DIR: 'be/uploads/e2e',
        // mail-002: the e2e flow resends activation mails back to back.
        ACTIVATION_RESEND_INTERVAL_MS: '0',
        // mail-004: specs resend change-password mails back to back.
        PASSWORD_LINK_INTERVAL_MS: '0',
        // Specs read links from the dev outbox, so never send real mail here.
        GMAIL_USER: '',
        GMAIL_CLIENT_ID: '',
        GMAIL_CLIENT_SECRET: '',
        GMAIL_REFRESH_TOKEN: '',
        SMTP_HOST: '',
        // rag2-1.1: the RAG service below uses this token for the internal /api/rag routes
        RAG_INTERNAL_TOKEN: 'e2e-internal-token',
      },
    },
    {
      command: 'npm run dev -w fe',
      url: 'http://localhost:5180',
      reuseExistingServer: !process.env.CI,
      env: { FE_PORT: '5180', API_URL: 'http://localhost:4100' },
    },
    {
      command: 'python be/rag/chat.py',
      url: 'http://127.0.0.1:5000/',
      reuseExistingServer: !process.env.CI,
      env: {
        // rag2: the service reads and writes only through the e2e Node API, never the database
        RAG_API_URL: 'http://localhost:4100',
        RAG_INTERNAL_TOKEN: 'e2e-internal-token',
        NO_NGROK: '1',
      },
    },
  ],
});
