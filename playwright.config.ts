import { defineConfig } from '@playwright/test';

/* Les scénarios tournent sur l'aperçu de démonstration : l'URL et la clé
   Supabase sont vidées pour que l'application n'appelle jamais le serveur. */
const demoEnv: Record<string, string> = {
  VITE_SUPABASE_URL: '',
  VITE_SUPABASE_PUBLISHABLE_KEY: '',
  VITE_VAPID_PUBLIC_KEY: '',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 2 : 0,
  ...(process.env['CI'] ? { workers: 1 } : {}),
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://127.0.0.1:5174',
    locale: 'fr-FR',
    timezoneId: 'Africa/Lome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev --workspace @mercerie/web -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 120_000,
    env: demoEnv,
  },
});
