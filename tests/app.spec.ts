import { expect, test, type Page } from '@playwright/test';

async function addItem(page: Page, target: string, definition: string, isFirst = false) {
  await page.getByRole('button', { name: isFirst ? 'Add your first word' : 'Add word' }).click();
  await page.getByLabel('Target-language text').fill(target);
  await page.getByLabel('Reference-language definition').fill(definition);
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByRole('heading', { name: target })).toBeVisible();
}

test('creates a vocabulary relationship and plays a Match pair', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Vocabulary library' }).click();
  await addItem(page, 'ventana', 'window', true);

  await page.getByRole('button', { name: 'Add word' }).click();
  await page.getByLabel('Target-language text').fill('puerta');
  await page.getByLabel('Reference-language definition').fill('door');
  await page.getByRole('button', { name: 'Add relationship' }).click();
  const relatedItem = page.getByLabel('Related vocabulary item');
  await relatedItem.selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Save item' }).click();
  await expect(page.getByText(/Synonym · ventana/)).toBeVisible();

  await page.getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Match', exact: true }).click();
  await page.getByRole('button', { name: 'ventana', exact: true }).click();
  await page.getByRole('button', { name: 'window', exact: true }).click();
  await expect(page.locator('.stat').filter({ hasText: 'Score' })).toContainText('1');
  await expect(page.getByRole('button', { name: 'Restart game' })).toBeVisible();
});

test('red herring mismatch scores negatively and unlocks the board', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Vocabulary library' }).click();
  await addItem(page, 'uno', 'one', true);
  await addItem(page, 'dos', 'two');
  await addItem(page, 'tres', 'three');
  await page.getByRole('button', { name: 'Game' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Match', exact: true }).click();
  await page.getByLabel('MAX PAIRS').fill('2');
  await page.getByLabel('Red herring').check();

  await page.locator('.card-red-herring').click();
  await page.locator('.game-card:not(.card-red-herring)').first().click();
  await expect(page.locator('.stat').filter({ hasText: 'Score' })).toContainText('-1');
  await expect(page.locator('.game-card[aria-disabled="false"]')).toHaveCount(5);
});

test('shows the rotate prompt only on narrow portrait screens without horizontal overflow', async ({ page }) => {
  await page.goto('./');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rotate-prompt')).toBeVisible();
  const portraitMetrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(portraitMetrics.scrollWidth).toBeLessThanOrEqual(portraitMetrics.clientWidth);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.rotate-prompt')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Classic' })).toBeVisible();
});