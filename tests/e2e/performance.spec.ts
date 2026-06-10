import { expect, type Page, test } from '@playwright/test';

const evidenceDir = 'dist/playwright-evidence';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || 4321}`;

function url(path: string): string {
  return new URL(path, baseURL).toString();
}

async function runCommand(page: Page, command: string) {
  const input = page.locator('.input-field');
  await expect(input).toBeVisible();
  await input.fill(command);
  await input.press('Enter');
}

async function expectBackgroundAvoidsTerminal(page: Page) {
  await page.locator('.terminal-window').waitFor({ state: 'visible' });
  await page.locator('.bg-line').first().waitFor({ state: 'attached' });
  await page.waitForTimeout(500);

  const overlaps = await page.evaluate(() => {
    const terminal = document.querySelector('.terminal-window')?.getBoundingClientRect();
    if (!terminal) return ['missing terminal'];

    return [...document.querySelectorAll<HTMLElement>('.bg-line')]
      .filter(line => getComputedStyle(line).display !== 'none')
      .map((line, index) => ({ index, text: line.textContent || '', rect: line.getBoundingClientRect() }))
      .filter(({ rect }) => !(
        rect.right <= terminal.left ||
        rect.left >= terminal.right ||
        rect.bottom <= terminal.top ||
        rect.top >= terminal.bottom
      ))
      .slice(0, 5)
      .map(({ index, text, rect }) => ({
        index,
        text: text.slice(0, 80),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        },
      }));
  });

  expect(overlaps).toEqual([]);
}

test('home loads without global KaTeX and keeps terminal interaction', async ({ page }) => {
  const response = await page.goto(url('/'));
  expect(response?.ok()).toBeTruthy();

  await expect(page.locator('link[href*="katex"]')).toHaveCount(0);
  await expect(page.locator('astro-island[component-url*="Terminal"]')).toHaveAttribute('client', 'idle');
  await expect(page.locator('.input-field')).toBeVisible();
  await expect(page.locator('.bg-stage')).toHaveAttribute('data-perf-mode', /^(full|lite)$/);
  await expectBackgroundAvoidsTerminal(page);

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

test('article callouts use terminal labels without emoji', async ({ page }) => {
  const response = await page.goto(url('/blog/notebook/learningrate%E5%92%8Cbatchsize/'));
  expect(response?.ok()).toBeTruthy();

  const calloutTitle = page.locator('[data-callout] [data-callout-title]').first();
  await expect(calloutTitle).toHaveAttribute('data-callout-label', 'NOTE');
  await expect(calloutTitle).not.toContainText('ℹ️');
  await expect(calloutTitle).toContainText('看了苏剑林老师的');

  await page.screenshot({ path: `${evidenceDir}/callout-terminal.png`, fullPage: true });
});

test('local KaTeX fonts are served', async ({ request }) => {
  const response = await request.get(url('/vendor/katex/fonts/KaTeX_Size2-Regular.ttf'));
  expect(response.ok()).toBeTruthy();
});

test.describe('reduced motion', () => {
  test('background degrades to static text', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const response = await page.goto(url('/'));
    expect(response?.ok()).toBeTruthy();

    await expect(page.locator('.bg-stage')).toHaveAttribute('data-perf-mode', 'static');
    await expect(page.locator('.bg-line')).not.toHaveCount(0);
    await expect(page.locator('.bg-line.spotlit')).toHaveCount(0);
    await expectBackgroundAvoidsTerminal(page);

    await page.screenshot({ path: `${evidenceDir}/reduced-motion-background.png`, fullPage: true });
  });
});
