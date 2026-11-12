import { test, expect, Page } from '@playwright/test';
import { createHmac } from 'crypto';
import { ADMIN, login, tokenOf } from './helpers';

/** The code an authenticator app shows for a key (RFC 6238), `ahead` 30-second steps from now. */
function appCode(key: string, ahead = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of key.replace(/=+$/, '')) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + ahead));
  const h = createHmac('sha1', bytes).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function signInStepOne(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.locator('#username-input').fill(email);
  await page.locator('#password-input').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.getByRole('heading', { name: 'Two-step sign-in' })).toBeVisible();
  await expect(page.locator('aside')).toHaveCount(0);
}

test('a person turns on two-step sign-in, then signs in with the app code and with a backup code', async ({ page, browser }) => {
  // Its own account, so no other test is affected.
  await login(page, ADMIN);
  const email = `two-step-${Date.now()}@example.test`;
  const password = 'Two-step-pass-1';
  const created = await page.request.post('/api/admin/users', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { email, fullName: 'Two Step', username: email.split('@')[0], password, permissions: ['VIEW_RESERVATIONS', 'VIEW_MY_PROFILE'], status: 'ACTIVE', webAppAccess: true },
  });
  expect(created.status()).toBe(201);

  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await login(p, email, password);
  await p.getByRole('button', { name: 'My profile' }).click();
  const panel = p.locator('section').filter({ hasText: 'Two-step sign-in' });
  await panel.getByRole('button', { name: 'Turn on' }).click();
  await expect(panel.locator('img[alt^="QR code"]')).toBeVisible();
  const key = (await panel.getByTestId('two-step-key').textContent())!.replace(/\s/g, '');
  await panel.getByLabel('Code from the app').fill('000000');
  await panel.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await panel.getByLabel('Code from the app').fill(appCode(key));
  await panel.getByRole('button', { name: 'Confirm and turn on' }).click();
  const codes = panel.getByTestId('backup-codes').locator('li');
  await expect(codes).toHaveCount(10);
  const backup = (await codes.first().textContent())!.trim();
  await panel.getByRole('button', { name: 'I have saved them' }).click();
  await expect(panel.getByText('On', { exact: true })).toBeVisible();
  await ctx.close();

  // Password alone: asked for the code. A wrong code is refused.
  const c2 = await browser.newContext();
  const q = await c2.newPage();
  await signInStepOne(q, email, password);
  await q.locator('#code-input').fill('123456');
  await q.locator('button[type=submit]').click();
  await expect(q.getByText(/code is not right/i)).toBeVisible();
  await q.locator('#code-input').fill(appCode(key, 1));
  await q.locator('button[type=submit]').click();
  await expect(q.locator('aside')).toBeVisible({ timeout: 20_000 });
  await c2.close();

  // With a backup code instead of the phone.
  const c3 = await browser.newContext();
  const r = await c3.newPage();
  await signInStepOne(r, email, password);
  await r.locator('#code-input').fill(backup);
  await r.locator('button[type=submit]').click();
  await expect(r.locator('aside')).toBeVisible({ timeout: 20_000 });
  await c3.close();

  // The administrator turns it off for them (lost phone): password alone works again.
  const off = await page.request.post('/api/two-step/reset', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { email },
  });
  expect(off.status()).toBe(200);
  const c4 = await browser.newContext();
  const s = await c4.newPage();
  await login(s, email, password);
  await c4.close();
});
