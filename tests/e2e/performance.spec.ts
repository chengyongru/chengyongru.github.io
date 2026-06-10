import { expect, type Page, test } from '@playwright/test';

const evidenceDir = 'dist/playwright-evidence';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4321';

function url(path: string): string {
  return new URL(path, baseURL).toString();
}

async function runCommand(page: Page, command: string) {
  const input = page.locator('.input-field');
  await expect(input).toBeVisible();
  await input.fill(command);
  await input.press('Enter');
}

test('home loads without global KaTeX and keeps terminal interaction', async ({ page }) => {
  const response = await page.goto(url('/'));
  expect(response?.ok()).toBeTruthy();

  await expect(page.locator('link[href*="katex"]')).toHaveCount(0);
  await expect(page.locator('astro-island[component-url*="Terminal"]')).toHaveAttribute('client', 'idle');
  await expect(page.locator('.input-field')).toBeVisible();
  await expect(page.locator('.bg-stage')).toHaveAttribute('data-perf-mode', /^(full|lite)$/);

  await runCommand(page, 'theme light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.terminal-body')).toContainText('Theme switched to Light');

  await runCommand(page, 'grep agent');
  await expect(page.locator('.terminal-body')).toContainText('Found');

  await page.screenshot({ path: `${evidenceDir}/home-terminal.png`, fullPage: true });

  await runCommand(page, 'cat notebook/dropout');
  await expect(page.locator('.content-viewer')).toBeVisible();
  await expect(page.locator('.viewer-title')).toContainText('Dropout');
});

test('article page uses local KaTeX and restores content viewer', async ({ page }) => {
  const response = await page.goto(url('/blog/notebook/dropout/'));
  expect(response?.ok()).toBeTruthy();

  await expect(page.locator('link[href="/vendor/katex/katex.min.css"]')).toHaveCount(1);
  await expect(page.locator('link[href*="cdn.jsdelivr"]')).toHaveCount(0);
  await expect(page.locator('astro-island[component-url*="Terminal"]')).toHaveAttribute('client', 'idle');
  await expect(page.locator('.content-viewer')).toBeVisible();
  await expect(page.locator('.viewer-title')).toContainText('Dropout');

  await page.screenshot({ path: `${evidenceDir}/article-viewer.png`, fullPage: true });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('background degrades to static text', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto(url('/'));
    expect(response?.ok()).toBeTruthy();

    await expect(page.locator('.bg-stage')).toHaveAttribute('data-perf-mode', 'static');
    await expect(page.locator('.bg-line')).not.toHaveCount(0);
    await expect(page.locator('.bg-line.spotlit')).toHaveCount(0);

    await page.screenshot({ path: `${evidenceDir}/reduced-motion-background.png`, fullPage: true });
  });
});
