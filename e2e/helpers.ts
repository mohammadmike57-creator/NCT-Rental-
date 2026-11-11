import { expect, Page } from '@playwright/test';

export const ADMIN = 'e2e-admin@example.test';
export const STAFF = 'e2e-staff@example.test';
export const PASSWORD = () => process.env.E2E_PASSWORD as string;

export async function login(page: Page, email: string, password = PASSWORD()) {
  await page.goto('/');
  await page.locator('#username-input').fill(email);
  await page.locator('#password-input').fill(password);
  await page.locator('button[type=submit]').click();
  await expect(page.locator('aside')).toBeVisible({ timeout: 20_000 });
}

/** Opens a screen from the side menu. */
export async function openScreen(page: Page, name: string) {
  // The screen entry comes after a section heading of the same name ("OTA XML").
  await page.locator('aside').getByText(name, { exact: true }).last().click();
}

/** A date n days from today as yyyy-mm-dd. */
export function day(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Waits until the app reports its changes are saved on the server. */
export async function waitSaved(page: Page) {
  // The header shows "Saved hh:mm" once the server has the changes.
  await expect(page.locator('header, [role=banner]').first().getByText(/^Saved/).or(page.getByText(/^Saved\s+\d/)).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(300);
}

/** The signed-in person's login token, for direct calls to the server. */
export async function tokenOf(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('token') || '');
}

/** Changes one data section straight on the server (as the signed-in person). */
export async function setSection(page: Page, key: string, value: unknown) {
  const res = await page.request.post('/api/state/patch', {
    headers: { Authorization: `Bearer ${await tokenOf(page)}`, 'Content-Type': 'application/json' },
    data: { ops: [{ op: 'set', key, value }] },
  });
  return { status: res.status(), body: await res.json().catch(() => ({})) };
}

/** Types the security key when the screen asks for it (2024; Traffic Tickets uses 0000). */
export async function enterSecurityKey(page: Page, key = '2024') {
  const box = page.getByRole('dialog').filter({ hasText: 'Security Check' });
  await expect(box).toBeVisible();
  await box.locator('input').fill(key);
  await box.locator('input').press('Enter');
  await expect(box).toHaveCount(0);
}

/**
 * Does something and waits until the server has confirmed saving the given data section
 * (another save happening at the same moment does not count).
 */
export async function savedOnServer(page: Page, section: string, action: () => Promise<unknown>) {
  const confirmed = page.waitForResponse(r => /\/api\/state(\/patch)?$/.test(new URL(r.url()).pathname)
    && r.request().method() === 'POST' && r.ok() && (r.request().postData() || '').includes(`"${section}"`), { timeout: 20_000 });
  await action();
  await confirmed;
}
