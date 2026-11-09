import { expect, test } from '@playwright/test';
import { heading, openDemo } from './support';

test.use({ viewport: { width: 390, height: 844 } });

test('la navigation mobile remplace la barre latérale', async ({ page }) => {
  await openDemo(page, 'cashier');

  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.mobile-header')).toBeVisible();

  const bottomNav = page.locator('.bottom-nav');
  await expect(bottomNav).toBeVisible();
  await expect(bottomNav.getByRole('button')).toHaveCount(5);
  await expect(bottomNav.getByRole('button', { name: 'Équipe' })).toHaveCount(0);

  await bottomNav.getByRole('button', { name: 'Caisse' }).click();
  await expect(heading(page, 'Ouvrir la caisse')).toBeVisible();

  await bottomNav.getByRole('button', { name: 'Ventes' }).click();
  await expect(heading(page, 'Les tickets de la journée')).toBeVisible();

  await bottomNav.getByRole('button', { name: 'Stock' }).click();
  await expect(heading(page, 'Le stock de la boutique')).toBeVisible();
});
