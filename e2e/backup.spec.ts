import { test, expect } from '@playwright/test';
import { readFile } from 'fs/promises';
import { ADMIN, STAFF, day, login, openScreen, tokenOf } from './helpers';

test('an administrator downloads a full copy of the data', async ({ page }) => {
  await login(page, ADMIN);
  const start = new Date(day(1) + 'T10:00:00');
  await page.request.post('/api/state/patch', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { ops: [{ op: 'upsertReservation', year: start.getFullYear(), month: start.toLocaleString('en-US', { month: 'long' }),
      reservation: { id: 'res-e2e-bkp', bookingId: 'E2E-BACKUP-1', personName: 'Backup Check', startDate: `${day(1)}T10:00`, endDate: `${day(3)}T10:00`, status: 'CONFIRMED' } }] },
  });
  await openScreen(page, 'Company Details');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a copy' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^nct-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(JSON.stringify(data.reservations)).toContain('E2E-BACKUP-1');
  expect(Array.isArray(data.fleet)).toBe(true);
  expect(data.companyDetails?.name).toBeTruthy();
  await expect(page.getByText(/Saved as nct-backup-/)).toBeVisible();
});

test('staff cannot download all the data', async ({ page }) => {
  await login(page, STAFF);
  const res = await page.request.get('/api/state/backup-file', { headers: { Authorization: `Bearer ${await tokenOf(page)}` } });
  expect(res.status()).toBe(403);
});
