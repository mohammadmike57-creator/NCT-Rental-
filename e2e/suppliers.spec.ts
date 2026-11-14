import { test, expect } from '@playwright/test';
import { ADMIN, PASSWORD, login, openScreen, tokenOf } from './helpers';

const OWNER = 'owner@spx.example.test';

test('A second supplier signs in to its own company only, and UR-Drive Jordan never sees it', async ({ page, request }) => {
  // The platform super admin (signed in to UR-Drive Jordan) creates Supplier X with its owner.
  const admin = await (await request.post('/auth/login', { data: { email: ADMIN, password: PASSWORD() } })).json();
  const H = { Authorization: `Bearer ${admin.token}` };
  const urdBefore = await (await request.get('/api/state', { headers: H })).text();
  const created = await request.post('/api/platform/suppliers', { headers: H, data: {
    code: 'SPX', name: 'Supplier X Rentals', currency: 'USD', ownerEmail: OWNER, ownerName: 'Xavier Owner', ownerAccess: 'password', ownerPassword: PASSWORD() } });
  expect(created.status()).toBe(201);

  // Supplier X's owner signs in on the same page and lands in their own, empty company.
  await login(page, OWNER);
  await openScreen(page, 'OTA XML');
  await expect(page.getByText(/Supplier X Rentals · rates, availability/)).toBeVisible();
  await openScreen(page, 'Reservations');
  await expect(page.getByRole('button', { name: 'New reservation' })).toBeVisible();
  await openScreen(page, 'Fleet Availability');
  await expect(page.locator('main')).not.toContainText('Toyota Corolla');   // UR-Drive Jordan's fleet

  const token = await tokenOf(page);
  const X = { Authorization: `Bearer ${token}` };
  const own = await (await request.get('/api/state', { headers: X })).json();
  expect(own.companyDetails.name).toBe('Supplier X Rentals');
  expect(own.companyDetails.subName).toBe('');      // nothing of UR-Drive Jordan's details
  expect(own.companyDetails.taxNumber).toBe('');
  expect(JSON.stringify(own)).not.toContain('Toyota Corolla');

  // What Supplier X saves stays with Supplier X.
  const save = await request.post('/api/state/patch', { headers: X, data: { ops: [{ op: 'set', key: 'fleet', value: [
    { id: 'x1', modelName: 'Supplier X Jeep', licensePlate: 'X-1', category: 'SUV', sippCode: 'IFAR', transmission: 'Automatic', securityDeposit: 300, excess: 600, registrationExpiry: '2030-01-01' }] }] } });
  expect(save.status()).toBe(200);
  const urdAfter = await (await request.get('/api/state', { headers: H })).text();
  expect(urdAfter).not.toContain('Supplier X Jeep');
  expect(JSON.parse(urdAfter).fleet).toEqual(JSON.parse(urdBefore).fleet);

  // Supplier X's staff list has only its own people; the platform list is not there for it.
  const staff = await (await request.get('/api/admin/users', { headers: X })).text();
  expect(staff).toContain(OWNER);
  expect(staff).not.toContain(ADMIN);
  expect((await request.get('/api/platform/suppliers', { headers: X })).status()).toBe(404);

  // Branding: Supplier X's colour and sign-in line on its own sign-in link, and its badge in the menu.
  const details = { ...own.companyDetails, brandColor: '#0f766e', signInTagline: 'Supplier X staff sign-in' };
  expect((await request.post('/api/state/patch', { headers: X, data: { ops: [{ op: 'set', key: 'companyDetails', value: details }] } })).status()).toBe(200);
  const fresh = await (await page.context().browser()!.newContext()).newPage();
  await fresh.goto('/s/SPX');
  await expect(fresh.getByTestId('login-brand')).toContainText('Supplier X Rentals');
  await expect(fresh.getByText('Supplier X staff sign-in')).toBeVisible();
  await expect(fresh.getByTestId('login-brand')).not.toContainText('NCT Rental');
  await page.reload();
  await expect(page.getByTestId('brand-logo')).toHaveText('SX');
  await expect(page.locator('aside').first()).toContainText('Supplier X Rentals');
});
