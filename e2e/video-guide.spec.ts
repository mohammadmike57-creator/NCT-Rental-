import { test, expect } from '@playwright/test';
import { ADMIN, login, openScreen } from './helpers';
import { GUIDE_CHAPTERS, GUIDE_POSTER, GUIDE_STEPS, GUIDE_VIDEO } from '../components/channel/videoGuide';

test('OTA XML → Video guide: chapters play in a floating window that stays while working elsewhere', async ({ page, request }) => {
  await login(page, ADMIN);
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: /^Video guide/ }).first().click();
  const guide = page.getByTestId('video-guide');
  await expect(guide).toBeVisible();

  // Every chapter: its card, its details, and its video and poster served by the server.
  for (const [i, c] of GUIDE_CHAPTERS.entries()) {
    await guide.getByRole('button', { name: new RegExp(`^Chapter ${i + 1}\\b`) }).click();
    await expect(guide.getByRole('heading', { name: c.title, exact: true }).first()).toBeVisible();
    for (const p of c.pages) await expect(guide.getByRole('heading', { name: p.name, exact: true }).first()).toBeVisible();
    const video = await request.get(GUIDE_VIDEO(c.id), { headers: { Range: 'bytes=0-1023' } });
    expect([200, 206], `${c.id}.mp4 is served`).toContain(video.status());
    expect(video.headers()['content-type']).toContain('video/mp4');
    expect((await request.get(GUIDE_POSTER(c.id))).status(), `${c.id}.jpg is served`).toBe(200);
    const steps = await (await request.get(GUIDE_STEPS(c.id))).json();
    expect(steps.length, `${c.id} has its steps`).toBeGreaterThan(2);
    await expect(guide.getByTestId('guide-steps').getByRole('button')).toHaveCount(steps.filter((x: { step: number }) => x.step > 0).length);
  }

  // Playing a chapter opens the floating player.
  await guide.getByRole('button', { name: `Play chapter 2: ${GUIDE_CHAPTERS[1].title}` }).click();
  const player = page.getByRole('dialog', { name: `Video guide: ${GUIDE_CHAPTERS[1].title}` });
  await expect(player).toBeVisible();
  await expect(player.locator('video source')).toHaveAttribute('src', GUIDE_VIDEO(GUIDE_CHAPTERS[1].id));

  await expect(player.getByTestId('guide-subtitle')).toBeVisible();

  // It stays while the person works on another screen.
  await openScreen(page, 'Reservations');
  await expect(page.getByRole('button', { name: 'New reservation' })).toBeVisible();
  await expect(player).toBeVisible();

  // Next chapter, minimise, show again, close.
  await player.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.getByRole('dialog', { name: `Video guide: ${GUIDE_CHAPTERS[2].title}` })).toBeVisible();
  const third = page.getByRole('dialog', { name: `Video guide: ${GUIDE_CHAPTERS[2].title}` });
  await third.getByRole('button', { name: 'Minimise' }).click();
  await expect(third.locator('video')).toBeHidden();
  await third.getByRole('button', { name: 'Show video' }).click();
  await expect(third.locator('video')).toBeVisible();
  await third.getByRole('button', { name: 'Close video' }).click();
  await expect(page.locator('[data-guide-player]')).toHaveCount(0);

  // A step in the list opens the video at that step.
  await openScreen(page, 'OTA XML');
  await page.getByRole('button', { name: /^Video guide/ }).first().click();
  await guide.getByRole('button', { name: new RegExp(`^Chapter 1\\b`) }).click();
  await guide.getByTestId('guide-steps').getByRole('button').nth(2).click();
  await expect(page.getByRole('dialog', { name: `Video guide: ${GUIDE_CHAPTERS[0].title}` })).toBeVisible();
});
