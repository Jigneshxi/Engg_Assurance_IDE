import { test, expect } from '@playwright/test';
test('REQ_008 browser cart mutation is persisted by the backend', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Validation cart' })).toBeVisible();
  const quantity = page.getByTestId('quantity');
  await expect(quantity).toHaveText('0');
  await page.getByRole('button', { name: 'Add fixture product' }).click();
  await expect(quantity).toHaveText('1');
  await page.reload();
  await expect(quantity).toHaveText('1');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
