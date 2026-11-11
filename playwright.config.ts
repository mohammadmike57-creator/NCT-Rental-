import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'crypto';

/**
 * End-to-end tests: the real server (with the website inside) on a throwaway in-memory database.
 * Build first:  npm run build && mvn -B package -DskipTests -Dexec.skip=true
 * Then run:     npm run e2e
 */
const PORT = Number(process.env.E2E_PORT || 8091);
// Test-only values, made fresh for every run.
process.env.E2E_PASSWORD ||= `e2e-${randomBytes(12).toString('hex')}`;
const JWT = randomBytes(32).toString('hex');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `java -jar target/backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=e2e --server.port=${PORT} --spring.datasource.url=jdbc:h2:mem:e2e;DB_CLOSE_DELAY=-1`,
    url: `http://localhost:${PORT}/`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { JWT_SECRET: JWT, E2E_PASSWORD: process.env.E2E_PASSWORD! },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
